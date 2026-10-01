import test from 'node:test';
import assert from 'node:assert/strict';
import Controller from '../src/js/combat/ClassCombatController.js';
import { basicAttackInterval, MIN_BASIC_INTERVAL } from '../src/js/combat/AttackCadence.js';
function fixture(classId, speed = 1) {
    const owner={x:0,y:0,hp:1000,maxHp:1000,attackPower:10,attackSpeed:speed};
    const enemy={x:40,y:0,hp:100000,maxHp:100000};
    const actions=[];let paused=false;
    const c=new Controller(owner,classId,{paused:()=>paused,enemies:()=>[enemy],damage(e,n){e.hp-=n;return n;},action:(kind,data)=>actions.push({kind,...data,at:c.time})});
    const advance=dt=>{while(dt>0){const step=Math.min(.25,dt);c.update(step);dt-=step;}};
    return {c,owner,enemy,actions,advance,pause:v=>paused=v};
}
test('class reference intervals, empowered recovery, final floor and invalid speed',()=>{
    assert.equal(basicAttackInterval('witch'),.805);
    assert.equal(basicAttackInterval('warrior'),.70);
    assert.equal(basicAttackInterval('archer'),.65);
    assert.equal(basicAttackInterval('archer',{aimed:true,empowered:true}),.55);
    assert.equal(basicAttackInterval('witch',{speed:1.7}),.805/1.7,'berserk effective speed applied exactly once');
    for(const speed of [10,1e6])assert.equal(basicAttackInterval('witch',{speed}),MIN_BASIC_INTERVAL);
    for(const speed of [NaN,Infinity,-1,0])assert.equal(basicAttackInterval('witch',{speed}),.805);
});
for(const classId of ['witch','warrior','archer'])for(const fps of [2,10,30,60,120])test(`${classId} input flood at ${fps}fps cannot bank attacks or bypass recovery`,()=>{
    const f=fixture(classId,1000);f.c.rage=100;
    for(let frame=0;frame<fps*3;frame++){
        f.c.update(1/fps);
        let accepted=0;
        for(let event=0;event<40;event++)accepted+=Number(f.c.basic({aimed:event%2===1,x:100,y:0}));
        assert.ok(accepted<=1,'at most one accepted action in a frame despite tap/aim switching');
    }
    for(let i=1;i<f.actions.length;i++)assert.ok(f.actions[i].at-f.actions[i-1].at>=MIN_BASIC_INTERVAL-1e-10);
    assert.ok(f.actions.length<=1+Math.floor(f.c.time/MIN_BASIC_INTERVAL+1e-8));
    f.advance(20);let accepted=0;for(let n=0;n<100;n++)accepted+=Number(f.c.basic());assert.equal(accepted,1,'long idle does not accumulate attack tokens');
});
test('failed rage action has no cooldown/action; accepted reentrant action spends and damages once',()=>{
    const f=fixture('warrior');assert.equal(f.c.basic({aimed:true}),false);assert.equal(f.c.basicReady,0);assert.equal(f.actions.length,0);
    f.c.rage=100;let reentered=0,hits=0;
    f.c.hooks.damage=(e,n)=>{hits++;reentered+=Number(f.c.basic({aimed:true}));e.hp-=n;return n;};
    assert.equal(f.c.basic({aimed:true}),true);assert.equal(f.c.rage,75);assert.equal(hits,1);assert.equal(reentered,0);assert.equal(f.actions.length,1);
});
test('archer rejection preserves empowered state and marks; success consumes each once',()=>{
    const f=fixture('archer');f.c.empowered=true;f.c.state(f.enemy).marks=3;f.c.state(f.enemy).markUntil=10;
    assert.equal(f.c.basic({aimed:true,x:100,y:0}),true);assert.equal(f.c.empowered,false);assert.equal(f.c.state(f.enemy).marks,3,'launch reserves empowerment but impact consumes marks');assert.equal(f.c.basicReady,.55);f.advance(.1);assert.equal(f.c.state(f.enemy).marks,0);
    f.c.empowered=true;f.c.state(f.enemy).marks=2;
    assert.equal(f.c.basic({aimed:true}),false);assert.equal(f.c.empowered,true);assert.equal(f.c.state(f.enemy).marks,2);assert.equal(f.actions.length,1);
});
test('pause freezes recovery and rejects basic/skill without resource or action effects',()=>{
    const f=fixture('witch');f.pause(true);assert.equal(f.c.basic(),false);assert.equal(f.c.skill(3),false);f.c.update(100);assert.equal(f.c.time,0);assert.equal(f.actions.length,0);
    f.pause(false);assert.equal(f.c.basic(),true);const ready=f.c.basicReady;
    f.pause(true);f.advance(10);assert.equal(f.c.time,0);assert.equal(f.c.basicReady,ready);assert.equal(f.c.basic({aimed:true}),false);
    f.pause(false);f.advance(ready+.001);assert.equal(f.c.basic({aimed:true}),true);
});
test('effective speed changes apply at next approval, never retroactively reset recovery',()=>{
    const f=fixture('witch');let effective=1.7;f.owner.getEffectiveClassAttackSpeed=()=>effective;
    assert.equal(f.c.basic(),true);const ready=f.c.basicReady;effective=1000;assert.equal(f.c.basic(),false);assert.equal(f.c.basicReady,ready);
    f.advance(ready+.001);assert.equal(f.c.basic(),true);assert.equal(f.actions.at(-1).interval,.20);
});
test('Witch tap remains immediate, flying orbs allow later shots and never reset recovery on return',()=>{
    const f=fixture('witch');const hp=f.enemy.hp;f.c.basic();assert.equal(f.enemy.hp,hp-20);assert.equal(f.actions.length,1);
    f.enemy.x=500;f.advance(.806);f.c.basic({aimed:true,x:500,y:0});const firstDeadline=f.c.basicReady;
    f.advance(1.051);assert.equal(f.c.basic({aimed:true,x:500,y:0}),true);assert.ok(f.c.projectiles.length>=2,'previous orb can remain draining/returning');
    const ready=f.c.basicReady;assert.ok(ready>firstDeadline);f.advance(5);assert.equal(f.c.basicReady,ready,'drain/return task cannot clear recovery');
});
test('skills retain independent cooldowns and emit action only after successful approval',()=>{
    const f=fixture('witch');assert.equal(f.c.skill(3),true);assert.equal(f.c.skill(3),false);assert.equal(f.actions.filter(x=>x.kind==='skill').length,1);
    assert.equal(f.c.basic(),true,'a skill does not mutate basic recovery');assert.equal(f.c.skill(1),true,'independent skill cooldowns remain independent');
});

test('synchronous summon callbacks cannot duplicate cost/actors before skill cooldown commits',()=>{
 const f=fixture('witch');let created=0;
 f.c.hooks.summon=()=>{assert.equal(f.c.skill(2),false);created++;return {id:'one',hp:100};};
 assert.equal(f.c.skill(2),true);assert.equal(created,1);assert.equal(f.owner.hp,200);assert.equal(f.c.summons.length,1);
 assert.equal(f.c.skill(2),false);assert.equal(f.owner.hp,200);
});
