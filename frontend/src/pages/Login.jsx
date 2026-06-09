import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Loader2, ArrowRight, Zap, Layers, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || '';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

const FEATURES = [
  { icon: Zap, title: 'Instant generation', desc: 'Full deck in under 60 seconds', color: '#5B50FF' },
  { icon: Layers, title: 'AI art direction', desc: 'Every slide professionally designed', color: '#8B80FF' },
  { icon: TrendingUp, title: 'Strategy baked in', desc: 'Nova thinks like a McKinsey + Apple hybrid', color: '#6E63FF' },
];

function HBIcon({ size = 32 }) {
  return (
    <div
      style={{
        width: size, height: size,
        background: '#5B50FF',
        clipPath: 'polygon(0 0, 100% 0, 100% 78%, 78% 100%, 0 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, color: '#fff', fontSize: size * 0.38, letterSpacing: '-0.05em' }}>HB</span>
    </div>
  );
}

export default function Login() {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Show error if OAuth failed
  useState(() => {
    if (searchParams.get('error') === 'oauth') setError('Sign-in with that provider failed. Please try again or use email instead.');
  });

  const SOCIAL = [
    { id: 'google', label: 'Continue with Google', Icon: GoogleIcon },
  ];

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        window.location.replace('/dashboard');
      } else {
        await register(name, email, password);
        window.location.replace('/onboarding');
      }
    } catch (err) {
      const code = err.response?.data?.code;
      if (mode === 'login' && code === 'USER_NOT_FOUND') {
        setError('__no_account__');
      } else {
        const status = err.response?.status;
        setError(
          err.response?.data?.error ||
          (status === 429 ? `Too many attempts. Please wait ${err.response?.data?.retryAfter ?? 'a moment'} seconds and try again.` :
           status === 409 ? 'An account with that email already exists. Try signing in.' :
           mode === 'register' ? 'Could not create your account. Please check your details and try again.' :
           'Sign-in failed. Please check your email and password.')
        );
      }
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '6px',
    border: '1px solid #e8e8f0',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#0d0b1a',
    background: '#ffffff',
    outline: 'none',
    transition: 'border-color 0.15s',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: 'Inter, system-ui, sans-serif', background: '#f5f5f5' }}>

      {/* ── Left brand panel ── */}
      <div style={{
        display: 'none',
        flex: 1,
        flexDirection: 'column',
        padding: '40px',
        background: '#080808',
        position: 'relative',
        overflow: 'hidden',
      }}
        className="lg:flex"
      >
        {/* Subtle glow */}
        <div style={{
          position: 'absolute', top: '30%', left: '20%', width: '500px', height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(91,80,255,0.18) 0%, transparent 65%)',
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '20%', right: '10%', width: '300px', height: '300px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,128,255,0.12) 0%, transparent 65%)',
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HBIcon size={28} />
          <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '15px', color: '#f0f0ee', letterSpacing: '-0.02em' }}>HyperBeing</span>
        </div>

        {/* Hero copy */}
        <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: '420px', paddingTop: '16px', paddingBottom: '16px' }}>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', letterSpacing: '0.20em', color: '#5B50FF', textTransform: 'uppercase', marginBottom: '16px' }}>
              AI Presentation Maker
            </p>
            <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: '40px', fontWeight: 400, color: '#f0f0ee', lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: '16px' }}>
              Presentations that make people go{' '}
              <em style={{ color: '#8B80FF' }}>"wait, how?"</em>
            </h2>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px', color: 'rgba(240,240,238,0.5)', lineHeight: 1.65, marginBottom: '32px' }}>
              Nova designs every slide like a senior art director. You just describe what you need.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {FEATURES.map(({ icon: Icon, title, desc, color }, i) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '14px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '0.5px solid rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '6px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: color + '20',
                    border: `0.5px solid ${color}40`,
                  }}>
                    <Icon size={16} style={{ color }} />
                  </div>
                  <div>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '13px', color: '#f0f0ee' }}>{title}</p>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: 'rgba(240,240,238,0.4)', marginTop: '2px' }}>{desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Bottom quote */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontFamily: 'Playfair Display, Georgia, serif', fontStyle: 'italic', fontSize: '14px', color: 'rgba(240,240,238,0.3)' }}>
            "It's like Canva and a McKinsey consultant had a very talented baby."
          </p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: 'rgba(240,240,238,0.2)', marginTop: '4px' }}>— Someone who used to dread presentations</p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div style={{
        flex: 1, maxWidth: '480px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 32px', background: '#ffffff',
      }}
        className="flex-1 lg:max-w-[480px]"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          style={{ width: '100%', maxWidth: '360px' }}
        >
          {/* Mobile logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '32px' }}
               className="lg:hidden">
            <HBIcon size={26} />
            <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '15px', color: '#0d0b1a', letterSpacing: '-0.02em' }}>HyperBeing</span>
          </div>

          <h1 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: '28px', fontWeight: 400, color: '#0d0b1a', marginBottom: '4px', letterSpacing: '-0.02em' }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#6b6490', marginBottom: '28px' }}>
            {mode === 'login'
              ? 'Good to see you again. Nova missed you.'
              : 'Takes 30 seconds. No credit card.'}
          </p>

          {/* Toggle */}
          <div style={{
            display: 'flex', gap: '4px', padding: '4px',
            background: '#f5f5f5', borderRadius: '8px', marginBottom: '24px',
          }}>
            {['login', 'register'].map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                style={{
                  flex: 1, padding: '8px', borderRadius: '6px',
                  fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 500,
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  ...(mode === m
                    ? { background: '#ffffff', color: '#0d0b1a', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                    : { background: 'transparent', color: '#6b6490' }),
                }}
              >
                {m === 'login' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <AnimatePresence mode="wait">
              {mode === 'register' && (
                <motion.div
                  key="name-field"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <input
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    style={inputStyle}
                    onFocus={e => e.target.style.borderColor = '#5B50FF'}
                    onBlur={e => e.target.style.borderColor = '#e8e8f0'}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = '#5B50FF'}
              onBlur={e => e.target.style.borderColor = '#e8e8f0'}
            />

            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ ...inputStyle, paddingRight: '44px' }}
                onFocus={e => e.target.style.borderColor = '#5B50FF'}
                onBlur={e => e.target.style.borderColor = '#e8e8f0'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{
                  position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#6b6490', padding: 0,
                  display: 'flex', alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{
                    padding: '10px 14px', borderRadius: '6px',
                    background: 'rgba(239,68,68,0.06)',
                    border: '0.5px solid rgba(239,68,68,0.2)',
                    fontFamily: 'Inter, sans-serif', fontSize: '13px', textAlign: 'center',
                  }}
                >
                  {error === '__no_account__' ? (
                    <span style={{ color: '#ef4444' }}>
                      No account with that email.{' '}
                      <button
                        type="button"
                        onClick={() => { setMode('register'); setError(''); }}
                        style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 600, color: '#5B50FF', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                      >
                        Sign up instead →
                      </button>
                    </span>
                  ) : (
                    <span style={{ color: '#ef4444' }}>{error}</span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '12px', borderRadius: '6px',
                fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 600, color: '#ffffff',
                background: '#5B50FF', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                transition: 'background 0.15s, opacity 0.15s',
                opacity: loading ? 0.6 : 1,
                marginTop: '4px',
                boxShadow: 'rgba(91,80,255,0.2) 0px 4px 12px',
              }}
              onMouseEnter={e => { if (!loading) e.target.style.background = '#6E63FF'; }}
              onMouseLeave={e => { e.target.style.background = '#5B50FF'; }}
            >
              {loading ? (
                <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
              ) : (
                <>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={15} /></>
              )}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
            <div style={{ flex: 1, height: '0.5px', background: '#e8e8f0' }} />
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#6b6490' }}>or continue with</span>
            <div style={{ flex: 1, height: '0.5px', background: '#e8e8f0' }} />
          </div>

          {/* Social buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {SOCIAL.map(({ id, label, Icon }) => (
              <a
                key={id}
                href={`${API_BASE}/api/auth/${id}`}
                style={{
                  width: '100%', padding: '11px', borderRadius: '6px',
                  fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 500,
                  color: '#0d0b1a', background: '#ffffff',
                  border: '0.5px solid #e8e8f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  textDecoration: 'none', transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(91,80,255,0.3)'; e.currentTarget.style.background = '#fafaff'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e8e8f0'; e.currentTarget.style.background = '#ffffff'; }}
              >
                <Icon />
                {label}
              </a>
            ))}
          </div>

          {mode === 'register' && (
            <p style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#6b6490', marginTop: '24px' }}>
              By signing up you agree to our{' '}
              <Link to="/terms" style={{ color: '#5B50FF', textDecoration: 'underline' }}>Terms</Link>
              {' '}and{' '}
              <Link to="/privacy" style={{ color: '#5B50FF', textDecoration: 'underline' }}>Privacy Policy</Link>
            </p>
          )}
        </motion.div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (min-width: 1024px) {
          .lg\\:flex { display: flex !important; }
          .lg\\:hidden { display: none !important; }
          .lg\\:max-w-\\[480px\\] { max-width: 480px !important; }
        }
      `}</style>
    </div>
  );
}
