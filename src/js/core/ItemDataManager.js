import Logger from '../utils/Logger.js';
import {
    resolveDurableBossEntitlementPolicy,
    resolveLegacyBossEntitlementMigration
} from './DurableBossRewardPolicy.js';

const ITEM_CATALOG_PATH = '/assets/data/items/item_catalog.json';
const ITEM_DATA_BASE_PATH = '/assets/data/items/';

const LEGACY_ITEM_CATALOG = {
    items: [
        'magic_staff.json',
        'tidal_staff.json',
        'storm_staff.json',
        'astral_staff.json',
        'blessed_magic_staff.json',
        'blessed_tidal_staff.json',
        'blessed_storm_staff.json',
        'blessed_astral_staff.json',
        'weapon_upgrade_stone.json',
        'blessed_weapon_upgrade_stone.json',
        'option_reroll_stone.json',
        'boss_summon_scroll_king_slime.json',
        'boss_summon_scroll_ruin_wobbuffet.json',
        'boss_summon_scroll_thunder_pikachu.json',
        'boss_summon_scroll_astral_sylveon.json'
    ],
    affixPools: [
        'magic_staff_affixes.json',
        'tidal_staff_affixes.json',
        'storm_staff_affixes.json',
        'astral_staff_affixes.json',
        'blessed_magic_staff_affixes.json',
        'blessed_tidal_staff_affixes.json',
        'blessed_storm_staff_affixes.json',
        'blessed_astral_staff_affixes.json'
    ],
    enhancementRules: [
        'equipment_enhancement_rules.json'
    ],
    dropRules: [
        'equipment_drop_rules.json'
    ]
};

const ENHANCEMENT_VISUAL_STYLES = [
    {
        minLevel: 10,
        cssClass: 'enhancement-tier-10',
        tier: 'gold',
        borderColor: '#f5c84f',
        glowColor: 'rgba(245, 200, 79, 0.64)',
        innerGlow: 'rgba(255, 243, 196, 0.58)',
        softLight: 'rgba(255, 226, 122, 0.28)',
        badgeTextColor: '#fff8db',
        badgeBg: 'rgba(122, 88, 18, 0.9)',
        badgeBorder: 'rgba(255, 232, 152, 0.92)',
        auraBaseColor: '#f0c549',
        auraSecondaryColor: '#fff0a8',
        auraAccentColor: '#fff8df',
        intensity: 'ascended',
        spark: true,
        glitter: true,
        whiteCore: true,
        ribbonCount: 4,
        sparkCount: 8,
        moteCount: 10,
        shellOpacity: 0.54,
        floorOpacity: 0.4
    },
    {
        minLevel: 9,
        cssClass: 'enhancement-tier-9',
        tier: 'crimson',
        borderColor: '#ff646b',
        glowColor: 'rgba(255, 100, 107, 0.58)',
        innerGlow: 'rgba(255, 196, 196, 0.44)',
        softLight: 'rgba(255, 127, 132, 0.24)',
        badgeTextColor: '#fff3f4',
        badgeBg: 'rgba(120, 25, 28, 0.88)',
        badgeBorder: 'rgba(255, 168, 171, 0.88)',
        auraBaseColor: '#ff5c63',
        auraSecondaryColor: '#ffd1d4',
        auraAccentColor: '#ffb28f',
        intensity: 'epic',
        spark: true,
        glitter: true,
        whiteCore: false,
        ribbonCount: 3,
        sparkCount: 6,
        moteCount: 8,
        shellOpacity: 0.46,
        floorOpacity: 0.34
    },
    {
        minLevel: 8,
        cssClass: 'enhancement-tier-8',
        tier: 'azure',
        borderColor: '#64a8ff',
        glowColor: 'rgba(100, 168, 255, 0.52)',
        innerGlow: 'rgba(194, 229, 255, 0.42)',
        softLight: 'rgba(136, 198, 255, 0.22)',
        badgeTextColor: '#eef7ff',
        badgeBg: 'rgba(29, 66, 122, 0.84)',
        badgeBorder: 'rgba(177, 220, 255, 0.86)',
        auraBaseColor: '#58a7ff',
        auraSecondaryColor: '#dff3ff',
        auraAccentColor: '#9fd7ff',
        intensity: 'stronger',
        spark: true,
        glitter: false,
        whiteCore: false,
        ribbonCount: 2,
        sparkCount: 5,
        moteCount: 5,
        shellOpacity: 0.38,
        floorOpacity: 0.28
    },
    {
        minLevel: 7,
        cssClass: 'enhancement-tier-7',
        tier: 'verdant',
        borderColor: '#5ad96f',
        glowColor: 'rgba(90, 217, 111, 0.48)',
        innerGlow: 'rgba(198, 255, 206, 0.38)',
        softLight: 'rgba(122, 240, 150, 0.2)',
        badgeTextColor: '#effff2',
        badgeBg: 'rgba(27, 102, 49, 0.82)',
        badgeBorder: 'rgba(178, 255, 194, 0.84)',
        auraBaseColor: '#55d86e',
        auraSecondaryColor: '#dbffe0',
        auraAccentColor: '#9ef6b6',
        intensity: 'strong',
        spark: false,
        glitter: false,
        whiteCore: false,
        ribbonCount: 2,
        sparkCount: 0,
        moteCount: 4,
        shellOpacity: 0.3,
        floorOpacity: 0.24
    }
];

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

