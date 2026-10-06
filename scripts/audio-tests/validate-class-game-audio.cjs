const {chromium}=require('@playwright/test');const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--autoplay-policy=user-gesture-required']});const report={cases:[],errors:[],external:[]};try{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));const base=process.env.QA_URL||'http://127.0.0.1:8100';await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===base||['data:','blob:'].includes(u.protocol))return r.continue();report.external.push(u.href);return r.abort()});
 await page.goto(base+'/?local=1');await page.locator('#camp-name').fill('Audio fixture');await page.locator('[data-camp=create]').tap();await page.locator('[data-camp=character]').first().tap();await page.locator('[data-camp="select-class:witch"]').tap();await page.waitForFunction(()=>game.localPlayer.classId==='witch'&&!game.sceneManager.currentScene.busy);
 await page.locator('[data-camp=depart]').tap();await page.waitForFunction(()=>document.querySelector('#camp-scene')?.dataset.view==='prepare');await page.locator('[data-camp=depart]').tap();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
 await page.waitForFunction(()=>game.sound.currentBgmId==='bgm_cabin'&&game.sound.ctx.state==='running');
 report.audioContextState=await page.evaluate(()=>game.sound.ctx.state);
 report.cases=await page.evaluate(async()=>{
  game.loop.stop();game.monsterManager.monsters.clear();game.projectiles=[];game.tutorial=null;game.input.setEnabled(true);game.input.setAllowedActions(null);const p=game.localPlayer,s=game.sound;s.setBgmVolume(0);const bgm=s.currentBgmId;const out=[];
  const a=s.ctx.createAnalyser();a.fftSize=1024;s.sfxGain.connect(a);const samples=new Float32Array(1024);
  const collect=async()=>{let energy=0,peak=0,n=0;for(let k=0;k<12;k++){await new Promise(r=>setTimeout(r,25));a.getFloatTimeDomainData(samples);for(const x of samples){energy+=x*x;peak=Math.max(peak,Math.abs(x));n++;}}return{rms:Math.sqrt(energy/n),peak}};
  const events=[];const old=s.playClassEvent.bind(s);s.playClassEvent=(name,data,options)=>{const accepted=old(name,data,options);events.push({name,accepted});return accepted};
  for(const classId of ['witch','warrior','archer']){
   p.classId=classId;p.initializeClassCombat();p.hp=p.maxHp=1000;p.isDead=false;p.autoAttackEnabled=false;const c=p.classCombat.controller;c.rage=100;
   for(const mode of ['tap','aim','skill1','skill2','skill3']){
    await new Promise(r=>setTimeout(r,450));for(let i=0;i<12;i++)p.update(.25);c.rage=100;p.hp=p.maxHp;c.cooldowns={};const start=events.length;const options={aimed:mode==='aim',x:p.x+160,y:p.y};
    const accepted=mode.startsWith('skill')?p.classCombat.skill(Number(mode.slice(-1)),options):p.classCombat.basic(options);
    const rejected=mode.startsWith('skill')?p.classCombat.skill(Number(mode.slice(-1)),options):p.classCombat.basic(options);
    const pcm=await collect();out.push({classId,mode,accepted,rejected,events:events.slice(start),...pcm,bgm:s.currentBgmId,bgmUnchanged:s.currentBgmId===bgm});
   }
  }
  p.classId='wizard';p.initializeClassCombat();game.tutorial={isActionAllowed:()=>true,trigger(){}};const mageEvents=[],originalSfx=s.playSfx.bind(s);s.playSfx=id=>{mageEvents.push(id);return originalSfx(id)};
  for(const slot of [1,2,3]){await new Promise(r=>setTimeout(r,600));p.mp=p.maxMp=1000;p.skillCooldowns={h:0,u:0,k:0};const before=mageEvents.length;p.useSkill(slot,{x:p.x+160,y:p.y});const first=mageEvents.length;p.useSkill(slot,{x:p.x+160,y:p.y});out.push({classId:'wizard',mode:`skill${slot}`,mageEvents:mageEvents.slice(before),duplicateSilent:mageEvents.length===first,...await collect(),bgmUnchanged:s.currentBgmId===bgm});}
  // Insufficient summon must not emit a success cue.
  p.classId='witch';p.initializeClassCombat();p.hp=p.maxHp*.8;const before=events.length;const rejected=p.classCombat.skill(2,{target:{x:p.x,y:p.y}});out.push({classId:'witch',mode:'insufficient-summon',rejected,eventCount:events.length-before});
  game.ui.isPaused=true;const pauseBefore=events.length;const pauseRejected=p.classCombat.basic({target:{x:p.x+100,y:p.y}});game.ui.isPaused=false;
  out.push({classId:'witch',mode:'pause',rejected:pauseRejected,eventCount:events.length-pauseBefore,bgm:s.currentBgmId});
  const hiddenDescriptor=Object.getOwnPropertyDescriptor(document,'hidden');s.setMasterVolume(.17);Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
  const hiddenGain=s.masterGain.gain.value,hiddenSound=s.playClassEvent('archer_shot');Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));const restoredGain=s.masterGain.gain.value;if(hiddenDescriptor)Object.defineProperty(document,'hidden',hiddenDescriptor);else delete document.hidden;
  out.push({mode:'synthetic-visibility',hiddenGain,hiddenSound,restoredGain});
  s.sfxGain.disconnect(a);s.setBgmVolume(.65);return out;
 });
 for(const c of report.cases){if(c.classId==='wizard'){assert.ok(c.mageEvents.length>0);assert.ok(c.duplicateSilent);assert.ok(c.rms>.00001);assert.ok(c.bgmUnchanged);continue}if(c.mode==='synthetic-visibility'){assert.equal(c.hiddenGain,0);assert.equal(c.hiddenSound,false);assert.ok(Math.abs(c.restoredGain-.17)<1e-6);continue}if(c.mode==='insufficient-summon'||c.mode==='pause'){assert.equal(c.rejected,false);assert.equal(c.eventCount,0);continue}assert.equal(c.accepted,true,JSON.stringify(c));assert.equal(c.rejected,false,JSON.stringify(c));assert.ok(c.events.some(x=>x.accepted),JSON.stringify(c));assert.ok(c.rms>.00001,JSON.stringify(c));assert.ok(c.bgmUnchanged)}assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
 }finally{fs.mkdirSync('reports/class-audio',{recursive:true});fs.writeFileSync('reports/class-audio/gameplay-report.json',JSON.stringify(report,null,2));await browser.close()}console.log(JSON.stringify(report,null,2));})().catch(e=>{console.error(e);process.exitCode=1});
