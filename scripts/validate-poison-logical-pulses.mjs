import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptPoisonPulse,claimPoisonPulse,poisonSnapshot,restorePoisonSnapshot,paintPoisonStatus} from '../src/js/combat/WitchPoison.js';
import Monster from '../src/js/entities/Monster.js';
const pulse=(index,castId='A:session:cloud')=>({castId,index});
function hit(target,now,p){target.classCombatTime=now;if(!claimPoisonPulse(target,now,p))return false;return acceptPoisonPulse(target,now,p);}
for(const delays of [[0,0,0,0,0],[0,.12,0,.12,0],[.12,0,.12,0,.12]])test(`five logical pulses stun with jitter ${delays}`,()=>{
 const m={};for(let i=1;i<=5;i++)hit(m,i+delays[i-1],pulse(i));paintPoisonStatus(m);
 assert.equal(m.witchPoison.stacks,0);assert.ok(Math.abs(m.classStatuses.stun.remaining-3)<1e-9);
});
test('reverse delivery of two pulses does not discard one or let duplicates damage twice',()=>{
 const m={};for(const [i,t]of [[1,1],[3,3],[2,3.1],[5,5],[4,5.1]])assert.ok(hit(m,t,pulse(i)));
 assert.equal(m.witchPoison.stunUntil,8.1);assert.equal(hit(m,5.2,pulse(4)),false);
});
test('multiple casters share logical buckets without accelerating or extending stun',()=>{
 const m={};for(let i=1;i<=5;i++){hit(m,i,pulse(i));const copy=m.witchPoison.stacks;hit(m,i+.12,pulse(i,'B'));assert.equal(m.witchPoison.stacks,copy);}
 assert.equal(m.witchPoison.stunUntil,8);
 for(const t of [5.3,6,7.9]){hit(m,t,pulse(1,`spam-${t}`));assert.equal(m.witchPoison.stunUntil,8);assert.equal(m.witchPoison.stacks,0);}
 hit(m,8.01,pulse(1,'fresh'));assert.equal(m.witchPoison.stacks,1);
});
test('handoff keeps cast anchors, used buckets and damage dedupe under a different host clock',()=>{
 const old={};hit(old,1,pulse(1));hit(old,2.12,pulse(2));
 const next={classCombatTime:100};restorePoisonSnapshot(next,poisonSnapshot(old),.1);
 assert.equal(claimPoisonPulse(next,100,pulse(2)),false);
 hit(next,100.78,pulse(3));hit(next,101.90,pulse(4));hit(next,102.78,pulse(5));
 paintPoisonStatus(next);assert.equal(next.classStatuses.stun.remaining,3);
 const locked={classCombatTime:200};restorePoisonSnapshot(locked,poisonSnapshot(next),.2);
 hit(locked,202.7,pulse(1,'during-stun'));assert.equal(locked.witchPoison.stacks,0);
});
test('real Monster accepts each logical damage once even with changed transport id and host handoff',()=>{
 const before=globalThis.window;globalThis.window={game:{net:{isHost:true},monsterManager:{forceSync(){}},shouldSuppressTransientWorldEffects:()=>true}};
 try{
 const m=new Monster(0,0,{id:'slime',baseStats:{hp:10000,maxHp:10000}});m.isLocalOnly=true;
 for(let i=1;i<=5;i++){
  m.classCombatTime=i+(i%2===0?.12:0);const meta={classPoisonPulse:true,poisonPulse:pulse(i),classHitId:`hit-${i}`};
  m.takeDamage(530,false,false,null,null,meta);assert.equal(m.takeDamage(530,false,false,null,null,{...meta,classHitId:`retry-${i}`}),false);
 }
 assert.equal(m.hp,7350);assert.ok(Math.abs(m.classStatuses.stun.remaining-3)<1e-9);
 const next=new Monster(0,0,{id:'slime',baseStats:{hp:m.hp,maxHp:10000}});next.classCombatTime=100;restorePoisonSnapshot(next,poisonSnapshot(m));
 assert.equal(next.takeDamage(530,false,false,null,null,{classPoisonPulse:true,poisonPulse:pulse(5),classHitId:'after-handoff'}),false);assert.equal(next.hp,7350);
 }finally{globalThis.window=before;}
});
test('expiry clears stacks and journal bounds remain finite',()=>{
 const m={};hit(m,1,pulse(1));hit(m,7,pulse(1,'new'));assert.equal(m.witchPoison.stacks,1);
 for(let i=0;i<1000;i++)hit(m,7+i/1000,pulse(1,`load-${i}`));
 assert.ok(m.witchPoison.seen.length<=256);assert.ok(m.witchPoison.casts.length<=64);assert.ok(m.witchPoison.buckets.length<=64);
});

test('guest prediction cannot outrank a newer host status revision',()=>{
 const guest={classCombatTime:0},host={};
 for(let i=1;i<=5;i++)claimPoisonPulse(guest,i,pulse(i),false);
 hit(host,1,pulse(1));restorePoisonSnapshot(guest,poisonSnapshot(host));
 assert.equal(guest.witchPoison.stacks,1);
});
