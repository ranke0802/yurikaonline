import Logger from '../utils/Logger.js';

const ITEM_FILES = {
    magic_staff: '/assets/data/items/magic_staff.json',
    magic_staff_affixes: '/assets/data/items/magic_staff_affixes.json',
    equipment_enhancement_rules: '/assets/data/items/equipment_enhancement_rules.json',
    weapon_upgrade_stone: '/assets/data/items/weapon_upgrade_stone.json',
    equipment_drop_rules: '/assets/data/items/equipment_drop_rules.json'
};

const LEGACY_ITEM_DEFINITIONS = {
    slime_gel: {
        id: 'slime_gel',
        name: '슬라임 젤',
        stackable: true,
        icon: { fallbackEmoji: '🟢' },
        rarity: 'common',
        description: ''
    },
    potion_hp_small: {
        id: 'potion_hp_small',
        name: '소형 HP 포션',
        stackable: true,
        icon: { fallbackEmoji: '🧪' },
        rarity: 'common',
        description: ''
    },
    royal_jelly: {
        id: 'royal_jelly',
        name: '로열 젤리',
        stackable: true,
        icon: { fallbackEmoji: '🍯' },
        rarity: 'rare',
        description: ''
    },
    king_crown: {
        id: 'king_crown',
        name: '킹 크라운',
        stackable: true,
        icon: { fallbackEmoji: '👑' },
        rarity: 'boss',
        description: ''
    }
};

const DEFAULT_STACKABLE_ICON = '🎁';
const DEFAULT_EQUIPMENT_ICON = '🪄';

export default class ItemDataManager {
    constructor(resourceManager) {
        this.resourceManager = resourceManager;
        this.itemDefinitions = new Map();
        this.affixPools = new Map();
        this.affixesById = new Map();
        this.enhancementRuleSets = new Map();
        this.globalDrops = [];
        this.bossDropsByMonster = new Map();
    }

    async loadAll() {
        try {
            const [magicStaff, affixPool, enhancementRules, upgradeStone, dropRules] = await Promise.all([
                this.resourceManager.loadJSON(ITEM_FILES.magic_staff),
                this.resourceManager.loadJSON(ITEM_FILES.magic_staff_affixes),
                this.resourceManager.loadJSON(ITEM_FILES.equipment_enhancement_rules),
                this.resourceManager.loadJSON(ITEM_FILES.weapon_upgrade_stone),
                this.resourceManager.loadJSON(ITEM_FILES.equipment_drop_rules)
            ]);

            if (magicStaff?.id) this.itemDefinitions.set(magicStaff.id, magicStaff);
            if (upgradeStone?.id) this.itemDefinitions.set(upgradeStone.id, upgradeStone);

            if (affixPool?.id && Array.isArray(affixPool.affixes)) {
                this.affixPools.set(affixPool.id, affixPool);
                affixPool.affixes.forEach((affix) => {
                    if (affix?.id) this.affixesById.set(affix.id, affix);
                });
            }

            if (Array.isArray(enhancementRules?.ruleSets)) {
                enhancementRules.ruleSets.forEach((ruleSet) => {
                    if (ruleSet?.id) this.enhancementRuleSets.set(ruleSet.id, ruleSet);
                });
            }

            this.globalDrops = Array.isArray(dropRules?.globalDrops) ? dropRules.globalDrops : [];
            this.bossDropsByMonster.clear();
            if (Array.isArray(dropRules?.bossDrops)) {
                dropRules.bossDrops.forEach((drop) => {
                    if (!drop?.monsterId) return;
                    const list = this.bossDropsByMonster.get(drop.monsterId) || [];
                    list.push(drop);
                    this.bossDropsByMonster.set(drop.monsterId, list);
                });
            }
        } catch (error) {
            Logger.error('Failed to load item data', error);
        }
    }

    getItemDefinition(id) {
        return this.itemDefinitions.get(id) || LEGACY_ITEM_DEFINITIONS[id] || null;
    }

    getAffixPool(id) {
        return this.affixPools.get(id) || null;
    }

    getAffixDefinition(id) {
        return this.affixesById.get(id) || null;
    }

    getEnhancementRuleSet(id) {
        return this.enhancementRuleSets.get(id) || null;
    }

    getGlobalDrops() {
        return this.globalDrops.slice();
    }

    getBossDrops(monsterId) {
        return (this.bossDropsByMonster.get(monsterId) || []).slice();
    }

    createRewardItem(itemId, options = {}) {
        const definition = this.getItemDefinition(itemId);
        if (!definition) {
            return {
                id: itemId,
                type: itemId,
                amount: Math.max(1, options.amount || 1),
                name: itemId,
                icon: DEFAULT_STACKABLE_ICON,
                stackable: true
            };
        }

        if (definition.stackable === false) {
            return this.createEquipmentInstance(itemId, options);
        }

        const amount = Math.max(1, options.amount || 1);
        return {
            id: definition.id,
            type: definition.id,
            amount,
            name: definition.name,
            icon: definition.icon?.fallbackEmoji || DEFAULT_STACKABLE_ICON,
            iconPath: definition.icon?.path || null,
            stackable: true,
            rarity: definition.rarity || 'common',
            description: definition.description || '',
            maxStack: definition.maxStack || 999
        };
    }

