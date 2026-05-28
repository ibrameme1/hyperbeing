import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Sparkles, Zap, Crown, Rocket, ArrowRight, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';

const sliderThumbStyle = `
  input[type='range'].ultra-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 22px; height: 22px;
    border-radius: 50%;
    background: #fff;
    border: 3px solid #00F0FF;
    box-shadow: 0 0 10px rgba(0,240,255,0.5);
    cursor: pointer;
  }
  input[type='range'].ultra-slider::-moz-range-thumb {
    width: 22px; height: 22px;
    border-radius: 50%;
    background: #fff;
    border: 3px solid #00F0FF;
    box-shadow: 0 0 10px rgba(0,240,255,0.5);
    cursor: pointer;
  }
`;

// All credits displayed ×10 vs backend — same ratios, bigger numbers
const CM = 10;

const ULTRA_TIERS = [
  { credits: 20000, price: 149, annualDiscount: 0.22 },
  { credits: 35000, price: 209, annualDiscount: 0.25 },
  { credits: 50000, price: 269, annualDiscount: 0.28 },
  { credits: 60000, price: 299, annualDiscount: 0.30 },
];

const PLANS = [
  {
    key: 'basic',
    name: 'Basic',
    tagline: 'For first-time AI presentation creators',
    monthlyPrice: 25,
    backendCredits: 100,
    annualDiscount: null,
    icon: Zap,
    color: '#9CA3AF',
    gradient: 'linear-gradient(135deg, #374151 0%, #4B5563 100%)',
    border: 'rgba(107,114,128,0.3)',
    glow: 'rgba(107,114,128,0.2)',
    speed: { label: 'Standard Speed', emoji: '🐢', color: '#9CA3AF' },
    parallel: { label: 'Up to 3 slides at once', emoji: '⬛' },
    features: [
      'AI image generation',
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
    backendCredits: 500,
    annualDiscount: 0.20,
    icon: Crown,
    color: '#8B5CF6',
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
    border: 'rgba(139,92,246,0.5)',
    glow: 'rgba(139,92,246,0.3)',
    speed: { label: 'Fast Generation', emoji: '⚡', color: '#F59E0B' },
    parallel: { label: 'Up to 6 slides at once', emoji: '⬛' },
    popular: true,
    features: [
      'AI image generation',
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
    backendCredits: 2000,
    annualDiscount: 0.22,
    icon: Rocket,
    color: '#00F0FF',
    gradient: 'linear-gradient(135deg, #0891B2 0%, #06B6D4 100%)',
    border: 'rgba(0,240,255,0.45)',
    glow: 'rgba(0,240,255,0.25)',
    speed: { label: 'Fastest Generation', emoji: '🚀', color: '#10B981' },
    parallel: { label: 'Unlimited parallel generation', emoji: '⬛' },
    bestValue: true,
    features: [
      'AI image generation',
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
  { action: 'Create full presentation (10 slides)', cost: 100 },
  { action: 'Add slides (per batch)', cost: 30 },
  { action: 'Regenerate a slide', cost: 10 },
];

export default function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [billing, setBilling] = useState('monthly');
  const [currentPlan, setCurrentPlan] = useState('free');
  const [creditsLeft, setCreditsLeft] = useState(null);
  const [loading, setLoading] = useState(null);
  const [ultraTier, setUltraTier] = useState(0);

  useEffect(() => {
    if (user) {
      api.get('/billing/subscription')
        .then(r => {
          setCurrentPlan(r.data.subscription.plan);
          setCreditsLeft(r.data.subscription.credits_remaining);
        })
        .catch(() => {});
    }
  }, [user]);

  async function handleSubscribe(planKey) {
    if (!user) { navigate('/login'); return; }
    if (planKey === currentPlan) return;
    setLoading(planKey);
    try {
      const { data } = await api.post('/billing/checkout', { planKey, billing });
      window.location.href = data.url;
    } catch (err) {
      alert(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(null);
    }
  }

  async function handleManage() {
    setLoading('portal');
    try {
      const { data } = await api.post('/billing/portal');
      window.location.href = data.url;
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
    return plan.backendCredits * CM;
  }

  function getAnnualDiscount(plan) {
    if (plan.key === 'ultra') return ULTRA_TIERS[ultraTier].annualDiscount;
    return plan.annualDiscount;
  }

  return (
    <div className="min-h-screen" style={{ background: '#07070A' }}>
      <div className="fixed top-0 left-1/4 w-[600px] h-[600px] rounded-full pointer-events-none"
           style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 65%)', filter: 'blur(80px)' }} />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] rounded-full pointer-events-none"
           style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.08) 0%, transparent 65%)', filter: 'blur(80px)' }} />

      <style>{sliderThumbStyle}</style>
      {/* Nav */}
      <div className="relative z-10 flex items-center justify-between px-8 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}>
            <Sparkles size={14} className="text-white" />
          </div>
          <span className="text-white font-bold text-base">HyperBeing</span>
        </button>
        <div className="flex items-center gap-3">
          {creditsLeft !== null && (
            <span className="text-sm px-3 py-1.5 rounded-xl" style={{ background: 'rgba(139,92,246,0.15)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.3)' }}>
              {(creditsLeft * CM).toLocaleString()} credits left
            </span>
          )}
          {user && currentPlan !== 'free' && (
            <button onClick={handleManage} className="text-sm text-white/50 hover:text-white/80 transition-colors">
              {loading === 'portal' ? <Loader2 size={14} className="animate-spin" /> : 'Manage / downgrade →'}
            </button>
          )}
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-14">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-5"
               style={{ background: 'rgba(139,92,246,0.15)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.25)' }}>
            <Sparkles size={12} /> Simple, transparent pricing
          </div>
          <h1 className="font-display text-5xl font-bold text-white mb-4">
            Pick your plan,{' '}
            <span style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              start creating
            </span>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-14">
          {PLANS.map((plan, i) => {
            const Icon = plan.icon;
            const isCurrent = currentPlan === plan.key;
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
                style={{ border: `1px solid ${plan.border}`, background: 'rgba(255,255,255,0.03)' }}
              >
                {/* Top badge */}
                {(plan.popular || plan.bestValue) && (
                  <div className="py-2.5 text-center text-xs font-bold text-white tracking-widest uppercase"
                       style={{ background: plan.gradient }}>
                    {plan.popular ? '♦ MOST POPULAR' : '♦ BEST VALUE'}
                  </div>
                )}

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
                    <p className="text-xs text-white/35 ml-7">= {(credits / 100).toFixed(0)} full presentations</p>
                  </div>

                  {/* Ultra credit slider */}
                  {plan.key === 'ultra' && (
                    <div className="mb-5 rounded-2xl p-4" style={{ background: 'rgba(0,240,255,0.05)', border: '1px solid rgba(0,240,255,0.15)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-white/50">Credits / month</span>
                        <span className="text-sm font-bold" style={{ color: '#00F0FF' }}>
                          {ULTRA_TIERS[ultraTier].credits.toLocaleString()}
                        </span>
                      </div>

                      {/* Slider track */}
                      <div className="relative mb-3">
                        <input
                          type="range" min={0} max={ULTRA_TIERS.length - 1} step={1}
                          value={ultraTier}
                          onChange={e => setUltraTier(Number(e.target.value))}
                          className="ultra-slider w-full h-2 rounded-full appearance-none cursor-pointer"
                          style={{
                            background: `linear-gradient(to right, #00F0FF ${(ultraTier / (ULTRA_TIERS.length - 1)) * 100}%, rgba(255,255,255,0.1) ${(ultraTier / (ULTRA_TIERS.length - 1)) * 100}%)`,
                            WebkitAppearance: 'none',
                          }}
                        />
                      </div>

                      {/* Tick labels */}
                      <div className="flex justify-between">
                        {ULTRA_TIERS.map((t, idx) => (
                          <button
                            key={idx}
                            onClick={() => setUltraTier(idx)}
                            className="flex flex-col items-center gap-0.5 transition-all duration-150"
                          >
                            <span className="text-xs font-semibold" style={{ color: ultraTier === idx ? '#00F0FF' : 'rgba(255,255,255,0.3)' }}>
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
                    ) : !plan.annualDiscount && billing === 'annual' ? (
                      <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>Monthly billing only</p>
                    ) : (
                      <p className="text-xs text-white/25 mt-0.5">Billed monthly</p>
                    )}
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() => isCurrent ? handleManage() : handleSubscribe(plan.key)}
                    disabled={isLoading}
                    className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] mb-6 disabled:opacity-60"
                    style={isCurrent
                      ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }
                      : { background: plan.gradient, color: '#fff', boxShadow: `0 4px 20px ${plan.glow}` }
                    }
                  >
                    {isLoading ? <Loader2 size={16} className="animate-spin" /> :
                     isCurrent ? 'Current plan' :
                     <><span>Get {plan.name}</span><ArrowRight size={14} /></>}
                  </button>

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

        {/* Credit cost table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.5 }}
          className="rounded-3xl p-8 mb-10"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <h3 className="text-white font-bold text-xl mb-1.5">How credits work</h3>
          <p className="text-white/35 text-sm mb-6">Each AI action deducts credits from your monthly balance. Unused credits don't roll over.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {CREDIT_TABLE.map(({ action, cost }) => (
              <div key={action} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-2xl font-bold mb-0.5" style={{ color: '#8B5CF6' }}>{cost}</p>
                <p className="text-xs font-semibold text-white/70 mb-0.5">credits</p>
                <p className="text-xs text-white/35">{action}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <p className="text-center text-white/25 text-sm mb-14">
          New accounts get <span className="text-white/55 font-semibold">50 free credits</span> to try HyperBeing — no card required.
        </p>

        {/* Enterprise */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5 }}
          className="rounded-3xl p-10 flex flex-col md:flex-row items-center justify-between gap-8"
          style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(0,240,255,0.06) 100%)', border: '1px solid rgba(139,92,246,0.2)' }}
        >
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4"
                 style={{ background: 'rgba(139,92,246,0.2)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.3)' }}>
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
            style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)', boxShadow: '0 4px 24px rgba(139,92,246,0.35)' }}
          >
            Contact us →
          </a>
        </motion.div>
      </div>
    </div>
  );
}
