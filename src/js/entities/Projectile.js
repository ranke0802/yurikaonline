import SkillRenderer from '../skills/renderers/SkillRenderer.js';

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

        // v1.99.16: Separate hit detection radius from AOE/visual radius
        this.aoeRadius = options.aoeRadius || this.radius * 2; // v1.99.30: Explosion 2x wider than projectile (balanced)
        if (this.type === 'fireball') {
            this.hitRadius = this.radius; // v1.99.20: Sync hitbox with visible radius
        } else {
            this.hitRadius = this.radius;
        }

        // v1.99.18: Origin for safety threshold
        this.spawnX = x;
        this.spawnY = y;

        // v1.99.25: Impact delay state
        this.isExploding = false;
        this.explosionDelay = options.penetrationDelay || 0; // v1.99.33: Scaled by level
        this.explosionContext = null;

        // v0.00.05: Owner ID for PvP safety
        this.ownerId = options.ownerId || null;

        // Visuals
        this.color = type === 'missile' ? '#00d2ff' : '#f97316';
        this.trail = [];
        this.trailLength = type === 'missile' ? 20 : 10;
        this.particles = [];

        // Missile-specific
        if (type === 'missile') {
            this.homingDelay = 0.1 + Math.random() * 0.2;
            this.maxForce = 800;
            this.turnEase = 0;
            this.wobblePhase = Math.random() * Math.PI * 2;
            this.wobbleSpeed = 5 + Math.random() * 5;
        }
    }

    update(dt, monsters) {
        if (this.isDead) return;

        const lp = window.game?.localPlayer;
        const rps = window.game?.remotePlayers;
        const owner = (lp && lp.id === this.ownerId) ? lp : rps?.get(this.ownerId);

        // v1.99.25: Handle impact delay (Penetration feel)
        if (this.isExploding) {
            this.explosionDelay -= dt;
            if (this.explosionDelay <= 0) {
                this._executeActualExplosion();
            }
            // v1.99.26: Removed 'return' to allow depth penetration (keep moving while exploding)
        }

        this.lifeTime -= dt;

        // Particles
        this.particles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
        });
        this.particles = this.particles.filter(p => p.life > 0);

        // Trail
        this.trail.unshift({ x: this.x, y: this.y });
        if (this.trail.length > this.trailLength) this.trail.pop();

        if (this.type === 'missile') {
            // Exhaust Particles
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
                // v0.00.05: Smart Retargeting (Monsters + Players)
                // v1.99.38: Per-frame target validation (Robust player check)
                const isPlayer = this.target && (this.target.type === 'player' || (!this.target.isMonster && this.target.id));
                if (isPlayer && owner && !owner.canAttackTarget(this.target)) {
                    this.target = null;
                }

                if ((this.target && this.target.isDead) || !this.target) {
                    this.target = this.findNearestTarget(monsters);
                }

                if (this.target) {
                    // v1.99.31: Monster x/y are already centers. No offset needed.
                    const tx = this.target.x;
                    const ty = this.target.y;

                    const dx = tx - this.x;
                    const dy = ty - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist > 5) {
                        this.turnEase = Math.min(1.0, this.turnEase + dt * 2.5);
                        const normX = (dx / dist) * this.speed;
                        const normY = (dy / dist) * this.speed;
                        const steerX = (normX - this.vx) * 25 * this.turnEase;
                        const steerY = (normY - this.vy) * 25 * this.turnEase;
                        this.vx += steerX * dt;
                        this.vy += steerY * dt;
                        const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                        if (currentSpeed > 0) {
                            this.vx = (this.vx / currentSpeed) * this.speed;
                            this.vy = (this.vy / currentSpeed) * this.speed;
                        }

                        // v1.99.38: Added final guard before direct hit
                        const targetIsPlayer = this.target.type === 'player' || (!this.target.isMonster && this.target.id);
                        if (dist < (60 + (this.target.width || 80) / 2)) {
                            if (!targetIsPlayer || (owner && owner.canAttackTarget(this.target))) {
                                this.hit(this.target, monsters);
                            }
                        }
                    }
                } else {
                    if (Math.abs(this.vx) < 1 && Math.abs(this.vy) < 1) this.isDead = true;
                }
            }
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Collision Checks
        if (this.type === 'fireball') {
            // v1.99.18: Prevent instant explosion at feet. Must travel at least 50px.
            const distFromSpawnSq = (this.x - this.spawnX) ** 2 + (this.y - this.spawnY) ** 2;
            if (distFromSpawnSq < 50 * 50) return;

            // 1. Monsters
            if (monsters) {
                monsters.forEach(m => {
                    if (m.isDead) return;
                    // v1.99.21: Monster x/y are already centers. No offset needed.
                    const mx = m.x;
                    const my = m.y;
                    const monsterRadius = (m.width || 80) / 2;
                    const dist = Math.sqrt((this.x - mx) ** 2 + (this.y - my) ** 2);
                    // v1.99.21: Account for monster size in collision
                    if (dist < (this.hitRadius + monsterRadius)) this.hit(m, monsters);
                });
            }
            // 2. Local Player (PvP Visual/Damage)
            if (lp && !lp.isDead && lp.id !== this.ownerId) {
                if (owner && owner.canAttackTarget(lp)) {
                    const cx = lp.x + (lp.width || 48) / 2;
                    const cy = lp.y + (lp.height || 48) / 2;
                    const dist = Math.sqrt((this.x - cx) ** 2 + (this.y - cy) ** 2);
                    if (dist < this.hitRadius) this.hit(lp, monsters);
                }
            }
            // 3. Remote Players (PvP Damage)
            if (rps) {
                rps.forEach(rp => {
                    if (rp.isDead || rp.id === this.ownerId) return;
                    if (owner && !owner.canAttackTarget(rp)) return;

                    const cx = rp.x + (rp.width || 48) / 2;
                    const cy = rp.y + (rp.height || 48) / 2;
                    const dist = Math.sqrt((this.x - cx) ** 2 + (this.y - cy) ** 2);
                    if (dist < this.hitRadius) this.hit(rp, monsters);
                });
            }
        } else if (this.type === 'missile') {
            // v1.99.31: Standard Missile Collision logic with owner safety
            if (lp && !lp.isDead && lp.id !== this.ownerId && owner?.canAttackTarget(lp)) {
                const cx = lp.x + (lp.width || 48) / 2;
                const cy = lp.y + (lp.height || 48) / 2;
                const dist = Math.sqrt((this.x - cx) ** 2 + (this.y - cy) ** 2);
                if (dist < this.hitRadius) this.hit(lp, monsters);
            }
            if (rps) {
                rps.forEach(rp => {
                    if (rp.isDead || rp.id === this.ownerId) return;
                    if (owner && !owner.canAttackTarget(rp)) return;

                    const cx = rp.x + (rp.width || 48) / 2;
                    const cy = rp.y + (rp.height || 48) / 2;
                    const dist = Math.sqrt((this.x - cx) ** 2 + (this.y - cy) ** 2);
                    if (dist < this.hitRadius) this.hit(rp, monsters);
                });
            }
            if (monsters) {
                monsters.forEach(m => {
                    if (m.isDead) return;
                    const dist = Math.sqrt((this.x - m.x) ** 2 + (this.y - m.y) ** 2);
                    if (dist < (this.hitRadius + (m.width || 80) / 2)) this.hit(m, monsters);
                });
            }
        }
    }

    findNearestTarget(monsters) {
        let nearest = null;
        let minDist = Infinity;
        const scanRange = 700;
        const myId = this.ownerId;
        const lp = window.game?.localPlayer;
        const rps = window.game?.remotePlayers;
        const owner = (lp && lp.id === myId) ? lp : rps?.get(myId);

        if (!owner) return null;

        // 1. Monsters
        if (monsters) {
            monsters.forEach(m => {
                if (m.isDead) return;
                const dist = Math.sqrt((this.x - m.x) ** 2 + (this.y - m.y) ** 2);
                if (dist < minDist && dist < scanRange) {
                    minDist = dist;
                    nearest = m;
                }
            });
        }

        // 2. Local Player
        if (lp && !lp.isDead && lp.id !== myId) {
            // v1.99.38: Robust player check
            if (owner.canAttackTarget(lp)) {
                const cx = lp.x + (lp.width || 48) / 2;
                const cy = lp.y + (lp.height || 48) / 2;
                const dist = Math.sqrt((this.x - cx) ** 2 + (this.y - cy) ** 2);
                if (dist < minDist && dist < scanRange) {
                    minDist = dist;
                    nearest = lp;
                }
            }
        }

        // 3. Remote Players
        if (rps) {
            rps.forEach(rp => {
                if (rp.isDead || rp.id === myId) return;
                // v1.99.38: Robust player check
                if (!owner.canAttackTarget(rp)) return;

                const cx = rp.x + (rp.width || 48) / 2;
                const cy = rp.y + (rp.height || 48) / 2;
                const dist = Math.sqrt((this.x - cx) ** 2 + (this.y - cy) ** 2);
                if (dist < minDist && dist < scanRange) {
                    minDist = dist;
                    nearest = rp;
                }
            });
        }

        return nearest;
    }

    hit(target, monsters) {
        // v1.99.25: Initiate impact delay (v1.99.26: Penetration mode)
        if (this.type === 'fireball') {
            if (!this.isExploding) {
                this.isExploding = true;
                // v1.99.34: respect the delay passed from constructor (scaled by level)
                this.explosionContext = { target, monsters };
            }
            return;
        }

        this._executeActualExplosion(target, monsters);
    }

    _executeActualExplosion(manualTarget = null, manualMonsters = null) {
        const target = manualTarget || (this.explosionContext ? this.explosionContext.target : null);
        const monsters = manualMonsters || (this.explosionContext ? this.explosionContext.monsters : null);

        if (!target) {
            this.isDead = true;
            return;
        }

        // v1.99.15: Visual Explosion
        if (window.game) {
            window.game.addExplosion?.(this.x, this.y, this.aoeRadius || this.radius * 3);
            for (let i = 0; i < 15; i++) window.game.addSpark(this.x, this.y);
        }

        const net = window.game?.net;
        const targetIsMonster = target.isMonster || (target.type === 'monster');

        // Case A: Monster Hit
        if (targetIsMonster) {
            if (this.type === 'fireball') {
                const aoeRadius = this.aoeRadius || 100;
                if (monsters) {
                    monsters.forEach(m => {
                        if (m.isDead) return;
                        // v1.99.31: Monster x/y are already centers.
                        const mx = m.x;
                        const my = m.y;
                        const dist = Math.sqrt((this.x - mx) ** 2 + (this.y - my) ** 2);
                        const monsterRadius = (m.width || 80) / 2;
                        if (dist < (aoeRadius + monsterRadius)) {
                            this._applyDamage(m, net, true);
                        }
                    });
                }
            } else {
                this._applyDamage(target, net, true);
            }
        }
        // Case B: Player Hit (PvP)
        else {
            if (target === window.game?.localPlayer) {
                // Visual hit (damage=0). Just sparks.
            }
            else {
                // PvP Hit from me to Rplayer
                if (this.ownerId === window.game?.localPlayer?.id && this.damage > 0) {
                    let eType = null, eDur = 0, eDmg = 0;
                    if (this.type === 'fireball') {
                        eType = 'burn';
                        eDur = this.burnDuration;
                        eDmg = Math.ceil(this.damage * 0.15);

                        // v1.99.15: AOE for PvP (Damage other hostile players nearby)
                        const rps = window.game?.remotePlayers;
                        if (rps) {
                            rps.forEach(rp => {
                                if (rp === target || rp.isDead || rp.id === this.ownerId) return;
                                if (window.game?.localPlayer?.canAttackTarget(rp)) {
                                    const dist = Math.sqrt((this.x - rp.x) ** 2 + (this.y - rp.y) ** 2);
                                    const rpRadius = (rp.width || 48) / 2;
                                    if (dist < (this.aoeRadius + rpRadius)) {
                                        net.sendPlayerDamage(rp.id, Math.ceil(this.damage), eType, eDur, eDmg);
                                    }
                                }
                            });
                        }
                    }

                    if (net) net.sendPlayerDamage(target.id, Math.ceil(this.damage), eType, eDur, eDmg);
                }
            }
        }

        this.isDead = true;
    }

    _applyDamage(m, net, isMonster) {
        let finalDmg = this.damage;
        let isCrit = this.isCrit || false;

        if (isMonster && net) {
            if (this.damage > 0) {
                net.sendMonsterDamage(m.id, Math.ceil(finalDmg));
                m.lastAttackerId = net.playerId;
            }
        }

        m.takeDamage(Math.ceil(finalDmg), true, isCrit, this.x, this.y);

        if (this.type === 'fireball' && net?.isHost && isMonster) {
            m.applyEffect('burn', this.burnDuration, Math.ceil(finalDmg * 0.15));
        }
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
            SkillRenderer.drawLightning(ctx, this.trail[0]?.x || sx, this.trail[0]?.y || sy, sx, sy, 1);
            // Keep existing beam fallback for trail logic
            ctx.save();
            if (this.trail.length > 2) {
                ctx.beginPath();
                ctx.moveTo(this.trail[0].x, this.trail[0].y);
                for (let i = 1; i < this.trail.length; i++) ctx.lineTo(this.trail[i].x, this.trail[i].y);
                ctx.strokeStyle = this.color;
                ctx.lineWidth = this.radius;
                ctx.globalAlpha = 0.5;
                ctx.stroke();
            }
            ctx.restore();
        } else {
            // v1.99.15: Premium Fireball Visuals
            const angle = Math.atan2(this.vy, this.vx);
            // v1.99.20: Visual radius matches hitRadius for intuitive collision
            SkillRenderer.drawFireball(ctx, sx, sy, this.radius, angle, this.trail);
        }

        // Fireball Landing Indicator
        if (this.type === 'fireball' && this.targetX !== null && this.targetY !== null) {
            ctx.save();
            ctx.strokeStyle = 'rgba(249, 115, 22, 0.4)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(this.targetX, this.targetY, this.aoeRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(249, 115, 22, 0.1)';
            ctx.fill();
            ctx.restore();
        }
    }
}
