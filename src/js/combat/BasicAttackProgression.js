// Shared by combat, aim previews and upgrade details. Level 1 retains existing values.
export const BASIC_SKILL_IDS = Object.freeze({ witch: 'lifeDrain', warrior: 'cleave', archer: 'shot' });
export const BASIC_MAX_LEVEL = 8;
export function basicAttackProfile(classId, skillLevels = {}) {
    const raw = Number(skillLevels[BASIC_SKILL_IDS[classId]]);
    const level = Number.isFinite(raw) ? Math.max(1, Math.min(BASIC_MAX_LEVEL, Math.floor(raw))) : 1;
    const growth = level - 1, areaScale = 1 + .05 * growth;
    return {
        level, damageMultiplier: 1 + .08 * growth,
        chargeSeconds: classId === 'archer' ? Math.max(.30, Math.round((.50 - .03 * growth) * 1000) / 1000) : .50,
        tapRadius: 95 * areaScale, orbRadius: 14 * areaScale,
        tap: { range: 100 * areaScale, halfWidth: 52 * areaScale, knockback: 4 * growth },
        heavy: { range: 150 * areaScale, halfWidth: 48 * areaScale, knockback: 6 * growth }
    };
}
export function basicChargeSeconds(owner, empowered = false) {
    const seconds = basicAttackProfile(owner.classId, owner.skillLevels).chargeSeconds;
    return owner.classId === 'archer' && empowered ? Math.max(.12, Math.round(seconds * .4 * 1000) / 1000) : seconds;
}
