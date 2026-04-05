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
        'editor-bg': '#1e1e1e',
        'editor-sidebar': '#252526',
        'editor-tab': '#2d2d2d',
        'editor-active': '#1e1e1e',
        'editor-border': '#3e3e42',
        'editor-text': '#cccccc',
        'editor-accent': '#007acc',
        'editor-hover': '#2a2d2e',
        'editor-selection': '#264f78',
        'terminal-bg': '#1a1b26',
        'terminal-green': '#9ece6a',
        'terminal-red': '#f7768e',
        'terminal-yellow': '#e0af68',
        'terminal-blue': '#7aa2f7',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', 'Monaco', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.2s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: 0 },
          '100%': { transform: 'translateX(0)', opacity: 1 },
        },
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
      },
    },
  },
  plugins: [],
};
