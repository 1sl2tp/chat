module.exports = {
  darkMode: 'class',
  content: ['./index.html', './admin/index.html', './src/**/*.{ts,html}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Plus Jakarta Sans', 'sans-serif'] },
      colors: {
        cw: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#1f93ff',
          600: '#187bcb',
          700: '#1260a3',
          900: '#0f3862',
          dark: '#0f172a',
          panel: '#1e293b',
          border: '#334155',
        },
      },
    },
  },
  plugins: [],
}
