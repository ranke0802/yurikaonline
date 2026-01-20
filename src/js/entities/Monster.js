import { Sprite } from '../core/Sprite.js';

export default class Monster {
    constructor(x, y, name = 'Slime') {
        this.x = x;
        this.y = y;
        this.width = 80;
        this.height = 80;
        this.name = name;
        this.hp = 100;
        this.maxHp = 100;

        this.sprite = null;
        this.ready = false;
        this.frame = 0;
        this.timer = 0;
        this.frameSpeed = 0.15;
        this.frameCount = 5;

        this.hitTimer = 0;
        this.isDead = false;

        this.statusEffects = []; // { type: 'burn', timer: 3.0, damage: 2 }
        this._looted = false;

        this.vx = 0;
        this.vy = 0;
        this.moveTimer = 0;

        this.init();
    }

    async init() {
        const frames = ['1.png', '2.png', '3.png', '4.png', '5.png'];
        const path = 'assets/resource/monster_slim';

        const targetW = 256;
        const targetH = 256;

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetW * frames.length;
        finalCanvas.height = targetH;
        const finalCtx = finalCanvas.getContext('2d');

        const loadPromises = frames.map((frameFile, i) => {
            const img = new Image();
            img.src = `${path}/${frameFile}`;
            return new Promise((resolve) => {
                img.onload = () => {
                    this.processAndDrawFrame(img, finalCtx, i * targetW, 0, targetW, targetH);
                    resolve();
                };
                img.onerror = resolve;
            });
        });

        await Promise.all(loadPromises);

        this.sprite = new Sprite(finalCanvas, frames.length, 1);
        this.ready = true;
    }

    processAndDrawFrame(img, ctx, destX, destY, destW, destH) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0);

        const imgData = tempCtx.getImageData(0, 0, img.width, img.height);
        const data = imgData.data;

        // Find background color (top-left pixel is usually safe)
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
        }
    }

    update(dt) {
        if (!this.ready) return;

        this.timer += dt;
        if (this.timer >= this.frameSpeed) {
            this.timer = 0;
            this.frame = (this.frame + 1) % this.frameCount;
        }

        this.renderOffY = Math.sin(Date.now() * 0.01) * 5;

        // --- AI Logic ---
        if (!this.attackCooldown) this.attackCooldown = 0;
        if (this.attackCooldown > 0) this.attackCooldown -= dt;

        const player = window.game?.localPlayer;
        const playerHasAttacked = window.game?.playerHasAttacked;
        const reflectsDamage = this.hp < this.maxHp;

        if (player) {
            const dist = Math.sqrt((player.x - this.x) ** 2 + (player.y - this.y) ** 2);

            // 적대적 행위 (추격 및 공격)는 플레이어가 공격했거나 데미지를 입었을 때만
            if ((playerHasAttacked || reflectsDamage) && dist < 400 && dist > 50) {
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                const speed = 100;
                this.vx = Math.cos(angle) * speed;
                this.vy = Math.sin(angle) * speed;
            } else if ((playerHasAttacked || reflectsDamage) && dist <= 60) {
                this.vx = 0;
                this.vy = 0;
                if (this.attackCooldown <= 0) {
                    player.takeDamage(5 + (Math.random() * 5));
                    this.attackCooldown = 1.5;
                    this.hitTimer = 0.1;
                }
            } else {
                // 평상시: 정지하거나 자유롭게 배회
                this.moveTimer -= dt;
                if (this.moveTimer <= 0) {
                    const shouldMove = Math.random() < 0.7; // 70% 확률로 이동
                    if (shouldMove) {
                        const angle = Math.random() * Math.PI * 2;
                        const speed = 30 + Math.random() * 40;
                        this.vx = Math.cos(angle) * speed;
                        this.vy = Math.sin(angle) * speed;
                    } else {
                        this.vx = 0;
                        this.vy = 0;
                    }
                    this.moveTimer = 1 + Math.random() * 3;
                }
            }
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if (this.hitTimer > 0) {
            this.hitTimer -= dt;
        }

        // Process Status Effects
        this.statusEffects = this.statusEffects.filter(eff => {
            eff.timer -= dt;
            if (eff.type === 'burn') {
                // Apply burn damage every second-ish
                if (!eff.tickTimer) eff.tickTimer = 0;
                eff.tickTimer += dt;
                if (eff.tickTimer >= 0.5) {
                    eff.tickTimer = 0;
                    this.takeDamage(eff.damage, false); // false = don't trigger hit flash for DoT
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

    takeDamage(amount, triggerFlash = true, isCrit = false) {
        if (this.isDead) return;
        this.hp = Math.max(0, this.hp - amount);
        if (triggerFlash) this.hitTimer = 0.2;

        if (amount > 0 && window.game) {
            window.game.addDamageText(this.x, this.y - 40, Math.floor(amount), isCrit ? '#ff9f43' : '#ff4757', isCrit, isCrit ? 'Critical' : null);
        }

        if (this.hp <= 0) {
            this.isDead = true;
        }
    }

    draw(ctx, camera) {
        if (!this.ready) return;

        const screenX = Math.round(this.x - camera.x);
        const screenY = Math.round(this.y - camera.y);
        const drawY = screenY + (this.renderOffY || 0);

        // Draw shadow (Grounded)
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(screenX, screenY + this.height / 2, this.width / 2 * 0.7, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Optimized Hit Flash (Avoid expensive ctx.filter on mobile)
        if (this.hitTimer > 0) {
            ctx.save();
            // Draw a slightly enlarged red 'ghost' or just boost the existing draw
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.5;
            this.sprite.draw(ctx, 0, this.frame, screenX - this.width / 2 - 2, drawY - this.height / 2 - 2, this.width + 4, this.height + 4);
            ctx.restore();
        }

        this.sprite.draw(ctx, 0, this.frame, screenX - this.width / 2, drawY - this.height / 2, this.width, this.height);

        // Name and HP Bar
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.fillText(this.name, screenX, screenY - this.height / 2 - 20);
        ctx.shadowBlur = 0;

        // HP Bar background
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(screenX - 30, screenY - this.height / 2 - 12, 60, 6);
        // HP Bar foreground
        const hpPercent = this.hp / this.maxHp;
        ctx.fillStyle = hpPercent > 0.3 ? '#4ade80' : '#ef4444';
        ctx.fillRect(screenX - 30, screenY - this.height / 2 - 12, 60 * hpPercent, 6);

        // Status Effect Icons (Burn)
        const burnEffect = this.statusEffects.find(e => e.type === 'burn');
        if (burnEffect) {
            ctx.font = '16px serif';
            ctx.textAlign = 'center';
            ctx.fillText('🔥', screenX, screenY + this.height / 2 + 15);
        }
    }
}
