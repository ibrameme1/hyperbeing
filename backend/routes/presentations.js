import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { getDb } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { streamChat, analyzePresentation, generateCompactPlan, streamSlidePrompts, generateSingleSlidePrompt, suggestTitle, streamNewSlides } from '../services/claudeAgent.js';
import { generateSlideImage } from '../services/imageGeneration.js';
import {
  deductCredits, refundCredits, deductCreditsForEdit, computeAffordableSlides,
  updateLedgerMetadata, getOrCreateSubscription, CREDIT_COSTS, checkTokenBudget,
  suggestPlanForCost, novaInsufficientCredits, getEditTierThreshold,
} from '../services/stripeService.js';
import { validate, isString, isOptionalString, isEnum, isArray, isIntBetween } from '../middleware/validate.js';
import { createPresentationLimiter, addSlidesLimiter, analyzeLimiter } from '../middleware/rateLimits.js';
import { logger, requestContext } from '../services/logger.js';
import { tracer } from '../services/tracer.js';
import { sendPresentationReady } from '../services/emailService.js';

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

// Mirrors the tier logic in deductCreditsForEdit — used to compute the
// credits_needed figure for the cute-Nova 402 response when an edit is
// rejected for insufficient credits.
function previewEditCost(sub, hasReferenceImage) {
  const threshold = getEditTierThreshold(sub.plan);
  const tier = (sub.edits_this_month || 0) >= threshold ? 'TIER_2' : 'TIER_1';
  let cost = tier === 'TIER_1' ? CREDIT_COSTS.SLIDE_EDIT_TIER_1 : CREDIT_COSTS.SLIDE_EDIT_TIER_2;
  if (hasReferenceImage) cost += CREDIT_COSTS.REFERENCE_IMAGE_PER_SLIDE;
  return cost;
}

const router = Router();

// In-memory SSE client registry: presentationId → Set<res>
const sseRegistry = new Map();

// User-level SSE registry for dashboard real-time updates: userId → Set<res>
const userSseRegistry = new Map();

function broadcast(presentationId, event) {
  const clients = sseRegistry.get(presentationId);
  if (!clients || clients.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  clients.forEach(res => {
    try { res.write(payload); } catch { /* client disconnected */ }
  });
}

// Broadcast a dashboard-level update to all of a user's open dashboard tabs.
// Reads the latest presentation row from DB and sends it as a 'presentation_updated' event.
function broadcastDashboardUpdate(db, userId, presentationId) {
  const clients = userSseRegistry.get(String(userId));
  if (!clients || clients.size === 0) return;
  const row = db.prepare(
    'SELECT id, title, status, thumbnail, created_at, updated_at FROM presentations WHERE id = ? AND user_id = ?'
  ).get(presentationId, userId);
  if (!row) return;
  const payload = `data: ${JSON.stringify({ type: 'presentation_updated', presentation: row })}\n\n`;
  clients.forEach(res => {
    try { res.write(payload); } catch {}
  });
}

// ─── Fetch URL content for use as brief context ───────────────────────────────
router.post('/fetch-url', authenticateToken, async (req, res) => {
  const { url } = req.body;
  if (!url || !/^https?:\/\/.+/.test(url)) {
    return res.status(400).json({ error: 'Valid URL required' });
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HyperBeing/1.0; +https://hyperbeing.co)' },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return res.status(400).json({ error: `Site returned ${response.status}` });
    }

    const html = await response.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 8000);

    const domain = new URL(url).hostname;
    logger.info('url fetched', { domain, chars: text.length });
    res.json({ url, domain, content: text });
  } catch (err) {
    logger.warn('url fetch failed', { url, errorMessage: err.message });
    res.status(400).json({ error: 'Could not read that URL. The site may block automated requests.' });
  }
});

// ─── List presentations ────────────────────────────────────────────────────
router.get('/', authenticateToken, (req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT id, title, status, thumbnail, created_at, updated_at
       FROM presentations WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(req.user.id);

  // Prevent the browser from caching user-specific data across sessions.
  // Without this, a browser that cached user X's response would serve it
  // to user Y (different Authorization token, same URL, no Vary header).
  res.setHeader('Cache-Control', 'no-store');

  res.json({ presentations: rows });
});

