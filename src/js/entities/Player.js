import Actor from './Actor.js';
import Logger from '../utils/Logger.js';
import { Sprite } from '../core/Sprite.js';

export default class Player extends Actor {
    constructor(x, y, name = "Hero") {
        super(x, y, 180); // Speed 180
        this.name = name;

        // Stats (Base)
        this.vitality = 1;
        this.intelligence = 3;
        this.wisdom = 2;
        this.agility = 1;
        this.statPoints = 0;

        // Derived Stats (Calculated)
        this.maxHp = 30; // 20 + 5*10
        this.hp = 20;
        this.maxMp = 50; // 30 + 5*10
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
        this.gold = 300;
        this.inventory = [];
        for (let i = 0; i < 20; i++) this.inventory.push(null); // 20 slots
        this.questData = {
            slimeKills: 0,
            slimeQuestClaimed: false,
            bossKilled: false,
            bossQuestClaimed: false
        };

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
        this.attackRange = 350; // Range for Chain Lightning
        this.isAttacking = false;
        this.isChanneling = false;
        this.chargeTime = 0;
        this.lightningTickTimer = 0;
        this.lightningEffect = null;
        this.attackCooldown = 0;
        this.regenTimer = 0;
        this.idleTimer = 0; // For regen wait logic

        // Running Logic (Matched with Solo)
        this.moveTimer = 0;
        this.isRunning = false;
        this.prevFacingDir = -1;
        this.runParticles = [];
        this.turnGraceTimer = 0;

        // Visuals
        this.sprite = null;
        this.direction = 1; // Default to Front
        this.animFrame = 0;
        this.animTimer = 0;
        this.animSpeed = 10; // FPS
        this.width = 48;
        this.height = 48;

        this.input = null;

        this.updateDerivedStats();
    }

    // Initialize with game dependencies
    init(inputManager, resourceManager, networkManager) {
        this.input = inputManager;
        this.net = networkManager;
        this._loadSpriteSheet(resourceManager);

        // Bind input actions to methods
        this.input.on('keydown', (action) => {
            if (action === 'ATTACK') this.attack();
            if (action === 'SKILL_1') this.useSkill(1);
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
        } catch (e) {
            Logger.error('Failed to load character sprite sheet', e);
        }
    }

    update(dt) {
        if (this.isDead) return;

        this._handleMovement(dt);
        this._updateCooldowns(dt);
        this._updateAnimation(dt);
        this._handleRegen(dt);

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
    }

    _handleRegen(dt) {
        // "대기 회복 로직: 2초 대기 후 매초 회복력만큼 HP/MP 회복"
        if (this.vx === 0 && this.vy === 0 && !this.isAttacking) {
            this.idleTimer += dt;
            if (this.idleTimer >= 2.0) {
                this.regenTimer += dt;
                if (this.regenTimer >= 1.0) {
                    this.regenTimer = 0;
                    if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.hpRegen);
                    if (this.mp < this.maxMp) this.mp = Math.min(this.maxMp, this.mp + this.mpRegen);
                }
            }
        } else {
            this.idleTimer = 0;
            this.regenTimer = 0;
        }
    }

