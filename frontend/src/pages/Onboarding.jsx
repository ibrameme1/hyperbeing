import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, ArrowLeft, Loader2, Rocket, Handshake, Megaphone, GraduationCap, Users, Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { track } from '../utils/track';
import { capture } from '../utils/posthog';
import Nova from '../components/nova/Nova';

// New-user onboarding: Nova walks you straight to your first deck.
//
// The old version was an eight-question survey before you ever saw a slide.
// This one gets to the "aha" (watching your own deck appear) in three short
// steps: hello -> what is it for -> one-line brief (prefilled, editable).
// The deck is created right here (POST /presentations) and the presentation
// page picks up with ?welcome=1, where Nova narrates the build.
//
// The brief ends with "PREFLIGHT ANSWERS:" on purpose: that magic string tells
// Nova's planner to skip its clarifying questions and generate now. The deck
// is kept to 3 slides so a new account's free credits (54 = 3 x 18) cover all
// of it and nothing comes back locked.

const EASE = [0.16, 1, 0.3, 1];
const FIRST_DECK_SLIDES = 3;

const USE_CASES = [
  {
    value: 'fundraising', label: 'Investor pitch', Icon: Rocket, audience: 'Early-stage investors',
    example: 'Seed pitch for Loop, an app that turns grocery receipts into weekly meal plans. We have 4,000 beta users and 38% week-4 retention, and we are raising $1.5M.',
  },
  {
    value: 'sales', label: 'Sales proposal', Icon: Handshake, audience: 'A prospective client',
    example: 'Proposal to a 200-person logistics company for our route-planning software. It cuts fuel costs by about 12%. The goal is to book a 60-day pilot.',
  },
  {
    value: 'product_launch', label: 'Product launch', Icon: Megaphone, audience: 'Retail partners and press',
    example: 'Launch deck for Refill, a reusable coffee cup that tracks how much plastic you have saved. Launching in 40 cafes this spring.',
  },
  {
    value: 'school', label: 'Class presentation', Icon: GraduationCap, audience: 'Classmates and a teacher',
    example: 'Why coral reefs are bleaching, why it matters for the ocean and for people, and what can still be done about it.',
  },
  {
    value: 'internal', label: 'Team update', Icon: Users, audience: 'My team and leadership',
    example: 'Quarterly update: revenue up 18%, two key hires, one launch that slipped by three weeks, and our three priorities for next quarter.',
  },
  {
    value: 'other', label: 'Something else', Icon: Sparkles, audience: '',
    example: '',
  },
];

const STEPS = ['hello', 'what', 'brief'];

function Say({ children }) {
  return (
    <motion.p
      key={String(children).slice(0, 40)}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="nova-say text-center mx-auto"
      style={{ maxWidth: 360 }}
    >
      {children}
    </motion.p>
  );
}

