import { useId } from 'react';
import { fontStack } from './fonts';
import { chartGeometry } from './chartGeometry';

// Native chart of a layered slide. chartGeometry turns the layer into drawing
// primitives (the server preview draws the same list — keep the two
// chartGeometry.js files identical), in the layer's own coordinate space so
// the editor can move/resize it like any box.
export default function ChartLayer({ layer }) {
  const { w, h, options = {} } = layer;
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const prims = chartGeometry(layer);
  if (!prims.length) return null;
  const font = fontStack(options.font || 'Inter');
  const hole = prims.find(p => p.t === 'hole');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible', display: 'block' }}>
      {hole && (
        // A donut's hole is cut out of the slices, so the slide shows through.
        <mask id={`dh${id}`}>
          <rect width={w} height={h} fill="#fff" />
          <circle cx={hole.cx} cy={hole.cy} r={hole.r} fill="#000" />
        </mask>
      )}
      {prims.map((p, i) => {
        const masked = hole && (p.t === 'path' || p.t === 'circle') ? `url(#dh${id})` : undefined;
        switch (p.t) {
          case 'line': return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.stroke} strokeWidth={p.sw} strokeDasharray={p.dash} opacity={p.op} />;
          case 'rect': return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx} fill={p.fill} opacity={p.op} />;
          case 'path': return <path key={i} d={p.d} fill={p.fill} stroke={p.stroke} strokeWidth={p.sw} strokeLinejoin="round" strokeLinecap="round" opacity={p.op} mask={masked} />;
          case 'circle': return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={p.fill} mask={masked} />;
          case 'text': return <text key={i} x={p.x} y={p.y} textAnchor={p.anchor} fill={p.fill} opacity={p.op} style={{ fontFamily: font, fontSize: p.size, fontWeight: p.weight || 400 }}>{p.text}</text>;
          default: return null;
        }
      })}
    </svg>
  );
}
