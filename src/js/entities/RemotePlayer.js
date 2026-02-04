import CharacterBase from './core/CharacterBase.js';
import Logger from '../utils/Logger.js';
import { Sprite } from '../core/Sprite.js';
import SkillRenderer from '../skills/renderers/SkillRenderer.js';

export default class RemotePlayer extends CharacterBase {
    constructor(id, x, y, resourceManager) {
        super(x, y, 180);
        this.id = id;
        this.name = "Unknown";
        this.type = 'player';
        this.hostility = {};

        this.targetX = x;
        this.targetY = y;

        // Phase 1: Enhanced interpolation system
        this.serverUpdates = [];
        this.interpolationDelay = 100; // Reduced for lower latency feel
        this.adaptiveDelay = 100;
        this.packetJitterHistory = [];
        this.lastPacketTime = 0;

        // Extrapolation state
        this.isExtrapolating = false;
        this.extrapolationConfidence = 0;
        this.lastKnownVelocity = { x: 0, y: 0 };

        // Visuals
        this.sprite = null;
        this.direction = 1;
        this.animFrame = 0;
        this.animTimer = 0;
        this.animSpeed = 10;
        this.width = 48;
        this.height = 48;

        this.chatMessage = null;
        this.chatTimer = 0;

        // Combat States
        this.hp = 100;
        this.maxHp = 100;
        this.deathTimer = 0;
        this.isDying = false;

        // Status Effect Timers
        this.electrocutedTimer = 0;
        this.burnTimer = 0;
        this.slowRatio = 0;

        this._loadSpriteSheet(resourceManager);

        // Cache Projectile import
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

            // v0.00.06: Shield Break Effect on Hit
            if (this.shieldEffect) {
                this.shieldEffect = null;
                // Optional: Add shield break sound or particles here
            }

            // v0.28.4: Use global damage text for consistency
            // v0.00.40: Added minus prefix for damage display
            if (window.game) {
                const dmgAmount = Math.round(oldHp - this.hp);
                window.game.addDamageText(
                    this.x + this.width / 2,
                    this.y - 40,
                    `-${dmgAmount}`,
                    '#ff4d4d'
                );
            }
        }

        // Handle Death
        if (this.hp <= 0 && !this.isDying) {
            this.die();
        } else if (this.hp > 0 && (this.isDying || this.isDead)) {
            // v0.00.03: Ensure respawn if HP becomes positive
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

        // v0.00.41: Clear all status effects on respawn
        this.burnTimer = 0;
        this.electrocutedTimer = 0;
        this.slowRatio = 0;
    }

