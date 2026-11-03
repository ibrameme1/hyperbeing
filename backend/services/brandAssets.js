import { assertPublicUrl } from './urlGuard.js';
import { normalizeReference } from './layerImaging.js';
import { logger } from './logger.js';

// ─── Brand logo fetching ────────────────────────────────────────────────────
// When a slide features a brand the user didn't upload a logo for, and it is
// not a globally famous brand the image model already knows, we fetch the
// brand's own logo from its website and attach it as a reference image (and,
// for logo layers, place it natively). Domains come from Claude's layout, i.e.
// they are model output — so every hop goes through the SSRF guard with manual
// redirect re-validation, exactly like POST /fetch-url.

const UA = 'Mozilla/5.0 (compatible; HyperBeing/1.0; +https://hyperbeing.co)';
const MAX_BYTES = 3 * 1024 * 1024;
const cache = new Map(); // domain → Promise<dataUrl|null> (process lifetime)

async function safeFetch(url, { accept } = {}) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, {
      headers: { 'User-Agent': UA, ...(accept ? { Accept: accept } : {}) },
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).href;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = parseInt(res.headers.get('content-length') || '0', 10);
    if (len > MAX_BYTES) throw new Error('too large');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('too large');
    return { buf, type: (res.headers.get('content-type') || '').split(';')[0].trim(), url: current };
  }
  throw new Error('too many redirects');
}

// Candidate logo URLs from a homepage's <head>, best first: SVG icons and
// explicit logo images, then apple-touch-icon (≥180px), then large icons.
export function logoCandidatesFromHtml(html, baseUrl) {
  const out = [];
  const head = String(html).slice(0, 200_000);
  const linkRe = /<link\b[^>]*>/gi;
  const attr = (tag, name) => (new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag) || [])[1];
  for (const tag of head.match(linkRe) || []) {
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    const href = attr(tag, 'href');
    if (!href || !rel.includes('icon')) continue;
    const type = (attr(tag, 'type') || '').toLowerCase();
    const sizes = parseInt((attr(tag, 'sizes') || '0').split('x')[0], 10) || 0;
    let score = sizes;
    if (type.includes('svg') || href.endsWith('.svg')) score = 1000;
    else if (rel.includes('apple-touch-icon')) score = Math.max(180, sizes);
    out.push({ href, score });
  }
  // <img ... class/alt/src containing "logo"> inside the page header.
  for (const tag of head.match(/<img\b[^>]*>/gi) || []) {
    if (!/logo/i.test(tag)) continue;
    const src = attr(tag, 'src');
    if (src && !src.startsWith('data:')) out.push({ href: src, score: src.endsWith('.svg') ? 900 : 500 });
  }
  return out
    .sort((a, b) => b.score - a.score)
    .map(c => { try { return new URL(c.href, baseUrl).href; } catch { return null; } })
    .filter(Boolean)
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .slice(0, 5);
}

async function fetchLogoUncached(domain) {
  const base = `https://${domain}/`;
  const candidates = [];
  try {
    const page = await safeFetch(base, { accept: 'text/html' });
    candidates.push(...logoCandidatesFromHtml(page.buf.toString('utf8'), page.url));
  } catch (err) {
    logger.info('brand homepage fetch failed', { domain, errorMessage: err.message });
  }
  candidates.push(`https://${domain}/apple-touch-icon.png`);
  // Last resort: Google's favicon service (up to 256px for most sites).
  candidates.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`);

  for (const url of candidates) {
    try {
      const { buf, type } = await safeFetch(url, { accept: 'image/*' });
      const mime = type.startsWith('image/') ? type : (url.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
      const png = await normalizeReference(`data:${mime};base64,${buf.toString('base64')}`, 512);
      if (!png) continue;
      // Reject tiny favicons — a 16px icon is worse than the model's own approximation.
      const size = Buffer.from(png.split(',')[1], 'base64').readUInt32BE(16);
      if (size < 64) continue;
      logger.info('brand logo fetched', { domain, source: url.slice(0, 120) });
      return png;
    } catch { /* try next */ }
  }
  logger.info('brand logo not found', { domain });
  return null;
}

// Returns a PNG data URL for the brand's logo, or null.
export function fetchBrandLogo(domain) {
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return Promise.resolve(null);
  if (!cache.has(domain)) cache.set(domain, fetchLogoUncached(domain).catch(() => null));
  return cache.get(domain);
}
