import { describe, it, expect } from 'vitest';
import { normalizeLayout, layoutFiles } from '../services/slideLayout.js';
import { applyLayoutEdit } from '../services/layoutEdit.js';

function base() {
  const l = normalizeLayout({
    fonts: { display: 'Inter', body: 'Inter' },
    background: { type: 'color', color: '#101010' },
    layers: [
      { kind: 'image', id: 'hero', role: 'hero', prompt: 'a phone', x: 100, y: 100, w: 400, h: 400 },
      { kind: 'text', id: 'title', role: 'headline', text: 'Hello', size: 80, color: '#FFFFFF', x: 600, y: 100, w: 800, h: 120 },
      { kind: 'shape', id: 'card', shape: 'rect', fill: '#222222', x: 600, y: 300, w: 500, h: 200 },
      { kind: 'chart', id: 'chart', chart_type: 'column', categories: ['A', 'B'], series: [{ name: 'S', values: [1, 2] }], x: 600, y: 600, w: 600, h: 300 },
    ],
  });
  l.layers[0].file = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png';
  l.layers[0].src = '/api/presentations/p/assets/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png';
  return l;
}

describe('applyLayoutEdit', () => {
  it('applies geometry, text and style edits to known layers', () => {
    const cur = base();
    const ed = JSON.parse(JSON.stringify(cur));
    ed.layers[1].text = 'Hello world'; ed.layers[1].size = 64; ed.layers[1].color = '#FF0000';
    ed.layers[0].x = 150; ed.layers[2].fill = '#333333';
    ed.layers[3].series[0].values = [5, 7];
    const out = applyLayoutEdit(cur, ed);
    expect(out.layers.find(l => l.id === 'title')).toMatchObject({ text: 'Hello world', size: 64, color: '#FF0000' });
    expect(out.layers.find(l => l.id === 'hero').x).toBe(150);
    expect(out.layers.find(l => l.id === 'card').fill).toBe('#333333');
    expect(out.layers.find(l => l.id === 'chart').series[0].values).toEqual([5, 7]);
  });

  it('never accepts client file references or prompt changes', () => {
    const cur = base();
    const ed = JSON.parse(JSON.stringify(cur));
    ed.layers[0].file = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png';
    ed.layers[0].prompt = 'something else';
    ed.layers.push({ kind: 'image', id: 'evil', file: 'cccccccccccccccccccccccccccccccc.png', x: 0, y: 0, w: 10, h: 10 });
    const out = applyLayoutEdit(cur, ed);
    expect(out.layers.find(l => l.id === 'hero').file).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png');
    expect(out.layers.find(l => l.id === 'hero').prompt).toBe('a phone');
    expect(out.layers.some(l => l.id === 'evil')).toBe(false);
    expect(layoutFiles(out)).toEqual(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png']);
  });

  it('sanitizes bad values (colors, fonts, sizes)', () => {
    const cur = base();
    const ed = JSON.parse(JSON.stringify(cur));
    ed.layers[1].color = 'url(javascript:1)'; ed.layers[1].font = 'Comic Sans'; ed.layers[1].size = 99999;
    const t = applyLayoutEdit(cur, ed).layers.find(l => l.id === 'title');
    expect(t.color).not.toContain('javascript');
    expect(t.font).not.toBe('Comic Sans');
    expect(t.size).toBeLessThan(1000);
  });

  it('reorders, duplicates (copy_of) and adds plain text', () => {
    const cur = base();
    const ed = JSON.parse(JSON.stringify(cur));
    ed.layers.reverse();
    ed.layers.push({ copy_of: 'hero', id: 'hero_copy', kind: 'image', x: 900, y: 100, w: 200, h: 200 });
    ed.layers.push({ kind: 'text', id: 'new_text', text: 'Added', size: 40, x: 10, y: 10, w: 300, h: 60 });
    const out = applyLayoutEdit(cur, ed);
    expect(out.layers.map(l => l.id)).toEqual(['chart', 'card', 'title', 'hero', 'hero_copy', 'new_text']);
    expect(out.layers.find(l => l.id === 'hero_copy')).toMatchObject({ file: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png', x: 900 });
  });

  it('moves deleted layers to trash and restores them on undo', () => {
    const cur = base();
    const ed = JSON.parse(JSON.stringify(cur));
    ed.layers = ed.layers.filter(l => l.id !== 'hero');
    const out = applyLayoutEdit(cur, ed);
    expect(out.layers.some(l => l.id === 'hero')).toBe(false);
    expect(out.trash.map(l => l.id)).toEqual(['hero']);
    expect(layoutFiles(out)).toContain('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'); // still referenced → not swept
    const undo = JSON.parse(JSON.stringify(cur));
    const back = applyLayoutEdit(out, undo);
    expect(back.layers.find(l => l.id === 'hero').file).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png');
    expect(back.trash).toBeUndefined();
  });
});

import { applyEditOps } from '../services/layoutEdit.js';
describe('applyEditOps (AI edits)', () => {
  it('updates natively, regenerates only the named image, and keeps the rest', () => {
    const cur = base();
    const { layout, regenerated, applied } = applyEditOps(cur, [
      { op: 'update', id: 'title', set: { text: 'New title', color: '#00FF00' } },
      { op: 'regenerate', id: 'hero', prompt: 'a laptop instead' },
      { op: 'update', id: 'ghost', set: { text: 'x' } }, // unknown id: ignored
    ]);
    expect(applied).toEqual(['update title', 'regenerate hero']);
    expect(regenerated).toEqual(['hero']);
    const hero = layout.layers.find(l => l.id === 'hero');
    expect(hero.file).toBeUndefined();
    expect(hero.prompt).toBe('a laptop instead');
    expect(layout.trash[0].file).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'); // old image restorable
    expect(layout.layers.find(l => l.id === 'title')).toMatchObject({ text: 'New title', color: '#00FF00' });
    expect(cur.layers[0].file).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png'); // input untouched
  });

  it('adds layers with unique ids, removes, reorders and changes the background', () => {
    const cur = base();
    const { layout, regenerated } = applyEditOps(cur, [
      { op: 'add', layer: { kind: 'text', id: 'title', text: 'Sub', size: 30, x: 10, y: 10, w: 200, h: 40 } },
      { op: 'add', layer: { kind: 'image', id: 'rocket', role: 'element', prompt: 'a rocket', x: 1400, y: 100, w: 300, h: 300 } },
      { op: 'remove', id: 'card' },
      { op: 'reorder', id: 'chart', to: 'back' },
      { op: 'background', color: '#123456' },
    ]);
    const ids = layout.layers.map(l => l.id);
    expect(ids[0]).toBe('chart');
    expect(ids).toContain('title_2');
    expect(ids).not.toContain('card');
    expect(regenerated).toEqual(['rocket']);
    expect(layout.background).toEqual({ type: 'color', color: '#123456' });
  });

  it('caps regenerations and rejects unknown upload refs', () => {
    const cur = base();
    const ops = [{ op: 'regenerate', id: 'hero', prompt: 'p', refs: ['upload:5', 'upload:0'] }];
    for (let i = 0; i < 6; i++) ops.push({ op: 'add', layer: { kind: 'image', id: `e${i}`, role: 'element', prompt: 'x', x: 0, y: 0, w: 100, h: 100 } });
    const { layout, regenerated } = applyEditOps(cur, ops, { uploadCount: 1 });
    expect(regenerated.length).toBeLessThanOrEqual(4);
    expect(layout.layers.find(l => l.id === 'hero').refs).toEqual(['upload:0']);
  });
});
