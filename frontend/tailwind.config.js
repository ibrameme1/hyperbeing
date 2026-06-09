/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        uv: {
          DEFAULT: '#5B50FF',
          hover: '#6E63FF',
          soft: '#8B80FF',
          pressed: '#3B2FFF',
          dim: 'rgba(91,80,255,0.12)',
        },
        void: '#080808',
        base: '#0f0f0f',
        raised: '#141414',
        'border-dark': '#1e1e1e',
        'border-dark2': '#2a2a2a',
        'canvas-light': '#f5f5f5',
        'card-light': '#ffffff',
        ink: '#0d0b1a',
        'ink-2': '#3d3660',
        'ink-3': '#6b6490',
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
        'uv': 'rgba(91,80,255,0.25) 0px 0px 24px 0px',
        'uv-sm': 'rgba(91,80,255,0.15) 0px 0px 12px 0px',
        'card-light': 'rgba(91,80,255,0.06) 0px 4px 16px 0px',
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
