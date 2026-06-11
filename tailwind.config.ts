import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#05060d',
          panel: '#0a0e1f',
          elevated: '#10172e',
          border: '#1c2548',
        },
        accent: {
          cyan: '#4ecbff',
          blue: '#3b82f6',
          deep: '#1e3a8a',
          purple: '#a855f7',
          gold: '#ffd166',
          red: '#ef4444',
          green: '#10b981',
        },
        mana: '#3b82f6',
        essence: '#a855f7',
        rank: {
          E: '#9ca3af',
          D: '#10b981',
          C: '#3b82f6',
          B: '#8b5cf6',
          A: '#ec4899',
          S: '#f59e0b',
          National: '#ef4444',
          Monarch: '#7c3aed',
        },
      },
      fontFamily: {
        display: ['Rajdhani', 'system-ui', 'sans-serif'],
        sys: ['"Share Tech Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(78, 203, 255, 0.35), inset 0 0 16px rgba(78, 203, 255, 0.08)',
        'glow-soft': '0 0 12px rgba(78, 203, 255, 0.25)',
        'glow-purple': '0 0 24px rgba(168, 85, 247, 0.45)',
        'glow-gold': '0 0 24px rgba(255, 209, 102, 0.5)',
        'glow-red': '0 0 24px rgba(239, 68, 68, 0.45)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 18px rgba(78, 203, 255, 0.4)' },
          '50%': { boxShadow: '0 0 36px rgba(78, 203, 255, 0.8)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.75' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        scan: 'scan 3s linear infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        flicker: 'flicker 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
export default config;
