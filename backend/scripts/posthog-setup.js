// One-time setup script: creates PostHog Actions, Insights, and Dashboards
// for HyperBeing's product analytics (growth, activation, retention,
// monetization, feature adoption, reliability).
//
// Usage:
//   POSTHOG_PERSONAL_API_KEY=phx_... node backend/scripts/posthog-setup.js
//
// Optional env vars:
//   POSTHOG_HOST       default: https://us.i.posthog.com
//   POSTHOG_PROJECT_ID default: auto-detected from /api/projects/@current/
//
// Safe to re-run — dashboards/insights/actions are created fresh each time
// (PostHog does not dedupe by name), so only run this once per environment.

const HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
const API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

if (!API_KEY) {
  console.error('Set POSTHOG_PERSONAL_API_KEY (a personal API key with write access).');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

async function api(path, opts = {}) {
  const res = await fetch(`${HOST}${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${opts.method || 'GET'} ${path} -> ${res.status}: ${body}`);
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────
// Actions — one per trackable user action in the product
// ─────────────────────────────────────────────────────────────────────────
const ACTIONS = [
  { name: 'User Signed Up', event: 'user_signed_up' },
  { name: 'User Logged In', event: 'user_logged_in' },
  { name: 'User Logged Out', event: 'user_logged_out' },
  { name: 'Account Deleted', event: 'account_deleted' },
  { name: 'Onboarding Started', event: 'onboarding_started' },
  { name: 'Onboarding Completed', event: 'onboarding_completed' },
  { name: 'Onboarding Skipped', event: 'onboarding_skipped' },
  { name: 'Onboarding Upgrade Seed Clicked', event: 'onboarding_upgrade_seed_clicked' },
  { name: 'Prompt Submitted', event: 'prompt_submitted' },
  { name: 'Presentation Created', event: 'presentation_created' },
  { name: 'Presentation Deleted', event: 'presentation_deleted' },
  { name: 'Presentation Exported', event: 'presentation_exported' },
  { name: 'Chat Message Sent', event: 'chat_message_sent' },
  { name: 'Slide Generated', event: 'slide_generated' },
  { name: 'Slide Generation Failed', event: 'slide_generation_failed' },
  { name: 'Slide Edited', event: 'slide_edited' },
  { name: 'Slide Deleted', event: 'slide_deleted' },
  { name: 'Pricing Page Viewed', event: 'pricing_viewed' },
  { name: 'Checkout Started', event: 'checkout_started' },
  { name: 'Subscription Started', event: 'subscription_started' },
  { name: 'Subscription Upgraded', event: 'subscription_upgraded' },
  { name: 'Subscription Cancelled', event: 'subscription_cancelled' },
  { name: 'Out Of Credits', event: 'out_of_credits' },
  { name: 'Upgrade Clicked', event: 'upgrade_clicked' },
  { name: 'Feedback Submitted', event: 'feedback_submitted' },
  { name: 'Server Error', event: 'server_error' },
];

// ─────────────────────────────────────────────────────────────────────────
// Helper builders for insight filters (legacy "filters" API — broadly
// supported and renders correctly in the dashboard UI)
// ─────────────────────────────────────────────────────────────────────────
function trend(name, description, events, extra = {}) {
  return {
    name,
    description,
    filters: {
      insight: 'TRENDS',
      events: events.map((e, i) => ({
        id: e.id, name: e.id, type: 'events', order: i,
        math: e.math || 'total',
        ...(e.math_property ? { math_property: e.math_property } : {}),
      })),
      interval: extra.interval || 'day',
      date_from: extra.date_from || '-30d',
      ...(extra.breakdown ? { breakdown: extra.breakdown, breakdown_type: 'event' } : {}),
      display: extra.display || 'ActionsLineGraph',
    },
  };
}

function funnel(name, description, steps, extra = {}) {
  return {
    name,
    description,
    filters: {
      insight: 'FUNNELS',
      funnel_viz_type: 'steps',
      events: steps.map((id, i) => ({ id, name: id, type: 'events', order: i })),
      interval: extra.interval || 'day',
      date_from: extra.date_from || '-30d',
    },
  };
}

function retention(name, description, targetEvent, returningEvent, extra = {}) {
  return {
    name,
    description,
    filters: {
      insight: 'RETENTION',
      target_entity: { id: targetEvent, type: 'events' },
      returning_entity: { id: returningEvent, type: 'events' },
      retention_type: 'retention_first_time',
      period: extra.period || 'Week',
      total_intervals: extra.total_intervals || 8,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Dashboards
// ─────────────────────────────────────────────────────────────────────────
const DASHBOARDS = [
  {
    name: '🚀 Growth & Acquisition',
    description: 'Signups, login methods, and the activation pipeline from sign-up to first deck.',
    insights: [
      trend('Signups over time (by method)', 'New accounts created, split by email vs Google', [{ id: 'user_signed_up', math: 'total' }], { breakdown: 'method' }),
      trend('Logins over time (by method)', 'Returning logins, split by email vs Google', [{ id: 'user_logged_in', math: 'total' }], { breakdown: 'method' }),
      funnel('Sign-up → Onboarding → First Presentation', 'Activation funnel: how many new users go from sign-up to onboarding completion to creating their first deck', ['user_signed_up', 'onboarding_completed', 'presentation_created'], { date_from: '-90d' }),
      trend('Account deletions', 'Users who deleted their account — churn signal', [{ id: 'account_deleted', math: 'total' }]),
    ],
  },
  {
    name: '⚡ Activation & Core Usage Funnel',
    description: 'The core "aha moment" funnel: brief → generation → editing → export.',
    insights: [
      funnel('Prompt → Presentation → Slides → Export', 'The core product funnel from submitting a brief to exporting a finished deck', ['prompt_submitted', 'presentation_created', 'slide_generated', 'presentation_exported'], { date_from: '-30d' }),
      trend('Presentations created per day', 'Daily volume of new presentations', [{ id: 'presentation_created', math: 'total' }]),
      trend('Slide generation success vs failure', 'Reliability of the core slide generation pipeline', [
        { id: 'slide_generated', math: 'total' },
        { id: 'slide_generation_failed', math: 'total' },
      ]),
      trend('Chat messages sent (iteration engagement)', 'How much users iterate on decks via chat after generation', [{ id: 'chat_message_sent', math: 'total' }]),
      trend('Unique users creating presentations (WAU)', 'Weekly unique users who create at least one presentation', [{ id: 'presentation_created', math: 'dau' }], { interval: 'week', date_from: '-90d' }),
    ],
  },
  {
    name: '🔁 Retention & Power Users',
    description: 'Who keeps coming back, and how often — the basis for identifying power users.',
    insights: [
      retention('Weekly retention — presentation creation', 'Of users who create a presentation in week 0, how many come back and create another in later weeks', 'presentation_created', 'presentation_created'),
      retention('Weekly retention — any chat activity', 'Retention based on returning to chat/iterate on a deck', 'chat_message_sent', 'chat_message_sent'),
      trend('Daily active users (any tracked action)', 'DAU based on any core product action', [
        { id: 'presentation_created', math: 'dau' },
        { id: 'chat_message_sent', math: 'dau' },
        { id: 'slide_edited', math: 'dau' },
      ], { interval: 'day', date_from: '-30d' }),
      trend('Monthly active users trend', 'MAU based on presentation creation', [{ id: 'presentation_created', math: 'dau' }], { interval: 'month', date_from: '-180d' }),
    ],
  },
  {
    name: '💰 Monetization & Revenue',
    description: 'Pricing funnel, plan changes, churn, and upgrade triggers.',
    insights: [
      funnel('Pricing viewed → Checkout → Subscribed', 'Conversion from viewing pricing to starting checkout to an active subscription', ['pricing_viewed', 'checkout_started', 'subscription_started'], { date_from: '-90d' }),
      trend('New subscriptions started', 'New paid subscriptions over time', [{ id: 'subscription_started', math: 'total' }], { breakdown: '$current_url' }),
      trend('Plan upgrades vs cancellations', 'Net movement between paid plans', [
        { id: 'subscription_upgraded', math: 'total' },
        { id: 'subscription_cancelled', math: 'total' },
      ]),
      trend('Out-of-credits events (by action type)', 'Where users are hitting credit limits — strong upgrade-intent signal', [{ id: 'out_of_credits', math: 'total' }], { breakdown: 'action_type' }),
      trend('Upgrade button clicks (by source)', 'Which surfaces drive upgrade clicks', [{ id: 'upgrade_clicked', math: 'total' }], { breakdown: 'source' }),
      funnel('Out of credits → Upgrade clicked → Subscribed', 'Do credit-limit prompts actually convert to paid plans?', ['out_of_credits', 'upgrade_clicked', 'subscription_started'], { date_from: '-90d' }),
    ],
  },
  {
    name: '🧭 Feature Adoption & Improvement Areas',
    description: 'Where users spend their time, which features get used, and where they drop off.',
    insights: [
      trend('Feature usage comparison', 'Relative usage of editing, exporting, and feedback features', [
        { id: 'slide_edited', math: 'total' },
        { id: 'slide_deleted', math: 'total' },
        { id: 'presentation_exported', math: 'total' },
        { id: 'feedback_submitted', math: 'total' },
      ]),
      trend('Export format breakdown', 'PDF vs image export preference', [{ id: 'presentation_exported', math: 'total' }], { breakdown: 'format' }),
      funnel('Onboarding completion', 'How many users who start onboarding actually finish it', ['onboarding_started', 'onboarding_completed'], { date_from: '-90d' }),
      trend('Onboarding skip rate', 'Users skipping onboarding, by step', [{ id: 'onboarding_skipped', math: 'total' }], { breakdown: 'step' }),
      trend('Onboarding upgrade-seed clicks', 'Which onboarding answers drive interest in upgrading', [{ id: 'onboarding_upgrade_seed_clicked', math: 'total' }], { breakdown: 'seed_variant' }),
    ],
  },
  {
    name: '🛠️ Reliability & Errors',
    description: 'Where the product breaks for users — fix these first.',
    insights: [
      trend('Server errors over time', 'Unhandled server errors surfaced to PostHog', [{ id: 'server_error', math: 'total' }]),
      trend('Slide generation failures over time', 'Failed slide generations — directly impacts activation', [{ id: 'slide_generation_failed', math: 'total' }], { breakdown: 'error_message' }),
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Using PostHog host: ${HOST}`);

  let projectId = process.env.POSTHOG_PROJECT_ID;
  if (!projectId) {
    const project = await api('/api/projects/@current/');
    projectId = project.id;
    console.log(`Detected project: ${project.name} (id ${projectId})`);
  }

  console.log(`\nCreating ${ACTIONS.length} actions...`);
  for (const a of ACTIONS) {
    try {
      await api(`/api/projects/${projectId}/actions/`, {
        method: 'POST',
        body: JSON.stringify({ name: a.name, steps: [{ event: a.event }] }),
      });
      console.log(`  ✓ ${a.name}`);
    } catch (err) {
      console.error(`  ✗ ${a.name}: ${err.message}`);
    }
  }

  console.log(`\nCreating ${DASHBOARDS.length} dashboards...`);
  for (const d of DASHBOARDS) {
    try {
      const dashboard = await api(`/api/projects/${projectId}/dashboards/`, {
        method: 'POST',
        body: JSON.stringify({ name: d.name, description: d.description }),
      });
      console.log(`  ✓ Dashboard: ${d.name} (id ${dashboard.id})`);

      for (const insight of d.insights) {
        try {
          await api(`/api/projects/${projectId}/insights/`, {
            method: 'POST',
            body: JSON.stringify({
              name: insight.name,
              description: insight.description,
              filters: insight.filters,
              dashboards: [dashboard.id],
            }),
          });
          console.log(`      ✓ Insight: ${insight.name}`);
        } catch (err) {
          console.error(`      ✗ Insight ${insight.name}: ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`  ✗ Dashboard ${d.name}: ${err.message}`);
    }
  }

  console.log('\nDone. Open PostHog → Dashboards to review.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
