import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { getDb } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { analyzePresentationStream, generateCompactPlan, streamSlidePrompts, generateSingleSlidePrompt, suggestTitle, streamNewSlides } from '../services/claudeAgent.js';
import { generateSlideImage, editSlideImage, isPlaceholderImage } from '../services/imageGeneration.js';
import * as imageStore from '../services/imageStore.js';
import {
  deductCredits, refundCredits, deductCreditsForEdit, computeAffordableSlides,
  updateLedgerMetadata, getOrCreateSubscription, CREDIT_COSTS, checkTokenBudget,
  suggestPlanForCost, novaInsufficientCredits, previewEditCost, isAdmin,
} from '../services/stripeService.js';
import { validateAttachments } from '../middleware/attachments.js';
import { assertPublicUrl } from '../services/urlGuard.js';
import { validate, isString, isOptionalString, isEnum, isArray, isIntBetween } from '../middleware/validate.js';
import { createPresentationLimiter, addSlidesLimiter, analyzeLimiter } from '../middleware/rateLimits.js';
import { logger, requestContext } from '../services/logger.js';
import { tracer } from '../services/tracer.js';
import { sendPresentationReady } from '../services/emailService.js';

// Max number of prior versions kept per slide for the version history panel
const MAX_SLIDE_VERSIONS = 10;

// Builds the persisted image fields for a slide from a freshly generated image.
// Real raster images are written to the on-disk image store and referenced by
// an authed URL; svg placeholders / nulls pass through inline so the
// isPlaceholderImage() checks (and mock mode) keep working. Images no longer
// live as multi-MB base64 inside the presentations row (GAPS #7).
function storeSlideImage(presentationId, slideIndex, imageData) {
  const file = imageStore.saveDataUrl(imageData);
  if (!file) return { image_data: imageData ?? null, image_file: null };
  return { image_data: slideImageUrl(presentationId, slideIndex, file), image_file: file };
}

function slideImageUrl(presentationId, slideIndex, file) {
  return `/api/presentations/${presentationId}/slides/${slideIndex}/image?f=${file}`;
}

function versionImageUrl(presentationId, slideIndex, versionId) {
  return `/api/presentations/${presentationId}/slides/${slideIndex}/versions/${versionId}/image`;
}

// Moves the slide's outgoing image FILE into version history (most recent
// first), pruned to MAX_SLIDE_VERSIONS — pruned files are deleted from disk.
// The version reuses the same physical file the slide had, so nothing is
// re-encoded or duplicated. Returns the metadata stubs for slides_data
// ({id, instruction, created_at} — never image bytes).
function pushSlideVersion(db, presentationId, slideIndex, outgoingImageFile, instruction) {
  if (imageStore.isStoredFilename(outgoingImageFile)) {
    // image_data '' (not omitted / NULL) — legacy tables declared it NOT NULL.
    db.prepare(
      "INSERT INTO slide_versions (id, presentation_id, slide_index, image_file, image_data, instruction) VALUES (?, ?, ?, ?, '', ?)"
    ).run(uuid(), presentationId, slideIndex, outgoingImageFile, instruction);
    // Prune everything past the newest MAX_SLIDE_VERSIONS and unlink their files.
    const pruned = db.prepare(
      `SELECT id, image_file FROM slide_versions
        WHERE presentation_id = ? AND slide_index = ?
        ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET ?`
    ).all(presentationId, slideIndex, MAX_SLIDE_VERSIONS);
    for (const row of pruned) {
      db.prepare('DELETE FROM slide_versions WHERE id = ?').run(row.id);
      imageStore.remove(row.image_file);
    }
  }
  return listSlideVersionMeta(db, presentationId, slideIndex);
}

function listSlideVersionMeta(db, presentationId, slideIndex) {
  return db.prepare(
    'SELECT id, instruction, created_at FROM slide_versions WHERE presentation_id = ? AND slide_index = ? ORDER BY created_at DESC, rowid DESC'
  ).all(presentationId, slideIndex);
}

