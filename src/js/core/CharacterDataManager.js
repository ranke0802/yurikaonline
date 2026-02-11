import Logger from '../utils/Logger.js';

export default class CharacterDataManager {
    constructor(resourceManager) {
        this.resourceManager = resourceManager;
        this.definitions = new Map();
        this.pendingRequests = new Map();
    }

    async loadDefinition(id) {
        if (this.definitions.has(id)) return this.definitions.get(id);
        if (this.pendingRequests.has(id)) return this.pendingRequests.get(id);

        const fetchPromise = (async () => {
            try {
                const data = await this.resourceManager.loadJSON(`/assets/data/characters/${id}.json`);
                this.definitions.set(id, data);
                return data;
            } catch (e) {
                Logger.error(`Failed to load character definition: ${id}`, e);
                return null;
            } finally {
                this.pendingRequests.delete(id);
            }
        })();

        this.pendingRequests.set(id, fetchPromise);
        return fetchPromise;
    }

    getDefinition(id) {
        return this.definitions.get(id);
    }
}
