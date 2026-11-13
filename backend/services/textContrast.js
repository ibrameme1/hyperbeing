// Deterministic WCAG contrast guard for layered slides.
//
// Claude occasionally picks a text colour that disappears on what actually ends
// up behind it (white numbers on a cream card, muted brown on an orange glow).
// The visual review usually catches this, but not always, and it can be
// skipped, so this guard checks every native text layer against the pixels
// really under it: the slide is rendered WITHOUT text, the region behind each
// text box is sampled, and a failing colour is swapped for the closest deck
// palette colour that passes (falling back to white / near-black).
import sharp from 'sharp';
import { inkBox } from './slideLayout.js';

const SAMPLE_WIDTH = 480;

function parseColor(c) {
  if (typeof c !== 'string') return null;
  const s = c.trim();
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const h = m[1].length === 3 ? m[1].split('').map(ch => ch + ch).join('') : m[1];
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  return null;
}

const toHex = ({ r, g, b }) => `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

function luminance({ r, g, b }) {
  const ch = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastRatio(a, b) {
  const la = luminance(a); const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Large text (≥ 24pt, or ≥ 18.66pt bold) needs 3:1, everything else 4.5:1.
// Canvas px at 1920 wide ≈ 144 px/in, so 24pt ≈ 48px and 18.66pt ≈ 37px.
export function requiredRatio(l) {
  return l.size >= 48 || (l.size >= 37 && (l.weight || 400) >= 700) ? 3 : 4.5;
}

/**
 * Picks a replacement colour for text `color` over `bg`: the passing candidate
 * closest to the original colour (so the design keeps its palette), else
 * whichever of white / near-black contrasts more.
 */
export function pickReadableColor(color, bg, ratio, candidates = []) {
  // 1. Same hue, deeper or lighter (terracotta → deep terracotta) — keeps the
  //    designer's colour intent.
  const towards = luminance(bg) > 0.18 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  for (let t = 0.05; t <= 0.6001; t += 0.05) {
    const c = { r: color.r + (towards.r - color.r) * t, g: color.g + (towards.g - color.g) * t, b: color.b + (towards.b - color.b) * t };
    if (contrastRatio(c, bg) >= ratio) return c;
  }
  // 2. Closest palette colour that passes.
  const dist = (a, b) => (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
  const passing = candidates.filter(c => contrastRatio(c, bg) >= ratio);
  if (passing.length) return passing.reduce((p, q) => (dist(p, color) <= dist(q, color) ? p : q));
  const white = { r: 255, g: 255, b: 255 }; const ink = { r: 17, g: 17, b: 17 };
  return contrastRatio(white, bg) >= contrastRatio(ink, bg) ? white : ink;
}

/**
 * @param layout  normalized layout (mutated: text colours that fail are replaced)
 * @param render  (layout, { width }) => PNG buffer (renderLayoutPreview)
 * @param palette deck palette object ({ text, accent, ... } hex/rgba strings)
 * @returns list of human-readable changes
 */
export async function enforceTextContrast(layout, render, palette = {}) {
  const texts = layout.layers.filter(l => l.kind === 'text' && l.text && (l.opacity ?? 1) > 0.2);
  if (!texts.length) return [];
  const bare = { ...layout, layers: layout.layers.filter(l => l.kind !== 'text') };
  const png = await render(bare, { width: SAMPLE_WIDTH });
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const k = info.width / layout.canvas.w;

  const candidates = Object.values(palette || {}).map(parseColor).filter(c => c && c.a >= 0.99);
  const changes = [];
  for (const l of texts) {
    // Gradient text is judged by its average stop colour; if it fails, the
    // gradient is replaced by one solid readable colour.
    const stops = Array.isArray(l.gradient?.stops) ? l.gradient.stops.map(st => parseColor(st?.color)).filter(Boolean) : [];
    const color = stops.length
      ? { r: stops.reduce((t, c) => t + c.r, 0) / stops.length, g: stops.reduce((t, c) => t + c.g, 0) / stops.length, b: stops.reduce((t, c) => t + c.b, 0) / stops.length, a: 1 }
      : parseColor(l.color);
    if (!color) continue;
    // Sample behind the glyphs, not the whole box: a short word centred in a
    // wide box over a narrow object (lettering on a stone, a number on a
    // badge) would otherwise be judged against the page around the object.
    const ink = inkBox(l);
    const x0 = Math.max(0, Math.floor(ink.x * k)); const y0 = Math.max(0, Math.floor(ink.y * k));
    const x1 = Math.min(info.width, Math.ceil((ink.x + ink.w) * k)); const y1 = Math.min(info.height, Math.ceil((ink.y + ink.h) * k));
    if (x1 <= x0 || y1 <= y0) continue;
    // Mean colour behind the box. (Text boxes are larger than the glyphs and
    // often straddle a card edge, so per-pixel extremes mislead.)
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * info.width + x) * info.channels;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
    }
    const mean = { r: r / n, g: g / n, b: b / n };
    const ratio = requiredRatio(l);
    // Blend translucent text colour over the background before judging it.
    const eff = { r: color.r * color.a + mean.r * (1 - color.a), g: color.g * color.a + mean.g * (1 - color.a), b: color.b * color.a + mean.b * (1 - color.a) };
    const target = mean;
    if (contrastRatio(eff, target) >= ratio) continue;
    const next = pickReadableColor(color, target, ratio, candidates);
    const before = stops.length ? 'gradient' : l.color;
    l.color = toHex(next);
    if (stops.length) delete l.gradient;
    changes.push(`text "${l.id}" colour ${before} → ${l.color} (contrast ${contrastRatio(eff, target).toFixed(1)}:1 < ${ratio}:1)`);
  }
  return changes;
}
