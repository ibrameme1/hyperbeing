import { Router } from 'express';
import { withCostContext } from '../services/aiCosts.js';

// Attributes AI calls made for this request to the user (ai_costs).
const costScope = (operation) => (req, res, next) => withCostContext({ userId: req.user?.id, operation }, next);
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
import {
  DESIGN_MAX_PARALLEL_GENERATIONS, DESIGN_MAX_IMAGES_PER_BATCH,
  DESIGN_VIDEO_MODELS, DESIGN_VIDEO_DEFAULT_MODEL, DESIGN_VIDEO_RATIOS, DESIGN_VIDEO_IMAGE_ROLES,
  DESIGN_MAX_PARALLEL_VIDEOS, videoCreditCost,
} from '../config/credits.js';
import {
  VIDEO_MOCK_MODE, PROVIDER_MODEL_IDS, createVideoTask, waitForVideoTask, downloadVideo,
  renderMockVideo, videoPathFor,
} from '../services/seedanceVideo.js';
import { recordVideoCall } from '../services/aiCosts.js';
import { validateAttachments as validateAttachmentsShared } from '../middleware/attachments.js';
import { logger, requestContext } from '../services/logger.js';

const router = Router();

const DESIGN_ASPECT_RATIO = '16:9';
const DESIGN_QUALITY = 'medium';
const DESIGN_RESOLUTION = '1k';

// Shared attachment validation — Design Mode allows up to 4 reference images.
const validateAttachments = (attachments) => validateAttachmentsShared(attachments, 4, 'reference images');

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
  const { external_task_id: _taskId, video_file: videoFile, ...rest } = row;
  return {
    ...rest,
    kind: row.kind || 'image',
    reference_images: safeJsonParse(row.reference_images, []),
    settings: safeJsonParse(row.settings, {}),
    // Authed path; the frontend's mediaUrl() appends ?token= for <video>.
    video_url: videoFile ? `/api/design/${row.id}/video` : null,
  };
}

