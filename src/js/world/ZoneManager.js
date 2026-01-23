import Logger from '../utils/Logger.js';

export default class ZoneManager {
    constructor(resourceManager) {
        this.res = resourceManager;
        this.currentZone = null;
        this.tiles = null;
        this.width = 0;
        this.height = 0;
        this.tileSize = 32;
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
            backgroundSrc: 'src/assets/grass_tile.png'
        };

        // Load background tile
        try {
            this.bgImage = await this.res.loadImage(this.currentZone.backgroundSrc);
            this.bgPattern = null; // Will be created in render or here (context needed)
        } catch (e) {
            Logger.warn('Failed to load map tile', e);
        }

        // In a real implementation, we would fetch map.json here
        this.width = this.currentZone.width * this.tileSize;
        this.height = this.currentZone.height * this.tileSize;

        Logger.log(`Zone loaded: ${this.currentZone.name} (${this.width}x${this.height})`);
        return this.currentZone;
    }

    render(ctx, camera) {
        if (!this.currentZone) return;

        // Draw Background
        if (this.bgImage) {
            if (!this.bgPattern) {
                this.bgPattern = ctx.createPattern(this.bgImage, 'repeat');
            }
            ctx.fillStyle = this.bgPattern;

            // Optimization: Draw slightly more than the camera view to avoid flickering
            // But pattern fillRect is fast. Let's start with filling visible area.
            ctx.save();
            ctx.translate(0, 0); // Pattern is world-aligned by default if we draw from 0,0?
            // Actually createPattern aligns to the origin of the canvas (screen), 
            // but we are already translated by camera in Main.js (-camera.x, -camera.y).
            // So filling rect at (0,0, worldW, worldH) works and aligns to world.

            // However, filling a huge 6400x6400 rect might be slow on some devices?
            // Let's cull.
            const startX = Math.floor(camera.x / this.tileSize) * this.tileSize;
            const startY = Math.floor(camera.y / this.tileSize) * this.tileSize;
            const endX = startX + camera.width + this.tileSize * 2;
            const endY = startY + camera.height + this.tileSize * 2;

            ctx.fillRect(startX, startY, endX - startX, endY - startY);
            ctx.restore();
        } else {
            // Fallback Color
            ctx.fillStyle = '#76b041';
            ctx.fillRect(0, 0, this.width, this.height);
        }

        // Draw borders
        ctx.strokeStyle = '#2d3436';
        ctx.lineWidth = 5;
        ctx.strokeRect(0, 0, this.width, this.height);
    }
}
