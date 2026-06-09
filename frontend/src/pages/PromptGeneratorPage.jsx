import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { ArrowLeft, Send, Sparkles, X, Loader2, Copy, Check, RotateCcw, Paperclip } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';

function DeliveryBlock({ text, onUsePrompt }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    onUsePrompt?.(text);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="flex flex-col gap-2 max-w-[85%]">
      <div style={{ background: '#141414', color: '#f0f0ee', borderRadius: '12px 12px 4px 12px', padding: '16px 20px', fontSize: 14, lineHeight: 1.6, fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'pre-wrap', border: '0.5px solid #1e1e1e' }}>
        {text}
      </div>
      <motion.button
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={handleCopy}
        className="self-start flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all active:scale-95"
        style={{ background: copied ? '#22c55e' : '#5B50FF' }}
      >
        {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Use this prompt</>}
      </motion.button>
    </div>
  );
}

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user';

  if (!isUser && msg.mode === 'delivery') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex gap-3"
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center self-end"
             style={{ background: '#5B50FF' }}>
          <Sparkles size={14} className="text-white" />
        </div>
        <DeliveryBlock text={msg.content} />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center self-end"
             style={{ background: '#5B50FF' }}>
          <Sparkles size={14} className="text-white" />
        </div>
      )}
      <div className={`max-w-[78%] flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
        {msg.images?.map((img, i) => (
          <img key={i} src={img} alt="" className="max-h-32 rounded-lg object-cover shadow-ios" />
        ))}
        {msg.content && (
          <div className={isUser ? 'bubble-user' : 'bubble-ai'}>
            {msg.content.split('\n').map((line, i, arr) => (
              <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function PromptGeneratorPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  const STORAGE_KEY = `hb_prompt_session_${user?.id}`;
  const MESSAGES_KEY = `hb_prompt_messages_${user?.id}`;

  // Init session
  useEffect(() => {
    let sid = localStorage.getItem(STORAGE_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, sid);
    }
    setSessionId(sid);

    const saved = localStorage.getItem(MESSAGES_KEY);
    if (saved) {
      try { setMessages(JSON.parse(saved)); } catch {}
    }
  }, []);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Persist messages
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  const onDrop = useCallback(accepted => {
    accepted.forEach(file => {
      const reader = new FileReader();
      reader.onload = e => setImages(prev => [...prev, {
        id: Math.random().toString(36).slice(2),
        name: file.name,
        mimeType: file.type,
        data: e.target.result,
        preview: e.target.result,
      }]);
      reader.readAsDataURL(file);
    });
  }, []);

  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop,
    noClick: true,
    accept: { 'image/*': [] },
  });

  async function handleSend() {
    if (!input.trim() && images.length === 0) return;
    if (!sessionId) return;

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      images: images.map(i => i.preview),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    const sentImages = [...images];
    setImages([]);
    setLoading(true);

    try {
      const { data } = await api.post(`/prompt-chat/${sessionId}`, {
        message: userMsg.content,
        images: sentImages.map(i => ({ data: i.data, mimeType: i.mimeType })),
      });

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        mode: data.mode,
        readyToGenerate: data.readyToGenerate,
      }]);
    } catch (err) {
      const status = err.response?.status;
      const errMsg = err.response?.data?.error ||
        (status === 429 ? 'Too many messages. Please wait a moment before continuing.' :
         status === 503 ? 'The AI is temporarily unavailable. Please try again shortly.' :
         'Failed to get a response. Please try again.');
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errMsg,
        mode: 'error',
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleStartOver() {
    if (!sessionId) return;
    try { await api.delete(`/prompt-chat/${sessionId}`); } catch {}
    const newSid = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, newSid);
    localStorage.removeItem(MESSAGES_KEY);
    setSessionId(newSid);
    setMessages([]);
    setInput('');
    setImages([]);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend();
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: '#080808' }}>
      {/* Top bar */}
      <div
        className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
        style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', borderBottom: '0.5px solid #1e1e1e' }}
      >
        <button
          onClick={() => navigate('/dashboard')}
          className="text-ios-blue flex items-center gap-1 text-sm font-medium flex-shrink-0"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: '#5B50FF' }}>
            <Sparkles size={13} className="text-white" />
          </div>
          <p style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, color: '#f0f0ee', fontSize: 14 }}>Prompt Generator</p>
        </div>
        <button
          onClick={handleStartOver}
          className="flex items-center gap-1.5 text-sm font-medium text-ios-gray1 hover:text-gray-900 transition-colors flex-shrink-0"
        >
          <RotateCcw size={14} />
          <span className="hidden sm:inline">Start over</span>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 min-h-0">
        {messages.length === 0 && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full gap-4 text-center py-16"
          >
            <div className="w-16 h-16 rounded-xl flex items-center justify-center"
                 style={{ background: 'rgba(91,80,255,0.08)' }}>
              <Sparkles size={28} className="text-ios-indigo opacity-60" />
            </div>
            <div>
              <p style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, color: '#f0f0ee', fontSize: 15, marginBottom: 4 }}>Describe your slide</p>
              <p style={{ fontFamily: 'Inter,sans-serif', color: '#888888', fontSize: 14, maxWidth: 280 }}>Tell me what you need — a brand, a product, a stat, a moment. I'll ask what I need and generate a detailed image prompt.</p>
            </div>
          </motion.div>
        )}

        {messages.map(msg => (
          <ChatMessage key={msg.id} msg={msg} />
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center self-end"
                 style={{ background: '#5B50FF' }}>
              <Sparkles size={14} className="text-white" />
            </div>
            <div className="bubble-ai flex items-center gap-2 text-ios-gray1">
              <Loader2 size={14} className="animate-spin" />
              <span>Thinking…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="p-4 flex-shrink-0"
        style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', borderTop: '0.5px solid #1e1e1e' }}
      >
        <div {...getRootProps()} className="rounded-lg" style={{ background: '#141414', border: '0.5px solid #1e1e1e' }}>
          <input {...getInputProps()} />

          <AnimatePresence>
            {images.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 pt-3 flex gap-2 flex-wrap"
              >
                {images.map(img => (
                  <div key={img.id} className="relative group">
                    <img src={img.preview} alt={img.name} className="h-12 w-12 rounded-xl object-cover border border-ios-gray5" />
                    <button
                      onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-gray-800 text-white rounded-full flex items-center justify-center"
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
              placeholder="Describe your slide — brand, product, stat, campaign moment…"
              rows={2}
              className="flex-1 resize-none leading-relaxed"
              style={{ background: '#141414', color: '#f0f0ee', border: 'none', outline: 'none', fontFamily: 'Inter,sans-serif', fontSize: 14 }}
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
                disabled={loading || (!input.trim() && images.length === 0)}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
                style={{ background: '#5B50FF' }}
              >
                <Send size={14} className="text-white" />
              </button>
            </div>
          </div>
        </div>
        <p className="text-center text-[11px] mt-2" style={{ color: '#555555', fontFamily: 'Inter,sans-serif' }}>⌘ + Enter to send</p>
      </div>
    </div>
  );
}
