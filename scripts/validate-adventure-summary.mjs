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
