// Pre-builds the editable .pptx for a finished deck, so "Export to PPTX" is a
// file download and not a conversion.
//
// The conversion itself is the img2pptx method (backend/tools/img2pptx/): measure
// each slide render with a Claude vision call, erase the measured regions out of
// the raster, rebuild them as live PowerPoint objects. That costs ~10-20s per
// slide, which is why it runs in the background the moment a presentation
// finishes generating rather than when the user clicks Export.
//
// Two guarantees hold the feature together:
//   1. Export never waits on the pipeline. If the pre-built deck isn't ready,
//      the route serves a flat image deck (~1s) instead of blocking.
//   2. Measurements are cached per slide IMAGE, not per presentation — editing
//      one slide re-measures that slide only, and every other slide is reused.
import crypto from 'crypto';
import fs from 'fs';
import { getDb } from '../../database.js';
import * as imageStore from '../imageStore.js';
import * as pptxStore from '../pptxStore.js';
import { logger } from '../logger.js';
import { analyzeSlide, analyzerAvailable } from './analyzer.js';
import { buildDeck } from './builder.js';
import { imageInfo } from './plate.js';
import { normalizeSpec } from './spec.js';

// How many slides are measured concurrently. Vision calls are the whole cost of
// a build; four at a time keeps a 10-slide deck inside a minute without making
// the Anthropic account's rate limit the bottleneck for everything else.
const ANALYZE_CONCURRENCY = 4;

// Builds in flight, presentationId → Promise. Single-process deployment, same as
// the SSE registries and rate limiters.
const inFlight = new Map();

export const PPTX_STATUS = {
  NONE: 'none',
  BUILDING: 'building',
  READY: 'ready',
  FAILED: 'failed',
};

// A slide contributes to the deck when it actually has a stored render. Locked
// (paywalled) and errored slides have no image and are simply not exported —
// the same slides the PDF export skips.
function exportableSlides(slidesData) {
  return slidesData
    .filter(s => s.status !== 'locked' && imageStore.isStoredFilename(s.image_file))
    .sort((a, b) => a.index - b.index);
}

// What the built deck was built from. Changes when a slide is added, deleted,
// reordered, edited, regenerated or restored — i.e. exactly when the .pptx needs
// rebuilding, and never otherwise.
export function deckSignature(slidesData) {
  const parts = exportableSlides(slidesData).map(s => `${s.index}:${s.image_file}`);
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
}

function readPresentation(db, presentationId) {
  const row = db.prepare(
    'SELECT id, user_id, title, slides_data, pptx_file, pptx_status, pptx_signature, pptx_meta FROM presentations WHERE id = ?'
  ).get(presentationId);
  if (!row) return null;
  let slides = [];
  try { slides = JSON.parse(row.slides_data || '[]'); } catch {}
  let meta = {};
  try { meta = JSON.parse(row.pptx_meta || '{}'); } catch {}
  return { ...row, slides, meta };
}

/**
 * Current export state for a presentation, as the frontend sees it.
 * `stale` means a deck exists but the slides moved on since it was built.
 *
 * Pass `watermark` (the mark the CURRENT owner's plan calls for) to also treat a
 * deck built under the other plan as stale — otherwise someone who upgrades
 * keeps downloading the watermarked file they were built while on free.
 */
export function getDeckStatus(presentationId, { watermark = null } = {}) {
  const db = getDb();
  const pres = readPresentation(db, presentationId);
  if (!pres) return null;

  const signature = deckSignature(pres.slides);
  const slideCount = exportableSlides(pres.slides).length;
  const file = pptxStore.pathFor(pres.pptx_file) ? pres.pptx_file : null;
  const fresh = !!file && pres.pptx_signature === signature
    && (watermark === null || !!pres.meta.watermark === !!watermark);
  const building = inFlight.has(presentationId) || pres.pptx_status === PPTX_STATUS.BUILDING;

  return {
    status: fresh ? PPTX_STATUS.READY : (building ? PPTX_STATUS.BUILDING : (pres.pptx_status === PPTX_STATUS.FAILED ? PPTX_STATUS.FAILED : PPTX_STATUS.NONE)),
    stale: !!file && !fresh,
    editable: fresh ? !!pres.meta.editable_slides : false,
    editable_slides: fresh ? (pres.meta.editable_slides || 0) : 0,
    total_slides: fresh ? (pres.meta.total_slides || slideCount) : slideCount,
    exportable_slides: slideCount,
    built_at: fresh ? pres.meta.built_at || null : null,
  };
}

