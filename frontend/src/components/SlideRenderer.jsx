import { motion } from 'framer-motion';

const OVERLAYS = {
  cover: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0) 100%)',
  section: 'linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 100%)',
  content: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.35) 100%)',
  quote: 'linear-gradient(135deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.4) 100%)',
  data: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.45) 100%)',
  image: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.6) 80%)',
  conclusion: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0) 100%)',
};

function CoverContent({ slide }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12">
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-white font-bold leading-tight tracking-tight"
        style={{ fontSize: 'clamp(1.75rem, 4vw, 3.5rem)', textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}
      >
        {slide.title}
      </motion.h1>
      {slide.subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-white/80 mt-3 font-medium"
          style={{ fontSize: 'clamp(1rem, 2vw, 1.5rem)' }}
        >
          {slide.subtitle}
        </motion.p>
      )}
    </div>
  );
}

function ContentSlide({ slide }) {
  const points = slide.key_points || [];
  return (
    <div className="absolute inset-0 flex flex-col justify-start p-8 md:p-12 pt-10 md:pt-14">
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="text-white font-bold leading-tight tracking-tight mb-5"
        style={{ fontSize: 'clamp(1.25rem, 2.8vw, 2.5rem)', textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
      >
        {slide.title}
      </motion.h2>
      <ul className="space-y-2.5">
        {points.map((pt, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.07 }}
            className="flex items-start gap-3 text-white/90"
            style={{ fontSize: 'clamp(0.8rem, 1.6vw, 1.2rem)' }}
          >
            <span className="w-2 h-2 rounded-full bg-ios-blue mt-[0.35em] flex-shrink-0" />
            {pt}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function QuoteContent({ slide }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center p-8 md:p-16">
      <motion.p
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-white font-semibold leading-snug italic"
        style={{ fontSize: 'clamp(1.1rem, 2.4vw, 2.2rem)', textShadow: '0 2px 10px rgba(0,0,0,0.4)' }}
      >
        &ldquo;{slide.title}&rdquo;
      </motion.p>
      {slide.subtitle && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-white/65 mt-4 font-medium"
          style={{ fontSize: 'clamp(0.8rem, 1.4vw, 1.1rem)' }}
        >
          — {slide.subtitle}
        </motion.p>
      )}
    </div>
  );
}

function ConclusionContent({ slide }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-end p-8 md:p-12 text-center">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-white font-bold leading-tight"
        style={{ fontSize: 'clamp(1.5rem, 3.5vw, 3rem)', textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}
      >
        {slide.title}
      </motion.h2>
      {slide.subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-white/75 mt-3"
          style={{ fontSize: 'clamp(0.9rem, 1.8vw, 1.4rem)' }}
        >
          {slide.subtitle}
        </motion.p>
      )}
    </div>
  );
}

export default function SlideRenderer({ slide, className = '' }) {
  if (!slide) return null;

  const overlay = OVERLAYS[slide.type] || OVERLAYS.content;

  const ContentMap = {
    cover: CoverContent,
    section: CoverContent,
    conclusion: ConclusionContent,
    quote: QuoteContent,
    image: CoverContent,
  };

  const ContentComponent = ContentMap[slide.type] || ContentSlide;

  return (
    <div
      className={`relative w-full aspect-[16/9] overflow-hidden ${className}`}
      style={{ background: '#1a1a2e' }}
    >
      {/* Background image */}
      {slide.image_data ? (
        <img
          src={slide.image_data}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 skeleton" />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0" style={{ background: overlay }} />

      {/* Slide index badge */}
      <div className="absolute top-3 left-3 w-7 h-7 rounded-xl bg-black/30 backdrop-blur-sm flex items-center justify-center">
        <span className="text-white/70 text-xs font-semibold">{slide.index + 1}</span>
      </div>

      {/* Content */}
      <ContentComponent slide={slide} />
    </div>
  );
}
