import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { getDb } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import {
  requireUUIDParam,
  validateCreatePresentation,
  validateAnalyzePresentation,
  validateAddMessage,
  validateRegenerateSlide,
  validateReorderSlides,
} from '../middleware/validation.js';
import { chat, regenerateSlide, analyzePresentation, streamSlidePlan } from '../services/claudeAgent.js';
import { generateSlideImage } from '../services/imageGeneration.js';

const router = Router();

// Validate the :id path param as a UUID on all routes in this router.
// Returns 404 for non-UUID values to avoid revealing expected format (OWASP A03).
router.param('id', requireUUIDParam);

// In-memory SSE client registry: presentationId → Set<res>
const sseRegistry = new Map();

function broadcast(presentationId, event) {
  const clients = sseRegistry.get(presentationId);
  if (!clients || clients.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  clients.forEach(res => {
    try { res.write(payload); } catch { /* client disconnected */ }
  });
}

// ─── List presentations ────────────────────────────────────────────────────────
router.get('/', authenticateToken, (req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT id, title, status, created_at, updated_at
       FROM presentations WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(req.user.id);
  res.json({ presentations: rows });
});

// ─── Analyze brief and return contextual questions ─────────────────────────────
// heavyLimiter: Claude API call — 20/hour per user to cap AI spend
router.post('/analyze', authenticateToken, heavyLimiter, validateAnalyzePresentation, async (req, res) => {
  const { message, attachments = [] } = req.body;
  if (!message?.trim() && attachments.length === 0) {
    return res.status(400).json({ error: 'Message or attachment required' });
  }
  try {
    const analysis = await analyzePresentation(message, attachments);
    res.json(analysis);
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// ─── Create presentation + kick off async full flow ────────────────────────────
// heavyLimiter: triggers Claude streaming + Gemini image generation
router.post('/', authenticateToken, heavyLimiter, validateCreatePresentation, (req, res) => {
  const { message, attachments = [], aspectRatio = '16:9' } = req.body;
  if (!message?.trim() && attachments.length === 0) {
    return res.status(400).json({ error: 'Message or attachment required' });
  }

  const db = getDb();
  const id = uuid();
  const msgId = uuid();

  db.prepare(
    `INSERT INTO presentations (id, user_id, title, status, aspect_ratio)
     VALUES (?, ?, 'Untitled Presentation', 'processing', ?)`
  ).run(id, req.user.id, aspectRatio);

  db.prepare(
    `INSERT INTO messages (id, presentation_id, role, content, attachments)
     VALUES (?, ?, 'user', ?, ?)`
  ).run(msgId, id, message, JSON.stringify(attachments));

  // Respond immediately — Claude planning + image generation run async
  res.status(201).json({
    presentation: db.prepare('SELECT * FROM presentations WHERE id = ?').get(id),
  });

  runFullFlow(id, message, attachments).catch(err => {
    console.error('Full flow error:', err);
    // Broadcast a generic error message — do not expose err.message to SSE clients
    broadcast(id, { type: 'error', message: 'Generation failed. Please try again.' });
    getDb().prepare(`UPDATE presentations SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  });
});

async function runFullFlow(presentationId, message, attachments) {
  const db = getDb();

  broadcast(presentationId, { type: 'plan_generating' });

  const presRow = db.prepare('SELECT aspect_ratio FROM presentations WHERE id = ?').get(presentationId);
  const aspectRatio = presRow?.aspect_ratio || '16:9';

  const firstUserMsg = db
    .prepare(`SELECT attachments FROM messages WHERE presentation_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`)
    .get(presentationId);
  let userAttachments = [];
  try { userAttachments = JSON.parse(firstUserMsg?.attachments || '[]'); } catch {}
  const moodboardImages = userAttachments.filter(a => a.category === 'moodboard' && a.data);
  const brandingImages  = userAttachments.filter(a => a.category === 'branding'  && a.data);
  const allImages       = userAttachments.filter(a => a.data);

  let header = null;
  const slidePromises = [];
  const completedSlides = new Map();

  function persistProgress() {
    const sorted = [...completedSlides.values()].sort((a, b) => a.index - b.index);
    db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(sorted), presentationId);
  }

  await streamSlidePlan(message, attachments, {
    onHeader(h) {
      header = h;
      db.prepare(
        `INSERT INTO messages (id, presentation_id, role, content, metadata) VALUES (?, ?, 'assistant', ?, ?)`
      ).run(uuid(), presentationId, h.message || '', JSON.stringify({ state: 'ready', message: h.message }));

      db.prepare(
        `UPDATE presentations SET title = ?, slide_plan = ?, status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(
        h.presentation_title || 'Untitled Presentation',
        JSON.stringify({ ...h, slides: [] }),
        presentationId
      );

      broadcast(presentationId, { type: 'plan_ready',  total_slides: h.total_slides });
      broadcast(presentationId, { type: 'started',     total_slides: h.total_slides });
    },

    onSlide(slide) {
      broadcast(presentationId, { type: 'slide_generating', index: slide.index });

      const categories = slide.attach_image_categories || [];
      let attachedImages = [];
      if (categories.includes('all')) {
        attachedImages = allImages;
      } else {
        if (categories.includes('moodboard')) attachedImages.push(...moodboardImages);
        if (categories.includes('branding'))  attachedImages.push(...brandingImages);
      }
      attachedImages = attachedImages.slice(0, 3);

      const promise = generateSlideImage(
        slide.nano_banana_prompt || slide.title,
        slide.type,
        header?.theme        || 'modern-minimal',
        header?.color_palette || {},
        slide.index,
        attachedImages,
        aspectRatio
      ).then(imageData => {
        const done = { ...slide, image_data: imageData, status: 'complete' };
        completedSlides.set(slide.index, done);
        persistProgress();
        broadcast(presentationId, { type: 'slide_ready', slide: done });
      }).catch(err => {
        console.error(`Slide ${slide.index} image failed:`, err.message);
        const errSlide = { ...slide, image_data: null, status: 'error' };
        completedSlides.set(slide.index, errSlide);
        // Generic message — internal error detail stays server-side
        broadcast(presentationId, { type: 'slide_error', index: slide.index, message: 'Slide generation failed' });
      });

      slidePromises.push(promise);
    },
  });

  // Wait for all Nano Banana calls (they started as Claude was streaming)
  await Promise.all(slidePromises);

  const allSlides = [...completedSlides.values()].sort((a, b) => a.index - b.index);

  if (header) {
    db.prepare(`UPDATE presentations SET slide_plan = ? WHERE id = ?`)
      .run(
        JSON.stringify({ ...header, slides: allSlides.map(({ image_data, ...rest }) => rest) }),
        presentationId
      );
  }

  db.prepare(
    `UPDATE presentations SET status = 'completed', slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(JSON.stringify(allSlides), presentationId);

  broadcast(presentationId, { type: 'complete', total_slides: allSlides.length });
}

// ─── Get single presentation with messages ─────────────────────────────────────
router.get('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  const pres = db
    .prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!pres) return res.status(404).json({ error: 'Not found' });

  const messages = db
    .prepare('SELECT * FROM messages WHERE presentation_id = ? ORDER BY created_at ASC')
    .all(req.params.id);

  res.json({
    presentation: {
      ...pres,
      slide_plan: pres.slide_plan ? JSON.parse(pres.slide_plan) : null,
      slides_data: pres.slides_data ? JSON.parse(pres.slides_data) : null,
    },
    messages: messages.map(m => ({
      ...m,
      attachments: JSON.parse(m.attachments || '[]'),
      metadata: JSON.parse(m.metadata || '{}'),
    })),
  });
});

// ─── Continue chat ─────────────────────────────────────────────────────────────
// heavyLimiter: Claude API call
router.post('/:id/messages', authenticateToken, heavyLimiter, validateAddMessage, async (req, res) => {
  const { message, attachments = [] } = req.body;
  if (!message?.trim() && attachments.length === 0) {
    return res.status(400).json({ error: 'Message required' });
  }

  const db = getDb();
  const pres = db
    .prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!pres) return res.status(404).json({ error: 'Not found' });

  const history = db
    .prepare('SELECT * FROM messages WHERE presentation_id = ? ORDER BY created_at ASC')
    .all(req.params.id);

  const msgId = uuid();
  db.prepare(
    `INSERT INTO messages (id, presentation_id, role, content, attachments)
     VALUES (?, ?, 'user', ?, ?)`
  ).run(msgId, req.params.id, message, JSON.stringify(attachments));

  try {
    const agentResponse = await chat(history, message, attachments);
    const aiMsgId = uuid();

    db.prepare(
      `INSERT INTO messages (id, presentation_id, role, content, metadata)
       VALUES (?, ?, 'assistant', ?, ?)`
    ).run(aiMsgId, req.params.id, agentResponse.message, JSON.stringify(agentResponse));

    if (agentResponse.state === 'ready' && agentResponse.slide_plan) {
      const { presentation_title } = agentResponse.slide_plan;
      db.prepare(
        `UPDATE presentations SET title = ?, slide_plan = ?, status = 'ready', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(presentation_title || pres.title, JSON.stringify(agentResponse.slide_plan), req.params.id);
    }

    res.json({
      aiMessage: { id: aiMsgId, role: 'assistant', content: agentResponse.message, metadata: agentResponse },
    });
  } catch (err) {
    console.error('Agent error:', err);
    res.status(500).json({ error: 'AI agent failed' });
  }
});

// ─── SSE: real-time events ─────────────────────────────────────────────────────
// The browser EventSource API does not support custom request headers, so the JWT is
// accepted via the ?token= query parameter as a necessary exception to the header-only rule.
// In production, consider issuing short-lived (~60 s) SSE-specific tokens to reduce the
// exposure window of long-lived tokens appearing in server access logs.
router.get('/:id/events', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).end();

  let userId;
  try {
    ({ userId } = jwt.verify(token, process.env.JWT_SECRET));
  } catch {
    return res.status(401).end();
  }

  const user = getDb()
    .prepare('SELECT id FROM users WHERE id = ?')
    .get(userId);
  if (!user) return res.status(401).end();

  const { id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  if (!sseRegistry.has(id)) sseRegistry.set(id, new Set());
  sseRegistry.get(id).add(res);

  // Catch-up: replay current state for clients that connect after events were broadcast
  const db2 = getDb();
  const presState = db2.prepare('SELECT status, slide_plan, slides_data FROM presentations WHERE id = ?').get(id);
  if (presState) {
    if (presState.status === 'processing' || presState.status === 'generating') {
      if (presState.slide_plan) {
        const plan = JSON.parse(presState.slide_plan);
        res.write(`data: ${JSON.stringify({ type: 'plan_ready', total_slides: plan.slides.length })}\n\n`);
      }
      if (presState.slides_data) {
        const doneSlides = JSON.parse(presState.slides_data);
        for (const s of doneSlides) {
          res.write(`data: ${JSON.stringify({ type: 'slide_ready', slide: s })}\n\n`);
        }
      }
    } else if (presState.status === 'completed' && presState.slides_data) {
      const doneSlides = JSON.parse(presState.slides_data);
      for (const s of doneSlides) {
        res.write(`data: ${JSON.stringify({ type: 'slide_ready', slide: s })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ type: 'complete', total_slides: doneSlides.length })}\n\n`);
    }
  }

  req.on('close', () => {
    sseRegistry.get(id)?.delete(res);
    if (sseRegistry.get(id)?.size === 0) sseRegistry.delete(id);
  });
});

// ─── Trigger generation ────────────────────────────────────────────────────────
// heavyLimiter: triggers Gemini image generation for all slides
router.post('/:id/generate', authenticateToken, heavyLimiter, async (req, res) => {
  const db = getDb();
  const pres = db
    .prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!pres) return res.status(404).json({ error: 'Not found' });
  if (!pres.slide_plan) return res.status(400).json({ error: 'No slide plan — complete the chat first' });

  const slidePlan = JSON.parse(pres.slide_plan);

  db.prepare(
    `UPDATE presentations SET status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(req.params.id);

  res.json({ message: 'Generation started', total_slides: slidePlan.slides.length });

  // Run generation async — do not await
  runGeneration(req.params.id, slidePlan).catch(err => {
    console.error('Generation error:', err);
    broadcast(req.params.id, { type: 'error', message: 'Generation failed. Please try again.' });
  });
});

async function runGeneration(presentationId, slidePlan) {
  const db = getDb();
  const slides = [];
  const presRow = db.prepare('SELECT aspect_ratio FROM presentations WHERE id = ?').get(presentationId);
  const aspectRatio = presRow?.aspect_ratio || '16:9';

  broadcast(presentationId, {
    type: 'started',
    total_slides: slidePlan.slides.length,
  });

  // Fetch user-uploaded images from the first user message
  const firstUserMsg = db
    .prepare(`SELECT attachments FROM messages WHERE presentation_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`)
    .get(presentationId);

  let userAttachments = [];
  try {
    userAttachments = JSON.parse(firstUserMsg?.attachments || '[]');
  } catch { userAttachments = []; }

  const moodboardImages = userAttachments.filter(a => a.category === 'moodboard' && a.data);
  const brandingImages = userAttachments.filter(a => a.category === 'branding' && a.data);
  const allImages = userAttachments.filter(a => a.data);

  for (const slide of slidePlan.slides) {
    broadcast(presentationId, { type: 'slide_generating', index: slide.index });

    // Resolve which images to attach to this slide
    const categories = slide.attach_image_categories || [];
    let attachedImages = [];
    if (categories.includes('all')) {
      attachedImages = allImages;
    } else {
      if (categories.includes('moodboard')) attachedImages.push(...moodboardImages);
      if (categories.includes('branding')) attachedImages.push(...brandingImages);
    }
    // Cap at 3 images to avoid token limits
    attachedImages = attachedImages.slice(0, 3);

    try {
      const imageData = await generateSlideImage(
        slide.nano_banana_prompt || slide.image_prompt || slide.title,
        slide.type,
        slidePlan.theme,
        slidePlan.color_palette,
        slide.index,
        attachedImages,
        aspectRatio
      );

      const completedSlide = { ...slide, image_data: imageData, status: 'complete' };
      slides.push(completedSlide);

      // Persist progress so SSE catch-up works for late-connecting clients
      db.prepare(
        `UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(JSON.stringify(slides), presentationId);

      broadcast(presentationId, { type: 'slide_ready', slide: completedSlide });
    } catch (err) {
      console.error(`Slide ${slide.index} image failed:`, err.message);
      slides.push({ ...slide, image_data: null, status: 'error' });
      // Generic error — do not forward internal error messages to clients via SSE
      broadcast(presentationId, { type: 'slide_error', index: slide.index, message: 'Slide generation failed' });
    }
  }

  db.prepare(
    `UPDATE presentations SET status = 'completed', slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(JSON.stringify(slides), presentationId);

  broadcast(presentationId, { type: 'complete', total_slides: slides.length });
}

// ─── Regenerate a single slide ─────────────────────────────────────────────────
// heavyLimiter: Claude + Gemini call
router.post('/:id/slides/:index/regenerate', authenticateToken, heavyLimiter, validateRegenerateSlide, async (req, res) => {
  const { instruction, attachments: reqBodyAttachments } = req.body;
  if (!instruction?.trim()) return res.status(400).json({ error: 'Instruction required' });

  // Validate :index is a non-negative integer
  const idx = parseInt(req.params.index, 10);
  if (!Number.isInteger(idx) || idx < 0 || String(idx) !== req.params.index) {
    return res.status(400).json({ error: 'Slide index must be a non-negative integer' });
  }

  const db = getDb();
  const pres = db
    .prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!pres) return res.status(404).json({ error: 'Not found' });
  if (!pres.slides_data) return res.status(400).json({ error: 'No slides generated yet' });

  const slides = JSON.parse(pres.slides_data);
  const slide = slides[idx];
  if (!slide) return res.status(404).json({ error: 'Slide not found' });

  const slidePlan = pres.slide_plan ? JSON.parse(pres.slide_plan) : {};

  res.json({ message: 'Regenerating…', index: idx });

  const regenPresRow = db.prepare('SELECT aspect_ratio FROM presentations WHERE id = ?').get(req.params.id);
  const regenAspectRatio = regenPresRow?.aspect_ratio || '16:9';

  // Run async — client watches SSE for result
  (async () => {
    try {
      const updatedSlide = await regenerateSlide(slide, instruction, {
        theme: slidePlan.theme,
        color_palette: slidePlan.color_palette,
        presentation_title: slidePlan.presentation_title,
      });

      const firstUserMsg = db
        .prepare(`SELECT attachments FROM messages WHERE presentation_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`)
        .get(req.params.id);
      let userAttachments = [];
      try { userAttachments = JSON.parse(firstUserMsg?.attachments || '[]'); } catch {}

      // User-supplied extra images from the edit request
      const reqAttachments = (reqBodyAttachments || []).filter(a => a.data);

      const categories = updatedSlide.attach_image_categories || slide.attach_image_categories || [];
      let attachedImages = userAttachments.filter(a => a.data);
      if (!categories.includes('all')) {
        attachedImages = attachedImages.filter(a =>
          (categories.includes('moodboard') && a.category === 'moodboard') ||
          (categories.includes('branding') && a.category === 'branding')
        );
      }

      // Include extra images from the request (user uploaded alongside their instruction)
      for (const a of reqAttachments) {
        attachedImages.push(a);
      }

      // Include current slide's rendered image as a visual reference for Nano Banana
      if (slide.image_data && !slide.image_data.startsWith('data:image/svg')) {
        attachedImages.unshift({
          data: slide.image_data,
          mimeType: 'image/jpeg',
        });
      }

      attachedImages = attachedImages.slice(0, 4); // allow 1 extra since current slide is a reference

      const imageData = await generateSlideImage(
        updatedSlide.nano_banana_prompt || updatedSlide.image_prompt || slide.nano_banana_prompt || slide.image_prompt,
        updatedSlide.type || slide.type,
        slidePlan.theme,
        slidePlan.color_palette,
        undefined,
        attachedImages,
        regenAspectRatio
      );

      updatedSlide.image_data = imageData;
      updatedSlide.status = 'complete';
      slides[idx] = { ...slide, ...updatedSlide };

      db.prepare(
        `UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(JSON.stringify(slides), req.params.id);

      broadcast(req.params.id, { type: 'slide_updated', slide: slides[idx] });
    } catch (err) {
      console.error('Slide regen error:', err);
      // Generic error — internal detail stays server-side
      broadcast(req.params.id, { type: 'slide_error', index: idx, message: 'Slide regeneration failed' });
    }
  })();
});

// ─── Reorder slides ────────────────────────────────────────────────────────────
router.post('/:id/reorder', authenticateToken, validateReorderSlides, (req, res) => {
  const { order } = req.body;

  const db = getDb();
  const pres = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!pres || !pres.slides_data) return res.status(404).json({ error: 'Not found' });

  const slides = JSON.parse(pres.slides_data);
  const byIndex = new Map(slides.map(s => [s.index, s]));
  const reordered = order.map(idx => byIndex.get(idx)).filter(Boolean);

  db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(JSON.stringify(reordered), req.params.id);

  res.json({ message: 'Reordered' });
});

// ─── Delete presentation ───────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM presentations WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ message: 'Deleted' });
});

export default router;
