import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { getDb } from '../database.js';
import { IMAGE_DIR } from './imageStore.js';
import { logger } from './logger.js';
import { ingestDocumentBuffer } from './fileIngest.js';

// ─── Asset library ──────────────────────────────────────────────────────────
// Every non-image file a user attaches (to a brief, an add-slides request or a
// slide edit) becomes an ASSET: validated + extracted once at upload
// (fileIngest.js), raw bytes kept on disk so Claude can read the file again
// later (a PDF in full, a sheet's rows) when the user adds slides or edits.
// Files are uploaded to the server ONCE; every later step refers to them by id.
//
// The raw bytes live in a subdirectory of the image volume (persistent in
// prod); the image orphan sweep only looks at plain files at the top level of
// IMAGE_DIR, so it never touches them. Filenames are our own uuids — never the
// user's name — and are only ever served as downloads (see routes/assets.js).

export const ASSET_DIR = path.join(IMAGE_DIR, 'assets');
const FILE_RE = /^[0-9a-f-]{36}\.bin$/;
const UNATTACHED_TTL_MS = 24 * 60 * 60 * 1000;

function ensureDir() { fs.mkdirSync(ASSET_DIR, { recursive: true }); }
export function assetPath(file) { return FILE_RE.test(file || '') ? path.join(ASSET_DIR, file) : null; }

/** Ingests + stores one uploaded file. Throws FileRejected (user-facing) on bad input. */
export async function createAsset({ userId, name, buf, category = 'auto', presentationId = null }) {
  const r = await ingestDocumentBuffer(name, buf, category === 'inspiration' ? 'inspiration' : 'auto');
  ensureDir();
  const id = uuid();
  const file = `${uuid()}.bin`;
  fs.writeFileSync(path.join(ASSET_DIR, file), buf);
  // extracted = what later steps need without re-parsing: the document
  // description (digest, deck structure, tables for the fallback analysis) and
  // the re-encoded pictures pulled out of it.
  const extracted = { doc: r.doc, images: r.images };
  getDb().prepare(
    'INSERT INTO assets (id, user_id, presentation_id, name, kind, purpose, size, file, extracted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, userId, presentationId, r.doc.name, r.doc.kind, r.doc.purpose, buf.length, file, JSON.stringify(extracted));
  logger.info('asset stored', { assetId: id, kind: r.doc.kind, size: buf.length, images: r.images.length });
  return describe(getDb().prepare('SELECT * FROM assets WHERE id = ?').get(id));
}

/** Public shape (no bytes, no digest). */
export function describe(row) {
  let meta = {};
  try { meta = JSON.parse(row.extracted || '{}').doc?.meta || {}; } catch { /* bad json */ }
  return {
    id: row.id, name: row.name, kind: row.kind, purpose: row.purpose, size: row.size,
    presentation_id: row.presentation_id, created_at: row.created_at,
    meta: { pages: meta.pages ?? undefined, slides: meta.slides ?? undefined, sheets: meta.sheets?.length ?? undefined },
  };
}

/**
 * The user's assets with these ids, in the given order. `presentationId`:
 * undefined = any of the user's assets; null = only unattached ones (a brief
 * being written); a deck id = only that deck's library. Unknown ids are dropped.
 */
export function loadAssets(userId, ids = [], { presentationId } = {}) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const db = getDb();
  const out = [];
  for (const id of [...new Set(ids.map(String))].slice(0, 20)) {
    const row = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(id, userId);
    if (!row) continue;
    if (presentationId === null && row.presentation_id) continue;
    if (presentationId && row.presentation_id !== presentationId) continue;
    out.push(row);
  }
  return out;
}

export function deckAssets(presentationId) {
  return getDb().prepare('SELECT * FROM assets WHERE presentation_id = ? ORDER BY created_at ASC').all(presentationId);
}

export function attachAssets(ids, presentationId) {
  const stmt = getDb().prepare('UPDATE assets SET presentation_id = ? WHERE id = ? AND presentation_id IS NULL');
  for (const id of ids) stmt.run(presentationId, id);
}

/** { doc (with tables), images, pdf? } for analysis — re-reads the PDF bytes from disk. */
export function assetMaterial(row) {
  let extracted = {};
  try { extracted = JSON.parse(row.extracted || '{}'); } catch { /* bad json */ }
  const doc = { ...(extracted.doc || { name: row.name, kind: row.kind, digest: '' }), asset_id: row.id, purpose: row.purpose };
  let pdf = null;
  if (row.kind === 'pdf') {
    const p = assetPath(row.file);
    try { if (p) pdf = { name: row.name, data: fs.readFileSync(p).toString('base64') }; } catch (err) {
      logger.warn('asset pdf missing on disk', { assetId: row.id, errorMessage: err.message });
    }
  }
  return { doc, images: extracted.images || [], pdf };
}

export function deleteAsset(row) {
  getDb().prepare('DELETE FROM assets WHERE id = ?').run(row.id);
  const p = assetPath(row.file);
  if (p) { try { fs.unlinkSync(p); } catch { /* already gone */ } }
}

/** Deletes every asset of a deck (deck deletion). */
export function deleteDeckAssets(presentationId) {
  for (const row of deckAssets(presentationId)) deleteAsset(row);
}

// Files uploaded for a brief that was never submitted.
export function sweepUnattachedAssets() {
  try {
    const cutoff = new Date(Date.now() - UNATTACHED_TTL_MS).toISOString().replace('T', ' ').slice(0, 19);
    const rows = getDb().prepare('SELECT * FROM assets WHERE presentation_id IS NULL AND created_at < ?').all(cutoff);
    for (const row of rows) deleteAsset(row);
    getDb().prepare('DELETE FROM source_analyses WHERE created_at < ?').run(cutoff);
    if (rows.length) logger.info('swept unattached assets', { deleted: rows.length });
  } catch (err) {
    logger.error('asset sweep failed', { errorMessage: err.message });
  }
}
