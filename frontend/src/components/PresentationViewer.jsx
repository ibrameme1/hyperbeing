import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Download, Loader2, ArrowLeft,
  Sparkles, Send, Images, FileDown, Paperclip, X, Plus,
  AlertTriangle, RefreshCw, Check, Pencil, Trash2, ImageIcon,
} from 'lucide-react';
import SlideRenderer from './SlideRenderer';
import { exportToPDF, exportImages } from '../utils/pdfExport';
import api from '../api/client';
import { capture } from '../utils/posthog';

// Separate component so each item has its own wasDragging ref
function FilmstripItem({ slide, idx, isCurrent, onGoTo, onRetry, onDelete, canDelete }) {
  const wasDragging = useRef(false);

  return (
    <Reorder.Item
      key={slide.index}
      value={slide}
      className="flex flex-col items-center gap-1.5 flex-shrink-0 group/item"
      style={{ listStyle: 'none', cursor: 'grab' }}
      whileDrag={{ scale: 1.06, zIndex: 50, cursor: 'grabbing' }}
      onDragStart={() => { wasDragging.current = true; }}
      onDragEnd={() => { setTimeout(() => { wasDragging.current = false; }, 80); }}
    >
      <div className="relative">
        <div
          onPointerUp={() => { if (!wasDragging.current) onGoTo(idx); }}
          className={`w-24 rounded-lg overflow-hidden transition-all duration-150 relative select-none ${
            isCurrent ? 'ring-2 ring-purple-500 shadow-md' : 'opacity-60 hover:opacity-90'
          }`}
          style={{ aspectRatio: '16/9' }}
        >
          {slide.image_data && !slide.image_data.startsWith('data:image/svg') ? (
            <img src={slide.image_data} alt={slide.title} className="w-full h-full object-cover pointer-events-none" draggable={false} />
          ) : (
            <div className="w-full h-full bg-gray-200 dark:bg-zinc-700 animate-pulse" />
          )}
          {slide.status === 'generating' && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
              <Loader2 size={14} className="text-white animate-spin" />
            </div>
          )}
          {slide.status === 'error' && (
            <div className="absolute inset-0 bg-red-900/70 flex flex-col items-center justify-center gap-1.5 rounded-lg">
              <AlertTriangle size={12} className="text-red-300" />
              <button
                onPointerUp={e => { e.stopPropagation(); if (!wasDragging.current) onRetry(idx); }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-white text-[9px] font-semibold leading-none"
              >
                <RefreshCw size={8} />
                Retry
              </button>
            </div>
          )}
          {slide.status !== 'generating' && slide.status !== 'error' &&
           (!slide.image_data || slide.image_data === '' || slide.image_data?.startsWith('data:image/svg+xml')) && (
            <div className="absolute inset-0 bg-indigo-900/60 flex flex-col items-center justify-center gap-1 rounded-lg">
              <RefreshCw size={10} className="text-indigo-300" />
              <button
                onPointerUp={e => { e.stopPropagation(); if (!wasDragging.current) onRetry(idx); }}
                className="text-[9px] font-semibold text-white/80 px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20"
              >
                Retry
              </button>
            </div>
          )}
        </div>
        {canDelete && (
          <button
            onPointerUp={e => { e.stopPropagation(); if (!wasDragging.current) onDelete(idx); }}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity shadow-sm z-10"
            title="Delete slide"
          >
            <X size={9} />
          </button>
        )}
      </div>
      <span className={`text-xs font-medium transition-colors select-none ${isCurrent ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-zinc-500'}`}>
        {idx + 1}
      </span>
    </Reorder.Item>
  );
}

