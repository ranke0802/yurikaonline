const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const OUT=process.env.QA_OUTPUT||'/tmp/class-portrait-gait';fs.mkdirSync(OUT,{recursive:true});
const report={scope:'Actual local game loop, Chromium mobile/touch emulation; approved complete-body art; checks actual walking-to-moving-attack phase continuity.',cases:[],errors:[]};
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const id of ['wizard','witch','warrior','archer']){
 const context=await browser.newContext({viewport:{width:780,height:360},hasTouch:true,isMobile:true,serviceWorkers:'block'});const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',r=>{const url=new URL(r.request().url());if(url.hostname!=='127.0.0.1')return r.abort();if(process.env.QA_BASELINE_ROOT&&['/src/js/ui/UIManager.js','/src/js/entities/Player.js','/src/js/entities/RemotePlayer.js'].includes(url.pathname))return r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.QA_BASELINE_ROOT+url.pathname)});return r.continue()});
 await page.goto('http://127.0.0.1:8100/?local=1');await page.locator('#camp-name').fill('표시 검증');await page.locator('[data-camp=create]').tap();await page.locator('[data-camp=character]').first().waitFor();
 await page.evaluate(async id=>{const n=game.net,p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,activeClassId:id,questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}})},id);
 await page.reload();await page.locator('[data-camp=character]').first().waitFor();await page.locator('[data-camp=prepare]').tap();await page.locator('[data-camp=depart]').tap();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
 const portrait=await page.evaluate(async()=>{
  const s=game.localPlayer.sprite,c=document.createElement('canvas');c.width=s.sw;c.height=s.sh;c.getContext('2d').drawImage(s.image,0,s.sh,s.sw,s.sh,0,0,s.sw,s.sh);
  const expected=c.toDataURL(),actual=document.querySelector('.portrait').style.backgroundImage.slice(5,-2);const img=new Image();img.src=actual;await img.decode();
  const pixels=document.createElement('canvas');pixels.width=img.width;pixels.height=img.height;pixels.getContext('2d').drawImage(img,0,0);
  return{width:img.width,height:img.height,expectedWidth:s.sw,expectedHeight:s.sh,exactCell:expected===pixels.toDataURL()};
 });
 if(!process.env.QA_BASELINE_ROOT){assert.equal(portrait.exactCell,true);assert.equal(portrait.width,portrait.expectedWidth);assert.equal(portrait.height,portrait.expectedHeight);}
 await page.locator('.portrait').screenshot({path:`${OUT}/${id}-portrait.png`});
 const row={id,portrait,directions:[]};report.cases.push(row);
 if(id!=='wizard'){
  await page.evaluate(()=>{game.monsterManager.monsters.clear();game.sceneManager.currentScene.zoneSpawnRules=[];window.qaFrames=[];});
  for(const [direction,key,dx,dy] of [[0,'ArrowUp',0,-1],[3,'ArrowRight',1,0],[2,'ArrowLeft',-1,0],[1,'ArrowDown',0,1]]){
   await page.keyboard.down(key);await page.waitForTimeout(150);
   const samples=await page.evaluate(async({direction,dx,dy})=>{
    const {sampleAuthoredBody}=await import('/src/js/combat/AuthoredCharacterFrames.js');const p=game.localPlayer;p.classCombat.controller.enemies=()=>[];p.startClassAction('ATTACK');if(p.classAim){p.classAim.x=p.x+p.width/2+dx*200;p.classAim.y=p.y+p.height/2+dy*200;}
    const before=p.animTimer,accepted=p.releaseClassAction('ATTACK'),after=p.animTimer;const out=[];
    for(let i=0;i<35;i++){
     await new Promise(requestAnimationFrame);const motion=p.classCombat.currentMotion();out.push({x:p.x,y:p.y,frame:p.animFrame,timer:p.animTimer,direction:p.direction,body:sampleAuthoredBody(p,motion),action:motion?{direction:motion.direction,age:motion.age,duration:motion.duration}:null});
     if([1,9,17,30].includes(i)){const c=document.createElement('canvas');c.width=220;c.height=200;const ctx=c.getContext('2d');ctx.fillStyle='#273240';ctx.fillRect(0,0,220,200);ctx.save();ctx.translate(110-p.x-p.width/2,150-p.y-p.height);p.render(ctx,{x:p.x-500,y:p.y-500,width:1000,height:1000});ctx.restore();qaFrames.push({direction,index:i,image:c.toDataURL()});}
    }
    return{accepted,before,after,samples:out};
   },{direction,dx,dy});
   await page.keyboard.up(key);await page.waitForTimeout(150);
   assert.equal(samples.accepted,true);if(!process.env.QA_BASELINE_ROOT)assert.equal(samples.before,samples.after,'attack must preserve walking phase');
   assert.ok(samples.samples.some(s=>s.action),'attack poses remain active while walking');
   assert.ok(samples.samples.some(s=>s.action&&s.body.state===2),'real movement uses moving-attack full-body rows');
   for(const s of samples.samples.filter(s=>s.action&&s.body.moving))assert.equal(s.body.frame,s.frame,'moving attack follows locomotion phase');
   assert.ok(Math.hypot(samples.samples.at(-1).x-samples.samples[0].x,samples.samples.at(-1).y-samples.samples[0].y)>10,'player keeps moving during attack');
   row.directions.push({direction,...samples});
  }
  const contact=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=880;c.height=800;const ctx=c.getContext('2d');for(let i=0;i<qaFrames.length;i++){const img=new Image();img.src=qaFrames[i].image;await img.decode();ctx.drawImage(img,i%4*220,Math.floor(i/4)*200);ctx.fillStyle='white';ctx.font='14px sans-serif';ctx.fillText(`dir ${qaFrames[i].direction} tick ${qaFrames[i].index}`,i%4*220+5,Math.floor(i/4)*200+18);}return c.toDataURL().split(',')[1]});
  fs.writeFileSync(`${OUT}/${id}-moving-attack.png`,Buffer.from(contact,'base64'));
 }
 await context.close();
}assert.deepEqual(report.errors,[])}finally{fs.writeFileSync(`${OUT}/report.json`,JSON.stringify(report,null,2));await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
