import fs from 'fs';
import sharp from 'sharp';
import * as imageStore from './imageStore.js';
import { logger } from './logger.js';
import { designSlideLayout, reviewSlideLayout } from './layoutAgent.js';
import { normalizeLayout, fitLayout, layoutFiles, canvasFor, MAX_GENERATIONS_PER_SLIDE } from './slideLayout.js';
import { generateLayerImage, scheduleImageJob, sizeForAspect, IMAGE_MOCK_MODE } from './openaiImages.js';
import {
  coverToAspect, ensureTransparent, unscreen, trimTransparent, extractScreen,
  sliceSheet, containRect, normalizeReference,
} from './layerImaging.js';
import { renderLayoutPreview } from './layoutPreview.js';
import { fetchBrandLogo } from './brandAssets.js';

// ─── Build one layered slide ────────────────────────────────────────────────
// The layered replacement for "one prompt → one image". Pipeline per slide:
//   1. Claude designs the layout (designSlideLayout) → normalizeLayout → fit.
//      onLayout fires immediately so native text/cards can appear in the UI
//      while images are still generating.
//   2. References are resolved: user uploads, fetched brand logos.
//   3. Every image layer (background, elements, effects, one icon sheet) is
//      generated IN PARALLEL through the global priority limiter; each one is
//      post-processed (crop / transparency safety net / unscreen / screen
//      detection / trim / slice), stored on disk, fitted into its box, and
//      announced via onLayer.
//   4. Failure policy: background or hero failure fails the whole slide (the
//      caller refunds); a minor element failure drops just that element
//      (recorded in layout.dropped so it can be retried).
//   5. Text-fit checks, then a visual self-review: Claude looks at the
//      rendered preview and returns surgical fixes.
//   6. The flattened preview is stored as the slide's image (thumbnail, PDF,
//      version history, legacy viewers).
// Returns { layout, image_data, image_file, gen_stats } or null on failure.

export function assetUrl(presentationId, file) {
  return `/api/presentations/${presentationId}/assets/${file}`;
}

const ELEMENT_SUFFIX = 'Isolated on a transparent background, nothing else in frame: no background, no surface, no floor, no shadow, no reflection, no text, no letters, no watermark, no frame or border. The whole subject is fully visible with a small empty margin around it, never cropped.';
const EFFECT_SUFFIX = 'Rendered purely as light on a completely black (#000000) background. Nothing else in frame: no objects, no surface, no text. Smooth, soft, luminous falloff.';
const SCREEN_SUFFIX = 'The device faces the camera perfectly straight-on and flat: no tilt, no perspective, no rotation. Its entire screen is one flat, uniform, pure chroma-green (#00FF00) rectangle with no UI, no reflections and no glare.';
const SCREEN_IMAGE_SUFFIX = 'Flat, full-frame screen content exactly as it would appear on the display itself (like a screenshot or a video frame): no phone, no device, no bezel, no hands holding a phone, no frame, no border, no UI chrome unless described.';
const BG_SUFFIX = 'No overlaid text, no captions, no letters or numbers, no logos, no watermarks, no UI, no cards, no panels, no buttons, no frames, no borders. Leave the described negative space genuinely clean.';

function composePrompt(deckDesign, layout, body, suffix) {
  return [deckDesign?.style_block, layout.style_block, body, suffix].filter(s => s && String(s).trim()).join('\n\n');
}

async function storeBuffer(buffer) {
  const file = imageStore.saveDataUrl(`data:image/png;base64,${buffer.toString('base64')}`);
  if (!file) throw new Error('image store write failed');
  return file;
}

export async function loadStoredFile(file) {
  const p = imageStore.pathFor(file);
  if (!p) return null;
  try { return await fs.promises.readFile(p); } catch { return null; }
}

// Screen children are authored in normalized screen coordinates. Until the
// real screen rect is detected we place them in a sensible inset of the
// device box, so the very first broadcast already looks right-ish.
function provisionalScreenRect(device) {
  return { x: device.x + device.w * 0.1, y: device.y + device.h * 0.08, w: device.w * 0.8, h: device.h * 0.84 };
}

function placeScreenChildren(layout, device, rect) {
  for (const l of layout.layers) {
    if (l.screen_of !== device.id && l.in_screen !== device.id) continue;
    if (l.in_screen) {
      // First placement: remember the normalized coords.
      l.screen_norm = { x: clamp01(l.x), y: clamp01(l.y), w: clamp01(l.w, 1), h: clamp01(l.h, 1) };
      l.screen_of = l.in_screen;
      delete l.in_screen;
    }
    const n = l.screen_norm;
    l.x = Math.round(rect.x + n.x * rect.w);
    l.y = Math.round(rect.y + n.y * rect.h);
    l.w = Math.max(4, Math.round(n.w * rect.w));
    l.h = Math.max(4, Math.round(n.h * rect.h));
  }
}

