const CACHE_NAME = 'yurika-online-v0.28.8';

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
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.hostname.includes('googleapis.com') || url.hostname.includes('firebase')) return;

    if (url.pathname.endsWith('version.txt')) {
        event.respondWith(fetch(event.request).catch(() => new Response('error')));
        return;
    }

    // index.html -> Network First
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

    // JS Files -> Stale-While-Revalidate (v0.28.5 Optimization)
    // This stops the constant 304 requests by serving from cache immediately
    if (url.pathname.includes('/src/js/')) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((cachedResponse) => {
                    const fetchedResponse = fetch(event.request).then((networkResponse) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    }).catch(() => { });

                    return cachedResponse || fetchedResponse;
                });
            })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => response || fetch(event.request))
    );
});
