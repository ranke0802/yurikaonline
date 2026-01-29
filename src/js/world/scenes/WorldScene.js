import Scene from '../../core/Scene.js';
import Logger from '../../utils/Logger.js';
import Player from '../../entities/Player.js';
import RemotePlayer from '../../entities/RemotePlayer.js';
import SkillRenderer from '../../skills/renderers/SkillRenderer.js';

export default class WorldScene extends Scene {
    constructor(game) {
        super(game);
        this.camera = game.camera;
        this.monsterManager = game.monsterManager;
        this.ui = game.ui;
        this.net = game.net;
        this.resources = game.resources;
        this.input = game.input;

        this.player = null;
        this.remotePlayers = new Map();
        this.floatingTexts = [];
        this.sparks = [];
        this.projectiles = [];
        this.explosions = []; // v1.99.15: Visual-only explosions
        this.time = 0;

        // v0.00.22: Off-screen entity culling
        this.minimapUpdateTimer = 0;
        this.minimapUpdateInterval = 3; // seconds
        this.viewMargin = 500; // v0.00.24: Increased for smoother player sync
    }

    /**
     * v0.00.22: Check if entity is within camera viewport + margin
     */
    isOnScreen(entity) {
        if (!entity || !this.camera) return true; // Default to on-screen if no camera
        const cam = this.camera;
        const vw = (this.game.canvas.width / this.game.dpr) / this.game.zoom;
        const vh = (this.game.canvas.height / this.game.dpr) / this.game.zoom;
        const margin = this.viewMargin;

        const ex = entity.x + (entity.width || 0) / 2;
        const ey = entity.y + (entity.height || 0) / 2;

        return ex >= cam.x - margin && ex <= cam.x + vw + margin &&
            ey >= cam.y - margin && ey <= cam.y + vh + margin;
    }

    async enter(params) {
        Logger.info("[WorldScene] Entering game world...");

        // v0.00.02: Restore asset loading which was cut from main.js
        if (this.game.updateLoading) this.game.updateLoading('월드 데이터 다운로드 중...', 40);
        await this.game.zone.loadZone('zone_1');

        try {
            await this.resources.loadImage('/src/assets/character.webp');
        } catch (e) {
            Logger.error('Failed to load character sprite', e);
        }

        const user = params.user;
        const startX = params.startX;
        const startY = params.startY;
        const profile = params.profile;
        const localName = params.localName;

        // v1.99.12: Load FULL sprite sheet (preview loaded only partial)
        await this.resources.loadCharacterSpriteSheet();

        // Spawn Player
        this.player = new Player(startX, startY, localName);
        this.player.id = user.uid;
        this.game.localPlayer = this.player; // Global reference for UIManager / MonsterAI

        if (profile) {
            console.log(`[WorldScene] Loading Player Profile:`, profile);
            this.player.level = profile.level || 1;
            this.player.exp = profile.exp || 0;
            this.player.maxExp = profile.maxExp || Math.floor(100 * Math.pow(1.5, this.player.level - 1)); // v0.00.03: Restore maxExp or recalculate
            this.player.gold = profile.gold || 0;
            this.player.vitality = profile.vitality || 1;
            this.player.intelligence = profile.intelligence || 3;
            this.player.wisdom = profile.wisdom || 2;
            this.player.agility = profile.agility || 1;
            this.player.statPoints = profile.statPoints || 0;
            this.player.skillLevels = profile.skillLevels || { laser: 1, missile: 1, fireball: 1, shield: 1 };
            this.player.name = profile.name || localName || user.displayName || "유리카";

            // v0.00.15: Restore Hostility
            // Support both Object (new) and Array (old/broken) formats specifically for robustness
            if (profile.hostility) {
                if (Array.isArray(profile.hostility)) {
                    // Try to recover if it really is an array (legacy)
                    try { this.player.hostileTargets = new Map(profile.hostility); } catch (e) { }
                } else if (typeof profile.hostility === 'object') {
                    // Standard Object format
                    console.log('[WorldScene] Restoring Hostility from Object:', profile.hostility);
                    this.player.hostileTargets = new Map(Object.entries(profile.hostility));
                }
                // v0.00.15: Force UI update
                if (this.ui) this.ui.updateHostilityUI();
            } else {
                console.log('[WorldScene] No Hostility Data found in profile');
            }

            if (profile.questData) {
                console.log('[WorldScene] Restoring Quest Data:', profile.questData);
                this.player.questData = { ...this.player.questData, ...profile.questData };
            } else {
                console.warn('[WorldScene] No Quest Data found in profile.');
            }

            this.player.refreshStats();
            if (typeof profile.hp === 'number') this.player.hp = profile.hp;
            if (typeof profile.mp === 'number') this.player.mp = profile.mp;

            // v0.00.29: Restore saved position
            if (typeof profile.x === 'number' && typeof profile.y === 'number') {
                this.player.x = profile.x;
                this.player.y = profile.y;
                console.log(`[WorldScene] Restored position: (${profile.x}, ${profile.y})`);
            }

            // v1.99.12: Force UI Update after profile restoration
            if (this.ui) {
                this.ui.updateQuestUI();
                this.ui.updateStatusPopup();
                this.ui.updateSkillPopup();
            }
        }

        this.player.init(this.input, this.resources, this.net);

        // v0.00.03: Spawn players already in the buffer (Multiplayer Fix)
        if (this.net.remotePlayers) {
            this.net.remotePlayers.forEach(data => {
                if (data.id === this.player.id) return;
                const rp = new RemotePlayer(data.id, data.x, data.y, this.resources);
                rp.name = data.name || "Unknown";

                // Sync Initial Stats if available in buffer
                if (data.h) {
                    rp.hp = data.h[0];
                    rp.maxHp = data.h[1];
                }

                this.remotePlayers.set(data.id, rp);
                Logger.log(`[WorldScene] Spawned buffered player: ${rp.name}`);
            });
        }

        // Setup Network Handlers
        this._setupNetworkHandlers();

        // Initial UI Sync
        if (this.ui) {
            this.ui.updateQuestUI();
            this.ui.updateStatusPopup();
        }

        // v0.00.03: Ensure data is synchronized to the zone database on entry
        if (this.player) {
            this.player.saveState();

            // v0.00.15: Self-heal Name Mapping (Force update name->uid)
            // This fixes the issue where an old UID is linked to the name
            if (this.player.name) {
                this.net.claimName(this.player.id, this.player.name);
                console.log(`[WorldScene] Claimed name mapping: ${this.player.name} -> ${this.player.id}`);
            }
        }
        // v0.00.15: Start Hostility Listeners now that player is ready
        this.net.startHostilityListeners();
    }

