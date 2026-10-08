/** Player-facing names only; combat values and rolls are untouched. */
const optionNames = {
    missileDamageBonus: '매직 미사일 피해',
    missileManaCostReduction: '매직 미사일 마나 절약',
    fireballChainChance: '파이어볼 연속 폭발 확률',
    fireballChainDamageRatio: '파이어볼 연속 폭발 피해',
    laserDamageBonus: '체인 라이트닝 피해',
    attackSpeedBonus: '공격 속도'
};
export function optionChangeLines(result) {
    return Object.entries(result.rolledValues || {}).map(([key, value]) => {
        const before = Math.round(Number(result.previousValues?.[key] || 0) * 100);
        const after = Math.round(Number(value || 0) * 100);
        return `${optionNames[key] || '무기 옵션'}: ${before}% → ${after}%${after > before ? ` (+${after - before}%p)` : ' (유지)'}`;
    }).join('\n');
}
