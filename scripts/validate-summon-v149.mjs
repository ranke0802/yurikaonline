import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import Monster from '../src/js/entities/Monster.js';import Bridge from '../src/js/combat/ClassCombatBridge.js';import Controller,{SUMMON_TYPES} from '../src/js/combat/ClassCombatController.js';
import {summonStats,advanceSummonVitals,damageSummon} from '../src/js/combat/SummonStats.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
for(const [index,id] of SUMMON_TYPES.entries())test(`${id}: source stats 50%, interval 200%, pre-defense DPS 25%; independent of owner and skill rank`,()=>{
 const definition=JSON.parse(fs.readFileSync(`assets/data/monsters/${id}.json`)),before=structuredClone(definition);globalThis.window={game:{}};
 const source=new Monster(0,0,definition),half=summonStats(source);
 for(const k of ['hp','maxHp','mp','maxMp','atk','def','speed','hpRegen','mpRegen'])near(half[k],source[k]*.5);
 near(half.atk/half.attackCooldownSeconds,source.atk/source.attackCooldownSeconds*.25);
 assert.equal(half.level,definition.baseStats.level);assert.equal(half.attackRange,source.attackRange);
 const bridge=Object.create(Bridge.prototype);Object.assign(bridge,{definitions:new Map([[id,definition]]),owner:{id:'synthetic',x:0,y:0,hp:999999,maxHp:999999,attackPower:77777},actors:[]});
 const cache=Monster.spriteCache[source.assetPath];Monster.spriteCache[source.assetPath]={sprite:{draw(){}},usesV2Atlas:true};
 try{for(const level of [1,8]){const a=bridge.summon(id,level);for(const k of Object.keys(half))assert.equal(a[k],half[k]);assert.equal(a.weaponAttackMultiplier,1);assert.equal(a.visual.width,source.width*(source.isBoss?.6:1));}
 const enhanced=bridge.summon(id,index+1,{damageBonus:.72});assert.equal(enhanced.attackPower,half.atk);near(enhanced.weaponAttackMultiplier,1.72);
 }finally{if(cache)Monster.spriteCache[source.assetPath]=cache;else delete Monster.spriteCache[source.assetPath];}
 assert.deepEqual(definition,before);assert.deepEqual(summonStats(source),half,'source never becomes an already-halved actor');
});
test('definition variants and defaults pass through real Monster construction, never a separate balance table',()=>{
 globalThis.window={game:{}};const def={id:'variant',baseStats:{level:42,hp:401,maxHp:501,mp:31,maxMp:45,atk:19,def:7,speed:71,hpRegen:3,mpRegen:5},behavior:{attackCooldownMs:750,attackRange:87}};
 const source=new Monster(0,0,def),s=summonStats(source);assert.equal(s.hp,200.5);assert.equal(s.atk,9.5);assert.equal(s.attackCooldownSeconds,1.5);assert.equal(s.attackRange,87);assert.equal(s.level,42);
});
test('source DEF applies once; passive fractional regen and cap do not round or revive',()=>{
 const a={hp:30,maxHp:50,mp:5,maxMp:10,defense:4,hpRegen:2.5,mpRegen:1.5};assert.equal(damageSummon(a,10),6);assert.equal(a.hp,24);
 advanceSummonVitals(a,.1);near(a.hp,24.25);near(a.mp,5.15);advanceSummonVitals(a,50);assert.equal(a.hp,50);assert.equal(a.mp,10);
 damageSummon(a,1000);advanceSummonVitals(a,1);assert.equal(a.hp,0);assert.equal(a.isDead,true);assert.equal(damageSummon(a,3),0);
});
test('real bridge combat uses source ATK/speed/cadence with separate ten-second berserk; owner gear cannot leak',()=>{
 const owner={id:'owner',x:0,y:0,hp:100,maxHp:100,attackPower:99999};const game={localPlayer:owner,net:{},ui:{},sceneManager:{currentScene:{checkCollision:()=>false}},monsterManager:{}};globalThis.window={game};
 const b=Object.create(Bridge.prototype),enemy={id:'enemy',x:50,y:0,hp:10000,maxHp:10000};Object.assign(b,{owner,game,actors:[],effects:[],context:null,images:{},syncVisuals(){},paused:()=>false});
 b.controller=new Controller(owner,'witch',{enemies:()=>[enemy]});b.context={};
 // Drive the actual bridge update with the same current-world token used in production.
 return import('../src/js/entities/ProjectileWorldContext.js').then(({captureProjectileWorldContext})=>{
 b.context=captureProjectileWorldContext(game);const actor={id:'s',x:0,y:0,hp:50,maxHp:50,mp:0,maxMp:0,hpRegen:0,mpRegen:0,attackPower:10,speed:20,attackRange:60,attackCooldownSeconds:3,attackReady:0,weaponAttackMultiplier:1,classStatuses:{},visual:{_advanceAnimation(){}}};b.actors=[actor];const hits=[];b.damage=(e,n)=>{hits.push(n);return n;};
 b.update(.1);assert.equal(hits[0],10);near(actor.attackReady,3.1);owner.attackPower=1;actor.attackReady=0;b.update(.1);assert.equal(hits[1],10);
 Object.assign(b.controller.state(actor),{berserkUntil:b.controller.time+10,berserkPotency:1});actor.attackReady=0;b.update(.1);assert.equal(hits[2],12);near(actor.attackReady-b.controller.time,3/1.7);
 b.controller.time+=10;actor.attackReady=0;b.update(.1);assert.equal(hits[3],10);near(actor.attackReady-b.controller.time,3);assert.equal(actor.attackPower,10);
 enemy.x=300;const x=actor.x;b.update(.1);near(actor.x-x,2);
 });
});
test('80% cost, max three, oldest dismissal, death and disposal keep source stats isolated',()=>{
 const owner={x:0,y:0,hp:100,maxHp:100},removed=[];let id=0;const c=new Controller(owner,'witch',{summon:()=>({id:++id,hp:50,maxHp:50}),dismiss:e=>removed.push(e.id)});
 for(let i=0;i<4;i++){owner.hp=100;c.cooldowns[2]=0;assert.equal(c.skill(2),true);assert.equal(owner.hp,20);}assert.deepEqual(c.summons.map(a=>a.id),[2,3,4]);assert.deepEqual(removed,[1]);
 owner.hp=80;c.cooldowns[2]=0;assert.equal(c.skill(2),false);assert.equal(owner.hp,80);owner.hp=0;c.update(.1);assert.equal(c.summons.length,0);assert.equal(c.disposed,true);
});
