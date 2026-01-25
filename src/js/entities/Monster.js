import Logger from '../utils/Logger.js';
import { Sprite } from '../core/Sprite.js';


export default class Monster {
    constructor(x, y, name = '슬라임') {

        this.x = x;
        this.y = y;
        this.width = 80;
        this.height = 80;
        this.name = name;
        this.hp = 100;
        this.maxHp = 100;

        this.sprite = null;
        this.ready = false;
        this.frame = 0;
        this.timer = 0;
        this.frameSpeed = 0.15;
        this.frameCount = 5;

        this.hitTimer = 0;
        this.isDead = false;
        this.alpha = 1.0;
        this.deathTimer = 0;
        this.deathDuration = 1.0; // 1 second fade out

        this.statusEffects = []; // { type: 'burn', timer: 3.0, damage: 2 }
        this._looted = false;

        this.vx = 0;
        this.vy = 0;
        this.moveTimer = 0;

        this.isAggro = false;
        this.isBoss = false;
        this.electrocutedTimer = 0;
        this.slowRatio = 0;
        this.sparkTimer = 0;
        this.lastAttackerId = null; // Track who hit this monster
        this.targetX = x;
        this.targetY = y;
        this.isMonster = true;
        this.isDead = false;

        this.knockback = { vx: 0, vy: 0 };
        this.knockbackFriction = 0.9;

        this.init();
    }



    static spriteCache = {};

    async init() {
        const frames = ['1.webp', '2.webp', '3.webp', '4.webp', '5.webp'];
        const path = 'assets/resource/monster_slim';
        const cacheKey = path; // In future, if path changes based on name, use that unique key

        // Check Cache
        if (Monster.spriteCache[cacheKey]) {
            this.sprite = Monster.spriteCache[cacheKey];
            this.ready = true;
            return;
        }

        const targetW = 256;
        const targetH = 256;

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetW * frames.length;
        finalCanvas.height = targetH;
        const finalCtx = finalCanvas.getContext('2d');

        const loadPromises = frames.map((frameFile, i) => {
            const img = new Image();
            const v = window.GAME_VERSION || Date.now();
            img.src = `${path}/${frameFile}?v=${v}`;
            return new Promise((resolve) => {
                img.onload = () => {
                    this.processAndDrawFrame(img, finalCtx, i * targetW, 0, targetW, targetH);
                    resolve();
                };
                img.onerror = resolve;
            });
        });

        await Promise.all(loadPromises);

        this.sprite = new Sprite(finalCanvas, frames.length, 1);
        Monster.spriteCache[cacheKey] = this.sprite; // Save to cache
        this.ready = true;
    }

