export class Map {
    constructor(ctx, width, height) {
        this.ctx = ctx;
        this.width = width;
        this.height = height;
        this.image = new Image();
        this.image.src = 'assets/resource/background.webp';
        this.loaded = false;
        this.image.onload = () => {
            this.loaded = true;
        };
    }

    draw(camera) {
        if (!this.loaded) {
            // Fallback while loading
            this.ctx.fillStyle = '#e5d5b7';
            this.ctx.fillRect(0, 0, camera.viewportWidth, camera.viewportHeight);
            return;
        }

        // Texture tiling for infinite-like feel or large map
        const tw = this.image.width;
        const th = this.image.height;

        const startX = Math.floor(camera.x / tw) * tw;
        const startY = Math.floor(camera.y / th) * th;

        for (let x = startX; x < camera.x + camera.viewportWidth + tw; x += tw) {
            for (let y = startY; y < camera.y + camera.viewportHeight + th; y += th) {
                this.ctx.drawImage(this.image, x - camera.x, y - camera.y, tw, th);
            }
        }
    }
}
