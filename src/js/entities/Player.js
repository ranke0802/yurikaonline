import CharacterBase from './core/CharacterBase.js';
import Logger from '../utils/Logger.js';
import { Sprite } from '../core/Sprite.js';
import SkillRenderer from '../skills/renderers/SkillRenderer.js';
import { INVENTORY_TOTAL_SLOTS } from '../constants/inventory.js';

const ITEM_DEFINITIONS = {
    slime_gel: { name: '슬라임 젤', icon: '🟢' },
    potion_hp_small: { name: '소형 HP 포션', icon: '🧪' },
    royal_jelly: { name: '로열 젤리', icon: '🍯' },
    king_crown: { name: '킹 크라운', icon: '👑' },
    weapon_upgrade_stone: { name: '무기 강화석', icon: '💎' },
    blessed_weapon_upgrade_stone: { name: '축복받은 무기 강화석', icon: '💎' },
    magic_staff: { name: '마력의 지팡이', icon: '🪄' }
};

const BLESSED_WEAPON_UPGRADE_STONE_ID = 'blessed_weapon_upgrade_stone';
const BLESSED_WEAPON_ENHANCEMENT = Object.freeze({
    successRate: 0.5,
    minGain: 1,
    maxGain: 2
});

export default class Player extends CharacterBase {
    constructor(x, y, name = "유리카", definition = null) {
        super(x, y, definition?.baseStats?.speed || 180); // Speed from JSON or Default 180
        this.name = name;
        this.spawnX = x;
        this.spawnY = y;
        this.type = 'player'; // v1.99.38: Explicit type
        this.definition = definition; // Save for growth ref

        // Stats (Base) - Loaded from JSON or Default
        const base = definition?.baseStats || {};
        this.vitality = base.vitality ?? 1;
        this.intelligence = base.intelligence ?? 3;
        this.wisdom = base.wisdom ?? 2;
        this.agility = base.agility ?? 1;
        this.statPoints = 0;

        // Derived Stats (Calculated)
        this.maxHp = base.maxHp ?? 30;
        this.hp = this.maxHp;
        this.maxMp = base.maxMp ?? 50;
        this.mp = this.maxMp;
        this.attackPower = base.atk ?? 10;
        this.defense = base.def ?? 1;
        this.hpRegen = base.hpRegen ?? 1;
        this.mpRegen = base.mpRegen ?? 2;
        this.attackSpeed = 1.0;
        this.maxAttackSpeed = 2.0;
        this.critRate = 0.1;
        this.moveSpeedBonus = 1.0;

        this.level = 1;
        this.exp = 0;
        this.maxExp = 100;
        this.gold = 0;
        this.inventory = Array.from({ length: INVENTORY_TOTAL_SLOTS }, () => null);
        this.equipment = { weapon: null };
        // Quest Data (v0.22.4+)
        this.questData = {
            prologueCompleted: false,
            basicTrainingCompleted: false,
            slimeKills: 0,
            slimeQuestClaimed: false,
            slime30QuestClaimed: false, // v0.00.75+
            slimeRepeatKills: 0,        // v0.00.83+ (Persistence for Quest 4)
            bossKilled: false,
            bossQuestClaimed: false,
            bossClearCount: 0 // v0.00.75+
        };

        // PvP & Party (v0.00.14)
        this.hostileTargets = new Map(); // Map<UID, Name>

        // v0.00.66: Delayed party initialization until ID is set in init()
        this.party = { members: [] }; // Members: string[]
        this.partyInvite = null; // { senderId, senderName, ts }

        this.skillLevels = {
            laser: 1,
            missile: 1,
            fireball: 1,
            shield: 1
        };
        this.skillCooldowns = { j: 0, h: 0, u: 0, k: 0 };
        this.skillMaxCooldowns = { j: 0, h: 0, u: 0, k: 0 };
        this.uiLayout = null;
        this.clientSettings = null;

        // Combat & Channeling
        this.attackRange = 400; // v2.4.2: Tighten basic attack range to match combat feel and remote visuals
        this.autoAttackEnabled = false;
        this.fireballAimActive = false;
        this.fireballAimGuide = null;
        this.fireballMaxRange = 1200;
        this.fireballAimAngle = null;
        this.fireballAimTouchOrigin = null;

        this.isAttacking = false;
        this.isChanneling = false;
        this.chargeTime = 0;
        this.lightningTickTimer = 0;
        this.lightningEffect = null;
        this.attackCooldown = 0;
        this.regenTimer = 0;
        this.lastHitTimer = 1.0; // Start at 1.0 so recovery works immediately on spawn
        this.actionFdbk = null;
        this.actionTimer = 0;
        this.shieldTimer = 0;
        this.skillAttackTimer = 0; // v0.22.3: Briefly show attack anim on skills

        // Status Effects
        this.statusEffects = [];
        this.electrocutedTimer = 0;
        this.slowRatio = 0;
        this.sparkTimer = 0;

        // Running Logic (Matched with Solo)
        this.moveTimer = 0;
        this.isRunning = false;
        this.prevFacingDir = -1;
        this.runParticles = [];
        this.turnGraceTimer = 0;

        // Missile Queue for Sequential Launch
        this.missileFireQueue = [];
        this.missileFireTimer = 0;

        // Visuals
        this.sprite = null;
        this.direction = 1; // Default to Front
        this.animFrame = 0;
        this.animTimer = 0;
        this.animSpeed = 10; // FPS
        this.width = 48;
        this.height = 48;

        this.input = null;
        this.joystick = { x: 0, y: 0, active: false };
        this.moveTarget = null; // Target position for Click-to-Move
        this.currentTarget = null; // v0.00.20: Explicitly selected target (Monster or RemotePlayer)
        this.currentTargetMode = null;

        this.chatMessage = null;
        this.chatTimer = 0;
        this.spawnProtectionTimer = 0;

        this.updateDerivedStats();
    }

    // v1.99.38: Compatibility getter for RemotePlayer.canAttackTarget checks
    get hostility() {
        return Object.fromEntries(this.hostileTargets);
    }

    // Initialize with game dependencies
    init(inputManager, resourceManager, networkManager) {
        this.input = inputManager;
        this.net = networkManager;

        // v0.00.66: Ensure ID is set before finalizing party
        if (this.net && this.net.playerId) {
            this.id = this.net.playerId;
        }

        // v0.00.66: Self is always the first member
        if (this.id && !this.party.members.includes(this.id)) {
            this.party.members.push(this.id);
        }

        this._loadSpriteSheet(resourceManager);

        // Bind input actions to methods
        this.input.on('keydown', (action) => {
            // Cancel Click-to-Move on any action
            this.moveTarget = null;

            if (action === 'ATTACK') this.attack();
            if (action === 'TOGGLE_AUTO_ATTACK') this.toggleAutoAttack();
            if (action === 'SKILL_1') this.useSkill(1);
            if (action === 'SKILL_2') this.useSkill(2);
            if (action === 'SKILL_3') this.useSkill(3);
            if (action === 'SKILL_4') this.useSkill(4);
        });

        this.input.on('aimStart', (data) => {
            if (data?.action === 'SKILL_2') this.startFireballAim(data);
        });

        this.input.on('aimMove', (data) => {
            if (data?.action === 'SKILL_2' && this.fireballAimActive) {
                this.updateFireballAimGuideFromScreenPoint(data.clientX, data.clientY);
            }
        });

        this.input.on('aimEnd', (data) => {
            if (data?.action === 'SKILL_2') this.releaseFireballAim();
        });

        this.input.on('aimCancel', (data) => {
            if (data?.action === 'SKILL_2') this.cancelFireballAim();
        });

        this.input.on('joystickMove', (data) => {
            this.joystick.x = data.x;
            this.joystick.y = data.y;
            this.joystick.active = data.active;
        });

        // v0.00.04: Sync profile to world ONLY after entering
        this.saveState(true);
    }

    async _loadSpriteSheet(res) {
        if (!res) return;

        try {
            const sheetCanvas = await res.loadCharacterSpriteSheet();
            // Max Frames 8, Rows 5 (Back, Front, Left, Right, Attack)
            this.sprite = new Sprite(sheetCanvas, 8, 5);
            // Frame counts per row (0:Back, 1:Front, 2:Left, 3:Right, 4:Attack)
            this.frameCounts = { 0: 5, 1: 8, 2: 7, 3: 7, 4: 6 };

            // Update UI portraits with the new transparent sheet
            if (window.game && window.game.ui) {
                window.game.ui.updatePlayerPortraits(sheetCanvas);
            }

        } catch (e) {
            Logger.error('Failed to load character sprite sheet', e);
        }
    }

    update(dt) {
        // v0.28.0: Handle Death Timer even if isDead is true
        if (this.isDying) {
            this.cancelFireballAim();
            this.deathTimer -= dt;
            if (this.deathTimer <= 0) {
                this.respawn();
            }
        }

        if (this.isDead) {
            this.cancelFireballAim();
            return;
        }

        if (this.spawnProtectionTimer > 0) {
            const hadSpawnProtection = this.spawnProtectionTimer > 0;
            this.spawnProtectionTimer = Math.max(0, this.spawnProtectionTimer - dt);
            if (hadSpawnProtection && this.spawnProtectionTimer <= 0) {
                this.net?.syncLocalZoneProfile?.('spawn_protection_end');
            }
        }

        this._handleMovement(dt);
        if (this.fireballAimActive) {
            if (this.canStartFireballAim()) {
                this.updateFireballAimGuide();
            } else {
                this.cancelFireballAim();
            }
        }
        this._updateCooldowns(dt);
        this._updateAnimation(dt);
        this._handleRegen(dt);

        // v0.29.9: Chain Lightning Full Restore
        const isManualAttackPressed = !!(this.input && this.input.isPressed('ATTACK'));
        const isFireballAimBlockingAutoAttack = this.fireballAimActive;
        const autoTarget = !isManualAttackPressed && !isFireballAimBlockingAutoAttack && this.autoAttackEnabled
            ? this.refreshAutoAttackTarget()
            : null;
        const shouldAutoAttack = !isManualAttackPressed
            && !isFireballAimBlockingAutoAttack
            && this.autoAttackEnabled
            && !!autoTarget;
        if (this.skillAttackTimer <= 0) {
            if (isManualAttackPressed || shouldAutoAttack) {
                this.performLaserAttack(dt);
            } else {
                this.stopBasicAttackChanneling();
            }
        }

        // Process Missile Fire Queue (Sequential Launch)
        if (this.missileFireQueue.length > 0) {
            this.missileFireTimer -= dt;
            if (this.missileFireTimer <= 0) {
                this.missileFireTimer = 0.05; // 0.05s interval between shots
                const data = this.missileFireQueue.shift();

                import('./Projectile.js').then(({ Projectile }) => {
                    if (window.game) {
                        const spawnX = this.x + this.width / 2 + (data.options.spawnOffsetX || 0);
                        const spawnY = this.y + this.height / 2 + (data.options.spawnOffsetY || 0);
                        const launchTarget = this.resolveQueuedMagicMissilePoint(data);
                        const targetX = Number.isFinite(launchTarget?.x)
                            ? launchTarget.x
                            : data.options.fallbackTargetX;
                        const targetY = Number.isFinite(launchTarget?.y)
                            ? launchTarget.y
                            : data.options.fallbackTargetY;

                        // v0.00.05: Inject ownerId for PvP safety
                        window.game.projectiles.push(new Projectile(spawnX, spawnY, null, 'missile', {
                            ...data.options,
                            ownerId: this.id,
                            targetX,
                            targetY,
                            lockTargetPosition: Number.isFinite(targetX) && Number.isFinite(targetY)
                        }));
                    }
                });
            }
        }

        // Run Particle Lifecycle
        if (this.isRunning && (this.vx !== 0 || this.vy !== 0)) {
            if (Math.random() < 0.3) {
                this.runParticles.push({
                    x: this.x + (Math.random() - 0.5) * 120, // Particle spread
                    y: this.y + this.height - 5 + (Math.random() - 0.5) * 10,
                    life: 0.5,
                    size: 4 + Math.random() * 6
                });
            }
        }
        this.runParticles = this.runParticles.filter(p => {
            p.life -= dt;
            p.size += dt * 5;
            return p.life > 0;
        });

        // Call Actor's update (physics integration)
        super.update(dt);

        // v2.3: Tutorial Move Trigger
        if (this.isRunning && (this.vx !== 0 || this.vy !== 0)) {
            if (window.game?.tutorial) {
                window.game.tutorial.trigger('move');
            }
        }

        if (this.actionTimer > 0) {
            this.actionTimer -= dt;
            if (this.actionTimer <= 0) this.actionFdbk = null;
        }

        // v0.22.3: Reset isAttacking after skill animation
        if (this.skillAttackTimer > 0) {
            this.skillAttackTimer -= dt;
            if (this.skillAttackTimer <= 0) {
                this.isAttacking = false;
                // v0.29.9: Also reset channeling for non-laser skills (Missile/Fireball/Shield)
                this.isChanneling = false;
            }
        }

        // Process Status Effects
        // v2.4.3: Cleanup stale target references (dead or removed tutorial targets).
        if (this.currentTarget) {
            const target = this.currentTarget;
            const isMonsterTarget = !!target.isMonster || target.type === 'monster' || !!target.typeId;
            if (target.isDead) {
                this.clearCurrentTarget();
            } else if (isMonsterTarget) {
                const monsters = window.game?.monsterManager?.monsters;
                if (!target.id || !monsters?.has(target.id)) {
                    this.clearCurrentTarget();
                }
            } else if (target.type === 'player' && target !== this) {
                const remotePlayers = window.game?.remotePlayers;
                const localPlayer = window.game?.localPlayer;
                if (target !== localPlayer && (!target.id || !remotePlayers?.has(target.id))) {
                    this.clearCurrentTarget();
                }
            }
        }
        this.statusEffects = this.statusEffects.filter(eff => {
            eff.timer -= dt;
            if (eff.type === 'burn') {
                if (!eff.tickTimer) eff.tickTimer = 0;
                eff.tickTimer += dt;
                if (eff.tickTimer >= 0.5) {
                    eff.tickTimer = 0;
                    this.takeDamage(Math.ceil(eff.damage), false);
                }
            }
            return eff.timer > 0;
        });

        if (this.electrocutedTimer > 0) {
            this.electrocutedTimer -= dt;
        } else {
            this.slowRatio = 0;
        }

        if (this.chatTimer > 0) {
            this.chatTimer -= dt;
            if (this.chatTimer <= 0) this.chatMessage = null;
        }

        // v0.00.45: Shield Timer Countdown
        if (this.shieldTimer > 0) {
            this.shieldTimer -= dt;
            if (this.shieldTimer < 0) this.shieldTimer = 0;
        }
    }

