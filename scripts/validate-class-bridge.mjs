import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import ClassCombatBridge from '../src/js/combat/ClassCombatBridge.js';
import Monster from '../src/js/entities/Monster.js';
function fixture(){
 const packets=[],owner={id:'owner',x:10,y:10,level:5,hp:100,maxHp:100};
 const game={localPlayer:owner,monsterManager:{isMonsterCombatBlocked:()=>false},net:{playerId:'owner',isHost:true,sendMonsterDamage:(...args)=>{packets.push(args);return true;}},sceneManager:{currentScene:{checkCollision:(x)=>x>=50,remotePlayers:new Map()}},ui:{}};
 globalThis.window={game};const bridge=Object.create(ClassCombatBridge.prototype);Object.assign(bridge,{owner,game,actors:[],effects:[],images:{},controller:{classId:'witch',time:0}});owner.classCombat=bridge;
 return {bridge,owner,game,packets};
}
test('class damage sends one packet and predicts one accepted hit; rejects grant zero',()=>{
 const {bridge,game,packets}=fixture();let calls=0;const enemy={id:'m',hp:100,defense:10,takeDamage(n){calls++;this.hp-=n;}};
 assert.equal(bridge.damage(enemy,40),30);assert.equal(enemy.hp,70);assert.equal(calls,1);assert.equal(packets.length,1);
 game.net.sendMonsterDamage=()=>false;assert.equal(bridge.damage(enemy,40),0);assert.equal(calls,1);
 enemy.hasEffect=()=>true;assert.equal(bridge.damage(enemy,40),0);
});
test('poison exact MAX-HP component bypasses armor and armor-piercing scales defense',()=>{
 const {bridge}=fixture();const e={id:'m',hp:1000,defense:50,takeDamage(n){this.hp-=n;}};
 assert.equal(bridge.damage(e,100,{poison:true}),100);assert.equal(bridge.damage(e,100,{armorPierce:.5}),75);
});
test('swept movement rejects intervening wall without teleporting',()=>{
 const {bridge}=fixture();const actor={x:0,y:0,width:1,height:1};assert.equal(bridge.move(actor,100,0),false);assert.equal(actor.x,0);
 assert.equal(bridge.move(actor,40,0),true);assert.equal(actor.x,40);
});
test('raster effect and status frame crops use independent4x4 and4x2 grids',()=>{
 const {bridge}=fixture();const draws=[],ctx={drawImage(...args){draws.push(args);}};
 bridge.images.effects={width:1024,height:1024};bridge.drawEffect(ctx,'poison_cloud',100,100,280,.33);
 assert.deepEqual(draws[0].slice(1,5),[512,256,256,256]);
 bridge.images.status={width:1024,height:512};bridge.renderStatus(ctx,{x:100,y:100,hp:5,height:64,classStatuses:{root:{}}});
 assert.deepEqual(draws[1].slice(1,5),[0,256,256,256]);
});
test('status metadata applies no HP loss; stun consumes poison and clamps hostile values',()=>{
 fixture();const m=Object.create(Monster.prototype);Object.assign(m,{hp:100,x:0,y:0});
 assert.equal(m.takeDamage(0,false,false,null,null,{classStatus:{type:'poison',duration:5,slow:.8,stacks:4}}),true);assert.equal(m.hp,100);
 m.applyClassStatus({type:'stun',duration:3});assert.equal(m.classStatuses.poison,undefined);assert.equal(m.classStatuses.stun.remaining,3);
 m.applyClassStatus({type:'arbitrary',duration:5});assert.equal(m.classStatuses.arbitrary,undefined);
});
test('host targets summons through one owner inbox and never damages owner or repeats on guest',()=>{
 const {bridge,owner,game}=fixture();const actor={id:'summon:owner:1',ownerId:owner.id,isSummon:true,hp:20,takeDamage(n){this.hp=Math.max(0,this.hp-n);}};bridge.actors=[actor];
 const m=Object.create(Monster.prototype);m.id='m';m.typeId='slime';m._damageClassTarget(actor,12);assert.equal(actor.hp,8);assert.equal(owner.hp,100);
 game.net.isHost=false;m._damageClassTarget(actor,12);assert.equal(actor.hp,8);
 game.net.isHost=true;const sent=[];game.net.sendPlayerDamage=(...args)=>sent.push(args);m._damageClassTarget({...actor,id:'summon:remote:1',ownerId:'remote'},9);
 assert.equal(sent.length,1);assert.equal(sent[0][0],'remote');assert.equal(sent[0][5].summonId,'summon:remote:1');assert.equal(sent[0][5].monsterId,'m');
});
test('summon damage accepts only current living actor; dead/oldest/disposed IDs cannot hit owner',()=>{
 const {bridge,owner}=fixture();assert.equal(bridge.receiveSummonDamage('stale',500),false);assert.equal(owner.hp,100);
 const a={id:'s',hp:10,takeDamage(n){this.hp=Math.max(0,this.hp-n);this.isDead=this.hp===0;}};bridge.actors=[a];
 assert.equal(bridge.receiveSummonDamage('s',NaN),false);assert.equal(bridge.receiveSummonDamage('s',11),true);assert.equal(a.isDead,true);assert.equal(bridge.receiveSummonDamage('s',11),false);
});
test('remote Warrior push respects host wall,100px bound and boss immunity',()=>{
 fixture();const m=Object.create(Monster.prototype);Object.assign(m,{hp:100,x:0,y:0,width:10,height:10});
 assert.equal(m.takeDamage(0,false,false,null,null,{classMove:{x:80,y:0}}),false);assert.equal(m.x,0);assert.equal(m.classStatuses.stun.remaining,1.5);
 assert.equal(m.takeDamage(0,false,false,null,null,{classMove:{x:35,y:0}}),true);assert.equal(m.x,35);assert.equal(m.hp,100);
 m.isBoss=true;assert.equal(m.takeDamage(0,false,false,null,null,{classMove:{x:20,y:0}}),false);assert.equal(m.x,35);
});
test('single effect clamps last frame; sustained pingpong never exposes outside atlas',()=>{
 const {bridge}=fixture();bridge.images.effects={width:1024,height:1024};bridge.images.lifeCircle={width:1024,height:256};const frames=[];const ctx={drawImage(_img,x){frames.push(x/256);}};
 for(let tick=0;tick<8;tick++)bridge.drawEffect(ctx,'poison_cloud',0,0,10,tick*.16,{sustained:true});
 assert.deepEqual(frames,[0,1,2,3,2,1,0,1]);bridge.drawEffect(ctx,'life_circle',0,0,10,2);assert.equal(frames.at(-1),3);
});

