export default function Logo({ dark = false, height = 32 }) {
  const fontSize = height;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        fontFamily: "'Geist', 'Arial Black', sans-serif",
        fontSize,
        fontWeight: 900,
        lineHeight: 1,
        letterSpacing: '-0.03em',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          color: dark ? 'rgba(255,255,255,0.42)' : '#18132E',
        }}
      >
        Hyper
      </span>
      <span
        style={{
          background: dark
            ? 'linear-gradient(90deg, #8B5CF6 0%, #3B82F6 50%, #00D0FF 100%)'
            : 'linear-gradient(90deg, #6B21D4 0%, #3B5BDB 50%, #00D0FF 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        Being
      </span>
    </span>
  );
}
