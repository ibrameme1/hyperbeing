import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  stripe, PLANS, ULTRA_TIERS, PLAN_LADDER, getOrCreateSubscription, resetCreditsForPlan, grantCredits, isAdmin,
  applyPlanUpgrade, scheduleDowngrade, scheduleCancellation,
} from '../services/stripeService.js';

// Plan ordering derived from the single source of truth in config/credits.js.
// 'ultra' is a legacy alias for ultra1 (old rows are normalized on boot, but
// checkout may still receive it from cached frontends).
const PLAN_RANK = Object.fromEntries(PLAN_LADDER.map((p, i) => [p, i]));
PLAN_RANK.ultra = PLAN_RANK.ultra1;
import { logger } from '../services/logger.js';
import { getDb } from '../database.js';
import {
  sendPurchaseConfirmation, sendPlanUpgraded, sendPlanDowngradeScheduled,
  sendSubscriptionCancelled, sendRenewalReceipt, sendPaymentFailed,
} from '../services/emailService.js';
import { validate, isEnum, isOptionalString, isIntBetween } from '../middleware/validate.js';
import { billingLimiter } from '../middleware/rateLimits.js';
import { getPostHog } from '../services/posthogClient.js';

const router = Router();

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

// Apply the effects of a completed Stripe Checkout session to our DB.
// Idempotent — safe to call from both the webhook and the success-page
// reconciliation endpoint, whichever fires first.
function applyCheckoutSession(session) {
  const { userId, planKey } = session.metadata || {};
  if (!userId || !planKey) return null;

  const db = getDb();
  const sub = getOrCreateSubscription(userId);
  const subscriptionId = session.subscription;

  if (sub.stripe_subscription_id === subscriptionId && sub.plan === planKey) {
    return sub; // already applied
  }

  db.prepare(
    'UPDATE subscriptions SET stripe_subscription_id = ?, plan = ?, status = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
  ).run(subscriptionId, planKey, 'active', null, userId);

  resetCreditsForPlan(userId, planKey);

  const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(userId);
  if (user?.email) {
    const plan = PLANS[planKey];
    sendPurchaseConfirmation(user.name, user.email, plan?.name || planKey, plan?.credits || 0);
  }

  getPostHog()?.capture({
    distinctId: String(userId),
    event: 'subscription_started',
    properties: { plan: planKey },
  });

  return getOrCreateSubscription(userId);
}

// ── GET /api/billing/subscription ─────────────────────────────────────────────
router.get('/subscription', authMiddleware, async (req, res) => {
  try {
    let sub = getOrCreateSubscription(req.userId);
    const admin = isAdmin(req.userId);

    let next_payment_date = null;
    let current_period_end = sub.current_period_end;
    let cancel_at_period_end = false;

    if (sub.stripe_subscription_id && process.env.STRIPE_SECRET_KEY) {
      try {
        // invoices.retrieveUpcoming was removed from stripe-node (v18+);
        // createPreview is its replacement. Wrapped so a preview failure never
        // blocks the subscription payload.
        const previewUpcoming = async () => {
          try {
            return await stripe.invoices.createPreview({ subscription: sub.stripe_subscription_id });
          } catch (previewErr) {
            logger.warn('upcoming invoice preview failed', { errorMessage: previewErr.message, userId: req.userId });
            return null;
          }
        };
        const [stripeSub, upcoming] = await Promise.all([
          stripe.subscriptions.retrieve(sub.stripe_subscription_id),
          previewUpcoming(),
        ]);
        current_period_end = new Date(stripeSub.current_period_end * 1000).toISOString();
        cancel_at_period_end = !!stripeSub.cancel_at_period_end;
        if (upcoming?.next_payment_attempt) {
          next_payment_date = new Date(upcoming.next_payment_attempt * 1000).toISOString();
        }
        if (current_period_end !== sub.current_period_end) {
          getDb().prepare('UPDATE subscriptions SET current_period_end = ? WHERE user_id = ?').run(current_period_end, req.userId);
        }
      } catch (stripeErr) {
        // Stale/test-mode subscription ID — clear it so the user isn't stuck
        if (stripeErr?.statusCode === 404 || stripeErr?.code === 'resource_missing') {
          logger.warn('clearing stale stripe subscription id', { userId: req.userId, subId: sub.stripe_subscription_id });
          getDb().prepare(
            "UPDATE subscriptions SET stripe_subscription_id = NULL, plan = 'free', status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
          ).run(req.userId);
          sub = getOrCreateSubscription(req.userId);
        }
        // Other errors (network, etc.) are silently ignored — we fall back to DB data
      }
    }

    const plan = PLANS[sub.plan] || PLANS.free;
    res.json({ subscription: { ...sub, current_period_end, is_admin: admin, next_payment_date, cancel_at_period_end }, plan });
  } catch (err) {
    logger.error('get subscription failed', { errorMessage: err.message, userId: req.userId });
    res.status(500).json({ error: 'Could not load subscription. Please try again.' });
  }
});

