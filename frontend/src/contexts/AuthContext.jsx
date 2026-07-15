import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { capture, identifyUser, resetPostHog } from '../utils/posthog';
import { clearAuthStorage, markActive, isSessionExpiredByInactivity } from '../utils/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    try {
      const { data } = await api.get('/billing/subscription');
      setSubscription(data.subscription);
    } catch {
      setSubscription(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const stored = localStorage.getItem('hb_user');
      const token = localStorage.getItem('hb_token');

      // No cached session — nothing to validate.
      if (!stored || !token) {
        setLoading(false);
        return;
      }

      // Session went stale from inactivity — clean logout before showing authed UI.
      if (isSessionExpiredByInactivity()) {
        clearAuthStorage();
        resetPostHog();
        setLoading(false);
        return;
      }

      // Optimistically show the cached user so the UI isn't blank while we validate.
      try {
        const parsedUser = JSON.parse(stored);
        setUser(parsedUser);
        identifyUser(parsedUser);
      } catch {
        clearAuthStorage();
        setLoading(false);
        return;
      }

      // Validate the token with the server. The axios interceptor transparently
      // refreshes on 401; if refresh also fails it clears storage + redirects to
      // /login. If validation still throws here, drop the zombie session.
      try {
        const { data } = await api.get('/auth/me');
        if (cancelled) return;
        if (data?.user) {
          localStorage.setItem('hb_user', JSON.stringify(data.user));
          setUser(data.user);
          identifyUser(data.user);
        }
        markActive();
      } catch {
        if (cancelled) return;
        clearAuthStorage();
        setUser(null);
        resetPostHog();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (user) fetchSubscription();
    else setSubscription(null);
  }, [user?.id]);

  // Establishes the session from a successful auth response. Shared by login
  // and the one-time login-verification step.
  const establishSession = useCallback((data) => {
    localStorage.setItem('hb_token', data.token);
    localStorage.setItem('hb_refresh_token', data.refreshToken);
    localStorage.setItem('hb_user', JSON.stringify(data.user));
    markActive();
    setUser(data.user);
    identifyUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    // Legacy accounts that never verified their email get a one-time code
    // challenge instead of a session. The caller shows the code step and
    // finishes via verifyLogin. Returns the raw response so the flag is visible.
    if (data.requiresVerification) return data;
    establishSession(data);
    capture('user_logged_in', { method: 'email' });
    return data;
  }, [establishSession]);

  // Completes the one-time login verification and establishes the session.
  const verifyLogin = useCallback(async (email, code) => {
    const { data } = await api.post('/auth/verify-login', { email, code });
    establishSession(data);
    capture('user_logged_in', { method: 'email' });
    return data.user;
  }, [establishSession]);

  const resendLoginCode = useCallback(async (email) => {
    const { data } = await api.post('/auth/resend-login-code', { email });
    return data;
  }, []);

  // Step 1 of email signup: does NOT log the user in. The backend holds the
  // registration pending until the emailed code is confirmed via verifyEmail.
  // Returns { pendingVerification, email, devCode? } — devCode only appears when
  // email delivery isn't configured (local/mock mode) so signup stays testable.
  const register = useCallback(async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    return data;
  }, []);

  // Step 2: confirm the emailed code. On success this is the point the account
  // actually exists and the session is established.
  const verifyEmail = useCallback(async (email, code) => {
    const { data } = await api.post('/auth/verify-email', { email, code });
    localStorage.setItem('hb_token', data.token);
    localStorage.setItem('hb_refresh_token', data.refreshToken);
    localStorage.setItem('hb_user', JSON.stringify(data.user));
    markActive();
    setUser(data.user);
    identifyUser(data.user);
    capture('user_signed_up', { method: 'email' });
    return data.user;
  }, []);

  const resendCode = useCallback(async (email) => {
    const { data } = await api.post('/auth/resend-code', { email });
    return data;
  }, []);

  // Forgot-password step 1: email a reset code. Returns { ok, devCode? } — the
  // response is intentionally generic (never reveals whether the email exists).
  const forgotPassword = useCallback(async (email) => {
    const { data } = await api.post('/auth/forgot-password', { email });
    return data;
  }, []);

  // Forgot-password step 2: confirm the code and set the new password. Does not
  // establish a session — the user signs in with their new password afterward.
  const resetPassword = useCallback(async (email, code, newPassword) => {
    const { data } = await api.post('/auth/reset-password', { email, code, newPassword });
    return data;
  }, []);

  const logout = useCallback(() => {
    capture('user_logged_out');
    clearAuthStorage();
    setUser(null);
    setSubscription(null);
    resetPostHog();
  }, []);

  const deleteAccount = useCallback(async () => {
    capture('account_deleted');
    await api.delete('/auth/account');
    logout();
  }, [logout]);

  const setAuthUser = useCallback((userData) => {
    setUser(userData);
  }, []);

  // Enforce the inactivity timeout while the app is open: when the user returns
  // to the tab, log them out if they've been idle too long, otherwise refresh
  // their "last active" stamp.
  useEffect(() => {
    if (!user) return;
    function onActive() {
      if (document.visibilityState === 'hidden') return;
      if (isSessionExpiredByInactivity()) logout();
      else markActive();
    }
    window.addEventListener('visibilitychange', onActive);
    window.addEventListener('focus', onActive);
    return () => {
      window.removeEventListener('visibilitychange', onActive);
      window.removeEventListener('focus', onActive);
    };
  }, [user?.id, logout]);

  return (
    <AuthContext.Provider value={{ user, subscription, loading, login, verifyLogin, resendLoginCode, register, verifyEmail, resendCode, forgotPassword, resetPassword, logout, deleteAccount, setAuthUser, refreshSubscription: fetchSubscription }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
