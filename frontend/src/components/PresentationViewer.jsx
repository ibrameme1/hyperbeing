import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Download, Loader2, ArrowLeft,
  Sparkles, Send, Images, FileDown,
} from 'lucide-react';
import SlideRenderer from './SlideRenderer';
import { exportToPDF, exportImages } from '../utils/pdfExport';
import api from '../api/client';

export default function PresentationViewer({ slides, presentationId, title, onBack, onSlidesUpdate }) {
  const [current, setCurrent] = useState(0);
  const [editInstruction, setEditInstruction] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportingImages, setExportingImages] = useState(false);
  const [updatingSlides, setUpdatingSlides] = useState(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);
  const editRef = useRef(null);
  const filmstripRef = useRef(null);
  const exportMenuRef = useRef(null);

  // Clear updating indicator when slide SSE update arrives
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

  // Scroll filmstrip to keep active slide visible
  useEffect(() => {
    const strip = filmstripRef.current;
    if (!strip) return;
    const thumb = strip.children[current];
    if (thumb) thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [current]);

  // Close export menu on outside click
  useEffect(() => {
    function onClick(e) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const goTo = useCallback((idx) => {
    if (idx >= 0 && idx < slides.length) setCurrent(idx);
  }, [slides.length]);

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(current + 1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goTo(current - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, goTo]);

  async function handleEditSubmit() {
    if (!editInstruction.trim() || editLoading) return;
    const slideIndex = slides[current]?.index;
    setEditLoading(true);
    try {
      await api.post(`/presentations/${presentationId}/slides/${slideIndex}/regenerate`, {
        instruction: editInstruction.trim(),
      });
      setUpdatingSlides(prev => new Set([...prev, current]));
      setEditInstruction('');
    } catch (err) {
      console.error('Edit failed:', err);
    } finally {
      setEditLoading(false);
    }
  }

  async function handleExportPDF() {
    setExportingPDF(true);
    setShowExportMenu(false);
    try { await exportToPDF(slides, title); }
    finally { setExportingPDF(false); }
  }

  async function handleExportImages() {
    setExportingImages(true);
    setShowExportMenu(false);
    try { exportImages(slides, title); }
    finally { setExportingImages(false); }
  }

  const activeSlide = slides[current];
  const isUpdating = updatingSlides.has(current);

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">

      {/* ── Top bar (Canva-style) ─────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-200 flex-shrink-0 bg-white">
        {/* Left: back + logo + title */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors text-sm font-medium flex-shrink-0"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Back</span>
        </button>

        <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
               style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <Sparkles size={13} className="text-white" />
          </div>
          <p className="font-semibold text-gray-900 text-sm truncate">{title}</p>
          <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:inline">
            {current + 1} / {slides.length}
          </span>
        </div>

        {/* Right: export */}
        <div className="relative flex-shrink-0" ref={exportMenuRef}>
          <button
            onClick={() => setShowExportMenu(v => !v)}
            disabled={exportingPDF || exportingImages}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          >
            {(exportingPDF || exportingImages) ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            Export
          </button>

          <AnimatePresence>
            {showExportMenu && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-10 bg-white rounded-2xl shadow-ios-xl border border-gray-100 py-2 w-48 z-50"
              >
                <button
                  onClick={handleExportImages}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-ios-gray6 transition-colors text-sm text-gray-800"
                >
                  <Images size={15} className="text-ios-blue" />
                  Download as Images
                </button>
                <button
                  onClick={handleExportPDF}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-ios-gray6 transition-colors text-sm text-gray-800"
                >
                  <FileDown size={15} className="text-purple-600" />
                  Export as PDF
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Main canvas area ──────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center relative min-h-0"
           style={{ background: '#E8E8E8' }}>

        {/* Prev arrow */}
        <button
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
          className="absolute left-4 z-10 w-10 h-10 rounded-2xl bg-white shadow-ios flex items-center justify-center text-gray-600 hover:text-gray-900 transition-all duration-150 disabled:opacity-30 active:scale-95"
        >
          <ChevronLeft size={20} />
        </button>

        {/* Slide */}
        <div className="px-16 py-6 w-full flex items-center justify-center min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, x: 40, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -40, scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-4xl"
            >
              <SlideRenderer
                slide={activeSlide}
                className="rounded-xl shadow-2xl"
              />

              {isUpdating && (
                <div className="absolute inset-0 rounded-xl flex flex-col items-center justify-center gap-3"
                     style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
                  <Loader2 size={28} className="text-white animate-spin" />
                  <p className="text-white text-sm font-medium">Regenerating slide…</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Next arrow */}
        <button
          onClick={() => goTo(current + 1)}
          disabled={current === slides.length - 1}
          className="absolute right-4 z-10 w-10 h-10 rounded-2xl bg-white shadow-ios flex items-center justify-center text-gray-600 hover:text-gray-900 transition-all duration-150 disabled:opacity-30 active:scale-95"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* ── Bottom panel ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200">

        {/* Slide filmstrip */}
        <div
          ref={filmstripRef}
          className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-thin"
          style={{ scrollbarWidth: 'thin' }}
        >
          {slides.map((slide, idx) => (
            <motion.button
              key={slide.index}
              onClick={() => goTo(idx)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="flex flex-col items-center gap-1.5 flex-shrink-0"
            >
              <div
                className={`w-24 rounded-lg overflow-hidden transition-all duration-150 ${
                  idx === current
                    ? 'ring-2 ring-purple-500 shadow-md'
                    : 'opacity-60 hover:opacity-90'
                }`}
                style={{ aspectRatio: '16/9' }}
              >
                {slide.image_data ? (
                  <img src={slide.image_data} alt={slide.title}
                       className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gray-200 animate-pulse" />
                )}
              </div>
              <span className={`text-xs font-medium transition-colors ${
                idx === current ? 'text-purple-600' : 'text-gray-400'
              }`}>
                {idx + 1}
              </span>
            </motion.button>
          ))}
        </div>

        {/* Edit bar */}
        <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 flex items-center gap-3 bg-gray-100 rounded-2xl px-4 py-2.5">
            <textarea
              ref={editRef}
              value={editInstruction}
              onChange={e => setEditInstruction(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleEditSubmit();
                }
              }}
              placeholder={`Describe changes to slide ${current + 1}…`}
              rows={1}
              className="flex-1 bg-transparent text-sm outline-none text-gray-800 placeholder:text-gray-400 resize-none leading-relaxed"
              style={{ maxHeight: 80 }}
            />
          </div>
          <button
            onClick={handleEditSubmit}
            disabled={!editInstruction.trim() || editLoading || isUpdating}
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white transition-all duration-150 active:scale-95 disabled:opacity-40 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          >
            {editLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={15} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
