import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Undo2, Redo2, Type, SquarePlus, Check, Loader2, CloudOff, Layers, MousePointer2 } from 'lucide-react';
import api from '../../api/client';
import { capture } from '../../utils/posthog';
import LayeredSlide, { LayerBody, layerBoxStyle, textStyle } from './LayeredSlide';
import { Inspector, MultiInspector, LayersPanel } from './EditorPanels';
import {
  findLayer, updateLayer, setBox, addText, addShape, snapBox, keepsAspect,
  resizeRotated, handleCursor, topLevel, selectionBounds, moveLayers, scaleLayers, alignLayers, distributeLayers,
  removeLayers, duplicateLayers, reorderLayers, layersInRect,
} from './editorOps';

// ─── Slide editor (layered slides) ─────────────────────────────────────────
// Canva-style direct editing of a layered slide: click to select, drag to
// move (snaps to the canvas and other layers), handles to resize/rotate,
// double-click text to retype, inspector for style/chart data, layers list
// for z-order/visibility, undo/redo, and autosave.
//
// Saving: the whole edited layout is PATCHed (debounced). The server only
// accepts whitelisted changes (backend/services/layoutEdit.js), re-renders the
// flattened preview and returns the slide. The first save of a session is a
// history checkpoint, so the whole session can be undone from History.
// The editor never adopts the server's copy mid-session: it owns the layout
// until it closes (an AI edit can't run while it's open — the slide's status
// guards that on the server).

const SAVE_DELAY = 1000;
const HISTORY_LIMIT = 100;

function swatchesOf(layout) {
  const seen = new Map();
  const add = (c) => { if (typeof c === 'string' && /^#|^rgb/i.test(c)) seen.set(c.toUpperCase(), (seen.get(c.toUpperCase()) || 0) + 1); };
  add(layout.background?.color);
  for (const l of layout.layers) {
    if (l.kind === 'text') { add(l.color); (l.runs || []).forEach(r => add(r.color)); l.gradient?.stops?.forEach(s => add(s.color)); }
    if (l.kind === 'shape') { add(l.fill); l.gradient?.stops?.forEach(s => add(s.color)); }
    if (l.kind === 'icon') add(l.color);
  }
  ['#FFFFFF', '#000000'].forEach(add);
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).filter(c => !/,\s*0?\.\d+\)$/.test(c)).slice(0, 12);
}

