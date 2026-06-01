import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const TYPE_LABELS = {
  cover: 'Cover',
  section: 'Section',
  content: 'Content',
  quote: 'Quote',
  data: 'Data',
  image: 'Visual',
  conclusion: 'Close',
};

export default function PlanRevealScreen({ totalSlides, slidePlans = [], onDone }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [showFooter, setShowFooter] = useState(false);

  useEffect(() => {
    const timers = [];
    const STAGGER = 150;
    const INITIAL_DELAY = 400;

    slidePlans.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleCount(i + 1), INITIAL_DELAY + i * STAGGER));
    });

    const allRevealedAt = INITIAL_DELAY + slidePlans.length * STAGGER;
    timers.push(setTimeout(() => setShowFooter(true), allRevealedAt + 300));
    timers.push(setTimeout(() => onDone(), allRevealedAt + 1600));

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto py-12"
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}
      onClick={onDone}
    >
      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/4 w-96 h-96 rounded-full opacity-20"
             style={{ background: 'radial-gradient(circle, #7b61ff 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/3 right-1/4 w-72 h-72 rounded-full opacity-10"
             style={{ background: 'radial-gradient(circle, #00b4ff 0%, transparent 70%)' }} />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-7 px-6 w-full max-w-xl">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
        >
          <Sparkles size={20} className="text-white" />
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="text-center"
        >
          <p className="text-white/40 text-[11px] font-bold uppercase tracking-widest mb-1.5">
            Nova's plan
          </p>
          <h1 className="text-white text-xl font-bold">
            {totalSlides} slide{totalSlides !== 1 ? 's' : ''} crafted for you
          </h1>
        </motion.div>

        {/* Slide list */}
        <div className="w-full flex flex-col gap-2">
          {slidePlans.slice(0, visibleCount).map((slide, i) => (
            <motion.div
              key={slide.index ?? i}
              initial={{ opacity: 0, x: -18, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{
                background: 'rgba(255,255,255,0.055)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {/* Slide number */}
              <span
                className="text-xs font-black w-6 text-center flex-shrink-0 tabular-nums"
                style={{ color: '#a78bfa' }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>

              {/* Type badge */}
              <span
                className="text-[10px] font-bold uppercase tracking-wider flex-shrink-0 px-1.5 py-0.5 rounded-lg"
                style={{ background: 'rgba(167,139,250,0.14)', color: '#c4b5fd' }}
              >
                {TYPE_LABELS[slide.type] || 'Slide'}
              </span>

              {/* Title */}
              <span className="text-white text-sm font-semibold flex-1 truncate">
                {slide.title}
              </span>

              {/* First key point (desktop only) */}
              {slide.key_points?.[0] && (
                <span className="text-white/30 text-xs truncate max-w-[160px] hidden sm:block">
                  {slide.key_points[0]}
                </span>
              )}
            </motion.div>
          ))}
        </div>

        {/* Footer */}
        <AnimatePresence>
          {showFooter && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="text-white/35 text-sm"
            >
              Opening your presentation…
            </motion.p>
          )}
        </AnimatePresence>

        {/* Tap to skip hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          transition={{ delay: 0.8 }}
          className="text-white/30 text-[11px] absolute bottom-6"
        >
          tap to skip
        </motion.p>
      </div>
    </div>
  );
}
