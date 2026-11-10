import zlib from 'zlib';
import sharp from 'sharp';

// ─── User file uploads: validation + content extraction ─────────────────────
// The Dashboard prompt accepts more than images now: PDFs, PowerPoint decks,
// Excel sheets, Word docs and plain-text data (CSV/TSV/TXT/MD/JSON). This
// module is the ONLY place those bytes are trusted, so it is deliberately
// paranoid:
//
//  - The file type is decided by EXTENSION + MAGIC BYTES, never by the
//    client-sent MIME type. Anything not on the allowlist is rejected
//    (executables, scripts, HTML/SVG, macro-enabled Office files, archives).
//  - Office files are ZIPs. We read the central directory ourselves BEFORE
//    inflating anything and reject zip bombs (entry count, total declared size,
//    compression ratio), encrypted entries, ZIP64, path traversal names and
//    VBA macro parts. Every inflate is capped with maxOutputLength, so a lying
//    header can't blow up memory either.
//  - XML is never handed to an XML parser: a DOCTYPE/ENTITY declaration is
//    rejected outright (XXE / billion laughs) and text is pulled out with
//    bounded regexes. External relationships (TargetMode="External") are
//    ignored — we never fetch anything a document points at.
//  - Embedded / uploaded images are decoded with sharp (proves they really are
//    images) and re-encoded, which also strips metadata and any trailing
//    payload.
//
// The output is a plain JSON description (text digest + structure + a few
// re-encoded images) — the raw Office bytes are never stored. PDFs are kept
// in memory only long enough for Claude to read them (Claude reads PDFs
// natively, text and visuals) and are not persisted either.

const MB = 1024 * 1024;

export const FILE_LIMITS = {
  maxImages: 10,              // user-uploaded images (unchanged from before)
  maxDocuments: 5,            // non-image files per brief
  maxExtractedImages: 10,     // images pulled out of decks/docs, deck-wide
  imageBytes: 7 * MB,
  pdfBytes: 15 * MB,
  pdfPages: 100,              // Claude's per-request PDF page limit
  officeBytes: 25 * MB,
  textBytes: 2 * MB,
  totalDocumentBytes: 30 * MB, // sum of all non-image files (base64 JSON body is capped at 50MB)
  // ZIP safety
  zipMaxEntries: 5000,
  zipMaxTotalUncompressed: 300 * MB,
  zipMaxEntryUncompressed: 60 * MB,
  zipMaxRatio: 120,           // per entry, only checked for entries > 1MB uncompressed
  // Digest sizes (what Claude reads)
  digestChars: 60_000,        // per document
  sheetRows: 250,             // rows per sheet included in the digest
  sheetCols: 30,
  maxSheets: 12,
  maxDeckSlides: 40,          // a PPTX to redesign
};

// extension → kind. Everything else is rejected.
const EXT_KIND = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image',
  pdf: 'pdf',
  pptx: 'pptx', xlsx: 'xlsx', docx: 'docx',
  csv: 'csv', tsv: 'csv', txt: 'text', md: 'text', markdown: 'text', json: 'json',
};

// Extensions people will try that we refuse with a specific, helpful reason.
const REFUSED = {
  ppt: 'Old .ppt files aren\'t supported. Open it in PowerPoint and "Save As" .pptx, then upload again.',
  xls: 'Old .xls files aren\'t supported. Open it in Excel and "Save As" .xlsx (or export CSV), then upload again.',
  doc: 'Old .doc files aren\'t supported. Open it in Word and "Save As" .docx, then upload again.',
  pptm: 'Macro-enabled files (.pptm) aren\'t accepted for security reasons. Save it as a regular .pptx.',
  xlsm: 'Macro-enabled files (.xlsm) aren\'t accepted for security reasons. Save it as a regular .xlsx.',
  docm: 'Macro-enabled files (.docm) aren\'t accepted for security reasons. Save it as a regular .docx.',
  key: 'Keynote files aren\'t supported. Export it from Keynote as PowerPoint (.pptx) or PDF.',
  numbers: 'Numbers files aren\'t supported. Export it as .xlsx or CSV.',
  pages: 'Pages files aren\'t supported. Export it as .docx or PDF.',
  heic: 'HEIC photos aren\'t supported. Export them as JPG or PNG.',
  heif: 'HEIF photos aren\'t supported. Export them as JPG or PNG.',
  svg: 'SVG files aren\'t accepted for security reasons. Export it as PNG.',
  zip: 'ZIP archives aren\'t accepted. Upload the files inside it individually.',
};

export const ALLOWED_EXTENSIONS = Object.keys(EXT_KIND);
const DOC_PURPOSES = ['content', 'redesign', 'inspiration'];

export class FileRejected extends Error {
  constructor(message) { super(message); this.name = 'FileRejected'; this.userFacing = true; }
}
const reject = (name, why) => { throw new FileRejected(`"${shortName(name)}": ${why}`); };
const shortName = (n) => { const s = String(n || 'file'); return s.length > 60 ? `${s.slice(0, 57)}...` : s; };

export function extensionOf(name) {
  const m = /\.([a-z0-9]{1,10})$/i.exec(String(name || '').trim());
  return m ? m[1].toLowerCase() : '';
}

// ── data URLs ────────────────────────────────────────────────────────────────

const DATA_URL_RE = /^data:([a-z0-9.+\/-]*)(;[a-z0-9=.+\/-]+)*;base64,/i;

