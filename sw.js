const CACHE_NAME = 'yurika-online-0.00.34';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './src/css/style.css',
    './src/js/main.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
    // v0.29.16: Force immediate activation
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            );
        })
    );
    // v0.29.16: Take control of all clients immediately
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip external requests
    if (url.hostname.includes('googleapis.com') || url.hostname.includes('firebase')) return;

    // version.txt - Always network only
    if (url.pathname.endsWith('version.txt')) {
        event.respondWith(fetch(event.request).catch(() => new Response('error')));
        return;
    }

    // v0.00.12+: ALL local files -> Network First for immediate updates
    // Cache is only used as fallback when offline
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Only cache successful standard responses
                if (response && response.status === 200 && response.type === 'basic') {
                    const cloned = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
                }
                return response;
            })
            .catch(err => {
                // console.error('[SW] Fetch failed:', err);
                return caches.match(event.request).then(cachedResponse => {
                    if (cachedResponse) return cachedResponse;

                    // Fallback if neither network nor cache works
                    return new Response('Asset Not Found (Offline)', {
                        status: 404,
                        statusText: 'Not Found',
                        headers: { 'Content-Type': 'text/plain' }
                    });
                });
            })
    );
});
