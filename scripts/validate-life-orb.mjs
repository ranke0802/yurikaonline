import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import Controller from '../src/js/combat/ClassCombatController.js';
import { lifeOrbProfile, advanceLifeOrb } from '../src/js/combat/LifeOrb.js';
import { drawLifeOrb, validLifeOrbMetadata, loadLifeOrbVisuals, LIFE_ORB_DRAW_SIZE } from '../src/js/combat/LifeOrbVisuals.js';
import { launchLifeOrb } from '../src/js/combat/LifeOrb.js';
import Bridge from '../src/js/combat/ClassCombatBridge.js';
import RemoteVisuals from '../src/js/combat/ClassVisuals.js';
import { captureProjectileWorldContext } from '../src/js/entities/ProjectileWorldContext.js';

const atlasMetadata=JSON.parse(readFileSync(new URL('../assets/resource/effects/life-orb-v177.json',import.meta.url)));

function fixture(level = 1, blocked = () => false) {
    const owner = { id: 'owner', classId: 'witch', x: 0, y: 0, hp: 100, maxHp: 1000,
        attackPower: 100, attackSpeed: 50, skillLevels: { lifeDrain: level } };
    const enemies = [], hits = [], effects = [], heals = [];
    const c = new Controller(owner, 'witch', { enemies: () => enemies, projectileBlocked: blocked,
        combatOrigin: () => ({ x: 0, y: 0 }), attackOrigin: () => ({ x: owner.x, y: owner.y }),
        damage(e, n, meta) { if(e.rejected)return 0; const loss=Math.min(n,e.hp);e.hp-=loss;hits.push({id:e.id,n:loss,at:c.time,meta});return loss; },
        effect: (name, data) => effects.push({name,...data}), healFeedback: (_e,n) => heals.push(n) });
    const enemy = (x=60, y=0, hp=10000) => {const e={id:`e${enemies.length}`,x,y,hp,maxHp:hp,radius:24};enemies.push(e);return e;};
    const advance = (time, dt=.05) => {for(let t=0;t<time-1e-8;t+=dt)c.update(Math.min(dt,time-t));};
    return {owner,c,enemies,hits,effects,heals,enemy,advance};
}
test('all eight levels expose slots, per-hit growth and independent healing caps', () => {
    assert.deepEqual(Array.from({length:8},(_,i)=>lifeOrbProfile(i+1).capacity),[1,1,2,2,3,3,4,4]);
    for(let level=1;level<=8;level++) {const p=lifeOrbProfile(level);assert.equal(Math.round(p.hitMultiplier*100),70+5*(level-1));assert.equal(Math.round(p.healMultiplier*100),12+2*(level-1));}
});
test('reserve all slots without cooldown, reject extra input, refund only on return', () => {
    const f=fixture(8);f.enemy();f.c.basicReady=999;
    for(let i=0;i<4;i++)assert.equal(f.c.basic({x:300,y:0}),true);
    assert.equal(f.c.basic(),false);assert.deepEqual(f.c.orbSlots(),{available:0,maximum:4,active:4});
    f.advance(.5);assert.equal(f.c.orbSlots().available,0);
    f.advance(4);assert.equal(f.c.orbSlots().available,4);assert.equal(f.c.basic(),true);
});
test('contact pulses at most three times, continues forward, then returns faster and heals once', () => {
    const f=fixture();f.enemy();f.c.basic({x:300,y:0});const p=f.c.projectiles[0];
    f.advance(.75);assert.equal(f.owner.hp,100);assert.equal(f.hits.length,3);assert.ok(p.x>60);
    assert.ok(f.hits.every(h=>h.n===70));assert.ok(f.hits.slice(1).every((h,i)=>h.at-f.hits[i].at>=.24));
    f.advance(3);assert.equal(f.owner.hp,112);assert.deepEqual(f.heals,[12]);assert.equal(p.finished,true);
    advanceLifeOrb(f.c,p,1);assert.equal(f.owner.hp,112);assert.deepEqual(f.heals,[12]);
});
test('many targets and overkill cannot multiply healing; only the owner receives the budget', () => {
    const f=fixture(8);for(let i=0;i<20;i++)f.enemy(60,i-10);f.c.basic();f.advance(4);
    const outgoing=f.hits.filter(h=>h.meta.orbPhase==='outbound'),returning=f.hits.filter(h=>h.meta.orbPhase==='return');assert.ok(outgoing.length<=9);assert.equal(new Set(outgoing.map(h=>h.id)).size,3);assert.equal(returning.length,20);assert.equal(new Set(returning.map(h=>h.id)).size,20);assert.equal(f.owner.hp,126);
    const tiny=fixture();tiny.enemy(60,0,1);tiny.c.basic();tiny.advance(4);assert.equal(tiny.owner.hp,100);
});
test('miss, blocked damage, target death, range and wall hits all release without free HP', () => {
    for(const kind of ['miss','rejected','dead','range','wall']) {
        const f=fixture(1,kind==='wall'?x=>x>20:()=>false);
        if(kind!=='miss'){const e=f.enemy(kind==='range'?900:60);if(kind==='dead')e.hp=0;if(kind==='rejected')e.rejected=true;}
        assert.equal(f.c.basic({aimed:true,x:300,y:0}),true);f.advance(9);
        assert.equal(f.owner.hp,100,kind);assert.equal(f.c.orbSlots().available,1,kind);assert.equal(f.heals.length,0,kind);
    }
});
test('death, disposal and teleport cancel outstanding slots without damage or healing afterward', () => {
    for(const reason of ['death','dispose','teleport']) {
        const f=fixture();f.enemy();f.c.basic();f.advance(.2);
        if(reason==='death')f.owner.hp=0;else if(reason==='dispose')f.c.dispose();else f.owner.x=3000;
        const n=f.hits.length,hp=f.owner.hp;f.advance(5);assert.equal(f.hits.length,n);assert.equal(f.owner.hp,hp);assert.equal(f.c.projectiles.length,0);
    }
});
test('simulation pause freezes travel and reservations; a new controller restores no old projectiles', () => {
    const f=fixture();f.enemy();f.c.basic();f.c.hooks.paused=()=>true;f.advance(20);
    assert.equal(f.hits.length,0);assert.equal(f.c.orbSlots().available,0);
    const restored=new Controller(f.owner,'witch');assert.equal(restored.orbSlots().available,1);assert.equal(restored.projectiles.length,0);
    f.c.hooks.paused=()=>false;f.advance(4);assert.equal(f.heals.length,1);
});
test('damage and healing are consistent at 20Hz and 4Hz', () => {
    const results=[.05,.25].map(dt=>{const f=fixture(8);f.enemy();f.c.basic({aimed:true,x:300,y:0});f.advance(6,dt);return{damage:f.hits.reduce((n,h)=>n+h.n,0),hp:f.owner.hp,slots:f.c.orbSlots()};});
    assert.deepEqual(results[0],results[1]);assert.equal(results[0].damage,420);
});
test('reservation exists before reentrant launch callbacks, and disposal in damage stops the volley', () => {
    const f=fixture();let nested;f.c.hooks.action=()=>{nested=f.c.basic();};assert.equal(f.c.basic(),true);assert.equal(nested,false);
    const g=fixture();g.enemy();g.enemy();g.c.hooks.damage=()=>{g.c.dispose();return 1;};g.c.basic();g.advance(4);assert.equal(g.c.projectiles.length,0);assert.deepEqual(g.heals,[]);
});
test('missing generated atlas paints nothing; valid atlas uses only image frames', () => {
    const calls=[],ctx={save(){},restore(){},translate(){},rotate(){},drawImage(...args){calls.push(args);}};
    assert.equal(drawLifeOrb(ctx,null,{x:0,y:0}),false);assert.equal(calls.length,0);
    const image={width:1024,height:1536};
    for(const charge of [0,1/3,2/3,1])drawLifeOrb(ctx,image,{x:0,y:0,charge},atlasMetadata);
    drawLifeOrb(ctx,image,{x:0,y:0,phase:'return',charge:1},atlasMetadata);drawLifeOrb(ctx,image,{x:0,y:0,healing:true},atlasMetadata);
    drawLifeOrb(ctx,image,{x:0,y:0,phase:'return',charge:0},atlasMetadata);
    assert.deepEqual(calls.map(a=>a[2]),[0,256,512,768,1024,1280,0],'a missed orb stays blue during return');
});
test('impact is a short raster-only punch; reduced effects and return omit the glow',()=>{
    const image={width:1024,height:1536};
    for(const options of [{},{reducedEffects:true},{phase:'return'},{age:.4}]){
        const calls=[],ctx={globalAlpha:.8,save(){},restore(){},translate(){},rotate(){},drawImage(...a){calls.push({args:a,alpha:this.globalAlpha});}};
        drawLifeOrb(ctx,image,{x:0,y:0,age:.11,impactAt:.1,charge:1,...options},atlasMetadata);
        const reacting=Object.keys(options).length===0;
        assert.equal(calls.length,reacting?2:1);assert.equal(ctx.globalAlpha,.8);
        assert.ok(calls.every(c=>c.args[0]===image),'only approved image pixels are used');
        if(reacting){assert.ok(calls[0].alpha<.2);assert.ok(calls[1].args[7]>104&&calls[1].args[7]<123);}
        else assert.equal(calls[0].args[7],options.phase==='return'?112:104);
    }
});
test('only accepted hits trigger feedback and many simultaneous targets share one audio cadence',()=>{
    const f=fixture(8),sounds=[],bridge=Object.create(Bridge.prototype);
    Object.assign(bridge,{controller:f.c,visualEpoch:1,game:{sound:{playClassEvent:(name,data)=>sounds.push({name,id:data.audioId,time:f.c.time})}}});
    f.c.hooks.lifeOrbImpact=p=>bridge.lifeOrbImpact(p);
    for(let i=0;i<3;i++)f.enemy(60,i*3);for(let i=0;i<4;i++)f.c.basic();f.advance(5,.01);
    assert.equal(f.hits.length,48);assert.equal(f.owner.hp,204);
    assert.ok(sounds.length>=1&&sounds.length<=4,'48 accepted hits do not create 48 voices');
    assert.ok(sounds.every(s=>s.name==='life_circle'));
    assert.ok(sounds.slice(1).every((s,i)=>s.time-sounds[i].time>=.18-1e-8));
    const rejected=fixture();rejected.enemy().rejected=true;rejected.c.hooks.lifeOrbImpact=()=>assert.fail('rejected hit emitted impact');rejected.c.basic();rejected.advance(5);
});
test('actual bridge impact snapshots survive network delay without negative atlas frames or remote sound',()=>{
    const previous=globalThis.window,clock=Date.now;let now=100000;
    try{
        Date.now=()=>now;const game={net:{_getCurrentFieldId:()=> 'one'},monsterManager:{worldGeneration:1},sceneManager:{currentScene:{}},sound:{playClassEvent(){assert.fail('remote snapshot played owner audio');}}};globalThis.window={game};
        const f=fixture();f.enemy(10);f.c.basic();f.advance(.01,.01);
        const bridge=Object.create(Bridge.prototype);Object.assign(bridge,{owner:f.owner,controller:f.c,visualEpoch:1,visualSequence:0,effects:[],context:captureProjectileWorldContext(game),currentMotion:()=>null});
        const packet=bridge.visualSnapshot();assert.ok(packet.projectiles[0].impactAge>=0);
        const remote=new RemoteVisuals(f.owner);remote.classId='witch';now+=30;assert.equal(remote.receive(packet),true);
        const calls=[],ctx={globalAlpha:1,save(){},restore(){},translate(){},rotate(){},drawImage(...a){calls.push(a);}};
        assert.equal(drawLifeOrb(ctx,{width:1024,height:1536},remote.projectiles[0],atlasMetadata),true);
        assert.equal(calls.length,2);assert.ok(calls.every(a=>a.slice(1).every(Number.isFinite)));assert.equal(f.owner.hp,100);
        now+=200;assert.equal(remote.receive({...packet,sequence:2}),true);calls.length=0;
        drawLifeOrb(ctx,{width:1024,height:1536},remote.projectiles[0],atlasMetadata);assert.equal(calls.length,1,'expired impact is not replayed');
    }finally{Date.now=clock;globalThis.window=previous;}
});
test('all 24 approved metadata pivots anchor the raster core, including the return trail',()=>{
    assert.equal(validLifeOrbMetadata(atlasMetadata),true);
    const calls=[],ctx={save(){},restore(){},translate(){},rotate(){},drawImage(...args){calls.push(args);}},image={width:1024,height:1536};
    for(const f of atlasMetadata.frames){
        const healing=f.row===5,phase=f.row===4?'return':'outbound',age=(f.column+.01)*.1,charge=f.row===4?1:f.row/3;
        assert.equal(drawLifeOrb(ctx,image,{x:20,y:30,age,charge,phase,healing,direction:{x:-1,y:0}},atlasMetadata),true);
        const call=calls.at(-1),size=LIFE_ORB_DRAW_SIZE[healing?'healing':phase==='return'?'return':'outbound'];
        assert.deepEqual(call.slice(1,5),Object.values(f.sourceRect));
        assert.equal(call[5],-f.pivotPx.x*size/256);assert.equal(call[6],-f.pivotPx.y*size/256);
    }
    assert.equal(calls.length,24);
});
test('invalid or missing frame metadata prevents loading and rendering instead of misaligning the orb',async()=>{
    const image={width:1024,height:1536};
    for(const metadata of [null,{...atlasMetadata,frames:atlasMetadata.frames.slice(1)},
        {...atlasMetadata,frames:atlasMetadata.frames.map((f,i)=>i===16?{...f,pivotPx:{x:Infinity,y:0}}:f)}]){
        assert.equal(validLifeOrbMetadata(metadata),false);
        await assert.rejects(loadLifeOrbVisuals({loadImage:async()=>image,loadJSON:async()=>metadata}),/Invalid Life Orb/);
        assert.equal(drawLifeOrb({drawImage(){throw Error('bad metadata rendered');}},image,{x:0,y:0},metadata),false);
    }
});
for(const level of [1,4,8])for(const fps of [4,20,60,144])test(`Lv.${level} ${fps}Hz input flood never exceeds capacity or banks releases`,()=>{
    const f=fixture(level);f.enemy(60,0,1e7);let launches=0;
    for(let frame=0;frame<fps*8;frame++){
        for(let burst=0;burst<20;burst++)if(f.c.basic())launches++;
        assert.ok(f.c.orbSlots().active<=Math.ceil(level/2));f.advance(1/fps,1/fps);
    }
    f.advance(10);assert.equal(f.c.orbSlots().available,Math.ceil(level/2));
    assert.equal(f.heals.length,launches);assert.ok(f.heals.every(n=>n<=Math.ceil(100*lifeOrbProfile(level).healMultiplier)));
});
test('weapon bonus, crowd size and a later stat change cannot escape the launch-time healing cap',()=>{
    const f=fixture();for(let i=0;i<10;i++)f.enemy(60,i);
    launchLifeOrb(f.c,{}, {restoreHpPerLaserHit:10000});f.owner.attackPower=100000;f.owner.skillLevels.lifeDrain=8;
    f.advance(.75);assert.equal(f.owner.hp,100,'no weapon heal before return');f.advance(4);
    assert.equal(f.owner.hp,112);assert.deepEqual(f.heals,[12]);
    const full=fixture();full.owner.hp=1000;full.enemy();full.c.basic();full.advance(5);assert.deepEqual(full.heals,[]);assert.equal(full.c.orbSlots().available,1);
});
test('real network damage acceptance sends one unique packet per pulse and rejected hits never heal',()=>{
    for(const accepted of [false,true]){
        const f=fixture(),e=f.enemy();e.takeDamage=n=>{e.hp-=Math.min(n,e.hp);return true;};
        const packets=[],bridge=Object.create(Bridge.prototype);
        Object.assign(bridge,{owner:f.owner,hitSerial:0,visualEpoch:1,game:{net:{playerId:'owner',sendMonsterDamage:(...args)=>{packets.push(args);return accepted;}},monsterManager:{isMonsterCombatBlocked:()=>false}}});
        f.c.hooks.damage=(...args)=>bridge.damage(...args);f.c.basic();f.advance(5);
        assert.equal(packets.length,4);assert.equal(new Set(packets.map(p=>p[2].classHitId)).size,4);assert.equal(packets.filter(p=>p[2].orbPhase==='return').length,1);
        assert.ok(packets.every(p=>p[2].lifeOrb&&p[2].orbId===1));assert.equal(e.hp,accepted?9720:10000);
        assert.equal(f.owner.hp,accepted?112:100);assert.equal(f.heals.length,accepted?1:0);
    }
});
test('old field, world generation and scene controllers are disposed before another pulse or return',()=>{
    const previous=globalThis.window;
    try {for(const change of ['field','generation','scene','transition']){
        const f=fixture(),game={net:{_getCurrentFieldId:()=> 'one'},monsterManager:{worldGeneration:1},sceneManager:{currentScene:{zoneTransitionToken:1}}};
        globalThis.window={game};const bridge=Object.create(Bridge.prototype);
        Object.assign(bridge,{owner:f.owner,controller:f.c,game,context:captureProjectileWorldContext(game),actors:[],effects:[],syncVisuals:()=>{}});
        f.enemy();f.c.basic();f.advance(.2);const hp=f.owner.hp,hits=f.hits.length;
        if(change==='field')game.net._getCurrentFieldId=()=> 'two';
        if(change==='generation')game.monsterManager.worldGeneration++;
        if(change==='scene')game.sceneManager.currentScene={};
        if(change==='transition')game.sceneManager.currentScene.zoneTransitionToken++;
        bridge.update(.25);f.advance(5);assert.equal(f.c.disposed,true,change);assert.equal(f.c.orbSlots().active,0);assert.equal(f.owner.hp,hp);assert.equal(f.hits.length,hits);
    }}finally{globalThis.window=previous;}
});
test('remote snapshots reject replay, replace reservations visually and clear on world change without combat',()=>{
    const previous=globalThis.window;
    try {
        const game={net:{_getCurrentFieldId:()=> 'one'},monsterManager:{worldGeneration:1},sceneManager:{currentScene:{}}};globalThis.window={game};
        const owner={hp:500,maxHp:1000},remote=new RemoteVisuals(owner);remote.classId='witch';
        const packet={classId:'witch',fieldId:'one',ts:Date.now(),epoch:1,sequence:1,projectiles:[{kind:'life_orb',x:50,y:50,direction:{x:1,y:0},speed:540,remaining:null,phase:'return',charge:1,radius:18.9}]};
        assert.equal(remote.receive(packet),true);assert.equal(remote.receive(packet),false);assert.equal(remote.projectiles.length,1);
        assert.equal(remote.projectiles[0].charge,1);assert.equal(remote.projectiles[0].radius,18.9);assert.equal(remote.projectiles[0].phase,'return');
        remote.advance();assert.equal(owner.hp,500);assert.equal(remote.controller,undefined);
        assert.equal(remote.receive({...packet,sequence:2,projectiles:[]}),true);assert.equal(remote.projectiles.length,0);
        remote.receive({...packet,sequence:3});game.monsterManager.worldGeneration++;remote.advance();assert.equal(remote.projectiles.length,0);assert.equal(owner.hp,500);
    }finally{globalThis.window=previous;}
});
