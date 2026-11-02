import sharp from 'sharp';

// ─── Pixel post-processing for generated layers ─────────────────────────────
// Everything that turns a raw model output into a clean, placeable layer.
// Pure functions over PNG buffers so they're unit-testable without the API.

// Crop/resize a background to exactly the canvas aspect (stored at a fixed
// pixel width — the renderer scales it to the stage).
export async function coverToAspect(buffer, canvas, outWidth = 1920) {
  const outHeight = Math.round(outWidth * (canvas.h / canvas.w));
  return sharp(buffer).resize(outWidth, outHeight, { fit: 'cover', position: 'centre' }).png().toBuffer();
}

async function raw(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function fromRaw(data, width, height) {
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

// Fraction of pixels that are (nearly) fully transparent.
export async function transparentFraction(buffer) {
  const { data, width, height } = await raw(buffer);
  let t = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 8) t++;
  return t / (width * height);
}

// Safety net: a model asked for a transparent background occasionally returns
// an opaque one (flat white/grey/black behind the object). If the image has
// essentially no transparency, key out the background by flood-filling from
// the borders with the dominant corner color. Softens the edge by tolerance
// so anti-aliased fringes fade instead of leaving a hard halo.
export async function ensureTransparent(buffer) {
  if (await transparentFraction(buffer) > 0.02) return buffer;
  const { data, width, height } = await raw(buffer);
  const px = (x, y) => (y * width + x) * 4;
  const corners = [px(0, 0), px(width - 1, 0), px(0, height - 1), px(width - 1, height - 1)];
  const [r0, g0, b0] = [0, 1, 2].map(c => Math.round(corners.reduce((s, i) => s + data[i + c], 0) / 4));
  const dist = (i) => Math.max(Math.abs(data[i] - r0), Math.abs(data[i + 1] - g0), Math.abs(data[i + 2] - b0));
  const HARD = 18; const SOFT = 48;

  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) { stack.push(x, 0, x, height - 1); }
  for (let y = 0; y < height; y++) { stack.push(0, y, width - 1, y); }
  while (stack.length) {
    const y = stack.pop(); const x = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const k = y * width + x;
    if (seen[k]) continue;
    seen[k] = 1;
    const i = k * 4;
    const d = dist(i);
    if (d > SOFT) continue;
    data[i + 3] = d <= HARD ? 0 : Math.round(255 * (d - HARD) / (SOFT - HARD));
    if (d <= HARD) stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return fromRaw(data, width, height);
}

// "Unscreen": converts a light effect rendered on pure black (glows, light
// trails, sparks, aurora wisps, smoke lit from within) into a true
// transparent PNG — alpha = brightest channel, color un-premultiplied. This
// is the fix for soft effects on transparent backgrounds: models render
// semi-transparent glows poorly with background:transparent (halos, grey
// fringes), but render them beautifully on black. The result composites over
// a dark slide exactly like a "screen" blend, and works in PPTX too (which
// has no blend modes).
export async function unscreen(buffer, { feather = true } = {}) {
  const { data, width, height } = await raw(buffer);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
    const a = Math.max(r, g, b);
    if (a < 6) { data[i + 3] = 0; continue; }
    data[i] = Math.min(255, Math.round((r * 255) / a));
    data[i + 1] = Math.min(255, Math.round((g * 255) / a));
    data[i + 2] = Math.min(255, Math.round((b * 255) / a));
    data[i + 3] = Math.round(a * (data[i + 3] / 255));
  }
  // Feather the borders to zero. Models rarely fade a glow completely to
  // black at the frame edge, which otherwise leaves a hard rectangular seam
  // where the effect layer ends (seen in real gpt-image-2.5-flare output).
  // Connectors skip this: their endpoints deliberately touch the frame edge.
  if (!feather) return fromRaw(data, width, height);
  const fx = Math.max(1, Math.round(width * 0.12)); const fy = Math.max(1, Math.round(height * 0.12));
  for (let y = 0; y < height; y++) {
    const ky = Math.min(1, y / fy, (height - 1 - y) / fy);
    for (let x = 0; x < width; x++) {
      const k = Math.min(ky, x / fx, (width - 1 - x) / fx);
      if (k >= 1) continue;
      const i = (y * width + x) * 4 + 3;
      const e = Math.max(0, k);
      data[i] = Math.round(data[i] * e * e * (3 - 2 * e)); // smoothstep falloff
    }
  }
  return fromRaw(data, width, height);
}

