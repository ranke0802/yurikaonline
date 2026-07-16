import Logger from '../utils/Logger.js';

const QUEST_BASE_PATH = '/assets/data/quests/';
const QUEST_CATALOG_PATH = `${QUEST_BASE_PATH}quest_catalog.json`;
const LEGACY_QUEST_IDS = Object.freeze([
    'quest_slime_10',
    'quest_slime_30',
    'quest_boss_king_slime',
    'quest_slime_repeat'
]);

const DEFAULT_STATE = Object.freeze({
    schemaVersion: 2,
    active: {},
    completed: {},
    flags: {},
    recommendedZoneId: null,
    lastEventAt: 0
});

function clone(value) {
    if (value == null || typeof value !== 'object') return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return Array.isArray(value) ? value.slice() : { ...value };
    }
}

function nowMs() {
    return Date.now();
}

function normalizeQuestId(id, aliases = new Map()) {
    if (typeof id !== 'string') return '';
    let current = id;
    const visited = new Set();
    while (aliases.has(current) && !visited.has(current)) {
        visited.add(current);
        current = aliases.get(current);
    }
    return current;
}

export default class QuestManager {
    constructor(game) {
        this.game = game;
        this.catalog = null;
        this.catalogEntries = [];
        this.aliases = new Map();
        this.definitions = new Map();
        this.activeQuests = new Map();
        this.completedQuests = new Set();
        this.state = clone(DEFAULT_STATE);
        this._loaded = false;
    }

    async loadQuests() {
        this.definitions.clear();
        this.catalogEntries = [];
        this.aliases.clear();

        let catalog = null;
        try {
            catalog = await this.game.resources.loadJSON(QUEST_CATALOG_PATH);
        } catch (error) {
            Logger.warn('[QuestManager] quest_catalog.json 로드 실패. 레거시 파일 목록으로 대체합니다.', error);
        }

        if (!catalog || !Array.isArray(catalog.quests)) {
            catalog = {
                schemaVersion: 1,
                activeSet: 'legacy_fallback',
                quests: LEGACY_QUEST_IDS.map((id, index) => ({
                    id,
                    path: `${id}.json`,
                    enabled: true,
                    chapter: 'zone_1',
                    order: 100 + index * 10,
                    tags: ['legacy-compatible']
                })),
                aliases: []
            };
        }

        this.catalog = catalog;
        (catalog.aliases || []).forEach((entry) => {
            if (typeof entry?.from === 'string' && typeof entry?.to === 'string') {
                this.aliases.set(entry.from, entry.to);
            }
        });

        const entries = (catalog.quests || [])
            .filter((entry) => entry && typeof entry.id === 'string' && typeof entry.path === 'string')
            .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

        for (const entry of entries) {
            try {
                const data = await this.game.resources.loadJSON(`${QUEST_BASE_PATH}${entry.path}`);
                if (!data?.id) continue;
                const normalizedId = normalizeQuestId(data.id, this.aliases);
                const definition = this._normalizeDefinition({
                    ...data,
                    id: normalizedId,
                    enabled: entry.enabled !== false && data.enabled !== false,
                    deprecated: entry.deprecated === true || data.deprecated === true,
                    replacementId: data.replacementId || entry.replacementId || null,
                    chapter: data.chapter || entry.chapter || 'zone_1',
                    order: Number(data.order ?? entry.order ?? 9999),
                    tags: Array.from(new Set([...(entry.tags || []), ...(data.tags || [])])),
                    catalogPath: entry.path
                });
                this.definitions.set(definition.id, definition);
                this.catalogEntries.push({ ...entry, id: definition.id });
            } catch (error) {
                Logger.warn(`[QuestManager] 퀘스트 로드 실패: ${entry.id}`, error);
            }
        }

        this._loaded = true;
        this._rebuildRuntimeMaps();
        Logger.log(`[QuestManager] Loaded ${this.definitions.size} quest definitions from catalog`);
    }

