import test from 'node:test';import assert from 'node:assert/strict';
import Controller from '../src/js/combat/ClassCombatController.js';import Bridge from '../src/js/combat/ClassCombatBridge.js';import Player from '../src/js/entities/Player.js';
import {arrowRainSamples,renderArrowRain} from '../src/js/combat/ArrowRain.js';import {basicAttackProfile} from '../src/js/combat/BasicAttackProgression.js';
test('rain descends and lands at each of five actual damage deadlines, without damage before impact',()=>{
 const owner={hp:100,maxHp:100,x:0,y:0,attackPower:10},enemy={hp:1000,x:0,y:0,radius:1};const times=[];const c=new Controller(owner,'archer',{enemies:()=>[enemy],damage(e,n){e.hp-=n;times.push(c.time);return n;}});c.skill(3,{x:0,y:0});
 assert.ok(arrowRainSamples(.1).every(p=>p.height>200&&!p.impact));assert.ok(arrowRainSamples(.5).every(p=>p.height<70&&!p.impact));
 for(let i=0;i<61;i++)c.update(.05);assert.deepEqual(times.map(t=>Number(t.toFixed(2))),[.6,1.2,1.8,2.4,3]);
 for(const t of times)assert.equal(arrowRainSamples(t).filter(p=>p.impact).length,9);
 const calls=[];renderArrowRain({drawEffect:(...a)=>calls.push(a)}, {},{age:.3,x:0,y:0,radius:165},false);assert.equal(calls.length,9);assert.ok(calls.every(a=>a[6].angle===Math.PI/2));
});
for(const level of [1,4,8])test(`warrior level ${level} expanded circle/rectangle contact, facing and recovery floor`,()=>{
 const owner={hp:100,maxHp:100,x:0,y:0,attackPower:10,attackSpeed:1000,skillLevels:{cleave:level}},g=basicAttackProfile('warrior',owner.skillLevels),hits=[];
 const es=[{x:g.tap.range+8,y:0,radius:10,hp:100},{x:g.tap.range+11,y:0,radius:10,hp:100},{x:-30,y:0,radius:10,hp:100}];const c=new Controller(owner,'warrior',{enemies:()=>es,damage(e,n){hits.push(e);return n;}});c.basic({x:500,y:0});assert.deepEqual(hits,[es[0]]);assert.equal(c.basicReady,.2);assert.equal(c.basic({x:500,y:0}),false);assert.equal(g.tap.range,140*(1+.05*(level-1)));
});
test('blood pact feedback uses only clamped actual HP gain and none for full health or rejected hits',()=>{
 const owner={hp:98,maxHp:100,x:0,y:0},enemy={hp:100},feedback=[];let accepted=20;const c=new Controller(owner,'warrior',{damage:()=>accepted,lifestealFeedback:n=>feedback.push(n)});c.bloodUntil=8;c.hit(enemy,20);assert.equal(owner.hp,100);assert.deepEqual(feedback,[2]);c.hit(enemy,20);assert.deepEqual(feedback,[2]);owner.hp=50;accepted=0;c.hit(enemy,20);assert.equal(owner.hp,50);assert.deepEqual(feedback,[2]);
});
test('rejected warrior inputs have no aim or new body motion; insufficient rage has a reason',()=>{
 const owner={classId:'warrior',hp:100,x:0,y:0,classAim:null},c=new Controller(owner,'warrior'),b=Object.create(Bridge.prototype);Object.assign(b,{owner,controller:c,paused:()=>false});owner.classCombat=b;globalThis.window={game:{tutorial:{isActionAllowed:()=>true}}};c.basicReady=1;Player.prototype.startClassAction.call(owner,'ATTACK');assert.equal(owner.classAim,null);
 owner.classAim={action:'ATTACK',elapsed:1,x:100,y:0};assert.equal(b.currentMotion(),null);c.time=2;assert.equal(b.currentMotion(),null);let failure='';c.hooks.failure=s=>failure=s;assert.equal(c.basic({aimed:true}),false);assert.match(failure,/분노 25/);c.rage=25;assert.equal(b.currentMotion().held,true);
});
test('warrior automatic release follows a moving enemy; manual drag direction stays unchanged',()=>{
 globalThis.window={game:{}};const calls=[],enemy={x:0,y:100,hp:100};const p={classId:'warrior',hp:100,x:0,y:0,width:0,height:0,classCombat:{paused:()=>false,controller:{enemies:()=>[enemy]},basic:o=>{calls.push(o);return true;}}};
 p.classAim={action:'ATTACK',elapsed:0,x:100,y:0};Player.prototype.releaseClassAction.call(p,'ATTACK');assert.equal(calls[0].x,0);assert.equal(calls[0].y,100);p.classAim={action:'ATTACK',elapsed:0,x:100,y:0,manual:true};Player.prototype.releaseClassAction.call(p,'ATTACK');assert.equal(calls[1].x,100);assert.equal(calls[1].y,0);
});