// Images and videos have separate in-flight caps (videos run for minutes and
// must not block quick image batches, and vice versa).
function inFlightCount(db, userId, kind) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM design_generations WHERE user_id = ? AND status IN ('pending','generating') AND COALESCE(kind, 'image') = ?")
    .get(userId, kind).n;
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
router.post('/generate', authenticateToken, costScope('design_mode'), designGenerationLimiter, (req, res) => {
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
  const inFlight = inFlightCount(db, req.user.id, 'image');
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

// ─── POST /api/design/:id/retry — retry a single failed generation ────────
// Re-sends the same final prompt + reference images that were used originally.
router.post('/:id/retry', authenticateToken, costScope('design_mode'), designGenerationLimiter, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM design_generations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Generation not found' });
  if (row.status !== 'error') return res.status(400).json({ error: 'Only failed generations can be retried' });
  if (row.kind === 'video') return retryVideo(req, res, row);

  // Retries count against the same parallel-generation cap as fresh batches.
  const inFlight = inFlightCount(db, req.user.id, 'image');
  if (inFlight + 1 > DESIGN_MAX_PARALLEL_GENERATIONS) {
    return res.status(429).json({
      error: `You can have at most ${DESIGN_MAX_PARALLEL_GENERATIONS} images generating at once. Wait for some to finish before retrying.`,
      code: 'TOO_MANY_PARALLEL_GENERATIONS',
    });
  }

  const costPerImage = row.mode === 'own' ? CREDIT_COSTS.DESIGN_IMAGE_OWN_PROMPT : CREDIT_COSTS.DESIGN_IMAGE_NOVA_PROMPT;

  let deduction;
  try {
    deduction = deductCredits(req.user.id, costPerImage, 'design_generation', `Design mode retry (${row.mode === 'nova' ? 'Nova-crafted prompt' : 'your prompt'})`);
  } catch (err) {
    if (err.message === 'INSUFFICIENT_CREDITS') {
      const sub = getOrCreateSubscription(req.user.id);
      return res.status(402).json(novaInsufficientCredits({
        creditsRemaining: sub.credits_remaining,
        creditsNeeded: costPerImage,
        actionType: 'design_generation',
        currentPlan: sub.plan,
      }));
    }
    throw err;
  }

  db.prepare(`UPDATE design_generations SET status = 'pending', error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(row.id);
  const updated = db.prepare('SELECT * FROM design_generations WHERE id = ?').get(row.id);

  res.json({ generation: serializeRow(updated), creditsRemaining: deduction.newBalance });
  broadcastToUser(req.user.id, { type: 'generation_updated', generation: serializeRow(updated) });

  const attachments = safeJsonParse(row.reference_images, []);
  const finalPrompt = row.final_prompt || row.user_prompt;
  const userId = req.user.id;
  const traceId = requestContext.getStore()?.requestId;

  generateAndStore(row.id, { userId, mode: row.mode, finalPrompt, attachments, costPerImage, traceId, index: 0 })
    .catch(err => {
      logger.error('design retry failed', { id: row.id, userId, errorMessage: err.message, stack: err.stack?.split('\n').slice(0, 4).join('\n') });
    });
});

// ─── Shared single-image generation + persistence ──────────────────────────
async function generateAndStore(id, { userId, mode, finalPrompt, attachments, costPerImage, traceId, index }) {
  const db = getDb();

  db.prepare(`UPDATE design_generations SET status = 'generating', final_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(finalPrompt, id);
  broadcastToUser(userId, { type: 'generation_updated', generation: serializeRow(db.prepare('SELECT * FROM design_generations WHERE id = ?').get(id)) });

  try {
    const imageData = await generateDesignImage(finalPrompt, attachments, DESIGN_ASPECT_RATIO, index);
    if (!imageData) throw new Error('Image generation failed');

    db.prepare(`UPDATE design_generations SET status = 'complete', image_data = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(imageData, id);
  } catch (err) {
    logger.error('design image generation failed', {
      id, userId, mode, traceId, errorMessage: err.message,
      promptPreview: (finalPrompt || '').slice(0, 200), attachmentCount: attachments.length,
    });
    db.prepare(`UPDATE design_generations SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run('Image generation failed. Your credits for this image have been refunded.', id);
    refundCredits(userId, costPerImage, 'design_generation_refund', 'Design image generation failed — refunded');
  }

  broadcastToUser(userId, { type: 'generation_updated', generation: serializeRow(db.prepare('SELECT * FROM design_generations WHERE id = ?').get(id)) });
}

// ─── Async generation runner for a fresh batch ─────────────────────────────
async function runDesignBatch(rowIds, { userId, mode, prompt, attachments, costPerImage, traceId }) {
  const count = rowIds.length;

  let finalPrompts;
  if (mode === 'nova') {
    finalPrompts = await craftDesignPrompts(prompt, attachments, count, userId);
  } else {
    finalPrompts = Array.from({ length: count }, () => prompt);
  }

  for (let i = 0; i < rowIds.length; i++) {
    const finalPrompt = finalPrompts[i] || prompt;
    await generateAndStore(rowIds[i], { userId, mode, finalPrompt, attachments, costPerImage, traceId, index: i });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Video (Seedance) — one clip per request, billed per second of output.
// ════════════════════════════════════════════════════════════════════════════

// ─── GET /api/design/video/options — model catalog for the composer ───────
// Served from config/credits.js so the UI's sliders and price estimate can
// never drift from what the backend actually charges.
router.get('/video/options', authenticateToken, (req, res) => {
  res.json({
    defaultModel: DESIGN_VIDEO_DEFAULT_MODEL,
    ratios: DESIGN_VIDEO_RATIOS,
    imageRoles: DESIGN_VIDEO_IMAGE_ROLES,
    maxParallel: DESIGN_MAX_PARALLEL_VIDEOS,
    mock: VIDEO_MOCK_MODE,
    models: Object.entries(DESIGN_VIDEO_MODELS).map(([key, m]) => ({
      key,
      label: m.label,
      description: m.description,
      resolutions: Object.keys(m.creditsPerSecond),
      creditsPerSecond: m.creditsPerSecond,
      minDuration: m.minDuration,
      maxDuration: m.maxDuration,
      maxReferenceImages: m.maxReferenceImages,
    })),
  });
});

// Validates a video request body → { settings, images } or { error }.
function parseVideoRequest(body) {
  const {
    prompt = '', attachments = [], model = DESIGN_VIDEO_DEFAULT_MODEL,
    resolution = '720p', ratio = '16:9', duration = 5, audio = true, imageRole = 'reference',
  } = body || {};

  if (typeof prompt !== 'string') return { error: 'Prompt must be a string' };
  if (!prompt.trim() && attachments.length === 0) return { error: 'Describe the video you want, or attach an image to animate.' };
  // Seedance reads ~1,000 English words; past that it truncates silently.
  if (prompt.length > 4000) return { error: 'Prompt too long for video (max 4,000 characters).' };

  const spec = DESIGN_VIDEO_MODELS[model];
  if (!spec) return { error: 'Unknown video model.' };
  if (!spec.creditsPerSecond[resolution]) {
    return { error: `${spec.label} supports ${Object.keys(spec.creditsPerSecond).join(', ')}.` };
  }
  if (!DESIGN_VIDEO_RATIOS.includes(ratio)) return { error: 'Unsupported aspect ratio.' };
  const seconds = Number(duration);
  if (!Number.isInteger(seconds) || seconds < spec.minDuration || seconds > spec.maxDuration) {
    return { error: `${spec.label} clips must be ${spec.minDuration}–${spec.maxDuration} seconds.` };
  }
  if (!DESIGN_VIDEO_IMAGE_ROLES.includes(imageRole)) return { error: 'Unknown image mode.' };
  if (typeof audio !== 'boolean') return { error: 'audio must be true or false' };

  const attachmentsErr = validateAttachmentsShared(attachments, spec.maxReferenceImages, 'reference images');
  if (attachmentsErr) return { error: attachmentsErr };
  if (imageRole === 'first_frame' && attachments.length !== 1) return { error: 'Attach exactly one image to use as the first frame.' };
  if (imageRole === 'first_last' && attachments.length !== 2) return { error: 'Attach exactly two images: the first frame, then the last frame.' };
  // "adaptive" takes the ratio from the input image, so it needs one.
  if (ratio === 'adaptive' && attachments.length === 0) return { error: 'Adaptive ratio needs an image to take its shape from.' };

  return {
    prompt: prompt.trim(),
    attachments,
    settings: {
      model, resolution, ratio, duration: seconds, audio,
      imageRole: attachments.length ? imageRole : null,
      aspectRatio: ratio === 'adaptive' ? null : ratio,
    },
  };
}

function chargeVideo(req, res, cost, description) {
  try {
    return deductCredits(req.user.id, cost, 'design_video', description);
  } catch (err) {
    if (err.message === 'INSUFFICIENT_CREDITS') {
      const sub = getOrCreateSubscription(req.user.id);
      res.status(402).json(novaInsufficientCredits({
        creditsRemaining: sub.credits_remaining,
        creditsNeeded: cost,
        actionType: 'design_video',
        currentPlan: sub.plan,
      }));
      return null;
    }
    throw err;
  }
}

function videoDescription(s) {
  return `Design mode video: ${DESIGN_VIDEO_MODELS[s.model]?.label || s.model}, ${s.duration}s ${s.resolution}${s.audio ? ' with sound' : ''}`;
}

// ─── POST /api/design/video/generate — start one video clip ───────────────
router.post('/video/generate', authenticateToken, costScope('design_video'), designGenerationLimiter, (req, res) => {
  const parsed = parseVideoRequest(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { prompt, attachments, settings } = parsed;

  const db = getDb();
  if (inFlightCount(db, req.user.id, 'video') + 1 > DESIGN_MAX_PARALLEL_VIDEOS) {
    return res.status(429).json({
      error: `You can have at most ${DESIGN_MAX_PARALLEL_VIDEOS} videos generating at once. Wait for one to finish before starting another.`,
      code: 'TOO_MANY_PARALLEL_GENERATIONS',
    });
  }

  const cost = videoCreditCost(settings.model, settings.resolution, settings.duration);
  const deduction = chargeVideo(req, res, cost, videoDescription(settings));
  if (!deduction) return;

  const id = uuid();
  db.prepare(
    `INSERT INTO design_generations (id, user_id, batch_id, status, mode, user_prompt, final_prompt, reference_images, settings, kind, credits_charged)
     VALUES (?, ?, ?, 'pending', 'own', ?, ?, ?, ?, 'video', ?)`
  ).run(id, req.user.id, uuid(), prompt, prompt, JSON.stringify(attachments), JSON.stringify(settings), cost);
  const row = db.prepare('SELECT * FROM design_generations WHERE id = ?').get(id);

  res.status(201).json({ generation: serializeRow(row), creditsRemaining: deduction.newBalance });
  broadcastToUser(req.user.id, { type: 'generation_updated', generation: serializeRow(row) });

  runVideoJob(id).catch(err => logger.error('design video job crashed', { id, errorMessage: err.message }));
});

// Retry of a failed clip: same prompt/settings/images, charged again at the
// CURRENT price (the failed attempt was refunded in full).
function retryVideo(req, res, row) {
  const db = getDb();
  const settings = safeJsonParse(row.settings, {});
  const cost = videoCreditCost(settings.model, settings.resolution, settings.duration);
  if (!cost) return res.status(400).json({ error: 'This video model is no longer available. Start a new video instead.' });

  if (inFlightCount(db, req.user.id, 'video') + 1 > DESIGN_MAX_PARALLEL_VIDEOS) {
    return res.status(429).json({
      error: `You can have at most ${DESIGN_MAX_PARALLEL_VIDEOS} videos generating at once. Wait for one to finish before retrying.`,
      code: 'TOO_MANY_PARALLEL_GENERATIONS',
    });
  }

  const deduction = chargeVideo(req, res, cost, `${videoDescription(settings)} (retry)`);
  if (!deduction) return;

  // The old task id belongs to the failed attempt — clear it so a new task is created.
  db.prepare(`UPDATE design_generations SET status = 'pending', error_message = NULL, external_task_id = NULL, credits_charged = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(cost, row.id);
  const updated = db.prepare('SELECT * FROM design_generations WHERE id = ?').get(row.id);
  res.json({ generation: serializeRow(updated), creditsRemaining: deduction.newBalance });
  broadcastToUser(req.user.id, { type: 'generation_updated', generation: serializeRow(updated) });

  runVideoJob(row.id).catch(err => logger.error('design video retry crashed', { id: row.id, errorMessage: err.message }));
}

// Runs (or resumes) one clip. Resuming = the row already has a provider task
// id: we only poll + download, so a restart never pays BytePlus twice.
async function runVideoJob(id) {
  const db = getDb();
  const load = () => db.prepare('SELECT * FROM design_generations WHERE id = ?').get(id);
  const row = load();
  if (!row) return;
  const userId = row.user_id;
  const settings = safeJsonParse(row.settings, {});
  const images = safeJsonParse(row.reference_images, []).map(a => a?.data).filter(Boolean);
  const started = Date.now();

  db.prepare(`UPDATE design_generations SET status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  broadcastToUser(userId, { type: 'generation_updated', generation: serializeRow(load()) });

  try {
    let videoFile;
    if (VIDEO_MOCK_MODE) {
      await new Promise(r => setTimeout(r, 1500));
      videoFile = await renderMockVideo(settings);
    } else {
      let taskId = row.external_task_id;
      if (!taskId) {
        taskId = await createVideoTask({
          modelKey: settings.model, prompt: row.final_prompt || row.user_prompt, images,
          imageRole: settings.imageRole, resolution: settings.resolution, ratio: settings.ratio,
          duration: settings.duration, audio: settings.audio, userId,
        });
        // Persist BEFORE polling — this is what makes the job resumable.
        db.prepare('UPDATE design_generations SET external_task_id = ? WHERE id = ?').run(taskId, id);
      }
      const task = await waitForVideoTask(taskId);
      recordVideoCall({
        modelKey: settings.model, providerModel: PROVIDER_MODEL_IDS[settings.model], resolution: settings.resolution,
        usage: task.usage, durationMs: Date.now() - started, userId, operation: 'design_video',
        meta: { generationId: id, seconds: settings.duration, audio: settings.audio, taskId },
      });
      videoFile = await downloadVideo(task.content?.video_url);
    }

    // Only finish a row that is still ours to finish.
    const result = db.prepare(
      `UPDATE design_generations SET status = 'complete', video_file = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'generating'`
    ).run(videoFile, id);
    if (result.changes === 0) {
      logger.warn('design video finished for a row no longer generating — discarded', { id });
      return;
    }
    logger.info('design video complete', { id, userId, model: settings.model, seconds: settings.duration, ms: Date.now() - started });
  } catch (err) {
    logger.error('design video generation failed', {
      id, userId, model: settings.model, code: err.code, errorMessage: err.message,
    });
    const result = db.prepare(
      `UPDATE design_generations SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'generating'`
    ).run(err.userMessage || 'Video generation failed. Your credits for this video have been refunded.', id);
    // Refund exactly what this attempt charged, and only once (the guarded
    // UPDATE above is the "we own this failure" check).
    if (result.changes > 0 && row.credits_charged > 0) {
      refundCredits(userId, row.credits_charged, 'design_video_refund', 'Design video generation failed — refunded', null, { generationId: id });
    }
  }

  broadcastToUser(userId, { type: 'generation_updated', generation: serializeRow(load()) });
}

// Called once at boot (after sweepStaleWork): picks up clips whose provider
// task was already submitted when the process died.
export function resumeVideoJobs() {
  const rows = getDb()
    .prepare("SELECT id FROM design_generations WHERE kind = 'video' AND status IN ('pending','generating') AND external_task_id IS NOT NULL")
    .all();
  for (const { id } of rows) {
    logger.info('resuming design video job', { id });
    runVideoJob(id).catch(err => logger.error('design video resume crashed', { id, errorMessage: err.message }));
  }
}

// ─── GET /api/design/:id/video — stream the MP4 (Range supported) ─────────
// Auth via ?token= like the SSE route: <video src> can't send headers.
router.get('/:id/video', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).end();
  let userId;
  try {
    ({ userId } = jwt.verify(token, process.env.JWT_SECRET));
  } catch {
    return res.status(401).end();
  }
  const row = getDb().prepare('SELECT video_file FROM design_generations WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  const file = row && videoPathFor(row.video_file);
  if (!file) return res.status(404).json({ error: 'Video not found' });

  res.setHeader('Cache-Control', 'private, max-age=86400');
  if (req.query.download) res.attachment(`hyperbeing-video-${req.params.id.slice(0, 8)}.mp4`);
  res.sendFile(file, { headers: { 'Content-Type': 'video/mp4' } });
});

export default router;
