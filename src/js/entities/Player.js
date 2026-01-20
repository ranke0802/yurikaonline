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
        this.skillPoints = 0;
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
        this.hp = this.maxHp;
        this.mp = this.maxMp;
    }

    takeDamage(amount) {
        let finalHpDamage = amount;
        let manaDamage = 0;

        if (this.shieldTimer > 0) {
            const shieldLv = this.skillLevels.shield || 1;
            // Reduction Ratio: Level 1 = 30%, Level 5 = 70%, max 80%
            const reductionRatio = Math.min(0.8, 0.3 + (shieldLv - 1) * 0.1);

            // 100% of HP damage is blocked. 
            // The MP cost is the "reduced" damage amount.
            // e.g. 100 damage, 80% reduction -> 20 MP lost, 0 HP lost.
            manaDamage = amount * (1.0 - reductionRatio);
            finalHpDamage = 0;

            if (this.mp >= manaDamage) {
                this.mp -= manaDamage;
            } else {
                const overflowDamage = (manaDamage - this.mp) / (1.0 - reductionRatio);
                this.mp = 0;
                finalHpDamage = overflowDamage; // Unprotected damage hits HP
            }
        }

        this.hp = Math.max(0, this.hp - finalHpDamage);

        if (manaDamage > 0 && window.game) {
            window.game.addDamageText(this.x, this.y - 20, `-${Math.round(manaDamage)}`, '#48dbfb');
        }

        if (finalHpDamage > 0) {
            this.triggerAction(`-${Math.round(finalHpDamage)}`);
        }

        if (this.hp <= 0) {
            // Respawn
            this.hp = this.maxHp;
            this.mp = this.maxMp;
            this.x = 1000;
            this.y = 1000;
            this.triggerAction('RESPAWN');
        }
    }

    recoverHp(amount) {
        const recover = Math.min(this.maxHp - this.hp, amount);
        if (recover <= 0) return;
        this.hp += recover;
        if (window.game) {
            window.game.addDamageText(this.x, this.y - 40, `+${Math.round(recover)}`, '#4ade80');
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
                img.src = `${menu.path}/${frameFile}`;
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
        this.maxMp = 30 + (this.wisdom * 10);
        this.attackPower = 5 + (this.intelligence * 1) + (this.level * 1);

        // Agility: 1 AGI = +5% Speed, +10% Attack Speed, +2% Crit
        this.moveSpeedMult = 1.0 + (this.agility * 0.05);
        this.attackSpeed = 1.0 + (this.agility * 0.10);
        this.critRate = 0.1 + (this.agility * 0.02);

        if (window.game?.ui) {
            window.game.ui.updateStatusPopup();
        }
    }

    addExp(amount) {
        this.exp += amount;
        if (this.exp >= this.maxExp) {
            this.levelUp();
        }
        if (window.game?.ui) {
            window.game.ui.updateStatusPopup();
        }
    }

    levelUp() {
        this.level++;
        this.exp -= this.maxExp;
        this.maxExp = Math.floor(this.maxExp * 1.5);
        this.statPoints += 3; // Grant 3 stat points (requested)
        this.skillPoints += 1; // Grant skill points (1 per level)

        this.refreshStats();
        this.hp = this.maxHp;
        this.mp = this.maxMp;

        this.triggerAction('LEVEL UP!!');
        if (window.game?.ui) {
            window.game.ui.logSystemMessage(`축하합니다! 레벨 ${this.level}이 되었습니다! (스탯 +3, 스킬 +1)`);
        }
    }

    addGold(amount) {
        this.gold += amount;
        // Also ensure gold is in inventory as an item if we want to show it there
        // For now, let's just make sure UI shows it in a specialized slot or logic
        this.addToInventory({ id: 'gold', name: 'Gold', amount: amount, icon: '💰' });
        if (window.game?.ui) window.game.ui.updateInventory();
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

    increaseSkill(skillId) {
        if (this.skillPoints <= 0) return false;
        if (!this.skillLevels.hasOwnProperty(skillId)) return false;

        this.skillLevels[skillId]++;
        this.skillPoints--;

        if (window.game?.ui) {
            window.game.ui.updateSkillPopup();
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
        if (!this.sprite) return;

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
            this.stillTimer += dt;
            if (this.stillTimer >= 3.0) {
                const regenBonus = 1 + Math.floor(this.wisdom / 5);
                this.mp = Math.min(this.maxMp, this.mp + regenBonus * dt);
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
            ctx.lineWidth = 12 * lifeRatio;
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#00ffff';
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.stroke();

            // Middle layer
            ctx.globalAlpha = 0.8;
            ctx.lineWidth = 6 * lifeRatio;
            ctx.stroke();

            // Inner white core
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2 * lifeRatio;
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

        if (this.actionFdbk) {
            ctx.fillStyle = '#ffeb3b';
            ctx.font = 'bold 20px "Outfit", sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeText(this.actionFdbk, screenX, screenY - 70);
            ctx.fillText(this.actionFdbk, screenX, screenY - 70);
        }
    }
}


