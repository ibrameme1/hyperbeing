import { chartGeometry } from './chartGeometry.js';
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

function chartSvg(l, uid) {
  // Same primitives the web renderer draws (chartGeometry), offset to the layer.
  const prims = chartGeometry(l);
  if (!prims.length) return '';
  const font = `font-family="'${esc(l.options.font)}', Inter, sans-serif"`;
  const hole = prims.find(p => p.t === 'hole');
  const op = (p) => (p.op !== undefined ? ` opacity="${p.op}"` : '');
  let out = `<g transform="translate(${l.x} ${l.y})${l.rotation ? ` rotate(${l.rotation} ${l.w / 2} ${l.h / 2})` : ''}" opacity="${l.opacity}">`;
  if (hole) out += `<mask id="dh${uid}"><rect width="${l.w}" height="${l.h}" fill="#fff"/><circle cx="${hole.cx}" cy="${hole.cy}" r="${hole.r}" fill="#000"/></mask>`;
  const mask = hole ? ` mask="url(#dh${uid})"` : '';
  for (const p of prims) {
    if (p.t === 'line') out += `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="${esc(p.stroke)}" stroke-width="${p.sw}"${p.dash ? ` stroke-dasharray="${p.dash}"` : ''}${op(p)}/>`;
    else if (p.t === 'rect') out += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rx || 0}" fill="${esc(p.fill)}"${p.stroke ? ` stroke="${esc(p.stroke)}" stroke-width="${p.sw}"` : ''}${op(p)}/>`;
    else if (p.t === 'path') out += `<path d="${p.d}" fill="${esc(p.fill)}"${p.stroke ? ` stroke="${esc(p.stroke)}" stroke-width="${p.sw}" stroke-linejoin="round" stroke-linecap="round"` : ''}${op(p)}${mask}/>`;
    else if (p.t === 'circle') out += `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${esc(p.fill)}"${mask}/>`;
    else if (p.t === 'text') out += `<text x="${p.x}" y="${p.y}" text-anchor="${p.anchor}" fill="${esc(p.fill)}" ${font} font-size="${p.size}" font-weight="${p.weight || 400}"${op(p)}>${esc(p.text)}</text>`;
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
  // Images are embedded as data URIs, so keep the SVG small (librsvg refuses
  // documents with a >10MB attribute): each image is downscaled to the size
  // it's displayed at in this render, and the background is embedded ONCE as a
  // JPEG (it's opaque) and referenced via <use> by frosted cards.
  const scale = width / canvas.w;
  const hrefCache = new Map();
  const imgHref = async (file, w, h, { jpeg = false, cover = false } = {}) => {
    if (!file) return null;
    const key = `${file}|${Math.round(w)}|${Math.round(h)}|${jpeg}|${cover}`;
    if (!hrefCache.has(key)) {
      hrefCache.set(key, (async () => {
        const buf = await loadFile(file);
        if (!buf) return null;
        const tw = Math.max(8, Math.min(2400, Math.ceil(w * scale * 1.1)));
        const th = Math.max(8, Math.min(2400, Math.ceil(h * scale * 1.1)));
        // A cover-cropped picture must still fill its box after the crop.
        const img = sharp(buf).resize(tw, th, { fit: cover ? 'outside' : 'inside', withoutEnlargement: true });
        const out = jpeg ? await img.jpeg({ quality: 88 }).toBuffer() : await img.png({ compressionLevel: 9 }).toBuffer();
        return `data:image/${jpeg ? 'jpeg' : 'png'};base64,${out.toString('base64')}`;
      })());
    }
    return hrefCache.get(key);
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
      bgHref = await imgHref(bg.file, canvas.w, canvas.h, { jpeg: true });
      if (bgHref) {
        defs.push(`<image id="bgimg" href="${bgHref}" x="0" y="0" width="${canvas.w}" height="${canvas.h}" preserveAspectRatio="xMidYMid slice"/>`);
        body.push('<use href="#bgimg"/>');
      }
    }
  }

  for (const l of layout.layers) {
    const id = ++uid;
    if (l.hidden) continue;
    if (l.kind === 'shape') {
      const fill = l.gradient ? (() => { defs.push(gradientDef(`sg${id}`, l.gradient)); return `url(#sg${id})`; })() : esc(l.fill);
      const filter = l.shadow ? (() => { defs.push(shadowFilter(`ss${id}`, l.shadow)); return ` filter="url(#ss${id})"`; })() : '';
      let stroke = '';
      if (l.border) {
        const sc = l.border.gradient ? (() => { defs.push(gradientDef(`sb${id}`, l.border.gradient)); return `url(#sb${id})`; })() : esc(l.border.color);
        stroke = ` stroke="${sc}" stroke-width="${l.border.width}"`;
      }
      const geom = l.shape === 'ellipse'
        ? `<ellipse cx="${l.x + l.w / 2}" cy="${l.y + l.h / 2}" rx="${l.w / 2}" ry="${l.h / 2}"`
        : l.shape === 'line'
          ? `<line x1="${l.x}" y1="${l.y + l.h / 2}" x2="${l.x + l.w}" y2="${l.y + l.h / 2}" stroke="${fill}" stroke-width="${Math.max(1, l.h)}"/>`
          : `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="${Math.min(l.radius, l.w / 2, l.h / 2)}"`;
      if (l.shape === 'line') { body.push(`<g opacity="${l.opacity}"${rotateAttr(l)}>${geom}</g>`); continue; }
      let frost = '';
      if (l.frosted && bgHref) {
        defs.push(`<clipPath id="fc${id}">${geom}/></clipPath><filter id="fb${id}"><feGaussianBlur stdDeviation="${l.frosted.blur / 2}"/></filter>`);
        frost = `<g clip-path="url(#fc${id})"><use href="#bgimg" filter="url(#fb${id})"/></g>`;
      }
      let hl = '';
      if (l.highlight && l.shape === 'rect') {
        defs.push(`<linearGradient id="hl${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.35" stop-color="#fff" stop-opacity="0"/></linearGradient>`);
        hl = `${geom} fill="none" stroke="url(#hl${id})" stroke-width="${Math.max(1.5, (l.border?.width || 1) + 0.5)}"/>`;
      }
      body.push(`<g opacity="${l.opacity}"${rotateAttr(l)}>${frost}${geom} fill="${fill}"${stroke}${filter}/>${hl}</g>`);
    } else if (l.kind === 'text') {
      body.push(textLayerSvg(l, defs, id));
    } else if (l.kind === 'chart') {
      body.push(chartSvg(l, id));
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
      const opaquePhoto = l.role === 'photo';
      const href = await imgHref(l.file, l.w, l.h, { cover: l.fit === 'cover', jpeg: opaquePhoto });
      if (!href) continue;
      const filter = (l.shadow || l.glow) ? (() => {
        const s = l.shadow || { dx: 0, dy: 0, blur: l.glow.blur, color: l.glow.color };
        defs.push(shadowFilter(`is${id}`, s));
        return ` filter="url(#is${id})"`;
      })() : '';
      const flip = l.flip ? ` transform="translate(${2 * l.x + l.w} 0) scale(-1 1)"` : '';
      // Photo tiles: rounded corners (clip) and a hairline frame.
      const rx = l.radius ? Math.min(l.radius, l.w / 2, l.h / 2) : 0;
      let clip = '';
      if (rx) {
        defs.push(`<clipPath id="ic${id}"><rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="${rx}"/></clipPath>`);
        clip = ` clip-path="url(#ic${id})"`;
      }
      const frame = l.border?.width
        ? `<rect x="${l.x + l.border.width / 2}" y="${l.y + l.border.width / 2}" width="${l.w - l.border.width}" height="${l.h - l.border.width}" rx="${Math.max(0, rx - l.border.width / 2)}" fill="none" stroke="${esc(l.border.color)}" stroke-width="${l.border.width}"/>`
        : '';
      body.push(`<g opacity="${l.opacity}"${rotateAttr(l)}${filter}><g${clip}><image href="${href}" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" preserveAspectRatio="${l.fit === 'fill' ? 'none' : `xMidYMid ${l.fit === 'cover' ? 'slice' : 'meet'}`}"${flip}/></g>${frame}</g>`);
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${canvas.w}" height="${canvas.h}" viewBox="0 0 ${canvas.w} ${canvas.h}"><defs>${defs.join('')}</defs>${body.join('')}</svg>`;
  const height = Math.round(width * (canvas.h / canvas.w));
  return sharp(Buffer.from(svg), { limitInputPixels: false }).resize(width, height).png().toBuffer();
}

// Exposed for tests.
export const _internal = { measureText };
