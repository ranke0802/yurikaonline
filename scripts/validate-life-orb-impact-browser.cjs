const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=(process.env.QA_BASE_URL||'http://127.0.0.1:8100').replace(/\/$/,'');
const out=process.env.QA_OUTPUT||'/tmp/life-orb-impact';fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const report=[];
try{for(const [layout,width,height,dpr] of [['desktop',1280,800,1],['portrait',393,852,3],['landscape',852,393,2]]){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:layout!=='desktop',isMobile:layout!=='desktop',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 await page.goto(`${base}/?local=1`);await page.locator('#camp-name').fill('구슬 연타 검증');await page.locator('[data-camp=create]').click();await page.locator('[data-camp=character]').first().waitFor();
 await page.evaluate(async()=>{const n=game.net,p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,activeClassId:'witch',questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}})});
 await page.reload();await page.locator('[data-camp=prepare]').click();await page.locator('[data-camp=depart]').click();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
 await page.evaluate(async()=>{
  const p=game.localPlayer,b=p.classCombat,c=b.controller,s=game.sceneManager.currentScene;
  await game.resources.preparePlayableClassAssets('witch');game.loop.stop();game.monsterManager.monsters.clear();game.monsterManager.spawnTimer=-Infinity;s.zoneSpawnRules=[];s.safeZone=null;s.checkCollision=()=>false;game.tutorial.activeTutorial=null;game.ui.hideAllPopups();game.ui.isPaused=false;p.autoAttackEnabled=false;
  p.skillLevels.lifeDrain=8;p.attackPower=100;p.maxHp=100000;p.direction=3;
  const {default:Monster}=await import('/src/js/entities/Monster.js');const enemies=[];
  for(let i=0;i<3;i++){const e=new Monster(p.x+p.width/2+150,p.y+p.height/2+(i-1)*10,await game.monsterData.loadDefinition('slime'));await e.init(e.assetPath);e.id=`impact-${i}`;e.isLocalOnly=true;e.defense=0;e.behavior.passive=true;e.update=()=>{};enemies.push(e);game.monsterManager.monsters.set(e.id,e);}
  const originalDamage=c.hooks.damage,originalSound=game.sound.playClassEvent.bind(game.sound),originalDraw=game.ctx.drawImage.bind(game.ctx);
  window.impactTest={p,b,c,enemies,hits:[],sounds:[],draws:0};
  c.hooks.damage=(e,n,meta)=>{const actual=originalDamage(e,n,meta);if(actual>0&&meta.lifeOrb)impactTest.hits.push({target:e.id,orb:meta.orbId,hit:meta.orbHit,phase:meta.orbPhase,damage:actual,time:c.time});return actual;};
  game.sound.playClassEvent=(name,data,options)=>{const accepted=originalSound(name,data,options);if(name==='life_circle')impactTest.sounds.push({time:c.time,accepted});return accepted;};
  game.ctx.drawImage=(...args)=>{if(args[0]===b.images.lifeOrb)impactTest.draws++;return originalDraw(...args);};
 });
 const modes=[];
 for(const mode of ['normal','reduced','muted','silent','crowd']){
  const result=await page.evaluate(mode=>{
   const q=impactTest,{p,b,c}=q;c.time=0;c.projectiles=[];c.tasks=[];b.effects=[];b.lastLifeOrbImpactSound=undefined;p.hp=500;for(const e of q.enemies){e.hp=e.maxHp=100000;e.isDead=false;e.x=p.x+p.width/2+(mode==='crowd'?40:150);}
   q.hits=[];q.sounds=[];game.useReducedEffects=mode==='reduced';game.sound.setMuted(mode==='muted');game.sound.setSfxVolume(mode==='silent'?0:.85);
   const times=[];let maxActive=0,maxDraws=0,maxExtraDraws=0,maxArrivals=0,launches=0;
   for(let frame=0;frame<240;frame++){
    for(let spam=0;spam<20;spam++)if(c.basic())launches++;
    maxActive=Math.max(maxActive,c.orbSlots().active);b.update(1/60);q.draws=0;
    const begin=performance.now();game.sceneManager.render(game.ctx);times.push(performance.now()-begin);maxDraws=Math.max(maxDraws,q.draws);const arrivals=b.effects.filter(e=>e.name==='life_orb_heal').length;maxArrivals=Math.max(maxArrivals,arrivals);maxExtraDraws=Math.max(maxExtraDraws,q.draws-c.orbSlots().active-arrivals);
   }
   for(let i=0;i<600&&c.projectiles.length;i++)b.update(1/60);
   times.sort((a,b)=>a-b);const groups={};for(const h of q.hits)(groups[`${h.orb}:${h.target}:${h.phase}`]??=[]).push(h);
   return{mode,launches,maxActive,maxDraws,maxExtraDraws,maxArrivals,hits:q.hits,groups,sounds:q.sounds,hp:p.hp,slots:c.orbSlots(),hitstop:game.loop.hitstopTimer,frameP50:times[120],frameP95:times[228],maxFrame:times.at(-1),zoom:game.zoom};
  },mode);
  assert.equal(result.maxActive,4);assert.equal(result.slots.active,0);assert.equal(result.hitstop,0);
  assert.ok(result.launches>=8);assert.ok(result.hits.length>=36);assert.ok(result.hits.every(h=>h.damage===105));
  for(const hits of Object.values(result.groups)){assert.ok(hits.length<=(hits[0].phase==='return'?1:3));assert.ok(hits.slice(1).every((h,i)=>h.time-hits[i].time>=.24));}
  assert.ok(result.hp<=500+26*result.launches,'enlarged artwork cannot increase the healing budget');
  assert.ok(result.sounds.length>0);assert.ok(result.sounds.slice(1).every((s,i)=>s.time-result.sounds[i].time>=.18-1e-8));
  if(['muted','silent'].includes(mode))assert.ok(result.sounds.every(s=>!s.accepted));
  assert.ok(result.maxArrivals<=4);assert.ok(result.maxDraws<=(mode==='reduced'?8:12),JSON.stringify(result));
  assert.ok(result.maxExtraDraws<=(mode==='reduced'?0:4),'at most one extra approved-raster glow per active orb; arrival sprites are counted separately');
  delete result.hits;delete result.groups;modes.push(result);
 }
 await page.evaluate(()=>{const q=impactTest;game.useReducedEffects=false;game.sound.setMuted(false);game.sound.setSfxVolume(.85);q.c.projectiles=[];q.b.effects=[];for(let i=0;i<4;i++)q.c.basic();for(let i=0;i<32;i++)q.b.update(1/60);game.ui.updateCooldowns();game.sceneManager.render(game.ctx);});
 await page.screenshot({path:`${out}/${layout}-four-orbs.png`});assert.deepEqual(errors,[]);report.push({layout,modes,errors});await context.close();
}fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
