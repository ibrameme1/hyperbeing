import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Sparkles, ArrowRight } from 'lucide-react';
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
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#0A0812' }}>
      <div className="fixed top-1/4 left-1/4 w-[600px] h-[600px] rounded-full pointer-events-none"
           style={{ background: 'radial-gradient(circle, rgba(123,94,255,0.2) 0%, transparent 65%)', filter: 'blur(80px)' }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 text-center max-w-md w-full"
      >
        <motion.div
          initial={{ scale: 0, rotate: -15 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 18, delay: 0.1 }}
          className="w-24 h-24 rounded-3xl mx-auto mb-8 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #7B5EFF 0%, #FF4B8C 100%)', boxShadow: '0 0 60px rgba(123,94,255,0.5)' }}
        >
          <CheckCircle2 size={42} className="text-white" />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h1 className="text-3xl font-bold text-white mb-3">You're on {plan || 'your new plan'}!</h1>
          <p className="text-white/50 mb-2">Payment confirmed. Nova is ready to create.</p>
          {credits !== null && (
            <p className="text-white/35 text-sm mb-8">
              <span style={{ color: '#A08BFF', fontWeight: 600 }}>{credits} credits</span> added to your account.
            </p>
          )}

          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #7B5EFF 0%, #FF4B8C 100%)', boxShadow: '0 4px 24px rgba(123,94,255,0.35)' }}
          >
            <Sparkles size={16} /> Start creating <ArrowRight size={15} />
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
