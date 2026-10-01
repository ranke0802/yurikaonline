import test from 'node:test';import assert from 'node:assert/strict';
import RemoteClassVisuals,{drawClassEffect,renderGroundEffects,renderForegroundEffects} from '../src/js/combat/ClassVisuals.js';
function renderer(classId='witch') {const calls=[];return {classId,owner:{x:10,y:20,width:48,height:64},effects:[],projectiles:[],images:{effects:{width:1024,height:1024},lifeCircle:{width:1024,height:256},potion:{width:1024,height:256}},calls,drawEffect(...args){this.calls.push(args);}};}
test('moving arrows/orbs have one image each and split behind/in front of body center',()=>{
 const r=renderer('archer');r.effects=[{name:'archer_shot',x:34,y:52,target:{x:100,y:52},duration:.4,age:0},{name:'drain_orb',x:34,y:52,duration:.4,age:0}];r.projectiles=[{kind:'arrow',x:50,y:20,direction:{x:0,y:-1}},{kind:'orb',x:50,y:60,direction:{x:0,y:1}}];
 renderGroundEffects(r,{});assert.deepEqual(r.calls.map(c=>c[1]),['arrow']);r.calls=[];renderForegroundEffects(r,{});assert.deepEqual(r.calls.map(c=>c[1]),['orb']);
});
test('radial effects do not rotate and Blood Pact follows current combat center',()=>{
 const r=renderer('warrior');r.effects=[{name:'blood_pact',x:0,y:0,duration:8,age:2,target:{x:999,y:999}},{name:'challenge',x:34,y:52,duration:.5,age:0,target:{x:-5,y:-5}}];renderGroundEffects(r,{});assert.deepEqual(r.calls[0].slice(2,5),[34,52,110]);assert.equal(r.calls[0][6].angle,0);
 r.owner.x=110;r.calls=[];renderGroundEffects(r,{});assert.equal(r.calls[0][2],134);renderForegroundEffects(r,{});assert.equal(r.calls.at(-1)[6].angle,0);
});
test('slash pivots in front; charge spans exact start-stop distance; snipe launch event has no stationary image',()=>{
 const r=renderer('warrior');r.effects=[{name:'warrior_slash',x:34,y:52,target:{x:134,y:52},age:0},{name:'punishing_charge',x:34,y:52,target:{x:34,y:-48},age:0},{name:'piercing_snipe',x:34,y:52,target:{x:234,y:52},age:0}];renderForegroundEffects(r,{});
 assert.equal(r.calls[0][6].pivotX,.15);assert.equal(r.calls[0][6].width,100);assert.equal(r.calls[1][6].pivotX,0);assert.equal(r.calls[1][6].width,100);assert.equal(r.calls[1][6].angle,-Math.PI/2);assert.equal(r.calls.length,2);
 const draws=[],ctx={drawImage:(...a)=>draws.push(a)};drawClassEffect(r,ctx,'warrior_slash',34,52,100,0,{pivotX:.15,width:100,height:104});assert.deepEqual(draws[0].slice(5),[19,0,100,104]);
});
test('potion follows hand-target arc and reaches target at landing; crops all four cells',()=>{
 const r=renderer();const f={name:'poison_potion',x:34,y:52,target:{x:234,y:52},duration:.45,age:0};r.effects=[f];
 renderForegroundEffects(r,{});assert.deepEqual(r.calls[0].slice(2,4),[34,52]);f.age=.225;r.calls=[];renderGroundEffects(r,{});assert.deepEqual(r.calls[0].slice(2,4),[134,28]);f.age=.45;r.calls=[];renderForegroundEffects(r,{});assert.ok(Math.abs(r.calls[0][2]-234)<1e-8);assert.ok(Math.abs(r.calls[0][3]-52)<1e-8);
 const frames=[];for(const age of [0,.12,.24,.36])drawClassEffect(r,{drawImage:(_img,x,y,w,h)=>{frames.push(x/w);assert.equal(y,0);assert.equal(h,256);}},'poison_potion',0,0,34,age);assert.deepEqual(frames,[0,1,2,3]);
 delete r.images.potion;let draws=0;drawClassEffect(r,{drawImage:()=>draws++},'poison_potion',0,0,34,0);assert.equal(draws,0,'missing generated art cannot silently use a placeholder');
});
test('remote motion direction is validated; omitted direction inherits owner; packet order guard remains',async()=>{
 const prev=globalThis.window;globalThis.window={game:{net:{_getCurrentFieldId:()=> 'f'},resources:{loadImage:async()=>({width:768,height:768})},sceneManager:{currentScene:{}}}};
 try{const v=new RemoteClassVisuals({hp:100,direction:2}),base={classId:'witch',fieldId:'f',ts:Date.now(),epoch:1,sequence:1,motion:{id:1,row:0,held:true,age:0,duration:.4,direction:3}};
 assert.equal(v.receive(base),true);assert.equal(v.motion.direction,3);assert.equal(v.receive(base),false);
 assert.equal(v.receive({...base,sequence:2,motion:{...base.motion,direction:undefined}}),true);assert.equal(v.motion.direction,2);
 for(const direction of [-1,4,1.1,NaN]){base.sequence++;v.receive({...base,sequence:base.sequence+2,motion:{...base.motion,direction}});assert.equal(v.motion,null);}
 }finally{globalThis.window=prev;}
});
test('directional body atlas preserves logical row and authored direction without mirroring',async()=>{
 const {drawActionBody}=await import('../src/js/combat/ClassActionMotion.js');
 for(let row=0;row<4;row++)for(let direction=0;direction<4;direction++){
  const calls=[],ctx={drawImage:(...a)=>calls.push(a)};
  assert.equal(drawActionBody({width:1024,height:4096},{row,direction,age:0,duration:.4},ctx,0,0,120,120),true);
  const [,x,y,w,h]=calls[0];assert.equal(x,256);assert.equal(y,(row*4+direction)*256);assert.equal(w,256);assert.equal(h,256);assert.ok(y+h<=4096);
 }
});

test('downward shot is foreground from its first palm frame; return keeps relative depth',()=>{
 const r=renderer('archer');r.projectiles=[{kind:'arrow',x:34,y:44,direction:{x:0,y:1}},{kind:'return',x:34,y:44,direction:{x:0,y:1}}];renderGroundEffects(r,{});assert.deepEqual(r.calls.map(c=>c[1]),['return']);r.calls=[];renderForegroundEffects(r,{});assert.deepEqual(r.calls.map(c=>c[1]),['arrow']);
});
