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

    update(dt, localPlayer, remotePlayers) {
        if (!localPlayer) return;

        // 1. Host Logic: Spawn & AI
        if (this.net.isHost) {
            this._updateHostLogic(dt, localPlayer, remotePlayers);
        }

        // 2. Client Updating (Visuals & Prediction)
        this.monsters.forEach(m => m.update(dt));
        this.drops.forEach((d, id) => {
            const captured = d.update(dt, localPlayer);
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

    _updateHostLogic(dt, localPlayer, remotePlayers) {
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

        // Build Candidate List for AI Targeting
        const candidates = [];
        if (localPlayer && !localPlayer.isDead) candidates.push(localPlayer);
        if (remotePlayers) {
            remotePlayers.forEach(rp => {
                // Assuming RemotePlayer has isDead property or similar check?
                // RemotePlayer usually renders state.
                candidates.push(rp);
            });
        }

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
                // Credit the killer? For now, if Host kills, credit Host.
                // If Guest kills -> we need Damage Source ID passed in 'monsterDamage'
                // Ideally, track 'lastAttackerId' on Monster and credit THAT player.
                // Here we credit the Host if lastAttacker matched?
                // Or simply: If lastAttackerId matches localPlayer ID.

                // For simplicity in v0.08:
                // Only credit Host if Host is the logic runner?
                // No, we should update Quest for WHOEVER killed it.
                // But we can only update Local Player's Quest Data directly.
                // Guest Quest Data is on their client.
                // So: We send a 'QuestProgress' packet? Or Guest detects death?
                // Guest detects death via 'monsterRemoved' or 'monsterUpdate(hp=0)'?
                // Currently Guest relies on 'monsterRemoved'.

                // Let's keep it simple: Everyone gets quest credit for now (Co-op style)?
                // Or just Local Player (Host) gets it here.
                if (localPlayer && localPlayer.questData) {
                    const isMyKill = m.lastAttackerId === this.net.playerId || !m.lastAttackerId;
                    Logger.log(`[HOST] Monster ${id} death check. LastAttacker: ${m.lastAttackerId}, IsMyKill: ${isMyKill}`);

                    if (isMyKill) {
                        if (m.name.includes('슬라임') && !m.isBoss) {
                            localPlayer.questData.slimeKills++;
                            if (localPlayer.questData.slimeKills >= 10 && !this.bossSpawned) {
                                this.shouldSpawnBoss = true;
                            }
                        }
                        if (m.isBoss) {
                            localPlayer.questData.bossKilled = true;
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

            // Logic matching Monster.js client prediction
            if (target && minDist < 400 && minDist > 50) {
                const angle = Math.atan2(target.y - m.y, target.x - m.x);
                let speed = 100;
                // Note: statusEffects like slow are on 'm' instance
                if (m.electrocutedTimer > 0) speed *= (1 - m.slowRatio);

                m.vx = Math.cos(angle) * speed;
                m.vy = Math.sin(angle) * speed;
            } else if (target && minDist <= 60) {
                m.vx = 0;
                m.vy = 0;
                if (!m.attackCooldown) m.attackCooldown = 0;
                m.attackCooldown -= dt; // dt is in seconds? usually passed as 0.016
                // Actually attackCooldown is decremented in outer loop usually.
                // Let's do it here.
                if (m.attackCooldown <= 0) {
                    // Attack!
                    // Server-side damage application?
                    // Host applies damage to Player? No, Players are authoritative over their HP usually?
                    // Or Host sends 'PlayerDamage' packet?
                    // Currently Player.js handles 'takeDamage'.
                    // Host sends 'playerDamage' event?
                    this.net.sendPlayerDamage(target.id, 5 + Math.random() * 5);
                    m.attackCooldown = 1.5;
                }
            } else {
                // Wandering...
                m.moveTimer -= dt;
                if (m.moveTimer <= 0) {
                    const shouldMove = Math.random() < 0.7;
                    if (shouldMove) {
                        const angle = Math.random() * Math.PI * 2;
                        let speed = 30 + Math.random() * 40;
                        m.vx = Math.cos(angle) * speed;
                        m.vy = Math.sin(angle) * speed;
                    } else {
                        m.vx = 0;
                        m.vy = 0;
                    }
                    m.moveTimer = 1 + Math.random() * 3;
                }
            }

            // Apply Physics
            const nextX = m.x + m.vx * dt;
            const nextY = m.y + m.vy * dt;

            // Constrain
            m.x = Math.max(0, Math.min(6400, nextX));
            m.y = Math.max(0, Math.min(6400, nextY));

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
        const worldW = this.zone.width || 6400;
        const worldH = this.zone.height || 6400;
        const x = 200 + Math.random() * (worldW - 400);
        const y = 200 + Math.random() * (worldH - 400);

        const data = {
            x: Math.round(x),
            y: Math.round(y),
            hp: 50,
            maxHp: 50,
            type: '슬라임'

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
        const m = new Monster(data.x, data.y, data.type);
        m.id = data.id;
        m.hp = data.hp;
        m.maxHp = data.maxHp;
        if (data.isBoss) {
            m.isBoss = true;
            m.width = 160;
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
            Logger.log(`[MonsterManager] Host received damage for ${data.monsterId}: ${data.damage}`);
            m.lastAttackerId = data.attackerId;
            m.takeDamage(data.damage, true);
        } else {
            Logger.warn(`[MonsterManager] Received damage for unknown or dead monster: ${data.monsterId}`);
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
            const reward = {};
            if (drop.type === 'gold') reward.gold = drop.amount;
            else if (drop.type === 'exp') reward.exp = drop.amount;
            else if (drop.type === 'hp') reward.hp = drop.amount;

            this.net.sendReward(data.collectorId, reward);
            this.net.removeDrop(data.dropId);
            this.drops.delete(data.dropId);
        }
    }
}
