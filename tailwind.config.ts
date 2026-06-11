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
        action: 'rgb(var(--color-action) / <alpha-value>)',
        'action-strong': 'rgb(var(--color-action-strong) / <alpha-value>)',
        forest: 'rgb(var(--color-forest) / <alpha-value>)',
        ochre: 'rgb(var(--color-ochre) / <alpha-value>)',
        blueprint: 'rgb(var(--color-blueprint) / <alpha-value>)',
        sage: 'rgb(var(--color-sage) / <alpha-value>)',
        clay: 'rgb(var(--color-clay) / <alpha-value>)',
        ivory: 'rgb(var(--color-ivory) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-raised': 'rgb(var(--color-surface-raised) / <alpha-value>)',
        'surface-muted': 'rgb(var(--color-surface-muted) / <alpha-value>)',
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        glass: 'rgb(var(--color-glass) / <alpha-value>)',
        'glass-strong': 'rgb(var(--color-glass-strong) / <alpha-value>)',
      },
      letterSpacing: {
        tightish: '0',
      },
      boxShadow: {
        'paper-1': 'var(--shadow-paper-1)',
        'paper-2': 'var(--shadow-paper-2)',
        'paper-3': 'var(--shadow-paper-3)',
        'inner-paper': 'var(--shadow-inner-paper)',
        'glass': 'var(--shadow-glass)',
        'glass-hover': 'var(--shadow-glass-lg)',
        'glow': 'var(--shadow-glow-accent)',
      },
      zIndex: {
        header: '40',
        dock: '45',
        sheet: '50',
        lightbox: '55',
        toast: '60',
      },
      backdropBlur: {
        glass: '8px',
        'glass-heavy': '12px',
      },
      animation: {
        breathe: 'breathe 2.4s ease-in-out infinite',
        'progress-sweep': 'progress-sweep 1.6s linear infinite',
        'shimmer': 'shimmer 2.4s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
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
        shimmer: {
          '0%, 100%': { opacity: '0.5', transform: 'translateX(-2%)' },
          '50%': { opacity: '1', transform: 'translateX(2%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(0.98)' },
          '50%': { opacity: '0.8', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
