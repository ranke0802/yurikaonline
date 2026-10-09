require('./lib/qa-preflight.cjs');
const {chromium}=require('playwright');const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{const context=await browser.newContext({viewport:{width:780,height:360},hasTouch:true,isMobile:true,serviceWorkers:'block'}),page=await context.newPage();const id='warrior';await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:8100/?local=1');await page.locator('#camp-name').fill('표시 검증');await page.locator('[data-camp=create]').tap();await page.locator('[data-camp=character]').first().waitFor();
 await page.evaluate(async id=>{const n=game.net,p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,activeClassId:id,questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}})},id);
 await page.reload();await page.locator('[data-camp=character]').first().waitFor();await page.locator('[data-camp=prepare]').tap();await page.locator('[data-camp=depart]').tap();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});

const result=await page.evaluate(async()=>{
 const p=game.localPlayer,c=p.classCombat.controller,scene=game.sceneManager.currentScene;
 game.monsterManager.monsters.clear();scene.zoneSpawnRules=[];scene.checkCollision=()=>false;c.enemies=()=>[];
 p.skillLevels.challenge=1;p.isProtected=()=>false;p.statusEffects=[];p.defense=0;p.hp=p.maxHp;
 p.startClassAction('SKILL_1',{clientX:0,clientY:0});p.moveClassAim({clientX:100,clientY:0});const mp=p.mp;const guide=p.getClassAimGuide(),start={x:p.x,y:p.y,t:c.time};const ended=c.hooks.shieldRushEnded;c.hooks.shieldRushEnded=()=>{window.shieldEnd={x:p.x,y:p.y,t:c.time};ended?.()};const accepted=p.releaseClassAction('SKILL_1');
 const before=p.hp,blocked=[];
 for(const [dx,dy] of [[100,0],[-100,0],[0,100],[0,-100]])blocked.push(p.takeDamage(10,true,false,p.x+dx,p.y+dy,null,'burn',3,5));
 p.applyEffect('burn',3,5);p.applyElectrocuted(3,.8);p.applyKnockback(100,0);p.applyCombustionCollapse(5,5);
 p.startClassAction('ATTACK');const rejectedAim=!p.classAim;
 window.shieldQA={p,c,start};return{accepted,guide,mpBefore:mp,mpAfter:p.mp,before,after:p.hp,blocked,statuses:p.statusEffects.length,knockback:p.knockback,rejectedAim};
});
assert.equal(result.accepted,true);assert.equal(result.mpBefore,result.mpAfter);assert.equal(result.guide.circle,false);assert.equal(result.guide.widthRadius,36);assert.deepEqual(result.blocked,[0,0,0,0]);assert.equal(result.before,result.after);assert.equal(result.statuses,0);assert.equal(result.rejectedAim,true);
await page.keyboard.down('ArrowLeft');await page.waitForFunction(()=>!shieldQA.c.shieldRush);await page.keyboard.up('ArrowLeft');
const end=await page.evaluate(()=>{const {p,c,start}=shieldQA;const {x,y,t}=window.shieldEnd;const hp=p.hp;p.takeDamage(10,true);return{distance:Math.hypot(x-start.x,y-start.y),elapsed:t-start.t,blocking:c.isShieldRushBlocking(),hpLoss:hp-p.hp}});
assert.ok(Math.abs(end.distance-192)<1e-6,JSON.stringify(end));assert.equal(end.blocking,false);assert.equal(end.hpLoss,10);

await page.evaluate(()=>{shieldQA.c.cooldowns[1]=0;game.localPlayer.direction=3});
await page.keyboard.press('h');await page.waitForFunction(()=>!!shieldQA.c.shieldRush);await page.waitForTimeout(200);
await page.screenshot({path:'/tmp/shield-rush-keyboard.png'});
await page.waitForFunction(()=>!shieldQA.c.shieldRush);await page.evaluate(()=>shieldQA.c.cooldowns[1]=0);
await page.locator('#action-skill-h').tap();await page.waitForFunction(()=>!!shieldQA.c.shieldRush);
await page.waitForTimeout(200);await page.screenshot({path:'/tmp/shield-rush-touch.png'});
const art=await page.evaluate(async()=>{
 const {default:Remote}=await import('/src/js/combat/ClassVisuals.js');const p=game.localPlayer,b=p.classCombat;
 const images=b.images;if(!images.shieldBody||!images.shieldEffects)throw Error('shield images not loaded');
 const sheet=document.createElement('canvas');sheet.width=1040;sheet.height=240;const ctx=sheet.getContext('2d');ctx.fillStyle='#29313d';ctx.fillRect(0,0,1040,240);
 const samples=[];for(const direction of [1,0,2,3]){
  b.motion.direction=direction;const packet=b.visualSnapshot();const remote=new Remote({...p});remote.receive(packet);await Promise.resolve();remote.images=images;
  const calls=[];const mock={drawImage:(...args)=>calls.push(args)};remote.drawBody(mock,0,0,120,120);
  if(!remote.motion?.shieldRush||calls[0]?.[0]!==images.authored)throw Error('remote approved body missing');
  const index=samples.length;ctx.save();ctx.translate(index*260,0);b.drawBody(ctx,70,75,120,120);b.drawEffect(ctx,'shield_rush',130,135,144,.2,{direction});ctx.fillStyle='white';ctx.fillText(['up','down','left','right'][direction],10,20);ctx.restore();
  samples.push({direction,row:calls[0][2]/256,remoteDuration:remote.motion.duration});
  remote.receive({...packet,sequence:packet.sequence+1,motion:null,effects:[]});if(remote.motion||remote.effects.length)throw Error('remote end retained shield');
 }
 return{body:[images.authored.width,images.authored.height],effects:[images.shieldEffects.width,images.shieldEffects.height],samples,png:sheet.toDataURL().split(',')[1]};
});fs.writeFileSync('/tmp/shield-rush-directions.png',Buffer.from(art.png,'base64'));delete art.png;
fs.writeFileSync('/tmp/shield-rush-browser-report.json',JSON.stringify({scope:'Local synthetic account, real Player update/render loop, mobile touch aim and keyboard opposing input; approved shield body and effects loaded',result,end,art},null,2));console.log(JSON.stringify({result,end}));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
