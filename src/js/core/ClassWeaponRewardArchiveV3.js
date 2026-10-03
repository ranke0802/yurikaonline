// Frozen release candidate snapshot. Never regenerate an already released version.
// v1/v2 remain in DurableBossRewardPolicy.js; v3 is authored only with the class weapon gate.
export const CLASS_WEAPON_REWARD_ARCHIVE_V3 = {
  "bosses": {
    "king_slime": [
      "magic_staff",
      "magic_witch",
      "magic_warrior",
      "magic_archer"
    ],
    "ruin_wobbuffet": [
      "tidal_staff",
      "tidal_witch",
      "tidal_warrior",
      "tidal_archer"
    ],
    "thunder_pikachu": [
      "storm_staff",
      "storm_witch",
      "storm_warrior",
      "storm_archer"
    ],
    "astral_sylveon": [
      "astral_staff",
      "astral_witch",
      "astral_warrior",
      "astral_archer"
    ],
    "rift_sentinel": [
      "riftcore_staff",
      "riftcore_witch",
      "riftcore_warrior",
      "riftcore_archer"
    ]
  },
  "bossProgress": {
    "king_slime": {
      "level": 4,
      "baseExp": 500
    },
    "ruin_wobbuffet": {
      "level": 9,
      "baseExp": 1800
    },
    "thunder_pikachu": {
      "level": 14,
      "baseExp": 8500
    },
    "astral_sylveon": {
      "level": 20,
      "baseExp": 42000
    },
    "rift_sentinel": {
      "level": 24,
      "baseExp": 180000
    }
  },
  "enhancementRuleSets": {
    "weapon_standard_1_to_10": {
      "id": "weapon_standard_1_to_10",
      "name": "무기 기본 강화 규칙",
      "safeUntil": 6,
      "maxLevel": 10,
      "failureMode": {
        "keepLevelOnFail": true,
        "destroyOnFailFromLevel": 7
      },
      "perLevelStatGain": {
        "attackPower": 1,
        "critRate": 0.01
      },
      "levels": {
        "1": {
          "successRate": 1,
          "destroyChanceOnFail": 0
        },
        "2": {
          "successRate": 1,
          "destroyChanceOnFail": 0
        },
        "3": {
          "successRate": 1,
          "destroyChanceOnFail": 0
        },
        "4": {
          "successRate": 1,
          "destroyChanceOnFail": 0
        },
        "5": {
          "successRate": 1,
          "destroyChanceOnFail": 0
        },
        "6": {
          "successRate": 1,
          "destroyChanceOnFail": 0
        },
        "7": {
          "successRate": 0.5,
          "destroyChanceOnFail": 0.5
        },
        "8": {
          "successRate": 0.25,
          "destroyChanceOnFail": 0.5
        },
        "9": {
          "successRate": 0.15,
          "destroyChanceOnFail": 0.5
        },
        "10": {
          "successRate": 0.05,
          "destroyChanceOnFail": 0.5
        }
      }
    }
  },
  "items": {
    "magic_staff": {
      "name": "마력의 지팡이",
      "description": "",
      "icon": "🪄",
      "iconPath": "src/assets/items/magic_staff_inventory.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 7,
        "critRate": 0.05,
        "mpRegen": 3
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "starlight": {
              "baseColor": "#f7d774",
              "secondaryColor": "#fff7c2",
              "particleStyle": "stardust"
            },
            "blue_flame": {
              "baseColor": "#4cb7ff",
              "secondaryColor": "#9ee6ff",
              "particleStyle": "blue_flame"
            },
            "crimson_flash": {
              "baseColor": "#ff5b5b",
              "secondaryColor": "#ffc0c0",
              "particleStyle": "red_spark"
            }
          },
          "enhancementStages": [
            {
              "minLevel": 0,
              "maxLevel": 6,
              "intensity": "soft",
              "spark": false,
              "glitter": false,
              "whiteCore": false
            },
            {
              "minLevel": 7,
              "maxLevel": 7,
              "intensity": "strong",
              "spark": false,
              "glitter": false,
              "whiteCore": false
            },
            {
              "minLevel": 8,
              "maxLevel": 8,
              "intensity": "stronger",
              "spark": true,
              "glitter": false,
              "whiteCore": false
            },
            {
              "minLevel": 9,
              "maxLevel": 9,
              "intensity": "epic",
              "spark": true,
              "glitter": true,
              "whiteCore": false
            },
            {
              "minLevel": 10,
              "maxLevel": 10,
              "intensity": "ascended",
              "spark": true,
              "glitter": true,
              "whiteCore": true
            }
          ]
        }
      },
      "affixes": {
        "starlight": {
          "id": "starlight",
          "prefix": "별빛의",
          "displayName": "별빛의 마력의 지팡이",
          "skillOverrides": {
            "missileVisualVariant": "golden_missile"
          },
          "rolledEffects": {
            "missileDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.2,
              "max": 0.5,
              "displayAsPercent": true
            },
            "missileManaCostReduction": {
              "type": "multiplier_bonus",
              "min": 0.1,
              "max": 0.3,
              "displayAsPercent": true
            }
          },
          "visuals": {
            "auraProfile": "starlight",
            "projectileTint": "#f5cf5b"
          }
        },
        "blue_flame": {
          "id": "blue_flame",
          "prefix": "푸른 불꽃의",
          "displayName": "푸른 불꽃의 마력의 지팡이",
          "skillOverrides": {
            "fireballVisualVariant": "blue_fireball"
          },
          "rolledEffects": {
            "fireballChainChance": {
              "type": "multiplier_bonus",
              "min": 0.1,
              "max": 0.5,
              "displayAsPercent": true
            },
            "fireballChainDamageRatio": {
              "type": "multiplier_bonus",
              "min": 0.3,
              "max": 0.8,
              "displayAsPercent": true
            }
          },
          "visuals": {
            "auraProfile": "blue_flame",
            "projectileTint": "#59c7ff"
          }
        },
        "crimson_flash": {
          "id": "crimson_flash",
          "prefix": "붉은 섬광의",
          "displayName": "붉은 섬광의 마력의 지팡이",
          "skillOverrides": {
            "laserVisualVariant": "crimson_chain"
          },
          "rolledEffects": {
            "laserDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.2,
              "max": 0.5,
              "displayAsPercent": true
            },
            "attackSpeedBonus": {
              "type": "multiplier_bonus",
              "min": 0.1,
              "max": 0.3,
              "displayAsPercent": true
            }
          },
          "combatHooks": {
            "restoreHpPerLaserHit": 1,
            "restoreHpPerLaserHitByEnhancement": {
              "7": 2,
              "10": 3
            },
            "keepMpRestore": true,
            "beamStyle": "thick_red_arc"
          },
          "visuals": {
            "auraProfile": "crimson_flash",
            "projectileTint": "#ff5d66"
          }
        }
      }
    },
    "tidal_staff": {
      "name": "해일의 지팡이",
      "description": "안개빛 호수의 마력을 머금어 파이어볼을 푸른 연쇄 폭발로 바꿉니다.",
      "icon": "🔱",
      "iconPath": "src/assets/items/tidal_staff.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 9,
        "critRate": 0.06,
        "mpRegen": 4
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "tidal_blue": {
              "baseColor": "#38c8f0",
              "secondaryColor": "#c4f7ff",
              "particleStyle": "blue_flame"
            }
          }
        }
      },
      "affixes": {
        "tidal_blue_flame": {
          "id": "tidal_blue_flame",
          "prefix": "해일을 품은",
          "displayName": "해일을 품은 푸른 지팡이",
          "skillOverrides": {
            "fireballVisualVariant": "blue_fireball"
          },
          "rolledEffects": {
            "fireballChainChance": {
              "type": "multiplier_bonus",
              "min": 0.24,
              "max": 0.38,
              "displayAsPercent": true
            },
            "fireballChainDamageRatio": {
              "type": "multiplier_bonus",
              "min": 0.45,
              "max": 0.65,
              "displayAsPercent": true
            }
          },
          "visuals": {
            "auraProfile": "tidal_blue",
            "projectileTint": "#58ddff"
          }
        }
      }
    },
    "storm_staff": {
      "name": "뇌광의 지팡이",
      "description": "뇌광 숲의 응축된 전류로 매직 미사일을 황금 낙뢰탄으로 변화시킵니다.",
      "icon": "⚡",
      "iconPath": "src/assets/items/storm_staff.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 11,
        "critRate": 0.07,
        "mpRegen": 5
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "storm_gold": {
              "baseColor": "#f2ca3c",
              "secondaryColor": "#fff5ad",
              "particleStyle": "stardust"
            }
          }
        }
      },
      "affixes": {
        "storm_starlight": {
          "id": "storm_starlight",
          "prefix": "뇌광을 두른",
          "displayName": "뇌광을 두른 황금 지팡이",
          "skillOverrides": {
            "missileVisualVariant": "golden_missile"
          },
          "rolledEffects": {
            "missileDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.42,
              "max": 0.62,
              "displayAsPercent": true
            },
            "missileManaCostReduction": {
              "type": "multiplier_bonus",
              "min": 0.18,
              "max": 0.32,
              "displayAsPercent": true
            }
          },
          "visuals": {
            "auraProfile": "storm_gold",
            "projectileTint": "#ffe052"
          }
        }
      }
    },
    "astral_staff": {
      "name": "성운의 지팡이",
      "description": "별그늘 유적의 성좌 마력이 체인 라이트닝을 진홍빛 생명 흡수 번개로 바꿉니다.",
      "icon": "🌌",
      "iconPath": "src/assets/items/astral_staff.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 13,
        "critRate": 0.09,
        "mpRegen": 7
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "astral_crimson": {
              "baseColor": "#e3538b",
              "secondaryColor": "#ffd4f0",
              "particleStyle": "red_spark"
            }
          }
        }
      },
      "affixes": {
        "astral_crimson_flash": {
          "id": "astral_crimson_flash",
          "prefix": "성운을 가르는",
          "displayName": "성운을 가르는 진홍 지팡이",
          "skillOverrides": {
            "laserVisualVariant": "crimson_chain"
          },
          "rolledEffects": {
            "laserDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.5,
              "max": 0.72,
              "displayAsPercent": true
            },
            "attackSpeedBonus": {
              "type": "multiplier_bonus",
              "min": 0.18,
              "max": 0.3,
              "displayAsPercent": true
            }
          },
          "combatHooks": {
            "restoreHpPerLaserHit": 2,
            "restoreHpPerLaserHitByEnhancement": {
              "7": 3,
              "10": 4
            },
            "keepMpRestore": true,
            "beamStyle": "thick_red_arc"
          },
          "visuals": {
            "auraProfile": "astral_crimson",
            "projectileTint": "#ff5f91"
          }
        }
      }
    },
    "magic_witch": {
      "name": "마력의 마법서",
      "description": "위치 전용 마법서. 같은 지역·등급의 마법사 무기와 능력치 및 강화 규칙이 같습니다.",
      "icon": "📖",
      "iconPath": "assets/resource/classes/weapons/magic_witch.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 7,
        "critRate": 0.05,
        "mpRegen": 3
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "starlight": {
              "baseColor": "#f7d774",
              "secondaryColor": "#fff7c2",
              "particleStyle": "stardust"
            },
            "blue_flame": {
              "baseColor": "#4cb7ff",
              "secondaryColor": "#9ee6ff",
              "particleStyle": "blue_flame"
            },
            "crimson_flash": {
              "baseColor": "#ff5b5b",
              "secondaryColor": "#ffc0c0",
              "particleStyle": "red_spark"
            }
          },
          "enhancementStages": [
            {
              "minLevel": 0,
              "maxLevel": 6,
              "intensity": "soft",
              "spark": false,
              "glitter": false,
              "whiteCore": false
            },
            {
              "minLevel": 7,
              "maxLevel": 7,
              "intensity": "strong",
              "spark": false,
              "glitter": false,
              "whiteCore": false
            },
            {
              "minLevel": 8,
              "maxLevel": 8,
              "intensity": "stronger",
              "spark": true,
              "glitter": false,
              "whiteCore": false
            },
            {
              "minLevel": 9,
              "maxLevel": 9,
              "intensity": "epic",
              "spark": true,
              "glitter": true,
              "whiteCore": false
            },
            {
              "minLevel": 10,
              "maxLevel": 10,
              "intensity": "ascended",
              "spark": true,
              "glitter": true,
              "whiteCore": true
            }
          ]
        }
      },
      "affixes": {
        "starlight_witch": {
          "id": "starlight_witch",
          "prefix": "별빛의",
          "displayName": "별빛의 마력의 마법서",
          "skillOverrides": {},
          "rolledEffects": {
            "missileDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.2,
              "max": 0.5,
              "displayAsPercent": true
            },
            "missileManaCostReduction": {
              "type": "multiplier_bonus",
              "min": 0.1,
              "max": 0.3,
              "displayAsPercent": true
            }
          },
          "visuals": {
            "auraProfile": "starlight",
            "projectileTint": "#f5cf5b"
          },
          "classSkill": {
            "slot": 1,
            "name": "독 물약",
            "effect": "poison_cloud",
            "radius": 140
          }
        },
        "blue_flame_witch": {
          "id": "blue_flame_witch",
          "prefix": "푸른 불꽃의",
          "displayName": "푸른 불꽃의 마력의 마법서",
          "skillOverrides": {},
          "rolledEffects": {
            "fireballChainChance": {
              "type": "multiplier_bonus",
              "min": 0.1,
              "max": 0.5,
              "displayAsPercent": true
            },
            "fireballChainDamageRatio": {
              "type": "multiplier_bonus",
              "min": 0.3,
              "max": 0.8,
              "displayAsPercent": true
            }
          },
          "visuals": {
            "auraProfile": "blue_flame",
            "projectileTint": "#59c7ff"
          },
          "classSkill": {
            "slot": 1,
            "name": "독 물약",
            "effect": "poison_cloud",
            "radius": 140
          }
        },
        "crimson_flash_witch": {
          "id": "crimson_flash_witch",
          "prefix": "붉은 섬광의",
          "displayName": "붉은 섬광의 마력의 마법서",
          "skillOverrides": {},
          "rolledEffects": {
            "laserDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.2,
              "max": 0.5,
              "displayAsPercent": true
            },
            "attackSpeedBonus": {
              "type": "multiplier_bonus",
              "min": 0.1,
              "max": 0.3,
              "displayAsPercent": true
            }
          },
          "combatHooks": {
            "restoreHpPerLaserHit": 1,
            "restoreHpPerLaserHitByEnhancement": {
              "7": 2,
              "10": 3
            },
            "keepMpRestore": true,
            "beamStyle": "thick_red_arc"
          },
          "visuals": {
            "auraProfile": "crimson_flash",
            "projectileTint": "#ff5d66"
          },
          "classSkill": {
            "slot": 1,
            "name": "독 물약",
            "effect": "poison_cloud",
            "radius": 140
          }
        }
      }
    },
    "magic_warrior": {
      "name": "마력의 검",
      "description": "전사 전용 검. 같은 지역·등급의 마법사 무기와 능력치 및 강화 규칙이 같습니다.",
      "icon": "⚔️",
      "iconPath": "assets/resource/classes/weapons/magic_warrior.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 7,
        "critRate": 0.05,
        "mpRegen": 3
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "starlight": {
              "baseColor": "#f7d774",
              "secondaryColor": "#fff7c2",
              "particleStyle": "stardust"
            },
            "blue_flame": {
              "baseColor": "#4cb7ff",
              "secondaryColor": "#9ee6ff",
              "particleStyle": "blue_flame"
            },
            "crimson_flash": {
              "baseColor": "#ff5b5b",
              "secondaryColor": "#ffc0c0",
              "particleStyle": "red_spark"
            }
          },
          "enhancementStages": [
            {
              "minLevel": 0,
              "maxLevel": 6,
              "intensity": "soft",
              "spark": false,
              "glitter": false,
              "whiteCore": false
            },
            {
              "minLevel": 7,
              "maxLevel": 7,
              "intensity": "strong",
              "spark": false,
              "glitter": false,
              "whiteCore": false
            },
            {
              "minLevel": 8,
              "maxLevel": 8,
              "intensity": "stronger",
              "spark": true,
              "glitter": false,
              "whiteCore": false
            },
            {
              "minLevel": 9,
              "maxLevel": 9,
              "intensity": "epic",
              "spark": true,
              "glitter": true,
              "whiteCore": false
            },
            {
              "minLevel": 10,
              "maxLevel": 10,
              "intensity": "ascended",
              "spark": true,
              "glitter": true,
              "whiteCore": true
            }
          ]
        }
      },
      "affixes": {
        "starlight_warrior": {
          "id": "starlight_warrior",
          "prefix": "별빛의",
          "displayName": "별빛의 마력의 검",
          "skillOverrides": {},
          "rolledEffects": {
            "missileDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.2,
              "max": 0.5,
              "displayAsPercent": true
            },
            "missileManaCostReduction": {
              "type": "multiplier_bonus",
              "min": 0.1,
              "max": 0.3,
              "displayAsPercent": true
            }
          },
          "visuals": {
            "auraProfile": "starlight",
            "projectileTint": "#f5cf5b"
          },
          "classSkill": {
            "slot": 2,
            "name": "응징 돌진",
            "effect": "punishing_charge",
            "radius": 100
          }
        },
        "blue_flame_warrior": {
          "id": "blue_flame_warrior",
          "prefix": "푸른 불꽃의",
          "displayName": "푸른 불꽃의 마력의 검",
          "skillOverrides": {},
          "rolledEffects": {
            "fireballChainChance": {
              "type": "multiplier_bonus",
              "min": 0.1,
              "max": 0.5,
              "displayAsPercent": true
            },
            "fireballChainDamageRatio": {
              "type": "multiplier_bonus",
              "min": 0.3,
              "max": 0.8,
              "displayAsPercent": true
            }
          },
          "visuals": {
            "auraProfile": "blue_flame",
            "projectileTint": "#59c7ff"
          },
          "classSkill": {
            "slot": 2,
            "name": "응징 돌진",
            "effect": "punishing_charge",
            "radius": 100
          }
        },
        "crimson_flash_warrior": {
          "id": "crimson_flash_warrior",
          "prefix": "붉은 섬광의",
          "displayName": "붉은 섬광의 마력의 검",
          "skillOverrides": {},
          "rolledEffects": {
            "laserDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.2,
              "max": 0.5,
              "displayAsPercent": true
            },
            "attackSpeedBonus": {
              "type": "multiplier_bonus",
              "min": 0.1,
              "max": 0.3,
              "displayAsPercent": true
            }
          },
          "combatHooks": {
            "restoreHpPerLaserHit": 1,
            "restoreHpPerLaserHitByEnhancement": {
              "7": 2,
              "10": 3
            },
            "keepMpRestore": true,
            "beamStyle": "thick_red_arc"
          },
          "visuals": {
            "auraProfile": "crimson_flash",
            "projectileTint": "#ff5d66"
          },
          "classSkill": {
            "slot": 2,
            "name": "응징 돌진",
            "effect": "punishing_charge",
            "radius": 100
          }
        }
      }
    },
    "magic_archer": {
      "name": "마력의 활",
      "description": "궁수 전용 활. 같은 지역·등급의 마법사 무기와 능력치 및 강화 규칙이 같습니다.",
      "icon": "🏹",
      "iconPath": "assets/resource/classes/weapons/magic_archer.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 7,
        "critRate": 0.05,
        "mpRegen": 3
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "starlight": {
              "baseColor": "#f7d774",
              "secondaryColor": "#fff7c2",
              "particleStyle": "stardust"
            },
            "blue_flame": {
              "baseColor": "#4cb7ff",
              "secondaryColor": "#9ee6ff",
              "particleStyle": "blue_flame"
            },
            "crimson_flash": {
              "baseColor": "#ff5b5b",
              "secondaryColor": "#ffc0c0",
              "particleStyle": "red_spark"
            }
          },
          "enhancementStages": [
            {
              "minLevel": 0,
              "maxLevel": 6,
              "intensity": "soft",
              "spark": false,
              "glitter": false,
              "whiteCore": false
            },
            {
              "minLevel": 7,
              "maxLevel": 7,
              "intensity": "strong",
              "spark": false,
              "glitter": false,
              "whiteCore": false
            },
            {
              "minLevel": 8,
              "maxLevel": 8,
              "intensity": "stronger",
              "spark": true,
              "glitter": false,
              "whiteCore": false
            },
            {
              "minLevel": 9,
              "maxLevel": 9,
              "intensity": "epic",
              "spark": true,
              "glitter": true,
              "whiteCore": false
            },
            {
              "minLevel": 10,
              "maxLevel": 10,
              "intensity": "ascended",
              "spark": true,
              "glitter": true,
              "whiteCore": true
            }
          ]
        }
      },
      "affixes": {
        "starlight_archer": {
          "id": "starlight_archer",
          "prefix": "별빛의",
          "displayName": "별빛의 마력의 활",
          "skillOverrides": {},
          "rolledEffects": {
            "missileDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.2,
              "max": 0.5,
              "displayAsPercent": true
            },
            "missileManaCostReduction": {
              "type": "multiplier_bonus",
              "min": 0.1,
              "max": 0.3,
              "displayAsPercent": true
            }
          },
          "visuals": {
            "auraProfile": "starlight",
            "projectileTint": "#f5cf5b"
          },
          "classSkill": {
            "slot": 3,
            "name": "추적 화살비",
            "effect": "tracking_rain",
            "radius": 165
          }
        },
        "blue_flame_archer": {
          "id": "blue_flame_archer",
          "prefix": "푸른 불꽃의",
          "displayName": "푸른 불꽃의 마력의 활",
          "skillOverrides": {},
          "rolledEffects": {
            "fireballChainChance": {
              "type": "multiplier_bonus",
              "min": 0.1,
              "max": 0.5,
              "displayAsPercent": true
            },
            "fireballChainDamageRatio": {
              "type": "multiplier_bonus",
              "min": 0.3,
              "max": 0.8,
              "displayAsPercent": true
            }
          },
          "visuals": {
            "auraProfile": "blue_flame",
            "projectileTint": "#59c7ff"
          },
          "classSkill": {
            "slot": 3,
            "name": "추적 화살비",
            "effect": "tracking_rain",
            "radius": 165
          }
        },
        "crimson_flash_archer": {
          "id": "crimson_flash_archer",
          "prefix": "붉은 섬광의",
          "displayName": "붉은 섬광의 마력의 활",
          "skillOverrides": {},
          "rolledEffects": {
            "laserDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.2,
              "max": 0.5,
              "displayAsPercent": true
            },
            "attackSpeedBonus": {
              "type": "multiplier_bonus",
              "min": 0.1,
              "max": 0.3,
              "displayAsPercent": true
            }
          },
          "combatHooks": {
            "restoreHpPerLaserHit": 1,
            "restoreHpPerLaserHitByEnhancement": {
              "7": 2,
              "10": 3
            },
            "keepMpRestore": true,
            "beamStyle": "thick_red_arc"
          },
          "visuals": {
            "auraProfile": "crimson_flash",
            "projectileTint": "#ff5d66"
          },
          "classSkill": {
            "slot": 3,
            "name": "추적 화살비",
            "effect": "tracking_rain",
            "radius": 165
          }
        }
      }
    },
    "tidal_witch": {
      "name": "해일의 마법서",
      "description": "위치 전용 마법서. 같은 지역·등급의 마법사 무기와 능력치 및 강화 규칙이 같습니다.",
      "icon": "📖",
      "iconPath": "assets/resource/classes/weapons/tidal_witch.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 9,
        "critRate": 0.06,
        "mpRegen": 4
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "tidal_blue": {
              "baseColor": "#38c8f0",
              "secondaryColor": "#c4f7ff",
              "particleStyle": "blue_flame"
            }
          }
        }
      },
      "affixes": {
        "tidal_blue_flame_witch": {
          "id": "tidal_blue_flame_witch",
          "prefix": "해일을 품은",
          "displayName": "해일을 품은 해일의 마법서",
          "skillOverrides": {},
          "rolledEffects": {
            "fireballChainChance": {
              "type": "multiplier_bonus",
              "min": 0.24,
              "max": 0.38,
              "displayAsPercent": true
            },
            "fireballChainDamageRatio": {
              "type": "multiplier_bonus",
              "min": 0.45,
              "max": 0.65,
              "displayAsPercent": true
            }
          },
          "visuals": {
            "auraProfile": "tidal_blue",
            "projectileTint": "#58ddff"
          },
          "classSkill": {
            "slot": 1,
            "name": "독 물약",
            "effect": "poison_cloud",
            "radius": 140
          }
        }
      }
    },
    "tidal_warrior": {
      "name": "해일의 검",
      "description": "전사 전용 검. 같은 지역·등급의 마법사 무기와 능력치 및 강화 규칙이 같습니다.",
      "icon": "⚔️",
      "iconPath": "assets/resource/classes/weapons/tidal_warrior.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 9,
        "critRate": 0.06,
        "mpRegen": 4
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "tidal_blue": {
              "baseColor": "#38c8f0",
              "secondaryColor": "#c4f7ff",
              "particleStyle": "blue_flame"
            }
          }
        }
      },
      "affixes": {
        "tidal_blue_flame_warrior": {
          "id": "tidal_blue_flame_warrior",
          "prefix": "해일을 품은",
          "displayName": "해일을 품은 해일의 검",
          "skillOverrides": {},
          "rolledEffects": {
            "fireballChainChance": {
              "type": "multiplier_bonus",
              "min": 0.24,
              "max": 0.38,
              "displayAsPercent": true
            },
            "fireballChainDamageRatio": {
              "type": "multiplier_bonus",
              "min": 0.45,
              "max": 0.65,
              "displayAsPercent": true
            }
          },
          "visuals": {
            "auraProfile": "tidal_blue",
            "projectileTint": "#58ddff"
          },
          "classSkill": {
            "slot": 2,
            "name": "응징 돌진",
            "effect": "punishing_charge",
            "radius": 100
          }
        }
      }
    },
    "tidal_archer": {
      "name": "해일의 활",
      "description": "궁수 전용 활. 같은 지역·등급의 마법사 무기와 능력치 및 강화 규칙이 같습니다.",
      "icon": "🏹",
      "iconPath": "assets/resource/classes/weapons/tidal_archer.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 9,
        "critRate": 0.06,
        "mpRegen": 4
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "tidal_blue": {
              "baseColor": "#38c8f0",
              "secondaryColor": "#c4f7ff",
              "particleStyle": "blue_flame"
            }
          }
        }
      },
      "affixes": {
        "tidal_blue_flame_archer": {
          "id": "tidal_blue_flame_archer",
          "prefix": "해일을 품은",
          "displayName": "해일을 품은 해일의 활",
          "skillOverrides": {},
          "rolledEffects": {
            "fireballChainChance": {
              "type": "multiplier_bonus",
              "min": 0.24,
              "max": 0.38,
              "displayAsPercent": true
            },
            "fireballChainDamageRatio": {
              "type": "multiplier_bonus",
              "min": 0.45,
              "max": 0.65,
              "displayAsPercent": true
            }
          },
          "visuals": {
            "auraProfile": "tidal_blue",
            "projectileTint": "#58ddff"
          },
          "classSkill": {
            "slot": 3,
            "name": "추적 화살비",
            "effect": "tracking_rain",
            "radius": 165
          }
        }
      }
    },
    "storm_witch": {
      "name": "뇌광의 마법서",
      "description": "위치 전용 마법서. 같은 지역·등급의 마법사 무기와 능력치 및 강화 규칙이 같습니다.",
      "icon": "📖",
      "iconPath": "assets/resource/classes/weapons/storm_witch.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 11,
        "critRate": 0.07,
        "mpRegen": 5
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "storm_gold": {
              "baseColor": "#f2ca3c",
              "secondaryColor": "#fff5ad",
              "particleStyle": "stardust"
            }
          }
        }
      },
      "affixes": {
        "storm_starlight_witch": {
          "id": "storm_starlight_witch",
          "prefix": "뇌광을 두른",
          "displayName": "뇌광을 두른 뇌광의 마법서",
          "skillOverrides": {},
          "rolledEffects": {
            "missileDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.42,
              "max": 0.62,
              "displayAsPercent": true
            },
            "missileManaCostReduction": {
              "type": "multiplier_bonus",
              "min": 0.18,
              "max": 0.32,
              "displayAsPercent": true
            }
          },
          "visuals": {
            "auraProfile": "storm_gold",
            "projectileTint": "#ffe052"
          },
          "classSkill": {
            "slot": 1,
            "name": "독 물약",
            "effect": "poison_cloud",
            "radius": 140
          }
        }
      }
    },
    "storm_warrior": {
      "name": "뇌광의 검",
      "description": "전사 전용 검. 같은 지역·등급의 마법사 무기와 능력치 및 강화 규칙이 같습니다.",
      "icon": "⚔️",
      "iconPath": "assets/resource/classes/weapons/storm_warrior.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 11,
        "critRate": 0.07,
        "mpRegen": 5
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "storm_gold": {
              "baseColor": "#f2ca3c",
              "secondaryColor": "#fff5ad",
              "particleStyle": "stardust"
            }
          }
        }
      },
      "affixes": {
        "storm_starlight_warrior": {
          "id": "storm_starlight_warrior",
          "prefix": "뇌광을 두른",
          "displayName": "뇌광을 두른 뇌광의 검",
          "skillOverrides": {},
          "rolledEffects": {
            "missileDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.42,
              "max": 0.62,
              "displayAsPercent": true
            },
            "missileManaCostReduction": {
              "type": "multiplier_bonus",
              "min": 0.18,
              "max": 0.32,
              "displayAsPercent": true
            }
          },
          "visuals": {
            "auraProfile": "storm_gold",
            "projectileTint": "#ffe052"
          },
          "classSkill": {
            "slot": 2,
            "name": "응징 돌진",
            "effect": "punishing_charge",
            "radius": 100
          }
        }
      }
    },
    "storm_archer": {
      "name": "뇌광의 활",
      "description": "궁수 전용 활. 같은 지역·등급의 마법사 무기와 능력치 및 강화 규칙이 같습니다.",
      "icon": "🏹",
      "iconPath": "assets/resource/classes/weapons/storm_archer.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 11,
        "critRate": 0.07,
        "mpRegen": 5
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "storm_gold": {
              "baseColor": "#f2ca3c",
              "secondaryColor": "#fff5ad",
              "particleStyle": "stardust"
            }
          }
        }
      },
      "affixes": {
        "storm_starlight_archer": {
          "id": "storm_starlight_archer",
          "prefix": "뇌광을 두른",
          "displayName": "뇌광을 두른 뇌광의 활",
          "skillOverrides": {},
          "rolledEffects": {
            "missileDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.42,
              "max": 0.62,
              "displayAsPercent": true
            },
            "missileManaCostReduction": {
              "type": "multiplier_bonus",
              "min": 0.18,
              "max": 0.32,
              "displayAsPercent": true
            }
          },
          "visuals": {
            "auraProfile": "storm_gold",
            "projectileTint": "#ffe052"
          },
          "classSkill": {
            "slot": 3,
            "name": "추적 화살비",
            "effect": "tracking_rain",
            "radius": 165
          }
        }
      }
    },
    "astral_witch": {
      "name": "성운의 마법서",
      "description": "위치 전용 마법서. 같은 지역·등급의 마법사 무기와 능력치 및 강화 규칙이 같습니다.",
      "icon": "📖",
      "iconPath": "assets/resource/classes/weapons/astral_witch.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 13,
        "critRate": 0.09,
        "mpRegen": 7
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "astral_crimson": {
              "baseColor": "#e3538b",
              "secondaryColor": "#ffd4f0",
              "particleStyle": "red_spark"
            }
          }
        }
      },
      "affixes": {
        "astral_crimson_flash_witch": {
          "id": "astral_crimson_flash_witch",
          "prefix": "성운을 가르는",
          "displayName": "성운을 가르는 성운의 마법서",
          "skillOverrides": {},
          "rolledEffects": {
            "laserDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.5,
              "max": 0.72,
              "displayAsPercent": true
            },
            "attackSpeedBonus": {
              "type": "multiplier_bonus",
              "min": 0.18,
              "max": 0.3,
              "displayAsPercent": true
            }
          },
          "combatHooks": {
            "restoreHpPerLaserHit": 2,
            "restoreHpPerLaserHitByEnhancement": {
              "7": 3,
              "10": 4
            },
            "keepMpRestore": true,
            "beamStyle": "thick_red_arc"
          },
          "visuals": {
            "auraProfile": "astral_crimson",
            "projectileTint": "#ff5f91"
          },
          "classSkill": {
            "slot": 1,
            "name": "독 물약",
            "effect": "poison_cloud",
            "radius": 140
          }
        }
      }
    },
    "astral_warrior": {
      "name": "성운의 검",
      "description": "전사 전용 검. 같은 지역·등급의 마법사 무기와 능력치 및 강화 규칙이 같습니다.",
      "icon": "⚔️",
      "iconPath": "assets/resource/classes/weapons/astral_warrior.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 13,
        "critRate": 0.09,
        "mpRegen": 7
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "astral_crimson": {
              "baseColor": "#e3538b",
              "secondaryColor": "#ffd4f0",
              "particleStyle": "red_spark"
            }
          }
        }
      },
      "affixes": {
        "astral_crimson_flash_warrior": {
          "id": "astral_crimson_flash_warrior",
          "prefix": "성운을 가르는",
          "displayName": "성운을 가르는 성운의 검",
          "skillOverrides": {},
          "rolledEffects": {
            "laserDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.5,
              "max": 0.72,
              "displayAsPercent": true
            },
            "attackSpeedBonus": {
              "type": "multiplier_bonus",
              "min": 0.18,
              "max": 0.3,
              "displayAsPercent": true
            }
          },
          "combatHooks": {
            "restoreHpPerLaserHit": 2,
            "restoreHpPerLaserHitByEnhancement": {
              "7": 3,
              "10": 4
            },
            "keepMpRestore": true,
            "beamStyle": "thick_red_arc"
          },
          "visuals": {
            "auraProfile": "astral_crimson",
            "projectileTint": "#ff5f91"
          },
          "classSkill": {
            "slot": 2,
            "name": "응징 돌진",
            "effect": "punishing_charge",
            "radius": 100
          }
        }
      }
    },
    "astral_archer": {
      "name": "성운의 활",
      "description": "궁수 전용 활. 같은 지역·등급의 마법사 무기와 능력치 및 강화 규칙이 같습니다.",
      "icon": "🏹",
      "iconPath": "assets/resource/classes/weapons/astral_archer.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 13,
        "critRate": 0.09,
        "mpRegen": 7
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "astral_crimson": {
              "baseColor": "#e3538b",
              "secondaryColor": "#ffd4f0",
              "particleStyle": "red_spark"
            }
          }
        }
      },
      "affixes": {
        "astral_crimson_flash_archer": {
          "id": "astral_crimson_flash_archer",
          "prefix": "성운을 가르는",
          "displayName": "성운을 가르는 성운의 활",
          "skillOverrides": {},
          "rolledEffects": {
            "laserDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.5,
              "max": 0.72,
              "displayAsPercent": true
            },
            "attackSpeedBonus": {
              "type": "multiplier_bonus",
              "min": 0.18,
              "max": 0.3,
              "displayAsPercent": true
            }
          },
          "combatHooks": {
            "restoreHpPerLaserHit": 2,
            "restoreHpPerLaserHitByEnhancement": {
              "7": 3,
              "10": 4
            },
            "keepMpRestore": true,
            "beamStyle": "thick_red_arc"
          },
          "visuals": {
            "auraProfile": "astral_crimson",
            "projectileTint": "#ff5f91"
          },
          "classSkill": {
            "slot": 3,
            "name": "추적 화살비",
            "effect": "tracking_rain",
            "radius": 165
          }
        }
      }
    },
    "riftcore_staff": {
      "name": "균열핵 지팡이",
      "description": "태초의 균열지 중심에서 응결된 보랏빛 결정으로 만든 지팡이입니다. 체인 라이트닝이 균열의 섬광으로 변화합니다.",
      "icon": "🪄",
      "iconPath": "assets/resource/expansion/zone_5/items/riftcore_staff.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 15,
        "critRate": 0.1,
        "mpRegen": 8
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "rift_core": {
              "baseColor": "#8b5cf6",
              "secondaryColor": "#67e8f9",
              "particleStyle": "stardust"
            }
          }
        }
      },
      "affixes": {
        "riftcore_resonance": {
          "id": "riftcore_resonance",
          "prefix": "균열을 공명시키는",
          "displayName": "균열을 공명시키는 균열핵 지팡이",
          "skillOverrides": {
            "laserVisualVariant": "crimson_chain"
          },
          "rolledEffects": {
            "laserDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.6,
              "max": 0.8,
              "displayAsPercent": true
            },
            "attackSpeedBonus": {
              "type": "multiplier_bonus",
              "min": 0.2,
              "max": 0.32,
              "displayAsPercent": true
            }
          },
          "combatHooks": {
            "restoreHpPerLaserHit": 3,
            "restoreHpPerLaserHitByEnhancement": {
              "7": 4,
              "10": 5
            },
            "keepMpRestore": true,
            "beamStyle": "thick_red_arc"
          },
          "visuals": {
            "auraProfile": "rift_core",
            "projectileTint": "#a78bfa"
          }
        }
      }
    },
    "riftcore_witch": {
      "name": "균열핵 마법서",
      "description": "위치 전용 마법서. 같은 지역·등급의 마법사 무기와 능력치 및 강화 규칙이 같습니다.",
      "icon": "📖",
      "iconPath": "assets/resource/classes/weapons/riftcore_witch.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 15,
        "critRate": 0.1,
        "mpRegen": 8
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "rift_core": {
              "baseColor": "#8b5cf6",
              "secondaryColor": "#67e8f9",
              "particleStyle": "stardust"
            }
          }
        }
      },
      "affixes": {
        "riftcore_resonance_witch": {
          "id": "riftcore_resonance_witch",
          "prefix": "균열을 공명시키는",
          "displayName": "균열을 공명시키는 균열핵 마법서",
          "skillOverrides": {},
          "rolledEffects": {
            "laserDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.6,
              "max": 0.8,
              "displayAsPercent": true
            },
            "attackSpeedBonus": {
              "type": "multiplier_bonus",
              "min": 0.2,
              "max": 0.32,
              "displayAsPercent": true
            }
          },
          "combatHooks": {
            "restoreHpPerLaserHit": 3,
            "restoreHpPerLaserHitByEnhancement": {
              "7": 4,
              "10": 5
            },
            "keepMpRestore": true,
            "beamStyle": "thick_red_arc"
          },
          "visuals": {
            "auraProfile": "rift_core",
            "projectileTint": "#a78bfa"
          },
          "classSkill": {
            "slot": 1,
            "name": "독 물약",
            "effect": "poison_cloud",
            "radius": 140
          }
        }
      }
    },
    "riftcore_warrior": {
      "name": "균열핵 검",
      "description": "전사 전용 검. 같은 지역·등급의 마법사 무기와 능력치 및 강화 규칙이 같습니다.",
      "icon": "⚔️",
      "iconPath": "assets/resource/classes/weapons/riftcore_warrior.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 15,
        "critRate": 0.1,
        "mpRegen": 8
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "rift_core": {
              "baseColor": "#8b5cf6",
              "secondaryColor": "#67e8f9",
              "particleStyle": "stardust"
            }
          }
        }
      },
      "affixes": {
        "riftcore_resonance_warrior": {
          "id": "riftcore_resonance_warrior",
          "prefix": "균열을 공명시키는",
          "displayName": "균열을 공명시키는 균열핵 검",
          "skillOverrides": {},
          "rolledEffects": {
            "laserDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.6,
              "max": 0.8,
              "displayAsPercent": true
            },
            "attackSpeedBonus": {
              "type": "multiplier_bonus",
              "min": 0.2,
              "max": 0.32,
              "displayAsPercent": true
            }
          },
          "combatHooks": {
            "restoreHpPerLaserHit": 3,
            "restoreHpPerLaserHitByEnhancement": {
              "7": 4,
              "10": 5
            },
            "keepMpRestore": true,
            "beamStyle": "thick_red_arc"
          },
          "visuals": {
            "auraProfile": "rift_core",
            "projectileTint": "#a78bfa"
          },
          "classSkill": {
            "slot": 2,
            "name": "응징 돌진",
            "effect": "punishing_charge",
            "radius": 100
          }
        }
      }
    },
    "riftcore_archer": {
      "name": "균열핵 활",
      "description": "궁수 전용 활. 같은 지역·등급의 마법사 무기와 능력치 및 강화 규칙이 같습니다.",
      "icon": "🏹",
      "iconPath": "assets/resource/classes/weapons/riftcore_archer.webp",
      "rarity": "boss",
      "enhancementRuleSet": "weapon_standard_1_to_10",
      "baseStats": {
        "attackPower": 15,
        "critRate": 0.1,
        "mpRegen": 8
      },
      "enhancementBonuses": {
        "attackPowerPerLevel": 1,
        "critRatePerLevel": 0.01
      },
      "visuals": {
        "equipAura": {
          "mode": "prefix_plus_enhancement",
          "prefixAuraProfiles": {
            "rift_core": {
              "baseColor": "#8b5cf6",
              "secondaryColor": "#67e8f9",
              "particleStyle": "stardust"
            }
          }
        }
      },
      "affixes": {
        "riftcore_resonance_archer": {
          "id": "riftcore_resonance_archer",
          "prefix": "균열을 공명시키는",
          "displayName": "균열을 공명시키는 균열핵 활",
          "skillOverrides": {},
          "rolledEffects": {
            "laserDamageBonus": {
              "type": "multiplier_bonus",
              "min": 0.6,
              "max": 0.8,
              "displayAsPercent": true
            },
            "attackSpeedBonus": {
              "type": "multiplier_bonus",
              "min": 0.2,
              "max": 0.32,
              "displayAsPercent": true
            }
          },
          "combatHooks": {
            "restoreHpPerLaserHit": 3,
            "restoreHpPerLaserHitByEnhancement": {
              "7": 4,
              "10": 5
            },
            "keepMpRestore": true,
            "beamStyle": "thick_red_arc"
          },
          "visuals": {
            "auraProfile": "rift_core",
            "projectileTint": "#a78bfa"
          },
          "classSkill": {
            "slot": 3,
            "name": "추적 화살비",
            "effect": "tracking_rain",
            "radius": 165
          }
        }
      }
    }
  },
  "bossChoices": {
    "king_slime": [
      [
        "magic_staff",
        "magic_witch",
        "magic_warrior",
        "magic_archer"
      ]
    ],
    "ruin_wobbuffet": [
      [
        "tidal_staff",
        "tidal_witch",
        "tidal_warrior",
        "tidal_archer"
      ]
    ],
    "thunder_pikachu": [
      [
        "storm_staff",
        "storm_witch",
        "storm_warrior",
        "storm_archer"
      ]
    ],
    "astral_sylveon": [
      [
        "astral_staff",
        "astral_witch",
        "astral_warrior",
        "astral_archer"
      ]
    ],
    "rift_sentinel": [
      [
        "riftcore_staff",
        "riftcore_witch",
        "riftcore_warrior",
        "riftcore_archer"
      ]
    ]
  }
};
