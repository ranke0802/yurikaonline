import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptPoisonPulse, poisonSnapshot, restorePoisonSnapshot, paintPoisonStatus } from '../src/js/combat/WitchPoison.js';
import ClassCombatController from '../src/js/combat/ClassCombatController.js';
import ClassCombatBridge from '../src/js/combat/ClassCombatBridge.js';
import RemoteClassVisuals from '../src/js/combat/ClassVisuals.js';
import NetworkManager from '../src/js/core/NetworkManager.js';
import Monster from '../src/js/entities/Monster.js';
import Player from '../src/js/entities/Player.js';
import SkillRenderer from '../src/js/skills/renderers/SkillRenderer.js';

test('two casters share target stacks: max one/second, five-second expiry, no stun extension',()=>{
 const target={classCombatTime:0};
 for(let second=1;second<=5;second++) {
  target.classCombatTime=second;assert.ok(acceptPoisonPulse(target,second));
  const copy=structuredClone(target.witchPoison);
  assert.equal(acceptPoisonPulse(target,second+.1),null);assert.deepEqual(target.witchPoison,copy);
 }
 paintPoisonStatus(target);assert.equal(target.classStatuses.stun.remaining,3);
 for(const now of [5.1,6,7.999])assert.equal(acceptPoisonPulse(target,now),null);
 assert.equal(target.witchPoison.stunUntil,8);assert.equal(target.witchPoison.stacks,0);
 target.classCombatTime=8;acceptPoisonPulse(target,8);paintPoisonStatus(target);
 assert.equal(target.classStatuses.stun,undefined);assert.equal(target.classStatuses.poison.stacks,1);
 target.classCombatTime=13.1;paintPoisonStatus(target);assert.equal(target.classStatuses.poison,undefined);
 acceptPoisonPulse(target,13.1);assert.equal(target.witchPoison.stacks,1);
});
test('host snapshot restores shared poison through cell handoff/host change; delay never extends it',()=>{
 const old={classCombatTime:5};for(let t=1;t<=5;t++)acceptPoisonPulse(old,t);
 const snap=poisonSnapshot(old),next={classCombatTime:100};restorePoisonSnapshot(next,snap,.5);
 assert.equal(next.classStatuses.stun.remaining,2.5);
 assert.equal(acceptPoisonPulse(next,102),null);assert.ok(acceptPoisonPulse(next,102.5));
 const current=structuredClone(next.witchPoison);restorePoisonSnapshot(next,{...snap,revision:1},0);assert.deepEqual(next.witchPoison,current);
});
test('duplicate class damage does not remove HP twice or restack poison; guests cannot author stacks',()=>{
 const saved=globalThis.window;
 try {
  globalThis.window={game:{net:{isHost:true},monsterManager:{forceSync(){}},shouldSuppressTransientWorldEffects:()=>true}};
  const m=new Monster(0,0,{id:'slime',baseStats:{hp:1000,maxHp:1000}});m.id='m';m.isLocalOnly=true;
  const meta={classHitId:'caster:session:1',classPoisonPulse:true};m.takeDamage(20,false,false,null,null,meta);
  assert.equal(m.hp,980);assert.equal(m.witchPoison.stacks,1);
  assert.equal(m.takeDamage(20,false,false,null,null,meta),false);assert.equal(m.hp,980);
  window.game.net.isHost=false;m.isLocalOnly=false;m.takeDamage(20,false,false,null,null,{classHitId:'caster:session:2',classPoisonPulse:true});
  assert.equal(m.hp,960);assert.equal(m.witchPoison.stacks,1);
 }finally{globalThis.window=saved;}
});
test('summoning at or below 80% is atomic, announces failure, and never constructs a summon',()=>{
 let summons=0;const failures=[],owner={x:0,y:0,hp:800,maxHp:1000};
 const c=new ClassCombatController(owner,'witch',{summon(){summons++;return {hp:1}},failure:s=>failures.push(s)});
 for(const hp of [799,800]){owner.hp=hp;assert.equal(c.skill(2),false);assert.equal(owner.hp,hp);}
 assert.equal(summons,0);assert.equal(failures.length,2);assert.deepEqual(c.cooldowns,{});
 owner.hp=801;assert.equal(c.skill(2),true);assert.equal(owner.hp,1);
});
test('trap effect and collision share identity; activation, replacement and expiry cancel the exact effect',()=>{
 const effects=new Map(),owner={x:0,y:0,hp:100},enemies=[];
 const c=new ClassCombatController(owner,'archer',{enemies:()=>enemies,effect:(n,d)=>effects.set(d.id,{n,...d}),cancelEffect:id=>effects.delete(id)});
 c.skill(1);const first=c.trap.id;c.cooldowns[1]=0;c.skill(1,{x:200});assert.ok(!effects.has(first));
 const second=c.trap.id;enemies.push({hp:100,x:200,y:0});c.update(.05);
 assert.equal(c.trap,null);assert.ok(!effects.has(second));assert.ok([...effects.values()].some(e=>e.n==='trap_trigger'));
 c.cooldowns[1]=0;c.skill(1,{x:400});const third=c.trap.id;for(let i=0;i<41;i++)c.update(.25);
 assert.equal(c.trap,null);assert.ok(!effects.has(third));
});
test('visual snapshots cannot invoke gameplay and reject duplicates, old sequence/session, other field and expired packets',()=>{
 const previous=globalThis.window;
 const scene={},game={net:{_getCurrentFieldId:()=> 'field'},sceneManager:{currentScene:scene},monsterManager:{worldGeneration:1},zone:{currentZone:{id:'zone'}}};globalThis.window={game};
 try {
  const remote=new RemoteClassVisuals({hp:10});remote.classId='archer';
  const packet={classId:'archer',fieldId:'field',epoch:1,sequence:1,ts:Date.now(),effects:[{id:'trap-1',name:'hunter_trap',x:0,y:0,duration:10,age:0}],projectiles:[],badges:[]};
  assert.equal(remote.receive(packet),true);assert.equal(remote.effects.length,1);assert.equal(remote.receive(packet),false);
  assert.equal(remote.receive({...packet,sequence:2,effects:[]}),true);assert.equal(remote.effects.length,0);
  assert.equal(remote.receive(packet),false);assert.equal(remote.receive({...packet,sequence:3,fieldId:'other'}),false);
  assert.equal(remote.receive({...packet,sequence:3,ts:Date.now()-13000}),false);
  assert.equal(remote.receive({...packet,epoch:2,sequence:1}),true);assert.equal(remote.receive({...packet,epoch:1,sequence:999}),false);
  assert.equal(remote.controller,undefined);assert.equal(remote.summons,undefined);
  game.sceneManager.currentScene={};remote.advance();assert.equal(remote.effects.length,0);
 }finally{globalThis.window=previous;}
});
test('delayed lifecycle clear cannot erase newer effect; expired active snapshot never resurrects consumed trap',()=>{
 const previous=globalThis.window;globalThis.window={game:{net:{_getCurrentFieldId:()=> 'f'}}};
 try{
  const v=new RemoteClassVisuals({hp:10});v.classId='archer';const p={classId:'archer',fieldId:'f',epoch:2,sequence:5,ts:Date.now(),effects:[{id:'new',name:'hunter_trap',x:0,y:0,duration:10,age:0}]};
  v.receive(p);assert.equal(v.receive({...p,sequence:4,effects:[]}),false);assert.equal(v.effects[0].id,'new');
  v.receive({...p,sequence:6,ts:Date.now()-6000,effects:[{...p.effects[0],age:5}]});assert.equal(v.effects.length,0);
 }finally{globalThis.window=previous;}
});
test('decoy renders original character for its actual lifetime, not just .65s one-shot',()=>{
 const draws=[];const bridge=Object.create(ClassCombatBridge.prototype);Object.assign(bridge,{owner:{x:0,y:0,width:48,height:48,sprite:{draw(...args){draws.push(args)}}},decoy:{x:0,y:0,remaining:1,direction:2,frame:1},effects:[],actors:[],images:{},controller:{enemies:()=>[],projectiles:[]},allies:()=>[]});
 bridge.render({save(){},restore(){},globalAlpha:1});assert.equal(draws.length,1);assert.equal(draws[0][1],2);
 bridge.decoy.remaining=0;bridge.render({});assert.equal(draws.length,1);
});
test('Warrior ground guide uses exact same 150x96 heavy geometry, Mage guide width is untouched',()=>{
 const p=Object.create(Player.prototype);Object.assign(p,{x:0,y:0,classId:'warrior',classAim:{action:'ATTACK',elapsed:.6,x:300,y:0}});
 const g=p.getClassAimGuide();assert.equal(g.targetX,150);assert.equal(g.widthRadius,48);assert.equal(g.exactWidth,true);
 const moves=[];const ctx={save(){},restore(){},beginPath(){},moveTo(...a){moves.push(a)},lineTo(){},closePath(){},fill(){},arc(){}};
 SkillRenderer.drawFireballAimGuide(ctx,g);assert.equal(moves[0][1],48);
 SkillRenderer.drawFireballAimGuide(ctx,{...g,exactWidth:false});assert.equal(moves[1][1],43.2);
});

test('poison authority metadata survives production compact cell encoding/decoding',()=>{
 const net=Object.create(NetworkManager.prototype),classPoison={revision:4,stacks:4,remaining:4.8,stun:0,gate:.8};
 const wire=net._buildMonsterRealtimeCellPayload({x:5,y:6,hp:100,maxHp:200,type:'slime',rev:8,ts:1000,state:'idle',classPoison});
 assert.deepEqual(wire.cp,classPoison);
 const decoded=net._decorateMonsterCellPayload('0_0',wire);
 assert.deepEqual(decoded.classPoison,classPoison);
});
