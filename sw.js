const CACHE_NAME = 'yurika-online-v0.28.1';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './version.txt',
    './src/css/style.css',
    './src/js/main.js',
    // Assets (Prioritize WebP)
    './src/assets/icon_192.webp',
    './src/assets/icon_512.webp',
    './src/assets/character.webp',
    './assets/resource/background.webp',
    './assets/resource/monster_slim/1.webp',
    './assets/resource/monster_slim/2.webp',
    './assets/resource/monster_slim/3.webp',
    './assets/resource/monster_slim/4.webp',
    './assets/resource/monster_slim/5.webp'
];

// Install Event: Cache Core Assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Pre-caching offline assets');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[ServiceWorker] Removing old cache', key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch Event: Strategies
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Firebase & Google APIs -> Network Only
    if (url.hostname.includes('googleapis.com') || url.hostname.includes('firebase')) {
        return;
    }

    // 2. index.html (Vital Root) -> Network First
    // This fixed the "Reverting to v0.26" bug by ensuring we check for the NEW index.html with version busting
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

    // 3. JS Files (Development Mode) -> Network First
    if (url.pathname.includes('/src/js/')) {
        event.respondWith(
            fetch(event.request)
                .then(response => response)
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 4. Other Assets (Images, CSS) -> Cache First
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
