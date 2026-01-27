import CharacterBase from './core/CharacterBase.js';
import Logger from '../utils/Logger.js';
import { Sprite } from '../core/Sprite.js';


export default class Monster extends CharacterBase {
    constructor(x, y, definition = null) {
        // Use speed from definition or default 50
        const speed = definition?.baseStats?.speed || 50;
        super(x, y, speed);

        // Apply Definition Data
        if (definition) {
            this.id = null; // Set by Manager
            this.typeId = definition.id || 'slime'; // v0.00.01: Persistent ID for sync
            this.name = definition.name || '슬라임';
            this.hp = definition.baseStats?.hp || 100;
            this.maxHp = definition.baseStats?.maxHp || 100;
            this.width = definition.visual?.width || 80;
            this.height = definition.visual?.height || 80;
            this.frameSpeed = definition.visual?.frameSpeed || 0.15;
            this.frameCount = definition.visual?.frameCount || 5;
            this.assetPath = definition.visual?.assetPath || 'assets/resource/monster_slim';
        } else {
            // Legacy / Fallback
            this.typeId = 'slime'; // v0.00.01: Default type for fallbacks
            this.name = '슬라임';
            this.hp = 100;
            this.maxHp = 100;
            this.width = 80;
            this.height = 80;
            this.frameSpeed = 0.15;
            this.frameCount = 5;
            this.assetPath = 'assets/resource/monster_slim';
        }

        this.sprite = null;
        this.ready = false;
        this.frame = 0;
        this.timer = 0;

        this.hitTimer = 0;
        this.isDead = false;
        this.alpha = 1.0;
        this.deathTimer = 0;
        this.deathDuration = 1.0;

        this.statusEffects = [];
        this._looted = false;

        this.vx = 0;
        this.vy = 0;
        this.moveTimer = 0;
        this.wanderVx = 0;
        this.wanderVy = 0;

        this.isAggro = false;
        this.isBoss = false;
        this.electrocutedTimer = 0;
        this.slowRatio = 0;
        this.sparkTimer = 0;
        this.lastAttackerId = null;
        this.targetX = x;
        this.targetY = y;
        this.targetPlayer = null; // v1.99: AI Target
        this.spawnGraceTimer = 3.0; // v1.99.10: Wait 3s after spawn before chasing
        this.isMonster = true;

        // Lazy Load: Do not call init() here. 
        // We will call it in render() so that we only load assets when the monster is actually being drawn (in WorldScene).
        this.loadingRequested = false;
    }



    static spriteCache = {};

