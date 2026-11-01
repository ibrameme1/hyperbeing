import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import opentype from 'opentype.js';
import { FONT_NAMES, setTextMeasurer } from './slideLayout.js';
import { logger } from './logger.js';

// ─── Real fonts on the server ───────────────────────────────────────────────
// The curated slide fonts (slideLayout.FONTS) ship as TTFs via the
// @expo-google-fonts/* npm packages — the same Google Fonts the web renderer
// loads. Two consumers:
//   1. The flattened preview (librsvg via sharp) — we point fontconfig at the
//      font directories so previews, thumbnails and the image Claude reviews
//      use the real typefaces instead of a fallback with different widths.
//   2. The text-fit checker — exact advance widths from the font files
//      replace the per-font average-width estimate, so "does it fit" and the
//      line breaks match what the browser renders.
// Importing this module has the side effect of configuring both; it must be
// imported before the first text render (layoutPreview.js does).

const require = createRequire(import.meta.url);
const PACKAGE_FOR = Object.fromEntries(FONT_NAMES.map(name => [name, `@expo-google-fonts/${name.toLowerCase().replace(/\s+/g, '-')}`]));

const files = new Map(); // family → [{ weight, italic, file }]
const dirs = [];
for (const [family, pkg] of Object.entries(PACKAGE_FOR)) {
  let dir;
  try { dir = path.dirname(require.resolve(`${pkg}/package.json`)); } catch { continue; }
  const variants = [];
  for (const entry of fs.readdirSync(dir)) {
    // Two package layouts: "400Regular/Font_400Regular.ttf" or flat "Font_400Regular.ttf".
    const sub = /^(\d{3})[A-Za-z]*(_Italic)?$/.exec(entry);
    if (sub) {
      const ttf = fs.readdirSync(path.join(dir, entry)).find(f => f.endsWith('.ttf'));
      if (ttf) variants.push({ weight: parseInt(sub[1], 10), italic: !!sub[2], file: path.join(dir, entry, ttf) });
      continue;
    }
    const flat = /_(\d{3})[A-Za-z]*(_Italic)?\.ttf$/.exec(entry);
    if (flat) variants.push({ weight: parseInt(flat[1], 10), italic: !!flat[2], file: path.join(dir, entry) });
  }
  if (variants.length) { files.set(family, variants); dirs.push(dir); }
}

// fontconfig: a private config listing the bundled font dirs (plus the
// system fonts as fallback). sharp's libvips reads FONTCONFIG_FILE when it
// first renders text.
try {
  const confDir = path.join(os.tmpdir(), 'hb-fontconfig');
  fs.mkdirSync(path.join(confDir, 'cache'), { recursive: true });
  const conf = `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>
${dirs.map(d => `<dir>${d}</dir>`).join('\n')}
<dir>/usr/share/fonts</dir><dir>/usr/local/share/fonts</dir>
<cachedir>${path.join(confDir, 'cache')}</cachedir>
</fontconfig>`;
  fs.writeFileSync(path.join(confDir, 'fonts.conf'), conf);
  if (!process.env.FONTCONFIG_FILE) process.env.FONTCONFIG_FILE = path.join(confDir, 'fonts.conf');
} catch (err) {
  logger.warn('fontconfig setup failed — previews will use fallback fonts', { errorMessage: err.message });
}

const parsed = new Map(); // file → opentype.Font | null
function fontFor(family, weight = 400, italic = false) {
  const variants = files.get(family);
  if (!variants) return null;
  const pool = variants.filter(v => v.italic === italic).length ? variants.filter(v => v.italic === italic) : variants;
  const best = pool.reduce((a, b) => (Math.abs(b.weight - weight) < Math.abs(a.weight - weight) ? b : a));
  if (!parsed.has(best.file)) {
    try {
      const buf = fs.readFileSync(best.file);
      parsed.set(best.file, opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
    } catch (err) {
      logger.warn('font parse failed', { file: best.file, errorMessage: err.message });
      parsed.set(best.file, null);
    }
  }
  return parsed.get(best.file);
}

// Width in px of `text` set in the layer's font. Returns null when the font
// isn't available (the estimator is used instead).
export function measureWithFont(layer, text) {
  const font = fontFor(layer.font, layer.weight, layer.italic);
  if (!font) return null;
  const t = layer.uppercase ? text.toUpperCase() : text;
  const advance = font.getAdvanceWidth(t, layer.size, { kerning: true });
  return advance + layer.letter_spacing * layer.size * [...t].length;
}

export function availableFonts() {
  return [...files.keys()];
}

setTextMeasurer(measureWithFont);
