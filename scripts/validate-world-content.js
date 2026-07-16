#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { imageSize } = require('image-size');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];
const loadedJsonFiles = new Set();
const supportedWeaponVariants = new Set([
    'golden_missile',
    'blue_fireball',
    'crimson_chain'
]);
const currencyItemIds = new Set(['manastone', 'gold']);

function fail(message) {
    errors.push(message);
}

function warn(message) {
    warnings.push(message);
}

function assert(condition, message) {
    if (!condition) fail(message);
}

function repoPath(relativePath) {
    const normalized = String(relativePath || '')
        .replace(/^[/\\]+/, '')
        .replaceAll('/', path.sep);
    const resolved = path.resolve(ROOT, normalized);
    const rootPrefix = `${ROOT.toLowerCase()}${path.sep}`;
    if (resolved.toLowerCase() !== ROOT.toLowerCase()
        && !resolved.toLowerCase().startsWith(rootPrefix)) {
        throw new Error(`Path escapes repository root: ${relativePath}`);
    }
    return resolved;
}

function readJson(relativePath) {
    let absolutePath;
    try {
        absolutePath = repoPath(relativePath);
    } catch (error) {
        fail(error.message);
        return null;
    }

    if (!fs.existsSync(absolutePath)) {
        fail(`Missing JSON file: ${relativePath}`);
        return null;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
        loadedJsonFiles.add(relativePath.replaceAll('\\', '/'));
        return parsed;
    } catch (error) {
        fail(`Invalid JSON in ${relativePath}: ${error.message}`);
        return null;
    }
}

function normalizeCatalogEntries(entries) {
    if (Array.isArray(entries)) return entries;
    return entries ? [entries] : [];
}

function catalogEntryFile(entry) {
    return typeof entry === 'string' ? entry : (entry?.file || entry?.path || null);
}

function loadItemCatalogGroup(entries, groupName) {
    return normalizeCatalogEntries(entries).map((entry, index) => {
        const file = catalogEntryFile(entry);
        if (!file) {
            fail(`item_catalog.${groupName}[${index}] has no file`);
            return null;
        }
        const document = readJson(`assets/data/items/${file.replace(/^\.\//, '')}`);
        if (document && typeof entry === 'object' && entry.id) {
            assert(
                document.id === entry.id,
                `Catalog id ${entry.id} does not match ${file} id ${document.id}`
            );
        }
        return document;
    }).filter(Boolean);
}

function addUnique(map, id, value, label) {
    if (!id) {
        fail(`${label} is missing an id`);
        return;
    }
    if (map.has(id)) {
        fail(`Duplicate ${label} id: ${id}`);
        return;
    }
    map.set(id, value);
}

function insideBounds(point, boundaries) {
    return point
        && boundaries
        && Number.isFinite(point.x)
        && Number.isFinite(point.y)
        && point.x >= boundaries.minX
        && point.x <= boundaries.maxX
        && point.y >= boundaries.minY
        && point.y <= boundaries.maxY;
}

function distanceFromPointToRect(point, rect) {
    if (!point || !rect) return 0;
    const nearestX = Math.max(rect.x, Math.min(point.x, rect.x + rect.w));
    const nearestY = Math.max(rect.y, Math.min(point.y, rect.y + rect.h));
    return Math.hypot(point.x - nearestX, point.y - nearestY);
}

