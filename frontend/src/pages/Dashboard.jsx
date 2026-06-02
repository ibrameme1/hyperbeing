import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import {
  Sparkles, Send, LogOut, X, Clock, Trash2, Loader2,
  ImageIcon, Palette, Plus, ChevronDown, ChevronUp, Paperclip, Zap,
  Sun, Moon, CreditCard, User, BarChart2,
} from 'lucide-react';
import api from '../api/client';
import OutOfCreditsModal from '../components/OutOfCreditsModal';
import { useTheme } from '../contexts/ThemeContext';
import { track } from '../utils/track';
import { capture } from '../utils/posthog';
import Logo from '../components/Logo';

const ANALYZING_MESSAGES = [
  'Reading your brief…',
  'Identifying key themes…',
  'Understanding your audience…',
  'Crafting the right questions…',
  'Almost there…',
];

function AnalyzingOverlay() {
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % ANALYZING_MESSAGES.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)' }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-3xl px-10 py-10 max-w-xs w-full mx-4 text-center shadow-2xl bg-white dark:bg-hb-surface"
      >
        <div
          className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          >
            <Sparkles size={26} className="text-white" />
          </motion.div>
        </div>
        <h3 className="font-bold text-xl text-gray-900 dark:text-white mb-2">Analysing your brief</h3>
        <AnimatePresence mode="wait">
          <motion.p
            key={msgIdx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="text-sm text-gray-500 dark:text-zinc-400 min-h-[20px]"
          >
            {ANALYZING_MESSAGES[msgIdx]}
          </motion.p>
        </AnimatePresence>
        <div className="flex justify-center gap-1.5 mt-5">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              className="w-2 h-2 rounded-full"
              style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
import { useAuth } from '../contexts/AuthContext';
import QuestionFlow from '../components/QuestionFlow';


function greeting(name) {
  const h = new Date().getHours();
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `Good ${time}, ${name.split(' ')[0]}`;
}

const VIBE_SUBTITLES = {
  'dark-editorial': 'Ready to make something that looks like a magazine cover?',
  'clean-minimal': 'Clean, sharp, minimal — just how you like it.',
  'bold-punchy': 'Time to make something that gets a reaction.',
  'colorful': 'Let\'s make something that brings the energy.',
};
const PRIORITY_SUBTITLES = {
  speed: 'Nova\'s warmed up and ready to move fast.',
  quality: 'Nova\'s in full art-director mode today.',
  storytelling: 'Let\'s build a narrative that lands.',
  automation: 'Describe it. Nova handles the rest.',
};

// ─── Attachment Drop Zone ──────────────────────────────────────────────────
function AttachZone({ label, icon: Icon, accentColor, files, onAdd, onRemove }) {
  const onDrop = useCallback(accepted => {
    accepted.forEach(file => {
      const reader = new FileReader();
      reader.onload = e => onAdd({
        id: Math.random().toString(36).slice(2),
        name: file.name,
        type: 'image',
        mimeType: file.type,
        data: e.target.result,
      });
      reader.readAsDataURL(file);
    });
  }, [onAdd]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
  });

  return (
    <div className="bg-white dark:bg-hb-surface rounded-2xl overflow-hidden shadow-ios">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-ios-gray5 dark:border-hb-border">
        <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
             style={{ background: accentColor + '22' }}>
          <Icon size={14} style={{ color: accentColor }} />
        </div>
        <span className="font-semibold text-gray-900 dark:text-white text-sm">{label}</span>
        <span className="text-xs text-ios-gray2 dark:text-zinc-500 ml-auto">{files.length} image{files.length !== 1 ? 's' : ''}</span>
      </div>

      <div
        {...getRootProps()}
        className={`min-h-[90px] p-3 cursor-pointer transition-all duration-200 ${
          isDragActive ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-inset ring-ios-blue' : 'hover:bg-ios-gray6 dark:hover:bg-hb-surface-2'
        }`}
      >
        <input {...getInputProps()} />

        {files.length === 0 ? (
          <div className="h-[66px] flex flex-col items-center justify-center text-ios-gray2 dark:text-zinc-500">
            <p className="text-xs font-medium">{isDragActive ? 'Drop here' : 'Drop images or click to browse'}</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {files.map(f => (
              <div key={f.id} className="relative group">
                <img src={f.data} alt={f.name}
                     className="h-14 w-14 rounded-xl object-cover border border-ios-gray5 dark:border-hb-border" />
                <button
                  onClick={e => { e.stopPropagation(); onRemove(f.id); }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <div className="h-14 w-14 rounded-xl border-2 border-dashed border-ios-gray4 dark:border-hb-border flex items-center justify-center hover:border-ios-blue transition-colors">
              <Plus size={16} className="text-ios-gray2 dark:text-zinc-500" />
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

  async function handleDelete(e) {
    e.stopPropagation();
    setDeleting(true);
    try {
      await api.delete(`/presentations/${pres.id}`);
      onDelete(pres.id);
    } catch { setDeleting(false); }
  }

  const statusColors = {
    chat: 'bg-blue-100 text-blue-600',
    ready: 'bg-purple-100 text-purple-600',
    generating: 'bg-orange-100 text-orange-600',
    completed: 'bg-green-100 text-green-600',
  };
  const statusLabels = { chat: 'Draft', ready: 'Ready', generating: 'Generating…', completed: 'Complete' };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(`/presentations/${pres.id}`)}
      className="bg-white dark:bg-hb-surface rounded-2xl overflow-hidden shadow-ios cursor-pointer group relative"
    >
      <div className="aspect-[16/9] overflow-hidden"
           style={{ background: 'linear-gradient(135deg, #8B5CF622 0%, #00F0FF22 100%)' }}>
        {pres.thumbnail ? (
          <img src={pres.thumbnail} alt={pres.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Sparkles className="w-7 h-7 text-ios-indigo opacity-40" />
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{pres.title}</h3>
            <p className="text-xs text-ios-gray1 dark:text-zinc-400 mt-0.5 flex items-center gap-1">
              <Clock size={11} />
              {new Date(pres.updated_at).toLocaleDateString()}
            </p>
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg flex-shrink-0 ${statusColors[pres.status] || 'bg-gray-100 text-gray-600'}`}>
            {statusLabels[pres.status] || pres.status}
          </span>
        </div>
      </div>

      <button
        onClick={handleDelete}
        disabled={deleting}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-xl bg-white/90 dark:bg-hb-surface shadow-ios flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-600 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400"
      >
        {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>
    </motion.div>
  );
}

// ─── Account menu ──────────────────────────────────────────────────────────
function AccountMenu({ user, credits, currentPlan, isAdmin, onLogout, onUpgrade }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const planMax = currentPlan === 'basic' ? 100 : currentPlan === 'pro' ? 500 : currentPlan === 'ultra' ? 2000 : 5;
  const pct = isAdmin ? 100 : planMax > 0 ? Math.min(100, Math.round((credits / planMax) * 100)) : 0;
  const low = !isAdmin && credits !== null && credits < 10;

  const ringColor = isAdmin ? '#8B5CF6'
    : pct <= 20 ? '#f87171'
    : pct <= 50 ? '#f59e0b'
    : '#22c55e';
  const circumference = 2 * Math.PI * 16;
  const dash = circumference * (pct / 100);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white transition-all duration-200 hover:scale-105"
        style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}
        title="Account"
      >
        {/* Credit ring */}
        <svg className="absolute inset-0 w-10 h-10 -rotate-90" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" />
          <circle
            cx="20" cy="20" r="18" fill="none"
            stroke={ringColor} strokeWidth="2.5"
            strokeDasharray={`${circumference * (pct / 100)} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <span className="relative z-10 text-xs font-bold">{initials}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 mt-2 w-72 rounded-2xl overflow-hidden shadow-2xl z-50"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            {/* User info */}
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
                     style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}>
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{user?.name}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
                </div>
                {isAdmin && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-lg text-white flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}>Admin</span>
                )}
              </div>

              {/* Credits bar */}
              {!isAdmin && credits !== null && (
                <div className="rounded-xl p-3" style={{ background: 'var(--bg-input)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Credits remaining</span>
                    <span className="text-xs font-bold" style={{ color: low ? '#f87171' : '#8B5CF6' }}>
                      {isAdmin ? '∞' : (credits * 10).toLocaleString()} / {isAdmin ? '∞' : (planMax * 10).toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: low
                          ? 'linear-gradient(90deg, #f87171 0%, #fca5a5 100%)'
                          : 'linear-gradient(90deg, #8B5CF6 0%, #00F0FF 100%)',
                      }}
                    />
                  </div>
                  {low && (
                    <p className="text-xs mt-1.5" style={{ color: '#f87171' }}>Running low — upgrade to keep creating</p>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>
                      {currentPlan} plan
                    </span>
                    <button
                      onClick={() => { onUpgrade(); setOpen(false); }}
                      className="text-xs font-semibold transition-colors hover:opacity-80"
                      style={{ color: '#8B5CF6' }}
                    >
                      {currentPlan === 'free' ? 'Upgrade →' : 'Manage plan →'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="h-px" style={{ background: 'var(--border)' }} />

            {/* Actions */}
            <div className="p-2">
              {isAdmin && (
                <button
                  onClick={() => { window.location.href = '/analytics'; setOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors hover:opacity-80 text-left"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <BarChart2 size={15} style={{ color: '#06b6d4' }} />
                  Analytics
                </button>
              )}
              <button
                onClick={() => { window.location.href = '/profile'; setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors hover:opacity-80 text-left"
                style={{ color: 'var(--text-secondary)' }}
              >
                <User size={15} style={{ color: '#00F0FF' }} />
                View profile
              </button>
              <button
                onClick={() => { onUpgrade(); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors hover:opacity-80 text-left"
                style={{ color: 'var(--text-secondary)' }}
              >
                <CreditCard size={15} style={{ color: '#8B5CF6' }} />
                {currentPlan === 'free' ? 'Upgrade plan' : 'Billing & plans'}
              </button>
              <button
                onClick={() => { onLogout(); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors hover:opacity-80 text-left"
                style={{ color: 'var(--text-secondary)' }}
              >
                <LogOut size={15} style={{ color: '#f87171' }} />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout } = useAuth();
  const { isDark, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [input, setInput] = useState('');

  const prefs = (() => { try { return JSON.parse(localStorage.getItem('hb_prefs') || 'null'); } catch { return null; } })();
  const heroSubtitle = prefs
    ? (VIBE_SUBTITLES[prefs.design_vibe] || PRIORITY_SUBTITLES[prefs.priority] || 'What will you create today?')
    : 'What will you create today?';
  const [moodboardFiles, setMoodboardFiles] = useState([]);
  const [brandingFiles, setBrandingFiles] = useState([]);
  const [showZones, setShowZones] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [presentations, setPresentations] = useState([]);
  const [presLoading, setPresLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [fetchingUrls, setFetchingUrls] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [showQuestionFlow, setShowQuestionFlow] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [pendingInput, setPendingInput] = useState('');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState('16:9');
  const [credits, setCredits] = useState(null);
  const [currentPlan, setCurrentPlan] = useState('free');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showOutOfCredits, setShowOutOfCredits] = useState(false);
  const textareaRef = useRef(null);

  function refreshCredits() {
    api.get('/billing/subscription')
      .then(r => {
        setCredits(r.data.subscription.credits_remaining);
        setCurrentPlan(r.data.subscription.plan);
        setIsAdmin(r.data.subscription.is_admin || false);
      })
      .catch(() => {});
  }

  const fetchPresentations = useCallback((updateCache = true) => {
    return api.get('/presentations')
      .then(r => {
        const list = r.data.presentations || [];
        setPresentations(list);
        if (updateCache) {
          try { sessionStorage.setItem('hb_presentations', JSON.stringify(list)); } catch {}
        }
        return list;
      })
      .catch(() => []);
  }, []);

  useEffect(() => {
    // Show cached data instantly while fetching fresh in background
    try {
      const cached = sessionStorage.getItem('hb_presentations');
      if (cached) {
        setPresentations(JSON.parse(cached));
        setPresLoading(false);
      }
    } catch {}

    refreshCredits();
    const creditsInterval = setInterval(refreshCredits, 30_000);

    // Poll for live status while any presentation is generating
    let statusInterval = null;
    function scheduleStatusPoll(list) {
      clearInterval(statusInterval);
      const hasGenerating = (list || []).some(p => p.status === 'generating' || p.status === 'processing');
      if (hasGenerating) {
        statusInterval = setInterval(() => {
          fetchPresentations().then(updated => {
            const stillGenerating = updated.some(p => p.status === 'generating' || p.status === 'processing');
            if (!stillGenerating) clearInterval(statusInterval);
          });
        }, 4000);
      }
    }

    // Initial fetch — sets loading state and kicks off polling if needed
    fetchPresentations()
      .then(scheduleStatusPoll)
      .finally(() => setPresLoading(false));

    return () => {
      clearInterval(creditsInterval);
      clearInterval(statusInterval);
    };
  }, []);

  const allAttachments = [
    ...moodboardFiles.map(f => ({ ...f, category: 'moodboard' })),
    ...brandingFiles.map(f => ({ ...f, category: 'branding' })),
  ];

  async function handleSubmit() {
    if (!input.trim() && allAttachments.length === 0) return;
    capture('prompt_submitted', {
      has_attachments: allAttachments.length > 0,
      aspect_ratio: selectedAspectRatio,
    });
    setAnalyzing(true);
    setSubmitError('');

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

    try {
      const { data } = await api.post('/presentations/analyze', {
        message: enrichedMessage,
        attachments: allAttachments.map(a => ({ type: a.type, name: a.name, data: a.data, mimeType: a.mimeType, category: a.category })),
      });
      setPendingInput(enrichedMessage);
      setPendingAttachments(allAttachments.map(a => ({ type: a.type, name: a.name, data: a.data, mimeType: a.mimeType, category: a.category })));
      setAnalysis(data);
      setShowQuestionFlow(true);
    } catch (err) {
      const status = err.response?.status;
      setSubmitError(
        err.response?.data?.error ||
        (status === 429 ? `You're creating presentations too quickly. Please wait ${err.response?.data?.retryAfter ?? 60} seconds.` :
         status === 413 ? 'Your brief or attachments are too large. Try shortening your description or using fewer images.' :
         'Could not analyse your brief. Please try again.')
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleQuestionComplete(answers) {
    setShowQuestionFlow(false);
    setSubmitError('');

    const qaSection = answers.length > 0 ? `\n\nPREFLIGHT ANSWERS:\n${answers.map(a => `- ${a.question}: ${a.answer}`).join('\n')}` : '';
    const comprehensiveMessage = `${pendingInput}${qaSection}\n\nDetected type: ${analysis.detected_type || ''}\nDetected industry: ${analysis.detected_industry || ''}\n\nNova should decide the number of slides needed to do this presentation justice.`;

    try {
      const { data } = await api.post('/presentations', {
        message: comprehensiveMessage,
        attachments: pendingAttachments,
        aspectRatio: selectedAspectRatio,
      });
      track('presentation_created', { presentation_id: data.presentation.id, aspect_ratio: selectedAspectRatio });
      navigate(`/presentations/${data.presentation.id}`);
    } catch (err) {
      if (err.response?.status === 402) {
        setShowOutOfCredits(true);
        track('out_of_credits', { page: 'dashboard' });
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

  function handleDeletePresentation(id) {
    setPresentations(prev => {
      const next = prev.filter(p => p.id !== id);
      try { sessionStorage.setItem('hb_presentations', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const totalAttachments = allAttachments.length;

  function handleTextareaDrop(e) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    setShowZones(true);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setMoodboardFiles(prev => [...prev, {
        id: Math.random().toString(36).slice(2),
        name: file.name, type: 'image', mimeType: file.type, data: ev.target.result,
      }]);
      reader.readAsDataURL(file);
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
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-3xl px-10 py-10 max-w-xs w-full mx-4 text-center shadow-2xl bg-white dark:bg-hb-surface"
          >
            <div className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                <Sparkles size={24} className="text-white" />
              </motion.div>
            </div>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1">Reading your link</h3>
            <p className="text-sm text-gray-500 dark:text-zinc-400">{fetchingUrls.map(u => { try { return new URL(u).hostname; } catch { return u; } }).join(', ')}</p>
          </motion.div>
        </motion.div>
      )}
      {analyzing && <AnalyzingOverlay />}
    </AnimatePresence>
    <AnimatePresence>
      {showOutOfCredits && (
        <OutOfCreditsModal
          currentPlan={currentPlan}
          onClose={() => setShowOutOfCredits(false)}
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
      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-3"
           style={{ background: 'var(--bg-nav)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center">
          <Logo dark={isDark} height={40} />
        </div>
        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 hover:opacity-70"
            style={{ background: 'var(--bg-input)' }}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark
              ? <Sun size={15} className="text-yellow-400" />
              : <Moon size={15} className="text-hb-primary" />}
          </button>
          <AccountMenu
            user={user}
            credits={credits}
            currentPlan={currentPlan}
            isAdmin={isAdmin}
            onLogout={logout}
            onUpgrade={() => navigate('/pricing')}
          />
        </div>
      </nav>

      {/* Hero gradient section */}
      <div style={{ background: 'var(--bg-hero)' }}>
        <div className="max-w-3xl mx-auto px-4 pt-12 pb-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-8"
          >
            <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: '#8B5CF6' }}>
              {greeting(user?.name || 'there')}
            </p>
            <h1 className="text-5xl font-bold leading-tight tracking-tight"
                style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              What will you<br />create today?
            </h1>
            <p className="text-sm mt-3" style={{ color: 'var(--text-secondary)' }}>{heroSubtitle}</p>
          </motion.div>

          {/* Composer card */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="bg-white dark:bg-hb-surface rounded-3xl shadow-ios-xl overflow-hidden">
              <div className="p-5">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleTextareaDrop}
                  placeholder="Describe your presentation — paste your brief, add your content, mention your audience and tone… (drag images here to attach)"
                  rows={4}
                  className="w-full resize-none border-none outline-none text-gray-800 dark:text-zinc-100 placeholder:text-ios-gray2 dark:placeholder:text-zinc-500 text-base bg-transparent leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-2 px-5 pb-5 pt-1 border-t border-ios-gray5 dark:border-hb-border">
                {/* Aspect ratio selector */}
                <div className="flex items-center gap-1 bg-ios-gray5 dark:bg-hb-surface-2 rounded-xl p-1">
                  {['16:9', '4:3', '1:1', '9:16'].map(ratio => (
                    <button
                      key={ratio}
                      onClick={() => setSelectedAspectRatio(ratio)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-150 ${
                        selectedAspectRatio === ratio
                          ? 'bg-white dark:bg-hb-dark text-gray-900 dark:text-white shadow-sm'
                          : 'text-ios-gray1 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-white'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>

                {/* Toggle attach zones */}
                <button
                  onClick={() => setShowZones(v => !v)}
                  className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl transition-colors ${
                    showZones || totalAttachments > 0
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                      : 'text-ios-gray1 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-ios-gray5 dark:hover:bg-hb-surface-2'
                  }`}
                >
                  <ImageIcon size={15} />
                  Add references
                  {totalAttachments > 0 && (
                    <span className="bg-purple-600 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center font-bold">
                      {totalAttachments}
                    </span>
                  )}
                  {showZones ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                <div className="ml-auto flex items-center gap-2">
                  <p className="text-xs text-ios-gray2 dark:text-zinc-500 hidden sm:block">⌘ + Enter</p>
                  <button
                    onClick={handleSubmit}
                    disabled={analyzing || (!input.trim() && allAttachments.length === 0)}
                    className="ios-btn py-2 px-5 text-sm"
                  >
                    <Send size={15} /> Create
                  </button>
                </div>
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
                  />
                  <AttachZone
                    label="Moodboard"
                    icon={Palette}
                    accentColor="#764ba2"
                    files={moodboardFiles}
                    onAdd={f => setMoodboardFiles(prev => [...prev, f])}
                    onRemove={id => setMoodboardFiles(prev => prev.filter(f => f.id !== id))}
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
              <h2 className="font-bold text-gray-900 dark:text-white text-xl">Recents</h2>
            </div>

            {presLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="bg-white dark:bg-hb-surface rounded-2xl overflow-hidden shadow-ios">
                    <div className="aspect-[16/9] skeleton" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 rounded-lg skeleton w-3/4" />
                      <div className="h-3 rounded-lg skeleton w-1/2" />
                    </div>
                  </div>
                ))}
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
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-3xl mx-auto mb-4 flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #8B5CF622 0%, #00F0FF22 100%)' }}>
              <Sparkles size={28} className="text-ios-indigo opacity-60" />
            </div>
            <p className="text-gray-500 dark:text-zinc-400 text-sm">Your presentations will appear here.</p>
          </div>
        )}
      </main>
    </div>
    </>
  );
}
