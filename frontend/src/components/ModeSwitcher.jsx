import { motion } from 'framer-motion';
import { LayoutTemplate, Palette } from 'lucide-react';

export const MODES = [
  {
    key: 'presentation',
    label: 'Presentations',
    icon: LayoutTemplate,
    description: 'Best for full slide decks — describe your brief and Nova builds the whole presentation for you.',
  },
  {
    key: 'design',
    label: 'Design',
    icon: Palette,
    description: 'For beautiful visuals — packaging, mockups, social creatives, and anything that needs great art direction.',
  },
];

// ─── Presentation / Design mode switcher ───────────────────────────────────
export default function ModeSwitcher({ mode, onChange, isDark }) {
  const active = MODES.find(m => m.key === mode) || MODES[0];

  return (
    <div className="flex flex-col items-center gap-2 mb-6">
      <div
        role="tablist"
        aria-label="Creation mode"
        style={{
          display: 'inline-flex', gap: 4, padding: 4, borderRadius: 12,
          background: isDark ? '#141414' : '#fff',
          border: isDark ? '0.5px solid #2a2a2a' : '0.5px solid #e8e8e8',
          boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        {MODES.map(({ key, label, icon: Icon }) => {
          const isActive = key === mode;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600,
                background: isActive ? '#5B50FF' : 'transparent',
                color: isActive ? '#fff' : (isDark ? '#888' : '#666'),
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>
      <motion.p
        key={active.key}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="text-xs text-center max-w-md px-4"
        style={{ color: 'var(--text-muted)' }}
      >
        {active.description}
      </motion.p>
    </div>
  );
}
