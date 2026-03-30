import Logger from '../utils/Logger.js';

const BUILTIN_MONSTER_DEFINITIONS = {
    training_dummy: {
        id: 'training_dummy',
        name: '훈련용 허수아비',
        type: 'monster',
        baseStats: {
            hp: 35,
            maxHp: 35,
            atk: 0,
            def: 0,
            speed: 0,
            exp: 0
        },
        behavior: {
            passive: true
        },
        visual: {
            width: 92,
            height: 120,
            frameSpeed: 0.25,
            frameCount: 1,
            fallbackShape: 'training_dummy'
        },
        sounds: {},
        skills: [],
        drops: []
    }
};

/**
 * MonsterDataManager - Handles loading and caching of monster definitions (JSON).
 */
export default class MonsterDataManager {
    constructor(resourceManager) {
        this.resourceManager = resourceManager;
        this.definitions = new Map();
    }

    _cloneDefinition(definition) {
        return definition ? JSON.parse(JSON.stringify(definition)) : null;
    }

    _getBuiltinDefinition(id) {
        return this._cloneDefinition(BUILTIN_MONSTER_DEFINITIONS[id] || null);
    }

    _normalizeDefinition(id, data) {
        if (!data) return this._getBuiltinDefinition(id);

        const builtin = this._getBuiltinDefinition(id);
        if (!builtin) return data;

        return {
            ...builtin,
            ...data,
            baseStats: { ...builtin.baseStats, ...(data.baseStats || {}) },
            behavior: { ...builtin.behavior, ...(data.behavior || {}) },
            visual: { ...builtin.visual, ...(data.visual || {}) },
            sounds: { ...builtin.sounds, ...(data.sounds || {}) },
            skills: Array.isArray(data.skills) ? data.skills : builtin.skills,
            drops: Array.isArray(data.drops) ? data.drops : builtin.drops
        };
    }

    /**
     * Load a monster definition by ID (expects /[id].json)
     */
    async loadDefinition(id) {
        // 1. Memory Cache
        if (this.definitions.has(id)) return this.definitions.get(id);

        // 2. Request Deduplication
        if (this.pendingRequests && this.pendingRequests.has(id)) {
            return this.pendingRequests.get(id);
        }

        const fetchPromise = (async () => {
            try {
                // 3. SessionStorage Cache (Persistent across page reloads in same session)
                const sessionKey = `monster_def_${id}`;
                const cachedSession = sessionStorage.getItem(sessionKey);
                if (cachedSession) {
                    try {
                        const data = this._normalizeDefinition(id, JSON.parse(cachedSession));
                        this.definitions.set(id, data);
                        return data;
                    } catch (parseErr) {
                        Logger.warn(`Invalid session cache for ${id}, reloading.`, parseErr);
                        sessionStorage.removeItem(sessionKey);
                    }
                }

                // 4. Network Request
                const data = this._normalizeDefinition(
                    id,
                    await this.resourceManager.loadJSON(`/assets/data/monsters/${id}.json`)
                );

                // Update Caches
                this.definitions.set(id, data);
                try {
                    sessionStorage.setItem(sessionKey, JSON.stringify(data));
                } catch (storageErr) {
                    // Quota exceeded or private browsing restriction
                    Logger.warn('Failed to save to sessionStorage', storageErr);
                }

                return data;
            } catch (e) {
                Logger.error(`Failed to load monster definition: ${id}`, e);
                const fallback = this._getBuiltinDefinition(id);
                if (fallback) {
                    Logger.warn(`[MonsterData] Falling back to built-in definition for ${id}.`);
                    this.definitions.set(id, fallback);
                    return fallback;
                }
                return null;
            } finally {
                this.pendingRequests.delete(id);
            }
        })();

        if (!this.pendingRequests) this.pendingRequests = new Map();
        this.pendingRequests.set(id, fetchPromise);
        return fetchPromise;
    }

    getDefinition(id) {
        return this.definitions.get(id);
    }
}
