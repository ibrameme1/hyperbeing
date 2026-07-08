import { Lock, Loader2 } from 'lucide-react';
import { mediaUrl, isRealImage } from '../utils/mediaUrl';

const CREDIT_COST_PER_SLIDE = 18;

export default function SlideRenderer({ slide, className = '', onUnlock, unlocking = false, showWatermark = false }) {
  if (!slide) return null;

  const hasImage = isRealImage(slide.image_data);

  return (
    <div
      className={`relative w-full aspect-[16/9] overflow-hidden ${className}`}
      style={{ background: '#1a1a2e' }}
    >
      {/* Skeleton always underneath — visible while image is absent or loading */}
      <div className="absolute inset-0 skeleton" />

      {slide.image_data && (
        <img
          key={slide.image_data}
          src={mediaUrl(slide.image_data)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover animate-fadeIn"
        />
      )}

      {showWatermark && hasImage && (
        <span
          className="absolute pointer-events-none select-none"
          style={{
            right: '2.5%',
            bottom: '2.5%',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
            fontSize: 'clamp(9px, 1.4vw, 14px)',
            color: 'rgba(255,255,255,0.55)',
            textShadow: '0 1px 4px rgba(0,0,0,0.35)',
            letterSpacing: '0.01em',
          }}
        >
          Made with HyperBeing
        </span>
      )}

      {slide.status === 'locked' && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
          style={{ background: 'rgba(10,10,15,0.82)', backdropFilter: 'blur(3px)' }}
        >
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(91,80,255,0.15)' }}>
            <Lock size={18} style={{ color: '#8B80FF' }} />
          </div>
          <div>
            <p className="text-white text-sm font-semibold">This slide is locked</p>
            <p className="text-white/60 text-xs mt-1">
              Unlock for {slide.credits_needed ?? CREDIT_COST_PER_SLIDE} credit{(slide.credits_needed ?? CREDIT_COST_PER_SLIDE) === 1 ? '' : 's'}
            </p>
          </div>
          {onUnlock && (
            <button
              onClick={onUnlock}
              disabled={unlocking}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors active:scale-95 disabled:opacity-60"
              style={{ background: '#5B50FF' }}
            >
              {unlocking ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
              {unlocking ? 'Unlocking…' : 'Unlock slide'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
