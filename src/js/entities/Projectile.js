export class Projectile {
    constructor(x, y, target, type = 'missile', options = {}) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.type = type; // 'missile' or 'fireball'
        this.speed = options.speed || 400;
        this.damage = options.damage || 15;
        this.radius = options.radius || 10;
        this.angle = options.angle || 0;
        this.vx = options.vx || 0;
        this.vy = options.vy || 0;
        this.isDead = false;
        this.lifeTime = options.lifeTime || 3.0; // Life in seconds

        // Visuals
        this.color = type === 'missile' ? '#4f46e5' : '#f97316';
        this.trail = [];
    }

    update(dt, monsters) {
        this.lifeTime -= dt;
        if (this.lifeTime <= 0) this.isDead = true;
        if (this.isDead) return;

        // Trail for effect
        this.trail.unshift({ x: this.x, y: this.y });
        if (this.trail.length > 10) this.trail.pop();

        if (this.type === 'missile') {
            // Homing logic
            if (this.target && this.target.isDead) {
                this.target = this.findNearestTarget(monsters);
            }

            if (this.target) {
                const dx = this.target.x - this.x;
                const dy = this.target.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > 5) {
                    this.vx = (dx / dist) * this.speed;
                    this.vy = (dy / dist) * this.speed;

                    // Collision check
                    if (dist < 30) {
                        this.hit(this.target, monsters);
                    }
                }
            } else {
                // No target, just fly straight or die
                if (!this.vx && !this.vy) this.isDead = true;
            }
        } else if (this.type === 'fireball') {
            // Straight Aoe logic
            // vx, vy are pre-set
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // General collision check for non-homing or AOE
        if (this.type === 'fireball') {
            monsters.forEach(m => {
                if (m.isDead) return;
                const dist = Math.sqrt((this.x - m.x) ** 2 + (this.y - m.y) ** 2);
                if (dist < 40) {
                    this.hit(m, monsters);
                }
            });
        }
    }

    findNearestTarget(monsters) {
        let nearest = null;
        let minDist = Infinity;
        monsters.forEach(m => {
            if (m.isDead) return;
            const dist = Math.sqrt((this.x - m.x) ** 2 + (this.y - m.y) ** 2);
            if (dist < minDist && dist < 500) {
                minDist = dist;
                nearest = m;
            }
        });
        return nearest;
    }

    hit(monster, monsters) {
        if (this.type === 'fireball' && monsters) {
            const aoeRadius = 160; // Approx 4 slimes wide (80px * 2 radius)
            monsters.forEach(m => {
                if (m.isDead) return;
                const dist = Math.sqrt((this.x - m.x) ** 2 + (this.y - m.y) ** 2);
                if (dist < aoeRadius) {
                    m.takeDamage(this.damage);
                    m.applyEffect('burn', 5.0, Math.floor(this.damage * 0.15)); // 5s burn, 15% dmg per tick
                }
            });
        } else {
            monster.takeDamage(this.damage);

            if (this.type === 'fireball') {
                monster.applyEffect('burn', 5.0, Math.floor(this.damage * 0.15));
            }
        }

        this.isDead = true;
    }

    draw(ctx, camera) {
        const sx = this.x - camera.x;
        const sy = this.y - camera.y;

        // Draw Trail
        this.trail.forEach((p, i) => {
            const alpha = 1 - (i / this.trail.length);
            ctx.fillStyle = this.color;
            ctx.globalAlpha = alpha * 0.5;
            ctx.beginPath();
            ctx.arc(p.x - camera.x, p.y - camera.y, this.radius * (1 - i / 10), 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1.0;

        // Core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, sy, this.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, this.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
}
