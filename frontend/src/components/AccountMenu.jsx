import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, CreditCard, User, BarChart2 } from 'lucide-react';

// ─── Account menu ──────────────────────────────────────────────────────────
export default function AccountMenu({ user, credits, currentPlan, isAdmin, onLogout, onUpgrade }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const PLAN_MAX = { free: 54, basic: 1200, pro: 3200, ultra: 8000, ultra1: 8000, ultra2: 11200, ultra3: 14400, ultra4: 16000 };
  const planMax = PLAN_MAX[currentPlan] ?? 54;
  const pct = isAdmin ? 100 : planMax > 0 ? Math.min(100, Math.round((credits / planMax) * 100)) : 0;
  const low = !isAdmin && credits !== null && credits < 18;

  const ringColor = isAdmin ? '#8B5CF6'
    : pct <= 20 ? '#f87171'
    : pct <= 50 ? '#f59e0b'
    : '#22c55e';
  const circumference = 2 * Math.PI * 16;
  const dash = circumference * (pct / 100);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={`Account menu for ${user?.name || 'your account'}`}
        aria-expanded={open}
        className="relative w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white transition-all duration-200 hover:scale-105"
        style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}
      >
        {/* Credit ring */}
        <svg className="absolute inset-0 w-10 h-10 -rotate-90" viewBox="0 0 40 40">
          <circle
            cx="20" cy="20" r="18" fill="none"
            stroke="rgba(255,255,255,0.15)" strokeWidth="2.5"
            strokeDasharray={low ? '4 3' : undefined}
          />
          <circle
            cx="20" cy="20" r="18" fill="none"
            stroke={ringColor} strokeWidth="2.5"
            strokeDasharray={`${circumference * (pct / 100)} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <span className="relative z-10 text-xs font-bold">{initials}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 mt-2 w-72 rounded-2xl overflow-hidden shadow-2xl z-50"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            {/* User info */}
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
                     style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}>
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{user?.name}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
                </div>
                {isAdmin && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-lg text-white flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}>Admin</span>
                )}
              </div>

              {/* Credits bar */}
              {!isAdmin && credits !== null && (
                <div className="rounded-xl p-3" style={{ background: 'var(--bg-input)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Credits remaining</span>
                    <span className="text-xs font-bold" style={{ color: low ? '#f87171' : '#8B5CF6' }}>
                      {isAdmin ? '∞' : credits.toLocaleString()} / {isAdmin ? '∞' : planMax.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: low
                          ? 'linear-gradient(90deg, #f87171 0%, #fca5a5 100%)'
                          : 'linear-gradient(90deg, #8B5CF6 0%, #00F0FF 100%)',
                      }}
                    />
                  </div>
                  {low && (
                    <p className="text-xs mt-1.5" style={{ color: '#f87171' }}>Running low — upgrade to keep creating</p>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>
                      {currentPlan} plan
                    </span>
                    <button
                      onClick={() => { onUpgrade(); setOpen(false); }}
                      className="text-xs font-semibold transition-colors hover:opacity-80"
                      style={{ color: '#8B5CF6' }}
                    >
                      {currentPlan === 'free' ? 'Upgrade →' : 'Manage plan →'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="h-px" style={{ background: 'var(--border)' }} />

            {/* Actions */}
            <div className="p-2">
              {isAdmin && (
                <button
                  onClick={() => { window.location.href = '/analytics'; setOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors hover:opacity-80 text-left"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <BarChart2 size={15} style={{ color: '#06b6d4' }} />
                  Analytics
                </button>
              )}
              <button
                onClick={() => { window.location.href = '/profile'; setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors hover:opacity-80 text-left"
                style={{ color: 'var(--text-secondary)' }}
              >
                <User size={15} style={{ color: '#00F0FF' }} />
                View profile
              </button>
              <button
                onClick={() => { onUpgrade(); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors hover:opacity-80 text-left"
                style={{ color: 'var(--text-secondary)' }}
              >
                <CreditCard size={15} style={{ color: '#8B5CF6' }} />
                {currentPlan === 'free' ? 'Upgrade plan' : 'Billing & plans'}
              </button>
              <button
                onClick={() => { onLogout(); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors hover:opacity-80 text-left"
                style={{ color: 'var(--text-secondary)' }}
              >
                <LogOut size={15} style={{ color: '#f87171' }} />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
