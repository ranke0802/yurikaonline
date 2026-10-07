const {chromium}=require('@playwright/test');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=(process.env.QA_URL||'http://127.0.0.1:8100').replace(/\/$/,''),out=process.env.QA_OUTPUT||'reports/combat-guidance-v172';
if(!process.env.QA_SIZE){
 const {execFileSync}=require('node:child_process');
 for(const size of ['portrait','landscape'])execFileSync(process.execPath,[__filename],{env:{...process.env,QA_SIZE:size},stdio:'inherit'});
 process.exit(0);
}
const orientation=process.env.QA_SIZE||'portrait',viewport=orientation==='portrait'?{width:390,height:844}:{width:844,height:390};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const report={orientation,viewport,sourceHashes:{},external:[],errors:[],scenarios:[],scope:'Isolated local=1. Native mobile touch/UI/rendering with in-memory battle/network fixtures. No operating database. Guidance-only regression.'};
 try{
 const page=await browser.newPage({viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===base||['data:','blob:'].includes(u.protocol))return r.continue();report.external.push(u.href);return r.abort()});
 for(const path of ['src/js/ui/SkillAvailability.js','src/js/ui/ClassSkillUI.js','src/js/ui/UIManager.js','src/js/combat/ClassCombatController.js','src/js/combat/ClassCombatBridge.js','src/js/entities/Player.js','src/css/style.css','src/css/combat-polish.css']){
  const r=await page.request.get(base+'/'+path);assert.equal(r.status(),200);const bytes=await r.body();assert.deepEqual(bytes,fs.readFileSync(path));report.sourceHashes[path]=crypto.createHash('sha256').update(bytes).digest('hex');
 }
 await page.goto(base+'/?local=1');await page.locator('#camp-name').fill('CBT03 안내 QA');await page.locator('[data-camp=create]').tap();await page.locator('[data-camp=character]').first().waitFor();
 await page.evaluate(async()=>{const n=game.net,p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,activeClassId:'wizard',questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}})});
 await page.reload();await page.locator('[data-camp=prepare]').tap();await page.locator('[data-camp=depart]').tap();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
 await page.evaluate(async()=>{
  if(!game.isLocalMode)throw Error('local only');game.loop.stop();game.tutorial={isActionAllowed:()=>true,trigger(){}};game.ui.isPaused=false;
  const p=game.localPlayer,scene=game.sceneManager.currentScene;const {default:Monster}=await import('/src/js/entities/Monster.js');
  const {skillAvailability}=await import('/src/js/ui/SkillAvailability.js');
  const definition=await game.monsterData.loadDefinition('slime');const originalLog=game.ui.logSystemMessage.bind(game.ui),originalAction=p.triggerAction.bind(p);
  const qa=window.qa={p,scene,logs:[],actions:[],packets:[],skillAvailability};
  game.ui.logSystemMessage=text=>{qa.logs.push({text,at:performance.now()});return originalLog(text)};
  p.triggerAction=text=>{qa.actions.push({text,at:performance.now()});return originalAction(text)};
  const net={playerId:p.id,isHost:true,isLocalMode:true,connected:true,zoneParticipationEnabled:true,_getCurrentFieldId:()=> 'guidance-local',
   isSharedFieldActive:()=>false,sendPlayerAttack:(...a)=>qa.packets.push(['attack',...a]),sendChanneling:(...a)=>qa.packets.push(['channel',...a]),
   sendMonsterDamage:(...a)=>{qa.packets.push(['damage',...a]);return !game.monsterManager.isMonsterCombatBlocked()},sendPlayerDamage:(...a)=>{qa.packets.push(['support',...a]);return true},
   sendPlayerHp:(...a)=>qa.packets.push(['hp',...a]),syncClassSummons(){}};
  game.net=p.net=game.monsterManager.net=net;p.saveProfilePatch=()=>Promise.resolve({ok:true});
  qa.reset=async id=>{
   game.input.resetState?.();p.classCombat?.dispose();p.classId=p.activeClassId=id;p.hp=p.maxHp=1000;p.mp=p.maxMp=1000;p.attackPower=10;p.attackSpeed=1;p.wisdom=0;p.critRate=0;p.isDead=p.isDying=false;p.autoAttackEnabled=false;
   p.classStatuses={};p.knockback={vx:0,vy:0};p.equipment.weapon=null;p.skillLevels=Object.fromEntries(['laser','missile','fireball','shield','lifeDrain','poison','summon','berserk','cleave','challenge','charge','bloodPact','shot','trap','shadowLeap','rain'].map(k=>[k,1]));
   p.skillCooldowns={j:0,h:0,u:0,k:0};p.skillMaxCooldowns={};p.isAttacking=p.isChanneling=false;p.skillAttackTimer=0;p.chargeTime=0;p.lightningTickTimer=0;p.lightningEffect=null;p.missileFireQueue=[];p.shieldTimer=0;p.actionFdbk=null;p.actionTimer=0;p.lastInsufficientManaFeedbackAt=0;p.cancelFireballAim();
   scene.projectiles.length=0;scene.floatingTexts.length=0;game.monsterManager.monsters.clear();scene.checkCollision=()=>false;game.monsterManager._hostSnapshotRestorePromise=null;game.monsterManager._hostFieldHandoffPromise=null;game.monsterManager._hostFieldHandoffBlockedFieldId=null;
   p.initializeClassCombat();p.classCombat.controller.rage=100;p.classCombat.definitions.set('slime',definition);await p._loadSpriteSheet(game.resources);
   const e=new Monster(p.x+80,p.y+24,definition);Object.assign(e,{id:'guidance-target',isLocalOnly:true,hp:100000,maxHp:100000,defense:0,radius:16,isDead:false});game.monsterManager.monsters.set(e.id,e);p.currentTarget=e;qa.target=e;
   document.querySelector('.chat-messages').replaceChildren();qa.logs=[];qa.actions=[];qa.packets=[];qa.cancelBefore=null;
   game.ui.syncClassSkillUI();game.ui.updateStats(100*p.hp/p.maxHp,100*p.mp/p.maxMp,p.level,0);game.ui.updateCooldowns();
  };
  qa.paint=()=>{game.ui.updateStats(100*p.hp/p.maxHp,100*p.mp/p.maxMp,p.level,0);game.ui.updateCooldowns();game.sceneManager.render(game.ctx)};
  qa.inspect=()=>{
   qa.paint();const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
   const intersection=(a,b)=>a&&b?Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)):0;
   const chat=document.querySelector('.chat-messages'),cr=rect(chat),canvas=rect(game.canvas);
   const buttons=['j','h','u','k'].map(key=>{
    const el=document.getElementById(key==='j'?'action-attack-j':'action-skill-'+key),reason=el.querySelector('.skill-unavailable-reason'),name=el.querySelector('.combat-skill-name'),time=el.querySelector('.cooldown-time'),r=reason.hidden?null:rect(reason),n=rect(name),b=rect(el);
    const style=getComputedStyle(reason),range=document.createRange();range.selectNodeContents(reason);
    const textRects=r?[...range.getClientRects()].map(t=>({x:t.x,y:t.y,right:t.right,bottom:t.bottom})):[];
    if(time)range.selectNodeContents(time);
    const cooldownTextRects=time?.textContent?[...range.getClientRects()].map(t=>({x:t.x,y:t.y,right:t.right,bottom:t.bottom})):[];
    return {key,availability:skillAvailability(p,key,game),aria:el.getAttribute('aria-label'),button:b,reason:reason.textContent,compact:reason.classList.contains('is-compact'),reasonStyle:{font:style.font,lineHeight:style.lineHeight,whiteSpace:style.whiteSpace,wordBreak:style.wordBreak},textRects,cooldownTextRects,reasonCount:el.querySelectorAll('.skill-unavailable-reason').length,reasonRect:r,nameRect:n,name:name?.textContent,reasonNameIntersection:intersection(r,n),reasonOutsideButton:!!r&&(r.x<b.x||r.y<b.y||r.right>b.right||r.bottom>b.bottom),reasonOutsideViewport:!!r&&(r.x<0||r.y<0||r.right>innerWidth||r.bottom>innerHeight),chatIntersection:intersection(cr,b),cooldown:time?.textContent||''};
   });
   const visible=[...chat.children].map(el=>({text:el.textContent,rect:rect(el)})).filter(x=>intersection(x.rect,cr)>0);
   return {bodyClass:document.body.className,logs:qa.logs,actions:qa.actions,chat:{all:[...chat.children].map(e=>e.textContent),rect:cr,clientHeight:chat.clientHeight,scrollHeight:chat.scrollHeight,count:chat.children.length,visible,first:chat.firstChild?.textContent,last:chat.lastChild?.textContent},buttons,
    actor:{hp:p.hp,mp:p.mp,rage:p.classCombat.controller.rage,shieldTimer:p.shieldTimer,cooldowns:{...p.classCombat.controller.cooldowns},summons:p.classCombat.controller.summons.length,actionFdbk:p.actionFdbk,actionTimer:p.actionTimer,classAim:!!p.classAim,fireballAim:!!p.fireballAimActive,barrage:!!p.classCombat.controller.barrage,shieldRush:!!p.classCombat.controller.shieldRush,motion:p.classCombat.motionSerial,effects:p.classCombat.effects.map(e=>e.name),targetHp:qa.target.hp},
    cancelBefore:qa.cancelBefore,authorityBlocked:game.monsterManager.isMonsterCombatBlocked(),canvas,packets:qa.packets.length,viewport:{width:innerWidth,height:innerHeight}};
  };
 });
 const cdp=await page.context().newCDPSession(page);
 async function touch(key,count,charged=false){
  const selector=key==='j'?'#action-attack-j':'#action-skill-'+key;const r=await page.locator(selector).boundingBox();assert.ok(r);const point={x:r.x+r.width/2,y:r.y+r.height/2,id:1};
  for(let i=0;i<count;i++){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
   if(charged)await page.evaluate(()=>{if(qa.p.classAim)qa.p.classAim.elapsed=.5});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
 }
 function verify(s,a){
  const button=a.buttons.find(b=>b.key===s.key);
  assert.ok(a.buttons.every(b=>b.reasonCount===1&&!b.reasonOutsideViewport),s.id+' single in-viewport reason');
  for(const b of a.buttons)if(b.reasonRect){
   assert.equal(b.reasonNameIntersection,0,s.id+' name unobscured '+JSON.stringify(b));
   assert.ok(b.nameRect.y-b.reasonRect.bottom>=2,s.id+' label/name gap '+b.key);
   assert.ok(b.textRects.every(r=>r.x>=b.button.x&&r.right<=b.button.right&&r.y>=b.button.y&&r.bottom<=b.nameRect.y-2),s.id+' full text fits '+JSON.stringify(b));
   assert.ok(b.cooldownTextRects.every(r=>r.y-b.reasonRect.bottom>=2),s.id+' cooldown unobscured '+JSON.stringify(b));
   assert.ok(b.cooldownTextRects.every(r=>b.textRects.every(t=>r.y>=t.bottom)),s.id+' cooldown glyphs unobscured '+JSON.stringify(b));
  }
  if(['witch-hp-spam','warrior-rage-spam'].includes(s.id)){
   assert.equal(a.logs.length,1);assert.equal(a.chat.count,2);assert.match(a.chat.first,/진단용 이전 안내/);assert.equal(a.actor.motion,0);
  }
  if(s.id==='witch-spawn-blocked'){assert.equal(a.logs.length,1);assert.match(a.logs[0].text,/공간이 없습니다/);assert.equal(a.actor.hp,1000);assert.equal(a.actor.summons,0);assert.equal(a.actor.motion,0);}
  if(s.id==='warrior-wall-blocked'){assert.equal(a.logs.length,1);assert.match(a.logs[0].text,/앞이 막혀/);assert.equal(a.actor.motion,0);assert.equal(a.actor.hp,1000);assert.equal(a.actor.rage,100);}
  if(s.id==='wizard-casting-fireball'){assert.equal(a.logs.length,1);assert.match(a.logs[0].text,/시전 중/);assert.equal(button.availability.code,'casting');assert.equal(a.actor.fireballAim,false);assert.equal(a.actor.mp,1000);}
  if(s.id.endsWith('authority-wait')){assert.equal(a.authorityBlocked,true);assert.equal(a.actor.targetHp,100000);assert.ok(a.buttons.some(b=>b.availability.code==='authority'));assert.ok(a.buttons.filter(b=>b.availability.code==='authority').every(b=>b.availability.hint&&b.aria.includes('전투 동기화')));}
  if(s.id==='wizard-mp-spam'){assert.equal(a.logs.length,0);assert.ok(a.actions.length>=1);for(let i=1;i<a.actions.length;i++)assert.ok(a.actions[i].at-a.actions[i-1].at>=790);assert.match(a.actor.actionFdbk,/마나가 부족/);}
  if(s.id==='archer-stun-spam'){assert.equal(a.logs.length,0);assert.equal(a.actor.motion,0);assert.equal(button.availability.code,'stun');}
  if(s.id==='archer-success-cooldown'){assert.equal(a.actor.motion,1);assert.deepEqual(a.actor.effects,['hunter_trap']);}
  if(s.id==='archer-aim-cancel'){assert.equal(a.cancelBefore.aim,true);assert.equal(a.actor.classAim,false);assert.equal(a.actor.motion,0);}
  if(s.id==='warrior-barrage-cancel'){assert.equal(a.cancelBefore.barrage,true);assert.equal(a.actor.barrage,false);assert.ok(!a.actor.effects.includes('gwangcheon'));assert.equal(a.actor.motion,1);}
  if(s.id==='wizard-authority-cooldown'){
   for(const b of a.buttons.filter(b=>b.key!=='k')){assert.equal(b.reason,b.key==='j'?'':'동기화 중');assert.equal(b.cooldown,'3.0');assert.equal(b.compact,true);assert.match(b.aria,/몬스터 피해와 상태 반영/);}
   assert.equal(a.buttons.find(b=>b.key==='k').reasonRect,null);assert.equal(a.actor.mp,1000);
  }
  if(s.id==='wizard-casting-cooldown'){assert.equal(button.reason,'시전 중');assert.equal(button.cooldown,'3.0');assert.equal(button.compact,true);assert.equal(a.logs.length,1);assert.equal(a.actor.mp,1000);assert.equal(a.actor.fireballAim,false);}
 }
 // System fallback fonts have different space widths; check wrapping without downloading fonts.
 report.fontLayouts=[];
 for(const [font,spacing] of [['Arial, sans-serif','normal'],['DejaVu Sans, sans-serif','normal'],['serif','normal'],['sans-serif','.3px']]){
  const style=await page.addStyleTag({content:'.skill-unavailable-reason { font-family: '+font+' !important; letter-spacing: '+spacing+'; }'});
  for(const state of ['hp','authority','authority-cooldown','casting-cooldown']){
   await page.evaluate(async state=>{await qa.reset(state==='hp'?'witch':'wizard');if(state==='hp')qa.p.hp=800;else if(state!=='casting-cooldown')game.monsterManager._hostSnapshotRestorePromise={fixture:true};if(state.endsWith('-cooldown')){qa.p.skillCooldowns={j:3,h:3,u:3,k:3};qa.p.skillMaxCooldowns={j:5,h:5,u:5,k:5};}if(state==='casting-cooldown'){qa.p.isChanneling=true;qa.p.skillAttackTimer=.4;}},state);
   const after=await page.evaluate(()=>qa.inspect());report.fontLayouts.push({font,spacing,state,after});
   verify({id:'font-layout-'+state},after);
  }
  await style.evaluate(el=>el.remove());
 }
 const scenarios=[
  {id:'witch-hp-spam',classId:'witch',key:'u',count:60,setup:()=>{qa.p.hp=800;game.ui.logSystemMessage('진단용 이전 안내');qa.logs=[];}},
  {id:'warrior-rage-spam',classId:'warrior',key:'j',count:60,charged:true,setup:()=>{qa.p.classCombat.controller.rage=0;game.ui.logSystemMessage('진단용 이전 안내');qa.logs=[];}},
  {id:'wizard-mp-spam',classId:'wizard',key:'h',count:60,setup:()=>{qa.p.mp=0;}},
  {id:'archer-stun-spam',classId:'archer',key:'h',count:60,setup:()=>{qa.p.classStatuses.stun={remaining:5};}},
  {id:'archer-success-cooldown',classId:'archer',key:'h',count:30,setup:()=>{}},
  {id:'witch-spawn-blocked',classId:'witch',key:'u',count:1,setup:()=>{qa.scene.checkCollision=()=>true;}},
  {id:'warrior-wall-blocked',classId:'warrior',key:'h',count:1,setup:()=>{qa.scene.checkCollision=()=>true;}},
  {id:'wizard-casting-fireball',classId:'wizard',key:'u',count:1,setup:()=>{qa.p.isChanneling=true;qa.p.skillAttackTimer=.4;}},
  {id:'warrior-authority-wait',classId:'warrior',key:'j',count:30,setup:()=>{game.monsterManager._hostSnapshotRestorePromise={fixture:true};}},
  {id:'wizard-authority-wait',classId:'wizard',key:'j',count:0,setup:()=>{game.monsterManager._hostSnapshotRestorePromise={fixture:true};qa.p.performLaserAttack(0);}},
  {id:'wizard-authority-cooldown',classId:'wizard',key:'h',count:0,setup:()=>{game.monsterManager._hostSnapshotRestorePromise={fixture:true};qa.p.skillCooldowns={j:3,h:3,u:3,k:3};qa.p.skillMaxCooldowns={j:5,h:5,u:5,k:5};}},
  {id:'wizard-casting-cooldown',classId:'wizard',key:'u',count:1,setup:()=>{qa.p.isChanneling=true;qa.p.skillAttackTimer=.4;qa.p.skillCooldowns.u=3;qa.p.skillMaxCooldowns.u=5;}},
  {id:'archer-aim-cancel',classId:'archer',key:'u',count:0,setup:()=>{game.input.emit('aimStart',{action:'SKILL_2',clientX:50,clientY:50});qa.cancelBefore={aim:!!qa.p.classAim,barrage:!!qa.p.classCombat.controller.barrage};game.input.emit('aimCancel',{action:'SKILL_2'});}},
  {id:'warrior-barrage-cancel',classId:'warrior',key:'u',count:0,setup:()=>{qa.p.useSkill(2,{x:qa.p.x+200,y:qa.p.y+24});qa.cancelBefore={aim:!!qa.p.classAim,barrage:!!qa.p.classCombat.controller.barrage};game.input.emit('aimCancel',{action:'SKILL_2'});}}
 ];
 for(const s of scenarios){
  await page.evaluate(async id=>qa.reset(id),s.classId);await page.evaluate(s.setup);await page.evaluate(()=>qa.paint());await page.waitForTimeout(60);
  const before=await page.evaluate(()=>qa.inspect());if(s.count)await touch(s.key,s.count,s.charged);
  await page.evaluate(()=>qa.paint());await page.waitForTimeout(200);const after=await page.evaluate(()=>qa.inspect());
  const screenshot=out+'/'+orientation+'-'+s.id+'.png';await page.screenshot({path:screenshot});report.scenarios.push({id:s.id,classId:s.classId,key:s.key,repeat:s.count,chargedElapsedInjected:!!s.charged,before,after,screenshot});verify(s,after);
 }
 // Consecutive reasons, ordinary chat, success and lifecycle transitions use the real UI methods.
 const transitions=[];
 await page.evaluate(async()=>{await qa.reset('witch');qa.p.hp=800;game.ui.logSystemMessage('보존할 일반 안내');});
 await touch('u',1);
 await page.evaluate(()=>{game.ui._appendChatLogEntry({uid:'guidance-chat',name:'일반 대화',text:'보존할 채팅'});game.ui.logSystemMessage('중간 일반 안내');});
 await touch('u',60);
 let a=await page.evaluate(()=>qa.inspect());
 assert.equal(a.logs.length,3);assert.equal(a.chat.count,4);assert.ok(a.chat.all.some(t=>t.includes('보존할 채팅')));transitions.push({id:'normal-chat-preserved',after:a});
 await page.evaluate(()=>{qa.p.hp=1000;qa.scene.checkCollision=()=>true;});await touch('u',1);
 await page.evaluate(()=>{qa.p.hp=800;});await touch('u',1);
 a=await page.evaluate(()=>qa.inspect());assert.equal(a.logs.length,5);assert.match(a.logs[3].text,/공간이 없습니다/);assert.match(a.logs[4].text,/80%/);transitions.push({id:'different-reason-switch',after:a});
 await page.evaluate(()=>{qa.p.hp=1000;qa.scene.checkCollision=()=>false;});await touch('u',1);
 await page.evaluate(()=>{qa.p.classCombat.controller.time=2;qa.p._updateCooldowns(2);});await touch('u',1);
 a=await page.evaluate(()=>qa.inspect());assert.equal(a.actor.summons,1);assert.equal(a.actor.hp,200);assert.equal(a.logs.length,6);transitions.push({id:'success-then-rejection',after:a});
 await page.evaluate(()=>game.input.emit('aimCancel',{action:'SKILL_2'}));await touch('u',1);
 a=await page.evaluate(()=>qa.inspect());assert.equal(a.logs.length,7);transitions.push({id:'cancel-then-retry',after:a});
 await page.evaluate(()=>qa.p.initializeClassCombat());await touch('u',1);
 a=await page.evaluate(()=>qa.inspect());assert.equal(a.logs.length,8);transitions.push({id:'controller-reentry',after:a});
 await page.evaluate(async()=>{await qa.reset('wizard');game.monsterManager._hostSnapshotRestorePromise={fixture:true};});
 await touch('k',1);a=await page.evaluate(()=>qa.inspect());assert.equal(a.actor.mp,980);assert.equal(a.actor.shieldTimer,9999);assert.notEqual(a.buttons.find(b=>b.key==='k').availability.code,'authority');transitions.push({id:'self-shield-still-accepted-during-wait',after:a});
 await page.evaluate(()=>{game.monsterManager._hostSnapshotRestorePromise=null;});a=await page.evaluate(()=>qa.inspect());assert.ok(a.buttons.every(b=>b.availability.code!=='authority'));transitions.push({id:'wait-cleared',after:a});
 await page.evaluate(async()=>{await qa.reset('wizard');qa.p.isChanneling=true;qa.p.skillAttackTimer=0;});await touch('u',1);
 await page.waitForTimeout(50);a=await page.evaluate(()=>qa.inspect());assert.equal(a.actor.mp,988);assert.equal(a.logs.length,0);transitions.push({id:'sustained-lightning-still-interruptible',after:a});
 await page.evaluate(async()=>{await qa.reset('wizard');game.monsterManager._hostSnapshotRestorePromise={fixture:true};qa.p.skillCooldowns.h=3;qa.p.skillMaxCooldowns.h=5;qa.paint();qa.p.skillCooldowns.h=0;});
 a=await page.evaluate(()=>qa.inspect());let h=a.buttons.find(b=>b.key==='h');assert.equal(h.reason,'전투 반영 대기');assert.equal(h.cooldown,'');assert.equal(h.compact,false);verify({id:'cooldown-ended-still-waiting'},a);transitions.push({id:'cooldown-ended-still-waiting',after:a});
 await page.evaluate(()=>{qa.p.skillCooldowns.h=3;qa.paint();game.monsterManager._hostSnapshotRestorePromise=null;});
 a=await page.evaluate(()=>qa.inspect());h=a.buttons.find(b=>b.key==='h');assert.equal(h.reasonRect,null);assert.equal(h.cooldown,'3.0');assert.equal(h.compact,false);transitions.push({id:'wait-ended-during-cooldown',after:a});
 report.transitions=transitions;
 report.skillDetails=await page.evaluate(async()=>{
  const all=[];for(const id of ['wizard','witch','warrior','archer']){await qa.reset(id);for(const skillId of Object.keys(qa.p.skillLevels)){if(!game.ui.skillData?.[skillId])continue;const detail=game.ui.getSkillDetailData(skillId);if(detail){const div=document.createElement('div');div.innerHTML=detail.modalHtml;all.push({classId:id,skillId,name:detail.name,text:div.textContent.replace(/\s+/g,' ').trim()});}}}return all;
 });
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);report.completed=true;console.log(JSON.stringify({test:'combat-guidance-v172',orientation,scenarios:report.scenarios.length,transitions:report.transitions.length,passed:true}));
 console.log(JSON.stringify({orientation,scenarios:report.scenarios.map(s=>({id:s.id,logs:s.after.logs.length,actions:s.after.actions.length,history:s.after.chat.count,reasons:s.after.buttons.filter(b=>b.reasonRect).map(b=>({key:b.key,text:b.reason,overlap:b.reasonNameIntersection,outside:b.reasonOutsideButton}))})),errors:report.errors}));
 }finally{fs.writeFileSync(out+'/'+orientation+'.json',JSON.stringify(report,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
