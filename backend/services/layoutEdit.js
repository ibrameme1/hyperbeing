// Applying a user's direct edits (the web editor) to a stored layered layout.
//
// The editor sends its whole edited layout back, but the client is not
// trusted: it could invent file references (reading other users' images
// through the assets route), inject huge payloads, or corrupt fields the
// pipeline relies on (screen rects, cluster ids). So the server starts from
// ITS copy of every layer and only takes whitelisted, re-validated fields from
// the client:
//   - existing layers (matched by id): geometry, visibility and the style /
//     content fields of their kind, re-normalized through the same
//     normalizers Claude's output goes through;
//   - new layers: plain text or shapes (normalized), or a duplicate of an
//     existing layer ("copy_of": "<id>") — the only way an image file can
//     appear twice;
//   - order: the client's order (z-order = array order);
//   - layers the client dropped move to `layout.trash` (newest first, capped)
//     so an undo after a save can still bring them back — their files stay
//     referenced and are never swept.
import { normalizeLayout, canvasFor, num, color, gradient } from './slideLayout.js';

const MAX_TRASH = 30;
const ASPECTS = ['16:9', '9:16', '1:1', '4:3'];

// Fields the editor may change, per kind (geometry is common to all kinds).
const GEOMETRY = ['x', 'y', 'w', 'h', 'rotation', 'opacity'];
const EDITABLE = {
  text: ['text', 'runs', 'size', 'color', 'gradient', 'weight', 'italic', 'uppercase', 'align', 'valign', 'font', 'line_height', 'letter_spacing', 'role'],
  shape: ['fill', 'gradient', 'radius', 'border', 'highlight', 'shadow'],
  chart: ['chart_type', 'categories', 'series', 'options'],
  icon: ['name', 'color', 'stroke'],
  image: ['flip', 'fit'],
  logo: ['flip'],
};
// Server-only fields that must survive a re-normalization untouched.
const KEEP = ['screen_of', 'screen_norm', 'screen', 'cluster', 'merged', 'file', 'src', 'prompt', 'refs', 'role', 'source', 'brand', 'upload', 'items', 'from', 'to', 'around', 'medium', 'spread', 'glow', 'frosted'];

function aspectOf(canvas) {
  return ASPECTS.find(a => { const c = canvasFor(a); return c.w === canvas.w && c.h === canvas.h; }) || '16:9';
}

const clone = (v) => JSON.parse(JSON.stringify(v));

// Re-run one layer through normalizeLayout (the same sanitizer Claude output
// goes through) and put back the server-only fields.
function renormalize(layer, current, aspectRatio) {
  const { layers } = normalizeLayout(
    { fonts: current.fonts, background: { type: 'color', color: '#000000' }, layers: [{ ...layer, in_screen: undefined }] },
    { aspectRatio },
  );
  const out = layers[0];
  if (!out) return null;
  out.id = layer.id;
  for (const k of KEEP) {
    if (layer[k] !== undefined && (k !== 'role' || layer.kind !== 'text')) out[k] = layer[k];
  }
  if (layer.hidden) out.hidden = true;
  return out;
}

function pickEdits(serverLayer, clientLayer, canvas) {
  const next = clone(serverLayer);
  for (const k of GEOMETRY) {
    if (clientLayer[k] === undefined) continue;
    const lim = k === 'rotation' ? [-360, 360] : k === 'opacity' ? [0, 1]
      : k === 'w' ? [4, canvas.w * 3] : k === 'h' ? [4, canvas.h * 3]
        : k === 'x' ? [-canvas.w, canvas.w * 2] : [-canvas.h, canvas.h * 2];
    const v = num(clientLayer[k], lim[0], lim[1], null);
    if (v !== null) next[k] = Math.round(v * 100) / 100;
  }
  if (typeof clientLayer.hidden === 'boolean') {
    if (clientLayer.hidden) next.hidden = true; else delete next.hidden;
  }
  if (typeof clientLayer.name === 'string') next.name = clientLayer.name.slice(0, 60);
  for (const k of EDITABLE[serverLayer.kind] || []) {
    if (!(k in clientLayer)) continue;
    if (clientLayer[k] === null || clientLayer[k] === undefined) delete next[k];
    else next[k] = clone(clientLayer[k]);
  }
  // A device screen rect only ever moves/scales with its device.
  if (serverLayer.screen?.rect && clientLayer.screen?.rect) {
    const r = clientLayer.screen.rect;
    const ok = ['x', 'y', 'w', 'h'].every(k => Number.isFinite(r[k]));
    if (ok) next.screen = { ...next.screen, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.max(1, Math.round(r.w)), h: Math.max(1, Math.round(r.h)) } };
  }
  return next;
}

// Image-like layers keep their own (non-normalizer) validation: only the
// whitelisted fields above, checked here.
function sanitizeImageLike(layer) {
  if ('flip' in layer) layer.flip = !!layer.flip;
  if ('fit' in layer && !['contain', 'cover', 'fill', undefined].includes(layer.fit)) delete layer.fit;
  return layer;
}

