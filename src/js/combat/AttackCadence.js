/** Simulation-time recovery intervals, in seconds at effective speed 1.
 * Mage reference is .7 * 1.15 = .805. Stat contributions remain unchanged;
 * the final .20s recovery floor limits accepted input to five attacks/second.
 * Effective speed already includes temporary multipliers (berserk 1.7).
 */
export const MIN_BASIC_INTERVAL = .20;
export const BASIC_CADENCE = Object.freeze({
    witch: Object.freeze({ tap: .805, aimed: 1.05 }),
    warrior: Object.freeze({ tap: .70, aimed: 1.10 }),
    archer: Object.freeze({ tap: .65, aimed: 1.05, empowered: .55 })
});
export function basicAttackInterval(classId, { aimed = false, empowered = false, speed = 1 } = {}) {
    const cadence = BASIC_CADENCE[classId];
    if (!cadence) return null;
    const safeSpeed = Number.isFinite(speed) && speed > 0 ? Math.max(.1, speed) : 1;
    const base = aimed ? (empowered && cadence.empowered ? cadence.empowered : cadence.aimed) : cadence.tap;
    return Math.max(MIN_BASIC_INTERVAL, base / safeSpeed);
}
