const APP_VERSION = '0.02.087';
const SHELL_CACHE = `yurika-online-shell-${APP_VERSION}`;
const STATIC_CACHE = `yurika-online-static-${APP_VERSION}`;
const ACTIVE_CACHES = [SHELL_CACHE, STATIC_CACHE];
const CACHE_ENTRY_LIMITS = {
    [SHELL_CACHE]: 32,
    [STATIC_CACHE]: 320
};
const CACHE_TRIM_INTERVAL_MS = 60000;
const lastCacheTrimAt = new Map();

const APP_SHELL = [
    './',
    './index.html',
    `./manifest.json?v=${APP_VERSION}`,
    `./src/css/style.css?v=${APP_VERSION}`,
    `./src/js/main.js?v=${APP_VERSION}`,
    `./src/js/firebaseConfig.js?v=${APP_VERSION}`,
    `./src/assets/icon_192_clean.webp?v=${APP_VERSION}`,
    `./src/assets/icon_512_clean.webp?v=${APP_VERSION}`
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

function isMutableAppAssetRequest(request, url) {
    if (request.method !== 'GET') return false;
    if (url.origin !== self.location.origin) return false;
    if (isVersionRequest(url) || isDocumentLikeRequest(request, url)) return false;

    return (
        request.destination === 'script'
        || request.destination === 'style'
        || url.pathname.startsWith('/src/js/')
        || url.pathname.startsWith('/src/css/')
        || url.pathname.startsWith('/assets/data/')
        || url.pathname.endsWith('/manifest.json')
        || url.pathname.endsWith('.json')
    );
}

function buildNoStoreRequest(request) {
    if (!request || request.method !== 'GET') return request;
    try {
        return new Request(request, { cache: 'no-store' });
    } catch (error) {
        return request;
    }
}

async function trimCacheEntries(cacheName, cache, options = {}) {
    const limit = CACHE_ENTRY_LIMITS[cacheName];
    if (!Number.isFinite(limit) || limit <= 0) return;

    const now = Date.now();
    if (!options.force && now - Number(lastCacheTrimAt.get(cacheName) || 0) < CACHE_TRIM_INTERVAL_MS) {
        return;
    }
    lastCacheTrimAt.set(cacheName, now);

    const keys = await cache.keys();
    if (keys.length <= limit) return;

    const overflow = keys.length - limit;
    await Promise.all(keys.slice(0, overflow).map((request) => cache.delete(request)));
}

async function putResponseInCache(cacheName, cache, request, response) {
    try {
        await cache.put(request, response.clone());
        await trimCacheEntries(cacheName, cache);
    } catch (error) {
        // Cache quota or opaque browser storage failures must never block play.
    }
}

async function networkFirst(request, cacheName, options = {}) {
    const cache = await caches.open(cacheName);
    const networkRequest = options?.noStore ? buildNoStoreRequest(request) : request;
    try {
        const response = await fetch(networkRequest);
        if (response && response.status === 200 && response.type === 'basic') {
            await putResponseInCache(cacheName, cache, request, response);
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
        await putResponseInCache(cacheName, cache, request, response);
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
        caches.keys()
            .then((keys) => Promise.all(
                keys.map((key) => {
                    if (!ACTIVE_CACHES.includes(key)) return caches.delete(key);
                    return Promise.resolve(false);
                })
            ))
            .then(() => Promise.all(
                ACTIVE_CACHES.map(async (cacheName) => {
                    const cache = await caches.open(cacheName);
                    await trimCacheEntries(cacheName, cache, { force: true });
                })
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (isFirebaseRequest(url)) return;

    if (isVersionRequest(url)) {
        event.respondWith(fetch(buildNoStoreRequest(event.request)).catch(() => new Response('error')));
        return;
    }

    if (isDocumentLikeRequest(event.request, url)) {
        event.respondWith(networkFirst(event.request, SHELL_CACHE, { noStore: true }));
        return;
    }

    if (isMutableAppAssetRequest(event.request, url)) {
        event.respondWith(networkFirst(event.request, STATIC_CACHE, { noStore: true }));
        return;
    }

    if (isStaticAssetRequest(event.request, url)) {
        event.respondWith(cacheFirst(event.request, STATIC_CACHE));
        return;
    }

    event.respondWith(networkFirst(event.request, SHELL_CACHE));
});
