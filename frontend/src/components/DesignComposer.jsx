import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { Send, ImageIcon, X, Sparkles, Wand2 } from 'lucide-react';
import NovaMascot from './NovaMascot';
import { fileToImageAttachment } from '../utils/imageAttachment';
import { DESIGN_CREDIT_COSTS, DESIGN_MAX_IMAGES_PER_BATCH } from '../utils/designMode';

// ─── Design mode composer ──────────────────────────────────────────────────
// The input box shown when "Design" mode is active — lets the user pick how
// many images to generate (1-4), whether Nova should craft the prompts, and
// attach reference images.
export default function DesignComposer({
  isDark,
  prompt, onPromptChange,
  attachments, onAddAttachment, onRemoveAttachment,
  imageCount, onImageCountChange,
  craftMode, onCraftModeChange,
  onSubmit, submitting,
  editingReference, onClearEditing,
  textareaRef,
}) {
  const onDrop = useCallback(accepted => {
    accepted.forEach(async file => {
      try {
        const { data, mimeType } = await fileToImageAttachment(file);
        onAddAttachment({ id: Math.random().toString(36).slice(2), name: file.name, mimeType, data });
      } catch {}
    });
  }, [onAddAttachment]);

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    accept: { 'image/*': [] },
    multiple: true,
  });

  const costPerImage = DESIGN_CREDIT_COSTS[craftMode];
  const totalCost = costPerImage * imageCount;
  const canSubmit = !submitting && (prompt.trim() || attachments.length > 0);

  return (
    <div {...getRootProps()} style={{ position: 'relative' }}>
      <input {...getInputProps()} />
      <div style={{
        background: isDark ? '#141414' : '#fff', borderRadius: 16,
        boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(0,0,0,0.1)',
        overflow: 'hidden', border: isDark ? '0.5px solid #2a2a2a' : '0.5px solid #e8e8e8',
        outline: isDragActive ? '2px solid rgba(91,80,255,0.5)' : 'none', outlineOffset: -2,
      }}>
        {/* Editing banner */}
        <AnimatePresence>
          {editingReference && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 px-5 pt-4 overflow-hidden"
            >
              <img src={editingReference.image_data} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: isDark ? '#aaa' : '#666', fontFamily: 'Inter,sans-serif' }}>
                Describe your changes to this design
              </span>
              <button onClick={onClearEditing} className="ml-auto" style={{ color: isDark ? '#555' : '#999' }}>
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-5">
          <style>{`.hb-ta::placeholder{color:${isDark ? '#555555' : '#aaaaaa'}}`}</style>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={e => onPromptChange(e.target.value)}
            placeholder={craftMode === 'nova'
              ? 'Describe the design you want — Nova will craft the design for you…'
              : 'Describe exactly what to generate, e.g. "A minimalist fox logo, geometric lines, navy on white background". Attach inspiration images below for style reference…'}
            aria-label="Design brief"
            rows={3}
            className="hb-ta w-full resize-none bg-transparent"
            style={{
              border: 'none', outline: 'none', fontSize: 15, lineHeight: 1.7,
              color: isDark ? '#f0f0ee' : '#0d0b1a',
              fontFamily: 'Inter, sans-serif',
            }}
          />
        </div>

        {/* Reference thumbnails */}
        {attachments.length > 0 && (
          <div className="px-5 pb-2 flex gap-2 flex-wrap">
            {attachments.map(f => (
              <div key={f.id} style={{ position: 'relative' }} className="group">
                <img src={f.data} alt={f.name}
                     style={{ height: 48, width: 48, borderRadius: 8, objectFit: 'cover', border: '0.5px solid', borderColor: isDark ? '#2a2a2a' : '#e8e8e8', display: 'block' }} />
                <button
                  onClick={() => onRemoveAttachment(f.id)}
                  aria-label={`Remove ${f.name}`}
                  style={{
                    position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                    background: '#080808', color: '#fff', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid #2a2a2a', cursor: 'pointer',
                  }}
                >
                  <X size={9} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: '4px 20px 20px', borderTop: isDark ? '0.5px solid #2a2a2a' : '0.5px solid #e8e8e8' }}>
          <div className="flex items-center gap-2 py-2 flex-wrap">
            {/* Image count slider */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
              background: isDark ? '#0f0f0f' : '#f0f0f0', borderRadius: 10, padding: '6px 12px',
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'Inter,sans-serif', color: isDark ? '#888' : '#666', whiteSpace: 'nowrap' }}>
                {imageCount} image{imageCount !== 1 ? 's' : ''}
              </span>
              <input
                type="range"
                min={1}
                max={DESIGN_MAX_IMAGES_PER_BATCH}
                step={1}
                value={imageCount}
                onChange={e => onImageCountChange(parseInt(e.target.value, 10))}
                aria-label="Number of images to generate"
                style={{ width: 90, accentColor: '#5B50FF' }}
              />
            </div>

            {/* Craft mode split — the transparent Nova loop animation plays inside
                the "Let Nova craft" segment whenever it's the active option. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: isDark ? '#0f0f0f' : '#f0f0f0', borderRadius: 10, padding: 4, flexShrink: 0 }}>
              {[
                { key: 'nova', label: 'Let Nova craft' },
                { key: 'own', label: 'My prompts' },
              ].map(({ key, label }) => {
                const active = craftMode === key;
                const isNova = key === 'nova';
                return (
                  <button
                    key={key}
                    onClick={() => onCraftModeChange(key)}
                    aria-pressed={active}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: isNova && active ? '4px 12px 4px 8px' : '6px 10px',
                      borderRadius: 7, cursor: 'pointer', border: 'none',
                      fontSize: 12, fontWeight: 600, fontFamily: 'Inter,sans-serif',
                      background: active ? (isDark ? '#1e1e1e' : '#fff') : 'transparent',
                      boxShadow: active ? (isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.1)') : 'none',
                      color: active ? '#5B50FF' : (isDark ? '#888' : '#666'),
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isNova
                      ? (active
                          ? <NovaMascot size={22} className="-my-1 shrink-0" />
                          : <Sparkles size={12} />)
                      : <Wand2 size={12} />}
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Attach references — icon-only to keep the controls on one line */}
            <button
              onClick={open}
              aria-label="Attach reference images"
              title="Attach reference images"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, fontFamily: 'Inter,sans-serif',
                fontWeight: 500, fontSize: 13, padding: '6px 10px', borderRadius: 8,
                border: '0.5px solid', cursor: 'pointer',
                borderColor: attachments.length > 0 ? 'rgba(91,80,255,0.4)' : (isDark ? '#2a2a2a' : '#e0e0e0'),
                background: attachments.length > 0 ? 'rgba(91,80,255,0.1)' : 'transparent',
                color: attachments.length > 0 ? '#8B80FF' : (isDark ? '#888' : '#555'),
              }}
            >
              <ImageIcon size={14} />
              {attachments.length > 0 && (
                <span style={{ background: '#5B50FF', color: '#fff', borderRadius: 9999, fontSize: 11, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  {attachments.length}
                </span>
              )}
            </button>

            {/* Cost + submit — pinned right, stays on the same line as the options */}
            <div className="hidden sm:flex items-center gap-2 ml-auto shrink-0">
              <p className="text-xs" style={{ color: isDark ? '#555' : '#aaa' }}>{totalCost} credit{totalCost !== 1 ? 's' : ''}</p>
              <button
                onClick={onSubmit}
                disabled={!canSubmit}
                className="py-2 px-5 text-sm font-semibold text-white rounded-btn flex items-center gap-2 disabled:opacity-40"
                style={{ background: '#5B50FF', border: 'none', cursor: 'pointer' }}
              >
                <Send size={15} /> Generate
              </button>
            </div>
          </div>

          {/* Mobile-only: full-width Generate button */}
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="sm:hidden w-full ios-btn py-3 text-sm justify-center"
          >
            <Send size={15} /> Generate ({totalCost} credit{totalCost !== 1 ? 's' : ''})
          </button>
        </div>
      </div>
    </div>
  );
}
