import Entity from './core/Entity.js';

export default class Drop extends Entity {
    constructor(id, x, y, type, amount, options = {}) {
        super(x, y);
        this.id = id;
        this.type = type; // 'manastone', 'exp', 'hp'
        this.amount = amount;
        this.ownerId = options.ownerId || null;
        this.partyMembers = Array.isArray(options.partyMembers) ? options.partyMembers : null;
        this.eligibleCollectorIds = Array.isArray(options.eligibleCollectorIds)
            ? Array.from(new Set(options.eligibleCollectorIds.filter(Boolean)))
            : null;
        this.spawnedAt = Number(options.ts || Date.now());
        this.expiresAt = Number(options.expiresAt || (this.spawnedAt + 30000));
        this.radius = 15;
        this.isCollected = false;
        this.isLocallyCollected = false; // Prevent spam

        // Float effect
        this.offY = 0;
        this.randomOffset = Math.random() * Math.PI * 2;
        this.timer = 0;

        // Visual properties
        const isManastoneDrop = this.type === 'manastone' || this.type === 'gold';
        this.color = isManastoneDrop ? '#7C8CFF' : (this.type === 'hp' ? '#4ade80' : '#00BFFF');
        this.glowColor = isManastoneDrop ? 'rgba(124, 140, 255, 0.35)' : (this.type === 'hp' ? 'rgba(74, 222, 128, 0.3)' : 'rgba(0, 191, 255, 0.3)');
    }

    canPlayerCollect(player) {
        if (!player?.id) return !this.ownerId && !(this.eligibleCollectorIds?.length > 0);
        if (Array.isArray(this.eligibleCollectorIds) && this.eligibleCollectorIds.length > 0) {
            return this.eligibleCollectorIds.includes(player.id);
        }
        return !this.ownerId
            || player.id === this.ownerId
            || this.partyMembers?.includes(player.id);
    }

    update(dt, player) {
        this.timer += dt;
        this.offY = Math.sin(this.timer * 3 + this.randomOffset) * 5;

        if (this.isCollected) return true;

        // Simple magnetic follow
        const canCollect = this.canPlayerCollect(player);

        if (player && !player.isDead && !this.isLocallyCollected && canCollect) {
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

    isExpired(now = Date.now()) {
        return now >= this.expiresAt;
    }

    render(ctx, camera) {
        const localPlayer = window.game?.localPlayer || null;
        if (localPlayer && !this.canPlayerCollect(localPlayer)) return;

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
        if (this.type === 'gold' || this.type === 'manastone') {
            ctx.moveTo(screenX, screenY - 10);
            ctx.lineTo(screenX + 9, screenY - 4);
            ctx.lineTo(screenX + 7, screenY + 7);
            ctx.lineTo(screenX, screenY + 11);
            ctx.lineTo(screenX - 7, screenY + 7);
            ctx.lineTo(screenX - 9, screenY - 4);
            ctx.closePath();
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
