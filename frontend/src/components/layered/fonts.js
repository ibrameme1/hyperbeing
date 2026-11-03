import { useEffect } from 'react';

// Google Fonts used by layered slides (mirrors backend slideLayout.FONTS).
// Each entry is the css2 axis spec the family actually supports — asking for a
// weight/italic a static family doesn't have makes Google reject the request.
export const FONT_SPECS = {
  'Inter': 'ital,wght@0,100..900;1,100..900',
  'Lato': 'ital,wght@0,300;0,400;0,700;0,900;1,400;1,700',
  'Poppins': 'ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700',
  'Montserrat': 'ital,wght@0,100..900;1,100..900',
  'DM Sans': 'ital,wght@0,100..900;1,100..900',
  'Manrope': 'wght@200..800',
  'Sora': 'wght@100..800',
  'Outfit': 'wght@100..900',
  'Space Grotesk': 'wght@300..700',
  'Archivo Black': 'wght@400',
  'Anton': 'wght@400',
  'Bebas Neue': 'wght@400',
  'Oswald': 'wght@200..700',
  'Barlow Condensed': 'ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700',
  'Big Shoulders Display': 'wght@100..900',
  'Playfair Display': 'ital,wght@0,400..900;1,400..900',
  'DM Serif Display': 'ital,wght@0,400;1,400',
  'Instrument Serif': 'ital,wght@0,400;1,400',
  'IBM Plex Mono': 'ital,wght@0,300;0,400;0,500;0,600;0,700;1,400',
};
export const FONT_NAMES = Object.keys(FONT_SPECS);

const loaded = new Set();

export function loadFonts(families) {
  for (const f of families) {
    if (!f || loaded.has(f) || !FONT_SPECS[f]) continue;
    loaded.add(f);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}:${FONT_SPECS[f]}&display=swap`;
    document.head.appendChild(link);
  }
}

export function layoutFonts(layout) {
  if (!layout) return [];
  const set = new Set([layout.fonts?.display, layout.fonts?.body]);
  for (const l of layout.layers || []) {
    if (l.kind === 'text') set.add(l.font);
    if (l.kind === 'chart') set.add(l.options?.font);
  }
  return [...set].filter(Boolean);
}

// Loads every font a layout uses (once per family per page).
export function useLayoutFonts(layout) {
  const key = layoutFonts(layout).join('|');
  useEffect(() => { loadFonts(key ? key.split('|') : []); }, [key]);
}

export function fontStack(family) {
  return `'${family}', Inter, system-ui, sans-serif`;
}
