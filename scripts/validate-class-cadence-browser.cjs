const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
const BASE=process.env.QA_BASE||'http://127.0.0.1:8100',OUT='reports/class-action';
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const errors=[],external=[];try{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===new URL(BASE).origin||['data:','blob:'].includes(u.protocol))return r.continue();external.push(u.href);return r.abort();});
 await page.goto(BASE+'/?local=1');await page.locator('#camp-name').fill('Cadence fixture');await page.locator('[data-camp=create]').tap();await page.locator('[data-camp=character]').first().tap();await page.locator('[data-camp="select-class:witch"]').tap();await page.waitForFunction(()=>game.localPlayer?.classId==='witch'&&!game.sceneManager.currentScene.busy);
 await page.locator('[data-camp=depart]').tap();await page.waitForFunction(()=>document.querySelector('#camp-scene')?.dataset.view==='prepare');await page.locator('[data-camp=depart]').tap();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
 const cases=await page.evaluate(()=>{
  game.loop.stop();game.monsterManager.monsters.clear();game.projectiles=[];game.tutorial=null;game.input.setEnabled(true);game.input.setAllowedActions(null);
  const p=game.localPlayer;p.autoAttackEnabled=false;p.intelligence=p.agility=p.wisdom=0;p.attackSpeed=1;p.hp=p.maxHp=1000;const result=[];
  const key=(type)=>window.dispatchEvent(new KeyboardEvent(type,{key:'j',code:'KeyJ',bubbles:true}));
  const button=document.querySelector('#action-attack-j'),box=button.getBoundingClientRect();let id=0;
  const touch=(type,identifier)=>{const t=new Touch({identifier,target:button,clientX:box.x+box.width/2,clientY:box.y+box.height/2});button.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[t],targetTouches:type==='touchend'?[]:[t],changedTouches:[t]}));};
  for(const classId of ['witch','warrior','archer'])for(const fps of [10,30,60,120])for(const buff of [false,true]){
   game.input.releaseAllActions();p.classId=classId;p.initializeClassCombat();const c=p.classCombat.controller;c.rage=100;
   if(buff)c.state(p).berserkUntil=100;
   const actions=[],old=c.hooks.action;c.hooks.action=(kind,data)=>{if(kind==='basic')actions.push({at:c.time,aimed:data.aimed,interval:data.interval});old?.(kind,data);};
   const start=c.time;
   for(let frame=0;frame<fps*2;frame++){p.update(1/fps);for(let n=0;n<8;n++){if(n%2){key('keydown');key('keyup');}else{const current=++id;touch('touchstart',current);touch('touchend',current);}}}
   const rapid=actions.slice();game.ui.isPaused=true;const pausedAt=c.time,pausedCount=actions.length;for(let n=0;n<fps;n++){p.update(1/fps);key('keydown');key('keyup');}const pauseStable=c.time===pausedAt&&actions.length===pausedCount;game.ui.isPaused=false;
   // Fully release before held input; no direct controller attack invocation.
   game.input.releaseAllActions();for(let n=0;n<fps;n++)p.update(1/fps);c.rage=100;
   key('keydown');for(let n=0;n<Math.ceil(fps*.6);n++)p.update(1/fps);const held=p.classCombat.currentMotion();key('keyup');const keyRelease=actions.at(-1);
   for(let n=0;n<fps*2;n++)p.update(1/fps);c.rage=100;const holdId=++id;touch('touchstart',holdId);for(let n=0;n<Math.ceil(fps*.6);n++)p.update(1/fps);const touchHeld=p.classCombat.currentMotion();touch('touchend',holdId);
   result.push({classId,fps,buff,start,rapid,pauseStable,heldFrame:held?.held?0:null,heldDebug:{motion:held,aim:p.classAim,input:game.input.isPressed('ATTACK'),paused:p.classCombat.paused()},heldRelease:keyRelease,touchHeldFrame:touchHeld?.held?0:null,touchRelease:actions.at(-1),effective:p.getEffectiveClassAttackSpeed()});
  }
  return result;
 });
 for(const c of cases){assert.ok(c.rapid.length>0,JSON.stringify(c));for(let i=1;i<c.rapid.length;i++)assert.ok(c.rapid[i].at-c.rapid[i-1].at>=c.rapid[i-1].interval-1e-8);assert.ok(c.pauseStable);assert.equal(c.heldFrame,0,JSON.stringify(c));assert.equal(c.heldRelease.aimed,true);assert.equal(c.touchHeldFrame,0);assert.equal(c.touchRelease.aimed,true);assert.ok(Math.abs(c.effective-(c.buff?1.7:1))<1e-8);}
 const receiverPages=[];
 for(let i=0;i<2;i++){
  const receiverContext=await browser.newContext();const receiver=await receiverContext.newPage();receiver.on('pageerror',e=>errors.push(e.message));
  await receiver.route('**/*',r=>{const u=new URL(r.request().url());if(u.pathname==='/__class-remote-qa')return r.fulfill({contentType:'text/html',body:'<!doctype html><title>Remote visual fixture</title>'});if(u.origin===new URL(BASE).origin)return r.continue();external.push(u.href);return r.abort();});
  await receiver.goto(BASE+'/__class-remote-qa');await receiver.evaluate(async()=>{const m=await import('/src/js/combat/ClassVisuals.js');window.RemoteVisual=m.default;});receiverPages.push(receiver);
 }
 const snapshot=await page.evaluate(()=>{const p=game.localPlayer;p.update(.25);p.update(.25);p.classAim=null;p.startClassAction('ATTACK');p.update(.25);p.update(.25);p.update(.1);return p.classCombat.visualSnapshot();});
 const remote=await Promise.all(receiverPages.map(receiver=>receiver.evaluate(async packet=>{
  let now=packet.ts,field=packet.fieldId,damage=0;Date.now=()=>now;
  window.game={resources:{loadImage:async()=>({width:768,height:768})},net:{_getCurrentFieldId:()=>field,sendMonsterDamage:()=>damage++,sendPlayerDamage:()=>damage++},sceneManager:{currentScene:{}},monsterManager:{worldGeneration:1},zone:{currentZone:{id:'fixture'}}};
  const owner={hp:100,x:0,y:0,takeDamage:()=>damage++},view=new window.RemoteVisual(owner);
  const accepted=view.receive(packet),duplicate=view.receive(packet),reordered=view.receive({...packet,sequence:packet.sequence-1});await Promise.resolve();const draws=[];const drawn=view.drawBody({drawImage:(...a)=>draws.push(a)},0,0,160,160);const pose=draws[0]?.slice(1,5);
  now+=301;view.advance();const expired=view.motion===null;
  now=packet.ts;view.receive({...packet,sequence:packet.sequence+1});field+='-changed';view.advance();const fieldCleared=view.motion===null;
  owner.isDead=true;view.receive({...packet,fieldId:field,sequence:packet.sequence+2});const deathCleared=view.motion===null;
  return {accepted,duplicate,reordered,drawn,pose,expired,fieldCleared,deathCleared,damage,hp:owner.hp};
 },snapshot)));
 for(const r of remote){assert.equal(r.accepted,true);assert.equal(r.duplicate,false);assert.equal(r.reordered,false);assert.equal(r.drawn,true);assert.equal(r.pose[0],0,'held frame0');assert.equal(r.expired,true);assert.equal(r.fieldCleared,true);assert.equal(r.deathCleared,true);assert.equal(r.damage,0);assert.equal(r.hp,100);}assert.deepEqual(remote[0],remote[1]);
 const lifecycle=await page.evaluate(()=>{
  const p=game.localPlayer,scene=game.sceneManager.currentScene,results=[];scene.checkCollision=()=>false;
  const event=(type,key,code)=>window.dispatchEvent(new KeyboardEvent(type,{key,code,bubbles:true}));
  const tap=()=>{event('keydown','j','KeyJ');event('keyup','j','KeyJ');};
  for(const classId of ['witch','warrior','archer']){
   game.input.releaseAllActions();p.classId=classId;p.isDead=false;p.isDying=false;p.hp=1000;p.attackSpeed=1;p.wisdom=0;p.initializeClassCombat();p.x=p.y=1500;
   tap();const initial=p.classCombat.currentMotion(),segments=[];
   for(const [key,code,row,axis,sign]of[['ArrowRight','ArrowRight',3,'x',1],['ArrowLeft','ArrowLeft',2,'x',-1],['ArrowUp','ArrowUp',0,'y',-1],['ArrowDown','ArrowDown',1,'y',1]]){
    const before=p[axis];event('keydown',key,code);p.update(.05);const moved=p[axis]-before;
    for(let i=0;i<20;i++)tap();const motion=p.classCombat.currentMotion();segments.push({row:p.direction,expectedRow:row,moved,sign,id:motion?.id,started:motion?.started});event('keyup',key,code);
   }
   event('keydown','ArrowRight','ArrowRight');p.update(.25);const walking={state:p.state,isAttacking:p.isAttacking,motion:p.classCombat.currentMotion()};event('keyup','ArrowRight','ArrowRight');p.update(.02);const idle={state:p.state,isAttacking:p.isAttacking,motion:p.classCombat.currentMotion()};
   // A faster accepted recovery can end visual body motion before legacy .4s isAttacking.
   p.attackSpeed=100;for(let n=0;n<4;n++)p.update(.25);tap();p.update(.21);const distinct={motion:p.classCombat.currentMotion(),isAttacking:p.isAttacking};
   p.isDead=true;p.hp=0;p.update(.01);const death={disposed:p.classCombat.controller.disposed,motion:p.classCombat.currentMotion(),aim:p.classAim};
   p.isDead=false;p.hp=1000;p.initializeClassCombat();tap();const bridge=p.classCombat,token=scene.zoneTransitionToken;scene.zoneTransitionToken=(Number(token)||0)+1;scene.isZoneTransitioning=true;p.update(.01);const exit={disposed:bridge.controller.disposed,motion:bridge.currentMotion(),effects:bridge.effects.length};scene.zoneTransitionToken=token;scene.isZoneTransitioning=false;
   results.push({classId,initial,segments,walking,idle,distinct,death,exit});
  }
  return results;
 });
 for(const r of lifecycle){assert.ok(r.initial);for(const m of r.segments){assert.equal(m.row,m.expectedRow);assert.ok(m.moved*m.sign>0);assert.equal(m.id,r.initial.id,'failed input cannot restart motion identity');assert.equal(m.started,r.initial.started,'failed input cannot restart motion time');}assert.equal(r.walking.motion,null);assert.equal(r.walking.state,'move');assert.equal(r.walking.isAttacking,false);assert.equal(r.idle.motion,null);assert.equal(r.idle.state,'idle');assert.equal(r.distinct.motion,null);assert.equal(r.distinct.isAttacking,true,'visual body duration is distinct from legacy boolean');assert.equal(r.death.disposed,true);assert.equal(r.death.motion,null);assert.equal(r.death.aim,null);assert.equal(r.exit.disposed,true);assert.equal(r.exit.motion,null);assert.equal(r.exit.effects,0);}
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(`${OUT}/cadence-browser.json`,JSON.stringify({scope:'Actual Chromium DOM KeyboardEvent/TouchEvent handlers -> Player -> Bridge -> Controller; controlled Player.update dt at10/30/60/120Hz, not a physical display FPS benchmark. Local account only.',cases,remoteContexts:remote,lifecycle,errors,external},null,2));console.log(JSON.stringify({cases:cases.length,remoteContexts:remote.length,lifecycle:lifecycle.length,errors,external}));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
