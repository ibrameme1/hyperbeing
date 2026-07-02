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

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('hb_token', data.token);
    localStorage.setItem('hb_refresh_token', data.refreshToken);
    localStorage.setItem('hb_user', JSON.stringify(data.user));
    markActive();
    setUser(data.user);
    identifyUser(data.user);
    capture('user_logged_in', { method: 'email' });
    return data.user;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    localStorage.setItem('hb_token', data.token);
    localStorage.setItem('hb_refresh_token', data.refreshToken);
    localStorage.setItem('hb_user', JSON.stringify(data.user));
    markActive();
    setUser(data.user);
    identifyUser(data.user);
    capture('user_signed_up', { method: 'email' });
    return data.user;
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
    <AuthContext.Provider value={{ user, subscription, loading, login, register, logout, deleteAccount, setAuthUser, refreshSubscription: fetchSubscription }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
