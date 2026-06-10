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
    headline: 'Nova reads your room.',
    body: 'Paste your brief and Nova — our AI agent — absorbs the whole thing before generating a single question. The plan it builds is specific to you: your audience, your story, your stakes.',
    visual: 'nova-chat',
    side: 'right',
  },
  {
    headline: 'The kind of slides that close deals.',
    body: 'Every slide is a fully art-directed image. No clip art, no templates. Consultants, VCs, and agency leads use HyperBeing for their highest-stakes presentations.',
    visual: 'slide-showcase',
    side: 'left',
  },
  {
    headline: '20 slides. Under 3 minutes.',
    body: 'From a rough outline to a fully designed, image-complete deck. No waiting for a designer. No back-and-forth. Just done.',
    visual: 'speed-meter',
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

/* ─── Feature visuals ─── */
function FeatureVisual({ type }) {

  /* ── Nova chat interface ── */
  if (type === 'nova-chat') {
    const plan = [
      { n: '01', title: 'Market Opportunity', note: 'TAM/SAM/SOM · growth vectors' },
      { n: '02', title: 'The Problem',         note: 'B2B friction · incumbent gaps' },
      { n: '03', title: 'Our Solution',         note: 'Core product · differentiation' },
      { n: '04', title: 'Business Model',       note: 'Revenue · unit economics' },
      { n: '05', title: 'Traction & Metrics',   note: 'ARR · growth rate · key logos' },
      { n: '06', title: 'The Ask',              note: 'Raise · use of funds · milestones' },
    ];
    return (
      <div style={{ background: '#080808', borderRadius: '12px', border: '0.5px solid #1a1a1a', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>
        {/* Title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '0.5px solid #1a1a1a', background: '#0a0a0b' }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {['#ff5f57', '#febc2e', '#28c840'].map((c, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: 0.45 }} />
            ))}
          </div>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#444', letterSpacing: '0.12em', marginLeft: 6 }}>HYPERBEING · NOVA CHAT</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: '#22c55e' }}>NOVA ONLINE</span>
          </div>
        </div>

        {/* Messages */}
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* User bubble */}
          <div style={{ alignSelf: 'flex-end', maxWidth: '78%', background: '#14103a', border: '0.5px solid rgba(91,80,255,0.3)', borderRadius: '10px 10px 2px 10px', padding: '8px 12px' }}>
            <p style={{ fontSize: 11, color: '#c8c4e8', margin: 0, lineHeight: 1.55 }}>
              Series A pitch deck for a fintech startup disrupting B2B payments — targeting US mid-market CFOs
            </p>
          </div>

          {/* Nova reply — video avatar drops naturally here */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(139,92,246,0.35)', background: '#0a0a0b' }}>
              <video autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }}>
                <source src="/nova-mascot.mp4" type="video/mp4" />
              </video>
            </div>
            <div style={{ flex: 1, background: '#111', border: '0.5px solid #1e1e1e', borderRadius: '2px 10px 10px 10px', padding: '9px 12px' }}>
              <p style={{ fontSize: 11, color: '#e0dcff', margin: '0 0 3px', lineHeight: 1.55 }}>ok i've read this. strong angle — CFO pain is real.</p>
              <p style={{ fontSize: 11, color: '#666', margin: 0, lineHeight: 1.5 }}>here's the deck structure i'm building:</p>
            </div>
          </div>

          {/* Slide plan card */}
          <div style={{ background: '#0c0c0c', border: '0.5px solid rgba(91,80,255,0.18)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '7px 12px', borderBottom: '0.5px solid #161616', display: 'flex', alignItems: 'center' }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: '#5B50FF', letterSpacing: '0.15em' }}>SLIDE PLAN · 12 SLIDES</span>
              <div style={{ marginLeft: 'auto', background: 'rgba(91,80,255,0.1)', border: '0.5px solid rgba(91,80,255,0.28)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, color: '#8B80FF', fontWeight: 600, letterSpacing: '0.05em' }}>APPROVE →</span>
              </div>
            </div>
            {plan.map(({ n, title, note }) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 12px', borderBottom: '0.5px solid #0f0f0f' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: '#5B50FF', width: 16, flexShrink: 0 }}>{n}</span>
                <span style={{ fontSize: 10, color: '#ccc', flex: 1 }}>{title}</span>
                <span style={{ fontSize: 9, color: '#3a3a3a', fontStyle: 'italic', whiteSpace: 'nowrap' }}>{note}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── Slide output showcase ── */
  if (type === 'slide-showcase') {
    const slides = [
      { g: 'linear-gradient(135deg, #0d0a2e 0%, #5B50FF 100%)', accent: '#8B80FF', n: '01' },
      { g: 'linear-gradient(135deg, #06101e 0%, #0e4a7a 100%)', accent: '#38bdf8', n: '02' },
      { g: 'linear-gradient(135deg, #0f0818 0%, #6d28d9 100%)', accent: '#a78bfa', n: '03', selected: true },
      { g: 'linear-gradient(135deg, #050f0a 0%, #064e3b 100%)', accent: '#34d399', n: '04' },
      { g: 'linear-gradient(135deg, #140904 0%, #9a3412 100%)', accent: '#fb923c', n: '05' },
      { g: 'linear-gradient(135deg, #08080f 0%, #2d2b6e 100%)', accent: '#818cf8', n: '06' },
    ];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'Inter, sans-serif' }}>
        {/* Deck meta row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#5B50FF', letterSpacing: '0.15em' }}>SERIES A PITCH · 12 SLIDES</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: '#22c55e' }}>COMPLETE</span>
          </div>
        </div>

        {/* 3×2 slide grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
          {slides.map(({ g, accent, n, selected }) => (
            <div
              key={n}
              style={{
                aspectRatio: '16/9', background: g, borderRadius: 6, overflow: 'hidden',
                border: selected ? `1.5px solid ${accent}` : '0.5px solid #1a1a1a',
                position: 'relative',
                boxShadow: selected ? `0 0 16px rgba(167,139,250,0.22)` : 'none',
              }}
            >
              {/* HB mark */}
              <div style={{ position: 'absolute', top: 5, left: 5, width: 13, height: 13, background: '#5B50FF', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 900, fontSize: 6, color: '#fff', letterSpacing: '-0.1em' }}>HB</span>
              </div>
              {/* Slide index */}
              <div style={{ position: 'absolute', bottom: 7, left: 7 }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 7, color: accent, opacity: 0.9, marginBottom: 3 }}>{n}</div>
                <div style={{ width: 36, height: 1.5, background: accent, opacity: 0.55, borderRadius: 1 }} />
                <div style={{ width: 22, height: 1.5, background: accent, opacity: 0.25, borderRadius: 1, marginTop: 3 }} />
              </div>
              {/* Status dot */}
              <div style={{ position: 'absolute', bottom: 6, right: 6, width: 5, height: 5, borderRadius: '50%', background: accent, opacity: 0.65 }} />
              {/* Selected overlay ring */}
              {selected && (
                <div style={{ position: 'absolute', inset: 0, border: `1px solid ${accent}`, borderRadius: 5, opacity: 0.3, pointerEvents: 'none' }} />
              )}
            </div>
          ))}
        </div>

        {/* Slide editor strip */}
        <div style={{ background: '#0a0a0b', border: '0.5px solid #1a1a1a', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: '0.5px solid #111', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: '#a78bfa' }}>slide_03 · Our Solution</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {['Regenerate', 'Edit prompt', 'Download'].map(a => (
                <div key={a} style={{ background: '#161616', border: '0.5px solid #252525', borderRadius: 4, padding: '2px 7px' }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, color: '#555' }}>{a}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(167,139,250,0.4), transparent)' }} />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: '#333' }}>art-directed · Imagen 3</span>
          </div>
        </div>

        {/* Export row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0a0a0b', border: '0.5px solid #1a1a1a', borderRadius: 7, padding: '8px 12px' }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: '#444', flex: 1 }}>deck_series_a.pptx · 12 slides · 2.4 MB</span>
          <div style={{ background: '#5B50FF', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, fontWeight: 600, color: '#fff' }}>Export →</span>
          </div>
        </div>
      </div>
    );
  }

  /* ── Speed / generation log ── */
  if (type === 'speed-meter') {
    const steps = [
      { label: 'Brief submitted',      time: '0:00', color: '#22c55e', detail: 'Series A fintech pitch · CFO focus' },
      { label: 'Nova analyzes brief',  time: '0:14', color: '#22c55e', detail: '5 follow-up questions answered' },
      { label: 'Slide plan approved',  time: '0:51', color: '#22c55e', detail: '12 slides · 3-act narrative arc' },
      { label: 'Visuals generating',   time: '1:08', color: '#22c55e', detail: 'Imagen 3 · fully art-directed' },
      { label: 'Deck complete',        time: '2:47', color: '#5B50FF', detail: 'Export ready', highlight: true },
    ];
    return (
      <div style={{ background: '#080808', border: '0.5px solid #1a1a1a', borderRadius: 12, padding: '22px', fontFamily: 'Inter, sans-serif' }}>
        {/* Big time */}
        <div style={{ marginBottom: 24 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#5B50FF', letterSpacing: '0.18em', display: 'block', marginBottom: 10 }}>GENERATION LOG</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 48, color: '#f0f0ee', fontWeight: 400, lineHeight: 1, letterSpacing: '-0.03em' }}>2:47</span>
            <span style={{ fontSize: 13, color: '#444' }}>total</span>
          </div>
          {/* Thin progress bar full */}
          <div style={{ marginTop: 12, height: 2, background: '#111', borderRadius: 1, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '100%', background: 'linear-gradient(90deg, #5B50FF, #22c55e)', borderRadius: 1 }} />
          </div>
        </div>

        {/* Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {steps.map(({ label, time, color, detail, highlight }, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {/* Dot + line */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 18, flexShrink: 0 }}>
                <div style={{
                  width: highlight ? 10 : 7, height: highlight ? 10 : 7,
                  borderRadius: '50%', background: color, marginTop: 3, flexShrink: 0,
                  boxShadow: highlight ? '0 0 10px rgba(91,80,255,0.6)' : 'none',
                  border: highlight ? '2px solid rgba(91,80,255,0.35)' : 'none',
                }} />
                {i < steps.length - 1 && (
                  <div style={{ width: 1, flex: 1, minHeight: 18, background: 'rgba(34,197,94,0.15)', margin: '3px 0' }} />
                )}
              </div>
              {/* Text */}
              <div style={{ paddingBottom: i < steps.length - 1 ? 14 : 0, flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, color: highlight ? '#f0f0ee' : '#999', fontWeight: highlight ? 500 : 400 }}>{label}</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: highlight ? '#5B50FF' : '#333', marginLeft: 'auto', flexShrink: 0 }}>{time}</span>
                </div>
                <span style={{ fontSize: 10, color: '#333' }}>{detail}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '0.5px solid #111', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: '#22c55e', letterSpacing: '0.08em' }}>12 slides · fully art-directed · export ready</span>
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
      <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '80px', paddingBottom: '160px', position: 'relative', background: '#f5f5f5' }}>
        {/* Atmospheric glow top-right */}
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

        {/* ── Creative hero→dark blend ── */}
        {/* Multi-layer atmospheric darkening */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 320, pointerEvents: 'none', zIndex: 2 }}>
          {/* Base dark fade */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 0%, rgba(20,10,45,0.55) 45%, rgba(8,8,8,0.92) 72%, #080808 100%)' }} />
          {/* Purple corona bloom centered */}
          <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '700px', height: '260px', background: 'radial-gradient(ellipse at 50% 85%, rgba(139,92,246,0.28) 0%, rgba(91,80,255,0.10) 40%, transparent 70%)' }} />
          {/* Subtle noise texture layer */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.03, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundSize: '200px 200px' }} />
        </div>

        {/* Nova mascot — bridges hero into dark demo section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          style={{ position: 'absolute', bottom: -52, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}
        >
          <motion.div
            animate={{ y: [0, -7, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          >
            {/* Outer glow ring */}
            <div style={{
              position: 'absolute', inset: '-20px',
              background: 'radial-gradient(ellipse, rgba(139,92,246,0.35) 0%, rgba(91,80,255,0.12) 50%, transparent 72%)',
              borderRadius: '50%',
              filter: 'blur(12px)',
            }} />
            {/* Pulsing ring */}
            <motion.div
              animate={{ scale: [1, 1.18, 1], opacity: [0.4, 0.1, 0.4] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute', inset: '-8px',
                border: '1.5px solid rgba(139,92,246,0.5)',
                borderRadius: '50%',
              }}
            />
            <video
              autoPlay loop muted playsInline
              style={{ width: 104, height: 104, objectFit: 'contain', position: 'relative', zIndex: 1 }}
            >
              <source src="/nova-mascot.mp4" type="video/mp4" />
            </video>
          </motion.div>
        </motion.div>
      </section>

      {/* ── 4. PRODUCT DEMO ── */}
      <section id="demo" style={{ background: '#080808', padding: '72px 24px 120px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <Reveal>
            {/* Nova label above section heading */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
              <div style={{ height: '1px', width: '32px', background: 'linear-gradient(to right, transparent, rgba(139,92,246,0.6))' }} />
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', letterSpacing: '0.20em', color: '#8B5CF6', textTransform: 'uppercase' }}>NOVA · HYPERBEING IN ACTION</p>
              <div style={{ height: '1px', width: '32px', background: 'linear-gradient(to left, transparent, rgba(139,92,246,0.6))' }} />
            </div>
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
                <div style={{ order: f.side === 'right' ? 1 : 0, borderRadius: '14px', boxShadow: '0 24px 80px rgba(13,11,26,0.14), 0 4px 24px rgba(91,80,255,0.08)' }}>
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
