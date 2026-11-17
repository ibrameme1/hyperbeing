import { useState } from 'react';

// Brand lockup (icon + wordmark), matching the landing page: a plain tile
// that contrasts with the page (white on dark, Midnight on light) with the
// opposite color for "HB". On hover (or tap) the tile warms to Cantaloupe,
// the brand's accent; no blue fill, no glow.
export default function Logo({ dark = false, height = 32, className = '' }) {
  const [hover, setHover] = useState(false);
  const iconSize = Math.round(height * 0.75);

  const iconBg = hover ? '#FC734D' : (dark ? '#F1F6F9' : '#02070A');
  const hbColor = hover ? '#02070A' : (dark ? '#02070A' : '#F1F6F9');
  const wordmarkColor = dark ? '#F1F6F9' : '#02070A';

  return (
    <div
      className={`flex items-center select-none ${className}`}
      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onTouchStart={() => setHover(true)}
      onTouchEnd={() => setHover(false)}
    >
      <div style={{
        width: iconSize, height: iconSize,
        background: iconBg,
        borderRadius: Math.round(iconSize * 0.22),
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        transition: 'background-color 0.2s ease',
      }}>
        <span style={{
          fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900, color: hbColor,
          fontSize: Math.round(iconSize * 0.46), letterSpacing: '-0.1em',
          display: 'block', lineHeight: 1, paddingRight: '0.1em',
          transition: 'color 0.2s ease',
        }}>HB</span>
      </div>
      <span style={{
        fontFamily: 'Inter, sans-serif', fontWeight: 700,
        fontSize: Math.round(height * 0.38),
        color: wordmarkColor,
        letterSpacing: '-0.03em', lineHeight: 1,
        transition: 'color 0.2s ease',
      }}>HyperBeing</span>
    </div>
  );
}