const REMOVED_LEGACY_ITEM_IDS = new Set(['slime_gel', 'potion_hp_small', 'royal_jelly', 'king_crown']);

export default class ItemDataManager {
    constructor(resourceManager) {
        this.resourceManager = resourceManager;
        this.itemDefinitions = new Map();
        this.affixPools = new Map();
        this.affixesById = new Map();
        this.enhancementRuleSets = new Map();
        this.globalDrops = [];
        this.normalDropsByMonster = new Map();
        this.bossDropsByMonster = new Map();
        this.bossBonusDropsByMonster = new Map();
        this.loadedCatalog = null;
    }

    async loadAll() {
        try {
            const catalog = await this._loadCatalog();
            const [itemDefinitions, affixPools, enhancementRuleDocuments, dropRuleDocuments] = await Promise.all([
                this._loadCatalogEntries(catalog.items),
                this._loadCatalogEntries(catalog.affixPools),
                this._loadCatalogEntries(catalog.enhancementRules),
                this._loadCatalogEntries(catalog.dropRules)
            ]);

            this.itemDefinitions.clear();
            this.affixPools.clear();
            this.affixesById.clear();
            this.enhancementRuleSets.clear();
            this.normalDropsByMonster.clear();
            this.bossDropsByMonster.clear();
            this.bossBonusDropsByMonster.clear();

            itemDefinitions.forEach((definition) => {
                if (definition?.id) this.itemDefinitions.set(definition.id, definition);
            });

            affixPools.forEach((affixPool) => {
                if (!affixPool?.id || !Array.isArray(affixPool.affixes)) return;
                this.affixPools.set(affixPool.id, affixPool);
                affixPool.affixes.forEach((affix) => {
                    if (affix?.id) this.affixesById.set(affix.id, affix);
                });
            });

            enhancementRuleDocuments.forEach((document) => {
                if (!Array.isArray(document?.ruleSets)) return;
                document.ruleSets.forEach((ruleSet) => {
                    if (ruleSet?.id) this.enhancementRuleSets.set(ruleSet.id, ruleSet);
                });
            });

            this.globalDrops = dropRuleDocuments.flatMap((document) => (
                Array.isArray(document?.globalDrops) ? document.globalDrops : []
            ));
            dropRuleDocuments.forEach((document) => {
                if (!Array.isArray(document?.normalDrops)) return;
                document.normalDrops.forEach((drop) => {
                    if (!drop?.monsterId) return;
                    const list = this.normalDropsByMonster.get(drop.monsterId) || [];
                    list.push(drop);
                    this.normalDropsByMonster.set(drop.monsterId, list);
                });
            });
            dropRuleDocuments.forEach((document) => {
                if (!Array.isArray(document?.bossDrops)) return;
                document.bossDrops.forEach((drop) => {
                    if (!drop?.monsterId) return;
                    const list = this.bossDropsByMonster.get(drop.monsterId) || [];
                    list.push(drop);
                    this.bossDropsByMonster.set(drop.monsterId, list);
                });
            });
            dropRuleDocuments.forEach((document) => {
                if (!Array.isArray(document?.bossBonusDrops)) return;
                document.bossBonusDrops.forEach((drop) => {
                    if (!drop?.monsterId) return;
                    const list = this.bossBonusDropsByMonster.get(drop.monsterId) || [];
                    list.push(drop);
                    this.bossBonusDropsByMonster.set(drop.monsterId, list);
                });
            });

            this.loadedCatalog = catalog;
        } catch (error) {
            Logger.error('Failed to load item data', error);
        }
    }

    async _loadCatalog() {
        try {
            const catalog = await this.resourceManager.loadJSON(ITEM_CATALOG_PATH);
            if (!catalog || !Array.isArray(catalog.items)) {
                throw new Error('Item catalog is missing its items array');
            }
            return catalog;
        } catch (error) {
            Logger.warn('Item catalog unavailable; loading the legacy item manifest', error);
            return LEGACY_ITEM_CATALOG;
        }
    }

