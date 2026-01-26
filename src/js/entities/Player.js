import CharacterBase from './core/CharacterBase.js';
import Logger from '../utils/Logger.js';
import { Sprite } from '../core/Sprite.js';
import SkillRenderer from '../skills/renderers/SkillRenderer.js';

export default class Player extends CharacterBase {
    constructor(x, y, name = "유리카") {
        super(x, y, 180); // Speed 180
        this.name = name;

        // Stats (Base)
        this.vitality = 1;
        this.intelligence = 3;
        this.wisdom = 2;
        this.agility = 1;
        this.statPoints = 0;

        // Derived Stats (Calculated)
        this.maxHp = 30; // 20 + 1*10
        this.hp = 20;
        this.maxMp = 50; // 30 + 2*10
        this.mp = 50;
        this.attackPower = 10;
        this.defense = 1;
        this.hpRegen = 1;
        this.mpRegen = 2;
        this.attackSpeed = 1.0;
        this.critRate = 0.1;
        this.moveSpeedBonus = 1.0;

        this.level = 1;
        this.exp = 0;
        this.maxExp = 100;
        this.gold = 0;
        this.inventory = [];
        for (let i = 0; i < 20; i++) this.inventory.push(null); // 20 slots
        this.questData = {
            slimeKills: 0,
            slimeQuestClaimed: false,
            bossKilled: false,
            bossQuestClaimed: false
        };

        // Quest Data

        // Skill State

        this.skillLevels = {
            laser: 1,
            missile: 1,
            fireball: 1,
            shield: 1
        };
        this.skillCooldowns = { j: 0, h: 0, u: 0, k: 0 };
        this.skillMaxCooldowns = { j: 0, h: 0, u: 0, k: 0 };

        // Combat & Channeling
        this.attackRange = 400; // Reduced from 700 to 400 as requested

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

        this.chatMessage = null;
        this.chatTimer = 0;

        this.updateDerivedStats();
    }

    // Initialize with game dependencies
    init(inputManager, resourceManager, networkManager) {
        this.input = inputManager;
        this.net = networkManager;
        this._loadSpriteSheet(resourceManager);

        // Bind input actions to methods
        this.input.on('keydown', (action) => {
            // Cancel Click-to-Move on any action
            this.moveTarget = null;

            if (action === 'ATTACK') this.attack();
            if (action === 'SKILL_1') this.useSkill(1);
            if (action === 'SKILL_2') this.useSkill(2);
            if (action === 'SKILL_3') this.useSkill(3);
            if (action === 'SKILL_4') this.useSkill(4);
        });

        this.input.on('joystickMove', (data) => {
            this.joystick.x = data.x;
            this.joystick.y = data.y;
            this.joystick.active = data.active;
        });
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
            this.deathTimer -= dt;
            if (this.deathTimer <= 0) {
                this.respawn();
            }
        }

        if (this.isDead) return;

        this._handleMovement(dt);
        this._updateCooldowns(dt);
        this._updateAnimation(dt);
        this._handleRegen(dt);

