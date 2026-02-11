import Logger from '../utils/Logger.js';

/**
 * MonsterDataManager - Handles loading and caching of monster definitions (JSON).
 */
export default class MonsterDataManager {
    constructor(resourceManager) {
        this.resourceManager = resourceManager;
        this.definitions = new Map();
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
                        const data = JSON.parse(cachedSession);
                        this.definitions.set(id, data);
                        return data;
                    } catch (parseErr) {
                        Logger.warn(`Invalid session cache for ${id}, reloading.`, parseErr);
                        sessionStorage.removeItem(sessionKey);
                    }
                }

                // 4. Network Request
                const data = await this.resourceManager.loadJSON(`/assets/data/monsters/${id}.json`);

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