// ── Per-slide measurement cache ──────────────────────────────────────────────
// Keyed by the slide's image filename: a new render is a new key, so an edited
// slide re-measures and every untouched slide is a cache hit. Rows are cleaned
// up with the presentation.

function readCachedSpec(db, imageFile) {
  const row = db.prepare('SELECT spec FROM slide_pptx_specs WHERE image_file = ?').get(imageFile);
  if (!row) return undefined;
  if (row.spec === null || row.spec === '') return null; // measured, nothing usable — don't retry
  try { return JSON.parse(row.spec); } catch { return undefined; }
}

function writeCachedSpec(db, presentationId, slideIndex, imageFile, spec) {
  db.prepare(
    `INSERT INTO slide_pptx_specs (image_file, presentation_id, slide_index, spec)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(image_file) DO UPDATE SET spec = excluded.spec, slide_index = excluded.slide_index`
  ).run(imageFile, presentationId, slideIndex, spec ? JSON.stringify(spec) : '');
}

// Drops cached measurements for images that no longer belong to the deck, so the
// table doesn't grow with every regenerate.
export function pruneSpecs(presentationId, slidesData) {
  const db = getDb();
  const live = exportableSlides(slidesData).map(s => s.image_file);
  const rows = db.prepare('SELECT image_file FROM slide_pptx_specs WHERE presentation_id = ?').all(presentationId);
  const stale = rows.map(r => r.image_file).filter(f => !live.includes(f));
  for (const f of stale) db.prepare('DELETE FROM slide_pptx_specs WHERE image_file = ?').run(f);
}

export function deleteDeckArtifacts(presentationId, pptxFile) {
  const db = getDb();
  try { db.prepare('DELETE FROM slide_pptx_specs WHERE presentation_id = ?').run(presentationId); } catch {}
  pptxStore.remove(pptxFile);
}

// ── Build ────────────────────────────────────────────────────────────────────

async function measureSlides(db, presentationId, slides, userId) {
  const items = [];
  for (const slide of slides) {
    const p = imageStore.pathFor(slide.image_file);
    if (!p) continue;
    let buffer;
    try { buffer = fs.readFileSync(p); } catch { continue; }
    const info = await imageInfo(buffer);
    if (!info) continue;
    items.push({ index: slide.index, title: slide.title, type: slide.type, buffer, info, spec: undefined });
  }

  // Cache first — a rebuild after a one-slide edit should make one vision call.
  for (const item of items) {
    const slide = slides.find(s => s.index === item.index);
    const cached = readCachedSpec(db, slide.image_file);
    if (cached !== undefined) {
      item.spec = cached ? normalizeSpec(cached, item.info.width, item.info.height) : null;
    }
  }

  const pending = items.filter(i => i.spec === undefined);
  if (pending.length && analyzerAvailable) {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(ANALYZE_CONCURRENCY, pending.length) }, async () => {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        const slide = slides.find(s => s.index === item.index);
        const spec = await analyzeSlide(item.buffer, item.info, {
          userId, title: item.title, hint: item.type,
        });
        item.spec = spec;
        writeCachedSpec(db, presentationId, item.index, slide.image_file, spec);
      }
    });
    await Promise.all(workers);
  }

  for (const item of items) if (item.spec === undefined) item.spec = null;
  return items;
}

async function runBuild(presentationId, { userId, watermark, onStatus }) {
  const db = getDb();
  const pres = readPresentation(db, presentationId);
  if (!pres) throw new Error('Presentation not found');

  const slides = exportableSlides(pres.slides);
  if (!slides.length) throw new Error('No exportable slides');

  const signature = deckSignature(pres.slides);
  const startedAt = Date.now();

  db.prepare('UPDATE presentations SET pptx_status = ? WHERE id = ?').run(PPTX_STATUS.BUILDING, presentationId);
  onStatus?.({ status: PPTX_STATUS.BUILDING, total_slides: slides.length });

  const items = await measureSlides(db, presentationId, slides, userId ?? pres.user_id);
  const { buffer, editableSlides, totalSlides } = await buildDeck(items, {
    title: pres.title, watermark,
  });

  const filename = pptxStore.save(buffer);
  if (!filename) throw new Error('Could not write the exported deck to disk');

  const meta = {
    editable_slides: editableSlides,
    total_slides: totalSlides,
    watermark: !!watermark,
    built_at: new Date().toISOString(),
    build_ms: Date.now() - startedAt,
  };

  // Re-read: a slide may have been edited while we were building. If the deck
  // moved on, keep the file (it's still better than nothing) but leave the
  // signature stale so the next status check schedules a rebuild.
  const current = readPresentation(db, presentationId);
  const currentSignature = current ? deckSignature(current.slides) : signature;
  const previousFile = current?.pptx_file;

  db.prepare(
    'UPDATE presentations SET pptx_file = ?, pptx_status = ?, pptx_signature = ?, pptx_meta = ? WHERE id = ?'
  ).run(filename, PPTX_STATUS.READY, signature, JSON.stringify(meta), presentationId);

  if (previousFile && previousFile !== filename) pptxStore.remove(previousFile);
  pruneSpecs(presentationId, current?.slides || pres.slides);

  logger.info('pptx deck built', {
    presentationId, slides: totalSlides, editableSlides,
    durationMs: meta.build_ms, stale: currentSignature !== signature,
  });
  onStatus?.({
    status: currentSignature === signature ? PPTX_STATUS.READY : PPTX_STATUS.BUILDING,
    editable_slides: editableSlides, total_slides: totalSlides,
  });

  return { filename, meta };
}

