require('./lib/qa-preflight.cjs');
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const CACHE = 'yurika-online-immutable-v1';
const WITCH_PORTRAIT = '/assets/immutable/03be1a085990aefa1341e623.webp';

// Fault injection for the local regression control: defer the first portrait's
// DOM src assignment, without changing HTTP cache, SW code or CacheStorage.
function deferFirstPortrait({ target, delay }) {
    if (!delay || sessionStorage.getItem('qaPortraitGateDone')) return;
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    let opened = false, timer = false;
    Object.defineProperty(Element.prototype, 'innerHTML', { ...descriptor, set(value) {
        if (this.id === 'camp-scene' && !opened && String(value).includes(target)) {
            value = String(value).split(`src="${new URL(target, location.href).href}"`).join(`data-qa-pending-src="${target}"`);
            if (!timer) {
                timer = true; sessionStorage.setItem('qaPortraitGateDone', '1');
                setTimeout(() => {
                    opened = true;
                    for (const img of document.querySelectorAll('img[data-qa-pending-src]')) {
                        img.src = img.dataset.qaPendingSrc; delete img.dataset.qaPendingSrc;
                    }
                }, delay);
            }
        }
        descriptor.set.call(this, value);
    } });
}

async function runCacheLifecycle({ classes = ['wizard', 'witch', 'warrior', 'archer'], out = process.env.QA_OUTPUT || '/tmp/yurika-cache-lifecycle', portraitDelayMs = 0, evictPortraitBeforeWarm = false } = {}) {
    const root = process.cwd(), version = fs.readFileSync('version.txt', 'utf8').trim();
    const report = { scope: 'Loopback response body sizes with request/finish times; not Firebase billing. Unmodified real SW, no route interception. Every warm/update immutable image body must be zero.', status: 'running', phases: [], checkpoints: [], external: [], fixtures: { portraitDelayMs, evictPortraitBeforeWarm } };
    let phase = 'setup', release = version, browser, activePage, coldCachedPaths = new Set();
    const rows = [], events = [];
    const mark = (event, detail = {}) => events.push({ time: Date.now(), phase, event, ...detail });
    const server = http.createServer((req, res) => {
        const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        let body, status = 200;
        const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
        try {
            if (!file.startsWith(root + '/') || /(?:^|\/)(?:\.|node_modules)|firebaseConfig/.test(name)) throw Error('private');
            body = name === '/cache-fixture' ? Buffer.from('<!doctype html><title>Local cache fixture</title>') : fs.readFileSync(file);
        } catch { body = Buffer.from('missing'); status = 404; }
        if (['/', '/index.html', '/sw.js', '/src/js/main.js', '/src/js/world/scenes/LoginScene.js', '/version.txt'].includes(name)) body = Buffer.from(body.toString().split(version).join(release));
        const immutable = name.startsWith('/assets/immutable/'), image = /\.(webp|png|svg)$/.test(name), etag = '"' + hash(body) + '"';
        if (status === 200 && req.headers['if-none-match'] === etag) status = 304;
        const row = { phase, path: name, status, bytes: status === 304 ? 0 : body.length, immutable, image, startedAt: Date.now(), finishedAt: null, closedAt: null, writableFinished: false };
        rows.push(row);
        res.once('finish', () => { row.finishedAt = Date.now(); row.writableFinished = true; });
        res.once('close', () => { row.closedAt = Date.now(); row.writableFinished = res.writableFinished; });
        res.writeHead(status, {
            'Content-Type': ({ '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(name)] || 'text/html',
            'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : name === '/version.txt' ? 'no-store' : 'no-cache', 'ETag': etag,
            'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'",
            ...(status === 304 ? {} : { 'Content-Length': body.length })
        });
        res.end(status === 304 ? undefined : body);
    });
    function summarize() {
        report.phases = [...new Set(rows.map(r => r.phase))].map(name => {
            const group = rows.filter(r => r.phase === name);
            return { phase: name, requests: group.length, bytes: group.reduce((n,r) => n+r.bytes,0), immutableImageBytes: group.filter(r => r.immutable && r.image).reduce((n,r) => n+r.bytes,0) };
        });
    }
    function assertNoImageBodies() {
        const unexpected = rows.filter(r => r.phase === phase && r.immutable && r.image && r.bytes > 0);
        const bytes = unexpected.reduce((n,r) => n+r.bytes,0);
        if (bytes) {
            report.unexpectedImages = unexpected.map(r => ({ ...r, cachedAtColdEnd: coldCachedPaths.has(r.path), earlierResponses: rows.filter(p => p.path === r.path && p.phase.endsWith(':cold')).map(p => ({ phase: p.phase, startedAt: p.startedAt, finishedAt: p.finishedAt, bytes: p.bytes })) }));
            console.error(JSON.stringify({ phase, immutableImageBytes: bytes, unexpectedImages: report.unexpectedImages }));
        }
        // Do not exclude new/lazy images: all unexpected bodies remain failures.
        assert.equal(bytes, 0, phase);
    }
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`; report.origin = base;
    try {
        browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
        report.browserVersion = browser.version();
        for (const id of classes) {
            assert.ok(['wizard', 'witch', 'warrior', 'archer'].includes(id));
            release = version; phase = `${id}:install`; mark('phase-start');
            const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });
            if (portraitDelayMs && id === 'witch') await context.addInitScript(deferFirstPortrait, { target: WITCH_PORTRAIT, delay: portraitDelayMs });
            for (const event of ['request', 'requestfinished', 'requestfailed']) context.on(event, request => {
                const url = new URL(request.url());
                if (url.origin !== base && !['data:', 'blob:'].includes(url.protocol)) report.external.push(url.origin);
                if (url.origin === base && /\/assets\/immutable\/.*\.(webp|png|svg)$/.test(url.pathname)) mark(event, { path: url.pathname, worker: !!request.serviceWorker?.(), ...(event === 'requestfailed' ? { failure: request.failure()?.errorText } : {}) });
            });
            const page = await context.newPage(); activePage = page; page.setDefaultTimeout(30000);
            // Reading CacheStorage observes committed entries; it never fetches or
            // populates missing assets. Timing is an observation, not cache.put's timestamp.
            const checkpoint = async (label, expectedPaths = []) => {
                const startedAt = Date.now();
                await page.waitForFunction(async ({ paths, cacheName }) => {
                    const cache = await caches.open(cacheName);
                    return (await Promise.all(paths.map(p => cache.match(p)))).every(r => r?.status === 200);
                }, { paths: expectedPaths, cacheName: CACHE });
                const state = await page.evaluate(async cacheName => {
                    const cache = await caches.open(cacheName);
                    const keys = (await cache.keys()).map(r => ({ cacheKey: r.url, path: new URL(r.url).pathname }));
                    return { observedAt: Date.now(), controller: navigator.serviceWorker.controller?.scriptURL, cacheName, keys };
                }, CACHE);
                report.checkpoints.push({ phase, label, startedAt, expectedPaths, ...state });
                return state;
            };
            const campReady = async label => {
                mark('camp-image-wait-start', { label, classId: id });
                await page.waitForFunction(id => {
                    const scene = window.game?.sceneManager.currentScene, root = document.getElementById('camp-scene');
                    const images = root ? [...root.querySelectorAll('img')] : [];
                    return scene?.constructor.name === 'CampScene' && !scene.busy && !scene.classSelectionOperation && game.localPlayer?.classId === id
                        && images.length > 0 && images.every(i => i.complete && i.naturalWidth > 0 && i.currentSrc);
                }, id);
                const images = await page.evaluate(async () => {
                    const images = [...document.querySelectorAll('#camp-scene img')]; await Promise.all(images.map(i => i.decode()));
                    if (images.some(i => !i.isConnected)) throw Error('Camp replaced its images during readiness check');
                    return images.map(i => ({ path: new URL(i.currentSrc).pathname, width: i.naturalWidth, height: i.naturalHeight, decodedAt: Date.now() }));
                });
                const state = await checkpoint(label, [...new Set(images.map(i => i.path))]);
                report.checkpoints[report.checkpoints.length - 1].images = images;
                mark('camp-images-decoded-and-cached', { label, paths: images.map(i => i.path), observedAt: state.observedAt });
            };
            await page.goto(base + '/cache-fixture');
            await page.evaluate(async () => {
                await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
                if (!navigator.serviceWorker.controller) await new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
            });
            const depart = async ({ offline = false } = {}) => {
                await campReady('camp-decoded-and-cached');
                await page.locator('[data-camp=prepare]').tap();
                await campReady('preparation-decoded-and-cached');
                await page.locator('[data-camp=depart]').tap();
                await page.locator('.camp-return').waitFor(); await page.locator('#loading-overlay').waitFor({ state: 'hidden' });
                if (!offline) await page.waitForLoadState('networkidle');
                await page.waitForFunction(() => game.resources.loading.size === 0);
                assert.equal(await page.evaluate(() => game.localPlayer.classId), id);
                const requestedImages = [...new Set(rows.filter(r => r.phase.startsWith(id + ':') && r.immutable && r.image && r.status === 200).map(r => r.path))];
                return checkpoint('field-ready-and-cached', requestedImages);
            };
            phase = `${id}:cold`; mark('phase-start');
            await page.goto(base + '/?local=1'); await page.locator('#camp-name').fill('캐시 계측');
            await page.locator('[data-camp=create]').tap(); await page.locator('[data-camp=character]').first().waitFor();
            await page.evaluate(async id => {
                const n = game.net, p = await n.getPlayerProfile(n.playerId);
                await n.savePlayerData(n.playerId, { ...p, activeClassId: id, questData: { ...p.questData, prologueCompleted: true, basicTrainingCompleted: true } });
            }, id);
            await page.evaluate(async id => { await game.sceneManager.currentScene.selectClass(id); }, id);
            const cold = await depart(); coldCachedPaths = new Set(cold.keys.map(k => k.path));
            if (evictPortraitBeforeWarm && id === 'witch') {
                assert.ok(coldCachedPaths.has(WITCH_PORTRAIT), 'negative control must evict a previously cached image');
                assert.equal(await page.evaluate(async ({ cacheName, target }) => (await caches.open(cacheName)).delete(target), { cacheName: CACHE, target: WITCH_PORTRAIT }), true);
                const cdp = await context.newCDPSession(page); await cdp.send('Network.clearBrowserCache'); await cdp.detach(); mark('negative-control-evicted', { path: WITCH_PORTRAIT });
            }
            phase = `${id}:warm`; mark('phase-start');
            await page.reload(); await page.locator('[data-camp=character]').first().waitFor(); await depart(); assertNoImageBodies();
            phase = `${id}:update`; release = '99.0.0'; mark('phase-start');
            await page.evaluate(async () => {
                const registration = await navigator.serviceWorker.getRegistration();
                const changed = new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
                await registration.update(); await changed;
            });
            await page.reload(); await page.locator('[data-camp=character]').first().waitFor(); await depart();
            assert.ok(await page.evaluate(cacheName => caches.has(cacheName), CACHE)); assertNoImageBodies();
            if (id === 'wizard') {
                await context.setOffline(true); phase = 'wizard:offline'; const beforeOffline = rows.length; mark('offline-acknowledged');
                await page.reload(); await page.locator('[data-camp=character]').first().waitFor(); await depart({ offline: true });
                assert.equal(rows.length, beforeOffline, 'offline reentry must use cached shell/assets'); report.offlineReentry = 'passed'; await context.setOffline(false);
            }
            await context.close(); console.log(`PASS ${id}: decoded camp/prepare + committed cache before transitions; warm/update image bodies=0`);
        }
        assert.deepEqual(report.external, []); report.status = 'passed';
        return report;
    } catch (error) {
        report.status = 'failed'; report.error = { name: error.name, message: error.message };
        try {
            report.failureSnapshot = await activePage?.evaluate(async cacheName => ({
                observedAt: Date.now(), scene: window.game?.sceneManager.currentScene?.constructor.name,
                images: [...document.querySelectorAll('#camp-scene img')].map(i => ({ path: i.currentSrc ? new URL(i.currentSrc).pathname : null, complete: i.complete, width: i.naturalWidth })),
                cacheKeys: (await (await caches.open(cacheName)).keys()).map(r => new URL(r.url).pathname)
            }), CACHE);
        } catch { report.failureSnapshot = { unavailable: true }; }
        throw error;
    } finally {
        await browser?.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); summarize();
        fs.mkdirSync(out, { recursive: true });
        for (const [name, value] of [['report', report], ['requests', rows], ['events', events]]) fs.writeFileSync(`${out}/${name}.json`, JSON.stringify(value, null, 2));
    }
}
module.exports = { runCacheLifecycle, WITCH_PORTRAIT };
if (require.main === module) runCacheLifecycle().catch(e => { console.error(e); process.exitCode = 1; });
