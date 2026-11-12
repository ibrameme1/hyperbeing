import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, ArrowRight } from 'lucide-react';
import { Background, LayerBody, useStageScale } from '../layered/LayeredSlide';
import { useLayoutFonts } from '../layered/fonts';

// ─── A real layered slide on the marketing site ────────────────────────────
// Renders a showcase layout (public/showcase/<deck>/sN.json — the same layout
// format the app stores) with the app's own layer renderers, so what visitors
// see IS the product's output: live text, native shapes and charts, separate
// pictures. Modes:
//   build   – layers arrive the way a slide generates (text and structure
//             first, then each picture)
//   layers  – every layer outlined and colour-coded by kind
//   apart   – the stack pulled apart in 3D
//   play    – every layer can be dragged (proof that nothing is baked in)

const cache = new Map(); // url → Promise<layout>
export function loadShowcaseLayout(url) {
  // A static JSON file of this site, not an API call (so not the axios client).
  if (!cache.has(url)) cache.set(url, fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(url);
}

export function useShowcaseLayout(url) {
  const [layout, setLayout] = useState(null);
  useEffect(() => {
    let alive = true;
    setLayout(null);
    loadShowcaseLayout(url).then(l => { if (alive) setLayout(l); });
    return () => { alive = false; };
  }, [url]);
  return layout;
}

export const KIND_META = {
  text: { label: 'Text', color: '#22D3EE' },
  image: { label: 'Picture', color: '#FF8A1F' },
  shape: { label: 'Shape', color: '#4ADE80' },
  chart: { label: 'Chart', color: '#F472B6' },
  icon: { label: 'Icon', color: '#A78BFA' },
};

export function layerCounts(layout) {
  const c = { text: 0, image: 0, shape: 0, chart: 0, icon: 0 };
  for (const l of layout?.layers || []) if (c[l.kind] !== undefined) c[l.kind]++;
  return c;
}

// The few lucide icons the showcase layouts use, bundled so the marketing page
// never waits on the API for them.
const ICONS = { 'chevron-right': ChevronRight, 'arrow-right': ArrowRight };
function Body({ layer, layout }) {
  const Icon = layer.kind === 'icon' && ICONS[layer.name];
  if (Icon) {
    const s = Math.min(layer.w, layer.h);
    return <Icon size={s} color={layer.color} strokeWidth={layer.stroke || 2} style={{ position: 'absolute', left: (layer.w - s) / 2, top: (layer.h - s) / 2 }} />;
  }
  return <LayerBody layer={layer} layout={layout} />;
}

// How far each kind lifts off the slide when the stack is pulled apart (px, canvas space).
const DEPTH = { shape: 130, image: 260, chart: 260, icon: 390, text: 390 };
// One translucent sheet per plane, so the pulled-apart stack reads as sheets
// of a document rather than loose pieces.
const SHEETS = [
  { z: 130, label: 'Shapes', kind: 'shape' },
  { z: 260, label: 'Pictures and charts', kind: 'image' },
  { z: 390, label: 'Text', kind: 'text' },
];

export default function LiveSlide({ layout, mode = 'static', playKey = 0, radius = 14, onDragged }) {
  const wrapRef = useRef(null);
  const reduce = useReducedMotion();
  useLayoutFonts(layout);
  const { w, h } = layout?.canvas || { w: 1920, h: 1080 };
  const scale = useStageScale(wrapRef, w);
  const [offsets, setOffsets] = useState({}); // id → {dx, dy} from dragging
  const [hover, setHover] = useState(null);
  const drag = useRef(null);

  useEffect(() => { setOffsets({}); }, [layout, playKey]);

  // Arrival order: structure and words first (in z-order), then every picture
  // and chart, like a slide generating in the app.
  const delays = useMemo(() => {
    const d = {}; let base = 0; let late = 0;
    for (const l of layout?.layers || []) {
      if (l.kind === 'image' || l.kind === 'chart') d[l.id] = 0.9 + (late++) * 0.11;
      else d[l.id] = 0.05 + (base++) * 0.018;
    }
    return d;
  }, [layout]);

  if (!layout) {
    return <div ref={wrapRef} style={{ aspectRatio: '16 / 9', width: '100%', borderRadius: radius, background: '#111114' }} />;
  }

  const apart = mode === 'apart';
  const outlined = mode === 'layers';
  const playable = mode === 'play';

  const onPointerDown = (e, l) => {
    if (!playable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const o = offsets[l.id] || { dx: 0, dy: 0 };
    drag.current = { id: l.id, x: e.clientX, y: e.clientY, ...o };
  };
  const onPointerMove = (e) => {
    const g = drag.current;
    if (!g) return;
    const dx = g.dx + (e.clientX - g.x) / scale; const dy = g.dy + (e.clientY - g.y) / scale;
    setOffsets(prev => ({ ...prev, [g.id]: { dx, dy } }));
  };
  const onPointerUp = () => { if (drag.current) { drag.current = null; onDragged?.(); } };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', aspectRatio: `${w} / ${h}`, perspective: 2600, borderRadius: radius, overflow: apart ? 'visible' : 'hidden', touchAction: playable ? 'none' : undefined }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transform: `scale(${scale || 0.0001})`, transformOrigin: '0 0', transformStyle: 'preserve-3d' }}>
        <motion.div
          style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}
          animate={apart ? { rotateX: 44, rotateZ: -20, scale: 0.66, y: 120 } : { rotateX: 0, rotateZ: 0, scale: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <div style={{ position: 'absolute', inset: 0, borderRadius: apart ? 18 : 0, overflow: 'hidden', boxShadow: apart ? '0 60px 120px rgba(0,0,0,0.45)' : 'none', outline: apart ? '3px solid rgba(255,255,255,0.25)' : 'none' }}>
            <Background layout={layout} />
          </div>
          {SHEETS.map(sh => (
            <motion.div key={sh.label} aria-hidden="true"
              animate={{ z: apart ? sh.z : 0, opacity: apart ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
              style={{ position: 'absolute', inset: 0, borderRadius: 18, border: `3px solid ${KIND_META[sh.kind].color}`, background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }}>
              <span style={{ position: 'absolute', left: 0, bottom: -64, padding: '8px 18px', borderRadius: 10, background: KIND_META[sh.kind].color, color: '#0b0b0c', fontFamily: 'Inter, sans-serif', fontSize: 34, fontWeight: 700, whiteSpace: 'nowrap' }}>{sh.label}</span>
            </motion.div>
          ))}
          {layout.layers.map((l) => {
            if (l.hidden) return null;
            const meta = KIND_META[l.kind] || KIND_META.shape;
            const o = offsets[l.id];
            const isBuild = mode === 'build' && !reduce;
            return (
              <motion.div
                key={`${playKey}-${l.id}`}
                onPointerDown={(e) => onPointerDown(e, l)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
                onPointerEnter={() => (outlined || playable) && setHover(l.id)} onPointerLeave={() => setHover(h0 => (h0 === l.id ? null : h0))}
                initial={isBuild ? { opacity: 0, y: l.kind === 'image' ? 0 : 16, scale: l.kind === 'image' ? 0.94 : 1 } : false}
                animate={{ opacity: l.opacity ?? 1, y: 0, scale: 1, z: apart ? DEPTH[l.kind] || 0 : 0 }}
                transition={isBuild ? { delay: delays[l.id] || 0, duration: 0.55, ease: [0.16, 1, 0.3, 1] } : { duration: reduce ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: 'absolute', left: l.x + (o?.dx || 0), top: l.y + (o?.dy || 0), width: l.w, height: l.h,
                  rotate: l.rotation || 0,
                  cursor: playable ? 'grab' : undefined,
                  outline: outlined ? `${hover === l.id ? 5 : 2.5}px ${l.kind === 'image' ? 'solid' : 'dashed'} ${meta.color}` : (playable && hover === l.id ? '4px solid #5B50FF' : 'none'),
                  outlineOffset: 2,
                  zIndex: drag.current?.id === l.id ? 5 : undefined,
                }}
              >
                <Body layer={l} layout={layout} />
                {(outlined || playable) && hover === l.id && (
                  <span style={{ position: 'absolute', left: 0, top: -44, padding: '6px 12px', borderRadius: 8, background: playable ? '#5B50FF' : meta.color, color: playable ? '#fff' : '#0b0b0c', fontFamily: 'Inter, sans-serif', fontSize: 24, fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                    {meta.label}{playable ? ' · drag me' : ''}
                  </span>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
