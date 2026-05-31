import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

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
        }
        navigate(isNew ? '/onboarding' : '/dashboard', { replace: true });
      })
      .catch(() => navigate('/dashboard', { replace: true }));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0A0B' }}>
      <div className="text-center">
        <Loader2 size={32} className="animate-spin mx-auto mb-4" style={{ color: '#8B5CF6' }} />
        <p className="text-white/50 text-sm">Signing you in…</p>
      </div>
    </div>
  );
}
