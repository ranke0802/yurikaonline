import Actor from './Actor.js';
import Logger from '../utils/Logger.js';

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

        // Magic Circle & Effects
        this.magicCircleScale = 0;
        this.magicCircleMaxScale = 1;
        this.magicCircleAlpha = 0;

        this.input = null;
    }

    // Initialize with game dependencies
    init(inputManager) {
        this.input = inputManager;

        // Bind input actions to methods
        this.input.on('keydown', (action) => {
            if (action === 'ATTACK') this.attack();
            if (action === 'SKILL_1') this.useSkill(1);
        });
    }

    update(dt) {
        if (this.isDead) return;

        this._handleMovement(dt);
        this._updateCooldowns(dt);

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

            // Direction Logic
            if (Math.abs(vx) > Math.abs(vy)) {
                this.direction = vx > 0 ? 'right' : 'left';
            } else {
                this.direction = vy > 0 ? 'down' : 'up';
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

    attack() {
        if (this.attackCooldown > 0 || this.isAttacking) return;

        Logger.log('Player Attack!');
        this.isAttacking = true;
        this.attackCooldown = 0.5; // 0.5s cooldown

        // Logic for damage, effects...
        // Reset state after animation
        setTimeout(() => {
            this.isAttacking = false;
        }, 300);
    }

    useSkill(slot) {
        Logger.log(`Skill ${slot} used`);
    }

    render(ctx, camera) {
        // Culling Check (Is visible?)
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
        ctx.ellipse(centerX, y + this.height - 2, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Magic Aura (Pulse Effect)
        const time = Date.now() / 200;
        const pulse = Math.sin(time) * 2;

        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.isAttacking ? '#ff6b6b' : '#48dbfb';

        // Body (Circle)
        ctx.fillStyle = this.isAttacking ? '#ff6b6b' : '#0984e3';
        ctx.beginPath();
        ctx.arc(centerX, centerY - 5 + pulse, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 3. Simple Hat (Visual Cue for Wizard)
        ctx.fillStyle = '#576574'; // Dark hat
        ctx.beginPath();
        ctx.moveTo(centerX - 16, centerY - 10 + pulse);
        ctx.lineTo(centerX + 16, centerY - 10 + pulse);
        ctx.lineTo(centerX, centerY - 35 + pulse);
        ctx.fill();

        // 4. Name Tag
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.fillText(this.name, centerX, y - 10);
        ctx.shadowBlur = 0; // Reset
    }
}
