import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import './fonts.js'; // configures fontconfig + real-font text measurement — before any render
import sharp from 'sharp';
import { wrapTextRanges, measureText } from './slideLayout.js';

// ─── Server-side flattened preview of a layered slide ───────────────────────
// Builds one SVG for the whole layout (images embedded as data URIs) and
// rasterizes it with sharp/librsvg. Used for:
//   - the slide's flattened `image_data` (dashboard thumbnail, version
//     history, PDF/PNG export, and any viewer that doesn't render layers);
//   - the visual self-review pass, where Claude looks at its own layout.
// It is a faithful-enough approximation, not the source of truth: the web
// renderer (real fonts, CSS backdrop-filter) is what users see. Fonts fall
// back to whatever the server has installed.

const require = createRequire(import.meta.url);
let LUCIDE_DIR = null;
try { LUCIDE_DIR = path.join(path.dirname(require.resolve('lucide-static/package.json')), 'icons'); } catch { /* optional */ }

const esc = (s) => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

function gradientDef(id, g) {
  // CSS-style angle (0 = up, 90 = right) → SVG objectBoundingBox vector.
  const rad = ((g.angle - 90) * Math.PI) / 180;
  const x = Math.cos(rad) / 2; const y = Math.sin(rad) / 2;
  const stops = g.stops.map(s => `<stop offset="${s.pos}%" stop-color="${esc(s.color)}"/>`).join('');
  return `<linearGradient id="${id}" x1="${0.5 - x}" y1="${0.5 - y}" x2="${0.5 + x}" y2="${0.5 + y}">${stops}</linearGradient>`;
}

function shadowFilter(id, s) {
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${s.dx}" dy="${s.dy}" stdDeviation="${s.blur / 2}" flood-color="${esc(s.color)}"/></filter>`;
}

function rotateAttr(l) {
  return l.rotation ? ` transform="rotate(${l.rotation} ${l.x + l.w / 2} ${l.y + l.h / 2})"` : '';
}

