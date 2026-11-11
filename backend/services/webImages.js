import Anthropic from '@anthropic-ai/sdk';
import { assertPublicUrl } from './urlGuard.js';
import { normalizeImage } from './fileIngest.js';
import { recordClaudeCall } from './aiCosts.js';
import { claudeRequest, toolInput, answeredBy } from './claudeModel.js';
import { recordTokenUsage } from './stripeService.js';
import { logger } from './logger.js';
import { sanitizeDeep } from './claudeAgent.js';

// ─── Real photos found online (web search ON) ───────────────────────────────
// With the Dashboard's web search toggle on, the outline may ask for a REAL
// photo on a slide (a named landmark, a real product, a public figure, a real
// event) — "web_images":[{query, subject}]. We search an image index, show the
// top candidates to Claude, which picks the one that actually shows the
// subject (or none), then fetch it through the SSRF guard and re-encode it.
// The photo becomes a slide-scoped upload (category 'web'): the slide's
// layout places it as-is or uses it as a reference for a generated layer.
// With web search OFF nothing here runs: the layout describes the subject and
// OpenAI generates it, as before.
//
// Providers: Openverse (default, no key) only returns openly licensed images
// and we ask for licenses that allow commercial use AND modification (we crop
// and resize). Brave Image Search (set BRAVE_SEARCH_API_KEY) covers far more of
// the web, but its results carry NO license information — enable it only if
// you accept that risk. Credits go into the slide's speaker notes either way.

const UA = 'Mozilla/5.0 (compatible; HyperBeing/1.0; +https://hyperbeing.co)';
const MAX_BYTES = 8 * 1024 * 1024;
const MOCK_MODE = !process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'demo';
export const WEB_IMAGES_ENABLED = process.env.WEB_IMAGE_SEARCH !== 'off';
export const MAX_WEB_IMAGES_PER_DECK = 6;
let client;
const getClient = () => (client ||= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

async function safeFetch(url, { accept, maxBytes = MAX_BYTES, headers = {} } = {}) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, {
      headers: { 'User-Agent': UA, ...(accept ? { Accept: accept } : {}), ...headers },
      signal: AbortSignal.timeout(10000),
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).href;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = parseInt(res.headers.get('content-length') || '0', 10);
    if (len > maxBytes) throw new Error('too large');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error('too large');
    return { buf, type: (res.headers.get('content-type') || '').split(';')[0].trim() };
  }
  throw new Error('too many redirects');
}

async function searchOpenverse(query, count) {
  const u = new URL('https://api.openverse.org/v1/images/');
  u.searchParams.set('q', query);
  u.searchParams.set('page_size', String(Math.min(20, count * 3)));
  u.searchParams.set('license_type', 'commercial,modification');
  u.searchParams.set('mature', 'false');
  const { buf } = await safeFetch(u.href, { accept: 'application/json', maxBytes: 2 * 1024 * 1024 });
  const json = JSON.parse(buf.toString('utf8'));
  return (json.results || [])
    .filter(r => r.url && (!r.width || r.width >= 700) && !['svg'].includes(r.filetype))
    .slice(0, count)
    .map(r => ({
      url: r.url, thumbnail: r.thumbnail || r.url, title: r.title || '', landing: r.foreign_landing_url || '',
      credit: r.attribution || `${r.title || 'Photo'}${r.creator ? ` by ${r.creator}` : ''} (${(r.license || '').toUpperCase()} ${r.license_version || ''}, ${r.source || 'Openverse'})`,
      license: r.license ? `CC ${String(r.license).toUpperCase()} ${r.license_version || ''}`.trim() : 'unknown',
    }));
}

async function searchBrave(query, count) {
  const u = new URL('https://api.search.brave.com/res/v1/images/search');
  u.searchParams.set('q', query);
  u.searchParams.set('count', String(Math.min(20, count * 3)));
  u.searchParams.set('safesearch', 'strict');
  const { buf } = await safeFetch(u.href, { accept: 'application/json', maxBytes: 2 * 1024 * 1024, headers: { 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY } });
  const json = JSON.parse(buf.toString('utf8'));
  return (json.results || []).filter(r => r.properties?.url).slice(0, count).map(r => ({
    url: r.properties.url, thumbnail: r.thumbnail?.src || r.properties.url, title: r.title || '', landing: r.url || '',
    credit: `Image: ${r.source || (() => { try { return new URL(r.url).hostname; } catch { return 'web'; } })()}`,
    license: 'unknown (check before publishing)',
  }));
}

