import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';

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
    if (stored && token) setUser(JSON.parse(stored));
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
    return data.user;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    localStorage.setItem('hb_token', data.token);
    localStorage.setItem('hb_refresh_token', data.refreshToken);
    localStorage.setItem('hb_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('hb_token');
    localStorage.removeItem('hb_refresh_token');
    localStorage.removeItem('hb_user');
    setUser(null);
    setSubscription(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    await api.delete('/auth/account');
    logout();
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, subscription, loading, login, register, logout, deleteAccount, refreshSubscription: fetchSubscription }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
