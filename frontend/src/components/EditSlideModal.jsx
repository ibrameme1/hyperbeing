import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Wand2, Loader2 } from 'lucide-react';
import SlideRenderer from './SlideRenderer';
import api from '../api/client';
import { capture } from '../utils/posthog';

export default function EditSlideModal({ slide, presentationId, onClose, onUpdated }) {
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!instruction.trim()) return;
    setLoading(true);
    setError('');

    try {
      await api.post(`/presentations/${presentationId}/slides/${slide.index}/regenerate`, {
        instruction: instruction.trim(),
      });
      capture('slide_edited', {
        presentation_id: presentationId,
        slide_index: slide.index,
        source: 'modal',
      });
      onUpdated(slide.index);
      onClose();
    } catch (err) {
      const status = err.response?.status;
      setError(
        err.response?.data?.error ||
        (status === 429 ? 'Too many regeneration requests. Please wait a moment.' :
         status === 402 ? 'You\'ve run out of credits. Upgrade your plan to keep editing.' :
         'Could not update this slide. Please try again.')
      );
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          style={{
            background: '#141414',
            borderRadius: '12px 12px 0 0',
            width: '100%',
            maxWidth: 672,
            overflow: 'hidden',
            maxHeight: '85vh',
          }}
        >
          {/* Drag handle */}
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <div style={{ width: 40, height: 4, borderRadius: 9999, background: '#2a2a2a' }} />
          </div>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '0.5px solid #1e1e1e' }}>
            <div>
              <h2 style={{ fontFamily: 'Inter,sans-serif', fontWeight: 700, color: '#f0f0ee', fontSize: 18, margin: 0 }}>Edit Slide</h2>
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: '#888888', margin: 0 }}>Slide {slide.index + 1} · {slide.type}</p>
            </div>
            <button
              onClick={onClose}
              style={{ width: 32, height: 32, borderRadius: 6, background: '#0f0f0f', border: '0.5px solid #1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#888888' }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ overflowY: 'auto', maxHeight: 'calc(85vh - 120px)' }}>
            {/* Slide preview */}
            <div style={{ padding: '16px 24px 0' }}>
              <div style={{ background: '#0f0f0f', border: '0.5px solid #1e1e1e', borderRadius: 8, overflow: 'hidden' }}>
                <SlideRenderer slide={slide} />
              </div>
            </div>

            {/* Instruction form */}
            <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600, color: '#b8b8b8', marginBottom: 8 }}>
                  What would you like to change?
                </label>
                <textarea
                  ref={textareaRef}
                  value={instruction}
                  onChange={e => setInstruction(e.target.value)}
                  placeholder="e.g. Make it more energetic with bolder visuals, change the colour scheme to dark blue, add a more specific statistic about Q3 growth…"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: '#0f0f0f',
                    border: '0.5px solid #1e1e1e',
                    borderRadius: 6,
                    color: '#f0f0ee',
                    fontFamily: 'Inter,sans-serif',
                    fontSize: 14,
                    resize: 'none',
                    outline: 'none',
                    lineHeight: 1.6,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {error && (
                <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#ef4444' }}>{error}</p>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    color: '#888888',
                    border: '0.5px solid #1e1e1e',
                    borderRadius: 6,
                    fontFamily: 'Inter,sans-serif',
                    fontSize: 13,
                    padding: '9px 18px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !instruction.trim()}
                  style={{
                    flex: 1,
                    background: '#5B50FF',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontFamily: 'Inter,sans-serif',
                    fontWeight: 600,
                    fontSize: 13,
                    padding: '9px 18px',
                    cursor: loading || !instruction.trim() ? 'not-allowed' : 'pointer',
                    opacity: loading || !instruction.trim() ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  {loading ? (
                    <><Loader2 size={16} className="animate-spin" /> Updating…</>
                  ) : (
                    <><Wand2 size={16} /> Update Slide</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
