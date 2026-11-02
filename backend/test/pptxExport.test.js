import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildPptx, pptxColor } from '../services/pptxExport.js';
import { normalizeLayout } from '../services/slideLayout.js';

describe('pptxColor', () => {
  it('maps hex, short hex, alpha hex and rgba to hex + transparency', () => {
    expect(pptxColor('#ff2e74')).toEqual({ hex: 'FF2E74', transparency: 0 });
    expect(pptxColor('#fff')).toEqual({ hex: 'FFFFFF', transparency: 0 });
    expect(pptxColor('rgba(255,255,255,0.08)')).toEqual({ hex: 'FFFFFF', transparency: 92 });
    expect(pptxColor('#00000080').transparency).toBe(50);
  });
});

describe('buildPptx', () => {
  it('exports a layered slide as native text, shapes, a real chart and notes', async () => {
    const layout = normalizeLayout({
      background: { type: 'gradient', gradient: { angle: 135, stops: [{ color: '#0A0E1A', pos: 0 }, { color: '#1B4F9C', pos: 100 }] } },
      layers: [
        { kind: 'shape', id: 'card', shape: 'rect', radius: 24, fill: 'rgba(255,255,255,0.08)', border: { color: '#ffffff', width: 1.5 }, x: 60, y: 300, w: 800, h: 140 },
        { kind: 'text', id: 'headline', role: 'headline', text: 'Games are the\nfrequency engine.', runs: [{ text: 'frequency engine.', color: '#FF2E74' }], font: 'Lato', size: 96, weight: 800, x: 60, y: 60, w: 900, h: 220 },
        { kind: 'chart', id: 'growth', chart_type: 'line', categories: ['2000', '2001', '2002', '2003'], series: [{ name: 'Plateau', values: [100, 108, 115, null], color: '#e53935' }, { name: 'Growth', values: [null, null, 115, 400], color: '#1e88e5' }], x: 1000, y: 200, w: 800, h: 500 },
        { kind: 'icon', id: 'ic', source: 'lucide', name: 'wallet', color: '#FF8A1F', x: 80, y: 330, w: 48, h: 48 },
      ],
    });
    const slides = [{ index: 0, status: 'complete', speaker_note: 'Say this.', layout }, { index: 1, status: 'locked' }];
    const { buffer, slides: n } = await buildPptx({ id: 't', title: 'Test deck', aspect_ratio: '16:9', slides_data: JSON.stringify(slides) });
    expect(n).toBe(1); // locked slides are not exported
    const zip = await JSZip.loadAsync(buffer);
    const slideXml = await zip.file('ppt/slides/slide1.xml').async('string');
    expect(slideXml).toContain('frequency engine.');
    expect(slideXml).toContain('FF2E74');                 // coloured run kept
    expect(slideXml).toContain('typeface="Lato"');
    expect(slideXml).toContain('roundRect');              // card is a native rounded shape
    expect(Object.keys(zip.files).some(f => /^ppt\/charts\/chart\d+\.xml$/.test(f))).toBe(true); // real chart
    expect(Object.keys(zip.files).some(f => f.startsWith('ppt/notesSlides/'))).toBe(true);
  });
});
