import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Sparkles, Zap, Crown, Rocket, ArrowRight, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';

const DISCOUNTS = { basic: 0.20, pro: 0.25, ultra: 0.30 };

const PLANS = [
  {
    key: 'basic',
    name: 'Basic',
    monthlyPrice: 25,
    credits: 100,
    icon: Zap,
    color: '#8B5CF6',
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
    glow: 'rgba(139,92,246,0.35)',
    presentations: '~10',
    features: [
      '100 credits / month',
      '~10 full presentations',
      'Up to 10 slides each',
      'AI image generation',
      'PDF & PNG export',
      'Email support',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    monthlyPrice: 65,
    credits: 500,
    icon: Crown,
    color: '#00F0FF',
    gradient: 'linear-gradient(135deg, #00F0FF 0%, #FF7BAC 100%)',
    glow: 'rgba(0,240,255,0.35)',
    presentations: '~50',
    popular: true,
    features: [
      '500 credits / month',
      '~50 full presentations',
      'Up to 10 slides each',
      'AI image generation',
      'PDF & PNG export',
      'Add slides feature',
      'Reference image uploads',
      'Priority support',
    ],
  },
  {
    key: 'ultra',
    name: 'Ultra',
    monthlyPrice: 149,
    credits: 2000,
    icon: Rocket,
    color: '#00D4FF',
    gradient: 'linear-gradient(135deg, #00D4FF 0%, #0095CC 100%)',
    glow: 'rgba(0,212,255,0.35)',
    presentations: '~200',
    features: [
      '2,000 credits / month',
      '~200 full presentations',
      'Up to 10 slides each',
      'AI image generation',
      'PDF & PNG export',
      'Add slides feature',
      'Reference image uploads',
      'Custom brand kits',
      'Team workspace (soon)',
      'Dedicated support',
    ],
  },
];

const CREDIT_TABLE = [
  { action: 'Create full presentation (10 slides)', cost: 10 },
  { action: 'Add slides (per batch)', cost: 3 },
  { action: 'Regenerate a slide', cost: 1 },
];

function annualPrice(plan) {
  return Math.round(plan.monthlyPrice * (1 - DISCOUNTS[plan.key]));
}

export default function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [billing, setBilling] = useState('monthly');
  const [currentPlan, setCurrentPlan] = useState('free');
  const [creditsLeft, setCreditsLeft] = useState(null);
  const [loading, setLoading] = useState(null);

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

  return (
    <div className="min-h-screen" style={{ background: '#0A0A0B' }}>
      {/* Aurora bg */}
      <div className="fixed top-0 left-1/4 w-[700px] h-[700px] rounded-full pointer-events-none"
           style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 65%)', filter: 'blur(80px)' }} />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] rounded-full pointer-events-none"
           style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.12) 0%, transparent 65%)', filter: 'blur(80px)' }} />

      {/* Nav */}
      <div className="relative z-10 flex items-center justify-between px-8 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
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
              {creditsLeft} credits left
            </span>
          )}
          {user && currentPlan !== 'free' && (
            <button onClick={handleManage} className="text-sm text-white/50 hover:text-white/80 transition-colors">
              {loading === 'portal' ? <Loader2 size={14} className="animate-spin" /> : 'Manage billing →'}
            </button>
          )}
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-16">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-6"
               style={{ background: 'rgba(139,92,246,0.15)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.25)' }}>
            <Sparkles size={12} /> Simple, transparent pricing
          </div>
          <h1 className="font-display text-5xl font-bold text-white mb-4">
            Pick your plan,{' '}
            <span style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              start creating
            </span>
          </h1>
          <p className="text-white/50 text-lg max-w-xl mx-auto mb-10">
            Every plan includes AI image generation, PDF export, and Nova's full art direction engine.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {['monthly', 'annual'].map(b => (
              <button
                key={b}
                onClick={() => setBilling(b)}
                className="relative px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
                style={billing === b
                  ? { background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)', color: '#fff' }
                  : { color: 'rgba(255,255,255,0.45)' }}
              >
                {b === 'monthly' ? 'Monthly' : (
                  <span className="flex items-center gap-2">
                    Annual
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(0,240,255,0.2)', color: '#00F0FF' }}>
                      Save up to 30%
                    </span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {PLANS.map((plan, i) => {
            const Icon = plan.icon;
            const isCurrent = currentPlan === plan.key;
            const isLoading = loading === plan.key;
            const displayPrice = billing === 'annual' ? annualPrice(plan) : plan.monthlyPrice;
            const discount = DISCOUNTS[plan.key];

            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 32 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className="relative rounded-3xl p-7 flex flex-col"
                style={{
                  background: plan.popular
                    ? 'linear-gradient(145deg, rgba(0,240,255,0.12) 0%, rgba(139,92,246,0.08) 100%)'
                    : 'rgba(255,255,255,0.04)',
                  border: plan.popular
                    ? '1.5px solid rgba(0,240,255,0.4)'
                    : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-xs font-bold text-white"
                       style={{ background: 'linear-gradient(135deg, #00F0FF 0%, #8B5CF6 100%)', boxShadow: `0 4px 20px ${plan.glow}` }}>
                    Most popular
                  </div>
                )}

                {/* Icon + name */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
                       style={{ background: plan.gradient, boxShadow: `0 4px 20px ${plan.glow}` }}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-lg leading-none">{plan.name}</p>
                    <p className="text-white/40 text-xs mt-0.5">{plan.presentations} presentations/mo</p>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-end gap-2">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={`${plan.key}-${billing}`}
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.2 }}
                        className="text-4xl font-bold text-white"
                      >
                        ${displayPrice}
                      </motion.span>
                    </AnimatePresence>
                    <span className="text-white/40 text-sm mb-1.5">/month</span>
                    {billing === 'annual' && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-lg mb-1.5" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>
                        {Math.round(discount * 100)}% off
                      </span>
                    )}
                  </div>
                  {billing === 'annual' && (
                    <p className="text-xs text-white/30 mt-0.5">
                      Billed ${displayPrice * 12}/year · <span className="line-through">${plan.monthlyPrice}/mo</span>
                    </p>
                  )}
                  <p className="text-sm mt-1.5" style={{ color: plan.color }}>{plan.credits.toLocaleString()} credits included</p>
                </div>

                {/* CTA */}
                <button
                  onClick={() => isCurrent ? handleManage() : handleSubscribe(plan.key)}
                  disabled={isLoading}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] mb-7 disabled:opacity-60"
                  style={isCurrent
                    ? { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)' }
                    : { background: plan.gradient, color: '#fff', boxShadow: `0 4px 24px ${plan.glow}` }
                  }
                >
                  {isLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : isCurrent ? (
                    'Current plan'
                  ) : (
                    <><span>Get {plan.name}</span> <ArrowRight size={15} /></>
                  )}
                </button>

                {/* Features */}
                <ul className="space-y-3 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                           style={{ background: `${plan.color}25` }}>
                        <Check size={10} style={{ color: plan.color }} />
                      </div>
                      <span className="text-white/65">{f}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>

        {/* Credit cost table */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="rounded-3xl p-8 mb-12"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <h3 className="text-white font-bold text-xl mb-2">How credits work</h3>
          <p className="text-white/40 text-sm mb-6">Each AI action deducts credits from your monthly balance. Unused credits don't roll over.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {CREDIT_TABLE.map(({ action, cost }) => (
              <div key={action} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-2xl font-bold mb-1" style={{ color: '#8B5CF6' }}>{cost}</p>
                <p className="text-xs font-semibold text-white/80 mb-0.5">credits</p>
                <p className="text-xs text-white/40">{action}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Free tier note */}
        <p className="text-center text-white/30 text-sm">
          New accounts get <span className="text-white/60 font-semibold">5 free credits</span> to try HyperBeing — no card required.
        </p>
      </div>
    </div>
  );
}
