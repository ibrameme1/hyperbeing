import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import PptxGenJS from 'pptxgenjs';
import sharp from 'sharp';
import * as imageStore from './imageStore.js';
import { canvasFor } from './slideLayout.js';
import { logger } from './logger.js';

// ─── PPTX export of layered slides ──────────────────────────────────────────
// Every layer becomes its own native PowerPoint object, so the deck stays
// editable in PowerPoint exactly like in the web app:
//   background → slide background picture (gradients are rasterised)
//   image / cluster pieces / logos → separate pictures at their boxes
//   text → real text boxes (fonts, sizes, colours, coloured runs)
//   shapes → native shapes (rounded rects, ellipses, lines, borders, shadows)
//   charts → native, editable PowerPoint charts
//   lucide icons → crisp PNGs in the icon colour
// Legacy flat slides (no layout) export as a full-slide picture. Speaker notes
// come from the outline.
//
// Units: canvas px → inches at 144 px/in (1920 px = 13.333 in, PowerPoint's
// 16:9 size); font sizes px → pt at 0.5 (1920 px = 960 pt).

const PX_PER_IN = 144;
const PT_PER_PX = 0.5;
const inch = (px) => Math.round((px / PX_PER_IN) * 10000) / 10000;
const pt = (px) => Math.round(px * PT_PER_PX * 10) / 10;

const require = createRequire(import.meta.url);
let LUCIDE_DIR = null;
try { LUCIDE_DIR = path.join(path.dirname(require.resolve('lucide-static/package.json')), 'icons'); } catch { /* optional */ }

// '#RGB' | '#RRGGBB' | '#RRGGBBAA' | 'rgb(a)(...)' → { hex: 'RRGGBB', transparency: 0-100 }
export function pptxColor(c, fallback = 'FFFFFF') {
  if (typeof c !== 'string') return { hex: fallback, transparency: 0 };
  const s = c.trim();
  if (s === 'transparent') return { hex: fallback, transparency: 100 };
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
    const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { hex: h.slice(0, 6).toUpperCase(), transparency: Math.round((1 - alpha) * 100) };
  }
  m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (m) {
    const hex = [m[1], m[2], m[3]].map(v => Math.min(255, +v).toString(16).padStart(2, '0')).join('').toUpperCase();
    const a = m[4] === undefined ? 1 : Math.max(0, Math.min(1, +m[4]));
    return { hex, transparency: Math.round((1 - a) * 100) };
  }
  return { hex: fallback, transparency: 0 };
}

// Text gradients have no PowerPoint equivalent in pptxgenjs: use the colour
// at the middle of the gradient so the word still reads in the accent.
function gradientMid(g) {
  if (!g?.stops?.length) return null;
  return g.stops[Math.floor((g.stops.length - 1) / 2)]?.color || g.stops[0].color;
}

function filePath(file) {
  return file ? imageStore.pathFor(file) : null;
}

// Images are embedded at the resolution they're shown at (×1.5 headroom for
// high-DPI screens) instead of full generation size — keeps a 10-slide deck
// to a few MB instead of ~50 MB. Opaque backgrounds go in as JPEG.
async function embedImage(file, boxW, boxH, { opaque = false } = {}) {
  const p = filePath(file);
  if (!p) return null;
  const w = Math.max(16, Math.round(boxW * 1.5)); const h = Math.max(16, Math.round(boxH * 1.5));
  const img = sharp(p).resize(w, h, { fit: 'inside', withoutEnlargement: true });
  const buf = opaque ? await img.jpeg({ quality: 88, mozjpeg: true }).toBuffer() : await img.png({ palette: true, quality: 90, effort: 4, compressionLevel: 9 }).toBuffer();
  return `${opaque ? 'image/jpeg' : 'image/png'};base64,${buf.toString('base64')}`;
}