// ── POST /api/billing/checkout ────────────────────────────────────────────────
router.post('/checkout', authMiddleware, billingLimiter,
  validate({
    planKey:   isEnum('basic', 'pro', 'ultra', 'ultra1', 'ultra2', 'ultra3', 'ultra4'),
    billing:   isOptionalString(10),
    ultraTier: (v) => (v === undefined || v === null) ? null : isIntBetween(0, 3)(v),
  }),
  async (req, res) => {
  const { planKey, billing = 'monthly', ultraTier } = req.body;
  const isAnnual = billing === 'annual';
  let priceId;
  let actualPlanKey = planKey;
  if (planKey === 'ultra') {
    const tier = ULTRA_TIERS[ultraTier];
    if (!tier) return res.status(400).json({ error: 'Invalid Ultra tier selected.' });
    actualPlanKey = tier.planKey;
    priceId = isAnnual ? tier.annualPriceId : tier.priceId;
  } else {
    priceId = isAnnual ? PLANS[planKey]?.annualPriceId : PLANS[planKey]?.priceId;
  }
  const plan = PLANS[actualPlanKey];
  if (!plan || !priceId) return res.status(400).json({ error: 'This plan isn\'t available for purchase. Please choose a different plan or contact support.' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments are not available right now. Please contact support.' });

  try {
    let sub = getOrCreateSubscription(req.userId);

    // If user already has an active paid subscription, use Stripe to update it
    // instead of creating a new checkout session (prevents duplicate subscriptions)
    if (sub.stripe_subscription_id && sub.status === 'active') {
      let stripeSub;
      try {
        stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      } catch (stripeErr) {
        if (stripeErr?.statusCode === 404 || stripeErr?.code === 'resource_missing') {
          // Stale test-mode sub — clear it and fall through to create a new checkout
          logger.warn('clearing stale stripe subscription id on checkout', { userId: req.userId, subId: sub.stripe_subscription_id });
          getDb().prepare(
            "UPDATE subscriptions SET stripe_subscription_id = NULL, plan = 'free', status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
          ).run(req.userId);
          sub = getOrCreateSubscription(req.userId);
        } else {
          throw stripeErr;
        }
      }
      if (stripeSub) {
      const currentItemId = stripeSub.items.data[0]?.id;

      const isDowngrade = (PLAN_RANK[actualPlanKey] ?? 0) < (PLAN_RANK[sub.plan] ?? 0);

      // Cancel a pending downgrade — user re-picks the plan they're currently on.
      // (Picking any other plan, including the pending one, falls through to the
      // normal downgrade/upgrade logic below, which supersedes pending_plan and
      // applies the correct credit adjustment.)
      if (sub.pending_plan && actualPlanKey === sub.plan) {
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          items: [{ id: currentItemId, price: priceId }],
          proration_behavior: 'none',
          cancel_at_period_end: false,
          metadata: { userId: req.userId, planKey: actualPlanKey },
        });
        const db = getDb();
        db.prepare('UPDATE subscriptions SET plan = ?, pending_plan = NULL, credits_total = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(actualPlanKey, plan.credits, req.userId);
        return res.json({ upgraded: true, cancelledDowngrade: true, keptPlan: actualPlanKey });
      }

      if (isDowngrade) {
        // Write pending_plan BEFORE calling Stripe so the webhook sees it and skips the plan update
        const db = getDb();
        const periodEnd = stripeSub.current_period_end
          ? new Date(stripeSub.current_period_end * 1000).toISOString()
          : null;
        scheduleDowngrade(req.userId, actualPlanKey);
        db.prepare('UPDATE subscriptions SET current_period_end = ? WHERE user_id = ?').run(periodEnd, req.userId);
        try {
          await stripe.subscriptions.update(sub.stripe_subscription_id, {
            items: [{ id: currentItemId, price: priceId }],
            proration_behavior: 'none',
            cancel_at_period_end: false,
            metadata: { userId: req.userId, planKey: actualPlanKey },
          });
        } catch (stripeErr) {
          db.prepare('UPDATE subscriptions SET pending_plan = NULL, credits_total = ? WHERE user_id = ?').run(PLANS[sub.plan]?.credits ?? sub.credits_total, req.userId);
          throw stripeErr;
        }
        const _downgradeUser = db.prepare('SELECT name, email FROM users WHERE id = ?').get(req.userId);
        if (_downgradeUser?.email) sendPlanDowngradeScheduled(_downgradeUser.name, _downgradeUser.email, PLANS[sub.plan]?.name || sub.plan, plan.name, periodEnd);
        return res.json({ upgraded: true, isDowngrade: true, pendingPlan: actualPlanKey, periodEnd, currentPlan: sub.plan });
      } else {
        // Charge the prorated difference immediately and require it to succeed.
        // The plan/credit grant itself happens in the `invoice.paid` webhook —
        // not here — so the user only gets the upgrade once Stripe confirms payment.
        try {
          await stripe.subscriptions.update(sub.stripe_subscription_id, {
            items: [{ id: currentItemId, price: priceId }],
            proration_behavior: 'always_invoice',
            payment_behavior: 'error_if_incomplete',
            billing_cycle_anchor: 'now',
            cancel_at_period_end: false,
            metadata: { userId: req.userId, planKey: actualPlanKey },
          });
        } catch (stripeErr) {
          if (stripeErr?.type === 'StripeCardError' || stripeErr?.code === 'card_declined') {
            return res.status(402).json({ error: 'Your card was declined for this upgrade. Please update your payment method and try again.' });
          }
          if (stripeErr?.code === 'subscription_payment_intent_requires_action') {
            return res.status(402).json({ error: 'Your card requires additional verification. Please update your payment method via the billing portal and try again.' });
          }
          throw stripeErr;
        }
        return res.json({ upgraded: true, pending: true, message: 'Payment confirmed — your plan will update in just a moment.' });
      }
      } // if (stripeSub)
    } // if (sub.stripe_subscription_id && sub.status === 'active')
    const db = getDb();
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.userId);

    // Get or create Stripe customer
    let customerId = sub.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: user.name,
        metadata: { userId: req.userId },
      });
      customerId = customer.id;
      db.prepare('UPDATE subscriptions SET stripe_customer_id = ? WHERE user_id = ?').run(customerId, req.userId);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl()}/pricing`,
      metadata: { userId: req.userId, planKey: actualPlanKey },
      subscription_data: { metadata: { userId: req.userId, planKey: actualPlanKey } },
    });

    res.json({ url: session.url });
  } catch (err) {
    logger.error('stripe checkout failed', { errorMessage: err.message, stack: err.stack, planKey, userId: req.userId, requestId: req.requestId });
    res.status(400).json({ error: 'Could not start checkout. Please try again.' });
  }
  },
);

// ── POST /api/billing/portal ──────────────────────────────────────────────────
router.post('/portal', authMiddleware, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments are not available right now. Please contact support.' });

  try {
    const sub = getOrCreateSubscription(req.userId);
    if (!sub.stripe_customer_id) return res.status(400).json({ error: 'No active subscription found. Purchase a plan first to access the billing portal.' });

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${frontendUrl()}/dashboard`,
    });

    res.json({ url: session.url });
  } catch (err) {
    logger.error('stripe portal failed', { errorMessage: err.message, userId: req.userId });
    res.status(400).json({ error: 'Could not open billing portal. Please try again.' });
  }
});

