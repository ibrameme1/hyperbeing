// Slide-spec schema for the image → editable pptx pipeline.
//
// The analyzer (a Claude vision call) returns measurements in SOURCE-IMAGE
// PIXELS, per img2pptx's "one rule" — see backend/tools/img2pptx/WAYS_OF_WORKING.md.
// Everything downstream (clean plate, cutouts, builder) trusts the normalized
// shape produced here, so this module is the only place that deals with the
// model's output being wrong: bad hex, negative boxes, unknown chart types,
// coordinates off the canvas. Nothing here throws on a single bad element —
// it drops it. A slide that loses one text box still exports; a slide that
// throws takes the whole deck's export with it.

// Hex the way pptxgenjs wants it: six uppercase digits, no '#', no alpha.
// Anything else (rgb(), 3-digit, 8-digit, a colour name) is refused.
export function normalizeHex(value, fallback = null) {
  if (typeof value !== 'string') return fallback;
  let v = value.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(v)) v = v.split('').map(c => c + c).join('');
  if (v.length === 8) v = v.slice(0, 6); // drop an alpha byte rather than corrupt the file
  return /^[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : fallback;
}

function num(value, fallback = null) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

// Clamp a box to the canvas. Returns null when there's nothing left of it —
// a zero-width shape is a corrupt shape, not a small one.
function box(el, srcW, srcH, { minW = 2, minH = 2 } = {}) {
  let x = num(el.x), y = num(el.y), w = num(el.w), h = num(el.h);
  if (x === null || y === null || w === null || h === null) return null;
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  // Bleeding off the right/bottom edge is a real design choice, so boxes may
  // overhang — but one that STARTS past the edge was measured against some other
  // coordinate system, and clamping it would silently move it somewhere it never
  // was. Drop it instead.
  if (x >= srcW || y >= srcH) return null;
  x = Math.max(0, x);
  y = Math.max(0, y);
  w = Math.min(w, srcW * 2 - x);
  h = Math.min(h, srcH * 2 - y);
  if (w < minW || h < minH) return null;
  return { x, y, w, h };
}

const CHART_TYPES = new Set(['doughnut', 'pie', 'bar', 'column', 'line', 'area']);
const ALIGNS = new Set(['left', 'center', 'right']);
const VALIGNS = new Set(['top', 'middle', 'bottom']);

// Elements a slide may carry, in the order the builder stacks them. Anything
// with an unknown `kind` is dropped.
const KINDS = new Set(['raster', 'rect', 'ellipse', 'line', 'chart', 'text']);

function normalizeRuns(runs) {
  if (!Array.isArray(runs)) return null;
  const out = [];
  for (const r of runs) {
    const t = typeof r?.t === 'string' ? r.t : (typeof r?.text === 'string' ? r.text : null);
    if (t === null || t === '') continue;
    out.push({
      t,
      c: normalizeHex(r.c ?? r.color),
      b: !!(r.b ?? r.bold),
      i: !!(r.i ?? r.italic),
    });
  }
  return out.length ? out : null;
}

function normalizeElement(raw, srcW, srcH) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = String(raw.kind || '').toLowerCase();
  if (!KINDS.has(kind)) return null;
  const label = typeof raw.label === 'string' ? raw.label.slice(0, 120) : undefined;

  if (kind === 'raster') {
    const b = box(raw, srcW, srcH, { minW: 24, minH: 24 });
    if (!b) return null;
    // A "cutout" covering essentially the whole slide is just the plate with
    // extra steps — and erasing it from the plate would blank the slide.
    if (b.w * b.h > srcW * srcH * 0.92) return null;
    return { kind, ...b, radius: Math.max(0, num(raw.radius, 0)), label };
  }

  if (kind === 'rect') {
    const b = box(raw, srcW, srcH);
    if (!b) return null;
    const fill = normalizeHex(raw.fill);
    const line = normalizeHex(raw.line);
    if (!fill && !line) return null; // invisible shape
    return {
      kind, ...b, fill, line,
      lineW: line ? Math.max(0.5, num(raw.lineW, 1)) : 0,
      radius: Math.max(0, num(raw.radius, 0)),
      label,
    };
  }

  if (kind === 'ellipse') {
    // Accept both the centre+diameter form the prompt asks for and a plain box.
    const cx = num(raw.cx), cy = num(raw.cy);
    const d = num(raw.d);
    let b;
    if (cx !== null && cy !== null && d !== null) {
      b = box({ x: cx - d / 2, y: cy - d / 2, w: d, h: d }, srcW, srcH);
    } else if (cx !== null && cy !== null && num(raw.rx) !== null) {
      const rx = num(raw.rx), ry = num(raw.ry, num(raw.rx));
      b = box({ x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 }, srcW, srcH);
    } else {
      b = box(raw, srcW, srcH);
    }
    if (!b) return null;
    const fill = normalizeHex(raw.fill);
    const line = normalizeHex(raw.line);
    if (!fill && !line) return null;
    return { kind, ...b, fill, line, lineW: line ? Math.max(0.5, num(raw.lineW, 1)) : 0, label };
  }

  if (kind === 'line') {
    const x = num(raw.x), y = num(raw.y);
    if (x === null || y === null) return null;
    const w = num(raw.w, 0), h = num(raw.h, 0);
    if (Math.abs(w) < 4 && Math.abs(h) < 4) return null;
    const color = normalizeHex(raw.color ?? raw.line ?? raw.fill);
    if (!color) return null;
    return {
      kind,
      x: Math.max(0, Math.min(x, srcW)),
      y: Math.max(0, Math.min(y, srcH)),
      w: Math.min(Math.abs(w), srcW), h: Math.min(Math.abs(h), srcH),
      color, width: Math.max(0.5, num(raw.width, 1)),
      label,
    };
  }

  if (kind === 'chart') {
    const b = box(raw, srcW, srcH, { minW: 40, minH: 40 });
    if (!b) return null;
    const type = CHART_TYPES.has(String(raw.chart).toLowerCase()) ? String(raw.chart).toLowerCase() : 'column';
    const labels = Array.isArray(raw.labels) ? raw.labels.map(l => String(l ?? '').slice(0, 80)) : [];
    const values = Array.isArray(raw.values) ? raw.values.map(v => num(v)).filter(v => v !== null) : [];
    // A chart with no numbers is a picture of a chart — leave it in the plate.
    if (values.length < 2 || labels.length !== values.length) return null;
    const colors = Array.isArray(raw.colors)
      ? raw.colors.map(c => normalizeHex(c)).filter(Boolean)
      : [];
    return {
      kind, ...b, chart: type, labels, values,
      colors: colors.length ? colors : null,
      hole: Math.min(90, Math.max(10, num(raw.hole, 55))),
      showValue: raw.showValue !== false,
      label,
    };
  }

  // text
  const b = box(raw, srcW, srcH, { minW: 8, minH: 6 });
  if (!b) return null;
  const runs = normalizeRuns(raw.runs);
  const text = typeof raw.text === 'string' ? raw.text : (typeof raw.t === 'string' ? raw.t : null);
  if (!runs && (!text || !text.trim())) return null;
  return {
    kind, ...b,
    text: runs ? null : text,
    runs,
    size: Math.min(srcH / 3, Math.max(6, num(raw.size, Math.min(b.h * 0.7, 40)))),
    color: normalizeHex(raw.color, 'FFFFFF'),
    bold: !!raw.bold,
    italic: !!raw.italic,
    align: ALIGNS.has(raw.align) ? raw.align : 'left',
    valign: VALIGNS.has(raw.valign) ? raw.valign : 'middle',
    spacing: Math.max(-3, Math.min(6, num(raw.spacing, 0))),
    lineSpacing: Math.max(0.6, Math.min(2.5, num(raw.line, 1.15))),
    label,
  };
}

