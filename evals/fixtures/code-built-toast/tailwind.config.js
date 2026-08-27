/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{css,xml,html,ts}'],
  darkMode: ['class', '.ns-dark'],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: '#FFFFFF', dark: '#161C26' },
        ink: { DEFAULT: '#111827', dark: '#F3F4F6' },
        accent: '#2563EB',
      },
    },
  },
  plugins: [],
  corePlugins: { preflight: false },
}
