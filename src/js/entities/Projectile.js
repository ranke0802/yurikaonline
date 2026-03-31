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
        this.variant = options.variant || null;
        this.visualTint = options.visualTint || null;
        this.weaponEffect = options.weaponEffect || null;

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
        // v0.00.05: Owner ID for PvP safety
        this.ownerId = options.ownerId || null;
        this.isMonsterAttack = options.isMonsterAttack || false; // v0.33.0: Monster Attack Flag
        this.reducedEffects = !!window.game?.useReducedEffects;

        // Visuals
        if (this.visualTint) {
            this.color = this.visualTint;
        } else if (this.variant === 'golden_missile') {
            this.color = '#f5cf5b';
        } else if (this.variant === 'blue_fireball') {
            this.color = '#4cb7ff';
        } else if (type === 'missile') {
            this.color = '#00d2ff';
        } else {
            this.color = '#f97316';
        }
        this.trail = [];
        this.trailLength = type === 'missile'
            ? (this.reducedEffects ? 10 : 20)
            : (this.reducedEffects ? 6 : 10);
        this.particles = [];

        // Missile-specific
        if (type === 'missile') {
            this.homingDelay = 0.1 + Math.random() * 0.2;
            this.maxForce = 800;
            this.turnEase = 0;
            this.wobblePhase = Math.random() * Math.PI * 2;
            this.wobbleSpeed = 5 + Math.random() * 5;

            // v0.00.65: Magic Missile Logic Update
            // Lock onto initial target position
            if (this.target) {
                this.homingX = this.target.x;
                this.homingY = this.target.y;
            } else {
                // v0.00.72: If no target, do NOT set homingX/Y to start position.
                // This prevents the missile from immediately returning to origin.
                // It will travel along vx/vy until it finds a target in update() if implemented,
                // or just travel straight-ish until it expires or finds nearest.
                this.homingX = null;
                this.homingY = null;
            }
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
            const particleChance = this.reducedEffects ? 0.12 : 0.3;
            const maxParticles = this.reducedEffects ? 6 : 18;
            if (this.particles.length < maxParticles && Math.random() < particleChance) {
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

                // Keep updating homing pos while target is alive during delay
                if (this.target && !this.target.isDead) {
                    this.homingX = this.target.x;
                    this.homingY = this.target.y;
                }
            } else {
                // v0.00.65: Magic Missile Logic Update
                // If target is alive, update homing position.
                // If target is dead/null, KEEP last homing position (Do NOT retarget).

                if (this.target && !this.target.isDead) {
                    this.homingX = this.target.x;
                    this.homingY = this.target.y;
                }

                // Steer towards homingX/Y
                if (this.homingX === null || this.homingY === null) {
                    // v0.00.72: No target and no homing position, keep straight
                    this.x += this.vx * dt;
                    this.y += this.vy * dt;
                    return;
                }
                const dx = this.homingX - this.x;
                const dy = this.homingY - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > 10) {
                    this.turnEase = Math.min(1.0, this.turnEase + dt * 5.0);
                    const normX = (dx / dist) * this.speed;
                    const normY = (dy / dist) * this.speed;

                    const steerMulti = 50;
                    const steerX = (normX - this.vx) * steerMulti * this.turnEase;
                    const steerY = (normY - this.vy) * steerMulti * this.turnEase;
                    this.vx += steerX * dt;
                    this.vy += steerY * dt;

                    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                    if (currentSpeed > 0) {
                        this.vx = (this.vx / currentSpeed) * this.speed;
                        this.vy = (this.vy / currentSpeed) * this.speed;
                    }

                    // Check if we hit the INTENDED target (if valid)
                    if (this.target && !this.target.isDead) {
                        if (dist < (80 + (this.target.width || 80) / 2)) {
                            // v0.00.43: Fix Infinite Orbiting check
                            const owner = (window.game?.localPlayer?.id === this.ownerId) ? window.game.localPlayer : window.game?.remotePlayers?.get(this.ownerId);
                            const targetIsPlayer = this.target.type === 'player' || (!this.target.isMonster && this.target.id);

                            if (this.isMonsterAttack || !targetIsPlayer || (owner && owner.canAttackTarget(this.target))) {
                                this.hit(this.target, monsters);
                            }
                        }
                    }
                } else {
                    // Reached destination (homingX/Y) but no hit?
                    // If target was dead, we just explode/vanish here.
                    this.isDead = true;
                    // Optional: Add small fizzle effect?
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
            // v0.33.0: Monster Attack Logic (Always hostile to players)
            if (lp && !lp.isDead) {
                let canHit = false;
                if (this.isMonsterAttack) {
                    canHit = true;
                } else if (lp.id !== this.ownerId && owner?.canAttackTarget(lp)) {
                    canHit = true;
                }

                if (canHit) {
                    const cx = lp.x + (lp.width || 48) / 2;
                    const cy = lp.y + (lp.height || 48) / 2;
                    const dist = Math.sqrt((this.x - cx) ** 2 + (this.y - cy) ** 2);
                    if (dist < this.hitRadius) this.hit(lp, monsters);
                }
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

        // v0.00.46: RemotePlayer Absolute Barrier Logic (Visual Sync)
        // If target has shield > 1.5s (Permanent Phase), trigger 1.5s countdown
        if (target.shieldEffect && target.shieldEffect.timer > 1.5) {
            target.shieldEffect.timer = 1.5;
            if (window.game) {
                const cx = target.x + (target.width || 48) / 2;
                window.game.addDamageText(cx, target.y - 40, "BLOCK", '#48dbfb', true);
            }
            // Continue to show explosion visuals, but effective damage is blocked logically (on host)
        }

        // v1.99.15: Visual Explosion
        if (window.game) {
            const explosionVariant = this.variant === 'blue_fireball' ? 'blue_flame' : 'default';
            window.game.addExplosion?.(this.x, this.y, this.aoeRadius || this.radius * 3, { variant: explosionVariant });
            for (let i = 0; i < 15; i++) window.game.addSpark(this.x, this.y);
            // v0.00.63: Explosion SFX
            if (this.type === 'fireball' && window.game.sound) {
                window.game.sound.playSfx('fireball_explosion');
            } else if (this.type === 'missile' && window.game.sound) {
                window.game.sound.playSfx('missile_hit');
            }
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
                // v0.33.0: Monster Attack -> Player Damage
                if (this.isMonsterAttack) {
                    target.takeDamage(Math.ceil(this.damage), false, this.isCrit);
                }
            }
            else {
                // PvP Hit from me to Rplayer
                if (this.ownerId === window.game?.localPlayer?.id && this.damage > 0) {
                    let eType = null, eDur = 0, eDmg = 0;
                    if (this.type === 'fireball') {
                        eType = 'burn';
                        eDur = this.burnDuration;
                        eDmg = Math.ceil(this.damage * 0.15);

                        // v0.00.74: Apply local visual effect to RemotePlayer so I can see it immediately
                        if (target.applyBurn) {
                            target.applyBurn(eDur, eDmg);
                        }

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
        // v0.00.40: Damage formula: (Skill Damage - Defense), min 1
        // v0.00.42: REMOVED duplicate crit - crit already applied in Player.js
        const targetDef = m.defense || 0;
        let finalDmg = Math.max(1, this.damage - targetDef);
        let isCrit = this.isCrit || false;
        // Note: crit multiplier already applied in Player.js, don't apply again

        if (isMonster && net) {
            // v0.33.0: Check Shield Effect (Optimization)
            if (m.hasEffect && m.hasEffect('shield')) {
                // Do not send damage, or send 0? Better to just not verify hit if fully blocked.
                // But we want the "Block" text. The text is local in m.takeDamage?
                // Actually, takeDamage is reactive to net msg. 
                // So if we don't send msg, no text.
                // We should send 0 damage or handle it.
                // Re-reading logic: Host triggers Shield. Clients respect it.
                // If I hit local monster with shield, I see Block.
                // If I don't send packet, Host doesn't know.
                // Better: Client logic in Monster.js handles the damage=0.
                // But here, we can optimize by sending 0, or just sending normally and let Receiver filter.
                // Let's send normally so `monsterDamageReceived` triggers `takeDamage` which triggers "BLOCK" text.
                // Wait, if I send 100 dmg, and `takeDamage` sees Shield, it sets dmg=0 and shows "BLOCK".
                // So I don't actually need to change Projectile.js unless I want to save bandwidth.
                // But if I filter here, I might miss the visual feedback on other clients?
                // No, other clients only see damage if valid.
                // Let's leave Projectile.js ALONE to rely on the robust `takeDamage` logic I just wrote.
                // Actually, I'll add a comment or small optimization if needed.
                // Returning early might be bad for "Block" feedback.
                // I will NOT modify Projectile.js to avoid logic split. 
                // Wait, the plan said "In _applyDamage: Check m.hasEffect('shield')..."
                // "If true, do not send damage packet" -> this means NO "BLOCK" text on other clients.
                // "and effectively deal 0 damage locally" -> this happens in case A.
                // If I want "BLOCK" text, I must run takeDamage.
                // So I should send the packet, and let MonsterManager -> Monster.takeDamage handles it.
                // I will skip this step as it contradicts the "Show Block" goal if we block it too early.
                // Wait, I can run `m.takeDamage(0)` locally to show block?
                // Let's stick to the plan but refine: 
                // If shield, logic in Monster.js `takeDamage` handles it. 
                // So I will NOT modify Projectile.js.
            }

            if (this.damage > 0) {
                const damageMeta = this.type === 'fireball'
                    ? {
                        cause: 'fireball',
                        prefixId: this.weaponEffect?.prefixId || null,
                        fireExplosionDamageRatio: this.weaponEffect?.fireExplosionDamageRatio || 0,
                        burnDuration: this.burnDuration,
                        sourceDamage: Math.ceil(finalDmg),
                        explosionRadius: Math.ceil((this.aoeRadius || this.radius * 2) * 0.75)
                    }
                    : null;
                net.sendMonsterDamage(m.id, Math.ceil(finalDmg), damageMeta);
                m.lastAttackerId = net.playerId;
            }
        }

        const damageMeta = this.type === 'fireball'
            ? {
                cause: 'fireball',
                prefixId: this.weaponEffect?.prefixId || null,
                fireExplosionDamageRatio: this.weaponEffect?.fireExplosionDamageRatio || 0,
                burnDuration: this.burnDuration,
                sourceDamage: Math.ceil(finalDmg),
                explosionRadius: Math.ceil((this.aoeRadius || this.radius * 2) * 0.75)
            }
            : null;
        m.takeDamage(Math.ceil(finalDmg), true, isCrit, this.x, this.y, damageMeta);

        // v0.00.42: Apply burn locally for visual, host syncs to DB
        if (this.type === 'fireball' && isMonster) {
            m.applyEffect('burn', this.burnDuration, Math.ceil(finalDmg * 0.15), {
                cause: 'burn',
                prefixId: this.weaponEffect?.prefixId || null,
                fireExplosionDamageRatio: this.weaponEffect?.fireExplosionDamageRatio || 0,
                burnDuration: this.burnDuration,
                sourceDamage: Math.ceil(finalDmg),
                explosionRadius: Math.ceil((this.aoeRadius || this.radius * 2) * 0.75)
            });
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
            if (this.reducedEffects) {
                const size = Math.max(1, Math.round(p.size));
                ctx.fillRect(Math.round(p.x), Math.round(p.y), size, size);
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        ctx.globalAlpha = 1.0;

        if (this.type === 'missile') {
            SkillRenderer.drawLightning(ctx, this.trail[0]?.x || sx, this.trail[0]?.y || sy, sx, sy, 1, { variant: this.variant });
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
            SkillRenderer.drawFireball(ctx, sx, sy, this.radius, angle, this.trail, { variant: this.variant });
        }

        // Fireball Landing Indicator
        if (this.type === 'fireball' && this.targetX !== null && this.targetY !== null) {
            ctx.save();
            ctx.strokeStyle = this.variant === 'blue_fireball' ? 'rgba(76, 183, 255, 0.4)' : 'rgba(249, 115, 22, 0.4)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(this.targetX, this.targetY, this.aoeRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = this.variant === 'blue_fireball' ? 'rgba(76, 183, 255, 0.12)' : 'rgba(249, 115, 22, 0.1)';
            ctx.fill();
            ctx.restore();
        }
    }
}
