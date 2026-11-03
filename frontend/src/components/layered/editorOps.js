// Pure layout operations used by the slide editor. Every function returns a
// NEW layout (the editor keeps immutable snapshots for undo/redo).
//
// Devices (image layers with a `screen`) own the layers drawn on their screen
// (`screen_of`): moving or resizing a device carries those children and the
// screen rect along, so the phone's chat UI never detaches from the phone.

const clone = (v) => JSON.parse(JSON.stringify(v));
const round = (v) => Math.round(v * 10) / 10;

export function findLayer(layout, id) {
  return layout?.layers?.find(l => l.id === id) || null;
}

export function childrenOf(layout, id) {
  return layout.layers.filter(l => l.screen_of === id);
}

export function updateLayer(layout, id, patch) {
  return { ...layout, layers: layout.layers.map(l => (l.id === id ? { ...l, ...patch } : l)) };
}

// Move to an absolute box; devices drag their screen + children with them.
export function setBox(layout, id, box) {
  const target = findLayer(layout, id);
  if (!target) return layout;
  const next = clone(layout);
  const t = next.layers.find(l => l.id === id);
  const sx = box.w / (target.w || 1); const sy = box.h / (target.h || 1);
  const map = (x, y) => ({ x: box.x + (x - target.x) * sx, y: box.y + (y - target.y) * sy });
  if (t.screen?.rect) {
    const p = map(t.screen.rect.x, t.screen.rect.y);
    t.screen.rect = { x: round(p.x), y: round(p.y), w: round(t.screen.rect.w * sx), h: round(t.screen.rect.h * sy) };
  }
  for (const c of next.layers.filter(l => l.screen_of === id)) {
    const p = map(c.x, c.y);
    c.x = round(p.x); c.y = round(p.y); c.w = round(c.w * sx); c.h = round(c.h * sy);
    if (c.kind === 'text' && Math.abs(sy - 1) > 0.001) c.size = Math.max(6, round(c.size * Math.min(sx, sy)));
  }
  Object.assign(t, { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) });
  return next;
}

export function reorder(layout, id, to) {
  const at = layout.layers.findIndex(l => l.id === id);
  if (at < 0) return layout;
  const layers = [...layout.layers];
  // A device and its screen children move as one block.
  const block = layers.filter(l => l.id === id || l.screen_of === id);
  const rest = layers.filter(l => !block.includes(l));
  // Where the block sits among the other layers right now.
  let pos = rest.filter(l => layers.indexOf(l) < at).length;
  if (to === 'front') pos = rest.length;
  else if (to === 'back') pos = 0;
  else if (to === 'forward') pos = Math.min(rest.length, pos + 1);
  else if (to === 'backward') pos = Math.max(0, pos - 1);
  rest.splice(pos, 0, ...block);
  return { ...layout, layers: rest };
}

export function removeLayer(layout, id) {
  return { ...layout, layers: layout.layers.filter(l => l.id !== id && l.screen_of !== id) };
}

let seq = 0;
export function newId(prefix) {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq}`;
}

// Duplicate = the server's `copy_of` (the only way an image file may appear
// twice). Screen children aren't duplicated with a device.
export function duplicateLayer(layout, id) {
  const src = findLayer(layout, id);
  if (!src) return { layout, id: null };
  const copy = clone(src);
  copy.id = newId(`${src.id}`.slice(0, 24));
  copy.copy_of = src.copy_of || src.id;
  copy.x += 32; copy.y += 32;
  delete copy.screen; delete copy.screen_of; delete copy.screen_norm;
  const at = layout.layers.indexOf(src);
  const layers = [...layout.layers];
  layers.splice(at + 1, 0, copy);
  return { layout: { ...layout, layers }, id: copy.id };
}

export function addText(layout, { palette } = {}) {
  const { w, h } = layout.canvas;
  const layer = {
    id: newId('text'), kind: 'text', role: 'body', text: 'Double-click to edit',
    x: Math.round(w * 0.3), y: Math.round(h * 0.42), w: Math.round(w * 0.4), h: 80,
    rotation: 0, opacity: 1, font: layout.fonts?.body || 'Inter', size: 48, weight: 600, italic: false,
    uppercase: false, color: palette?.text || '#FFFFFF', align: 'center', valign: 'top', line_height: 1.2, letter_spacing: 0,
  };
  return { layout: { ...layout, layers: [...layout.layers, layer] }, id: layer.id };
}

export function addShape(layout, { palette } = {}) {
  const { w, h } = layout.canvas;
  const layer = {
    id: newId('shape'), kind: 'shape', shape: 'rect', x: Math.round(w * 0.35), y: Math.round(h * 0.35), w: Math.round(w * 0.3), h: Math.round(h * 0.3),
    rotation: 0, opacity: 1, fill: palette?.panel || 'rgba(255,255,255,0.1)', radius: 24,
    border: { color: 'rgba(255,255,255,0.2)', width: 1 },
  };
  // New cards go just above the background/images so text stays on top.
  const firstText = layout.layers.findIndex(l => l.kind === 'text');
  const layers = [...layout.layers];
  layers.splice(firstText >= 0 ? firstText : layers.length, 0, layer);
  return { layout: { ...layout, layers }, id: layer.id };
}

// Snapping: align the moving box's edges/centre with the canvas and other
// layers. Returns the adjusted box plus guide lines to draw.
export function snapBox(layout, id, box, threshold) {
  const skip = new Set([id, ...layout.layers.filter(l => l.screen_of === id).map(l => l.id)]);
  const xs = [0, layout.canvas.w / 2, layout.canvas.w];
  const ys = [0, layout.canvas.h / 2, layout.canvas.h];
  for (const l of layout.layers) {
    if (skip.has(l.id) || l.hidden || l.screen_of) continue;
    xs.push(l.x, l.x + l.w / 2, l.x + l.w);
    ys.push(l.y, l.y + l.h / 2, l.y + l.h);
  }
  const best = (vals, edges) => {
    let hit = null;
    for (const [i, e] of edges.entries()) {
      for (const v of vals) {
        const d = v - e;
        if (Math.abs(d) <= threshold && (!hit || Math.abs(d) < Math.abs(hit.d))) hit = { d, v, i };
      }
    }
    return hit;
  };
  const hx = best(xs, [box.x, box.x + box.w / 2, box.x + box.w]);
  const hy = best(ys, [box.y, box.y + box.h / 2, box.y + box.h]);
  const out = { ...box };
  const guides = [];
  if (hx) { out.x += hx.d; guides.push({ axis: 'x', at: hx.v }); }
  if (hy) { out.y += hy.d; guides.push({ axis: 'y', at: hy.v }); }
  return { box: out, guides };
}

// Which layers can be edited how.
export const keepsAspect = (l) => l.kind === 'image' || l.kind === 'icon' || l.kind === 'logo';
