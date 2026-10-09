require('./lib/qa-preflight.cjs');
const {chromium}=require('playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
const OUT='/tmp/yurika-fireball-qa';fs.mkdirSync(OUT,{recursive:true});
const report={cases:[],errors:[],external:[]};
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:780,height:360},isMobile:true,hasTouch:true});
 const page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();report.external.push(r.request().url());return r.abort();});
 const cdp=await context.newCDPSession(page);
 const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({...p,id:i,radiusX:4,radiusY:4,force:1}))});
 await page.goto('http://127.0.0.1:8100/?local=1');
 await page.locator('#camp-name').fill('파이어볼 검증');await page.locator('[data-camp="create"]').tap();await page.locator('[data-camp="character"]').first().waitFor();
 await page.evaluate(async()=>{const n=game.net;const p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,questData:{basicTrainingCompleted:true,prologueCompleted:true}});});
 await page.locator('[data-camp="prepare"]').tap();await page.locator('[data-camp="depart"]').tap();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
 for(const level of [6,7,20])for(const mode of ['auto-tap','manual-drag']){
  const before=await page.evaluate(async({level})=>{
   const p=game.localPlayer;game.projectiles=[];game.monsterManager.monsters.clear();
   const id=await game.monsterManager.spawnMonster('slime',1400,1200);
   const m=game.monsterManager.monsters.get(id);if(!m)throw Error('fixture spawn failed');
   // Stationary high-HP fixture retains real targeting, drawing, damage and packet code.
   m.update=()=>{};m.hp=100000;m.maxHp=100000;m.defense=0;
   p.x=m.x-240-p.width/2;p.y=m.y-p.height/2;p.hp=p.maxHp;p.mp=100000;p.maxMp=100000;
   p.skillLevels.fireball=level;p.skillCooldowns.u=0;p.facingAngle=0;p.autoAttackEnabled=false;p.currentTarget=null;p.attackPower=20;
   window.fireballQa={id,hp:m.hp,packets:[],casts:[]};
   if(!game.net._qaOriginalDamage){game.net._qaOriginalDamage=game.net.sendMonsterDamage.bind(game.net);game.net.sendMonsterDamage=(...args)=>{fireballQa.packets.push(args);return game.net._qaOriginalDamage(...args);};}
   if(!game.net._qaOriginalAttack){game.net._qaOriginalAttack=game.net.sendPlayerAttack.bind(game.net);game.net.sendPlayerAttack=(...args)=>{fireballQa.casts.push(args);return game.net._qaOriginalAttack(...args);};}
   return {id,hp:m.hp};
  },{level});
  await page.waitForTimeout(100);
  const b=await page.locator('#action-skill-u').boundingBox();assert.ok(b);const origin={x:b.x+b.width/2,y:b.y+b.height/2};
  await touch('touchStart',[origin]);
  await page.waitForFunction(()=>game.localPlayer.fireballAimActive);
  const locked=await page.evaluate(()=>game.localPlayer.fireballAimLockedTarget);assert.ok(locked,'real initial auto targeting selected monster');
  if(mode==='manual-drag')await touch('touchMove',[{x:origin.x+45,y:origin.y}]);
  await page.screenshot({path:`${OUT}/lv${level}-${mode}-aim.png`});
  await touch('touchEnd',[]);
  await page.waitForFunction(()=>{const m=game.monsterManager.monsters.get(fireballQa.id);return m&&m.hp<fireballQa.hp&&fireballQa.packets.length>0;},null,{timeout:7000});
  await page.screenshot({path:`${OUT}/lv${level}-${mode}-hit.png`});
  const result=await page.evaluate(()=>({hp:game.monsterManager.monsters.get(fireballQa.id)?.hp,packets:fireballQa.packets.map(a=>({id:a[0],damage:a[1],cause:a[2]?.cause})),casts:fireballQa.casts.map(a=>({skill:a[3],targetX:a[4]?.targetX,targetY:a[4]?.targetY})),aimActive:game.localPlayer.fireballAimActive}));
  assert.equal(result.aimActive,false);assert.equal(result.packets.filter(p=>p.id===before.id&&p.cause==='fireball').length,1);assert.ok(result.casts.some(c=>c.skill==='fireball'));
  report.cases.push({level,mode,before,...result});
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
}finally{fs.writeFileSync(`${OUT}/touch-report.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