/**
 * @param current  the stored, normalized layout (source of truth)
 * @param edited   the client's edited layout
 * @returns        a new layout (current is not mutated)
 */
export function applyLayoutEdit(current, edited) {
  if (!edited || typeof edited !== 'object' || !Array.isArray(edited.layers)) throw new Error('layout must have a layers array');
  if (edited.layers.length > 200) throw new Error('too many layers');
  const canvas = current.canvas;
  const aspectRatio = aspectOf(canvas);
  const known = new Map();
  for (const l of current.layers) known.set(l.id, l);
  for (const l of current.trash || []) if (!known.has(l.id)) known.set(l.id, l);

  const out = [];
  const used = new Set();
  const uniqueId = (base) => {
    let id = String(base || 'layer').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'layer';
    let candidate = id;
    for (let i = 2; used.has(candidate) || (known.has(candidate) && candidate !== base); i++) candidate = `${id}_${i}`;
    return candidate;
  };

  for (const c of edited.layers) {
    if (!c || typeof c !== 'object') continue;
    let layer = null;
    if (typeof c.id === 'string' && known.has(c.id) && !used.has(c.id)) {
      const s = known.get(c.id);
      layer = pickEdits(s, c, canvas);
    } else if (typeof c.copy_of === 'string' && known.has(c.copy_of)) {
      // Duplicate: a copy of a layer we know, with the client's edits on top.
      const s = known.get(c.copy_of);
      layer = pickEdits(s, c, canvas);
      layer.id = uniqueId(typeof c.id === 'string' ? c.id : `${s.id}_copy`);
      delete layer.screen_of; delete layer.screen_norm; delete layer.cluster; delete layer.merged;
      if (layer.screen) delete layer.screen; // a copied device has no live screen children
    } else if (c.kind === 'text' || c.kind === 'shape') {
      // Brand-new plain text / shape from the editor's "add" buttons.
      const base = { ...c };
      for (const k of KEEP) delete base[k];
      layer = { ...base, id: uniqueId(typeof c.id === 'string' ? c.id : c.kind) };
    } else {
      continue; // unknown id / unsupported new layer: ignored
    }

    if (['text', 'shape', 'chart', 'icon'].includes(layer.kind)) {
      if (layer.kind === 'icon' && layer.source !== 'lucide' && 'name' in c) layer.name = known.get(c.id)?.name ?? layer.name;
      layer = renormalize(layer, current, aspectRatio);
    } else {
      layer = sanitizeImageLike(layer);
    }
    if (!layer) continue;
    used.add(layer.id);
    out.push(layer);
  }

  // Dropped layers → trash (restorable by undo after a save).
  const removed = current.layers.filter(l => !used.has(l.id));
  const trash = [...removed.map(clone), ...(current.trash || []).filter(t => !used.has(t.id) && !removed.some(r => r.id === t.id))].slice(0, MAX_TRASH);

  // Screen children whose device was deleted go with it.
  const ids = new Set(out.map(l => l.id));
  const layers = out.filter(l => !l.screen_of || ids.has(l.screen_of));

  const next = { ...clone(current), layers, trash };
  if (!trash.length) delete next.trash;

  // Background: only a native colour/gradient can be recoloured.
  const bg = edited.background;
  if (bg && current.background.type !== 'image') {
    if (current.background.type === 'color' && color(bg.color)) next.background = { ...next.background, color: color(bg.color) };
    if (current.background.type === 'gradient' && gradient(bg.gradient)) next.background = { ...next.background, gradient: gradient(bg.gradient) };
  }
  delete next.review; delete next.warnings;
  return next;
}

// Every file a layout (including its trash) references.
export function layoutTrashFiles(layout) {
  return (layout?.trash || []).map(l => l.file).filter(Boolean);
}

// ─── AI edits (natural-language instructions) ──────────────────────────────
// Claude answers an edit instruction with a short list of operations on the
// slide's layers (layoutAgent.editSlideLayout). They are applied here to the
// stored layout; image layers whose `file` gets cleared are the ONLY ones the
// pipeline regenerates — everything else stays exactly as it was.
//   { op: 'update', id, set: {...} }            restyle / retype / move a layer
//   { op: 'remove', id }                        delete a layer (→ trash)
//   { op: 'add', layer: {...}, after?: id }     a new layer (Claude layer format)
//   { op: 'regenerate', id, prompt, refs? }     new image for one element
//   { op: 'reorder', id, to }                   front | back | forward | backward
//   { op: 'background', prompt? | color? | gradient? }
export const MAX_EDIT_REGENERATIONS = 4;

