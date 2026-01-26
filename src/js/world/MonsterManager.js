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

        // Bandwidth Optimization (v0.20.0)
        this.lastSyncTime = 0;
        this.syncInterval = 0.1; // 10Hz Sync (100ms)

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
                    const attackerId = m.lastAttackerId || this.net.playerId;
                    const isMyKill = attackerId === this.net.playerId;

                    if (isMyKill) {
                        // v0.00.01: Use typeId for reliable quest tracking
                        if (m.typeId === 'slime' || m.typeId === 'slime_split') {
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

                        // BOSS SPLITTING
                        if (m.typeId === 'king_slime') {
                            localPlayer.questData.bossKilled = true;
                            for (let i = 0; i < 3; i++) {
                                const offX = (Math.random() - 0.5) * 100;
                                const offY = (Math.random() - 0.5) * 100;
                                this._spawnMonster(m.x + offX, m.y + offY, 'slime_split');
                            }
                        }

                        // SPLIT SLIME SPLITTING
                        if (m.typeId === 'slime_split') {
                            for (let i = 0; i < 2; i++) {
                                const offX = (Math.random() - 0.5) * 60;
                                const offY = (Math.random() - 0.5) * 60;
                                this._spawnMonster(m.x + offX, m.y + offY, 'slime');
                            }
                        }

                        // v0.00.01: Persist quest progress and update UI
                        localPlayer.saveState();
                        if (window.game && window.game.ui) window.game.ui.updateQuestUI();
                    } else {
                        // v0.00.01: Notify Remote Player of their kill for quest credit
                        this.net.sendReward(attackerId, {
                            questKill: m.typeId,
                            monsterName: m.name,
                            ts: Date.now()
                        });
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
                // Movement logic moved to Monster.js to avoid duplication
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
                // Wandering logic moved to Monster.js
            }

            m.x = Math.max(0, Math.min(6400, m.x + m.vx * dt));
            m.y = Math.max(0, Math.min(6400, m.y + m.vy * dt));

            // --- Bandwidth Throttling (v0.20.0) ---
            // Only sync if 100ms has passed since last global monster sync
            if (this.game.time - this.lastSyncTime >= this.syncInterval) {
                const last = this.lastSyncState.get(id);
                // Increase threshold to 8px to filter minor jitter
                const dist = last ? Math.sqrt((m.x - last.x) ** 2 + (m.y - last.y) ** 2) : 999;
                const hpChanged = last ? (m.hp !== last.hp) : true;

                if (dist > 8 || hpChanged) {
                    this.net.sendMonsterUpdate(id, {
                        x: Math.round(m.x),
                        y: Math.round(m.y),
                        hp: m.hp,
                        maxHp: m.maxHp,
                        type: m.typeId || m.name // v0.00.01: Use typeId for reliable JSON loading
                    });
                    this.lastSyncState.set(id, { x: m.x, y: m.y, hp: m.hp });
                }
            }
        });

        // Update global sync timer
        if (this.game.time - this.lastSyncTime >= this.syncInterval) {
            this.lastSyncTime = this.game.time;
        }
    }

    async _spawnMonster(fixedX = null, fixedY = null, type = 'slime') {
        const id = `mob_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const worldW = this.zone.width || 6400;
        const worldH = this.zone.height || 6400;

        let x = fixedX ?? (200 + Math.random() * (worldW - 400));
        let y = fixedY ?? (200 + Math.random() * (worldH - 400));

        // Load definition first
        const definition = await this.game.monsterData.loadDefinition(type);

        const data = {
            id: id,
            x: Math.round(x),
            y: Math.round(y),
            hp: definition.baseStats?.hp || 100,
            maxHp: definition.baseStats?.maxHp || 100,
            type: type
        };

        this.net.sendMonsterUpdate(id, data);
    }

    async _spawnBoss() {
        const id = `boss_${Date.now()}`;
        const worldW = this.zone.width || 6400;
        const worldH = this.zone.height || 6400;
        const x = worldW / 2;
        const y = worldH / 2;

        const definition = await this.game.monsterData.loadDefinition('king_slime');

        const data = {
            id: id,
            x: x,
            y: y,
            hp: definition.baseStats?.hp || 500,
            maxHp: definition.baseStats?.maxHp || 500,
            type: 'king_slime',
            isBoss: true,
            w: definition.visual?.width || 320,
            h: definition.visual?.height || 320
        };

        this.net.sendMonsterUpdate(id, data);
        if (window.game && window.game.ui) window.game.ui.logSystemMessage('거대한 대왕 슬라임이 나타났습니다!');
    }

    async _onRemoteMonsterAdded(data) {
        if (this.monsters.has(data.id)) return;

        // v0.00.01: Map legacy types or handle direct typeId
        let typeId = data.type;
        const legacyMap = {
            '슬라임': 'slime',
            '초록 슬라임': 'slime',
            '분열된 슬라임': 'slime_split',
            '대왕 슬라임': 'king_slime'
        };
        if (legacyMap[typeId]) typeId = legacyMap[typeId];

        try {
            const definition = await this.game.monsterData.loadDefinition(typeId);
            const m = new Monster(data.x, data.y, definition);
            m.id = data.id;
            m.hp = data.hp;
            m.maxHp = data.maxHp;

            if (data.isBoss || data.type === '대왕 슬라임') {
                m.isBoss = true;
                // Definition usually handles this, but sync data might override
                m.width = data.w || m.width;
                m.height = data.h || m.height;
            }
            this.monsters.set(data.id, m);
        } catch (e) {
            Logger.warn(`Defaulting to fallback for monster ${data.id} (${typeId})`);
            const m = new Monster(data.x, data.y);
            m.id = data.id;
            m.hp = data.hp;
            m.maxHp = data.maxHp;
            this.monsters.set(data.id, m);
        }
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
        // v0.29.18: 호스트 자신이 보낸 데미지는 이미 로컬에서 처리했으므로 무시
        if (data.aid === this.net.playerId) return;
        const m = this.monsters.get(data.mid);
        if (m && !m.isDead) {
            m.lastAttackerId = data.aid;
            m.takeDamage(data.dmg, true);
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

    clearAll() {
        this.monsters.clear();
        this.drops.clear();
        this.lastSyncState.clear();
        Logger.info("[MonsterManager] Local world state cleared.");
    }
}