    _setupNetworkHandlers() {
        this.net.on('rewardReceived', (data) => {
            if (this.player) this.player.receiveReward(data);
        });

        this.net.on('monsterDamageReceived', (data) => {
            const m = this.monsterManager?.monsters.get(data.mid);
            if (m) this.addSpark(m.x, m.y);
        });

        this.net.on('playerDamageReceived', (data) => {
            let target = (this.player && this.player.id === data.tid) ? this.player : this.remotePlayers.get(data.tid);
            if (target) {
                this.addSpark(target.x + target.width / 2, target.y + target.height / 2);
                if (target === this.player) this.player.takeDamage(data.dmg);
                else target.hp = Math.max(0, (target.hp || 100) - data.dmg);
            }
        });

        this.net.on('playerJoined', (data) => {
            if (this.remotePlayers.has(data.id)) return;
            const rp = new RemotePlayer(data.id, data.x, data.y, this.resources);
            rp.name = data.name || "Unknown";
            // v0.00.20: Sync initial hostility
            if (data.hostility) rp.hostility = data.hostility;
            this.remotePlayers.set(data.id, rp);
        });

        this.net.on('playerUpdate', (data) => {
            const rp = this.remotePlayers.get(data.id);
            if (rp) rp.onServerUpdate(data);
        });

        this.net.on('playerLeft', (id) => {
            this.remotePlayers.delete(id);
        });

        this.net.on('playerAttack', (data) => {
            const rp = this.remotePlayers.get(data.id);
            if (rp) rp.triggerAttack(data);
        });

        // v0.00.37: Channeling sync for casting effects (spark, magic circle, attack motion)
        this.net.on('playerChanneling', (data) => {
            const rp = this.remotePlayers.get(data.id);
            if (rp) rp.triggerChanneling(data);
        });

        // v0.00.03: Sync Detailed HP & Death Status for Remote Players
        this.net.on('playerHpUpdate', (data) => {
            const rp = this.remotePlayers.get(data.id);
            if (rp) rp.onHpUpdate(data);
        });
    }

    async exit() {
        // ... any other cleanup
    }