function lucideSvg(name) {
  if (!LUCIDE_DIR || !/^[a-z0-9-]+$/.test(name)) return null;
  const p = path.join(LUCIDE_DIR, `${name}.svg`);
  if (!fs.existsSync(p)) return null;
  const body = fs.readFileSync(p, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(body);
  return inner ? inner[1] : null;
}

function textLayerSvg(l, defs, uid) {
  const lines = wrapTextRanges(l);
  const lh = l.size * l.line_height;
  const total = lines.length * lh;
  let y0 = l.y;
  if (l.valign === 'middle') y0 = l.y + (l.h - total) / 2;
  else if (l.valign === 'bottom') y0 = l.y + l.h - total;
  const anchor = l.align === 'center' ? 'middle' : l.align === 'right' ? 'end' : 'start';
  const x = l.align === 'center' ? l.x + l.w / 2 : l.align === 'right' ? l.x + l.w : l.x;

  // Run ranges over the full text.
  const runs = [];
  if (l.runs?.length) {
    let pos = 0;
    for (const r of l.runs) {
      const idx = l.text.indexOf(r.text, pos);
      if (idx === -1) continue;
      runs.push({ start: idx, end: idx + r.text.length, run: r });
      pos = idx + r.text.length;
    }
  }
  const fillFor = (style, key) => {
    if (style.gradient) {
      const gid = `g${uid}_${key}`;
      defs.push(gradientDef(gid, style.gradient));
      return `url(#${gid})`;
    }
    return esc(style.color || l.color);
  };
  const baseFill = fillFor(l, 'base');
  const filter = l.shadow ? (() => { defs.push(shadowFilter(`ts${uid}`, l.shadow)); return ` filter="url(#ts${uid})"`; })() : '';
  const t = (s) => esc(l.uppercase ? s.toUpperCase() : s);

  let out = `<text font-family="'${esc(l.font)}', Inter, 'DejaVu Sans', sans-serif" font-size="${l.size}" font-weight="${l.weight}"${l.italic ? ' font-style="italic"' : ''} letter-spacing="${l.letter_spacing * l.size}" text-anchor="${anchor}" fill="${baseFill}" opacity="${l.opacity}"${filter}${rotateAttr(l)}>`;
  lines.forEach((ln, i) => {
    const baseline = y0 + i * lh + l.size * 0.82 + (lh - l.size) / 2;
    out += `<tspan x="${x}" y="${baseline}">`;
    let cursor = ln.start;
    const pieces = runs.filter(r => r.end > ln.start && r.start < ln.end);
    for (const p of pieces) {
      const s = Math.max(p.start, ln.start); const e = Math.min(p.end, ln.end);
      if (s > cursor) out += t(l.text.slice(cursor, s));
      const attrs = [];
      if (p.run.color || p.run.gradient) attrs.push(`fill="${fillFor(p.run, `${i}_${s}`)}"`);
      if (p.run.weight) attrs.push(`font-weight="${p.run.weight}"`);
      if (p.run.italic) attrs.push('font-style="italic"');
      out += `<tspan ${attrs.join(' ')}>${t(l.text.slice(s, e))}</tspan>`;
      cursor = e;
    }
    if (cursor < ln.end) out += t(l.text.slice(cursor, ln.end));
    out += '</tspan>';
  });
  return `${out}</text>`;
}

function chartSvg(l) {
  const { categories, series, options, chart_type: type } = l;
  const pad = { l: 56, r: 16, t: 16, b: 40 };
  const fs = options.font_size;
  const font = `font-family="'${esc(options.font)}', Inter, sans-serif" font-size="${fs}"`;
  const palette = ['#FF2E74', '#00FFA3', '#FF8A1F', '#4FACFE', '#FFD166', '#B388FF'];
  const colorOf = (s, i) => s.color || palette[i % palette.length];
  let out = `<g${rotateAttr(l)} opacity="${l.opacity}">`;

  if (type === 'pie' || type === 'donut') {
    const vals = series[0].values.map(v => Math.max(0, v || 0));
    const sum = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = l.x + l.w / 2; const cy = l.y + l.h / 2; const r = Math.min(l.w, l.h) / 2 - 8;
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1 = a0 + (v / sum) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const c = options.point_colors?.[i] || palette[i % palette.length];
      out += `<path d="M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z" fill="${esc(c)}"/>`;
      a0 = a1;
    });
    if (type === 'donut') out += `<circle cx="${cx}" cy="${cy}" r="${r * 0.6}" fill="#000" fill-opacity="0.85"/>`;
    return `${out}</g>`;
  }

  const all = series.flatMap(s => s.values).filter(v => v !== null);
  const yMin = options.y_min ?? Math.min(0, ...all);
  const yMax = options.y_max ?? (Math.max(...all) * 1.1 || 1);
  const horizontal = type === 'bar';
  const px = l.x + pad.l; const py = l.y + pad.t; const pw = l.w - pad.l - pad.r; const ph = l.h - pad.t - pad.b;
  const n = categories.length;
  const yPos = (v) => py + ph - ((v - yMin) / (yMax - yMin || 1)) * ph;

  out += `<line x1="${px}" y1="${py + ph}" x2="${px + pw}" y2="${py + ph}" stroke="${esc(options.axis_color)}" stroke-width="2"/>`;
  if (!horizontal) {
    categories.forEach((c, i) => {
      out += `<text x="${px + (i + 0.5) * (pw / n)}" y="${py + ph + fs + 8}" text-anchor="middle" fill="${esc(options.label_color)}" ${font}>${esc(c)}</text>`;
    });
  }

  if (type === 'column' || type === 'bar') {
    const groupW = (horizontal ? ph : pw) / n; const bw = (groupW * 0.7) / series.length;
    series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        if (v === null) return;
        const c = options.point_colors?.[i] || colorOf(s, si);
        if (horizontal) {
          const w = ((v - yMin) / (yMax - yMin || 1)) * pw;
          out += `<rect x="${px}" y="${py + i * groupW + groupW * 0.15 + si * bw}" width="${w}" height="${bw}" rx="4" fill="${esc(c)}"/>`;
        } else {
          const y = yPos(v);
          out += `<rect x="${px + i * groupW + groupW * 0.15 + si * bw}" y="${y}" width="${bw}" height="${py + ph - y}" rx="4" fill="${esc(c)}"/>`;
          if (options.show_values) out += `<text x="${px + i * groupW + groupW * 0.15 + si * bw + bw / 2}" y="${y - 8}" text-anchor="middle" fill="${esc(options.label_color)}" ${font}>${esc(options.value_prefix + v + options.value_suffix)}</text>`;
        }
      });
    });
  } else {
    series.forEach((s, si) => {
      const pts = s.values.map((v, i) => (v === null ? null : [px + (i + 0.5) * (pw / n), yPos(v)]));
      // Break the path at nulls (segmented series, e.g. red plateau → blue climb).
      let d = ''; let penDown = false;
      for (const p of pts) {
        if (!p) { penDown = false; continue; }
        d += `${penDown ? ' L' : ' M'}${p[0]},${p[1]}`;
        penDown = true;
      }
      d = d.trim();
      if (type === 'area') {
        const valid = pts.filter(Boolean);
        if (valid.length > 1) out += `<path d="M${valid[0][0]},${py + ph} L${valid.map(p => p.join(',')).join(' L')} L${valid[valid.length - 1][0]},${py + ph} Z" fill="${esc(colorOf(s, si))}" fill-opacity="0.25"/>`;
      }
      out += `<path d="${d}" fill="none" stroke="${esc(colorOf(s, si))}" stroke-width="${options.line_width}" stroke-linejoin="round" stroke-linecap="round"/>`;
    });
  }
  return `${out}</g>`;
}

