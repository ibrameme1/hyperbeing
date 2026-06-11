import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import NovaMascot from '../components/NovaMascot';

const EASE = [0.16, 1, 0.3, 1];

const NOVA_LINES = {
  Basic: "yay, welcome aboard! i've got way more room to create with you now.",
  Pro: "okay we're cooking now. let's make some seriously good decks.",
  'Ultra 1': "ultra mode unlocked! i'm so ready for whatever you throw at me.",
  'Ultra 2': "ultra mode unlocked! i'm so ready for whatever you throw at me.",
  'Ultra 3': "ultra mode unlocked! i'm so ready for whatever you throw at me.",
  'Ultra 4': "ultra mode unlocked! i'm so ready for whatever you throw at me.",
  default: "yay, thank you! i'm so ready to start creating with you.",
};

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

export default function BillingSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [plan, setPlan] = useState(null);
  const [credits, setCredits] = useState(null);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const applyResult = (data) => {
      setPlan(data.plan?.name);
      setCredits(data.subscription?.credits_remaining);
    };

    async function load() {
      try {
        if (sessionId) {
          const r = await api.get('/billing/confirm-session', { params: { session_id: sessionId } });
          applyResult(r.data);
        } else {
          const r = await api.get('/billing/subscription');
          applyResult(r.data);
        }
      } catch {
        setFetchError(true);
      }
    }

    load();
  }, [searchParams]);

  const novaLine = NOVA_LINES[plan] || NOVA_LINES.default;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden" style={{ background: '#080808' }}>
      {/* Aurora background */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full pointer-events-none"
           style={{ background: 'radial-gradient(circle, rgba(91,80,255,0.18) 0%, transparent 65%)', filter: 'blur(60px)' }} />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full pointer-events-none"
           style={{ background: 'radial-gradient(circle, rgba(91,80,255,0.10) 0%, transparent 65%)', filter: 'blur(60px)' }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative z-10 text-center max-w-md w-full"
      >
        <div className="flex justify-center mb-3">
          <NovaMascot size={130} />
        </div>

        <div className="mb-6">
          <NovaSpeech>{novaLine}</NovaSpeech>
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h1 className="font-display text-3xl font-bold text-white mb-3">
            You're on {plan || 'your new plan'}!
          </h1>
          <p className="text-white/50 text-base leading-relaxed mb-8">
            Payment confirmed. Nova is ready to create.
          </p>

          {credits !== null && (
            <div
              className="mb-6 text-left"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}
            >
              <div className="flex items-center justify-between">
                <span className="text-white/70 text-sm font-semibold">Credits added to your account</span>
                <span className="text-sm font-bold" style={{ color: '#8B80FF' }}>{credits.toLocaleString()} credits</span>
              </div>
            </div>
          )}

          {fetchError && (
            <p style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 13,
              color: '#f87171',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8,
              padding: '8px 12px',
              marginBottom: 24,
            }}>
              We couldn't load your updated plan info —{' '}
              <a
                href="/pricing"
                style={{ color: '#f87171', textDecoration: 'underline', cursor: 'pointer' }}
              >
                check your billing page
              </a>.
            </p>
          )}

          <button
            onClick={() => navigate('/dashboard')}
            className="hb-btn text-base px-8 py-4 w-full"
          >
            <Sparkles size={18} />
            Start creating
            <ArrowRight size={16} />
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
