import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { mediaUrl } from '../../utils/mediaUrl';
import ChartLayer from './ChartLayer';
import IconLayer from './IconLayer';
import { fontStack, useLayoutFonts } from './fonts';

// ─── Live renderer for layered slides ──────────────────────────────────────
// Draws `slide.layout` natively: background, generated image layers, real
// text (Google fonts), shapes (incl. frosted glass), charts, icons, logos.
// Coordinates are canvas px (16:9 → 1920×1080); the stage is rendered at
// canvas size and CSS-scaled to the container, so every layer keeps exact
// proportions at any width. Semantics mirror the server preview
// (backend/services/layoutPreview.js) — keep the two in step.

export function cssGradient(g) {
  if (!g?.stops?.length) return null;
  return `linear-gradient(${g.angle ?? 90}deg, ${g.stops.map(s => `${s.color} ${s.pos}%`).join(', ')})`;
}

// Split text into styled segments from `runs` (each run's text is located in
// order inside the full text, like the server renderer does).
export function textSegments(layer) {
  const text = String(layer.text ?? '');
  if (!layer.runs?.length) return [{ text }];
  const segs = [];
  let pos = 0;
  for (const r of layer.runs) {
    if (!r?.text) continue;
    const idx = text.indexOf(r.text, pos);
    if (idx === -1) continue;
    if (idx > pos) segs.push({ text: text.slice(pos, idx) });
    segs.push({ text: r.text, run: r });
    pos = idx + r.text.length;
  }
  if (pos < text.length) segs.push({ text: text.slice(pos) });
  return segs;
}

function gradientTextStyle(g) {
  return { backgroundImage: cssGradient(g), WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent' };
}

export function TextContent({ layer }) {
  return textSegments(layer).map((seg, i) => {
    if (!seg.run) return <span key={i}>{seg.text}</span>;
    const r = seg.run;
    const style = {
      ...(r.gradient ? gradientTextStyle(r.gradient) : r.color ? { color: r.color, WebkitTextFillColor: r.color } : {}),
      ...(r.weight ? { fontWeight: r.weight } : {}),
      ...(r.italic ? { fontStyle: 'italic' } : {}),
    };
    return <span key={i} style={style}>{seg.text}</span>;
  });
}

export function textStyle(l) {
  return {
    fontFamily: fontStack(l.font),
    fontSize: l.size,
    fontWeight: l.weight,
    fontStyle: l.italic ? 'italic' : 'normal',
    lineHeight: l.line_height,
    letterSpacing: `${l.letter_spacing || 0}em`,
    textTransform: l.uppercase ? 'uppercase' : 'none',
    textAlign: l.align,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'normal',
    ...(l.gradient ? gradientTextStyle(l.gradient) : { color: l.color }),
    ...(l.shadow ? { textShadow: `${l.shadow.dx}px ${l.shadow.dy}px ${l.shadow.blur}px ${l.shadow.color}` } : {}),
  };
}

function TextLayer({ layer }) {
  const justify = layer.valign === 'middle' ? 'center' : layer.valign === 'bottom' ? 'flex-end' : 'flex-start';
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: justify }}>
      <div style={textStyle(layer)}><TextContent layer={layer} /></div>
    </div>
  );
}

