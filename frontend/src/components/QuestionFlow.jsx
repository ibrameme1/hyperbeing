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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                   style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                <Sparkles size={13} className="text-white" />
              </div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                {detected_type || 'Your presentation'}
              </span>
            </div>
            <span className="text-xs font-semibold text-gray-400">
              {currentIndex + 1} of {total}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)' }}
              animate={{ width: `${((currentIndex + 1) / total) * 100}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Question */}
        <div className="px-6 pb-2 min-h-[80px] overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.h2
              key={currentIndex}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="text-gray-900 font-bold text-lg leading-snug"
            >
              {question?.question}
            </motion.h2>
          </AnimatePresence>
          {question?.options?.length > 1 && (
            <p className="text-xs text-gray-400 mt-1">Select one or more</p>
          )}
        </div>

        {/* Options + custom input */}
        <div className="px-6 pb-6">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="mt-3 space-y-3"
            >
              {/* Option chips — multi-select */}
              <div className="flex flex-wrap gap-2">
                {question?.options?.map(option => {
                  const isSelected = selectedOptions.includes(option);
                  return (
                    <motion.button
                      key={option}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => toggleOption(option)}
                      className={`px-4 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all duration-150 ${
                        isSelected
                          ? 'border-transparent text-white'
                          : 'border-gray-200 text-gray-700 bg-gray-50 hover:border-gray-300 hover:bg-white'
                      }`}
                      style={isSelected ? { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderColor: 'transparent' } : {}}
                    >
                      {isSelected && <span className="mr-1.5 text-xs">✓</span>}
                      {option}
                    </motion.button>
                  );
                })}
              </div>

              {/* Custom text input */}
              <div className="flex items-center gap-2 rounded-2xl border-2 border-gray-200 bg-gray-50 px-3.5 py-2.5 transition-all focus-within:border-purple-400 focus-within:bg-white">
                <input
                  ref={customRef}
                  value={customText}
                  onChange={e => setCustomText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleNext(); }}
                  placeholder="Or type your own answer…"
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none"
                />
                {customText.trim() && (
                  <button
                    onClick={handleNext}
                    className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
                  >
                    <Send size={11} className="text-white" />
                  </button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Next / Generate button */}
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={onCancel}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Cancel
            </button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleNext}
              disabled={!canProceed}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold text-white transition-all disabled:opacity-30"
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
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
