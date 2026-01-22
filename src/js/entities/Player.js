import { Sprite } from '../core/Sprite.js';

export default class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 120;
        this.height = 120;
        this.speed = 220;
        this.direction = 1; // 0:Back, 1:Front, 2:Left, 3:Right (Sprite row index)
        this.facingDir = 4; // 0:N, 1:NE, 2:E, 3:SE, 4:S, 5:SW, 6:W, 7:NW (Logic direction)

        this.frame = 0;
        this.isMoving = false;
        this.isAttacking = false;
        this.timer = 0;
        this.frameSpeed = 0.12;
        this.sprite = null;
        this.ready = false;

        this.actionFdbk = null;
        this.actionTimer = 0;

        // Player Name
        this.name = localStorage.getItem('yurika_player_name') || '유리카';

        // Stats & Level System
        this.gold = 0;
        this.exp = 0;
        this.level = 1;
        this.maxExp = 100;
        this.hp = 20;
        this.maxHp = 20;
        this.mp = 30;
        this.maxMp = 30;

        // RPG Stats
        this.statPoints = 0;
        this.gold = 0; // Ensure gold is initialized
        this.questData = {
            slimeKills: 0,
            bossKilled: false,
            slimeQuestClaimed: false,
            bossQuestClaimed: false,
            _slimeMsgShown: false,
            _bossMsgShown: false
        };
        this.skillLevels = {
            laser: 1,
            missile: 1,
            fireball: 1,
            shield: 1
        };
        this.vitality = 1;
        this.intelligence = 5;
        this.wisdom = 2;
        this.agility = 1;

        // Derived Stats
        this.attackPower = 10;
        this.attackSpeed = 1.0;
        this.critRate = 0.1;
        this.moveSpeedMult = 1.0;
        this.defense = 0;
        this.hpRegen = 0;
        this.mpRegen = 0;

        // MP Recovery Timer
        this.stillTimer = 0;

        // Inventory system (16 slots grid in UI usually)
        this.inventory = new Array(16).fill(null);

        // Cooldowns
        this.attackCooldown = 0;
        this.baseAttackDelay = 0.6;
        this.skillCooldowns = { u: 0, k: 0, h: 0, j: 0 };
        this.skillMaxCooldowns = { u: 5.0, k: 15.0, h: 2.0, j: 0.8 }; // Fireball, Shield, Missile, Attack

        // Shield & Status
        this.shieldTimer = 0;
        this.isShieldActive = false;
        this.lightningEffect = null; // { chains: [{x1, y1, x2, y2}, ...], timer }

        // Running Logic
        this.moveTimer = 0;
        this.isRunning = false;
        this.prevFacingDir = -1;
        this.runParticles = [];
        this.turnGraceTimer = 0;

        // Channeling (Chain Lightning)
        this.chargeTime = 0;
        this.isChanneling = false;
        this.lightningTickTimer = 0;

        this.init();
        this.refreshStats();
        // Ensure starting at max
        this.mp = this.maxMp;

        this.isDead = false;
    }

    takeDamage(amount) {
        let finalHpDamage = amount;
        let manaDamage = 0;

        if (this.shieldTimer > 0) {
            // Absolute Barrier Logic: Block 1 hit completely
            this.shieldTimer = 0; // Remove shield immediately after hit
            this.isShieldActive = false;

            if (window.game) {
                window.game.addDamageText(this.x, this.y - 40, "BLOCK", '#ffffff', true); // White Block text
                window.game.ui.logSystemMessage("앱솔루트 베리어가 피해를 막아냈습니다!");
            }
            return; // No damage taken
        } else {
            finalHpDamage = Math.max(1, amount - (this.defense || 0));
        }

        this.hp = Math.max(0, this.hp - finalHpDamage);

        if (manaDamage > 0 && window.game) {
            window.game.addDamageText(this.x, this.y - 20, `-${Math.round(manaDamage)}`, '#48dbfb');
        }

        if (finalHpDamage > 0 && window.game) {
            window.game.addDamageText(this.x, this.y - 40, `-${Math.round(finalHpDamage)}`, '#ff4757');
        }

        if (this.hp < 1 && !this.isDead) {
            this.isDead = true;
            this.hp = 0;
            this.triggerAction('DIED');
            if (window.game?.ui) {
                window.game.ui.showDeathModal();
            }
        }
    }

    respawn() {
        this.hp = this.maxHp;
        this.mp = this.maxMp;
        this.x = 1000;
        this.y = 1000;
        this.isDead = false;
        this.triggerAction('RESPAWN');
        if (window.game) {
            window.game.playerHasAttacked = false; // Reset peace mode on respawn
        }
    }

    recoverHp(amount) {
        const recover = Math.min(this.maxHp - this.hp, amount);
        if (recover <= 0) return;
        this.hp += recover;
        if (window.game) {
            window.game.addDamageText(this.x, this.y - 40, `+${Math.round(recover)}`, '#4ade80');
            if (window.game.ui) window.game.ui.logSystemMessage(`체력이 ${Math.round(recover)} 회복되었습니다.`);
        }
    }

    useMana(amount) {
        if (this.mp >= amount) {
            this.mp -= amount;
            // Feedback for mana loss
            if (window.game) {
                window.game.addDamageText(this.x, this.y - 20, `-${amount}`, '#48dbfb');
            }
            return true;
        }
        if (window.game?.ui) window.game.ui.logSystemMessage('마나가 부족합니다!');
        return false;
    }

    recoverMana(amount, showFeedback = false) {
        const recover = Math.min(this.maxMp - this.mp, amount);
        if (recover <= 0) return;
        this.mp += recover;
        if (showFeedback && window.game) {
            window.game.addDamageText(this.x, this.y - 20, `+${Math.round(recover)}`, '#48dbfb');
        }
    }

    async init() {
        // Optimization: Parallel loading of images
        const categories = {
            'front': { path: 'assets/resource/magicion_front', frames: ['1.png', '2.png', '3.png', '4.png', '5.png', '6.png', '7.png', '8.png'] },
            'back': { path: 'assets/resource/magicion_back', frames: ['1.png', '2.png', '3.png', '4.png', '5.png'] },
            'left': { path: 'assets/resource/magicion_left', frames: ['1.png', '2.png', '3.png', '4.png', '5.png', '6.png', '7.png'] },
            'right': { path: 'assets/resource/magicion_right', frames: ['4.png', '5.png', '6.png', '7.png', '8.png', '9.png', '05.png'] },
            'attack': { path: 'assets/resource/magician_attack', frames: ['1.png', '2.png', '3.png', '4.png', '5.png', '6.png'] }
        };

        const maxFrames = 8;
        const targetW = 256;
        const targetH = 256;

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetW * maxFrames;
        finalCanvas.height = targetH * 5;
        const finalCtx = finalCanvas.getContext('2d');

        this.sprite = new Sprite(finalCanvas, maxFrames, 5);
        this.frameCounts = { 1: 8, 0: 5, 2: 7, 3: 7, 4: 6 };
        const loadPromises = [];

        for (const [key, menu] of Object.entries(categories)) {
            let rowIndex = 0;
            switch (key) {
                case 'back': rowIndex = 0; break;
                case 'front': rowIndex = 1; break;
                case 'left': rowIndex = 2; break;
                case 'right': rowIndex = 3; break;
                case 'attack': rowIndex = 4; break;
            }

            menu.frames.forEach((frameFile, i) => {
                const img = new Image();
                const v = '1.76';
                img.src = `${menu.path}/${frameFile}?v=${v}`;
                const p = new Promise((resolve) => {
                    img.onload = () => {
                        this.processAndDrawFrame(img, finalCtx, i * targetW, rowIndex * targetH, targetW, targetH);
                        // Update UI portrait only once on first front frame
                        if (key === 'front' && i === 0 && window.game?.ui) {
                            window.game.ui.setPortrait(finalCanvas);
                        }
                        resolve();
                    };
                    img.onerror = resolve;
                });
                loadPromises.push(p);
            });
        }

        await Promise.all(loadPromises);
        this.ready = true;
    }

    processAndDrawFrame(img, ctx, destX, destY, destW, destH) {
        if (!this._tempCanvas) {
            this._tempCanvas = document.createElement('canvas');
            this._tempCtx = this._tempCanvas.getContext('2d', { willReadFrequently: true });
        }

        this._tempCanvas.width = img.width;
        this._tempCanvas.height = img.height;
        this._tempCtx.drawImage(img, 0, 0);

        const imgData = this._tempCtx.getImageData(0, 0, img.width, img.height);
        const data = imgData.data;

        let minX = img.width, maxX = 0, minY = img.height, maxY = 0;
        let foundPixels = false;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const isGreen = (g > 140 && g > r * 1.1 && g > b * 1.1);
            const isLightBG = (g > 200 && r > 200 && b > 200);

            if (isGreen || isLightBG) {
                data[i + 3] = 0;
            } else if (data[i + 3] > 50) {
                const x = (i / 4) % img.width;
                const y = Math.floor((i / 4) / img.width);
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                foundPixels = true;
            }
        }

        if (foundPixels) {
            this._tempCtx.putImageData(imgData, 0, 0);
            const charW = maxX - minX + 1;
            const charH = maxY - minY + 1;
            const scale = Math.min(destW / charW, destH / charH) * 0.95;
            const drawW = charW * scale;
            const drawH = charH * scale;
            const offX = (destW - drawW) / 2;
            const offY = (destH - drawH) / 2;
            ctx.drawImage(this._tempCanvas, minX, minY, charW, charH, destX + offX, destY + offY, drawW, drawH);
        }
    }

    refreshStats() {
        this.maxHp = 20 + (this.vitality * 10);
        this.defense = this.vitality * 1;
        this.hpRegen = this.vitality * 1;

        this.maxMp = 30 + (this.wisdom * 10);
        this.mpRegen = this.wisdom * 1;

        // INT: 1 INT = +1 ATK
        // WIS: 2 WIS = +1 ATK
        this.attackPower = 5 + (this.intelligence * 1) + Math.floor(this.wisdom / 2) + (this.level * 1);

        // Agility: 1 AGI = +5% Speed, +0.1 Attack Speed, +1% Crit
        this.moveSpeedMult = 1.0 + (this.agility * 0.05);
        this.attackSpeed = 1.0 + (this.agility * 0.1);
        this.critRate = 0.1 + (this.agility * 0.01);

        if (window.game?.ui) {
            window.game.ui.updateStatusPopup();
        }
    }

    addExp(amount) {
        this.exp += amount;
        if (window.game?.ui) {
            window.game.ui.logSystemMessage(`경험치를 ${Math.floor(amount)} 획득했습니다.`);
            window.game.ui.updateStatusPopup();
        }
        if (this.exp >= this.maxExp) {
            this.levelUp();
        }
    }

    levelUp() {
        this.level++;
        this.exp -= this.maxExp;
        this.maxExp = Math.floor(this.maxExp * 1.5);
        this.statPoints += 3; // Grant 3 stat points (requested)

        this.refreshStats();
        this.hp = this.maxHp;
        this.mp = this.maxMp;

        this.triggerAction('LEVEL UP!!');
        if (window.game?.ui) {
            window.game.ui.logSystemMessage(`축하합니다! 레벨 ${this.level}이 되었습니다! (스탯 +3)`);
        }
    }

    addGold(amount) {
        this.gold += amount;
        if (window.game?.ui) {
            window.game.ui.logSystemMessage(`${amount} 골드를 획득했습니다.`);
            window.game.ui.updateInventory();
        }
        // Also ensure gold is in inventory as an item if we want to show it there
        this.addToInventory({ id: 'gold', name: 'Gold', amount: amount, icon: '💰' });
    }

    addToInventory(item) {
        // Simple stacking for gold
        if (item.id === 'gold') {
            const existing = this.inventory.find(slot => slot && slot.id === 'gold');
            if (existing) {
                existing.amount += item.amount;
                return true;
            }
        }

        // Find empty slot
        const emptyIdx = this.inventory.findIndex(slot => slot === null);
        if (emptyIdx !== -1) {
            this.inventory[emptyIdx] = { ...item };
            return true;
        }
        return false;
    }

    increaseStat(statName) {
        if (this.statPoints <= 0) return false;

        if (statName === 'vitality') this.vitality++;
        else if (statName === 'intelligence') this.intelligence++;
        else if (statName === 'wisdom') this.wisdom++;
        else if (statName === 'agility') this.agility++;
        else return false;

        this.statPoints--;
        this.refreshStats();
        return true;
    }

    getSkillUpgradeCost(skillId) {
        if (skillId === 'shield') return 0; // Not upgradable
        const currentLv = this.skillLevels[skillId] || 1;
        // Level 1 -> 2: 300
        // Level 2 -> 3: 600
        // Level 3 -> 4: 1200
        return 300 * Math.pow(2, currentLv - 1);
    }

    increaseSkill(skillId) {
        if (!this.skillLevels.hasOwnProperty(skillId)) return false;
        if (skillId === 'shield') return false; // Cannot upgrade Absolute Barrier

        const cost = this.getSkillUpgradeCost(skillId);
        if (this.gold < cost) {
            if (window.game?.ui) window.game.ui.logSystemMessage(`골드가 부족합니다! (필요: ${cost})`);
            return false;
        }

        this.gold -= cost;
        this.skillLevels[skillId]++;

        // Sync Inventory Gold
        const goldItem = this.inventory.find(item => item && item.id === 'gold');
        if (goldItem) {
            goldItem.amount = this.gold;
            if (goldItem.amount <= 0) {
                // Optional: Remove if 0, or just keep as 0
                // For now, keep as 0 or simply update logic to sync perfectly
                const idx = this.inventory.indexOf(goldItem);
                if (this.gold === 0) this.inventory[idx] = null;
            }
        }

        if (window.game?.ui) {
            window.game.ui.logSystemMessage(`${skillId} 스킬 레벨 업! (현재: ${this.skillLevels[skillId]})`);
            window.game.ui.updateSkillPopup();
            window.game.ui.updateInventory(); // Update gold display in inventory if needed
        }
        return true;
    }

    triggerAction(actionName) {
        // Requested: Filter out 'ATTACK' text but keep motion
        if (actionName !== 'ATTACK') {
            this.actionFdbk = actionName;
            this.actionTimer = 1.0;
        }

        const isCombatAction = actionName.toUpperCase().includes('ATTACK') ||
            actionName.toUpperCase().includes('SKILL') ||
            actionName.toUpperCase().includes('LASER') ||
            actionName.toUpperCase().includes('SHIELD') ||
            actionName.includes('!!'); // v1.64: Trigger motion for any skill shout

        if (isCombatAction) {
            this.isAttacking = true;
            this.frame = 0;
            this.timer = 0;
        }
    }

    update(dt, input) {
        if (!this.sprite || this.isDead) return;

        if (this.actionTimer > 0) {
            this.actionTimer -= dt;
            if (this.actionTimer <= 0) this.actionFdbk = null;
        }

        if (this.attackCooldown > 0) {
            // Speed up cooldown based on attackSpeed
            this.attackCooldown -= dt * this.attackSpeed;
        }

        // Tick individual skill cooldowns
        for (let key in this.skillCooldowns) {
            if (this.skillCooldowns[key] > 0) {
                this.skillCooldowns[key] -= dt;
            }
        }

        if (this.shieldTimer > 0) {
            this.shieldTimer -= dt;
            if (this.shieldTimer <= 0) {
                this.isShieldActive = false;
                if (window.game?.ui) window.game.ui.logSystemMessage('방어막이 사라졌습니다.');
            }
        }

        if (this.lightningEffect) {
            this.lightningEffect.timer -= dt;
            if (this.lightningEffect.timer <= 0) this.lightningEffect = null;
        }

        if (window.game?.ui) {
            const expPerc = (this.exp / this.maxExp) * 100;
            window.game.ui.updateStats(
                (this.hp / this.maxHp) * 100,
                (this.mp / this.maxMp) * 100,
                this.level,
                expPerc
            );
        }

        if (this.isAttacking) {
            this.timer += dt;
            if (this.timer >= 0.08) {
                this.timer = 0;
                this.frame++;
                if (this.frame >= (this.frameCounts[4] || 6)) {
                    this.isAttacking = false;
                    this.frame = 0;
                }
            }
            return;
        }

        const move = input.getMovement();
        let vx = move.x;
        let vy = move.y;

        // Click-to-Move Logic for PC
        if (window.game?.input?.touchMovePos) {
            const touch = window.game.input.touchMovePos;
            const cam = window.game.camera;
            const rect = window.game.canvas.getBoundingClientRect();
            const zoom = window.game.zoom;

            // Screen to World Conversion: ((ScreenPos - CanvasOffset) / Zoom) + CameraOffset
            // Captured ONCE at click time to prevent drifting
            this.moveTarget = {
                x: ((touch.x - rect.left) / zoom) + cam.x,
                y: ((touch.y - rect.top) / zoom) + cam.y
            };
            window.game.input.touchMovePos = null;
        }

        // Cancel click-to-move if keyboard keys are used
        if (vx !== 0 || vy !== 0) {
            this.moveTarget = null;
        }

        if (vx === 0 && vy === 0 && this.moveTarget) {
            const dx = this.moveTarget.x - this.x;
            const dy = this.moveTarget.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 5) { // Stop when close enough
                vx = dx / dist;
                vy = dy / dist;
            } else {
                this.moveTarget = null;
            }
        }

        if (vx !== 0 || vy !== 0) {
            // 8-directional logic
            const angle = Math.atan2(vy, vx) * (180 / Math.PI);
            let snapAngle = Math.round(angle / 45) * 45;
            if (snapAngle === -180) snapAngle = 180;

            if (snapAngle === -90) this.facingDir = 0;
            else if (snapAngle === -45) this.facingDir = 1;
            else if (snapAngle === 0) this.facingDir = 2;
            else if (snapAngle === 45) this.facingDir = 3;
            else if (snapAngle === 90) this.facingDir = 4;
            else if (snapAngle === 135) this.facingDir = 5;
            else if (snapAngle === 180) this.facingDir = 6;
            else if (snapAngle === -135) this.facingDir = 7;

            // Running logic
            if (this.facingDir === this.prevFacingDir) {
                this.moveTimer += dt;
                // If we were in grace and kept the direction, just snap back to running
                if (this.turnGraceTimer > 0 && this.moveTimer >= 0.1) {
                    this.isRunning = true;
                    this.turnGraceTimer = 0;
                }
                if (this.moveTimer >= 0.5) { // v1.63: 1.5s -> 0.5s
                    this.isRunning = true;
                }
            } else {
                // If we were running, give 0.5s grace to keep speed
                if (this.isRunning) {
                    this.turnGraceTimer = 0.5;
                }
                this.moveTimer = 0;
                this.isRunning = false;
            }
            this.prevFacingDir = this.facingDir;

            if (this.turnGraceTimer > 0) {
                this.turnGraceTimer -= dt;
            }

            const speedMult = (this.isRunning || this.turnGraceTimer > 0) ? 1.3 : 1.0;
            const finalSpeed = this.speed * this.moveSpeedMult * speedMult;
            const nextX = this.x + vx * finalSpeed * dt;
            const nextY = this.y + vy * finalSpeed * dt;

            // Collision Detection with Monsters
            let canMoveX = true;
            let canMoveY = true;
            const collisionRadius = 40; // Approximate radius

            if (window.game && window.game.monsters) {
                for (const monster of window.game.monsters) {
                    if (monster.isDead) continue;

                    // Predict X movement
                    const distX = Math.sqrt((nextX - monster.x) ** 2 + (this.y - monster.y) ** 2);
                    if (distX < collisionRadius) canMoveX = false;

                    // Predict Y movement
                    const distY = Math.sqrt((this.x - monster.x) ** 2 + (nextY - monster.y) ** 2);
                    if (distY < collisionRadius) canMoveY = false;
                }
            }

            if (canMoveX) this.x = nextX;
            if (canMoveY) this.y = nextY;

            // Map Boundary Clamping (0-2000)
            this.x = Math.max(0, Math.min(2000, this.x));
            this.y = Math.max(0, Math.min(2000, this.y));

            this.isMoving = true;

            // Reset standing timer
            this.stillTimer = 0;

            // Map to 4-way sprite
            if (this.facingDir === 0 || this.facingDir === 1 || this.facingDir === 7) this.direction = 0; // Back
            else if (this.facingDir === 4 || this.facingDir === 3 || this.facingDir === 5) this.direction = 1; // Front
            else if (this.facingDir === 2) this.direction = 3; // Right
            else if (this.facingDir === 6) this.direction = 2; // Left
        } else {
            this.isMoving = false;
            this.moveTimer = 0;
            this.isRunning = false;
            this.turnGraceTimer = 0;

            // Standing still logic: 1 MP/s + 1 per 5 WIS after 3s
            // Standing still logic: 2s wait -> Regen MP/HP based on stats
            this.stillTimer += dt;
            if (this.stillTimer >= 2.0) {
                this.mp = Math.min(this.maxMp, this.mp + (this.mpRegen || 0) * dt);
                this.hp = Math.min(this.maxHp, this.hp + (this.hpRegen || 0) * dt);
            }
        }

        if (this.isMoving) {
            this.timer += dt;
            const maxF = this.frameCounts[this.direction] || 1;
            const currentFrameSpeed = (this.isRunning || this.turnGraceTimer > 0) ? this.frameSpeed * 0.7 : this.frameSpeed;
            if (this.timer >= currentFrameSpeed) {
                this.timer = 0;
                this.frame = (this.frame + 1) % maxF;
            }
        } else {
            this.frame = 0;
        }

        if (this.isRunning && this.isMoving) {
            if (Math.random() < 0.3) {
                this.runParticles.push({
                    x: this.x + (Math.random() - 0.5) * 180, // v1.63: 60 -> 180 (3x wider)
                    y: this.y + 30 + (Math.random() - 0.5) * 10,
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

        // updateStats moved to top of update() to prevent skipping during animation
    }

    draw(ctx, camera) {
        if (!this.sprite) return;
        let screenX = Math.round(this.x - camera.x);
        let screenY = Math.round(this.y - camera.y);

        // v1.67: Ground Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(screenX, screenY + this.height / 2, this.width / 2 * 0.7, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // v1.70: High-Voltage Magic Circle during Channeling OR Attack
        if ((this.isChanneling || this.isAttacking) && !this.isDead) {
            this.drawMagicCircle(ctx, screenX, screenY + this.height / 2);
        }

        // v1.71: High-Voltage Attack Sparks (Chaotic discharges)
        if (this.isAttacking && !this.isDead) {
            ctx.save();
            const timeSeed = Math.floor(Date.now() / 100);
            for (let i = 0; i < 3; i++) {
                const sparkX = screenX + (Math.random() - 0.5) * this.width;
                const sparkY = screenY + (Math.random() - 0.5) * this.height;

                // v1.72 Hotfix: Use local ctx instead of this.ctx
                ctx.globalAlpha = 0.7;
                this.drawLightningSegment(ctx, screenX, screenY - 10, sparkX, sparkY, 0.4, i + 50);
            }
            ctx.restore();
        }

        // Draw Run Particles
        this.runParticles.forEach(p => {
            ctx.fillStyle = `rgba(200, 200, 200, ${p.life * 1.5})`;
            ctx.beginPath();
            ctx.arc(p.x - camera.x, p.y - camera.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw Lightning (Chain Lightning Effect)
        if (this.lightningEffect) {
            ctx.save();
            const lifeRatio = this.lightningEffect.timer / 0.15; // Shorter fade for channeling
            ctx.globalAlpha = lifeRatio;

            this.lightningEffect.chains.forEach((segment, idx) => {
                this.drawLightningSegment(ctx, segment.x1 - camera.x, segment.y1 - camera.y, segment.x2 - camera.x, segment.y2 - camera.y, lifeRatio, idx);
            });

            ctx.restore();
        }

        let row = this.isAttacking ? 4 : this.direction;
        let col = this.frame;
        this.sprite.draw(ctx, row, col, screenX - this.width / 2, screenY - this.height / 2, this.width, this.height, false);

        // v1.79: Replaced Self Spark with Monster-style Electrocuted Effect
        if ((this.isChanneling || this.isAttacking) && !this.isDead) {
            ctx.save();

            // Cache bolts to slow down flicker (same as Monster)
            const now = Date.now();
            if (!this.auraBolts || (now - (this.auraLastUpdate || 0) > 100)) {
                this.auraBolts = [];
                this.auraLastUpdate = now;
                for (let i = 0; i < 2; i++) { // 2 bolts
                    const rx = screenX + (Math.random() - 0.5) * this.width * 0.9;
                    const ry = screenY + (Math.random() - 0.5) * this.height * 0.9;

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
                ctx.lineWidth = 3.5;
                ctx.shadowBlur = 12;
                ctx.shadowColor = '#00d2ff';
                ctx.stroke();

                // Pass 2: White Sharp Core
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.2;
                ctx.shadowBlur = 0;
                ctx.stroke();
            });
            ctx.restore();
        }

        // Draw Shield Visual
        if (this.shieldTimer > 0) {
            ctx.save();
            ctx.strokeStyle = 'rgba(72, 219, 251, 0.6)';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.width / 2 + 10, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = 'rgba(72, 219, 251, 0.1)';
            ctx.fill();
            ctx.restore();
        }

        // Speech Bubble for Action Feedback
        if (this.actionFdbk) {
            const bubbleY = screenY - this.height / 2 - 60;
            const bubbleText = this.actionFdbk;
            ctx.font = 'bold 14px "Outfit", sans-serif';
            const textWidth = ctx.measureText(bubbleText).width;
            const bubbleWidth = textWidth + 20;
            const bubbleHeight = 28;
            const bubbleX = screenX - bubbleWidth / 2;

            // Speech bubble background (Compatibility safe)
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

            // Speech bubble tail (small triangle pointing down)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.beginPath();
            ctx.moveTo(screenX - 6, bubbleY + bubbleHeight);
            ctx.lineTo(screenX, bubbleY + bubbleHeight + 6);
            ctx.lineTo(screenX + 6, bubbleY + bubbleHeight);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(200, 200, 200, 0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Speech bubble text
            ctx.fillStyle = '#4a3e35';
            ctx.textAlign = 'center';
            ctx.fillText(bubbleText, screenX, bubbleY + bubbleHeight / 2 + 5);
        }

        // Player Name (back to top - adjusted down by 5px more)
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

        // UI Layout below character (HP/MP Bars only)
        const barWidth = 60;
        const barHeight = 6;
        const startY = screenY + this.height / 2 + 5;

        // HP Bar
        const barY = startY;
        // HP Bar background
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(screenX - barWidth / 2, barY, barWidth, barHeight);
        // HP Bar foreground
        const hpPercent = Math.max(0, Math.min(1, this.hp / this.maxHp));
        ctx.fillStyle = hpPercent > 0.3 ? '#4ade80' : '#ef4444';
        ctx.fillRect(screenX - barWidth / 2, barY, barWidth * hpPercent, barHeight);

        // MP Bar
        const mpBarY = barY + barHeight + 2;
        // MP Bar background
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(screenX - barWidth / 2, mpBarY, barWidth, barHeight);
        // MP Bar foreground
        const mpPercent = Math.max(0, Math.min(1, this.mp / this.maxMp));
        ctx.fillStyle = '#48dbfb';
        ctx.fillRect(screenX - barWidth / 2, mpBarY, barWidth * mpPercent, barHeight);

        // Draw Direction Arrow
        this.drawDirectionArrow(ctx, screenX, screenY);
    }

    drawDirectionArrow(ctx, sx, sy) {
        ctx.save();
        const dist = 60;
        let vx = 0, vy = 0;
        const diag = 0.707;
        switch (this.facingDir) {
            case 0: vx = 0; vy = -1; break;
            case 1: vx = diag; vy = -diag; break;
            case 2: vx = 1; vy = 0; break;
            case 3: vx = diag; vy = diag; break;
            case 4: vx = 0; vy = 1; break;
            case 5: vx = -diag; vy = diag; break;
            case 6: vx = -1; vy = 0; break;
            case 7: vx = -diag; vy = -diag; break;
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

        // Improvement: Ensure visiblity when extremely close by adding a minimum rendering length
        const minVisDist = 15;
        let targetX2 = x2;
        let targetY2 = y2;

        if (dist < minVisDist) {
            const angle = Math.atan2(y2 - y1, x2 - x1);
            // If they are literally at the same spot, just pick physical direction
            const finalAngle = dist < 1 ? (this.facingDir * 45 - 90) * (Math.PI / 180) : angle;
            targetX2 = x1 + Math.cos(finalAngle) * minVisDist;
            targetY2 = y1 + Math.sin(finalAngle) * minVisDist;
        }

        const steps = Math.max(2, Math.floor(Math.sqrt(dist) * 1.5));
        const points = [];
        points.push({ x: x1, y: y1 });

        // v1.65: Slower flicker logic for attack segment
        // Use time-based stable "randomness" for 100ms
        const timeSeed = Math.floor(Date.now() / 100);

        for (let i = 1; i < steps; i++) {
            const ratio = i / steps;
            const px = x1 + (targetX2 - x1) * ratio;
            const py = y1 + (targetY2 - y1) * ratio;

            // v1.66: Stable seed based on segmentID + timeSeed (avoids jitter when moving)
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

        // v1.66: Add a secondary "High Voltage" strand
        const secondaryPoints = [];
        secondaryPoints.push({ x: x1, y: y1 });
        const secondSeedBase = timeSeed + 100 + (segmentIndex * 20);
        for (let i = 1; i < steps; i++) {
            const ratio = i / steps;
            const px = x1 + (targetX2 - x1) * ratio;
            const py = y1 + (targetY2 - y1) * ratio;

            // Higher volatility for the secondary strand
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

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }

        // 1. Outer Flashy Glow (Wide)
        ctx.strokeStyle = '#00d2ff';
        ctx.lineWidth = 20 * intensity;
        ctx.shadowBlur = 35;
        ctx.shadowColor = '#00d2ff';
        ctx.stroke();

        // 2. Inner Neon Layer (Medium)
        ctx.strokeStyle = '#48dbfb';
        ctx.lineWidth = 10 * intensity;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ffffff';
        ctx.stroke();

        // Pass 3: Bright White Core (Sharp)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5 * intensity;
        ctx.shadowBlur = 0;
        ctx.stroke();

        // 4. v1.66: High-Voltage Secondary Strand Rendering
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

        // Impact Point Flash (Enhanced)
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#48dbfb';
        ctx.beginPath();
        ctx.arc(targetX2, targetY2, 8 * intensity, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // v1.71 Jagged lightning magic circle
    drawMagicCircle(ctx, sx, sy) {
        ctx.save();
        const time = Date.now() * 0.002;
        const radiusInner = this.width * 0.45;
        const radiusOuter = this.width * 0.55;
        const timeSeed = Math.floor(Date.now() / 100);
        const Y_SCALE = 0.45; // v1.75: Manual perspective scale

        // v1.75: No global scale/rotate to prevent line width wobble
        ctx.translate(sx, sy);

        // v1.72: Optimized helper that only adds points to current path
        const addLightningPath = (x1, y1, x2, y2, segments = 3, spread = 8) => {
            ctx.moveTo(x1, y1);
            for (let i = 1; i < segments; i++) {
                const ratio = i / segments;
                const px = x1 + (x2 - x1) * ratio;
                const py = y1 + (y2 - y1) * ratio;
                const seed = timeSeed + i + x1 + y1;
                const offset = (Math.sin(seed * 999) * spread);
                // Offset is perpendicular in screen space (2D electricity look)
                const angle = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
                ctx.lineTo(px + Math.cos(angle) * offset, py + Math.sin(angle) * offset);
            }
            ctx.lineTo(x2, y2);
        };

        // Outer Glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00d2ff';
        ctx.strokeStyle = 'rgba(72, 219, 251, 0.7)';

        // 1. Two Concentric Circles (Jagged segments)
        const circleSegments = 16;
        [radiusOuter, radiusInner].forEach((r, idx) => {
            ctx.lineWidth = idx === 0 ? 2 : 1.5;
            ctx.beginPath();
            for (let i = 0; i < circleSegments; i++) {
                const a1 = (i / circleSegments) * Math.PI * 2;
                const a2 = ((i + 1) / circleSegments) * Math.PI * 2;

                // v1.75: Manual squash
                const x1 = Math.cos(a1) * r;
                const y1 = Math.sin(a1) * r * Y_SCALE;
                const x2 = Math.cos(a2) * r;
                const y2 = Math.sin(a2) * r * Y_SCALE;

                addLightningPath(x1, y1, x2, y2, 2, 4);
            }
            ctx.stroke();
        });

        // 2. Hexagram (Six-pointed star)
        // v1.75: Manual rotation
        // v1.76: Slower speed (30% of original 1.5 -> 0.45)
        const hexRotation = time * 0.45;

        // ctx.strokeStyle is not used for dots, but we keep the structure if needed
        ctx.lineWidth = 2.5;

        // v1.76: Lines removed, Vertices only (Vertex rendering)
        // v1.76: Lines removed, Vertices only (Reverted in v1.79)
        // v1.79: Draw Logic for Two Triangles (Star of David) explicitly
        const triangles = [
            [0, 2, 4], // Triangle 1 (0, 120, 240 degrees)
            [1, 3, 5]  // Triangle 2 (60, 180, 300 degrees)
        ];

        for (let tIndex = 0; tIndex < 2; tIndex++) {
            const points = [];
            // Calculate 3 vertices for this triangle
            for (let j = 0; j < 3; j++) {
                const vertexIndex = triangles[tIndex][j];
                // 6 vertices total around the circle
                const hexAngle = (vertexIndex * (Math.PI * 2) / 6) + hexRotation - (Math.PI / 2); // Start from top (-90deg)

                points.push({
                    x: Math.cos(hexAngle) * radiusInner,
                    y: Math.sin(hexAngle) * radiusInner * Y_SCALE
                });
            }

            // Draw lines connecting the 3 vertices
            ctx.beginPath();
            // 0 -> 1
            addLightningPath(points[0].x, points[0].y, points[1].x, points[1].y, 4, 10);
            // 1 -> 2
            addLightningPath(points[1].x, points[1].y, points[2].x, points[2].y, 4, 10);
            // 2 -> 0 (Close)
            addLightningPath(points[2].x, points[2].y, points[0].x, points[0].y, 4, 10);
            ctx.stroke();
        }

        // 4. v1.73: Rotating Ancient Runes (Between circles)
        // v1.75: Manual rendering for constant line width
        // v1.76: Slower speed (30% of original 1.0 -> 0.3)
        const runeRotation = -time * 0.3; // Counter-Clockwise
        ctx.strokeStyle = 'rgba(150, 240, 255, 0.7)';
        ctx.lineWidth = 1.5;

        const runeCount = 12; // Increased from 8 to 12 per user request
        const runeRadius = this.width * 0.5;

        // Helper to transform local rune points to world-squashed points
        const drawRunePoly = (cx, cy, rotationAngle, localPoints) => {
            ctx.beginPath();
            let first = true;
            localPoints.forEach(pt => {
                // 1. Rotate locally (face outward)
                const rx = pt.x * Math.cos(rotationAngle) - pt.y * Math.sin(rotationAngle);
                const ry = pt.x * Math.sin(rotationAngle) + pt.y * Math.cos(rotationAngle);
                // 2. Translate to circle position and Squash Y
                const finalX = cx + rx;
                const finalY = cy + (ry * Y_SCALE); // Apply perspective to the glyph offset too

                if (first) { ctx.moveTo(finalX, finalY); first = false; }
                else { ctx.lineTo(finalX, finalY); }
            });
            ctx.stroke();
        };

        for (let i = 0; i < runeCount; i++) {
            const angle = (i / runeCount) * Math.PI * 2 + runeRotation;
            const cx = Math.cos(angle) * runeRadius;
            const cy = Math.sin(angle) * runeRadius * Y_SCALE;

            // Rune faces outward: angle + 90deg
            const facing = angle + Math.PI / 2;

            // Shape 1: Lightning Fork
            if (i % 4 === 0) {
                drawRunePoly(cx, cy, facing, [{ x: -3, y: -5 }, { x: 0, y: 0 }, { x: 3, y: -5 }]);
                drawRunePoly(cx, cy, facing, [{ x: 0, y: 0 }, { x: 0, y: 5 }]);
            }
            // Shape 2: Crossed Z
            else if (i % 4 === 1) {
                drawRunePoly(cx, cy, facing, [{ x: -3, y: -4 }, { x: 3, y: -4 }, { x: -3, y: 4 }, { x: 3, y: 4 }]);
                drawRunePoly(cx, cy, facing, [{ x: 0, y: -4 }, { x: 0, y: 4 }]);
            }
            // Shape 3: Diamond Eye
            else if (i % 4 === 2) {
                drawRunePoly(cx, cy, facing, [{ x: 0, y: -5 }, { x: 3, y: 0 }, { x: 0, y: 5 }, { x: -3, y: 0 }, { x: 0, y: -5 }]);
            }
            // Shape 4: Twin Pillars
            else {
                drawRunePoly(cx, cy, facing, [{ x: -2, y: -5 }, { x: -2, y: 5 }]);
                drawRunePoly(cx, cy, facing, [{ x: 2, y: -5 }, { x: 2, y: 5 }]);
                drawRunePoly(cx, cy, facing, [{ x: -4, y: 0 }, { x: 4, y: 0 }]);
            }
        }

        // 5. Inner Pulsing Core
        const pulse = Math.abs(Math.sin(time * 2)) * 0.3 + 0.1;
        ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
        ctx.beginPath();
        // Simple oval core
        ctx.ellipse(0, 0, radiusInner * 0.2, radiusInner * 0.2 * Y_SCALE, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
