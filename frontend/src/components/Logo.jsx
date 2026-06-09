export default function Logo({ dark = false, height = 32 }) {
  const iconSize = Math.round(height * 0.75);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' }}>
      <div style={{
        width: iconSize, height: iconSize,
        background: '#5B50FF',
        borderRadius: Math.round(iconSize * 0.22),
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <span style={{
          fontFamily: 'Inter, Arial, sans-serif', fontWeight: 900, color: '#ffffff',
          fontSize: Math.round(iconSize * 0.46), letterSpacing: '-0.1em',
          display: 'block', lineHeight: 1, paddingRight: '0.1em',
        }}>HB</span>
      </div>
      <span style={{
        fontFamily: 'Inter, sans-serif', fontWeight: 700,
        fontSize: Math.round(height * 0.38),
        color: dark ? '#f0f0ee' : '#0d0b1a',
        letterSpacing: '-0.03em', lineHeight: 1,
      }}>HyperBeing</span>
    </div>
  );
}
