import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

// Deletes image files in the image store that no DB row references anymore.
// Orphans accumulate when a generation/migration writes a file to disk but the
// matching DB write never commits — e.g. the crash-looped image migration, or
// a process killed mid-generation. File writes aren't transactional, so the
// files linger with no row pointing at them.
//
// Safe by default: prints what it WOULD delete. Pass --delete to actually
// remove them.
//
//   node backend/scripts/cleanup-orphan-images.js            # dry run
//   node backend/scripts/cleanup-orphan-images.js --delete   # actually delete
//
// Honors DB_PATH and IMAGE_STORAGE_DIR exactly like the app.

const DB_PATH = process.env.DB_PATH || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'hyperbeing.db');
const DATA_DIR = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data');
const IMAGE_DIR = process.env.IMAGE_STORAGE_DIR || path.join(DATA_DIR, 'images');

const DELETE = process.argv.includes('--delete');

if (!fs.existsSync(IMAGE_DIR)) {
  console.log(`Image dir does not exist: ${IMAGE_DIR} — nothing to do.`);
  process.exit(0);
}

const db = new Database(DB_PATH, { readonly: !DELETE });

// ── Collect every filename the DB still references ──────────────────────────
const referenced = new Set();

// Slide images + thumbnail (thumbnail column holds a bare filename now).
for (const row of db.prepare('SELECT slides_data, thumbnail FROM presentations').all()) {
  if (row.thumbnail) referenced.add(path.basename(row.thumbnail));
  let slides = [];
  try { slides = JSON.parse(row.slides_data || '[]'); } catch { continue; }
  for (const s of slides) if (s.image_file) referenced.add(path.basename(s.image_file));
}

// Version images.
try {
  for (const v of db.prepare('SELECT image_file FROM slide_versions').all()) {
    if (v.image_file) referenced.add(path.basename(v.image_file));
  }
} catch { /* table may not exist on very old DBs */ }

db.close();

// ── Compare against what's actually on disk ─────────────────────────────────
const onDisk = fs.readdirSync(IMAGE_DIR).filter(f => {
  try { return fs.statSync(path.join(IMAGE_DIR, f)).isFile(); } catch { return false; }
});

const orphans = onDisk.filter(f => !referenced.has(f));

let orphanBytes = 0;
for (const f of orphans) {
  try { orphanBytes += fs.statSync(path.join(IMAGE_DIR, f)).size; } catch {}
}

const mb = (n) => (n / (1024 * 1024)).toFixed(1) + ' MB';

console.log(`Image dir:        ${IMAGE_DIR}`);
console.log(`Files on disk:    ${onDisk.length}`);
console.log(`Referenced by DB: ${referenced.size}`);
console.log(`Orphans:          ${orphans.length} (${mb(orphanBytes)})`);

if (orphans.length === 0) {
  console.log('Nothing to clean up.');
  process.exit(0);
}

if (!DELETE) {
  console.log('\nDry run — no files deleted. Re-run with --delete to remove the orphans above.');
  process.exit(0);
}

let deleted = 0;
for (const f of orphans) {
  try { fs.unlinkSync(path.join(IMAGE_DIR, f)); deleted++; }
  catch (err) { console.warn(`  failed to delete ${f}: ${err.message}`); }
}
console.log(`\nDeleted ${deleted} orphan file(s), freed ~${mb(orphanBytes)}.`);
