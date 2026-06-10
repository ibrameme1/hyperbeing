import { useState, useEffect } from 'react';
import NovaMascot from './NovaMascot';

// Floating, transparent video rendition of the Nova mascot.
// Renders directly on whatever background sits beneath it — no wrapper
// container, background color, border radius, or box shadow.
//
// `mix-blend-mode` on <video> is unreliable on mobile WebKit (iOS Safari /
// in-app browsers), which leaves the video's opaque black background
// visible. To guarantee Nova never sits in a black box on mobile, small
// viewports fall back to the pure CSS/SVG NovaMascot, which has no video
// or background at all.
export default function NovaMascotVideo({ size = 120, className = '' }) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  if (isMobile) {
    return <NovaMascot size={Math.round(size * 0.7)} />;
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
        mixBlendMode: 'screen',
        pointerEvents: 'none',
      }}
    >
      <source src="/nova-mascot.webm" type="video/webm" />
      <source src="/nova-mascot.mp4" type="video/mp4" />
    </video>
  );
}
