// STEPS 1-2 of the img2pptx workflow (triage + measure), automated: one Claude
// vision call per slide image returns the measurements as JSON, in source-image
// pixels, which spec.js normalizes and builder.js renders.
//
// The human version of this step is a person reading probe.py output off a
// numbered grid overlay. The model does the same job from the pixels directly —
// which is why the system prompt (prompts/pptx_triage_system.md) is a condensed
// form of WAYS_OF_WORKING.md's triage rules rather than a new invention. Edit
// them together.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { jsonrepair } from 'jsonrepair';
import { recordTokenUsage } from '../stripeService.js';
import { logger } from '../logger.js';
import { metrics } from '../metrics.js';
import { normalizeSpec } from './spec.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MOCK_MODE = !process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'demo';

let client;
if (!MOCK_MODE) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let SYSTEM_PROMPT;
function systemPrompt() {
  if (!SYSTEM_PROMPT) {
    SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, '..', '..', 'prompts', 'pptx_triage_system.md'), 'utf8');
  }
  return SYSTEM_PROMPT;
}

// Same em/en dash policy as every other Claude output in the codebase — the
// analyzer transcribes slide copy, so its strings land in the exported deck.
function sanitizeText(str) {
  return str.replace(/[‒-―−]/g, '-');
}
function sanitizeDeep(value) {
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) value[key] = sanitizeDeep(value[key]);
    return value;
  }
  return value;
}

function parseJSON(raw) {
  const text = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  try { return sanitizeDeep(JSON.parse(text)); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return sanitizeDeep(JSON.parse(match[0])); } catch {}
    try { return sanitizeDeep(JSON.parse(jsonrepair(match[0]))); } catch {}
  }
  return null;
}

const MEDIA_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/**
 * Measures one slide image. Returns a normalized spec, or null when the slide
 * can't be measured (mock mode, API failure, unparseable response) — callers
 * fall back to a full-bleed image slide, which is still a valid export.
 *
 * @param {Buffer} imageBuffer  the slide render
 * @param {{width:number,height:number,format:string}} info  its pixel dimensions
 * @param {{userId?:string, title?:string, hint?:string}} ctx
 */
export async function analyzeSlide(imageBuffer, info, ctx = {}) {
  if (MOCK_MODE) return null;

  const mediaType = MEDIA_TYPES[String(info.format || 'png').toLowerCase()] || 'image/png';
  const t0 = Date.now();

  const brief = [
    `Source image: ${info.width} x ${info.height} pixels. Every coordinate you return is in this pixel grid.`,
    ctx.title ? `Slide title from the deck outline (for context only - transcribe what you SEE, not this): ${ctx.title}` : null,
    ctx.hint ? `Slide role: ${ctx.hint}` : null,
    'Measure this slide and return the JSON object. No commentary.',
  ].filter(Boolean).join('\n');

  let response;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: systemPrompt(),
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBuffer.toString('base64') } },
          { type: 'text', text: brief },
        ],
      }],
    });
  } catch (err) {
    logger.warn('pptx analyze call failed', { errorMessage: err.message });
    return null;
  }

  const durationMs = Date.now() - t0;
  if (ctx.userId) recordTokenUsage(ctx.userId, response.usage?.input_tokens, response.usage?.output_tokens);
  metrics.recordAICall({
    fn: 'analyzeSlideForPptx',
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
    durationMs,
  });

  const raw = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const parsed = parseJSON(raw);
  if (!parsed) {
    logger.warn('pptx analyze returned unparseable json', { durationMs, chars: raw.length });
    return null;
  }
  if (response.stop_reason === 'max_tokens') {
    // A truncated response still parses after jsonrepair, but its tail is
    // guesswork — keep it only if the head produced something usable.
    logger.warn('pptx analyze truncated by max_tokens', { durationMs });
  }

  const spec = normalizeSpec(parsed, info.width, info.height);
  logger.info('pptx slide measured', { durationMs, elements: spec.elements.length });
  return spec;
}

export const analyzerAvailable = !MOCK_MODE;
