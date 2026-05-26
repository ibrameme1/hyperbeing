import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Download, Loader2, ArrowLeft,
  Sparkles, Send, Images, FileDown, Paperclip, X,
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
  const [localSlides, setLocalSlides] = useState(slides);
  const [editAttachments, setEditAttachments] = useState([]);
  const editRef = useRef(null);
  const filmstripRef = useRef(null);
  const exportMenuRef = useRef(null);
  const editFileRef = useRef(null);

  // Sync localSlides when slides prop changes
  useEffect(() => {
    setLocalSlides(slides);
  }, [slides]);

  // Clear updating indicator when slide SSE update arrives
  useEffect(() => {
    setUpdatingSlides(prev => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      prev.forEach(idx => {
        if (localSlides[idx]?.status === 'complete') { next.delete(idx); changed = true; }
      });
      return changed ? next : prev;
    });
  }, [localSlides]);

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
    if (idx >= 0 && idx < localSlides.length) setCurrent(idx);
  }, [localSlides.length]);

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(current + 1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goTo(current - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, goTo]);

  async function handleReorder(newOrder) {
    setLocalSlides(newOrder);
    onSlidesUpdate(newOrder);
    try {
      await api.post(`/presentations/${presentationId}/reorder`, {
        order: newOrder.map(s => s.index),
      });
    } catch (err) {
      console.error('Reorder failed:', err);
    }
  }

  function handleEditAttach(files) {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => setEditAttachments(prev => [...prev, {
        id: Math.random().toString(36).slice(2),
        name: file.name,
        data: e.target.result,
        mimeType: file.type,
      }]);
      reader.readAsDataURL(file);
    });
  }

  async function handleEditSubmit() {
    if (!editInstruction.trim() || editLoading) return;
    const slideIndex = localSlides[current]?.index;
    setEditLoading(true);
    try {
      await api.post(`/presentations/${presentationId}/slides/${slideIndex}/regenerate`, {
        instruction: editInstruction.trim(),
        attachments: editAttachments.map(a => ({ data: a.data, mimeType: a.mimeType, name: a.name })),
      });
      setUpdatingSlides(prev => new Set([...prev, current]));
      setEditInstruction('');
      setEditAttachments([]);
    } catch (err) {
      console.error('Edit failed:', err);
    } finally {
      setEditLoading(false);
    }
  }

  async function handleExportPDF() {
    setExportingPDF(true);
    setShowExportMenu(false);
    try { await exportToPDF(localSlides, title); }
    finally { setExportingPDF(false); }
  }

  async function handleExportImages() {
    setExportingImages(true);
    setShowExportMenu(false);
    try { exportImages(localSlides, title); }
    finally { setExportingImages(false); }
  }

  const activeSlide = localSlides[current];
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
            {current + 1} / {localSlides.length}
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
          disabled={current === localSlides.length - 1}
          className="absolute right-4 z-10 w-10 h-10 rounded-2xl bg-white shadow-ios flex items-center justify-center text-gray-600 hover:text-gray-900 transition-all duration-150 disabled:opacity-30 active:scale-95"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* ── Bottom panel ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200">

        {/* Slide filmstrip */}
        <Reorder.Group
          as="div"
          axis="x"
          values={localSlides}
          onReorder={handleReorder}
          ref={filmstripRef}
          className="flex gap-3 overflow-x-auto px-4 py-3"
          style={{ scrollbarWidth: 'thin', listStyle: 'none', margin: 0, padding: '12px 16px' }}
        >
          {localSlides.map((slide, idx) => (
            <Reorder.Item
              key={slide.index}
              value={slide}
              className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-grab active:cursor-grabbing"
              style={{ listStyle: 'none' }}
              whileDrag={{ scale: 1.05, zIndex: 50 }}
            >
              <div
                onClick={() => goTo(idx)}
                className={`w-24 rounded-lg overflow-hidden transition-all duration-150 ${
                  idx === current
                    ? 'ring-2 ring-purple-500 shadow-md'
                    : 'opacity-60 hover:opacity-90'
                }`}
                style={{ aspectRatio: '16/9' }}
              >
                {slide.image_data ? (
                  <img src={slide.image_data} alt={slide.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gray-200 animate-pulse" />
                )}
              </div>
              <span className={`text-xs font-medium transition-colors ${idx === current ? 'text-purple-600' : 'text-gray-400'}`}>
                {idx + 1}
              </span>
            </Reorder.Item>
          ))}
        </Reorder.Group>

        {/* Edit bar */}
        <div className="border-t border-gray-100 px-4 py-3 space-y-2">
          {/* Attachment previews */}
          {editAttachments.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {editAttachments.map(att => (
                <div key={att.id} className="relative group">
                  <img src={att.data} alt={att.name} className="h-10 w-10 rounded-lg object-cover border border-gray-200" />
                  <button
                    onClick={() => setEditAttachments(prev => prev.filter(a => a.id !== att.id))}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-gray-800 text-white rounded-full flex items-center justify-center text-[9px] opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={8} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              ref={editFileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => handleEditAttach(e.target.files)}
            />
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
              onClick={() => editFileRef.current?.click()}
              className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0"
            >
              <Paperclip size={15} className="text-gray-500" />
            </button>
            <button
              onClick={handleEditSubmit}
              disabled={!editInstruction.trim() || editLoading || isUpdating}
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white transition-all duration-150 active:scale-95 disabled:opacity-40 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
            >
              {editLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
