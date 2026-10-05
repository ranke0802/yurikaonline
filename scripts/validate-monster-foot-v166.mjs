import test from 'node:test';import assert from 'node:assert/strict';
import {monsterFootRows,footCandidateOffsets} from '../src/js/ui/MonsterFootPlacement.js';
import {readMonsterHudSafeViewport,monsterHudSafeWorldViewport} from '../src/js/ui/MonsterHudSafeViewport.js';
const m={x:200,y:200,height:80},body={left:160,right:240,top:160,bottom:240};
const viewport=bottom=>({left:0,top:0,right:400,bottom});
test('interior footer is exactly the v165 geometry',()=>{assert.deepEqual(monsterFootRows(m,body,7,viewport(800)),{columns:4,offset:10,y:245,width:95,height:55,guarded:false});});
test('seven icons wrap into one full-size nearby row only when vertical space requires it',()=>{const g=monsterFootRows(m,body,7,viewport(282));assert.equal(g.columns,7);assert.equal(g.offset,10);assert.equal(g.width,170);assert.ok(g.y+g.height<=282);});
test('one-pixel spacing adjustment takes priority over widening a row',()=>{const g=monsterFootRows(m,body,7,viewport(302));assert.equal(g.columns,4);assert.equal(g.offset,9);assert.equal(g.y+g.height,302);});
test('mixed 13 statuses keep two rows at full size when four rows cannot fit',()=>{const g=monsterFootRows(m,body,13,viewport(305));assert.equal(g.columns,7);assert.equal(g.height,58);assert.ok(g.y+g.height<=305);});
test('physically insufficient height never moves footer above feet or claims it fits',()=>{const g=monsterFootRows(m,body,7,viewport(260));assert.equal(g.y,245);assert.ok(g.y+g.height>260);assert.equal(g.columns,7);assert.equal(g.offset,8);});
test('side corner chooses rows that remain within bounded ownership',()=>{const g=monsterFootRows({...m,x:35},{...body,left:-5,right:75},7,viewport(305));assert.equal(g.columns,4);const offsets=footCandidateOffsets(35,g.y,g.width,g.height,viewport(305));assert.ok(offsets.dx.includes(12.5));assert.ok(offsets.dx.every(n=>Math.abs(n)<=24));assert.ok(offsets.dy.every(n=>n>=0&&n<=24));});
test('fractional bottom clearance is an exact candidate, rather than 12px quantization',()=>{const o=footCandidateOffsets(200,245,95,58,viewport(310.5));assert.ok(o.dy.includes(7.5));});
test('safe CSS bounds convert through backing scale and camera without mutation',()=>{const canvas={width:1266,height:585},camera={x:120,y:340},safe={left:12/844,top:0,right:1-12/844,bottom:1-24/390};const before=JSON.stringify({canvas,camera,safe});const b=monsterHudSafeWorldViewport(canvas,camera,1.05,safe);assert.equal(b.left,120+12/.7+4);assert.ok(Math.abs(b.bottom-(340+366/.7-4))<1e-9);assert.equal(JSON.stringify({canvas,camera,safe}),before);});
test('safe reader resolves CSS padding and intersects visual viewport without changing canvas',()=>{
 const probe={style:{},remove(){this.removed=true}},canvas={width:800,height:600,getBoundingClientRect:()=>({left:20,top:10,right:420,bottom:310,width:400,height:300})};
 const view={document:{body:{append(p){assert.equal(p,probe)}},createElement:()=>probe},innerWidth:440,innerHeight:330,visualViewport:{offsetLeft:0,offsetTop:0,width:440,height:300},getComputedStyle:()=>({paddingLeft:'32px',paddingRight:'28px',paddingTop:'14px',paddingBottom:'24px'})};
 assert.deepEqual(readMonsterHudSafeViewport(canvas,view),{left:12/400,top:4/300,right:392/400,bottom:266/300});assert.equal(probe.removed,true);assert.equal(canvas.width,800);assert.equal(canvas.height,600);
});
test('bottom menu is a local exclusion, without reserving the whole screen width',()=>{
 const v={...viewport(800),occlusions:[{left:50,right:350,top:302,bottom:340}]};
 const g=monsterFootRows(m,body,7,v);assert.equal(g.columns,4);assert.equal(g.offset,9);assert.equal(g.y+g.height,302);
 const side=monsterFootRows({...m,x:420},{...body,left:380,right:460},1,{...v,right:600});assert.equal(side.guarded,false);
});
test('menu exclusion stays in CSS coordinates through zoom and camera offsets',()=>{
 const b=monsterHudSafeWorldViewport({width:800,height:600},{x:100,y:200},2,{left:0,top:0,right:1,bottom:1,occlusions:[{left:.2,top:.8,right:.8,bottom:.95}]});
 assert.deepEqual(b.occlusions,[{left:176,top:436,right:424,bottom:489}]);
});
