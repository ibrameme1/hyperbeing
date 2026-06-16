import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertTriangle, Sparkles, ImageOff } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import TopNav from '../components/TopNav';
import ModeSwitcher from '../components/ModeSwitcher';
import DesignComposer from '../components/DesignComposer';
import DesignDetailModal from '../components/DesignDetailModal';
import OutOfCreditsModal from '../components/OutOfCreditsModal';
import FeedbackButton from '../components/FeedbackButton';
import { capture } from '../utils/posthog';

function GalleryCell({ gen, onClick, isDark }) {
  const isComplete = gen.status === 'complete' && gen.image_data;
  const isError = gen.status === 'error';
  const isWorking = gen.status === 'pending' || gen.status === 'generating';
  const isClickable = isComplete || isError;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={() => isClickable && onClick(gen)}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : -1}
      onKeyDown={e => { if (isClickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(gen); } }}
      className={`aspect-[16/9] rounded-lg overflow-hidden relative ${isClickable ? 'cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-uv' : ''}`}
      style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
    >
      {isComplete && (
        <img src={gen.image_data} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      )}

      {isWorking && (
        <div className="w-full h-full skeleton flex flex-col items-center justify-center gap-2">
          <Loader2 size={20} className="animate-spin" style={{ color: '#8B80FF' }} />
          <span className="text-xs" style={{ color: isDark ? '#888' : '#999' }}>
            {gen.status === 'pending' ? 'Queued…' : 'Generating…'}
          </span>
        </div>
      )}

      {isError && (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-3 group-hover:opacity-80 transition-opacity"
             style={{ background: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.06)' }}>
          <AlertTriangle size={18} style={{ color: '#f87171' }} />
          <span className="text-xs" style={{ color: '#f87171' }}>Generation failed — click to retry</span>
        </div>
      )}

      {gen.mode === 'nova' && isComplete && (
        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
             style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
          <Sparkles size={10} style={{ color: '#fff' }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: '#fff' }}>Nova</span>
        </div>
      )}
    </motion.div>
  );
}

