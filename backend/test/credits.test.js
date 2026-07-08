import { describe, it, expect } from 'vitest';
import {
  CREDIT_COSTS, PLAN_CREDITS, PLAN_LADDER, EDIT_TIER_THRESHOLDS,
  getEditTierThreshold, suggestPlanForCost, novaInsufficientCredits,
} from '../config/credits.js';

describe('credit economy config', () => {
  it('every plan in the ladder has a credit allocation and edit threshold', () => {
    for (const plan of PLAN_LADDER) {
      expect(PLAN_CREDITS[plan], `PLAN_CREDITS.${plan}`).toBeTypeOf('number');
      expect(EDIT_TIER_THRESHOLDS[plan], `EDIT_TIER_THRESHOLDS.${plan}`).toBeTypeOf('number');
    }
  });

  it('the ladder is strictly increasing in credits', () => {
    for (let i = 1; i < PLAN_LADDER.length; i++) {
      expect(PLAN_CREDITS[PLAN_LADDER[i]]).toBeGreaterThan(PLAN_CREDITS[PLAN_LADDER[i - 1]]);
    }
  });

  it('free plan covers at least a 3-slide first deck', () => {
    expect(PLAN_CREDITS.free).toBeGreaterThanOrEqual(3 * CREDIT_COSTS.PER_SLIDE);
  });
});

describe('getEditTierThreshold', () => {
  it('returns the plan threshold', () => {
    expect(getEditTierThreshold('pro')).toBe(EDIT_TIER_THRESHOLDS.pro);
  });

  it('falls back to the free threshold for unknown plans', () => {
    expect(getEditTierThreshold('nonsense')).toBe(EDIT_TIER_THRESHOLDS.free);
    expect(getEditTierThreshold(undefined)).toBe(EDIT_TIER_THRESHOLDS.free);
  });
});

describe('suggestPlanForCost', () => {
  it('suggests the next plan up that covers the shortfall', () => {
    expect(suggestPlanForCost('free', 100)).toBe('basic');
    expect(suggestPlanForCost('basic', 2000)).toBe('pro');
  });

  it('never suggests the current plan or a lower one', () => {
    expect(suggestPlanForCost('pro', 1)).toBe('ultra1');
  });

  it('falls back to the top plan when nothing covers the cost', () => {
    expect(suggestPlanForCost('ultra4', 999_999)).toBe('ultra4');
  });

  it('treats an unknown current plan as free', () => {
    expect(suggestPlanForCost('nonsense', 100)).toBe('basic');
  });
});

describe('novaInsufficientCredits', () => {
  it('produces the machine-readable 402 payload', () => {
    const payload = novaInsufficientCredits({
      creditsRemaining: 3, creditsNeeded: 18, actionType: 'slide_edit', currentPlan: 'free',
    });
    expect(payload.code).toBe('INSUFFICIENT_CREDITS');
    expect(payload.credits_remaining).toBe(3);
    expect(payload.credits_needed).toBe(18);
    expect(payload.suggested_plan).toBe('basic');
    expect(payload.upgrade_url).toBe('/pricing');
  });
});
