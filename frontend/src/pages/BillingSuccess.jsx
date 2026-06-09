import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function BillingSuccess() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [credits, setCredits] = useState(null);

  useEffect(() => {
    api.get('/billing/subscription')
      .then(r => {
        setPlan(r.data.plan?.name);
        setCredits(r.data.subscription?.credits_remaining);
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ position: 'fixed', top: '30%', left: '50%', transform: 'translateX(-50%)', width: 400, height: 400, background: 'radial-gradient(circle, rgba(91,80,255,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ maxWidth: 420, width: '100%', textAlign: 'center', position: 'relative', zIndex: 1 }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
          style={{ margin: '0 auto 32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{
            width: 72, height: 72, background: '#5B50FF',
            clipPath: 'polygon(0 0, 100% 0, 100% 78%, 78% 100%, 0 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'rgba(91,80,255,0.5) 0px 0px 48px',
          }}>
            <Check size={32} color="#fff" strokeWidth={2.5} />
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h1 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 36, fontWeight: 400, color: '#f0f0ee', marginBottom: 12, letterSpacing: '-0.02em' }}>
            You're on <em>{plan || 'your new plan'}</em>.
          </h1>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, color: '#888888', marginBottom: 8 }}>
            Payment confirmed. Nova is ready to create.
          </p>
          {credits !== null && (
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#8B80FF', letterSpacing: '0.1em', marginBottom: 40 }}>
              {(credits * 10).toLocaleString()} credits available
            </p>
          )}

          <button
            onClick={() => navigate('/dashboard')}
            style={{
              width: '100%', padding: '13px 24px',
              fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: '#fff',
              background: '#5B50FF', border: 'none', borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: 'rgba(91,80,255,0.3) 0px 4px 20px', transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#6E63FF'}
            onMouseLeave={e => e.currentTarget.style.background = '#5B50FF'}
          >
            Start creating <ArrowRight size={15} />
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
