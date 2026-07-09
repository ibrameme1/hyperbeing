import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { v4 as uuid } from 'uuid';

const tmp = mkdtempSync(path.join(tmpdir(), 'hb-orphan-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.IMAGE_STORAGE_DIR = path.join(tmp, 'images');

const { initDatabase, getDb } = await import('../database.js');
const { IMAGE_DIR } = await import('../services/imageStore.js');
const { sweepOrphanImages } = await import('../services/recovery.js');

const OLD = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago (past the 1h guard)

function writeImg(name, old = true) {
  const p = path.join(IMAGE_DIR, name);
  writeFileSync(p, Buffer.alloc(1024));
  if (old) utimesSync(p, OLD, OLD);
  return name;
}

let referencedSlide, referencedVersion, oldOrphan, freshOrphan;

beforeAll(() => {
  initDatabase();
  mkdirSync(IMAGE_DIR, { recursive: true }); // store creates this lazily; tests write directly
  const db = getDb();

  referencedSlide = `${uuid()}.png`;
  referencedVersion = `${uuid()}.png`;
  oldOrphan = `${uuid()}.png`;
  freshOrphan = `${uuid()}.png`;

  writeImg(referencedSlide);
  writeImg(referencedVersion);
  writeImg(oldOrphan);          // old + unreferenced → should be swept
  writeImg(freshOrphan, false); // unreferenced but < 1h old → must be kept

  const userId = uuid();
  const presId = uuid();
  db.prepare("INSERT INTO users (id, name, email) VALUES (?, 'U', ?)").run(userId, `${uuid()}@t`);
  db.prepare('INSERT INTO presentations (id, user_id, slides_data, thumbnail) VALUES (?, ?, ?, ?)')
    .run(presId, userId, JSON.stringify([{ index: 0, image_file: referencedSlide }]), referencedSlide);
  db.prepare("INSERT INTO slide_versions (id, presentation_id, slide_index, image_file, image_data) VALUES (?, ?, 0, ?, '')")
    .run(uuid(), presId, referencedVersion);

  sweepOrphanImages();
});

describe('sweepOrphanImages', () => {
  it('deletes old, unreferenced files', () => {
    expect(existsSync(path.join(IMAGE_DIR, oldOrphan))).toBe(false);
  });
  it('keeps referenced files', () => {
    expect(existsSync(path.join(IMAGE_DIR, referencedSlide))).toBe(true);
    expect(existsSync(path.join(IMAGE_DIR, referencedVersion))).toBe(true);
  });
  it('keeps unreferenced files newer than the age guard (never races in-flight work)', () => {
    expect(existsSync(path.join(IMAGE_DIR, freshOrphan))).toBe(true);
  });
});
