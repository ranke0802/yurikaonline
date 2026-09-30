import test from 'node:test';
import assert from 'node:assert/strict';
import NetworkManager from '../src/js/core/NetworkManager.js';
import CampPreparation from '../src/js/core/CampPreparation.js';

// Actual online profile/journal/flush code; only Firebase transport and browser
// storage are replaced. No credentials or production account IDs are used.
const uid='isolated-camp-online';
const clone=value=>value===undefined?undefined:structuredClone(value);
function validateFirebaseValue(value, path='profile') {
 assert.notEqual(value,undefined,`${path}: undefined Firebase payload`);
 if(typeof value==='number')assert.ok(Number.isFinite(value),`${path}: nonfinite Firebase payload`);
 if(value&&typeof value==='object')for(const[key,entry]of Object.entries(value)) {
  assert.doesNotMatch(key,/[.#$\[\]\/]/,`${path}: invalid Firebase key`);
  validateFirebaseValue(entry,`${path}/${key}`);
 }
}

function fixture({cachedNull=false,errorCode=null,revision=41,evictAfterOnce=false}={}) {
 const profile={name:'fixture-mage',level:19,exp:2411,maxExp:147789,manastone:12900,vitality:7,intelligence:14,wisdom:8,agility:4,statPoints:2,hp:159,mp:85,x:722,y:611,currentZoneId:'zone_4',mapId:'zone_4',mapPositions:{zone_4:{x:722,y:611}},skillLevels:{laser:3,missile:2,fireball:4,shield:1},inventory:[{type:'manastone',amount:12900},{type:'magic_staff',slot:'weapon',instanceId:'fixture-new',baseStats:{attackPower:31}},{type:'weapon_upgrade_stone',amount:7}],equipment:{weapon:{type:'magic_staff',slot:'weapon',instanceId:'fixture-old',baseStats:{attackPower:17}}},questData:{slimeKills:44,bossClearCount:8},questState:{completed:{zone3:true}},unknownFutureField:{keep:true},_profileRevision:revision,ts:Date.now()};
 const state={profile:clone(profile),cachedNull,errorCode,transactions:0,reads:0,writes:[],transportPayloads:[],listeners:new Map(),subscriptions:0,unsubscriptions:0,evictAfterOnce};
 const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),key:i=>[...values.keys()][i],get length(){return values.size}};
 const snapshot=value=>({val:()=>clone(value),exists:()=>value!=null,forEach:()=>false});
 const firebase={database:()=>({ref:path=>({
  on:(event,callback,cancel)=>{assert.equal(event,'value');state.subscriptions++;state.listeners.set(callback,path);queueMicrotask(()=>{if(!state.listeners.has(callback)||state.suppressValueEvent)return;if(state.errorCode){cancel?.(Object.assign(Error(state.errorCode),{code:state.errorCode}));return;}state.cachedNull=false;callback(snapshot(path===`users/${uid}/profile`?state.profile:null));});return callback},
  off:(event,callback)=>{assert.equal(event,'value');if(state.listeners.delete(callback))state.unsubscriptions++;if(state.evictAfterOnce&&!state.listeners.size)state.cachedNull=true},
  once:async()=>{state.reads++;if(state.errorCode)throw Object.assign(Error(state.errorCode),{code:state.errorCode});if(path===`users/${uid}/profile`){state.cachedNull=state.evictAfterOnce&&!state.listeners.size;return snapshot(state.profile)}return snapshot(null)},
  transaction:async updater=>{state.transactions++;if(state.errorCode)throw Object.assign(Error(state.errorCode),{code:state.errorCode});const current=(state.cachedNull||(state.evictAfterOnce&&!state.listeners.size))?null:clone(state.profile);const next=updater(current);if(next===undefined)return{committed:false,snapshot:snapshot(current)};if(state.commitGate)await state.commitGate;validateFirebaseValue(next);state.transportPayloads.push(clone(next));state.profile=clone(next);return{committed:true,snapshot:snapshot(next)}},
  set:async value=>state.writes.push({path,value:clone(value)}),update:async value=>state.writes.push({path,value:clone(value)})
 })})};
 globalThis.firebase=firebase;globalThis.localStorage=storage;globalThis.window={firebase,localStorage:storage};
 const net=new NetworkManager();clearInterval(net._batchTimer);net.playerId=uid;net.connected=true;net.zoneParticipationEnabled=false;net._rememberProfileRevision(uid,profile);
 const game={net,isLocalMode:false};window.game=game;
 const prep=new CampPreparation(game,{uid},profile,{baseStats:{maxHp:100,maxMp:50,atk:10},growthStats:{hp:10,mp:5,atk:1,def:1}});game.localPlayer=prep.player;
 return{state,profile,prep,net,storage};
}

