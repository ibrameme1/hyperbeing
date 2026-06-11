import { useState } from 'react';

// Brand lockup (icon + wordmark). On hover (or tap, on touch devices) the
// logo recolors for contrast against its current background:
//  - on a dark background, it inverts to white / primary
//  - on a light background, the wordmark pops to our primary purple
export default function Logo({ dark = false, height = 32, className = '' }) {
  const [hover, setHover] = useState(false);
  const iconSize = Math.round(height * 0.75);

  const iconBg = hover ? (dark ? '#f0f0ee' : '#0d0b1a') : '#5B50FF';
  const hbColor = hover ? '#5B50FF' : '#ffffff';
  const wordmarkColor = hover
    ? '#5B50FF'
    : (dark ? '#f0f0ee' : '#0d0b1a');

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
