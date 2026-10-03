// Approved raster assets verified from cb46f34e; release gate is enabled.
// No query-string/localStorage override. Tests may opt in on an isolated ItemDataManager.
export const CLASS_WEAPONS_ENABLED = true;
export const WEAPON_THEMES = Object.freeze(['magic', 'tidal', 'storm', 'astral', 'riftcore']);
export const WEAPON_CLASSES = Object.freeze(['witch', 'warrior', 'archer']);
const NAMES = { witch: ['위치', '마법서', 'spellbook', '📖'], warrior: ['전사', '검', 'sword', '⚔️'], archer: ['궁수', '활', 'bow', '🏹'] };
export const CLASS_WEAPON_SKILLS = Object.freeze({
    witch: Object.freeze({ slot: 1, name: '독 물약', effect: 'poison_cloud', radius: 140 }),
    warrior: Object.freeze({ slot: 2, name: '응징 돌진', effect: 'punishing_charge', radius: 100 }),
    archer: Object.freeze({ slot: 3, name: '추적 화살비', effect: 'tracking_rain', radius: 165 })
});
export function classWeaponId(mageId, classId) {
    if (!WEAPON_CLASSES.includes(classId) || !/^(blessed_)?(magic|tidal|storm|astral|riftcore)_staff$/.test(mageId)) return mageId;
    return mageId.replace(/_staff$/, `_${classId}`);
}
export function weaponClass(itemId) {
    return /^(?:blessed_)?(?:magic|tidal|storm|astral|riftcore)_(witch|warrior|archer)$/.exec(itemId || '')?.[1] || null;
}
// Clone released Mage data: do not maintain a second independently balanced table.
export function buildClassWeapon(mage, pool, classId) {
    const [className, noun, weaponType, emoji] = NAMES[classId] || [];
    if (!noun || !mage || !pool) throw new Error('Missing class weapon source');
    const definition = structuredClone(mage), affixPool = structuredClone(pool);
    const theme = mage.id.replace(/^blessed_/, '').replace(/_staff$/, '');
    definition.id = classWeaponId(mage.id, classId);
    if (definition.id === mage.id) throw new Error('Unsupported Mage source');
    definition.name = mage.name.replace(/지팡이/g, noun);
    definition.description = `${className} 전용 ${noun}. 같은 지역·등급의 마법사 무기와 능력치 및 강화 규칙이 같습니다.`;
    definition.allowedClasses = [classId]; definition.weaponType = weaponType;
    definition.mageSourceId = mage.id;
    definition.icon = { type: 'image', path: `assets/resource/classes/weapons/${theme}_${classId}.webp`, fallbackEmoji: emoji };
    definition.inventoryTooltip = { ...definition.inventoryTooltip, className, weaponType: noun };
    definition.prefixPool = `${definition.id}_affixes`;
    affixPool.id = definition.prefixPool;
    affixPool.affixes.forEach(affix => {
        affix.id = `${affix.id}_${classId}`;
        affix.displayName = `${affix.prefix} ${definition.name}`;
        // Numeric effect keys intentionally stay canonical for enhancement/reroll parity.
        affix.classSkill = CLASS_WEAPON_SKILLS[classId];
        affix.skillOverrides = {};
    });
    return { definition, affixPool };
}
export function registerClassWeapons(itemData) {
    for (const theme of WEAPON_THEMES) for (const tier of ['', 'blessed_']) for (const classId of WEAPON_CLASSES) {
        const mage = itemData.getItemDefinition(`${tier}${theme}_staff`);
        const { definition, affixPool } = buildClassWeapon(mage, itemData.getAffixPool(mage?.prefixPool), classId);
        itemData.itemDefinitions.set(definition.id, definition);
        itemData.affixPools.set(affixPool.id, affixPool);
        affixPool.affixes.forEach(affix => itemData.affixesById.set(affix.id, affix));
    }
}
export function classWeaponBonuses(owner) {
    const item = owner.getEquippedWeapon?.(), data = owner.getItemDataManager?.();
    const classId = weaponClass(item?.type || item?.id);
    if (!data?.classWeaponsEnabled || classId !== owner.classId || !CLASS_WEAPON_SKILLS[classId]) return null;
    return { ...owner.getWeaponCombatProfile(), ...CLASS_WEAPON_SKILLS[classId] };
}
export function classWeaponDetailLines(player, item) {
    const classId = weaponClass(item?.type || item?.id);
    if (!classId) return null;
    const skill = CLASS_WEAPON_SKILLS[classId], lines = [];
    const value = key => player.getWeaponAffixEffectiveValue(item, key);
    const percent = key => Math.round(value(key) * 100);
    if (value('missileDamageBonus')) lines.push(`${skill.name} 피해 +${percent('missileDamageBonus')}%`, `${skill.name} 재사용 대기시간 -${percent('missileManaCostReduction')}%`);
    if (value('fireballChainChance')) lines.push(`${skill.name} 연속 피해 확률 ${percent('fireballChainChance')}%`, `연속 피해 ${percent('fireballChainDamageRatio')}% (0.3초 간격, 최대 12회, 상태 중첩 없음)`);
    if (value('laserDamageBonus')) lines.push(`기본 공격 피해 +${percent('laserDamageBonus')}%`);
    if (value('attackSpeedBonus')) lines.push(`공격속도 +${percent('attackSpeedBonus')}%`);
    const heal = player.getWeaponCombatHookValue(item, 'restoreHpPerLaserHit');
    if (heal) lines.push(`기본 공격 적중 시 HP +${heal}`);
    return lines;
}
