import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Sparkles, ArrowRight } from 'lucide-react';
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
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden" style={{ background: '#f5f5f5' }}>
      <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full pointer-events-none"
           style={{ background: 'radial-gradient(circle, rgba(91,80,255,0.10) 0%, transparent 65%)', filter: 'blur(80px)' }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative z-10 text-center max-w-md w-full"
        style={{
          background: '#ffffff',
          border: '0.5px solid #e8e8f0',
          borderRadius: 16,
          boxShadow: 'rgba(91,80,255,0.08) 0px 8px 32px',
          padding: '40px',
        }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -15 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 18, delay: 0.1 }}
          className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
          style={{ background: '#ededff', border: '1px solid rgba(91,80,255,0.2)' }}
        >
          <CheckCircle2 size={22} style={{ color: '#5B50FF' }} />
        </motion.div>

        <div className="flex justify-center mb-4">
          <NovaMascot size={120} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.15 }}
          className="relative mb-6"
          style={{
            background: '#f5f5f5',
            border: '0.5px solid #e8e8f0',
            borderRadius: 14,
            padding: '10px 16px',
            maxWidth: 320,
            margin: '0 auto 24px',
          }}
        >
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#3d3660', lineHeight: 1.5 }}>{novaLine}</p>
          <div
            style={{
              position: 'absolute',
              top: -6,
              left: '50%',
              transform: 'translateX(-50%) rotate(45deg)',
              width: 12,
              height: 12,
              background: '#f5f5f5',
              borderLeft: '0.5px solid #e8e8f0',
              borderTop: '0.5px solid #e8e8f0',
            }}
          />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h1 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', color: '#0d0b1a', marginBottom: 8 }}>
            You're on {plan || 'your new plan'}!
          </h1>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, color: '#6b6490', marginBottom: 8 }}>
            Payment confirmed. Nova is ready to create.
          </p>
          {credits !== null && (
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#6b6490', marginBottom: 28 }}>
              <span style={{ color: '#5B50FF', fontWeight: 700 }}>{credits.toLocaleString()} credits</span> added to your account.
            </p>
          )}

          {fetchError && (
            <p style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 13,
              color: '#dc2626',
              background: 'rgba(220,38,38,0.06)',
              border: '1px solid rgba(220,38,38,0.2)',
              borderRadius: 8,
              padding: '8px 12px',
              marginBottom: 24,
            }}>
              We couldn't load your updated plan info —{' '}
              <a
                href="/pricing"
                style={{ color: '#dc2626', textDecoration: 'underline', cursor: 'pointer' }}
              >
                check your billing page
              </a>.
            </p>
          )}

          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-colors duration-200 cursor-pointer"
            style={{ background: '#5B50FF', boxShadow: 'rgba(91,80,255,0.25) 0px 8px 24px' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#6E63FF'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#5B50FF'; }}
          >
            <Sparkles size={16} /> Start creating <ArrowRight size={15} />
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
