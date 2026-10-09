require('./lib/qa-preflight.cjs');
const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const out=process.env.QA_OUTPUT||'/tmp/yurika-death-v167-browser';fs.mkdirSync(out,{recursive:true});
const base=process.env.QA_BASE_URL||'http://127.0.0.1:8100';
const version=fs.readFileSync('version.txt','utf8').trim();
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const results=[];
 try{for(const [orientation,width,height] of [['portrait',390,844],['landscape',844,390]])for(const classId of ['witch','wizard','warrior','archer']){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  await page.goto(base+'/?local=1');assert.equal(await page.evaluate(()=>window.BOOTSTRAP_VERSION),version,'served bootstrap version');await page.locator('#camp-name').fill('사망 안내 검증');await page.locator('[data-camp=create]').click();await page.locator('[data-camp=character]').first().waitFor();
  await page.evaluate(async id=>{const n=game.net,d=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...d,activeClassId:id,questData:{...d.questData,basicTrainingCompleted:true,prologueCompleted:true}})},classId);
  await page.reload();await page.locator('[data-camp=prepare]').click();await page.locator('[data-camp=depart]').click();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
  await page.evaluate(async()=>{
   game.loop.stop();game.ui.hideAllPopups();game.ui.isPaused=false;game.tutorial.activeTutorial=null;game.story.isStoryActive=false;
   const p=game.localPlayer,s=game.sceneManager.currentScene;p.x=p.y=2000;s.safeZone=null;p.hp=3;p.defense=1;p.spawnProtectionTimer=0;p.shieldTimer=0;p.autoAttackEnabled=false;
   const M=(await import('/src/js/entities/Monster.js')).default,m=new M(2020,2000,await game.monsterData.loadDefinition('slime'));m.id='death-source';m.isLocalOnly=true;game.monsterManager.monsters.set(m.id,m);
   p.currentTarget={id:'other',name:'잘못된 선택 대상'};window.deathFixture={m,p,s};
   m._damageClassTarget(p,50);
  });
  const cause=page.locator('#death-cause-text'),retry=page.locator('#retry-btn');
  assert.equal(await cause.textContent(),'사망 원인: 슬라임의 공격');assert.equal(await retry.isVisible(),false);
  await page.evaluate(()=>{const {m,p}=deathFixture;m.name='변경된 이름';game.monsterManager.monsters.delete(m.id);p.takeDamage(500,false,false,null,null,{id:'other',type:'monster'});});
  assert.equal(await cause.textContent(),'사망 원인: 슬라임의 공격');
  await page.waitForTimeout(1600);assert.equal(await retry.isVisible(),false,'retry stays gated before 3 seconds');
  await retry.waitFor({state:'visible',timeout:3000});
  const geometry=async()=>page.evaluate(()=>{
   const c=document.getElementById('death-cause-text'),panel=document.querySelector('.death-content'),timer=document.getElementById('death-timer-text'),button=document.getElementById('retry-btn');
   const b=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
   return {text:c.textContent,cause:b(c),panel:b(panel),timer:b(timer),button:b(button),htmlChildren:c.children.length,scrollWidth:c.scrollWidth,clientWidth:c.clientWidth,viewport:{width:innerWidth,height:innerHeight}};
  });
  const short=await geometry();await page.screenshot({path:`${out}/${orientation}-${classId}-monster.png`});
  await retry.click();await page.waitForFunction(()=>!game.localPlayer.isDead&&game.localPlayer.hp>0);
  assert.equal(await cause.textContent(),'');assert.equal(await page.evaluate(()=>game.localPlayer.deathCauseText),null);
  const dot=await page.evaluate(()=>{const p=game.localPlayer;p.x=p.y=2000;p.hp=1;p.regenTimer=0;p.lastHitTimer=1;p.spawnProtectionTimer=0;p.shieldTimer=0;p.statusEffects=[{type:'burn',damage:1000,timer:2,tickTimer:.49}];p.update(.02);return{dead:p.isDead,cause:p.deathCauseText,hp:p.hp}});
  assert.deepEqual(dot,{dead:true,cause:'사망 원인: 확인 불가',hp:0});
  assert.equal(await cause.textContent(),'사망 원인: 확인 불가');
  await page.evaluate(async()=>{await game.localPlayer.respawn();});
  const longName='<img src=x onerror="window.__deathInjected=1">&'+'긴이름'.repeat(10);
  await page.evaluate(name=>{const p=game.localPlayer;p.x=p.y=2000;p.hp=1;p.spawnProtectionTimer=0;p.shieldTimer=0;const peer={id:'death-peer',type:'player',name};game.sceneManager.currentScene.remotePlayers.set(peer.id,peer);p.takeDamage(100,false,false,null,null,{id:peer.id,type:'player'});},longName);
  assert.equal(await cause.textContent(),`사망 원인: ${longName}의 공격`);assert.equal(await cause.locator('*').count(),0);assert.equal(await page.evaluate(()=>window.__deathInjected),undefined);
  await retry.waitFor({state:'visible',timeout:4000});const long=await geometry();
  for(const g of [short,long]){
   assert.ok(g.cause.left>=g.panel.left&&g.cause.right<=g.panel.right);assert.ok(g.cause.bottom<=g.timer.top+.1);assert.ok(g.timer.bottom<=g.button.top+.1);
   assert.ok(g.panel.left>=0&&g.panel.right<=width&&g.panel.top>=0&&g.panel.bottom<=height);assert.ok(g.scrollWidth<=g.clientWidth+1);assert.equal(g.htmlChildren,0);
   assert.ok(g.button.top>=g.panel.top&&g.button.bottom<=g.panel.bottom,'retry remains fully visible');
  }
  await page.screenshot({path:`${out}/${orientation}-${classId}-long-name.png`});
  await retry.click();assert.equal(await cause.textContent(),'');
  assert.deepEqual(errors,[]);results.push({orientation,classId,short,long,dot,errors});fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
  console.log(JSON.stringify({origin:base,version,orientation,classId,shortHeight:short.panel.height,longHeight:long.panel.height,errors}));await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
