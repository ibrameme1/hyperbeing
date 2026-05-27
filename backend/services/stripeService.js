import Stripe from 'stripe';
import { v4 as uuid } from 'uuid';
import { getDb } from '../database.js';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia',
});

export const PLANS = {
  free:  { name: 'Free',  price: 0,   credits: 5,    priceId: null },
  basic: { name: 'Basic', price: 10,  credits: 100,  priceId: process.env.STRIPE_BASIC_PRICE_ID },
  pro:   { name: 'Pro',   price: 49,  credits: 500,  priceId: process.env.STRIPE_PRO_PRICE_ID },
  ultra: { name: 'Ultra', price: 150, credits: 2000, priceId: process.env.STRIPE_ULTRA_PRICE_ID },
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
    const id = uuid();
    db.prepare(
      'INSERT INTO subscriptions (id, user_id, plan, status, credits_remaining, credits_total) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, userId, 'free', 'active', 5, 5);
    sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);
  }
  return sub;
}

export function getCredits(userId) {
  return getOrCreateSubscription(userId).credits_remaining;
}

export function deductCredits(userId, amount, type, description, presentationId = null) {
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
    'UPDATE subscriptions SET credits_remaining = ?, credits_total = ?, plan = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
  ).run(plan.credits, plan.credits, planKey, userId);

  db.prepare(
    'INSERT INTO credit_transactions (id, user_id, amount, balance_after, type, description) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(uuid(), userId, plan.credits, plan.credits, 'subscription_grant', `Monthly reset for ${plan.name} plan`);
}
