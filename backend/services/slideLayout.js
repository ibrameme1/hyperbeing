// ─── Layered slide layout model ─────────────────────────────────────────────
// A layered slide is a small scene graph stored as JSON on the slide
// (`slides_data[].layout`). Images (background, elements, icons, logos) live
// on disk via imageStore and are referenced by filename; everything else —
// text, shapes/cards, charts, vector icons — is rendered natively by the web
// app and the PPTX exporter, which is what makes every piece editable.
//
// Claude writes the layout (see designSlideLayout in claudeAgent.js). Its
// output is untrusted-ish structured data, so EVERYTHING goes through
// normalizeLayout() before it is stored or rendered: unknown kinds are dropped,
// numbers are clamped, colors/fonts are validated, ids are made unique, and the
// number of image generations is capped (cost ceiling).
//
// Coordinates are canvas pixels (16:9 → 1920×1080). z-order = array order
// (index 0 is drawn first, right above the background).

import { jsonrepair } from 'jsonrepair';

export const LAYOUT_VERSION = 1;

export const CANVAS_FOR_ASPECT = {
  '16:9': { w: 1920, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
  '1:1':  { w: 1080, h: 1080 },
  '4:3':  { w: 1440, h: 1080 },
};

export function canvasFor(aspectRatio) {
  return CANVAS_FOR_ASPECT[aspectRatio] || CANVAS_FOR_ASPECT['16:9'];
}

// Hard ceiling on image generations per slide (background + image layers +
// one icon sheet). Bounds cost and rate-limit pressure; Claude is told the same.
export const MAX_GENERATIONS_PER_SLIDE = 7;
export const MAX_LAYERS = 60;
// Native (editable) layers inside device screens, per slide. Screen UI is
// normally drawn by the image model (a device layer with "ui": true); only a
// hero device whose on-screen copy IS the point of the slide gets native
// in_screen layers, and only this many — full native chat UIs cost ~30 layers
// of Claude output (~$0.03 a slide) for detail nobody edits.
export const MAX_SCREEN_LAYERS = 8;
export const MAX_SHEET_ICONS = 8;

// Curated Google Fonts the renderer loads. Claude picks the font that does the
// slide justice from this list; anything else falls back to the role default.
// `cw` = average glyph advance as a fraction of font size for mixed-case text
// (used by the overflow estimator); `cwCaps` for ALL-CAPS. Deliberately a
// touch generous so the estimate errs towards "it might overflow".
export const FONTS = {
  'Inter':              { cw: 0.54, cwCaps: 0.68, category: 'sans' },
  'Lato':               { cw: 0.52, cwCaps: 0.66, category: 'sans' },
  'Poppins':            { cw: 0.58, cwCaps: 0.72, category: 'sans' },
  'Montserrat':         { cw: 0.59, cwCaps: 0.75, category: 'sans' },
  'DM Sans':            { cw: 0.53, cwCaps: 0.67, category: 'sans' },
  'Manrope':            { cw: 0.55, cwCaps: 0.69, category: 'sans' },
  'Sora':               { cw: 0.58, cwCaps: 0.72, category: 'sans' },
  'Outfit':             { cw: 0.52, cwCaps: 0.65, category: 'sans' },
  'Space Grotesk':      { cw: 0.56, cwCaps: 0.68, category: 'sans' },
  'Archivo Black':      { cw: 0.66, cwCaps: 0.80, category: 'display' },
  'Anton':              { cw: 0.42, cwCaps: 0.46, category: 'condensed' },
  'Bebas Neue':         { cw: 0.38, cwCaps: 0.40, category: 'condensed' },
  'Oswald':             { cw: 0.44, cwCaps: 0.50, category: 'condensed' },
  'Barlow Condensed':   { cw: 0.42, cwCaps: 0.48, category: 'condensed' },
  'Big Shoulders Display': { cw: 0.40, cwCaps: 0.45, category: 'condensed' },
  'Playfair Display':   { cw: 0.53, cwCaps: 0.70, category: 'serif' },
  'DM Serif Display':   { cw: 0.50, cwCaps: 0.68, category: 'serif' },
  'Instrument Serif':   { cw: 0.44, cwCaps: 0.60, category: 'serif' },
  'IBM Plex Mono':      { cw: 0.60, cwCaps: 0.60, category: 'mono' },
};
export const FONT_NAMES = Object.keys(FONTS);
const DEFAULT_FONT = 'Inter';

const LAYER_KINDS = ['image', 'text', 'shape', 'chart', 'icon', 'logo'];
const IMAGE_ROLES = ['hero', 'element', 'effect', 'screen_image', 'connector', 'cluster'];
const ANCHORS = {
  center: [0.5, 0.5], top: [0.5, 0], bottom: [0.5, 1], left: [0, 0.5], right: [1, 0.5],
  'top-left': [0, 0], 'top-right': [1, 0], 'bottom-left': [0, 1], 'bottom-right': [1, 1],
};

// Connector endpoint: {layer, anchor} where anchor is a named point of that
// layer's box or {x,y} fractions of it.
function anchorRef(a) {
  if (!a || typeof a !== 'object' || typeof a.layer !== 'string') return undefined;
  let pt = ANCHORS.center;
  if (typeof a.anchor === 'string' && ANCHORS[a.anchor]) pt = ANCHORS[a.anchor];
  else if (a.anchor && typeof a.anchor === 'object') pt = [num(a.anchor.x, -0.5, 1.5, 0.5), num(a.anchor.y, -0.5, 1.5, 0.5)];
  return { layer: a.layer.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40), point: pt };
}
const CHART_TYPES = ['bar', 'column', 'line', 'area', 'pie', 'donut'];
const SHAPES = ['rect', 'ellipse', 'line'];

// ── primitive sanitizers ────────────────────────────────────────────────────

