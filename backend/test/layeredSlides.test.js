import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  normalizeLayout, fitLayout, estimateTextHeight, wrapTextRanges, layoutFiles,
  MAX_GENERATIONS_PER_SLIDE, minFontSize,
} from '../services/slideLayout.js';
import {
  unscreen, trimTransparent, extractScreen, sliceSheet, ensureTransparent, containRect, transparentFraction,
} from '../services/layerImaging.js';
import { logoCandidatesFromHtml } from '../services/brandAssets.js';
import { sizeForAspect } from '../services/openaiImages.js';

const svgPng = (svg) => sharp(Buffer.from(svg)).png().toBuffer();
const pixel = async (buf, x, y) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};

describe('normalizeLayout', () => {
  it('drops unknown kinds, invalid colors and fonts, and makes ids unique', () => {
    const l = normalizeLayout({
      fonts: { display: 'Comic Sans', body: 'Lato' },
      background: { type: 'color', color: 'javascript:alert(1)' },
      layers: [
        { kind: 'text', id: 'a', text: 'Hello', color: 'red; background:url(x)', font: 'Nope' },
        { kind: 'text', id: 'a', text: 'World' },
        { kind: 'video', id: 'v' },
        { kind: 'text', id: 'empty', text: '   ' },
      ],
    });
    expect(l.fonts.display).toBe('Inter');
    expect(l.background.color).toBe('#000000');
    expect(l.layers.map(x => x.id)).toEqual(['a', 'a_2']);
    expect(l.layers[0].color).toBe('#FFFFFF');
    expect(l.layers[0].font).toBe('Lato');
  });

  it('caps image generations per slide (background counts)', () => {
    const layers = Array.from({ length: 12 }, (_, i) => ({ kind: 'image', id: `e${i}`, prompt: 'a thing' }));
    const l = normalizeLayout({ background: { type: 'image', prompt: 'bg' }, layers });
    expect(l.layers.filter(x => x.kind === 'image')).toHaveLength(MAX_GENERATIONS_PER_SLIDE - 1);
  });

  it('resolves in_screen to a device with a screen and drops it otherwise', () => {
    const l = normalizeLayout({
      layers: [
        { kind: 'image', id: 'phone', prompt: 'phone', screen: { fill: '#111111' } },
        { kind: 'text', id: 'msg', text: 'hi', in_screen: 'phone' },
        { kind: 'text', id: 'orphan', text: 'x', in_screen: 'nope' },
      ],
    });
    expect(l.layers.find(x => x.id === 'msg').in_screen).toBe('phone');
    expect(l.layers.find(x => x.id === 'orphan').in_screen).toBeUndefined();
  });

  it('rejects upload logos pointing past the uploaded files', () => {
    const l = normalizeLayout({ layers: [{ kind: 'logo', id: 'l', source: 'upload', upload: 3 }, { kind: 'text', id: 't', text: 'x' }] }, { uploadCount: 1 });
    expect(l.layers.map(x => x.id)).toEqual(['t']);
  });

  it('keeps chart series and fills categories', () => {
    const l = normalizeLayout({ layers: [{ kind: 'chart', id: 'c', chart_type: 'line', series: [{ name: 's', values: [1, null, 3] }] }] });
    expect(l.layers[0].categories).toEqual(['1', '2', '3']);
    expect(l.layers[0].series[0].values).toEqual([1, null, 3]);
  });

  it('lists every referenced file', () => {
    const l = normalizeLayout({ background: { type: 'image', prompt: 'x', file: 'a.png' }, layers: [{ kind: 'image', id: 'i', prompt: 'p', file: 'b.png' }] });
    expect(layoutFiles(l)).toEqual(['a.png', 'b.png']);
  });
});