    async init(path) {
        if (!path) path = '/assets/resource/monster_slim';
        const frames = ['1.webp', '2.webp', '3.webp', '4.webp', '5.webp'];
        const cacheKey = path;

        // Check Cache
        if (Monster.spriteCache[cacheKey]) {
            this.sprite = Monster.spriteCache[cacheKey];
            this.ready = true;
            return;
        }

        const targetW = 256;
        const targetH = 256;

        // Support both single file and directory logic
        const isSingleFile = path.toLowerCase().endsWith('.webp') || path.toLowerCase().endsWith('.png');

        if (isSingleFile) {
            const img = new Image();
            let v = window.GAME_VERSION;
            // Fallback if version check failed
            if (!v || v === 'error' || v === 'unknown') v = Date.now();
            img.src = `${path}?v=${v}`;

            await new Promise((resolve) => {
                img.onload = () => {
                    const finalCanvas = document.createElement('canvas');
                    finalCanvas.width = targetW;
                    finalCanvas.height = targetH;
                    const finalCtx = finalCanvas.getContext('2d');
                    this.processAndDrawFrame(img, finalCtx, 0, 0, targetW, targetH);
                    this.sprite = new Sprite(finalCanvas, 1, 1);
                    Monster.spriteCache[cacheKey] = this.sprite;
                    this.ready = true;
                    resolve();
                };
                img.onerror = () => {
                    this.ready = true; // Still mark as ready to avoid infinite wait
                    resolve();
                };
            });
            return;
        }

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetW * frames.length;
        finalCanvas.height = targetH;
        const finalCtx = finalCanvas.getContext('2d');
        let loadedCount = 0;
        let loadPromises = [];

        if (window.game && window.game.resources) {
            // Use ResourceManager to ensure we hit the preloaded cache
            loadPromises = frames.map((frameFile, i) => {
                let v = window.GAME_VERSION;
                if (!v || v === 'error' || v === 'unknown') v = Date.now();
                const url = `${path}/${frameFile}?v=${v}`;

                return window.game.resources.loadImage(url).then(img => {
                    this.processAndDrawFrame(img, finalCtx, i * targetW, 0, targetW, targetH);
                    loadedCount++;
                }).catch(err => {
                    Logger.warn(`Failed to load monster frame: ${url}`, err);
                });
            });
            await Promise.all(loadPromises);
        } else {
            // Fallback if no game instance (should not happen in normal flow)
            loadPromises = frames.map((frameFile, i) => {
                const img = new Image();
                const v = window.GAME_VERSION || Date.now();
                img.src = `${path}/${frameFile}?v=${v}`;
                return new Promise((resolve) => {
                    img.onload = () => {
                        this.processAndDrawFrame(img, finalCtx, i * targetW, 0, targetW, targetH);
                        loadedCount++;
                        resolve();
                    };
                    img.onerror = () => {
                        Logger.warn(`Failed to load monster frame: ${img.src}`);
                        resolve();
                    };
                });
            });
            await Promise.all(loadPromises);
        }

        await Promise.all(loadPromises);

        if (loadedCount > 0) {
            this.sprite = new Sprite(finalCanvas, frames.length, 1);
            Monster.spriteCache[cacheKey] = this.sprite; // Save to cache
        } else {
            Logger.warn(`No frames loaded for ${path}, using fallback.`);
            this.sprite = null; // Force fallback rendering
        }
        this.ready = true;
    }