export function num(v, min, max, dflt) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function str(v, max = 2000, dflt = '') {
  if (typeof v !== 'string') return dflt;
  return v.slice(0, max);
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGBA_RE = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i;

export function color(v, dflt = null) {
  if (typeof v !== 'string') return dflt;
  const s = v.trim();
  if (HEX_RE.test(s) || RGBA_RE.test(s) || s === 'transparent') return s;
  return dflt;
}

export function gradient(g) {
  if (!g || typeof g !== 'object' || !Array.isArray(g.stops)) return null;
  const stops = g.stops
    .map(s => ({ color: color(s?.color), pos: num(s?.pos, 0, 100, null) }))
    .filter(s => s.color);
  if (stops.length < 2) return null;
  stops.forEach((s, i) => { if (s.pos === null) s.pos = Math.round((i / (stops.length - 1)) * 100); });
  return { angle: num(g.angle, 0, 360, 90), stops: stops.slice(0, 6) };
}

export function shadow(s) {
  if (!s || typeof s !== 'object') return null;
  return {
    color: color(s.color, 'rgba(0,0,0,0.5)'),
    blur: num(s.blur, 0, 200, 24),
    dx: num(s.dx, -200, 200, 0),
    dy: num(s.dy, -200, 200, 8),
  };
}

function font(f, dflt) {
  return FONT_NAMES.includes(f) ? f : (FONT_NAMES.includes(dflt) ? dflt : DEFAULT_FONT);
}

// Image reference tokens: "upload:N" (user's brief attachments) or
// "brand:<Name>" (a brand logo fetched online / declared in layout.brands).
function refs(v) {
  if (!Array.isArray(v)) return [];
  return v.filter(r => typeof r === 'string' && /^(upload:\d{1,2}|brand:.{1,80})$/.test(r)).slice(0, 4);
}

// ── layer normalizers ───────────────────────────────────────────────────────

function baseLayer(l, canvas, id) {
  // Screen children are authored in normalized 0-1 screen coordinates; they
  // become canvas pixels once the device's screen rect is known.
  if (typeof l.in_screen === 'string') {
    return {
      id, kind: l.kind, name: str(l.name, 60, '') || undefined,
      x: num(l.x, 0, 1, 0), y: num(l.y, 0, 1, 0), w: num(l.w, 0.01, 1, 1), h: num(l.h, 0.01, 1, 1),
      rotation: num(l.rotation, -180, 180, 0), opacity: num(l.opacity, 0, 1, 1),
    };
  }
  const w = num(l.w, 4, canvas.w * 2, canvas.w * 0.3);
  const h = num(l.h, 4, canvas.h * 2, canvas.h * 0.2);
  return {
    id,
    kind: l.kind,
    name: str(l.name, 60, '') || undefined,
    x: num(l.x, -canvas.w, canvas.w * 2, 0),
    y: num(l.y, -canvas.h, canvas.h * 2, 0),
    w,
    h,
    rotation: num(l.rotation, -180, 180, 0),
    opacity: num(l.opacity, 0, 1, 1),
  };
}

// Text roles that default to the deck's display font and weight 700 (Claude
// omits font/weight when they match these defaults).
export const DISPLAY_ROLES = ['headline', 'display', 'stat'];

function normalizeText(l, base, fonts) {
  const runs = Array.isArray(l.runs)
    ? l.runs
      .map(r => ({
        text: str(r?.text, 2000),
        color: color(r?.color) || undefined,
        gradient: gradient(r?.gradient) || undefined,
        weight: r?.weight !== undefined ? num(r.weight, 100, 900, undefined) : undefined,
        italic: typeof r?.italic === 'boolean' ? r.italic : undefined,
      }))
      .filter(r => r.text)
      .slice(0, 30)
    : null;
  const text = str(l.text, 4000) || (runs ? runs.map(r => r.text).join('') : '');
  if (!text.trim()) return null;
  const isDisplay = DISPLAY_ROLES.includes(l.role);
  return {
    ...base,
    role: str(l.role, 30, 'body'),
    text,
    runs: runs && runs.length ? runs : undefined,
    font: font(l.font, isDisplay ? fonts.display : fonts.body),
    size: num(l.size, 8, 400, 28),
    weight: num(l.weight, 100, 900, isDisplay ? 700 : 400),
    italic: !!l.italic,
    uppercase: !!l.uppercase,
    color: color(l.color, fonts.text || '#FFFFFF'),
    gradient: gradient(l.gradient) || undefined,
    align: ['left', 'center', 'right'].includes(l.align) ? l.align : 'left',
    valign: ['top', 'middle', 'bottom'].includes(l.valign) ? l.valign : 'top',
    line_height: num(l.line_height, 0.8, 2.5, 1.15),
    // em units. Claude sometimes gives px (e.g. 4) — anything > 0.5 can't be
    // a sane em value, so treat it as px and convert using the font size.
    letter_spacing: letterSpacing(l.letter_spacing, num(l.size, 8, 400, 28)),
    shadow: shadow(l.shadow) || undefined,
  };
}

function letterSpacing(v, size) {
  const n = num(v, -50, 200, 0);
  const em = Math.abs(n) > 0.5 ? n / size : n;
  return Math.round(Math.min(0.3, Math.max(-0.08, em)) * 1000) / 1000;
}

function normalizeShape(l, base) {
  return {
    ...base,
    shape: SHAPES.includes(l.shape) ? l.shape : 'rect',
    fill: color(l.fill, l.frosted ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.1)'),
    gradient: gradient(l.gradient) || undefined,
    radius: num(l.radius, 0, 2000, 0),
    border: l.border && typeof l.border === 'object'
      ? {
        color: color(l.border.color, 'rgba(255,255,255,0.2)'),
        width: num(l.border.width, 0, 40, 1),
        gradient: gradient(l.border.gradient) || undefined, // lit/accent borders
      }
      : undefined,
    // Glass bevel: a soft light catching the top edge of the card.
    highlight: !!l.highlight,
    // Frosted glass = blurred crop of whatever is underneath + tint + border.
    // Rendered natively on web (backdrop-filter) and baked to an image for PPTX.
    frosted: l.frosted ? { blur: num(l.frosted?.blur ?? l.blur, 0, 80, 24) } : undefined,
    shadow: shadow(l.shadow) || undefined,
  };
}

function normalizeChart(l, base, fonts) {
  const type = CHART_TYPES.includes(l.chart_type) ? l.chart_type : 'column';
  const categories = Array.isArray(l.categories) ? l.categories.map(c => str(String(c ?? ''), 60)).slice(0, 24) : [];
  const series = Array.isArray(l.series)
    ? l.series.slice(0, 6).map(s => ({
      name: str(s?.name, 60, 'Series'),
      values: Array.isArray(s?.values)
        ? s.values.slice(0, categories.length || 24).map(v => (v === null ? null : num(v, -1e12, 1e12, 0)))
        : [],
      color: color(s?.color) || undefined,
    })).filter(s => s.values.length)
    : [];
  if (!series.length) return null;
  const cats = categories.length ? categories : series[0].values.map((_, i) => String(i + 1));
  return {
    ...base,
    chart_type: type,
    categories: cats,
    series,
    options: {
      show_values: !!l.options?.show_values,
      show_legend: !!l.options?.show_legend,
      show_grid: l.options?.show_grid !== false,
      value_prefix: str(l.options?.value_prefix, 8),
      value_suffix: str(l.options?.value_suffix, 8),
      axis_color: color(l.options?.axis_color, 'rgba(255,255,255,0.5)'),
      label_color: color(l.options?.label_color, '#FFFFFF'),
      font: font(l.options?.font, fonts.body),
      font_size: num(l.options?.font_size, 10, 48, 18),
      y_min: l.options?.y_min !== undefined ? num(l.options.y_min, -1e12, 1e12, undefined) : undefined,
      y_max: l.options?.y_max !== undefined ? num(l.options.y_max, -1e12, 1e12, undefined) : undefined,
      line_width: num(l.options?.line_width, 1, 16, 4),
      // Per-point colors (bars) — e.g. highlight one bar.
      point_colors: Array.isArray(l.options?.point_colors) ? l.options.point_colors.map(c => color(c) || null).slice(0, 24) : undefined,
    },
  };
}

// A cluster = every object of the visual zone generated together in ONE
// image, then split into per-item layers. Items carry where each object
// should sit (canvas px) and what it is.
function clusterItems(v, canvas) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  return v.slice(0, 10).map((it, i) => {
    let id = typeof it?.id === 'string' ? it.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) : '';
    if (!id || seen.has(id)) id = `item${i + 1}`;
    seen.add(id);
    return {
      id,
      name: str(it?.name, 60, '') || undefined,
      prompt: str(it?.prompt, 1200).trim(),
      x: num(it?.x, -canvas.w, canvas.w * 2, 0), y: num(it?.y, -canvas.h, canvas.h * 2, 0),
      w: num(it?.w, 8, canvas.w * 2, 200), h: num(it?.h, 8, canvas.h * 2, 200),
      rotation: num(it?.rotation, -180, 180, 0),
      // The item is a device whose screen UI (with its copy) is drawn by the
      // image model, so the cluster prompt must allow that text.
      ui: it?.ui ? true : undefined,
    };
  }).filter(it => it.prompt);
}