export function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = DATA_URL_RE.exec(dataUrl.slice(0, 200));
  if (!m) return null;
  const b64 = dataUrl.slice(m[0].length);
  if (/[^A-Za-z0-9+/=\s]/.test(b64.slice(0, 4096))) return null;
  return Buffer.from(b64, 'base64');
}

// ── magic bytes ──────────────────────────────────────────────────────────────

export function sniff(buf) {
  if (!buf || buf.length < 4) return 'unknown';
  const b = buf;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.slice(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (b.length >= 12 && b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'zip';
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x05 && b[3] === 0x06) return 'zip-empty';
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'ole'; // legacy Office / password-protected OOXML
  if (b.slice(0, 1024).toString('latin1').includes('%PDF-')) return 'pdf';
  if (b[0] === 0x4d && b[1] === 0x5a) return 'exe';
  if (b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) return 'exe';
  return 'unknown';
}

// ── ZIP (central directory first, bounded inflate) ──────────────────────────

export function readZip(buf, name = 'file') {
  // End of central directory: last 22..65557 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) reject(name, 'the file is damaged (not a valid Office file).');
  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) reject(name, 'the file is too large or uses an unsupported ZIP64 format.');
  if (total > FILE_LIMITS.zipMaxEntries) reject(name, 'the file contains too many parts.');
  if (cdOffset + cdSize > buf.length) reject(name, 'the file is damaged (truncated).');

  const entries = new Map();
  let p = cdOffset;
  let totalUncompressed = 0;
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) reject(name, 'the file is damaged (bad directory).');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const entryName = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;

    if (flags & 0x1) reject(name, 'the file is password-protected. Remove the password and upload again.');
    if (method !== 0 && method !== 8) reject(name, 'the file uses an unsupported compression method.');
    if (compSize === 0xffffffff || size === 0xffffffff) reject(name, 'the file is too large or uses an unsupported ZIP64 format.');
    if (/(^|[\\/])\.\.([\\/]|$)/.test(entryName) || /^[\\/]/.test(entryName) || /^[a-z]:/i.test(entryName) || entryName.includes('\0')) {
      reject(name, 'the file contains unsafe paths.');
    }
    if (size > FILE_LIMITS.zipMaxEntryUncompressed) reject(name, 'the file contains a part that is too large.');
    if (size > MB && compSize > 0 && size / compSize > FILE_LIMITS.zipMaxRatio) reject(name, 'the file looks like a compression bomb.');
    totalUncompressed += size;
    if (totalUncompressed > FILE_LIMITS.zipMaxTotalUncompressed) reject(name, 'the file expands to more data than we accept.');
    if (entries.has(entryName)) reject(name, 'the file is damaged (duplicate parts).');
    entries.set(entryName, { name: entryName, method, compSize, size, localOffset });
  }

  function read(entryName, maxBytes = FILE_LIMITS.zipMaxEntryUncompressed) {
    const e = entries.get(entryName);
    if (!e) return null;
    const lo = e.localOffset;
    if (lo + 30 > buf.length || buf.readUInt32LE(lo) !== 0x04034b50) reject(name, 'the file is damaged (bad part header).');
    const start = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
    const data = buf.subarray(start, start + e.compSize);
    if (data.length !== e.compSize) reject(name, 'the file is damaged (truncated part).');
    const cap = Math.min(maxBytes, FILE_LIMITS.zipMaxEntryUncompressed);
    if (e.method === 0) return e.size > cap ? null : Buffer.from(data);
    try {
      // maxOutputLength enforces the cap on the ACTUAL output (headers can lie).
      return zlib.inflateRawSync(data, { maxOutputLength: Math.max(1, Math.min(cap, e.size || cap)) + 1 }).subarray(0, cap);
    } catch {
      reject(name, 'the file is damaged or expands beyond its declared size.');
    }
    return null;
  }
  const text = (entryName) => {
    const b = read(entryName);
    if (!b) return null;
    const s = b.toString('utf8');
    if (/<!DOCTYPE|<!ENTITY/i.test(s.slice(0, 4096))) reject(name, 'the file contains disallowed XML declarations.');
    return s;
  };
  return { entries, read, text, names: () => [...entries.keys()] };
}

// ── tiny XML helpers (bounded regexes, no DTDs) ─────────────────────────────

