import { AsyncLocalStorage } from 'async_hooks';
import { CLAUDE_MODEL, DEFAULT_CLAUDE_MODEL } from './claudeModel.js';
import { getDb } from '../database.js';
import { logger } from './logger.js';

// ─── Actual AI cost per call ────────────────────────────────────────────────
// Every Claude / image-model call writes one row to `ai_costs` with the token
// counts the provider billed and the dollar cost from the price table below,
// tagged with the user, deck, slide and operation it belongs to. The admin
// Costs tab (GET /api/admin/costs) and scripts/cost-report.js read it.
//
// Context (deck / slide / operation) flows through AsyncLocalStorage, so call
// sites don't thread ids around: routes wrap their background job in
// `withCostContext({ presentationId, operation })`, buildLayeredSlide adds the
// slide index, and every call made underneath is attributed automatically.
//
// Prices are USD per million tokens. Anthropic: official list prices for the
// models in use. Image models: OpenAI hasn't published gpt-image-2.5-flare
// pricing at the time of writing, so it uses gpt-image-2 rates and its rows
// are flagged `estimated` — override with the env vars below once known.

const envNum = (name, dflt) => {
  const v = parseFloat(process.env[name]);
  return Number.isFinite(v) ? v : dflt;
};

export const CLAUDE_PRICES = {
  // input, output, cache write (5-min ephemeral = 1.25 × input), cache read (0.1 × input)
  'claude-sonnet-4-6': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  // The default model (CLAUDE_MODEL); cache read is 0.1 × input as well.
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.20 },
  // Possible server-side refusal-fallback model for Sonnet 5.5 requests.
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.20 },
};
const WEB_SEARCH_PER_REQUEST = 0.01; // $10 per 1,000 searches

export const IMAGE_PRICES = {
  'gpt-image-2.5-flare': {
    textInput: envNum('PRICE_FLARE_TEXT_INPUT', 5),
    imageInput: envNum('PRICE_FLARE_IMAGE_INPUT', 8),
    output: envNum('PRICE_FLARE_OUTPUT', 30),
    estimated: !process.env.PRICE_FLARE_OUTPUT,
  },
  'gpt-image-2': {
    textInput: envNum('PRICE_GPT_IMAGE_2_TEXT_INPUT', 5),
    imageInput: envNum('PRICE_GPT_IMAGE_2_IMAGE_INPUT', 8),
    output: envNum('PRICE_GPT_IMAGE_2_OUTPUT', 30),
    estimated: !process.env.PRICE_GPT_IMAGE_2_OUTPUT,
  },
};
// Gemini image edits (legacy flat slides) are billed per image.
const GEMINI_IMAGE_PER_CALL = envNum('PRICE_GEMINI_IMAGE', 0.039);

const store = new AsyncLocalStorage();

/** Run fn with cost attribution; nested contexts inherit and override fields. */
export function withCostContext(ctx, fn) {
  const parent = store.getStore() || {};
  return store.run({ ...parent, ...Object.fromEntries(Object.entries(ctx).filter(([, v]) => v !== undefined)) }, fn);
}

export function costContext() {
  return store.getStore() || {};
}

export function claudeCost(model, usage = {}) {
  // Responses may name a dated snapshot of the model: match by prefix.
  const key = Object.keys(CLAUDE_PRICES).find(k => model === k || String(model).startsWith(`${k}-`));
  const p = CLAUDE_PRICES[key] || CLAUDE_PRICES[CLAUDE_MODEL] || CLAUDE_PRICES[DEFAULT_CLAUDE_MODEL];
  const input = usage.input_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const output = usage.output_tokens || 0;
  const searches = usage.server_tool_use?.web_search_requests || 0;
  return (input * p.input + cacheWrite * p.cacheWrite + cacheRead * p.cacheRead + output * p.output) / 1e6
    + searches * WEB_SEARCH_PER_REQUEST;
}

