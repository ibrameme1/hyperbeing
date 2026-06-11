import { useEffect, useRef } from 'react';

// Floating, transparent canvas rendition of the Nova mascot.
// Renders directly on whatever background sits beneath it — no wrapper
// container, background color, border radius, or box shadow.
//
// The source video shows Nova glowing on a solid black background,
// authored for `mix-blend-mode: screen`. That blend mode is unreliable on
// mobile WebKit (iOS Safari / in-app browsers) and leaves an opaque black
// box behind the video. Instead, we play the video off-screen and render
// each frame to a <canvas>, deriving per-pixel alpha from luminance
// (`alpha = max(r, g, b)`) so black pixels become fully transparent and
// bright Nova-glow pixels stay visible — equivalent to a "screen over
// black" blend, but works everywhere.
export default function NovaMascotVideo({ size = 120, className = '' }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const video = document.createElement('video');
    videoRef.current = video;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.style.display = 'none';

    const webm = document.createElement('source');
    webm.src = '/nova-mascot.webm';
    webm.type = 'video/webm';
    const mp4 = document.createElement('source');
    mp4.src = '/nova-mascot.mp4';
    mp4.type = 'video/mp4';
    video.appendChild(webm);
    video.appendChild(mp4);
    document.body.appendChild(video);

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let offscreen = document.createElement('canvas');
    let offCtx = offscreen.getContext('2d', { willReadFrequently: true });

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
        // Cap internal resolution to avoid excessive getImageData cost,
        // while keeping sharpness up to ~2x the display size (DPR-aware).
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
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Approximate "screen over black": alpha = max channel.
          // Fully black pixels (alpha 0) keep their RGB — irrelevant when
          // fully transparent.
          const alpha = Math.max(r, g, b);
          data[i + 3] = alpha;
        }
        offCtx.putImageData(frame, 0, 0);

        // Draw the (now alpha-keyed) frame into the visible canvas,
        // preserving aspect ratio (object-fit: contain) and centering it.
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
      playPromise.catch(() => {
        // Autoplay can be blocked; rendering will simply stay blank until
        // playback is allowed (e.g. user interaction triggers retry).
      });
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