export async function searchImages(query, count = 5) {
  return process.env.BRAVE_SEARCH_API_KEY ? searchBrave(query, count) : searchOpenverse(query, count);
}

const PICK_TOOL = {
  name: 'pick_photo',
  description: 'Pick the candidate photo that best shows the subject, or -1 if none does.',
  input_schema: {
    type: 'object',
    properties: {
      choice: { type: 'integer', description: 'Index of the best candidate, or -1 if none truly shows the subject at presentation quality.' },
      reason: { type: 'string' },
    },
    required: ['choice'],
  },
};

async function pickCandidate({ subject, candidates, userId }) {
  if (MOCK_MODE) return 0;
  const content = [{ type: 'text', text: `A presentation slide needs a REAL photo of: ${subject}\nPick the candidate that clearly shows exactly that subject, is sharp, well lit and presentation-worthy (no watermarks, collages, text-heavy images, memes or unrelated subjects). Return -1 if none qualifies; a generated image will be used instead.` }];
  candidates.forEach((c, i) => {
    content.push({ type: 'text', text: `CANDIDATE ${i}: "${String(c.title).slice(0, 120)}"` });
    content.push({ type: 'image', source: { type: 'base64', media_type: c.mimeType, data: c.thumbData.replace(/^data:[^;]+;base64,/, '') } });
  });
  const t0 = Date.now();
  const response = await getClient().messages.create(...claudeRequest({
    max_tokens: 300,
    tools: [PICK_TOOL],
    messages: [{ role: 'user', content }],
  }, { tool: PICK_TOOL.name }));
  recordClaudeCall({ call: 'pick_web_image', model: answeredBy(response), usage: response.usage, durationMs: Date.now() - t0, userId });
  if (userId) { try { recordTokenUsage(userId, response.usage?.input_tokens, response.usage?.output_tokens); } catch { /* accounting never breaks generation */ } }
  const out = sanitizeDeep(toolInput(response, PICK_TOOL.name) || {});
  return Number.isInteger(out.choice) ? out.choice : -1;
}

/**
 * Finds one real photo for `subject`. Returns
 * { data, mimeType, credit, license, source_url, subject } or null (the caller
 * then lets the image model generate it).
 */
export async function findWebImage({ query, subject, userId = null }) {
  if (!WEB_IMAGES_ENABLED || !query) return null;
  try {
    const results = await searchImages(String(query).slice(0, 120), 5);
    // Small previews for the pick (cheap tokens); only the winner is fetched full size.
    const candidates = [];
    await Promise.all(results.map(async (r, i) => {
      try {
        const { buf } = await safeFetch(r.thumbnail, { accept: 'image/*' });
        const img = await normalizeImage(buf, { maxSide: 384 });
        if (img) candidates[i] = { ...r, thumbData: img.data, mimeType: img.mimeType };
      } catch { /* skip candidate */ }
    }));
    const usable = candidates.filter(Boolean);
    if (!usable.length) return null;
    const choice = await pickCandidate({ subject: subject || query, candidates: usable, userId });
    const pick = usable[choice];
    if (!pick) { logger.info('web image: no suitable candidate', { query }); return null; }
    const { buf } = await safeFetch(pick.url, { accept: 'image/*' });
    const img = await normalizeImage(buf, { maxSide: 1600, minSide: 500 });
    if (!img) return null;
    logger.info('web image found', { query, license: pick.license });
    return { data: img.data, mimeType: img.mimeType, credit: pick.credit, license: pick.license, source_url: pick.landing || pick.url, subject: subject || query };
  } catch (err) {
    logger.warn('web image search failed', { query, errorMessage: err.message });
    return null;
  }
}
