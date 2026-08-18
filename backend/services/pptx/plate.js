// STEP 2.5 of the img2pptx workflow, in Node: erase what the builder is about
// to rebuild, before anything is cropped out of the raster.
//
// Why this exists (the long version is in backend/tools/img2pptx/WAYS_OF_WORKING.md):
// a source slide is FLAT. A pink callout card drawn over artwork is, in the PNG,
// just pixels. If the builder rebuilds that card as a live shape and the same
// pixels stay in the background image, the card exists twice. They register
// perfectly, so the slide looks right — until someone drags either object and a
// half-card fragment slides out from underneath.
//
// This is a port of tools/clean_plate.py. The Python original uses OpenCV's Telea
// inpainting; the deployed backend has no OpenCV, so the fill here is a collar-
// sampled vertical gradient plus a masked blur pass. The hidden pixels were never
// captured and cannot be recovered either way — the goal is a plausible fill that
// reads as background, since it is only ever seen if someone moves the live object
// that sits on top of it.
import sharp from 'sharp';
import { logger } from '../logger.js';

// Downscale used for colour sampling. Sampling the collar off a small copy is
// ~100x cheaper and gives a steadier colour than reading full-res pixels.
const SAMPLE_W = 320;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Grown, canvas-clamped box for a region — anti-aliased text and card shadows
// bleed past the nominal geometry the builder knows about.
function grownBox(region, w, h) {
  const g = Number.isFinite(region.grow) ? region.grow : 3;
  const x = clamp(region.x - g, 0, w);
  const y = clamp(region.y - g, 0, h);
  const x1 = clamp(region.x + region.w + g, 0, w);
  const y1 = clamp(region.y + region.h + g, 0, h);
  return { x, y, w: Math.max(0, x1 - x), h: Math.max(0, y1 - y) };
}

// Median colour of a band of sample-grid pixels, ignoring anything inside the
// regions being erased (a collar that samples the card itself paints the card
// straight back into the hole — clean_plate.py's auto_expand solves the same
// problem from the other end).
function bandColor(sample, sw, sh, x0, y0, x1, y1, blocked) {
  const r = [], g = [], b = [];
  for (let y = clamp(Math.floor(y0), 0, sh - 1); y <= clamp(Math.ceil(y1), 0, sh - 1); y++) {
    for (let x = clamp(Math.floor(x0), 0, sw - 1); x <= clamp(Math.ceil(x1), 0, sw - 1); x++) {
      if (blocked[y * sw + x]) continue;
      const i = (y * sw + x) * 3;
      r.push(sample[i]); g.push(sample[i + 1]); b.push(sample[i + 2]);
    }
  }
  if (!r.length) return null;
  const mid = arr => { arr.sort((a, z) => a - z); return arr[arr.length >> 1]; };
  return [mid(r), mid(g), mid(b)];
}

const hex = ([r, g, b]) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');

function shapeSvgBody(region, w, h, fill) {
  const b = grownBox(region, w, h);
  if (b.w <= 0 || b.h <= 0) return '';
  if (region.type === 'ellipse') {
    return `<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2}" ry="${b.h / 2}" fill="${fill}"/>`;
  }
  const rad = Math.max(0, Math.min(region.radius || 0, Math.min(b.w, b.h) / 2));
  return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${rad}" ry="${rad}" fill="${fill}"/>`;
}

/**
 * Erase `regions` from `imageBuffer` and return a PNG buffer of the clean plate.
 * Regions are `{type: 'rect'|'ellipse'|'text', x, y, w, h, radius?, grow?}` in
 * source pixels — the same coordinate system as the spec and the builder.
 */