    update(dt) {
        this.time += dt;

        if (this.player) {
            if (this.input.isPressed('SKILL_1')) this.player.useSkill(1);
            if (this.input.isPressed('SKILL_2')) this.player.useSkill(2);
            if (this.input.isPressed('SKILL_3')) this.player.useSkill(3);
            this.player.update(dt);

            // Sync Position
            this.net.sendMovePacket(
                this.player.x,
                this.player.y,
                this.player.vx,
                this.player.vy,
                this.player.name
            );

            this.camera.follow(this.player, this.game.zone.width, this.game.zone.height);

            if (this.ui) {
                this.ui.updateStats(
                    (this.player.hp / this.player.maxHp) * 100,
                    (this.player.mp / this.player.maxMp) * 100,
                    this.player.level,
                    (this.player.exp / this.player.maxExp) * 100
                );

                const hpMax = document.getElementById('ui-hp-max');
                const mpMax = document.getElementById('ui-mp-max');
                if (hpMax) hpMax.textContent = Math.floor(this.player.maxHp);
                if (mpMax) mpMax.textContent = Math.floor(this.player.maxMp);
            }
        }

        // v0.00.22: Minimap-only update timer
        this.minimapUpdateTimer += dt;

        // v0.00.39: Always update all remote players for proper sync
        // Position updates must run regardless of screen visibility
        this.remotePlayers.forEach(rp => {
            rp.update(dt);
        });

        if (this.monsterManager && this.player) {
            this.monsterManager.update(dt, this.player, this.remotePlayers);
        }

        // Update Sparks
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.life -= dt;
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            if (s.life <= 0) {
                this.game.sparkPool.release(s);
                this.sparks.splice(i, 1);
            }
        }

