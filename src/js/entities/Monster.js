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

        // Simple wandering behavior
        if (!this.moveTimer) this.moveTimer = 0;
        if (!this.vx) this.vx = 0;
        if (!this.vy) this.vy = 0;

        this.moveTimer -= dt;
        if (this.moveTimer <= 0) {
            // Pick a new direction every 2-4 seconds
            const angle = Math.random() * Math.PI * 2;
            const speed = 30 + Math.random() * 40;
            const isIdle = Math.random() > 0.6;

            if (isIdle) {
                this.vx = 0;
                this.vy = 0;
            } else {
                this.vx = Math.cos(angle) * speed;
                this.vy = Math.sin(angle) * speed;
            }
            this.moveTimer = 2 + Math.random() * 2;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Bouncy height effect
        this.renderOffY = Math.sin(Date.now() * 0.01) * 5;

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

    takeDamage(amount, triggerFlash = true) {
        if (this.isDead) return;
        this.hp = Math.max(0, this.hp - amount);
        if (triggerFlash) this.hitTimer = 0.2;
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
        // Place shadow exactly at the feet (bottom of height)
        ctx.ellipse(screenX, screenY + this.height / 2, this.width / 2 * 0.7, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        if (this.hitTimer > 0) {
            ctx.filter = 'brightness(1.5) sepia(1) saturate(100) hue-rotate(-50deg)'; // Reddish flash
        }

        this.sprite.draw(ctx, 0, this.frame, screenX - this.width / 2, drawY - this.height / 2, this.width, this.height);

        ctx.filter = 'none';

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
    }
}