export async function cleanPlate(imageBuffer, regions, width, height) {
  if (!regions.length) return imageBuffer;

  // One small RGB copy to sample every collar from.
  const sw = Math.min(SAMPLE_W, width);
  const sh = Math.max(1, Math.round((height / width) * sw));
  const { data: sample } = await sharp(imageBuffer)
    .resize(sw, sh, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const kx = sw / width, ky = sh / height;

  // Mark every erased region on the sample grid so collars never sample from
  // one region into another (a green callout beside a green badge, per the SOP).
  const blocked = new Uint8Array(sw * sh);
  for (const region of regions) {
    const b = grownBox(region, width, height);
    for (let y = clamp(Math.floor(b.y * ky), 0, sh - 1); y <= clamp(Math.ceil((b.y + b.h) * ky), 0, sh - 1); y++) {
      for (let x = clamp(Math.floor(b.x * kx), 0, sw - 1); x <= clamp(Math.ceil((b.x + b.w) * kx), 0, sw - 1); x++) {
        blocked[y * sw + x] = 1;
      }
    }
  }

  const overall = bandColor(sample, sw, sh, 0, 0, sw - 1, sh - 1, blocked) || [17, 17, 17];

  // Fill each hole with a vertical gradient read off the bands immediately
  // above and below it — AI slide art is overwhelmingly vertical gradients, so
  // two stops sampled from the real neighbourhood disappear into the artwork.
  const defs = [];
  const shapes = [];
  regions.forEach((region, i) => {
    const b = grownBox(region, width, height);
    if (b.w <= 0 || b.h <= 0) return;
    const reach = Math.max(4, Math.round(Math.min(b.h, height * 0.06) * ky));
    const top = bandColor(sample, sw, sh, b.x * kx, b.y * ky - reach, (b.x + b.w) * kx, b.y * ky, blocked);
    const bottom = bandColor(sample, sw, sh, b.x * kx, (b.y + b.h) * ky, (b.x + b.w) * kx, (b.y + b.h) * ky + reach, blocked);
    const left = bandColor(sample, sw, sh, b.x * kx - reach, b.y * ky, b.x * kx, (b.y + b.h) * ky, blocked);
    const right = bandColor(sample, sw, sh, (b.x + b.w) * kx, b.y * ky, (b.x + b.w) * kx + reach, (b.y + b.h) * ky, blocked);
    const side = left || right || overall;
    const c0 = top || side;
    const c1 = bottom || side;
    const id = `g${i}`;
    defs.push(
      `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="${hex(c0)}"/><stop offset="100%" stop-color="${hex(c1)}"/></linearGradient>`
    );
    shapes.push(shapeSvgBody(region, width, height, `url(#${id})`));
  });
  if (!shapes.length) return imageBuffer;

  const fillSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs>${defs.join('')}</defs>${shapes.join('')}</svg>`
  );
  const filled = await sharp(imageBuffer)
    .composite([{ input: fillSvg, top: 0, left: 0 }])
    .png()
    .toBuffer();

  // Soften the seam: blur the filled image, then let it through only over the
  // holes and a collar around them, so the fill reads as background rather than
  // as a rectangle of flat colour with a hard edge.
  const sigma = clamp(width / 160, 4, 24);
  const maskShapes = regions
    .map(r => shapeSvgBody({ ...r, grow: (Number.isFinite(r.grow) ? r.grow : 3) + sigma }, width, height, '#ffffff'))
    .join('');
  const maskSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<filter id="s"><feGaussianBlur stdDeviation="${(sigma / 2).toFixed(2)}"/></filter>` +
    `<g filter="url(#s)">${maskShapes}</g></svg>`
  );

  const blurredMasked = await sharp(filled)
    .blur(sigma)
    .ensureAlpha()
    .composite([{ input: maskSvg, blend: 'dest-in' }])
    .png()
    .toBuffer();

  return sharp(filled).composite([{ input: blurredMasked }]).png().toBuffer();
}

/**
 * Cut one raster object out of a plate — the port of `probe.py cutout` minus
 * de-rotation (the analyzer is instructed to emit axis-aligned boxes, so there
 * is no angle to undo). Rounded corners are applied as alpha so the piece has
 * no black shoulders.
 */
export async function cutout(plateBuffer, { x, y, w, h, radius = 0 }, width, height) {
  const left = clamp(Math.round(x), 0, Math.max(0, width - 2));
  const top = clamp(Math.round(y), 0, Math.max(0, height - 2));
  const cw = clamp(Math.round(w), 2, width - left);
  const ch = clamp(Math.round(h), 2, height - top);

  let piece = sharp(plateBuffer).extract({ left, top, width: cw, height: ch });
  const rad = Math.max(0, Math.min(radius, Math.min(cw, ch) / 2));
  if (rad > 0) {
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}">` +
      `<rect x="0" y="0" width="${cw}" height="${ch}" rx="${rad}" ry="${rad}" fill="#fff"/></svg>`
    );
    piece = piece.ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]);
  }
  return { buffer: await piece.png().toBuffer(), x: left, y: top, w: cw, h: ch };
}

// Reads the pixel dimensions of a slide image, rasterising svg placeholders on
// the way in so mock-mode decks still export.
export async function imageInfo(buffer) {
  try {
    const meta = await sharp(buffer).metadata();
    if (meta.width && meta.height) return { width: meta.width, height: meta.height, format: meta.format };
  } catch (err) {
    logger.warn('pptx: unreadable slide image', { errorMessage: err.message });
  }
  return null;
}

// Normalizes any slide image (png/jpeg/webp/svg) into a png buffer pptxgenjs
// can embed, capped so a 4K render doesn't inflate the deck past a sane size.
export async function toEmbeddablePng(buffer, maxWidth = 1920) {
  const pipeline = sharp(buffer, { density: 150 });
  const meta = await pipeline.metadata();
  if (meta.width && meta.width > maxWidth) pipeline.resize({ width: maxWidth });
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}
