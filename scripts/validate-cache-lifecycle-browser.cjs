require('./lib/qa-preflight.cjs');
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const root = process.cwd(), version = fs.readFileSync('version.txt', 'utf8').trim();
const out = process.env.QA_OUTPUT || '/tmp/yurika-cache-lifecycle';
const report = { scope: 'Loopback server response body bytes, not encoded Firebase billing bytes. Real app/SW, local profiles, no route interception.', phases: [], external: [] };
let phase = 'setup', release = version;
const rows = [];
const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let body, status = 200;
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    try {
        if (!file.startsWith(root + '/') || /(?:^|\/)(?:\.|node_modules)|firebaseConfig/.test(name)) throw Error('private');
        body = name === '/cache-fixture' ? Buffer.from('<!doctype html><title>Local cache fixture</title>') : fs.readFileSync(file);
    } catch { body = Buffer.from('missing'); status = 404; }
    if (['/', '/index.html', '/sw.js', '/src/js/main.js', '/src/js/world/scenes/LoginScene.js', '/version.txt'].includes(name)) {
        body = Buffer.from(body.toString().split(version).join(release));
    }
    const immutable = name.startsWith('/assets/immutable/');
    const etag = '"' + hash(body) + '"';
    if (status === 200 && req.headers['if-none-match'] === etag) status = 304;
    const image = /\.(webp|png|svg)$/.test(name);
    rows.push({ phase, path: name, status, bytes: status === 304 ? 0 : body.length, immutable, image });
    res.writeHead(status, {
        'Content-Type': ({ '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(name)] || 'text/html',
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : name === '/version.txt' ? 'no-store' : 'no-cache',
        'ETag': etag,
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
(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    try {
        for (const id of ['wizard', 'witch', 'warrior', 'archer']) {
            release = version; phase = `${id}:install`;
            const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });
            const page = await context.newPage(); page.setDefaultTimeout(30000);
            page.on('request', req => { if (!req.url().startsWith(base) && !/^(data:|blob:)/.test(req.url())) report.external.push(new URL(req.url()).origin); });
            await page.goto(base + '/cache-fixture');
            await page.evaluate(async () => {
                await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
                if (!navigator.serviceWorker.controller) await new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
            });
            const depart = async ({ offline = false } = {}) => {
                await page.locator('[data-camp=prepare]').tap(); await page.locator('[data-camp=depart]').tap();
                await page.locator('.camp-return').waitFor(); await page.locator('#loading-overlay').waitFor({ state: 'hidden' });
                // Offline SW version probes can remain pending in Playwright's
                // network counter; actual world readiness is asserted above/below.
                if (!offline) await page.waitForLoadState('networkidle');
                await page.waitForTimeout(300);
                assert.equal(await page.evaluate(() => game.localPlayer.classId), id);
            };
            phase = `${id}:cold`;
            await page.goto(base + '/?local=1'); await page.locator('#camp-name').fill('캐시 계측');
            await page.locator('[data-camp=create]').tap(); await page.locator('[data-camp=character]').first().waitFor();
            await page.evaluate(async id => {
                const n = game.net, p = await n.getPlayerProfile(n.playerId);
                await n.savePlayerData(n.playerId, { ...p, activeClassId: id, questData: { ...p.questData, prologueCompleted: true, basicTrainingCompleted: true } });
            }, id);
            // Apply the local profile choice in the real camp; no extra page load.
            await page.evaluate(async id => { await game.sceneManager.currentScene.selectClass(id); }, id);
            await depart();
            phase = `${id}:warm`;
            await page.reload(); await page.locator('[data-camp=character]').first().waitFor(); await depart();
            summarize(); assert.equal(report.phases.find(r => r.phase === phase).immutableImageBytes, 0, phase);
            phase = `${id}:update`; release = '99.0.0';
            await page.evaluate(async () => {
                const registration = await navigator.serviceWorker.getRegistration();
                const changed = new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
                await registration.update(); await changed;
            });
            await page.reload(); await page.locator('[data-camp=character]').first().waitFor(); await depart();
            assert.ok(await page.evaluate(() => caches.has('yurika-online-immutable-v1')));
            summarize(); assert.equal(report.phases.find(r => r.phase === phase).immutableImageBytes, 0, phase);
            if (id === 'wizard') {
                phase = 'wizard:offline'; const beforeOffline = rows.length;
                await context.setOffline(true); await page.reload();
                await page.locator('[data-camp=character]').first().waitFor(); await depart({ offline: true });
                assert.equal(rows.length, beforeOffline, 'offline reentry must use cached shell/assets');
                report.offlineReentry = 'passed'; await context.setOffline(false);
            }
            await context.close(); console.log(`PASS ${id}: cold/warm/update measured; unchanged immutable image bodies warm=0, update=0`);
        }
        assert.deepEqual(report.external, []); report.status = 'passed';
    } finally {
        summarize(); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
        fs.writeFileSync(`${out}/requests.json`, JSON.stringify(rows, null, 2));
        await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r));
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
