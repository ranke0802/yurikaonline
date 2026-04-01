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
        this.tutorialMode = false;
        this.tutorialMonsterIds = new Set();

        // Bandwidth Optimization (v0.20.0)
        this.syncTimer = 0;
        this.syncInterval = 0.1; // Desktop baseline, adjusted dynamically per frame

        this.bossSpawned = false;
        this.shouldSpawnBoss = false;
        this.firstBossDefeated = false;
        this.slimeKillCount = 0; // v0.00.43: Track kills for boss spawn

        // v0.00.44: Persistence for Slime Kill Count
        if (this.net.dbRef) {
            // v0.00.45: Check Last Host Time for Reset
            this.net.dbRef.child('world_state/last_host_time').once('value', (snapshot) => {
                const lastTime = snapshot.val() || 0;
                const now = Date.now();
                if (now - lastTime > 60000) { // 1 min inactive
                    Logger.log('[MonsterManager] Host inactive > 1min. Resetting Kill Count.');
                    this.slimeKillCount = 0;
                    this.net.dbRef.child('world_state/slime_kill_count').set(0);
                } else {
                    // Load existing count
                    this.net.dbRef.child('world_state/slime_kill_count').once('value', (s) => {
                        const val = s.val();
                        if (val !== null) this.slimeKillCount = val;
                    });
                }
            });

            // Listen for updates (Sync between hosts or re-connections)
            this.net.dbRef.child('world_state/slime_kill_count').on('value', (snapshot) => {
                const val = snapshot.val();
                if (val !== null) {
                    // Only update if we are NOT the one writing (or to just sync state)
                    // If we are host, we are the authority, but if we just became host, we might need latest.
                    // Simple: Always accept DB value unless we just incremented it?
                    // Actually, if we are host, we increment local and write.
                    // If another host writes, we should accept? (Should be only 1 host).
                    this.slimeKillCount = val;
                }
            });
        }

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

    _normalizePartyMembers(members) {
        return Array.from(new Set((members || []).filter(Boolean)));
    }

    _getPartyMembersForPlayer(uid) {
        if (!uid) return [];
        if (uid === this.net.playerId) {
            return this._normalizePartyMembers(window.game?.localPlayer?.party?.members || [uid]);
        }

        const remote = this.net.remotePlayers.get(uid) || this.game.remotePlayers?.get(uid);
        return this._normalizePartyMembers(remote?.party?.members || [uid]);
    }

    _buildRewardItem(itemId, dropDef = {}, context = {}) {
        const itemData = this.game.itemData;
        if (itemData) {
            const minAmount = Math.max(1, dropDef.min || dropDef.quantity || 1);
            const maxAmount = Math.max(minAmount, dropDef.max || minAmount);
            const amount = Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount;
            return itemData.createRewardItem(itemId, {
                amount,
                monsterId: context.monster?.typeId || null
            });
        }

        const itemMeta = {
            slime_gel: { name: '슬라임 젤', icon: '🟢' },
            potion_hp_small: { name: '소형 HP 포션', icon: '🧪' },
            royal_jelly: { name: '로열 젤리', icon: '🍯' },
            king_crown: { name: '킹 크라운', icon: '👑' }
        };

        const fallback = itemMeta[itemId] || { name: itemId, icon: '🎁' };
        const minAmount = Math.max(1, dropDef.min || 1);
        const maxAmount = Math.max(minAmount, dropDef.max || minAmount);
        return {
            id: itemId,
            type: itemId,
            amount: Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount,
            name: fallback.name,
            icon: fallback.icon
        };
    }

    _grantMonsterItemDrops(monster, attackerId) {
        if (!attackerId || !monster) return;

        const rewardedItems = [];
        const allDrops = [
            ...(Array.isArray(monster.drops) ? monster.drops : []),
            ...(this.game.itemData?.getGlobalDrops() || []),
            ...(this.game.itemData?.getBossDrops(monster.typeId) || [])
        ];

        allDrops.forEach((dropDef) => {
            if (!dropDef?.itemId || dropDef.itemId === 'gold') return;
            if (Math.random() > (dropDef.chance ?? 1)) return;
            const reward = this._buildRewardItem(dropDef.itemId, dropDef, { monster });
            if (reward) rewardedItems.push(reward);
        });

        if (rewardedItems.length > 0) {
            const rewardPayload = {
                monsterName: monster.name,
                items: rewardedItems
            };

            // Host-local kills should not depend on the reward sync roundtrip.
            // Gold/EXP are handled by world drops, but item rewards are direct grants,
            // so deliver them immediately to avoid host-side reward validation timing issues.
            if (attackerId === this.net.playerId && window.game?.localPlayer) {
                window.game.localPlayer.receiveReward(rewardPayload);
                return rewardedItems;
            }

            this.net.sendReward(attackerId, rewardPayload);
        }

        return rewardedItems;
    }

    update(dt) {
        const localPlayer = this.game.localPlayer;
        const remotePlayers = this.game.remotePlayers;
        const mobileThermalMode = !!this.game?.isMobilePerformanceMode;
        this.syncInterval = mobileThermalMode ? 0.16 : 0.1;

        // v1.99: Calculate total level for all clients (for UI/Dev Mode)
        let currentTotalLevel = localPlayer?.level || 1;
        if (remotePlayers) {
            remotePlayers.forEach(rp => currentTotalLevel += (rp.level || 1));
        }
        this.totalLevelSum = currentTotalLevel;

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

        // Update drops (Magnet logic)
        this.drops.forEach((d, id) => {
            if (d.update(dt, localPlayer)) {
                this.net.collectDrop(id);
            }
        });
    }

    render(ctx, camera) {
        // Monsters are rendered in WorldScene's Y-sorted render list.
        // Only draw drops here to avoid double-rendering the same entities every frame.
        this.drops.forEach(d => d.render(ctx, camera));
    }

    setSpawnRules(rules) {
        this.spawnRules = rules || [];
        // Reset counters or mapping if needed
        Logger.log('[MonsterManager] Spawn rules updated:', this.spawnRules);
    }

    isSpawnSuppressed() {
        return this.tutorialMode || !!this.game.story?.isStoryActive || !!this.game.tutorial?.pendingTutorialId;
    }

    setTutorialMode(active) {
        const nextState = !!active;
        if (this.tutorialMode === nextState) return;

        this.tutorialMode = nextState;
        this.spawnTimer = nextState ? 0 : 1.0;

        if (nextState) {
            this.clearAll();
        } else {
            this.clearTutorialMonsters();
        }
    }

    clearTutorialMonsters() {
        const tutorialIds = Array.from(this.tutorialMonsterIds);
        tutorialIds.forEach((id) => {
            this._clearPlayerTargetIfMatches(id);
            if (this.net.isHost) {
                this.net.removeMonster(id);
            }
            this.monsters.delete(id);
            this.lastSyncState.delete(id);
        });
        this.tutorialMonsterIds.clear();
    }

    spawnMonster(type = 'slime', x = null, y = null, options = {}) {
        if (options.tutorialOnly) {
            return this._spawnLocalMonster(x, y, type, options);
        }
        return this._spawnMonster(x, y, type, options);
    }

    primeSpawnCycle() {
        this.spawnTimer = 1.0;
    }

    _getInterestedPlayers(localPlayer, remotePlayers, isProtectedPlayer) {
        const players = [];
        if (localPlayer && !localPlayer.isDead && !isProtectedPlayer(localPlayer)) {
            players.push(localPlayer);
        }
        if (remotePlayers) {
            remotePlayers.forEach((player) => {
                if (player && !player.isDead && !isProtectedPlayer(player)) {
                    players.push(player);
                }
            });
        }
        return players;
    }

    _isMonsterNearAnyPlayer(monster, players, radius = 1100) {
        if (!monster || !players || players.length === 0) return false;
        const radiusSq = radius * radius;
        for (const player of players) {
            const dx = monster.x - player.x;
            const dy = monster.y - player.y;
            if ((dx * dx) + (dy * dy) <= radiusSq) return true;
        }
        return false;
    }

    _getMonsterSyncProfile(monster, interestedPlayers, mobileThermalMode) {
        const now = Date.now();
        const activityWindowMs = monster.isBoss ? 6000 : 3500;
        const lastActivityTs = Math.max(monster.lastHitAt || 0, monster.lastNetworkEventAt || 0);
        const recentlyActive = lastActivityTs > 0 && (now - lastActivityTs) <= activityWindowMs;
        const engaged = monster.chargeState !== 'idle'
            || (!!monster.targetPlayer && !monster.targetPlayer.isDead)
            || !!monster.isAggro
            || !!monster.isDead;
        const nearby = this.isOnScreen(monster)
            || this._isMonsterNearAnyPlayer(monster, interestedPlayers, monster.isBoss ? 1600 : 1100);

        if (monster.isBoss || engaged || recentlyActive) {
            return {
                deltaIntervalMs: mobileThermalMode ? 120 : 90,
                positionThreshold: mobileThermalMode ? 1.75 : 1.25,
                fullSyncIntervalMs: mobileThermalMode ? 1800 : 1500
            };
        }

        if (nearby) {
            return {
                deltaIntervalMs: mobileThermalMode ? 180 : 140,
                positionThreshold: mobileThermalMode ? 2.75 : 1.75,
                fullSyncIntervalMs: mobileThermalMode ? 3200 : 2600
            };
        }

        return {
            deltaIntervalMs: mobileThermalMode ? 480 : 360,
            positionThreshold: mobileThermalMode ? 5.5 : 3.5,
            fullSyncIntervalMs: mobileThermalMode ? 8500 : 6500
        };
    }

    _buildMonsterSyncPayload(monster, { fullSync = false, immediate = false } = {}) {
        const payload = {
            x: Math.round(monster.x),
            y: Math.round(monster.y),
            hp: monster.hp,
            maxHp: monster.maxHp,
            type: monster.typeId || monster.name,
            chargeOnly: !!monster.chargeOnly
        };

        if (fullSync) {
            payload.fullSync = true;
            payload.isBoss = !!monster.isBoss;
            payload.w = monster.width;
            payload.h = monster.height;
        }
        if (immediate) {
            payload.immediate = true;
        }

        return payload;
    }

    _updateHostLogic(dt, localPlayer, remotePlayers) {
        const mobileThermalMode = !!this.game?.isMobilePerformanceMode;
        const isProtectedPlayer = (player) => {
            const currentScene = this.game.sceneManager?.currentScene;
            if (!player || typeof currentScene?.isPlayerProtected !== 'function') return false;
            return currentScene.isPlayerProtected(player);
        };

        // v1.99: Level sum already calculated in update()

        if (!this.isSpawnSuppressed() && this.spawnRules && this.spawnRules.length > 0) {
            // Zone-based Spawning Logic
            this.spawnTimer += dt;
            if (this.spawnTimer >= 1.0) { // Check every 1s
                this.spawnTimer = 0;

                this.spawnRules.forEach(rule => {
                    // Count current monsters of this type
                    // Optimization: Maintain a counter map instead of iterating specific types every time?
                    // For now, iteration is fine for < 100 monsters.
                    let currentCount = 0;
                    this.monsters.forEach(m => {
                        if (m.typeId === rule.monsterId && !m.isDead) currentCount++;
                    });

                    if (currentCount < rule.count) {
                        // Spawn needed
                        const area = rule.area;
                        const x = area.x + Math.random() * area.w;
                        const y = area.y + Math.random() * area.h;
                        this._spawnMonster(x, y, rule.monsterId);
                    }
                });
            }
        } else if (!this.isSpawnSuppressed()) {
            // Legacy Random Spawning Logic
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
        }

        // v0.00.45: Host Heartbeat (Every 5 seconds)
        this.hostHeartbeatTimer = (this.hostHeartbeatTimer || 0) + dt;
        if (this.hostHeartbeatTimer >= 5.0) {
            this.hostHeartbeatTimer = 0;
            if (this.net.dbRef) {
                this.net.dbRef.child('world_state/last_host_time').set(Date.now());
            }

            // v0.00.48: Removed Force 10-Kill logic. 
            // Quest progression is now strictly based on accumulated kills (0->30).
            // Legacy code removed.
        }


        // Boss Spawning (Legacy dead code removed)
        // Boss is now spawned directly via _handleMonsterDeath based on Kill Count

        // --- Host Authority: Monster AI & Sync ---
        const candidates = this._getInterestedPlayers(localPlayer, remotePlayers, isProtectedPlayer);
        const now = Date.now();

        this.monsters.forEach((m, id) => {
            // v1.88: Handle Quest Rewards & Drops IMMEDIATELY when isDead flips (Host only)
            if (m.isDead && !m._wasProcessed) {
                m._wasProcessed = true; // One-time flag

                // v0.00.43: Handle Death Logic (Kill Count & Boss Spawn)
                this._handleMonsterDeath(m);

                // Spawn Drops (v0.00.70: 분열된 슬라임 드롭 조정)
                const shouldProcessRewards = m.typeId !== 'training_dummy';
                if (shouldProcessRewards) {
                    const attackerId = m.lastAttackerId || this.net.playerId;
                    const killerPartyMembers = this._getPartyMembersForPlayer(attackerId);
                    let xpAmount = 25;
                    let goldAmount = 50;
                    if (m.typeId === 'king_slime') {
                        xpAmount = 500;
                        goldAmount = 2000;
                    } else if (m.typeId === 'slime_split') {
                        xpAmount = 100;
                        goldAmount = 150;
                    } else if (m.isBoss) {
                        xpAmount = 500;
                        goldAmount = 5000;
                    }
                    this.net.spawnDrop({
                        x: m.x,
                        y: m.y,
                        type: 'gold',
                        amount: goldAmount,
                        ownerId: attackerId,
                        partyMembers: killerPartyMembers
                    });
                    this.net.spawnDrop({
                        x: m.x + 20,
                        y: m.y - 10,
                        type: 'exp',
                        amount: xpAmount,
                        ownerId: attackerId,
                        partyMembers: killerPartyMembers
                    });
                    if (Math.random() > 0.5 || m.isBoss) {
                        this.net.spawnDrop({ x: m.x - 20, y: m.y + 10, type: 'hp', amount: 30 });
                    }
                    this._grantMonsterItemDrops(m, attackerId);
                }

                // Quest & Splitting Logic (v0.00.14)
                if (localPlayer && shouldProcessRewards) {
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
                            // Keep repeat quest progress in sync for host-local kills too.
                            if ((localPlayer.questData.bossClearCount || 0) > 0) {
                                localPlayer.questData.slimeRepeatKills = (localPlayer.questData.slimeRepeatKills || 0) + 1;
                            }
                            // v0.00.43: Boss Spawn is now handled by _handleMonsterDeath (Global Count)
                            // Removed legacy random spawn logic
                        } // Closing for (m.typeId === 'slime' || m.typeId === 'slime_split')

                        if (m.typeId === 'king_slime') {
                            // v0.00.51: Use unify reward logic
                            localPlayer.receiveReward({
                                questKill: 'king_slime',
                                monsterName: m.name
                            });

                            // Spawn logic for Boss Split
                            // v0.00.70: 첫 대왕 슬라임(chargeOnly)에서 분열된 슬라임도 chargeOnly 상속
                            for (let i = 0; i < 3; i++) {
                                const offX = (Math.random() - 0.5) * 100;
                                const offY = (Math.random() - 0.5) * 100;
                                this._spawnMonster(m.x + offX, m.y + offY, 'slime_split', { chargeOnly: m.chargeOnly });
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
                this._clearPlayerTargetIfMatches(m);
                this.net.removeMonster(id);
                this.monsters.delete(id);
                this.lastSyncState.delete(id);
                return;
            }

            // AI and Movement are now handled inside Monster.js update()
            // to avoid double-update conflicts on the Host.
            // We just fall through to the Sync part below.

            // v0.33.0: Host-side Boss AI (Shield)
            // v0.00.76: chargeOnly면 쉴드 비활성화 (돌진만 사용)
            if (!m.isDead && m.typeId === 'king_slime' && !m.chargeOnly) {
                // v0.00.47: Boss Shield Logic
                if (m.shieldCooldown > 0) m.shieldCooldown -= dt * 1000;
            }

            // v0.00.43: Charge Skill (All Slimes: slime, slime_split, king_slime)
            if (!m.isDead && (m.typeId === 'slime' || m.typeId === 'slime_split' || m.typeId === 'king_slime')) {
                if (m.chargeCooldown > 0) m.chargeCooldown -= dt * 1000;

                // Find Target (if not already found by previous logic)
                let target = m.targetPlayer;
                if (!target && candidates.length > 0) {
                    let minDist = 9999;
                    candidates.forEach(p => {
                        const d = Math.sqrt((m.x - p.x) ** 2 + (m.y - p.y) ** 2);
                        if (d < minDist) {
                            minDist = d;
                            target = p;
                        }
                    });
                    m.targetPlayer = target;
                }

                if (target && m.chargeCooldown <= 0 && m.chargeState === 'idle') {
                    const dist = Math.sqrt((m.x - target.x) ** 2 + (m.y - target.y) ** 2);

                    // Variable Range & Cooldown Logic
                    let chargeRange = 400;
                    let cdTime = 4000;

                    if (m.typeId === 'slime_split') {
                        chargeRange = 500;
                        cdTime = 10000; // v1.1: 10s Cooldown
                    }
                    if (m.typeId === 'king_slime') {
                        chargeRange = 800;
                        cdTime = 10000; // v1.1: 10s Cooldown
                    }

                    if (dist < chargeRange) {
                        // Start Charge!
                        m.startCharge(target.x, target.y);
                        m.chargeCooldown = cdTime;

                        // Sync to Clients
                        this.net.sendMonsterAttack(m.id, 'charge', { x: target.x, y: target.y });
                    }
                }
            }

            // --- Bandwidth Throttling (Priority/AOI aware) ---
            const last = this.lastSyncState.get(id);
            const profile = this._getMonsterSyncProfile(m, candidates, mobileThermalMode);
            const lastNetTs = last?.netTs || 0;
            if (last && (now - lastNetTs) < profile.deltaIntervalMs) {
                return;
            }

            const dist = last ? Math.sqrt((m.x - last.x) ** 2 + (m.y - last.y) ** 2) : 999;
            const hpChanged = !last || m.hp !== last.hp || m.maxHp !== last.maxHp;
            const stateChanged = !last
                || last.chargeState !== m.chargeState
                || last.isDead !== !!m.isDead
                || last.chargeOnly !== !!m.chargeOnly
                || last.isBoss !== !!m.isBoss;
            const fullSyncDue = !last
                || stateChanged
                || (now - (last.fullSyncAt || 0)) >= profile.fullSyncIntervalMs;

            if (dist > profile.positionThreshold || hpChanged || stateChanged || fullSyncDue) {
                const immediate = stateChanged || !last;
                this.net.sendMonsterUpdate(id, this._buildMonsterSyncPayload(m, {
                    fullSync: fullSyncDue,
                    immediate
                }));
                this.lastSyncState.set(id, {
                    x: m.x,
                    y: m.y,
                    hp: m.hp,
                    maxHp: m.maxHp,
                    chargeState: m.chargeState,
                    isDead: !!m.isDead,
                    chargeOnly: !!m.chargeOnly,
                    isBoss: !!m.isBoss,
                    netTs: now,
                    fullSyncAt: fullSyncDue ? now : (last?.fullSyncAt || 0)
                });
            }
        });
    }

    forceSync(id) {
        const m = this.monsters.get(id);
        if (!m || !this.net.isHost) return;

        this.net.sendMonsterUpdate(id, this._buildMonsterSyncPayload(m, { fullSync: true, immediate: true }));
        const now = Date.now();
        this.lastSyncState.set(id, {
            x: m.x,
            y: m.y,
            hp: m.hp,
            maxHp: m.maxHp,
            chargeState: m.chargeState,
            isDead: !!m.isDead,
            chargeOnly: !!m.chargeOnly,
            isBoss: !!m.isBoss,
            netTs: now,
            fullSyncAt: now
        });
    }

    async _spawnMonster(fixedX = null, fixedY = null, type = 'slime', options = {}) {
        const id = `mob_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const worldW = this.zone.width || 6400;
        const worldH = this.zone.height || 6400;
        const currentScene = this.game.sceneManager?.currentScene;
        const isSafePoint = (x, y) => typeof currentScene?.isPointInSafeZone === 'function' && currentScene.isPointInSafeZone(x, y, 80);

        let x = fixedX ?? (200 + Math.random() * (worldW - 400));
        let y = fixedY ?? (200 + Math.random() * (worldH - 400));

        if (isSafePoint(x, y)) {
            let attempts = 0;
            while (attempts < 12 && isSafePoint(x, y)) {
                x = 200 + Math.random() * (worldW - 400);
                y = 200 + Math.random() * (worldH - 400);
                attempts++;
            }
        }

        // Load definition first
        let definition = await this.game.monsterData.loadDefinition(type);
        if (!definition) definition = {}; // Fallback if missing

        const data = {
            id: id,
            x: Math.round(x),
            y: Math.round(y),
            hp: definition.baseStats?.hp || 100,
            maxHp: definition.baseStats?.maxHp || 100,
            type: type,
            chargeOnly: options.chargeOnly || false // v0.00.70: chargeOnly 옵션 지원
        };

        if (options.tutorialOnly) {
            this.tutorialMonsterIds.add(id);
        }

        this.net.sendMonsterUpdate(id, { ...data, fullSync: true, immediate: true });
        return id;
    }

    async _spawnLocalMonster(fixedX = null, fixedY = null, type = 'slime', options = {}) {
        const currentScene = this.game.sceneManager?.currentScene;
        const isSafePoint = (x, y) => typeof currentScene?.isPointInSafeZone === 'function' && currentScene.isPointInSafeZone(x, y, 80);
        let x = fixedX ?? 400;
        let y = fixedY ?? 400;

        if (isSafePoint(x, y) && type !== 'training_dummy') {
            x += 140;
        }

        let definition = await this.game.monsterData.loadDefinition(type);
        if (!definition) definition = {};

        const monster = new Monster(Math.round(x), Math.round(y), definition);
        monster.id = `local_tutorial_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        monster.hp = definition.baseStats?.hp || 100;
        monster.maxHp = definition.baseStats?.maxHp || 100;
        monster.ready = true;
        monster.isLocalOnly = true;

        if (options.tutorialOnly) {
            this.tutorialMonsterIds.add(monster.id);
        }

        this.monsters.set(monster.id, monster);
        return monster.id;
    }

    async _spawnBoss(isFirstBoss = true) {
        const existingBoss = Array.from(this.monsters.values()).find((monster) => monster.typeId === 'king_slime' && !monster.isDead);
        if (this.bossSpawned || existingBoss) {
            return null;
        }

        this.bossSpawned = true;

        const id = `boss_${Date.now()}`;
        const worldW = this.zone.width || 6400;
        const worldH = this.zone.height || 6400;
        const x = worldW / 2;
        const y = worldH / 2;

        const definition = await this.game.monsterData.loadDefinition('king_slime');
        if (!definition) {
            this.bossSpawned = false;
            return null;
        }

        // v0.00.70: 첫 대왕 슬라임(퀘스트용)은 HP 1000, 돌진만 사용
        const hp = isFirstBoss ? 1000 : (definition.baseStats?.hp || 1500);
        const maxHp = isFirstBoss ? 1000 : (definition.baseStats?.maxHp || 1500);

        const data = {
            id: id,
            x: x,
            y: y,
            hp: hp,
            maxHp: maxHp,
            type: 'king_slime',
            isBoss: true,
            chargeOnly: isFirstBoss, // v0.00.70: 첫 대왕 슬라임은 돌진만 사용
            w: definition.visual?.width || 320,
            h: definition.visual?.height || 320
        };

        // v0.00.76: Ensure clients know this is a limited pattern boss
        this.net.sendMonsterUpdate(id, { ...data, fullSync: true, immediate: true });
        if (window.game && window.game.ui) {
            if (isFirstBoss) {
                window.game.ui.logSystemMessage('초보 모험가를 위한 대왕 슬라임이 나타났습니다! (돌진 공격만 사용)');
            } else {
                window.game.ui.logSystemMessage('분노한 대왕 슬라임이 나타났습니다!');
            }
        }

        return id;
    }

    async _onRemoteMonsterAdded(data) {
        if (this.isSpawnSuppressed() && data.type !== 'training_dummy') return;
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
            if (!definition) throw new Error(`Definition not found for ${typeId}`);

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
            // v0.00.70: chargeOnly 플래그 적용 (돌진 공격만 사용)
            if (data.chargeOnly) {
                m.chargeOnly = true;
            }
            this.monsters.set(data.id, m);
        } catch (e) {
            Logger.warn(`Defaulting to fallback for monster ${data.id} (${typeId})`);
            const m = new Monster(data.x, data.y, {});
            m.id = data.id;
            m.hp = data.hp;
            m.maxHp = data.maxHp;
            this.monsters.set(data.id, m);
        }
    }

    _onRemoteMonsterUpdated(data) {
        const m = this.monsters.get(data.id);
        if (!m) {
            if (this.isSpawnSuppressed() && data.type !== 'training_dummy') return;
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
        this._clearPlayerTargetIfMatches(id);
        this.tutorialMonsterIds.delete(id);
        this.lastSyncState.delete(id);
        this.monsters.delete(id);
    }

    _clearPlayerTargetIfMatches(monsterOrId) {
        const targetId = typeof monsterOrId === 'string' ? monsterOrId : monsterOrId?.id;
        if (!targetId) return;

        const player = this.game?.localPlayer;
        if (player?.currentTarget && (player.currentTarget.id === targetId || player.currentTarget === monsterOrId)) {
            player.clearCurrentTarget?.();
        }
    }

    _onMonsterDamageReceived(data) {
        // v0.00.03: Allow ALL clients to process damage events for visual feedback
        // if (!this.net.isHost) return; 
        // v0.29.18: 호스트 자신이 보낸 데미지는 이미 로컬에서 처리했으므로 무시
        if (data.aid === this.net.playerId) return;
        const m = this.monsters.get(data.mid);
        if (m && !m.isDead) {
            m.lastAttackerId = data.aid;
            m.takeDamage(data.dmg, true, false, null, null, data.meta || null);
        }
    }

    async _onDropAdded(data) {
        if (this.drops.has(data.id)) return;
        const { default: Drop } = await import('../entities/Drop.js');
        const d = new Drop(data.id, data.x, data.y, data.type, data.amount, {
            ownerId: data.ownerId,
            partyMembers: data.partyMembers
        });
        this.drops.set(data.id, d);
    }

    _onDropRemoved(id) {
        this.drops.delete(id);
    }

    _onDropCollectionRequested(data) {
        if (!this.net.isHost) return;
        const drop = this.drops.get(data.dropId);
        if (drop) {
            const collectorAllowed = !drop.ownerId
                || drop.ownerId === data.collectorId
                || drop.partyMembers?.includes(data.collectorId);
            if (!collectorAllowed) return;

            if (drop.type === 'gold' || drop.type === 'exp') {
                const ownerId = drop.ownerId || data.collectorId;
                const ownerReward = {};
                const allyReward = {};

                if (drop.type === 'gold') {
                    ownerReward.gold = drop.amount;
                    allyReward.gold = Math.max(1, Math.floor(drop.amount * 0.6));
                } else {
                    ownerReward.exp = drop.amount;
                    allyReward.exp = Math.max(1, Math.floor(drop.amount * 0.6));
                }

                this.net.sendReward(ownerId, ownerReward);

                const partyMembers = this._normalizePartyMembers(drop.partyMembers || []);
                partyMembers
                    .filter((uid) => uid !== ownerId)
                    .forEach((uid) => this.net.sendReward(uid, allyReward));
            } else if (drop.type === 'hp') {
                this.net.sendReward(data.collectorId, { hp: drop.amount });
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
        if (this.net.isHost) {
            this.monsters.forEach((_, id) => this.net.removeMonster(id));
            this.drops.forEach((_, id) => this.net.removeDrop(id));
        }

        this.monsters.clear();
        this.drops.clear();
        this.lastSyncState.clear();
        this.tutorialMonsterIds.clear();
        Logger.info("[MonsterManager] Local world state cleared.");
    }

    _handleBlueFlameDeathExplosion(monster) {
        const meta = monster?.lastDamageMeta;
        if (!meta || meta.prefixId !== 'blue_flame') return;
        if (!['fireball', 'burn'].includes(meta.cause)) return;

        const ratio = Math.max(0, meta.fireExplosionDamageRatio || 0);
        if (ratio <= 0) return;

        const sourceDamage = Math.max(1, meta.sourceDamage || 1);
        const explosionDamage = Math.max(1, Math.ceil(sourceDamage * ratio));
        const radius = Math.max(90, meta.explosionRadius || 120);
        const burnDuration = Math.max(1, meta.burnDuration || 2);

        window.game?.addExplosion?.(monster.x, monster.y, radius, { variant: 'blue_flame', duration: 0.55 });
        if (window.game?.sound) {
            window.game.sound.playSfx('fireball_explosion');
        }

        this.monsters.forEach((other) => {
            if (!other || other.id === monster.id || other.isDead) return;
            const dist = Math.sqrt((other.x - monster.x) ** 2 + (other.y - monster.y) ** 2);
            const collisionRadius = radius + ((other.width || 80) / 2);
            if (dist > collisionRadius) return;

            const damageMeta = {
                cause: 'blue_flame_explosion',
                prefixId: 'blue_flame',
                fireExplosionDamageRatio: ratio,
                burnDuration,
                sourceDamage: explosionDamage,
                explosionRadius: radius
            };

            if (this.net) {
                this.net.sendMonsterDamage(other.id, explosionDamage, damageMeta);
                other.lastAttackerId = monster.lastAttackerId;
            }
            other.takeDamage(explosionDamage, true, false, monster.x, monster.y, damageMeta);
            other.applyEffect('burn', burnDuration, Math.max(1, Math.ceil(explosionDamage * 0.15)), {
                cause: 'burn',
                prefixId: 'blue_flame',
                fireExplosionDamageRatio: ratio,
                burnDuration,
                sourceDamage: explosionDamage,
                explosionRadius: radius
            });
        });
    }

    // v0.00.43: Kill Count & Boss Spawn Logic
    _handleMonsterDeath(m) {
        this._handleBlueFlameDeathExplosion(m);
        // Only the first king slime uses the global 30-kill buildup.
        if (m.typeId === 'slime' || m.typeId === 'slime_split') {
            if (!this.firstBossDefeated && !this.bossSpawned && this.slimeKillCount < 30) {
                this.slimeKillCount++;
                if (this.net.dbRef) {
                    this.net.dbRef.child('world_state/slime_kill_count').set(this.slimeKillCount);
                }
                Logger.log(`[MonsterManager] Slime Kill Count: ${this.slimeKillCount}`);

                if (this.slimeKillCount === 10) {
                    this.net.sendSystemMessage("슬라임의 왕이 백성의 죽음에 슬퍼하고 있습니다. (10/30)", "#ffeb3b");
                } else if (this.slimeKillCount === 20) {
                    this.net.sendSystemMessage("슬라임의 왕이 백성의 죽음에 분노하고 있습니다. (20/30)", "#ffeb3b");
                } else if (this.slimeKillCount === 30) {
                    this.net.sendSystemMessage("대왕 슬라임이 강림할 준비를 마쳤습니다. 퀘스트 보상을 수령해 소환하세요. (30/30)", "#ff4757");
                }
            }
        } else if (m.typeId === 'king_slime') {
            // Boss died.
            this.bossSpawned = false;
            // v0.00.70: 첫 대왕 슬라임 처치 완료 플래그
            this.firstBossDefeated = true;
            // Ensure count is 0
            this.slimeKillCount = 0;
            if (this.net.dbRef) this.net.dbRef.child('world_state/slime_kill_count').set(0);
        }
    }
}
