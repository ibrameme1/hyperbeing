import { describe, it, expect } from 'vitest';
import { anchorToObjects } from '../services/layeredSlide.js';
import { normalizeLayout } from '../services/slideLayout.js';

// Text placed ON a generated object follows the object to where it was drawn.
describe('anchorToObjects', () => {
  const build = () => normalizeLayout({
    background: { type: 'color', color: '#fff' },
    layers: [
      { kind: 'image', id: 'stone', prompt: 'a tombstone', x: 600, y: 400, w: 200, h: 300 },
      { kind: 'text', id: 'rip', text: 'RIP', size: 40, align: 'center', x: 620, y: 450, w: 160, h: 50 },
      { kind: 'text', id: 'caption', text: 'EMAIL', size: 20, align: 'center', x: 600, y: 760, w: 200, h: 30 },
      { kind: 'text', id: 'headline', role: 'headline', text: 'Title', size: 80, x: 60, y: 60, w: 900, h: 100 },
    ],
  });

  it('moves and scales lettering that sits on the object', () => {
    const L = build();
    const stone = L.layers.find(l => l.id === 'stone');
    const from = { x: stone.x, y: stone.y, w: stone.w, h: stone.h };
    Object.assign(stone, { x: 700, y: 480, w: 100, h: 150 }); // drawn smaller, elsewhere
    const moved = anchorToObjects(L, [{ layer: stone, from }]);
    expect(moved).toEqual(['rip']);
    const rip = L.layers.find(l => l.id === 'rip');
    expect(rip.size).toBe(20);
    expect(rip.x + rip.w / 2).toBeCloseTo(750, 0);                 // still centred on the stone
    expect(rip.y + rip.h / 2).toBeCloseTo(480 + (75 / 300) * 150, 0); // same relative height
    expect(L.layers.find(l => l.id === 'caption').y).toBe(760);     // a caption below it stays put
  });

  it('leaves everything alone when the object landed where it was asked', () => {
    const L = build();
    const stone = L.layers.find(l => l.id === 'stone');
    expect(anchorToObjects(L, [{ layer: stone, from: { x: stone.x, y: stone.y, w: stone.w, h: stone.h } }])).toEqual([]);
  });

  it('never re-anchors to a slide-sized object or text drawn beneath it', () => {
    const L = normalizeLayout({ background: { type: 'color' }, layers: [
      { kind: 'text', id: 'under', text: 'Under', size: 30, x: 100, y: 100, w: 200, h: 40 },
      { kind: 'image', id: 'big', prompt: 'a hero', x: 0, y: 0, w: 1600, h: 900 },
      { kind: 'text', id: 'over', text: 'Over', size: 30, x: 500, y: 500, w: 200, h: 40 },
    ] });
    const big = L.layers.find(l => l.id === 'big');
    const from = { x: big.x, y: big.y, w: big.w, h: big.h };
    Object.assign(big, { x: 100, y: 100, w: 800, h: 450 });
    expect(anchorToObjects(L, [{ layer: big, from }])).toEqual([]);
  });
});
