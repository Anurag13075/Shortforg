/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: {
          base: '#060608',
          card: '#0c0c10',
          subtle: '#111116',
          muted: '#18181f',
          border: 'rgba(255, 255, 255, 0.075)',
          'border-hover': 'rgba(255, 255, 255, 0.16)',
        },
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        accent: {
          red: '#f43f5e',
          gold: '#f59e0b',
          emerald: '#10b981',
          cyan: '#22d3ee',
          violet: '#a78bfa'
        }
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif'
        ],
        display: [
          '"Plus Jakarta Sans"',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif'
        ],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      boxShadow: {
        'glow-sm': '0 0 18px -4px rgba(139, 92, 246, 0.25)',
        'glow-md': '0 0 36px -6px rgba(99, 102, 241, 0.3)',
        'glow-red': '0 0 25px -4px rgba(244, 63, 94, 0.25)',
        'inner-light': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        'subtle-card': '0 12px 32px -12px rgba(0, 0, 0, 0.7), inset 0 1px 0 0 rgba(255, 255, 255, 0.06)'
      },
      animation: {
        'fade-in': 'fadeIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slideUp 0.38s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-left': 'slideLeft 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-subtle': 'pulseSubtle 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'aurora': 'auroraFlow 10s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        slideLeft: {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' }
        },
        auroraFlow: {
          '0%': { transform: 'translateX(-8%) scale(1)', opacity: '0.55' },
          '100%': { transform: 'translateX(8%) scale(1.08)', opacity: '0.85' }
        }
      }
    },
  },
  plugins: [],
}
