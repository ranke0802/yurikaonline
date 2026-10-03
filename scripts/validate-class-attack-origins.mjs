import { attackAnchor, combatCenter } from '../src/js/combat/ClassAnchors.js';
import test from 'node:test';import assert from 'node:assert/strict';
import Controller from '../src/js/combat/ClassCombatController.js';
function fixture(classId,hooks={}){
 const owner={x:10,y:20,width:48,height:48,hp:500,maxHp:1000,attackPower:30,attackSpeed:1};
 const enemies=[],events=[],hits=[];const c=new Controller(owner,classId,{enemies:()=>enemies,effect:(name,data)=>events.push({name,...data,at:c.time}),damage:(e,n)=>{hits.push({at:c.time,n});e.hp-=n;return n;},...hooks});
 const advance=seconds=>{while(seconds>1e-9){const step=Math.min(.05,seconds);c.update(step);seconds-=step;}};
 return {owner,c,enemies,events,hits,advance};
}
for(const [classId,kind]of[['archer','arrow'],['witch','orb']])test(`${kind} launch effect and collision projectile use the same authored origin and target direction`,()=>{
 const calls=[];const f=fixture(classId,{attackOrigin:(point,k)=>{calls.push({point,k});return{x:34,y:43};}});
 f.c.basic({aimed:kind==='orb',x:154,y:43});const p=f.c.projectiles[0];assert.deepEqual({x:p.x,y:p.y},{x:34,y:43});assert.deepEqual(p.direction,{x:1,y:0});assert.deepEqual({x:f.events[0].x,y:f.events[0].y},{x:p.x,y:p.y});assert.equal(calls[0].k,kind);
 const e={x:100,y:43,hp:10000,maxHp:10000,radius:1};f.enemies.push(e);f.advance(.4);assert.ok(kind==='arrow'?f.hits.length===1:f.c.tasks.length===3,'physical path follows the visible launch ray');
});
test('missing or nonfinite authored origin safely falls back to legacy owner coordinates',()=>{
 for(const value of [undefined,{x:NaN,y:0},{x:0,y:Infinity}]){const f=fixture('archer',{attackOrigin:()=>value});f.c.basic({x:110,y:20});assert.equal(f.c.projectiles[0].x,10);assert.equal(f.c.projectiles[0].y,20);}
});
test('drain return follows the moving palm and heals only once at that endpoint',()=>{
 const f=fixture('witch');f.c.hooks.attackOrigin=(_point,kind)=>{assert.equal(kind,'return');return{x:f.owner.x+100,y:f.owner.y};};
 const p={kind:'return',x:110,y:20,speed:300,remaining:Infinity,healing:30};f.c.projectiles.push(p);f.owner.x+=100;
 f.c.advanceProjectile(p,.1);assert.equal(p.x,140);assert.equal(f.owner.hp,500,'old position is not a return destination');
 f.c.advanceProjectile(p,.3);assert.equal(f.owner.hp,530);assert.equal(f.c.projectiles.length,0);f.advance(1);assert.equal(f.owner.hp,530);
});
test('poison potion lands at .45s, then retains five exact t1..5 damage pulses',()=>{
 const f=fixture('witch',{attackOrigin:()=>({x:34,y:43})});f.enemies.push({x:200,y:200,hp:100000,maxHp:100000});f.c.skill(1,{x:200,y:200});
 assert.equal(f.events[0].name,'poison_potion');assert.deepEqual(f.events[0].target,{x:200,y:200});assert.equal(f.events[0].duration,.45);assert.equal(f.events[0].x,34);assert.equal(f.hits.length,0);
 f.advance(.44);assert.equal(f.events.some(e=>e.name==='poison_cloud'),false);f.advance(.02);const cloud=f.events.find(e=>e.name==='poison_cloud');assert.equal(cloud.at,.45);assert.equal(cloud.duration,4.55);assert.equal(f.hits.length,0);
 f.advance(4.6);assert.deepEqual(f.hits.map(h=>h.at),[1,2,3,4,5]);assert.ok(f.hits.every(h=>h.n===5030));
});
test('poison landing and pulse tasks freeze on pause and disappear on dispose',()=>{
 let paused=true;const f=fixture('witch',{paused:()=>paused});paused=false;f.c.skill(1);paused=true;f.advance(2);assert.equal(f.events.length,1);paused=false;f.c.dispose();f.advance(2);assert.equal(f.events.length,1);assert.equal(f.hits.length,0);
});
test('charge effect connects original position to actual swept wall stop, not requested endpoint',()=>{
 const f=fixture('warrior');f.c.hooks.move=(actor,x,y)=>{if(x>70)return false;actor.x=x;actor.y=y;return true;};f.c.skill(2,{x:400,y:20});const effect=f.events.find(e=>e.name==='punishing_charge');assert.deepEqual({x:effect.x,y:effect.y},{x:10,y:20});assert.deepEqual(effect.target,{x:70,y:20});assert.deepEqual(effect.aimTarget,{x:400,y:20});
});
test('Warrior melee hitbox remains unchanged by palm hook',()=>{
 for(const classId of ['warrior']){const f=fixture(classId,{attackOrigin:()=>({x:10000,y:10000})});f.enemies.push({x:30,y:20,hp:1000,maxHp:1000});f.c.basic({x:100,y:20});assert.equal(f.hits.length,1);assert.equal(f.hits[0].at,0);assert.equal(f.hits[0].n,classId==='witch'?60:30);}
});
test('combat center shifts melee/radial queries and self effects, without using the palm origin',()=>{
 for(const classId of ['warrior']){
  const f=fixture(classId,{combatOrigin:()=>({x:500,y:500}),attackOrigin:()=>({x:900,y:900})});
  f.enemies.push({x:510,y:500,hp:1000,maxHp:1000},{x:30,y:20,hp:1000,maxHp:1000});
  f.c.basic({x:600,y:500});assert.equal(f.hits.length,1);assert.equal(f.enemies[1].hp,1000);assert.equal(f.events[0].x,500);assert.equal(f.events[0].y,500);
 }
});
test('skill range clamp starts from combat center, while charge still moves raw actor coordinates',()=>{
 const f=fixture('witch',{combatOrigin:()=>({x:100,y:100})});f.c.skill(1,{x:1000,y:100});assert.deepEqual(f.events[0].target,{x:550,y:100});
 const w=fixture('warrior',{combatOrigin:()=>({x:34,y:44})});const moves=[];w.c.hooks.move=(e,x,y)=>{moves.push({x,y});e.x=x;e.y=y;return false;};w.c.skill(2,{x:134,y:44});assert.deepEqual(moves[0],{x:30,y:20});
});
test('drain heal event occurs once only for actual healing, including ally overflow',()=>{
 for(const ownerHp of [970,1000]){const f=fixture('witch');f.owner.hp=ownerHp;f.c.projectiles.push({kind:'return',x:10,y:20,speed:300,remaining:Infinity,healing:30});f.advance(.05);const events=f.events.filter(e=>e.name==='drain_heal');assert.equal(events.length,ownerHp===970?1:0);if(events.length)assert.equal(events[0].amount,30);}
 const f=fixture('witch');f.owner.hp=1000;const ally={x:0,y:0,hp:80,maxHp:100};f.c.hooks.allies=()=>[ally];f.c.projectiles.push({kind:'return',x:10,y:20,speed:300,remaining:Infinity,healing:30});f.advance(.05);assert.equal(ally.hp,100);assert.equal(f.events.find(e=>e.name==='drain_heal').amount,20);
});
test('eight-way near targets never reverse the hand ray; spawn sweep hits once and rejects behind targets',()=>{
 for(const classId of ['archer','witch'])for(let index=0;index<8;index++){
  const a=index*Math.PI/4,forward={x:Math.cos(a),y:Math.sin(a)},center={x:100,y:100};
  const f=fixture(classId,{combatOrigin:()=>center,attackOrigin:()=>({x:100+forward.x*35,y:100+forward.y*35})});
  const near={x:100+forward.x*18,y:100+forward.y*18,hp:1000,maxHp:1000,radius:1};const behind={x:100-forward.x*4,y:100-forward.y*4,hp:1000,maxHp:1000,radius:1};f.enemies.push(behind,near);
  f.c.basic({aimed:classId==='witch',x:near.x,y:near.y});const p=f.c.projectiles[0];assert.ok(p.direction.x*forward.x+p.direction.y*forward.y>.999999);
  assert.equal(p.x,100+forward.x*35);f.advance(4);assert.equal(behind.hp,1000);assert.equal(near.hp,classId==='witch'?970:974);assert.equal(f.hits.length,classId==='witch'?3:1);
 }
});
test('normal far ray retains the exact hand-to-target vector',()=>{
 const f=fixture('archer',{combatOrigin:()=>({x:100,y:100}),attackOrigin:()=>({x:135,y:78})});f.c.basic({x:400,y:100});const d=f.c.projectiles[0].direction;assert.ok(Math.abs(d.x-265/Math.hypot(265,22))<1e-12);assert.ok(Math.abs(d.y-22/Math.hypot(265,22))<1e-12);
});

