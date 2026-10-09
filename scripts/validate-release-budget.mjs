import './lib/qa-preflight.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createBoundedClient } from './lib/bounded-release-client.mjs';
import { createReleaseManifest, manifestBytes, RELEASE_FILES } from './lib/release-manifest.mjs';
import { readFileSync } from 'node:fs';
async function fixture(t, handler, limits = {}) {
    let requests = 0;
    const server = http.createServer((req,res) => { requests++; handler(req,res); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
    return { client: createBoundedClient({ origin: `http://127.0.0.1:${server.address().port}`, maxRequests: 8, maxBytes: 32, ...limits }), requests: () => requests };
}
test('fixed release plan fits the reviewed 8 requests / 200000 response-body-byte budget', () => {
    const manifest = createReleaseManifest();
    const bytes = readFileSync('version.txt').length + manifestBytes(manifest).length + Object.values(manifest.files).reduce((n,f) => n+f.bytes,0);
    assert.equal(RELEASE_FILES.length + 3, 8); assert.ok(bytes <= 200000); console.log(`Planned release verification: 8 requests, ${bytes} body bytes, 0 image GETs, 0 retries`);
});
test('successful GET and HEAD count only response bodies', async t => {
    const f = await fixture(t, (req,res) => { res.writeHead(200, { 'Content-Length': 3 }); res.end(req.method === 'HEAD' ? undefined : 'abc'); });
    assert.equal((await f.client.get('/version.txt', { expectedBytes: 3 })).bytes.toString(), 'abc');
    await f.client.get('/image.webp', { method: 'HEAD' }); assert.equal(f.client.stats.bytes, 3); assert.equal(f.requests(), 2);
    await assert.rejects(f.client.get('/image.webp'), /image bodies/); assert.equal(f.requests(), 2);
});
for (const kind of ['http-failure', 'redirect', 'large', 'chunked', 'missing-length', 'mismatch', 'encoding']) test(`${kind}: abort first response and never retry or follow`, async t => {
    const f = await fixture(t, (_req,res) => {
        if (kind === 'http-failure') { res.writeHead(503, { 'Content-Length': 0 }); res.end(); }
        else if (kind === 'redirect') { res.writeHead(302, { Location: 'http://127.0.0.1:1/must-not-follow', 'Content-Length': 0 }); res.end(); }
        else if (kind === 'large') { res.writeHead(200, { 'Content-Length': 999999 }); res.end('x'); }
        else if (kind === 'chunked') { res.writeHead(200); res.end('x'); }
        else if (kind === 'missing-length') { res.useChunkedEncodingByDefault = false; res.setHeader('Connection', 'close'); res.writeHead(200); res.end('x'); }
        else if (kind === 'encoding') { res.writeHead(200, { 'Content-Length': 1, 'Content-Encoding': 'gzip' }); res.end('x'); }
        else { res.writeHead(200, { 'Content-Length': 2 }); res.end('xx'); }
    });
    await assert.rejects(f.client.get('/version.txt', { expectedBytes: 1 }));
    await assert.rejects(f.client.get('/version.txt'), /first failure/); assert.equal(f.requests(), 1);
});
test('cumulative request and byte ceilings stop before the next request', async t => {
    const f = await fixture(t, (_req,res) => { res.writeHead(200, { 'Content-Length': 2 }); res.end('ok'); }, { maxRequests: 1 });
    await f.client.get('/version.txt'); await assert.rejects(f.client.get('/version.txt'), /request budget/); assert.equal(f.requests(), 1);
    const g = await fixture(t, (_req,res) => { res.writeHead(200, { 'Content-Length': 2 }); res.end('ok'); }, { maxBytes: 3 });
    await g.client.get('/version.txt'); await assert.rejects(g.client.get('/version.txt', { expectedBytes: 2 }), /byte budget/); assert.equal(g.requests(), 1);
});
test('parallel probes serialize and share the same cumulative byte ceiling', async t => {
    let active = 0, peak = 0;
    const f = await fixture(t, (_req,res) => {
        active++; peak = Math.max(peak, active);
        setTimeout(() => { active--; res.writeHead(200, { 'Content-Length': 2 }); res.end('ok'); }, 20);
    }, { maxBytes: 5 });
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => f.client.get('/version.txt', { expectedBytes: 2 })));
    assert.deepEqual(results.map(r => r.status), ['fulfilled','fulfilled','rejected','rejected']);
    assert.equal(peak, 1); assert.equal(f.requests(), 2); assert.equal(f.client.stats.bytes, 4);
});
test('parallel queued probes send nothing after the first HTTP failure', async t => {
    const f = await fixture(t, (_req,res) => { res.writeHead(503, { 'Content-Length': 0 }); res.end(); });
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => f.client.get('/version.txt')));
    assert.ok(results.every(r => r.status === 'rejected')); assert.equal(f.requests(), 1);
});
test('false Content-Length: truncated stream aborts and queued request never starts', async t => {
    const f = await fixture(t, (_req,res) => { res.writeHead(200, { 'Content-Length': 4 }); res.end('x'); });
    const results = await Promise.allSettled([f.client.get('/version.txt', { expectedBytes: 4 }), f.client.get('/later')]);
    assert.ok(results.every(r => r.status === 'rejected')); assert.equal(f.requests(), 1);
});
test('ambiguous framing (Content-Length and chunked) is rejected by HTTP parser', async t => {
    const f = await fixture(t, (_req,res) => { res.writeHead(200, { 'Content-Length': 2, 'Transfer-Encoding': 'chunked' }); res.end('ok'); });
    await assert.rejects(f.client.get('/version.txt')); assert.equal(f.requests(), 1);
});
test('understated declared size is rejected against the local artifact before reading', async t => {
    const f = await fixture(t, (_req,res) => { res.writeHead(200, { 'Content-Length': 1 }); res.end('x'); });
    await assert.rejects(f.client.get('/version.txt', { expectedBytes: 4 }), /response length/);
    assert.equal(f.client.stats.bytes, 0); await assert.rejects(f.client.get('/later'), /first failure/); assert.equal(f.requests(), 1);
});
test('client refuses budgets above hard ceiling even without the CLI policy wrapper', () => {
    for (const limits of [{ maxRequests: 9, maxBytes: 32 }, { maxRequests: 1, maxBytes: 524289 }]) {
        assert.throws(() => createBoundedClient({ origin: 'http://127.0.0.1:1', ...limits }), /hard ceiling/);
    }
});
test('actual release CLI uses eight local requests; version mismatch stops after one', async t => {
    const { writeFileSync } = await import('node:fs');
    const { spawn } = await import('node:child_process');
    writeFileSync('release-manifest.json', manifestBytes());
    let corruptVersion = false; const paths = [];
    const server = http.createServer((req,res) => {
        const path = new URL(req.url, 'http://localhost').pathname; paths.push({ method: req.method, path });
        let bytes = readFileSync(path === '/' ? 'index.html' : '.' + path);
        if (corruptVersion && path === '/version.txt') bytes = Buffer.from('X' + bytes.toString().slice(1));
        res.writeHead(200, { 'Content-Length': bytes.length, 'Cache-Control': path === '/version.txt' ? 'no-store' : path.startsWith('/assets/immutable/') ? 'public,max-age=31536000,immutable' : 'no-cache' });
        res.end(req.method === 'HEAD' ? undefined : bytes);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
    async function run() {
        const child = spawn(process.execPath, ['scripts/verify-hosting-release.mjs'], { env: { ...process.env, YURIKA_RELEASE_ORIGIN: `http://127.0.0.1:${server.address().port}`, YURIKA_RELEASE_MAX_REQUESTS: '8', YURIKA_RELEASE_MAX_BYTES: '200000' } });
        let stdout = '', stderr = ''; child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
        const code = await new Promise(r => child.once('exit', r)); return { code, stdout, stderr };
    }
    const good = await run(); assert.equal(good.code, 0, good.stderr);
    const result = JSON.parse(good.stdout.trim()); assert.equal(result.requests, 8); assert.equal(result.imageBodyGets, 0); assert.equal(result.retries, 0);
    assert.equal(paths.length, 8); assert.equal(paths.filter(p => /\.(webp|png)$/.test(p.path) && p.method === 'GET').length, 0);
    paths.length = 0; corruptVersion = true;
    const bad = await run(); assert.equal(bad.code, 1); assert.deepEqual(paths, [{ method: 'GET', path: '/version.txt' }]);
});
