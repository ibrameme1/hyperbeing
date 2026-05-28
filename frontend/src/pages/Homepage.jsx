import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Zap, Layers, TrendingUp, ImageIcon, Download, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import BackgroundVideo from '../components/BackgroundVideo';

const FEATURES = [
  {
    icon: Zap,
    title: 'Instant generation',
    desc: 'Full deck in under 60 seconds. Describe what you need, Nova handles the rest.',
    color: '#8B5CF6',
  },
  {
    icon: Layers,
    title: 'AI art direction',
    desc: 'Every slide professionally designed — layouts, typography, colour, imagery.',
    color: '#00F0FF',
  },
  {
    icon: TrendingUp,
    title: 'Strategy baked in',
    desc: 'Nova thinks like a McKinsey + Apple hybrid. Structure, narrative, impact.',
    color: '#00D4FF',
  },
  {
    icon: ImageIcon,
    title: 'AI image generation',
    desc: 'Custom visuals per slide. No stock photos, no generic clipart.',
    color: '#F59E0B',
  },
  {
    icon: Plus,
    title: 'Add & edit slides',
    desc: 'Add new slides mid-deck, regenerate any single slide, tweak on the fly.',
    color: '#10B981',
  },
  {
    icon: Download,
    title: 'Export anywhere',
    desc: 'Download as PDF or PNG. Ready for Keynote, PowerPoint, or the web.',
    color: '#EC4899',
  },
];

const STEPS = [
  { num: '01', title: 'Describe your presentation', desc: 'Tell Nova your topic, audience, tone, and goals. Upload brand assets if you have them.' },
  { num: '02', title: 'Nova plans the deck', desc: 'The AI builds a narrative structure, writes slide content, and chooses a visual direction.' },
  { num: '03', title: 'Slides generate live', desc: 'Watch each slide appear in real time with custom AI imagery and professional layouts.' },
  { num: '04', title: 'Export and present', desc: 'Download your deck as PDF or PNG. Done in under a minute.' },
];

export default function Homepage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ background: '#000000', color: '#fff' }}>

      {/* ── Full-viewport hero with video background ── */}
      <div className="relative h-screen flex flex-col overflow-hidden">
        <BackgroundVideo />

        {/* Navbar */}
        <motion.nav
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative z-20 px-6 py-6 w-full shrink-0"
        >
          <div className="liquid-glass rounded-full px-6 py-3 flex items-center justify-between max-w-5xl mx-auto">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}
                >
                  <Sparkles size={16} className="text-white" />
                </div>
                <span className="font-bold text-lg text-white">HyperBeing</span>
              </div>
              <div className="hidden md:flex items-center gap-8 text-white/80 text-sm font-medium">
                <Link to="/pricing" className="hover:text-white transition-colors duration-300">Pricing</Link>
                <Link to="/terms" className="hover:text-white transition-colors duration-300">Terms</Link>
                <Link to="/privacy" className="hover:text-white transition-colors duration-300">Privacy</Link>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {user ? (
                <button
                  onClick={() => navigate('/dashboard')}
                  className="liquid-glass rounded-full px-6 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Dashboard →
                </button>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/login')}
                    className="text-white hover:text-white/80 transition-colors text-sm font-medium cursor-pointer"
                  >
                    Sign in
                  </button>
                  <button
                    onClick={() => navigate('/login')}
                    className="liquid-glass rounded-full px-6 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Get started free
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.nav>

        {/* Hero content */}
        <section className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
          <div className="text-center max-w-5xl mx-auto flex flex-col items-center gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(139,92,246,0.15)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.25)' }}
              >
                <Sparkles size={12} /> AI Presentation Maker
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              style={{ fontFamily: "'Instrument Serif', serif" }}
              className="text-5xl md:text-[72px] font-medium tracking-[-0.01em] leading-[1.05] bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent max-w-4xl"
            >
              Presentations that make<br />
              people go{' '}
              <span style={{ fontStyle: 'italic' }}>"wait, how?"</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7 }}
              className="text-white/50 text-xl max-w-2xl mx-auto leading-relaxed"
            >
              Describe what you need. Nova — our AI — designs every slide like a senior art director,
              writes your narrative like a strategist, and generates custom visuals in under a minute.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="flex items-center justify-center gap-4 flex-wrap"
            >
              <button
                onClick={() => navigate('/login')}
                className="px-8 py-4 rounded-2xl font-bold text-white flex items-center gap-2 transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
                style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)', boxShadow: '0 8px 32px rgba(139,92,246,0.4)' }}
              >
                Start for free <ArrowRight size={16} />
              </button>
              <button
                onClick={() => navigate('/pricing')}
                className="px-8 py-4 rounded-2xl font-semibold text-white/70 hover:text-white transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
              >
                See pricing
              </button>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-white/25 text-sm"
            >
              50 free credits on signup · No card required
            </motion.p>
          </div>
        </section>
      </div>

      {/* ── How it works ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-20">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
          <p className="text-center text-xs font-semibold tracking-[0.2em] uppercase mb-4" style={{ color: '#8B5CF6' }}>How it works</p>
          <h2 className="text-center text-4xl font-bold text-white mb-14">From brief to deck in 60 seconds</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="rounded-2xl p-6"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <p className="text-4xl font-bold mb-4" style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {step.num}
                </p>
                <p className="text-white font-semibold mb-2">{step.title}</p>
                <p className="text-white/40 text-sm leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── Features grid ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-20">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
          <p className="text-center text-xs font-semibold tracking-[0.2em] uppercase mb-4" style={{ color: '#00F0FF' }}>Everything included</p>
          <h2 className="text-center text-4xl font-bold text-white mb-14">Built for people who care about the output</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                  className="rounded-2xl p-6"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                       style={{ background: `${f.color}18`, border: `1px solid ${f.color}30` }}>
                    <Icon size={18} style={{ color: f.color }} />
                  </div>
                  <p className="text-white font-semibold mb-1.5">{f.title}</p>
                  <p className="text-white/40 text-sm leading-relaxed">{f.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* ── CTA banner ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-10 mb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
          className="rounded-3xl p-12 text-center"
          style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(0,240,255,0.08) 100%)', border: '1px solid rgba(139,92,246,0.2)' }}
        >
          <h2 className="text-4xl font-bold text-white mb-4">Ready to stop dreading presentations?</h2>
          <p className="text-white/45 mb-8 max-w-lg mx-auto">Start free, no card required. Your first presentation takes about 60 seconds.</p>
          <button
            onClick={() => navigate('/login')}
            className="px-8 py-4 rounded-2xl font-bold text-white flex items-center gap-2 mx-auto transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
            style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)', boxShadow: '0 8px 32px rgba(139,92,246,0.35)' }}
          >
            Get started free <ArrowRight size={16} />
          </button>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t px-8 py-8" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}>
              <Sparkles size={12} className="text-white" />
            </div>
            <span className="text-white/50 text-sm font-semibold">HyperBeing</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-white/35">
            <Link to="/pricing" className="hover:text-white/60 transition-colors">Pricing</Link>
            <Link to="/terms" className="hover:text-white/60 transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-white/60 transition-colors">Privacy</Link>
            <a href="mailto:team@hyperbeing.co" className="hover:text-white/60 transition-colors">Contact</a>
          </div>
          <p className="text-white/20 text-xs">© {new Date().getFullYear()} HyperBeing. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
