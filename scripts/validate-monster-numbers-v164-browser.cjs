const {chromium}=require('playwright'),fs=require('fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const out=process.env.QA_OUTPUT||'reports/damage-numbers-v164/verified';fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const results=[];try{for(const [orientation,width,height]of [['portrait',390,844],['landscape',844,390]])for(const classId of ['witch','archer','warrior']){
 const c=await b.newContext({viewport:{width,height},hasTouch:true,isMobile:true,serviceWorkers:'block'}),p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='127.0.0.1')return r.abort();if((process.env.QA_BASELINE||process.env.QA_HUD_BASELINE)&&['/src/js/main.js','/src/js/entities/Monster.js','/src/js/world/scenes/WorldScene.js','/src/js/combat/MonsterStatusBadges.js'].includes(u.pathname))return r.fulfill({contentType:'text/javascript',body:cp.execFileSync('git',['show',(process.env.QA_HUD_BASELINE?'15db6a036db499a8493d0b544cd3c261c9b4ac66':'62e1845d4503252a5eff0125831df889f818cb7a')+':'+u.pathname.slice(1)]).toString()});return r.continue()});await p.goto('http://127.0.0.1:8100/?local=1');await p.locator('#camp-name').fill('전투 겹침 진단');await p.locator('[data-camp=create]').click();await p.locator('[data-camp=character]').first().waitFor();await p.evaluate(async id=>{const n=game.net,d=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...d,activeClassId:id,questData:{...d.questData,basicTrainingCompleted:true,prologueCompleted:true}})},classId);await p.reload();await p.locator('[data-camp=prepare]').click();await p.locator('[data-camp=depart]').click();await p.locator('.camp-return').waitFor();await p.locator('#loading-overlay').waitFor({state:'hidden'});await p.waitForFunction(()=>!!game.localPlayer?.classCombat);
 const setup=await p.evaluate(async classId=>{
  game.loop.stop();let seed=163,randomCalls=0;Math.random=()=>{randomCalls++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};const s=game.sceneManager.currentScene,p=game.localPlayer,bridge=p.classCombat;game.ui.hideAllPopups();game.ui.isPaused=false;game.story.isStoryActive=false;game.tutorial.activeTutorial=null;s.zoneSpawnRules=[];game.monsterManager.monsters.clear();game.monsterManager.spawnTimer=-Infinity;s.safeZone=null;p.x=2000;p.y=2000;p.regenTimer=0;p.lastHitTimer=1;p.hp=p.maxHp=10000;p.mp=p.maxMp=10000;p.spawnProtectionTimer=0;p.autoAttackEnabled=false;p.direction=3;p.skillLevels.charge=8;p.skillLevels.rain=8;p.skillLevels.poison=8;
  const M=(await import('/src/js/entities/Monster.js')).default;const center=bridge.controller.combatOrigin(),mobs=[];
  for(const [i,dx,dy]of [[0,45,-22],[1,85,-16],[2,120,0],[3,50,24],[4,90,28],[5,130,34]]){const m=new M(center.x+dx,center.y+dy,await game.monsterData.loadDefinition('slime'));m.id='diagnostic-slime-'+i;m.isLocalOnly=true;m.hp=m.maxHp=1200;m.hpRegen=0;m.behavior.passive=true;m.chargeEnabled=false;m.isAggro=true;await m.init(m.assetPath);game.monsterManager.monsters.set(m.id,m);mobs.push(m)}
  const danger=new M(center.x+185,center.y+100,await game.monsterData.loadDefinition('emolga'));danger.id='diagnostic-warning';danger.isLocalOnly=true;danger.hp=danger.maxHp=1200;danger.behavior.passive=true;await danger.init(danger.assetPath);game.monsterManager.monsters.set(danger.id,danger);mobs.push(danger);
  p.currentTarget=mobs[1];p.currentTargetMode='manual';await game.resources.preparePlayableClassAssets(classId);await Promise.allSettled([...game.resources.loading.values()]);
  window.qa={s,p,bridge,mobs,danger,center,time:0,records:[],owner:null,role:null,tracking:false,frames:[],events:[],emissions:[],aggregateChecks:0,get randomCalls(){return randomCalls}};
  Date.now=()=>1700000000000+Math.round(qa.time*1000);performance.now=()=>qa.time*1000;bridge.visualEpoch=164;bridge.hitSerial=0;bridge.controller.time=0;s.time=0;
  const canonical=v=>JSON.parse(JSON.stringify(v).replaceAll(p.id,'PLAYER'));
  for(const m of mobs){const old=m.takeDamage;m.takeDamage=function(...a){const before=this.hp,result=old.apply(this,a);qa.events.push(canonical({time:qa.time,id:this.id,args:a,before,after:this.hp,result:result??null}));return result}}
  const emit=s.addDamageText;s.addDamageText=function(...a){qa.emissions.push(canonical({time:qa.time,args:a.slice(0,6)}));return emit.apply(this,a)};
  const tag=(obj,key,owner,role)=>{const old=obj[key];obj[key]=function(...args){const a=qa.owner,r=qa.role;qa.owner=typeof owner==='function'?owner():owner;qa.role=role;try{return old.apply(this,args)}finally{qa.owner=a;qa.role=r}}};
  for(const m of mobs){tag(m,'render',m.id,'monster');tag(m,'renderGroundGuides',m.id,'warning');if(!m.sprite.__qaWrapped){const old=m.sprite.draw;m.sprite.draw=function(...args){const r=qa.role;qa.role='body';try{return old.apply(this,args)}finally{qa.role=r}};m.sprite.__qaWrapped=true}}
  tag(p,'render','player','player');tag(bridge,'drawBody','player','body');
  const ctx=game.ctx,canvas=game.canvas,alphaCache=new WeakMap();
  const box=(x,y,w,h)=>{const t=ctx.getTransform(),r=canvas.getBoundingClientRect(),sx=r.width/canvas.width,sy=r.height/canvas.height;const pts=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([x,y])=>({x:(t.a*x+t.c*y+t.e)*sx+r.left,y:(t.b*x+t.d*y+t.f)*sy+r.top}));return{polygon:pts,left:Math.min(...pts.map(p=>p.x)),top:Math.min(...pts.map(p=>p.y)),right:Math.max(...pts.map(p=>p.x)),bottom:Math.max(...pts.map(p=>p.y))}};
  const add=(kind,b,extra={})=>{if(qa.tracking)qa.records.push({kind,owner:qa.owner,box:b,order:qa.records.length,alpha:ctx.globalAlpha,...extra})};
  const Renderer=(await import('/src/js/skills/renderers/SkillRenderer.js')).default;
  tag(Renderer,'drawTargetMarker',()=>qa.p.currentTarget?.id,'target-marker');
  const ellipse=ctx.ellipse;ctx.ellipse=function(x,y,rx,ry,...a){if(qa.role==='target-marker')add('target-marker',box(x-rx,y-ry,rx*2,ry*2));return ellipse.call(this,x,y,rx,ry,...a)};
  const txt=ctx.fillText;ctx.fillText=function(text,x,y,...rest){if(qa.tracking){const m=ctx.measureText(text),kind=qa.role==='monster'?(String(text).includes('슬라임')||text===qa.mobs.find(m=>m.id===qa.owner)?.name?'name':text==='!'?'aggro':'status'):qa.owner==='player'?'player-label':'damage';add(kind,box(x-m.actualBoundingBoxLeft,y-m.actualBoundingBoxAscent,m.actualBoundingBoxLeft+m.actualBoundingBoxRight,m.actualBoundingBoxAscent+m.actualBoundingBoxDescent),{text:String(text),font:ctx.font})}return txt.call(this,text,x,y,...rest)};
  const rect=ctx.fillRect;ctx.fillRect=function(x,y,w,h){if(qa.role==='monster'&&h===6&&w===60)add('hp',box(x,y,w,h));if(qa.role==='warning'&&Math.abs(w)>20&&Math.abs(h)>10)add('warning-lane',box(x,y,w,h));return rect.apply(this,arguments)};
  const draw=ctx.drawImage;ctx.drawImage=function(img,...a){if(qa.tracking&&(qa.role==='body'||qa.role==='monster')){let sx=0,sy=0,sw=img.width,sh=img.height,dx,dy,dw,dh;if(a.length===8)[sx,sy,sw,sh,dx,dy,dw,dh]=a;else if(a.length===4)[dx,dy,dw,dh]=a;else{[dx,dy]=a;dw=sw;dh=sh}if(qa.role==='body'){let cache=alphaCache.get(img);if(!cache){cache=new Map();alphaCache.set(img,cache)}const key=[sx,sy,sw,sh].join(',');let trim=cache.get(key);if(!trim){const off=document.createElement('canvas');off.width=Math.ceil(sw);off.height=Math.ceil(sh);const oc=off.getContext('2d',{willReadFrequently:true});oc.drawImage(img,sx,sy,sw,sh,0,0,sw,sh);const data=oc.getImageData(0,0,off.width,off.height).data;let l=sw,t=sh,r=0,b=0,count=0;for(let y=0;y<off.height;y++)for(let x=0;x<off.width;x++)if(data[(y*off.width+x)*4+3]>16){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1);count++}trim={l,t,r,b,count};cache.set(key,trim)}add('body',box(dx+dw*trim.l/sw,dy+dh*trim.t/sh,dw*(trim.r-trim.l)/sw,dh*(trim.b-trim.t)/sh),{sourcePixels:trim.count,sourceFrame:[sx,sy,sw,sh]})}else if(dw===20&&dh===20)add('status',box(dx,dy,dw,dh));}return draw.call(this,img,...a)};
  qa.capture=()=>{qa.records=[];qa.tracking=true;s.render(ctx);qa.tracking=false;
   for(const ft of s.floatingTexts){const state=s.monsterDamageNumbers?.states.get(ft);if(!state?.key)continue;
    const events=[...state.events].map(id=>qa.events.find(e=>e.id===state.targetId&&e.args[5]?.classHitId===id.replaceAll(p.id,'PLAYER')));
    if(events.some(e=>!e)||events.length!==state.count||events.reduce((sum,e)=>sum+Math.ceil(e.args[0]),0)!==state.total||ft.text!==`-${state.total}`)throw Error('Display aggregate differs from actual damage event sequence');
    qa.aggregateChecks++;
   }
   return qa.records};
  s.camera.x=p.x+p.width/2-game.canvas.width/(game.zoom*game.dpr)/2;s.camera.y=p.y+p.height/2-game.canvas.height/(game.zoom*game.dpr)/2;
  return{classId,center,zoom:game.zoom,dpr:game.dpr,mobs:mobs.map(m=>({id:m.id,name:m.name,x:m.x,y:m.y,width:m.width,height:m.height,renderWidth:m.renderWidth,renderHeight:m.renderHeight,hp:m.hp}))};
 },classId);
 const snapshots=[];for(const time of [0,.65,1.25,1.85,3.05,5.05]){
 const frame=await p.evaluate(({time,classId})=>{const q=qa;if(!q.started){q.started=true;q.accepted=q.p.useSkill(classId==='witch'?1:classId==='archer'?3:2,{x:q.center.x+80,y:q.center.y+8})}
 while(q.time+1e-6<time){const dt=Math.min(1/60,time-q.time);q.s.update(dt);q.time+=dt;const records=q.capture(),bodies=records.filter(r=>r.kind==='body');q.frames.push({t:q.time,bodies:bodies.map(r=>({owner:r.owner,alpha:r.alpha,pixels:r.sourcePixels,frame:r.sourceFrame})),alive:q.mobs.filter(m=>!m.isDead).map(m=>m.id),damageCount:q.s.floatingTexts.length})}
 // Independently start a real warning in the local fixture at each checkpoint.
 q.danger.chargeState='idle';q.danger.startCharge(q.center.x-80,q.center.y-40);q.danger.chargeTimer*=.5;
 const records=q.capture();return{time,accepted:q.accepted,target:q.p.currentTarget?.id,targetMode:q.p.currentTargetMode,records,damageCount:q.s.floatingTexts.length,statuses:q.mobs.map(m=>({id:m.id,status:m.classStatuses,alpha:m.alpha,dead:m.isDead,x:m.x,y:m.y,hp:m.hp})),effects:q.bridge.effects.map(e=>({name:e.name,age:e.age}))};},{time,classId});snapshots.push(frame);await p.screenshot({path:`${out}/${orientation}-${classId}-${String(time).replace('.','p')}.png`});}
 const proof=await p.evaluate(()=>({aggregateChecks:qa.aggregateChecks,frames:qa.frames,events:qa.events,emissions:qa.emissions,randomCalls:qa.randomCalls,hp:qa.mobs.map(m=>({id:m.id,hp:m.hp,status:m.classStatuses})),player:{hp:qa.p.hp,mp:qa.p.mp}}));const frames=proof.frames;
 if(!process.env.QA_BASELINE){
  const baseline=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'fixtures/monster-numbers-v164-baseline.json'))).cases.find(x=>x.orientation===orientation&&x.classId===classId);
  for(const key of ['events','emissions','randomCalls','hp','player'])assert.equal(crypto.createHash('sha256').update(JSON.stringify(proof[key])).digest('hex'),baseline.hashes[key],`${orientation}/${classId}/${key} must exactly match v163; player=${JSON.stringify(proof.player)}`);
  assert.equal(errors.length,0);assert.ok(classId==='archer'||proof.aggregateChecks>0);assert.ok(Math.max(...frames.map(f=>f.damageCount))<baseline.peak);
  if(orientation==='portrait'&&classId==='witch'){
   const edge=await p.evaluate(async()=>{
    const q=qa,s=q.s,manager=game.monsterManager,m=q.mobs[0];s._clearTransientWorldEffects();m.hp=m.maxHp=1000;m.isDead=false;m.classHitIds=new Map();m.statusEffects=[];
    const packet=(id,actor='qa-remote-a',extra={})=>({mid:m.id,aid:actor,dmg:7,meta:{classId:'warrior',barrage:true,barrageLock:{id:actor+':epoch:cast',until:Date.now()+1000},classHitId:actor+':epoch:'+id,...extra}});
    manager._onMonsterDamageReceived(packet(1));const immediate={hp:m.hp,text:s.floatingTexts[0].text,count:s.monsterDamageNumbers.countLabel(s.floatingTexts[0])};
    manager._onMonsterDamageReceived(packet(1));const duplicate={hp:m.hp,count:s.floatingTexts.length,text:s.floatingTexts[0].text};
    manager._onMonsterDamageReceived(packet(2));const combined={hp:m.hp,count:s.floatingTexts.length,text:s.floatingTexts[0].text,label:s.monsterDamageNumbers.countLabel(s.floatingTexts[0])};
    manager._onMonsterDamageReceived(packet(3,'qa-remote-b'));manager._onMonsterDamageReceived(packet(4,'qa-remote-a',{isCrit:true}));const separated=s.floatingTexts.length;
    const personalStart=s.floatingTexts.length;for(const text of ['-10','+10','-7','BLOCK'])game.addDamageText(0,0,text,'white',false);const personal=s.floatingTexts.slice(personalStart).map(t=>({text:t.text,timer:t.timer,label:s.monsterDamageNumbers.countLabel(t)}));
    m.hp=1;manager._onMonsterDamageReceived(packet(5));const dead=m.isDead;const before=m.hp;manager._onMonsterDamageReceived(packet(6));const deadIgnored=m.hp===before;
    const M=(await import('/src/js/entities/Monster.js')).default,fresh=new M(m.x,m.y,await game.monsterData.loadDefinition('slime'));fresh.id=m.id;fresh.isLocalOnly=true;await fresh.init(fresh.assetPath);manager.monsters.set(m.id,fresh);s.update(.01);
    const oldTargetNumbers=s.floatingTexts.filter(t=>s.monsterDamageNumbers.states.get(t)?.target===m).length;
    s._clearTransientWorldEffects();manager._onMonsterDamageReceived(packet(1));const newLife={count:s.floatingTexts.length,text:s.floatingTexts[0]?.text,label:s.monsterDamageNumbers.countLabel(s.floatingTexts[0])};s._clearTransientWorldEffects();
    return{immediate,duplicate,combined,separated,personal,dead,deadIgnored,oldTargetNumbers,newLife,cleared:s.floatingTexts.length===0};
   });
   assert.deepEqual(edge.immediate,{hp:993,text:'-7',count:null});assert.deepEqual(edge.duplicate,{hp:993,count:1,text:'-7'});assert.deepEqual(edge.combined,{hp:986,count:1,text:'-14',label:'2회'});assert.equal(edge.separated,3);assert.ok(edge.personal.every(x=>x.timer===1.5&&x.label===null));assert.equal(edge.dead,true);assert.equal(edge.deadIgnored,true);assert.equal(edge.oldTargetNumbers,0);assert.deepEqual(edge.newLife,{count:1,text:'-7',label:null});assert.equal(edge.cleared,true);fs.writeFileSync(out+'/lifecycle.json',JSON.stringify(edge,null,2));
  }
 }
 if(process.env.QA_HUD_EDGES&&!process.env.QA_HUD_BASELINE){
  const measured=require('./measure-monster-hud-v165.cjs').measureCases([{orientation,setup,snapshots}])[0];
  const baseline=require('./fixtures/monster-hud-v165-baseline.json').cases.find(c=>c.orientation===orientation&&c.classId===classId);
  for(const [i,frame]of measured.frames.entries()){
   assert.equal(frame.labels,baseline.frames[i].labels,'every original name, HP and status draw remains');
   assert.ok(frame.hudPairs<=baseline.frames[i].hudPairs,`${orientation}/${classId}/${frame.time}: HUD overlap increased`);
   assert.ok(frame.overPlayer<=baseline.frames[i].overPlayer,`${orientation}/${classId}/${frame.time}: player covered more`);
   assert.ok(frame.overTarget<=baseline.frames[i].overTarget,`${orientation}/${classId}/${frame.time}: target covered more`);
  }
 }
 if(process.env.QA_HUD_EDGES&&classId==='witch')await require('./monster-hud-v165-edge-cases.cjs')(p,out,orientation);
 results.push({orientation,width,height,setup,snapshots,...proof,errors});fs.writeFileSync(out+'/raw.json',JSON.stringify(results,null,2));console.log(JSON.stringify({orientation,classId,accepted:snapshots[0].accepted,maxDamage:Math.max(...frames.map(f=>f.damageCount)),aggregateChecks:proof.aggregateChecks,errors}));await c.close();
 }}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
