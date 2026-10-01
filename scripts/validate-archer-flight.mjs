import test from 'node:test';
import assert from 'node:assert/strict';
import Controller from '../src/js/combat/ClassCombatController.js';
import {combatCenter,attackAnchor} from '../src/js/combat/ClassAnchors.js';
import RemoteVisuals,{renderGroundEffects,renderForegroundEffects} from '../src/js/combat/ClassVisuals.js';
function fixture(){
 const owner={x:100,y:100,width:48,height:48,classId:'archer',hp:100,maxHp:100,attackPower:100,attackSpeed:1};
 const enemies=[],hits=[],effects=[];
 const c=new Controller(owner,'archer',{combatOrigin:()=>combatCenter(owner),attackOrigin:(p,k)=>attackAnchor(owner,p,k),enemies:()=>enemies,
 damage:(e,n,meta)=>{if(e.blocked)return 0;const loss=Math.min(e.hp,n);e.hp-=loss;hits.push({id:e.id,n,meta,t:c.time});return loss;},effect:(name,d)=>effects.push({name,...d})});
 const advance=t=>{for(let left=t;left>1e-8;left-=.01)c.update(Math.min(.01,left));};
 const add=(id,x,y)=>{const e={id,x,y,radius:8,hp:10000,maxHp:10000};enemies.push(e);return e;};return{owner,c,enemies,hits,effects,advance,add};
}
for(const aimed of [false,true])for(let direction=0;direction<8;direction++)test(`${aimed?'snipe':'tap'} direction${direction} advances at authored speed and expires at range`,()=>{
 const f=fixture(),a=direction*Math.PI/4,center=combatCenter(f.owner),target={x:center.x+300*Math.cos(a),y:center.y+300*Math.sin(a)};
 assert.equal(f.c.basic({...target,aimed}),true);const p=f.c.projectiles[0],start={x:p.x,y:p.y},range=aimed?650:600,speed=aimed?780:540;
 assert.equal(p.kind,aimed?'snipe':'arrow');assert.equal(p.remaining,range);assert.equal(p.speed,speed);
 f.advance(.1);assert.ok(Math.abs(Math.hypot(p.x-start.x,p.y-start.y)-speed*.1)<1e-7);assert.equal(f.hits.length,0);
 const frozen={x:p.x,y:p.y};f.c.hooks.paused=()=>true;f.advance(.2);assert.deepEqual({x:p.x,y:p.y},frozen);f.c.hooks.paused=()=>false;
 f.advance(1.2);assert.equal(f.c.projectiles.length,0);assert.ok(Math.abs(Math.hypot(p.x-start.x,p.y-start.y)-range)<1e-7);assert.equal(f.hits.length,0);
});
test('snipe damage, mark consumption and trap burst wait for contact; pierces each target once',()=>{
 const f=fixture(),a=f.add('a',300,124),b=f.add('b',460,124),side=f.add('side',300,210);f.c.mark(a,3);f.c.mark(b,2);f.c.state(a).trappedUntil=4;f.c.empowered=true;
 f.c.basic({aimed:true,x:600,y:124});assert.equal(f.hits.length,0);assert.equal(f.c.state(a).marks,3);assert.equal(f.c.empowered,false);
 f.advance(.05);assert.equal(f.hits.length,0);f.advance(.75);
 assert.equal(f.hits.filter(h=>h.id==='a').length,1);assert.equal(f.hits.filter(h=>h.id==='b').length,1);assert.equal(f.c.state(a).marks,0);assert.equal(f.c.state(b).marks,0);assert.equal(f.c.state(side).marks,2);
 assert.equal(f.hits.find(h=>h.id==='a').n,435);assert.equal(f.hits.find(h=>h.id==='a').meta.armorPierce,.5);
 assert.equal(f.effects.filter(e=>e.name==='trap_burst').length,1);f.advance(1);assert.equal(f.hits.filter(h=>h.id==='a').length,1);assert.equal(f.c.projectiles.length,0);
});
test('moving target can leave path, new target can enter it, owner movement never tethers arrow',()=>{
 const f=fixture(),old=f.add('old',420,124);f.c.mark(old,5);f.c.basic({aimed:true,x:600,y:124});const p=f.c.projectiles[0],origin={x:p.x,y:p.y};f.owner.x+=180;old.y+=150;
 const fresh=f.add('fresh',350,124);f.advance(.7);assert.ok(p.x>origin.x+500);assert.equal(f.hits.filter(h=>h.id==='old').length,0);assert.equal(f.c.state(old).marks,5);assert.equal(f.hits.filter(h=>h.id==='fresh').length,1);
});
test('far/behind targets stay unhit, rejected hits preserve marks, death removes airborne snipe',()=>{
 const f=fixture(),behind=f.add('behind',80,124),far=f.add('far',900,124),blocked=f.add('blocked',300,124);blocked.blocked=true;f.c.mark(blocked,4);f.c.basic({aimed:true,x:600,y:124});f.advance(1);
 assert.equal(f.hits.length,0);assert.equal(f.c.state(blocked).marks,4);assert.equal(f.c.projectiles.length,0);f.advance(.1);f.c.basic({aimed:true,x:600,y:124});f.owner.hp=0;f.c.update(.01);assert.equal(f.c.projectiles.length,0);
});
test('snipe draws only at moving projectile position, never as a fixed launch arrow',()=>{
 const calls=[],r={owner:{x:100,y:100,width:48,height:48},effects:[{name:'piercing_snipe',x:130,y:100,target:{x:800,y:100},age:.1}],projectiles:[{kind:'snipe',x:250,y:100,direction:{x:1,y:0},age:.1}],drawEffect:(...v)=>calls.push(v)};
 renderGroundEffects(r,{});renderForegroundEffects(r,{});assert.equal(calls.length,1);assert.equal(calls[0][1],'snipe');assert.equal(calls[0][2],250);
 r.projectiles[0].x=328;calls.length=0;renderForegroundEffects(r,{});assert.equal(calls[0][2],328);
});
test('remote snipe extrapolates, clamps remaining range and clears without applying damage',()=>{
 const previous=globalThis.window,realNow=Date.now;let now=1000,damage=0;Date.now=()=>now;
 globalThis.window={game:{net:{_getCurrentFieldId:()=> 'f',sendMonsterDamage:()=>damage++},sceneManager:{currentScene:{}}}};
 try{const v=new RemoteVisuals({hp:100,x:0,y:0});const packet={classId:'archer',fieldId:'f',epoch:1,sequence:1,ts:now,projectiles:[{kind:'snipe',x:100,y:100,direction:{x:1,y:0},speed:780,remaining:100,age:0}]};
 assert.equal(v.receive(packet),true);assert.equal(v.receive(packet),false);now+=100;v.advance();assert.equal(v.projectiles[0].x,178);now+=100;v.advance();assert.equal(v.projectiles.length,0);assert.equal(damage,0);
 }finally{Date.now=realNow;globalThis.window=previous;}
});
