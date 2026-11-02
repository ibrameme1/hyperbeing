// Layered-slide benchmark: runs real slide briefs through the full layered
// pipeline (deck design → layout → parallel layer generation → fit → visual
// review → flattened preview) and reports measured timings and image token
// usage per slide.
//
// Usage (from backend/):
//   node scripts/layered-benchmark.js <briefs.json> [outDir]
// briefs.json: { "style": "classic", "slides": [{ "title": "...", "brief": "full art-directed prompt" }, ...] }
//
// Needs ANTHROPIC_API_KEY (layouts) and OPENAI_API_KEY (images). With either
// missing/"demo", that half runs in mock mode and its timings are not real.
// Writes <outDir>/slide_N.png (flattened preview), slide_N.layout.json and
// summary.json. Images are stored in IMAGE_STORAGE_DIR (defaults to outDir/img).
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const [, , briefsPath, outArg] = process.argv;
if (!briefsPath) {
  console.error('usage: node scripts/layered-benchmark.js <briefs.json> [outDir]');
  process.exit(1);
}
const outDir = path.resolve(outArg || `bench-${Date.now()}`);
fs.mkdirSync(outDir, { recursive: true });
process.env.IMAGE_STORAGE_DIR = process.env.IMAGE_STORAGE_DIR || path.join(outDir, 'img');

const { buildLayeredSlide, loadStoredFile } = await import('../services/layeredSlide.js');
const { designDeckSystem } = await import('../services/layoutAgent.js');
const { IMAGE_MOCK_MODE, LAYER_IMAGE_MODEL, LAYER_IMAGE_QUALITY } = await import('../services/openaiImages.js');

const spec = JSON.parse(fs.readFileSync(briefsPath, 'utf8'));
// Optional brief attachments, like the Dashboard's uploads:
// "uploads": [{ "path": "logo.png", "category": "branding" }]
const uploads = (spec.uploads || []).map(u => ({
  type: 'image', category: u.category || 'branding', name: path.basename(u.path), mimeType: 'image/png',
  data: `data:image/png;base64,${fs.readFileSync(path.resolve(path.dirname(briefsPath), u.path)).toString('base64')}`,
}));
const style = spec.style || 'classic';
const slides = spec.slides.map((s, i) => ({ index: i, type: s.type || 'content', title: s.title, key_points: [], brief: s.brief }));
const claudeMock = !process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'demo';

console.log(`layered benchmark: ${slides.length} slide(s), style=${style}, images=${IMAGE_MOCK_MODE ? 'MOCK' : `${LAYER_IMAGE_MODEL} (${LAYER_IMAGE_QUALITY})`}, claude=${claudeMock ? 'MOCK' : 'real'}`);

const t0 = Date.now();
const header = { presentation_title: spec.title || 'Benchmark deck' };
const deckBrief = slides.map(s => `SLIDE ${s.index}: ${s.brief}`).join('\n\n');
const tDeck = Date.now();
const deckDesign = await designDeckSystem({ header, slides, brief: deckBrief, style, uploads });
const deckMs = Date.now() - tDeck;
console.log(`deck design: ${deckMs} ms — fonts ${JSON.stringify(deckDesign.fonts)}`);

const results = await Promise.all(slides.map(async (slide) => {
  const r = await buildLayeredSlide({
    presentationId: 'benchmark', slide, header, deckDesign, brief: slide.brief, style, uploads,
    siblingTitles: slides.map(s => s.title),
  });
  if (!r) return { index: slide.index, title: slide.title, ok: false };
  const preview = await loadStoredFile(r.image_file);
  fs.writeFileSync(path.join(outDir, `slide_${slide.index}.png`), preview);
  fs.writeFileSync(path.join(outDir, `slide_${slide.index}.layout.json`), JSON.stringify(r.layout, null, 2));
  const usage = r.gen_stats.images.reduce((acc, im) => {
    if (!im.usage) return acc;
    acc.input_tokens += im.usage.input_tokens || 0;
    acc.output_tokens += im.usage.output_tokens || 0;
    return acc;
  }, { input_tokens: 0, output_tokens: 0 });
  return {
    index: slide.index, title: slide.title, ok: true,
    composition: r.layout.composition,
    layers: r.layout.layers.length,
    native_text: r.layout.layers.filter(l => l.kind === 'text').length,
    generations: r.gen_stats.images.length,
    dropped: (r.layout.dropped || []).map(d => d.id),
    warnings: r.layout.warnings || [],
    review: r.layout.review || null,
    layout_ms: r.gen_stats.layout_ms,
    slowest_image_ms: Math.max(0, ...r.gen_stats.images.map(i => i.ms || 0)),
    review_ms: r.gen_stats.review_ms,
    total_ms: r.gen_stats.total_ms,
    image_usage: usage,
    images: r.gen_stats.images,
  };
}));

const summary = {
  when: new Date().toISOString(),
  style, image_model: IMAGE_MOCK_MODE ? 'mock' : LAYER_IMAGE_MODEL, image_quality: LAYER_IMAGE_QUALITY,
  claude: claudeMock ? 'mock' : 'claude-sonnet-4-6',
  deck_design_ms: deckMs, wall_ms: Date.now() - t0, slides: results,
};
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

for (const r of results) {
  if (!r.ok) { console.log(`#${r.index} FAILED  ${r.title}`); continue; }
  console.log(`#${r.index} ${r.composition.padEnd(7)} total ${(r.total_ms / 1000).toFixed(1)}s (layout ${(r.layout_ms / 1000).toFixed(1)}s, slowest image ${(r.slowest_image_ms / 1000).toFixed(1)}s, review ${(r.review_ms / 1000).toFixed(1)}s) · ${r.generations} generations · ${r.layers} layers (${r.native_text} text) · image tokens in/out ${r.image_usage.input_tokens}/${r.image_usage.output_tokens}${r.dropped.length ? ` · dropped ${r.dropped.join(',')}` : ''}`);
}
console.log(`wall clock (deck design + all slides in parallel): ${(summary.wall_ms / 1000).toFixed(1)}s → ${outDir}`);
process.exit(0);
