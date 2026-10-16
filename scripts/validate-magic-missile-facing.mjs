import test from 'node:test';
import assert from 'node:assert/strict';
import Player from '../src/js/entities/Player.js';
import RemotePlayer from '../src/js/entities/RemotePlayer.js';
import { sampleWizardAttack } from '../src/js/combat/WizardAttackFrames.js';

function fixture(targets = [], overrides = {}) {
    const packets = [], monsters = new Map(targets.map(target => [target.id, target]));
    const player = Object.assign(Object.create(Player.prototype), {
        id: 'fixture', name: 'fixture', classId: 'wizard', x: -24, y: -24, width: 48, height: 48,
        direction: 1, direction8: 2, facingAngle: Math.PI / 2, vx: 0, vy: 0,
        skillLevels: { missile: 4 }, skillCooldowns: { h: 0 }, mp: 100, critRate: 0,
        missileFireQueue: [], autoAttackEnabled: false, statusEffects: [], joystick: { active: false },
        speed: 180, moveTimer: 0, turnGraceTimer: 0, input: { isPressed: key => key === 'MOVE_LEFT' },
        getWeaponCombatProfile: () => ({}), getEffectiveClassAttackPower: () => 100,
        useMana(cost) { if (this.mp < cost) return false; this.mp -= cost; return true; },
        triggerAction() {}, canAttackTarget: target => target.attackable !== false,
        isAttackTargetStillValid: target => monsters.has(target.id),
        net: { sendChanneling() {}, sendPlayerAttack: (x, y, dir, skillType, extraData) => packets.push({ x, y, dir, skillType, extraData }) },
        ...overrides
    });
    globalThis.window = { game: { localPlayer: player, monsterManager: { monsters }, remotePlayers: new Map(),
        projectiles: [], tutorial: { isActionAllowed: () => true, trigger() {} } } };
    return { player, packets };
}
const enemy = (x, y, extra = {}) => ({ id: 'target', type: 'monster', isMonster: true, x, y, ...extra });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

for (const [dx, dy, direction, direction8] of [
    [1, 0, 3, 0], [1, 1, 1, 1], [0, 1, 1, 2], [-1, 1, 1, 3],
    [-1, 0, 2, 4], [-1, -1, 0, 5], [0, -1, 0, 6], [1, -1, 0, 7]
]) test(`cast faces target (${dx},${dy}) locally and in the remote attack packet`, () => {
    const { player, packets } = fixture([enemy(dx * 200, dy * 200)], { direction: (direction + 1) % 4 });
    player.useSkill(1);
    assert.equal(player.direction, direction); assert.equal(player.direction8, direction8);
    near(player.facingAngle, Math.atan2(dy, dx)); assert.equal(sampleWizardAttack(player).row, direction);
    assert.equal(packets.length, 1); assert.equal(packets[0].dir, direction);
    assert.equal(player.mp, 87); assert.equal(player.missileFireQueue.length, 8);
    assert.equal(player.skillCooldowns.h, 1); assert.equal(player.skillAttackTimer, .4);
    assert.ok(player.missileFireQueue.every(missile => missile.options.damage === 45));
    player._handleMovement(.1); // Holding another movement key cannot turn the cast back.
    assert.equal(player.direction, direction); assert.equal(player.vx, 0); assert.equal(player.vy, 0);
    player.isChanneling = player.isAttacking = false; player.skillAttackTimer = 0;
    player._handleMovement(.1); assert.equal(player.direction, 2); assert.ok(player.vx < 0);
});

test('manual target wins over nearer enemy and PvP target uses its center', () => {
    const selected = enemy(-240, -60, { type: 'player', isMonster: false, width: 80, height: 120 });
    const { player, packets } = fixture([selected, enemy(50, 0, { id: 'closer' })], { currentTarget: selected });
    player.useSkill(1); assert.equal(player.direction, 2); near(player.facingAngle, Math.PI);
    assert.equal(packets[0].extraData.targetX, -200); assert.equal(packets[0].extraData.targetY, 0);
});

for (const [label, targets, overrides] of [
    ['no target', [], {}], ['dead target', [enemy(-100, 0, { isDead: true })], {}],
    ['out of range', [enemy(-700, 0)], {}], ['friendly target', [enemy(-100, 0, { attackable: false })], {}],
    ['no mana', [enemy(-100, 0)], { mp: 0 }], ['cooldown', [enemy(-100, 0)], { skillCooldowns: { h: .5 } }],
    ['dead caster', [enemy(-100, 0)], { isDead: true }]
]) test(`${label} does not rotate or send an attack`, () => {
    const { player, packets } = fixture(targets, overrides); player.useSkill(1);
    assert.equal(player.direction, 1); near(player.facingAngle, Math.PI / 2); assert.equal(packets.length, 0);
});
test('overlapping target keeps the last meaningful facing', () => {
    const { player } = fixture([enemy(0, 0)]); player.useSkill(1);
    assert.equal(player.direction, 1); near(player.facingAngle, Math.PI / 2);
});

test('turning preserves the original launch fan and remote visuals replay it', async () => {
    const originalRandom = Math.random;
    Math.random = () => .5;
    RemotePlayer.projectilePromise = import('../src/js/entities/Projectile.js');
    try {
        await RemotePlayer.projectilePromise;
        for (const [vx, vy] of [[0, 0], [-180, 0], [120, -120]]) {
            const { player, packets } = fixture([enemy(200, 0)], { vx, vy });
            const oldLaunchAngle = (vx || vy ? Math.atan2(vy, vx) : Math.PI / 2) + Math.PI;
            player.useSkill(1);
            near(packets[0].extraData.launchAngle, oldLaunchAngle);
            const remote = Object.assign(Object.create(RemotePlayer.prototype), { id: 'remote', width: 48, height: 48,
                direction: 0, missileVisualQueue: [], missileVisualTimer: 0 });
            remote.triggerAttack(packets[0]);
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(remote.direction, 3); assert.equal(sampleWizardAttack(remote).row, 3);
            assert.equal(remote.missileVisualQueue.length, 8);
            for (let i = 0; i < 8; i++) {
                const expected = oldLaunchAngle + (i - 3.5) * ((Math.PI * 4 / 9) / 7);
                const missile = player.missileFireQueue[i].options;
                near(missile.vx, Math.cos(expected) * 500); near(missile.vy, Math.sin(expected) * 500);
                near(remote.missileVisualQueue[i].angle, expected);
            }
            remote.missileVisualQueue = [];
            remote._triggerRemoteMissileVisual(0, 0, 1, {});
            near(remote.missileVisualQueue[0].angle, Math.PI); // Old clients omit launchAngle.
        }
    } finally { Math.random = originalRandom; }
});
