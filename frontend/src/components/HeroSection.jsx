import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';

const TYPEWRITER_EMAIL = 'Enter Your Email Here For Early Access';
const TYPEWRITER_SUCCESS = 'You Will Receive Notifications By Email';

export default function HeroSection() {
  const [ctaState, setCtaState] = useState('button'); // 'button' | 'form'
  const [submitted, setSubmitted] = useState(false);
  const [placeholder, setPlaceholder] = useState('');
  const typewriterRef = useRef(null);
  const resetTimerRef = useRef(null);

  const startTypewriter = (text) => {
    clearInterval(typewriterRef.current);
    setPlaceholder('');
    let i = 0;
    typewriterRef.current = setInterval(() => {
      i++;
      setPlaceholder(text.slice(0, i));
      if (i >= text.length) clearInterval(typewriterRef.current);
    }, 60);
  };

  useEffect(() => {
    if (ctaState === 'form') {
      startTypewriter(TYPEWRITER_EMAIL);
    }
    return () => {
      clearInterval(typewriterRef.current);
    };
  }, [ctaState]);

  useEffect(() => {
    return () => {
      clearInterval(typewriterRef.current);
      clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleShowForm = () => {
    setSubmitted(false);
    setCtaState('form');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    startTypewriter(TYPEWRITER_SUCCESS);
    clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setCtaState('button');
      setSubmitted(false);
    }, 4000);
  };

  return (
    <section className="relative flex-1 flex flex-col items-center justify-center px-6">
      <div className="relative z-10 text-center max-w-5xl mx-auto flex flex-col items-center justify-center w-full gap-12">

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-white/80 text-[10px] md:text-[11px] font-medium tracking-[0.2em] uppercase mb-4"
        >
          BUILD A NO-CODE AI APP IN MINUTES
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          style={{ fontFamily: "'Instrument Serif', serif" }}
          className="text-4xl md:text-[64px] font-medium tracking-[-0.01em] leading-[1.1] mb-6 text-white max-w-4xl"
        >
          A new way to think and create{' '}
          <br className="hidden md:block" />
          with computers
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="min-h-[50px] mt-2"
        >
          <AnimatePresence mode="wait">
            {ctaState === 'button' ? (
              <motion.button
                key="cta-button"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={handleShowForm}
                className="px-10 py-3 text-[14px] font-medium border border-white/10 rounded-full hover:border-white/30 hover:bg-white/[0.02] transition-all duration-300 text-white/90 backdrop-blur-sm cursor-pointer"
              >
                Get early access
              </motion.button>
            ) : (
              <motion.form
                key="cta-form"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSubmit}
                className="flex items-center gap-2 pl-5 pr-1.5 py-1.5 text-[14px] font-medium border border-white/20 rounded-full bg-white/[0.02] backdrop-blur-sm w-full max-w-[320px] focus-within:border-white/40 transition-colors duration-300"
              >
                <label htmlFor="hero-email" className="sr-only">Your email address</label>
                <input
                  id="hero-email"
                  type="email"
                  placeholder={placeholder}
                  autoFocus
                  className="flex-1 bg-transparent text-white outline-none text-[14px] hero-email-input"
                />
                <button
                  type="submit"
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer flex-shrink-0"
                >
                  {submitted
                    ? <Check size={14} className="text-white" />
                    : <ArrowRight size={14} className="text-white" />
                  }
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <a
            href="#"
            className="text-white/80 hover:text-white/40 transition-colors duration-300 text-[13px] font-medium tracking-wide"
          >
            Play Video Demo
          </a>
        </motion.div>

      </div>
    </section>
  );
}
