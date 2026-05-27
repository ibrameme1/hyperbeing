import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft, Sparkles, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const QUESTIONS = [
  {
    id: 'presenter_type',
    emoji: '🎭',
    question: 'What kind of presenter are you?',
    subtext: 'Be honest. We won\'t judge.',
    options: [
      { value: 'last-minute', label: '🔥 Last-minute legend', desc: 'I work best under pressure. Or so I tell myself.' },
      { value: 'data-nerd', label: '📊 Spreadsheet soul', desc: 'Data is my love language. Charts are my poetry.' },
      { value: 'performer', label: '🎤 Natural performer', desc: 'I\'ve rehearsed this. Multiple times. In the shower.' },
      { value: 'beginner', label: '🐣 Total beginner', desc: 'Send help. And maybe a template.' },
    ],
  },
  {
    id: 'use_case',
    emoji: '🎯',
    question: 'What are you mostly making these for?',
    subtext: 'Your honest answer helps Nova serve you better.',
    options: [
      { value: 'fundraising', label: '💰 Convincing investors', desc: 'Please, just give me money.' },
      { value: 'school', label: '🎓 School / university', desc: 'It\'s always due on Friday at 11:59 PM.' },
      { value: 'marketing', label: '📣 Marketing & campaigns', desc: 'The world needs to know about this.' },
      { value: 'internal', label: '🧑‍💼 Internal work stuff', desc: 'Decks that people skim for 30 seconds.' },
    ],
  },
  {
    id: 'design_vibe',
    emoji: '✨',
    question: 'Your ideal design vibe is...',
    subtext: 'This shapes how Nova art-directs your slides.',
    options: [
      { value: 'dark-editorial', label: '🖤 Dark & editorial', desc: 'Like a luxury fashion magazine. Moody. Precise.' },
      { value: 'clean-minimal', label: '🤍 Clean & minimal', desc: 'Less is everything. White space is the message.' },
      { value: 'bold-punchy', label: '💥 Bold & punchy', desc: 'I want reactions. Gasps accepted.' },
      { value: 'colorful', label: '🌈 Colourful & playful', desc: 'Life\'s too short for boring slides.' },
    ],
  },
  {
    id: 'frequency',
    emoji: '📅',
    question: 'How often do you make presentations?',
    subtext: 'Frequency helps us calibrate Nova\'s pace for you.',
    options: [
      { value: 'daily', label: '😰 Almost every day', desc: 'This is my whole personality now. Help.' },
      { value: 'weekly', label: '😅 Once a week or so', desc: 'I\'m fine. Everything is fine.' },
      { value: 'monthly', label: '😬 Every few months', desc: 'But when I do it, it\'s ALWAYS a crisis.' },
      { value: 'first-time', label: '🙋 This is my first one', desc: 'Nervous laugh. But optimistic.' },
    ],
  },
  {
    id: 'priority',
    emoji: '⚡',
    question: 'What matters most to you?',
    subtext: 'Nova will optimise for this above everything else.',
    options: [
      { value: 'speed', label: '⚡ Speed', desc: 'I needed this yesterday. Literally.' },
      { value: 'quality', label: '💎 Quality', desc: 'It has to be beautiful. No exceptions.' },
      { value: 'storytelling', label: '🎯 Storytelling', desc: 'The narrative is everything. Slides are just proof.' },
      { value: 'automation', label: '🤖 Full automation', desc: 'AI does it, I approve it. Perfect.' },
    ],
  },
];

