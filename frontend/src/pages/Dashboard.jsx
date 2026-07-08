import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import {
  Sparkles, Send, X, Clock, Trash2, Loader2,
  ImageIcon, Palette, Plus, ChevronDown, ChevronUp, Zap,
  Bot, Search, Globe,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { usePresentations, useSubscription, useDeletePresentation, queryKeys } from '../api/queries';
import { openAuthedEventSource } from '../utils/sse';
import OutOfCreditsModal from '../components/OutOfCreditsModal';
import NovaMascot from '../components/NovaMascot';
import { useTheme } from '../contexts/ThemeContext';
import { track } from '../utils/track';
import { capture } from '../utils/posthog';
import { SkeletonDashboardPage, SkeletonCard } from '../components/Skeleton';
import FeedbackButton from '../components/FeedbackButton';
import { fileToImageAttachment } from '../utils/imageAttachment';

// Builds the authed URL for a presentation's thumbnail image. Access tokens
// rotate every 15 min, so a leaked URL goes stale quickly.
function thumbnailUrl(pres) {
  const base = import.meta.env.VITE_API_URL || '';
  const token = localStorage.getItem('hb_token') || '';
  return `${base}/api/presentations/${pres.id}/thumbnail?token=${encodeURIComponent(token)}&v=${encodeURIComponent(pres.updated_at || '')}`;
}
import TopNav from '../components/TopNav';
import ModeSwitcher from '../components/ModeSwitcher';

const ANALYZING_MESSAGES = [
  { text: "ok let me read through this real quick…", emoji: "👀" },
  { text: "hm. interesting brief. i like it.", emoji: "🤔" },
  { text: "gonna ask you a few follow-up questions.", emoji: "💬" },
  { text: "promise they won't be generic ahh questions.", emoji: "🙏" },
  { text: "just figuring out what makes YOUR deck unique…", emoji: "✨" },
  { text: "i need like 2 more seconds, bear with me.", emoji: "⏳" },
  { text: "almost there — cooking something good.", emoji: "🍳" },
];

// Shown while web search is on — Nova takes a little longer, so this set leans
// into the "researching online" story.
const SEARCHING_MESSAGES = [
  { text: "let me look this up online real quick…", emoji: "🔍" },
  { text: "digging up the latest on the web…", emoji: "🌐" },
  { text: "reading up on the competition…", emoji: "🕵️" },
  { text: "checking recent news + market data…", emoji: "📰" },
  { text: "pulling real facts so the questions hit harder…", emoji: "🎯" },
  { text: "cross-referencing a few sources…", emoji: "📚" },
  { text: "almost done researching — hang tight.", emoji: "⏳" },
];

function AnalyzingOverlay({ onCancel, webSearch = false, searchQueries = [] }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const messages = webSearch ? SEARCHING_MESSAGES : ANALYZING_MESSAGES;
  const latestQuery = searchQueries[searchQueries.length - 1];

  useEffect(() => {
    setMsgIdx(0);
    const t = setInterval(() => setMsgIdx(i => (i + 1) % messages.length), 2400);
    return () => clearInterval(t);
  }, [messages]);

  const msg = messages[msgIdx];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(18px)' }}
    >
      <motion.div
        initial={{ scale: 0.88, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.88, opacity: 0, y: 24 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label="Nova is analyzing your brief"
        className="rounded-3xl w-full max-w-sm mx-4 shadow-2xl overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #18102e 0%, #0f172a 100%)', border: '1px solid rgba(139,92,246,0.25)' }}
      >
        <div className="px-8 py-8 flex flex-col items-center text-center">

          {/* Nova mascot video */}
          <div className={`mb-4 ${shouldReduceMotion ? '' : 'nova-float'}`}>
            <NovaMascot size={140} />
          </div>

          {/* Speech bubble */}
          <div className="relative w-full rounded-2xl px-5 py-4 mb-5"
               style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={msgIdx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28 }}
                className="flex items-center justify-center gap-2"
                aria-live="polite"
                aria-atomic="true"
              >
                <span className="text-lg leading-none" aria-hidden="true">{msg.emoji}</span>
                <p className="text-sm font-medium text-white/80 leading-snug">{msg.text}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Live web-search status — shows the real query Nova is running */}
          {webSearch && (
            <div className="w-full mb-4" aria-live="polite" aria-atomic="true">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Search size={13} className={shouldReduceMotion ? '' : 'animate-pulse'} style={{ color: '#8B5CF6' }} />
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {latestQuery ? 'Searching the web' : 'Preparing to search…'}
                </span>
              </div>
              <AnimatePresence mode="wait">
                {latestQuery && (
                  <motion.p
                    key={latestQuery}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.24 }}
                    className="text-sm text-center font-medium truncate px-2"
                    style={{ color: '#C4B5FD' }}
                    title={latestQuery}
                  >
                    “{latestQuery}”
                  </motion.p>
                )}
              </AnimatePresence>
              {searchQueries.length > 1 && (
                <p className="text-[11px] text-center mt-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {searchQueries.length} searches so far
                </p>
              )}
            </div>
          )}

          {/* Typing dots */}
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                animate={shouldReduceMotion ? {} : { y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                className="w-2 h-2 rounded-full"
                style={{ background: '#8B5CF6' }}
              />
            ))}
          </div>

          {onCancel && (
            <button
              onClick={onCancel}
              className="mt-5 text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
import { useAuth } from '../contexts/AuthContext';
import QuestionFlow from '../components/QuestionFlow';


function greeting(name) {
  const h = new Date().getHours();
  const first = name.split(' ')[0];
  const day = new Date().getDay(); // 0=Sun, 6=Sat
  if (h < 5)  return `Still up, ${first}? Let's make something.`;
  if (h < 12) {
    const morning = ['Morning, ', 'Good morning, ', 'Hey ', 'Rise and create, '];
    return morning[day % morning.length] + first;
  }
  if (h < 17) {
    const afternoon = ['Afternoon, ', 'Good afternoon, ', 'Hey ', 'Mid-day grind, '];
    return afternoon[day % afternoon.length] + first;
  }
  const evening = ['Evening, ', 'Good evening, ', 'Late session, ', 'Hey '];
  return evening[day % evening.length] + first;
}

const VIBE_SUBTITLES = {
  'dark-editorial': 'Ready to make something that looks like a magazine cover?',
  'clean-minimal': 'Clean, sharp, minimal — just how you like it.',
  'bold-punchy': 'Time to make something that gets a reaction.',
  'colorful': "Let's make something that brings the energy.",
};
const PRIORITY_SUBTITLES = {
  speed: "Nova's warmed up and ready to move fast.",
  quality: "Nova's in full art-director mode today.",
  storytelling: "Let's build a narrative that lands.",
  automation: 'Describe it. Nova handles the rest.',
};

const PLACEHOLDER_EXAMPLES = [
  'e.g. 10-slide investor pitch for a fintech startup — Series A, US market, bold and confident tone',
  'e.g. Brand strategy deck for a luxury skincare launch — aspirational, editorial feel, 12 slides',
  'e.g. Quarterly business review for a SaaS company — data-heavy, clean minimal, 8 slides',
  'e.g. Go-to-market plan for a B2B analytics tool — storytelling-first, 15 slides',
  'e.g. Marketing campaign proposal for a CPG brand — colorful, punchy, built for a CMO audience',
];
const PLACEHOLDER_TEXT = PLACEHOLDER_EXAMPLES[new Date().getDay() % PLACEHOLDER_EXAMPLES.length];

// ─── Attachment Drop Zone ──────────────────────────────────────────────────
function AttachZone({ label, icon: Icon, accentColor, files, onAdd, onRemove, isDark }) {
  const onDrop = useCallback(accepted => {
    accepted.forEach(async file => {
      try {
        const { data, mimeType } = await fileToImageAttachment(file);
        onAdd({ id: Math.random().toString(36).slice(2), name: file.name, type: 'image', mimeType, data });
      } catch {}
    });
  }, [onAdd]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
  });

  return (
    <div style={{
      background: isDark ? '#141414' : '#fff',
      borderRadius: 8,
      overflow: 'hidden',
      border: '0.5px solid',
      borderColor: isDark ? '#2a2a2a' : '#e8e8e8',
      boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '0.5px solid',
        borderColor: isDark ? '#2a2a2a' : '#e8e8e8',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: accentColor + '18', flexShrink: 0,
        }}>
          <Icon size={14} style={{ color: accentColor }} />
        </div>
        <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600, color: isDark ? '#f0f0ee' : '#0d0b1a' }}>{label}</span>
        <span style={{ fontSize: 11, color: isDark ? '#555555' : '#888888', marginLeft: 'auto' }}>{files.length} image{files.length !== 1 ? 's' : ''}</span>
      </div>

      <div
        {...getRootProps()}
        style={{
          minHeight: 90,
          padding: 12,
          cursor: 'pointer',
          background: isDragActive
            ? (isDark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.06)')
            : 'transparent',
          outline: isDragActive ? '2px solid rgba(59,130,246,0.5)' : 'none',
          outlineOffset: -2,
          transition: 'background 0.2s',
        }}
      >
        <input {...getInputProps()} />

        {files.length === 0 ? (
          <div style={{ height: 66, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: 12, color: isDark ? '#555555' : '#888888', margin: 0 }}>{isDragActive ? 'Drop here' : 'Drop images or click to browse'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {files.map(f => (
              <div key={f.id} style={{ position: 'relative' }} className="group">
                <img src={f.data} alt={f.name}
                     style={{ height: 56, width: 56, borderRadius: 8, objectFit: 'cover', border: '0.5px solid', borderColor: isDark ? '#2a2a2a' : '#e8e8e8', display: 'block' }} />
                <button
                  onClick={e => { e.stopPropagation(); onRemove(f.id); }}
                  aria-label={`Remove ${f.name}`}
                  style={{
                    position: 'absolute', top: -8, right: -8, width: 20, height: 20,
                    background: '#080808', color: '#fff', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid #2a2a2a', cursor: 'pointer', opacity: 0,
                  }}
                  className="group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <div style={{
              height: 56, width: 56, borderRadius: 8,
              border: '1.5px dashed',
              borderColor: isDark ? '#2a2a2a' : '#d0d0d0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: isDark ? '#555555' : '#999999',
            }}>
              <Plus size={16} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Presentation Card ─────────────────────────────────────────────────────
function PresentationCard({ pres, onDelete }) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    if (confirmDelete) cancelBtnRef.current?.focus();
  }, [confirmDelete]);

  function handleDelete(e) {
    e.stopPropagation();
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    setConfirmDelete(false);
    setDeleteError(false);
    capture('presentation_deleted', { presentation_id: pres.id });
    // Optimistic — the parent's mutation removes this card from the list
    // immediately and rolls back (re-adding it) if the request fails.
    onDelete(pres.id);
  }

  function handleCancelDelete(e) {
    e.stopPropagation();
    setConfirmDelete(false);
  }

  const statusStyles = {
    chat:       { background: 'rgba(59,130,246,0.15)',  color: '#60a5fa' },
    ready:      { background: 'rgba(139,92,246,0.15)',  color: '#a78bfa' },
    generating: { background: 'rgba(245,158,11,0.15)',  color: '#fbbf24' },
    completed:  { background: 'rgba(34,197,94,0.15)',   color: '#4ade80' },
  };
  const statusLabels = { chat: 'Draft', ready: 'Ready', generating: 'Generating…', completed: 'Complete' };

  // While an add-slides run is in flight the row stays 'completed' but new
  // slides are still being made — surface that as "Generating…" so the card
  // doesn't falsely read "Complete".
  const effectiveStatus = pres.adding_slides ? 'generating' : pres.status;

  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={shouldReduceMotion ? {} : { scale: 1.02, y: -2 }}
      whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
      onClick={() => navigate(`/presentations/${pres.id}`, { state: { presentation: pres } })}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/presentations/${pres.id}`, { state: { presentation: pres } }); } }}
      aria-label={pres.title}
      className="rounded-lg overflow-hidden cursor-pointer group relative focus:outline-none focus-visible:ring-2 focus-visible:ring-uv"
      style={{ background: 'var(--bg-card)', boxShadow: '0 1px 4px rgba(0,0,0,0.12)', border: '0.5px solid var(--border)' }}
    >
      <div className="aspect-[16/9] overflow-hidden"
           style={{ background: 'linear-gradient(135deg, rgba(91,80,255,0.1) 0%, rgba(139,128,255,0.1) 100%)' }}>
        {pres.has_thumbnail ? (
          // Thumbnails come from a dedicated endpoint instead of base64 in the
          // list payload (which made the dashboard response tens of MB).
          // <img> can't send Authorization headers, so the JWT rides the query
          // string like the SSE routes; ?v= busts the cache after updates.
          <img src={thumbnailUrl(pres)} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full skeleton flex items-center justify-center">
            <Sparkles className="w-7 h-7 opacity-40" style={{ color: '#5B50FF' }} />
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate" style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>{pres.title}</h3>
            <p className="mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              <Clock size={11} />
              {new Date(pres.updated_at).toLocaleDateString()}
            </p>
          </div>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-lg flex-shrink-0"
            style={statusStyles[effectiveStatus] || { background: 'rgba(120,120,120,0.15)', color: '#888' }}
          >
            {statusLabels[effectiveStatus] ?? '—'}
          </span>
        </div>
      </div>

      {deleteError && (
        <div className="absolute bottom-0 inset-x-0 px-3 py-1.5 rounded-b-lg text-xs text-center" style={{ color: '#f87171', background: 'rgba(239,68,68,0.1)' }}>
          Couldn't delete — try again.
        </div>
      )}

      {confirmDelete ? (
        <div
          onClick={e => e.stopPropagation()}
          className="absolute top-2 right-2 flex items-center gap-1 z-10"
          style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
        >
          <button
            onClick={handleDelete}
            className="px-3 py-2 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors"
          >
            Delete
          </button>
          <button
            ref={cancelBtnRef}
            onClick={handleCancelDelete}
            className="px-3 py-2 rounded-lg text-xs font-semibold hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors focus:outline-none"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={handleDelete}
          disabled={deleting}
          aria-label={`Delete ${pres.title}`}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity w-9 h-9 rounded-xl flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          style={{ background: 'var(--bg-card)', boxShadow: '0 1px 4px rgba(0,0,0,0.12)', color: 'var(--text-muted)' }}
        >
          {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      )}
    </motion.div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout } = useAuth();
  const { isDark, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [input, setInput] = useState('');

  const queryClient = useQueryClient();

  const prefs = (() => { try { return JSON.parse(localStorage.getItem('hb_prefs') || 'null'); } catch { return null; } })();
  const heroSubtitle = prefs
    ? (VIBE_SUBTITLES[prefs.design_vibe] || PRIORITY_SUBTITLES[prefs.priority] || 'What will you create today?')
    : 'What will you create today?';
  const [moodboardFiles, setMoodboardFiles] = useState([]);
  const [brandingFiles, setBrandingFiles] = useState([]);
  const [showZones, setShowZones] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [fetchingUrls, setFetchingUrls] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [showQuestionFlow, setShowQuestionFlow] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [pendingInput, setPendingInput] = useState('');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState('16:9');
  const [selectedStyle, setSelectedStyle] = useState('classic'); // 'classic' | 'minimalistic'
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => {
    try { return localStorage.getItem('hb_websearch') === '1'; } catch { return false; }
  });
  const [searchQueries, setSearchQueries] = useState([]);
  const [showOutOfCredits, setShowOutOfCredits] = useState(false);
  const [outOfCreditsDetails, setOutOfCreditsDetails] = useState(null);
  const [creatingPresentation, setCreatingPresentation] = useState(false);
  const [adminSlideCount, setAdminSlideCount] = useState(null); // null = let Nova decide
  const [showSlideCountInput, setShowSlideCountInput] = useState(false);
  const slideCountInputRef = useRef(null);
  const textareaRef = useRef(null);
  const analyzeAbortRef = useRef(null);

  // ── Data via React Query (cached + deduped across navigations) ────────────
  const {
    data: presentations = [],
    isLoading: presLoading,
    isError: presError,
    refetch: refetchPresentations,
  } = usePresentations({ enabled: !!user?.id });

  const { data: subscription } = useSubscription({ enabled: !!user?.id, refetchInterval: 30_000 });
  const credits = subscription?.credits_remaining ?? null;
  const currentPlan = subscription?.plan ?? 'free';
  const isAdmin = subscription?.is_admin || false;

  const deletePresentation = useDeletePresentation();

  // SSE pushes real-time status changes straight into the query cache.
  useEffect(() => {
    if (!user?.id) return;
    const apiBase = import.meta.env.VITE_API_URL || '';
    const sse = openAuthedEventSource(
      (token) => `${apiBase}/api/presentations/dashboard-events?token=${encodeURIComponent(token)}`,
      {
        onMessage: (e) => {
          let event;
          try { event = JSON.parse(e.data); } catch { return; }

          if (event.type === 'snapshot') {
            queryClient.setQueryData(queryKeys.presentations, event.presentations || []);
          } else if (event.type === 'presentation_updated') {
            queryClient.setQueryData(queryKeys.presentations, (prev = []) => {
              const exists = prev.some(p => p.id === event.presentation.id);
              const next = exists
                ? prev.map(p => p.id === event.presentation.id ? event.presentation : p)
                : [event.presentation, ...prev];
              next.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
              return next;
            });
          }
        },
      }
    );
    return () => sse.close();
  }, [user?.id, queryClient]);

  const allAttachments = [
    ...moodboardFiles.map(f => ({ ...f, category: 'moodboard' })),
    ...brandingFiles.map(f => ({ ...f, category: 'branding' })),
  ];

  function handleCancelAnalyzing() {
    analyzeAbortRef.current?.abort();
    analyzeAbortRef.current = null;
    setAnalyzing(false);
    setFetchingUrls([]);
  }

  async function handleSubmit() {
    if (!input.trim() && allAttachments.length === 0) return;
    capture('prompt_submitted', {
      has_attachments: allAttachments.length > 0,
      aspect_ratio: selectedAspectRatio,
    });
    const controller = new AbortController();
    analyzeAbortRef.current = controller;
    setAnalyzing(true);
    setSubmitError('');
    setSearchQueries([]);

    // Detect URLs in the input and fetch their content to enrich the brief
    const urlRegex = /https?:\/\/[^\s,)>]+/g;
    const detectedUrls = [...new Set(input.match(urlRegex) || [])].slice(0, 3);
    let enrichedMessage = input.trim();

    if (detectedUrls.length > 0) {
      setFetchingUrls(detectedUrls);
      const fetchedContents = await Promise.all(
        detectedUrls.map(url =>
          api.post('/presentations/fetch-url', { url })
            .then(r => ({ url, domain: r.data.domain, content: r.data.content }))
            .catch(() => null)
        )
      );
      setFetchingUrls([]);

      const urlContext = fetchedContents
        .filter(Boolean)
        .map(({ domain, content }) => `\n\n--- Content from ${domain} ---\n${content}\n---`)
        .join('');

      if (urlContext) enrichedMessage += urlContext;
    }

    const attachmentsPayload = allAttachments.map(a => ({ type: a.type, name: a.name, data: a.data, mimeType: a.mimeType, category: a.category }));

    try {
      const apiBase = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('hb_token');
      const res = await fetch(`${apiBase}/api/presentations/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: enrichedMessage, attachments: attachmentsPayload, webSearch: webSearchEnabled }),
        signal: controller.signal,
      });

      // Rate limit / validation / token budget are returned as JSON before the
      // SSE stream begins, so a non-OK response carries a normal error body.
      if (!res.ok) {
        let body = {};
        try { body = await res.json(); } catch {}
        const status = res.status;
        setSubmitError(
          body.error ||
          (status === 429 ? `You're creating presentations too quickly. Please wait ${body.retryAfter ?? 60} seconds.` :
           status === 413 ? 'Your brief or attachments are too large. Try shortening your description or using fewer images.' :
           status === 402 ? 'You\'ve reached your monthly limit. Upgrade your plan to continue.' :
           'Could not analyse your brief. Please try again.')
        );
        return;
      }

      // Read the SSE stream: live `search` events + a final `done` payload.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let analysis = null;
      let streamError = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          let ev;
          try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          if (ev.type === 'search') setSearchQueries(prev => [...prev, ev.query]);
          else if (ev.type === 'done') analysis = ev.analysis;
          else if (ev.type === 'error') streamError = ev.error;
        }
      }

      if (streamError) { setSubmitError(streamError); return; }
      if (analysis) {
        setPendingInput(enrichedMessage);
        setPendingAttachments(attachmentsPayload);
        setAnalysis(analysis);
        setShowQuestionFlow(true);
      } else {
        setSubmitError('Could not analyse your brief. Please try again.');
      }
    } catch (err) {
      if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') return;
      setSubmitError('Could not analyse your brief. Please try again.');
    } finally {
      setAnalyzing(false);
      analyzeAbortRef.current = null;
    }
  }

  async function handleQuestionComplete(answers) {
    setShowQuestionFlow(false);
    setCreatingPresentation(true);
    setSubmitError('');

    const qaSection = answers.length > 0 ? `\n\nPREFLIGHT ANSWERS:\n${answers.map(a => `- ${a.question}: ${a.answer}`).join('\n')}` : '';
    const slideInstruction = adminSlideCount
      ? `You MUST create exactly ${adminSlideCount} slide${adminSlideCount !== 1 ? 's' : ''} — no more, no fewer. This is a hard requirement set by the administrator.`
      : 'Nova should decide the number of slides needed to do this presentation justice.';
    const researchSection = analysis.research_notes?.length > 0
      ? `\n\nRESEARCH NOTES (from web search — use these real facts where relevant):\n${analysis.research_notes.map(n => `- ${n}`).join('\n')}`
      : '';
    const comprehensiveMessage = `${pendingInput}${qaSection}\n\nDetected type: ${analysis.detected_type || ''}\nDetected industry: ${analysis.detected_industry || ''}${researchSection}\n\n${slideInstruction}`;

    try {
      const { data } = await api.post('/presentations', {
        message: comprehensiveMessage,
        attachments: pendingAttachments,
        aspectRatio: selectedAspectRatio,
        style: selectedStyle,
      });
      track('presentation_created', { presentation_id: data.presentation.id, aspect_ratio: selectedAspectRatio, style: selectedStyle });
      capture('presentation_created', { presentation_id: data.presentation.id, aspect_ratio: selectedAspectRatio, style: selectedStyle });
      navigate(`/presentations/${data.presentation.id}`);
    } catch (err) {
      setCreatingPresentation(false);
      if (err.response?.status === 402) {
        setOutOfCreditsDetails(err.response.data || null);
        setShowOutOfCredits(true);
        track('out_of_credits', { page: 'dashboard' });
        capture('out_of_credits', { page: 'dashboard', action_type: 'create_presentation' });
        return;
      }
      const status = err.response?.status;
      setSubmitError(
        err.response?.data?.error ||
        (status === 429 ? `You're generating too many presentations. Please wait ${err.response?.data?.retryAfter ?? 60} seconds before trying again.` :
         status === 503 ? 'The AI service is temporarily unavailable. Please try again in a moment.' :
         'Failed to start your presentation. Please try again.')
      );
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
  }

  function toggleWebSearch() {
    setWebSearchEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('hb_websearch', next ? '1' : '0'); } catch {}
      capture('web_search_toggled', { enabled: next });
      return next;
    });
  }

  function handleDeletePresentation(id) {
    // Optimistically removes from the cache and rolls back on failure.
    deletePresentation.mutate(id);
  }

  const totalAttachments = allAttachments.length;

  function handleTextareaDrop(e) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    setShowZones(true);
    files.forEach(async file => {
      try {
        const { data, mimeType } = await fileToImageAttachment(file);
        setBrandingFiles(prev => [...prev, {
          id: Math.random().toString(36).slice(2),
          name: file.name, type: 'image', mimeType, data,
        }]);
      } catch {}
    });
  }

  return (
    <>
    <AnimatePresence>
      {fetchingUrls.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)' }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Reading your links"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-3xl px-10 py-10 max-w-xs w-full mx-4 text-center shadow-2xl"
            style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)' }}
          >
            <div className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #5B50FF 0%, #8B80FF 100%)' }}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                <Sparkles size={24} className="text-white" />
              </motion.div>
            </div>
            <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>Reading your link</h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{fetchingUrls.map(u => { try { return new URL(u).hostname; } catch { return u; } }).join(', ')}</p>
          </motion.div>
        </motion.div>
      )}
      {analyzing && <AnalyzingOverlay onCancel={handleCancelAnalyzing} webSearch={webSearchEnabled} searchQueries={searchQueries} />}
      {creatingPresentation && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(16px)' }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Starting your presentation"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-3xl px-10 py-10 max-w-xs w-full mx-4 text-center shadow-2xl"
            style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)' }}
          >
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #5B50FF 0%, #8B80FF 100%)' }}
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
              >
                <Sparkles size={26} className="text-white" />
              </motion.div>
            </div>
            <h3 className="font-bold text-xl mb-2" style={{ color: 'var(--text-primary)' }}>ok, building it now…</h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>this usually takes about a minute.</p>
          </motion.div>
        </motion.div>
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
    <AnimatePresence>
      {showQuestionFlow && analysis && (
        <QuestionFlow
          analysis={analysis}
          onComplete={handleQuestionComplete}
          onCancel={() => setShowQuestionFlow(false)}
        />
      )}
    </AnimatePresence>
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
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

      {/* Hero gradient section */}
      <div style={{ background: isDark ? '#0f0f0f' : '#f5f5f5' }}>
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-6"
          >
            <h1 className="font-sans text-3xl sm:text-5xl font-bold leading-tight tracking-tight" style={{ color: 'var(--text-primary)' }}>
              What will you<br />create today?
            </h1>
            <p className="text-sm mt-3" style={{ color: 'var(--text-secondary)' }}>{greeting(user?.name || 'there')} {heroSubtitle}</p>
          </motion.div>

          <ModeSwitcher mode="presentation" onChange={mode => { if (mode === 'design') navigate('/design'); }} isDark={isDark} />

          {/* Composer card */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <div style={{ background: isDark ? '#141414' : '#fff', borderRadius: 16, boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(0,0,0,0.1)', overflow: 'hidden', border: isDark ? '0.5px solid #2a2a2a' : '0.5px solid #e8e8e8' }}>
              <div className="p-5">
                <style>{`.hb-ta::placeholder{color:${isDark ? '#555555' : '#aaaaaa'}}`}</style>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleTextareaDrop}
                  onFocus={e => e.target.style.outline = 'none'}
                  placeholder={PLACEHOLDER_TEXT}
                  aria-label="Presentation brief"
                  rows={4}
                  className="hb-ta w-full resize-none bg-transparent"
                  style={{
                    border: 'none', outline: 'none', fontSize: 15, lineHeight: 1.7,
                    color: isDark ? '#f0f0ee' : '#0d0b1a',
                    fontFamily: 'Inter, sans-serif',
                  }}
                />
              </div>

              <div style={{ padding: '4px 20px 20px', borderTop: isDark ? '0.5px solid #2a2a2a' : '0.5px solid #e8e8e8' }}>
                {/* Controls row */}
                <div className="flex items-center gap-2 py-2 flex-wrap">
                  {/* Style selector — Classic vs Minimalistic image-prompt aesthetic */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: isDark ? '#0f0f0f' : '#f0f0f0', borderRadius: 10, padding: 4, flexShrink: 0 }}>
                    {[
                      { value: 'classic', label: 'Classic' },
                      { value: 'minimalistic', label: 'Minimalistic' },
                    ].map(({ value, label }) => {
                      const active = selectedStyle === value;
                      return (
                        <button
                          key={value}
                          onClick={() => setSelectedStyle(value)}
                          aria-label={`${label} style`}
                          aria-pressed={active}
                          title={value === 'classic'
                            ? 'Bold editorial slides — pure black, hot pink accents, photo collages'
                            : 'Cinematic, restrained slides — one idea per slide, near-monochrome, film-still finish'}
                          style={{
                            padding: '8px 12px', borderRadius: 7, cursor: 'pointer', border: 'none',
                            fontSize: 11, fontWeight: 600, fontFamily: 'Inter,sans-serif',
                            background: active ? (isDark ? '#1e1e1e' : '#fff') : 'transparent',
                            boxShadow: active ? (isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.1)') : 'none',
                            color: active ? '#5B50FF' : (isDark ? '#555' : '#888'),
                            transition: 'background 0.15s',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Web search toggle — when on, Nova researches the brief online */}
                  <button
                    type="button"
                    onClick={toggleWebSearch}
                    role="switch"
                    aria-checked={webSearchEnabled}
                    aria-label="Web search"
                    title="When on, Nova searches the web for sharper data, takes a little longer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
                      padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                      fontSize: 11, fontWeight: 600, fontFamily: 'Inter,sans-serif',
                      border: webSearchEnabled ? '1px solid rgba(91,80,255,0.4)' : (isDark ? '1px solid #2a2a2a' : '1px solid #e8e8e8'),
                      background: webSearchEnabled ? 'rgba(91,80,255,0.12)' : (isDark ? '#0f0f0f' : '#f0f0f0'),
                      color: webSearchEnabled ? '#5B50FF' : (isDark ? '#777' : '#888'),
                      transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                    }}
                  >
                    <Globe size={13} />
                    <span>Web search</span>
                    {/* Track */}
                    <span style={{
                      position: 'relative', width: 26, height: 15, borderRadius: 999,
                      background: webSearchEnabled ? '#5B50FF' : (isDark ? '#2a2a2a' : '#ccc'),
                      transition: 'background 0.18s', flexShrink: 0,
                    }}>
                      <span style={{
                        position: 'absolute', top: 2, left: webSearchEnabled ? 13 : 2,
                        width: 11, height: 11, borderRadius: '50%', background: '#fff',
                        transition: 'left 0.18s',
                      }} />
                    </span>
                  </button>

                  {/* Admin: fixed slide count override */}
                  {isAdmin && (
                    <div className="relative">
                      {showSlideCountInput ? (
                        <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-600 rounded-xl px-2 py-1">
                          <Zap size={12} className="text-amber-500 flex-shrink-0" />
                          <input
                            ref={slideCountInputRef}
                            type="number"
                            aria-label="Number of slides (1–50)"
                            min={1}
                            max={50}
                            value={adminSlideCount ?? ''}
                            onChange={e => {
                              const v = e.target.value;
                              setAdminSlideCount(v === '' ? null : Math.min(50, Math.max(1, parseInt(v) || 1)));
                            }}
                            onBlur={() => setShowSlideCountInput(false)}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setShowSlideCountInput(false); }}
                            placeholder="1–50"
                            className="w-12 text-xs bg-transparent outline-none font-semibold text-amber-700 dark:text-amber-400 placeholder:text-amber-400"
                          />
                          {adminSlideCount && (
                            <button
                              onMouseDown={e => { e.preventDefault(); setAdminSlideCount(null); setShowSlideCountInput(false); }}
                              className="text-amber-400 hover:text-amber-600"
                            >
                              <X size={10} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => { setShowSlideCountInput(true); setTimeout(() => slideCountInputRef.current?.select(), 10); }}
                          className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl border transition-all ${
                            adminSlideCount
                              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-400'
                              : 'border-dashed border-amber-300 dark:border-amber-700 text-amber-500 dark:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                          }`}
                          aria-label="Admin: override slide count"
                        >
                          <Zap size={12} />
                          {adminSlideCount ? `${adminSlideCount} slides` : 'Slides: Auto'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Toggle attach zones — icon-only on mobile */}
                  <button
                    onClick={() => setShowZones(v => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Inter,sans-serif',
                      fontWeight: 500, fontSize: 13, padding: '6px 12px', borderRadius: 8,
                      border: '0.5px solid', cursor: 'pointer', transition: 'all 0.15s',
                      borderColor: (showZones || totalAttachments > 0) ? 'rgba(91,80,255,0.4)' : (isDark ? '#2a2a2a' : '#e0e0e0'),
                      background: (showZones || totalAttachments > 0) ? 'rgba(91,80,255,0.1)' : 'transparent',
                      color: (showZones || totalAttachments > 0) ? '#8B80FF' : (isDark ? '#888' : '#555'),
                    }}
                  >
                    <ImageIcon size={14} />
                    <span style={{ display: 'none' }} className="sm:inline-block">Add references</span>
                    {totalAttachments > 0 && (
                      <span style={{ background: '#5B50FF', color: '#fff', borderRadius: 9999, fontSize: 11, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                        {totalAttachments}
                      </span>
                    )}
                    {showZones ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>

                  {/* Desktop-only: shortcut hint + Create button */}
                  <div className="hidden sm:flex items-center gap-2 ml-auto">
                    <p className="text-xs" style={{ color: isDark ? '#555' : '#aaa' }}>⌘ + Enter</p>
                    <button
                      onClick={handleSubmit}
                      disabled={analyzing || (!input.trim() && allAttachments.length === 0)}
                      className="py-2 px-5 text-sm font-semibold text-white rounded-btn flex items-center gap-2 disabled:opacity-40"
                      style={{ background: '#5B50FF', border: 'none', cursor: 'pointer' }}
                    >
                      <Send size={15} /> Create
                    </button>
                  </div>
                </div>

                {/* Web-search helper caption */}
                {webSearchEnabled && (
                  <p className="text-xs px-1 pb-1 flex items-center gap-1.5" style={{ color: isDark ? '#666' : '#999' }}>
                    <Search size={11} style={{ color: '#5B50FF' }} />
                    Nova searches the web for sharper data, takes a little longer
                  </p>
                )}

                {/* Mobile-only: full-width Create button */}
                <button
                  onClick={handleSubmit}
                  disabled={analyzing || (!input.trim() && allAttachments.length === 0)}
                  className="sm:hidden w-full ios-btn py-3 text-sm justify-center"
                >
                  <Send size={15} /> Create presentation
                </button>
              </div>
              {submitError && (
                <div className="px-5 pb-4">
                  <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-2.5">{submitError}</p>
                </div>
              )}
            </div>

            {/* Attachment category zones */}
            <AnimatePresence>
              {showZones && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  className="grid grid-cols-2 gap-3 overflow-hidden"
                >
                  <AttachZone
                    label="Branding & Pictures"
                    icon={ImageIcon}
                    accentColor="#007AFF"
                    files={brandingFiles}
                    onAdd={f => setBrandingFiles(prev => [...prev, f])}
                    onRemove={id => setBrandingFiles(prev => prev.filter(f => f.id !== id))}
                    isDark={isDark}
                  />
                  <AttachZone
                    label="Moodboard"
                    icon={Palette}
                    accentColor="#5B50FF"
                    files={moodboardFiles}
                    onAdd={f => setMoodboardFiles(prev => [...prev, f])}
                    onRemove={id => setMoodboardFiles(prev => prev.filter(f => f.id !== id))}
                    isDark={isDark}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

        </div>
      </div>

      {/* Recent presentations */}
      <main className="max-w-4xl mx-auto px-4 py-10">
        {(presLoading || presentations.length > 0) && (
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 style={{ fontFamily: 'Inter,sans-serif', fontWeight: 700, color: isDark ? '#f0f0ee' : '#0d0b1a', fontSize: 18 }}>Recents</h2>
            </div>

            {presError && presentations.length === 0 && !presLoading && (
              <div className="text-center py-8 rounded-2xl" style={{ background: 'var(--bg-input)' }}>
                <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>Couldn't load your presentations.</p>
                <button
                  onClick={() => refetchPresentations()}
                  className="text-sm font-semibold transition-opacity hover:opacity-70"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Try again →
                </button>
              </div>
            )}

            {presLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[0, 1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
              </div>
            ) : (
              <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <AnimatePresence>
                  {presentations.map(p => (
                    <PresentationCard key={p.id} pres={p} onDelete={handleDeletePresentation} />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </motion.section>
        )}

        {!presLoading && presentations.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="text-center py-8"
          >
            <div style={{ background: 'rgba(91,80,255,0.1)', border: '0.5px solid rgba(91,80,255,0.2)', borderRadius: 12, width: 64, height: 64, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Bot size={26} style={{ color: '#5B50FF' }} />
              </motion.div>
            </div>
            <p className="font-bold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>Your first deck is one brief away</p>
            <p className="text-sm mb-7 max-w-xs mx-auto leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Describe your presentation above — audience, purpose, tone. Nova handles the rest.
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
              {[
                '5-slide investor pitch for a B2B SaaS at Series A',
                'Competitive analysis comparing us to Notion and Asana',
                'Q2 roadmap presentation for an engineering all-hands',
              ].map(example => (
                <button
                  key={example}
                  onClick={() => { setInput(example); textareaRef.current?.focus(); }}
                  className="text-xs font-medium px-4 py-2.5 rounded-xl border transition-all duration-200 text-left cursor-pointer hover:scale-[1.02] hover:border-uv"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', borderColor: 'var(--border-input)' }}
                >
                  {example}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </main>
    </div>
    <FeedbackButton />
</>
  );
}
