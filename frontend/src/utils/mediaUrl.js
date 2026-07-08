// Resolves a slide/version `image_data` value to something an <img> can load.
//
// Since GAPS #7, real slide images live on the server's disk and `image_data`
// holds a relative, tokenless API URL (e.g. /api/presentations/:id/slides/:i/image?f=…).
// Inline values — svg placeholders (data:image/svg…) and any other data: URL —
// are returned untouched. Relative API URLs get the access token appended,
// because <img> tags can't send an Authorization header (same approach as the
// dashboard thumbnail and the SSE streams).
export function mediaUrl(imageData) {
  if (!imageData) return imageData;
  if (imageData.startsWith('data:')) return imageData; // inline (placeholder/legacy)
  const base = import.meta.env.VITE_API_URL || '';
  const token = localStorage.getItem('hb_token') || '';
  const sep = imageData.includes('?') ? '&' : '?';
  // Absolute URL already (shouldn't happen today) → leave host as-is.
  const path = imageData.startsWith('http') ? imageData : `${base}${imageData}`;
  return `${path}${sep}token=${encodeURIComponent(token)}`;
}

// True when the value is a real image (not empty and not an svg placeholder).
// Works for both inline data URLs and stored API URLs.
export function isRealImage(imageData) {
  return !!imageData && !imageData.startsWith('data:image/svg');
}
