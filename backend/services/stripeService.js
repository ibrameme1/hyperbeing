import Stripe from 'stripe';
import { v4 as uuid } from 'uuid';
import { getDb } from '../database.js';

let _stripe = null;
export function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not set');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
  }
  return _stripe;
}
export const stripe = new Proxy({}, {
  get: (_, prop) => getStripe()[prop],
});

// Admin emails loaded from ADMIN_EMAILS env var; fallback for development only
export const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
);

export function isAdmin(userId) {
  const user = getDb().prepare('SELECT email FROM users WHERE id = ?').get(userId);
  return user && ADMIN_EMAILS.has(user.email?.toLowerCase());
}

export const PLANS = {
  free:  { name: 'Free',  price: 0,   credits: 5,    tokenLimit:  500_000, priceId: null,                                 annualPriceId: null },
  basic: { name: 'Basic', price: 25,  credits: 100,  tokenLimit:  5_000_000, priceId: process.env.STRIPE_BASIC_PRICE_ID,  annualPriceId: process.env.STRIPE_BASIC_ANNUAL_PRICE_ID },
  pro:   { name: 'Pro',   price: 65,  credits: 500,  tokenLimit: 20_000_000, priceId: process.env.STRIPE_PRO_PRICE_ID,    annualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID },
  ultra: { name: 'Ultra', price: 149, credits: 2000, tokenLimit: 100_000_000, priceId: process.env.STRIPE_ULTRA_PRICE_ID, annualPriceId: process.env.STRIPE_ULTRA_ANNUAL_PRICE_ID },
};

export const CREDIT_COSTS = {
  create_presentation: 10,
  add_slides: 3,
  regenerate_slide: 1,
};

// ── Subscription helpers ──────────────────────────────────────────────────────

export function getOrCreateSubscription(userId) {
  const db = getDb();
  let sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);
  if (!sub) {
    const admin = isAdmin(userId);
    const id = uuid();
    db.prepare(
      'INSERT INTO subscriptions (id, user_id, plan, status, credits_remaining, credits_total) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, userId, admin ? 'ultra' : 'free', 'active', admin ? 999999 : 5, admin ? 999999 : 5);
    sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);
  }
  return sub;
}

export function getCredits(userId) {
  return getOrCreateSubscription(userId).credits_remaining;
}

export function deductCredits(userId, amount, type, description, presentationId = null) {
  // Admin accounts have unlimited usage — skip all credit checks
  if (isAdmin(userId)) return 999999;

  const db = getDb();
  const sub = getOrCreateSubscription(userId);

  if (sub.credits_remaining < amount) {
    throw new Error('INSUFFICIENT_CREDITS');
  }

  const newBalance = sub.credits_remaining - amount;
  db.prepare(
    'UPDATE subscriptions SET credits_remaining = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
  ).run(newBalance, userId);

  db.prepare(
    'INSERT INTO credit_transactions (id, user_id, amount, balance_after, type, description, presentation_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(uuid(), userId, -amount, newBalance, type, description, presentationId);

  return newBalance;
}

// ── Token usage tracking ──────────────────────────────────────────────────────

export function checkTokenBudget(userId) {
  if (isAdmin(userId)) return;
  const sub = getOrCreateSubscription(userId);
  const plan = PLANS[sub.plan] || PLANS.free;
  if ((sub.tokens_used || 0) >= plan.tokenLimit) {
    throw new Error('TOKEN_LIMIT_EXCEEDED');
  }
}

export function recordTokenUsage(userId, inputTokens, outputTokens) {
  if (isAdmin(userId)) return;
  const total = (inputTokens || 0) + (outputTokens || 0);
  if (!total) return;
  getDb().prepare(
    'UPDATE subscriptions SET tokens_used = tokens_used + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
  ).run(total, userId);
}

export function grantCredits(userId, amount, type, description) {
  const db = getDb();
  const sub = getOrCreateSubscription(userId);
  const newBalance = sub.credits_remaining + amount;

  db.prepare(
    'UPDATE subscriptions SET credits_remaining = ?, credits_total = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
  ).run(newBalance, sub.credits_total + amount, userId);

  db.prepare(
    'INSERT INTO credit_transactions (id, user_id, amount, balance_after, type, description) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(uuid(), userId, amount, newBalance, type, description);

  return newBalance;
}

export function resetCreditsForPlan(userId, planKey) {
  const db = getDb();
  const plan = PLANS[planKey];
  if (!plan) return;

  db.prepare(
    'UPDATE subscriptions SET credits_remaining = ?, credits_total = ?, tokens_used = 0, plan = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
  ).run(plan.credits, plan.credits, planKey, userId);

  db.prepare(
    'INSERT INTO credit_transactions (id, user_id, amount, balance_after, type, description) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(uuid(), userId, plan.credits, plan.credits, 'subscription_grant', `Monthly reset for ${plan.name} plan`);
}
