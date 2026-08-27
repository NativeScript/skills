/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{css,xml,html,ts}'],
  darkMode: ['class', '.ns-dark'],
  theme: {
    extend: {
      colors: {
        accent: '#2563EB',
      },
    },
  },
  plugins: [],
  corePlugins: { preflight: false },
}
