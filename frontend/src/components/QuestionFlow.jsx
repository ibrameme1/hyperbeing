import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, Send } from 'lucide-react';
import { capture } from '../utils/posthog';

export default function QuestionFlow({ analysis, onComplete, onCancel }) {
  const { contextual_questions = [], detected_type = '' } = analysis;
  const allQuestions = contextual_questions;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [customText, setCustomText] = useState('');
  const [direction, setDirection] = useState(1);
  const customRef = useRef(null);

  useEffect(() => {
    if (allQuestions.length === 0) onComplete([]);
  }, []);

  // Reset selections when question changes
  useEffect(() => {
    setSelectedOptions([]);
    setCustomText('');
  }, [currentIndex]);

  const question = allQuestions[currentIndex];
  const isLast = currentIndex === allQuestions.length - 1;
  const total = allQuestions.length;

  const canProceed = selectedOptions.length > 0 || customText.trim().length > 0;

  function toggleOption(option) {
    setSelectedOptions(prev =>
      prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option]
    );
  }

  function buildAnswer() {
    const parts = [...selectedOptions];
    if (customText.trim()) parts.push(customText.trim());
    return parts.join(', ');
  }

  function handleNext() {
    if (!canProceed) return;
    const answer = buildAnswer();
    const newAnswers = [...answers, { question: question.question, answer }];
    capture('modal_question_answered', {
      question: question.question,
      answer,
      question_index: currentIndex,
      is_last: isLast,
      multi_selected: selectedOptions.length,
      used_custom: customText.trim().length > 0,
    });

    if (isLast) {
      onComplete(newAnswers);
    } else {
      setDirection(1);
      setAnswers(newAnswers);
      setCurrentIndex(i => i + 1);
    }
  }

  const variants = {
    enter: dir => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: dir => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        className="w-full max-w-lg overflow-hidden"
        style={{ background: '#141414', border: '0.5px solid #1e1e1e', borderRadius: 12 }}
      >
        {/* Header */}
        <div style={{ padding: '24px 24px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#5B50FF',
                }}
              >
                <Sparkles size={13} style={{ color: '#fff' }} />
              </div>
              <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 600, color: '#888888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {detected_type || 'Your presentation'}
              </span>
            </div>
            <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: '#555555' }}>
              {currentIndex + 1} of {total}
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 9999, overflow: 'hidden' }}>
            <motion.div
              style={{ height: '100%', background: '#5B50FF', borderRadius: 9999 }}
              animate={{ width: `${((currentIndex + 1) / total) * 100}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Question */}
        <div style={{ padding: '0 24px 8px', minHeight: 80, overflow: 'hidden' }}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.h2
              key={currentIndex}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              style={{ fontFamily: 'Playfair Display,Georgia,serif', color: '#f0f0ee', fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}
            >
              {question?.question}
            </motion.h2>
          </AnimatePresence>
          {question?.options?.length > 1 && (
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: '#888888', marginTop: 4 }}>Select one or more</p>
          )}
        </div>

        {/* Options + custom input */}
        <div style={{ padding: '0 24px 24px' }}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              {/* Option chips — multi-select */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {question?.options?.map(option => {
                  const isSelected = selectedOptions.includes(option);
                  return (
                    <motion.button
                      key={option}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => toggleOption(option)}
                      style={isSelected ? {
                        padding: '10px 16px',
                        borderRadius: 8,
                        fontFamily: 'Inter,sans-serif',
                        fontSize: 14,
                        fontWeight: 600,
                        border: '0.5px solid rgba(91,80,255,0.4)',
                        background: 'rgba(91,80,255,0.1)',
                        color: '#f0f0ee',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      } : {
                        padding: '10px 16px',
                        borderRadius: 8,
                        fontFamily: 'Inter,sans-serif',
                        fontSize: 14,
                        fontWeight: 600,
                        border: '0.5px solid #1e1e1e',
                        background: 'rgba(255,255,255,0.03)',
                        color: '#b8b8b8',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {isSelected && <span style={{ marginRight: 6, fontSize: 11 }}>✓</span>}
                      {option}
                    </motion.button>
                  );
                })}
              </div>

              {/* Custom text input */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#0f0f0f',
                  border: '0.5px solid #1e1e1e',
                  borderRadius: 6,
                  padding: '10px 14px',
                }}
              >
                <input
                  ref={customRef}
                  value={customText}
                  onChange={e => setCustomText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleNext(); }}
                  placeholder="Or type your own answer…"
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontFamily: 'Inter,sans-serif',
                    fontSize: 14,
                    color: '#f0f0ee',
                  }}
                />
                {customText.trim() && (
                  <button
                    onClick={handleNext}
                    style={{
                      width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', flexShrink: 0, background: '#5B50FF', border: 'none', cursor: 'pointer',
                    }}
                  >
                    <Send size={11} style={{ color: '#fff' }} />
                  </button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Next / Generate button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 }}>
            <button
              onClick={onCancel}
              style={{
                fontFamily: 'Inter,sans-serif',
                fontSize: 13,
                color: '#555555',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#888888'}
              onMouseLeave={e => e.currentTarget.style.color = '#555555'}
            >
              Cancel
            </button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleNext}
              disabled={!canProceed}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 20px',
                borderRadius: 6,
                fontFamily: 'Inter,sans-serif',
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                background: '#5B50FF',
                border: 'none',
                cursor: canProceed ? 'pointer' : 'not-allowed',
                opacity: canProceed ? 1 : 0.3,
                transition: 'opacity 0.2s',
              }}
            >
              {isLast ? 'Generate presentation' : 'Next'}
              <ArrowRight size={14} />
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
