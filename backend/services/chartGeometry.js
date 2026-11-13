// ─── Chart geometry (shared by every renderer) ──────────────────────────────
// Turns a chart layer into a flat list of drawing primitives in the layer's
// own coordinate space (0,0 = the layer's top-left). The server preview
// (layoutPreview.js) and the web renderer (ChartLayer.jsx) both draw exactly
// this list, so a chart looks the same in the app, in thumbnails and in PDF.
//
// KEEP IDENTICAL to frontend/src/components/layered/chartGeometry.js (the two
// packages share no code; a test compares the files).
//
// Primitives: {t:'line',x1,y1,x2,y2,stroke,sw,dash?} {t:'rect',x,y,w,h,rx,fill,op?}
//             {t:'path',d,fill,stroke,sw,op?} {t:'circle',cx,cy,r,fill,stroke?,sw?}
//             {t:'text',x,y,text,anchor,fill,size,weight?}  (y = baseline)

export const CHART_PALETTE = ['#FF2E74', '#00FFA3', '#FF8A1F', '#4FACFE', '#FFD166', '#B388FF'];

// "Nice" axis ticks: 4-6 round values spanning [min, max].
export function niceTicks(min, max, target = 5) {
  if (!(max > min)) return [min];
  const raw = (max - min) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => (max - min) / s <= target + 1) || 10 * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-6; v += step) ticks.push(Math.round(v * 1e6) / 1e6 + 0);
  return ticks;
}

// 12000 → "12,000"; 0.5 stays "0.5"; long decimals are trimmed.
export function formatNumber(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  const r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
  const [i, d] = String(Math.abs(r)).split('.');
  return `${r < 0 ? '-' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${d ? `.${d}` : ''}`;
}

const textW = (s, size) => String(s).length * size * 0.56;

// Category labels wrap onto up to three lines inside their slot instead of
// running into their neighbours ("Branch network consolidation").
export function wrapLabel(text, maxChars) {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  if (lines.length > 3) { lines.length = 3; lines[2] = `${lines[2].slice(0, Math.max(1, maxChars - 1))}…`; }
  return lines;
}

export function waterfallBars(values, totals) {
  const isTotal = (i) => i === 0 || (Array.isArray(totals) && totals.includes(i));
  let level = 0;
  return values.map((v, i) => {
    const n = v === null || v === undefined ? 0 : v;
    if (isTotal(i)) { level = n; return { from: 0, to: n, total: true }; }
    const bar = { from: level, to: level + n, total: false };
    level += n;
    return bar;
  });
}

