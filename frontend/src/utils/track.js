const SESSION_KEY = 'hb_session_id';

function getSessionId() {
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

export function track(eventType, metadata = {}) {
  const body = {
    event_type: eventType,
    page: window.location.pathname,
    session_id: getSessionId(),
    metadata,
  };

  const token = localStorage.getItem('hb_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const base = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
  fetch(`${base}/analytics/track`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }).catch(() => { /* fire-and-forget, never surface errors */ });
}

export function usePageTracking(pageName) {
  const start = Date.now();
  track('page_view', { page_name: pageName });

  return () => {
    track('page_exit', { page_name: pageName, duration_ms: Date.now() - start });
  };
}
