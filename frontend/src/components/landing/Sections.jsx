import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useInView, useReducedMotion } from 'framer-motion';
import { Check, Layers, MousePointer2, Play, RotateCcw } from 'lucide-react';
import LiveSlide, { useShowcaseLayout, layerCounts, KIND_META } from './LiveSlide';
import { savePlanIntent } from '../../utils/planIntent';

// ─── Landing-page sections built on real layered slides ────────────────────
// Everything visual here is product output: the showcase decks were built by
// the layered pipeline (public/showcase/*) and are drawn with the app's own
// renderer, so the page shows what a user gets instead of describing it.

const mono = { fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', letterSpacing: '0.20em', textTransform: 'uppercase' };
const serif = { fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 400, letterSpacing: '-0.03em' };
const sans = { fontFamily: 'Inter, sans-serif' };
const EASE = [0.16, 1, 0.3, 1];

export const SHOWCASE_DECKS = [
  {
    id: 'rahi', tab: 'Campaign strategy', name: 'Rahi: a 90-day city launch', who: 'Marketing team, launch plan',
    brief: 'A 90-day launch plan for Rahi, a bike-taxi app, in Lahore. Three stages: seed on campuses with free first rides, build the commute habit with passes and streaks, then spread through referrals. Targets: 40,000 first rides and 12,000 weekly riders by day 90. Dark, bold, street-level.',
    slides: [
      { n: 0, title: 'Cover', what: 'One cinematic photograph with the headline as live text on top.', layers: 7, images: 1 },
      { n: 1, title: 'The three stages', what: 'Three columns joined by arrows. Nine photographs from a single image generation.', layers: 61, images: 1 },
      { n: 2, title: 'The target curve', what: 'A real chart with editable numbers. No image generation at all.', layers: 17, images: 0 },
    ],
  },
  {
    id: 'morrow', tab: 'Investor pitch', name: 'Morrow: Series A', who: 'Founder, fundraising deck',
    brief: 'Series A deck for Morrow, a chain of neighbourhood refill grocery shops. Explain how a refill works in three steps, then show traction across our six shops with weekly baskets per shop and the 68% two-week return rate. Light, calm, editorial.',
    slides: [
      { n: 0, title: 'How a refill works', what: 'One large photograph beside a three-step journey.', layers: 21, images: 1 },
      { n: 1, title: 'Traction', what: 'Six shops, six photographs, one image generation.', layers: 35, images: 1 },
    ],
  },
];

function Eyebrow({ children, color = '#5B50FF', style }) {
  return <p style={{ ...mono, color, marginBottom: 16, ...style }}>{children}</p>;
}

// ─── 1. Watch a slide build ────────────────────────────────────────────────
const BUILDS = [
  { url: '/showcase/rahi/s1.json', brief: 'Launch plan for Rahi bike-taxi: three stages over 90 days, with the targets', images: 1 },
  { url: '/showcase/morrow/s0.json', brief: 'Explain how a Morrow refill works, in three steps', images: 1 },
  { url: '/showcase/rahi/s2.json', brief: 'Show the target curve: paid rides overtaking free rides by week 13', images: 0 },
];

export function BuildDemo() {
  const ref = useRef(null);
  const inView = useInView(ref, { margin: '-120px' });
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState('typing'); // typing → designing → built
  const build = BUILDS[i];
  const layout = useShowcaseLayout(build.url);
  const counts = layerCounts(layout);
  const total = layout?.layers?.length || 0;

  useEffect(() => {
    if (!inView) return undefined;
    if (reduce) { setTyped(build.brief); setPhase('built'); return undefined; }
    let t;
    if (phase === 'typing') {
      if (typed.length < build.brief.length) t = setTimeout(() => setTyped(build.brief.slice(0, typed.length + 2)), 22);
      else t = setTimeout(() => setPhase('designing'), 350);
    } else if (phase === 'designing') {
      t = setTimeout(() => setPhase('built'), 900);
    } else {
      t = setTimeout(() => { setI(v => (v + 1) % BUILDS.length); setTyped(''); setPhase('typing'); }, 7500);
    }
    return () => clearTimeout(t);
  }, [inView, phase, typed, build.brief, reduce]);

  return (
    <div ref={ref}>
      {/* The brief */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#17171a', border: '0.5px solid #2a2a30', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
        <span style={{ ...mono, color: '#8B80FF', flexShrink: 0 }}>Brief</span>
        <p style={{ ...sans, fontSize: 14, color: '#e8e8ee', margin: 0, minHeight: 21, flex: 1, textAlign: 'left' }}>
          {typed}{phase === 'typing' && !reduce && <span style={{ display: 'inline-block', width: 2, height: 15, background: '#8B80FF', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s infinite' }} />}
        </p>
        <span style={{ ...sans, fontSize: 12, fontWeight: 600, color: phase === 'built' ? '#4ADE80' : '#8B80FF', flexShrink: 0 }}>
          {phase === 'typing' ? 'Reading' : phase === 'designing' ? 'Designing layers' : 'Done'}
        </span>
      </div>

      {/* The slide, assembling from its real layers */}
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '0.5px solid #2a2a30', background: '#0b0b0c' }}>
        <div style={{ opacity: phase === 'built' ? 1 : 0.0, transition: 'opacity 0.3s' }}>
          <LiveSlide layout={layout} mode="build" playKey={phase === 'built' ? `b${i}` : `w${i}`} radius={0} />
        </div>
        {phase !== 'built' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #2a2a30', borderTopColor: '#8B80FF', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ ...sans, fontSize: 13, color: '#8a8a96' }}>{phase === 'typing' ? 'Waiting for the brief' : 'Nova is laying out the slide'}</span>
          </div>
        )}
      </div>

      {/* What was just made */}
      <div className="hb-build-facts" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 20px', marginTop: 16, minHeight: 22 }}>
        {phase === 'built' && total > 0 && [
          `${total} editable layers`,
          `${counts.text} text boxes`,
          counts.image ? `${counts.image} ${counts.image === 1 ? 'picture' : 'pictures'}` : null,
          counts.chart ? `${counts.chart} live chart` : null,
          `${build.images} image ${build.images === 1 ? 'generation' : 'generations'}`,
        ].filter(Boolean).map((t, k) => (
          <motion.span key={`${i}-${t}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6 + k * 0.12 }}
            style={{ ...sans, fontSize: 13, color: '#b9b9c6', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Check size={13} color="#4ADE80" strokeWidth={3} />{t}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

// ─── 2. Every layer is yours ───────────────────────────────────────────────
const MODES = [
  { key: 'static', label: 'Finished slide' },
  { key: 'layers', label: 'Show layers', icon: Layers },
  { key: 'apart', label: 'Pull apart', icon: Layers },
  { key: 'play', label: 'Drag anything', icon: MousePointer2 },
];

export function LayerExplorer() {
  const [mode, setMode] = useState('static');
  const [resetKey, setResetKey] = useState(0);
  const [dragged, setDragged] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-200px' });
  const reduce = useReducedMotion();
  const layout = useShowcaseLayout('/showcase/rahi/s1.json');
  const counts = layerCounts(layout);
  const touched = useRef(false);

  // First time it scrolls into view, pull the slide apart once to show what
  // it is made of, then settle on the outlined view. Stops if the visitor has
  // already picked a mode themselves.
  useEffect(() => {
    if (!inView || reduce || !layout) return undefined;
    const a = setTimeout(() => { if (!touched.current) setMode('apart'); }, 600);
    const b = setTimeout(() => { if (!touched.current) setMode('layers'); }, 3600);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [inView, reduce, layout]);

  const pick = (m) => { touched.current = true; setMode(m); };

  return (
    <section id="layers" style={{ background: '#f5f5f5', padding: '120px 24px', overflow: 'hidden' }}>
      <div className="hb-layers-grid" style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 0.8fr) minmax(0, 1.6fr)', gap: 56, alignItems: 'center' }}>
        <div>
          <Eyebrow>Not a picture of a slide</Eyebrow>
          <h2 style={{ ...serif, fontSize: 'clamp(34px, 4.4vw, 52px)', lineHeight: 1.05, color: '#0d0b1a', marginBottom: 20 }}>
            Art-directed like an image. <em>Editable like a deck.</em>
          </h2>
          <p style={{ ...sans, fontSize: 16, color: '#3d3660', lineHeight: 1.65, marginBottom: 28 }}>
            Most AI slides are one flat image: beautiful until you need to fix a number. HyperBeing designs the whole slide, then gives you every piece as its own layer. Retype a line, move a photo, change the chart. It exports to PowerPoint the same way.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28 }}>
            {[['text', 'text boxes you can retype'], ['image', 'separate pictures'], ['shape', 'native shapes'], ['icon', 'icons']].map(([k, label]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '12px 14px', background: '#fff', border: '0.5px solid #e8e8f0', borderRadius: 10 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: KIND_META[k].color, flexShrink: 0, transform: 'translateY(-1px)' }} />
                <span style={{ ...sans, fontSize: 22, fontWeight: 700, color: '#0d0b1a', fontVariantNumeric: 'tabular-nums' }}>{counts[k] || 0}</span>
                <span style={{ ...sans, fontSize: 13, color: '#6b6490' }}>{label}</span>
              </div>
            ))}
          </div>
          <p style={{ ...sans, fontSize: 13, color: '#6b6490', lineHeight: 1.6 }}>
            This slide used <strong style={{ color: '#0d0b1a' }}>one image generation</strong> for all nine photographs. Everything else is native, so edits to it are instant and free.
          </p>
        </div>

        <div ref={ref}>
          <div role="tablist" aria-label="Slide view" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {MODES.map(m => {
              const active = mode === m.key;
              return (
                <button key={m.key} role="tab" aria-selected={active} onClick={() => pick(m.key)}
                  style={{ ...sans, fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                    border: active ? '1px solid #0d0b1a' : '1px solid #dcdce6', background: active ? '#0d0b1a' : '#fff', color: active ? '#fff' : '#3d3660', transition: 'all 0.15s' }}>
                  {m.icon && <m.icon size={13} />}{m.label}
                </button>
              );
            })}
            {mode === 'play' && dragged && (
              <button onClick={() => { setResetKey(k => k + 1); setDragged(false); }}
                style={{ ...sans, fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #dcdce6', background: '#fff', color: '#3d3660' }}>
                <RotateCcw size={13} /> Reset
              </button>
            )}
          </div>
          <div style={{ borderRadius: 14, boxShadow: mode === 'apart' ? 'none' : '0 24px 80px rgba(13,11,26,0.18), 0 4px 24px rgba(91,80,255,0.08)', background: mode === 'apart' ? 'transparent' : '#0b0b0c', transition: 'box-shadow 0.4s' }}>
            <LiveSlide layout={layout} mode={mode} playKey={resetKey} onDragged={() => setDragged(true)} />
          </div>
          <p style={{ ...sans, fontSize: 12, color: '#6b6490', marginTop: mode === 'apart' ? 56 : 12, minHeight: 18, transition: 'margin 0.4s' }}>
            {mode === 'play' ? 'This is the live slide, not a screenshot. Grab a photo, a pill or the headline and move it.'
              : mode === 'static' ? 'Example slide from a fictional launch plan.'
                : mode === 'apart' ? 'The same slide, pulled apart: a background, native shapes, nine separate pictures and live text.'
                  : 'Dashed outlines are native text, shapes and icons. Solid outlines are generated pictures.'}
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── 3. Example decks ──────────────────────────────────────────────────────
export function DeckShowcase() {
  const [d, setD] = useState(0);
  const [s, setS] = useState(0);
  const deck = SHOWCASE_DECKS[d];
  const slide = deck.slides[s];
  const pickDeck = (k) => { setD(k); setS(0); };

  return (
    <section id="examples" style={{ background: '#080808', padding: '120px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Eyebrow color="#8B80FF">From one brief</Eyebrow>
          <h2 style={{ ...serif, fontSize: 'clamp(36px, 5vw, 56px)', lineHeight: 1.05, color: '#f0f0ee', marginBottom: 14 }}>
            Decks that do the talking.
          </h2>
          <p style={{ ...sans, fontSize: 16, color: '#9a9aa8', maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
            Two example decks, two visual languages. Nobody picked a template: the look comes from the brief.
          </p>
        </div>

        <div role="tablist" aria-label="Example decks" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
          {SHOWCASE_DECKS.map((x, k) => (
            <button key={x.id} role="tab" aria-selected={k === d} onClick={() => pickDeck(k)}
              style={{ ...sans, fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 999, cursor: 'pointer', border: k === d ? '1px solid #f0f0ee' : '1px solid #2a2a30', background: k === d ? '#f0f0ee' : 'transparent', color: k === d ? '#080808' : '#b9b9c6', transition: 'all 0.15s' }}>
              {x.tab}
            </button>
          ))}
        </div>

        <div className="hb-showcase-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.75fr) minmax(0, 1fr)', gap: 28, alignItems: 'start' }}>
          <div>
            <div style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 14, overflow: 'hidden', border: '0.5px solid #2a2a30', background: '#0f0f10' }}>
              <AnimatePresence mode="wait">
                <motion.img key={`${deck.id}-${slide.n}`} src={`/showcase/${deck.id}/s${slide.n}.jpg`} alt={`${deck.name}, slide: ${slide.title}`}
                  initial={{ opacity: 0, scale: 1.015 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </AnimatePresence>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              {deck.slides.map((x, k) => (
                <button key={x.n} onClick={() => setS(k)} aria-label={`Show slide: ${x.title}`} aria-current={k === s}
                  style={{ flex: '0 0 auto', width: 'min(22%, 168px)', padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'none', border: k === s ? '2px solid #8B80FF' : '2px solid transparent', opacity: k === s ? 1 : 0.55, transition: 'all 0.15s' }}>
                  <img src={`/showcase/${deck.id}/s${x.n}.jpg`} alt="" loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: '#0f0f10', border: '0.5px solid #2a2a30', borderRadius: 14, padding: 24 }}>
            <p style={{ ...mono, color: '#8B80FF', marginBottom: 6 }}>{deck.who}</p>
            <h3 style={{ ...serif, fontSize: 26, color: '#f0f0ee', letterSpacing: '-0.02em', marginBottom: 18 }}>{deck.name}</h3>
            <p style={{ ...mono, color: '#6f6f7c', marginBottom: 8 }}>The brief</p>
            <p style={{ ...sans, fontSize: 14, color: '#c9c9d4', lineHeight: 1.65, marginBottom: 22, paddingLeft: 12, borderLeft: '2px solid #2a2a30' }}>{deck.brief}</p>
            <p style={{ ...mono, color: '#6f6f7c', marginBottom: 8 }}>This slide</p>
            <p style={{ ...sans, fontSize: 15, fontWeight: 600, color: '#f0f0ee', marginBottom: 4 }}>{slide.title}</p>
            <p style={{ ...sans, fontSize: 14, color: '#9a9aa8', lineHeight: 1.6, marginBottom: 18 }}>{slide.what}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[[slide.layers, 'editable layers'], [slide.images, slide.images === 1 ? 'image generation' : 'image generations']].map(([n, label]) => (
                <div key={label} style={{ padding: '12px 14px', background: '#151517', border: '0.5px solid #2a2a30', borderRadius: 10 }}>
                  <p style={{ ...sans, fontSize: 26, fontWeight: 700, color: '#f0f0ee', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{n}</p>
                  <p style={{ ...sans, fontSize: 12, color: '#8a8a96' }}>{label}</p>
                </div>
              ))}
            </div>
            <p style={{ ...sans, fontSize: 12, color: '#6f6f7c', marginTop: 16, lineHeight: 1.5 }}>Example deck for a fictional brand.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 4. Pricing strip ──────────────────────────────────────────────────────
// Mirrors backend/config/credits.js (18 credits a slide, plan credits) and the
// plan prices on pages/Pricing.jsx. Change them together.
const CREDITS_PER_SLIDE = 18;
const TEASER_PLANS = [
  { key: 'free', name: 'Free', price: 0, credits: 54, line: 'See your own brief as slides', cta: 'Start free' },
  { key: 'basic', name: 'Basic', price: 25, annual: 20, credits: 1200, line: 'A few decks a month', cta: 'Choose Basic' },
  { key: 'pro', name: 'Pro', price: 65, annual: 52, credits: 3200, line: 'Decks every week', cta: 'Choose Pro', popular: true },
  { key: 'ultra', name: 'Ultra', price: 149, annual: 116, credits: 8000, line: 'Agencies and power users', cta: 'Choose Ultra', from: true },
];

export function PricingTeaser({ user }) {
  const navigate = useNavigate();
  const choose = (plan) => {
    if (plan.key === 'free') { navigate(user ? '/dashboard' : '/login'); return; }
    if (user) { navigate(`/pricing?plan=${plan.key}`); return; }
    // Remember the plan through sign-up so they land back on it, ready to pay.
    savePlanIntent({ plan: plan.key, billing: 'annual' });
    navigate('/login');
  };
  return (
    <section id="pricing" style={{ background: '#f5f5f5', padding: '120px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Eyebrow>Pricing</Eyebrow>
          <h2 style={{ ...serif, fontSize: 'clamp(32px, 4vw, 48px)', lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0d0b1a', marginBottom: 12 }}>
            Pay for slides, <em>not seats.</em>
          </h2>
          <p style={{ ...sans, fontSize: 16, color: '#3d3660', maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
            A slide costs {CREDITS_PER_SLIDE} credits. Moving, retyping and restyling layers is free. Exports are free.
          </p>
        </div>
        <div className="hb-pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
          {TEASER_PLANS.map(p => (
            <div key={p.key} style={{ position: 'relative', background: '#fff', borderRadius: 14, padding: '28px 24px 24px', border: p.popular ? '2px solid #5B50FF' : '0.5px solid #e8e8f0', boxShadow: p.popular ? '0 16px 48px rgba(91,80,255,0.14)' : 'none', display: 'flex', flexDirection: 'column' }}>
              {p.popular && <span style={{ position: 'absolute', top: -11, left: 24, ...sans, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#fff', background: '#5B50FF', borderRadius: 999, padding: '3px 10px' }}>Most popular</span>}
              <p style={{ ...sans, fontSize: 15, fontWeight: 600, color: '#0d0b1a', marginBottom: 4 }}>{p.name}</p>
              <p style={{ ...sans, fontSize: 13, color: '#6b6490', marginBottom: 18 }}>{p.line}</p>
              <p style={{ ...sans, color: '#0d0b1a', marginBottom: 2, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                {p.from && <span style={{ fontSize: 13, color: '#6b6490' }}>from</span>}
                <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>${p.price}</span>
                <span style={{ fontSize: 13, color: '#6b6490' }}>{p.price ? '/ month' : 'no card'}</span>
              </p>
              <p style={{ ...sans, fontSize: 12, color: '#6b6490', minHeight: 18, marginBottom: 18 }}>{p.annual ? `$${p.annual} a month billed yearly` : ''}</p>
              <p style={{ ...sans, fontSize: 14, color: '#0d0b1a', fontWeight: 600, marginBottom: 2 }}>
                About {Math.floor(p.credits / CREDITS_PER_SLIDE).toLocaleString()} slides{p.price ? ' a month' : ''}
              </p>
              <p style={{ ...sans, fontSize: 12, color: '#6b6490', marginBottom: 22 }}>{p.credits.toLocaleString()} credits{p.price ? ' every month' : ' to start'}</p>
              <button onClick={() => choose(p)}
                style={{ ...sans, marginTop: 'auto', fontSize: 14, fontWeight: 600, padding: '11px 16px', borderRadius: 8, cursor: 'pointer', border: p.popular ? 'none' : '1px solid #dcdce6', background: p.popular ? '#5B50FF' : '#fff', color: p.popular ? '#fff' : '#0d0b1a', transition: 'opacity 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }} onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
                {p.cta}
              </button>
            </div>
          ))}
        </div>
        <p style={{ ...sans, fontSize: 13, color: '#6b6490', textAlign: 'center', marginTop: 24 }}>
          Cancel any time. Upgrade or downgrade from your account.{' '}
          <a href="/pricing" onClick={(e) => { e.preventDefault(); navigate('/pricing'); }} style={{ color: '#5B50FF', fontWeight: 600, textDecoration: 'none' }}>Compare every plan</a>
        </p>
      </div>
    </section>
  );
}

// ─── 5. Closing film ───────────────────────────────────────────────────────
// The cover photograph of the Rahi example deck, set in motion. Purely
// atmosphere for the last call to action; the still is the poster and the
// only thing shown to visitors who prefer reduced motion.
export function ClosingFilm({ onStart }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const videoRef = useRef(null);
  const inView = useInView(ref, { margin: '200px' });
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (inView) v.play().catch(() => {}); else v.pause();
  }, [inView]);
  return (
    <section ref={ref} style={{ position: 'relative', background: '#0b0b0c', padding: '160px 24px', textAlign: 'center', overflow: 'hidden' }}>
      {reduce ? (
        <img src="/showcase/rahi/cover-loop.jpg" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <video ref={videoRef} muted loop playsInline preload="none" poster="/showcase/rahi/cover-loop.jpg" aria-hidden="true"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}>
          <source src="/showcase/rahi/cover-loop.mp4" type="video/mp4" />
        </video>
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,8,8,0.82) 0%, rgba(8,8,8,0.62) 50%, rgba(8,8,8,0.88) 100%)' }} />
      <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>
        <h2 style={{ ...serif, fontSize: 'clamp(36px, 5vw, 64px)', lineHeight: 1.05, color: '#ffffff', marginBottom: 16 }}>
          Your brief is already <em>a deck.</em>
        </h2>
        <p style={{ ...sans, fontSize: 18, color: 'rgba(255,255,255,0.8)', marginBottom: 36, lineHeight: 1.6 }}>
          Paste it in and watch the first three slides build, free. No card, no template to pick.
        </p>
        <button onClick={onStart}
          style={{ ...sans, fontSize: 15, fontWeight: 600, color: '#0d0b1a', background: '#ffffff', border: 'none', borderRadius: 6, padding: '14px 32px', cursor: 'pointer', boxShadow: 'rgba(0,0,0,0.3) 0px 4px 16px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Play size={15} fill="#0d0b1a" /> Build my first deck
        </button>
        <p style={{ ...mono, color: 'rgba(255,255,255,0.45)', marginTop: 28 }}>Cover photograph from the Rahi example deck</p>
      </div>
    </section>
  );
}

// Shared responsive rules for the sections above.
export function LandingSectionStyles() {
  return (
    <style>{`
      @media (max-width: 900px) {
        .hb-layers-grid, .hb-showcase-grid { grid-template-columns: minmax(0, 1fr) !important; gap: 32px !important; }
        .hb-pricing-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      }
      @media (max-width: 560px) {
        .hb-pricing-grid { grid-template-columns: minmax(0, 1fr) !important; }
      }
    `}</style>
  );
}
