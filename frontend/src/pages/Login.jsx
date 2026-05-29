import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Eye, EyeOff, Loader2, ArrowRight, Zap, Layers, TrendingUp } from 'lucide-react';
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

function MetaIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" fill="#1877F2"/>
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.75a8.17 8.17 0 004.78 1.52V6.82a4.85 4.85 0 01-1.01-.13z"/>
    </svg>
  );
}

const FEATURES = [
  { icon: Zap, title: 'Instant generation', desc: 'Full deck in under 60 seconds', color: '#8B5CF6' },
  { icon: Layers, title: 'AI art direction', desc: 'Every slide professionally designed', color: '#00F0FF' },
  { icon: TrendingUp, title: 'Strategy baked in', desc: 'Nova thinks like a McKinsey + Apple hybrid', color: '#00D4FF' },
];

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
    { id: 'google', label: 'Continue with Google', Icon: GoogleIcon, bg: '#fff', border: '#E2E0EC', color: '#18132E' },
  ];

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        navigate('/dashboard');
      } else {
        await register(name, email, password);
        navigate('/onboarding');
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

  return (
    <div className="min-h-screen flex" style={{ background: '#0A0A0B' }}>

      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden flex-col p-10"
           style={{ background: 'linear-gradient(145deg, #0A0A0B 0%, #111113 50%, #0E0B1F 100%)' }}>

        {/* Aurora blobs */}
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full animate-aurora"
             style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 65%)', filter: 'blur(40px)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full animate-aurora-2"
             style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.20) 0%, transparent 65%)', filter: 'blur(40px)' }} />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full animate-aurora-3"
             style={{ background: 'radial-gradient(circle, rgba(0,212,255,0.12) 0%, transparent 65%)', filter: 'blur(40px)' }} />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}>
              <Sparkles size={18} className="text-white" />
            </div>
            <span className="text-white font-bold text-xl tracking-tight">HyperBeing</span>
          </div>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 max-w-md flex-1 flex flex-col justify-center py-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-4"
               style={{ color: '#8B5CF6' }}>AI Presentation Maker</p>
            <h2 className="font-display text-4xl font-bold text-white leading-tight mb-4">
              Presentations that make people go{' '}
              <span style={{
                background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                "wait, how?"
              </span>
            </h2>
            <p className="text-white/50 text-lg leading-relaxed mb-6">
              Nova designs every slide like a senior art director. You just describe what you need.
            </p>

            <div className="space-y-3">
              {FEATURES.map(({ icon: Icon, title, desc, color }, i) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center gap-3 p-3.5 rounded-2xl"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{ background: color + '20', border: `1px solid ${color}40` }}>
                    <Icon size={16} style={{ color }} />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{title}</p>
                    <p className="text-white/40 text-xs mt-0.5">{desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Bottom quote */}
        <div className="relative z-10">
          <p className="text-white/30 text-sm italic">
            "It's like Canva and a McKinsey consultant had a very talented baby."
          </p>
          <p className="text-white/20 text-xs mt-1">— Someone who used to dread presentations</p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 lg:max-w-[480px] flex items-center justify-center p-6 lg:p-8"
           style={{ background: 'var(--bg-page)' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}>
              <Sparkles size={16} className="text-white" />
            </div>
            <span className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>HyperBeing</span>
          </div>

          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            {mode === 'login'
              ? 'Good to see you again. Nova missed you.'
              : 'Takes 30 seconds. No credit card.'}
          </p>

          {/* Toggle */}
          <div className="flex gap-1 p-1 rounded-2xl mb-6"
               style={{ background: 'var(--bg-input)' }}>
            {['login', 'register'].map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200`}
                style={mode === m
                  ? { background: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }
                  : { color: 'var(--text-muted)' }}
              >
                {m === 'login' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <AnimatePresence mode="wait">
              {mode === 'register' && (
                <motion.div
                  key="name-field"
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <input
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    className="w-full px-4 py-3.5 rounded-2xl text-sm focus:outline-none transition-all duration-200 border-2"
                    style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', borderColor: 'var(--border)', boxShadow: '0 1px 4px rgba(139,92,246,0.06)' }}
                    onFocus={e => e.target.style.borderColor = '#8B5CF6'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
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
              className="w-full px-4 py-3.5 rounded-2xl text-sm focus:outline-none transition-all duration-200 border-2"
              style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', borderColor: 'var(--border)', boxShadow: '0 1px 4px rgba(139,92,246,0.06)' }}
              onFocus={e => e.target.style.borderColor = '#8B5CF6'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3.5 pr-12 rounded-2xl text-sm focus:outline-none transition-all duration-200 border-2"
                style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', borderColor: 'var(--border)', boxShadow: '0 1px 4px rgba(139,92,246,0.06)' }}
                onFocus={e => e.target.style.borderColor = '#8B5CF6'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: 'var(--text-muted)' }}
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
                  className="py-2.5 px-4 rounded-xl text-xs text-center"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  {error === '__no_account__' ? (
                    <span style={{ color: '#f87171' }}>
                      No account with that email.{' '}
                      <button
                        type="button"
                        onClick={() => { setMode('register'); setError(''); }}
                        className="underline font-semibold"
                        style={{ color: '#8B5CF6' }}
                      >
                        Sign up instead →
                      </button>
                    </span>
                  ) : (
                    <span className="text-red-400">{error}</span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] mt-2 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)',
                boxShadow: '0 4px 24px rgba(139,92,246,0.35)',
              }}
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
              ) : (
                <>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={15} /></>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>or continue with</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>

          {/* Social buttons */}
          <div className="space-y-2.5">
            {SOCIAL.map(({ id, label, Icon, bg, border, color }) => (
              <a
                key={id}
                href={`${API_BASE}/api/auth/${id}`}
                className="w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.97] border-2"
                style={{ background: bg, borderColor: border, color, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
              >
                <Icon />
                {label}
              </a>
            ))}
          </div>

          {mode === 'register' && (
            <p className="text-center text-xs mt-6" style={{ color: 'var(--text-secondary)' }}>
              By signing up you agree to our{' '}
              <Link to="/terms" className="underline" style={{ color: '#8B5CF6' }}>Terms</Link>
              {' '}and{' '}
              <Link to="/privacy" className="underline" style={{ color: '#8B5CF6' }}>Privacy Policy</Link>
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