function validateSpriteSheet(monster, checkedSheets) {
    const visual = monster?.visual;
    const sheet = visual?.spriteSheet;
    if (!sheet) return;

    const label = `monster ${monster.id}`;
    assert(monster.spriteVersionNumber === 2, `${label} must declare spriteVersionNumber 2`);
    assert(visual.spriteVersionNumber === 2, `${label} visual must declare spriteVersionNumber 2`);
    assert(sheet.columns === 8, `${label} sheet must have 8 columns`);
    assert(sheet.rows === 11, `${label} sheet must have 11 rows`);
    assert(sheet.frameWidth === 192, `${label} frameWidth must be 192`);
    assert(sheet.frameHeight === 208, `${label} frameHeight must be 208`);
    const contentBounds = sheet.contentBounds || {};
    assert(
        Number.isFinite(contentBounds.left)
            && Number.isFinite(contentBounds.top)
            && Number.isFinite(contentBounds.right)
            && Number.isFinite(contentBounds.bottom)
            && contentBounds.left >= 0
            && contentBounds.top >= 0
            && contentBounds.right > contentBounds.left
            && contentBounds.bottom > contentBounds.top
            && contentBounds.right <= sheet.frameWidth
            && contentBounds.bottom <= sheet.frameHeight,
        `${label} must declare audited contentBounds inside one atlas cell`
    );
    assert(
        sheet.alignContentToGround == null || typeof sheet.alignContentToGround === 'boolean',
        `${label} alignContentToGround must be boolean when declared`
    );

    const expectedRatio = 192 / 208;
    const renderRatio = Number(visual.renderWidth) / Number(visual.renderHeight);
    assert(
        Number.isFinite(renderRatio) && Math.abs(renderRatio - expectedRatio) < 0.001,
        `${label} renderWidth/renderHeight must preserve the 192:208 cell ratio`
    );
    assert(
        visual.width <= visual.renderWidth && visual.height <= visual.renderHeight,
        `${label} collision dimensions must not exceed render dimensions`
    );

    Object.entries(sheet.rowMap || {}).forEach(([state, row]) => {
        assert(
            Number.isInteger(row) && row >= 0 && row < 11,
            `${label} rowMap.${state} must reference row 0-10`
        );
    });
    const supportedStates = ['idle', 'moveRight', 'moveLeft'];
    const declaredStates = Object.keys(sheet.rowMap || {});
    supportedStates.forEach((state) => {
        assert(Number.isInteger(sheet.rowMap?.[state]), `${label} must declare rowMap.${state}`);
        const frameCount = Number(sheet.frameCounts?.[state]);
        assert(
            Number.isInteger(frameCount) && frameCount > 0 && frameCount <= sheet.columns,
            `${label} frameCounts.${state} must be between 1 and ${sheet.columns}`
        );
    });
    declaredStates.forEach((state) => {
        assert(
            supportedStates.includes(state),
            `${label} declares unaudited animation row ${state}; audit its cell alpha and frame count before enabling it`
        );
    });
    assert(
        typeof sheet.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(sheet.sha256),
        `${label} must pin the SHA-256 of its alpha-audited atlas`
    );

    const assetPath = visual.assetPath;
    if (!assetPath) {
        fail(`${label} has spriteSheet metadata but no visual.assetPath`);
        return;
    }

    let absolutePath;
    try {
        absolutePath = repoPath(assetPath);
    } catch (error) {
        fail(error.message);
        return;
    }
    if (!fs.existsSync(absolutePath)) {
        fail(`${label} spritesheet is missing: ${assetPath}`);
        return;
    }

    if (checkedSheets.has(absolutePath)) return;
    checkedSheets.add(absolutePath);

    try {
        const fileBuffer = fs.readFileSync(absolutePath);
        const dimensions = imageSize(fileBuffer);
        assert(
            dimensions.width === 1536 && dimensions.height === 2288,
            `${label} spritesheet must be 1536x2288, got ${dimensions.width}x${dimensions.height}`
        );
        assert(
            dimensions.width === sheet.columns * sheet.frameWidth
                && dimensions.height === sheet.rows * sheet.frameHeight,
            `${label} spritesheet dimensions do not match its declared grid`
        );
        const actualSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        assert(
            actualSha256 === String(sheet.sha256 || '').toLowerCase(),
            `${label} spritesheet hash changed; repeat the per-cell alpha/crop audit before updating sha256`
        );
    } catch (error) {
        fail(`Cannot inspect ${assetPath}: ${error.message}`);
    }
}

