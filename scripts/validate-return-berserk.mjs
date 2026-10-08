import test from 'node:test';
import assert from 'node:assert/strict';
import Controller from '../src/js/combat/ClassCombatController.js';
import NetworkManager from '../src/js/core/NetworkManager.js';
import { advanceLifeOrb } from '../src/js/combat/LifeOrb.js';
import { summonBerserkRemaining, summonBerserkDeadline, readSummonBerserkDeadline, drawSummonBerserk } from '../src/js/combat/SummonBerserkStatus.js';

function fixture(level=1){
 const owner={id:'me',x:0,y:0,hp:100,maxHp:1000,mp:1000,maxMp:1000,attackPower:100,skillLevels:{lifeDrain:level}},enemies=[],hits=[],heals=[];
 const c=new Controller(owner,'witch',{enemies:()=>enemies,damage(e,n,meta){const actual=e.rejected?0:Math.min(e.hp,n);e.hp-=actual;hits.push({id:e.id,n:actual,...meta});return actual;},healFeedback:(_,n)=>heals.push(n)});
 const enemy=(x=120,y=0)=>{const e={id:`e${enemies.length}`,x,y,hp:100000,maxHp:100000,radius:12};enemies.push(e);return e};
 const advance=(time,dt=1/60)=>{for(let t=0;t<time-1e-9;t+=dt)c.update(Math.min(dt,time-t));};
 const untilReturn=()=>{for(let i=0;i<1500&&c.projectiles[0]?.phase!=='return';i++)c.update(.005);assert.equal(c.projectiles[0]?.phase,'return')};
 return{owner,c,enemies,hits,heals,enemy,advance,untilReturn};
}
for(const fps of [4,20,60,144])test(`${fps}Hz: outgoing 3 + return 1 per enemy, four independent orbs, one capped heal each`,()=>{
 const f=fixture(8);for(let i=0;i<3;i++)f.enemy(120,i*3);for(let i=0;i<4;i++)assert.equal(f.c.basic(),true);
 assert.equal(f.c.basic(),false);f.advance(6,1/fps);
 for(let orb=1;orb<=4;orb++)for(const e of f.enemies){const hits=f.hits.filter(h=>h.orbId===orb&&h.id===e.id);assert.equal(hits.filter(h=>h.orbPhase==='outbound').length,3);assert.equal(hits.filter(h=>h.orbPhase==='return').length,1);assert.ok(hits.every(h=>h.n===105));}
 assert.deepEqual(f.heals,[26,26,26,26]);assert.equal(f.owner.hp,204);assert.equal(f.c.orbSlots().available,4);
});
test('first target on return contributes actual loss to one heal; outbound record remains empty',()=>{
 const f=fixture();f.c.basic({aimed:true,x:560,y:0});const p=f.c.projectiles[0];f.untilReturn();const e=f.enemy(240);assert.equal(p.hits.size,0);f.advance(3);
 assert.deepEqual(f.hits.map(h=>[h.id,h.orbPhase,h.n]),[[e.id,'return',70]]);assert.deepEqual(f.heals,[12]);assert.equal(p.returnHits.size,1);
 advanceLifeOrb(f.c,p,.25);assert.deepEqual(f.heals,[12]);
});
test('swept return checks the final arrival segment, avoids duplicates and clamps max HP',()=>{
 const f=fixture();f.owner.hp=998;const e=f.enemy(0);f.c.basic({aimed:true,x:560,y:0});const p=f.c.projectiles[0];
 Object.assign(p,{phase:'return',x:100,y:0,speed:10000});advanceLifeOrb(f.c,p,.25);
 assert.equal(f.hits.length,1);assert.equal(f.hits[0].orbPhase,'return');assert.equal(e.hp,99930);assert.equal(f.owner.hp,1000);assert.deepEqual(f.heals,[2]);
});
test('separate outbound target limit, miss/rejection, walls/range, death and dispose retain safeguards',()=>{
 const crowd=fixture();for(let i=0;i<8;i++)crowd.enemy(120,i);crowd.c.basic();crowd.advance(6);
 assert.equal(new Set(crowd.hits.filter(h=>h.orbPhase==='outbound').map(h=>h.id)).size,3);
 assert.equal(crowd.hits.filter(h=>h.orbPhase==='return').length,8);assert.deepEqual(crowd.heals,[12]);
 for(const mode of ['miss','reject','wall','range','death','dispose']){
  const f=fixture();f.c.basic({aimed:true,x:560,y:0});f.untilReturn();
  if(mode!=='miss'){const e=f.enemy(mode==='range'?570:240);if(mode==='reject')e.rejected=true;}
  if(mode==='wall')f.c.hooks.projectileBlocked=()=>true;
  if(mode==='death')f.owner.hp=0;if(mode==='dispose')f.c.dispose();
  f.advance(5);assert.equal(f.hits.filter(h=>h.n>0).length,0,mode);assert.deepEqual(f.heals,[],mode);assert.equal(f.c.orbSlots().available,1,mode);
 }
});
test('berserk targets current own summons and existing allies, never the caster or later summons',()=>{
 const f=fixture(),a={id:'summon:me:1',hp:50},ally={id:'party',hp:50};f.c.summons=[a];f.c.hooks.allies=()=>[ally];
 assert.equal(f.c.skill(3,{level:1}),true);assert.equal(summonBerserkRemaining(f.c,a),10);
 assert.equal(f.c.multipliers(a).attack,1.2);assert.equal(f.c.multipliers(ally).attack,1.2);assert.equal(f.c.multipliers(f.owner).attack,1);
 const later={hp:50,classStatuses:{berserk:{remaining:10}}};f.c.summons.push(later);assert.equal(summonBerserkRemaining(f.c,later),0);
 f.advance(10);assert.equal(summonBerserkRemaining(f.c,a),0);assert.equal(f.c.multipliers(a).attack,1);
});
test('summon network snapshots read real simulation state; deadlines expire without more packets',()=>{
 const f=fixture(),a={id:'summon:me:1',typeId:'slime',x:0,y:0,hp:50,maxHp:50};f.c.summons=[a];f.c.state(a).berserkUntil=10;
 f.owner.classCombat={controller:f.c,actors:[a]};const net=Object.create(NetworkManager.prototype);net.playerId='me';
 const old=Date.now;try{Date.now=()=>1000;const snap=net._buildClassSummonSnapshot(f.owner)[0];assert.equal(snap.berserkUntil,11000);assert.equal(readSummonBerserkDeadline(snap.berserkUntil,11000),0);
  assert.equal(NetworkManager.prototype._buildClassSummonSnapshot.call({playerId:'me'},f.owner)[0].berserkUntil,11000);
  assert.equal(readSummonBerserkDeadline(NaN,1000),0);assert.equal(readSummonBerserkDeadline(1e20,1000),11000);
  net.serverTimeOffsetMs=8000;assert.equal(net._buildClassSummonSnapshot(f.owner)[0].berserkUntil,19000);assert.equal(readSummonBerserkDeadline(19000,9000),19000);net.serverTimeOffsetMs=0;
  f.c.time=11;assert.equal(net._buildClassSummonSnapshot(f.owner)[0].berserkUntil,0);
  f.c.time=0;a.isDead=true;assert.deepEqual(net._buildClassSummonSnapshot(f.owner),[]);assert.equal(summonBerserkRemaining(f.c,a),0);
  a.isDead=false;f.c.summons=[];assert.equal(summonBerserkDeadline(f.c,a,1000),0);assert.equal(summonBerserkRemaining(new Controller(f.owner,'witch'),a),0);f.c.summons=[a];f.owner.hp=0;assert.equal(summonBerserkRemaining(f.c,a),0);f.owner.hp=100;f.c.dispose();assert.equal(summonBerserkRemaining(f.c,a),0);
 }finally{Date.now=old;}
});
test('berserk foot marker draws only existing atlas slot below the body; inactive/dead draw nothing',()=>{
 const calls=[],ctx={save(){},restore(){},drawImage(...args){calls.push(args)}},actor={x:80,y:80,hp:50},visual={sprite:{},renderHeight:64},image={width:256,height:128};
 const pos=drawSummonBerserk(ctx,actor,visual,true,image);assert.ok(pos.y>actor.y+32);assert.deepEqual(calls[0].slice(0,5),[image,64,0,64,64]);
 assert.equal(drawSummonBerserk(ctx,actor,visual,false,image),false);assert.equal(drawSummonBerserk(ctx,{...actor,hp:0},visual,true,image),false);assert.equal(calls.length,1);
});