function normalizeImage(l, base, canvas) {
  const prompt = str(l.prompt, 3000).trim();
  const role = IMAGE_ROLES.includes(l.role) ? l.role : 'element';
  if (role === 'cluster') {
    const items = clusterItems(l.items, canvas);
    if (!items.length) return null;
    // The cluster's box is the union of its items (recomputed at generation).
    const x0 = Math.min(...items.map(i => i.x)); const y0 = Math.min(...items.map(i => i.y));
    const x1 = Math.max(...items.map(i => i.x + i.w)); const y1 = Math.max(...items.map(i => i.y + i.h));
    return { ...base, x: x0, y: y0, w: x1 - x0, h: y1 - y0, role, prompt, refs: refs(l.refs), items };
  }
  if (!prompt && !l.file) return null;
  if (l.screen || l.ui) Object.assign(base, conformPhoneBox(base, prompt));
  return {
    ...base,
    role,
    prompt,
    refs: refs(l.refs),
    // Device with a native screen: the element is generated with a flat
    // chroma-green screen that is detected after generation; layers whose
    // `in_screen` points at this id are positioned inside that rect.
    screen: l.screen ? { fill: color(l.screen?.fill, '#000000') } : undefined,
    // Device whose screen UI is drawn by the image model (copy quoted in the
    // prompt; edited by regenerating the image). A native screen wins.
    ui: l.ui && !l.screen ? true : undefined,
    shadow: shadow(l.shadow) || undefined,
    glow: l.glow ? { color: color(l.glow?.color, 'rgba(255,255,255,0.6)'), blur: num(l.glow?.blur, 0, 200, 40) } : undefined,
    flip: !!l.flip,
    // Connectors (coin streams, light trails, orbit rings) physically link
    // other layers; their box is computed from the anchors at generation time.
    from: role === 'connector' ? anchorRef(l.from) : undefined,
    to: role === 'connector' ? anchorRef(l.to) : undefined,
    around: role === 'connector' && typeof l.around === 'string' ? l.around.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) : undefined,
    medium: role === 'connector' ? (l.medium === 'objects' ? 'objects' : 'light') : undefined,
    spread: role === 'connector' ? num(l.spread, 40, 1200, 200) : undefined,
    fit: l.fit === 'fill' || l.fit === 'cover' ? l.fit : undefined,
    file: typeof l.file === 'string' ? l.file : undefined,
    src: typeof l.src === 'string' ? l.src : undefined,
  };
}

// Claude tends to give phones squarish boxes (330×390 for a portrait phone),
// so the generated phone is letterboxed into a small sliver with big gaps
// around it. Snap phone boxes to real phone proportions — landscape when the
// box is at least square, portrait otherwise — centred in the original box.
// The original box is kept as `slot` so tightenDeviceRows can later scale the
// device row back up to fill the space Claude reserved.
const PHONE_RE = /\b(phone|smartphone|iphone|android|pixel|galaxy|mobile)\b/i;
const NOT_PHONE_RE = /\b(laptop|macbook|tablet|ipad|monitor|desktop|tv|television|watch|kiosk)\b/i;
const PHONE_LONG = 2.05; // long side ÷ short side of a modern phone incl. bezel
export function conformPhoneBox(box, prompt = '') {
  if (!PHONE_RE.test(prompt) || NOT_PHONE_RE.test(prompt) || !box.w || !box.h) return {};
  const r = box.w / box.h;
  const landscape = r >= 1;
  const target = landscape ? PHONE_LONG : 1 / PHONE_LONG;
  if (Math.abs(Math.log(r / target)) < 0.08) return {};
  const slot = { x: box.x, y: box.y, w: box.w, h: box.h };
  let w; let h;
  if (r > target) { h = box.h; w = h * target; } else { w = box.w; h = w / target; }
  w = Math.round(w); h = Math.round(h);
  return { x: Math.round(box.x + (box.w - w) / 2), y: Math.round(box.y + (box.h - h) / 2), w, h, slot };
}

function normalizeIcon(l, base) {
  const source = l.source === 'sheet' ? 'sheet' : 'lucide';
  if (source === 'lucide') {
    const name = str(l.name, 60).trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!name) return null;
    return { ...base, source, name, color: color(l.color, '#FFFFFF'), stroke: num(l.stroke, 0.5, 4, 2) };
  }
  const prompt = str(l.prompt, 400).trim();
  if (!prompt && !l.file) return null;
  return { ...base, source, prompt, file: typeof l.file === 'string' ? l.file : undefined, src: typeof l.src === 'string' ? l.src : undefined };
}

function normalizeLogo(l, base) {
  if (l.source === 'upload') {
    const upload = num(l.upload, 0, 20, null);
    if (upload === null) return null;
    return { ...base, source: 'upload', upload, file: typeof l.file === 'string' ? l.file : undefined, src: typeof l.src === 'string' ? l.src : undefined };
  }
  const brand = str(l.brand, 80).trim();
  if (!brand) return null;
  return {
    ...base,
    source: 'brand',
    brand,
    file: typeof l.file === 'string' ? l.file : undefined,
    src: typeof l.src === 'string' ? l.src : undefined,
    // Fallback styling when no logo can be fetched: render the brand name as a wordmark.
    color: color(l.color, '#FFFFFF'),
  };
}

function normalizeBackground(b) {
  if (!b || typeof b !== 'object') return { type: 'color', color: '#000000' };
  if (b.type === 'image' && (str(b.prompt, 3000).trim() || b.file)) {
    return {
      type: 'image',
      prompt: str(b.prompt, 3000).trim(),
      refs: refs(b.refs),
      color: color(b.color, '#000000'), // shown until the image arrives
      file: typeof b.file === 'string' ? b.file : undefined,
      src: typeof b.src === 'string' ? b.src : undefined,
    };
  }
  if (b.type === 'gradient' && gradient(b.gradient)) {
    return { type: 'gradient', gradient: gradient(b.gradient), color: color(b.color, gradient(b.gradient).stops[0].color) };
  }
  return { type: 'color', color: color(b.color, '#000000') };
}

// ── normalizeLayout ─────────────────────────────────────────────────────────
// Returns a clean layout or throws if it's unusable (no layers and no
// background). `opts.uploadCount` bounds upload refs.
// Tool-call quirk: with long arrays the model sometimes returns a field as a
// JSON-encoded string ("layers": "[{...}]") instead of the value itself.
function unstring(v) {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!t.startsWith('[') && !t.startsWith('{')) return v;
  try { return JSON.parse(t); } catch {
    try { return JSON.parse(jsonrepair(t)); } catch { return v; }
  }
}