export function applyEditOps(current, ops, { uploadCount = 0 } = {}) {
  const layout = clone(current);
  const aspectRatio = aspectOf(layout.canvas);
  const regenerated = [];
  const applied = [];
  const find = (id) => layout.layers.findIndex(l => l.id === id);
  const toTrash = (l) => { layout.trash = [clone(l), ...(layout.trash || [])].slice(0, MAX_TRASH); };

  for (const op of Array.isArray(ops) ? ops.slice(0, 30) : []) {
    if (!op || typeof op !== 'object') continue;
    const at = typeof op.id === 'string' ? find(op.id) : -1;
    const target = at >= 0 ? layout.layers[at] : null;

    if (op.op === 'update' && target && op.set && typeof op.set === 'object') {
      let next = pickEdits(target, op.set, layout.canvas);
      if (['text', 'shape', 'chart', 'icon'].includes(next.kind)) next = renormalize(next, layout, aspectRatio);
      else next = sanitizeImageLike(next);
      if (!next) continue;
      // Moving a device moves what's on its screen.
      const dx = next.x - target.x; const dy = next.y - target.y;
      if (target.screen && (dx || dy) && next.w === target.w && next.h === target.h) {
        if (next.screen?.rect) next.screen = { ...next.screen, rect: { ...next.screen.rect, x: next.screen.rect.x + dx, y: next.screen.rect.y + dy } };
        for (const c of layout.layers) if (c.screen_of === target.id) { c.x += dx; c.y += dy; }
      }
      layout.layers[at] = next;
      applied.push(`update ${op.id}`);
    } else if (op.op === 'remove' && target) {
      const gone = [target, ...layout.layers.filter(c => c.screen_of === target.id)];
      gone.forEach(toTrash);
      layout.layers = layout.layers.filter(l => !gone.includes(l));
      applied.push(`remove ${op.id}`);
    } else if (op.op === 'regenerate' && target && (target.kind === 'image') && typeof op.prompt === 'string' && op.prompt.trim()) {
      if (regenerated.length >= MAX_EDIT_REGENERATIONS) continue;
      toTrash(target); // the old image stays restorable from History
      const next = { ...clone(target), prompt: op.prompt.trim().slice(0, 4000) };
      if (Array.isArray(op.refs)) next.refs = op.refs.filter(r => typeof r === 'string' && (/^upload:\d{1,2}$/.test(r) && +r.slice(7) < uploadCount || /^brand:.{1,80}$/.test(r))).slice(0, 4);
      delete next.file; delete next.src; delete next.merged; delete next.cluster;
      if (next.screen) next.screen = { fill: next.screen.fill };
      layout.layers[at] = next;
      regenerated.push(op.id);
      applied.push(`regenerate ${op.id}`);
    } else if (op.op === 'reorder' && target) {
      const [l] = layout.layers.splice(at, 1);
      const to = op.to === 'front' ? layout.layers.length : op.to === 'back' ? 0
        : op.to === 'forward' ? Math.min(layout.layers.length, at + 1) : Math.max(0, at - 1);
      layout.layers.splice(to, 0, l);
      applied.push(`reorder ${op.id} ${op.to}`);
    } else if (op.op === 'add' && op.layer && typeof op.layer === 'object') {
      const raw = { ...op.layer };
      for (const k of ['file', 'src', 'screen_of', 'screen_norm', 'cluster', 'merged']) delete raw[k];
      if (raw.kind === 'image' && raw.role === 'cluster') continue; // one object at a time in edits
      if (raw.kind === 'image' && regenerated.length >= MAX_EDIT_REGENERATIONS) continue;
      // in_screen children need their device in the same normalize call.
      const device = typeof raw.in_screen === 'string' ? layout.layers.find(d => d.id === raw.in_screen && d.screen) : null;
      const stub = device ? [{ kind: 'image', id: device.id, prompt: 'device', screen: { fill: device.screen.fill }, x: device.x, y: device.y, w: device.w, h: device.h }] : [];
      const { layers } = normalizeLayout({ fonts: layout.fonts, background: { type: 'color', color: '#000000' }, layers: [...stub, raw] }, { aspectRatio, uploadCount });
      const added = layers.find(l => !stub.length || l.id !== device.id);
      if (!added) continue;
      if (device) added.in_screen = device.id;
      const ids = new Set([...layout.layers.map(l => l.id), ...(layout.trash || []).map(l => l.id)]);
      let id = added.id;
      for (let i = 2; ids.has(id); i++) id = `${added.id}_${i}`;
      added.id = id;
      const after = typeof op.after === 'string' ? find(op.after) : -1;
      layout.layers.splice(after >= 0 ? after + 1 : layout.layers.length, 0, added);
      if (added.kind === 'image') regenerated.push(id);
      applied.push(`add ${id}`);
    } else if (op.op === 'background') {
      const bg = layout.background;
      if (typeof op.prompt === 'string' && op.prompt.trim()) {
        if (regenerated.length >= MAX_EDIT_REGENERATIONS) continue;
        layout.background = { ...bg, type: 'image', prompt: op.prompt.trim().slice(0, 4000) };
        delete layout.background.file; delete layout.background.src; delete layout.background.frosted_file;
        regenerated.push('background');
        applied.push('background image');
      } else if (color(op.color)) {
        layout.background = { type: 'color', color: color(op.color) };
        applied.push('background color');
      } else if (gradient(op.gradient)) {
        layout.background = { type: 'gradient', gradient: gradient(op.gradient), color: bg.color };
        applied.push('background gradient');
      }
    }
  }
  if (!layout.trash?.length) delete layout.trash;
  delete layout.review; delete layout.warnings;
  return { layout, regenerated, applied };
}
