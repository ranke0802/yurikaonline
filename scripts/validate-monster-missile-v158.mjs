import test from 'node:test';
import assert from 'node:assert/strict';
import { Projectile } from '../src/js/entities/Projectile.js';
function fixture(monsterAttack=true){
 const player={id:'player',x:280,y:0,width:48,height:48,hp:100,canAttackTarget:()=>false},caster={id:'emolga',x:0,y:0,width:80,hp:100},ally={id:'ally',x:50,y:0,width:80,hp:100};
 const game={localPlayer:player,remotePlayers:new Map(),sceneManager:{currentScene:{}},monsterManager:{worldGeneration:1},net:{_getCurrentFieldId:()=> 'test'}};
 globalThis.window={game};const p=new Projectile(0,0,player,'missile',{ownerId:monsterAttack?caster.id:player.id,isMonsterAttack:monsterAttack,speed:700,vx:500,vy:0});
 const hits=[];p.hit=target=>{hits.push(target.id);p.isDead=true;};return {p,player,caster,ally,hits};
}
test('native monster missile leaves its caster and passes allied monsters',()=>{const f=fixture();f.p.update(.016,[f.caster,f.ally]);assert.equal(f.p.isDead,false);assert.deepEqual(f.hits,[]);assert.ok(f.p.x>0);});
test('native monster missile still contacts the local player',()=>{const f=fixture();f.p.x=f.player.x+24;f.p.y=f.player.y+24;f.p.update(0,[f.caster]);assert.deepEqual(f.hits,['player']);});
test('player missile still collides with hostile monsters',()=>{const f=fixture(false);f.p.update(.016,[f.caster]);assert.deepEqual(f.hits,['emolga']);});
