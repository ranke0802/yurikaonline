import test from 'node:test';
import assert from 'node:assert/strict';
import Controller from '../src/js/combat/ClassCombatController.js';
import {lifeOrbProfile} from '../src/js/combat/LifeOrb.js';
function setup(level=1){
 const owner={classId:'witch',x:0,y:0,hp:500,maxHp:1000,attackPower:100,attackSpeed:1,skillLevels:{lifeDrain:level}},enemies=[],hits=[];
 const c=new Controller(owner,'witch',{enemies:()=>enemies,damage(e,n){if(e.blocked)return 0;const actual=Math.min(n,e.hp);e.hp-=actual;hits.push({at:c.time,e,n:actual});return actual;}});
 const enemy=(x=300,y=0,hp=10000)=>{const e={x,y,hp,maxHp:hp,radius:12};enemies.push(e);return e;};
 const step=t=>{for(let elapsed=0;elapsed<t-1e-8;elapsed+=.01)c.update(Math.min(.01,t-elapsed));};
 return{c,owner,enemies,hits,enemy,step};
}
for(let level=1;level<=8;level++)test(`Lv.${level}: slow physical orb grows per-hit damage, slots and capped return healing`,()=>{
 const f=setup(level),e=f.enemy(),g=lifeOrbProfile(level);f.c.basic();const p=f.c.projectiles[0];
 assert.equal(p.target,e);assert.equal(p.radius,g.radius);assert.equal(p.speed,180);assert.equal(f.c.orbSlots().maximum,Math.ceil(level/2));
 f.step(1);assert.ok(p.x>0&&p.x<e.x);assert.equal(f.hits.length,0);assert.equal(f.owner.hp,500);
 f.step(1.2);assert.equal(f.hits.length,3);assert.ok(f.hits.every(h=>h.n===Math.ceil(100*g.hitMultiplier)));assert.equal(f.owner.hp,500);
 f.step(3);assert.equal(f.owner.hp,500+Math.ceil(100*g.healMultiplier));assert.equal(f.hits.length,3);assert.equal(f.c.orbSlots().active,0);
});
test('tap homes to the nearest living target; hold retains the chosen straight path',()=>{
 const f=setup(),near=f.enemy(150);f.enemy(300);f.c.basic();const p=f.c.projectiles[0];assert.equal(p.target,near);
 f.step(.2);near.y=70;f.step(.1);assert.ok(p.direction.y>0);
 const g=setup(),e=g.enemy();g.c.basic({aimed:true,x:300,y:0});const orb=g.c.projectiles[0];e.y=200;g.step(.5);assert.equal(orb.homing,false);assert.equal(orb.direction.y,0);g.step(6);assert.equal(g.hits.length,0);
});
test('dead, removed, escaped targets, no target and walls return without damage or healing',()=>{
 for(const mode of ['dead','removed','escape','empty','wall']){const f=setup(),e=mode==='empty'?null:f.enemy();f.c.basic();if(mode==='dead')e.hp=0;if(mode==='removed')f.enemies.length=0;if(mode==='escape')e.x=900;if(mode==='wall')f.c.hooks.projectileBlocked=x=>x>=100;f.step(6);assert.equal(f.hits.length,0,mode);assert.equal(f.owner.hp,500,mode);assert.equal(f.c.projectiles.length,0,mode);}
});
test('collision cannot cross a wall or affect a monster beyond 560px',()=>{
 const f=setup(),first=f.enemy(500),behindWall=f.enemy(500,25),outside=f.enemy(570);f.c.hooks.projectileBlocked=(x,y)=>y>15;
 f.c.basic();f.step(6);assert.ok(first.hp<10000);assert.equal(behindWall.hp,10000);assert.equal(outside.hp,10000);
});
test('return reserves its slot, clamps owner HP and never shares excess with allies',()=>{
 const f=setup(),ally={hp:50,maxHp:100};f.c.hooks.allies=()=>[ally];f.owner.hp=995;f.enemy(300,0,40);f.c.basic();
 for(let i=0;i<400&&f.c.projectiles[0]?.phase!=='return';i++)f.step(.01);
 assert.equal(f.c.projectiles[0].phase,'return');assert.equal(f.c.projectiles[0].speed,540);assert.equal(f.c.basic(),false);
 f.step(3);assert.equal(f.owner.hp,1000);assert.equal(ally.hp,50);assert.equal(f.c.basic(),true);
});
test('rejected damage grants no charge or HP; disposal clears the orb and deferred weapon work',()=>{
 const f=setup(),e=f.enemy();e.blocked=true;f.c.basic();f.step(2);assert.equal(f.c.projectiles[0].charge,0);f.step(4);assert.equal(f.owner.hp,500);
 f.c.basic();f.c.dispose();f.step(5);assert.equal(f.c.projectiles.length,0);assert.equal(f.hits.length,0);assert.equal(f.c.basic(),false);
});
test('attack-speed and held aim cannot bypass reservations or introduce an attack cooldown',()=>{
 const f=setup(8);f.owner.attackSpeed=1000;f.enemy();for(let i=0;i<4;i++)assert.equal(f.c.basic({aimed:true,x:300,y:0}),true);
 for(let i=0;i<100;i++)assert.equal(f.c.basic(),false);assert.equal(f.c.basicReady,0);assert.equal(f.c.orbSlots().active,4);
 f.step(6);assert.equal(f.c.orbSlots().available,4);assert.equal(f.owner.hp,604);
});
