require('./lib/qa-preflight.cjs');
const {chromium}=require('playwright');const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const report=[];try{for(const id of ['warrior','witch','archer']){const context=await browser.newContext({viewport:{width:780,height:360},hasTouch:true,isMobile:true,serviceWorkers:'block'}),page=await context.newPage();await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:8100/?local=1');await page.locator('#camp-name').fill('표시 검증');await page.locator('[data-camp=create]').tap();await page.locator('[data-camp=character]').first().waitFor();
 await page.evaluate(async id=>{const n=game.net,p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,activeClassId:id,questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}})},id);
 await page.reload();await page.locator('[data-camp=character]').first().waitFor();await page.locator('[data-camp=prepare]').tap();await page.locator('[data-camp=depart]').tap();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});


await page.evaluate(async()=>{window.chargeState=(await import('/src/js/ui/ClassChargeGauge.js')).classChargeState;const p=game.localPlayer,c=p.classCombat.controller;game.monsterManager.monsters.clear();game.sceneManager.currentScene.zoneSpawnRules=[];game.sceneManager.currentScene.checkCollision=()=>false;c.enemies=()=>[];c.rage=100;window.feedbackQA={p,c};});
const gauges=[];
for(const input of ['keyboard','mouse','touch']){
 await page.evaluate(()=>{feedbackQA.c.basicReady=0;feedbackQA.c.rage=100;feedbackQA.p.skillLevels.shot=8;});
 const button=await page.locator('#action-attack-j').boundingBox(),x=button.x+button.width/2,y=button.y+button.height/2;const client=await context.newCDPSession(page);
 if(input==='keyboard')await page.keyboard.down('j');else if(input==='mouse'){await page.mouse.move(x,y);await page.mouse.down();}else await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await page.waitForTimeout(90);const partial=await page.evaluate(()=>({state:chargeState(feedbackQA.p)}));
 assert.ok(partial.state.progress>0);assert.equal(await page.locator('#class-charge-gauge').count(),0);
 await page.waitForTimeout(500);if(input==='keyboard')await page.screenshot({path:`/tmp/class-charge-${id}.png`});assert.equal(await page.evaluate(()=>chargeState(feedbackQA.p)?.ready),true);
 if(input==='keyboard')await page.keyboard.up('j');else if(input==='mouse')await page.mouse.up();else await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(()=>!chargeState(feedbackQA.p));gauges.push({input,partial});
 if(id==='archer'&&input==='keyboard'){await page.screenshot({path:'/tmp/archer-moving-trail.png'});}
 await page.waitForTimeout(800);
}
if(id==='warrior'){
 // The popup is batched by simulation time, so wall-clock sleeps can race a
 // slow CI frame. Keep the HP/text assertions and observe the real popup.
 const healingHp=await page.evaluate(()=>{const {p,c}=feedbackQA;const texts=[],original=game.addDamageText,damage=c.hooks.damage;
  feedbackQA.healing={texts,restore(){game.addDamageText=original;c.hooks.damage=damage;}};
  game.addDamageText=(x,y,text,...args)=>{texts.push(text);original.call(game,x,y,text,...args)};
  p.hp=20.7;c.bloodUntil=c.time+8;c.hooks.damage=(e,n)=>{e.hp-=n;return n};const e={hp:1000},group={};for(const n of [33,33,34])c.skillHit(e,n,{},null,group);return p.hp;});
 let healingTexts;
 try{await page.waitForFunction(()=>feedbackQA.healing.texts.includes('+20'),null,{timeout:5000});healingTexts=await page.evaluate(()=>feedbackQA.healing.texts);}
 finally{await page.evaluate(()=>feedbackQA.healing.restore());}
 assert.ok(Math.abs(healingHp-40.7)<1e-8);assert.ok(healingTexts.includes('+20'));assert.ok(healingTexts.filter(t=>t.startsWith('+')).every(t=>/^\+\d+$/.test(t)));
}
await page.evaluate(()=>{feedbackQA.c.basicReady=0;feedbackQA.c.rage=100});await page.keyboard.down('j');await page.waitForTimeout(150);await page.evaluate(()=>{feedbackQA.p.classAim=null});await page.waitForFunction(()=>!chargeState(feedbackQA.p));await page.keyboard.up('j');
await page.evaluate(()=>{feedbackQA.p.startClassAction('ATTACK');feedbackQA.p.isDead=true});await page.waitForFunction(()=>!chargeState(feedbackQA.p));await page.evaluate(()=>{feedbackQA.p.isDead=false;feedbackQA.p.hp=feedbackQA.p.maxHp;feedbackQA.p.initializeClassCombat();feedbackQA.c=feedbackQA.p.classCombat.controller;feedbackQA.c.enemies=()=>[]});
if(id==='archer'){
 const leap=await page.evaluate(()=>{const {p,c}=feedbackQA;c.cooldowns[2]=0;const from={x:p.x,y:p.y};p.useSkill(2,{x:p.x+p.width/2+200,y:p.y+p.height/2});return{dx:p.x-from.x,dy:p.y-from.y,empowered:c.empowered};});assert.equal(leap.dx,-160);assert.equal(leap.dy,0);assert.equal(leap.empowered,true);
}
await page.evaluate(()=>{feedbackQA.p.startClassAction('ATTACK');feedbackQA.p.classCombat.dispose()});assert.equal(await page.evaluate(()=>!chargeState(feedbackQA.p)),true);
if(id==='archer'){
 const trail=await page.evaluate(async()=>{const p=game.localPlayer;p.initializeClassCombat();const c=p.classCombat.controller;c.enemies=()=>[];game.sceneManager.currentScene.checkCollision=()=>false;await game.resources.preparePlayableClassAssets('archer');const b=p.classCombat;await new Promise(r=>setTimeout(r,30));c.basicReady=0;c.basic({aimed:true,x:p.x+500,y:p.y+p.height/2});c.update(.12);const arrow=c.projectiles.find(p=>p.kind==='snipe');if(!arrow)throw Error('missing moving snipe');const canvas=document.createElement('canvas');canvas.width=500;canvas.height=180;const ctx=canvas.getContext('2d');ctx.fillStyle='#26323b';ctx.fillRect(0,0,500,180);ctx.translate(100-arrow.x,90-arrow.y);b.renderGround(ctx);b.render(ctx);return{png:canvas.toDataURL().split(',')[1],age:arrow.age,x:arrow.x,speed:arrow.speed};});fs.writeFileSync('/tmp/archer-trail-detail.png',Buffer.from(trail.png,'base64'));assert.ok(trail.age>0&&trail.speed===780);
 const image=await page.evaluate(async()=>{const {default:Monster}=await import('/src/js/entities/Monster.js');const def=await game.monsterData.loadDefinition('slime');const canvas=document.createElement('canvas');canvas.width=520;canvas.height=240;const ctx=canvas.getContext('2d');ctx.fillStyle='#26323b';ctx.fillRect(0,0,520,240);await game.resources.loadImage('assets/resource/classes/status.webp');
 for(const [x,legacy] of [[130,false],[390,true]]){const m=new Monster(x,90,def);await m.init(m.assetPath);m.classStatuses=Object.fromEntries(['poison','root','stun','taunt','mark','berserk'].map(type=>[type,{remaining:2,stacks:2}]));if(legacy){m.statusEffects=[{type:'burn',duration:2,damage:1}];m.electrocutedTimer=2;}m.render(ctx,{x:0,y:0,width:520,height:240});ctx.fillStyle='white';ctx.fillText(legacy?'burn + shock + class statuses':'class statuses',x-70,210);}
 return canvas.toDataURL().split(',')[1];});fs.writeFileSync('/tmp/monster-foot-statuses.png',Buffer.from(image,'base64'));
}
report.push({id,gauges});await context.close();}
fs.writeFileSync('/tmp/class-feedback-v148-browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
