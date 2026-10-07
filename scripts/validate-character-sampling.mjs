import test from 'node:test';
import assert from 'node:assert/strict';
import { drawCharacterFrame } from '../src/js/core/CharacterFrameRenderer.js';
import { Sprite } from '../src/js/core/Sprite.js';
import { drawAuthoredClassBody } from '../src/js/combat/AuthoredCharacterFrames.js';
import { drawWizardAttack } from '../src/js/combat/WizardAttackFrames.js';
import { drawShieldRushBody } from '../src/js/combat/ShieldRush.js';

function context(scale = 1) {
    return { imageSmoothingEnabled: false, imageSmoothingQuality: 'low', calls: [],
        getTransform: () => ({ a: scale, b: 0, c: 0, d: scale, e: .3, f: .6 }),
        drawImage(...args) { this.calls.push({ args, smoothing: this.imageSmoothingEnabled, quality: this.imageSmoothingQuality }); }
    };
}
test('character reductions filter source pixels while native/enlarged frames stay crisp', () => {
    for (const [scale, filtered] of [[.7, true], [1, true], [1.85, true], [2, true], [256 / 120, false], [3, false]]) {
        const ctx = context(scale), args = [{ width: 1536, height: 3072 }, 256, 512, 256, 256, 20.3, 30.7, 120, 120];
        drawCharacterFrame(ctx, ...args);
        assert.deepEqual(ctx.calls[0].args, args, 'source frame, geometry and pivot are unchanged');
        assert.equal(ctx.calls[0].smoothing, filtered);
        assert.equal(ctx.calls[0].quality, 'high');
        assert.equal(ctx.imageSmoothingEnabled, false); assert.equal(ctx.imageSmoothingQuality, 'low');
    }
});
test('rotated transforms use actual pixel scale, and exceptions restore world sampling', () => {
    const ctx = context(); ctx.getTransform = () => ({ a: 0, b: 1, c: -1, d: 0 });
    drawCharacterFrame(ctx, {}, 0, 0, 256, 256, 0, 0, 120, 120);
    assert.equal(ctx.calls[0].smoothing, true);
    ctx.drawImage = () => { throw new Error('fixture'); };
    assert.throws(() => drawCharacterFrame(ctx, {}, 0, 0, 256, 256, 0, 0, 120, 120));
    assert.equal(ctx.imageSmoothingEnabled, false); assert.equal(ctx.imageSmoothingQuality, 'low');
});
test('legacy player/remote sheets opt in without changing monster Sprite sampling or snapping', () => {
    const image = { width: 2048, height: 1280 }, ctx = context(1.5);
    const character = new Sprite(image, 8, 5, { character: true }), monster = new Sprite(image, 8, 5);
    character.draw(ctx, 1, 2, 20.3, 30.7, 120, 120);
    monster.draw(ctx, 1, 2, 20.3, 30.7, 120, 120);
    assert.equal(ctx.calls[0].smoothing, true); assert.equal(ctx.calls[1].smoothing, false);
    assert.deepEqual(ctx.calls[0].args, ctx.calls[1].args, 'existing pixel-grid alignment is preserved');
    assert.equal(ctx.imageSmoothingEnabled, false);
});
test('every authored class body, Mage attack and Warrior shield rush use the same quality path', () => {
    const ctx = context(1.3), body = { width: 1536, height: 3072 };
    for (const classId of ['witch', 'warrior', 'archer']) {
        assert.equal(drawAuthoredClassBody(body, { classId, direction: 1 }, null, ctx, 20, 30), true);
    }
    assert.equal(drawWizardAttack(ctx, { wizardAttackImage: { width: 1536, height: 2048 }, isAttacking: true, direction: 1 }, 20, 30), true);
    assert.equal(drawShieldRushBody({ width: 720, height: 576 }, { shieldRush: true, direction: 1, age: 0 }, ctx, 20, 30), true);
    assert.equal(ctx.calls.length, 5);
    assert.ok(ctx.calls.slice(0, 4).every(call => call.smoothing && call.quality === 'high'));
    assert.equal(ctx.calls[4].smoothing, false, 'native shield frames are enlarged here, so retain nearest sampling');
    assert.equal(ctx.imageSmoothingEnabled, false);
});