// `deck` (the deck design system) supplies the defaults Claude may omit to
// save output tokens: the display/body fonts and the text colour.
export function normalizeLayout(raw, { aspectRatio = '16:9', uploadCount = 0, deck = null } = {}) {
  if (!raw || typeof raw !== 'object') throw new Error('layout is not an object');
  raw = { ...raw, layers: unstring(raw.layers), background: unstring(raw.background), brands: unstring(raw.brands), fonts: unstring(raw.fonts) };
  const canvas = canvasFor(aspectRatio);
  const fonts = {
    display: font(raw.fonts?.display, font(deck?.fonts?.display, 'Inter')),
    body: font(raw.fonts?.body, font(deck?.fonts?.body, 'Inter')),
    // Not a font — the default text colour, carried with the fonts so every
    // normalize call site (including edits, which pass layout.fonts) gets it.
    text: color(raw.fonts?.text, color(deck?.palette?.text, '#FFFFFF')),
  };

  const usedIds = new Set();
  const uniqueId = (wanted, kind) => {
    let id = typeof wanted === 'string' ? wanted.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) : '';
    if (!id) id = kind;
    let candidate = id;
    for (let i = 2; usedIds.has(candidate); i++) candidate = `${id}_${i}`;
    usedIds.add(candidate);
    return candidate;
  };

  const background = normalizeBackground(raw.background);
  let generations = background.type === 'image' && !background.file ? 1 : 0;
  let sheetIcons = 0;

  const idMap = new Map(); // Claude id → normalized id (for in_screen references)
  const layers = [];
  for (const l of (Array.isArray(raw.layers) ? raw.layers : []).slice(0, MAX_LAYERS * 2)) {
    if (!l || typeof l !== 'object' || !LAYER_KINDS.includes(l.kind)) continue;
    if (layers.length >= MAX_LAYERS) break;
    const id = uniqueId(l.id, l.kind);
    if (typeof l.id === 'string') idMap.set(l.id, id);
    const base = baseLayer(l, canvas, id);
    let layer = null;
    switch (l.kind) {
      case 'text': layer = normalizeText(l, base, fonts); break;
      case 'shape': layer = normalizeShape(l, base); break;
      case 'chart': layer = normalizeChart(l, base, fonts); break;
      case 'image': {
        layer = normalizeImage(l, base, canvas);
        if (layer && !layer.file) {
          if (generations >= MAX_GENERATIONS_PER_SLIDE) layer = null;
          else generations++;
        }
        break;
      }
      case 'icon': {
        layer = normalizeIcon(l, base);
        if (layer?.source === 'sheet' && !layer.file) {
          if (sheetIcons >= MAX_SHEET_ICONS) layer = null;
          else sheetIcons++;
        }
        break;
      }
      case 'logo': layer = normalizeLogo(l, base); break;
    }
    if (!layer) continue;
    if (layer.kind === 'logo' && layer.source === 'upload' && layer.upload >= uploadCount && !layer.file) continue;
    if (typeof l.in_screen === 'string') layer._in_screen_raw = l.in_screen;
    layers.push(layer);
  }

  // The icon sheet costs one generation. If it would exceed the cap, demote
  // sheet icons to nothing rather than silently blowing the budget.
  if (sheetIcons > 0 && !layers.some(l => l.kind === 'icon' && l.source === 'sheet' && l.file)) {
    if (generations >= MAX_GENERATIONS_PER_SLIDE) {
      for (let i = layers.length - 1; i >= 0; i--) {
        if (layers[i].kind === 'icon' && layers[i].source === 'sheet') layers.splice(i, 1);
      }
    }
  }

  // Resolve in_screen references to normalized ids; children of a device are
  // positioned in normalized (0-1) screen coordinates until the screen rect is
  // known (see placeScreenChildren in layerGeneration.js).
  for (const layer of layers) {
    if (layer._in_screen_raw) {
      const target = idMap.get(layer._in_screen_raw);
      const device = layers.find(d => d.id === target && d.kind === 'image' && d.screen);
      if (device) layer.in_screen = device.id;
      delete layer._in_screen_raw;
    }
  }
  // Cap native screen UI (photos inside a screen don't count). Children come
  // right after their device, so the later ones (lower-priority detail) go.
  let screenNative = 0;
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (!l.in_screen || l.role === 'screen_image') continue;
    if (++screenNative > MAX_SCREEN_LAYERS) { layers.splice(i, 1); i--; }
  }

  if (!layers.length && background.type === 'color' && !raw.background) {
    throw new Error('layout has no layers');
  }

  const brands = Array.isArray(raw.brands)
    ? raw.brands.slice(0, 8).map(b => ({
      name: str(b?.name, 80).trim(),
      domain: str(b?.domain, 120).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
      famous: !!b?.famous,
    })).filter(b => b.name)
    : [];

  return {
    version: LAYOUT_VERSION,
    canvas,
    composition: ['scene', 'objects', 'native'].includes(raw.composition) ? raw.composition : 'objects',
    style_block: str(raw.style_block, 1500),
    fonts,
    background,
    layers,
    brands,
  };
}

// ── text fitting / readability checks ──────────────────────────────────────

// Minimum readable font size, in canvas px, scaled to the canvas height
// (1080 → 16px). Below this, text is unreadable when projected.
export function minFontSize(canvas) {
  return Math.round(16 * (Math.min(canvas.w, canvas.h) / 1080));
}

function charWidth(layer, ch) {
  const f = FONTS[layer.font] || FONTS[DEFAULT_FONT];
  const upper = layer.uppercase || (ch >= 'A' && ch <= 'Z');
  let w = upper ? f.cwCaps : f.cw;
  if (ch === ' ') w *= 0.55;
  else if ('il.,:;\'|!'.includes(ch)) w *= 0.45;
  else if ('mwMW@'.includes(ch)) w *= 1.35;
  if (layer.weight >= 700) w *= 1.06;
  return w * layer.size + layer.letter_spacing * layer.size;
}

// Real-font measurement is injected by services/fonts.js (opentype.js over the
// bundled TTFs). Without it (tests, missing font) the estimator is used.
let textMeasurer = null;
export function setTextMeasurer(fn) { textMeasurer = fn; }

function measure(layer, text) {
  if (textMeasurer) {
    const w = textMeasurer(layer, text);
    if (w !== null && w !== undefined) return w;
  }
  let w = 0;
  for (const ch of text) w += charWidth(layer, ch);
  return w;
}

// Greedy word wrap using the estimator. Returns the wrapped lines.
export function wrapText(layer, text = layer.text) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || measure(layer, candidate) <= layer.w) line = candidate;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