const VALID_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3'];
const VALID_STYLES = ['classic', 'minimalistic'];

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
    'SELECT id, title, status, (thumbnail IS NOT NULL) AS has_thumbnail, adding_slides, created_at, updated_at FROM presentations WHERE id = ? AND user_id = ?'
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
  if (!url || typeof url !== 'string' || url.length > 2000) {
    return res.status(400).json({ error: 'Valid URL required' });
  }

  try {
    // SSRF guard: hostname must resolve to a public address, http(s) only,
    // standard ports only. Redirects are followed manually so every hop is
    // re-validated — otherwise a public URL could 302 to an internal one.
    let currentUrl = url;
    let response;
    for (let hop = 0; hop < 4; hop++) {
      await assertPublicUrl(currentUrl);
      response = await fetch(currentUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HyperBeing/1.0; +https://hyperbeing.co)' },
        signal: AbortSignal.timeout(12000),
        redirect: 'manual',
      });
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        currentUrl = new URL(response.headers.get('location'), currentUrl).href;
        continue;
      }
      break;
    }

    if (response.status >= 300 && response.status < 400) {
      return res.status(400).json({ error: 'Too many redirects' });
    }
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
  // has_thumbnail instead of the base64 image itself — a power user's list was
  // tens of MB per load. The image is served by GET /:id/thumbnail below.
  const rows = getDb()
    .prepare(
      `SELECT id, title, status, (thumbnail IS NOT NULL) AS has_thumbnail, adding_slides, created_at, updated_at
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
    .prepare('SELECT id, title, status, (thumbnail IS NOT NULL) AS has_thumbnail, adding_slides, created_at, updated_at FROM presentations WHERE user_id = ? ORDER BY updated_at DESC')
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

// ─── Thumbnail image (referenced by dashboard cards via <img src>) ─────────
// <img> tags can't send an Authorization header, so — like the SSE routes —
// this accepts the JWT as a ?token= query param. Access tokens live 15 min,
// which bounds how long a leaked URL stays useful.
router.get('/:id/thumbnail', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).end();

  let userId;
  try {
    ({ userId } = jwt.verify(token, process.env.JWT_SECRET));
  } catch {
    return res.status(401).end();
  }

  const db = getDb();
  const pres = isAdmin(userId)
    ? db.prepare('SELECT thumbnail FROM presentations WHERE id = ?').get(req.params.id)
    : db.prepare('SELECT thumbnail FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!pres?.thumbnail) return res.status(404).end();

  // thumbnail column holds the filename of the first slide's stored image.
  // (Legacy rows may still hold a base64 data URL until the migration runs.)
  const filePath = imageStore.pathFor(pres.thumbnail);
  if (filePath) {
    res.setHeader('Content-Type', imageStore.mimeFor(pres.thumbnail));
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.sendFile(filePath);
  }
  const match = /^data:([^;]+);base64,(.*)$/.exec(pres.thumbnail);
  if (!match) return res.status(404).end();
  res.setHeader('Content-Type', match[1]);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(Buffer.from(match[2], 'base64'));
});

// ─── Slide image (authed, ?token= like the thumbnail — <img> can't send headers) ─
router.get('/:id/slides/:index/image', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).end();
  let userId;
  try { ({ userId } = jwt.verify(token, process.env.JWT_SECRET)); } catch { return res.status(401).end(); }

  const db = getDb();
  const pres = isAdmin(userId)
    ? db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(req.params.id)
    : db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!pres?.slides_data) return res.status(404).end();

  const targetIndex = parseInt(req.params.index, 10);
  let slides = [];
  try { slides = JSON.parse(pres.slides_data); } catch {}
  const slide = slides.find(s => s.index === targetIndex);
  // image_file is authoritative — the ?f= in the URL is only a cache-buster.
  const filePath = slide?.image_file ? imageStore.pathFor(slide.image_file) : null;
  if (!filePath) {
    // Legacy inline data URL (pre-migration) — serve it directly.
    const m = /^data:([^;]+);base64,(.*)$/.exec(slide?.image_data || '');
    if (m) { res.setHeader('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
    return res.status(404).end();
  }
  res.setHeader('Content-Type', imageStore.mimeFor(slide.image_file));
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(filePath);
});

// ─── A saved version's image (authed) ─────────────────────────────────────────
router.get('/:id/slides/:index/versions/:versionId/image', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).end();
  let userId;
  try { ({ userId } = jwt.verify(token, process.env.JWT_SECRET)); } catch { return res.status(401).end(); }

  const db = getDb();
  const owned = isAdmin(userId)
    ? db.prepare('SELECT id FROM presentations WHERE id = ?').get(req.params.id)
    : db.prepare('SELECT id FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!owned) return res.status(404).end();

  const v = db.prepare('SELECT image_file, image_data FROM slide_versions WHERE id = ? AND presentation_id = ? AND slide_index = ?')
    .get(req.params.versionId, req.params.id, parseInt(req.params.index, 10));
  const filePath = v?.image_file ? imageStore.pathFor(v.image_file) : null;
  if (!filePath) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(v?.image_data || '');
    if (m) { res.setHeader('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
    return res.status(404).end();
  }
  res.setHeader('Content-Type', imageStore.mimeFor(v.image_file));
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(filePath);
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
  const attachmentsErr = validateAttachments(attachments);
  if (attachmentsErr) return res.status(400).json({ error: attachmentsErr });
  try { checkTokenBudget(req.user.id); } catch (err) {
    if (err.message === 'TOKEN_LIMIT_EXCEEDED') return res.status(402).json({ error: 'You\'ve reached your monthly token limit. Upgrade your plan to continue.', code: 'TOKEN_LIMIT_EXCEEDED' });
    throw err;
  }

  const webSearch = req.body.webSearch === true;

  // Stream over SSE so the client can show live search queries as Nova runs them.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const analysis = await analyzePresentationStream(message, attachments, req.user.id, {
      webSearch,
      onEvent: (ev) => { res.write(`data: ${JSON.stringify(ev)}\n\n`); },
    });
    res.write(`data: ${JSON.stringify({ type: 'done', analysis })}\n\n`);
    res.end();
  } catch (err) {
    logger.error('analysis failed', { errorMessage: err.message });
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'Brief analysis failed. Please try again — if the problem persists, try shortening your description.' })}\n\n`);
    res.end();
  }
});

