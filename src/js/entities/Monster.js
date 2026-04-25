import CharacterBase from './core/CharacterBase.js';
import Logger from '../utils/Logger.js';
import { Sprite } from '../core/Sprite.js';

const GENERATED_MONSTER_IDLE_FRAMES = Array.from({ length: 8 }, (_, index) => `idle_${String(index + 1).padStart(2, '0')}.webp`);
const IMAGE_FILE_EXTENSION_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i;
const FALLBACK_MONSTER_ASSET_PATH = 'assets/resource/monster_slime';

function shouldFreezeForModalUi() {
    const ui = window.game?.ui;
    const net = window.game?.net;
    return !!ui?.isPaused && !net?.isSharedFieldActive?.();
}

export default class Monster extends CharacterBase {
    constructor(x, y, definition) {
        // v2.3.2: Robust null check
        definition = definition || {};

        // Use speed from definition or default 50
        const speed = definition.baseStats?.speed ?? 50;
        super(x, y, speed);

        this.definition = definition;
        this.initialX = x;

        // Apply Definition Data
        this.id = null; // Set by Manager
        this.typeId = definition.id || 'slime';
        this.name = definition.name || (this.typeId === 'king_slime' ? '킹 슬라임' : '슬라임');
        this.hp = definition.baseStats?.hp ?? 100;
        this.maxHp = definition.baseStats?.maxHp ?? 100;
        this.atk = definition.baseStats?.atk ?? 10;
        this.def = definition.baseStats?.def ?? 0;
        this.mp = definition.baseStats?.mp ?? 0;
        this.maxMp = definition.baseStats?.maxMp ?? 0;
        this.hpRegen = definition.baseStats?.hpRegen ?? 0;
        this.mpRegen = definition.baseStats?.mpRegen ?? 0;
        this.exp = definition.baseStats?.exp ?? 10;

        // Visual
        this.width = definition.visual?.width ?? 80;
        this.height = definition.visual?.height ?? 80;
        this.frameSpeed = definition.visual?.frameSpeed ?? 0.15;
        this.frameCount = definition.visual?.frameCount ?? 5;
        this.assetPath = definition.visual?.assetPath || FALLBACK_MONSTER_ASSET_PATH;
        this.visualFrames = this._normalizeFrameList(definition.visual?.frames);
        if (this.visualFrames.length > 0) {
            this.frameCount = this.visualFrames.length;
        }
        this.scale = definition.visual?.scale ?? 1.0;

        // Components
        this.skills = definition.skills || [];
        this.skillCooldowns = new Map();
        this.drops = definition.drops || [];
        this.sounds = definition.sounds || {};
        this.behavior = definition.behavior || {};
        this.fallbackShape = definition.visual?.fallbackShape || null;

        // States
        this.sprite = null;
        this.ready = false;
        this.frame = 0;
        this.timer = 0;
        this.visualTime = Math.random() * Math.PI * 2;
        this.visualSeed = Math.random() * 1000;
        this.impactPulseTimer = 0;
        this.attackPulseTimer = 0;
        this.attackPulseDuration = 0.24;
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
        this.isBoss = (this.typeId === 'king_slime');
        this.chargeOnly = !!definition.chargeOnly;
        this.electrocutedTimer = 0;
        this.slowRatio = 0;
        this.sparkTimer = 0;
        this.regenTimer = 0;
        this.lastAttackerId = null;
        this.lastDamageMeta = null;
        this.damageContributors = new Set();
        this.targetX = x;
        this.targetY = y;
        this.targetPlayer = null;
        this.spawnGraceTimer = 3.0;
        this.isMonster = true;
        this.type = 'monster';
        this.lastHitAt = 0;
        this.lastNetworkEventAt = 0;
        this.remoteSyncRev = 0;
        this.remoteSyncTs = 0;
        this.remoteSyncState = 'idle';
        this.remoteCellId = '0_0';

        // Specific Skill Cooldowns (Legacy Support)
        this.missileCooldown = 0;
        this.missileMaxCooldown = 5000;
        this.chargeCooldown = 0;
        this.chargeState = 'idle';
        this.chargeTimer = 0;
        this.chargeTarget = null;
        this.shieldCooldown = 0;
        this.shieldMaxCooldown = 8000;
        this.shieldDuration = 0;

        this.loadingRequested = false;
    }

    _isProtectedPlayer(player) {
        const currentScene = window.game?.sceneManager?.currentScene;
        if (!player || typeof currentScene?.isPlayerProtected !== 'function') return false;
        return currentScene.isPlayerProtected(player);
    }



    static spriteCache = {};

    _normalizeFrameList(frames) {
        if (!Array.isArray(frames)) return [];
        return frames
            .map(frame => typeof frame === 'string' ? frame.trim() : '')
            .filter(Boolean);
    }

    _isSingleImagePath(path) {
        return typeof path === 'string' && IMAGE_FILE_EXTENSION_PATTERN.test(path);
    }

    _isStandaloneFramePath(framePath) {
        return /^(?:[a-z]+:|\/|assets\/)/i.test(framePath);
    }

    _resolveFramePath(basePath, framePath) {
        if (this._isStandaloneFramePath(framePath)) return framePath;
        if (!basePath) return framePath;
        return `${basePath.replace(/\/+$/, '')}/${framePath.replace(/^\/+/, '')}`;
    }

    _withVersion(url) {
        if (/^(?:data:|blob:)/i.test(url)) return url;
        let v = window.GAME_VERSION;
        if (!v || v === 'error' || v === 'unknown') v = Date.now();
        return `${url}${url.includes('?') ? '&' : '?'}v=${v}`;
    }

