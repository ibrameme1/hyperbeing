import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import {
  Sparkles, Send, LogOut, X, Clock, Trash2, Loader2,
  ImageIcon, Palette, Plus, ChevronDown, ChevronUp, Paperclip, Zap,
  Sun, Moon, CreditCard, User, BarChart2, Bot,
} from 'lucide-react';
import api from '../api/client';
import OutOfCreditsModal from '../components/OutOfCreditsModal';
import { useTheme } from '../contexts/ThemeContext';
import { track } from '../utils/track';
import { capture } from '../utils/posthog';
import Logo from '../components/Logo';

const ANALYZING_MESSAGES = [
  { text: "ok let me read through this real quick…", emoji: "👀" },
  { text: "hm. interesting brief. i like it.", emoji: "🤔" },
  { text: "gonna ask you a few follow-up questions.", emoji: "💬" },
  { text: "promise they won't be generic ahh questions.", emoji: "🙏" },
  { text: "just figuring out what makes YOUR deck unique…", emoji: "✨" },
  { text: "i need like 2 more seconds, bear with me.", emoji: "⏳" },
  { text: "almost there — cooking something good.", emoji: "🍳" },
];

function AnalyzingOverlay({ onCancel }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [blink, setBlink] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % ANALYZING_MESSAGES.length), 2400);
    return () => clearInterval(t);
  }, []);

  // Random eye blink
  useEffect(() => {
    function scheduleBlink() {
      const delay = 2000 + Math.random() * 3000;
      return setTimeout(() => {
        setBlink(true);
        setTimeout(() => { setBlink(false); scheduleBlink(); }, 120);
      }, delay);
    }
    const t = scheduleBlink();
    return () => clearTimeout(t);
  }, []);

  const msg = ANALYZING_MESSAGES[msgIdx];

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

          {/* Robot avatar */}
          <motion.div
            animate={shouldReduceMotion ? {} : { y: [0, -5, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            className="relative mb-6"
          >
            {/* Glow */}
            <div className="absolute inset-0 rounded-2xl blur-xl opacity-20"
                 style={{ background: 'linear-gradient(135deg, #8B5CF6, #00F0FF)' }} />

            {/* Robot face */}
            <div className="relative w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-1.5"
                 style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #06b6d4 100%)' }}>
              {/* Eyes */}
              <div className="flex gap-3">
                {[0, 1].map(i => (
                  <motion.div
                    key={i}
                    className="rounded-full bg-white"
                    style={{
                      width: 10, height: 10,
                      transform: blink ? 'scaleY(0.2)' : 'scaleY(1)',
                      transition: 'transform 0.08s ease',
                      boxShadow: '0 0 8px rgba(255,255,255,0.8)',
                    }}
                  />
                ))}
              </div>
              {/* Mouth — wiggles while thinking */}
              <motion.div
                animate={{ scaleX: [1, 1.15, 0.9, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                className="rounded-full bg-white/80"
                style={{ width: 22, height: 4, borderRadius: 99 }}
              />
              {/* Antenna */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex flex-col items-center">
                <motion.div
                  animate={{ backgroundColor: ['#a78bfa', '#00F0FF', '#a78bfa'] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="w-2.5 h-2.5 rounded-full"
                />
                <div className="w-0.5 h-3 bg-white/40" />
              </div>
            </div>
          </motion.div>

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
                  aria-label={`Remove ${f.name}`}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-gray-800 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  async function handleDelete(e) {
    e.stopPropagation();
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    setConfirmDelete(false);
    try {
      await api.delete(`/presentations/${pres.id}`);
      onDelete(pres.id);
    } catch { setDeleting(false); }
  }

  function handleCancelDelete(e) {
    e.stopPropagation();
    setConfirmDelete(false);
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
      className="bg-white dark:bg-hb-surface rounded-2xl overflow-hidden shadow-ios cursor-pointer group relative focus:outline-none focus-visible:ring-2 focus-visible:ring-hb-primary"
    >
      <div className="aspect-[16/9] overflow-hidden"
           style={{ background: 'linear-gradient(135deg, #8B5CF622 0%, #00F0FF22 100%)' }}>
        {pres.thumbnail ? (
          <img src={pres.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />
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

      {confirmDelete ? (
        <div
          onClick={e => e.stopPropagation()}
          className="absolute top-2 right-2 flex items-center gap-1 bg-white dark:bg-hb-surface rounded-xl p-1.5 shadow-ios-md z-10"
        >
          <button
            onClick={handleDelete}
            className="px-3 py-2 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={handleCancelDelete}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={handleDelete}
          disabled={deleting}
          aria-label={`Delete ${pres.title}`}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity w-9 h-9 rounded-xl bg-white/90 dark:bg-hb-surface shadow-ios flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/30 text-[color:var(--text-muted)] hover:text-red-600 dark:hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      )}
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
        aria-label={`Account menu for ${user?.name || 'your account'}`}
        aria-expanded={open}
        className="relative w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white transition-all duration-200 hover:scale-105"
        style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}
      >
        {/* Credit ring */}
        <svg className="absolute inset-0 w-10 h-10 -rotate-90" viewBox="0 0 40 40">
          <circle
            cx="20" cy="20" r="18" fill="none"
            stroke="rgba(255,255,255,0.15)" strokeWidth="2.5"
            strokeDasharray={low ? '4 3' : undefined}
          />
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

  // User-scoped cache key prevents stale data from a previous user ever being shown
  const presCacheKey = `hb_presentations_${user?.id}`;

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
  const [creatingPresentation, setCreatingPresentation] = useState(false);
  const [adminSlideCount, setAdminSlideCount] = useState(null); // null = let Nova decide
  const [showSlideCountInput, setShowSlideCountInput] = useState(false);
  const slideCountInputRef = useRef(null);
  const textareaRef = useRef(null);
  const analyzeAbortRef = useRef(null);

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
          try { sessionStorage.setItem(presCacheKey, JSON.stringify(list)); } catch {}
        }
        return list;
      })
      .catch(() => []);
  }, [presCacheKey]);

  useEffect(() => {
    if (!user?.id) {
      setPresentations([]);
      setPresLoading(false);
      return;
    }

    setPresLoading(true);

    // Show cached data instantly while the HTTP fetch is in flight
    try {
      const cached = sessionStorage.getItem(presCacheKey);
      if (cached) {
        setPresentations(JSON.parse(cached));
        setPresLoading(false);
      }
    } catch {}

    refreshCredits();
    const creditsInterval = setInterval(refreshCredits, 30_000);

    // Fetch immediately via HTTP — fastest path, no SSE handshake delay
    fetchPresentations().finally(() => setPresLoading(false));

    // SSE for real-time updates only (status changes, new presentations while on page)
    const token = localStorage.getItem('hb_token');
    const apiBase = import.meta.env.VITE_API_URL || '';
    const sse = new EventSource(`${apiBase}/api/presentations/dashboard-events?token=${encodeURIComponent(token)}`);

    sse.onmessage = (e) => {
      let event;
      try { event = JSON.parse(e.data); } catch { return; }

      if (event.type === 'snapshot') {
        const list = event.presentations || [];
        setPresentations(list);
        try { sessionStorage.setItem(presCacheKey, JSON.stringify(list)); } catch {}
        setPresLoading(false);
      } else if (event.type === 'presentation_updated') {
        setPresentations(prev => {
          const exists = prev.some(p => p.id === event.presentation.id);
          const next = exists
            ? prev.map(p => p.id === event.presentation.id ? event.presentation : p)
            : [event.presentation, ...prev];
          next.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
          try { sessionStorage.setItem(presCacheKey, JSON.stringify(next)); } catch {}
          return next;
        });
      }
    };

    sse.onerror = () => {};

    return () => {
      clearInterval(creditsInterval);
      sse.close();
    };
  }, [user?.id, fetchPresentations]);

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
      }, { signal: controller.signal });
      setPendingInput(enrichedMessage);
      setPendingAttachments(allAttachments.map(a => ({ type: a.type, name: a.name, data: a.data, mimeType: a.mimeType, category: a.category })));
      setAnalysis(data);
      setShowQuestionFlow(true);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
      const status = err.response?.status;
      setSubmitError(
        err.response?.data?.error ||
        (status === 429 ? `You're creating presentations too quickly. Please wait ${err.response?.data?.retryAfter ?? 60} seconds.` :
         status === 413 ? 'Your brief or attachments are too large. Try shortening your description or using fewer images.' :
         'Could not analyse your brief. Please try again.')
      );
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
    const comprehensiveMessage = `${pendingInput}${qaSection}\n\nDetected type: ${analysis.detected_type || ''}\nDetected industry: ${analysis.detected_industry || ''}\n\n${slideInstruction}`;

    try {
      const { data } = await api.post('/presentations', {
        message: comprehensiveMessage,
        attachments: pendingAttachments,
        aspectRatio: selectedAspectRatio,
      });
      track('presentation_created', { presentation_id: data.presentation.id, aspect_ratio: selectedAspectRatio });
      navigate(`/presentations/${data.presentation.id}`);
    } catch (err) {
      setCreatingPresentation(false);
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
      try { sessionStorage.setItem(presCacheKey, JSON.stringify(next)); } catch {}
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
      reader.onload = ev => setBrandingFiles(prev => [...prev, {
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
            role="dialog"
            aria-modal="true"
            aria-label="Reading your links"
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
      {analyzing && <AnalyzingOverlay onCancel={handleCancelAnalyzing} />}
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
            className="rounded-3xl px-10 py-10 max-w-xs w-full mx-4 text-center shadow-2xl bg-white dark:bg-hb-surface"
          >
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
              >
                <Sparkles size={26} className="text-white" />
              </motion.div>
            </div>
            <h3 className="font-bold text-xl text-gray-900 dark:text-white mb-2">ok, building it now…</h3>
            <p className="text-sm text-gray-500 dark:text-zinc-400">this usually takes about a minute.</p>
          </motion.div>
        </motion.div>
      )}
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
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
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
            <h1 className="font-sans text-5xl font-bold leading-tight tracking-tight" style={{ color: 'var(--text-primary)' }}>
              What will you<br />create today?
            </h1>
            <p className="text-sm mt-3" style={{ color: 'var(--text-secondary)' }}>{greeting(user?.name || 'there')} — {heroSubtitle}</p>
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
                  {[
                    { ratio: '16:9', label: '16:9 widescreen' },
                    { ratio: '4:3', label: '4:3 standard' },
                    { ratio: '1:1', label: '1:1 square' },
                    { ratio: '9:16', label: '9:16 vertical' },
                  ].map(({ ratio, label }) => (
                    <button
                      key={ratio}
                      onClick={() => setSelectedAspectRatio(ratio)}
                      aria-label={label}
                      aria-pressed={selectedAspectRatio === ratio}
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

                {/* Admin: fixed slide count override */}
                {isAdmin && (
                  <div className="relative">
                    {showSlideCountInput ? (
                      <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-600 rounded-xl px-2 py-1">
                        <Zap size={12} className="text-amber-500 flex-shrink-0" />
                        <input
                          ref={slideCountInputRef}
                          type="number"
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
                    accentColor="#8B5CF6"
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
              <h2 className="font-sans font-bold text-gray-900 dark:text-white text-xl">Recents</h2>
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
          <div className="text-center py-10">
            <div className="w-14 h-14 rounded-3xl mx-auto mb-4 flex items-center justify-center"
                 style={{ background: 'var(--bg-input)' }}>
              <Bot size={24} style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Your first deck is one brief away</p>
            <p className="text-sm mb-6 max-w-xs mx-auto" style={{ color: 'var(--text-muted)' }}>
              Describe your presentation above — audience, purpose, tone. Nova handles the rest.
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
              {[
                '5-slide investor pitch for a B2B SaaS at Series A',
                'Competitive analysis comparing us to Notion and Asana',
                'Q2 roadmap presentation for an engineering all-hands',
              ].map(example => (
                <button
                  key={example}
                  onClick={() => { setInput(example); textareaRef.current?.focus(); }}
                  className="text-xs font-medium px-3 py-2 rounded-xl border transition-all duration-150 text-left hover:opacity-80"
                  style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', borderColor: 'var(--border-input)' }}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
    </>
  );
}
