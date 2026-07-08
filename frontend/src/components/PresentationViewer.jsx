import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Download, Loader2, ArrowLeft,
  Sparkles, Send, Images, FileDown, Paperclip, X, Plus,
  AlertTriangle, RefreshCw, Check, Pencil, Trash2, ImageIcon, Lock,
  History, RotateCcw,
} from 'lucide-react';
import SlideRenderer from './SlideRenderer';
import OutOfCreditsModal from './OutOfCreditsModal';
import FeedbackButton from './FeedbackButton';
import { exportToPDF, exportImages } from '../utils/pdfExport';
import api from '../api/client';
import { capture } from '../utils/posthog';
import { fileToImageAttachment } from '../utils/imageAttachment';

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
          className={`w-40 rounded-lg overflow-hidden transition-all duration-150 relative select-none ${
            isCurrent ? '' : 'opacity-60 hover:opacity-90'
          }`}
          style={{
            aspectRatio: '16/9',
            ...(isCurrent
              ? { border: '1.5px solid var(--uv-ring)', boxShadow: 'var(--shadow-uv-sm)' }
              : {}),
          }}
        >
          {slide.image_data && !slide.image_data.startsWith('data:image/svg') ? (
            <img src={slide.image_data} alt={slide.title} className="w-full h-full object-cover pointer-events-none" draggable={false} />
          ) : (
            <div className="w-full h-full skeleton" />
          )}
          {slide.status === 'generating' && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
              <Loader2 size={20} className="text-white animate-spin" />
            </div>
          )}
          {slide.status === 'error' && (
            <div className="absolute inset-0 bg-red-900/70 flex flex-col items-center justify-center gap-2 rounded-lg">
              <AlertTriangle size={18} className="text-red-300" />
              <button
                onPointerUp={e => { e.stopPropagation(); if (!wasDragging.current) onRetry(idx); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-white text-[11px] font-semibold leading-none"
              >
                <RefreshCw size={10} />
                Retry
              </button>
            </div>
          )}
          {slide.status === 'locked' && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg"
                 style={{ background: 'rgba(10,10,15,0.7)' }}>
              <Lock size={18} style={{ color: '#8B80FF' }} />
            </div>
          )}
          {slide.status !== 'generating' && slide.status !== 'error' && slide.status !== 'locked' && slide.status !== 'loading' &&
           (!slide.image_data || slide.image_data === '' || slide.image_data?.startsWith('data:image/svg+xml')) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-lg"
                 style={{ background: 'rgba(91,80,255,0.15)' }}>
              <ImageIcon size={16} style={{ color: '#8B80FF' }} />
              <button
                onPointerUp={e => { e.stopPropagation(); if (!wasDragging.current) onRetry(idx); }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold text-white"
                style={{ background: '#5B50FF' }}
              >
                <RefreshCw size={9} /> Retry
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
      <span
        className={`text-xs font-medium transition-colors select-none ${isCurrent ? '' : 'text-gray-400 dark:text-zinc-500'}`}
        style={isCurrent ? { color: '#8B80FF' } : undefined}
      >
        {idx + 1}
      </span>
    </Reorder.Item>
  );
}

export default function PresentationViewer({ slides, presentationId, title, onBack, onSlidesUpdate, onTitleChange, currentPlan = 'free', deckStyle = 'classic' }) {
  const [current, setCurrent] = useState(0);
  const [outOfCredits, setOutOfCredits] = useState(null);
  const [unlockingSlides, setUnlockingSlides] = useState(new Set());
  const [editInstruction, setEditInstruction] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportingImages, setExportingImages] = useState(false);
  const [updatingSlides, setUpdatingSlides] = useState(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [localSlides, setLocalSlides] = useState(slides);
  const [editAttachments, setEditAttachments] = useState([]);
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [showEditPrompt, setShowEditPrompt] = useState(false);

  // Version history panel
  const [showVersionsPanel, setShowVersionsPanel] = useState(false);
  const [slideVersions, setSlideVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState('');
  const [restoringVersionId, setRestoringVersionId] = useState(null);

  // Title editing
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleValue, setTitleValue] = useState(title);
  const [titleSuggesting, setTitleSuggesting] = useState(false);
  const titleInputRef = useRef(null);

  // Add slides modal
  const [showAddSlides, setShowAddSlides] = useState(false);
  const [addDesc, setAddDesc] = useState('');
  const [addCount, setAddCount] = useState(1); // number 1-5 or 'auto'
  const [addStyle, setAddStyle] = useState(deckStyle); // 'classic' | 'minimalistic' — defaults to the deck's style
  const [addAttachments, setAddAttachments] = useState([]);
  const [addLoading, setAddLoading] = useState(false);
  // Keep the add-slides style in sync with the deck's style once it loads in.
  useEffect(() => { setAddStyle(deckStyle); }, [deckStyle]);
  const addFileRef = useRef(null);

  // Error states
  const [editError, setEditError] = useState('');
  const [addError, setAddError] = useState('');
  const [titleSuggestError, setTitleSuggestError] = useState('');
  const [reorderError, setReorderError] = useState('');

  const [slowSlideWarning, setSlowSlideWarning] = useState(false);
  const slowTimerRef = useRef(null);

  const editRef = useRef(null);
  const filmstripRef = useRef(null);
  const exportMenuRef = useRef(null);
  const editFileRef = useRef(null);

  useEffect(() => { setLocalSlides(slides); }, [slides]);
  useEffect(() => { setTitleValue(title); }, [title]);

  // Reset the edit popup/prompt bar when switching slides
  useEffect(() => {
    setShowEditConfirm(false);
    setShowEditPrompt(false);
    setEditInstruction('');
    setEditAttachments([]);
    setEditError('');
    setShowVersionsPanel(false);
    setSlideVersions([]);
    setVersionsError('');
  }, [current]);

  // Show friendly message when the current slide has been generating for >60s
  useEffect(() => {
    clearTimeout(slowTimerRef.current);
    setSlowSlideWarning(false);
    const slide = localSlides[current];
    if (slide?.status === 'generating' || updatingSlides.has(current)) {
      slowTimerRef.current = setTimeout(() => setSlowSlideWarning(true), 60000);
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
      setReorderError("Slide order couldn't be saved.");
      setTimeout(() => setReorderError(''), 3000);
    }
  }

  function handleEditAttach(files) {
    Array.from(files).forEach(async file => {
      const { data, mimeType } = await fileToImageAttachment(file);
      setEditAttachments(prev => [...prev, {
        id: Math.random().toString(36).slice(2),
        name: file.name,
        data,
        mimeType,
      }]);
    });
  }

  async function handleEditSubmit() {
    if (!editInstruction.trim() || editLoading) return;
    const slideIndex = localSlides[current]?.index;
    setEditLoading(true);
    setEditError('');
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
      setShowEditPrompt(false);
    } catch (err) {
      console.error('Edit failed:', err);
      setLocalSlides(prev => prev.map((s, i) => i === current ? { ...s, status: 'error' } : s));
      setUpdatingSlides(prev => { const n = new Set(prev); n.delete(current); return n; });
      if (err.response?.status === 402) {
        setOutOfCredits(err.response.data);
      } else {
        setEditError('Edit failed — please try again.');
      }
    } finally {
      setEditLoading(false);
    }
  }

  async function handleOpenVersions() {
    const slideIndex = localSlides[current]?.index;
    setShowVersionsPanel(true);
    setVersionsLoading(true);
    setVersionsError('');
    try {
      const { data } = await api.get(`/presentations/${presentationId}/slides/${slideIndex}/versions`);
      setSlideVersions(data.versions || []);
    } catch (err) {
      console.error('Failed to load versions:', err);
      setVersionsError("Couldn't load version history.");
    } finally {
      setVersionsLoading(false);
    }
  }

  async function handleRestoreVersion(versionId) {
    const slideIndex = localSlides[current]?.index;
    setRestoringVersionId(versionId);
    setVersionsError('');
    try {
      const { data } = await api.post(`/presentations/${presentationId}/slides/${slideIndex}/versions/${versionId}/restore`);
      setLocalSlides(prev => {
        const next = prev.map(s => s.index === data.slide.index ? data.slide : s);
        onSlidesUpdate(next);
        return next;
      });
      // slide.versions carries metadata stubs only (images live in the
      // slide_versions table) — re-fetch the panel's full entries.
      const refreshed = await api.get(`/presentations/${presentationId}/slides/${slideIndex}/versions`);
      setSlideVersions(refreshed.data.versions || []);
    } catch (err) {
      console.error('Failed to restore version:', err);
      setVersionsError("Couldn't restore this version — please try again.");
    } finally {
      setRestoringVersionId(null);
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
      capture('slide_deleted', { presentation_id: presentationId, slide_index: slide.index });
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
      if (err.response?.status === 402) {
        setOutOfCredits(err.response.data);
      }
    }
  }

  async function handleUnlockSlide(slideIdx) {
    const slide = localSlides[slideIdx];
    if (!slide || unlockingSlides.has(slideIdx)) return;
    setUnlockingSlides(prev => new Set([...prev, slideIdx]));
    try {
      const { data } = await api.post(`/presentations/${presentationId}/unlock-slides`, {
        slide_indexes: [slide.index],
      });
      const unlocked = data.slides || [];
      setLocalSlides(prev => {
        const next = prev.map(s => {
          const match = unlocked.find(u => u.index === s.index);
          return match ? { ...s, ...match } : s;
        });
        onSlidesUpdate(next);
        return next;
      });
    } catch (err) {
      console.error('Unlock failed:', err);
      if (err.response?.status === 402) {
        setOutOfCredits(err.response.data);
      }
    } finally {
      setUnlockingSlides(prev => { const n = new Set(prev); n.delete(slideIdx); return n; });
    }
  }

  async function handleExportPDF() {
    setExportingPDF(true); setShowExportMenu(false);
    try {
      await exportToPDF(localSlides, titleValue, currentPlan);
      capture('presentation_exported', { presentation_id: presentationId, format: 'pdf', slide_count: localSlides.length });
    } finally { setExportingPDF(false); }
  }

  async function handleExportImages() {
    setExportingImages(true); setShowExportMenu(false);
    try {
      await exportImages(localSlides, titleValue, currentPlan);
      capture('presentation_exported', { presentation_id: presentationId, format: 'images', slide_count: localSlides.length });
    } finally { setExportingImages(false); }
  }

  async function handleTitleSave() {
    const trimmed = titleValue.trim();
    if (!trimmed) { setTitleValue(title); setTitleEditing(false); return; }
    setTitleEditing(false);
    const previous = title;
    // Optimistic — show the new title immediately, roll back if the save fails.
    onTitleChange?.(trimmed);
    try {
      await api.patch(`/presentations/${presentationId}/title`, { title: trimmed });
    } catch {
      setTitleValue(previous);
      onTitleChange?.(previous);
    }
  }

  async function handleSuggestTitle() {
    setTitleSuggesting(true);
    setTitleSuggestError('');
    try {
      const { data } = await api.post(`/presentations/${presentationId}/suggest-title`);
      setTitleValue(data.title);
      setTitleEditing(true);
    } catch {
      setTitleSuggestError("Couldn't generate a title suggestion.");
    } finally {
      setTitleSuggesting(false);
    }
  }

  function handleAddAttach(files) {
    Array.from(files).forEach(async file => {
      if (!file.type.startsWith('image/')) return;
      const { data, mimeType } = await fileToImageAttachment(file);
      setAddAttachments(prev => [...prev, {
        id: Math.random().toString(36).slice(2),
        name: file.name, data, mimeType,
      }]);
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
    setAddError('');
    try {
      await api.post(`/presentations/${presentationId}/add-slides`, {
        description: addDesc.trim(),
        count: addCount,
        style: addStyle,
        attachments: addAttachments.map(a => ({ data: a.data, mimeType: a.mimeType, name: a.name })),
      });
      setShowAddSlides(false);
      setAddDesc('');
      setAddCount(1);
      setAddAttachments([]);
    } catch (err) {
      console.error('Add slides failed:', err);
      if (err.response?.status === 402) {
        setShowAddSlides(false);
        setOutOfCredits(err.response.data);
      } else {
        setAddError('Could not add slides — please try again.');
      }
    } finally {
      setAddLoading(false);
    }
  }

  const activeSlide = localSlides[current];
  const isLocked = activeSlide?.status === 'locked';
  const isUpdating = updatingSlides.has(current) || activeSlide?.status === 'generating';
  const isFailed = activeSlide?.status === 'error' && !updatingSlides.has(current);
  const isInitialLoading = activeSlide?.status === 'loading';
  const isMissingImage = !isUpdating && !isFailed && !isLocked && !isInitialLoading && activeSlide &&
    (!activeSlide.image_data || activeSlide.image_data === '' ||
     activeSlide.image_data?.startsWith('data:image/svg+xml'));

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-zinc-950 overflow-hidden">

      {/* ── Reorder error toast ──────────────────────────────── */}
      <AnimatePresence>
        {reorderError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            style={{
              position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#ef4444', borderRadius: 10, padding: '8px 16px',
              fontFamily: 'Inter, sans-serif', fontSize: 13, zIndex: 100,
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}
          >
            {reorderError}
            <button
              onClick={() => setReorderError('')}
              style={{ color: '#888', cursor: 'pointer', background: 'none', border: 'none', fontSize: 16, lineHeight: 1, padding: 0 }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>

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
          <div className="w-7 h-7 flex items-center justify-center flex-shrink-0"
               style={{ background: '#5B50FF', clipPath: 'polygon(0 0, 100% 0, 100% 78%, 78% 100%, 0 100%)' }}>
            <span style={{ fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900, color: '#fff', fontSize: 13, letterSpacing: '-0.1em', paddingRight: '0.1em', display: 'block', lineHeight: 1 }}>HB</span>
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
                className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                style={{ background: 'var(--uv-dim)', color: 'var(--uv-soft)' }}
              >
                <Check size={12} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                onClick={() => setTitleEditing(true)}
                className="font-semibold text-gray-900 dark:text-zinc-100 text-sm truncate transition-colors group flex items-center gap-1 hover:text-[#6E63FF] dark:hover:text-[#8B80FF]"
                title="Click to rename"
              >
                {titleValue}
                <Pencil size={11} className="text-gray-400 dark:text-zinc-500 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
              </button>
              <button
                onClick={handleSuggestTitle}
                disabled={titleSuggesting}
                className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-colors"
                style={{ background: 'var(--uv-dim)' }}
                title="AI suggest title"
              >
                {titleSuggesting
                  ? <Loader2 size={11} className="animate-spin" style={{ color: 'var(--uv-soft)' }} />
                  : <Sparkles size={11} style={{ color: 'var(--uv-soft)' }} />}
              </button>
              {titleSuggestError && (
                <span style={{ color: '#ef4444', fontSize: 11, fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>
                  {titleSuggestError}
                </span>
              )}
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
            className="export-cta-btn flex items-center gap-1.5 px-3 py-1.5 text-white transition-all duration-150 active:scale-95"
            style={{
              background: '#5B50FF',
              borderRadius: 6,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: '0.01em',
              boxShadow: 'none',
            }}
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
                className="absolute right-0 top-10 bg-white dark:bg-[#141414] shadow-ios-xl border border-gray-100 dark:border-[#1e1e1e] py-2 w-48 z-50"
                style={{ borderRadius: 12 }}
              >
                <button onClick={handleExportImages} className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-sm text-gray-800 dark:text-[#f0f0ee]">
                  <Images size={15} style={{ color: '#8B80FF' }} />
                  Download as Images
                </button>
                <button onClick={handleExportPDF} className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-sm text-gray-800 dark:text-[#f0f0ee]">
                  <FileDown size={15} style={{ color: '#8B80FF' }} />
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
              <SlideRenderer
                slide={activeSlide}
                className="rounded-xl shadow-2xl"
                onUnlock={isLocked ? () => handleUnlockSlide(current) : undefined}
                unlocking={unlockingSlides.has(current)}
                showWatermark={currentPlan === 'free'}
              />

              {/* Version history button — shown once this slide has prior versions */}
              {!isUpdating && !isLocked && activeSlide?.versions?.length > 0 && (
                <button
                  onClick={e => { e.stopPropagation(); handleOpenVersions(); }}
                  className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold text-white transition-colors hover:bg-black/80"
                  style={{ background: 'rgba(20,20,28,0.65)', backdropFilter: 'blur(6px)' }}
                  title="View previous versions of this slide"
                >
                  <History size={13} />
                  History
                </button>
              )}

              {/* Click-to-edit: clicking a ready slide asks "Make edits?" */}
              {!isUpdating && !isFailed && !isLocked && !showEditPrompt && (
                <div
                  style={{ position: 'absolute', inset: 0, borderRadius: 12, cursor: 'pointer' }}
                  onClick={() => setShowEditConfirm(v => !v)}
                >
                  <AnimatePresence>
                    {showEditConfirm && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        style={{
                          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                          background: 'rgba(255,255,255,0.97)', borderRadius: 20, padding: '8px 10px 8px 16px',
                          display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap',
                          fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: '#1a1a2e',
                          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        <Pencil size={14} />
                        Make edits to this slide?
                        <button
                          onClick={() => { setShowEditConfirm(false); setShowEditPrompt(true); }}
                          className="px-3 py-1.5 rounded-full text-xs font-bold text-white"
                          style={{ background: '#5B50FF' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setShowEditConfirm(false)}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Edit prompt bar — appears once "Edit" is confirmed */}
              <AnimatePresence>
                {showEditPrompt && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 16 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                      position: 'absolute', left: 16, right: 16, bottom: 16,
                      background: 'rgba(20,20,28,0.92)', borderRadius: 18, padding: 12,
                      backdropFilter: 'blur(10px)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    {editAttachments.length > 0 && (
                      <div className="flex gap-2 flex-wrap mb-2">
                        {editAttachments.map(att => (
                          <div key={att.id} className="relative group">
                            <img src={att.data} alt={att.name} className="h-10 w-10 rounded-lg object-cover border border-white/10" />
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
                    <div className="flex items-center gap-2">
                      <input ref={editFileRef} type="file" accept="image/*" multiple className="hidden"
                             onChange={e => handleEditAttach(e.target.files)} />
                      <div className="flex-1 flex items-center gap-2 rounded-2xl px-3.5 py-2"
                           style={{ background: 'rgba(255,255,255,0.07)' }}>
                        <textarea
                          ref={editRef}
                          autoFocus
                          value={editInstruction}
                          onChange={e => setEditInstruction(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
                            if (e.key === 'Escape') setShowEditPrompt(false);
                          }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={handleEditDrop}
                          placeholder={`Describe what you'd like to change…`}
                          rows={1}
                          className="flex-1 bg-transparent text-sm outline-none text-white placeholder:text-white/35 resize-none leading-relaxed"
                          style={{ maxHeight: 80 }}
                        />
                        <button
                          onClick={() => editFileRef.current?.click()}
                          className="flex-shrink-0 w-7 h-7 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors"
                          title="Attach reference image (becomes pic2, pic3…)"
                        >
                          <Paperclip size={13} className="text-white/40" />
                        </button>
                      </div>
                      <button
                        onClick={handleEditSubmit}
                        disabled={!editInstruction.trim() || editLoading || isUpdating}
                        className="w-9 h-9 rounded-2xl flex items-center justify-center text-white transition-all duration-150 active:scale-95 disabled:opacity-40 flex-shrink-0"
                        style={{ background: '#5B50FF' }}
                      >
                        {editLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={14} />}
                      </button>
                      <button
                        onClick={() => setShowEditPrompt(false)}
                        className="w-9 h-9 rounded-2xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
                        title="Cancel"
                      >
                        <X size={15} />
                      </button>
                    </div>
                    {editError && (
                      <p style={{ color: '#f87171', fontSize: 12, fontFamily: 'Inter, sans-serif', marginTop: 6 }}>
                        {editError}
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Missing image overlay */}
              {isMissingImage && (
                <div className="absolute inset-0 rounded-xl flex flex-col items-center justify-center gap-3"
                     style={{ background: 'rgba(91,80,255,0.12)', backdropFilter: 'blur(2px)' }}>
                  <ImageIcon size={28} style={{ color: 'rgba(91,80,255,0.6)' }} />
                  <p className="text-sm font-semibold" style={{ color: '#5B50FF' }}>Image not generated</p>
                  <button
                    onClick={() => handleRetrySlide(current)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors active:scale-95"
                    style={{ background: '#5B50FF' }}
                  >
                    <RefreshCw size={13} /> Regenerate
                  </button>
                </div>
              )}

              {/* Generating overlay */}
              {isUpdating && (
                <div className="absolute inset-0 rounded-xl flex flex-col items-center justify-center gap-3 px-8 text-center"
                     style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}>
                  <Loader2 size={32} className="text-white animate-spin" />
                  <p className="text-white text-sm font-semibold">Generating slide…</p>
                  {slowSlideWarning ? (
                    <p className="text-white/70 text-xs max-w-xs leading-relaxed">
                      Don't worry, your slide is still being processed. Our service is experiencing high demand right now, but we're on it.
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
      <div className="flex-shrink-0 bg-white dark:bg-[#141414] border-t border-gray-200 dark:border-[#1e1e1e]">

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
              className="add-slide-btn w-40 rounded-lg border-2 border-dashed border-gray-300 dark:border-zinc-700 flex flex-col items-center justify-center gap-1 text-[color:var(--text-muted)] transition-none"
              style={{ aspectRatio: '16/9' }}
              title="Add more slides"
            >
              <Plus size={24} />
              <span className="text-xs font-semibold leading-none">Add slide</span>
            </button>
            <span className="text-xs text-transparent select-none">+</span>
          </div>
        </Reorder.Group>
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
                  <div className="w-8 h-8 flex items-center justify-center"
                       style={{ background: '#5B50FF', borderRadius: 12 }}>
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
                        style={addCount === n ? { background: '#5B50FF' } : {}}
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
                      style={addCount === 'auto' ? { background: '#5B50FF' } : {}}
                    >
                      ✦ Nova decides
                    </button>
                  </div>
                  {addCount === 'auto' && (
                    <p className="text-[11px] mt-1.5" style={{ color: 'var(--uv-soft)' }}>Nova will pick the right number of slides based on your content</p>
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2">Visual style</p>
                  <div className="flex gap-2">
                    {[
                      { value: 'classic', label: 'Classic', desc: 'Bold editorial' },
                      { value: 'minimalistic', label: 'Minimalistic', desc: 'Cinematic & clean' },
                    ].map(({ value, label, desc }) => (
                      <button
                        key={value}
                        onClick={() => setAddStyle(value)}
                        className={`flex-1 py-2 px-3 rounded-xl text-sm font-semibold border-2 transition-all text-left ${
                          addStyle === value
                            ? 'border-transparent text-white'
                            : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-800 hover:border-gray-300 dark:hover:border-zinc-600'
                        }`}
                        style={addStyle === value ? { background: '#5B50FF' } : {}}
                      >
                        {label}
                        <span className={`block text-[11px] font-normal mt-0.5 ${addStyle === value ? 'text-white/75' : 'text-gray-400 dark:text-zinc-500'}`}>{desc}</span>
                      </button>
                    ))}
                  </div>
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
                    className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-zinc-400 transition-colors hover:text-[#6E63FF] dark:hover:text-[#8B80FF]"
                  >
                    <Paperclip size={12} />
                    Attach reference images
                  </button>
                </div>

                <button
                  onClick={handleAddSlides}
                  disabled={!addDesc.trim() || addLoading}
                  className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40"
                  style={{ background: '#5B50FF' }}
                >
                  {addLoading ? (
                    <><Loader2 size={16} className="animate-spin" /> Generating…</>
                  ) : addCount === 'auto' ? (
                    <><Sparkles size={15} /> Let Nova decide &amp; generate</>
                  ) : (
                    <><Sparkles size={15} /> Generate {addCount} Slide{addCount > 1 ? 's' : ''}</>
                  )}
                </button>
                {addError && (
                  <p style={{ color: '#ef4444', fontSize: 12, fontFamily: 'Inter, sans-serif', textAlign: 'center', marginTop: 4 }}>
                    {addError}
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Out of credits modal ─────────────────────────────── */}
      <AnimatePresence>
        {outOfCredits && (
          <OutOfCreditsModal
            currentPlan={currentPlan}
            details={outOfCredits}
            onClose={() => setOutOfCredits(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Version history side panel ───────────────────────── */}
      <AnimatePresence>
        {showVersionsPanel && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setShowVersionsPanel(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="fixed top-0 right-0 h-full w-full sm:w-96 bg-white dark:bg-[#141414] border-l border-gray-200 dark:border-[#1e1e1e] z-50 flex flex-col"
            >
              <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 dark:border-[#1e1e1e] flex-shrink-0">
                <h3 className="font-semibold text-sm text-gray-900 dark:text-zinc-100 flex items-center gap-2">
                  <History size={15} style={{ color: '#8B80FF' }} />
                  Version history
                </h3>
                <button
                  onClick={() => setShowVersionsPanel(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                {versionsLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-gray-400" />
                  </div>
                )}

                {!versionsLoading && slideVersions.length === 0 && !versionsError && (
                  <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">
                    No earlier versions yet. When you edit this slide, the previous version will be saved here.
                  </p>
                )}

                {!versionsLoading && slideVersions.map(v => (
                  <div key={v.id} className="flex gap-3 p-2.5 rounded-xl border border-gray-200 dark:border-zinc-800">
                    <img
                      src={v.image_data}
                      alt="Previous slide version"
                      className="w-24 flex-shrink-0 rounded-lg object-cover"
                      style={{ aspectRatio: '16/9' }}
                    />
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <p className="text-[11px] text-gray-400 dark:text-zinc-500">
                        {new Date(v.created_at).toLocaleString()}
                      </p>
                      {v.instruction && (
                        <p className="text-xs text-gray-700 dark:text-zinc-300 leading-snug line-clamp-3">
                          {v.instruction}
                        </p>
                      )}
                      <button
                        onClick={() => handleRestoreVersion(v.id)}
                        disabled={restoringVersionId === v.id}
                        className="self-start flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50"
                        style={{ background: 'var(--uv-dim)', color: 'var(--uv-soft)' }}
                      >
                        {restoringVersionId === v.id
                          ? <Loader2 size={11} className="animate-spin" />
                          : <RotateCcw size={11} />}
                        Restore this version
                      </button>
                    </div>
                  </div>
                ))}

                {versionsError && (
                  <p style={{ color: '#ef4444', fontSize: 12, fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
                    {versionsError}
                  </p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <FeedbackButton />
    </div>
  );
}
