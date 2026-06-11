import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft, Sparkles, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { track } from '../utils/track';
import Logo from '../components/Logo';
import NovaMascotVideo from '../components/NovaMascotVideo';

const EASE = [0.16, 1, 0.3, 1];

const QUESTIONS = [
  {
    id: 'use_case',
    emoji: '🎯',
    novaLine: "Okay, let's start with the big one.",
    question: "What's the most important deck you need to make right now?",
    subtext: "Be honest — this is the one Nova will obsess over first.",
    mood: 'idle',
    options: [
      { value: 'fundraising', label: '💰 Raise money', desc: 'Investor pitch. I need this to be perfect.' },
      { value: 'product_launch', label: '🚀 Launch something', desc: 'Product or service. The world needs to know.' },
      { value: 'sales', label: '📣 Win clients', desc: 'Proposal or sales deck. Closing time.' },
      { value: 'school', label: '🎓 Ace an assignment', desc: 'Class presentation. Due very soon.' },
      { value: 'internal', label: '🧑‍💼 Convince my team', desc: 'Internal deck. Lots of stakeholders.' },
    ],
  },
  {
    id: 'presenter_type',
    emoji: '🎭',
    novaLine: "Got it — I'll keep that in mind. Now, who am I working with?",
    question: 'What kind of presenter are you?',
    subtext: "Be honest. We won't judge.",
    mood: 'thinking',
    options: [
      { value: 'last-minute', label: '🔥 Last-minute legend', desc: 'I work best under pressure. Or so I tell myself.' },
      { value: 'data-nerd', label: '📊 Spreadsheet soul', desc: 'Data is my love language. Charts are my poetry.' },
      { value: 'performer', label: '🎤 Natural performer', desc: "I've rehearsed this. Multiple times. In the shower." },
      { value: 'beginner', label: '🐣 Total beginner', desc: 'Send help. And maybe a template.' },
    ],
  },
  {
    id: 'design_vibe',
    emoji: '✨',
    novaLine: "Love it. Let's make sure your slides match your energy.",
    question: 'Your ideal design vibe is...',
    subtext: 'This shapes how Nova art-directs your slides.',
    mood: 'idle',
    options: [
      { value: 'dark-editorial', label: '🖤 Dark & editorial', desc: 'Like a luxury fashion magazine. Moody. Precise.' },
      { value: 'clean-minimal', label: '🤍 Clean & minimal', desc: 'Less is everything. White space is the message.' },
      { value: 'bold-punchy', label: '💥 Bold & punchy', desc: 'I want reactions. Gasps accepted.' },
      { value: 'colorful', label: '🌈 Colourful & playful', desc: "Life's too short for boring slides." },
    ],
  },
  {
    id: 'priority',
    emoji: '⚡',
    novaLine: 'One more thing before I lock in your settings —',
    question: 'What matters most to you?',
    subtext: "Nova will optimise for this above everything else.",
    mood: 'thinking',
    options: [
      { value: 'speed', label: '⚡ Speed', desc: 'I needed this yesterday. Literally.' },
      { value: 'quality', label: '💎 Quality', desc: 'It has to be beautiful. No exceptions.' },
      { value: 'storytelling', label: '🎯 Storytelling', desc: 'The narrative is everything. Slides are just proof.' },
      { value: 'automation', label: '🤖 Full automation', desc: 'AI does it, I approve it. Perfect.' },
    ],
  },
  {
    id: 'role',
    emoji: '🏷️',
    novaLine: 'Okay, almost there. Just a couple quick ones.',
    question: 'What best describes your role?',
    subtext: 'Helps us tailor the experience to how you actually work.',
    mood: 'idle',
    options: [
      { value: 'founder', label: '🚀 Founder / CEO', desc: 'Building something from scratch.' },
      { value: 'marketing', label: '📣 Marketing / Growth', desc: 'Campaigns, content, and conversions.' },
      { value: 'student', label: '🎓 Student', desc: 'Assignments, projects, and presentations.' },
      { value: 'freelancer', label: '💼 Freelancer / Consultant', desc: 'Pitching clients and delivering work.' },
    ],
  },
  {
    id: 'frequency',
    emoji: '📅',
    novaLine: 'Good to know.',
    question: 'How often do you make presentations?',
    subtext: "Frequency helps us calibrate Nova's pace for you.",
    mood: 'thinking',
    options: [
      { value: 'daily', label: '😰 Almost every day', desc: 'This is my whole personality now. Help.' },
      { value: 'weekly', label: '😅 Once a week or so', desc: "I'm fine. Everything is fine." },
      { value: 'monthly', label: '😬 Every few months', desc: 'But when I do it, it\'s ALWAYS a crisis.' },
      { value: 'first-time', label: '🙋 This is my first one', desc: 'Nervous laugh. But optimistic.' },
    ],
  },
  {
    id: 'team_size',
    emoji: '👥',
    novaLine: 'Makes sense.',
    question: 'How big is your team or organisation?',
    subtext: 'Just you, or a whole operation?',
    mood: 'idle',
    options: [
      { value: 'solo', label: '🙋 Just me', desc: 'Solo operator. All decisions, all glory.' },
      { value: 'small', label: '🤝 2–10 people', desc: 'Small team, big ambitions.' },
      { value: 'medium', label: '🏢 11–50 people', desc: 'Growing fast, need to move faster.' },
      { value: 'large', label: '🏛️ 50+ people', desc: 'Enterprise scale. Lots of stakeholders.' },
    ],
  },
  {
    id: 'referral',
    emoji: '📡',
    novaLine: "Last one, I promise.",
    question: 'How did you hear about HyperBeing?',
    subtext: "We're genuinely curious.",
    mood: 'idle',
    options: [
      { value: 'social', label: '📱 Social media', desc: 'TikTok, Instagram, X, or LinkedIn.' },
      { value: 'search', label: '🔍 Google / search', desc: 'Found us while looking for something.' },
      { value: 'friend', label: '🗣️ Friend or colleague', desc: 'Someone who has taste sent me here.' },
      { value: 'other', label: '✨ Somewhere else', desc: 'The internet is a wild place.' },
    ],
  },
];

