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
        this.skillMaxCooldowns = { u: 5.0, k: 10.0, h: 2.0, j: 0.6 }; // Fireball, Shield, Missile, Attack

        // Shield & Status
        this.shieldTimer = 0;
        this.isShieldActive = false;
        this.laserEffect = null; // { x1, y1, x2, y2, timer }

        // Running Logic
        this.moveTimer = 0;
        this.isRunning = false;
        this.prevFacingDir = -1;
        this.runParticles = [];
        this.turnGraceTimer = 0;

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
            const shieldLv = this.skillLevels.shield || 1;
            // Efficiency: Level 1 = 40%, Level 11 = 90%
            const reductionRatio = Math.min(0.9, 0.4 + (shieldLv - 1) * 0.05);

            // 100% of HP damage is blocked. 
            // The MP cost is the "reduced" damage amount.
            // e.g. 100 damage, 80% reduction -> 20 MP lost, 0 HP lost.
            const afterDef = Math.max(1, amount - (this.defense || 0));
            manaDamage = afterDef * (1.0 - reductionRatio);
            finalHpDamage = 0;

            if (this.mp >= manaDamage) {
                this.mp -= manaDamage;
            } else {
                const overflowDamage = (manaDamage - this.mp) / (1.0 - reductionRatio);
                this.mp = 0;
                finalHpDamage = overflowDamage; // Unprotected damage hits HP
            }
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
                const v = window.GAME_VERSION || Date.now();
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
        const currentLv = this.skillLevels[skillId] || 1;
        // Level 1 -> 2: 300
        // Level 2 -> 3: 600
        // Level 3 -> 4: 1200
        return 300 * Math.pow(2, currentLv - 1);
    }

    increaseSkill(skillId) {
        if (!this.skillLevels.hasOwnProperty(skillId)) return false;

        const cost = this.getSkillUpgradeCost(skillId);
        if (this.gold < cost) {
            if (window.game?.ui) window.game.ui.logSystemMessage(`골드가 부족합니다! (필요: ${cost})`);
            return false;
        }

        this.gold -= cost;
        this.skillLevels[skillId]++;

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
            actionName.toUpperCase().includes('SHIELD');

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

        if (this.laserEffect) {
            this.laserEffect.timer -= dt;
            if (this.laserEffect.timer <= 0) this.laserEffect = null;
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
        const vx = move.x;
        const vy = move.y;

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
                if (this.moveTimer >= 1.0) {
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
            this.x += vx * finalSpeed * dt;
            this.y += vy * finalSpeed * dt;
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
                    x: this.x + (Math.random() - 0.5) * 40,
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

        // Draw Run Particles
        this.runParticles.forEach(p => {
            ctx.fillStyle = `rgba(200, 200, 200, ${p.life * 1.5})`;
            ctx.beginPath();
            ctx.arc(p.x - camera.x, p.y - camera.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw Laser (Improved Impact)
        if (this.laserEffect) {
            ctx.save();
            const lifeRatio = this.laserEffect.timer / 0.2;
            const sx = this.laserEffect.x1 - camera.x;
            const sy = this.laserEffect.y1 - camera.y;
            const ex = this.laserEffect.x2 - camera.x;
            const ey = this.laserEffect.y2 - camera.y;

            // Outer thick glow
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 24 * lifeRatio; // Increased from 12
            ctx.shadowBlur = 40; // Increased from 20
            ctx.shadowColor = '#00ffff';
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.stroke();

            // Middle layer
            ctx.globalAlpha = 0.8;
            ctx.lineWidth = 12 * lifeRatio; // Increased from 6
            ctx.stroke();

            // Inner white core
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 4 * lifeRatio; // Increased from 2
            ctx.shadowBlur = 0;
            ctx.stroke();

            // Start point flash
            ctx.fillStyle = '#00ffff';
            ctx.beginPath();
            ctx.arc(sx, sy, 10 * lifeRatio, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        let row = this.isAttacking ? 4 : this.direction;
        let col = this.frame;
        this.sprite.draw(ctx, row, col, screenX - this.width / 2, screenY - this.height / 2, this.width, this.height, false);

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

            // Speech bubble background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.strokeStyle = 'rgba(200, 200, 200, 0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight, 8);
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

        // HP Bar
        const barWidth = 60;
        const barHeight = 6;
        const barY = screenY - this.height / 2 - 25;

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

        // Player Name (below MP bar, same style as monster names)
        const nameY = mpBarY + barHeight + 14;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.fillText(this.name, screenX, nameY);
        ctx.shadowBlur = 0;

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
}


