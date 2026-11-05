import { describe, it, expect } from 'vitest';
import { CLAUDE_MODEL, DEFAULT_CLAUDE_MODEL, claudeRequest, toolChoice, toolInput, usesAutoTools, warmupMaxTokens, modelParams, fallbackParams } from '../services/claudeModel.js';
import { claudeCost } from '../services/aiCosts.js';

const img = (n) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: `x${n}` } });
const cached = (b) => ({ ...b, cache_control: { type: 'ephemeral' } });

describe('claudeModel: per-model request shape', () => {
  it('defaults to Sonnet 5.5 (CLAUDE_MODEL unset) and prices unknown models at the default rates', () => {
    expect(DEFAULT_CLAUDE_MODEL).toBe('claude-sonnet-5-5');
    if (!process.env.CLAUDE_MODEL) expect(CLAUDE_MODEL).toBe('claude-sonnet-5-5');
    expect(claudeCost('some-future-model', { output_tokens: 1e6 })).toBeCloseTo(10);
  });

  it('keeps the exact forced tool call for Sonnet 4.6 (rollback via CLAUDE_MODEL)', () => {
    const [body, options] = claudeRequest({ max_tokens: 10, messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] }, { tool: 'submit_x', model: 'claude-sonnet-4-6' });
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'submit_x' });
    expect(body.messages[0].content[0].text).toBe('hi');
    expect(body.thinking).toBeUndefined();
    expect(body.fallbacks).toBeUndefined();
    expect(options).toEqual({});
    expect(warmupMaxTokens('claude-sonnet-4-6')).toBe(1);
  });

  it('uses auto tool choice + an instruction after the cache breakpoint on Sonnet 5.5', () => {
    const m = 'claude-sonnet-5-5';
    expect(usesAutoTools(m)).toBe(true);
    expect(toolChoice('submit_x', m)).toEqual({ type: 'auto', disable_parallel_tool_use: true });
    expect(modelParams(m)).toEqual({ thinking: { type: 'between_tools' } });
    expect(warmupMaxTokens(m)).toBe(0);
    const [body] = claudeRequest({ max_tokens: 10, messages: [{ role: 'user', content: [img(1), cached(img(2)), { type: 'text', text: 'slide brief' }, img(3)] }] }, { tool: 'submit_x', model: m });
    const content = body.messages[0].content;
    expect(content[2].text).toMatch(/^slide brief\n\nAnswer only by calling the submit_x tool/);
    expect(content[1]).toEqual(cached(img(2))); // cached prefix untouched
    expect(content[3]).toEqual(img(3));
  });

  it('warm-up and real layout call share an identical cached prefix on Sonnet 5.5', () => {
    const m = 'claude-sonnet-5-5';
    const prefix = { system: [cached({ type: 'text', text: 'library' })], tools: [{ name: 'submit_slide_layout', input_schema: { type: 'object' } }] };
    const refs = [img(1), cached(img(2))];
    const [warm] = claudeRequest({ max_tokens: 0, ...prefix, messages: [{ role: 'user', content: [...refs, { type: 'text', text: 'Cache warm-up: no slide yet.' }] }] }, { tool: 'submit_slide_layout', model: m });
    const [real] = claudeRequest({ max_tokens: 12000, ...prefix, messages: [{ role: 'user', content: [...refs, { type: 'text', text: 'THIS SLIDE...' }] }] }, { tool: 'submit_slide_layout', model: m });
    const upToBreakpoint = (b) => JSON.stringify([b.tools, b.system, b.tool_choice, b.thinking, b.messages[0].content.slice(0, 2)]);
    expect(upToBreakpoint(warm)).toBe(upToBreakpoint(real));
  });

  it('adds the refusal fallback for Sonnet 5.5 unless turned off', () => {
    expect(fallbackParams('claude-sonnet-5-5').body).toEqual({ fallbacks: 'default' });
    expect(fallbackParams('claude-sonnet-5-5').options.headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
    process.env.CLAUDE_REFUSAL_FALLBACK = 'off';
    expect(fallbackParams('claude-sonnet-5-5').body).toEqual({});
    delete process.env.CLAUDE_REFUSAL_FALLBACK;
  });

  it('reads the tool input next to text, and treats a refusal as no answer', () => {
    const r = { stop_reason: 'tool_use', content: [{ type: 'text', text: 'Here it is' }, { type: 'tool_use', name: 'submit_x', input: { a: 1 } }] };
    expect(toolInput(r, 'submit_x')).toEqual({ a: 1 });
    expect(toolInput({ ...r, stop_reason: 'refusal' }, 'submit_x')).toBeNull();
    expect(toolInput({ content: [{ type: 'text', text: 'no tool' }] }, 'submit_x')).toBeNull();
  });

  it('prices Sonnet 5.5 (and dated snapshot ids) with its own rates', () => {
    const usage = { input_tokens: 1000, cache_read_input_tokens: 30000, output_tokens: 2000 };
    expect(claudeCost('claude-sonnet-5-5', usage)).toBeCloseTo((1000 * 2 + 30000 * 0.2 + 2000 * 10) / 1e6, 8);
    expect(claudeCost('claude-sonnet-5-5-20261001', usage)).toBeCloseTo(claudeCost('claude-sonnet-5-5', usage), 8);
    expect(claudeCost('claude-sonnet-4-6', usage)).toBeCloseTo((1000 * 3 + 30000 * 0.3 + 2000 * 15) / 1e6, 8);
  });
});

import { streamToolCall } from '../services/claudeModel.js';
describe('streamToolCall (raw events, no SDK partial parser)', () => {
  const fakeClient = (events) => ({ messages: { create: async (body) => { expect(body.stream).toBe(true); return (async function* () { for (const e of events) yield e; })(); } } });
  it('assembles tool JSON split at awkward points and merges usage', async () => {
    const full = JSON.stringify({ layers: [{ kind: 'text', text: 'Say "hi" \\u00e9 -12.5', size: -1e2 }] });
    const chunks = []; for (let i = 0; i < full.length; i += 3) chunks.push(full.slice(i, i + 3));
    const seen = [];
    const r = await streamToolCall(fakeClient([
      { type: 'message_start', message: { model: 'claude-sonnet-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 40000, output_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 'submit_slide_layout', input: {} } },
      ...chunks.map(c => ({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: c } })),
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 900, input_tokens: null } },
    ]), [{ model: 'claude-sonnet-5-5' }, {}], { onJson: (j) => seen.push(j.length) });
    expect(r.content[0].input).toEqual(JSON.parse(full));
    expect(r.usage).toMatchObject({ input_tokens: 10, cache_read_input_tokens: 40000, output_tokens: 900 });
    expect(r.stop_reason).toBe('tool_use');
    expect(seen.at(-1)).toBe(full.length);
  });
  it('repairs slightly broken JSON instead of failing the slide', async () => {
    const r = await streamToolCall(fakeClient([
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 't', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"layers":[{"a":1},]' } },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } },
    ]), [{ model: 'm' }, {}]);
    expect(r.content[0].input).toEqual({ layers: [{ a: 1 }] });
  });
});
