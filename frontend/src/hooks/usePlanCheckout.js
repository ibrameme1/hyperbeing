import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { capture } from '../utils/posthog';

// Checkout state for the pricing section on the landing page (the old
// standalone /pricing page now redirects to /#pricing).
//
// Same server contract as before: POST /billing/checkout answers either with
// a Stripe URL (new subscription) or with an in-place change (upgrade,
// scheduled downgrade, cancelled downgrade, or "pending" while the webhook
// lands). POST /billing/portal opens Stripe's portal for "Manage".

export const PLAN_RANK = { free: 0, basic: 1, pro: 2, ultra: 3, ultra1: 3, ultra2: 4, ultra3: 5, ultra4: 6 };

export function formatPlanDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function usePlanCheckout() {
  const { user, subscription: authSub } = useAuth();
  const navigate = useNavigate();
  const [sub, setSub] = useState(() => authSub || null);
  const [loading, setLoading] = useState(null); // plan key or 'portal'
  const [notice, setNotice] = useState(null); // { tone: 'error' | 'info', text }
  const [downgrade, setDowngrade] = useState(null); // { pendingPlan, periodEnd, fromPlan }

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/billing/subscription');
      setSub(data.subscription);
    } catch { /* keep what we have */ }
  }, []);

  useEffect(() => { if (user) refresh(); else setSub(null); }, [user, refresh]);

  const currentPlan = sub?.plan || 'free';

  async function subscribe(planKey, { annual, ultraTier }) {
    // Visitors sign up first; checkout happens from the same section later.
    if (!user) { navigate('/login?mode=signup'); return; }
    if (planKey === currentPlan && !sub?.pending_plan) return;
    setLoading(planKey);
    setNotice(null);
    const billing = annual ? 'annual' : 'monthly';
    capture('checkout_started', { plan: planKey, billing, current_plan: currentPlan, surface: 'landing' });

    let data;
    try {
      ({ data } = await api.post('/billing/checkout', { planKey, billing, ...(planKey === 'ultra' && { ultraTier }) }));
    } catch (err) {
      const status = err.response?.status;
      setNotice({
        tone: 'error',
        text: err.response?.data?.error
          || (status === 503 ? 'Payments are not available right now. Please try again later.'
            : status === 429 ? 'Too many requests. Please wait a moment and try again.'
              : 'Could not start checkout. Please try again.'),
      });
      setLoading(null);
      return;
    }

    if (!data.upgraded) { window.location.href = data.url; return; } // Stripe checkout

    if (data.isDowngrade) {
      setSub((p) => ({ ...(p || {}), pending_plan: data.pendingPlan, current_period_end: data.periodEnd }));
      setDowngrade({ pendingPlan: data.pendingPlan, periodEnd: data.periodEnd, fromPlan: data.currentPlan });
    } else if (data.cancelledDowngrade) {
      setSub((p) => ({ ...(p || {}), plan: data.keptPlan, pending_plan: null }));
    } else if (data.pending) {
      // Charge confirmed; the plan and credits land via webhook. Don't flip the
      // UI yet: give the webhook a moment, then refresh below.
      setNotice({ tone: 'info', text: data.message || 'Payment confirmed. Your plan will update in a moment.' });
      await new Promise((r) => setTimeout(r, 1500));
    } else {
      setSub((p) => ({ ...(p || {}), plan: planKey, pending_plan: null }));
    }
    await refresh(); // authoritative credits and dates
    setLoading(null);
  }

  async function manage() {
    setLoading('portal');
    setNotice(null);
    try {
      const { data } = await api.post('/billing/portal');
      window.location.href = data.url;
    } catch {
      setNotice({ tone: 'error', text: "Couldn't open the billing portal. Please try again." });
      setLoading(null);
    }
  }

  return { user, sub, currentPlan, loading, notice, setNotice, downgrade, setDowngrade, subscribe, manage };
}