// ─── Dashboard SSE: real-time presentation list updates ───────────────────
router.get('/dashboard-events', authenticateToken, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const userId = String(req.user.id);
  if (!userSseRegistry.has(userId)) userSseRegistry.set(userId, new Set());
  userSseRegistry.get(userId).add(res);

  // Send current list immediately on connect so the dashboard always has fresh data
  const rows = getDb()
    .prepare('SELECT id, title, status, thumbnail, created_at, updated_at FROM presentations WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.user.id);
  res.write(`data: ${JSON.stringify({ type: 'snapshot', presentations: rows })}\n\n`);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch {}
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    userSseRegistry.get(userId)?.delete(res);
    if (userSseRegistry.get(userId)?.size === 0) userSseRegistry.delete(userId);
  });
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

  // Credits are deducted in runFullFlow() once Claude returns the final
  // slide count — at PER_SLIDE credits per slide, with any unaffordable
  // slides returned as locked placeholders rather than blocking creation.

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

  // Notify dashboard subscribers that a new presentation appeared
  broadcastDashboardUpdate(db, req.user.id, id);

  const userId = req.user.id;
  const _traceId = requestContext.getStore()?.requestId;
  runFullFlow(id, message, attachments, userId, _traceId).catch(err => {
    logger.error('slide flow failed', { errorMessage: err.message, stack: err.stack?.split('\n').slice(0,4).join('\n') });
    broadcast(id, { type: 'error', message: err.message });
    const errDb = getDb();
    errDb.prepare(`UPDATE presentations SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    broadcastDashboardUpdate(errDb, userId, id);
  });
});

async function runFullFlow(presentationId, message, attachments, userId = null, traceId = null) {
  const db = getDb();
  const _t = Date.now();
  tracer.recordStep(traceId, 'full_flow', 'started', 0);

  broadcast(presentationId, { type: 'plan_generating' });

  const presRow = db.prepare('SELECT aspect_ratio FROM presentations WHERE id = ?').get(presentationId);
  const aspectRatio = presRow?.aspect_ratio || '16:9';

  const firstUserMsg = db
    .prepare(`SELECT attachments FROM messages WHERE presentation_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`)
    .get(presentationId);
  let userAttachments = [];
  try { userAttachments = JSON.parse(firstUserMsg?.attachments || '[]'); } catch {}
  const allImages = userAttachments.filter(a => a.data);

  const slidePromises = [];
  const completedSlides = new Map();

  function persistProgress() {
    // Merge with current DB state so user-edited slides (_edited: true) are never overwritten
    const current = db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(presentationId);
    let dbSlides = [];
    try { dbSlides = JSON.parse(current?.slides_data || '[]'); } catch {}
    const dbByIndex = new Map(dbSlides.map(s => [s.index, s]));
    // Apply in-memory completed slides, but skip slots marked _edited in DB
    for (const [idx, slide] of completedSlides) {
      if (dbByIndex.get(idx)?._edited) continue; // preserve user edit
      dbByIndex.set(idx, slide);
    }
    const sorted = [...dbByIndex.values()].sort((a, b) => a.index - b.index);
    db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(sorted), presentationId);
  }

  // ── Phase 1: streaming outline — each slide row appears as it arrives ─────────
  let headerBroadcast = false;
  const slides = [];

  const { header } = await generateCompactPlan(message, attachments, userId, {
    onHeader(h) {
      // As soon as we know the total count, switch the frontend to plan_reveal
      broadcast(presentationId, { type: 'plan_started', total_slides: h.total_slides || 0 });
      headerBroadcast = true;

      // Persist header message and update status to generating
      db.prepare(`INSERT INTO messages (id, presentation_id, role, content, metadata) VALUES (?, ?, 'assistant', ?, ?)`)
        .run(uuid(), presentationId, h.message || '', JSON.stringify({ state: 'ready', message: h.message }));
      db.prepare(`UPDATE presentations SET title = ?, status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(h.presentation_title || 'Untitled Presentation', presentationId);
      broadcastDashboardUpdate(db, userId, presentationId);
    },
    onSlide(slide) {
      slides.push(slide);
      // Broadcast each row immediately as it streams — frontend stagger timer handles animation
      broadcast(presentationId, {
        type: 'plan_slide_streamed',
        slide: { index: slide.index, type: slide.type, title: slide.title, key_points: (slide.key_points || []).slice(0, 2) },
      });
    },
  });

  if (!headerBroadcast) {
    broadcast(presentationId, { type: 'plan_started', total_slides: slides.length });
  }

  // Persist full plan to DB now that all slides are collected
  db.prepare(`UPDATE presentations SET slide_plan = ? WHERE id = ?`)
    .run(JSON.stringify({ ...header, slides }), presentationId);

  // plan_ready used for catch-up replay on reconnect
  broadcast(presentationId, {
    type: 'plan_ready',
    total_slides: slides.length,
    slide_plans: slides.map(s => ({ index: s.index, type: s.type, title: s.title, key_points: (s.key_points || []).slice(0, 2) })),
  });
  broadcast(presentationId, { type: 'started', total_slides: slides.length });

  // ── Credit deduction: PER_SLIDE × affordable slide count, deducted now
  // that Claude has returned the final slide count, but BEFORE any NB2 call.
  const { affordable, locked, plan: userPlan } = computeAffordableSlides(userId, slides.length);
  const sortedByIndex = [...slides].sort((a, b) => a.index - b.index);
  const affordableIndexSet = new Set(sortedByIndex.slice(0, affordable).map(s => s.index));
  const lockedIndexSet = new Set(sortedByIndex.slice(affordable).map(s => s.index));

  const creditsNeeded = locked * CREDIT_COSTS.PER_SLIDE;
  const suggestedPlan = locked > 0 ? suggestPlanForCost(userPlan, creditsNeeded) : null;

  const { ledgerId } = deductCredits(userId, affordable * CREDIT_COSTS.PER_SLIDE, 'create_presentation', 'Generate presentation', {
    presentationId, slidesGenerated: affordable, slidesLocked: locked,
    metadata: { total_slides: slides.length },
  });

  if (locked > 0) {
    broadcast(presentationId, {
      type: 'partial_generation',
      slides_generated: affordable,
      slides_locked: locked,
      credits_needed: creditsNeeded,
      suggested_plan: suggestedPlan,
      upgrade_url: '/pricing',
    });
  }

  const lockedSlidesStore = [];

  // ── Phase 2: stream image prompts, start generation per slide as each arrives ─
  const promptedIndices = new Set();

  function startSlideGeneration(slide) {
    promptedIndices.add(slide.index);

    if (lockedIndexSet.has(slide.index)) {
      // Store the prompt server-side only — never sent to the frontend —
      // so the slide can be unlocked later without re-running Claude.
      lockedSlidesStore.push({
        slide_index: slide.index,
        prompt: slide.nano_banana_prompt || slide.title,
        type: slide.type,
        title: slide.title,
      });
      const lockedSlide = {
        index: slide.index,
        type: slide.type,
        title: slide.title,
        key_points: (slide.key_points || []).slice(0, 2),
        status: 'locked',
        locked_reason: 'insufficient_credits',
        credits_needed: CREDIT_COSTS.PER_SLIDE,
        suggested_plan: suggestedPlan,
        upgrade_url: '/pricing',
        image_data: null,
      };
      completedSlides.set(slide.index, lockedSlide);
      persistProgress();
      // Persist locked_slides immediately so /unlock-slides works as soon as
      // the frontend shows the unlock button, without waiting for the rest
      // of the slides to finish generating.
      db.prepare('UPDATE presentations SET locked_slides = ? WHERE id = ?')
        .run(JSON.stringify(lockedSlidesStore), presentationId);
      broadcast(presentationId, { type: 'slide_locked', slide: lockedSlide });
      return;
    }

    broadcast(presentationId, { type: 'slide_generating', index: slide.index });

    const attachedImages = allImages.slice(0, 3);

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
      if (slide.index === 0 && imageData && !imageData.startsWith('data:image/svg')) {
        db.prepare(`UPDATE presentations SET thumbnail = ? WHERE id = ?`).run(imageData, presentationId);
        broadcastDashboardUpdate(db, userId, presentationId);
      }
      // generateSlideImage falls back to an SVG placeholder rather than
      // throwing on persistent NB2 failure — refund the credit in that case.
      if (!imageData || imageData.startsWith('data:image/svg')) {
        refundCredits(userId, CREDIT_COSTS.PER_SLIDE, 'generation_refund', 'Slide image generation failed — refunded', presentationId, { slide_index: slide.index });
      }
      broadcast(presentationId, { type: 'slide_ready', slide: done });
    }).catch(err => {
      logger.error('slide image failed', { slideIndex: slide.index, errorMessage: err.message });
      const errSlide = { ...slide, image_data: null, status: 'error' };
      completedSlides.set(slide.index, errSlide);
      persistProgress();
      refundCredits(userId, CREDIT_COSTS.PER_SLIDE, 'generation_refund', 'Slide image generation failed — refunded', presentationId, { slide_index: slide.index });
      broadcast(presentationId, { type: 'slide_error', index: slide.index, message: err.message });
    });

    slidePromises.push(promise);
  }

  await streamSlidePrompts(slides, header, message, attachments, {
    onPrompt(slide) { startSlideGeneration(slide); },
  }, userId);

  // Fallback: if any slide was missed by the stream, generate a proper prompt via a targeted call
  const missingSlides = slides.filter(s => !promptedIndices.has(s.index));
  if (missingSlides.length > 0) {
    logger.warn('slide prompts missing — generating targeted fallback prompts', { missing: missingSlides.map(s => s.index) });
    await Promise.all(missingSlides.map(async (slide) => {
      try {
        const singlePrompt = await generateSingleSlidePrompt(slide, header, message, allImages.slice(0, 3), userId);
        startSlideGeneration({ ...slide, ...singlePrompt });
      } catch (err) {
        logger.error('targeted prompt fallback failed, using title', { slideIndex: slide.index, errorMessage: err.message });
        startSlideGeneration(slide);
      }
    }));
  }

  // Wait for all image generations to finish
  await Promise.all(slidePromises);

  // Persist locked-slide prompts server-side (never sent to the frontend) so
  // they can be unlocked later without re-running Claude.
  db.prepare(`UPDATE presentations SET locked_slides = ? WHERE id = ?`)
    .run(JSON.stringify(lockedSlidesStore), presentationId);
  if (ledgerId) {
    updateLedgerMetadata(ledgerId, { locked_slides: lockedSlidesStore });
  }

  // Build final slides: merge DB state (preserving _edited slides) with completedSlides
  const finalRow = db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(presentationId);
  let finalDbSlides = [];
  try { finalDbSlides = JSON.parse(finalRow?.slides_data || '[]'); } catch {}
  const finalByIndex = new Map(finalDbSlides.map(s => [s.index, s]));
  for (const [idx, slide] of completedSlides) {
    if (finalByIndex.get(idx)?._edited) continue; // preserve user edit
    finalByIndex.set(idx, slide);
  }
  // Ensure all plan slides are represented (fill any gaps as error)
  for (const slide of slides) {
    if (!finalByIndex.has(slide.index)) {
      finalByIndex.set(slide.index, { ...slide, image_data: null, status: 'error' });
    }
  }
  const allSlides = [...finalByIndex.values()].sort((a, b) => a.index - b.index);

  // Persist final slide_plan with full outline data
  db.prepare(`UPDATE presentations SET slide_plan = ? WHERE id = ?`)
    .run(JSON.stringify({ ...header, slides: allSlides.map(({ image_data, ...rest }) => rest) }), presentationId);

  db.prepare(`UPDATE presentations SET status = 'completed', slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(JSON.stringify(allSlides), presentationId);
  broadcastDashboardUpdate(db, userId, presentationId);

  if (userId) {
    const _presUser = db.prepare('SELECT name, email FROM users WHERE id = ?').get(userId);
    const _presTitle = db.prepare('SELECT title FROM presentations WHERE id = ?').get(presentationId)?.title;
    if (_presUser?.email) sendPresentationReady(_presUser.name, _presUser.email, presentationId, _presTitle);
  }

  // Auto-suggest title
  try {
    const titleCtx = { slides: allSlides.map(s => ({ title: s.title, type: s.type, key_points: s.key_points?.slice(0, 2) })) };
    const autoTitle = await suggestTitle(titleCtx, userId);
    if (autoTitle) {
      db.prepare(`UPDATE presentations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(autoTitle, presentationId);
      broadcast(presentationId, { type: 'title_updated', title: autoTitle });
      broadcastDashboardUpdate(db, userId, presentationId);
    }
  } catch {}

  tracer.recordStep(traceId, 'full_flow', 'completed', Date.now() - _t);
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

  const ownedPres = getDb()
    .prepare('SELECT id FROM presentations WHERE id = ? AND user_id = ?')
    .get(id, userId);
  if (!ownedPres) return res.status(404).end();

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

  broadcastDashboardUpdate(db, req.user.id, req.params.id);
  res.json({ message: 'Generation started', total_slides: slidePlan.slides.length });

  // Run generation async — do not await
  const genUserId = req.user.id;
  runGeneration(req.params.id, slidePlan, genUserId).catch(err => {
    logger.error('generation failed', { errorMessage: err.message });
    broadcast(req.params.id, { type: 'error', message: err.message });
  });
});

