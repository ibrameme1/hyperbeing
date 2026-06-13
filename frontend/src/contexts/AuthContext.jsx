import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { capture, identifyUser, resetPostHog } from '../utils/posthog';

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
    const stored = localStorage.getItem('hb_user');
    const token = localStorage.getItem('hb_token');
    if (stored && token) {
      const parsedUser = JSON.parse(stored);
      setUser(parsedUser);
      identifyUser(parsedUser);
    }
    setLoading(false);
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
    setUser(data.user);
    identifyUser(data.user);
    capture('user_signed_up', { method: 'email' });
    return data.user;
  }, []);

  const logout = useCallback(() => {
    capture('user_logged_out');
    localStorage.removeItem('hb_token');
    localStorage.removeItem('hb_refresh_token');
    localStorage.removeItem('hb_user');
    try {
      Object.keys(sessionStorage)
        .filter(k => k.startsWith('hb_presentations_'))
        .forEach(k => sessionStorage.removeItem(k));
    } catch {}
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
