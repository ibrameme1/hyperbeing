import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

// Seed a DB the OLD way (base64 images inline in slides_data + slide_versions +
// thumbnail), then let initDatabase() run the disk migration and assert the
// images moved out of the row and onto disk.
const tmp = mkdtempSync(path.join(tmpdir(), 'hb-mig-'));
const DB_PATH = path.join(tmp, 'test.db');
process.env.DB_PATH = DB_PATH;
process.env.IMAGE_STORAGE_DIR = path.join(tmp, 'images');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const SVG = 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64');

let db, store, presId, userId;

beforeAll(async () => {
  // Build a minimal schema by hand and seed pre-migration rows, WITHOUT running
  // the app migrations yet (so user_version stays 0).
  const seed = new Database(DB_PATH);
  // slide_versions.image_data is NOT NULL here on purpose — that's how the
  // first cut created it in production, and it's what made the migration crash
  // (SET image_data = NULL) and version inserts fail. The fix must cope with it.
  seed.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT);
    CREATE TABLE presentations (id TEXT PRIMARY KEY, user_id TEXT, slides_data TEXT, thumbnail TEXT);
    CREATE TABLE slide_versions (id TEXT PRIMARY KEY, presentation_id TEXT, slide_index INTEGER, image_data TEXT NOT NULL, instruction TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  `);
  userId = uuid(); presId = uuid();
  seed.prepare('INSERT INTO users (id, name, email) VALUES (?,?,?)').run(userId, 'U', 'u@t.local');
  const slides = [
    { index: 0, status: 'complete', image_data: PNG },
    { index: 1, status: 'error', image_data: SVG },     // placeholder stays inline
    { index: 2, status: 'complete', image_data: PNG },
  ];
  seed.prepare('INSERT INTO presentations (id, user_id, slides_data, thumbnail) VALUES (?,?,?,?)')
    .run(presId, userId, JSON.stringify(slides), PNG);
  seed.prepare('INSERT INTO slide_versions (id, presentation_id, slide_index, image_data) VALUES (?,?,?,?)')
    .run(uuid(), presId, 0, PNG);
  seed.close();

  const database = await import('../database.js');
  database.initDatabase();          // runs migrateImagesToDisk (user_version 0 → 2)
  db = database.getDb();
  store = await import('../services/imageStore.js');
});

describe('migrateImagesToDisk', () => {
  it('moves real slide images to disk and replaces them with URLs', () => {
    const slides = JSON.parse(db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(presId).slides_data);
    const s0 = slides.find(s => s.index === 0);
    expect(s0.image_file).toMatch(/\.png$/);
    expect(s0.image_data).toContain(`/api/presentations/${presId}/slides/0/image?f=`);
    expect(store.pathFor(s0.image_file)).toBeTruthy();
  });

  it('leaves svg placeholders inline', () => {
    const slides = JSON.parse(db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(presId).slides_data);
    const s1 = slides.find(s => s.index === 1);
    expect(s1.image_file).toBeUndefined();
    expect(s1.image_data).toBe(SVG);
  });

  it('points the thumbnail at the first slide\'s file', () => {
    const row = db.prepare('SELECT thumbnail, slides_data FROM presentations WHERE id = ?').get(presId);
    const s0 = JSON.parse(row.slides_data).find(s => s.index === 0);
    expect(row.thumbnail).toBe(s0.image_file);
  });

  it('moves version images to disk without violating the NOT NULL column', () => {
    const v = db.prepare('SELECT image_file, image_data FROM slide_versions WHERE presentation_id = ?').get(presId);
    expect(v.image_file).toMatch(/\.png$/);
    expect(v.image_data).toBe(''); // '' not NULL — legacy NOT NULL columns can't hold NULL
  });

  it('is idempotent — user_version is bumped so it will not run again', () => {
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(2);
  });

  it('a new version row can be inserted the way pushSlideVersion does (NOT NULL safe)', () => {
    const insert = () => db.prepare(
      "INSERT INTO slide_versions (id, presentation_id, slide_index, image_file, image_data, instruction) VALUES (?, ?, ?, ?, '', ?)"
    ).run(uuid(), presId, 0, 'abc.png', 'edit');
    expect(insert).not.toThrow();
    // Omitting image_data entirely must still fail on the legacy NOT NULL table —
    // proves the '' is doing real work.
    const bad = () => db.prepare(
      'INSERT INTO slide_versions (id, presentation_id, slide_index, image_file, instruction) VALUES (?, ?, ?, ?, ?)'
    ).run(uuid(), presId, 0, 'def.png', 'edit');
    expect(bad).toThrow();
  });
});
