/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Warmer palette — slight warm tint instead of dead gray
        'editor-bg': '#1a1b1e',
        'editor-sidebar': '#222327',
        'editor-tab': '#2a2b30',
        'editor-active': '#1a1b1e',
        'editor-border': '#38393f',
        'editor-text': '#d1d1d6',
        'editor-accent': '#5e9eff',
        'editor-hover': '#2e2f35',
        'editor-selection': '#5e9eff22',
        'terminal-bg': '#1a1b1e',
        'terminal-green': '#5bd882',
        'terminal-red': '#ff6b6b',
        'terminal-yellow': '#ffb347',
        'terminal-blue': '#5e9eff',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', 'Monaco', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.2s ease-out',
        'fade-in': 'fadeIn 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: 0 },
          '100%': { transform: 'translateX(0)', opacity: 1 },
        },
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
      boxShadow: {
        'glow': '0 0 20px -5px rgba(94, 158, 255, 0.15)',
        'glow-warm': '0 0 30px -8px rgba(255, 179, 71, 0.12), 0 0 60px -12px rgba(94, 158, 255, 0.08)',
        'inner-subtle': 'inset 0 1px 0 0 rgba(255,255,255,0.03)',
      },
    },
  },
  plugins: [],
};
