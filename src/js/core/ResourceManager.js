import Logger from '../utils/Logger.js';

export default class ResourceManager {
    constructor() {
        this.cache = new Map();
        this.loading = new Map(); // Promises for in-flight requests
    }

    getImage(url) {
        return this.cache.get(url);
    }

    // Helper: Apply Chroma Key (Green Screen Removal)
    _applyChromaKey(image) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        // Target Green: (0, 255, 0) approx
        // Let's be generous with the threshold
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // If it's very green and not much else
            if (g > 150 && r < 100 && b < 100) {
                data[i + 3] = 0; // Alpha 0
            }
        }

        ctx.putImageData(imgData, 0, 0);

        // Return the canvas (it can be drawn like an image)
        const newImg = new Image();
        newImg.src = canvas.toDataURL();
        return newImg;
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
            img.crossOrigin = "Anonymous"; // Important for canvas manipulation
            img.src = url;
            img.onload = () => {
                // Check if it needs chroma key (magician assets)
                let finalAsset = img;
                if (url.includes('magician') || url.includes('magicion')) {
                    finalAsset = this._applyChromaKey(img);
                }

                this.cache.set(url, finalAsset);
                this.loading.delete(url);
                // Logger.info(`Loaded image: ${url}`);
                resolve(finalAsset);
            };
            img.onerror = (err) => {
                this.loading.delete(url);
                // Logger.error(`Failed to load image: ${url}`, err);
                reject(err);
            };
        });

        this.loading.set(url, promise);
        return promise;
    }

    // Simple Audio loading could be added here similar to images
}
