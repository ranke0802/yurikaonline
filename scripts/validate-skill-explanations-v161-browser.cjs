const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const out='reports/skill-explanations-v161';fs.mkdirSync(out,{recursive:true});
 try {
 const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true,serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:8100/?local=1');await page.locator('#camp-name').fill('표시 회귀');await page.locator('[data-camp=create]').click();await page.locator('[data-camp=character]').first().waitFor();
 await page.evaluate(async()=>{const n=game.net,p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}})});
 await page.reload();await page.locator('[data-camp=prepare]').click();await page.locator('[data-camp=depart]').click();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
 const enhancement=await page.evaluate(()=>{
  const p=game.localPlayer,u=game.ui,d=game.itemData,confirm=u.showConfirm,enhance=p.enhanceWeapon;
  const inventory=p.inventory,weapon=d.createRewardItem('magic_staff'),messages=[];
  p.inventory=[null,weapon,d.createRewardItem('weapon_upgrade_stone',{amount:5}),d.createRewardItem('blessed_weapon_upgrade_stone',{amount:5})];
  p.enhanceWeapon=()=>{throw Error('confirmation preview must not enhance')};
  u.showConfirm=(html,answer)=>{messages.push(html);answer(false)};
  try {
   const cases=[];
   for(const level of [6,7,8,9]) {
    weapon.enhancementLevel=level;const before=JSON.stringify(p.inventory);
    u.pendingEnhancementStoneType='normal';u.executeWeaponEnhancementForSelection({kind:'inventory',index:1});
    const detail=u.buildInventoryDetail(p,weapon);
    cases.push({level,confirmation:messages.at(-1),detail:JSON.stringify(detail),unchanged:before===JSON.stringify(p.inventory)});
   }
   u.pendingEnhancementStoneType='blessed';u.executeWeaponEnhancementForSelection({kind:'inventory',index:1});
   return {cases,blessed:messages.at(-1)};
  }finally{u.showConfirm=confirm;p.enhanceWeapon=enhance;p.inventory=inventory;u.pendingEnhancementStoneType=null}
 });
 for(const c of enhancement.cases){assert.match(c.confirmation,/실패한 경우 파괴 50%/);assert.match(c.detail,/실패한 경우 파괴 50%/);assert.equal(c.unchanged,true);}
 assert.match(enhancement.blessed,/성공 50%.*실패 시 수치 유지/);assert.doesNotMatch(enhancement.blessed,/파괴/);
 const results=[];
 for(const id of ['wizard','witch','warrior','archer']) {
 const result=await page.evaluate(async id=>{
  const p=game.localPlayer;game.input.releaseAllActions();p.classId=p.activeClassId=id;await p._loadSpriteSheet(game.resources);p.initializeClassCombat();
  game.ui.hideAllPopups();game.ui.isPaused=false;game.tutorial.activeTutorial=null;game.tutorial.pendingTutorialId=null;game.story.isStoryActive=false;
  game.monsterManager.monsters.clear();game.monsterManager.spawnTimer=-Infinity;game.sceneManager.currentScene.zoneSpawnRules=[];p.update=()=>{};
  p.hp=80;p.maxHp=100;p.mp=0;p.maxMp=100;p.isDead=false;p.autoAttackEnabled=false;p.classStatuses={};p.classAim=null;p.skillCooldowns={h:0,u:0,k:0,j:0};p.classCombat.controller.rage=24;
  const state=()=>JSON.stringify({hp:p.hp,mp:p.mp,cd:p.skillCooldowns,aim:p.classAim,equipment:p.equipment,inventory:p.inventory,quests:p.questData,c:p.classCombat.controller},(k,v)=>['owner','hooks'].includes(k)?undefined:v);
  const before=state(),inputBefore=['j','h','u','k'].map(k=>getComputedStyle(document.querySelector(`[data-key="${k}"]`)).pointerEvents);
  for(let i=0;i<100;i++)game.ui.updateCooldowns();
  const after=state(),labels=Object.fromEntries(['j','h','u','k'].map(k=>{const b=document.querySelector(`[data-key="${k}"]`);return[k,{text:b.querySelector('.skill-unavailable-reason').textContent,label:b.getAttribute('aria-label'),disabled:b.classList.contains('disabled'),pointer:getComputedStyle(b).pointerEvents}]}));
  return{id,before,after,inputBefore,labels};
 },id);
 assert.equal(result.before,result.after,id+' display mutated state');
 for(const [i,key]of ['j','h','u','k'].entries()){assert.equal(result.labels[key].pointer,result.inputBefore[i]);assert.equal(result.labels[key].disabled,false);}
 if(id==='wizard')for(const k of ['h','u','k'])assert.equal(result.labels[k].text,'MP 부족');
 if(id==='witch')assert.equal(result.labels.u.text,'HP 80% 초과 필요');
 if(id==='warrior'){assert.equal(result.labels.j.text,'');assert.match(result.labels.j.label,/차지: 분노 25 필요/);}
 if(id==='archer')for(const k of ['j','h','u','k'])assert.equal(result.labels[k].text,'');
 await page.screenshot({path:`${out}/${id}-landscape.png`});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/${id}-portrait.png`});await page.setViewportSize({width:844,height:390});
 const cleared=await page.evaluate(()=>{const p=game.localPlayer;p.hp=p.maxHp;p.mp=p.maxMp;p.classCombat.controller.rage=100;game.ui.updateCooldowns();return [...document.querySelectorAll('.skill-unavailable-reason')].every(e=>e.hidden)});assert.equal(cleared,true);
 // Real two-finger joystick + attack, including a low-rage Warrior tap.
 await page.evaluate(async()=>{
  const p=game.localPlayer;p.update=(await import('/src/js/entities/Player.js')).default.prototype.update;
  p.hp=p.maxHp=p.mp=p.maxMp=10000;p.x=p.y=2000;p.classCombat.controller.rage=24;
  game.sceneManager.currentScene.checkCollision=()=>false;
  window.acceptedBasics=0;const hook=p.classCombat.controller.hooks.action;
  p.classCombat.controller.hooks.action=(kind,...args)=>{if(kind==='basic')acceptedBasics++;return hook?.(kind,...args)};
 });
 const cdp=await page.context().newCDPSession(page),box=await page.locator('#action-attack-j').boundingBox();
 const left={x:150,y:310,id:11},moved={x:210,y:310,id:11},right={x:box.x+box.width/2,y:box.y+box.height/2,id:12};
 const beforeMove=await page.evaluate(()=>({x:game.localPlayer.x,y:game.localPlayer.y}));
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[moved]});
 await page.waitForTimeout(200);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[moved,right]});
 await page.waitForTimeout(80);
 const held=await page.evaluate(()=>({channel:game.localPlayer.isChanneling,aim:!!game.localPlayer.classAim}));
 assert.equal(id==='wizard'?held.channel:held.aim,true,id+' simultaneous attack held');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[moved]});
 await page.waitForTimeout(80);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const released=await page.evaluate(()=>({x:game.localPlayer.x,y:game.localPlayer.y,aim:game.localPlayer.classAim,basics:acceptedBasics}));
 assert.ok(Math.hypot(released.x-beforeMove.x,released.y-beforeMove.y)>1,id+' simultaneous movement');
 assert.equal(released.aim,null);if(id!=='wizard')assert.equal(released.basics,1,id+' tap accepted exactly once');
 result.multitouch={held,released};
 delete result.before;delete result.after;results.push(result);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/browser.json',JSON.stringify({results,enhancement,errors,scope:'Isolated local profile; no production account writes'},null,2));console.log(JSON.stringify({classes:results.length,sideEffectChecks:400,errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
