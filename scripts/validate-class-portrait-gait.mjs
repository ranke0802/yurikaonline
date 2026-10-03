import test from 'node:test';
import assert from 'node:assert/strict';
import { UIManager } from '../src/js/ui/UIManager.js';
import Player from '../src/js/entities/Player.js';
import RemotePlayer from '../src/js/entities/RemotePlayer.js';
import {createActionMotion,sampleActionMotion} from '../src/js/combat/ClassActionMotion.js';
for(const [id,cell] of [['wizard',256],['witch',192],['warrior',192],['archer',192]])test(`${id} portrait samples exactly one front-facing cell`,t=>{
 const calls=[],elements=[{style:{}},{style:{}}];const canvas={getContext:()=>({drawImage:(...args)=>calls.push(args)}),toDataURL:()=>`data:portrait-${cell}`};
 const previous=globalThis.document;t.after(()=>globalThis.document=previous);
 globalThis.document={createElement:()=>canvas,querySelectorAll:()=>elements};
 const image={width:cell*8,height:cell*5};UIManager.prototype.updatePlayerPortraits.call({},image,{cols:8,rows:5});
 assert.deepEqual(calls[0],[image,0,cell,cell,cell,0,0,cell,cell]);assert.equal(canvas.width,cell);assert.equal(canvas.height,cell);
 assert.ok(elements.every(el=>el.style.backgroundImage===`url(data:portrait-${cell})`));
});
for(const id of ['witch','warrior','archer'])for(const [direction,dx,dy] of [[0,0,-6],[1,0,6],[2,-6,0],[3,6,0]])test(`${id} direction ${direction}: movement phase survives attack and remote uses the same gait`,()=>{
 const player={classId:id,activeClassId:id,x:0,y:0,state:'move',isAttacking:true,animTimer:1.5,direction};
 const remote={...player};const update=Player.prototype._updateAnimation,remoteUpdate=RemotePlayer.prototype._updateAnimation;
 update.call(player,1/60);remoteUpdate.call(remote,1/60);
 const start=player.animTimer;
 for(let i=0;i<8;i++){player.x+=dx;player.y+=dy;remote.x+=dx;remote.y+=dy;update.call(player,1/60);remoteUpdate.call(remote,1/60);}
 assert.ok(Math.abs(player.animTimer-(start+8/60/(id==='warrior'?.15:.14))%4)<1e-8);assert.equal(player.animTimer,remote.animTimer);
 const motion=createActionMotion(id,'basic',{},0,1),frames=[];
 for(const age of [0,motion.duration*.4,motion.duration*.8])frames.push(sampleActionMotion({...motion,age}).frame);
 assert.deepEqual(frames,[1,2,3],'attack poses continue independently; the attack is not frozen');
 player.state='attack';remote.state='attack';update.call(player,.2);remoteUpdate.call(remote,.2);assert.equal(player.animFrame,0);assert.equal(remote.animFrame,0,'stationary attacking must not run the walking feet');
});
test('accepting a new-class attack leaves the walking phase intact',()=>{
 const previous=globalThis.window;globalThis.window={game:{}};
 try{const player={classId:'warrior',classAim:{action:'ATTACK',x:50,y:0,elapsed:0},animTimer:2.75,classCombat:{paused:()=>false,basic:()=>true,controller:{enemies:()=>[]}}};assert.equal(Player.prototype.releaseClassAction.call(player,'ATTACK'),true);assert.equal(player.animTimer,2.75);assert.equal(player.isAttacking,true);assert.equal(player.skillAttackTimer,.4);}finally{globalThis.window=previous;}
});
