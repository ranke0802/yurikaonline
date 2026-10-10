const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const { assertLoopbackUrl, assertLocalQaEnvironment, releasePolicy } = require('./lib/qa-network-policy.cjs');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(x => x.isDirectory() ? walk(path.join(dir, x.name)) : [path.join(dir, x.name)]); }
test('QA origins fail closed; remote release needs explicit origin, approval and budgets', () => {
    for (const url of ['http://localhost:8100', 'http://127.0.0.1:1', 'http://[::1]:8100']) assertLoopbackUrl(url);
    for (const url of ['https://example.invalid', 'https://yurika-online.web.app/?local=1', 'http://localhost.example.invalid', 'file:///tmp/file', 'http://name@localhost']) assert.throws(() => assertLoopbackUrl(url), /QA_NETWORK_POLICY/);
    assert.throws(() => assertLocalQaEnvironment({ QA_URL: 'https://example.invalid' }), /QA_NETWORK_POLICY/);
    assert.throws(() => assertLocalQaEnvironment({ FIREBASE_AUTH_EMULATOR_HOST: 'example.invalid:9099' }), /QA_NETWORK_POLICY/);
    assert.equal(releasePolicy({}).remote, false);
    const remote = { YURIKA_RELEASE_ORIGIN: 'https://yurika-online.web.app', YURIKA_REMOTE_CHECK_APPROVED: '1', YURIKA_RELEASE_MAX_REQUESTS: '8', YURIKA_RELEASE_MAX_BYTES: '200000' };
    assert.equal(releasePolicy(remote).maxBytes, 200000);
    for (const change of [{ YURIKA_REMOTE_CHECK_APPROVED: '' }, { YURIKA_RELEASE_MAX_BYTES: '' }, { YURIKA_RELEASE_MAX_BYTES: '524289' }, { YURIKA_RELEASE_MAX_REQUESTS: '9' }, { YURIKA_RELEASE_ORIGIN: 'https://example.invalid' }]) assert.throws(() => releasePolicy({ ...remote, ...change }));
});
test('every browser/network QA entry imports preflight first and rejects remote URL before work', () => {
    const files = walk('scripts').filter(p => /\.(cjs|mjs|js)$/.test(p) && !p.includes('scripts/lib/') && !/validate-(qa-policy|release-budget)/.test(p) && !p.endsWith('verify-hosting-release.mjs'));
    let count = 0;
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        if (!/(?:qa-preflight\.cjs|require\(['"](?:@playwright\/test|playwright|node:http|node:https|undici|ws)['"]\)|from ['"](?:playwright|node:http|node:https|undici|ws)['"]|\bfetch\s*\(|process\.env\.QA_\w*URL)/.test(source)) continue;
        const first = source.replace(/^#![^\n]*\n/, '').split('\n')[0];
        assert.match(first, /(?:require\(|import )['"].*qa-preflight\.cjs['"]/, file);
        const result = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 5000, env: { ...process.env, QA_BASE_URL: 'https://example.invalid', QA_URL: 'https://example.invalid' } });
        assert.equal(result.status, 1, `${file}: must fail before work`); assert.match(result.stderr, /QA_NETWORK_POLICY/, file); count++;
    }
    assert.ok(count >= 75, `coverage unexpectedly fell to ${count}`);
    console.log(`Guarded ${count} network QA entry scripts`);
});
test('workflows retain local coverage and only allow a single budgeted postdeploy command', () => {
    const workflow = fs.readFileSync('.github/workflows/firebase-hosting-merge.yml', 'utf8');
    assert.doesNotMatch(workflow, /QA_(?:BASE_)?URL[=:]\s*https:/);
    const after = workflow.split('uses: FirebaseExtended/action-hosting-deploy@v0')[1];
    assert.equal((after.match(/run:/g) || []).length, 1);
    assert.match(after, /run: node scripts\/verify-hosting-release\.mjs/);
    assert.match(after, /YURIKA_RELEASE_MAX_REQUESTS: '8'/); assert.match(after, /YURIKA_RELEASE_MAX_BYTES: '200000'/);
    const before = workflow.split('uses: FirebaseExtended/action-hosting-deploy@v0')[0];
    assert.match(before, /if: failure\(\)\s+uses: actions\/upload-artifact@v4/);
    assert.match(before, /path: \/tmp\/yurika-cache-lifecycle\/\*\*\/\*\.json/);
    for (const name of ['validate:qa-policy', 'validate:cache-lifecycle', 'validate:qa-network-browser', 'validate:asset-browser', 'validate-field-clarity-browser.cjs']) {
        if (name === 'validate-field-clarity-browser.cjs') assert.match(workflow, /npm run validate:field-clarity-browser/);
        else assert.ok(workflow.includes(name), name);
    }
    const verifier = fs.readFileSync('scripts/verify-hosting-release.mjs', 'utf8');
    assert.doesNotMatch(verifier, /\bfetch\(|attempt|setTimeout/); assert.match(verifier, /createBoundedClient/);
});
test('shipped asset signatures are WebP with explicit PWA PNG and existing emote SVG exceptions', async () => {
    const { default: assets } = await import('../src/js/core/AssetManifest.js');
    const png = new Set(), svg = new Set();
    for (const [source, target] of Object.entries(assets)) {
        const bytes = fs.readFileSync('.' + target);
        if (target.endsWith('.webp')) { assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', target); assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', target); }
        else if (target.endsWith('.png')) { assert.match(source, /^\/assets\/resource\/pwa-emblem\/(icon-(?:maskable-)?(?:192|512)|apple-touch-icon|favicon-(?:32|48))\.png$/); assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); png.add(target); }
        else if (target.endsWith('.svg')) { assert.match(source, /^\/assets\/ui\/emotes\/(?:angry|cry|love|smile)\.svg$/); assert.match(bytes.toString(), /<svg/); svg.add(target); }
        else assert.ok(target.endsWith('.json'), target);
    }
    assert.equal(png.size, 7); assert.equal(svg.size, 4);
});
