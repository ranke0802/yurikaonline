import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import ResourceManager from '../src/js/core/ResourceManager.js';

function browser() {
    globalThis.window = { GAME_VERSION: 'test-build', location: new URL('https://game.test/index.html') };
}

test('relative, root and absolute image paths share one download, decode and object; a new build invalidates it', async t => {
    browser();
    let downloads = 0, decodes = 0;
    const originalImage = globalThis.Image;
    t.after(() => { globalThis.Image = originalImage; });
    globalThis.Image = class {
        naturalWidth = 768; naturalHeight = 768;
        set src(url) { this.url = url; downloads++; queueMicrotask(() => this.onload()); }
        async decode() { decodes++; }
    };
    const resources = new ResourceManager();
    const images = await Promise.all(['assets/a.webp', '/assets/a.webp', 'https://game.test/assets/a.webp']
        .flatMap(path => Array.from({ length: 10 }, () => resources.loadImage(path))));
    assert.equal(downloads, 1); assert.equal(decodes, 1);
    assert.ok(images.every(image => image === images[0]));
    assert.equal(resources.getImage('/assets/a.webp'), images[0]);
    assert.equal(await resources.loadImage('/assets/a.webp'), images[0]);
    window.GAME_VERSION = 'next-build';
    assert.notEqual(await resources.loadImage('/assets/a.webp'), images[0]);
    assert.equal(downloads, 2);
});

test('content and history share in-flight requests, persist in memory, and retry failed loads', async t => {
    browser();
    let requests = 0, fail = false;
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
        requests++;
        assert.equal(options.cache, 'force-cache');
        if (fail) return new Response('missing', { status: 404 });
        return new Response('{"ok":true}');
    });
    const resources = new ResourceManager();
    const data = await Promise.all(Array.from({ length: 25 }, () => resources.loadJSON('/assets/a.json')));
    assert.ok(data.every(item => item === data[0]));
    await resources.loadJSON('assets/a.json');
    assert.equal(requests, 1);
    await Promise.all(Array.from({ length: 25 }, () => resources.loadText('./README.md')));
    await resources.loadText('README.md');
    assert.equal(requests, 2);
    fail = true;
    await assert.rejects(resources.loadJSON('/assets/b.json'), /HTTP 404/);
    fail = false;
    assert.deepEqual(await resources.loadJSON('/assets/b.json'), { ok: true });
    assert.equal(requests, 4);
});

test('image errors are retryable, while VFX drawing never starts a retry', async t => {
    browser();
    let downloads = 0;
    const originalImage = globalThis.Image;
    t.after(() => { globalThis.Image = originalImage; });
    globalThis.Image = class {
        set src(_url) { downloads++; queueMicrotask(() => this.onerror(new Error('offline'))); }
    };
    const resources = new ResourceManager();
    await assert.rejects(resources.loadImage('/assets/fail.webp'), /offline/);
    await assert.rejects(resources.loadImage('/assets/fail.webp'), /offline/);
    assert.equal(downloads, 2);
    const { drawSkillProjectile, drawSkillImpact, drawSkillShield, drawSkillLightning } = await import('../src/js/effects/PlayerSkillVfxRenderer.js');
    for (let i = 0; i < 60; i++) {
        assert.equal(drawSkillProjectile({}, 'fireball', 0, 0, 10, 0, []), false);
        assert.equal(drawSkillImpact({}, 0, 0, 20, 0.5), false);
        assert.equal(drawSkillShield({}, 0, 0), false);
        assert.equal(drawSkillLightning({}, 0, 0, 100, 100, 1), false);
    }
    assert.equal(downloads, 2);
});

test('four shipped atlases retain alpha/gutters and fit the 1 MiB download budget', async () => {
    const root = 'assets/resource/effects/player-skills/';
    const manifest = JSON.parse(readFileSync(`${root}manifest.json`, 'utf8'));
    let bytes = 0;
    for (const asset of Object.values(manifest.assets)) {
        const file = readFileSync(root + asset.file);
        bytes += file.length;
        assert.equal(file.length, asset.bytes);
        const info = await sharp(file).metadata();
        assert.equal(info.format, 'webp'); assert.equal(info.width, 768); assert.equal(info.height, 768);
        assert.equal(info.hasAlpha, true);
        const { data, info: raw } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
        for (let y = 0; y < 768; y += 192) for (let x = 0; x < 768; x++) {
            assert.equal(data[(y * 768 + x) * raw.channels + 3], 0, 'frame boundary must be transparent');
        }
    }
    assert.ok(bytes < 1024 * 1024, `VFX budget exceeded: ${bytes}`);
});

function serviceWorker() {
    const listeners = {}, stores = new Map(), requests = [];
    const context = vm.createContext({
        URL, Request, Response, Set, Map, Date, Promise,
        self: { location: new URL('https://game.test/'), addEventListener: (name, fn) => { listeners[name] = fn; }, skipWaiting() {} },
        caches: { open: async name => {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name);
            return { match: async request => store.get(request.url)?.clone(),
                put: async (request, response) => { store.set(request.url, response.clone()); },
                keys: async () => Array.from(store.keys(), url => new Request(url)),
                delete: async request => store.delete(request.url) };
        } },
        fetch: async request => {
            requests.push(request);
            const response = new Response('downloaded');
            Object.defineProperty(response, 'type', { value: 'basic' });
            return response;
        }
    });
    vm.runInContext(readFileSync('sw.js', 'utf8'), context);
    return { requests, async get(path) {
        let response;
        listeners.fetch({ request: new Request(new URL(path, 'https://game.test/')), respondWith: value => { response = value; } });
        return response ? await response : null;
    } };
}

test('service worker reuses same-build images/data/history, keeps version checks fresh and bypasses Firebase', async () => {
    const worker = serviceWorker();
    const version = readFileSync('version.txt', 'utf8').trim();
    for (const path of ['/assets/fx.webp', '/assets/data/a.json', '/README.md']) {
        await worker.get(`${path}?v=${version}`);
        await worker.get(`${path}?v=${version}`);
    }
    assert.equal(worker.requests.length, 3, 'cache hits must not revalidate/download');
    await worker.get('/version.txt'); await worker.get('/version.txt');
    assert.equal(worker.requests.length, 5);
    assert.equal(worker.requests[4].cache, 'no-store');
    assert.equal(await worker.get('https://firebase.example.com/data.json'), null);
    await worker.get('/assets/fx.webp?v=next-build');
    assert.equal(worker.requests.length, 6);
});

// Node has no Image; define a configurable slot for the mocks above.
if (!globalThis.Image) globalThis.Image = class {};
