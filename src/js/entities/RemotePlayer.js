import Actor from './Actor.js';
import Logger from '../utils/Logger.js';

export default class RemotePlayer extends Actor {
    constructor(id, x, y, resourceManager) {
        super(x, y, 180);
        this.id = id;
        this.name = "Unknown";

        this.targetX = x;
        this.targetY = y;
        this.serverTime = 0;

        // Visuals
        this.animations = {};
        this.currentAnim = 'idle_down';
        this.animFrame = 0;
        this.animTimer = 0;
        this.animSpeed = 10;
        this.width = 48;
        this.height = 48;

        this._loadAnimations(resourceManager);
    }

    async _loadAnimations(res) {
        if (!res) return;

        // Config based on directory scan
        // Warning: 'right' folder had messy filenames (4..9, 05). 
        // We will try 1..8 for valid folders and specific logic if needed, 
        // but for now let's try standard 1..8 and let ResourceManager cache/fail handle it.
        const config = {
            'move_down': { path: 'assets/resource/magicion_front/', count: 8 },
            'move_up': { path: 'assets/resource/magicion_back/', count: 5 }, // Found 5 files
            'move_left': { path: 'assets/resource/magicion_left/', count: 7 }, // Found 7 files
            'move_right': { path: 'assets/resource/magicion_right/', count: 9 }, // Try up to 9 to catch the high numbers
            'attack': { path: 'assets/resource/magician_attack/', count: 13 }
        };

        for (const [key, conf] of Object.entries(config)) {
            this.animations[key] = [];
            for (let i = 1; i <= conf.count; i++) {
                // Handle numbering (some might be 01, 02.. or just 1, 2)
                // The list showed '1.png', '4.png'. 
                // We'll just try loading i.png.
                const url = `${conf.path}${i}.png`;
                try {
                    const img = await res.loadImage(url);
                    this.animations[key].push(img);
                } catch (e) {
                    // Start index might be non-1 or gaps exist (like right folder 4..9)
                    // Just ignore failure.
                }
            }
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
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            this.state = 'move';

            // Direction check
            if (Math.abs(dx) > Math.abs(dy)) {
                this.direction = dx > 0 ? 'right' : 'left';
            } else {
                this.direction = dy > 0 ? 'down' : 'up';
            }
        } else {
            this.state = 'idle';
        }

        this.x += dx * lerpFactor;
        this.y += dy * lerpFactor;

        this._updateAnimation(dt);
        super.update(dt);
    }

    _updateAnimation(dt) {
        if (this.state === 'move') {
            this.currentAnim = `move_${this.direction}`;
        } else {
            this.currentAnim = `move_${this.direction}`; // Idle uses movement frame 0
        }

        const frames = this.animations[this.currentAnim];
        // Fallback for right/left if missing?

        if (!frames || frames.length === 0) return;

        if (this.state === 'move') {
            this.animTimer += dt * this.animSpeed;
            if (this.animTimer >= frames.length) {
                this.animTimer = 0;
            }
            this.animFrame = Math.floor(this.animTimer) % frames.length;
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

        // 2. Draw Animation
        const frames = this.animations[this.currentAnim];
        if (frames && frames[this.animFrame]) {
            const img = frames[this.animFrame];
            const drawW = 100;
            const drawH = 100;
            const drawX = centerX - drawW / 2;
            const drawY = y + this.height - drawH + 10;
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
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
}
