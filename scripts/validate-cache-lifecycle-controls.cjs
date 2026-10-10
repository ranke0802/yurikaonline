require('./lib/qa-preflight.cjs');
const { runCacheLifecycle, WITCH_PORTRAIT } = require('./validate-cache-lifecycle-browser.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
(async () => {
    const root = process.env.QA_OUTPUT || '/tmp/yurika-cache-lifecycle';
    const delayed = await runCacheLifecycle({ classes: ['witch'], portraitDelayMs: 6000, out: path.join(root, 'delayed-portrait') });
    assert.equal(delayed.status, 'passed');
    for (const name of ['witch:warm','witch:update']) assert.equal(delayed.phases.find(p => p.phase === name).immutableImageBytes, 0);
    const out = path.join(root, 'evicted-portrait'); let failed = false;
    try { await runCacheLifecycle({ classes: ['witch'], evictPortraitBeforeWarm: true, out }); }
    catch (error) { assert.equal(error.code, 'ERR_ASSERTION'); assert.match(error.message, /witch:warm/); failed = true; }
    assert.ok(failed, 'Deleting a cached image must still fail the zero-body check');
    const report = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'));
    assert.equal(report.status, 'failed');
    assert.ok(report.unexpectedImages.some(r => r.path === WITCH_PORTRAIT && r.bytes === 849188 && r.cachedAtColdEnd && r.earlierResponses.some(p => p.finishedAt)));
    fs.writeFileSync(path.join(root, 'controls-summary.json'), JSON.stringify({ status: 'passed', delayedPortrait: 'warm/update bodies zero', eviction: 'expected zero-body assertion failure', evictedPath: WITCH_PORTRAIT, rejectedBodyBytes: 849188 }, null, 2));
    console.log('PASS controls: delayed first portrait waits for cache; real 849188-byte re-download is rejected');
})().catch(error => { console.error(error); process.exitCode = 1; });
