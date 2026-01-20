import { Sprite } from '../core/Sprite.js';

export default class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 120;
        this.height = 120;
        this.speed = 220;
        this.direction = 1; // 0:Up, 1:Down, 2:NW, 3:NE, 4:SW, 5:SE, 6:Right, 7:Left
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
        this.hp = 100;
        this.maxHp = 100;
        this.mp = 100;
        this.maxMp = 100;

        // RPG Stats
        this.statPoints = 0;
        this.vitality = 5;      // Increases Max HP
        this.intelligence = 5;  // Increases Magic Damage
        this.wisdom = 5;        // Increases Max MP
        this.tenacity = 5;      // Increases Health Recovery/Defense

        // Derived Stats
        this.attackPower = 10;
        this.attackSpeed = 1.0;

        // Inventory system (16 slots grid in UI usually)
        this.inventory = new Array(16).fill(null);

        // Cooldowns
        this.attackCooldown = 0;
        this.baseAttackDelay = 0.3;

        this.init();
        this.refreshStats();
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
        this.ready = true;

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
        this.maxHp = 100 + (this.vitality * 10) + (this.level * 5);
        this.maxMp = 50 + (this.wisdom * 10) + (this.level * 2);
        this.attackPower = 5 + (this.intelligence * 2) + (this.level * 1);

        const speedBonus = (this.intelligence + this.wisdom) * 0.005;
        this.attackSpeed = 1.0 + speedBonus;
        this.baseAttackDelay = Math.max(0.1, 0.3 - (speedBonus * 0.2));

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
        this.statPoints += 5; // Grant stat points

        this.refreshStats();
        this.hp = this.maxHp;
        this.mp = this.maxMp;

        this.triggerAction('LEVEL UP!!');
        if (window.game?.ui) {
            window.game.ui.logSystemMessage(`축하합니다! 레벨 ${this.level}이 되었습니다! (스탯 포인트 +5)`);
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
        else if (statName === 'tenacity') this.tenacity++;
        else return false;

        this.statPoints--;
        this.refreshStats();
        return true;
    }

    triggerAction(actionName) {
        this.actionFdbk = actionName;
        this.actionTimer = 1.0;

        if (actionName.includes('ATTACK') || actionName.includes('Skill')) {
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
            this.attackCooldown -= dt;
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
            this.x += vx * this.speed * dt;
            this.y += vy * this.speed * dt;
            this.isMoving = true;

            const angle = Math.atan2(vy, vx) * (180 / Math.PI);
            if (angle > -135 && angle <= -45) this.direction = 0; // Back
            else if (angle > 45 && angle <= 135) this.direction = 1; // Front
            else if (angle > -45 && angle <= 45) this.direction = 3; // Right
            else this.direction = 2; // Left
        } else {
            this.isMoving = false;
        }

        if (this.isMoving) {
            this.timer += dt;
            const maxF = this.frameCounts[this.direction] || 1;
            if (this.timer >= this.frameSpeed) {
                this.timer = 0;
                this.frame = (this.frame + 1) % maxF;
            }
        } else {
            this.frame = 0;
        }

        if (window.game?.ui) {
            window.game.ui.updateStats((this.hp / this.maxHp) * 100, (this.mp / this.maxMp) * 100);
        }
    }

    draw(ctx, camera) {
        if (!this.sprite) return;
        let screenX = Math.round(this.x - camera.x);
        let screenY = Math.round(this.y - camera.y);
        let row = this.isAttacking ? 4 : this.direction;
        let col = this.frame;
        this.sprite.draw(ctx, row, col, screenX - this.width / 2, screenY - this.height / 2, this.width, this.height, false);

        if (this.actionFdbk) {
            ctx.fillStyle = '#ffeb3b';
            ctx.font = 'bold 20px "Outfit", sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeText(this.actionFdbk, screenX, screenY - 70);
            ctx.fillText(this.actionFdbk, screenX, screenY - 70);
        }
    }
}


