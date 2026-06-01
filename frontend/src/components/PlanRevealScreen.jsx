import { useState, useEffect, useRef } from 'react';
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

// Stagger reveal interval: how many ms between each row appearing
const ROW_INTERVAL_MS = 180;

export default function PlanRevealScreen({ totalSlides, slidePlans = [], onDone }) {
  const [showFooter, setShowFooter] = useState(false);
  // visibleCount controls how many rows are shown — increments 1-by-1 via timer
  const [visibleCount, setVisibleCount] = useState(0);
  const calledDone = useRef(false);
  const advanceTimer = useRef(null);
  const rowTimer = useRef(null);

  // When new slides arrive in slidePlans, start (or continue) the row-reveal timer
  useEffect(() => {
    if (slidePlans.length === 0) return;
    if (rowTimer.current) return; // already running
    rowTimer.current = setInterval(() => {
      setVisibleCount(prev => {
        const next = prev + 1;
        if (next >= slidePlans.length) {
          clearInterval(rowTimer.current);
          rowTimer.current = null;
        }
        return next;
      });
    }, ROW_INTERVAL_MS);
    return () => {};
  }, [slidePlans.length > 0]);

  // If more slides arrive after timer finished, restart it from current count
  useEffect(() => {
    if (slidePlans.length === 0) return;
    setVisibleCount(prev => {
      if (prev < slidePlans.length && !rowTimer.current) {
        rowTimer.current = setInterval(() => {
          setVisibleCount(c => {
            const next = c + 1;
            if (next >= slidePlans.length) {
              clearInterval(rowTimer.current);
              rowTimer.current = null;
            }
            return next;
          });
        }, ROW_INTERVAL_MS);
      }
      return prev;
    });
  }, [slidePlans.length]);

  const visibleSlides = slidePlans.slice(0, visibleCount);
  const allRevealed = visibleCount >= totalSlides && totalSlides > 0;

  // Auto-advance once all rows have been revealed on screen
  useEffect(() => {
    if (!allRevealed) return;
    setShowFooter(true);
    advanceTimer.current = setTimeout(() => {
      if (!calledDone.current) { calledDone.current = true; onDone(); }
    }, 1600);
    return () => clearTimeout(advanceTimer.current);
  }, [allRevealed]);

  // Cleanup timers on unmount
  useEffect(() => () => {
    clearInterval(rowTimer.current);
    clearTimeout(advanceTimer.current);
  }, []);

  function handleSkip() {
    clearInterval(rowTimer.current);
    clearTimeout(advanceTimer.current);
    if (!calledDone.current) { calledDone.current = true; onDone(); }
  }

  const pendingCount = Math.max(0, totalSlides - visibleSlides.length);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto py-12"
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}
      onClick={handleSkip}
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
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="text-white text-xl font-bold text-center"
        >
          Nova crafted {totalSlides} slide{totalSlides !== 1 ? 's' : ''} for you
        </motion.h1>

        {/* Slide list — rows appear one-by-one via visibleCount timer */}
        <div className="w-full flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {visibleSlides.map((slide, i) => (
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
                <span
                  className="text-xs font-black w-6 text-center flex-shrink-0 tabular-nums"
                  style={{ color: '#a78bfa' }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span
                  className="text-[10px] font-bold uppercase tracking-wider flex-shrink-0 px-1.5 py-0.5 rounded-lg"
                  style={{ background: 'rgba(167,139,250,0.14)', color: '#c4b5fd' }}
                >
                  {TYPE_LABELS[slide.type] || 'Slide'}
                </span>
                <span className="text-white text-sm font-semibold flex-1 truncate">
                  {slide.title}
                </span>
                {slide.key_points?.[0] && (
                  <span className="text-white/30 text-xs truncate max-w-[160px] hidden sm:block">
                    {slide.key_points[0]}
                  </span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Skeleton rows for slides not yet revealed */}
          {Array.from({ length: pendingCount }, (_, i) => (
            <div
              key={`pending-${i}`}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div className="w-6 h-3 rounded-full bg-white/10 animate-pulse flex-shrink-0" />
              <div className="w-14 h-4 rounded-lg bg-white/10 animate-pulse flex-shrink-0" />
              <div className="flex-1 h-4 rounded-lg bg-white/10 animate-pulse max-w-[200px]" />
            </div>
          ))}
        </div>

        {/* Status line */}
        <AnimatePresence mode="wait">
          {!allRevealed && totalSlides > 0 ? (
            <motion.p
              key="planning"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-white/35 text-sm"
            >
              Planning slide {visibleSlides.length + 1} of {totalSlides}…
            </motion.p>
          ) : showFooter ? (
            <motion.p
              key="opening"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-white/35 text-sm"
            >
              Opening your presentation…
            </motion.p>
          ) : null}
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
