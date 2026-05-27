import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  stripe, PLANS, getOrCreateSubscription, resetCreditsForPlan, grantCredits, isAdmin,
} from '../services/stripeService.js';
import { getDb } from '../database.js';
import { validate, isEnum } from '../middleware/validate.js';
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
  validate({ planKey: isEnum('basic', 'pro', 'ultra') }),
  async (req, res) => {
  const { planKey } = req.body;
  const plan = PLANS[planKey];
  if (!plan || !plan.priceId) return res.status(400).json({ error: 'Plan not available for purchase' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments not configured' });

  const sub = getOrCreateSubscription(req.userId);
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
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: `${frontendUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl()}/pricing`,
    metadata: { userId: req.userId, planKey },
    subscription_data: { metadata: { userId: req.userId, planKey } },
  });

  res.json({ url: session.url });
  },
);

// ── POST /api/billing/portal ──────────────────────────────────────────────────
router.post('/portal', authMiddleware, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments not configured' });

  const sub = getOrCreateSubscription(req.userId);
  if (!sub.stripe_customer_id) return res.status(400).json({ error: 'No active subscription' });

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
    return res.status(400).send(`Webhook error: ${err.message}`);
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

      db.prepare(
        'UPDATE subscriptions SET status = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?'
      ).run(stripeSub.status, new Date(stripeSub.current_period_end * 1000).toISOString(), stripeSub.id);
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