export default function PresentationViewer({ slides, presentationId, title, onBack, onSlidesUpdate, onTitleChange }) {
  const [current, setCurrent] = useState(0);
  const [editInstruction, setEditInstruction] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportingImages, setExportingImages] = useState(false);
  const [updatingSlides, setUpdatingSlides] = useState(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [localSlides, setLocalSlides] = useState(slides);
  const [editAttachments, setEditAttachments] = useState([]);

  // Title editing
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleValue, setTitleValue] = useState(title);
  const [titleSuggesting, setTitleSuggesting] = useState(false);
  const titleInputRef = useRef(null);

  // Add slides modal
  const [showAddSlides, setShowAddSlides] = useState(false);
  const [addDesc, setAddDesc] = useState('');
  const [addCount, setAddCount] = useState(1); // number 1-5 or 'auto'
  const [addAttachments, setAddAttachments] = useState([]);
  const [addLoading, setAddLoading] = useState(false);
  const addFileRef = useRef(null);

  const [slowSlideWarning, setSlowSlideWarning] = useState(false);
  const slowTimerRef = useRef(null);

  const editRef = useRef(null);
  const filmstripRef = useRef(null);
  const exportMenuRef = useRef(null);
  const editFileRef = useRef(null);

  useEffect(() => { setLocalSlides(slides); }, [slides]);
  useEffect(() => { setTitleValue(title); }, [title]);

  // Show friendly message when the current slide has been generating for >12s
  useEffect(() => {
    clearTimeout(slowTimerRef.current);
    setSlowSlideWarning(false);
    const slide = localSlides[current];
    if (slide?.status === 'generating' || updatingSlides.has(current)) {
      slowTimerRef.current = setTimeout(() => setSlowSlideWarning(true), 12000);
    }
    return () => clearTimeout(slowTimerRef.current);
  }, [localSlides[current]?.status, current, updatingSlides.size]);

  useEffect(() => {
    setUpdatingSlides(prev => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      prev.forEach(idx => {
        const s = localSlides[idx]?.status;
        if (s === 'complete' || s === 'error') { next.delete(idx); changed = true; }
      });
      return changed ? next : prev;
    });
  }, [localSlides]);

  useEffect(() => {
    const strip = filmstripRef.current;
    if (!strip) return;
    const thumb = strip.children[current];
    if (thumb) thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [current]);

  useEffect(() => {
    function onClick(e) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setShowExportMenu(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (titleEditing) titleInputRef.current?.select();
  }, [titleEditing]);

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
    setUpdatingSlides(prev => new Set([...prev, current]));
    setLocalSlides(prev => prev.map((s, i) => i === current ? { ...s, status: 'generating' } : s));
    try {
      await api.post(`/presentations/${presentationId}/slides/${slideIndex}/regenerate`, {
        instruction: editInstruction.trim(),
        attachments: editAttachments.map(a => ({ data: a.data, mimeType: a.mimeType, name: a.name })),
      });
      capture('slide_edited', {
        presentation_id: presentationId,
        slide_index: slideIndex,
      });
      setEditInstruction('');
      setEditAttachments([]);
    } catch (err) {
      console.error('Edit failed:', err);
      setLocalSlides(prev => prev.map((s, i) => i === current ? { ...s, status: 'error' } : s));
      setUpdatingSlides(prev => { const n = new Set(prev); n.delete(current); return n; });
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeleteSlide(slideIdx) {
    if (localSlides.length <= 1) return; // don't delete the last slide
    const slide = localSlides[slideIdx];
    if (!slide) return;
    const prev = [...localSlides];
    const updated = localSlides.filter((_, i) => i !== slideIdx);
    setLocalSlides(updated);
    onSlidesUpdate(updated);
    if (current >= updated.length) setCurrent(Math.max(0, updated.length - 1));
    try {
      await api.delete(`/presentations/${presentationId}/slides/${slide.index}`);
    } catch {
      setLocalSlides(prev);
      onSlidesUpdate(prev);
    }
  }

  async function handleRetrySlide(slideIdx) {
    const slide = localSlides[slideIdx];
    if (!slide) return;
    setLocalSlides(prev => prev.map((s, i) => i === slideIdx ? { ...s, status: 'generating' } : s));
    setUpdatingSlides(prev => new Set([...prev, slideIdx]));
    try {
      await api.post(`/presentations/${presentationId}/slides/${slide.index}/retry`);
    } catch (err) {
      console.error('Retry failed:', err);
      setLocalSlides(prev => prev.map((s, i) => i === slideIdx ? { ...s, status: 'error' } : s));
      setUpdatingSlides(prev => { const n = new Set(prev); n.delete(slideIdx); return n; });
    }
  }

  async function handleExportPDF() {
    setExportingPDF(true); setShowExportMenu(false);
    try { await exportToPDF(localSlides, titleValue); } finally { setExportingPDF(false); }
  }

  async function handleExportImages() {
    setExportingImages(true); setShowExportMenu(false);
    try { exportImages(localSlides, titleValue); } finally { setExportingImages(false); }
  }

  async function handleTitleSave() {
    if (!titleValue.trim()) { setTitleValue(title); setTitleEditing(false); return; }
    setTitleEditing(false);
    try {
      await api.patch(`/presentations/${presentationId}/title`, { title: titleValue.trim() });
      onTitleChange?.(titleValue.trim());
    } catch { setTitleValue(title); }
  }

  async function handleSuggestTitle() {
    setTitleSuggesting(true);
    try {
      const { data } = await api.post(`/presentations/${presentationId}/suggest-title`);
      setTitleValue(data.title);
      setTitleEditing(true);
    } catch {} finally { setTitleSuggesting(false); }
  }

  function handleAddAttach(files) {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = e => setAddAttachments(prev => [...prev, {
        id: Math.random().toString(36).slice(2),
        name: file.name, data: e.target.result, mimeType: file.type,
      }]);
      reader.readAsDataURL(file);
    });
  }

  function handleAddDrop(e) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) handleAddAttach(files);
  }

  function handleEditDrop(e) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) handleEditAttach(files);
  }

  async function handleAddSlides() {
    if (!addDesc.trim() || addLoading) return;
    setAddLoading(true);
    try {
      await api.post(`/presentations/${presentationId}/add-slides`, {
        description: addDesc.trim(),
        count: addCount,
        attachments: addAttachments.map(a => ({ data: a.data, mimeType: a.mimeType, name: a.name })),
      });
      setShowAddSlides(false);
      setAddDesc('');
      setAddCount(1);
      setAddAttachments([]);
    } catch (err) {
      console.error('Add slides failed:', err);
    } finally {
      setAddLoading(false);
    }
  }

  const activeSlide = localSlides[current];
  const isUpdating = updatingSlides.has(current) || activeSlide?.status === 'generating';
  const isFailed = activeSlide?.status === 'error' && !updatingSlides.has(current);
  const isMissingImage = !isUpdating && !isFailed && activeSlide &&
    (!activeSlide.image_data || activeSlide.image_data === '' || activeSlide.image_data?.startsWith('data:image/svg+xml'));

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-zinc-950 overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-200 dark:border-zinc-800 flex-shrink-0 bg-white dark:bg-zinc-950">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 transition-colors text-sm font-medium flex-shrink-0"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Back</span>
        </button>

        <div className="w-px h-5 bg-gray-200 dark:bg-zinc-700 flex-shrink-0" />

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
               style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}>
            <Sparkles size={13} className="text-white" />
          </div>

          {/* Editable title */}
          {titleEditing ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <input
                ref={titleInputRef}
                value={titleValue}
                onChange={e => setTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleTitleSave();
                  if (e.key === 'Escape') { setTitleValue(title); setTitleEditing(false); }
                }}
                className="font-semibold text-gray-900 dark:text-zinc-100 text-sm bg-gray-100 dark:bg-zinc-800 rounded-lg px-2 py-1 outline-none flex-1 min-w-0"
                style={{ maxWidth: 260 }}
              />
              <button
                onClick={handleTitleSave}
                className="w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 flex-shrink-0"
              >
                <Check size={12} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                onClick={() => setTitleEditing(true)}
                className="font-semibold text-gray-900 dark:text-zinc-100 text-sm truncate hover:text-purple-700 dark:hover:text-purple-400 transition-colors group flex items-center gap-1"
                title="Click to rename"
              >
                {titleValue}
                <Pencil size={11} className="text-gray-400 dark:text-zinc-500 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
              </button>
              <button
                onClick={handleSuggestTitle}
                disabled={titleSuggesting}
                className="flex-shrink-0 w-6 h-6 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
                title="AI suggest title"
              >
                {titleSuggesting
                  ? <Loader2 size={11} className="animate-spin text-purple-500" />
                  : <Sparkles size={11} className="text-purple-500" />}
              </button>
            </div>
          )}

          <span className="text-xs text-gray-400 dark:text-zinc-500 flex-shrink-0 hidden sm:inline">
            {current + 1} / {localSlides.length}
          </span>
        </div>

        {/* Export */}
        <div className="relative flex-shrink-0" ref={exportMenuRef}>
          <button
            onClick={() => setShowExportMenu(v => !v)}
            disabled={exportingPDF || exportingImages}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}
          >
            {(exportingPDF || exportingImages) ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export
          </button>

          <AnimatePresence>
            {showExportMenu && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-10 bg-white dark:bg-zinc-900 rounded-2xl shadow-ios-xl border border-gray-100 dark:border-zinc-800 py-2 w-48 z-50"
              >
                <button onClick={handleExportImages} className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors text-sm text-gray-800 dark:text-zinc-200">
                  <Images size={15} className="text-blue-500" />
                  Download as Images
                </button>
                <button onClick={handleExportPDF} className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors text-sm text-gray-800 dark:text-zinc-200">
                  <FileDown size={15} className="text-purple-600" />
                  Export as PDF
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Main canvas ──────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center relative min-h-0 overflow-hidden" style={{ background: 'var(--bg-input)' }}>

        <button
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
          className="absolute left-4 z-10 w-10 h-10 rounded-2xl bg-white dark:bg-zinc-800 shadow-ios flex items-center justify-center text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 transition-all duration-150 disabled:opacity-30 active:scale-95"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="px-16 py-3 w-full h-full flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, x: 40, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -40, scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full"
              style={{ maxWidth: 'min(896px, calc((100vh - 260px) * 16 / 9))' }}
            >
              <SlideRenderer slide={activeSlide} className="rounded-xl shadow-2xl" />

              {/* Canva-style edit hint — hover overlay */}
              {!isUpdating && !isFailed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  style={{
                    position: 'absolute', inset: 0, borderRadius: 12,
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                    paddingBottom: 16, cursor: 'pointer',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 50%)',
                  }}
                  onClick={() => {
                    editRef.current?.focus();
                    editRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(255,255,255,0.95)', color: '#0d0b1a',
                    borderRadius: 8, padding: '7px 16px',
                    fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                    backdropFilter: 'blur(8px)',
                  }}>
                    <Pencil size={13} />
                    Edit this slide
                  </div>
                </motion.div>
              )}

              {/* Generating overlay */}
              {isUpdating && (
                <div className="absolute inset-0 rounded-xl flex flex-col items-center justify-center gap-3 px-8 text-center"
                     style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}>
                  <Loader2 size={32} className="text-white animate-spin" />
                  <p className="text-white text-sm font-semibold">Generating slide…</p>
                  {slowSlideWarning ? (
                    <p className="text-white/70 text-xs max-w-xs leading-relaxed">
                      Don't worry — your slide is still being processed. Google's image service is experiencing high demand right now, but we're on it.
                    </p>
                  ) : (
                    <p className="text-white/60 text-xs">This may take a moment</p>
                  )}
                </div>
              )}

              {/* Error overlay */}
              {isFailed && (
                <div className="absolute inset-0 rounded-xl flex flex-col items-center justify-center gap-4"
                     style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
                  <div className="w-12 h-12 rounded-2xl bg-red-500/20 flex items-center justify-center">
                    <AlertTriangle size={24} className="text-red-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-white text-sm font-semibold">This slide couldn't be generated</p>
                    <p className="text-white/50 text-xs mt-1">The AI image service returned an error. Tap Regenerate to try again.</p>
                  </div>
                  <button
                    onClick={() => handleRetrySlide(current)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-gray-900 text-sm font-semibold hover:bg-gray-100 transition-colors active:scale-95"
                  >
                    <RefreshCw size={14} />
                    Regenerate
                  </button>
                </div>
              )}

              {/* Missing image overlay */}
              {isMissingImage && (
                <div className="absolute inset-0 rounded-xl flex flex-col items-center justify-center gap-4"
                     style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(91,80,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ImageIcon size={22} style={{ color: '#8B80FF' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'Inter,sans-serif', marginBottom: 4 }}>Image didn't generate</p>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'Inter,sans-serif' }}>Nova's prompt ran but no image came back. Try regenerating.</p>
                  </div>
                  <button
                    onClick={() => handleRetrySlide(current)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px',
                      borderRadius: 10, background: '#5B50FF', color: '#fff',
                      fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600,
                      border: 'none', cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(91,80,255,0.4)',
                    }}
                  >
                    <RefreshCw size={14} />
                    Regenerate
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          onClick={() => goTo(current + 1)}
          disabled={current === localSlides.length - 1}
          className="absolute right-4 z-10 w-10 h-10 rounded-2xl bg-white dark:bg-zinc-800 shadow-ios flex items-center justify-center text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 transition-all duration-150 disabled:opacity-30 active:scale-95"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* ── Bottom panel ─────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white dark:bg-zinc-950 border-t border-gray-200 dark:border-zinc-800">

        {/* Filmstrip */}
        <Reorder.Group
          as="div"
          axis="x"
          values={localSlides}
          onReorder={handleReorder}
          ref={filmstripRef}
          className="flex gap-3 overflow-x-auto"
          style={{ scrollbarWidth: 'thin', listStyle: 'none', margin: 0, padding: '12px 16px' }}
        >
          {localSlides.map((slide, idx) => (
            <FilmstripItem
              key={slide.index}
              slide={slide}
              idx={idx}
              isCurrent={idx === current}
              onGoTo={goTo}
              onRetry={handleRetrySlide}
              onDelete={handleDeleteSlide}
              canDelete={localSlides.length > 1}
            />
          ))}

          {/* Add slides button at end of filmstrip */}
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0" style={{ listStyle: 'none' }}>
            <button
              onClick={() => setShowAddSlides(true)}
              className="w-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-zinc-700 hover:border-purple-400 dark:hover:border-purple-500 flex flex-col items-center justify-center gap-1 hover:bg-purple-50 dark:hover:bg-purple-900/20 text-[color:var(--text-muted)] hover:text-purple-500 dark:hover:text-purple-400 transition-none"
              style={{ aspectRatio: '16/9' }}
              title="Add more slides"
            >
              <Plus size={18} />
              <span className="text-[10px] font-semibold leading-none">Add slide</span>
            </button>
            <span className="text-xs text-transparent select-none">+</span>
          </div>
        </Reorder.Group>

        {/* Edit panel */}
        <div className="border-t border-gray-100 dark:border-zinc-800 px-4 pt-2.5 pb-3">

          {/* Hint — shown when idle */}
          <AnimatePresence>
            {!editInstruction && !isUpdating && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-1.5 mb-1.5"
              >
                <Pencil size={10} className="text-gray-400 dark:text-zinc-500 flex-shrink-0" />
                <p className="text-[11px] text-gray-400 dark:text-zinc-500">
                  Not happy with slide {current + 1}? Describe what you'd like to change — Nova will edit this slide directly.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Attachments */}
          {editAttachments.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {editAttachments.map(att => (
                <div key={att.id} className="relative group">
                  <img src={att.data} alt={att.name} className="h-10 w-10 rounded-lg object-cover border border-gray-200 dark:border-zinc-700" />
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

          {/* Input row */}
          <div className="flex items-center gap-2">
            <input ref={editFileRef} type="file" accept="image/*" multiple className="hidden"
                   onChange={e => handleEditAttach(e.target.files)} />
            <div
              className="flex-1 flex items-center gap-2 rounded-2xl px-3.5 py-2 transition-all"
              style={{ background: 'var(--bg-input, #f3f4f6)' }}
            >
              <textarea
                ref={editRef}
                value={editInstruction}
                onChange={e => setEditInstruction(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
                }}
                onDragOver={e => e.preventDefault()}
                onDrop={handleEditDrop}
                placeholder={`e.g. "make the background darker" or "change the headline to bold red"`}
                rows={1}
                className="flex-1 bg-transparent text-sm outline-none text-gray-800 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 resize-none leading-relaxed"
                style={{ maxHeight: 80 }}
              />
              <button
                onClick={() => editFileRef.current?.click()}
                className="flex-shrink-0 w-7 h-7 rounded-xl flex items-center justify-center hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                title="Attach reference image (becomes pic2, pic3…)"
              >
                <Paperclip size={13} className="text-gray-400 dark:text-zinc-500" />
              </button>
            </div>
            <button
              onClick={handleEditSubmit}
              disabled={!editInstruction.trim() || editLoading || isUpdating}
              className="w-9 h-9 rounded-2xl flex items-center justify-center text-white transition-all duration-150 active:scale-95 disabled:opacity-40 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}
            >
              {editLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Add Slides Modal ─────────────────────────────────── */}
      <AnimatePresence>
        {showAddSlides && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
            onClick={e => { if (e.target === e.currentTarget) setShowAddSlides(false); }}
          >
            <motion.div
              initial={{ y: 60, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 60, opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 pt-6 pb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-2xl flex items-center justify-center"
                       style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}>
                    <Plus size={15} className="text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900 dark:text-zinc-100 text-base">Add More Slides</h2>
                    <p className="text-xs text-gray-400 dark:text-zinc-500">Nova already knows your deck's context</p>
                  </div>
                </div>
                <button onClick={() => setShowAddSlides(false)}
                        className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors">
                  <X size={15} className="text-gray-500 dark:text-zinc-400" />
                </button>
              </div>

              <div className="px-6 pb-6 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2">How many slides?</p>
                  <div className="flex gap-2 flex-wrap">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setAddCount(n)}
                        className={`w-10 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                          addCount === n
                            ? 'border-transparent text-white'
                            : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-800 hover:border-gray-300 dark:hover:border-zinc-600'
                        }`}
                        style={addCount === n ? { background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' } : {}}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      onClick={() => setAddCount('auto')}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                        addCount === 'auto'
                          ? 'border-transparent text-white'
                          : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-800 hover:border-gray-300 dark:hover:border-zinc-600'
                      }`}
                      style={addCount === 'auto' ? { background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' } : {}}
                    >
                      ✦ Nova decides
                    </button>
                  </div>
                  {addCount === 'auto' && (
                    <p className="text-[11px] text-purple-500 mt-1.5">Nova will pick the right number of slides based on your content</p>
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2">What should they cover?</p>
                  <textarea
                    value={addDesc}
                    onChange={e => setAddDesc(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddSlides(); }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleAddDrop}
                    placeholder={`e.g. "A competitive analysis comparing the top 3 rivals" or "A closing call-to-action with next steps"`}
                    rows={3}
                    className="w-full bg-gray-100 dark:bg-zinc-800 rounded-2xl px-4 py-3 text-sm text-gray-800 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 outline-none resize-none leading-relaxed"
                  />
                  <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-1">⌘+Enter to generate · drag images below to attach</p>
                </div>

                {/* Attachment row */}
                <div>
                  <input
                    ref={addFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => handleAddAttach(e.target.files)}
                  />
                  {addAttachments.length > 0 && (
                    <div className="flex gap-2 flex-wrap mb-2">
                      {addAttachments.map(att => (
                        <div key={att.id} className="relative group">
                          <img src={att.data} alt={att.name} className="h-12 w-12 rounded-xl object-cover border border-gray-200 dark:border-zinc-700" />
                          <button
                            onClick={() => setAddAttachments(prev => prev.filter(a => a.id !== att.id))}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-gray-800 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={8} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => addFileRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                  >
                    <Paperclip size={12} />
                    Attach reference images
                  </button>
                </div>

                <button
                  onClick={handleAddSlides}
                  disabled={!addDesc.trim() || addLoading}
                  className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}
                >
                  {addLoading ? (
                    <><Loader2 size={16} className="animate-spin" /> Generating…</>
                  ) : addCount === 'auto' ? (
                    <><Sparkles size={15} /> Let Nova decide &amp; generate</>
                  ) : (
                    <><Sparkles size={15} /> Generate {addCount} Slide{addCount > 1 ? 's' : ''}</>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