    processAndDrawFrame(img, ctx, destX, destY, destW, destH) {
        // Critical Robustness Check
        if (!img || img.width === 0 || img.height === 0) {
            return;
        }
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        tempCtx.drawImage(img, 0, 0);

        const imgData = tempCtx.getImageData(0, 0, img.width, img.height);
        const data = imgData.data;

        // 1. Check if image is ALREADY transparent (WebP/PNG)
        // Check top-left pixel alpha. If it's 0, assume the image is pre-processed.
        if (data[3] === 0) {
            // Just draw resizing to destination, don't chroma key
            ctx.drawImage(img, 0, 0, img.width, img.height, destX, destY, destW, destH);
            return;
        }

        // 2. Manual Chroma Key (Legacy)
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
        } else {
            // 3. Fallback: If chroma key wiped everything, draw ORIGINAL
            Logger.warn('[Monster] Chroma Key removed all pixels! Reverting to raw image.');
            ctx.drawImage(img, 0, 0, img.width, img.height, destX, destY, destW, destH);
        }
    }

    update(dt) {
        // v1.99.9: Hard cap on dt to prevent physics tunneling or explosions during lag
        const safeDt = Math.min(0.1, dt);

        // 1. Death handling
        if (this.hp <= 0 && !this.isDead) {
            this.isDead = true;
            this.hp = 0;
            this.vx = 0;
            this.vy = 0;
            Logger.log(`[Monster] Local death trigger for ${this.id}`);
        }

        if (this.isDead) {
            this.deathTimer += dt;
            this.alpha = Math.max(0, 1 - (this.deathTimer / this.deathDuration));
            return; // Dead monsters only fade out, no AI
        }

        if (!this.ready) return;

        this.renderOffY = Math.sin(Date.now() * 0.01) * 5;

        // 2. Targeting (AI Awareness)
        const getAllPlayers = () => {
            const players = [];
            if (window.game?.localPlayer && !window.game.localPlayer.isDead) players.push(window.game.localPlayer);
            if (window.game?.remotePlayers) {
                window.game.remotePlayers.forEach(p => { if (!p.isDead) players.push(p); });
            }
            return players;
        };

        this.isAggro = false;
        this.targetPlayer = null;

        // v1.99.10: Handle spawn grace delay (Wait 3s before aggro)
        if (!this.spawnGraceTimer) this.spawnGraceTimer = 0; // Guard
        if (this.spawnGraceTimer > 0) {
            this.spawnGraceTimer -= safeDt;
        }

        const candidates = getAllPlayers();
        if (this.spawnGraceTimer <= 0 && candidates.length > 0) {
            let nearest = null;
            let minDist = Infinity;
            candidates.forEach(p => {
                const dx = p.x - this.x;
                const dy = p.y - this.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < minDist) {
                    minDist = d;
                    nearest = p;
                }
            });
            this.targetPlayer = nearest;
            this.isAggro = true;
        }

        this.timer += dt;
        if (this.timer >= this.frameSpeed) {
            this.timer = 0;
            this.frame = (this.frame + 1) % this.frameCount;
        }

        // 3. Movement Logic (Host Authority)
        if (window.game?.net?.isHost) {
            const target = this.targetPlayer;
            let aiVx = 0;
            let aiVy = 0;

            // Base Velocity from AI
            if (target) {
                const dist = Math.sqrt((target.x - this.x) ** 2 + (target.y - this.y) ** 2);
                if (dist > 55) {
                    // Chase mode
                    const angle = Math.atan2(target.y - this.y, target.x - this.x);
                    let speed = this.speed || 50;
                    if (this.electrocutedTimer > 0) speed *= (1 - this.slowRatio);
                    aiVx = Math.cos(angle) * speed;
                    aiVy = Math.sin(angle) * speed;
                } else {
                    // Attack mode (Stop and hit)
                    aiVx = 0;
                    aiVy = 0;
                    if (!this.attackCooldown) this.attackCooldown = 0;
                    this.attackCooldown -= dt;
                    if (this.attackCooldown <= 0) {
                        if (window.game?.net) {
                            window.game.net.sendPlayerDamage(target.id, Math.ceil(5 + (Math.random() * 5)));
                        } else {
                            target.takeDamage(Math.ceil(5 + (Math.random() * 5)));
                        }
                        this.attackCooldown = 1.5;
                        this.hitTimer = 0.1;
                    }
                }
            } else {
                // Wandering mode
                this.moveTimer -= dt;
                if (this.moveTimer <= 0) {
                    if (Math.random() < 0.7) {
                        const angle = Math.random() * Math.PI * 2;
                        let speed = 5 + Math.random() * 10;
                        if (this.electrocutedTimer > 0) speed *= (1 - this.slowRatio);
                        this.wanderVx = Math.cos(angle) * speed;
                        this.wanderVy = Math.sin(angle) * speed;
                    } else {
                        this.wanderVx = 0;
                        this.wanderVy = 0;
                    }
                    this.moveTimer = 1 + Math.random() * 3;
                }
                aiVx = this.wanderVx;
                aiVy = this.wanderVy;
            }

            // v1.99.9: Apply fresh calculated velocity (Guard against NaN and invalid numbers)
            this.vx = (typeof aiVx === 'number' && !isNaN(aiVx)) ? aiVx : 0;
            this.vy = (typeof aiVy === 'number' && !isNaN(aiVy)) ? aiVy : 0;

            // Separation Force: Prevent monsters from overlapping perfectly
            if (window.game?.monsterManager?.monsters) {
                const allMonsters = window.game.monsterManager.monsters;
                const separationDist = 50;
                allMonsters.forEach(other => {
                    if (other === this || other.isDead) return;
                    let dx = this.x - other.x;
                    let dy = this.y - other.y;
                    let dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 1) { // Perfect overlap fix
                        dx = Math.random() - 0.5;
                        dy = Math.random() - 0.5;
                        dist = Math.sqrt(dx * dx + dy * dy);
                    }
                    if (dist < separationDist) {
                        const angle = Math.atan2(dy, dx);
                        const force = (separationDist - dist) * 0.4; // v1.99.9: Much softer push to avoid bounce
                        this.vx += Math.cos(angle) * force;
                        this.vy += Math.sin(angle) * force;
                    }
                });
            }

            // Final Position Calculation (Safe move)
            let nextX = this.x + (this.vx + this.knockback.vx) * safeDt;
            let nextY = this.y + (this.vy + this.knockback.vy) * safeDt;

            // Collision Detection with Target Player
            let canMove = true;
            if (target && !target.isDead) {
                const currentDist = Math.sqrt((this.x - target.x) ** 2 + (this.y - target.y) ** 2);
                const nextDist = Math.sqrt((nextX - target.x) ** 2 + (nextY - target.y) ** 2);
                if (nextDist < 45 && nextDist < currentDist) canMove = false;
            }

            if (canMove) {
                // Apply move with boundary and NaN guard
                const targetX = isNaN(nextX) ? this.x : nextX;
                const targetY = isNaN(nextY) ? this.y : nextY;
                this.x = Math.max(0, Math.min(6000, targetX));
                this.y = Math.max(0, Math.min(6000, targetY));
            }

            // Dissipate knockback forces
            this.knockback.vx *= 0.85; // Slightly faster dissipation
            this.knockback.vy *= 0.85;
        } else {
            // Guest Side: Smooth Interpolation
            const targetX = isNaN(this.targetX) ? this.x : this.targetX;
            const targetY = isNaN(this.targetY) ? this.y : this.targetY;
            const lerpFactor = 0.35; // Snappy
            this.x += (targetX - this.x) * lerpFactor;
            this.y += (targetY - this.y) * lerpFactor;
        }

        // 4. Cleanup & Feedback
        if (this.hitTimer > 0) this.hitTimer -= dt;

        if (this.electrocutedTimer > 0) {
            this.electrocutedTimer -= dt;
            this.sparkTimer -= dt;
            if (this.sparkTimer <= 0) this.sparkTimer = 0.1 + Math.random() * 0.2;
        } else {
            this.slowRatio = 0;
        }

        // 5. Status Effects
        this.statusEffects = this.statusEffects.filter(eff => {
            eff.timer -= dt;
            if (eff.type === 'burn') {
                if (!eff.tickTimer) eff.tickTimer = 0;
                eff.tickTimer += dt;
                if (eff.tickTimer >= 0.5) {
                    eff.tickTimer = 0;
                    this.takeDamage(eff.damage, false);
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

        // v0.00.03: Optimistic HP reduction for ALL clients for immediate feedback
        // The Host will send the authoritative HP value later to correct any desync
        this.hp = Math.max(0, this.hp - dmg);

        if (window.game?.net?.isHost) {
            Logger.log(`[Monster] [Host] ${this.id} HP: ${this.hp}`);
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
            if (!this.isDead) {
                Logger.log(`[Monster] ${this.id || 'unknown'} died`);
                this.isDead = true;
                this.hp = 0;
                this.vx = 0;
                this.vy = 0;
                // v1.86: Ensure immediate sync for death state
                if (window.game && window.game.monsterManager) {
                    window.game.monsterManager.forceSync(this.id);
                }
            }
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
        if (!this.ready) {
            if (!this.loadingRequested) {
                this.loadingRequested = true;
                this.init(this.assetPath);
            }
            // While not ready, maybe show a loading placeholder?
            // For now, we just fall through to the render logic which handles null sprites.
        }

        if (this.deathTimer >= this.deathDuration) return;

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

        // Fallback or Sprite Draw
        if (this.sprite) {
            this.sprite.draw(ctx, 0, this.frame, screenX - this.width / 2, drawY - this.height / 2, this.width, this.height);
        } else {
            // Fallback: Red Circle
            ctx.fillStyle = '#ff4757';
            ctx.beginPath();
            ctx.arc(screenX, drawY, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }

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
