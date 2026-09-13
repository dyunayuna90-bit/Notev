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
                // "office" palette — used ONLY by the Home (notes list) and
                // Settings screens for the new flat, Microsoft-Office-Mobile
                // style redesign. Kept completely separate from vintage-*
                // (still brown/cream/orange, just flatter + more neutral)
                // so the editor/canvas — which still relies on vintage-* for
                // its own chrome (kebab menu, selection bubble) — is not
                // touched at all.
                office: {
                    bg: '#f1e7d8',       // page background, soft warm cream
                    surface: '#fffcf6',  // cards / rows / inputs
                    header: '#7a4a30',   // solid flat app-bar brown
                    headerDark: '#5f3a25',
                    accent: '#bb6a33',   // soft orange-brown accent
                    accentDark: '#9c5527',
                    text: '#3a2c22',     // body text
                    muted: '#8a7864',    // secondary text
                    border: '#ddcbb0',   // hairline borders/dividers
                    divider: '#e9dcc5'
                }
            }
        }
    }
};
