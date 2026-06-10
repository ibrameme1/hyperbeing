// Floating, transparent video rendition of the Nova mascot.
// Renders directly on whatever background sits beneath it — no wrapper
// container, background color, border radius, or box shadow.
export default function NovaMascotVideo({ size = 120, className = '' }) {
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
