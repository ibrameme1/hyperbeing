import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Nova from './Nova';
import { NOVA_LINES } from '../../pages/landingData';

// Nova as the landing page's guide. One fixed element that:
//  - sits in the hero (on the [data-nova-slot] placeholder) while it's in view,
//  - glides down to a dock in the corner once you scroll past it, and
//    follows you from section to section,
//  - says one short line per section ([data-nova] on each <section>), shown
//    for a few seconds as the section reaches the middle of the screen,
//  - can be clicked for the line again plus a "make my first deck" link.
// The visitor can mute the lines (kept for the session); Nova stays.

const MOODS = {
  hero: 'wave', marquee: 'wow', wall: 'idle', studio: 'think', work: 'happy', range: 'idle',
  compare: 'wow', numbers: 'happy', features: 'idle', pricing: 'idle', faq: 'think', cta: 'happy',
};
const SHOW_MS = 5200;
const MOBILE_SECTIONS = ['marquee', 'compare', 'pricing', 'cta'];
const MUTE_KEY = 'hb_nova_quiet';

const readMuted = () => { try { return sessionStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } };

export default function LandingNova({ rootRef, startHref, signedIn }) {
  const boxRef = useRef(null);
  const [section, setSection] = useState('hero');
  const [docked, setDocked] = useState(false);
  const [bubble, setBubble] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const hideTimer = useRef(0);
  const mutedRef = useRef(false);

  useEffect(() => { const m = readMuted(); setMuted(m); mutedRef.current = m; }, []);

  const flash = (ms = SHOW_MS) => {
    if (mutedRef.current) return;
    setBubble(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBubble(false), ms);
  };

  // Position: follow the hero slot, otherwise the dock. Lerped in rAF and
  // only while moving, so an idle page costs nothing.
  useEffect(() => {
    const root = rootRef.current;
    const box = boxRef.current;
    if (!root || !box) return undefined;
    const slot = root.querySelector('[data-nova-slot]');
    const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let x = 0; let y = 0; let s = 1; let raf = 0; let first = true; let isDocked = false;

    const target = () => {
      const isNarrow = innerWidth <= 760;
      const base = isNarrow ? 64 : 92; // svg width when docked
      const r = slot?.getBoundingClientRect();
      if (r && r.bottom > 70 && r.top < innerHeight) {
        const scale = isNarrow ? 1.15 : 1.3;
        return { x: r.left + r.width / 2 - (base * scale) / 2, y: r.top + r.height / 2 - (base * 0.75 * scale) / 2, s: scale, docked: false, isNarrow };
      }
      const bottom = isNarrow ? 96 : 28; // clear the mobile sticky CTA
      return { x: innerWidth - base - (isNarrow ? 14 : 28), y: innerHeight - base * 0.75 - bottom, s: 1, docked: true, isNarrow };
    };
    // Scale only Nova (via --s), never the bubble, so its text stays crisp.
    const paint = () => { box.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; box.style.setProperty('--s', s.toFixed(3)); };
    const tick = () => {
      raf = 0;
      const t = target();
      if (t.docked !== isDocked) { isDocked = t.docked; setDocked(t.docked); }
      setNarrow(t.isNarrow);
      const k = RM || first ? 1 : 0.16;
      first = false;
      x += (t.x - x) * k; y += (t.y - y) * k; s += (t.s - s) * k;
      paint();
      if (Math.abs(t.x - x) > 0.5 || Math.abs(t.y - y) > 0.5 || Math.abs(t.s - s) > 0.005) raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    tick();
    setReady(true);
    addEventListener('scroll', kick, { passive: true });
    addEventListener('resize', kick);
    return () => {
      removeEventListener('scroll', kick);
      removeEventListener('resize', kick);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [rootRef]);

  // Which section is in the middle of the screen.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const io = new IntersectionObserver((es) => {
      es.forEach((en) => { if (en.isIntersecting) setSection(en.target.dataset.nova); });
    }, { rootMargin: '-45% 0px -45% 0px' });
    root.querySelectorAll('[data-nova]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rootRef]);

  // Say hello once, then speak up on each new section.
  useEffect(() => {
    // Phones: no room beside her in the hero, so she waits to be tapped.
    if (innerWidth <= 760) return undefined;
    const t = setTimeout(() => flash(4200), 1400);
    return () => clearTimeout(t);
  }, []);
  const lastSection = useRef('hero');
  useEffect(() => {
    if (section === lastSection.current) return;
    lastSection.current = section;
    // Phones: bubbles cover content, so only speak at the moments that matter.
    if (innerWidth <= 760) {
      if (MOBILE_SECTIONS.includes(section)) flash(3600);
      return;
    }
    flash();
  }, [section]);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const quiet = () => {
    setBubble(false);
    setMuted(true);
    mutedRef.current = true;
    try { sessionStorage.setItem(MUTE_KEY, '1'); } catch { /* private mode */ }
  };
  const onNova = () => {
    if (muted) { setMuted(false); mutedRef.current = false; try { sessionStorage.removeItem(MUTE_KEY); } catch { /* ignore */ } }
    if (bubble) { setBubble(false); clearTimeout(hideTimer.current); return; }
    setBubble(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBubble(false), SHOW_MS * 2);
  };

  const mood = section === 'hero' && !bubble ? 'idle' : MOODS[section] || 'idle';
  const showCta = section === 'pricing' || section === 'cta' || section === 'faq';
  const side = docked ? 'left' : 'right';

  return (
    <div ref={boxRef} className={`lnova ${ready ? 'is-ready' : ''} ${docked ? 'is-docked' : ''}`}>
      <button
        type="button" className="lnova-btn" onClick={onNova}
        aria-label={bubble ? 'Hide Nova’s tip' : 'Nova, your guide. Show a tip'} aria-expanded={bubble}
      >
        <Nova size={narrow ? 64 : 92} mood={mood} />
      </button>
      <div className={`lnova-say nova-say side-${side} ${bubble ? 'on' : ''}`} role="status" aria-live="polite">
        {bubble && (
          <>
            {/* NOVA_LINES are our own constants (bold markup only), not user input. */}
            {/* eslint-disable-next-line react/no-danger */}
            <span dangerouslySetInnerHTML={{ __html: NOVA_LINES[section] || NOVA_LINES.hero }} />
            {(showCta || section === 'hero') && (
              <Link className="lnova-go" to={startHref}>{signedIn ? 'Open my dashboard' : 'Make my first deck'} →</Link>
            )}
            <button type="button" className="lnova-x" onClick={quiet} aria-label="Hide Nova’s tips">×</button>
          </>
        )}
      </div>
    </div>
  );
}
