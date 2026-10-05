import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import sharp from 'sharp';import {createHash} from 'node:crypto';
import {CLASS_BODY,advanceAuthoredGait,sampleAuthoredBody,drawAuthoredClassBody} from '../src/js/combat/AuthoredCharacterFrames.js';
import {CLASS_WEAPONS_ENABLED} from '../src/js/core/ClassWeapons.js';
import ClassCombatBridge from '../src/js/combat/ClassCombatBridge.js';
import assets from '../src/js/core/AssetManifest.js';
const report=JSON.parse(fs.readFileSync('reports/approved-art-v142/provenance.json'));const sha=b=>createHash('sha256').update(b).digest('hex');
test('approved 26 assets are alpha WebP with verified provenance and immutable cache entries',async()=>{
 assert.equal(CLASS_WEAPONS_ENABLED,true);assert.equal(report.assets.length,26);
 for(const a of report.assets){const bytes=fs.readFileSync(a.file),m=await sharp(bytes).metadata();assert.equal(sha(bytes),a.sha256);assert.equal(m.width,a.width);assert.equal(m.height,a.height);assert.equal(m.hasAlpha,true);assert.equal(m.format,'webp');const cached=assets['/'+a.file];assert.ok(cached);assert.equal(sha(fs.readFileSync('.'+cached)),a.sha256);}
});
for(const [id,spec]of Object.entries({witch:{width:120,height:120},warrior:{width:180,height:144},archer:{width:192,height:144}}))test(`${id}: archived 48 runtime crops match approved pixels exactly; no rescale or direction mirroring`,async()=>{
 const path=`assets/resource/classes/approved/${id}-body.webp`;
 for(const f of report.frames.filter(f=>f.classId===id)){
  const row=['walk','stationary-attack','moving-attack'].indexOf(f.state)*4+['up','down','left','right'].indexOf(f.direction);
  const bytes=await sharp(path).extract({left:f.frame*spec.width,top:row*spec.height,width:spec.width,height:spec.height}).ensureAlpha().raw().toBuffer();for(let i=0;i<bytes.length;i+=4)if(!bytes[i+3])bytes[i]=bytes[i+1]=bytes[i+2]=0;assert.equal(sha(bytes),f.rgbaSha256);
 }
});
for(const [id,s]of Object.entries(CLASS_BODY))for(let direction=0;direction<4;direction++)test(`${id}/${direction}: walk-moving attack shares every phase at native size and fixed ground pivot`,()=>{
 const owner={classId:id,x:0,y:0,direction,state:'move',animTimer:0};advanceAuthoredGait(owner,0);
 for(let i=0;i<6;i++){
  if(i){owner.x+=10;advanceAuthoredGait(owner,s.frameSeconds);}
  const walk=sampleAuthoredBody(owner,null),attack=sampleAuthoredBody(owner,{direction,age:0,duration:s.frameSeconds*4});assert.equal(walk.frame,i);assert.equal(attack.frame,i);assert.equal(attack.row,8+direction);
  const calls=[],ctx={drawImage:(...a)=>calls.push(a)};drawAuthoredClassBody({width:s.width*6,height:s.height*12},owner,{direction,age:0},ctx,100,200);
  assert.deepEqual(calls[0].slice(5),[160-s.pivotX*s.scale,312-s.pivotY*s.scale,s.width*s.scale,s.height*s.scale]);
 }
 owner.state='idle';advanceAuthoredGait(owner,s.frameSeconds);assert.equal(sampleAuthoredBody(owner,{direction,age:s.frameSeconds*2}).row,4+direction);assert.equal(sampleAuthoredBody(owner,{direction,age:s.frameSeconds*2}).frame,4);
});
test('rapid attacks cannot reset body to preparation on every accepted hit',()=>{
 const b=Object.create(ClassCombatBridge.prototype);Object.assign(b,{owner:{classId:'archer',x:0,y:0},controller:{classId:'archer',time:0},motionSerial:0,syncVisuals(){}});
 b.startActionMotion('basic',{direction:3,interval:.2});b.controller.time=.2;b.startActionMotion('basic',{interval:.2});assert.equal(b.motion.started,0);b.controller.time=.4;b.startActionMotion('basic',{interval:.2});assert.equal(b.motion.started,0);b.controller.time=.6;b.startActionMotion('basic',{interval:.2});assert.equal(b.motion.started,.6);
});
test('art-delivery ZIP parts are explicitly excluded from Hosting',()=>{const ignore=JSON.parse(fs.readFileSync('firebase.json')).hosting.ignore;for(const p of ['art-delivery/**','**/*.zip','**/*.part[0-9][0-9]'])assert.ok(ignore.includes(p));});
