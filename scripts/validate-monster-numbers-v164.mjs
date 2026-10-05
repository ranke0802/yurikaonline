import test from 'node:test';
import assert from 'node:assert/strict';
import Numbers, { monsterNumberSource, MONSTER_NUMBER_TIMING as T } from '../src/js/ui/MonsterDamageNumbers.js';
import WorldScene from '../src/js/world/scenes/WorldScene.js';

const target = id => ({ id, hp: 1000, isDead: false, lastAttackerId: 'actor' });
const source = (n, fields = {}) => ({ actor: 'actor', nature: 'barrage', cast: 'actor:epoch:cast', eventId: `actor:epoch:${n}`, ...fields });
function fixture() {
    const numbers = new Numbers(), texts = [], m = target('m'), monsters = new Map([['m', m]]);
    const add = (n, src = source(n), monster = m, crit = false) => {
        const text = { x: 0, y: 0, currentY: 0, timer: 1.5, text: `-${n}`, isCrit: crit, label: crit ? 'Critical' : null };
        assert.equal(numbers.add(texts, text, monster, src), true); return text;
    };
    const advance = dt => { numbers.advance(dt); for (let i=texts.length-1;i>=0;i--) {
        texts[i].timer -= dt;
        if (texts[i].timer<=0 || numbers.stale(texts[i],monsters)) { numbers.forget(texts[i]); texts.splice(i,1); }
    }};
    return { numbers, texts, m, monsters, add, advance };
}
test('single is immediate; adjacent burst preserves exact sum/count and does not mutate frozen target/source', () => {
    const f=fixture();Object.freeze(f.m);const src=Object.freeze(source(1));const first=f.add(11,src);assert.equal(first.text,'-11');assert.equal(f.numbers.countLabel(first),null);
    f.advance(.1);f.add(17,source(2));assert.equal(f.texts.length,1);assert.equal(first.text,'-28');assert.equal(f.numbers.countLabel(first),'2회');assert.equal(first.timer,T.life);assert.equal(f.m.hp,1000);
});
test('actor, nature, cast, target instance and critical are separate identities', () => {
    const f=fixture();f.add(1);f.add(2,source(2,{actor:'other'}));f.add(3,source(3,{nature:'poison'}));f.add(4,source(4,{cast:'second'}));f.add(5,source(5),target('m'));f.add(6,source(6),f.m,true);assert.equal(f.texts.length,6);
    f.add(7,source(7),f.m,true);assert.equal(f.texts.at(-1).text,'-13');assert.equal(f.numbers.countLabel(f.texts.at(-1)),'Critical · 2회');
});
test('unknown damage origin is never merged; stale actor metadata is never guessed', () => {
    const f=fixture();f.add(1,null);f.add(2,null);assert.equal(f.texts.length,2);
    const valid={classHitId:'actor:epoch:1',barrage:true,barrageLock:{id:'actor:epoch:cast'}};
    assert.equal(monsterNumberSource(f.m,valid).nature,'barrage');
    for(const meta of [null,{}, {...valid,classHitId:'other:epoch:1'}, {...valid,summon:true},{...valid,weaponChain:true},{...valid,cause:'burn'}])assert.equal(monsterNumberSource(f.m,meta),null);
    assert.equal(monsterNumberSource(f.m,{classHitId:'actor:e:1',classPoisonPulse:true,poisonPulse:{castId:'actor:e:poison'}}).nature,'poison');
});
test('gap .75 boundary merges, longer gap starts a fresh number', () => {
    const a=fixture();a.add(1);a.advance(.75);a.add(2);assert.equal(a.texts.length,1);
    const b=fixture();b.add(1);b.advance(.751);b.add(2);assert.equal(b.texts.length,2);
});
test('continuous hits roll over at 1.5s; a label cannot grow or live forever', () => {
    const f=fixture(),births=new Map();let peak=0;
    for(let i=1;i<=600;i++){f.add(1,source(i));for(const text of f.texts){if(!births.has(text))births.set(text,f.numbers.time);assert.ok(f.numbers.time-births.get(text)<T.burst+T.life+1e-6);assert.ok(-Number(text.text)<=16)}peak=Math.max(peak,f.texts.length);f.advance(.1)}
    assert.ok(peak<=2);f.advance(.81);assert.equal(f.texts.length,0);
});
test('duplicate active event cannot inflate display total', () => {
    const f=fixture();f.add(7,source(1));f.advance(.1);f.add(7,source(1));assert.equal(f.texts.length,1);assert.equal(f.texts[0].text,'-7');assert.equal(f.numbers.countLabel(f.texts[0]),null);
});
test('death seals a group; revived same instance and reused ID cannot inherit it', () => {
    const f=fixture();f.add(1);f.m.hp=0;f.add(2);const dying=f.texts[0];assert.equal(dying.text,'-3');f.m.isDead=true;f.advance(.1);assert.equal(f.texts.length,1);
    f.m.hp=1000;f.m.isDead=false;f.advance(.01);assert.equal(f.texts.length,0);f.add(4);const fresh=target('m');f.monsters.set('m',fresh);f.advance(.01);assert.equal(f.texts.length,0);f.add(5,source(5),fresh);assert.equal(f.texts[0].text,'-5');
});
test('removed monster, changed ID and map clearing drop owned references', () => {
    const f=fixture();f.add(1);f.monsters.clear();f.advance(.01);assert.equal(f.texts.length,0);
    f.monsters.set('m',f.m);f.add(2);f.m.id='new';f.advance(.01);assert.equal(f.texts.length,0);
    f.m.id='m';f.add(3);const personal={text:'+1'};f.texts.push(personal);const released=[];f.numbers.clear(f.texts,x=>released.push(x));assert.equal(released.length,1);assert.deepEqual(f.texts,[personal]);assert.equal(f.numbers.time,0);
});
test('pool reuse cannot retain aggregation or fading state', () => {
    const f=fixture();const entry=f.add(1);f.advance(.1);f.add(2);f.numbers.clear(f.texts);entry.text='BLOCK';entry.timer=.05;assert.equal(f.numbers.alpha(entry),1);assert.equal(f.numbers.countLabel(entry),null);
    entry.text='-5';entry.timer=1.5;f.numbers.add(f.texts,entry,f.m,source(3));assert.equal(f.numbers.countLabel(entry),null);
});
test('only final .15s fades; personal damage, heal, costs and BLOCK retain legacy 1.5s', () => {
    const f=fixture();const hit=f.add(1);f.advance(.65);assert.ok(Math.abs(f.numbers.alpha(hit)-1)<1e-8);f.advance(.075);assert.ok(Math.abs(f.numbers.alpha(hit)-.5)<1e-8);
    const scene={floatingTexts:[],monsterDamageNumbers:new Numbers()};for(const text of ['-10','+10','-7','BLOCK'])WorldScene.prototype.addDamageText.call(scene,0,0,text,'red',false,null);
    assert.equal(scene.floatingTexts.length,4);for(const t of scene.floatingTexts){assert.equal(t.timer,1.5);assert.equal(scene.monsterDamageNumbers.alpha(t),1)}
});
test('huge integer totals are not rounded through aggregation', () => {
    const f=fixture();f.add(Number.MAX_SAFE_INTEGER,source(1));f.add(1,source(2));assert.equal(f.texts.length,2);
});
test('real WorldScene cleanup and successful exit release managed text references', async () => {
    const f=fixture();f.add(1);const released=[];
    const scene=Object.create(WorldScene.prototype);
    Object.assign(scene,{floatingTexts:f.texts,monsterDamageNumbers:f.numbers,sparks:[],projectiles:[],explosions:[],monsterMissileQueue:[],game:{textPool:{release:t=>released.push(t)}},remotePlayers:new Map(),waitForPendingZoneTransition:async()=>{},_shouldSkipFinalProfileSaveOnExit:()=>true,_networkHandlerBindings:[]});
    scene._clearTransientWorldEffects();assert.equal(f.texts.length,0);assert.equal(f.numbers.time,0);assert.equal(released.length,1);
    f.add(2);await scene.exit();assert.equal(f.texts.length,0);assert.equal(released.length,2);
});
