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
        this.serverUpdates = []; // Buffer for interpolation: { x, y, vx, vy, ts }
        this.interpolationDelay = 150; // Delay in ms (Buffer size)

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
        // packet: { id, x, y, vx, vy, ts, name }
        if (packet.name) this.name = packet.name;

        this.serverUpdates.push({
            x: packet.x,
            y: packet.y,
            vx: packet.vx || 0,
            vy: packet.vy || 0,
            ts: packet.ts || Date.now()
        });

        // Limit buffer size
        if (this.serverUpdates.length > 20) {
            this.serverUpdates.shift();
        }

        // Sort by timestamp just in case of out-of-order delivery
        this.serverUpdates.sort((a, b) => a.ts - b.ts);
    }

    update(dt) {
        if (this.isDead) return;

        const renderTime = Date.now() - this.interpolationDelay;
        let finalX = this.x;
        let finalY = this.y;
        let finalVx = this.vx;
        let finalVy = this.vy;

        if (this.serverUpdates.length >= 2) {
            // Find two packets that surround our renderTime
            let i = 0;
            for (i = 0; i < this.serverUpdates.length - 1; i++) {
                if (this.serverUpdates[i + 1].ts > renderTime) break;
            }

            // Clamping to avoid index out of bounds if renderTime is ahead of all packets
            if (i >= this.serverUpdates.length - 1) i = this.serverUpdates.length - 2;

            const p1 = this.serverUpdates[i];
            const p2 = this.serverUpdates[i + 1];

            if (renderTime >= p1.ts && renderTime <= p2.ts) {
                // Interpolate
                const t = (renderTime - p1.ts) / (p2.ts - p1.ts);
                finalX = p1.x + (p2.x - p1.x) * t;
                finalY = p1.y + (p2.y - p1.y) * t;
                finalVx = p1.vx + (p2.vx - p1.vx) * t;
                finalVy = p1.vy + (p2.vy - p1.vy) * t;
            } else if (renderTime > p2.ts) {
                // Extrapolate (Dead Reckoning) - We ran out of packets
                const delta = (renderTime - p2.ts) / 1000;
                finalX = p2.x + p2.vx * delta;
                finalY = p2.y + p2.vy * delta;
                finalVx = p2.vx;
                finalVy = p2.vy;
            } else {
                // Snap to oldest if too behind
                finalX = p1.x;
                finalY = p1.y;
                finalVx = p1.vx;
                finalVy = p1.vy;
            }

            // Cleanup old packets
            while (this.serverUpdates.length > 2 && this.serverUpdates[1].ts < renderTime) {
                this.serverUpdates.shift();
            }
        }

        const dx = finalX - this.x;
        const dy = finalY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Movement Threshold & Animation State
        if (!this.isAttacking) {
            if (dist > 1.0 || Math.abs(finalVx) > 0.1 || Math.abs(finalVy) > 0.1) {
                this.state = 'move';
                // Direction Logic
                if (Math.abs(finalVx) > Math.abs(finalVy)) {
                    this.direction = finalVx > 0 ? 3 : 2;
                } else if (Math.abs(finalVy) > 0.1) {
                    this.direction = finalVy > 0 ? 1 : 0;
                }
            } else {
                this.state = 'idle';
            }
        }

        // Apply calculated position
        this.x = finalX;
        this.y = finalY;
        this.vx = finalVx;
        this.vy = finalVy;


        // Remote Lightning Logic
        if (this.state === 'attack') {
            this.lightningTickTimer = (this.lightningTickTimer || 0) - dt;
            if (this.lightningTickTimer <= 0) {
                this.lightningTickTimer = 0.2; // Visual-only tick speed
                this._updateLightningVisual();
            }
        }

        if (this.lightningEffect && this.lightningEffect.timer > 0) {
            this.lightningEffect.timer -= dt;
            if (this.lightningEffect.timer <= 0) this.lightningEffect = null;
        }

        this._updateAnimation(dt);
        super.update(dt);
    }

    _updateLightningVisual() {
        // Visual-only chain calculation for remote player
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        let currentSource = { x: centerX, y: centerY };

        const monstersMap = window.game?.monsterManager?.monsters;
        const monsters = monstersMap ? Array.from(monstersMap.values()) : [];
        const affected = [];
        const chains = [];
        const maxChains = 2; // Default for remote visual if level unknown
        const range = 350;

        for (let i = 0; i < maxChains; i++) {
            let next = null;
            let minDist = range;
            monsters.forEach(m => {
                if (m.isDead || affected.includes(m)) return;
                const d = Math.sqrt((currentSource.x - m.x) ** 2 + (currentSource.y - m.y) ** 2);
                if (d < minDist) {
                    minDist = d;
                    next = m;
                }
            });
            if (next) {
                chains.push({ x1: currentSource.x, y1: currentSource.y, x2: next.x, y2: next.y });
                affected.push(next);
                currentSource = { x: next.x, y: next.y };
            } else break;
        }

        if (chains.length > 0) {
            this.lightningEffect = { chains: chains, timer: 0.25 };
        } else {
            // Facing visual
            let tx = centerX; let ty = centerY;
            if (this.direction === 0) ty -= 60;
            else if (this.direction === 1) ty += 60;
            else if (this.direction === 2) tx -= 60;
            else if (this.direction === 3) tx += 60;
            this.lightningEffect = { chains: [{ x1: centerX, y1: centerY, x2: tx, y2: ty }], timer: 0.2 };
        }
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
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; // Synced shadow
        ctx.beginPath();
        ctx.ellipse(centerX, y + this.height - 4, this.width / 2 * 0.7, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Magic Circle (Drawn before character if attacking)
        if (this.state === 'attack' || this.isAttacking) {
            this.drawMagicCircle(ctx, centerX, y + this.height + 5);
        }

        // 3. Draw Sprite
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

        // 3. HUD (HP Bar & Name)
        this.drawHUD(ctx, centerX, y);

        // 4. Direction Arrow (At feet)
        this.drawDirectionArrow(ctx, centerX, y + this.height);

        // 5. Lightning Effect (Remote)
        if (this.lightningEffect && Array.isArray(this.lightningEffect.chains) && this.lightningEffect.chains.length > 0) {
            ctx.save();
            ctx.strokeStyle = '#00d2ff'; // Synced color
            ctx.lineWidth = 1.5;
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#00d2ff';

            this.lightningEffect.chains.forEach(c => {
                if (!c || typeof c.x1 !== 'number') return;
                ctx.beginPath();
                ctx.moveTo(c.x1, c.y1);
                const dx = c.x2 - c.x1;
                const dy = c.y2 - c.y1;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const segments = Math.max(3, Math.floor(dist / 30));
                for (let i = 1; i < segments; i++) {
                    const tx = c.x1 + dx * (i / segments);
                    const ty = c.y1 + dy * (i / segments);
                    const off = (Math.random() - 0.5) * 10;
                    ctx.lineTo(tx + off, ty + off);
                }
                ctx.lineTo(c.x2, c.y2);
                ctx.stroke();
            });
            ctx.restore();
        }
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

    drawHUD(ctx, centerX, y) {
        const barWidth = 60;
        const barHeight = 8;
        const startY = y + this.height + 5;

        // HP Bar
        const barY = startY;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(centerX - barWidth / 2, barY, barWidth, barHeight);

        const hpPerc = Math.min(1, Math.max(0, (this.hp || 100) / (this.maxHp || 100)));
        ctx.fillStyle = hpPerc > 0.3 ? '#4ade80' : '#ef4444';
        ctx.fillRect(centerX - barWidth / 2, barY, barWidth * hpPerc, barHeight);

        // Name Tag (Styled with outline to match screenshot)
        const nameY = y - 10;
        ctx.save();
        ctx.font = 'bold 16px "Nanum Gothic", "Outfit", sans-serif';
        ctx.textAlign = 'center';

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(this.name, centerX, nameY);

        ctx.fillStyle = '#fff';
        ctx.fillText(this.name, centerX, nameY);
        ctx.restore();
    }

    drawDirectionArrow(ctx, sx, sy) {
        ctx.save();
        const dist = 60;
        let vx = 0, vy = 0;
        switch (this.direction) {
            case 0: vx = 0; vy = -1; break; // Back
            case 1: vx = 0; vy = 1; break; // Front
            case 2: vx = -1; vy = 0; break; // Left
            case 3: vx = 1; vy = 0; break; // Right
        }

        const angle = Math.atan2(vy, vx);
        ctx.translate(sx + vx * 20, sy + vy * 5); // Positioned slightly below character
        ctx.rotate(angle);

        ctx.fillStyle = 'rgba(255, 68, 68, 0.7)';
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-5, -6);
        ctx.lineTo(-5, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    drawMagicCircle(ctx, sx, sy) {
        // Reusing logic from Player.js but with synced color
        ctx.save();
        const time = Date.now() * 0.002;
        const radiusInner = 60;
        const radiusOuter = 75;
        const timeSeed = Math.floor(Date.now() / 100);
        const Y_SCALE = 0.45;

        ctx.translate(sx, sy);

        const addLightningPath = (x1, y1, x2, y2, segments = 3, spread = 8) => {
            ctx.moveTo(x1, y1);
            for (let i = 1; i < segments; i++) {
                const ratio = i / segments;
                const px = x1 + (x2 - x1) * ratio;
                const py = y1 + (y2 - y1) * ratio;
                const seed = timeSeed + i + x1 + y1;
                const offset = (Math.sin(seed * 999) * spread);
                const angle = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
                ctx.lineTo(px + Math.cos(angle) * offset, py + Math.sin(angle) * offset);
            }
            ctx.lineTo(x2, y2);
        };

        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00d2ff';
        ctx.strokeStyle = 'rgba(72, 219, 251, 0.6)';

        const radiusRim = radiusOuter * 1.08;
        const circleSegments = 12; // Simplified for remotes
        [radiusOuter, radiusInner].forEach((r, idx) => {
            ctx.beginPath();
            for (let i = 0; i < circleSegments; i++) {
                const a1 = (i / circleSegments) * Math.PI * 2;
                const a2 = ((i + 1) / circleSegments) * Math.PI * 2;
                const x1 = Math.cos(a1) * r;
                const y1 = Math.sin(a1) * r * Y_SCALE;
                const x2 = Math.cos(a2) * r;
                const y2 = Math.sin(a2) * r * Y_SCALE;
                addLightningPath(x1, y1, x2, y2, 2, 4);
            }
            ctx.stroke();
        });
        ctx.restore();
    }
}