describe('fitLayout', () => {
  const base = (layer) => normalizeLayout({ layers: [{ kind: 'text', id: 't', x: 100, y: 100, ...layer }] });

  it('shrinks overflowing text but never below 70% of the designed size', () => {
    const l = base({ text: 'A very long headline that cannot possibly fit on one line in this box', size: 100, w: 600, h: 120 });
    const { warnings } = fitLayout(l);
    const t = l.layers[0];
    expect(t.size).toBeLessThan(100);
    expect(t.size).toBeGreaterThanOrEqual(70);
    expect(estimateTextHeight(t).height).toBeLessThanOrEqual(t.h);
    expect(warnings.some(w => w.includes('shrunk'))).toBe(true);
  });

  it('raises text below the readability floor', () => {
    const l = base({ text: 'tiny', size: 9, w: 400, h: 100 });
    fitLayout(l);
    expect(l.layers[0].size).toBe(minFontSize(l.canvas));
  });

  it('warns on text-on-text overlap', () => {
    const l = normalizeLayout({ layers: [
      { kind: 'text', id: 'a', text: 'one', x: 100, y: 100, w: 400, h: 100 },
      { kind: 'text', id: 'b', text: 'two', x: 150, y: 120, w: 400, h: 100 },
    ] });
    expect(fitLayout(l).warnings.some(w => w.includes('overlaps'))).toBe(true);
  });

  it('wrap ranges cover the text in order', () => {
    const l = base({ text: 'alpha beta gamma\ndelta', size: 40, w: 200, h: 400 });
    const ranges = wrapTextRanges(l.layers[0]);
    expect(ranges.length).toBeGreaterThanOrEqual(2);
    const words = ranges.flatMap(r => l.layers[0].text.slice(r.start, r.end).split(' '));
    expect(words).toEqual(['alpha', 'beta', 'gamma', 'delta']);
    // the explicit newline always starts a new line
    expect(l.layers[0].text.slice(ranges.at(-1).start, ranges.at(-1).end)).toBe('delta');
  });
});

