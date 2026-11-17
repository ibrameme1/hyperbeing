import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Loader2, ArrowRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams, Link } from 'react-router-dom';
import { thumb, SLIDE_ALT } from './landingData';
import './landing.css';
import './auth.css';
import Nova from '../components/nova/Nova';

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

export default function Login() {
  // /login?mode=signup (every "Start free" link) opens on the sign-up tab.
  const [mode, setMode] = useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'signup' ? 'register' : 'login'
  ));
  // Which field has focus, so Nova can react to it (watch the email, look
  // away from the password).
  const [focusField, setFocusField] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Email-verification step. Shown after a successful email sign-up (before
  // onboarding), and for legacy accounts on their one-time first sign-in check.
  const [pendingEmail, setPendingEmail] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resendNote, setResendNote] = useState('');
  const [verifyContext, setVerifyContext] = useState('signup'); // 'signup' | 'login'

  // Forgot-password flow (independent of the sign-up/login verification above).
  // 'request' → enter email & send code; 'reset' → enter code + new password.
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState('request'); // 'request' | 'reset' | 'done'
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPw, setForgotNewPw] = useState('');
  const [forgotConfirmPw, setForgotConfirmPw] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotNote, setForgotNote] = useState('');
  const [showForgotPw, setShowForgotPw] = useState(false);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const { login, verifyLogin, resendLoginCode, register, verifyEmail, resendCode, forgotPassword, resetPassword } = useAuth();
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
        const data = await login(email, password);
        // Legacy accounts hit a one-time verification step before the session.
        if (data.requiresVerification) {
          setVerifyContext('login');
          setPendingEmail(data.email || email.toLowerCase());
          setCode('');
          setResendNote(
            data.devCode ? `Email delivery isn't configured — your code is ${data.devCode}` : ''
          );
        } else {
          window.location.replace('/dashboard');
        }
      } else {
        // Sign-up no longer logs in immediately — it emails a code and we move
        // to the verification step. The account is created only after verify.
        const data = await register(name, email, password);
        setVerifyContext('signup');
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
      if (verifyContext === 'login') {
        await verifyLogin(pendingEmail, code.trim());
        window.location.replace('/dashboard');
      } else {
        await verifyEmail(pendingEmail, code.trim());
        window.location.replace('/onboarding');
      }
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
      const data = verifyContext === 'login'
        ? await resendLoginCode(pendingEmail)
        : await resendCode(pendingEmail);
      setResendNote(
        data.devCode
          ? `Email delivery isn't configured — your code is ${data.devCode}`
          : 'A new code is on its way to your inbox.'
      );
    } catch (err) {
      setError(err.response?.data?.error || 'Could not resend the code. Please try again.');
    }
  }

  function openForgot() {
    setForgotOpen(true);
    setForgotStep('request');
    setForgotEmail(email);
    setForgotCode('');
    setForgotNewPw('');
    setForgotConfirmPw('');
    setForgotError('');
    setForgotNote('');
  }

  function closeForgot() {
    setForgotOpen(false);
    setForgotError('');
    setForgotNote('');
  }

  async function handleForgotRequest(e) {
    e.preventDefault();
    setForgotError('');
    if (!EMAIL_RE.test(forgotEmail.trim())) { setForgotError('Enter a valid email address.'); return; }
    setForgotBusy(true);
    try {
      const data = await forgotPassword(forgotEmail.trim());
      setForgotStep('reset');
      setForgotNote(
        data.devCode
          ? `Email delivery isn't configured — your code is ${data.devCode}`
          : "If an account exists for that email, a reset code is on its way. Enter it below."
      );
    } catch (err) {
      const status = err.response?.status;
      setForgotError(
        err.response?.data?.error ||
        (status === 429 ? `Too many attempts. Please wait ${err.response?.data?.retryAfter ?? 'a moment'} seconds and try again.` :
         'Could not send a reset code. Please try again.')
      );
    } finally {
      setForgotBusy(false);
    }
  }

  async function handleForgotReset(e) {
    e.preventDefault();
    setForgotError('');
    if (forgotNewPw.length < 8) { setForgotError('New password must be at least 8 characters.'); return; }
    if (forgotNewPw !== forgotConfirmPw) { setForgotError('Passwords do not match.'); return; }
    setForgotBusy(true);
    try {
      await resetPassword(forgotEmail.trim(), forgotCode.trim(), forgotNewPw);
      setForgotStep('done');
    } catch (err) {
      setForgotError(err.response?.data?.error || 'Could not reset your password. Please try again.');
    } finally {
      setForgotBusy(false);
    }
  }

  async function handleForgotResend() {
    setForgotError('');
    setForgotNote('');
    try {
      const data = await forgotPassword(forgotEmail.trim());
      setForgotNote(
        data.devCode
          ? `Email delivery isn't configured — your code is ${data.devCode}`
          : 'A new code is on its way to your inbox.'
      );
    } catch (err) {
      setForgotError(err.response?.data?.error || 'Could not resend the code. Please try again.');
    }
  }

  const inputStyle = {
    fontFamily: 'Inter, sans-serif',
    background: 'rgba(255,255,255,0.04)',
    color: '#F1F6F9',
    border: '1px solid rgba(190,225,245,0.14)',
  };

  // Nova's reaction to the form. Shy (eyes closed) while a hidden password
  // is typed, worried on an error, thinking while a request is in flight,
  // delighted once we're waiting on the email code.
  const novaMood =
    error || emailError || passwordError || forgotError ? 'sad'
      : loading || verifying || forgotBusy ? 'think'
      : pendingEmail || forgotStep === 'done' ? 'happy'
      : focusField === 'password' && !showPassword ? 'shy'
      : mode === 'register' && !focusField && !name && !email ? 'wave'
      : 'idle';
  // While typing, her eyes follow the text along the field.
  const typed = focusField === 'email' ? email.length : focusField === 'name' ? name.length : -1;
  const novaLook = typed >= 0 ? { x: Math.min(1, typed / 28) * 1.6 - 0.8, y: 0.9 } : null;

  return (
    // Same stage as the landing page (.lp tokens, lit from below) so moving
    // from "Start free" to this form feels like one product, not a new site.
    <motion.div
      className="lp lp-auth"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="auth-light" aria-hidden="true" />
      <header className="auth-top wrap">
        <Link to="/" className="logo" aria-label="HyperBeing home"><b>HB</b>HyperBeing</Link>
        <Link to="/" className="auth-back"><ArrowLeft size={15} /> Back to home</Link>
      </header>

      <div className="auth-grid wrap">
        {/* ── Pitch (desktop only): the landing hero, condensed ── */}
        <section className="auth-pitch" aria-hidden="true">
          <span className="eyebrow">AI presentation studio</span>
          <h2>Presentations that make people go <em>how?</em></h2>
          <p className="lede">Give Nova your brief. Every slide comes back art-directed, with a real argument and text you can still edit.</p>
          <div className="auth-fan">
            {['s23', 's06', 's20'].map((id, i) => (
              <div key={id} className={'gp ' + ['l', 'c', 'r'][i]}><div className="frame"><img src={thumb(id)} alt={SLIDE_ALT[id]} width="640" height="357" /></div></div>
            ))}
          </div>
        </section>

        {/* ── Form ── */}
        <div className="auth-form">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="auth-card w-full max-w-[420px]"
      >
        <div className="flex flex-col items-center mb-3" aria-hidden="true">
          <Nova size={92} mood={novaMood} look={novaLook} />
        </div>

        {forgotOpen ? (
          <>
            <h1
              className="text-center mb-1"
              style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: '32px', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#F1F6F9' }}
            >
              {forgotStep === 'done' ? 'Password reset' : 'Reset your password'}
            </h1>

            {forgotStep === 'request' && (
              <>
                <p className="text-center text-sm mb-6" style={{ fontFamily: 'Inter, sans-serif', color: '#9AAAB5' }}>
                  Enter your email and we'll send you a code to set a new password.
                </p>
                <form onSubmit={handleForgotRequest} className="space-y-3">
                  <input
                    type="email"
                    placeholder="Email address"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    required
                    autoFocus
                    className="w-full px-4 py-3 text-sm focus:outline-none transition-all duration-200"
                    style={{ ...inputStyle, borderRadius: '12px' }}
                    onFocus={e => { e.target.style.borderColor = 'rgba(169,221,247,0.55)'; e.target.style.boxShadow = '0 0 0 3px rgba(76,184,240,0.14)'; }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(190,225,245,0.14)'; e.target.style.boxShadow = 'none'; }}
                  />

                  <AnimatePresence>
                    {forgotError && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="py-2.5 px-4 text-xs text-center"
                        style={{ background: 'rgba(252,115,77,0.08)', border: '1px solid rgba(252,115,77,0.3)', borderRadius: '12px', fontFamily: 'Inter, sans-serif' }}
                      >
                        <span style={{ color: '#FFB49C' }}>{forgotError}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={forgotBusy}
                    className="w-full py-3 font-semibold text-sm text-[#02070A] flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] mt-2 disabled:opacity-60"
                    style={{ fontFamily: 'Inter, sans-serif', background: '#F1F6F9', borderRadius: '9999px' }}
                    onMouseEnter={e => { if (!forgotBusy) e.currentTarget.style.background = '#FFFFFF'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#F1F6F9'; }}
                  >
                    {forgotBusy ? (<><Loader2 size={16} className="animate-spin" /> Sending…</>) : (<>Send reset code <ArrowRight size={15} /></>)}
                  </button>
                </form>
              </>
            )}

            {forgotStep === 'reset' && (
              <>
                <p className="text-center text-sm mb-6" style={{ fontFamily: 'Inter, sans-serif', color: '#9AAAB5' }}>
                  Enter the 6-digit code sent to <span style={{ color: '#F1F6F9', fontWeight: 600 }}>{forgotEmail}</span> and choose a new password.
                </p>
                <form onSubmit={handleForgotReset} className="space-y-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Enter 6-digit code"
                    value={forgotCode}
                    onChange={e => setForgotCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    className="w-full px-4 py-3 text-sm text-center tracking-[0.4em] focus:outline-none transition-all duration-200"
                    style={{ ...inputStyle, borderRadius: '12px' }}
                    onFocus={e => { e.target.style.borderColor = 'rgba(169,221,247,0.55)'; e.target.style.boxShadow = '0 0 0 3px rgba(76,184,240,0.14)'; }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(190,225,245,0.14)'; e.target.style.boxShadow = 'none'; }}
                  />
                  <div className="relative">
                    <input
                      type={showForgotPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="New password (min 8 characters)"
                      value={forgotNewPw}
                      onChange={e => setForgotNewPw(e.target.value)}
                      required
                      className="w-full px-4 py-3 pr-12 text-sm focus:outline-none transition-all duration-200"
                      style={{ ...inputStyle, borderRadius: '12px' }}
                      onFocus={e => { e.target.style.borderColor = 'rgba(169,221,247,0.55)'; e.target.style.boxShadow = '0 0 0 3px rgba(76,184,240,0.14)'; }}
                      onBlur={e => { e.target.style.borderColor = 'rgba(190,225,245,0.14)'; e.target.style.boxShadow = 'none'; }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotPw(v => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: '#9AAAB5' }}
                    >
                      {showForgotPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <input
                    type={showForgotPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Confirm new password"
                    value={forgotConfirmPw}
                    onChange={e => setForgotConfirmPw(e.target.value)}
                    required
                    className="w-full px-4 py-3 text-sm focus:outline-none transition-all duration-200"
                    style={{ ...inputStyle, borderRadius: '12px' }}
                    onFocus={e => { e.target.style.borderColor = 'rgba(169,221,247,0.55)'; e.target.style.boxShadow = '0 0 0 3px rgba(76,184,240,0.14)'; }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(190,225,245,0.14)'; e.target.style.boxShadow = 'none'; }}
                  />

                  <AnimatePresence>
                    {forgotError && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="py-2.5 px-4 text-xs text-center"
                        style={{ background: 'rgba(252,115,77,0.08)', border: '1px solid rgba(252,115,77,0.3)', borderRadius: '12px', fontFamily: 'Inter, sans-serif' }}
                      >
                        <span style={{ color: '#FFB49C' }}>{forgotError}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {forgotNote && (
                    <p className="text-center text-xs" style={{ fontFamily: 'Inter, sans-serif', color: '#9AAAB5' }}>{forgotNote}</p>
                  )}

                  <button
                    type="submit"
                    disabled={forgotBusy || forgotCode.length < 6 || !forgotNewPw || !forgotConfirmPw}
                    className="w-full py-3 font-semibold text-sm text-[#02070A] flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] mt-2 disabled:opacity-60"
                    style={{ fontFamily: 'Inter, sans-serif', background: '#F1F6F9', borderRadius: '9999px' }}
                    onMouseEnter={e => { if (!forgotBusy) e.currentTarget.style.background = '#FFFFFF'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#F1F6F9'; }}
                  >
                    {forgotBusy ? (<><Loader2 size={16} className="animate-spin" /> Resetting…</>) : (<>Reset password <ArrowRight size={15} /></>)}
                  </button>
                </form>

                <p className="text-center text-xs mt-6" style={{ fontFamily: 'Inter, sans-serif', color: '#9AAAB5' }}>
                  Didn't get it?{' '}
                  <button type="button" onClick={handleForgotResend} className="underline" style={{ color: '#A9DDF7' }}>Resend code</button>
                </p>
              </>
            )}

            {forgotStep === 'done' && (
              <>
                <p className="text-center text-sm mb-6" style={{ fontFamily: 'Inter, sans-serif', color: '#9AAAB5' }}>
                  Your password has been updated. You can now sign in with your new password.
                </p>
                <button
                  type="button"
                  onClick={() => { closeForgot(); setMode('login'); setPassword(''); if (forgotEmail) setEmail(forgotEmail.trim()); }}
                  className="w-full py-3 font-semibold text-sm text-[#02070A] flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98]"
                  style={{ fontFamily: 'Inter, sans-serif', background: '#F1F6F9', borderRadius: '9999px' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FFFFFF'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#F1F6F9'; }}
                >
                  Back to sign in <ArrowRight size={15} />
                </button>
              </>
            )}

            {forgotStep !== 'done' && (
              <p className="text-center text-xs mt-6" style={{ fontFamily: 'Inter, sans-serif', color: '#9AAAB5' }}>
                <button type="button" onClick={closeForgot} className="underline" style={{ color: '#9AAAB5' }}>
                  Back to sign in
                </button>
              </p>
            )}
          </>
        ) : pendingEmail ? (
          <>
            <h1
              className="text-center mb-1"
              style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: '32px', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#F1F6F9' }}
            >
              Check your email
            </h1>
            <p className="text-center text-sm mb-6" style={{ fontFamily: 'Inter, sans-serif', color: '#9AAAB5' }}>
              We sent a 6-digit code to <span style={{ color: '#F1F6F9', fontWeight: 600 }}>{pendingEmail}</span>.{' '}
              {verifyContext === 'login'
                ? "It's a one-time check to verify your account — enter it below to continue."
                : 'Enter it below to finish signing up.'}
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
                style={{ ...inputStyle, borderRadius: '12px' }}
                onFocus={e => { e.target.style.borderColor = 'rgba(169,221,247,0.55)'; e.target.style.boxShadow = '0 0 0 3px rgba(76,184,240,0.14)'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(190,225,245,0.14)'; e.target.style.boxShadow = 'none'; }}
              />

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="py-2.5 px-4 text-xs text-center"
                    style={{ background: 'rgba(252,115,77,0.08)', border: '1px solid rgba(252,115,77,0.3)', borderRadius: '12px', fontFamily: 'Inter, sans-serif' }}
                  >
                    <span style={{ color: '#FFB49C' }}>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {resendNote && (
                <p className="text-center text-xs" style={{ fontFamily: 'Inter, sans-serif', color: '#9AAAB5' }}>{resendNote}</p>
              )}

              <button
                type="submit"
                disabled={verifying || code.length < 6}
                className="w-full py-3 font-semibold text-sm text-[#02070A] flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] mt-2 disabled:opacity-60"
                style={{ fontFamily: 'Inter, sans-serif', background: '#F1F6F9', borderRadius: '9999px' }}
                onMouseEnter={e => { if (!verifying && code.length >= 6) e.currentTarget.style.background = '#FFFFFF'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#F1F6F9'; }}
              >
                {verifying ? (<><Loader2 size={16} className="animate-spin" /> Verifying…</>) : (<>Verify & continue <ArrowRight size={15} /></>)}
              </button>
            </form>

            <p className="text-center text-xs mt-6" style={{ fontFamily: 'Inter, sans-serif', color: '#9AAAB5' }}>
              Didn't get it?{' '}
              <button type="button" onClick={handleResend} className="underline" style={{ color: '#A9DDF7' }}>Resend code</button>
              {' · '}
              <button
                type="button"
                onClick={() => { setPendingEmail(''); setCode(''); setError(''); setResendNote(''); }}
                className="underline"
                style={{ color: '#9AAAB5' }}
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
            color: '#F1F6F9',
          }}
        >
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-center text-sm mb-6" style={{ fontFamily: 'Inter, sans-serif', color: '#9AAAB5' }}>
          {focusField === 'password' && !showPassword
            ? "I'm not looking. Promise."
            : mode === 'login'
              ? 'Good to see you again. Nova missed you.'
              : "Hi, I'm Nova. Sign up and we'll make your first deck together. No card needed."}
        </p>

        {/* Toggle */}
        <div className="flex gap-1 p-1 mb-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(190,225,245,0.10)', borderRadius: '9999px' }}>
          {['login', 'register'].map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); setEmailError(''); setPasswordError(''); }}
              className="flex-1 py-2.5 text-sm font-semibold transition-all duration-200"
              style={mode === m
                ? { background: 'rgba(255,255,255,0.10)', color: '#F1F6F9', borderRadius: '9999px', boxShadow: 'none' }
                : { color: '#9AAAB5', borderRadius: '9999px', fontFamily: 'Inter, sans-serif' }}
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
                  autoComplete="name"
                  className="w-full px-4 py-3 text-sm focus:outline-none transition-all duration-200"
                  style={{ ...inputStyle, borderRadius: '12px' }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(169,221,247,0.55)'; e.target.style.boxShadow = '0 0 0 3px rgba(76,184,240,0.14)'; setFocusField('name'); }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(190,225,245,0.14)'; e.target.style.boxShadow = 'none'; setFocusField(null); }}
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
              style={{ ...inputStyle, borderRadius: '12px' }}
              autoComplete="email"
              onFocus={e => { e.target.style.borderColor = 'rgba(169,221,247,0.55)'; e.target.style.boxShadow = '0 0 0 3px rgba(76,184,240,0.14)'; setEmailError(''); setFocusField('email'); }}
              onBlur={e => {
                setFocusField(null);
                e.target.style.borderColor = 'rgba(190,225,245,0.14)';
                e.target.style.boxShadow = 'none';
                if (email && !EMAIL_RE.test(email)) setEmailError('Enter a valid email address.');
              }}
            />
            {emailError && (
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#FFB49C', marginTop: 4 }}>{emailError}</p>
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
                style={{ ...inputStyle, borderRadius: '12px' }}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                onFocus={e => { e.target.style.borderColor = 'rgba(169,221,247,0.55)'; e.target.style.boxShadow = '0 0 0 3px rgba(76,184,240,0.14)'; setPasswordError(''); setFocusField('password'); }}
                onBlur={e => {
                  setFocusField(null);
                  e.target.style.borderColor = 'rgba(190,225,245,0.14)';
                  e.target.style.boxShadow = 'none';
                  if (mode === 'register' && password && password.length < 8) setPasswordError('Password must be at least 8 characters.');
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: '#9AAAB5' }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passwordError && (
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#FFB49C', marginTop: 4 }}>{passwordError}</p>
            )}
            {mode === 'login' && (
              <div className="text-right mt-2">
                <button
                  type="button"
                  onClick={openForgot}
                  className="text-xs underline"
                  style={{ fontFamily: 'Inter, sans-serif', color: '#A9DDF7' }}
                >
                  Forgot password?
                </button>
              </div>
            )}
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="py-2.5 px-4 text-xs text-center"
                style={{ background: 'rgba(252,115,77,0.08)', border: '1px solid rgba(252,115,77,0.3)', borderRadius: '12px', fontFamily: 'Inter, sans-serif' }}
              >
                <span style={{ color: '#FFB49C' }}>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 font-semibold text-sm text-[#02070A] flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] mt-2 disabled:opacity-60"
            style={{
              fontFamily: 'Inter, sans-serif',
              background: '#F1F6F9',
              borderRadius: '9999px',
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#FFFFFF'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#F1F6F9'; }}
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
          <div className="flex-1 h-px" style={{ background: 'rgba(190,225,245,0.14)' }} />
          <span className="text-xs font-medium" style={{ fontFamily: 'Inter, sans-serif', color: '#9AAAB5' }}>or continue with</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(190,225,245,0.14)' }} />
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
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(190,225,245,0.14)',
                borderRadius: '12px',
                color: '#F1F6F9',
              }}
            >
              <Icon />
              {label}
            </a>
          ))}
        </div>

        {mode === 'register' && (
          <p className="text-center text-xs mt-6" style={{ fontFamily: 'Inter, sans-serif', color: '#9AAAB5' }}>
            By signing up you agree to our{' '}
            <Link to="/terms" className="underline" style={{ color: '#A9DDF7' }}>Terms</Link>
            {' '}and{' '}
            <Link to="/privacy" className="underline" style={{ color: '#A9DDF7' }}>Privacy Policy</Link>
          </p>
        )}
        </>
        )}
      </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
