import { getSharedResourceManager } from '../core/ResourceManager.js';

// Read the same simulation deadline used by multipliers(); classStatuses alone
// may be stale and must never make an unbuffed summon look empowered.
export function summonBerserkRemaining(controller, actor) {
    if (!controller || controller.disposed || controller.owner?.isDead || !(controller.owner?.hp > 0)
        || !actor || actor.isDead || !(actor.hp > 0) || !controller.summons?.includes(actor)) return 0;
    const until = controller.statuses?.get(actor)?.berserkUntil;
    return Number.isFinite(until) ? Math.max(0, Math.min(10, until - controller.time)) : 0;
}

export function summonBerserkDeadline(controller, actor, now = Date.now()) {
    const remaining = summonBerserkRemaining(controller, actor);
    return remaining > 0 ? now + remaining * 1000 : 0;
}

export function readSummonBerserkDeadline(value, now = Date.now()) {
    return Number.isFinite(value) && value > now ? Math.min(value, now + 10000) : 0;
}

export function drawSummonBerserk(ctx, actor, visual, active, image) {
    if (!active || !visual?.sprite || actor?.isDead || !(actor?.hp > 0)) return false;
    if (!image) {
        const resources = getSharedResourceManager();
        image = resources?.getImage?.('assets/resource/classes/status.webp');
        if (!image) { resources?.loadImage('assets/resource/classes/status.webp').catch(()=>{}); return false; }
    }
    // Reuse berserk slot 1 of the existing 4x2 status atlas, below the body.
    const w = image.width / 4, h = image.height / 2, size = 22;
    const x = actor.x - size / 2;
    const y = actor.y + (visual.renderHeight || visual.height || actor.height || 64) / 2 + 6;
    ctx.save();
    try { ctx.drawImage(image, w, 0, w, h, x, y, size, size); }
    finally { ctx.restore(); }
    return { x, y, size };
}
