require('./lib/qa-preflight.cjs');
// Fresh local profiles, genuine keyboard/touch input, no tutorial-step shortcuts.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:8100';
const out = process.env.QA_OUTPUT || '/tmp/yurika-gameplay-entry';
fs.mkdirSync(out, { recursive: true });
const report = { origin:base, scope:'Fresh local profiles; real short-burst movement, complete tutorial, menu input and camp roundtrip', cases:[], errors:[], external:[] };
(async () => {
    const browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox'] });
    try {
        for (const [layout,width,height,mobile] of [['desktop',1280,800,false],['portrait',393,852,true],['landscape',852,393,true]]) {
            const context = await browser.newContext({ viewport:{width,height}, isMobile:mobile, hasTouch:mobile, serviceWorkers:'block' });
            await context.route('**/*', route => {
                if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
                report.external.push(route.request().url()); return route.abort();
            });
            const page = await context.newPage(); page.setDefaultTimeout(15000);
            page.on('pageerror', error => report.errors.push({layout,message:error.message}));
            const cdp = await context.newCDPSession(page);
            const touch = (type,points=[]) => cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
            const step = () => page.evaluate(() => game.tutorial.getCurrentStep()?.id);
            const movement = () => page.evaluate(() => ({x:game.localPlayer.x,y:game.localPlayer.y,count:game.tutorial.progress.count,step:game.tutorial.getCurrentStep()?.id,hud:document.getElementById('active-quest-reward').textContent}));
            const depart = async () => {
                await page.locator('[data-camp=prepare]').click(); await page.locator('[data-camp=depart]').click();
                await page.waitForFunction(() => game.localPlayer && game.ui.isWorldSceneActive());
            };
            await page.goto(base+'/?local=1');
            await page.locator('#camp-name').fill('첫 모험 검증'); await page.locator('[data-camp=create]').click();
            await depart(); await page.waitForFunction(() => game.tutorial.getCurrentStep()?.id==='move_check');
            const start = await movement();
            // Every stroke ends before the 0.5s run threshold. Alternate direction
            // to keep the genuine tutorial target within view after movement.
            const burst = async index => {
                const key = index % 2 ? 'a' : 'd';
                if (mobile) {
                    const p={x:85,y:height-(width>height?100:230)};
                    await touch('touchStart',[p]); await touch('touchMove',[{...p,x:p.x+(index%2?-30:30)}]);
                } else await page.keyboard.down(key);
                try { await page.waitForTimeout(200); }
                finally { if(mobile)await touch('touchEnd');else await page.keyboard.up(key); }
                await page.waitForTimeout(80);
            };
            await burst(0);
            const partial = await movement();
            assert.ok(Math.hypot(partial.x-start.x,partial.y-start.y)>1,`${layout}: short stroke moves character`);
            assert.equal(partial.step,'move_check');
            assert.ok(partial.count>0 && partial.count<36,`${layout}: walking counts before running`);
            assert.ok(partial.hud.includes(`진행도 ${partial.count}/36`),`${layout}: displayed progress matches movement`);
            await page.screenshot({path:`${out}/${layout}-movement-progress.png`});
            await page.waitForTimeout(200);
            assert.equal((await movement()).count,partial.count,'stationary frames do not advance movement');
            let strokes=1;
            while (await step()==='move_check' && strokes<30) await burst(strokes++);
            assert.equal(await step(),'attack_dummy',`${layout}: short strokes complete movement`);
            if (mobile) {
                const b=await page.locator('#action-attack-j').boundingBox();
                await touch('touchStart',[{x:b.x+b.width/2,y:b.y+b.height/2}]);
            } else await page.keyboard.down('j');
            try { await page.waitForFunction(() => game.tutorial.getCurrentStep()?.id==='open_status'); }
            finally { if(mobile)await touch('touchEnd');else await page.keyboard.up('j'); }
            await page.locator('#btn-status').click();
            const pointsBeforePreview = await page.evaluate(() => game.localPlayer.statPoints);
            await page.locator('.stat-up-btn[data-stat=intelligence]').click();
            const preview = await page.evaluate(() => ({int:game.localPlayer.intelligence,points:game.localPlayer.statPoints,pending:game.ui.pendingStats.intelligence}));
            if (!mobile) {
                await page.keyboard.down('i'); await page.keyboard.down('i'); await page.keyboard.up('i');
            } else await page.locator('#status-close-btn-bottom').click();
            await page.locator('#confirm-no').waitFor();
            await page.keyboard.press('i'); // Nested confirmation owns input.
            assert.equal(await page.locator('#confirm-no').isVisible(),true);
            await page.keyboard.press('Escape');
            assert.deepEqual(await page.evaluate(() => ({int:game.localPlayer.intelligence,points:game.localPlayer.statPoints,pending:game.ui.pendingStats.intelligence})),preview);
            await page.screenshot({path:`${out}/${layout}-stat-cancel.png`});
            await page.locator('#status-close-btn-bottom').click(); await page.locator('#confirm-yes').click();
            await page.locator('#btn-skill').click();
            if (!mobile) { await page.keyboard.press('Shift+s'); assert.equal(await page.locator('#skill-popup').isVisible(),true,'required tutorial detail step stays open'); }
            await page.locator('#skill-item-laser .skill-icon').click(); await page.locator('#skill-detail-modal-close').click();
            await page.locator('.skill-up-btn[data-skill=laser]').click(); await page.locator('#btn-inventory').click();
            if (mobile) await page.locator('#inventory-popup .close-btn-bottom').click();
            else await page.keyboard.press('b');
            await page.waitForFunction(() => !game.tutorial.activeTutorial);
            const complete = await page.evaluate(() => ({int:game.localPlayer.intelligence,points:game.localPlayer.statPoints,laser:game.localPlayer.skillLevels.laser,complete:game.localPlayer.questData.basicTrainingCompleted}));
            assert.deepEqual(complete,{int:preview.int+1,points:pointsBeforePreview-1,laser:2,complete:true});
            if (!mobile) {
                for (const [key,id] of [['b','inventory-popup'],['i','status-popup'],['Shift+s','skill-popup']]) {
                    await page.keyboard.press(key); assert.equal(await page.locator('#'+id).isVisible(),true);
                    const pos=await page.evaluate(() => ({x:game.localPlayer.x,y:game.localPlayer.y,mp:game.localPlayer.mp}));
                    await page.keyboard.down('d'); await page.keyboard.down('j'); await page.waitForTimeout(150);
                    await page.keyboard.up('d'); await page.keyboard.up('j');
                    const after=await page.evaluate(() => ({x:game.localPlayer.x,y:game.localPlayer.y,actions:[...game.input.actions]}));
                    assert.equal(after.x,pos.x);assert.equal(after.y,pos.y);assert.deepEqual(after.actions,[],'combat remains blocked inside menus');
                    await page.keyboard.press(key); assert.equal(await page.locator('#'+id).isVisible(),false,`${key} toggles same popup closed`);
                }
                await page.keyboard.press('i'); await page.locator('#player-name-edit-btn').click();
                const input=page.locator('#status-popup input:visible').first();await input.fill('입력');await input.press('i');
                assert.equal(await page.locator('#status-popup').isVisible(),true,'typing does not close status');
                await page.keyboard.press('Escape');
                await page.keyboard.press('b');await page.keyboard.press('Control+b');
                assert.equal(await page.locator('#inventory-popup').isVisible(),true,'browser modifier does not close menu');
                await page.keyboard.press('b');
                await page.keyboard.down('b');await page.keyboard.down('b');
                assert.equal(await page.locator('#inventory-popup').isVisible(),true,'repeat does not toggle menu');
                await page.keyboard.up('b');await page.keyboard.press('b');
                await page.evaluate(() => game.ui.updateSetting('desktopShortcutHints',false));
                await page.keyboard.press('b');await page.keyboard.press('b');
                assert.equal(await page.locator('#inventory-popup').isVisible(),false,'toggle works with shortcut hints hidden');
            } else {
                await page.locator('#btn-inventory').tap();await page.setViewportSize({width:height,height:width});
                await page.locator('#inventory-popup .close-btn-bottom').tap();await page.setViewportSize({width,height});
            }
            await page.locator('#btn-settings').click();await page.locator('#settings-exit-game').click();
            await page.goBack();await page.locator('#confirm-modal').waitFor({state:'hidden'});
            await page.locator('#settings-exit-game').click();await page.locator('#confirm-yes').click();
            await page.locator('[data-camp=prepare]').waitFor();await depart();
            await page.waitForFunction(() => game.localPlayer?.questData.basicTrainingCompleted);
            assert.equal(await step(),undefined);
            assert.deepEqual(await page.evaluate(() => ({int:game.localPlayer.intelligence,points:game.localPlayer.statPoints,laser:game.localPlayer.skillLevels.laser,complete:game.localPlayer.questData.basicTrainingCompleted})),complete);
            await page.screenshot({path:`${out}/${layout}-reentered.png`});
            report.cases.push({layout,partial,strokes,complete,roundtrip:true});
            console.log(JSON.stringify({layout,status:'passed',strokes})); await context.close();
        }
        assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
    } finally {fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
