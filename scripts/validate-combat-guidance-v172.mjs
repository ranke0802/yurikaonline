import test from 'node:test';
import assert from 'node:assert/strict';
import { UIManager } from '../src/js/ui/UIManager.js';
import { skillAvailability } from '../src/js/ui/SkillAvailability.js';
import Controller from '../src/js/combat/ClassCombatController.js';
import Bridge from '../src/js/combat/ClassCombatBridge.js';
import Player from '../src/js/entities/Player.js';

function guidance() {
    const rows = [];
    const ui = Object.assign(Object.create(UIManager.prototype), {
        game: { localPlayer: {}, sceneManager: { currentScene: {} } },
        logSystemMessage(text) { const entry = { text, isConnected: true }; rows.push(entry); return entry; }
    });
    return { ui, rows };
}
test('same combat rejection never displaces intervening ordinary chat; changed reasons are immediate', () => {
    const { ui, rows } = guidance();
    ui.logSystemMessage('normal before');
    for (let i = 0; i < 60; i++) ui.logCombatFailure('HP shortage');
    ui.logSystemMessage('normal during');
    for (let i = 0; i < 60; i++) ui.logCombatFailure('HP shortage');
    assert.deepEqual(rows.map(x => x.text), ['normal before', 'HP shortage', 'normal during']);
    ui.logCombatFailure('space blocked');
    ui.logCombatFailure('HP shortage');
    assert.deepEqual(rows.slice(-2).map(x => x.text), ['space blocked', 'HP shortage']);
    ui.logSystemMessage('normal during');
    assert.equal(rows.filter(x => x.text === 'normal during').length, 2);
});
test('success/cancel reset, player/scene reentry and trimmed history can show a fresh failure', () => {
    const { ui, rows } = guidance();
    ui.logCombatFailure('blocked');
    ui.clearCombatFailure(); ui.logCombatFailure('blocked');
    ui.game.localPlayer = {}; ui.logCombatFailure('blocked');
    ui.game.sceneManager.currentScene = {}; ui.logCombatFailure('blocked');
    rows.at(-1).isConnected = false; ui.logCombatFailure('blocked');
    assert.equal(rows.length, 5);
    ui.logCombatFailure(''); assert.equal(rows.length, 5);
});
test('guidance remains safe while local player and scene are absent during teardown', () => {
    const { ui, rows } = guidance();
    ui.game = {};
    ui.logCombatFailure('blocked');
    ui.logCombatFailure('blocked');
    assert.equal(rows.length, 1);
    ui.clearCombatFailure(); ui.logCombatFailure('blocked');
    assert.equal(rows.length, 2);
});
test('host restore wait is read-only and does not forbid self/support skills or fabricate disconnected wait', () => {
    for (const [classId, affected] of Object.entries({ wizard: ['j','h','u'], witch: ['j','h'], warrior: ['j','h','u'], archer: ['j','h','k'] })) {
        const c = Object.freeze({ time: 0, cooldowns: Object.freeze({}), rage: 100 });
        const p = Object.freeze({ classId, hp: 100, maxHp: 100, mp: 100,
            classCombat: Object.freeze({ controller: c, paused: () => false }),
            skillCooldowns: Object.freeze({}), getMagicMissileManaCost: () => 4, getFireballManaCost: () => 12 });
        for (const key of ['j','h','u','k']) {
            const reason = skillAvailability(p, key, { monsterManager: { isMonsterCombatBlocked: () => true } });
            assert.equal(reason.code, affected.includes(key) ? 'authority' : '');
            if (reason.code) { assert.equal(reason.hint, true); assert.match(reason.detail, /몬스터 피해/); }
            assert.equal(skillAvailability(p, key, { monsterManager: { isMonsterCombatBlocked: () => false } }).code, '');
        }
    }
});
test('Fireball busy explanation matches the existing short-cast guard, not interruptible lightning', () => {
    const p = { classId: 'wizard', hp: 100, mp: 100, isChanneling: true, skillAttackTimer: .4,
        skillCooldowns: {}, getMagicMissileManaCost: () => 4, getFireballManaCost: () => 12 };
    assert.equal(skillAvailability(p, 'u').code, 'casting');
    assert.equal(skillAvailability(p, 'h').code, '');
    p.skillAttackTimer = 0; assert.equal(skillAvailability(p, 'u').code, '');
    p.isChanneling = false; p.mp = 0; assert.equal(skillAvailability(p, 'u').code, 'mp');
});
test('the wait remains visible during recovery without changing the numeric cooldown or self shield', () => {
    const p = Object.freeze({ classId: 'wizard', mp: 100, skillCooldowns: Object.freeze({j: .4, h: 1, u: 2, k: 3}),
        getMagicMissileManaCost: () => 4, getFireballManaCost: () => 12 });
    const game = { monsterManager: { isMonsterCombatBlocked: () => true } };
    for (const key of ['j','h','u']) assert.equal(skillAvailability(p,key,game).code,'authority');
    assert.equal(skillAvailability(p,'k',game).code,'cooldown');
    assert.deepEqual(p.skillCooldowns,{j:.4,h:1,u:2,k:3});
});
test('actual Fireball busy rejection only emits explanation, preserving mana, cooldown and aim', () => {
    const messages = [], previous = globalThis.window;
    globalThis.window = { game: { ui: { logCombatFailure: t => messages.push(t) } } };
    try {
        const p = Object.assign(Object.create(Player.prototype), { isDead: false, isDying: false,
            isChanneling: true, skillAttackTimer: .4, mp: 100, skillCooldowns: { u: 0 }, fireballAimActive: false });
        p.startFireballAim();
        assert.equal(messages.length, 1); assert.match(messages[0], /시전 중/);
        assert.equal(p.mp, 100); assert.equal(p.skillCooldowns.u, 0); assert.equal(p.fireballAimActive, false);
        p.isDead = true; p.startFireballAim(); assert.equal(messages.length, 1);
    } finally { globalThis.window = previous; }
});
test('actual summon failures distinguish unavailable definition and blocked spawn without creating or spending', () => {
    const messages = [], owner = { x: 100, y: 100, hp: 1000, maxHp: 1000 };
    const bridge = Object.assign(Object.create(Bridge.prototype), { owner, definitions: new Map(), actors: [],
        game: { ui: { logCombatFailure: t => messages.push(t) }, sceneManager: { currentScene: { checkCollision: () => true } } } });
    assert.equal(bridge.summon('slime', 1), null); assert.match(messages[0], /정보를 준비/);
    bridge.definitions.set('slime', {});
    assert.equal(bridge.summon('slime', 1), null); assert.match(messages[1], /공간이 없습니다/);
    assert.equal(owner.hp, 1000); assert.equal(bridge.actors.length, 0);
});
test('actual blocked rush leaves resources, cooldown and action unchanged while reporting the exact branch', () => {
    const messages = [], actions = [], owner = { x: 0, y: 0, hp: 100, maxHp: 100, mp: 0, attackPower: 10 };
    const c = new Controller(owner, 'warrior', { canMoveShieldRush: () => false,
        failure: t => messages.push(t), action: (...a) => actions.push(a) });
    c.rage = 33;
    assert.equal(c.skill(1, { x: 100, y: 0 }), false);
    assert.match(messages[0], /앞이 막혀/); assert.deepEqual(c.cooldowns, {});
    assert.equal(c.rage, 33); assert.equal(owner.hp, 100); assert.equal(owner.mp, 0);
    assert.equal(c.shieldRush, undefined); assert.equal(actions.length, 0);
});