    createEquipmentInstance(itemId, seedData = {}) {
        const definition = this.getItemDefinition(itemId);
        if (!definition) return null;

        const pool = this.getAffixPool(definition.prefixPool);
        const affix = seedData.prefixId
            ? this.getAffixDefinition(seedData.prefixId)
            : this._pickRandom(pool?.affixes || []);

        const rolledValues = seedData.rolledValues
            ? { ...seedData.rolledValues }
            : this._rollAffixValues(affix);

        const instance = {
            id: definition.id,
            type: definition.id,
            instanceId: seedData.instanceId || this._createInstanceId(),
            name: affix?.displayName || definition.name,
            baseName: definition.name,
            icon: definition.icon?.fallbackEmoji || DEFAULT_EQUIPMENT_ICON,
            iconPath: definition.icon?.path || null,
            stackable: false,
            amount: 1,
            slot: definition.slot || 'weapon',
            rarity: definition.rarity || 'common',
            prefixId: affix?.id || null,
            prefix: affix?.prefix || null,
            rolledValues,
            enhancementLevel: Math.max(0, seedData.enhancementLevel || 0),
            enhancementRuleSet: seedData.enhancementRuleSet || definition.enhancementRuleSet || null,
            enhancementBonuses: {
                ...(definition.enhancementBonuses || {})
            },
            baseStats: {
                ...(definition.baseStats || {})
            },
            description: definition.description || '',
            visuals: seedData.visuals || definition.visuals || null
        };

        return instance;
    }

    normalizeInventoryItem(item) {
        if (!item) return null;
        if (item.type === 'gold') return item;

        const definition = this.getItemDefinition(item.type || item.id);
        if (!definition) {
            return {
                ...item,
                name: item.name || item.type || item.id || '',
                icon: item.icon || DEFAULT_STACKABLE_ICON,
                amount: Math.max(1, item.amount || 1)
            };
        }

        if (definition.stackable === false || item.instanceId) {
            return this.createEquipmentInstance(definition.id, item);
        }

        const isLegacyDefinition = LEGACY_ITEM_DEFINITIONS[definition.id] === definition;
        const shouldRestoreLegacyName = isLegacyDefinition
            && (!item.name || item.name === item.type || item.name === item.id || item.name === definition.id);
        const shouldRestoreLegacyIcon = isLegacyDefinition
            && (!item.icon || item.icon === DEFAULT_STACKABLE_ICON);

        return {
            id: definition.id,
            type: definition.id,
            amount: Math.max(1, item.amount || 1),
            name: shouldRestoreLegacyName ? definition.name : (item.name || definition.name),
            icon: shouldRestoreLegacyIcon ? (definition.icon?.fallbackEmoji || DEFAULT_STACKABLE_ICON) : (item.icon || definition.icon?.fallbackEmoji || DEFAULT_STACKABLE_ICON),
            iconPath: item.iconPath || definition.icon?.path || null,
            stackable: true,
            rarity: item.rarity || definition.rarity || 'common',
            description: item.description || definition.description || '',
            maxStack: definition.maxStack || 999
        };
    }

    normalizeEquipmentData(equipment) {
        return {
            weapon: equipment?.weapon ? this.normalizeInventoryItem(equipment.weapon) : null
        };
    }

    getDisplayName(item) {
        if (!item) return '';
        if (item.name) return item.name;
        const definition = this.getItemDefinition(item.type || item.id);
        return definition?.name || item.type || item.id || '';
    }

    getAuraState(item) {
        if (!item) return null;
        const definition = this.getItemDefinition(item.type || item.id);
        const affix = this.getAffixDefinition(item.prefixId);
        if (!definition?.visuals?.equipAura || !affix) return null;

        const auraConfig = definition.visuals.equipAura;
        const auraProfileId = affix.visuals?.auraProfile;
        const auraProfile = auraConfig.prefixAuraProfiles?.[auraProfileId];
        if (!auraProfile) return null;

        const level = Math.max(0, item.enhancementLevel || 0);
        const stage = (auraConfig.enhancementStages || []).find((entry) => (
            level >= (entry.minLevel ?? 0) && level <= (entry.maxLevel ?? 99)
        )) || null;

        return {
            prefixId: item.prefixId,
            level,
            baseColor: auraProfile.baseColor,
            secondaryColor: auraProfile.secondaryColor,
            particleStyle: auraProfile.particleStyle,
            intensity: stage?.intensity || 'soft',
            spark: !!stage?.spark,
            glitter: !!stage?.glitter,
            whiteCore: !!stage?.whiteCore
        };
    }

    getEnhancementConfig(item) {
        if (!item) return null;
        const definition = this.getItemDefinition(item.type || item.id);
        const ruleSetId = item.enhancementRuleSet || definition?.enhancementRuleSet;
        const ruleSet = this.getEnhancementRuleSet(ruleSetId);
        if (!ruleSet) return null;

        const nextLevel = Math.min(ruleSet.maxLevel || 10, Math.max(0, item.enhancementLevel || 0) + 1);
        const levelConfig = ruleSet.levels?.[String(nextLevel)] || null;
        if (!levelConfig) return null;

        return {
            nextLevel,
            maxLevel: ruleSet.maxLevel || 10,
            safeUntil: ruleSet.safeUntil || 0,
            successRate: levelConfig.successRate ?? 1,
            destroyChanceOnFail: levelConfig.destroyChanceOnFail ?? 0,
            keepLevelOnFail: ruleSet.failureMode?.keepLevelOnFail !== false
        };
    }

    formatPercent(value) {
        return `${Math.round((value || 0) * 100)}%`;
    }

    _rollAffixValues(affix) {
        const rolledValues = {};
        const entries = Object.entries(affix?.rolledEffects || {});
        entries.forEach(([key, rule]) => {
            const min = typeof rule.min === 'number' ? rule.min : 0;
            const max = typeof rule.max === 'number' ? rule.max : min;
            const raw = min + (Math.random() * (max - min));
            rolledValues[key] = Math.round(raw * 100) / 100;
        });
        return rolledValues;
    }

    _pickRandom(list) {
        if (!Array.isArray(list) || list.length === 0) return null;
        return list[Math.floor(Math.random() * list.length)] || null;
    }

    _createInstanceId() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return `item_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
}
