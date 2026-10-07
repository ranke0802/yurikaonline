import test from 'node:test';
import assert from 'node:assert/strict';
import ResourceManager from '../src/js/core/ResourceManager.js';
import LocalNetworkManager,{LOCAL_PROFILE_KEY} from '../src/js/local/LocalNetworkManager.js';
import CampScene from '../src/js/world/scenes/CampScene.js';
import {readFileSync} from 'node:fs';

test('Witch preparation requires decoded Life Orb pixels and all frame pivots before entering the field',async()=>{
 const resources=new ResourceManager(),metadata=JSON.parse(readFileSync(new URL('../assets/resource/effects/life-orb-v177.json',import.meta.url)));
 let missing=true;
 resources.loadImage=async path=>{if(path.endsWith('/life-orb-v177.webp')){if(missing)throw Error('missing approved atlas');return{width:1024,height:1536};}return{path};};
 resources.loadJSON=async()=>metadata;
 await assert.rejects(resources.preparePlayableClassAssets('witch'),/missing approved atlas/);
 assert.equal(resources.cache.has('playable-class:witch'),false);assert.equal(resources.loading.size,0);
 missing=false;const bundle=await resources.preparePlayableClassAssets('witch');
 assert.equal(bundle.lifeOrb.width,1024);assert.equal(bundle.lifeOrbMetadata.frames.length,24);
 assert.ok(bundle.authored&&bundle.effects&&bundle.sheet);assert.equal(await resources.preparePlayableClassAssets('witch'),bundle);
});

test('selected class shares preparation, excludes Mage assets, evicts failed bundle and retries',async()=>{
 const resources=new ResourceManager(),paths=[];let release;
 const gate=new Promise(r=>release=r);let fail=true;
 resources.loadImage=async path=>{paths.push(path);await gate;if(fail&&path.includes('-body'))throw Error('decode');return {path}};
 resources.loadCharacterSpriteSheet=()=>{throw Error('unselected Mage')};
 const first=resources.preparePlayableClassAssets('warrior');
 assert.equal(first,resources.preparePlayableClassAssets('warrior'));
 release();await assert.rejects(first,/decode/);assert.equal(resources.loading.size,0);
 fail=false;const bundle=await resources.preparePlayableClassAssets('warrior');
 assert.ok(bundle.sheet&&bundle.authored&&bundle.effects&&bundle.status);
 assert.ok(paths.every(p=>p.includes('warrior')||p.endsWith('/status.webp')));
 const count=paths.length;assert.equal(await resources.preparePlayableClassAssets('warrior'),bundle);assert.equal(paths.length,count);
});

test('explicit local conflict recovery reads without rewriting receipts and can save again',async()=>{
 globalThis.window={game:null};const values=new Map();let writes=0,broken=false;
 const storage={getItem:k=>{if(broken)throw Error('read failed');return values.get(k)??null},setItem:(k,v)=>{writes++;values.set(k,v)}};
 const first=new LocalNetworkManager(storage);await first.createLocalProfile();
 const second=new LocalNetworkManager(storage);await second.getPlayerProfile('local-player');
 assert.equal((await second.reloadLocalProfileAfterConflict()).ok,false);
 await first.savePlayerDataPatch('local-player',{exp:73,claimedRewardIds:['receipt-1'],inventory:[{id:'kept'}]});
 assert.equal((await second.savePlayerDataPatch('local-player',{exp:999})).ok,false);
 const pending=structuredClone(second._pendingLocalProfilePatch),durable=values.get(LOCAL_PROFILE_KEY),count=writes;
 broken=true;assert.equal((await second.reloadLocalProfileAfterConflict()).ok,false);assert.deepEqual(second._pendingLocalProfilePatch,pending);broken=false;
 const latest=await second.reloadLocalProfileAfterConflict();assert.equal(latest.profile.exp,73);assert.deepEqual(latest.profile.claimedRewardIds,['receipt-1']);
 assert.equal(values.get(LOCAL_PROFILE_KEY),durable);assert.equal(writes,count);assert.equal(second.getLocalSaveStatus().ok,true);
 assert.equal((await second.savePlayerDataPatch('local-player',{exp:74})).ok,true);assert.equal((await first.getPlayerProfile('local-player')).exp,74);
});

function campFixture(){
 let release;const gate=new Promise(r=>release=r),writes=[],installed=[];
 const scene=new CampScene({net:{savePlayerDataPatch:async(uid,patch)=>{writes.push(patch.activeClassId);if(writes.length===1)await gate;return{ok:true,profile:{activeClassId:patch.activeClassId}}}}});
 Object.assign(scene,{root:{},generation:1,loadToken:1,user:{uid:'local-player'},preparation:{player:{activeClassId:'wizard'},flush:async()=>({ok:true})},renderUI(){},closePreparationPopups(){},async prepareProfile(snapshot){installed.push(snapshot.profile.activeClassId);this.preparation.player.activeClassId=snapshot.profile.activeClassId}});
 return{scene,writes,installed,release};
}
test('rapid selection serializes writes and only installs last selected class',async()=>{
 const{scene,writes,installed,release}=campFixture();const operation=scene.selectClass('warrior');await Promise.resolve();await Promise.resolve();
 scene.selectClass('archer');scene.selectClass('wizard');release();await operation;
 assert.deepEqual(writes,['warrior','wizard']);assert.deepEqual(installed,['wizard']);assert.equal(scene.busy,false);
});
test('failed dirty flush prevents class selection and clears busy state',async()=>{
 const{scene,writes}=campFixture();scene.preparation.flush=async()=>({ok:false});await scene.selectClass('archer');assert.deepEqual(writes,[]);assert.equal(scene.busy,false);assert.match(scene.message,/바꾸지 않았/);
});
