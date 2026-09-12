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
                }
            }
        }
    }
};
