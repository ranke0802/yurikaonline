// Supplemental acceptance: actual modal taps/back, auth adapter failures and
// browser API refusal. Local fixtures only; no physical OS keyboard/PWA claim.
const {chromium,devices}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:8100';
const out=process.env.QA_OUTPUT||'/tmp/yurika-mobile-acceptance';fs.mkdirSync(out,{recursive:true});
const report={scope:'Chromium local fixtures, DPR1; actual input and browser history; emulated viewport reduction, not an OS keyboard',cases:[],errors:[],external:[]};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const [name,width,height,mobile]of[['small-portrait',360,640,true],['small-landscape',640,360,true],['portrait',393,852,true],['landscape',852,393,true],['pc',1280,800,false]]){
  if(process.env.QA_VIEWPORT&&process.env.QA_VIEWPORT!==name)continue;
  const c=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,userAgent:mobile?devices['Pixel 7'].userAgent:undefined,serviceWorkers:'block'});
  await c.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():(report.external.push(r.request().url()),r.abort()));
  const p=await c.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>report.errors.push({name,message:e.message}));
  const rec={name,width,height,dpr:1,modals:[],auth:[]};report.cases.push(rec);
  const click=s=>mobile?p.locator(s).first().tap():p.locator(s).first().click();
  const shot=label=>p.screenshot({path:`${out}/${name}-${label}.png`});
  await p.goto(base+'/?local=1');await p.locator('#camp-name').fill('수용 검토');await click('[data-camp=create]');await p.locator('[data-camp=prepare]').waitFor();
  await p.evaluate(async()=>{const n=game.net,d=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...d,statPoints:5,questData:{...d.questData,basicTrainingCompleted:true,prologueCompleted:true}})});
  await p.reload();await click('[data-camp=prepare]');await click('[data-camp=depart]');await p.locator('.camp-return').waitFor();await p.locator('#loading-overlay').waitFor({state:'hidden'});
  await p.evaluate(()=>{game.loop.stop();game.monsterManager.monsters.clear();game.localPlayer.currentTarget=null;game.sceneManager.currentScene.render(game.ctx);window.acceptanceInputs=[];game.input.on('keydown',a=>acceptanceInputs.push({kind:'keydown',a}));game.input.on('joystickMove',v=>{if(v.active||Math.abs(v.x||0)+Math.abs(v.y||0)>.01)acceptanceInputs.push({kind:'joystickMove',v})});game.input.on('aimStart',()=>acceptanceInputs.push({kind:'aimStart'}));});
  if(mobile)await click('#action-attack-j');else await p.keyboard.press('j');
  assert.ok((await p.evaluate(()=>acceptanceInputs)).length>0,'positive control: actual InputManager events must reach the probe');
  await p.evaluate(()=>{game.input.releaseAllActions();acceptanceInputs=[]});
  rec.inputProbePositiveControl=true;
  rec.noTarget=await p.evaluate(()=>({target:game.localPlayer.currentTarget,hp:document.querySelector('#ui-hp-cur').textContent,maxHp:document.querySelector('#ui-hp-max')?.textContent,canvasRendering:game.canvas.style.imageRendering}));
  assert.equal(rec.noTarget.target,null);assert.ok(Number(rec.noTarget.hp)>0);await shot('no-target');
  const blocked=async(label,selector)=>{
   await p.locator(selector).waitFor();await p.evaluate(()=>{acceptanceInputs=[]});
   const box=await p.locator(selector).boundingBox();
   const point={x:box.x+box.width/2,y:box.y+Math.min(18,box.height/2)};
   if(mobile)await p.touchscreen.tap(point.x,point.y);else await p.mouse.click(point.x,point.y);
   await p.keyboard.press('j');
   assert.deepEqual(await p.evaluate(()=>acceptanceInputs),[],`${name}/${label} leaked combat or joystick input`);
   rec.modals.push({label,inputBlocked:true});
  };
  const backCloses=async(selector)=>{await p.goBack();await p.locator(selector).waitFor({state:'hidden',timeout:3000});assert.equal(await p.locator('#confirm-modal').isVisible(),false,'back must not replace a modal with exit confirmation');};
  for(const [button,popup]of[['#btn-status','#status-popup'],['#btn-skill','#skill-popup'],['#btn-inventory','#inventory-popup'],['#btn-settings','#settings-popup'],['#btn-friends','#friends-popup']]){
   await click(button);await blocked(popup,popup);await p.keyboard.press('Escape');await p.locator(popup).waitFor({state:'hidden'});
   await click(button);await backCloses(popup);rec.modals.at(-1).escapeCloses=true;rec.modals.at(-1).backCloses=true;
  }
  await click('#btn-status');await click('.stat-up-btn[data-stat=intelligence]');await click('#status-close-btn-bottom');
  await blocked('stat-confirm','#confirm-modal .confirm-content');
  const pending=await p.evaluate(()=>({stat:game.localPlayer.intelligence,points:game.localPlayer.statPoints}));
  await backCloses('#confirm-modal');assert.deepEqual(await p.evaluate(()=>({stat:game.localPlayer.intelligence,points:game.localPlayer.statPoints})),pending);
  await click('.stat-down-btn[data-stat=intelligence]');await click('#status-close-btn-bottom');rec.modals.at(-1).backCancels=true;
  await click('#btn-skill');await click('#skill-item-laser .skill-icon');await blocked('skill-detail','#skill-detail-modal .skill-detail-modal-content');await backCloses('#skill-detail-modal');await p.keyboard.press('Escape');rec.modals.at(-1).backCloses=true;
  await p.evaluate(()=>{game.localPlayer.inventory[1]=game.itemData.createRewardItem('magic_staff');game.ui.updateInventory()});
  await click('#btn-inventory');await click('[data-inventory-index="1"]');await blocked('inventory-detail','.inventory-item-modal-card');await backCloses('#inventory-item-modal');await p.keyboard.press('Escape');rec.modals.at(-1).backCloses=true;
  await click('#btn-settings');await click('#settings-install-guide .platform-guide-button');await blocked('installation-guide','#generic-modal .confirm-modal-content');await backCloses('#generic-modal');rec.modals.at(-1).backCloses=true;
  // Real controller path with only the browser API stubbed to refuse permission.
  if(mobile){
   await p.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();window.fullscreenRefusals=0;document.documentElement.requestFullscreen=()=>{fullscreenRefusals++;return Promise.reject(new DOMException('isolated refusal','NotAllowedError'))};await game.ui.androidDisplay.request()});
   assert.equal(await p.locator('#settings-display-help #android-display-notice').count(),1);
   await click('#android-display-notice button:first-of-type');await p.waitForFunction(()=>fullscreenRefusals===2&&game.ui.androidDisplay.pending===null);
   await shot('fullscreen-refused');await click('#android-display-notice button:last-of-type');assert.equal(await p.locator('#android-display-notice').count(),0);rec.fullscreen={refusals:2,retry:true,dismiss:true};
  }
  await click('#settings-open-history');await blocked('history','#history-modal .history-content');await backCloses('#history-modal');rec.modals.at(-1).backCloses=true;await p.keyboard.press('Escape');
  await click('#btn-friends');await click('#friend-open-search-btn');await blocked('friend-search','#friends-add-modal .friends-floating-card');
  await click('#friend-search-query-input');await p.locator('#friend-search-query-input').fill('긴 친구 이름 입력 검증');
  const keyboardHeight=Math.min(height,Math.max(220,Math.floor(height*.6)));await p.setViewportSize({width,height:keyboardHeight});
  const keyboard=await p.locator('#friend-search-query-input').evaluate(e=>{const b=e.getBoundingClientRect();return{focused:document.activeElement===e,x:b.x,y:b.y,w:b.width,h:b.height,inside:b.y>=0&&b.bottom<=innerHeight}});
  assert.ok(keyboard.focused&&keyboard.inside,JSON.stringify(keyboard));await p.keyboard.press('j');assert.deepEqual(await p.evaluate(()=>acceptanceInputs),[]);rec.keyboard={...keyboard,viewport:{width,height:keyboardHeight},kind:'focused input + reduced CSS viewport; no OS keyboard'};await shot('keyboard-fixture');
  await p.setViewportSize({width,height});await backCloses('#friends-add-modal');rec.modals.at(-1).backCloses=true;await p.keyboard.press('Escape');
  // Actual lethal damage/respawn paths with a controlled local damage source.
  rec.deathHud=await p.evaluate(()=>{const player=game.localPlayer,scene=game.sceneManager.currentScene;player.x=player.y=2000;scene.safeZone=null;player.hp=1;player.spawnProtectionTimer=player.shieldTimer=0;player.takeDamage(9999,false,false,null,null,{id:'acceptance-fixture',type:'monster'});scene.render(game.ctx);return{dead:player.isDead,hp:player.hp,maxHp:player.maxHp,hudHp:document.querySelector('#ui-hp-cur').textContent}});
  assert.equal(rec.deathHud.dead,true);assert.equal(rec.deathHud.hudHp,'0');assert.ok(rec.deathHud.maxHp>0);await p.locator('#retry-btn').waitFor({state:'visible'});await shot('death-hud');await click('#retry-btn');await p.waitForFunction(()=>!game.localPlayer.isDead&&game.localPlayer.hp>0);
  await p.evaluate(()=>game.sceneManager.currentScene.render(game.ctx));assert.ok(Number(await p.locator('#ui-hp-cur').innerText())>0);rec.deathHud.respawnPassed=true;
  // AuthManager itself forwards failures; only Firebase transport is simulated.
  await p.evaluate(async()=>{game.ui.hideHUD();game.ui.hideAllPopups();document.querySelector('.camp-return')?.remove();const {default:Login}=await import('/src/js/world/scenes/LoginScene.js');const {default:Auth}=await import('/src/js/core/AuthManager.js');window.acceptanceAuthCalls=0;window.acceptanceAuthCode='auth/network-request-failed';window.firebase={auth:()=>({signInAnonymously:async()=>{acceptanceAuthCalls++;throw Object.assign(new Error('isolated auth refusal'),{code:acceptanceAuthCode})}})};window.acceptanceLogin=new Login({resources:game.resources,ui:game.ui,auth:new Auth()});acceptanceLogin.createUI()});
  for(const code of ['auth/network-request-failed','auth/too-many-requests','auth/user-disabled']){
   for(let attempt=0;attempt<5;attempt++){
    const before=await p.evaluate(code=>{acceptanceAuthCode=code;return acceptanceAuthCalls},code);await click('#guest-login-btn');await p.waitForFunction(n=>acceptanceAuthCalls===n+1&&!document.getElementById('guest-login-btn').disabled,before);
    assert.equal(await p.locator('.opening-status').getAttribute('data-state'),'error');assert.match(await p.locator('.opening-status').innerText(),/다시 시도/);assert.doesNotMatch(await p.locator('.opening-status').innerText(),/불러오고/);
   }rec.auth.push({code,attempts:5,retryDispatched:true,errorVisible:true});
  }
  await shot('guest-errors');await click('#login-scene-ui .platform-guide-button');await p.waitForFunction(()=>document.getElementById('generic-modal').contains(document.activeElement));await p.keyboard.press('Escape');await p.locator('#generic-modal').waitFor({state:'hidden'});assert.equal(await p.locator('#guest-login-btn').isEnabled(),true);rec.guideDismissKeepsLogin=true;
  await p.evaluate(()=>{acceptanceLogin.exit();Object.defineProperty(navigator,'standalone',{configurable:true,value:true});acceptanceLogin.createUI()});assert.equal(await p.locator('#login-scene-ui .platform-guide-button').count(),0);
  await c.close();fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log('PASS',name,'input isolation, nested Back, keyboard fixture, API refusal, actual AuthManager retry');
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
 }finally{fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
