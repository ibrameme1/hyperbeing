import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LandingNova from '../components/nova/LandingNova';
import {
  thumb, full, SLIDE_ALT, ALL, WALL, CASE, RANGE, STUDIO_SLIDES,
  PLANS, ULTRA_TIERS, ULTRA_FEATURES, FAQ, CREDITS_PER_DECK, FREE_CREDITS,
} from './landingData';
import './landing.css';

// The marketing landing page. Ported from the approved standalone design:
// one midnight stage lit from below. Midnight Black carries the page,
// Electric Blue is the light, Cantaloupe only ever appears as warm light at
// the horizon.
//
// Two rules keep it crawlable:
//  1. Every word and image is in the JSX (no content built in effects), so
//     the build-time prerender (scripts/prerender.mjs) captures it as static
//     HTML for crawlers that don't run JavaScript.
//  2. Nothing reads window/document during render; motion is wired up in one
//     effect after mount.

const fmt = (n) => n.toLocaleString('en-US');
const annualPrice = (monthly, discount) => Math.round(monthly * (1 - discount));
const pad = (n) => String(n).padStart(2, '0');

export default function Homepage() {
  const { user } = useAuth();
  const rootRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rangeKey, setRangeKey] = useState(Object.keys(RANGE)[0]);
  const [annual, setAnnual] = useState(true);
  const [ultraTier, setUltraTier] = useState(0);
  const [lightbox, setLightbox] = useState(null); // { list, i }
  const [copied, setCopied] = useState('');

  const startHref = user ? '/dashboard' : '/login?mode=signup';
  const startLabel = user ? 'Open dashboard' : 'Start free';

  useEffect(() => {
    document.title = 'HyperBeing: AI presentations that make people go how?';
  }, []);

  /* ---------- lightbox ---------- */
  const openLightbox = useCallback((id, scope) => {
    const list = scope
      ? [...new Set([...scope.querySelectorAll('[data-full]')].map((e) => e.dataset.full))]
      : ALL;
    setLightbox({ list, i: Math.max(0, list.indexOf(id)), from: document.activeElement });
  }, []);
  const closeLightbox = useCallback(() => {
    setLightbox((lb) => {
      lb?.from?.focus?.({ preventScroll: true });
      return null;
    });
  }, []);
  const stepLightbox = useCallback((d) => {
    setLightbox((lb) => lb && { ...lb, i: (lb.i + d + lb.list.length) % lb.list.length });
  }, []);

  useEffect(() => {
    if (!lightbox) return undefined;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') stepLightbox(1);
      if (e.key === 'ArrowLeft') stepLightbox(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [lightbox, closeLightbox, stepLightbox]);

  // One delegated click handler opens any slide with data-full.
  const onRootClick = (e) => {
    const t = e.target.closest('[data-full]');
    if (t && !t.closest('.lb')) openLightbox(t.dataset.full, t.closest('.rows,.track,.bento,.fan'));
  };

  /* ---------- motion: everything imperative lives here ---------- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    root.classList.add('lp-js');
    const $ = (s) => root.querySelector(s);
    const $$ = (s) => [...root.querySelectorAll(s)];
    const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const narrow = () => innerWidth <= 760;
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const cleanups = [];
    const on = (el, ev, fn, opts) => { el.addEventListener(ev, fn, opts); cleanups.push(() => el.removeEventListener(ev, fn, opts)); };
    const observe = (io, els) => { els.forEach((el) => io.observe(el)); cleanups.push(() => io.disconnect()); };

    /* compare: drag anywhere, keyboard via the hidden range */
    const cut = $('#cut');
    const cmp = $('#compare');
    let dragging = false;
    if (cut && cmp) {
      const setCut = (v) => { v = clamp(v, 0, 100); cmp.style.setProperty('--cut', v + '%'); cut.value = v; };
      on(cut, 'input', (e) => setCut(+e.target.value));
      let sx = 0; let sy = 0; let decided = false;
      const pos = (e) => { const r = cmp.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * 100; };
      on(cmp, 'pointerdown', (e) => { dragging = true; decided = e.pointerType === 'mouse'; sx = e.clientX; sy = e.clientY; if (decided) { cmp.setPointerCapture(e.pointerId); setCut(pos(e)); } });
      on(cmp, 'pointermove', (e) => {
        if (!dragging) return;
        if (!decided) {
          const dx = Math.abs(e.clientX - sx); const dy = Math.abs(e.clientY - sy);
          if (dx < 6 && dy < 6) return;
          decided = true;
          if (dy > dx) { dragging = false; return; } // a vertical swipe is a scroll, not a drag
          cmp.setPointerCapture(e.pointerId);
        }
        setCut(pos(e));
      });
      const end = (e) => { if (dragging && !decided && e.type === 'pointerup') setCut(pos(e)); dragging = false; };
      on(cmp, 'pointerup', end); on(cmp, 'pointercancel', end);
      on(cmp, 'click', () => cut.focus({ preventScroll: true }));
      // A little nudge so people discover the handle.
      if (!RM) {
        const tio = new IntersectionObserver((es) => {
          if (!es[0].isIntersecting) return;
          tio.disconnect();
          const t0 = performance.now();
          const a = (t) => { const p = Math.min(1, (t - t0) / 1600); setCut(50 + Math.sin(p * Math.PI * 2) * 22 * (1 - p)); if (p < 1 && !dragging) requestAnimationFrame(a); };
          requestAnimationFrame(a);
        }, { threshold: 0.6 });
        observe(tio, [cmp]);
      }
    }

    /* feature spotlight */
    $$('.feat').forEach((f) => on(f, 'pointermove', (e) => { const r = f.getBoundingClientRect(); f.style.setProperty('--mx', e.clientX - r.left + 'px'); f.style.setProperty('--my', e.clientY - r.top + 'px'); }));

    /* reveal */
    if (!RM) {
      const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.remove('pre'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
      const pending = $$('.rv').filter((el) => el.getBoundingClientRect().top > innerHeight);
      pending.forEach((el) => el.classList.add('pre'));
      observe(io, pending);
    }

    /* count up */
    const cio = new IntersectionObserver((es) => es.forEach((en) => {
      if (!en.isIntersecting) return;
      const b = en.target; const to = +b.dataset.count; const suf = b.dataset.suffix || '';
      cio.unobserve(b);
      const paint = (v) => { b.textContent = String(v); if (suf) { const s = document.createElement('small'); s.textContent = suf; b.appendChild(s); } };
      if (RM || to === 0) { paint(to); return; }
      b.dataset.counting = '1';
      const t0 = performance.now();
      const tick = (t) => { const p = Math.min(1, (t - t0) / 1400); paint(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }), { threshold: 0.5 });
    observe(cio, $$('[data-count]'));

    /* light field: thin blue beams rising from a warm horizon */
    function beamField(cv, o) {
      const ctx = cv?.getContext('2d');
      if (!ctx) return;
      let W = 0; let H = 0; let beams = []; let stars = []; let raf = 0; let running = false;
      const t0 = performance.now();
      const sprite = (rgb) => {
        const c = document.createElement('canvas'); c.width = 1; c.height = 256;
        const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 256, 0, 0);
        gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.3, `rgba(${rgb},.6)`); gr.addColorStop(0.7, `rgba(${rgb},.18)`); gr.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = gr; g.fillRect(0, 0, 1, 256); return c;
      };
      const SB = sprite('2,151,222'); const SL = sprite('76,184,240'); const SI = sprite('214,241,255');
      function glow(cx, cy, r, stops) { const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); stops.forEach(([s, c]) => g.addColorStop(s, c)); ctx.fillStyle = g; ctx.fillRect(-W, -H, W * 3, H * 3); }
      function draw(now) {
        if (!W) return;
        const t = (now - t0) / 1000; ctx.clearRect(0, 0, W, H);
        const cx = W * o.cx; const sig = Math.max(W * o.spread, 160); const base = H * o.base;
        ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#D6F1FF';
        for (const s of stars) { ctx.globalAlpha = 0.12 + 0.38 * (0.5 + 0.5 * Math.sin(t * s.s + s.p)); ctx.fillRect(s.x, s.y, s.r, s.r); }
        ctx.globalCompositeOperation = 'lighter';
        ctx.save(); ctx.translate(cx, base); ctx.scale(1, 1.6); ctx.translate(-cx, -base);
        glow(cx, base, sig * 1.9, [[0, `rgba(2,151,222,${0.5 * o.haze})`], [0.5, `rgba(2,151,222,${0.18 * o.haze})`], [1, 'rgba(2,151,222,0)']]);
        ctx.restore();
        for (const b of beams) {
          const d = (b.x - cx) / sig; const env = Math.exp(-d * d * 0.9);
          const wave = 0.5 + 0.5 * Math.sin(b.x * 0.011 - t * 0.6);
          const flick = 0.6 + 0.4 * Math.sin(t * b.s + b.p);
          const a = env * (0.35 + 0.65 * wave * flick) * b.a * o.intensity;
          if (a < 0.015) continue;
          const h = base * o.reach * (0.18 + 0.82 * env) * b.h * (0.85 + 0.15 * Math.sin(t * 0.3 * b.s + b.p));
          ctx.globalAlpha = Math.min(1, a);
          ctx.drawImage(b.k > 0.85 ? SI : (b.k > 0.4 ? SL : SB), b.x, base - h, b.w, h);
        }
        ctx.globalAlpha = 1;
        const pulse = 1 + 0.05 * Math.sin(t * 0.7);
        ctx.save(); ctx.translate(cx, base); ctx.scale(1, 0.42); ctx.translate(-cx, -base);
        glow(cx, base, W * 0.6 * pulse, [[0, 'rgba(2,151,222,.55)'], [0.45, 'rgba(2,151,222,.16)'], [1, 'rgba(2,151,222,0)']]);
        ctx.globalCompositeOperation = 'source-over'; // warm light sits on the blue instead of adding to white
        glow(cx, base, W * 0.42 * pulse, [[0, `rgba(252,115,77,${0.95 * o.warm})`], [0.35, `rgba(252,115,77,${0.45 * o.warm})`], [0.7, `rgba(252,115,77,${0.1 * o.warm})`], [1, 'rgba(252,115,77,0)']]);
        glow(cx, base, W * 0.16 * pulse, [[0, `rgba(255,200,170,${0.75 * o.warm})`], [0.5, `rgba(253,140,100,${0.3 * o.warm})`], [1, 'rgba(253,140,100,0)']]);
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
      }
      function size() {
        const r = cv.getBoundingClientRect(); if (!r.width) return;
        const dpr = Math.min(devicePixelRatio || 1, innerWidth < 760 ? 1.25 : 1.75);
        if (o.anchor) { const a = root.querySelector(o.anchor); if (a) o.base = Math.min(0.97, (a.getBoundingClientRect().top - r.top + (o.anchorOff || 0)) / r.height); }
        W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const step = innerWidth < 760 ? 3.4 : 2.6; beams = [];
        for (let x = 0; x < W; x += step + Math.random() * 1.6) beams.push({ x, w: Math.random() < 0.12 ? 1.8 : 0.9, p: Math.random() * 6.283, s: 0.35 + Math.random() * 1.3, a: 0.35 + Math.random() * 0.65, k: Math.random(), h: 0.7 + Math.random() * 0.3 });
        stars = Array.from({ length: Math.round((W * H) / 7000) }, () => ({ x: Math.random() * W, y: Math.random() * H * o.base * 0.75, r: Math.random() * 1.2 + 0.3, p: Math.random() * 6.283, s: 0.4 + Math.random() * 1.6 }));
        draw(performance.now());
      }
      const loop = (now) => { draw(now); if (running) raf = requestAnimationFrame(loop); };
      const start = () => { if (running || RM) return; running = true; raf = requestAnimationFrame(loop); };
      const stop = () => { running = false; cancelAnimationFrame(raf); };
      const vio = new IntersectionObserver((es) => es.forEach((en) => (en.isIntersecting ? start() : stop())), { rootMargin: '80px' });
      observe(vio, [cv]);
      on(document, 'visibilitychange', () => { if (document.hidden) stop(); else { const r = cv.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) start(); } });
      if ('ResizeObserver' in window) { const ro = new ResizeObserver(size); ro.observe(cv); cleanups.push(() => ro.disconnect()); } else on(window, 'resize', size);
      cleanups.push(stop);
      size();
    }
    beamField($('.hero .beams'), { cx: 0.5, spread: 0.27, base: 0.8, anchor: '.glass-row', anchorOff: 30, reach: 1.05, intensity: 1.9, warm: 1.15, haze: 1.1 });
    beamField($('.numbers .beams'), { cx: 0.5, spread: 0.32, base: 1.04, reach: 0.95, intensity: 1.3, warm: 0.8, haze: 0.7 });
    beamField($('.cta .beams'), { cx: 0.5, spread: 0.28, base: 1.0, reach: 1.05, intensity: 1.7, warm: 1, haze: 1 });

    /* scroll engine */
    const nav = $('.nav'); const hero = $('.hero'); const wall = $('.wall'); const studio = $('.studio');
    const caseS = $('.case'); const track = $('#track'); const mcta = $('#mcta'); const ctaSec = $('.cta'); const pricing = $('#pricing');
    const prog = (el) => { const r = el.getBoundingClientRect(); const span = r.height - innerHeight; return span > 0 ? clamp(-r.top / span) : clamp((innerHeight - r.top) / (innerHeight + r.height)); };
    const PROMPT = "Seed pitch for HyperBeing, an AI presentation maker. Audience: tier-1 VCs. Argue that presentations are the last productivity category AI hasn't eaten. Use our penetration data.";
    const ptext = $('#ptext'); const items = $$('#plan .it'); const canvasImgs = $$('#canvas img'); const strip = $$('#strip div');
    const canvas = $('#canvas'); const steps = $$('#steps li'); const caseN = $('#case-n');
    let lastSlide = -1;
    function sizeCase() {
      if (narrow()) { caseS.style.height = ''; return; }
      const extra = track.scrollWidth - innerWidth + 32;
      caseS.style.height = innerHeight + Math.max(0, extra) + 'px';
    }
    function studioState(p) {
      const stp = p < 0.22 ? 0 : p < 0.42 ? 1 : p < 0.86 ? 2 : 3;
      steps.forEach((s, i) => s.classList.toggle('on', i === stp));
      ptext.textContent = PROMPT.slice(0, Math.round(PROMPT.length * clamp(p / 0.2)));
      const nShow = Math.round(clamp((p - 0.22) / 0.18) * 6);
      items.forEach((it, i) => it.classList.toggle('show', i < nShow)); $('#pcount').textContent = nShow + ' / 6';
      const n = p < 0.42 ? -1 : Math.min(5, Math.floor(clamp((p - 0.42) / 0.42) * 6));
      items.forEach((it, i) => it.classList.toggle('cur', i === n));
      canvasImgs.forEach((im, i) => { im.classList.toggle('on', i === n); if (i === n) im.loading = 'eager'; });
      strip.forEach((s, i) => { s.classList.toggle('on', i <= n); s.classList.toggle('cur', i === n); });
      $('#canvas .empty').hidden = n >= 0;
      if (n !== lastSlide && n >= 0) { canvas.classList.remove('rendering'); void canvas.offsetWidth; canvas.classList.add('rendering'); }
      lastSlide = n;
      const secs = Math.round(167 * clamp(p / 0.9)); $('#timer').textContent = Math.floor(secs / 60) + ':' + pad(secs % 60);
      $('#export').classList.toggle('ready', p >= 0.88);
    }
    // Narrow screens: the studio plays itself while visible.
    let autoOn = false; let autoT0 = 0;
    function autoLoop(t) { if (!autoOn || innerWidth > 980) return; studioState(Math.min(1, ((t - autoT0) / 13000) % 1.15)); requestAnimationFrame(autoLoop); }
    const sio = new IntersectionObserver((es) => es.forEach((en) => {
      if (innerWidth > 980 || RM) return;
      if (en.isIntersecting && !autoOn) { autoOn = true; autoT0 = performance.now(); requestAnimationFrame(autoLoop); } else if (!en.isIntersecting) autoOn = false;
    }), { threshold: 0.25 });
    observe(sio, [studio]);
    cleanups.push(() => { autoOn = false; });

    let ticking = false;
    function frame() {
      ticking = false;
      const y = scrollY; const docH = document.documentElement.scrollHeight - innerHeight;
      root.style.setProperty('--sp', docH > 0 ? y / docH : 0);
      nav.classList.toggle('scrolled', y > 20);
      hero.style.setProperty('--hp', clamp(y / innerHeight));
      if (narrow()) {
        const hb = hero.getBoundingClientRect().bottom; const cr = ctaSec.getBoundingClientRect(); const pr = pricing.getBoundingClientRect();
        const inPricing = pr.top < innerHeight && pr.bottom > 0;
        mcta.classList.toggle('show', hb < 0 && cr.top > innerHeight * 0.9 && !nav.classList.contains('open') && !inPricing);
      }
      if (!RM) {
        const wp = prog(wall); wall.style.setProperty('--wp', clamp(wp / 0.7)); wall.style.setProperty('--wt', clamp((wp - 0.55) / 0.3));
        if (innerWidth > 980) studioState(prog(studio));
        if (!narrow()) {
          const cp = prog(caseS); const max = track.scrollWidth - innerWidth + 32;
          track.style.transform = `translate3d(${-cp * Math.max(0, max)}px,0,0)`; caseS.style.setProperty('--cp', cp);
          caseN.textContent = pad(Math.min(CASE.length, 1 + Math.floor(cp * CASE.length * 0.999))) + ' / ' + CASE.length;
        }
      }
    }
    // On phones the case counter follows the swipe.
    on(track, 'scroll', () => { if (!narrow()) return; const w = track.firstElementChild.offsetWidth + 12; caseN.textContent = pad(Math.min(CASE.length, 1 + Math.round(track.scrollLeft / w))) + ' / ' + CASE.length; }, { passive: true });
    const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
    on(window, 'scroll', req, { passive: true });
    let lastW = innerWidth;
    on(window, 'resize', () => { if (innerWidth !== lastW) { lastW = innerWidth; sizeCase(); } req(); });
    on(window, 'load', () => { sizeCase(); req(); });
    sizeCase();
    studioState(RM ? 1 : 0);
    frame();

    return () => {
      cleanups.forEach((fn) => fn());
      root.classList.remove('lp-js');
    };
  }, []);

  // Keep the sticky bottom CTA out of the way while the menu is open.
  useEffect(() => {
    const nav = rootRef.current?.querySelector('.nav');
    nav?.classList.toggle('open', menuOpen);
  }, [menuOpen]);

  const copyMail = async () => {
    try { await navigator.clipboard.writeText('team@hyperbeing.co'); setCopied('Copied'); } catch { setCopied('Select it'); }
    setTimeout(() => setCopied(''), 1800);
  };

  const ultra = ULTRA_TIERS[ultraTier];
  const ultraPct = (ultraTier / (ULTRA_TIERS.length - 1)) * 100;
  const priceBlock = (monthly, discount) => (
    <div>
      <div className="price">
        <b className="amt">${annual ? annualPrice(monthly, discount) : monthly}</b>
        {annual && <s className="was">${monthly}</s>}
        <span>/month</span>
        {annual && <span className="off">{Math.round(discount * 100)}% OFF</span>}
      </div>
      <div className="billed">{annual ? `Billed $${fmt(annualPrice(monthly, discount) * 12)}/year` : 'Billed monthly'}</div>
    </div>
  );

  const lbId = lightbox ? lightbox.list[lightbox.i] : null;
  const navLinks = [['#studio', 'Product'], ['#work', 'Examples'], ['#pricing', 'Pricing'], ['#faq', 'FAQ']];

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className="lp" ref={rootRef} onClick={onRootClick}>
      <div className="grain" aria-hidden="true" />
      <div className="progress" aria-hidden="true" />

      <header className="nav" id="top">
        <div className="wrap">
          <a href="#top" className="logo" aria-label="HyperBeing home"><b>HB</b>HyperBeing</a>
          <ul>
            {navLinks.map(([h, l]) => <li key={h}><a href={h}>{l}</a></li>)}
          </ul>
          <div className="right">
            {!user && <Link className="signin" to="/login">Sign in</Link>}
            <Link className="btn btn-primary" to={startHref}>{startLabel} <span className="arr">→</span></Link>
            <button
              className="burger" type="button" aria-controls="sheet" aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen((o) => !o)}
            ><span /></button>
          </div>
        </div>
        <nav className="sheet" id="sheet" hidden={!menuOpen} aria-label="Mobile" onClick={(e) => { if (e.target.closest('a')) setMenuOpen(false); }}>
          {navLinks.map(([h, l]) => <a key={h} href={h}>{l}</a>)}
          {!user && <Link to="/login">Sign in</Link>}
          <Link className="btn btn-primary" to={startHref}>{startLabel} <span className="arr">→</span></Link>
        </nav>
      </header>

      <main>
        {/* HERO */}
        <section className="hero" data-nova="hero">
          <div className="lightfield" aria-hidden="true" />
          <canvas className="beams" aria-hidden="true" />
          <div className="hstats l" aria-hidden="true">
            <div><b>2:47</b><span>Brief to finished deck</span></div>
            <div><b>6×</b><span>Slides built in parallel</span></div>
          </div>
          <div className="hstats r" aria-hidden="true">
            <div><b>0</b><span>Templates used</span></div>
            <div><b>.pptx</b><span>PowerPoint &amp; PDF export</span></div>
          </div>
          <div className="wrap hero-in">
            <div className="nova-slot" data-nova-slot aria-hidden="true" />
            <span className="pill"><i />AI presentation studio</span>
            <h1>Presentations that make people go <em className="how">how?</em></h1>
            <p className="lede">
              <span className="d-only">Give Nova your brief. Every slide comes back art-directed, with a real argument, an agency finish and text you can still edit. No templates.</span>
              <span className="m-only">Your brief in. A designed, editable deck out.</span>
            </p>
            <div className="ctas">
              <Link className="btn btn-primary" to={startHref}>{user ? 'Open dashboard' : 'Generate your first deck'} <span className="arr">→</span></Link>
              <a className="btn btn-ghost" href="#work">See what it makes</a>
            </div>
            <p className="note"><b>{FREE_CREDITS} free credits</b> on sign-up · no card required</p>
            <div className="glass-row fan">
              <div className="gp l" style={{ '--d': 0 }}><span className="lab">Nova studio</span><button type="button" className="frame" data-full="s23" aria-label="Open slide: HyperBeing studio"><img src={thumb('s23')} alt={SLIDE_ALT.s23} width="640" height="357" /></button></div>
              <div className="gp c" style={{ '--d': 1 }}><span className="lab">Art direction</span><button type="button" className="frame" data-full="s06" aria-label="Open slide: Launched at 30,000 feet"><img src={full('s06')} alt={SLIDE_ALT.s06} width="1600" height="893" fetchpriority="high" /></button></div>
              <div className="gp r" style={{ '--d': 2 }}><span className="lab">Data storytelling</span><button type="button" className="frame" data-full="s20" aria-label="Open slide: Kestrel is outreaching us"><img src={thumb('s20')} alt={SLIDE_ALT.s20} width="640" height="362" /></button></div>
            </div>
          </div>
        </section>

        <div className="proof">
          <div className="wrap">
            <span>Used by <b>brand teams</b></span>
            <span><b>Strategy</b> consultants</span>
            <span><b>Founders</b> &amp; investors</span>
            <span><b>Agencies</b> &amp; analysts</span>
            <span>Exports <b>.pptx · PDF · PNG</b></span>
          </div>
        </div>

        {/* MARQUEE */}
        <section className="marquee" aria-labelledby="mq-h" data-nova="marquee">
          <div className="wrap head">
            <div style={{ display: 'grid', gap: 18 }}>
              <span className="eyebrow">Made with HyperBeing</span>
              <h2 id="mq-h">Not one template<br />in the <em>building.</em></h2>
            </div>
            <p className="lede" style={{ maxWidth: '40ch' }}>Every frame on this page is a real slide generated by HyperBeing. Tap any one to see it full size.</p>
          </div>
          <div className="rows">
            {[ALL.filter((_, i) => i % 2 === 0), ALL.filter((_, i) => i % 2 === 1)].map((ids, r) => (
              <div key={r} className={'row' + (r ? ' rev' : '')} style={{ '--dur': (r ? 95 : 85) + 's' }}>
                {[...ids, ...ids].map((id, k) => {
                  const dup = k >= ids.length;
                  return (
                    <button key={k} type="button" data-full={id} tabIndex={dup ? -1 : undefined} aria-hidden={dup || undefined} aria-label={`Open slide: ${SLIDE_ALT[id]}`}>
                      <img loading="lazy" decoding="async" src={thumb(id)} alt={dup ? '' : SLIDE_ALT[id]} width="640" height="357" />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        {/* WALL */}
        <section className="wall" aria-label="A wall of HyperBeing slides" data-nova="wall">
          <div className="stick">
            <div className="grid">
              {WALL.map((id) => <img key={id} loading="lazy" decoding="async" src={thumb(id)} alt="" width="640" height="357" />)}
            </div>
            <div className="vign" />
            <div className="over"><div>
              <h2>Clip art is <em>over.</em></h2>
              <p>Every slide is composed from scratch around its argument: the lighting, the layout, the data and the type.</p>
            </div></div>
          </div>
        </section>

        {/* STUDIO */}
        <section className="studio" id="studio" aria-labelledby="st-h" data-nova="studio">
          <div className="stick">
            <div className="wrap">
              <div>
                <span className="eyebrow">Watch it work</span>
                <h2 id="st-h" style={{ marginTop: 20, fontSize: 'clamp(32px,4.4vw,60px)' }}>From messy brief to <em>board-ready</em>.</h2>
                <ol className="steps" id="steps">
                  <li className="on"><b>01 · Brief</b><span>Paste the whole messy thing: notes, numbers, PDFs, the angle you want.</span></li>
                  <li><b>02 · Plan</b><span>Nova reads all of it, then proposes a slide map built around your argument.</span></li>
                  <li><b>03 · Compose</b><span>Every slide is art-directed on its own, in parallel, with editable text and charts.</span></li>
                  <li><b>04 · Export</b><span>Download as PowerPoint, PDF or PNG.</span></li>
                </ol>
              </div>
              <div className="app" aria-label="HyperBeing studio, building a seed deck">
                <div className="app-bar"><i /><i /><i /><span className="title">hyperbeing.co / studio / seed-pitch</span><span className="live">Nova online</span></div>
                <div className="app-body">
                  <div className="app-side">
                    <div className="prompt" id="prompt"><span id="ptext" /><span className="cur" /></div>
                    <div className="plan" id="plan">
                      <div className="lbl"><span>Slide plan</span><span id="pcount">0 / 6</span></div>
                      {STUDIO_SLIDES.map(([, t], i) => <div key={t} className="it"><em>{pad(i + 1)}</em>{t}</div>)}
                    </div>
                  </div>
                  <div className="app-main">
                    <div className="canvas" id="canvas">
                      <div className="empty">Awaiting slide plan</div>
                      {STUDIO_SLIDES.map(([id]) => <img key={id} src={full(id)} alt={SLIDE_ALT[id]} loading="lazy" width="1600" height="893" />)}
                      <div className="scan" />
                    </div>
                    <div className="strip" id="strip">
                      {STUDIO_SLIDES.map(([id]) => <div key={id}><img src={thumb(id)} alt="" loading="lazy" width="640" height="357" /></div>)}
                    </div>
                    <div className="export" id="export"><span>seed_pitch.pptx · <span className="timer" id="timer">0:00</span></span><span className="x">Export →</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CASE */}
        <section className="case" id="work" aria-labelledby="case-h" data-nova="work">
          <div className="stick">
            <div className="wrap head">
              <div style={{ display: 'grid', gap: 18 }}>
                <span className="eyebrow">Case · FMCG campaign pitch</span>
                <h2 id="case-h" style={{ fontSize: 'clamp(32px,4.8vw,66px)' }}>A whole campaign,<br /><em>pitched in pictures.</em></h2>
              </div>
              <div className="meta"><b id="case-n">01 / {CASE.length}</b>A noodle launch told as a flight. Every slide made by HyperBeing.</div>
            </div>
            <div className="track" id="track">
              {CASE.map(([id, c], i) => (
                <figure key={id}>
                  <button type="button" data-full={id} aria-label={`Open slide ${i + 1}: ${c}`}>
                    <img loading="lazy" decoding="async" src={full(id)} alt={SLIDE_ALT[id]} width="1600" height="893" />
                  </button>
                  <figcaption><b>{pad(i + 1)}</b>{c}</figcaption>
                </figure>
              ))}
            </div>
            <div className="wrap"><div className="bar"><i /></div><span className="swipe">Swipe to see all {CASE.length} →</span></div>
          </div>
        </section>

        {/* RANGE */}
        <section className="sec" aria-labelledby="range-h" data-nova="range">
          <div className="wrap">
            <div className="sec-head rv">
              <span className="eyebrow">Range</span>
              <h2 id="range-h">One engine. <em>Every register.</em></h2>
              <p className="lede">A board update and a launch campaign shouldn't look alike. HyperBeing matches its style to your industry and audience, so a fintech deck and a fashion deck come out different.</p>
            </div>
            <div className="tabs" role="tablist">
              {Object.keys(RANGE).map((k, i) => (
                <button
                  key={k} type="button" role="tab" id={'tab-' + i} aria-selected={k === rangeKey}
                  onClick={(e) => { setRangeKey(k); e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }}
                >{k}</button>
              ))}
            </div>
            <div className="bento" role="tabpanel" aria-labelledby={'tab-' + Object.keys(RANGE).indexOf(rangeKey)} key={rangeKey}>
              {RANGE[rangeKey].ids.map((id, i) => (
                <button key={id} type="button" data-full={id} style={{ '--i': i }} aria-label={`Open slide: ${SLIDE_ALT[id]}`}>
                  <img loading="lazy" decoding="async" src={i === 0 ? full(id) : thumb(id)} alt={SLIDE_ALT[id]} />
                </button>
              ))}
            </div>
            <p className="range-note">{RANGE[rangeKey].note}</p>
          </div>
        </section>

        {/* BEFORE / AFTER */}
        <section className="sec" style={{ paddingTop: 0 }} aria-labelledby="ba-h" data-nova="compare">
          <div className="wrap ba">
            <div className="copy rv">
              <span className="eyebrow">Same data. Different outcome.</span>
              <h2 id="ba-h" style={{ fontSize: 'clamp(32px,4.4vw,60px)' }}>Drag the line. <em>Feel the difference.</em></h2>
              <p className="lede">On the left is the slide most teams would ship. On the right is what HyperBeing made from the same facts.</p>
              <ul>
                <li>Numbers kept exact. 2,916 towns stays 2,916.</li>
                <li>The headline argues a point instead of naming a topic.</li>
                <li>Every chart, photo and callout is composed for that one slide.</li>
              </ul>
            </div>
            <div className="compare rv" id="compare">
              <img className="after" src={full('s20')} alt="HyperBeing slide: Kestrel is outreaching us town by town, with map, bar chart and retail photos" loading="lazy" width="1600" height="905" />
              <div className="before" aria-hidden="true">
                <div className="t">Competitive Landscape - Rural Coverage</div>
                <ul>
                  <li>Kestrel covers 2,916 towns vs our 874</li>
                  <li>Kestrel distributors: 11,240 vs 3,180</li>
                  <li>Outlet reach in target towns: 98,450 vs 27,630</li>
                  <li>Gap is measurable - need to act in 2026</li>
                </ul>
                <div className="clip">📊</div>
                <div className="foot">Confidential · Slide 7</div>
              </div>
              <div className="handle" />
              <span className="lab l">Template</span><span className="lab r">HyperBeing</span>
              <input type="range" min="0" max="100" defaultValue="50" id="cut" aria-label="Compare template slide and HyperBeing slide" />
            </div>
          </div>
        </section>

        {/* NUMBERS */}
        <section className="numbers" aria-labelledby="num-h" data-nova="numbers">
          <canvas className="beams" aria-hidden="true" />
          <div className="wrap">
            <div className="top rv">
              <h2 id="num-h">Hours of work,<br /><i>gone.</i></h2>
              <p>What changes when every slide is designed for you instead of pushed around a template.</p>
            </div>
            <div className="nums rv">
              <div><b data-count="4" data-suffix="h">4<small>h</small></b><span>The average professional spends this long building one deck.</span></div>
              <div><b>2:47</b><span>From brief to an export-ready 12-slide deck in our generation log.</span></div>
              <div><b data-count="6">6</b><span>Slides building in parallel on Pro. Unlimited on Ultra.</span></div>
              <div><b data-count="0">0</b><span>Templates. Every slide is designed for its own argument.</span></div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="sec" aria-labelledby="ft-h" data-nova="features">
          <div className="wrap">
            <div className="sec-head rv">
              <span className="eyebrow">Features</span>
              <h2 id="ft-h">Everything you need. <em>Nothing you don't.</em></h2>
            </div>
            <div className="feats rv">
              <div className="feat"><div className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 16 5-5 4 4 3-3 6 6" /><circle cx="16" cy="9" r="1.6" /></svg></div><h3>Art-directed slides</h3><p>Each slide gets its own generated imagery, composed around that slide's argument, with real text, charts and shapes on top.</p></div>
              <div className="feat"><div className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h13" /></svg></div><h3>Narrative intelligence</h3><p>Nova reads your entire brief, PDFs, spreadsheets and old decks before it writes a word. Details, numbers and structure survive.</p></div>
              <div className="feat"><div className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13 7 4 4" /></svg></div><h3>Edit anything</h3><p>Click any text to change it, or ask Nova to rework a slide in plain words. Every version is kept.</p></div>
              <div className="feat"><div className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg></div><h3>Brand memory <small>SOON</small></h3><p>Upload your brand kit once. Every deck after that stays on brand automatically.</p></div>
              <div className="feat"><div className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg></div><h3>One-click export</h3><p>Native PowerPoint with editable text boxes and charts, plus PDF and PNG. Exporting is always free.</p></div>
              <div className="feat"><div className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z" /></svg></div><h3>Enterprise grade</h3><p>SSO, audit logs, team workspaces and volume pricing on higher tiers.</p></div>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section className="sec" id="pricing" style={{ paddingTop: 0 }} aria-labelledby="pr-h" data-nova="pricing">
          <div className="wrap">
            <div className="sec-head rv">
              <span className="eyebrow">Pricing</span>
              <h2 id="pr-h">Pick your plan. <em>Start creating.</em></h2>
              <p className="lede">Six plans, from your first deck to agency scale. Every plan includes AI image generation, PowerPoint and PDF export and Nova's full art-direction engine.</p>
            </div>
            <div className="bill" role="group" aria-label="Billing period">
              <button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>Monthly</button>
              <button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>Annual</button>
              <span className="save prism-text">save up to 30%</span>
            </div>
            <div className="plans">
              {PLANS.map((p) => (
                <div key={p.key} className={'plan-c' + (p.popular ? ' pop' : '')} data-plan={p.key}>
                  {p.popular && <span className="badge">Most popular</span>}
                  <div><h3>{p.name}</h3><p className="for">{p.for}</p></div>
                  {priceBlock(p.monthly, p.discount)}
                  <div className="credits">✦ {fmt(p.credits)} credits / month</div>
                  <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
                  <div className="decks">About {Math.floor(p.credits / CREDITS_PER_DECK)} five-slide decks a month</div>
                  <Link className={'btn ' + (p.popular ? 'btn-primary' : 'btn-ghost')} to="/pricing">Choose {p.name}{p.popular && <> <span className="arr">→</span></>}</Link>
                </div>
              ))}
              <div className="plan-c ultra" data-plan="ultra">
                <span className="badge alt">Best value</span>
                <div><h3>Ultra <span className="tier">Ultra {ultraTier + 1}</span></h3><p className="for">For power users and agencies. Pick your credit level.</p></div>
                {priceBlock(ultra.price, ultra.annualDiscount)}
                {/* Same credit slider as the pricing page, restyled for the dark stage. */}
                <div className="ultra-slide">
                  <div className="row">
                    <label htmlFor="ultra-credits" className="lbl">Credits per month</label>
                    <b>{fmt(ultra.credits)}</b>
                  </div>
                  <input
                    id="ultra-credits" type="range" min={0} max={ULTRA_TIERS.length - 1} step={1}
                    value={ultraTier} onChange={(e) => setUltraTier(Number(e.target.value))}
                    aria-valuetext={`Ultra ${ultraTier + 1}, ${fmt(ultra.credits)} credits`}
                    style={{ '--fill': ultraPct + '%' }}
                  />
                  <div className="ticks">
                    {ULTRA_TIERS.map((t, idx) => (
                      <button key={t.credits} type="button" className={idx === ultraTier ? 'on' : ''} onClick={() => setUltraTier(idx)}>
                        Ultra {idx + 1}
                      </button>
                    ))}
                  </div>
                  <p className="hint">{Math.round(ultra.annualDiscount * 100)}% off on annual. More credits, bigger discount.</p>
                </div>
                <ul>{ULTRA_FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>
                <div className="decks">About {Math.floor(ultra.credits / CREDITS_PER_DECK)} five-slide decks a month</div>
                <Link className="btn btn-ghost" to="/pricing">Choose Ultra {ultraTier + 1}</Link>
              </div>
            </div>
            <div className="ent rv">
              <p><b>Need a plan for your team?</b> Custom credit volumes, shared workspaces, priority onboarding, SLA support and flexible billing.</p>
              <div className="mail"><code>team@hyperbeing.co</code><button type="button" className="copybtn" onClick={copyMail}>{copied || 'Copy'}</button></div>
            </div>
            <p className="free">New accounts get <b>{FREE_CREDITS} free credits</b>. No card required.</p>
          </div>
        </section>

        {/* FAQ */}
        <section className="sec" id="faq" style={{ paddingTop: 0 }} aria-labelledby="faq-h" data-nova="faq">
          <div className="wrap faq">
            <div className="rv" style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
              <span className="eyebrow">FAQ</span>
              <h2 id="faq-h" style={{ fontSize: 'clamp(32px,4.4vw,60px)' }}>Questions, <em>answered.</em></h2>
            </div>
            <div className="rv">
              {FAQ.map(({ q, a }) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
            </div>
          </div>
          <script
            type="application/ld+json"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: FAQ.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
            }) }}
          />
        </section>

        {/* CTA */}
        <section className="cta" aria-labelledby="cta-h" data-nova="cta">
          <canvas className="beams" aria-hidden="true" />
          <div className="wrap">
            <span className="eyebrow">Your turn</span>
            <h2 id="cta-h" style={{ marginTop: 22 }}>Your next deck is<br /><em>minutes away.</em></h2>
            <p>No design experience. No templates. Just your ideas, made impossible to ignore.</p>
            <div className="ctas">
              <Link className="btn btn-primary" to={startHref}>{user ? 'Open dashboard' : 'Start for free'} <span className="arr">→</span></Link>
              <a className="btn btn-ghost" href="#pricing">Compare plans</a>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div><a href="#top" className="logo"><b>HB</b>HyperBeing</a><p style={{ margin: '14px 0 0', maxWidth: '32ch' }}>The AI presentation studio that art-directs every slide.</p></div>
          <div><h4>Product</h4><ul><li><a href="#studio">How it works</a></li><li><a href="#work">Examples</a></li><li><Link to="/pricing">Pricing</Link></li></ul></div>
          <div><h4>Use cases</h4><ul><li><Link to="/services/marketing-decks">Marketing decks</Link></li><li><Link to="/services/consulting-decks">Consulting decks</Link></li></ul></div>
          <div><h4>Legal</h4><ul><li><Link to="/privacy">Privacy</Link></li><li><Link to="/terms">Terms</Link></li></ul></div>
          <div className="copy">© {new Date().getFullYear()} HyperBeing. All rights reserved.</div>
        </div>
      </footer>

      <div className="mcta" id="mcta"><Link className="btn btn-primary" to={startHref}>{user ? 'Open dashboard' : 'Generate your first deck'} <span className="arr">→</span></Link></div>

      <LandingNova rootRef={rootRef} startHref={startHref} signedIn={!!user} />

      {lightbox && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
          className="lb" role="dialog" aria-modal="true" aria-label="Slide viewer"
          onClick={(e) => { if (e.target === e.currentTarget) closeLightbox(); }}
          onTouchStart={(e) => { e.currentTarget.dataset.tx = e.touches[0].clientX; }}
          onTouchEnd={(e) => { const tx = +e.currentTarget.dataset.tx; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) stepLightbox(dx < 0 ? 1 : -1); }}
        >
          <img src={full(lbId)} alt={SLIDE_ALT[lbId] || 'HyperBeing slide'} />
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <button type="button" className="close" aria-label="Close" onClick={closeLightbox} autoFocus>✕</button>
          <button type="button" className="prev" aria-label="Previous slide" onClick={() => stepLightbox(-1)}>←</button>
          <button type="button" className="next" aria-label="Next slide" onClick={() => stepLightbox(1)}>→</button>
          <span className="count">{lightbox.i + 1} / {lightbox.list.length}</span>
        </div>
      )}
    </div>
  );
}
