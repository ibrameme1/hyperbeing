import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Wand2, Loader2 } from 'lucide-react';
import SlideRenderer from './SlideRenderer';
import api from '../api/client';

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
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="bg-white rounded-t-3xl w-full max-w-2xl overflow-hidden shadow-ios-xl"
          style={{ maxHeight: '85vh' }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-ios-gray4" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-ios-gray5">
            <div>
              <h2 className="font-bold text-gray-900 text-lg">Edit Slide</h2>
              <p className="text-ios-gray1 text-sm">Slide {slide.index + 1} · {slide.type}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-2xl bg-ios-gray5 flex items-center justify-center hover:bg-ios-gray4 transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 120px)' }}>
            {/* Slide preview */}
            <div className="px-6 pt-4">
              <div className="rounded-2xl overflow-hidden shadow-ios-md">
                <SlideRenderer slide={slide} />
              </div>
            </div>

            {/* Instruction form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  What would you like to change?
                </label>
                <textarea
                  ref={textareaRef}
                  value={instruction}
                  onChange={e => setInstruction(e.target.value)}
                  placeholder="e.g. Make it more energetic with bolder visuals, change the colour scheme to dark blue, add a more specific statistic about Q3 growth…"
                  rows={3}
                  className="w-full px-4 py-3 rounded-2xl bg-ios-gray6 border border-transparent text-sm text-gray-800 placeholder:text-ios-gray2 focus:outline-none focus:border-ios-blue focus:bg-white resize-none transition-all duration-200 leading-relaxed"
                />
              </div>

              {error && (
                <p className="text-ios-red text-sm">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="ios-btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !instruction.trim()}
                  className="ios-btn flex-1"
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
