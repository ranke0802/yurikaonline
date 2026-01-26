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
        // TODO: Load from JSON data later. For now, hardcode the basic grass field.

        // Mock zone data
        this.currentZone = {
            id: zoneId,
            name: "Starting Fields",
            // 200x200 tiles (Large Map)
            width: 200,
            height: 200,
            backgroundSrc: 'assets/resource/background.webp'
        };

        // Load background tile
        try {
            this.bgImage = await this.res.loadImage(this.currentZone.backgroundSrc);
            this.bgPattern = null;
        } catch (e) {
            Logger.warn('Failed to load map tile', e);
        }

        // In a real implementation, we would fetch map.json here
        this.width = this.currentZone.width * this.tileSize;
        this.height = this.currentZone.height * this.tileSize;

        // Clear chunks on zone load
        this.chunks.forEach(canvas => canvas.width = 0);
        this.chunks.clear();

        Logger.log(`Zone loaded: ${this.currentZone.name} (${this.width}x${this.height})`);
        return this.currentZone;
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
