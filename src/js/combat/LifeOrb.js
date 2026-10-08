// Transient, owner-only attacks. No wall timers, account data or remote simulation.
export function lifeOrbProfile(level = 1) {
    level = Number(level);
    level = Number.isFinite(level) ? Math.max(1, Math.min(8, Math.floor(level))) : 1;
    return { level, capacity: Math.ceil(level / 2), hitMultiplier: .70 + .05 * (level - 1),
        healMultiplier: .12 + .02 * (level - 1), maxHits: 3, maxTargets: 3,
        hitInterval: .25, range: 560, radius: 14 * (1 + .05 * (level - 1)), speed: 180, contactSpeed: 90,
        followThrough: 72, returnSpeed: 540, maxLifetime: 10 };
}
export function lifeOrbSlots(controller) {
    const maximum = lifeOrbProfile(controller.owner.skillLevels?.lifeDrain).capacity;
    const active = controller.projectiles.filter(p => p.kind === 'life_orb' && !p.finished).length;
    return { available: Math.max(0, maximum - active), maximum, active };
}
const alive = e => e && !e.isDead && e.hp > 0;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function launchLifeOrb(c, { aimed = false, x, y } = {}, weapon = null) {
    if (!lifeOrbSlots(c).available) return false;
    const profile = lifeOrbProfile(c.owner.skillLevels?.lifeDrain), center = c.combatOrigin();
    const target = !aimed && c.enemies().filter(e => distance(e, center) <= profile.range)
        .sort((a, b) => distance(a, center) - distance(b, center))[0];
    const point = target || { x: x ?? center.x + 300, y: y ?? center.y };
    const origin = c.attackOrigin(point, 'orb'), attack = c.attack();
    const orb = { kind: 'life_orb', id: ++c.lifeOrbSerial, ...origin, profile,
        phase: 'outbound', age: 0, direction: c.projectileDirection(origin, point),
        launchCenter: center, forward: c.direction(point), spawnSweep: c.launchSweep(origin, point),
        target, weapon, chainState: {}, homing: !aimed, radius: profile.radius, speed: profile.speed, remaining: profile.range,
        hits: new Map(), returnHits: new Set(), acceptedHits: 0, actualDamage: 0, charge: 0,
        power: attack * profile.hitMultiplier * (1 + (weapon?.damageBonus || 0)),
        healCap: Math.ceil(attack * profile.healMultiplier), finished: false };
    // Reserve before notifying UI/tutorial/audio hooks, including reentrant input.
    c.projectiles.push(orb);
    c.hooks.action?.('basic', { aimed, target: point, interval: 0 });
    c.effect('drain_orb', { ...origin, target: point });
    return true;
}
function finish(c, p, arrived) {
    if (p.finished) return;
    p.finished = true;
    const index = c.projectiles.indexOf(p);
    if (index >= 0) c.projectiles.splice(index, 1);
    if (!arrived || c.disposed || !alive(c.owner) || !(p.actualDamage > 0)) return;
    // One integer budget per orb. Crowd size, weapon on-hit healing and repeated
    // arrival callbacks cannot increase it. No overflow healing to allies.
    const budget = Math.min(p.healCap, Math.floor(p.actualDamage * .20 + Math.max(0, Number(p.weapon?.restoreHpPerLaserHit) || 0)));
    if (budget <= 0) return;
    const before = c.owner.hp;
    c.heal(c.owner, budget, false);
    const restored = Math.max(0, c.owner.hp - before);
    if (restored > 0) {
        c.hooks.healFeedback?.(c.owner, restored);
        c.effect('life_orb_heal', { ...c.combatOrigin(), amount: restored, duration: .4 });
    }
}
function recall(p) {
    p.phase = 'return'; p.homing = false; p.speed = p.profile.returnSpeed; p.remaining = Infinity;
}
function acceptHit(c, p, e, meta) {
    const actual = c.hit(e, p.power, { lifeOrb: true, orbId: p.id, ...meta });
    if (c.disposed || !alive(c.owner) || !c.projectiles.includes(p)) return;
    if (actual > 0) {
        // Both legs share the original per-orb healing budget and chain guard.
        p.actualDamage += actual; p.acceptedHits++;
        p.impactAt = p.age;
        c.hooks.lifeOrbImpact?.(p);
        c.queueWeaponChain(e, p.power, p.weapon, p.chainState);
        c.hooks.basicHit?.(e, actual);
    }
    p.charge = Math.min(1, p.acceptedHits / p.profile.maxHits);
}
function returnContacts(c, p, from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, length2 = dx * dx + dy * dy;
    // Sweep the entire segment, including the last snap to the owner. Each orb
    // independently permits one return contact per enemy, separate from outbound caps.
    for (const e of c.enemies()) {
        if (c.disposed || !alive(c.owner) || p.finished || !c.projectiles.includes(p)) return;
        const key = e.id ?? e;
        if (p.returnHits.has(key) || distance(e, p.launchCenter) > p.profile.range) continue;
        const t = length2 ? Math.max(0, Math.min(1, ((e.x-from.x)*dx + (e.y-from.y)*dy) / length2)) : 0;
        const closest = { x: from.x + dx*t, y: from.y + dy*t };
        if (distance(e, closest) > (e.radius || 16) + p.radius || c.drainPathBlocked(closest, e, p.radius)) continue;
        p.returnHits.add(key); // Reserve before reentrant damage/audio callbacks.
        acceptHit(c, p, e, { orbPhase: 'return', orbHit: 1 });
    }
}
function contacts(c, p) {
    for (const e of c.enemies()) {
        if (c.disposed || !alive(c.owner) || p.finished || !c.projectiles.includes(p)) return;
        if (distance(e, p.launchCenter) > p.profile.range || distance(e, p) > (e.radius || 16) + p.radius) continue;
        if (c.drainPathBlocked(p, e, p.radius)) continue;
        if ((e.x - p.launchCenter.x) * p.forward.x + (e.y - p.launchCenter.y) * p.forward.y < 0) continue;
        const key = e.id ?? e, record = p.hits.get(key);
        if (!record && p.hits.size >= p.profile.maxTargets) continue;
        if (record && (record.count >= p.profile.maxHits || p.age + 1e-8 < record.next)) continue;
        const hit = record || { count: 0, next: 0 };
        p.hits.set(key, hit); hit.count++; hit.next = p.age + p.profile.hitInterval;
        if (p.afterContact === undefined) { p.afterContact = p.profile.followThrough; p.homing = false; p.speed = p.profile.contactSpeed; }
        acceptHit(c, p, e, { orbPhase: 'outbound', orbHit: hit.count });
    }
}
export function advanceLifeOrb(c, p, dt) {
    if (p.finished || !c.projectiles.includes(p)) return;
    if (c.disposed || !alive(c.owner)) { finish(c, p, false); return; }
    const destination = c.attackOrigin(p, 'return');
    if (p.age >= p.profile.maxLifetime || distance(destination, p) > p.profile.range * 2) { finish(c, p, false); return; }
    // Small simulation steps preserve hit spacing and collision at low FPS.
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))), step = dt / steps;
    for (let i = 0; i < steps && !p.finished; i++) {
        if (c.disposed || !alive(c.owner) || !c.projectiles.includes(p)) return;
        p.age += step;
        if (p.phase === 'return') {
            const origin = c.attackOrigin(p, 'return'), dist = distance(p, origin);
            const from = { x: p.x, y: p.y }, arrived = dist <= p.speed * step + 8;
            if (dist) p.direction = { x: (origin.x - p.x) / dist, y: (origin.y - p.y) / dist };
            p.x = arrived ? origin.x : p.x + p.direction.x * p.speed * step;
            p.y = arrived ? origin.y : p.y + p.direction.y * p.speed * step;
            returnContacts(c, p, from, p);
            if (arrived) { finish(c, p, true); break; }
            continue; // Travel still passes walls; target contact retains wall checks.
        }
        if (p.spawnSweep) {
            const sweep = p.spawnSweep; delete p.spawnSweep;
            const muzzle = { x: p.x, y: p.y };
            const span = distance(sweep.from, sweep.to), count = Math.max(1, Math.ceil(span / 6));
            for (let n = 0; n <= count; n++) {
                const x = sweep.from.x + (sweep.to.x - sweep.from.x) * n / count;
                const y = sweep.from.y + (sweep.to.y - sweep.from.y) * n / count;
                if (c.hooks.projectileBlocked?.(x, y, p.radius)) { recall(p); break; }
                p.x = x; p.y = y; contacts(c, p);
            }
            if (p.phase === 'return') continue;
            p.x = muzzle.x; p.y = muzzle.y;
        }
        if (p.homing && alive(p.target) && c.enemies().includes(p.target) && distance(p.target, p.launchCenter) <= p.profile.range) {
            const dist = distance(p, p.target);
            if (dist) p.direction = { x: (p.target.x - p.x) / dist, y: (p.target.y - p.y) / dist };
        }
        const travel = Math.min(p.speed * step, p.remaining, p.afterContact ?? Infinity);
        const x = p.x + p.direction.x * travel, y = p.y + p.direction.y * travel;
        if (c.hooks.projectileBlocked?.(x, y, p.radius)) { recall(p); continue; }
        p.x = x; p.y = y; p.remaining -= travel;
        if (p.afterContact !== undefined) p.afterContact -= travel;
        contacts(c, p);
        if (p.remaining <= 1e-8 || (p.afterContact !== undefined && p.afterContact <= 1e-8)) recall(p);
    }
}
