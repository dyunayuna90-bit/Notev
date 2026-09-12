// VINOTE — App bootstrap
// Wires up module init on load, hooks the Android hardware back button
// (when running inside the Capacitor native shell) into the SAME
// history/popstate flow NavigationModule already uses for its in-app
// back stack, and registers the offline service worker.

window.addEventListener('DOMContentLoaded', () => {
    SettingsModule.init();
    EditorModule.init();
    BubbleModule.init();
    UIModule.init();
    NavigationModule.init();
    CapacitorBackButtonModule.init();
    ServiceWorkerModule.init();
});

// --- MODULE 8: CAPACITOR HARDWARE BACK BUTTON ---
// Only does anything when actually running inside the native Android
// shell (window.Capacitor is injected automatically by the native runtime
// at build/run time — it's simply absent in a normal mobile/desktop
// browser, so this is a complete no-op for the plain PWA).
//
// Registering this listener is what Capacitor's own docs recommend: once
// you add a 'backButton' listener, YOU become responsible for deciding what
// back does (the automatic "goBack() or exit" behavior is no longer
// applied for you). We deliberately keep deciding as simple as possible by
// just deferring to window.history.back() when there's somewhere to go —
// that's exactly what re-fires NavigationModule's existing popstate
// handler, so every "close bubble / close settings / close editor" priority
// already written there keeps working unchanged. The only NEW behavior
// added here is a "tekan sekali lagi untuk keluar" (press back again to
// exit) confirmation once there's nowhere left to go back to, so a single
// stray back-press on the home list can't instantly kill the app.
const CapacitorBackButtonModule = {
    lastExitPromptAt: 0,
    EXIT_WINDOW_MS: 2000,

    init() {
        if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) {
            return;
        }

        const AppPlugin = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
        if (!AppPlugin) return;

        AppPlugin.addListener('backButton', ({ canGoBack }) => {
            if (canGoBack) {
                window.history.back();
                return;
            }

            const now = Date.now();
            if (now - this.lastExitPromptAt < this.EXIT_WINDOW_MS) {
                AppPlugin.exitApp();
                return;
            }

            this.lastExitPromptAt = now;
            UIModule.showToast('Tekan sekali lagi untuk keluar');
        });
    }
};

// --- MODULE 9: SERVICE WORKER (OFFLINE SUPPORT) ---
const ServiceWorkerModule = {
    init() {
        if (!('serviceWorker' in navigator)) return;
        // file:// pages (some plain WebViews) can't register a service
        // worker at all — guard so it fails silently instead of throwing.
        if (location.protocol === 'file:') return;

        window.addEventListener('load', () => {
            navigator.serviceWorker.register('service-worker.js').catch(() => {
                // Offline caching is a nice-to-have, not a hard requirement
                // for the app to function, so a registration failure (e.g.
                // unsupported host) is intentionally swallowed.
            });
        });
    }
};
