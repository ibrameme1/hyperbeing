import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { v4 as uuid } from 'uuid';
import { IMAGE_DIR } from './imageStore.js';
import { logger } from './logger.js';

// ─── Seedance video generation (BytePlus ModelArk) ─────────────────────────
// Async task API: POST /contents/generations/tasks → { id }, then poll
// GET /contents/generations/tasks/:id until succeeded | failed | expired. The
// finished task's `content.video_url` is a signed, short-lived provider URL, so
// we download the MP4 to our own volume immediately and serve it from there.
//
// Mock mode (ARK_API_KEY unset or "demo"): no network; a test-pattern clip is
// rendered with ffmpeg so the whole flow (gallery, player, download) works
// locally. Without ffmpeg the mock fails → normal error + refund path.

const ARK_BASE_URL = (process.env.ARK_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/$/, '');

export const VIDEO_MOCK_MODE = !process.env.ARK_API_KEY || process.env.ARK_API_KEY === 'demo';

// Our stable keys → provider model ids (dated, so overridable per env when
// BytePlus ships a new snapshot or the account uses endpoint ids "ep-…").
export const PROVIDER_MODEL_IDS = {
  'seedance-2.5': process.env.SEEDANCE_2_5_MODEL || 'dreamina-seedance-2-5-260628',
  'seedance-2.5-flash': process.env.SEEDANCE_2_5_FLASH_MODEL || 'dreamina-seedance-2-5-flash-261115',
  'seedance-2.0': process.env.SEEDANCE_2_0_MODEL || 'dreamina-seedance-2-0-260128',
  'seedance-2.0-fast': process.env.SEEDANCE_2_0_FAST_MODEL || 'dreamina-seedance-2-0-fast-260128',
  'seedance-2.0-mini': process.env.SEEDANCE_2_0_MINI_MODEL || 'dreamina-seedance-2-0-mini-260615',
};

// Videos live in a subfolder of the image volume. The orphan image sweep only
// looks at top-level files, so it never touches these.
export const VIDEO_DIR = path.join(IMAGE_DIR, 'videos');
const VIDEO_FILENAME_RE = /^[0-9a-f-]{36}\.mp4$/i;
const MAX_VIDEO_BYTES = 600 * 1024 * 1024; // 30s of 4K is well under this

const POLL_INTERVAL_MS = 5000;
// The task itself expires provider-side after this (min allowed: 1h); we stop
// polling a little later so an `expired` status is still observed.
const TASK_EXPIRES_AFTER_S = 3600;
const POLL_TIMEOUT_MS = (TASK_EXPIRES_AFTER_S + 300) * 1000;

// Provider failures we can explain to the user. Anything else gets the generic copy.
export class VideoGenerationError extends Error {
  constructor(message, { userMessage, code } = {}) {
    super(message);
    this.userMessage = userMessage;
    this.code = code;
  }
}

const SAFETY_COPY = "Seedance declined this request for content-safety reasons. Photos of real people's faces can't be animated, so try an illustration or a different reference. Your credits have been refunded.";

function friendlyError(code = '', message = '') {
  const text = `${code} ${message}`.toLowerCase();
  if (/sensitive|safety|risk|policy|real.?person|face|privacy|copyright/.test(text)) return SAFETY_COPY;
  if (/image|frame|ratio|resolution|pixel/.test(text) && /invalid|unsupported|size|must/.test(text)) {
    return "One of the images couldn't be used (each side must be 300–6000 px, aspect between 0.4 and 2.5). Your credits have been refunded.";
  }
  return null;
}

function authHeaders() {
  return { Authorization: `Bearer ${process.env.ARK_API_KEY}`, 'Content-Type': 'application/json' };
}

async function arkFetch(url, init, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
      // Retry provider overload / transient errors; 4xx (bad request, safety) are final.
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`seedance http ${res.status}`);
      } else {
        return res;
      }
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts) await new Promise(r => setTimeout(r, 1000 * 2 ** i));
  }
  throw lastErr;
}

// Builds the ModelArk `content` array. `images` are data URLs (validated by the
// route); imageRole decides first-frame / first+last / omni-reference mode,
// which the provider refuses to mix.
export function buildContent(prompt, images = [], imageRole = 'reference') {
  const content = [];
  if (prompt) content.push({ type: 'text', text: prompt });
  const usable = images.filter(Boolean);
  if (imageRole === 'first_frame' && usable[0]) {
    content.push({ type: 'image_url', image_url: { url: usable[0] }, role: 'first_frame' });
  } else if (imageRole === 'first_last' && usable.length >= 2) {
    content.push({ type: 'image_url', image_url: { url: usable[0] }, role: 'first_frame' });
    content.push({ type: 'image_url', image_url: { url: usable[1] }, role: 'last_frame' });
  } else {
    for (const url of usable) content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' });
  }
  return content;
}

