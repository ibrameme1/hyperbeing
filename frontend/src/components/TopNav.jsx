import { Sun, Moon } from 'lucide-react';
import Logo from './Logo';
import AccountMenu from './AccountMenu';

// ─── Shared dashboard top bar ──────────────────────────────────────────────
// Used by both the presentation dashboard and the design mode gallery so the
// nav, theme toggle, and account menu stay consistent across modes.
export default function TopNav({ isDark, toggleTheme, user, credits, currentPlan, isAdmin, onLogout, onUpgrade }) {
  return (
    <div className="sticky top-0 z-50 px-4 pt-3 pb-1">
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 20px', borderRadius: 12,
        background: isDark ? 'rgba(10,10,16,0.55)' : 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        border: isDark ? '0.5px solid rgba(255,255,255,0.08)' : '0.5px solid rgba(0,0,0,0.08)',
        boxShadow: isDark ? '0 2px 24px rgba(0,0,0,0.5)' : '0 2px 16px rgba(0,0,0,0.07)',
      }}>
        <div className="flex items-center">
          <Logo dark={isDark} height={40} />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDark ? '#1e1e1e' : '#f0f0f0', border: 'none', cursor: 'pointer' }}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark
              ? <Sun size={15} style={{ color: '#facc15' }} />
              : <Moon size={15} style={{ color: '#5B50FF' }} />}
          </button>
          <AccountMenu
            user={user}
            credits={credits}
            currentPlan={currentPlan}
            isAdmin={isAdmin}
            onLogout={onLogout}
            onUpgrade={onUpgrade}
          />
        </div>
      </nav>
    </div>
  );
}