const CALIBRATION_INDEX = 3; // after 'priority' (0-indexed), before 'role'

const COMPLETION_MESSAGES = {
  presenter_type: {
    'last-minute': "Nova works fast. You'll love each other.",
    'data-nerd': "Nova speaks fluent data. You're going to get along.",
    'performer': 'Nova will make sure your visuals match your energy.',
    'beginner': "Nova will hold your hand. Gently. The whole time.",
  },
  design_vibe: {
    'dark-editorial': 'dark editorial masterpieces',
    'clean-minimal': 'beautifully minimal slides',
    'bold-punchy': 'punchy, high-impact visuals',
    'colorful': 'vibrant, joyful designs',
  },
};

const USE_CASE_LABELS = {
  fundraising: 'investor-ready pitch',
  product_launch: 'launch deck',
  sales: 'proposal',
  school: 'presentation',
  internal: 'internal deck',
};

function getUpgradeSeed(answers) {
  if (answers.role === 'founder') {
    return { text: 'Founders on Pro get 5,000 credits/month — enough for fundraise season.', trigger: 'role:founder' };
  }
  if (answers.frequency === 'daily') {
    return { text: "Making decks daily? Pro members get priority generation — no waiting.", trigger: 'frequency:daily' };
  }
  if (answers.team_size === 'medium' || answers.team_size === 'large') {
    return { text: 'Your team would love shared brand kits — coming to Ultra.', trigger: `team_size:${answers.team_size}` };
  }
  return { text: '10x the decks. Upgrade to Pro for 5,000 credits/month.', trigger: 'default' };
}

/* Speech bubble that sits next to/under Nova */
function NovaSpeech({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE, delay: 0.15 }}
      className="relative"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '10px 16px',
        maxWidth: 320,
        margin: '0 auto',
      }}
    >
      <p className="text-white/70 text-sm text-center leading-snug">{children}</p>
      <div
        style={{
          position: 'absolute',
          top: -6,
          left: '50%',
          transform: 'translateX(-50%) rotate(45deg)',
          width: 12,
          height: 12,
          background: 'rgba(255,255,255,0.06)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      />
    </motion.div>
  );
}

