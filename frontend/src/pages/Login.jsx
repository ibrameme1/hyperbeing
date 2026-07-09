import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Loader2, ArrowRight, Zap, Layers, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams, Link } from 'react-router-dom';
import Logo from '../components/Logo';
import NovaMascot from '../components/NovaMascot';

const API_BASE = import.meta.env.VITE_API_URL || '';

const BRAND_FEATURES = [
  { icon: Zap, title: 'Instant generation', desc: 'A full deck in under 3 minutes', color: '#5B50FF' },
  { icon: Layers, title: 'AI art direction', desc: 'Every slide professionally designed', color: '#8B5CF6' },
  { icon: TrendingUp, title: 'Strategy baked in', desc: 'Nova thinks like a McKinsey + Apple hybrid', color: '#22c55e' },
];

function BrandFeature({ icon: Icon, title, desc, color }) {
  return (
    <div
      className="flex items-center gap-3"
      style={{ background: '#ffffff', border: '0.5px solid #e8e8f0', borderRadius: '10px', padding: '12px 14px' }}
    >
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{ width: 36, height: 36, borderRadius: '8px', background: `${color}14`, border: `1px solid ${color}33` }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 13, color: '#0d0b1a' }}>{title}</p>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#6b6490', marginTop: 2 }}>{desc}</p>
      </div>
    </div>
  );
}

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

