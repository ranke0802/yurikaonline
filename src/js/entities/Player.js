import Actor from './Actor.js';
import Logger from '../utils/Logger.js';
import { Sprite } from '../core/Sprite.js';

export default class Player extends Actor {
    constructor(x, y, name = "Hero") {
        super(x, y, 180); // Speed 180
        this.name = name;

        // Stats
        this.maxHp = 100;
        this.hp = 100;
        this.mp = 100;
        this.maxMp = 100;
        this.level = 1;
        this.exp = 0;
        this.maxExp = 100;

        // Combat
        this.attackRange = 60;
        this.attackDamage = 10;
        this.isAttacking = false;
        this.attackCooldown = 0;

        // Visuals
        this.sprite = null;
        this.direction = 1; // Default to Front
        this.animFrame = 0;
        this.animTimer = 0;
        this.animSpeed = 10; // FPS
        this.width = 48;
        this.height = 48;

        // Magic Circle & Effects
        this.magicCircleScale = 0;
        this.magicCircleMaxScale = 1;
        this.magicCircleAlpha = 0;

        this.input = null;
    }

    // Initialize with game dependencies
    init(inputManager, resourceManager) {
        this.input = inputManager;
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

        // Call Actor's update (physics integration)
        super.update(dt);
    }

    _handleMovement(dt) {
        if (!this.input) return;

        let vx = 0;
        let vy = 0;

        if (this.input.isPressed('MOVE_UP')) vy -= 1;
        if (this.input.isPressed('MOVE_DOWN')) vy += 1;
        if (this.input.isPressed('MOVE_LEFT')) vx -= 1;
        if (this.input.isPressed('MOVE_RIGHT')) vx += 1;

        // Normalize
        if (vx !== 0 || vy !== 0) {
            const mag = Math.sqrt(vx * vx + vy * vy);
            vx /= mag;
            vy /= mag;

            this.vx = vx * this.speed;
            this.vy = vy * this.speed;
            this.state = 'move';

            // Direction Logic for Sprite Rows
            // Legacy Rows: 0:Back, 1:Front, 2:Left, 3:Right
            if (Math.abs(vx) > Math.abs(vy)) {
                this.direction = vx > 0 ? 3 : 2; // Right : Left
            } else {
                this.direction = vy > 0 ? 1 : 0; // Front : Back
            }
        } else {
            this.vx = 0;
            this.vy = 0;
            if (!this.isAttacking) this.state = 'idle';
        }
    }

    _updateCooldowns(dt) {
        if (this.attackCooldown > 0) this.attackCooldown -= dt;
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
            this.animTimer += dt * this.animSpeed;
            if (this.animTimer >= maxFrames) {
                this.animTimer = 0;
            }
            this.animFrame = Math.floor(this.animTimer) % maxFrames;
        } else {
            this.animFrame = 0; // Idle frame
            this.animTimer = 0;
        }
    }

    attack() {
        if (this.attackCooldown > 0 || this.isAttacking) return;

        Logger.log('Player Attack!');
        this.isAttacking = true;
        this.attackCooldown = 0.6;
        this.state = 'attack';
        this.animTimer = 0;
        this.animFrame = 0;

        // Logic for damage, effects...
        // Reset state after animation
        setTimeout(() => {
            this.isAttacking = false;
            this.state = 'idle';
        }, 600);
    }

    useSkill(slot) {
        Logger.log(`Skill ${slot} used`);
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

        // 3. Name Tag
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.fillText(this.name, centerX, y - 10);
        ctx.shadowBlur = 0; // Reset
    }
}