// Trims fully-transparent margins. Returns null if nothing visible remains.
export async function trimTransparent(buffer) {
  const { data, width, height } = await raw(buffer);
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 2;
  const left = Math.max(0, minX - pad); const top = Math.max(0, minY - pad);
  const w = Math.min(width, maxX + pad + 1) - left; const h = Math.min(height, maxY + pad + 1) - top;
  const out = await sharp(buffer).extract({ left, top, width: w, height: h }).png().toBuffer();
  return { buffer: out, width: w, height: h, offset: { x: left, y: top } };
}

// Finds the flat chroma-green screen of a generated device and replaces it
// with `fill`. Returns { buffer, rect: {x,y,w,h} in pixels } or { buffer,
// rect: null } if no screen was found. Green-dominant fringe pixels around
// the screen are despilled to the fill color so no green halo survives.
export async function extractScreen(buffer, fill = '#000000') {
  const { data, width, height } = await raw(buffer);
  const [fr, fg, fb] = hexToRgb(fill);
  const isGreen = (i) => data[i + 3] > 200 && data[i + 1] > 150 && data[i] < 120 && data[i + 2] < 120 && data[i + 1] - Math.max(data[i], data[i + 2]) > 80;
  const isSpill = (i) => data[i + 3] > 40 && data[i + 1] > Math.max(data[i], data[i + 2]) + 30;

  let minX = width; let minY = height; let maxX = -1; let maxY = -1; let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (isGreen(i)) {
        count++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const boxArea = (maxX - minX + 1) * (maxY - minY + 1);
  // Require a reasonably solid, reasonably large rectangle — otherwise it's
  // just green detail in the render, not a screen.
  if (maxX < 0 || count < width * height * 0.03 || count / boxArea < 0.75) {
    return { buffer, rect: null };
  }
  const grow = 3;
  for (let y = Math.max(0, minY - grow); y <= Math.min(height - 1, maxY + grow); y++) {
    for (let x = Math.max(0, minX - grow); x <= Math.min(width - 1, maxX + grow); x++) {
      const i = (y * width + x) * 4;
      if (isGreen(i) || isSpill(i)) { data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = 255; }
    }
  }
  const out = await fromRaw(data, width, height);
  return { buffer: out, rect: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}

// Cuts an icon sheet generated as a strict cols×rows grid into individual
// trimmed icons (in reading order). Empty cells come back as null.
export async function sliceSheet(buffer, cols, rows) {
  const meta = await sharp(buffer).metadata();
  const cw = Math.floor(meta.width / cols); const ch = Math.floor(meta.height / rows);
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = await sharp(buffer).extract({ left: c * cw, top: r * ch, width: cw, height: ch }).png().toBuffer();
      out.push(await trimTransparent(cell));
    }
  }
  return out;
}

// Largest rect with the image's aspect that fits inside `box`, centered.
export function containRect(imgW, imgH, box) {
  const scale = Math.min(box.w / imgW, box.h / imgH);
  const w = Math.round(imgW * scale); const h = Math.round(imgH * scale);
  return { x: Math.round(box.x + (box.w - w) / 2), y: Math.round(box.y + (box.h - h) / 2), w, h };
}

export async function toPngDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

// Normalizes any raster/SVG data URL (user upload, fetched logo) to a PNG
// buffer no larger than maxSide — keeps reference uploads to the image API small.
export async function normalizeReference(dataUrl, maxSide = 1024) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || '');
  if (!m) return null;
  try {
    const buf = await sharp(Buffer.from(m[2], 'base64'), { density: 300 })
      .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
      .png().toBuffer();
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export function hexToRgb(hex) {
  const h = String(hex || '#000').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
