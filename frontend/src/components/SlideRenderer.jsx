export default function SlideRenderer({ slide, className = '' }) {
  if (!slide) return null;

  return (
    <div
      className={`relative w-full aspect-[16/9] overflow-hidden ${className}`}
      style={{ background: '#1a1a2e' }}
    >
      {/* Skeleton always underneath — visible while image is absent or loading */}
      <div className="absolute inset-0 skeleton" />

      {slide.image_data && (
        <img
          key={slide.image_data}
          src={slide.image_data}
          alt=""
          className="absolute inset-0 w-full h-full object-cover animate-fadeIn"
        />
      )}
    </div>
  );
}
