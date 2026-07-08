import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { v4 as uuid } from 'uuid';

// Point the DB at a throwaway file BEFORE importing database.js (it reads
// DB_PATH at module load).
process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'hb-test-')), 'test.db');
process.env.ADMIN_EMAILS = 'admin@test.local';

const { initDatabase, getDb } = await import('../database.js');
const {
  deductCredits, refundCredits, deductCreditsForEdit, computeAffordableSlides,
  getOrCreateSubscription, grantCredits, previewEditCost, CREDIT_COSTS,
} = await import('../services/stripeService.js');
const { PLAN_CREDITS } = await import('../config/credits.js');

function createUser(email = `${uuid()}@test.local`) {
  const id = uuid();
  getDb().prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)').run(id, 'Test User', email);
  return id;
}

beforeAll(() => {
  initDatabase();
});

describe('getOrCreateSubscription', () => {
  it('creates a free subscription with the PLAN_CREDITS.free allocation', () => {
    const sub = getOrCreateSubscription(createUser());
    expect(sub.plan).toBe('free');
    expect(sub.credits_remaining).toBe(PLAN_CREDITS.free);
    expect(sub.credits_total).toBe(PLAN_CREDITS.free);
  });

  it('gives admins the unlimited sentinel balance', () => {
    const sub = getOrCreateSubscription(createUser('admin@test.local'));
    expect(sub.credits_remaining).toBe(999999);
  });
});

describe('deductCredits / refundCredits', () => {
  let userId;
  beforeEach(() => { userId = createUser(); getOrCreateSubscription(userId); });

  it('deducts atomically and writes a ledger row', () => {
    const { newBalance, ledgerId } = deductCredits(userId, 18, 'create_presentation', 'test');
    expect(newBalance).toBe(PLAN_CREDITS.free - 18);
    const row = getDb().prepare('SELECT * FROM credit_transactions WHERE id = ?').get(ledgerId);
    expect(row.amount).toBe(-18);
    expect(row.credits_before).toBe(PLAN_CREDITS.free);
    expect(row.balance_after).toBe(PLAN_CREDITS.free - 18);
  });

  it('throws INSUFFICIENT_CREDITS without changing the balance', () => {
    expect(() => deductCredits(userId, PLAN_CREDITS.free + 1, 'create_presentation', 'test'))
      .toThrowError('INSUFFICIENT_CREDITS');
    expect(getOrCreateSubscription(userId).credits_remaining).toBe(PLAN_CREDITS.free);
  });

  it('refund restores exactly what was deducted (deduct/refund symmetry)', () => {
    deductCredits(userId, 18, 'create_presentation', 'test');
    const balance = refundCredits(userId, 18, 'generation_refund', 'test refund');
    expect(balance).toBe(PLAN_CREDITS.free);
  });

  it('zero/negative amounts are no-ops', () => {
    const { newBalance } = deductCredits(userId, 0, 'create_presentation', 'noop');
    expect(newBalance).toBe(PLAN_CREDITS.free);
  });
});

describe('deductCreditsForEdit (tiered pricing)', () => {
  it('free plan starts at TIER_2 (threshold 0)', () => {
    const userId = createUser();
    grantCredits(userId, 100, 'admin_grant', 'top-up'); // ensure affordability
    const result = deductCreditsForEdit(userId, 'pres-1', false, 'edit');
    expect(result.tier).toBe('TIER_2');
    expect(result.cost).toBe(CREDIT_COSTS.SLIDE_EDIT_TIER_2);
  });

  it('increments edits_this_month and flips tiers at the threshold', () => {
    const userId = createUser();
    getOrCreateSubscription(userId);
    getDb().prepare("UPDATE subscriptions SET plan = 'basic', credits_remaining = 1000 WHERE user_id = ?").run(userId);

    const first = deductCreditsForEdit(userId, 'pres-1', false, 'edit');
    expect(first.tier).toBe('TIER_1');
    expect(first.cost).toBe(CREDIT_COSTS.SLIDE_EDIT_TIER_1);

    getDb().prepare('UPDATE subscriptions SET edits_this_month = 20 WHERE user_id = ?').run(userId);
    const later = deductCreditsForEdit(userId, 'pres-1', false, 'edit');
    expect(later.tier).toBe('TIER_2');
    expect(getOrCreateSubscription(userId).edits_this_month).toBe(21);
  });

  it('previewEditCost matches what deductCreditsForEdit actually charges', () => {
    const userId = createUser();
    getOrCreateSubscription(userId);
    getDb().prepare("UPDATE subscriptions SET plan = 'pro', credits_remaining = 1000, edits_this_month = 5 WHERE user_id = ?").run(userId);
    const sub = getOrCreateSubscription(userId);
    const preview = previewEditCost(sub, false);
    const actual = deductCreditsForEdit(userId, 'pres-1', false, 'edit');
    expect(actual.cost).toBe(preview);
  });
});

describe('computeAffordableSlides', () => {
  it('partitions requested slides into affordable + locked', () => {
    const userId = createUser();
    getOrCreateSubscription(userId); // 54 free credits = 3 slides at 18
    const { affordable, locked } = computeAffordableSlides(userId, 10);
    expect(affordable).toBe(Math.floor(PLAN_CREDITS.free / CREDIT_COSTS.PER_SLIDE));
    expect(affordable + locked).toBe(10);
  });

  it('affordable never exceeds the request', () => {
    const userId = createUser();
    getOrCreateSubscription(userId);
    const { affordable, locked } = computeAffordableSlides(userId, 1);
    expect(affordable).toBe(1);
    expect(locked).toBe(0);
  });
});