// Photo tiles go in already cropped to their box with their rounded corners
// and frame baked in: PowerPoint's own cover-crop needs the source size and
// has no per-corner radius for pictures. Still one movable, replaceable picture.
async function embedPhoto(file, l) {
  const p = filePath(file);
  if (!p) return null;
  const w = Math.max(16, Math.round(l.w * 1.5)); const h = Math.max(16, Math.round(l.h * 1.5));
  const k = w / Math.max(1, l.w);
  const rx = Math.min(l.radius || 0, l.w / 2, l.h / 2) * k;
  const bw = (l.border?.width || 0) * k;
  const bc = l.border ? pptxColor(l.border.color, 'FFFFFF') : null;
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${rx}" fill="#fff"/></svg>`);
  const layers = [{ input: mask, blend: 'dest-in' }];
  if (bw > 0) {
    layers.unshift({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="${bw / 2}" y="${bw / 2}" width="${w - bw}" height="${h - bw}" rx="${Math.max(0, rx - bw / 2)}" fill="none" stroke="#${bc.hex}" stroke-opacity="${1 - bc.transparency / 100}" stroke-width="${bw}"/></svg>`) });
  }
  const buf = await sharp(p).resize(w, h, { fit: 'cover' }).ensureAlpha().composite(layers).png({ compressionLevel: 9 }).toBuffer();
  return `image/png;base64,${buf.toString('base64')}`;
}

function shadowOf(s) {
  if (!s) return undefined;
  const c = pptxColor(s.color, '000000');
  const dist = Math.hypot(s.dx || 0, s.dy || 0);
  return {
    type: 'outer', color: c.hex, opacity: Math.max(0.05, 1 - c.transparency / 100),
    blur: Math.max(0, pt(s.blur || 0)), offset: pt(dist),
    angle: dist ? Math.round(((Math.atan2(s.dy || 0, s.dx || 0) * 180) / Math.PI + 360) % 360) : 90,
  };
}

// Text with coloured/styled runs → pptxgenjs text runs, honouring '\n'.
function textRuns(l) {
  const text = l.uppercase ? l.text.toUpperCase() : l.text;
  const base = {
    color: pptxColor(gradientMid(l.gradient) || l.color).hex,
    bold: l.weight >= 600, italic: !!l.italic, fontFace: l.font, fontSize: pt(l.size),
  };
  const ranges = [];
  if (l.runs?.length) {
    let pos = 0;
    for (const r of l.runs) {
      const idx = l.text.indexOf(r.text, pos);
      if (idx === -1) continue;
      ranges.push({ start: idx, end: idx + r.text.length, r });
      pos = idx + r.text.length;
    }
  }
  const pieces = [];
  let cursor = 0;
  const push = (s, e, r) => {
    if (e <= s) return;
    const opts = { ...base };
    if (r) {
      const col = gradientMid(r.gradient) || r.color;
      if (col) opts.color = pptxColor(col).hex;
      if (r.weight) opts.bold = r.weight >= 600;
      if (typeof r.italic === 'boolean') opts.italic = r.italic;
    }
    pieces.push({ text: text.slice(s, e), options: opts });
  };
  for (const g of ranges) { push(cursor, g.start, null); push(g.start, g.end, g.r); cursor = g.end; }
  push(cursor, text.length, null);

  // Split on newlines: pptxgenjs breaks a paragraph with breakLine on the run before.
  const out = [];
  for (const p of pieces) {
    const parts = p.text.split('\n');
    parts.forEach((part, i) => {
      out.push({ text: part, options: { ...p.options, ...(i < parts.length - 1 ? { breakLine: true } : {}) } });
    });
  }
  return out;
}

async function lucidePng(name, color, sizePx) {
  if (!LUCIDE_DIR || !/^[a-z0-9-]+$/.test(name)) return null;
  const p = path.join(LUCIDE_DIR, `${name}.svg`);
  if (!fs.existsSync(p)) return null;
  const svg = fs.readFileSync(p, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/currentColor/g, color);
  const px = Math.max(48, Math.min(512, Math.round(sizePx * 3)));
  const buf = await sharp(Buffer.from(svg)).resize(px, px).png().toBuffer();
  return `image/png;base64,${buf.toString('base64')}`;
}

async function gradientBackground(g, canvas) {
  const rad = ((g.angle - 90) * Math.PI) / 180;
  const x = Math.cos(rad) / 2; const y = Math.sin(rad) / 2;
  const stops = g.stops.map(s => `<stop offset="${s.pos}%" stop-color="${s.color}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.w}" height="${canvas.h}"><defs><linearGradient id="g" x1="${0.5 - x}" y1="${0.5 - y}" x2="${0.5 + x}" y2="${0.5 + y}">${stops}</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return `image/png;base64,${buf.toString('base64')}`;
}

// All pictures of the deck are prepared in parallel up front (sharp runs on
// the libuv threadpool), then the slides are assembled in order.
function embedKey(file, w, h, opaque) { return `${file}|${Math.round(w)}|${Math.round(h)}|${opaque}`; }
const isPhoto = (l) => l.kind === 'image' && l.role === 'photo';
function photoKey(l) { return `photo|${l.file}|${Math.round(l.w)}|${Math.round(l.h)}|${l.radius || 0}|${l.border?.width || 0}|${l.border?.color || ''}`; }
async function prepareEmbeds(slides, canvas) {
  const jobs = new Map();
  const want = (file, w, h, opaque = false, photo = null) => {
    if (!file) return;
    const k = photo ? photoKey(photo) : embedKey(file, w, h, opaque);
    if (!jobs.has(k)) jobs.set(k, (photo ? embedPhoto(file, photo) : embedImage(file, w, h, { opaque })).catch(() => null));
  };
  for (const s of slides) {
    if (!s.layout) { want(s.image_file, canvas.w / 1.5, canvas.h / 1.5, true); continue; }
    const L = s.layout;
    if (L.background?.type === 'image') want(L.background.file, canvas.w / 1.5, canvas.h / 1.5, true);
    for (const l of L.layers || []) if (l.file && l.kind !== 'text') want(l.file, l.w, l.h, false, isPhoto(l) ? l : null);
  }
  const keys = [...jobs.keys()];
  const values = await Promise.all(keys.map(k => jobs.get(k)));
  return new Map(keys.map((k, i) => [k, values[i]]));
}

async function addLayeredSlide(pptx, s, layout, { watermark, embeds }) {
  const embedImage = async (file, w, h, { opaque = false } = {}) => embeds.get(embedKey(file, w, h, opaque)) ?? null;
  const canvas = layout.canvas || canvasFor('16:9');
  const slide = pptx.addSlide();
  const bg = layout.background || {};
  if (bg.type === 'image' && filePath(bg.file)) slide.background = { data: await embedImage(bg.file, canvas.w / 1.5, canvas.h / 1.5, { opaque: true }) };
  else if (bg.type === 'gradient' && bg.gradient) slide.background = { data: await gradientBackground(bg.gradient, canvas) };
  else slide.background = { color: pptxColor(bg.color, '000000').hex };

  for (const l of layout.layers || []) {
    if (l.hidden) continue;
    const box = { x: inch(l.x), y: inch(l.y), w: inch(Math.max(1, l.w)), h: inch(Math.max(1, l.h)) };
    const rotate = l.rotation ? Math.round(((l.rotation % 360) + 360) % 360) : undefined;
    try {
      if (l.kind === 'text') {
        slide.addText(textRuns(l), {
          ...box, rotate, margin: 0, valign: l.valign === 'middle' ? 'middle' : l.valign === 'bottom' ? 'bottom' : 'top',
          align: l.align, lineSpacingMultiple: l.line_height, charSpacing: l.letter_spacing ? pt(l.letter_spacing * l.size) : undefined,
          fit: 'shrink', wrap: true, transparency: l.opacity < 1 ? Math.round((1 - l.opacity) * 100) : undefined,
          shadow: shadowOf(l.shadow), objectName: l.name || l.id,
        });
      } else if (l.kind === 'shape') {
        const fill = pptxColor(gradientMid(l.gradient) || l.fill, 'FFFFFF');
        const line = l.border ? pptxColor(gradientMid(l.border.gradient) || l.border.color, 'FFFFFF') : null;
        const common = {
          ...box, rotate, objectName: l.name || l.id,
          fill: { color: fill.hex, transparency: Math.min(100, fill.transparency + Math.round((1 - l.opacity) * 100)) },
          line: line && l.border.width ? { color: line.hex, transparency: line.transparency, width: pt(l.border.width) } : { type: 'none' },
          shadow: shadowOf(l.shadow),
        };
        if (l.shape === 'ellipse') slide.addShape(pptx.ShapeType.ellipse, common);
        else if (l.shape === 'line') {
          slide.addShape(pptx.ShapeType.line, { x: box.x, y: inch(l.y + l.h / 2), w: box.w, h: 0, line: { color: fill.hex, transparency: fill.transparency, width: Math.max(0.5, pt(l.h)) }, objectName: l.name || l.id });
        } else if (l.radius > 0) {
          slide.addShape(pptx.ShapeType.roundRect, { ...common, rectRadius: inch(Math.min(l.radius, l.w / 2, l.h / 2)) });
        } else slide.addShape(pptx.ShapeType.rect, common);
      } else if (l.kind === 'chart') {
        await addChart(pptx, slide, l, box);
      } else if (l.kind === 'icon' && l.source === 'lucide') {
        const data = await lucidePng(l.name, l.color || '#FFFFFF', Math.min(l.w, l.h));
        if (data) {
          const s2 = Math.min(l.w, l.h);
          slide.addImage({ data, x: inch(l.x + (l.w - s2) / 2), y: inch(l.y + (l.h - s2) / 2), w: inch(s2), h: inch(s2), rotate, objectName: l.name || l.id });
        }
      } else if (l.kind === 'logo' && !filePath(l.file)) {
        // No logo file was available: the brand name as a wordmark text box.
        slide.addText(l.brand || '', { ...box, margin: 0, fontFace: layout.fonts?.display, bold: true, color: pptxColor(l.color).hex, fontSize: pt(l.h * 0.7), fit: 'shrink' });
      } else if (filePath(l.file) && isPhoto(l)) {
        const data = embeds.get(photoKey(l));
        if (data) slide.addImage({ data, ...box, rotate, flipH: !!l.flip, objectName: l.name || l.id, transparency: l.opacity < 1 ? Math.round((1 - l.opacity) * 100) : undefined });
      } else if (filePath(l.file)) {
        const img = { data: await embedImage(l.file, l.w, l.h), ...box, rotate, flipH: !!l.flip, objectName: l.name || l.id, transparency: l.opacity < 1 ? Math.round((1 - l.opacity) * 100) : undefined };
        if (l.fit === 'cover') img.sizing = { type: 'cover', w: box.w, h: box.h };
        slide.addImage(img);
      }
    } catch (err) {
      logger.warn('pptx: layer skipped', { layer: l.id, kind: l.kind, errorMessage: err.message });
    }
  }

  if (watermark) {
    slide.addText('Made with HyperBeing', { x: inch(canvas.w - 420), y: inch(canvas.h - 64), w: inch(380), h: inch(40), align: 'right', fontFace: 'Inter', fontSize: 11, color: 'FFFFFF', transparency: 45, margin: 0 });
  }
  if (s.speaker_note) slide.addNotes(s.speaker_note);
}

async function addChart(pptx, slide, l, box) {
  const o = l.options || {};
  const typeMap = { column: pptx.ChartType.bar, bar: pptx.ChartType.bar, line: pptx.ChartType.line, area: pptx.ChartType.area, pie: pptx.ChartType.pie, donut: pptx.ChartType.doughnut };
  const type = typeMap[l.chart_type] || pptx.ChartType.bar;
  const round = l.chart_type === 'pie' || l.chart_type === 'donut';
  const data = (round ? l.series.slice(0, 1) : l.series).map(s => ({ name: s.name, labels: l.categories, values: s.values.map(v => (v === null ? null : v)) }));
  const palette = ['FF2E74', '00FFA3', 'FF8A1F', '4FACFE', 'FFD166', 'B388FF'];
  const colors = round
    ? l.categories.map((_, i) => pptxColor(o.point_colors?.[i] || `#${palette[i % palette.length]}`).hex)
    : l.series.map((s, i) => pptxColor(s.color || `#${palette[i % palette.length]}`).hex);
  const label = pptxColor(o.label_color, 'FFFFFF').hex;
  const axis = pptxColor(o.axis_color, '888888');
  slide.addChart(type, data, {
    ...box, objectName: l.name || l.id,
    barDir: l.chart_type === 'bar' ? 'bar' : 'col', barGapWidthPct: 60,
    chartColors: colors, chartColorsOpacity: l.chart_type === 'area' ? 35 : undefined,
    holeSize: l.chart_type === 'donut' ? 60 : undefined,
    showLegend: !!o.show_legend, legendColor: label, legendFontFace: o.font, legendFontSize: pt(o.font_size || 18),
    showValue: !!o.show_values, dataLabelColor: label, dataLabelFontFace: o.font, dataLabelFontSize: pt(o.font_size || 18),
    dataLabelFormatCode: o.value_suffix === '%' ? '0"%"' : undefined,
    catAxisLabelColor: label, catAxisLabelFontFace: o.font, catAxisLabelFontSize: pt(o.font_size || 18),
    valAxisLabelColor: label, valAxisLabelFontFace: o.font, valAxisLabelFontSize: pt(o.font_size || 18),
    catAxisLineColor: axis.hex, valAxisLineShow: false,
    valGridLine: o.show_grid ? { color: axis.hex, size: 0.5 } : { style: 'none' },
    valAxisMinVal: o.y_min, valAxisMaxVal: o.y_max,
    lineSize: Math.max(1, pt(o.line_width || 4)), lineDataSymbol: 'none', displayBlanksAs: 'gap',
  });
}

// Builds the .pptx for a presentation row. Returns { buffer, slides, ms }.
export async function buildPptx(pres, { watermark = false } = {}) {
  const t0 = Date.now();
  let slides = [];
  try { slides = JSON.parse(pres.slides_data || '[]'); } catch { /* empty */ }
  const usable = slides.filter(s => s.status === 'complete' && (s.layout || s.image_file || s.image_data));
  const canvas = canvasFor(pres.aspect_ratio || '16:9');

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'HB', width: inch(canvas.w), height: inch(canvas.h) });
  pptx.layout = 'HB';
  pptx.title = pres.title || 'Presentation';
  pptx.company = 'HyperBeing';

  const embeds = await prepareEmbeds(usable, canvas);
  const embedImage = async (file, w, h, { opaque = false } = {}) => embeds.get(embedKey(file, w, h, opaque)) ?? null;
  for (const s of usable) {
    if (s.layout) {
      await addLayeredSlide(pptx, s, s.layout, { watermark, embeds });
    } else {
      // Legacy single-image slide: full-bleed picture.
      const slide = pptx.addSlide();
      const p = filePath(s.image_file);
      if (p) slide.addImage({ data: await embedImage(s.image_file, canvas.w / 1.5, canvas.h / 1.5, { opaque: true }), x: 0, y: 0, w: inch(canvas.w), h: inch(canvas.h) });
      if (s.speaker_note) slide.addNotes(s.speaker_note);
    }
  }
  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  return { buffer, slides: usable.length, ms: Date.now() - t0 };
}
