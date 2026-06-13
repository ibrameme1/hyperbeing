import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { capture, identifyUser } from '../utils/posthog';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setAuthUser } = useAuth();

  useEffect(() => {
    const token = params.get('token');
    const isNew = params.get('new') === 'true';
    const error = params.get('error');

    if (error || !token) {
      navigate('/login?error=oauth');
      return;
    }

    localStorage.setItem('hb_token', token);
    const refresh = params.get('refresh');
    if (refresh) localStorage.setItem('hb_refresh_token', refresh);

    // Fetch user info, update context state, then route
    fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(({ user }) => {
        if (user) {
          localStorage.setItem('hb_user', JSON.stringify(user));
          setAuthUser(user);
          identifyUser(user);
          capture(isNew ? 'user_signed_up' : 'user_logged_in', { method: 'google' });
        }
        navigate(isNew ? '/onboarding' : '/dashboard', { replace: true });
      })
      .catch(() => navigate('/dashboard', { replace: true }));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #1e1e1e', borderTopColor: '#5B50FF', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#555555', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Signing you in…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
