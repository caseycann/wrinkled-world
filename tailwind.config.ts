import type { Config } from 'tailwindcss'

// "Market Board" style: a dark financial-board look. Colors are CSS variables
// defined in app/globals.css so every screen shares one palette.
const v = (name: string) => `var(--ww-${name})`

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ww: {
          bg: v('bg'),            // page background
          panel: v('panel'),      // cards and panels
          cell: v('cell'),        // token squares, inputs
          line: v('line'),        // borders
          'line-soft': v('line-soft'),
          text: v('text'),        // main text
          soft: v('soft'),        // secondary text
          amber: v('amber'),      // accent: letters, timer, main buttons
          'amber-hover': v('amber-hover'),
          alert: v('alert'),      // warnings and errors
          ok: v('ok'),            // confirmations
          // Token colors. Military red, Health white (with outline), Education blue,
          // Standard of Living green. Same lightness and strength; only the hue changes.
          mil: v('mil'), 'mil-lt': v('mil-lt'),
          hea: v('hea'), 'hea-lt': v('hea-lt'), 'hea-outline': v('hea-outline'),
          edu: v('edu'), 'edu-lt': v('edu-lt'),
          sol: v('sol'), 'sol-lt': v('sol-lt'),
        },
      },
      fontFamily: {
        sans: ['var(--font-plex-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
