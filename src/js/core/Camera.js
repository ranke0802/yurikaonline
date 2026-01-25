import Logger from '../utils/Logger.js';

export default class Camera {
    constructor(width, height, worldWidth = 6400, worldHeight = 6400) {
        this.x = 0;
        this.y = 0;
        this.width = width;
        this.height = height;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.deadZoneX = 0;
        this.deadZoneY = 0;
    }

    follow(target, mapWidth, mapHeight) {
        if (!target) return;

        // Center on target
        this.x = target.x - this.width / 2;
        this.y = target.y - this.height / 2;

        // Clamp to map bounds
        this.x = Math.max(0, Math.min(this.x, mapWidth - this.width));
        this.y = Math.max(0, Math.min(this.y, mapHeight - this.height));
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
    }
}
