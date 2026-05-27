import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    const isNew = params.get('new') === 'true';
    const error = params.get('error');

    if (error || !token) {
      navigate('/login?error=oauth');
      return;
    }

    localStorage.setItem('hb_token', token);

    // Fetch user info then route
    fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(({ user }) => {
        if (user) localStorage.setItem('hb_user', JSON.stringify(user));
        navigate(isNew ? '/onboarding' : '/dashboard', { replace: true });
      })
      .catch(() => navigate('/dashboard', { replace: true }));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0812' }}>
      <div className="text-center">
        <Loader2 size={32} className="animate-spin mx-auto mb-4" style={{ color: '#7B5EFF' }} />
        <p className="text-white/50 text-sm">Signing you in…</p>
      </div>
    </div>
  );
}
