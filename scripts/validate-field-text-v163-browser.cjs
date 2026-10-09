require('./lib/qa-preflight.cjs');
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const out=process.env.QA_OUTPUT||'reports/field-text-v163/verified';fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const results=[],errors=[];
try{for(const [name,width,height]of [['narrow',320,568],['portrait',390,844],['s23-landscape',780,360],['landscape',844,390],['desktop',1280,800]].filter(([name])=>!process.env.QA_VIEWPORT||process.env.QA_VIEWPORT===name)){
 const c=await b.newContext({viewport:{width,height},hasTouch:width<1024,isMobile:width<1024,serviceWorkers:'block'}),p=await c.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await p.goto('http://127.0.0.1:8100/?local=1');await p.locator('#camp-name').fill('필드 표시 회귀');await p.locator('[data-camp=create]').click();await p.locator('[data-camp=character]').first().waitFor();
 await p.evaluate(async()=>{const n=game.net,d=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...d,questData:{...d.questData,basicTrainingCompleted:true,prologueCompleted:true}})});await p.reload();
 const depart=async()=>{await p.locator('[data-camp=prepare]').click();await p.locator('[data-camp=depart]').click();await p.locator('#loading-overlay').waitFor({state:'hidden'});await p.waitForTimeout(300)};await depart();
 const inspect=async(label)=>{await p.evaluate(()=>game.ui.fieldHudReadability.sync(game.ui,true));const r=await p.evaluate(()=>{
  const rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}},overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  const selectors=['.top-bar','.quest-list-panel','.camp-return','#minimap-container','#action-skill-h','#action-skill-u','#action-skill-k','#action-attack-j'];const zones=Object.fromEntries(selectors.map(s=>[s,rect(document.querySelector(s))]));
  const fonts=[...document.querySelectorAll('.bar-text,.stat-label,.quest-title,.quest-progress')].map(e=>{let scale=1;for(let a=e;a;a=a.parentElement)scale*=game.ui.getElementComputedScale(a);return{selector:e.id||e.className,size:parseFloat(getComputedStyle(e).fontSize)*scale}});
  const barClips=[...document.querySelectorAll('.bar-text')].flatMap(e=>{const range=document.createRange();range.selectNodeContents(e);const bar=rect(e.closest('.bar-bg'));return [...range.getClientRects()].filter(r=>r.width&&r.height&&(r.left<bar.left-1||r.right>bar.right+1||r.top<bar.top-1||r.bottom>bar.bottom+1)).map(r=>({bar,text:rect(e),clip:{left:r.left,right:r.right,top:r.top,bottom:r.bottom}}))});
  const quest=document.querySelector('.quest-list-panel');const overlaps=[['.top-bar','.camp-return'],['.top-bar','#minimap-container'],['.quest-list-panel','.top-bar'],['.quest-list-panel','.camp-return'],...selectors.slice(4).map(s=>['.quest-list-panel',s])].filter(([a,b])=>overlap(zones[a],zones[b])>1);
  return{chatFont:parseFloat(document.body.style.getPropertyValue('--hud-chat-font-size')),active:document.body.classList.contains('field-readable-hud'),fonts,zones,overlaps,barClips,questScroll:{height:quest.scrollHeight,client:quest.clientHeight,overflow:getComputedStyle(quest).overflowY},resourceTexts:[...document.querySelectorAll('.bar-text')].map(e=>e.textContent.replace(/\s/g,''))};
 });if(p.viewportSize().width<=1024){assert.equal(r.active,true,label);assert.ok(r.fonts.every(x=>Math.abs(x.size-r.chatFont)<.2),label+JSON.stringify(r.fonts));assert.deepEqual(r.overlaps,[],label);assert.deepEqual(r.barClips,[],label)}else assert.equal(r.active,false,label);
 await p.screenshot({path:`${out}/${name}-${label}.png`});return r};
 const initial=await inspect('normal');
 if(width<1024){
  for(const scale of [.65,1,1.8]){
   await p.evaluate(scale=>{game.ui.applyUiLayoutControl('hud-top-bar',{left:.015,top:.03,scale});game.ui.applyUiLayoutControl('quest-panel',{left:.015,top:.25,scale});game.ui.fieldHudReadability.sync(game.ui,true)},scale);
   await inspect('scale-'+scale);
  }
  await p.evaluate(()=>game.ui.applyActiveUiLayout());await inspect('scale-restored');
 }
 const invariant=await p.evaluate(()=>{const u=game.ui,p=game.localPlayer;const state=()=>JSON.stringify({hp:p.hp,mp:p.mp,quest:p.questData,inventory:p.inventory,equipment:p.equipment,storage:{...localStorage}});const before=state();const styles=[...document.querySelectorAll('.top-bar,.quest-list-panel,.camp-return,.chat-window')].map(e=>[e,e.getAttribute('style')]);for(let i=0;i<100;i++)u.fieldHudReadability.sync(u,true);return{state:before===state(),styles:styles.every(([e,s])=>e.getAttribute('style')===s)}});assert.deepEqual(invariant,{state:true,styles:true});
 await p.evaluate(()=>{const p=game.localPlayer;window.qaUpdate=p.update;window.qaQuestUI=game.ui.updateQuestUI;p.hp=p.maxHp=999999999;p.mp=p.maxMp=888888888;p.update=()=>{};game.monsterManager.monsters.clear();game.monsterManager.spawnTimer=-Infinity;game.sceneManager.currentScene.zoneSpawnRules=[];game.ui.updateStats(100,100,p.level,0);document.querySelector('#active-quest-title').textContent='별빛 폐허의 잃어버린 수호자와 오래된 약속';document.querySelector('#active-quest-task').textContent='별빛 폐허에서 수호자를 찾아 대화하고 흩어진 마력 조각을 모으세요. 진행도 99999 / 100000';document.querySelector('#active-quest-reward').textContent='보상: 경험치 9999999, 마나스톤 9999999 · 가방 공간을 확인하세요.';game.ui.updateQuestUI=()=>{}});
 const long=await inspect('long');assert.deepEqual(long.resourceTexts,['999999999/999999999','888888888/888888888']);
 if(width<1024){
  await p.setViewportSize({width:height,height:width});await p.waitForTimeout(350);await inspect('rotation');await p.setViewportSize({width,height});await p.waitForTimeout(350);await inspect('rotation-back');
  await p.evaluate(()=>{for(const [s,n]of Object.entries({left:44,right:44,top:24,bottom:24}))document.documentElement.style.setProperty('--safe-area-'+s,n+'px');window.dispatchEvent(new Event('resize'))});await p.waitForTimeout(350);const safe=await inspect('safe');for(const s of ['.top-bar','.quest-list-panel','.camp-return']){const r=safe.zones[s];assert.ok(r.left>=44&&r.right<=width-44&&r.top>=24&&r.bottom<=height-24,s+JSON.stringify(r))}
  const needsScroll=await p.locator('.quest-list-panel').evaluate(e=>e.scrollHeight>e.clientHeight+1);
  if(needsScroll){const cd=await c.newCDPSession(p),q=await p.locator('.quest-list-panel').boundingBox();
   await p.locator('.quest-list-panel').evaluate(e=>e.scrollTop=0);
   for(let swipe=0;swipe<6;swipe++){const x=q.x+q.width*.7,y=q.y+q.height-12,dy=Math.max(20,q.height-28);
    await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    for(let i=1;i<=6;i++){await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-dy*i/6,id:1}]});await p.waitForTimeout(20)}
    await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(80);
   }
   assert.ok(await p.locator('.quest-list-panel').evaluate(e=>e.scrollTop)>0,'quest panel must scroll by touch');
  }
  await p.locator('#active-quest-reward').scrollIntoViewIfNeeded();
  assert.equal(await p.evaluate(()=>{const q=document.querySelector('.quest-list-panel').getBoundingClientRect(),r=document.querySelector('#active-quest-reward').getBoundingClientRect();return r.top>=q.top&&r.bottom<=q.bottom}),true,'long reward/status text remains reachable');
  await p.screenshot({path:`${out}/${name}-safe-scrolled.png`});
  // Scroll to the actual reward action, preserving its existing click handler.
  await p.evaluate(()=>{game.ui.updateQuestUI=window.qaQuestUI;game.localPlayer.questData.slimeKills=10;game.ui.updateQuestUI();game.ui.fieldHudReadability.sync(game.ui,true)});
  const wisdom=await p.evaluate(()=>game.localPlayer.wisdom);await p.locator('#quest-reward-display').scrollIntoViewIfNeeded();await p.locator('#quest-reward-display').tap();await p.waitForFunction(()=>game.localPlayer.questData.slimeQuestClaimed);assert.equal(await p.evaluate(()=>game.localPlayer.wisdom),wisdom+2);await p.locator('#reward-modal button').first().click();
  await p.evaluate(()=>{game.ui.hideAllPopups();for(const s of ['left','right','top','bottom'])document.documentElement.style.removeProperty('--safe-area-'+s);window.dispatchEvent(new Event('resize'))});await p.waitForTimeout(350);
  await p.evaluate(()=>game.ui.togglePopup('inventory-popup'));assert.equal(await p.evaluate(()=>document.body.classList.contains('field-readable-hud')),false);await p.evaluate(()=>game.ui.hideAllPopups());await inspect('popup-closed');
  // Local fixture reopens a completed tutorial solely to check presentation ownership.
  await p.evaluate(()=>{game.tutorial.completedTutorials.delete('basic_training');game.tutorial.startTutorial('basic_training')});await p.waitForFunction(()=>game.tutorial.activeTutorial);assert.equal(await p.evaluate(()=>document.body.classList.contains('field-readable-hud')),false);await p.evaluate(()=>game.tutorial.stopTutorial());await inspect('tutorial-exit');
 }
 await p.evaluate(()=>{game.localPlayer.update=window.qaUpdate;game.ui.updateQuestUI=window.qaQuestUI;game.ui.hideAllPopups()});await p.locator('.camp-return').click();await p.waitForFunction(()=>document.querySelector('#camp-scene')&&!game.sceneManager.currentScene.busy&&!game.ui.gameExitSceneTransitioning);await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>document.body.classList.contains('field-readable-hud')),false);await depart();await inspect('reentry');
 results.push({name,initial,long,invariant,claimReachable:width<1024,rotationAndSafeArea:width<1024,campReturnReentry:true});await c.close();
}assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({scope:'Synthetic local profiles only; 9-digit resources, long quest/status text, actual reward click, popup, tutorial transition, rotation, injected safe areas and camp return/reentry',results,errors},null,2));console.log(JSON.stringify({viewports:results.length,invariantQueries:results.length*100,errors}))}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
