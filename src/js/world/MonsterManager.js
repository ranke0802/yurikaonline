import Monster from '../entities/Monster.js';
import Logger from '../utils/Logger.js';

export default class MonsterManager {
    constructor(game) {
        this.game = game;
        this.net = game.net;
        this.zone = game.zone;
        this.monsters = new Map();
        this.drops = new Map();

        this.spawnTimer = 0;
        this.spawnInterval = 5000;
        this.maxMonsters = 10;
        this.totalLevelSum = 1;

        this.bossSpawned = false;
        this.shouldSpawnBoss = false;

        this.lastSyncState = new Map();

        // Register Network Handlers
        this.net.onRemoteMonsterAdded(this._onRemoteMonsterAdded.bind(this));
        this.net.onRemoteMonsterUpdated(this._onRemoteMonsterUpdated.bind(this));
        this.net.onRemoteMonsterRemoved(this._onRemoteMonsterRemoved.bind(this));
        this.net.onMonsterDamageReceived(this._onMonsterDamageReceived.bind(this));
        this.net.onDropAdded(this._onDropAdded.bind(this));
        this.net.onDropRemoved(this._onDropRemoved.bind(this));
        this.net.onDropCollectionRequested(this._onDropCollectionRequested.bind(this));
    }

    update(dt) {
        const localPlayer = this.game.localPlayer;
        const remotePlayers = this.game.remotePlayers;

        if (this.net.isHost) {
            this._updateHostLogic(dt, localPlayer, remotePlayers);
        }

        // Update local monster instances
        this.monsters.forEach(m => m.update(dt));

        // Update drops (Magnet logic)
        this.drops.forEach((d, id) => {
            if (d.update(dt, localPlayer)) {
                this.net.collectDrop(id);
            }
        });
    }

    render(ctx, camera) {
        // 1. Render Monsters
        this.monsters.forEach(m => m.render(ctx, camera));

        // 2. Render Drops
        this.drops.forEach(d => d.render(ctx, camera));
    }

