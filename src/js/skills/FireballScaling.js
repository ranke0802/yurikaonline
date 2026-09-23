// Keep level 1 familiar and halve the old per-level growth. There is no size
// cap: every skill upgrade still increases collision, blast and image size.
// Local casts, remote replays, aim guides and skill details share this rule.
export const FIREBALL_BASE_RADIUS = 20;
export const FIREBALL_RADIUS_PER_LEVEL = 10;
export const FIREBALL_AOE_MULTIPLIER = 2.5;

export function getFireballProjectileRadius(level = 1) {
    const value = Number(level);
    const skillLevel = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
    return FIREBALL_BASE_RADIUS + (skillLevel - 1) * FIREBALL_RADIUS_PER_LEVEL;
}

export function getFireballAoeRadius(level = 1) {
    return getFireballProjectileRadius(level) * FIREBALL_AOE_MULTIPLIER;
}
