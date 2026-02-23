import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Emerald-based brand scale — used for accents, buttons, nav
        brand: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        // Dark forest palette — used for dark mode backgrounds/surfaces/borders
        forest: {
          DEFAULT: '#0F1F14',  // page background
          surface: '#1A2E1F',  // cards / nav
          mid:     '#243b29',  // inputs / elevated surfaces
          border:  '#2d4a35',  // borders / dividers
          border2: '#3a5c41',  // lighter borders
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
