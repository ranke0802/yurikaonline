require('./lib/qa-preflight.cjs');
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const results=[];try{
for(const mobile of [false,true])for(const id of ['warrior','witch','archer']){
 const label=`${mobile?'mobile':'desktop'}-${id}`,context=await browser.newContext({viewport:mobile?{width:780,height:360}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:mobile?2:1,serviceWorkers:'block'}),page=await context.newPage();
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('http://127.0.0.1:8100/?local=1');await page.locator('#camp-name').fill('발밑 충전 검증');await page.locator('[data-camp=create]').click();await page.locator('[data-camp=character]').first().waitFor();
 await page.evaluate(async id=>{const n=game.net,p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,activeClassId:id,questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}})},id);
 await page.reload();await page.locator('[data-camp=character]').first().waitFor();await page.locator('[data-camp=prepare]').click();await page.locator('[data-camp=depart]').click();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
 await page.evaluate(async()=>{
  const p=game.localPlayer;window.chargeState=(await import('/src/js/ui/ClassChargeGauge.js')).classChargeState;game.monsterManager.monsters.clear();const scene=game.sceneManager.currentScene;scene.zoneSpawnRules=[];scene.checkCollision=()=>false;p.hp=p.maxHp;p.mp=p.maxMp;p.classCombat.controller.enemies=()=>[];p.classCombat.controller.rage=100;
  window.chargeQA={p,frames:0};const original=p.drawHUD;
  p.drawHUD=function(ctx,...args){const fill=ctx.fillRect,draws=[],m=ctx.getTransform(),bounds=game.canvas.getBoundingClientRect(),sx=bounds.width/game.canvas.width,sy=bounds.height/game.canvas.height;
   ctx.fillRect=function(x,y,w,h){draws.push({color:this.fillStyle,x:bounds.x+(m.a*x+m.e)*sx,y:bounds.y+(m.d*y+m.f)*sy,width:w*m.a*sx,height:h*m.d*sy});return fill.call(this,x,y,w,h)};
   try{return original.call(this,ctx,...args)}finally{ctx.fillRect=fill;chargeQA.last={draws,state:chargeState(p),player:{x:p.x,y:p.y},camera:{x:scene.camera.x,y:scene.camera.y},zoom:game.zoom,frames:++chargeQA.frames};}
  };
 });
 assert.equal(await page.locator('#class-charge-gauge').count(),0);
 await page.keyboard.down('j');await page.waitForTimeout(110);
 const partial=await page.evaluate(()=>chargeQA.last);assert.ok(partial.state.progress>0&&partial.state.progress<1);
 const checks=[];
 for(const zoomFactor of [1,.8,1.25]){
  await page.evaluate(f=>{game.zoom*=f;game.sceneManager.currentScene.camera.framingOffsetX=45;game.sceneManager.currentScene.camera.framingOffsetY=-20},zoomFactor);
  await page.keyboard.down('d');await page.waitForTimeout(160);await page.keyboard.up('d');await page.waitForTimeout(450);
  const frame=await page.evaluate(()=>chargeQA.last),mp=frame.draws.find(d=>d.color==='#48dbfb'),track=frame.draws.find(d=>d.color==='#594719'),gold=frame.draws.find(d=>d.color==='#fff0a3');
  assert.ok(track&&gold&&mp);assert.equal(frame.state.ready,true);assert.ok(Math.abs(track.x-mp.x)<.01);assert.ok(Math.abs(track.width-mp.width)<.01);assert.ok(track.y>=mp.y+mp.height+1);assert.ok(track.height>0);assert.ok(Math.abs(gold.width-track.width)<.01);assert.ok(frame.player.x>partial.player.x);assert.notEqual(frame.camera.x,partial.camera.x);
  const viewport=page.viewportSize();assert.ok(track.x>=0&&track.x+track.width<viewport.width&&track.y+track.height<viewport.height);
  const overlap=await page.evaluate(rect=>{const els=[...document.querySelectorAll('#action-attack-j,.camp-return,#minimapCanvas')];return els.some(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&r.x<rect.x+rect.width&&r.right>rect.x&&r.y<rect.y+rect.height&&r.bottom>rect.y})},track);assert.equal(overlap,false);
  checks.push({zoom:frame.zoom,mp,track,gold,player:frame.player,camera:frame.camera});
 }
 await page.screenshot({path:`/tmp/world-charge-${label}.png`});const last=checks.at(-1).track;
 await page.screenshot({path:`/tmp/world-charge-${label}-detail.png`,clip:{x:Math.max(0,last.x-65),y:Math.max(0,last.y-150),width:Math.min(210,page.viewportSize().width-Math.max(0,last.x-65)),height:Math.min(180,page.viewportSize().height-Math.max(0,last.y-150))}});
 const pixels=await page.evaluate(rect=>{const c=game.canvas,r=c.getBoundingClientRect(),x=Math.round((rect.x+rect.width/2-r.x)*c.width/r.width),y=Math.round((rect.y+rect.height/2-r.y)*c.height/r.height);return [...c.getContext('2d').getImageData(x,y,1,1).data]},last);assert.ok(pixels[0]>230&&pixels[1]>190&&pixels[2]<210,'visible yellow pixels under character MP');
 await page.keyboard.up('j');await page.waitForFunction(()=>!chargeQA.last.state&&!chargeQA.last.draws.some(d=>d.color==='#594719'));
 await page.evaluate(()=>{chargeQA.p.classCombat.controller.basicReady=0;chargeQA.p.classCombat.controller.rage=100;chargeQA.p.startClassAction('ATTACK')});await page.waitForTimeout(100);await page.evaluate(()=>{chargeQA.p.classAim=null});await page.waitForFunction(()=>!chargeQA.last.state);
 results.push({label,partial:partial.state,checks,pixels,releaseAndCancelClear:true,hudGaugeAbsent:true});await context.close();
}
fs.writeFileSync('/tmp/world-charge-v150-browser.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
