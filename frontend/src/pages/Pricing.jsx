import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { Check, X, Sparkles, Zap, Crown, Rocket, ArrowRight, Loader2 } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Logo from '../components/Logo';
import api from '../api/client';
import { track } from '../utils/track';

const sliderThumbStyle = `
  input[type='range'].ultra-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px; height: 20px;
    border-radius: 50%;
    background: #fff;
    border: 3px solid #5B50FF;
    box-shadow: 0 0 0 4px rgba(91,80,255,0.12);
    cursor: pointer;
  }
  input[type='range'].ultra-slider::-moz-range-thumb {
    width: 20px; height: 20px;
    border-radius: 50%;
    background: #fff;
    border: 3px solid #5B50FF;
    box-shadow: 0 0 0 4px rgba(91,80,255,0.12);
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
    color: '#6b6490',
    speed: { label: 'Standard Speed', emoji: '🐢', color: '#6b6490' },
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

/* ─── Scroll-reveal wrapper (matches Homepage.jsx) ─── */
function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function Pricing() {
  const { user, subscription: authSub } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
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
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

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
    } else if (data.pending) {
      // Charge confirmed — the plan/credit grant lands via webhook, so don't
      // flip the UI to the new plan yet. Give the webhook a moment, then refresh.
      alert(data.message || 'Payment confirmed — your plan will update in just a moment.');
      await new Promise((resolve) => setTimeout(resolve, 1500));
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

  const eyebrow = { fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', letterSpacing: '0.20em', textTransform: 'uppercase' };

  return (
    <div data-theme="light" style={{ fontFamily: 'Inter, system-ui, sans-serif', background: '#f5f5f5', color: '#0d0b1a', minHeight: '100vh' }}>
      <style>{sliderThumbStyle}</style>

      {/* ── NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: '60px',
        background: scrolled ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(12px)',
        borderBottom: scrolled ? '0.5px solid #e8e8f0' : '0.5px solid transparent',
        transition: 'all 0.2s ease',
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '0 24px', display: 'flex', alignItems: 'center', gap: '32px' }}>
          {/* Logo */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }}>
            <Logo height={37} />
          </Link>

          {/* Center links */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '32px' }}>
            {[
              { label: 'Product', href: '/#demo' },
              { label: 'Examples', href: '/#gallery' },
              { label: 'Pricing', href: '/pricing' },
              { label: 'Enterprise', href: 'mailto:team@hyperbeing.co?subject=Enterprise%20Enquiry' },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                onClick={label === 'Pricing' ? (e) => e.preventDefault() : undefined}
                style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: label === 'Pricing' ? '#0d0b1a' : '#6b6490', textDecoration: 'none', transition: 'color 0.15s', cursor: 'pointer' }}
                onMouseEnter={e => e.target.style.color = '#0d0b1a'}
                onMouseLeave={e => e.target.style.color = label === 'Pricing' ? '#0d0b1a' : '#6b6490'}
              >
                {label}
              </a>
            ))}
          </div>

          {/* Right buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {creditsLeft !== null && (
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: '6px', background: '#ededff', color: '#5B50FF', border: '0.5px solid rgba(91,80,255,0.2)' }}>
                {creditsLeft.toLocaleString()} credits left
              </span>
            )}
            {user && currentPlan !== 'free' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <button
                  onClick={handleManage}
                  style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 500, color: '#6b6490', background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 8px' }}
                >
                  {loading === 'portal' ? <Loader2 size={14} className="animate-spin" /> : 'Manage / downgrade →'}
                </button>
                {manageError && (
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#ef4444' }}>{manageError}</span>
                )}
              </div>
            )}
            {user ? (
              <button
                onClick={() => navigate('/dashboard')}
                style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 600, color: '#fff', background: '#5B50FF', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', letterSpacing: '0.01em', transition: 'background 0.15s' }}
                onMouseEnter={e => e.target.style.background = '#6E63FF'}
                onMouseLeave={e => e.target.style.background = '#5B50FF'}
              >
                Dashboard →
              </button>
            ) : (
              <button
                onClick={() => navigate('/login')}
                style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 600, color: '#fff', background: '#5B50FF', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', letterSpacing: '0.01em', transition: 'background 0.15s' }}
                onMouseEnter={e => e.target.style.background = '#6E63FF'}
                onMouseLeave={e => e.target.style.background = '#5B50FF'}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Subscription fetch error banner */}
      {fetchError && (
        <div style={{
          position: 'relative', zIndex: 10, marginTop: '60px',
          background: '#ffffff',
          borderBottom: '0.5px solid rgba(239,68,68,0.2)',
          borderLeft: '3px solid rgba(239,68,68,0.5)',
          padding: '10px 24px',
          fontFamily: 'Inter, sans-serif',
          fontSize: 13,
          color: '#0d0b1a',
        }}>
          Couldn't load your plan info. Reload to try again.
        </div>
      )}

      {/* ── HERO / HEADER ── */}
      <section style={{ paddingTop: fetchError ? '40px' : '120px', paddingBottom: '0px', paddingLeft: '24px', paddingRight: '24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(91,80,255,0.08), transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <Reveal>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 9px', borderRadius: '4px', background: '#ededff', border: '0.5px solid rgba(91,80,255,0.28)', color: '#5B50FF', marginBottom: '24px', fontFamily: 'Inter, sans-serif', fontSize: '9px', fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
              <Sparkles size={11} /> Simple, transparent pricing
            </div>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontSize: 'clamp(40px, 7vw, 64px)',
              fontWeight: 400,
              lineHeight: 1.0,
              letterSpacing: '-0.03em',
              color: '#0d0b1a',
              marginBottom: '20px',
            }}>
              Pick your plan,{' '}
              <em style={{ fontStyle: 'italic', color: '#5B50FF' }}>start creating</em>
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '18px', fontWeight: 400, color: '#3d3660', maxWidth: '560px', margin: '0 auto 36px', lineHeight: 1.6 }}>
              Every plan includes AI image generation, PDF export, and Nova's full art direction engine.
            </p>
          </Reveal>

          {/* Billing toggle */}
          <Reveal delay={0.15}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px', borderRadius: '8px', background: '#ffffff', border: '0.5px solid #e8e8f0', marginBottom: '24px' }}>
              <button
                onClick={() => setBilling('monthly')}
                style={{
                  fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 600, padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  background: billing === 'monthly' ? '#ededff' : 'transparent',
                  color: billing === 'monthly' ? '#5B50FF' : '#6b6490',
                }}
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling('annual')}
                style={{
                  fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 600, padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px',
                  background: billing === 'annual' ? '#ededff' : 'transparent',
                  color: billing === 'annual' ? '#5B50FF' : '#6b6490',
                }}
              >
                Annual
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(34,197,94,0.12)', color: '#16a34a' }}>
                  Save up to 30%
                </span>
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── PLAN CARDS ── */}
      <section style={{ padding: '40px 24px 0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div className="pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', alignItems: 'start' }}>
            {PLANS.map((plan, i) => {
              const isCurrent = plan.key === 'ultra' ? currentPlan?.startsWith('ultra') : currentPlan === plan.key;
              const isLoading = loading === plan.key;
              const price = getPlanPrice(plan);
              const credits = getPlanCredits(plan);
              const discount = getAnnualDiscount(plan);
              const showDiscount = billing === 'annual' && discount;
              const originalPrice = plan.key === 'ultra' ? ULTRA_TIERS[ultraTier].price : plan.monthlyPrice;
              const highlighted = plan.popular || plan.bestValue;

              return (
                <Reveal key={plan.key} delay={i * 0.08}>
                  <div
                    style={{
                      position: 'relative',
                      display: 'flex', flexDirection: 'column',
                      height: '100%',
                      background: '#ffffff',
                      border: highlighted ? '1px solid rgba(91,80,255,0.35)' : '0.5px solid #e8e8f0',
                      borderRadius: highlighted ? '0 0 8px 8px' : '8px',
                      boxShadow: highlighted
                        ? 'rgba(91,80,255,0.20) 0px 0px 24px 0px, 0 1px 2px rgba(13,11,26,0.04), 0 8px 24px -8px rgba(13,11,26,0.06)'
                        : '0 1px 2px rgba(13,11,26,0.04), 0 8px 24px -8px rgba(13,11,26,0.06)',
                      zIndex: highlighted ? 1 : 0,
                      overflow: 'visible',
                    }}
                  >
                    {highlighted && (
                      <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, transform: 'translateY(-100%)',
                        textAlign: 'center', padding: '10px 0', borderRadius: '8px 8px 0 0',
                        background: plan.popular ? '#5B50FF' : '#8B5CF6',
                        color: '#fff',
                        fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                      }}>
                        {plan.popular ? 'Most popular' : 'Best value'}
                      </div>
                    )}

                    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                      {/* Plan name + speed */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                        <h3 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: '28px', fontWeight: 400, letterSpacing: '-0.02em', color: '#0d0b1a' }}>{plan.name}</h3>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0,
                          fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: 700, padding: '4px 9px', borderRadius: '4px',
                          background: `${plan.speed.color}18`, color: plan.speed.color, border: `0.5px solid ${plan.speed.color}40`,
                        }}>
                          {plan.speed.emoji} {plan.speed.label}
                        </span>
                      </div>
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#6b6490', marginBottom: '20px' }}>{plan.tagline}</p>

                      {/* Credits */}
                      <div style={{ borderRadius: '8px', padding: '16px', marginBottom: '16px', background: '#f5f5f5', border: '0.5px solid #e8e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '18px', color: '#5B50FF' }}>✦</span>
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '18px', fontWeight: 700, color: '#0d0b1a' }}>{credits.toLocaleString()} credits/mo</span>
                        </div>
                      </div>

                      {/* Price */}
                      <div style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                          {showDiscount && (
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '20px', fontWeight: 600, color: '#6b6490', textDecoration: 'line-through', marginBottom: '4px' }}>${originalPrice}</span>
                          )}
                          <AnimatePresence mode="wait">
                            <motion.span
                              key={`${plan.key}-${billing}-${ultraTier}`}
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 6 }}
                              transition={{ duration: 0.2 }}
                              style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: '44px', fontWeight: 700, letterSpacing: '-0.02em', color: '#0d0b1a', lineHeight: 1 }}
                            >
                              ${price}
                            </motion.span>
                          </AnimatePresence>
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#6b6490', marginBottom: '6px' }}>/month</span>
                          {showDiscount && (
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(34,197,94,0.12)', color: '#16a34a', marginBottom: '4px' }}>
                              {Math.round(discount * 100)}% OFF
                            </span>
                          )}
                        </div>
                        {showDiscount ? (
                          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#6b6490', marginTop: '2px' }}>Billed ${price * 12}/year</p>
                        ) : (
                          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#6b6490', marginTop: '2px' }}>Billed monthly</p>
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

                        const primaryBtnStyle = {
                          fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 600, color: '#fff',
                          background: '#5B50FF', border: 'none', borderRadius: '6px',
                          width: '100%', padding: '13px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                          transition: 'background 0.15s', marginBottom: '12px',
                        };
                        const secondaryBtnStyle = {
                          fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 600, color: '#0d0b1a',
                          background: 'transparent', border: '0.5px solid #e8e8f0', borderRadius: '6px',
                          width: '100%', padding: '13px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                          transition: 'border-color 0.15s', marginBottom: '12px',
                        };
                        const onPrimaryEnter = e => { e.currentTarget.style.background = '#6E63FF'; };
                        const onPrimaryLeave = e => { e.currentTarget.style.background = '#5B50FF'; };
                        const onSecondaryEnter = e => { e.currentTarget.style.borderColor = 'rgba(91,80,255,0.3)'; };
                        const onSecondaryLeave = e => { e.currentTarget.style.borderColor = '#e8e8f0'; };

                        // ── Plan being dropped (e.g. Pro while downgrading to Basic) ──
                        if (isCurrentEnding) {
                          const isLoadingThis = loading === plan.key;
                          return (
                            <>
                              <button
                                onClick={() => handleSubscribe(plan.key)}
                                disabled={isLoadingThis}
                                style={{ ...primaryBtnStyle, opacity: isLoadingThis ? 0.6 : 1 }}
                                onMouseEnter={onPrimaryEnter} onMouseLeave={onPrimaryLeave}
                              >
                                {isLoadingThis
                                  ? <Loader2 size={16} className="animate-spin" />
                                  : <><span>Upgrade back to {plan.name}</span><ArrowRight size={14} /></>}
                              </button>
                              <div style={{ fontSize: '12px', textAlign: 'center', marginBottom: '16px', padding: '8px', borderRadius: '8px', background: 'rgba(245,158,11,0.08)', border: '0.5px solid rgba(245,158,11,0.25)' }}>
                                <span style={{ color: '#b45309', fontFamily: 'Inter, sans-serif' }}>
                                  {plan.name} benefits active{periodEnd
                                    ? <> until <span style={{ fontWeight: 700 }}>{periodEnd}</span></>
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
                                style={{ ...primaryBtnStyle, opacity: loading === 'portal' ? 0.6 : 1 }}
                                onMouseEnter={onPrimaryEnter} onMouseLeave={onPrimaryLeave}
                              >
                                {loading === 'portal' ? <Loader2 size={16} className="animate-spin" /> : 'Manage subscription'}
                              </button>
                              <div style={{ fontSize: '12px', textAlign: 'center', marginBottom: '16px', padding: '8px', borderRadius: '8px', background: '#ededff', border: '0.5px solid rgba(91,80,255,0.25)' }}>
                                <span style={{ color: '#5B50FF', fontFamily: 'Inter, sans-serif' }}>
                                  Switching to {plan.name}{periodEnd
                                    ? <> on <span style={{ fontWeight: 700 }}>{periodEnd}</span></>
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

                        const isCancelled  = subInfo?.status === 'cancelled' || subInfo?.status === 'canceled';
                        // Stripe keeps status 'active' until the period actually ends after a portal cancellation
                        const isCancelling = !isCancelled && !!subInfo?.cancel_at_period_end;

                        const statusNode = isCurrent && subInfo && subInfo.plan !== 'free' ? (
                          <div style={{ fontSize: '12px', textAlign: 'center', marginBottom: '16px', fontFamily: 'Inter, sans-serif', color: '#6b6490' }}>
                            {isCancelled ? (
                              <span style={{ color: '#ef4444' }}>Cancelled - access ends {periodEnd}</span>
                            ) : isCancelling ? (
                              <span style={{ color: '#ef4444' }}>Cancelled - enjoy {plan.name} until {periodEnd}</span>
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
                              style={{ ...(isCurrent ? secondaryBtnStyle : primaryBtnStyle), opacity: isLoading ? 0.6 : 1 }}
                              onMouseEnter={isCurrent ? onSecondaryEnter : onPrimaryEnter}
                              onMouseLeave={isCurrent ? onSecondaryLeave : onPrimaryLeave}
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
                        <div style={{ marginBottom: '20px', borderRadius: '8px', padding: '16px', background: '#ededff', border: '0.5px solid rgba(91,80,255,0.18)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 600, color: '#3d3660' }}>Customize credits / month</span>
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 700, color: '#5B50FF' }}>
                              {ULTRA_TIERS[ultraTier].credits.toLocaleString()}
                            </span>
                          </div>
                          <div style={{ position: 'relative', marginBottom: '12px' }}>
                            <input
                              type="range" min={0} max={ULTRA_TIERS.length - 1} step={1}
                              value={ultraTier}
                              onChange={e => setUltraTier(Number(e.target.value))}
                              className="ultra-slider"
                              style={{
                                width: '100%', height: '6px', borderRadius: '9999px', appearance: 'none', cursor: 'pointer',
                                background: `linear-gradient(to right, #5B50FF ${(ultraTier / (ULTRA_TIERS.length - 1)) * 100}%, #dcdaff ${(ultraTier / (ULTRA_TIERS.length - 1)) * 100}%)`,
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            {ULTRA_TIERS.map((t, idx) => (
                              <button
                                key={idx}
                                onClick={() => setUltraTier(idx)}
                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'all 0.15s' }}
                              >
                                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 600, color: ultraTier === idx ? '#5B50FF' : '#6b6490' }}>
                                  {(t.credits / 1000).toFixed(0)}k
                                </span>
                              </button>
                            ))}
                          </div>
                          {billing === 'annual' && (
                            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', textAlign: 'center', marginTop: '10px', fontWeight: 600, color: '#16a34a' }}>
                              {Math.round(ULTRA_TIERS[ultraTier].annualDiscount * 100)}% off on annual - more credits = bigger discount
                            </p>
                          )}
                        </div>
                      )}

                      {/* Features */}
                      <ul style={{ display: 'flex', flexDirection: 'column', gap: '11px', flex: 1, listStyle: 'none', padding: 0, margin: 0 }}>
                        {/* Speed & parallel at top */}
                        <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontFamily: 'Inter, sans-serif' }}>
                          <span style={{ flexShrink: 0 }}>{plan.speed.emoji}</span>
                          <span style={{ fontWeight: 600, color: plan.speed.color }}>{plan.speed.label}</span>
                        </li>
                        <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontFamily: 'Inter, sans-serif' }}>
                          <span style={{ flexShrink: 0 }}>🔀</span>
                          <span style={{ color: '#3d3660' }}>{plan.parallel.label}</span>
                        </li>
                        <li style={{ height: '0.5px', margin: '4px 0', background: '#e8e8f0' }} />
                        {plan.features.map(f => (
                          <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontFamily: 'Inter, sans-serif' }}>
                            <Check size={14} style={{ color: plan.color, flexShrink: 0 }} />
                            <span style={{ color: '#3d3660' }}>{f}</span>
                          </li>
                        ))}
                        {plan.locked?.map(f => (
                          <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontFamily: 'Inter, sans-serif' }}>
                            <X size={14} style={{ color: '#c4beff', flexShrink: 0 }} />
                            <span style={{ color: '#a8a2c4', textDecoration: 'line-through' }}>{f}</span>
                          </li>
                        ))}
                      </ul>

                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', color: '#a8a2c4', marginTop: '16px', textAlign: 'center' }}>
                        Roughly {Math.floor(credits / 90)} five-slide decks a month
                      </p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── ENTERPRISE ── */}
      <section style={{ padding: '120px 24px 0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <Reveal>
            <div style={{
              borderRadius: '8px', padding: '48px',
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '32px',
              background: '#ffffff', border: '0.5px solid #e8e8f0',
              boxShadow: '0 1px 2px rgba(13,11,26,0.04), 0 8px 24px -8px rgba(13,11,26,0.06)',
            }} className="pricing-enterprise">
              <div style={{ flex: 1 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 9px', borderRadius: '4px', background: '#ededff', border: '0.5px solid rgba(91,80,255,0.28)', color: '#5B50FF', marginBottom: '16px', fontFamily: 'Inter, sans-serif', fontSize: '9px', fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                  Enterprise
                </div>
                <h3 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(28px, 3vw, 36px)', fontWeight: 400, letterSpacing: '-0.02em', color: '#0d0b1a', marginBottom: '12px', lineHeight: 1.1 }}>
                  Need a custom plan for your team?
                </h3>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', color: '#3d3660', maxWidth: '560px', lineHeight: 1.65 }}>
                  Custom credit volumes, shared team workspaces, priority onboarding, SLA support, and flexible billing.
                  Reach out and we'll build a plan around your needs.
                </p>
              </div>
              <a
                href="mailto:team@hyperbeing.co?subject=Enterprise Plan Enquiry"
                style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', fontWeight: 600, color: '#fff', background: '#5B50FF', border: 'none', borderRadius: '6px', padding: '14px 32px', cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0, transition: 'background 0.15s' }}
                onMouseEnter={e => e.target.style.background = '#6E63FF'}
                onMouseLeave={e => e.target.style.background = '#5B50FF'}
              >
                Contact us →
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── HOW CREDITS WORK ── */}
      <section style={{ padding: '64px 24px 0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <Reveal>
            <div style={{
              borderRadius: '8px', padding: '40px',
              background: '#ffffff', border: '0.5px solid #e8e8f0',
              boxShadow: '0 1px 2px rgba(13,11,26,0.04), 0 8px 24px -8px rgba(13,11,26,0.06)',
            }}>
              <h3 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: '24px', fontWeight: 400, letterSpacing: '-0.02em', color: '#0d0b1a', marginBottom: '6px' }}>How credits work</h3>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#6b6490', marginBottom: '24px' }}>Each AI action deducts credits from your monthly balance. Unused credits don't roll over.</p>
              <div className="pricing-credit-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                {CREDIT_TABLE.map(({ action, cost }) => (
                  <div key={action} style={{ borderRadius: '8px', padding: '16px', background: '#f5f5f5', border: '0.5px solid #e8e8f0' }}>
                    <p style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: '26px', fontWeight: 400, letterSpacing: '-0.02em', color: '#5B50FF', marginBottom: '2px' }}>{cost}</p>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 600, color: '#0d0b1a', marginBottom: '2px' }}>credits</p>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#6b6490' }}>{action}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <p style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#6b6490', margin: '32px 0 0' }}>
            New accounts get <span style={{ color: '#0d0b1a', fontWeight: 600 }}>54 free credits</span> to try HyperBeing - no card required.
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#ffffff', borderTop: '0.5px solid #e8e8f0', padding: '64px 24px 40px', marginTop: '120px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div className="pricing-footer-grid" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: '48px', marginBottom: '48px' }}>
            {/* Brand */}
            <div>
              <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', marginBottom: '12px' }}>
                <Logo height={32} />
              </Link>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#6b6490', maxWidth: '180px', lineHeight: 1.6 }}>AI-powered presentation studio.</p>
            </div>
            {/* Product */}
            <div>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: 600, color: '#0d0b1a', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>Product</p>
              {['Features', 'Examples', 'Pricing', 'Enterprise'].map(l => (
                <a key={l} href="#" style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#6b6490', textDecoration: 'none', marginBottom: '10px', transition: 'color 0.15s' }}
                   onMouseEnter={e => e.target.style.color = '#0d0b1a'}
                   onMouseLeave={e => e.target.style.color = '#6b6490'}>{l}</a>
              ))}
            </div>
            {/* Company */}
            <div>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: 600, color: '#0d0b1a', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>Company</p>
              {['About', 'Blog', 'Careers', 'Contact'].map(l => (
                <a key={l} href="#" style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#6b6490', textDecoration: 'none', marginBottom: '10px', transition: 'color 0.15s' }}
                   onMouseEnter={e => e.target.style.color = '#0d0b1a'}
                   onMouseLeave={e => e.target.style.color = '#6b6490'}>{l}</a>
              ))}
            </div>
            {/* Legal */}
            <div>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: 600, color: '#0d0b1a', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>Legal</p>
              {[{ label: 'Privacy', to: '/privacy' }, { label: 'Terms', to: '/terms' }].map(l => (
                <Link key={l.label} to={l.to} style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#6b6490', textDecoration: 'none', marginBottom: '10px' }}>{l.label}</Link>
              ))}
            </div>
          </div>
          <div style={{ borderTop: '0.5px solid #e8e8f0', paddingTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#6b6490' }}>&copy; {new Date().getFullYear()} HyperBeing. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Downgrade confirmation modal */}
      <AnimatePresence>
        {downgradeModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(13,11,26,0.45)' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              style={{ width: '100%', maxWidth: '440px', borderRadius: '12px', padding: '28px', background: '#ffffff', border: '0.5px solid #e8e8f0', boxShadow: '0 1px 2px rgba(13,11,26,0.04), 0 8px 24px -8px rgba(13,11,26,0.06), 0 16px 48px rgba(13,11,26,0.12)' }}
            >
              <div style={{ width: 48, height: 48, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', fontSize: '22px', background: '#ededff', border: '0.5px solid rgba(91,80,255,0.2)' }}>
                📅
              </div>
              <h3 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: '24px', fontWeight: 400, letterSpacing: '-0.02em', color: '#0d0b1a', marginBottom: '8px' }}>Downgrade confirmed</h3>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', lineHeight: 1.6, marginBottom: '12px', color: '#3d3660' }}>
                Your <span style={{ color: '#0d0b1a', fontWeight: 600, textTransform: 'capitalize' }}>{downgradeModal.fromPlan}</span> plan stays fully active until{' '}
                <span style={{ color: '#0d0b1a', fontWeight: 700 }}>{formatDate(downgradeModal.periodEnd)}</span>. You keep all{' '}
                <span style={{ textTransform: 'capitalize' }}>{downgradeModal.fromPlan}</span> credits and features until then.
              </p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', lineHeight: 1.6, marginBottom: '20px', color: '#3d3660' }}>
                On <span style={{ color: '#0d0b1a', fontWeight: 700 }}>{formatDate(downgradeModal.periodEnd)}</span>, your subscription automatically switches to{' '}
                <span style={{ fontWeight: 600, textTransform: 'capitalize', color: '#5B50FF' }}>{downgradeModal.pendingPlan}</span> and you'll be billed at the{' '}
                <span style={{ textTransform: 'capitalize' }}>{downgradeModal.pendingPlan}</span> plan rate going forward.
              </p>
              <div style={{ borderRadius: '8px', padding: '12px 16px', marginBottom: '24px', display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#f5f5f5', border: '0.5px solid #e8e8f0' }}>
                <span style={{ fontSize: '15px', marginTop: '1px' }}>💡</span>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#6b6490' }}>
                  No charges today. You can revert this by upgrading back before{' '}
                  <span style={{ color: '#3d3660' }}>{formatDate(downgradeModal.periodEnd)}</span>.
                </p>
              </div>
              <button
                onClick={() => setDowngradeModal(null)}
                style={{ width: '100%', fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 600, color: '#fff', background: '#5B50FF', border: 'none', borderRadius: '6px', padding: '13px', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => e.target.style.background = '#6E63FF'}
                onMouseLeave={e => e.target.style.background = '#5B50FF'}
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @media (max-width: 900px) {
          .pricing-grid {
            grid-template-columns: 1fr !important;
          }
          .pricing-enterprise {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .pricing-credit-grid {
            grid-template-columns: 1fr !important;
          }
          .pricing-footer-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 640px) {
          nav > div > div[style*="justify-content: center"] {
            display: none !important;
          }
          nav > div {
            gap: 12px !important;
          }
        }
      `}</style>
    </div>
  );
}
