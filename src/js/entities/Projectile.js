export class Projectile {
    constructor(x, y, target, type = 'missile', options = {}) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.type = type;
        this.speed = options.speed || 400;
        this.damage = options.damage || 15;
        this.radius = options.radius || 10;
        this.vx = options.vx || 0;
        this.vy = options.vy || 0;
        this.isDead = false;
        this.lifeTime = options.lifeTime || 3.0;
        this.burnDuration = options.burnDuration || 5.0;
        this.targetX = options.targetX || null;
        this.targetY = options.targetY || null;
        this.isCrit = options.isCrit || false;

        // Visuals
        this.color = type === 'missile' ? '#00d2ff' : '#f97316'; // Cyan for laser
        this.trail = [];
        this.trailLength = type === 'missile' ? 20 : 10;
        this.particles = []; // Particles for high-energy look

        // Missile-specific: Steering & Spread
        if (type === 'missile') {
            this.homingDelay = 0.1 + Math.random() * 0.2; // Randomized 0.1s~0.3s
            this.maxForce = 800;
            this.turnEase = 0;
            this.wobblePhase = Math.random() * Math.PI * 2;
            this.wobbleSpeed = 5 + Math.random() * 5;
        }
    }

    update(dt, monsters) {
        this.lifeTime -= dt;
        if (this.lifeTime <= 0) this.isDead = true;
        if (this.isDead) return;

        // Update Particles
        this.particles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
        });
        this.particles = this.particles.filter(p => p.life > 0);

        // Trail for effect
        this.trail.unshift({ x: this.x, y: this.y });
        if (this.trail.length > this.trailLength) this.trail.pop();

        if (this.type === 'missile') {
            // Spawn Exhaust Particles
            if (Math.random() < 0.3) {
                const angle = Math.atan2(this.vy, this.vx) + Math.PI + (Math.random() - 0.5);
                const pSpeed = Math.random() * 150;
                this.particles.push({
                    x: this.x, y: this.y,
                    vx: Math.cos(angle) * pSpeed,
                    vy: Math.sin(angle) * pSpeed,
                    life: 0.2 + Math.random() * 0.3,
                    size: 1 + Math.random() * 3
                });
            }

            if (this.homingDelay > 0) {
                this.homingDelay -= dt;
                this.vx *= 0.98;
                this.vy *= 0.98;
            } else {
                if (this.target && this.target.isDead) {
                    this.target = this.findNearestTarget(monsters);
                }

                if (this.target) {
                    const dx = this.target.x - this.x;
                    const dy = this.target.y - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist > 5) {
                        this.turnEase = Math.min(1.0, this.turnEase + dt * 2.5);
                        const tx = (dx / dist) * this.speed;
                        const ty = (dy / dist) * this.speed;
                        const steerX = (tx - this.vx) * 25 * this.turnEase;
                        const steerY = (ty - this.vy) * 25 * this.turnEase;
                        this.vx += steerX * dt;
                        this.vy += steerY * dt;
                        const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                        if (currentSpeed > 0) {
                            this.vx = (this.vx / currentSpeed) * this.speed;
                            this.vy = (this.vy / currentSpeed) * this.speed;
                        }
                        if (dist < 60) this.hit(this.target, monsters); // v0.29.8: Increased hit box (40->60)
                    }
                } else {
                    if (!this.vx && !this.vy) this.isDead = true;
                }
            }
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if (this.type === 'fireball' && monsters) {
            monsters.forEach(m => {
                if (m.isDead) return;
                const dist = Math.sqrt((this.x - m.x) ** 2 + (this.y - m.y) ** 2);
                if (dist < 40) this.hit(m, monsters);
            });
        }
    }

    findNearestTarget(monsters) {
        let nearest = null;
        let minDist = Infinity;
        if (!monsters) return null;
        monsters.forEach(m => {
            if (m.isDead) return;
            const dist = Math.sqrt((this.x - m.x) ** 2 + (this.y - m.y) ** 2);
            if (dist < minDist && dist < 700) {
                minDist = dist;
                nearest = m;
            }
        });
        return nearest;
    }

    hit(monster, monsters) {
        if (window.game && window.game.addSpark) {
            // v0.29.8: More sparks for better impact
            for (let i = 0; i < 8; i++) window.game.addSpark(this.x, this.y);
        }

        const net = window.game?.net;

        if (this.type === 'fireball' && monsters) {
            const aoeRadius = this.radius || 100;
            monsters.forEach(m => {
                if (m.isDead) return;
                const dist = Math.sqrt((this.x - m.x) ** 2 + (this.y - m.y) ** 2);
                if (dist < aoeRadius) {
                    let finalDmg = this.damage;
                    let isCrit = false;
                    if (this.critRate && Math.random() < this.critRate) {
                        finalDmg *= 2;
                        isCrit = true;
                    }
                    // v0.29.12: Send damage to network for sync
                    if (m.isMonster && net) {
                        net.sendMonsterDamage(m.id, Math.ceil(finalDmg));
                        m.lastAttackerId = net.playerId;
                    }
                    // Only host applies actual damage
                    if (net?.isHost || !m.isMonster) {
                        m.takeDamage(Math.ceil(finalDmg), true, isCrit, this.x, this.y);
                        m.applyEffect('burn', this.burnDuration, Math.ceil(finalDmg * 0.15));
                    }
                }
            });
        } else {
            let finalDmg = this.damage;
            let isCrit = this.isCrit || false;
            // v0.29.12: Send damage to network for sync
            if (monster.isMonster && net) {
                net.sendMonsterDamage(monster.id, Math.ceil(finalDmg));
                monster.lastAttackerId = net.playerId;
            }
            // Only host applies actual damage
            if (net?.isHost || !monster.isMonster) {
                monster.takeDamage(Math.ceil(finalDmg), true, isCrit, this.x, this.y);
            }
        }
        this.isDead = true;
    }

    render(ctx, camera) {
        if (this.isDead) return;
        const sx = this.x;
        const sy = this.y;

        // 0. Energy Particles
        this.particles.forEach(p => {
            ctx.fillStyle = this.color;
            ctx.globalAlpha = p.life * 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1.0;

        if (this.type === 'missile') {
            // --- Advanced Beefy Laser Rendering ---
            ctx.save();

            if (this.trail.length > 2) {
                // Layer 1: Outer Wide Glow
                ctx.beginPath();
                ctx.moveTo(this.trail[0].x, this.trail[0].y);
                for (let i = 1; i < this.trail.length; i++) {
                    ctx.lineTo(this.trail[i].x, this.trail[i].y);
                }
                ctx.strokeStyle = this.color;
                ctx.lineWidth = this.radius * 2.5;
                ctx.globalAlpha = 0.2;
                ctx.lineCap = 'round';
                ctx.stroke();

                // Layer 2: Vivid Cyan Beam
                ctx.globalAlpha = 0.6;
                ctx.lineWidth = this.radius * 1.5;
                ctx.stroke();

                // Layer 3: Main Beam Core
                ctx.globalAlpha = 0.9;
                ctx.lineWidth = this.radius;
                ctx.stroke();

                // Layer 4: Bright White Core
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = this.radius * 0.4;
                ctx.globalAlpha = 1.0;
                ctx.stroke();
            }

            // High-Energy Pulsing Tip
            const pulse = (Math.sin(Date.now() * 0.04) + 1) * 0.5;
            ctx.shadowBlur = 15 + pulse * 15;
            ctx.shadowColor = this.color;

            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(sx, sy, this.radius * 1.3, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(sx, sy, this.radius * 0.7, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        } else {
            // --- Fireball Rendering ---
            this.trail.forEach((p, i) => {
                const alpha = 1 - (i / this.trail.length);
                ctx.fillStyle = this.color;
                ctx.globalAlpha = alpha * 0.5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, this.radius * (1 - i / 10), 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.globalAlpha = 1.0;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(sx, sy, this.radius * 0.6, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(sx, sy, this.radius, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Fireball Landing Indicator
        if (this.type === 'fireball' && this.targetX !== null && this.targetY !== null) {
            ctx.save();
            ctx.strokeStyle = 'rgba(249, 115, 22, 0.4)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(this.targetX, this.targetY, this.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(249, 115, 22, 0.1)';
            ctx.fill();
            ctx.restore();
        }
    }
}