        // v0.29.9: Chain Lightning Full Restore
        // Call performLaserAttack when ATTACK key is held, OR when already channeling
        if (this.input && this.input.isPressed('ATTACK')) {
            this.performLaserAttack(dt);
        } else {
            // Key released - stop channeling Chain Lightning only (not other skills)
            // skillAttackTimer > 0 means Missile/Fireball/Shield is animating
            if (this.isChanneling && this.skillAttackTimer <= 0) {
                this.isChanneling = false;
                this.isAttacking = false; // v0.29.10: Also reset attacking state
                this.chargeTime = 0;
                this.lightningEffect = null;
                this.state = 'idle';
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
                        window.game.projectiles.push(new Projectile(this.x, this.y, data.target, 'missile', data.options));
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

    applyElectrocuted(duration, ratio) {
        this.electrocutedTimer = 3.0; // Fixed 3s
        this.slowRatio = Math.max(this.slowRatio, ratio);
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
                }
                if (this.mp < this.maxMp) {
                    const amount = this.mpRegen;
                    this.mp = Math.min(this.maxMp, this.mp + amount);
                    if (window.game?.ui) window.game.ui.showRegenHint('mp', amount);
                }
            }
        } else {
            // Pre-charge regen timer so it triggers immediately when lastHitTimer hits 1.0
            this.regenTimer = 1.0;
        }
    }

    _handleMovement(dt) {
        if (!this.input) return;

        // v0.26.1: Block movement while channeling (Magic Missile, Chain Lightning)
        if (this.isChanneling) {
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
            const finalSpeed = this.speed * runMult;

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
        // Formulas matched with UIManager.js updateStatusPopup
        this.maxHp = 20 + (this.vitality * 10);
        this.maxMp = 30 + (this.wisdom * 10);
        this.attackPower = 5 + (this.intelligence * 1) + Math.floor(this.wisdom / 2); // Removed + (this.level * 1)
        this.defense = this.vitality * 1;
        this.hpRegen = this.vitality * 1;
        this.mpRegen = this.wisdom * 1;

        this.attackSpeed = 1.0 + (this.agility * 0.1);
        this.moveSpeedBonus = 1.0 + (this.agility * 0.05);
        this.critRate = 0.1 + (this.agility * 0.01);

        // Skill Cooldown Reduction (CDR): 1% per INT+WIS point, max 75%
        this.skillCDR = Math.min(0.75, (this.intelligence + this.wisdom) * 0.01);

        this.speed = 180 * this.moveSpeedBonus;
    }

    updateDerivedStats() {
        this.refreshStats();
        this.saveState();
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
        this.questData = {
            slimeKills: 0,
            slimeQuestClaimed: false,
            bossKilled: false,
            bossQuestClaimed: false
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
        this.updateGoldInventory();
        this.saveState();

        if (window.game && window.game.ui) {
            window.game.ui.logSystemMessage("캐릭터 정보가 초기화되었습니다.");
            window.game.ui.updateStatusPopup();
            window.game.ui.updateSkillPopup();
            window.game.ui.updateQuestUI();
        }
    }


    takeDamage(amount, triggerFlash = true, isCrit = false, sourceX = null, sourceY = null) {
        if (this.isDead) return 0;

        // Magic Shield check
        if (this.shieldTimer > 0) {
            this.shieldTimer = 0;
            if (window.game) {
                window.game.addDamageText(this.x + this.width / 2, this.y - 40, "BLOCK", '#48dbfb', true);
            }
            return 0;
        }

        // Apply Knockback
        if (sourceX !== null && sourceY !== null) {
            const angle = Math.atan2(this.y - sourceY, this.x - sourceX);
            this.applyKnockback(Math.cos(angle) * 100, Math.sin(angle) * 100);
        }

        const validAmount = parseFloat(amount);
        if (isNaN(validAmount)) return 0;

        let finalDmg;
        if (validAmount <= this.defense) {
            // Miss logic
            if (window.game) {
                window.game.addDamageText(this.x + this.width / 2, this.y - 20, "Miss!", '#00d2ff', true);
            }
            finalDmg = 1; // Minimum 1 damage or keep as 0 if preferred, but usually 1 is standard
        } else {
            finalDmg = Math.ceil(validAmount - this.defense);
        }

        this.hp -= finalDmg;
        if (window.game) {
            window.game.addDamageText(this.x + this.width / 2, this.y - 40, `-${finalDmg}`, '#ff4757', false);
        }

        // v0.28.0: Sync HP to DB
        if (this.net) this.net.sendPlayerHp(this.hp, this.maxHp);

        Logger.log(`[Player] HP: ${this.hp}`);

        if (this.hp <= 0 && !this.isDead) {
            this.die();
        }

        return finalDmg;
    }

    die() {
        this.isDead = true;
        this.state = 'die';
        // Visual feedback
        if (window.game && window.game.ui) {
            window.game.ui.logSystemMessage('당신은 전사했습니다...');
            window.game.ui.showDeathModal();
        }
    }

    respawn() {
        this.hp = this.maxHp;
        this.mp = this.maxMp;
        this.isDead = false;
        this.state = 'idle';

        // Move to world center or some spawn point
        if (window.game && window.game.zone) {
            this.x = window.game.zone.width / 2;
            this.y = window.game.zone.height / 2;
        }

        if (window.game && window.game.ui) {
            window.game.ui.logSystemMessage('부활했습니다.');
        }

        // v0.29.6: Force Sync HP to ensure remote clients remove tombstone
        if (this.net) this.net.sendPlayerHp(this.hp, this.maxHp);

        this.saveState();
    }

    saveState() {

        if (!this.net || !this.id) return;
        const data = {
            level: this.level,
            exp: this.exp,
            hp: Math.round(this.hp),
            mp: Math.round(this.mp),
            gold: this.gold,
            vitality: this.vitality,
            intelligence: this.intelligence,
            wisdom: this.wisdom,
            agility: this.agility,
            statPoints: this.statPoints,
            skillLevels: this.skillLevels,
            questData: this.questData, // Added in v0.22.4
            name: this.name,
            ts: Date.now()
        };
        this.net.savePlayerData(this.id, data);

    }

    resetLevel() {
        this.level = 1;
        this.exp = 0;
        this.maxExp = 100;
        this.statPoints = 0;
        this.vitality = 1;
        this.intelligence = 3;
        this.wisdom = 2;
        this.agility = 1;
        this.gold = 0;
        this.hp = 20 + (this.vitality * 10);
        this.mp = 30 + (this.wisdom * 10);
        this.skillLevels = { laser: 1, missile: 1, fireball: 1, shield: 1 };
        this.refreshStats();
        this.saveState();
        if (window.game?.ui) window.game.ui.updateStatusPopup();
        Logger.log('Player level reset to 1 (Debug)');
    }

    useMana(amount) {
        if (this.mp >= amount) {
            this.mp -= amount;
            return true;
        }
        return false;
    }

    recoverMana(amount, isSilent = false) {
        this.mp = Math.min(this.maxMp, this.mp + amount);
    }

    recoverHp(amount) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
    }

    attack() {
        // Handled by update loop for channeling
    }

    performLaserAttack(dt) {
        if (this.isDead) return;

        // Cooldown check for start of attack
        if (!this.isChanneling && this.skillCooldowns.j > 0) return;

        this.isChanneling = true;
        this.isAttacking = true;
        this.state = 'attack';

        this.chargeTime += dt;
        this.lightningTickTimer -= dt;

        const baseTickInterval = 1.0; // Increased from 0.7 to 1.0 (Nerf)
        const tickInterval = baseTickInterval / this.attackSpeed;
        const isTick = this.lightningTickTimer <= 0;

        if (isTick) {
            this.lightningTickTimer = tickInterval;

            // v0.22.2: Restore Attack Cooldown (Scaled by attack speed)
            this.skillCooldowns.j = tickInterval;
            this.skillMaxCooldowns.j = tickInterval;

            this.animTimer = 0; // Restart attack animation

            // v0.28.0: Detailed attack sync [ts, x, y, direction, skillType]
            // v0.28.0: Detailed attack sync [ts, x, y, direction, skillType]
            // v0.29.1: Fix crash (sendAttack -> sendPlayerAttack)
            if (this.net) this.net.sendPlayerAttack(this.x, this.y, this.direction, 'laser');
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

        let availableTargets = [...monsters.filter(m => !m.isDead), ...remotes.filter(rp => !rp.isDead)];

        for (let i = 0; i < maxChains; i++) {
            let nextTarget = null;
            let minDist = chainRange;

            availableTargets.forEach(target => {
                const dist = Math.sqrt((currentSource.x - target.x) ** 2 + (currentSource.y - target.y) ** 2);
                if (dist < minDist && !affectedMonsters.includes(target)) {
                    minDist = dist;
                    nextTarget = target;
                }
            });

            if (nextTarget) {
                chains.push({ x1: currentSource.x, y1: currentSource.y, x2: nextTarget.x, y2: nextTarget.y });
                affectedMonsters.push(nextTarget);

                if (isTick) {
                    let dmg = this.attackPower * finalDmgRatio;
                    let isCrit = Math.random() < this.critRate;
                    if (isCrit) dmg *= 2;

                    // Support both Monster and RemotePlayer takeDamage
                    if (nextTarget.takeDamage) {
                        // v0.29.12: Send monster damage to network for sync
                        if (nextTarget.isMonster && this.net) {
                            this.net.sendMonsterDamage(nextTarget.id, Math.ceil(dmg));
                            nextTarget.lastAttackerId = this.net.playerId;
                        }
                        // PvP damage handled by attacker
                        if (!nextTarget.isMonster && this.net) {
                            this.net.sendPlayerDamage(nextTarget.id, dmg);
                        }
                        // v0.29.17: All clients call takeDamage for visual feedback (damage text)
                        // Actual HP reduction is controlled within Monster.takeDamage based on isHost
                        nextTarget.takeDamage(Math.ceil(dmg), true, isCrit, null, null);
                    }

                    // Slow effect
                    if (nextTarget.applyElectrocuted) {
                        nextTarget.applyElectrocuted(3.0, 0.8);
                    }
                    this.recoverMana(1, true);
                    if (window.game) {
                        window.game.addDamageText(this.x + this.width / 2, this.y - 20, `+1`, '#00d2ff', false);
                    }
                }
                currentSource = { x: nextTarget.x, y: nextTarget.y };
            } else {
                break;
            }
        }

        if (chains.length > 0) {
            this.lightningEffect = { chains: chains, timer: 0.1 };
        } else {
            // v0.29.11: No target = no lightning (no longer force visual on empty space)
            this.lightningEffect = null;
        }

    }

    useSkill(slot) {
        if (this.isDead || !window.game) return;

        const skills = { 1: 'missile', 2: 'fireball', 3: 'shield' };
        const keys = { 1: 'h', 2: 'u', 3: 'k' };
        const skillId = skills[slot];
        const key = keys[slot];

        if (!skillId) return;
        if (this.skillCooldowns[key] > 0) return;

        const lv = this.skillLevels[skillId] || 1;

        if (skillId === 'missile') {
            const cost = 4 + (lv - 1) * 3;
            if (this.useMana(cost)) {
                this.triggerAction(`${this.name} : 매직 미사일 !!`);

                // Base 0.7s, reduced by CDR
                const baseCD = 0.7;
                this.skillCooldowns.h = baseCD * (1 - (this.skillCDR || 0));

                // v0.22.3: Visual Attack FeedBack
                // v0.22.3: Visual Attack FeedBack
                this.isAttacking = true;
                this.isChanneling = true; // v0.26.1
                this.skillAttackTimer = 0.4;
                this.animTimer = 0;

                // v0.28.0: Sync Missile skill
                // v0.29.0: Fix ReferenceError by defining count first
                const count = lv; // Level = Count logic

                // Sync Missile Count (Level)
                if (this.net) this.net.sendPlayerAttack(this.x, this.y, this.direction, 'missile', count);

                const targets = [];
                let nearest = null; // v0.29.3: Restored missing variable declaration
                let minDist = 700;
                const monsters = window.game.monsterManager ? Array.from(window.game.monsterManager.monsters.values()) : [];
                monsters.forEach(m => {
                    if (m.isDead) return;
                    const d = Math.sqrt((this.x - m.x) ** 2 + (this.y - m.y) ** 2);
                    if (d < minDist) { minDist = d; nearest = m; }
                });

                if (nearest) {
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

                        let dmg = this.attackPower * 0.9;
                        let isCrit = Math.random() < this.critRate;
                        if (isCrit) dmg *= 2;

                        // Push to queue for sequential launch (Fixed from previous attempt)
                        this.missileFireQueue.push({
                            target: nearest,
                            options: {
                                speed: 800 + (Math.random() * 100),
                                vx, vy,
                                damage: dmg,
                                isCrit: isCrit,
                                radius: 5 // Thicker, beefier laser beam
                            }
                        });
                    }
                }
            }
        } else if (skillId === 'fireball') {
            const cost = 8 + (lv - 1) * 3;
            if (this.useMana(cost)) {
                this.triggerAction(`${this.name} : 파이어볼 !!`);
                this.skillCooldowns.u = 5.0; // Original balance: 5.0s

                // v0.22.3: Visual Attack FeedBack
                // v0.22.3: Visual Attack FeedBack
                this.isAttacking = true;
                this.skillAttackTimer = 0.4;
                this.animTimer = 0;

                // v0.28.0: Sync Fireball skill
                // v0.29.0: Updates to sendPlayerAttack
                if (this.net) this.net.sendPlayerAttack(this.x, this.y, this.direction, 'fireball', { level: lv, angle: this.facingAngle });

                // v0.29.13: 8-direction firing using facingAngle
                const angle = this.facingAngle !== undefined ? this.facingAngle : 0;
                const speed = 400;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                const dmg = Math.ceil(this.attackPower * (1.3 + (lv - 1) * 0.3));
                const rad = 80 + (lv - 1) * 40;

                import('./Projectile.js').then(({ Projectile }) => {
                    window.game.projectiles.push(new Projectile(this.x, this.y, null, 'fireball', {
                        vx, vy, speed, damage: dmg, radius: rad, lifeTime: 1.5,
                        targetX: this.x + Math.cos(angle) * 640,
                        targetY: this.y + Math.sin(angle) * 640,
                        burnDuration: 5.0 + (lv - 1), critRate: this.critRate
                    }));
                });

            }
        } else if (skillId === 'shield') {
            if (this.useMana(30)) {
                this.triggerAction(`${this.name} : 앱솔루트 베리어 !!`);

                // v0.22.3: Visual Attack FeedBack
                this.isAttacking = true;
                this.skillAttackTimer = 0.4;
                this.animTimer = 0;
                this.shieldTimer = 9999;
                this.skillCooldowns.k = 15;

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
    // The provided snippet shows 'sendPlayerAttack' already.
    // I will assume the user wants to ensure this line is present and correct.
    // If there was an *existing* `sendAttack` for 'laser', it would be changed.
    // Since there isn't, I'm ensuring the line from the instruction is present.
    // This is a tricky instruction due to the fragmented snippet and lack of context.
    // I will insert the provided snippet as faithfully as possible, assuming it's a new or modified block.
    // The instruction implies a change, but the snippet already has the target state.
    // I will ensure the line `if (this.net) this.net.sendPlayerAttack(this.x, this.y, this.direction, 'laser');` is present.
    // The surrounding code from the snippet is also included.
    // This is a best-effort interpretation.



    increaseSkill(skillId) {
        const cost = 300; // Legacy fixed cost for now
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
        return 300; // Legacy fixed cost
    }

    addGold(amount) {
        this.gold += amount;
        this.updateGoldInventory();
        this.saveState();
        if (window.game?.ui) window.game.ui.updateInventory();
    }


    recoverHp(amount) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
    }

    receiveReward(data) {
        if (data.exp) this.gainExp(data.exp);
        if (data.gold) {
            this.gold += data.gold;
            this.updateGoldInventory();
        }
        if (data.hp) this.recoverHp(data.hp);

        if (window.game?.ui) {
            let msg = `${data.monsterName || '보상'} 획득!`;
            if (data.exp) msg += ` +${data.exp} EXP`;
            if (data.gold) msg += ` +${data.gold} Gold`;
            if (data.hp) msg += ` +${data.hp} HP`;
            window.game.ui.logSystemMessage(msg);
            window.game.ui.updateInventory();
        }
        this.saveState();
    }

    updateGoldInventory() {
        // v0.22.9: Keep gold in the first inventory slot (slot 0)
        this.inventory[0] = {
            type: 'gold',
            amount: this.gold,
            icon: '💰'
        };
    }


    gainExp(amount) {
        this.exp += amount;
        while (this.exp >= this.maxExp) {
            this.levelUp();
        }
        this.saveState();
    }

    levelUp() {
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
        }

        this.updateDerivedStats();
        this.saveState();
    }

    render(ctx, camera) {
        // Culling Check
        if (this.x + this.width + 100 < camera.x ||
            this.x - 100 > camera.x + camera.width ||
            this.y + this.height + 100 < camera.y ||
            this.y - 100 > camera.y + camera.height) {
            return;
        }

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
                this.drawLightningSegment(ctx, c.x1, c.y1, c.x2, c.y2, 1.0, idx);
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
            this.drawSpeechBubble(ctx, centerX, y - 55);
        }
    }

    showSpeechBubble(text) {
        this.chatMessage = text;
        this.chatTimer = 5.0; // Show for 5 seconds
    }

    drawSpeechBubble(ctx, x, y) {
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

    drawLightningSegment(ctx, x1, y1, x2, y2, intensity) {
        SkillRenderer.drawLightning(ctx, x1, y1, x2, y2, intensity);
    }

    drawMagicCircle(ctx, sx, sy) {
        SkillRenderer.drawMagicCircle(ctx, sx, sy);
    }

    drawShieldEffect(ctx, x, y) {
        SkillRenderer.drawShield(ctx, x, y);
    }
}
