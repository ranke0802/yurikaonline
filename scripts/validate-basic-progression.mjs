import test from 'node:test';
import assert from 'node:assert/strict';
import Controller from '../src/js/combat/ClassCombatController.js';
import Player from '../src/js/entities/Player.js';
import { BASIC_SKILL_IDS, basicAttackProfile, basicChargeSeconds } from '../src/js/combat/BasicAttackProgression.js';
import { classSkillMaxLevel } from '../src/js/ui/ClassSkillUI.js';
import RemoteClassVisuals, { renderForegroundEffects, renderGroundEffects } from '../src/js/combat/ClassVisuals.js';
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
function fixture(id,level) {
  const owner={classId:id,skillLevels:{[BASIC_SKILL_IDS[id]]:level},x:0,y:0,hp:1000,maxHp:1000,attackPower:100,attackSpeed:1};
  const enemies=[],effects=[],hits=[],moves=[];
  const c=new Controller(owner,id,{enemies:()=>enemies,damage(e,n,m){hits.push({n,m});e.hp-=n;return n;},effect:(name,data)=>effects.push({name,...data}),move(e,x,y){moves.push({x,y});e.x=x;e.y=y;return true;}});
  const enemy=(x=40,y=0,extra={})=>{const e={id:`e${enemies.length}`,x,y,radius:1,hp:100000,maxHp:100000,...extra};enemies.push(e);return e;};
  const advance=duration=>{for(let t=0;t<duration-1e-8;t+=.05)c.update(.05);};
  return {owner,c,enemies,effects,hits,moves,enemy,advance};
}
for(const id of Object.keys(BASIC_SKILL_IDS)) for(const level of [1,4,8]) test(`${id} level ${level}: combat damage and unchanged recovery`,()=>{
  const f=fixture(id,level),g=basicAttackProfile(id,f.owner.skillLevels),e=f.enemy();
  assert.equal(classSkillMaxLevel(f.owner,BASIC_SKILL_IDS[id]),8);
  assert.equal(f.c.basic({x:400,y:0}),true);
  if(id==='archer'||id==='witch') f.advance(.1);
  assert.equal(f.hits[0].n,Math.ceil(100*g.damageMultiplier*(id==='witch'?2:id==='archer'?.85:1)));
  close(f.c.basicReady,{witch:.805,warrior:.7,archer:.65}[id]);
  assert.equal(f.c.basic({aimed:true}),false);
  if(id==='warrior')close(f.moves[0]?.x ?? 40,40+g.tap.knockback);
  if(id==='archer')assert.equal(f.c.state(e).marks,1,'mark increments unchanged');
});
for(const level of [1,4,8]) test(`level ${level}: charged damage and collision snapshots`,()=>{
  const archer=fixture('archer',level),target=archer.enemy(),g=basicAttackProfile('archer',archer.owner.skillLevels);
  archer.c.basic({aimed:true,x:500,y:0});archer.owner.skillLevels.shot=1;archer.advance(.1);
  assert.equal(archer.hits[0].n,Math.ceil(100*g.damageMultiplier*1.8));
  const witch=fixture('witch',level),wg=basicAttackProfile('witch',witch.owner.skillLevels);
  witch.enemy(40,wg.orbRadius-1);witch.c.basic({aimed:true,x:500,y:0});
  close(witch.c.projectiles[0].radius,wg.orbRadius);
  witch.owner.skillLevels.lifeDrain=1;witch.advance(3.4);
  assert.equal(witch.hits.filter(h=>h.m.drain).reduce((n,h)=>n+h.n,0),Math.ceil(100*wg.damageMultiplier));
  const warrior=fixture('warrior',level);warrior.enemy();warrior.c.rage=25;
  warrior.c.basic({aimed:true,x:400,y:0});assert.equal(warrior.hits.length,0);warrior.advance(.3);assert.equal(warrior.hits[0].n,Math.ceil(350*g.damageMultiplier));assert.equal(warrior.c.rage,0);
});
for(const level of [1,4,8]) test(`level ${level}: expanded hitboxes and VFX share sizes`,()=>{
  const w=fixture('witch',level),g=basicAttackProfile('witch',w.owner.skillLevels);
  const target=w.enemy(300);w.enemy(300,g.tapRadius+.9);w.enemy(300,g.tapRadius+1.1);w.c.basic();assert.equal(w.hits.length,0);const orb=w.c.projectiles[0];orb.x=300;orb.y=0;w.c.resolveProjectileHit(orb,target);assert.equal(w.hits.length,2);
  close(w.effects.find(e=>e.name==='life_circle').radius,g.tapRadius);
  const s=fixture('warrior',level),sg=basicAttackProfile('warrior',s.owner.skillLevels);
  s.enemy(sg.tap.range,sg.tap.halfWidth+.9);s.enemy(sg.tap.range+1.1);s.c.basic({x:500,y:0});assert.equal(s.hits.length,1);
  const calls=[],r={owner:w.owner,effects:w.effects,controller:w.c,drawEffect:(...args)=>calls.push(args)};
  renderGroundEffects(r,{});close(calls[0][4],g.tapRadius*2);
  r.effects=s.effects;r.controller=s.c;calls.length=0;renderForegroundEffects(r,{});
  close(calls[0][6].width,sg.tap.range);close(calls[0][6].height,sg.tap.halfWidth*2);
});
test('charge thresholds agree at low/mid/max; empowered threshold and floor',t=>{
  const before=globalThis.window;globalThis.window={game:{}};t.after(()=>{globalThis.window=before;});
  for(const [level,seconds] of [[1,.5],[4,.41],[8,.3]]){
    const owner={classId:'archer',skillLevels:{shot:level}};close(basicChargeSeconds(owner),seconds);close(basicChargeSeconds(owner,true),seconds*.4);
    for(const empowered of [false,true])for(const elapsed of [basicChargeSeconds(owner,empowered)-.001,basicChargeSeconds(owner,empowered)]){
      const calls=[],p={...owner,classAim:{action:'ATTACK',elapsed,x:100,y:0},classCombat:{paused:()=>false,controller:{empowered},basic:o=>{calls.push(o);return true;}}};
      Player.prototype.releaseClassAction.call(p,'ATTACK');assert.equal(calls[0].aimed,elapsed>=basicChargeSeconds(owner,empowered));
    }
  }
});
test('growth clamps corrupt levels; Mage skill behavior remains unchanged',()=>{
  for(const level of [0,-1,NaN,Infinity,'bad'])assert.equal(basicAttackProfile('archer',{shot:level}).level,1);
  assert.equal(basicAttackProfile('archer',{shot:999}).level,8);
  assert.equal(classSkillMaxLevel({classId:'wizard'},'laser'),Infinity);
  assert.equal(classSkillMaxLevel({classId:'wizard'},'shield'),1);
});
test('knockback requires accepted damage, does not move bosses or cross blocked walls',()=>{
  const f=fixture('warrior',8),boss=f.enemy(40,0,{isBoss:true});f.c.basic({x:500,y:0});assert.equal(f.moves.length,0);
  boss.isBoss=false;f.c.basicReady=0;f.c.hooks.damage=()=>0;f.c.basic({x:500,y:0});assert.equal(f.moves.length,0);
  f.c.basicReady=0;f.c.hooks.damage=()=>1;f.c.hooks.move=()=>false;f.c.basic({x:500,y:0});assert.equal(boss.x,40);
});
for(const id of Object.keys(BASIC_SKILL_IDS)) for(const level of [1,4,8]) test(`${id} level ${level}: flood cannot bypass five-per-second floor`,()=>{
  const f=fixture(id,level);f.owner.attackSpeed=10000;f.c.rage=100;
  const approvals=[];
  for(let frame=0;frame<180;frame++){
    f.c.update(1/60);
    for(let n=0;n<20;n++)if(f.c.basic({aimed:n%2===1,x:500,y:0}))approvals.push(f.c.time);
  }
  for(let n=1;n<approvals.length;n++)assert.ok(approvals[n]-approvals[n-1]>=.2-1e-10);
  assert.ok(approvals.length<=15);
});
test('Warrior guide uses collision range/width and Witch tap shows its ranged impact footprint',()=>{
  for(const level of [1,4,8])for(const id of ['warrior','witch']){
    const owner={classId:id,skillLevels:{[BASIC_SKILL_IDS[id]]:level},x:10,y:20,width:48,height:64,classAim:{action:'ATTACK',x:500,y:52,elapsed:0}};
    const growth=basicAttackProfile(id,owner.skillLevels),guide=Player.prototype.getClassAimGuide.call(owner);
    if(id==='warrior'){close(guide.targetX-guide.originX,growth.tap.range);close(guide.widthRadius,growth.tap.halfWidth);}
    else{assert.equal(guide.circle,false);close(guide.targetX-guide.originX,560);close(guide.widthRadius,growth.orbRadius);close(guide.aoeRadius,growth.tapRadius);}
  }
});
test('remote visual packets preserve grown geometry and bound received sizes',t=>{
  const previous=globalThis.window;t.after(()=>{globalThis.window=previous;});
  globalThis.window={game:{net:{_getCurrentFieldId:()=> 'field'},resources:{loadImage:async()=>({width:768,height:768})},sceneManager:{currentScene:{}}}};
  const visual=new RemoteClassVisuals({hp:100,x:0,y:0}),now=Date.now();
  assert.equal(visual.receive({classId:'warrior',fieldId:'field',ts:now,epoch:1,sequence:1,effects:[{id:'slash',name:'warrior_slash',x:0,y:0,target:{x:135,y:0},range:135,halfWidth:70.2,duration:.65,age:0}]}),true);
  close(visual.effects[0].range,135);close(visual.effects[0].halfWidth,70.2);
  visual.receive({classId:'witch',fieldId:'field',ts:now,epoch:1,sequence:2,projectiles:[{kind:'orb',x:0,y:0,direction:{x:1,y:0},speed:210,remaining:560,radius:18.9}]});
  close(visual.projectiles[0].radius,18.9);
});
