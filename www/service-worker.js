// VINOTE — Service Worker
// Cache-first strategy for the app shell so the note editor keeps working
// completely offline after the first successful load. Bump CACHE_NAME any
// time you change a cached file's content — that's what forces old clients
// to fetch the new version instead of serving a stale cached copy forever.
const CACHE_NAME = 'vinote-cache-v2';

// Local app-shell files. These are fetched and cached individually (not via
// cache.addAll) so that ONE missing/renamed file — e.g. an icon you haven't
// added yet — can't fail the entire install step and leave the app with no
// offline cache at all.
const APP_SHELL = [
    './index.html',
    './manifest.json',
    './css/styles.css',
    './js/storage.js',
    './js/undo-redo.js',
    './js/navigation.js',
    './js/bubble.js',
    './js/editor.js',
    './js/settings.js',
    './js/ui.js',
    './js/app.js',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// Third-party assets loaded from a CDN (Tailwind, Google Fonts). Caching
// these too means the app still renders with the right fonts/styling on a
// completely offline first-ever load IF this list ever gets a chance to run
// while online at least once. For the packaged Android APK, the GitHub
// Actions workflow instead bundles these locally and rewrites index.html to
// point at the local copies, so the APK never depends on this list at all.
const CDN_SHELL = [
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&family=Cinzel:wght@600;700;800&family=Dancing+Script:wght@500;700&family=Indie+Flower&display=swap'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            await Promise.all(
                [...APP_SHELL, ...CDN_SHELL].map((url) =>
                    cache.add(url).catch(() => {
                        // Missing icon, offline during install, CDN hiccup,
                        // etc. — skip it, don't fail the whole install.
                    })
                )
            );
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;

            return fetch(event.request)
                .then((response) => {
                    // Only cache same-origin, OK responses going forward so
                    // notes/data endpoints (if any get added later) and
                    // error pages never get stuck in the cache.
                    if (response && response.ok && event.request.url.startsWith(self.location.origin)) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => {
                    // Offline and not cached: for a navigation request, fall
                    // back to the cached app shell so the app still opens.
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                    return undefined;
                });
        })
    );
});
