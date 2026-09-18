import test from 'node:test';
import assert from 'node:assert/strict';
import Monster from '../src/js/entities/Monster.js';
import { drawMonsterSkillVfx } from '../src/js/effects/MonsterSkillVfxRenderer.js';

globalThis.window = {};
function monster(host = true) {
    window.game = { net: { isHost: host }, ui: {}, zone: { width: 3200, height: 3200 } };
    const m = new Monster(1000, 1000, { id: 'slime', visual: { width: 48, height: 64 } });
    m.ready = true;
    return m;
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

for (let index = 0; index < 8; index += 1) {
    test(`charge warning, motion and trail agree at ${index * 45} degrees`, () => {
        const m = monster();
        const angle = index * Math.PI / 4;
        const nx = Math.cos(angle), ny = Math.sin(angle);
        const target = { x: m.x + nx * 103, y: m.y + ny * 103 };
        m.startCharge(target.x, target.y);
        let lane;
        const effects = [];
        m._drawTelegraphLane = (...args) => { lane = args.slice(1, 5); };
        m._drawSkillVfx = (...args) => effects.push(args);
        m.renderTelegraph({});
        assert.deepEqual(lane, [1000, 1000, target.x, target.y]);
        m.knockback = { vx: 150, vy: -190 };
        m.update(0.1);
        near(m.x, 1000); near(m.y, 1000);
        m.chargeTimer = 0;
        m.update(0.1);
        for (let step = 0; step < 3; step += 1) {
            const previous = { x: m.x, y: m.y };
            m.update(0.1);
            near((m.x - 1000) * ny - (m.y - 1000) * nx, 0);
            assert.ok((m.x - previous.x) * nx + (m.y - previous.y) * ny >= -1e-7);
        }
        near(m.x, target.x); near(m.y, target.y);
        effects.length = 0;
        m._renderChargeTrail({}, m.x, m.y, 90);
        assert.equal(effects.length, 3);
        for (const args of effects) {
            assert.ok((args[3] - m.x) * nx + (args[4] - m.y) * ny < 0, 'trail belongs behind the dash');
            assert.equal(args[9] ?? 0, 0, 'upright atlas must not rotate');
            assert.equal(args[10] ?? false, false, 'upright atlas must not mirror');
        }
        m.update(0.01);
        assert.equal(m.chargeState, 'idle');
    });
}

test('modal pause resumes a dash and stale guest corrections cannot reverse or turn it', () => {
    const m = monster();
    m.startCharge(700, 1000);
    m.chargeTimer = 0;
    m.update(0.05);
    const before = m.x;
    window.game.ui.isPaused = true;
    m.update(0.1);
    near(m.x, before);
    window.game.ui.isPaused = false;
    m.update(0.05);
    assert.ok(m.x < before);
    window.game.net.isHost = false;
    m.targetX = 1400; m.targetY = 1500;
    const guestBefore = m.x;
    m.update(0.05);
    assert.ok(m.x <= guestBefore);
    near(m.y, 1000);
});

test('charge hits the player center across a long frame and stops at its endpoint', () => {
    const m = monster();
    m.chargeSpeed = 1500;
    let hits = 0;
    window.game.net.sendPlayerDamage = () => { hits += 1; };
    window.game.localPlayer = { id: 'player', x: 1076, y: 976, width: 48, height: 48 };
    m.startCharge(1100, 1000);
    m.chargeTimer = 0;
    m.update(0.1);
    assert.equal(hits, 1);
    assert.equal(m.chargeState, 'idle');
    near(m.x, 1100); near(m.y, 1000);
});

test('a remote charging snapshot starts movement without waiting for the local cast timer', () => {
    const m = monster(false);
    m.startCharge(700, 1000);
    m.chargeState = 'charging';
    m.chargeTimer = 0.01;
    m.targetX = 980;
    m.targetY = 1040;
    m.update(0.1);
    assert.equal(m.chargeState, 'charging');
    assert.ok(m.chargeTimer > 0.5);
    assert.ok(m.x < 1000);
    near(m.y, 1000);
});

test('line impacts remain upright and retain destinations on the zero coordinate', () => {
    const m = monster();
    const effects = [];
    let lane;
    m._drawSkillVfx = (...args) => effects.push(args);
    m._drawTelegraphLane = (...args) => { lane = args.slice(1, 5); };
    m._drawBossTelegraphLine({}, { x1: 100, y1: 200, x2: 0, y2: 0, width: 30 },
        { elapsedMs: 1100, warningMs: 1000, effect: 'water' }, 1, 0.3, false);
    assert.deepEqual(lane, [100, 200, 0, 0]);
    assert.ok(effects.length > 1);
    for (const args of effects) {
        near(args[4], args[3] * 2);
        assert.equal(args[9] ?? 0, 0);
        assert.equal(args[10] ?? false, false);
    }
});

test('zero-distance charges stay put and charge telegraphs draw only one origin effect', () => {
    const m = monster();
    m.startCharge(m.x, m.y);
    m.chargeTimer = 0;
    m.update(0.1); m.update(0.1);
    near(m.x, 1000); near(m.y, 1000);
    assert.equal(m.chargeState, 'idle');
    let draws = 0;
    m.startCharge(1300, 1000);
    m._drawSkillVfx = () => { draws += 1; };
    m._drawTelegraphLane = () => {};
    m.renderTelegraph({});
    m._renderCombatCastCircle({}, m.x, m.y, 90);
    assert.equal(draws, 2, 'one origin effect and one destination effect');
});

test('atlas crops contain each water effect ground without a strip from the preceding frame', () => {
    globalThis.Image = class { naturalWidth = 1254; naturalHeight = 1254; };
    let source;
    const ctx = {
        globalAlpha: 1, save() {}, restore() {}, translate() {},
        drawImage(_image, x, y, width, height) { source = { x, y, width, height }; }
    };
    // Last opaque ground rows measured in the shipped WebP, independent of the
    // renderer's cell metadata. Equal-height slicing cuts across these pixels.
    const waterGroundRows = [319, 653, 950, 1190];
    for (let frame = 0; frame < 4; frame += 1) {
        assert.equal(drawMonsterSkillVfx(ctx, 'water', frame, 0, 0, 100, 100), true);
        assert.ok(source.y + source.height > waterGroundRows[frame], `frame ${frame} clips its own ground`);
        if (frame > 0) assert.ok(source.y > waterGroundRows[frame - 1], `frame ${frame} includes the preceding frame`);
    }
    drawMonsterSkillVfx(ctx, 'rift', 0, 0, 0, 100, 100);
    assert.deepEqual(source, { x: 0, y: 0, width: 1254, height: 1254 }, 'the separate rift atlas keeps its full frame');
    delete globalThis.Image;
});