test('Life Drain circle uses its separate4x1 raster without bleeding other skill rows',()=>{
 const {bridge}=fixture();const circle={width:1024,height:256};bridge.images.lifeCircle=circle;const calls=[];
 bridge.drawEffect({drawImage(...args){calls.push(args);}},'life_circle',20,30,190,.32);
 assert.equal(calls[0][0],circle);assert.deepEqual(calls[0].slice(1,5),[512,0,256,256]);
});

test('Blood Pact follows Warrior only on ground pass, at110px without body overlay',()=>{
 const {bridge,owner}=fixture();bridge.controller.classId='warrior';bridge.controller.enemies=()=>[];
 bridge.effects=[{name:'blood_pact',x:0,y:0,age:2,duration:8}];bridge.controller.projectiles=[];
 const draws=[];bridge.drawEffect=(...args)=>draws.push(args);bridge.renderGround({});
 assert.equal(draws.length,1);assert.equal(draws[0][1],'blood_pact');assert.equal(draws[0][2],owner.x);assert.equal(draws[0][4],110);
 bridge.render({});assert.equal(draws.length,1,'foreground pass cannot obscure Warrior');
});
test('boss summon retains exactly60percent raster dimensions after cached async init',async()=>{
 const {bridge}=fixture();const definition=JSON.parse(readFileSync(new URL('../assets/data/monsters/thunder_pikachu.json',import.meta.url)));
 const draws=[],key=definition.visual.assetPath,prior=Monster.spriteCache[key];
 Monster.spriteCache[key]={sprite:{draw(...args){draws.push(args);}},usesV2Atlas:true};
 try {
  bridge.definitions=new Map([[definition.id,definition]]);bridge.controller.enemies=()=>[];bridge.controller.projectiles=[];
  const actor=bridge.summon(definition.id,7);await actor.visual.init(key);
  assert.equal(actor.visual.width,definition.visual.width*.6);assert.equal(actor.visual.renderWidth,definition.visual.renderWidth*.6);assert.equal(actor.visual.renderHeight,definition.visual.renderHeight*.6);
  bridge.render({fillRect(){}});assert.equal(draws.length,1);assert.deepEqual(draws[0].slice(-2),[144,156]);
 } finally {if(prior)Monster.spriteCache[key]=prior;else delete Monster.spriteCache[key];}
});
