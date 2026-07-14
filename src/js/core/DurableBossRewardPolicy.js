function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach((entry) => deepFreeze(entry));
    return Object.freeze(value);
}

// Released durable entitlement policies are append-only. A pending receipt or
// saved boss weapon must keep the exact combat/visual/enhancement behavior it
// had when authored, even after the live item catalog changes.
export const DURABLE_BOSS_REWARD_ARCHIVED_CATALOGS = deepFreeze({
    1: {
        bosses: {
            king_slime: ['magic_staff'],
            ruin_wobbuffet: ['tidal_staff'],
            thunder_pikachu: ['storm_staff'],
            astral_sylveon: ['astral_staff']
        },
        // Boss progress receipts use the same append-only release policy as
        // guaranteed equipment. Receivers recompute EXP from these canonical
        // values instead of trusting numeric fields authored by another host.
        bossProgress: {
            king_slime: { level: 4, baseExp: 500 },
            ruin_wobbuffet: { level: 9, baseExp: 1800 },
            thunder_pikachu: { level: 14, baseExp: 8500 },
            astral_sylveon: { level: 20, baseExp: 42000 }
        },
        enhancementRuleSets: {
            weapon_standard_1_to_10: {
                id: 'weapon_standard_1_to_10',
                name: '무기 기본 강화 규칙',
                safeUntil: 6,
                maxLevel: 10,
                failureMode: {
                    keepLevelOnFail: true,
                    destroyOnFailFromLevel: 7
                },
                perLevelStatGain: {
                    attackPower: 1,
                    critRate: 0.01
                },
                levels: {
                    1: { successRate: 1, destroyChanceOnFail: 0 },
                    2: { successRate: 1, destroyChanceOnFail: 0 },
                    3: { successRate: 1, destroyChanceOnFail: 0 },
                    4: { successRate: 1, destroyChanceOnFail: 0 },
                    5: { successRate: 1, destroyChanceOnFail: 0 },
                    6: { successRate: 1, destroyChanceOnFail: 0 },
                    7: { successRate: 0.5, destroyChanceOnFail: 0.5 },
                    8: { successRate: 0.25, destroyChanceOnFail: 0.5 },
                    9: { successRate: 0.15, destroyChanceOnFail: 0.5 },
                    10: { successRate: 0.05, destroyChanceOnFail: 0.5 }
                }
            }
        },
        items: {
            magic_staff: {
                name: '마력의 지팡이',
                description: '',
                icon: '🪄',
                iconPath: 'src/assets/items/magic_staff_inventory.webp',
                rarity: 'boss',
                enhancementRuleSet: 'weapon_standard_1_to_10',
                baseStats: { attackPower: 5, critRate: 0.05, mpRegen: 3 },
                enhancementBonuses: { attackPowerPerLevel: 1, critRatePerLevel: 0.01 },
                visuals: {
                    equipAura: {
                        mode: 'prefix_plus_enhancement',
                        prefixAuraProfiles: {
                            starlight: {
                                baseColor: '#f7d774',
                                secondaryColor: '#fff7c2',
                                particleStyle: 'stardust'
                            },
                            blue_flame: {
                                baseColor: '#4cb7ff',
                                secondaryColor: '#9ee6ff',
                                particleStyle: 'blue_flame'
                            },
                            crimson_flash: {
                                baseColor: '#ff5b5b',
                                secondaryColor: '#ffc0c0',
                                particleStyle: 'red_spark'
                            }
                        },
                        enhancementStages: [
                            { minLevel: 0, maxLevel: 6, intensity: 'soft', spark: false, glitter: false, whiteCore: false },
                            { minLevel: 7, maxLevel: 7, intensity: 'strong', spark: false, glitter: false, whiteCore: false },
                            { minLevel: 8, maxLevel: 8, intensity: 'stronger', spark: true, glitter: false, whiteCore: false },
                            { minLevel: 9, maxLevel: 9, intensity: 'epic', spark: true, glitter: true, whiteCore: false },
                            { minLevel: 10, maxLevel: 10, intensity: 'ascended', spark: true, glitter: true, whiteCore: true }
                        ]
                    }
                },
                affixes: {
                    starlight: {
                        id: 'starlight',
                        prefix: '별빛의',
                        displayName: '별빛의 마력의 지팡이',
                        skillOverrides: { missileVisualVariant: 'golden_missile' },
                        rolledEffects: {
                            missileDamageBonus: { type: 'multiplier_bonus', min: 0.2, max: 0.5, displayAsPercent: true },
                            missileManaCostReduction: { type: 'multiplier_bonus', min: 0.1, max: 0.3, displayAsPercent: true }
                        },
                        visuals: { auraProfile: 'starlight', projectileTint: '#f5cf5b' }
                    },
                    blue_flame: {
                        id: 'blue_flame',
                        prefix: '푸른 불꽃의',
                        displayName: '푸른 불꽃의 마력의 지팡이',
                        skillOverrides: { fireballVisualVariant: 'blue_fireball' },
                        rolledEffects: {
                            fireballChainChance: { type: 'multiplier_bonus', min: 0.1, max: 0.5, displayAsPercent: true },
                            fireballChainDamageRatio: { type: 'multiplier_bonus', min: 0.3, max: 0.8, displayAsPercent: true }
                        },
                        visuals: { auraProfile: 'blue_flame', projectileTint: '#59c7ff' }
                    },
                    crimson_flash: {
                        id: 'crimson_flash',
                        prefix: '붉은 섬광의',
                        displayName: '붉은 섬광의 마력의 지팡이',
                        skillOverrides: { laserVisualVariant: 'crimson_chain' },
                        rolledEffects: {
                            laserDamageBonus: { type: 'multiplier_bonus', min: 0.2, max: 0.5, displayAsPercent: true },
                            attackSpeedBonus: { type: 'multiplier_bonus', min: 0.1, max: 0.3, displayAsPercent: true }
                        },
                        combatHooks: {
                            restoreHpPerLaserHit: 1,
                            restoreHpPerLaserHitByEnhancement: { 7: 2, 10: 3 },
                            keepMpRestore: true,
                            beamStyle: 'thick_red_arc'
                        },
                        visuals: { auraProfile: 'crimson_flash', projectileTint: '#ff5d66' }
                    }
                }
            },
            tidal_staff: {
                name: '해일의 지팡이',
                description: '안개빛 호수의 마력을 머금어 파이어볼을 푸른 연쇄 폭발로 바꿉니다.',
                icon: '🔱',
                iconPath: 'src/assets/items/tidal_staff.webp',
                rarity: 'boss',
                enhancementRuleSet: 'weapon_standard_1_to_10',
                baseStats: { attackPower: 8, critRate: 0.06, mpRegen: 4 },
                enhancementBonuses: { attackPowerPerLevel: 1, critRatePerLevel: 0.01 },
                visuals: {
                    equipAura: {
                        mode: 'prefix_plus_enhancement',
                        prefixAuraProfiles: {
                            tidal_blue: { baseColor: '#38c8f0', secondaryColor: '#c4f7ff', particleStyle: 'blue_flame' }
                        }
                    }
                },
                affixes: {
                    tidal_blue_flame: {
                        id: 'tidal_blue_flame',
                        prefix: '해일을 품은',
                        displayName: '해일을 품은 푸른 지팡이',
                        skillOverrides: { fireballVisualVariant: 'blue_fireball' },
                        rolledEffects: {
                            fireballChainChance: { type: 'multiplier_bonus', min: 0.24, max: 0.38, displayAsPercent: true },
                            fireballChainDamageRatio: { type: 'multiplier_bonus', min: 0.45, max: 0.65, displayAsPercent: true }
                        },
                        visuals: { auraProfile: 'tidal_blue', projectileTint: '#58ddff' }
                    }
                }
            },
            storm_staff: {
                name: '뇌광의 지팡이',
                description: '뇌광 숲의 응축된 전류로 매직 미사일을 황금 낙뢰탄으로 변화시킵니다.',
                icon: '⚡',
                iconPath: 'src/assets/items/storm_staff.webp',
                rarity: 'boss',
                enhancementRuleSet: 'weapon_standard_1_to_10',
                baseStats: { attackPower: 13, critRate: 0.07, mpRegen: 5 },
                enhancementBonuses: { attackPowerPerLevel: 1, critRatePerLevel: 0.01 },
                visuals: {
                    equipAura: {
                        mode: 'prefix_plus_enhancement',
                        prefixAuraProfiles: {
                            storm_gold: { baseColor: '#f2ca3c', secondaryColor: '#fff5ad', particleStyle: 'stardust' }
                        }
                    }
                },
                affixes: {
                    storm_starlight: {
                        id: 'storm_starlight',
                        prefix: '뇌광을 두른',
                        displayName: '뇌광을 두른 황금 지팡이',
                        skillOverrides: { missileVisualVariant: 'golden_missile' },
                        rolledEffects: {
                            missileDamageBonus: { type: 'multiplier_bonus', min: 0.42, max: 0.62, displayAsPercent: true },
                            missileManaCostReduction: { type: 'multiplier_bonus', min: 0.18, max: 0.32, displayAsPercent: true }
                        },
                        visuals: { auraProfile: 'storm_gold', projectileTint: '#ffe052' }
                    }
                }
            },
            astral_staff: {
                name: '성운의 지팡이',
                description: '별그늘 유적의 성좌 마력이 체인 라이트닝을 진홍빛 생명 흡수 번개로 바꿉니다.',
                icon: '🌌',
                iconPath: 'src/assets/items/astral_staff.webp',
                rarity: 'boss',
                enhancementRuleSet: 'weapon_standard_1_to_10',
                baseStats: { attackPower: 20, critRate: 0.09, mpRegen: 7 },
                enhancementBonuses: { attackPowerPerLevel: 1, critRatePerLevel: 0.01 },
                visuals: {
                    equipAura: {
                        mode: 'prefix_plus_enhancement',
                        prefixAuraProfiles: {
                            astral_crimson: { baseColor: '#e3538b', secondaryColor: '#ffd4f0', particleStyle: 'red_spark' }
                        }
                    }
                },
                affixes: {
                    astral_crimson_flash: {
                        id: 'astral_crimson_flash',
                        prefix: '성운을 가르는',
                        displayName: '성운을 가르는 진홍 지팡이',
                        skillOverrides: { laserVisualVariant: 'crimson_chain' },
                        rolledEffects: {
                            laserDamageBonus: { type: 'multiplier_bonus', min: 0.5, max: 0.72, displayAsPercent: true },
                            attackSpeedBonus: { type: 'multiplier_bonus', min: 0.18, max: 0.3, displayAsPercent: true }
                        },
                        combatHooks: {
                            restoreHpPerLaserHit: 2,
                            restoreHpPerLaserHitByEnhancement: { 7: 3, 10: 4 },
                            keepMpRestore: true,
                            beamStyle: 'thick_red_arc'
                        },
                        visuals: { auraProfile: 'astral_crimson', projectileTint: '#ff5f91' }
                    }
                }
            }
        }
    }
});