    // v1.99.37: PvP check for RemotePlayer owner (Used by Projectile)
    canAttackTarget(target) {
        if (!target || target.isDead) return false;
        if (target.isMonster || target.type === 'monster') return true;

        if (target.type === 'player') {
            if (target.id === this.id) return false;
            if (this.party && this.party.members.includes(target.id)) return false;

            // Enforce mutual hostility
            const hostileList = this.hostility || {};
            const isHeHostileToMe = hostileList.hasOwnProperty(target.id) || !!hostileList[target.id];
            if (!isHeHostileToMe) return false;

            const targetHostileList = target.hostility || {};
            const amIHostileToHim = targetHostileList.hasOwnProperty(this.id) || !!targetHostileList[this.id];

            return amIHostileToHim;
        }
        return false;
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

    // Phase 1: Enhanced server update with adaptive delay calculation
    onServerUpdate(packet) {
        const now = Date.now();

        // Update profile fields (v0.00.70: 조기 반환 이전에 처리)
        if (packet.name) this.name = packet.name;
        if (packet.level !== undefined) this.level = packet.level;
        if (packet.party !== undefined) this.party = packet.party;
        if (packet.hostility !== undefined) this.hostility = packet.hostility;

        // Calculate packet jitter for adaptive delay
        if (this.lastPacketTime > 0) {
            const jitter = Math.abs(now - this.lastPacketTime - 60); // Expected 60ms interval
            this.packetJitterHistory.push(jitter);
            if (this.packetJitterHistory.length > 30) this.packetJitterHistory.shift();

            // Update adaptive delay based on 90th percentile jitter
            if (this.packetJitterHistory.length >= 10) {
                const sorted = [...this.packetJitterHistory].sort((a, b) => a - b);
                const p90 = sorted[Math.floor(sorted.length * 0.9)];
                this.adaptiveDelay = Math.max(50, Math.min(300, p90 * 2 + 30));
            }
        }
        this.lastPacketTime = now;

        // Validate packet data (v0.00.70: 위치 데이터가 없으면 프로필만 업데이트하고 반환)
        if (typeof packet.x !== 'number' || typeof packet.y !== 'number') {
            // 이름/레벨 등 프로필 정보만 있는 업데이트는 위에서 처리됨
            return;
        }

        // Add to buffer with deduplication
        const newUpdate = {
            x: packet.x,
            y: packet.y,
            vx: packet.vx || 0,
            vy: packet.vy || 0,
            ts: packet.ts || now,
            receivedAt: now
        };

        // Skip if duplicate timestamp
        if (this.serverUpdates.length > 0) {
            const last = this.serverUpdates[this.serverUpdates.length - 1];
            if (Math.abs(newUpdate.ts - last.ts) < 10) return;
        }

        this.serverUpdates.push(newUpdate);

        // Keep only last 2 seconds of updates
        const cutoff = now - 2000;
        this.serverUpdates = this.serverUpdates.filter(u => u.ts > cutoff);

        // Sort by timestamp
        this.serverUpdates.sort((a, b) => a.ts - b.ts);

        // Update extrapolation confidence
        this.extrapolationConfidence = Math.min(1, this.extrapolationConfidence + 0.2);
        this.lastKnownVelocity = { x: newUpdate.vx, y: newUpdate.vy };
        this.isExtrapolating = false;
    }

    update(dt) {
        // Handle death/respawn logic
        if (this.isDead || this.isDying) {
            if (this.hp > 0) {
                this.respawn();
            } else {
                if (this.deathTimer > 0) this.deathTimer -= dt;
                return;
            }
        }

        // Phase 1: Enhanced interpolation with adaptive delay and extrapolation
        const effectiveDelay = this.adaptiveDelay || this.interpolationDelay;
        const renderTime = Date.now() - effectiveDelay;
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

            const totalTime = p2.ts - p1.ts;

            if (renderTime >= p1.ts && renderTime <= p2.ts && totalTime > 0) {
                // Normal interpolation with smooth curve
                const t = (renderTime - p1.ts) / totalTime;
                // Smooth step interpolation
                const smoothT = t * t * (3 - 2 * t);

                finalX = p1.x + (p2.x - p1.x) * smoothT;
                finalY = p1.y + (p2.y - p1.y) * smoothT;
                finalVx = p1.vx + (p2.vx - p1.vx) * t;
                finalVy = p1.vy + (p2.vy - p1.vy) * t;

                this.isExtrapolating = false;
                this.extrapolationConfidence = 1;

            } else if (renderTime > p2.ts) {
                // Phase 1: Enhanced extrapolation with confidence decay
                const delta = (renderTime - p2.ts) / 1000;

                if (delta < 0.5) {
                    // Apply velocity with decay
                    const decay = Math.max(0, 1 - delta * 2);
                    finalX = p2.x + p2.vx * delta * decay;
                    finalY = p2.y + p2.vy * delta * decay;
                    finalVx = p2.vx * decay;
                    finalVy = p2.vy * decay;

                    this.isExtrapolating = true;
                    this.extrapolationConfidence = Math.max(0, 1 - delta * 2);
                } else {
                    finalX = p2.x;
                    finalY = p2.y;
                    finalVx = 0;
                    finalVy = 0;
                    this.extrapolationConfidence = 0;
                }
            } else {
                finalX = p1.x;
                finalY = p1.y;
                finalVx = p1.vx;
                finalVy = p1.vy;
            }

            // Cleanup old packets
            while (this.serverUpdates.length > 2 && this.serverUpdates[0].ts < renderTime - 100) {
                this.serverUpdates.shift();
            }
        } else if (this.serverUpdates.length === 1) {
            // Single packet - use with velocity
            const p = this.serverUpdates[0];
            const delta = (renderTime - p.ts) / 1000;

            if (delta < 0.2) {
                finalX = p.x + p.vx * delta;
                finalY = p.y + p.vy * delta;
            } else {
                finalX = p.x;
                finalY = p.y;
            }
            finalVx = p.vx;
            finalVy = p.vy;
        }

        // Apply position with adaptive smoothing
        const dx = finalX - this.x;
        const dy = finalY - this.y;
        const distSq = dx * dx + dy * dy;

        if (distSq > 400 * 400) {
            // Teleport - snap immediately
            this.x = finalX;
            this.y = finalY;
        } else {
            // Adaptive lerp based on distance
            const dist = Math.sqrt(distSq);
            const lerpFactor = Math.min(0.5, 0.1 + dist * 0.01);
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

        // v0.00.63: Remote Player Footsteps (Auditory Cues for Approach)
        if (this.state === 'move') {
            if (!this.stepTimer) this.stepTimer = 0;
            this.stepTimer -= dt;
            if (this.stepTimer <= 0) {
                this.stepTimer = 0.4; // Default walk interval
                if (window.game?.sound) {
                    // Simple distance check to avoid cacophony
                    const distToLocal = window.game.localPlayer
                        ? Math.sqrt((this.x - window.game.localPlayer.x) ** 2 + (this.y - window.game.localPlayer.y) ** 2)
                        : 9999;

                    if (distToLocal < 800) { // Only play if audible
                        window.game.sound.playSfx('footstep_grass');
                    }
                }
            }
        } else {
            this.stepTimer = 0;
        }

        // Remote Lightning Logic
        // v0.00.07: Fix - Only trigger lightning visual if current skill is 'laser'
        if (this.state === 'attack' && this.currentSkill === 'laser') {
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

        // v0.00.45: Shield is now duration-based (1.5s)
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

        // v0.00.26: Status Effect Timer Updates
        if (this.electrocutedTimer > 0) this.electrocutedTimer -= dt;
        if (this.burnTimer > 0) this.burnTimer -= dt;
    }

    // v0.00.26: Apply electrocuted effect
    applyElectrocuted(duration, ratio) {
        this.electrocutedTimer = duration;
        this.slowRatio = ratio;
    }

    // v0.00.26: Apply burn effect
    applyBurn(duration, damagePerTick) {
        this.burnTimer = duration;
        this.burnDamage = damagePerTick;
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
        const range = 400; // v0.00.01: Match actual attack range

        // v0.00.35: Use synced target IDs ONLY - no local fallback for PvP safety
        // This ensures visual effects only appear for valid hostile targets
        if (this.lastAttackTargets && Array.isArray(this.lastAttackTargets) && this.lastAttackTargets.length > 0) {
            this.lastAttackTargets.forEach(tid => {
                let target = window.game?.monsterManager?.monsters.get(tid);
                if (!target) target = window.game?.remotePlayers.get(tid);
                if (tid === window.game?.localPlayer?.id) target = window.game?.localPlayer;

                if (target && !target.isDead) {
                    chains.push({ x1: currentSource.x, y1: currentSource.y, x2: target.x + target.width / 2, y2: target.y + target.height / 2 });
                    currentSource = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
                }
            });
        }
        // Fallback: Search monsters only (NOT players) for visual
        else {
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
                    chains.push({ x1: currentSource.x, y1: currentSource.y, x2: next.x + (next.width / 2 || 0), y2: next.y + (next.height / 2 || 0) });
                    affected.push(next);
                    currentSource = { x: next.x + (next.width / 2 || 0), y: next.y + (next.height / 2 || 0) };
                } else break;
            }
        }

        // v0.00.39: Only show lightning if there are actual chain targets
        // No more forced fallback visual - prevents fake lightning on remote screens
        if (chains.length > 0) {
            this.lightningEffect = { chains: chains, timer: 0.25 };
        } else {
            // No targets = no lightning effect
            this.lightningEffect = null;
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

        // 2. Magic Circle - v0.29.23: 쉴드 활성화 시에도 표시
        if (this.state === 'attack' || this.isAttacking || (this.shieldEffect && this.shieldEffect.timer > 0)) {
            this.drawMagicCircle(ctx, centerX, this.y + this.height + 5);
        }

        // 2.5 Shield Element (v0.29.23: 개선된 쉴드 효과)
        if (this.shieldEffect && this.shieldEffect.timer > 0) {
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

        // 7. v0.00.26: Status Effect Icons (Burn/Electrocuted)
        this._drawStatusIcons(ctx, centerX, this.y + this.height);
    }

    // v0.00.26: Draw status effect icons
    _drawStatusIcons(ctx, centerX, baseY) {
        const hasBurn = this.burnTimer > 0;
        const hasElec = this.electrocutedTimer > 0;
        // v0.00.73: Sync Shield Icon for remote players
        const hasShield = this.shieldEffect && this.shieldEffect.timer > 0;

        if (!hasBurn && !hasElec && !hasShield) return;

        ctx.save();
        // v0.00.73: Position icons BELOW bars, aligned to the LEFT
        const barWidth = 60;
        const startX = centerX - barWidth / 2;
        const iconY = baseY + 28; // v0.00.74: Moved 10px down to avoid covering MP bar
        let currentX = startX + 10;

        const drawStatusBadge = (type) => {
            ctx.save();
            ctx.translate(currentX, iconY);

            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(-10, -10, 20, 20, 4);
            } else {
                ctx.rect(-10, -10, 20, 20);
            }
            ctx.fill();

            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            if (type === 'elec') {
                ctx.strokeStyle = '#00d2ff';
                ctx.shadowBlur = 8;
                ctx.shadowColor = '#00d2ff';
                ctx.beginPath();
                ctx.moveTo(2, -6);
                ctx.lineTo(-3, 0);
                ctx.lineTo(3, 0);
                ctx.lineTo(-2, 6);
                ctx.stroke();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 0.8;
                ctx.shadowBlur = 0;
                ctx.stroke();
            } else if (type === 'burn') {
                ctx.strokeStyle = '#ff4757';
                ctx.shadowBlur = 8;
                ctx.shadowColor = '#ff4757';
                ctx.beginPath();
                ctx.moveTo(0, 5);
                ctx.quadraticCurveTo(4, 5, 4, 0);
                ctx.quadraticCurveTo(4, -5, 0, -6);
                ctx.quadraticCurveTo(-4, -5, -4, 0);
                ctx.quadraticCurveTo(-4, 5, 0, 5);
                ctx.stroke();
                ctx.fillStyle = '#ffa502';
                ctx.fill();
            } else if (type === 'shield') { // v0.00.73: Shield Icon
                ctx.strokeStyle = '#fff';
                ctx.shadowBlur = 8;
                ctx.shadowColor = '#fff';
                ctx.beginPath();
                ctx.moveTo(0, 6);
                ctx.quadraticCurveTo(5, 6, 5, 0);
                ctx.lineTo(5, -4);
                ctx.lineTo(0, -6);
                ctx.lineTo(-5, -4);
                ctx.lineTo(-5, 0);
                ctx.quadraticCurveTo(-5, 6, 0, 6);
                ctx.stroke();
                ctx.fillStyle = 'rgba(100, 100, 255, 0.5)';
                ctx.fill();
            }

            ctx.restore();
            currentX += 22;
        };

        if (hasShield) drawStatusBadge('shield');
        if (hasBurn) drawStatusBadge('burn');
        if (hasElec) drawStatusBadge('elec');

        ctx.restore();
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

    // v0.00.37: Channeling for casting effects (spark, magic circle, attack motion)
    triggerChanneling(data) {
        if (this.lastChannelTime && data.ts <= this.lastChannelTime) return;
        this.lastChannelTime = data.ts;

        // v0.00.38: Handle channeling stop
        if (data.skillType === 'stop') {
            this.isAttacking = false;
            this.state = 'idle';
            this.lightningEffect = null;
            this.currentSkill = null;
            return;
        }

        this.isAttacking = true;
        this.state = 'attack';
        this.animTimer = 0;
        this.currentSkill = data.skillType;

        // Visual feedback
        if (data.skillType === 'laser') {
            // Don't trigger speech bubble here, attack will trigger it if hits
        } else if (data.skillType === 'missile') {
            this.triggerAction(`${this.name} : 매직 미사일 !!`);
        }

        // Reset attack state after a short duration (fallback if stop packet is lost)
        setTimeout(() => {
            if (this.isAttacking && !this.lightningEffect) {
                this.isAttacking = false;
                this.state = 'idle';
            }
        }, 2000); // Increased to 2s as fallback, stop packet should arrive first
    }

    triggerAttack(data) {
        if (this.lastAttackTime && data.ts <= this.lastAttackTime) return;

        // v0.28.6: Validate direction to prevent sprite disappearing
        if (typeof data.dir === 'number' && data.dir >= 0 && data.dir <= 3) {
            this.direction = data.dir;
        }

        this.lastAttackTime = data.ts;
        this.lastAttackAngle = data.extraData?.angle; // v0.00.01: Store precision angle
        this.lastAttackTargets = data.extraData?.targets; // v0.00.01: Store target IDs
        this.isAttacking = true;
        this.state = 'attack';
        this.animTimer = 0;

        const skillType = data.skillType || 'normal';
        this.currentSkill = skillType; // v0.00.07: Track current skill type
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
            // Shield Visual (Permanent until hit)
            this.shieldEffect = { timer: 9999 };
            // Do not return early, let the state reset timer run
        }

        if (skillType === 'fireball' || skillType === 'missile') {
            const centerX = data.x + this.width / 2;
            const centerY = data.y + this.height / 2;
            RemotePlayer.projectilePromise.then(({ Projectile }) => {
                if (!window.game) return;
                if (skillType === 'fireball') {
                    let vx = 0, vy = 0, speed = 800;
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
                    const attackerLevel = (data.extraData && typeof data.extraData.level === 'number') ? data.extraData.level : 1;
                    const baseRad = 20 + (attackerLevel - 1) * 20;
                    const aoeRad = baseRad * 2.5; // v1.99.35: Sync 2.5x AOE

                    window.game.projectiles.push(new Projectile(centerX, centerY, null, 'fireball', {
                        vx, vy, speed, damage: 0, ownerId: this.id, radius: baseRad, aoeRadius: aoeRad,
                        penetrationDelay: (attackerLevel - 1) * 0.05 // v1.99.33: Sync delay
                    }));
                } else if (skillType === 'missile') {
                    // v0.29.2: Ensure at least 1 missile and validate count
                    let count = Number(data.extraData);
                    if (isNaN(count) || count < 1) count = 1;
                    if (count > 20) count = 20; // v0.00.32: Increased Cap to 20 for multi-shot
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

            // v0.00.72: Find nearest valid target for remote player's missile
            const lp = window.game.localPlayer;
            const monsters = window.game.monsterManager?.monsters;
            const rps = window.game.remotePlayers;

            let nearest = null;
            let minDist = 600;

            // 1. Check Local Player
            if (lp && !lp.isDead && this.canAttackTarget(lp)) {
                const d = Math.sqrt((this.x - lp.x) ** 2 + (this.y - lp.y) ** 2);
                if (d < minDist) {
                    minDist = d;
                    nearest = lp;
                }
            }

            // 2. Check Monsters
            if (monsters) {
                monsters.forEach(m => {
                    if (m.isDead) return;
                    const d = Math.sqrt((this.x - m.x) ** 2 + (this.y - m.y) ** 2);
                    if (d < minDist) {
                        minDist = d;
                        nearest = m;
                    }
                });
            }

            // 3. Check Other Remote Players (PvP)
            if (rps) {
                rps.forEach(rp => {
                    if (rp === this || rp.isDead || !this.canAttackTarget(rp)) return;
                    const d = Math.sqrt((this.x - rp.x) ** 2 + (this.y - rp.y) ** 2);
                    if (d < minDist) {
                        minDist = d;
                        nearest = rp;
                    }
                });
            }

            const angles = [-Math.PI / 2, Math.PI / 2, Math.PI, 0];
            const baseAngle = angles[this.direction] + Math.PI;

            for (let i = 0; i < count; i++) {
                const spread = (Math.PI * 4) / 9;
                const angleOffset = (Math.random() - 0.5) * 0.4;
                const angle = baseAngle + (i - (count - 1) / 2) * (spread / Math.max(1, count - 1)) + angleOffset;

                const speed = 350 + Math.random() * 300;
                // v0.00.72: Pass the found nearest target
                window.game.projectiles.push(new Projectile(centerX, centerY, nearest, 'missile', {
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
        this.lightningEffect.chains.forEach(c => {
            SkillRenderer.drawLightning(ctx, c.x1, c.y1, c.x2, c.y2, 1);
            if (window.game && Math.random() < 0.3) {
                window.game.addSpark(c.x2, c.y2);
            }
        });
    }

    // v0.29.23: Player.js와 동일한 고품질 쉴드 렌더링
    drawShield(ctx, centerX, centerY) {
        SkillRenderer.drawShield(ctx, centerX, centerY);
    }

    // v0.29.23: Player.js와 동일한 고품질 마법진 렌더링
    drawMagicCircle(ctx, sx, sy) {
        SkillRenderer.drawMagicCircle(ctx, sx, sy);
    }
}
