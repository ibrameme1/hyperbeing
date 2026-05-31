import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  stripe, PLANS, ULTRA_TIERS, getOrCreateSubscription, resetCreditsForPlan, grantCredits, isAdmin,
} from '../services/stripeService.js';
import { logger } from '../services/logger.js';
import { getDb } from '../database.js';
import { validate, isEnum, isOptionalString, isIntBetween } from '../middleware/validate.js';
import { billingLimiter } from '../middleware/rateLimits.js';

const router = Router();

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

// ── GET /api/billing/subscription ─────────────────────────────────────────────
router.get('/subscription', authMiddleware, (req, res) => {
  const sub = getOrCreateSubscription(req.userId);
  const plan = PLANS[sub.plan] || PLANS.free;
  const admin = isAdmin(req.userId);
  res.json({ subscription: { ...sub, is_admin: admin }, plan });
});

// ── POST /api/billing/checkout ────────────────────────────────────────────────
router.post('/checkout', authMiddleware, billingLimiter,
  validate({
    planKey:   isEnum('basic', 'pro', 'ultra'),
    billing:   isOptionalString(10),
    ultraTier: (v) => (v === undefined || v === null) ? null : isIntBetween(0, 3)(v),
  }),
  async (req, res) => {
  const { planKey, billing = 'monthly', ultraTier } = req.body;
  const plan = PLANS[planKey];
  const isAnnual = billing === 'annual';
  let priceId;
  if (planKey === 'ultra') {
    const tier = ULTRA_TIERS[ultraTier];
    if (!tier) return res.status(400).json({ error: 'Invalid Ultra tier selected.' });
    priceId = isAnnual ? tier.annualPriceId : tier.priceId;
  } else {
    priceId = isAnnual ? plan?.annualPriceId : plan?.priceId;
  }
  if (!plan || !priceId) return res.status(400).json({ error: 'This plan isn\'t available for purchase. Please choose a different plan or contact support.' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments are not available right now. Please contact support.' });

  try {
    const sub = getOrCreateSubscription(req.userId);

    // If user already has an active paid subscription, use Stripe to update it
    // instead of creating a new checkout session (prevents duplicate subscriptions)
    if (sub.stripe_subscription_id && sub.status === 'active') {
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      const currentItemId = stripeSub.items.data[0]?.id;

      const PLAN_RANK = { free: 0, basic: 1, pro: 2, ultra: 3 };
      const isDowngrade = (PLAN_RANK[planKey] || 0) < (PLAN_RANK[sub.plan] || 0);

      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        items: [{ id: currentItemId, price: priceId }],
        // Downgrades take effect at period end; upgrades apply immediately with proration
        proration_behavior: isDowngrade ? 'none' : 'create_prorations',
        billing_cycle_anchor: isDowngrade ? 'unchanged' : 'now',
        ...(isDowngrade && { cancel_at_period_end: false }),
        metadata: { userId: req.userId, planKey },
      });

      // For downgrades: store pending plan change, don't change credits yet
      // For upgrades: apply immediately
      if (isDowngrade) {
        const db = getDb();
        db.prepare(
          'UPDATE subscriptions SET pending_plan = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
        ).run(planKey, req.userId);
        return res.json({ upgraded: true, message: 'Plan will change at the end of your billing period.' });
      } else {
        resetCreditsForPlan(req.userId, planKey);
        return res.json({ upgraded: true, message: 'Plan upgraded successfully.' });
      }
    }
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
      metadata: { userId: req.userId, planKey },
      subscription_data: { metadata: { userId: req.userId, planKey } },
    });

    res.json({ url: session.url });
  } catch (err) {
    logger.error('stripe checkout failed', { errorMessage: err.message, planKey, requestId: req.requestId });
    res.status(400).json({ error: 'Could not start checkout. Please try again.' });
  }
  },
);

// ── POST /api/billing/portal ──────────────────────────────────────────────────
router.post('/portal', authMiddleware, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments are not available right now. Please contact support.' });

  const sub = getOrCreateSubscription(req.userId);
  if (!sub.stripe_customer_id) return res.status(400).json({ error: 'No active subscription found. Purchase a plan first to access the billing portal.' });

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${frontendUrl()}/dashboard`,
  });

  res.json({ url: session.url });
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
      const session = event.data.object;
      const { userId, planKey } = session.metadata;
      if (!userId || !planKey) break;

      const subscriptionId = session.subscription;
      db.prepare(
        'UPDATE subscriptions SET stripe_subscription_id = ?, plan = ?, status = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
      ).run(subscriptionId, planKey, 'active', null, userId);

      resetCreditsForPlan(userId, planKey);
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
        resetCreditsForPlan(sub.user_id, sub.plan);
      }
      break;
    }

    case 'customer.subscription.updated': {
      const stripeSub = event.data.object;
      const sub = db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(stripeSub.id);
      if (!sub) break;

      const periodEnd = new Date(stripeSub.current_period_end * 1000).toISOString();

      // Check if a plan change took effect (price changed on the subscription)
      const newPriceId = stripeSub.items.data[0]?.price?.id;
      const planFromStripe = stripeSub.metadata?.planKey;

      if (planFromStripe && planFromStripe !== sub.plan) {
        // Plan change applied — update plan and reset credits
        db.prepare(
          'UPDATE subscriptions SET plan = ?, status = ?, current_period_end = ?, pending_plan = NULL, updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?'
        ).run(planFromStripe, stripeSub.status, periodEnd, stripeSub.id);
        resetCreditsForPlan(sub.user_id, planFromStripe);
      } else {
        db.prepare(
          'UPDATE subscriptions SET status = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?'
        ).run(stripeSub.status, periodEnd, stripeSub.id);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object;
      const sub = db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(stripeSub.id);
      if (!sub) break;

      db.prepare(
        'UPDATE subscriptions SET plan = ?, status = ?, stripe_subscription_id = NULL, credits_remaining = 0, updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?'
      ).run('free', 'cancelled', stripeSub.id);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const sub = db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(invoice.subscription);
      if (!sub) break;

      db.prepare(
        'UPDATE subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?'
      ).run('past_due', invoice.subscription);
      break;
    }
  }

  res.json({ received: true });
});

export default router;
