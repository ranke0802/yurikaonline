import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutMonsterHud,monsterHudBody} from '../src/js/ui/MonsterHudLayout.js';
const ctx={save(){},restore(){},measureText:s=>({width:s.length*13})};
const monster=(id,x=200,y=200)=>({id,x,y,width:80,height:80,renderWidth:80,renderHeight:80,name:'슬라임',hp:100,maxHp:100,deathTimer:0,deathDuration:1,classStatuses:{},statusEffects:[],hasEffect(type){return this.statusEffects.some(s=>s.type===type)}});
const rect=b=>({left:b.x,top:b.y,right:b.x+20,bottom:b.y+20});
const overlaps=(a,b)=>Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);
test('mixed legacy/class states retain every icon, stack and stun label in foot rows',()=>{
 const m=monster('a');m.statusEffects=[{type:'burn'},{type:'shield'}];m.electrocutedTimer=2;m.classStatuses={poison:{remaining:3,stacks:5},stun:{remaining:1},mark:{remaining:2},root:{remaining:2},rage:{remaining:2}};
 const before=JSON.stringify(m),hud=layoutMonsterHud(ctx,[m]).get(m),all=[...hud.legacy,...hud.statuses];
 assert.deepEqual(all.map(b=>b.type),['burn','elec','shield','poison','stun','mark','root','rage']);assert.equal(hud.statuses[0].count,5);
 assert.ok(all.every(b=>b.y>=m.y+m.height/2+15));
 for(let i=0;i<all.length;i++)for(const b of all.slice(i+1))assert.equal(overlaps(rect(all[i]),rect(b)),false);
 assert.equal(JSON.stringify(m),before);
});
test('crowd offsets stay bounded and deterministic with selected target first',()=>{
 const ms=Array.from({length:24},(_,i)=>monster(String(i),200+(i%6)*12,200+Math.floor(i/6)*10));
 const run=()=>layoutMonsterHud(ctx,ms,{selected:ms[11],viewport:{left:0,top:0,right:390,bottom:844}});
 const a=run(),b=run();assert.deepEqual([...a],[...b]);assert.equal([...a.keys()][0],ms[11]);
 for(const m of ms){const h=a.get(m);assert.ok(Math.abs(h.nameX-m.x)<=24);assert.ok(Math.abs(h.hpX+30-m.x)<=24);assert.ok(h.nameY<=m.y-45&&h.nameY>=m.y-69);assert.ok(h.hpY>=m.y+45&&h.hpY<=m.y+69);}
});
test('grounded atlas bounds respect authored top/bottom and scale',()=>{
 const m={...monster('boss'),usesV2Atlas:true,alignSpriteContentToGround:true,renderOffY:7,renderWidth:384,renderHeight:416,atlasFrameHeight:208,spriteSheetDefinition:{frameWidth:192},spriteContentBounds:{left:36,top:5,right:155,bottom:203}};
 const b=monsterHudBody(m);assert.equal(b.bottom,247);assert.equal(b.top,-149);assert.equal(b.left,80);assert.equal(b.right,318);
 const h=layoutMonsterHud(ctx,[m]).get(m);assert.ok(h.nameY<b.top);assert.ok(h.hpY>=b.bottom+5);
});
test('edge placement uses only nearby candidates; no camera or entity mutation',()=>{
 for(const viewport of [{left:0,top:0,right:390,bottom:844},{left:0,top:0,right:844,bottom:390}])for(const [x,y]of [[12,100],[viewport.right-12,100],[150,20],[150,viewport.bottom-30]]){
  const m=monster('edge',x,y),before=JSON.stringify({m,viewport});const h=layoutMonsterHud(ctx,[m],{viewport}).get(m);
  assert.ok(Math.abs(h.nameX-x)<=24&&Math.abs(h.hpX+30-x)<=24);assert.ok(h.hpY>y+40);assert.equal(JSON.stringify({m,viewport}),before);
 }
});
test('death, target replacement, removal and map change retain no layout state',()=>{
 const a=monster('reused'),b=monster('reused');a.classStatuses.poison={remaining:2,stacks:4};a.isDead=true;
 let h=layoutMonsterHud(ctx,[a],{selected:a});assert.equal(h.get(a).statuses.length,0);
 h=layoutMonsterHud(ctx,[b],{selected:b});assert.equal(h.has(a),false);assert.equal(h.get(b).statuses.length,0);
 assert.equal(layoutMonsterHud(ctx,[]).size,0);b.deathTimer=1;assert.equal(layoutMonsterHud(ctx,[b]).size,0);
});
test('protected body obstacle moves nearby labels without moving the owner',()=>{
 const m=monster('one');const base=layoutMonsterHud(ctx,[m]).get(m);const bodies=[{left:175,right:225,top:145,bottom:160}];
 const h=layoutMonsterHud(ctx,[m],{bodies}).get(m);assert.notEqual(h.nameY,base.nameY);assert.equal(m.x,200);assert.equal(m.y,200);
});