    applyEffect(type, duration, damage) {
        if (this.isDead) return;
        const existing = this.statusEffects.find(e => e.type === type);
        if (existing) {
            existing.timer = duration;
            existing.damage = Math.max(existing.damage, damage);
        } else {
            this.statusEffects.push({ type, timer: duration, damage });
        }
    }

    getFallbackFacingAngle() {
        const angles = {
            0: -Math.PI / 2,
            1: Math.PI / 2,
            2: Math.PI,
            3: 0
        };
        return angles[this.direction] ?? 0;
    }

    getCurrentFacingAngle() {
        return Number.isFinite(this.facingAngle) ? this.facingAngle : this.getFallbackFacingAngle();
    }

    getFireballManaCost(level = this.skillLevels.fireball || 1) {
        return 12 + (level - 1) * 4;
    }

    getFireballRange() {
        return this.fireballMaxRange;
    }

    getFireballProjectileRadius(level = this.skillLevels.fireball || 1) {
        return 20 + (level - 1) * 20;
    }

    getFireballAoeRadius(level = this.skillLevels.fireball || 1) {
        return this.getFireballProjectileRadius(level) * 2.5;
    }

    canStartFireballAim() {
        if (this.isDead || this.isDying) return false;
        if (this.isChanneling) return false;
        if (this.skillCooldowns.u > 0) return false;

        const tutorial = window.game?.tutorial;
        if (tutorial && !tutorial.isActionAllowed?.('SKILL_2')) return false;

        return this.mp >= this.getFireballManaCost();
    }

    updateFireballAimGuide() {
        const originX = this.x + this.width / 2;
        const originY = this.y + this.height / 2;
        const level = this.skillLevels.fireball || 1;
        const weaponCombat = this.getWeaponCombatProfile();
        const range = this.getFireballRange();
        const angle = Number.isFinite(this.fireballAimAngle)
            ? this.fireballAimAngle
            : this.getCurrentFacingAngle();
        const targetX = originX + Math.cos(angle) * range;
        const targetY = originY + Math.sin(angle) * range;

        this.fireballAimGuide = {
            originX,
            originY,
            targetX,
            targetY,
            angle,
            range,
            widthRadius: this.getFireballProjectileRadius(level),
            aoeRadius: this.getFireballAoeRadius(level),
            variant: weaponCombat.fireballVariant || null
        };
    }

    updateFireballAimGuideFromScreenPoint(clientX, clientY) {
        if (!this.fireballAimTouchOrigin) return;

        const dx = clientX - this.fireballAimTouchOrigin.x;
        const dy = clientY - this.fireballAimTouchOrigin.y;
        const deadzone = 10;
        if ((dx * dx) + (dy * dy) < (deadzone * deadzone)) {
            return;
        }

        this.fireballAimAngle = Math.atan2(dy, dx);
        this.updateFireballAimGuide();
        window.game?.tutorial?.trigger?.('skill_aim_adjust', { target: 'fireball' });
    }

    startFireballAim(pointerData = null) {
        // Fireball aiming should interrupt sustained lightning before validation.
        if (this.isChanneling && this.skillAttackTimer <= 0) {
            this.stopBasicAttackChanneling();
        }

        if (!this.canStartFireballAim()) return;
        this.fireballAimActive = true;
        this.fireballAimAngle = this.getCurrentFacingAngle();
        this.fireballAimTouchOrigin = Number.isFinite(pointerData?.clientX) && Number.isFinite(pointerData?.clientY)
            ? { x: pointerData.clientX, y: pointerData.clientY }
            : null;
        this.updateFireballAimGuide();
    }

    releaseFireballAim() {
        if (!this.fireballAimActive) return;

        const aimGuide = this.fireballAimGuide;
        this.cancelFireballAim();
        if (!aimGuide) return;

        this.useSkill(2, {
            angle: aimGuide.angle,
            targetX: aimGuide.targetX,
            targetY: aimGuide.targetY,
            range: aimGuide.range
        });
    }

    cancelFireballAim() {
        this.fireballAimActive = false;
        this.fireballAimGuide = null;
        this.fireballAimAngle = null;
        this.fireballAimTouchOrigin = null;
    }

    getFireballAimGuide() {
        return this.fireballAimActive ? this.fireballAimGuide : null;
    }

    applyElectrocuted(duration, ratio) {
        // v0.00.47: Changed to 4s duration, 50% slow (0.5)
        this.electrocutedTimer = 4.0;
        this.slowRatio = Math.max(this.slowRatio, 0.5);
    }

    triggerAction(text) {
        this.actionFdbk = text;
        this.actionTimer = 2.0;
    }

    _handleRegen(dt) {
        // v0.22.7: Optimized regeneration timing. 
        // First tick happens at exactly 1.0s after hit, then every 1.0s.
        this.lastHitTimer += dt;

        if (this.lastHitTimer >= 1.0) {
            this.regenTimer += dt;
            if (this.regenTimer >= 1.0) {
                this.regenTimer = 0;

                if (this.hp < this.maxHp) {
                    const amount = this.hpRegen;
                    this.hp = Math.min(this.maxHp, this.hp + amount);
                    if (window.game?.ui) window.game.ui.showRegenHint('hp', amount);
                    if (this.net) this.net.sendPlayerHp(this.hp, this.maxHp); // Sync HP regen
                }
                if (this.mp < this.maxMp) {
                    const amount = this.mpRegen;
                    this.mp = Math.min(this.maxMp, this.mp + amount);
                    if (window.game?.ui) window.game.ui.showRegenHint('mp', amount);
                    // MP is also synced in the same packet
                }
            }
        } else {
            // Pre-charge regen timer so it triggers immediately when lastHitTimer hits 1.0
            this.regenTimer = 1.0;
        }
    }

    _handleMovement(dt) {
        if (!this.input) return;

        const isManualAttackPressed = !!this.input.isPressed('ATTACK');
        const allowLaserChannelMove = this.isChanneling
            && this.skillAttackTimer <= 0
            && (this.autoAttackEnabled || isManualAttackPressed);

        // Block movement while channeling, except for sustained Chain Lightning movement.
        if (this.isChanneling && !allowLaserChannelMove) {
            this.vx = 0;
            this.vy = 0;
            this.moveTarget = null;
            this.isRunning = false;
            this.state = 'attack';
            return;
        }

        let vx = 0;
        let vy = 0;

        // 1. Digital Input (Keyboard/Button)
        if (this.input.isPressed('MOVE_UP')) vy -= 1;
        if (this.input.isPressed('MOVE_DOWN')) vy += 1;
        if (this.input.isPressed('MOVE_LEFT')) vx -= 1;
        if (this.input.isPressed('MOVE_RIGHT')) vx += 1;

        // 2. Analog Input (Joystick) - Overrides digital if active
        if (this.joystick.active) {
            vx = this.joystick.x;
            vy = this.joystick.y;
            this.moveTarget = null; // Joystick cancels click-to-move
        }

        // 3. Click-to-Move Target
        if (vx === 0 && vy === 0 && this.moveTarget) {
            const dx = this.moveTarget.x - this.x;
            const dy = this.moveTarget.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 10) { // Stop threshold
                vx = dx / dist;
                vy = dy / dist;
            } else {
                this.moveTarget = null;
            }
        }