    async _loadCatalogEntries(entries) {
        const normalizedEntries = Array.isArray(entries)
            ? entries
            : (entries ? [entries] : []);
        return Promise.all(normalizedEntries.map((entry) => (
            this.resourceManager.loadJSON(this._resolveCatalogEntryPath(entry))
        )));
    }

    _resolveCatalogEntryPath(entry) {
        const file = typeof entry === 'string'
            ? entry
            : (entry?.file || entry?.path);
        if (!file || typeof file !== 'string') {
            throw new Error('Item catalog entry must contain a file path');
        }
        if (file.startsWith('/')) return file;
        return `${ITEM_DATA_BASE_PATH}${file.replace(/^\.\//, '')}`;
    }

    getItemDefinition(id) {
        if (REMOVED_LEGACY_ITEM_IDS.has(id)) return null;
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

    getDurableEntitlementPolicy(item) {
        return resolveDurableBossEntitlementPolicy(item);
    }

    isDurableEntitlement(item) {
        const version = Number(item?.durableEntitlementVersion);
        return Number.isInteger(version) && version > 0;
    }

    getEffectiveItemDefinition(item) {
        if (!item) return null;
        const durablePolicy = this.getDurableEntitlementPolicy(item);
        if (!durablePolicy) {
            return this.isDurableEntitlement(item)
                ? null
                : this.getItemDefinition(item.type || item.id);
        }
        const policy = durablePolicy.item;
        // Durable boss weapons intentionally take combat data only from the
        // immutable reward archive. Presentation-only tooltip metadata is safe
        // to read from the live catalog, and keeps their detail panel aligned
        // with ordinary/blessed weapons (class, material, weight, trade flags).
        const presentationDefinition = this.getItemDefinition(durablePolicy.itemId);
        return {
            id: durablePolicy.itemId,
            name: policy.name,
            description: policy.description || '',
            stackable: false,
            slot: 'weapon',
            rarity: policy.rarity || 'boss',
            baseStats: policy.baseStats,
            enhancementBonuses: policy.enhancementBonuses,
            enhancementRuleSet: policy.enhancementRuleSet,
            icon: {
                fallbackEmoji: policy.icon,
                path: policy.iconPath
            },
            visuals: policy.visuals || null,
            inventoryTooltip: presentationDefinition?.inventoryTooltip
                ? { ...presentationDefinition.inventoryTooltip }
                : null
        };
    }

    getEffectiveAffixDefinition(item) {
        if (!item) return null;
        const durablePolicy = this.getDurableEntitlementPolicy(item);
        if (durablePolicy) return durablePolicy.affix;
        return this.isDurableEntitlement(item) ? null : this.getAffixDefinition(item.prefixId);
    }

    getEffectiveEnhancementRuleSet(item) {
        if (!item) return null;
        const durablePolicy = this.getDurableEntitlementPolicy(item);
        if (durablePolicy) return durablePolicy.enhancementRuleSet;
        if (this.isDurableEntitlement(item)) return null;
        const definition = this.getItemDefinition(item.type || item.id);
        return this.getEnhancementRuleSet(item.enhancementRuleSet || definition?.enhancementRuleSet);
    }

    getGlobalDrops() {
        return this.globalDrops.slice();
    }

    getNormalDrops(monsterId) {
        return (this.normalDropsByMonster.get(monsterId) || []).slice();
    }

    getBossDrops(monsterId) {
        return (this.bossDropsByMonster.get(monsterId) || []).slice();
    }

    getBossBonusDrops(monsterId) {
        return (this.bossBonusDropsByMonster.get(monsterId) || []).slice();
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
        const instanceId = seedData.instanceId || this._createInstanceId();

        const pool = this.getAffixPool(definition.prefixPool);
        const affix = seedData.prefixId
            ? this.getAffixDefinition(seedData.prefixId)
            : this._pickRandom(pool?.affixes || []);

        const rolledValues = seedData.rolledValues
            ? { ...this._rollAffixValues(affix, instanceId), ...seedData.rolledValues }
            : this._rollAffixValues(affix, instanceId);

        const instance = {
            id: definition.id,
            type: definition.id,
            instanceId,
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
            isNewlyAcquired: !!seedData.isNewlyAcquired,
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
        if (item.type === 'manastone' || item.type === 'gold') return item;
        if (REMOVED_LEGACY_ITEM_IDS.has(item.type || item.id)) return null;

        // Resolve durable weapons exclusively from the append-only policy. This
        // both survives live catalog drift and prevents saved profile fields from
        // redefining the weapon's stats, affix hooks, or visuals.
        const legacyMigration = this.isDurableEntitlement(item)
            ? null
            : resolveLegacyBossEntitlementMigration(item);
        const entitlementItem = legacyMigration?.migratedItem || item;
        if (this.isDurableEntitlement(entitlementItem)) {
            const durablePolicy = this.getDurableEntitlementPolicy(entitlementItem);
            if (!durablePolicy
                || typeof entitlementItem.instanceId !== 'string'
                || !entitlementItem.instanceId
                || entitlementItem.instanceId.length > 128) return null;
            const policy = durablePolicy.item;
            const affix = durablePolicy.affix;
            const rawEnhancementLevel = Number(entitlementItem.enhancementLevel || 0);
            const enhancementLevel = Number.isFinite(rawEnhancementLevel)
                ? Math.max(0, Math.min(
                    durablePolicy.enhancementRuleSet?.maxLevel || 10,
                    Math.floor(rawEnhancementLevel)
                ))
                : 0;
            return {
                id: durablePolicy.itemId,
                type: durablePolicy.itemId,
                amount: 1,
                instanceId: entitlementItem.instanceId,
                name: affix.displayName || policy.name,
                baseName: policy.name,
                icon: policy.icon,
                iconPath: policy.iconPath,
                stackable: false,
                slot: 'weapon',
                rarity: policy.rarity || 'boss',
                prefixId: affix.id,
                prefix: affix.prefix || null,
                rolledValues: Object.fromEntries(
                    Object.keys(affix.rolledEffects || {}).map((key) => [key, Number(entitlementItem.rolledValues[key])])
                ),
                isNewlyAcquired: !!entitlementItem.isNewlyAcquired,
                enhancementLevel,
                enhancementRuleSet: policy.enhancementRuleSet,
                enhancementBonuses: { ...policy.enhancementBonuses },
                baseStats: { ...policy.baseStats },
                description: policy.description || '',
                visuals: policy.visuals || null,
                durableEntitlementVersion: durablePolicy.version,
                durableEntitlementBossTypeId: durablePolicy.bossTypeId
            };
        }

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

    getEnhancementVisualStyle(itemOrLevel) {
        const level = Math.max(
            0,
            typeof itemOrLevel === 'number'
                ? itemOrLevel
                : Number(itemOrLevel?.enhancementLevel || 0)
        );
        const baseStyle = ENHANCEMENT_VISUAL_STYLES.find((entry) => level >= entry.minLevel);
        if (!baseStyle) return null;

        if (level <= 10) return { ...baseStyle, level };

        const overflow = level - 10;
        return {
            ...baseStyle,
            level,
            glowColor: `rgba(245, 200, 79, ${Math.min(0.82, 0.64 + overflow * 0.04)})`,
            shellOpacity: Math.min(0.72, (baseStyle.shellOpacity || 0.54) + overflow * 0.04),
            floorOpacity: Math.min(0.58, (baseStyle.floorOpacity || 0.4) + overflow * 0.03),
            ribbonCount: (baseStyle.ribbonCount || 4) + Math.min(2, overflow),
            sparkCount: (baseStyle.sparkCount || 8) + Math.min(4, overflow * 2),
            moteCount: (baseStyle.moteCount || 10) + Math.min(6, overflow * 2)
        };
    }

    getAuraState(item) {
        if (!item) return null;
        const definition = this.getEffectiveItemDefinition(item);
        const affix = this.getEffectiveAffixDefinition(item);
        if (!definition?.visuals?.equipAura || !affix) return null;

        const auraConfig = definition.visuals.equipAura;
        const auraProfileId = affix.visuals?.auraProfile;
        const auraProfile = auraConfig.prefixAuraProfiles?.[auraProfileId];
        if (!auraProfile) return null;

        const level = Math.max(0, item.enhancementLevel || 0);
        const stage = (auraConfig.enhancementStages || []).find((entry) => (
            level >= (entry.minLevel ?? 0) && level <= (entry.maxLevel ?? 99)
        )) || null;
        const enhancementVisual = this.getEnhancementVisualStyle(level);

        return {
            prefixId: item.prefixId,
            level,
            baseColor: enhancementVisual?.auraBaseColor || auraProfile.baseColor,
            secondaryColor: enhancementVisual?.auraSecondaryColor || auraProfile.secondaryColor,
            accentColor: enhancementVisual?.auraAccentColor || auraProfile.secondaryColor,
            particleStyle: enhancementVisual?.tier || auraProfile.particleStyle,
            intensity: enhancementVisual?.intensity || stage?.intensity || 'soft',
            spark: enhancementVisual?.spark ?? !!stage?.spark,
            glitter: enhancementVisual?.glitter ?? !!stage?.glitter,
            whiteCore: enhancementVisual?.whiteCore ?? !!stage?.whiteCore,
            enhancementCssClass: enhancementVisual?.cssClass || null,
            enhancementTier: enhancementVisual?.tier || null,
            ribbonCount: enhancementVisual?.ribbonCount || 0,
            sparkCount: enhancementVisual?.sparkCount || 0,
            moteCount: enhancementVisual?.moteCount || 0,
            shellOpacity: enhancementVisual?.shellOpacity,
            floorOpacity: enhancementVisual?.floorOpacity
        };
    }

    rerollEquipmentOptions(item, options = {}) {
        if (!item || item.slot !== 'weapon') {
            return { ok: false, message: '옵션을 변경할 무기를 선택해 주세요.' };
        }

        const definition = this.getEffectiveItemDefinition(item);
        let affix = this.getEffectiveAffixDefinition(item);
        if (!affix && definition?.prefixPool) {
            const pool = this.getAffixPool(definition.prefixPool);
            affix = this._pickRandom(pool?.affixes || []);
        }

        const effectRules = affix?.rolledEffects || {};
        const entries = Object.entries(effectRules);
        if (!affix || entries.length === 0) {
            return { ok: false, message: '이 무기는 변경할 옵션이 없습니다.' };
        }

        const previousValues = { ...(item.rolledValues || {}) };
        const nextValues = {};
        let hasUpgradeableValue = false;
        let hasImprovement = false;

        entries.forEach(([key, rule]) => {
            const min = Number.isFinite(Number(rule?.min)) ? Number(rule.min) : 0;
            const max = Number.isFinite(Number(rule?.max)) ? Number(rule.max) : min;
            const currentRaw = Number(previousValues[key]);
            const current = Number.isFinite(currentRaw)
                ? Math.max(min, Math.min(max, currentRaw))
                : min;
            const floor = Math.min(max, Math.max(min, current));
            if (floor < max - 1e-9) hasUpgradeableValue = true;
            const raw = floor + (Math.random() * Math.max(0, max - floor));
            const rounded = Math.max(floor, Math.min(max, Math.round(raw * 100) / 100));
            nextValues[key] = rounded;
            if (rounded > current + 1e-9) hasImprovement = true;
        });

        if (!hasUpgradeableValue) {
            return { ok: false, message: '이미 모든 옵션이 최대치입니다.' };
        }

        if (!hasImprovement) {
            const upgradeEntry = entries.find(([key, rule]) => {
                const max = Number.isFinite(Number(rule?.max)) ? Number(rule.max) : Number(rule?.min || 0);
                const current = Number(nextValues[key]);
                return Number.isFinite(current) && current < max - 1e-9;
            });
            if (upgradeEntry) {
                const [key, rule] = upgradeEntry;
                const max = Number.isFinite(Number(rule?.max)) ? Number(rule.max) : Number(rule?.min || 0);
                nextValues[key] = Math.min(max, Math.round((nextValues[key] + 0.01) * 100) / 100);
                hasImprovement = true;
            }
        }

        const previousSnapshot = {
            name: item.name,
            prefixId: item.prefixId,
            prefix: item.prefix,
            rolledValues: previousValues
        };

        item.prefixId = affix.id || item.prefixId || null;
        item.prefix = affix.prefix || item.prefix || null;
        item.name = affix.displayName || item.name || definition?.name || item.type || item.id;
        item.rolledValues = nextValues;

        return {
            ok: true,
            item,
            affix,
            previousValues,
            rolledValues: nextValues,
            previousSnapshot,
            improved: hasImprovement
        };
    }

    getEnhancementConfig(item) {
        if (!item) return null;
        const ruleSet = this.getEffectiveEnhancementRuleSet(item);
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

    _rollAffixValues(affix, seed = null) {
        const rolledValues = {};
        const entries = Object.entries(affix?.rolledEffects || {});
        entries.forEach(([key, rule]) => {
            const min = typeof rule.min === 'number' ? rule.min : 0;
            const max = typeof rule.max === 'number' ? rule.max : min;
            const randomUnit = seed ? this._seededUnitRandom(`${seed}:${affix?.id || 'affix'}:${key}`) : Math.random();
            const raw = min + (randomUnit * (max - min));
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

    _seededUnitRandom(seedText) {
        let hash = 2166136261;
        const text = String(seedText || 'seed');
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return ((hash >>> 0) % 1000000) / 1000000;
    }
}