    _normalizeDefinition(raw) {
        const objectives = (raw.objectives || []).map((objective, index) => {
            const id = objective.id || `${objective.type || 'objective'}_${objective.target || objective.targetZone || objective.itemId || index}`;
            return {
                ...objective,
                id,
                type: objective.type || 'kill',
                count: Math.max(1, Math.floor(Number(objective.count || 1))),
                description: objective.description || objective.uiText || '진행도: {current}/{count}',
                uiText: objective.uiText || objective.description || '진행도: {current}/{count}',
                scope: objective.scope || 'player',
                accumulate: objective.accumulate === true || objective.cumulative === true
            };
        });

        return {
            schemaVersion: Number(raw.schemaVersion || 1),
            id: raw.id,
            enabled: raw.enabled !== false,
            deprecated: raw.deprecated === true,
            replacementId: raw.replacementId || null,
            title: raw.title || raw.id,
            description: raw.description || '',
            type: raw.type || 'main',
            chapter: raw.chapter || 'zone_1',
            order: Number(raw.order || 9999),
            prerequisites: this._normalizePrerequisites(raw.prerequisites || []),
            activation: raw.activation || { mode: 'manual', events: [] },
            objectives,
            rewards: raw.rewards || {},
            ui: raw.ui || {},
            bossRewardGuide: raw.bossRewardGuide || null,
            onComplete: raw.onComplete || {},
            tags: raw.tags || [],
            catalogPath: raw.catalogPath || null
        };
    }

    _normalizePrerequisites(prerequisites) {
        return (prerequisites || []).map((entry) => {
            if (typeof entry === 'string') return { type: 'questCompleted', questId: normalizeQuestId(entry, this.aliases) };
            if (!entry || typeof entry !== 'object') return null;
            const next = { ...entry };
            if (next.questId) next.questId = normalizeQuestId(next.questId, this.aliases);
            return next;
        }).filter(Boolean);
    }

    _createEmptyState() {
        return clone(DEFAULT_STATE);
    }

    _normalizeState(data = null) {
        const state = this._createEmptyState();
        const source = data && typeof data === 'object' ? data : {};

        if (source.schemaVersion) state.schemaVersion = Math.max(2, Number(source.schemaVersion || 2));
        if (source.flags && typeof source.flags === 'object') state.flags = { ...source.flags };
        state.recommendedZoneId = typeof source.recommendedZoneId === 'string' ? source.recommendedZoneId : null;
        state.lastEventAt = Math.max(0, Number(source.lastEventAt || 0));

        if (Array.isArray(source.active)) {
            source.active.forEach((entry) => {
                const id = normalizeQuestId(entry?.id, this.aliases);
                if (!id) return;
                state.active[id] = this._normalizeActiveEntry(id, entry.progress || entry);
            });
        } else if (source.active && typeof source.active === 'object') {
            Object.entries(source.active).forEach(([rawId, entry]) => {
                const id = normalizeQuestId(rawId, this.aliases);
                if (!id) return;
                state.active[id] = this._normalizeActiveEntry(id, entry);
            });
        }

        if (Array.isArray(source.completed)) {
            source.completed.forEach((rawId) => {
                const id = normalizeQuestId(rawId, this.aliases);
                if (id) state.completed[id] = { completedAt: 0, count: 1 };
            });
        } else if (source.completed && typeof source.completed === 'object') {
            Object.entries(source.completed).forEach(([rawId, entry]) => {
                const id = normalizeQuestId(rawId, this.aliases);
                if (!id) return;
                state.completed[id] = typeof entry === 'object' && entry
                    ? {
                        completedAt: Math.max(0, Number(entry.completedAt || 0)),
                        count: Math.max(1, Number(entry.count || 1))
                    }
                    : { completedAt: 0, count: 1 };
            });
        }

        return state;
    }