// Two rebuilt regions that overlap almost entirely are the same thing measured
// twice — a duplicate live object, and a doubly-erased hole in the plate. Keep
// the first (analyzer order) and drop the rest.
function dropDuplicates(elements) {
  const kept = [];
  for (const el of elements) {
    const dupe = kept.some(k => {
      if (k.kind !== el.kind) return false;
      if (k.kind === 'line') return false;
      const ix = Math.max(0, Math.min(k.x + k.w, el.x + el.w) - Math.max(k.x, el.x));
      const iy = Math.max(0, Math.min(k.y + k.h, el.y + el.h) - Math.max(k.y, el.y));
      const inter = ix * iy;
      if (!inter) return false;
      const minArea = Math.min(k.w * k.h, el.w * el.h);
      if (inter / minArea < 0.9) return false;
      // Same footprint and same content = duplicate. Two stacked text boxes
      // with different words are a legitimate design.
      if (k.kind === 'text') return (k.text || JSON.stringify(k.runs)) === (el.text || JSON.stringify(el.runs));
      return true;
    });
    if (!dupe) kept.push(el);
  }
  return kept;
}

export const MAX_ELEMENTS = 40;

// Normalizes a raw analyzer response into the spec the rest of the pipeline
// consumes. Always returns a usable spec — worst case, an empty element list,
// which builds as a plain full-bleed image slide.
export function normalizeSpec(raw, srcW, srcH) {
  const elements = [];
  const list = Array.isArray(raw?.elements) ? raw.elements : [];
  for (const el of list) {
    const norm = normalizeElement(el, srcW, srcH);
    if (norm) elements.push(norm);
    if (elements.length >= MAX_ELEMENTS) break;
  }
  return {
    src_w: srcW,
    src_h: srcH,
    title: typeof raw?.title === 'string' ? raw.title.slice(0, 300) : null,
    background_color: normalizeHex(raw?.background_color, '111111'),
    elements: dropDuplicates(elements),
    notes: typeof raw?.notes === 'string' ? raw.notes.slice(0, 4000) : null,
  };
}

// The regions the builder rebuilds as live objects — i.e. everything that must
// be erased from the raster beneath it (img2pptx step 2.5). Raster cutouts are
// included: the plate must not also show the object that was lifted out of it,
// or dragging the cutout reveals a copy of itself.
export function eraseRegions(spec) {
  const regions = [];
  for (const el of spec.elements) {
    if (el.kind === 'line') {
      // A rule has no height of its own; give the eraser something to bite on.
      const thick = Math.max(el.width * 2, 6);
      regions.push({
        type: 'rect',
        x: el.x, y: el.y - thick / 2,
        w: el.w || thick, h: el.h || thick,
        grow: 3,
      });
      continue;
    }
    regions.push({
      type: el.kind === 'ellipse' ? 'ellipse' : (el.kind === 'text' ? 'text' : 'rect'),
      x: el.x, y: el.y, w: el.w, h: el.h,
      radius: el.radius || 0,
      // Cards carry drop shadows and glow past their nominal geometry; bare
      // text needs only an anti-aliasing collar (clean_plate.py's distinction).
      grow: el.kind === 'text' ? 3 : 8,
    });
  }
  return regions;
}