async function runGeneration(presentationId, slidePlan, userId = null) {
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

  if (userId) broadcastDashboardUpdate(db, userId, presentationId);
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

  const targetIndex = parseInt(req.params.index, 10);

  // Read slide data at request time just to validate and build the prompt
  const slidesAtRequest = JSON.parse(pres.slides_data);
  const slideForPrompt = slidesAtRequest.find(s => s.index === targetIndex);
  if (!slideForPrompt) return res.status(404).json({ error: 'Slide not found. It may have been removed or the index is out of range.' });

  const slidePlan = pres.slide_plan ? JSON.parse(pres.slide_plan) : {};

  // pic1 = current rendered slide; pic2, pic3… = anything the user uploaded in the edit bar
  const hasCurrentImage = slideForPrompt.image_data && !slideForPrompt.image_data.startsWith('data:image/svg');
  const userUploads = (reqBodyAttachments || []).filter(a => a.data);
  // Only user-uploaded references count toward the reference-image surcharge —
  // the auto-included current-slide image does not.
  const hasReferenceImage = userUploads.length > 0;

  let editResult;
  try {
    editResult = deductCreditsForEdit(req.user.id, req.params.id, hasReferenceImage, `Edit slide ${targetIndex}`);
  } catch (err) {
    if (err.message === 'INSUFFICIENT_CREDITS') {
      const sub = getOrCreateSubscription(req.user.id);
      const creditsNeeded = previewEditCost(sub, hasReferenceImage);
      return res.status(402).json(novaInsufficientCredits({
        creditsRemaining: sub.credits_remaining,
        creditsNeeded,
        actionType: 'slide_edit',
        currentPlan: sub.plan,
      }));
    }
    throw err;
  }

  res.json({ message: 'Editing…', index: targetIndex });

  const regenAspectRatio = pres.aspect_ratio || '16:9';

  // Build the regeneration prompt — user instruction leads, slide context follows
  const baseContext = slideForPrompt.nano_banana_prompt || slideForPrompt.image_prompt || slideForPrompt.title;
  const editPrompt = `${instruction.trim()}\n\nSlide context: ${baseContext}`;

  let attachedImages = [];
  if (hasCurrentImage) {
    const mimeType = slideForPrompt.image_data.match(/^data:([^;]+);base64,/)?.[1] || 'image/jpeg';
    attachedImages.push({ data: slideForPrompt.image_data, mimeType });
  }
  attachedImages.push(...userUploads);
  attachedImages = attachedImages.slice(0, 5);

  (async () => {
    try {
      const imageData = await generateSlideImage(
        editPrompt,
        slideForPrompt.type,
        slidePlan.theme,
        slidePlan.color_palette,
        slideForPrompt.index,
        attachedImages,
        regenAspectRatio
      );

      // Re-read slides_data fresh to avoid overwriting concurrent changes
      const freshPres = db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(req.params.id);
      const freshSlides = JSON.parse(freshPres?.slides_data || '[]');
      const freshArrayPos = freshSlides.findIndex(s => s.index === targetIndex);

      const updatedSlide = {
        ...(freshArrayPos >= 0 ? freshSlides[freshArrayPos] : slideForPrompt),
        image_data: imageData,
        status: 'complete',
        _edited: true,
      };

      if (freshArrayPos >= 0) {
        freshSlides[freshArrayPos] = updatedSlide;
      } else {
        freshSlides.push(updatedSlide);
        freshSlides.sort((a, b) => a.index - b.index);
      }

      // Always keep the thumbnail in sync with whichever slide is first in the current order
      let thumbSql = `UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const thumbArgs = [JSON.stringify(freshSlides), req.params.id];
      const isFirstSlide = freshSlides[0]?.index === targetIndex;
      if (isFirstSlide && imageData && !imageData.startsWith('data:image/svg')) {
        thumbSql = `UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        thumbArgs.splice(1, 0, imageData);
      }
      db.prepare(thumbSql).run(...thumbArgs);

      // generateSlideImage falls back to an SVG placeholder rather than
      // throwing on persistent NB2 failure — refund the credit in that case.
      if (!imageData || imageData.startsWith('data:image/svg')) {
        refundCredits(req.user.id, editResult.cost, 'slide_edit_refund', 'Slide edit failed — refunded', req.params.id, { slide_index: targetIndex });
      }

      broadcast(req.params.id, { type: 'slide_updated', slide: updatedSlide });
    } catch (err) {
      logger.error('slide edit failed', { errorMessage: err.message });
      refundCredits(req.user.id, editResult.cost, 'slide_edit_refund', 'Slide edit failed — refunded', req.params.id, { slide_index: targetIndex });
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

  let editResult;
  try {
    editResult = deductCreditsForEdit(req.user.id, req.params.id, false, `Retry slide ${targetIndex}`);
  } catch (err) {
    if (err.message === 'INSUFFICIENT_CREDITS') {
      const sub = getOrCreateSubscription(req.user.id);
      const creditsNeeded = previewEditCost(sub, false);
      return res.status(402).json(novaInsufficientCredits({
        creditsRemaining: sub.credits_remaining,
        creditsNeeded,
        actionType: 'slide_edit',
        currentPlan: sub.plan,
      }));
    }
    throw err;
  }

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

      if (!imageData || imageData.startsWith('data:image/svg')) {
        refundCredits(req.user.id, editResult.cost, 'slide_edit_refund', 'Slide retry failed — refunded', req.params.id, { slide_index: targetIndex });
      }

      broadcast(req.params.id, { type: 'slide_updated', slide: updatedSlide });
    } catch (err) {
      logger.error('slide retry failed', { errorMessage: err.message });
      refundCredits(req.user.id, editResult.cost, 'slide_edit_refund', 'Slide retry failed — refunded', req.params.id, { slide_index: targetIndex });
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

  const db = getDb();
  const pres = db.prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });
  if (!pres.slides_data) return res.status(400).json({ error: 'No slides have been generated yet. Generate your presentation before adding more slides.' });

  const slides = JSON.parse(pres.slides_data);
  const startIndex = slides.length;
  const aspectRatio = pres.aspect_ratio || '16:9';
  const slidePlan = pres.slide_plan ? JSON.parse(pres.slide_plan) : {};

  // For fixed counts we know the cost up front — check affordability and
  // deduct credits before doing any work, returning a cute-Nova 402 if
  // nothing is affordable at all.
  let affordable = null;
  let locked = 0;
  let suggestedPlan = null;
  let ledgerId = null;
  if (!isAuto) {
    const computed = computeAffordableSlides(req.user.id, slideCount);
    if (computed.affordable === 0) {
      const creditsNeeded = slideCount * CREDIT_COSTS.SLIDES_ADD_PER_SLIDE;
      return res.status(402).json(novaInsufficientCredits({
        creditsRemaining: computed.creditsRemaining,
        creditsNeeded,
        actionType: 'add_slides',
        currentPlan: computed.plan,
      }));
    }
    affordable = computed.affordable;
    locked = computed.locked;
    const creditsNeeded = locked * CREDIT_COSTS.SLIDES_ADD_PER_SLIDE;
    suggestedPlan = locked > 0 ? suggestPlanForCost(computed.plan, creditsNeeded) : null;
    ({ ledgerId } = deductCredits(req.user.id, affordable * CREDIT_COSTS.SLIDES_ADD_PER_SLIDE, 'add_slides', 'Add slides', {
      presentationId: req.params.id, slidesGenerated: affordable, slidesLocked: locked,
      metadata: { requested_slides: slideCount },
    }));
    if (locked > 0) {
      broadcast(req.params.id, {
        type: 'partial_generation',
        slides_generated: affordable,
        slides_locked: locked,
        credits_needed: creditsNeeded,
        suggested_plan: suggestedPlan,
        upgrade_url: '/pricing',
      });
    }
  }

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

      // Phase 2: upgrade image prompts via streamSlidePrompts (same as main generation flow)
      // streamNewSlides gives basic prompts; PROMPT_GEN_SYSTEM produces the full 5-layer structured ones.
      const promptHeader = {
        presentation_title: slidePlan.presentation_title || pres.title,
        theme: slidePlan.theme || 'modern-minimal',
        color_palette: slidePlan.color_palette || {},
      };
      const promptedByIndex = new Map(newSlideDefs.map(s => [s.index, s]));
      await streamSlidePrompts(newSlideDefs, promptHeader, description, combinedImages, {
        onPrompt(slide) { promptedByIndex.set(slide.index, slide); },
      });
      const promptedSlideDefs = newSlideDefs.map(s => promptedByIndex.get(s.index) || s);

      // For 'auto' mode the slide count is only known now — check affordability
      // and deduct credits before generating any images.
      if (isAuto) {
        const computed = computeAffordableSlides(req.user.id, promptedSlideDefs.length);
        affordable = computed.affordable;
        locked = computed.locked;
        const creditsNeeded = locked * CREDIT_COSTS.SLIDES_ADD_PER_SLIDE;
        suggestedPlan = locked > 0 ? suggestPlanForCost(computed.plan, creditsNeeded) : null;
        ({ ledgerId } = deductCredits(req.user.id, affordable * CREDIT_COSTS.SLIDES_ADD_PER_SLIDE, 'add_slides', 'Add slides', {
          presentationId: req.params.id, slidesGenerated: affordable, slidesLocked: locked,
          metadata: { requested_slides: promptedSlideDefs.length },
        }));
        if (locked > 0) {
          broadcast(req.params.id, {
            type: 'partial_generation',
            slides_generated: affordable,
            slides_locked: locked,
            credits_needed: creditsNeeded,
            suggested_plan: suggestedPlan,
            upgrade_url: '/pricing',
          });
        }
      }

      const sortedDefs = [...promptedSlideDefs].sort((a, b) => a.index - b.index);
      const affordableDefs = sortedDefs.slice(0, affordable);
      const lockedDefs = sortedDefs.slice(affordable);

      // Remove excess optimistic placeholders, and replace placeholders for
      // locked slides with locked placeholders (prompts stored server-side only).
      const presRow0 = db.prepare('SELECT slides_data, locked_slides FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!presRow0?.slides_data) return;
      const current0 = JSON.parse(presRow0.slides_data);
      let existingLocked = [];
      try { existingLocked = JSON.parse(presRow0.locked_slides || '[]'); } catch {}

      const newLockedEntries = lockedDefs.map(d => ({
        slide_index: d.index,
        prompt: d.nano_banana_prompt || d.title,
        type: d.type,
        title: d.title,
      }));
      const lockedPlaceholders = lockedDefs.map(d => ({
        index: d.index,
        type: d.type,
        title: d.title,
        key_points: (d.key_points || []).slice(0, 2),
        status: 'locked',
        locked_reason: 'insufficient_credits',
        credits_needed: CREDIT_COSTS.SLIDES_ADD_PER_SLIDE,
        suggested_plan: suggestedPlan,
        upgrade_url: '/pricing',
        image_data: null,
      }));

      const keepIndices = new Set(promptedSlideDefs.map(d => d.index));
      const trimmed = current0.filter(s => s.status !== 'generating' || keepIndices.has(s.index));
      for (const lp of lockedPlaceholders) {
        const idx = trimmed.findIndex(s => s.index === lp.index);
        if (idx !== -1) trimmed[idx] = lp; else trimmed.push(lp);
      }
      trimmed.sort((a, b) => a.index - b.index);

      db.prepare(`UPDATE presentations SET slides_data = ?, locked_slides = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`)
        .run(JSON.stringify(trimmed), JSON.stringify([...existingLocked, ...newLockedEntries]), req.params.id, req.user.id);
      broadcast(req.params.id, { type: 'slides_trimmed', keep_indices: promptedSlideDefs.map(d => d.index) });
      for (const lp of lockedPlaceholders) {
        broadcast(req.params.id, { type: 'slide_locked', slide: lp });
      }
      if (ledgerId && newLockedEntries.length > 0) {
        updateLedgerMetadata(ledgerId, { locked_slides: newLockedEntries });
      }

      // Generate images only for affordable slides, with stagger
      const imagePromises = affordableDefs.map((slideDef, i) =>
        new Promise(r => setTimeout(r, i * 800)).then(() => {
          const attachedImages = combinedImages;

          return generateSlideImage(
            slideDef.nano_banana_prompt || slideDef.title,
            slideDef.type, slidePlan.theme, slidePlan.color_palette,
            slideDef.index, combinedImages, aspectRatio
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
            // generateSlideImage falls back to an SVG placeholder rather than
            // throwing on persistent NB2 failure — refund the credit in that case.
            if (!imageData || imageData.startsWith('data:image/svg')) {
              refundCredits(req.user.id, CREDIT_COSTS.SLIDES_ADD_PER_SLIDE, 'generation_refund', 'Slide image generation failed — refunded', req.params.id, { slide_index: slideDef.index });
            }
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
            refundCredits(req.user.id, CREDIT_COSTS.SLIDES_ADD_PER_SLIDE, 'generation_refund', 'Slide image generation failed — refunded', req.params.id, { slide_index: slideDef.index });
            broadcast(req.params.id, { type: 'slide_error', index: errSlide.index, message: err.message });
          });
        })
      );

      await Promise.all(imagePromises);
      broadcast(req.params.id, { type: 'slides_added', count: affordableDefs.length, locked: lockedDefs.length });
    } catch (err) {
      logger.error('add slides failed', { errorMessage: err.message });
      broadcast(req.params.id, { type: 'error', message: err.message });
    }
  })();
});

