import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Sparkles, Zap, Crown, Rocket, ArrowRight, Loader2, Home, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Logo from '../components/Logo';
import api from '../api/client';
import { track } from '../utils/track';

const sliderThumbStyle = `
  input[type='range'].ultra-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 22px; height: 22px;
    border-radius: 50%;
    background: #fff;
    border: 3px solid #8B80FF;
    box-shadow: 0 0 10px rgba(139,128,255,0.5);
    cursor: pointer;
  }
  input[type='range'].ultra-slider::-moz-range-thumb {
    width: 22px; height: 22px;
    border-radius: 50%;
    background: #fff;
    border: 3px solid #8B80FF;
    box-shadow: 0 0 10px rgba(139,128,255,0.5);
    cursor: pointer;
  }
`;

const ULTRA_TIERS = [
  { credits: 8000, price: 149, annualDiscount: 0.22 },
  { credits: 11200, price: 209, annualDiscount: 0.25 },
  { credits: 14400, price: 269, annualDiscount: 0.28 },
  { credits: 16000, price: 299, annualDiscount: 0.30 },
];

const PLANS = [
  {
    key: 'basic',
    name: 'Basic',
    tagline: 'For first-time AI presentation creators',
    monthlyPrice: 25,
    credits: 1200,
    annualDiscount: 0.20,
    icon: Zap,
    color: '#9CA3AF',
    gradient: 'linear-gradient(135deg, #374151 0%, #4B5563 100%)',
    border: 'rgba(107,114,128,0.3)',
    glow: 'rgba(107,114,128,0.2)',
    speed: { label: 'Standard Speed', emoji: '🐢', color: '#9CA3AF' },
    parallel: { label: '3 slides in parallel', emoji: '🔀' },
    features: [
      'PDF & PNG export',
      'Add slides feature',
      'Reference image uploads',
      'Email support',
    ],
    locked: [
      'Early feature access',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    tagline: 'For consistent AI presentation creators',
    monthlyPrice: 65,
    credits: 3200,
    annualDiscount: 0.20,
    icon: Crown,
    color: '#5B50FF',
    gradient: 'linear-gradient(135deg, #5B50FF 0%, #3B2FFF 100%)',
    border: 'rgba(91,80,255,0.5)',
    glow: 'rgba(91,80,255,0.3)',
    speed: { label: 'Fast Generation', emoji: '⚡', color: '#F59E0B' },
    parallel: { label: '6 slides in parallel', emoji: '🔀' },
    popular: true,
    features: [
      'PDF & PNG export',
      'Add slides feature',
      'Reference image uploads',
      'Early feature access',
      'Priority support',
    ],
    locked: [],
  },
  {
    key: 'ultra',
    name: 'Ultra',
    tagline: 'For power users and agencies',
    monthlyPrice: 149,
    credits: 8000,
    annualDiscount: 0.22,
    icon: Rocket,
    color: '#8B80FF',
    gradient: 'linear-gradient(135deg, #8B80FF 0%, #5B50FF 100%)',
    border: 'rgba(139,128,255,0.45)',
    glow: 'rgba(139,128,255,0.25)',
    speed: { label: 'Fastest Generation', emoji: '🚀', color: '#10B981' },
    parallel: { label: 'Unlimited parallel generation', emoji: '🔀' },
    bestValue: true,
    features: [
      'PDF & PNG export',
      'Add slides feature',
      'Reference image uploads',
      'Early feature access',
      'Custom brand kits',
      'Team workspace (soon)',
      'Dedicated support',
    ],
    locked: [],
  },
];

const CREDIT_TABLE = [
  { action: 'Generate a slide (per slide)', cost: 18 },
  { action: 'Add a slide (per slide)', cost: 18 },
  { action: 'Edit a slide', cost: '5–15' },
];

export default function Pricing() {
  const { user, subscription: authSub } = useAuth();
  const navigate = useNavigate();
  const [billing, setBilling] = useState('annual');
  const [currentPlan, setCurrentPlan] = useState(() => authSub?.plan || 'free');
  const [creditsLeft, setCreditsLeft] = useState(() => authSub != null ? authSub.credits_remaining : null);
  const [loading, setLoading] = useState(null);
  const [ultraTier, setUltraTier] = useState(0);
  const [subInfo, setSubInfo] = useState(() => authSub || null);
  const [downgradeModal, setDowngradeModal] = useState(null);
  const [fetchError, setFetchError] = useState(false);
  const [manageError, setManageError] = useState('');

  useEffect(() => { track('pricing_viewed'); }, []);

  useEffect(() => {
    if (user) {
      api.get('/billing/subscription')
        .then(r => {
          setCurrentPlan(r.data.subscription.plan);
          setCreditsLeft(r.data.subscription.credits_remaining);
          setSubInfo(r.data.subscription);
        })
        .catch(() => { setFetchError(true); });
    }
  }, [user]);

  function formatDate(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async function handleSubscribe(planKey) {
    if (!user) { navigate('/login'); return; }
    // Allow re-subscribing to current plan only when cancelling a pending downgrade
    if (planKey === currentPlan && !subInfo?.pending_plan) return;
    setLoading(planKey);

    let data;
    try {
      const res = await api.post('/billing/checkout', {
        planKey,
        billing,
        ...(planKey === 'ultra' && { ultraTier }),
      });
      data = res.data;
    } catch (err) {
      const status = err.response?.status;
      alert(
        err.response?.data?.error ||
        (status === 503 ? 'Payments are not available right now. Please try again later.' :
         status === 429 ? 'Too many requests. Please wait a moment and try again.' :
         'Could not start checkout. Please try again.')
      );
      setLoading(null);
      return;
    }

    if (!data.upgraded) {
      // New checkout session — redirect to Stripe
      window.location.href = data.url;
      return;
    }

    // Optimistically update card state immediately from the POST response so the
    // UI reflects the change without waiting for the GET /subscription round-trip.
    if (data.isDowngrade) {
      setSubInfo(prev => ({ ...(prev || {}), pending_plan: data.pendingPlan, current_period_end: data.periodEnd }));
      setDowngradeModal({ pendingPlan: data.pendingPlan, periodEnd: data.periodEnd, fromPlan: data.currentPlan });
    } else if (data.cancelledDowngrade) {
      setCurrentPlan(data.keptPlan);
      setSubInfo(prev => ({ ...(prev || {}), plan: data.keptPlan, pending_plan: null }));
    } else {
      // Upgrade applied
      setCurrentPlan(planKey);
      setSubInfo(prev => ({ ...(prev || {}), plan: planKey, pending_plan: null }));
    }

    // Follow-up refresh for authoritative data (credits, exact dates, next payment, etc.).
    // Separated from the POST try-catch; failures are absorbed since the optimistic
    // update above already keeps the UI consistent.
    try {
      const subRes = await api.get('/billing/subscription');
      setCurrentPlan(subRes.data.subscription.plan);
      setCreditsLeft(subRes.data.subscription.credits_remaining);
      setSubInfo(subRes.data.subscription);
    } catch { /* ignore — optimistic state is correct */ }

    setLoading(null);
  }

  async function handleManage() {
    setLoading('portal');
    setManageError('');
    try {
      const { data } = await api.post('/billing/portal');
      window.location.href = data.url;
    } catch {
      setManageError("Couldn't open billing portal. Try again.");
    } finally {
      setLoading(null);
    }
  }

  function getPlanPrice(plan) {
    if (plan.key === 'ultra') {
      const tier = ULTRA_TIERS[ultraTier];
      if (billing === 'annual') {
        return Math.round(tier.price * (1 - tier.annualDiscount));
      }
      return tier.price;
    }
    if (billing === 'annual' && plan.annualDiscount) {
      return Math.round(plan.monthlyPrice * (1 - plan.annualDiscount));
    }
    return plan.monthlyPrice;
  }

  function getPlanCredits(plan) {
    if (plan.key === 'ultra') return ULTRA_TIERS[ultraTier].credits;
    return plan.credits;
  }

  function getAnnualDiscount(plan) {
    if (plan.key === 'ultra') return ULTRA_TIERS[ultraTier].annualDiscount;
    return plan.annualDiscount;
  }

  return (
    <div className="min-h-screen" style={{ background: '#080808' }}>
      <div className="fixed top-0 left-1/4 w-[600px] h-[600px] rounded-full pointer-events-none"
           style={{ background: 'radial-gradient(circle, rgba(91,80,255,0.18) 0%, transparent 65%)', filter: 'blur(80px)' }} />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] rounded-full pointer-events-none"
           style={{ background: 'radial-gradient(circle, rgba(91,80,255,0.10) 0%, transparent 65%)', filter: 'blur(80px)' }} />

      <style>{sliderThumbStyle}</style>
      {/* Nav */}
      <div className="relative z-10 flex items-center justify-between px-8 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="flex items-center">
            <Logo dark height={40} />
          </button>
          <button
            onClick={() => navigate(user ? '/dashboard' : '/')}
            className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-80 px-3 py-1.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <Home size={12} /> {user ? 'Dashboard' : 'Home'}
          </button>
        </div>
        <div className="flex items-center gap-3">
          {creditsLeft !== null && (
            <span className="text-sm px-3 py-1.5 rounded-xl" style={{ background: 'rgba(91,80,255,0.15)', color: '#8B80FF', border: '1px solid rgba(91,80,255,0.3)' }}>
              {creditsLeft.toLocaleString()} credits left
            </span>
          )}
          {user && currentPlan !== 'free' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <button onClick={handleManage} className="text-sm text-white/50 hover:text-white/80 transition-colors">
                {loading === 'portal' ? <Loader2 size={14} className="animate-spin" /> : 'Manage / downgrade →'}
              </button>
              {manageError && (
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#f87171' }}>{manageError}</span>
              )}
            </div>
          )}
          {user && (
            <button
              onClick={() => navigate('/profile')}
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white flex-shrink-0 transition-opacity hover:opacity-80"
              style={{ background: '#5B50FF' }}
              title="Profile"
            >
              {(user.name || user.email || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </button>
          )}
          {!user && (
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-opacity hover:opacity-80"
              style={{ background: 'rgba(91,80,255,0.15)', color: '#8B80FF', border: '1px solid rgba(91,80,255,0.3)' }}
            >
              <User size={12} /> Sign in
            </button>
          )}
        </div>
      </div>

      {/* Subscription fetch error banner */}
      {fetchError && (
        <div style={{
          position: 'relative', zIndex: 10,
          background: '#f8f8fc',
          border: '1px solid rgba(239,68,68,0.2)',
          borderLeft: '3px solid rgba(239,68,68,0.5)',
          padding: '10px 20px',
          fontFamily: 'Inter, sans-serif',
          fontSize: 13,
          color: '#3d3660',
        }}>
          Couldn't load your plan info. Reload to try again.
        </div>
      )}

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-14">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-5"
               style={{ background: 'rgba(91,80,255,0.15)', color: '#8B80FF', border: '1px solid rgba(91,80,255,0.25)' }}>
            <Sparkles size={12} /> Simple, transparent pricing
          </div>
          <h1 className="font-display text-5xl font-bold text-white mb-4">
            Pick your plan,{' '}
            <em style={{ color: '#8B80FF', fontStyle: 'italic' }}>
              start creating
            </em>
          </h1>
          <p className="text-white/45 text-lg max-w-xl mx-auto mb-9">
            Every plan includes AI image generation, PDF export, and Nova's full art direction engine.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={() => setBilling('monthly')}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
              style={billing === 'monthly' ? { background: 'rgba(255,255,255,0.1)', color: '#fff' } : { color: 'rgba(255,255,255,0.4)' }}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('annual')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
              style={billing === 'annual' ? { background: 'rgba(255,255,255,0.1)', color: '#fff' } : { color: 'rgba(255,255,255,0.4)' }}
            >
              Annual
              <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(16,185,129,0.2)', color: '#34D399' }}>
                Save up to 30%
              </span>
            </button>
          </div>
        </motion.div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-14" style={{ paddingTop: '20px' }}>
          {PLANS.map((plan, i) => {
            const Icon = plan.icon;
            const isCurrent = plan.key === 'ultra' ? currentPlan?.startsWith('ultra') : currentPlan === plan.key;
            const isLoading = loading === plan.key;
            const price = getPlanPrice(plan);
            const credits = getPlanCredits(plan);
            const discount = getAnnualDiscount(plan);
            const showDiscount = billing === 'annual' && discount;
            const originalPrice = plan.key === 'ultra' ? ULTRA_TIERS[ultraTier].price : plan.monthlyPrice;

            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="relative rounded-3xl flex flex-col overflow-hidden"
                style={{
                  border: `1px solid ${plan.border}`,
                  background: 'rgba(255,255,255,0.03)',
                  transform: (plan.popular || plan.bestValue) ? 'translateY(-20px)' : 'none',
                  boxShadow: (plan.popular || plan.bestValue) ? `0 24px 64px ${plan.glow}` : 'none',
                  zIndex: (plan.popular || plan.bestValue) ? 1 : 0,
                }}
              >
                {/* Top badge — always rendered so plan names align across all 3 cards */}
                <div className="py-2.5 text-center text-xs font-bold text-white tracking-widest uppercase"
                     style={{
                       background: (plan.popular || plan.bestValue) ? plan.gradient : 'transparent',
                       opacity: (plan.popular || plan.bestValue) ? 1 : 0,
                     }}>
                  {plan.popular ? '♦ MOST POPULAR' : '♦ BEST VALUE'}
                </div>

                <div className="p-7 flex flex-col flex-1">
                  {/* Plan name + speed */}
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1"
                          style={{ background: `${plan.speed.color}18`, color: plan.speed.color, border: `1px solid ${plan.speed.color}30` }}>
                      {plan.speed.emoji} {plan.speed.label}
                    </span>
                  </div>
                  <p className="text-white/40 text-xs mb-5">{plan.tagline}</p>

                  {/* Credits */}
                  <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">✦</span>
                      <span className="text-xl font-bold text-white">{credits.toLocaleString()} credits/mo</span>
                    </div>
                    <p className="text-xs text-white/35 ml-7">≈ {Math.floor(credits / 180)} full 10-slide presentations</p>
                  </div>

                  {/* Price */}
                  <div className="mb-5">
                    <div className="flex items-end gap-2">
                      {showDiscount && (
                        <span className="text-xl font-semibold text-white/30 line-through mb-1">${originalPrice}</span>
                      )}
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={`${plan.key}-${billing}-${ultraTier}`}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.2 }}
                          className="text-4xl font-bold text-white"
                        >
                          ${price}
                        </motion.span>
                      </AnimatePresence>
                      <span className="text-white/35 text-sm mb-1.5">/month</span>
                      {showDiscount && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-lg mb-1.5"
                              style={{ background: 'rgba(16,185,129,0.15)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}>
                          {Math.round(discount * 100)}% OFF
                        </span>
                      )}
                    </div>
                    {showDiscount ? (
                      <p className="text-xs text-white/30 mt-0.5">Billed ${price * 12}/year</p>
                    ) : (
                      <p className="text-xs text-white/25 mt-0.5">Billed monthly</p>
                    )}
                  </div>

                  {/* CTA + status — logic depends on pending downgrade state */}
                  {(() => {
                    const pendingPlan = subInfo?.pending_plan;
                    const isCurrentEnding = plan.key === currentPlan && !!pendingPlan;
                    const isPendingNext   = plan.key === pendingPlan;
                    const RANK = { free: 0, basic: 1, pro: 2, ultra: 3, ultra1: 3, ultra2: 4, ultra3: 5, ultra4: 6 };
                    const currentRank = RANK[currentPlan] ?? 0;
                    const planRank    = RANK[plan.key] ?? 0;
                    const periodEnd   = formatDate(subInfo?.current_period_end);

                    // ── Plan being dropped (e.g. Pro while downgrading to Basic) ──
                    if (isCurrentEnding) {
                      const isLoadingThis = loading === plan.key;
                      return (
                        <>
                          <button
                            onClick={() => handleSubscribe(plan.key)}
                            disabled={isLoadingThis}
                            className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] mb-3 disabled:opacity-60"
                            style={{ background: plan.gradient, color: '#fff', boxShadow: `0 4px 20px ${plan.glow}` }}
                          >
                            {isLoadingThis
                              ? <Loader2 size={16} className="animate-spin" />
                              : <><span>Upgrade back to {plan.name}</span><ArrowRight size={14} /></>}
                          </button>
                          <div className="text-xs text-center mb-4 px-2 py-2 rounded-xl"
                               style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)' }}>
                            <span style={{ color: '#F59E0B' }}>
                              {plan.name} benefits active{periodEnd
                                ? <> until <span className="font-bold">{periodEnd}</span></>
                                : ' until end of billing period'}
                            </span>
                          </div>
                        </>
                      );
                    }

                    // ── Next plan (e.g. Basic when pending downgrade from Pro) ──
                    if (isPendingNext) {
                      return (
                        <>
                          <button
                            onClick={handleManage}
                            disabled={loading === 'portal'}
                            className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] mb-3 disabled:opacity-60"
                            style={{ background: plan.gradient, color: '#fff', boxShadow: `0 4px 20px ${plan.glow}` }}
                          >
                            {loading === 'portal' ? <Loader2 size={16} className="animate-spin" /> : 'Manage subscription'}
                          </button>
                          <div className="text-xs text-center mb-4 px-2 py-2 rounded-xl"
                               style={{ background: 'rgba(91,80,255,0.06)', border: '1px solid rgba(91,80,255,0.18)' }}>
                            <span style={{ color: '#8B80FF' }}>
                              Switching to {plan.name}{periodEnd
                                ? <> on <span className="font-bold">{periodEnd}</span></>
                                : ' at end of billing period'}
                            </span>
                          </div>
                        </>
                      );
                    }

                    // ── Normal plan (no pending change) ──
                    const isUpgrade = planRank > currentRank;
                    const isDowngrade = planRank < currentRank;
                    const label = isCurrent ? 'Manage subscription'
                      : isUpgrade ? `Upgrade to ${plan.name}`
                      : isDowngrade ? `Downgrade to ${plan.name}`
                      : `Get ${plan.name}`;

                    const statusNode = isCurrent && subInfo && subInfo.plan !== 'free' ? (
                      <div className="text-xs text-center mb-4 px-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {(subInfo.status === 'cancelled' || subInfo.status === 'canceled') ? (
                          <span style={{ color: '#f87171' }}>Cancelled — access ends {periodEnd}</span>
                        ) : subInfo.next_payment_date ? (
                          <>Renews {formatDate(subInfo.next_payment_date)}</>
                        ) : periodEnd ? (
                          <>Renews {periodEnd}</>
                        ) : null}
                      </div>
                    ) : null;

                    return (
                      <>
                        <button
                          onClick={() => isCurrent ? handleManage() : handleSubscribe(plan.key)}
                          disabled={isLoading}
                          className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] mb-3 disabled:opacity-60"
                          style={isCurrent
                            ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }
                            : { background: plan.gradient, color: '#fff', boxShadow: `0 4px 20px ${plan.glow}` }
                          }
                        >
                          {isLoading ? <Loader2 size={16} className="animate-spin" /> :
                           <><span>{label}</span>{!isCurrent && <ArrowRight size={14} />}</>}
                        </button>
                        {statusNode}
                      </>
                    );
                  })()}

                  {/* Ultra credit slider — below CTA so prices/buttons align across cards */}
                  {plan.key === 'ultra' && (
                    <div className="mb-5 rounded-2xl p-4" style={{ background: 'rgba(91,80,255,0.05)', border: '1px solid rgba(91,80,255,0.15)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-white/50">Customize credits / month</span>
                        <span className="text-sm font-bold" style={{ color: '#8B80FF' }}>
                          {ULTRA_TIERS[ultraTier].credits.toLocaleString()}
                        </span>
                      </div>
                      <div className="relative mb-3">
                        <input
                          type="range" min={0} max={ULTRA_TIERS.length - 1} step={1}
                          value={ultraTier}
                          onChange={e => setUltraTier(Number(e.target.value))}
                          className="ultra-slider w-full h-2 rounded-full appearance-none cursor-pointer"
                          style={{
                            background: `linear-gradient(to right, #8B80FF ${(ultraTier / (ULTRA_TIERS.length - 1)) * 100}%, rgba(255,255,255,0.1) ${(ultraTier / (ULTRA_TIERS.length - 1)) * 100}%)`,
                            WebkitAppearance: 'none',
                          }}
                        />
                      </div>
                      <div className="flex justify-between">
                        {ULTRA_TIERS.map((t, idx) => (
                          <button
                            key={idx}
                            onClick={() => setUltraTier(idx)}
                            className="flex flex-col items-center gap-0.5 transition-all duration-150"
                          >
                            <span className="text-xs font-semibold" style={{ color: ultraTier === idx ? '#8B80FF' : 'rgba(255,255,255,0.3)' }}>
                              {(t.credits / 1000).toFixed(0)}k
                            </span>
                          </button>
                        ))}
                      </div>
                      {billing === 'annual' && (
                        <p className="text-xs text-center mt-2.5 font-semibold" style={{ color: '#34D399' }}>
                          {Math.round(ULTRA_TIERS[ultraTier].annualDiscount * 100)}% off on annual — more credits = bigger discount
                        </p>
                      )}
                    </div>
                  )}

                  {/* Features */}
                  <ul className="space-y-2.5 flex-1">
                    {/* Speed & parallel at top */}
                    <li className="flex items-center gap-2.5 text-sm">
                      <span style={{ flexShrink: 0 }}>{plan.speed.emoji}</span>
                      <span className="font-semibold" style={{ color: plan.speed.color }}>{plan.speed.label}</span>
                    </li>
                    <li className="flex items-center gap-2.5 text-sm">
                      <span style={{ flexShrink: 0 }}>🔀</span>
                      <span className="text-white/70">{plan.parallel.label}</span>
                    </li>
                    <li className="h-px my-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
                    {plan.features.map(f => (
                      <li key={f} className="flex items-center gap-2.5 text-sm">
                        <Check size={13} style={{ color: plan.color, flexShrink: 0 }} />
                        <span className="text-white/70">{f}</span>
                      </li>
                    ))}
                    {plan.locked?.map(f => (
                      <li key={f} className="flex items-center gap-2.5 text-sm">
                        <X size={13} className="text-white/20 flex-shrink-0" />
                        <span className="text-white/25 line-through">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Enterprise */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.5 }}
          className="rounded-3xl p-10 flex flex-col md:flex-row items-center justify-between gap-8 mb-10"
          style={{ background: 'rgba(91,80,255,0.08)', border: '1px solid rgba(91,80,255,0.2)' }}
        >
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4"
                 style={{ background: 'rgba(91,80,255,0.2)', color: '#8B80FF', border: '1px solid rgba(91,80,255,0.3)' }}>
              Enterprise
            </div>
            <h3 className="text-white font-bold text-2xl mb-2">Need a custom plan for your team?</h3>
            <p className="text-white/45 text-sm max-w-lg">
              Custom credit volumes, shared team workspaces, priority onboarding, SLA support, and flexible billing.
              Reach out and we'll build a plan around your needs.
            </p>
          </div>
          <a
            href="mailto:team@hyperbeing.co?subject=Enterprise Plan Enquiry"
            className="flex-shrink-0 px-8 py-4 rounded-2xl font-bold text-sm text-white transition-all duration-200 hover:opacity-90 active:scale-[0.97] whitespace-nowrap"
            style={{ background: '#5B50FF', boxShadow: '0 4px 24px rgba(91,80,255,0.35)' }}
          >
            Contact us →
          </a>
        </motion.div>

        {/* Credit cost table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5 }}
          className="rounded-3xl p-8 mb-10"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <h3 className="text-white font-bold text-xl mb-1.5">How credits work</h3>
          <p className="text-white/35 text-sm mb-6">Each AI action deducts credits from your monthly balance. Unused credits don't roll over.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {CREDIT_TABLE.map(({ action, cost }) => (
              <div key={action} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-2xl font-bold mb-0.5" style={{ color: '#5B50FF' }}>{cost}</p>
                <p className="text-xs font-semibold text-white/70 mb-0.5">credits</p>
                <p className="text-xs text-white/35">{action}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <p className="text-center text-white/25 text-sm mb-14">
          New accounts get <span className="text-white/55 font-semibold">50 free credits</span> to try HyperBeing — no card required.
        </p>
      </div>

      {/* Downgrade confirmation modal */}
      <AnimatePresence>
        {downgradeModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.8)' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-3xl p-7"
              style={{ background: '#0f0f0f', border: '1px solid rgba(91,80,255,0.2)' }}
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 text-2xl"
                   style={{ background: 'rgba(91,80,255,0.12)', border: '1px solid rgba(91,80,255,0.2)' }}>
                📅
              </div>
              <h3 className="font-bold text-white text-xl mb-2">Downgrade confirmed</h3>
              <p className="text-sm leading-relaxed mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Your <span className="text-white font-semibold capitalize">{downgradeModal.fromPlan}</span> plan stays fully active until{' '}
                <span className="text-white font-bold">{formatDate(downgradeModal.periodEnd)}</span>. You keep all{' '}
                <span className="capitalize">{downgradeModal.fromPlan}</span> credits and features until then.
              </p>
              <p className="text-sm leading-relaxed mb-5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                On <span className="text-white font-bold">{formatDate(downgradeModal.periodEnd)}</span>, your subscription automatically switches to{' '}
                <span className="font-semibold capitalize" style={{ color: '#8B80FF' }}>{downgradeModal.pendingPlan}</span> and you'll be billed at the{' '}
                <span className="capitalize">{downgradeModal.pendingPlan}</span> plan rate going forward.
              </p>
              <div className="rounded-2xl px-4 py-3 mb-6 flex items-start gap-2.5"
                   style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="text-base mt-0.5">💡</span>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  No charges today. You can revert this by upgrading back before{' '}
                  <span className="text-white/60">{formatDate(downgradeModal.periodEnd)}</span>.
                </p>
              </div>
              <button
                onClick={() => setDowngradeModal(null)}
                className="w-full py-3.5 rounded-2xl font-bold text-sm text-white transition-opacity hover:opacity-85"
                style={{ background: '#5B50FF' }}
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
