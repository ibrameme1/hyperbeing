export default function Logo({ dark = false, height = 32 }) {
  const src = dark
    ? '/HyperBeing Logo - for BlackBG.svg'
    : '/HyperBeing Logo - for WhiteBG.svg';

  return (
    <img
      src={src}
      alt="HyperBeing"
      style={{ height, width: 'auto', display: 'block' }}
    />
  );
}