export default function Onboarding() {
  const { user, subscription } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [useCase, setUseCase] = useState(null);
  const [brief, setBrief] = useState('');
  const [typing, setTyping] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const typingTimer = useRef(0);
  const firstName = (user?.name || '').trim().split(/\s+/)[0];

  useEffect(() => {
    track('onboarding_started');
    capture('onboarding_started');
  }, []);
  useEffect(() => () => clearTimeout(typingTimer.current), []);

  function pick(uc) {
    setUseCase(uc);
    setBrief(uc.example);
    setError('');
    track('onboarding_use_case_selected', { use_case: uc.value });
    capture('onboarding_use_case_selected', { use_case: uc.value });
    setStep(2);
  }

  function onBriefChange(v) {
    setBrief(v);
    setTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 700);
  }

  function skip() {
    track('onboarding_skipped', { step: STEPS[step] });
    capture('onboarding_skipped', { step: STEPS[step] });
    navigate('/dashboard');
  }

  async function create() {
    const text = brief.trim();
    if (text.length < 8) { setError('Give me a sentence or two to work with.'); return; }
    setCreating(true);
    setError('');
    // Saved for personalization; never blocks the deck.
    api.post('/auth/onboarding', { use_case: useCase?.value || 'other' }).catch(() => {});

    const answers = [
      `- What is this deck for?: ${useCase?.label || 'Something else'}`,
      useCase?.audience ? `- Who is the audience?: ${useCase.audience}` : null,
      '- Anything else?: This is my first HyperBeing deck. Make it look exceptional.',
    ].filter(Boolean).join('\n');
    const message = `${text}\n\nPREFLIGHT ANSWERS:\n${answers}\n\nCreate exactly ${FIRST_DECK_SLIDES} slides: this is a short first deck.`;

    try {
      const { data } = await api.post('/presentations', { message, attachments: [], aspectRatio: '16:9' });
      const id = data.presentation.id;
      track('onboarding_completed', { use_case: useCase?.value });
      capture('onboarding_completed', { use_case: useCase?.value });
      track('presentation_created', { presentation_id: id, aspect_ratio: '16:9', source: 'onboarding' });
      capture('presentation_created', { presentation_id: id, aspect_ratio: '16:9', source: 'onboarding' });
      navigate(`/presentations/${id}?welcome=1`, { replace: true });
    } catch (err) {
      setCreating(false);
      const status = err.response?.status;
      if (status === 402) {
        // Out of credits (e.g. an older account): the dashboard explains plans.
        navigate('/dashboard');
        return;
      }
      setError(
        err.response?.data?.error ||
        (status === 429 ? 'Too many decks at once. Give me a minute and try again.' :
         status === 503 ? 'My design engine is busy right now. Please try again in a moment.' :
         'I could not start your deck. Please try again.'),
      );
    }
  }

  const mood = creating ? 'happy' : error ? 'sad' : step === 0 ? 'wave' : step === 1 ? 'idle' : typing ? 'think' : 'happy';
  const credits = subscription?.credits_remaining;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'radial-gradient(ellipse 55% 38% at 50% 108%, rgba(252,115,77,0.28), transparent 70%), radial-gradient(ellipse 70% 60% at 50% 100%, rgba(2,151,222,0.16), transparent 70%), #02070A', color: '#F1F6F9' }}>
      <header className="flex items-center justify-between px-4 sm:px-8 h-16">
        <div className="flex items-center gap-2" aria-label="Progress">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className="h-1.5 rounded-full transition-all duration-500"
              style={{ width: i === step ? 28 : 10, background: i <= step ? '#4CB8F0' : 'rgba(190,225,245,0.16)' }}
            />
          ))}
        </div>
        {!creating && (
          <button type="button" onClick={skip} className="text-sm px-3 py-2 rounded-lg hover:bg-white/5 transition-colors" style={{ color: '#9AAAB5' }}>
            Skip for now
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-12">
        <div className="w-full max-w-[560px] flex flex-col items-center">
          <motion.div layout transition={{ duration: 0.5, ease: EASE }} className="mb-4">
            <Nova size={step === 0 ? 170 : 120} mood={mood} />
          </motion.div>

          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.section key="hello" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4, ease: EASE }} className="text-center w-full">
                <h1 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.05 }} className="text-[36px] sm:text-[48px]">
                  Hi{firstName ? ` ${firstName}` : ''}, I&apos;m <em style={{ color: '#4CB8F0' }}>Nova.</em>
                </h1>
                <p className="mt-4 text-[15px] sm:text-base mx-auto" style={{ color: '#9AAAB5', maxWidth: 400, lineHeight: 1.6 }}>
                  I design presentations. Let&apos;s make your first one together, right now. It takes about a minute, and it&apos;s on me.
                </p>
                <button
                  type="button" autoFocus onClick={() => setStep(1)}
                  className="mt-8 inline-flex items-center gap-2 h-12 px-7 rounded-full font-semibold text-[15px] transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
                  style={{ background: '#F1F6F9', color: '#02070A' }}
                >
                  Let&apos;s make it <ArrowRight size={16} />
                </button>
              </motion.section>
            )}

            {step === 1 && (
              <motion.section key="what" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4, ease: EASE }} className="w-full">
                <Say>What should our first deck be about?</Say>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-6" role="list">
                  {USE_CASES.map((uc) => (
                    <button
                      key={uc.value} type="button" role="listitem" onClick={() => pick(uc)}
                      className="group flex flex-col items-start gap-3 p-4 rounded-2xl text-left transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4CB8F0]"
                      style={{ background: 'rgba(8,19,26,0.85)', border: '1px solid rgba(190,225,245,0.12)' }}
                    >
                      <span className="w-9 h-9 rounded-xl grid place-items-center transition-colors group-hover:text-[#02070A] group-hover:bg-[#4CB8F0]" style={{ background: 'rgba(2,151,222,0.14)', color: '#4CB8F0' }}>
                        <uc.Icon size={18} />
                      </span>
                      <span className="text-[14px] font-medium leading-tight">{uc.label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex justify-center mt-6">
                  <button type="button" onClick={() => setStep(0)} className="inline-flex items-center gap-1.5 text-sm" style={{ color: '#9AAAB5' }}>
                    <ArrowLeft size={14} /> Back
                  </button>
                </div>
              </motion.section>
            )}

            {step === 2 && (
              <motion.section key="brief" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4, ease: EASE }} className="w-full">
                <Say>
                  {creating ? 'On it! Opening your studio…'
                    : useCase?.example ? <>Here&apos;s a starter. <b>Make it yours</b>, or just hit go.</>
                    : <>Tell me the topic in a sentence or two. <b>I&apos;ll fill in the rest.</b></>}
                </Say>
                <div className="mt-6 rounded-2xl p-1.5" style={{ background: 'linear-gradient(180deg, rgba(76,184,240,0.35), rgba(190,225,245,0.08))' }}>
                  <div className="rounded-[14px] p-4" style={{ background: '#111417' }}>
                    <label htmlFor="first-brief" className="block text-[11px] tracking-[0.14em] uppercase mb-2" style={{ fontFamily: 'JetBrains Mono, monospace', color: '#5E717D' }}>
                      {useCase?.label || 'Your deck'}
                    </label>
                    <textarea
                      id="first-brief" autoFocus rows={4} value={brief} disabled={creating}
                      onChange={(e) => onBriefChange(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) create(); }}
                      placeholder="e.g. A pitch for my bakery's new subscription box, for local investors."
                      className="w-full bg-transparent resize-none text-[15px] leading-relaxed focus:outline-none placeholder:text-[#5E717D]"
                      style={{ color: '#F1F6F9' }}
                      maxLength={2000}
                    />
                  </div>
                </div>
                {error && <p role="alert" className="mt-3 text-sm text-center" style={{ color: '#FFB49C' }}>{error}</p>}
                <div className="mt-6 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
                  <button type="button" disabled={creating} onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 text-sm disabled:opacity-40" style={{ color: '#9AAAB5' }}>
                    <ArrowLeft size={14} /> Pick another
                  </button>
                  <button
                    type="button" onClick={create} disabled={creating}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full font-semibold text-[15px] transition-transform hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-80"
                    style={{ background: '#F1F6F9', color: '#02070A' }}
                  >
                    {creating ? <><Loader2 size={16} className="animate-spin" /> Starting…</> : <>Make my deck <ArrowRight size={16} /></>}
                  </button>
                </div>
                <p className="mt-5 text-center text-xs" style={{ fontFamily: 'JetBrains Mono, monospace', color: '#5E717D' }}>
                  {FIRST_DECK_SLIDES} slides{credits != null ? ` · ${credits} free credits in your account` : ' · covered by your free credits'}
                </p>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
