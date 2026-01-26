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
        this.interpolationDelay = 200; // v0.27.0: Increased for better jitter tolerance (200ms)

        // Visuals
        this.sprite = null;
        this.direction = 1; // Default to Front
        this.animFrame = 0;
        this.animTimer = 0;
        this.animSpeed = 10;
        this.width = 48;
        this.height = 48;

        this.chatMessage = null;
        this.chatTimer = 0;

        // v0.28.0: Combat States
        this.hp = 100;
        this.maxHp = 100;
        this.deathTimer = 0; // For 3s death state visual
        this.isDying = false;

        this._loadSpriteSheet(resourceManager);

        // v0.28.5: Cache Projectile import to stop repeated requests on attack
        if (!RemotePlayer.projectilePromise) {
            RemotePlayer.projectilePromise = import('./Projectile.js');
        }
    }

    onHpUpdate(data) {
        // data: { hp, maxHp, ts }
        const oldHp = this.hp;
        this.hp = data.hp;
        this.maxHp = data.maxHp;

        // Trigger hit effect if HP decreased
        if (oldHp > this.hp) {
            this.state = 'hit';
            setTimeout(() => { if (this.state === 'hit') this.state = 'idle'; }, 200);

            // v0.28.4: Use global damage text for consistency
            if (window.game) {
                window.game.addDamageText(
                    this.x + this.width / 2,
                    this.y - 40,
                    Math.round(oldHp - this.hp),
                    '#ff4d4d'
                );
            }
        }

        // Handle Death
        if (this.hp <= 0 && !this.isDying) {
            this.die();
        } else if (this.hp > 0 && this.isDying) {
            this.respawn();
        }
    }

    die() {
        this.isDying = true;
        this.isDead = true;
        this.state = 'die';
        this.deathTimer = 3.0; // 3 seconds visual
    }

    respawn() {
        this.isDying = false;
        this.isDead = false;
        this.state = 'idle';
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
        // v0.29.18: Fix tombstone remaining after respawn
        // Allow deathTimer to update even when dead, so respawn logic works correctly
        if (this.isDead) {
            if (this.deathTimer > 0) {
                this.deathTimer -= dt;
            }
            return;
        }

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
                // v0.28.8: Prevent NaN (Division by Zero) if timestamps are identical
                const totalTime = p2.ts - p1.ts;
                const t = totalTime > 0 ? (renderTime - p1.ts) / totalTime : 0;

                finalX = p1.x + (p2.x - p1.x) * t;
                finalY = p1.y + (p2.y - p1.y) * t;
                finalVx = p1.vx + (p2.vx - p1.vx) * t;
                finalVy = p1.vy + (p2.vy - p1.vy) * t;
            } else if (renderTime > p2.ts) {
                // Dead Reckoning: Running out of packets
                const delta = (renderTime - p2.ts) / 1000;
                // v0.27.0: Stop if too far out (1s) to prevent ghosting
                if (delta < 1.0) {
                    finalX = p2.x + p2.vx * delta;
                    finalY = p2.y + p2.vy * delta;
                } else {
                    finalX = p2.x;
                    finalY = p2.y;
                }
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

        // Apply calculated position with gentle smoothing (v0.27.0)
        // If distance is huge (teleport), snap. Else, Lerp.
        const dx = finalX - this.x;
        const dy = finalY - this.y;
        const distSq = dx * dx + dy * dy;

        if (distSq > 400 * 400) { // If distance is greater than 400 pixels, snap
            this.x = finalX;
            this.y = finalY;
        } else {
            const lerpFactor = 0.25; // Smooth but responsive (approx 1/4 per frame)
            this.x += dx * lerpFactor;
            this.y += dy * lerpFactor;
        }

        this.vx = finalVx;
        this.vy = finalVy;


        // Movement Threshold & Animation State
        if (!this.isAttacking) {
            if (distSq > 1.0 || Math.abs(finalVx) > 0.1 || Math.abs(finalVy) > 0.1) {
                this.state = 'move';
                // Direction Logic
                if (Math.abs(finalVx) > Math.abs(finalVy)) {
                    this.direction = finalVx > 0 ? 3 : 2;
                } else if (Math.abs(finalVy) > 0.1) {
                    this.direction = finalVy > 0 ? 1 : 0;
                }

                // v0.28.7: Fallback safety
                if (typeof this.direction !== 'number' || isNaN(this.direction)) {
                    this.direction = 1;
                }
            } else {
                this.state = 'idle';
            }
        }

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

        if (this.shieldEffect && this.shieldEffect.timer > 0) {
            this.shieldEffect.timer -= dt;
            if (this.shieldEffect.timer <= 0) this.shieldEffect = null;
        }

        this._updateAnimation(dt);
        super.update(dt);

        if (this.chatTimer > 0) {
            this.chatTimer -= dt;
            if (this.chatTimer <= 0) this.chatMessage = null;
        }

        if (this.actionTimer > 0) {
            this.actionTimer -= dt;
            if (this.actionTimer <= 0) this.actionFdbk = null;
        }
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
            // v0.29.2: Force visual chain even if no monsters (Action Feedback)
            let tx = centerX; let ty = centerY;
            const dist = 300; // Visual range
            if (this.direction === 0) ty -= dist;
            else if (this.direction === 1) ty += dist;
            else if (this.direction === 2) tx -= dist;
            else if (this.direction === 3) tx += dist;

            // Add some jitter to endpoint
            tx += (Math.random() - 0.5) * 50;
            ty += (Math.random() - 0.5) * 50;

            this.lightningEffect = { chains: [{ x1: centerX, y1: centerY, x2: tx, y2: ty }], timer: 0.3 };
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
        // v0.28.8: Ultimate Safety Check - Prevent disappearing due to NaN
        if (isNaN(this.x) || isNaN(this.y)) {
            // Try to recover from targetX/Y or packet buffer, otherwise 0
            if (this.serverUpdates.length > 0) {
                const last = this.serverUpdates[this.serverUpdates.length - 1];
                this.x = last.x || 0;
                this.y = last.y || 0;
            } else {
                this.x = this.x || 0; // if it was NaN, it stays NaN? No.
                if (isNaN(this.x)) this.x = this.targetX || 0;
                if (isNaN(this.y)) this.y = this.targetY || 0;
            }
        }

        // Culling Check
        if (this.x + this.width + 100 < camera.x ||
            this.x - 100 > camera.x + camera.width ||
            this.y + this.height + 100 < camera.y ||
            this.y - 100 > camera.y + camera.height) {
            return;
        }

        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;

        // 1. Shadow
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(centerX, this.y + this.height - 4, this.width / 2 * 0.7, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 2. Magic Circle
        if (this.state === 'attack' || this.isAttacking) {
            this.drawMagicCircle(ctx, centerX, this.y + this.height + 5);
        }

        // 2.5 Shield Element (v0.29.0)
        if (this.shieldEffect && this.shieldEffect.timer > 0) {
            // Keep shield active/fading logic here? Or just static visual for animation duration
            // Let's assume just drawing if timer > 0
            // We can decrement timer in update() - wait, did I add update logic?
            // Yes update() decrements lightningEffect, lets add shieldEffect too.
            this.drawShield(ctx, centerX, centerY);
        }

        // 3. Draw Sprite / Tombstone
        // v0.29.4: Fix tombstone remaining after respawn
        // Priority: If HP > 0, force alive state rendering (even if isDying flag lingered)
        if (this.isDying && this.hp <= 0) {
            this.drawTombstone(ctx, centerX, this.y);
        } else if (this.sprite) {
            // Force reset dying state if we are rendering sprite but flag is stuck
            if (this.isDying && this.hp > 0) this.isDying = false;

            let row = Math.max(0, Math.min(4, this.direction));
            if (this.state === 'attack') row = 4;

            // Safety check for animFrame
            const maxFrames = this.frameCounts[row] || 8;
            let col = this.animFrame % maxFrames;
            if (col < 0 || isNaN(col)) col = 0;

            const drawW = 120;
            const drawH = 120;
            const drawX = centerX - drawW / 2;
            const drawY = this.y + this.height - drawH + 10;
            this.sprite.draw(ctx, row, col, drawX, drawY, drawW, drawH);
        } else {
            // v0.28.7: Restore Fallback (Red Circle) for missing sprite or loading state
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

        // 4. HUD
        this.drawHUD(ctx, centerX, this.y);

        // 5. Direction Arrow - v0.29.13: Move up 30px
        this.drawDirectionArrow(ctx, centerX, this.y + this.height - 30);

        // 6. Lightning Effect
        this.drawLightningEffect(ctx, centerX, centerY);
    }

    drawTombstone(ctx, centerX, y) {
        ctx.save();
        ctx.fillStyle = '#b2bec3';
        ctx.strokeStyle = '#2d3436';
        ctx.lineWidth = 2;
        const tw = 40, th = 50;
        const tx = centerX - tw / 2, ty = y + this.height - th;
        ctx.beginPath();
        ctx.moveTo(tx, ty + th);
        ctx.lineTo(tx, ty + 15);
        ctx.quadraticCurveTo(tx, ty, tx + tw / 2, ty);
        ctx.quadraticCurveTo(tx + tw, ty, tx + tw, ty + 15);
        ctx.lineTo(tx + tw, ty + th);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#636e72';
        ctx.beginPath();
        ctx.moveTo(centerX, ty + 10); ctx.lineTo(centerX, ty + 30);
        ctx.moveTo(centerX - 10, ty + 18); ctx.lineTo(centerX + 10, ty + 18);
        ctx.stroke();
        ctx.restore();
    }

    triggerAttack(data) {
        if (this.lastAttackTime && data.ts <= this.lastAttackTime) return;

        // v0.28.6: Validate direction to prevent sprite disappearing
        if (typeof data.dir === 'number' && data.dir >= 0 && data.dir <= 3) {
            this.direction = data.dir;
        }

        this.lastAttackTime = data.ts;
        this.isAttacking = true;
        this.state = 'attack';
        this.animTimer = 0;

        const skillType = data.skillType || 'normal';
        const skillNames = {
            'missile': '매직 미사일 !!',
            'fireball': '파이어볼 !!',
            'laser': '체인 라이트닝 !!',
            'shield': '앱솔루트 베리어 !!'
        };

        // v0.29.0: Show "ID : SkillName" in speech bubble
        if (skillNames[skillType]) {
            this.triggerAction(`${this.name} : ${skillNames[skillType]}`);
        }

        if (skillType === 'shield') {
            // Shield Visual
            this.shieldEffect = { timer: 2.0 };
            // Do not return early, let the state reset timer run
        }

        if (skillType === 'fireball' || skillType === 'missile') {
            const centerX = data.x + this.width / 2;
            const centerY = data.y + this.height / 2;
            RemotePlayer.projectilePromise.then(({ Projectile }) => {
                if (!window.game) return;
                if (skillType === 'fireball') {
                    let vx = 0, vy = 0, speed = 400;
                    // v0.29.13: Use angle from extraData if available (8-direction)
                    const angle = data.extraData?.angle;
                    if (angle !== undefined) {
                        vx = Math.cos(angle) * speed;
                        vy = Math.sin(angle) * speed;
                    } else {
                        // Fallback to 4-direction
                        if (this.direction === 0) vy = -speed;
                        else if (this.direction === 1) vy = speed;
                        else if (this.direction === 2) vx = -speed;
                        else if (this.direction === 3) vx = speed;
                    }
                    window.game.projectiles.push(new Projectile(centerX, centerY, null, 'fireball', {
                        vx, vy, speed, damage: 0, ownerId: this.id, radius: 80
                    }));
                } else if (skillType === 'missile') {
                    // v0.29.2: Ensure at least 1 missile and validate count
                    let count = Number(data.extraData);
                    if (isNaN(count) || count < 1) count = 1;
                    if (count > 5) count = 5; // Cap at 5
                    this._triggerRemoteMissileVisual(centerX, centerY, count);
                }
            });
        }

        // v0.29.9: Trigger Chain Lightning visual for remote player
        if (skillType === 'laser') {
            this._updateLightningVisual();
        }

        if (this.attackTimeout) clearTimeout(this.attackTimeout);
        this.attackTimeout = setTimeout(() => {
            this.isAttacking = false;
            if (!this.isDying) this.state = 'idle';
        }, 600);
    }

    triggerAction(text) {
        this.actionFdbk = text;
        this.actionTimer = 2.0;
    }

    _triggerRemoteMissileVisual(centerX, centerY, count = 1) {
        RemotePlayer.projectilePromise.then(({ Projectile }) => {
            if (!window.game) return;
            const angles = [-Math.PI / 2, Math.PI / 2, Math.PI, 0];
            const baseAngle = angles[this.direction] + Math.PI;

            for (let i = 0; i < count; i++) {
                // Spread logic similar to Player.js
                const spread = (Math.PI * 4) / 9;
                const angleOffset = (Math.random() - 0.5) * 0.4;
                const angle = baseAngle + (i - (count - 1) / 2) * (spread / Math.max(1, count - 1)) + angleOffset;

                const speed = 350 + Math.random() * 300;
                window.game.projectiles.push(new Projectile(centerX, centerY, null, 'missile', {
                    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                    speed: 600, damage: 0, ownerId: this.id
                }));
            }
        });
    }

    drawHUD(ctx, centerX, y) {
        const barW = 60, barH = 8, barY = y + this.height + 5;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(centerX - barW / 2, barY, barW, barH);
        const hpP = Math.min(1, Math.max(0, this.hp / this.maxHp));
        ctx.fillStyle = hpP > 0.3 ? '#4ade80' : '#ef4444';
        ctx.fillRect(centerX - barW / 2, barY, barW * hpP, barH);

        const nameY = y - 50;
        ctx.save();
        ctx.font = 'bold 13px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
        ctx.strokeText(this.name, centerX, nameY);
        ctx.fillStyle = '#fff'; ctx.fillText(this.name, centerX, nameY);
        ctx.restore();

        if (this.chatMessage) this.drawSpeechBubble(ctx, centerX, y - 85, this.chatMessage);
        else if (this.actionFdbk) this.drawSpeechBubble(ctx, centerX, y - 85, this.actionFdbk, '#833471');
    }

    showSpeechBubble(text) {
        this.chatMessage = text;
        this.chatTimer = 5.0;
    }

    drawSpeechBubble(ctx, x, y, text, textColor = '#2d3436') {
        if (!text) return;
        ctx.save();
        ctx.font = 'bold 13px "Outfit", sans-serif';
        const padding = 10, metrics = ctx.measureText(text);
        const w = Math.min(200, metrics.width + padding * 2), h = 28;
        const bx = x - w / 2, by = y - h - 10;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.strokeStyle = '#2d3436'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 8); else ctx.rect(bx, by, w, h);
        ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 5, by + h); ctx.lineTo(x + 5, by + h); ctx.lineTo(x, by + h + 5);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = textColor; ctx.textAlign = 'center'; ctx.fillText(text, x, by + 19, 190);
        ctx.restore();
    }

    drawDirectionArrow(ctx, sx, sy) {
        ctx.save();
        // v0.29.14: Use velocity for 8-direction arrow
        let vx = this.vx || 0;
        let vy = this.vy || 0;
        const mag = Math.sqrt(vx * vx + vy * vy);
        if (mag > 0.1) {
            vx /= mag;
            vy /= mag;
        } else {
            // Fallback to direction when idle
            switch (this.direction) {
                case 0: vy = -1; break; case 1: vy = 1; break; case 2: vx = -1; break; case 3: vx = 1; break;
            }
        }
        const angle = Math.atan2(vy, vx);
        ctx.translate(sx + vx * 20, sy + vy * 5);
        ctx.rotate(angle);
        ctx.fillStyle = 'rgba(255, 68, 68, 0.7)';
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
        ctx.restore();
    }

    drawLightningEffect(ctx, centerX, centerY) {
        if (!this.lightningEffect || !this.lightningEffect.chains.length) return;
        ctx.save();
        // v0.29.2: Much brighter and thicker for visibility
        ctx.strokeStyle = '#00d2ff'; ctx.lineWidth = 3.5; ctx.shadowBlur = 15; ctx.shadowColor = '#00d2ff';

        this.lightningEffect.chains.forEach(c => {
            ctx.beginPath(); ctx.moveTo(c.x1, c.y1);
            const dx = c.x2 - c.x1, dy = c.y2 - c.y1, dist = Math.sqrt(dx * dx + dy * dy);
            const segments = Math.max(3, Math.floor(dist / 20)); // More segments
            for (let i = 1; i < segments; i++) {
                const tx = c.x1 + dx * (i / segments), ty = c.y1 + dy * (i / segments);
                const off = (Math.random() - 0.5) * 15; // More jitter
                ctx.lineTo(tx + off, ty + off);
            }
            ctx.lineTo(c.x2, c.y2); ctx.stroke();

            // v0.29.0: Add Spark at target
            if (window.game && Math.random() < 0.3) {
                window.game.addSpark(c.x2, c.y2);
            }
        });
        ctx.restore();
    }

    drawShield(ctx, centerX, centerY) {
        ctx.save();
        const time = Date.now() / 200;
        // v0.29.2: Make it much more visible (higher opacity)
        ctx.strokeStyle = `rgba(72, 219, 251, ${0.8 + Math.sin(time) * 0.2})`;
        ctx.fillStyle = `rgba(72, 219, 251, ${0.4 + Math.sin(time) * 0.1})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 45, 0, Math.PI * 2); // Slightly larger
        ctx.fill();
        ctx.stroke();

        // Inner pulse
        ctx.beginPath();
        ctx.arc(centerX, centerY, 35 + Math.sin(time * 2) * 2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, 0.5)`;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }

    drawMagicCircle(ctx, sx, sy) {
        ctx.save();
        const rInner = 60, rOuter = 75, Y_SCALE = 0.45;
        ctx.translate(sx, sy);
        ctx.shadowBlur = 10; ctx.shadowColor = '#00d2ff';
        ctx.strokeStyle = 'rgba(72, 219, 251, 0.8)'; // Increased visibility v0.29.0
        ctx.lineWidth = 2; // Thicker lines
        [rOuter, rInner].forEach(r => {
            ctx.beginPath();
            for (let i = 0; i < 12; i++) {
                const a1 = (i / 12) * Math.PI * 2, a2 = ((i + 1) / 12) * Math.PI * 2;
                const x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r * Y_SCALE;
                const x2 = Math.cos(a2) * r, y2 = Math.sin(a2) * r * Y_SCALE;
                ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
            }
            ctx.stroke();
        });
        ctx.restore();
    }
}
