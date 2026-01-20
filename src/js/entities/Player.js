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

        this.init();
    }

    async init() {
        const categories = {
            'front': { path: 'assets/resource/magicion_front', frames: ['1.png', '2.png', '3.png', '4.png', '5.png', '6.png', '7.png', '8.png'] },
            'back': { path: 'assets/resource/magicion_back', frames: ['1.png', '2.png', '3.png', '4.png', '5.png'] },
            'left': { path: 'assets/resource/magicion_left', frames: ['1.png', '2.png', '3.png', '4.png', '5.png', '6.png', '7.png'] },
            'right': { path: 'assets/resource/magicion_right', frames: ['4.png', '5.png', '6.png', '7.png', '8.png', '9.png', '05.png'] }, // As found in folder
            'attack': { path: 'assets/resource/magician_attack', frames: ['1.png', '2.png', '3.png', '4.png', '5.png', '6.png'] }
        };

        const maxFrames = 8;
        const targetW = 256;
        const targetH = 256;

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetW * maxFrames;
        finalCanvas.height = targetH * 5;
        const finalCtx = finalCanvas.getContext('2d');

        // Initialize sprite and ready state immediately so drawing can start
        this.sprite = new Sprite(finalCanvas, maxFrames, 5);
        this.ready = true;

        this.frameCounts = {
            1: 8, // front
            0: 5, // back
            2: 7, // left
            3: 7, // right
            4: 6  // attack
        };

        let firstFrameLoaded = false;

        for (const [key, menu] of Object.entries(categories)) {
            let rowIndex = 0;
            switch (key) {
                case 'back': rowIndex = 0; break;
                case 'front': rowIndex = 1; break;
                case 'left': rowIndex = 2; break;
                case 'right': rowIndex = 3; break;
                case 'attack': rowIndex = 4; break;
            }

            for (let i = 0; i < menu.frames.length; i++) {
                const img = new Image();
                img.src = `${menu.path}/${menu.frames[i]}`;

                await new Promise((resolve) => {
                    img.onload = resolve;
                    img.onerror = resolve;
                });

                if (img.complete && img.width > 0) {
                    this.processAndDrawFrame(img, finalCtx, i * targetW, rowIndex * targetH, targetW, targetH);

                    // Update UI portrait as soon as the first front frame is available
                    if (!firstFrameLoaded && key === 'front' && i === 0) {
                        firstFrameLoaded = true;
                        if (window.game && window.game.ui) {
                            window.game.ui.setPortrait(finalCanvas);
                        }
                    }
                }
            }
        }

        // Final UI update just in case
        if (window.game && window.game.ui) {
            window.game.ui.setPortrait(finalCanvas);
        }
    }

    processAndDrawFrame(img, ctx, destX, destY, destW, destH) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0);

        const imgData = tempCtx.getImageData(0, 0, img.width, img.height);
        const data = imgData.data;

        let minX = img.width, maxX = 0, minY = img.height, maxY = 0;
        let foundPixels = false;

        // Enhanced Chroma Key (more aggressive to remove green fringes)
        for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
                const idx = (y * img.width + x) * 4;
                const r = data[idx], g = data[idx + 1], b = data[idx + 2];

                // Remove anything that is predominantly green or light cyan (common in AI BG)
                const isGreen = (g > 140 && g > r * 1.1 && g > b * 1.1);
                const isLightBG = (g > 200 && r > 200 && b > 200); // White/light cleanup

                if (isGreen || isLightBG) {
                    data[idx + 3] = 0;
                } else if (data[idx + 3] > 0) {
                    // Small alpha threshold for fringes
                    if (data[idx + 3] < 50) {
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
        }

        if (foundPixels) {
            tempCtx.putImageData(imgData, 0, 0);
            const charW = maxX - minX + 1;
            const charH = maxY - minY + 1;

            const scale = Math.min(destW / charW, destH / charH) * 0.95;
            const drawW = charW * scale;
            const drawH = charH * scale;
            const offX = (destW - drawW) / 2;
            const offY = (destH - drawH) / 2;

            ctx.drawImage(tempCanvas, minX, minY, charW, charH, destX + offX, destY + offY, drawW, drawH);
        }
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

        if (this.isAttacking) {
            this.timer += dt;
            if (this.timer >= 0.1) {
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
    }

    draw(ctx, camera) {
        if (!this.sprite) return;

        let screenX = Math.round(this.x - camera.x);
        let screenY = Math.round(this.y - camera.y);

        let row = this.isAttacking ? 4 : this.direction;
        let col = this.frame;

        this.sprite.draw(ctx, row, col, screenX - this.width / 2, screenY - this.height / 2, this.width, this.height, false);

        if (this.actionFdbk) {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 16px "Outfit", sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeText(this.actionFdbk, screenX, screenY - 60);
            ctx.fillText(this.actionFdbk, screenX, screenY - 60);
        }
    }
}
