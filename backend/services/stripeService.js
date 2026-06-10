import Stripe from 'stripe';
import { v4 as uuid } from 'uuid';
import { getDb } from '../database.js';
import { CREDIT_COSTS, PLAN_CREDITS, EDIT_TIER_THRESHOLDS, PLAN_LADDER, getEditTierThreshold, suggestPlanForCost, novaInsufficientCredits } from '../config/credits.js';

export { CREDIT_COSTS, EDIT_TIER_THRESHOLDS, PLAN_LADDER, getEditTierThreshold, suggestPlanForCost, novaInsufficientCredits };

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
  free:   { name: 'Free',   price: 0,   annualPrice: 0,   credits: PLAN_CREDITS.free,   tokenLimit:   500_000, priceId: null, annualPriceId: null },
  basic:  { name: 'Basic',  price: 25,  annualPrice: 20,  credits: PLAN_CREDITS.basic,  tokenLimit:  5_000_000, priceId: process.env.STRIPE_BASIC_PRICE_ID, annualPriceId: process.env.STRIPE_BASIC_ANNUAL_PRICE_ID },
  pro:    { name: 'Pro',    price: 65,  annualPrice: 52,  credits: PLAN_CREDITS.pro,    tokenLimit: 20_000_000, priceId: process.env.STRIPE_PRO_PRICE_ID,   annualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID },
  ultra1: { name: 'Ultra 1', price: 149, annualPrice: 116, credits: PLAN_CREDITS.ultra1, tokenLimit: 100_000_000, priceId: process.env.STRIPE_ULTRA_T1_PRICE_ID, annualPriceId: process.env.STRIPE_ULTRA_T1_ANNUAL_PRICE_ID },
  ultra2: { name: 'Ultra 2', price: 209, annualPrice: 157, credits: PLAN_CREDITS.ultra2, tokenLimit: 140_000_000, priceId: process.env.STRIPE_ULTRA_T2_PRICE_ID, annualPriceId: process.env.STRIPE_ULTRA_T2_ANNUAL_PRICE_ID },
  ultra3: { name: 'Ultra 3', price: 269, annualPrice: 194, credits: PLAN_CREDITS.ultra3, tokenLimit: 180_000_000, priceId: process.env.STRIPE_ULTRA_T3_PRICE_ID, annualPriceId: process.env.STRIPE_ULTRA_T3_ANNUAL_PRICE_ID },
  ultra4: { name: 'Ultra 4', price: 299, annualPrice: 209, credits: PLAN_CREDITS.ultra4, tokenLimit: 200_000_000, priceId: process.env.STRIPE_ULTRA_T4_PRICE_ID, annualPriceId: process.env.STRIPE_ULTRA_T4_ANNUAL_PRICE_ID },
};

// Legacy alias — old subscription rows may still have plan === 'ultra'
PLANS.ultra = PLANS.ultra1;

// Ultra tier price IDs indexed by slider position (0–3) → ultra1..ultra4
export const ULTRA_TIERS = [
  { planKey: 'ultra1', priceId: PLANS.ultra1.priceId, annualPriceId: PLANS.ultra1.annualPriceId },
  { planKey: 'ultra2', priceId: PLANS.ultra2.priceId, annualPriceId: PLANS.ultra2.annualPriceId },
  { planKey: 'ultra3', priceId: PLANS.ultra3.priceId, annualPriceId: PLANS.ultra3.annualPriceId },
  { planKey: 'ultra4', priceId: PLANS.ultra4.priceId, annualPriceId: PLANS.ultra4.annualPriceId },
];

// ── Subscription helpers ──────────────────────────────────────────────────────

export function getOrCreateSubscription(userId) {
  const db = getDb();
  let sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);
  if (!sub) {
    const admin = isAdmin(userId);
    const id = uuid();
    db.prepare(
      'INSERT INTO subscriptions (id, user_id, plan, status, credits_remaining, credits_total) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, userId, admin ? 'ultra4' : 'free', 'active', admin ? 999999 : PLANS.free.credits, admin ? 999999 : PLANS.free.credits);
    sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);
  }
  return sub;
}

export function getCredits(userId) {
  return getOrCreateSubscription(userId).credits_remaining;
}

function normalizePlanKey(planKey) {
  return PLANS[planKey] ? planKey : 'free';
}

// ── Core ledger write ─────────────────────────────────────────────────────────

