import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import RenderDiagnostics, { DIAGNOSTIC_LIMITS, sanitizeRenderError } from '../src/js/diagnostics/RenderDiagnostics.js';

function fixture() {
    class Monster { render() {} }
    class Player { render() { this.drawHUD(); } drawHUD() {} }
    class Combat { renderGround() {} render() {} }
    const monster = Object.assign(new Monster(), { id: 'PRIVATE_ID', name: 'PRIVATE_NAME', x: 30, y: 30, width: 48, height: 48 });
    const player = Object.assign(new Player(), { x: 40, y: 40, width: 48, height: 48, classCombat: new Combat() });
    const scene = { player, camera: { x: 0, y: 0, width: 844, height: 390 }, viewMargin: 500,
        monsterManager: { monsters: new Map([[monster.id, monster]]) } };
    const game = { canvas: { width: 844, height: 390 }, dpr: 1, zoom: 1, sceneManager: { currentScene: scene }, zone: { currentZone: {} },
        ctx: { getContextAttributes: () => ({ alpha: false, desynchronized: true, willReadFrequently: false, colorSpace: 'srgb', private: 'SECRET' }) } };
    game.loop = { renderFn() { player.classCombat.renderGround(); monster.render(); player.render(); player.classCombat.render(); } };
    const original = game.loop.renderFn;
    const d = new RenderDiagnostics(game);
    return { d, game, player, monster, scene, original, Player, Monster };
}

test('explicit start only; expected counts are independent; stop restores owned hooks', () => {
    const {d, game, original} = fixture();
    game.loop.renderFn(); assert.equal(d.frames.length, 0); assert.equal(d.exportJSON(), null);
    assert.equal(d.start(), true); assert.equal(d.start(), false);
    game.loop.renderFn(); d.stop(); assert.equal(game.loop.renderFn, original);
    const r = JSON.parse(d.exportJSON());
    assert.equal(r.frameCount, 1); assert.deepEqual(r.frames[0].expected, [1,1,1,1,1]);
    assert.deepEqual(r.frames[0].completed, r.frames[0].expected); assert.equal(r.frames[0].complete, true);
    assert.doesNotMatch(d.exportJSON(), /PRIVATE|SECRET|"x":|"y":|playerId|userAgent/);
    game.loop.renderFn(); assert.equal(d.count, 1);
    d.clear(); assert.equal(d.exportJSON(), null); assert.deepEqual(d.frames, []);
});

test('game exception is rethrown unchanged and incomplete/missing tail passes stay in denominator', () => {
    const {d, game, Player} = fixture();
    const error = new TypeError('PRIVATE_NAME token=SECRET');
    error.stack = 'TypeError: PRIVATE_NAME\n at userFunction (https://secret.test/src/js/entities/Player.js?token=SECRET:42:9)\n at SECRET (https://secret.test/PRIVATE_ID.js:3:1)';
    Player.prototype.drawHUD = () => { throw error; };
    d.start(); assert.throws(() => game.loop.renderFn(), e => e === error); d.stop();
    const r = JSON.parse(d.exportJSON());
    assert.equal(r.frameCount, 1); assert.equal(r.frames[0].complete, false);
    assert.deepEqual(r.frames[0].started, [1,1,1,1,0]);
    assert.deepEqual(r.frames[0].completed, [1,0,0,1,0]);
    assert.deepEqual(r.errors[0], { frame:0, code:'TypeError', stack:[{file:'entities/Player.js',line:42,column:9}] });
    assert.doesNotMatch(d.exportJSON(), /PRIVATE|SECRET|secret.test|userFunction|token|https:/);
});

