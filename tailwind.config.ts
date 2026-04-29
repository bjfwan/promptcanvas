import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'Cambria', 'serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        paper: 'rgb(var(--color-paper) / <alpha-value>)',
        'paper-soft': 'rgb(var(--color-paper-soft) / <alpha-value>)',
        cream: 'rgb(var(--color-cream) / <alpha-value>)',
        vellum: 'rgb(var(--color-vellum) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--color-line-strong) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        forest: 'rgb(var(--color-forest) / <alpha-value>)',
        ochre: 'rgb(var(--color-ochre) / <alpha-value>)',
      },
      letterSpacing: {
        tightish: '0',
      },
      boxShadow: {
        'paper-1': 'var(--shadow-paper-1)',
        'paper-2': 'var(--shadow-paper-2)',
        'paper-3': 'var(--shadow-paper-3)',
        'inner-paper': 'var(--shadow-inner-paper)',
      },
      zIndex: {
        header: '40',
        dock: '45',
        sheet: '50',
        lightbox: '55',
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