export function resolveDurableBossEntitlementPolicy(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const version = Number(item.durableEntitlementVersion);
    if (!Number.isInteger(version) || version <= 0) return null;

    const archive = DURABLE_BOSS_REWARD_ARCHIVED_CATALOGS[version];
    const itemId = typeof item.type === 'string' && item.type
        ? item.type
        : (typeof item.id === 'string' ? item.id : '');
    if (!archive || !itemId || (item.id && item.id !== itemId) || (item.type && item.type !== itemId)) return null;

    const bossTypeId = typeof item.durableEntitlementBossTypeId === 'string'
        ? item.durableEntitlementBossTypeId
        : '';
    const guaranteedItems = archive.bosses?.[bossTypeId];
    const itemPolicy = archive.items?.[itemId];
    const affixPolicy = itemPolicy?.affixes?.[item.prefixId];
    if (!Array.isArray(guaranteedItems)
        || !guaranteedItems.includes(itemId)
        || !itemPolicy
        || !affixPolicy) return null;

    const rollRules = affixPolicy.rolledEffects || {};
    const rolledValues = item.rolledValues;
    if (!rolledValues || typeof rolledValues !== 'object' || Array.isArray(rolledValues)) return null;
    const rollKeys = Object.keys(rolledValues).sort();
    const ruleKeys = Object.keys(rollRules).sort();
    if (rollKeys.length !== ruleKeys.length
        || rollKeys.some((key, index) => key !== ruleKeys[index])) return null;
    for (const [key, rule] of Object.entries(rollRules)) {
        const value = Number(rolledValues[key]);
        if (!Number.isFinite(value)
            || value < Number(rule.min) - 1e-9
            || value > Number(rule.max) + 1e-9) return null;
    }

    return {
        version,
        bossTypeId,
        itemId,
        item: itemPolicy,
        affix: affixPolicy,
        enhancementRuleSet: archive.enhancementRuleSets?.[itemPolicy.enhancementRuleSet] || null
    };
}

