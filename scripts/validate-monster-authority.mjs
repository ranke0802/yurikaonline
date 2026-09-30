import test from 'node:test';
import assert from 'node:assert/strict';
import Monster from '../src/js/entities/Monster.js';
import MonsterManager from '../src/js/world/MonsterManager.js';
globalThis.window={};
function fixture(host=false){window.game={net:{isHost:host},ui:{},zone:{width:3200,height:3200}};const m=new Monster(500,500,{id:'slime',baseStats:{hp:100,maxHp:100},visual:{width:80,height:80}});m.ready=true;return m;}
test('guest repeated and critical predicted hits cannot start a death fade',()=>{const m=fixture();for(let i=0;i<30;i++){m.takeDamage(15,true,i%2===0);m.update(1/60);assert.equal(m.isDead,false);assert.equal(m.alpha,1);assert.equal(m.deathTimer,0);}assert.equal(m.hp,1);});
test('host lethal damage still confirms death',()=>{const m=fixture(true);m.takeDamage(101);assert.equal(m.hp,0);assert.equal(m.isDead,true);});
test('accepted living authority clears a faded entity; stale death cannot overwrite it',()=>{const m=fixture();const mm=Object.create(MonsterManager.prototype);Object.assign(mm,{net:{isHost:false},monsters:new Map([[m.id,m]]),monsterRegionMap:new Map(),monsterRevisionMap:new Map(),_getCellIdFromPosition:()=> '0_0'});m.isDead=true;m.hp=0;m.alpha=0;m.deathTimer=2;m.remoteSyncRev=10;m.remoteSyncTs=100;mm._onRemoteMonsterUpdated({id:m.id,x:500,y:500,hp:70,maxHp:100,rev:11,ts:110,state:'aggro'});assert.equal(m.isDead,false);assert.equal(m.alpha,1);assert.equal(m.deathTimer,0);mm._onRemoteMonsterUpdated({id:m.id,x:500,y:500,hp:0,rev:10,ts:100,state:'dead'});assert.equal(m.hp,70);assert.equal(m.isDead,false);mm._onRemoteMonsterUpdated({id:m.id,x:500,y:500,hp:0,rev:12,ts:120,state:'dead'});assert.equal(m.isDead,true);});