export function xmlDecode(s) {
  return String(s)
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function safeChar(cp) { try { return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : ''; } catch { return ''; } }
const attr = (tag, a) => { const m = new RegExp(`\\b${a}="([^"]*)"`).exec(tag); return m ? xmlDecode(m[1]) : null; };
const allMatches = (s, re) => { const out = []; let m; const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); while ((m = r.exec(s))) out.push(m); return out; };
const joinText = (xml, tag = 'a:t') => allMatches(xml, new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`)).map(m => xmlDecode(m[1])).join('');
const clean = (s) => String(s || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[ \t]+/g, ' ').trim();

function relsOf(zip, partPath) {
  const dir = partPath.replace(/[^/]*$/, '');
  const relsPath = `${dir}_rels/${partPath.slice(dir.length)}.rels`;
  const xml = zip.text(relsPath);
  const map = new Map();
  if (!xml) return map;
  for (const m of allMatches(xml, /<Relationship\b[^>]*\/?>/)) {
    const tag = m[0];
    if (attr(tag, 'TargetMode') === 'External') continue; // never follow external links
    const id = attr(tag, 'Id'); const target = attr(tag, 'Target'); const type = attr(tag, 'Type') || '';
    if (!id || !target) continue;
    map.set(id, { type: type.replace(/^.*\//, ''), path: resolvePath(dir, target) });
  }
  return map;
}
function resolvePath(dir, target) {
  const parts = (target.startsWith('/') ? target.slice(1) : dir + target).split('/');
  const out = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
  return out.join('/');
}

// ── charts (shared by PPTX and XLSX) ────────────────────────────────────────

const CHART_TYPES = { barChart: 'bar', bar3DChart: 'bar', lineChart: 'line', line3DChart: 'line', pieChart: 'pie', pie3DChart: 'pie', doughnutChart: 'donut', areaChart: 'area', area3DChart: 'area', scatterChart: 'scatter', radarChart: 'radar', bubbleChart: 'bubble' };

export function parseChartXml(xml) {
  if (!xml) return null;
  const typeM = /<c:(\w+Chart)\b/.exec(xml);
  let type = typeM ? (CHART_TYPES[typeM[1]] || typeM[1]) : 'chart';
  if (type === 'bar' && /<c:barDir\s+val="col"/.test(xml)) type = 'column';
  const title = clean(joinText((/<c:title>([\s\S]*?)<\/c:title>/.exec(xml) || [])[1] || ''));
  const pts = (block) => {
    if (!block) return [];
    const arr = [];
    for (const m of allMatches(block, /<c:pt\s+idx="(\d+)"[^>]*>\s*(?:<c:formatCode>[^<]*<\/c:formatCode>\s*)?<c:v>([^<]*)<\/c:v>/)) {
      const i = parseInt(m[1], 10);
      if (i < 500) arr[i] = xmlDecode(m[2]);
    }
    return arr;
  };
  const series = [];
  let categories = [];
  for (const s of allMatches(xml, /<c:ser>([\s\S]*?)<\/c:ser>/).slice(0, 12)) {
    const body = s[1];
    const name = clean(joinText((/<c:tx>([\s\S]*?)<\/c:tx>/.exec(body) || [])[1] || '', 'c:v'));
    const cat = pts((/<c:(?:cat|xVal)>([\s\S]*?)<\/c:(?:cat|xVal)>/.exec(body) || [])[1]);
    const val = pts((/<c:(?:val|yVal)>([\s\S]*?)<\/c:(?:val|yVal)>/.exec(body) || [])[1]).map(v => (v === undefined || v === '' ? null : Number(v)));
    if (cat.length > categories.length) categories = cat;
    series.push({ name: name || `Series ${series.length + 1}`, values: val.map(v => (Number.isFinite(v) ? v : null)) });
  }
  if (!series.length) return null;
  return { chart_type: type, title: title || null, categories: categories.map(c => clean(c ?? '')), series };
}

function chartToText(c) {
  const lines = [`Chart (${c.chart_type})${c.title ? ` "${c.title}"` : ''}:`];
  if (c.categories.length) lines.push(`  categories: ${c.categories.join(' | ')}`);
  for (const s of c.series) lines.push(`  ${s.name}: ${s.values.map(v => (v === null ? '-' : v)).join(' | ')}`);
  return lines.join('\n');
}

// ── images ───────────────────────────────────────────────────────────────────

// Decodes + re-encodes an image (proves it is one, strips metadata/trailing
// bytes) and downsizes it for Claude / the image model. Returns
// { data: dataUrl, mimeType, width, height } or null when it can't be decoded.
export async function normalizeImage(buf, { maxSide = 1600, minSide = 0 } = {}) {
  try {
    const img = sharp(buf, { failOn: 'error', limitInputPixels: 80_000_000, animated: false });
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return null;
    if (Math.max(meta.width, meta.height) < minSide) return null;
    const pipeline = img.rotate().resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true });
    const out = meta.hasAlpha
      ? await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer({ resolveWithObject: true })
      : await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    const mimeType = meta.hasAlpha ? 'image/png' : 'image/jpeg';
    return { data: `data:${mimeType};base64,${out.data.toString('base64')}`, mimeType, width: out.info.width, height: out.info.height };
  } catch {
    return null;
  }
}

const RASTER_EXT = /\.(png|jpe?g|gif|webp)$/i;

// ── PPTX ─────────────────────────────────────────────────────────────────────

const EMU = (v) => (v == null ? null : parseInt(v, 10));

export function extractPptx(zip, name) {
  const presXml = zip.text('ppt/presentation.xml');
  if (!presXml) reject(name, 'this doesn\'t look like a PowerPoint deck.');
  const sz = /<p:sldSz\b[^>]*>/.exec(presXml)?.[0] || '';
  const slideW = EMU(attr(sz, 'cx')) || 12192000;
  const slideH = EMU(attr(sz, 'cy')) || 6858000;
  const presRels = relsOf(zip, 'ppt/presentation.xml');
  const order = allMatches(presXml, /<p:sldId\b[^>]*\/?>/).map(m => attr(m[0], 'r:id')).filter(Boolean);

  const pct = (xfrm) => {
    if (!xfrm) return null;
    const off = /<a:off\b[^>]*>/.exec(xfrm)?.[0]; const ext = /<a:ext\b[^>]*>/.exec(xfrm)?.[0];
    if (!off || !ext) return null;
    const r = (n, d) => Math.round((n / d) * 100);
    return { x: r(EMU(attr(off, 'x')), slideW), y: r(EMU(attr(off, 'y')), slideH), w: r(EMU(attr(ext, 'cx')), slideW), h: r(EMU(attr(ext, 'cy')), slideH) };
  };

  const slides = [];
  const media = new Map(); // media path → { slides:Set, area }
  let number = 0;
  for (const rid of order) {
    const rel = presRels.get(rid);
    if (!rel || !/slide$/i.test(rel.type)) continue;
    number++;
    if (slides.length >= FILE_LIMITS.maxDeckSlides) break;
    const xml = zip.text(rel.path);
    if (!xml) continue;
    const hidden = /<p:sld\b[^>]*\bshow="0"/.test(xml);
    const rels = relsOf(zip, rel.path);
    const slide = { number, hidden, title: null, subtitle: null, texts: [], tables: [], charts: [], pictures: [], notes: '' };

    // Text shapes (titles detected by placeholder type).
    for (const m of allMatches(xml, /<p:sp>([\s\S]*?)<\/p:sp>/)) {
      const sp = m[1];
      const ph = /<p:ph\b[^>]*>/.exec(sp)?.[0] || '';
      const phType = attr(ph, 'type');
      if (['sldNum', 'dt', 'ftr'].includes(phType)) continue;
      const paras = allMatches(sp, /<a:p>([\s\S]*?)<\/a:p>/).map(p => clean(joinText(p[1]))).filter(Boolean);
      if (!paras.length) continue;
      const text = paras.join('\n');
      if ((phType === 'title' || phType === 'ctrTitle') && !slide.title) slide.title = text.replace(/\n/g, ' ');
      else if (phType === 'subTitle' && !slide.subtitle) slide.subtitle = text.replace(/\n/g, ' ');
      else slide.texts.push({ text, pos: pct(/<a:xfrm\b[\s\S]*?<\/a:xfrm>/.exec(sp)?.[0]) });
    }
    // Tables.
    for (const t of allMatches(xml, /<a:tbl>([\s\S]*?)<\/a:tbl>/).slice(0, 4)) {
      const rows = allMatches(t[1], /<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/).slice(0, 40)
        .map(r => allMatches(r[1], /<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/).slice(0, 15).map(c => clean(allMatches(c[1], /<a:p>([\s\S]*?)<\/a:p>/).map(p => joinText(p[1])).join(' '))));
      if (rows.length) slide.tables.push(rows);
    }
    // Charts.
    for (const c of allMatches(xml, /<c:chart\b[^>]*r:id="([^"]+)"/).slice(0, 4)) {
      const cr = rels.get(c[1]);
      const chart = cr ? parseChartXml(zip.text(cr.path)) : null;
      if (chart) slide.charts.push(chart);
    }
    // Pictures.
    for (const pic of allMatches(xml, /<p:pic>([\s\S]*?)<\/p:pic>/)) {
      const embed = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(pic[1])?.[1];
      const r = embed && rels.get(embed);
      if (!r || !RASTER_EXT.test(r.path) || !zip.entries.has(r.path)) continue;
      const pos = pct(/<a:xfrm\b[\s\S]*?<\/a:xfrm>/.exec(pic[1])?.[0]);
      const descr = attr(/<p:cNvPr\b[^>]*>/.exec(pic[1])?.[0] || '', 'descr');
      slide.pictures.push({ media: r.path, pos, alt: descr ? clean(descr).slice(0, 200) : null });
      const m = media.get(r.path) || { slides: new Set(), area: 0 };
      m.slides.add(number); m.area = Math.max(m.area, pos ? pos.w * pos.h : 0);
      media.set(r.path, m);
    }
    // Speaker notes.
    for (const r of rels.values()) {
      if (!/notesSlide$/i.test(r.type)) continue;
      const nx = zip.text(r.path);
      if (!nx) break;
      slide.notes = allMatches(nx, /<p:sp>([\s\S]*?)<\/p:sp>/)
        .filter(m => { const t = attr(/<p:ph\b[^>]*>/.exec(m[1])?.[0] || '', 'type'); return t === 'body' || t === null; })
        .map(m => allMatches(m[1], /<a:p>([\s\S]*?)<\/a:p>/).map(p => clean(joinText(p[1]))).filter(Boolean).join('\n'))
        .filter(Boolean).join('\n').slice(0, 1500);
      break;
    }
    // A slide without a title placeholder: promote the first short text.
    if (!slide.title && slide.texts.length && slide.texts[0].text.length <= 120) slide.title = slide.texts.shift().text.replace(/\n/g, ' ');
    slides.push(slide);
  }
  if (!slides.length) reject(name, 'the deck has no slides.');

  return { slides, totalSlides: number, theme: extractTheme(zip), media, aspect: slideW / slideH };
}

function extractTheme(zip) {
  const themePath = zip.names().find(n => /^ppt\/theme\/theme\d+\.xml$/.test(n));
  const xml = themePath ? zip.text(themePath) : null;
  if (!xml) return null;
  const colors = {};
  const scheme = /<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/.exec(xml)?.[0] || '';
  for (const k of ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']) {
    const block = new RegExp(`<a:${k}>([\\s\\S]*?)</a:${k}>`).exec(scheme)?.[1] || '';
    const hex = /<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/.exec(block)?.[1] || /lastClr="([0-9A-Fa-f]{6})"/.exec(block)?.[1];
    if (hex) colors[k] = `#${hex.toUpperCase()}`;
  }
  const font = (kind) => attr(new RegExp(`<a:${kind}>[\\s\\S]*?<a:latin\\b[^>]*>`).exec(xml)?.[0]?.match(/<a:latin\b[^>]*>/)?.[0] || '', 'typeface');
  return { colors, fonts: { heading: font('majorFont'), body: font('minorFont') } };
}

