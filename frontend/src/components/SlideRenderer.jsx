export default function SlideRenderer({ slide, className = '' }) {
  if (!slide) return null;

  return (
    <div
      className={`relative w-full aspect-[16/9] overflow-hidden ${className}`}
      style={{ background: '#1a1a2e' }}
    >
      {slide.image_data ? (
        <img
          src={slide.image_data}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 skeleton" />
      )}
    </div>
  );
}
