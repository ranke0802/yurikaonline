const {chromium}=require('@playwright/test');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=process.env.QA_URL||'http://127.0.0.1:8100';
const group=process.env.QA_GROUP||'boundaries';
const output=process.env.QA_OUTPUT||'/tmp/yurika-cbt03-v171';
const expectedCounts={boundaries:42,cooldowns:57,charge:27,healing:84,'weapon-routes':36,combined:60};
assert.ok(Object.hasOwn(expectedCounts,group),'Unknown CBT03 group: '+group);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const report={group,base,sourceHashes:{},errors:[],external:[],cases:[],scope:'Isolated local-mode Chromium; production Player/Bridge/Controller and scene floating text queue. Network/persistence are memory fixtures; SFX requests recorded. No production account/DB.'};
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===base||['data:','blob:'].includes(u.protocol))return r.continue();report.external.push(u.href);return r.abort()});
  for(const p of ['src/js/entities/Player.js','src/js/combat/ClassCombatController.js','src/js/combat/ClassCombatBridge.js','src/js/combat/SkillHealing.js']){
   const r=await page.request.get(base+'/'+p);assert.equal(r.status(),200);const bytes=await r.body();assert.deepEqual(bytes,fs.readFileSync(p));report.sourceHashes[p]=crypto.createHash('sha256').update(bytes).digest('hex');
  }
  await page.goto(base+'/?local=1');await page.locator('#camp-name').fill('CBT03 isolated QA');await page.locator('[data-camp=create]').tap();await page.locator('[data-camp=character]').first().waitFor();
  await page.evaluate(async()=>{const n=game.net,p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,activeClassId:'wizard',questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}})});
  await page.reload();await page.locator('[data-camp=prepare]').tap();await page.locator('[data-camp=depart]').tap();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
  report.cases=await page.evaluate(async group=>{
   if(!game.isLocalMode)throw Error('Fixture must use local mode');
   game.loop.stop();game.tutorial={isActionAllowed:()=>true,trigger(){}};game.ui.isPaused=false;
   const p=game.localPlayer,rows=[];const {default:Monster}=await import('/src/js/entities/Monster.js');
   const {basicChargeSeconds}=await import('/src/js/combat/BasicAttackProgression.js');
   await import('/src/js/entities/Projectile.js');
   const definition=await game.monsterData.loadDefinition('slime');
   let trace={};const clear=()=>{game.sceneManager.currentScene.floatingTexts=[];return trace={sounds:[],texts:[],actions:[],packets:[],saves:[]}};clear();
   const net={playerId:p.id,isHost:true,isLocalMode:true,_getCurrentFieldId:()=> 'cbt03-isolated',isSharedFieldActive:()=>false,
    sendPlayerAttack:(...a)=>trace.packets.push(['attack',...a]),sendChanneling:(...a)=>trace.packets.push(['channel',...a]),
    sendMonsterDamage:(...a)=>{trace.packets.push(['damage',...a]);return true},sendPlayerDamage:(...a)=>{trace.packets.push(['support',...a]);return true},
    sendPlayerHp:(...a)=>trace.packets.push(['hp',...a]),syncClassSummons(){}};
   game.net=p.net=net;game.sceneManager.currentScene.checkCollision=()=>false;
   game.sound.playClassEvent=(name)=>{trace.sounds.push(name);return true};game.sound.playSfx=name=>trace.sounds.push(name);
   const addDamageText=game.addDamageText.bind(game);
   game.addDamageText=(x,y,text,color,...rest)=>{trace.texts.push({text:String(text),color});return addDamageText(x,y,text,color,...rest)};p.triggerAction=text=>trace.actions.push(text);
   p.saveProfilePatch=(...a)=>{trace.saves.push(a);return Promise.resolve({ok:true})};
   const near=(a,b)=>Math.abs(a-b)<1e-8;
   function check(row,condition,label){row.checks.push({label,passed:!!condition});}
   function recoveryLabels(row){
    const heals=t=>['#66e38b','#4ade80'].includes(t.color)&&String(t.text).startsWith('+');
    const requested=trace.texts.filter(heals).map(t=>Number(String(t.text).slice(1)));
    const queued=game.sceneManager.currentScene.floatingTexts.filter(heals);
    const labels=queued.map(t=>Number(String(t.text).slice(1)));
    check(row,JSON.stringify(labels)===JSON.stringify(requested),'each recovery request reaches the scene text queue exactly once');
    check(row,queued.every(t=>Number.isFinite(t.x)&&Number.isFinite(t.y)&&t.timer>0),'queued recovery text has finite position and positive lifetime');
    return labels;
   }
   async function reset(id,level=1){
    p.classCombat?.dispose();p.classId=p.activeClassId=id;p.x=p.y=1600;p.direction=3;p.facingAngle=0;
    p.hp=p.maxHp=1000;p.mp=p.maxMp=1000;p.attackPower=10;p.attackSpeed=1;p.wisdom=0;p.critRate=0;p.autoAttackEnabled=false;
    p.isDead=p.isDying=false;p.classStatuses={};p.knockback={vx:0,vy:0};p.equipment.weapon=null;p.skillLevels={laser:level,missile:level,fireball:level,shield:level,lifeDrain:level,cleave:level,shot:level};
    p.skillCooldowns={j:0,h:0,u:0,k:0};p.skillMaxCooldowns={};p.isAttacking=false;p.state='idle';p.animTimer=0;p.lightningEffect=null;p.isChanneling=false;p.chargeTime=0;p.lightningTickTimer=0;p.skillAttackTimer=0;p.missileFireQueue=[];p.shieldTimer=0;
    p.initializeClassCombat();if(p.classCombat){p.classCombat.controller.rage=100;p.classCombat.definitions.set('slime',definition);}
    game.monsterManager.monsters.clear();game.projectiles=[];game.ui.isPaused=false;
    const e=new Monster(p.x+74,p.y+24,definition);Object.assign(e,{id:'cbt03-target',isLocalOnly:true,hp:100000,maxHp:100000,defense:0,radius:16,isDead:false});game.monsterManager.monsters.set(e.id,e);p.currentTarget=e;
    await new Promise(r=>setTimeout(r,0));clear();return e;
   }
   const snapshot=()=>({hp:p.hp,mp:p.mp,rage:p.classCombat?.controller.rage,ready:p.classCombat?.controller.basicReady,cooldowns:{...(p.classCombat?.controller.cooldowns||p.skillCooldowns)},uiCooldowns:{...p.skillCooldowns},targetHp:p.currentTarget?.hp,
    animation:{isAttacking:p.isAttacking,isChanneling:p.isChanneling,state:p.state,animTimer:p.animTimer,skillAttackTimer:p.skillAttackTimer,chargeTime:p.chargeTime,lightningEffect:p.lightningEffect},
    motion:p.classCombat?.motionSerial||0,effects:p.classCombat?.effects.map(f=>f.name)||[],projectiles:p.classCombat?.controller.projectiles.map(q=>q.kind)||game.projectiles.map(q=>q.type),missiles:p.missileFireQueue.length,shield:p.shieldTimer,
    sounds:[...trace.sounds],texts:[...trace.texts],actions:[...trace.actions]});
   const act=(mode)=>mode.startsWith('skill')?p.useSkill(Number(mode.slice(-1)),{x:p.x+180,y:p.y+24,targetX:p.x+180,targetY:p.y+24}):p.classId==='wizard'?p.performLaserAttack(0):p.classCombat.basic({aimed:mode==='aim',x:p.x+180,y:p.y+24});
   const castCues=(id,mode)=>({wizard:{tap:[p.getBasicAttackSoundId()],skill1:['missile_launch'],skill2:['fireball_cast'],skill3:['shield_activate','magic_cast']},witch:{tap:['drain_orb'],aim:['drain_orb'],skill1:['poison_potion'],skill2:['summon'],skill3:['berserk_potion']},warrior:{tap:['warrior_slash'],aim:['sword_wave'],skill1:['shield_rush'],skill2:['punishing_charge'],skill3:['blood_pact']},archer:{tap:['archer_shot'],aim:['piercing_snipe'],skill1:['hunter_trap'],skill2:['shadow_leap'],skill3:['tracking_rain']}})[id][mode];
   const settle=()=>new Promise(r=>setTimeout(r,0));
   function unchanged(row,a,b){for(const key of ['hp','mp','rage','ready','motion','missiles','shield','cooldowns','uiCooldowns','targetHp','animation','effects','projectiles','sounds'])check(row,JSON.stringify(a[key])===JSON.stringify(b[key]),'rejection preserves '+key);}
   function tick(seconds){for(let t=0;t<seconds-1e-8;t+=.05)p.classCombat.update(Math.min(.05,seconds-t));}
   if(group==='boundaries'){
    for(const level of [1,8])for(const slot of [1,2,3])for(const offset of [-.001,0,.001]){
     await reset('wizard',level);const cost=slot===1?p.getMagicMissileManaCost():slot===2?p.getFireballManaCost():20;p.mp=cost+offset;
     const row={classId:'wizard',mode:'skill'+slot,level,cost,offset,checks:[],before:snapshot()};act(row.mode);await settle();row.first=snapshot();for(let i=0;i<40;i++)act(row.mode);await settle();row.after=snapshot();
     check(row,near(row.first.mp,row.before.mp-(offset>=0?cost:0)),'MP spent exactly once only at/above cost');
     check(row,row.first.sounds.length===(offset>=0?(slot===3?2:1):0),'success cues gated by MP');
     if(offset<0)unchanged(row,row.before,row.first);unchanged(row,row.first,row.after);rows.push(row);
    }
    for(const maxHp of [1000,101])for(const offset of [-.001,0,.001]){
     await reset('witch');p.maxHp=maxHp;p.hp=maxHp*.8+offset;const row={classId:'witch',mode:'summon-hp',maxHp,offset,checks:[],before:snapshot()};const accepted=act('skill2');row.first=snapshot();for(let i=0;i<40;i++)act('skill2');row.after=snapshot();
     check(row,accepted===(offset>0),'strictly above 80% HP required');check(row,near(row.first.hp,row.before.hp-(offset>0?maxHp*.8:0)),'single 80% max HP cost');
     check(row,p.classCombat.controller.summons.length===(offset>0?1:0),'one summon or none');if(offset<=0)unchanged(row,row.before,row.first);unchanged(row,row.first,row.after);rows.push(row);
    }
    for(const rage of [24.999,25,25.001]){
     await reset('warrior');p.classCombat.controller.rage=rage;const row={classId:'warrior',mode:'aim-rage',rage,checks:[],before:snapshot()};const accepted=act('aim');row.first=snapshot();for(let i=0;i<40;i++)act('aim');row.after=snapshot();
     check(row,accepted===(rage>=25),'rage threshold 25');check(row,near(row.first.rage,rage-(rage>=25?25:0)),'rage spent once');if(rage<25)unchanged(row,row.before,row.first);unchanged(row,row.first,row.after);rows.push(row);
    }
    // Other actions have no MP cost in these classes; zero MP must not become a new gate.
    for(const id of ['witch','warrior','archer'])for(const mode of ['tap','aim','skill1','skill2','skill3']){
     await reset(id);p.mp=0;const row={classId:id,mode,checks:[],before:snapshot()};const accepted=act(mode);await settle();row.first=snapshot();for(let i=0;i<40;i++)act(mode);row.after=snapshot();
     check(row,accepted===true,'zero MP action allowed by existing rules');check(row,p.mp===0,'no MP cost');check(row,row.first.motion===1,'one committed action');unchanged(row,row.first,row.after);rows.push(row);
    }
   }
   if(group==='cooldowns'){
    for(const id of ['wizard','witch','warrior','archer'])for(const mode of ['tap','aim','skill1','skill2','skill3'])for(const offset of [-1e-6,0,1e-6]){
     if(id==='wizard'&&mode==='aim')continue;await reset(id);const isSkill=mode.startsWith('skill'),slot=Number(mode.slice(-1));
     if(id==='wizard'){const key=isSkill?{1:'h',2:'u',3:'k'}[slot]:'j';p.skillCooldowns[key]=-offset;}
     else {const c=p.classCombat.controller;c.time=1;if(isSkill)c.cooldowns[slot]=1-offset;else c.basicReady=1-offset;}
     const row={classId:id,mode,offset,checks:[],before:snapshot()};act(mode);await settle();row.first=snapshot();for(let i=0;i<40;i++)act(mode);row.after=snapshot();
     const cues=castCues(id,mode);row.committedCues=row.first.sounds.filter(name=>cues.includes(name));
     check(row,JSON.stringify(row.committedCues)===JSON.stringify(offset>=0?cues:[]),'each committed cast cue exactly once only at/after recovery');
     if(offset<0)unchanged(row,row.before,row.first);unchanged(row,row.first,row.after);rows.push(row);
    }
   }
   if(group==='charge'){
    for(const id of ['witch','warrior','archer'])for(const level of [1,8])for(const empowered of (id==='archer'?[false,true]:[false]))for(const offset of [-1e-6,0,1e-6]){
     await reset(id,level);p.classCombat.controller.empowered=empowered;const threshold=basicChargeSeconds(p,empowered);p.startClassAction('ATTACK');p.classAim.elapsed=threshold+offset;
     const row={classId:id,level,empowered,threshold,offset,checks:[],before:snapshot()};const result=p.releaseClassAction('ATTACK');row.first=snapshot();const repeated=p.releaseClassAction('ATTACK');row.after=snapshot();
     const expectedCue=id==='warrior'?(offset>=0?'sword_wave':'warrior_slash'):id==='archer'?(offset>=0?'piercing_snipe':'archer_shot'):'drain_orb';
     check(row,result===true&&repeated===false,'release commits once');check(row,row.first.sounds.filter(name=>castCues(id,'tap').concat(castCues(id,'aim')).includes(name)).every(name=>name===expectedCue)&&row.first.sounds.filter(name=>name===expectedCue).length===1,'charge boundary selects correct action once');check(row,id!=='warrior'||row.first.rage===(offset>=0?75:100),'charge-only rage cost');unchanged(row,row.first,row.after);rows.push(row);
    }
    for(const offset of [-1e-6,0,1e-6]){
     const e=await reset('wizard');p.mp=0;p.attackPower=100;p.chargeTime=.3+offset;const row={classId:'wizard',mode:'continuous-laser-charge',offset,checks:[],before:snapshot()};act('tap');row.first=snapshot();row.damage=100000-e.hp;for(let i=0;i<40;i++)act('tap');row.after=snapshot();
     check(row,row.damage===(offset>=0?20:10),'existing 0.3 second charge step');check(row,row.first.mp===1,'laser at zero MP recovers on accepted hit');unchanged(row,row.first,row.after);rows.push(row);
    }
   }
   if(group==='healing'){
    for(const id of ['witch','warrior'])for(const mode of (id==='witch'?['tap','aim']:['tap','aim','skill1','skill2']))for(const hp of [50,99,99.5,99.75,100])for(const blocked of [false,true]){
     const e=await reset(id);p.maxHp=100;p.hp=hp;p.attackPower=id==='witch'?(mode==='tap'?1.5:3):1;if(id==='warrior')act('skill3');
     if(blocked)e.takeDamage=()=>false;clear();const row={classId:id,mode,hp,blocked,checks:[],before:snapshot()};act(mode);tick(id==='witch'?6:3);row.after=snapshot();row.damage=100000-e.hp;
     const budget=Math.ceil(row.damage*(id==='witch'?.5:.2)),actual=p.hp-hp;row.budget=budget;row.actual=actual;
     row.labels=recoveryLabels(row);
     check(row,near(actual,Math.min(100-hp,budget)),'actual healing matches one rounded damage budget and HP cap');check(row,row.labels.reduce((a,b)=>a+b,0)===Math.floor(actual+1e-8),'integer labels equal actual integer recovery without overstating fractional HP');if(blocked)check(row,actual===0&&row.labels.length===0,'blocked damage cannot heal or show recovery');rows.push(row);
    }
    // Use current released weapon definitions and real profile lookup, not fabricated healing bonuses.
    for(const id of ['wizard','witch','warrior','archer'])for(const hp of [50,99.5,100])for(const blocked of [false,true]){
     const e=await reset(id),data=p.getItemDataManager(),type=id==='wizard'?'magic_staff':'magic_'+id,def=data.getItemDefinition(type);
     const affix=data.getAffixPool(def.prefixPool).affixes.find(a=>a.id.startsWith('crimson_flash'));
     if(!affix)throw Error('Missing released crimson healing weapon '+id);
     p.equipment.weapon=data.createRewardItem(type,{prefixId:affix.id,instanceId:'cbt03-local-weapon',rolledValues:Object.fromEntries(Object.entries(affix.rolledEffects).map(([key,range])=>[key,range.max]))});p.maxHp=100;p.hp=hp;p.attackPower=10;
     if(blocked)e.takeDamage=()=>false;const bonus=p.getWeaponCombatProfile().restoreHpPerLaserHit;clear();
     const row={classId:id,mode:'released-weapon-healing',hp,blocked,bonus,weapon:structuredClone(p.equipment.weapon),checks:[],before:snapshot()};act('tap');if(p.classCombat)tick(3);row.after=snapshot();row.actual=p.hp-hp;row.damage=100000-e.hp;
     row.labels=recoveryLabels(row);
     const expected=blocked?0:Math.min(100-hp,Math.ceil(bonus)+(id==='witch'?Math.ceil(row.damage*.5):0));
     check(row,near(row.actual,expected),'released weapon healing actual amount');check(row,row.labels.reduce((a,b)=>a+b,0)===Math.floor(row.actual+1e-8),'visible integer healing matches accepted amount');rows.push(row);
    }
   }
   if(group==='weapon-routes'){
    for(const id of ['witch','warrior','archer'])for(const theme of ['riftcore','astral'])for(const hp of [50,99.5,100])for(const denied of [false,true]){
     const e=await reset(id),buff=id==='witch'&&theme==='astral';
     if(buff&&!denied)act('skill2'); // A real local summon makes the buff eligible.
     const data=p.getItemDataManager(),type=theme+'_'+id,def=data.getItemDefinition(type),affix=data.getAffixPool(def.prefixPool).affixes[0];
     p.equipment.weapon=data.createRewardItem(type,{prefixId:affix.id,instanceId:'cbt03-local-routed-weapon',rolledValues:Object.fromEntries(Object.entries(affix.rolledEffects).map(([key,range])=>[key,range.max]))});p.maxHp=100;p.hp=hp;p.attackPower=10;
     if(denied&&!buff)e.takeDamage=()=>false;
     const bonus=p.getWeaponCombatProfile().restoreHpPerLaserHit,mode=theme==='riftcore'?'aim':'skill3';clear();
     const row={classId:id,mode,theme,hp,denied,denialMeaning:buff?'no eligible ally':'damage rejected',bonus,weapon:structuredClone(p.equipment.weapon),checks:[],before:snapshot()};
     act(mode);const first=snapshot();for(let i=0;i<40;i++)act(mode);unchanged(row,first,snapshot());
     tick(theme==='riftcore'?6:buff?.3:id==='warrior'?8.2:3.2);row.after=snapshot();row.actual=p.hp-hp;row.damage=100000-e.hp;
     row.labels=recoveryLabels(row);
     const expected=denied?0:Math.min(100-hp,Math.ceil(bonus)+(id==='witch'&&theme==='riftcore'?Math.ceil(row.damage*.5):0));
     check(row,near(row.actual,expected),'routed weapon healing occurs once at accepted hit or eligible buff');
     check(row,row.labels.reduce((a,b)=>a+b,0)===Math.floor(row.actual+1e-8),'routed weapon recovery labels match actual integer healing');rows.push(row);
    }
   }
   if(group==='combined'){
    for(const id of ['witch','warrior'])for(const theme of ['magic','riftcore'])for(const targets of (id==='warrior'?[1,3]:[1]))for(const hp of [50,98,99,99.5,100])for(const blocked of [false,true]){
     const firstEnemy=await reset(id),enemies=[firstEnemy],data=p.getItemDataManager(),type=theme+'_'+id,def=data.getItemDefinition(type);
     const affix=data.getAffixPool(def.prefixPool).affixes.find(a=>theme==='riftcore'||a.id.startsWith('crimson_flash'));
     p.equipment.weapon=data.createRewardItem(type,{prefixId:affix.id,instanceId:'cbt03-combined-weapon',rolledValues:Object.fromEntries(Object.entries(affix.rolledEffects).map(([key,range])=>[key,range.max]))});
     for(let i=1;i<targets;i++){
      const e=new Monster(firstEnemy.x+i*5,firstEnemy.y+i*5,definition);Object.assign(e,{id:'cbt03-extra-'+i,isLocalOnly:true,hp:100000,maxHp:100000,defense:0,radius:16,isDead:false});game.monsterManager.monsters.set(e.id,e);enemies.push(e);
     }
     let acceptedHits=0;
     for(const e of enemies){const take=e.takeDamage.bind(e);e.takeDamage=(...args)=>{if(blocked)return false;const hp=e.hp,result=take(...args);if(e.hp<hp)acceptedHits++;return result;};}
     p.hp=hp;p.maxHp=100;p.attackPower=10;if(id==='warrior')act('skill3');
     const bonus=p.getWeaponCombatProfile().restoreHpPerLaserHit,mode=theme==='magic'?'tap':'aim';clear();
     const row={classId:id,mode,theme,targets,hp,blocked,bonus,checks:[],before:snapshot()};act(mode);const first=snapshot();for(let i=0;i<40;i++)act(mode);unchanged(row,first,snapshot());
     tick(id==='witch'?6:3);row.after=snapshot();row.damage=enemies.reduce((n,e)=>n+100000-e.hp,0);row.actual=p.hp-hp;row.acceptedHits=acceptedHits;
     row.labels=recoveryLabels(row);
     const weaponBudget=acceptedHits?Math.ceil(bonus)*(id==='warrior'?acceptedHits:1):0;
     const drainBudget=Math.ceil(row.damage*(id==='witch'?.5:.2));row.expected=Math.min(100-hp,weaponBudget+drainBudget);
     check(row,near(row.actual,row.expected),'combined healing keeps separate existing weapon and drain/lifesteal budgets');
     check(row,row.labels.reduce((a,b)=>a+b,0)===Math.floor(row.actual+1e-8),'combined labels neither duplicate nor omit accepted integer HP');
     if(blocked||hp===100)check(row,row.actual===0&&row.labels.length===0,'blocked/full HP emits no recovery label');rows.push(row);
    }
   }
   for(const row of rows)row.passed=row.checks.every(c=>c.passed);
   return rows;
  },group);
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
  assert.equal(report.cases.length,expectedCounts[group],'complete scenario matrix');
  report.passed=report.cases.every(c=>c.passed);
  console.log(JSON.stringify({group,cases:report.cases.length,passed:report.cases.filter(c=>c.passed).length,failed:report.cases.filter(c=>!c.passed).map(c=>({classId:c.classId,mode:c.mode,offset:c.offset,hp:c.hp,blocked:c.blocked,actual:c.actual,labels:c.labels,checks:c.checks.filter(x=>!x.passed)}))}));
  if(!report.passed)process.exitCode=1;
 }finally{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${group}.json`,JSON.stringify(report,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
