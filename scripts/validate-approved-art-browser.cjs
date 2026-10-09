require('./lib/qa-preflight.cjs');
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const BASE=process.env.QA_BASE||'http://127.0.0.1:8100',OUT=process.env.QA_OUTPUT||'reports/approved-art-v142/browser';fs.mkdirSync(OUT,{recursive:true});
const report={scope:'Local Chromium: enabled weapon UI/equip/save reload plus actual approved body renderer; synthetic accounts, no live accounts',cases:[],errors:[],failedImages:[]};
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
for(const id of ['witch','warrior','archer']){
 const context=await browser.newContext({viewport:{width:1000,height:700},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.request().resourceType()==='image'&&r.status()>=400)report.failedImages.push(r.url());});
 await page.route('**/*',r=>new URL(r.request().url()).origin===BASE?r.continue():r.abort());
 await page.goto(BASE+'/?local=1');await page.locator('#camp-name').fill('승인 아트 검증');await page.locator('[data-camp=create]').click();await page.locator('[data-camp=character]').first().waitFor();
 await page.evaluate(async id=>{const n=game.net,p=await n.getPlayerProfile(n.playerId),items=[];for(const tier of ['','blessed_'])for(const theme of ['magic','tidal','storm','astral','riftcore'])items.push(game.itemData.createRewardItem(`${tier}${theme}_${id}`,{instanceId:`qa-${tier}${theme}-${id}`}));const mage=game.itemData.createRewardItem('magic_staff',{instanceId:'preserved-mage'});await n.savePlayerData(n.playerId,{...p,activeClassId:id,level:7,exp:37,equipment:{weapon:mage},inventory:[null,...items],manastone:100000,questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}})},id);
 await page.reload();await page.locator('[data-camp=prepare]').click();await page.locator('[data-camp=depart]').click();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});await page.waitForFunction(()=>!!game.localPlayer.classCombat?.images.authored);
 assert.equal(await page.evaluate(()=>game.itemData.classWeaponsEnabled),true);const originalAttack=await page.evaluate(()=>game.localPlayer.attackPower);
 await page.evaluate(()=>{game.tutorial.activeTutorial=null;document.querySelector('#tutorial-guide')?.classList.add('hidden');game.ui.togglePopup('inventory-popup')});
 await page.screenshot({path:`${OUT}/${id}-weapons.png`});
 await page.locator('[data-inventory-index="1"]').click();await page.locator('#inventory-action-equip').click();
 assert.equal(await page.evaluate(()=>game.localPlayer.equipment.weapon.type),`magic_${id}`);assert.equal(await page.evaluate(()=>game.localPlayer.attackPower),originalAttack+7);
 await page.evaluate(()=>{game.ui.hideAllPopups();game.ui.togglePopup('inventory-popup')});
 for(const theme of ['magic','tidal','storm','astral','riftcore']){
  await page.evaluate(({theme,id})=>{const p=game.localPlayer,index=p.inventory.findIndex(i=>i?.type===`${theme}_${id}`);game.ui.openInventoryItemModal(index<0?{kind:'equipment',slot:'weapon'}:{kind:'inventory',index});},{theme,id});
  await page.locator('#inventory-item-modal:not(.hidden)').waitFor();const text=await page.locator('#inventory-item-modal').innerText();if(id==='witch')assert.ok(text.includes('마법서'));assert.ok(!text.includes('매직 미사일')&&!text.includes('파이어볼'));
  const images=await page.locator('#inventory-popup img.item-icon').evaluateAll(async nodes=>{await Promise.all(nodes.map(i=>i.decode().catch(()=>{})));return nodes.map(i=>({src:i.src,complete:i.complete,w:i.naturalWidth}));});assert.ok(images.filter(i=>i.w===512).length>=9&&images.every(i=>i.complete&&i.w>0),JSON.stringify(images));
  await page.screenshot({path:`${OUT}/${theme}-${id}-detail.png`});await page.locator('#inventory-item-modal-close').click();
 }
 await page.evaluate(()=>game.ui.hideAllPopups());
 const captured=await page.evaluate(async()=>{
  const {CLASS_BODY,sampleAuthoredBody}=await import('/src/js/combat/AuthoredCharacterFrames.js');const p=game.localPlayer,b=p.classCombat,s=CLASS_BODY[p.classId];
  const c=document.createElement('canvas');c.width=1320;c.height=12*170;const ctx=c.getContext('2d'),samples=[];
  const previous={time:b.controller.time,motion:b.motion,animTimer:p.animTimer,animFrame:p.animFrame,moving:p.classArtMoving,direction:p.direction};
  for(let state=0;state<3;state++)for(let direction=0;direction<4;direction++)for(let frame=0;frame<6;frame++){
   const row=state*4+direction,x=frame*220,y=row*170;ctx.fillStyle='#25323d';ctx.fillRect(x,y,220,170);ctx.fillStyle='#485a65';ctx.fillRect(x,y+147,220,1);ctx.fillStyle='white';ctx.font='12px sans-serif';ctx.fillText(`${['walk','stationary','moving attack'][state]} ${['up','down','left','right'][direction]} ${frame+1}`,x+6,y+16);
   p.direction=direction;p.classArtMoving=state!==1;p.animTimer=frame;p.animFrame=frame;b.controller.time=1;const age=state===1?(frame<2?frame*.11:(frame-2)*s.frameSeconds+.001):0;b.motion=state?{id:1,row:0,started:1-age,duration:s.frameSeconds*4,direction,held:state===1&&frame<2}:null;
   const assertBody=b.drawBody(ctx,x+50,y+35,120,120);if(!assertBody)throw Error('approved renderer missing');const pose=sampleAuthoredBody(p,b.currentMotion());samples.push({state,direction,frame,row:pose.row,drawnFrame:pose.frame});
  }
  b.controller.time=previous.time;b.motion=previous.motion;p.animTimer=previous.animTimer;p.animFrame=previous.animFrame;p.classArtMoving=previous.moving;p.direction=previous.direction;
  return {png:c.toDataURL().split(',')[1],samples};
 });
 fs.writeFileSync(`${OUT}/${id}-rendered-poses.png`,Buffer.from(captured.png,'base64'));for(const s of captured.samples){assert.equal(s.row,s.state*4+s.direction);assert.equal(s.drawnFrame,s.frame);}
 await page.evaluate(async()=>{game.localPlayer.saveState(true);await game.net.flushProfileWrites()});
 await page.reload();await page.locator('[data-camp=character]').first().waitFor();const saved=await page.evaluate(async()=>game.net.getPlayerProfile(game.net.playerId));
 assert.equal(saved.classProfiles[id].equipment.weapon.type,`magic_${id}`);assert.equal(saved.equipment.weapon.instanceId,'preserved-mage');assert.equal(saved.level,7);assert.equal(saved.exp,37);
 report.cases.push({id,equipped:`magic_${id}`,saved:true,magePreserved:true,bodyPoses:captured.samples.length});await context.close();
}
assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedImages,[]);
}finally{fs.writeFileSync(`${OUT}/report.json`,JSON.stringify(report,null,2));await browser.close();}console.log(JSON.stringify(report));})().catch(e=>{console.error(e);process.exitCode=1});
