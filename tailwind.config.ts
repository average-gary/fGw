import type { Config } from 'tailwindcss';

/**
 * Compost Marketplace — design tokens.
 *
 * Palette rationale:
 *   - `soil`   — neutral spine of the app: backgrounds, body copy, borders.
 *                Warm browns rather than grey/black; reads as paper + dirt
 *                rather than as a generic AI-app neutral.
 *   - `moss`   — primary action / live-thing color. The chapter is alive,
 *                growing; CTAs, links, success live here.
 *   - `harvest`— accent for warmth, urgency, energy. Used sparingly:
 *                badges, highlights, "needs attention" states. A clay-rust
 *                that ties to manure / autumn / brick farmhouses.
 *   - `bloom`  — soft cream off-white. Cards on dark surfaces, "paper"
 *                feel without going pure white.
 *   - `dusk`   — cool counterweight. Used only for muted/disabled and the
 *                rare cool tone (geo, sky). Keeps the warm palette honest.
 *
 * Type rationale:
 *   - `serif: Fraunces` — variable display serif with optical sizing and a
 *     slight softness; carries character at headline sizes without
 *     looking like a generic Times/Georgia. Faith-rooted but not stuffy.
 *   - `sans: "IBM Plex Sans"` — humanist sans, slightly mechanical.
 *     Pairs with Fraunces and avoids the Inter / Roboto / system-stack
 *     "AI app" feel. Body copy + UI labels.
 *   - `mono: "IBM Plex Mono"` — same family, cohesive for tags / npubs.
 *
 * Shape & shadow:
 *   - `rounded-card` ~6px — modest, not pill-y. Avoids the rounded-2xl
 *     everywhere look.
 *   - `shadow-press` — soft 1-step inset/outset to give buttons a hint of
 *     embossed/3D feel rather than flat glass.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"IBM Plex Sans"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        serif: [
          '"Fraunces"',
          'ui-serif',
          'Georgia',
          'Cambria',
          'serif',
        ],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      colors: {
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
        harvest: {
          50: '#fbf2ea',
          100: '#f4dcc6',
          200: '#e9b88a',
          300: '#dc9259',
          400: '#cb7236',
          500: '#b35a23',
          600: '#92481c',
          700: '#723717',
          800: '#552912',
          900: '#3a1c0d',
        },
        bloom: {
          50: '#fffdf7',
          100: '#fbf6e8',
          200: '#f5ebcd',
          300: '#ecdcaa',
          400: '#dfc880',
          500: '#cdb05c',
        },
        dusk: {
          50: '#f1f3f4',
          100: '#dde2e3',
          200: '#bac3c6',
          300: '#94a1a5',
          400: '#6f7d82',
          500: '#536268',
          600: '#3f4c52',
          700: '#2f393e',
          800: '#222a2e',
          900: '#161c1f',
        },
      },
      borderRadius: {
        card: '6px',
        sheet: '14px 14px 0 0',
        pill: '999px',
      },
      boxShadow: {
        // Subtle paper-on-paper card lift.
        paper:
          '0 1px 0 0 rgba(63, 50, 37, 0.06), 0 1px 3px 0 rgba(63, 50, 37, 0.08)',
        // Buttons: tiny embossed feel, not flat glass.
        press:
          '0 1px 0 0 rgba(255,255,255,0.10) inset, 0 -1px 0 0 rgba(0,0,0,0.18) inset, 0 1px 2px 0 rgba(63, 50, 37, 0.15)',
        'press-sunken':
          '0 1px 0 0 rgba(0,0,0,0.18) inset, 0 -1px 0 0 rgba(255,255,255,0.06) inset',
        sheet:
          '0 -8px 24px -8px rgba(63, 50, 37, 0.25), 0 -2px 0 0 rgba(63, 50, 37, 0.06)',
        focus: '0 0 0 3px rgba(126, 163, 77, 0.35)',
      },
      spacing: {
        // 4-pt scale extras for tight mobile padding.
        '4.5': '1.125rem',
        '7.5': '1.875rem',
        '13': '3.25rem',
        '15': '3.75rem',
        // Touch-target floors.
        touch: '44px',
      },
      fontSize: {
        // Editorial-feeling display sizes for headlines.
        'display-sm': ['2rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display-md': ['2.5rem', { lineHeight: '1.02', letterSpacing: '-0.025em' }],
        'display-lg': ['3.25rem', { lineHeight: '0.98', letterSpacing: '-0.03em' }],
        eyebrow: ['0.75rem', { lineHeight: '1.1', letterSpacing: '0.14em' }],
      },
      letterSpacing: {
        eyebrow: '0.14em',
      },
      backgroundImage: {
        // SVG paper-grain noise — subtle texture for body backdrop.
        // Kept as a data-URL so no extra asset request.
        grain:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.247 0 0 0 0 0.196 0 0 0 0 0.145 0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      },
      keyframes: {
        'sheet-in': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'toast-in': {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'sheet-in': 'sheet-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'fade-in': 'fade-in 160ms ease-out',
        'toast-in': 'toast-in 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        spin: 'spin 0.8s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