function clamp01(v, dflt = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  // Claude sometimes gives screen children in canvas px despite instructions;
  // values > 1.5 can't be normalized coords — treat as unknown.
  if (n > 1.5) return dflt;
  return Math.min(1, Math.max(0, n));
}

function applyReviewFixes(layout, fixes = []) {
  let applied = 0;
  for (const f of Array.isArray(fixes) ? fixes.slice(0, 40) : []) {
    const idx = layout.layers.findIndex(l => l.id === f?.id);
    if (idx === -1) continue;
    const l = layout.layers[idx];
    if (f.remove) {
      // Never delete user-facing content: only decorative non-text layers.
      if (l.kind === 'text' || l.kind === 'chart' || l.kind === 'logo') continue;
      layout.layers.splice(idx, 1);
      applied++;
      continue;
    }
    for (const k of ['x', 'y', 'w', 'h']) {
      if (Number.isFinite(f[k])) l[k] = Math.round(Math.max(k === 'w' || k === 'h' ? 4 : -layout.canvas.w, Math.min(layout.canvas.w * 2, f[k])));
    }
    if (Number.isFinite(f.size) && l.kind === 'text') l.size = Math.max(8, Math.min(400, f.size));
    if (Number.isFinite(f.opacity)) l.opacity = Math.max(0, Math.min(1, f.opacity));
    if (typeof f.color === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i.test(f.color.trim())) {
      if (l.kind === 'text') l.color = f.color.trim();
      else if (l.kind === 'shape') l.fill = f.color.trim();
    }
    if (l.kind === 'text' && ['left', 'center', 'right'].includes(f.align)) l.align = f.align;
    if (f.move_to) {
      layout.layers.splice(layout.layers.indexOf(l), 1);
      const cur = Math.min(idx, layout.layers.length);
      const to = f.move_to === 'front' ? layout.layers.length
        : f.move_to === 'back' ? 0
          : f.move_to === 'forward' ? Math.min(layout.layers.length, cur + 1)
            : Math.max(0, cur - 1);
      layout.layers.splice(to, 0, l);
    }
    applied++;
  }
  return applied;
}

