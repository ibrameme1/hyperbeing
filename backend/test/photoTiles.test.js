import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import JSZip from 'jszip';

// Photo tiles (image role "photo"): framed pictures that share one contact
// sheet per slide. Covers the planner, the slicer, normalization, the guards
// and a full mock-mode build + PPTX export.
process.env.IMAGE_STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-photo-'));

const { normalizeLayout, planPhotoSheets, resolveCollisions, resolveImageOverlaps, extractCompletedLayoutParts, pendingGenerations, MAX_SHEET_PHOTOS } = await import('../services/slideLayout.js');
const { slicePhotoSheet } = await import('../services/layerImaging.js');
const { buildLayeredSlide, photoSheetPlan, loadStoredFile } = await import('../services/layeredSlide.js');
const { buildPptx } = await import('../services/pptxExport.js');
const { applyLayoutEdit } = await import('../services/layoutEdit.js');

const canvas = { w: 1920, h: 1080 };
const tile = (i, o = {}) => ({ kind: 'image', id: `p${i}`, role: 'photo', prompt: `moment ${i}`, radius: 10, x: 40 + i * 200, y: 400, w: 190, h: 230, ...o });

// A white page with `counts[r]` colour panels per row; panels deliberately
// uneven (the model never draws a perfect grid).
async function sheet(counts, { w = 1200, h = 900, jitter = 0 } = {}) {
  const rows = counts.length; const g = 30; const ch = (h - g * (rows + 1)) / rows;
  let cells = ''; let k = 0;
  counts.forEach((n, r) => {
    const cw = (w - g * (Math.max(...counts) + 1)) / Math.max(...counts);
    for (let c = 0; c < n; c++, k++) {
      const x = g + c * (cw + g) + (r % 2 ? jitter : 0); const y = g + r * (ch + g);
      cells += `<rect x="${x}" y="${y}" width="${cw - (r % 2 ? jitter : 0)}" height="${ch}" fill="rgb(${40 + k * 20},${90 + k * 10},${200 - k * 15})"/>`;
    }
  });
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fff"/>${cells}</svg>`)).png().toBuffer();
}
const centre = async (buf) => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
};

describe('planPhotoSheets', () => {
  it('puts all small tiles on one sheet with a sensible grid', () => {
    const photos = Array.from({ length: 9 }, (_, i) => ({ w: 194, h: 228 }));
    const { solos, sheets } = planPhotoSheets(photos, canvas);
    expect(solos).toHaveLength(0);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].cols * sheets[0].rows).toBeGreaterThanOrEqual(9);
    expect(sheets[0].cols).toBe(3);
  });
  it('generates a single photo, and a large hero photo, on their own', () => {
    expect(planPhotoSheets([{ w: 300, h: 200 }], canvas).solos).toHaveLength(1);
    const { solos, sheets } = planPhotoSheets([{ w: 1000, h: 700 }, { w: 200, h: 150 }, { w: 200, h: 150 }, { w: 200, h: 150 }], canvas);
    expect(solos).toHaveLength(1);
    expect(sheets[0].layers).toHaveLength(3);
  });
  it('splits clearly portrait and landscape tiles into two sheets', () => {
    const photos = [{ w: 150, h: 300 }, { w: 150, h: 300 }, { w: 400, h: 200 }, { w: 400, h: 200 }];
    expect(planPhotoSheets(photos, canvas).sheets).toHaveLength(2);
  });
});

describe('slicePhotoSheet', () => {
  it('finds every panel of a full grid, in reading order, without the white page', async () => {
    const tiles = await slicePhotoSheet(await sheet([3, 3]), [3, 3]);
    expect(tiles).toHaveLength(6);
    expect(tiles.detected).toEqual({ rows: true, cols: true });
    expect(await centre(tiles[0].buffer)).toEqual([40, 90, 200]);
    expect(await centre(tiles[5].buffer)).toEqual([140, 140, 125]);
    // No white gutter left on any edge.
    const { data, info } = await sharp(tiles[2].buffer).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeLessThan(200);
    expect(data[(info.width - 1) * info.channels]).toBeLessThan(200);
  });
  it('handles a short last row and rows whose columns do not line up', async () => {
    const tiles = await slicePhotoSheet(await sheet([3, 2], { jitter: 24 }), [3, 2]);
    expect(tiles).toHaveLength(5);
    expect(await centre(tiles[4].buffer)).toEqual([120, 130, 140]);
  });
  it('falls back to an even split when no gutters can be found', async () => {
    const flat = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#335577' } }).png().toBuffer();
    const tiles = await slicePhotoSheet(flat, [2, 2]);
    expect(tiles).toHaveLength(4);
    expect(tiles.detected.rows).toBe(true); // even rows are still rows
    expect(tiles[0].width).toBeGreaterThan(300);
  });
});

