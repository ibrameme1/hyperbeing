import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { getDb } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { streamChat, analyzePresentation, streamSlidePlan, suggestTitle, streamNewSlides } from '../services/claudeAgent.js';
import { generateSlideImage } from '../services/imageGeneration.js';
import { deductCredits, getOrCreateSubscription, CREDIT_COSTS, checkTokenBudget } from '../services/stripeService.js';
import { validate, isString, isOptionalString, isEnum, isArray, isIntBetween } from '../middleware/validate.js';
import { createPresentationLimiter, addSlidesLimiter, analyzeLimiter } from '../middleware/rateLimits.js';
import { logger } from '../services/logger.js';

// Validates a single attachment object
function validateAttachment(a) {
  if (typeof a !== 'object' || a === null) return 'Must be an object';
  if (!['image', 'file'].includes(a.type)) return 'Invalid type';
  if (typeof a.name !== 'string' || a.name.length > 255) return 'Invalid name';
  if (typeof a.data !== 'string') return 'Missing data';
  // Base64 data URIs can be large — cap at ~10MB per attachment
  if (a.data.length > 14_000_000) return 'Attachment too large (max ~10MB)';
  return null;
}

const VALID_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3'];

const router = Router();

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

// ─── List presentations ────────────────────────────────────────────────────
router.get('/', authenticateToken, (req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT id, title, status, thumbnail, created_at, updated_at
       FROM presentations WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(req.user.id);
  res.json({ presentations: rows });
});

// ─── Analyze brief and return contextual questions ─────────────────────────
router.post('/analyze', authenticateToken, analyzeLimiter, async (req, res) => {
  const { message, attachments = [] } = req.body;
  if (!message?.trim() && attachments.length === 0) {
    return res.status(400).json({ error: 'Message or attachment required' });
  }
  if (typeof message !== 'undefined' && typeof message !== 'string') {
    return res.status(400).json({ error: 'Message must be a string' });
  }
  if (message && message.length > 50_000) {
    return res.status(400).json({ error: 'Message too long (max 50,000 characters)' });
  }
  if (!Array.isArray(attachments) || attachments.length > 10) {
    return res.status(400).json({ error: 'Attachments must be an array of max 10 items' });
  }
  try { checkTokenBudget(req.user.id); } catch (err) {
    if (err.message === 'TOKEN_LIMIT_EXCEEDED') return res.status(402).json({ error: 'You\'ve reached your monthly token limit. Upgrade your plan to continue.', code: 'TOKEN_LIMIT_EXCEEDED' });
    throw err;
  }

  try {
    const analysis = await analyzePresentation(message, attachments, req.user.id);
    res.json(analysis);
  } catch (err) {
    logger.error('analysis failed', { errorMessage: err.message });
    res.status(500).json({ error: 'Brief analysis failed. Please try again — if the problem persists, try shortening your description.' });
  }
});