    processAndDrawFrame(img, ctx, destX, destY, destW, destH) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0);

        const imgData = tempCtx.getImageData(0, 0, img.width, img.height);
        const data = imgData.data;

        // Find background color (top-left pixel is usually safe)
        const bgR = data[0];
        const bgG = data[1];
        const bgB = data[2];

        let minX = img.width, maxX = 0, minY = img.height, maxY = 0;
        let foundPixels = false;

        for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
                const idx = (y * img.width + x) * 4;
                const r = data[idx], g = data[idx + 1], b = data[idx + 2];

                // Calculate distance to BG color
                const diff = Math.sqrt(
                    Math.pow(r - bgR, 2) +
                    Math.pow(g - bgG, 2) +
                    Math.pow(b - bgB, 2)
                );

                // Threshold for background removal
                if (diff < 85) {
                    data[idx + 3] = 0;
                } else {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    foundPixels = true;
                }
            }
        }

        if (foundPixels) {
            tempCtx.putImageData(imgData, 0, 0);
            const charW = maxX - minX + 1;
            const charH = maxY - minY + 1;

            const scale = Math.min(destW / charW, destH / charH) * 0.9;
            const drawW = charW * scale;
            const drawH = charH * scale;
            const offX = (destW - drawW) / 2;
            const offY = (destH - drawH) / 2;

            ctx.drawImage(tempCanvas, minX, minY, charW, charH, destX + offX, destY + offY, drawW, drawH);
        }
    }

    update(dt) {
        if (this.isDead) {
            this.deathTimer += dt;
            this.alpha = Math.max(0, 1 - (this.deathTimer / this.deathDuration));
            return;
        }

        if (!this.ready || this.isDead) return;

        this.renderOffY = Math.sin(Date.now() * 0.01) * 5;


        // --- AI Logic (Aggro & Awareness) ---
        const localP = window.game?.localPlayer;
        if (localP && !localP.isDead) {
            const dToP = Math.sqrt((localP.x - this.x) ** 2 + (localP.y - this.y) ** 2);
            const wasAttacked = this.hp < this.maxHp;
            const aggroRange = 300 + (localP.level * 20);
            const leashRange = aggroRange * 2;

            if (!this.isAggro) {
                // Aggro trigger: either by damage or proximity
                if (wasAttacked || (dToP < aggroRange && localP.level > 3)) {
                    this.isAggro = true;
                }
            } else {
                // v0.22.0: Persistent Aggro Mechanism
                // If attacked, tracking is INFINITE until death.
                // If only proximity-triggered, standard leash applies.
                if (!wasAttacked && dToP > leashRange) {
                    this.isAggro = false;
                }
            }
        } else {
            this.isAggro = false; // Target is dead or missing
        }

        this.timer += dt;
        if (this.timer >= this.frameSpeed) {
            this.timer = 0;
            this.frame = (this.frame + 1) % this.frameCount;
        }

        // --- AI Logic (Host Only: Physical Movement) ---
        if (window.game?.net?.isHost) {
            if (!this.attackCooldown) this.attackCooldown = 0;
            if (this.attackCooldown > 0) this.attackCooldown -= dt;

            // Host AI targeting
            const player = window.game?.localPlayer;

            if (player) {
                const dist = Math.sqrt((player.x - this.x) ** 2 + (player.y - this.y) ** 2);

                if (this.isAggro && dist > 50) {
                    const angle = Math.atan2(player.y - this.y, player.x - this.x);
                    let speed = 20; // Requested by User (v0.22.8)
                    if (this.electrocutedTimer > 0) {
                        speed *= (1 - this.slowRatio);
                    }
                    this.vx = Math.cos(angle) * speed;
                    this.vy = Math.sin(angle) * speed;
                } else if (this.isAggro && dist <= 60) {
                    this.vx = 0;
                    this.vy = 0;
                    if (this.attackCooldown <= 0) {
                        player.takeDamage(Math.ceil(5 + (Math.random() * 5)));
                        this.attackCooldown = 1.5;
                        this.hitTimer = 0.1;
                    }
                } else {
                    // Wandering
                    this.moveTimer -= dt;
                    if (this.moveTimer <= 0) {
                        const shouldMove = Math.random() < 0.7;
                        if (shouldMove) {
                            const angle = Math.random() * Math.PI * 2;
                            let speed = 5 + Math.random() * 10; // 5-15 range for wandering (v0.21.2)
                            if (this.electrocutedTimer > 0) speed *= (1 - this.slowRatio);
                            this.vx = Math.cos(angle) * speed;
                            this.vy = Math.sin(angle) * speed;
                        } else {
                            this.vx = 0;
                            this.vy = 0;
                        }
                        this.moveTimer = 1 + Math.random() * 3;
                    }
                }
            }

            // Movement & Collision (Host Authority)
            const nextX = this.x + (this.vx + this.knockback.vx) * dt;
            const nextY = this.y + (this.vy + this.knockback.vy) * dt;

            // Dissipate knockback
            this.knockback.vx *= this.knockbackFriction;
            this.knockback.vy *= this.knockbackFriction;
            if (Math.abs(this.knockback.vx) < 1) this.knockback.vx = 0;
            if (Math.abs(this.knockback.vy) < 1) this.knockback.vy = 0;


            let canMoveX = true;
            let canMoveY = true;
            const collisionRadius = 45;

            // Collision with Player
            if (player && !player.isDead) {
                const dist = Math.sqrt((nextX - player.x) ** 2 + (nextY - player.y) ** 2);
                if (dist < collisionRadius) {
                    canMoveX = false;
                    canMoveY = false;
                }
            }

            // Collision & Separation Factor: Push away from other monsters
            if (window.game && window.game.monsterManager?.monsters) {
                const allMonsters = window.game.monsterManager.monsters;
                if (allMonsters) {
                    allMonsters.forEach(other => {
                        if (other === this || other.isDead) return;
                        const distToOther = Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2);
                        const separationDist = 55;
                        if (distToOther < separationDist) {
                            // Apply separation force
                            const angle = Math.atan2(this.y - other.y, this.x - other.x);
                            const force = (separationDist - distToOther) * 2.0;
                            this.vx += Math.cos(angle) * force;
                            this.vy += Math.sin(angle) * force;

                            // Visual hint for collision
                            canMoveX = false;
                            canMoveY = false;
                        }
                    });
                }
            }

            if (canMoveX) this.x = nextX;
            if (canMoveY) this.y = nextY;

            // Keep inside map bounds
            this.x = Math.max(0, Math.min(6000, this.x));
            this.y = Math.max(0, Math.min(6000, this.y));
        } else {
            // Guest: Interpolate to target position for smoothness
            const lerpFactor = 0.15;
            this.x += (this.targetX - this.x) * lerpFactor;
            this.y += (this.targetY - this.y) * lerpFactor;
        }

        if (this.hitTimer > 0) {
            this.hitTimer -= dt;
        }

        if (this.electrocutedTimer > 0) {
            this.electrocutedTimer -= dt;
            this.sparkTimer -= dt;
            if (this.sparkTimer <= 0) this.sparkTimer = 0.1 + Math.random() * 0.2;
        } else {
            this.slowRatio = 0;
        }

        // Process Status Effects
        this.statusEffects = this.statusEffects.filter(eff => {
            eff.timer -= dt;
            if (eff.type === 'burn') {
                // Apply burn damage every second-ish
                if (!eff.tickTimer) eff.tickTimer = 0;
                eff.tickTimer += dt;
                if (eff.tickTimer >= 0.5) {
                    eff.tickTimer = 0;
                    this.takeDamage(eff.damage, false); // false = don't trigger hit flash for DoT
                }
            }
            return eff.timer > 0;
        });
    }

    applyEffect(type, duration, damage) {
        if (this.isDead) return;
        const existing = this.statusEffects.find(e => e.type === type);
        if (existing) {
            existing.timer = duration; // Refresh duration
            existing.damage = Math.max(existing.damage, damage);
        } else {
            this.statusEffects.push({ type, timer: duration, damage });
        }
    }

    takeDamage(amount, triggerFlash = true, isCrit = false, sourceX = null, sourceY = null) {
        if (this.isDead) return;

        const dmg = Math.ceil(parseFloat(amount));
        if (isNaN(dmg)) {
            Logger.warn(`[Monster] Invalid damage: ${amount}`);
            return;
        }

        // v0.29.17: Only HOST reduces actual HP to prevent desync
        if (window.game?.net?.isHost) {
            this.hp = Math.max(0, this.hp - dmg);
            Logger.log(`[Monster] ${this.id} HP: ${this.hp}`);
        }

        // Visual feedback for ALL clients
        if (triggerFlash) this.hitTimer = 0.2;

        // Apply Knockback (visual only, doesn't affect sync)
        if (sourceX !== null && sourceY !== null) {
            const angle = Math.atan2(this.y - sourceY, this.x - sourceX);
            const force = isCrit ? 300 : 150;
            this.applyKnockback(Math.cos(angle) * force, Math.sin(angle) * force);
        }

        // Damage text for ALL clients
        if (amount > 0 && window.game && typeof window.game.addDamageText === 'function') {
            window.game.addDamageText(this.x, this.y - 40, `-${Math.ceil(amount)}`, isCrit ? '#ff9f43' : '#ff4757', isCrit, isCrit ? 'Critical' : null);
        }

        // v0.29.17: Removed internal sendMonsterDamage call (it's now handled by attack code)

        // Death check (host authority)
        if (window.game?.net?.isHost && this.hp <= 0) {
            if (!this.isDead) Logger.log(`[Monster] ${this.id || 'unknown'} died`);
            this.isDead = true;
            this.hp = 0;
            this.vx = 0;
            this.vy = 0;
        }
    }

    applyKnockback(vx, vy) {
        this.knockback.vx = vx;
        this.knockback.vy = vy;
    }




    applyElectrocuted(duration, ratio) {
        this.electrocutedTimer = 3.0; // Fixed 3 seconds as requested
        this.slowRatio = Math.max(this.slowRatio, ratio);
    }

    render(ctx, camera) {
        if (!this.ready || this.deathTimer >= this.deathDuration) return;

        ctx.save();
        if (this.isDead) {
            ctx.globalAlpha = 0.5; // Fade out dead monsters
        } else {
            ctx.globalAlpha = this.alpha;
        }


        // Note: Context is already translated by Camera in Main.js
        const screenX = Math.round(this.x);
        const screenY = Math.round(this.y);
        const drawY = screenY + (this.renderOffY || 0);

        // Draw shadow (Grounded)
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(screenX, screenY + this.height / 2, this.width / 2 * 0.7, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        const burnEffect = this.statusEffects.find(e => e.type === 'burn');
        this.sprite.draw(ctx, 0, this.frame, screenX - this.width / 2, drawY - this.height / 2, this.width, this.height);




        // Aggro Indicator (!)
        if (this.isAggro && !this.isDead) {
            ctx.save();
            ctx.fillStyle = '#ff3f34';
            ctx.font = 'bold 30px "Outfit", sans-serif';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 4;
            const bounce = Math.sin(Date.now() * 0.01) * 3;
            ctx.fillText('!', screenX, screenY - this.height / 2 - 40 + bounce);
            ctx.restore();
        }


        // Monster Name (back to top - adjusted down by 15px)
        const nameY = screenY - this.height / 2 - 5;
        ctx.font = 'bold 13px "Outfit", sans-serif';
        ctx.textAlign = 'center';

        // Black Outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeText(this.name, screenX, nameY);

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.fillText(this.name, screenX, nameY);
        ctx.shadowBlur = 0;

        // HP Bar background (below character)
        const uiBaseY = screenY + this.height / 2 + 5;

        // HP Bar background
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(screenX - 30, uiBaseY, 60, 6);
        // HP Bar foreground
        const hpPercent = Math.max(0, Math.min(1, this.hp / this.maxHp));
        ctx.fillStyle = hpPercent > 0.3 ? '#4ade80' : '#ef4444';
        ctx.fillRect(screenX - 30, uiBaseY, 60 * hpPercent, 6);

        // v1.86: Custom Status Icons at the BOTTOM (More fit & Professional)
        if ((burnEffect || this.electrocutedTimer > 0) && !this.isDead) {
            ctx.save();
            const iconY = screenY + this.height / 2 + 15; // Directly below feet/shadow
            let currentX = screenX;

            // Adjust X for multiple icons
            if (burnEffect && this.electrocutedTimer > 0) {
                currentX -= 12;
            }

            const drawStatusBadge = (type) => {
                ctx.save();
                ctx.translate(currentX, iconY);

                // 1. Small pill-shaped background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.beginPath();
                // Check if roundRect is available (Modern browsers), fallback if needed
                if (ctx.roundRect) {
                    ctx.roundRect(-10, -10, 20, 20, 4);
                } else {
                    ctx.rect(-10, -10, 20, 20);
                }
                ctx.fill();

                // 2. Custom Graphic
                ctx.lineWidth = 2;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';

                if (type === 'elec') {
                    // Custom Lightning Shape (N-style)
                    ctx.strokeStyle = '#00d2ff';
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = '#00d2ff';
                    ctx.beginPath();
                    ctx.moveTo(2, -6);
                    ctx.lineTo(-3, 0);
                    ctx.lineTo(3, 0);
                    ctx.lineTo(-2, 6);
                    ctx.stroke();

                    // Center Core
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 0.8;
                    ctx.shadowBlur = 0;
                    ctx.stroke();
                } else if (type === 'burn') {
                    // Custom Flame Shape
                    ctx.strokeStyle = '#ff4757';
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = '#ff4757';
                    ctx.beginPath();
                    ctx.moveTo(0, 5);
                    ctx.quadraticCurveTo(4, 5, 4, 0);
                    ctx.quadraticCurveTo(4, -5, 0, -6);
                    ctx.quadraticCurveTo(-4, -5, -4, 0);
                    ctx.quadraticCurveTo(-4, 5, 0, 5);
                    ctx.stroke();

                    ctx.fillStyle = '#ffa502';
                    ctx.fill();
                }

                ctx.restore();
                currentX += 25;
            };

            if (burnEffect) drawStatusBadge('burn');
            if (this.electrocutedTimer > 0) drawStatusBadge('elec');

            ctx.restore();
        }


        // Electrocuted Spark Effect (v1.65: Slower flicker style)
        if (this.electrocutedTimer > 0 && !this.isDead) {
            ctx.save();

            // v1.65: Cache bolts to slow down flicker
            const now = Date.now();
            if (!this.auraBolts || (now - (this.auraLastUpdate || 0) > 100)) {
                this.auraBolts = [];
                this.auraLastUpdate = now;
                for (let i = 0; i < 2; i++) {
                    const rx = screenX + (Math.random() - 0.5) * this.width * 0.9;
                    const ry = drawY + (Math.random() - 0.5) * this.height * 0.9;

                    const steps = 3 + Math.floor(Math.random() * 2);
                    const boltPoints = [{ x: rx, y: ry }];

                    for (let j = 0; j < steps; j++) {
                        const last = boltPoints[boltPoints.length - 1];
                        boltPoints.push({
                            x: last.x + (Math.random() - 0.5) * 40,
                            y: last.y + (Math.random() - 0.5) * 40
                        });
                    }
                    this.auraBolts.push(boltPoints);
                }
            }

            this.auraBolts.forEach(boltPoints => {
                ctx.beginPath();
                ctx.moveTo(boltPoints[0].x, boltPoints[0].y);
                for (let j = 1; j < boltPoints.length; j++) {
                    ctx.lineTo(boltPoints[j].x, boltPoints[j].y);
                }

                // Pass 1: Outer Cyan Glow
                ctx.strokeStyle = '#48dbfb';
                ctx.lineWidth = 4;
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#00d2ff';
                ctx.stroke();

                // Pass 2: White Sharp Core
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.shadowBlur = 0;
                ctx.stroke();
            });
            ctx.restore();
        }
        ctx.restore();
    }
}
