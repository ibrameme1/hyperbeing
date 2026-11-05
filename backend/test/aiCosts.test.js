import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'hb-cost-')), 'test.db');
const { initDatabase, getDb } = await import('../database.js');
const { claudeCost, imageCost, recordClaudeCall, recordImageCall, withCostContext } = await import('../services/aiCosts.js');

beforeAll(() => { initDatabase(); });

describe('ai cost math', () => {
  it('prices Claude input, cache write/read, output and web searches', () => {
    // 1M of each kind at Sonnet 4.6 list prices.
    expect(claudeCost('claude-sonnet-4-6', { input_tokens: 1e6 })).toBeCloseTo(3);
    expect(claudeCost('claude-sonnet-4-6', { cache_creation_input_tokens: 1e6 })).toBeCloseTo(3.75);
    expect(claudeCost('claude-sonnet-4-6', { cache_read_input_tokens: 1e6 })).toBeCloseTo(0.3);
    expect(claudeCost('claude-sonnet-4-6', { output_tokens: 1e6 })).toBeCloseTo(15);
    expect(claudeCost('claude-sonnet-4-6', { server_tool_use: { web_search_requests: 3 } })).toBeCloseTo(0.03);
  });

  it('prices image text input, image input and output separately', () => {
    const usage = { input_tokens: 1500, output_tokens: 1000, input_tokens_details: { text_tokens: 1000, image_tokens: 500 } };
    // 1000×5 + 500×8 + 1000×30 per million
    expect(imageCost('gpt-image-2.5-flare', usage)).toBeCloseTo((1000 * 5 + 500 * 8 + 1000 * 30) / 1e6);
  });
});

// The report maths below uses Sonnet 4.6 rates explicitly, so it does not move
// when the default model (CLAUDE_MODEL) does.
describe('ai cost records', () => {
  it('attributes calls to the deck, slide and operation from context', async () => {
    await withCostContext({ userId: 'u1', presentationId: 'p1', operation: 'deck_create' }, async () => {
      recordClaudeCall({ call: 'plan_outline', usage: { input_tokens: 100, output_tokens: 50 } });
      await withCostContext({ slideIndex: 2 }, async () => {
        await Promise.resolve();
        recordImageCall({ call: 'image_cluster', model: 'gpt-image-2.5-flare', usage: { input_tokens: 10, output_tokens: 700 } });
      });
    });
    const rows = getDb().prepare('SELECT * FROM ai_costs ORDER BY id').all();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ user_id: 'u1', presentation_id: 'p1', slide_index: null, operation: 'deck_create', provider: 'anthropic', call: 'plan_outline' });
    expect(rows[1]).toMatchObject({ presentation_id: 'p1', slide_index: 2, provider: 'openai', images: 1, estimated: 1 });
    expect(rows[1].cost_usd).toBeGreaterThan(0);
  });

  it('records nothing for calls without usage (mock mode)', () => {
    const before = getDb().prepare('SELECT COUNT(*) n FROM ai_costs').get().n;
    recordImageCall({ call: 'image_background', model: 'gpt-image-2.5-flare', usage: null });
    expect(getDb().prepare('SELECT COUNT(*) n FROM ai_costs').get().n).toBe(before);
  });
});

const { buildCostReport, costRowsCsv, deckCostDetail } = await import('../services/costReport.js');
describe('cost report', () => {
  it('aggregates per slide, per call and the layout cache hit rate', async () => {
    const db = getDb();
    db.prepare('DELETE FROM ai_costs').run();
    await withCostContext({ userId: 'u2', presentationId: 'deck2', operation: 'deck_create' }, async () => {
      recordClaudeCall({ call: 'plan_outline', model: 'claude-sonnet-4-6', usage: { input_tokens: 500, output_tokens: 1500 } });
      for (const slideIndex of [0, 1]) {
        await withCostContext({ slideIndex }, async () => {
          recordClaudeCall({ call: 'designSlideLayout', model: 'claude-sonnet-4-6', usage: slideIndex === 0
            ? { input_tokens: 2000, cache_creation_input_tokens: 28000, output_tokens: 3000 }
            : { input_tokens: 2000, cache_read_input_tokens: 28000, output_tokens: 3000 } });
          recordImageCall({ call: 'image_background', model: 'gpt-image-2.5-flare', usage: { input_tokens: 300, output_tokens: 367 } });
        });
      }
    });
    const r = buildCostReport(db, {});
    expect(r.perSlide.total.n).toBe(2);
    // slide 0 paid the cache write, slide 1 only the read
    expect(r.perSlide.claude.max - r.perSlide.claude.min).toBeCloseTo(28000 * (3.75 - 0.3) / 1e6, 5);
    expect(r.cache.hit_rate).toBe(0.5);
    expect(r.deckOverhead.n).toBe(1);
    expect(r.byCall.find(c => c.call === 'designSlideLayout').calls).toBe(2);
    expect(deckCostDetail(db, 'deck2').groups.map(g => g.slide)).toEqual([null, 0, 1]);
    expect(costRowsCsv(db, {}).split('\n')).toHaveLength(1 + 5);
  });
});
