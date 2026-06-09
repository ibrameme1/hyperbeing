import { useNavigate, Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import TextRotate from '../components/TextRotate';


const FEATURES = [
  { icon: '◈', title: 'Art-directed images', desc: 'Each slide gets its own generated visual. Context-aware, brand-aware, purpose-built.' },
  { icon: '◎', title: 'Narrative intelligence', desc: 'Claude reads your entire outline before writing a single word. The story comes first.' },
  { icon: '▦', title: 'Slide map preview', desc: 'Approve the structure before the images generate. No surprises.' },
  { icon: '◉', title: 'Brand memory', desc: 'Upload your brand kit once. Every deck stays on-brand automatically.', soon: true },
  { icon: '↗', title: 'One-click export', desc: 'Download as PowerPoint, PDF, or shareable link. Integration-ready.' },
  { icon: '⬡', title: 'Enterprise grade', desc: 'SSO, audit logs, team workspaces, and volume pricing. Built to scale.' },
];

const FEATURE_SPLITS = [
  {
    headline: 'Your context, not a template.',
    body: 'Every slide is art-directed from scratch. Paste your deck outline — HyperBeing reads the room, understands your narrative arc, and generates images that match each slide\'s specific message.',
    visual: 'left-panel',
    side: 'right',
  },
  {
    headline: 'The kind of slides that close deals.',
    body: 'Consultants, VCs, and agency leads use HyperBeing for their highest-stakes presentations. When the deck has to land, this is the tool.',
    visual: 'deck-grid',
    side: 'left',
  },
  {
    headline: '20 slides. 3 minutes.',
    body: 'From a rough outline to a fully designed, image-complete deck. No waiting for a designer. No back-and-forth. Just done.',
    visual: 'progress-strip',
    side: 'right',
  },
];

/* ─── HB Icon ─── */
function HBIcon({ size = 32, className = '' }) {
  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 ${className}`}
      style={{
        width: size, height: size,
        background: '#5B50FF',
        borderRadius: Math.round(size * 0.22),
      }}
    >
      <span style={{ fontFamily: 'Inter,Arial,sans-serif', fontWeight: 900, color: '#fff', fontSize: size * 0.46, letterSpacing: '-0.1em', paddingRight: '0.1em', display: 'block', lineHeight: 1 }}>HB</span>
    </div>
  );
}

/* ─── Scroll-reveal wrapper ─── */
function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── Animated product mockup (demo section) ─── */
function ProductMockup() {
  const [phase, setPhase] = useState(0); // 0=typing, 1=plan, 2=generating, 3=done
  const [typed, setTyped] = useState('');
  const [visibleSlides, setVisibleSlides] = useState(0);
  const prompt = 'Series A pitch deck for a fintech startup disrupting B2B payments';

  useEffect(() => {
    let timeout;
    if (phase === 0) {
      if (typed.length < prompt.length) {
        timeout = setTimeout(() => setTyped(prompt.slice(0, typed.length + 1)), 40);
      } else {
        timeout = setTimeout(() => setPhase(1), 800);
      }
    } else if (phase === 1) {
      timeout = setTimeout(() => setPhase(2), 1200);
    } else if (phase === 2) {
      if (visibleSlides < 6) {
        timeout = setTimeout(() => setVisibleSlides(v => v + 1), 400);
      } else {
        timeout = setTimeout(() => setPhase(3), 600);
      }
    } else if (phase === 3) {
      timeout = setTimeout(() => { setPhase(0); setTyped(''); setVisibleSlides(0); }, 3000);
    }
    return () => clearTimeout(timeout);
  }, [phase, typed, visibleSlides]);

  const slideColors = [
    'linear-gradient(135deg, #1a1540 0%, #5B50FF 100%)',
    'linear-gradient(135deg, #0f0f0f 0%, #1e1e1e 100%)',
    'linear-gradient(135deg, #14102e 0%, #3B2FFF 100%)',
    'linear-gradient(135deg, #080808 0%, #141414 100%)',
    'linear-gradient(135deg, #0a0818 0%, #8B80FF 100%)',
    'linear-gradient(135deg, #0f0f0f 0%, #2a2a2a 100%)',
  ];

  return (
    <div style={{ background: '#0f0f0f', borderRadius: '8px', border: '0.5px solid #1e1e1e', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #1e1e1e', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1e1e1e' }} />
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1e1e1e' }} />
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1e1e1e' }} />
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: '#555', letterSpacing: '0.1em', marginLeft: '8px' }}>HYPERBEING STUDIO</span>
      </div>
      {/* Content area */}
      <div style={{ padding: '24px' }}>
        {/* Input */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: '#8B80FF', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '8px' }}>PROMPT</p>
          <div style={{ background: '#141414', borderRadius: '6px', border: '0.5px solid #2a2a2a', padding: '12px 14px', minHeight: '48px' }}>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#f0f0ee' }}>{typed}</span>
            {phase === 0 && <span style={{ display: 'inline-block', width: '2px', height: '14px', background: '#5B50FF', marginLeft: '2px', verticalAlign: 'text-bottom', animation: 'blink 1s step-end infinite' }} />}
          </div>
        </div>

        {/* Slide grid */}
        <AnimatePresence>
          {phase >= 1 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: '#8B80FF', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '12px' }}>
                {phase === 1 ? 'PLANNING STRUCTURE…' : phase === 2 ? 'GENERATING SLIDES…' : 'DECK COMPLETE'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <motion.div
                    key={i}
                    style={{ aspectRatio: '16/9', borderRadius: '4px', border: '0.5px solid #1e1e1e', overflow: 'hidden', position: 'relative' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    {i < visibleSlides ? (
                      <div style={{ width: '100%', height: '100%', background: slideColors[i], display: 'flex', alignItems: 'flex-end', padding: '6px' }}>
                        <div style={{ width: '60%', height: '3px', background: 'rgba(255,255,255,0.3)', borderRadius: '2px' }} />
                      </div>
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: '#141414', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {phase >= 2 && i <= visibleSlides && (
                          <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '1.5px solid #5B50FF', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
              {phase >= 2 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ height: '1.5px', background: '#1e1e1e', borderRadius: '1px', overflow: 'hidden' }}>
                    <motion.div
                      style={{ height: '100%', background: 'linear-gradient(90deg, #5B50FF, #8B80FF)', borderRadius: '1px' }}
                      animate={{ width: `${Math.round((visibleSlides / 6) * 100)}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                  <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: '#555', marginTop: '6px' }}>
                    slide_{String(visibleSlides).padStart(2, '0')}.visual.generating — {Math.round((visibleSlides / 6) * 100)}%
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── Deck thumbnail card (gallery) ─── */
function DeckCard({ title, category, gradient, delay = 0 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -4, boxShadow: 'rgba(91,80,255,0.3) 0px 0px 24px 0px' }}
      style={{ borderRadius: '8px', overflow: 'hidden', border: '0.5px solid #1e1e1e', cursor: 'pointer', flexShrink: 0, width: '280px' }}
    >
      <div style={{ aspectRatio: '16/9', background: gradient, position: 'relative', padding: '20px' }}>
        <div style={{ position: 'absolute', bottom: '14px', left: '14px', right: '14px' }}>
          <div style={{ height: '2px', background: 'rgba(255,255,255,0.2)', borderRadius: '1px', marginBottom: '8px' }} />
          <div style={{ height: '2px', width: '60%', background: 'rgba(255,255,255,0.12)', borderRadius: '1px' }} />
        </div>
        <div style={{ position: 'absolute', top: '12px', left: '12px' }}>
          <HBIcon size={18} />
        </div>
      </div>
      <div style={{ padding: '12px 14px', background: '#0f0f0f' }}>
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: '#8B80FF', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '4px' }}>{category}</p>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#f0f0ee', fontWeight: 500 }}>{title}</p>
      </div>
    </motion.div>
  );
}