export function chartGeometry(layer) {
  const { w, h, categories = [], series = [], chart_type: type } = layer;
  const o = layer.options || {};
  const fs = o.font_size || 18;
  const label = o.label_color || '#FFFFFF';
  const axis = o.axis_color || 'rgba(255,255,255,0.5)';
  const colorOf = (s, i) => s.color || CHART_PALETTE[i % CHART_PALETTE.length];
  const fmt = (v) => `${o.value_prefix || ''}${formatNumber(v)}${o.value_suffix || ''}`;
  const out = [];
  if (!series.length) return out;

  if (type === 'pie' || type === 'donut') {
    const vals = (series[0].values || []).map(v => Math.max(0, v || 0));
    const sum = vals.reduce((a, b) => a + b, 0) || 1;
    const legendW = o.show_legend ? Math.min(w * 0.42, Math.max(...categories.map(c => textW(c, fs)), 60) + fs * 2.2) : 0;
    const cx = (w - legendW) / 2; const cy = h / 2; const r = Math.max(4, Math.min(w - legendW, h) / 2 - 8);
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1 = a0 + (v / sum) * Math.PI * 2;
      const c = o.point_colors?.[i] || CHART_PALETTE[i % CHART_PALETTE.length];
      if (v >= sum) out.push({ t: 'circle', cx, cy, r, fill: c });
      else if (v > 0) out.push({ t: 'path', d: `M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z`, fill: c });
      if (o.show_values && v / sum >= 0.06) {
        const am = (a0 + a1) / 2; const rr = type === 'donut' ? r * 0.8 : r * 0.62;
        out.push({ t: 'text', x: cx + rr * Math.cos(am), y: cy + rr * Math.sin(am) + fs * 0.35, text: fmt(v), anchor: 'middle', fill: o.value_color || '#FFFFFF', size: fs, weight: 700 });
      }
      a0 = a1;
    });
    // The hole shows whatever is behind the chart (a real ring, not a disc).
    if (type === 'donut') out.push({ t: 'hole', cx, cy, r: r * 0.6 });
    if (o.show_legend) {
      const x0 = w - legendW + fs * 0.6; const lh = fs * 1.7; let y = cy - (categories.length * lh) / 2 + fs;
      categories.forEach((c, i) => {
        out.push({ t: 'rect', x: x0, y: y - fs * 0.8, w: fs * 0.8, h: fs * 0.8, rx: 3, fill: o.point_colors?.[i] || CHART_PALETTE[i % CHART_PALETTE.length] });
        out.push({ t: 'text', x: x0 + fs * 1.2, y, text: c, anchor: 'start', fill: label, size: fs });
        y += lh;
      });
    }
    return out;
  }

  const horizontal = type === 'bar';
  const waterfall = type === 'waterfall';
  const stacked = !!o.stacked && (type === 'column' || type === 'bar');
  const n = Math.max(1, categories.length);
  // Waterfall: the first series holds a start total, then changes (+/-), then
  // optionally totals again (options.totals = indices that are totals; the
  // first bar always is). Every bar floats from the running level.
  const wf = waterfall ? waterfallBars(series[0].values || [], o.totals) : null;
  const all = wf ? wf.flatMap(b => [b.from, b.to]) : series.flatMap(s => s.values || []).filter(v => v !== null && v !== undefined);
  const stackTotals = Array.from({ length: n }, (_, i) => series.reduce((a, s) => a + Math.max(0, s.values?.[i] || 0), 0));
  const dataMax = stacked ? Math.max(...stackTotals) : Math.max(...all);
  const yMin = o.y_min ?? Math.min(0, ...all);
  const yMax = o.y_max ?? (dataMax * 1.12 || 1);
  const ticks = o.hide_axis ? [] : niceTicks(yMin, yMax);
  const tickLabels = ticks.map(fmt);

  // Room for what sits around the plot.
  const legendH = o.show_legend && series.length > 1 ? fs * 1.9 : 0;
  const catW = horizontal ? Math.min(w * 0.36, Math.max(...categories.map(c => textW(c, fs)), 30) + 14) : 0;
  // Vertical charts: wrap category labels to their slot (estimated from the
  // layer width; the axis gutter is small next to it).
  const slotChars = Math.max(4, Math.floor(((w - 90) / n) / (fs * 0.56)) - 1);
  const catLines = horizontal ? [] : categories.map(c => wrapLabel(c, slotChars));
  const catRows = Math.max(1, ...catLines.map(l => l.length));
  const pad = {
    l: horizontal ? catW : (ticks.length ? Math.max(...tickLabels.map(t => textW(t, fs * 0.9))) + 16 : 8),
    r: horizontal ? textW(fmt(dataMax), fs) + 18 : 16,
    t: legendH + ((o.annotations || []).some(a => a.kind !== 'line') ? fs * 4.2 : (o.show_values || waterfall || (o.annotations || []).length ? fs * 1.5 : 10)),
    b: horizontal ? (ticks.length ? fs * 1.6 : 8) : fs * (0.75 + 1.15 * catRows),
  };
  const px = pad.l; const py = pad.t; const pw = Math.max(10, w - pad.l - pad.r); const ph = Math.max(10, h - pad.t - pad.b);
  const frac = (v) => (v - yMin) / (yMax - yMin || 1);
  const yPos = (v) => py + ph - frac(v) * ph;
  const xPos = (v) => px + frac(v) * pw;
  const catX = (i) => px + (i + 0.5) * (pw / n);

  // Legend (top-left of the layer, one row).
  if (legendH) {
    let x = px;
    series.forEach((s, si) => {
      out.push({ t: 'rect', x, y: fs * 0.25, w: fs * 0.85, h: fs * 0.85, rx: 3, fill: colorOf(s, si) });
      out.push({ t: 'text', x: x + fs * 1.2, y: fs * 1.0, text: s.name, anchor: 'start', fill: label, size: fs * 0.95 });
      x += fs * 1.2 + textW(s.name, fs * 0.95) + fs * 1.4;
    });
  }

  // Value axis: tick labels, optional gridlines, baseline.
  ticks.forEach((v, i) => {
    if (horizontal) {
      const x = xPos(v);
      if (o.show_grid && v !== yMin) out.push({ t: 'line', x1: x, y1: py, x2: x, y2: py + ph, stroke: axis, sw: 1, op: 0.45 });
      out.push({ t: 'text', x, y: py + ph + fs * 1.25, text: tickLabels[i], anchor: 'middle', fill: label, size: fs * 0.9, op: 0.75 });
    } else {
      const y = yPos(v);
      if (o.show_grid && v !== yMin) out.push({ t: 'line', x1: px, y1: y, x2: px + pw, y2: y, stroke: axis, sw: 1, op: 0.45 });
      out.push({ t: 'text', x: px - 10, y: y + fs * 0.32, text: tickLabels[i], anchor: 'end', fill: label, size: fs * 0.9, op: 0.75 });
    }
  });
  if (horizontal) out.push({ t: 'line', x1: px, y1: py, x2: px, y2: py + ph, stroke: axis, sw: 2 });
  else out.push({ t: 'line', x1: px, y1: py + ph, x2: px + pw, y2: py + ph, stroke: axis, sw: 2 });

  // Category labels.
  categories.forEach((c, i) => {
    if (horizontal) out.push({ t: 'text', x: px - 12, y: py + (i + 0.5) * (ph / n) + fs * 0.34, text: c, anchor: 'end', fill: label, size: fs });
    else catLines[i].forEach((line, k) => out.push({ t: 'text', x: catX(i), y: py + ph + fs * (1.35 + 1.15 * k), text: line, anchor: 'middle', fill: label, size: fs }));
  });

  // point(si, i) → where that value is drawn (used by annotations).
  const points = series.map(() => []);

  if (wf) {
    const groupW = pw / n; const bw = groupW * 0.62; const off = (groupW - bw) / 2;
    const base = series[0].color || CHART_PALETTE[0];
    wf.slice(0, n).forEach((b, i) => {
      const x = px + i * groupW + off;
      const y0 = yPos(Math.max(b.from, b.to)); const y1 = yPos(Math.max(yMin, Math.min(b.from, b.to)));
      const c = o.point_colors?.[i] || (b.total ? base : (b.to < b.from ? (o.negative_color || base) : (o.positive_color || base)));
      out.push({ t: 'rect', x, y: y0, w: bw, h: Math.max(2, y1 - y0), rx: 2, fill: c, op: b.total || o.point_colors?.[i] ? 1 : 0.72 });
      points[0][i] = [x + bw / 2, y0];
      if (o.show_values !== false) out.push({ t: 'text', x: x + bw / 2, y: y0 - 8, text: b.total ? fmt(b.to) : `${b.to > b.from ? '+' : '-'}${fmt(Math.abs(b.to - b.from))}`, anchor: 'middle', fill: label, size: fs, weight: 700 });
      // Hairline carrying the level to the next bar.
      if (i < n - 1) out.push({ t: 'line', x1: x + bw, y1: yPos(b.to), x2: x + groupW + off, y2: yPos(b.to), stroke: axis, sw: 1.5, dash: '4 4' });
    });
  } else if (type === 'column' || type === 'bar') {
    const groupW = (horizontal ? ph : pw) / n;
    const slots = stacked ? 1 : series.length;
    const bw = (groupW * (stacked ? 0.58 : 0.7)) / slots;
    const off = (groupW - bw * slots) / 2;
    const base = Array(n).fill(0);
    series.forEach((s, si) => (s.values || []).forEach((v, i) => {
      if (v === null || v === undefined || i >= n) return;
      const c = (!stacked && o.point_colors?.[i]) || colorOf(s, si);
      const from = stacked ? base[i] : Math.max(yMin, 0);
      const to = stacked ? base[i] + Math.max(0, v) : v;
      if (stacked) base[i] = to;
      const last = !stacked || si === series.length - 1;
      if (horizontal) {
        const y = py + i * groupW + off + (stacked ? 0 : si * bw);
        const x0 = xPos(Math.max(yMin, Math.min(from, to))); const x1 = xPos(Math.max(from, to));
        out.push({ t: 'rect', x: x0, y, w: Math.max(0, x1 - x0), h: bw, rx: stacked ? 0 : 4, fill: c });
        points[si][i] = [x1, y + bw / 2];
        if (o.show_values && last) out.push({ t: 'text', x: x1 + 8, y: y + bw / 2 + fs * 0.34, text: fmt(stacked ? stackTotals[i] : v), anchor: 'start', fill: label, size: fs, weight: 700 });
        else if (o.show_values && stacked && x1 - x0 > textW(fmt(v), fs * 0.85) + 8) out.push({ t: 'text', x: (x0 + x1) / 2, y: y + bw / 2 + fs * 0.3, text: fmt(v), anchor: 'middle', fill: o.value_color || '#FFFFFF', size: fs * 0.85, weight: 600 });
      } else {
        const x = px + i * groupW + off + (stacked ? 0 : si * bw);
        const y0 = yPos(Math.max(from, to)); const y1 = yPos(Math.max(yMin, Math.min(from, to)));
        out.push({ t: 'rect', x, y: y0, w: bw, h: Math.max(0, y1 - y0), rx: stacked ? 0 : 4, fill: c });
        points[si][i] = [x + bw / 2, y0];
        if (o.show_values && last) out.push({ t: 'text', x: x + bw / 2, y: y0 - 8, text: fmt(stacked ? stackTotals[i] : v), anchor: 'middle', fill: label, size: fs, weight: 700 });
        else if (o.show_values && stacked && y1 - y0 > fs * 1.2) out.push({ t: 'text', x: x + bw / 2, y: (y0 + y1) / 2 + fs * 0.3, text: fmt(v), anchor: 'middle', fill: o.value_color || '#FFFFFF', size: fs * 0.85, weight: 600 });
      }
    }));
  } else {
    series.forEach((s, si) => {
      const pts = (s.values || []).slice(0, n).map((v, i) => (v === null || v === undefined ? null : [catX(i), yPos(v)]));
      pts.forEach((p, i) => { if (p) points[si][i] = p; });
      // Break the path at nulls (segmented series: a red plateau, then a blue climb).
      const runs = []; let run = [];
      for (const p of pts) { if (p) run.push(p); else if (run.length) { runs.push(run); run = []; } }
      if (run.length) runs.push(run);
      const col = colorOf(s, si);
      const lw = o.line_width || 4;
      const called = new Set((o.annotations || []).filter(a => a.kind === 'callout' && (a.series || 0) === si).map(a => a.index));
      for (const r of runs) {
        if ((type === 'area' || s.fill) && r.length > 1) out.push({ t: 'path', d: `M${r[0][0]},${py + ph} L${r.map(p => p.join(',')).join(' L')} L${r[r.length - 1][0]},${py + ph} Z`, fill: col, op: 0.22 });
        out.push({ t: 'path', d: `M${r.map(p => p.join(',')).join(' L')}`, fill: 'none', stroke: col, sw: lw });
      }
      // A dot on every data point when there are few enough to read as points.
      if (n <= 14) pts.forEach(p => { if (p) out.push({ t: 'circle', cx: p[0], cy: p[1], r: lw * 1.25, fill: col }); });
      if (o.show_values) {
        // Few points: label each one. Many: only where each run ends.
        const every = n <= 8;
        pts.forEach((p, i) => {
          if (!p) return;
          const end = i === pts.length - 1 || !pts[i + 1];
          if ((!every && !end) || called.has(i)) return;
          // A value repeated from the previous run (the joint of a segmented line) is labelled once.
          if (out.some(q => q.t === 'text' && q.vl && Math.abs(q.x - p[0]) < 1 && Math.abs(q.y - (p[1] - fs * 0.8)) < 1)) return;
          out.push({ vl: true, t: 'text', x: p[0], y: p[1] - fs * 0.8, text: fmt(s.values[i]), anchor: 'middle', fill: label, size: fs * 0.95, weight: 700 });
        });
      }
    });
  }

  // Annotations: a dashed marker at a category ("TRANSFORMATION LAUNCHED"),
  // or a callout pinned to one data point ("4X VOLUME").
  for (const a of o.annotations || []) {
    const i = a.index;
    if (a.kind === 'line') {
      // A dashed target / benchmark line at a value, across the whole plot.
      const c2 = a.color || label; const sz = fs * 0.95;
      if (horizontal) {
        const x = xPos(a.value);
        out.push({ ann: true, t: 'line', x1: x, y1: py - fs * 0.2, x2: x, y2: py + ph, stroke: c2, sw: 2, dash: '6 6' });
        out.push({ ann: true, t: 'text', x, y: py - fs * 0.45, text: a.text, anchor: 'middle', fill: c2, size: sz, weight: 700 });
      } else {
        const y = yPos(a.value);
        out.push({ ann: true, t: 'line', x1: px, y1: y, x2: px + pw, y2: y, stroke: c2, sw: 2, dash: '6 6' });
        out.push({ ann: true, t: 'text', x: px + pw, y: y - 8, text: a.text, anchor: 'end', fill: c2, size: sz, weight: 700 });
      }
      continue;
    }
    if (!(i >= 0 && i < n) || horizontal) continue;
    const col = a.color || label;
    if (a.kind === 'callout') {
      // The number the slide is about: a bold filled label above its point.
      const size = fs * 1.7; const tw = textW(a.text, size) * 1.02 + 36; const bh = size * 1.7 + (a.sub ? fs * 1.3 : 0);
      const si = Math.min(series.length - 1, Math.max(0, a.series || 0));
      const p = points[si]?.[i] || points.find(ps => ps[i])?.[i];
      if (!p) continue;
      const bx = Math.min(Math.max(p[0] - tw / 2, px), px + pw - tw);
      const above = p[1] - bh - 22 >= -fs; const by = above ? Math.max(-fs, p[1] - bh - 22) : p[1] + 22;
      out.push({ ann: true, t: 'line', x1: p[0], y1: p[1], x2: p[0], y2: above ? by + bh : by, stroke: col, sw: 2 });
      out.push({ ann: true, t: 'circle', cx: p[0], cy: p[1], r: 9, fill: col });
      out.push({ ann: true, t: 'rect', x: bx, y: by, w: tw, h: bh, rx: 8, fill: col });
      out.push({ ann: true, t: 'text', x: bx + tw / 2, y: by + size * 1.2, text: a.text, anchor: 'middle', fill: a.text_color || '#FFFFFF', size, weight: 800 });
      if (a.sub) out.push({ ann: true, t: 'text', x: bx + tw / 2, y: by + size * 1.7 + fs * 0.75, text: a.sub, anchor: 'middle', fill: a.text_color || '#FFFFFF', size: fs * 0.9, weight: 500 });
    } else {
      // The event that changed the curve: a dashed line with a boxed label at its top.
      const size = fs * 1.05; const x = catX(i);
      const tw = Math.max(textW(a.text, size), a.sub ? textW(a.sub, fs * 0.9) : 0) + 28; const bh = size * 1.8 + (a.sub ? fs * 1.25 : 0);
      const bx = Math.min(Math.max(x - tw / 2, px), px + pw - tw); const by = py - fs * 0.4;
      out.push({ ann: true, t: 'line', x1: x, y1: by + bh, x2: x, y2: py + ph, stroke: col, sw: 2.5, dash: '7 7' });
      out.push({ ann: true, t: 'rect', x: bx, y: by, w: tw, h: bh, rx: 6, fill: a.fill || '#FFFFFF', stroke: col, sw: 2 });
      out.push({ ann: true, t: 'text', x: bx + tw / 2, y: by + size * 1.25, text: a.text, anchor: 'middle', fill: col, size, weight: 800 });
      if (a.sub) out.push({ ann: true, t: 'text', x: bx + tw / 2, y: by + size * 1.8 + fs * 0.7, text: a.sub, anchor: 'middle', fill: col, size: fs * 0.9, weight: 400 });
    }
  }
  return out;
}
