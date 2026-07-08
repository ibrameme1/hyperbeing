import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

// Isolate the DB + image dir before importing anything that reads them.
const tmp = mkdtempSync(path.join(tmpdir(), 'hb-imgstore-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.IMAGE_STORAGE_DIR = path.join(tmp, 'images');

const { initDatabase } = await import('../database.js');
const store = await import('../services/imageStore.js');

// 1x1 transparent PNG
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const SVG_DATA_URL = 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64');

beforeAll(() => { initDatabase(); });

describe('imageStore', () => {
  it('saves a raster data URL to disk and returns a valid filename', () => {
    const file = store.saveDataUrl(PNG_DATA_URL);
    expect(file).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(store.isStoredFilename(file)).toBe(true);
    expect(existsSync(store.pathFor(file))).toBe(true);
  });

  it('refuses svg placeholders (they stay inline)', () => {
    expect(store.saveDataUrl(SVG_DATA_URL)).toBeNull();
    expect(store.saveDataUrl(null)).toBeNull();
    expect(store.saveDataUrl('/api/whatever')).toBeNull();
  });

  it('round-trips through toDataUrl', () => {
    const file = store.saveDataUrl(PNG_DATA_URL);
    expect(store.toDataUrl(file)).toBe(PNG_DATA_URL);
  });

  it('rejects path traversal and unknown filenames', () => {
    expect(store.isStoredFilename('../../etc/passwd')).toBe(false);
    expect(store.isStoredFilename('evil.exe')).toBe(false);
    expect(store.pathFor('../../etc/passwd')).toBeNull();
  });

  it('remove() deletes the file and is safe on junk input', () => {
    const file = store.saveDataUrl(PNG_DATA_URL);
    const p = store.pathFor(file);
    store.remove(file);
    expect(existsSync(p)).toBe(false);
    expect(() => store.remove('../../etc/passwd')).not.toThrow();
    expect(() => store.remove(null)).not.toThrow();
  });

  it('maps extensions to mime types', () => {
    expect(store.mimeFor('a.png')).toBe('image/png');
    expect(store.mimeFor('a.jpg')).toBe('image/jpeg');
    expect(store.mimeFor('a.webp')).toBe('image/webp');
  });
});