// ─── Create presentation + kick off async full flow ───────────────────────
router.post('/', authenticateToken, createPresentationLimiter, (req, res) => {
  const { message, attachments = [], aspectRatio = '16:9' } = req.body;
  if (!message?.trim() && attachments.length === 0) {
    return res.status(400).json({ error: 'Message or attachment required' });
  }
  if (typeof message !== 'undefined' && typeof message !== 'string') {
    return res.status(400).json({ error: 'Message must be a string' });
  }
  if (message && message.length > 50_000) {
    return res.status(400).json({ error: 'Message too long (max 50,000 characters)' });
  }
  if (!Array.isArray(attachments) || attachments.length > 10) {
    return res.status(400).json({ error: 'Too many attachments (max 10)' });
  }
  if (!VALID_ASPECT_RATIOS.includes(aspectRatio)) {
    return res.status(400).json({ error: `Invalid aspect ratio. Must be one of: ${VALID_ASPECT_RATIOS.join(', ')}` });
  }

  try { checkTokenBudget(req.user.id); } catch (err) {
    if (err.message === 'TOKEN_LIMIT_EXCEEDED') return res.status(402).json({ error: 'You\'ve reached your monthly token limit. Upgrade your plan to continue.', code: 'TOKEN_LIMIT_EXCEEDED' });
    throw err;
  }

  // Check + deduct credits before starting
  try {
    deductCredits(req.user.id, CREDIT_COSTS.create_presentation, 'create_presentation', 'Create presentation');
  } catch (err) {
    if (err.message === 'INSUFFICIENT_CREDITS') {
      return res.status(402).json({ error: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS' });
    }
    throw err;
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

  const userId = req.user.id;
  runFullFlow(id, message, attachments, userId).catch(err => {
    logger.error('slide flow failed', { errorMessage: err.message, stack: err.stack?.split('\n').slice(0,4).join('\n') });
    broadcast(id, { type: 'error', message: err.message });
    getDb().prepare(`UPDATE presentations SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  });
});

async function runFullFlow(presentationId, message, attachments, userId = null) {
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
  const collectedSlidePlans = []; // minimal metadata for plan reveal screen

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
      // plan_ready is broadcast after ALL slides are streamed so the reveal screen gets all slide titles
    },

    onSlide(slide) {
      // Collect minimal metadata for the plan reveal screen
      collectedSlidePlans.push({
        index: slide.index,
        type: slide.type,
        title: slide.title,
        key_points: (slide.key_points || []).slice(0, 2),
      });
      broadcast(presentationId, { type: 'slide_generating', index: slide.index });

      // Always attach all user reference images to every slide
      const attachedImages = allImages.slice(0, 3);

      const staggerDelay = slide.index * 800;
      const promise = new Promise(r => setTimeout(r, staggerDelay)).then(() => generateSlideImage(
        slide.nano_banana_prompt || slide.title,
        slide.type,
        header?.theme        || 'modern-minimal',
        header?.color_palette || {},
        slide.index,
        attachedImages,
        aspectRatio
      )).then(imageData => {
        const done = { ...slide, image_data: imageData, status: 'complete' };
        completedSlides.set(slide.index, done);
        persistProgress();
        // Save thumbnail from first slide
        if (slide.index === 0 && imageData && !imageData.startsWith('data:image/svg')) {
          db.prepare(`UPDATE presentations SET thumbnail = ? WHERE id = ?`).run(imageData, presentationId);
        }
        broadcast(presentationId, { type: 'slide_ready', slide: done });
      }).catch(err => {
        logger.error('slide image failed', { slideIndex: slide.index, errorMessage: err.message });
        const errSlide = { ...slide, image_data: null, status: 'error' };
        completedSlides.set(slide.index, errSlide);
        broadcast(presentationId, { type: 'slide_error', index: slide.index, message: err.message });
      });

      slidePromises.push(promise);
    },
  }, userId);

  // All slide text is streamed — broadcast plan_ready with full slide structures for the reveal screen
  const planTotalSlides = header?.total_slides || collectedSlidePlans.length;
  broadcast(presentationId, {
    type: 'plan_ready',
    total_slides: planTotalSlides,
    slide_plans: collectedSlidePlans,
  });
  broadcast(presentationId, { type: 'started', total_slides: planTotalSlides });

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

  // Auto-suggest a contextual title after generation completes
  try {
    const titleCtx = { slides: allSlides.map(s => ({ title: s.title, type: s.type, key_points: s.key_points?.slice(0, 2) })) };
    const autoTitle = await suggestTitle(titleCtx, userId);
    if (autoTitle) {
      db.prepare(`UPDATE presentations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(autoTitle, presentationId);
      broadcast(presentationId, { type: 'title_updated', title: autoTitle });
    }
  } catch {}

  broadcast(presentationId, { type: 'complete', total_slides: allSlides.length });
}

// ─── Get single presentation with messages ────────────────────────────────
router.get('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  const pres = db
    .prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });

  const messages = db
    .prepare('SELECT * FROM messages WHERE presentation_id = ? ORDER BY created_at ASC')
    .all(req.params.id);

  let slide_plan = null, slides_data = null;
  try { slide_plan = pres.slide_plan ? JSON.parse(pres.slide_plan) : null; } catch {}
  try { slides_data = pres.slides_data ? JSON.parse(pres.slides_data) : null; } catch {}

  res.json({
    presentation: { ...pres, slide_plan, slides_data },
    messages: messages.map(m => {
      let attachments = [], metadata = {};
      try { attachments = JSON.parse(m.attachments || '[]'); } catch {}
      try { metadata = JSON.parse(m.metadata || '{}'); } catch {}
      return { ...m, attachments, metadata };
    }),
  });
});

// ─── Continue chat (streaming SSE) ───────────────────────────────────────
router.post('/:id/messages', authenticateToken, async (req, res) => {
  const { message, attachments = [] } = req.body;
  if (!message?.trim() && attachments.length === 0) {
    return res.status(400).json({ error: 'Message required' });
  }

  const db = getDb();
  const pres = db
    .prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });

  try { checkTokenBudget(req.user.id); } catch (err) {
    if (err.message === 'TOKEN_LIMIT_EXCEEDED') return res.status(402).json({ error: 'You\'ve reached your monthly token limit. Upgrade your plan to continue.', code: 'TOKEN_LIMIT_EXCEEDED' });
    throw err;
  }

  const history = db
    .prepare('SELECT * FROM messages WHERE presentation_id = ? ORDER BY created_at ASC')
    .all(req.params.id);

  const msgId = uuid();
  db.prepare(
    `INSERT INTO messages (id, presentation_id, role, content, attachments)
     VALUES (?, ?, 'user', ?, ?)`
  ).run(msgId, req.params.id, message, JSON.stringify(attachments));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const agentResponse = await streamChat(history, message, attachments, (chunk) => {
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
    }, req.user.id);

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

    res.write(`data: ${JSON.stringify({ type: 'done', aiMessage: { id: aiMsgId, role: 'assistant', content: agentResponse.message, metadata: agentResponse } })}\n\n`);
    res.end();
  } catch (err) {
    logger.error('chat agent failed', { errorMessage: err.message });
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'Nova couldn\'t process your message right now. Please try again.' })}\n\n`);
    res.end();
  }
});

// ─── SSE: real-time events (auth via ?token= query param, headers not possible with EventSource)
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
        const totalSlides = plan.total_slides || plan.slides?.length || 0;
        const slidePlans = (plan.slides || []).map(s => ({
          index: s.index, type: s.type, title: s.title, key_points: (s.key_points || []).slice(0, 2),
        }));
        res.write(`data: ${JSON.stringify({ type: 'plan_ready', total_slides: totalSlides, slide_plans: slidePlans })}\n\n`);
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

// ─── Trigger generation ────────────────────────────────────────────────────
router.post('/:id/generate', authenticateToken, async (req, res) => {
  const db = getDb();
  const pres = db
    .prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });
  if (!pres.slide_plan) return res.status(400).json({ error: 'Your slide plan isn\'t ready yet — finish the chat with Nova first.' });

  const slidePlan = JSON.parse(pres.slide_plan);

  db.prepare(
    `UPDATE presentations SET status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(req.params.id);

  res.json({ message: 'Generation started', total_slides: slidePlan.slides.length });

  // Run generation async — do not await
  runGeneration(req.params.id, slidePlan).catch(err => {
    logger.error('generation failed', { errorMessage: err.message });
    broadcast(req.params.id, { type: 'error', message: err.message });
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

      // Save thumbnail from first slide
      if (slide.index === 0 && imageData && !imageData.startsWith('data:image/svg')) {
        db.prepare(`UPDATE presentations SET thumbnail = ? WHERE id = ?`).run(imageData, presentationId);
      }

      broadcast(presentationId, { type: 'slide_ready', slide: completedSlide });
    } catch (err) {
      logger.error('slide image failed', { slideIndex: slide.index, errorMessage: err.message });
      slides.push({ ...slide, image_data: null, status: 'error' });
      broadcast(presentationId, { type: 'slide_error', index: slide.index, message: err.message });
    }
  }

  db.prepare(
    `UPDATE presentations SET status = 'completed', slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(JSON.stringify(slides), presentationId);

  broadcast(presentationId, { type: 'complete', total_slides: slides.length });
}

// ─── Regenerate a single slide (user-described edit → direct to Gemini) ──────
router.post('/:id/slides/:index/regenerate', authenticateToken, async (req, res) => {
  const { instruction, attachments: reqBodyAttachments } = req.body;
  if (!instruction?.trim()) return res.status(400).json({ error: 'Please describe what you\'d like to change about this slide.' });

  const db = getDb();
  const pres = db
    .prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });
  if (!pres.slides_data) return res.status(400).json({ error: 'No slides have been generated yet. Generate your presentation first.' });

  try { checkTokenBudget(req.user.id); } catch (err) {
    if (err.message === 'TOKEN_LIMIT_EXCEEDED') return res.status(402).json({ error: 'You\'ve reached your monthly token limit. Upgrade your plan to continue.', code: 'TOKEN_LIMIT_EXCEEDED' });
    throw err;
  }

  const slides = JSON.parse(pres.slides_data);
  const targetIndex = parseInt(req.params.index, 10);
  // Find by .index property — robust to reordering (array position ≠ .index after drag-reorder)
  const arrayPos = slides.findIndex(s => s.index === targetIndex);
  const slide = slides[arrayPos];
  if (!slide) return res.status(404).json({ error: 'Slide not found. It may have been removed or the index is out of range.' });

  const slidePlan = pres.slide_plan ? JSON.parse(pres.slide_plan) : {};
  res.json({ message: 'Editing…', index: targetIndex });

  const regenAspectRatio = pres.aspect_ratio || '16:9';

  // Build an edit-focused prompt: pic1 = current slide, changes = user instruction
  const hasCurrentImage = slide.image_data && !slide.image_data.startsWith('data:image/svg');
  const editPrompt = hasCurrentImage
    ? `EDIT INSTRUCTION: ${instruction.trim()}\n\nApply the above change to the presentation slide shown in the first reference image (pic1). Keep EVERYTHING else identical — the layout, composition, color palette, typography style, background, and overall design language. Do not redesign from scratch. Edit only what the instruction specifies.`
    : `${slide.nano_banana_prompt || slide.image_prompt || slide.title}\n\nAdditional instruction: ${instruction.trim()}`;

  // pic1 = current rendered slide; pic2, pic3… = anything the user uploaded in the edit bar
  let attachedImages = [];
  if (hasCurrentImage) {
    const mimeType = slide.image_data.match(/^data:([^;]+);base64,/)?.[1] || 'image/jpeg';
    attachedImages.push({ data: slide.image_data, mimeType });
  }
  const userUploads = (reqBodyAttachments || []).filter(a => a.data);
  attachedImages.push(...userUploads);
  attachedImages = attachedImages.slice(0, 5);

  (async () => {
    try {
      const imageData = await generateSlideImage(
        editPrompt,
        slide.type,
        slidePlan.theme,
        slidePlan.color_palette,
        slide.index,
        attachedImages,
        regenAspectRatio
      );

      const updatedSlide = { ...slide, image_data: imageData, status: 'complete' };
      slides[arrayPos] = updatedSlide;

      // Always keep the thumbnail in sync with whichever slide is first in the current order
      const updates = { slides_data: JSON.stringify(slides) };
      let thumbSql = `UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const thumbArgs = [updates.slides_data, req.params.id];
      if (arrayPos === 0 && imageData && !imageData.startsWith('data:image/svg')) {
        thumbSql = `UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        thumbArgs.splice(1, 0, imageData);
      }
      db.prepare(thumbSql).run(...thumbArgs);

      broadcast(req.params.id, { type: 'slide_updated', slide: updatedSlide });
    } catch (err) {
      logger.error('slide edit failed', { errorMessage: err.message });
      broadcast(req.params.id, { type: 'slide_error', index: targetIndex, message: err.message });
    }
  })();
});

// ─── Retry a failed slide (re-run original prompt, no changes) ───────────────
router.post('/:id/slides/:index/retry', authenticateToken, async (req, res) => {
  const db = getDb();
  const pres = db
    .prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!pres) return res.status(404).json({ error: 'Presentation not found.' });
  if (!pres.slides_data) return res.status(400).json({ error: 'No slides found.' });

  try { checkTokenBudget(req.user.id); } catch (err) {
    if (err.message === 'TOKEN_LIMIT_EXCEEDED') return res.status(402).json({ error: 'You\'ve reached your monthly token limit.', code: 'TOKEN_LIMIT_EXCEEDED' });
    throw err;
  }

  const slides = JSON.parse(pres.slides_data);
  const targetIndex = parseInt(req.params.index, 10);
  const arrayPos = slides.findIndex(s => s.index === targetIndex);
  const slide = slides[arrayPos];
  if (!slide) return res.status(404).json({ error: 'Slide not found.' });

  const slidePlan = pres.slide_plan ? JSON.parse(pres.slide_plan) : {};
  res.json({ message: 'Retrying…', index: targetIndex });

  const regenAspectRatio = pres.aspect_ratio || '16:9';

  (async () => {
    try {
      const imageData = await generateSlideImage(
        slide.nano_banana_prompt || slide.image_prompt || slide.title,
        slide.type,
        slidePlan.theme,
        slidePlan.color_palette,
        slide.index,
        [],
        regenAspectRatio
      );

      const updatedSlide = { ...slide, image_data: imageData, status: 'complete' };
      slides[arrayPos] = updatedSlide;

      let thumbSql = `UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const thumbArgs = [JSON.stringify(slides), req.params.id];
      if (arrayPos === 0 && imageData && !imageData.startsWith('data:image/svg')) {
        thumbSql = `UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        thumbArgs.splice(1, 0, imageData);
      }
      db.prepare(thumbSql).run(...thumbArgs);

      broadcast(req.params.id, { type: 'slide_updated', slide: updatedSlide });
    } catch (err) {
      logger.error('slide retry failed', { errorMessage: err.message });
      broadcast(req.params.id, { type: 'slide_error', index: targetIndex, message: err.message });
    }
  })();
});

// ─── Reorder slides ───────────────────────────────────────────────────────
router.post('/:id/reorder', authenticateToken, (req, res) => {
  const { order } = req.body; // array of slide indexes in new order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Invalid request: expected an array of slide indices.' });

  const db = getDb();
  const pres = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!pres || !pres.slides_data) return res.status(404).json({ error: 'Presentation not found or no slides to reorder.' });

  const slides = JSON.parse(pres.slides_data);
  const byIndex = new Map(slides.map(s => [s.index, s]));
  const reordered = order.map(idx => byIndex.get(idx)).filter(Boolean);

  // Sync thumbnail to whichever slide is now first
  const newFirstImage = reordered[0]?.image_data;
  const hasRealThumb = newFirstImage && !newFirstImage.startsWith('data:image/svg');
  if (hasRealThumb) {
    db.prepare(`UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(reordered), newFirstImage, req.params.id);
  } else {
    db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(reordered), req.params.id);
  }

  res.json({ message: 'Reordered' });
});

