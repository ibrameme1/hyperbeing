import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import NovaMascot from './NovaMascot';

// Same MeshGradient treatment as LoadingScreen — keeps the two
// "Nova is working" screens visually consistent. Falls back to a
// static gradient if the shader package hasn't loaded yet.
function ShaderBackground() {
  const [mods, setMods] = useState({});
  useEffect(() => {
    import('@paper-design/shaders-react').then(mod => setMods(mod)).catch(() => {});
  }, []);
  const { MeshGradient } = mods;

  if (!MeshGradient) {
    return (
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(135deg, #080808 0%, #0f0f0f 33%, #1a1540 66%, #5B50FF 100%)'
      }} />
    );
  }
  return (
    <MeshGradient
      className="absolute inset-0 w-full h-full"
      colors={['#080808', '#0f0f0f', '#1a1540', '#5B50FF']}
      speed={0.4}
      backgroundColor="#080808"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
}

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
  // Use slidePlans.length as fallback if totalSlides wasn't broadcast (header parse failed)
  const effectiveTotal = totalSlides || slidePlans.length;
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
  // Use totalSlides (from plan_started event) for allRevealed so we don't
  // fire prematurely in the synthetic-header path where plan_started fires
  // after all plan_slide_streamed events (totalSlides would be 0 at that point).
  const allRevealed = totalSlides > 0 && visibleCount >= totalSlides;

  // Auto-advance once all rows have been revealed on screen
  // Give at least 3s to read — scale up with slide count (200ms per slide, capped at 6s)
  useEffect(() => {
    if (!allRevealed) return;
    setShowFooter(true);
    const holdMs = Math.min(Math.max(effectiveTotal * 200, 3000), 6000);
    advanceTimer.current = setTimeout(() => {
      if (!calledDone.current) { calledDone.current = true; onDone(); }
    }, holdMs);
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

  const pendingCount = Math.max(0, effectiveTotal - visibleSlides.length);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto py-12"
      style={{ background: '#080808' }}
      onClick={handleSkip}
    >
      <ShaderBackground />

      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/4 w-96 h-96 rounded-full opacity-20"
             style={{ background: 'radial-gradient(circle, rgba(91,80,255,0.12) 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/3 right-1/4 w-72 h-72 rounded-full opacity-10"
             style={{ background: 'radial-gradient(circle, rgba(91,80,255,0.08) 0%, transparent 70%)' }} />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-7 px-6 w-full max-w-xl">
        {/* Nova mascot */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-center flex-shrink-0"
        >
          <NovaMascot size={120} />
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          style={{ fontFamily: 'Playfair Display,Georgia,serif', color: '#f0f0ee', fontSize: 20, fontWeight: 700, textAlign: 'center' }}
        >
          Nova crafted {effectiveTotal} slide{effectiveTotal !== 1 ? 's' : ''} for you
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
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '0.5px solid #1e1e1e',
                  borderRadius: 8,
                }}
              >
                <span
                  className="text-xs font-black w-6 text-center flex-shrink-0 tabular-nums"
                  style={{ color: '#8B80FF' }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span
                  className="uppercase flex-shrink-0"
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: '0.10em',
                    background: 'rgba(91,80,255,0.12)',
                    color: '#8B80FF',
                    border: '0.5px solid rgba(91,80,255,0.28)',
                    borderRadius: 4,
                    padding: '4px 9px',
                  }}
                >
                  {TYPE_LABELS[slide.type] || 'Slide'}
                </span>
                <span style={{ color: '#f0f0ee', fontSize: 14, fontWeight: 600, fontFamily: 'Inter,sans-serif', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {slide.title}
                </span>
                {slide.key_points?.[0] && (
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }} className="hidden sm:block">
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
              className="flex items-center gap-3 px-4 py-3"
              style={{
                background: 'rgba(255,255,255,0.025)',
                border: '0.5px solid rgba(255,255,255,0.04)',
                borderRadius: 8,
              }}
            >
              <div className="w-6 h-3 rounded-full bg-white/10 animate-pulse flex-shrink-0" />
              <div className="w-14 h-4 rounded bg-white/10 animate-pulse flex-shrink-0" />
              <div className="flex-1 h-4 rounded bg-white/10 animate-pulse max-w-[200px]" />
            </div>
          ))}
        </div>

        {/* Status line */}
        <AnimatePresence mode="wait">
          {!allRevealed && effectiveTotal > 0 ? (
            <motion.p
              key="planning"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, fontFamily: 'Inter,sans-serif' }}
            >
              Planning slide {visibleSlides.length + 1} of {effectiveTotal}…
            </motion.p>
          ) : showFooter ? (
            <motion.p
              key="opening"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, fontFamily: 'Inter,sans-serif' }}
            >
              Opening your presentation…
            </motion.p>
          ) : null}
        </AnimatePresence>

        {/* Tap to skip hint — always visible so users know they can skip */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          style={{
            color: 'rgba(255,255,255,0.5)',
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: '0.05em',
            border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: 9999,
            padding: '6px 16px',
            fontFamily: 'Inter,sans-serif',
          }}
        >
          Tap anywhere to skip
        </motion.p>
      </div>
    </div>
  );
}