// Same wrap as wrapText but returns character ranges into layer.text, so
// renderers can color sub-ranges (runs) across wrapped lines.
export function wrapTextRanges(layer) {
  const text = String(layer.text);
  const lines = [];
  let paraStart = 0;
  for (const para of text.split('\n')) {
    const words = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(para))) words.push({ start: paraStart + m.index, end: paraStart + m.index + m[0].length });
    if (!words.length) lines.push({ start: paraStart, end: paraStart });
    let cur = null;
    for (const w of words) {
      if (!cur) { cur = { start: w.start, end: w.end }; continue; }
      if (measure(layer, text.slice(cur.start, w.end)) <= layer.w) cur.end = w.end;
      else { lines.push(cur); cur = { start: w.start, end: w.end }; }
    }
    if (cur) lines.push(cur);
    paraStart += para.length + 1;
  }
  return lines;
}

export function measureText(layer, text) {
  return measure(layer, text);
}

export function estimateTextHeight(layer) {
  const lines = wrapText(layer);
  const widest = Math.max(0, ...lines.map(l => measure(layer, l)));
  return { lines: lines.length, height: lines.length * layer.size * layer.line_height, widest };
}

// The area a text layer's glyphs actually cover (boxes are often far wider
// than a short word like "Kiosk"). Respects align/valign.
export function inkBox(t) {
  if (t.kind !== 'text' || !t.text) return { x: t.x, y: t.y, w: t.w, h: t.h };
  const { lines, widest } = estimateTextHeight(t);
  const w = Math.min(t.w, Math.ceil(widest) + 4);
  const h = Math.min(t.h, Math.ceil(lines * t.size * (t.line_height || 1.2)));
  const x = t.align === 'center' ? t.x + (t.w - w) / 2 : t.align === 'right' ? t.x + t.w - w : t.x;
  const y = t.valign === 'middle' ? t.y + (t.h - h) / 2 : t.valign === 'bottom' ? t.y + t.h - h : t.y;
  return { id: t.id, x: Math.round(x), y: Math.round(y), w, h };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// Makes every text layer fit its box: shrink the font (never below 70% of the
// designed size or the readability floor), then grow the box downward if
// there's room on the canvas. Also pulls boxes inside the safe area. Returns
// a list of human-readable warnings that feed the visual review pass.
// Mutates and returns the layout.
export function fitLayout(layout) {
  const { canvas } = layout;
  const warnings = [];
  const floor = minFontSize(canvas);
  const margin = Math.round(canvas.w * 0.02);

  for (const l of layout.layers) {
    if (l.kind !== 'text' || l.in_screen) continue;

    // Keep text inside the canvas (with a small safe margin).
    if (l.w > canvas.w - margin * 2) l.w = canvas.w - margin * 2;
    l.x = Math.min(Math.max(l.x, margin), canvas.w - margin - l.w);
    l.y = Math.min(Math.max(l.y, margin * 0.5), canvas.h - margin * 0.5 - Math.min(l.h, canvas.h));

    // Text inside a device screen is mock UI (chat bubbles, captions) — it
    // must look like real phone UI, so it gets a lower floor and may shrink
    // further than slide text.
    const onScreen = !!l.screen_of;
    const textFloor = onScreen ? Math.round(floor * 0.7) : floor;
    if (l.size < textFloor) {
      warnings.push(`text "${l.id}" was ${l.size}px — raised to the ${textFloor}px readability floor`);
      l.size = textFloor;
    }

    // Body copy with hand-placed line breaks that ALSO wraps produces orphan
    // lines ("moving / to 50:50") — let it flow naturally instead.
    if (['body', 'caption', 'quote'].includes(l.role) && String(l.text).includes('\n') && !l.runs) {
      const explicit = String(l.text).split('\n').length;
      if (wrapText(l).length > explicit) l.text = String(l.text).replace(/\s*\n\s*/g, ' ');
    }

    const designed = l.size;
    const minSize = Math.max(textFloor, Math.round(designed * (onScreen ? 0.6 : 0.7)));
    let est = estimateTextHeight(l);
    while ((est.height > l.h || est.widest > l.w * 1.02) && l.size > minSize) {
      l.size = Math.max(minSize, Math.floor(l.size * 0.95));
      est = estimateTextHeight(l);
    }
    if (l.size !== designed) warnings.push(`text "${l.id}" shrunk ${designed}px → ${l.size}px to fit`);

    // Short labels/kickers/pill text that wrap should WIDEN (with their
    // pill/badge shape, matched by identical box) rather than break lines.
    const explicitLines = String(l.text).split('\n').length;
    // On a device screen they may only widen up to the screen's edge (a long
    // caption then wraps inside the screen instead of hanging off the phone).
    const screenRect = onScreen ? layout.layers.find(d => d.id === l.screen_of)?.screen?.rect : null;
    const rightLimit = onScreen ? (screenRect ? screenRect.x + screenRect.w - 4 : l.x + l.w) : canvas.w - margin;
    if (est.lines > explicitLines && ['label', 'caption', 'kicker'].includes(l.role) && String(l.text).length <= 60) {
      const widest = Math.max(...String(l.text).split('\n').map(t => measure(l, t)));
      const needed = Math.ceil(widest * 1.06 + (l.align === 'center' ? 32 : 4));
      // Centred text grows around its centre; never widen into other text.
      const grow0 = needed - l.w;
      // (If growing around the centre would cross the margin, grow rightwards.)
      let nx = l.align === 'center' ? Math.round(l.x - grow0 / 2) : l.x;
      if (nx < (onScreen ? 0 : margin) || nx + needed > rightLimit) nx = l.x;
      const wider = { x: nx, y: l.y, w: needed, h: l.h };
      const blocked = layout.layers.some(o => o !== l && o.kind === 'text' && !o.in_screen && overlaps(wider, o) && !overlaps(l, o));
      if (needed > l.w && nx >= (onScreen ? 0 : margin) && nx + needed <= rightLimit && !blocked) {
        const old = { x: l.x, y: l.y, w: l.w, h: l.h };
        const grow = needed - l.w;
        l.x = nx;
        l.w = needed;
        for (const sh of layout.layers) {
          if (sh.kind === 'shape' && Math.abs(sh.x - old.x) <= 4 && Math.abs(sh.y - old.y) <= 4 && Math.abs(sh.w - old.w) <= 8 && Math.abs(sh.h - old.h) <= 8) { sh.x += l.x - old.x; sh.w += grow; }
        }
        est = estimateTextHeight(l);
        warnings.push(`label "${l.id}" widened to fit on one line`);
      }
    }

    if (est.height > l.h) {
      const room = canvas.h - margin * 0.5 - l.y;
      const needed = Math.ceil(est.height * 1.04);
      if (needed <= room) {
        l.h = needed;
      } else {
        l.h = room;
        warnings.push(`text "${l.id}" still overflows its box (needs ${needed}px, has ${room}px) — shorten copy or restructure`);
      }
    }
  }

  // Text-on-text collisions are almost always a layout bug.
  const texts = layout.layers.filter(l => l.kind === 'text' && !l.in_screen && !l.rotation);
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (overlaps(texts[i], texts[j])) warnings.push(`text "${texts[i].id}" overlaps text "${texts[j].id}"`);
    }
  }
  // Generated elements covering text (devices, heroes) — usually a layout bug.
  // Layers drawn BELOW the text are fine only if they're backgrounds of it,
  // which images on a designed slide rarely are.
  // The wording depends on z-order: the reviewer acted on "covers" by moving
  // text that was actually drawn ON TOP of the image (a card over a merged
  // cluster's transparent corner). Light connectors are glows, like effects.
  for (const t of texts) {
    for (const im of layout.layers.filter(l => l.kind === 'image' && l.role !== 'effect' && l.role !== 'screen_image' && !(l.role === 'connector' && l.medium === 'light'))) {
      if (t.screen_of === im.id) continue; // text on its own device's screen is the point
      if (overlaps(t, im)) {
        const ix = Math.min(t.x + t.w, im.x + im.w) - Math.max(t.x, im.x);
        const iy = Math.min(t.y + t.h, im.y + im.h) - Math.max(t.y, im.y);
        if (ix * iy <= 0.1 * t.w * t.h) continue;
        const above = layout.layers.indexOf(im) > layout.layers.indexOf(t);
        warnings.push(above
          ? `image "${im.id}" covers part of text "${t.id}"`
          : `text "${t.id}" sits on top of image "${im.id}" (check it stays legible)`);
      }
    }
  }
  // Elements running off the canvas by a lot (not a deliberate small bleed).
  for (const im of layout.layers.filter(l => l.kind === 'image')) {
    const outside = Math.max(0, im.x + im.w - canvas.w) + Math.max(0, -im.x) + Math.max(0, im.y + im.h - canvas.h) + Math.max(0, -im.y);
    if (outside > 0.25 * Math.min(im.w, im.h)) warnings.push(`image "${im.id}" runs well outside the canvas`);
  }
  // Text over a chart is unreadable on both.
  for (const t of texts) {
    for (const c of layout.layers.filter(l => l.kind === 'chart')) {
      if (overlaps(t, c)) warnings.push(`text "${t.id}" overlaps chart "${c.id}"`);
    }
  }
  return { layout, warnings };
}

