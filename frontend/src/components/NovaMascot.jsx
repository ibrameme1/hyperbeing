// Floating Nova mascot — a transparent video that renders directly on
// whatever background sits beneath it. No wrapper container, background
// color, border radius, or box shadow.
//
// `nova_mascot.webm` is encoded with a real alpha channel (VP9 / yuva420p,
// chroma-keyed from the source's black background), so it composites
// cleanly over both light and dark backgrounds with no halo or wash-out.
export default function NovaMascot({ size = 120, className = '' }) {
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
