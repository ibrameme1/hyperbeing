import { jsonrepair } from 'jsonrepair';

// Which Claude model the backend talks to, and the request differences that
// come with it. Everything is driven by CLAUDE_MODEL (default
// claude-sonnet-5-5; set CLAUDE_MODEL=claude-sonnet-4-6 to roll back — every
// prompt was originally tuned on it and it keeps its exact old requests).
// The Sonnet 5.5 request shape applies to every call site at once:
//
//  - Forced tool calls (`tool_choice: {type:'tool'}`) are rejected (400) by
//    the newest models. They get `tool_choice: auto` (one call, no parallel
//    calls) plus a one-line instruction appended AFTER the cache breakpoint,
//    so the cached prefix is unchanged between the warm-up and real calls.
//  - Thinking is on by default there and billed as output; our calls are
//    structured one-shots that were designed without it, so it is turned off
//    (`between_tools` on Sonnet 5.5).
//  - The cache warm-up can use max_tokens: 0 (only forced tool_choice made
//    that impossible).
//  - Refusals (`stop_reason: 'refusal'`) are routed to Anthropic's
//    server-side fallback model ("default" routing) unless
//    CLAUDE_REFUSAL_FALLBACK=off. The response's own `model` is what gets
//    priced, so a fallback is costed correctly.
//
// Older models (e.g. claude-sonnet-4-6) get exactly the requests they got
// before this module existed.

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5';
export const CLAUDE_MODEL = (process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL).trim();

// Models that reject forced tool_choice ("any"/"tool").
const AUTO_TOOL_MODELS = /^claude-(sonnet-5-5|opus-5-5|fable-5-1|mythos-5-1)\b/;
export const usesAutoTools = (model = CLAUDE_MODEL) => AUTO_TOOL_MODELS.test(model);

/** tool_choice for a call that must answer with exactly one tool call. */
export function toolChoice(name, model = CLAUDE_MODEL) {
  return usesAutoTools(model) ? { type: 'auto', disable_parallel_tool_use: true } : { type: 'tool', name };
}

/** Text to append to the LAST user text block (after any cache breakpoint). */
export function toolInstruction(name, model = CLAUDE_MODEL) {
  return usesAutoTools(model) ? `\n\nAnswer only by calling the ${name} tool exactly once, with no text before or after it.` : '';
}

/** Appends toolInstruction to the last text block of a user content array (returns a new array). */
export function withToolInstruction(content, name, model = CLAUDE_MODEL) {
  const extra = toolInstruction(name, model);
  if (!extra) return content;
  if (typeof content === 'string') return content + extra;
  const out = [...content];
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i]?.type === 'text') { out[i] = { ...out[i], text: out[i].text + extra }; return out; }
  }
  out.push({ type: 'text', text: extra.trim() });
  return out;
}

/**
 * Extra top-level params for every call: thinking off where the model would
 * otherwise think (and bill it as output). Empty for older models.
 */
export function modelParams(model = CLAUDE_MODEL) {
  if (/^claude-sonnet-5-5\b/.test(model)) return { thinking: { type: 'between_tools' } };
  return {};
}

/** Request options (headers) + body fields for the refusal fallback. */
export function fallbackParams(model = CLAUDE_MODEL) {
  if (process.env.CLAUDE_REFUSAL_FALLBACK === 'off') return { body: {}, options: {} };
  if (!/^claude-sonnet-5-5\b/.test(model)) return { body: {}, options: {} };
  return { body: { fallbacks: 'default' }, options: { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } } };
}

/** max_tokens for a cache warm-up request. */
export const warmupMaxTokens = (model = CLAUDE_MODEL) => (usesAutoTools(model) ? 0 : 1);

/** The web search tool definition the model supports. */
export function webSearchTool(maxUses, model = CLAUDE_MODEL) {
  return usesAutoTools(model)
    ? { type: 'web_search_20260209', name: 'web_search', max_uses: maxUses }
    : { type: 'web_search_20250305', name: 'web_search', max_uses: maxUses };
}

