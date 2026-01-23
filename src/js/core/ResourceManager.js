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
    async loadCharacterSpriteSheet() {
        const cacheKey = 'character_spritesheet';
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
        if (this.loading.has(cacheKey)) return this.loading.get(cacheKey);

        const promise = new Promise(async (resolve, reject) => {
            try {
                const categories = {
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
                        // Use the generic loadImage to fetch raw image, then process
                        // Enhanced: Frame files might be .webp now, try both
                        const url = `${menu.path}/${frameFile}`;
                        const p = this.loadImage(url).then(img => {
                            this._processAndDrawFrame(img, finalCtx, i * targetW, rowIndex * targetH, targetW, targetH);
                        }).catch(err => {
                            // If .webp failed, maybe it exists as a legacy format? (Backward compatibility)
                            if (frameFile.endsWith('.webp')) {
                                const legacyUrl = url.replace('.webp', '.p' + 'ng');
                                return this.loadImage(legacyUrl).then(img => {
                                    this._processAndDrawFrame(img, finalCtx, i * targetW, rowIndex * targetH, targetW, targetH);
                                }).catch(e => {
                                    Logger.warn(`Failed to load frame: ${url} (and legacy fallback)`);
                                });
                            }
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

    _processAndDrawFrame(img, ctx, destX, destY, destW, destH) {
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

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];

            // Chroma Key Logic from Legacy Code
            const isGreen = (g > 140 && g > r * 1.1 && g > b * 1.1);
            const isLightBG = (g > 200 && r > 200 && b > 200);

            if (isGreen || isLightBG) {
                data[i + 3] = 0; // Alpha 0
            } else if (data[i + 3] > 50) {
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

            // Crop and Scale Logic
            const charW = maxX - minX + 1;
            const charH = maxY - minY + 1;

            // Logger.info(`Frame Processed: W=${charW} H=${charH} (Raw: ${img.width}x${img.height})`);

            // Scale to fit target box (keeping aspect ratio) with 95% max size
            const scale = Math.min(destW / charW, destH / charH) * 0.95;

            const drawW = charW * scale;
            const drawH = charH * scale;

            // Center in destination
            const offX = (destW - drawW) / 2;
            const offY = (destH - drawH) / 2;

            ctx.drawImage(tempCanvas, minX, minY, charW, charH, destX + offX, destY + offY, drawW, drawH);
        } else {
            Logger.warn(`_processAndDrawFrame for ${imageUrl}: No pixels found after filter! Drawing raw fallback.`);
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
}