// Every on-disk file a layout references (for cleanup on delete/replace).
export function layoutFiles(layout) {
  if (!layout || typeof layout !== 'object') return [];
  const files = [];
  if (layout.background?.file) files.push(layout.background.file);
  if (layout.background?.frosted_file) files.push(layout.background.frosted_file);
  // Trash = layers deleted in the editor, kept so undo can restore them.
  for (const l of [...(layout.layers || []), ...(layout.trash || [])]) {
    if (l.file) files.push(l.file);
    if (l.frosted_file) files.push(l.frosted_file);
  }
  return [...new Set(files)];
}

// Count of image generations the layout still needs (used for stats/logging).
export function pendingGenerations(layout) {
  let n = layout.background?.type === 'image' && !layout.background.file ? 1 : 0;
  for (const l of layout.layers) if (l.kind === 'image' && !l.file) n++;
  if (layout.layers.some(l => l.kind === 'icon' && l.source === 'sheet' && !l.file)) n++;
  return n;
}

// ── streaming support ───────────────────────────────────────────────────────
// Claude streams the layout tool call as JSON text. To start generating image
// layers before the whole layout is written, we pull out the parts that are
// already COMPLETE: the top-level style_block string, the background object,
// the brands array, and each fully closed object inside "layers". Bracket
// counting with string/escape awareness — the same idea as
// extractPrefixedObjects in claudeAgent.js.
function scanValueEnd(text, start) {
  // start points at '{', '[' or '"'. Returns index just past the value, or -1 if incomplete.
  const open = text[start];
  if (open === '"') {
    for (let i = start + 1; i < text.length; i++) {
      if (text[i] === '\\') { i++; continue; }
      if (text[i] === '"') return i + 1;
    }
    return -1;
  }
  let depth = 0; let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}

// Finds `"key":` at nesting depth 1 of the top-level object; returns the index
// of the value's first char, or -1.
function findTopLevelKey(text, key) {
  let depth = 0; let inStr = false; let strStart = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === '"') {
        inStr = false;
        if (depth === 1 && text.slice(strStart + 1, i) === key) {
          let j = i + 1;
          while (j < text.length && /\s/.test(text[j])) j++;
          if (text[j] !== ':') continue;
          j++;
          while (j < text.length && /\s/.test(text[j])) j++;
          return j < text.length ? j : -1;
        }
      }
      continue;
    }
    if (c === '"') { inStr = true; strStart = i; }
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
  }
  return -1;
}

function tryParse(s) {
  try { return JSON.parse(s); } catch { return undefined; }
}

// Decodes the (possibly still streaming) body of a JSON string literal that
// starts at text[start] === '"'. Stops cleanly before an incomplete escape.
function decodePartialString(text, start) {
  let out = '';
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (c === '"') break;
    if (c !== '\\') { out += c; continue; }
    const n = text[i + 1];
    if (n === undefined) break;
    if (n === 'u') {
      const hex = text.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
      continue;
    }
    out += { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' }[n] ?? n;
    i++;
  }
  return out;
}

export function extractCompletedLayoutParts(text) {
  const out = { layers: [] };
  for (const key of ['style_block', 'background', 'brands', 'composition']) {
    const at = findTopLevelKey(text, key);
    if (at === -1) continue;
    const end = scanValueEnd(text, at);
    if (end !== -1) {
      let v = tryParse(text.slice(at, end));
      if (key !== 'style_block' && key !== 'composition') v = unstring(v);
      if (v !== undefined) out[key] = v;
    }
  }
  let la = findTopLevelKey(text, 'layers');
  if (la !== -1 && text[la] === '"') {
    // String-encoded array: scan the decoded string body instead.
    text = decodePartialString(text, la);
    la = text.indexOf('[');
  }
  if (la !== -1 && text[la] === '[') {
    let i = la + 1;
    while (i < text.length) {
      while (i < text.length && /[\s,]/.test(text[i])) i++;
      if (text[i] !== '{') break;
      const end = scanValueEnd(text, i);
      if (end === -1) break;
      const v = tryParse(text.slice(i, end));
      if (v) out.layers.push(v);
      i = end;
    }
  }
  return out;
}

// ── deterministic collision resolution ──────────────────────────────────────
// Last line of defence after the visual review: text must never sit on other
// text. When a lower-priority text box overlaps a higher-priority one, the
// lower one moves — together with everything that belongs to it (the card
// shape containing it, and the icons/badges/text inside that card) — to the
// nearest clear position (below, then above, then right, then left).
const PRIORITY = { headline: 0, display: 0, subhead: 1, stat: 2, label: 3, body: 4, quote: 4, caption: 5 };

function contains(outer, inner, pad = 6) {
  return inner.x >= outer.x - pad && inner.y >= outer.y - pad
    && inner.x + inner.w <= outer.x + outer.w + pad && inner.y + inner.h <= outer.y + outer.h + pad;
}

