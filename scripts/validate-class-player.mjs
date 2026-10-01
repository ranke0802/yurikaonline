import test from 'node:test';
import assert from 'node:assert/strict';
import Player from '../src/js/entities/Player.js';
import TouchHandler from '../src/js/core/input/TouchHandler.js';
function fixture(id='witch') {
    globalThis.window={game:{ui:{},tutorial:{isActionAllowed:()=>true},zone:{currentZone:{id:'zone_1'}}}};
    const p=new Player(0,0,'fixture',{id,baseStats:{maxHp:100,atk:10}});
    const calls=[];
    p.classCombat={paused:()=>false,basic:o=>{calls.push(o);return true;},skill:()=>true,multipliers:()=>({attack:1,attackSpeed:1,move:1}),controller:{enemies:()=>[],time:0,cooldowns:{1:5,2:6,3:7}}};
    return {p,calls};
}
test('tap releases exactly once, held attack uses aimed path, cancel clears pending',()=>{
    const {p,calls}=fixture();p.startClassAction('ATTACK');p.releaseClassAction('ATTACK');p.releaseClassAction('ATTACK');
    assert.equal(calls.length,1);assert.equal(calls[0].aimed,false);
    p.startClassAction('ATTACK');p.classAim.elapsed=.5;p.releaseClassAction('ATTACK');assert.equal(calls[1].aimed,true);
    p.startClassAction('ATTACK');p.classAim=null;p.releaseClassAction('ATTACK');assert.equal(calls.length,2);
});
test('archer leap has .2-second aimed threshold; touch drag controls direction',()=>{
    const {p,calls}=fixture('archer');p.classCombat.controller.empowered=true;p.startClassAction('ATTACK',{clientX:10,clientY:10});
    p.moveClassAim({clientX:10,clientY:-90});p.classAim.elapsed=.2;p.releaseClassAction('ATTACK');
    assert.equal(calls[0].aimed,true);assert.equal(calls[0].x,0);assert.equal(calls[0].y,-600);
});
test('new class skill upgrades reject unknown/basic/maxed keys without spending shared currency',()=>{
    const {p}=fixture();p.manastone=999999;p.skillLevels.summon=8;
    assert.equal(p.increaseSkill('laser'),false);assert.equal(p.increaseSkill('lifeDrain'),false);assert.equal(p.increaseSkill('summon'),false);
    assert.equal(p.manastone,999999);assert.equal(p.skillLevels.laser,undefined);
});
test('legacy staff equipment restriction and explicit class weapon support',()=>{
    const {p}=fixture('warrior');assert.equal(p.canEquipWeapon({slot:'weapon',type:'magic_staff'}),false);
    assert.equal(p.canEquipWeapon({slot:'weapon',allowedClasses:['warrior']}),true);
    p.classId='witch';assert.equal(p.canEquipWeapon({slot:'weapon',type:'magic_staff'}),true);
});
test('profile writer isolates class progression and preserves shared inventory patch',async()=>{
    const {p}=fixture();p.id='test';p.classProfiles={archer:{level:9}};p.level=3;p.skillLevels.summon=4;
    let saved;p.net={savePlayerDataPatch:async(id,patch)=>{saved=patch;return {ok:true};}};
    await p.saveProfilePatch(['level','skillLevels','inventory']);assert.equal(saved.level,undefined);
    assert.equal(saved.classProfiles.witch.level,3);assert.equal(saved.classProfiles.witch.skillLevels.summon,4);
    assert.equal(saved.classProfiles.archer.level,9);assert.ok(Array.isArray(saved.inventory));assert.equal(saved.activeClassId,undefined,'ordinary saves do not overwrite explicit class selection');
});
test('Mage keeps original touch behavior; new classes aim all four action buttons',()=>{
    const {p}=fixture('wizard');window.game.localPlayer=p;const t=Object.create(TouchHandler.prototype);
    assert.equal(t.isAimAction('ATTACK'),false);assert.equal(t.isAimAction('SKILL_2'),true);
    p.classId='archer';for(const action of ['ATTACK','SKILL_1','SKILL_2','SKILL_3'])assert.equal(t.isAimAction(action),true);
    assert.equal(t.isAimAction('INVENTORY'),false);
});
test('derived combat buffs restore without accumulation or base stat writes',()=>{
    const {p}=fixture('wizard'),atk=p.attackPower,speed=p.attackSpeed;p.classCombat.multipliers=()=>({attack:1.2,attackSpeed:1.7,move:1.25});
    assert.equal(p.getEffectiveClassAttackPower(),atk*1.2);assert.equal(p.getEffectiveClassAttackPower(),atk*1.2);
    assert.equal(p.getEffectiveClassAttackSpeed(),speed*1.7);assert.equal(p.attackPower,atk);
    p.classCombat.multipliers=()=>({attack:1,attackSpeed:1,move:1});assert.equal(p.getEffectiveClassAttackPower(),atk);
});
test('defensive skill dispatch still handles a zero-HP result from a custom skill hook',()=>{
    const {p}=fixture();p.hp=p.maxHp*.8;let deaths=0;
    p.classCombat.skill=()=>{p.hp-=p.maxHp*.8;return true;};p.die=()=>{deaths++;p.isDead=true;};
    assert.equal(p.useSkill(2),true);assert.equal(p.hp,0);assert.equal(deaths,1);
});
test('touch cancellation emits actual tracked action',()=>{
    const t=Object.create(TouchHandler.prototype);let cancelled;
    Object.assign(t,{joystick:{active:false},stick:null,activeUiActions:new Map(),activeAimAction:{action:'ATTACK'},_hideJoystick(){},emit:(event,data)=>{if(event==='aimCancel')cancelled=data.action;}});
    t.resetState();assert.equal(cancelled,'ATTACK');assert.equal(t.activeAimAction,null);
});
test('new class walking phase follows distance and freezes at an obstacle',()=>{
    const {p}=fixture('warrior');p.state='move';p.isAttacking=false;p.animTimer=0;p.x=100;p.y=100;
    p._updateAnimation(.1);assert.equal(p.animFrame,0);
    p.x+=24;p._updateAnimation(.1);assert.equal(p.animFrame,1);
    p._updateAnimation(.5);assert.equal(p.animFrame,1,'stationary blocked movement cannot cycle feet');
    p.x+=48;p._updateAnimation(.1);assert.equal(p.animFrame,2,'large correction advances at most one pose');
    p.state='idle';p._updateAnimation(.1);assert.equal(p.animFrame,0);
});
