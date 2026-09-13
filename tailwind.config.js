// VINOTE — Tailwind CLI config, used ONLY by the offline APK build step
// (`npx tailwindcss -c tailwind.config.js -i www/css/tailwind-input.css
// -o www/css/tailwind.compiled.css` in .github/workflows/build-apk.yml).
// This file is loaded by Node directly, so it MUST use CommonJS
// (`module.exports`) — unlike js/tailwind-config.js, which is loaded in
// the browser via the Tailwind CDN <script> and extends the global
// `tailwind` object instead. The two files are NOT interchangeable; keep
// their `colors` blocks in sync by hand whenever one changes.
module.exports = {
    content: [
        "./www/**/*.html",
        "./www/js/**/*.js"
    ],
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
                },
                // "office" palette — used ONLY by the Home (notes list) and
                // Settings screens for the flat, Microsoft-Office-Mobile
                // style redesign. Kept separate from vintage-* so the
                // editor/canvas (which still relies on vintage-* for its
                // own chrome — kebab menu, selection bubble) is untouched.
                office: {
                    bg: '#f1e7d8',
                    surface: '#fffcf6',
                    header: '#7a4a30',
                    headerDark: '#5f3a25',
                    accent: '#bb6a33',
                    accentDark: '#9c5527',
                    text: '#3a2c22',
                    muted: '#8a7864',
                    border: '#ddcbb0',
                    divider: '#e9dcc5'
                }
            }
        }
    }
};
