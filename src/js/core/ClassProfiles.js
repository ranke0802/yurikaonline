import { CLASS_SKILL_UI } from '../ui/ClassSkillUI.js';
/** Legacy root fields always belong to the Mage. Account assets remain shared. */
export const CLASS_IDS = Object.freeze(['wizard', 'witch', 'warrior', 'archer']);
export const CLASS_NAMES = Object.freeze({ wizard: '마법사', witch: '위치', warrior: '전사', archer: '궁수' });
export const CLASS_FIELDS = Object.freeze(['level', 'exp', 'maxExp', 'vitality', 'intelligence', 'wisdom', 'agility', 'statPoints', 'skillLevels', 'equipment', 'hp', 'maxHp', 'mp', 'maxMp', 'defense', 'autoAttackEnabled', 'currentZoneId', 'mapId', 'mapPositions', 'x', 'y']);
const classFields = new Set(CLASS_FIELDS);
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
export const normalizeClassId = id => CLASS_IDS.includes(id) ? id : 'wizard';
export function createClassProfile(classId) {
    return { level: 1, exp: 0, maxExp: 100, vitality: 1, intelligence: 3, wisdom: 2, agility: 1, statPoints: 0,
        skillLevels: Object.fromEntries((CLASS_SKILL_UI[classId] || []).map(skill => [skill.id, 1])), equipment: { weapon: null }, autoAttackEnabled: false, currentZoneId: 'zone_1', mapId: 'zone_1', mapPositions: {} };
}
export function projectClassProfile(account, requestedId = account?.activeClassId) {
    if (!account) return null;
    const id = normalizeClassId(requestedId);
    if (id === 'wizard') return { ...copy(account), activeClassId: id };
    const projected = copy(account);
    for (const field of CLASS_FIELDS) delete projected[field];
    return { ...projected, ...createClassProfile(id), ...copy(account.classProfiles?.[id] || {}), activeClassId: id };
}
export function attachClassProfile(player, account) {
    player.activeClassId = normalizeClassId(account?.activeClassId);
    player.classId = player.activeClassId;
    player.classProfiles = copy(account?.classProfiles || {});
}
/** The complete active snapshot avoids losing sibling fields in RTDB's shallow object merge. */
export function buildClassProfilePatch(player, patch) {
    const id = normalizeClassId(player.activeClassId);
    if (id === 'wizard') return { ...patch };
    const shared = {}, personal = { ...createClassProfile(id), ...copy(player.classProfiles?.[id] || {}) };
    let changed = false;
    for (const [key, value] of Object.entries(patch)) {
        if (classFields.has(key)) { personal[key] = copy(value); changed = true; }
        else if (key !== 'classProfiles') shared[key] = value;
    }
    if (changed) {
        player.classProfiles = { ...player.classProfiles, [id]: personal };
        shared.classProfiles = copy(player.classProfiles);
    }
    return shared;
}
