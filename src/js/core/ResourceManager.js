import Logger from '../utils/Logger.js';

export default class ResourceManager {
    constructor() {
        this.cache = new Map();
        this.loading = new Map(); // Promises for in-flight requests
    }

    getImage(url) {
        return this.cache.get(url);
    }

    // Specialized loader for the Complex Character Sprite Sheet
    // Integrates Chroma Key, Auto-Crop, and Scaling from legacy code
    async loadCharacterSpriteSheet(previewOnly = false) {
        const cacheKey = previewOnly ? 'character_spritesheet_preview' : 'character_spritesheet';
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
        // If full sheet is already loaded, use it even for preview
        if (this.cache.has('character_spritesheet')) return this.cache.get('character_spritesheet');

        if (this.loading.has(cacheKey)) return this.loading.get(cacheKey);

        const promise = new Promise(async (resolve, reject) => {
            try {
                // v1.99.12: Preview Optimization - Only load 'front' for CharSelect
                const categories = previewOnly ? {
                    'front': { path: '/assets/resource/magicion_front', frames: ['1.webp', '2.webp', '3.webp', '4.webp', '5.webp', '6.webp', '7.webp', '8.webp'] }
                } : {
                    'back': { path: '/assets/resource/magicion_back', frames: ['1.webp', '2.webp', '3.webp', '4.webp', '5.webp'] },
                    'front': { path: '/assets/resource/magicion_front', frames: ['1.webp', '2.webp', '3.webp', '4.webp', '5.webp', '6.webp', '7.webp', '8.webp'] },
                    'left': { path: '/assets/resource/magicion_left', frames: ['1.webp', '2.webp', '3.webp', '4.webp', '5.webp', '6.webp', '7.webp'] },
                    'right': { path: '/assets/resource/magicion_right', frames: ['4.webp', '5.webp', '6.webp', '7.webp', '8.webp', '9.webp', '05.webp'] },
                    'attack': { path: '/assets/resource/magician_attack', frames: ['1.webp', '2.webp', '3.webp', '4.webp', '5.webp', '6.webp'] }
                };

                const maxFrames = 8;
                const targetW = 256;
                const targetH = 256;

                const finalCanvas = document.createElement('canvas');
                finalCanvas.width = targetW * maxFrames; // 2048
                finalCanvas.height = targetH * 5;        // 1280
                const finalCtx = finalCanvas.getContext('2d');

                const loadPromises = [];

                for (const [key, menu] of Object.entries(categories)) {
                    let rowIndex = 0;
                    switch (key) {
                        case 'back': rowIndex = 0; break;
                        case 'front': rowIndex = 1; break;
                        case 'left': rowIndex = 2; break;
                        case 'right': rowIndex = 3; break;
                        case 'attack': rowIndex = 4; break;
                    }

                    menu.frames.forEach((frameFile, i) => {
                        const path = `${menu.path}/${frameFile}`;
                        // Add version/cache-busting
                        let v = window.GAME_VERSION;
                        if (!v || v === 'error' || v === 'unknown') v = Date.now();
                        const url = `${path}?v=${v}`;

                        const p = this.loadImage(url).then(img => {
                            this._processAndDrawFrame(img, finalCtx, i * targetW, rowIndex * targetH, targetW, targetH);
                        }).catch(err => {
                            Logger.warn(`Failed to load frame: ${path}`, err);
                        });
                        loadPromises.push(p);
                    });
                }

                await Promise.all(loadPromises);

                this.cache.set(cacheKey, finalCanvas);
                this.loading.delete(cacheKey);
                Logger.info('Character SpriteSheet generated successfully.');
                resolve(finalCanvas);
            } catch (e) {
                Logger.error('Failed to generate sprite sheet', e);
                this.loading.delete(cacheKey);
                reject(e);
            }
        });

        this.loading.set(cacheKey, promise);
        return promise;
    }

    async loadJSON(url) {
        if (this.cache.has(url)) return this.cache.get(url);
        if (this.loading.has(url)) return this.loading.get(url);

        const promise = fetch(url).then(res => res.json()).then(data => {
            this.cache.set(url, data);
            this.loading.delete(url);
            return data;
        }).catch(err => {
            this.loading.delete(url);
            Logger.error(`Failed to load JSON: ${url}`, err);
            throw err;
        });

        this.loading.set(url, promise);
        return promise;
    }