const COMPLETION_MESSAGES = {
  presenter_type: {
    'last-minute': 'Nova works fast. You\'ll love each other.',
    'data-nerd': 'Nova speaks fluent data. You\'re going to get along.',
    'performer': 'Nova will make sure your visuals match your energy.',
    'beginner': 'Nova will hold your hand. Gently. The whole time.',
  },
  design_vibe: {
    'dark-editorial': 'dark editorial masterpieces',
    'clean-minimal': 'beautifully minimal slides',
    'bold-punchy': 'punchy, high-impact visuals',
    'colorful': 'vibrant, joyful designs',
  },
};

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [selected, setSelected] = useState(null);
  const [direction, setDirection] = useState(1);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const q = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;

  function handleSelect(value) {
    setSelected(value);
  }

  function handleNext() {
    if (!selected) return;
    const newAnswers = { ...answers, [q.id]: selected };
    setAnswers(newAnswers);

    if (isLast) {
      localStorage.setItem('hb_prefs', JSON.stringify(newAnswers));
      setDone(true);
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

  const firstName = user?.name?.split(' ')[0] || 'there';
  const vibeLabel = COMPLETION_MESSAGES.design_vibe[answers.design_vibe] || 'stunning slides';
  const presenterMsg = COMPLETION_MESSAGES.presenter_type[answers.presenter_type] || '';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
         style={{ background: '#0A0A0B' }}>

      {/* Aurora background */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full pointer-events-none"
           style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 65%)', filter: 'blur(60px)' }} />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full pointer-events-none"
           style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.14) 0%, transparent 65%)', filter: 'blur(60px)' }} />

      {/* Logo */}
      <div className="absolute top-6 left-6 flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}>
          <Sparkles size={14} className="text-white" />
        </div>
        <span className="text-white/60 font-semibold text-sm">HyperBeing</span>
      </div>

      {/* Skip */}
      {!done && (
        <button
          onClick={handleFinish}
          className="absolute top-6 right-6 text-white/30 hover:text-white/60 text-sm transition-colors"
        >
          Skip for now →
        </button>
      )}

      <AnimatePresence mode="wait">
        {done ? (
          /* ── Completion screen ── */
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 text-center max-w-md w-full"
          >
            {/* Animated success icon */}
            <motion.div
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}
              className="w-24 h-24 rounded-3xl mx-auto mb-8 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)', boxShadow: '0 0 60px rgba(139,92,246,0.5)' }}
            >
              <CheckCircle2 size={42} className="text-white" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <h2 className="font-display text-3xl font-bold text-white mb-3">
                You're all set, {firstName}!
              </h2>
              <p className="text-white/50 text-base leading-relaxed mb-2">
                Nova is calibrated and ready to create {vibeLabel} for you.
              </p>
              {presenterMsg && (
                <p className="text-white/35 text-sm mb-10 italic">"{presenterMsg}"</p>
              )}

              {/* Summary pills */}
              <div className="flex flex-wrap gap-2 justify-center mb-10">
                {Object.entries(answers).map(([key, val]) => {
                  const question = QUESTIONS.find(q => q.id === key);
                  const option = question?.options.find(o => o.value === val);
                  if (!option) return null;
                  return (
                    <span
                      key={key}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                      style={{ background: 'rgba(139,92,246,0.2)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,0.3)' }}
                    >
                      {option.label}
                    </span>
                  );
                })}
              </div>

              <button
                onClick={handleFinish}
                className="hb-btn text-base px-8 py-4 w-full"
              >
                <Sparkles size={18} />
                Take me to my dashboard
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
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-lg"
          >
            {/* Progress */}
            <div className="flex items-center gap-2 mb-10">
              {QUESTIONS.map((_, i) => (
                <div
                  key={i}
                  className="h-1 rounded-full flex-1 transition-all duration-500"
                  style={{
                    background: i <= step
                      ? 'linear-gradient(90deg, #8B5CF6, #00F0FF)'
                      : 'rgba(255,255,255,0.10)',
                  }}
                />
              ))}
            </div>

            {/* Question */}
            <div className="text-center mb-8">
              <div className="text-5xl mb-4">{q.emoji}</div>
              <h2 className="text-2xl font-bold text-white mb-2">{q.question}</h2>
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
                      style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' }}
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
                  background: selected ? 'linear-gradient(135deg, #8B5CF6 0%, #00F0FF 100%)' : 'rgba(255,255,255,0.08)',
                  boxShadow: selected ? '0 4px 24px rgba(139,92,246,0.35)' : 'none',
                }}
              >
                {isLast ? (
                  <><Sparkles size={15} /> Let's go</>
                ) : (
                  <>Continue <ArrowRight size={15} /></>
                )}
              </button>
            </div>

            <p className="text-center text-white/20 text-xs mt-5">
              {step + 1} of {QUESTIONS.length}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
