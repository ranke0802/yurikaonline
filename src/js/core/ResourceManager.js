import Logger from '../utils/Logger.js';

export default class ResourceManager {
    constructor() {
        this.cache = new Map();
        this.loading = new Map(); // Promises for in-flight requests
    }

    async loadImage(url) {
        // 1. Check Cache
        if (this.cache.has(url)) {
            return this.cache.get(url);
        }

        // 2. Check In-flight (deduplication)
        if (this.loading.has(url)) {
            return this.loading.get(url);
        }

        // 3. Load from Network (or SW Cache)
        const promise = new Promise((resolve, reject) => {
            const img = new Image();
            img.src = url;
            img.onload = () => {
                this.cache.set(url, img);
                this.loading.delete(url);
                Logger.info(`Loaded image: ${url}`);
                resolve(img);
            };
            img.onerror = (err) => {
                this.loading.delete(url);
                Logger.error(`Failed to load image: ${url}`, err);
                reject(err);
            };
        });

        this.loading.set(url, promise);
        return promise;
    }

    getImage(url) {
        return this.cache.get(url);
    }

    // Simple Audio loading could be added here similar to images
}
