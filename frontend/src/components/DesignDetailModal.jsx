import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Download, Copy, Check, ImagePlus, Pencil, Sparkles, Wand2, AlertCircle } from 'lucide-react';

// ─── Design generation detail view ─────────────────────────────────────────
// Shown when a user clicks a completed image in the design gallery —
// big preview on one side, prompt + actions on the other.
export default function DesignDetailModal({ generation, onClose, onReference, onEdit, isDark }) {
  const [copied, setCopied] = useState(false);

  if (!generation) return null;

  const promptText = generation.final_prompt || generation.user_prompt || '';
  const settings = generation.settings || {};

  function handleCopy() {
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const a = document.createElement('a');
    a.href = generation.image_data;
    a.download = `design-${generation.id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(18px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 16 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label="Design detail"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-5xl rounded-2xl overflow-hidden flex flex-col md:flex-row shadow-2xl"
        style={{ background: isDark ? '#0f0f0f' : '#fff', border: isDark ? '0.5px solid #2a2a2a' : '0.5px solid #e8e8e8', maxHeight: '90vh' }}
      >
        {/* Image */}
        <div className="flex-1 flex items-center justify-center p-4 md:p-6" style={{ background: isDark ? '#080808' : '#f5f5f5', minHeight: 280 }}>
          {generation.status === 'complete' && generation.image_data ? (
            <img src={generation.image_data} alt="" className="max-w-full max-h-full rounded-xl object-contain" style={{ maxHeight: '78vh' }} />
          ) : (
            <div className="flex flex-col items-center gap-2 text-center px-6" style={{ color: isDark ? '#666' : '#999' }}>
              <AlertCircle size={28} />
              <p className="text-sm">{generation.error_message || 'This image is still generating.'}</p>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="w-full md:w-80 flex flex-col" style={{ borderTop: isDark ? '0.5px solid #2a2a2a' : '0.5px solid #e8e8e8', borderLeft: 'none' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: isDark ? '0.5px solid #2a2a2a' : '0.5px solid #e8e8e8' }}>
            <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 14, color: isDark ? '#f0f0ee' : '#0d0b1a' }}>Design details</span>
            <button onClick={onClose} aria-label="Close" style={{ color: isDark ? '#888' : '#666' }}>
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
            {/* Mode + settings badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                padding: '4px 8px', borderRadius: 6, fontFamily: 'Inter,sans-serif',
                background: 'rgba(91,80,255,0.12)', color: '#8B80FF',
              }}>
                {generation.mode === 'nova' ? <Sparkles size={11} /> : <Wand2 size={11} />}
                {generation.mode === 'nova' ? 'Nova-crafted prompt' : 'Your prompt'}
              </span>
              {settings.aspectRatio && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 6, fontFamily: 'Inter,sans-serif', background: isDark ? '#1e1e1e' : '#f0f0f0', color: isDark ? '#888' : '#666' }}>
                  {settings.aspectRatio}
                </span>
              )}
              {settings.resolution && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 6, fontFamily: 'Inter,sans-serif', background: isDark ? '#1e1e1e' : '#f0f0f0', color: isDark ? '#888' : '#666' }}>
                  {settings.resolution.toUpperCase()}
                </span>
              )}
            </div>

            {/* Prompt */}
            <div>
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: isDark ? '#888' : '#666', marginBottom: 6 }}>Prompt</p>
              <div
                className="rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
                style={{ background: isDark ? '#141414' : '#f5f5f5', color: isDark ? '#ccc' : '#333', maxHeight: 220, overflowY: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5 }}
              >
                {promptText || '—'}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 py-4 grid grid-cols-2 gap-2" style={{ borderTop: isDark ? '0.5px solid #2a2a2a' : '0.5px solid #e8e8e8' }}>
            <button
              onClick={handleDownload}
              disabled={generation.status !== 'complete'}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
              style={{ background: isDark ? '#1e1e1e' : '#f0f0f0', color: isDark ? '#f0f0ee' : '#0d0b1a' }}
            >
              <Download size={14} /> Download
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: copied ? '#22c55e' : (isDark ? '#1e1e1e' : '#f0f0f0'), color: copied ? '#fff' : (isDark ? '#f0f0ee' : '#0d0b1a') }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy prompt'}
            </button>
            <button
              onClick={() => onReference(generation)}
              disabled={generation.status !== 'complete'}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
              style={{ background: isDark ? '#1e1e1e' : '#f0f0f0', color: isDark ? '#f0f0ee' : '#0d0b1a' }}
            >
              <ImagePlus size={14} /> Reference
            </button>
            <button
              onClick={() => onEdit(generation)}
              disabled={generation.status !== 'complete'}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40"
              style={{ background: '#5B50FF' }}
            >
              <Pencil size={14} /> Edit
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
