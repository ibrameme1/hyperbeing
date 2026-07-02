// Shared auth-storage helpers. Keeps logout behaviour consistent between
// AuthContext (explicit logout) and the axios interceptor (forced logout on 401).

// Auto sign-out after this much inactivity, regardless of token lifetime.
export const INACTIVITY_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 hours

const LAST_ACTIVE_KEY = 'hb_last_active';

// Remove every auth-related key from local/session storage.
export function clearAuthStorage() {
  localStorage.removeItem('hb_token');
  localStorage.removeItem('hb_refresh_token');
  localStorage.removeItem('hb_user');
  localStorage.removeItem(LAST_ACTIVE_KEY);
  try {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith('hb_presentations_'))
      .forEach(k => sessionStorage.removeItem(k));
  } catch {}
}

// Record "user is active now" — call on login and on meaningful activity.
export function markActive() {
  try { localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch {}
}

// True when the last recorded activity is older than the inactivity limit.
export function isSessionExpiredByInactivity() {
  const last = Number(localStorage.getItem(LAST_ACTIVE_KEY));
  if (!last) return false; // no record yet — don't force logout on first run
  return Date.now() - last > INACTIVITY_LIMIT_MS;
}
