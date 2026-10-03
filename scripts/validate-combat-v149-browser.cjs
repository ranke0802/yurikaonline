const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const report=[];try{
for(const id of ['witch','warrior','archer','wizard']){
 const context=await browser.newContext({viewport:{width:1000,height:700},serviceWorkers:'block'}),page=await context.newPage();await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:8100/?local=1');await page.locator('#camp-name').fill('v149 synthetic QA');await page.locator('[data-camp=create]').click();await page.locator('[data-camp=character]').first().waitFor();
 await page.evaluate(async id=>{const n=game.net,p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,activeClassId:id,questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}})},id);
 await page.reload();await page.locator('[data-camp=character]').first().waitFor();await page.locator('[data-camp=prepare]').click();await page.locator('[data-camp=depart]').click();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
 const result=await page.evaluate(async id=>{
  const p=game.localPlayer;game.monsterManager.monsters.clear();game.sceneManager.currentScene.zoneSpawnRules=[];game.sceneManager.currentScene.checkCollision=()=>false;
  const {classWeaponRoute,classWeaponBonuses,basicWeaponBonuses}=await import('/src/js/core/ClassWeapons.js');
  const {basicAttackProfile}=await import('/src/js/combat/BasicAttackProgression.js');
  const {drawClassEffect,default:Remote}=await import('/src/js/combat/ClassVisuals.js');
  const rows=[],routes=[];const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=700;const ctx=canvas.getContext('2d');ctx.fillStyle='#14232d';ctx.fillRect(0,0,1000,700);ctx.fillStyle='white';ctx.font='18px sans-serif';ctx.fillText(`${id}: Lv1 (left) / Lv8 (right); existing raster art`,20,28);
  if(id!=='wizard'){
   for(const theme of ['magic','tidal','storm','astral','riftcore']){const def=game.itemData.getItemDefinition(`${theme}_${id}`),a=game.itemData.getAffixPool(def.prefixPool).affixes[0],item=game.itemData.createRewardItem(def.id,{prefixId:a.id,enhancementLevel:10});p.equipment.weapon=item;const w=classWeaponBonuses(p);routes.push({theme,slot:w.slot,mode:w.mode,bonus:w.damageBonus,tap:!!basicWeaponBonuses(p),hold:!!basicWeaponBonuses(p,true)});}
   p.equipment.weapon=null;const b=p.classCombat;await game.resources.preparePlayableClassAssets(id);
   b.images.effects=await game.resources.loadImage(`assets/resource/classes/approved/${id}-effects.webp`);if(id==='witch')b.images.lifeCircle=await game.resources.loadImage('assets/resource/classes/approved/life-circle.webp');
   for(const [column,level] of [1,8].entries()){
    const g=basicAttackProfile(id,{lifeDrain:level,cleave:level,shot:level});const x=250+column*500;
    let samples=id==='witch'?[['orb',g.orbRadius*2,{}],['life_circle',g.tapRadius*2,{}],['poison_cloud',280,{}]]:id==='warrior'?[['warrior_slash',g.tap.range,{width:g.tap.range,height:g.tap.halfWidth*2}],['rage_smash',48,{width:48,height:g.heavy.halfWidth*2}]]:[['snipe',72,{width:72,height:36}],['tracking_rain',330,{}],['hunter_trap',72,{}]];
    for(const [row,[name,size,options]] of samples.entries()){
     const y=140+row*210;ctx.strokeStyle='#6fb6cc';ctx.strokeRect(x-(options.width||size)/2,y-(options.height||size)/2,options.width||size,options.height||size);drawClassEffect(b,ctx,name,x,y,size,.32,options);ctx.fillStyle='white';ctx.fillText(`${name} Lv${level}`,x-160,y+95);
     const remote=new Remote(p);remote.classId=id;remote.images=b.images;const off=document.createElement('canvas');off.width=off.height=500;const a=off.getContext('2d');drawClassEffect(b,a,name,250,250,size,.32,options);const local=a.getImageData(0,0,500,500).data.slice();a.clearRect(0,0,500,500);drawClassEffect(remote,a,name,250,250,size,.32,options);const distant=a.getImageData(0,0,500,500).data;if(!local.every((n,i)=>n===distant[i]))throw Error('remote pixel mismatch');rows.push({name,level,width:options.width||size,height:options.height||size,remotePixelsEqual:true});
    }
   }
   if(id==='warrior'){
    const c=b.controller,def=game.itemData.getItemDefinition('magic_warrior');p.equipment.weapon=game.itemData.createRewardItem(def.id,{prefixId:'blue_flame_warrior'});
    const point=c.combatOrigin(),enemy={id:'synthetic-chain',x:point.x+50,y:point.y,hp:10000,maxHp:10000,radius:10,isLocalOnly:true,takeDamage(n){this.hp-=n}};c.hooks.enemies=()=>[enemy];c.hooks.random=()=>0;c.basicReady=0;c.basic({x:enemy.x,y:enemy.y});c.update(.2);c.update(.2);
    if(!b.effects.some(e=>e.name==='weapon_slash'))throw Error('missing real bridge chain FX');p.equipment.weapon=null;rows.push({realBridgeChain:true});
   }
   if(id==='witch'){
    const def=await game.monsterData.loadDefinition('astral_sylveon');b.definitions.set(def.id,def);p.hp=p.maxHp;const c=b.controller;c.cooldowns[2]=0;if(!b.skill(2,{level:8}))throw Error('summon cast failed');const actor=c.summons.at(-1);if(actor.maxHp!==def.baseStats.maxHp/2||actor.attackPower!==def.baseStats.atk/2)throw Error('source stats mismatch');rows.push({summon:actor.typeId,maxHp:actor.maxHp,attack:actor.attackPower,interval:actor.attackCooldownSeconds,cost:p.maxHp*.8,hpAfter:p.hp});
   }
  }else{
   const {preloadPlayerSkillVfx,drawSkillProjectile,drawSkillImpact}=await import('/src/js/effects/PlayerSkillVfxRenderer.js');await preloadPlayerSkillVfx(game.resources);
   for(const [column,level] of [1,8].entries()){const radius=20+(level-1)*10,x=250+column*500;drawSkillProjectile(ctx,'fireball',x,150,radius,0,[],{age:.2});drawSkillImpact(ctx,x,450,radius*2.5,.4);ctx.strokeStyle='#6fb6cc';ctx.beginPath();ctx.arc(x,450,radius*2.5,0,Math.PI*2);ctx.stroke();rows.push({level,projectileRadius:radius,aoeRadius:radius*2.5});}
  }
  return {id,routes,rows,png:canvas.toDataURL().split(',')[1]};
 },id);
 fs.writeFileSync(`/tmp/combat-v149-${id}.png`,Buffer.from(result.png,'base64'));delete result.png;report.push(result);if(id!=='wizard'){assert.equal(new Set(result.routes.map(r=>`${r.slot}:${r.mode}`)).size,5);assert.ok(result.rows.filter(r=>r.name).every(r=>r.remotePixelsEqual));}await context.close();
}
fs.writeFileSync('/tmp/combat-v149-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
