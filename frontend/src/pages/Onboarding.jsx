import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft, Sparkles, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';

/* ── Floating sticker decoration ── */
const STICKERS = [
  { emoji: '✦', x: '8%', y: '12%', size: 24, delay: 0, rotate: 15 },
  { emoji: '◈', x: '92%', y: '8%', size: 20, delay: 0.3, rotate: -20 },
  { emoji: '⬡', x: '5%', y: '70%', size: 28, delay: 0.6, rotate: 30 },
  { emoji: '◎', x: '95%', y: '75%', size: 22, delay: 0.2, rotate: -10 },
  { emoji: '✦', x: '15%', y: '45%', size: 16, delay: 0.8, rotate: 45 },
  { emoji: '▲', x: '88%', y: '40%', size: 14, delay: 0.4, rotate: -35 },
  { emoji: '◆', x: '50%', y: '5%', size: 18, delay: 0.1, rotate: 20 },
  { emoji: '●', x: '20%', y: '88%', size: 12, delay: 0.7, rotate: 0 },
  { emoji: '◈', x: '80%', y: '85%', size: 16, delay: 0.5, rotate: 25 },
];

/* ── Shader background (dynamic import with CSS fallback) ── */
function ShaderBg() {
  const [Shader, setShader] = useState(null);
  useEffect(() => {
    import('@paper-design/shaders-react')
      .then(mod => setShader(() => mod.MeshGradient))
      .catch(() => {});
  }, []);

  if (!Shader) {
    return (
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(135deg, #080808 0%, #0a0818 40%, #1a1540 70%, #0f0f0f 100%)',
      }} />
    );
  }
  return (
    <Shader
      className="absolute inset-0 w-full h-full"
      colors={['#080808', '#0a0818', '#1a1540', '#2d1f8f']}
      speed={0.25}
      backgroundColor="#080808"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
}

/* ── HB Icon ── */
function HBIcon({ size = 28 }) {
  return (
    <div style={{
      width: size, height: size, background: '#5B50FF', flexShrink: 0,
      borderRadius: Math.round(size * 0.22),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 900, color: '#fff', fontSize: size * 0.46, letterSpacing: '-0.1em', paddingRight: '0.05em' }}>HB</span>
    </div>
  );
}