// ─── Create presentation + kick off async full flow ───────────────────────
router.post('/', authenticateToken, createPresentationLimiter, (req, res) => {
  const { message, attachments = [], aspectRatio = '16:9', style = 'classic' } = req.body;
  if (!message?.trim() && attachments.length === 0) {
    return res.status(400).json({ error: 'Message or attachment required' });
  }
  if (typeof message !== 'undefined' && typeof message !== 'string') {
    return res.status(400).json({ error: 'Message must be a string' });
  }
  if (message && message.length > 50_000) {
    return res.status(400).json({ error: 'Message too long (max 50,000 characters)' });
  }
  const attachmentsErr = validateAttachments(attachments);
  if (attachmentsErr) return res.status(400).json({ error: attachmentsErr });
  if (!VALID_ASPECT_RATIOS.includes(aspectRatio)) {
    return res.status(400).json({ error: `Invalid aspect ratio. Must be one of: ${VALID_ASPECT_RATIOS.join(', ')}` });
  }
  if (!VALID_STYLES.includes(style)) {
    return res.status(400).json({ error: `Invalid style. Must be one of: ${VALID_STYLES.join(', ')}` });
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
    `INSERT INTO presentations (id, user_id, title, status, aspect_ratio, style)
     VALUES (?, ?, 'Untitled Presentation', 'processing', ?, ?)`
  ).run(id, req.user.id, aspectRatio, style);

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
  runFullFlow(id, message, attachments, userId, _traceId, style).catch(err => {
    logger.error('slide flow failed', { errorMessage: err.message, stack: err.stack?.split('\n').slice(0,4).join('\n') });
    broadcast(id, { type: 'error', message: err.message });
    const errDb = getDb();
    errDb.prepare(`UPDATE presentations SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    broadcastDashboardUpdate(errDb, userId, id);
  });
});

async function runFullFlow(presentationId, message, attachments, userId = null, traceId = null, style = 'classic') {
  const db = getDb();
  const _t = Date.now();
  tracer.recordStep(traceId, 'full_flow', 'started', 0);

  broadcast(presentationId, { type: 'plan_generating' });

  const presRow = db.prepare('SELECT aspect_ratio, style FROM presentations WHERE id = ?').get(presentationId);
  const aspectRatio = presRow?.aspect_ratio || '16:9';
  // Prefer the persisted style (source of truth) but fall back to the argument.
  const deckStyle = presRow?.style || style || 'classic';

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
      aspectRatio,
      deckStyle
    ).then(imageData => {
      // generateSlideImage falls back to a generic gradient placeholder rather
      // than throwing on persistent NB2 failure — treat that the same as an
      // error so the user sees a regenerate option instead of a blank slide,
      // and refund the credit.
      if (isPlaceholderImage(imageData)) {
        const errSlide = { ...slide, image_data: null, status: 'error' };
        completedSlides.set(slide.index, errSlide);
        persistProgress();
        refundCredits(userId, CREDIT_COSTS.PER_SLIDE, 'generation_refund', 'Slide image generation failed — refunded', presentationId, { slide_index: slide.index });
        logger.error('slide image generation returned placeholder', { presentationId, slideIndex: slide.index });
        broadcast(presentationId, { type: 'slide_error', index: slide.index, message: 'Image generation failed' });
        return;
      }
      const done = { ...slide, ...storeSlideImage(presentationId, slide.index, imageData), status: 'complete' };
      completedSlides.set(slide.index, done);
      persistProgress();
      if (slide.index === 0) {
        db.prepare(`UPDATE presentations SET thumbnail = ? WHERE id = ?`).run(done.image_file, presentationId);
        broadcastDashboardUpdate(db, userId, presentationId);
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
  }, userId, deckStyle);

  // Fallback: if any slide was missed by the stream, generate a proper prompt via a targeted call
  const missingSlides = slides.filter(s => !promptedIndices.has(s.index));
  if (missingSlides.length > 0) {
    logger.warn('slide prompts missing — generating targeted fallback prompts', { missing: missingSlides.map(s => s.index) });
    await Promise.all(missingSlides.map(async (slide) => {
      try {
        const singlePrompt = await generateSingleSlidePrompt(slide, header, message, allImages.slice(0, 3), userId, deckStyle);
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

  tracer.recordStep(traceId, 'full_flow', 'completed', Date.now() - _t);
  broadcast(presentationId, { type: 'complete', total_slides: allSlides.length });
}

// ─── Get single presentation with messages ────────────────────────────────
router.get('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  const pres = isAdmin(req.user.id)
    ? db.prepare('SELECT * FROM presentations WHERE id = ?').get(req.params.id)
    : db.prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

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
  const accessiblePres = ownedPres || (isAdmin(userId) && getDb().prepare('SELECT id FROM presentations WHERE id = ?').get(id));
  if (!accessiblePres) return res.status(404).end();

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
      // Only emit `complete` when every slide is actually finished. An
      // add-slides run leaves freshly-added placeholders in 'generating' while
      // the presentation row is already 'completed'. Emitting `complete` here
      // (e.g. on an EventSource auto-reconnect during the slow add-slides
      // window) makes the client flip those still-generating placeholders to
      // 'error' (see the `complete` handler in PresentationPage) — showing a
      // false failure + regenerate button while the backend is still
      // generating them. Hold the `complete` until they're truly done.
      const stillGenerating = doneSlides.some(s => s.status === 'generating');
      if (!stillGenerating) {
        res.write(`data: ${JSON.stringify({ type: 'complete', total_slides: doneSlides.length })}\n\n`);
      }
    }
  }

  req.on('close', () => {
    sseRegistry.get(id)?.delete(res);
    if (sseRegistry.get(id)?.size === 0) sseRegistry.delete(id);
  });
});

// ─── Regenerate a single slide (user-described edit → direct to Gemini) ──────
router.post('/:id/slides/:index/regenerate', authenticateToken, async (req, res) => {
  const { instruction, attachments: reqBodyAttachments = [] } = req.body;
  if (!instruction?.trim()) return res.status(400).json({ error: 'Please describe what you\'d like to change about this slide.' });
  const attachmentsErr = validateAttachments(reqBodyAttachments);
  if (attachmentsErr) return res.status(400).json({ error: attachmentsErr });

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

  // pic1 = current rendered slide; pic2, pic3… = anything the user uploaded in the edit bar
  const hasCurrentImage = slideForPrompt.image_data && !slideForPrompt.image_data.startsWith('data:image/svg');
  const userUploads = reqBodyAttachments.filter(a => a.data);
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

  // The user's instruction is the whole prompt — the current slide image (attached
  // below as a reference) carries the context, so the original generation prompt
  // is not resent.
  const editPrompt = instruction.trim();

  let attachedImages = [];
  if (hasCurrentImage) {
    const mimeType = slideForPrompt.image_data.match(/^data:([^;]+);base64,/)?.[1] || 'image/jpeg';
    attachedImages.push({ data: slideForPrompt.image_data, mimeType });
  }
  attachedImages.push(...userUploads);
  attachedImages = attachedImages.slice(0, 5);

  (async () => {
    try {
      const imageData = await editSlideImage(
        editPrompt,
        attachedImages,
        regenAspectRatio,
        slideForPrompt.index
      );

      // Re-read slides_data fresh to avoid overwriting concurrent changes
      const freshPres = db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(req.params.id);
      const freshSlides = JSON.parse(freshPres?.slides_data || '[]');
      const freshArrayPos = freshSlides.findIndex(s => s.index === targetIndex);
      const baseSlide = freshArrayPos >= 0 ? freshSlides[freshArrayPos] : slideForPrompt;

      // editSlideImage returns null (or an SVG placeholder in mock mode)
      // rather than throwing on persistent NB2 failure.
      const editFailed = !imageData || imageData.startsWith('data:image/svg');
      if (editFailed) {
        // Leave the slide's existing image untouched, refund, and surface the
        // failure so the UI shows a retry affordance over the last good image.
        refundCredits(req.user.id, editResult.cost, 'slide_edit_refund', 'Slide edit failed — refunded', req.params.id, { slide_index: targetIndex });
        broadcast(req.params.id, { type: 'slide_error', index: targetIndex, message: 'Image generation failed' });
        return;
      }

      // Success: store the new image on disk; the outgoing image FILE moves into
      // version history (reused, not re-encoded).
      const updatedSlide = {
        ...baseSlide,
        ...storeSlideImage(req.params.id, targetIndex, imageData),
        status: 'complete',
        _edited: true,
        versions: pushSlideVersion(db, req.params.id, targetIndex, baseSlide.image_file, instruction.trim()),
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
      if (freshSlides[0]?.index === targetIndex) {
        thumbSql = `UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        thumbArgs.splice(1, 0, updatedSlide.image_file);
      }
      db.prepare(thumbSql).run(...thumbArgs);

      broadcast(req.params.id, { type: 'slide_updated', slide: updatedSlide });
    } catch (err) {
      logger.error('slide edit failed', { errorMessage: err.message });
      refundCredits(req.user.id, editResult.cost, 'slide_edit_refund', 'Slide edit failed — refunded', req.params.id, { slide_index: targetIndex });
      broadcast(req.params.id, { type: 'slide_error', index: targetIndex, message: err.message });
    }
  })();
});

