import test from 'node:test';
import assert from 'node:assert/strict';
import CampPreparation from '../src/js/core/CampPreparation.js';

const clone = value => structuredClone(value);
const definition = {baseStats:{maxHp:100,maxMp:50,atk:10,def:2},growthStats:{hp:10,mp:5,atk:2,def:1}};
function fixture(behavior = async()=>({ok:true})) {
 const profile={name:'saved-mage',x:456,y:789,level:12,exp:81,maxExp:8649,manastone:1000,vitality:7,intelligence:11,wisdom:5,agility:4,statPoints:3,hp:120,mp:62,skillLevels:{laser:2,missile:1,fireball:2,shield:1},inventory:[null,{type:'weapon_upgrade_stone',amount:3}],equipment:{weapon:null},currentZoneId:'zone_3',mapPositions:{zone_3:{x:456,y:789}},questData:{slimeKills:27},questState:{future:{completed:true}},unknownFutureField:{preserve:'yes'}};
 const saved=clone(profile),calls=[],presence=[];
 const net={savePlayerDataPatch:async(uid,patch,options)=>{calls.push({uid,patch:clone(patch),options});const result=await behavior(patch,calls.length);if(result.ok)Object.assign(saved,clone(patch));return result},flushProfileWrites:async()=>({ok:true}),sendPlayerHp:(...args)=>presence.push(args)};
 const game={net,isLocalMode:false};globalThis.window={game};
 const prep=new CampPreparation(game,{uid:'isolated-user'},profile,definition);game.localPlayer=prep.player;
 return{prep,profile,saved,calls,presence};
}

test('preparation loads actual stats without mutating original profile or field context',async()=>{
 const {prep,profile,saved,calls}=fixture();const initial=clone(profile);const p=prep.player;
 assert.equal(p.maxHp,170);assert.equal(p.maxMp,75);assert.equal(p.attackPower,23);assert.equal(p.hp,120);assert.equal(p.mp,62);assert.equal(p.level,12);
 p.x=0;p.y=0;p.name='should-not-save';p.questData.slimeKills=999;p.currentZoneId='zone_1';
 p.consumeInventoryItem('weapon_upgrade_stone',1);await p.saveState();await prep.flush();
 assert.equal(saved.inventory[1].amount,2);
 for(const key of ['name','x','y','level','exp','maxExp','currentZoneId','mapPositions','questData','questState','unknownFutureField'])assert.deepEqual(saved[key],initial[key],key);
 assert.deepEqual(profile,initial);
 assert.equal(calls[0].options.syncToZone,false);assert.equal(calls[0].uid,'isolated-user');
});

test('failed preparation save retries the same mutation without consuming materials twice',async()=>{
 const {prep,saved}=fixture(async(_patch,n)=>({ok:n>1,reason:'isolated_failure'}));const p=prep.player;
 p.consumeInventoryItem('weapon_upgrade_stone',1);
 assert.equal((await p.saveState()).ok,false);assert.equal(prep.status().ok,false);
 assert.equal(saved.inventory[1].amount,3);assert.equal(p.inventory[1].amount,2);
 assert.equal((await prep.flush()).ok,true);assert.equal(prep.status().ok,true);
 assert.equal(saved.inventory[1].amount,2);await prep.flush();assert.equal(saved.inventory[1].amount,2);
});

test('queued saves preserve newest values and do not clear later dirty changes early',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const {prep,saved,calls}=fixture(async(_patch,n)=>{if(n===1)await gate;return{ok:true}});const p=prep.player;
 p.manastone=900;const first=p.saveProfilePatch(['manastone']);
 await Promise.resolve();p.manastone=700;const second=p.saveProfilePatch(['manastone']);
 assert.equal(prep.pending,2);assert.equal(calls.length,1);release();await Promise.all([first,second]);
 assert.equal(calls.length,2);assert.equal(calls[0].patch.manastone,900);assert.equal(calls[1].patch.manastone,700);
 assert.equal(saved.manastone,700);assert.equal(prep.status().ok,true);
});

test('unrelated requested fields cannot overwrite field state and unknown account data',async()=>{
 const {prep,saved,calls,profile}=fixture();prep.player.level=999;prep.player.questState={};
 const result=await prep.player.saveProfilePatch(['level','questState','name','currentZoneId','unknownFutureField']);
 assert.equal(result.skipped,true);assert.equal(calls.length,0);assert.deepEqual(saved,profile);
});

test('derived stat changes in camp do not publish HP into the field',()=>{
 const {prep,presence}=fixture();prep.player.vitality++;
 prep.player.updateDerivedStats({save:false});
 assert.equal(presence.length,0,'camp preparation must never publish field presence');
});

test('clean camp lifecycle save cannot overwrite newer external equipment or inventory',async()=>{
 const {prep,saved,calls}=fixture();
 const newerInventory=[null,{type:'summon_scroll',amount:9}],newerEquipment={weapon:{type:'magic_staff',instanceId:'other-device',baseStats:{attackPower:23}}};
 saved.inventory=clone(newerInventory);saved.equipment=clone(newerEquipment);saved.manastone=9999;
 assert.equal((await prep.player.saveState()).skipped,true);
 assert.equal((await prep.flush()).ok,true);assert.equal(calls.length,0);
 assert.deepEqual(saved.inventory,newerInventory);assert.deepEqual(saved.equipment,newerEquipment);assert.equal(saved.manastone,9999);
});

test('inventory-only mutation preserves external equipment and successful retry becomes clean',async()=>{
 const {prep,saved,calls}=fixture();const newerEquipment={weapon:{type:'magic_staff',instanceId:'external'}};
 saved.equipment=clone(newerEquipment);prep.player.consumeInventoryItem('weapon_upgrade_stone',1);
 await prep.player.saveState();assert.equal(calls.length,1);
 assert.deepEqual(Object.keys(calls[0].patch),['inventory']);assert.deepEqual(saved.equipment,newerEquipment);
 assert.equal((await prep.player.saveState()).skipped,true);assert.equal(calls.length,1);
});

test('slow save remains one pending operation and late success clears the retryable notice',async()=>{
 let release; const gate=new Promise(resolve=>release=resolve);
 const {prep,saved,calls}=fixture(async()=>{await gate;return{ok:true}});prep.timeoutMs=10;
 prep.player.consumeInventoryItem('weapon_upgrade_stone',1);
 const result=await prep.player.saveState();assert.equal(result.reason,'camp_save_timeout');assert.equal(prep.pending,1);assert.equal(prep.status().ok,false);
 assert.equal(saved.inventory[1].amount,3);assert.equal((await prep.player.saveState()).reason,'camp_save_timeout');assert.equal((await prep.flush()).reason,'camp_save_timeout');assert.equal(calls.length,1);
 release();await prep.commitTail;assert.equal(prep.status().ok,true);assert.equal(saved.inventory[1].amount,2);
 assert.equal((await prep.flush()).ok,true);assert.equal(calls.length,1);
});