describe('photo layers in a layout', () => {
  it('normalizes a photo tile: cover fit, radius, border; tiles share generations', () => {
    const raw = { composition: 'editorial', background: { type: 'color', color: '#000' }, layers: Array.from({ length: 10 }, (_, i) => tile(i, { border: { color: '#ffffff', width: 1 } })) };
    const l = normalizeLayout(raw);
    expect(l.composition).toBe('editorial');
    expect(l.layers).toHaveLength(10); // ten tiles, ONE generation: not capped by the per-slide limit
    expect(l.layers[0]).toMatchObject({ role: 'photo', fit: 'cover', radius: 10, border: { color: '#ffffff', width: 1 } });
    expect(pendingGenerations(l)).toBe(1);
  });
  it('caps photo tiles per slide', () => {
    const l = normalizeLayout({ background: { type: 'color' }, layers: Array.from({ length: MAX_SHEET_PHOTOS + 4 }, (_, i) => tile(i)) });
    expect(l.layers).toHaveLength(MAX_SHEET_PHOTOS);
  });
  it('streams the announced photo count', () => {
    expect(extractCompletedLayoutParts('{"composition":"editorial","background":{"type":"color","color":"#000"},"photos":9,"layers":[').photos).toBe(9);
  });
  it('the guards leave tiles on their grid and never push text onto one', () => {
    const l = normalizeLayout({ background: { type: 'color' }, layers: [
      tile(0, { x: 40, y: 400, w: 600, h: 230 }),
      { kind: 'text', id: 'chip', role: 'label', text: 'LIVE', size: 20, x: 60, y: 420, w: 100, h: 30 },
      { kind: 'text', id: 'title', role: 'headline', text: 'TITLE', size: 70, x: 40, y: 297, w: 600, h: 76 },
      { kind: 'text', id: 'support', text: 'support line', size: 24, x: 40, y: 372, w: 600, h: 30 },
    ] });
    const before = JSON.stringify(l.layers);
    expect(resolveImageOverlaps(l)).toEqual([]);     // a chip on a photo is deliberate
    expect(resolveCollisions(l)).toEqual([]);        // boxes that brush by 1px are not a collision
    expect(JSON.stringify(l.layers)).toBe(before);
  });
  it('the editor may change a tile\'s radius and border, nothing else about its file', () => {
    const l = normalizeLayout({ background: { type: 'color' }, layers: [tile(0)] });
    l.layers[0].file = 'a.png'; l.layers[0].src = '/x/a.png';
    const edited = JSON.parse(JSON.stringify(l));
    Object.assign(edited.layers[0], { radius: 40, border: { color: '#FF2E74', width: 3 }, file: 'evil.png' });
    const out = applyLayoutEdit(l, edited);
    expect(out.layers[0]).toMatchObject({ radius: 40, border: { color: '#FF2E74', width: 3 }, file: 'a.png', role: 'photo', fit: 'cover' });
  });
});

describe('photoSheetPlan', () => {
  it('sizes the page to the grid and lists every picture in order', () => {
    const layers = Array.from({ length: 5 }, (_, i) => ({ prompt: `moment ${i}`, w: 300, h: 200 }));
    const plan = photoSheetPlan({ layers, cols: 3, rows: 2, aspect: 1.5 }, { style_block: 'documentary' }, '');
    expect(plan.counts).toEqual([3, 2]);
    const [w, h] = plan.size.split('x').map(Number);
    expect(w / h).toBeGreaterThan(1.9);
    expect(plan.prompt).toContain('1) moment 0');
    expect(plan.prompt).toContain('The last row holds only 2');
    expect(plan.prompt).toContain('pure white');
  });
});

describe('building a slide with photo tiles (mock images)', () => {
  let result;
  beforeAll(async () => {
    const raw = {
      composition: 'editorial', background: { type: 'color', color: '#050505' }, photos: 6,
      layers: [
        ...Array.from({ length: 6 }, (_, i) => tile(i, { x: 40 + i * 300, w: 280, h: 200 })),
        { kind: 'text', id: 'h', role: 'headline', text: 'SIX MOMENTS', size: 80, x: 40, y: 60, w: 1800, h: 100 },
      ],
    };
    result = await buildLayeredSlide({ presentationId: 't', slide: { index: 0, title: 'x' }, deckDesign: null, brief: '', layoutOverride: raw, review: false });
  }, 30000);

  it('makes ONE generation and gives every tile its own picture file', () => {
    expect(result).toBeTruthy();
    expect(result.gen_stats.images).toHaveLength(1);
    expect(result.gen_stats.images[0]).toMatchObject({ role: 'photo_sheet', photos: 6 });
    const tiles = result.layout.layers.filter(l => l.role === 'photo');
    expect(tiles).toHaveLength(6);
    expect(new Set(tiles.map(t => t.file)).size).toBe(6);
    expect(tiles.every(t => t.fit === 'cover' && t.sheet)).toBe(true);
  });
  it('tiles are opaque crops of their own panel (no white page)', async () => {
    const t = result.layout.layers.find(l => l.id === 'p0');
    const meta = await sharp(await loadStoredFile(t.file)).metadata();
    expect(meta.width).toBeGreaterThan(200);
    const { data } = await sharp(await loadStoredFile(t.file)).raw().toBuffer({ resolveWithObject: true });
    expect(data[0] > 240 && data[1] > 240 && data[2] > 240).toBe(false);
  });
  it('exports each tile to PowerPoint as its own picture', async () => {
    const { buffer } = await buildPptx({ id: 't', title: 'T', aspect_ratio: '16:9', slides_data: JSON.stringify([{ index: 0, status: 'complete', layout: result.layout }]) });
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    expect((xml.match(/<p:pic>/g) || []).length).toBe(6);
  });
});