function validateBossMechanics(monster, isCatalogBoss) {
    if (!isCatalogBoss) return;

    const label = `Boss monster ${monster.id}`;
    const missileSkill = (monster.skills || []).find((skill) => skill?.id === 'missile');
    assert(!missileSkill, `${label} must not use homing missile skills; use avoidable bossMechanics instead`);

    const mechanics = Array.isArray(monster.bossMechanics) ? monster.bossMechanics : [];
    assert(mechanics.length > 0, `${label} must define at least one avoidable bossMechanic`);

    const supportedPatterns = new Set(['circle', 'line', 'parallel_lines', 'circle_cluster', 'donut']);
    mechanics.forEach((mechanic, index) => {
        const mechanicLabel = `${label} bossMechanics[${index}]`;
        assert(typeof mechanic.id === 'string' && mechanic.id.length > 0, `${mechanicLabel} must have an id`);
        assert(supportedPatterns.has(mechanic.pattern), `${mechanicLabel} has unsupported pattern ${mechanic.pattern}`);
        assert(Number(mechanic.warningMs) >= 650, `${mechanicLabel} warningMs must give players time to dodge`);
        assert(Number(mechanic.impactMs) >= 120, `${mechanicLabel} impactMs must be visible`);
        assert(Number(mechanic.cooldownMs) >= 4000, `${mechanicLabel} cooldownMs must prevent unavoidable spam`);
        assert(Number(mechanic.damageMultiplier) > 0, `${mechanicLabel} damageMultiplier must be positive`);
        assert(typeof mechanic.color === 'string' && /^#[0-9a-f]{6}$/i.test(mechanic.color), `${mechanicLabel} must define a hex color`);

        if (mechanic.pattern === 'circle') {
            assert(Number(mechanic.radius) >= 40, `${mechanicLabel} circle radius must be at least 40`);
        } else if (mechanic.pattern === 'donut') {
            assert(Number(mechanic.outerRadius) > Number(mechanic.innerRadius), `${mechanicLabel} donut outerRadius must exceed innerRadius`);
        } else if (mechanic.pattern === 'line' || mechanic.pattern === 'parallel_lines') {
            assert(Number(mechanic.width) >= 24, `${mechanicLabel} line width must be at least 24`);
            assert(Number(mechanic.length) >= 200, `${mechanicLabel} line length must be at least 200`);
            if (mechanic.pattern === 'parallel_lines') {
                assert(Number.isInteger(mechanic.lanes) && mechanic.lanes >= 2, `${mechanicLabel} parallel_lines lanes must be 2+`);
                assert(Number(mechanic.laneGap) > Number(mechanic.width), `${mechanicLabel} laneGap must leave dodge space`);
            }
        } else if (mechanic.pattern === 'circle_cluster') {
            assert(Number.isInteger(mechanic.count) && mechanic.count >= 2, `${mechanicLabel} circle_cluster count must be 2+`);
            assert(Number(mechanic.radius) >= 40, `${mechanicLabel} circle_cluster radius must be at least 40`);
            assert(Number(mechanic.ringRadius) > Number(mechanic.radius), `${mechanicLabel} circle_cluster ringRadius must exceed radius`);
        }
    });
}

function validateStrictProgression(entries, label) {
    entries.forEach((entry, index) => {
        if (index === 0) return;
        const previous = entries[index - 1];
        assert(
            entry.level > previous.level,
            `${label} level must increase: ${previous.id}(${previous.level}) -> ${entry.id}(${entry.level})`
        );
        assert(
            entry.exp > previous.exp,
            `${label} EXP must increase: ${previous.id}(${previous.exp}) -> ${entry.id}(${entry.exp})`
        );
        assert(
            entry.currencyMin > previous.currencyMin,
            `${label} currency reward must increase: ${previous.id}(${previous.currencyMin}) -> ${entry.id}(${entry.currencyMin})`
        );
    });
}

function getLevelMaxExp(level) {
    let maxExp = 100;
    for (let currentLevel = 1; currentLevel < level; currentLevel += 1) {
        maxExp = Math.floor(maxExp * 1.5);
    }
    return maxExp;
}

function getOverlevelExpMultiplier(playerLevel, monsterLevel) {
    const gap = Math.max(0, Number(playerLevel || 1) - Math.max(1, Number(monsterLevel || 1)));
    if (gap <= 3) return 1;
    if (gap <= 5) return 0.75;
    if (gap <= 8) return 0.5;
    if (gap <= 12) return 0.25;
    return 0.1;
}

function estimateLevelBandKills({ startLevel, targetLevel, normalExp, normalLevel, bossExp, bossLevel }) {
    const state = {
        level: startLevel,
        exp: 0,
        maxExp: getLevelMaxExp(startLevel)
    };
    const grantExp = (baseExp, monsterLevel) => {
        const multiplier = getOverlevelExpMultiplier(state.level, monsterLevel);
        state.exp += Math.max(1, Math.floor(baseExp * multiplier));
        while (state.exp >= state.maxExp) {
            state.exp -= state.maxExp;
            state.level += 1;
            state.maxExp = Math.floor(state.maxExp * 1.5);
        }
    };

    // A field boss is expected once per level band; normal kills fill the rest.
    grantExp(bossExp, bossLevel);
    let normalKills = 0;
    while (state.level < targetLevel && normalKills < 10000) {
        grantExp(normalExp, normalLevel);
        normalKills += 1;
    }
    return normalKills;
}

const zoneCatalog = readJson('assets/data/zones/zone_catalog.json');
const itemCatalog = readJson('assets/data/items/item_catalog.json');

if (!zoneCatalog || !itemCatalog) {
    console.error('[world-content] Cannot continue without zone and item catalogs.');
    process.exitCode = 1;
} else {
    const itemDocuments = loadItemCatalogGroup(itemCatalog.items, 'items');
    const affixDocuments = loadItemCatalogGroup(itemCatalog.affixPools, 'affixPools');
    const enhancementDocuments = loadItemCatalogGroup(itemCatalog.enhancementRules, 'enhancementRules');
    const dropDocuments = loadItemCatalogGroup(itemCatalog.dropRules, 'dropRules');

    const itemsById = new Map();
    const affixPoolsById = new Map();
    const affixesById = new Map();
    const enhancementRulesById = new Map();

    itemDocuments.forEach((item) => addUnique(itemsById, item.id, item, 'item'));
    affixDocuments.forEach((pool) => {
        addUnique(affixPoolsById, pool.id, pool, 'affix pool');
        if (!Array.isArray(pool.affixes) || pool.affixes.length === 0) {
            fail(`Affix pool ${pool.id} must contain at least one affix`);
            return;
        }
        pool.affixes.forEach((affix) => addUnique(affixesById, affix.id, affix, 'affix'));
    });
    enhancementDocuments.forEach((document) => {
        (document.ruleSets || []).forEach((rule) => (
            addUnique(enhancementRulesById, rule.id, rule, 'enhancement rule')
        ));
    });

    itemsById.forEach((item) => {
        if (item.prefixPool) {
            assert(
                affixPoolsById.has(item.prefixPool),
                `Item ${item.id} references missing prefixPool ${item.prefixPool}`
            );
        }
        if (item.enhancementRuleSet) {
            assert(
                enhancementRulesById.has(item.enhancementRuleSet),
                `Item ${item.id} references missing enhancementRuleSet ${item.enhancementRuleSet}`
            );
        }
        if (item.icon?.path) {
            assert(
                fs.existsSync(repoPath(item.icon.path)),
                `Item ${item.id} icon is missing: ${item.icon.path}`
            );
        }
    });

    affixesById.forEach((affix) => {
        Object.values(affix.skillOverrides || {}).forEach((variant) => {
            assert(
                supportedWeaponVariants.has(variant),
                `Affix ${affix.id} uses unsupported weapon variant ${variant}`
            );
        });
    });

    const dropRules = {
        globalDrops: dropDocuments.flatMap((document) => document.globalDrops || []),
        bossDrops: dropDocuments.flatMap((document) => document.bossDrops || []),
        bossBonusDrops: dropDocuments.flatMap((document) => document.bossBonusDrops || [])
    };

    dropRules.globalDrops.forEach((drop) => {
        assert(itemsById.has(drop.itemId), `Global drop references missing item ${drop.itemId}`);
        assert(drop.chance > 0 && drop.chance <= 1, `Global drop ${drop.itemId} has invalid chance`);
    });

    const zonesById = new Map();
    const zoneCatalogEntries = Array.isArray(zoneCatalog.zones) ? zoneCatalog.zones : [];
    assert(zoneCatalogEntries.length > 0, 'zone_catalog.zones must not be empty');

    zoneCatalogEntries.forEach((catalogZone, zoneIndex) => {
        const zone = readJson(`assets/data/zones/${catalogZone.id}.json`);
        if (!zone) return;
        addUnique(zonesById, zone.id, zone, 'zone');
        assert(zone.id === catalogZone.id, `Zone file id does not match catalog id ${catalogZone.id}`);
        if (zoneIndex > 0) {
            assert(zone.name === catalogZone.name, `Zone ${zone.id} name differs from zone catalog`);
            assert(zone.requiredLevel === catalogZone.requiredLevel, `Zone ${zone.id} requiredLevel differs from catalog`);
            assert(
                zone.recommendedLevel?.min === catalogZone.recommendedLevel?.min
                    && zone.recommendedLevel?.max === catalogZone.recommendedLevel?.max,
                `Zone ${zone.id} recommendedLevel differs from catalog`
            );
        }
        assert(catalogZone.requiredLevel > 0, `Zone ${zone.id} requiredLevel must be positive`);
        assert(
            catalogZone.recommendedLevel?.min <= catalogZone.recommendedLevel?.max,
            `Zone ${zone.id} has an invalid recommended level range`
        );
        assert(
            catalogZone.requiredLevel <= catalogZone.recommendedLevel?.min,
            `Zone ${zone.id} requiredLevel must not exceed its recommended minimum`
        );

        if (zoneIndex > 0) {
            const previous = zoneCatalogEntries[zoneIndex - 1];
            assert(
                catalogZone.requiredLevel > previous.requiredLevel,
                `Zone required levels must increase at ${zone.id}`
            );
            assert(
                catalogZone.recommendedLevel.min > previous.recommendedLevel.max,
                `Recommended level bands must not overlap at ${zone.id}`
            );
            assert(zone.theme?.tint, `Zone ${zone.id} must define theme.tint`);
            assert(
                zone.theme?.tintAlpha >= 0 && zone.theme?.tintAlpha <= 1,
                `Zone ${zone.id} theme.tintAlpha must be between 0 and 1`
            );
            assert(zone.theme?.motif, `Zone ${zone.id} must define theme.motif`);
            assert(zone.theme?.motifColor, `Zone ${zone.id} must define theme.motifColor`);
        }

        if (zone.background?.image) {
            assert(
                fs.existsSync(repoPath(zone.background.image)),
                `Zone ${zone.id} background is missing: ${zone.background.image}`
            );
        }

        (zone.spawnPoints || []).forEach((spawnPoint) => {
            assert(
                insideBounds(spawnPoint, zone.boundaries),
                `Zone ${zone.id} spawn point ${spawnPoint.id} is outside its boundaries`
            );
        });

        const catalogNormalIds = new Set((catalogZone.normalMonsters || []).map((entry) => entry.id));
        const spawnNormalIds = new Set((zone.monsterSpawns || []).map((entry) => entry.monsterId));
        catalogNormalIds.forEach((monsterId) => {
            assert(spawnNormalIds.has(monsterId), `Zone ${zone.id} does not spawn catalog monster ${monsterId}`);
        });
        spawnNormalIds.forEach((monsterId) => {
            assert(catalogNormalIds.has(monsterId), `Zone ${zone.id} spawns uncatalogued monster ${monsterId}`);
        });

        (zone.monsterSpawns || []).forEach((spawn) => {
            assert(Number.isInteger(spawn.count) && spawn.count > 0, `Zone ${zone.id} has invalid ${spawn.monsterId} count`);
            if (zoneIndex > 0) {
                assert(spawn.initialDelaySeconds >= 0, `Zone ${zone.id} ${spawn.monsterId} initial delay is invalid`);
                assert(spawn.respawnSeconds > 0, `Zone ${zone.id} ${spawn.monsterId} respawn is invalid`);
            }
            const area = spawn.area;
            assert(
                area
                    && area.x >= zone.boundaries.minX
                    && area.y >= zone.boundaries.minY
                    && area.x + area.w <= zone.boundaries.maxX
                    && area.y + area.h <= zone.boundaries.maxY,
                `Zone ${zone.id} ${spawn.monsterId} spawn area is outside its boundaries`
            );
        });

        if (zoneIndex > 0) {
            assert(zone.bossSpawn, `Zone ${zone.id} must define bossSpawn`);
            assert(
                zone.bossSpawn?.monsterId === catalogZone.boss?.id,
                `Zone ${zone.id} bossSpawn does not match catalog boss`
            );
            assert(
                zone.bossSpawn?.displayName === catalogZone.boss?.name,
                `Zone ${zone.id} boss displayName does not match catalog boss`
            );
            assert(
                insideBounds(zone.bossSpawn?.point, zone.boundaries),
                `Zone ${zone.id} boss point is outside its boundaries`
            );
            assert(zone.bossSpawn?.initialDelaySeconds >= 0, `Zone ${zone.id} boss initial delay is invalid`);
            assert(zone.bossSpawn?.respawnSeconds > 0, `Zone ${zone.id} boss respawn is invalid`);
            assert(
                typeof zone.bossSpawn?.questGate?.questId === 'string'
                    && zone.bossSpawn.questGate.questId.length > 0,
                `Zone ${zone.id} boss questGate.questId is required`
            );
            assert(
                ['active', 'completed', 'activeOrCompleted'].includes(
                    zone.bossSpawn?.questGate?.mode || 'activeOrCompleted'
                ),
                `Zone ${zone.id} boss questGate.mode is invalid`
            );
        } else if (!zone.bossSpawn) {
            warn(`${zone.id} keeps its legacy quest-driven boss spawn`);
        }
    });

    const referencedMonsterIds = new Set();
    const catalogBossMonsterIds = new Set();
    zoneCatalogEntries.forEach((zone) => {
        (zone.normalMonsters || []).forEach((monster) => referencedMonsterIds.add(monster.id));
        if (zone.boss?.id) {
            referencedMonsterIds.add(zone.boss.id);
            catalogBossMonsterIds.add(zone.boss.id);
        }
    });
    zonesById.forEach((zone) => {
        (zone.monsterSpawns || []).forEach((spawn) => referencedMonsterIds.add(spawn.monsterId));
        if (zone.bossSpawn?.monsterId) referencedMonsterIds.add(zone.bossSpawn.monsterId);
    });
    dropRules.bossDrops.forEach((drop) => referencedMonsterIds.add(drop.monsterId));
    dropRules.bossBonusDrops.forEach((drop) => referencedMonsterIds.add(drop.monsterId));

    const monstersById = new Map();
    referencedMonsterIds.forEach((monsterId) => {
        const monster = readJson(`assets/data/monsters/${monsterId}.json`);
        if (!monster) return;
        assert(monster.id === monsterId, `Monster file id does not match ${monsterId}`);
        addUnique(monstersById, monster.id, monster, 'monster');
    });

    const checkedSheets = new Set();
    monstersById.forEach((monster) => {
        const stats = monster.baseStats || {};
        assert(stats.hp > 0 && stats.maxHp === stats.hp, `Monster ${monster.id} must have matching positive hp/maxHp`);
        assert(stats.atk > 0, `Monster ${monster.id} must have positive atk`);
        assert(stats.def >= 0, `Monster ${monster.id} must have non-negative def`);
        assert(stats.exp > 0, `Monster ${monster.id} must have positive exp`);

        (monster.drops || []).forEach((drop) => {
            assert(
                currencyItemIds.has(drop.itemId) || itemsById.has(drop.itemId),
                `Monster ${monster.id} drop references missing item ${drop.itemId}`
            );
            assert(drop.chance > 0 && drop.chance <= 1, `Monster ${monster.id} drop ${drop.itemId} has invalid chance`);
            assert(drop.min >= 0 && drop.max >= drop.min, `Monster ${monster.id} drop ${drop.itemId} has invalid range`);
        });

        validateSpriteSheet(monster, checkedSheets);
        validateBossMechanics(monster, catalogBossMonsterIds.has(monster.id));
    });

    zoneCatalogEntries.slice(1).forEach((catalogZone) => {
        const zone = zonesById.get(catalogZone.id);
        const arrival = (zone?.spawnPoints || []).find((point) => point.id === 'default');
        (zone?.monsterSpawns || []).forEach((spawn) => {
            const monster = monstersById.get(spawn.monsterId);
            const aggroRange = Math.max(0, Number(monster?.behavior?.aggroRange || 0));
            const arrivalClearance = distanceFromPointToRect(arrival, spawn.area);
            assert(
                arrivalClearance >= aggroRange + 100,
                `Zone ${zone.id} arrival must stay at least 100px beyond ${spawn.monsterId} aggro range `
                    + `(clearance ${Math.round(arrivalClearance)}, required ${aggroRange + 100})`
            );
        });
    });

    const bossDropsByMonster = new Map();
    dropRules.bossDrops.forEach((drop) => {
        assert(monstersById.has(drop.monsterId), `Boss drop references missing monster ${drop.monsterId}`);
        assert(itemsById.has(drop.itemId), `Boss drop ${drop.monsterId} references missing item ${drop.itemId}`);
        assert(affixPoolsById.has(drop.rollAffixFromPool), `Boss drop ${drop.monsterId} references missing affix pool ${drop.rollAffixFromPool}`);
        assert(drop.chance > 0 && drop.chance <= 1, `Boss drop ${drop.monsterId} has invalid chance`);
        assert(Number.isInteger(drop.quantity) && drop.quantity > 0, `Boss drop ${drop.monsterId} has invalid quantity`);
        const item = itemsById.get(drop.itemId);
        if (item) {
            assert(item.prefixPool === drop.rollAffixFromPool, `Boss drop ${drop.monsterId} pool differs from item ${item.id}`);
            assert((item.dropSource || []).includes(drop.monsterId), `Item ${item.id} is missing dropSource ${drop.monsterId}`);
        }
        const list = bossDropsByMonster.get(drop.monsterId) || [];
        list.push(drop);
        bossDropsByMonster.set(drop.monsterId, list);
    });

    const bossBonusDropsByMonster = new Map();
    dropRules.bossBonusDrops.forEach((drop) => {
        assert(monstersById.has(drop.monsterId), `Boss bonus drop references missing monster ${drop.monsterId}`);
        assert(itemsById.has(drop.itemId), `Boss bonus drop ${drop.monsterId} references missing item ${drop.itemId}`);
        assert(drop.chance > 0 && drop.chance <= 1, `Boss bonus drop ${drop.monsterId} has invalid chance`);
        assert(Number.isInteger(drop.min) && drop.min > 0, `Boss bonus drop ${drop.monsterId} has invalid min`);
        assert(Number.isInteger(drop.max) && drop.max >= drop.min, `Boss bonus drop ${drop.monsterId} has invalid max`);
        const list = bossBonusDropsByMonster.get(drop.monsterId) || [];
        list.push(drop);
        bossBonusDropsByMonster.set(drop.monsterId, list);
    });

    zoneCatalogEntries.forEach((catalogZone) => {
        const bossId = catalogZone.boss?.id;
        const drops = bossDropsByMonster.get(bossId) || [];
        assert(drops.length > 0, `Catalog boss ${bossId} has no guaranteed equipment drop`);
        const matchingWeapon = drops
            .map((drop) => itemsById.get(drop.itemId))
            .find((item) => item?.name === catalogZone.boss?.weaponName);
        assert(
            matchingWeapon,
            `Catalog boss ${bossId} weaponName does not match its item drop`
        );
        const optionRerollDrop = (bossBonusDropsByMonster.get(bossId) || [])
            .find((drop) => drop.itemId === 'option_reroll_stone');
        assert(
            optionRerollDrop && optionRerollDrop.chance === 0.3 && optionRerollDrop.min === 1 && optionRerollDrop.max === 3,
            `Catalog boss ${bossId} must drop option_reroll_stone at 30% for 1~3`
        );
    });

    const normalProgression = [];
    const bossProgression = [];
    const weaponProgression = [];
    zoneCatalogEntries.forEach((catalogZone) => {
        (catalogZone.normalMonsters || []).forEach((entry) => {
            const monster = monstersById.get(entry.id);
            if (!monster) return;
            const manaDrop = (monster.drops || []).find((drop) => drop.itemId === 'manastone');
            normalProgression.push({
                id: monster.id,
                level: monster.baseStats?.level ?? catalogZone.recommendedLevel.min,
                exp: monster.baseStats?.exp ?? 0,
                currencyMin: manaDrop?.min ?? 0
            });
        });

        const boss = monstersById.get(catalogZone.boss?.id);
        if (boss) {
            const manaDrop = (boss.drops || []).find((drop) => drop.itemId === 'manastone');
            bossProgression.push({
                id: boss.id,
                level: boss.baseStats?.level ?? catalogZone.recommendedLevel.max,
                exp: boss.baseStats?.exp ?? 0,
                currencyMin: manaDrop?.min ?? 0
            });
        }

        const bossDrop = (bossDropsByMonster.get(catalogZone.boss?.id) || [])[0];
        const weapon = bossDrop ? itemsById.get(bossDrop.itemId) : null;
        if (weapon) {
            weaponProgression.push({
                id: weapon.id,
                attackPower: weapon.baseStats?.attackPower ?? 0
            });
        }
    });

    validateStrictProgression(normalProgression, 'Normal monster progression');
    validateStrictProgression(bossProgression, 'Boss progression');
    weaponProgression.forEach((entry, index) => {
        if (index === 0) return;
        const previous = weaponProgression[index - 1];
        assert(
            entry.attackPower > previous.attackPower,
            `Boss weapon attackPower must increase: ${previous.id} -> ${entry.id}`
        );
    });

    const balanceEstimates = [];
    zoneCatalogEntries.slice(1).forEach((catalogZone, offset) => {
        const normalMonsters = (catalogZone.normalMonsters || [])
            .map((entry) => monstersById.get(entry.id))
            .filter(Boolean);
        const boss = monstersById.get(catalogZone.boss?.id);
        if (normalMonsters.length === 0 || !boss) return;

        const averageNormalExp = normalMonsters.reduce((sum, monster) => (
            sum + Number(monster.baseStats?.exp || 0)
        ), 0) / normalMonsters.length;
        const bossExp = Number(boss.baseStats?.exp || 0);
        const nextCatalogZone = zoneCatalogEntries[offset + 2];
        const targetLevel = nextCatalogZone?.requiredLevel || catalogZone.recommendedLevel.max;
        const averageNormalLevel = normalMonsters.reduce((sum, monster) => (
            sum + Number(monster.baseStats?.level || catalogZone.requiredLevel)
        ), 0) / normalMonsters.length;
        const estimatedNormalKills = estimateLevelBandKills({
            startLevel: catalogZone.requiredLevel,
            targetLevel,
            normalExp: averageNormalExp,
            normalLevel: averageNormalLevel,
            bossExp,
            bossLevel: Number(boss.baseStats?.level || catalogZone.recommendedLevel.max)
        });

        assert(
            estimatedNormalKills >= 40 && estimatedNormalKills <= 100,
            `Zone ${catalogZone.id} progression should take 40-100 normal kills with one boss and overlevel decay, estimated ${estimatedNormalKills}`
        );
        balanceEstimates.push(`${catalogZone.id}:${estimatedNormalKills}`);
    });

    const monsterDataManagerSource = fs.readFileSync(
        repoPath('src/js/core/MonsterDataManager.js'),
        'utf8'
    );
    assert(
        monsterDataManagerSource.includes('getMonsterDefinitionCacheVersion()')
            && monsterDataManagerSource.includes('GAME_VERSION')
            && monsterDataManagerSource.includes('monster_def_${getMonsterDefinitionCacheVersion()}_${normalizedId}'),
        'Monster definition session cache must be namespaced by the active build version'
    );

    const monsterEntitySource = fs.readFileSync(
        repoPath('src/js/entities/Monster.js'),
        'utf8'
    );
    assert(
        monsterEntitySource.includes('this.defense = this.def;'),
        'Monster runtime defense must expose authored baseStats.def through the canonical defense property'
    );
    assert(
        monsterEntitySource.includes('this.spriteContentBounds')
            && monsterEntitySource.includes('groundedAtlasOffset')
            && monsterEntitySource.includes('(contentTop / atlasFrameHeight) * renderHeight'),
        'Monster v2 rendering must use audited alpha bounds for ground alignment and HUD placement without cropping cells'
    );

    warnings.forEach((message) => console.warn(`[world-content] warning: ${message}`));
    errors.forEach((message) => console.error(`[world-content] error: ${message}`));

    if (errors.length > 0) {
        console.error(`[world-content] FAILED with ${errors.length} error(s).`);
        process.exitCode = 1;
    } else {
        console.log(
            `[world-content] OK: ${zonesById.size} zones, ${monstersById.size} monsters, `
            + `${itemsById.size} items, ${checkedSheets.size} v2 sheets, ${loadedJsonFiles.size} JSON files. `
            + `Estimated band kills ${balanceEstimates.join(', ')}.`
        );
    }
}