test('real online save commits Lv19 camp equipment and retains zone, quest, identity and extra fields',async()=>{
 const{state,profile,prep,net}=fixture();const p=prep.player;
 assert.equal(p.equipWeaponFromInventory(1).ok,true);await prep.tail;assert.equal(prep.status().ok,true);
 assert.equal((await prep.flush()).ok,true);assert.equal(state.profile.equipment.weapon.instanceId,'fixture-new');
 for(const key of ['name','level','exp','maxExp','currentZoneId','mapId','mapPositions','x','y','questData','questState','unknownFutureField'])assert.deepEqual(state.profile[key],profile[key],key);
 assert.equal(state.profile.inventory[1].instanceId,'fixture-old');assert.equal(net.getLocalProfilePatchJournal(uid),null);
 assert.equal(state.writes.length,0,'no recovery or world transport writes');
});

test('cold transaction cache is warmed before first equipment save and swaps only once',async()=>{
 const{state,prep}=fixture({cachedNull:true});prep.player.equipWeaponFromInventory(1);await prep.tail;
 assert.equal(prep.status().ok,true);
 assert.equal((await prep.flush()).ok,true);assert.equal(state.subscriptions,1,'save retains cache with temporary value listener');assert.equal(state.transactions,1);assert.equal(state.profile.equipment.weapon.instanceId,'fixture-new');
 assert.equal(state.profile.inventory[1].instanceId,'fixture-old');assert.equal(prep.status().ok,true);
});

test('stale tracked revision reproduces profile_conflict; retry retains unrelated newer server fields',async()=>{
 const{state,prep}=fixture();state.profile._profileRevision++;state.profile.questData.bossClearCount=9;
 prep.player.equipWeaponFromInventory(1);await prep.tail;
 assert.equal(prep.status().reason,'profile_conflict');assert.equal((await prep.flush()).ok,true);
 assert.equal(state.profile.questData.bossClearCount,9);assert.equal(state.profile.equipment.weapon.instanceId,'fixture-new');
});

for(const code of ['PERMISSION_DENIED','DISCONNECTED'])test(`actual online ${code} failure retains journal and can retry without duplicate changes`,async()=>{
 const{state,prep,net}=fixture({errorCode:code});prep.player.equipWeaponFromInventory(1);await prep.tail;
 assert.equal(prep.status().reason,'save_patch_failed');assert.equal(prep.status().code,code);assert.ok(net.getLocalProfilePatchJournal(uid));
 assert.equal(state.profile.equipment.weapon.instanceId,'fixture-old');state.errorCode=null;
 assert.equal((await prep.flush()).ok,true);assert.equal(state.profile.equipment.weapon.instanceId,'fixture-new');
 assert.equal(state.profile.inventory[1].instanceId,'fixture-old');assert.equal(net.getLocalProfilePatchJournal(uid),null);assert.equal(state.listeners.size,0);assert.equal(state.subscriptions,state.unsubscriptions);
});

test('clean camp flush replays a pending online journal; stale revision errors surface without any camp mutation',async()=>{
 const{state,prep,net}=fixture();net._storeLocalProfilePatchJournal(uid,{manastone:12600,skillLevels:{...state.profile.skillLevels,laser:4}},{checkpointPolicy:'durable'});
 state.profile._profileRevision++;
 assert.equal(prep.dirty.size,0);const first=await prep.flush();assert.equal(first.reason,'profile_conflict');
 assert.equal(state.profile.manastone,12900);assert.equal((await prep.flush()).ok,true);assert.equal(state.profile.manastone,12600);
});