    _getFrameSources(path) {
        if (this.visualFrames.length > 0) {
            return this.visualFrames.map(framePath => this._resolveFramePath(path, framePath));
        }

        if (this._isSingleImagePath(path)) {
            return [path];
        }

        if (typeof path === 'string' && path.includes('/animated_monsters/')) {
            return GENERATED_MONSTER_IDLE_FRAMES.map(frameFile => this._resolveFramePath(path, frameFile));
        }

        const frameCount = Math.max(1, Number(this.frameCount) || 5);
        return Array.from({ length: frameCount }, (_, index) => this._resolveFramePath(path, `${index + 1}.webp`));
    }

    _getFallbackFrameSources() {
        return Array.from({ length: 5 }, (_, index) => this._resolveFramePath(FALLBACK_MONSTER_ASSET_PATH, `${index + 1}.webp`));
    }

    async _loadFrameImages(frames) {
        if (!Array.isArray(frames) || frames.length === 0) return [];

        let loadedFrames = [];
        if (window.game && window.game.resources) {
            loadedFrames = await Promise.all(frames.map((framePath) => {
                const url = this._withVersion(framePath);

                return window.game.resources.loadImage(url).then(img => {
                    return img;
                }).catch(err => {
                    Logger.warn(`Failed to load monster frame: ${url}`, err);
                    return null;
                });
            }));
        } else {
            loadedFrames = await Promise.all(frames.map((framePath) => {
                const img = new Image();
                img.src = this._withVersion(framePath);
                return new Promise((resolve) => {
                    img.onload = () => {
                        resolve(img);
                    };
                    img.onerror = () => {
                        Logger.warn(`Failed to load monster frame: ${img.src}`);
                        resolve(null);
                    };
                });
            }));
        }

        return loadedFrames.filter(img => img && img.width > 0 && img.height > 0);
    }

    _buildSpriteFromFrames(loadedFrames, targetW, targetH) {
        if (!Array.isArray(loadedFrames) || loadedFrames.length === 0) return null;

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetW * loadedFrames.length;
        finalCanvas.height = targetH;
        const finalCtx = finalCanvas.getContext('2d');
        loadedFrames.forEach((img, i) => {
            this.processAndDrawFrame(img, finalCtx, i * targetW, 0, targetW, targetH);
        });

        return new Sprite(finalCanvas, loadedFrames.length, 1);
    }