// Submit a task; returns the provider task id. Throws VideoGenerationError.
export async function createVideoTask({ modelKey, prompt, images, imageRole, resolution, ratio, duration, audio, userId }) {
  if (VIDEO_MOCK_MODE) return `mock-${uuid()}`;

  const body = {
    model: PROVIDER_MODEL_IDS[modelKey],
    content: buildContent(prompt, images, imageRole),
    resolution,
    ratio,
    duration,
    generate_audio: !!audio,
    watermark: false,
    execution_expires_after: TASK_EXPIRES_AFTER_S,
    // Stable hashed end-user id — lets BytePlus attribute abuse to one user
    // instead of our whole account. Never the raw id.
    safety_identifier: crypto.createHash('sha256').update(`hb:${userId}`).digest('hex').slice(0, 64),
  };

  const res = await arkFetch(`${ARK_BASE_URL}/contents/generations/tasks`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.id) {
    const code = json?.error?.code || `http_${res.status}`;
    const message = json?.error?.message || 'task creation failed';
    throw new VideoGenerationError(`seedance create failed: ${code} ${message}`, { code, userMessage: friendlyError(code, message) });
  }
  return json.id;
}

export async function getVideoTask(taskId) {
  const res = await arkFetch(`${ARK_BASE_URL}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
    method: 'GET', headers: authHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = json?.error?.code || `http_${res.status}`;
    throw new VideoGenerationError(`seedance poll failed: ${code} ${json?.error?.message || ''}`, { code });
  }
  return json;
}

// Poll until the task finishes. Resolves with the succeeded task; throws on
// failed / expired / timeout. Network blips while polling are tolerated (the
// task keeps running provider-side) — only repeated failures give up.
export async function waitForVideoTask(taskId, { onStatus } = {}) {
  const started = Date.now();
  let consecutiveErrors = 0;
  let lastStatus = null;
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    let task;
    try {
      task = await getVideoTask(taskId);
      consecutiveErrors = 0;
    } catch (err) {
      if (++consecutiveErrors >= 10) throw err;
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }
    if (task.status !== lastStatus) {
      lastStatus = task.status;
      onStatus?.(task.status);
    }
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed' || task.status === 'expired' || task.status === 'cancelled') {
      const code = task.error?.code || task.status;
      const message = task.error?.message || '';
      throw new VideoGenerationError(`seedance task ${task.status}: ${code} ${message}`, { code, userMessage: friendlyError(code, message) });
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new VideoGenerationError('seedance task timed out', { code: 'timeout' });
}

function ensureVideoDir() {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
}

// Streams the provider's MP4 to disk; returns our filename.
export async function downloadVideo(url) {
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    throw new VideoGenerationError('seedance returned no usable video url', { code: 'no_video' });
  }
  ensureVideoDir();
  const filename = `${uuid()}.mp4`;
  const dest = path.join(VIDEO_DIR, filename);
  const res = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) });
  if (!res.ok || !res.body) throw new VideoGenerationError(`video download failed: http ${res.status}`, { code: 'download_failed' });
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_VIDEO_BYTES) throw new VideoGenerationError('video too large', { code: 'too_large' });

  let bytes = 0;
  const counter = new TransformStream({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > MAX_VIDEO_BYTES) controller.error(new Error('video too large'));
      else controller.enqueue(chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body.pipeThrough(counter)), fs.createWriteStream(dest));
  } catch (err) {
    fs.rmSync(dest, { force: true });
    throw new VideoGenerationError(`video download failed: ${err.message}`, { code: 'download_failed' });
  }
  return filename;
}

// Approximate pixel size per resolution/ratio (only used by mock mode).
const MOCK_SIZE = {
  '480p': { '16:9': [864, 480], '9:16': [480, 864], '1:1': [640, 640], '4:3': [736, 544], '3:4': [544, 736], '21:9': [960, 416] },
  '720p': { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [960, 960], '4:3': [1104, 832], '3:4': [832, 1104], '21:9': [1472, 624] },
  '1080p': { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1440, 1440], '4:3': [1664, 1248], '3:4': [1248, 1664], '21:9': [2208, 944] },
};

// Mock mode: render a labelled test pattern (+ tone when audio is on).
export async function renderMockVideo({ resolution, ratio, duration, audio }) {
  ensureVideoDir();
  const [w, h] = (MOCK_SIZE[resolution] || MOCK_SIZE['720p'])[ratio] || MOCK_SIZE['720p']['16:9'];
  const filename = `${uuid()}.mp4`;
  const dest = path.join(VIDEO_DIR, filename);
  const args = ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${w}x${h}:rate=24`];
  if (audio) args.push('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100');
  args.push('-t', String(duration), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
  if (audio) args.push('-c:a', 'aac', '-shortest');
  args.push(dest);
  await new Promise((resolve, reject) => {
    execFile(process.env.FFMPEG_PATH || 'ffmpeg', args, { timeout: 120_000 }, (err) => (err ? reject(err) : resolve()));
  }).catch((err) => {
    fs.rmSync(dest, { force: true });
    logger.warn('mock video render failed (is ffmpeg installed?)', { errorMessage: err.message });
    throw new VideoGenerationError('mock video render failed', { code: 'mock_failed' });
  });
  return filename;
}

export function videoPathFor(filename) {
  if (typeof filename !== 'string' || !VIDEO_FILENAME_RE.test(filename)) return null;
  const p = path.join(VIDEO_DIR, path.basename(filename));
  return fs.existsSync(p) ? p : null;
}

export function removeVideo(filename) {
  const p = videoPathFor(filename);
  if (p) fs.rmSync(p, { force: true });
}
