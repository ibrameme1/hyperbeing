import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { getDb } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { chat, regenerateSlide, analyzePresentation } from '../services/claudeAgent.js';
import { generateSlideImage } from '../services/imageGeneration.js';

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
      `SELECT id, title, status, created_at, updated_at
       FROM presentations WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(req.user.id);
  res.json({ presentations: rows });
});

// ─── Analyze brief and return contextual questions ─────────────────────────
router.post('/analyze', authenticateToken, async (req, res) => {
  const { message, attachments = [] } = req.body;
  if (!message?.trim() && attachments.length === 0) {
    return res.status(400).json({ error: 'Message or attachment required' });
  }
  try {
    const analysis = await analyzePresentation(message, attachments);
    res.json(analysis);
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: 'Analysis failed', detail: err.message });
  }
});

// ─── Create presentation + send first message ──────────────────────────────
router.post('/', authenticateToken, async (req, res) => {
  const { message, attachments = [] } = req.body;
  if (!message?.trim() && attachments.length === 0) {
    return res.status(400).json({ error: 'Message or attachment required' });
  }

  const db = getDb();
  const id = uuid();
  const msgId = uuid();

  const { aspectRatio = '16:9' } = req.body;
  db.prepare(
    `INSERT INTO presentations (id, user_id, title, status, aspect_ratio)
     VALUES (?, ?, 'Untitled Presentation', 'chat', ?)`
  ).run(id, req.user.id, aspectRatio);

  db.prepare(
    `INSERT INTO messages (id, presentation_id, role, content, attachments)
     VALUES (?, ?, 'user', ?, ?)`
  ).run(msgId, id, message, JSON.stringify(attachments));

  try {
    const agentResponse = await chat([], message, attachments);
    const aiMsgId = uuid();

    db.prepare(
      `INSERT INTO messages (id, presentation_id, role, content, metadata)
       VALUES (?, ?, 'assistant', ?, ?)`
    ).run(aiMsgId, id, agentResponse.message, JSON.stringify(agentResponse));

    if (agentResponse.state === 'ready' && agentResponse.slide_plan) {
      const { presentation_title } = agentResponse.slide_plan;
      db.prepare(
        `UPDATE presentations SET title = ?, slide_plan = ?, status = 'ready', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(presentation_title || 'Untitled Presentation', JSON.stringify(agentResponse.slide_plan), id);
    }

    res.status(201).json({
      presentation: db.prepare('SELECT * FROM presentations WHERE id = ?').get(id),
      aiMessage: { id: aiMsgId, role: 'assistant', content: agentResponse.message, metadata: agentResponse },
    });
  } catch (err) {
    console.error('Agent error:', err);
    res.status(500).json({ error: 'AI agent failed', detail: err.message });
  }
});

// ─── Get single presentation with messages ────────────────────────────────
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

// ─── Continue chat ────────────────────────────────────────────────────────
router.post('/:id/messages', authenticateToken, async (req, res) => {
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
    res.status(500).json({ error: 'AI agent failed', detail: err.message });
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

      broadcast(presentationId, { type: 'slide_ready', slide: completedSlide });
    } catch (err) {
      console.error(`Slide ${slide.index} image failed:`, err.message);
      slides.push({ ...slide, image_data: null, status: 'error' });
      broadcast(presentationId, { type: 'slide_error', index: slide.index, message: err.message });
    }
  }

  db.prepare(
    `UPDATE presentations SET status = 'completed', slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(JSON.stringify(slides), presentationId);

  broadcast(presentationId, { type: 'complete', total_slides: slides.length });
}

// ─── Regenerate a single slide ────────────────────────────────────────────
router.post('/:id/slides/:index/regenerate', authenticateToken, async (req, res) => {
  const { instruction } = req.body;
  if (!instruction?.trim()) return res.status(400).json({ error: 'Instruction required' });

  const db = getDb();
  const pres = db
    .prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!pres) return res.status(404).json({ error: 'Not found' });
  if (!pres.slides_data) return res.status(400).json({ error: 'No slides generated yet' });

  const slides = JSON.parse(pres.slides_data);
  const idx = parseInt(req.params.index, 10);
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

      const categories = updatedSlide.attach_image_categories || slide.attach_image_categories || [];
      let attachedImages = userAttachments.filter(a => a.data);
      if (!categories.includes('all')) {
        attachedImages = attachedImages.filter(a =>
          (categories.includes('moodboard') && a.category === 'moodboard') ||
          (categories.includes('branding') && a.category === 'branding')
        );
      }
      attachedImages = attachedImages.slice(0, 3);

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
      broadcast(req.params.id, { type: 'slide_error', index: idx, message: err.message });
    }
  })();
});

// ─── Delete presentation ──────────────────────────────────────────────────
router.delete('/:id', authenticateToken, (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM presentations WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ message: 'Deleted' });
});

export default router;