/**
 * Kicks off a background build unless one is already running or the current
 * deck is already fresh. Never throws — callers are request handlers and
 * generation continuations that must not fail because an export cache didn't
 * update.
 */
export function scheduleDeckBuild(presentationId, { userId = null, watermark = false, onStatus = null, force = false, _retries = 1 } = {}) {
  const status = getDeckStatus(presentationId, { watermark });
  if (!status) return null;
  if (!force && status.status === PPTX_STATUS.READY) return null;
  if (status.exportable_slides === 0) return null;
  if (inFlight.has(presentationId)) return inFlight.get(presentationId);

  const promise = runBuild(presentationId, { userId, watermark, onStatus })
    .then(result => {
      // A slide can be edited while the build runs, which leaves the finished
      // file describing slides that already moved on. Rebuild once more rather
      // than leaving a stale deck for whoever exports next — the re-run reuses
      // every cached measurement, so it only re-measures what changed.
      if (result && _retries > 0 && getDeckStatus(presentationId, { watermark })?.stale) {
        setImmediate(() => scheduleDeckBuild(presentationId, { userId, watermark, onStatus, _retries: _retries - 1 }));
      }
      return result;
    })
    .catch(err => {
      logger.error('pptx deck build failed', { presentationId, errorMessage: err.message });
      try {
        getDb().prepare('UPDATE presentations SET pptx_status = ? WHERE id = ?').run(PPTX_STATUS.FAILED, presentationId);
      } catch {}
      onStatus?.({ status: PPTX_STATUS.FAILED });
      return null;
    })
    .finally(() => { inFlight.delete(presentationId); });

  inFlight.set(presentationId, promise);
  return promise;
}

/**
 * Resolves to the deck a user should be handed right now.
 *
 * Fresh pre-built deck → that file, instantly. Otherwise a flat image deck is
 * built on the spot (about a second) and the editable build is scheduled in the
 * background, so the click never blocks on vision calls. `mode` tells the caller
 * which of the two they got.
 */
export async function getDeckForDownload(presentationId, { userId = null, watermark = false, onStatus = null } = {}) {
  const db = getDb();
  const pres = readPresentation(db, presentationId);
  if (!pres) return null;

  const slides = exportableSlides(pres.slides);
  if (!slides.length) return { error: 'This presentation has no finished slides to export yet.' };

  const status = getDeckStatus(presentationId, { watermark });
  if (status.status === PPTX_STATUS.READY) {
    const p = pptxStore.pathFor(pres.pptx_file);
    if (p) {
      return {
        mode: 'editable',
        path: p,
        editable_slides: pres.meta.editable_slides || 0,
        total_slides: pres.meta.total_slides || slides.length,
      };
    }
  }

  // Not ready: make sure the editable build is on its way, then hand over the
  // flat deck rather than making the user wait for vision calls.
  scheduleDeckBuild(presentationId, { userId, watermark, onStatus });

  const items = [];
  for (const slide of slides) {
    const p = imageStore.pathFor(slide.image_file);
    if (!p) continue;
    try {
      const buffer = fs.readFileSync(p);
      const info = await imageInfo(buffer);
      if (info) items.push({ index: slide.index, title: slide.title, buffer, info, spec: null });
    } catch { /* skip an unreadable render rather than fail the export */ }
  }
  if (!items.length) return { error: 'This presentation has no finished slides to export yet.' };

  const { buffer, totalSlides } = await buildDeck(items, { title: pres.title, watermark });
  return { mode: 'images', buffer, editable_slides: 0, total_slides: totalSlides };
}