export function pptxSlideText(s) {
  const lines = [];
  if (s.title) lines.push(`Title: ${s.title}`);
  if (s.subtitle) lines.push(`Subtitle: ${s.subtitle}`);
  for (const t of s.texts) lines.push(`Text${t.pos ? ` [at x${t.pos.x}% y${t.pos.y}% w${t.pos.w}% h${t.pos.h}%]` : ''}: ${t.text.replace(/\n/g, ' / ')}`);
  for (const tbl of s.tables) lines.push(`Table:\n${tbl.map(r => `  | ${r.join(' | ')} |`).join('\n')}`);
  for (const c of s.charts) lines.push(chartToText(c));
  for (const p of s.pictures) lines.push(`Picture${p.pos ? ` [at x${p.pos.x}% y${p.pos.y}% w${p.pos.w}% h${p.pos.h}%]` : ''}${p.alt ? `: ${p.alt}` : ''}`);
  if (s.notes) lines.push(`Speaker notes: ${s.notes.replace(/\n/g, ' / ')}`);
  return lines.join('\n');
}

function pptxDigest(deck) {
  const head = [`PowerPoint deck: ${deck.totalSlides} slide(s)${deck.slides.length < deck.totalSlides ? ` (first ${deck.slides.length} read)` : ''}.`];
  if (deck.theme) head.push(`Theme colours: ${Object.entries(deck.theme.colors).map(([k, v]) => `${k} ${v}`).join(', ')}. Fonts: ${deck.theme.fonts.heading || '?'} / ${deck.theme.fonts.body || '?'}.`);
  const body = deck.slides.map(s => `--- Slide ${s.number}${s.hidden ? ' (hidden)' : ''} ---\n${pptxSlideText(s)}`);
  return [...head, ...body].join('\n');
}

