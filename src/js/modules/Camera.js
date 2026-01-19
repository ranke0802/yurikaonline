export class Camera {
    constructor(width, height, mapWidth, mapHeight) {
        this.x = 0;
        this.y = 0;
        this.viewportWidth = width;
        this.viewportHeight = height;
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
    }

    update(targetX, targetY) {
        // Center the target
        this.x = targetX - this.viewportWidth / 2;
        this.y = targetY - this.viewportHeight / 2;

        // Clamp to map bounds
        if (this.x < 0) this.x = 0;
        if (this.y < 0) this.y = 0;
        if (this.x > this.mapWidth - this.viewportWidth) this.x = this.mapWidth - this.viewportWidth;
        if (this.y > this.mapHeight - this.viewportHeight) this.y = this.mapHeight - this.viewportHeight;
    }

    resize(width, height) {
        this.viewportWidth = width;
        this.viewportHeight = height;
    }
}
