/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      colors: {
        cineo: {
          bg: '#0a0a0a',
          panel: '#141414',
          surface: '#1e1e1e',
          border: '#2a2a2a',
          accent: '#8b5cf6',
          'accent-hover': '#7c3aed',
          'accent-dim': '#4c1d95',
          text: '#e5e5e5',
          muted: '#6b7280',
          clip: {
            video: '#3b82f6',
            audio: '#10b981',
            image: '#f59e0b'
          }
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    }
  },
  plugins: []
}
