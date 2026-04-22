import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const STAGES = [
  'Understanding your brief…',
  'Planning the narrative…',
  'Designing slide structure…',
  'Crafting image prompts…',
  'Generating visuals…',
  'Putting it all together…',
];

export default function LoadingScreen({ generatedSlides = [], totalSlides = 0, currentStage = 0 }) {
  const progress = totalSlides > 0 ? (generatedSlides.length / totalSlides) : 0;
  const stageText = STAGES[Math.min(currentStage, STAGES.length - 1)];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
         style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}>

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 rounded-full opacity-20 animate-float"
             style={{ background: 'radial-gradient(circle, #7b61ff 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/3 right-1/3 w-80 h-80 rounded-full opacity-15 animate-float"
             style={{ background: 'radial-gradient(circle, #00b4ff 0%, transparent 70%)', animationDelay: '2s' }} />
      </div>

      {/* Spinner & stage text */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-6 z-10"
      >
        {/* Pulsing logo */}
        <div className="relative">
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 rounded-3xl blur-xl"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          />
          <div className="relative w-20 h-20 rounded-3xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <Sparkles size={36} className="text-white" />
          </div>
        </div>

        <div className="text-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={stageText}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="text-white text-lg font-semibold"
            >
              {stageText}
            </motion.p>
          </AnimatePresence>

          {totalSlides > 0 && (
            <p className="text-white/50 text-sm mt-1">
              {generatedSlides.length} of {totalSlides} slides ready
            </p>
          )}
        </div>

        {/* Progress bar */}
        {totalSlides > 0 && (
          <div className="w-64 h-1.5 rounded-full overflow-hidden"
               style={{ background: 'rgba(255,255,255,0.15)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)' }}
              animate={{ width: `${Math.max(progress * 100, 8)}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        )}
      </motion.div>

      {/* Slide preview strip */}
      <AnimatePresence>
        {generatedSlides.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-8 left-0 right-0 px-8"
          >
            <p className="text-white/40 text-xs text-center mb-3 uppercase tracking-widest font-medium">
              Slides ready
            </p>
            <div className="flex gap-3 overflow-x-auto pb-2 justify-center">
              {generatedSlides.map(slide => (
                <motion.div
                  key={slide.index}
                  initial={{ opacity: 0, scale: 0.8, x: 20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="flex-shrink-0 w-32 aspect-[16/9] rounded-xl overflow-hidden shadow-ios-lg border border-white/10"
                >
                  {slide.image_data ? (
                    <img src={slide.image_data} alt={slide.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full skeleton" />
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