// ── GET /api/billing/confirm-session ──────────────────────────────────────────
// Reconciles the local subscription/credits state right after a successful
// Stripe Checkout redirect, in case the `checkout.session.completed` webhook
// hasn't been delivered yet (e.g. local dev without `stripe listen`).
router.get('/confirm-session', authMiddleware, async (req, res) => {
  const { session_id } = req.query;
  if (!session_id || typeof session_id !== 'string') {
    return res.status(400).json({ error: 'Missing session_id.' });
  }
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments are not available right now. Please contact support.' });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.metadata?.userId !== req.userId) {
      return res.status(403).json({ error: 'This checkout session does not belong to your account.' });
    }

    const isComplete = session.payment_status === 'paid' || session.status === 'complete';
    if (isComplete) applyCheckoutSession(session);

    const sub = getOrCreateSubscription(req.userId);
    const plan = PLANS[sub.plan] || PLANS.free;
    res.json({ subscription: sub, plan, pending: !isComplete });
  } catch (err) {
    logger.error('confirm checkout session failed', { errorMessage: err.message, userId: req.userId });
    res.status(400).json({ error: 'Could not confirm checkout session.' });
  }
});

// ── POST /api/billing/webhook ─────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error('stripe webhook signature invalid', { errorMessage: err.message });
    return res.status(400).send('Webhook signature verification failed');
  }

  const db = getDb();

  switch (event.type) {
    case 'checkout.session.completed': {
      applyCheckoutSession(event.data.object);
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object;
      const stripeSubId = invoice.subscription;
      if (!stripeSubId) break;

      const sub = db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(stripeSubId);
      if (!sub) break;

      // Only reset on renewal (not the initial payment — that's handled by checkout.session.completed)
      if (invoice.billing_reason === 'subscription_cycle') {
        const renewPlanKey = sub.pending_plan || sub.plan;
        const periodEndUnix = invoice.lines?.data?.[0]?.period?.end;
        const resetDate = periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null;
        resetCreditsForPlan(sub.user_id, renewPlanKey, resetDate);
        const _renewUser = db.prepare('SELECT name, email FROM users WHERE id = ?').get(sub.user_id);
        if (_renewUser?.email) {
          const _renewPlan = PLANS[renewPlanKey];
          sendRenewalReceipt(_renewUser.name, _renewUser.email, _renewPlan?.name || renewPlanKey, _renewPlan?.credits || 0);
        }
      } else if (invoice.billing_reason === 'subscription_update') {
        // The prorated upgrade charge succeeded — now grant the new plan/credits.
        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
        const newPlanKey = stripeSub.metadata?.planKey;
        if (newPlanKey && PLANS[newPlanKey] && newPlanKey !== sub.plan) {
          applyPlanUpgrade(sub.user_id, newPlanKey);
          const periodEnd = stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000).toISOString() : null;
          db.prepare('UPDATE subscriptions SET current_period_end = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(periodEnd, sub.user_id);
          const _upgradeUser = db.prepare('SELECT name, email FROM users WHERE id = ?').get(sub.user_id);
          const _newPlan = PLANS[newPlanKey];
          if (_upgradeUser?.email) sendPlanUpgraded(_upgradeUser.name, _upgradeUser.email, _newPlan.name, _newPlan.credits);
          getPostHog()?.capture({
            distinctId: String(sub.user_id),
            event: 'subscription_upgraded',
            properties: { from_plan: sub.plan, to_plan: newPlanKey },
          });
        }
      }
      break;
    }

    case 'customer.subscription.updated': {
      const stripeSub = event.data.object;
      const sub = db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(stripeSub.id);
      if (!sub) break;

      const periodEnd = stripeSub.current_period_end
        ? new Date(stripeSub.current_period_end * 1000).toISOString()
        : null;

      // If a downgrade is scheduled, preserve the displayed plan — only sync status/period
      if (sub.pending_plan) {
        db.prepare(
          'UPDATE subscriptions SET status = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?'
        ).run(stripeSub.status, periodEnd, stripeSub.id);
        break;
      }

      // Plan changes (and their credit grants) are applied by the `invoice.paid`
      // webhook once the prorated charge is confirmed — just sync status/period here.
      db.prepare(
        'UPDATE subscriptions SET status = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?'
      ).run(stripeSub.status, periodEnd, stripeSub.id);
      break;
    }

    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object;
      const sub = db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(stripeSub.id);
      if (!sub) break;

      // Don't zero credits immediately — let the user consume what's left
      // until credits_reset_date, then the lazy reset applies the free plan.
      scheduleCancellation(sub.user_id);
      const _cancelUser = db.prepare('SELECT name, email FROM users WHERE id = ?').get(sub.user_id);
      if (_cancelUser?.email) sendSubscriptionCancelled(_cancelUser.name, _cancelUser.email);
      getPostHog()?.capture({
        distinctId: String(sub.user_id),
        event: 'subscription_cancelled',
        properties: { plan: sub.plan },
      });
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const sub = db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(invoice.subscription);
      if (!sub) break;

      db.prepare(
        'UPDATE subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?'
      ).run('past_due', invoice.subscription);
      const _failUser = db.prepare('SELECT name, email FROM users WHERE id = ?').get(sub.user_id);
      if (_failUser?.email) sendPaymentFailed(_failUser.name, _failUser.email, PLANS[sub.plan]?.name || sub.plan);
      break;
    }
  }

  res.json({ received: true });
});

export default router;
