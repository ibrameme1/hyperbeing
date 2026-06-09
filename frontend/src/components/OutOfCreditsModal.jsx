import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Crown, Rocket, ArrowRight, Loader2, Settings } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { track } from '../utils/track';

const UPGRADE_OPTIONS = {
  free:  [{ key: 'basic', name: 'Basic', price: 25 }, { key: 'pro', name: 'Pro', price: 65 }],
  basic: [{ key: 'pro', name: 'Pro', price: 65 }, { key: 'ultra', name: 'Ultra', price: 149 }],
  pro:   [{ key: 'ultra', name: 'Ultra', price: 149 }],
  ultra: [],
};

const PLAN_ICONS = { basic: Zap, pro: Crown, ultra: Rocket };
const PLAN_COLORS = { basic: '#5B50FF', pro: '#8B80FF', ultra: '#22c55e' };

export default function OutOfCreditsModal({ currentPlan = 'free', onClose }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null);
  const upgrades = UPGRADE_OPTIONS[currentPlan] || [];
  useEffect(() => { track('out_of_credits', { current_plan: currentPlan }); }, []);

  async function handleUpgrade(planKey) {
    setLoading(planKey);
    try {
      const { data } = await api.post('/billing/checkout', { planKey, billing: 'monthly' });
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
                {currentPlan === 'ultra'
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