        // Update Floating Texts
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.timer -= dt;
            ft.currentY -= 40 * dt;
            if (ft.timer <= 0) {
                this.game.textPool.release(ft);
                this.floatingTexts.splice(i, 1);
            }
        }

        // v1.99.15: Update Explosions
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            this.explosions[i].life -= dt;
            if (this.explosions[i].life <= 0) {
                this.explosions.splice(i, 1);
            }
        }

        // Update Projectiles (v0.29.23: Fixed removal logic)
        this.projectiles = this.projectiles.filter(p => {
            const monsters = this.monsterManager ? Array.from(this.monsterManager.monsters.values()) : [];
            p.update(dt, monsters);
            return !p.isDead;
        });
    }

    render(ctx) {
        if (!this.game.zone.currentZone) return;

        ctx.save();
        const scale = this.game.zoom * this.game.dpr;
        ctx.scale(scale, scale);
        ctx.translate(-this.camera.x, -this.camera.y);

        // 1. World & Entities
        this.game.zone.render(ctx, this.camera);

        // v0.00.21: Target Lock-on Marker (Draw under entities)
        if (this.player && this.player.currentTarget) {
            const t = this.player.currentTarget;
            if (!t.isDead) {
                const tx = t.x + t.width / 2;
                const ty = t.y + t.height; // Bottom of target
                import('../../skills/renderers/SkillRenderer.js').then(m => {
                    m.default.drawTargetMarker(ctx, tx, ty, t.width || 48, t.height || 48);
                });
            }
        }

        // v0.00.22: Off-screen culling for RemotePlayers render
        this.remotePlayers.forEach(rp => {
            if (this.isOnScreen(rp)) {
                rp.render(ctx, this.camera);
            }
            // Off-screen: Skip rendering entirely (minimap will still see them)
        });
        this.monsterManager.render(ctx, this.camera);
        this.projectiles.forEach(p => p.render(ctx, this.camera));

        if (this.player) {
            this.player.render(ctx, this.camera);

            // 2. Minimap (UI Sync)
            if (this.ui) {
                this.ui.updateMinimap(
                    this.player,
                    this.remotePlayers,
                    this.monsterManager ? this.monsterManager.monsters : [],
                    this.game.zone.width,
                    this.game.zone.height
                );
            }
        }

        // 3. Effects (Sparks & Damage Text)
        this.sparks.forEach(s => {
            ctx.save();
            ctx.fillStyle = s.color;
            ctx.globalAlpha = s.life * 2;
            ctx.fillRect(s.x, s.y, 2, 2);
            ctx.restore();
        });

        this.floatingTexts.forEach(ft => {
            const sx = ft.x, sy = ft.currentY;
            ctx.save();
            ctx.globalAlpha = Math.min(1, ft.timer);
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;

            if (ft.label) {
                ctx.font = 'bold 18px "Outfit", sans-serif';
                ctx.strokeText(ft.label, sx, sy - 35);
                ctx.fillStyle = '#fff';
                ctx.fillText(ft.label, sx, sy - 35);
            }

            const fs = ft.isCrit ? 50 : 20;
            ctx.font = `bold ${fs}px "Outfit", sans-serif`;
            ctx.strokeText(ft.text, sx, sy);
            ctx.fillStyle = ft.color;
            ctx.fillText(ft.text, sx, sy);
            ctx.restore();
        });

        // 7. Explosions (Top Layer)
        this.explosions.forEach(exp => {
            const progress = 1 - (exp.life / exp.maxLife);
            SkillRenderer.drawExplosion(ctx, exp.x, exp.y, exp.radius, progress);
        });

        ctx.restore();
    }

    addSpark(x, y) {
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + Math.random() * 50;
            const life = 0.3 + Math.random() * 0.2;
            const s = this.game.sparkPool.acquire(x, y, angle, speed, life, '#fff');
            if (s) this.sparks.push(s);
        }
    }

    addExplosion(x, y, radius) {
        // v1.99.15: Visual-only explosion state
        this.explosions.push({
            x, y, radius,
            life: 0.6,
            maxLife: 0.6
        });
    }

    addDamageText(x, y, text, color, isCrit, type) {
        const ft = this.game.textPool.acquire(x, y, text, color, 1.5, isCrit, type);
        if (ft) {
            this.floatingTexts.push(ft);
        }
    }

    addProjectile(p) {
        this.projectiles.push(p);
    }

    onPointerDown(e) {
        if (!this.player || this.game.ui.isPaused || !this.input.enabled) return;

        const rect = this.game.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Joystick Area (Left side) Exclusion
        if (screenX < 200 && screenY > this.game.canvas.height / this.game.dpr / 2) return;

        // Action Buttons Area (Right side) Exclusion
        if (screenX > (this.game.canvas.width / this.game.dpr) - 220 && screenY > (this.game.canvas.height / this.game.dpr) - 220) return;

        // Top bar exclusion
        if (screenX < 300 && screenY < 100) return;

        // Scale and translate coordinate to world
        const worldX = (screenX / this.game.zoom) + this.camera.x;
        const worldY = (screenY / this.game.zoom) + this.camera.y;

        // v0.00.21: PC Targeting (Enhanced Entity Picking)
        let clickedEntity = null;
        let minDist = 50; // Max distance for "sticky" targeting

        // 1. Check Monsters
        for (const m of this.monsterManager.monsters.values()) {
            if (m.isDead) continue;
            const mx = m.x + (m.width / 2);
            const my = m.y + (m.height / 2);
            const dist = Math.sqrt((worldX - mx) ** 2 + (worldY - my) ** 2);

            // v0.00.21: Use minimum of (Distance or specific Hitbox)
            const inHitbox = worldX >= m.x && worldX <= m.x + m.width && worldY >= m.y && worldY <= m.y + m.height;
            if (inHitbox || dist < minDist) {
                if (dist < minDist) {
                    minDist = dist;
                    clickedEntity = m;
                }
            }
        }

        // 2. Check Remote Players (If no monster hit)
        if (!clickedEntity) {
            for (const rp of this.remotePlayers.values()) {
                if (rp.isDead) continue;
                const rpx = rp.x + (rp.width / 2);
                const rpy = rp.y + (rp.height / 2);
                const dist = Math.sqrt((worldX - rpx) ** 2 + (worldY - rpy) ** 2);

                const inHitbox = worldX >= rp.x && worldX <= rp.x + rp.width && worldY >= rp.y && worldY <= rp.y + rp.height;
                if (inHitbox || dist < minDist) {
                    if (dist < minDist) {
                        minDist = dist;
                        clickedEntity = rp;
                    }
                }
            }
        }

        if (clickedEntity) {
            this.player.currentTarget = clickedEntity;
            if (this.ui) this.ui.logSystemMessage(`🎯 ${clickedEntity.name}님을 대상으로 지정했습니다.`);
            // When targeting, don't necessarily stop movement unless you want to?
            // Usually, single click on target = target. double click/action = attack.
            // For now, let's just set the target and allow movement.
        } else {
            // Clicked on empty ground = Clear target (optional)
            // this.player.currentTarget = null;
            this.player.setMoveTarget(worldX, worldY);
        }
    }
}