/**
 * The tool call of a structured response, or null. A newest-model response
 * may carry text next to it; a refusal or a missing call returns null so the
 * caller's existing failure path (refund) runs.
 */
export function toolInput(response, name) {
  if (!response || response.stop_reason === 'refusal') return null;
  const block = (response.content || []).find(b => b.type === 'tool_use' && (!name || b.name === name));
  return block?.input ?? null;
}

/** The model that actually answered (a fallback may differ from the request). */
export const answeredBy = (response) => response?.model || CLAUDE_MODEL;

/**
 * Fills in the model, tool_choice, thinking and fallback fields for one
 * request. `tool` names the forced tool (or null for free text); the
 * instruction is appended to the last user message's last text block.
 * Returns [body, options] for client.messages.create/stream.
 */
export function claudeRequest(body, { tool = null, model = CLAUDE_MODEL } = {}) {
  const fb = fallbackParams(model);
  const out = { ...body, model, ...modelParams(model), ...fb.body };
  if (tool) {
    out.tool_choice = toolChoice(tool, model);
    const msgs = [...(out.messages || [])];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { msgs[i] = { ...msgs[i], content: withToolInstruction(msgs[i].content, tool, model) }; break; }
    }
    out.messages = msgs;
  }
  return [out, fb.options];
}

/**
 * Streams one structured (tool) answer WITHOUT the SDK's MessageStream helper.
 *
 * Why: @anthropic-ai/sdk 0.36's MessageStream re-parses the partial tool
 * JSON after every chunk with its bundled partial-JSON parser. With
 * eager_input_streaming (Sonnet 5.5) chunks end at arbitrary characters and
 * that parser intermittently throws ("Unexpected non-whitespace character
 * after JSON") even though the final JSON is valid — which failed ~1 in 3
 * layout calls in production. Here the raw events are read, the tool JSON is
 * accumulated as text, `onJson(sofar)` is called after each chunk (the
 * caller's own tolerant parser handles partials), and the JSON is parsed once
 * at the end (jsonrepair as a fallback).
 *
 * Returns a Message-shaped object ({ model, usage, stop_reason, stop_details,
 * content }) so accounting and toolInput() work unchanged.
 */
export async function streamToolCall(client, [body, options], { onJson = null } = {}) {
  const events = await client.messages.create({ ...body, stream: true }, options);
  const usage = {};
  const merge = (u) => { for (const [k, v] of Object.entries(u || {})) if (v !== null && v !== undefined) usage[k] = v; };
  const blocks = new Map(); // index → { type, name, json, text }
  let model = body.model; let stopReason = null; let stopDetails = null;
  for await (const ev of events) {
    if (ev.type === 'message_start') { model = ev.message?.model || model; merge(ev.message?.usage); }
    else if (ev.type === 'content_block_start') {
      blocks.set(ev.index, { type: ev.content_block?.type, name: ev.content_block?.name, json: '', text: ev.content_block?.text || '' });
    } else if (ev.type === 'content_block_delta') {
      const b = blocks.get(ev.index);
      if (!b) continue;
      if (ev.delta?.type === 'input_json_delta') {
        b.json += ev.delta.partial_json || '';
        if (onJson && b.type === 'tool_use') {
          try { onJson(b.json); } catch { /* partial callbacks must never break the stream */ }
        }
      } else if (ev.delta?.type === 'text_delta') b.text += ev.delta.text || '';
    } else if (ev.type === 'message_delta') {
      stopReason = ev.delta?.stop_reason ?? stopReason;
      stopDetails = ev.delta?.stop_details ?? stopDetails;
      merge(ev.usage);
    }
  }
  const content = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => {
    if (b.type !== 'tool_use') return { type: b.type, text: b.text };
    let input = null;
    const raw = b.json.trim() || '{}';
    try { input = JSON.parse(raw); } catch {
      try { input = JSON.parse(jsonrepair(raw)); } catch { input = null; }
    }
    return { type: 'tool_use', name: b.name, input };
  }).filter(b => b.type !== 'tool_use' || b.input);
  return { model, usage, stop_reason: stopReason, stop_details: stopDetails, content };
}