    async init(path) {
        if (!path) path = FALLBACK_MONSTER_ASSET_PATH;
        const frames = this._getFrameSources(path);
        const cacheKey = JSON.stringify({ path, frames });

        // Check Cache
        if (Monster.spriteCache[cacheKey]) {
            this.sprite = Monster.spriteCache[cacheKey];
            this.frameCount = Math.max(1, this.sprite.cols || this.frameCount);
            this.ready = true;
            return;
        }

        const targetW = 256;
        const targetH = 256;

        let loadedFrames = await this._loadFrameImages(frames);
        let activeFrames = frames;

        if (loadedFrames.length === 0) {
            const fallbackFrames = this._getFallbackFrameSources();
            const isAlreadyFallback = JSON.stringify(frames) === JSON.stringify(fallbackFrames);
            if (!isAlreadyFallback) {
                Logger.warn(`No custom monster frames loaded for ${path}, trying slime WebP fallback.`);
                loadedFrames = await this._loadFrameImages(fallbackFrames);
                activeFrames = fallbackFrames;
            }
        }

        if (loadedFrames.length > 0) {
            this.sprite = this._buildSpriteFromFrames(loadedFrames, targetW, targetH);
            this.frameCount = loadedFrames.length;
            this.frame = this.frame % this.frameCount;
            Monster.spriteCache[cacheKey] = this.sprite; // Save to cache
            if (activeFrames !== frames) {
                Monster.spriteCache[JSON.stringify({ path: FALLBACK_MONSTER_ASSET_PATH, frames: activeFrames })] = this.sprite;
            }
        } else {
            Logger.warn(`No frames loaded for ${path}, using fallback.`);
            this.sprite = null; // Force fallback rendering
            this.frameCount = 1;
            this.frame = 0;
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

        if (data[3] === 0 && img.width === destW && img.height === destH) {
            ctx.drawImage(img, destX, destY, destW, destH);
            return;
        }

        // 1. Check if image is ALREADY transparent (WebP/PNG)
        // Check top-left pixel alpha. If it's 0, crop to visible pixels before atlas packing.
        if (data[3] === 0) {
            let minX = img.width, maxX = 0, minY = img.height, maxY = 0;
            let foundPixels = false;
            for (let y = 0; y < img.height; y++) {
                for (let x = 0; x < img.width; x++) {
                    const idx = (y * img.width + x) * 4;
                    if (data[idx + 3] <= 8) continue;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    foundPixels = true;
                }
            }

            if (!foundPixels) return;
            const charW = maxX - minX + 1;
            const charH = maxY - minY + 1;
            const scale = Math.min(destW / charW, destH / charH) * 0.9;
            const drawW = charW * scale;
            const drawH = charH * scale;
            const offX = (destW - drawW) / 2;
            const offY = (destH - drawH) / 2;
            ctx.drawImage(tempCanvas, minX, minY, charW, charH, destX + offX, destY + offY, drawW, drawH);
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

                // Threshold for background removal - v2.3.5: Increased to 100 for better green screen removal
                if (diff < 100) {
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

    // v0.33.0: Regen Logic
    _handleRegen(dt) {
        if (this.isDead) return;
        this.regenTimer += dt;
        if (this.regenTimer >= 1.0) {
            this.regenTimer = 0;
            if (this.hp < this.maxHp && this.hpRegen > 0) {
                this.hp = Math.min(this.maxHp, this.hp + this.hpRegen);
                // v0.33.0: Regen Feedback (Accumulate or just show every second)
                // Since this runs once per second (regenTimer >= 1.0), we can show it directly.
                if (window.game && window.game.addDamageText) {
                    window.game.addDamageText(this.x, this.y - 60, `+${this.hpRegen}`, '#4ade80', false);
                }
            }
            if (this.mp < this.maxMp && this.mpRegen > 0) {
                this.mp = Math.min(this.maxMp, this.mp + this.mpRegen);
            }
        }

        // v0.33.0: Update Shield Cooldown
        if (this.shieldCooldown > 0) {
            this.shieldCooldown -= dt * 1000;
        }
    }

    // v0.00.43: Charge Skill Implementation
    startCharge(targetX, targetY) {
        if (this.isDead || this.chargeState !== 'idle') return;
        if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
            Logger.warn(`[Monster] Ignored invalid charge target for ${this.id || this.typeId}`);
            return;
        }

        this.chargeState = 'casting';
        this.lastNetworkEventAt = Date.now();
        this.chargeTimer = 1.0; // 1s Casting
        this.chargeTarget = { x: targetX, y: targetY };
        this.vx = 0;
        this.vy = 0;
        this.attackPulseTimer = Math.max(this.attackPulseTimer, 0.18);
        // Optionally play warning sound?
        Logger.log(`[Monster] ${this.id} started charge casting.`);
    }

    _updateCharge(dt) {
        if (this.chargeState === 'idle') {
            if (this.chargeCooldown > 0) this.chargeCooldown -= dt * 1000;
            return false; // Not charging, continue normal AI
        }

        const hasChargeTarget = Number.isFinite(this.chargeTarget?.x) && Number.isFinite(this.chargeTarget?.y);
        if (!hasChargeTarget) {
            this.chargeState = 'idle';
            this.chargeTimer = 0;
            this.chargeTarget = null;
            this.vx = 0;
            this.vy = 0;
            return false;
        }

        if (this.chargeState === 'casting') {
            this.chargeTimer -= dt;
            this.vx = 0;
            this.vy = 0; // Freeze movement
            if (this.chargeTimer <= 0) {
                this.chargeState = 'charging';
                this.lastNetworkEventAt = Date.now();
                // Lock target vector
                const angle = Math.atan2(this.chargeTarget.y - this.y, this.chargeTarget.x - this.x);
                const speed = 300;
                this.vx = Math.cos(angle) * speed;
                this.vy = Math.sin(angle) * speed;
                this.attackPulseTimer = this.attackPulseDuration;

                // Calculate max duration based on distance (or fixed duration?)
                // Requirement: "Rush to player position".
                // Stop when close to that point.
                const dist = Math.sqrt((this.chargeTarget.x - this.x) ** 2 + (this.chargeTarget.y - this.y) ** 2);
                this.chargeTimer = (dist / speed) + 0.2; // Add minimal buffer
            }
            return true; // Override normal AI
        }

        if (this.chargeState === 'charging') {
            this.chargeTimer -= dt;

            // Move logic is handled by update() using this.vx/vy, but we must ensure AI doesn't overwrite it.
            // Collision Check (Host Authority preferred, but client prediction needed for smoothness)
            // Ideally, Host checks collision. Client just visualizes.

            // Check if arrived at target point
            const distToTarget = Math.sqrt((this.chargeTarget.x - this.x) ** 2 + (this.chargeTarget.y - this.y) ** 2);
            if (distToTarget < 10 || this.chargeTimer <= 0) {
                this.chargeState = 'idle';
                this.lastNetworkEventAt = Date.now();
                this.chargeCooldown = 15000; // v0.00.85: Increased to 15s for balance
                this.chargeTarget = null;
                this.vx = 0;
                this.vy = 0;
            }
            return true;
        }

        return false;
    }

    renderTelegraph(ctx) {
        if (this.isDead || this.chargeState !== 'casting' || !this.chargeTarget) return;

        const screenX = Math.round(this.x);
        const screenY = Math.round(this.y);
        // Context is already camera-transformed; charge target is in world space.

        ctx.save();
        const pulse = 0.55 + Math.sin(this.visualTime * 10) * 0.25;
        ctx.fillStyle = `rgba(255, 0, 0, ${0.18 + pulse * 0.12})`;
        ctx.strokeStyle = `rgba(255, 80, 64, ${0.35 + pulse * 0.25})`;
        ctx.lineWidth = 2;

        const dx = this.chargeTarget.x - this.x;
        const dy = this.chargeTarget.y - this.y;
        const angle = Math.atan2(dy, dx);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const width = this.width;

        ctx.translate(screenX, screenY);
        ctx.rotate(angle);

        // Draw Rectangle (0, -width/2, dist, width)
        ctx.fillRect(0, -width / 2, dist, width);
        ctx.strokeRect(0, -width / 2, dist, width);

        ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 + pulse * 0.35})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(16, (width * 0.45) + pulse * 10), 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    _updateVisualMotion(dt) {
        this.visualTime += Math.min(0.1, dt);
        const isMoving = Math.hypot(this.vx || 0, this.vy || 0) > 8;
        const baseAmp = isMoving ? 1.8 : 1.1;
        const chargeAmp = this.chargeState === 'casting' ? 2.2 : 0;
        this.renderOffY = Math.sin((this.visualTime * 5.5) + this.visualSeed) * (baseAmp + chargeAmp);
        if (this.impactPulseTimer > 0) {
            this.impactPulseTimer = Math.max(0, this.impactPulseTimer - dt);
        }
        if (this.attackPulseTimer > 0) {
            this.attackPulseTimer = Math.max(0, this.attackPulseTimer - dt);
        }
    }

    _getVisualScale() {
        const isMoving = Math.hypot(this.vx || 0, this.vy || 0) > 8;
        const breathe = Math.sin((this.visualTime * 5.5) + this.visualSeed);
        const squash = isMoving ? 0.018 : 0.012;
        let scaleX = 1 + (breathe * squash);
        let scaleY = 1 - (breathe * squash);

        if (this.chargeState === 'casting') {
            const pulse = 0.03 + Math.max(0, Math.sin(this.visualTime * 12)) * 0.025;
            scaleX += pulse;
            scaleY -= pulse * 0.55;
        } else if (this.chargeState === 'charging') {
            scaleX += 0.035;
            scaleY -= 0.025;
        }

        if (this.impactPulseTimer > 0) {
            const t = this.impactPulseTimer / 0.16;
            scaleX += t * 0.08;
            scaleY -= t * 0.05;
        }

        if (this.attackPulseTimer > 0) {
            const progress = 1 - (this.attackPulseTimer / Math.max(0.01, this.attackPulseDuration));
            const punch = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI);
            scaleX += punch * 0.1;
            scaleY -= punch * 0.08;
        }

        return { scaleX, scaleY };
    }

    update(dt) {
        // v1.99.9: Hard cap on dt to prevent physics tunneling or explosions during lag
        const safeDt = Math.min(0.1, dt);
        const isPassive = !!this.behavior?.passive || this.typeId === 'training_dummy';
        const isPaused = shouldFreezeForModalUi();
        const isStoryActive = !!window.game?.story?.isStoryActive;

        if (this.hp <= 0 && !this.isDead) {
            this.isDead = true;
            this.hp = 0;
            this.vx = 0;
            this.vy = 0;
            this.chargeState = 'idle';
            this.chargeTimer = 0;
            this.chargeTarget = null;
            Logger.log(`[Monster] Local death trigger for ${this.id}`);
        }

        // v0.02.017: In solo modal pause, freeze the monster exactly as-is so
        // charge/cast targeting resumes from the remaining state after closing the popup.
        if (isPaused) {
            this.vx = 0;
            this.vy = 0;
            return;
        }

        if (this.isDead) {
            this.deathTimer += dt;
            this.alpha = Math.max(0, 1 - (this.deathTimer / this.deathDuration));
            this.chargeState = 'idle';
            this.chargeTimer = 0;
            this.chargeTarget = null;
            return; // Dead monsters only fade out, no AI
        }

        // v0.00.85: Pause AI/Movement if Story is active
        if (isStoryActive) {
            // Reset velocity to prevent persistent sliding during stories
            this.vx = 0;
            this.vy = 0;
            this._updateVisualMotion(dt);
            if (this.hitTimer > 0) this.hitTimer = Math.max(0, this.hitTimer - dt);

            if (this.chargeState === 'casting') {
                this.chargeTimer -= safeDt;
                if (this.chargeTimer <= 0) {
                    this.chargeState = 'idle';
                    this.chargeTimer = 0;
                    this.chargeTarget = null;
                }
            } else if (this.chargeState === 'charging') {
                this.chargeState = 'idle';
                this.chargeTimer = 0;
                this.chargeTarget = null;
            }

            if (this.electrocutedTimer > 0) {
                this.electrocutedTimer = Math.max(0, this.electrocutedTimer - dt);
                this.sparkTimer -= dt;
                if (this.sparkTimer <= 0 && this.electrocutedTimer > 0) {
                    this.sparkTimer = 0.1 + Math.random() * 0.2;
                }
            } else {
                this.slowRatio = 0;
            }

            this.statusEffects = this.statusEffects.filter((eff) => {
                eff.timer -= dt;
                return eff.timer > 0;
            });
            return;
        }

        // v0.33.0: Handle Regen
        this._handleRegen(dt);

        // v0.00.43: Charge Logic (Returns true if overriding AI)
        const isCharging = this._updateCharge(safeDt);

        if (!this.ready && !isPassive) {
            // v1.99.13: If host, we MUST load assets even if off-screen to run AI pathing
            if (!this.loadingRequested) {
                this.loadingRequested = true;
                this.init(this.assetPath);
            }
            return;
        }

        this._updateVisualMotion(safeDt);

        // 2. Targeting (AI Awareness) - Skip if Charging (already locked)
        if (!isCharging) {
            const getAllPlayers = () => {
                const players = [];
                const net = window.game?.net;
                const seenIds = new Set();
                const isRemotePlayerActive = (player) => {
                    if (!player || player.id === window.game?.localPlayer?.id) return true;
                    return !!net?.isUserActivelyPresent?.(player.id);
                };
                const tryAddPlayer = (player) => {
                    if (!player?.id || seenIds.has(player.id)) return;
                    if (!!player.isDead || !!player.isPaused) return;
                    if (Number.isFinite(player.protectedUntil) && player.protectedUntil > Date.now()) return;
                    if (!isRemotePlayerActive(player) || this._isProtectedPlayer(player)) return;
                    seenIds.add(player.id);
                    players.push(player);
                };
                // v0.00.55: Filter candidates who are viewing modals (isPaused)
                const isLocalPaused = shouldFreezeForModalUi();
                if (window.game?.localPlayer && !window.game.localPlayer.isDead && !isLocalPaused && !this._isProtectedPlayer(window.game.localPlayer)) {
                    seenIds.add(window.game.localPlayer.id);
                    players.push(window.game.localPlayer);
                }
                if (window.game?.remotePlayers) {
                    window.game.remotePlayers.forEach(p => {
                        tryAddPlayer(p);
                    });
                }
                if (net?.remotePlayers) {
                    net.remotePlayers.forEach((p, id) => {
                        if (!p || !id) return;
                        tryAddPlayer({
                            id: p.id || id,
                            x: Number(p.x ?? 0),
                            y: Number(p.y ?? 0),
                            width: p.width || 48,
                            height: p.height || 48,
                            isDead: Array.isArray(p.h) ? Number(p.h[0] || 0) <= 0 : false,
                            isPaused: !!p.isPaused,
                            protectedUntil: Number(p.protectedUntil || 0),
                            type: 'player'
                        });
                    });
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
            if (!isPassive && this.spawnGraceTimer <= 0 && candidates.length > 0) {
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
        }

        this.timer += dt;
        if (this.timer >= this.frameSpeed) {
            this.timer = 0;
            this.frame = (this.frame + 1) % this.frameCount;
        }

        // 3. Movement Logic (Host Authority)
        if (window.game?.net?.isHost) {
            if (!isCharging) {
                const target = this.targetPlayer;
                let aiVx = 0;
                let aiVy = 0;

                // Base Velocity from AI
                if (isPassive) {
                    aiVx = 0;
                    aiVy = 0;
                } else if (target) {
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

                        // Data-Driven Attack Logic
                        if (!this.chargeOnly) { // Legacy flag support
                            if (!this.attackCooldown) this.attackCooldown = 0;
                            this.attackCooldown -= dt;
                            if (this.attackCooldown <= 0) {
                                // Basic Attack
                                const dmg = Math.ceil(this.atk * (0.8 + Math.random() * 0.4)); // 80% ~ 120% of ATK
                                if (window.game?.net) {
                                    window.game.net.sendPlayerDamage(target.id, dmg);
                                } else {
                                    target.takeDamage(dmg);
                                }

                                // Play Attack Sound
                                if (this.sounds.attack && window.game?.sound) {
                                    window.game.sound.playSfx(this.sounds.attack);
                                }

                                this.attackCooldown = 1.5; // Default Attack Speed
                                this.hitTimer = 0.1;
                                this.attackPulseTimer = this.attackPulseDuration;
                                this.impactPulseTimer = Math.max(this.impactPulseTimer, 0.12);
                            }
                        }
                    }

                    // v2.0: JSON Driven Skill System
                    this._updateSkills(dt, target);

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
            } // End !isCharging check (Charging sets vx/vy itself)

            // Separation Force: Prevent monsters from overlapping perfectly (skip if charging to allow ramming)
            if (window.game?.monsterManager?.monsters && !isCharging) {
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
            if (this.chargeState === 'charging') {
                // Check collision with ANY player
                // Optimization: iterate players
                const players = [];
                if (window.game?.localPlayer && !window.game.localPlayer.isDead && !this._isProtectedPlayer(window.game.localPlayer)) players.push(window.game.localPlayer);
                if (window.game?.remotePlayers) {
                    window.game.remotePlayers.forEach(p => {
                        if (!p.isDead && !this._isProtectedPlayer(p) && window.game?.net?.isUserActivelyPresent?.(p.id)) {
                            players.push(p);
                        }
                    });
                }

                players.forEach(p => {
                    const dist = Math.sqrt((nextX - p.x) ** 2 + (nextY - p.y) ** 2);
                    if (dist < (this.width / 2 + 20)) { // Collision Radius
                        // Hit Player!
                        // v0.00.43: Variable Charge Damage
                        let dmg = Number.isFinite(this.chargeDamage)
                            ? this.chargeDamage
                            : 15; // Slime (Default)
                        if (!Number.isFinite(this.chargeDamage) && this.typeId === 'slime_split') dmg = 30;
                        if (!Number.isFinite(this.chargeDamage) && this.typeId === 'king_slime') dmg = 50;

                        if (window.game?.net) {
                            window.game.net.sendPlayerDamage(p.id, dmg);
                        } else {
                            p.takeDamage(dmg);
                        }

                        // Knockback Player
                        // Since Player knockback is typically client-side or handled by 'force' in damage packet?
                        // Currently sendPlayerDamage doesn't support force.
                        // I might need to send a knockback event or Player.js handles it.
                        // Wait, `Monster.js` line 392 just sends damage.
                        // Player physics: `takeDamage` handles visual.

                        // Stop Charging
                        this.chargeState = 'idle';
                        this.chargeCooldown = 15000; // v0.00.85: Increased to 15s for balance
                        this.chargeTarget = null;
                        this.vx = 0;
                        this.vy = 0;
                        canMove = false;

                        // Apply Knockback to Player?
                        // p.applyKnockback(this.vx * 2, this.vy * 2); // If local
                    }
                });
            } else if (this.targetPlayer && !this.targetPlayer.isDead) {
                // Normal Body Block
                const currentDist = Math.sqrt((this.x - this.targetPlayer.x) ** 2 + (this.y - this.targetPlayer.y) ** 2);
                const nextDist = Math.sqrt((nextX - this.targetPlayer.x) ** 2 + (nextY - this.targetPlayer.y) ** 2);
                if (nextDist < 45 && nextDist < currentDist) canMove = false;
            }

            if (canMove) {
                // Apply move with boundary and NaN guard
                const targetX = isNaN(nextX) ? this.x : nextX;
                const targetY = isNaN(nextY) ? this.y : nextY;

                // Debug movement (limited to one monster per session to avoid spam)
                if (!window._moveLogShown) {
                    Logger.debug(`[MonsterAI] Moving ${this.typeId}: vel(${this.vx.toFixed(1)}, ${this.vy.toFixed(1)}) -> pos(${this.x.toFixed(0)}, ${this.y.toFixed(0)})`);
                    window._moveLogShown = true;
                }

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
            const hasPredictedCharge = this.chargeState === 'charging'
                && Number.isFinite(this.vx)
                && Number.isFinite(this.vy)
                && Number.isFinite(this.chargeTarget?.x)
                && Number.isFinite(this.chargeTarget?.y);

            if (hasPredictedCharge) {
                // Charge attacks look very choppy if guests only lerp between sparse
                // host snapshots. Predict locally, then apply a light authority correction.
                const predictedX = this.x + this.vx * safeDt;
                const predictedY = this.y + this.vy * safeDt;
                const correctedX = predictedX + ((targetX - predictedX) * 0.18);
                const correctedY = predictedY + ((targetY - predictedY) * 0.18);
                const arrived = Math.hypot(this.chargeTarget.x - correctedX, this.chargeTarget.y - correctedY) < 14;

                this.x = Math.max(0, Math.min(6000, arrived ? this.chargeTarget.x : correctedX));
                this.y = Math.max(0, Math.min(6000, arrived ? this.chargeTarget.y : correctedY));
            } else {
                const lerpFactor = this.chargeState === 'casting' ? 0.45 : 0.35; // Snappy
                this.x += (targetX - this.x) * lerpFactor;
                this.y += (targetY - this.y) * lerpFactor;
            }
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
                    this.takeDamage(eff.damage, false, false, null, null, {
                        ...(eff.sourceMeta || {}),
                        cause: 'burn'
                    });
                }
            }
            return eff.timer > 0;
        });
    }

    hasEffect(type) {
        return this.statusEffects.some(e => e.type === type);
    }

    applyEffect(type, duration, damage, sourceMeta = null) {
        if (this.isDead) return;
        const existing = this.statusEffects.find(e => e.type === type);
        if (existing) {
            existing.timer = duration; // Refresh duration
            existing.damage = Math.max(existing.damage, damage);
            if (sourceMeta) existing.sourceMeta = { ...(existing.sourceMeta || {}), ...sourceMeta };
        } else {
            this.statusEffects.push({ type, timer: duration, damage, sourceMeta });
        }
    }

    takeDamage(amount, triggerFlash = true, isCrit = false, sourceX = null, sourceY = null, damageMeta = null) {
        if (this.isDead) return;
        this.lastHitAt = Date.now();
        this.lastNetworkEventAt = this.lastHitAt;
        const suppressTransientEffects = !!window.game?.shouldSuppressTransientWorldEffects?.();

        // v0.00.34: Ensure minimum 0 damage (allow full block)
        let dmg = Math.max(0, Math.ceil(parseFloat(amount))); // Changed const to let
        if (isNaN(dmg)) {
            Logger.warn(`[Monster] Invalid damage: ${amount}`);
            return;
        }
        if (damageMeta) {
            this.lastDamageMeta = { ...damageMeta };
        } else if (dmg > 0) {
            this.lastDamageMeta = null;
        }

        // v0.33.0: Reactive Absolute Barrier (Shield)
        // If Shield is active, BLOCK ALL DAMAGE (except maybe 1?)
        if (this.hasEffect('shield')) {
            dmg = 0;
            // Visual feedback "Blocked" (Optional, maybe implied by 0 damage or icon)
            if (!suppressTransientEffects && window.game && window.game.addDamageText) {
                window.game.addDamageText(this.x, this.y - 40, "BLOCK", "#00d2ff", false);
            }
            return; // Completely block
        }

        if (dmg > 0 && this.lastAttackerId) {
            this.damageContributors.add(this.lastAttackerId);
        }

        // v0.33.0: Trigger Shield on Hit (Host Only)
        // v0.00.76: chargeOnly 대왕 슬라임은 Shield(Absolute Barrier)를 절대 사용하지 않음
        if (window.game?.net?.isHost && this.typeId === 'king_slime' && !this.chargeOnly) {
            if (this.shieldCooldown <= 0) {
                // Trigger Shield!
                this.shieldCooldown = this.shieldMaxCooldown;
                this.lastNetworkEventAt = Date.now();
                // 1.0s duration (v0.00.51: Reduced from 1.5s as requested)
                this.applyEffect('shield', 1.0, 0);
                // Sync to network
                window.game.net.sendMonsterAttack(this.id, 'shield', { duration: 1000 });
            }
        }

        // v0.00.03: Optimistic HP reduction for ALL clients for immediate feedback
        // The Host will send the authoritative HP value later to correct any desync
        this.hp = Math.max(0, this.hp - dmg);

        if (window.game?.net?.isHost) {
            Logger.log(`[Monster] [Host] ${this.id} HP: ${this.hp}`);
        }

        // Visual feedback for ALL clients
        if (triggerFlash && !suppressTransientEffects) {
            this.hitTimer = 0.2;
            this.impactPulseTimer = 0.16;
        }

        // Damage text for ALL clients
        if (!suppressTransientEffects && amount > 0 && window.game && typeof window.game.addDamageText === 'function') {
            window.game.addDamageText(this.x, this.y - 40, `-${Math.ceil(amount)}`, isCrit ? '#ff9f43' : '#ff4757', isCrit, isCrit ? 'Critical' : null);
        }

        // v2.2: Hit Feedback — Screen Shake on monster hit
        if (!suppressTransientEffects && amount > 0 && window.game?.camera?.shake) {
            window.game.camera.shake(isCrit ? 8 : 3, isCrit ? 0.2 : 0.1);
        }
        if (!suppressTransientEffects && isCrit && window.game?.loop?.hitstop) {
            window.game.loop.hitstop(60);
        }

        // Play Hit Sound
        if (!suppressTransientEffects && this.sounds.hit && window.game?.sound) {
            // Limit hit sound frequency
            if (!this._lastHitSound || Date.now() - this._lastHitSound > 300) {
                window.game.sound.playSfx(this.sounds.hit);
                this._lastHitSound = Date.now();
            }
        }

        // Apply Knockback / Combustion Collapse after survival is known.
        if (dmg > 0 && this.hp > 0) {
            const impactX = Number.isFinite(damageMeta?.impactX) ? damageMeta.impactX : sourceX;
            const impactY = Number.isFinite(damageMeta?.impactY) ? damageMeta.impactY : sourceY;
            if (!suppressTransientEffects && damageMeta?.combustionCollapse && Number.isFinite(impactX) && Number.isFinite(impactY)) {
                this.applyCombustionCollapse(impactX, impactY, {
                    outwardForce: damageMeta?.collapseOutwardForce,
                    inwardForce: damageMeta?.collapseInwardForce,
                    delayMs: damageMeta?.collapseDelayMs
                });
            } else if (!suppressTransientEffects && sourceX !== null && sourceY !== null) {
                const angle = Math.atan2(this.y - sourceY, this.x - sourceX);
                const force = isCrit ? 300 : 150;
                this.applyKnockback(Math.cos(angle) * force, Math.sin(angle) * force);
            }
        }

        // v0.29.17: Removed internal sendMonsterDamage call (it's now handled by attack code)

        const allowLocalTutorialKill = this.typeId === 'training_dummy' && !!this.isLocalOnly;

        // Death check (host authority + local tutorial dummy fallback)
        if ((window.game?.net?.isHost || allowLocalTutorialKill) && this.hp <= 0) {
            if (!this.isDead) {
                Logger.log(`[Monster] ${this.id || 'unknown'} died`);
                this.isDead = true;
                this.hp = 0;
                this.vx = 0;
                this.vy = 0;
                this.chargeState = 'idle';
                this.chargeTimer = 0;
                this.chargeTarget = null;
                // v1.86: Ensure immediate sync for death state
                if (window.game?.net?.isHost && window.game?.monsterManager) {
                    window.game.monsterManager.forceSync(this.id);
                }

                // Play Death Sound
                if (!suppressTransientEffects && this.sounds.die && window.game?.sound) {
                    window.game.sound.playSfx(this.sounds.die);
                }

                // v2.2: Death Feedback — Strong shake for bosses
                if (!suppressTransientEffects && window.game?.camera?.shake) {
                    const isBoss = this.typeId === 'king_slime';
                    window.game.camera.shake(isBoss ? 20 : 6, isBoss ? 0.5 : 0.2);
                }
                if (!suppressTransientEffects && this.typeId === 'king_slime' && window.game?.loop?.hitstop) {
                    window.game.loop.hitstop(120);
                }

                // v2.3: Tutorial Kill Trigger
                if (window.game?.tutorial) {
                    window.game.tutorial.trigger('kill', { target: this.typeId });
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

    _updateSkills(dt, target) {
        if (!this.skills || this.skills.length === 0) return;

        this.skills.forEach(skill => {
            // Init cooldown if needed
            if (!this.skillCooldowns.has(skill.id)) {
                this.skillCooldowns.set(skill.id, Math.random() * 2000); // Random offset start
            }

            let cd = this.skillCooldowns.get(skill.id);
            if (cd > 0) {
                cd -= dt * 1000;
                this.skillCooldowns.set(skill.id, cd);
                return;
            }

            // Check Trigger
            let shouldTrigger = false;
            if (skill.trigger === 'cooldown') {
                shouldTrigger = true;
            } else if (skill.trigger === 'random') {
                if (Math.random() < (skill.chance || 0.1) * dt) shouldTrigger = true;
            } else if (skill.trigger === 'hp_below_70') {
                if (this.hp < this.maxHp * 0.7) {
                    if (Math.random() < (skill.chance || 0.1) * dt) shouldTrigger = true;
                }
            } else if (skill.trigger === 'damage_received') {
                // Handled in takeDamage typically, but here we can check status
            }

            if (shouldTrigger && target) {
                // Execute Skill
                this._executeSkill(skill, target);

                // Reset Cooldown
                this.skillCooldowns.set(skill.id, skill.cooldown || 5000);
            }
        });
    }

    _executeSkill(skill, target) {
        Logger.log(`[Monster] ${this.id} executing skill: ${skill.id}`);

        // 1. Send Network Event (Host sends 'monsterAttack' packet)
        if (window.game?.net) {
            window.game.net.sendMonsterAttack(this.id, skill.id, {
                targetId: target.id,
                ...skill.data
            });
        }

        // 2. Execute Local Logic (Host side immediate effect)
        if (skill.id === 'charge') {
            this.startCharge(
                target.x + ((target.width || 0) / 2),
                target.y + ((target.height || 0) / 2)
            );
        } else if (skill.id === 'shield') {
            this.applyEffect('shield', (skill.data?.duration || 1000) / 1000, 0);
        } else if (skill.id === 'missile') {
            // Handled by MonsterManager/WorldScene queue via Network Event.
            // Host also processes the event via loopback or direct call?
            // Currently WorldScene listens to 'monsterAttack'.
            // Host needs to ensure visual consistency.
            // WorldScene.js: this.net.on('monsterAttack') handles it.
            // If we are Host, we send it, do we also receive it?
            // NetworkManager usually sends to server. Server broadcasts to ALL (including sender?).
            // If local-only server (p2p/firebase), we might need to simulate echo.
            // For now, assume network handles broadcast.
        }
    }

    _renderTrainingDummy(ctx, x, y) {
        ctx.save();

        // Wooden pole
        ctx.fillStyle = '#7c4a1d';
        ctx.fillRect(x - 7, y - 8, 14, this.height * 0.58);

        // Cross arm
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(x - this.width * 0.32, y - this.height * 0.18, this.width * 0.64, 12);

        // Straw body
        ctx.fillStyle = '#c08a43';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x - this.width * 0.2, y - this.height * 0.34, this.width * 0.4, this.height * 0.42, 12);
        } else {
            ctx.rect(x - this.width * 0.2, y - this.height * 0.34, this.width * 0.4, this.height * 0.42);
        }
        ctx.fill();

        // Head
        ctx.fillStyle = '#d8b36a';
        ctx.beginPath();
        ctx.arc(x, y - this.height * 0.4, 18, 0, Math.PI * 2);
        ctx.fill();

        // Target mark
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y - this.height * 0.12, 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 10, y - this.height * 0.12);
        ctx.lineTo(x + 10, y - this.height * 0.12);
        ctx.moveTo(x, y - this.height * 0.22);
        ctx.lineTo(x, y - this.height * 0.02);
        ctx.stroke();

        ctx.restore();
    }

    _getLoadingPlaceholderPalette() {
        const typeId = String(this.typeId || '').toLowerCase();

        if (typeId.includes('slime')) {
            return {
                fill: 'rgba(125, 211, 252, 0.78)',
                outline: 'rgba(186, 230, 253, 0.95)',
                highlight: 'rgba(255, 255, 255, 0.55)'
            };
        }

        if (typeId.includes('goblin')) {
            return {
                fill: 'rgba(163, 230, 53, 0.58)',
                outline: 'rgba(217, 249, 157, 0.85)',
                highlight: 'rgba(255, 255, 255, 0.42)'
            };
        }

        return {
            fill: 'rgba(203, 213, 225, 0.52)',
            outline: 'rgba(241, 245, 249, 0.75)',
            highlight: 'rgba(255, 255, 255, 0.32)'
        };
    }

    _renderLoadingPlaceholder(ctx, x, y) {
        const palette = this._getLoadingPlaceholderPalette();
        const pulse = 1 + (Math.sin(Date.now() / 180) * 0.035);
        const radiusX = this.width * 0.34 * pulse;
        const radiusY = this.height * 0.28 * pulse;

        ctx.save();
        ctx.fillStyle = palette.fill;
        ctx.beginPath();
        ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = palette.outline;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = palette.highlight;
        ctx.beginPath();
        ctx.ellipse(
            x - (this.width * 0.08),
            y - (this.height * 0.1),
            this.width * 0.09,
            this.height * 0.06,
            -0.35,
            0,
            Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
    }

    render(ctx, camera) {
        const useTrainingDummyRender = this.fallbackShape === 'training_dummy' || this.typeId === 'training_dummy';

        if (!this.ready && !useTrainingDummyRender) {
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

        // v0.00.43: Render Charge Telegraph (Underneath monster)
        this.renderTelegraph(ctx);

        // Fallback or Sprite Draw
        const { scaleX, scaleY } = this._getVisualScale();
        const previousFilter = ctx.filter;
        if (this.hitTimer > 0 && !this.isDead) {
            ctx.filter = 'brightness(1.7) saturate(1.35)';
        }
        ctx.save();
        ctx.translate(screenX, drawY);
        ctx.scale(scaleX, scaleY);
        if (useTrainingDummyRender) {
            this._renderTrainingDummy(ctx, 0, 0);
        } else if (this.sprite) {
            this.sprite.draw(ctx, 0, this.frame, -this.width / 2, -this.height / 2, this.width, this.height);
        } else {
            // Loading fallback: avoid a harsh red disk while sprite assets warm up.
            this._renderLoadingPlaceholder(ctx, 0, 0);
        }
        ctx.restore();
        ctx.filter = previousFilter;

        // Aggro Indicator (!)
        if (this.isAggro && !this.isDead) {
            ctx.save();
            ctx.fillStyle = '#ff3f34';
            ctx.font = 'bold 30px "Outfit", sans-serif';
            ctx.textAlign = 'center';

            // v0.33.0: Draw Shield Icon
            if (this.hasEffect('shield')) {
                // Draw Blue Shield Overlay or Icon
                ctx.save();
                ctx.strokeStyle = '#00d2ff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(screenX, drawY, this.width / 2 + 5, 0, Math.PI * 2);
                ctx.stroke();
                // Maybe a small icon above head?
                ctx.font = '20px sans-serif';
                ctx.fillStyle = '#00d2ff';
                ctx.textAlign = 'center';
                ctx.fillText('🛡️', screenX, drawY - this.height / 2 - 20);
                ctx.restore();
            }

            ctx.fillText('!', screenX, drawY - this.height / 2 - 30);
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
                } else if (type === 'shield') { // v0.00.45: Shield Icon
                    ctx.strokeStyle = '#fff';
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = '#fff';
                    ctx.beginPath();
                    ctx.moveTo(0, 6);
                    ctx.quadraticCurveTo(5, 6, 5, 0);
                    ctx.lineTo(5, -4);
                    ctx.lineTo(0, -6);
                    ctx.lineTo(-5, -4);
                    ctx.lineTo(-5, 0);
                    ctx.quadraticCurveTo(-5, 6, 0, 6);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(100, 100, 255, 0.5)';
                    ctx.fill();
                }

                ctx.restore();
                currentX += 25;
            };

            if (burnEffect) drawStatusBadge('burn');
            if (this.electrocutedTimer > 0) drawStatusBadge('elec');
            // v0.00.45: Shield Icon for Monster (v0.00.52: Unified with statusEffects)
            if (this.hasEffect('shield')) drawStatusBadge('shield');

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
