import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import NovaMascotVideo from './NovaMascotVideo';

const PLANNING_MESSAGES = [
  'Nova is crafting your slide plan…',
  'Deciding the perfect narrative structure…',
  'Writing art direction for each slide…',
  'Choosing your visual style and palette…',
  'Almost ready to generate your slides…',
];

const GENERATING_MESSAGES = [
  'Generating your slide visuals…',
  'Good things take time…',
  'Rendering your presentation…',
  'Creating your slides…',
  'Bringing your vision to life…',
  'Almost there…',
];

function ShaderBackground() {
  const [mods, setMods] = useState({});
  useEffect(() => {
    import('@paper-design/shaders-react').then(mod => setMods(mod)).catch(() => {});
  }, []);
  const { MeshGradient, DotOrbit } = mods;

  if (!MeshGradient) {
    return (
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(135deg, #080808 0%, #0f0f0f 40%, #1a1540 70%, #5B50FF 100%)'
      }} />
    );
  }
  return (
    <>
      <MeshGradient
        className="absolute inset-0 w-full h-full"
        colors={['#080808', '#0a0818', '#1a1540', '#2d1f8f']}
        speed={0.3}
        backgroundColor="#080808"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      {DotOrbit && (
        <div className="absolute inset-0 opacity-20">
          <DotOrbit
            className="w-full h-full"
            dotColor="#5B50FF"
            orbitColor="#8B80FF"
            speed={0.6}
            intensity={0.8}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )}
    </>
  );
}

export default function LoadingScreen({ generatedSlides = [], totalSlides = 0 }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const isGenerating = totalSlides > 0;
  const messages = isGenerating ? GENERATING_MESSAGES : PLANNING_MESSAGES;
  const completedSlides = generatedSlides.filter(s => s.status === 'complete');
  const progress = totalSlides > 0 ? completedSlides.length / totalSlides : 0;

  useEffect(() => {
    setMsgIndex(0);
    const id = setInterval(() => setMsgIndex(i => (i + 1) % messages.length), 3200);
    return () => clearInterval(id);
  }, [isGenerating, messages.length]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      <ShaderBackground />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 flex flex-col items-center gap-6 px-6 text-center"
      >
        {/* Nova mascot */}
        <NovaMascotVideo size={160} />

        {/* Status label */}
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', letterSpacing: '0.20em', color: '#8B80FF', textTransform: 'uppercase' }}>
          {isGenerating ? 'Generating slides' : 'Planning deck'}
        </p>

        {/* Cycling message */}
        <div className="h-8 flex items-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={msgIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              style={{ color: '#f0f0ee', fontSize: '18px', fontWeight: 500 }}
            >
              {messages[msgIndex]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Slide count */}
        <p style={{ color: '#555555', fontSize: '13px' }}>
          {totalSlides > 0
            ? `${completedSlides.length} of ${totalSlides} slides ready`
            : 'Planning your presentation…'}
        </p>

        {/* Progress bar */}
        {totalSlides > 0 ? (
          <div className="w-64 h-px overflow-hidden" style={{ background: '#2a2a2a' }}>
            <motion.div
              className="h-full"
              style={{ background: 'linear-gradient(90deg, #5B50FF, #8B80FF)' }}
              animate={{ width: `${Math.max(progress * 100, 4)}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
        ) : (
          <div className="w-64 h-px overflow-hidden relative" style={{ background: '#1e1e1e' }}>
            <motion.div
              className="absolute inset-y-0 w-1/3"
              style={{ background: 'linear-gradient(90deg, transparent, #5B50FF, #8B80FF, transparent)' }}
              animate={{ x: ['-33%', '300%'] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.2 }}
            />
          </div>
        )}
      </motion.div>

      {/* Completed slide strip */}
      <AnimatePresence>
        {completedSlides.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-8 left-0 right-0 px-8"
          >
            <p className="text-center mb-3" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', letterSpacing: '0.20em', color: '#555555', textTransform: 'uppercase' }}>
              Slides ready
            </p>
            <div className="flex gap-3 overflow-x-auto pb-2 justify-center">
              {completedSlides.map(slide => (
                <motion.div
                  key={slide.index}
                  initial={{ opacity: 0, scale: 0.85, x: 16 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="flex-shrink-0 w-28 overflow-hidden"
                  style={{ aspectRatio: '16/9', borderRadius: '6px', border: '0.5px solid #1e1e1e' }}
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
