import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { getDb } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { designGenerationLimiter } from '../middleware/rateLimits.js';
import { craftDesignPrompts } from '../services/designPromptGenerator.js';
import { generateDesignImage } from '../services/gptImageGeneration.js';
import {
  checkTokenBudget, deductCredits, refundCredits, getOrCreateSubscription,
  CREDIT_COSTS, novaInsufficientCredits,
} from '../services/stripeService.js';
import { DESIGN_MAX_PARALLEL_GENERATIONS, DESIGN_MAX_IMAGES_PER_BATCH } from '../config/credits.js';
import { logger, requestContext } from '../services/logger.js';

const router = Router();

const DESIGN_ASPECT_RATIO = '16:9';
const DESIGN_QUALITY = 'medium';
const DESIGN_RESOLUTION = '1k';

// ─── Attachment validation (mirrors presentations.js) ──────────────────────
function validateAttachment(a) {
  if (typeof a !== 'object' || a === null) return 'Must be an object';
  if (a.type !== undefined && !['image', 'file'].includes(a.type)) return 'Invalid type';
  if (typeof a.name !== 'string' || a.name.length > 255) return 'Invalid name';
  if (typeof a.data !== 'string') return 'Missing data';
  if (a.data.length > 10_000_000) return 'One of your images is too large (max ~7MB). Please use a smaller image.';
  return null;
}

function validateAttachments(attachments, maxCount = 4) {
  if (!Array.isArray(attachments)) return 'Attachments must be an array';
  if (attachments.length > maxCount) return `Too many reference images (max ${maxCount})`;
  for (const a of attachments) {
    const err = validateAttachment(a);
    if (err) return err;
  }
  return null;
}

// ─── Per-user SSE registry for gallery live updates ────────────────────────
const userSseRegistry = new Map();

function broadcastToUser(userId, event) {
  const clients = userSseRegistry.get(String(userId));
  if (!clients || clients.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  clients.forEach(res => {
    try { res.write(payload); } catch { /* client disconnected */ }
  });
}

function serializeRow(row) {
  if (!row) return null;
  return {
    ...row,
    reference_images: safeJsonParse(row.reference_images, []),
    settings: safeJsonParse(row.settings, {}),
  };
}

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ─── GET /api/design — list all of the user's generations (gallery) ───────
router.get('/', authenticateToken, (req, res) => {
  const rows = getDb()
    .prepare('SELECT * FROM design_generations WHERE user_id = ? ORDER BY created_at DESC LIMIT 200')
    .all(req.user.id);
  res.json({ generations: rows.map(serializeRow) });
});

// ─── GET /api/design/events — SSE stream of live gallery updates ──────────
// Auth via ?token= query param — EventSource cannot set Authorization headers.
router.get('/events', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).end();

  let userId;
  try {
    ({ userId } = jwt.verify(token, process.env.JWT_SECRET));
  } catch {
    return res.status(401).end();
  }

  const user = getDb().prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(401).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  userId = String(userId);
  if (!userSseRegistry.has(userId)) userSseRegistry.set(userId, new Set());
  userSseRegistry.get(userId).add(res);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch {}
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    userSseRegistry.get(userId)?.delete(res);
    if (userSseRegistry.get(userId)?.size === 0) userSseRegistry.delete(userId);
  });
});

