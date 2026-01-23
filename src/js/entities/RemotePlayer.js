import Actor from './Actor.js';
import Logger from '../utils/Logger.js';
import { Sprite } from '../core/Sprite.js';

export default class RemotePlayer extends Actor {
    constructor(id, x, y, resourceManager) {
        super(x, y, 180);
        this.id = id;
        this.name = "Unknown";

        this.targetX = x;
        this.targetY = y;
        this.serverTime = 0;
        this.lastAttackTime = 0;

        // Visuals
        this.sprite = null;
        this.direction = 1; // Default to Front
        this.animFrame = 0;
        this.animTimer = 0;
        this.animSpeed = 10;
        this.width = 48;
        this.height = 48;

        this._loadSpriteSheet(resourceManager);
    }

    async _loadSpriteSheet(res) {
        if (!res) return;
        try {
            const sheetCanvas = await res.loadCharacterSpriteSheet();
            this.sprite = new Sprite(sheetCanvas, 8, 5);
            this.frameCounts = { 0: 5, 1: 8, 2: 7, 3: 7, 4: 6 };
        } catch (e) {
            Logger.error("Failed to load character sprite sheet for RemotePlayer:", e);
        }
    }

    // Called when network packet arrives
    onServerUpdate(packet) {
        // packet: { x, y, vx, vy, ts }
        this.targetX = packet.x;
        this.targetY = packet.y;

        // Basic Linear Interpolation setup
        // Ideally we use timestamp for accurate reconciliation, 
        // but for MVP a simple 'move towards target' works fine.
    }

    update(dt) {
        if (this.isDead) return;

        // Simple Lerp for smooth movement (Dead Reckoning's visual part)
        const lerpFactor = 10 * dt; // Adjust smoothness

        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;

        // Determine state for animation
        if (!this.isAttacking) {
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                this.state = 'move';
                // Direction Logic for Sprite Rows (0:Back, 1:Front, 2:Left, 3:Right)
                if (Math.abs(dx) > Math.abs(dy)) {
                    this.direction = dx > 0 ? 3 : 2; // Right : Left
                } else {
                    this.direction = dy > 0 ? 1 : 0; // Front : Back
                }
            } else {
                this.state = 'idle';
            }
        }

        this.x += dx * lerpFactor;
        this.y += dy * lerpFactor;

        this._updateAnimation(dt);
        super.update(dt);
    }

    _updateAnimation(dt) {
        let row = this.direction;
        if (this.state === 'attack') {
            row = 4; // Attack Row
        }

        const maxFrames = this.frameCounts ? (this.frameCounts[row] || 8) : 8;

        if (this.state === 'move' || this.state === 'attack') {
            this.animTimer += dt * this.animSpeed;
            if (this.animTimer >= maxFrames) {
                this.animTimer = 0;
            }
            this.animFrame = Math.floor(this.animTimer) % maxFrames;
        } else {
            this.animFrame = 0;
            this.animTimer = 0;
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

        const x = this.x;
        const y = this.y;
        const centerX = x + this.width / 2;
        const centerY = y + this.height / 2;

        // 1. Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(centerX, y + this.height - 4, 14, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Draw Sprite
        if (this.sprite) {
            let row = this.direction;
            if (this.state === 'attack') row = 4;
            let col = this.animFrame;

            // Legacy visual size: 120x120
            const drawW = 120;
            const drawH = 120;

            const drawX = centerX - drawW / 2;
            const drawY = y + this.height - drawH + 10;

            this.sprite.draw(ctx, row, col, drawX, drawY, drawW, drawH);
        } else {
            // Fallback (Red Circle)
            const time = Date.now() / 200;
            const pulse = Math.sin(time + 100) * 2;
            ctx.save();
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#fab1a0';
            ctx.fillStyle = '#e17055';
            ctx.beginPath();
            ctx.arc(centerX, centerY - 5 + pulse, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 3. Name/ID
        ctx.fillStyle = '#ff7675'; // Reddish Text for enemies/others
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 2;
        ctx.fillText(this.id.substring(0, 5), centerX, y - 10);
        ctx.shadowBlur = 0;
    }
    triggerAttack(data) {
        // Prevent duplicate firing of same attack
        if (this.lastAttackTime && data.ts <= this.lastAttackTime) return;

        // Ignore stale attacks (older than 3 seconds) - fixes "Ghost Attack" on refresh
        if (Date.now() - data.ts > 3000) return;

        this.lastAttackTime = data.ts;

        // data: { ts, x, y, dir }
        // Snap to attack position for precise visual
        this.x = data.x;
        this.y = data.y;
        this.targetX = data.x; // Stop interpolation movement
        this.targetY = data.y;
        this.direction = data.dir;

        this.isAttacking = true;
        this.state = 'attack';
        this.animTimer = 0;
        this.animFrame = 0;

        // Reset after animation (approx 0.6s)
        if (this.attackTimeout) clearTimeout(this.attackTimeout);
        this.attackTimeout = setTimeout(() => {
            this.isAttacking = false;
            this.state = 'idle';
        }, 600);
    }
}
