import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  timeout: 300000,
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('hb_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem('hb_refresh_token');
      if (refreshToken) {
        try {
          const { data } = await api.post('/auth/refresh', { refreshToken });
          localStorage.setItem('hb_token', data.token);
          localStorage.setItem('hb_refresh_token', data.refreshToken);
          original.headers.Authorization = `Bearer ${data.token}`;
          return api(original);
        } catch {
          // refresh failed — fall through to logout
        }
      }
      localStorage.removeItem('hb_token');
      localStorage.removeItem('hb_refresh_token');
      localStorage.removeItem('hb_user');
      try {
        Object.keys(sessionStorage)
          .filter(k => k.startsWith('hb_presentations_'))
          .forEach(k => sessionStorage.removeItem(k));
      } catch {}
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
