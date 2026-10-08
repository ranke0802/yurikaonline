import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UIManager } from '../src/js/ui/UIManager.js';
import { classTutorial } from '../src/js/core/ClassTutorial.js';
import { classGrowthGuidance, classStatInsight } from '../src/js/core/ClassGrowthGuidance.js';
import { getClassAttackPower } from '../src/js/core/ClassAttackStats.js';
import { drawSummonIdentity, summonRelationship } from '../src/js/ui/SummonIdentity.js';

const source = JSON.parse(readFileSync('assets/data/tutorials/basic_training.json'));
for (const [id, stat] of Object.entries({wizard:'intelligence',witch:'intelligence',warrior:'vitality',archer:'agility'})) {
    test(`${id}: tutorial selects a real attack stat without changing step IDs, rewards or attack-use conditions`, () => {
        const original = JSON.stringify(source), data = classTutorial(source,id), guide = classGrowthGuidance(id);
        const preview = data.steps.find(s=>s.id==='preview_status_change');
        assert.equal(preview.target,stat); assert.equal(guide.stat,stat);
        for(const focus of Object.values(preview.focus)) assert.deepEqual(focus.targets,[`#status-${stat}-row`]);
        assert.deepEqual(preview.highlightTargets,[`#status-${stat}-row`]);
        assert.ok(preview.instructionMobile.includes(guide.label));
        const stats={vitality:3,intelligence:3,wisdom:2,agility:3};
        assert.equal(getClassAttackPower(id,{...stats,[stat]:stats[stat]+1})-getClassAttackPower(id,stats),1);
        if(id==='wizard'||id==='witch') {
            assert.match(preview.instruction,/지혜 2마다 공격력 \+1/);
            assert.equal(getClassAttackPower(id,{...stats,wisdom:4})-getClassAttackPower(id,stats),1);
            assert.match(classStatInsight(id,'wisdom'),/2마다 공격력/);
        }
        assert.deepEqual(data.steps.map(s=>[s.id,s.trigger,s.count,s.onStart,s.onComplete]),source.steps.map(s=>[s.id,s.trigger,s.count,s.onStart,s.onComplete]));
        assert.equal(JSON.stringify(source),original,'no cached source or saved quest mutation');
    });
}

function hudFixture() {
    const player={classId:'witch',hp:10,maxHp:45,mp:30,maxMp:50,level:1,exp:0,maxExp:100};
    const slots={available:4,maximum:4}; player.classCombat={controller:{orbSlots:()=>slots}};
    const ui=Object.create(UIManager.prototype), writes=[], attrs=new Map(), classes=new Set();
    const text={_text:'',get textContent(){return this._text},set textContent(v){this._text=v;writes.push(['text',v])}};
    const button={getAttribute:k=>attrs.get(k),setAttribute(k,v){attrs.set(k,v);writes.push(['attr',k,v])},classList:{contains:k=>classes.has(k),toggle(k,on){on?classes.add(k):classes.delete(k);writes.push(['class',k,on])}}};
    const overlay={dataset:{cdAngle:'0'},style:{setProperty(){writes.push(['style'])}}};
    Object.assign(ui,{game:{localPlayer:player},getCooldownRefs(){this.lookups=(this.lookups||0)+1;return{button,overlay,timeText:text}},updateStats(hp,mp,level,exp){const player=this.game.localPlayer;this.updates=(this.updates||0)+1;this.lastHudSnapshot={hpCur:String(Math.floor(player.hp)),hpMax:String(player.maxHp),mpCur:String(Math.floor(player.mp)),mpMax:String(player.maxMp),level:String(level),exp:Number(exp).toFixed(2)};}});
    return {ui,player,slots,text,button,writes};
}
test('resource/count changes bypass timers; stable frames avoid even cooldown DOM lookups',()=>{
    const {ui,player,slots,text,button,writes}=hudFixture(); ui.syncCombatHud();
    assert.equal(text.textContent,'4/4'); const lookups=ui.lookups,updates=ui.updates;writes.length=0;
    for(let i=0;i<120;i++)ui.syncCombatHud();
    assert.equal(ui.lookups,lookups);assert.equal(ui.updates,updates);assert.deepEqual(writes,[]);
    slots.available=0;ui.syncCombatHud();assert.equal(text.textContent,'0/4');assert.ok(button.classList.contains('disabled'));
    player.hp=13;slots.available=1;ui.syncCombatHud();
    assert.equal(ui.lastHudSnapshot.hpCur,'13');assert.equal(text.textContent,'1/4');assert.equal(button.classList.contains('disabled'),false);
    slots.available=slots.maximum=3;ui.syncCombatHud();assert.equal(text.textContent,'3/3');
    player.hp=13.1;writes.length=0;const n=ui.updates;ui.syncCombatHud();assert.equal(ui.updates,n);assert.deepEqual(writes,[]);
    player.hp=14;ui.syncCombatHud();assert.equal(ui.lastHudSnapshot.hpCur,'14');
    const snapshot={...player,activeClassId:'witch'};assert.equal(snapshot.hp,14,'HUD does not alter gameplay state');
});
test('periodic cooldown rendering does not churn the stable orb label or mix profiles',()=>{
    const {ui,player,slots,writes,button}=hudFixture();ui.syncCombatHud();writes.length=0;
    ui.updateLifeOrbCount(player,true);assert.deepEqual(writes,[]);
    player.classId='warrior';ui.syncCombatHud();assert.equal(ui._lifeOrbHud,null);
    player.classId='witch';slots.available=2;ui.syncCombatHud();assert.equal(button.getAttribute('aria-label'),'생명의 구슬 2/4');
    ui.game.localPlayer={...player,hp:40};ui.syncCombatHud();assert.equal(ui.lastHudSnapshot.hpCur,'40');
});
test('summon relation distinguishes own/party/neutral/hostile owners',()=>{
    const local={id:'me',party:{members:['me','friend']},canAttackTarget:e=>e.id==='enemy'};
    assert.equal(summonRelationship(local,local),'owned');
    assert.equal(summonRelationship(local,{id:'friend'}),'ally');
    assert.equal(summonRelationship(local,{id:'other'}),'other');
    assert.equal(summonRelationship(local,{id:'enemy'}),'hostile');
    assert.equal(summonRelationship(local,{id:'friend',canAttackTarget:()=>true}),'hostile','hostility overrides party label');
});
test('summon identity is UI-only, bounded, and restores canvas state',()=>{
    const calls=[],ctx={save(){calls.push('save')},restore(){calls.push('restore')},measureText:()=>({width:65}),fillRect(...a){calls.push(a)},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},fillText(t){calls.push(t)}};
    const actor={x:30.4,y:80.8,hp:36,maxHp:50},visual={sprite:{},height:64};const before=JSON.stringify(actor);
    const result=drawSummonIdentity(ctx,actor,visual,'owned');
    assert.equal(result.ratio,.72);assert.equal(result.label,'내 소환수');assert.ok(result.y+result.height<actor.y-visual.height/2);
    assert.equal(calls[0],'save');assert.equal(calls.at(-1),'restore');assert.equal(JSON.stringify(actor),before);
    assert.equal(drawSummonIdentity(ctx,{...actor,hp:0},visual),null);
    assert.equal(drawSummonIdentity(ctx,actor,{height:64}),null);
});
