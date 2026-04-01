const APP_VERSION = '0.01.46';
const SHELL_CACHE = `yurika-online-shell-${APP_VERSION}`;
const STATIC_CACHE = `yurika-online-static-${APP_VERSION}`;
const ACTIVE_CACHES = [SHELL_CACHE, STATIC_CACHE];

const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    `./src/css/style.css?v=${APP_VERSION}`,
    `./src/js/main.js?v=${APP_VERSION}`
];

function isFirebaseRequest(url) {
    return url.hostname.includes('googleapis.com') || url.hostname.includes('firebase');
}

function isVersionRequest(url) {
    return url.pathname.endsWith('version.txt');
}

function isDocumentLikeRequest(request, url) {
    return request.mode === 'navigate'
        || request.destination === 'document'
        || url.pathname.endsWith('/README.md')
        || url.pathname.endsWith('/index.html');
}

function isStaticAssetRequest(request, url) {
    if (request.method !== 'GET') return false;
    if (url.origin !== self.location.origin) return false;
    if (isVersionRequest(url) || isDocumentLikeRequest(request, url)) return false;

    const staticDestinations = new Set([
        'style',
        'script',
        'image',
        'font',
        'audio',
        'video'
    ]);

    if (staticDestinations.has(request.destination)) return true;

    return (
        url.pathname.startsWith('/assets/')
        || url.pathname.startsWith('/src/')
        || url.pathname.endsWith('/manifest.json')
        || url.pathname.endsWith('.json')
        || url.pathname.endsWith('.webp')
        || url.pathname.endsWith('.png')
        || url.pathname.endsWith('.jpg')
        || url.pathname.endsWith('.jpeg')
        || url.pathname.endsWith('.svg')
        || url.pathname.endsWith('.mp3')
        || url.pathname.endsWith('.ogg')
        || url.pathname.endsWith('.wav')
        || url.pathname.endsWith('.woff2')
    );
}

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const response = await fetch(request);
        if (response && response.status === 200 && response.type === 'basic') {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;

        if (request.mode === 'navigate') {
            const shellFallback = await cache.match('./index.html') || await cache.match('./');
            if (shellFallback) return shellFallback;
        }

        return new Response('Asset Not Found (Offline)', {
            status: 404,
            statusText: 'Not Found',
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
        cache.put(request, response.clone());
    }
    return response;
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.map((key) => {
                if (!ACTIVE_CACHES.includes(key)) return caches.delete(key);
                return Promise.resolve(false);
            })
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (isFirebaseRequest(url)) return;

    if (isVersionRequest(url)) {
        event.respondWith(fetch(event.request).catch(() => new Response('error')));
        return;
    }

    if (isDocumentLikeRequest(event.request, url)) {
        event.respondWith(networkFirst(event.request, SHELL_CACHE));
        return;
    }

    if (isStaticAssetRequest(event.request, url)) {
        event.respondWith(cacheFirst(event.request, STATIC_CACHE));
        return;
    }

    event.respondWith(networkFirst(event.request, SHELL_CACHE));
});
