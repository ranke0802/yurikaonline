import Entity from './Entity.js';

export default class Drop extends Entity {
    constructor(id, x, y, type, amount) {
        super(x, y);
        this.id = id;
        this.type = type; // 'gold', 'exp', 'hp'
        this.amount = amount;
        this.radius = 15;
        this.isCollected = false;
        this.isLocallyCollected = false; // Prevent spam

        // Float effect
        this.offY = 0;
        this.randomOffset = Math.random() * Math.PI * 2;
        this.timer = 0;

        // Visual properties
        this.color = this.type === 'gold' ? '#FFD700' : (this.type === 'hp' ? '#4ade80' : '#00BFFF');
        this.glowColor = this.type === 'gold' ? 'rgba(255, 215, 0, 0.3)' : (this.type === 'hp' ? 'rgba(74, 222, 128, 0.3)' : 'rgba(0, 191, 255, 0.3)');
    }

    update(dt, player) {
        this.timer += dt;
        this.offY = Math.sin(this.timer * 3 + this.randomOffset) * 5;

        if (this.isCollected) return true;

        // Simple magnetic follow
        if (player && !player.isDead && !this.isLocallyCollected) {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 750) {
                const speed = 300 * dt;
                const angle = Math.atan2(dy, dx);
                this.x += Math.cos(angle) * speed;
                this.y += Math.sin(angle) * speed;

                // Local collection check
                if (dist < 25) {
                    this.isLocallyCollected = true;
                    return true; // Trigger collection packet
                }
            }
        }

        return false;
    }

    render(ctx, camera) {
        const screenX = this.x;
        const screenY = this.y + this.offY;

        ctx.save();

        // Glow
        ctx.fillStyle = this.glowColor;
        ctx.beginPath();
        ctx.arc(screenX, screenY, this.radius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Icon
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (this.type === 'gold') {
            ctx.arc(screenX, screenY, 8, 0, Math.PI * 2);
        } else if (this.type === 'hp') {
            ctx.rect(screenX - 8, screenY - 3, 16, 6);
            ctx.rect(screenX - 3, screenY - 8, 6, 16);
        } else {
            // Exp (Diamond)
            ctx.moveTo(screenX, screenY - 10);
            ctx.lineTo(screenX + 8, screenY);
            ctx.lineTo(screenX, screenY + 10);
            ctx.lineTo(screenX - 8, screenY);
            ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
}