test('late actual Firebase commit clears timeout and retry does not resubmit equipment mutation',async()=>{
 const{state,prep}=fixture();let release;state.commitGate=new Promise(resolve=>release=resolve);prep.timeoutMs=10;
 prep.player.equipWeaponFromInventory(1);await prep.tail;
 assert.equal(prep.status().ok,false);assert.equal(prep.status().reason,'camp_save_timeout');
 const retry=prep.flush();await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(state.transactions,1,'retry must await original transaction rather than create another write');
 release();await retry;await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(state.profile.equipment.weapon.instanceId,'fixture-new');assert.equal(state.profile.inventory[1].instanceId,'fixture-old');
 assert.equal(prep.status().ok,true,'late success must clear dirty/error state');assert.equal(state.transactions,1);
});


test('genuinely missing online profile stays blocked and retry never creates a replacement account',async()=>{
 const{state,prep}=fixture({evictAfterOnce:true});state.profile=null;
 prep.player.equipWeaponFromInventory(1);await prep.tail;assert.equal(prep.status().reason,'profile_missing');
 assert.equal((await prep.flush()).ok,false);assert.equal(prep.status().reason,'profile_missing');
 assert.equal(state.profile,null);assert.equal(state.transportPayloads.length,0);assert.equal(prep.player.equipment.weapon.instanceId,'fixture-new');
});

test('camp pending journal commits after successful once read whose detached cache has been evicted',async()=>{
 const{state,prep,net}=fixture({evictAfterOnce:true});
 assert.equal((await net.getPlayerProfile(uid,{throwOnError:true})).level,19);
 assert.equal(state.cachedNull,true,'once listener is detached and does not retain profile cache');
 net._storeLocalProfilePatchJournal(uid,{manastone:12600,skillLevels:{...state.profile.skillLevels,laser:4}},{checkpointPolicy:'durable'});
 assert.equal(prep.dirty.size,0);
 assert.equal((await prep.flush()).ok,true,'journal transaction must retain a value listener while guarded updater runs');
 assert.equal(state.profile.manastone,12600);assert.equal(state.profile.skillLevels.laser,4);
 assert.equal(net.getLocalProfilePatchJournal(uid),null);assert.equal(state.listeners.size,0,'temporary listener must be released');
 assert.equal(state.subscriptions,state.unsubscriptions);
});

test('clean camp with no pending journal performs no transaction after once cache eviction',async()=>{
 const{state,prep,net}=fixture({evictAfterOnce:true});await net.getPlayerProfile(uid,{throwOnError:true});
 assert.equal((await prep.flush()).ok,true);assert.equal(state.transactions,0);assert.equal(state.listeners.size,0);
});

test('v129 transaction behavior reproduces permanent profile_missing despite repeated successful once reads',async()=>{
 const{state,prep,net}=fixture({evictAfterOnce:true});
 // Isolate the old implementation's one changed boundary; all save, journal,
 // conflict guards and CampPreparation retry code are the actual runtime.
 net._runPreparedProfilePatchTransaction=(profileRef,update)=>profileRef.transaction(update);
 assert.equal((await net.getPlayerProfile(uid,{throwOnError:true})).level,19);
 net._storeLocalProfilePatchJournal(uid,{manastone:12600},{checkpointPolicy:'durable'});
 for(let attempt=0;attempt<3;attempt++) {
  // v129 retried a one-shot read before the journal transaction. Its listener
  // was already detached by the time flush ran, so the cache was cold again.
  assert.equal((await net.getPlayerProfile(uid,{throwOnError:true})).level,19);
  assert.equal((await prep.flush()).reason,'profile_missing');
  assert.equal(state.profile.manastone,12900);
 }
 assert.ok(state.reads>=3,'successful reads cannot retain the detached cache');
 assert.equal(state.transportPayloads.length,0);assert.ok(net.getLocalProfilePatchJournal(uid));
});

test('profile listener timeout preserves pending changes and releases the exact subscription',async()=>{
 const{state,prep,net}=fixture({evictAfterOnce:true});state.suppressValueEvent=true;net.profileTransactionReadTimeoutMs=10;
 prep.player.equipWeaponFromInventory(1);await prep.tail;
 assert.equal(prep.status().code,'profile_read_timeout');assert.equal(state.transactions,0);assert.equal(state.listeners.size,0);
 assert.equal(state.subscriptions,state.unsubscriptions);assert.ok(net.getLocalProfilePatchJournal(uid));
 state.suppressValueEvent=false;assert.equal((await prep.flush()).ok,true);
 assert.equal(state.profile.equipment.weapon.instanceId,'fixture-new');assert.equal(state.transactions,1);assert.equal(state.listeners.size,0);
});
