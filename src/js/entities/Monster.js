import CharacterBase from './core/CharacterBase.js';
import Logger from '../utils/Logger.js';
import { Sprite } from '../core/Sprite.js';
import SkillRenderer from '../skills/renderers/SkillRenderer.js';

const BOSS_MECHANIC_AREA_SCALE = 3;
const BOSS_MECHANIC_DAMAGE_SCALE = 2;
const BOSS_MECHANIC_CAST_SCALE = 1.3;

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
        this.initialY = y;

        // Apply Definition Data
        this.id = null; // Set by Manager
        this.typeId = definition.id || 'slime';
        this.name = definition.name || (this.typeId === 'king_slime' ? '킹 슬라임' : '슬라임');
        this.hp = definition.baseStats?.hp ?? 100;
        this.maxHp = definition.baseStats?.maxHp ?? 100;
        this.atk = definition.baseStats?.atk ?? 10;
        this.def = definition.baseStats?.def ?? 0;
        // Combat code consistently reads `defense` for both players and monsters.
        // Keep the legacy `def` field for data/debug compatibility while exposing
        // the canonical runtime property so authored monster DEF is not ignored.
        this.defense = this.def;
        this.mp = definition.baseStats?.mp ?? 0;
        this.maxMp = definition.baseStats?.maxMp ?? 0;
        this.hpRegen = definition.baseStats?.hpRegen ?? 0;
        this.mpRegen = definition.baseStats?.mpRegen ?? 0;
        this.exp = definition.baseStats?.exp ?? 10;

        // Visual
        const visual = definition.visual || {};
        this.width = visual.width ?? 80;
        this.height = visual.height ?? 80;
        this.renderWidth = Number.isFinite(visual.renderWidth) ? visual.renderWidth : null;
        this.renderHeight = Number.isFinite(visual.renderHeight) ? visual.renderHeight : null;
        this.frameSpeed = visual.frameSpeed ?? 0.15;
        this.frameCount = visual.frameCount ?? 5;
        this.assetPath = visual.assetPath || 'assets/resource/monster_slime';
        this.scale = visual.scale ?? 1.0;
        this.spriteVersionNumber = Number(visual.spriteVersionNumber ?? definition.spriteVersionNumber ?? 1);
        this.spriteSheetDefinition = visual.spriteSheet || null;
        this.spriteContentBounds = this.spriteSheetDefinition?.contentBounds || null;
        this.alignSpriteContentToGround = this.spriteSheetDefinition?.alignContentToGround === true;
        this.bossEffects = visual.bossEffects || {};

        // Components
        this.skills = definition.skills || [];
        this.skillCooldowns = new Map();
        this.bossMechanics = Array.isArray(definition.bossMechanics) ? definition.bossMechanics : [];
        this.bossMechanicCooldowns = new Map();
        this.activeBossTelegraphs = [];
        this.shadowAmbush = null;
        this.seenBossTelegraphIds = new Map();
        this.bossTelegraphSerial = 0;
        this.drops = definition.drops || [];
        this.sounds = definition.sounds || {};
        this.behavior = definition.behavior || {};
        this.fallbackShape = definition.visual?.fallbackShape || null;

        const chargeConfig = this.behavior.charge && typeof this.behavior.charge === 'object'
            ? this.behavior.charge
            : {};
        const configuredAggroRange = Number(this.behavior.aggroRange);
        const configuredAttackRange = Number(this.behavior.attackRange);
        const configuredAttackCooldownMs = Number(this.behavior.attackCooldownMs);
        const configuredLeashRange = Number(this.behavior.leashRange);
        const configuredSpawnGraceSeconds = Number(this.behavior.spawnGraceSeconds);
        // Preserve legacy global acquisition when no aggro/leash values exist.
        this.aggroRange = Number.isFinite(configuredAggroRange) && configuredAggroRange >= 0
            ? configuredAggroRange
            : Infinity;
        this.attackRange = Number.isFinite(configuredAttackRange) && configuredAttackRange > 0
            ? configuredAttackRange
            : 55;
        this.attackCooldownSeconds = Number.isFinite(configuredAttackCooldownMs) && configuredAttackCooldownMs >= 0
            ? Math.max(0.05, configuredAttackCooldownMs / 1000)
            : 1.5;
        this.leashRange = Number.isFinite(configuredLeashRange) && configuredLeashRange > 0
            ? configuredLeashRange
            : Infinity;
        this.spawnGraceSeconds = Number.isFinite(configuredSpawnGraceSeconds) && configuredSpawnGraceSeconds >= 0
            ? configuredSpawnGraceSeconds
            : 3.0;

        // States
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
        this.isBoss = !!(
            definition.isBoss
            || definition.behavior?.isBoss
            || definition.type === 'boss'
            || this.typeId === 'king_slime'
        );
        this.electrocutedTimer = 0;
        this.slowRatio = 0;
        this.sparkTimer = 0;
        this.regenTimer = 0;
        this.lastAttackerId = null;
        this.lastDamageMeta = null;
        this.damageContributors = new Set();
        this.damageContributorLevels = new Map();
        this.targetX = x;
        this.targetY = y;
        this.targetPlayer = null;
        this.spawnGraceTimer = this.spawnGraceSeconds;
        this.isMonster = true;
        this.type = 'monster';
        this.lastHitAt = 0;
        this.lastNetworkEventAt = 0;
        this.remoteSyncRev = 0;
        this.remoteSyncTs = 0;
        this.remoteSyncState = 'idle';
        this.remoteCellId = '0_0';

        // Codex pet v2 atlas runtime state. The imported monster sheets have an
        // authored seventh idle frame even though other v2 packages may use six.
        this.usesV2Atlas = false;
        this.atlasColumns = 1;
        this.atlasRows = 1;
        this.atlasFrameWidth = 0;
        this.atlasFrameHeight = 0;
        this.atlasRowMap = {
            idle: 0,
            moveRight: 1,
            moveLeft: 2,
            ...(this.spriteSheetDefinition?.rowMap || {})
        };
        const configuredFrameCounts = this.spriteSheetDefinition?.frameCounts || {};
        this.atlasFrameCounts = {
            [this.atlasRowMap.idle]: Math.max(1, Number(configuredFrameCounts.idle || 7)),
            [this.atlasRowMap.moveRight]: Math.max(1, Number(configuredFrameCounts.moveRight || 8)),
            [this.atlasRowMap.moveLeft]: Math.max(1, Number(configuredFrameCounts.moveLeft || 8))
        };
        this.animationRow = this.atlasRowMap.idle;
        this.lastHorizontalFacing = 1;

        // Specific Skill Cooldowns (Legacy Support)
        this.missileCooldown = 0;
        this.missileMaxCooldown = 5000;
        this.chargeCooldown = 0;
        this.chargeOnly = !!(definition.chargeOnly || this.behavior.chargeOnly || chargeConfig.only === true);
        this.chargeEnabled = !!(
            this.chargeOnly
            || definition.chargeEnabled === true
            || this.behavior.chargeEnabled === true
            || chargeConfig.enabled === true
        );
        this.chargeRange = Number.isFinite(Number(chargeConfig.range))
            ? Math.max(80, Number(chargeConfig.range))
            : null;
        this.chargeCooldownMs = Number.isFinite(Number(chargeConfig.cooldownMs))
            ? Math.max(500, Number(chargeConfig.cooldownMs))
            : null;
        this.minChargeDistance = Number.isFinite(Number(chargeConfig.minDistance))
            ? Math.max(0, Number(chargeConfig.minDistance))
            : null;
        this.chargeCastSeconds = Number.isFinite(Number(chargeConfig.castSeconds))
            ? Math.max(0.2, Number(chargeConfig.castSeconds))
            : 1.0;
        this.chargeSpeed = Number.isFinite(Number(chargeConfig.speed))
            ? Math.max(80, Number(chargeConfig.speed))
            : 300;
        this.chargeDamage = Number.isFinite(Number(chargeConfig.damage))
            ? Math.max(1, Number(chargeConfig.damage))
            : (Number.isFinite(Number(definition.chargeDamage))
                ? Math.max(1, Number(definition.chargeDamage))
                : null);
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
    static spriteLoadPromises = {};

    _getConfiguredAtlasLayout() {
        const configured = this.spriteSheetDefinition || {};
        return {
            columns: Number(configured.columns || 8),
            rows: Number(configured.rows || 11),
            frameWidth: Number(configured.frameWidth || 192),
            frameHeight: Number(configured.frameHeight || 208)
        };
    }

    _applySpriteCacheEntry(entry) {
        if (!entry) {
            this.sprite = null;
            return;
        }

        // Backward compatibility for cache entries created by the legacy
        // directory-frame path before atlas metadata was added.
        if (entry instanceof Sprite || !entry.sprite) {
            this.sprite = entry;
            this.usesV2Atlas = entry?.cols === 8 && entry?.rows === 11;
            if (this.usesV2Atlas) {
                this.atlasColumns = entry.cols;
                this.atlasRows = entry.rows;
                this.atlasFrameWidth = entry.sw;
                this.atlasFrameHeight = entry.sh;
            }
            return;
        }

        this.sprite = entry.sprite;
        this.usesV2Atlas = !!entry.usesV2Atlas;
        if (entry.atlas) {
            this.atlasColumns = entry.atlas.columns;
            this.atlasRows = entry.atlas.rows;
            this.atlasFrameWidth = entry.atlas.frameWidth;
            this.atlasFrameHeight = entry.atlas.frameHeight;
        }
    }

    _buildSingleFileSpriteEntry(img) {
        const layout = this._getConfiguredAtlasLayout();
        const matchesAtlas = img.width === layout.columns * layout.frameWidth
            && img.height === layout.rows * layout.frameHeight;
        const explicitlyV2 = this.spriteVersionNumber === 2 || !!this.spriteSheetDefinition;
        const isCanonicalV2 = img.width === 1536 && img.height === 2288;

        if (matchesAtlas && (explicitlyV2 || isCanonicalV2)) {
            return {
                sprite: new Sprite(img, layout.columns, layout.rows),
                usesV2Atlas: true,
                atlas: layout
            };
        }

        if (explicitlyV2) {
            Logger.warn(
                `[Monster] Invalid v2 atlas dimensions for ${this.assetPath}: `
                + `${img.width}x${img.height}, expected `
                + `${layout.columns * layout.frameWidth}x${layout.rows * layout.frameHeight}.`
            );
            // Never squeeze a malformed atlas into one frame: that would make
            // every cell appear at once. A neutral placeholder is safer and
            // makes the asset contract violation immediately visible in logs.
            return null;
        }

        const targetW = 256;
        const targetH = 256;
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetW;
        finalCanvas.height = targetH;
        const finalCtx = finalCanvas.getContext('2d');
        this.processAndDrawFrame(img, finalCtx, 0, 0, targetW, targetH);
        return {
            sprite: new Sprite(finalCanvas, 1, 1),
            usesV2Atlas: false,
            atlas: null
        };
    }

    async init(path) {
        if (!path) path = 'assets/resource/monster_slime'; // v2.3.5: Fixed typo and removed leading slash
        const frames = ['1.webp', '2.webp', '3.webp', '4.webp', '5.webp'];
        const cacheKey = path;

        // Check Cache
        if (Monster.spriteCache[cacheKey]) {
            this._applySpriteCacheEntry(Monster.spriteCache[cacheKey]);
            this.ready = true;
            return;
        }

        const targetW = 256;
        const targetH = 256;

        // Support both single file and directory logic
        const isSingleFile = path.toLowerCase().endsWith('.webp') || path.toLowerCase().endsWith('.png');

        if (isSingleFile) {
            if (!Monster.spriteLoadPromises[cacheKey]) {
                Monster.spriteLoadPromises[cacheKey] = new Promise((resolve) => {
                    const img = new Image();
                    let v = window.GAME_VERSION;
                    // Fallback if version check failed
                    if (!v || v === 'error' || v === 'unknown') v = Date.now();
                    img.onload = () => resolve(this._buildSingleFileSpriteEntry(img));
                    img.onerror = () => {
                        Logger.warn(`[Monster] Failed to load monster sprite: ${path}`);
                        resolve(null);
                    };
                    img.src = `${path}?v=${v}`;
                });
            }

            try {
                const entry = await Monster.spriteLoadPromises[cacheKey];
                if (entry) Monster.spriteCache[cacheKey] = entry;
                this._applySpriteCacheEntry(entry);
            } finally {
                delete Monster.spriteLoadPromises[cacheKey];
                this.ready = true; // Avoid an infinite loading loop after a failed request.
            }
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
            Monster.spriteCache[cacheKey] = {
                sprite: this.sprite,
                usesV2Atlas: false,
                atlas: null
            }; // Save to cache
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

    _getWorldBounds() {
        const zone = window.game?.zone;
        const currentZone = zone?.currentZone || {};
        const boundaries = currentZone.boundaries || zone?.boundaries || {};
        // ZoneManager normalizes legacy tile-based dimensions on its own fields,
        // so prefer those over the raw definition values in currentZone.
        const zoneWidth = Number(zone?.width ?? currentZone.width ?? 6000);
        const zoneHeight = Number(zone?.height ?? currentZone.height ?? 6000);

        const minX = Number.isFinite(Number(boundaries.minX))
            ? Number(boundaries.minX)
            : (Number.isFinite(Number(boundaries.x)) ? Number(boundaries.x) : 0);
        const minY = Number.isFinite(Number(boundaries.minY))
            ? Number(boundaries.minY)
            : (Number.isFinite(Number(boundaries.y)) ? Number(boundaries.y) : 0);
        const inferredMaxX = Number.isFinite(Number(boundaries.w))
            ? minX + Number(boundaries.w)
            : zoneWidth;
        const inferredMaxY = Number.isFinite(Number(boundaries.h))
            ? minY + Number(boundaries.h)
            : zoneHeight;
        const rawMaxX = Number.isFinite(Number(boundaries.maxX))
            ? Number(boundaries.maxX)
            : inferredMaxX;
        const rawMaxY = Number.isFinite(Number(boundaries.maxY))
            ? Number(boundaries.maxY)
            : inferredMaxY;

        return {
            minX,
            minY,
            maxX: Number.isFinite(rawMaxX) && rawMaxX >= minX ? rawMaxX : Math.max(minX, zoneWidth),
            maxY: Number.isFinite(rawMaxY) && rawMaxY >= minY ? rawMaxY : Math.max(minY, zoneHeight)
        };
    }

    _clampToWorld(x, y) {
        const bounds = this._getWorldBounds();
        return {
            x: Math.max(bounds.minX, Math.min(bounds.maxX, Number.isFinite(x) ? x : this.x)),
            y: Math.max(bounds.minY, Math.min(bounds.maxY, Number.isFinite(y) ? y : this.y))
        };
    }

    _isInsideLeash(x, y) {
        if (!Number.isFinite(this.leashRange)) return true;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
        return Math.hypot(x - this.initialX, y - this.initialY) <= this.leashRange;
    }

    isLowGlareCombatZone() {
        return window.game?.zone?.currentZone?.id === 'zone_4';
    }

    _getActiveFrameCount() {
        if (!this.usesV2Atlas) return Math.max(1, Number(this.frameCount) || 1);
        return Math.max(1, Number(this.atlasFrameCounts[this.animationRow]) || 8);
    }

    _setAtlasAnimationRow(row) {
        if (!this.usesV2Atlas || !Number.isFinite(Number(row))) return;
        const normalizedRow = Math.max(0, Math.min(this.atlasRows - 1, Number(row)));
        if (this.animationRow !== normalizedRow) {
            this.animationRow = normalizedRow;
            this.frame = 0;
            this.timer = 0;
            return;
        }

        const frameCount = this._getActiveFrameCount();
        if (this.frame >= frameCount) this.frame = 0;
    }

    _updateAtlasAnimationFromMovement(previousX, previousY) {
        if (!this.usesV2Atlas) return;

        const movedX = Number(this.x) - Number(previousX);
        const movedY = Number(this.y) - Number(previousY);
        const movementDistance = Math.hypot(movedX, movedY);
        const isGuest = !!window.game?.net && !window.game.net.isHost;
        const targetDx = isGuest && Number.isFinite(this.targetX) ? this.targetX - this.x : 0;
        const targetDy = isGuest && Number.isFinite(this.targetY) ? this.targetY - this.y : 0;
        const targetDistance = Math.hypot(targetDx, targetDy);
        const isMoving = movementDistance > 0.025 || (isGuest && targetDistance > 0.75);

        if (!isMoving) {
            this._setAtlasAnimationRow(this.atlasRowMap.idle);
            return;
        }

        // Position delta is authoritative for the host/solo simulation. Guests
        // additionally use the remaining interpolation delta because their vx/vy
        // are intentionally not part of the compact monster network payload.
        let horizontalHint = Math.abs(movedX) > 0.01 ? movedX : targetDx;
        if (Math.abs(horizontalHint) > 0.01) {
            this.lastHorizontalFacing = horizontalHint > 0 ? 1 : -1;
        }

        const nextRow = this.lastHorizontalFacing < 0
            ? this.atlasRowMap.moveLeft
            : this.atlasRowMap.moveRight;
        this._setAtlasAnimationRow(nextRow);
    }

    _advanceAnimation(dt) {
        const frameDuration = Math.max(0.01, Number(this.frameSpeed) || 0.15);
        this.timer += dt;
        if (this.timer < frameDuration) return;

        // Preserve leftover time so animation cadence remains stable during
        // occasional long frames without skipping into an unused atlas cell.
        this.timer %= frameDuration;
        this.frame = (this.frame + 1) % this._getActiveFrameCount();
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
        this.chargeTimer = Math.max(0.2, Number(this.chargeCastSeconds) || 1.0);
        this.chargeTarget = { x: targetX, y: targetY };
        this.vx = 0;
        this.vy = 0;
        // Optionally play warning sound?
        Logger.log(`[Monster] ${this.id} started charge casting.`);
    }

    _startChargeLandingHazard(x, y) {
        const hazard = this.behavior?.charge?.landingHazard;
        if (!hazard || (window.game?.net && !window.game.net.isHost)) return;
        const payload = {
            id: `${this.id || this.typeId}:landing:${Date.now()}`,
            mechanicId: 'lightning_landing',
            warningMs: 0,
            impactMs: 240,
            persistentMs: Math.max(1000, Number(hazard.durationMs || 5000)),
            tickMs: Math.max(180, Number(hazard.tickMs || 500)),
            damage: Math.max(1, Number(hazard.damage || this.chargeDamage || this.atk)),
            zones: [{ shape: 'circle', x, y, radius: Math.max(24, Number(hazard.radius || 88)) }],
            color: hazard.color || '#facc15',
            secondaryColor: hazard.secondaryColor || '#fff7a8',
            effect: 'lightning_field',
            castVfx: hazard.castVfx || null
        };
        this.startBossTelegraph(payload);
        window.game?.net?.sendMonsterAttack?.(this.id, 'special_telegraph', payload);
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
                const speed = Math.max(80, Number(this.chargeSpeed) || 300);
                this.vx = Math.cos(angle) * speed;
                this.vy = Math.sin(angle) * speed;

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
                const landingX = this.x;
                const landingY = this.y;
                this.chargeState = 'idle';
                this.lastNetworkEventAt = Date.now();
                this.chargeCooldown = Math.max(500, Number(this.chargeCooldownMs) || 15000);
                this.chargeTarget = null;
                this.vx = 0;
                this.vy = 0;
                this._startChargeLandingHazard(landingX, landingY);
            }
            return true;
        }

        return false;
    }

    renderTelegraph(ctx) {
        if (this.isDead || this.chargeState !== 'casting' || !this.chargeTarget) return;

        const screenX = Math.round(this.x);
        const screenY = Math.round(this.y);
        const targetScreenX = Math.round(this.chargeTarget.x); // Assumes static target point in world space? 
        // Wait, render is camera relative? No, ctx is transformed.
        // this.x is world, target.x is world.

        ctx.save();
        const chargeVisual = this.behavior?.charge?.visual || {};
        ctx.fillStyle = chargeVisual.fill || 'rgba(255, 0, 0, 0.3)';
        ctx.strokeStyle = chargeVisual.stroke || 'rgba(255, 0, 0, 0.5)';
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
        if (chargeVisual.effect === 'thunder') {
            ctx.strokeStyle = chargeVisual.spark || '#fff7a8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const step = Math.max(24, dist / 10);
            ctx.moveTo(0, 0);
            for (let x = step; x < dist; x += step) {
                ctx.lineTo(x, ((Math.floor(x / step) % 2) ? -1 : 1) * width * 0.2);
            }
            ctx.lineTo(dist, 0);
            ctx.stroke();
        }

        ctx.restore();
    }

    _getPointFromEntity(entity, fallbackX = this.x, fallbackY = this.y) {
        const width = Number(entity?.width || 0);
        const height = Number(entity?.height || 0);
        const x = Number(entity?.x);
        const y = Number(entity?.y);
        return {
            x: Number.isFinite(x) ? x + (width / 2) : fallbackX,
            y: Number.isFinite(y) ? y + (height / 2) : fallbackY
        };
    }

    _getBossMechanicTargets() {
        const targets = [];
        const seenIds = new Set();
        const net = window.game?.net;
        const addTarget = (player) => {
            if (!player?.id || seenIds.has(player.id)) return;
            if (player.isDead || player.isPaused) return;
            if (Number.isFinite(player.protectedUntil) && player.protectedUntil > Date.now()) return;
            if (this._isProtectedPlayer(player)) return;
            if (player.id !== window.game?.localPlayer?.id && net?.isUserActivelyPresent && !net.isUserActivelyPresent(player.id)) return;
            seenIds.add(player.id);
            targets.push(player);
        };

        if (window.game?.localPlayer && !shouldFreezeForModalUi()) {
            addTarget(window.game.localPlayer);
        }
        window.game?.remotePlayers?.forEach((player) => addTarget(player));
        net?.remotePlayers?.forEach((player, id) => {
            addTarget({
                id: player?.id || id,
                x: Number(player?.x ?? 0),
                y: Number(player?.y ?? 0),
                width: player?.width || 48,
                height: player?.height || 48,
                isDead: Array.isArray(player?.h) ? Number(player.h[0] || 0) <= 0 : !!player?.isDead,
                isPaused: !!player?.isPaused,
                protectedUntil: Number(player?.protectedUntil || 0)
            });
        });
        return targets;
    }

    _getBossMechanicAreaScale(mechanic) {
        const configured = Number(mechanic?.areaScale);
        return Number.isFinite(configured) && configured > 0 ? configured : BOSS_MECHANIC_AREA_SCALE;
    }

    _getBossMechanicDamageScale(mechanic) {
        const configured = Number(mechanic?.damageScale);
        return Number.isFinite(configured) && configured > 0 ? configured : BOSS_MECHANIC_DAMAGE_SCALE;
    }

    _getBossMechanicCastScale(mechanic) {
        const configured = Number(mechanic?.castScale);
        return Number.isFinite(configured) && configured > 0 ? configured : BOSS_MECHANIC_CAST_SCALE;
    }

    _buildBossMechanicZones(mechanic, target) {
        const pattern = mechanic?.pattern || 'circle';
        const origin = { x: Number(this.x), y: Number(this.y) };
        const targetPoint = this._getPointFromEntity(target, origin.x, origin.y);
        const dx = targetPoint.x - origin.x;
        const dy = targetPoint.y - origin.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const nx = dx / distance;
        const ny = dy / distance;
        const px = -ny;
        const py = nx;
        const zones = [];
        const areaScale = this._getBossMechanicAreaScale(mechanic);

        if (pattern === 'line' || pattern === 'parallel_lines') {
            const laneCount = Math.max(1, Math.floor(Number(mechanic.lanes || 1)));
            const laneGap = Math.max(0, Number(mechanic.laneGap || mechanic.width || 80) * areaScale);
            const length = Math.max(distance, Number(mechanic.length || distance) * areaScale);
            const width = Math.max(24, Number(mechanic.width || 80) * areaScale);
            const startOffset = -((laneCount - 1) * laneGap) / 2;
            for (let i = 0; i < laneCount; i += 1) {
                const offset = startOffset + (i * laneGap);
                const x1 = origin.x + (px * offset);
                const y1 = origin.y + (py * offset);
                zones.push({
                    shape: 'line',
                    x1,
                    y1,
                    x2: x1 + (nx * length),
                    y2: y1 + (ny * length),
                    width
                });
            }
            return zones;
        }

        if (pattern === 'circle_cluster') {
            const baseRadius = Number(mechanic.radius || 90);
            const radius = Math.max(24, baseRadius * areaScale);
            const count = Math.max(1, Math.floor(Number(mechanic.count || 5)));
            const ringRadius = Math.max(radius * 1.4, Number(mechanic.ringRadius || baseRadius * 2.35) * areaScale);
            zones.push({ shape: 'circle', x: targetPoint.x, y: targetPoint.y, radius });
            for (let i = 1; i < count; i += 1) {
                const angle = ((i - 1) / Math.max(1, count - 1)) * Math.PI * 2
                    + (Number(mechanic.angleOffset || 0) * Math.PI / 180);
                zones.push({
                    shape: 'circle',
                    x: targetPoint.x + Math.cos(angle) * ringRadius,
                    y: targetPoint.y + Math.sin(angle) * ringRadius,
                    radius
                });
            }
            return zones;
        }

        if (pattern === 'donut') {
            zones.push({
                shape: 'donut',
                x: mechanic.center === 'target' ? targetPoint.x : origin.x,
                y: mechanic.center === 'target' ? targetPoint.y : origin.y,
                innerRadius: Math.max(0, Number(mechanic.innerRadius || 90) * areaScale),
                outerRadius: Math.max(24, Number(mechanic.outerRadius || 220) * areaScale)
            });
            return zones;
        }

        zones.push({
            shape: 'circle',
            x: mechanic.center === 'boss' ? origin.x : targetPoint.x,
            y: mechanic.center === 'boss' ? origin.y : targetPoint.y,
            radius: Math.max(24, Number(mechanic.radius || 120) * areaScale)
        });
        return zones;
    }

    _buildBossTelegraphPayload(mechanic, target) {
        const zones = this._buildBossMechanicZones(mechanic, target)
            .filter((zone) => zone && typeof zone.shape === 'string');
        if (zones.length === 0) return null;

        const damageMultiplier = Number(mechanic.damageMultiplier || 1) * this._getBossMechanicDamageScale(mechanic);
        const damage = Math.max(1, Math.ceil((this.atk || 10) * damageMultiplier));
        this.bossTelegraphSerial += 1;
        return {
            id: `${this.id || this.typeId}:${mechanic.id || 'boss_mechanic'}:${this.bossTelegraphSerial}`,
            mechanicId: mechanic.id || 'boss_mechanic',
            label: mechanic.label || '',
            warningMs: Math.max(350, Number(mechanic.warningMs || 1000) * this._getBossMechanicCastScale(mechanic)),
            impactMs: Math.max(120, Number(mechanic.impactMs || 320)),
            damage,
            zones,
            color: mechanic.color || this.bossEffects.auraColor || '#f97316',
            secondaryColor: mechanic.secondaryColor || this.bossEffects.secondaryColor || '#fff7ed',
            effect: mechanic.effect || 'arcane',
            castVfx: mechanic.castVfx || this.bossEffects.castVfx || null,
            persistentMs: Math.max(0, Number(mechanic.persistentMs || 0)),
            tickMs: Math.max(180, Number(mechanic.tickMs || 500))
        };
    }

    _tryStartBossMechanic(dt, target) {
        if (!this.isBoss || this.isDead || this.chargeState !== 'idle') return;
        if (!Array.isArray(this.bossMechanics) || this.bossMechanics.length === 0) return;
        if (this.activeBossTelegraphs.length > 0) return;
        if (window.game?.net && !window.game.net.isHost) return;
        if (!target || target.isDead || this._isProtectedPlayer(target)) return;

        for (const mechanic of this.bossMechanics) {
            if (!mechanic?.id) continue;
            if (!this.bossMechanicCooldowns.has(mechanic.id)) {
                const initial = Number.isFinite(Number(mechanic.initialCooldownMs))
                    ? Number(mechanic.initialCooldownMs)
                    : Math.max(1200, Number(mechanic.cooldownMs || 6000) * 0.45);
                this.bossMechanicCooldowns.set(mechanic.id, initial);
            }

            const nextCooldown = Math.max(0, Number(this.bossMechanicCooldowns.get(mechanic.id) || 0) - (dt * 1000));
            this.bossMechanicCooldowns.set(mechanic.id, nextCooldown);
            if (nextCooldown > 0) continue;

            const targetPoint = this._getPointFromEntity(target);
            const range = Math.max(120, Number(mechanic.range || this.aggroRange || 600) * this._getBossMechanicAreaScale(mechanic));
            if (Math.hypot(targetPoint.x - this.x, targetPoint.y - this.y) > range) continue;

            const payload = this._buildBossTelegraphPayload(mechanic, target);
            if (!payload) continue;

            this.startBossTelegraph(payload);
            if (window.game?.net?.isHost) {
                window.game.net.sendMonsterAttack(this.id, 'boss_telegraph', payload);
            }
            this.bossMechanicCooldowns.set(mechanic.id, Math.max(1000, Number(mechanic.cooldownMs || 7000)));
            break;
        }
    }

    startBossTelegraph(payload) {
        if (this.isDead || !payload) return;
        const id = String(payload.id || `${this.id || this.typeId}:boss_telegraph:${Date.now()}`);
        const now = Date.now();
        this.seenBossTelegraphIds?.forEach((seenAt, seenId) => {
            if (now - seenAt > 12000) this.seenBossTelegraphIds.delete(seenId);
        });
        if (this.seenBossTelegraphIds?.has(id)) return;
        if (this.activeBossTelegraphs.some((telegraph) => telegraph.id === id)) return;
        const zones = Array.isArray(payload.zones) ? payload.zones : [];
        if (zones.length === 0) return;

        this.seenBossTelegraphIds.set(id, now);
        this.activeBossTelegraphs.push({
            id,
            mechanicId: String(payload.mechanicId || 'boss_telegraph'),
            label: String(payload.label || ''),
            warningMs: Math.max(350, Number(payload.warningMs || 1000)),
            impactMs: Math.max(120, Number(payload.impactMs || 320)),
            damage: Math.max(1, Number(payload.damage || this.atk || 10)),
            zones,
            color: String(payload.color || this.bossEffects.auraColor || '#f97316'),
            secondaryColor: String(payload.secondaryColor || this.bossEffects.secondaryColor || '#fff7ed'),
            effect: String(payload.effect || 'arcane'),
            castVfx: payload.castVfx && typeof payload.castVfx === 'object' ? payload.castVfx : null,
            persistentMs: Math.max(0, Number(payload.persistentMs || 0)),
            tickMs: Math.max(180, Number(payload.tickMs || 500)),
            nextDamageMs: Math.max(0, Number(payload.warningMs || 0)),
            elapsedMs: 0,
            resolved: false,
            hitTargetIds: new Set()
        });
        this.lastNetworkEventAt = Date.now();
    }

    _startSpecialTelegraph(skill, target) {
        const data = skill?.data || {};
        const payload = this._buildBossTelegraphPayload({
            id: skill.id,
            label: data.label || '',
            pattern: data.pattern || 'line',
            width: data.width || 70,
            length: data.length || 420,
            radius: data.radius || 90,
            warningMs: data.warningMs || 800,
            impactMs: data.impactMs || 280,
            damageMultiplier: data.damageMultiplier || 1,
            areaScale: 1,
            damageScale: 1,
            castScale: 1,
            color: data.color || '#59d9ff',
            secondaryColor: data.secondaryColor || '#e6fbff',
            effect: data.effect || 'arcane',
            castVfx: data.castVfx || null,
            persistentMs: data.persistentMs || 0,
            tickMs: data.tickMs || 500
        }, target);
        if (!payload) return;
        this.startBossTelegraph(payload);
        window.game?.net?.sendMonsterAttack?.(this.id, 'special_telegraph', payload);
    }

    startShadowAmbush(payload) {
        if (!payload || this.isDead) return;
        const id = String(payload.id || `${this.id}:ambush:${Date.now()}`);
        if (this.shadowAmbush?.id === id) return;
        const castMs = Math.max(500, Number(payload.castMs || 1000));
        this.shadowAmbush = {
            id,
            targetId: String(payload.targetId || ''),
            toX: Number(payload.toX || this.x),
            toY: Number(payload.toY || this.y),
            damage: Math.max(1, Number(payload.damage || this.atk || 10)),
            castMs,
            elapsedMs: 0,
            resolved: false
        };
        this.vx = 0;
        this.vy = 0;
        this.lastNetworkEventAt = Date.now();
    }

    _updateShadowAmbush(dt) {
        const ambush = this.shadowAmbush;
        if (!ambush) return false;
        ambush.elapsedMs += Math.max(0, dt * 1000);
        this.vx = 0;
        this.vy = 0;
        if (ambush.elapsedMs < ambush.castMs || ambush.resolved) return true;
        ambush.resolved = true;
        this.x = ambush.toX;
        this.y = ambush.toY;
        if (!window.game?.net || window.game.net.isHost) {
            const target = this._getBossMechanicTargets().find((player) => player.id === ambush.targetId);
            if (target && !this._isProtectedPlayer(target)) {
                const meta = { source: 'shadow_ambush', monsterId: this.id, monsterType: this.typeId };
                if (window.game?.net) window.game.net.sendPlayerDamage(target.id, ambush.damage, 'confusion', 3, 0, meta);
                else target.takeDamage?.(ambush.damage, false, false, this.x, this.y, null, 'confusion', 3, 0);
            }
        }
        this.shadowAmbush = null;
        this.lastNetworkEventAt = Date.now();
        return true;
    }

    _distancePointToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq <= 0.0001) return Math.hypot(px - x1, py - y1);
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
        const closestX = x1 + (t * dx);
        const closestY = y1 + (t * dy);
        return Math.hypot(px - closestX, py - closestY);
    }

    _isPointInsideBossTelegraphZone(point, radius, zone) {
        if (!point || !zone) return false;
        if (zone.shape === 'circle') {
            return Math.hypot(point.x - zone.x, point.y - zone.y) <= (Number(zone.radius || 0) + radius);
        }
        if (zone.shape === 'donut') {
            const dist = Math.hypot(point.x - zone.x, point.y - zone.y);
            return dist >= Math.max(0, Number(zone.innerRadius || 0) - radius)
                && dist <= Number(zone.outerRadius || 0) + radius;
        }
        if (zone.shape === 'line') {
            return this._distancePointToSegment(
                point.x,
                point.y,
                Number(zone.x1 || 0),
                Number(zone.y1 || 0),
                Number(zone.x2 || 0),
                Number(zone.y2 || 0)
            ) <= (Math.max(1, Number(zone.width || 1)) / 2) + radius;
        }
        return false;
    }

    _isPlayerInsideBossTelegraph(player, telegraph) {
        const point = this._getPointFromEntity(player);
        const radius = Math.max(14, Math.min(Number(player?.width || 48), Number(player?.height || 48)) * 0.32);
        return telegraph.zones.some((zone) => this._isPointInsideBossTelegraphZone(point, radius, zone));
    }

    _applyBossTelegraphDamage(telegraph) {
        const canApplyDamage = !window.game?.net || window.game.net.isHost;
        const isPersistent = Number(telegraph.persistentMs || 0) > 0;
        if (!canApplyDamage || (telegraph.resolved && !isPersistent)) return;
        const damage = Math.max(1, Math.round(Number(telegraph.damage || this.atk || 10)));
        this._getBossMechanicTargets().forEach((player) => {
            if (!player?.id || (!isPersistent && telegraph.hitTargetIds.has(player.id))) return;
            if (!this._isPlayerInsideBossTelegraph(player, telegraph)) return;
            telegraph.hitTargetIds.add(player.id);
            const meta = {
                source: 'boss_telegraph',
                monsterId: this.id,
                monsterType: this.typeId,
                mechanicId: telegraph.mechanicId
            };
            if (window.game?.net?.isHost && window.game.net.connected) {
                window.game.net.sendPlayerDamage(player.id, damage, null, 0, 0, meta);
            } else if (typeof player.takeDamage === 'function') {
                player.takeDamage(damage, false, false, this.x, this.y, null);
            }
        });
        if (!isPersistent) telegraph.resolved = true;
    }

    _updateBossTelegraphs(dt) {
        if (!Array.isArray(this.activeBossTelegraphs) || this.activeBossTelegraphs.length === 0) return;
        const deltaMs = Math.max(0, dt * 1000);
        this.activeBossTelegraphs = this.activeBossTelegraphs.filter((telegraph) => {
            telegraph.elapsedMs += deltaMs;
            if (telegraph.persistentMs > 0) {
                if (telegraph.elapsedMs >= telegraph.warningMs && telegraph.elapsedMs >= telegraph.nextDamageMs) {
                    this._applyBossTelegraphDamage(telegraph);
                    telegraph.nextDamageMs += Math.max(180, Number(telegraph.tickMs || 500));
                }
                return telegraph.elapsedMs < telegraph.warningMs + telegraph.persistentMs;
            }
            if (telegraph.elapsedMs >= telegraph.warningMs) this._applyBossTelegraphDamage(telegraph);
            return telegraph.elapsedMs < telegraph.warningMs + telegraph.impactMs;
        });
    }

    _drawBossTelegraphCircle(ctx, zone, telegraph, progress, impactProgress, lowGlareCombat) {
        const radius = Math.max(1, Number(zone.radius || 1));
        const impact = telegraph.elapsedMs >= telegraph.warningMs;
        const alphaScale = lowGlareCombat ? 0.62 : 1;
        ctx.save();
        ctx.globalAlpha = alphaScale * (impact ? 0.24 * (1 - impactProgress) : 0.08 + progress * 0.1);
        ctx.fillStyle = telegraph.color;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = alphaScale * (impact ? 0.7 * (1 - impactProgress) : 0.48 + progress * 0.28);
        ctx.strokeStyle = impact ? telegraph.secondaryColor : telegraph.color;
        ctx.lineWidth = impact ? 5 : 3;
        ctx.shadowColor = telegraph.color;
        ctx.shadowBlur = lowGlareCombat ? 0 : (impact ? 14 : 7);
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, radius * (impact ? 1 + impactProgress * 0.08 : 0.86 + progress * 0.14), 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = alphaScale * (impact ? 0.42 * (1 - impactProgress) : 0.32);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, Math.max(4, radius * 0.68), 0, Math.PI * 2);
        ctx.stroke();
        if (telegraph.effect === 'lightning_field' && telegraph.elapsedMs >= telegraph.warningMs) {
            const phase = Math.floor(telegraph.elapsedMs / 90);
            ctx.globalAlpha = alphaScale * 0.72;
            ctx.strokeStyle = telegraph.secondaryColor;
            ctx.lineWidth = 2;
            ctx.shadowBlur = lowGlareCombat ? 0 : 10;
            ctx.beginPath();
            for (let i = 0; i < 8; i += 1) {
                const angle = (i / 8) * Math.PI * 2;
                const inner = radius * 0.22;
                const outer = radius * (0.72 + ((phase + i) % 3) * 0.07);
                ctx.moveTo(zone.x + Math.cos(angle) * inner, zone.y + Math.sin(angle) * inner);
                ctx.lineTo(zone.x + Math.cos(angle + 0.1) * outer, zone.y + Math.sin(angle + 0.1) * outer);
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawBossTelegraphLine(ctx, zone, telegraph, progress, impactProgress, lowGlareCombat) {
        const x1 = Number(zone.x1 || 0);
        const y1 = Number(zone.y1 || 0);
        const x2 = Number(zone.x2 || x1);
        const y2 = Number(zone.y2 || y1);
        const width = Math.max(1, Number(zone.width || 1));
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.max(1, Math.hypot(dx, dy));
        const angle = Math.atan2(dy, dx);
        const impact = telegraph.elapsedMs >= telegraph.warningMs;
        const alphaScale = lowGlareCombat ? 0.6 : 1;

        ctx.save();
        ctx.translate(x1, y1);
        ctx.rotate(angle);
        ctx.globalAlpha = alphaScale * (impact ? 0.24 * (1 - impactProgress) : 0.07 + progress * 0.12);
        ctx.fillStyle = telegraph.color;
        ctx.fillRect(0, -width / 2, length, width);

        ctx.globalAlpha = alphaScale * (impact ? 0.8 * (1 - impactProgress) : 0.52 + progress * 0.22);
        ctx.strokeStyle = impact ? telegraph.secondaryColor : telegraph.color;
        ctx.lineWidth = impact ? 4 : 2.5;
        ctx.shadowColor = telegraph.color;
        ctx.shadowBlur = lowGlareCombat ? 0 : (impact ? 18 : 8);
        ctx.strokeRect(0, -width / 2, length, width);

        if (impact && telegraph.effect === 'thunder') {
            ctx.globalAlpha = alphaScale * 0.78 * (1 - impactProgress);
            ctx.strokeStyle = telegraph.secondaryColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            const step = Math.max(30, length / 12);
            ctx.moveTo(0, 0);
            for (let x = step; x <= length; x += step) {
                const y = ((Math.floor(x / step) % 2) === 0 ? -1 : 1) * width * 0.22;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawBossTelegraphDonut(ctx, zone, telegraph, progress, impactProgress, lowGlareCombat) {
        const innerRadius = Math.max(0, Number(zone.innerRadius || 0));
        const outerRadius = Math.max(innerRadius + 1, Number(zone.outerRadius || innerRadius + 1));
        const impact = telegraph.elapsedMs >= telegraph.warningMs;
        const alphaScale = lowGlareCombat ? 0.58 : 1;
        ctx.save();
        ctx.globalAlpha = alphaScale * (impact ? 0.22 * (1 - impactProgress) : 0.06 + progress * 0.09);
        ctx.fillStyle = telegraph.color;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, outerRadius, 0, Math.PI * 2);
        ctx.arc(zone.x, zone.y, innerRadius, 0, Math.PI * 2, true);
        ctx.fill('evenodd');

        ctx.globalAlpha = alphaScale * (impact ? 0.76 * (1 - impactProgress) : 0.44 + progress * 0.24);
        ctx.strokeStyle = impact ? telegraph.secondaryColor : telegraph.color;
        ctx.lineWidth = impact ? 5 : 3;
        ctx.shadowColor = telegraph.color;
        ctx.shadowBlur = lowGlareCombat ? 0 : (impact ? 16 : 8);
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, outerRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, innerRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    renderBossTelegraphs(ctx) {
        if (!Array.isArray(this.activeBossTelegraphs) || this.activeBossTelegraphs.length === 0) return;
        const lowGlareCombat = this.isLowGlareCombatZone();
        this.activeBossTelegraphs.forEach((telegraph) => {
            const warningMs = Math.max(1, Number(telegraph.warningMs || 1));
            const impactMs = Math.max(1, Number(telegraph.impactMs || 1));
            const progress = Math.max(0, Math.min(1, telegraph.elapsedMs / warningMs));
            const impactProgress = Math.max(0, Math.min(1, (telegraph.elapsedMs - warningMs) / impactMs));
            telegraph.zones.forEach((zone) => {
                if (zone.shape === 'line') {
                    this._drawBossTelegraphLine(ctx, zone, telegraph, progress, impactProgress, lowGlareCombat);
                } else if (zone.shape === 'donut') {
                    this._drawBossTelegraphDonut(ctx, zone, telegraph, progress, impactProgress, lowGlareCombat);
                } else {
                    this._drawBossTelegraphCircle(ctx, zone, telegraph, progress, impactProgress, lowGlareCombat);
                }
            });
        });
    }

    update(dt) {
        // v1.99.9: Hard cap on dt to prevent physics tunneling or explosions during lag
        const safeDt = Math.min(0.1, dt);
        const previousX = Number(this.x);
        const previousY = Number(this.y);
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
            this.activeBossTelegraphs = [];
            this.shadowAmbush = null;
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
            this.renderOffY = Math.sin(Date.now() * 0.01) * 5;
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
        const isAmbushing = this._updateShadowAmbush(safeDt);
        const isCharging = !isAmbushing && this._updateCharge(safeDt);

        if (!this.ready && !isPassive) {
            // v1.99.13: If host, we MUST load assets even if off-screen to run AI pathing
            if (!this.loadingRequested) {
                this.loadingRequested = true;
                this.init(this.assetPath);
            }
            return;
        }

        this.renderOffY = Math.sin(Date.now() * 0.01) * 5;
        this._updateBossTelegraphs(safeDt);

        // 2. Targeting (AI Awareness) - Skip if Charging (already locked)
        if (!isCharging && !isAmbushing) {
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
            const canAcquireTarget = this._isInsideLeash(this.x, this.y);
            if (!isPassive && canAcquireTarget && this.lastAttackerId && candidates.length > 0) {
                const attackedTarget = candidates.find((player) => player?.id === this.lastAttackerId);
                if (
                    attackedTarget
                    && this._isInsideLeash(Number(attackedTarget.x), Number(attackedTarget.y))
                ) {
                    this.targetPlayer = attackedTarget;
                    this.isAggro = true;
                }
            }

            if (!this.targetPlayer && !isPassive && canAcquireTarget && this.spawnGraceTimer <= 0 && candidates.length > 0) {
                let nearest = null;
                let minDist = Infinity;
                candidates.forEach(p => {
                    const dx = p.x - this.x;
                    const dy = p.y - this.y;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    const targetInsideAggro = d <= this.aggroRange;
                    const targetInsideLeash = this._isInsideLeash(Number(p.x), Number(p.y));
                    if (targetInsideAggro && targetInsideLeash && d < minDist) {
                        minDist = d;
                        nearest = p;
                    }
                });
                if (nearest) {
                    this.targetPlayer = nearest;
                    this.isAggro = true;
                }
            }
        }

        // 3. Movement Logic (Host Authority)
        if (window.game?.net?.isHost) {
            if (!isCharging && !isAmbushing) {
                const target = this.targetPlayer;
                let aiVx = 0;
                let aiVy = 0;

                // Base Velocity from AI
                if (isPassive) {
                    aiVx = 0;
                    aiVy = 0;
                } else if (target) {
                    const dist = Math.sqrt((target.x - this.x) ** 2 + (target.y - this.y) ** 2);
                    if (dist > this.attackRange) {
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

                                this.attackCooldown = this.attackCooldownSeconds;
                                this.hitTimer = 0.1;
                            }
                        }
                    }

                    // v2.0: JSON Driven Skill System
                    this._updateSkills(dt, target);
                    this._tryStartBossMechanic(safeDt, target);

                } else {
                    const homeDx = this.initialX - this.x;
                    const homeDy = this.initialY - this.y;
                    const distanceFromHome = Math.hypot(homeDx, homeDy);

                    if (Number.isFinite(this.leashRange) && distanceFromHome > this.leashRange) {
                        // Knockback, separation, or a charge can push a monster
                        // beyond its territory. Stop acquiring players and walk
                        // it home instead of allowing an endless map-wide chase.
                        let returnSpeed = this.speed || 50;
                        if (this.electrocutedTimer > 0) returnSpeed *= (1 - this.slowRatio);
                        aiVx = (homeDx / distanceFromHome) * returnSpeed;
                        aiVy = (homeDy / distanceFromHome) * returnSpeed;
                        this.wanderVx = 0;
                        this.wanderVy = 0;
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
                        const landingX = nextX;
                        const landingY = nextY;
                        this.chargeState = 'idle';
                        this.chargeCooldown = Math.max(500, Number(this.chargeCooldownMs) || 15000);
                        this.chargeTarget = null;
                        this.vx = 0;
                        this.vy = 0;
                        canMove = false;
                        this._startChargeLandingHazard(landingX, landingY);

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

                const clamped = this._clampToWorld(targetX, targetY);
                this.x = clamped.x;
                this.y = clamped.y;
            }

            // Dissipate knockback forces
            this.knockback.vx *= 0.85; // Slightly faster dissipation
            this.knockback.vy *= 0.85;
        } else if (!isAmbushing) {
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

                const clamped = this._clampToWorld(
                    arrived ? this.chargeTarget.x : correctedX,
                    arrived ? this.chargeTarget.y : correctedY
                );
                this.x = clamped.x;
                this.y = clamped.y;
            } else {
                const lerpFactor = this.chargeState === 'casting' ? 0.45 : 0.35; // Snappy
                const clamped = this._clampToWorld(
                    this.x + ((targetX - this.x) * lerpFactor),
                    this.y + ((targetY - this.y) * lerpFactor)
                );
                this.x = clamped.x;
                this.y = clamped.y;
            }
        }

        this._updateAtlasAnimationFromMovement(previousX, previousY);
        this._advanceAnimation(dt);

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
        if (Number(damage) > 0 && window.game?.monsterManager?.isMonsterCombatBlocked?.()) return false;
        const existing = this.statusEffects.find(e => e.type === type);
        if (existing) {
            existing.timer = duration; // Refresh duration
            existing.damage = Math.max(existing.damage, damage);
            if (sourceMeta) existing.sourceMeta = { ...(existing.sourceMeta || {}), ...sourceMeta };
        } else {
            this.statusEffects.push({ type, timer: duration, damage, sourceMeta });
        }
    }

    _rememberDamageContributorLevel(damageMeta = null) {
        const uid = this.lastAttackerId;
        if (!uid) return;
        if (!(this.damageContributorLevels instanceof Map)) {
            this.damageContributorLevels = new Map();
        }

        const localPlayer = window.game?.localPlayer;
        const sceneRemotePlayer = window.game?.sceneManager?.currentScene?.remotePlayers?.get?.(uid);
        const networkRemotePlayer = window.game?.net?.remotePlayers?.get?.(uid);
        const liveLevels = uid === localPlayer?.id
            ? [Number(localPlayer?.level)]
            : [Number(sceneRemotePlayer?.level), Number(networkRemotePlayer?.level)];
        const reportedLevel = Number(damageMeta?.attackerLevel);
        const previousLevel = Number(this.damageContributorLevels.get(uid) || 0);
        const validLevels = [previousLevel, ...liveLevels, reportedLevel]
            .filter((level) => Number.isFinite(level) && level >= 1)
            .map((level) => Math.max(1, Math.min(999, Math.floor(level))));
        if (validLevels.length === 0) return;

        this.damageContributorLevels.set(uid, Math.max(...validLevels));
    }

    takeDamage(amount, triggerFlash = true, isCrit = false, sourceX = null, sourceY = null, damageMeta = null) {
        if (this.isDead || window.game?.monsterManager?.isMonsterCombatBlocked?.()) return false;
        this.lastHitAt = Date.now();
        this.lastNetworkEventAt = this.lastHitAt;
        const suppressTransientEffects = !!window.game?.shouldSuppressTransientWorldEffects?.();
        const lowGlareCombat = this.isLowGlareCombatZone();

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
            this._rememberDamageContributorLevel(damageMeta);
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
        if (triggerFlash && !suppressTransientEffects && !lowGlareCombat) this.hitTimer = 0.2;

        // Damage text for ALL clients
        if (!suppressTransientEffects && amount > 0 && window.game && typeof window.game.addDamageText === 'function') {
            window.game.addDamageText(this.x, this.y - 40, `-${Math.ceil(amount)}`, isCrit ? '#ff9f43' : '#ff4757', isCrit, isCrit ? 'Critical' : null);
        }

        // v2.2: Hit Feedback — Screen Shake on monster hit
        if (!suppressTransientEffects && !lowGlareCombat && amount > 0 && window.game?.camera?.shake) {
            window.game.camera.shake(isCrit ? 8 : 3, isCrit ? 0.2 : 0.1);
        }
        if (!suppressTransientEffects && !lowGlareCombat && isCrit && window.game?.loop?.hitstop) {
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
                    window.game.monsterManager.settleMonsterDeathImmediately?.(this);
                    window.game.monsterManager.recordFieldBossDefeat?.(this);
                    window.game.monsterManager.forceSync(this.id);
                }

                // Play Death Sound
                if (!suppressTransientEffects && this.sounds.die && window.game?.sound) {
                    window.game.sound.playSfx(this.sounds.die);
                }

                // v2.2: Death Feedback — Strong shake for bosses
                if (!suppressTransientEffects && !lowGlareCombat && window.game?.camera?.shake) {
                    const bossShake = Math.max(0, Number(this.bossEffects.shakeIntensity) || 20);
                    const bossDuration = Math.max(0, Number(this.bossEffects.shakeDuration) || 0.5);
                    window.game.camera.shake(this.isBoss ? bossShake : 6, this.isBoss ? bossDuration : 0.2);
                }
                if (!suppressTransientEffects && !lowGlareCombat && this.isBoss && window.game?.loop?.hitstop) {
                    window.game.loop.hitstop(Math.max(0, Number(this.bossEffects.hitstopMs) || 120));
                }

                // v2.3: Tutorial Kill Trigger
                if (window.game?.tutorial) {
                    window.game.tutorial.trigger('kill', { target: this.typeId });
                }
            }
        }
    }

    applyKnockback(vx, vy) {
        const scale = this.isBoss ? 0.1 : 1;
        this.knockback.vx = vx * scale;
        this.knockback.vy = vy * scale;
    }




    applyElectrocuted(duration, ratio) {
        this.electrocutedTimer = Math.max(this.electrocutedTimer || 0, Number(duration) || 1.0);
        this.slowRatio = Math.max(this.slowRatio, Number(ratio) || 0.3);
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
        if (window.game?.net && !['water_cannon', 'shadow_ambush'].includes(skill.id)) {
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
        } else if (skill.id === 'water_cannon') {
            this._startSpecialTelegraph(skill, target);
        } else if (skill.id === 'shadow_ambush') {
            const targetPoint = this._getPointFromEntity(target);
            const dx = targetPoint.x - this.x;
            const dy = targetPoint.y - this.y;
            const length = Math.max(1, Math.hypot(dx, dy));
            const behindDistance = Math.max(56, Number(skill.data?.behindDistance || 92));
            const payload = {
                id: `${this.id || this.typeId}:ambush:${Date.now()}`,
                targetId: target.id,
                toX: targetPoint.x + (dx / length) * behindDistance,
                toY: targetPoint.y + (dy / length) * behindDistance,
                castMs: Math.max(500, Number(skill.data?.castMs || 1050)),
                damage: Math.max(1, Math.ceil((this.atk || 10) * Number(skill.data?.damageMultiplier || 1)))
            };
            this.startShadowAmbush(payload);
            window.game?.net?.sendMonsterAttack?.(this.id, 'shadow_ambush', payload);
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

    _renderBossAura(ctx, x, groundY, renderWidth, renderHeight) {
        if (!this.isBoss || this.isDead) return;

        const effects = this.bossEffects || {};
        const lowGlareCombat = this.isLowGlareCombatZone();
        const auraAlphaScale = lowGlareCombat ? 0.42 : 1;
        const auraColor = effects.auraColor || '#8b5cf6';
        const secondaryColor = effects.secondaryColor || '#fbbf24';
        const particleColor = effects.particleColor || secondaryColor;
        const pulseSpeed = Math.max(0.1, Number(effects.pulseSpeed) || 2.4);
        const ringCount = lowGlareCombat ? 1 : Math.max(1, Math.min(6, Math.round(Number(effects.ringCount) || 2)));
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const phase = (now / 1000) * pulseSpeed;
        const pulse = 1 + Math.sin(phase * Math.PI * 2) * 0.06;
        const radiusX = Math.max(this.width * 0.65, renderWidth * 0.34) * pulse;
        const radiusY = Math.max(8, this.height * 0.1);

        const inheritedAlpha = Number.isFinite(ctx.globalAlpha) ? ctx.globalAlpha : 1;
        ctx.save();

        // Keep the aura separate from the atlas so every authored cell remains
        // intact and is never trimmed or destructively composited at runtime.
        ctx.globalAlpha = inheritedAlpha * 0.09 * auraAlphaScale;
        ctx.fillStyle = auraColor;
        ctx.beginPath();
        ctx.ellipse(
            x,
            groundY - renderHeight * 0.38,
            Math.max(12, renderWidth * 0.34) * pulse,
            Math.max(16, renderHeight * 0.42) * pulse,
            0,
            0,
            Math.PI * 2
        );
        ctx.fill();

        for (let i = 0; i < ringCount; i += 1) {
            const ringPhase = (phase + (i / ringCount)) % 1;
            const expansion = 0.72 + ringPhase * 0.52;
            ctx.globalAlpha = inheritedAlpha * Math.max(0.035, 0.2 * (1 - ringPhase)) * auraAlphaScale;
            ctx.strokeStyle = i % 2 === 0 ? auraColor : secondaryColor;
            ctx.lineWidth = Math.max(1, 3 - i * 0.35);
            ctx.beginPath();
            ctx.ellipse(x, groundY, radiusX * expansion, radiusY * expansion, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        const particleCount = lowGlareCombat ? 2 : Math.max(6, ringCount * 2);
        for (let i = 0; i < particleCount; i += 1) {
            const direction = i % 2 === 0 ? 1 : -1;
            const angle = (i / particleCount) * Math.PI * 2 + phase * 0.75 * direction;
            const orbitX = radiusX * (0.68 + (i % 3) * 0.11);
            const lift = renderHeight * (0.18 + (i % 4) * 0.12);
            const particleX = x + Math.cos(angle) * orbitX;
            const particleY = groundY - lift + Math.sin(angle * 1.7) * radiusY * 0.8;
            const particleSize = 1.8 + ((Math.sin(phase * 4 + i) + 1) * 0.8);

            ctx.globalAlpha = inheritedAlpha * (0.35 + ((Math.sin(phase * 3 + i) + 1) * 0.12)) * auraAlphaScale;
            ctx.fillStyle = i % 2 === 0 ? particleColor : secondaryColor;
            ctx.beginPath();
            ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    _renderBossCastCircle(ctx, x, groundY, renderWidth) {
        if (!this.isBoss || this.isDead) return;
        const castingTelegraph = this.activeBossTelegraphs.find((telegraph) => telegraph.elapsedMs < telegraph.warningMs);
        const charging = this.chargeState === 'casting';
        if (!castingTelegraph && !charging) return;
        const vfx = castingTelegraph?.castVfx || this.bossEffects?.castVfx || {};
        const progress = castingTelegraph
            ? Math.max(0, Math.min(1, castingTelegraph.elapsedMs / Math.max(1, castingTelegraph.warningMs)))
            : Math.max(0, Math.min(1, 1 - (this.chargeTimer / Math.max(0.2, this.chargeCastSeconds || 1))));
        const radius = Math.max(62, renderWidth * Math.max(0.42, Number(vfx.radiusScale || 0.52))) * (0.86 + progress * 0.14);
        ctx.save();
        ctx.globalAlpha = 0.42 + progress * 0.42;
        SkillRenderer.drawMagicCircle(ctx, x, groundY - 4, {
            radiusInner: radius * 0.72,
            radiusOuter: radius,
            color: vfx.color || castingTelegraph?.color || this.bossEffects?.auraColor || '#a78bfa',
            glowColor: vfx.glowColor || castingTelegraph?.secondaryColor || this.bossEffects?.secondaryColor || '#f5f3ff',
            yScale: Math.max(0.28, Math.min(0.72, Number(vfx.yScale || 0.46))),
            rotationSpeed: Number(vfx.rotationSpeed || 0.0024)
        });
        ctx.restore();
    }

    _renderShadowAmbush(ctx) {
        const ambush = this.shadowAmbush;
        if (!ambush || this.isDead) return;
        const progress = Math.max(0, Math.min(1, ambush.elapsedMs / Math.max(1, ambush.castMs)));
        const radius = Math.max(38, this.width * (0.72 + progress * 0.2));
        ctx.save();
        ctx.globalAlpha = 0.28 + progress * 0.34;
        SkillRenderer.drawMagicCircle(ctx, this.x, this.y + this.height * 0.42, {
            radiusInner: radius * 0.68,
            radiusOuter: radius,
            color: '#8b5cf6', glowColor: '#f0abfc', yScale: 0.5, rotationSpeed: -0.0034
        });
        ctx.globalAlpha = 0.36 * (1 - progress);
        ctx.fillStyle = '#6d28d9';
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(8, this.width * 0.4 * (1 - progress)), 0, Math.PI * 2);
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
        const renderWidth = Math.max(1, Number(this.renderWidth) || this.width);
        const renderHeight = Math.max(1, Number(this.renderHeight) || this.height);
        const groundY = drawY + this.height / 2;
        const spriteX = screenX - renderWidth / 2;
        const atlasFrameHeight = Math.max(
            1,
            Number(this.atlasFrameHeight)
                || Number(this.spriteSheetDefinition?.frameHeight)
                || renderHeight
        );
        const contentTop = Math.max(
            0,
            Math.min(atlasFrameHeight, Number(this.spriteContentBounds?.top) || 0)
        );
        const contentBottom = Math.max(
            contentTop,
            Math.min(atlasFrameHeight, Number(this.spriteContentBounds?.bottom) || atlasFrameHeight)
        );
        const groundedAtlasOffset = this.usesV2Atlas && this.alignSpriteContentToGround
            ? ((atlasFrameHeight - contentBottom) / atlasFrameHeight) * renderHeight
            : 0;
        const spriteY = this.usesV2Atlas
            ? groundY - renderHeight + groundedAtlasOffset
            : drawY - renderHeight / 2;
        const hudSpriteTop = this.usesV2Atlas
            ? spriteY + (contentTop / atlasFrameHeight) * renderHeight
            : screenY - renderHeight / 2;

        this.renderBossTelegraphs(ctx);

        // Draw shadow (Grounded)
        const shadowScale = this.isBoss
            ? Math.max(0.25, Number(this.bossEffects.shadowScale) || 1.35)
            : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(
            screenX,
            screenY + this.height / 2,
            this.width / 2 * 0.7 * shadowScale,
            5 * shadowScale,
            0,
            0,
            Math.PI * 2
        );
        ctx.fill();

        const burnEffect = this.statusEffects.find(e => e.type === 'burn');

        // v0.00.43: Render Charge Telegraph (Underneath monster)
        this.renderTelegraph(ctx);

        // Boss presentation stays independent from the authored atlas frames.
        this._renderBossAura(ctx, screenX, groundY, renderWidth, renderHeight);
        this._renderBossCastCircle(ctx, screenX, groundY, renderWidth);
        this._renderShadowAmbush(ctx);

        // Fallback or Sprite Draw
        if (useTrainingDummyRender) {
            this._renderTrainingDummy(ctx, screenX, drawY);
        } else if (this.sprite) {
            const row = this.usesV2Atlas ? this.animationRow : 0;
            this.sprite.draw(ctx, row, this.frame, spriteX, spriteY, renderWidth, renderHeight);
        } else {
            // Loading fallback: avoid a harsh red disk while sprite assets warm up.
            this._renderLoadingPlaceholder(ctx, screenX, drawY);
        }

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

            ctx.fillText('!', screenX, Math.min(screenY - this.height / 2, hudSpriteTop) - 30);
            ctx.restore();
        }

        // Monster Name (back to top - adjusted down by 15px)
        const nameY = Math.min(screenY - this.height / 2, hudSpriteTop) - 5;
        ctx.font = `bold ${this.isBoss ? 16 : 13}px "Outfit", sans-serif`;
        ctx.textAlign = 'center';

        // Black Outline
        ctx.strokeStyle = this.isBoss ? 'rgba(23, 9, 40, 0.95)' : '#000000';
        ctx.lineWidth = this.isBoss ? 4 : 2;
        ctx.strokeText(this.name, screenX, nameY);

        ctx.fillStyle = this.isBoss ? (this.bossEffects.secondaryColor || '#fef3c7') : '#ffffff';
        ctx.shadowColor = this.isBoss ? (this.bossEffects.auraColor || '#8b5cf6') : 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = this.isBoss ? 10 : 4;
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
        if (this.electrocutedTimer > 0 && !this.isDead && !this.isLowGlareCombatZone()) {
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
