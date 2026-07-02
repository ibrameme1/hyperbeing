import api from '../api/client';

// EventSource can't send Authorization headers, so these streams pass the token
// as a query param and never go through the axios refresh/logout interceptor.
// This helper wraps an EventSource so that when the server hard-rejects the
// connection (e.g. expired token → the browser marks it CLOSED), we verify the
// session via /auth/me (which transparently refreshes, or clears + redirects to
// /login on failure) and reconnect with a fresh token instead of failing silently.
export function openAuthedEventSource(buildUrl, { onMessage, onOpen, onTransientError } = {}) {
  let es = null;
  let closed = false;
  let reauthing = false;
  let retries = 0;

  function connect() {
    if (closed) return;
    const token = localStorage.getItem('hb_token');
    if (!token) return; // logged out — nothing to connect
    es = new EventSource(buildUrl(token));
    if (onOpen) es.onopen = onOpen;
    if (onMessage) es.onmessage = onMessage;
    es.onerror = async () => {
      if (closed || reauthing) return;
      // Transient network blips leave readyState CONNECTING and auto-retry;
      // only intervene when the browser gave up (CLOSED = server rejected).
      if (es.readyState !== EventSource.CLOSED) { onTransientError?.(); return; }
      reauthing = true;
      es.close();
      try {
        await api.get('/auth/me'); // refreshes via interceptor, or redirects to /login
        reauthing = false;
        if (!closed && retries++ < 3) connect();
      } catch {
        closed = true; // interceptor already cleared storage + redirected
      }
    };
  }

  connect();
  return { close() { closed = true; es?.close(); } };
}