export function imageCost(model, usage = {}) {
  const p = IMAGE_PRICES[model] || IMAGE_PRICES['gpt-image-2'];
  const details = usage.input_tokens_details || {};
  const imageIn = details.image_tokens || 0;
  const textIn = details.text_tokens ?? Math.max(0, (usage.input_tokens || 0) - imageIn);
  return (textIn * p.textInput + imageIn * p.imageInput + (usage.output_tokens || 0) * p.output) / 1e6;
}

function insert(row) {
  try {
    const ctx = costContext();
    getDb().prepare(`
      INSERT INTO ai_costs (user_id, presentation_id, slide_index, operation, provider, model, call,
        input_tokens, cache_write_tokens, cache_read_tokens, output_tokens, image_input_tokens,
        web_searches, images, cost_usd, estimated, duration_ms, meta)
      VALUES (@user_id, @presentation_id, @slide_index, @operation, @provider, @model, @call,
        @input_tokens, @cache_write_tokens, @cache_read_tokens, @output_tokens, @image_input_tokens,
        @web_searches, @images, @cost_usd, @estimated, @duration_ms, @meta)
    `).run({
      user_id: row.userId ?? ctx.userId ?? null,
      presentation_id: row.presentationId ?? ctx.presentationId ?? null,
      slide_index: row.slideIndex ?? ctx.slideIndex ?? null,
      operation: row.operation ?? ctx.operation ?? 'other',
      provider: row.provider,
      model: row.model,
      call: row.call,
      input_tokens: row.input_tokens || 0,
      cache_write_tokens: row.cache_write_tokens || 0,
      cache_read_tokens: row.cache_read_tokens || 0,
      output_tokens: row.output_tokens || 0,
      image_input_tokens: row.image_input_tokens || 0,
      web_searches: row.web_searches || 0,
      images: row.images || 0,
      cost_usd: Math.round(row.cost_usd * 1e6) / 1e6,
      estimated: row.estimated ? 1 : 0,
      duration_ms: row.duration_ms ?? null,
      meta: row.meta ? JSON.stringify(row.meta) : null,
    });
  } catch (err) {
    // Cost logging must never break generation.
    logger.warn('ai cost record failed', { errorMessage: err.message });
  }
}

/** One Claude Messages API response (streamed or not). */
export function recordClaudeCall({ call, model = CLAUDE_MODEL, usage, durationMs = null, userId, operation, meta } = {}) {
  if (!usage) return;
  insert({
    provider: 'anthropic', model, call, userId, operation,
    input_tokens: usage.input_tokens,
    cache_write_tokens: usage.cache_creation_input_tokens,
    cache_read_tokens: usage.cache_read_input_tokens,
    output_tokens: usage.output_tokens,
    web_searches: usage.server_tool_use?.web_search_requests,
    cost_usd: claudeCost(model, usage),
    duration_ms: durationMs,
    meta,
  });
}

/** One OpenAI image generation/edit (usage = the response's `usage`). */
export function recordImageCall({ call, model, usage, durationMs = null, userId, operation, meta } = {}) {
  if (!usage) return; // mock / test providers report no usage → no cost
  const details = usage.input_tokens_details || {};
  insert({
    provider: 'openai', model, call, userId, operation,
    input_tokens: details.text_tokens ?? Math.max(0, (usage.input_tokens || 0) - (details.image_tokens || 0)),
    image_input_tokens: details.image_tokens || 0,
    output_tokens: usage.output_tokens,
    images: 1,
    cost_usd: imageCost(model, usage),
    estimated: (IMAGE_PRICES[model] || IMAGE_PRICES['gpt-image-2']).estimated,
    duration_ms: durationMs,
    meta,
  });
}

/** One Gemini image edit (flat price per image). */
export function recordGeminiImageCall({ call, model, durationMs = null, userId, operation, slideIndex, meta } = {}) {
  insert({ provider: 'google', model, call, userId, operation, slideIndex, images: 1, cost_usd: GEMINI_IMAGE_PER_CALL, estimated: true, duration_ms: durationMs, meta });
}