function hasExactNumericMap(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value).sort();
    const expectedKeys = Object.keys(expected || {}).sort();
    return keys.length === expectedKeys.length
        && keys.every((key, index) => (
            key === expectedKeys[index]
            && Number.isFinite(Number(value[key]))
            && Number(value[key]) === Number(expected[key])
        ));
}

// One-time migration for boss weapons saved before durable entitlement tags
// existed. Matching is deliberately strict: only a complete v1 equipment
// instance with the exact released stats/rule and a valid archived roll can be
// promoted. Ordinary equipment and modified/forged legacy records fail closed.
export function resolveLegacyBossEntitlementMigration(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
        || Object.prototype.hasOwnProperty.call(item, 'durableEntitlementVersion')) return null;

    const archive = DURABLE_BOSS_REWARD_ARCHIVED_CATALOGS[1];
    const itemId = typeof item.type === 'string' ? item.type : '';
    if (!itemId
        || item.id !== itemId
        || typeof item.instanceId !== 'string'
        || !item.instanceId
        || item.instanceId.length > 128
        || item.stackable !== false
        || item.slot !== 'weapon'
        || Number(item.amount || 1) !== 1
        || item.rarity !== 'boss') return null;

    const itemPolicy = archive.items?.[itemId];
    if (!itemPolicy
        || item.enhancementRuleSet !== itemPolicy.enhancementRuleSet
        || !hasExactNumericMap(item.baseStats, itemPolicy.baseStats)
        || !hasExactNumericMap(item.enhancementBonuses, itemPolicy.enhancementBonuses)) return null;

    const enhancementLevel = Number(item.enhancementLevel || 0);
    const maxLevel = Number(archive.enhancementRuleSets?.[itemPolicy.enhancementRuleSet]?.maxLevel || 10);
    if (!Number.isInteger(enhancementLevel)
        || enhancementLevel < 0
        || enhancementLevel > maxLevel) return null;

    const bossTypeIds = Object.entries(archive.bosses)
        .filter(([, itemIds]) => Array.isArray(itemIds) && itemIds.includes(itemId))
        .map(([bossTypeId]) => bossTypeId);
    if (bossTypeIds.length !== 1) return null;

    const migratedItem = {
        ...item,
        durableEntitlementVersion: 1,
        durableEntitlementBossTypeId: bossTypeIds[0]
    };
    const policy = resolveDurableBossEntitlementPolicy(migratedItem);
    return policy ? { policy, migratedItem } : null;
}