/* ─── Feature visual placeholders ─── */
function FeatureVisual({ type }) {
  if (type === 'left-panel') {
    return (
      <div style={{ background: '#141414', borderRadius: '8px', border: '0.5px solid #1e1e1e', padding: '16px', aspectRatio: '4/3' }}>
        <div style={{ marginBottom: '12px' }}>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: '#8B80FF', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '8px' }}>BRIEF</p>
          <div style={{ background: '#0f0f0f', borderRadius: '6px', border: '0.5px solid #2a2a2a', padding: '10px' }}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#888' }}>Series A pitch for a fintech startup targeting SMBs in emerging markets…</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {['Slide 01 — Market Opportunity', 'Slide 02 — Problem', 'Slide 03 — Solution', 'Slide 04 — Traction'].map((s, i) => (
            <div key={s} style={{ background: '#0f0f0f', borderRadius: '4px', border: '0.5px solid #1e1e1e', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '8px', color: '#5B50FF' }}>0{i+1}</span>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', color: '#888' }}>{s.split(' — ')[1]}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (type === 'deck-grid') {
    const g = [
      'linear-gradient(135deg, #1a1040 0%, #5B50FF 100%)',
      'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)',
      'linear-gradient(135deg, #1a0a2e 0%, #4a1882 100%)',
      'linear-gradient(135deg, #0a1a18 0%, #0d5c52 100%)',
    ];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {g.map((grad, i) => (
          <div key={i} style={{ aspectRatio: '16/9', background: grad, borderRadius: '6px', border: '0.5px solid #1e1e1e' }} />
        ))}
      </div>
    );
  }
  if (type === 'progress-strip') {
    return (
      <div style={{ background: '#141414', borderRadius: '8px', border: '0.5px solid #1e1e1e', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {['Slide 01', 'Slide 02', 'Slide 03', 'Slide 04', 'Slide 05'].map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: '#8B80FF', width: '48px' }}>{s}</span>
            <div style={{ flex: 1, height: '2px', background: '#1e1e1e', borderRadius: '1px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${[100, 100, 100, 65, 20][i]}%`, background: 'linear-gradient(90deg, #5B50FF, #8B80FF)', borderRadius: '1px' }} />
            </div>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: i < 3 ? '#22c55e' : '#555' }}>
              {i < 3 ? '✓' : i === 3 ? '65%' : '…'}
            </span>
          </div>
        ))}
        <div style={{ marginTop: '8px', borderTop: '0.5px solid #1e1e1e', paddingTop: '12px' }}>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: '#5B50FF', letterSpacing: '0.1em' }}>3 of 5 slides complete · ~45s remaining</p>
        </div>
      </div>
    );
  }
  return null;
}

