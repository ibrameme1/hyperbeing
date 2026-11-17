/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        uv: {
          DEFAULT: '#0297DE',
          hover: '#1AA6E8',
          soft: '#4CB8F0',
          pressed: '#0277B3',
          dim: 'rgba(2,151,222,0.12)',
        },
        // Brand palette: Midnight Black (primary), Electric Blue (secondary),
        // Cantaloupe Orange (accent). `uv` keeps its name so every existing
        // class follows the new palette; Cantaloupe is used sparingly, as
        // warm light, never as a large flat fill.
        midnight: '#02070A',
        electric: { DEFAULT: '#0297DE', hi: '#4CB8F0', ice: '#A9DDF7' },
        cantaloupe: { DEFAULT: '#FC734D', soft: '#FFB49C' },
        ember: '#FC734D',
        void: '#02070A',
        base: '#050D12',
        raised: '#08131A',
        'border-dark': '#0F1F28',
        'border-dark2': '#18292F',
        'canvas-light': '#f5f5f5',
        'card-light': '#ffffff',
        ink: '#02070A',
        'ink-2': '#2B3A44',
        'ink-3': '#5E717D',
        't-full': '#f0f0ee',
        't-high': '#b8b8b8',
        't-mid': '#888888',
        't-low': '#555555',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        badge: '4px',
        btn: '6px',
        card: '8px',
        modal: '12px',
        pill: '9999px',
      },
      boxShadow: {
        'uv': 'rgba(2,151,222,0.25) 0px 0px 24px 0px',
        'uv-sm': 'rgba(2,151,222,0.15) 0px 0px 12px 0px',
        'card-light': 'rgba(2,151,222,0.06) 0px 4px 16px 0px',
      },
      keyframes: {
        fadeIn:    { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp:   { '0%': { opacity: '0', transform: 'translateY(24px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        shimmer:   { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        float:     { '0%, 100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-8px)' } },
        blink:     { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.2' } },
      },
      animation: {
        fadeIn:   'fadeIn 0.3s ease-out',
        slideUp:  'slideUp 0.4s cubic-bezier(0.16,1,0.3,1)',
        shimmer:  'shimmer 2s linear infinite',
        float:    'float 3s ease-in-out infinite',
        blink:    'blink 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
