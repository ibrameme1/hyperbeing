import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { DATA_DIR } from '../database.js';
import { logger } from './logger.js';

// On-disk store for pre-built .pptx exports, mirroring imageStore.js. The decks
// are rebuilt from the slide images whenever they go stale, so this directory is
// a cache: losing it costs one rebuild, never any user data. Point
// EXPORT_STORAGE_DIR at the persistent volume in production so a redeploy
// doesn't make every user's first export slow.
export const EXPORT_DIR = process.env.EXPORT_STORAGE_DIR || path.join(DATA_DIR, 'exports');

let ready = false;
function ensureDir() {
  if (ready) return;
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  ready = true;
}

// Only our own generated names — a uuid plus .pptx. Anything else is refused
// before it can reach the filesystem.
const FILENAME_RE = /^[0-9a-f-]{36}\.pptx$/i;

export function isStoredFilename(name) {
  return typeof name === 'string' && FILENAME_RE.test(name);
}

export function save(buffer) {
  try {
    ensureDir();
    const filename = `${uuid()}.pptx`;
    fs.writeFileSync(path.join(EXPORT_DIR, filename), buffer);
    return filename;
  } catch (err) {
    logger.error('pptx store write failed', { errorMessage: err.message });
    return null;
  }
}

export function pathFor(filename) {
  if (!isStoredFilename(filename)) return null;
  const p = path.join(EXPORT_DIR, path.basename(filename));
  return fs.existsSync(p) ? p : null;
}

export function remove(filename) {
  if (!isStoredFilename(filename)) return;
  try {
    const p = path.join(EXPORT_DIR, path.basename(filename));
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (err) {
    logger.warn('pptx store delete failed', { filename, errorMessage: err.message });
  }
}
