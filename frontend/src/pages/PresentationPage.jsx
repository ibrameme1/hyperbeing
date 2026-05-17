import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import {
  Send, Paperclip, ArrowLeft, Sparkles, X, Wand2, Loader2, FileImage
} from 'lucide-react';
import api from '../api/client';
import MessageBubble from '../components/MessageBubble';
import LoadingScreen from '../components/LoadingScreen';
import PresentationViewer from '../components/PresentationViewer';

// ─── Chat Phase ────────────────────────────────────────────────────────────
function ChatPhase({ presentation, messages, onNewMessage, onGenerate }) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendingLabel, setSendingLabel] = useState('Thinking…');
  const [sendError, setSendError] = useState('');
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      attachments: [...attachments],
    };

    onNewMessage(userMsg);
    setInput('');
    setAttachments([]);

    // Show a more descriptive label after 8s in case Claude is building the slide plan
    const labelTimer = setTimeout(() => setSendingLabel('Building your slide plan…'), 8000);

    try {
      const { data } = await api.post(`/presentations/${presentation.id}/messages`, {
        message: userMsg.content,
        attachments: userMsg.attachments.map(a => ({
          type: a.type, name: a.name, data: a.data, mimeType: a.mimeType,
        })),
      });
      onNewMessage(data.aiMessage);

      if (data.aiMessage.metadata?.state === 'ready') {
        const presResp = await api.get(`/presentations/${presentation.id}`);
        onGenerate(presResp.data.presentation);
      }
    } catch (err) {
      console.error('Send failed:', err);
      const msg = err.response?.data?.detail || err.response?.data?.error || err.message || 'Something went wrong — please try again';
      setSendError(msg);
    } finally {
      clearTimeout(labelTimer);
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend();
  }

  const isReady = messages.some(m => m.metadata?.state === 'ready') || presentation.status === 'ready';

  return (
    <div className="h-screen flex flex-col" style={{ background: '#F2F2F7' }}>
      {/* Top bar */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-ios-gray5"
           style={{ background: 'rgba(242,242,247,0.9)', backdropFilter: 'blur(20px)' }}>
        <button onClick={() => window.history.back()} className="text-ios-blue flex items-center gap-1 text-sm font-medium">
          <ArrowLeft size={16} />
          Back
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{presentation.title}</p>
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

        {sending && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-2xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
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
            <p className="text-sm text-red-500 bg-red-50 rounded-2xl px-4 py-2.5 max-w-sm text-center">{sendError}</p>
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
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
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
           style={{ background: 'rgba(242,242,247,0.95)', backdropFilter: 'blur(20px)' }}>
        <div
          {...getRootProps()}
          className={`bg-white rounded-3xl shadow-ios transition-all duration-200 ${
            isDragActive ? 'ring-2 ring-ios-blue' : ''
          }`}
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
              className="flex-1 resize-none border-none outline-none text-gray-800 placeholder:text-ios-gray2 text-sm bg-transparent leading-relaxed"
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

  const sseRef = useRef(null);

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
      } else if (data.presentation.status === 'generating') {
        setPhase('generating');
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
    const sse = new EventSource(`/api/presentations/${presId}/events?token=${encodeURIComponent(token)}`);
    sseRef.current = sse;

    let stageTimer = 0;

    sse.onmessage = (e) => {
      const event = JSON.parse(e.data);

      if (event.type === 'started') {
        setTotalSlides(event.total_slides);
        setGenerationStage(2);
        stageTimer = setInterval(() => {
          setGenerationStage(s => Math.min(s + 1, 4));
        }, 4000);
      }

      if (event.type === 'slide_generating') {
        setGenerationStage(4);
      }

      if (event.type === 'slide_ready') {
        setGeneratedSlides(prev => [...prev, event.slide]);
        setGenerationStage(5);
      }

      if (event.type === 'slide_updated') {
        setGeneratedSlides(prev =>
          prev.map(s => s.index === event.slide.index ? event.slide : s)
        );
      }

      if (event.type === 'complete') {
        clearInterval(stageTimer);
        // Keep SSE open for slide_updated events during viewing
        setTimeout(() => setPhase('viewing'), 800);
      }

      if (event.type === 'error') {
        clearInterval(stageTimer);
        console.error('Generation error:', event.message);
      }
    };

    sse.onerror = () => {
      clearInterval(stageTimer);
      sse.close();
    };

    return () => {
      clearInterval(stageTimer);
      sse.close();
    };
  }, []);

  useEffect(() => {
    return () => sseRef.current?.close();
  }, []);

  async function handleGenerate(updatedPres) {
    setPresentation(updatedPres);
    setPhase('generating');
    setGenerationStage(0);
    setGeneratedSlides([]);

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
      <div className="h-screen flex items-center justify-center" style={{ background: '#F2F2F7' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center animate-pulse"
               style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <Sparkles size={24} className="text-white" />
          </div>
          <p className="text-ios-gray1 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (phase === 'generating') {
    return (
      <LoadingScreen
        generatedSlides={generatedSlides}
        totalSlides={totalSlides}
        currentStage={generationStage}
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
      />
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
