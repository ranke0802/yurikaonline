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

        // Visuals
        this.animations = {};
        this.currentAnim = 'idle_down';
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
        this._loadAnimations(resourceManager);

        // Bind input actions to methods
        this.input.on('keydown', (action) => {
            if (action === 'ATTACK') this.attack();
            if (action === 'SKILL_1') this.useSkill(1);
        });
    }

    async _loadAnimations(res) {
        if (!res) return;

        const config = {
            'move_down': { path: 'assets/resource/magicion_front/', count: 8 },
            'move_up': { path: 'assets/resource/magicion_back/', count: 5 },
            'move_left': { path: 'assets/resource/magicion_left/', count: 7 },
            'move_right': { path: 'assets/resource/magicion_right/', count: 9 },
            'attack': { path: 'assets/resource/magician_attack/', count: 13 }
        };

        for (const [key, conf] of Object.entries(config)) {
            this.animations[key] = [];
            for (let i = 1; i <= conf.count; i++) {
                // Determine extension (assuming png based on previous checks)
                const url = `${conf.path}${i}.png`;
                // Load asynchronously but don't block everything? 
                // Better to fire and forget or let ResourceManager cache handle it.
                // We'll push a placeholder or wait? 
                try {
                    const img = await res.loadImage(url);
                    this.animations[key].push(img);
                } catch (e) {
                    Logger.warn(`Failed to load anim frame: ${url}`);
                }
            }
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

    _updateAnimation(dt) {
        // Determine current animation key
        if (this.isAttacking) {
            this.currentAnim = 'attack';
        } else if (this.state === 'move') {
            this.currentAnim = `move_${this.direction}`;
        } else {
            this.currentAnim = `move_${this.direction}`; // Use move frame 0 for idle
        }

        const frames = this.animations[this.currentAnim];
        if (!frames || frames.length === 0) return;

        // Update Timer
        if (this.state === 'move' || this.isAttacking) {
            this.animTimer += dt * this.animSpeed;
            if (this.animTimer >= frames.length) {
                this.animTimer = 0; // Loop
                // Note: For attack, we might want to stop at end or reset state
            }
            this.animFrame = Math.floor(this.animTimer) % frames.length;
        } else {
            this.animFrame = 0; // Idle
            this.animTimer = 0;
        }
    }

    attack() {
        if (this.attackCooldown > 0 || this.isAttacking) return;

        Logger.log('Player Attack!');
        this.isAttacking = true;
        this.attackCooldown = 0.6; // Slightly longer than animation (6 frames / 10 fps = 0.6s)
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

        // 2. Draw Animation Frame
        const frames = this.animations[this.currentAnim];
        if (frames && frames[this.animFrame]) {
            const img = frames[this.animFrame];
            // Draw centered, assuming frames are decent size. 
            // Scale to match hitbox approx? Or keep original size?
            // Original images seemed ~100-200px? Let's fix draw size.
            const drawW = 100;
            const drawH = 100;
            // Align feet
            const drawX = centerX - drawW / 2;
            const drawY = y + this.height - drawH + 10;

            ctx.drawImage(img, drawX, drawY, drawW, drawH);
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