export function resolveCollisions(layout) {
  const { canvas } = layout;
  const moved = [];
  const texts = () => layout.layers.filter(l => l.kind === 'text' && !l.screen_of && !l.in_screen && !l.rotation);
  // A bare page number ("01") is the least important text on any slide — it
  // moves, not the footer line it brushes against.
  const isPageNumber = (l) => /^\s*\d{1,3}\s*$/.test(String(l.text || ''));
  const rank = (l) => (isPageNumber(l) ? 99 : (PRIORITY[l.role] ?? 4)) * 10000 + l.y; // ties: higher on the slide wins

  const groupOf = (t) => {
    const cards = layout.layers.filter(s => s.kind === 'shape' && s.shape === 'rect' && contains(s, t) && s.w < canvas.w * 0.95 && s.h < canvas.h * 0.6);
    const card = cards.sort((a, b) => a.w * a.h - b.w * b.h)[0];
    if (!card) return [t];
    return layout.layers.filter(l => l === card || (l !== card && !l.screen_of && contains(card, l) && l.kind !== 'image'));
  };
  const bbox = (g) => {
    const x = Math.min(...g.map(l => l.x)); const y = Math.min(...g.map(l => l.y));
    return { x, y, w: Math.max(...g.map(l => l.x + l.w)) - x, h: Math.max(...g.map(l => l.y + l.h)) - y };
  };

  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    const list = texts().sort((a, b) => rank(a) - rank(b));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const hi = list[i]; const lo = list[j];
        if (!overlaps(hi, lo)) continue;
        const group = groupOf(lo);
        if (group.includes(hi)) continue; // same card — a fit problem, not a collision
        const g = bbox(group);
        const gap = 20;
        const others = layout.layers.filter(l => !group.includes(l) && (l.kind === 'text' || (l.kind === 'shape' && l.shape === 'rect' && l.w < canvas.w * 0.95)) && !l.screen_of);
        const candidates = [
          { dx: 0, dy: hi.y + hi.h + gap - g.y },
          { dx: 0, dy: hi.y - gap - (g.y + g.h) },
          { dx: hi.x + hi.w + gap - g.x, dy: 0 },
          { dx: hi.x - gap - (g.x + g.w), dy: 0 },
        ].sort((a, b) => Math.abs(a.dx) + Math.abs(a.dy) - (Math.abs(b.dx) + Math.abs(b.dy)));
        const margin = Math.round(canvas.w * 0.02);
        const fits = (c) => {
          // Bounded corrections — step aside by about its own size, never a
          // long jump that lands the text on the artwork.
          if (Math.abs(c.dy) > Math.max(canvas.h * 0.12, g.h + 60) || Math.abs(c.dx) > Math.max(canvas.w * 0.2, g.w + 60)) return false;
          const nb = { x: g.x + c.dx, y: g.y + c.dy, w: g.w, h: g.h };
          if (nb.x < margin * 0.5 || nb.y < margin * 0.5 || nb.x + nb.w > canvas.w - margin * 0.5 || nb.y + nb.h > canvas.h - margin * 0.5) return false;
          return !others.some(o => overlaps(nb, o) && !contains(o, nb));
        };
        const c = candidates.find(fits);
        if (!c) continue;
        for (const l of group) { l.x += c.dx; l.y += c.dy; }
        moved.push(`${lo.id} moved off ${hi.id}`);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return moved;
}

// Images (devices, heroes, cluster pieces) must not cover text either. When
// one does, its group (the image + its on-screen children) first tries to
// MOVE clear; failing that it SHRINKS (down to 55%) anchored at the side
// farthest from the text — e.g. a hand-held phone stays on the bottom edge —
// and moves if needed. On-screen text scales with it.
// A row of screen devices (a "device collage") reads as one unit only when the
// devices sit close together. After trimming, a portrait phone in a squarish
// box leaves big gaps, so pack each row to `gap` px apart, keeping the row
// centred on its original span. Screen rects and screen children move with
// their device. Returns a list of moved ids.
// Cumulative row-packing scale per device layer object (one build's lifetime).
const packScale = new WeakMap();
export function tightenDeviceRows(layout, { gap = 40, maxGap = 64, maxScale = 1.6 } = {}) {
  // Standalone devices only. A cluster piece (even a "ui" phone) is part of a
  // composed group — often merged with coins/wallets — and its box is not a
  // phone; packing it as one shrank a whole cluster to ~36% (0.6 x 2 passes).
  const devices = layout.layers.filter(l => l.kind === 'image' && !l.screen_of && !l.cluster && !l.merged?.length
    && (l.screen || l.ui))
    .sort((a, b) => a.x - b.x);
  const rows = [];
  for (const d of devices) {
    const cy = d.y + d.h / 2;
    const row = rows.find(r => r.some(o => Math.abs(cy - (o.y + o.h / 2)) < Math.max(o.h, d.h) * 0.5));
    if (row) row.push(d); else rows.push([d]);
  }
  const children = (d) => layout.layers.filter(c => c.screen_of === d.id);
  const moveBy = (d, dx, dy) => {
    d.x += dx; d.y += dy;
    if (d.screen?.rect) { d.screen.rect.x += dx; d.screen.rect.y += dy; }
    for (const c of children(d)) { c.x += dx; c.y += dy; }
  };
  // Scale a device (and its screen + children) about its top-left corner.
  const scaleBy = (d, s) => {
    const ox = d.x; const oy = d.y;
    const sc = (r) => { r.x = Math.round(ox + (r.x - ox) * s); r.y = Math.round(oy + (r.y - oy) * s); r.w = Math.round(r.w * s); r.h = Math.round(r.h * s); };
    sc(d);
    if (d.screen?.rect) sc(d.screen.rect);
    for (const c of children(d)) { sc(c); if (c.kind === 'text') c.size = Math.max(8, Math.round(c.size * s)); }
  };
  const moved = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    const gaps = row.slice(1).map((d, i) => d.x - (row[i].x + row[i].w));
    if (gaps.some(g => g < -8)) { for (const d of row) delete d.slot; continue; } // deliberately overlapping collage
    // The band Claude reserved for this row (before phone boxes were snapped).
    const band = row.reduce((u, d) => {
      const r = d.slot || d;
      return { x0: Math.min(u.x0, r.x), y0: Math.min(u.y0, r.y), x1: Math.max(u.x1, r.x + r.w), y1: Math.max(u.y1, r.y + r.h) };
    }, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    // Never grow into text or full-width strips above/below the row (Claude's
    // slot for a phone often runs into the footer line).
    const ids = new Set(row.map(d => d.id));
    const mid = (band.y0 + band.y1) / 2;
    let clipped = false;
    for (const o of layout.layers) {
      const isObstacle = (o.kind === 'text' && !o.screen_of && !o.in_screen)
        || (o.kind === 'shape' && o.w >= layout.canvas.w * 0.9 && o.h < layout.canvas.h * 0.25);
      if (!isObstacle || ids.has(o.screen_of)) continue;
      if (o.x >= band.x1 || o.x + o.w <= band.x0) continue;
      const before = [band.y0, band.y1];
      if (o.y + o.h / 2 > mid) band.y1 = Math.min(band.y1, o.y - 16);
      else band.y0 = Math.max(band.y0, o.y + o.h + 16);
      if (band.y0 !== before[0] || band.y1 !== before[1]) clipped = true;
    }
    const snapped = row.some(d => d.slot);
    for (const d of row) delete d.slot;
    if (!snapped && !clipped && (row.length < 2 || !gaps.some(g => g > maxGap))) continue;
    const g = row.length > 1 ? gap : 0;
    const widthAt = (s) => row.reduce((t, d) => t + d.w * s, 0) + g * (row.length - 1);
    const tallest = Math.max(...row.map(d => d.h));
    // The build packs rows twice (before review, after the collision fixes);
    // the 60% floor is on the CUMULATIVE scale so a label beside a row can't
    // shrink it 0.6 x 0.6.
    const already = Math.min(...row.map(d => packScale.get(d) || 1));
    const s = Math.max(0.6 / already, Math.min(maxScale, (band.x1 - band.x0) / widthAt(1), (band.y1 - band.y0) / tallest));
    if (Math.abs(s - 1) > 0.01) for (const d of row) { scaleBy(d, s); packScale.set(d, (packScale.get(d) || 1) * s); }
    // Lay the row out left to right, centred in the band, bottoms aligned.
    const total = widthAt(1);
    let x = Math.round(band.x0 + (band.x1 - band.x0 - total) / 2);
    const rowH = Math.max(...row.map(d => d.h));
    const top = Math.round(band.y0 + (band.y1 - band.y0 - rowH) / 2);
    for (const d of row) {
      const dx = x - d.x; const dy = top + (rowH - d.h) - d.y;
      x += d.w + g;
      if (dx || dy || Math.abs(s - 1) > 0.01) moved.push(d.id);
      moveBy(d, dx, dy);
    }
  }
  return moved;
}

