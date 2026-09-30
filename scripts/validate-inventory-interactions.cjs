const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const out='/tmp/yurika-inventory-v127-qa';fs.mkdirSync(out,{recursive:true});
try{for(const [name,width,height] of [['galaxy',780,360],['portrait',393,852],['keyboard',780,240],['desktop',1280,720],['narrow',320,640]]){
const c=await b.newContext({viewport:{width,height},isMobile:name!=='desktop',hasTouch:true});const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
await p.goto('http://127.0.0.1:8100/?local=1');await p.locator('#camp-name').fill('가방 검증');await p.locator('[data-camp=create]').click();await p.evaluate(async()=>{const n=game.net;const profile=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...profile,questData:{basicTrainingCompleted:true,prologueCompleted:true}})});await p.locator('[data-camp=character]').click();await p.locator('[data-camp=depart]').click();await p.waitForFunction(()=>game.localPlayer&&game.sceneManager.currentScene===game.sceneManager.scenes.get('world'));await p.locator('#loading-overlay').waitFor({state:'hidden'});
await p.waitForTimeout(700);
await p.evaluate(()=>{game.tutorial.activeTutorial=null;document.querySelector('#tutorial-guide')?.classList.add('hidden');const x=game.localPlayer;const ids=['magic_staff','weapon_upgrade_stone','blessed_weapon_upgrade_stone','boss_summon_scroll_thunder_pikachu','unknown_legacy_item','option_reroll_stone'];x.inventory=Array(301).fill(null);x.inventory[0]={type:'manastone',amount:1};ids.forEach((id,i)=>x.inventory[i+1]=game.itemData.createRewardItem(id,{amount:3,enhancementLevel:6}));game.ui.togglePopup('inventory-popup');});
const centered=async selector=>{const r=await p.locator(selector).boundingBox();assert.ok(Math.abs(r.x+r.width/2-width/2)<3,JSON.stringify(r));assert.ok(Math.abs(r.y+r.height/2-height/2)<3,JSON.stringify(r));assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=width+1&&r.y+r.height<=height+1,JSON.stringify(r));};
for(const index of [1,2,3,6,4,5]){
 await p.locator(`[data-inventory-category=${[4,5].includes(index)?'other':'equipment'}]`).click();
 await p.locator(`[data-inventory-index="${index}"]`).click();await p.waitForTimeout(350);await centered('.inventory-item-modal-card');
 await p.screenshot({path:`${out}/${name}-item-${index}.png`});await p.locator('#inventory-item-modal-close').click();
}
await p.locator('[data-inventory-category=equipment]').click();
await p.evaluate(()=>{game.localPlayer.inventory[6].description='아주 긴 아이템 설명입니다. '.repeat(300);game.ui.openInventoryItemModal({kind:'inventory',index:6});});await p.waitForTimeout(300);await centered('.inventory-item-modal-card');
assert.ok(await p.locator('.inventory-item-modal-card').evaluate(e=>[e,...e.querySelectorAll('*')].some(n=>n.scrollHeight>n.clientHeight && ['auto','scroll'].includes(getComputedStyle(n).overflowY))));await p.goBack();assert.equal(await p.locator('#inventory-item-modal').evaluate(e=>e.classList.contains('hidden')),true);
await p.locator('[data-inventory-index="1"]').click();await p.locator('#inventory-action-reroll-option').click();await centered('#confirm-modal .confirm-content');await p.locator('#confirm-no').click();await p.locator('#inventory-item-modal-close').click();
await p.locator('[data-inventory-category=other]').click();await p.locator('[data-inventory-index="4"]').click();
// Isolated delayed summon adapter checks the real UI async guard without live writes.
await p.evaluate(()=>{game.zone.currentZone={...game.zone.currentZone,id:game.localPlayer.getBossSummonConfigForItem(game.localPlayer.inventory[4]).zoneId};game.ui.updateInventory();window.useCalls=0;game.localPlayer.useBossSummonScroll=async()=>{useCalls++;await new Promise(r=>setTimeout(r,150));return{ok:false,message:'사용 제한 안내 '.repeat(150)}};document.querySelector('#inventory-action-use').click();document.querySelector('#inventory-action-use').click()});await p.waitForTimeout(220);assert.equal(await p.evaluate(()=>useCalls),1);await centered('#generic-modal .confirm-modal-content');await p.goBack();assert.equal(await p.locator('#generic-modal').evaluate(e=>e.classList.contains('hidden')),true);await p.locator('#inventory-item-modal-close').click();
await p.locator('[data-inventory-category=equipment]').click();
const cdp=await c.newCDPSession(p);const point=async i=>{const r=await p.locator(`[data-inventory-index="${i}"]`).boundingBox();return{x:r.x+r.width/2,y:r.y+r.height/2}};
const touch=async(type,pos)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pos?[{...pos,id:0}]:[]});
const order=()=>p.evaluate(()=>game.localPlayer.inventory.slice(1,7).map(i=>i.type));const initial=await order();
const drag=async(from,to,action)=>{await touch('touchStart',await point(from));await p.waitForTimeout(460);assert.equal(await p.evaluate(()=>game.ui.inventoryDragState?.dragActive),true);if(action)await action();await touch('touchMove',await point(to));await touch('touchEnd');await p.waitForTimeout(80)};
await drag(1,3);assert.deepEqual(await order(),[initial[1],initial[2],initial[0],initial[3],initial[4],initial[5]]);assert.equal(await p.locator('#inventory-item-modal').evaluate(e=>e.classList.contains('hidden')),true);
await p.waitForTimeout(420);await drag(3,1);assert.deepEqual(await order(),initial);
await p.waitForTimeout(420);await drag(1,3,()=>p.evaluate(()=>window.dispatchEvent(new Event('resize'))));assert.deepEqual(await order(),initial);
await p.waitForTimeout(420);await drag(1,3,()=>p.evaluate(()=>game.ui.updateInventory()));assert.deepEqual(await order(),initial);
await p.waitForTimeout(420);await touch('touchStart',await point(1));await p.waitForTimeout(460);await touch('touchCancel');assert.deepEqual(await order(),initial);
await p.waitForTimeout(420);await drag(1,3,()=>p.evaluate(()=>{game.localPlayer.inventory[1]={...game.localPlayer.inventory[1]}}));assert.deepEqual(await order(),initial);
await p.waitForTimeout(420);await touch('touchStart',await point(1));await p.waitForTimeout(460);await touch('touchMove',{x:1,y:1});await touch('touchEnd');assert.deepEqual(await order(),initial);
for(const cancel of [()=>p.evaluate(()=>document.querySelector('[data-inventory-category=other]').click()),()=>p.evaluate(()=>game.ui.togglePopup('inventory-popup'))]){
 await p.waitForTimeout(420);await touch('touchStart',await point(1));await p.waitForTimeout(460);await cancel();await touch('touchEnd');assert.deepEqual(await order(),initial);
 await p.evaluate(()=>{if(document.querySelector('#inventory-popup').classList.contains('hidden'))game.ui.togglePopup('inventory-popup');document.querySelector('[data-inventory-category=equipment]').click()});
}
await p.waitForTimeout(420);const start=await point(1);await touch('touchStart',start);await touch('touchMove',{x:start.x,y:start.y-65});await touch('touchEnd');assert.deepEqual(await order(),initial);assert.equal(await p.locator('#inventory-item-modal').evaluate(e=>e.classList.contains('hidden')),true);assert.ok(await p.locator('.inventory-scroll-shell').evaluate(e=>e.scrollTop>0));await p.locator('.inventory-scroll-shell').evaluate(e=>e.scrollTop=0);
await p.waitForTimeout(420);await touch('touchStart',await point(1));await p.waitForTimeout(460);const empty=await p.locator('#inventory-grid .grid-item:not([data-inventory-index])').nth(2).boundingBox();await touch('touchMove',{x:empty.x+empty.width/2,y:empty.y+empty.height/2});await touch('touchEnd');await p.waitForTimeout(80);assert.deepEqual(await order(),[initial[1],initial[2],initial[5],initial[3],initial[4],initial[0]]);
await p.evaluate(()=>game.net.flushProfileWrites());const persisted=await p.evaluate(()=>JSON.parse(localStorage.getItem('yurika.local.profile.v1')).profile.inventory.slice(1,7).map(i=>i.type));assert.deepEqual(persisted,await order());await p.reload();await p.locator('[data-camp=character]').waitFor();const reloadOrder=await p.evaluate(()=>JSON.parse(localStorage.getItem('yurika.local.profile.v1')).profile.inventory.slice(1,7).map(i=>i.type));assert.deepEqual(reloadOrder,persisted);
assert.deepEqual(errors,[]);console.log('PASS',name,'all details/confirmations, long text, back, duplicate use, touch insertion/cancellation/empty-drop/persistence');await c.close();}
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
