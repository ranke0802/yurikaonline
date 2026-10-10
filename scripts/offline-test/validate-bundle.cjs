require('../lib/qa-preflight.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:8183', out = process.env.QA_OUTPUT || '/tmp/yurika-offline-qa';
fs.mkdirSync(out, { recursive: true });
const report = { origin: base, classes: [], externalRequests: [], pageErrors: [], unavailablePaths: [], networkGuards: {} };
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    try {
        for (const id of ['wizard', 'witch', 'warrior', 'archer']) {
            const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow' });
            const page = await context.newPage(); page.setDefaultTimeout(20000);
            context.on('request', request => { if (new URL(request.url()).origin !== base) report.externalRequests.push(new URL(request.url()).origin); });
            page.on('pageerror', error => report.pageErrors.push(error.message));
            const response = await page.goto(base + '/?local=0');
            assert.match(response.headers()['content-security-policy'], /connect-src 'self'/);
            await page.locator('#camp-name').fill('오프라인 테스트'); await page.locator('[data-camp=create]').click();
            await page.waitForFunction(() => window.game?.sceneManager.currentScene?.preparation && !game.sceneManager.currentScene.busy);
            assert.equal(await page.evaluate(() => game.isLocalMode && game.net.isLocal && typeof window.firebase === 'undefined'), true);
            await page.locator('[data-camp=character]').first().click();
            if (id !== 'wizard') await page.locator(`[data-camp="select-class:${id}"]`).click();
            await page.waitForFunction(id => game.localPlayer.classId === id && !game.sceneManager.currentScene.busy, id);
            await page.locator('[data-camp=inventory]').click();
            await page.locator('#inventory-popup').waitFor({ state: 'visible' });
            await page.locator('#inventory-popup .close-btn-bottom').click();
            await page.locator('[data-camp=camp]').first().click();
            await page.locator('[data-camp=prepare]').click(); await page.locator('[data-camp=depart]').click();
            await page.waitForFunction(() => game.ui.isWorldSceneActive() && game.tutorial.getCurrentStep()?.id === 'move_check');
            const start = await page.evaluate(() => ({ x: game.localPlayer.x, y: game.localPlayer.y }));
            let moved = false, strokes = 0;
            while (await page.evaluate(() => game.tutorial.getCurrentStep()?.id === 'move_check') && strokes < 30) {
                const key = strokes++ % 2 ? 'a' : 'd';
                await page.keyboard.down(key); await page.waitForTimeout(200); await page.keyboard.up(key);
                moved ||= await page.evaluate(start => Math.hypot(game.localPlayer.x-start.x, game.localPlayer.y-start.y) > 1, start);
                await page.waitForTimeout(80);
            }
            assert.ok(moved); assert.equal(await page.evaluate(() => game.tutorial.getCurrentStep()?.id), 'attack_dummy');
            let attacks = 0;
            while (await page.evaluate(() => game.tutorial.getCurrentStep()?.id === 'attack_dummy') && attacks < 30) {
                await page.keyboard.press('j'); attacks++; await page.waitForTimeout(650);
            }
            assert.equal(await page.evaluate(() => game.tutorial.getCurrentStep()?.id), 'open_status', id + ': actual short press/release must defeat dummy');
            await page.locator('#btn-status').click(); await page.locator('#status-popup').waitFor({ state: 'visible' });
            await page.screenshot({ path: `${out}/${id}-manual-controls.png` });
            const saved = await page.evaluate(async () => {
                const result = await game.requestLifecycleProfileSave('offline_bundle_verification', { force: true, minIntervalMs: 0 });
                return { ok: result?.ok !== false, newKey: !!localStorage.getItem('yurika.offline.e344562.profile.v1'), originalKey: localStorage.getItem('yurika.local.profile.v1') };
            });
            assert.equal(saved.ok, true); assert.equal(saved.newKey, true); assert.equal(saved.originalKey, null);
            await page.reload();
            await page.waitForFunction(id => window.game?.sceneManager.currentScene?.preparation && !game.sceneManager.currentScene.busy && game.localPlayer.classId === id, id);
            assert.equal(await page.evaluate(() => navigator.serviceWorker.controller), null);
            assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
            await page.evaluate(() => document.fonts.ready);
            assert.equal(await page.evaluate(() => document.fonts.check('16px "Yurika Offline Sans"')), true);
            report.classes.push({ id, realMovement: true, realAttackCompletedDummy: true, attacks, campInventory: true, fieldStatus: true, reloadRetainsClass: true, isolatedLocalSave: true });
            if (id === 'wizard') {
                report.networkGuards = await page.evaluate(async () => {
                    let fetchBlocked=false, xhrBlocked=false, socketBlocked=false;
                    try { await fetch('https://example.invalid/offline-probe'); } catch { fetchBlocked=true; }
                    try { new XMLHttpRequest().open('GET', 'https://example.invalid/offline-probe'); } catch { xhrBlocked=true; }
                    try { new WebSocket('wss://example.invalid/offline-probe'); } catch { socketBlocked=true; }
                    return { fetchBlocked, xhrBlocked, socketBlocked, beaconBlocked: navigator.sendBeacon('https://example.invalid/offline-probe', '') === false, popupBlocked: window.open('https://example.invalid/') === null };
                });
                assert.ok(Object.values(report.networkGuards).every(Boolean));
                for (const path of ['/.git/config','/node_modules/playwright/package.json','/src/js/firebaseConfig.js','/database.rules.json','/firebase.json','/serve.py','/assets/','/party-rpg-concept/assets/idle-witch.webp','/sw.js']) {
                    const response = await context.request.get(base + path); assert.equal(response.status(), 404); report.unavailablePaths.push(path);
                }
            }
            await context.close(); console.log(`PASS ${id}: manual start/movement/attack/menu, local save and reload`);
        }
        assert.deepEqual(report.externalRequests, []); assert.deepEqual(report.pageErrors, []); report.status = 'passed';
    } catch (error) { report.status='failed'; report.error=error.message; throw error; }
    finally { fs.writeFileSync(`${out}/bundle-report.json`, JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
