import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, X, Send, Loader2, Check } from 'lucide-react';
import api from '../api/client';

// Floating circular feedback button + popup composer.
export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error

  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim() || status === 'sending') return;
    setStatus('sending');
    try {
      await api.post('/feedback', { message: message.trim(), page: window.location.pathname });
      setStatus('sent');
      setMessage('');
      setTimeout(() => { setOpen(false); setStatus('idle'); }, 1500);
    } catch {
      setStatus('error');
    }
  }

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 200 }}>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'absolute', bottom: 64, right: 0, width: 300,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 16, padding: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', margin: 0 }}>
                Got feedback?
              </p>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {status === 'sent' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
                <Check size={16} style={{ color: '#22c55e' }} /> Thanks! We got it.
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <textarea
                  autoFocus
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Tell us what's working, what's not, or what you'd love to see..."
                  rows={4}
                  maxLength={2000}
                  style={{
                    width: '100%', resize: 'none', borderRadius: 10, padding: '10px 12px',
                    background: 'var(--bg-input)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', fontSize: 13,
                    outline: 'none', boxSizing: 'border-box', marginBottom: 10,
                  }}
                />
                {status === 'error' && (
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#ef4444', marginBottom: 8 }}>
                    Couldn't send that. Please try again.
                  </p>
                )}
                <button
                  type="submit"
                  disabled={!message.trim() || status === 'sending'}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: '#5B50FF', color: '#fff', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 13,
                    opacity: !message.trim() || status === 'sending' ? 0.6 : 1,
                  }}
                >
                  {status === 'sending' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send feedback
                </button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen(v => !v)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Send feedback"
        style={{
          width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: '#5B50FF', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(91,80,255,0.4)',
        }}
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </motion.button>
    </div>
  );
}