test('actual authored hand offsets hit eight close aim rays without widening their near collision strip',()=>{
 for(const classId of ['archer','witch'])for(let index=0;index<8;index++){
  const f=fixture(classId);f.owner.classId=classId;const center=combatCenter(f.owner),angle=index*Math.PI/4,forward={x:Math.cos(angle),y:Math.sin(angle)},target={x:center.x+forward.x*18,y:center.y+forward.y*18};
  f.c.hooks.combatOrigin=()=>combatCenter(f.owner);f.c.hooks.attackOrigin=(point,kind)=>attackAnchor(f.owner,point,kind);
  const near={...target,hp:1000,maxHp:1000,radius:1};f.enemies.push(near);f.c.basic({aimed:classId==='witch',...target});
  const p=f.c.projectiles[0],sweep=p.spawnSweep;assert.ok(Math.abs((sweep.to.x-center.x)*forward.y-(sweep.to.y-center.y)*forward.x)<1e-8);
  f.advance(4);assert.ok(near.hp<1000,`${classId} direction${index}`);
  // A separate narrow forward muzzle fixture isolates near-sweep width.
  const lateral=fixture(classId,{combatOrigin:()=>center,attackOrigin:()=>({x:center.x+forward.x*35,y:center.y+forward.y*35})});
  const radius=classId==='witch'?14:8,off=radius+2,side={x:target.x-forward.y*off,y:target.y+forward.x*off,hp:1000,maxHp:1000,radius:1};lateral.enemies.push(side);lateral.c.basic({aimed:classId==='witch',...target});lateral.advance(.05);assert.equal(side.hp,1000,'outside existing projectile halfwidth must not receive near compensation');assert.equal(lateral.c.tasks.length,0);
 }
});
