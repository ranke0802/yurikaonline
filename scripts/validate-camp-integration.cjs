const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const OUT = process.env.QA_OUTPUT || '/tmp/yurika-integration-qa';
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8100';
fs.mkdirSync(OUT, {recursive:true});
const report = {coverage:'Isolated Chromium fixtures and simulated mobile viewports; no physical device or live account access',cases:[],errors:[],external:[]};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  for(const [name,width,height] of [['desktop',1560,720],['landscape',780,360],['portrait',393,852]]) {
   const context=await browser.newContext({viewport:{width,height},hasTouch:name!=='desktop',isMobile:name!=='desktop'});
   const page=await context.newPage();page.setDefaultTimeout(20000);
   page.on('pageerror',e=>report.errors.push({name,error:e.message}));
   await page.route('**/*',route=>{const host=new URL(route.request().url()).hostname;if(['127.0.0.1','localhost'].includes(host))return route.continue();report.external.push(route.request().url());return route.abort()});
   await page.goto(BASE+'/?local=1');await page.locator('#camp-name').fill('정비 검증');await page.locator('[data-camp=create]').click();await page.locator('[data-camp=character]').first().waitFor();
   assert.equal(await page.evaluate(()=>localStorage.getItem('yurika.party-rpg.concept.v1')),null);
   await page.evaluate(async()=>{const n=game.net,p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,manastone:1500,statPoints:3,inventory:[null,game.itemData.createRewardItem('magic_staff'),game.itemData.createRewardItem('weapon_upgrade_stone',{amount:1})],questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}})});
   await page.reload();await page.locator('[data-camp=character]').first().waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
   await page.screenshot({path:`${OUT}/${name}-integrated-camp.png`});
   await page.locator('[data-camp=character]').first().click();
   const baseline=await page.evaluate(()=>({intelligence:game.localPlayer.intelligence,statPoints:game.localPlayer.statPoints,skill:game.localPlayer.skillLevels.fireball,stones:game.localPlayer.manastone}));
   if(name==='desktop')await page.evaluate(()=>{window.qaPatch=game.net.savePlayerDataPatch.bind(game.net);window.qaPatchCalls=0;game.net.savePlayerDataPatch=async()=>{qaPatchCalls++;return {ok:false,reason:'qa_isolated_save_failure'}}});
   await page.locator('[data-camp=inventory]').click();await page.locator('[data-inventory-category=equipment]').click();const weaponIndex=await page.evaluate(()=>game.localPlayer.inventory.findIndex(i=>i?.type==='magic_staff'));await page.locator(`[data-inventory-index="${weaponIndex}"]`).click();await page.locator('#inventory-action-equip').click();
   assert.equal(await page.evaluate(()=>game.localPlayer.equipment.weapon?.type),'magic_staff');
   await page.screenshot({path:`${OUT}/${name}-camp-equipment.png`});
   await page.evaluate(()=>{game.ui.closeInventoryItemModal(true);game.ui.hideAllPopups()});
   if(name==='desktop'){await page.locator('[data-camp=save-retry]').waitFor();assert.equal(await page.evaluate(()=>game.sceneManager.currentScene.preparation.status().ok),false);await page.evaluate(()=>{game.net.savePlayerDataPatch=qaPatch});await page.locator('[data-camp=save-retry]').click();await page.waitForFunction(()=>game.sceneManager.currentScene.preparation.status().ok);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('yurika.local.profile.v1')).profile.equipment.weapon.type),'magic_staff')}
   await page.locator('[data-camp=stats]').click();await page.locator('.stat-up-btn[data-stat=intelligence]').click();
   await page.evaluate(()=>game.ui.cancelPendingStats());
   assert.deepEqual(await page.evaluate(()=>({intelligence:game.localPlayer.intelligence,statPoints:game.localPlayer.statPoints})),{intelligence:baseline.intelligence,statPoints:baseline.statPoints},'cancel refunds provisional allocation');
   await page.locator('.stat-up-btn[data-stat=intelligence]').click();await page.evaluate(()=>{game.ui.savePendingStats();game.ui.hideAllPopups()});
   await page.locator('[data-camp=skills]').click();await page.locator('.skill-up-btn[data-skill=fireball]').evaluate(button=>{button.click();button.click()});
   assert.equal(await page.evaluate(()=>game.localPlayer.skillLevels.fireball),baseline.skill+1,'duplicate synchronous upgrade gestures apply exactly one camp upgrade');
   await page.evaluate(()=>game.ui.hideAllPopups());
   await page.locator('[data-camp=depart]').click();await page.waitForFunction(()=>document.querySelector('#camp-scene')?.dataset.view==='prepare');
   await page.screenshot({path:`${OUT}/${name}-expedition-prepare.png`});
   await page.locator('[data-camp=depart]').evaluate(button=>{button.click();button.click()});await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
   const battle=await page.evaluate(()=>({weapon:game.localPlayer.equipment.weapon?.type,intelligence:game.localPlayer.intelligence,skill:game.localPlayer.skillLevels.fireball,stones:game.localPlayer.manastone,zone:game.zone.currentZone.id}));
   assert.equal(battle.weapon,'magic_staff');assert.equal(battle.intelligence,baseline.intelligence+1);assert.equal(battle.skill,baseline.skill+1);assert.equal(battle.stones,baseline.stones-300*Math.pow(2,baseline.skill-1));
   await page.locator('.camp-return').click();await page.locator('[data-camp=character]').first().waitFor();await page.locator('.camp-result').waitFor();
   const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('yurika.local.profile.v1')).profile);
   await page.screenshot({path:`${OUT}/${name}-integrated-return.png`});
   await page.reload();await page.locator('[data-camp=character]').first().waitFor();
   const reloaded=await page.evaluate(()=>JSON.parse(localStorage.getItem('yurika.local.profile.v1')).profile);assert.deepEqual(reloaded,saved,'rendering/reloading result never pays rewards');
   await page.locator('[data-camp=prepare]').click();await page.locator('[data-camp=depart]').click();await page.locator('.camp-return').waitFor();assert.equal(await page.evaluate(()=>game.zone.currentZone.id),battle.zone,'reentry retains saved region');
   await page.locator('.camp-return').click();await page.locator('[data-camp=character]').first().waitFor();
   assert.equal(await page.evaluate(()=>localStorage.getItem('yurika.party-rpg.concept.v1')),null,'online/local flow never creates prototype save');
   const images=await page.locator('#camp-scene img').evaluateAll(imgs=>imgs.map(i=>({src:i.src,loaded:i.complete&&i.naturalWidth>0})));assert.ok(images.every(i=>i.loaded&&/\.webp(?:\?|$)/.test(i.src)));
   // Read-only account presentation fixture: local adapter is retained; Firebase is never initialized.
   if(name==='desktop'){
    const beforeAccount=await page.evaluate(()=>JSON.parse(localStorage.getItem('yurika.local.profile.v1')).profile);
    await page.evaluate(async()=>{window.qaSnapshot=game.net.getLatestProfileSnapshot.bind(game.net);game.isLocalMode=false;const camp=game.sceneManager.scenes.get('camp');await game.sceneManager.changeScene('camp',{user:{uid:game.net.playerId}})});
    await page.locator('[data-camp=character]').first().waitFor();assert.match(await page.locator('#camp-scene').innerText(),/계정/);
    await page.evaluate(()=>{game.net.getLatestProfileSnapshot=async()=>{throw Error('qa_account_read_failure')}});await page.locator('[data-camp=reload]').click();await page.locator('[data-camp=retry]').waitFor();assert.equal(await page.locator('[data-camp=create]').count(),0);
    await page.evaluate(()=>{game.net.getLatestProfileSnapshot=qaSnapshot});await page.locator('[data-camp=retry]').click();await page.locator('[data-camp=character]').first().waitFor();
    await page.evaluate(async()=>{game.net.getLatestProfileSnapshot=async()=>({profile:null});await game.sceneManager.scenes.get('camp').load()});await page.locator('[data-camp=create]').waitFor();
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('yurika.local.profile.v1')).profile),beforeAccount,'mock online missing/read failure never replaces local save');
   }
   report.cases.push({name,width,height,baseline,battle,images,result:'passed'});
   await context.close();
  }
  const context=await browser.newContext({viewport:{width:1560,height:720}}),page=await context.newPage();await page.goto(BASE+'/party-rpg-concept/');await page.locator('[data-action=start]').click();await page.screenshot({path:`${OUT}/prototype-original-camp.png`});await context.close();
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
 }finally{fs.writeFileSync(`${OUT}/camp-integration-report.json`,JSON.stringify(report,null,2));await browser.close()}
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