function writeLedgerEntry(db, {
  userId, amount, balanceAfter, creditsBefore, type, description,
  presentationId = null, slidesGenerated = 0, slidesLocked = 0,
  editTier = null, editsThisMonthBefore = null, metadata = {},
}) {
  const id = uuid();
  db.prepare(
    `INSERT INTO credit_transactions
       (id, user_id, amount, balance_after, credits_before, type, description, presentation_id,
        slides_generated, slides_locked, edit_tier_used, edits_this_month_before, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, amount, balanceAfter, creditsBefore, type, description, presentationId,
        slidesGenerated, slidesLocked, editTier, editsThisMonthBefore, JSON.stringify(metadata || {}));
  return id;
}

// Merge additional fields into a ledger entry's metadata (e.g. attaching
// locked-slide prompts once Phase 2 completes, after the initial deduction).
export function updateLedgerMetadata(ledgerId, patch) {
  if (!ledgerId) return;
  const db = getDb();
  const row = db.prepare('SELECT metadata FROM credit_transactions WHERE id = ?').get(ledgerId);
  if (!row) return;
  let metadata = {};
  try { metadata = JSON.parse(row.metadata || '{}'); } catch {}
  db.prepare('UPDATE credit_transactions SET metadata = ? WHERE id = ?')
    .run(JSON.stringify({ ...metadata, ...patch }), ledgerId);
}

// ── Generic atomic deduction (used by generation, add-slides, prompt-chat, refunds) ──

// Returns { newBalance, ledgerId }. Throws Error('INSUFFICIENT_CREDITS') if
// the user can't afford `amount`.
export function deductCredits(userId, amount, type, description, opts = {}) {
  if (isAdmin(userId)) return { newBalance: 999999, ledgerId: null };
  if (amount <= 0) return { newBalance: getCredits(userId), ledgerId: null };

  const db = getDb();
  const {
    presentationId = null, slidesGenerated = 0, slidesLocked = 0,
    editTier = null, metadata = {},
  } = opts;

  const txn = db.transaction(() => {
    const sub = getOrCreateSubscription(userId);
    if (sub.credits_remaining < amount) throw new Error('INSUFFICIENT_CREDITS');

    const newBalance = sub.credits_remaining - amount;
    db.prepare('UPDATE subscriptions SET credits_remaining = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
      .run(newBalance, userId);

    const ledgerId = writeLedgerEntry(db, {
      userId, amount: -amount, balanceAfter: newBalance, creditsBefore: sub.credits_remaining,
      type, description, presentationId, slidesGenerated, slidesLocked, editTier,
      editsThisMonthBefore: sub.edits_this_month, metadata,
    });

    return { newBalance, ledgerId };
  });

  return txn();
}

// Refund credits after an NB2/Claude failure following a deduction. Never throws.
export function refundCredits(userId, amount, type, description, presentationId = null, metadata = {}) {
  if (isAdmin(userId)) return 999999;
  if (amount <= 0) return getCredits(userId);

  const db = getDb();
  const txn = db.transaction(() => {
    const sub = getOrCreateSubscription(userId);
    const newBalance = sub.credits_remaining + amount;
    db.prepare('UPDATE subscriptions SET credits_remaining = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
      .run(newBalance, userId);

    writeLedgerEntry(db, {
      userId, amount, balanceAfter: newBalance, creditsBefore: sub.credits_remaining,
      type, description, presentationId, editsThisMonthBefore: sub.edits_this_month, metadata,
    });

    return newBalance;
  });

  return txn();
}

// ── Slide-edit tiered pricing (atomic: tier check + deduction + edits_this_month++) ──

// Returns { newBalance, before, cost, tier, editsThisMonth }.
// Throws Error('INSUFFICIENT_CREDITS') if the user can't afford the tiered cost.
export function deductCreditsForEdit(userId, presentationId, hasReferenceImage, description) {
  if (isAdmin(userId)) {
    return { newBalance: 999999, before: 999999, cost: 0, tier: 'TIER_1', editsThisMonth: 0 };
  }

  const db = getDb();
  const txn = db.transaction(() => {
    const sub = getOrCreateSubscription(userId);
    const threshold = getEditTierThreshold(sub.plan);
    const editsThisMonth = sub.edits_this_month || 0;
    const tier = editsThisMonth >= threshold ? 'TIER_2' : 'TIER_1';
    let cost = tier === 'TIER_1' ? CREDIT_COSTS.SLIDE_EDIT_TIER_1 : CREDIT_COSTS.SLIDE_EDIT_TIER_2;
    if (hasReferenceImage) cost += CREDIT_COSTS.REFERENCE_IMAGE_PER_SLIDE;

    if (sub.credits_remaining < cost) throw new Error('INSUFFICIENT_CREDITS');

    const newBalance = sub.credits_remaining - cost;
    db.prepare(
      'UPDATE subscriptions SET credits_remaining = ?, edits_this_month = edits_this_month + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
    ).run(newBalance, userId);

    writeLedgerEntry(db, {
      userId, amount: -cost, balanceAfter: newBalance, creditsBefore: sub.credits_remaining,
      type: 'slide_edit', description, presentationId,
      editTier: tier, editsThisMonthBefore: editsThisMonth,
      metadata: { hasReferenceImage },
    });

    return { newBalance, before: sub.credits_remaining, cost, tier, editsThisMonth };
  });

  return txn();
}

// ── Partial-generation affordability ──────────────────────────────────────────

// Given a requested slide count, returns how many slides the user can afford
// at CREDIT_COSTS.PER_SLIDE each.
export function computeAffordableSlides(userId, requestedSlideCount) {
  if (isAdmin(userId)) {
    return { affordable: requestedSlideCount, locked: 0, creditsRemaining: 999999, plan: 'ultra4' };
  }
  const sub = getOrCreateSubscription(userId);
  const maxAffordable = Math.floor(sub.credits_remaining / CREDIT_COSTS.PER_SLIDE);
  const affordable = Math.max(0, Math.min(maxAffordable, requestedSlideCount));
  const locked = requestedSlideCount - affordable;
  return { affordable, locked, creditsRemaining: sub.credits_remaining, plan: sub.plan };
}

// ── Token usage tracking (separate budget system, unchanged) ─────────────────

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
  const txn = db.transaction(() => {
    const sub = getOrCreateSubscription(userId);
    const newBalance = sub.credits_remaining + amount;

    db.prepare(
      'UPDATE subscriptions SET credits_remaining = ?, credits_total = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
    ).run(newBalance, sub.credits_total + amount, userId);

    writeLedgerEntry(db, {
      userId, amount, balanceAfter: newBalance, creditsBefore: sub.credits_remaining,
      type, description, editsThisMonthBefore: sub.edits_this_month,
    });

    return newBalance;
  });
  return txn();
}

// On startup, clear any subscription IDs that belong to Stripe test mode
// (they start with the same prefix but don't exist in live mode).
export async function clearStaleTestSubscriptions() {
  if (!process.env.STRIPE_SECRET_KEY) return;
  const db = getDb();
  const rows = db.prepare("SELECT user_id, stripe_subscription_id FROM subscriptions WHERE stripe_subscription_id IS NOT NULL").all();
  for (const row of rows) {
    try {
      await getStripe().subscriptions.retrieve(row.stripe_subscription_id);
    } catch (err) {
      if (err?.statusCode === 404 || err?.code === 'resource_missing') {
        db.prepare(
          "UPDATE subscriptions SET stripe_subscription_id = NULL, plan = 'free', status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
        ).run(row.user_id);
      }
    }
  }
}

// ── Monthly reset ──────────────────────────────────────────────────────────────

// Sets credits to the EXACT plan allocation (no rollover/addition), resets
// edits_this_month, tokens_used, and clears any pending downgrade.
export function resetCreditsForPlan(userId, planKey, nextResetDate = null) {
  const db = getDb();
  const plan = PLANS[normalizePlanKey(planKey)];
  const resolvedPlanKey = PLANS[planKey] ? planKey : 'free';
  const resetDate = nextResetDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const txn = db.transaction(() => {
    const sub = getOrCreateSubscription(userId);
    db.prepare(
      `UPDATE subscriptions
       SET credits_remaining = ?, credits_total = ?, tokens_used = 0, edits_this_month = 0,
           plan = ?, pending_plan = NULL, credits_reset_date = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`
    ).run(plan.credits, plan.credits, resolvedPlanKey, resetDate, userId);

    writeLedgerEntry(db, {
      userId, amount: plan.credits, balanceAfter: plan.credits, creditsBefore: sub.credits_remaining,
      type: 'monthly_reset', description: `Monthly reset for ${plan.name} plan`,
      editsThisMonthBefore: sub.edits_this_month,
    });
  });

  txn();
}

// On upgrade mid-cycle: ADD the difference (new - old allocation) to
// credits_remaining, update credits_total, leave reset date and
// edits_this_month untouched.
export function applyPlanUpgrade(userId, newPlanKey) {
  const db = getDb();
  const newPlan = PLANS[normalizePlanKey(newPlanKey)];
  const resolvedPlanKey = PLANS[newPlanKey] ? newPlanKey : 'free';

  const txn = db.transaction(() => {
    const sub = getOrCreateSubscription(userId);
    const oldAlloc = PLANS[normalizePlanKey(sub.plan)]?.credits ?? 0;
    const diff = Math.max(newPlan.credits - oldAlloc, 0);
    const newBalance = sub.credits_remaining + diff;

    db.prepare(
      `UPDATE subscriptions
       SET plan = ?, credits_remaining = ?, credits_total = ?, pending_plan = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`
    ).run(resolvedPlanKey, newBalance, newPlan.credits, userId);

    writeLedgerEntry(db, {
      userId, amount: diff, balanceAfter: newBalance, creditsBefore: sub.credits_remaining,
      type: 'plan_upgrade', description: `Upgraded to ${newPlan.name} — added ${diff} credits`,
      editsThisMonthBefore: sub.edits_this_month,
    });
  });

  txn();
}

// On downgrade mid-cycle: update credits_total to the new (lower) allocation
// for display purposes, but DON'T reduce credits_remaining and DON'T change
// the active plan until the next scheduled reset (pending_plan carries the
// new plan and is applied by resetCreditsForPlan at that point).
export function scheduleDowngrade(userId, newPlanKey) {
  const db = getDb();
  const newPlan = PLANS[normalizePlanKey(newPlanKey)];
  const resolvedPlanKey = PLANS[newPlanKey] ? newPlanKey : 'free';

  db.prepare(
    `UPDATE subscriptions SET credits_total = ?, pending_plan = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`
  ).run(newPlan.credits, resolvedPlanKey, userId);
}

// On cancellation: don't zero credits immediately. Leave credits_remaining
// and plan untouched (user keeps using them until credits_reset_date), but
// schedule a reset to the free plan at that point.
export function scheduleCancellation(userId) {
  const db = getDb();
  db.prepare(
    `UPDATE subscriptions SET status = 'cancelled', stripe_subscription_id = NULL, pending_plan = 'free', updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`
  ).run(userId);
}

// Lazy backstop: if credits_reset_date has passed (e.g. after cancellation,
// where no further Stripe webhooks will fire), apply the scheduled reset now.
export function maybeApplyScheduledReset(userId) {
  const db = getDb();
  let sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);
  if (!sub || !sub.credits_reset_date) return sub;
  if (new Date(sub.credits_reset_date) > new Date()) return sub;

  resetCreditsForPlan(userId, sub.pending_plan || sub.plan);
  return db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);
}

// ── GET /api/user/credits payload ──────────────────────────────────────────────

export function getCreditsInfo(userId) {
  if (isAdmin(userId)) {
    const sub = getOrCreateSubscription(userId);
    return {
      credits_remaining: 999999,
      credits_total: 999999,
      credits_used: 0,
      reset_date: sub.credits_reset_date,
      plan_tier: sub.plan,
      usage_percentage: 0,
      edits_this_month: sub.edits_this_month || 0,
      edit_tier_threshold: getEditTierThreshold(sub.plan),
      transactions: [],
    };
  }

  const sub = maybeApplyScheduledReset(userId);
  const total = sub.credits_total || 0;
  const used = Math.max(total - sub.credits_remaining, 0);

  const transactions = getDb().prepare(
    `SELECT id, type as action_type, amount as credits_consumed, balance_after as credits_after,
            description, presentation_id, slides_generated, slides_locked, edit_tier_used,
            metadata, created_at
     FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 10`
  ).all(userId).map(r => {
    let metadata = {};
    try { metadata = JSON.parse(r.metadata || '{}'); } catch {}
    return { ...r, metadata };
  });

  return {
    credits_remaining: sub.credits_remaining,
    credits_total: total,
    credits_used: used,
    reset_date: sub.credits_reset_date,
    plan_tier: sub.plan,
    usage_percentage: total > 0 ? Math.round((used / total) * 100) : 0,
    edits_this_month: sub.edits_this_month || 0,
    edit_tier_threshold: getEditTierThreshold(sub.plan),
    transactions,
  };
}
