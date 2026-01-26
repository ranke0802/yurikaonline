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
        if (this.definitions.has(id)) return this.definitions.get(id);

        try {
            const data = await this.resourceManager.loadJSON(`/src/data/monsters/${id}.json`);
            this.definitions.set(id, data);
            return data;
        } catch (e) {
            Logger.error(`Failed to load monster definition: ${id}`, e);
            throw e;
        }
    }

    getDefinition(id) {
        return this.definitions.get(id);
    }
}
