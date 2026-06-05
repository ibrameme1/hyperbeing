import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, Zap, Layers, TrendingUp,
  ImageIcon, Download, Star,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import BackgroundVideo from '../components/BackgroundVideo';
import Logo from '../components/Logo';

function CountUp({ to, suffix = '', decimals = 0 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const duration = 1400;
        const startTime = performance.now();
        const animate = (now) => {
          const progress = Math.min((now - startTime) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setCount(parseFloat((to * eased).toFixed(decimals)));
          if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      }
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [to, decimals]);
  return <span ref={ref}>{decimals > 0 ? count.toFixed(decimals) : Math.round(count)}{suffix}</span>;
}

const STEPS = [
  { num: '01', title: 'Describe your presentation', desc: 'Tell Nova your topic, audience, tone, and goals. Upload brand assets if you have them.' },
  { num: '02', title: 'Nova plans the deck', desc: 'The AI builds a narrative structure, writes slide content, and chooses a visual direction.' },
  { num: '03', title: 'Slides generate live', desc: 'Watch each slide appear in real time with custom visuals and professional layouts.' },
  { num: '04', title: 'Export and present', desc: 'Download your deck as PDF or PNG. Done in under a minute.' },
];

const STATS = [
  { value: '50K+', label: 'Presentations created', countTo: 50, suffix: 'K+' },
  { value: '< 60s', label: 'Avg. generation time', static: true },
  { value: '4.9/5', label: 'User rating', countTo: 4.9, suffix: '/5', decimals: 1 },
];

const TESTIMONIALS = [
  {
    name: 'Sarah Chen',
    role: 'Startup Founder · Vela AI',
    initials: 'SC',
    avatarColor: '#8B5CF6',
    text: "HyperBeing replaced our entire slide design workflow. What used to take a day now takes 60 seconds — and the output honestly looks better.",
    stars: 5,
  },
  {
    name: 'Marcus Reid',
    role: 'Head of Marketing · Northstar Labs',
    initials: 'MR',
    avatarColor: '#00C4D4',
    text: "I pitched to investors with a HyperBeing deck. Three of them asked who our designer was. I said 'AI' and watched their jaws drop.",
    stars: 5,
  },
  {
    name: 'Priya Sharma',
    role: 'Product Manager · Drift Protocol',
    initials: 'PS',
    avatarColor: '#10B981',
    text: "The AI images are what got me. Every slide gets a custom visual that actually fits the content. No more trawling stock photo sites.",
    stars: 5,
  },
];

const stagger = {
  container: {
    hidden: {},
    show: { transition: { staggerChildren: 0.1 } },
  },
  item: {
    hidden: { opacity: 0, y: 22 },
    show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
  },
};

export default function Homepage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ background: '#000000', color: '#fff' }}>

      {/* ── Full-viewport hero ── */}
      <div className="relative min-h-screen flex flex-col overflow-hidden">
        <BackgroundVideo />

        {/* Navbar */}
        <motion.nav
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-20 px-6 py-6 w-full shrink-0"
        >
          <div className="liquid-glass rounded-full px-6 py-3 flex items-center justify-between max-w-5xl mx-auto">
            <div className="flex items-center gap-8">
              <div className="flex items-center">
                <Logo dark height={44} />
              </div>
              <div className="hidden md:flex items-center gap-8 text-white/65 text-sm font-medium">
                <Link to="/pricing" className="hover:text-white transition-colors duration-200">Pricing</Link>
                <Link to="/terms" className="hover:text-white transition-colors duration-200">Terms</Link>
                <Link to="/privacy" className="hover:text-white transition-colors duration-200">Privacy</Link>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {user ? (
                <button
                  onClick={() => navigate('/dashboard')}
                  className="liquid-glass rounded-full px-6 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Dashboard →
                </button>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/login')}
                    className="text-white/60 hover:text-white transition-colors text-sm font-medium cursor-pointer"
                  >
                    Sign in
                  </button>
                  <button
                    onClick={() => navigate('/login')}
                    className="rounded-full px-5 py-2 text-sm font-semibold text-white cursor-pointer transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
                    style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00C4D4 100%)', boxShadow: '0 2px 10px rgba(139,92,246,0.22)' }}
                  >
                    Get started free
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.nav>

        {/* Hero content */}
        <section className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-20">
          <div className="text-center max-w-5xl mx-auto flex flex-col items-center gap-8">

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-2"
              style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#C4B5FD' }}
            >
              <Zap size={12} />
              50,000+ presentations created
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              className="text-5xl md:text-[78px] font-medium tracking-[-0.02em] leading-[1.04]"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              <span className="text-white">
                Presentations that make
              </span>
              <br />
              <span className="text-white">
                people go{' '}
              </span>
              <span style={{ fontStyle: 'italic', color: '#C4B5FD' }}>
                "wait, how?"
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.7 }}
              className="text-white/70 text-xl max-w-2xl mx-auto leading-relaxed"
            >
              Describe what you need. Nova — our AI — designs every slide like a senior art director,
              writes your narrative like a strategist, and generates custom visuals in under a minute.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38 }}
              className="flex items-center justify-center gap-4 flex-wrap"
            >
              <button
                onClick={() => navigate('/login')}
                className="group px-8 py-4 rounded-2xl font-bold text-white flex items-center gap-2.5 transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
                style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)', boxShadow: '0 4px 16px rgba(139,92,246,0.25)' }}
              >
                Start for free
                <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform duration-200" />
              </button>
              <button
                onClick={() => navigate('/pricing')}
                className="px-8 py-4 rounded-2xl font-semibold text-white/75 hover:text-white transition-colors duration-200"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
              >
                See pricing
              </button>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              className="text-white/50 text-sm"
            >
              50 free credits on signup · No card required
            </motion.p>
          </div>
        </section>
      </div>

      {/* ── Stats bar ── */}
      <section
        className="relative z-10 border-y"
        style={{ borderColor: 'rgba(255,255,255,0.05)' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto px-6 py-12 grid grid-cols-3 divide-x"
          style={{ '--tw-divide-opacity': 1, borderColor: 'rgba(255,255,255,0.05)' }}
        >
          {STATS.map((s) => (
            <div key={s.label} className="text-center px-4">
              <p className="text-3xl md:text-4xl font-bold mb-1.5 stat-gradient">
                {s.static ? s.value : <CountUp to={s.countTo} suffix={s.suffix} decimals={s.decimals || 0} />}
              </p>
              <p className="text-white/55 text-sm">{s.label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── Trusted by ── */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 py-8 text-center">
        <p className="text-white/35 text-xs font-semibold tracking-[0.18em] uppercase mb-6">Trusted by teams at</p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {['Vela AI', 'Northstar Labs', 'Drift Protocol', 'Arc Ventures', 'Luminary Co', 'Helix Studio'].map(name => (
            <span key={name} className="text-white/30 text-sm font-semibold hover:text-white/50 transition-colors duration-200">{name}</span>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-24">
        <motion.div
          variants={stagger.container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
        >
          <motion.p
            variants={stagger.item}
            className="text-center text-xs font-semibold tracking-[0.2em] uppercase mb-4"
            style={{ color: '#8B5CF6' }}
          >
            How it works
          </motion.p>
          <motion.h2
            variants={stagger.item}
            className="text-center text-4xl md:text-5xl font-bold text-white mb-16 leading-tight"
          >
            From brief to deck
            <br />
            <span className="text-white/55">in 60 seconds</span>
          </motion.h2>
          <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="hidden lg:block absolute top-8 left-[12.5%] right-[12.5%] h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.3) 20%, rgba(139,92,246,0.3) 80%, transparent 100%)' }} />
            {STEPS.map((step) => (
              <motion.div
                key={step.num}
                variants={stagger.item}
                className="feature-card-dark rounded-2xl p-6"
              >
                <p className="text-4xl font-bold mb-5 stat-gradient">{step.num}</p>
                <p className="text-white font-semibold mb-2">{step.title}</p>
                <p className="text-white/65 text-sm leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── Features bento grid ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16 text-center"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight">
            Built for people who
            <br />
            <span className="text-white/55">care about the output</span>
          </h2>
        </motion.div>

        <motion.div
          variants={stagger.container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {/* Large left — AI art direction */}
          <motion.div
            variants={stagger.item}
            className="md:col-span-2 feature-card-dark rounded-2xl p-8 flex flex-col justify-between min-h-[260px]"
          >
            <div>
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                style={{ background: 'rgba(139,92,246,0.14)', border: '1px solid rgba(139,92,246,0.28)' }}
              >
                <Layers size={20} style={{ color: '#8B5CF6' }} />
              </div>
              <p className="text-white text-xl font-semibold mb-2">AI art direction</p>
              <p className="text-white/65 text-sm leading-relaxed max-w-xs">
                Every slide professionally designed — layouts, typography, colour, imagery. Looks like you hired a senior designer.
              </p>
            </div>
            <div className="mt-8 grid grid-cols-3 gap-2">
              {['Title Slide', 'Data Viz', 'Team Slide'].map((label) => (
                <div
                  key={label}
                  className="rounded-xl p-3 text-center"
                  style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.14)' }}
                >
                  <p className="text-white/55 text-xs font-medium">{label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Small right — Speed */}
          <motion.div
            variants={stagger.item}
            className="feature-card-dark rounded-2xl p-8 flex flex-col justify-between"
          >
            <div>
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.24)' }}
              >
                <Zap size={20} style={{ color: '#F59E0B' }} />
              </div>
              <p className="text-white text-xl font-semibold mb-2">Instant generation</p>
              <p className="text-white/65 text-sm leading-relaxed">Full deck in under 60 seconds. Describe it, Nova handles the rest.</p>
            </div>
            <div className="mt-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/55 text-xs">Generation time</span>
                <span className="text-white/55 text-xs font-semibold">~58s</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #F59E0B, #EF4444)' }}
                  initial={{ width: '0%' }}
                  whileInView={{ width: '88%' }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.6, ease: 'easeOut', delay: 0.4 }}
                />
              </div>
            </div>
          </motion.div>

          {/* Small left — AI images */}
          <motion.div
            variants={stagger.item}
            className="feature-card-dark rounded-2xl p-8 flex flex-col"
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.24)' }}
            >
              <ImageIcon size={20} style={{ color: '#10B981' }} />
            </div>
            <p className="text-white text-xl font-semibold mb-2">AI image generation</p>
            <p className="text-white/65 text-sm leading-relaxed">
              Custom visuals per slide. No stock photos, no generic clipart — every image made for your content.
            </p>
          </motion.div>

          {/* Large right — Strategy */}
          <motion.div
            variants={stagger.item}
            className="md:col-span-2 feature-card-dark rounded-2xl p-8 flex flex-col justify-between"
          >
            <div>
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                style={{ background: 'rgba(0,196,212,0.1)', border: '1px solid rgba(0,196,212,0.2)' }}
              >
                <TrendingUp size={20} style={{ color: '#00C4D4' }} />
              </div>
              <p className="text-white text-xl font-semibold mb-2">Strategy baked in</p>
              <p className="text-white/65 text-sm leading-relaxed max-w-xs">
                Nova writes the narrative structure, picks the visual direction, and generates a custom image for every slide.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              {['Problem → Solution', 'Data storytelling', 'Executive summary', 'Pitch structure'].map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{ background: 'rgba(0,196,212,0.08)', color: '#67E8F9', border: '1px solid rgba(0,196,212,0.16)' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Full-width — Export */}
          <motion.div
            variants={stagger.item}
            className="md:col-span-3 feature-card-dark rounded-2xl p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
          >
            <div className="flex items-start gap-5">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(236,72,153,0.12)', border: '1px solid rgba(236,72,153,0.24)' }}
              >
                <Download size={20} style={{ color: '#EC4899' }} />
              </div>
              <div>
                <p className="text-white text-xl font-semibold mb-1.5">Export anywhere</p>
                <p className="text-white/65 text-sm leading-relaxed">
                  Download as PDF or PNG. Ready for Keynote, PowerPoint, or the web.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {['PDF', 'PNG', 'PPT-ready'].map((fmt) => (
                <div
                  key={fmt}
                  className="px-4 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: 'rgba(236,72,153,0.08)', color: '#F9A8D4', border: '1px solid rgba(236,72,153,0.18)' }}
                >
                  {fmt}
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Testimonials ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16 text-center"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight">
            Loved by creators,
            <br />
            <span className="text-white/55">trusted by teams</span>
          </h2>
        </motion.div>

        <motion.div
          variants={stagger.container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-5"
        >
          {TESTIMONIALS.map((t) => (
            <motion.div key={t.name} variants={stagger.item} className="testimonial-card p-6 flex flex-col gap-4">
              <svg width="20" height="14" viewBox="0 0 20 14" fill="none" style={{ color: 'rgba(139,92,246,0.4)' }}>
                <path d="M0 14V8.4C0 6.13333 0.6 4.2 1.8 2.6C3 1 4.6 0.133333 6.6 0L7.4 1.6C6.13333 1.86667 5.1 2.5 4.3 3.5C3.5 4.46667 3.1 5.6 3.1 6.9H6V14H0ZM11 14V8.4C11 6.13333 11.6333 4.2 12.9 2.6C14.1667 1 15.8 0.133333 17.8 0L18.6 1.6C17.3333 1.86667 16.3 2.5 15.5 3.5C14.7 4.46667 14.3 5.6 14.3 6.9H17.2V14H11Z" fill="currentColor"/>
              </svg>
              <div className="flex gap-0.5">
                {Array.from({ length: t.stars }).map((_, i) => (
                  <Star key={i} size={14} fill="#F59E0B" strokeWidth={0} />
                ))}
              </div>
              <p className="text-white/70 text-sm leading-relaxed flex-1">"{t.text}"</p>
              <div
                className="flex items-center gap-3 pt-4 border-t"
                style={{ borderColor: 'rgba(255,255,255,0.06)' }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ background: t.avatarColor }}
                >
                  {t.initials}
                </div>
                <div>
                  <p className="text-white text-sm font-semibold leading-none mb-0.5">{t.name}</p>
                  <p className="text-white/55 text-xs">{t.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── CTA banner ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="gradient-border-card rounded-3xl p-14 text-center relative overflow-hidden"
        >
          {/* Soft glow inside CTA */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[480px] h-[240px] rounded-full opacity-8 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #8B5CF6 0%, transparent 70%)', filter: 'blur(70px)' }}
          />

          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
              Ready to stop dreading
              <br />presentations?
            </h2>
            <p className="text-white/65 mb-10 max-w-lg mx-auto">
              Start free, no card required. Your first presentation takes about 60 seconds.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="group inline-flex items-center gap-2.5 px-10 py-4 rounded-2xl font-bold text-white transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)', boxShadow: '0 4px 16px rgba(139,92,246,0.25)' }}
            >
              Start for free
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform duration-200" />
            </button>
            <p className="text-white/40 text-sm mt-5">50 free credits · No card required</p>
          </div>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t px-8 py-8" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center">
            <Logo dark height={36} />
          </div>
          <div className="flex items-center gap-6 text-sm text-white/50">
            <Link to="/pricing" className="hover:text-white/60 transition-colors">Pricing</Link>
            <Link to="/terms" className="hover:text-white/60 transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-white/60 transition-colors">Privacy</Link>
            <a href="mailto:team@hyperbeing.co" className="hover:text-white/60 transition-colors">Contact</a>
          </div>
          <p className="text-white/35 text-xs">© {new Date().getFullYear()} HyperBeing. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
