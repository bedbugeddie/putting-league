import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand scale — driven by CSS variables so the Throw Pink theme can
        // swap the whole palette by changing the vars on <html>.
        brand: {
          50:  'var(--brand-50)',
          100: 'var(--brand-100)',
          200: 'var(--brand-200)',
          300: 'var(--brand-300)',
          400: 'var(--brand-400)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
          700: 'var(--brand-700)',
          800: 'var(--brand-800)',
          900: 'var(--brand-900)',
          950: 'var(--brand-950)',
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
  plugins: [typography],
} satisfies Config
