import Entity from './Entity.js';

export default class Actor extends Entity {
    constructor(x, y, speed = 100) {
        super(x, y);
        this.speed = speed;
        this.vx = 0;
        this.vy = 0;
        this.direction = 'down'; // up, down, left, right
        this.state = 'idle';     // idle, move, attack, hit, die
        this.sprites = {};       // To look up sprites by state
    }

    update(dt) {
        if (this.isDead) return;

        // movement logic
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        super.update(dt);
    }

    // AABB Collision check
    checkCollision(rect) {
        return (
            this.x < rect.x + rect.width &&
            this.x + this.width > rect.x &&
            this.y < rect.y + rect.height &&
            this.y + this.height > rect.y
        );
    }

    stop() {
        this.vx = 0;
        this.vy = 0;
        this.state = 'idle';
    }
}
