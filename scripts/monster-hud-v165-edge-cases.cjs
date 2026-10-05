const fs=require('node:fs'),assert=require('node:assert/strict');
module.exports=async function(p,out,orientation){
 await p.evaluate(async()=>{
  const q=qa,M=(await import('/src/js/entities/Monster.js')).default;
  q.s._clearTransientWorldEffects();game.monsterManager.monsters.clear();q.bridge.actors=[];
  for(const m of q.mobs){m.isDead=false;m.deathTimer=0;m.hp=m.maxHp=1200;m.alpha=1;m.statusEffects=[];m.classStatuses={};m.electrocutedTimer=0;game.monsterManager.monsters.set(m.id,m);}
  const boss=new M(q.center.x+160,q.center.y+120,await game.monsterData.loadDefinition('king_slime'));boss.id='hud-boss';boss.isLocalOnly=true;await boss.init(boss.assetPath);q.mobs.push(boss);game.monsterManager.monsters.set(boss.id,boss);
  const tag=(obj,key,id,role)=>{const old=obj[key];obj[key]=function(...a){const owner=q.owner,r=q.role;q.owner=id;q.role=role;try{return old.apply(this,a)}finally{q.owner=owner;q.role=r}}};
  tag(boss,'render',boss.id,'monster');tag(boss,'renderGroundGuides',boss.id,'warning');
  // Slimes share a sprite already tagged as body by the main fixture.
  q.bridge.definitions.set('slime',await game.monsterData.loadDefinition('slime'));
  const summon=q.bridge.summon('slime',1);if(!summon)throw Error('Fixture summon did not spawn');await summon.visual.init(summon.visual.assetPath);summon.x=q.center.x+60;summon.y=q.center.y+90;q.hudSummon=summon;
  const ctx=game.ctx,oldRound=ctx.roundRect;ctx.roundRect=function(x,y,w,h,...args){
   if(q.tracking&&q.role==='monster'&&w===20&&h===20){const t=ctx.getTransform(),r=game.canvas.getBoundingClientRect(),sx=r.width/game.canvas.width,sy=r.height/game.canvas.height;const left=(t.a*x+t.c*y+t.e)*sx+r.left,top=(t.b*x+t.d*y+t.f)*sy+r.top;q.records.push({kind:'legacy-status',owner:q.owner,order:q.records.length,box:{left,top,right:left+w*t.a*sx,bottom:top+h*t.d*sy}});}
   return oldRound.call(this,x,y,w,h,...args);
  };
  q.hudState=()=>JSON.stringify({mobs:q.mobs.map(m=>({id:m.id,x:m.x,y:m.y,hp:m.hp,status:m.classStatuses,effects:m.statusEffects,charge:m.chargeState,target:m.chargeTarget,timer:m.chargeTimer,telegraphs:m.activeBossTelegraphs})),player:{hp:q.p.hp,mp:q.p.mp},summons:q.bridge.actors.map(a=>({id:a.id,x:a.x,y:a.y,hp:a.hp}))});
 });
 const results=[];
 for(const scenario of ['mixed','target-switch','large-boss','left-edge','right-edge','top-edge','bottom-edge','death','removed']){
  const result=await p.evaluate(scenario=>{
   const q=qa,m=q.mobs[0],boss=q.mobs.find(m=>m.id==='hud-boss');
   if(scenario==='mixed'){
    m.x=q.center.x+50;m.y=q.center.y+30;m.statusEffects=[{type:'burn',timer:3},{type:'shield',timer:3}];m.electrocutedTimer=2;
    m.classStatuses={poison:{remaining:3,stacks:5},stun:{remaining:2},mark:{remaining:2},root:{remaining:2}};q.p.currentTarget=m;q.p.currentTargetMode='manual';
   }
   if(scenario==='target-switch')q.p.currentTarget=q.mobs[1];
   if(scenario==='large-boss'){
    q.p.currentTarget=boss;boss.activeBossTelegraphs=[{elapsedMs:500,warningMs:1000,impactMs:300,persistentMs:0,color:'#9ee96f',secondaryColor:'#f5ffd2',effect:'slime',zones:[{shape:'circle',x:boss.x,y:boss.y,radius:185},{shape:'line',x1:boss.x,y1:boss.y,x2:boss.x-200,y2:boss.y-50,width:60}]}];
   }
   const cam=q.s.camera.getPosition(),w=game.canvas.width/(game.zoom*game.dpr),h=game.canvas.height/(game.zoom*game.dpr);
   if(scenario==='left-edge'){m.x=cam.x+34;m.y=cam.y+h/2;q.p.currentTarget=m;}
   if(scenario==='right-edge')m.x=cam.x+w-34;
   if(scenario==='top-edge'){m.x=cam.x+w/2;m.y=cam.y+65;}
   if(scenario==='bottom-edge'){m.x=cam.x+w/2;m.y=cam.y+h-65;}
   if(scenario==='death'){m.isDead=true;m.deathTimer=.1;}
   if(scenario==='removed'){game.monsterManager.monsters.delete(m.id);q.p.currentTarget=null;}
   const before=q.hudState(),records=q.capture(),after=q.hudState();
   return {scenario,unchanged:before===after,target:q.p.currentTarget?.id,records,m:{id:m.id,x:m.x,y:m.y,height:m.height,dead:m.isDead},summons:q.bridge.actors.length};
  },scenario);
  assert.equal(result.unchanged,true,`${orientation}/${scenario}: render mutated combat or status state`);
  if(scenario==='mixed'){
   const mine=result.records.filter(r=>r.owner===result.m.id);assert.equal(mine.filter(r=>r.kind==='legacy-status').length,3);assert.equal(mine.filter(r=>r.kind==='status'&&r.sourcePixels===undefined&&r.text===undefined).length,4);assert.ok(mine.some(r=>r.text==='5'));assert.ok(mine.some(r=>r.text==='기절'));
  }
  if(scenario==='death')assert.equal(result.records.filter(r=>r.owner===result.m.id&&['status','legacy-status'].includes(r.kind)).length,0);
  if(scenario==='removed')assert.equal(result.records.filter(r=>r.owner===result.m.id).length,0);
  assert.equal(result.summons,1);results.push(result);await p.screenshot({path:`${out}/${orientation}-edge-${scenario}.png`});
 }
 // Transient reset uses the real scene path; layout owns no cache to leak across it.
 const cleared=await p.evaluate(()=>{qa.s._clearTransientWorldEffects();game.monsterManager.monsters.clear();qa.p.currentTarget=null;const records=qa.capture();return{names:records.filter(r=>r.kind==='name').length,numbers:qa.s.floatingTexts.length}});
 assert.deepEqual(cleared,{names:0,numbers:0});
 const mapChange=await p.evaluate(async()=>{qa.p.level=99;const changed=await qa.s.changeZone('zone_2');return{changed,zone:game.zone.currentZone.id,oldMonsters:qa.mobs.filter(m=>game.monsterManager.monsters.get(m.id)===m).length,target:qa.p.currentTarget??null};});
 assert.equal(mapChange.changed,true);assert.equal(mapChange.zone,'zone_2');assert.equal(mapChange.oldMonsters,0);assert.equal(mapChange.target,null);
 await p.screenshot({path:`${out}/${orientation}-edge-map-change.png`});
 fs.writeFileSync(`${out}/${orientation}-edges.json`,JSON.stringify({results,cleared,mapChange},null,2));
};
