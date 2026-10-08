const APP_VERSION = '0.02.181';
const SHELL_CACHE = `yurika-online-shell-${APP_VERSION}`;
const STATIC_CACHE = `yurika-online-static-${APP_VERSION}`;
const IMMUTABLE_CACHE = 'yurika-online-immutable-v1';
const ACTIVE_CACHES = [SHELL_CACHE, STATIC_CACHE, IMMUTABLE_CACHE];
const CACHE_ENTRY_LIMITS = {
    [SHELL_CACHE]: 32,
    [STATIC_CACHE]: 320,
    [IMMUTABLE_CACHE]: 512
};
const CACHE_TRIM_INTERVAL_MS = 60000;
const lastCacheTrimAt = new Map();

const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    `./src/css/style.css?v=${APP_VERSION}`,
    `./src/js/main.js?v=${APP_VERSION}`,
];

const PWA_ICON_ASSETS = [
    // PWA_ICON_PRECACHE_START
    '/assets/immutable/939b21e82d8e0522fb1aec26.png',
    '/assets/immutable/f30b00707468d2823701a6a4.png',
    '/assets/immutable/df353f5ab889ca47d521fafe.png',
    '/assets/immutable/621cb39b204e33c9c59a6c92.png',
    // PWA_ICON_PRECACHE_END
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
        || url.pathname.endsWith('/index.html');
}

function isStaticAssetRequest(request, url) {
    if (request.method !== 'GET') return false;
    if (url.origin !== self.location.origin) return false;
    if (isVersionRequest(url) || isDocumentLikeRequest(request, url)) return false;

    // Only shipped public files. Never cache API, auth, account or arbitrary JSON.
    return url.pathname.startsWith('/assets/')
        || url.pathname.startsWith('/src/')
        || url.pathname === '/manifest.json'
        || url.pathname === '/README.md';
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
        Promise.all([
            caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)),
            caches.open(IMMUTABLE_CACHE).then((cache) => cache.addAll(PWA_ICON_ASSETS))
        ])
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.map((key) => {
                    if (key.startsWith('yurika-online-') && !ACTIVE_CACHES.includes(key)) return caches.delete(key);
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

    if (event.request.method !== 'GET' || url.origin !== self.location.origin || isFirebaseRequest(url)) return;
    if (url.pathname === '/src/js/firebaseConfig.js') return;
    if (/^\/assets\/immutable\/[a-f0-9]{24}\.(webp|png|svg|json)$/.test(url.pathname)) {
        event.respondWith(cacheFirst(event.request, IMMUTABLE_CACHE));
        return;
    }

    if (isVersionRequest(url)) {
        event.respondWith(fetch(buildNoStoreRequest(event.request)).catch(() => new Response('Version unavailable', {
            status: 503, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }
        })));
        return;
    }

    if (isDocumentLikeRequest(event.request, url)) {
        event.respondWith(networkFirst(event.request, SHELL_CACHE, { noStore: true }));
        return;
    }

    // Build-versioned data and scripts are immutable for that build. The next
    // release has its own URL/cache; unversioned code still checks the network.
    if (isStaticAssetRequest(event.request, url) && url.searchParams.get('v') === APP_VERSION) {
        event.respondWith(cacheFirst(event.request, STATIC_CACHE));
        return;
    }

    if (isStaticAssetRequest(event.request, url) && isMutableAppAssetRequest(event.request, url)) {
        event.respondWith(networkFirst(event.request, STATIC_CACHE, { noStore: true }));
        return;
    }

    if (isStaticAssetRequest(event.request, url)) {
        event.respondWith(cacheFirst(event.request, STATIC_CACHE));
        return;
    }

    // Unknown endpoints bypass CacheStorage entirely.
});
