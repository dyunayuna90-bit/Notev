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
                // DARK MODE: values point at CSS custom properties (see
                // :root in www/css/styles.css) instead of literal hex
                // colors — see the matching comment in
                // www/js/tailwind-config.js (the browser/CDN config) for
                // the full explanation. Keep the two files' "office" block
                // in sync by hand whenever one changes.
                office: {
                    bg: 'var(--office-bg)',
                    surface: 'var(--office-surface)',
                    header: 'var(--office-header)',
                    headerDark: 'var(--office-headerDark)',
                    accent: 'var(--office-accent)',
                    accentDark: 'var(--office-accentDark)',
                    text: 'var(--office-text)',
                    muted: 'var(--office-muted)',
                    border: 'var(--office-border)',
                    divider: 'var(--office-divider)'
                }
            }
        }
    }
};
