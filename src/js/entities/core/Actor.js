import Entity from './Entity.js';

export default class Actor extends Entity {
    constructor(x, y, speed = 100) {
        super(x, y);
        this.speed = speed;
        this.vx = 0;
        this.vy = 0;
        this.knockback = { vx: 0, vy: 0 }; // Knockback vector
        this.knockbackFriction = 0.9;      // Friction for knockback
        this.direction = 'down'; // up, down, left, right
        this.state = 'idle';     // idle, move, attack, hit, die
        this.isDead = false;
        this.sprites = {};       // To look up sprites by state
    }


    update(dt) {
        if (this.isDead) return;

        // Apply movement + knockback
        this.x += (this.vx + this.knockback.vx) * dt;
        this.y += (this.vy + this.knockback.vy) * dt;

        // Dissipate knockback
        this.knockback.vx *= this.knockbackFriction;
        this.knockback.vy *= this.knockbackFriction;
        if (Math.abs(this.knockback.vx) < 1) this.knockback.vx = 0;
        if (Math.abs(this.knockback.vy) < 1) this.knockback.vy = 0;

        super.update(dt);
    }

    applyKnockback(vx, vy) {
        this.knockback.vx = vx;
        this.knockback.vy = vy;
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
