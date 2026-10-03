import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {CLASS_EFFECT_BOUNDS,effectEnvelope} from '../src/js/combat/ClassEffectBounds.js';
import Remote,{drawClassEffect,renderGroundEffects,renderForegroundEffects} from '../src/js/combat/ClassVisuals.js';
import {basicAttackProfile} from '../src/js/combat/BasicAttackProgression.js';
import {preloadPlayerSkillVfx,drawSkillProjectile,drawSkillImpact} from '../src/js/effects/PlayerSkillVfxRenderer.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
for(const [key,rows] of Object.entries(CLASS_EFFECT_BOUNDS))test(`${key}: measured raster union matches fixed geometry without changing source art`,async()=>{
 const file={lifeCircle:'life-circle',potion:'poison-potion'}[key]||`${key}-effects`,cell=key==='potion'?128:192;
 const {data,info}=await sharp(`assets/resource/classes/approved/${file}.webp`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(let row=0;row<rows.length;row++){
  let left=cell,top=cell,right=-1,bottom=-1;
  for(let y=0;y<cell;y++)for(let x=0;x<cell;x++)for(let f=0;f<4;f++)if(data[((row*cell+y)*info.width+f*cell+x)*4+3]>16){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  assert.deepEqual([left,top,right-left+1,bottom-top+1],rows[row]);
  const box=effectEnvelope(key,row,cell,cell,200,100,.15);if(key==='lifeCircle'){near(box.x+96.5*box.width/cell,0);near(box.y+146*box.height/cell,0);near(box.width,box.height);}else{near(box.x+left*box.width/cell,-30);near(box.y+top*box.height/cell,-50);near(rows[row][3]*box.height/cell,100);}near(rows[row][2]*box.width/cell,200);
 }
});
function renderer(id){const calls=[];const r={classId:id,owner:{x:0,y:0,width:48,height:48,hp:100},images:{effects:{width:768,height:768},lifeCircle:{width:768,height:192}},effects:[],projectiles:[],calls,drawEffect(...args){this.calls.push(args)}};return r;}
for(const level of [1,8])test(`Lv${level}: physical width/radius changes reach raster envelope; distance alone never enlarges body/projectile`,()=>{
 const w=basicAttackProfile('witch',{lifeDrain:level}),s=basicAttackProfile('warrior',{cleave:level});
 const r=renderer('witch');r.projectiles=[{kind:'orb',x:0,y:0,radius:w.orbRadius,direction:{x:1,y:0}}];renderForegroundEffects(r,{});assert.equal(r.calls[0][4],w.orbRadius*2);
 r.calls=[];r.effects=[{name:'life_circle',x:0,y:0,radius:w.tapRadius,age:0}];r.projectiles=[];renderGroundEffects(r,{});assert.equal(r.calls[0][4],w.tapRadius*2);
 const warrior=renderer('warrior');warrior.projectiles=[{kind:'sword_wave',x:0,y:0,halfWidth:s.heavy.halfWidth,direction:{x:1,y:0}}];renderForegroundEffects(warrior,{});assert.equal(warrior.calls[0][6].height,s.heavy.halfWidth*2);assert.equal(warrior.calls.at(-1)[6].width,72);
 const archer=renderer('archer');archer.projectiles=[{kind:'snipe',x:0,y:0,direction:{x:1,y:0},age:.1}];renderForegroundEffects(archer,{});assert.equal(archer.calls.at(-1)[6].height,36);assert.equal(archer.calls.at(-1)[6].width,72);
});
test('local/remote row envelope is identical at both levels for every animation phase',async()=>{
 globalThis.window={game:{net:{_getCurrentFieldId:()=> 'qa'},resources:{loadImage:async()=>({width:768,height:768})},sceneManager:{currentScene:{}}}};
 for(const level of [1,8])for(const classId of ['witch','warrior']){
  const g=basicAttackProfile(classId,{lifeDrain:level,cleave:level}),r=renderer(classId),remote=new Remote(r.owner);
  const projectiles=classId==='witch'?[{kind:'orb',x:40,y:40,radius:g.orbRadius,speed:210,remaining:560,direction:{x:1,y:0}}]:[{kind:'sword_wave',x:40,y:40,halfWidth:g.heavy.halfWidth,speed:360,remaining:g.heavy.range,direction:{x:1,y:0}}];
  assert.equal(remote.receive({classId,fieldId:'qa',ts:Date.now(),epoch:1,sequence:1,projectiles}),true);await Promise.resolve();remote.images=r.images;
  for(let frame=0;frame<4;frame++){const calls=[],ctx={drawImage:(...args)=>calls.push(args),save(){},restore(){},translate(){},rotate(){},globalAlpha:1};const name=classId==='witch'?'orb':'rage_smash',size=classId==='witch'?g.orbRadius*2:g.heavy.halfWidth*2;
   drawClassEffect(r,ctx,name,40,40,size,frame*.16);drawClassEffect(remote,ctx,name,40,40,size,frame*.16);assert.deepEqual(calls[0],calls[1]);
  }
 }
});
test('Mage Lv1/Lv8 fireball head and AoE scale with collision radius, including weapon color variants',async()=>{
 globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}})})};await preloadPlayerSkillVfx({loadImage:async()=>({naturalWidth:768,naturalHeight:768})});
 const draws=[],ctx={save(){},restore(){},translate(){},rotate(){},drawImage:(...args)=>draws.push(args),globalAlpha:1};
 for(const variant of [undefined,'blue_flame'])for(const level of [1,8]){
  const radius=20+(level-1)*10;drawSkillProjectile(ctx,'fireball',0,0,radius,0,[],{variant:variant?'blue_fireball':undefined});near(draws.at(-1).at(-1),radius*8);
  drawSkillImpact(ctx,0,0,radius*2.5,.4,{variant});near(draws.at(-1).at(-1)*180/192,radius*2.5*2);
 }
});