// ─── Update title ─────────────────────────────────────────────────────────
router.patch('/:id/title', authenticateToken,
  validate({ title: isString(1, 500) }),
  (req, res) => {
    const { title } = req.body;
    const result = getDb()
      .prepare(`UPDATE presentations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`)
      .run(title, req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Presentation not found or you don\'t have permission to rename it.' });
    res.json({ title });
  },
);

// ─── Suggest title via AI ─────────────────────────────────────────────────
router.post('/:id/suggest-title', authenticateToken, async (req, res) => {
  const db = getDb();
  const pres = db.prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });

  const slidePlan = pres.slide_plan ? JSON.parse(pres.slide_plan) : null;
  const slidesData = pres.slides_data ? JSON.parse(pres.slides_data) : null;

  const context = {
    presentation_title: slidePlan?.presentation_title || pres.title,
    slides: (slidesData || []).map(s => ({ title: s.title, type: s.type, key_points: s.key_points?.slice(0, 2) })),
  };

  try {
    const title = await suggestTitle(context, req.user.id);
    res.json({ title });
  } catch (err) {
    res.status(500).json({ error: 'Could not generate a title suggestion right now. You can rename it manually.' });
  }
});

// ─── Add more slides ──────────────────────────────────────────────────────
router.post('/:id/add-slides', authenticateToken, addSlidesLimiter, (req, res) => {
  const { description, count = 1, attachments: reqAttachments = [] } = req.body;
  if (!description?.trim() || typeof description !== 'string') {
    return res.status(400).json({ error: 'Please describe the slides you\'d like to add.' });
  }
  if (description.length > 10_000) {
    return res.status(400).json({ error: 'Description too long (max 10,000 characters)' });
  }
  if (!Array.isArray(reqAttachments) || reqAttachments.length > 10) {
    return res.status(400).json({ error: 'Too many attachments (max 10)' });
  }
  if (count !== 'auto' && (isNaN(parseInt(count)) || parseInt(count) < 1 || parseInt(count) > 10)) {
    return res.status(400).json({ error: 'Count must be 1–10 or "auto"' });
  }
  const isAuto = count === 'auto';
  const slideCount = isAuto ? null : Math.min(Math.max(parseInt(count) || 1, 1), 10);

  try {
    deductCredits(req.user.id, CREDIT_COSTS.add_slides, 'add_slides', 'Add slides', req.params.id);
  } catch (err) {
    if (err.message === 'INSUFFICIENT_CREDITS') {
      return res.status(402).json({ error: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS' });
    }
    throw err;
  }

  const db = getDb();
  const pres = db.prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });
  if (!pres.slides_data) return res.status(400).json({ error: 'No slides have been generated yet. Generate your presentation before adding more slides.' });

  const slides = JSON.parse(pres.slides_data);
  const startIndex = slides.length;
  const aspectRatio = pres.aspect_ratio || '16:9';
  const slidePlan = pres.slide_plan ? JSON.parse(pres.slide_plan) : {};

  // Create placeholder slides immediately (for auto, use 3 as optimistic placeholder count)
  const placeholderCount = slideCount ?? 3;
  const placeholders = Array.from({ length: placeholderCount }, (_, i) => ({
    index: startIndex + i,
    type: 'content',
    title: `New Slide ${startIndex + i + 1}`,
    status: 'generating',
    image_data: null,
  }));
  const newSlides = [...slides, ...placeholders];
  db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(JSON.stringify(newSlides), req.params.id);
  broadcast(req.params.id, { type: 'slides_adding', placeholders });

  res.json({ message: 'Adding slides…', startIndex, count: slideCount, auto: isAuto });

  // Run async
  (async () => {
    try {
      const firstUserMsg = db
        .prepare(`SELECT attachments FROM messages WHERE presentation_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`)
        .get(req.params.id);
      let userAttachments = [];
      try { userAttachments = JSON.parse(firstUserMsg?.attachments || '[]'); } catch {}
      const allUserImages = userAttachments.filter(a => a.data);
      // Merge user's original images + any images attached to this add-slides request
      const extraImages = (reqAttachments || []).filter(a => a.data);
      const combinedImages = [...extraImages, ...allUserImages].slice(0, 3);

      const presentationContext = {
        presentation_title: slidePlan.presentation_title || pres.title,
        theme: slidePlan.theme,
        color_palette: slidePlan.color_palette,
        existing_slides: slides.map(s => ({ index: s.index, type: s.type, title: s.title, key_points: s.key_points })),
      };

      const newSlideDefs = [];
      await streamNewSlides(description, slideCount, startIndex, presentationContext, (slideDef) => {
        newSlideDefs.push(slideDef);
      });

      // Remove excess optimistic placeholders if Nova generated fewer than 3
      const presRow0 = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!presRow0?.slides_data) return;
      const current0 = JSON.parse(presRow0.slides_data);
      const trimmed = current0.filter(s => s.status !== 'generating' || newSlideDefs.some(d => d.index === s.index));
      if (trimmed.length !== current0.length) {
        db.prepare(`UPDATE presentations SET slides_data = ? WHERE id = ?`).run(JSON.stringify(trimmed), req.params.id);
        broadcast(req.params.id, { type: 'slides_trimmed', keep_indices: newSlideDefs.map(d => d.index) });
      }

      // Generate images for each new slide with stagger
      const imagePromises = newSlideDefs.map((slideDef, i) =>
        new Promise(r => setTimeout(r, i * 800)).then(() => {
          const attachedImages = combinedImages;

          return generateSlideImage(
            slideDef.nano_banana_prompt || slideDef.title,
            slideDef.type, slidePlan.theme, slidePlan.color_palette,
            slideDef.index, attachedImages, aspectRatio
          ).then(imageData => {
            const done = { ...slideDef, image_data: imageData, status: 'complete' };
            // Persist: replace placeholder with done slide
            const currentRow = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
            if (!currentRow?.slides_data) return;
            const current = JSON.parse(currentRow.slides_data);
            const idx = current.findIndex(s => s.index === done.index);
            if (idx !== -1) current[idx] = done; else current.push(done);
            db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
              .run(JSON.stringify(current), req.params.id);
            broadcast(req.params.id, { type: 'slide_ready', slide: done });
          }).catch(err => {
            const errSlide = { ...slideDef, image_data: null, status: 'error' };
            const errRow = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
            if (!errRow?.slides_data) return;
            const current = JSON.parse(errRow.slides_data);
            const idx = current.findIndex(s => s.index === errSlide.index);
            if (idx !== -1) current[idx] = errSlide;
            db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
              .run(JSON.stringify(current), req.params.id);
            broadcast(req.params.id, { type: 'slide_error', index: errSlide.index, message: err.message });
          });
        })
      );

      await Promise.all(imagePromises);
      broadcast(req.params.id, { type: 'slides_added', count: slideCount });
    } catch (err) {
      logger.error('add slides failed', { errorMessage: err.message });
      broadcast(req.params.id, { type: 'error', message: err.message });
    }
  })();
});

// ─── Delete presentation ──────────────────────────────────────────────────
router.delete('/:id', authenticateToken, (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM presentations WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Presentation not found or you don\'t have permission to delete it.' });
  res.json({ message: 'Deleted' });
});

export default router;
