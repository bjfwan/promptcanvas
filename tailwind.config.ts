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
        'paper-soft': '#ece2cf',
        cream: '#faf3e6',
        vellum: '#fdf8ed',
        muted: '#6c6357',
        line: '#dfd3bf',
        'line-strong': '#c8b89a',
        accent: '#9a3a1c',
        forest: '#5b7a4a',
        ochre: '#a06b1a',
      },
      letterSpacing: {
        tightish: '-0.011em',
      },
      boxShadow: {
        'paper-1': '0 1px 0 rgba(26, 22, 18, 0.04), 0 4px 12px -8px rgba(26, 22, 18, 0.16)',
        'paper-2': '0 1px 0 rgba(26, 22, 18, 0.06), 0 12px 24px -16px rgba(26, 22, 18, 0.20)',
        'paper-3':
          '0 1px 0 rgba(26, 22, 18, 0.06), 0 28px 56px -20px rgba(26, 22, 18, 0.32), 0 12px 24px -16px rgba(26, 22, 18, 0.18)',
        'inner-paper': 'inset 0 1px 0 rgba(255, 255, 255, 0.6), inset 0 -1px 0 rgba(26, 22, 18, 0.04)',
      },
      zIndex: {
        header: '40',
        dock: '45',
        sheet: '50',
        toast: '60',
      },
      animation: {
        breathe: 'breathe 2.4s ease-in-out infinite',
        'progress-sweep': 'progress-sweep 1.6s linear infinite',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { opacity: '0.45' },
          '50%': { opacity: '1' },
        },
        'progress-sweep': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
