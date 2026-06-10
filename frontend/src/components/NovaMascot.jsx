import { motion } from 'framer-motion';

const MOOD_CONFIG = {
  idle:        { floatRange: 8,  floatDuration: 2.6, glow: 0.45, eyeScale: 1,    pupilOffset: 0 },
  excited:     { floatRange: 12, floatDuration: 1.6, glow: 0.7,  eyeScale: 1.08, pupilOffset: 0 },
  thinking:    { floatRange: 4,  floatDuration: 3.4, glow: 0.4,  eyeScale: 0.85, pupilOffset: 2 },
  calibrating: { floatRange: 6,  floatDuration: 1.8, glow: 0.85, eyeScale: 1.05, pupilOffset: 0 },
  celebrating: { floatRange: 14, floatDuration: 1.2, glow: 0.9,  eyeScale: 1.1,  pupilOffset: 0 },
};

/**
 * Nova — the HyperBeing mascot. Pure CSS/SVG + Framer Motion, no image assets.
 */
export default function NovaMascot({ mood = 'idle', size = 80 }) {
  const cfg = MOOD_CONFIG[mood] || MOOD_CONFIG.idle;
  const isCalibrating = mood === 'calibrating';
  const glowColor = isCalibrating ? 'rgba(0,240,255,0.65)' : 'rgba(139,92,246,0.6)';
  const eyeRingColor = isCalibrating ? 'rgba(0,240,255,0.9)' : 'rgba(196,181,253,0.95)';

  return (
    <motion.div
      style={{ position: 'relative', width: size * 1.6, height: size * 1.3 }}
      animate={{ y: [0, -cfg.floatRange, 0] }}
      transition={{ duration: cfg.floatDuration, repeat: Infinity, ease: 'easeInOut' }}
    >
      {/* Ambient glow */}
      <motion.div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
          filter: 'blur(24px)',
          zIndex: 0,
        }}
        animate={{ opacity: [cfg.glow * 0.6, cfg.glow, cfg.glow * 0.6], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: cfg.floatDuration * 1.3, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Calibration sparkles */}
      {isCalibrating && (
        <>
          {[0, 1, 2, 3].map(i => (
            <motion.div
              key={i}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: '#00F0FF',
                boxShadow: '0 0 8px #00F0FF',
                zIndex: 3,
              }}
              animate={{
                x: [0, Math.cos((i / 4) * Math.PI * 2) * size * 0.9],
                y: [0, Math.sin((i / 4) * Math.PI * 2) * size * 0.9],
                opacity: [1, 0],
                scale: [1, 0.3],
              }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.35, ease: 'easeOut' }}
            />
          ))}
        </>
      )}

      {/* Celebration confetti */}
      {mood === 'celebrating' && (
        <>
          {['#8B5CF6', '#00F0FF', '#C4B5FD', '#5B50FF', '#f0f0ee', '#8B80FF'].map((color, i) => (
            <motion.div
              key={i}
              style={{
                position: 'absolute',
                top: '30%',
                left: '50%',
                width: 6,
                height: 6,
                borderRadius: i % 2 === 0 ? '50%' : 2,
                background: color,
                zIndex: 3,
              }}
              animate={{
                x: [0, (Math.cos((i / 6) * Math.PI * 2) * size * 1.1)],
                y: [0, (Math.sin((i / 6) * Math.PI * 2) * size * 0.7) - 20, size * 0.6],
                opacity: [1, 1, 0],
                rotate: [0, 180],
              }}
              transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.15, ease: 'easeOut' }}
            />
          ))}
        </>
      )}

      {/* Body wrapper, centered */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
      }}>
        {/* Wings */}
        <motion.div
          style={{
            position: 'absolute',
            left: -size * 0.32,
            width: size * 0.55,
            height: size * 0.65,
            borderRadius: '50% 50% 50% 60% / 60% 60% 40% 40%',
            background: 'linear-gradient(135deg, #4C1D95 0%, #2e1065 100%)',
            transformOrigin: 'right center',
          }}
          animate={{ rotate: [-6, 4, -6] }}
          transition={{ duration: cfg.floatDuration, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          style={{
            position: 'absolute',
            right: -size * 0.38,
            width: size * 0.7,
            height: size * 0.5,
            borderRadius: '50% 50% 60% 50% / 50% 50% 50% 50%',
            background: 'linear-gradient(135deg, #5B21B6 0%, #312e81 100%)',
            transformOrigin: 'left center',
          }}
          animate={{ rotate: [6, -4, 6] }}
          transition={{ duration: cfg.floatDuration, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
        />

        {/* Main body */}
        <div
          style={{
            position: 'relative',
            width: size,
            height: size * 0.85,
            borderRadius: '50% 50% 48% 48% / 60% 60% 40% 40%',
            background: 'radial-gradient(circle at 38% 32%, #6D28D9 0%, #4C1D95 55%, #2e1065 100%)',
            boxShadow: `0 0 ${size * 0.5}px ${glowColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: size * 0.1,
          }}
        >
          {/* Eyes */}
          {[0, 1].map(i => (
            <motion.div
              key={i}
              style={{
                position: 'relative',
                width: size * 0.28,
                height: size * 0.28,
                borderRadius: '50%',
                background: '#0c0612',
                border: `${size * 0.045}px solid ${eyeRingColor}`,
                boxShadow: `0 0 ${size * 0.18}px ${eyeRingColor}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              animate={{ scaleY: [1, 1, 0.1, 1, 1], scale: cfg.eyeScale }}
              transition={{
                scaleY: { duration: 4, repeat: Infinity, times: [0, 0.92, 0.95, 0.98, 1], ease: 'easeInOut', repeatDelay: 1 },
                scale: { duration: 0.4 },
              }}
            >
              {/* Pupil highlight */}
              <div style={{
                position: 'absolute',
                top: '20%',
                left: i === 0 ? `${20 + cfg.pupilOffset}%` : `${20 - cfg.pupilOffset}%`,
                width: size * 0.08,
                height: size * 0.08,
                borderRadius: '50%',
                background: '#fff',
              }} />
            </motion.div>
          ))}

          {/* Smile */}
          <div style={{
            position: 'absolute',
            bottom: size * 0.16,
            left: '50%',
            transform: 'translateX(-50%)',
            width: size * 0.22,
            height: size * 0.11,
            borderBottom: `${size * 0.035}px solid rgba(196,181,253,0.5)`,
            borderRadius: '0 0 50% 50%',
          }} />

          {/* Underbelly glow */}
          <div style={{
            position: 'absolute',
            bottom: -size * 0.05,
            left: '15%',
            right: '15%',
            height: size * 0.25,
            background: `radial-gradient(ellipse, ${glowColor} 0%, transparent 75%)`,
            filter: 'blur(8px)',
            borderRadius: '50%',
          }} />
        </div>
      </div>
    </motion.div>
  );
}
