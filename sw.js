const CACHE_NAME = 'yurika-online-v0.28.2';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    // version.txt is EXCLUDED to force network check always
    './src/css/style.css',
    './src/js/main.js',
    // ... (rest of assets)
];

// ... (install/activate events remain same, but update CACHE_NAME)

// Fetch Event: Strategies
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Firebase & Google APIs -> Network Only
    if (url.hostname.includes('googleapis.com') || url.hostname.includes('firebase')) {
        return;
    }

    // 2. version.txt (Cache Buster) -> Network Only (Crucial!)
    if (url.pathname.endsWith('version.txt')) {
        event.respondWith(fetch(event.request).catch(() => new Response('error')));
        return;
    }

    // 3. index.html (Vital Root) -> Network First with immediate cache update
    if (url.pathname.endsWith('index.html') || url.pathname === '/') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const cloned = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 4. JS Files -> Network First
    if (url.pathname.includes('/src/js/')) {
        event.respondWith(
            fetch(event.request)
                .then(response => response)
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 5. Other Assets (Images, CSS) -> Cache First
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
