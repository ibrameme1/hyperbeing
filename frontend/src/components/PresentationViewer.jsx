import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Edit3, Download, Loader2, ArrowLeft } from 'lucide-react';
import SlideRenderer from './SlideRenderer';
import EditSlideModal from './EditSlideModal';
import { exportToPDF } from '../utils/pdfExport';

export default function PresentationViewer({ slides, presentationId, title, onBack, onSlidesUpdate }) {
  const [current, setCurrent] = useState(0);
  const [editingSlide, setEditingSlide] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [updatingSlides, setUpdatingSlides] = useState(new Set());

  // Clear loading indicator when a slide's image_data is refreshed via SSE
  useEffect(() => {
    setUpdatingSlides(prev => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      prev.forEach(idx => {
        if (slides[idx]?.status === 'complete') { next.delete(idx); changed = true; }
      });
      return changed ? next : prev;
    });
  }, [slides]);

  const goTo = useCallback((idx) => {
    if (idx >= 0 && idx < slides.length) setCurrent(idx);
  }, [slides.length]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(current + 1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goTo(current - 1);
      if (e.key === 'Escape' && editingSlide) setEditingSlide(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, editingSlide, goTo]);

  async function handleExport() {
    setExporting(true);
    try {
      await exportToPDF(slides, title);
    } finally {
      setExporting(false);
    }
  }

  function handleSlideUpdated(index) {
    setUpdatingSlides(prev => new Set([...prev, index]));
  }

  const activeSlide = slides[current];

  return (
    <div className="h-screen flex flex-col" style={{ background: '#111111' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/8"
           style={{ background: 'rgba(20,20,20,0.95)', backdropFilter: 'blur(20px)' }}>
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm font-medium"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="text-center">
          <p className="text-white font-semibold text-sm truncate max-w-xs">{title}</p>
          <p className="text-white/40 text-xs mt-0.5">
            {current + 1} / {slides.length}
          </p>
        </div>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 text-sm font-semibold text-white px-4 py-2 rounded-2xl transition-all duration-150 active:scale-95"
          style={{ background: 'rgba(255,255,255,0.12)' }}
        >
          {exporting ? (
            <><Loader2 size={15} className="animate-spin" /> Exporting…</>
          ) : (
            <><Download size={15} /> Export PDF</>
          )}
        </button>
      </div>

      {/* Main slide area */}
      <div className="flex-1 flex items-center justify-center px-4 py-6 relative min-h-0">
        {/* Prev */}
        <button
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
          className="absolute left-4 z-10 w-10 h-10 rounded-2xl flex items-center justify-center text-white transition-all duration-150 disabled:opacity-20 active:scale-95"
          style={{ background: 'rgba(255,255,255,0.12)' }}
        >
          <ChevronLeft size={20} />
        </button>

        {/* Slide */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -40, scale: 0.96 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-5xl group"
          >
            <SlideRenderer
              slide={activeSlide}
              className="rounded-2xl shadow-ios-xl"
            />

            {/* Updating overlay */}
            {updatingSlides.has(activeSlide?.index) && (
              <div className="absolute inset-0 rounded-2xl flex items-center justify-center"
                   style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
                <div className="flex items-center gap-3 text-white">
                  <Loader2 size={24} className="animate-spin" />
                  <span className="font-semibold">Regenerating slide…</span>
                </div>
              </div>
            )}

            {/* Edit button */}
            <motion.button
              initial={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
              className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-semibold transition-all duration-150"
              style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
              onClick={() => setEditingSlide(activeSlide)}
            >
              <Edit3 size={13} />
              Edit slide
            </motion.button>
          </motion.div>
        </AnimatePresence>

        {/* Next */}
        <button
          onClick={() => goTo(current + 1)}
          disabled={current === slides.length - 1}
          className="absolute right-4 z-10 w-10 h-10 rounded-2xl flex items-center justify-center text-white transition-all duration-150 disabled:opacity-20 active:scale-95"
          style={{ background: 'rgba(255,255,255,0.12)' }}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Thumbnail filmstrip */}
      <div className="border-t border-white/8 py-3 px-4"
           style={{ background: 'rgba(20,20,20,0.95)' }}>
        <div className="flex gap-2 overflow-x-auto pb-1 justify-center">
          {slides.map((slide, idx) => (
            <motion.button
              key={slide.index}
              onClick={() => goTo(idx)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className={`flex-shrink-0 w-24 aspect-[16/9] rounded-xl overflow-hidden transition-all duration-150 ${
                idx === current
                  ? 'ring-2 ring-ios-blue shadow-ios-lg'
                  : 'opacity-50 hover:opacity-80'
              }`}
            >
              {slide.image_data ? (
                <img src={slide.image_data} alt={slide.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full skeleton" />
              )}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Edit modal */}
      <AnimatePresence>
        {editingSlide && (
          <EditSlideModal
            slide={editingSlide}
            presentationId={presentationId}
            onClose={() => setEditingSlide(null)}
            onUpdated={handleSlideUpdated}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