// ── XLSX ─────────────────────────────────────────────────────────────────────

const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function colIndex(ref) {
  const letters = /^([A-Z]{1,3})/.exec(ref || '')?.[1];
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function excelDate(serial) {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  const iso = d.toISOString();
  return serial % 1 === 0 ? iso.slice(0, 10) : iso.slice(0, 16).replace('T', ' ');
}

export function extractXlsx(zip, name) {
  const wb = zip.text('xl/workbook.xml');
  if (!wb) reject(name, 'this doesn\'t look like an Excel workbook.');
  const rels = relsOf(zip, 'xl/workbook.xml');

  const shared = [];
  const ss = zip.text('xl/sharedStrings.xml');
  if (ss) for (const m of allMatches(ss, /<si>([\s\S]*?)<\/si>/)) shared.push(clean(joinText(m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, ''), 't')));

  // Which style indexes are dates.
  const dateStyles = new Set();
  const styles = zip.text('xl/styles.xml');
  if (styles) {
    const custom = new Map();
    for (const m of allMatches(styles, /<numFmt\b[^>]*\/?>/)) custom.set(parseInt(attr(m[0], 'numFmtId'), 10), attr(m[0], 'formatCode') || '');
    const xfs = /<cellXfs\b[\s\S]*?<\/cellXfs>/.exec(styles)?.[0] || '';
    allMatches(xfs, /<xf\b[^>]*>/).forEach((m, i) => {
      const id = parseInt(attr(m[0], 'numFmtId') || '0', 10);
      const code = (custom.get(id) || '').replace(/"[^"]*"|\[[^\]]*\]/g, '');
      if (BUILTIN_DATE_FMTS.has(id) || (custom.has(id) && /[dy]/i.test(code) && !/^[#0.,%]+$/.test(code))) dateStyles.add(i);
    });
  }

  const sheets = [];
  for (const m of allMatches(wb, /<sheet\b[^>]*\/?>/)) {
    if (sheets.length >= FILE_LIMITS.maxSheets) break;
    const sheetName = attr(m[0], 'name') || `Sheet${sheets.length + 1}`;
    const state = attr(m[0], 'state');
    const r = rels.get(attr(m[0], 'r:id'));
    if (!r) continue;
    const xml = zip.text(r.path);
    if (!xml) continue;
    const rows = [];
    let totalRows = 0; let maxCol = 0;
    for (const row of allMatches(xml, /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/)) {
      totalRows++;
      if (rows.length >= FILE_LIMITS.sheetRows) continue;
      const cells = [];
      for (const c of allMatches(row[1] || '', /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/)) {
        const a = c[1]; const inner = c[2] || '';
        const ci = colIndex(attr(a, 'r'));
        const col = ci >= 0 ? ci : cells.length;
        if (col >= FILE_LIMITS.sheetCols) continue;
        const t = attr(a, 't'); const s = parseInt(attr(a, 's') || '-1', 10);
        const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1];
        let val = '';
        if (t === 's') val = shared[parseInt(v, 10)] ?? '';
        else if (t === 'inlineStr') val = clean(joinText(inner, 't'));
        else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'e') val = v ? xmlDecode(v) : '#ERR';
        else if (v !== undefined) {
          const num = Number(v);
          val = t !== 'str' && dateStyles.has(s) ? (excelDate(num) ?? xmlDecode(v)) : (Number.isFinite(num) && t !== 'str' ? String(Math.round(num * 1e6) / 1e6) : xmlDecode(v));
        }
        cells[col] = clean(val);
      }
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      if (!cells.length) continue;
      maxCol = Math.max(maxCol, cells.length);
      rows.push(Array.from(cells, x => x ?? ''));
    }
    // Charts drawn on this sheet.
    const charts = [];
    const sheetRels = relsOf(zip, r.path);
    for (const d of sheetRels.values()) {
      if (!/drawing$/i.test(d.type)) continue;
      for (const c of relsOf(zip, d.path).values()) {
        if (!/chart$/i.test(c.type) || charts.length >= 4) continue;
        const chart = parseChartXml(zip.text(c.path));
        if (chart) charts.push(chart);
      }
    }
    sheets.push({ name: sheetName, hidden: state === 'hidden' || state === 'veryHidden', rows, totalRows, cols: maxCol, charts });
  }
  if (!sheets.length || sheets.every(s => !s.rows.length && !s.charts.length)) reject(name, 'the workbook is empty.');
  return { sheets };
}

function xlsxDigest(x) {
  return x.sheets.map(s => {
    const head = `--- Sheet "${s.name}"${s.hidden ? ' (hidden)' : ''}: ${s.totalRows} row(s) x ${s.cols} column(s)${s.rows.length < s.totalRows ? `, first ${s.rows.length} rows shown` : ''} ---`;
    const body = s.rows.map(r => r.join(' | ')).join('\n');
    const charts = s.charts.map(chartToText).join('\n');
    return [head, body, charts].filter(Boolean).join('\n');
  }).join('\n');
}

// ── DOCX ─────────────────────────────────────────────────────────────────────

export function extractDocx(zip, name) {
  const xml = zip.text('word/document.xml');
  if (!xml) reject(name, 'this doesn\'t look like a Word document.');
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(xml)?.[1] || xml;
  const out = [];
  // Walk top-level paragraphs and tables in document order.
  for (const m of allMatches(body, /<w:tbl>([\s\S]*?)<\/w:tbl>|<w:p\b[^>]*>([\s\S]*?)<\/w:p>|<w:p\b[^>]*\/>/)) {
    if (m[1] !== undefined) {
      const rows = allMatches(m[1], /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/).slice(0, 60)
        .map(r => allMatches(r[1], /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/).slice(0, 15).map(c => clean(joinText(c[1], 'w:t'))));
      if (rows.length) out.push(rows.map(r => `| ${r.join(' | ')} |`).join('\n'));
      continue;
    }
    const p = m[2] || '';
    const text = clean(joinText(p.replace(/<w:tab\/>/g, '<w:t> </w:t>'), 'w:t'));
    if (!text) continue;
    const style = /<w:pStyle\s+w:val="([^"]+)"/.exec(p)?.[1] || '';
    const level = /^Heading(\d)$/i.exec(style)?.[1] || (/^Title$/i.test(style) ? '1' : null);
    const list = /<w:numPr\b/.test(p);
    out.push(level ? `${'#'.repeat(Math.min(6, +level))} ${text}` : list ? `- ${text}` : text);
  }
  if (!out.length) reject(name, 'the document is empty.');
  return { text: out.join('\n') };
}

