const {chromium}=require('playwright');const fs=require('node:fs');const assert=require('node:assert/strict');
const out='/tmp/yurika-online-monster-qa';fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const errors=[];try{
const page=await browser.newPage({viewport:{width:780,height:360},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));const baselineFiles=new Map();if(process.env.QA_BASELINE){for(const file of ['src/js/entities/Monster.js','src/js/core/NetworkManager.js','src/js/world/MonsterManager.js'])baselineFiles.set('/'+file,require('node:child_process').execFileSync('git',['show','29293fa:'+file],{encoding:'utf8',maxBuffer:4*1024*1024}));}
await page.route('**/*',r=>{const url=new URL(r.request().url());if(url.hostname!=='127.0.0.1')return r.abort();if(baselineFiles.has(url.pathname))return r.fulfill({status:200,contentType:'text/javascript',body:baselineFiles.get(url.pathname)});return r.continue()});
await page.goto('http://127.0.0.1:8100/?local=1');await page.locator('#camp-name').fill('온라인 재현');await page.locator('[data-camp="create"]').tap();await page.locator('[data-camp="character"]').waitFor();await page.evaluate(async()=>game.net.savePlayerData(game.net.playerId,{questData:{basicTrainingCompleted:true,prologueCompleted:true}}));await page.locator('[data-camp="character"]').tap();await page.locator('[data-camp="depart"]').tap();await page.locator('.camp-return').waitFor();await page.waitForTimeout(1000);await page.locator('#loading-overlay').waitFor({state:'hidden'});
const result=await page.evaluate(async()=>{
 game.loop.stop();
 const {default:NetworkManager}=await import('/src/js/core/NetworkManager.js');
 const mm=game.monsterManager;mm.monsters.clear();let pending=[];const events=[];
 const net=Object.create(NetworkManager.prototype);Object.assign(net,{isHost:false,playerId:'qa-guest',_monsterPendingRemovalTimers:new Map(),_monsterCellPayloadCache:new Map(),_monsterCellListeners:new Map(),_subscribedMonsterCells:new Set(),_getCurrentFieldId:()=> 'qa-field',isSharedFieldActive:()=>true,
 emit:(name,data)=>{events.push({name,id:typeof data==='string'?data:data.id});if(name==='monsterAdded')pending.push(mm._onRemoteMonsterAdded(data));if(name==='monsterUpdated')mm._onRemoteMonsterUpdated(data);if(name==='monsterRemoved')mm._onRemoteMonsterRemoved(data)}});
 game.net=net;mm.net=net;game.ui.isPaused=false;game.story.isStoryActive=false;
 const body=document.createElement('canvas');body.width=256;body.height=256;const ctx=body.getContext('2d',{willReadFrequently:true});
 const actual=document.createElement('canvas');actual.width=256;actual.height=256;const a=actual.getContext('2d');
 const strip=document.createElement('canvas');strip.width=256*6;strip.height=256*3;const s=strip.getContext('2d');
 const capture=(id)=>{ctx.clearRect(0,0,256,256);a.clearRect(0,0,256,256);const m=mm.monsters.get(id);let draws=0;if(m){const draw=m.sprite.draw;m.sprite.draw=function(c,row,f,x,y,w,h){draws++;ctx.globalAlpha=c.globalAlpha;draw.call(this,ctx,row,f,40,40,160,160);return draw.call(this,c,row,f,x,y,w,h)};try{m.render(a)}finally{m.sprite.draw=draw}}let pixels=0;const bytes=ctx.getImageData(0,0,256,256).data;for(let k=3;k<bytes.length;k+=4)if(bytes[k]>8)pixels++;return{pixels,draws,exists:!!m,hp:m?.hp,dead:m?.isDead,alpha:m?.alpha,deathTimer:m?.deathTimer}};
 let rev=1;const snapshot=(id,type,cell,hp=100,state='aggro')=>({key:id,val:()=>net._buildMonsterRealtimeCellPayload({x:128,y:128,hp,maxHp:100,type,rev:rev++,ts:Date.now(),state,cellId:cell})});
 const settle=async()=>{await Promise.all(pending);pending=[];for(const m of mm.monsters.values())await m.init(m.assetPath)};
 const cases=[];
 for(const [row,type]of ['slime','squirtle','emolga'].entries()){
 const id='qa-'+type;const snap=snapshot(id,type,'0_0');net._onMonsterCellAdded('0_0',snap);await settle();const original=mm.monsters.get(id);const frames=[];
 frames.push({phase:'initial',...capture(id)});s.drawImage(body,0,row*256);
 net._onMonsterCellRemoved('0_0',snap);
 // Replay realistic cross-listener reordering with 350ms delivery skew; sample every ~16ms.
 const timeline=[];const start=performance.now();while(performance.now()-start<350){timeline.push({ms:performance.now()-start,...capture(id)});await new Promise(r=>setTimeout(r,16))}
 frames.push({phase:'before-destination-add',...capture(id)});s.drawImage(body,256,row*256);
 net._onMonsterCellAdded('1_0',snapshot(id,type,'1_0'));await settle();frames.push({phase:'destination-add',...capture(id)});s.drawImage(body,512,row*256);
 const m=mm.monsters.get(id);m.takeDamage(101);m.update(0.1);frames.push({phase:'predicted-lethal',...capture(id)});s.drawImage(body,768,row*256);
 // Authoritative host rejects/corrects a predicted kill, then continues to send living updates.
 net._onMonsterCellChanged('1_0',snapshot(id,type,'1_0',70));for(let n=0;n<65;n++)m.update(1/60);
 frames.push({phase:'host-says-alive',...capture(id)});s.drawImage(body,1024,row*256);
 mm._applyAuthoritativeSnapshotToMonster(m,{id,x:128,y:128,hp:70,maxHp:100,type,state:'aggro',rev:rev++,ts:Date.now()});frames.push({phase:'snapshot-restores',...capture(id)});s.drawImage(body,1280,row*256);
 const sameInstance=original===mm.monsters.get(id);
 // Stale updates must not overturn a newer living snapshot.
 mm._onRemoteMonsterUpdated({id,x:128,y:128,hp:0,state:'dead',rev:1,ts:1});
 const staleIgnored=!m.isDead&&m.hp===70;
 // A real authoritative death still disappears and removes the entity promptly.
 net._onMonsterCellChanged('1_0',snapshot(id,type,'1_0',0,'dead'));m.update(1.1);const confirmedDeath=capture(id);
 net._onMonsterCellRemoved('1_0',snapshot(id,type,'1_0',0,'dead'));await new Promise(r=>setTimeout(r,220));const removedDead=!mm.monsters.has(id);
 cases.push({type,sameInstance,timeline,frames,staleIgnored,confirmedDeath,removedDead});net._clearPendingMonsterRemovalTimers();mm.monsters.delete(id);net._monsterCellPayloadCache.delete(id);
 }
 // Live despawn has a bounded grace period; leaving a field cancels its timers.
 const despawn=snapshot('qa-despawn','slime','0_0');net._onMonsterCellAdded('0_0',despawn);await settle();net._onMonsterCellRemoved('0_0',despawn);await new Promise(r=>setTimeout(r,1650));const liveDespawnRemoved=!mm.monsters.has('qa-despawn');
 const leaving=snapshot('qa-leaving','slime','0_0');net._onMonsterCellAdded('0_0',leaving);await settle();net._onMonsterCellRemoved('0_0',leaving);net._clearMonsterCellSubscriptions({emitRemovals:true});const fieldCleared=!mm.monsters.has('qa-leaving')&&net._monsterPendingRemovalTimers.size===0;
 return{cases,events,liveDespawnRemoved,fieldCleared,strip:strip.toDataURL()};
});
const phase=process.env.QA_BASELINE?'baseline':'fixed';fs.writeFileSync(`${out}/${phase}-contact.png`,Buffer.from(result.strip.split(',')[1],'base64'));delete result.strip;fs.writeFileSync(`${out}/${phase}.json`,JSON.stringify({result,errors},null,2));console.log(JSON.stringify(result.cases.map(c=>({type:c.type,sameInstance:c.sameInstance,blankFrames:c.timeline.filter(f=>!f.pixels).length,frames:c.frames})),null,2));
if(!process.env.QA_BASELINE){assert.deepEqual(errors,[]);assert.ok(result.liveDespawnRemoved);assert.ok(result.fieldCleared);for(const c of result.cases){assert.ok(c.staleIgnored);assert.ok(c.removedDead);assert.equal(c.confirmedDeath.pixels,0);assert.ok(c.sameInstance,'cell migration must preserve entity');assert.ok(c.timeline.every(f=>f.pixels>0),'no body gap while migrating');assert.ok(c.frames.every(f=>f.pixels>0&&!f.dead&&f.alpha===1),'living host state must remain visible')}}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