export default function Onboarding() {
  const [phase, setPhase] = useState('welcome'); // welcome | question | calibration | done
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [selected, setSelected] = useState(null);
  const [direction, setDirection] = useState(1);
  const [saveError, setSaveError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  const stepStartRef = useRef(Date.now());
  const flowStartRef = useRef(Date.now());

  useEffect(() => {
    stepStartRef.current = Date.now();
  }, [step, phase]);

  const q = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;
  const firstName = user?.name?.split(' ')[0] || 'there';

  function handleStart() {
    track('onboarding_started');
    setPhase('question');
  }

  function handleSelect(value) {
    setSelected(value);
  }

  async function handleNext() {
    if (!selected) return;
    const newAnswers = { ...answers, [q.id]: selected };
    setAnswers(newAnswers);
    track('onboarding_question_answered', {
      step,
      question_id: q.id,
      answer: selected,
      time_on_step_ms: Date.now() - stepStartRef.current,
    });

    if (isLast) {
      localStorage.setItem('hb_prefs', JSON.stringify(newAnswers));
      setSaveError('');
      try {
        await api.post('/auth/onboarding', newAnswers);
        const seed = getUpgradeSeed(newAnswers);
        track('onboarding_completed', {
          answers_summary: newAnswers,
          total_time_ms: Date.now() - flowStartRef.current,
        });
        track('onboarding_upgrade_seed_shown', { seed_variant: seed.trigger, trigger_answer: seed.trigger });
        setPhase('done');
      } catch {
        setSaveError('Something went wrong saving your preferences. Try again.');
      }
    } else if (step === CALIBRATION_INDEX) {
      track('onboarding_calibration_seen');
      setPhase('calibration');
      setTimeout(() => {
        setDirection(1);
        setStep(s => s + 1);
        setSelected(null);
        setPhase('question');
      }, 1800);
    } else {
      setDirection(1);
      setStep(s => s + 1);
      setSelected(null);
    }
  }

  function handleBack() {
    if (step === 0) return;
    setDirection(-1);
    setStep(s => s - 1);
    setSelected(answers[QUESTIONS[step - 1].id] || null);
  }

  function handleFinish() {
    navigate('/dashboard');
  }

  function handleSkip() {
    track('onboarding_skipped', { step, phase });
    navigate('/dashboard');
  }

  function handleUpgradeSeedClick(seed) {
    track('onboarding_upgrade_seed_clicked', { seed_variant: seed.trigger });
    navigate('/pricing');
  }

  const vibeLabel = COMPLETION_MESSAGES.design_vibe[answers.design_vibe] || 'stunning slides';
  const presenterMsg = COMPLETION_MESSAGES.presenter_type[answers.presenter_type] || '';
  const useCaseLabel = USE_CASE_LABELS[answers.use_case] || 'first deck';
  const upgradeSeed = getUpgradeSeed(answers);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
         style={{ background: '#080808' }}>

      {/* Aurora background */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full pointer-events-none"
           style={{ background: 'radial-gradient(circle, rgba(91,80,255,0.18) 0%, transparent 65%)', filter: 'blur(60px)' }} />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full pointer-events-none"
           style={{ background: 'radial-gradient(circle, rgba(91,80,255,0.10) 0%, transparent 65%)', filter: 'blur(60px)' }} />

      {/* Logo */}
      <div className="absolute top-6 left-6">
        <Logo dark height={37} />
      </div>

      {/* Skip */}
      {phase !== 'done' && (
        <button
          onClick={handleSkip}
          className="absolute top-6 right-6 text-white/30 hover:text-white/60 text-sm transition-colors"
        >
          Skip for now →
        </button>
      )}

      <AnimatePresence mode="wait">
        {phase === 'welcome' ? (
          /* ── Welcome screen ── */
          <motion.div
            key="welcome"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="relative z-10 text-center max-w-md w-full flex flex-col items-center"
          >
            <div className="mb-6">
              <NovaMascotVideo size={140} />
            </div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <h1 className="font-display text-3xl font-bold text-white mb-3">
                Hey {firstName}, I'm Nova 👋
              </h1>
              <p className="text-white/55 text-base leading-relaxed mb-1 max-w-sm mx-auto">
                I turn ideas into stunning decks in seconds.
              </p>
              <p className="text-white/55 text-base leading-relaxed mb-10 max-w-sm mx-auto">
                But first, let me actually get to know you — so I can be <span className="text-white font-semibold">your</span> Nova, not just anyone's.
              </p>

              <button onClick={handleStart} className="hb-btn text-base px-8 py-4 w-full">
                <Sparkles size={18} />
                Let's do it
                <ArrowRight size={16} />
              </button>
            </motion.div>
          </motion.div>

        ) : phase === 'calibration' ? (
          /* ── Calibration interstitial ── */
          <motion.div
            key="calibration"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="relative z-10 text-center max-w-md w-full flex flex-col items-center"
          >
            <div className="mb-8">
              <NovaMascotVideo size={130} />
            </div>
            <motion.h2
              key="cal-text"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="font-display text-2xl font-bold"
              style={{ color: '#8B80FF' }}
            >
              Absorbing your vibe...
            </motion.h2>
          </motion.div>

        ) : phase === 'done' ? (
          /* ── Completion screen ── */
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="relative z-10 text-center max-w-md w-full"
          >
            <div className="flex justify-center mb-6">
              <NovaMascotVideo size={130} />
            </div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <h2 className="font-display text-3xl font-bold text-white mb-3">
                You're all set, {firstName}!
              </h2>
              <p className="text-white/50 text-base leading-relaxed mb-2">
                Nova's calibrated and ready to build your {useCaseLabel} — with {vibeLabel}.
              </p>
              {presenterMsg && (
                <p className="text-white/35 text-sm mb-8 italic">"{presenterMsg}"</p>
              )}

              {/* Summary pills */}
              <div className="flex flex-wrap gap-2 justify-center mb-8">
                {Object.entries(answers).map(([key, val]) => {
                  const question = QUESTIONS.find(qq => qq.id === key);
                  const option = question?.options.find(o => o.value === val);
                  if (!option) return null;
                  return (
                    <span
                      key={key}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                      style={{ background: 'rgba(91,80,255,0.15)', color: '#8B80FF', border: '1px solid rgba(91,80,255,0.3)' }}
                    >
                      {option.label}
                    </span>
                  );
                })}
              </div>

              {/* Credits + upgrade seed */}
              <div
                className="mb-6 text-left"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/70 text-sm font-semibold">Your starter credits</span>
                  <span className="text-sm font-bold" style={{ color: '#8B80FF' }}>54 free credits</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full" style={{ width: '100%', background: 'linear-gradient(90deg, #5B50FF, #8B80FF)' }} />
                </div>
                <button
                  onClick={() => handleUpgradeSeedClick(upgradeSeed)}
                  className="text-xs text-white/45 hover:text-white/75 transition-colors text-left w-full"
                >
                  💡 {upgradeSeed.text} <span style={{ color: '#8B80FF' }}>See plans →</span>
                </button>
              </div>

              <button
                onClick={handleFinish}
                className="hb-btn text-base px-8 py-4 w-full"
              >
                <Sparkles size={18} />
                Make my first deck
                <ArrowRight size={16} />
              </button>
            </motion.div>
          </motion.div>

        ) : (
          /* ── Question screen ── */
          <motion.div
            key={step}
            initial={{ opacity: 0, x: direction * 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -60 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="relative z-10 w-full max-w-lg"
          >
            {/* Progress */}
            <div className="flex items-center gap-2 mb-8">
              {QUESTIONS.map((_, i) => (
                <div
                  key={i}
                  className="h-1 rounded-full flex-1 transition-all duration-500"
                  style={{
                    background: i <= step
                      ? 'linear-gradient(90deg, #5B50FF, #8B80FF)'
                      : 'rgba(255,255,255,0.10)',
                  }}
                />
              ))}
            </div>

            {/* Nova + speech */}
            <div className="flex flex-col items-center mb-6">
              <div className="mb-3">
                <NovaMascotVideo size={84} />
              </div>
              <NovaSpeech>{q.novaLine}</NovaSpeech>
            </div>

            {/* Question */}
            <div className="text-center mb-8">
              <div className="text-4xl mb-3">{q.emoji}</div>
              <h2 className="font-display text-2xl font-bold text-white mb-2">{q.question}</h2>
              <p className="text-white/40 text-sm">{q.subtext}</p>
            </div>

            {/* Options */}
            <div className="space-y-3 mb-8">
              {q.options.map((opt, i) => (
                <motion.button
                  key={opt.value}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.35 }}
                  onClick={() => handleSelect(opt.value)}
                  className={`hb-chip w-full text-left flex items-start gap-3 ${selected === opt.value ? 'selected' : ''}`}
                >
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{opt.label}</p>
                    <p className="text-xs mt-0.5 opacity-60">{opt.desc}</p>
                  </div>
                  {selected === opt.value && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: '#5B50FF' }}
                    >
                      <CheckCircle2 size={12} className="text-white" />
                    </motion.div>
                  )}
                </motion.button>
              ))}
            </div>

            {/* Nav buttons */}
            <div className="flex items-center gap-3">
              {step > 0 && (
                <button
                  onClick={handleBack}
                  className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <button
                onClick={handleNext}
                disabled={!selected}
                className="flex-1 py-3.5 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] disabled:opacity-30"
                style={{
                  background: selected ? '#5B50FF' : 'rgba(255,255,255,0.08)',
                  boxShadow: selected ? '0 4px 24px rgba(91,80,255,0.35)' : 'none',
                }}
              >
                {isLast ? (
                  <><Sparkles size={15} /> Let's go</>
                ) : (
                  <>Continue <ArrowRight size={15} /></>
                )}
              </button>
            </div>

            {saveError && (
              <p style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: 13,
                color: '#f87171',
                textAlign: 'center',
                marginTop: 12,
                padding: '8px 12px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8,
              }}>
                {saveError}
              </p>
            )}

            <p className="text-center text-white/20 text-xs mt-5">
              {step + 1} of {QUESTIONS.length}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
