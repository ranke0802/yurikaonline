import Logger from '../utils/Logger.js';

export default class ZoneManager {
    constructor(resourceManager) {
        this.res = resourceManager;
        this.currentZone = null;
        this.tiles = null;
        this.width = 6400; // v0.00.03: Set default 200*32 to allow center calculation before load
        this.height = 6400;
        this.tileSize = 32;
        this.chunkSize = 512; // 16x16 tiles per chunk
        this.chunks = new Map(); // Chunk caching
    }


    async loadZone(zoneId) {
        Logger.log(`Loading Zone: ${zoneId}`);

        try {
            // 1. Load Zone JSON
            const zoneData = await this.res.loadJSON(`assets/data/zones/${zoneId}.json`);
            if (!zoneData) {
                throw new Error(`Zone data not found: ${zoneId}`);
            }

            this.currentZone = zoneData;

            // 2. Setup Dimensions
            this.tileSize = zoneData.tileSize || 32;
            this.width = zoneData.width; // Width in pixels
            this.height = zoneData.height; // Height in pixels

            // Validate logic: If width represents tiles (e.g. < 500), treat as tiles? 
            // Better to rely on explicit pixel values from JSON as per zone_1.json (3200)
            if (this.width < 1000) this.width *= this.tileSize; // Backward compat for Tile-based defs
            if (this.height < 1000) this.height *= this.tileSize;

            // 3. Load Background
            // Support different background types (image, tilemap, etc.)
            if (zoneData.background) {
                if (zoneData.background.image) {
                    this.bgImage = await this.res.loadImage(zoneData.background.image);
                    this.bgPattern = null;
                } else if (zoneData.background.src) {
                    // Legacy support
                    this.bgImage = await this.res.loadImage(zoneData.background.src);
                    this.bgPattern = null;
                }
            } else {
                Logger.warn(`No background defined for zone: ${zoneId}`);
            }

            // 4. Setup Boundaries & Spawns & Objects
            this.boundaries = zoneData.boundaries || { minX: 0, maxX: this.width, minY: 0, maxY: this.height };
            this.spawns = zoneData.spawnPoints || [];
            this.objects = zoneData.objects || [];

            // 4.1 Preload Object Assets
            const assetPromises = this.objects.map(obj => {
                if (obj.visual && obj.visual.image) {
                    return this.res.loadImage(obj.visual.image).catch(e => {
                        Logger.warn(`Failed to preload asset for object ${obj.id}: ${obj.visual.image}`);
                    });
                }
                return Promise.resolve();
            });
            await Promise.all(assetPromises);

            // 5. Clear & Reset Chunks
            this.chunks.clear();

            Logger.log(`Zone loaded: ${this.currentZone.name} (${this.width}x${this.height})`);
            return this.currentZone;

        } catch (e) {
            Logger.error(`Failed to load zone: ${zoneId}`, e);
            // Fallback to avoid crash
            this.currentZone = {
                id: 'fallback',
                name: 'Fallback Field',
                width: 100,
                height: 100,
                objects: [],
                spawns: [],
                background: { type: 'solid', color: '#76b041' }
            };
            this.width = 3200;
            this.height = 3200;
            return this.currentZone;
        }
    }

    getSpawnPoint(id) {
        if (!this.spawns) return null;
        return this.spawns.find(s => s.id === id) || this.spawns[0];
    }

    getBoundaries() {
        return this.boundaries;
    }


    render(ctx, camera) {
        if (!this.currentZone) return;

        // Determine visible chunks
        const startChunkX = Math.floor(camera.x / this.chunkSize);
        const endChunkX = Math.floor((camera.x + camera.width) / this.chunkSize);
        const startChunkY = Math.floor(camera.y / this.chunkSize);
        const endChunkY = Math.floor((camera.y + camera.height) / this.chunkSize);

        for (let cx = startChunkX; cx <= endChunkX; cx++) {
            for (let cy = startChunkY; cy <= endChunkY; cy++) {
                if (cx < 0 || cy < 0 || cx * this.chunkSize >= this.width || cy * this.chunkSize >= this.height) continue;

                const chunkKey = `${cx},${cy}`;
                let chunkCanvas = this.chunks.get(chunkKey);

                if (!chunkCanvas) {
                    chunkCanvas = this.getChunkCanvas(cx, cy);
                    this.chunks.set(chunkKey, chunkCanvas);
                }

                ctx.drawImage(chunkCanvas, cx * this.chunkSize, cy * this.chunkSize);
            }
        }

        // Draw borders
        ctx.strokeStyle = '#2d3436';
        ctx.lineWidth = 5;
        ctx.strokeRect(0, 0, this.width, this.height);
    }

    getChunkCanvas(cx, cy) {
        const canvas = document.createElement('canvas');
        canvas.width = this.chunkSize;
        canvas.height = this.chunkSize;
        const cctx = canvas.getContext('2d');

        if (this.bgImage) {
            // Draw tile pattern to chunk
            if (!this.bgPattern) {
                // Temporary pattern for drawing to offscreen
                this.bgPattern = canvas.getContext('2d').createPattern(this.bgImage, 'repeat');
            }
            cctx.fillStyle = this.bgPattern;

            // To align pattern with world (0,0), we need to set transform or use offset
            // But since chunks are aligned to chunkSize, if chunkSize is a multiple of bgImage size, it's easy.
            // If not, we translate.
            cctx.save();
            cctx.translate(-(cx * this.chunkSize % this.bgImage.width), -(cy * this.chunkSize % this.bgImage.height));
            cctx.fillRect(0, 0, this.chunkSize + this.bgImage.width, this.chunkSize + this.bgImage.height);
            cctx.restore();
        } else {
            cctx.fillStyle = '#76b041';
            cctx.fillRect(0, 0, this.chunkSize, this.chunkSize);
        }

        // Optional: Draw tile grid for debugging or aesthetics
        cctx.strokeStyle = 'rgba(0,0,0,0.05)';
        cctx.lineWidth = 1;
        for (let x = 0; x < this.chunkSize; x += this.tileSize) {
            cctx.beginPath(); cctx.moveTo(x, 0); cctx.lineTo(x, this.chunkSize); cctx.stroke();
        }
        for (let y = 0; y < this.chunkSize; y += this.tileSize) {
            cctx.beginPath(); cctx.moveTo(0, y); cctx.lineTo(this.chunkSize, y); cctx.stroke();
        }

        return canvas;
    }

}
