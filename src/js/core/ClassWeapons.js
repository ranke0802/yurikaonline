// Approved raster assets verified from cb46f34e; release gate is enabled.
// No query-string/localStorage override. Tests may opt in on an isolated ItemDataManager.
export const CLASS_WEAPONS_ENABLED = true;
export const WEAPON_THEMES = Object.freeze(['magic', 'tidal', 'storm', 'astral', 'riftcore']);
export const WEAPON_CLASSES = Object.freeze(['witch', 'warrior', 'archer']);
const NAMES = { witch: ['위치', '마법서', 'spellbook', '📖'], warrior: ['전사', '검', 'sword', '⚔️'], archer: ['궁수', '활', 'bow', '🏹'] };
// Saved item IDs, canonical rolled-effect keys and released reward archives stay stable.
// Resolve the route at use time, including items saved before these routes existed.
const route = (slot, name, effect, radius, mode = null, potency = '피해') => Object.freeze({slot,name,effect,radius,mode,potency});
export const CLASS_WEAPON_ROUTES = Object.freeze({
    witch: Object.freeze({magic:route(0,'생명 흡수 (탭)','life_circle',95,'tap'),tidal:route(1,'독 물약','poison_cloud',140),storm:route(2,'소환수','summon',70,null,'공격력'),astral:route(3,'광폭화 물약','berserk_potion',240,null,'공격력 증가분'),riftcore:route(0,'흡수 구체 (홀드)','life_circle',95,'hold')}),
    warrior: Object.freeze({magic:route(0,'연속 베기 (탭)','weapon_slash',100,'tap'),tidal:route(1,'방패 돌진','shield_impact',100),storm:route(2,'광천격','gwangcheon',80),astral:route(3,'피의 계약','blood_finale',170,null,'흡혈·종료 피해'),riftcore:route(0,'검격 발사 (홀드)','rage_smash',100,'hold')}),
    archer: Object.freeze({magic:route(0,'일반 화살 (탭)','trap_burst',70,'tap'),tidal:route(1,'사냥꾼 덫','trap_burst',130),storm:route(2,'그림자 도약','shadow_leap',80,null,'후퇴 거리'),astral:route(3,'추적 화살비','tracking_rain',165),riftcore:route(0,'관통 저격 (홀드)','trap_burst',130,'hold')})
});
// Compatibility export for callers which only need each class's original chain skill.
export const CLASS_WEAPON_SKILLS = Object.freeze(Object.fromEntries(Object.entries(CLASS_WEAPON_ROUTES).map(([id,r])=>[id,r.tidal])));
export function classWeaponRoute(item, classId = weaponClass(item?.type || item?.id)) {
    const theme=/^(?:blessed_)?(magic|tidal|storm|astral|riftcore)_/.exec(item?.type || item?.id || '')?.[1];
    return CLASS_WEAPON_ROUTES[classId]?.[theme] || null;
}
export function basicWeaponBonuses(owner, aimed = false) {
    const weapon=classWeaponBonuses(owner);
    return weapon?.slot===0 && weapon.mode===(aimed?'hold':'tap') ? weapon : null;
}
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
        affix.classSkill = CLASS_WEAPON_ROUTES[classId][theme];
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
    const profile=owner.getWeaponCombatProfile();
    return { ...profile, ...classWeaponRoute(item,classId), damageBonus:(profile.missileDamageBonus||0)+(profile.laserDamageBonus||0) };
}
export function classWeaponDetailLines(player, item) {
    const classId = weaponClass(item?.type || item?.id);
    if (!classId) return null;
    const skill = classWeaponRoute(item,classId), lines = [];
    const value = key => player.getWeaponAffixEffectiveValue(item, key);
    const percent = key => Math.round(value(key) * 100);
    if (value('missileDamageBonus')) lines.push(`${skill.name} ${skill.potency} +${percent('missileDamageBonus')}%`, `${skill.name} 재사용 대기시간 -${percent('missileManaCostReduction')}%`);
    if (value('fireballChainChance')) lines.push(`${skill.name} 연속 피해 확률 ${percent('fireballChainChance')}%`, `연속 피해 ${percent('fireballChainDamageRatio')}% (0.3초 간격, 최대 12회, 상태 중첩 없음)`);
    if (value('laserDamageBonus')) lines.push(`${skill.name} ${skill.potency} +${percent('laserDamageBonus')}%`);
    if (value('attackSpeedBonus')) lines.push(`공격속도 +${percent('attackSpeedBonus')}%`);
    const heal = player.getWeaponCombatHookValue(item, 'restoreHpPerLaserHit');
    if (heal) lines.push(`${skill.name} ${classId==='witch'&&skill.slot===3?'아군 강화 시':'적중 시'} HP +${heal}`);
    return lines;
}