    _updateHostLogic(dt, localPlayer, remotePlayers) {
        // Calculate Total Level Sum
        let currentTotalLevel = localPlayer?.level || 1;
        if (remotePlayers) {
            remotePlayers.forEach(rp => currentTotalLevel += (rp.level || 1));
        }
        this.totalLevelSum = currentTotalLevel;

        // Dynamic Spawning: 10 + 1 per 5 levels
        const maxMonsters = 10 + Math.floor(this.totalLevelSum / 5);

        // Faster Respawn: 5s base, reduce by 0.2s per 5 levels, min 0.5s
        const spawnInterval = Math.max(0.5, 5 - Math.floor(this.totalLevelSum / 5) * 0.2);

        this.spawnTimer += dt;
        if (this.spawnTimer >= spawnInterval) {
            this.spawnTimer = 0;
            if (this.monsters.size < maxMonsters) {
                this._spawnMonster();
            }
        }


        // Boss Spawning
        if (this.shouldSpawnBoss) {
            this._spawnBoss();
            this.shouldSpawnBoss = false;
            this.bossSpawned = true;
        }

        // --- Host Authority: Monster AI & Sync ---
        const candidates = [localPlayer, ...Array.from(remotePlayers.values())].filter(p => !p.isDead);

        this.monsters.forEach((m, id) => {
            if (m.isDead) {
                // Spawn Drops
                const xpAmount = m.isBoss ? 500 : 25;
                const goldAmount = m.isBoss ? 5000 : 50;

                this.net.spawnDrop({ x: m.x, y: m.y, type: 'gold', amount: goldAmount });
                this.net.spawnDrop({ x: m.x + 20, y: m.y - 10, type: 'exp', amount: xpAmount });
                if (Math.random() > 0.5 || m.isBoss) {
                    this.net.spawnDrop({ x: m.x - 20, y: m.y + 10, type: 'hp', amount: 30 });
                }

                // Quest & Splitting Logic
                if (localPlayer && localPlayer.questData) {
                    const isMyKill = m.lastAttackerId === this.net.playerId || !m.lastAttackerId;

                    if (isMyKill) {
                        if (m.name.includes('슬라임') && !m.isBoss && m.name !== '분열된 슬라임') {
                            localPlayer.questData.slimeKills++;
                            if (!this.bossSpawned) {
                                if (localPlayer.questData.slimeKills >= 10 && Math.random() < 0.1) {
                                    this.shouldSpawnBoss = true;
                                }
                            } else {
                                if (Math.random() < 0.02) {
                                    this.shouldSpawnBoss = true;
                                    if (window.game && window.game.ui) window.game.ui.logSystemMessage('⚠️ 강력한 기운이 느껴집니다! 대왕 슬라임이 필드에 다시 나타났습니다!');
                                }
                            }
                        }

                        // BOSS SPLITTING (Stage 1): King Slime -> 20 Split Slimes
                        if (m.isBoss || m.name === '대왕 슬라임') {
                            localPlayer.questData.bossKilled = true;
                            for (let i = 0; i < 20; i++) {
                                const offX = (Math.random() - 0.5) * 300;
                                const offY = (Math.random() - 0.5) * 300;
                                this._spawnMonster(m.x + offX, m.y + offY, '분열된 슬라임');
                            }
                        }

                        // SPLIT SLIME SPLITTING (Stage 2): Split Slime -> 3 Normal Slimes
                        if (m.name === '분열된 슬라임') {
                            for (let i = 0; i < 3; i++) {
                                const offX = (Math.random() - 0.5) * 60;
                                const offY = (Math.random() - 0.5) * 60;
                                this._spawnMonster(m.x + offX, m.y + offY, '슬라임');
                            }
                        }
                        if (window.game && window.game.ui) window.game.ui.updateQuestUI();
                    }
                }

                Logger.info(`[HOST] REMOVING Monster: ${id} (${m.name})`);
                this.net.removeMonster(id);
                this.monsters.delete(id);
                this.lastSyncState.delete(id);
                return;
            }

            // --- AI Targeting (Closest Player) ---
            let target = null;
            let minDist = 9999;
            candidates.forEach(p => {
                const d = Math.sqrt((p.x - m.x) ** 2 + (p.y - m.y) ** 2);
                if (d < minDist) {
                    minDist = d;
                    target = p;
                }
            });

            if (target && minDist < 400 && minDist > 50) {
                const angle = Math.atan2(target.y - m.y, target.x - m.x);
                let speed = 120; // Reduced from 180 (v0.18.9 Nerf)
                if (m.electrocutedTimer > 0) speed *= (1 - (m.slowRatio || 0.8));
                m.vx = Math.cos(angle) * speed;
                m.vy = Math.sin(angle) * speed;
            } else if (target && minDist <= 60) {
                m.vx = 0;
                m.vy = 0;
                if (!m.attackCooldown) m.attackCooldown = 0;
                m.attackCooldown -= dt;
                if (m.attackCooldown <= 0) {
                    this.net.sendPlayerDamage(target.id, 5 + Math.random() * 5);
                    m.attackCooldown = 1.5;
                }
            } else {
                // Wandering
                m.moveTimer -= dt;
                if (m.moveTimer <= 0) {
                    const shouldMove = Math.random() < 0.7;
                    if (shouldMove) {
                        const angle = Math.random() * Math.PI * 2;
                        let speed = 60 + Math.random() * 40; // 60-100 (v0.18.9 Nerf)
                        m.vx = Math.cos(angle) * speed;
                        m.vy = Math.sin(angle) * speed;
                    } else {
                        m.vx = 0; m.vy = 0;
                    }
                    m.moveTimer = 1 + Math.random() * 3;
                }
            }

            m.x = Math.max(0, Math.min(6400, m.x + m.vx * dt));
            m.y = Math.max(0, Math.min(6400, m.y + m.vy * dt));

            const last = this.lastSyncState.get(id);
            const dist = last ? Math.sqrt((m.x - last.x) ** 2 + (m.y - last.y) ** 2) : 999;
            const hpChanged = last ? (m.hp !== last.hp) : true;

            if (dist > 2 || hpChanged) {
                this.net.sendMonsterUpdate(id, {
                    x: Math.round(m.x),
                    y: Math.round(m.y),
                    hp: m.hp,
                    maxHp: m.maxHp,
                    type: m.name
                });
                this.lastSyncState.set(id, { x: m.x, y: m.y, hp: m.hp });
            }
        });
    }