const QUESTIONS = [
  {
    id: 'presenter_type',
    tag: 'YOUR STYLE',
    question: 'What kind of presenter are you?',
    subtext: "Be honest. We won't judge.",
    options: [
      { value: 'last-minute', emoji: '🔥', label: 'Last-minute legend', desc: 'I work best under pressure. Or so I tell myself.' },
      { value: 'data-nerd', emoji: '📊', label: 'Spreadsheet soul', desc: 'Data is my love language. Charts are my poetry.' },
      { value: 'performer', emoji: '🎤', label: 'Natural performer', desc: "I've rehearsed this. Multiple times. In the shower." },
      { value: 'beginner', emoji: '🐣', label: 'Total beginner', desc: 'Send help. And maybe a template.' },
    ],
  },
  {
    id: 'use_case',
    tag: 'USE CASE',
    question: "What are you mostly making these for?",
    subtext: 'Your honest answer helps Nova serve you better.',
    options: [
      { value: 'fundraising', emoji: '💰', label: 'Convincing investors', desc: 'Please, just give me money.' },
      { value: 'school', emoji: '🎓', label: 'School / university', desc: "It's always due on Friday at 11:59 PM." },
      { value: 'marketing', emoji: '📣', label: 'Marketing & campaigns', desc: 'The world needs to know about this.' },
      { value: 'internal', emoji: '🧑‍💼', label: 'Internal work stuff', desc: 'Decks that people skim for 30 seconds.' },
    ],
  },
  {
    id: 'design_vibe',
    tag: 'AESTHETIC',
    question: 'Your ideal design vibe is...',
    subtext: 'This shapes how Nova art-directs your slides.',
    options: [
      { value: 'dark-editorial', emoji: '🖤', label: 'Dark & editorial', desc: 'Like a luxury fashion magazine. Moody. Precise.' },
      { value: 'clean-minimal', emoji: '🤍', label: 'Clean & minimal', desc: 'Less is everything. White space is the message.' },
      { value: 'bold-punchy', emoji: '💥', label: 'Bold & punchy', desc: 'I want reactions. Gasps accepted.' },
      { value: 'colorful', emoji: '🌈', label: 'Colourful & playful', desc: "Life's too short for boring slides." },
    ],
  },
  {
    id: 'frequency',
    tag: 'FREQUENCY',
    question: 'How often do you make presentations?',
    subtext: "Frequency helps us calibrate Nova's pace for you.",
    options: [
      { value: 'daily', emoji: '😰', label: 'Almost every day', desc: 'This is my whole personality now. Help.' },
      { value: 'weekly', emoji: '😅', label: 'Once a week or so', desc: "I'm fine. Everything is fine." },
      { value: 'monthly', emoji: '😬', label: 'Every few months', desc: "But when I do it, it's ALWAYS a crisis." },
      { value: 'first-time', emoji: '🙋', label: 'This is my first one', desc: 'Nervous laugh. But optimistic.' },
    ],
  },
  {
    id: 'priority',
    tag: 'PRIORITY',
    question: 'What matters most to you?',
    subtext: 'Nova will optimise for this above everything else.',
    options: [
      { value: 'speed', emoji: '⚡', label: 'Speed', desc: 'I needed this yesterday. Literally.' },
      { value: 'quality', emoji: '💎', label: 'Quality', desc: 'It has to be beautiful. No exceptions.' },
      { value: 'storytelling', emoji: '🎯', label: 'Storytelling', desc: 'The narrative is everything. Slides are just proof.' },
      { value: 'automation', emoji: '🤖', label: 'Full automation', desc: 'AI does it, I approve it. Perfect.' },
    ],
  },
  {
    id: 'role',
    tag: 'YOUR ROLE',
    question: 'What best describes your role?',
    subtext: 'Helps us tailor the experience to how you actually work.',
    options: [
      { value: 'founder', emoji: '🚀', label: 'Founder / CEO', desc: 'Building something from scratch.' },
      { value: 'marketing', emoji: '📣', label: 'Marketing / Growth', desc: 'Campaigns, content, and conversions.' },
      { value: 'student', emoji: '🎓', label: 'Student', desc: 'Assignments, projects, and presentations.' },
      { value: 'freelancer', emoji: '💼', label: 'Freelancer / Consultant', desc: 'Pitching clients and delivering work.' },
    ],
  },
  {
    id: 'team_size',
    tag: 'TEAM SIZE',
    question: 'How big is your team or organisation?',
    subtext: 'Just you, or a whole operation?',
    options: [
      { value: 'solo', emoji: '🙋', label: 'Just me', desc: 'Solo operator. All decisions, all glory.' },
      { value: 'small', emoji: '🤝', label: '2–10 people', desc: 'Small team, big ambitions.' },
      { value: 'medium', emoji: '🏢', label: '11–50 people', desc: 'Growing fast, need to move faster.' },
      { value: 'large', emoji: '🏛️', label: '50+ people', desc: 'Enterprise scale. Lots of stakeholders.' },
    ],
  },
  {
    id: 'referral',
    tag: 'HOW YOU FOUND US',
    question: 'How did you hear about HyperBeing?',
    subtext: "We're genuinely curious.",
    options: [
      { value: 'social', emoji: '📱', label: 'Social media', desc: 'TikTok, Instagram, X, or LinkedIn.' },
      { value: 'search', emoji: '🔍', label: 'Google / search', desc: 'Found us while looking for something.' },
      { value: 'friend', emoji: '🗣️', label: 'Friend or colleague', desc: 'Someone who has taste sent me here.' },
      { value: 'other', emoji: '✨', label: 'Somewhere else', desc: 'The internet is a wild place.' },
    ],
  },
];

