import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import api from '../api/client';
import PlanRevealScreen from '../components/PlanRevealScreen';
import NovaMascot from '../components/NovaMascot';
import PresentationViewer from '../components/PresentationViewer';
import { SkeletonPresentationViewer } from '../components/Skeleton';
import { capture } from '../utils/posthog';
import { openAuthedEventSource } from '../utils/sse';

// ─── Generating messages ───────────────────────────────────────────────────
const GENERATING_MESSAGES = [
  'Reading the brief one more time…',
  'Laying out the narrative structure…',
  'Writing the content for each slide…',
  'Generating custom visuals…',
  'Dialing in the typography…',
  'Aligning every element…',
  'Almost there — final touches…',
  'Your audience will thank you for this…',
  'Professional quality in progress…',
  'Almost presentation-ready…',
];

// ─── Generating screen ─────────────────────────────────────────────────────
function GeneratingScreen() {
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % GENERATING_MESSAGES.length), 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0A0A0B 0%, #0f0c29 50%, #1a0a2e 100%)' }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 rounded-full opacity-20 animate-float"
             style={{ background: 'radial-gradient(circle, #8B5CF6 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/3 right-1/3 w-80 h-80 rounded-full opacity-15 animate-float"
             style={{ background: 'radial-gradient(circle, #00C4D4 0%, transparent 70%)', animationDelay: '2s' }} />
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-6 z-10 px-6 text-center"
      >
        <NovaMascot size={120} />
        <div className="flex flex-col items-center gap-2">
          <p className="text-white font-bold text-lg">Nova is crafting your presentation</p>
          <AnimatePresence mode="wait">
            <motion.p
              key={msgIdx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="text-white/65 text-sm min-h-[20px]"
            >
              {GENERATING_MESSAGES[msgIdx]}
            </motion.p>
          </AnimatePresence>
        </div>
        <div className="flex gap-1.5 mt-1">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              animate={{ scale: [1, 1.4, 1], opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.22 }}
              className="w-2 h-2 rounded-full bg-white/60"
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function PresentationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state: routerState } = useLocation();

  // Use partial data passed from dashboard for instant render (skips loading spinner)
  const initPres = routerState?.presentation;
  const initIsCompleted = initPres?.status === 'completed';

  const [presentation, setPresentation] = useState(initPres || null);
  const [phase, setPhase] = useState(initIsCompleted ? 'viewing' : 'loading');
  const [loadError, setLoadError] = useState(false);
  const [loadRetry, setLoadRetry] = useState(0);
  const [sseError, setSseError] = useState('');

  // For completed presentations opened from dashboard, show skeleton wireframes immediately.
  // Use status:'complete' with null image_data so SlideRenderer shows a pulse skeleton
  // without triggering the "Generating slide…" overlay.
  // First slide uses the thumbnail from the dashboard card (already cached) for instant recognition.
  const [generatedSlides, setGeneratedSlides] = useState(() => {
    if (!initIsCompleted) return [];
    return Array.from({ length: 8 }, (_, i) => ({
      index: i,
      type: 'content',
      title: '',
      status: 'loading',
      image_data: i === 0 ? (initPres?.thumbnail || null) : null,
    }));
  });
  const [totalSlides, setTotalSlides] = useState(0);
  const [generationStage, setGenerationStage] = useState(0);
  const [slidePlan, setSlidePlan] = useState([]);
  const [currentPlan, setCurrentPlan] = useState('free');

  useEffect(() => {
    api.get('/billing/subscription')
      .then(r => setCurrentPlan(r.data.subscription.plan))
      .catch(() => {});
  }, []);

  const sseRef = useRef(null);
  const pollRef = useRef(null);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function startPolling(presId) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/presentations/${presId}`);
        if (data.presentation.status === 'completed' && data.presentation.slides_data) {
          const dbSlides = data.presentation.slides_data;
          // Stop polling only when all slides are done (supports add-slides mid-session)
          const allDone = dbSlides.every(s => s.status === 'complete' || s.status === 'error');
          if (allDone) stopPolling();
          // Merge: DB slides fill in any gaps; _edited / complete slides in frontend state win
          setGeneratedSlides(prev => {
            const frontendByIndex = new Map(prev.map(s => [s.index, s]));
            const merged = dbSlides.map(dbSlide => {
              const fe = frontendByIndex.get(dbSlide.index);
              // Preserve frontend state if the slide is already complete or was edited
              if (fe && (fe._edited || fe.status === 'complete')) return fe;
              return dbSlide;
            });
            return merged.sort((a, b) => a.index - b.index);
          });
          setTotalSlides(dbSlides.length);
          // Don't interrupt plan_reveal — let its onDone() handle the transition
          setPhase(p => p === 'plan_reveal' ? p : 'viewing');
        } else if (data.presentation.status === 'generating' && data.presentation.slides_data) {
          const partial = data.presentation.slides_data;
          setGeneratedSlides(prev => {
            const merged = [...prev];
            for (const s of partial) {
              const existingIdx = merged.findIndex(x => x.index === s.index);
              if (existingIdx === -1) merged.push(s);
              else if (merged[existingIdx].status !== 'complete') merged[existingIdx] = s;
            }
            return merged.sort((a, b) => a.index - b.index);
          });
          if (data.presentation.slide_plan?.slides?.length > 0) {
            setPhase(p => p === 'plan_reveal' ? p : 'viewing');
          }
          if (data.presentation.slide_plan?.slides?.length) {
            setTotalSlides(data.presentation.slide_plan.slides.length);
          }
        }
      } catch {}
    }, 5000);
  }

  // Load presentation
  useEffect(() => {
    api.get(`/presentations/${id}`).then(({ data }) => {
      setPresentation(data.presentation);

      if (data.presentation.status === 'completed' && data.presentation.slides_data) {
        setGeneratedSlides(data.presentation.slides_data);
        setPhase('viewing');
        startSSE(id); // stay subscribed for slide_updated / slide_ready events
        // If add-slides is still running (some slides are still generating), poll until they complete
        if (data.presentation.slides_data.some(s => s.status === 'generating')) startPolling(id);
      } else if (data.presentation.status === 'generating' || data.presentation.status === 'processing') {
        const planSlides = data.presentation.slide_plan?.slides || [];
        const completedSlides = data.presentation.slides_data || [];
        if (planSlides.length > 0) {
          // Plan already exists — skip straight to viewer with loading overlays for unfinished slides
          const completedByIndex = new Map(completedSlides.map(s => [s.index, s]));
          const merged = planSlides.map(slide =>
            completedByIndex.get(slide.index) ?? { ...slide, status: 'generating', image_data: null }
          );
          setGeneratedSlides(merged.sort((a, b) => a.index - b.index));
          setTotalSlides(planSlides.length);
          setPhase('viewing');
        } else {
          // Plan not yet ready — show planning loader and wait for SSE plan_started
          if (completedSlides.length > 0) setGeneratedSlides(completedSlides);
          if (data.presentation.slide_plan?.total_slides) {
            setTotalSlides(data.presentation.slide_plan.total_slides);
          }
          setPhase('generating');
        }
        startSSE(id);
        startPolling(id);
      } else if (data.presentation.status === 'error') {
        const errorSlides = data.presentation.slides_data || [];
        if (errorSlides.length > 0) {
          setGeneratedSlides(errorSlides);
          setTotalSlides(errorSlides.length);
          setPhase('viewing');
        } else {
          setPhase('error');
        }
        startSSE(id);
      } else {
        // Legacy statuses from the removed chat flow ('chat'/'ready') have no
        // slides to show — treat them like a failed generation.
        setPhase('error');
      }
    }).catch(() => setLoadError(true));
  }, [id, loadRetry]);

  const startSSE = useCallback((presId) => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    const apiBase = import.meta.env.VITE_API_URL || '';
    let stageTimer = 0;

    const onMessage = (e) => {
      const event = JSON.parse(e.data);

      if (event.type === 'plan_generating') {
        setPhase(p => (p === 'viewing' || p === 'plan_reveal') ? p : 'generating');
        startPolling(presId);
      }

      if (event.type === 'plan_started') {
        // Header parsed — we know how many slides to expect; switch to plan_reveal immediately
        const count = event.total_slides || 0;
        if (count > 0) {
          setTotalSlides(count);
          // Only initialise placeholders if nothing has arrived yet — slide_ready events or
          // plan_slide_streamed may have already populated generatedSlides (synthetic-header path)
          setGeneratedSlides(prev => {
            if (prev.length > 0) return prev;
            return Array.from({ length: count }, (_, i) => ({
              index: i, type: 'content', title: `Slide ${i + 1}`,
              status: 'generating', image_data: null,
            }));
          });
          // Never clear slidePlan here — it may already be fully built from plan_slide_streamed
          setPhase(p => (p === 'viewing' || p === 'plan_reveal') ? p : 'plan_reveal');
        }
      }

      if (event.type === 'plan_slide_streamed') {
        // Each slide's title/type arrives as Claude streams it — build the reveal list
        setSlidePlan(prev => {
          if (prev.some(s => s.index === event.slide.index)) return prev;
          return [...prev, event.slide].sort((a, b) => a.index - b.index);
        });
        // Update title/type on an existing placeholder but never ADD a new entry here —
        // slides are initialised all-at-once by plan_started / plan_ready / onDone()
        // so the viewer never shows them arriving one-by-one.
        setGeneratedSlides(prev =>
          prev.some(s => s.index === event.slide.index)
            ? prev.map(s => s.index === event.slide.index
                ? { ...s, type: event.slide.type, title: event.slide.title }
                : s)
            : prev
        );
        // Fallback: switch to plan_reveal if plan_started was somehow missed
        setPhase(p => (p === 'viewing' || p === 'plan_reveal') ? p : 'plan_reveal');
      }

      if (event.type === 'plan_ready') {
        // Fired after ALL slides are streamed — used for catch-up replay on reconnect
        const plans = event.slide_plans || [];
        const count = event.total_slides || plans.length;
        if (count > 0 && plans.length > 0) {
          setTotalSlides(count);
          setGeneratedSlides(prev => {
            const placeholders = Array.from({ length: count }, (_, i) => {
              const plan = plans[i];
              return {
                index: i,
                type: plan?.type || 'content',
                title: plan?.title || `Slide ${i + 1}`,
                status: 'generating',
                image_data: null,
              };
            });
            const merged = [...placeholders];
            for (const s of prev) {
              if (s.status === 'complete' && s.index < count) merged[s.index] = s;
            }
            return merged;
          });
          setSlidePlan(plans);
          setPhase(p => (p === 'viewing' || p === 'plan_reveal') ? p : 'plan_reveal');
        }
      }

      if (event.type === 'chat_needed') {
        // Nova wants more info — reload messages and show chat UI
        api.get(`/presentations/${id}`).then(({ data }) => {
          setPresentation(data.presentation);
          setMessages(data.messages.map(m => ({
            ...m,
            attachments: Array.isArray(m.attachments) ? m.attachments : [],
            metadata: m.metadata || {},
          })));
          setPhase('chat');
        });
      }

      if (event.type === 'started') {
        setTotalSlides(event.total_slides);
        stageTimer = setInterval(() => {
          setGenerationStage(s => Math.min(s + 1, 4));
        }, 4000);
      }

      if (event.type === 'slide_generating') {
        setGenerationStage(4);
      }

      if (event.type === 'slide_ready') {
        setGeneratedSlides(prev => {
          const next = prev.map(s => s.index === event.slide.index ? event.slide : s);
          if (!prev.some(s => s.index === event.slide.index)) next.push(event.slide);
          return next.sort((a, b) => a.index - b.index);
        });
        setGenerationStage(5);
        capture('slide_generated', {
          presentation_id: presId,
          slide_index: event.slide.index,
          slide_type: event.slide.type,
        });
      }

      if (event.type === 'slide_error') {
        setGeneratedSlides(prev =>
          prev.map(s => s.index === event.index ? { ...s, status: 'error' } : s)
        );
        capture('slide_generation_failed', {
          presentation_id: presId,
          slide_index: event.index,
          error_message: event.message || 'slide_error event received',
        });
      }

      if (event.type === 'slides_adding') {
        setGeneratedSlides(prev => [...prev, ...(event.placeholders || [])].sort((a, b) => a.index - b.index));
      }

      if (event.type === 'slide_locked') {
        setGeneratedSlides(prev => {
          const next = prev.map(s => s.index === event.slide.index ? event.slide : s);
          if (!prev.some(s => s.index === event.slide.index)) next.push(event.slide);
          return next.sort((a, b) => a.index - b.index);
        });
      }

      if (event.type === 'slides_trimmed') {
        const keep = new Set(event.keep_indices || []);
        setGeneratedSlides(prev => prev.filter(s => s.status !== 'generating' || keep.has(s.index)));
      }

      if (event.type === 'partial_generation') {
        setSseError(
          `${event.slides_generated} slide${event.slides_generated === 1 ? '' : 's'} generated, ` +
          `${event.slides_locked} locked — you need ${event.credits_needed} more credits to unlock ` +
          `${event.slides_locked === 1 ? 'it' : 'them'}.`
        );
      }

      if (event.type === 'slides_unlocked') {
        setGeneratedSlides(prev =>
          prev.map(s => event.slide_indexes.includes(s.index) ? { ...s, status: 'complete' } : s)
        );
      }

      if (event.type === 'slide_updated') {
        setGeneratedSlides(prev =>
          prev.map(s => s.index === event.slide.index ? event.slide : s)
        );
      }

      if (event.type === 'title_updated') {
        setPresentation(p => p ? { ...p, title: event.title } : p);
      }

      if (event.type === 'complete') {
        clearInterval(stageTimer);
        stopPolling();
        // Mark any slides still in 'generating' state as error (they never got slide_ready)
        setGeneratedSlides(prev => prev.map(s => s.status === 'generating' ? { ...s, status: 'error' } : s));
        // Don't interrupt plan_reveal — its onDone() will transition to 'viewing'
        setPhase(p => p === 'plan_reveal' ? p : 'viewing');
      }

      if (event.type === 'error') {
        clearInterval(stageTimer);
        stopPolling();
        console.error('Generation error:', event.message);
        capture('slide_generation_failed', {
          presentation_id: presId,
          error_message: event.message || 'generation_error event received',
        });
        // If we have some slides already, stay in the viewer — otherwise show error screen
        setGeneratedSlides(prev => {
          if (prev.length > 0) return prev.map(s => s.status === 'generating' ? { ...s, status: 'error' } : s);
          setPhase('error');
          return prev;
        });
      }
    };

    // On transient disconnects EventSource auto-reconnects and the catch-up replay
    // re-sends missed slides; on hard auth failures the helper revalidates the
    // session (refresh or clean logout) and reconnects with a fresh token.
    const sse = openAuthedEventSource(
      (token) => `${apiBase}/api/presentations/${presId}/events?token=${encodeURIComponent(token)}`,
      {
        onMessage,
        onOpen: () => setSseError(''),
        onTransientError: () => setSseError('Live updates disconnected. Refresh to reconnect.'),
      }
    );
    sseRef.current = sse;

    return () => {
      clearInterval(stageTimer);
      sse.close();
    };
  }, []);

  useEffect(() => {
    return () => { sseRef.current?.close(); stopPolling(); };
  }, []);

  if (loadError) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'var(--bg-page)', fontFamily: 'Inter, sans-serif' }}>
        <div
          className="flex flex-col items-center gap-5 rounded-2xl p-8 text-center"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', maxWidth: 360 }}
        >
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)' }}>
            <AlertTriangle size={24} style={{ color: '#ef4444' }} />
          </div>
          <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Couldn't load this presentation.</p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              Go to dashboard
            </button>
            <button
              onClick={() => { setLoadError(false); setPhase('loading'); setLoadRetry(r => r + 1); }}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'loading' || !presentation) {
    return <SkeletonPresentationViewer />;
  }

  if (phase === 'generating') {
    return <GeneratingScreen />;
  }

  if (phase === 'plan_reveal') {
    return (
      <PlanRevealScreen
        totalSlides={totalSlides}
        slidePlans={slidePlan}
        onDone={() => {
          // Ensure ALL N slots exist in the viewer before switching — existing entries
          // (including any already-completed slide_ready slides) are preserved; gaps are
          // filled as 'generating' placeholders from slidePlan metadata.
          setGeneratedSlides(prev => {
            const targetCount = totalSlides || slidePlan.length;
            if (!targetCount) return prev;
            const byIndex = new Map(prev.map(s => [s.index, s]));
            const planByIndex = new Map(slidePlan.map(s => [s.index, s]));
            return Array.from({ length: targetCount }, (_, i) => {
              if (byIndex.has(i)) return byIndex.get(i);
              const plan = planByIndex.get(i);
              return {
                index: i,
                type: plan?.type || 'content',
                title: plan?.title || `Slide ${i + 1}`,
                status: 'generating',
                image_data: null,
              };
            });
          });
          setPhase('viewing');
        }}
      />
    );
  }

  if (phase === 'viewing') {
    return (
      <>
        {sseError && (
          <div
            className="flex items-center justify-between px-4 py-2.5 text-sm"
            style={{
              background: 'rgba(239,68,68,0.08)',
              borderBottom: '1px solid rgba(239,68,68,0.2)',
              color: '#ef4444',
              fontFamily: 'Inter, sans-serif',
              fontSize: 13,
            }}
          >
            <span>{sseError}</span>
            <button
              onClick={() => setSseError('')}
              style={{ color: '#888', cursor: 'pointer', background: 'none', border: 'none', fontSize: 16, lineHeight: 1, padding: '0 2px', marginLeft: 8 }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
        <PresentationViewer
          slides={generatedSlides}
          presentationId={id}
          title={presentation.title}
          currentPlan={currentPlan}
          deckStyle={presentation.style || 'classic'}
          onBack={() => {
            sseRef.current?.close();
            navigate('/dashboard');
          }}
          onSlidesUpdate={setGeneratedSlides}
          onTitleChange={(t) => setPresentation(p => ({ ...p, title: t }))}
        />
      </>
    );
  }

  if (phase === 'error') {
    return (
      <div
        className="h-screen flex flex-col items-center justify-center gap-6"
        style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}
      >
        <div className="w-14 h-14 rounded-2xl bg-red-500/20 flex items-center justify-center">
          <AlertTriangle size={28} className="text-red-400" />
        </div>
        <div className="text-center">
          <h2 className="text-white text-xl font-bold mb-2">Generation Failed</h2>
          <p className="text-white/50 text-sm max-w-xs">
            Something went wrong while creating your presentation. Please go back and try again.
          </p>
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-gray-900 font-semibold text-sm hover:bg-gray-100 transition-colors active:scale-95"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>
      </div>
    );
  }

  // Every reachable status maps to a phase above; nothing left to render.
  return null;
}
