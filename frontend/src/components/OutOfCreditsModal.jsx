import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Crown, Rocket, ArrowRight, Loader2, Settings } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

const UPGRADE_OPTIONS = {
  free:  [{ key: 'basic', name: 'Basic', price: 25 }, { key: 'pro', name: 'Pro', price: 65 }],
  basic: [{ key: 'pro', name: 'Pro', price: 65 }, { key: 'ultra', name: 'Ultra', price: 149 }],
  pro:   [{ key: 'ultra', name: 'Ultra', price: 149 }],
  ultra: [],
};

const PLAN_ICONS = { basic: Zap, pro: Crown, ultra: Rocket };
const PLAN_COLORS = { basic: '#8B5CF6', pro: '#00F0FF', ultra: '#10B981' };
const PLAN_GRADIENTS = {
  basic: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
  pro:   'linear-gradient(135deg, #00F0FF 0%, #8B5CF6 100%)',
  ultra: 'linear-gradient(135deg, #10B981 0%, #00F0FF 100%)',
};

export default function OutOfCreditsModal({ currentPlan = 'free', onClose }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null);
  const upgrades = UPGRADE_OPTIONS[currentPlan] || [];

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
          className="w-full max-w-md rounded-3xl overflow-hidden"
          style={{ background: '#111114', border: '1px solid rgba(255,255,255,0.1)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-7 pt-7 pb-5 flex items-start justify-between">
            <div>
              <div className="text-2xl mb-1">😮</div>
              <h2 className="text-white font-bold text-xl">You're out of credits</h2>
              <p className="text-white/45 text-sm mt-1">
                {currentPlan === 'ultra'
                  ? 'Your credits reset at the start of your next billing cycle.'
                  : 'Top up by upgrading your plan or wait for your next billing cycle.'}
              </p>
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors mt-1">
              <X size={18} />
            </button>
          </div>

          <div className="px-7 pb-7 space-y-3">
            {/* Upgrade options */}
            {upgrades.length > 0 && (
              <>
                <p className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-2">Upgrade your plan</p>
                {upgrades.map(({ key, name, price }) => {
                  const Icon = PLAN_ICONS[key];
                  return (
                    <button
                      key={key}
                      onClick={() => handleUpgrade(key)}
                      disabled={!!loading}
                      className="w-full flex items-center justify-between p-4 rounded-2xl transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                      style={{ background: PLAN_GRADIENTS[key], boxShadow: `0 4px 20px ${PLAN_COLORS[key]}30` }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                          {loading === key ? <Loader2 size={14} className="animate-spin text-white" /> : <Icon size={14} className="text-white" />}
                        </div>
                        <div className="text-left">
                          <p className="text-white font-bold text-sm">{name}</p>
                          <p className="text-white/70 text-xs">${price}/month</p>
                        </div>
                      </div>
                      <ArrowRight size={15} className="text-white/80" />
                    </button>
                  );
                })}
              </>
            )}

            {/* Manage / downgrade */}
            {currentPlan !== 'free' && (
              <>
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
                  <span className="text-xs text-white/25">or</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
                </div>
                <button
                  onClick={handlePortal}
                  disabled={!!loading}
                  className="w-full flex items-center justify-between p-4 rounded-2xl transition-all duration-200 hover:opacity-80 disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      {loading === 'portal' ? <Loader2 size={14} className="animate-spin text-white/60" /> : <Settings size={14} className="text-white/60" />}
                    </div>
                    <div className="text-left">
                      <p className="text-white/80 font-semibold text-sm">Manage billing</p>
                      <p className="text-white/35 text-xs">Change or downgrade your plan</p>
                    </div>
                  </div>
                  <ArrowRight size={15} className="text-white/30" />
                </button>
              </>
            )}

            {/* View all plans */}
            <button
              onClick={() => { onClose(); navigate('/pricing'); }}
              className="w-full text-center text-xs text-white/30 hover:text-white/55 transition-colors py-2"
            >
              View all plans →
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
