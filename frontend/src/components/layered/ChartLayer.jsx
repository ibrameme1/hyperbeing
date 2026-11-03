import { fontStack } from './fonts';

// Native chart of a layered slide. Same geometry as the server preview
// (backend/services/layoutPreview.js chartSvg), drawn in the layer's own
// coordinate space so the editor can move/resize it like any box.
const PALETTE = ['#FF2E74', '#00FFA3', '#FF8A1F', '#4FACFE', '#FFD166', '#B388FF'];

export default function ChartLayer({ layer }) {
  const { w, h, categories = [], series = [], options = {}, chart_type: type } = layer;
  const fs = options.font_size || 18;
  const font = { fontFamily: fontStack(options.font || 'Inter'), fontSize: fs };
  const colorOf = (s, i) => s.color || PALETTE[i % PALETTE.length];
  const labelColor = options.label_color || '#FFFFFF';
  const axisColor = options.axis_color || 'rgba(255,255,255,0.5)';

  if (!series.length) return null;

  if (type === 'pie' || type === 'donut') {
    const vals = (series[0].values || []).map(v => Math.max(0, v || 0));
    const sum = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = w / 2; const cy = h / 2; const r = Math.min(w, h) / 2 - 8;
    let a0 = -Math.PI / 2;
    const slices = vals.map((v, i) => {
      const a1 = a0 + (v / sum) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const d = `M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z`;
      a0 = a1;
      return <path key={i} d={d} fill={options.point_colors?.[i] || PALETTE[i % PALETTE.length]} />;
    });
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible', display: 'block' }}>
        {slices}
        {type === 'donut' && <circle cx={cx} cy={cy} r={r * 0.6} fill="#000" fillOpacity={0.85} />}
      </svg>
    );
  }

  const pad = { l: 56, r: 16, t: 16, b: 40 };
  const all = series.flatMap(s => s.values || []).filter(v => v !== null && v !== undefined);
  const yMin = options.y_min ?? Math.min(0, ...all);
  const yMax = options.y_max ?? (Math.max(...all) * 1.1 || 1);
  const horizontal = type === 'bar';
  const px = pad.l; const py = pad.t; const pw = w - pad.l - pad.r; const ph = h - pad.t - pad.b;
  const n = Math.max(1, categories.length);
  const yPos = (v) => py + ph - ((v - yMin) / (yMax - yMin || 1)) * ph;
  const fmt = (v) => `${options.value_prefix || ''}${v}${options.value_suffix || ''}`;

  const parts = [<line key="axis" x1={px} y1={py + ph} x2={px + pw} y2={py + ph} stroke={axisColor} strokeWidth={2} />];
  if (!horizontal) {
    categories.forEach((c, i) => parts.push(
      <text key={`c${i}`} x={px + (i + 0.5) * (pw / n)} y={py + ph + fs + 8} textAnchor="middle" fill={labelColor} style={font}>{c}</text>,
    ));
  }

  if (type === 'column' || type === 'bar') {
    const groupW = (horizontal ? ph : pw) / n; const bw = (groupW * 0.7) / series.length;
    series.forEach((s, si) => (s.values || []).forEach((v, i) => {
      if (v === null || v === undefined) return;
      const c = options.point_colors?.[i] || colorOf(s, si);
      if (horizontal) {
        const bwid = Math.max(0, ((v - yMin) / (yMax - yMin || 1)) * pw);
        parts.push(<rect key={`b${si}_${i}`} x={px} y={py + i * groupW + groupW * 0.15 + si * bw} width={bwid} height={bw} rx={4} fill={c} />);
      } else {
        const y = yPos(v);
        const x = px + i * groupW + groupW * 0.15 + si * bw;
        parts.push(<rect key={`b${si}_${i}`} x={x} y={y} width={bw} height={Math.max(0, py + ph - y)} rx={4} fill={c} />);
        if (options.show_values) parts.push(<text key={`v${si}_${i}`} x={x + bw / 2} y={y - 8} textAnchor="middle" fill={labelColor} style={font}>{fmt(v)}</text>);
      }
    }));
  } else {
    series.forEach((s, si) => {
      const pts = (s.values || []).map((v, i) => (v === null || v === undefined ? null : [px + (i + 0.5) * (pw / n), yPos(v)]));
      let d = ''; let pen = false;
      for (const p of pts) {
        if (!p) { pen = false; continue; }
        d += `${pen ? ' L' : ' M'}${p[0]},${p[1]}`;
        pen = true;
      }
      const valid = pts.filter(Boolean);
      if (type === 'area' && valid.length > 1) {
        parts.push(<path key={`a${si}`} d={`M${valid[0][0]},${py + ph} L${valid.map(p => p.join(',')).join(' L')} L${valid[valid.length - 1][0]},${py + ph} Z`} fill={colorOf(s, si)} fillOpacity={0.25} />);
      }
      parts.push(<path key={`l${si}`} d={d.trim()} fill="none" stroke={colorOf(s, si)} strokeWidth={options.line_width || 4} strokeLinejoin="round" strokeLinecap="round" />);
    });
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible', display: 'block' }}>
      {parts}
    </svg>
  );
}
