const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:8100';
const out = process.env.QA_OUTPUT || '/tmp/yurika-settings-exit-v168-browser';
fs.mkdirSync(out, { recursive: true });
const version = fs.readFileSync('version.txt', 'utf8').trim();
const report = { version, origin:base, isolation:'fresh local-mode profiles; same-origin only; service workers blocked; no item actions', cases:[], errors:[], external:[] };
const save = () => fs.writeFileSync(`${out}/results.json`, JSON.stringify(report, null, 2));
(async () => {
    const browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox'] });
    try {
        for (const [orientation,width,height] of [['portrait',390,844],['landscape',844,390]]) {
            const context = await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,serviceWorkers:'block'});
            const page = await context.newPage(); page.setDefaultTimeout(20000);
            page.on('pageerror', e => report.errors.push({orientation,message:e.message}));
            await context.route('**/*', route => {
                if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
                report.external.push(route.request().url()); return route.abort();
            });
            await page.goto(base+'/?local=1');
            assert.equal(await page.evaluate(() => window.BOOTSTRAP_VERSION), version);
            await page.locator('#camp-name').fill('종료 회귀 검증'); await page.locator('[data-camp=create]').click();
            await page.locator('[data-camp=character]').first().waitFor();
            await page.evaluate(async () => { const n=game.net,p=await n.getPlayerProfile(n.playerId); await n.savePlayerData(n.playerId,{...p,questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}}); });
            await page.reload(); await page.locator('[data-camp=character]').first().waitFor();
            const depart = async () => {
                await page.locator('[data-camp=prepare]').click(); await page.locator('[data-camp=depart]').click();
                await page.waitForFunction(() => game.ui.isWorldSceneActive() && game.localPlayer); await page.locator('.camp-return').waitFor(); await page.locator('#loading-overlay').waitFor({state:'hidden'});
            };
            await depart();
            await page.evaluate(() => {
                window.qaExit = { answers:[], prompts:[], events:[] };
                const ui=game.ui, show=ui.showConfirm;
                ui.showConfirm=function(message,callback,options) {
                    const id=qaExit.prompts.length; qaExit.prompts.push(message);
                    return show.call(this,message,answer=>{qaExit.answers.push({id,answer});return callback?.(answer)},options);
                };
                const change=game.sceneManager.changeScene;
                game.sceneManager.changeScene=async function(name,...args) {
                    qaExit.events.push({kind:'scene',name,playerDetached:game.localPlayer===null});
                    return change.call(this,name,...args);
                };
                const flush=game.net.flushProfileWrites;
                game.net.flushProfileWrites=async function(...args) {
                    qaExit.events.push({kind:'flush',options:args[1]});return flush.apply(this,args);
                };
            });
            const instrumentSave = async mode => page.evaluate(mode => {
                const p=game.localPlayer, original=p.__qaExitOriginal || (p.__qaExitOriginal=p.saveState.bind(p));
                window.qaOriginalSave=original; window.qaReleaseExit=null;
                p.saveState=async function(...args) {
                    const options=args[1]||{};qaExit.events.push({kind:'save',reason:options.reason,options});
                    if(mode==='failure')return {ok:false,reason:'isolated_save_rejection'};
                    if(mode==='delay')await new Promise(resolve=>window.qaReleaseExit=resolve);
                    const result=await original(...args);qaExit.events.push({kind:'saved',ok:result?.ok});return result;
                };
            }, mode);
            const reset = async () => page.evaluate(() => {qaExit.answers=[];qaExit.prompts=[];qaExit.events=[]});
            const state = () => page.evaluate(() => ({
                confirm:!game.ui.confirmModal.classList.contains('hidden'),callback:!!game.ui.confirmCallback,
                settingsPending:game.ui.gameExitConfirmPending,backPending:game.ui.browserBackExitConfirmPending,
                transitioning:game.ui.gameExitSceneTransitioning,world:game.ui.isWorldSceneActive(),paused:game.ui.isPaused,
                popupBody:document.body.classList.contains('popup-open'),...JSON.parse(JSON.stringify(qaExit))
            }));
            const open = async () => {await page.locator('#btn-settings').click();await page.locator('#settings-exit-game').click();};
            const close = async () => page.locator('#settings-popup .close-popup:visible').first().click();
            const assertClean = value => {assert.equal(value.confirm,false);assert.equal(value.callback,false);assert.equal(value.settingsPending,false);assert.equal(value.backPending,false);assert.equal(value.transitioning,false)};
            const add = (name,evidence) => {report.cases.push({orientation,name,...evidence});save();console.log(JSON.stringify({version,origin:base,orientation,name,status:'passed'}))};
            await instrumentSave('normal');
            for (const action of ['cancel','escape','back','rotate-cancel','repeat-no','repeat-request-back','back-then-back']) {
                await reset(); await open();
                if(action==='cancel')await page.locator('#confirm-no').click();
                if(action==='escape')await page.keyboard.press('Escape');
                if(action==='rotate-cancel'){await page.setViewportSize({width:height,height:width});await page.locator('#confirm-no').click();await page.setViewportSize({width,height});}
                if(action==='repeat-no')await page.locator('#confirm-no').evaluate(b=>{b.click();b.click();b.click()});
                if(action==='repeat-request-back')await page.locator('#settings-exit-game').evaluate(b=>{b.click();b.click();b.click()});
                if(['back','repeat-request-back','back-then-back'].includes(action)) {
                    await page.goBack();await page.waitForFunction(()=>game.ui.confirmModal.classList.contains('hidden'));
                }
                const afterCancel=await state();assertClean(afterCancel);assert.deepEqual(afterCancel.answers,[{id:0,answer:false}]);
                assert.equal(afterCancel.prompts.length,1);assert.equal(afterCancel.events.filter(e=>e.kind==='save'||e.kind==='scene').length,0);
                if(action==='back-then-back') {
                    // v182: after cancelling the confirmation, Back first closes
                    // Settings. Only another Back from the field requests exit.
                    await page.goBack();await page.locator('#settings-popup').waitFor({state:'hidden'});
                    const closed=await state();assertClean(closed);assert.deepEqual(closed.answers,[{id:0,answer:false}]);
                    assert.equal(closed.events.filter(e=>e.kind==='save'||e.kind==='scene').length,0);
                    await page.goBack();await page.locator('#confirm-no').waitFor();
                    assert.match(await page.locator('#confirm-message').innerText(),/게임을 종료/);
                    await page.locator('#confirm-no').click();const second=await state();assertClean(second);assert.deepEqual(second.answers,[{id:0,answer:false},{id:1,answer:false}]);
                    await page.locator('#btn-settings').click();
                }
                await page.locator('#settings-exit-game').click();assert.equal((await state()).confirm,true);
                await page.locator('#confirm-no').click();await close();await open();assert.equal((await state()).confirm,true);
                await page.locator('#confirm-no').click();await close();const reopened=await state();assertClean(reopened);
                assert.equal(reopened.paused,false);assert.equal(reopened.popupBody,false);assert.equal(reopened.answers.length,action==='back-then-back'?4:3);
                assert.ok(reopened.answers.every(a=>!a.answer));assert.equal(reopened.events.filter(e=>e.kind==='save'||e.kind==='scene').length,0);
                if(action==='back')await page.screenshot({path:`${out}/${orientation}-recovered-after-back.png`});
                add(action,{afterCancel,reopened});
            }
            await reset();await instrumentSave('failure');await open();
            await page.locator('#confirm-yes').evaluate(b=>{b.click();b.click()});await page.waitForFunction(()=>!game.ui.gameExitSceneTransitioning);
            const failed=await state();assertClean(failed);assert.equal(failed.world,true);assert.deepEqual(failed.answers,[{id:0,answer:true}]);
            assert.equal(failed.events.filter(e=>e.kind==='save').length,1);assert.equal(failed.events.filter(e=>e.kind==='scene').length,0);
            await open();await page.locator('#confirm-no').click();await close();const retried=await state();assertClean(retried);
            assert.deepEqual(retried.answers,[{id:0,answer:true},{id:1,answer:false}]);assert.equal(retried.events.filter(e=>e.kind==='save').length,1);
            add('save-failure-retry',{failed,reopened:retried});
            await page.evaluate(()=>game.localPlayer.saveState=qaOriginalSave);
            // The next wrapper delegates to the original local adapter, so success,
            // flush options, persisted inventory and scene ordering remain real.
            await reset();await instrumentSave('delay');await open();
            const inventory=await page.evaluate(()=>JSON.stringify(game.localPlayer.inventory));
            await page.locator('#confirm-yes').evaluate(b=>{b.click();b.click();b.click()});await page.waitForFunction(()=>!!window.qaReleaseExit);
            await page.goBack();const pending=await state();assert.equal(pending.transitioning,true);assert.equal(pending.confirm,false);
            assert.deepEqual(pending.answers,[{id:0,answer:true}]);assert.equal(pending.events.filter(e=>e.kind==='save').length,1);
            await page.evaluate(()=>qaReleaseExit());await page.waitForFunction(()=>document.querySelector('#camp-scene')&&!game.sceneManager.currentScene.busy&&!game.ui.gameExitSceneTransitioning);
            const camp=await state();assertClean(camp);assert.equal(camp.world,false);
            const flow=camp.events.filter(e=>['save','saved','flush','scene'].includes(e.kind));
            assert.deepEqual(flow.map(e=>e.kind),['save','saved','flush','scene']);assert.equal(flow[0].reason,'settings_exit_game');
            assert.equal(flow[1].ok,true);assert.deepEqual(flow[2].options,{replayLocalPatchJournal:false});assert.equal(flow[3].name,'camp');assert.equal(flow[3].playerDetached,true);
            assert.equal(await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('yurika.local.profile.v1')).profile.inventory)),inventory);
            await depart();await open();await page.goBack();await page.waitForFunction(()=>game.ui.confirmModal.classList.contains('hidden'));const roundtrip=await state();assertClean(roundtrip);
            assert.deepEqual(roundtrip.answers,[{id:0,answer:true},{id:1,answer:false}]);assert.equal(roundtrip.events.filter(e=>e.kind==='save').length,1);await close();
            add('confirm-delayed-once-and-camp-roundtrip',{pending,camp,roundtrip});
            await context.close();
        }
        assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
    } finally {save();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
