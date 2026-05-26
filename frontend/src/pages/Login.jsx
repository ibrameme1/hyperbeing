import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Eye, EyeOff, Loader2, ArrowRight, Zap, Layers, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const FEATURES = [
  { icon: Zap, title: 'Instant generation', desc: 'Full deck in under 60 seconds', color: '#7B5EFF' },
  { icon: Layers, title: 'AI art direction', desc: 'Every slide professionally designed', color: '#FF4B8C' },
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
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#0A0812' }}>

      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden flex-col justify-between p-12"
           style={{ background: 'linear-gradient(145deg, #0A0812 0%, #140F26 50%, #0E0B1F 100%)' }}>

        {/* Aurora blobs */}
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full animate-aurora"
             style={{ background: 'radial-gradient(circle, rgba(123,94,255,0.25) 0%, transparent 65%)', filter: 'blur(40px)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full animate-aurora-2"
             style={{ background: 'radial-gradient(circle, rgba(255,75,140,0.20) 0%, transparent 65%)', filter: 'blur(40px)' }} />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full animate-aurora-3"
             style={{ background: 'radial-gradient(circle, rgba(0,212,255,0.12) 0%, transparent 65%)', filter: 'blur(40px)' }} />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #7B5EFF 0%, #FF4B8C 100%)' }}>
              <Sparkles size={18} className="text-white" />
            </div>
            <span className="text-white font-bold text-xl tracking-tight">HyperBeing</span>
          </div>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-4"
               style={{ color: '#7B5EFF' }}>AI Presentation Maker</p>
            <h2 className="text-5xl font-bold text-white leading-tight mb-6">
              Presentations that make people go{' '}
              <span style={{
                background: 'linear-gradient(135deg, #7B5EFF 0%, #FF4B8C 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                "wait, how?"
              </span>
            </h2>
            <p className="text-white/50 text-lg leading-relaxed mb-10">
              Nova designs every slide like a senior art director. You just describe what you need.
            </p>

            <div className="space-y-4">
              {FEATURES.map(({ icon: Icon, title, desc, color }, i) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center gap-4 p-4 rounded-2xl"
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
      <div className="flex-1 lg:max-w-[480px] flex items-center justify-center p-6 lg:p-12"
           style={{ background: '#F7F5FF' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #7B5EFF 0%, #FF4B8C 100%)' }}>
              <Sparkles size={16} className="text-white" />
            </div>
            <span className="font-bold text-hb-text text-lg">HyperBeing</span>
          </div>

          <h1 className="text-2xl font-bold text-hb-text mb-1">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-hb-muted text-sm mb-8">
            {mode === 'login'
              ? 'Good to see you again. Nova missed you.'
              : 'Takes 30 seconds. No credit card.'}
          </p>

          {/* Toggle */}
          <div className="flex gap-1 p-1 rounded-2xl mb-8"
               style={{ background: '#EDE8FF' }}>
            {['login', 'register'].map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  mode === m
                    ? 'bg-white text-hb-text shadow-ios'
                    : 'text-hb-muted hover:text-hb-text'
                }`}
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
                    className="w-full px-4 py-3.5 rounded-2xl text-sm text-hb-text placeholder:text-hb-muted focus:outline-none transition-all duration-200 bg-white border-2"
                    style={{ borderColor: '#EDE8FF', boxShadow: '0 1px 4px rgba(123,94,255,0.06)' }}
                    onFocus={e => e.target.style.borderColor = '#7B5EFF'}
                    onBlur={e => e.target.style.borderColor = '#EDE8FF'}
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
              className="w-full px-4 py-3.5 rounded-2xl text-sm text-hb-text placeholder:text-hb-muted focus:outline-none transition-all duration-200 bg-white border-2"
              style={{ borderColor: '#EDE8FF', boxShadow: '0 1px 4px rgba(123,94,255,0.06)' }}
              onFocus={e => e.target.style.borderColor = '#7B5EFF'}
              onBlur={e => e.target.style.borderColor = '#EDE8FF'}
            />

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3.5 pr-12 rounded-2xl text-sm text-hb-text placeholder:text-hb-muted focus:outline-none transition-all duration-200 bg-white border-2"
                style={{ borderColor: '#EDE8FF', boxShadow: '0 1px 4px rgba(123,94,255,0.06)' }}
                onFocus={e => e.target.style.borderColor = '#7B5EFF'}
                onBlur={e => e.target.style.borderColor = '#EDE8FF'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: '#6B6285' }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-red-500 text-xs text-center py-2 px-4 rounded-xl bg-red-50"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] mt-2 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #7B5EFF 0%, #FF4B8C 100%)',
                boxShadow: '0 4px 24px rgba(123,94,255,0.35)',
              }}
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
              ) : (
                <>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={15} /></>
              )}
            </button>
          </form>

          {mode === 'register' && (
            <p className="text-center text-xs mt-6" style={{ color: '#6B6285' }}>
              By signing up you agree to our{' '}
              <span className="underline cursor-pointer" style={{ color: '#7B5EFF' }}>Terms</span>
              {' '}and{' '}
              <span className="underline cursor-pointer" style={{ color: '#7B5EFF' }}>Privacy Policy</span>
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
