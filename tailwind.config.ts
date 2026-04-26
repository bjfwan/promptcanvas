import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'Cambria', 'serif'],
        sans: ['"Inter Tight"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: '#1a1612',
        paper: '#f1e9dc',
        cream: '#faf3e6',
        muted: '#6c6357',
        line: '#dfd3bf',
        accent: '#9a3a1c',
      },
      letterSpacing: {
        tightish: '-0.011em',
      },
    },
  },
  plugins: [],
} satisfies Config
