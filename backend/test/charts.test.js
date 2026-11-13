import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chartGeometry, niceTicks, formatNumber } from '../services/chartGeometry.js';
import { normalizeLayout } from '../services/slideLayout.js';
import { renderLayoutPreview } from '../services/layoutPreview.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const chart = (extra = {}, options = {}) => normalizeLayout({
  fonts: { text: '#111827' }, background: { type: 'color', color: '#FFFFFF' },
  layers: [{ kind: 'chart', id: 'c', chart_type: 'line', categories: ['2000', '2001', '2002', '2003'], series: [{ name: 'A', values: [100, 110, 115, 400] }], options, x: 100, y: 100, w: 1000, h: 500, ...extra }],
}).layers[0];

describe('chart geometry', () => {
  it('is the same file on the server and in the web app', () => {
    const web = fs.readFileSync(path.join(here, '../../frontend/src/components/layered/chartGeometry.js'), 'utf8');
    expect(web).toBe(fs.readFileSync(path.join(here, '../services/chartGeometry.js'), 'utf8'));
  });
  it('picks round axis ticks and formats thousands', () => {
    expect(niceTicks(0, 420)).toEqual([0, 100, 200, 300, 400]);
    expect(niceTicks(0, 12000).at(-1)).toBe(12000);
    expect(formatNumber(12000)).toBe('12,000');
    expect(formatNumber(4.5)).toBe('4.5');
  });
  it('defaults chart colours to the deck text colour (readable on a light deck)', () => {
    const c = chart();
    expect(c.options.label_color).toBe('#111827');
    expect(c.options.axis_color).toBe('rgba(17,24,39,0.4)');
  });
  it('draws a value axis, gridlines and a legend when asked', () => {
    const c = chart({ series: [{ name: 'Paid', values: [1, 2, 3, 4] }, { name: 'Free', values: [4, 3, 2, 1] }] }, { show_grid: true, show_legend: true });
    const g = chartGeometry(c);
    expect(g.filter(p => p.t === 'text').map(p => p.text)).toEqual(expect.arrayContaining(['Paid', 'Free', '2000', '2003', '0']));
    expect(g.filter(p => p.t === 'line' && p.op).length).toBeGreaterThan(1); // gridlines
  });
  it('pins a marker to its category and a callout to its data point', () => {
    const c = chart({}, { y_min: 0, y_max: 420, annotations: [{ kind: 'marker', category: '2002', text: 'RELAUNCH' }, { kind: 'callout', category: '2003', text: '4X VOLUME', color: '#1E5BFF' }, { kind: 'marker', category: 'nope', text: 'dropped' }] });
    expect(c.options.annotations).toHaveLength(2);
    const g = chartGeometry(c);
    const line = g.find(p => p.ann && p.t === 'line');
    const path0 = g.find(p => p.t === 'path' && p.stroke);
    const xs = path0.d.slice(1).split(' L').map(s => Number(s.split(',')[0]));
    expect(line.x1).toBeCloseTo(xs[2], 3); // the 2002 point
    const dot = g.find(p => p.ann && p.t === 'circle');
    expect(dot.cx).toBeCloseTo(xs[3], 3);
    expect(g.some(p => p.ann && p.text === '4X VOLUME')).toBe(true);
  });
  it('stacks columns and labels horizontal bars', () => {
    const stackedCols = chartGeometry(chart({ chart_type: 'column', series: [{ name: 'A', values: [1, 2, 3, 4] }, { name: 'B', values: [1, 1, 1, 1] }] }, { stacked: true, show_values: true }));
    const rects = stackedCols.filter(p => p.t === 'rect');
    expect(rects[0].x).toBeCloseTo(rects[4].x, 3);        // B sits on A, same column
    expect(rects[4].y + rects[4].h).toBeCloseTo(rects[0].y, 3);
    expect(stackedCols.some(p => p.t === 'text' && p.text === '5')).toBe(true); // stack total
    const bars = chartGeometry(chart({ chart_type: 'bar', categories: ['Branch network', 'Digital', 'Procurement', 'Other'] }, { show_values: true }));
    expect(bars.some(p => p.t === 'text' && p.text === 'Branch network' && p.anchor === 'end')).toBe(true);
  });
  it('renders in the server preview', async () => {
    const layout = normalizeLayout({ fonts: { text: '#111827' }, background: { type: 'color', color: '#FFFFFF' }, layers: [
      { kind: 'chart', id: 'c', chart_type: 'donut', categories: ['A', 'B'], series: [{ name: 's', values: [3, 1] }], options: { show_legend: true, show_values: true }, x: 100, y: 100, w: 700, h: 500 },
    ] });
    const png = await renderLayoutPreview(layout, async () => null, { width: 640 });
    expect(png.length).toBeGreaterThan(2000);
  });
});