// ─── List saved versions for a slide ──────────────────────────────────────────
router.get('/:id/slides/:index/versions', authenticateToken, (req, res) => {
  const db = getDb();
  const pres = db
    .prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });
  if (!pres.slides_data) return res.status(400).json({ error: 'No slides have been generated yet.' });

  const targetIndex = parseInt(req.params.index, 10);
  const slides = JSON.parse(pres.slides_data);
  const slide = slides.find(s => s.index === targetIndex);
  if (!slide) return res.status(404).json({ error: 'Slide not found. It may have been removed or the index is out of range.' });

  // Version images are served from disk via an authed URL — the list carries
  // metadata + a URL, never base64.
  const versions = db.prepare(
    'SELECT id, instruction, created_at FROM slide_versions WHERE presentation_id = ? AND slide_index = ? ORDER BY created_at DESC, rowid DESC'
  ).all(req.params.id, targetIndex).map(v => ({ ...v, image_data: versionImageUrl(req.params.id, targetIndex, v.id) }));
  res.json({ versions });
});

// ─── Restore a previous version of a slide ────────────────────────────────────
router.post('/:id/slides/:index/versions/:versionId/restore', authenticateToken, (req, res) => {
  const db = getDb();
  const pres = db
    .prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });
  if (!pres.slides_data) return res.status(400).json({ error: 'No slides have been generated yet.' });

  const targetIndex = parseInt(req.params.index, 10);
  const slides = JSON.parse(pres.slides_data);
  const arrayPos = slides.findIndex(s => s.index === targetIndex);
  const slide = slides[arrayPos];
  if (!slide) return res.status(404).json({ error: 'Slide not found. It may have been removed or the index is out of range.' });

  const restoredVersion = db.prepare(
    'SELECT * FROM slide_versions WHERE id = ? AND presentation_id = ? AND slide_index = ?'
  ).get(req.params.versionId, req.params.id, targetIndex);
  if (!restoredVersion) return res.status(404).json({ error: 'Version not found.' });

  // The restored version's file becomes the slide's current image (its row
  // leaves history — file is reused, not deleted); the outgoing current file
  // joins history in its place.
  db.prepare('DELETE FROM slide_versions WHERE id = ?').run(restoredVersion.id);
  const restoredFile = restoredVersion.image_file;

  const updatedSlide = {
    ...slide,
    image_file: restoredFile || null,
    image_data: restoredFile
      ? slideImageUrl(req.params.id, targetIndex, restoredFile)
      : restoredVersion.image_data, // legacy pre-migration base64
    status: 'complete',
    _edited: true,
    versions: pushSlideVersion(db, req.params.id, targetIndex, slide.image_file, 'Reverted to an earlier version'),
  };

  slides[arrayPos] = updatedSlide;

  let thumbSql = `UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  const thumbArgs = [JSON.stringify(slides), req.params.id];
  if (slides[0]?.index === targetIndex) {
    thumbSql = `UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    thumbArgs.splice(1, 0, updatedSlide.image_file);
  }
  db.prepare(thumbSql).run(...thumbArgs);

  broadcast(req.params.id, { type: 'slide_updated', slide: updatedSlide });
  res.json({ slide: updatedSlide });
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

  // Guard against double-generation. A slide still in 'generating' is being
  // produced right now by an in-flight add-slides run (or an earlier retry
  // that hasn't finished). Kicking off a competing generation here would race
  // with it, and the slower of the two writes silently overwrites the good
  // result — the exact "original slide shows, then gets overwritten by the
  // regenerate" bug. The original generation will still deliver its result via
  // SSE, so we no-op (without charging credits) and let it finish.
  if (slide.status === 'generating') {
    logger.info('retry ignored — slide still generating in background', { presentationId: req.params.id, slideIndex: targetIndex });
    return res.json({ message: 'Slide is still generating', index: targetIndex, alreadyGenerating: true });
  }

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
      let prompt = slide.nano_banana_prompt || slide.image_prompt;
      if (!prompt) {
        // This slide never got a real visual prompt — e.g. a placeholder from
        // add-slides that errored before prompt generation finished. Falling
        // back to slide.title (e.g. "New Slide 3") gives NB2 nothing to work
        // with and it comes back near-instantly with a blank gradient
        // placeholder. Generate a proper prompt first instead.
        const header = {
          presentation_title: slidePlan.presentation_title || pres.title,
          theme: slidePlan.theme || 'modern-minimal',
          color_palette: slidePlan.color_palette || {},
        };
        const firstUserMsg = db
          .prepare(`SELECT content, attachments FROM messages WHERE presentation_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`)
          .get(req.params.id);
        let briefAttachments = [];
        try { briefAttachments = JSON.parse(firstUserMsg?.attachments || '[]').filter(a => a.data); } catch {}
        try {
          const generated = await generateSingleSlidePrompt(
            slide, header, firstUserMsg?.content || header.presentation_title, briefAttachments, req.user.id, pres.style || 'classic',
          );
          prompt = generated.nano_banana_prompt;
        } catch (err) {
          logger.error('targeted prompt fallback failed during retry', { slideIndex: targetIndex, errorMessage: err.message });
          prompt = slide.title;
        }
      }

      const imageData = await generateSlideImage(
        prompt,
        slide.type,
        slidePlan.theme,
        slidePlan.color_palette,
        slide.index,
        [],
        regenAspectRatio,
        pres.style || 'classic'
      );

      // generateSlideImage falls back to a generic gradient placeholder rather
      // than throwing on persistent NB2 failure — treat that as an error so
      // the slide keeps showing the regenerate option instead of a blank image.
      const failed = isPlaceholderImage(imageData);
      const oldFile = slide.image_file;
      const updatedSlide = failed
        ? { ...slide, nano_banana_prompt: prompt, image_data: null, image_file: null, status: 'error' }
        : { ...slide, nano_banana_prompt: prompt, ...storeSlideImage(req.params.id, targetIndex, imageData), status: 'complete' };
      // Re-read fresh right before writing — other slides in this deck may
      // have been added or updated concurrently (e.g. an add-slides run still
      // finishing its other slides). Writing back the `slides` array captured
      // at the start of the request would clobber those concurrent changes.
      const freshRow = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!freshRow?.slides_data) return;
      const freshSlides = JSON.parse(freshRow.slides_data);
      const freshPos = freshSlides.findIndex(s => s.index === targetIndex);
      if (freshPos === -1) return;
      freshSlides[freshPos] = updatedSlide;

      let thumbSql = `UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const thumbArgs = [JSON.stringify(freshSlides), req.params.id];
      if (freshPos === 0 && !failed) {
        thumbSql = `UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        thumbArgs.splice(1, 0, updatedSlide.image_file);
      }
      db.prepare(thumbSql).run(...thumbArgs);
      // Retry replaces the image outright (no version kept) — drop the old file.
      if (!failed && oldFile && oldFile !== updatedSlide.image_file) imageStore.remove(oldFile);

      if (failed) {
        refundCredits(req.user.id, editResult.cost, 'slide_edit_refund', 'Slide retry failed — refunded', req.params.id, { slide_index: targetIndex });
        logger.error('slide retry returned placeholder', { presentationId: req.params.id, slideIndex: targetIndex });
        broadcast(req.params.id, { type: 'slide_error', index: targetIndex, message: 'Image generation failed' });
      } else {
        broadcast(req.params.id, { type: 'slide_updated', slide: updatedSlide });
      }
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
  const orderedIndices = new Set(order);
  const reordered = order.map(idx => byIndex.get(idx)).filter(Boolean);

  // The client's `order` array reflects the slide list it had when the drag
  // started. If new slides were added/generated since (e.g. add-slides is
  // still running in the background), this fresh read of slides_data will
  // contain indices the client doesn't know about yet. Append those at the
  // end instead of dropping them, so an in-progress reorder can never delete
  // a slide that's currently being generated.
  for (const slide of slides) {
    if (!orderedIndices.has(slide.index)) reordered.push(slide);
  }

  // Sync thumbnail to whichever slide is now first (thumbnail column holds a
  // stored image filename).
  const newFirstFile = reordered[0]?.image_file || null;
  if (newFirstFile) {
    db.prepare(`UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(reordered), newFirstFile, req.params.id);
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
  const { description, count = 1, attachments: reqAttachments = [], style } = req.body;
  if (!description?.trim() || typeof description !== 'string') {
    return res.status(400).json({ error: 'Please describe the slides you\'d like to add.' });
  }
  if (style !== undefined && !VALID_STYLES.includes(style)) {
    return res.status(400).json({ error: `Invalid style. Must be one of: ${VALID_STYLES.join(', ')}` });
  }
  if (description.length > 10_000) {
    return res.status(400).json({ error: 'Description too long (max 10,000 characters)' });
  }
  const attachmentsErr = validateAttachments(reqAttachments);
  if (attachmentsErr) return res.status(400).json({ error: attachmentsErr });
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
  // Use the highest existing slide index + 1, not slides.length — if a slide
  // was ever deleted (DELETE /:id/slides/:index removes it without
  // reindexing the rest), slides.length can be less than max(index) + 1.
  // Using slides.length here would assign a new slide the same `index` as an
  // existing one, producing a duplicate-index entry in slides_data. Any later
  // `current.findIndex(s => s.index === ...)` lookup then matches the OLD
  // (already-complete) slide first, discards the new slide's result as
  // "stale", and leaves the new placeholder stuck on 'generating' forever —
  // while the old slide's data gets silently overwritten by that placeholder.
  const startIndex = slides.length ? Math.max(...slides.map(s => s.index)) + 1 : 0;
  const aspectRatio = pres.aspect_ratio || '16:9';
  // New slides default to the deck's existing style so added slides match the
  // look of the original deck; an explicit request body can still override it.
  const addStyle = style || pres.style || 'classic';
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
  // Flag the row as adding-slides so the dashboard shows "Generating…" — the
  // presentation status stays 'completed' throughout the run, so without this
  // the dashboard card would say "Complete" while new slides are still cooking.
  db.prepare(`UPDATE presentations SET slides_data = ?, adding_slides = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(JSON.stringify(newSlides), req.params.id);
  broadcast(req.params.id, { type: 'slides_adding', placeholders });
  broadcastDashboardUpdate(db, req.user.id, req.params.id);

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

      // Give Claude the actual visual prompts used for ALL existing slides so
      // new slides continue the same visual language and understand the full
      // context of the deck — not just the title/key_points, which lose all
      // the art-direction detail.
      const allSlideVisuals = slides.map(s => ({
        index: s.index,
        type: s.type,
        title: s.title,
        nano_banana_prompt: s.nano_banana_prompt || null,
      }));

      const presentationContext = {
        presentation_title: slidePlan.presentation_title || pres.title,
        theme: slidePlan.theme,
        color_palette: slidePlan.color_palette,
        existing_slides: slides.map(s => ({ index: s.index, type: s.type, title: s.title, key_points: s.key_points })),
        recent_slide_visuals: allSlideVisuals,
      };

      const newSlideDefs = [];
      await streamNewSlides(description, slideCount, startIndex, presentationContext, (slideDef) => {
        newSlideDefs.push(slideDef);
      }, req.user.id);
      newSlideDefs.sort((a, b) => a.index - b.index);

      // Phase 2: generate the full 5-layer nano_banana_prompt for every new
      // slide. We do this with one targeted single-slide call per slide, all in
      // parallel — NOT the monolithic streamSlidePrompts pass used by the main
      // generation flow. That streaming pass regularly emitted one fewer SLIDE:
      // line than requested (always dropping the last new slide), which then
      // forced a slow serial targeted fallback AFTER the ~60s stream had already
      // finished — so a single add-slides run could spend ~90s in prompt
      // generation alone. Per-slide calls can't drop a slide and run
      // concurrently, so this phase now costs roughly one prompt's latency.
      const promptHeader = {
        presentation_title: slidePlan.presentation_title || pres.title,
        theme: slidePlan.theme || 'modern-minimal',
        color_palette: slidePlan.color_palette || {},
      };
      // Append visual continuity context so each prompt matches the established
      // look of the deck — the existing-deck prompts are the consistency anchor
      // that matters most for added slides.
      const continuityContext = allSlideVisuals.some(s => s.nano_banana_prompt)
        ? `\n\nEXISTING DECK CONTEXT — for visual continuity, here are all the slides already in this deck and the prompts used to generate them. Match their established color usage, typography, and design language:\n${allSlideVisuals
            .filter(s => s.nano_banana_prompt)
            .map(s => `Slide ${s.index} (${s.type}) "${s.title}":\n${s.nano_banana_prompt}`)
            .join('\n\n')}`
        : '';
      const promptedSlideDefs = await Promise.all(newSlideDefs.map(async (slide) => {
        try {
          const single = await generateSingleSlidePrompt(slide, promptHeader, description + continuityContext, combinedImages, req.user.id, addStyle);
          return { ...slide, ...single };
        } catch (err) {
          // Leave this slide without a prompt — image gen falls back to the
          // title and, failing that, surfaces a regenerate option that
          // generates a proper prompt on demand.
          logger.error('add-slides: targeted prompt generation failed', { slideIndex: slide.index, errorMessage: err.message });
          return slide;
        }
      }));

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
        (async () => {
          await new Promise(r => setTimeout(r, i * 800));
          try {
            const prompt = slideDef.nano_banana_prompt || slideDef.title;
            let imageData = await generateSlideImage(
              prompt, slideDef.type, slidePlan.theme, slidePlan.color_palette,
              slideDef.index, combinedImages, aspectRatio, addStyle
            );

            // generateSlideImage retries NB2 internally but falls back to a
            // generic gradient placeholder rather than throwing on persistent
            // failure. Before surfacing a failure to the user, automatically
            // resubmit the same prompt once — most placeholder results are
            // transient NB2 hiccups that succeed on a fresh attempt, so the
            // user never has to click regenerate. Only if this second attempt
            // also fails do we mark the slide 'error' and show that button.
            if (isPlaceholderImage(imageData)) {
              logger.warn('add-slides image returned placeholder — auto-retrying once with same prompt', { presentationId: req.params.id, slideIndex: slideDef.index });
              imageData = await generateSlideImage(
                prompt, slideDef.type, slidePlan.theme, slidePlan.color_palette,
                slideDef.index, combinedImages, aspectRatio, addStyle
              );
            }

            const failed = isPlaceholderImage(imageData);
            const done = failed
              ? { ...slideDef, image_data: null, image_file: null, status: 'error' }
              : { ...slideDef, ...storeSlideImage(req.params.id, slideDef.index, imageData), status: 'complete' };
            // Persist: replace placeholder with done slide
            const currentRow = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
            if (!currentRow?.slides_data) return;
            const current = JSON.parse(currentRow.slides_data);
            const idx = current.findIndex(s => s.index === done.index);

            // If the user already retried/edited this slide directly while this
            // generation was still in flight, its status will no longer be
            // 'generating' — don't clobber their result with this stale attempt.
            if (idx !== -1 && current[idx].status !== 'generating') {
              logger.info('add-slides: discarding stale image result — slide already updated', { presentationId: req.params.id, slideIndex: done.index, currentStatus: current[idx].status });
              refundCredits(req.user.id, CREDIT_COSTS.SLIDES_ADD_PER_SLIDE, 'generation_refund', 'Slide updated before generation finished — refunded', req.params.id, { slide_index: slideDef.index });
              return;
            }

            if (idx !== -1) current[idx] = done; else current.push(done);
            db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
              .run(JSON.stringify(current), req.params.id);
            if (failed) {
              refundCredits(req.user.id, CREDIT_COSTS.SLIDES_ADD_PER_SLIDE, 'generation_refund', 'Slide image generation failed — refunded', req.params.id, { slide_index: slideDef.index });
              logger.error('add-slides image generation returned placeholder after auto-retry', { presentationId: req.params.id, slideIndex: slideDef.index });
              broadcast(req.params.id, { type: 'slide_error', index: done.index, message: 'Image generation failed' });
            } else {
              broadcast(req.params.id, { type: 'slide_ready', slide: done });
            }
          } catch (err) {
            const errSlide = { ...slideDef, image_data: null, status: 'error' };
            const errRow = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
            if (!errRow?.slides_data) return;
            const current = JSON.parse(errRow.slides_data);
            const idx = current.findIndex(s => s.index === errSlide.index);

            if (idx !== -1 && current[idx].status !== 'generating') {
              logger.info('add-slides: discarding stale image error — slide already updated', { presentationId: req.params.id, slideIndex: errSlide.index, currentStatus: current[idx].status });
              refundCredits(req.user.id, CREDIT_COSTS.SLIDES_ADD_PER_SLIDE, 'generation_refund', 'Slide updated before generation finished — refunded', req.params.id, { slide_index: slideDef.index });
              return;
            }

            if (idx !== -1) current[idx] = errSlide;
            db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
              .run(JSON.stringify(current), req.params.id);
            refundCredits(req.user.id, CREDIT_COSTS.SLIDES_ADD_PER_SLIDE, 'generation_refund', 'Slide image generation failed — refunded', req.params.id, { slide_index: slideDef.index });
            broadcast(req.params.id, { type: 'slide_error', index: errSlide.index, message: err.message });
          }
        })()
      );

      await Promise.all(imagePromises);
      broadcast(req.params.id, { type: 'slides_added', count: affordableDefs.length, locked: lockedDefs.length });
    } catch (err) {
      logger.error('add slides failed', { errorMessage: err.message });
      // Don't leave placeholders from this request stuck in 'generating'
      // forever — mark them as errored so they're visible and retryable,
      // and refund any credits already deducted since no images were made.
      const errRow = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (errRow?.slides_data) {
        const current = JSON.parse(errRow.slides_data);
        let changed = false;
        for (const s of current) {
          if (s.index >= startIndex && s.status === 'generating') {
            s.status = 'error';
            changed = true;
            broadcast(req.params.id, { type: 'slide_error', index: s.index, message: err.message });
          }
        }
        if (changed) {
          db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(JSON.stringify(current), req.params.id);
        }
      }
      if (affordable) {
        refundCredits(req.user.id, affordable * CREDIT_COSTS.SLIDES_ADD_PER_SLIDE, 'generation_refund', 'Add slides failed — refunded', req.params.id, {});
      }
      broadcast(req.params.id, { type: 'error', message: err.message });
    } finally {
      // Clear the dashboard "Generating…" flag whether the run succeeded or
      // failed, and refresh the dashboard so the card flips back to "Complete".
      try {
        db.prepare(`UPDATE presentations SET adding_slides = 0 WHERE id = ?`).run(req.params.id);
        broadcastDashboardUpdate(db, req.user.id, req.params.id);
      } catch (e) {
        logger.error('add-slides: failed to clear adding_slides flag', { presentationId: req.params.id, errorMessage: e.message });
      }
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
          aspectRatio,
          pres.style || 'classic'
        );

        const failed = isPlaceholderImage(imageData);
        const stored = failed
          ? { image_data: null, image_file: null }
          : storeSlideImage(req.params.id, lockedSlide.slide_index, imageData);
        const done = {
          index: lockedSlide.slide_index,
          type: lockedSlide.type,
          title: lockedSlide.title,
          nano_banana_prompt: lockedSlide.prompt,
          ...stored,
          status: failed ? 'error' : 'complete',
        };

        generated.push(done);
        if (failed) {
          refundCredits(req.user.id, CREDIT_COSTS.PER_SLIDE, 'unlock_slides_refund', 'Slide unlock failed — refunded', req.params.id, { slide_index: lockedSlide.slide_index });
          logger.error('slide unlock returned placeholder', { presentationId: req.params.id, slideIndex: lockedSlide.slide_index });
          broadcast(req.params.id, { type: 'slide_error', index: done.index, message: 'Image generation failed' });
        } else {
          broadcast(req.params.id, { type: 'slide_ready', slide: done });
        }
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

  // Slide indices are never reused, so its version history can go too — delete
  // the rows and the underlying image files (the slide's own + its versions').
  const removed = slides.find(s => s.index === targetIndex);
  const verFiles = db.prepare('SELECT image_file FROM slide_versions WHERE presentation_id = ? AND slide_index = ?').all(req.params.id, targetIndex);
  db.prepare('DELETE FROM slide_versions WHERE presentation_id = ? AND slide_index = ?').run(req.params.id, targetIndex);
  imageStore.remove(removed?.image_file);
  for (const v of verFiles) imageStore.remove(v.image_file);

  const newFirst = filtered[0];
  const newFirstFile = newFirst?.image_file || null;

  if (filtered.length === 0) {
    db.prepare(`UPDATE presentations SET slides_data = ?, thumbnail = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(filtered), req.params.id);
  } else if (newFirstFile) {
    db.prepare(`UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(filtered), newFirstFile, req.params.id);
  } else {
    db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(filtered), req.params.id);
  }

  res.json({ message: 'Slide deleted', slides: filtered });
});

// ─── Delete presentation ──────────────────────────────────────────────────
router.delete('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  // Gather every stored image file before the rows cascade away, so nothing is
  // orphaned on the volume.
  const pres = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have permission to delete it.' });
  let slides = [];
  try { slides = JSON.parse(pres.slides_data || '[]'); } catch {}
  const verFiles = db.prepare('SELECT image_file FROM slide_versions WHERE presentation_id = ?').all(req.params.id);

  const result = db.prepare('DELETE FROM presentations WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Presentation not found or you don\'t have permission to delete it.' });

  for (const s of slides) imageStore.remove(s.image_file);
  for (const v of verFiles) imageStore.remove(v.image_file);
  res.json({ message: 'Deleted' });
});

export default router;
