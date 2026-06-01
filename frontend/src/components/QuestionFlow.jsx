import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';

export default function QuestionFlow({ analysis, onComplete, onCancel }) {
  const { contextual_questions = [], detected_type = '' } = analysis;
  const allQuestions = contextual_questions;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [direction, setDirection] = useState(1);

  // If there are no questions, complete immediately
  useEffect(() => {
    if (allQuestions.length === 0) onComplete([]);
  }, []);

  const question = allQuestions[currentIndex];
  const isLast = currentIndex === allQuestions.length - 1;
  const total = allQuestions.length;

  const canProceed = !!selected;

  function handleSelect(option) {
    setSelected(option);
  }

  function handleNext() {
    if (!canProceed) return;
    const newAnswers = [...answers, { question: question.question, answer: selected }];

    if (isLast) {
      onComplete(newAnswers);
    } else {
      setDirection(1);
      setAnswers(newAnswers);
      setSelected(null);
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
        </div>

        {/* Options */}
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
              className="flex flex-wrap gap-2 mt-4"
            >
              {question?.options?.map(option => (
                <motion.button
                  key={option}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleSelect(option)}
                  className={`px-4 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all duration-150 ${
                    selected === option
                      ? 'border-transparent text-white'
                      : 'border-gray-200 text-gray-700 bg-gray-50 hover:border-gray-300 hover:bg-white'
                  }`}
                  style={selected === option ? { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderColor: 'transparent' } : {}}
                >
                  {option}
                </motion.button>
              ))}
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
