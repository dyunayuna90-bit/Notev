/** @type {import('tailwindcss').Config} */
// Used only by the GitHub Actions Android build to precompile a static,
// offline Tailwind stylesheet (see .github/workflows/build-apk.yml). The
// plain PWA/browser version of the app keeps using the Tailwind CDN script
// directly and never touches this file.
module.exports = {
  content: ['./www/index.html', './www/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        vintage: {
          base: '#f4ebd0',
          card: '#e8dbb8',
          dark: '#2c221e',
          paper: '#fcf8ec',
          ink: '#1e1b18',
          accent: '#8c3a2b',
          border: '#b8a686',
          muted: '#6b5e52'
        }
      }
    }
  },
  plugins: []
};
