import assert from 'node:assert/strict';

const scheduledCallbacks = [];
const scene = {
    isZoneTransitioning: false,
    zoneTransitionToken: 0
};
const runtime = {
    zoneId: 'zone_2',
    fieldId: 'zone_2',
    worldGeneration: 10,
    explosions: 0,
    sparks: 0,
    monsterDamagePackets: 0
};

globalThis.window = {
    setTimeout(callback) {
        scheduledCallbacks.push(callback);
        return scheduledCallbacks.length;
    },
    game: {
        useReducedEffects: false,
        projectiles: [],
        sceneManager: { currentScene: scene },
        zone: { currentZone: { id: runtime.zoneId } },
        monsterManager: {
            worldGeneration: runtime.worldGeneration,
            monsters: new Map()
        },
        net: {
            playerId: 'local-player',
            _getCurrentFieldId: () => runtime.fieldId,
            sendMonsterDamage() {
                runtime.monsterDamagePackets += 1;
            }
        },
        localPlayer: {
            id: 'local-player',
            canAttackTarget: () => true
        },
        remotePlayers: new Map(),
        addExplosion() {
            runtime.explosions += 1;
        },
        addSpark() {
            runtime.sparks += 1;
        },
        sound: null
    }
};

const { Projectile } = await import('../src/js/entities/Projectile.js');
const {
    captureProjectileWorldContext,
    isProjectileWorldContextCurrent,
    toProjectileAuthoredOptions
} = await import('../src/js/entities/ProjectileWorldContext.js');

function resetRuntime() {
    scheduledCallbacks.length = 0;
    runtime.zoneId = 'zone_2';
    runtime.fieldId = 'zone_2';
    runtime.worldGeneration = 10;
    runtime.explosions = 0;
    runtime.sparks = 0;
    runtime.monsterDamagePackets = 0;
    scene.isZoneTransitioning = false;
    scene.zoneTransitionToken = 0;
    window.game.zone.currentZone = { id: runtime.zoneId };
    window.game.monsterManager.worldGeneration = runtime.worldGeneration;
    window.game.monsterManager.monsters = new Map();
}

function drainScheduledCallbacks(limit = 32) {
    let count = 0;
    while (scheduledCallbacks.length > 0) {
        assert.ok(count < limit, 'chain callback recursion exceeded its safety limit');
        const callback = scheduledCallbacks.shift();
        callback();
        count += 1;
    }
    return count;
}

function createMonster(id) {
    return {
        id,
        type: 'monster',
        isMonster: true,
        isDead: false,
        x: 0,
        y: 0,
        width: 20,
        defense: 0,
        hitCount: 0,
        effectCount: 0,
        takeDamage() {
            this.hitCount += 1;
        },
        applyEffect() {
            this.effectCount += 1;
        }
    };
}

function createBlueFireball(options = {}) {
    return new Projectile(0, 0, null, 'fireball', {
        damage: 100,
        aoeRadius: 100,
        ownerId: options.ownerId || 'local-player',
        variant: 'blue_fireball',
        visualOnly: !!options.visualOnly,
        replayWeaponEffectVisuals: !!options.replayWeaponEffectVisuals,
        weaponEffect: {
            prefixId: 'tidal_blue_flame',
            fireballChainChance: options.chainChance ?? 1,
            fireballChainDamageRatio: 1,
            chainSeed: options.chainSeed ?? 1
        }
    });
}

resetRuntime();
const delayedImportContext = captureProjectileWorldContext();
assert.equal(isProjectileWorldContextCurrent(delayedImportContext), true, 'the authored field must start current');
scene.zoneTransitionToken += 1;
runtime.zoneId = 'zone_3';
runtime.fieldId = 'zone_3';
runtime.worldGeneration += 1;
window.game.zone.currentZone = { id: runtime.zoneId };
window.game.monsterManager.worldGeneration = runtime.worldGeneration;
assert.equal(isProjectileWorldContextCurrent(delayedImportContext), false, 'a delayed import must reject its departed field context');
const delayedImportProjectile = new Projectile(0, 0, null, 'missile', {
    damage: 100,
    ownerId: 'local-player',
    ...toProjectileAuthoredOptions(delayedImportContext)
});
const delayedImportTarget = createMonster('destination-monster');
delayedImportProjectile.update(0.016, [delayedImportTarget]);
assert.equal(delayedImportProjectile.isDead, true, 'a late-created old-field projectile must self-terminate');
assert.equal(delayedImportTarget.hitCount, 0, 'a late-created old-field projectile must not damage destination monsters');

resetRuntime();
const oldMonster = createMonster('old-zone-monster');
const newMonster = createMonster('new-zone-monster');
window.game.monsterManager.monsters = new Map([[oldMonster.id, oldMonster]]);
const transitioningFireball = createBlueFireball();
transitioningFireball._tryTriggerBlueFlameChainExplosions(
    oldMonster,
    [oldMonster],
    window.game.net,
    true
);
assert.equal(scheduledCallbacks.length, 1, 'the first deterministic chain should be scheduled');

