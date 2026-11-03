import { useEffect, useState } from 'react';

// Lucide icons are fetched by name from the backend (GET /api/icons/:name) —
// a deck uses a handful, so this is lighter than bundling all of lucide.
const cache = new Map(); // name → Promise<string|null> (inner SVG markup)

function loadIcon(name) {
  if (!/^[a-z0-9-]{1,60}$/.test(name || '')) return Promise.resolve(null);
  if (!cache.has(name)) {
    const base = import.meta.env.VITE_API_URL || '';
    cache.set(name, fetch(`${base}/api/icons/${name}`)
      .then(r => (r.ok ? r.text() : null))
      .then(t => (t ? (/<svg[^>]*>([\s\S]*)<\/svg>/.exec(t.replace(/<!--[\s\S]*?-->/g, ''))?.[1] ?? null) : null))
      .catch(() => null));
  }
  return cache.get(name);
}

export default function IconLayer({ layer }) {
  const [inner, setInner] = useState(null);
  useEffect(() => {
    let alive = true;
    loadIcon(layer.name).then(svg => { if (alive) setInner(svg); });
    return () => { alive = false; };
  }, [layer.name]);
  if (!inner) return null;
  const size = Math.min(layer.w, layer.h);
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke={layer.color || '#FFFFFF'} strokeWidth={layer.stroke || 2}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ position: 'absolute', left: (layer.w - size) / 2, top: (layer.h - size) / 2 }}
      // Trusted markup: lucide-static files served by our own backend.
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
