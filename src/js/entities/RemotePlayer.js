import Actor from './Actor.js';

export default class RemotePlayer extends Actor {
    constructor(id, x, y) {
        super(x, y, 180); // Same speed as player
        this.id = id; // Firebase UID
        this.name = "Unknown";

        // Data interpolation buffer
        this.targetX = x;
        this.targetY = y;
        this.serverTime = 0;
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

        super.update(dt);
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
        ctx.ellipse(centerX, y + this.height - 2, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Aura (Different color)
        const time = Date.now() / 200;
        const pulse = Math.sin(time + 100) * 2; // Offset pulse

        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#fab1a0';

        // Body
        ctx.fillStyle = '#e17055'; // Reddish
        ctx.beginPath();
        ctx.arc(centerX, centerY - 5 + pulse, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 3. Simple Hat (Gray)
        ctx.fillStyle = '#636e72';
        ctx.beginPath();
        ctx.moveTo(centerX - 16, centerY - 10 + pulse);
        ctx.lineTo(centerX + 16, centerY - 10 + pulse);
        ctx.lineTo(centerX, centerY - 35 + pulse);
        ctx.fill();

        // 4. ID Text
        ctx.fillStyle = '#ddd';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 2;
        ctx.fillText(this.id.substring(0, 5), centerX, y - 10 + pulse);
        ctx.shadowBlur = 0;
    }
}
