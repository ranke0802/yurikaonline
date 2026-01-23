import Logger from '../utils/Logger.js';
import Monster from '../entities/Monster.js';

export default class MonsterManager {
    constructor(zoneManager, networkManager) {
        this.zone = zoneManager;
        this.net = networkManager;
        this.monsters = new Map(); // id -> Monster
        this.drops = new Map(); // id -> Drop

        this.spawnTimer = 0;
        this.spawnInterval = 3; // Spawn every 3s (Host only)
        this.maxMonsters = 10;

        // Listen to Network Events
        this.net.on('monsterAdded', (data) => this._onRemoteMonsterAdded(data));
        this.net.on('monsterUpdated', (data) => this._onRemoteMonsterUpdated(data));
        this.net.on('monsterRemoved', (id) => this._onRemoteMonsterRemoved(id));
        this.net.on('monsterDamage', (data) => this._onMonsterDamageReceived(data));

        // Drop Events
        this.net.on('dropAdded', (data) => this._onDropAdded(data));
        this.net.on('dropRemoved', (id) => this._onDropRemoved(id));
        this.net.on('dropCollectionRequested', (data) => this._onDropCollectionRequested(data));

        Logger.info('MonsterManager initialized');
    }

    update(dt, player) {
        if (!player) return;

        // 1. Host Logic: Spawn & AI
        if (this.net.isHost) {
            this._updateHostLogic(dt, player);
        }

        // 2. Client Updating (Visuals & Prediction)
        this.monsters.forEach(m => m.update(dt));
        this.drops.forEach((d, id) => {
            const captured = d.update(dt, player);
            if (captured) {
                if (!this.net.isHost) {
                    this.net.collectDrop(id);
                } else {
                    this._onDropCollectionRequested({ dropId: id, collectorId: this.net.playerId });
                }
            }
        });
    }

    render(ctx, camera) {
        // Render Drops first (on ground)
        this.drops.forEach(d => d.draw(ctx, camera));

        // Sort for depth if needed
        this.monsters.forEach(m => {
            m.draw(ctx, camera);
        });
    }

    _updateHostLogic(dt, player) {
        // Spawning
        this.spawnTimer += dt;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0;
            if (this.monsters.size < this.maxMonsters) {
                this._spawnMonster();
            }
        }

        // Boss Spawning
        if (this.shouldSpawnBoss) {
            this._spawnBoss();
            this.shouldSpawnBoss = false;
            this.bossSpawned = true;
        }

        // AI & Sync Throttling (Save Bandwidth)
        if (!this.lastSyncTime) this.lastSyncTime = 0;
        const now = Date.now();
        if (now - this.lastSyncTime < 200) return; // 5Hz Sync
        this.lastSyncTime = now;

        if (!this.lastSyncState) this.lastSyncState = new Map();

        this.monsters.forEach((m, id) => {
            if (m.isDead) {
                // Spawn Drops instead of direct rewards
                const xpAmount = m.isBoss ? 500 : 25;
                const goldAmount = m.isBoss ? 2000 : 50;

                // Gold Drop
                this.net.spawnDrop({ x: m.x, y: m.y, type: 'gold', amount: goldAmount });
                // Exp Drop
                this.net.spawnDrop({ x: m.x + 20, y: m.y - 10, type: 'exp', amount: xpAmount });

                // Extra HP Drop?
                if (Math.random() > 0.5 || m.isBoss) {
                    this.net.spawnDrop({ x: m.x - 20, y: m.y + 10, type: 'hp', amount: 30 });
                }

                // Quest Update (Host Logic)
                // If the killer is the host player (simplification), update Quest
                if (player && player.questData) {
                    if (m.name.includes('슬라임') && !m.isBoss) {
                        player.questData.slimeKills++;

                        if (player.questData.slimeKills >= 10 && !this.bossSpawned) {
                            this.shouldSpawnBoss = true;
                        }
                    }
                    if (m.isBoss) {
                        player.questData.bossKilled = true;
                    }
                    if (window.game && window.game.ui) window.game.ui.updateQuestUI(); // Force update UI
                }

                this.net.removeMonster(id);
                this.monsters.delete(id);
                this.lastSyncState.delete(id);
                return;
            }

            const last = this.lastSyncState.get(id);
            const dist = last ? Math.sqrt((m.x - last.x) ** 2 + (m.y - last.y) ** 2) : 999;
            const hpChanged = last ? (m.hp !== last.hp) : true;

            if (dist > 2 || hpChanged) {
                // Send Update
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

    _spawnMonster() {
        const id = `mob_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        // Use zone dimensions with a safe fallback
        const worldW = this.zone.width || 6400;
        const worldH = this.zone.height || 6400;

        // Random Pos within Zone (avoiding very edges)
        const x = 200 + Math.random() * (worldW - 400);
        const y = 200 + Math.random() * (worldH - 400);

        const data = {
            x: Math.round(x),
            y: Math.round(y),
            hp: 50,
            maxHp: 50,
            type: 'slime'
        };

        this.net.sendMonsterUpdate(id, data);
    }

    _spawnBoss() {
        const id = `boss_${Date.now()}`;
        const worldW = this.zone.width || 6400;
        const worldH = this.zone.height || 6400;

        // Spawn Boss in Center or Random? Let's go near player or center.
        // Center for dramatic effect
        const x = worldW / 2;
        const y = worldH / 2;

        const data = {
            x: x,
            y: y,
            hp: 500,
            maxHp: 500,
            type: '대왕 슬라임',
            isBoss: true
        };

        this.net.sendMonsterUpdate(id, data);
        Logger.info('Boss Spawning: King Slime');
        if (window.game && window.game.ui) window.game.ui.logSystemMessage('대왕 슬라임이 나타났습니다!');
    }

    _onRemoteMonsterAdded(data) {
        if (this.monsters.has(data.id)) return;

        // Create Monster Instance
        const m = new Monster(data.x, data.y, data.type);
        m.id = data.id; // Assign net ID
        m.hp = data.hp;
        m.maxHp = data.maxHp;
        if (data.isBoss) {
            m.isBoss = true;
            m.width = 160; // Bigger Boss
            m.height = 160;
        }

        this.monsters.set(data.id, m);
    }

    _onRemoteMonsterUpdated(data) {
        const m = this.monsters.get(data.id);
        if (!m) {
            this._onRemoteMonsterAdded(data);
            return;
        }

        // If I am Host, I SENT this update, so I don't need to correct myself.
        if (this.net.isHost) return;

        // Guest: Set target for interpolation
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
            // Apply damage to host-side authoritative instance
            m.takeDamage(data.damage, true);
        }
    }

    // --- Drop Sync ---
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
            // Send reward to collector
            const reward = {};
            if (drop.type === 'gold') reward.gold = drop.amount;
            else if (drop.type === 'exp') reward.exp = drop.amount;
            else if (drop.type === 'hp') reward.hp = drop.amount;

            this.net.sendReward(data.collectorId, reward);

            // Remove drop from network
            this.net.removeDrop(data.dropId);
            this.drops.delete(data.dropId);
        }
    }
}
