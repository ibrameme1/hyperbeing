import { describe, it, expect } from 'vitest';
import { DESIGN_VIDEO_MODELS, videoCreditCost } from '../config/credits.js';
import { VIDEO_PRICES, videoCost } from '../services/aiCosts.js';
import { PROVIDER_MODEL_IDS, buildContent } from '../services/seedanceVideo.js';

// Cheapest revenue per credit we sell: Ultra 4 annual ($209 / 16,000 credits).
// If plan prices change, update this — the margin guard below depends on it.
const CHEAPEST_USD_PER_CREDIT = 209 / 16000;
// Provider tokens per output second at 16:9 (w × h × 24fps / 1024).
const TOKENS_PER_SECOND = { '480p': 864 * 480 * 24 / 1024, '720p': 1280 * 720 * 24 / 1024, '1080p': 1920 * 1080 * 24 / 1024 };

describe('design video pricing', () => {
  it('charges per second of output', () => {
    expect(videoCreditCost('seedance-2.0', '720p', 10)).toBe(10 * DESIGN_VIDEO_MODELS['seedance-2.0'].creditsPerSecond['720p']);
  });

  it('rejects resolutions a model does not support', () => {
    expect(videoCreditCost('seedance-2.0-fast', '1080p', 5)).toBeNull();
    expect(videoCreditCost('nope', '720p', 5)).toBeNull();
    expect(videoCreditCost('seedance-2.0', '720p', 0)).toBeNull();
  });

  it('every model/resolution has a provider price and model id', () => {
    for (const [key, m] of Object.entries(DESIGN_VIDEO_MODELS)) {
      expect(PROVIDER_MODEL_IDS[key], key).toBeTruthy();
      for (const res of Object.keys(m.creditsPerSecond)) {
        expect(VIDEO_PRICES[key]?.[res], `${key} ${res}`).toBeTypeOf('number');
      }
    }
  });

  it('keeps at least 2x gross margin at the cheapest credit price', () => {
    for (const [key, m] of Object.entries(DESIGN_VIDEO_MODELS)) {
      for (const [res, perSecond] of Object.entries(m.creditsPerSecond)) {
        const providerUsd = videoCost(key, res, TOKENS_PER_SECOND[res]);
        const revenueUsd = perSecond * CHEAPEST_USD_PER_CREDIT;
        expect(revenueUsd / providerUsd, `${key} ${res}`).toBeGreaterThanOrEqual(1.95);
      }
    }
  });
});

describe('buildContent', () => {
  const a = 'data:image/png;base64,AAA';
  const b = 'data:image/png;base64,BBB';
  it('first frame', () => {
    expect(buildContent('p', [a], 'first_frame').map(c => c.role)).toEqual([undefined, 'first_frame']);
  });
  it('first + last frame', () => {
    expect(buildContent('p', [a, b], 'first_last').map(c => c.role)).toEqual([undefined, 'first_frame', 'last_frame']);
  });
  it('references', () => {
    expect(buildContent('', [a, b], 'reference').map(c => c.role)).toEqual(['reference_image', 'reference_image']);
  });
});

describe('design mode plan gate', () => {
  it('is Pro and Ultra only', async () => {
    const { canUseDesignMode, PLAN_LADDER } = await import('../config/credits.js');
    expect(PLAN_LADDER.filter(canUseDesignMode)).toEqual(['pro', 'ultra1', 'ultra2', 'ultra3', 'ultra4']);
    expect(canUseDesignMode('free')).toBe(false);
    expect(canUseDesignMode('basic')).toBe(false);
  });
});

describe('video model access', () => {
  it('customers get only the Seedance 2.5 family; admins get everything', async () => {
    const { canUseVideoModel, DESIGN_VIDEO_DEFAULT_MODEL } = await import('../config/credits.js');
    const keys = Object.keys(DESIGN_VIDEO_MODELS);
    expect(keys.filter(k => canUseVideoModel(k, false))).toEqual(['seedance-2.5', 'seedance-2.5-flash']);
    expect(keys.every(k => canUseVideoModel(k, true))).toBe(true);
    expect(canUseVideoModel(DESIGN_VIDEO_DEFAULT_MODEL, false)).toBe(true);
  });
});
