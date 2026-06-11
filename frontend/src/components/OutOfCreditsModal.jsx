import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Crown, Rocket, ArrowRight, Loader2, Settings } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { track } from '../utils/track';

// Plans the checkout endpoint will accept. Ultra tiers 1-4 all map to
// planKey: 'ultra' + an ultraTier index (0-3).
const PLAN_INFO = {
  basic:  { name: 'Basic',   price: 25,  checkout: { planKey: 'basic' } },
  pro:    { name: 'Pro',     price: 65,  checkout: { planKey: 'pro' } },
  ultra1: { name: 'Ultra 1', price: 149, checkout: { planKey: 'ultra', ultraTier: 0 } },
  ultra2: { name: 'Ultra 2', price: 209, checkout: { planKey: 'ultra', ultraTier: 1 } },
  ultra3: { name: 'Ultra 3', price: 269, checkout: { planKey: 'ultra', ultraTier: 2 } },
  ultra4: { name: 'Ultra 4', price: 299, checkout: { planKey: 'ultra', ultraTier: 3 } },
};

const PLAN_LADDER = ['free', 'basic', 'pro', 'ultra1', 'ultra2', 'ultra3', 'ultra4'];

const PLAN_ICONS = { basic: Zap, pro: Crown, ultra1: Rocket, ultra2: Rocket, ultra3: Rocket, ultra4: Rocket };

function getUpgradeOptions(currentPlan, suggestedPlan) {
  // Legacy 'ultra' rows are equivalent to ultra1 for ladder purposes.
  const normalized = currentPlan === 'ultra' ? 'ultra1' : currentPlan;
  const idx = Math.max(PLAN_LADDER.indexOf(normalized), 0);
  let options = PLAN_LADDER.slice(idx + 1).map(key => ({ key, ...PLAN_INFO[key] }));

  // Put the suggested plan first if it's one of the available options
  if (suggestedPlan && options.some(o => o.key === suggestedPlan)) {
    options = [
      options.find(o => o.key === suggestedPlan),
      ...options.filter(o => o.key !== suggestedPlan),
    ];
  }
  return options.slice(0, 2);
}

const ACTION_LABELS = {
  create_presentation: 'generate this presentation',
  add_slides: 'add these slides',
  slide_edit: 'edit this slide',
  unlock_slides: 'unlock these slides',
  prompt_chat: 'send this message',
};

export default function OutOfCreditsModal({ currentPlan = 'free', details = null, onClose }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null);
  const upgrades = getUpgradeOptions(currentPlan, details?.suggested_plan);
  useEffect(() => { track('out_of_credits', { current_plan: currentPlan, action_type: details?.action_type }); }, []);

  async function handleUpgrade(planKey) {
    setLoading(planKey);
    try {
      const checkout = PLAN_INFO[planKey]?.checkout || { planKey };
      const { data } = await api.post('/billing/checkout', { ...checkout, billing: 'monthly' });
      window.location.href = data.url;
    } catch {
      setLoading(null);
    }
  }

  async function handlePortal() {
    setLoading('portal');
    try {
      const { data } = await api.post('/billing/portal');
      window.location.href = data.url;
    } catch {
      setLoading(null);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md overflow-hidden"
          style={{ background: '#141414', border: '0.5px solid #1e1e1e', borderRadius: 12, padding: 28 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 style={{ fontFamily: 'Playfair Display,Georgia,serif', fontSize: 24, color: '#f0f0ee', fontWeight: 700, marginBottom: 6 }}>
                You're out of credits
              </h2>
              <p style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 14, color: '#888888' }}>
                {details?.action_type && ACTION_LABELS[details.action_type]
                  ? `You need ${details.credits_needed ?? 'more'} credits to ${ACTION_LABELS[details.action_type]}, but you only have ${details.credits_remaining ?? 0} left.`
                  : currentPlan?.startsWith('ultra')
                    ? 'Your credits reset at the start of your next billing cycle.'
                    : 'Top up by upgrading your plan or wait for your next billing cycle.'}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{ color: '#555555', background: 'none', border: 'none', cursor: 'pointer', marginTop: 2 }}
              onMouseEnter={e => e.currentTarget.style.color = '#888888'}
              onMouseLeave={e => e.currentTarget.style.color = '#555555'}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Upgrade options */}
            {upgrades.length > 0 && (
              <>
                <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: '#888888', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: 4 }}>
                  Upgrade your plan
                </p>
                {upgrades.map(({ key, name, price }) => {
                  const Icon = PLAN_ICONS[key];
                  const isPopular = key === 'pro';
                  return (
                    <button
                      key={key}
                      onClick={() => handleUpgrade(key)}
                      disabled={!!loading}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 16,
                        background: isPopular ? 'rgba(91,80,255,0.06)' : '#0f0f0f',
                        border: isPopular ? '0.5px solid rgba(91,80,255,0.4)' : '0.5px solid #1e1e1e',
                        borderRadius: 8,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        opacity: loading ? 0.5 : 1,
                        transition: 'opacity 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(91,80,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {loading === key ? <Loader2 size={14} style={{ color: '#8B80FF' }} className="animate-spin" /> : <Icon size={14} style={{ color: '#8B80FF' }} />}
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: '#888888', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{name}</p>
                          <p style={{ fontFamily: 'Playfair Display,serif', fontSize: 28, color: '#f0f0ee', lineHeight: 1.1 }}>${price}<span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#888888', fontWeight: 400 }}>/mo</span></p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                        <button
                          onClick={e => { e.stopPropagation(); handleUpgrade(key); }}
                          disabled={!!loading}
                          style={{ background: '#5B50FF', borderRadius: 6, color: '#fff', fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600, padding: '8px 16px', border: 'none', cursor: 'pointer' }}
                        >
                          Upgrade
                        </button>
                      </div>
                    </button>
                  );
                })}
              </>
            )}

            {/* Manage / downgrade */}
            {currentPlan !== 'free' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
                  <div style={{ flex: 1, height: 1, background: '#1e1e1e' }} />
                  <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#555555' }}>or</span>
                  <div style={{ flex: 1, height: 1, background: '#1e1e1e' }} />
                </div>
                <button
                  onClick={handlePortal}
                  disabled={!!loading}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 16,
                    background: '#0f0f0f',
                    border: '0.5px solid #1e1e1e',
                    borderRadius: 8,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {loading === 'portal' ? <Loader2 size={14} style={{ color: '#555555' }} className="animate-spin" /> : <Settings size={14} style={{ color: '#555555' }} />}
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#555555', fontWeight: 400 }}>Manage billing</p>
                      <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#555555' }}>Change or downgrade your plan</p>
                    </div>
                  </div>
                  <ArrowRight size={15} style={{ color: '#555555' }} />
                </button>
              </>
            )}

            {/* View all plans */}
            <button
              onClick={() => { onClose(); navigate('/pricing'); }}
              style={{ width: '100%', textAlign: 'center', fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#555555', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0' }}
              onMouseEnter={e => e.currentTarget.style.color = '#888888'}
              onMouseLeave={e => e.currentTarget.style.color = '#555555'}
            >
              View all plans →
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