export async function buildLayeredSlide({
  presentationId, slide, header, deckDesign, brief, uploads = [], userId = null,
  aspectRatio = '16:9', style = 'classic', siblingTitles = [], instruction = null,
  onLayout = () => {}, onLayer = () => {}, review = true,
}) {
  const t0 = Date.now();
  const stats = { layout_ms: 0, first_image_start_ms: null, images: [], review_ms: 0, total_ms: 0, mock: IMAGE_MOCK_MODE };
  const created = []; // files written by this run — removed on failure

  // ── references (uploads + fetched brand logos) ─────────────────────────
  const uploadRefCache = new Map();
  const uploadRef = (i) => {
    if (!uploadRefCache.has(i)) uploadRefCache.set(i, uploads[i]?.data ? normalizeReference(uploads[i].data) : Promise.resolve(null));
    return uploadRefCache.get(i);
  };
  const brandLogos = new Map();
  const brandFetches = new Map();
  const ensureBrand = (b) => {
    const key = String(b?.name || '').trim().toLowerCase();
    if (!key || b.famous || !b.domain || brandFetches.has(key)) return;
    brandFetches.set(key, fetchBrandLogo(String(b.domain).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
      .then(logo => { if (logo) brandLogos.set(key, logo); }));
  };
  const resolveRefs = async (tokens = []) => {
    await Promise.all(brandFetches.values());
    const out = [];
    for (const t of tokens) {
      if (t.startsWith('upload:')) out.push(await uploadRef(parseInt(t.slice(7), 10)));
      else if (t.startsWith('brand:')) out.push(brandLogos.get(t.slice(6).trim().toLowerCase()) || null);
    }
    return out.filter(Boolean);
  };

  // ── asset jobs ─────────────────────────────────────────────────────────
  // An "asset" = one generation + its post-processing, keyed by content so
  // (a) layers that finished streaming early start immediately and the final
  // layout reuses those jobs, and (b) identical devices generate once.
  const assets = new Map(); // key → Promise<asset | null>
  let generationsStarted = 0;
  let styleBlock = '';
  const noteStart = () => { if (stats.first_image_start_ms === null) stats.first_image_start_ms = Date.now() - t0; };

  const bgKey = (bg) => `bg|${bg.prompt}|${bg.refs.join(',')}`;
  const imageKey = (l) => `${l.role}|${!!l.screen}|${l.screen?.fill || ''}|${l.prompt}|${l.refs.join(',')}`;
  const canvas = canvasFor(aspectRatio);

  function startBackground(bg) {
    const key = bgKey(bg);
    if (assets.has(key)) return assets.get(key);
    if (generationsStarted >= MAX_GENERATIONS_PER_SLIDE) return null;
    generationsStarted++; noteStart();
    const size = sizeForAspect(canvas.w, canvas.h);
    const promise = scheduleImageJob(0, async () => {
      const res = await generateLayerImage({
        prompt: composePrompt(deckDesign, { style_block: styleBlock }, bg.prompt, BG_SUFFIX), size, transparent: false,
        references: await resolveRefs(bg.refs), label: `s${slide.index}_bg`, mockSpec: { label: `bg${slide.index}` },
      });
      stats.images.push({ id: 'background', ms: res?.ms ?? null, usage: res?.usage ?? null, ok: !!res, size });
      if (!res) return null;
      const file = await storeBuffer(await coverToAspect(res.buffer, canvas));
      created.push(file);
      return { file };
    }).catch(err => { logger.warn('background job failed', { errorMessage: err.message }); return null; });
    assets.set(key, promise);
    return promise;
  }

  function startImage(l) {
    const key = imageKey(l);
    if (assets.has(key)) return assets.get(key);
    if (generationsStarted >= MAX_GENERATIONS_PER_SLIDE) return null;
    generationsStarted++; noteStart();
    const effect = l.role === 'effect';
    const screenImage = l.role === 'screen_image';
    const size = sizeForAspect(l.w, l.h);
    const suffix = effect ? EFFECT_SUFFIX : screenImage ? SCREEN_IMAGE_SUFFIX : `${l.screen ? `${SCREEN_SUFFIX} ` : ''}${ELEMENT_SUFFIX}`;
    const promise = scheduleImageJob(l.role === 'hero' ? 1 : 2, async () => {
      const res = await generateLayerImage({
        prompt: composePrompt(deckDesign, { style_block: styleBlock }, l.prompt, suffix), size,
        transparent: !effect && !screenImage, references: await resolveRefs(l.refs),
        label: `s${slide.index}_${l.id}`, mockSpec: { label: l.id, screen: !!l.screen, effect },
      });
      stats.images.push({ id: l.id, ms: res?.ms ?? null, usage: res?.usage ?? null, ok: !!res, size, role: l.role });
      if (!res) return null;
      let buf = res.buffer;
      let screenRect = null;
      if (effect) buf = await unscreen(buf);
      else if (!screenImage) {
        buf = await ensureTransparent(buf);
        if (l.screen) ({ buffer: buf, rect: screenRect } = await extractScreen(buf, l.screen.fill));
      }
      let trimmed;
      if (screenImage) {
        const meta = await sharp(buf).metadata();
        trimmed = { buffer: buf, width: meta.width, height: meta.height, offset: { x: 0, y: 0 } };
      } else {
        trimmed = await trimTransparent(buf);
      }
      if (!trimmed) return null;
      const file = await storeBuffer(trimmed.buffer);
      created.push(file);
      return {
        file, width: trimmed.width, height: trimmed.height,
        screenRect: screenRect ? { x: screenRect.x - trimmed.offset.x, y: screenRect.y - trimmed.offset.y, w: screenRect.w, h: screenRect.h } : null,
      };
    }).catch(err => { logger.warn('image job failed', { id: l.id, errorMessage: err.message }); return null; });
    assets.set(key, promise);
    return promise;
  }

  // While the layout streams: start every image whose JSON is complete.
  const onPartial = (parts) => {
    if (typeof parts.style_block === 'string' && !styleBlock) styleBlock = parts.style_block;
    if (Array.isArray(parts.brands)) parts.brands.forEach(ensureBrand);
    try {
      const early = normalizeLayout({ background: parts.background || { type: 'color' }, layers: parts.layers || [] }, { aspectRatio, uploadCount: uploads.length });
      if (parts.background && early.background.type === 'image') startBackground(early.background);
      for (const l of early.layers) {
        if (l.kind !== 'image') continue;
        // A brand ref whose brand isn't declared yet can't resolve — wait for the final layout.
        if (l.refs.some(r => r.startsWith('brand:') && !brandFetches.has(r.slice(6).trim().toLowerCase()))) continue;
        startImage(l);
      }
    } catch { /* partial layout not usable yet */ }
  };

  try {
    // ── 1. layout (images start while it streams) ──────────────────────────
    const raw = await designSlideLayout({ slide, header, deckDesign, brief, uploads, aspectRatio, style, siblingTitles, instruction, userId, onPartial });
    const layout = normalizeLayout(raw, { aspectRatio, uploadCount: uploads.length });
    stats.layout_ms = Date.now() - t0;
    if (layout.style_block && !styleBlock) styleBlock = layout.style_block;
    layout.brands.forEach(ensureBrand);

    for (const device of layout.layers.filter(l => l.kind === 'image' && l.screen)) {
      placeScreenChildren(layout, device, provisionalScreenRect(device));
    }
    // Children of devices that didn't survive normalization are dropped.
    layout.layers = layout.layers.filter(l => !l.in_screen);
    fitLayout(layout);
    onLayout(layout);

    // Logos are placed natively from the real file — never generated.
    await Promise.all(brandFetches.values());
    for (const l of layout.layers.filter(x => x.kind === 'logo' && !x.file)) {
      const dataUrl = l.source === 'upload' ? await uploadRef(l.upload) : brandLogos.get(l.brand.toLowerCase());
      if (!dataUrl) continue;
      const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
      const trimmed = await trimTransparent(buf) || { buffer: buf, width: l.w, height: l.h };
      l.file = await storeBuffer(trimmed.buffer); created.push(l.file);
      l.src = assetUrl(presentationId, l.file);
      Object.assign(l, containRect(trimmed.width, trimmed.height, l));
      onLayer(l);
    }

    // ── 2. apply assets to the final layout ───────────────────────────────
    const failures = [];
    const usedKeys = new Set();
    const waits = [];

    const bg = layout.background;
    if (bg.type === 'image' && !bg.file) {
      usedKeys.add(bgKey(bg));
      waits.push((async () => {
        const asset = await startBackground(bg);
        if (!asset) { failures.push({ id: 'background', critical: true }); return; }
        bg.file = asset.file;
        bg.src = assetUrl(presentationId, asset.file);
        onLayer({ id: 'background', kind: 'background', ...bg });
      })());
    }

    for (const l of layout.layers.filter(x => x.kind === 'image' && !x.file)) {
      usedKeys.add(imageKey(l));
      waits.push((async () => {
        const asset = await startImage(l);
        if (!asset) { failures.push({ id: l.id, critical: l.role === 'hero', layer: l }); return; }
        l.file = asset.file;
        l.src = assetUrl(presentationId, asset.file);
        if (l.role === 'screen_image') l.fit = 'cover';
        else Object.assign(l, containRect(asset.width, asset.height, l));
        if (l.screen) {
          const sx = l.w / asset.width; const sy = l.h / asset.height;
          const rect = asset.screenRect
            ? { x: Math.round(l.x + asset.screenRect.x * sx), y: Math.round(l.y + asset.screenRect.y * sy), w: Math.round(asset.screenRect.w * sx), h: Math.round(asset.screenRect.h * sy) }
            : provisionalScreenRect(l);
          l.screen.rect = rect;
          l.screen.detected = !!asset.screenRect;
          placeScreenChildren(layout, l, rect);
          for (const c of layout.layers.filter(c => c.screen_of === l.id)) onLayer(c);
        }
        onLayer(l);
      })());
    }

    // One icon sheet for all illustrated icons of the slide (after the full
    // layout — it needs the complete icon list).
    const sheetIcons = layout.layers.filter(l => l.kind === 'icon' && l.source === 'sheet' && !l.file);
    if (sheetIcons.length) {
      const n = sheetIcons.length;
      const cols = n <= 4 ? n : 4;
      const rows = Math.ceil(n / cols);
      const size = cols > rows ? '1536x1024' : '1024x1024';
      const list = sheetIcons.map((l, i) => `${i + 1}) ${l.prompt}`).join('; ');
      const body = `A sprite sheet of ${n} separate icons arranged in a strict grid of ${cols} column${cols > 1 ? 's' : ''} and ${rows} row${rows > 1 ? 's' : ''}. Every icon sits centered in its own equal-sized cell with generous empty space around it; icons never touch each other or cross cell boundaries. All icons share the same style, material, lighting, scale and viewing angle. Icons in reading order (left to right, top to bottom): ${list}.`;
      noteStart();
      waits.push(scheduleImageJob(2, async () => {
        const res = await generateLayerImage({
          prompt: composePrompt(deckDesign, { style_block: styleBlock }, body, 'Transparent background, no grid lines, no cell borders, no labels, no text, no shadow.'),
          size, transparent: true, label: `s${slide.index}_icons`, mockSpec: { kind: 'sheet', cols, rows, label: 'icons' },
        });
        stats.images.push({ id: 'icon_sheet', ms: res?.ms ?? null, usage: res?.usage ?? null, ok: !!res, size, icons: n });
        if (!res) { for (const l of sheetIcons) failures.push({ id: l.id, layer: l }); return; }
        const cells = await sliceSheet(await ensureTransparent(res.buffer), cols, rows);
        for (let i = 0; i < n; i++) {
          const l = sheetIcons[i]; const cell = cells[i];
          if (!cell) { failures.push({ id: l.id, layer: l }); continue; }
          l.file = await storeBuffer(cell.buffer); created.push(l.file);
          l.src = assetUrl(presentationId, l.file);
          Object.assign(l, containRect(cell.width, cell.height, l));
          onLayer(l);
        }
      }).catch(err => { logger.warn('icon sheet failed', { errorMessage: err.message }); for (const l of sheetIcons) failures.push({ id: l.id, layer: l }); }));
    }

    await Promise.all(waits);

    // Early-started jobs the final layout doesn't use (Claude revised a
    // layer after it streamed) — wait for them and discard their files.
    for (const [key, promise] of assets) {
      if (usedKeys.has(key)) continue;
      const asset = await promise;
      if (asset?.file) imageStore.remove(asset.file);
    }

    // ── 3. failure policy ──────────────────────────────────────────────────
    if (failures.some(f => f.critical)) {
      logger.error('layered slide failed — critical layer missing', { presentationId, slideIndex: slide.index, failed: failures.map(f => f.id) });
      for (const f of created) imageStore.remove(f);
      return null;
    }
    if (failures.length) {
      const dropIds = new Set(failures.map(f => f.id));
      layout.dropped = failures.filter(f => f.layer).map(f => ({ id: f.id, name: f.layer.name, kind: f.layer.kind, prompt: f.layer.prompt }));
      layout.layers = layout.layers.filter(l => !dropIds.has(l.id) && !dropIds.has(l.screen_of));
      logger.warn('layered slide: dropped failed elements', { presentationId, slideIndex: slide.index, dropped: [...dropIds] });
    }

    // ── 4. fit + visual self-review ────────────────────────────────────────
    let { warnings } = fitLayout(layout);
    if (review) {
      const tr = Date.now();
      try {
        const preview = await renderLayoutPreview(layout, loadStoredFile, { width: 1280 });
        const result = await reviewSlideLayout({ layout, previewPng: preview, warnings, userId, slideIndex: slide.index });
        const applied = applyReviewFixes(layout, result.fixes);
        if (applied) ({ warnings } = fitLayout(layout));
        layout.review = { verdict: result.verdict, fixes: applied };
      } catch (err) {
        logger.warn('layout review failed — keeping unreviewed layout', { slideIndex: slide.index, errorMessage: err.message });
      }
      stats.review_ms = Date.now() - tr;
    }
    if (warnings.length) layout.warnings = warnings.slice(0, 20);

    // ── 5. flattened preview ───────────────────────────────────────────────
    const flat = await renderLayoutPreview(layout, loadStoredFile, { width: 1920 });
    const image_file = await storeBuffer(flat);
    stats.total_ms = Date.now() - t0;
    logger.info('layered slide built', {
      presentationId, slideIndex: slide.index, totalMs: stats.total_ms, layoutMs: stats.layout_ms, firstImageStartMs: stats.first_image_start_ms,
      reviewMs: stats.review_ms, generations: stats.images.length, layers: layout.layers.length, composition: layout.composition,
    });
    return {
      layout,
      image_file,
      image_data: `/api/presentations/${presentationId}/slides/${slide.index}/image?f=${image_file}`,
      gen_stats: stats,
    };
  } catch (err) {
    logger.error('layered slide build errored', { presentationId, slideIndex: slide.index, errorMessage: err.message, stack: err.stack?.split('\n').slice(0, 3).join('\n') });
    // In-flight early jobs may still write files — clean those up when they land.
    for (const promise of assets.values()) promise.then(a => { if (a?.file) imageStore.remove(a.file); }).catch(() => {});
    for (const f of created) imageStore.remove(f);
    return null;
  }
}

// All files belonging to a slide (flattened image + every layer).
export function slideFiles(slide) {
  return [slide?.image_file, ...layoutFiles(slide?.layout)].filter(Boolean);
}
