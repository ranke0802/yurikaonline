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
            backgroundSrc: 'src/assets/map_bg.png' // This should be a tilemap really
        };

        // In a real implementation, we would fetch map.json here
        this.width = this.currentZone.width * this.tileSize;
        this.height = this.currentZone.height * this.tileSize;

        Logger.log(`Zone loaded: ${this.currentZone.name} (${this.width}x${this.height})`);
        return this.currentZone;
    }

    render(ctx, camera) {
        if (!this.currentZone) return;

        // Simple Tiled Background (Optimization: Only draw visible tiles)
        // For MVP, just filling with grass color if no image
        ctx.fillStyle = '#4caf50'; // Grass green

        // Calculate visible range
        const startCol = Math.floor(camera.x / this.tileSize);
        const endCol = startCol + (camera.width / this.tileSize) + 1;
        const startRow = Math.floor(camera.y / this.tileSize);
        const endRow = startRow + (camera.height / this.tileSize) + 1;

        // Draw efficient background
        ctx.fillRect(0, 0, this.width, this.height);

        // Grid lines debug
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        for (let x = 0; x <= this.width; x += this.tileSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
        }
        for (let y = 0; y <= this.height; y += this.tileSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
        }
        ctx.stroke();
    }
}