export default function Login() {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Email-verification step (shown after a successful email sign-up, before onboarding)
  const [pendingEmail, setPendingEmail] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resendNote, setResendNote] = useState('');

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const { login, register, verifyEmail, resendCode } = useAuth();
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
        // Sign-up no longer logs in immediately — it emails a code and we move
        // to the verification step. The account is created only after verify.
        const data = await register(name, email, password);
        setPendingEmail(data.email || email.toLowerCase());
        setCode('');
        setResendNote(
          data.devCode
            ? `Email delivery isn't configured — your code is ${data.devCode}`
            : ''
        );
      }
    } catch (err) {
      // The backend intentionally returns one identical message for unknown
      // email vs wrong password (prevents account enumeration), so there is
      // no "no account — sign up instead" special case anymore.
      const status = err.response?.status;
      setError(
        err.response?.data?.error ||
        (status === 429 ? `Too many attempts. Please wait ${err.response?.data?.retryAfter ?? 'a moment'} seconds and try again.` :
         status === 409 ? 'An account with that email already exists. Try signing in.' :
         mode === 'register' ? 'Could not create your account. Please check your details and try again.' :
         'Sign-in failed. Please check your email and password.')
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    setVerifying(true);
    try {
      await verifyEmail(pendingEmail, code.trim());
      window.location.replace('/onboarding');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not verify that code. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    setError('');
    setResendNote('');
    try {
      const data = await resendCode(pendingEmail);
      setResendNote(
        data.devCode
          ? `Email delivery isn't configured — your code is ${data.devCode}`
          : 'A new code is on its way to your inbox.'
      );
    } catch (err) {
      setError(err.response?.data?.error || 'Could not resend the code. Please try again.');
    }
  }

  const inputStyle = {
    fontFamily: 'Inter, sans-serif',
    background: '#ffffff',
    color: '#0d0b1a',
    border: '1px solid #e8e8f0',
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#f5f5f5' }}>
      {/* ── Left brand panel (desktop only) ── */}
      <div className="hidden lg:flex lg:flex-1 lg:flex-col relative overflow-hidden" style={{ padding: '48px' }}>
        {/* Atmospheric glow, matching the homepage hero */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 30% 20%, rgba(91,80,255,0.10), transparent 60%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <Link to="/" style={{ display: 'inline-flex', textDecoration: 'none' }}>
            <Logo height={36} />
          </Link>
        </div>

        <div className="flex-1 flex flex-col justify-center" style={{ position: 'relative', zIndex: 1, maxWidth: '460px' }}>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', letterSpacing: '0.20em', color: '#5B50FF', textTransform: 'uppercase', marginBottom: '16px' }}>
            AI Presentation Maker
          </p>
          <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(32px, 3.4vw, 44px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0d0b1a', marginBottom: '16px' }}>
            Presentations that make people go <em>"how?"</em>
          </h2>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px', color: '#3d3660', lineHeight: 1.65, marginBottom: '32px' }}>
            Nova designs every slide like a senior art director. You just describe what you need.
          </p>
          <div className="flex flex-col gap-2.5">
            {BRAND_FEATURES.map(f => <BrandFeature key={f.title} {...f} />)}
          </div>
        </div>

        <div
          className="flex items-center gap-4"
          style={{
            position: 'relative', zIndex: 1,
            background: '#0f0f0f',
            border: '0.5px solid #1e1e1e',
            borderRadius: '14px',
            padding: '20px 24px',
            boxShadow: 'rgba(91,80,255,0.10) 0px 0px 48px -12px',
          }}
        >
          <NovaMascot size={64} />
          <div>
            <p style={{ fontFamily: 'Playfair Display, Georgia, serif', fontStyle: 'italic', fontSize: '15px', color: '#f0f0ee', lineHeight: 1.4 }}>
              "It's like Canva and a McKinsey consultant had a very talented baby."
            </p>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#999', marginTop: '4px' }}>
              — Someone who used to dread presentations
            </p>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 lg:max-w-[480px] lg:flex-shrink-0 flex items-center justify-center px-4 py-10 lg:border-l lg:border-[#e8e8f0] lg:bg-white">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[420px]"
        style={{
          background: '#ffffff',
          border: '0.5px solid #e8e8f0',
          borderRadius: '8px',
          boxShadow: 'rgba(91,80,255,0.06) 0px 4px 16px',
          padding: '40px',
        }}
      >
        {/* Logo */}
        <div className="flex justify-center mb-6 lg:hidden">
          <Link to="/" style={{ display: 'inline-flex', textDecoration: 'none' }}>
            <Logo height={36} />
          </Link>
        </div>

        {pendingEmail ? (
          <>
            <h1
              className="text-center mb-1"
              style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: '32px', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#0d0b1a' }}
            >
              Check your email
            </h1>
            <p className="text-center text-sm mb-6" style={{ fontFamily: 'Inter, sans-serif', color: '#6b6490' }}>
              We sent a 6-digit code to <span style={{ color: '#0d0b1a', fontWeight: 600 }}>{pendingEmail}</span>. Enter it below to finish signing up.
            </p>

            <form onSubmit={handleVerify} className="space-y-3">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter 6-digit code"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                className="w-full px-4 py-3 text-sm text-center tracking-[0.4em] focus:outline-none transition-all duration-200"
                style={{ ...inputStyle, borderRadius: '6px' }}
                onFocus={e => { e.target.style.borderColor = '#5B50FF'; e.target.style.boxShadow = '0 0 0 3px rgba(91,80,255,0.35)'; }}
                onBlur={e => { e.target.style.borderColor = '#e8e8f0'; e.target.style.boxShadow = 'none'; }}
              />

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="py-2.5 px-4 text-xs text-center"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', fontFamily: 'Inter, sans-serif' }}
                  >
                    <span style={{ color: '#ef4444' }}>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {resendNote && (
                <p className="text-center text-xs" style={{ fontFamily: 'Inter, sans-serif', color: '#6b6490' }}>{resendNote}</p>
              )}

              <button
                type="submit"
                disabled={verifying || code.length < 6}
                className="w-full py-3 font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] mt-2 disabled:opacity-60"
                style={{ fontFamily: 'Inter, sans-serif', background: '#5B50FF', borderRadius: '6px', boxShadow: 'rgba(91,80,255,0.20) 0px 0px 24px 0px' }}
                onMouseEnter={e => { if (!verifying && code.length >= 6) e.currentTarget.style.background = '#6E63FF'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#5B50FF'; }}
              >
                {verifying ? (<><Loader2 size={16} className="animate-spin" /> Verifying…</>) : (<>Verify & continue <ArrowRight size={15} /></>)}
              </button>
            </form>

            <p className="text-center text-xs mt-6" style={{ fontFamily: 'Inter, sans-serif', color: '#6b6490' }}>
              Didn't get it?{' '}
              <button type="button" onClick={handleResend} className="underline" style={{ color: '#5B50FF' }}>Resend code</button>
              {' · '}
              <button
                type="button"
                onClick={() => { setPendingEmail(''); setCode(''); setError(''); setResendNote(''); }}
                className="underline"
                style={{ color: '#6b6490' }}
              >
                Use a different email
              </button>
            </p>
          </>
        ) : (
        <>
        <h1
          className="text-center mb-1"
          style={{
            fontFamily: 'Playfair Display, Georgia, serif',
            fontSize: '32px',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            color: '#0d0b1a',
          }}
        >
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-center text-sm mb-6" style={{ fontFamily: 'Inter, sans-serif', color: '#6b6490' }}>
          {mode === 'login'
            ? 'Good to see you again. Nova missed you.'
            : 'Takes 30 seconds. No credit card.'}
        </p>

        {/* Toggle */}
        <div className="flex gap-1 p-1 mb-6" style={{ background: '#f5f5f5', borderRadius: '8px' }}>
          {['login', 'register'].map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); setEmailError(''); setPasswordError(''); }}
              className="flex-1 py-2.5 text-sm font-semibold transition-all duration-200"
              style={mode === m
                ? { background: '#ffffff', color: '#0d0b1a', borderRadius: '6px', boxShadow: 'rgba(91,80,255,0.06) 0px 4px 16px' }
                : { color: '#6b6490', borderRadius: '6px', fontFamily: 'Inter, sans-serif' }}
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
                  className="w-full px-4 py-3 text-sm focus:outline-none transition-all duration-200"
                  style={{ ...inputStyle, borderRadius: '6px' }}
                  onFocus={e => { e.target.style.borderColor = '#5B50FF'; e.target.style.boxShadow = '0 0 0 3px rgba(91,80,255,0.35)'; }}
                  onBlur={e => { e.target.style.borderColor = '#e8e8f0'; e.target.style.boxShadow = 'none'; }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 text-sm focus:outline-none transition-all duration-200"
              style={{ ...inputStyle, borderRadius: '6px' }}
              onFocus={e => { e.target.style.borderColor = '#5B50FF'; e.target.style.boxShadow = '0 0 0 3px rgba(91,80,255,0.35)'; setEmailError(''); }}
              onBlur={e => {
                e.target.style.borderColor = '#e8e8f0';
                e.target.style.boxShadow = 'none';
                if (email && !EMAIL_RE.test(email)) setEmailError('Enter a valid email address.');
              }}
            />
            {emailError && (
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#ef4444', marginTop: 4 }}>{emailError}</p>
            )}
          </div>

          <div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 pr-12 text-sm focus:outline-none transition-all duration-200"
                style={{ ...inputStyle, borderRadius: '6px' }}
                onFocus={e => { e.target.style.borderColor = '#5B50FF'; e.target.style.boxShadow = '0 0 0 3px rgba(91,80,255,0.35)'; setPasswordError(''); }}
                onBlur={e => {
                  e.target.style.borderColor = '#e8e8f0';
                  e.target.style.boxShadow = 'none';
                  if (mode === 'register' && password && password.length < 8) setPasswordError('Password must be at least 8 characters.');
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: '#6b6490' }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passwordError && (
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#ef4444', marginTop: 4 }}>{passwordError}</p>
            )}
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="py-2.5 px-4 text-xs text-center"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', fontFamily: 'Inter, sans-serif' }}
              >
                <span style={{ color: '#ef4444' }}>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] mt-2 disabled:opacity-60"
            style={{
              fontFamily: 'Inter, sans-serif',
              background: '#5B50FF',
              borderRadius: '6px',
              boxShadow: 'rgba(91,80,255,0.20) 0px 0px 24px 0px',
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#6E63FF'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#5B50FF'; }}
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
          <div className="flex-1 h-px" style={{ background: '#e8e8f0' }} />
          <span className="text-xs font-medium" style={{ fontFamily: 'Inter, sans-serif', color: '#6b6490' }}>or continue with</span>
          <div className="flex-1 h-px" style={{ background: '#e8e8f0' }} />
        </div>

        {/* Social buttons */}
        <div className="space-y-2.5">
          {SOCIAL.map(({ id, label, Icon }) => (
            <a
              key={id}
              href={`${API_BASE}/api/auth/${id}`}
              className="w-full py-3 font-semibold text-sm flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.98]"
              style={{
                fontFamily: 'Inter, sans-serif',
                background: '#ffffff',
                border: '1px solid #e8e8f0',
                borderRadius: '6px',
                color: '#0d0b1a',
              }}
            >
              <Icon />
              {label}
            </a>
          ))}
        </div>

        {mode === 'register' && (
          <p className="text-center text-xs mt-6" style={{ fontFamily: 'Inter, sans-serif', color: '#6b6490' }}>
            By signing up you agree to our{' '}
            <Link to="/terms" className="underline" style={{ color: '#5B50FF' }}>Terms</Link>
            {' '}and{' '}
            <Link to="/privacy" className="underline" style={{ color: '#5B50FF' }}>Privacy Policy</Link>
          </p>
        )}
        </>
        )}
      </motion.div>
      </div>
    </div>
  );
}
