import test from 'node:test';
import assert from 'node:assert/strict';
import NetworkManager from '../src/js/core/NetworkManager.js';
import Monster from '../src/js/entities/Monster.js';
import MonsterManager from '../src/js/world/MonsterManager.js';
import ClassCombatBridge from '../src/js/combat/ClassCombatBridge.js';

function world(id, hostId = 'host') {
 const net = Object.create(NetworkManager.prototype);
 Object.assign(net, { playerId:id,currentHostId:hostId,isHost:id===hostId,connected:true,zoneParticipationEnabled:true,remotePlayers:new Map() });
 net._getCurrentFieldId=()=> 'fixture';net._isPayloadForCurrentField=p=>p.fieldId==='fixture';net.shouldUseMonsterQuietMode=()=>false;
 net._shouldSendRealtimeUserState=()=>true;
 const player={id,hp:100,maxHp:100,party:{hostId:'party',members:['host','owner']},takeDamage(){this.hp-=10;}};
 const actor={id:'summon:'+id+':1',typeId:'slime',ownerId:id,x:0,y:0,hp:50,maxHp:50,width:32,height:32,takeDamage(n){this.hp-=n;}};
 const bridge=Object.create(ClassCombatBridge.prototype);
 Object.assign(bridge,{owner:player,actors:[actor],controller:{time:0,state:()=>({})}});player.classCombat=bridge;
 const game={net,localPlayer:player}; return {net,player,actor,game};
}
function connectBus(worlds) {
 const handlers=new Map(), packets=[];
 for(const w of worlds) {
  w.net.dbRef={child:path=>({on:(_event,handler)=>handlers.set(path,handler),push:packet=>{
   packets.push(packet); const recipient=worlds.find(x=>path===`damage_events/${x.player.id}`); const previous=globalThis.window;
   if(recipient) {globalThis.window={game:recipient.game};handlers.get(path)?.({val:()=>packet,ref:{remove(){}}});}globalThis.window=previous;
  }})};
  globalThis.window={game:w.game};w.net._setupDamageListeners();
  for(const other of worlds) if(other!==w)w.net.remotePlayers.set(other.player.id,other.player);
 }
 return packets;
}
test('two clients: only monster host damages remote summon exactly once; owner remains unharmed',()=>{
 const previous=globalThis.window;try{
  const host=world('host'),owner=world('owner');const packets=connectBus([host,owner]);
  const monster=Object.create(Monster.prototype);monster.id='monster1';monster.typeId='slime';
  globalThis.window={game:owner.game};monster._damageClassTarget({...owner.actor,isSummon:true},10);
  assert.equal(owner.actor.hp,50);assert.equal(packets.length,0);
  globalThis.window={game:host.game};monster._damageClassTarget({...owner.actor,isSummon:true},10);
  assert.equal(owner.actor.hp,40);assert.equal(owner.player.hp,100);assert.equal(packets.length,1);
  monster._damageClassTarget({...host.actor,isSummon:true},8);
  assert.equal(host.actor.hp,42);assert.equal(host.player.hp,100);assert.equal(packets.length,1);
  globalThis.window={game:owner.game};owner.net.sendPlayerDamage('host',99,null,0,0,{summonId:host.actor.id,monsterId:'monster1'});
  assert.equal(host.actor.hp,42);
 }finally{globalThis.window=previous;}
});
test('two clients: same-party heal crosses one inbox; cross-party/self support rejected',()=>{
 const previous=globalThis.window;try{
  const host=world('host'),owner=world('owner');connectBus([host,owner]);owner.player.hp=20;
  globalThis.window={game:host.game};host.net.sendPlayerDamage('owner',0,null,0,0,{classSupport:{type:'heal',amount:15}});
  assert.equal(owner.player.hp,35);
  host.player.party={hostId:'other',members:['host']};host.net.sendPlayerDamage('owner',0,null,0,0,{classSupport:{type:'heal',amount:15}});
  assert.equal(owner.player.hp,35);
  globalThis.window={game:owner.game};owner.net.sendPlayerDamage('owner',0,null,0,0,{classSupport:{type:'heal',amount:15}});
  assert.equal(owner.player.hp,35);
 }finally{globalThis.window=previous;}
});
test('monster damage echo ignores attacker client and applies once on other client',()=>{
 const make=id=>({net:{playerId:id},monsters:new Map([['m',{hp:100,takeDamage(n){this.hp-=n;}}]]),isMonsterCombatBlocked:()=>false,_captureMonsterContributorLevel(){}});
 const owner=make('owner'),host=make('host');owner.monsters.get('m').hp-=20;
 const packet={mid:'m',aid:'owner',dmg:20};
 MonsterManager.prototype._onMonsterDamageReceived.call(owner,packet);
 MonsterManager.prototype._onMonsterDamageReceived.call(host,packet);
 assert.equal(owner.monsters.get('m').hp,80);assert.equal(host.monsters.get('m').hp,80);
});
test('empty Mage writes no summon updates; forced exit clears despite throttle and disabled field',async()=>{
 const previous=globalThis.window;try{
  const w=world('owner');const writes=[];w.net.dbRef={child:()=>({set:async value=>writes.push(structuredClone(value))})};globalThis.window={game:w.game};
  w.player.classCombat.actors=[];await w.net.syncClassSummons();await w.net.syncClassSummons({force:true});assert.equal(writes.length,0);
  w.player.classCombat.actors=[w.actor];await w.net.syncClassSummons();assert.equal(writes.length,1);
  w.player.classCombat.actors=[];w.net._shouldSendRealtimeUserState=()=>false;await w.net.syncClassSummons({force:true});
  assert.equal(writes.length,2);assert.deepEqual(writes[1],[]);
 }finally{globalThis.window=previous;}
});
