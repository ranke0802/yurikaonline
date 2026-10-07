const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const out = process.env.QA_OUTPUT || '/tmp/yurika-hud-input-v174';
fs.mkdirSync(out, { recursive: true });
const report = { scope: 'Loopback local profiles, actual touch events, deterministic hold boundaries; no live accounts', cases: [], errors: [], external: [] };

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    try {
        for (const [name, width, height] of [['portrait', 393, 852], ['landscape', 780, 360]]) {
            const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
            const page = await context.newPage();
            page.on('pageerror', error => report.errors.push(error.message));
            await page.route('**/*', route => {
                if (new URL(route.request().url()).origin === 'http://127.0.0.1:8100') return route.continue();
                report.external.push(route.request().url()); return route.abort();
            });
            await page.goto('http://127.0.0.1:8100/?local=1');
            await page.locator('#camp-name').fill('위치 터치 확인');
            await page.locator('[data-camp=create]').tap();
            await page.locator('[data-camp=character]').first().waitFor();
            await page.evaluate(async () => {
                const n = game.net, p = await n.getPlayerProfile(n.playerId);
                await n.savePlayerData(n.playerId, { ...p, activeClassId: 'witch', questData: { ...p.questData, basicTrainingCompleted: true, prologueCompleted: true } });
            });
            await page.reload();
            await page.locator('[data-camp=prepare]').tap();
            await page.locator('[data-camp=depart]').tap();
            await page.locator('.camp-return').waitFor();
            await page.locator('#loading-overlay').waitFor({ state: 'hidden' });
            await page.waitForFunction(() => game.localPlayer.classCombat?.images.authored);
            await page.evaluate(() => {
                game.loop.stop();
                const p = game.localPlayer, b = p.classCombat, c = b.controller;
                const basic = b.basic.bind(b);
                window.qa = { calls: [] };
                b.basic = options => { const result = basic(options); qa.calls.push({ ...options, result }); return result; };
                qa.reset = () => {
                    game.touch.resetState(); p.classAim = null;
                    p.hp = p.maxHp; p.isDead = p.isDying = false;
                    p.skillCooldowns = { j: 0, h: 0, u: 0, k: 0 };
                    c.basicReady = c.time; c.projectiles = []; c.tasks = [];
                    b.effects = []; b.motion = null; qa.calls = [];
                    game.ui.updateCooldowns();
                };
                qa.inspect = () => {
                    game.ui.updateStats(100 * p.hp / p.maxHp, 100 * p.mp / p.maxMp, p.level, 0);
                    game.ui.updateCooldowns();
                    const guide = p.getClassAimGuide();
                    game.sceneManager.render(game.ctx);
                    const labels = [...document.querySelectorAll('.skill-unavailable-reason')].map(e => ({ text: e.textContent, hidden: e.hidden }));
                    return { guide, elapsed: p.classAim?.elapsed, calls: qa.calls, projectiles: c.projectiles.map(x => ({ homing: !!x.homing, speed: x.speed })), labels };
                };
            });
            const cdp = await context.newCDPSession(page);
            const box = await page.locator('#action-attack-j').boundingBox();
            const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
            const touch = (type, points = []) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });

            for (const elapsed of [0, .1, .499, .5, .501, .8]) {
                await page.evaluate(() => qa.reset());
                await touch('touchStart', [point]);
                await page.waitForFunction(() => game.localPlayer.classAim?.action === 'ATTACK');
                await touch('touchMove', [{ ...point, x: point.x - 40, y: point.y - 15 }]);
                await page.evaluate(elapsed => { game.localPlayer.classAim.elapsed = elapsed; }, elapsed);
                const held = await page.evaluate(() => qa.inspect());
                assert.equal(!!held.guide, elapsed >= .5, `${name}: ${elapsed}s preview`);
                assert.equal(held.calls.length, 0, 'pressing/preview must not fire');
                assert.ok(held.labels.every(x => x.hidden || !x.text.includes('조준 중')));
                assert.equal(await page.locator('#action-attack-j .skill-unavailable-reason').isHidden(), true);
                if (elapsed === .499 || elapsed === .5) await page.screenshot({ path: `${out}/${name}-${elapsed < .5 ? 'tap-no-path' : 'hold-path'}.png` });
                await touch('touchEnd');
                const released = await page.evaluate(() => qa.inspect());
                assert.equal(released.guide, null);
                assert.equal(released.calls.length, 1); assert.equal(released.calls[0].result, true);
                assert.equal(released.calls[0].aimed, elapsed >= .5);
                assert.equal(released.projectiles.length, 1);
                assert.equal(released.projectiles[0].homing, elapsed < .5);
                assert.equal(released.projectiles[0].speed, 180);
                report.cases.push({ name, elapsed, preview: !!held.guide, release: released.calls[0], projectile: released.projectiles[0] });
            }

            for (const elapsed of [.2, .6]) {
                await page.evaluate(() => qa.reset());
                await touch('touchStart', [point]);
                await page.evaluate(elapsed => { game.localPlayer.classAim.elapsed = elapsed; }, elapsed);
                await touch('touchCancel');
                const canceled = await page.evaluate(() => qa.inspect());
                assert.equal(canceled.guide, null); assert.equal(canceled.calls.length, 0); assert.equal(canceled.projectiles.length, 0);
                await touch('touchStart', [point]);
                const next = await page.evaluate(() => qa.inspect());
                assert.equal(next.elapsed, 0); assert.equal(next.guide, null);
                await touch('touchEnd');
                assert.equal(await page.evaluate(() => qa.calls[0].aimed), false);
                report.cases.push({ name, canceledAt: elapsed, nextTouchStartsFresh: true });
            }

            await page.evaluate(() => qa.reset());
            for (let i = 0; i < 5; i++) { await touch('touchStart', [point]); await touch('touchEnd'); }
            const spam = await page.evaluate(() => qa.inspect());
            assert.equal(spam.calls.length, 5); assert.equal(spam.calls.filter(x => x.result).length, 1);
            assert.equal(spam.projectiles.length, 1); assert.ok(spam.calls.every(x => !x.aimed));
            report.cases.push({ name, repeatedTaps: 5, acceptedInOneSlot: 1 });
            await context.close();
        }
        assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []);
        console.log(JSON.stringify({ cases: report.cases.length, errors: report.errors, external: report.external }));
    } finally {
        fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