// ─── Unlock previously-locked slides (generate images from stored prompts) ──
router.post('/:id/unlock-slides', authenticateToken,
  validate({ slide_indexes: isArray(50, (v) => Number.isInteger(v) ? null : 'Must be an integer') }),
  async (req, res) => {
    const { slide_indexes } = req.body;
    if (slide_indexes.length === 0) {
      return res.status(400).json({ error: 'slide_indexes must be a non-empty array of integers.' });
    }

    const db = getDb();
    const pres = db.prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });

    let lockedSlides = [];
    try { lockedSlides = JSON.parse(pres.locked_slides || '[]'); } catch {}

    const requestedSet = new Set(slide_indexes);
    const toUnlock = lockedSlides.filter(s => requestedSet.has(s.slide_index));
    if (toUnlock.length === 0) {
      return res.status(404).json({ error: 'No matching locked slides found.' });
    }

    const cost = toUnlock.length * CREDIT_COSTS.PER_SLIDE;

    let ledgerId;
    try {
      ({ ledgerId } = deductCredits(req.user.id, cost, 'unlock_slides', `Unlock ${toUnlock.length} slide(s)`, {
        presentationId: req.params.id, slidesGenerated: toUnlock.length,
        metadata: { slide_indexes: toUnlock.map(s => s.slide_index) },
      }));
    } catch (err) {
      if (err.message === 'INSUFFICIENT_CREDITS') {
        const sub = getOrCreateSubscription(req.user.id);
        return res.status(402).json(novaInsufficientCredits({
          creditsRemaining: sub.credits_remaining,
          creditsNeeded: cost,
          actionType: 'unlock_slides',
          currentPlan: sub.plan,
        }));
      }
      throw err;
    }

    const aspectRatio = pres.aspect_ratio || '16:9';
    const slidePlanData = pres.slide_plan ? JSON.parse(pres.slide_plan) : {};

    const generated = [];
    for (const lockedSlide of toUnlock) {
      try {
        const imageData = await generateSlideImage(
          lockedSlide.prompt,
          lockedSlide.type,
          slidePlanData.theme || 'modern-minimal',
          slidePlanData.color_palette || {},
          lockedSlide.slide_index,
          [],
          aspectRatio
        );

        const done = {
          index: lockedSlide.slide_index,
          type: lockedSlide.type,
          title: lockedSlide.title,
          nano_banana_prompt: lockedSlide.prompt,
          image_data: imageData,
          status: 'complete',
        };

        if (!imageData || imageData.startsWith('data:image/svg')) {
          refundCredits(req.user.id, CREDIT_COSTS.PER_SLIDE, 'unlock_slides_refund', 'Slide unlock failed — refunded', req.params.id, { slide_index: lockedSlide.slide_index });
        }

        generated.push(done);
        broadcast(req.params.id, { type: 'slide_ready', slide: done });
      } catch (err) {
        logger.error('slide unlock failed', { slideIndex: lockedSlide.slide_index, errorMessage: err.message });
        refundCredits(req.user.id, CREDIT_COSTS.PER_SLIDE, 'unlock_slides_refund', 'Slide unlock failed — refunded', req.params.id, { slide_index: lockedSlide.slide_index });
        broadcast(req.params.id, { type: 'slide_error', index: lockedSlide.slide_index, message: err.message });
      }
    }

    // Merge generated slides into slides_data
    const currentRow = db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(req.params.id);
    const currentSlides = JSON.parse(currentRow?.slides_data || '[]');
    for (const done of generated) {
      const idx = currentSlides.findIndex(s => s.index === done.index);
      if (idx !== -1) currentSlides[idx] = { ...currentSlides[idx], ...done };
      else currentSlides.push(done);
    }
    currentSlides.sort((a, b) => a.index - b.index);

    // Remove unlocked slides from locked_slides
    const remainingLocked = lockedSlides.filter(s => !requestedSet.has(s.slide_index));

    db.prepare(`UPDATE presentations SET slides_data = ?, locked_slides = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(currentSlides), JSON.stringify(remainingLocked), req.params.id);

    if (ledgerId) {
      updateLedgerMetadata(ledgerId, { unlocked_slides: generated.map(s => s.index) });
    }

    broadcastDashboardUpdate(db, req.user.id, req.params.id);
    broadcast(req.params.id, { type: 'slides_unlocked', slide_indexes: generated.map(s => s.index) });

    res.json({ message: 'Slides unlocked', slides: generated });
  },
);

// ─── Delete a single slide ────────────────────────────────────────────────
router.delete('/:id/slides/:index', authenticateToken, (req, res) => {
  const db = getDb();
  const pres = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!pres || !pres.slides_data) return res.status(404).json({ error: 'Presentation not found' });

  const targetIndex = parseInt(req.params.index, 10);
  const slides = JSON.parse(pres.slides_data);
  const filtered = slides.filter(s => s.index !== targetIndex);

  if (filtered.length === slides.length) return res.status(404).json({ error: 'Slide not found' });

  const newFirst = filtered[0];
  const hasThumb = newFirst?.image_data && !newFirst.image_data.startsWith('data:image/svg');

  if (filtered.length === 0) {
    db.prepare(`UPDATE presentations SET slides_data = ?, thumbnail = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(filtered), req.params.id);
  } else if (hasThumb) {
    db.prepare(`UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(filtered), newFirst.image_data, req.params.id);
  } else {
    db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(filtered), req.params.id);
  }

  res.json({ message: 'Slide deleted', slides: filtered });
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
