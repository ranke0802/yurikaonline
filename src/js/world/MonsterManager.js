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
        this.spawnInterval = 3000; // v1.97: Balanced (3s)
        this.maxMonsters = 15;     // v1.97: Balanced (15)
        this.totalLevelSum = 1;

        // Bandwidth Optimization (v0.20.0)
        this.syncTimer = 0;
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

        // v0.00.24: Increased for smoother sync
        this.viewMargin = 500;
    }

    /**
     * v0.00.22: Check if entity is on-screen
     */
    isOnScreen(entity) {
        if (!entity || !this.game.camera) return true;
        const cam = this.game.camera;
        const canvas = this.game.canvas;
        const vw = (canvas.width / this.game.dpr) / this.game.zoom;
        const vh = (canvas.height / this.game.dpr) / this.game.zoom;
        const margin = this.viewMargin;

        const ex = entity.x + (entity.width || 0) / 2;
        const ey = entity.y + (entity.height || 0) / 2;

        return ex >= cam.x - margin && ex <= cam.x + vw + margin &&
            ey >= cam.y - margin && ey <= cam.y + vh + margin;
    }

    update(dt) {
        const localPlayer = this.game.localPlayer;
        const remotePlayers = this.game.remotePlayers;

        // v1.99: Calculate total level for all clients (for UI/Dev Mode)
        let currentTotalLevel = localPlayer?.level || 1;
        if (remotePlayers) {
            remotePlayers.forEach(rp => currentTotalLevel += (rp.level || 1));
        }
        this.totalLevelSum = currentTotalLevel;

        this.syncTimer += dt;

        if (this.net.isHost) {
            this._updateHostLogic(dt, localPlayer, remotePlayers);
        }

        // Update local monster instances (v0.00.22: Off-screen culling)
        this.monsters.forEach(m => {
            if (this.isOnScreen(m)) {
                m.update(dt); // Full update for on-screen
            }
            // Off-screen: Skip update (minimap will still show position)
        });

        // v0.00.23: Full Monster Sync - Optimized (on-screen: 2s, off-screen: 5s)
        this.fullSyncTimer = (this.fullSyncTimer || 0) + dt;
        this.offscreenSyncTimer = (this.offscreenSyncTimer || 0) + dt;

        if (this.net.isHost) {
            this.monsters.forEach((m, id) => {
                const onScreen = this.isOnScreen(m);
                const syncInterval = onScreen ? 2.0 : 5.0;
                const timer = onScreen ? this.fullSyncTimer : this.offscreenSyncTimer;

                if (timer >= syncInterval) {
                    this.net.sendMonsterUpdate(id, {
                        x: Math.round(m.x),
                        y: Math.round(m.y),
                        hp: m.hp,
                        maxHp: m.maxHp,
                        type: m.typeId || m.name,
                        fullSync: true
                    });
                }
            });

            if (this.fullSyncTimer >= 2.0) this.fullSyncTimer = 0;
            if (this.offscreenSyncTimer >= 5.0) this.offscreenSyncTimer = 0;
        }

        // Update drops (Magnet logic)
        this.drops.forEach((d, id) => {
            if (d.update(dt, localPlayer)) {
                this.net.collectDrop(id);
            }
        });
    }

    render(ctx, camera) {
        // 1. Render Monsters (v0.00.22: Off-screen culling)
        this.monsters.forEach(m => {
            if (this.isOnScreen(m)) {
                m.render(ctx, camera);
            }
            // Off-screen: Skip rendering entirely
        });

        // 2. Render Drops
        this.drops.forEach(d => d.render(ctx, camera));
    }

    _updateHostLogic(dt, localPlayer, remotePlayers) {
        // v1.99: Level sum already calculated in update()

        // v1.97: Dynamic Spawning: 15 + 1 per 5 levels (Balanced)
        const maxMonsters = 15 + Math.floor(this.totalLevelSum / 5);

        // v1.97: Balanced Respawn: 3s base, min 0.5s
        const spawnInterval = Math.max(0.5, 3 - Math.floor(this.totalLevelSum / 5) * 0.2);

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
            // v1.88: Handle Quest Rewards & Drops IMMEDIATELY when isDead flips (Host only)
            if (m.isDead && !m._wasProcessed) {
                m._wasProcessed = true; // One-time flag

                // Spawn Drops
                const xpAmount = m.isBoss ? 500 : 25;
                const goldAmount = m.isBoss ? 5000 : 50;
                this.net.spawnDrop({ x: m.x, y: m.y, type: 'gold', amount: goldAmount });
                this.net.spawnDrop({ x: m.x + 20, y: m.y - 10, type: 'exp', amount: xpAmount });
                if (Math.random() > 0.5 || m.isBoss) {
                    this.net.spawnDrop({ x: m.x - 20, y: m.y + 10, type: 'hp', amount: 30 });
                }

                // Quest & Splitting Logic (v0.00.14)
                if (localPlayer) {
                    const attackerId = m.lastAttackerId || this.net.playerId;

                    // Identify Killer & Party
                    let killerParty = null;
                    if (attackerId === this.net.playerId) {
                        killerParty = localPlayer.party;
                    } else {
                        const rp = remotePlayers.get(attackerId);
                        if (rp) killerParty = rp.party;
                    }

                    // Calculate Rewards (Drops are separate, this is auto-grant Exp/Gold/Quest)
                    // Note: Current Drop system handles Gold/Exp items. This block handles *direct* grants or Quest triggers.
                    // Wait, the code above spawns drops. This block is for QUESTS and NOTIFICATIONS.
                    // BUT, prompt says "Experience, Gold... split 1/N".
                    // The standard game loop has Drops for Gold/Exp.
                    // If drops exist, players pick them up individually.
                    // If shared, maybe "Picking up drop" splits it?
                    // OR: Remove drops and auto-grant?
                    // The code at line 124 SPOWNS drops.
                    // Maybe leave drops as is, but if they are picked up, handle split?
                    // OR: Don't spawn drops for partykills, just grant?
                    // "Shared Experience, Gold... (1/N distribution)"
                    // If I change drop logic, I break pickup animation.
                    // BETTER: Modify `collectDrop` in NetworkManager to handle split. 
                    // BUT here, let's handle QUEST updates for party members if needed.
                    // Actually, usually quests are "Kill Count". Everyone in party witnessing kill gets +1?
                    // Prompt doesn't say "Shared Quest Progress". It says "Shared Exp, Gold".
                    // Drops give Exp/Gold. So I should modify `_onDropCollectionRequested` or `collectDrop`.

                    // However, we still need to process QUESTS for the KILLER (or Party?).
                    // Let's assume Quest completion is individual for now (or shared if specified, but prompt says Exp/Gold).
                    // So I will leave Quest Logic mostly as is, but handle `isMyKill` check.

                    // wait, lines 135-170 handle LOCAL QUEST updates.
                    // If I am in party, should my kill count for others? "Shared Experience" usually implies shared kills too?
                    // Let's stick to explicit prompt: "Shared Exp, Gold".
                    // So Quest is personal.

                    // But wait, the reward notification at line 172 sends `questKill`.
                    // I will keep this block for Quest Updates.

                    if (attackerId === this.net.playerId) {
                        // My Kill -> My Quest Logic
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

                        if (m.typeId === 'king_slime') {
                            localPlayer.questData.bossKilled = true;
                            // Spawn logic for Boss Split
                            for (let i = 0; i < 3; i++) {
                                const offX = (Math.random() - 0.5) * 100;
                                const offY = (Math.random() - 0.5) * 100;
                                this._spawnMonster(m.x + offX, m.y + offY, 'slime_split');
                            }
                        }

                        if (m.typeId === 'slime_split') {
                            for (let i = 0; i < 2; i++) {
                                const offX = (Math.random() - 0.5) * 60;
                                const offY = (Math.random() - 0.5) * 60;
                                this._spawnMonster(m.x + offX, m.y + offY, 'slime');
                            }
                        }

                        localPlayer.saveState();
                        if (window.game && window.game.ui) window.game.ui.updateQuestUI();
                    } else {
                        // Remote Kill -> Notify Killer for Quest Updates
                        this.net.sendReward(attackerId, {
                            questKill: m.typeId,
                            monsterName: m.name,
                            ts: Date.now()
                        });
                    }
                }
            }

            if (m.isDead && m.deathTimer >= m.deathDuration) {
                // v1.86: Only remove after fade duration
                Logger.info(`[HOST] REMOVING Monster after death fade: ${id} (${m.name})`);
                this.net.removeMonster(id);
                this.monsters.delete(id);
                this.lastSyncState.delete(id);
                return;
            }

            // AI and Movement are now handled inside Monster.js update()
            // to avoid double-update conflicts on the Host.
            // We just fall through to the Sync part below.

            // --- Bandwidth Throttling (v0.20.0) ---
            if (this.syncTimer >= this.syncInterval) {
                const last = this.lastSyncState.get(id);
                // Lower threshold for smoother movement
                const dist = last ? Math.sqrt((m.x - last.x) ** 2 + (m.y - last.y) ** 2) : 999;
                const hpChanged = last ? (m.hp !== last.hp) : true;

                if (dist > 1 || hpChanged) {
                    this.net.sendMonsterUpdate(id, {
                        x: Math.round(m.x),
                        y: Math.round(m.y),
                        hp: m.hp,
                        maxHp: m.maxHp,
                        type: m.typeId || m.name
                    });
                    this.lastSyncState.set(id, { x: m.x, y: m.y, hp: m.hp });
                }
            }
        });

        if (this.syncTimer >= this.syncInterval) {
            this.syncTimer = 0;
        }
    }

    forceSync(id) {
        const m = this.monsters.get(id);
        if (!m || !this.net.isHost) return;

        this.net.sendMonsterUpdate(id, {
            x: Math.round(m.x),
            y: Math.round(m.y),
            hp: m.hp,
            maxHp: m.maxHp,
            type: m.typeId || m.name
        });
        this.lastSyncState.set(id, { x: m.x, y: m.y, hp: m.hp });
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
        m.hp = data.hp;
        if (data.maxHp) m.maxHp = data.maxHp;

        // v1.99.10: If it's a fullSync, don't snap position if we're already close
        // This prevents the "flash back" effect when server sends a slow periodic update
        if (data.fullSync) {
            const dist = Math.sqrt((m.targetX - data.x) ** 2 + (m.targetY - data.y) ** 2);
            if (dist > 100) { // Only snap if desync is massive
                m.targetX = data.x;
                m.targetY = data.y;
            }
        } else {
            m.targetX = data.x;
            m.targetY = data.y;
        }

        // v1.87: Force death state on Guest if HP is 0
        if (m.hp <= 0 && !m.isDead) {
            m.isDead = true;
            m.vx = 0;
            m.vy = 0;
        }
    }

    _onRemoteMonsterRemoved(id) {
        this.monsters.delete(id);
    }

    _onMonsterDamageReceived(data) {
        // v0.00.03: Allow ALL clients to process damage events for visual feedback
        // if (!this.net.isHost) return; 
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
            else if (drop.type === 'hp') reward.hp = drop.amount; // HP usually not split? "Healing (1/N distribution)" per prompt.

            // v0.00.14: Party Splitting Logic
            let collector = null;
            if (data.collectorId === this.net.playerId) {
                collector = window.game.localPlayer;
            } else {
                collector = this.net.remotePlayers.get(data.collectorId);
            }

            const party = collector ? collector.party : null;

            if (party && party.members && party.members.length > 1) {
                // Split Logic
                const count = party.members.length;
                const splitReward = {};
                if (reward.gold) splitReward.gold = Math.floor(reward.gold / count);
                if (reward.exp) splitReward.exp = Math.floor(reward.exp / count);
                if (reward.hp) splitReward.hp = Math.floor(reward.hp / count);

                party.members.forEach(uid => {
                    this.net.sendReward(uid, splitReward);
                });

                // Remainder? Lost or given to collector? 
                // Simple 1/N floor is fine.
            } else {
                // Solo
                this.net.sendReward(data.collectorId, reward);
            }

            this.net.removeDrop(data.dropId);
            this.drops.delete(data.dropId);
        }
    }

    getStats() {
        return {
            count: this.monsters.size,
            max: 15 + Math.floor((this.totalLevelSum || 1) / 5),
            interval: Math.max(0.5, 3 - Math.floor((this.totalLevelSum || 1) / 5) * 0.2).toFixed(1),
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