// ─── POST /api/design/generate — start a new generation batch ─────────────
router.post('/generate', authenticateToken, designGenerationLimiter, (req, res) => {
  const { prompt = '', mode = 'own', count = 1, attachments = [] } = req.body;

  if (!prompt?.trim() && attachments.length === 0) {
    return res.status(400).json({ error: 'Describe what you want to create, or attach a reference image.' });
  }
  if (typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt must be a string' });
  }
  if (prompt.length > 8000) {
    return res.status(400).json({ error: 'Prompt too long (max 8,000 characters)' });
  }
  if (!['own', 'nova'].includes(mode)) {
    return res.status(400).json({ error: "Mode must be 'own' or 'nova'" });
  }
  const imageCount = parseInt(count, 10);
  if (isNaN(imageCount) || imageCount < 1 || imageCount > DESIGN_MAX_IMAGES_PER_BATCH) {
    return res.status(400).json({ error: `Image count must be between 1 and ${DESIGN_MAX_IMAGES_PER_BATCH}` });
  }
  const attachmentsErr = validateAttachments(attachments);
  if (attachmentsErr) return res.status(400).json({ error: attachmentsErr });

  if (mode === 'nova') {
    try {
      checkTokenBudget(req.user.id);
    } catch (err) {
      if (err.message === 'TOKEN_LIMIT_EXCEEDED') {
        return res.status(402).json({ error: 'You\'ve reached your monthly token limit. Upgrade your plan to continue.', code: 'TOKEN_LIMIT_EXCEEDED' });
      }
      throw err;
    }
  }

  const db = getDb();

  // Enforce the parallel-generation cap (max 8 in-flight images at once)
  const inFlight = db
    .prepare("SELECT COUNT(*) AS n FROM design_generations WHERE user_id = ? AND status IN ('pending','generating')")
    .get(req.user.id).n;
  if (inFlight + imageCount > DESIGN_MAX_PARALLEL_GENERATIONS) {
    return res.status(429).json({
      error: `You can have at most ${DESIGN_MAX_PARALLEL_GENERATIONS} images generating at once. Wait for some to finish before starting more.`,
      code: 'TOO_MANY_PARALLEL_GENERATIONS',
    });
  }

  const costPerImage = mode === 'own' ? CREDIT_COSTS.DESIGN_IMAGE_OWN_PROMPT : CREDIT_COSTS.DESIGN_IMAGE_NOVA_PROMPT;
  const totalCost = costPerImage * imageCount;

  let deduction;
  try {
    deduction = deductCredits(req.user.id, totalCost, 'design_generation', `Design mode: ${imageCount} image${imageCount !== 1 ? 's' : ''} (${mode === 'nova' ? 'Nova prompts' : 'your prompts'})`);
  } catch (err) {
    if (err.message === 'INSUFFICIENT_CREDITS') {
      const sub = getOrCreateSubscription(req.user.id);
      return res.status(402).json(novaInsufficientCredits({
        creditsRemaining: sub.credits_remaining,
        creditsNeeded: totalCost,
        actionType: 'design_generation',
        currentPlan: sub.plan,
      }));
    }
    throw err;
  }

  const batchId = uuid();
  const settings = JSON.stringify({ aspectRatio: DESIGN_ASPECT_RATIO, quality: DESIGN_QUALITY, resolution: DESIGN_RESOLUTION });
  const referenceImagesJson = JSON.stringify(attachments);

  const insert = db.prepare(
    `INSERT INTO design_generations (id, user_id, batch_id, status, mode, user_prompt, reference_images, settings)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`
  );

  const rows = [];
  const insertMany = db.transaction(() => {
    for (let i = 0; i < imageCount; i++) {
      const id = uuid();
      insert.run(id, req.user.id, batchId, mode, prompt.trim(), referenceImagesJson, settings);
      rows.push(db.prepare('SELECT * FROM design_generations WHERE id = ?').get(id));
    }
  });
  insertMany();

  res.status(201).json({ batchId, generations: rows.map(serializeRow), creditsRemaining: deduction.newBalance });

  rows.forEach(row => broadcastToUser(req.user.id, { type: 'generation_updated', generation: serializeRow(row) }));

  const userId = req.user.id;
  const _traceId = requestContext.getStore()?.requestId;
  runDesignBatch(rows.map(r => r.id), { userId, mode, prompt: prompt.trim(), attachments, costPerImage, traceId: _traceId })
    .catch(err => {
      logger.error('design batch failed', { errorMessage: err.message, stack: err.stack?.split('\n').slice(0, 4).join('\n') });
    });
});

// ─── Async generation runner ────────────────────────────────────────────────
async function runDesignBatch(rowIds, { userId, mode, prompt, attachments, costPerImage, traceId }) {
  const db = getDb();
  const count = rowIds.length;

  let finalPrompts;
  if (mode === 'nova') {
    finalPrompts = await craftDesignPrompts(prompt, attachments, count, userId);
  } else {
    finalPrompts = Array.from({ length: count }, () => prompt);
  }

  for (let i = 0; i < rowIds.length; i++) {
    const id = rowIds[i];
    const finalPrompt = finalPrompts[i] || prompt;

    db.prepare(`UPDATE design_generations SET status = 'generating', final_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(finalPrompt, id);
    broadcastToUser(userId, { type: 'generation_updated', generation: serializeRow(db.prepare('SELECT * FROM design_generations WHERE id = ?').get(id)) });

    try {
      const imageData = await generateDesignImage(finalPrompt, attachments, DESIGN_ASPECT_RATIO, i);
      if (!imageData) throw new Error('Image generation failed');

      db.prepare(`UPDATE design_generations SET status = 'complete', image_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(imageData, id);
    } catch (err) {
      logger.error('design image generation failed', { id, errorMessage: err.message });
      db.prepare(`UPDATE design_generations SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run('Image generation failed. Your credits for this image have been refunded.', id);
      refundCredits(userId, costPerImage, 'design_generation_refund', 'Design image generation failed — refunded');
    }

    broadcastToUser(userId, { type: 'generation_updated', generation: serializeRow(db.prepare('SELECT * FROM design_generations WHERE id = ?').get(id)) });
  }
}

export default router;