function ShapeLayer({ layer: l }) {
  const fill = cssGradient(l.gradient) || l.fill || 'transparent';
  const radius = l.shape === 'ellipse' ? '50%' : `${Math.min(l.radius || 0, l.w / 2, l.h / 2)}px`;
  if (l.shape === 'line') {
    return <div style={{ position: 'absolute', inset: 0, background: fill }} />;
  }
  const style = { position: 'absolute', inset: 0, borderRadius: radius };
  const fillLayer = l.gradient ? fill : `linear-gradient(${fill}, ${fill})`;
  if (l.border?.width) {
    if (l.border.gradient) {
      // Gradient border with rounded corners: fill on the padding box, the
      // border gradient on the border box under a transparent border.
      style.border = `${l.border.width}px solid transparent`;
      style.background = `${fillLayer} padding-box, ${cssGradient(l.border.gradient)} border-box`;
    } else {
      style.border = `${l.border.width}px solid ${l.border.color}`;
      style.background = fill;
    }
  } else {
    style.background = fill;
  }
  if (l.frosted) {
    style.backdropFilter = `blur(${(l.frosted.blur || 24) / 2}px)`;
    style.WebkitBackdropFilter = style.backdropFilter;
  }
  if (l.shadow) style.boxShadow = `${l.shadow.dx}px ${l.shadow.dy}px ${l.shadow.blur}px ${l.shadow.color}`;
  return (
    <div style={style}>
      {l.highlight && l.shape === 'rect' && (
        // Glass bevel: light catching the top edge, fading down.
        <div style={{
          position: 'absolute', inset: l.border?.width ? -l.border.width : 0, borderRadius: radius,
          padding: Math.max(1.5, (l.border?.width || 1) + 0.5),
          background: 'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0) 35%)',
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor', maskComposite: 'exclude', pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}

function ImageLayer({ layer: l }) {
  if (!l.src) {
    // Still generating: a soft placeholder where the element will land.
    return <div className="skeleton" style={{ position: 'absolute', inset: 0, borderRadius: 24, opacity: 0.35 }} />;
  }
  const fx = l.shadow || (l.glow ? { dx: 0, dy: 0, blur: l.glow.blur, color: l.glow.color } : null);
  return (
    <img
      src={mediaUrl(l.src)} alt={l.name || ''} draggable={false}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: l.fit === 'fill' ? 'fill' : l.fit === 'cover' ? 'cover' : 'contain',
        transform: l.flip ? 'scaleX(-1)' : undefined,
        // Photo tiles: rounded corners and a hairline frame, like a card.
        borderRadius: l.radius ? Math.min(l.radius, l.w / 2, l.h / 2) : undefined,
        border: l.border?.width ? `${l.border.width}px solid ${l.border.color}` : undefined,
        boxSizing: 'border-box',
        filter: fx ? `drop-shadow(${fx.dx}px ${fx.dy}px ${fx.blur / 2}px ${fx.color})` : undefined,
        userSelect: 'none', pointerEvents: 'none',
      }}
    />
  );
}

function LogoLayer({ layer: l, layout }) {
  if (l.src) return <ImageLayer layer={{ ...l, fit: 'contain' }} />;
  const size = Math.min(l.h * 0.8, (l.w / Math.max(1, l.brand?.length || 1)) * 1.6);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', fontFamily: fontStack(layout.fonts?.display || 'Inter'), fontWeight: 800, fontSize: size, color: l.color || '#fff', whiteSpace: 'nowrap' }}>
      {l.brand}
    </div>
  );
}

export function LayerBody({ layer, layout }) {
  switch (layer.kind) {
    case 'text': return <TextLayer layer={layer} />;
    case 'shape': return <ShapeLayer layer={layer} />;
    case 'chart': return <ChartLayer layer={layer} />;
    case 'icon': return layer.src ? <ImageLayer layer={{ ...layer, fit: 'contain' }} /> : <IconLayer layer={layer} />;
    case 'logo': return <LogoLayer layer={layer} layout={layout} />;
    case 'image': return <ImageLayer layer={layer} />;
    default: return null;
  }
}

export function layerBoxStyle(l) {
  return {
    position: 'absolute', left: l.x, top: l.y, width: l.w, height: l.h,
    opacity: l.opacity ?? 1,
    transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined,
  };
}

export function Background({ layout }) {
  const bg = layout.background || {};
  const base = bg.type === 'gradient' ? cssGradient(bg.gradient) : (bg.color || '#000');
  return (
    <div style={{ position: 'absolute', inset: 0, background: base }}>
      {bg.type === 'image' && bg.src && (
        <img src={mediaUrl(bg.src)} alt="" draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', userSelect: 'none' }} />
      )}
    </div>
  );
}

// Tracks the container width → stage scale.
export function useStageScale(ref, canvasW) {
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setScale(el.clientWidth / canvasW);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, canvasW]);
  return scale;
}

/**
 * Read-only layered slide. `children` render inside the stage (canvas px) —
 * the editor uses this for selection overlays.
 */
const LayeredSlide = forwardRef(function LayeredSlide({ layout, className = '', style, children, renderLayer, onStageScale }, stageRef) {
  const wrapRef = useRef(null);
  useLayoutFonts(layout);
  const { w, h } = layout.canvas || { w: 1920, h: 1080 };
  const scale = useStageScale(wrapRef, w);
  useEffect(() => { if (scale) onStageScale?.(scale); }, [scale, onStageScale]);

  return (
    <div ref={wrapRef} className={`relative w-full overflow-hidden ${className}`} style={{ aspectRatio: `${w} / ${h}`, ...style }}>
      <div
        ref={stageRef}
        style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transform: `scale(${scale || 0.0001})`, transformOrigin: '0 0' }}
      >
        <Background layout={layout} />
        {(layout.layers || []).map(l => (l.hidden ? null : (
          renderLayer ? renderLayer(l) : (
            <div key={l.id} style={layerBoxStyle(l)}><LayerBody layer={l} layout={layout} /></div>
          )
        )))}
        {children}
      </div>
    </div>
  );
});

export default LayeredSlide;
