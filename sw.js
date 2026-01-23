const CACHE_NAME = 'yurika-online-v1.89-dev';
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
    // 1. Firebase & Google APIs -> Network Only
    if (event.request.url.includes('googleapis.com') || event.request.url.includes('firebase')) {
        return;
    }

    // 2. JS Files (Development Mode) -> Network First, Fallback to Cache
    // This ensures we always get the latest code during development
    if (event.request.url.includes('/src/js/')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Optional: Update cache with new version
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 3. Other Assets (Images, CSS) -> Cache First, Fallback to Network
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
