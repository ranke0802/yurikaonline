export default class Drop {
    constructor(x, y, type, amount) {
        this.x = x;
        this.y = y;
        this.type = type; // 'gold' or 'xp'
        this.amount = amount;
        this.timer = 0;
        this.lifeTime = 5.0; // Seconds before it disappears
        this.radius = 15;
        this.isCollected = false;

        // Random float effect
        this.offY = 0;
        this.randomOffset = Math.random() * Math.PI * 2;
    }

    update(dt, player) {
        this.timer += dt;
        if (this.timer > this.lifeTime) return true; // Mark for deletion

        this.offY = Math.sin(Date.now() * 0.005 + this.randomOffset) * 5;

        // Magnetized collection
        const dist = Math.sqrt((this.x - player.x) ** 2 + (this.y - player.y) ** 2);
        if (dist < 40) {
            this.isCollected = true;
            return true;
        } else if (dist < 150) {
            // Move towards player
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            this.x += Math.cos(angle) * 200 * dt;
            this.y += Math.sin(angle) * 200 * dt;
        }

        return false;
    }

    draw(ctx, camera) {
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y + this.offY;

        ctx.save();

        // Simple glow (Translucent circle instead of gradient for performance)
        if (this.type === 'gold') ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
        else if (this.type === 'hp') ctx.fillStyle = 'rgba(74, 222, 128, 0.3)';
        else ctx.fillStyle = 'rgba(0, 191, 255, 0.3)';

        ctx.beginPath();
        ctx.arc(screenX, screenY, this.radius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Icon
        if (this.type === 'gold') ctx.fillStyle = '#FFD700';
        else if (this.type === 'hp') ctx.fillStyle = '#4ade80';
        else ctx.fillStyle = '#00BFFF';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (this.type === 'gold') {
            ctx.arc(screenX, screenY, 8, 0, Math.PI * 2);
        } else if (this.type === 'hp') {
            // Plus shape for HP
            ctx.rect(screenX - 8, screenY - 3, 16, 6);
            ctx.rect(screenX - 3, screenY - 8, 6, 16);
        } else {
            // Diamond shape for XP
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
