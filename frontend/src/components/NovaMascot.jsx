import { useEffect, useRef } from 'react';

// Floating Nova mascot — renders directly on whatever background sits
// beneath it. No wrapper container, background color, border radius, or
// box shadow.
//
// `nova_mascot.webm` is encoded with a real alpha channel (VP9 / yuva420p,
// chroma-keyed from the source's black background), so browsers that
// support it (Chrome, Firefox, Edge — desktop & Android) get a plain
// transparent <video> with no extra processing.
//
// Safari (desktop & iOS) doesn't support WebM at all, so it would fall back
// to the opaque `nova-mascot.mp4`, leaving Nova's black backdrop visible.
// For those browsers we render the mp4 to an offscreen <video>, then paint
// it to a <canvas>, deriving per-pixel alpha the same way the WebM was
// keyed: pixels close to black become transparent, with a soft blend band
// (`colorkey=0x000000:0.10:0.25`) so edges stay smooth on any background.
const SIMILARITY = 0.10;
const BLEND = 0.25;

const supportsAlphaWebm = (() => {
  if (typeof document === 'undefined') return true;
  const v = document.createElement('video');
  const type = v.canPlayType('video/webm; codecs="vp9"');
  return type === 'probably' || type === 'maybe';
})();

function NovaMascotCanvas({ size, className }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const video = document.createElement('video');
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.style.display = 'none';

    const mp4 = document.createElement('source');
    mp4.src = '/nova-mascot.mp4';
    mp4.type = 'video/mp4';
    video.appendChild(mp4);
    document.body.appendChild(video);

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const offscreen = document.createElement('canvas');
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayPx = Math.round(size * dpr);

    let rafId = null;
    let vfcId = null;
    let cancelled = false;

    const renderFrame = () => {
      if (cancelled) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw && vh) {
        const maxDim = Math.min(Math.max(displayPx, 1) * 2, Math.max(vw, vh));
        const scale = Math.min(1, maxDim / Math.max(vw, vh));
        const sw = Math.max(1, Math.round(vw * scale));
        const sh = Math.max(1, Math.round(vh * scale));

        if (offscreen.width !== sw || offscreen.height !== sh) {
          offscreen.width = sw;
          offscreen.height = sh;
        }
        if (canvas.width !== displayPx || canvas.height !== displayPx) {
          canvas.width = displayPx;
          canvas.height = displayPx;
        }

        offCtx.drawImage(video, 0, 0, sw, sh);

        const frame = offCtx.getImageData(0, 0, sw, sh);
        const data = frame.data;
        const norm = 255 * Math.sqrt(3);
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const dist = Math.sqrt(r * r + g * g + b * b) / norm;
          let alpha;
          if (dist <= SIMILARITY) alpha = 0;
          else if (dist >= SIMILARITY + BLEND) alpha = 255;
          else alpha = Math.round((255 * (dist - SIMILARITY)) / BLEND);
          data[i + 3] = alpha;
        }
        offCtx.putImageData(frame, 0, 0);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const containScale = Math.min(canvas.width / sw, canvas.height / sh);
        const dw = sw * containScale;
        const dh = sh * containScale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;
        ctx.drawImage(offscreen, dx, dy, dw, dh);
      }

      if (cancelled) return;
      if (typeof video.requestVideoFrameCallback === 'function') {
        vfcId = video.requestVideoFrameCallback(renderFrame);
      } else {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    const start = () => {
      if (cancelled) return;
      if (typeof video.requestVideoFrameCallback === 'function') {
        vfcId = video.requestVideoFrameCallback(renderFrame);
      } else {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    video.addEventListener('loadedmetadata', start, { once: true });
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }

    return () => {
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      if (vfcId != null && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(vfcId);
      }
      video.removeEventListener('loadedmetadata', start);
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (video.parentNode) video.parentNode.removeChild(video);
    };
  }, [size]);

  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={Math.round(size * dpr)}
      height={Math.round(size * dpr)}
      style={{
        width: size,
        height: size,
        background: 'transparent',
        pointerEvents: 'none',
      }}
    />
  );
}

export default function NovaMascot({ size = 120, className = '' }) {
  if (!supportsAlphaWebm) {
    return <NovaMascotCanvas size={size} className={className} />;
  }

  return (
    <video
      autoPlay
      loop
      muted
      playsInline
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        background: 'transparent',
        pointerEvents: 'none',
      }}
    >
      <source src="/nova_mascot.webm" type="video/webm" />
      <source src="/nova-mascot.mp4" type="video/mp4" />
    </video>
  );
}
