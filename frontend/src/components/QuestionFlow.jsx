import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';

const SLIDE_COUNT_QUESTION = {
  question: 'How many slides do you want?',
  options: ['5 slides', '8 slides', '10 slides', '12 slides', '15 slides', 'Custom'],
  isSlideCount: true,
};

export default function QuestionFlow({ analysis, onComplete, onCancel }) {
  const { contextual_questions = [], detected_type = '', suggested_slide_count = 8 } = analysis;
  const allQuestions = [...contextual_questions, SLIDE_COUNT_QUESTION];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [customCount, setCustomCount] = useState('');
  const [direction, setDirection] = useState(1);
  const customInputRef = useRef(null);

  const question = allQuestions[currentIndex];
  const isSlideCountStep = question?.isSlideCount;
  const isCustomSelected = selected === 'Custom';
  const isLast = currentIndex === allQuestions.length - 1;
  const total = allQuestions.length;

  useEffect(() => {
    if (isCustomSelected) customInputRef.current?.focus();
  }, [isCustomSelected]);

  function handleSelect(option) {
    setSelected(option);
    if (option !== 'Custom') setCustomCount('');
  }

  const canProceed = selected && (selected !== 'Custom' || (customCount !== '' && parseInt(customCount) >= 1 && parseInt(customCount) <= 50));

  function handleNext() {
    if (!canProceed) return;
    const answer = isCustomSelected ? `${parseInt(customCount)} slides` : selected;
    const newAnswers = [...answers, { question: question.question, answer }];

    if (isLast) {
      const slideCountStr = newAnswers.find(a => a.question === SLIDE_COUNT_QUESTION.question)?.answer || '';
      const slideCount = parseInt(slideCountStr) || suggested_slide_count;
      onComplete(newAnswers, slideCount);
    } else {
      setDirection(1);
      setAnswers(newAnswers);
      setSelected(null);
      setCustomCount('');
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

              <AnimatePresence>
                {isSlideCountStep && isCustomSelected && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="w-full overflow-hidden"
                  >
                    <div className="flex items-center gap-3 bg-gray-50 border-2 border-purple-300 rounded-2xl px-4 py-3">
                      <input
                        ref={customInputRef}
                        type="number"
                        min="1"
                        max="50"
                        value={customCount}
                        onChange={e => setCustomCount(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleNext()}
                        placeholder="Enter a number (1–50)"
                        className="flex-1 bg-transparent text-sm font-semibold text-gray-800 placeholder:text-gray-400 outline-none"
                      />
                      <span className="text-xs text-gray-400 font-medium flex-shrink-0">slides</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
