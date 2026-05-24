import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import {
  Sparkles, Send, LogOut, X, Clock, Trash2, Loader2,
  ImageIcon, Palette, Plus, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import QuestionFlow from '../components/QuestionFlow';

const CREATING_MESSAGES = [
  'Nova is reading your answers…',
  'Mapping the perfect slide structure…',
  'Crafting the narrative flow…',
  'Writing detailed slide prompts…',
  'Selecting themes and colour palette…',
  'Preparing Nano Banana for your visuals…',
  'Almost there — finalising your plan…',
];

function CreatingScreen() {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setMsgIndex(i => (i + 1) % CREATING_MESSAGES.length), 2800);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}
    >
      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 rounded-full opacity-20 animate-float"
             style={{ background: 'radial-gradient(circle, #7b61ff 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/3 right-1/3 w-80 h-80 rounded-full opacity-15 animate-float"
             style={{ background: 'radial-gradient(circle, #00b4ff 0%, transparent 70%)', animationDelay: '2s' }} />
      </div>

      <div className="flex flex-col items-center gap-6 z-10 px-6 text-center">
        {/* Pulsing logo */}
        <div className="relative">
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 rounded-3xl blur-xl"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          />
          <div className="relative w-20 h-20 rounded-3xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <Sparkles size={36} className="text-white" />
          </div>
        </div>

        <p className="text-white/60 text-sm font-semibold uppercase tracking-widest">
          Building your presentation
        </p>

        <div className="h-8 flex items-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={msgIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="text-white text-xl font-semibold"
            >
              {CREATING_MESSAGES[msgIndex]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Indeterminate progress bar */}
        <div className="w-72 h-1.5 rounded-full overflow-hidden"
             style={{ background: 'rgba(255,255,255,0.12)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)' }}
            animate={{ width: ['10%', '70%', '10%'] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </motion.div>
  );
}

function greeting(name) {
  const h = new Date().getHours();
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `Good ${time}, ${name.split(' ')[0]}`;
}

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
    <div className="bg-white rounded-2xl overflow-hidden shadow-ios">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-ios-gray5">
        <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
             style={{ background: accentColor + '22' }}>
          <Icon size={14} style={{ color: accentColor }} />
        </div>
        <span className="font-semibold text-gray-900 text-sm">{label}</span>
        <span className="text-xs text-ios-gray2 ml-auto">{files.length} image{files.length !== 1 ? 's' : ''}</span>
      </div>

      <div
        {...getRootProps()}
        className={`min-h-[90px] p-3 cursor-pointer transition-all duration-200 ${
          isDragActive ? 'bg-blue-50 ring-2 ring-inset ring-ios-blue' : 'hover:bg-ios-gray6'
        }`}
      >
        <input {...getInputProps()} />

        {files.length === 0 ? (
          <div className="h-[66px] flex flex-col items-center justify-center text-ios-gray2">
            <p className="text-xs font-medium">{isDragActive ? 'Drop here' : 'Drop images or click to browse'}</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {files.map(f => (
              <div key={f.id} className="relative group">
                <img src={f.data} alt={f.name}
                     className="h-14 w-14 rounded-xl object-cover border border-ios-gray5" />
                <button
                  onClick={e => { e.stopPropagation(); onRemove(f.id); }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <div className="h-14 w-14 rounded-xl border-2 border-dashed border-ios-gray4 flex items-center justify-center hover:border-ios-blue transition-colors">
              <Plus size={16} className="text-ios-gray2" />
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
      className="bg-white rounded-2xl overflow-hidden shadow-ios cursor-pointer group relative"
    >
      <div className="aspect-[16/9] flex items-center justify-center"
           style={{ background: 'linear-gradient(135deg, #667eea22 0%, #764ba222 100%)' }}>
        <Sparkles className="w-7 h-7 text-ios-indigo opacity-40" />
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 text-sm truncate">{pres.title}</h3>
            <p className="text-xs text-ios-gray1 mt-0.5 flex items-center gap-1">
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
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-xl bg-white/90 shadow-ios flex items-center justify-center hover:bg-red-50 hover:text-red-500"
      >
        {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>
    </motion.div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [moodboardFiles, setMoodboardFiles] = useState([]);
  const [brandingFiles, setBrandingFiles] = useState([]);
  const [showZones, setShowZones] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [presentations, setPresentations] = useState([]);
  const [presLoading, setPresLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [showQuestionFlow, setShowQuestionFlow] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [pendingInput, setPendingInput] = useState('');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState('16:9');
  const textareaRef = useRef(null);

  useEffect(() => {
    api.get('/presentations')
      .then(r => setPresentations(r.data.presentations || []))
      .finally(() => setPresLoading(false));
  }, []);

  const allAttachments = [
    ...moodboardFiles.map(f => ({ ...f, category: 'moodboard' })),
    ...brandingFiles.map(f => ({ ...f, category: 'branding' })),
  ];

  async function handleSubmit() {
    if (!input.trim() && allAttachments.length === 0) return;
    setAnalyzing(true);
    setSubmitError('');
    try {
      const { data } = await api.post('/presentations/analyze', {
        message: input.trim(),
        attachments: allAttachments.map(a => ({ type: a.type, name: a.name, data: a.data, mimeType: a.mimeType, category: a.category })),
      });
      setPendingInput(input.trim());
      setPendingAttachments(allAttachments.map(a => ({ type: a.type, name: a.name, data: a.data, mimeType: a.mimeType, category: a.category })));
      setAnalysis(data);
      setShowQuestionFlow(true);
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.error || err.message || 'Something went wrong';
      setSubmitError(msg);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleQuestionComplete(answers, suggestedSlideCount) {
    setShowQuestionFlow(false);
    setLoading(true);
    setSubmitError('');

    // Build comprehensive message with all pre-flight answers
    const qaSection = answers.map(a => `- ${a.question}: ${a.answer}`).join('\n');
    const comprehensiveMessage = `${pendingInput}\n\nPREFLIGHT ANSWERS:\n${qaSection}\n\nDetected type: ${analysis.detected_type || ''}\nDetected industry: ${analysis.detected_industry || ''}\nSuggested slides: ${suggestedSlideCount || analysis.suggested_slide_count || 8}\n\nPlease generate the full presentation now.`;

    try {
      const { data } = await api.post('/presentations', {
        message: comprehensiveMessage,
        attachments: pendingAttachments,
        aspectRatio: selectedAspectRatio,
      });
      navigate(`/presentations/${data.presentation.id}`);
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.error || err.message || 'Something went wrong';
      setSubmitError(msg);
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
  }

  function handleDeletePresentation(id) {
    setPresentations(prev => prev.filter(p => p.id !== id));
  }

  const totalAttachments = allAttachments.length;

  return (
    <>
    <AnimatePresence>
      {showQuestionFlow && analysis && (
        <QuestionFlow
          analysis={analysis}
          onComplete={handleQuestionComplete}
          onCancel={() => { setShowQuestionFlow(false); setLoading(false); }}
        />
      )}
    </AnimatePresence>
    <AnimatePresence>
      {loading && <CreatingScreen />}
    </AnimatePresence>
    <div className="min-h-screen" style={{ background: '#F2F2F7' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-3"
           style={{ background: 'rgba(242,242,247,0.85)', backdropFilter: 'blur(20px)' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <Sparkles size={16} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg tracking-tight">HyperBeing</span>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-ios-gray1 hover:text-gray-900 transition-colors text-sm font-medium"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </nav>

      {/* Hero gradient section */}
      <div style={{ background: 'linear-gradient(160deg, #ece9ff 0%, #e8f0ff 40%, #fce8f4 100%)' }}>
        <div className="max-w-3xl mx-auto px-4 pt-12 pb-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-8"
          >
            <p className="text-xs font-semibold tracking-widest text-purple-500 uppercase mb-2">
              {greeting(user?.name || 'there')}
            </p>
            <h1 className="text-5xl font-bold leading-tight tracking-tight"
                style={{ background: 'linear-gradient(135deg, #5b4fcf 0%, #9333ea 50%, #ec4899 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              What will you<br />create today?
            </h1>
          </motion.div>

          {/* Composer card */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="bg-white rounded-3xl shadow-ios-xl overflow-hidden">
              <div className="p-5">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe your presentation — paste your brief, add your content, mention your audience and tone…"
                  rows={4}
                  className="w-full resize-none border-none outline-none text-gray-800 placeholder:text-ios-gray2 text-base bg-transparent leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-2 px-5 pb-5 pt-1 border-t border-ios-gray5">
                {/* Aspect ratio selector */}
                <div className="flex items-center gap-1 bg-ios-gray5 rounded-xl p-1">
                  {['16:9', '4:3', '1:1', '9:16'].map(ratio => (
                    <button
                      key={ratio}
                      onClick={() => setSelectedAspectRatio(ratio)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-150 ${
                        selectedAspectRatio === ratio
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-ios-gray1 hover:text-gray-700'
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
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-ios-gray1 hover:text-gray-900 hover:bg-ios-gray5'
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
                  <p className="text-xs text-ios-gray2 hidden sm:block">⌘ + Enter</p>
                  <button
                    onClick={handleSubmit}
                    disabled={analyzing || loading || (!input.trim() && allAttachments.length === 0)}
                    className="ios-btn py-2 px-5 text-sm"
                  >
                    {analyzing ? (
                      <><Loader2 size={15} className="animate-spin" /> Analyzing…</>
                    ) : loading ? (
                      <><Loader2 size={15} className="animate-spin" /> Creating…</>
                    ) : (
                      <><Send size={15} /> Create</>
                    )}
                  </button>
                </div>
              </div>
              {submitError && (
                <div className="px-5 pb-4">
                  <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{submitError}</p>
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
                    label="Moodboard"
                    icon={Palette}
                    accentColor="#764ba2"
                    files={moodboardFiles}
                    onAdd={f => setMoodboardFiles(prev => [...prev, f])}
                    onRemove={id => setMoodboardFiles(prev => prev.filter(f => f.id !== id))}
                  />
                  <AttachZone
                    label="Branding & Pictures"
                    icon={ImageIcon}
                    accentColor="#007AFF"
                    files={brandingFiles}
                    onAdd={f => setBrandingFiles(prev => [...prev, f])}
                    onRemove={id => setBrandingFiles(prev => prev.filter(f => f.id !== id))}
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
              <h2 className="font-bold text-gray-900 text-xl">Recents</h2>
            </div>

            {presLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-ios">
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
                 style={{ background: 'linear-gradient(135deg, #667eea22 0%, #764ba222 100%)' }}>
              <Sparkles size={28} className="text-ios-indigo opacity-60" />
            </div>
            <p className="text-gray-500 text-sm">Your presentations will appear here.</p>
          </div>
        )}
      </main>
    </div>
    </>
  );
}
