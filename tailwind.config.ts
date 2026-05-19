import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        serif: ['ui-serif', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'Menlo', 'monospace'],
      },
      colors: {
        // Earthy, agrarian palette — refined in SPEC-004
        soil: {
          50: '#faf7f2',
          100: '#f1ebdf',
          200: '#e0d4be',
          300: '#c8b393',
          400: '#a88e6a',
          500: '#8a7050',
          600: '#6e5840',
          700: '#574533',
          800: '#3f3225',
          900: '#2a2218',
        },
        moss: {
          50: '#f3f6ee',
          100: '#e3ebd6',
          200: '#c5d6a8',
          300: '#9fbb74',
          400: '#7ea34d',
          500: '#618534',
          600: '#4a6826',
          700: '#384f1d',
          800: '#293a16',
          900: '#1d290f',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
