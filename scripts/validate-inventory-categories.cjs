const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const out='/tmp/yurika-inventory-qa';fs.mkdirSync(out,{recursive:true});
try{for(const [name,width,height] of [['galaxy',780,360],['portrait',393,852],['keyboard',780,240],['desktop',1280,720],['narrow',320,640]]){
const c=await b.newContext({viewport:{width,height},isMobile:name!=='desktop',hasTouch:true});const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
await p.goto('http://127.0.0.1:8100/?local=1');await p.locator('#camp-name').fill('가방 검증');await p.locator('[data-camp=create]').click();await p.evaluate(async()=>{const n=game.net;const profile=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...profile,questData:{basicTrainingCompleted:true,prologueCompleted:true}})});await p.locator('[data-camp=character]').click();await p.locator('[data-camp=depart]').click();await p.waitForFunction(()=>game.localPlayer&&game.sceneManager.currentScene===game.sceneManager.scenes.get('world'));await p.locator('#loading-overlay').waitFor({state:'hidden'});
await p.waitForTimeout(700);
await p.evaluate(()=>{game.tutorial.activeTutorial=null;document.querySelector('#tutorial-guide')?.classList.add('hidden');const x=game.localPlayer;const ids=['magic_staff','weapon_upgrade_stone','blessed_weapon_upgrade_stone','boss_summon_scroll_thunder_pikachu','unknown_legacy_item','option_reroll_stone'];x.inventory=Array(301).fill(null);x.inventory[0]={type:'manastone',amount:1};ids.forEach((id,i)=>x.inventory[i+1]=game.itemData.createRewardItem(id,{amount:3,enhancementLevel:6}));game.ui.togglePopup('inventory-popup');});
for(const [cat,indices] of [['equipment',['1','2','3','6']],['other',['4','5']]]){await p.locator(`[data-inventory-category=${cat}]`).click();assert.deepEqual(await p.locator('#inventory-grid [data-inventory-index]').evaluateAll(es=>es.map(e=>e.dataset.inventoryIndex)),indices);}
await p.locator('[data-inventory-category=equipment]').click();
assert.equal(await p.locator('#inventory-category-tabs button').count(),2);
assert.equal(await p.locator('#inventory-grid .grid-item').count(),302);
const geometry=await p.evaluate(()=>Object.fromEntries(['#inventory-popup','.popup-header','.inventory-scroll-shell','#inventory-grid','.grid-item'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return[s,{x:r.x,y:r.y,width:r.width,height:r.height}]})));
const baseline=require('./fixtures/inventory-v124-geometry.json').rectangles[name];
for(const selector of Object.keys(geometry))for(const key of ['x','y','width','height'])assert.ok(Math.abs(geometry[selector][key]-baseline[selector][key])<1,`${name} ${selector} ${key}: ${geometry[selector][key]} != ${baseline[selector][key]}`);
const rects=await p.evaluate(()=>['#inventory-popup h2','#inventory-category-tabs','#inventory-close-btn-top'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width}}));
assert.ok(rects[0].right<=rects[1].x && (!rects[2].width||rects[1].right<=rects[2].x),JSON.stringify(rects));
assert.ok(await p.locator('#inventory-category-tabs img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)));
console.log('GEOMETRY',name,JSON.stringify(geometry));
await p.screenshot({path:`${out}/${name}-tabs.png`});
for(const index of [2,3]){await p.locator(`[data-inventory-index="${index}"]`).click();await p.waitForTimeout(350);const r=await p.locator('.inventory-item-modal-card').boundingBox();assert.ok(Math.abs(r.x+r.width/2-width/2)<3,JSON.stringify(r));assert.ok(Math.abs(r.y+r.height/2-height/2)<3,JSON.stringify(r));assert.ok(r.y>=0&&r.y+r.height<=height+1);await p.screenshot({path:`${out}/${name}-stone-${index}.png`});await p.locator('#inventory-item-modal-close').click();}
await p.evaluate(()=>game.ui.startWeaponEnhancementSelection('blessed'));assert.equal(await p.locator('[data-inventory-category=equipment]').getAttribute('aria-selected'),'true');await p.locator('[data-inventory-index="1"]').click();await p.waitForTimeout(350);const r=await p.locator('#confirm-modal .confirm-content').boundingBox();assert.ok(Math.abs(r.x+r.width/2-width/2)<3);assert.ok(Math.abs(r.y+r.height/2-height/2)<3);await p.screenshot({path:`${out}/${name}-confirm.png`});await p.locator('#confirm-no').click();
for(let repeat=0;repeat<2;repeat++) {
await p.evaluate(()=>{game.localPlayer.inventory[1].enhancementLevel=6;game.ui.startWeaponEnhancementSelection('normal')});
await p.locator('[data-inventory-index="1"]').click();await p.waitForTimeout(50);
assert.equal(await p.locator('#confirm-modal').evaluate(e=>e.classList.contains('enhancement-confirm-centered')),true);
await p.evaluate(()=>{document.querySelector('.inventory-scroll-shell').scrollTop=100;window.dispatchEvent(new Event('resize'))});
const normalRect=await p.locator('#confirm-modal .confirm-content').boundingBox();assert.ok(Math.abs(normalRect.x+normalRect.width/2-width/2)<3);assert.ok(Math.abs(normalRect.y+normalRect.height/2-height/2)<3);
await p.locator('#confirm-no').click();
}
await p.evaluate(()=>{game.ui.showConfirm('중복 확인 테스트',()=>window.confirmCount=(window.confirmCount||0)+1,{centeredEnhancement:true});document.querySelector('#confirm-yes').click();document.querySelector('#confirm-yes').click()});assert.equal(await p.evaluate(()=>window.confirmCount),1);
await p.evaluate(()=>game.ui.showConfirm('뒤로 취소',()=>{}, {centeredEnhancement:true}));await p.goBack();assert.equal(await p.locator('#confirm-modal').evaluate(e=>e.classList.contains('hidden')),true);
// Dismantle through the actual dialog, then switch tabs after stable compaction.
await p.evaluate(()=>{game.ui.clearWeaponEnhancementSelection();game.ui.updateInventory();window.survivorIds=game.localPlayer.inventory.slice(2).filter(Boolean).map(i=>i.instanceId||i.type)});
await p.locator('[data-inventory-index="1"]').click();await p.locator('#inventory-action-dismantle').click();await p.locator('#confirm-yes').click();
await p.evaluate(()=>game.ui.hideGenericModal());
assert.deepEqual(await p.evaluate(()=>game.localPlayer.inventory.slice(1).filter(Boolean).map(i=>i.instanceId||i.type)),await p.evaluate(()=>survivorIds));
await p.locator('[data-inventory-category=other]').click();assert.equal(await p.locator('#inventory-grid [data-inventory-index]').count(),2);
await p.locator('[data-inventory-category=equipment]').click();assert.equal(await p.locator('#inventory-grid [data-inventory-index]').count(),3);
const remap = await p.evaluate(()=>{
const ui=game.ui,x=game.localPlayer;
const a=game.itemData.createRewardItem('magic_staff'), survivor=game.itemData.createRewardItem('magic_staff');
x.inventory=Array(301).fill(null);x.inventory[0]={type:'manastone'};x.inventory[2]=a;x.inventory[5]=survivor;
ui.selectedInventoryRef={kind:'inventory',index:5};x.compactInventoryAfterMutation();
const selectedSame=x.inventory[ui.selectedInventoryRef.index]===survivor;
const captured={location:'inventory',item:survivor};
x.inventory[ui.selectedInventoryRef.index]=null;x.compactInventoryAfterMutation();
return {selectedSame,removedCleared:ui.selectedInventoryRef===null,capturedRemoved:ui.resolveCapturedWeaponSelection(x,captured)===null};
});assert.deepEqual(remap,{selectedSame:true,removedCleared:true,capturedRemoved:true});
assert.deepEqual(errors,[]);console.log('PASS',name,'categories, stone center, confirmation center, one-shot and back');await c.close();}
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
