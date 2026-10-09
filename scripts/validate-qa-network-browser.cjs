const policy = require('./lib/qa-preflight.cjs');
const { chromium, request } = require('playwright');
const assert = require('node:assert/strict'), http = require('node:http');
(async () => {
    let cachedRequests = 0, redirectTargets = 0;
    const server = http.createServer((req, res) => {
        if (req.url === '/cached.js') { cachedRequests++; res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'public,max-age=31536000,immutable' }); res.end('window.cacheFixture=true'); }
        else if (req.url === '/redirect') { res.writeHead(302, { Location: '/redirect-target' }); res.end(); }
        else if (req.url === '/redirect-target') { redirectTargets++; res.end('wrong'); }
        else if (req.url === '/remote-redirect') { res.writeHead(302, { Location: 'https://example.invalid/' }); res.end(); }
        else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><script src="/cached.js"></script>'); }
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    let browser;
    try {
        assert.throws(() => fetch('https://example.invalid'), /QA_NETWORK_POLICY/);
        assert.throws(() => http.get('http://example.invalid'), /QA_NETWORK_POLICY/);
        assert.throws(() => http.request(base, { hostname: 'example.invalid' }), /QA_NETWORK_POLICY/);
        await assert.rejects(fetch(base + '/redirect')); assert.equal(redirectTargets, 0);
        browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
        const context = await browser.newContext(), page = await context.newPage();
        await page.goto(base); await page.waitForFunction(() => window.cacheFixture === true);
        await page.goto(base + '/next'); await page.waitForFunction(() => window.cacheFixture === true);
        assert.equal(cachedRequests, 1, 'deny proxy must preserve normal HTTP cache; no route interception');
        assert.throws(() => page.goto('https://example.invalid'), /QA_NETWORK_POLICY/);
        const before = policy.blockedProxyRequests;
        const blocked = await page.evaluate(async () => {
            try { await fetch('https://example.invalid/unreachable', { mode: 'no-cors' }); return false; } catch { return true; }
        });
        assert.equal(blocked, true); assert.ok(policy.blockedProxyRequests > before, 'browser subresource stopped at localhost proxy');
        await assert.rejects(page.goto(base + '/remote-redirect'));
        const api = await request.newContext();
        await assert.rejects(api.get('http://example.invalid/'), /QA_NETWORK_POLICY/); await api.dispose();
        await assert.rejects(chromium.launch({ proxy: { server: base } }), /QA_NETWORK_POLICY/);
        console.log('PASS remote URL/Node options/redirect/browser subresource/API proxy blocks; normal localhost HTTP cache preserved');
    } finally { await browser?.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