    _handleMovement(dt) {
        if (!this.input) return;

        let vx = 0;
        let vy = 0;

        if (this.input.isPressed('MOVE_UP')) vy -= 1;
        if (this.input.isPressed('MOVE_DOWN')) vy += 1;
        if (this.input.isPressed('MOVE_LEFT')) vx -= 1;
        if (this.input.isPressed('MOVE_RIGHT')) vx += 1;

        if (vx !== 0 || vy !== 0) {
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

            // Direction Logic for Sprite Rows Restoration
            if (Math.abs(vx) > Math.abs(vy)) {
                this.direction = vx > 0 ? 3 : 2; // Right : Left
            } else {
                this.direction = vy > 0 ? 1 : 0; // Front : Back
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
        this.attackPower = 5 + (this.intelligence * 1) + Math.floor(this.wisdom / 2) + (this.level * 1);
        this.defense = this.vitality * 1;
        this.hpRegen = this.vitality * 1;
        this.mpRegen = this.wisdom * 1;

        this.attackSpeed = 1.0 + (this.agility * 0.1);
        this.moveSpeedBonus = 1.0 + (this.agility * 0.05);
        this.critRate = 0.1 + (this.agility * 0.01);

        this.speed = 180 * this.moveSpeedBonus;
    }

    updateDerivedStats() {
        this.refreshStats();
    }

    takeDamage(dmg) {
        if (this.isDead) return;
        const finalDmg = Math.max(1, dmg - this.defense);
        this.hp -= finalDmg;
        if (this.hp <= 0) {
            this.hp = 0;
            this.die();
        }
        // Save HP state (Optional: throttle if needed, but for now every hit or rely on interval)
        return finalDmg;
    }

    saveState() {
        if (!this.net || !this.id) return;
        const data = {
            level: this.level,
            exp: this.exp,
            gold: this.gold,
            vitality: this.vitality,
            intelligence: this.intelligence,
            wisdom: this.wisdom,
            agility: this.agility,
            statPoints: this.statPoints,
            skillLevels: this.skillLevels,
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
        this.gold = 300;
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

        const baseTickInterval = 0.7;
        const tickInterval = baseTickInterval / this.attackSpeed;
        const isTick = this.lightningTickTimer <= 0;

        if (isTick) {
            this.lightningTickTimer = tickInterval;
            this.animTimer = 0; // Restart attack animation
            if (this.net) {
                this.net.sendAttack(this.x, this.y, this.direction);
            }
        }

        const laserLv = this.skillLevels.laser || 1;
        // Formula: Base 50% ATK, Increment (10% + (Lv-1)*5%) per 0.3s charge
        const startRatio = 0.5;
        const tierIncrement = 0.10 + (laserLv - 1) * 0.05;
        const chargeSteps = Math.floor(this.chargeTime / 0.3);
        const finalDmgRatio = Math.min(1.5, startRatio + (chargeSteps * tierIncrement));

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
                        if (window.game?.net?.isHost || !nextTarget.isMonster) {
                            // PvP damage handled by attacker
                            if (!nextTarget.isMonster && this.net) {
                                this.net.sendPlayerDamage(nextTarget.id, dmg);
                            }
                        }
                        if (nextTarget.isMonster && window.game?.net?.isHost) nextTarget.lastAttackerId = window.game.net.playerId;
                        nextTarget.takeDamage(dmg, true, isCrit);
                    }

                    // Slow effect
                    if (nextTarget.applyElectrocuted) {
                        nextTarget.applyElectrocuted(3.0, 0.8);
                    }
                    this.recoverMana(1, true);
                }
                currentSource = { x: nextTarget.x, y: nextTarget.y };
            } else {
                break;
            }
        }

