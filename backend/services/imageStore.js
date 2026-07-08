import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { DATA_DIR } from '../database.js';
import { logger } from './logger.js';

// On-disk store for slide images (GAPS #7). Real generated images are written
// here — to the persistent volume in production — and referenced by filename
// from the DB, instead of living as multi-MB base64 strings inside the
// presentations row. Set IMAGE_STORAGE_DIR to the volume mount path in prod
// (e.g. /data/images); locally it defaults next to the SQLite file.
export const IMAGE_DIR = process.env.IMAGE_STORAGE_DIR || path.join(DATA_DIR, 'images');

let ready = false;
function ensureDir() {
  if (ready) return;
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  ready = true;
}

const EXT_FOR_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' };
const MIME_FOR_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

// Only accept our own generated filenames — a uuid plus a known extension.
// Anything else (path traversal, unknown types) is refused.
const FILENAME_RE = /^[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$/i;

// Writes a base64 image data URL to disk and returns its filename, or null if
// the input isn't a raster data URL we should persist (svg placeholders, nulls,
// already-stored URLs). Callers keep the original value inline when null is
// returned — that's how svg placeholders stay embedded and keep the
// isPlaceholderImage() checks working.
export function saveDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const ext = EXT_FOR_MIME[m[1].toLowerCase()];
  if (!ext) return null; // svg / unknown → keep inline
  try {
    ensureDir();
    const filename = `${uuid()}.${ext}`;
    fs.writeFileSync(path.join(IMAGE_DIR, filename), Buffer.from(m[2], 'base64'));
    return filename;
  } catch (err) {
    // Disk failure must never lose the image — caller falls back to inline base64.
    logger.error('image store write failed', { errorMessage: err.message });
    return null;
  }
}

export function isStoredFilename(name) {
  return typeof name === 'string' && FILENAME_RE.test(name);
}

// Absolute path for a stored file, or null if the name is malformed. Uses
// basename to defeat any traversal attempt before it reaches the filesystem.
export function pathFor(filename) {
  if (!isStoredFilename(filename)) return null;
  const p = path.join(IMAGE_DIR, path.basename(filename));
  return fs.existsSync(p) ? p : null;
}

export function mimeFor(filename) {
  const ext = path.extname(filename || '').slice(1).toLowerCase();
  return MIME_FOR_EXT[ext] || 'application/octet-stream';
}

// Reads a stored file back into a base64 data URL (used by PDF export and the
// one-time migration). Returns null if the file is gone.
export function toDataUrl(filename) {
  const p = pathFor(filename);
  if (!p) return null;
  try {
    return `data:${mimeFor(filename)};base64,${fs.readFileSync(p).toString('base64')}`;
  } catch {
    return null;
  }
}

// Best-effort delete — never throws. Used when a slide/presentation is removed
// or an old version is pruned.
export function remove(filename) {
  if (!isStoredFilename(filename)) return;
  try {
    const p = path.join(IMAGE_DIR, path.basename(filename));
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (err) {
    logger.warn('image store delete failed', { filename, errorMessage: err.message });
  }
}