const VIBE_LABELS = {
  'dark-editorial': 'dark editorial masterpieces',
  'clean-minimal': 'beautifully minimal slides',
  'bold-punchy': 'punchy, high-impact visuals',
  'colorful': 'vibrant, joyful designs',
};

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [selected, setSelected] = useState(null);
  const [direction, setDirection] = useState(1);
  const [done, setDone] = useState(false);
  const [particles, setParticles] = useState([]);
  const navigate = useNavigate();
  const { user } = useAuth();

  const q = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;
  const progress = (step / QUESTIONS.length) * 100;

  function spawnParticles() {
    const newParticles = Array.from({ length: 12 }, (_, i) => ({
      id: Date.now() + i,
      x: 40 + Math.random() * 20,
      y: 40 + Math.random() * 20,
      vx: (Math.random() - 0.5) * 120,
      vy: -60 - Math.random() * 80,
      color: ['#5B50FF', '#8B80FF', '#c4beff', '#ffffff'][Math.floor(Math.random() * 4)],
    }));
    setParticles(newParticles);
    setTimeout(() => setParticles([]), 1000);
  }

  function handleSelect(value) {
    setSelected(value);
  }

  async function handleNext() {
    if (!selected) return;
    spawnParticles();
    const newAnswers = { ...answers, [q.id]: selected };
    setAnswers(newAnswers);

    if (isLast) {
      localStorage.setItem('hb_prefs', JSON.stringify(newAnswers));
      api.post('/auth/onboarding', newAnswers).catch(() => {});
      setTimeout(() => setDone(true), 300);
    } else {
      setDirection(1);
      setTimeout(() => {
        setStep(s => s + 1);
        setSelected(null);
      }, 150);
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
  const vibeLabel = VIBE_LABELS[answers.design_vibe] || 'stunning slides';

  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden', background: '#080808', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <ShaderBg />

      {/* Floating stickers */}
      {STICKERS.map((s, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0, rotate: s.rotate - 15 }}
          animate={{ opacity: 0.15, scale: 1, rotate: s.rotate }}
          transition={{ delay: s.delay + 0.5, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'absolute', left: s.x, top: s.y,
            fontSize: s.size, color: '#5B50FF', pointerEvents: 'none', zIndex: 1,
            animation: `float${i % 3} ${4 + i}s ease-in-out infinite`,
          }}
        >
          {s.emoji}
        </motion.div>
      ))}

      {/* Particle burst */}
      {particles.map(p => (
        <motion.div
          key={p.id}
          initial={{ x: `${p.x}vw`, y: `${p.y}vh`, opacity: 1, scale: 1 }}
          animate={{ x: `calc(${p.x}vw + ${p.vx}px)`, y: `calc(${p.y}vh + ${p.vy}px)`, opacity: 0, scale: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ position: 'fixed', width: 6, height: 6, borderRadius: '50%', background: p.color, pointerEvents: 'none', zIndex: 50 }}
        />
      ))}

      {/* Logo */}
      <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <HBIcon size={26} />
        <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 14, color: '#f0f0ee', letterSpacing: '-0.02em' }}>HyperBeing</span>
      </div>

      {/* Skip */}
      {!done && (
        <button
          onClick={handleFinish}
          style={{ position: 'absolute', top: 24, right: 24, zIndex: 10, background: 'none', border: 'none', color: '#555555', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter,sans-serif', transition: 'color 0.15s' }}
          onMouseEnter={e => e.target.style.color = '#888888'}
          onMouseLeave={e => e.target.style.color = '#555555'}
        >
          Skip for now →
        </button>
      )}

      <AnimatePresence mode="wait">
        {done ? (
          /* ── Completion screen ── */
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{ position: 'relative', zIndex: 10, textAlign: 'center', maxWidth: 480, width: '100%' }}
          >
            {/* Success icon */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.15 }}
              style={{ margin: '0 auto 32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <div style={{
                width: 80, height: 80, background: '#5B50FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 18,
                boxShadow: 'rgba(91,80,255,0.5) 0px 0px 48px',
              }}>
                <Check size={36} color="#fff" strokeWidth={2.5} />
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <h2 style={{ fontFamily: 'Playfair Display,Georgia,serif', fontSize: 36, fontWeight: 400, color: '#f0f0ee', marginBottom: 12, letterSpacing: '-0.02em' }}>
                You're all set, <em>{firstName}!</em>
              </h2>
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 16, color: '#888888', lineHeight: 1.6, marginBottom: 32 }}>
                Nova is calibrated to create {vibeLabel} for you.
              </p>

              {/* Answer pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 40 }}>
                {Object.entries(answers).map(([key, val]) => {
                  const question = QUESTIONS.find(q => q.id === key);
                  const option = question?.options.find(o => o.value === val);
                  if (!option) return null;
                  return (
                    <span key={key} style={{
                      fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600,
                      padding: '6px 12px', borderRadius: 4,
                      background: 'rgba(91,80,255,0.12)', color: '#8B80FF',
                      border: '0.5px solid rgba(91,80,255,0.3)',
                    }}>
                      {option.emoji} {option.label}
                    </span>
                  );
                })}
              </div>

              {/* CTA button - explicit inline styles so it's always visible */}
              <button
                onClick={handleFinish}
                style={{
                  width: '100%', padding: '14px 24px',
                  fontFamily: 'Inter,sans-serif', fontSize: 15, fontWeight: 600,
                  color: '#ffffff', background: '#5B50FF',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: 'rgba(91,80,255,0.35) 0px 4px 24px',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#6E63FF'}
                onMouseLeave={e => e.currentTarget.style.background = '#5B50FF'}
              >
                <Sparkles size={16} />
                Take me to my dashboard
                <ArrowRight size={16} />
              </button>
            </motion.div>
          </motion.div>

        ) : (
          /* ── Question screen ── */
          <motion.div
            key={step}
            initial={{ opacity: 0, x: direction * 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -50 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 520 }}
          >
            {/* Progress bar */}
            <div style={{ marginBottom: 40 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#8B80FF', letterSpacing: '0.15em', textTransform: 'uppercase' }}>{q.tag}</span>
                <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#555555', letterSpacing: '0.1em' }}>{step + 1}/{QUESTIONS.length}</span>
              </div>
              <div style={{ height: 2, background: '#1e1e1e', borderRadius: 1, overflow: 'hidden' }}>
                <motion.div
                  style={{ height: '100%', background: 'linear-gradient(90deg, #5B50FF, #8B80FF)', borderRadius: 1 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
            </div>

            {/* Question heading */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <motion.h2
                key={step + '-q'}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ fontFamily: 'Playfair Display,Georgia,serif', fontSize: 'clamp(24px,4vw,32px)', fontWeight: 400, color: '#f0f0ee', marginBottom: 8, letterSpacing: '-0.02em', lineHeight: 1.2 }}
              >
                <em>{q.question}</em>
              </motion.h2>
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: '#555555' }}>{q.subtext}</p>
            </div>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
              {q.options.map((opt, i) => {
                const isSelected = selected === opt.value;
                return (
                  <motion.button
                    key={opt.value}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => handleSelect(opt.value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                      borderRadius: 8, cursor: 'pointer', textAlign: 'left', width: '100%',
                      background: isSelected ? 'rgba(91,80,255,0.12)' : 'rgba(255,255,255,0.03)',
                      border: isSelected ? '0.5px solid rgba(91,80,255,0.5)' : '0.5px solid #1e1e1e',
                      boxShadow: isSelected ? 'rgba(91,80,255,0.2) 0px 0px 20px' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = '#2a2a2a'; }}}
                    onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = '#1e1e1e'; }}}
                  >
                    {/* Emoji */}
                    <span style={{ fontSize: 24, flexShrink: 0, width: 36, textAlign: 'center' }}>{opt.emoji}</span>

                    {/* Text */}
                    <div style={{ flex: 1 }}>
                      <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: 600, color: isSelected ? '#f0f0ee' : '#b8b8b8', marginBottom: 2 }}>{opt.label}</p>
                      <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#555555' }}>{opt.desc}</p>
                    </div>

                    {/* Check */}
                    <AnimatePresence>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          style={{
                            width: 20, height: 20, borderRadius: '50%', background: '#5B50FF',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}
                        >
                          <Check size={11} color="#fff" strokeWidth={3} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>

            {/* Navigation */}
            <div style={{ display: 'flex', gap: 10 }}>
              {step > 0 && (
                <button
                  onClick={handleBack}
                  style={{
                    width: 44, height: 44, borderRadius: 6, border: '0.5px solid #1e1e1e',
                    background: 'rgba(255,255,255,0.03)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#555555', flexShrink: 0, transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888888'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e1e1e'; e.currentTarget.style.color = '#555555'; }}
                >
                  <ArrowLeft size={16} />
                </button>
              )}
              <button
                onClick={handleNext}
                disabled={!selected}
                style={{
                  flex: 1, height: 44,
                  fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: 600,
                  color: selected ? '#ffffff' : '#3a3a3a',
                  background: selected ? '#5B50FF' : '#141414',
                  border: 'none', borderRadius: 6, cursor: selected ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: selected ? 'rgba(91,80,255,0.3) 0px 4px 20px' : 'none',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { if (selected) e.currentTarget.style.background = '#6E63FF'; }}
                onMouseLeave={e => { if (selected) e.currentTarget.style.background = '#5B50FF'; }}
              >
                {isLast ? <><Sparkles size={14} /> Let's go</> : <>Continue <ArrowRight size={14} /></>}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes float0 { 0%, 100% { transform: translateY(0px) rotate(var(--r, 0deg)); } 50% { transform: translateY(-10px) rotate(var(--r, 0deg)); } }
        @keyframes float1 { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-7px); } }
        @keyframes float2 { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-14px); } }
      `}</style>
    </div>
  );
}