        if (chains.length > 0) {
            this.lightningEffect = { chains: chains, timer: 0.1 };
        } else {
            // Visualize a small burst in facing direction if no target
            let tx = centerX;
            let ty = centerY;
            const dist = 60;
            if (this.direction === 0) ty -= dist; // Back
            else if (this.direction === 1) ty += dist; // Front
            else if (this.direction === 2) tx -= dist; // Left
            else if (this.direction === 3) tx += dist; // Right

            this.lightningEffect = {
                chains: [{ x1: centerX, y1: centerY, x2: tx, y2: ty }],
                timer: 0.05
            };
        }
    }

    useSkill(slot) {
        Logger.log(`Skill ${slot} used`);
        // missiles and fireball to be added later if needed, slot 1 is usually basic attack or missile
    }

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

    respawn() {
        this.isDead = false;
        this.hp = this.maxHp;
        this.mp = this.maxMp;
        this.state = 'idle';
        // Teleport to safely (usually center or spawn point)
        // For now, keep at current or origin
        this.x = window.game?.zone?.width / 2 || 1000;
        this.y = window.game?.zone?.height / 2 || 1000;
        Logger.log('Player respawned');
    }

    getSkillUpgradeCost(skillId) {
        return 300; // Legacy fixed cost
    }

    addGold(amount) {
        this.gold += amount;
        this.saveState();
    }

    recoverHp(amount) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
    }

    receiveReward(data) {
        if (data.exp) this.gainExp(data.exp);
        if (data.gold) this.gold += data.gold; // addGold calls saveState
        if (data.hp) this.recoverHp(data.hp);

        if (window.game?.ui) {
            let msg = `${data.monsterName || '보상'} 획득!`;
            if (data.exp) msg += ` +${data.exp} EXP`;
            if (data.gold) msg += ` +${data.gold} Gold`;
            if (data.hp) msg += ` +${data.hp} HP`;
            window.game.ui.logSystemMessage(msg);
        }
        this.saveState();
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
        this.statPoints += 2; // Buffed reward
        this.hp = this.maxHp; // Heal on level up
        this.mp = this.maxMp;

        if (window.game?.ui) {
            window.game.ui.logSystemMessage(`✨ LEVEL UP! 현재 레벨: ${this.level}`);
            window.game.ui.updateStatusPopup();
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

            this.sprite.draw(ctx, row, col, drawX, drawY, drawW, drawH);
        } else {
            // Fallback (Circle)
            ctx.fillStyle = this.isAttacking ? '#ff6b6b' : '#0984e3';
            ctx.beginPath();
            ctx.arc(centerX, centerY, 16, 0, Math.PI * 2);
            ctx.fill();
        }

        // 5. HUD (HP/MP Bars & Name)
        this.drawHUD(ctx, centerX, y);

        // 6. Direction Arrow (At feet)
        this.drawDirectionArrow(ctx, centerX, y + this.height);
    }

    drawHUD(ctx, centerX, y) {
        // Dimensions matched with Original Solo (60x6 bars)
        const barWidth = 60;
        const barHeight = 8; // Slightly thicker for visibility
        const startY = y + this.height + 5; // Positioned at feet

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
        const nameY = y - 10;
        ctx.save();
        ctx.font = 'bold 16px "Nanum Gothic", "Outfit", sans-serif';
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
        let vx = 0, vy = 0;
        const diag = 0.707;
        switch (this.direction) {
            case 0: vx = 0; vy = -1; break; // Back
            case 1: vx = 0; vy = 1; break; // Front
            case 2: vx = -1; vy = 0; break; // Left
            case 3: vx = 1; vy = 0; break; // Right
        }

        const ax = sx + vx * dist;
        const ay = sy + vy * dist;
        const angle = Math.atan2(vy, vx);

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

    drawLightningSegment(ctx, x1, y1, x2, y2, intensity, segmentIndex = 0) {
        if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return;

        const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const minVisDist = 15;
        let targetX2 = x2;
        let targetY2 = y2;

        if (dist < minVisDist) {
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const finalAngle = dist < 1 ? (this.direction * 90 - 90) * (Math.PI / 180) : angle;
            targetX2 = x1 + Math.cos(finalAngle) * minVisDist;
            targetY2 = y1 + Math.sin(finalAngle) * minVisDist;
        }

        const steps = Math.max(2, Math.floor(Math.sqrt(dist) * 1.5));
        const points = [];
        points.push({ x: x1, y: y1 });

        const timeSeed = Math.floor(Date.now() / 100);

        for (let i = 1; i < steps; i++) {
            const ratio = i / steps;
            const px = x1 + (targetX2 - x1) * ratio;
            const py = y1 + (targetY2 - y1) * ratio;
            const seed = timeSeed + i + (segmentIndex * 10);
            const randomVal = (Math.sin(seed) * 10000) % 1;
            const offset = (randomVal - 0.5) * 20;

            const angle = Math.atan2(targetY2 - y1, targetX2 - x1) + Math.PI / 2;
            points.push({
                x: px + Math.cos(angle) * offset,
                y: py + Math.sin(angle) * offset
            });
        }
        points.push({ x: targetX2, y: targetY2 });

        const secondaryPoints = [];
        secondaryPoints.push({ x: x1, y: y1 });
        const secondSeedBase = timeSeed + 100 + (segmentIndex * 20);
        for (let i = 1; i < steps; i++) {
            const ratio = i / steps;
            const px = x1 + (targetX2 - x1) * ratio;
            const py = y1 + (targetY2 - y1) * ratio;
            const seed = secondSeedBase + i;
            const randomVal = (Math.sin(seed * 0.5) * 10000) % 1;
            const offset = (randomVal - 0.5) * 35;

            const angle = Math.atan2(targetY2 - y1, targetX2 - x1) + Math.PI / 2;
            secondaryPoints.push({
                x: px + Math.cos(angle) * offset,
                y: py + Math.sin(angle) * offset
            });
        }
        secondaryPoints.push({ x: targetX2, y: targetY2 });

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }

        ctx.strokeStyle = '#00d2ff';
        ctx.lineWidth = 20 * intensity;
        ctx.shadowBlur = 35;
        ctx.shadowColor = '#00d2ff';
        ctx.stroke();

        ctx.strokeStyle = '#48dbfb';
        ctx.lineWidth = 10 * intensity;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ffffff';
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5 * intensity;
        ctx.shadowBlur = 0;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(secondaryPoints[0].x, secondaryPoints[0].y);
        for (let i = 1; i < secondaryPoints.length; i++) {
            ctx.lineTo(secondaryPoints[i].x, secondaryPoints[i].y);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.5 * intensity;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00d2ff';
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#48dbfb';
        ctx.beginPath();
        ctx.arc(targetX2, targetY2, 8 * intensity, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    drawMagicCircle(ctx, sx, sy) {
        ctx.save();
        const time = Date.now() * 0.002;
        const radiusInner = 40;
        const radiusOuter = 50;
        const timeSeed = Math.floor(Date.now() / 100);
        const Y_SCALE = 0.45;

        ctx.translate(sx, sy);

        const addLightningPath = (x1, y1, x2, y2, segments = 3, spread = 8) => {
            ctx.moveTo(x1, y1);
            for (let i = 1; i < segments; i++) {
                const ratio = i / segments;
                const px = x1 + (x2 - x1) * ratio;
                const py = y1 + (y2 - y1) * ratio;
                const seed = timeSeed + i + x1 + y1;
                const offset = (Math.sin(seed * 999) * spread);
                const angle = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
                ctx.lineTo(px + Math.cos(angle) * offset, py + Math.sin(angle) * offset);
            }
            ctx.lineTo(x2, y2);
        };

        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00d2ff';
        ctx.strokeStyle = 'rgba(72, 219, 251, 0.7)';

        const radiusRim = radiusOuter * 1.08;
        const circleSegments = 16;
        [radiusRim, radiusOuter, radiusInner].forEach((r, idx) => {
            ctx.lineWidth = idx === 0 ? 1 : (idx === 1 ? 2 : 1.5);
            ctx.beginPath();
            for (let i = 0; i < circleSegments; i++) {
                const a1 = (i / circleSegments) * Math.PI * 2;
                const a2 = ((i + 1) / circleSegments) * Math.PI * 2;
                const x1 = Math.cos(a1) * r;
                const y1 = Math.sin(a1) * r * Y_SCALE;
                const x2 = Math.cos(a2) * r;
                const y2 = Math.sin(a2) * r * Y_SCALE;
                addLightningPath(x1, y1, x2, y2, 2, 4);
            }
            ctx.stroke();
        });

        const hexRotation = time * 0.45;
        ctx.lineWidth = 2.5;

        const triangles = [[0, 2, 4], [1, 3, 5]];
        for (let tIndex = 0; tIndex < 2; tIndex++) {
            const points = [];
            for (let j = 0; j < 3; j++) {
                const vertexIndex = triangles[tIndex][j];
                const hexAngle = (vertexIndex * (Math.PI * 2) / 6) + hexRotation - (Math.PI / 2);
                points.push({
                    x: Math.cos(hexAngle) * radiusInner,
                    y: Math.sin(hexAngle) * radiusInner * Y_SCALE
                });
            }

            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            ctx.lineTo(points[1].x, points[1].y);
            ctx.lineTo(points[2].x, points[2].y);
            ctx.closePath();

            ctx.shadowBlur = 15;
            ctx.shadowColor = '#00d2ff';
            ctx.stroke();
        }

        const runeRotation = -time * 0.3;
        ctx.strokeStyle = 'rgba(150, 240, 255, 0.7)';
        ctx.lineWidth = 1.5;
        const runeCount = 12;
        const runeRadius = 45;

        const drawRunePoly = (cx, cy, rotationAngle, localPoints) => {
            ctx.beginPath();
            let first = true;
            localPoints.forEach(pt => {
                const rx = pt.x * Math.cos(rotationAngle) - pt.y * Math.sin(rotationAngle);
                const ry = pt.x * Math.sin(rotationAngle) + pt.y * Math.cos(rotationAngle);
                const finalX = cx + rx;
                const finalY = cy + (ry * Y_SCALE);
                if (first) { ctx.moveTo(finalX, finalY); first = false; }
                else { ctx.lineTo(finalX, finalY); }
            });
            ctx.stroke();
        };

        for (let i = 0; i < runeCount; i++) {
            const angle = (i / runeCount) * Math.PI * 2 + runeRotation;
            const cx = Math.cos(angle) * runeRadius;
            const cy = Math.sin(angle) * runeRadius * Y_SCALE;
            const facing = angle + Math.PI / 2;

            if (i % 4 === 0) {
                drawRunePoly(cx, cy, facing, [{ x: -3, y: -5 }, { x: 0, y: 0 }, { x: 3, y: -5 }]);
                drawRunePoly(cx, cy, facing, [{ x: 0, y: 0 }, { x: 0, y: 5 }]);
            } else if (i % 4 === 1) {
                drawRunePoly(cx, cy, facing, [{ x: -3, y: -4 }, { x: 3, y: -4 }, { x: -3, y: 4 }, { x: 3, y: 4 }]);
                drawRunePoly(cx, cy, facing, [{ x: 0, y: -4 }, { x: 0, y: 4 }]);
            } else if (i % 4 === 2) {
                drawRunePoly(cx, cy, facing, [{ x: 0, y: -5 }, { x: 3, y: 0 }, { x: 0, y: 5 }, { x: -3, y: 0 }, { x: 0, y: -5 }]);
            } else {
                drawRunePoly(cx, cy, facing, [{ x: -2, y: -5 }, { x: -2, y: 5 }]);
                drawRunePoly(cx, cy, facing, [{ x: 2, y: -5 }, { x: 2, y: 5 }]);
                drawRunePoly(cx, cy, facing, [{ x: -4, y: 0 }, { x: 4, y: 0 }]);
            }
        }
        ctx.restore();
    }
}