export function resolveImageOverlaps(layout) {
  const { canvas } = layout;
  const margin = Math.round(canvas.w * 0.02);
  const moved = [];
  const isObstacleText = (t) => t.kind === 'text' && !t.screen_of && !t.in_screen;
  const strips = layout.layers.filter(s => s.kind === 'shape' && s.w >= canvas.w * 0.9 && s.h < canvas.h * 0.25);
  const area = (r) => Math.max(0, r.w) * Math.max(0, r.h);
  const inter = (a, b) => ({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), w: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) });

  // Merged cluster pieces (objects that touched in the generated image) span
  // several items, so their bounding box naturally reaches the labels Claude
  // set beside each item; moving the whole group would tear the composition
  // apart (it used to push the rider/stream piece off the canvas). Leave them.
  for (const img of layout.layers.filter(l => l.kind === 'image' && !['effect', 'screen_image', 'connector'].includes(l.role) && !l.screen_of && !l.merged?.length)) {
    const group = [img, ...layout.layers.filter(l => l.screen_of === img.id)];
    // Judge against the glyphs, not the (often much wider) text boxes.
    const texts = layout.layers.filter(t => isObstacleText(t) && !group.includes(t)).map(inkBox);
    const conflicts = texts.filter(t => overlaps(t, img) && area(inter(t, img)) > 0.05 * area(t));
    if (!conflicts.length) continue;

    const transform = (s, ox, oy, dx, dy) => group.map(l => ({ l, x: ox + (l.x - ox) * s + dx, y: oy + (l.y - oy) * s + dy, w: l.w * s, h: l.h * s }));
    const ok = (placed) => {
      const b = placed[0];
      if (b.x < margin * 0.5 - 1 || b.y < -1 || b.x + b.w > canvas.w - margin * 0.5 + 1 || b.y + b.h > canvas.h + 1) {
        // Images may sit on the bottom/side edge (hand-held devices) but never
        // run off any edge — including the top.
        if (b.y < -1 || b.y + b.h > canvas.h + 1 || b.x < -1 || b.x + b.w > canvas.w + 1) return false;
      }
      // The text we are moving away from must end up fully clear; other text
      // tolerates a sliver of box overlap (boxes are larger than glyphs).
      if (conflicts.some(t => overlaps(t, b) && area(inter(t, b)) > 0)) return false;
      if (texts.some(t => overlaps(t, b) && area(inter(t, b)) > 0.02 * area(t))) return false;
      return !strips.some(s => overlaps(s, b) && area(inter(s, b)) > 0.15 * area(b));
    };
    // Anchor: the image edge farthest from the conflicting text's centre.
    const tc = conflicts.reduce((acc, t) => ({ x: acc.x + (t.x + t.w / 2) / conflicts.length, y: acc.y + (t.y + t.h / 2) / conflicts.length }), { x: 0, y: 0 });
    const ox = tc.x < img.x + img.w / 2 ? img.x + img.w : img.x;
    const oy = tc.y < img.y + img.h / 2 ? img.y + img.h : img.y;

    let best = null;
    for (let s = 1; s >= 0.549 && !best; s -= 0.05) {
      const base = transform(s, ox, oy, 0, 0)[0];
      const shifts = [[0, 0]];
      for (const t of conflicts) {
        shifts.push([0, t.y + t.h + 16 - base.y], [0, t.y - 16 - (base.y + base.h)], [t.x + t.w + 16 - base.x, 0], [t.x - 16 - (base.x + base.w), 0]);
      }
      shifts.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1]));
      for (const [dx, dy] of shifts) {
        // Bounded corrections only: a big jump tears the composition apart.
        // Cluster pieces keep their column (they sit over their own card or
        // label) — they may shrink or nudge vertically, never slide sideways.
        if (Math.abs(dx) > canvas.w * 0.3 || Math.abs(dy) > canvas.h * 0.3) continue;
        if (img.cluster && (dx !== 0 || Math.abs(dy) > canvas.h * 0.15)) continue;
        const placed = transform(s, ox, oy, dx, dy);
        if (ok(placed)) { best = { placed, s }; break; }
      }
    }
    if (!best) {
      // Can't clear the text by moving/shrinking. A supporting element (not
      // the hero, not a device) goes BEHIND the cards that hold the text, so
      // it reads as depth instead of covering the copy.
      if (img.role === 'hero' || img.screen) continue;
      const cards = layout.layers.filter(s => s.kind === 'shape' && !strips.includes(s)
        && conflicts.some(t => t.x >= s.x - 4 && t.y >= s.y - 4 && t.x + t.w <= s.x + s.w + 4 && t.y + t.h <= s.y + s.h + 4));
      if (cards.length < 1) continue;
      const firstCard = Math.min(...cards.map(c => layout.layers.indexOf(c)));
      const at = layout.layers.indexOf(img);
      if (at > firstCard) {
        layout.layers.splice(at, 1);
        layout.layers.splice(firstCard, 0, img);
        moved.push(`${img.id} sent behind ${cards.map(c => c.id).join(', ')}`);
      }
      continue;
    }
    for (const p of best.placed) {
      Object.assign(p.l, { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.w), h: Math.round(p.h) });
      if (p.l.kind === 'text' && best.s !== 1) p.l.size = Math.max(8, Math.round(p.l.size * best.s));
      if (p.l.screen?.rect && best.s !== 1) {
        const r = p.l.screen.rect;
        Object.assign(r, { x: Math.round(ox + (r.x - ox) * best.s + (p.x - (ox + (p.l.x - ox)))), y: r.y, w: Math.round(r.w * best.s), h: Math.round(r.h * best.s) });
      }
    }
    moved.push(`${img.id} ${best.s < 1 ? `scaled to ${Math.round(best.s * 100)}% and ` : ''}moved off ${conflicts.map(t => t.id).join(', ')}`);
  }
  return moved;
}
