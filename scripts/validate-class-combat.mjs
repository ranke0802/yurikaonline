import test from 'node:test';
import assert from 'node:assert/strict';
import ClassCombatController, { SUMMON_TYPES } from '../src/js/combat/ClassCombatController.js';
function fixture(id) {
    const owner = { x: 0, y: 0, hp: 1000, maxHp: 1000, attackPower: 90, attackSpeed: 1 };
    const enemies = [], allies = [], events = [], dismissed = [], packets = [];
    const c = new ClassCombatController(owner, id, {
        enemies: () => enemies, allies: () => allies,
        damage(e, amount, meta) { packets.push({e,amount,meta}); if(e.blocked) return 0; const loss = Math.min(e.hp,amount); e.hp -= loss; return loss; },
        status: (e,type,duration,data) => events.push({e,type,duration,data}),
        summon: type => ({ typeId: type, x: 0, y: 0, hp: 100, maxHp: 100 }),
        dismiss: e => dismissed.push(e),
        move(e,x,y) { if(x > 250 || e.wall) return false; e.x=x; e.y=y; return true; },
    });
    const add = (extra = {}) => { const e = {x:50,y:0,hp:10000,maxHp:10000,...extra}; enemies.push(e); return e; };
    const advance = seconds => { for(let t=0;t<seconds-1e-8;t+=.05) c.update(Math.min(.05,seconds-t)); };
    return {c,owner,enemies,allies,events,dismissed,packets,add,advance};
}
test('Witch orb travels, applies three outbound hits and one return hit and returns its ATK healing budget', () => {
    const f=fixture('witch'), e=f.add(); f.owner.hp=500;
    assert.equal(f.c.basic(),true); assert.equal(e.hp,10000); f.advance(4); assert.equal(e.hp,9748); assert.equal(f.owner.hp,511);
});
test('orb overkill limits recovery and never distributes excess to allies', () => {
    const f=fixture('witch'), e=f.add({hp:40}); f.owner.hp=995; const ally={hp:80,maxHp:100}; f.allies.push(ally);
    f.c.basic({aimed:true,x:200,y:0}); f.advance(4);
    assert.equal(e.hp,0); assert.equal(f.owner.hp,1000); assert.equal(ally.hp,80);
    assert.equal(f.packets.length,1,'dead enemy cannot contribute more damage');
});
test('rejected damage grants neither heal nor marks', () => {
    const f=fixture('archer'),e=f.add({blocked:true}); f.c.basic({x:200,y:0}); f.advance(1); assert.equal(f.c.state(e).marks,undefined);
});
test('poison uses enemy MAX HP including bosses, once per second, fifth pulse stuns exactly 3s', () => {
    const f=fixture('witch'),e=f.add({isBoss:true}); f.c.skill(1,{x:50,y:0}); f.advance(.95); assert.equal(e.hp,10000);
    f.advance(4.2); assert.equal(f.packets.length,5); assert.equal(e.hp,10000-5*(90+500));
    const slows=f.events.filter(e=>e.type==='poison'); assert.deepEqual(slows.map(e=>Math.round(e.data.slow*100)),[20,40,60,80]);
    assert.equal(f.events.find(e=>e.type==='stun').duration,3); f.c.poison(e); assert.equal(e.witchPoison.stacks,0);
});
test('summon insufficient HP is atomic; oldest replacement, level mapping, disposal', () => {
    const f=fixture('witch'); f.owner.hp=799; assert.equal(f.c.skill(2,{level:8}),false); assert.equal(f.owner.hp,799); assert.equal(f.c.summons.length,0);
    for(let i=0;i<4;i++) { f.owner.hp=1000; assert.equal(f.c.skill(2,{level:i+1}),true); f.advance(1.1); }
    assert.equal(f.owner.hp,200); assert.equal(f.c.summons.length,3); assert.equal(f.dismissed[0].typeId,'slime');
    assert.deepEqual(SUMMON_TYPES,['slime','squirtle','emolga','gastly','king_slime','ruin_wobbuffet','thunder_pikachu','astral_sylveon']);
    f.c.dispose(); assert.equal(f.dismissed.length,4); assert.equal(f.c.summons.length,0);
});
test('berserk excludes caster, includes summons, expires without changing base stats', () => {
    const f=fixture('witch'); f.c.skill(2); const summon=f.c.summons[0]; f.c.skill(3);
    assert.deepEqual(f.c.multipliers(summon),{move:1.25,attackSpeed:1.7,attack:1.2}); assert.equal(f.c.multipliers(f.owner).attack,1);
    f.advance(10.1); assert.equal(f.c.multipliers(summon).attack,1); assert.equal(f.owner.attackPower,90);
});
test('warrior 3-hit combo grants rage only on hits; aimed smash spends bounded rage', () => {
    const f=fixture('warrior'),e=f.add(); for(let i=0;i<3;i++) { assert.equal(f.c.basic({x:100,y:0}),true); f.advance(.701); }
    assert.equal(f.c.rage,18); assert.equal(f.c.basic({aimed:true,x:100,y:0}),false); f.c.rage=50;
    assert.equal(f.c.basic({aimed:true,x:100,y:0}),true); assert.equal(f.c.rage,25); f.advance(.3); assert.equal(f.packets.at(-1).meta.armorPierce,1);
});
test('warrior shield-hit barrage refunds once per cast without dash or wall stun', () => {
    const f=fixture('warrior'),a=f.add({wall:true}),b=f.add({isBoss:true}); f.c.skill(1,{x:200,y:0}); f.advance(1.6); f.c.skill(2,{x:0,y:0});
    assert.equal(f.c.rage,25); assert.equal(f.events.filter(e=>e.type==='stun').length,0); assert.equal(f.events.some(e=>e.type==='taunt'),false);
    assert.equal(f.c.skill(2,{x:200,y:0}),false); assert.equal(f.c.rage,25);
});
test('blood pact heals actual damage and final attack consumes remaining rage once', () => {
    const f=fixture('warrior');f.add();f.owner.hp=500;f.c.rage=75;f.c.skill(3);f.c.basic({x:100,y:0}); assert.equal(f.owner.hp,518);
    f.advance(8.1);assert.equal(f.c.rage,0);assert.equal(f.packets.length,2);assert.equal(f.packets[1].amount,360);f.advance(2);assert.equal(f.packets.length,2);
});
test('archer trap marks/root then sniper consumes and spreads marks, leap empowers once', () => {
    const f=fixture('archer'),a=f.add(),b=f.add({x:50,y:80});f.c.skill(1,{x:50,y:0});f.advance(.1);assert.equal(f.c.state(a).marks,3);
    f.c.skill(2,{x:-100,y:0});assert.equal(f.c.modifyIncomingDamage(100),0);f.c.basic({aimed:true,x:50,y:0});assert.equal(f.c.state(a).marks,3,'marks remain until arrow arrives');f.advance(.4);assert.equal(f.c.state(a).marks,0);assert.equal(f.c.state(b).marks,2);assert.equal(f.c.empowered,false);
});
test('rain kill transfers capped marks without recursive damage loop', () => {
    const f=fixture('archer'),a=f.add({hp:10}),b=f.add({x:80,y:0});f.c.mark(a,5);f.c.skill(3,{x:50,y:0});f.advance(3.2);
    assert.equal(f.c.state(b).marks,5);assert.equal(f.packets.length,6);
});
test('pause/death/dispose cannot replay pending damage or restore transient summons', () => {
    const f=fixture('witch');f.add();f.c.skill(1);f.c.hooks.paused=()=>true;f.advance(5);assert.equal(f.packets.length,0);
    f.c.hooks.paused=()=>false;f.owner.hp=0;f.c.update(.05);f.owner.hp=1000;f.advance(5);assert.equal(f.packets.length,0);assert.equal(f.c.basic(),false);
});
test('level growth preserves explicit Witch damage and reduces only cooldown', () => {
    const f=fixture('witch'); f.add(); f.c.skill(1,{x:50,y:0,level:8}); f.advance(1.1);
    assert.equal(f.packets[0].amount,590); assert.equal(f.c.cooldowns[1],9*.79);
});
test('rejected poison cannot add slow or stun, no frame-rate stacking', () => {
    const f=fixture('witch'),e=f.add({blocked:true});f.c.skill(1,{x:50,y:0});f.advance(5.2);
    assert.equal(f.events.length,0);assert.equal(f.c.state(e).poisonStacks,undefined);assert.equal(f.packets.length,5);
});
test('small ATK uses per-hit damage while the per-orb heal ceiling remains independent',()=>{
    const f=fixture('witch');f.add();f.owner.attackPower=5;f.owner.hp=500;f.c.basic({aimed:true,x:200,y:0});f.advance(4);
    assert.deepEqual(f.packets.map(p=>p.amount),[4,4,4,4]);assert.equal(f.owner.hp,501);
});
