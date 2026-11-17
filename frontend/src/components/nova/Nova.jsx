import { useEffect, useId, useRef, useState } from 'react';
import './nova.css';

// Nova, HyperBeing's mascot, drawn as SVG so she is crisp at any size, costs
// nothing to load, and can react: eyes follow the cursor (or a target you
// pass), she blinks, bobs, flaps, and switches expression by `mood`.
//
// Silhouette follows the original 3D render (dome body, tapering side fins,
// soft drips underneath, glowing belly). Colors follow the brand palette:
// a midnight-indigo body, Electric Blue under-light, Cantaloupe cheeks.
//
// mood: 'idle' | 'happy' | 'wow' | 'think' | 'shy' | 'sleep' | 'sad' | 'wave'
// look: optional { x, y } in -1..1 to aim the pupils manually (wins over follow)
// follow: track the pointer anywhere on the page
//
// SSR-safe: nothing touches window during render (the landing page is
// prerendered to static HTML for crawlers).

const MAX_PUPIL = 3.8; // svg units the pupils may travel

export default function Nova({
  size = 96,
  mood = 'idle',
  look = null,
  follow = true,
  float = true,
  glow = true,
  className = '',
  style,
  title,
}) {
  const uid = useId().replace(/:/g, '');
  const svgRef = useRef(null);
  const [eye, setEye] = useState({ x: 0, y: 0 });

  // Pointer tracking, rAF-throttled. Only while `follow` and no manual `look`.
  useEffect(() => {
    if (!follow || look) return undefined;
    let raf = 0;
    let last = null;
    const onMove = (e) => {
      last = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = svgRef.current;
        if (!el || !last) return;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height * 0.45;
        const dx = last.clientX - cx;
        const dy = last.clientY - cy;
        const d = Math.hypot(dx, dy) || 1;
        // Ease in over the first ~300px so nearby movement still reads.
        const k = Math.min(1, d / 300);
        setEye({ x: (dx / d) * k, y: (dy / d) * k });
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [follow, look]);

  const aim = look || (mood === 'think' ? { x: 0.7, y: -0.8 } : mood === 'sad' ? { x: 0, y: 0.9 } : eye);
  const px = Math.max(-1, Math.min(1, aim.x)) * MAX_PUPIL;
  const py = Math.max(-1, Math.min(1, aim.y)) * MAX_PUPIL * 0.8;

  const closed = mood === 'sleep' || mood === 'shy';
  const smiling = mood === 'happy' || mood === 'wave';
  const big = mood === 'wow';

  const g = (n) => `nova-${n}-${uid}`;

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 200 150"
      width={size}
      height={size * 0.75}
      className={`nova nova--${mood} ${float ? 'nova--float' : ''} ${className}`}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={g('body')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3A4249" />
          <stop offset="0.45" stopColor="#151B20" />
          <stop offset="0.8" stopColor="#090D10" />
          <stop offset="1" stopColor="#3B2A24" />
        </linearGradient>
        <radialGradient id={g('sheen')} cx="0.38" cy="0.22" r="0.55">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.30" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={g('belly')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFE6DA" />
          <stop offset="0.3" stopColor="#FC734D" />
          <stop offset="0.7" stopColor="#0297DE" stopOpacity="0.55" />
          <stop offset="1" stopColor="#0297DE" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={g('floor')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FC734D" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#0297DE" stopOpacity="0.25" />
          <stop offset="1" stopColor="#0297DE" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={g('iris')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.6" stopColor="#05080A" />
          <stop offset="0.88" stopColor="#1C2A33" />
          <stop offset="1" stopColor="#4CB8F0" />
        </radialGradient>
      </defs>

      {/* light pooled on the floor */}
      {glow && <ellipse className="nova-floor" cx="100" cy="140" rx="68" ry="8" fill={`url(#${g('floor')})`} />}

      <g className="nova-body">
        {/* fins sit behind the body so they can flap */}
        <path className="nova-fin nova-fin--l" d="M60 62 C42 70 22 80 8 90 C4 94 7 99 13 99 C30 100 46 99 62 97 Z" fill={`url(#${g('body')})`} />
        <path className="nova-fin nova-fin--r" d="M140 62 C158 70 178 80 192 90 C196 94 193 99 187 99 C170 100 154 99 138 97 Z" fill={`url(#${g('body')})`} />

        {/* belly glow, under the body so it spills out at the edges */}
        {glow && <ellipse className="nova-belly" cx="100" cy="112" rx="56" ry="13" fill={`url(#${g('belly')})`} />}

        {/* dome + drips */}
        <path
          d="M44 94 C40 60 66 30 100 30 C134 30 160 60 156 94
             C156 104 151 112 144 110 C140 117 128 118 124 111
             C118 118 106 118 100 112 C94 118 82 118 76 111
             C72 118 60 117 56 110 C49 112 44 104 44 94 Z"
          fill={`url(#${g('body')})`}
        />
        <path
          d="M46 92 C42 60 67 31.5 100 31.5 C133 31.5 158 60 154 92"
          fill="none" stroke="#FFFFFF" strokeOpacity="0.14" strokeWidth="1.2"
        />
        <path
          d="M44 94 C40 60 66 30 100 30 C134 30 160 60 156 94 C126 84 74 84 44 94 Z"
          fill={`url(#${g('sheen')})`}
        />
        {/* rim light where the belly glow wraps the drips */}
        {glow && (
          <path
            d="M50 104 C56 113 70 115 76 110 C84 117 116 117 124 110 C130 115 144 113 150 104"
            fill="none" stroke="#FFB49C" strokeOpacity="0.75" strokeWidth="2.2" strokeLinecap="round"
          />
        )}


        {/* eyes */}
        {closed ? (
          <g fill="none" stroke="#EAF2F6" strokeWidth="3" strokeLinecap="round">
            <path d="M70 72 C75 78 85 78 90 72" />
            <path d="M110 72 C115 78 125 78 130 72" />
          </g>
        ) : smiling ? (
          <g fill="none" stroke="#EAF2F6" strokeWidth="3.2" strokeLinecap="round">
            <path d="M70 74 C75 65 85 65 90 74" />
            <path d="M110 74 C115 65 125 65 130 74" />
          </g>
        ) : (
          <g className="nova-eyes">
            {[80, 120].map((cx) => (
              <g key={cx}>
                <circle cx={cx} cy="70" r={big ? 17 : 15.5} fill="#F4FAFF" />
                <g transform={`translate(${px} ${py})`}>
                  <circle cx={cx} cy="70" r={big ? 13 : 11.6} fill={`url(#${g('iris')})`} />
                  <circle cx={cx - 4} cy="65" r="4" fill="#FFFFFF" />
                  <circle cx={cx + 4.2} cy="74.5" r="1.9" fill="#FFFFFF" fillOpacity="0.85" />
                </g>
              </g>
            ))}
          </g>
        )}

        {/* mouth */}
        {big ? (
          <ellipse cx="100" cy="91" rx="3.8" ry="4.6" fill="#EAF2F6" />
        ) : mood === 'sad' ? (
          <path d="M95 93 C98 89 102 89 105 93" fill="none" stroke="#EAF2F6" strokeWidth="2.4" strokeLinecap="round" />
        ) : mood === 'think' ? (
          <path d="M96 91 L105 90" fill="none" stroke="#EAF2F6" strokeWidth="2.4" strokeLinecap="round" />
        ) : smiling ? (
          <path d="M93 87 C96 95 104 95 107 87 Z" fill="#EAF2F6" />
        ) : (
          <path d="M95 88 C98 92 102 92 105 88" fill="none" stroke="#EAF2F6" strokeWidth="2.4" strokeLinecap="round" />
        )}

        {mood === 'sleep' && (
          <text className="nova-z" x="148" y="34" fill="#9AAAB5" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="16">z</text>
        )}
      </g>
    </svg>
  );
}
