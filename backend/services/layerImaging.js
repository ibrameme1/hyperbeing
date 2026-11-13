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

// Cuts a photo contact sheet (a grid of equal photographs on a white page,
// see layeredSlide PHOTO_SHEET) into one opaque picture per panel, in reading
// order. `counts` = panels expected in each row (the last row may be short).
// Image models never draw the grid to the pixel, so the panels are FOUND, not
// assumed: white gutter rows split the page into row bands, then each band is
// split on its own white gutter columns (rows may not share column positions).
// A band or row that can't be found falls back to an even split with the
// gutter cropped away, so a sloppy sheet still yields usable tiles.
export async function slicePhotoSheet(buffer, counts) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width; const H = info.height;
  const white = (x, y) => { const i = (y * W + x) * 3; return data[i] > 228 && data[i + 1] > 228 && data[i + 2] > 228; };
  // Runs of content (non-gutter lines) along one axis inside a window.
  const bands = (len, lineIsGutter, expect) => {
    const runs = []; let start = -1;
    for (let p = 0; p <= len; p++) {
      const g = p === len || lineIsGutter(p);
      if (!g && start === -1) start = p;
      if (g && start !== -1) { runs.push([start, p]); start = -1; }
    }
    // Hairline "gutters" inside a picture (a white wall, a window) are noise:
    // join runs separated by less than 0.6% of the axis.
    const joined = [];
    for (const r of runs) {
      const last = joined[joined.length - 1];
      if (last && r[0] - last[1] < len * 0.006) last[1] = r[1]; else joined.push([...r]);
    }
    const real = joined.filter(r => r[1] - r[0] > (len / expect) * 0.45);
    return real.length === expect ? real : null;
  };
  const even = (len, expect) => Array.from({ length: expect }, (_, i) => {
    const cell = len / expect; const inset = cell * 0.045;
    return [Math.round(i * cell + inset), Math.round((i + 1) * cell - inset)];
  });
  const step = Math.max(1, Math.round(Math.min(W, H) / 700));
  const rowGutter = (y) => { let n = 0; let t = 0; for (let x = 0; x < W; x += step) { t++; if (white(x, y)) n++; } return n / t > 0.93; };
  const rowBands = bands(H, rowGutter, counts.length) || even(H, counts.length);
  const detected = { rows: rowBands.length === counts.length, cols: true };
  const out = [];
  for (let r = 0; r < counts.length; r++) {
    const [y0, y1] = rowBands[r];
    const colGutter = (x) => { let n = 0; let t = 0; for (let y = y0; y < y1; y += step) { t++; if (white(x, y)) n++; } return n / t > 0.93; };
    let cols = bands(W, colGutter, counts[r]);
    if (!cols) {
      detected.cols = false;
      // Even split of the widest full row's pitch, left-aligned (a short last row).
      const full = Math.max(...counts);
      cols = even(W, full).slice(0, counts[r]);
    }
    for (const [x0, x1] of cols) {
      // 2px in from every edge: the anti-aliased seam between photo and page.
      const left = Math.min(W - 8, x0 + 2); const top = Math.min(H - 8, y0 + 2);
      const width = Math.max(8, Math.min(W - left, x1 - x0 - 4)); const height = Math.max(8, Math.min(H - top, y1 - y0 - 4));
      out.push({ buffer: await sharp(buffer).removeAlpha().extract({ left, top, width, height }).png().toBuffer(), width, height });
    }
  }
  out.detected = detected;
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
const VISIBLE_ALPHA = 26;
export async function splitCluster(buffer, requested, { minAlpha = 4, seedAlpha = 160, seedCore = 0.5, mergeLevel = 110 } = {}) {
  const { data, width, height } = await raw(buffer);
  const N = width * height;
  const A = (k) => data[k * 4 + 3];
  let items = requested;
  const label = new Int16Array(N).fill(-1); // item index, -1 = unassigned

  // 0. Align the requested arrangement with what was actually drawn. The
  //    model often shrinks or shifts the whole composition (extra margin,
  //    letterboxing); seeding at the requested spots would then hand one
  //    object's pixels to its neighbour. Map the union of the requested boxes
  //    onto the bounding box of the solid content first.
  let cx0 = width; let cy0 = height; let cx1 = -1; let cy1 = -1;
  for (let k = 0; k < N; k++) {
    if (A(k) < seedAlpha) continue;
    const x = k % width; const y = (k - x) / width;
    if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y;
  }
  const union = items.reduce((u, it) => ({
    x0: Math.min(u.x0, it.box.x), y0: Math.min(u.y0, it.box.y),
    x1: Math.max(u.x1, it.box.x + it.box.w), y1: Math.max(u.y1, it.box.y + it.box.h),
  }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const content = cx1 > cx0 && cy1 > cy0
    ? { x0: cx0 / width, y0: cy0 / height, x1: (cx1 + 1) / width, y1: (cy1 + 1) / height }
    : union;
  const sx = (content.x1 - content.x0) / Math.max(1e-6, union.x1 - union.x0);
  const sy = (content.y1 - content.y0) / Math.max(1e-6, union.y1 - union.y0);
  items = items.map(it => ({
    ...it,
    box: {
      x: content.x0 + (it.box.x - union.x0) * sx, y: content.y0 + (it.box.y - union.y0) * sy,
      w: it.box.w * sx, h: it.box.h * sy,
    },
  }));

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
  // meet[a*n+b] = the faintest level at which regions a and b touch (0 =
  // touching through fully solid pixels, 255 = through near-invisible ones).
  const nItems = items.length;
  const meet = new Float32Array(nItems * nItems).fill(256);
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
          if (label[n] >= 0 && label[n] !== label[k]) {
            const lv = Math.max(level, 255 - A(n));
            const a = label[k]; const b = label[n];
            if (lv < meet[a * nItems + b]) { meet[a * nItems + b] = lv; meet[b * nItems + a] = lv; }
            continue;
          }
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

  // 4. Never cut through solid pixels: regions that touch through solid
  //    pixels (meet level < mergeLevel, i.e. contact alpha > ~145) are one
  //    physical thing — e.g. fuel streams drawn over a rider, coins landing
  //    in a wallet — and are merged into a single piece. Only faint
  //    junctions (a thin glow or light trail) stay as cuts. The merged piece
  //    takes the id of its largest member.
  const parent = items.map((_, i) => i);
  const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  for (let a = 0; a < nItems; a++) {
    for (let b = a + 1; b < nItems; b++) {
      if (meet[a * nItems + b] < mergeLevel) parent[find(a)] = find(b);
    }
  }
  const counts = new Float64Array(nItems);
  for (let k = 0; k < N; k++) if (label[k] >= 0) counts[label[k]]++;
  const groups = new Map();
  for (let i = 0; i < nItems; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
  const repOf = new Int16Array(nItems);
  const mergedInto = new Map();
  for (const members of groups.values()) {
    const rep = members.reduce((p, q) => (counts[q] > counts[p] ? q : p));
    for (const m of members) repOf[m] = rep;
    mergedInto.set(rep, members.filter(m => m !== rep && counts[m] > 0).map(m => items[m].id));
  }
  for (let k = 0; k < N; k++) if (label[k] >= 0) label[k] = repOf[label[k]];

  // 5. Cut out each piece.
  const out = [];
  for (let i = 0; i < items.length; i++) {
    if (repOf[i] !== i) continue;
    let minX = width; let minY = height; let maxX = -1; let maxY = -1; let pixels = 0;
    // The piece's box is measured on pixels you can actually see. A model
    // often leaves a near-invisible haze (alpha under ~10%) between objects
    // on a "transparent" background; counting it stretched every box across
    // its neighbours, so the pieces were placed shrunken and out of position.
    for (let k = 0; k < N; k++) {
      if (label[k] !== i) continue;
      pixels++;
      if (A(k) < VISIBLE_ALPHA) continue;
      const x = k % width; const y = (k - x) / width;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
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
    out.push({ id: items[i].id, buffer: await fromRaw(cut, w, h), x: minX, y: minY, w, h, pixels, merged: mergedInto.get(i) || [] });
  }
  // Where the content actually sat vs. where it was requested (fractions of
  // the frame) — lets the caller put the composition back where it belongs.
  out.align = { content, union, items: Object.fromEntries(items.map(it => [it.id, it.box])) };
  return out;
}
