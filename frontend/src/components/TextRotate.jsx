import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export default function TextRotate({
  texts = [],
  rotationInterval = 2200,
  mainClassName = '',
  splitLevelClassName = '',
  staggerDuration = 0.025,
  staggerFrom = 'last',
  initial = { y: '100%' },
  animate = { y: 0 },
  exit = { y: '-120%' },
  transition = { type: 'spring', damping: 30, stiffness: 400 },
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex(i => (i + 1) % texts.length), rotationInterval);
    return () => clearInterval(id);
  }, [texts.length, rotationInterval]);

  const word = texts[index] || '';
  const chars = word.split('');

  return (
    <span className={`inline-flex items-center ${mainClassName}`}>
      <AnimatePresence mode="wait">
        <motion.span key={index} className="inline-flex">
          {chars.map((char, i) => {
            const delay = staggerFrom === 'last'
              ? (chars.length - 1 - i) * staggerDuration
              : i * staggerDuration;
            return (
              <span key={i} className={`overflow-hidden inline-block ${splitLevelClassName}`}>
                <motion.span
                  className="inline-block"
                  initial={initial}
                  animate={animate}
                  exit={exit}
                  transition={{ ...transition, delay }}
                >
                  {char === ' ' ? ' ' : char}
                </motion.span>
              </span>
            );
          })}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