// loadFile(filename) → Promise<Buffer|null>. Returns a PNG Buffer at
// `width` px wide.
export async function renderLayoutPreview(layout, loadFile, { width = 1920 } = {}) {
  const { canvas } = layout;
  const defs = [];
  const body = [];
  let uid = 0;
  const imgHref = async (file) => {
    if (!file) return null;
    const buf = await loadFile(file);
    return buf ? `data:image/png;base64,${buf.toString('base64')}` : null;
  };

  // Background
  const bg = layout.background;
  let bgHref = null;
  if (bg.type === 'gradient') {
    defs.push(gradientDef('bg', bg.gradient));
    body.push(`<rect width="${canvas.w}" height="${canvas.h}" fill="url(#bg)"/>`);
  } else {
    body.push(`<rect width="${canvas.w}" height="${canvas.h}" fill="${esc(bg.color || '#000')}"/>`);
    if (bg.type === 'image' && bg.file) {
      bgHref = await imgHref(bg.file);
      if (bgHref) body.push(`<image href="${bgHref}" x="0" y="0" width="${canvas.w}" height="${canvas.h}" preserveAspectRatio="xMidYMid slice"/>`);
    }
  }

  for (const l of layout.layers) {
    const id = ++uid;
    if (l.hidden) continue;
    if (l.kind === 'shape') {
      const fill = l.gradient ? (() => { defs.push(gradientDef(`sg${id}`, l.gradient)); return `url(#sg${id})`; })() : esc(l.fill);
      const filter = l.shadow ? (() => { defs.push(shadowFilter(`ss${id}`, l.shadow)); return ` filter="url(#ss${id})"`; })() : '';
      const stroke = l.border ? ` stroke="${esc(l.border.color)}" stroke-width="${l.border.width}"` : '';
      const geom = l.shape === 'ellipse'
        ? `<ellipse cx="${l.x + l.w / 2}" cy="${l.y + l.h / 2}" rx="${l.w / 2}" ry="${l.h / 2}"`
        : l.shape === 'line'
          ? `<line x1="${l.x}" y1="${l.y + l.h / 2}" x2="${l.x + l.w}" y2="${l.y + l.h / 2}" stroke="${fill}" stroke-width="${Math.max(1, l.h)}"/>`
          : `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="${Math.min(l.radius, l.w / 2, l.h / 2)}"`;
      if (l.shape === 'line') { body.push(`<g opacity="${l.opacity}"${rotateAttr(l)}>${geom}</g>`); continue; }
      let frost = '';
      if (l.frosted && bgHref) {
        defs.push(`<clipPath id="fc${id}">${geom}/></clipPath><filter id="fb${id}"><feGaussianBlur stdDeviation="${l.frosted.blur / 2}"/></filter>`);
        frost = `<g clip-path="url(#fc${id})"><image href="${bgHref}" x="0" y="0" width="${canvas.w}" height="${canvas.h}" preserveAspectRatio="xMidYMid slice" filter="url(#fb${id})"/></g>`;
      }
      body.push(`<g opacity="${l.opacity}"${rotateAttr(l)}>${frost}${geom} fill="${fill}"${stroke}${filter}/></g>`);
    } else if (l.kind === 'text') {
      body.push(textLayerSvg(l, defs, id));
    } else if (l.kind === 'chart') {
      body.push(chartSvg(l));
    } else if (l.kind === 'icon' && l.source === 'lucide') {
      const inner = lucideSvg(l.name);
      if (!inner) continue;
      const s = Math.min(l.w, l.h) / 24;
      body.push(`<g transform="translate(${l.x + (l.w - 24 * s) / 2} ${l.y + (l.h - 24 * s) / 2}) scale(${s})${l.rotation ? ` rotate(${l.rotation} 12 12)` : ''}" fill="none" stroke="${esc(l.color)}" stroke-width="${l.stroke}" stroke-linecap="round" stroke-linejoin="round" opacity="${l.opacity}">${inner}</g>`);
    } else if (l.kind === 'logo' && !l.file) {
      // No logo file: wordmark fallback in the display font.
      const size = Math.min(l.h * 0.8, (l.w / Math.max(1, l.brand?.length || 1)) * 1.6);
      body.push(`<text x="${l.x}" y="${l.y + l.h * 0.75}" font-family="'${esc(layout.fonts.display)}', Inter, sans-serif" font-weight="800" font-size="${size}" fill="${esc(l.color || '#fff')}">${esc(l.brand || '')}</text>`);
    } else if (l.file) {
      const href = await imgHref(l.file);
      if (!href) continue;
      const filter = (l.shadow || l.glow) ? (() => {
        const s = l.shadow || { dx: 0, dy: 0, blur: l.glow.blur, color: l.glow.color };
        defs.push(shadowFilter(`is${id}`, s));
        return ` filter="url(#is${id})"`;
      })() : '';
      const flip = l.flip ? ` transform="translate(${2 * l.x + l.w} 0) scale(-1 1)"` : '';
      body.push(`<g opacity="${l.opacity}"${rotateAttr(l)}><image href="${href}" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" preserveAspectRatio="xMidYMid ${l.fit === 'cover' ? 'slice' : 'meet'}"${filter}${flip}/></g>`);
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${canvas.w}" height="${canvas.h}" viewBox="0 0 ${canvas.w} ${canvas.h}"><defs>${defs.join('')}</defs>${body.join('')}</svg>`;
  const height = Math.round(width * (canvas.h / canvas.w));
  return sharp(Buffer.from(svg), { limitInputPixels: false }).resize(width, height).png().toBuffer();
}

// Exposed for tests.
export const _internal = { measureText };
