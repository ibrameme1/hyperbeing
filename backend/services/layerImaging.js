import sharp from 'sharp';

// ─── Pixel post-processing for generated layers ─────────────────────────────
// Everything that turns a raw model output into a clean, placeable layer.
// Pure functions over PNG buffers so they're unit-testable without the API.

// Crop/resize a background to exactly the canvas aspect (stored at a fixed
// pixel width — the renderer scales it to the stage).
export async function coverToAspect(buffer, canvas, outWidth = 2048) {
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
  // Tolerant "green-dominant" test: real renders shade the chroma screen
  // (vignettes, reflections, darker edges), so test dominance, not a fixed
  // value. Devices are graphite/black/metal — no legitimate strong green.
  const greenness = (i) => data[i + 1] - Math.max(data[i], data[i + 2]);
  const isGreen = (i) => data[i + 3] > 40 && data[i + 1] > 70 && greenness(i) > 45;

  // Largest connected green region = the screen.
  const N = width * height;
  const seen = new Uint8Array(N);
  let best = null;
  const stack = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (seen[s0] || !isGreen(s0 * 4)) continue;
    let minX = width; let minY = height; let maxX = -1; let maxY = -1; let count = 0;
    seen[s0] = 1; stack.push(s0);
    while (stack.length) {
      const k = stack.pop(); const x = k % width; const y = (k - x) / width;
      count++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (seen[n] || !isGreen(n * 4)) continue;
        seen[n] = 1; stack.push(n);
      }
    }
    if (!best || count > best.count) best = { minX, minY, maxX, maxY, count };
  }
  // Recolour EVERY green-dominant pixel (screen, spill, reflections of it on
  // the frame) to the screen fill so no green survives anywhere.
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 20 && greenness(i) > 30) { data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; }
  }
  const out = await fromRaw(data, width, height);
  if (!best || best.count < N * 0.03) return { buffer: out, rect: null };
  return { buffer: out, rect: { x: best.minX, y: best.minY, w: best.maxX - best.minX + 1, h: best.maxY - best.minY + 1 } };
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

// ─── Cluster splitting ──────────────────────────────────────────────────────
// A "cluster" is ONE generated image (transparent background) containing all
// the objects of a slide's visual zone, so they share light and physically
// connect. Because the background is transparent, objects are separated by
// empty pixels: we label connected components of the alpha mask and assign
// each component to the declared item whose region it falls in. Each item
// becomes its own cut-out layer — no holes or inpainting, unlike splitting a
// full-slide image (prototype finding).
//
// items: [{ id, box: {x,y,w,h} as 0-1 fractions of the cluster image }]
// Returns [{ id, buffer, x, y, w, h (pixels in the cluster image), pixels }]
// for every item that received at least one component.
export async function splitCluster(buffer, items, { minAlpha = 4, seedAlpha = 160, seedCore = 0.5 } = {}) {
  const { data, width, height } = await raw(buffer);
  const N = width * height;
  const A = (k) => data[k * 4 + 3];
  const label = new Int16Array(N).fill(-1); // item index, -1 = unassigned

  // 1. Seeds: solid pixels in the central part of each item's declared
  //    region. Smaller items seed first so a large region (the hero) can't
  //    claim a small item's centre.
  const order = items.map((it, i) => i).sort((i, j) => items[i].box.w * items[i].box.h - items[j].box.w * items[j].box.h);
  const buckets = Array.from({ length: 256 }, () => []);
  for (const i of order) {
    const b = items[i].box;
    const mx = (b.w * (1 - seedCore)) / 2; const my = (b.h * (1 - seedCore)) / 2;
    const x0 = Math.max(0, Math.floor((b.x + mx) * width)); const x1 = Math.min(width - 1, Math.ceil((b.x + b.w - mx) * width));
    const y0 = Math.max(0, Math.floor((b.y + my) * height)); const y1 = Math.min(height - 1, Math.ceil((b.y + b.h - my) * height));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const k = y * width + x;
        if (label[k] !== -1 || A(k) < seedAlpha) continue;
        label[k] = i;
        buckets[0].push(k);
      }
    }
  }

  // 2. Minimax flood (watershed on transparency): a pixel joins the seed
  //    reachable with the smallest "most transparent pixel crossed". Regions
  //    therefore meet at the faintest junction — the thin trail or glow
  //    between two objects — instead of cutting through solid objects.
  for (let level = 0; level < 256; level++) {
    const bucket = buckets[level];
    for (let qi = 0; qi < bucket.length; qi++) {
      const k = bucket[qi];
      const x = k % width; const y = (k - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx; const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (label[n] !== -1 || A(n) < minAlpha) continue;
          label[n] = label[k];
          buckets[Math.max(level, 255 - A(n))].push(n);
        }
      }
    }
    buckets[level] = null;
  }

  // 3. Pixels no seed could reach (an object the model drew away from its
  //    declared spot, unconnected to anything): group into connected pieces
  //    and give each piece to the item whose region holds its centroid
  //    (smallest such region), else the nearest region.
  const stack = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (label[s0] !== -1 || A(s0) < minAlpha) continue;
    const piece = [s0]; label[s0] = -2; stack.push(s0);
    let sx = 0; let sy = 0;
    while (stack.length) {
      const k = stack.pop(); const x = k % width; const y = (k - x) / width;
      sx += x; sy += y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (label[n] !== -1 || A(n) < minAlpha) continue;
        label[n] = -2; piece.push(n); stack.push(n);
      }
    }
    const cx = sx / piece.length / width; const cy = sy / piece.length / height;
    const containing = items.map((it, i) => i).filter(i => {
      const b = items[i].box; return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
    });
    const dist = (i) => { const b = items[i].box; return (b.x + b.w / 2 - cx) ** 2 + (b.y + b.h / 2 - cy) ** 2; };
    const best = containing.length
      ? containing.reduce((p, q) => (items[p].box.w * items[p].box.h <= items[q].box.w * items[q].box.h ? p : q))
      : items.map((it, i) => i).reduce((p, q) => (dist(p) <= dist(q) ? p : q));
    for (const k of piece) label[k] = best;
  }

  // 4. Cut out each item.
  const out = [];
  for (let i = 0; i < items.length; i++) {
    let minX = width; let minY = height; let maxX = -1; let maxY = -1; let pixels = 0;
    for (let k = 0; k < N; k++) {
      if (label[k] !== i) continue;
      const x = k % width; const y = (k - x) / width;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      pixels++;
    }
    // Ignore crumbs (a few stray halo pixels) — not a real object.
    if (maxX < 0 || pixels < N * 0.0004) continue;
    const w = maxX - minX + 1; const h = maxY - minY + 1;
    const cut = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = (minY + y) * width + (minX + x);
        if (label[k] === i) data.copy(cut, (y * w + x) * 4, k * 4, k * 4 + 4);
      }
    }
    out.push({ id: items[i].id, buffer: await fromRaw(cut, w, h), x: minX, y: minY, w, h, pixels });
  }
  return out;
}
