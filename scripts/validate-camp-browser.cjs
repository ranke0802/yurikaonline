const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const OUT = process.env.QA_OUTPUT || '/tmp/yurika-integration-qa';
const URL = process.env.QA_URL || 'http://127.0.0.1:8100/?local=1';
const report = { cases: [], errors: [], external: [], failedResponses: [] };
fs.mkdirSync(OUT, { recursive: true });
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
 try {
  for (const [name,width,height,mobile] of [['desktop',1560,720,false],['galaxy-s23',780,360,true],['iphone',852,393,true]]) {
   const context = await browser.newContext({ viewport:{width,height}, isMobile:mobile, hasTouch:mobile });
   const page = await context.newPage(); page.setDefaultTimeout(15000);
   page.on('pageerror', e=>report.errors.push({name,error:e.message}));
   page.on('response', r=>{ if(r.status()>=400) report.failedResponses.push({name,status:r.status(),url:r.url()}); });
   await page.route('**/*', r=>{ const u=new global.URL(r.request().url()); if(u.hostname==='127.0.0.1'||u.hostname==='localhost')return r.continue(); report.external.push(r.request().url());return r.abort(); });
   await page.goto(URL); await page.locator('[data-camp="create"]').waitFor();
   assert.equal(await page.evaluate(()=>localStorage.getItem('yurika.local.profile.v1')),null,'empty state cannot invent profile');
   await page.locator('#camp-name').fill('달숲 마법사'); await page.locator('[data-camp="create"]').click(); await page.locator('[data-camp="character"]').waitFor();
   await page.screenshot({path:`${OUT}/${name}-camp.png`});
   await page.locator('[data-camp="character"]').click(); await page.screenshot({path:`${OUT}/${name}-character.png`});
   await page.goBack(); await page.waitForFunction(()=>document.querySelector('#camp-scene')?.dataset.view==='camp');
   await page.reload(); await page.locator('[data-camp="character"]').waitFor();
   if(name==='desktop') {
    await page.locator('[data-camp="character"]').click();await page.locator('[data-camp="depart"]').click();await page.locator('.camp-return').waitFor();
    await page.waitForFunction(()=>!!game.tutorial.activeTutorial);
    await page.locator('.camp-return').click();await page.locator('[data-camp="character"]').waitFor();
   }
   // Profile fixture skips already-covered tutorial and puts XP just below growth threshold.
   await page.evaluate(async()=>{const n=game.net;const p=await n.getPlayerProfile(n.playerId); const r=await n.savePlayerData(n.playerId,{...p,exp:99,questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}});if(!r.ok)throw Error(r.reason);});
   await page.locator('[data-camp="character"]').click(); await page.locator('[data-camp="depart"]').click();
   await page.waitForFunction(()=>window.game.localPlayer&&game.sceneManager.currentScene===game.sceneManager.scenes.get('world'));
   await page.waitForTimeout(700); await page.screenshot({path:`${OUT}/${name}-field.png`});
   if(name==='desktop') {
    const setup=await page.evaluate(async()=>{const p=game.localPlayer; game.ui.hideAllPopups();game.ui.isPaused=false;const id=await game.monsterManager.spawnMonster('slime',1200,1200);const m=game.monsterManager.monsters.get(id);if(!m)throw Error('spawn failed '+JSON.stringify({host:game.net.isHost,zone:game.zone.currentZone.id,field:game.net._getCurrentFieldId(),active:game.monsterManager.activeZoneId,blocked:game.monsterManager._isHostFieldStateBlocked(),tutorial:game.tutorial.activeTutorial,scene:game.sceneManager.currentScene.constructor.name}));p.x=m.x-120;p.y=m.y;p.facingAngle=0;window.qaRewards=[];const orig=game.net.sendReward.bind(game.net);game.net.sendReward=(uid,r,...rest)=>{qaRewards.push({uid,reward:JSON.parse(JSON.stringify(r))});return orig(uid,r,...rest)};return {id,hp:m.hp,level:p.level,exp:p.exp};});
    console.log('combat setup',setup);
    await page.keyboard.down('j');
    try { await page.waitForFunction(()=>qaRewards.length>0,{},{timeout:30000}); } finally {await page.keyboard.up('j');}
    await page.waitForTimeout(500);
    const earned=await page.evaluate(async()=>{await game.net.flushProfileWrites();const p=game.localPlayer;return {level:p.level,exp:p.exp,manastone:p.manastone,rewards:qaRewards};});
    assert.ok(earned.level>setup.level,'actual kill must level profile from near-threshold fixture');
    const replay=await page.evaluate(async()=>{const before={level:game.localPlayer.level,exp:game.localPlayer.exp,manastone:game.localPlayer.manastone};const {uid,reward}=qaRewards[0];game.net.sendReward(uid,reward);await game.net.flushProfileWrites();return {before,after:{level:game.localPlayer.level,exp:game.localPlayer.exp,manastone:game.localPlayer.manastone}};});
    assert.deepEqual(replay.after,replay.before,'combat receipt replay must not duplicate rewards');report.combat={setup,earned,replay};
    await page.screenshot({path:`${OUT}/desktop-combat-growth.png`});
    // Failure injection into only this browser's storage adapter, not product files.
    await page.evaluate(()=>{window.qaStorage=game.net.storage;game.net.storage={getItem:k=>qaStorage.getItem(k),setItem:()=>{throw Error('qa_quota_failure')}}});
    await page.locator('.camp-return').click(); await page.waitForTimeout(1000);
    assert.equal(await page.locator('.camp-return').count(),1,'failed save must remain in field');
    assert.equal(await page.locator('.camp-return').isEnabled(),true,'failed save allows retry');
    await page.evaluate(()=>{game.net.storage=qaStorage});
   }
   if(name==='iphone') { await page.goBack();await page.locator('#confirm-yes').waitFor();await page.locator('#confirm-yes').click(); }
   else await page.locator('.camp-return').click();
   await page.locator('[data-camp="character"]').waitFor();
   if(name==='desktop')assert.match(await page.locator('.camp-profile').innerText(),/Lv\.2/);
   await page.reload();await page.locator('[data-camp="character"]').waitFor();
   if(name==='desktop') {
    assert.match(await page.locator('.camp-profile').innerText(),/Lv\.2/);
    await page.locator('#loading-overlay').waitFor({state:'hidden'});
    await page.screenshot({path:`${OUT}/desktop-saved-growth-camp.png`});
    const beforeFailedEntry = await page.evaluate(()=>JSON.parse(localStorage.getItem('yurika.local.profile.v1')).profile);
    await page.evaluate(()=>{window.qaLoadZone=game.zone.loadZone.bind(game.zone);game.zone.loadZone=async()=>{throw Error('qa_zone_resource_failure')};});
    await page.locator('[data-camp="character"]').click();await page.locator('[data-camp="depart"]').click();
    await page.waitForFunction(()=>document.querySelector('.camp-status')?.textContent.includes('출전하지 못했어요'));
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('yurika.local.profile.v1')).profile),beforeFailedEntry,'failed reentry must not overwrite stored growth');
    await page.evaluate(()=>{game.zone.loadZone=qaLoadZone});
    if(await page.locator('[data-camp="character"]').count())await page.locator('[data-camp="character"]').click();
    await page.locator('[data-camp="depart"]').click();await page.locator('.camp-return').waitFor();
    await page.locator('.camp-return').click();await page.locator('[data-camp="character"]').waitFor();
    await page.evaluate(()=>{window.qaRead=game.net.getLatestProfileSnapshot.bind(game.net);game.net.getLatestProfileSnapshot=()=>new Promise(resolve=>setTimeout(()=>resolve(qaRead()),1000));});
    await page.locator('[data-camp="reload"]').click();assert.match(await page.locator('.camp-status').innerText(),/불러오고/);await page.waitForTimeout(1200);
    await page.evaluate(()=>{game.net.getLatestProfileSnapshot=async()=>{throw Error('qa_read_failure')}});await page.locator('[data-camp="reload"]').click();await page.locator('[data-camp="retry"]').waitFor();assert.equal(await page.locator('[data-camp="create"]').count(),0);assert.equal(await page.locator('[data-camp="depart"]').count(),0);
    await page.evaluate(()=>{game.net.getLatestProfileSnapshot=qaRead});await page.locator('[data-camp="retry"]').click();await page.waitForFunction(()=>!document.querySelector('[data-camp="character"]').disabled);
   }
   const images=await page.locator('#camp-scene img').evaluateAll(imgs=>imgs.map(i=>({src:i.getAttribute('src'),ok:i.complete&&i.naturalWidth>0})));
   assert.ok(images.every(i=>i.ok),'camp images loaded');
   report.cases.push({name,width,height,images,result:'passed'});await context.close();
  }
  assert.deepEqual(report.errors,[],'no uncaught errors');assert.deepEqual(report.external,[],'no external requests');assert.deepEqual(report.failedResponses,[],'no failed resources');
 } finally {fs.writeFileSync(`${OUT}/browser-report.json`,JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
