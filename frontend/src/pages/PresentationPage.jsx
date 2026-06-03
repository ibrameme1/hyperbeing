import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import {
  Send, Paperclip, ArrowLeft, Sparkles, X, Wand2, Loader2, FileImage, AlertTriangle
} from 'lucide-react';
import api from '../api/client';
import MessageBubble from '../components/MessageBubble';
import LoadingScreen from '../components/LoadingScreen';
import PlanRevealScreen from '../components/PlanRevealScreen';
import PresentationViewer from '../components/PresentationViewer';
import { track } from '../utils/track';
import { capture } from '../utils/posthog';

// ─── Chat Phase ────────────────────────────────────────────────────────────
function ChatPhase({ presentation, messages, onNewMessage, onGenerate }) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendingLabel, setSendingLabel] = useState('Thinking…');
  const [sendError, setSendError] = useState('');
  const [streamingContent, setStreamingContent] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const onDrop = useCallback(acceptedFiles => {
    acceptedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        setAttachments(prev => [...prev, {
          id: Math.random().toString(36).slice(2),
          name: file.name,
          type: file.type.startsWith('image/') ? 'image' : 'file',
          mimeType: file.type,
          data: e.target.result,
        }]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    accept: { 'image/*': [] },
  });

  async function handleSend() {
    if (!input.trim() && attachments.length === 0) return;
    setSending(true);
    setSendError('');
    setSendingLabel('Thinking…');
    track('chat_message_sent', { presentation_id: presentation.id, has_attachments: attachments.length > 0 });
    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      attachments: [...attachments],
    };

    onNewMessage(userMsg);
    setInput('');
    setAttachments([]);
    setStreamingContent('');

    const labelTimer = setTimeout(() => setSendingLabel('Building your slide plan…'), 8000);

    try {
      const token = localStorage.getItem('hb_token');
      const apiBase = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBase}/api/presentations/${presentation.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: userMsg.content,
          attachments: userMsg.attachments.map(a => ({
            type: a.type, name: a.name, data: a.data, mimeType: a.mimeType,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const status = response.status;
        setSendError(
          errorData.error ||
          (status === 429 ? 'You\'re sending messages too quickly. Please wait a moment.' :
           status === 402 ? 'You\'ve reached your monthly token limit. Please upgrade your plan.' :
           status === 503 ? 'Nova is temporarily unavailable. Please try again in a few seconds.' :
           'Message failed to send. Please try again.')
        );
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let streamText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });

        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === 'chunk') {
            streamText += event.text;
            setStreamingContent(streamText);
          } else if (event.type === 'done') {
            setStreamingContent(null);
            onNewMessage(event.aiMessage);
            if (event.aiMessage.metadata?.state === 'ready') {
              const { data: presData } = await api.get(`/presentations/${presentation.id}`);
              onGenerate(presData.presentation);
            }
          } else if (event.type === 'error') {
            setSendError(event.error || 'Message failed to send. Please try again.');
          }
        }
      }
    } catch (err) {
      console.error('Send failed:', err);
      const status = err.response?.status;
      setSendError(
        err.response?.data?.error ||
        (status === 429 ? 'You\'re sending messages too quickly. Please wait a moment.' :
         status === 402 ? 'You\'ve reached your monthly token limit. Please upgrade your plan.' :
         status === 503 ? 'Nova is temporarily unavailable. Please try again in a few seconds.' :
         'Message failed to send. Please try again.')
      );
    } finally {
      clearTimeout(labelTimer);
      setSending(false);
      setStreamingContent(null);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend();
  }

  const isReady = messages.some(m => m.metadata?.state === 'ready') || presentation.status === 'ready';

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-page)' }}>
      {/* Top bar */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-ios-gray5"
           style={{ background: 'var(--bg-nav)', backdropFilter: 'blur(20px)' }}>
        <button onClick={() => window.history.back()} className="text-ios-blue flex items-center gap-1 text-sm font-medium">
          <ArrowLeft size={16} />
          Back
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{presentation.title}</p>
          <p className="text-xs text-ios-gray1">
            {isReady ? '✓ Ready to generate' : 'Gathering details…'}
          </p>
        </div>
        {isReady && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => onGenerate(presentation)}
            className="ios-btn py-2 px-4 text-sm"
          >
            <Wand2 size={15} />
            Generate
          </motion.button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((msg, i) => (
          <MessageBubble key={msg.id || i} message={msg} />
        ))}

        {streamingContent !== null && (
          <MessageBubble message={{ role: 'assistant', content: streamingContent || '…', streaming: true }} />
        )}

        {sending && streamingContent === null && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-2xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}>
              <Sparkles size={14} className="text-white" />
            </div>
            <div className="bubble-ai flex items-center gap-2 text-ios-gray1">
              <Loader2 size={14} className="animate-spin" />
              <span>{sendingLabel}</span>
            </div>
          </div>
        )}

        {sendError && (
          <div className="flex justify-center">
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-2xl px-4 py-2.5 max-w-sm text-center">{sendError}</p>
          </div>
        )}

        {isReady && !sending && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center"
          >
            <button
              onClick={() => onGenerate(presentation)}
              className="ios-btn py-3 px-8 text-base shadow-ios-lg"
              style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}
            >
              <Wand2 size={18} />
              Generate Presentation
            </button>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-ios-gray5 p-4"
           style={{ background: 'var(--bg-nav)', backdropFilter: 'blur(20px)' }}>
        <div
          {...getRootProps()}
          className={`rounded-3xl shadow-ios transition-all duration-200 ${
            isDragActive ? 'ring-2 ring-ios-blue' : ''
          }`}
          style={{ background: 'var(--bg-card)' }}
        >
          <input {...getInputProps()} />

          <AnimatePresence>
            {attachments.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 pt-3 flex gap-2 flex-wrap"
              >
                {attachments.map(att => (
                  <div key={att.id} className="relative group">
                    <img
                      src={att.data}
                      alt={att.name}
                      className="h-12 w-12 rounded-xl object-cover border border-ios-gray5"
                    />
                    <button
                      onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-gray-800 text-white rounded-full flex items-center justify-center text-[9px]"
                    >
                      <X size={8} />
                    </button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-end gap-2 p-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isDragActive ? 'Drop images here…' : 'Reply to Nova…'}
              rows={2}
              className="flex-1 resize-none border-none outline-none placeholder:text-ios-gray2 dark:placeholder:text-zinc-500 text-sm bg-transparent leading-relaxed"
              style={{ color: 'var(--text-primary)' }}
            />
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={open}
                className="w-8 h-8 rounded-xl bg-ios-gray5 flex items-center justify-center hover:bg-ios-gray4 transition-colors"
              >
                <Paperclip size={15} className="text-ios-gray1" />
              </button>
              <button
                onClick={handleSend}
                disabled={sending || (!input.trim() && attachments.length === 0)}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-95 disabled:opacity-40"
                style={{ background: '#007AFF' }}
              >
                <Send size={14} className="text-white" />
              </button>
            </div>
          </div>
        </div>
        <p className="text-center text-[11px] text-ios-gray2 mt-2">⌘ + Enter to send</p>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function PresentationPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [presentation, setPresentation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [phase, setPhase] = useState('loading'); // loading | chat | generating | viewing

  const [generatedSlides, setGeneratedSlides] = useState([]);
  const [totalSlides, setTotalSlides] = useState(0);
  const [generationStage, setGenerationStage] = useState(0);
  const [slidePlan, setSlidePlan] = useState([]);

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
          stopPolling();
          // Merge: DB slides fill in any gaps; _edited slides in frontend state win
          setGeneratedSlides(prev => {
            const dbSlides = data.presentation.slides_data;
            const frontendByIndex = new Map(prev.map(s => [s.index, s]));
            const merged = dbSlides.map(dbSlide => {
              const fe = frontendByIndex.get(dbSlide.index);
              // Preserve frontend state if the slide is already complete or was edited
              if (fe && (fe._edited || fe.status === 'complete')) return fe;
              return dbSlide;
            });
            return merged.sort((a, b) => a.index - b.index);
          });
          setTotalSlides(data.presentation.slides_data.length);
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
      setMessages(data.messages.map(m => ({
        ...m,
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
        metadata: m.metadata || {},
      })));

      if (data.presentation.status === 'completed' && data.presentation.slides_data) {
        setGeneratedSlides(data.presentation.slides_data);
        setPhase('viewing');
        startSSE(id); // stay subscribed for slide_updated events
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
        setPhase('chat');
      }
    }).catch(() => navigate('/dashboard'));
  }, [id]);

  const startSSE = useCallback((presId) => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    const token = localStorage.getItem('hb_token');
    const apiBase = import.meta.env.VITE_API_URL || '';
    const sse = new EventSource(`${apiBase}/api/presentations/${presId}/events?token=${encodeURIComponent(token)}`);
    sseRef.current = sse;

    let stageTimer = 0;

    sse.onmessage = (e) => {
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

    sse.onerror = () => {
      // Don't close — EventSource auto-reconnects, and the catch-up replay
      // on reconnect will re-send any completed slides we missed.
    };

    return () => {
      clearInterval(stageTimer);
      sse.close();
    };
  }, []);

  useEffect(() => {
    return () => { sseRef.current?.close(); stopPolling(); };
  }, []);

  async function handleGenerate(updatedPres) {
    setPresentation(updatedPres);
    setPhase('generating');
    setGenerationStage(0);
    setGeneratedSlides([]);
    setSlidePlan([]);

    try {
      await api.post(`/presentations/${id}/generate`);
      startSSE(id);
    } catch (err) {
      console.error('Generate failed:', err);
      setPhase('chat');
    }
  }

  function handleNewMessage(msg) {
    setMessages(prev => {
      const exists = prev.some(m => m.id === msg.id);
      return exists ? prev : [...prev, msg];
    });
  }

  if (phase === 'loading' || !presentation) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'var(--bg-page)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center animate-pulse"
               style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}>
            <Sparkles size={24} className="text-white" />
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (phase === 'generating') {
    return (
      <div
        className="h-screen flex flex-col items-center justify-center relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}
      >
        {/* Ambient glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/3 w-96 h-96 rounded-full opacity-20 animate-float"
               style={{ background: 'radial-gradient(circle, #7b61ff 0%, transparent 70%)' }} />
          <div className="absolute bottom-1/3 right-1/3 w-80 h-80 rounded-full opacity-15 animate-float"
               style={{ background: 'radial-gradient(circle, #00b4ff 0%, transparent 70%)', animationDelay: '2s' }} />
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-5 z-10"
        >
          <div className="relative">
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-0 rounded-3xl blur-xl"
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
            />
            <div className="relative w-16 h-16 rounded-3xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <Sparkles size={28} className="text-white" />
            </div>
          </div>
          <p className="text-white/70 text-base font-semibold">Nova is planning your presentation…</p>
        </motion.div>
      </div>
    );
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
      <PresentationViewer
        slides={generatedSlides}
        presentationId={id}
        title={presentation.title}
        onBack={() => {
          sseRef.current?.close();
          navigate('/dashboard');
        }}
        onSlidesUpdate={setGeneratedSlides}
        onTitleChange={(t) => setPresentation(p => ({ ...p, title: t }))}
      />
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

  return (
    <ChatPhase
      presentation={presentation}
      messages={messages}
      onNewMessage={handleNewMessage}
      onGenerate={handleGenerate}
    />
  );
}