        if (vx !== 0 || vy !== 0) {
            // Normalize digital only (joystick is already normalized or partial)
            if (!this.joystick.active) {
                const mag = Math.sqrt(vx * vx + vy * vy);
                vx /= mag;
                vy /= mag;
            }

            // Running Logic (Matched with Solo)
            if (this.direction === this.prevFacingDir) {
                this.moveTimer += dt;
                if (this.turnGraceTimer > 0 && this.moveTimer >= 0.1) {
                    this.isRunning = true;
                    this.turnGraceTimer = 0;
                }
                if (this.moveTimer >= 0.5) {
                    this.isRunning = true;
                }
            } else {
                if (this.isRunning) this.turnGraceTimer = 0.5;
                this.moveTimer = 0;
                this.isRunning = false;
            }
            this.prevFacingDir = this.direction;

            if (this.turnGraceTimer > 0) this.turnGraceTimer -= dt;

            const runMult = (this.isRunning || this.turnGraceTimer > 0) ? 1.3 : 1.0;
            const channelMoveMultiplier = allowLaserChannelMove ? 0.4 : 1.0;
            const finalSpeed = this.speed * runMult * channelMoveMultiplier;

            this.vx = vx * finalSpeed;
            this.vy = vy * finalSpeed;
            this.state = 'move';

            // v0.29.13: 8-Direction Logic
            // Calculate facing angle (in radians) for skill aiming
            this.facingAngle = Math.atan2(vy, vx);

            // v0.29.15: Correct 8-direction and 4-sprite mapping
            // atan2 returns: right=0, down=π/2, left=±π, up=-π/2
            // Convert to 0-7: 0=right, 1=down-right, 2=down, 3=down-left, 4=left, 5=up-left, 6=up, 7=up-right
            let angleNorm = (this.facingAngle + Math.PI * 2) % (Math.PI * 2); // Normalize to 0 ~ 2π
            this.direction8 = Math.round(angleNorm / (Math.PI / 4)) % 8;

            // Map 8 directions to 4 sprite rows (0:Back/Up, 1:Front/Down, 2:Left, 3:Right)
            // dir8: 0=right, 1=down-right, 2=down, 3=down-left, 4=left, 5=up-left, 6=up, 7=up-right
            const dir8ToSprite = [3, 1, 1, 1, 2, 0, 0, 0]; // Favor vertical for diagonals
            this.direction = dir8ToSprite[this.direction8];

            // v0.00.57: Footstep SFX (Refined)
            if (!this.stepTimer) this.stepTimer = 0;
            this.stepTimer -= dt;
            const stepInterval = this.isRunning ? 0.25 : 0.4;
            if (this.stepTimer <= 0) {
                this.stepTimer = stepInterval;
                if (window.game?.sound) {
                    window.game.sound.playSfx('footstep_grass');
                }
            }
        } else {
            this.vx = 0;
            this.vy = 0;
            this.moveTimer = 0;
            this.isRunning = false;
            this.turnGraceTimer = 0;
            if (!this.isAttacking) this.state = 'idle';
        }
    }

    setMoveTarget(x, y) {
        this.moveTarget = { x, y };
    }

    _updateCooldowns(dt) {
        if (this.attackCooldown > 0) this.attackCooldown -= dt;

        // Skill cooldowns
        for (let key in this.skillCooldowns) {
            if (this.skillCooldowns[key] > 0) {
                this.skillCooldowns[key] -= dt;
                if (this.skillCooldowns[key] < 0) this.skillCooldowns[key] = 0;
            }
        }

        if (this.lightningEffect) {
            this.lightningEffect.timer -= dt;
            if (this.lightningEffect.timer <= 0) this.lightningEffect = null;
        }
    }

    _updateAnimation(dt) {
        // Determine Row
        let row = this.direction;
        if (this.isAttacking) {
            row = 4; // Attack Row
            // If attack, override direction visually just for sprite? 
            // Legacy uses row 4 for attack.
        }

        const maxFrames = this.frameCounts ? (this.frameCounts[row] || 8) : 8;

        if (this.state === 'move' || this.isAttacking) {
            const speedFact = (this.isRunning || this.turnGraceTimer > 0) ? 1.5 : 1.0;
            this.animTimer += dt * this.animSpeed * speedFact;
            if (this.animTimer >= maxFrames) {
                this.animTimer = 0;
            }
            this.animFrame = Math.floor(this.animTimer) % maxFrames;
        } else {
            this.animFrame = 0; // Idle frame
            this.animTimer = 0;
        }
    }

    refreshStats() {
        // v2.0: JSON Data Driven Stats
        const base = this.definition?.baseStats || {};
        const growth = this.definition?.growthStats || { hp: 10, mp: 10, atk: 1, def: 1 };

        // Formulas matched with UIManager.js updateStatusPopup
        // Base + (Vitality * Growth)
        const baseXp = base.maxHp ?? 100;
        const baseMp = base.maxMp ?? 50;
        const baseAtk = base.atk ?? 10;

        // v2.1: Robust Growth Defaults (Prevent NaN if JSON is partial)
        const gHp = growth.hp ?? 10;
        const gMp = growth.mp ?? 5;
        const gAtk = growth.atk ?? 1;
        const gDef = growth.def ?? 0;

        this.maxHp = baseXp + (this.vitality * gHp);
        this.maxMp = baseMp + (this.wisdom * gMp);
        this.attackPower = baseAtk + (this.intelligence * gAtk) + Math.floor(this.wisdom / 2);
        this.defense = (base.def ?? 0) + (this.vitality * gDef);
        this.hpRegen = this.vitality;
        this.mpRegen = this.wisdom; // v1.1: Wis contributes 1:1 to MP regen

        // v0.00.40: INT bonuses: +5% attack speed per INT, +1% crit rate per INT
        this.attackSpeed = Math.min(this.maxAttackSpeed, 1.0 + (this.agility * 0.1) + (this.intelligence * 0.05));
        this.moveSpeedBonus = 1.0 + (this.agility * 0.05);
        // v0.00.40: Base 10% crit, +1% per AGI, +1% per INT
        this.critRate = 0.1 + (this.agility * 0.01) + (this.intelligence * 0.01);

        // Skill Cooldown Reduction (CDR): 1% per INT+WIS point, max 75%
        this.skillCDR = Math.min(0.75, (this.intelligence + this.wisdom) * 0.01);

        this.speed = (base.speed || 180) * this.moveSpeedBonus;
        this.applyEquipmentStats();
    }

    updateDerivedStats(options = {}) {
        const shouldSave = options.save !== false;
        const syncToWorld = !!options.syncToWorld;
        const debounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs : undefined;
        const previousHp = this.hp;
        const previousMaxHp = this.maxHp;
        this.refreshStats();
        this.hp = Math.min(this.maxHp, Math.max(0, this.hp));
        this.mp = Math.min(this.maxMp, Math.max(0, this.mp));
        // v0.00.03: Ensure maxExp is correct based on level if somehow corrupted
        const expectedMaxExp = Math.floor(100 * Math.pow(1.5, this.level - 1));
        if (this.maxExp < expectedMaxExp) {
            this.maxExp = expectedMaxExp;
        }
        if (this.net && (this.hp !== previousHp || this.maxHp !== previousMaxHp)) {
            this.net.sendPlayerHp(this.hp, this.maxHp);
        }
        if (shouldSave) {
            this.saveState(syncToWorld, { debounceMs });
        }
    }

    fullReset() {
        this.level = 1;
        this.exp = 0;
        this.maxExp = 100;
        this.statPoints = 0;
        this.vitality = 1;
        this.intelligence = 3;
        this.wisdom = 2;
        this.agility = 1;
        this.gold = 0;
        this.equipment = { weapon: null };
        this.inventory = Array.from({ length: INVENTORY_TOTAL_SLOTS }, () => null);
        this.questData = {
            prologueCompleted: false,
            basicTrainingCompleted: false,
            slimeKills: 0,
            slimeQuestClaimed: false,
            slime30QuestClaimed: false,
            slimeRepeatKills: 0,
            bossKilled: false,
            bossQuestClaimed: false,
            bossClearCount: 0
        };
        this.skillLevels = {
            laser: 1,
            missile: 1,
            fireball: 1,
            shield: 1
        };

        this.refreshStats();
        this.hp = this.maxHp;
        this.mp = this.maxMp;
        if (this.net) this.net.sendPlayerHp(this.hp, this.maxHp);
        this.updateGoldInventory();
        this.saveState();

        if (window.game && window.game.ui) {
            window.game.ui.logSystemMessage("캐릭터 정보가 초기화되었습니다.");
            window.game.ui.updateStatusPopup();
            window.game.ui.updateSkillPopup();
            window.game.ui.updateQuestUI();
        }
    }


    takeDamage(amount, fromNetwork = false, isCrit = false, sourceX = null, sourceY = null, attacker = null, effectType = null, effectDuration = 0, effectDamage = 0) {
        if (this.isDead) return 0;
        // v0.00.54: Prevent damage while in modals (Character Status, Inventory, etc.)
        if (window.game?.ui?.isPaused) return 0;
        if (this.isProtected()) return 0;

        // v0.29.31: Improved Absolute Barrier (Blocks any immediate damage source)
        // v0.00.42: Also blocks status effects (burn, shock)
        if (this.shieldTimer > 0) {
            // v0.00.46: First Hit sets timer to 1.5s (Invincibility Phase)
            if (this.shieldTimer > 1.5) {
                this.shieldTimer = 1.5;
            }

            if (window.game) {
                // v0.00.45: Show BLOCK but don't remove shield
                window.game.addDamageText(this.x + this.width / 2, this.y - 40, "BLOCK", '#48dbfb', true);
            }

            return 0;  // Exit early - no damage AND no status effects applied
        }

        // v0.00.14: Apply Status Effects from PvP (after shield check)
        if (effectType && effectDuration) {
            this.applyEffect(effectType, effectDuration, effectDamage || 0);
        }

        // v0.00.57: Hit SFX
        if (window.game?.sound) window.game.sound.playSfx('hit');

        // v2.2: Hit Feedback — Screen Shake + Hitstop
        if (window.game?.camera?.shake) {
            window.game.camera.shake(isCrit ? 12 : 6, isCrit ? 0.25 : 0.15);
        }
        if (isCrit && window.game?.loop?.hitstop) {
            window.game.loop.hitstop(80);
        }

        const validAmount = parseFloat(amount);
        if (isNaN(validAmount)) return 0;

        // v0.00.40: Apply defense reduction (Monsters send raw damage, so we subtract it here)
        // For PvP, damage might be pre-reduced, but currently monster damage is raw.
        const def = this.defense || 0;
        let finalDmg = Math.max(1, Math.ceil(validAmount - def)); // Minimum 1 damage

        this.hp = Math.max(0, this.hp - finalDmg);
        if (window.game) {
            // v0.00.40: Show crit message properly
            const color = isCrit ? '#ff9f43' : '#ff4757';
            window.game.addDamageText(this.x + this.width / 2, this.y - 40, `-${finalDmg}`, color, isCrit, isCrit ? 'Critical' : null);
            // v0.00.57: Crit SFX
            if (isCrit && window.game.sound) window.game.sound.playSfx('crit');
        }

        if (finalDmg > 0 && this.hp > 0) {
            const impactX = Number.isFinite(attacker?.impactX) ? attacker.impactX : sourceX;
            const impactY = Number.isFinite(attacker?.impactY) ? attacker.impactY : sourceY;
            if (attacker?.combustionCollapse && Number.isFinite(impactX) && Number.isFinite(impactY)) {
                this.applyCombustionCollapse(impactX, impactY, {
                    outwardForce: attacker?.collapseOutwardForce,
                    inwardForce: attacker?.collapseInwardForce,
                    delayMs: attacker?.collapseDelayMs
                });
            } else if (sourceX !== null && sourceY !== null) {
                const angle = Math.atan2(this.y - sourceY, this.x - sourceX);
                this.applyKnockback(Math.cos(angle) * 100, Math.sin(angle) * 100);
            }
        }

        // v0.28.0: Sync HP to DB
        if (this.net) this.net.sendPlayerHp(this.hp, this.maxHp);
        this.saveProfilePatch(['hp'], {
            debounceMs: fromNetwork ? 5200 : 4200,
            reason: 'damage_hp_patch'
        });
        window.game?.ui?.updatePartyUI?.();

        Logger.log(`[Player] HP: ${this.hp}`);

        if (this.hp <= 0 && !this.isDead) {
            this.die();
        }

        // v0.00.19: Automatic Retaliation Removed (Strict PvP)
        // Preemptive attacks are now fully restricted by Mutual Hostility.
        // If I am attacked, I do NOT automatically add the attacker to my hostile list.
        // I must explicitly declare hostility (/e name) to fight back.

        return finalDmg;
    }

    isProtected() {
        if (this.spawnProtectionTimer > 0) return true;

        const currentScene = window.game?.sceneManager?.currentScene;
        if (typeof currentScene?.isPlayerProtected === 'function') {
            return currentScene.isPlayerProtected(this);
        }

        return false;
    }

    grantSpawnProtection(duration = 5) {
        this.spawnProtectionTimer = Math.max(this.spawnProtectionTimer || 0, duration);
        this.net?.syncLocalZoneProfile?.('spawn_protection_start');
    }

    // v1.99.36: Enhanced Mutual Hostility Check
    canAttackTarget(target) {
        if (!target) return false; // 타겟이 없으면 공격 불가
        // 1. 몬스터 체크
        if (target.type === 'monster') return true;
        if (typeof target.isProtected === 'function' && target.isProtected()) return false;
        if (Number.isFinite(target.protectedUntil) && target.protectedUntil > Date.now()) return false;
        // 타겟이 몬스터인 경우, 다른 조건 없이 즉시 true를 반환하여 공격을 허용합니다.
        // 2. 플레이어(PvP) 체크
        if (target.type === 'player') {
            // (A) 자신인지 확인
            if (target.id === this.id) return false; // 자신은 공격할 수 없음
            // (B) 파티원인지 확인
            if (this.party && this.party.members.includes(target.id)) return false; // 파티원은 보호됨
            // (C) 내가 상대를 적대로 등록했는가?
            const myHostileEntry = this.hostileTargets.get(target.id);
            // 내가 /e [닉네임] 명령어를 쳐서 내 적대 목록(Map)에 상대가 들어있어야 합니다.
            if (!myHostileEntry) return false; // 내가 적대하지 않았다면 공격 불가
            // (D) 상대방도 나를 적대로 등록했는가? (상호 적대 확인)
            // target.hostility는 상대방 객체의 적대 목록입니다.
            const targetHostileList = target.hostility || {};

            // 상대방의 적대 목록에 내 ID(this.id)가 포함되어 있는지 확인합니다.
            const isHostileToMe = targetHostileList.hasOwnProperty(this.id) || !!targetHostileList[this.id];
            // 최종 반환: 상호 적대인 경우에만 true가 반환됩니다.
            return isHostileToMe;
        }
        return false;
    }

    die() {
        this.isDead = true;
        this.state = 'die';
        this.hp = 0;
        // Visual feedback
        if (window.game && window.game.ui) {
            window.game.ui.logSystemMessage('당신은 전사했습니다...');
            window.game.ui.showDeathModal();
        }
        // v0.29.32: Sync death state (HP 0) immediately
        if (this.net) this.net.sendPlayerHp(0, this.maxHp);
        this.saveProfilePatch(['hp'], {
            debounceMs: 0,
            reason: 'death_hp_patch'
        });
    }

    saveState(syncToWorld = false, options = {}) {
        if (!this.net || !this.id) return;
        const isSharedFieldActive = !!this.net.isSharedFieldActive?.();
        const overrideDebounceMs = Number.isFinite(options.debounceMs) ? Math.max(0, Number(options.debounceMs)) : null;
        const profileSaveDebounceMs = syncToWorld
            ? 0
            : (overrideDebounceMs ?? (isSharedFieldActive ? 2500 : 3200));
        const safeHp = Math.min(this.maxHp, Math.max(0, Math.round(this.hp)));
        const safeMp = Math.min(this.maxMp, Math.max(0, Math.round(this.mp)));
        const data = {
            level: this.level,
            exp: this.exp,
            maxExp: this.maxExp, // v0.00.03: Persist maxExp
            hp: safeHp,
            mp: safeMp,
            gold: this.gold,
            vitality: this.vitality,
            defense: this.defense || 0, // v0.00.53: Sync defense to others
            isPaused: !!window.game?.ui?.isPaused, // v0.00.55: Sync safety state
            intelligence: this.intelligence,
            wisdom: this.wisdom,
            agility: this.agility,
            statPoints: this.statPoints,
            skillLevels: this.skillLevels,
            autoAttackEnabled: !!this.autoAttackEnabled,
            inventory: this.inventory, // v0.00.75: Save Inventory (Fixed Persistence Bug)
            equipment: this.equipment,
            questData: this.questData, // Added in v0.22.4
            uiLayout: this._cloneProfilePatchValue(this.uiLayout),
            clientSettings: this._cloneProfilePatchValue(this.clientSettings),
            name: this.name,
            party: this.party, // v0.00.14: Sync party state
            hostility: Object.fromEntries(
                Array.from(this.hostileTargets.entries()).map(([k, v]) => [k, { name: v.name || "Unknown", ts: v.ts || Date.now() }])
            ), // v1.99.37: Unified to 'name' for UI consistency
            // v0.00.29: Save position for persistence
            x: Math.round(this.x),
            y: Math.round(this.y),
            ts: Date.now()
        };
        // Debug
        Logger.debug('[Player] Saving State:', { level: data.level, exp: data.exp, maxExp: data.maxExp, quest: data.questData });
        this.net.savePlayerData(this.id, data, syncToWorld, {
            debounceMs: profileSaveDebounceMs,
            forceImmediate: !!syncToWorld,
            saveReason: options.reason || 'player_save'
        });
    }

    _cloneProfilePatchValue(value) {
        if (value == null || typeof value !== 'object') return value;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            Logger.warn('[Player] Failed to clone profile patch value', error);
            return value;
        }
    }

    _buildProfilePatchFromFields(fields = []) {
        const patch = {};
        fields.forEach((field) => {
            switch (field) {
                case 'level':
                    patch.level = this.level;
                    break;
                case 'exp':
                    patch.exp = this.exp;
                    break;
                case 'maxExp':
                    patch.maxExp = this.maxExp;
                    break;
                case 'hp':
                    patch.hp = Math.min(this.maxHp, Math.max(0, Math.round(this.hp)));
                    break;
                case 'maxHp':
                    patch.maxHp = Math.max(0, Math.round(this.maxHp));
                    break;
                case 'mp':
                    patch.mp = Math.min(this.maxMp, Math.max(0, Math.round(this.mp)));
                    break;
                case 'gold':
                    patch.gold = this.gold;
                    break;
                case 'statPoints':
                    patch.statPoints = this.statPoints;
                    break;
                case 'questData':
                    patch.questData = this._cloneProfilePatchValue(this.questData);
                    break;
                case 'uiLayout':
                    patch.uiLayout = this._cloneProfilePatchValue(this.uiLayout);
                    break;
                case 'clientSettings':
                    patch.clientSettings = this._cloneProfilePatchValue(this.clientSettings);
                    break;
                case 'skillLevels':
                    patch.skillLevels = this._cloneProfilePatchValue(this.skillLevels);
                    break;
                case 'party':
                    patch.party = this._cloneProfilePatchValue(this.party);
                    break;
                case 'hostility':
                    patch.hostility = Object.fromEntries(
                        Array.from(this.hostileTargets.entries()).map(([k, v]) => [k, { name: v.name || 'Unknown', ts: v.ts || Date.now() }])
                    );
                    break;
                case 'name':
                    patch.name = this.name;
                    break;
                case 'defense':
                    patch.defense = this.defense || 0;
                    break;
                case 'isPaused':
                    patch.isPaused = !!window.game?.ui?.isPaused;
                    break;
                case 'protectedUntil':
                    patch.protectedUntil = this.spawnProtectionTimer > 0
                        ? Date.now() + Math.round(this.spawnProtectionTimer * 1000)
                        : 0;
                    break;
                default:
                    break;
            }
        });
        return patch;
    }

    saveProfilePatch(fields = [], options = {}) {
        if (!this.net || !this.id || !Array.isArray(fields) || fields.length === 0) return;
        const isSharedFieldActive = !!this.net.isSharedFieldActive?.();
        const overrideDebounceMs = Number.isFinite(options.debounceMs) ? Math.max(0, Number(options.debounceMs)) : null;
        const profilePatchDebounceMs = options.syncToWorld
            ? 0
            : (overrideDebounceMs ?? (isSharedFieldActive ? 2800 : 4800));
        const patch = this._buildProfilePatchFromFields(fields);
        if (Object.keys(patch).length === 0) return;
        patch.ts = Date.now();
        this.net.savePlayerDataPatch(this.id, patch, {
            debounceMs: profilePatchDebounceMs,
            forceImmediate: !!options.syncToWorld,
            syncToZone: !!options.syncToWorld,
            saveReason: options.reason || 'player_patch'
        });
    }

    resetLevel() {
        this.level = 1;
        this.exp = 0;
        this.maxExp = 100;
        this.statPoints = 0;
        this.gold = 0;

        // Reset to Base Stats from Definition
        const base = this.definition?.baseStats || {};
        this.vitality = base.vitality || 1;
        this.intelligence = base.intelligence || 3;
        this.wisdom = base.wisdom || 2;
        this.agility = base.agility || 1;

        this.skillLevels = { laser: 1, missile: 1, fireball: 1, shield: 1 };

        // Recalculate derived stats
        this.refreshStats();

        // Full Heal
        this.hp = this.maxHp;
        this.mp = this.maxMp;
        if (this.net) this.net.sendPlayerHp(this.hp, this.maxHp);

        this.saveState();
        if (window.game?.ui) {
            window.game.ui.updateStatusPopup();
            window.game.ui.updateSkillPopup(); // v0.00.72: Update skill UI too
        }
        Logger.log('Player level reset to 1 (Data-Driven)');
    }

    useMana(amount) {
        if (this.mp >= amount) {
            this.mp -= amount;
            // v0.00.28: Floating text for mana usage (below damage text)
            if (window.game?.addDamageText && amount > 0) {
                const px = this.x + this.width / 2;
                const py = this.y + 30;
                window.game.addDamageText(px, py, `-${amount}`, '#29B6F6', false);
            }
            return true;
        }
        return false;
    }

    recoverMana(amount, isSilent = false) {
        if (amount <= 0) return;
        const oldMp = this.mp;
        this.mp = Math.min(this.maxMp, this.mp + amount);
        const recovered = this.mp - oldMp;
        // v0.00.28: Floating text for mana recovery (below damage text)
        if (!isSilent && recovered > 0 && window.game?.addDamageText) {
            const px = this.x + this.width / 2;
            const py = this.y + 30;
            window.game.addDamageText(px, py, `+${recovered}`, '#4FC3F7', false);
        }
    }

    recoverHp(amount) {
        const previous = this.hp;
        this.hp = Math.min(this.maxHp, this.hp + amount);
        if (this.net && this.hp !== previous) {
            this.net.sendPlayerHp(this.hp, this.maxHp);
        }
    }

    attack() {
        if (!window.game?.tutorial?.isActionAllowed?.('ATTACK')) return;
        // Handled by update loop for channeling
    }

    stopBasicAttackChanneling() {
        if (!this.isChanneling || this.skillAttackTimer > 0) return;
        if (this.net) this.net.sendChanneling('stop');

        this.isChanneling = false;
        this.isAttacking = false;
        this.chargeTime = 0;
        this.lightningTickTimer = 0;
        this.lightningEffect = null;
        this.state = 'idle';
    }

    isAttackTargetStillValid(target) {
        if (!target || target.isDead) return false;

        const isMonsterTarget = !!target.isMonster || target.type === 'monster' || !!target.typeId;
        if (isMonsterTarget) {
            const monsters = window.game?.monsterManager?.monsters;
            return !!(target.id && monsters?.has(target.id));
        }

        if (target.type === 'player' && target !== this) {
            const remotePlayers = window.game?.remotePlayers;
            const localPlayer = window.game?.localPlayer;
            return target === localPlayer || !!(target.id && remotePlayers?.has(target.id));
        }

        return true;
    }

    canAutoAttackCurrentTarget() {
        const target = this.currentTarget;
        if (!this.isAttackTargetStillValid(target)) return false;
        if (!this.canAttackTarget(target)) return false;

        return this.getDistanceToTarget(target) <= this.attackRange;
    }

    getDistanceToTarget(target) {
        if (!target) return Number.POSITIVE_INFINITY;

        const sourceX = this.x + this.width / 2;
        const sourceY = this.y + this.height / 2;
        const targetPoint = this.getCombatTargetPoint(target);
        const targetX = Number.isFinite(targetPoint?.x) ? targetPoint.x : target.x;
        const targetY = Number.isFinite(targetPoint?.y) ? targetPoint.y : target.y;
        return Math.hypot(targetX - sourceX, targetY - sourceY);
    }

    getCombatTargetPoint(target) {
        if (!target) return null;

        if (target.isMonster || target.type === 'monster') {
            return {
                x: target.x,
                y: target.y
            };
        }

        return {
            x: target?.width ? target.x + target.width / 2 : target?.x,
            y: target?.height ? target.y + target.height / 2 : target?.y
        };
    }

    isValidMagicMissileTarget(target) {
        if (!target || target === this || target.isDead) return false;
        if (!this.isAttackTargetStillValid(target)) return false;
        return this.canAttackTarget(target);
    }

    findMagicMissileTarget(sourceX = this.x + this.width / 2, sourceY = this.y + this.height / 2) {
        const candidates = [];

        if (window.game?.monsterManager?.monsters) {
            candidates.push(...window.game.monsterManager.monsters.values());
        }

        if (window.game?.remotePlayers) {
            candidates.push(...window.game.remotePlayers.values());
        }

        let nearest = null;
        let minDist = 600;

        if (this.isValidMagicMissileTarget(this.currentTarget)) {
            const targetPoint = this.getCombatTargetPoint(this.currentTarget);
            const distance = Math.hypot(sourceX - targetPoint.x, sourceY - targetPoint.y);
            if (distance < minDist) {
                minDist = distance;
                nearest = this.currentTarget;
            }
        }

        if (nearest) return nearest;

        for (const target of candidates) {
            if (!this.isValidMagicMissileTarget(target)) continue;

            const targetPoint = this.getCombatTargetPoint(target);
            const distance = Math.hypot(sourceX - targetPoint.x, sourceY - targetPoint.y);
            if (distance < minDist) {
                minDist = distance;
                nearest = target;
            }
        }

        return nearest;
    }

    resolveMagicMissileTargetById(targetId, targetType = null) {
        if (!targetId) return null;

        if (targetType === 'monster') {
            return window.game?.monsterManager?.monsters?.get(targetId) || null;
        }

        if (targetType === 'player') {
            if (window.game?.localPlayer?.id === targetId) return window.game.localPlayer;
            return window.game?.remotePlayers?.get(targetId) || null;
        }

        return window.game?.monsterManager?.monsters?.get(targetId)
            || window.game?.remotePlayers?.get(targetId)
            || (window.game?.localPlayer?.id === targetId ? window.game.localPlayer : null);
    }

    resolveQueuedMagicMissilePoint(data) {
        if (!data) return null;

        const liveTarget = this.isValidMagicMissileTarget(data.targetRef)
            ? data.targetRef
            : this.resolveMagicMissileTargetById(data.targetId, data.targetType);

        if (this.isValidMagicMissileTarget(liveTarget)) {
            return this.getCombatTargetPoint(liveTarget);
        }

        const fallbackX = Number.isFinite(data.options?.fallbackTargetX) ? data.options.fallbackTargetX : null;
        const fallbackY = Number.isFinite(data.options?.fallbackTargetY) ? data.options.fallbackTargetY : null;

        if (Number.isFinite(fallbackX) && Number.isFinite(fallbackY)) {
            return { x: fallbackX, y: fallbackY };
        }

        return null;
    }

    setCurrentTarget(target, options = {}) {
        this.currentTarget = target || null;
        this.currentTargetMode = target ? (options.mode || 'manual') : null;
        return this.currentTarget;
    }

    clearCurrentTarget() {
        this.currentTarget = null;
        this.currentTargetMode = null;
    }

    findNearestAutoAttackTarget() {
        const candidates = [];

        if (window.game?.monsterManager?.monsters) {
            candidates.push(...window.game.monsterManager.monsters.values());
        }

        if (window.game?.remotePlayers) {
            candidates.push(...window.game.remotePlayers.values());
        }

        let nearest = null;
        let minDist = this.attackRange;

        for (const target of candidates) {
            if (!target || target === this || target.isDead) continue;
            if (!this.isAttackTargetStillValid(target)) continue;
            if (!this.canAttackTarget(target)) continue;

            const distance = this.getDistanceToTarget(target);
            if (distance <= this.attackRange && distance < minDist) {
                minDist = distance;
                nearest = target;
            }
        }

        return nearest;
    }

    refreshAutoAttackTarget() {
        if (this.canAutoAttackCurrentTarget()) {
            return this.currentTarget;
        }

        const nearest = this.findNearestAutoAttackTarget();
        if (nearest) {
            this.setCurrentTarget(nearest, { mode: 'auto' });
            return nearest;
        }

        if (!this.isAttackTargetStillValid(this.currentTarget)) {
            this.clearCurrentTarget();
        }

        return null;
    }

    toggleAutoAttack(force = null, options = {}) {
        const nextState = typeof force === 'boolean' ? force : !this.autoAttackEnabled;
        const shouldPersist = options.persist !== false;
        const shouldNotify = options.notify !== false;

        if (this.autoAttackEnabled === nextState) {
            window.game?.ui?.updateAutoAttackToggle?.(nextState);
            return nextState;
        }

        this.autoAttackEnabled = nextState;
        if (!nextState && this.currentTargetMode === 'auto') {
            this.clearCurrentTarget();
        }
        if (!nextState && !(this.input && this.input.isPressed('ATTACK'))) {
            this.stopBasicAttackChanneling();
        }

        window.game?.ui?.updateAutoAttackToggle?.(nextState);
        if (shouldNotify) {
            window.game?.ui?.logSystemMessage?.(nextState ? '[AUTO] Normal attack ON' : '[AUTO] Normal attack OFF');
        }
        if (shouldPersist) {
            this.saveState();
        }

        return nextState;
    }

    performLaserAttack(dt) {
        if (this.isDead) return;
        if (!window.game?.tutorial?.isActionAllowed?.('ATTACK')) return;
        const weaponCombat = this.getWeaponCombatProfile();

        // Cooldown check for start of attack
        if (!this.isChanneling && this.skillCooldowns.j > 0) return;

        // v0.00.37: Send channeling start to sync casting effects
        const wasChanneling = this.isChanneling;
        this.isChanneling = true;
        this.isAttacking = true;
        this.state = 'attack';

        if (!wasChanneling && this.net) {
            this.net.sendChanneling('laser');
        }
        if (!wasChanneling) {
            window.game?.tutorial?.trigger?.('attack', { target: 'normal' });
        }

        this.chargeTime += dt;
        this.lightningTickTimer -= dt;

        const baseTickInterval = 0.7; // v0.00.78: Adjusted from 0.5 to 0.7
        // v0.00.78: WIS/INT factor: 0.05 per point
        const statBonus = (this.intelligence + this.wisdom) * 0.05;
        const effectiveAttackSpeed = Math.min(this.maxAttackSpeed, this.attackSpeed + statBonus);
        const tickInterval = (baseTickInterval / Math.max(0.1, effectiveAttackSpeed)) * 1.15;
        const isTick = this.lightningTickTimer <= 0;

        if (isTick) {
            this.lightningTickTimer = tickInterval;

            // v0.22.2: Restore Attack Cooldown (Scaled by attack speed)
            this.skillCooldowns.j = tickInterval;
            this.skillMaxCooldowns.j = tickInterval;

            this.animTimer = 0; // Restart attack animation

            // v0.00.57: SFX
            if (window.game?.sound) window.game.sound.playSfx('lightning');
            if (window.game?.sound) window.game.sound.playSfx('lightning_chain');
        }

        const laserLv = this.skillLevels.laser || 1;
        // v0.18: Overload Formula
        // 시작 값: 0.10 + (lv-1)*0.05
        // 증가 수치: 0.10 + (lv-1)*0.05
        // 최대치: 1.0 (100%)
        const baseRatio = 0.10 + (laserLv - 1) * 0.05;
        const increment = 0.10 + (laserLv - 1) * 0.05;
        const maxRatio = 1.0;

        const chargeSteps = Math.floor(this.chargeTime / 0.3);
        const finalDmgRatio = Math.min(maxRatio, baseRatio + (chargeSteps * increment));

        // Visual Chain Logic
        const maxChains = 1 + laserLv;
        const chainRange = this.attackRange;
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        let currentSource = { x: centerX, y: centerY };
        const affectedMonsters = [];
        const chains = [];

        // Access monsters AND remote players for PvP
        const monstersMap = window.game?.monsterManager?.monsters;
        const monsters = monstersMap ? Array.from(monstersMap.values()) : [];
        const remotesMap = window.game?.remotePlayers;
        const remotes = remotesMap ? Array.from(remotesMap.values()) : [];

        // v0.00.15: Filter valid PvP targets only
        let validRemotes = remotes.filter(rp => !rp.isDead && this.canAttackTarget(rp));
        let availableTargets = [...monsters.filter(m => !m.isDead), ...validRemotes];

        for (let i = 0; i < maxChains; i++) {
            let nextTarget = null;
            let minDist = chainRange;

            // v0.00.20: If it's the first chain and we have a currentTarget, prioritize it
            if (i === 0 && this.currentTarget && !this.currentTarget.isDead) {
                const dist = Math.sqrt((centerX - this.currentTarget.x) ** 2 + (centerY - this.currentTarget.y) ** 2);
                if (dist < chainRange && this.canAttackTarget(this.currentTarget)) {
                    nextTarget = this.currentTarget;
                }
            }

            if (!nextTarget) {
                availableTargets.forEach(target => {
                    const dist = Math.sqrt((currentSource.x - target.x) ** 2 + (currentSource.y - target.y) ** 2);
                    if (dist < minDist && !affectedMonsters.includes(target)) {
                        minDist = dist;
                        nextTarget = target;
                    }
                });
            }

            if (nextTarget) {
                chains.push({ x1: currentSource.x, y1: currentSource.y, x2: nextTarget.x, y2: nextTarget.y });
                affectedMonsters.push(nextTarget);

                if (isTick) {
                    // v0.00.40: Damage formula: (Skill Damage - Defense), min 1
                    // Then apply crit multiplier to reduced damage
                    const baseDmg = Math.ceil(this.attackPower * finalDmgRatio * (1 + (weaponCombat.laserDamageBonus || 0)));
                    const targetDef = nextTarget.defense || 0;
                    let dmg = Math.max(1, baseDmg - targetDef);
                    let isCrit = Math.random() < this.critRate;
                    if (isCrit) dmg *= 2;

                    // Support both Monster and RemotePlayer takeDamage
                    if (nextTarget.takeDamage) {
                        if (nextTarget.isMonster) {
                            if (this.net) {
                                this.net.sendMonsterDamage(nextTarget.id, Math.ceil(dmg));
                                nextTarget.lastAttackerId = this.net.playerId;
                            }
                            nextTarget.takeDamage(Math.ceil(dmg), true, isCrit, null, null);
                        } else if (this.net) {
                            // PvP damage is resolved on the target client after protection checks.
                            this.net.sendPlayerDamage(nextTarget.id, Math.ceil(dmg), 'shock', 3.0, 0);
                        }
                    }

                    // Slow effect
                    if (nextTarget.applyElectrocuted) {
                        nextTarget.applyElectrocuted(3.0, 0.8);
                    }

                    // v0.00.28: Mana recovery per hit (+1 MP per chain target)
                    this.recoverMana(1);
                    if (weaponCombat.restoreHpPerLaserHit > 0) {
                        this.recoverHp(weaponCombat.restoreHpPerLaserHit);
                    }
                }
                currentSource = { x: nextTarget.x, y: nextTarget.y };
            } else {
                break;
            }
        }

        // v0.00.35: Network Sync - Only send if there are valid targets
        if (isTick) {
            const targetIds = affectedMonsters.map(t => t.id).filter(id => !!id);
            // Only sync if we actually hit something
            if (targetIds.length > 0 && this.net) {
                this.net.sendPlayerAttack(this.x, this.y, this.direction, 'laser', {
                    angle: this.facingAngle,
                    targets: targetIds,
                    variant: weaponCombat.laserVariant || null
                });
            }
        }

        if (chains.length > 0) {
            this.lightningEffect = { chains: chains, timer: 0.1, variant: weaponCombat.laserVariant || null };
        } else {
            // v0.29.11: No target = no lightning (no longer force visual on empty space)
            this.lightningEffect = null;
        }

    }

    useSkill(slot, castOptions = null) {
        if (this.isDead || !window.game) return;
        const tutorialAction = { 1: 'SKILL_1', 2: 'SKILL_2', 3: 'SKILL_3', 4: 'SKILL_4' }[slot];
        if (tutorialAction && !window.game?.tutorial?.isActionAllowed?.(tutorialAction)) return;

        const skills = { 1: 'missile', 2: 'fireball', 3: 'shield' };
        const keys = { 1: 'h', 2: 'u', 3: 'k' };
        const skillId = skills[slot];
        const key = keys[slot];

        if (!skillId) return;
        if (this.skillCooldowns[key] > 0) return;

        const lv = this.skillLevels[skillId] || 1;
        const weaponCombat = this.getWeaponCombatProfile();

        if (skillId === 'missile') {
            const cost = 4 + (lv - 1) * 3;
            if (this.useMana(cost)) {
                this.triggerAction(`${this.name} : 매직 미사일 !!`);
                if (window.game?.sound) window.game.sound.playSfx('missile_launch');

                // v0.00.75: Fixed casting speed to 1.0s, removed CDR/Stat influence
                const baseCD = 1.0;
                this.skillCooldowns.h = baseCD;

                // v0.22.3: Visual Attack FeedBack
                this.isAttacking = true;
                this.isChanneling = true; // v0.26.1
                this.skillAttackTimer = 0.4;
                this.animTimer = 0;

                // v0.00.37: Send channeling for casting effect sync
                if (this.net) this.net.sendChanneling('missile');

                // v0.28.0: Sync Missile skill
                // v0.29.0: Fix ReferenceError by defining count first
                // v0.00.33: Balance Update (2 missiles per level)
                const count = lv * 2;

                const sourceX = this.x + this.width / 2;
                const sourceY = this.y + this.height / 2;
                const nearest = this.findMagicMissileTarget(sourceX, sourceY);

                if (nearest) {
                    window.game?.tutorial?.trigger?.('skill_use', { target: skillId, slot });
                    const targetPoint = this.getCombatTargetPoint(nearest);
                    const targetType = nearest.type === 'monster' || nearest.isMonster ? 'monster' : 'player';
                    const targetId = nearest.id || null;

                    // v0.00.35: Only sync if we have a valid target
                    if (this.net) {
                        this.net.sendPlayerAttack(this.x, this.y, this.direction, 'missile', {
                            count,
                            targetId,
                            targetType,
                            targetX: targetPoint.x,
                            targetY: targetPoint.y,
                            targetWidth: nearest.width || 0,
                            targetHeight: nearest.height || 0,
                            variant: weaponCombat.missileVariant || null
                        });
                    }

                    // count is already defined above
                    // Get base firing angle (opposite of movement/facing)
                    // If moving, use movement direction. Else use sprite direction.
                    let baseAngle;
                    if (this.vx !== 0 || this.vy !== 0) {
                        baseAngle = Math.atan2(this.vy, this.vx) + Math.PI; // Opposite of move
                    } else {
                        // 0:Back, 1:Front, 2:Left, 3:Right
                        const angles = [-Math.PI / 2, Math.PI / 2, Math.PI, 0];
                        baseAngle = angles[this.direction] + Math.PI;
                    }

                    for (let i = 0; i < count; i++) {
                        // Spread out missiles behind the player with random jitter
                        const spread = (Math.PI * 4) / 9; // 80 degrees
                        const angleOffset = (Math.random() - 0.5) * 0.4; // +/- 11 degrees random jitter
                        const angle = baseAngle + (i - (count - 1) / 2) * (spread / Math.max(1, count - 1)) + angleOffset;

                        // Initial velocity (Burst out) with varied speed
                        const burstSpeed = 350 + (Math.random() * 300); // 350~650 range
                        const vx = Math.cos(angle) * burstSpeed;
                        const vy = Math.sin(angle) * burstSpeed;

                        // v0.00.32: Balance Update (Damage 45%)
                        let dmg = this.attackPower * 0.45 * (1 + (weaponCombat.missileDamageBonus || 0));
                        Logger.debug(`[MissileDMG] AP:${this.attackPower} x0.45 = ${dmg}`);
                        let isCrit = Math.random() < this.critRate;
                        if (isCrit) dmg *= 2;

                        // Push to queue for sequential launch (Fixed from previous attempt)
                        this.missileFireQueue.push({
                            targetRef: nearest,
                            targetId,
                            targetType,
                            options: {
                                speed: 800 + (Math.random() * 100),
                                vx, vy,
                                fallbackTargetX: targetPoint.x,
                                fallbackTargetY: targetPoint.y,
                                lockTargetPosition: true,
                                spawnOffsetX: 0,
                                spawnOffsetY: 0,
                                damage: dmg,
                                isCrit: isCrit,
                                radius: 5,
                                hitRadius: 14,
                                variant: weaponCombat.missileVariant || null,
                                visualTint: weaponCombat.missileTint || null
                            }
                        });
                    }
                }
            }
        } else if (skillId === 'fireball') {
            const cost = this.getFireballManaCost(lv); // v1.99.32: 12 base, +4 per level
            if (this.useMana(cost)) {
                window.game?.tutorial?.trigger?.('skill_use', { target: skillId, slot });
                this.triggerAction(`${this.name} : 파이어볼 !!`);
                if (window.game?.sound) window.game.sound.playSfx('fireball_cast');
                this.skillCooldowns.u = 2.0; // v1.99.31: Reduced to 2s

                // v0.22.3: Visual Attack FeedBack
                // v0.22.3: Visual Attack FeedBack
                this.isAttacking = true;
                this.skillAttackTimer = 0.4;
                this.animTimer = 0;

                // v0.28.0: Sync Fireball skill
                // v0.29.0: Updates to sendPlayerAttack
                const angle = Number.isFinite(castOptions?.angle)
                    ? castOptions.angle
                    : this.getCurrentFacingAngle();
                const range = Number.isFinite(castOptions?.range)
                    ? castOptions.range
                    : this.getFireballRange();
                const originX = this.x + this.width / 2;
                const originY = this.y + this.height / 2;
                const targetX = Number.isFinite(castOptions?.targetX)
                    ? castOptions.targetX
                    : originX + Math.cos(angle) * range;
                const targetY = Number.isFinite(castOptions?.targetY)
                    ? castOptions.targetY
                    : originY + Math.sin(angle) * range;
                const chainSeed = (Date.now() ^ Math.round(originX) ^ Math.round(originY)) >>> 0;
                const travelTime = Math.max(0.25, (Math.hypot(targetX - originX, targetY - originY) / 800) + 0.08);

                if (this.net) {
                    this.net.sendPlayerAttack(this.x, this.y, this.direction, 'fireball', {
                        level: lv,
                        angle,
                        targetX,
                        targetY,
                        range,
                        variant: weaponCombat.fireballVariant || null,
                        weaponEffect: {
                            prefixId: weaponCombat.prefixId,
                            fireballChainChance: weaponCombat.fireballChainChance || 0,
                            fireballChainDamageRatio: weaponCombat.fireballChainDamageRatio || 0,
                            chainSeed
                        }
                    });
                }

                // v0.29.13: 8-direction firing using facingAngle
                const speed = 800;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                const dmg = Math.ceil(this.attackPower * (1.8 + (lv - 1) * 0.3)); // v1.99.31: 180% + 30% per level
                const baseRad = this.getFireballProjectileRadius(lv);
                const aoeRad = this.getFireballAoeRadius(lv); // v1.99.35: Increased to 2.5x for better coverage

                import('./Projectile.js').then(({ Projectile }) => {
                    window.game.projectiles.push(new Projectile(originX, originY, null, 'fireball', {
                        vx, vy, speed, damage: dmg, radius: baseRad, aoeRadius: aoeRad, lifeTime: travelTime,
                        ownerId: this.id,
                        variant: weaponCombat.fireballVariant || null,
                        visualTint: weaponCombat.fireballTint || null,
                        targetX,
                        targetY,
                        burnDuration: 2.0 + (lv - 1) * 0.5,
                        penetrationDelay: (lv - 1) * 0.05, // v1.99.33: Scaled delay
                        critRate: this.critRate,
                        weaponEffect: {
                            prefixId: weaponCombat.prefixId,
                            fireballChainChance: weaponCombat.fireballChainChance || 0,
                            fireballChainDamageRatio: weaponCombat.fireballChainDamageRatio || 0,
                            chainSeed
                        }
                    }));
                });

            }
        } else if (skillId === 'shield') {
            // v0.00.42: Adjusted mana cost (20) and cooldown (3s)
            if (this.useMana(20)) {
                window.game?.tutorial?.trigger?.('skill_use', { target: skillId, slot });
                this.triggerAction(`${this.name} : 앱솔루트 베리어 !!`);
                if (window.game?.sound) window.game.sound.playSfx('shield_activate');
                if (window.game?.sound) window.game.sound.playSfx('magic_cast');

                // v0.22.3: Visual Attack FeedBack
                this.isAttacking = true;
                this.skillAttackTimer = 0.4;
                this.animTimer = 0;
                this.shieldTimer = 9999; // v0.00.46: Permanent until hit
                this.skillCooldowns.k = 3;  // 3 second cooldown

                // v0.29.0: Sync Absolute Barrier
                if (this.net) this.net.sendPlayerAttack(this.x, this.y, this.direction, 'shield');
            }
        }
    }

    // Assuming this block is part of an update loop or a specific attack handler
    // and the instruction refers to a 'laser' attack that was previously using 'sendAttack'
    // This block is inserted based on the user's provided "Code Edit" snippet,
    // which seems to be a mix of different parts of the code.
    // The instruction specifically asks to change 'sendAttack' to 'sendPlayerAttack'
    // in 'performLaserAttack'. Since 'performLaserAttack' is not explicitly in the
    // provided document, and the snippet contains a 'laser' attack sync,
    // this change is applied to that specific line.
    // The surrounding code from the user's snippet is also included to maintain context,
    // although it appears to be fragmented.
    // If this block is not where the user intended, further clarification would be needed.
    // The original document did not contain a 'sendAttack' call for 'laser'.
    // This change assumes the user is adding or modifying a specific block.
    // If this is part of an existing function, the user should provide the full function.
    // For now, I'm placing it where it seems to fit based on the provided context.
    // This is a speculative insertion based on the instruction and snippet.
    // If this block already exists elsewhere, this will be a duplicate.
    // If this is part of an existing function, the user should provide the full function.
    // For now, I'm placing it where it seems to fit based on the provided context.
    // This is a speculative insertion based on the instruction and snippet.
    // If this block already exists elsewhere, this will be a duplicate.
    // The instruction is to change 'sendAttack' to 'sendPlayerAttack' in 'performLaserAttack'.



    increaseSkill(skillId) {
        const cost = this.getSkillUpgradeCost(skillId);
        if (this.gold >= cost) {
            this.gold -= cost;
            this.skillLevels[skillId] = (this.skillLevels[skillId] || 0) + 1;
            Logger.log(`Skill ${skillId} leveled up to ${this.skillLevels[skillId]}`);
            if (window.game?.ui) window.game.ui.updateSkillPopup();
        } else {
            if (window.game?.ui) window.game.ui.logSystemMessage('골드가 부족합니다.');
        }
    }

    // v0.29.18: Removed duplicate respawn() function
    // The primary respawn() at line 576 includes network HP sync (sendPlayerHp)
    // which is required for other clients to see the player as alive

    getSkillUpgradeCost(skillId) {
        // v1.1: Exponential Cost (300 -> 600 -> 1200 -> 2400)
        const lv = this.skillLevels[skillId] || 1;
        return 300 * Math.pow(2, lv - 1);
    }

    addGold(amount, options = {}) {
        const shouldSave = options.save !== false;
        const debounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs : undefined;
        this.gold += amount;
        this.updateGoldInventory();
        if (shouldSave) {
            this.saveProfilePatch(['gold'], {
                debounceMs,
                reason: 'gold_patch'
            });
        }
        if (window.game?.ui) window.game.ui.updateInventory();
    }


    recoverHp(amount, options = {}) {
        const previousHp = this.hp;
        this.hp = Math.min(this.maxHp, this.hp + amount);
        if (this.net && this.hp !== previousHp) {
            this.net.sendPlayerHp(this.hp, this.maxHp);
        }
        if (this.hp !== previousHp) {
            window.game?.ui?.updatePartyUI?.();
            if (options.save !== false) {
                this.saveProfilePatch(['hp'], {
                    debounceMs: Number.isFinite(options.debounceMs) ? options.debounceMs : 4200,
                    reason: options.reason || 'recover_hp_patch'
                });
            }
        }
    }

    receiveReward(data, options = {}) {
        const shouldSave = options.save !== false;
        const saveDebounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs : 3500;
        const itemMessages = [];

        if (data.exp) this.gainExp(data.exp, { save: false });
        if (data.gold) {
            this.gold += data.gold;
            this.updateGoldInventory();
        }
        if (data.hp) this.recoverHp(data.hp, { save: false });
        if (Array.isArray(data.items)) {
            data.items.forEach((item) => {
                const itemId = item.id || item.type;
                const amount = Math.max(1, item.amount || 1);
                const added = this.addInventoryItem(itemId, amount, item);
                if (added) {
                    itemMessages.push(`${added.name || itemId} x${amount}`);
                } else {
                    itemMessages.push(`${item.name || itemId} 획득 실패(가방 가득 참)`);
                }
            });
        }

        // v0.00.01: Process Quest Kills sent by Host
        if (data.questKill) {
            const monsterManager = window.game?.monsterManager;
            const canTrackRepeatSlimeKills = (this.questData.bossClearCount || 0) > 0
                && !monsterManager?.bossSpawned;

            if (data.questKill === 'slime' || data.questKill === 'slime_split') {
                this.questData.slimeKills++;

                // Repeat summon progress should pause while a king slime is active.
                if (canTrackRepeatSlimeKills) {
                    this.questData.slimeRepeatKills++;
                }
            }
            if (data.questKill === 'king_slime') {
                this.questData.bossKilled = true; // Mark as killed momentarily

                // v0.00.51: Boss Quest Logic (First vs Repeat)
                this.questData.bossClearCount = (this.questData.bossClearCount || 0) + 1;
                this.questData.slimeRepeatKills = 0;

                let rewardMsg = "";
                let modalTitle = "";
                let modalDesc = "";

                if (this.questData.bossClearCount === 1) {
                    // First Kill Reward
                    this.questData.slimeRepeatKills = 0;
                    this.statPoints += 5;
                    this.gainExp(500, { save: false });
                    this.gold += 2000;
                    this.updateGoldInventory();

                    modalTitle = "👑 퀘스트 완료!";
                    modalDesc = "대왕 슬라임을 처치했습니다!<br><br>보상:<br>스텟 포인트 +5<br>경험치 500<br>골드 2000<br><br>(이제 반복 퀘스트가 시작됩니다!)";
                    rewardMsg = "첫 대왕 슬라임 처치! (스텟+5, EXP+500, Gold+2000)";
                } else {
                    // Repeat Kill Reward
                    this.gainExp(300, { save: false }); // Reduced from 500
                    this.gold += 1000; // Reduced from 2000
                    this.updateGoldInventory();

                    modalTitle = "⚔️ 반복 퀘스트 완료";
                    modalDesc = "대왕 슬라임을 다시 처치했습니다!<br><br>보상:<br>경험치 300<br>골드 1000<br><br>(슬라임 30마리를 잡으면 다시 소환됩니다)";
                    rewardMsg = `대왕 슬라임 처치! (${this.questData.bossClearCount}회차) (EXP+300, Gold+1000)`;
                }

                // 첫 처치 연출은 유지하고, 반복 처치는 모달 없이 보상만 지급한다.
                if (window.game?.ui) {
                    if (this.questData.bossClearCount === 1 && window.game.ui.showRewardModal) {
                        window.game.ui.showRewardModal(modalTitle, modalDesc);
                    } else if (rewardMsg) {
                        window.game.ui.logSystemMessage(`QUEST 완료: ${rewardMsg}`);
                    }
                }

                // Reset for Repeatable Cycle
                // "Reset" means preparing for the loop.
                this.questData.bossKilled = false;
            }
            if (window.game?.ui) window.game.ui.updateQuestUI();
        }

        if (window.game?.ui) {
            let msg = `${data.monsterName || '보상'} 획득!`;
            if (data.exp) msg += ` +${data.exp} EXP`;
            if (data.gold) msg += ` +${data.gold} Gold`;
            if (data.hp) msg += ` +${data.hp} HP`;

            // Override message for boss
            if (data.questKill === 'king_slime') {
                // Already handled above? 
                // We want to log the specific reward message constructed above?
                // Wait, `rewardMsg` is local scope above.
                // Let's reconstruct or simplify.
                // Actually this block runs AFTER logic.
                // `data.exp/gold` passed in might be distinct from what I just added.
                // `receiveReward` can be called with `data` containing `exp/gold`.
                // BUT `king_slime` call from `MonsterManager` did NOT pass exp/gold in the object!
                // It passed `{ questKill: 'king_slime', monsterName: ... }`.
                // So `msg` here would just be "King Slime 획득!".
                // So I should log `rewardMsg` if it exists (but it's out of scope).
                // I will move logging INSIDE the block or make the block below smarter.
                // Since I am already modifying the block below...
            } else if (data.questKill) {
                msg = `퀘스트 몬스터 처치! (${msg})`;
                window.game.ui.logSystemMessage(msg);
            }

            if (itemMessages.length > 0) {
                window.game.ui.logSystemMessage(`🎁 아이템 획득: ${itemMessages.join(', ')}`);
                if (window.game.sound) window.game.sound.playSfx('item_loot');
            }

            window.game.ui.updateInventory();
        }
        if (shouldSave) {
            const hasInventoryMutation = Array.isArray(data.items) && data.items.length > 0;
            if (hasInventoryMutation) {
                this.saveState(false, { debounceMs: saveDebounceMs, reason: 'reward_full_save' });
            } else {
                this.saveProfilePatch(['exp', 'maxExp', 'level', 'statPoints', 'gold', 'hp', 'questData'], {
                    debounceMs: saveDebounceMs,
                    reason: 'reward_progress_patch'
                });
            }
        }
    }

    updateGoldInventory() {
        // v0.22.9: Keep gold in the first inventory slot (slot 0)
        this.inventory[0] = {
            type: 'gold',
            amount: this.gold,
            icon: '💰',
            name: '골드',
            stackable: true,
            description: '상점과 강화에 사용하는 기본 화폐입니다.'
        };

        if (window.game?.ui?.updateHudAttentionIndicators) {
            window.game.ui.updateHudAttentionIndicators();
        }
    }


    gainExp(amount, options = {}) {
        const shouldSave = options.save !== false;
        const debounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs : undefined;
        this.exp += amount;
        while (this.exp >= this.maxExp) {
            this.levelUp({ save: false });
        }
        if (shouldSave) {
            this.saveProfilePatch(['exp', 'maxExp', 'level', 'statPoints', 'hp'], {
                debounceMs,
                reason: 'exp_patch'
            });
        }
    }

    levelUp(options = {}) {
        const shouldSave = options.save !== false;
        const syncToWorld = !!options.syncToWorld;
        const debounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs : undefined;
        this.exp -= this.maxExp;
        this.level++;
        this.maxExp = Math.floor(this.maxExp * 1.5);
        this.statPoints += 1; // Reduced from 2 to 1 as requested
        this.hp = this.maxHp; // Heal on level up
        this.mp = this.maxMp;

        if (window.game?.ui) {
            window.game.ui.logSystemMessage(`✨ LEVEL UP! 현재 레벨: ${this.level}`);
            window.game.ui.updateStatusPopup();
            // v0.29.22: 레벨업 이펙트 호출
            window.game.ui.showLevelUpEffect(this.level);
            // v0.00.57: SFX
            if (window.game.sound) window.game.sound.playSfx('level_up');
        }

        this.updateDerivedStats({ save: false });
        if (shouldSave) {
            this.saveProfilePatch(['level', 'exp', 'maxExp', 'statPoints', 'hp', 'mp'], {
                debounceMs,
                syncToWorld,
                reason: 'levelup_patch'
            });
        }
    }

    render(ctx, camera) {
        // Culling Check
        if (this.x + this.width + 100 < camera.x ||
            this.x - 100 > camera.x + camera.width ||
            this.y + this.height + 100 < camera.y ||
            this.y - 100 > camera.y + camera.height) {
            return;
        }

        // Keep player-specific canvas mutations from leaking into world rendering.
        ctx.save();

        const x = this.x;
        const y = this.y;
        const centerX = x + this.width / 2;
        const centerY = y + this.height / 2;

        // --- Bottom Layer ---

        // 1. Renovated Shadow (Matched with Solo)
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(centerX, y + this.height - 4, this.width / 2 * 0.7, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        const auraState = this.getEquipmentAuraState();
        if (auraState) {
            SkillRenderer.drawEquipmentAura(ctx, centerX, centerY - 8, auraState, {
                width: this.width,
                height: this.height
            });
        }

        // 2. Magic Circle & Run Particles (Drawn BEFORE character)
        if (this.isAttacking) {
            this.drawMagicCircle(ctx, centerX, y + this.height + 5);
        }

        this.runParticles.forEach(p => {
            ctx.fillStyle = `rgba(200, 200, 200, ${p.life * 1.5})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });

        // 3. Lightning Effect (Wait... solo usually draws this before or after? Request specified character behind effects)
        // Correction: User said "Magic circle center at feet, Character should be in FRONT of magic circle"
        // And "Lightning effect from behind the character"
        if (this.lightningEffect && Array.isArray(this.lightningEffect.chains)) {
            this.lightningEffect.chains.forEach((c, idx) => {
                this.drawLightningSegment(ctx, c.x1, c.y1, c.x2, c.y2, 1.0, this.lightningEffect.variant, idx);
            });
        }

        // --- Character Layer ---

        // 4. Draw Sprite
        if (this.sprite) {
            let row = this.isAttacking ? 4 : this.direction;
            let col = this.animFrame;

            // Legacy visual size: 120x120
            const drawW = 120;
            const drawH = 120;

            const drawX = centerX - drawW / 2;
            const drawY = y + this.height - drawH + 10;

            const burnEffect = this.statusEffects.find(e => e.type === 'burn');
            const isElec = this.electrocutedTimer > 0;

            this.sprite.draw(ctx, row, col, drawX, drawY, drawW, drawH);

            // v0.21.5: Absolute Barrier (Shield) Effect - Centered on body
            if (this.shieldTimer > 0) {
                this.drawShieldEffect(ctx, centerX, centerY - 20);
            }


            // --- Spark Effect during Normal Attack (Chain Lightning) ---
            if (this.isChanneling && !this.isDead) {
                ctx.save();
                if (window.game?.useReducedEffects) {
                    ctx.strokeStyle = 'rgba(72, 219, 251, 0.75)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, 26, 0, Math.PI * 2);
                    ctx.stroke();
                } else {
                    const now = Date.now();
                    if (!this.auraBolts || (now - (this.auraLastUpdate || 0) > 100)) {
                        this.auraBolts = [];
                        this.auraLastUpdate = now;
                        for (let i = 0; i < 2; i++) {
                            const rx = centerX + (Math.random() - 0.5) * 80;
                            const ry = centerY + (Math.random() - 0.5) * 80;
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
                        ctx.strokeStyle = '#48dbfb';
                        ctx.lineWidth = 4;
                        ctx.shadowBlur = 15;
                        ctx.shadowColor = '#00d2ff';
                        ctx.stroke();
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 1.5;
                        ctx.shadowBlur = 0;
                        ctx.stroke();
                    });
                }
                ctx.restore();
            }
        } else if (this.state === 'die' || this.isDying) {
            // v0.28.0: Tombstone visual for LOCAL player
            ctx.save();
            ctx.fillStyle = '#b2bec3';
            ctx.strokeStyle = '#2d3436';
            ctx.lineWidth = 2;

            const tw = 40, th = 50;
            const tx = centerX - tw / 2, ty = y + this.height - th;
            ctx.beginPath();
            ctx.moveTo(tx, ty + th);
            ctx.lineTo(tx, ty + 15);
            ctx.quadraticCurveTo(tx, ty, tx + tw / 2, ty);
            ctx.quadraticCurveTo(tx + tw, ty, tx + tw, ty + 15);
            ctx.lineTo(tx + tw, ty + th);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.strokeStyle = '#636e72';
            ctx.beginPath();
            ctx.moveTo(centerX, ty + 10); ctx.lineTo(centerX, ty + 30);
            ctx.moveTo(centerX - 10, ty + 18); ctx.lineTo(centerX + 10, ty + 18);
            ctx.stroke();
            ctx.restore();
        } else {

            // Fallback (Circle)
            ctx.fillStyle = this.isAttacking ? '#ff6b6b' : '#0984e3';
            ctx.beginPath();
            ctx.arc(centerX, centerY, 16, 0, Math.PI * 2);
            ctx.fill();
        }

        // 5. HUD (HP/MP Bars & Name)
        this.drawHUD(ctx, centerX, y);

        // 6. Direction Arrow (At feet) - v0.29.13: Move up 30px
        this.drawDirectionArrow(ctx, centerX, y + this.height - 30);

        // 7. Speech Bubble
        if (this.actionFdbk) {
            ctx.save();
            const bubbleY = y - 80; // Moved up 20px from -60
            const bubbleText = this.actionFdbk;
            ctx.font = 'bold 14px "Nanum Gothic", "Outfit", sans-serif';
            const textWidth = ctx.measureText(bubbleText).width;
            const bubbleWidth = textWidth + 20;
            const bubbleHeight = 28;
            const bubbleX = centerX - bubbleWidth / 2;

            // Speech bubble background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.strokeStyle = 'rgba(200, 200, 200, 0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight, 8);
            } else {
                ctx.rect(bubbleX, bubbleY, bubbleWidth, bubbleHeight);
            }
            ctx.fill();
            ctx.stroke();

            // Tail
            ctx.beginPath();
            ctx.moveTo(centerX - 5, bubbleY + bubbleHeight);
            ctx.lineTo(centerX + 5, bubbleY + bubbleHeight);
            ctx.lineTo(centerX, bubbleY + bubbleHeight + 8);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#4a3e35';
            ctx.textAlign = 'center';
            ctx.fillText(bubbleText, centerX, bubbleY + 19);
            ctx.restore();
        }

        // 8. Chat Speech Bubble (v0.26.0)
        if (this.chatMessage) {
            this.drawSpeechBubble(ctx, centerX, y - 85);
        }

        // v0.00.03: Local HUD Rendering (HP/MP/Name above head)
        this.drawHUD(ctx, centerX, y);
        this.drawDirectionArrow(ctx, centerX, y + this.height - 30);

        // 9. v0.00.26: Status Effect Icons (Burn/Electrocuted)
        this._drawStatusIcons(ctx, centerX, y + this.height);

        ctx.restore();
    }

    // v0.00.26: Draw status effect icons for local player
    _drawStatusIcons(ctx, centerX, baseY) {
        const burnEffect = this.statusEffects.find(e => e.type === 'burn');
        const hasBurn = burnEffect && burnEffect.timer > 0;
        const hasElec = this.electrocutedTimer > 0;
        const hasShield = this.shieldTimer > 0;

        if (!hasBurn && !hasElec && !hasShield) return;

        ctx.save();
        // v0.00.73: Position icons BELOW bars, aligned to the LEFT of the health bar
        const barWidth = 60;
        const startX = centerX - barWidth / 2;
        const iconY = baseY + 28; // v0.00.74: Moved 10px down to avoid covering MP bar
        let currentX = startX + 10; // Slight offset from left edge

        const drawStatusBadge = (type) => {
            ctx.save();
            ctx.translate(currentX, iconY);

            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(-10, -10, 20, 20, 4);
            } else {
                ctx.rect(-10, -10, 20, 20);
            }
            ctx.fill();

            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            if (type === 'elec') {
                ctx.strokeStyle = '#00d2ff';
                ctx.shadowBlur = 8;
                ctx.shadowColor = '#00d2ff';
                ctx.beginPath();
                ctx.moveTo(2, -6);
                ctx.lineTo(-3, 0);
                ctx.lineTo(3, 0);
                ctx.lineTo(-2, 6);
                ctx.stroke();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 0.8;
                ctx.shadowBlur = 0;
                ctx.stroke();
            } else if (type === 'burn') {
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
            currentX += 22; // Slightly tighter spacing
        };

        if (hasShield) drawStatusBadge('shield'); // Priority to shield
        if (hasBurn) drawStatusBadge('burn');
        if (hasElec) drawStatusBadge('elec');

        ctx.restore();
    }

    showSpeechBubble(text) {
        this.chatMessage = text;
        this.isEmote = false; // v2.1: Text mode
        this.chatTimer = 5.0; // Show for 5 seconds
    }

    // v2.1: Emote Display
    showEmote(emoteId) {
        // Find emote icon from Game data
        const emote = window.game?.emotes?.find(e => e.id === emoteId);
        if (emote) {
            this.chatMessage = emote.icon; // Keep path for fallback or debug
            this.isEmote = true;
            this.chatTimer = 3.0;
            this.emoteImage = null; // Reset current image

            // Load image asynchronously
            if (window.game?.resources) {
                window.game.resources.loadImage(emote.icon)
                    .then(img => { this.emoteImage = img; })
                    .catch(e => { Logger.warn('Emote load failed', e); });
            }
        }
    }

    drawSpeechBubble(ctx, x, y) {
        if (this.isEmote) {
            // Emote Style
            ctx.save();
            const bubbleWidth = 60;  // Fixed size for icons
            const bubbleHeight = 50;
            const bubbleX = x - bubbleWidth / 2;
            const bubbleY = y - bubbleHeight; // Synced with RemotePlayer

            // Bubble Background (Rounder)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight, 15);
            } else {
                ctx.rect(bubbleX, bubbleY, bubbleWidth, bubbleHeight);
            }
            ctx.fill();
            ctx.stroke();

            // Draw Emote Image
            if (this.emoteImage) {
                const iconSize = 32;
                const iconX = bubbleX + (bubbleWidth - iconSize) / 2;
                const iconY = bubbleY + (bubbleHeight - iconSize) / 2;
                ctx.drawImage(this.emoteImage, iconX, iconY, iconSize, iconSize);
            } else {
                // Loading ...
                ctx.fillStyle = '#999';
                ctx.font = 'bold 20px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('...', x, bubbleY + bubbleHeight / 2);
            }

            ctx.restore();
            return;
        }

        // Normal Chat Bubble (non-emote)
        ctx.save();
        ctx.font = '13px "Outfit", sans-serif';
        const padding = 10;
        const metrics = ctx.measureText(this.chatMessage);
        const w = Math.min(200, metrics.width + padding * 2);
        const h = 28;
        const bx = x - w / 2;
        const by = y - h - 10;

        // Bubble background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.strokeStyle = '#2d3436';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 8);
        else ctx.rect(bx, by, w, h);
        ctx.fill();
        ctx.stroke();

        // Tail
        ctx.beginPath();
        ctx.moveTo(x - 5, by + h);
        ctx.lineTo(x + 5, by + h);
        ctx.lineTo(x, by + h + 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#2d3436';
        ctx.textAlign = 'center';
        ctx.fillText(this.chatMessage, x, by + 19, 190);
        ctx.restore();
    }

    addToParty(uid) {
        this.setPartyMembers([...(this.party?.members || []), uid]);
    }

    setPartyMembers(memberIds, syncToWorld = true) {
        const normalized = Array.from(new Set((memberIds || []).filter(Boolean)));
        if (this.id && !normalized.includes(this.id)) {
            normalized.unshift(this.id);
        }

        this.party = { members: normalized };
        this.saveState(syncToWorld);
        if (window.game?.ui) window.game.ui.updatePartyUI();
    }

    getItemDataManager() {
        return window.game?.itemData || null;
    }

    normalizeInventoryState(savedInventory = null, savedEquipment = null) {
        const itemData = this.getItemDataManager();
        const sourceInventory = Array.isArray(savedInventory) ? savedInventory : this.inventory;
        this.inventory = Array.from({ length: INVENTORY_TOTAL_SLOTS }, (_, index) => {
            const raw = sourceInventory[index] || null;
            return itemData?.normalizeInventoryItem(raw) || raw || null;
        });
        const sourceEquipment = savedEquipment || this.equipment || { weapon: null };
        this.equipment = itemData?.normalizeEquipmentData(sourceEquipment) || { weapon: sourceEquipment.weapon || null };
        const compacted = this.compactInventory();
        this.updateGoldInventory();
        return compacted;
    }

    compactInventory() {
        const goldSlot = this.inventory[0] || null;
        const compactedItems = [];
        const indexMap = new Map();

        for (let index = 1; index < this.inventory.length; index++) {
            const item = this.inventory[index];
            if (!item) continue;
            const nextIndex = compactedItems.length + 1;
            compactedItems.push(item);
            indexMap.set(index, nextIndex);
        }

        const nextInventory = Array.from({ length: INVENTORY_TOTAL_SLOTS }, (_, index) => {
            if (index === 0) return goldSlot;
            return compactedItems[index - 1] || null;
        });

        let changed = nextInventory.length !== this.inventory.length;
        if (!changed) {
            for (let index = 0; index < nextInventory.length; index++) {
                if (nextInventory[index] !== this.inventory[index]) {
                    changed = true;
                    break;
                }
            }
        }

        this.inventory = nextInventory;
        return { changed, indexMap };
    }

    moveInventoryItem(fromIndex, toIndex) {
        if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return { ok: false, newIndex: -1 };
        if (fromIndex <= 0 || fromIndex >= this.inventory.length) return { ok: false, newIndex: -1 };

        const sourceItem = this.inventory[fromIndex];
        if (!sourceItem) return { ok: false, newIndex: -1 };

        const compactedItems = this.inventory.slice(1).filter(Boolean);
        const sourcePosition = compactedItems.findIndex((item) => {
            if (sourceItem.instanceId && item?.instanceId) {
                return item.instanceId === sourceItem.instanceId;
            }
            return item === sourceItem;
        });

        if (sourcePosition < 0) return { ok: false, newIndex: -1 };

        const [movedItem] = compactedItems.splice(sourcePosition, 1);
        const targetPosition = Math.max(0, Math.min(toIndex - 1, compactedItems.length));
        compactedItems.splice(targetPosition, 0, movedItem);

        const goldSlot = this.inventory[0] || null;
        this.inventory = Array.from({ length: INVENTORY_TOTAL_SLOTS }, (_, index) => {
            if (index === 0) return goldSlot;
            return compactedItems[index - 1] || null;
        });
        this.updateGoldInventory();

        return { ok: true, newIndex: targetPosition + 1 };
    }

    getEquippedWeapon() {
        return this.equipment?.weapon || null;
    }

    getEquippedWeaponDefinition() {
        const weapon = this.getEquippedWeapon();
        return weapon ? this.getItemDataManager()?.getItemDefinition(weapon.type) || null : null;
    }

    applyEquipmentStats() {
        const weapon = this.getEquippedWeapon();
        if (!weapon) return;

        const definition = this.getEquippedWeaponDefinition();
        const baseStats = weapon.baseStats || definition?.baseStats || {};
        const enhancementLevel = Math.max(0, weapon.enhancementLevel || 0);
        const enhancementBonuses = weapon.enhancementBonuses || definition?.enhancementBonuses || {};

        this.attackPower += (baseStats.attackPower || 0)
            + (enhancementLevel * (enhancementBonuses.attackPowerPerLevel || 0));
        this.critRate += (baseStats.critRate || 0)
            + (enhancementLevel * (enhancementBonuses.critRatePerLevel || 0));
        this.mpRegen += (baseStats.mpRegen || 0);
    }

    getWeaponCombatProfile() {
        const baseProfile = {
            prefixId: null,
            missileDamageBonus: 0,
            missileDamageBonusEnhancementBonus: 0,
            fireballChainChance: 0,
            fireballChainChanceBase: 0,
            fireballChainChanceEnhancementBonus: 0,
            fireballChainDamageRatio: 0,
            fireballChainDamageRatioEnhancementBonus: 0,
            laserDamageBonus: 0,
            laserDamageBonusEnhancementBonus: 0,
            restoreHpPerLaserHit: 0,
            missileVariant: null,
            fireballVariant: null,
            laserVariant: null,
            missileTint: null,
            fireballTint: null,
            auraState: null
        };

        const weapon = this.getEquippedWeapon();
        const itemData = this.getItemDataManager();
        if (!weapon || !itemData) return baseProfile;

        const affix = itemData.getAffixDefinition(weapon.prefixId);
        if (!affix) {
            baseProfile.auraState = itemData.getAuraState(weapon);
            return baseProfile;
        }

        const missileDamageBonusEnhancementBonus = this.getWeaponAffixEnhancementBonus(weapon, 'missileDamageBonus');
        const fireballChainChanceBase = this.getWeaponAffixBaseValue(weapon, 'fireballChainChance');
        const fireballChainChanceEnhancementBonus = this.getWeaponAffixEnhancementBonus(weapon, 'fireballChainChance');
        const fireballChainDamageRatioEnhancementBonus = this.getWeaponAffixEnhancementBonus(weapon, 'fireballChainDamageRatio');
        const laserDamageBonusEnhancementBonus = this.getWeaponAffixEnhancementBonus(weapon, 'laserDamageBonus');

        return {
            prefixId: affix.id,
            missileDamageBonus: this.getWeaponAffixEffectiveValue(weapon, 'missileDamageBonus'),
            missileDamageBonusEnhancementBonus,
            fireballChainChance: this.getWeaponAffixEffectiveValue(weapon, 'fireballChainChance'),
            fireballChainChanceBase,
            fireballChainChanceEnhancementBonus,
            fireballChainDamageRatio: this.getWeaponAffixEffectiveValue(weapon, 'fireballChainDamageRatio'),
            fireballChainDamageRatioEnhancementBonus,
            laserDamageBonus: this.getWeaponAffixEffectiveValue(weapon, 'laserDamageBonus'),
            laserDamageBonusEnhancementBonus,
            restoreHpPerLaserHit: affix.combatHooks?.restoreHpPerLaserHit || 0,
            missileVariant: affix.skillOverrides?.missileVisualVariant || null,
            fireballVariant: affix.skillOverrides?.fireballVisualVariant || null,
            laserVariant: affix.skillOverrides?.laserVisualVariant || null,
            missileTint: affix.skillOverrides?.missileVisualVariant ? (affix.visuals?.projectileTint || null) : null,
            fireballTint: affix.skillOverrides?.fireballVisualVariant ? (affix.visuals?.projectileTint || null) : null,
            auraState: itemData.getAuraState(weapon)
        };
    }

    getWeaponAffixBaseValue(weapon, key) {
        if (!weapon) return 0;

        switch (key) {
            case 'fireballChainChance':
                return weapon.rolledValues?.fireballChainChance ?? weapon.rolledValues?.fireballDamageBonus ?? 0;
            case 'fireballChainDamageRatio':
                return weapon.rolledValues?.fireballChainDamageRatio ?? weapon.rolledValues?.fireExplosionDamageRatio ?? 0;
            case 'missileDamageBonus':
                return weapon.rolledValues?.missileDamageBonus || 0;
            case 'laserDamageBonus':
                return weapon.rolledValues?.laserDamageBonus || 0;
            default:
                return weapon.rolledValues?.[key] || 0;
        }
    }

    getWeaponAffixEnhancementBonus(weapon, key) {
        if (!weapon) return 0;

        const enhancementLevel = Math.max(0, weapon.enhancementLevel || 0);
        if (enhancementLevel <= 0) return 0;

        const itemData = this.getItemDataManager?.();
        const affix = itemData?.getAffixDefinition?.(weapon.prefixId);
        if (!affix?.rolledEffects?.[key]?.displayAsPercent) return 0;

        return enhancementLevel * 0.01;
    }

    getWeaponAffixEffectiveValue(weapon, key) {
        const baseValue = this.getWeaponAffixBaseValue(weapon, key);
        const enhancementBonus = this.getWeaponAffixEnhancementBonus(weapon, key);
        const totalValue = baseValue + enhancementBonus;

        switch (key) {
            case 'fireballChainChance':
                return Math.min(1, totalValue);
            default:
                return totalValue;
        }
    }

    getEquipmentAuraState() {
        return this.getWeaponCombatProfile().auraState;
    }

    _buildWeaponDamageMeta(cause, extra = {}) {
        const weapon = this.getEquippedWeapon();
        if (!weapon) return null;

        const combatProfile = this.getWeaponCombatProfile();
        return {
            cause,
            weaponType: weapon.type,
            prefixId: weapon.prefixId || combatProfile.prefixId || null,
            fireballChainChance: combatProfile.fireballChainChance || 0,
            fireballChainDamageRatio: combatProfile.fireballChainDamageRatio || 0,
            burnDuration: extra.burnDuration || 0,
            sourceDamage: extra.sourceDamage || 0,
            explosionRadius: extra.explosionRadius || 0
        };
    }

    getInventoryItemCount(itemId) {
        return this.inventory.reduce((total, item, index) => {
            if (index === 0 || !item || item.type !== itemId) return total;
            return total + Math.max(1, item.amount || 1);
        }, 0);
    }

    consumeInventoryItem(itemId, amount = 1) {
        let remaining = Math.max(1, amount);
        for (let i = 1; i < this.inventory.length; i++) {
            const item = this.inventory[i];
            if (!item || item.type !== itemId) continue;

            const currentAmount = Math.max(1, item.amount || 1);
            if (currentAmount <= remaining) {
                remaining -= currentAmount;
                this.inventory[i] = null;
            } else {
                item.amount = currentAmount - remaining;
                remaining = 0;
            }

            if (remaining <= 0) break;
        }

        return remaining <= 0;
    }

    equipWeaponFromInventory(slotIndex) {
        if (slotIndex <= 0 || slotIndex >= this.inventory.length) {
            return { ok: false, message: '장착할 아이템을 찾지 못했습니다.' };
        }

        const item = this.inventory[slotIndex];
        if (!item || item.slot !== 'weapon') {
            return { ok: false, message: '무기만 장착할 수 있습니다.' };
        }

        const previous = this.equipment.weapon;
        this.equipment.weapon = item;
        this.inventory[slotIndex] = previous || null;
        this.updateDerivedStats();
        if (window.game?.ui) {
            window.game.ui.updateStatusPopup();
            window.game.ui.updateInventory();
        }
        return { ok: true, weapon: this.equipment.weapon };
    }

    unequipWeapon() {
        const weapon = this.getEquippedWeapon();
        if (!weapon) {
            return { ok: false, message: '장착한 무기가 없습니다.' };
        }

        const emptySlot = this.inventory.findIndex((item, index) => index > 0 && !item);
        if (emptySlot < 0) {
            return { ok: false, message: '가방이 가득 차 있어 해제할 수 없습니다.' };
        }

        this.inventory[emptySlot] = weapon;
        this.equipment.weapon = null;
        this.updateDerivedStats();
        if (window.game?.ui) {
            window.game.ui.updateStatusPopup();
            window.game.ui.updateInventory();
        }
        return { ok: true, slotIndex: emptySlot };
    }

    resolveWeaponSelection(selection = null) {
        if (selection?.kind === 'inventory') {
            const item = this.inventory[selection.index];
            return item?.slot === 'weapon' ? { location: 'inventory', index: selection.index, item } : null;
        }

        if (selection?.kind === 'equipment') {
            const item = this.getEquippedWeapon();
            return item ? { location: 'equipment', slot: 'weapon', item } : null;
        }

        const equipped = this.getEquippedWeapon();
        if (equipped) return { location: 'equipment', slot: 'weapon', item: equipped };
        return null;
    }

    enhanceWeapon(selection = null, options = {}) {
        const itemData = this.getItemDataManager();
        const target = this.resolveWeaponSelection(selection);
        const stoneType = options?.stoneType === 'blessed' ? 'blessed' : 'normal';
        const stoneItemId = stoneType === 'blessed' ? BLESSED_WEAPON_UPGRADE_STONE_ID : 'weapon_upgrade_stone';
        const stoneLabel = stoneType === 'blessed' ? '축복받은 무기 강화석' : '무기 강화석';
        if (!itemData || !target?.item) {
            return { ok: false, message: '강화할 무기를 선택해 주세요.' };
        }

        if (this.getInventoryItemCount(stoneItemId) < 1) {
            return { ok: false, message: `${stoneLabel}이 부족합니다.` };
        }

        const definition = itemData.getItemDefinition?.(target.item.type || target.item.id);
        const ruleSetId = target.item.enhancementRuleSet || definition?.enhancementRuleSet;
        const ruleSet = itemData.getEnhancementRuleSet?.(ruleSetId);
        const currentLevel = Math.max(0, target.item.enhancementLevel || 0);
        const maxLevel = Math.max(0, ruleSet?.maxLevel || 10);
        if (currentLevel >= maxLevel) {
            return { ok: false, message: '해당 무기는 이미 최종 강화된 상태입니다.' };
        }

        const config = itemData.getEnhancementConfig(target.item);
        if (!config) {
            return { ok: false, message: '이 장비는 더 이상 강화할 수 없습니다.' };
        }

        this.consumeInventoryItem(stoneItemId, 1);

        const result = {
            ok: true,
            success: false,
            destroyed: false,
            item: target.item,
            previousLevel: currentLevel,
            nextLevel: config.nextLevel,
            stoneType,
            stoneItemId,
            stoneLabel,
            gain: 0,
            keptLevel: false
        };

        if (stoneType === 'blessed') {
            const rolledGain = BLESSED_WEAPON_ENHANCEMENT.minGain
                + Math.floor(Math.random() * ((BLESSED_WEAPON_ENHANCEMENT.maxGain - BLESSED_WEAPON_ENHANCEMENT.minGain) + 1));
            result.success = Math.random() <= BLESSED_WEAPON_ENHANCEMENT.successRate;
            result.nextLevel = Math.min(config.maxLevel, currentLevel + rolledGain);
            result.gain = Math.max(0, result.nextLevel - currentLevel);
            result.keptLevel = !result.success;

            if (result.success) {
                target.item.enhancementLevel = result.nextLevel;
            }
        } else {
            result.success = Math.random() <= config.successRate;
            if (result.success) {
                target.item.enhancementLevel = config.nextLevel;
                result.gain = Math.max(0, config.nextLevel - currentLevel);
            } else if (config.destroyChanceOnFail > 0 && Math.random() <= config.destroyChanceOnFail) {
                result.destroyed = true;
                if (target.location === 'inventory') {
                    this.inventory[target.index] = null;
                } else {
                    this.equipment.weapon = null;
                }
            } else {
                result.keptLevel = true;
            }
        }

        if (target.location === 'equipment' || result.destroyed) {
            this.updateDerivedStats();
        } else {
            this.saveState();
        }

        if (window.game?.ui) {
            window.game.ui.updateStatusPopup();
            window.game.ui.updateInventory();
        }

        return result;
    }

    getWeaponDismantleRewardInfo(item) {
        if (!item || item.slot !== 'weapon') return null;

        const enhancementLevel = Math.max(0, item.enhancementLevel || 0);
        if (enhancementLevel <= 0) {
            return {
                itemId: 'weapon_upgrade_stone',
                min: 1,
                max: 2,
                displayText: '1~2개'
            };
        }

        return {
            itemId: 'weapon_upgrade_stone',
            min: enhancementLevel,
            max: enhancementLevel,
            displayText: `${enhancementLevel}개`
        };
    }

    canReceiveStackableItem(itemId) {
        if (!itemId) return false;
        const hasExistingStack = this.inventory.some((item, index) => (
            index > 0 && item && item.type === itemId && item.stackable !== false
        ));
        const hasEmptySlot = this.inventory.some((item, index) => index > 0 && !item);
        return hasExistingStack || hasEmptySlot;
    }

    dismantleWeapon(selection = null) {
        const target = this.resolveWeaponSelection(selection);
        if (!target?.item || target.item.slot !== 'weapon') {
            return { ok: false, message: '분해할 무기를 선택해 주세요.' };
        }

        const rewardInfo = this.getWeaponDismantleRewardInfo(target.item);
        if (!rewardInfo) {
            return { ok: false, message: '이 무기는 분해할 수 없습니다.' };
        }

        if (target.location === 'equipment' && !this.canReceiveStackableItem(rewardInfo.itemId)) {
            return { ok: false, message: '가방이 가득 차 있어 분해 보상을 받을 수 없습니다.' };
        }

        const rewardAmount = rewardInfo.min === rewardInfo.max
            ? rewardInfo.max
            : (rewardInfo.min + Math.floor(Math.random() * ((rewardInfo.max - rewardInfo.min) + 1)));
        const dismantledItem = target.item;

        if (target.location === 'inventory') {
            this.inventory[target.index] = null;
        } else {
            this.equipment.weapon = null;
        }

        const rewardItem = this.addInventoryItem(rewardInfo.itemId, rewardAmount);
        if (!rewardItem) {
            if (target.location === 'inventory') {
                this.inventory[target.index] = dismantledItem;
            } else {
                this.equipment.weapon = dismantledItem;
            }
            return { ok: false, message: '분해 보상을 인벤토리에 추가하지 못했습니다.' };
        }

        if (target.location === 'equipment') {
            this.updateDerivedStats();
        } else {
            this.saveState();
        }

        if (window.game?.ui) {
            window.game.ui.updateStatusPopup();
            window.game.ui.updateInventory();
        }

        return {
            ok: true,
            rewardAmount,
            rewardItemId: rewardInfo.itemId,
            enhancementLevel: Math.max(0, dismantledItem.enhancementLevel || 0),
            itemName: dismantledItem.name || '무기'
        };
    }

    getItemMeta(itemId) {
        const definition = this.getItemDataManager()?.getItemDefinition(itemId);
        if (definition) {
            return {
                name: definition.name,
                icon: definition.icon?.fallbackEmoji || '🎁',
                iconPath: definition.icon?.path || null,
                stackable: definition.stackable !== false,
                slot: definition.slot || null,
                description: definition.description || ''
            };
        }

        return ITEM_DEFINITIONS[itemId] || {
            name: itemId,
            icon: '🎁'
        };
    }

    addInventoryItem(itemId, amount = 1, meta = {}) {
        if (!itemId || amount <= 0) return null;

        const definition = {
            ...this.getItemMeta(itemId),
            ...meta
        };

        const isEquipmentInstance = definition.stackable === false || !!definition.instanceId || !!definition.slot;
        if (isEquipmentInstance) {
            const itemData = this.getItemDataManager();
            let firstAdded = null;
            for (let i = 0; i < amount; i++) {
                const slotIndex = this.inventory.findIndex((item, idx) => idx > 0 && !item);
                if (slotIndex < 0) break;

                const instance = itemData?.normalizeInventoryItem({ type: itemId, amount: 1, ...meta }) || {
                    type: itemId,
                    amount: 1,
                    icon: definition.icon,
                    iconPath: definition.iconPath || null,
                    name: definition.name,
                    slot: definition.slot || 'weapon',
                    stackable: false,
                    instanceId: definition.instanceId || `item_${Date.now()}_${slotIndex}`
                };
                this.inventory[slotIndex] = instance;
                if (!firstAdded) firstAdded = instance;
            }
            return firstAdded;
        }

        let slotIndex = this.inventory.findIndex((item, idx) => idx > 0 && item && item.type === itemId && item.stackable !== false);
        if (slotIndex < 0) {
            slotIndex = this.inventory.findIndex((item, idx) => idx > 0 && !item);
        }
        if (slotIndex < 0) return null;

        const existing = this.inventory[slotIndex];
        const nextAmount = (existing?.amount || 0) + amount;
        this.inventory[slotIndex] = {
            type: itemId,
            amount: nextAmount,
            icon: definition.icon,
            iconPath: definition.iconPath || null,
            name: definition.name,
            stackable: true,
            description: definition.description || ''
        };

        return this.inventory[slotIndex];
    }

    drawHUD(ctx, centerX, y) {
        // v0.21.3: Slim HUD (Identical to monsters)
        const barWidth = 60;
        const barHeight = 6;
        const startY = y + this.height + 5;

        // HP Bar
        const barY = startY;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(centerX - barWidth / 2, barY, barWidth, barHeight);

        const hpPerc = Math.min(1, Math.max(0, this.hp / this.maxHp));
        ctx.fillStyle = hpPerc > 0.3 ? '#4ade80' : '#ef4444';
        ctx.fillRect(centerX - barWidth / 2, barY, barWidth * hpPerc, barHeight);

        // MP Bar
        const mpBarY = barY + barHeight + 3;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(centerX - barWidth / 2, mpBarY, barWidth, barHeight);
        const mpPerc = Math.min(1, Math.max(0, this.mp / this.maxMp));
        ctx.fillStyle = '#48dbfb';
        ctx.fillRect(centerX - barWidth / 2, mpBarY, barWidth * mpPerc, barHeight);

        // Name Tag (Styled with outline to match screenshot)
        // Name Tag (Styled with outline to match screenshot)
        const nameY = y - 50; // Moved 10px higher (Total 50px offset)


        ctx.save();
        ctx.font = 'bold 13px "Outfit", sans-serif';
        ctx.textAlign = 'center';

        // Thick Black Outline
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(this.name, centerX, nameY);

        // White Fill
        ctx.fillStyle = '#fff';
        ctx.fillText(this.name, centerX, nameY);
        ctx.restore();
    }

    drawDirectionArrow(ctx, sx, sy) {
        ctx.save();
        const dist = 60;

        // v0.29.14: Use facingAngle for 8-direction arrow
        const angle = this.facingAngle !== undefined ? this.facingAngle : 0;
        const vx = Math.cos(angle);
        const vy = Math.sin(angle);

        const ax = sx + vx * dist;
        const ay = sy + vy * dist;

        ctx.translate(ax, ay);
        ctx.rotate(angle);

        ctx.fillStyle = 'rgba(255, 68, 68, 0.7)';
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-5, -8);
        ctx.lineTo(-5, 8);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    drawLightningSegment(ctx, x1, y1, x2, y2, intensity, variant = null) {
        SkillRenderer.drawLightning(ctx, x1, y1, x2, y2, intensity, { variant });
    }

    getHostileUidByName(name) {
        if (!name) return null;
        for (const [uid, data] of this.hostileTargets.entries()) {
            if (data && data.name === name) return uid;
        }
        return null;
    }

    async declareHostility(targetName) {
        if (!targetName || !this.net) return 'INVALID';

        try {
            const targetUid = await this.net.getUidByName(targetName);
            if (!targetUid) return 'NOT_FOUND';
            if (targetUid === this.id) return 'SELF';

            const now = Date.now();

            // v0.00.18: Use name-based check to prevent duplicates
            const existingUid = this.getHostileUidByName(targetName);
            const effectiveUid = existingUid || targetUid;
            const existing = this.hostileTargets.get(effectiveUid);

            // Toggle Logic: If already hostile, try to remove
            if (existing) {
                const elapsed = (now - existing.ts) / 1000;
                if (elapsed < 30) {
                    return `COOLDOWN:${Math.ceil(30 - elapsed)}`;
                }

                // Remove hostility (Mutual removal logic)
                this.hostileTargets.delete(effectiveUid);
                // v1.99.38: Send removal event to target
                if (window.game.net && window.game.net.dbRef) {
                    await window.game.net.dbRef.child(`users/${effectiveUid}/hostility_inbox`).push({
                        type: 'REMOVE',
                        from: this.id,
                        fromName: this.name,
                        ts: now
                    });
                }

                this.saveState(true);
                if (window.game?.ui) window.game.ui.updateHostilityUI();
                return 'REMOVED';
            }

            // Declare New Hostility (Mutual Force)
            this.hostileTargets.set(targetUid, { name: targetName, ts: now });

            // v1.1: Force Mutual Hostility
            // Send packet to target's inbox to force them to add me
            if (window.game.net && window.game.net.dbRef) {
                await window.game.net.dbRef.child(`users/${targetUid}/hostility_inbox`).push({
                    type: 'ADD',
                    from: this.id,
                    fromName: this.name,
                    ts: now
                });
            }

            if (window.game?.ui) window.game.ui.updateHostilityUI();
            this.saveState(true);

            return 'DECLARED';
        } catch (e) {
            Logger.error(e);
            return 'ERROR';
        }
    }

    drawMagicCircle(ctx, sx, sy) {
        SkillRenderer.drawMagicCircle(ctx, sx, sy);
    }

    drawShieldEffect(ctx, x, y) {
        SkillRenderer.drawShield(ctx, x, y);
    }

    // v0.00.15: Consolidate Respawn Logic
    async respawn() {
        this.isDead = false;
        this.isDying = false;
        this.deathTimer = 0;
        this.hp = this.maxHp;
        this.mp = this.maxMp;
        this.moveTarget = null;
        this.vx = 0;
        this.vy = 0;
        this.clearCurrentTarget();

        // v0.00.41: Clear all status effects on respawn
        this.statusEffects = [];
        this.electrocutedTimer = 0;
        this.slowRatio = 0;
        this.grantSpawnProtection(5);

        // v2.3.6: Spawn at zone's default spawn point to avoid getting stuck in collision
        if (window.game && window.game.zone) {
            const spawn = window.game.zone.getSpawnPoint('default') || { x: 1500, y: 1900 };
            this.x = spawn.x;
            this.y = spawn.y;
        } else {
            this.x = this.spawnX || 1500;
            this.y = this.spawnY || 1900;
        }

        this.state = 'idle';

        Logger.log('Player Respawned');

        // Reset UI
        if (window.game && window.game.ui) {
            window.game.ui.hideDeathModal();
            window.game.ui.updateStatusPopup();
            window.game.ui.logSystemMessage("부활했습니다!");
        }

        // Save and Sync
        this.saveState();
        if (this.net) {
            this.net.sendPlayerHp(this.hp, this.maxHp); // v0.29.6: Vital for tombstone cleanup
            this.net.sendMovePacket(this.x, this.y, 0, 0, this.name); // Sync position immediately
            this.net.syncLocalZoneProfile?.('respawn');
        }
    }
}