    _normalizeActiveEntry(questId, entry = {}) {
        const def = this.definitions.get(questId);
        const active = {
            acceptedAt: Math.max(0, Number(entry?.acceptedAt || nowMs())),
            cycle: Math.max(1, Number(entry?.cycle || 1)),
            objectives: {}
        };

        if (Array.isArray(entry?.objectives)) {
            (def?.objectives || []).forEach((objective, index) => {
                const source = entry.objectives[index] || {};
                active.objectives[objective.id] = {
                    current: Math.max(0, Number(source.current || 0)),
                    complete: source.complete === true
                };
            });
        } else if (entry?.objectives && typeof entry.objectives === 'object') {
            Object.entries(entry.objectives).forEach(([objectiveId, source]) => {
                active.objectives[objectiveId] = {
                    current: Math.max(0, Number(source?.current || 0)),
                    complete: source?.complete === true
                };
            });
        }

        (def?.objectives || []).forEach((objective) => {
            if (!active.objectives[objective.id]) {
                active.objectives[objective.id] = { current: 0, complete: false };
            }
        });

        return active;
    }

    _rebuildRuntimeMaps() {
        this.activeQuests.clear();
        this.completedQuests = new Set(Object.keys(this.state.completed || {}));

        Object.entries(this.state.active || {}).forEach(([questId, active]) => {
            const def = this.definitions.get(questId);
            if (!def) return;
            this.activeQuests.set(questId, {
                definition: def,
                progress: this._activeEntryToProgress(def, active),
                state: active
            });
        });
    }

    _activeEntryToProgress(def, active) {
        return {
            objectives: def.objectives.map((objective) => {
                const entry = active.objectives?.[objective.id] || {};
                return {
                    id: objective.id,
                    current: Math.max(0, Number(entry.current || 0)),
                    complete: entry.complete === true
                };
            })
        };
    }

    deserialize(data) {
        if (!this._loaded) return;
        this.state = this._normalizeState(data);
        this._rebuildRuntimeMaps();
        this._autoActivateAvailable({ reason: 'deserialize' });
        Logger.log(`[QuestManager] Deserialized: ${this.activeQuests.size} active, ${this.completedQuests.size} completed`);
    }

    serialize() {
        return clone(this.state);
    }

    restoreFromLegacy(questData, questState = null) {
        if (!this._loaded) return;
        this.state = this._normalizeState(questState || this.game?.localPlayer?.questState || null);
        this._applyLegacyQuestData(questData || {});
        this._rebuildRuntimeMaps();
        this._autoActivateAvailable({ reason: 'legacy_restore' });
        this._writePlayerQuestState({ save: false });
        Logger.log(`[QuestManager] Restored: ${this.activeQuests.size} active, ${this.completedQuests.size} completed`);
    }

    _applyLegacyQuestData(questData) {
        const slimeKills = Math.max(0, Number(questData.slimeKills || 0));
        const slimeRepeatKills = Math.max(0, Number(questData.slimeRepeatKills || 0));
        const firstQuestUnlocked = !!questData.basicTrainingCompleted
            || slimeKills > 0
            || !!questData.slimeQuestClaimed
            || !!questData.slime30QuestClaimed
            || !!questData.bossQuestClaimed
            || (questData.bossClearCount || 0) > 0;

        if (!firstQuestUnlocked) return;

        if (questData.slimeQuestClaimed) this._markCompleted('quest_slime_10', { silent: true });
        else this._ensureActive('quest_slime_10', {
            objectiveProgress: { kill_slime: Math.min(slimeKills, 10) },
            silent: true
        });

        if (questData.slime30QuestClaimed) this._markCompleted('quest_slime_30', { silent: true });
        else if (questData.slimeQuestClaimed) {
            this._ensureActive('quest_slime_30', {
                objectiveProgress: { kill_slime: Math.min(slimeKills, 30) },
                silent: true
            });
        }

        if (questData.bossQuestClaimed || (questData.bossClearCount || 0) > 0) {
            this._markCompleted('quest_boss_king_slime', { silent: true });
        } else if (questData.slime30QuestClaimed) {
            this._ensureActive('quest_boss_king_slime', {
                objectiveProgress: { kill_king_slime: questData.bossKilled ? 1 : 0 },
                silent: true
            });
        }

        if ((questData.bossClearCount || 0) > 0) {
            this._ensureActive('quest_slime_repeat', {
                objectiveProgress: { kill_slime: slimeRepeatKills },
                silent: true
            });
        }

        if (questData.basicTrainingCompleted) {
            this.state.flags['tutorial.basic_training.completed'] = true;
        }
    }