export default function DesignGalleryPage() {
  const { user, logout } = useAuth();
  const { isDark, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [generations, setGenerations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [imageCount, setImageCount] = useState(2);
  const [craftMode, setCraftMode] = useState('nova');
  const [editingReference, setEditingReference] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [credits, setCredits] = useState(null);
  const [currentPlan, setCurrentPlan] = useState('free');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showOutOfCredits, setShowOutOfCredits] = useState(false);
  const [outOfCreditsDetails, setOutOfCreditsDetails] = useState(null);

  function refreshCredits() {
    api.get('/billing/subscription')
      .then(r => {
        setCredits(r.data.subscription.credits_remaining);
        setCurrentPlan(r.data.subscription.plan);
        setIsAdmin(r.data.subscription.is_admin || false);
      })
      .catch(() => {});
  }

  const upsertGeneration = useCallback((gen) => {
    setGenerations(prev => {
      const exists = prev.some(g => g.id === gen.id);
      const next = exists ? prev.map(g => g.id === gen.id ? gen : g) : [gen, ...prev];
      next.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return next;
    });
    setSelected(prev => (prev && prev.id === gen.id) ? gen : prev);
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    refreshCredits();
    const creditsInterval = setInterval(refreshCredits, 30_000);

    api.get('/design')
      .then(r => setGenerations(r.data.generations || []))
      .catch(() => {})
      .finally(() => setLoading(false));

    const token = localStorage.getItem('hb_token');
    const apiBase = import.meta.env.VITE_API_URL || '';
    const sse = new EventSource(`${apiBase}/api/design/events?token=${encodeURIComponent(token)}`);

    sse.onmessage = (e) => {
      let event;
      try { event = JSON.parse(e.data); } catch { return; }
      if (event.type === 'generation_updated' && event.generation) {
        upsertGeneration(event.generation);
        if (event.generation.status === 'complete' || event.generation.status === 'error') refreshCredits();
      }
    };
    sse.onerror = () => {};

    return () => {
      clearInterval(creditsInterval);
      sse.close();
    };
  }, [user?.id, upsertGeneration]);

  function handleModeChange(mode) {
    if (mode === 'presentation') navigate('/dashboard');
  }

  function handleAddAttachment(file) {
    setAttachments(prev => [...prev, file]);
  }

  function handleRemoveAttachment(id) {
    setAttachments(prev => prev.filter(f => f.id !== id));
    if (editingReference?.attachmentId === id) setEditingReference(null);
  }

  function handleClearEditing() {
    if (editingReference) handleRemoveAttachment(editingReference.attachmentId);
    setEditingReference(null);
  }

  function handleReference(gen) {
    const id = Math.random().toString(36).slice(2);
    setAttachments(prev => [...prev, { id, name: `design-${gen.id}.png`, mimeType: 'image/png', data: gen.image_data }]);
    setSelected(null);
  }

  function handleEdit(gen) {
    const id = Math.random().toString(36).slice(2);
    setAttachments(prev => [...prev, { id, name: `design-${gen.id}.png`, mimeType: 'image/png', data: gen.image_data }]);
    setEditingReference({ ...gen, attachmentId: id });
    setPrompt('');
    setSelected(null);
  }

  async function handleRetry(gen) {
    try {
      const { data } = await api.post(`/design/${gen.id}/retry`);
      upsertGeneration(data.generation);
      setCredits(data.creditsRemaining);
    } catch (err) {
      const status = err.response?.status;
      if (status === 402) {
        setOutOfCreditsDetails(err.response.data || null);
        setShowOutOfCredits(true);
        capture('out_of_credits', { page: 'design_gallery', action_type: 'design_generation_retry' });
      }
    }
  }

  async function handleSubmit() {
    if (!prompt.trim() && attachments.length === 0) return;
    setSubmitting(true);
    setSubmitError('');

    capture('design_generation_submitted', {
      mode: craftMode,
      count: imageCount,
      has_attachments: attachments.length > 0,
    });

    try {
      const { data } = await api.post('/design/generate', {
        prompt: prompt.trim(),
        mode: craftMode,
        count: imageCount,
        attachments: attachments.map(a => ({ type: 'image', name: a.name, data: a.data, mimeType: a.mimeType })),
      });

      setGenerations(prev => [...data.generations, ...prev]);
      setCredits(data.creditsRemaining);
      setPrompt('');
      setAttachments([]);
      setEditingReference(null);
    } catch (err) {
      const status = err.response?.status;
      if (status === 402) {
        setOutOfCreditsDetails(err.response.data || null);
        setShowOutOfCredits(true);
        capture('out_of_credits', { page: 'design_gallery', action_type: 'design_generation' });
        return;
      }
      setSubmitError(
        err.response?.data?.error ||
        (status === 429 ? 'Too many requests. Please wait a moment before trying again.' :
         'Failed to start generation. Please try again.')
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-page)' }}>
      <TopNav
        isDark={isDark}
        toggleTheme={toggleTheme}
        user={user}
        credits={credits}
        currentPlan={currentPlan}
        isAdmin={isAdmin}
        onLogout={logout}
        onUpgrade={() => navigate('/pricing')}
      />

      <div className="max-w-3xl mx-auto px-4 pt-8 w-full">
        <ModeSwitcher mode="design" onChange={handleModeChange} isDark={isDark} />
      </div>

      <main className="flex-1 max-w-5xl mx-auto px-4 w-full pb-4">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="aspect-[16/9] rounded-lg skeleton" />
            ))}
          </div>
        ) : generations.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div style={{ background: 'rgba(91,80,255,0.1)', border: '0.5px solid rgba(91,80,255,0.2)', borderRadius: 12, width: 64, height: 64, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <ImageOff size={26} style={{ color: '#5B50FF' }} />
            </div>
            <p className="font-bold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>Your gallery is empty</p>
            <p className="text-sm max-w-xs mx-auto leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Describe a design below — packaging, mockups, social creatives — and Nova will bring it to life.
            </p>
          </motion.div>
        ) : (
          <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {generations.map(gen => (
                <GalleryCell key={gen.id} gen={gen} onClick={setSelected} isDark={isDark} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      {/* Composer */}
      <div className="sticky bottom-0 z-30 px-4 pb-4 pt-3"
           style={{ background: isDark ? 'linear-gradient(180deg, rgba(15,15,15,0) 0%, rgba(15,15,15,0.9) 30%, rgba(15,15,15,1) 100%)' : 'linear-gradient(180deg, rgba(245,245,245,0) 0%, rgba(245,245,245,0.9) 30%, rgba(245,245,245,1) 100%)' }}>
        <div className="max-w-3xl mx-auto w-full">
          {submitError && (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-2.5 mb-2">{submitError}</p>
          )}
          <DesignComposer
            isDark={isDark}
            prompt={prompt}
            onPromptChange={setPrompt}
            attachments={attachments}
            onAddAttachment={handleAddAttachment}
            onRemoveAttachment={handleRemoveAttachment}
            imageCount={imageCount}
            onImageCountChange={setImageCount}
            craftMode={craftMode}
            onCraftModeChange={setCraftMode}
            onSubmit={handleSubmit}
            submitting={submitting}
            editingReference={editingReference}
            onClearEditing={handleClearEditing}
          />
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <DesignDetailModal
            generation={selected}
            onClose={() => setSelected(null)}
            onReference={handleReference}
            onEdit={handleEdit}
            onRetry={handleRetry}
            isDark={isDark}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showOutOfCredits && (
          <OutOfCreditsModal
            currentPlan={currentPlan}
            details={outOfCreditsDetails}
            onClose={() => { setShowOutOfCredits(false); setOutOfCreditsDetails(null); }}
          />
        )}
      </AnimatePresence>

      <FeedbackButton />
    </div>
  );
}
