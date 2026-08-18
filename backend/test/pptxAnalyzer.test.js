import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import sharp from 'sharp';
import JSZip from 'jszip';

// The measurement step normally needs a live vision call. Stubbing the SDK
// exercises everything around it — prompt assembly, JSON extraction, the
// normalizer, the cache, and the build — against a response shaped like the one
// the model returns.
const messagesCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { constructor() { this.messages = { create: messagesCreate }; } },
}));

const tmp = mkdtempSync(path.join(tmpdir(), 'hb-pptx-an-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.IMAGE_STORAGE_DIR = path.join(tmp, 'images');
process.env.EXPORT_STORAGE_DIR = path.join(tmp, 'exports');
process.env.ANTHROPIC_API_KEY = 'sk-test-not-a-real-key'; // anything but unset/"demo"

const { initDatabase, getDb } = await import('../database.js');
const { analyzeSlide, analyzerAvailable } = await import('../services/pptx/analyzer.js');
const pptxService = await import('../services/pptx/index.js');
const imageStore = await import('../services/imageStore.js');

const W = 1536, H = 864;

const MEASUREMENT = {
  title: 'MARKET SHARE 2026',
  background_color: '#0B1B33',
  elements: [
    { kind: 'text', x: 110, y: 60, w: 1200, h: 90, text: 'MARKET SHARE 2026', size: 72, bold: true, color: '#FFFFFF' },
    { kind: 'rect', x: 80, y: 520, w: 420, h: 180, fill: '#F52D6E', radius: 18 },
    { kind: 'chart', chart: 'doughnut', x: 980, y: 300, w: 440, h: 440, labels: ['Us', 'Them'], values: [38, 62], colors: ['#F52D6E', '#FFFFFF'] },
  ],
  notes: 'Us 38, Them 62',
};

function reply(body, { stop = 'end_turn' } = {}) {
  return {
    content: [{ type: 'text', text: body }],
    usage: { input_tokens: 1200, output_tokens: 400 },
    stop_reason: stop,
  };
}

async function slidePng() {
  return sharp({ create: { width: W, height: H, channels: 3, background: { r: 11, g: 27, b: 51 } } })
    .png().toBuffer();
}

beforeAll(() => { initDatabase(); });

describe('slide analyzer', () => {
  it('is live when a key is configured', () => {
    expect(analyzerAvailable).toBe(true);
  });

  it('sends the image and parses a measurement, fenced or not', async () => {
    messagesCreate.mockResolvedValueOnce(reply('```json\n' + JSON.stringify(MEASUREMENT) + '\n```'));
    const spec = await analyzeSlide(await slidePng(), { width: W, height: H, format: 'png' }, { userId: null });

    const call = messagesCreate.mock.calls.at(-1)[0];
    expect(call.model).toBe('claude-sonnet-4-6');
    expect(call.messages[0].content[0].type).toBe('image');
    expect(call.messages[0].content[1].text).toContain('1536 x 864');

    expect(spec.elements).toHaveLength(3);
    expect(spec.elements[0].color).toBe('FFFFFF'); // '#' stripped before it reaches the file
    expect(spec.background_color).toBe('0B1B33');
  });

  it('recovers a measurement wrapped in prose, and gives up cleanly on gibberish', async () => {
    messagesCreate.mockResolvedValueOnce(reply(`Here is the slide:\n${JSON.stringify(MEASUREMENT)}\nHope that helps.`));
    expect((await analyzeSlide(await slidePng(), { width: W, height: H, format: 'png' })).elements).toHaveLength(3);

    messagesCreate.mockResolvedValueOnce(reply('I am afraid I cannot measure this slide.'));
    expect(await analyzeSlide(await slidePng(), { width: W, height: H, format: 'png' })).toBeNull();
  });

  it('returns null instead of throwing when the API call fails', async () => {
    messagesCreate.mockRejectedValueOnce(new Error('529 overloaded'));
    expect(await analyzeSlide(await slidePng(), { width: W, height: H, format: 'png' })).toBeNull();
  });

  it('strips em dashes from transcribed slide copy like every other Claude output', async () => {
    messagesCreate.mockResolvedValueOnce(reply(JSON.stringify({
      elements: [{ kind: 'text', x: 10, y: 10, w: 900, h: 60, text: 'Growth — and margin', size: 40 }],
    })));
    const spec = await analyzeSlide(await slidePng(), { width: W, height: H, format: 'png' });
    expect(spec.elements[0].text).toBe('Growth - and margin');
  });
});

describe('measured build, end to end', () => {
  const presentationId = 'pres-analyzed';
  let imageFile;

  beforeAll(async () => {
    const db = getDb();
    db.prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)').run('u-an', 'T', 'an@test.dev');
    imageFile = imageStore.saveDataUrl(`data:image/png;base64,${(await slidePng()).toString('base64')}`);
    db.prepare('INSERT INTO presentations (id, user_id, title, slides_data, status) VALUES (?, ?, ?, ?, ?)').run(
      presentationId, 'u-an', 'Analyzed Deck',
      JSON.stringify([{ index: 0, title: 'One', status: 'complete', image_file: imageFile }]),
      'completed'
    );
  });

  it('measures, cleans the plate, and writes a deck with live text and a real chart', async () => {
    messagesCreate.mockResolvedValueOnce(reply(JSON.stringify(MEASUREMENT)));
    await pptxService.scheduleDeckBuild(presentationId, { userId: 'u-an' });

    const status = pptxService.getDeckStatus(presentationId);
    expect(status.status).toBe('ready');
    expect(status.editable_slides).toBe(1);

    const result = await pptxService.getDeckForDownload(presentationId, { userId: 'u-an' });
    const zip = await JSZip.loadAsync(await import('fs').then(m => m.readFileSync(result.path)));
    const slide = await zip.file('ppt/slides/slide1.xml').async('string');
    expect(slide).toContain('MARKET SHARE 2026');
    expect(await zip.file('ppt/charts/chart1.xml').async('string')).toContain('<c:v>38</c:v>');
  });

  it('reuses the cached measurement instead of paying for the slide twice', async () => {
    const before = messagesCreate.mock.calls.length;
    await pptxService.scheduleDeckBuild(presentationId, { userId: 'u-an', force: true });
    expect(messagesCreate.mock.calls.length).toBe(before);
  });

  it('re-measures only the slide whose image changed', async () => {
    const db = getDb();
    const newFile = imageStore.saveDataUrl(`data:image/png;base64,${(await slidePng()).toString('base64')}`);
    db.prepare('UPDATE presentations SET slides_data = ? WHERE id = ?').run(
      JSON.stringify([
        { index: 0, title: 'One', status: 'complete', image_file: imageFile },
        { index: 1, title: 'Two', status: 'complete', image_file: newFile },
      ]),
      presentationId
    );
    expect(pptxService.getDeckStatus(presentationId).status).toBe('none'); // stale: slides moved on

    const before = messagesCreate.mock.calls.length;
    messagesCreate.mockResolvedValueOnce(reply(JSON.stringify(MEASUREMENT)));
    await pptxService.scheduleDeckBuild(presentationId, { userId: 'u-an' });

    expect(messagesCreate.mock.calls.length).toBe(before + 1); // one new slide, one call
    expect(pptxService.getDeckStatus(presentationId).editable_slides).toBe(2);
  });
});