    _ensureActive(questId, options = {}) {
        const id = normalizeQuestId(questId, this.aliases);
        const def = this.definitions.get(id);
        if (!def || def.enabled === false || def.deprecated === true) return false;
        if (this.state.active[id]) {
            if (options.objectiveProgress) this._applyObjectiveProgress(id, options.objectiveProgress);
            return false;
        }
        if (this.state.completed[id] && def.type !== 'repeat') return false;
        if (!this._prerequisitesMet(def)) return false;

        const active = this._normalizeActiveEntry(id, { acceptedAt: nowMs(), objectives: {} });
        this.state.active[id] = active;
        if (options.objectiveProgress) this._applyObjectiveProgress(id, options.objectiveProgress);
        this._rebuildRuntimeMaps();
        if (!options.silent) Logger.log(`[QuestManager] Quest activated: ${def.title}`);
        return true;
    }

    _activateQuest(questId, objectiveProgress = null) {
        const progressById = {};
        if (Array.isArray(objectiveProgress)) {
            const def = this.definitions.get(normalizeQuestId(questId, this.aliases));
            (def?.objectives || []).forEach((objective, index) => {
                progressById[objective.id] = objectiveProgress[index]?.current || 0;
            });
        }
        return this._ensureActive(questId, { objectiveProgress: progressById });
    }

    acceptQuest(questId) {
        const id = normalizeQuestId(questId, this.aliases);
        const def = this.definitions.get(id);
        if (!def) return false;
        if (this.state.completed[id] && def.type === 'repeat') {
            delete this.state.completed[id];
            this.completedQuests.delete(id);
        }
        const success = this._ensureActive(id);
        if (success) {
            this._writePlayerQuestState({ save: true, reason: 'quest_accept' });
            window.game?.tutorial?.trigger?.('quest_accept', { target: id });
        }
        return success;
    }

    _applyObjectiveProgress(questId, progressById) {
        const active = this.state.active[questId];
        const def = this.definitions.get(questId);
        if (!active || !def) return false;
        let changed = false;
        def.objectives.forEach((objective) => {
            if (!Object.prototype.hasOwnProperty.call(progressById, objective.id)) return;
            const entry = active.objectives[objective.id] || { current: 0, complete: false };
            const next = Math.max(0, Number(progressById[objective.id] || 0));
            if (next !== entry.current || entry.complete !== next >= objective.count) {
                entry.current = Math.min(objective.count, next);
                entry.complete = entry.current >= objective.count;
                active.objectives[objective.id] = entry;
                changed = true;
            }
        });
        if (changed) this._rebuildRuntimeMaps();
        return changed;
    }

    _prerequisitesMet(def) {
        const player = this.game?.localPlayer;
        return (def.prerequisites || []).every((prereq) => {
            if (!prereq) return true;
            if (prereq.type === 'questCompleted') {
                return !!this.state.completed[normalizeQuestId(prereq.questId, this.aliases)];
            }
            if (prereq.type === 'level') {
                return Number(player?.level || 1) >= Number(prereq.level || 1);
            }
            if (prereq.type === 'flag') {
                return this.state.flags[prereq.key] === prereq.value;
            }
            if (prereq.type === 'zone') {
                const zoneId = this.game?.zone?.currentZone?.id || player?.currentZoneId || 'zone_1';
                return zoneId === prereq.zoneId;
            }
            return true;
        });
    }

