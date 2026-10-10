require('./lib/qa-preflight.cjs');
const { runCacheLifecycle, WITCH_PORTRAIT } = require('./validate-cache-lifecycle-browser.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
(async () => {
    const root = process.env.QA_OUTPUT || '/tmp/yurika-cache-lifecycle';
    const creationOut = path.join(root, 'delayed-creation');
    const creation = await runCacheLifecycle({ classes: ['archer'], profilePreparationDelayMs: 1000, out: creationOut });
    assert.equal(creation.status, 'passed');
    for (const name of ['archer:warm','archer:update']) assert.equal(creation.phases.find(p => p.phase === name).immutableImageBytes, 0);
    const events = JSON.parse(fs.readFileSync(path.join(creationOut, 'events.json'), 'utf8'));
    const delay = events.find(e => e.event === 'creation-delay-fixture');
    const before = events.find(e => e.event === 'before-class-selection'), selected = events.find(e => e.event === 'after-class-selection');
    assert.equal(delay.busy, true); assert.equal(delay.hasPreparation, false);
    assert.ok(delay.releasedAt - delay.startedAt >= 1000);
    assert.ok(before.observedAt >= delay.releasedAt && before.hasPreparation && !before.busy && !before.classSelectionOperation);
    assert.equal(selected.playerClassId, 'archer'); assert.equal(selected.storedClassId, 'archer');
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
    fs.writeFileSync(path.join(root, 'controls-summary.json'), JSON.stringify({ status: 'passed', delayedCreation: 'selection waits for real preparation; archer warm/update bodies zero', delayedPortrait: 'warm/update bodies zero', eviction: 'expected zero-body assertion failure', evictedPath: WITCH_PORTRAIT, rejectedBodyBytes: 849188 }, null, 2));
    console.log('PASS controls: delayed creation/portrait wait for readiness; real 849188-byte re-download is rejected');
})().catch(error => { console.error(error); process.exitCode = 1; });
