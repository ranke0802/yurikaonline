import { Sprite } from '../core/Sprite.js';

export default class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 120;
        this.height = 120;
        this.speed = 250;
        this.direction = 0;
        this.frame = 0;
        this.isMoving = false;
        this.timer = 0;
        this.frameSpeed = 0.12;
        this.sprite = null;
        this.ready = false;

        this.init();
    }

    async init() {
        const image = new Image();
        image.src = 'assets/character.png';
        await new Promise(resolve => image.onload = resolve);

        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Exact Green from asset: rgba(5, 254, 2)
        // We'll use a slightly wider tolerance just in case of compression artifacts
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Detect green background
            // If G is much higher than R and B, it's likely the green screen
            if (g > 200 && r < 100 && b < 100) {
                data[i + 3] = 0;
            }
        }
        ctx.putImageData(imageData, 0, 0);

        // The asset is 6x5.
        this.sprite = new Sprite(canvas, 6, 5);
        this.ready = true;
    }

    update(dt, input) {
        if (!this.sprite) return;

        const move = input.getMovement();
        const vx = move.x;
        const vy = move.y;

        if (vx !== 0 || vy !== 0) {
            this.x += vx * this.speed * dt;
            this.y += vy * this.speed * dt;
            this.isMoving = true;

            // Mapping: 0:Down, 1:Up, 2:Right, 3:Left
            if (Math.abs(vx) > Math.abs(vy)) {
                this.direction = vx > 0 ? 2 : 3;
            } else {
                this.direction = vy > 0 ? 0 : 1;
            }
        } else {
            this.isMoving = false;
        }

        if (this.isMoving) {
            this.timer += dt;
            if (this.timer >= this.frameSpeed) {
                this.timer = 0;
                this.frame = (this.frame + 1) % 4; // Use first 4 frames for walking loop
            }
        } else {
            this.frame = 0;
        }
    }

    draw(ctx, camera) {
        if (!this.sprite) return;

        const screenX = this.x - camera.x - this.width / 2;
        const screenY = this.y - camera.y - this.height / 2;

        this.sprite.draw(ctx, this.direction, this.frame, screenX, screenY, this.width, this.height, true);
    }
}