test('sanitizer drops unknown names, messages, functions and paths and caps stack', () => {
    const safe = sanitizeRenderError({ name:'PRIVATE_NAME', stack:'SECRET\n' + 'at PRIVATE (https://secret.test/src/js/entities/Monster.js?q=SECRET:12:3)\n'.repeat(100) });
    assert.equal(safe.code, 'Error'); assert.equal(safe.stack.length, 3);
    assert.doesNotMatch(JSON.stringify(safe), /PRIVATE|SECRET|https|secret/);
    assert.deepEqual(sanitizeRenderError({name:'TypeError',stack:'PRIVATE@https://secret.test/src/js/entities/Player.js?token=SECRET:8:2'}),
        {code:'TypeError',stack:[{file:'entities/Player.js',line:8,column:2}]});
});

test('returns normally but skips a pass: expected stays nonzero', () => {
    const {d, game, player} = fixture();
    game.loop.renderFn = () => { player.render(); };
    d.start(); game.loop.renderFn(); d.stop();
    const f = JSON.parse(d.exportJSON()).frames[0];
    assert.deepEqual(f.expected, [1,1,1,1,1]); assert.deepEqual(f.completed, [0,1,1,0,0]);
});

test('20 second deadline, fixed buffer/error ceilings and clear stop recording', () => {
    const {d, game} = fixture(); d.start(); d.startedAt -= 20001;
    game.loop.renderFn(); assert.equal(d.active, false); assert.equal(d.reason, 'timeout'); assert.equal(d.count, 0);
    d.start(); for (let i=0;i<DIAGNOSTIC_LIMITS.frames+3;i++) game.loop.renderFn();
    assert.equal(d.active, false); assert.equal(d.reason, 'buffer_full'); assert.equal(d.count, 2048);
    assert.equal(d.frames.length, 2048); assert.ok(Buffer.byteLength(d.exportJSON()) < 1024 * 1024);
    d.clear(); assert.equal(d.count, 0);
    game.loop.renderFn = () => { throw new Error('SECRET'); };
    d.start(); for (let i=0;i<40;i++) assert.throws(() => game.loop.renderFn());
    d.stop(); assert.equal(d.errors.length, 32); assert.equal(d.errorsDropped, 8);
});

test('recorder failure never prevents game rendering or hides original game errors', () => {
    const {d, game, Player} = fixture(); let calls = 0;
    game.loop.renderFn = () => { calls++; };
    d._begin = () => { throw new Error('recorder failure'); };
    d.start(); game.loop.renderFn(); assert.equal(calls, 1); assert.equal(d.active, false); assert.equal(d.reason, 'recorder_error');
    const error = new Error('game error'); game.loop.renderFn = () => { throw error; };
    d.start(); assert.throws(() => game.loop.renderFn(), e => e === error); assert.equal(d.reason, 'recorder_error');
    const f = fixture(); f.Player.prototype.drawHUD = () => { throw error; }; f.d._error = () => { throw new Error('recorder error'); };
    f.d.start(); assert.throws(() => f.game.loop.renderFn(), e => e === error); assert.equal(f.d.active, false);
});

test('cleanup respects a newer hook owner and bounded inspection stops cleanly', () => {
    const {d, game, original, scene, Monster} = fixture(); d.start(); game.loop.renderFn();
    const wrapper = game.loop.renderFn, replacement = () => wrapper(); game.loop.renderFn = replacement;
    d.stop(); assert.equal(game.loop.renderFn, replacement); replacement();
    game.loop.renderFn = original;
    for(let i=0;i<513;i++)scene.monsterManager.monsters.set(i, Object.assign(new Monster(), {id:i,x:1,y:1}));
    d.start(); game.loop.renderFn(); assert.equal(d.reason, 'entity_limit'); assert.equal(d.hooks.length, 0);
});

test('production recorder has no persistence, transport, framebuffer readback or context option mutation', () => {
    const src=readFileSync('src/js/diagnostics/RenderDiagnostics.js','utf8');
    assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|getImageData|\.getContext\(/);
    const main=readFileSync('src/js/main.js','utf8');
    assert.match(main, /getContext\('2d', \{ alpha: false, desynchronized: true \}\)/);
});
