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
export function snapBox(layout, ids, box, threshold) {
  const moving = new Set(Array.isArray(ids) ? ids : [ids]);
  const skip = new Set([...moving, ...layout.layers.filter(l => moving.has(l.screen_of)).map(l => l.id)]);
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

// ─── Rotation-aware resize ─────────────────────────────────────────────────
// Resizing a rotated element must happen in the element's own (rotated)
// frame, with the handle opposite the dragged one pinned in place — otherwise
// the box drifts and grows along the wrong axis. `box` is the unrotated box
// (x/y/w/h, rotation about its centre), (dx, dy) the pointer delta in canvas
// px, `dir` the handle (n, ne, e, se, s, sw, w, nw).
export function resizeRotated(box, rotation, dir, dx, dy, { lockAspect = false, min = 8 } = {}) {
  const t = ((rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(t); const sin = Math.sin(t);
  // Pointer delta in the element's local axes.
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const sx = dir.includes('e') ? 1 : dir.includes('w') ? -1 : 0;
  const sy = dir.includes('s') ? 1 : dir.includes('n') ? -1 : 0;
  let w = Math.max(min, box.w + sx * lx);
  let h = Math.max(min, box.h + sy * ly);
  if (lockAspect && sx && sy) {
    const ratio = box.w / box.h;
    if (w / h > ratio) w = h * ratio; else h = w / ratio;
  }
  // The anchor = the opposite handle; its world position must not move.
  const cx = box.x + box.w / 2; const cy = box.y + box.h / 2;
  const ax = (-sx * box.w) / 2; const ay = (-sy * box.h) / 2; // local offset from centre
  const anchorX = cx + ax * cos - ay * sin;
  const anchorY = cy + ax * sin + ay * cos;
  const nax = (-sx * w) / 2; const nay = (-sy * h) / 2;
  const ncx = anchorX - (nax * cos - nay * sin);
  const ncy = anchorY - (nax * sin + nay * cos);
  return { x: ncx - w / 2, y: ncy - h / 2, w, h };
}

// Resize cursor that matches the handle's on-screen direction after rotation.
const CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'];
const HANDLE_ANGLE = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 };
export function handleCursor(dir, rotation = 0) {
  const a = (((HANDLE_ANGLE[dir] + rotation) % 180) + 180) % 180;
  return CURSORS[Math.round(a / 45) % 4];
}

// ─── Multi-selection ───────────────────────────────────────────────────────
// Layers drawn on a device's screen travel with their device, so whenever a
// device is part of a selection its screen children are dropped from it (an
// operation on the device already carries them).
export function topLevel(layout, ids) {
  const set = new Set(ids);
  return ids.filter(id => {
    const l = findLayer(layout, id);
    return l && !(l.screen_of && set.has(l.screen_of));
  });
}

// Axis-aligned bounds of a layer, taking its rotation into account.
export function layerBounds(l) {
  if (!l.rotation) return { x: l.x, y: l.y, w: l.w, h: l.h };
  const t = (l.rotation * Math.PI) / 180;
  const cx = l.x + l.w / 2; const cy = l.y + l.h / 2;
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const px = (a * l.w) / 2; const py = (b * l.h) / 2;
    return [cx + px * Math.cos(t) - py * Math.sin(t), cy + px * Math.sin(t) + py * Math.cos(t)];
  });
  const xs = pts.map(p => p[0]); const ys = pts.map(p => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

export function selectionBounds(layout, ids) {
  const boxes = ids.map(id => findLayer(layout, id)).filter(Boolean).map(layerBounds);
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map(b => b.x)); const y = Math.min(...boxes.map(b => b.y));
  return { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y };
}

export function moveLayers(layout, ids, dx, dy) {
  let next = layout;
  for (const id of topLevel(layout, ids)) {
    const l = findLayer(next, id);
    next = setBox(next, id, { x: l.x + dx, y: l.y + dy, w: l.w, h: l.h });
  }
  return next;
}

// Scale a group from one bounding box to another (group resize). Text sizes
// scale too when the group keeps its proportions.
export function scaleLayers(layout, ids, from, to, { scaleText = false } = {}) {
  const sx = to.w / (from.w || 1); const sy = to.h / (from.h || 1);
  let next = layout;
  for (const id of topLevel(layout, ids)) {
    const l = findLayer(next, id);
    // Scale about the layer's centre so rotated layers stay put relative to the group.
    const cx = to.x + (l.x + l.w / 2 - from.x) * sx;
    const cy = to.y + (l.y + l.h / 2 - from.y) * sy;
    const w = Math.max(4, l.w * sx); const h = Math.max(4, l.h * sy);
    next = setBox(next, id, { x: cx - w / 2, y: cy - h / 2, w, h });
    if (scaleText && l.kind === 'text') next = updateLayer(next, id, { size: Math.max(6, round(l.size * Math.min(sx, sy))) });
  }
  return next;
}

// Align to the selection's bounds (or the canvas when one layer is selected).
export function alignLayers(layout, ids, how) {
  const top = topLevel(layout, ids);
  const ref = top.length > 1 ? selectionBounds(layout, top) : { x: 0, y: 0, w: layout.canvas.w, h: layout.canvas.h };
  let next = layout;
  for (const id of top) {
    const l = findLayer(next, id);
    const b = layerBounds(l);
    let dx = 0; let dy = 0;
    if (how === 'left') dx = ref.x - b.x;
    if (how === 'center') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
    if (how === 'right') dx = ref.x + ref.w - (b.x + b.w);
    if (how === 'top') dy = ref.y - b.y;
    if (how === 'middle') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
    if (how === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
    if (dx || dy) next = setBox(next, id, { x: l.x + dx, y: l.y + dy, w: l.w, h: l.h });
  }
  return next;
}

// Even gaps between 3+ layers along an axis (first and last stay put).
export function distributeLayers(layout, ids, axis) {
  const top = topLevel(layout, ids);
  if (top.length < 3) return layout;
  const pos = axis === 'x' ? 'x' : 'y'; const size = axis === 'x' ? 'w' : 'h';
  const items = top.map(id => ({ id, b: layerBounds(findLayer(layout, id)) })).sort((a, b) => a.b[pos] - b.b[pos]);
  const span = items[items.length - 1].b[pos] + items[items.length - 1].b[size] - items[0].b[pos];
  const gap = (span - items.reduce((s, it) => s + it.b[size], 0)) / (items.length - 1);
  let cursor = items[0].b[pos] + items[0].b[size] + gap;
  let next = layout;
  for (const it of items.slice(1, -1)) {
    const l = findLayer(next, it.id);
    const d = cursor - it.b[pos];
    next = setBox(next, it.id, { x: l.x + (pos === 'x' ? d : 0), y: l.y + (pos === 'y' ? d : 0), w: l.w, h: l.h });
    cursor += it.b[size] + gap;
  }
  return next;
}

export function removeLayers(layout, ids) {
  return ids.reduce((acc, id) => removeLayer(acc, id), layout);
}

export function duplicateLayers(layout, ids) {
  let next = layout; const created = [];
  for (const id of topLevel(layout, ids)) {
    const r = duplicateLayer(next, id);
    next = r.layout;
    if (r.id) created.push(r.id);
  }
  return { layout: next, ids: created };
}

// Reorder several layers, keeping their relative order.
export function reorderLayers(layout, ids, to) {
  const top = topLevel(layout, ids);
  const order = (a, b) => layout.layers.findIndex(l => l.id === a) - layout.layers.findIndex(l => l.id === b);
  // Moving up: process the topmost first so they don't leapfrog each other.
  const seq = [...top].sort(order);
  if (to === 'forward' || to === 'back') seq.reverse();
  return seq.reduce((acc, id) => reorder(acc, id, to), layout);
}

// Layers a marquee rectangle touches (screen children collapse to their device).
export function layersInRect(layout, rect) {
  const hit = layout.layers.filter(l => {
    if (l.hidden) return false;
    const b = layerBounds(l);
    return b.x < rect.x + rect.w && rect.x < b.x + b.w && b.y < rect.y + rect.h && rect.y < b.y + b.h;
  }).map(l => l.id);
  return topLevel(layout, hit);
}