// ── CSV / text ───────────────────────────────────────────────────────────────

function decodeUtf8(buf, name) {
  if (buf.includes(0)) reject(name, 'this isn\'t a text file.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch {
    reject(name, 'the file isn\'t valid UTF-8 text. Re-save it as UTF-8.');
  }
  return '';
}

export function parseCsv(text, delimiter = null) {
  const first = text.slice(0, 2000);
  const delim = delimiter || (first.split('\t').length > first.split(',').length ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ','));
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length && rows.length <= FILE_LIMITS.sheetRows; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch;
    } else if (ch === '"' && field === '') q = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(c => c.trim())) rows.push(row.slice(0, FILE_LIMITS.sheetCols).map(clean));
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); if (row.some(c => c.trim())) rows.push(row.slice(0, FILE_LIMITS.sheetCols).map(clean)); }
  return rows.slice(0, FILE_LIMITS.sheetRows);
}

// ── PDF ──────────────────────────────────────────────────────────────────────

export function inspectPdf(buf, name) {
  const s = buf.toString('latin1');
  if (/\/Encrypt\s/.test(s.slice(-4096)) || /\/Encrypt\s+\d+\s+\d+\s+R/.test(s)) reject(name, 'the PDF is password-protected or encrypted. Remove the protection and upload again.');
  const pages = (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
  if (pages > FILE_LIMITS.pdfPages) reject(name, `the PDF has ${pages} pages; the limit is ${FILE_LIMITS.pdfPages}. Split it or upload the relevant pages.`);
  return { pages: pages || null };
}

// ═══ Public API ══════════════════════════════════════════════════════════════

/**
 * Validates one non-image attachment and extracts its content.
 * att: { type:'document', name, data (base64 data URL), category? }
 * Returns {
 *   doc:    stored description (no raw bytes): { type:'document', kind, name, purpose, size, digest, meta, deck? },
 *   images: [{ name, data, mimeType, slides? }] extracted embedded images (re-encoded),
 *   pdf:    { name, data } (base64, NOT persisted) for PDFs,
 * }
 * Throws FileRejected with a user-facing message.
 */
export async function ingestDocument(att) {
  const name = String(att?.name || '').slice(0, 255);
  const ext = extensionOf(name);
  if (REFUSED[ext]) reject(name, REFUSED[ext]);
  const kind = EXT_KIND[ext];
  if (!kind || kind === 'image') reject(name, `.${ext || '?'} files aren't supported. You can upload PDF, PPTX, XLSX, DOCX, CSV, TXT, MD, JSON or images.`);
  const buf = decodeDataUrl(att.data);
  if (!buf || !buf.length) reject(name, 'the file is empty or could not be read.');

  const purpose = DOC_PURPOSES.includes(att.category) ? att.category : 'content';
  if (purpose === 'redesign' && kind !== 'pptx') reject(name, 'only PowerPoint (.pptx) files can be redesigned.');
  const magic = sniff(buf);
  if (magic === 'exe') reject(name, 'executable files aren\'t accepted.');

  const base = { type: 'document', kind, name, purpose, size: buf.length };

  if (kind === 'pdf') {
    if (buf.length > FILE_LIMITS.pdfBytes) reject(name, `PDFs can be up to ${FILE_LIMITS.pdfBytes / MB}MB.`);
    if (magic !== 'pdf') reject(name, 'this isn\'t a valid PDF.');
    const { pages } = inspectPdf(buf, name);
    return {
      doc: { ...base, digest: `PDF document${pages ? `, ${pages} page(s)` : ''}. Claude reads the full PDF (text and visuals).`, meta: { pages } },
      images: [],
      pdf: { name, data: buf.toString('base64') },
    };
  }

  if (kind === 'pptx' || kind === 'xlsx' || kind === 'docx') {
    if (buf.length > FILE_LIMITS.officeBytes) reject(name, `Office files can be up to ${FILE_LIMITS.officeBytes / MB}MB.`);
    if (magic === 'ole') reject(name, 'the file is password-protected or in an old Office format. Remove the password / save it as a modern .' + kind + ' file.');
    if (magic !== 'zip') reject(name, `this isn't a valid .${kind} file.`);
    const zip = readZip(buf, name);
    // Macro / embedded-binary parts are refused even under an innocent extension.
    const ct = zip.text('[Content_Types].xml') || '';
    if (!ct) reject(name, `this isn't a valid .${kind} file.`);
    if (zip.names().some(n => /vbaProject\.bin$|activeX\/|\.(exe|dll|bat|cmd|js|vbs|ps1)$/i.test(n)) || /macroEnabled/i.test(ct)) {
      reject(name, 'the file contains macros or embedded programs, which aren\'t accepted for security reasons. Save a copy without macros (.pptx/.xlsx/.docx).');
    }

    if (kind === 'pptx') {
      const deck = extractPptx(zip, name);
      const images = [];
      // Biggest pictures first (photos / product shots over icons & bullets).
      const ranked = [...deck.media.entries()].sort((a, b) => b[1].area - a[1].area);
      for (const [path, info] of ranked) {
        if (images.length >= FILE_LIMITS.maxExtractedImages) break;
        const bytes = zip.read(path, 15 * MB);
        if (!bytes) continue;
        const img = await normalizeImage(bytes, { maxSide: 1600, minSide: 96 });
        if (!img) continue;
        images.push({ name: `${name} / ${path.replace(/^.*\//, '')}`, data: img.data, mimeType: img.mimeType, slides: [...info.slides].sort((a, b) => a - b), media: path });
      }
      const slides = deck.slides.map(s => ({
        number: s.number, hidden: s.hidden, title: s.title, subtitle: s.subtitle,
        content: pptxSlideText(s).slice(0, 4000),
      }));
      return {
        doc: {
          ...base, digest: pptxDigest(deck).slice(0, FILE_LIMITS.digestChars),
          meta: { slides: deck.totalSlides, theme: deck.theme, aspect: Math.round(deck.aspect * 100) / 100 },
          deck: { slides, theme: deck.theme },
        },
        images,
      };
    }
    if (kind === 'xlsx') {
      const x = extractXlsx(zip, name);
      return {
        doc: { ...base, digest: xlsxDigest(x).slice(0, FILE_LIMITS.digestChars), meta: { sheets: x.sheets.map(s => ({ name: s.name, rows: s.totalRows, cols: s.cols })) }, tables: x.sheets.filter(s => s.rows.length).slice(0, 6).map(s => ({ name: s.name, rows: s.rows.slice(0, 120) })) },
        images: [],
      };
    }
    const d = extractDocx(zip, name);
    const images = [];
    for (const n of zip.names().filter(p => /^word\/media\/.+\.(png|jpe?g|gif|webp)$/i.test(p)).slice(0, 8)) {
      if (images.length >= 4) break;
      const bytes = zip.read(n, 15 * MB);
      const img = bytes && await normalizeImage(bytes, { maxSide: 1600, minSide: 160 });
      if (img) images.push({ name: `${name} / ${n.replace(/^.*\//, '')}`, data: img.data, mimeType: img.mimeType });
    }
    return { doc: { ...base, digest: d.text.slice(0, FILE_LIMITS.digestChars), meta: {} }, images };
  }

  // Text-like files.
  if (buf.length > FILE_LIMITS.textBytes) reject(name, `text and CSV files can be up to ${FILE_LIMITS.textBytes / MB}MB.`);
  if (magic !== 'unknown') reject(name, `the contents don't match the .${ext} extension.`);
  const text = decodeUtf8(buf, name);
  if (!text.trim()) reject(name, 'the file is empty.');
  if (kind === 'json') {
    let parsed;
    try { parsed = JSON.parse(text); } catch { reject(name, 'the JSON is invalid.'); }
    return { doc: { ...base, digest: JSON.stringify(parsed, null, 1).slice(0, FILE_LIMITS.digestChars), meta: {} }, images: [] };
  }
  if (kind === 'csv') {
    const rows = parseCsv(text, ext === 'tsv' ? '\t' : null);
    const totalRows = text.split(/\r?\n/).filter(l => l.trim()).length;
    const digest = `Table: ${totalRows} row(s)${rows.length < totalRows ? `, first ${rows.length} shown` : ''}\n${rows.map(r => r.join(' | ')).join('\n')}`;
    return { doc: { ...base, digest: digest.slice(0, FILE_LIMITS.digestChars), meta: { rows: totalRows }, tables: [{ name, rows: rows.slice(0, 120) }] }, images: [] };
  }
  return { doc: { ...base, digest: text.slice(0, FILE_LIMITS.digestChars), meta: {} }, images: [] };
}

/** Validates + normalizes one user-uploaded image. Returns { data, mimeType } or throws. */
export async function ingestImage(att) {
  const name = String(att?.name || 'image').slice(0, 255);
  const ext = extensionOf(name);
  if (REFUSED[ext]) reject(name, REFUSED[ext]);
  const buf = decodeDataUrl(att.data);
  if (!buf || !buf.length) reject(name, 'the image is empty or could not be read.');
  if (buf.length > FILE_LIMITS.imageBytes) reject(name, `images can be up to ${FILE_LIMITS.imageBytes / MB}MB.`);
  const magic = sniff(buf);
  if (!['png', 'jpeg', 'gif', 'webp'].includes(magic)) reject(name, 'this isn\'t a supported image (PNG, JPG, WEBP or GIF).');
  // Light re-encode only when needed: keep the user's bytes when they're
  // already a sane size so logos keep their exact pixels.
  const img = await normalizeImage(buf, { maxSide: 2048 });
  if (!img) reject(name, 'the image is damaged and couldn\'t be opened.');
  const mimeType = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[magic];
  const keepOriginal = buf.length <= 5 * MB && magic !== 'gif';
  return keepOriginal ? { data: `data:${mimeType};base64,${buf.toString('base64')}`, mimeType } : { data: img.data, mimeType: img.mimeType };
}

const isDocument = (a) => a?.type === 'document' || (a?.type !== 'image' && EXT_KIND[extensionOf(a?.name)] && EXT_KIND[extensionOf(a?.name)] !== 'image');

/**
 * Validates and processes a whole brief's attachments.
 * Returns {
 *   stored:  attachments array to persist in messages.attachments — user images
 *            first (their UPLOAD indices are unchanged), then images extracted
 *            from documents, then document descriptions (no data),
 *   pdfs:    transient PDF payloads for the source-analysis call,
 *   documents: the document descriptions,
 * }
 */
export async function ingestAttachments(attachments = []) {
  const images = attachments.filter(a => !isDocument(a));
  const docs = attachments.filter(isDocument);
  if (images.length > FILE_LIMITS.maxImages) throw new FileRejected(`Too many images (max ${FILE_LIMITS.maxImages}).`);
  if (docs.length > FILE_LIMITS.maxDocuments) throw new FileRejected(`Too many files (max ${FILE_LIMITS.maxDocuments} documents per brief).`);
  const docBytes = docs.reduce((n, d) => n + (typeof d.data === 'string' ? d.data.length * 0.75 : 0), 0);
  if (docBytes > FILE_LIMITS.totalDocumentBytes) throw new FileRejected(`Your files add up to more than ${FILE_LIMITS.totalDocumentBytes / MB}MB. Remove some or upload smaller versions.`);
  if (docs.filter(d => d.category === 'redesign').length > 1) throw new FileRejected('Only one deck can be redesigned at a time. Mark the others as "Use content".');

  const storedImages = [];
  for (const a of images) {
    const { data, mimeType } = await ingestImage(a);
    storedImages.push({ type: 'image', name: String(a.name || 'image').slice(0, 255), data, mimeType, ...(a.category ? { category: String(a.category).slice(0, 30) } : {}) });
  }

  const documents = []; const extracted = []; const pdfs = [];
  // Per-file picture caps: a deck being redesigned needs its pictures (they're
  // tied to their slides, so each layout call only sees its own); content
  // files' pictures are offered to the slides the plan assigns them to;
  // inspiration pictures guide EVERY slide's look, so keep those few.
  const PER_DOC_IMAGES = { redesign: FILE_LIMITS.maxExtractedImages, content: 6, inspiration: 4 };
  for (const a of docs) {
    const r = await ingestDocument(a);
    documents.push(r.doc);
    if (r.pdf) pdfs.push(r.pdf);
    let taken = 0;
    for (const img of r.images) {
      if (extracted.length >= FILE_LIMITS.maxExtractedImages || taken >= PER_DOC_IMAGES[r.doc.purpose]) break;
      taken++;
      // Inspiration files' pictures guide the LOOK (moodboard); deck pictures
      // stay tied to the slides they came from; everything else is content.
      extracted.push({
        type: 'image', name: img.name.slice(0, 255), data: img.data, mimeType: img.mimeType,
        category: r.doc.purpose === 'inspiration' ? 'moodboard' : 'document',
        source_doc: r.doc.name,
        ...(r.doc.purpose === 'redesign' && img.slides ? { slides: img.slides, media: img.media } : {}),
      });
    }
  }
  // `tables` (raw rows, used only by the deterministic fallback analysis) are
  // not persisted; the digest already carries the same content as text.
  return { stored: [...storedImages, ...extracted, ...documents.map(({ tables, ...d }) => d)], documents, pdfs };
}

/** Split a stored attachments array into image uploads and document descriptions. */
export function splitStored(attachments = []) {
  return {
    uploads: attachments.filter(a => a?.data && a.type !== 'document'),
    documents: attachments.filter(a => a?.type === 'document'),
  };
}