    _spawnMonster(fixedX = null, fixedY = null, type = '슬라임') {
        const id = `mob_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const worldW = this.zone.width || 6400;
        const worldH = this.zone.height || 6400;

        let x = fixedX ?? (200 + Math.random() * (worldW - 400));
        let y = fixedY ?? (200 + Math.random() * (worldH - 400));

        const data = {
            id: id,
            x: Math.round(x),
            y: Math.round(y),
            hp: type === '분열된 슬라임' ? 50 : 100,
            maxHp: type === '분열된 슬라임' ? 50 : 100,
            type: type
        };

        this.net.sendMonsterUpdate(id, data);
    }

    _spawnBoss() {
        const id = `boss_${Date.now()}`;
        const worldW = this.zone.width || 6400;
        const worldH = this.zone.height || 6400;
        const x = worldW / 2;
        const y = worldH / 2;

        const data = {
            id: id,
            x: x,
            y: y,
            hp: 500,
            maxHp: 500,
            type: '대왕 슬라임',
            isBoss: true,
            w: 320,
            h: 320
        };

        this.net.sendMonsterUpdate(id, data);
        if (window.game && window.game.ui) window.game.ui.logSystemMessage('거대한 대왕 슬라임이 나타났습니다!');
    }

    _onRemoteMonsterAdded(data) {
        if (this.monsters.has(data.id)) return;
        const m = new Monster(data.x, data.y, data.type);
        m.id = data.id;
        m.hp = data.hp;
        m.maxHp = data.maxHp;
        if (data.isBoss || data.type === '대왕 슬라임') {
            m.isBoss = true;
            m.width = data.w || 320;
            m.height = data.h || 320;
        }
        this.monsters.set(data.id, m);
    }

    _onRemoteMonsterUpdated(data) {
        const m = this.monsters.get(data.id);
        if (!m) {
            this._onRemoteMonsterAdded(data);
            return;
        }
        if (this.net.isHost) return;
        m.targetX = data.x;
        m.targetY = data.y;
        m.hp = data.hp;
    }

    _onRemoteMonsterRemoved(id) {
        this.monsters.delete(id);
    }

    _onMonsterDamageReceived(data) {
        if (!this.net.isHost) return;
        const m = this.monsters.get(data.monsterId);
        if (m && !m.isDead) {
            m.lastAttackerId = data.attackerId;
            m.takeDamage(data.damage, true);
        }
    }

    async _onDropAdded(data) {
        if (this.drops.has(data.id)) return;
        const { default: Drop } = await import('../entities/Drop.js');
        const d = new Drop(data.id, data.x, data.y, data.type, data.amount);
        this.drops.set(data.id, d);
    }

    _onDropRemoved(id) {
        this.drops.delete(id);
    }

    _onDropCollectionRequested(data) {
        if (!this.net.isHost) return;
        const drop = this.drops.get(data.dropId);
        if (drop) {
            const reward = {};
            if (drop.type === 'gold') reward.gold = drop.amount;
            else if (drop.type === 'exp') reward.exp = drop.amount;
            else if (drop.type === 'hp') reward.hp = drop.amount;
            this.net.sendReward(data.collectorId, reward);
            this.net.removeDrop(data.dropId);
            this.drops.delete(data.dropId);
        }
    }

    getStats() {
        return {
            count: this.monsters.size,
            max: 10 + Math.floor((this.totalLevelSum || 1) / 5),
            interval: Math.max(0.5, 5 - Math.floor((this.totalLevelSum || 1) / 5) * 0.2).toFixed(1),
            totalLevel: this.totalLevelSum || 1
        };
    }
}
