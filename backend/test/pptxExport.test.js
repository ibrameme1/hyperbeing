import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import sharp from 'sharp';
import JSZip from 'jszip';

// Isolate the DB + stores before importing anything that reads them.
const tmp = mkdtempSync(path.join(tmpdir(), 'hb-pptx-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.IMAGE_STORAGE_DIR = path.join(tmp, 'images');
process.env.EXPORT_STORAGE_DIR = path.join(tmp, 'exports');
delete process.env.ANTHROPIC_API_KEY; // no vision calls in tests — mock mode

const { initDatabase, getDb } = await import('../database.js');
const { normalizeSpec, normalizeHex, eraseRegions } = await import('../services/pptx/spec.js');
const { cleanPlate } = await import('../services/pptx/plate.js');
const { buildDeck } = await import('../services/pptx/builder.js');
const imageStore = await import('../services/imageStore.js');
const pptxService = await import('../services/pptx/index.js');

const W = 1536, H = 864;

async function slidePng() {
  return sharp({
    create: { width: W, height: H, channels: 3, background: { r: 11, g: 27, b: 51 } },
  }).png().toBuffer();
}

async function slideParts(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  return { zip, slideNames };
}

beforeAll(() => { initDatabase(); });

describe('spec normalization', () => {
  it('accepts hex in the forms models actually emit, and refuses the rest', () => {
    expect(normalizeHex('#f52d6e')).toBe('F52D6E');
    expect(normalizeHex('F52D6E')).toBe('F52D6E');
    expect(normalizeHex('#fff')).toBe('FFFFFF');
    expect(normalizeHex('#F52D6EFF')).toBe('F52D6E'); // 8-digit alpha would corrupt the file
    expect(normalizeHex('rgb(1,2,3)')).toBeNull();
    expect(normalizeHex(null, 'FFFFFF')).toBe('FFFFFF');
  });

  it('drops elements it cannot trust rather than mislocating them', () => {
    const spec = normalizeSpec({
      elements: [
        { kind: 'text', x: 10, y: 10, w: 400, h: 60, text: 'KEEP ME', size: 40 },
        { kind: 'text', x: 9000, y: 10, w: 400, h: 60, text: 'off canvas' },
        { kind: 'text', x: 10, y: 10, w: 400, h: 60, text: '   ' },
        { kind: 'rect', x: 10, y: 200, w: 100, h: 100 },              // no fill and no line
        { kind: 'chart', x: 10, y: 300, w: 400, h: 400, labels: ['a', 'b'], values: [1] },
        { kind: 'raster', x: 0, y: 0, w: W, h: H },                   // the whole plate
        { kind: 'sparkles', x: 1, y: 1, w: 50, h: 50 },
      ],
    }, W, H);
    expect(spec.elements).toHaveLength(1);
    expect(spec.elements[0].text).toBe('KEEP ME');
  });

  it('keeps one of two identical stacked elements, both of two different ones', () => {
    const dupes = normalizeSpec({
      elements: [
        { kind: 'rect', x: 40, y: 40, w: 300, h: 120, fill: 'F52D6E' },
        { kind: 'rect', x: 41, y: 41, w: 300, h: 120, fill: 'F52D6E' },
      ],
    }, W, H);
    expect(dupes.elements).toHaveLength(1);

    const stacked = normalizeSpec({
      elements: [
        { kind: 'text', x: 40, y: 40, w: 300, h: 120, text: 'ONE' },
        { kind: 'text', x: 41, y: 41, w: 300, h: 120, text: 'TWO' },
      ],
    }, W, H);
    expect(stacked.elements).toHaveLength(2);
  });

  it('erases every rebuilt region from the plate, text more tightly than cards', () => {
    const spec = normalizeSpec({
      elements: [
        { kind: 'text', x: 100, y: 60, w: 800, h: 90, text: 'HEADLINE' },
        { kind: 'rect', x: 80, y: 520, w: 420, h: 180, fill: 'F52D6E', radius: 18 },
      ],
    }, W, H);
    const regions = eraseRegions(spec);
    expect(regions).toHaveLength(2);
    expect(regions[0].type).toBe('text');
    expect(regions[0].grow).toBeLessThan(regions[1].grow); // cards carry shadow/glow
  });
});

describe('clean plate', () => {
  it('replaces the pixels under a rebuilt region and leaves the rest alone', async () => {
    // A red card on a dark background: erasing it must remove the red.
    const src = await sharp({
      create: { width: W, height: H, channels: 3, background: { r: 11, g: 27, b: 51 } },
    }).composite([{
      input: await sharp({ create: { width: 400, height: 200, channels: 3, background: { r: 245, g: 45, b: 110 } } }).png().toBuffer(),
      left: 200, top: 300,
    }]).png().toBuffer();

    const plate = await cleanPlate(src, [{ type: 'rect', x: 200, y: 300, w: 400, h: 200, grow: 8 }], W, H);
    const { data } = await sharp(plate).raw().toBuffer({ resolveWithObject: true });
    const at = (x, y) => { const i = (y * W + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };

    const [r] = at(400, 400);          // middle of where the card was
    expect(r).toBeLessThan(120);       // the red is gone, not smeared back in
    expect(at(1400, 100)[2]).toBeGreaterThan(30); // untouched background survives
  });

  it('returns the source untouched when there is nothing to erase', async () => {
    const src = await slidePng();
    expect(await cleanPlate(src, [], W, H)).toBe(src);
  });
});

describe('deck builder', () => {
  it('builds a valid deck with live text and a native chart', async () => {
    const png = await slidePng();
    const spec = normalizeSpec({
      background_color: '0B1B33',
      elements: [
        { kind: 'text', x: 110, y: 60, w: 1200, h: 90, text: 'MARKET SHARE 2026', size: 72, bold: true, color: 'FFFFFF' },
        { kind: 'rect', x: 80, y: 520, w: 420, h: 180, fill: 'F52D6E', radius: 18 },
        {
          kind: 'chart', chart: 'doughnut', x: 980, y: 380, w: 440, h: 440,
          labels: ['Us', 'Them', 'Other'], values: [38, 41, 21], colors: ['F52D6E', 'FFFFFF', '1E5A8C'],
        },
      ],
      notes: 'Us 38, Them 41, Other 21',
    }, W, H);

    const { buffer, editableSlides, totalSlides } = await buildDeck(
      [{ index: 0, buffer: png, spec }, { index: 1, buffer: png, spec: null }],
      { title: 'Test Deck' }
    );

    expect(editableSlides).toBe(1);
    expect(totalSlides).toBe(2);

    const { zip, slideNames } = await slideParts(buffer);
    expect(slideNames).toHaveLength(2);

    const slide1 = await zip.file('ppt/slides/slide1.xml').async('string');
    expect(slide1).toContain('MARKET SHARE 2026');       // real text, not a picture of it

    const chart = await zip.file('ppt/charts/chart1.xml').async('string');
    expect(chart).toContain('<c:v>38</c:v>');            // editable numbers, not a rendered ring

    // Slide 2 has no spec: a full-bleed picture and no text runs.
    const slide2 = await zip.file('ppt/slides/slide2.xml').async('string');
    expect(slide2).toContain('<p:pic>');
  });

  it('watermarks free-plan exports only', async () => {
    const png = await slidePng();
    const free = await buildDeck([{ index: 0, buffer: png, spec: null }], { watermark: true });
    const paid = await buildDeck([{ index: 0, buffer: png, spec: null }], { watermark: false });
    const readSlide = async b => (await (await JSZip.loadAsync(b)).file('ppt/slides/slide1.xml').async('string'));
    expect(await readSlide(free.buffer)).toContain('Made with HyperBeing');
    expect(await readSlide(paid.buffer)).not.toContain('Made with HyperBeing');
  });
});

describe('deck orchestration', () => {
  const presentationId = 'pres-pptx-test';

  beforeAll(async () => {
    const db = getDb();
    db.prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)').run('u-pptx', 'Test', 'pptx@test.dev');
    const file = imageStore.saveDataUrl(
      `data:image/png;base64,${(await slidePng()).toString('base64')}`
    );
    const slides = [
      { index: 0, title: 'One', status: 'complete', image_file: file, image_data: `/api/x?f=${file}` },
      { index: 1, title: 'Locked', status: 'locked', image_file: null, image_data: null },
    ];
    db.prepare('INSERT INTO presentations (id, user_id, title, slides_data, status) VALUES (?, ?, ?, ?, ?)')
      .run(presentationId, 'u-pptx', 'Test Deck', JSON.stringify(slides), 'completed');
  });

  it('signs the deck by its slide images, ignoring slides that cannot be exported', () => {
    const a = pptxService.deckSignature([
      { index: 0, status: 'complete', image_file: '11111111-1111-1111-1111-111111111111.png' },
    ]);
    const withLocked = pptxService.deckSignature([
      { index: 0, status: 'complete', image_file: '11111111-1111-1111-1111-111111111111.png' },
      { index: 1, status: 'locked', image_file: null },
    ]);
    const edited = pptxService.deckSignature([
      { index: 0, status: 'complete', image_file: '22222222-2222-2222-2222-222222222222.png' },
    ]);
    expect(withLocked).toBe(a);   // a locked slide is not part of the export
    expect(edited).not.toBe(a);   // a re-rendered slide invalidates the built deck
  });

  it('reports no deck before a build, and a ready one after', async () => {
    expect(pptxService.getDeckStatus(presentationId).status).toBe('none');
    expect(pptxService.getDeckStatus(presentationId).exportable_slides).toBe(1);

    await pptxService.scheduleDeckBuild(presentationId, { userId: 'u-pptx' });

    const status = pptxService.getDeckStatus(presentationId);
    expect(status.status).toBe('ready');
    expect(status.total_slides).toBe(1); // the locked slide is not exported

    const row = getDb().prepare('SELECT pptx_file FROM presentations WHERE id = ?').get(presentationId);
    const stored = path.join(process.env.EXPORT_STORAGE_DIR, row.pptx_file);
    expect(existsSync(stored)).toBe(true);
    const { slideNames } = await slideParts(readFileSync(stored));
    expect(slideNames).toHaveLength(1);
  });

  it('serves the pre-built file once it is ready', async () => {
    const result = await pptxService.getDeckForDownload(presentationId, { userId: 'u-pptx' });
    expect(result.mode).toBe('editable');
    expect(existsSync(result.path)).toBe(true);
  });

  it('refuses to export a deck with no finished slides', async () => {
    const db = getDb();
    db.prepare('INSERT INTO presentations (id, user_id, title, slides_data, status) VALUES (?, ?, ?, ?, ?)')
      .run('pres-empty', 'u-pptx', 'Empty', JSON.stringify([{ index: 0, status: 'locked' }]), 'completed');
    const result = await pptxService.getDeckForDownload('pres-empty', { userId: 'u-pptx' });
    expect(result.error).toBeTruthy();
  });
});
