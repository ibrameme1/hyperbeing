import fs from 'fs';
import path from 'path';
import { getDb } from '../database.js';
import { refundCredits, CREDIT_COSTS } from './stripeService.js';
import { IMAGE_DIR } from './imageStore.js';
import { logger } from './logger.js';

// Startup crash recovery. Generation runs as detached in-process promises, so
// anything still marked in-flight when the process boots was killed mid-run
// (deploy, crash, OOM) and will never finish. Without this sweep those rows
// stay stuck forever: presentations show "Generating…" indefinitely and stuck
// design rows count against the 8-image parallel cap, wedging Design Mode.

export function sweepStaleWork() {
  const db = getDb();

  // ── Presentations stuck in processing/generating ──────────────────────────
  const stuckPres = db.prepare(
    "SELECT id, user_id, status, slides_data FROM presentations WHERE status IN ('processing', 'generating') OR adding_slides = 1"
  ).all();

  for (const pres of stuckPres) {
    let slides = [];
    try { slides = JSON.parse(pres.slides_data || '[]'); } catch {}

    // Refund + error-mark every slide that was charged but never finished.
    // Slides charged in runFullFlow are those the plan considered affordable;
    // any still in 'generating' (or plan slides with no result at all) died
    // with the process. Completed/edited/locked/error slides are left alone —
    // locked slides were never charged and errored ones already refunded.
    let refunded = 0;
    let changed = false;
    for (const s of slides) {
      if (s.status === 'generating') {
        s.status = 'error';
        changed = true;
        refunded += 1;
      }
    }
    if (refunded > 0) {
      refundCredits(pres.user_id, refunded * CREDIT_COSTS.PER_SLIDE, 'generation_refund',
        'Server restarted mid-generation — refunded unfinished slides', pres.id, { swept: true });
    }

    const newStatus = pres.status === 'processing' && slides.length === 0 ? 'error'
      : slides.length > 0 ? 'completed' : 'error';
    db.prepare(
      "UPDATE presentations SET status = ?, adding_slides = 0, slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(newStatus, changed ? JSON.stringify(slides) : pres.slides_data, pres.id);

    logger.warn('swept stale presentation on startup', {
      presentationId: pres.id, previousStatus: pres.status, refundedSlides: refunded, newStatus,
    });
  }

  // ── Design generations stuck in pending/generating ─────────────────────────
  const stuckDesigns = db.prepare(
    "SELECT id, user_id, mode FROM design_generations WHERE status IN ('pending', 'generating')"
  ).all();

  for (const gen of stuckDesigns) {
    const cost = gen.mode === 'own' ? CREDIT_COSTS.DESIGN_IMAGE_OWN_PROMPT : CREDIT_COSTS.DESIGN_IMAGE_NOVA_PROMPT;
    db.prepare(
      "UPDATE design_generations SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run('Generation was interrupted by a server restart. Your credits have been refunded.', gen.id);
    refundCredits(gen.user_id, cost, 'design_generation_refund',
      'Server restarted mid-generation — refunded', null, { swept: true, generationId: gen.id });
    logger.warn('swept stale design generation on startup', { generationId: gen.id, userId: gen.user_id });
  }

  if (stuckPres.length || stuckDesigns.length) {
    logger.info('startup sweep complete', { presentations: stuckPres.length, designs: stuckDesigns.length });
  }
}

// Deletes image files on the volume that no DB row references. Orphans build up
// when a file is written to disk but the matching DB write never commits — the
// crash-looped image migration left ~an image set per failed boot, and a
// generation killed mid-flight can leave one too (file writes aren't
// transactional). An age guard protects files a live generation just wrote but
// hasn't persisted into slides_data yet — only files older than
// ORPHAN_MIN_AGE_MS are eligible, so this can never race in-flight work.
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000; // 1 hour

export function sweepOrphanImages() {
  let files;
  try {
    files = fs.readdirSync(IMAGE_DIR);
  } catch {
    return; // image dir not created yet — nothing to sweep
  }

  const db = getDb();
  const referenced = new Set();
  for (const row of db.prepare('SELECT slides_data, thumbnail FROM presentations').all()) {
    if (row.thumbnail) referenced.add(path.basename(row.thumbnail));
    let slides = [];
    try { slides = JSON.parse(row.slides_data || '[]'); } catch { continue; }
    for (const s of slides) if (s.image_file) referenced.add(path.basename(s.image_file));
  }
  try {
    for (const v of db.prepare('SELECT image_file FROM slide_versions').all()) {
      if (v.image_file) referenced.add(path.basename(v.image_file));
    }
  } catch { /* table may not exist */ }

  const cutoff = Date.now() - ORPHAN_MIN_AGE_MS;
  let deleted = 0, freedBytes = 0;
  for (const f of files) {
    if (referenced.has(f)) continue;
    const full = path.join(IMAGE_DIR, f);
    try {
      const st = fs.statSync(full);
      if (!st.isFile() || st.mtimeMs > cutoff) continue; // too new — could be in-flight
      freedBytes += st.size;
      fs.unlinkSync(full);
      deleted++;
    } catch { /* concurrent delete / race — ignore */ }
  }

  if (deleted > 0) {
    logger.info('swept orphan image files on startup', { deleted, freedMB: +(freedBytes / 1048576).toFixed(1) });
  }
}