export default function SlideEditor({ slide, presentationId, onClose, onSaved, onAskAI }) {
  const [layout, setLayout] = useState(() => JSON.parse(JSON.stringify(slide.layout)));
  // Selection: one or more layer ids (last = most recently picked).
  const [selectedIds, setSelectedIds] = useState([]);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const setSelectedId = useCallback((id) => setSelectedIds(id ? [id] : []), []);
  const [marquee, setMarquee] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [guides, setGuides] = useState([]);
  const [tab, setTab] = useState('edit');
  const [saveState, setSaveState] = useState('saved'); // saved | pending | saving | error
  const [saveError, setSaveError] = useState('');
  const [scale, setScale] = useState(1);

  const past = useRef([]);
  const future = useRef([]);
  const lastCoalesce = useRef({ key: null, at: 0 });
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const stageRef = useRef(null);
  const saveTimer = useRef(null);
  const savingRef = useRef(Promise.resolve());
  const checkpointDone = useRef(false);
  const dirty = useRef(false);
  const clientId = useMemo(() => `ed_${Math.random().toString(36).slice(2, 10)}`, []);
  const swatches = useMemo(() => swatchesOf(layout), [layout]);
  const selected = findLayer(layout, selectedId);
  const selectedLayers = selectedIds.map(id => findLayer(layout, id)).filter(Boolean);
  const selectedRef = useRef(selectedIds);
  selectedRef.current = selectedIds;
  const [, forceRender] = useState(0); // undo/redo button state

  // ── saving ───────────────────────────────────────────────────────────────
  const save = useCallback(() => {
    clearTimeout(saveTimer.current);
    if (!dirty.current) return savingRef.current;
    dirty.current = false;
    const body = { layout: layoutRef.current, checkpoint: !checkpointDone.current, client_id: clientId };
    setSaveState('saving');
    savingRef.current = savingRef.current.then(async () => {
      try {
        const { data } = await api.patch(`/presentations/${presentationId}/slides/${slide.index}/layout`, body);
        checkpointDone.current = true;
        onSaved?.(data.slide);
        setSaveState(dirty.current ? 'pending' : 'saved');
        setSaveError('');
      } catch (err) {
        dirty.current = true; // keep the edit; retried on the next change or close
        setSaveState('error');
        setSaveError(err.response?.data?.error || 'Couldn\'t save your changes. Check your connection.');
      }
    });
    return savingRef.current;
  }, [clientId, onSaved, presentationId, slide.index]);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    setSaveState('pending');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, SAVE_DELAY);
  }, [save]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // ── history ──────────────────────────────────────────────────────────────
  // commit(next) records the CURRENT layout for undo. `coalesce` merges a
  // burst of edits of the same field (typing) into one undo step.
  const commit = useCallback((next, { coalesce = null, from = null } = {}) => {
    const prev = from || layoutRef.current;
    if (next === prev) return;
    const now = Date.now();
    const merge = coalesce && lastCoalesce.current.key === coalesce && now - lastCoalesce.current.at < 1200;
    if (!merge) {
      past.current.push(prev);
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
    }
    lastCoalesce.current = { key: coalesce, at: now };
    future.current = [];
    layoutRef.current = next; // a save scheduled right now must see it
    setLayout(next);
    scheduleSave();
  }, [scheduleSave]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(layoutRef.current);
    lastCoalesce.current = { key: null, at: 0 };
    setLayout(prev);
    setSelectedIds(ids => ids.filter(id => findLayer(prev, id)));
    scheduleSave();
    forceRender(n => n + 1);
  }, [scheduleSave]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(layoutRef.current);
    setLayout(next);
    setSelectedIds(ids => ids.filter(id => findLayer(next, id)));
    scheduleSave();
    forceRender(n => n + 1);
  }, [scheduleSave]);

  // ── actions ──────────────────────────────────────────────────────────────
  const patchSelected = useCallback((patch, opts) => {
    if (!selectedId) return;
    commit(updateLayer(layoutRef.current, selectedId, patch), opts);
  }, [commit, selectedId]);

  const setSelectedBox = useCallback((box) => {
    if (!selectedId) return;
    commit(setBox(layoutRef.current, selectedId, { x: box.x, y: box.y, w: Math.max(4, box.w), h: Math.max(4, box.h) }));
  }, [commit, selectedId]);

  // Several layers at once: patch each (fn returns the patch for one layer, or null).
  const patchEach = useCallback((fn) => {
    let next = layoutRef.current;
    for (const id of selectedRef.current) {
      const l = findLayer(next, id);
      const patch = l && fn(l);
      if (patch) next = updateLayer(next, id, patch);
    }
    if (next !== layoutRef.current) commit(next);
  }, [commit]);

  const arrange = useCallback((to) => { if (selectedRef.current.length) commit(reorderLayers(layoutRef.current, selectedRef.current, to)); }, [commit]);
  const align = useCallback((how) => { if (selectedRef.current.length) commit(alignLayers(layoutRef.current, selectedRef.current, how)); }, [commit]);
  const distribute = useCallback((axis) => { if (selectedRef.current.length >= 3) commit(distributeLayers(layoutRef.current, selectedRef.current, axis)); }, [commit]);
  const remove = useCallback(() => {
    const ids = selectedRef.current;
    if (!ids.length) return;
    commit(removeLayers(layoutRef.current, ids));
    setSelectedIds([]);
    capture('layer_deleted', { presentation_id: presentationId, count: ids.length });
  }, [commit, presentationId]);
  const duplicate = useCallback(() => {
    if (!selectedRef.current.length) return;
    const { layout: next, ids } = duplicateLayers(layoutRef.current, selectedRef.current);
    if (ids.length) { commit(next); setSelectedIds(ids); }
  }, [commit]);
  const selectAll = useCallback(() => {
    const L = layoutRef.current;
    setSelectedIds(topLevel(L, L.layers.filter(l => !l.hidden).map(l => l.id)));
  }, []);
  const toggleHidden = useCallback((id) => {
    const l = findLayer(layoutRef.current, id);
    if (l) commit(updateLayer(layoutRef.current, id, { hidden: !l.hidden }));
  }, [commit]);
  const add = useCallback((kind) => {
    const { layout: next, id } = (kind === 'text' ? addText : addShape)(layoutRef.current, {});
    commit(next);
    setSelectedId(id);
    capture('layer_added', { presentation_id: presentationId, kind });
  }, [commit, presentationId]);

  const close = useCallback(async () => {
    // Commit an in-progress inline text edit, then let its state update land.
    if (document.activeElement?.isContentEditable) {
      document.activeElement.blur();
      await new Promise(r => setTimeout(r, 0));
    }
    await save();
    if (dirty.current) return; // last save failed: stay so nothing is lost
    onClose();
  }, [onClose, save]);

  // ── pointer: move / resize / rotate ──────────────────────────────────────
  const drag = useRef(null);

  const startMove = (e, l) => {
    if (e.button !== 0 || editingId === l.id) return;
    e.stopPropagation();
    // Finish an inline text edit first (preventDefault below would stop the
    // editor from blurring, and its text would be lost).
    if (editingId && document.activeElement?.isContentEditable) document.activeElement.blur();
    e.preventDefault(); // no browser text selection while dragging
    // A device and its screen UI behave like a group: the first click picks
    // the device; once the device (or something on it) is selected, clicks
    // reach the individual screen layers.
    if (l.screen_of) {
      const inGroup = selectedRef.current.some(id => id === l.screen_of || findLayer(layoutRef.current, id)?.screen_of === l.screen_of);
      const device = findLayer(layoutRef.current, l.screen_of);
      if (!inGroup && device) l = device;
    }
    // Shift / ⌘ / Ctrl-click adds or removes a layer from the selection.
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let ids;
    if (additive) {
      const cur = selectedRef.current;
      ids = cur.includes(l.id) ? cur.filter(id => id !== l.id) : [...cur, l.id];
      setSelectedIds(ids);
      if (!ids.includes(l.id)) return; // just deselected it: nothing to drag
    } else {
      // Dragging a layer that's part of a multi-selection drags the group.
      ids = selectedRef.current.includes(l.id) ? selectedRef.current : [l.id];
      setSelectedIds(ids);
    }
    const moving = topLevel(layoutRef.current, ids);
    drag.current = { mode: 'move', ids: moving, sx: e.clientX, sy: e.clientY, box: selectionBounds(layoutRef.current, moving), base: layoutRef.current, moved: false };
  };

  const startResize = (e, dir) => {
    e.stopPropagation();
    const ids = topLevel(layoutRef.current, selectedRef.current);
    if (!ids.length) return;
    if (ids.length === 1) {
      const l = findLayer(layoutRef.current, ids[0]);
      drag.current = { mode: 'resize', dir, id: l.id, rotation: l.rotation || 0, sx: e.clientX, sy: e.clientY, box: { x: l.x, y: l.y, w: l.w, h: l.h }, base: layoutRef.current, moved: false };
    } else {
      // Group resize scales every layer relative to the selection's bounds.
      drag.current = { mode: 'group-resize', dir, ids, sx: e.clientX, sy: e.clientY, box: selectionBounds(layoutRef.current, ids), base: layoutRef.current, moved: false };
    }
  };

  // Marquee: drag across empty canvas space to select everything it touches.
  const startMarquee = (e) => {
    if (e.button !== 0 || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const toCanvas = (cx, cy) => ({ x: (cx - r.left) / scale, y: (cy - r.top) / scale });
    const p = toCanvas(e.clientX, e.clientY);
    drag.current = { mode: 'marquee', toCanvas, x0: p.x, y0: p.y, additive: e.shiftKey || e.metaKey || e.ctrlKey, prev: selectedRef.current, sx: e.clientX, sy: e.clientY, moved: false };
  };

  const startRotate = (e) => {
    e.stopPropagation();
    const l = findLayer(layoutRef.current, selectedId);
    if (!l || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const cx = r.left + (l.x + l.w / 2) * scale; const cy = r.top + (l.y + l.h / 2) * scale;
    drag.current = { mode: 'rotate', id: l.id, cx, cy, base: layoutRef.current, moved: false };
  };

  useEffect(() => {
    const onMove = (e) => {
      const d = drag.current;
      if (!d) return;
      const dx = (e.clientX - (d.sx ?? 0)) / scale; const dy = (e.clientY - (d.sy ?? 0)) / scale;
      if (!d.moved && d.mode !== 'rotate' && Math.abs(dx) + Math.abs(dy) < 2 / scale) return;
      d.moved = true;
      if (d.mode === 'marquee') {
        const p = d.toCanvas(e.clientX, e.clientY);
        const rect = { x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), w: Math.abs(p.x - d.x0), h: Math.abs(p.y - d.y0) };
        setMarquee(rect);
        const hit = layersInRect(layoutRef.current, rect);
        setSelectedIds(d.additive ? [...new Set([...d.prev, ...hit])] : hit);
      } else if (d.mode === 'move') {
        const raw = { ...d.box, x: d.box.x + dx, y: d.box.y + dy };
        const { box, guides: g } = e.altKey ? { box: raw, guides: [] } : snapBox(d.base, d.ids, raw, 8 / scale);
        setGuides(g);
        setLayout(moveLayers(d.base, d.ids, box.x - d.box.x, box.y - d.box.y));
      } else if (d.mode === 'resize') {
        // In the element's own rotated frame, opposite handle pinned.
        const l = findLayer(d.base, d.id);
        const lock = keepsAspect(l) !== e.shiftKey && d.dir.length === 2;
        setLayout(setBox(d.base, d.id, resizeRotated(d.box, d.rotation, d.dir, dx, dy, { lockAspect: lock })));
      } else if (d.mode === 'group-resize') {
        // Corners keep the group's proportions (and scale its text); Shift frees them.
        const lock = d.dir.length === 2 && !e.shiftKey;
        const to = resizeRotated(d.box, 0, d.dir, dx, dy, { lockAspect: lock });
        setLayout(scaleLayers(d.base, d.ids, d.box, to, { scaleText: lock }));
      } else if (d.mode === 'rotate') {
        let deg = (Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180) / Math.PI + 90;
        if (deg > 180) deg -= 360;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        else if (Math.abs(deg) < 3) deg = 0;
        setLayout(updateLayer(d.base, d.id, { rotation: Math.round(deg * 10) / 10 }));
      }
    };
    const onUp = () => {
      const d = drag.current;
      drag.current = null;
      setGuides([]);
      if (d?.mode === 'marquee') {
        setMarquee(null);
        if (!d.moved && !d.additive) setSelectedIds([]); // plain click on empty space
        return;
      }
      if (d?.moved) commit(layoutRef.current, { from: d.base });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [commit, scale]);

  // ── keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); return; }
      if (e.key === 'Escape') { if (selectedRef.current.length) setSelectedIds([]); else close(); return; }
      if (!selectedRef.current.length) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return; }
      if (e.key === 'Enter') {
        if (selectedId && findLayer(layoutRef.current, selectedId)?.kind === 'text') { e.preventDefault(); setEditingId(selectedId); }
        return;
      }
      if (e.key === ']') { arrange(mod ? 'front' : 'forward'); return; }
      if (e.key === '[') { arrange(mod ? 'back' : 'backward'); return; }
      const step = e.shiftKey ? 10 : 1;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (delta) {
        e.preventDefault();
        commit(moveLayers(layoutRef.current, selectedRef.current, delta[0], delta[1]), { coalesce: `nudge-${selectedRef.current.join(',')}` });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [arrange, close, commit, duplicate, redo, remove, selectAll, selectedId, undo]);

  // ── rendering ────────────────────────────────────────────────────────────
  const commitInlineText = (id, el) => {
    setEditingId(null);
    const text = el.innerText.replace(/\n$/, '');
    const l = findLayer(layoutRef.current, id);
    if (l && text !== l.text) commit(updateLayer(layoutRef.current, id, { text }));
  };

  const renderLayer = (l) => {
    const editing = editingId === l.id;
    return (
      <div
        key={l.id}
        data-layer={l.id}
        style={{ ...layerBoxStyle(l), cursor: editing ? 'text' : 'move' }}
        onPointerDown={e => startMove(e, l)}
        onPointerEnter={() => setHoverId(l.id)}
        onPointerLeave={() => setHoverId(h => (h === l.id ? null : h))}
        onDoubleClick={e => { if (l.kind === 'text') { e.stopPropagation(); setSelectedId(l.id); setEditingId(l.id); } }}
      >
        {editing ? (
          <InlineTextEditor layer={l} onDone={el => commitInlineText(l.id, el)} />
        ) : (
          <LayerBody layer={l} layout={layout} />
        )}
      </div>
    );
  };

  const k = 1 / (scale || 1); // one screen px in canvas px
  const hover = hoverId && !selectedIds.includes(hoverId) ? findLayer(layout, hoverId) : null;
  const groupIds = topLevel(layout, selectedIds);
  const groupBox = groupIds.length > 1 ? selectionBounds(layout, groupIds) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col bg-zinc-950 text-zinc-100"
      role="dialog" aria-label="Slide editor"
    >
      {/* Top bar */}
      <div className="h-14 shrink-0 flex items-center gap-2 px-4 border-b border-zinc-800">
        <button onClick={close} className="flex items-center gap-1.5 h-9 px-3 rounded-md text-[13px] font-semibold bg-zinc-100 text-zinc-900 hover:bg-white">
          <Check size={15} /> Done
        </button>
        <div className="w-px h-6 bg-zinc-800 mx-1" />
        <ToolbarButton title="Undo (⌘Z)" disabled={!past.current.length} onClick={undo}><Undo2 size={16} /></ToolbarButton>
        <ToolbarButton title="Redo (⇧⌘Z)" disabled={!future.current.length} onClick={redo}><Redo2 size={16} /></ToolbarButton>
        <div className="w-px h-6 bg-zinc-800 mx-1" />
        <ToolbarButton title="Add text" onClick={() => add('text')}><Type size={16} /><span className="text-[12px]">Text</span></ToolbarButton>
        <ToolbarButton title="Add shape" onClick={() => add('shape')}><SquarePlus size={16} /><span className="text-[12px]">Shape</span></ToolbarButton>
        <div className="flex-1" />
        <SaveStatus state={saveState} error={saveError} onRetry={save} />
        <button onClick={close} className="w-9 h-9 rounded-md flex items-center justify-center text-zinc-400 hover:bg-zinc-800" title="Close editor" aria-label="Close editor">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Canvas */}
        <div
          className="flex-1 min-w-0 flex items-center justify-center p-6 overflow-hidden bg-zinc-900/60"
          onPointerDown={e => {
            if (e.target.closest('[data-layer]') || e.target.closest('[data-handle]')) return;
            if (document.activeElement?.isContentEditable) document.activeElement.blur(); // commits the text
            startMarquee(e);
          }}
        >
          <div style={{ width: 'min(100%, calc((100vh - 140px) * 16 / 9))', userSelect: 'none', WebkitUserSelect: 'none' }} className="shadow-2xl rounded-lg overflow-hidden">
            <LayeredSlide ref={stageRef} layout={layout} renderLayer={renderLayer} onStageScale={setScale}>
              {hover && !hover.hidden && (
                <div style={{ position: 'absolute', left: hover.x, top: hover.y, width: hover.w, height: hover.h, transform: hover.rotation ? `rotate(${hover.rotation}deg)` : undefined, outline: `${1.5 * k}px solid rgba(91,80,255,0.7)`, pointerEvents: 'none' }} />
              )}
              {selected && !selected.hidden && !editingId && (
                <SelectionBox layer={selected} k={k} onResize={startResize} onRotate={startRotate} />
              )}
              {groupBox && (
                <>
                  {selectedLayers.map(l => (
                    <div key={l.id} style={{ position: 'absolute', left: l.x, top: l.y, width: l.w, height: l.h, transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined, outline: `${1.5 * k}px solid rgba(91,80,255,0.85)`, pointerEvents: 'none' }} />
                  ))}
                  <SelectionBox layer={{ ...groupBox, rotation: 0 }} k={k} onResize={startResize} dashed />
                </>
              )}
              {marquee && (
                <div style={{ position: 'absolute', left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, background: 'rgba(91,80,255,0.12)', outline: `${k}px solid rgba(91,80,255,0.9)`, pointerEvents: 'none' }} />
              )}
              {guides.map((g, i) => (
                <div key={i} style={{
                  position: 'absolute', pointerEvents: 'none', background: '#FF2E74',
                  ...(g.axis === 'x' ? { left: g.at - 0.5 * k, top: 0, width: k, height: layout.canvas.h } : { top: g.at - 0.5 * k, left: 0, height: k, width: layout.canvas.w }),
                }} />
              ))}
            </LayeredSlide>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 shrink-0 border-l border-zinc-800 flex flex-col min-h-0 bg-zinc-950">
          <div className="flex border-b border-zinc-800">
            {[['edit', MousePointer2, 'Edit'], ['layers', Layers, 'Layers']].map(([id, Icon, name]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex-1 h-10 flex items-center justify-center gap-1.5 text-[12px] font-semibold ${tab === id ? 'text-zinc-50 border-b-2 border-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
                <Icon size={13} /> {name}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {tab === 'edit' && selectedLayers.length > 1 ? (
              <MultiInspector
                layers={selectedLayers} swatches={swatches}
                onPatchEach={patchEach} onAlign={align} onDistribute={distribute}
                onArrange={arrange} onDuplicate={duplicate} onDelete={remove}
              />
            ) : tab === 'edit' ? (
              <Inspector
                layer={selected} layout={layout} swatches={swatches}
                onPatch={patchSelected} onBox={setSelectedBox} onArrange={arrange}
                onDuplicate={duplicate} onDelete={remove}
                onAskAI={onAskAI ? async (l) => { await save(); if (!dirty.current) onAskAI(l); } : undefined}
              />
            ) : (
              <LayersPanel
                layout={layout} selectedIds={selectedIds} onToggleHidden={toggleHidden}
                onSelect={(id, additive) => {
                  if (additive) setSelectedIds(cur => (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]));
                  else { setSelectedIds([id]); setTab('edit'); }
                }}
              />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ToolbarButton({ onClick, title, disabled, children }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} disabled={disabled}
      className="h-9 min-w-9 px-2 rounded-md flex items-center justify-center gap-1.5 text-zinc-300 hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent">
      {children}
    </button>
  );
}

function SaveStatus({ state, error, onRetry }) {
  if (state === 'error') {
    return (
      <button onClick={onRetry} className="flex items-center gap-1.5 text-[12px] text-red-400 mr-2" title={error}>
        <CloudOff size={14} /> Not saved — retry
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-zinc-500 mr-2" aria-live="polite">
      {state === 'saved' ? <><Check size={13} /> Saved</> : <><Loader2 size={13} className="animate-spin" /> Saving…</>}
    </span>
  );
}

// Selection frame with 8 resize handles and a rotation handle; sized in
// canvas px but drawn at a constant on-screen size (k = 1 screen px).
function SelectionBox({ layer: l, k, onResize, onRotate, dashed = false }) {
  const hs = 10 * k;
  const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const pos = (d) => ({
    left: d.includes('w') ? -hs / 2 : d.includes('e') ? l.w - hs / 2 : l.w / 2 - hs / 2,
    top: d.includes('n') ? -hs / 2 : d.includes('s') ? l.h - hs / 2 : l.h / 2 - hs / 2,
  });
  // Cursors follow the element's rotation (an "east" handle on a 90°-rotated box points down).
  return (
    <div style={{
      position: 'absolute', left: l.x, top: l.y, width: l.w, height: l.h,
      transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined,
      outline: `${2 * k}px ${dashed ? 'dashed' : 'solid'} #5B50FF`, pointerEvents: 'none',
    }}>
      {handles.map(d => (
        <div key={d} data-handle onPointerDown={e => onResize(e, d)}
          style={{ position: 'absolute', ...pos(d), width: hs, height: hs, background: '#fff', border: `${1.5 * k}px solid #5B50FF`, borderRadius: 2 * k, cursor: handleCursor(d, l.rotation || 0), pointerEvents: 'auto' }} />
      ))}
      {onRotate && (
        <div data-handle onPointerDown={onRotate} title="Rotate (Shift snaps to 15°)"
          style={{ position: 'absolute', left: l.w / 2 - hs / 2, top: -hs * 3, width: hs, height: hs, borderRadius: '50%', background: '#fff', border: `${1.5 * k}px solid #5B50FF`, cursor: 'grab', pointerEvents: 'auto' }} />
      )}
    </div>
  );
}

// In-place text editing with the layer's own font/size/colour. Plain text:
// style runs whose text survives the edit keep their styling.
function InlineTextEditor({ layer, onDone }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);
  const justify = layer.valign === 'middle' ? 'center' : layer.valign === 'bottom' ? 'flex-end' : 'flex-start';
  const style = textStyle(layer);
  // Gradient text is unreadable while editing (transparent fill) — edit in its base colour.
  if (layer.gradient) Object.assign(style, { backgroundImage: 'none', color: layer.gradient.stops?.[0]?.color || '#fff', WebkitTextFillColor: 'currentColor' });
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: justify }}>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onPointerDown={e => e.stopPropagation()}
        onBlur={e => onDone(e.currentTarget)}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); } e.stopPropagation(); }}
        onPaste={e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }}
        style={{ ...style, outline: 'none', caretColor: '#5B50FF', minHeight: '1em', userSelect: 'text', WebkitUserSelect: 'text' }}
      >
        {layer.text}
      </div>
    </div>
  );
}