    _autoActivateAvailable(context = {}) {
        let changed = false;
        const eventType = context.event?.type || context.reason || 'auto';
        const currentZoneId = this.game?.zone?.currentZone?.id || this.game?.localPlayer?.currentZoneId || 'zone_1';
        this._orderedDefinitions().forEach((def) => {
            if (!def.enabled || def.deprecated) return;
            if (this.state.active[def.id]) return;
            if (this.state.completed[def.id] && def.type !== 'repeat') return;
            const mode = def.activation?.mode || 'manual';
            const activationEvents = def.activation?.events || [];
            const shouldTry = mode === 'auto'
                || activationEvents.includes(eventType)
                || (eventType === 'zoneEntered' && activationEvents.includes('zoneEntered'));
            if (!shouldTry) return;
            const hasZoneObjective = def.objectives.some((objective) => (
                objective.type === 'travel' && objective.targetZone === currentZoneId
            ));
            if (hasZoneObjective && eventType !== 'zoneEntered' && currentZoneId !== def.ui?.recommendedZone) return;
            if (this._ensureActive(def.id, { silent: true })) changed = true;
        });
        return changed;
    }

    _orderedDefinitions() {
        return Array.from(this.definitions.values())
            .sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id));
    }

    handleEvent(event = {}) {
        if (!this._loaded || !event?.type) return { changed: false, completed: [] };
        const normalizedEvent = {
            ...event,
            target: event.target || event.monsterId || event.questKill || null,
            targetZone: event.targetZone || event.zoneId || null,
            count: Math.max(1, Number(event.count || 1)),
            ts: Math.max(0, Number(event.ts || nowMs()))
        };

        if (normalizedEvent.type === 'tutorialCompleted' && normalizedEvent.target) {
            this.state.flags[`tutorial.${normalizedEvent.target}.completed`] = true;
        }

        const activated = this._autoActivateAvailable({ event: normalizedEvent });
        let changed = activated;
        const completed = [];

        this._orderedActiveEntries().forEach(([questId, active]) => {
            const def = this.definitions.get(questId);
            if (!def) return;
            let questChanged = false;
            def.objectives.forEach((objective) => {
                if (!this._objectiveMatchesEvent(objective, normalizedEvent)) return;
                const entry = active.objectives[objective.id] || { current: 0, complete: false };
                if (entry.complete) return;
                const next = Math.min(objective.count, entry.current + normalizedEvent.count);
                if (next !== entry.current) {
                    entry.current = next;
                    entry.complete = entry.current >= objective.count;
                    active.objectives[objective.id] = entry;
                    questChanged = true;
                }
            });
            if (questChanged) {
                changed = true;
                if (this._isQuestComplete(questId)) completed.push(questId);
            }
        });

        completed.forEach((questId) => this._autoCompleteQuest(questId, normalizedEvent));
        if (changed || completed.length > 0) {
            this.state.lastEventAt = normalizedEvent.ts;
            this._rebuildRuntimeMaps();
            this._writePlayerQuestState({ save: true, reason: 'quest_event' });
            this.game?.ui?.updateQuestUI?.();
        }
        return { changed: changed || completed.length > 0, completed };
    }

    _orderedActiveEntries() {
        return Object.entries(this.state.active || {})
            .sort(([a], [b]) => {
                const da = this.definitions.get(a);
                const db = this.definitions.get(b);
                return Number(da?.order || 9999) - Number(db?.order || 9999);
            });
    }

    _objectiveMatchesEvent(objective, event) {
        if (objective.zoneId && objective.zoneId !== (event.zoneId || event.targetZone)) return false;
        if (objective.type === 'kill') {
            return event.type === 'monsterKilled' && objective.target === event.target;
        }
        if (objective.type === 'bossKill') {
            return event.type === 'bossKilled' && objective.target === event.target;
        }
        if (objective.type === 'level') {
            return event.type === 'levelChanged' && Number(event.level || 0) >= Number(objective.level || objective.count || 1);
        }
        if (objective.type === 'travel') {
            return event.type === 'zoneEntered' && objective.targetZone === event.targetZone;
        }
        if (objective.type === 'flag') {
            return event.type === 'flagChanged' && event.key === objective.key && event.value === objective.value;
        }
        if (objective.type === 'collect') {
            return event.type === 'itemReceived' && event.itemId === objective.itemId;
        }
        return false;
    }

    _isQuestComplete(questId) {
        const def = this.definitions.get(questId);
        const active = this.state.active[questId];
        if (!def || !active) return false;
        return def.objectives.every((objective) => active.objectives?.[objective.id]?.complete === true);
    }

    _autoCompleteQuest(questId, event = {}) {
        const def = this.definitions.get(questId);
        if (!def || !this.state.active[questId]) return false;

        this._grantJsonRewards(def);
        delete this.state.active[questId];
        if (def.type === 'repeat') {
            const previous = this.state.completed[questId] || { count: 0, completedAt: 0 };
            this.state.completed[questId] = {
                completedAt: event.ts || nowMs(),
                count: Math.max(0, Number(previous.count || 0)) + 1
            };
        } else {
            this._markCompleted(questId, { completedAt: event.ts || nowMs(), silent: true });
        }

        const unlocks = def.onComplete?.unlocks || [];
        unlocks.forEach((nextId) => {
            const activated = this._ensureActive(nextId, { silent: true });
            if (activated && event?.type) {
                const nextQuestId = normalizeQuestId(nextId, this.aliases);
                this._applyEventToQuest(nextQuestId, event);
                if (this._isQuestComplete(nextQuestId)) {
                    this._autoCompleteQuest(nextQuestId, event);
                }
            }
        });
        if (def.onComplete?.setFlags) {
            Object.entries(def.onComplete.setFlags).forEach(([key, value]) => {
                this.state.flags[key] = value;
            });
        }
        const recommendedZone = def.onComplete?.recommendZone || def.ui?.nextRecommendedZone || null;
        if (recommendedZone) this.state.recommendedZoneId = recommendedZone;

        const message = def.onComplete?.logMessage || def.onComplete?.message;
        if (message) this.game?.ui?.logSystemMessage?.(`📋 ${message}`);
        return true;
    }

    _applyEventToQuest(questId, event = {}) {
        const def = this.definitions.get(questId);
        const active = this.state.active[questId];
        if (!def || !active) return false;
        let changed = false;
        def.objectives.forEach((objective) => {
            if (!this._objectiveMatchesEvent(objective, event)) return;
            const entry = active.objectives[objective.id] || { current: 0, complete: false };
            if (entry.complete) return;
            const next = Math.min(objective.count, entry.current + Math.max(1, Number(event.count || 1)));
            if (next !== entry.current) {
                entry.current = next;
                entry.complete = entry.current >= objective.count;
                active.objectives[objective.id] = entry;
                changed = true;
            }
        });
        return changed;
    }

    _grantJsonRewards(def) {
        const rewards = def.rewards?.grant || def.rewards || {};
        const player = this.game?.localPlayer;
        if (!player || def.ui?.guideOnly === true) return;

        const exp = Math.max(0, Number(rewards.exp || 0));
        const manastone = Math.max(0, Number(rewards.manastone ?? rewards.gold ?? 0));
        const stat = rewards.stat || rewards.stats || null;
        const items = Array.isArray(rewards.items) ? rewards.items : [];

        if (exp > 0) player.gainExp?.(exp, { save: false });
        if (manastone > 0) {
            player.manastone = Number(player.manastone || 0) + manastone;
            player.updateManastoneInventory?.();
        }
        if (stat && typeof stat === 'object') {
            Object.entries(stat).forEach(([key, rawAmount]) => {
                if (typeof player[key] !== 'number') return;
                player[key] += Number(rawAmount || 0);
            });
            player.updateDerivedStats?.();
        }
        items.forEach((item) => {
            const itemId = item.id || item.type || item.itemId;
            if (!itemId) return;
            player.addInventoryItem?.(itemId, Math.max(1, Number(item.amount || 1)), item);
        });
        if (exp > 0 || manastone > 0 || items.length > 0 || stat) {
            this.game?.ui?.logSystemMessage?.(`🎉 ${def.title} 완료!${this._formatRewardSummary(rewards)}`);
        }
    }

    _formatRewardSummary(rewards = {}) {
        const parts = [];
        if (rewards.exp) parts.push(`EXP +${rewards.exp}`);
        if (rewards.manastone || rewards.gold) parts.push(`마석 +${rewards.manastone ?? rewards.gold}`);
        if (rewards.stat || rewards.stats) {
            Object.entries(rewards.stat || rewards.stats).forEach(([key, value]) => parts.push(`${key} +${value}`));
        }
        if (Array.isArray(rewards.items)) {
            rewards.items.forEach((item) => parts.push(`${item.name || item.id || item.itemId} x${item.amount || 1}`));
        }
        return parts.length ? ` (${parts.join(', ')})` : '';
    }

    _markCompleted(questId, options = {}) {
        const id = normalizeQuestId(questId, this.aliases);
        if (!id) return false;
        const previous = this.state.completed[id] || { count: 0, completedAt: 0 };
        this.state.completed[id] = {
            completedAt: Math.max(0, Number(options.completedAt || previous.completedAt || nowMs())),
            count: Math.max(1, Number(previous.count || 0) + (options.increment === false ? 0 : 1))
        };
        delete this.state.active[id];
        this.completedQuests.add(id);
        return true;
    }

    completeQuest(questId) {
        const id = normalizeQuestId(questId, this.aliases);
        if (!this._isQuestComplete(id)) return false;
        const completed = this._autoCompleteQuest(id, { type: 'manualComplete', ts: nowMs() });
        if (completed) {
            this._rebuildRuntimeMaps();
            this._writePlayerQuestState({ save: true, reason: 'quest_complete' });
            this.game?.ui?.updateQuestUI?.();
        }
        return completed;
    }

    onMonsterKill(monsterType, count = 1, options = {}) {
        const isBoss = options.isBoss === true || monsterType === 'king_slime';
        return this.handleEvent({
            type: isBoss ? 'bossKilled' : 'monsterKilled',
            target: monsterType,
            zoneId: options.zoneId || this.game?.zone?.currentZone?.id || this.game?.localPlayer?.currentZoneId || 'zone_1',
            count
        }).changed;
    }

    notifyLevelChanged(level) {
        return this.handleEvent({ type: 'levelChanged', level }).changed;
    }

    notifyZoneEntered(zoneId) {
        return this.handleEvent({ type: 'zoneEntered', targetZone: zoneId, zoneId }).changed;
    }

    _writePlayerQuestState(options = {}) {
        const player = this.game?.localPlayer;
        if (!player) return;
        player.questState = this.serialize();
        if (options.save) {
            player.saveProfilePatch?.(['questState'], {
                debounceMs: options.debounceMs ?? 3000,
                reason: options.reason || 'quest_state_patch'
            });
        }
    }

    getActiveQuests() {
        return this._orderedActiveEntries().map(([id, active]) => this._buildQuestView(id, active)).filter(Boolean);
    }

    getHudQuestView() {
        const activeViews = this.getActiveQuests()
            .filter((view) => view.type !== 'hidden')
            .sort((a, b) => {
                const mainWeight = (quest) => quest.type === 'main' || quest.type === 'travel' ? 0 : 1;
                return mainWeight(a) - mainWeight(b) || a.priority - b.priority;
            });
        return activeViews[0] || null;
    }

    _buildQuestView(questId, active) {
        const def = this.definitions.get(questId);
        if (!def) return null;
        const objectives = def.objectives.map((objective) => {
            const progress = active.objectives?.[objective.id] || { current: 0, complete: false };
            const current = Math.min(objective.count, Math.max(0, Number(progress.current || 0)));
            const text = (objective.uiText || objective.description || '진행도: {current}/{count}')
                .replaceAll('{current}', String(current))
                .replaceAll('{count}', String(objective.count))
                .replaceAll('{target}', objective.target || objective.targetZone || objective.itemId || '');
            return {
                id: objective.id,
                text,
                description: text,
                current,
                target: objective.count,
                count: objective.count,
                complete: progress.complete === true
            };
        });
        const canComplete = objectives.every((objective) => objective.complete);
        return {
            questId,
            id: questId,
            type: def.type,
            chapter: def.chapter,
            chapterLabel: def.ui?.chapterLabel || this._getChapterLabel(def.chapter),
            title: def.title,
            description: def.description,
            objectiveText: objectives.map((objective) => objective.text).join(' · '),
            objectives,
            rewardText: this._buildRewardText(def),
            nextHint: def.ui?.nextHint || '',
            canComplete,
            canClaim: canComplete && def.ui?.manualClaim === true,
            cta: def.ui?.cta || null,
            recommendedZone: def.ui?.recommendedZone || def.onComplete?.recommendZone || null,
            priority: Number(def.ui?.hudPriority ?? def.order ?? 9999),
            bossRewardGuide: def.bossRewardGuide || null
        };
    }

    _buildRewardText(def) {
        if (def.bossRewardGuide?.title) return def.bossRewardGuide.title;
        const rewards = def.rewards?.display || def.rewards?.grant || def.rewards || {};
        if (Array.isArray(rewards)) {
            return rewards.map((entry) => `${entry.type || entry.id} ${entry.amount || ''}`.trim()).join(' · ');
        }
        const parts = [];
        if (rewards.exp) parts.push(`EXP ${rewards.exp}`);
        if (rewards.manastone || rewards.gold) parts.push(`마석 ${rewards.manastone ?? rewards.gold}`);
        if (rewards.stat || rewards.stats) {
            Object.entries(rewards.stat || rewards.stats).forEach(([key, value]) => parts.push(`${this._statLabel(key)} +${value}`));
        }
        if (Array.isArray(rewards.items)) {
            rewards.items.forEach((item) => parts.push(`${item.name || item.id || item.itemId} x${item.amount || 1}`));
        }
        return parts.join(' · ') || def.ui?.rewardText || '진행 보상';
    }

    _statLabel(key) {
        return {
            vitality: '체력',
            intelligence: '지능',
            wisdom: '지혜',
            agility: '순발력'
        }[key] || key;
    }

    _getChapterLabel(chapter) {
        const zone = this.game?.zone?.getZoneMeta?.(chapter);
        return zone ? `${chapter.replace('zone_', 'Chapter ')} · ${zone.name}` : chapter;
    }

    getMapTravelQuestView(zoneId) {
        const hud = this.getHudQuestView();
        const activeViews = this.getActiveQuests();
        const recommended = activeViews.find((view) => view.recommendedZone === zoneId)
            || (this.state.recommendedZoneId === zoneId ? hud : null);
        const player = this.game?.localPlayer;
        const zone = this.game?.zone?.getZoneMeta?.(zoneId);
        const levelLocked = !!zone && Number(player?.level || 1) < Number(zone.requiredLevel || 1);
        if (recommended) {
            return {
                recommended: true,
                badge: levelLocked ? `추천 · Lv.${zone.requiredLevel} 필요` : '메인 퀘스트 추천',
                buttonText: levelLocked ? `레벨 ${zone.requiredLevel} 필요` : (recommended.cta || '퀘스트 진행하러 이동'),
                hint: recommended.nextHint || recommended.title,
                questId: recommended.questId
            };
        }
        return {
            recommended: false,
            badge: null,
            buttonText: null,
            hint: null,
            questId: null
        };
    }
}
