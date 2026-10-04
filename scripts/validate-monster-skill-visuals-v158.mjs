import test from 'node:test';
import assert from 'node:assert/strict';
import Monster from '../src/js/entities/Monster.js';
import {drawSummonAbilities} from '../src/js/combat/SummonAbilityVisuals.js';
import {preloadMonsterSkillVfxAssets} from '../src/js/effects/MonsterSkillVfxRenderer.js';
await preloadMonsterSkillVfxAssets({loadImage:async()=>({naturalWidth:1254,naturalHeight:1254})});
function canvas(){const calls=[],stack=[];const ctx={globalAlpha:1,angle:0,save(){stack.push([this.globalAlpha,this.angle]);},restore(){[this.globalAlpha,this.angle]=stack.pop();},rotate(a){this.angle+=a;},translate(){},scale(){},beginPath(){},arc(){},fill(){},stroke(){},fillRect(){},strokeRect(){},moveTo(){},lineTo(){},drawImage(...args){calls.push({args,alpha:this.globalAlpha,angle:this.angle});}};return{ctx,calls};}
const zone={shape:'circle',x:0,y:0,radius:92};
function packet(age,remaining,extra={}){return{ts:Date.now(),theme:'thunder',casts:[{kind:'area',theme:'thunder',zones:[zone],age,warning:1,remaining,impactDuration:.32,...extra}],projectiles:[]};}
test('persistent native lightning remains painted after impact, fades only in last 350ms',()=>{const m=Object.create(Monster.prototype);m.isLowGlareCombatZone=()=>true;const t={zones:[zone],warningMs:0,impactMs:300,persistentMs:5000,effect:'thunder',color:'#abc',secondaryColor:'#fff'};for(const age of [350,2000,4500]){const {ctx,calls}=canvas();m.activeBossTelegraphs=[{...t,elapsedMs:age}];m.renderBossTelegraphs(ctx);assert.ok(calls.some(x=>x.alpha>.1),String(age));}const{ctx,calls}=canvas();m.activeBossTelegraphs=[{...t,elapsedMs:4999}];m.renderBossTelegraphs(ctx);assert.ok(calls.every(x=>x.alpha<.01));});
test('summon warning, impact and residue use distinct authored timeline frames',()=>{const rows=[];for(const age of [.2,.8,1.1,1.3]){const{ctx,calls}=canvas();drawSummonAbilities(ctx,{x:0,y:0},packet(age,1.32-age));rows.push(calls[0].args[2]);}assert.deepEqual(rows,[0,328,660,980]);});
test('summoned diagonal water lane keeps impact atlas upright, matches native ground geometry',()=>{const {ctx,calls}=canvas();drawSummonAbilities(ctx,{x:0,y:0},packet(1.1,.22,{theme:'water',zones:[{shape:'line',x1:0,y1:0,x2:250,y2:250,width:80}]}),'ground');assert.ok(calls.length>1);assert.ok(calls.every(c=>c.angle===0));assert.ok(calls.every(c=>Math.abs(c.args[7]/c.args[8]-1/.82)<1e-8));});
test('ground casts do not paint in foreground, expired or malformed snapshots do not paint',()=>{for(const p of [packet(1.1,0),packet(1.1,.2,{zones:[{shape:'circle',x:0,y:0,radius:Infinity}]}),{...packet(1.1,.2),ts:Date.now()-1000}]){const{ctx,calls}=canvas();drawSummonAbilities(ctx,{x:0,y:0},p);assert.equal(calls.length,0);}const{ctx,calls}=canvas();drawSummonAbilities(ctx,{x:0,y:0},packet(.2,1.1),'foreground');assert.equal(calls.length,0);});
test('persistent summon area retains its residue until damage lifetime ends',()=>{const{ctx,calls}=canvas();drawSummonAbilities(ctx,{x:0,y:0},packet(3,2,{warning:0,persistent:5}),'ground');assert.ok(calls.some(c=>c.alpha>.1&&c.args[2]===980));});
test('landing hazard preserves explicit zero warning and default telegraph damage starts with its warning',()=>{
 globalThis.window={game:null};const m=Object.create(Monster.prototype);Object.assign(m,{activeBossTelegraphs:[],seenBossTelegraphIds:new Map(),bossEffects:{},atk:10});
 m.startBossTelegraph({id:'landing',warningMs:0,persistentMs:5000,zones:[zone]});
 assert.equal(m.activeBossTelegraphs[0].warningMs,0);assert.equal(m.activeBossTelegraphs[0].nextDamageMs,0);
 m.startBossTelegraph({id:'normal',zones:[zone]});assert.equal(m.activeBossTelegraphs[1].warningMs,1000);assert.equal(m.activeBossTelegraphs[1].nextDamageMs,1000);
});
test('native persistent hazard has ten half-second ticks over five seconds at normal and low FPS',()=>{
 for(const dt of [.05,.2,.7]){globalThis.window={game:null};const m=Object.create(Monster.prototype);Object.assign(m,{activeBossTelegraphs:[],seenBossTelegraphIds:new Map(),bossEffects:{},atk:10});let hits=0;m._applyBossTelegraphDamage=()=>hits++;
 m.startBossTelegraph({id:'ticks',warningMs:0,persistentMs:5000,tickMs:500,zones:[zone]});for(let t=0;t<6;t+=dt)m._updateBossTelegraphs(dt);assert.equal(hits,10,`dt=${dt}`);assert.equal(m.activeBossTelegraphs.length,0);}
});
