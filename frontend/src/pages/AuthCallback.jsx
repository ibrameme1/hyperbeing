import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { capture, identifyUser } from '../utils/posthog';
import { markActive } from '../utils/auth';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuthUser } = useAuth();

  useEffect(() => {
    // Tokens arrive in the URL FRAGMENT (#token=…) so they never reach server
    // logs or Referer headers. Query params are kept as a fallback for any
    // redirect issued by an older backend during deploys.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const params = { get: (k) => hashParams.get(k) ?? searchParams.get(k) };

    const token = params.get('token');
    const isNew = params.get('new') === 'true';
    const error = params.get('error');

    if (error || !token) {
      navigate('/login?error=oauth');
      return;
    }

    // Scrub the fragment so tokens don't sit in the address bar / history.
    try { window.history.replaceState(null, '', window.location.pathname); } catch {}

    localStorage.setItem('hb_token', token);
    const refresh = params.get('refresh');
    if (refresh) localStorage.setItem('hb_refresh_token', refresh);
    markActive();

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
