// VINOTE — Tailwind CDN theme config.
// Must load AFTER the Tailwind CDN <script> tag (it extends the global
// `tailwind` object the CDN build creates), but BEFORE anything that reads
// vintage-* utility classes needs them generated, i.e. it belongs right
// after the CDN <script> tag in <head>, same spot the original inline
// version lived in.
tailwind.config = {
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
                // "office" palette — used by the Home (notes list) and
                // Settings screens (flat Office-Mobile style redesign).
                // Was previously only defined in tailwind_config (the
                // Node/CLI config used to pre-compile CSS for the APK
                // build), NOT here — so every bg-office-*/text-office-*/
                // border-office-* class silently failed to render (no
                // color at all) whenever the app was opened directly as a
                // PWA/in-browser instead of the packaged APK. Keep this
                // block in sync with the "office" block in tailwind_config
                // by hand whenever one changes.
                //
                // DARK MODE: every value now points at a CSS custom
                // property (defined under :root in css/styles.css)
                // instead of a literal hex color. Tailwind just emits e.g.
                // `background-color: var(--office-bg)` for `bg-office-bg`
                // — the actual color then comes from :root, which is now
                // the only palette this app ships (Mode Gelap toggle
                // removed) — so this class name is kept only so existing
                // markup across the app doesn't need touching.
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