scene.isZoneTransitioning = true;
scene.zoneTransitionToken += 1;
runtime.zoneId = 'zone_3';
runtime.fieldId = 'zone_3';
runtime.worldGeneration += 1;
window.game.zone.currentZone = { id: runtime.zoneId };
window.game.monsterManager.worldGeneration = runtime.worldGeneration;
window.game.monsterManager.monsters = new Map([[newMonster.id, newMonster]]);
drainScheduledCallbacks();

assert.equal(oldMonster.hitCount, 0, 'a departed-zone monster must not receive delayed chain damage');
assert.equal(newMonster.hitCount, 0, 'a destination-zone monster must not receive delayed chain damage');
assert.equal(runtime.monsterDamagePackets, 0, 'no damage packet may cross the field transition');
assert.equal(runtime.explosions, 0, 'stale chain visuals must also stop at the field boundary');

resetRuntime();
const localTarget = createMonster('same-zone-monster');
window.game.monsterManager.monsters = new Map([[localTarget.id, localTarget]]);
const authoritativeFireball = createBlueFireball({ chainChance: 0.3, chainSeed: 1 });
authoritativeFireball._tryTriggerBlueFlameChainExplosions(
    localTarget,
    [localTarget],
    window.game.net,
    true
);
drainScheduledCallbacks();

assert.equal(runtime.explosions, 1, 'seed 1 at 30% should produce exactly one chain impact');
assert.equal(localTarget.hitCount, 1, 'the authoritative projectile should apply one local damage event');
assert.equal(runtime.monsterDamagePackets, 1, 'the authoritative projectile should send one damage packet');

resetRuntime();
const deterministicAuthor = createBlueFireball({ chainChance: 0.5, chainSeed: 1 });
deterministicAuthor._tryTriggerBlueFlameChainExplosions(null, [], window.game.net, true);
drainScheduledCallbacks();
const authoredChainCount = runtime.explosions;
assert.equal(authoredChainCount, 2, 'seed 1 at 50% should produce two chain impacts');

resetRuntime();
const remoteVisualTarget = createMonster('remote-visual-target');
window.game.monsterManager.monsters = new Map([[remoteVisualTarget.id, remoteVisualTarget]]);
const remoteVisualFireball = createBlueFireball({
    chainChance: 0.5,
    chainSeed: 1,
    ownerId: 'remote-player',
    visualOnly: true,
    replayWeaponEffectVisuals: true
});
remoteVisualFireball._executeActualExplosion(remoteVisualTarget, [remoteVisualTarget]);
drainScheduledCallbacks();

assert.equal(runtime.explosions - 1, authoredChainCount, 'remote visual chains must replay the author deterministic sequence');
assert.equal(remoteVisualTarget.hitCount, 0, 'a visual-only chain must never apply local damage');
assert.equal(remoteVisualTarget.effectCount, 0, 'a visual-only chain must never apply combat effects');
assert.equal(runtime.monsterDamagePackets, 0, 'a visual-only chain must never send damage packets');

resetRuntime();
const blockedProjectileTarget = createMonster('blocked-handoff-target');
const blockedFireball = new Projectile(0, 0, null, 'fireball', {
    damage: 100,
    aoeRadius: 100,
    ownerId: 'local-player',
    variant: 'blue_fireball',
    weaponEffect: {
        prefixId: 'tidal_blue_flame',
        fireballChainChance: 1,
        fireballChainDamageRatio: 1,
        chainSeed: 1
    }
});
const originalSendMonsterDamage = window.game.net.sendMonsterDamage;
window.game.net.sendMonsterDamage = () => false;
assert.equal(
    blockedFireball._applyDamage(blockedProjectileTarget, window.game.net, true),
    false,
    'a projectile must honor a host handoff damage rejection'
);
assert.equal(blockedProjectileTarget.hitCount, 0, 'blocked projectiles must not mutate monster HP state');
assert.equal(blockedProjectileTarget.effectCount, 0, 'blocked projectiles must not author burn effects');
assert.equal(blockedProjectileTarget.lastAttackerId, undefined, 'blocked projectiles must not author a contributor');
blockedFireball._tryTriggerBlueFlameChainExplosions(
    blockedProjectileTarget,
    [blockedProjectileTarget],
    window.game.net,
    true
);
drainScheduledCallbacks();
assert.equal(blockedProjectileTarget.hitCount, 0, 'blocked chain explosions must not apply damage');
assert.equal(blockedProjectileTarget.effectCount, 0, 'blocked chain explosions must not apply burn');
window.game.net.sendMonsterDamage = originalSendMonsterDamage;

console.log('[projectile-chain] OK: field guard, deterministic replay, and visual-only damage isolation.');
