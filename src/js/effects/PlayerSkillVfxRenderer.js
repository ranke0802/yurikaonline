// All textures and color variants are prepared once, before the game loop.
// Drawing only samples those decoded surfaces: no loaders, filters or canvases.
export const PLAYER_SKILL_VFX_ASSETS = Object.freeze({
    fireball: '/assets/resource/effects/player-skills/fireball.webp',
    missile: '/assets/resource/effects/player-skills/missile.webp',
    lightning: '/assets/resource/effects/player-skills/lightning.webp',
    barrier: '/assets/resource/effects/player-skills/barrier.webp'
});
const surfaces = Object.create(null);
let preloadPromise;
const CELL = 192;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const loopFrame = (age, fps, count) => Math.floor(Math.max(0, age) * fps) % count;

function tintOnce(image, hue) {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.filter = `hue-rotate(${hue}deg)`;
    ctx.drawImage(image, 0, 0);
    return canvas;
}

export function preloadPlayerSkillVfx(resources) {
    if (preloadPromise) return preloadPromise;
    preloadPromise = Promise.allSettled(Object.entries(PLAYER_SKILL_VFX_ASSETS).map(async ([name, url]) => {
        const image = await resources.loadImage(url);
        if (image.naturalWidth !== CELL * 4 || image.naturalHeight !== CELL * 4) {
            throw new Error(`Invalid skill atlas dimensions: ${name}`);
        }
        surfaces[name] = image;
        if (name === 'fireball') surfaces.blue_fireball = tintOnce(image, 175);
        if (name === 'missile') surfaces.golden_missile = tintOnce(image, 165);
        if (name === 'lightning') surfaces.crimson_chain = tintOnce(image, 135);
    })).then(results => {
        const failed = results.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
    }).catch(error => {
        // A failed initial load can be retried explicitly, never by render().
        preloadPromise = null;
        throw error;
    });
    return preloadPromise;
}

function texture(kind, variant) {
    return surfaces[variant] || surfaces[kind];
}

export function hasPlayerSkillVfx(kind) {
    return !!surfaces[kind];
}

function frame(ctx, image, index, x, y, width, height, angle = 0, alpha = 1, anchorX = 0.5, anchorY = 0.5) {
    if (!image || alpha <= 0) return false;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha *= clamp(alpha, 0, 1);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, (index % 4) * CELL, Math.floor(index / 4) * CELL, CELL, CELL,
        -width * anchorX, -height * anchorY, width, height);
    ctx.restore();
    return true;
}

export function drawSkillProjectile(ctx, kind, x, y, radius, angle, trail, options = {}) {
    const image = texture(kind, options.variant);
    if (!image) return false;
    const age = options.age || 0;
    const index = loopFrame(age, 16, 8);
    const size = Math.max(kind === 'missile' ? 66 : 82, radius * (kind === 'missile' ? 12 : 8));
    // Ghosts follow recorded world positions, so a homing projectile's wake
    // bends with its actual path instead of pointing through its next target.
    const count = options.reducedEffects ? 1 : 3;
    for (let i = count; i > 0; i--) {
        const t = trail?.[Math.min((trail?.length || 0) - 1, i * 3 - 1)];
        if (!t || Math.hypot(x - t.x, y - t.y) < 3) continue;
        const wakeAngle = Math.atan2(y - t.y, x - t.x);
        frame(ctx, image, index, t.x, t.y, size * 0.85, size * 0.85, wakeAngle, 0.13 / i, 0.8, 0.51);
    }
    // Authored projectiles point right; the bright head, not the square cell's
    // center, is attached to the projectile's authoritative collision point.
    return frame(ctx, image, index, x, y, size, size, angle, 1, 0.8, 0.51);
}

export function drawSkillImpact(ctx, x, y, radius, progress, options = {}) {
    const missile = options.variant === 'missile' || options.variant === 'golden_missile';
    const variant = options.variant === 'blue_flame' ? 'blue_fireball' : options.variant;
    const image = texture(missile ? 'missile' : 'fireball', variant);
    if (!image) return false;
    const phase = clamp(progress, 0, 1);
    const index = 8 + Math.min(7, Math.floor(phase * 8));
    const size = Math.max(missile ? 58 : 90, radius * 2.7);
    // The art itself expands then disperses. Do not scale each frame's bounds
    // independently or the impact jumps between ignition and the shockwave.
    return frame(ctx, image, index, x, y, size, size, 0, phase > 0.86 ? (1 - phase) / 0.14 : 1);
}

export function drawSkillLightning(ctx, x1, y1, x2, y2, intensity, options = {}) {
    const image = texture('lightning', options.variant);
    if (!image) return false;
    const distance = Math.hypot(x2 - x1, y2 - y1);
    if (distance < 1) return true;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const age = options.age ?? performance.now() / 1000;
    const index = loopFrame(age, 20, 8);
    const count = Math.min(4, Math.max(1, Math.ceil(distance / 180)));
    const span = distance / count;
    const alpha = clamp(intensity, 0, 1);
    // The endpoints in the source are at 14% and 86% after gutter packing.
    // Fit those exact anchors to each chain segment in every direction.
    for (let i = 0; i < count; i++) {
        const mid = span * (i + 0.5);
        frame(ctx, image, (index + i) % 8, x1 + Math.cos(angle) * mid, y1 + Math.sin(angle) * mid,
            span / 0.72, Math.min(100, Math.max(42, span * 0.65)), angle, alpha, 0.5, 0.535);
    }
    frame(ctx, image, 8 + loopFrame(age, 16, 4), x2, y2, 62, 62, 0, alpha);
    return true;
}

export function drawSkillShield(ctx, x, y, options = {}) {
    if (!surfaces.barrier) return false;
    const age = options.age ?? 1;
    const remaining = options.remaining ?? 9999;
    const phase = age < 0.28 ? Math.min(3, Math.floor(age / 0.28 * 4))
        : remaining < 0.3 ? 12 + Math.min(3, Math.floor((0.3 - remaining) / 0.3 * 4))
            : 4 + loopFrame(age, 12, 8);
    const size = (options.baseRadius || 55) * 2.8;
    return frame(ctx, surfaces.barrier, phase, x, y + 8, size, size);
}

export function drawSkillCastCircle(ctx, x, y, options = {}) {
    if (!surfaces.lightning) return false;
    const age = options.age ?? performance.now() / 1000;
    const size = (options.radiusOuter || 75) * 2.55;
    return frame(ctx, surfaces.lightning, 12 + loopFrame(age, 8, 4), x, y,
        size, size * (options.yScale || 0.45), 0, 0.65);
}
