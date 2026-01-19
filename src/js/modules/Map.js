export class Map {
    constructor(ctx, width, height) {
        this.ctx = ctx;
        this.width = width; // 2000
        this.height = height; // 2000
        this.image = new Image();
        this.image.src = 'assets/background.png';
        this.loaded = false;
        this.image.onload = () => {
            this.loaded = true;
        };
    }

    draw(camera) {
        if (!this.loaded) return;

        const tileSize = 512; // Assume generated image is around this size
        const startX = Math.floor(camera.x / tileSize) * tileSize;
        const startY = Math.floor(camera.y / tileSize) * tileSize;
        const endX = camera.x + camera.viewportWidth + tileSize;
        const endY = camera.y + camera.viewportHeight + tileSize;

        for (let x = startX; x < endX; x += tileSize) {
            for (let y = startY; y < endY; y += tileSize) {
                // Ensure we don't draw outside map bounds if needed, 
                // but for seamless texture we can just tile.
                this.ctx.drawImage(this.image, x - camera.x, y - camera.y, tileSize, tileSize);
            }
        }
    }
}
