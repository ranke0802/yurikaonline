const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const questsDir = path.join(root, 'assets', 'data', 'quests');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function existsDataFile(kind, id) {
    return fs.existsSync(path.join(root, 'assets', 'data', kind, `${id}.json`));
}

function collectItemIds() {
    const catalogPath = path.join(root, 'assets', 'data', 'items', 'item_catalog.json');
    const catalog = readJson(catalogPath);
    return new Set((catalog.items || []).map((entry) => entry.id).filter(Boolean));
}

function main() {
    const catalogPath = path.join(questsDir, 'quest_catalog.json');
    assert(fs.existsSync(catalogPath), 'quest_catalog.json must exist');
    const catalog = readJson(catalogPath);
    assert.equal(catalog.schemaVersion, 2, 'quest catalog schemaVersion must be 2');
    assert(Array.isArray(catalog.quests), 'quest catalog must contain quests[]');

    const itemIds = collectItemIds();
    const questIds = new Set();
    const questById = new Map();
    const objectiveKeys = new Set();

    for (const entry of catalog.quests) {
        assert(entry.id, 'catalog entry id is required');
        assert(entry.path, `catalog entry ${entry.id} path is required`);
        assert(!questIds.has(entry.id), `duplicate quest id in catalog: ${entry.id}`);
        questIds.add(entry.id);

        const questPath = path.join(questsDir, entry.path);
        assert(fs.existsSync(questPath), `quest file not found: ${entry.path}`);
        const quest = readJson(questPath);
        assert.equal(quest.id, entry.id, `quest id mismatch for ${entry.path}`);
        assert(Array.isArray(quest.objectives), `${quest.id} must define objectives[]`);
        assert(quest.objectives.length > 0, `${quest.id} must have at least one objective`);
        questById.set(quest.id, quest);

        for (const objective of quest.objectives) {
            assert(objective.id, `${quest.id} objective id is required`);
            const objectiveKey = `${quest.id}:${objective.id}`;
            assert(!objectiveKeys.has(objectiveKey), `duplicate objective id: ${objectiveKey}`);
            objectiveKeys.add(objectiveKey);
            assert(objective.type, `${objectiveKey} type is required`);
            assert(Number(objective.count || 1) > 0, `${objectiveKey} count must be positive`);

            if (objective.type === 'kill' || objective.type === 'bossKill') {
                assert(objective.target, `${objectiveKey} target is required`);
                assert(existsDataFile('monsters', objective.target), `${objectiveKey} references missing monster ${objective.target}`);
            }
            if (objective.type === 'travel') {
                assert(objective.targetZone, `${objectiveKey} targetZone is required`);
                assert(existsDataFile('zones', objective.targetZone), `${objectiveKey} references missing zone ${objective.targetZone}`);
            }
            if (objective.type === 'collect') {
                assert(objective.itemId, `${objectiveKey} itemId is required`);
                assert(itemIds.has(objective.itemId), `${objectiveKey} references missing item ${objective.itemId}`);
            }
        }
    }

    const aliasTargets = new Map();
    for (const alias of catalog.aliases || []) {
        assert(alias.from && alias.to, 'alias requires from/to');
        assert(questIds.has(alias.to), `alias target does not exist: ${alias.to}`);
        aliasTargets.set(alias.from, alias.to);
    }
    const resolveQuestId = (rawId) => aliasTargets.get(rawId) || rawId;

    for (const quest of questById.values()) {
        for (const prereq of quest.prerequisites || []) {
            const questId = typeof prereq === 'string' ? prereq : prereq.questId;
            if (questId) {
                assert(questIds.has(resolveQuestId(questId)), `${quest.id} references missing prerequisite ${questId}`);
            }
        }
        for (const unlock of quest.onComplete?.unlocks || []) {
            assert(questIds.has(resolveQuestId(unlock)), `${quest.id} references missing unlock ${unlock}`);
        }
        if (quest.replacementId) {
            assert(questIds.has(resolveQuestId(quest.replacementId)), `${quest.id} replacementId is missing`);
        }
        if (quest.ui?.recommendedZone) {
            assert(existsDataFile('zones', quest.ui.recommendedZone), `${quest.id} references missing recommendedZone ${quest.ui.recommendedZone}`);
        }
        if (quest.onComplete?.recommendZone) {
            assert(existsDataFile('zones', quest.onComplete.recommendZone), `${quest.id} references missing recommendZone ${quest.onComplete.recommendZone}`);
        }
        if (quest.bossRewardGuide) {
            assert(existsDataFile('monsters', quest.bossRewardGuide.bossId), `${quest.id} references missing bossRewardGuide boss`);
            assert(itemIds.has(quest.bossRewardGuide.itemId), `${quest.id} references missing bossRewardGuide item`);
        }
    }

    const graph = new Map();
    for (const quest of questById.values()) {
        graph.set(quest.id, (quest.onComplete?.unlocks || []).map(resolveQuestId));
    }
    const visiting = new Set();
    const visited = new Set();
    function visit(id, stack = []) {
        if (visiting.has(id)) throw new Error(`quest unlock cycle detected: ${[...stack, id].join(' -> ')}`);
        if (visited.has(id)) return;
        visiting.add(id);
        for (const next of graph.get(id) || []) visit(next, [...stack, id]);
        visiting.delete(id);
        visited.add(id);
    }
    for (const id of graph.keys()) visit(id);

    console.log(`[quest-content] validated ${questById.size} quests`);
}

main();
