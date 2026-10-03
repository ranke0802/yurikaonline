import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import ItemDataManager from '../src/js/core/ItemDataManager.js';
import Player from '../src/js/entities/Player.js';
import MonsterManager from '../src/js/world/MonsterManager.js';
import NetworkManager from '../src/js/core/NetworkManager.js';
import Controller from '../src/js/combat/ClassCombatController.js';
import {CLASS_WEAPONS_ENABLED,WEAPON_CLASSES,WEAPON_THEMES,classWeaponId,classWeaponDetailLines,classWeaponBonuses} from '../src/js/core/ClassWeapons.js';
import {DURABLE_BOSS_REWARD_ARCHIVED_CATALOGS as archives,resolveDurableBossEntitlementPolicy} from '../src/js/core/DurableBossRewardPolicy.js';
import {projectClassProfile,attachClassProfile,buildClassProfilePatch} from '../src/js/core/ClassProfiles.js';
const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path.replace(/^\//,''),import.meta.url)));
async function data(enabled){const d=new ItemDataManager({loadJSON:async path=>read(path)},{classWeaponsEnabled:enabled});await d.loadAll();assert.ok(d.loadedCatalog);return d;}
const live=await data(true),off=await data(false);
function player(classId,item,d=live){const p=Object.create(Player.prototype);Object.assign(p,{classId,equipment:{weapon:item},getItemDataManager:()=>d,x:0,y:0,hp:500,maxHp:1000,attackPower:100,attackSpeed:1,critRate:0,mpRegen:0,skillLevels:{}});return p;}
const numeric=p=>{const v=p.getWeaponCombatProfile();return Object.fromEntries(Object.entries(v).filter(([,v])=>typeof v==='number'));};
const stats=p=>{p.applyEquipmentStats();return [p.attackPower,p.critRate,p.mpRegen,p.attackSpeed];};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const baseAttack={magic:7,tidal:9,storm:11,astral:13,riftcore:15};
let parityCases=0;
for(const theme of WEAPON_THEMES)for(const tier of ['', 'blessed_'])for(const classId of WEAPON_CLASSES){
 const mageId=`${tier}${theme}_staff`,id=classWeaponId(mageId,classId);
 test(`${id}: every affix at +0..+10 matches Mage stats, enhancement, rolls, hooks and save roundtrip`,()=>{
  const source=live.getItemDefinition(mageId),def=live.getItemDefinition(id);
  assert.deepEqual(def.baseStats,source.baseStats);assert.equal(def.weaponType,classId==='witch'?'spellbook':classId==='warrior'?'sword':'bow');
  assert.deepEqual(def.allowedClasses,[classId]);assert.equal(def.icon.path,`assets/resource/classes/weapons/${theme}_${classId}.webp`);
  if(classId==='witch'){assert.match(def.name,/마법서/);assert.doesNotMatch(JSON.stringify([def.name,def.description]),/지팡이|완드/);}
  const pool=live.getAffixPool(source.prefixPool);
  for(const a of pool.affixes)for(let level=0;level<=10;level++){
   const rolls=Object.fromEntries(Object.entries(a.rolledEffects).map(([k,v])=>[k,(v.min+v.max)/2]));
   const seed={instanceId:'parity',prefixId:a.id,rolledValues:rolls,enhancementLevel:level};
   const mage=live.createRewardItem(mageId,seed),item=live.createRewardItem(id,{...seed,prefixId:a.id+'_'+classId});
   const pm=player('wizard',mage),pc=player(classId,item);
   assert.deepEqual(numeric(pc),numeric(pm));assert.deepEqual(stats(pc),stats(pm));
   near(pc.attackPower,100+(tier?20:baseAttack[theme])+level);
   assert.deepEqual(live.getEffectiveEnhancementRuleSet(item),live.getEffectiveEnhancementRuleSet(mage));
   assert.deepEqual(live.getEnhancementConfig(item),live.getEnhancementConfig(mage));
   assert.deepEqual(live.normalizeInventoryItem(JSON.parse(JSON.stringify(item))),item);
   for(const id2 of ['wizard',...WEAPON_CLASSES])assert.equal(player(id2,item).canEquipWeapon({...item,allowedClasses:[id2]}),id2===classId);
   if(classId==='warrior'){const text=classWeaponDetailLines(pc,item).join(' ');assert.doesNotMatch(text,/응징|도발|마나 소모/);if(rolls.missileDamageBonus||rolls.fireballChainChance)assert.match(text,/방패 돌진/);if(rolls.missileManaCostReduction)assert.match(text,/재사용 대기시간/);}
   assert.ok(classWeaponDetailLines(pc,item).length>0);assert.doesNotMatch(classWeaponDetailLines(pc,item).join(' '),/매직 미사일|파이어볼|체인 라이트닝|지팡이/);
   parityCases++;
  }
 });
}
test('release gate has no new definitions, asset requests, equip route or bonuses; old staves survive',()=>{
 assert.equal(CLASS_WEAPONS_ENABLED,true);assert.equal(off.loadedCatalog.schemaVersion,2);assert.equal(live.loadedCatalog.schemaVersion,3);
 for(const c of WEAPON_CLASSES)for(const t of WEAPON_THEMES)assert.equal(off.getItemDefinition(`${t}_${c}`),null);
 const old=off.createRewardItem('magic_staff',{prefixId:'starlight',instanceId:'old'});
 assert.equal(player('wizard',old,off).canEquipWeapon(old),true);assert.equal(player('witch',old,off).canEquipWeapon(old),true);
 assert.equal(player('warrior',old,off).canEquipWeapon(old),false);
 const item=live.createRewardItem('magic_witch',{prefixId:'starlight_witch'}),p=player('witch',item,off);
 assert.equal(p.canEquipWeapon(item),false);assert.equal(classWeaponBonuses(p),null);
 for(const id of off.itemDefinitions.keys())assert.deepEqual(live.getItemDefinition(id),off.getItemDefinition(id));
});
function manager(d=live){const m=Object.create(MonsterManager.prototype);m.net={playerId:'host',_getCurrentFieldId:()=> 'zone_1',remotePlayers:new Map()};m.shouldSuppressWorldFeedback=()=>false;m.game={itemData:d,localPlayer:{id:'host',classId:'wizard'},remotePlayers:new Map()};return m;}
test('recipient class, not host class: normal/blessed rewards keep exact deterministic Mage rolls across all maps',()=>{
 for(const t of WEAPON_THEMES)for(const tier of ['', 'blessed_'])for(const c of WEAPON_CLASSES){
  const m=manager(),baseline=manager(off),monster={id:'same-monster',typeId:'slime'},ctx={monster,rollSlot:'same-roll',recipientId:'remote'};
  m.game.remotePlayers.set('remote',{classId:c});const id=`${tier}${t}_staff`;
  const a=m._buildRewardItem(id,{},ctx),b=baseline._buildRewardItem(id,{},ctx);
  assert.equal(a.id,classWeaponId(id,c));assert.equal(a.instanceId,b.instanceId);assert.deepEqual(a.rolledValues,b.rolledValues);
  m.game.remotePlayers.get('remote').classId='wizard';assert.deepEqual(m._buildRewardItem(id,{},ctx),a,'retry must retain authored class');
 }
});
test('normal route freezes recipient separately from legacy random seed; missing presence defers',()=>{
 const m=manager(),monster={id:'normal',typeId:'slime'},ctx={monster,rollSlot:'normal_drop',targetRecipientId:'remote'};
 assert.equal(m._buildRewardItem('magic_staff',{},ctx),null);
 m.net.remotePlayers.set('remote',{activeClassId:'archer'});
 const a=m._buildRewardItem('magic_staff',{},ctx),b=manager(off)._buildRewardItem('magic_staff',{},ctx);
 assert.equal(a.id,'magic_archer');assert.deepEqual(a.rolledValues,b.rolledValues);assert.equal(a.instanceId,b.instanceId);
 m._getMonsterParticipantIds=()=>['missing'];m._authorMonsterReward=()=>assert.fail('must not author partial receipt');
 assert.equal(m._grantMonsterItemDrops({id:'unknown',typeId:'slime'},'missing'),false);
});
test('all normal and boss drop probabilities remain canonical; real grant routes convert only weapons',()=>{
 for(const id of ['slime','slime_split','squirtle','emolga','gastly','ember_drake','spark_squirrel'])assert.deepEqual(live.getNormalDrops(id),off.getNormalDrops(id));
 const bossIds=Object.keys(archives[3].bosses);
 for(const id of bossIds){assert.deepEqual(live.getBossDrops(id),off.getBossDrops(id));assert.deepEqual(live.getBossBonusDrops(id),off.getBossBonusDrops(id));}
 for(const isBoss of [false,true]){
  const m=manager(),sent=[];m.game.remotePlayers.set('remote',{classId:'witch'});m._getMonsterParticipantIds=()=>isBoss?['host','remote']:['remote'];
  m._getDeterministicMonsterUnit=()=>.00001;m._authorMonsterReward=(_monster,uid,payload)=>{sent.push({uid,payload});return true;};m._spawnGroundLootDrop=()=>true;
  assert.equal(m._grantMonsterItemDrops({id:'drop',typeId:isBoss?'king_slime':'slime',isBoss,drops:[],name:'test'},'remote'),true);
  const weapons=sent.flatMap(s=>(s.payload.items||[]).filter(i=>i.slot==='weapon').map(i=>({uid:s.uid,id:i.id})));
  assert.ok(weapons.some(i=>i.uid==='remote'&&i.id==='magic_witch'));assert.ok(weapons.some(i=>i.uid==='remote'&&i.id==='blessed_magic_witch'));
  if(isBoss)assert.ok(weapons.some(i=>i.uid==='host'&&i.id==='magic_staff'));
 }
});
test('v1/v2 archives remain byte-equivalent values; v3 accepts one counterpart and rejects four, cross-map and tampered rolls',async()=>{
 // Baseline e7c7b7a: protect the exact released archive values after future commits.
 const hashes={1:'69eb347a5346c807b96f24d3dbfff466b358f19660122a2ab2a3d7915d45d440',2:'d926e963a31065a064ada17f2cf5ef158b3a091a2412863165c971b27655cf08'};
 for(const version of [1,2])assert.equal(createHash('sha256').update(JSON.stringify(archives[version])).digest('hex'),hashes[version]);
 const net=Object.create(NetworkManager.prototype);
 for(const [boss,ids] of Object.entries(archives[3].bosses))for(const id of ids){
  const def=live.getItemDefinition(id),affix=live.getAffixPool(def.prefixPool).affixes[0];
  const item=live.createRewardItem(id,{prefixId:affix.id,instanceId:'receipt'}),seeds=net._serializeDurableBossItemSeeds([item]);
  const snapshots=net._serializeDurableBossItemSnapshots([item],seeds),data={catalogVersion:3,bossTypeId:boss};
  assert.equal(net._validateDurableBossRewardAgainstArchivedCatalog(data,seeds,snapshots).ok,true);
  const durable=net._materializeDurableBossItemFromArchive(data,seeds[0]);assert.ok(resolveDurableBossEntitlementPolicy(durable));
  assert.equal(live.normalizeInventoryItem(durable).type,id);
  assert.equal(net._validateDurableBossRewardAgainstArchivedCatalog(data,[...seeds,...seeds],[...snapshots,...snapshots]).ok,false);
  const corrupt=structuredClone(seeds);corrupt[0].rolledValues[Object.keys(corrupt[0].rolledValues)[0]]=100;
  assert.equal(net._validateDurableBossRewardAgainstArchivedCatalog(data,corrupt,snapshots).ok,false);
  assert.equal(net._validateDurableBossRewardAgainstArchivedCatalog({...data,bossTypeId:boss==='king_slime'?'rift_sentinel':'king_slime'},seeds,snapshots).ok,false);
  assert.ok(Object.isFrozen(archives[3].items[id].baseStats));
 }
});
test('class save/reentry preserves legacy Mage gear and class counterpart identities',()=>{
 const mage=off.createRewardItem('storm_staff',{prefixId:'storm_starlight',instanceId:'old-mage'}),account={activeClassId:'witch',level:27,equipment:{weapon:mage},inventory:[null],skillLevels:{laser:8}};
 const original=structuredClone(account),p=projectClassProfile(account);attachClassProfile(p,account);
 const def=live.getItemDefinition('riftcore_witch');
 const tome=live.createRewardItem('riftcore_witch',{prefixId:live.getAffixPool(def.prefixPool).affixes[0].id,instanceId:'tome'});
 const patch=buildClassProfilePatch(p,{equipment:{weapon:tome}}),net=Object.create(NetworkManager.prototype);
 const saved=JSON.parse(JSON.stringify(net._mergeProfileData(account,patch)));
 assert.deepEqual(saved.equipment,original.equipment);assert.deepEqual(saved.skillLevels,original.skillLevels);
 assert.equal(projectClassProfile(saved,'witch').equipment.weapon.instanceId,'tome');assert.equal(projectClassProfile(saved,'archer').equipment.weapon,null);
});
function combat(c,theme='astral',prefix=null){
 const id=`${theme}_${c}`,def=live.getItemDefinition(id),a=live.getAffixPool(def.prefixPool).affixes.find(a=>!prefix||a.id===prefix);
 const item=live.createRewardItem(id,{prefixId:a.id,enhancementLevel:10,rolledValues:Object.fromEntries(Object.entries(a.rolledEffects).map(([k,r])=>[k,r.max]))});
 const p=player(c,item),enemies=[],hits=[],effects=[];p.getEffectiveClassAttackPower=()=>100;p.getEffectiveClassAttackSpeed=()=>1;
 const controller=new Controller(p,c,{enemies:()=>enemies,damage(e,n,meta){hits.push({n,meta});e.hp-=n;return n;},move(e,x,y){e.x=x;e.y=y;return true;},effect:(name,d)=>effects.push({name,...d}),random:()=>0});
 const enemy=(x=40,y=0)=>{const e={id:enemies.length,x,y,radius:16,hp:100000,maxHp:100000};enemies.push(e);return e;};
 const tick=seconds=>{for(let t=0;t<seconds-.0001;t+=.1)controller.update(Math.min(.1,seconds-t));};
 return {p,item,controller,enemy,tick,hits,effects};
}
for(const c of WEAPON_CLASSES){
 test(`${c} basic damage/restore are applied only on accepted hits; launch snapshots survive equipment change`,()=>{
  const f=combat(c),e=f.enemy(),bonus=f.p.getWeaponCombatProfile(),power=100*(1+bonus.laserDamageBonus);
  if(c==='warrior'){f.controller.basic({x:100,y:0});assert.equal(f.hits[0].n,Math.ceil(power));}
  else {if(c==='witch')f.controller.orb({x:100,y:0});else f.controller.arrow({x:100,y:0});const projectile=f.controller.projectiles[0];f.p.equipment.weapon=null;f.controller.resolveProjectileHit(projectile,e);if(c==='witch')f.tick(3.01);assert.equal(f.hits.reduce((s,h)=>s+h.n,0),Math.ceil(power*(c==='archer'?.85:1)));}
  assert.equal(f.p.hp,500+bonus.restoreHpPerLaserHit+(c==='witch'?Math.ceil(power)*.5:0));
  const blocked=combat(c);blocked.enemy();blocked.controller.hooks.damage=()=>0;blocked.controller.basic({x:100,y:0});blocked.tick(1);assert.equal(blocked.p.hp,500);
 });
 test(`${c} damage skill receives exact multiplier and cooldown reduction; utility slot is unchanged`,()=>{
  const f=combat(c,'storm'),e=f.enemy(),w=classWeaponBonuses(f.p);assert.equal(f.controller.skill(w.slot,{x:40,y:0}),true);
  const cooldown={witch:9,warrior:10,archer:12}[c];near(f.controller.cooldowns[w.slot],cooldown*(1-w.missileManaCostReduction));
  if(c==='witch')f.tick(1.01);if(c==='archer')f.tick(.61);if(c==='warrior')f.tick(1.6);
  const base={witch:100+e.maxHp*.05,warrior:100,archer:55}[c];assert.equal(f.hits[0].n,Math.ceil(base*(1+w.missileDamageBonus)));
  const other=c==='archer'?1:3;assert.equal(f.controller.skill(other,{x:40,y:0}),true);near(f.controller.cooldowns[other]-f.controller.time,{witch:16,warrior:20,archer:7}[c]);
 });
 test(`${c} chain is 0.3s, at most 12, single cast trigger, no additional status stacks, stops on dispose`,()=>{
  const f=combat(c,'tidal'),e=f.enemy();e.hp=e.maxHp=1e9;const w=classWeaponBonuses(f.p);
  f.controller.skill(w.slot,{x:40,y:0});f.tick(5.01);
  const chains=f.hits.filter(h=>h.meta.weaponChain);assert.equal(chains.length,12);
  assert.ok(chains.every(h=>!h.meta.poison&&!h.meta.classPoisonPulse));
  assert.equal(f.hits.filter(h=>h.meta.classPoisonPulse).length,c==='witch'?5:0);
  const g=combat(c,'tidal');g.enemy();g.controller.skill(w.slot,{x:40,y:0});g.tick(c==='witch'?1.01:c==='archer'?.61:.01);g.controller.dispose();const before=g.hits.length;g.tick(5);assert.equal(g.hits.length,before);
 });
}
test('reports exhaustive numeric comparison count',()=>assert.equal(parityCases,462));
test('normal and blessed enhancement outcomes and rerolls use identical Mage paths',()=>{
 const originalRandom=Math.random;
 try{
  for(const c of WEAPON_CLASSES)for(const tier of ['', 'blessed_'])for(const level of [0,6,7,9,10])for(const stoneType of ['normal','blessed'])for(const roll of [0,.49,.99]){
   const outcomes=[];
   for(const id of [`${tier}magic_staff`,`${tier}magic_${c}`]){
    const def=live.getItemDefinition(id),a=live.getAffixPool(def.prefixPool).affixes[0];
    const item=live.createRewardItem(id,{prefixId:a.id,enhancementLevel:level,instanceId:'same'}),p=player(c,item);
    Object.assign(p,{resolveWeaponSelection:()=>({item,location:'equipment'}),getInventoryItemAmount:()=>99,consumeInventoryItem:()=>true,compactInventoryAfterMutation:()=>{},updateDerivedStats:()=>{},saveProfilePatch:()=>{},saveEquipment:()=>{},inventory:[null]});
    Math.random=()=>roll;
    const r=p.enhanceWeapon(null,{stoneType,deferUiRefresh:true});
    outcomes.push([r.ok,r.success,r.destroyed,r.nextLevel,r.gain,r.keptLevel,p.equipment.weapon?.enhancementLevel]);
   }
   assert.deepEqual(outcomes[0],outcomes[1]);
  }
  for(const c of WEAPON_CLASSES){
   const values=[];
   for(const id of ['magic_staff',`magic_${c}`]){
    const a=live.getAffixPool(live.getItemDefinition(id).prefixPool).affixes[0];
    const item=live.createRewardItem(id,{prefixId:a.id,enhancementLevel:7,rolledValues:Object.fromEntries(Object.entries(a.rolledEffects).map(([k,r])=>[k,r.min]))});
    Math.random=()=>.5;assert.equal(live.rerollEquipmentOptions(item).ok,true);assert.equal(item.enhancementLevel,7);values.push(item.rolledValues);
   }
   assert.deepEqual(values[0],values[1]);
  }
 }finally{Math.random=originalRandom;}
});
test('skill chains respect probability and first 0.3s deadline; pause does not bank time',()=>{
 const f=combat('warrior','tidal'),e=f.enemy();e.isBoss=true;f.controller.skill(1,{x:40,y:0});f.tick(.1);
 f.tick(.29);assert.equal(f.hits.filter(h=>h.meta.weaponChain).length,0);
 f.tick(.02);assert.equal(f.hits.filter(h=>h.meta.weaponChain).length,1);
 f.controller.hooks.paused=()=>true;f.tick(20);assert.equal(f.hits.filter(h=>h.meta.weaponChain).length,1);
 const blocked=combat('warrior','tidal');blocked.enemy().isBoss=true;blocked.controller.hooks.random=()=>1;
 blocked.controller.skill(1,{x:40,y:0});blocked.tick(10);assert.equal(blocked.hits.filter(h=>h.meta.weaponChain).length,0);
});
test('prepared Witch renderer keeps 120px cells, (60,112) foot pivot and 140ms timing without silhouette fitting',async()=>{
 const {drawAuthoredWitchRow:draw,WITCH_AUTHORED_FRAME:m}=await import('../src/js/combat/AuthoredCharacterFrames.js');
 assert.deepEqual(m,{width:120,height:120,pivotX:60,pivotY:112,frames:4,frameSeconds:.14,scale:1});
 const image={width:480,height:480},calls=[],ctx={drawImage:(...args)=>calls.push(args)};
 for(const row of [0,1,2,3])for(const [age,frame] of [[0,0],[.139,0],[.14,1],[.28,2],[.42,3],[.561,0]]){
  assert.equal(draw(image,ctx,{row,age,footX:200,footY:300}),true);
  assert.deepEqual(calls.at(-1),[image,frame*120,row*120,120,120,140,188,120,120]);
 }
 assert.equal(draw({width:1024,height:4096},ctx,{row:0,age:0,footX:0,footY:0}),false);
 assert.equal(draw(image,ctx,{age:0,footX:0,footY:0}),false);
});
test('full v3 receipt survives delayed claim, class/map/host change and live catalog removal',()=>{
 const previous=globalThis.window;
 try{
  const net=Object.create(NetworkManager.prototype);Object.assign(net,{playerId:'host',getServerNow:()=>2000000,_getCurrentFieldId:()=> 'zone_5'});
  globalThis.window={game:{itemData:live}};
  const def=live.getItemDefinition('riftcore_witch'),item=live.createRewardItem(def.id,{prefixId:live.getAffixPool(def.prefixPool).affixes[0].id,instanceId:'durable-tome'});
  const rewardId='monster_reward:zone_5:boss-instance:recipient:boss_items';
  const receipt=net._createDurableBossRewardEnvelope('recipient',{kind:'boss_items',bossReward:true,rewardId,bossTypeId:'rift_sentinel',bossInstanceId:'boss-instance',items:[item]});
  assert.ok(receipt);assert.equal(receipt.catalogVersion,3);
  net.playerId='recipient';net.currentHostId='new-host';globalThis.window.game={itemData:off,localPlayer:{classId:'warrior'},zone:{currentZone:{id:'zone_1'}}};
  const key=net._buildDurableRewardKey(rewardId);assert.equal(net._validateDurableBossRewardEnvelope(receipt,key,2015000).ok,true);
  const restored=net._materializeDurableBossItemFromArchive(receipt,receipt.itemSeeds[0]);
  assert.equal(restored.type,'riftcore_witch');assert.equal(restored.instanceId,'durable-tome');
  const without=structuredClone(receipt);delete without.itemSnapshots;delete without.itemSnapshotFingerprint;
  assert.equal(net._validateDurableBossRewardEnvelope(without,key,2015000).reason,'missing_item_snapshot');
 }finally{globalThis.window=previous;}
});
