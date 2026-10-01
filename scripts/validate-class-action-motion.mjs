import test from 'node:test';
import assert from 'node:assert/strict';
import {actionRow,createActionMotion,sampleActionMotion,drawActionBody} from '../src/js/combat/ClassActionMotion.js';
import RemoteClassVisuals from '../src/js/combat/ClassVisuals.js';
for(const classId of ['witch','warrior','archer'])test(`${classId} authored rows and release/recovery/held frames stay within4x4 atlas`,()=>{
 const skillRows={witch:[2,3,2],warrior:[2,3,2],archer:[2,3,1]}[classId];
 assert.equal(actionRow(classId,'basic',{}),0);assert.equal(actionRow(classId,'basic',{aimed:true}),1);
 skillRows.forEach((row,i)=>assert.equal(actionRow(classId,'skill',{slot:i+1}),row));
 for(const [kind,data]of[['basic',{}],['basic',{aimed:true}],...[1,2,3].map(slot=>['skill',{slot}])]){
  const m=createActionMotion(classId,kind,data,12,7);assert.equal(m.started,12);
  for(const [age,frame]of[[0,1],[m.duration/3+.0001,2],[m.duration*2/3+.0001,3]]){
   m.age=age;assert.equal(sampleActionMotion(m).frame,frame);const draws=[];
   assert.equal(drawActionBody({width:768,height:768},m,{drawImage:(...args)=>draws.push(args)},0,0,64,64),true);
   const [,x,y,w,h]=draws[0];assert.equal(x,frame*192);assert.equal(y,m.row*192);assert.ok(x>=0&&y>=0&&x+w<=768&&y+h<=768);
  }
  m.age=m.duration;assert.equal(sampleActionMotion(m),null);m.held=true;assert.equal(sampleActionMotion(m).frame,0);
 }
});
test('invalid motion cannot sample an outside atlas row or stale release',()=>{
 for(const row of [-1,4,NaN,1.5])assert.equal(sampleActionMotion({row,held:true}),null);
 assert.equal(sampleActionMotion({row:0,age:1,duration:.2}),null);
});
test('two real remote visual instances reject duplicates/reordering and expire without combat side effects',async()=>{
 const originalNow=Date.now,originalWindow=globalThis.window;let now=100000,field='field-A',damagePackets=0,hpWrites=0;
 const scene={zoneTransitionToken:1};
 const game={resources:{loadImage:async()=>({width:768,height:768})},net:{_getCurrentFieldId:()=>field,sendMonsterDamage(){damagePackets++;},sendPlayerDamage(){damagePackets++;}},sceneManager:{currentScene:scene},zone:{currentZone:{id:'zone1'}},monsterManager:{worldGeneration:1}};
 globalThis.window={game};Date.now=()=>now;
 try{
  const owners=[{x:0,y:0,hp:100},{x:20,y:0,hp:100}];for(const o of owners)o.takeDamage=()=>hpWrites++;
  const views=owners.map(owner=>new RemoteClassVisuals(owner));
  const packet={classId:'witch',fieldId:field,ts:now,epoch:1,sequence:1,motion:{id:1,row:0,age:0,duration:.36,held:false},effects:[{id:'e1',name:'life_circle',x:0,y:0,age:0,duration:.36}],projectiles:[{kind:'orb',x:0,y:0,direction:{x:1,y:0},speed:210}],badges:[]};
  for(const v of views){assert.equal(v.receive(packet),true);assert.equal(v.receive(packet),false);assert.equal(v.receive({...packet,sequence:0}),false);assert.equal(v.receive({...packet,epoch:0,sequence:99}),false);}
  await Promise.resolve();
  const draws=views.map(v=>{const calls=[];assert.equal(v.drawBody({drawImage:(...args)=>calls.push(args)},0,0,64,64),true);return calls;});assert.deepEqual(draws[0][0].slice(1),draws[1][0].slice(1));assert.equal(draws[0][0][1],192,'release starts at contact frame1');
  now+=370;for(const v of views){v.advance();assert.equal(v.motion,null);assert.equal(v.effects.length,0);}
  now+=50;for(const v of views){v.advance();assert.equal(v.projectiles.length,0);assert.equal(v.receive({...packet,ts:now-13000,sequence:2}),false);assert.equal(v.receive({...packet,ts:now+1001,sequence:2}),false);}
  const held={...packet,ts:now,sequence:2,motion:{id:2,row:1,age:0,duration:.4,held:true}};
  for(const v of views){assert.equal(v.receive(held),true);assert.equal(sampleActionMotion(v.motion).frame,0);}
  now+=301;views.forEach(v=>{v.advance();assert.equal(v.motion,null);});
  views.forEach(v=>assert.equal(v.receive({...packet,ts:now,sequence:3}),true));field='field-B';views.forEach(v=>{v.advance();assert.equal(v.motion,null);assert.equal(v.effects.length,0);assert.equal(v.projectiles.length,0);assert.equal(v.receive({...packet,ts:now,sequence:4}),false);});
  for(let i=0;i<views.length;i++){owners[i].isDead=true;assert.equal(views[i].receive({...packet,fieldId:field,ts:now,epoch:2,sequence:1}),true);assert.equal(views[i].motion,null);assert.equal(views[i].effects.length,0);}
  assert.equal(damagePackets,0);assert.equal(hpWrites,0);assert.deepEqual(owners.map(o=>o.hp),[100,100]);
 }finally{Date.now=originalNow;globalThis.window=originalWindow;}
});

for(const classId of ['witch','warrior','archer'])test(classId+' directional atlas maps each action to four independent authored rows',()=>{
 for(let row=0;row<4;row++)for(let direction=0;direction<4;direction++){const calls=[];drawActionBody({width:1024,height:4096},{row,direction,age:0,duration:.36},{drawImage:(...v)=>calls.push(v)},0,0,120,120);assert.equal(calls[0][1],256);assert.equal(calls[0][2],(row*4+direction)*256);assert.equal(calls[0][4],256);}
});
