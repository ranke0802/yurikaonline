const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:8100',out=process.env.QA_OUTPUT||'/tmp/yurika-return-berserk';
assert.ok(['127.0.0.1','localhost','yurika-online.web.app'].includes(new URL(base).hostname),'Use the project origin with isolated local profiles only');
fs.mkdirSync(out,{recursive:true});
const report={scope:'Local actual clicks/taps; controlled simulation time/targets and remote snapshot fixtures. No production accounts or live multiplayer.',cases:[],errors:[],external:[]};
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const [layout,width,height,mobile]of[['desktop',1280,800,false],['portrait',393,852,true],['landscape',852,393,true]]){
 if(process.env.QA_LAYOUTS&&!process.env.QA_LAYOUTS.split(',').includes(layout))continue;
 const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(20000);
 page.on('pageerror',e=>report.errors.push({layout,message:e.message}));await context.route('**/*',r=>{if(new URL(r.request().url()).origin===new URL(base).origin)return r.continue();report.external.push(r.request().url());return r.abort()});
 const click=s=>mobile?page.locator(s).tap():page.locator(s).click();
 const depart=async()=>{await click('[data-camp=prepare]');await click('[data-camp=depart]');await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'})};
 await page.goto(base+'/?local=1');await page.locator('#camp-name').fill('귀환과 버서크 검증');await click('[data-camp=create]');await page.locator('[data-camp=character]').first().waitFor();
 await page.evaluate(async()=>{const n=game.net,p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,activeClassId:'witch',questData:{...p.questData,prologueCompleted:true,basicTrainingCompleted:true}})});
 await page.reload();await depart();
 const setup=()=>page.evaluate(async()=>{
  game.loop.stop();const p=game.localPlayer,b=p.classCombat,c=b.controller,s=game.sceneManager.currentScene;
  game.monsterManager.monsters.clear();game.monsterManager.spawnTimer=-Infinity;s.zoneSpawnRules=[];s.safeZone=null;s.checkCollision=()=>false;
  Object.assign(p,{x:2000,y:2000,hp:1000,maxHp:1000,mp:1000,maxMp:1000,hpRegen:0,mpRegen:0,attackPower:100,autoAttackEnabled:false});
  game.ui.hideAllPopups();game.ui.isPaused=false;game.tutorial.activeTutorial=null;
  const q=window.followQa={p,b,c,s,icons:[],hits:[],heals:[]};
  q.tick=(seconds,dt=.05)=>{for(let t=0;t<seconds-1e-8;t+=dt)b.update(Math.min(dt,seconds-t));for(const [key,slot] of [['h',1],['u',2],['k',3]])p.skillCooldowns[key]=Math.max(0,(c.cooldowns[slot]||0)-c.time);s.render(game.ctx)};
  q.draw=(future=0)=>{const ctx=game.ctx,draw=ctx.drawImage,clock=Date.now;q.icons=[];
   ctx.drawImage=function(...a){if(a[0]===b.images.status&&a[1]===a[0].width/4&&a[2]===0&&a[7]===22)q.icons.push({x:a[5],y:a[6],size:a[7]});return draw.apply(this,a)};
   if(future)Date.now=()=>clock()+future;try{s.render(ctx)}finally{ctx.drawImage=draw;Date.now=clock}return q.icons;
  };
  const damage=c.hooks.damage,heal=c.hooks.healFeedback;c.hooks.damage=(e,n,m)=>{const actual=damage(e,n,m);if(m.lifeOrb)q.hits.push({id:e.id,orb:m.orbId,phase:m.orbPhase,n:actual});return actual};c.hooks.healFeedback=(e,n)=>{q.heals.push(n);return heal(e,n)};
  const Monster=(await import('/src/js/entities/Monster.js')).default;
  q.enemy=async(x,y)=>{const e=new Monster(x,y,await game.monsterData.loadDefinition('slime'));await e.init(e.assetPath);e.id='return-target';e.hp=e.maxHp=1000000;e.defense=0;e.isLocalOnly=true;e.update=()=>{};game.monsterManager.monsters.set(e.id,e);return e};
  s.camera.x=p.x+p.width/2-game.canvas.width/game.dpr/game.zoom/2;s.camera.y=p.y+p.height/2-game.canvas.height/game.dpr/game.zoom/2;
 });
 await setup();
 for(let i=0;i<3;i++){await page.evaluate(()=>{followQa.p.hp=1000;followQa.tick(1.2);game.ui.updateCooldowns()});await click('#action-skill-u')}
 await page.waitForFunction(()=>followQa.b.actors.length===3&&followQa.b.actors.every(a=>a.visual.sprite));
 assert.equal(await page.evaluate(()=>followQa.draw().length),0);
 await click('#action-skill-k');
 const active=await page.evaluate(async()=>{
  const q=followQa;q.b.actors.forEach((a,i)=>{a.x=q.p.x-70+i*75;a.y=q.p.y+90});
  const own=q.draw();const {default:Network}=await import('/src/js/core/NetworkManager.js'),net=Object.create(Network.prototype);net.playerId=q.p.id;
  q.wire=net._buildClassSummonSnapshot(q.p);q.snapshot=()=>net._buildClassSummonSnapshot(q.p);
  const Remote=(await import('/src/js/entities/RemotePlayer.js')).default,r=new Remote('qa-ally',q.p.x-120,q.p.y,null);r.activeClassId='witch';r.hp=r.maxHp=100;r.name='원격 표시 검증';await r._loadSpriteSheet(game.resources);
  const wire=q.wire.map(a=>({...a,id:a.id.replace(q.p.id,r.id),ownerId:r.id,x:a.x,y:a.y+140}));
  r.onServerUpdate({x:r.x,y:r.y,hp:100,maxHp:100,activeClassId:'witch',classSummons:wire});r.summonVisuals=new Map(wire.map((a,i)=>[a.id,q.b.actors[i].visual]));q.s.remotePlayers.set(r.id,r);q.remote=r; // Observer fixture: do not change party/field identity mid-cast.
  return{own,withRemote:q.draw(),remaining:q.wire.map(a=>a.berserkUntil-Date.now()),multipliers:q.b.actors.map(a=>q.c.multipliers(a)),owner:q.c.multipliers(q.p),bodies:q.b.actors.map(a=>({y:a.y,h:a.visual.renderHeight||a.visual.height}))};
 });
 assert.equal(active.own.length,3);assert.equal(active.withRemote.length,6);assert.ok(active.remaining.every(t=>t>0&&t<=10000));assert.ok(active.multipliers.every(m=>m.attack===1.2&&m.attackSpeed===1.7&&m.move===1.25));assert.equal(active.owner.attack,1);
 active.own.forEach((p,i)=>assert.ok(p.y>active.bodies[i].y+active.bodies[i].h/2));
 await page.screenshot({path:`${out}/${layout}-berserk-active.png`});
 const expired=await page.evaluate(()=>{const q=followQa;q.tick(10.1);return{icons:q.draw(11000),wire:q.snapshot(),diagnostic:{disposed:q.c.disposed,time:q.c.time,actors:q.b.actors.length,ownerHp:q.p.hp,context:{field:q.b.context.fieldId,zone:q.b.context.zoneId,generation:q.b.context.worldGeneration,token:q.b.context.zoneTransitionToken},current:{field:game.net._getCurrentFieldId(),zone:game.zone.currentZone.id,generation:game.monsterManager.worldGeneration,token:q.s.zoneTransitionToken}},mult:q.b.actors.map(a=>q.c.multipliers(a))}});
 assert.equal(expired.icons.length,0);assert.equal(expired.wire.length,3,JSON.stringify(expired.diagnostic));assert.ok(expired.wire.every(a=>a.berserkUntil===0));assert.ok(expired.mult.every(m=>m.attack===1));
 await page.screenshot({path:`${out}/${layout}-berserk-expired.png`});
 await page.evaluate(()=>{followQa.s.remotePlayers.clear();followQa.tick(6.1);game.ui.updateCooldowns()});await click('#action-skill-k');
 const recast=await page.evaluate(()=>({icons:followQa.draw().length,time:followQa.c.time,cd:followQa.c.cooldowns[3],hp:followQa.p.hp,mp:followQa.p.mp,actors:followQa.b.actors.length,states:followQa.b.actors.map(a=>followQa.c.statuses.get(a)),paused:followQa.b.paused(),aim:followQa.p.classAim}));assert.equal(recast.icons,3,JSON.stringify(recast));
 assert.equal(await page.evaluate(()=>{followQa.b.actors[0].takeDamage(10000);followQa.tick(.05);return followQa.draw().length}),2);
 for(let i=0;i<2;i++){await page.evaluate(()=>{followQa.p.hp=1000;followQa.tick(1.2);game.ui.updateCooldowns()});await click('#action-skill-u');await page.waitForFunction(()=>followQa.b.actors.every(a=>a.visual.sprite))}
 const replaced=await page.evaluate(()=>({actors:followQa.b.actors.length,icons:followQa.draw().length}));assert.deepEqual(replaced,{actors:3,icons:1});
 await click('.camp-return');await page.locator('[data-camp=character]').first().waitFor();await page.reload();await depart();
 assert.equal(await page.evaluate(()=>game.localPlayer.classCombat.actors.length),0);await setup();
 const orbCases=[];
 for(const mode of ['same','return-first','miss','multi','low-fps']){
  await page.evaluate(async mode=>{const q=followQa;game.monsterManager.monsters.clear();q.hits=[];q.heals=[];q.c.projectiles=[];q.b.effects=[];q.p.hp=500;q.p.skillLevels.lifeDrain=mode==='multi'?7:1;
   if(!['miss','return-first'].includes(mode))await q.enemy(q.p.x+q.p.width/2+160,q.p.y+q.p.height/2);
   game.ui.updateCooldowns();
  },mode);
  for(let i=0;i<(mode==='multi'?4:1);i++)await click('#action-attack-j');
  if(mode==='return-first')await page.evaluate(async()=>{const q=followQa;for(let i=0;i<1000&&q.c.projectiles[0]?.phase!=='return';i++)q.tick(.01);const p=q.c.projectiles[0],origin=q.c.attackOrigin(p,'return');await q.enemy((p.x+origin.x)/2,(p.y+origin.y)/2)});
  const result=await page.evaluate(mode=>{const q=followQa;q.tick(6,mode==='low-fps'?.25:.05);return{mode,hits:q.hits,heals:q.heals,hp:q.p.hp,slots:q.c.orbSlots()}},mode);
  const count=mode==='miss'?0:mode==='return-first'?1:mode==='multi'?16:4;
  assert.equal(result.hits.length,count,mode);assert.equal(result.slots.active,0);
  assert.equal(result.hits.filter(h=>h.phase==='return').length,mode==='miss'?0:mode==='multi'?4:1);
  assert.ok(result.hits.every(h=>h.n===(mode==='multi'?100:70)));
  assert.deepEqual(result.heals,mode==='miss'?[]:mode==='multi'?[24,24,24,24]:[12]);
  orbCases.push(result);await page.screenshot({path:`${out}/${layout}-orb-${mode}.png`});
 }
 // Real touch cancellation before release must still reserve no orb.
 const cdp=await context.newCDPSession(page),box=await page.locator('#action-attack-j').boundingBox();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await page.waitForTimeout(550);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 assert.equal(await page.evaluate(()=>followQa.c.orbSlots().active),0);
 report.cases.push({layout,active,expired,replaced,reentryEmpty:true,orbCases,cancelPreserved:true});await context.close();console.log(`PASS ${layout}: real potion/summons, expiry/death/replacement/reentry, return contacts and cancel`);
 }assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
}finally{fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