describe('layer imaging', () => {
  it('unscreen turns light-on-black into alpha', async () => {
    const buf = await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#000"/><rect x="5" y="5" width="10" height="10" fill="#804000"/></svg>');
    const out = await unscreen(buf);
    expect((await pixel(out, 0, 0))[3]).toBe(0);
    const [r, g, , a] = await pixel(out, 10, 10);
    expect(a).toBe(128);
    expect(r).toBe(255);
    expect(g).toBeGreaterThan(120);
  });

  it('unscreen feathers effect edges to zero so no rectangular seam survives', async () => {
    const buf = await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#ff8000"/></svg>');
    const out = await unscreen(buf);
    expect((await pixel(out, 0, 50))[3]).toBe(0);
    expect((await pixel(out, 99, 50))[3]).toBe(0);
    expect((await pixel(out, 50, 50))[3]).toBe(255);
  });

  it('trims transparent margins and reports offset', async () => {
    const buf = await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect x="40" y="30" width="20" height="10" fill="#f00"/></svg>');
    const t = await trimTransparent(buf);
    expect(t.width).toBeGreaterThanOrEqual(20);
    expect(t.width).toBeLessThan(30);
    expect(t.offset.x).toBeGreaterThanOrEqual(36);
    expect(await trimTransparent(await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'))).toBeNull();
  });

  it('finds a chroma-green screen and fills it', async () => {
    const buf = await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect x="20" y="20" width="160" height="260" rx="20" fill="#222"/><rect x="40" y="50" width="120" height="200" fill="#00FF00"/></svg>');
    const { buffer, rect } = await extractScreen(buf, '#0B141A');
    expect(rect).toEqual({ x: 40, y: 50, w: 120, h: 200 });
    const [r, g, b] = await pixel(buffer, 100, 150);
    expect([r, g, b]).toEqual([11, 20, 26]);
  });

  it('handles a SHADED chroma screen (vignette/reflection) and leaves no green behind', async () => {
    const buf = await svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><defs><radialGradient id="v"><stop offset="0" stop-color="#22ee33"/><stop offset="1" stop-color="#119922"/></radialGradient></defs>
      <rect x="20" y="20" width="160" height="260" rx="20" fill="#222"/><rect x="40" y="50" width="120" height="200" fill="url(#v)"/></svg>`);
    const { buffer, rect } = await extractScreen(buf, '#0B141A');
    expect(rect.w).toBeGreaterThan(110);
    expect(rect.h).toBeGreaterThan(190);
    const { data } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    let green = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 1] - Math.max(data[i], data[i + 2]) > 30) green++;
    expect(green).toBe(0);
  });

  it('returns no screen when there is no solid green rectangle', async () => {
    const buf = await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="5" fill="#00FF00"/></svg>');
    expect((await extractScreen(buf)).rect).toBeNull();
  });

  it('slices an icon sheet into trimmed cells', async () => {
    const buf = await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><rect x="30" y="30" width="40" height="40" fill="#f00"/><rect x="130" y="30" width="40" height="40" fill="#0f0"/></svg>');
    const cells = await sliceSheet(buf, 3, 1);
    expect(cells).toHaveLength(3);
    expect(cells[0].width).toBeLessThan(50);
    expect(cells[2]).toBeNull();
  });

  it('keys out an opaque background when transparency was ignored', async () => {
    const buf = await svgPng('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#fff"/><circle cx="50" cy="50" r="20" fill="#e00"/></svg>');
    expect(await transparentFraction(buf)).toBe(0);
    const out = await ensureTransparent(buf);
    expect((await pixel(out, 2, 2))[3]).toBe(0);
    expect((await pixel(out, 50, 50))[3]).toBe(255);
  });

  it('containRect fits and centers', () => {
    expect(containRect(200, 100, { x: 0, y: 0, w: 100, h: 100 })).toEqual({ x: 0, y: 25, w: 100, h: 50 });
  });

  it('sizes requests from box aspect', () => {
    // Exact box aspect, multiples of 16, long side as requested, aspect clamped to 3:1.
    expect(sizeForAspect(1920, 1080, 2048)).toBe('2048x1152');
    expect(sizeForAspect(400, 900)).toBe('688x1536');
    expect(sizeForAspect(500, 480)).toBe('1536x1472');
    expect(sizeForAspect(2000, 100)).toBe('1536x512');
  });
});

describe('brand logo candidates', () => {
  it('prefers svg icons and logo images, resolves relative urls', () => {
    const html = `<head><link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
      <link rel="icon" type="image/svg+xml" href="/logo.svg"></head><body><img class="site-logo" src="https://cdn.x.com/brand.png"></body>`;
    const c = logoCandidatesFromHtml(html, 'https://brand.com/');
    expect(c[0]).toBe('https://brand.com/logo.svg');
    expect(c).toContain('https://cdn.x.com/brand.png');
    expect(c).toContain('https://brand.com/apple.png');
  });
});

import { extractCompletedLayoutParts } from '../services/slideLayout.js';
describe('extractCompletedLayoutParts (streamed layout JSON)', () => {
  const full = JSON.stringify({
    composition: 'objects', style_block: 'soft "key" light',
    background: { type: 'image', prompt: 'aurora {glow}' },
    brands: [{ name: 'X' }],
    layers: [{ kind: 'image', id: 'a', prompt: 'phone' }, { kind: 'text', id: 't', text: 'Hi } ]' }],
  });
  it('returns only complete parts at every prefix and everything at the end', () => {
    let lastLayers = 0;
    for (let n = 0; n <= full.length; n += 7) {
      const p = extractCompletedLayoutParts(full.slice(0, n));
      expect(p.layers.length).toBeGreaterThanOrEqual(lastLayers); // monotonic
      lastLayers = p.layers.length;
      if (p.background) expect(p.background.prompt).toBe('aurora {glow}');
    }
    const p = extractCompletedLayoutParts(full);
    expect(p.style_block).toBe('soft "key" light');
    expect(p.layers.map(l => l.id)).toEqual(['a', 't']);
    expect(p.brands).toEqual([{ name: 'X' }]);
  });
  it('does not report a half-written layer', () => {
    const cut = full.slice(0, full.indexOf('"t"') + 2);
    expect(extractCompletedLayoutParts(cut).layers.map(l => l.id)).toEqual(['a']);
  });
});

describe('string-encoded layout fields (tool-call quirk)', () => {
  const layers = [{ kind: 'image', id: 'a', prompt: 'phone "x"' }, { kind: 'text', id: 't', text: 'Hi\nthere' }];
  it('normalizeLayout parses a stringified layers array', () => {
    const l = normalizeLayout({ layers: JSON.stringify(layers) });
    expect(l.layers.map(x => x.id)).toEqual(['a', 't']);
  });
  it('streaming extraction decodes a partially streamed string-encoded array', () => {
    const full = JSON.stringify({ composition: 'objects', layers: JSON.stringify(layers) });
    const half = full.slice(0, full.indexOf('\\"t\\"'));
    expect(extractCompletedLayoutParts(half).layers.map(x => x.id)).toEqual(['a']);
    expect(extractCompletedLayoutParts(full).layers.map(x => x.id)).toEqual(['a', 't']);
    expect(extractCompletedLayoutParts(full).layers[0].prompt).toBe('phone "x"');
  });
});

describe('screen children', () => {
  it('keep normalized 0-1 coordinates through normalization', () => {
    const l = normalizeLayout({ layers: [
      { kind: 'image', id: 'p', prompt: 'phone', screen: { fill: '#000' }, x: 100, y: 100, w: 300, h: 600 },
      { kind: 'text', id: 'm', text: 'hi', in_screen: 'p', x: 0.1, y: 0.2, w: 0.8, h: 0.1 },
    ] });
    const m = l.layers.find(x => x.id === 'm');
    expect([m.x, m.y, m.w, m.h]).toEqual([0.1, 0.2, 0.8, 0.1]);
    expect(m.in_screen).toBe('p');
  });
});

import { connectorGeometry } from '../services/layeredSlide.js';
describe('connectorGeometry', () => {
  const layout = normalizeLayout({ layers: [
    { kind: 'image', id: 'phone', role: 'hero', prompt: 'phone', x: 900, y: 100, w: 500, h: 800 },
    { kind: 'image', id: 'wallet', role: 'element', prompt: 'wallet', x: 1500, y: 700, w: 300, h: 260 },
    { kind: 'image', id: 'coins', role: 'connector', medium: 'objects', prompt: 'coins', from: { layer: 'phone', anchor: { x: 0.8, y: 0.85 } }, to: { layer: 'wallet', anchor: 'top' }, spread: 200 },
  ] });
  it('builds a box with the generation aspect and endpoints inside it', () => {
    const c = layout.layers.find(l => l.id === 'coins');
    expect(c.medium).toBe('objects');
    const g = connectorGeometry(layout, c);
    const [gw, gh] = g.size.split('x').map(Number);
    expect(Math.abs(g.box.w / g.box.h - gw / gh)).toBeLessThan(0.01);
    // From point (1300, 780) and to point (1650, 700) must both be inside the box.
    for (const [x, y] of [[1300, 780], [1650, 700]]) {
      expect(x).toBeGreaterThanOrEqual(g.box.x); expect(x).toBeLessThanOrEqual(g.box.x + g.box.w);
      expect(y).toBeGreaterThanOrEqual(g.box.y); expect(y).toBeLessThanOrEqual(g.box.y + g.box.h);
    }
    expect(g.sentence).toMatch(/begins exactly at the point \d+% from the left/);
  });
  it('orbits around a layer', () => {
    const l = normalizeLayout({ layers: [
      { kind: 'image', id: 'pad', role: 'hero', prompt: 'controller', x: 1000, y: 300, w: 700, h: 500 },
      { kind: 'image', id: 'orbit', role: 'connector', prompt: 'ring', around: 'pad' },
    ] });
    const g = connectorGeometry(l, l.layers[1]);
    expect(g.box.w).toBeGreaterThan(700);
    expect(g.sentence).toMatch(/orbit/);
  });
});

describe('fit heuristics', () => {
  it('reflows body text whose manual breaks cause orphan wraps', () => {
    const l = normalizeLayout({ layers: [{ kind: 'text', id: 'b', role: 'body', text: '70:30 in the developer\'s favour, moving\nto 50:50 above PKR 5M monthly sales', size: 28, x: 100, y: 100, w: 420, h: 200 }] });
    fitLayout(l);
    expect(l.layers[0].text.includes('\n')).toBe(false);
  });
  it('widens a wrapping pill label together with its pill', () => {
    const l = normalizeLayout({ layers: [
      { kind: 'shape', id: 'pill', shape: 'rect', x: 66, y: 160, w: 200, h: 44, radius: 22 },
      { kind: 'text', id: 'lbl', role: 'label', text: 'WHAT KEEPS USERS COMING BACK', size: 22, letter_spacing: 0.2, uppercase: true, align: 'center', x: 66, y: 160, w: 200, h: 44 },
    ] });
    fitLayout(l);
    const [pill, lbl] = l.layers;
    expect(lbl.w).toBeGreaterThan(200);
    expect(pill.w).toBe(lbl.w);
  });
});

import { splitCluster } from '../services/layerImaging.js';
describe('splitCluster', () => {
  it('splits a transparent cluster into items by region, keeping halos with their object', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
      <defs><radialGradient id="g"><stop offset="0" stop-color="#f0f" stop-opacity="0.2"/><stop offset="1" stop-color="#f0f" stop-opacity="0"/></radialGradient></defs>
      <circle cx="60" cy="100" r="70" fill="url(#g)"/>
      <rect x="30" y="20" width="60" height="160" fill="#333"/>
      <circle cx="110" cy="140" r="6" fill="#fc0"/><circle cx="140" cy="130" r="7" fill="#fc0"/><circle cx="175" cy="125" r="8" fill="#fc0"/>
      <rect x="220" y="110" width="60" height="60" fill="#602"/></svg>`;
    const buf = await svgPng(svg);
    const parts = await splitCluster(buf, [
      { id: 'phone', box: { x: 0.05, y: 0.05, w: 0.3, h: 0.9 } },
      { id: 'coins', box: { x: 0.33, y: 0.55, w: 0.33, h: 0.2 } },
      { id: 'wallet', box: { x: 0.7, y: 0.5, w: 0.3, h: 0.4 } },
    ]);
    const byId = Object.fromEntries(parts.map(p => [p.id, p]));
    expect(Object.keys(byId).sort()).toEqual(['coins', 'phone', 'wallet']);
    expect(byId.wallet.x).toBeGreaterThanOrEqual(215);
    // The phone's soft glow travels with the phone (wider than the 60px body).
    expect(byId.phone.w).toBeGreaterThan(70);
  });

  it('separates TOUCHING objects at their faintest junction', async () => {
    // Two solid blocks joined by a faint (low-alpha) bridge — one connected
    // shape, but the cut must happen in the bridge, not through a block.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100">
      <rect x="10" y="20" width="100" height="60" fill="#0af"/>
      <rect x="110" y="45" width="80" height="10" fill="#fff" fill-opacity="0.15"/>
      <rect x="190" y="20" width="100" height="60" fill="#f60"/></svg>`;
    const parts = await splitCluster(await svgPng(svg), [
      { id: 'left', box: { x: 0, y: 0.1, w: 0.4, h: 0.8 } },
      { id: 'right', box: { x: 0.6, y: 0.1, w: 0.4, h: 0.8 } },
    ]);
    const byId = Object.fromEntries(parts.map(p => [p.id, p]));
    // Each side keeps its whole solid block (100px) plus part of the bridge, never the other block.
    expect(byId.left.x).toBeLessThanOrEqual(10);
    expect(byId.left.x + byId.left.w).toBeGreaterThanOrEqual(110);
    expect(byId.left.x + byId.left.w).toBeLessThanOrEqual(191);
    expect(byId.right.x).toBeGreaterThanOrEqual(109);
    expect(byId.right.x).toBeLessThanOrEqual(190);
  });
});

import { resolveCollisions } from '../services/slideLayout.js';
describe('resolveCollisions', () => {
  it('moves a card (with its text) off the headline', () => {
    const l = normalizeLayout({ layers: [
      { kind: 'text', id: 'headline', role: 'headline', text: 'PSO has 60% share', size: 60, x: 66, y: 50, w: 1100, h: 140 },
      { kind: 'shape', id: 'card', shape: 'rect', x: 600, y: 60, w: 470, h: 110 },
      { kind: 'text', id: 'card_title', role: 'label', text: 'Government = Old', size: 26, x: 620, y: 70, w: 420, h: 40 },
    ] });
    const moved = resolveCollisions(l);
    const [h, card, title] = l.layers;
    expect(moved.length).toBeGreaterThan(0);
    expect(card.y).toBeGreaterThanOrEqual(h.y + h.h);
    expect(title.y - card.y).toBe(10); // moved together
  });
});

import { resolveImageOverlaps } from '../services/slideLayout.js';
describe('resolveImageOverlaps', () => {
  it('shrinks/moves a phone (and its screen text) off the headline, keeping it on the bottom edge', () => {
    const l = normalizeLayout({ layers: [
      { kind: 'text', id: 'headline', role: 'headline', text: '50,000 PEOPLE ON THE WAITLIST', size: 90, x: 66, y: 60, w: 900, h: 330 },
      { kind: 'image', id: 'phone', role: 'hero', prompt: 'phone', screen: { fill: '#000' }, x: 100, y: 200, w: 420, h: 880 },
      { kind: 'text', id: 'msg', role: 'body', text: 'hello', in_screen: 'phone', x: 0.1, y: 0.1, w: 0.8, h: 0.1 },
    ] });
    // emulate placement of the screen child
    const msg = l.layers[2]; msg.screen_of = 'phone'; delete msg.in_screen; Object.assign(msg, { x: 140, y: 290, w: 340, h: 60 });
    const moved = resolveImageOverlaps(l);
    const [h, phone, m] = l.layers;
    expect(moved.length).toBe(1);
    const clear = phone.y >= h.y + h.h || phone.x >= h.x + h.w || phone.x + phone.w <= h.x;
    expect(clear).toBe(true);                                    // headline clear (below or beside)
    expect(phone.y + phone.h).toBeLessThanOrEqual(1081);         // still on canvas
    expect(m.x).toBeGreaterThanOrEqual(phone.x);                 // child travelled with it
    expect(m.y).toBeGreaterThanOrEqual(phone.y);
  });
});