    _processAndDrawFrame(img, ctx, destX, destY, destW, destH) {
        if (!img || img.width === 0 || img.height === 0) return;
        // Create temp canvas for processing if not exists (not efficient to recreate every time vs reuse, but ok for init)
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

        tempCtx.drawImage(img, 0, 0);

        const imgData = tempCtx.getImageData(0, 0, img.width, img.height);
        const data = imgData.data;

        let minX = img.width, maxX = 0, minY = img.height, maxY = 0;
        let foundPixels = false;

        // Sample top-left pixel for chroma key if it's green-ish
        const sampleR = data[0], sampleG = data[1], sampleB = data[2];
        const isSampleGreen = (sampleG > 120 && sampleG > sampleR * 1.2 && sampleG > sampleB * 1.2);

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];

            // Primary Chroma Key (Green)
            const isGreen = (g > 140 && g > r * 1.1 && g > b * 1.1);
            // Secondary (Light/White backgrounds)
            const isLightBG = (g > 230 && r > 230 && b > 230);
            // Sample-based (If top-left is green, match it)
            const matchesSample = isSampleGreen &&
                Math.abs(r - sampleR) < 30 &&
                Math.abs(g - sampleG) < 30 &&
                Math.abs(b - sampleB) < 30;

            if (isGreen || isLightBG || matchesSample) {
                data[i + 3] = 0; // Alpha 0
            } else if (data[i + 3] > 20) {
                // Determine bounding box of visible pixels
                const x = (i / 4) % img.width;
                const y = Math.floor((i / 4) / img.width);
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                foundPixels = true;
            }
        }

        if (foundPixels) {
            tempCtx.putImageData(imgData, 0, 0);

            const charW = maxX - minX + 1;
            const charH = maxY - minY + 1;

            // Scale to fit target box (keeping aspect ratio)
            // Use 0.85 to leave more padding for health bars/frames
            const scale = Math.min(destW / charW, destH / charH) * 0.85;

            const drawW = charW * scale;
            const drawH = charH * scale;

            // Center in destination
            const offX = (destW - drawW) / 2;
            const offY = (destH - drawH) / 2;

            ctx.drawImage(tempCanvas, minX, minY, charW, charH, destX + offX, destY + offY, drawW, drawH);
        } else {
            // Fallback: Just draw the raw image scaled to fit
            const scale = Math.min(destW / img.width, destH / img.height);
            const drawW = img.width * scale;
            const drawH = img.height * scale;
            const offX = (destW - drawW) / 2;
            const offY = (destH - drawH) / 2;
            ctx.drawImage(img, 0, 0, img.width, img.height, destX + offX, destY + offY, drawW, drawH);
        }
    }


    async loadImage(url) {
        // 1. Check Cache
        if (this.cache.has(url)) {
            return this.cache.get(url);
        }

        // 2. Backward compatibility: If we still need to handle legacy paths, we could do it here
        // But for now, we assume all paths are updated to .webp

        // 3. Check In-flight (deduplication)
        if (this.loading.has(url)) {
            return this.loading.get(url);
        }

        return this._doLoad(url);
    }

    _doLoad(url) {
        if (this.loading.has(url)) return this.loading.get(url);

        const promise = new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = url;
            img.onload = () => {
                this.cache.set(url, img);
                this.loading.delete(url);
                resolve(img);
            };
            img.onerror = (err) => {
                this.loading.delete(url);
                reject(err);
            };
        });

        this.loading.set(url, promise);
        return promise;
    }

    // Simple Audio loading could be added here similar to images

    async preloadCriticalAssets(onProgress) {
        const criticalImages = [
            // Monster: Slime (1-5)
            '/assets/resource/monster_slim/1.webp',
            '/assets/resource/monster_slim/2.webp',
            '/assets/resource/monster_slim/3.webp',
            '/assets/resource/monster_slim/4.webp',
            '/assets/resource/monster_slim/5.webp',
            // Player: Front (1-8) for Character Selection
            '/assets/resource/magicion_front/1.webp',
            '/assets/resource/magicion_front/2.webp',
            '/assets/resource/magicion_front/3.webp',
            '/assets/resource/magicion_front/4.webp',
            '/assets/resource/magicion_front/5.webp',
            '/assets/resource/magicion_front/6.webp',
            '/assets/resource/magicion_front/7.webp',
            '/assets/resource/magicion_front/8.webp',
        ];

        let loaded = 0;
        const total = criticalImages.length;

        // Force browser to cache these files
        const promises = criticalImages.map(async (url) => {
            try {
                // Use current version to ensure fresh cache
                let v = window.GAME_VERSION;
                if (!v || v === 'error' || v === 'unknown') v = Date.now();

                const fullUrl = `${url}?v=${v}`;
                await this.loadImage(fullUrl);
            } catch (e) {
                console.warn(`[Preload] Failed: ${url}`, e);
            } finally {
                loaded++;
                // Progress from 0% to 100% (mapped to overall loading 40% -> 90%)
                if (onProgress) onProgress(loaded, total);
            }
        });

        await Promise.all(promises);
    }
}
