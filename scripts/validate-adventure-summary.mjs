import test from 'node:test';
import assert from 'node:assert/strict';
import AdventureSummary from '../src/js/core/AdventureSummary.js';
const storage = () => { const values = new Map(); return { getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v) }; };
const before = { level: 1, exp: 99, manastone: 10, inventory: [null] };
const after = { level: 2, exp: 24, manastone: 37, inventory: [{type:'weapon'}, {type:'manastone',amount:37}] };
test('saved result survives refresh, replay does not award or mutate a profile',()=>{
 const db=storage();const j=new AdventureSummary(db);j.begin('local-player',true,before);
 const immutable=structuredClone(after);const result=j.finish('local-player',true,after);
 assert.equal(result.after.level,2);assert.equal(result.after.bagSlots,1);
 assert.deepEqual(new AdventureSummary(db).finish('local-player',true,after),result);
 assert.deepEqual(after,immutable);assert.equal(j.finish('other',true,after),null);assert.equal(j.finish('local-player',false,after),null);
});
test('spent currency is a net change; stale summary is hidden; failed departure preserves last result',()=>{
 const j=new AdventureSummary(storage());j.begin('a',false,after);const spent={...after,manastone:12};
 const r=j.finish('a',false,spent);assert.equal(r.after.manastone-r.before.manastone,-25);
 assert.equal(j.finish('a',false,{...spent,level:3}),null);
 j.begin('a',false,spent);j.cancel('a',false);assert.deepEqual(j.finish('a',false,spent),r);
});
test('blocked presentation storage never prevents game flow',()=>{
 const j=new AdventureSummary({getItem(){throw Error('blocked')},setItem(){throw Error('quota')}});
 assert.doesNotThrow(()=>j.begin('a',true,before));assert.equal(j.finish('a',true,after).after.level,2);
});
test('actual gain and spend remain distinct, EXP survives level rollover and reload',()=>{
 const db=storage();let j=new AdventureSummary(db);j.begin('a',false,before);
 j.record('a',false,{kind:'manastone',amount:300,eventId:'loot'});
 j.record('a',false,{kind:'manastone',amount:-273,eventId:'skill'});
 j.record('a',false,{kind:'exp',amount:75,eventId:'exp'});
 j=new AdventureSummary(db);
 j.record('a',false,{kind:'exp',amount:75,eventId:'exp'});
 // Duplicate departure must preserve both the baseline and ledger.
 j.begin('a',false,{...before,manastone:999});
 const r=j.finish('a',false,after);
 assert.deepEqual(r.totals,{manastoneGained:300,manastoneSpent:273,manastoneNet:27,expGained:75,levelsGained:1});
 assert.deepEqual(j.finish('a',false,after),r);
 j.record('a',false,{kind:'manastone',amount:200});
 assert.deepEqual(j.finish('a',false,after),r);
});
test('unobserved saved currency changes never become fabricated gross gains or spending',()=>{
 const j=new AdventureSummary(storage());j.begin('a',false,before);
 const r=j.finish('a',false,after);
 assert.equal(r.totals.manastoneGained,null);assert.equal(r.totals.manastoneSpent,null);
 assert.equal(r.totals.manastoneNet,27);
});
test('equipment movement is not loot; material use and growth are explicit snapshots',()=>{
 const weapon={type:'weapon',slot:'weapon'};
 const j=new AdventureSummary(storage());
 j.begin('a',true,{...before,inventory:[null,weapon,{type:'weapon_upgrade_stone',amount:3}],skillLevels:{fireball:1},intelligence:3});
 const r=j.finish('a',true,{...before,inventory:[null,{type:'weapon_upgrade_stone',amount:2}],equipment:{weapon},skillLevels:{fireball:2},intelligence:4});
 assert.equal(r.before.items.weapon,r.after.items.weapon);
 assert.equal(r.after.items.weapon_upgrade_stone-r.before.items.weapon_upgrade_stone,-1);
 assert.equal(r.after.skills.fireball-r.before.skills.fireball,1);
 assert.equal(r.after.stats.intelligence-r.before.stats.intelligence,1);
});
test('stale storage after quota exhaustion never replaces the active journal',()=>{
 const values=new Map();let blocked=false;
 const db={getItem:k=>values.get(k),setItem:(k,v)=>{if(blocked)throw Error('quota');values.set(k,v)}};
 const j=new AdventureSummary(db);j.begin('a',false,before);blocked=true;
 j.record('a',false,{kind:'manastone',amount:27});
 j.record('a',false,{kind:'exp',amount:75});
 const r=j.finish('a',false,after);assert.equal(r.totals.manastoneGained,27);
 assert.deepEqual(j.finish('a',false,after),r);
});
test('cancelled departure, invalid events and another account cannot change results',()=>{
 const j=new AdventureSummary(storage());j.begin('a',true,before);
 for(const amount of [NaN,Infinity,-5,0])j.record('a',true,{kind:'exp',amount});
 j.record('a',false,{kind:'manastone',amount:27});j.record('b',true,{kind:'exp',amount:999});
 assert.equal(j.finish('b',true,after),null);
 j.cancel('a',true);j.cancel('a',true);assert.equal(j.finish('a',true,after),null);
 j.begin('a',true,before);assert.equal(j.finish('a',true,before).totals.expGained,0);
});
test('rolled-back progression is not reported as saved EXP',()=>{
 const j=new AdventureSummary(storage());j.begin('a',false,before);
 j.record('a',false,{kind:'exp',amount:75,progress:after});
 const r=j.finish('a',false,before);
 assert.equal(r.totals.expGained,null);assert.equal(r.totals.levelsGained,0);
});
test('real Player reward retry records once and camp replay never awards again',async()=>{
 const {default:Player}=await import('../src/js/entities/Player.js');
 const j=new AdventureSummary(storage());
 globalThis.window={game:{adventureSummary:j,isLocalMode:true}};
 const p=new Player(0,0,'qa');p.id='local-player';
 window.game.localPlayer=p;
 p.manastone=10;p.level=1;p.exp=99;p.maxExp=100;
 j.begin(p.id,true,p);
 let saves=0;p.saveDurableRewardSnapshot=async()=>({ok:++saves>1});
 const reward={rewardId:'isolated-reward',normalRewardReceipt:true,exp:75,manastone:500};
 const failed=await p.receiveNormalRewardDurably(reward);
 assert.equal(failed.ok,false);
 const retried=await p.receiveNormalRewardDurably(reward);
 assert.equal(retried.ok,true);assert.equal(retried.alreadyClaimed,true);
 const r=j.finish(p.id,true,p);
 assert.equal(r.totals.manastoneGained,500);assert.equal(r.totals.expGained,75);
 assert.equal(r.totals.levelsGained,1);assert.equal(p.manastone,510);
 assert.deepEqual(j.finish(p.id,true,p),r);assert.equal(p.manastone,510);
 // Skill spending in camp has no pending expedition and cannot alter results.
 p.saveProfilePatch=()=>Promise.resolve({ok:true});p.skillLevels.fireball=1;
 p.increaseSkill('fireball');assert.equal(p.manastone,210);
 assert.equal(j.finish(p.id,true,p),null);
});
