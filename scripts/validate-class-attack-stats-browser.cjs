const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8100';
const OUT = process.env.QA_OUTPUT || '/tmp/yurika-class-attack-stats';
fs.mkdirSync(OUT, { recursive: true });
const report = { scope: 'Isolated local profiles, real stat buttons/confirmation, camp reload and field entry; no production services', cases: [], errors: [] };
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    try {
        for (const mobile of [false, true]) for (const classId of ['wizard', 'witch', 'warrior', 'archer']) {
            const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
            const page = await context.newPage();
            page.setDefaultTimeout(20000);
            page.on('pageerror', error => report.errors.push(error.message));
            await page.route('**/*', route => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort());
            await page.goto(BASE + '/?local=1');
            await page.locator('#camp-name').fill('스탯 검증');
            await page.locator('[data-camp=create]').click();
            await page.locator('[data-camp=character]').first().waitFor();
            await page.evaluate(async id => {
                const n = game.net, account = await n.getPlayerProfile(n.playerId);
                const weapon = game.itemData.createRewardItem(id === 'wizard' ? 'magic_staff' : `magic_${id}`, { enhancementLevel: 2 });
                const stats = { vitality: 8, intelligence: 10, wisdom: 2, agility: 7, statPoints: 20, equipment: { weapon } };
                const profile = { ...account, activeClassId: id, questData: { ...account.questData, basicTrainingCompleted: true, prologueCompleted: true } };
                if (id === 'wizard') Object.assign(profile, stats);
                else profile.classProfiles = { ...account.classProfiles, [id]: stats };
                const result = await n.savePlayerData(n.playerId, profile);
                if (result?.ok === false) throw new Error('Local fixture save failed');
            }, classId);
            await page.reload();
            await page.waitForFunction(id => game.localPlayer?.classId === id, classId);
            await page.waitForFunction(() => !game.sceneManager.currentScene.busy);
            await page.locator('[data-camp=character]').first().click();
            await page.locator('[data-camp=stats]').click();
            const read = () => page.evaluate(() => ({ attack: game.localPlayer.attackPower, shown: parseInt(document.getElementById('val-atk').textContent, 10), equipment: document.querySelector('#val-atk .stat-equip-bonus')?.textContent, highlighted: !!document.querySelector('#val-atk .stat-predict-inc'), points: game.localPlayer.statPoints, pending: { ...game.ui.pendingStats } }));
            const press = selector => mobile ? page.locator(selector).tap() : page.locator(selector).click();
            const up = stat => press(`.stat-up-btn[data-stat="${stat}"]`);
            const down = stat => press(`.stat-down-btn[data-stat="${stat}"]`);
            const before = await read();
            const expected = { wizard: 25, witch: 27, warrior: 27, archer: 24 }[classId];
            assert.equal(before.attack, expected); assert.equal(before.shown, expected); assert.equal(before.equipment, '+9');
            const magic = ['wizard', 'witch'].includes(classId);
            const primary = magic ? 'intelligence' : classId === 'warrior' ? 'vitality' : 'agility';
            for (const stat of ['vitality', 'intelligence', 'wisdom', 'agility']) {
                await up(stat);
                const preview = await read(), delta = stat === primary ? 1 : 0;
                assert.equal(preview.attack, expected); assert.equal(preview.shown, expected + delta);
                assert.equal(preview.highlighted, delta > 0); assert.equal(preview.equipment, '+9');
                await down(stat); assert.deepEqual(await read(), before);
            }
            await up('wisdom'); assert.equal((await read()).shown, expected);
            await up('wisdom'); assert.equal((await read()).shown, expected + Number(magic));
            await up(primary);
            const preview = await read();
            assert.equal(preview.shown, expected + 1 + Number(magic));
            await press('#status-close-btn-bottom');
            await press('#confirm-no');
            assert.deepEqual(await read(), preview, 'declining confirmation preserves uncommitted preview');
            await press('#status-close-btn-bottom');
            await press('#confirm-yes');
            await page.locator('#status-popup').waitFor({ state: 'hidden' });
            await page.waitForFunction(() => !game.sceneManager.currentScene.preparation?.pending);
            await page.reload();
            await page.waitForFunction(id => game.localPlayer?.classId === id, classId);
            await page.waitForFunction(() => !game.sceneManager.currentScene.busy);
            await page.locator('[data-camp=character]').first().click();
            await page.locator('[data-camp=stats]').click();
            const loaded = await read();
            assert.equal(loaded.attack, preview.shown); assert.equal(loaded.shown, preview.shown);
            assert.equal(loaded.points, 17); assert.equal(loaded.equipment, '+9');
            assert.equal(Object.values(loaded.pending).reduce((a, b) => a + b, 0), 0);
            await press('#status-close-btn-bottom');
            await page.locator('[data-camp=depart]').click();
            await page.locator('[data-camp=depart]').click();
            await page.waitForFunction(id => game.localPlayer?.classId === id && game.localPlayer.net === game.net, classId);
            await page.locator('#loading-overlay').waitFor({ state: 'hidden' });
            assert.equal(await page.evaluate(() => game.localPlayer.attackPower), loaded.attack, 'field load agrees with camp/status');
            report.cases.push({ classId, mobile, before, preview, loaded });
            console.log(`PASS ${classId} ${mobile ? 'mobile' : 'desktop'}`);
            await context.close();
        }
        assert.deepEqual(report.errors, []);
        console.log(`PASS ${report.cases.length} class/layout cases: preview, refund, confirmation, reload and field attack`);
    } finally {
        fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
