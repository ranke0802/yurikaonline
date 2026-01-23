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
            backgroundSrc: 'assets/resource/background.png'
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

        Logger.log(`Zone loaded: ${this.currentZone.name} (${this.width}x${this.height})`);
        return this.currentZone;
    }

    render(ctx, camera) {
        if (!this.currentZone) return;

        // Draw Background
        if (this.bgImage) {
            if (!this.bgPattern) {
                this.bgPattern = ctx.createPattern(this.bgImage, 'repeat');
                Logger.info('ZoneManager: Pattern created successfully.');
            }

            if (!this.hasLoggedRender) {
                Logger.info(`ZoneRender: Cam=${camera.x},${camera.y} ${camera.width}x${camera.height} | Image Loaded: ${this.bgImage.complete} ${this.bgImage.naturalWidth}x${this.bgImage.naturalHeight}`);
                this.hasLoggedRender = true;
            }

            ctx.save();
            // Context is already in World Space from Main.js
            // Pattern origin will align with World(0,0) automatically
            ctx.fillStyle = this.bgPattern;

            // Draw only the visible area (Camera Viewport) in World Coordinates
            ctx.fillRect(camera.x, camera.y, camera.width, camera.height);

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