/* ─── Main component ─── */
export default function Homepage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const goToApp = () => navigate(user ? '/dashboard' : '/login');

  return (
    <div data-theme="light" style={{ fontFamily: 'Inter, system-ui, sans-serif', background: '#f5f5f5', color: '#0d0b1a' }}>

      {/* ── 1. NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: '60px',
        background: scrolled ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(12px)',
        borderBottom: scrolled ? '0.5px solid #e8e8f0' : '0.5px solid transparent',
        transition: 'all 0.2s ease',
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '0 24px', display: 'flex', alignItems: 'center', gap: '32px' }}>
          {/* Logo */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', flexShrink: 0 }}>
            <HBIcon size={28} />
            <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '15px', color: '#0d0b1a', letterSpacing: '-0.02em' }}>HyperBeing</span>
          </Link>

          {/* Center links */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '32px' }}>
            {[
              { label: 'Product', href: '#demo' },
              { label: 'Examples', href: '#gallery' },
              { label: 'Pricing', href: '/pricing' },
              { label: 'Enterprise', href: 'mailto:team@hyperbeing.co?subject=Enterprise%20Enquiry' },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                onClick={label === 'Pricing' ? (e) => { e.preventDefault(); navigate('/pricing'); } : undefined}
                style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#6b6490', textDecoration: 'none', transition: 'color 0.15s', cursor: 'pointer' }}
                onMouseEnter={e => e.target.style.color = '#0d0b1a'}
                onMouseLeave={e => e.target.style.color = '#6b6490'}
              >
                {label}
              </a>
            ))}
          </div>

          {/* Right buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {user ? (
              <button
                onClick={() => navigate('/dashboard')}
                style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 600, color: '#fff', background: '#5B50FF', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', letterSpacing: '0.01em', transition: 'background 0.15s' }}
                onMouseEnter={e => e.target.style.background = '#6E63FF'}
                onMouseLeave={e => e.target.style.background = '#5B50FF'}
              >
                Return to dashboard →
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate('/login')}
                  style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 500, color: '#0d0b1a', background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 12px' }}
                >
                  Sign in
                </button>
                <button
                  onClick={goToApp}
                  style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 600, color: '#fff', background: '#5B50FF', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', letterSpacing: '0.01em', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.target.style.background = '#6E63FF'}
                  onMouseLeave={e => e.target.style.background = '#5B50FF'}
                >
                  Start free →
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── 2. HERO ── */}
      <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '80px', paddingBottom: '80px', position: 'relative', overflow: 'hidden', background: '#f5f5f5' }}>
        {/* Atmospheric glow */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 65% 40%, rgba(91,80,255,0.08), transparent 60%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontSize: 'clamp(48px, 8vw, 80px)',
              fontWeight: 400,
              lineHeight: 0.96,
              letterSpacing: '-0.04em',
              color: '#0d0b1a',
              marginBottom: '20px',
            }}
          >
            Presentations that make<br />
            {'people go '}
            <span style={{ display: 'inline-flex', background: '#5B50FF', borderRadius: '6px', verticalAlign: 'bottom', overflow: 'hidden', paddingBottom: '3px' }}>
              <TextRotate
                texts={['how?', 'wow.', 'really?', 'that fast?', 'just you?', 'with AI?']}
                rotationInterval={2200}
                staggerDuration={0.025}
                staggerFrom="last"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '-120%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                mainClassName="text-white px-3 py-1 overflow-hidden justify-center"
                splitLevelClassName="overflow-hidden pb-0.5"
              />
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            style={{ fontFamily: 'Inter, sans-serif', fontSize: '18px', fontWeight: 400, color: '#3d3660', maxWidth: '560px', margin: '0 auto 36px', lineHeight: 1.6 }}
          >
            HyperBeing generates each slide as a fully art-directed image.{' '}
            No templates. No compromise. McKinsey substance, Apple finish.
          </motion.p>

          {/* CTA row */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}
          >
            <button
              onClick={goToApp}
              style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', fontWeight: 600, color: '#fff', background: '#5B50FF', border: 'none', borderRadius: '6px', padding: '12px 24px', cursor: 'pointer', letterSpacing: '0.01em', transition: 'background 0.15s', boxShadow: 'rgba(91,80,255,0.25) 0px 4px 16px' }}
              onMouseEnter={e => e.target.style.background = '#6E63FF'}
              onMouseLeave={e => e.target.style.background = '#5B50FF'}
            >
              Generate your first deck →
            </button>
            <a
              href="#demo"
              style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', fontWeight: 500, color: '#0d0b1a', background: 'transparent', border: '0.5px solid #e8e8f0', borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', transition: 'border-color 0.15s' }}
              onMouseEnter={e => e.target.style.borderColor = 'rgba(91,80,255,0.3)'}
              onMouseLeave={e => e.target.style.borderColor = '#e8e8f0'}
            >
              See examples
            </a>
          </motion.div>

          {/* Trust line */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#6b6490' }}
          >
            Used by brand teams, investors, analysts &amp; agencies at top-tier companies
          </motion.p>
        </div>
        {/* Blend into dark section */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 160, background: 'linear-gradient(to bottom, transparent, #080808)', pointerEvents: 'none', zIndex: 2 }} />
      </section>

      {/* ── 4. PRODUCT DEMO ── */}
      <section id="demo" style={{ background: '#080808', padding: '0 24px 120px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <Reveal>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', letterSpacing: '0.20em', color: '#5B50FF', textTransform: 'uppercase', marginBottom: '20px', textAlign: 'center' }}>HYPERBEING IN ACTION</p>
            <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.05, letterSpacing: '-0.03em', color: '#f0f0ee', textAlign: 'center', marginBottom: '56px' }}>
              Watch the blank become{' '}
              <em>brilliant.</em>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <div style={{ boxShadow: 'rgba(91,80,255,0.25) 0px 0px 48px 0px' }}>
              <ProductMockup />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 5. FEATURE SPLITS ── */}
      <section style={{ background: '#f5f5f5', padding: '120px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '120px' }}>
          {FEATURE_SPLITS.map((f, i) => (
            <Reveal key={i} delay={0.05}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '80px', alignItems: 'center' }}>
                {/* Text side */}
                <div style={{ order: f.side === 'right' ? 0 : 1 }}>
                  <h3 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0d0b1a', marginBottom: '20px' }}>
                    <em>{f.headline}</em>
                  </h3>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px', color: '#3d3660', lineHeight: 1.65 }}>{f.body}</p>
                </div>
                {/* Visual side */}
                <div style={{ order: f.side === 'right' ? 1 : 0 }}>
                  <FeatureVisual type={f.visual} />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 6. DECK GALLERY ── */}
      <section style={{ background: '#080808', padding: '120px 0' }}>
        <Reveal>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', letterSpacing: '0.20em', color: '#5B50FF', textTransform: 'uppercase', marginBottom: '20px', textAlign: 'center' }}>MADE WITH HYPERBEING</p>
          <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.05, letterSpacing: '-0.03em', color: '#f0f0ee', textAlign: 'center', marginBottom: '64px' }}>
            Decks that do the talking.
          </h2>
        </Reveal>
        <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', padding: '0 48px 16px', scrollbarWidth: 'none' }}>
          {[
            { title: 'Series A Pitch', category: 'FINTECH · 2024', gradient: 'linear-gradient(135deg, #1a1040 0%, #5B50FF 100%)' },
            { title: 'Board Update Q4', category: 'ENTERPRISE · 2024', gradient: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%)' },
            { title: 'Agency Case Study', category: 'AGENCY · 2024', gradient: 'linear-gradient(135deg, #1a0a2e 0%, #4a1882 100%)' },
            { title: 'Product Launch', category: 'SAAS · 2024', gradient: 'linear-gradient(135deg, #0a1a18 0%, #0d5c52 100%)' },
            { title: 'Investor Deck', category: 'VC · 2024', gradient: 'linear-gradient(135deg, #1a1200 0%, #856512 100%)' },
            { title: 'Sales Deck', category: 'SALES · 2024', gradient: 'linear-gradient(135deg, #1a0808 0%, #8B1a1a 100%)' },
          ].map((deck, i) => (
            <DeckCard key={deck.title} delay={i * 0.07} {...deck} />
          ))}
        </div>
      </section>

      {/* ── 7. FEATURE GRID ── */}
      <section style={{ background: '#ffffff', padding: '120px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: '64px' }}>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', letterSpacing: '0.20em', color: '#5B50FF', textTransform: 'uppercase', marginBottom: '16px' }}>FEATURES</p>
              <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0d0b1a' }}>
                Everything you need.<br /><em>Nothing you don't.</em>
              </h2>
            </div>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1px', background: '#e8e8f0', border: '0.5px solid #e8e8f0', borderRadius: '8px', overflow: 'hidden' }}>
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.05}>
                <div
                  style={{ background: '#ffffff', padding: '32px', position: 'relative', transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafaff'}
                  onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
                >
                  <div style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '20px', color: '#5B50FF' }}>{f.icon}</span>
                  </div>
                  <h3 style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px', fontWeight: 600, color: '#0d0b1a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {f.title}
                    {f.soon && (
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '9px', fontWeight: 600, color: '#5B50FF', background: 'rgba(91,80,255,0.1)', border: '0.5px solid rgba(91,80,255,0.2)', borderRadius: '4px', padding: '2px 6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Soon</span>
                    )}
                  </h3>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#6b6490', lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 9. FINAL CTA ── */}
      <section style={{ background: '#5B50FF', padding: '120px 24px', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 400, lineHeight: 1.05, letterSpacing: '-0.03em', color: '#ffffff', marginBottom: '16px' }}>
            Your next deck is{' '}
            <em>3 minutes away.</em>
          </h2>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '18px', color: 'rgba(255,255,255,0.75)', marginBottom: '40px' }}>
            No design experience needed. No templates. Just your ideas.
          </p>
          <button
            onClick={goToApp}
            style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', fontWeight: 600, color: '#5B50FF', background: '#ffffff', border: 'none', borderRadius: '6px', padding: '14px 32px', cursor: 'pointer', transition: 'opacity 0.15s', boxShadow: 'rgba(0,0,0,0.2) 0px 4px 16px' }}
            onMouseEnter={e => e.target.style.opacity = '0.9'}
            onMouseLeave={e => e.target.style.opacity = '1'}
          >
            Start for free →
          </button>
        </Reveal>
      </section>

      {/* ── 10. FOOTER ── */}
      <footer style={{ background: '#ffffff', borderTop: '0.5px solid #e8e8f0', padding: '64px 24px 40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: '48px', marginBottom: '48px' }}>
            {/* Brand */}
            <div>
              <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', marginBottom: '12px' }}>
                <HBIcon size={24} />
                <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '14px', color: '#0d0b1a', letterSpacing: '-0.02em' }}>HyperBeing</span>
              </Link>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#6b6490', maxWidth: '180px', lineHeight: 1.6 }}>AI-powered presentation studio.</p>
            </div>
            {/* Product */}
            <div>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: 600, color: '#0d0b1a', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>Product</p>
              {['Features', 'Examples', 'Pricing', 'Enterprise'].map(l => (
                <a key={l} href="#" style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#6b6490', textDecoration: 'none', marginBottom: '10px', transition: 'color 0.15s' }}
                   onMouseEnter={e => e.target.style.color = '#0d0b1a'}
                   onMouseLeave={e => e.target.style.color = '#6b6490'}>{l}</a>
              ))}
            </div>
            {/* Company */}
            <div>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: 600, color: '#0d0b1a', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>Company</p>
              {['About', 'Blog', 'Careers', 'Contact'].map(l => (
                <a key={l} href="#" style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#6b6490', textDecoration: 'none', marginBottom: '10px', transition: 'color 0.15s' }}
                   onMouseEnter={e => e.target.style.color = '#0d0b1a'}
                   onMouseLeave={e => e.target.style.color = '#6b6490'}>{l}</a>
              ))}
            </div>
            {/* Legal */}
            <div>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: 600, color: '#0d0b1a', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>Legal</p>
              {[{ label: 'Privacy', to: '/privacy' }, { label: 'Terms', to: '/terms' }].map(l => (
                <Link key={l.label} to={l.to} style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#6b6490', textDecoration: 'none', marginBottom: '10px' }}>{l.label}</Link>
              ))}
            </div>
          </div>
          <div style={{ borderTop: '0.5px solid #e8e8f0', paddingTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#6b6490' }}>&copy; {new Date().getFullYear()} HyperBeing. All rights reserved.</p>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#6b6490' }}>Made with ✦ and a lot of AI</p>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @media (max-width: 768px) {
          section > div > div[style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
          footer > div > div[style*="grid-template-columns: auto 1fr 1fr 1fr"] {
            grid-template-columns: 1fr 1fr !important;
          }
          div[style*="gap: 48px"][style*="align-items: center"] > div[style*="order:"] {
            order: unset !important;
          }
          nav > div[style*="max-width: 1200px"] > div[style*="justify-content: center"] {
            display: none !important;
          }
          nav > div[style*="max-width: 1200px"] {
            gap: 12px !important;
          }
        }
      `}</style>
    </div>
  );
}
