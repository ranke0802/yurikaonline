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
        this.lifeTime -= dt;
        if (this.lifeTime <= 0) this.isDead = true;
        if (this.isDead) return;

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
                if ((this.target && this.target.isDead) || !this.target) {
                    this.target = this.findNearestTarget(monsters);
                }

                if (this.target) {
                    // Use center point if possible, else x/y
                    const tx = (this.target.width) ? this.target.x + this.target.width / 2 : this.target.x;
                    const ty = (this.target.height) ? this.target.y + this.target.height / 2 : this.target.y;

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
                        if (dist < 60) this.hit(this.target, monsters);
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
            const hitRadius = 40;
            // 1. Monsters
            if (monsters) {
                monsters.forEach(m => {
                    if (m.isDead) return;
                    const dist = Math.sqrt((this.x - m.x) ** 2 + (this.y - m.y) ** 2);
                    if (dist < hitRadius) this.hit(m, monsters);
                });
            }
            // 2. Local Player (PvP Visual)
            const lp = window.game?.localPlayer;
            if (lp && !lp.isDead && lp.id !== this.ownerId) {
                const cx = lp.x + (lp.width || 48) / 2;
                const cy = lp.y + (lp.height || 48) / 2;
                const dist = Math.sqrt((this.x - cx) ** 2 + (this.y - cy) ** 2);
                if (dist < hitRadius) this.hit(lp, monsters);
            }
            // 3. Remote Players (PvP Damage)
            const rps = window.game?.remotePlayers;
            if (rps) {
                rps.forEach(rp => {
                    if (rp.isDead || rp.id === this.ownerId) return;
                    const cx = rp.x + (rp.width || 48) / 2;
                    const cy = rp.y + (rp.height || 48) / 2;
                    const dist = Math.sqrt((this.x - cx) ** 2 + (this.y - cy) ** 2);
                    if (dist < hitRadius) this.hit(rp, monsters);
                });
            }
        }
    }

    findNearestTarget(monsters) {
        let nearest = null;
        let minDist = Infinity;
        const scanRange = 700;
        const myId = this.ownerId;

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

        // 2. Local Player (Targeting me)
        const lp = window.game?.localPlayer;
        if (lp && !lp.isDead && lp.id !== myId) {
            const cx = lp.x + (lp.width || 48) / 2;
            const cy = lp.y + (lp.height || 48) / 2;
            const dist = Math.sqrt((this.x - cx) ** 2 + (this.y - cy) ** 2);
            if (dist < minDist && dist < scanRange) {
                minDist = dist;
                nearest = lp;
            }
        }

        // 3. Remote Players (Targeting others)
        const rps = window.game?.remotePlayers;
        if (rps) {
            rps.forEach(rp => {
                if (rp.isDead || rp.id === myId) return;
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
        // v0.29.8: Sparks
        if (window.game && window.game.addSpark) {
            for (let i = 0; i < 8; i++) window.game.addSpark(this.x, this.y);
        }

        const net = window.game?.net;

        // Case A: Monster Hit
        if (target.isMonster || (monsters && monsters.has && monsters.has(target.id))) { // Double check properties
            // Fireball AOE logic for Monsters
            if (this.type === 'fireball') {
                // ... existing AOE monster logic ...
                const aoeRadius = this.radius || 100;
                if (monsters) {
                    monsters.forEach(m => {
                        if (m.isDead) return;
                        const dist = Math.sqrt((this.x - m.x) ** 2 + (this.y - m.y) ** 2);
                        if (dist < aoeRadius) {
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
            // Is it LocalPlayer?
            if (target === window.game?.localPlayer) {
                // If damage > 0, it means *I* shot it at *myself* (unlikely due to ownerCheck)
                // OR logic failure. 
                // BUT, if this is a "Visual" projectile from RemotePlayer (damage=0), 
                // we just want Sparks (already done above).
                // We DO NOT take damage locally from visual projectiles.
                // Real damage comes via network packet.
            }
            // Is it RemotePlayer?
            else {
                // If I am the owner (damage > 0), I hit them. Send packet.
                if (this.ownerId === window.game?.localPlayer?.id && this.damage > 0) {
                    // Fireball AOE for Players? Maybe too complex. Just single hit for now or simple range check.
                    // Simple single hit:
                    if (net) net.sendPlayerDamage(target.id, Math.ceil(this.damage));
                }
            }
        }

        this.isDead = true;
    }

    _applyDamage(m, net, isMonster) {
        let finalDmg = this.damage;
        let isCrit = this.isCrit || false;

        // Crit recalc if needed (for AOE)
        // If this.critRate exists, might recalc. But simplified: use strict this.damage

        if (isMonster && net) {
            if (this.damage > 0) { // Only send if real damage
                net.sendMonsterDamage(m.id, Math.ceil(finalDmg));
                m.lastAttackerId = net.playerId;
            }
        }

        // Visual feedback
        // v0.29.17: All clients call takeDamage for visual feedback
        m.takeDamage(Math.ceil(finalDmg), true, isCrit, this.x, this.y);

        if (this.type === 'fireball' && net?.isHost && isMonster) {
            m.applyEffect('burn', this.burnDuration, Math.ceil(finalDmg * 0.15));
        }
    }
}
