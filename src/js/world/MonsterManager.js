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
        this.spawnInterval = 2.0; // v2.4.4: Target up to 2s respawn feel
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
        this.firstBossPending = false;
        this.firstBossMissingTimer = 0;
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
        this.monsterRegionMap = new Map();
        this.monsterRevisionMap = new Map();
        this.peerMonsterKeyframeMeta = new Map();
        this._hostSnapshotRestorePromise = null;
        this._lastHostSnapshotRestoreTs = 0;
        this._guestSnapshotHydrationPending = null;
        this._guestSnapshotHydrationPromise = null;
        this._lastGuestSnapshotHydrationTs = 0;

        // Register Network Handlers
        this.net.onRemoteMonsterAdded(this._onRemoteMonsterAdded.bind(this));
        this.net.onRemoteMonsterUpdated(this._onRemoteMonsterUpdated.bind(this));
        this.net.onRemoteMonsterRemoved(this._onRemoteMonsterRemoved.bind(this));
        this.net.onMonsterDamageReceived(this._onMonsterDamageReceived.bind(this));
        this.net.onDropAdded(this._onDropAdded.bind(this));
        this.net.onDropRemoved(this._onDropRemoved.bind(this));
        this.net.onDropCollectionRequested(this._onDropCollectionRequested.bind(this));
        this.net.on('bossSpawnRequested', this._handleBossSpawnRequested.bind(this));
        this.net.on('fieldPeerPresenceChanged', this._handleFieldPeerPresenceChanged.bind(this));
        this.net.on('connected', () => this._scheduleGuestSnapshotHydration('connected', 500));
        this.net.on('hostChanged', (isHost) => {
            if (!isHost) {
                this._scheduleGuestSnapshotHydration('host_changed', 450);
            }
        });
        this.net.on('sharedFieldChanged', ({ active }) => {
            if (active) {
                if (this.net.isHost) {
                    // Leaving solo quiet mode needs one authoritative keyframe pass
                    // so late joiners immediately receive the current field population.
                    this.lastSyncState.clear();
                    this.forceSyncAll();
                    this.forceSyncAllDrops();
                    return;
                }
                this._scheduleGuestSnapshotHydration('shared_field_join', 350);
                return;
            }
            if (this.net.isHost) {
                this.lastSyncState.clear();
                this.peerMonsterKeyframeMeta.clear();
                return;
            }
            this._guestSnapshotHydrationPending = null;
        });

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
            const sourceDefinition = itemData.getItemDefinition(itemId);
            const blessedVariantChance = itemId === 'weapon_upgrade_stone'
                ? Math.max(0, Math.min(1, sourceDefinition?.dropRules?.blessedVariantChance ?? 0))
                : 0;
            const resolvedItemId = blessedVariantChance > 0 && Math.random() < blessedVariantChance
                ? 'blessed_weapon_upgrade_stone'
                : itemId;
            const minAmount = Math.max(1, dropDef.min || dropDef.quantity || 1);
            const maxAmount = Math.max(minAmount, dropDef.max || minAmount);
            const amount = Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount;
            return itemData.createRewardItem(resolvedItemId, {
                amount,
                monsterId: context.monster?.typeId || null
            });
        }

        const itemMeta = {
            slime_gel: { name: '슬라임 젤', icon: '🟢' },
            potion_hp_small: { name: '소형 HP 포션', icon: '🧪' },
            royal_jelly: { name: '로열 젤리', icon: '🍯' },
            king_crown: { name: '킹 크라운', icon: '👑' },
            weapon_upgrade_stone: { name: '무기 강화석', icon: '💎' },
            blessed_weapon_upgrade_stone: { name: '축복받은 무기 강화석', icon: '💎' }
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
        const isProtectedPlayer = (player) => {
            const currentScene = this.game.sceneManager?.currentScene;
            if (!player || typeof currentScene?.isPlayerProtected !== 'function') return false;
            return currentScene.isPlayerProtected(player);
        };
        const authorityPlayers = this.net.isHost
            ? this._getInterestedPlayers(localPlayer, remotePlayers, isProtectedPlayer)
            : [];

        // v1.99: Calculate total level for all clients (for UI/Dev Mode)
        let currentTotalLevel = localPlayer?.level || 1;
        if (remotePlayers) {
            remotePlayers.forEach(rp => currentTotalLevel += (rp.level || 1));
        }
        this.totalLevelSum = currentTotalLevel;

        if (this.net.isHost) {
            this._updateHostLogic(dt, localPlayer, remotePlayers);
        } else {
            this._processPendingGuestSnapshotHydration().catch((error) => {
                Logger.warn('[MonsterManager] Guest monster snapshot hydration failed', error);
            });
        }

        // Update local monster instances.
        // Host must continue simulating monsters that are relevant to remote players
        // even when they are outside the host camera.
        this.monsters.forEach(m => {
            const hasActiveTarget = this._isValidMonsterTarget(m.targetPlayer, isProtectedPlayer);
            if (!hasActiveTarget && m.targetPlayer) {
                m.targetPlayer = null;
                if (m.chargeState === 'casting' || m.chargeState === 'charging') {
                    m.chargeState = 'idle';
                    m.chargeTarget = null;
                }
            }

            const hostRelevantOffscreen = this.net.isHost && (
                m.chargeState !== 'idle'
                || !!m.isAggro
                || hasActiveTarget
                || m.isDead
                || this._isMonsterNearAnyPlayer(m, authorityPlayers, m.isBoss ? 1600 : 1100)
            );

            if (this.net.isHost || this.isOnScreen(m) || hostRelevantOffscreen) {
                m.update(dt); // Full update for on-screen
            }
            // Off-screen guest-only monsters are still culled locally.
        });

        this._checkFirstBossQuestFailure(dt, localPlayer);

        // Update drops (Magnet logic)
        this.drops.forEach((d, id) => {
            if (d.update(dt, localPlayer)) {
                this.net.collectDrop(id);
            }
        });
    }

    handleVisibilityResync(options = {}) {
        const resumedAt = Number(options.resumedAt || Date.now());
        const shouldSnapToAuthority = !this.net?.isHost;

        this.monsters.forEach((monster) => {
            if (!monster) return;

            if (shouldSnapToAuthority) {
                if (Number.isFinite(monster.targetX)) monster.x = monster.targetX;
                if (Number.isFinite(monster.targetY)) monster.y = monster.targetY;
            }

            monster.vx = 0;
            monster.vy = 0;
            if (monster.knockback) {
                monster.knockback.vx = 0;
                monster.knockback.vy = 0;
            }
            monster.hitTimer = 0;
            monster.lastNetworkEventAt = resumedAt;

            if (monster.remoteSyncState !== 'casting' && monster.remoteSyncState !== 'charging') {
                monster.chargeState = 'idle';
                monster.chargeTarget = null;
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
            this.monsterRegionMap.delete(id);
            this.monsterRevisionMap.delete(id);
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

    async clearFreshIntroFieldState() {
        const peerCount = Number(this.net?.getSameFieldPeerCount?.() || 0);
        if (peerCount > 0) {
            return false;
        }

        await this.net?.clearWorldCombatState?.({ resetSlimeKillCount: true });
        this.clearAll();
        this.bossSpawned = false;
        this.shouldSpawnBoss = false;
        this.firstBossPending = false;
        this.firstBossMissingTimer = 0;
        this.slimeKillCount = 0;
        return true;
    }

    _isValidMonsterTarget(player, isProtectedPlayer = () => false) {
        if (!player || player.isDead || isProtectedPlayer(player)) return false;
        if (player.id === this.net?.playerId) return true;
        return !!this.net?.isUserActivelyPresent?.(player.id);
    }

    _getInterestedPlayers(localPlayer, remotePlayers, isProtectedPlayer) {
        const players = [];
        const seenIds = new Set();
        const tryAddPlayer = (player) => {
            if (!player?.id || seenIds.has(player.id)) return;
            if (!this._isValidMonsterTarget(player, isProtectedPlayer)) return;
            if (Number.isFinite(player.protectedUntil) && player.protectedUntil > Date.now()) return;
            seenIds.add(player.id);
            players.push(player);
        };
        if (this._isValidMonsterTarget(localPlayer, isProtectedPlayer)) {
            seenIds.add(localPlayer.id);
            players.push(localPlayer);
        }
        if (remotePlayers) {
            remotePlayers.forEach((player) => {
                tryAddPlayer(player);
            });
        }
        if (this.net?.remotePlayers) {
            this.net.remotePlayers.forEach((player, id) => {
                if (!player || !id) return;
                tryAddPlayer({
                    id: player.id || id,
                    x: Number(player.x ?? 0),
                    y: Number(player.y ?? 0),
                    width: player.width || 48,
                    height: player.height || 48,
                    isDead: Array.isArray(player.h) ? Number(player.h[0] || 0) <= 0 : false,
                    isPaused: !!player.isPaused,
                    protectedUntil: Number(player.protectedUntil || 0),
                    type: 'player'
                });
            });
        }
        return players;
    }

    resetCombatTargets(options = {}) {
        const clearChargeState = options.clearChargeState !== false;
        this.monsters.forEach((monster) => {
            if (!monster) return;
            monster.targetPlayer = null;
            monster.isAggro = false;
            if (!clearChargeState) return;
            monster.chargeTarget = null;
            if (monster.chargeState === 'casting' || monster.chargeState === 'charging') {
                monster.chargeState = 'idle';
            }
        });
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

    _scheduleGuestSnapshotHydration(reason = 'unknown', delayMs = 250) {
        if (this.net?.isHost) return;
        this._guestSnapshotHydrationPending = {
            reason,
            dueAt: Date.now() + Math.max(0, Number(delayMs || 0))
        };
    }

    async _processPendingGuestSnapshotHydration() {
        if (this.net?.isHost) {
            this._guestSnapshotHydrationPending = null;
            return;
        }
        const pending = this._guestSnapshotHydrationPending;
        if (!pending) return;
        if (Date.now() < pending.dueAt) return;
        if (!this.game?.localPlayer || !this.net?.connected || !this.net?.zoneParticipationEnabled) return;

        this._guestSnapshotHydrationPending = null;
        await this.restoreVisibleMonstersFromHostSnapshot({ reason: pending.reason });
    }

    _getFieldCellSize() {
        return Math.max(128, this.net?._fieldCellSize || 640);
    }

    _getCellIdFromPosition(x = 0, y = 0) {
        const cellSize = this._getFieldCellSize();
        const safeX = Number.isFinite(x) ? x : 0;
        const safeY = Number.isFinite(y) ? y : 0;
        return `${Math.floor(safeX / cellSize)}_${Math.floor(safeY / cellSize)}`;
    }

    _parseCellId(cellId) {
        if (typeof cellId !== 'string') return null;
        const [rawX, rawY] = cellId.split('_');
        const x = Number.parseInt(rawX, 10);
        const y = Number.parseInt(rawY, 10);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y };
    }

    _getCellChebyshevDistance(fromCellId, toCellId) {
        const from = this._parseCellId(fromCellId);
        const to = this._parseCellId(toCellId);
        if (!from || !to) return Number.POSITIVE_INFINITY;
        return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
    }

    _getMonsterCellId(monster) {
        if (!monster) return '0_0';
        const cellId = this._getCellIdFromPosition(monster.x, monster.y);
        if (monster.id) {
            this.monsterRegionMap.set(monster.id, cellId);
        }
        return cellId;
    }

    _isMonsterInCellNeighborhood(monster, cellId, range = 1) {
        const monsterCell = this._parseCellId(this._getMonsterCellId(monster));
        const targetCell = this._parseCellId(cellId);
        if (!monsterCell || !targetCell) return false;
        return Math.abs(monsterCell.x - targetCell.x) <= range
            && Math.abs(monsterCell.y - targetCell.y) <= range;
    }

    _getMonsterNetworkState(monster) {
        if (!monster || monster.isDead || monster.hp <= 0) return 'dead';
        if (monster.chargeState === 'casting' || monster.chargeState === 'charging') {
            return monster.chargeState;
        }
        if (monster.isAggro) return 'aggro';
        return 'idle';
    }

    _nextMonsterRevision(monsterId) {
        const nextRev = (this.monsterRevisionMap.get(monsterId) || 0) + 1;
        this.monsterRevisionMap.set(monsterId, nextRev);
        return nextRev;
    }

    _handleFieldPeerPresenceChanged({ uid, entry, reason } = {}) {
        if (!this.net?.isHost || !uid || !entry) return;
        if (entry.fieldId !== this.net?._getCurrentFieldId?.()) return;
        if (reason !== 'peer_joined_field' && reason !== 'peer_cell_changed') return;

        const now = Date.now();
        const previous = this.peerMonsterKeyframeMeta.get(uid) || null;
        if (previous?.cellId === entry.cellId && (now - previous.ts) < 1200) return;
        if (reason === 'peer_cell_changed' && previous?.cellId) {
            const cellShift = this._getCellChebyshevDistance(previous.cellId, entry.cellId);
            if (cellShift <= 1 && (now - previous.ts) < 5000) return;
        }

        this.peerMonsterKeyframeMeta.set(uid, {
            cellId: entry.cellId,
            ts: now
        });
        this.forceSyncAroundCell(entry.cellId, { neighborhood: 1 });
    }

    _getMonsterSyncProfile(monster, interestedPlayers, mobileThermalMode) {
        if (this.net?.shouldUseMonsterQuietMode?.()) {
            return {
                deltaIntervalMs: monster.isBoss ? 1400 : 2200,
                positionThreshold: monster.isBoss ? 12 : 20,
                fullSyncIntervalMs: monster.isBoss ? 5200 : 7600
            };
        }

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
                deltaIntervalMs: mobileThermalMode ? 220 : 170,
                positionThreshold: mobileThermalMode ? 3.25 : 2.25,
                fullSyncIntervalMs: mobileThermalMode ? 3600 : 3000
            };
        }

        return {
            deltaIntervalMs: mobileThermalMode ? 600 : 460,
            positionThreshold: mobileThermalMode ? 6.5 : 4.5,
            fullSyncIntervalMs: mobileThermalMode ? 9000 : 7200
        };
    }

    _buildMonsterSyncPayload(monster, { fullSync = false, immediate = false } = {}) {
        const rev = this._nextMonsterRevision(monster.id);
        const cellId = this._getMonsterCellId(monster);
        const state = this._getMonsterNetworkState(monster);
        const now = Date.now();
        const payload = {
            x: Math.round(monster.x),
            y: Math.round(monster.y),
            hp: monster.hp,
            maxHp: monster.maxHp,
            type: monster.typeId || monster.name,
            chargeOnly: !!monster.chargeOnly,
            rev,
            ts: now,
            state,
            cellId
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
            if (this.spawnTimer >= 0.5) { // Check twice per second for quicker refill
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
            let liveMonsterCount = 0;
            this.monsters.forEach((monster) => {
                if (monster && !monster.isDead) {
                    liveMonsterCount += 1;
                }
            });

            // v2.4.4: Bring normal-field respawns back closer to 2s after kills.
            const spawnInterval = Math.max(0.5, 2 - Math.floor(this.totalLevelSum / 8) * 0.1);

            this.spawnTimer += dt;
            if (this.spawnTimer >= spawnInterval) {
                this.spawnTimer = 0;
                if (liveMonsterCount < maxMonsters) {
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

                // Spawn Drops
                const shouldProcessRewards = m.typeId !== 'training_dummy';
                if (shouldProcessRewards) {
                    const attackerId = m.lastAttackerId || this.net.playerId;
                    const killerPartyMembers = this._getPartyMembersForPlayer(attackerId);
                    let xpAmount = 25;
                    let goldAmount = 50;
                    if (m.typeId === 'king_slime') {
                        xpAmount = 500;
                        goldAmount = 2000;
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

                    let shouldSaveLocalQuestProgress = false;

                    if (m.typeId === 'king_slime') {
                        const bossCycle = this.firstBossDefeated ? 'repeat' : 'intro';
                        const participantIds = this._getMonsterParticipantIds(m, attackerId);
                        participantIds.forEach((uid) => {
                            if (!uid) return;
                            if (uid === this.net.playerId) {
                                localPlayer.receiveReward({
                                    questKill: 'king_slime',
                                    monsterName: m.name,
                                    bossCycle
                                });
                                shouldSaveLocalQuestProgress = true;
                                return;
                            }

                            this.net.sendReward(uid, {
                                questKill: 'king_slime',
                                monsterName: m.name,
                                bossCycle,
                                ts: Date.now()
                            });
                        });

                        // Spawn logic for Boss Split
                        // v0.00.70: king slime(chargeOnly) also spawns chargeOnly children.
                        for (let i = 0; i < 3; i++) {
                            const offX = (Math.random() - 0.5) * 100;
                            const offY = (Math.random() - 0.5) * 100;
                            this._spawnMonster(m.x + offX, m.y + offY, 'slime_split', { chargeOnly: m.chargeOnly });
                        }
                    } else if (attackerId === this.net.playerId) {
                        // My Kill -> My Quest Logic
                        if (m.typeId === 'slime' || m.typeId === 'slime_split') {
                            localPlayer.questData.slimeKills++;
                            // Pause repeat summon buildup while a king slime is active.
                            if ((localPlayer.questData.bossClearCount || 0) > 0 && !this.bossSpawned) {
                                localPlayer.questData.slimeRepeatKills = (localPlayer.questData.slimeRepeatKills || 0) + 1;
                            }
                            // v0.00.43: Boss Spawn is now handled by _handleMonsterDeath (Global Count)
                            // Removed legacy random spawn logic
                        }

                        if (m.typeId === 'slime_split') {
                            for (let i = 0; i < 2; i++) {
                                const offX = (Math.random() - 0.5) * 60;
                                const offY = (Math.random() - 0.5) * 60;
                                this._spawnMonster(m.x + offX, m.y + offY, 'slime');
                            }
                        }

                        shouldSaveLocalQuestProgress = true;
                    } else {
                        // Remote Kill -> Notify Killer for Quest Updates
                        this.net.sendReward(attackerId, {
                            questKill: m.typeId,
                            monsterName: m.name,
                            ts: Date.now()
                        });
                    }

                    if (shouldSaveLocalQuestProgress) {
                        localPlayer.saveState();
                        if (window.game && window.game.ui) window.game.ui.updateQuestUI();
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
                this.monsterRegionMap.delete(id);
                this.monsterRevisionMap.delete(id);
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
                let target = this._isValidMonsterTarget(m.targetPlayer, isProtectedPlayer)
                    ? m.targetPlayer
                    : null;
                if (!target && m.targetPlayer) {
                    m.targetPlayer = null;
                }
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
                    const targetX = target.x + ((target.width || 0) / 2);
                    const targetY = target.y + ((target.height || 0) / 2);
                    const dist = Math.sqrt((m.x - targetX) ** 2 + (m.y - targetY) ** 2);

                    // Variable Range & Cooldown Logic
                    let chargeRange = 400;
                    let cdTime = 4000;
                    let minChargeDistance = 95;

                    if (m.typeId === 'slime_split') {
                        chargeRange = 500;
                        cdTime = 10000; // v1.1: 10s Cooldown
                        minChargeDistance = 110;
                    }
                    if (m.typeId === 'king_slime') {
                        chargeRange = 800;
                        cdTime = 10000; // v1.1: 10s Cooldown
                        minChargeDistance = 140;
                    }

                    if (dist < chargeRange && dist > minChargeDistance) {
                        // Start Charge!
                        m.startCharge(targetX, targetY);
                        m.chargeCooldown = cdTime;

                        // Sync to Clients
                        this.net.sendMonsterAttack(m.id, 'charge', { x: targetX, y: targetY });
                    }
                }
            }

            // --- Bandwidth Throttling (Priority/AOI aware) ---
            if (this.net?.shouldUseMonsterQuietMode?.()) {
                return;
            }

            const last = this.lastSyncState.get(id);
            const profile = this._getMonsterSyncProfile(m, candidates, mobileThermalMode);
            const lastNetTs = last?.netTs || 0;
            if (last && (now - lastNetTs) < profile.deltaIntervalMs) {
                return;
            }

            const dist = last ? Math.sqrt((m.x - last.x) ** 2 + (m.y - last.y) ** 2) : 999;
            const hpChanged = !last || m.hp !== last.hp || m.maxHp !== last.maxHp;
            const stateChanged = !last
                || last.state !== this._getMonsterNetworkState(m)
                || last.isDead !== !!m.isDead
                || last.chargeOnly !== !!m.chargeOnly
                || last.isBoss !== !!m.isBoss;
            const currentCellId = this._getMonsterCellId(m);
            const cellChanged = !last || last.cellId !== currentCellId;
            const fullSyncDue = !last
                || stateChanged
                || cellChanged
                || (now - (last.fullSyncAt || 0)) >= profile.fullSyncIntervalMs;

            if (dist > profile.positionThreshold || hpChanged || stateChanged || fullSyncDue) {
                const immediate = stateChanged || !last;
                const payload = this._buildMonsterSyncPayload(m, {
                    fullSync: fullSyncDue,
                    immediate
                });
                this.net.sendMonsterUpdate(id, payload);
                this.lastSyncState.set(id, {
                    x: m.x,
                    y: m.y,
                    hp: m.hp,
                    maxHp: m.maxHp,
                    state: payload.state,
                    isDead: !!m.isDead,
                    chargeOnly: !!m.chargeOnly,
                    isBoss: !!m.isBoss,
                    cellId: payload.cellId,
                    rev: payload.rev,
                    netTs: now,
                    fullSyncAt: fullSyncDue ? now : (last?.fullSyncAt || 0)
                });
            }
        });
    }

    forceSync(id) {
        const m = this.monsters.get(id);
        if (!m || !this.net.isHost) return;

        const payload = this._buildMonsterSyncPayload(m, { fullSync: true, immediate: true });
        this.net.sendMonsterUpdate(id, payload);
        const now = Date.now();
        this.lastSyncState.set(id, {
            x: m.x,
            y: m.y,
            hp: m.hp,
            maxHp: m.maxHp,
            state: payload.state,
            isDead: !!m.isDead,
            chargeOnly: !!m.chargeOnly,
            isBoss: !!m.isBoss,
            cellId: payload.cellId,
            rev: payload.rev,
            netTs: now,
            fullSyncAt: now
        });
    }

    forceSyncAroundCell(cellId, options = {}) {
        if (!this.net.isHost || !cellId) return 0;
        const neighborhood = Math.max(0, Number(options.neighborhood || 1));
        let syncedCount = 0;

        this.monsters.forEach((monster, id) => {
            if (!monster || monster.isDead) return;
            if (!this._isMonsterInCellNeighborhood(monster, cellId, neighborhood)) return;
            this.forceSync(id);
            syncedCount += 1;
        });

        return syncedCount;
    }

    forceSyncAll() {
        if (!this.net.isHost) return;
        this.monsters.forEach((monster, id) => {
            if (!monster || monster.isDead) return;
            this.forceSync(id);
        });
    }

    forceSyncAllDrops() {
        if (!this.net.isHost) return;
        this.drops.forEach((drop, id) => {
            if (!drop || !id) return;
            this.net.publishDropSnapshot(id, {
                x: drop.x,
                y: drop.y,
                type: drop.type,
                amount: drop.amount,
                ownerId: drop.ownerId,
                partyMembers: drop.partyMembers,
                ts: Date.now()
            });
        });
    }

    _applyAuthoritativeSnapshotToMonster(monster, data) {
        if (!monster || !data) return;

        if (Number.isFinite(data.x)) {
            monster.x = data.x;
            monster.targetX = data.x;
        }
        if (Number.isFinite(data.y)) {
            monster.y = data.y;
            monster.targetY = data.y;
        }
        if (Number.isFinite(data.hp)) monster.hp = data.hp;
        if (Number.isFinite(data.maxHp)) monster.maxHp = data.maxHp;
        if (data.isBoss) {
            monster.isBoss = true;
            if (Number.isFinite(data.w)) monster.width = data.w;
            if (Number.isFinite(data.h)) monster.height = data.h;
        }
        monster.chargeOnly = !!data.chargeOnly;
        monster.isDead = false;
        monster.deathTimer = 0;
        monster.lastNetworkEventAt = Number(data.ts || Date.now());

        this._applyRemoteMonsterNetworkState(monster, data);
        this.monsterRevisionMap.set(
            monster.id,
            Math.max(Number(data.rev || 0), Number(this.monsterRevisionMap.get(monster.id) || 0))
        );
    }

    _removeMonsterLocalState(id) {
        if (!id) return;
        const monster = this.monsters.get(id);
        if (monster?.typeId === 'king_slime' || monster?.isBoss) {
            this.bossSpawned = false;
        }
        this._clearPlayerTargetIfMatches(id);
        this.tutorialMonsterIds.delete(id);
        this.lastSyncState.delete(id);
        this.monsterRegionMap.delete(id);
        this.monsterRevisionMap.delete(id);
        this.monsters.delete(id);
    }

    markFirstBossPending(active = true) {
        this.firstBossPending = !!active;
        if (active) {
            this.firstBossMissingTimer = 0;
        }
    }

    _checkFirstBossQuestFailure(dt, localPlayer) {
        const questData = localPlayer?.questData;
        if (!questData) {
            this.firstBossMissingTimer = 0;
            return;
        }

        const hasIntroBossClear = (questData.bossClearCount || 0) > 0
            || !!questData.bossKilled
            || !!questData.bossQuestClaimed;
        const hasIntroBossParticipation = !!questData.introBossParticipated;
        const isIntroBossQuestActive = !!questData.slime30QuestClaimed
            && !hasIntroBossClear;

        if (!isIntroBossQuestActive) {
            this.firstBossMissingTimer = 0;
            if (hasIntroBossClear) {
                this.firstBossPending = false;
            }
            return;
        }

        const liveIntroBoss = Array.from(this.monsters.values()).some((monster) => monster?.typeId === 'king_slime' && !monster.isDead);
        if (liveIntroBoss || this.bossSpawned) {
            this.firstBossPending = true;
            this.firstBossMissingTimer = 0;
            return;
        }

        if (!this.firstBossPending) {
            return;
        }

        this.firstBossMissingTimer += dt;
        if (this.firstBossMissingTimer < 3.0) {
            return;
        }

        this.firstBossMissingTimer = 0;
        this.firstBossPending = false;
        if (hasIntroBossParticipation) {
            localPlayer.receiveReward({
                questKill: 'king_slime',
                monsterName: '대왕 슬라임',
                bossCycle: 'intro'
            }, {
                debounceMs: 0
            });
            questData.introBossParticipated = false;
            this.game.quests?.restoreFromLegacy?.(questData);
            this.game.ui?.logSystemMessage?.('대왕 슬라임 참여가 인정되어 첫 보스 토벌이 완료되었습니다.');
            this.game.ui?.updateQuestUI?.();
            return;
        }
        questData.slimeKills = 0;
        questData.slime30QuestClaimed = false;
        questData.introBossParticipated = false;
        questData.bossKilled = false;
        questData.bossQuestClaimed = false;
        localPlayer.saveProfilePatch?.(['questData'], {
            debounceMs: 0,
            reason: 'intro_boss_quest_failed'
        });
        this.game.quests?.restoreFromLegacy?.(questData);
        this.game.ui?.logSystemMessage?.('대왕 슬라임이 사라져 퀘스트가 실패했습니다. 슬라임 30마리 퀘스트부터 다시 진행합니다.');
        this.game.ui?.updateQuestUI?.();
    }

    async restoreAuthoritativeMonstersFromHostSnapshot(options = {}) {
        if (!this.net?.isHost || typeof this.net?.readMonsterHostSnapshot !== 'function') {
            return { restored: 0, updated: 0, removed: 0, total: 0, skipped: true };
        }
        const now = Date.now();
        if (!options.force && this._lastHostSnapshotRestoreTs > 0 && (now - this._lastHostSnapshotRestoreTs) < 600) {
            return { restored: 0, updated: 0, removed: 0, total: 0, skipped: true };
        }
        if (this._hostSnapshotRestorePromise && !options.force) {
            return this._hostSnapshotRestorePromise;
        }

        const restorePromise = (async () => {
            const snapshotData = await this.net.readMonsterHostSnapshot();
            const entries = Object.entries(snapshotData || {}).filter(([id, data]) => {
                if (!id || !data || typeof data !== 'object') return false;
                if (Number(data.hp || 0) <= 0) return false;
                if (data.state === 'dead') return false;
                return true;
            });

            const snapshotIds = new Set(entries.map(([id]) => id));
            let restored = 0;
            let updated = 0;
            let removed = 0;

            if (entries.length > 0) {
                Array.from(this.monsters.keys()).forEach((monsterId) => {
                    const monster = this.monsters.get(monsterId);
                    if (!monster || monster.isLocalOnly || this.tutorialMonsterIds.has(monsterId)) return;
                    if (snapshotIds.has(monsterId)) return;
                    this._removeMonsterLocalState(monsterId);
                    removed += 1;
                });
            }

            for (const [id, data] of entries) {
                const payload = {
                    id,
                    ...data,
                    fullSync: true,
                    immediate: true
                };
                const existing = this.monsters.get(id);
                if (!existing) {
                    await this._onRemoteMonsterAdded(payload);
                    const added = this.monsters.get(id);
                    if (added) {
                        this.monsterRevisionMap.set(id, Math.max(Number(data.rev || 0), Number(this.monsterRevisionMap.get(id) || 0)));
                    }
                    restored += 1;
                    continue;
                }

                this._applyAuthoritativeSnapshotToMonster(existing, payload);
                updated += 1;
            }

            if (entries.length > 0) {
                this.lastSyncState.clear();
                if (!this.net?.shouldUseMonsterQuietMode?.()) {
                    this.forceSyncAll();
                }
            }

            return {
                restored,
                updated,
                removed,
                total: entries.length,
                skipped: false
            };
        })();

        this._hostSnapshotRestorePromise = restorePromise;
        this._lastHostSnapshotRestoreTs = now;

        try {
            return await restorePromise;
        } finally {
            if (this._hostSnapshotRestorePromise === restorePromise) {
                this._hostSnapshotRestorePromise = null;
            }
        }
    }

    async restoreVisibleMonstersFromHostSnapshot(options = {}) {
        if (this.net?.isHost || typeof this.net?.readMonsterHostSnapshot !== 'function') {
            return { restored: 0, updated: 0, removedBosses: 0, total: 0, skipped: true };
        }

        const localPlayer = this.game?.localPlayer;
        if (!localPlayer) {
            return { restored: 0, updated: 0, removedBosses: 0, total: 0, skipped: true };
        }

        const now = Date.now();
        if (!options.force && this._lastGuestSnapshotHydrationTs > 0 && (now - this._lastGuestSnapshotHydrationTs) < 1500) {
            return { restored: 0, updated: 0, removedBosses: 0, total: 0, skipped: true };
        }
        if (this._guestSnapshotHydrationPromise && !options.force) {
            return this._guestSnapshotHydrationPromise;
        }

        const restorePromise = (async () => {
            const anchorCellId = this._getCellIdFromPosition(localPlayer.x, localPlayer.y);
            const neighborhood = Number.isFinite(options.neighborhood) ? Math.max(0, Number(options.neighborhood)) : 1;
            const desiredCells = new Set(this.net?._getFieldCellNeighborhood?.(anchorCellId, neighborhood) || [anchorCellId]);
            const snapshotData = await this.net.readMonsterHostSnapshot();
            const entries = Object.entries(snapshotData || {}).filter(([id, data]) => {
                if (!id || !data || typeof data !== 'object') return false;
                if (Number(data.hp || 0) <= 0) return false;
                if (data.state === 'dead') return false;
                return true;
            });

            let restored = 0;
            let updated = 0;
            let removedBosses = 0;
            const aliveBossIds = new Set();

            for (const [id, data] of entries) {
                const isBoss = !!data.isBoss || data.type === 'king_slime';
                if (isBoss) aliveBossIds.add(id);

                const monsterCellId = typeof data.cellId === 'string'
                    ? data.cellId
                    : this._getCellIdFromPosition(data.x, data.y);
                const shouldHydrate = isBoss || desiredCells.has(monsterCellId);
                if (!shouldHydrate) continue;

                const payload = {
                    id,
                    ...data,
                    fullSync: true,
                    immediate: true
                };
                const existing = this.monsters.get(id);
                if (!existing) {
                    await this._onRemoteMonsterAdded(payload);
                    restored += 1;
                    continue;
                }

                if (!this._shouldAcceptRemoteMonsterUpdate(existing, payload)) continue;
                this._applyAuthoritativeSnapshotToMonster(existing, payload);
                updated += 1;
            }

            Array.from(this.monsters.entries()).forEach(([monsterId, monster]) => {
                if (!monster || (!monster.isBoss && monster.typeId !== 'king_slime')) return;
                if (aliveBossIds.has(monsterId)) return;
                this._removeMonsterLocalState(monsterId);
                removedBosses += 1;
            });

            return {
                restored,
                updated,
                removedBosses,
                total: entries.length,
                skipped: false
            };
        })();

        this._guestSnapshotHydrationPromise = restorePromise;
        this._lastGuestSnapshotHydrationTs = now;

        try {
            return await restorePromise;
        } finally {
            if (this._guestSnapshotHydrationPromise === restorePromise) {
                this._guestSnapshotHydrationPromise = null;
            }
        }
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
            chargeOnly: options.chargeOnly || false, // v0.00.70: chargeOnly 옵션 지원
            rev: this._nextMonsterRevision(id),
            ts: Date.now(),
            state: 'idle',
            cellId: this._getCellIdFromPosition(x, y)
        };

        if (options.tutorialOnly) {
            this.tutorialMonsterIds.add(id);
        }

        await this._onRemoteMonsterAdded({ ...data, fullSync: true, immediate: true });
        if (!this.net?.shouldUseMonsterQuietMode?.()) {
            this.net.sendMonsterUpdate(id, { ...data, fullSync: true, immediate: true });
        }
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

    async _handleBossSpawnRequested({ isFirstBoss = true } = {}) {
        if (!this.net?.isHost) return null;
        if (isFirstBoss) {
            this.firstBossPending = true;
            this.firstBossMissingTimer = 0;
        }

        const bossId = await this._spawnBoss(isFirstBoss);
        if (!bossId) return null;

        if (isFirstBoss) {
            this.slimeKillCount = 0;
            this.net?.dbRef?.child('world_state/slime_kill_count').set(0).catch(() => { });
        }

        return bossId;
    }

    async _spawnBoss(isFirstBoss = true) {
        const authoritativeHostExists = !!(this.net?.connected && !this.net.isHost && this.net.currentHostId && this.net.currentHostId !== this.net.playerId);
        if (authoritativeHostExists) {
            Logger.log('[MonsterManager] Boss spawn ignored on guest; host authority required.');
            return null;
        }

        const existingBoss = Array.from(this.monsters.values()).find((monster) => monster.typeId === 'king_slime' && !monster.isDead);
        if (this.bossSpawned || existingBoss) {
            return null;
        }

        this.bossSpawned = true;
        if (isFirstBoss) {
            this.firstBossPending = true;
            this.firstBossMissingTimer = 0;
        }

        const id = `boss_${Date.now()}`;
        const worldW = this.zone.width || 6400;
        const worldH = this.zone.height || 6400;
        const x = worldW / 2;
        const y = worldH / 2;

        const definition = await this.game.monsterData.loadDefinition('king_slime');
        if (!definition) {
            this.bossSpawned = false;
            if (isFirstBoss) {
                this.firstBossPending = false;
            }
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
            h: definition.visual?.height || 320,
            rev: this._nextMonsterRevision(id),
            ts: Date.now(),
            state: 'idle',
            cellId: this._getCellIdFromPosition(x, y)
        };

        // v0.00.76: Ensure clients know this is a limited pattern boss
        await this._onRemoteMonsterAdded({ ...data, fullSync: true, immediate: true });
        if (!this.net?.shouldUseMonsterQuietMode?.()) {
            this.net.sendMonsterUpdate(id, { ...data, fullSync: true, immediate: true });
        }
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
        if (!data?.id) return;

        const rawTypeId = typeof data.type === 'string'
            ? data.type.trim()
            : (typeof data.typeId === 'string' ? data.typeId.trim() : '');
        if (this.isSpawnSuppressed() && rawTypeId !== 'training_dummy') return;
        if (this.monsters.has(data.id)) return;

        // v0.00.01: Map legacy types or handle direct typeId
        let typeId = rawTypeId || 'slime';
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
            m.targetX = data.x;
            m.targetY = data.y;

            if (data.isBoss || data.type === '대왕 슬라임') {
                m.isBoss = true;
                this.bossSpawned = true;
                // Definition usually handles this, but sync data might override
                m.width = data.w || m.width;
                m.height = data.h || m.height;
            }
            // v0.00.70: chargeOnly 플래그 적용 (돌진 공격만 사용)
            if (data.chargeOnly) {
                m.chargeOnly = true;
            }
            this._applyRemoteMonsterNetworkState(m, data);
            this.monsters.set(data.id, m);
        } catch (e) {
            Logger.warn(`Defaulting to fallback for monster ${data.id} (${typeId})`, e);
            const m = new Monster(data.x, data.y, {});
            m.id = data.id;
            m.hp = data.hp;
            m.maxHp = data.maxHp;
            m.targetX = data.x;
            m.targetY = data.y;
            this._applyRemoteMonsterNetworkState(m, data);
            this.monsters.set(data.id, m);
        }
    }

    _shouldAcceptRemoteMonsterUpdate(monster, data) {
        if (!monster || !data) return false;

        const incomingRev = Number(data.rev || 0);
        const incomingTs = Number(data.ts || 0);
        const currentRev = Number(monster.remoteSyncRev || 0);
        const currentTs = Number(monster.remoteSyncTs || 0);

        if (incomingRev > 0 && currentRev > 0) {
            if (incomingRev < currentRev) return false;
            if (incomingRev === currentRev && incomingTs > 0 && currentTs > 0 && incomingTs <= currentTs) return false;
        } else if (incomingTs > 0 && currentTs > 0 && incomingTs < currentTs) {
            return false;
        }

        return true;
    }

    _applyRemoteMonsterNetworkState(monster, data) {
        if (!monster || !data) return;

        monster.remoteSyncRev = Math.max(Number(monster.remoteSyncRev || 0), Number(data.rev || 0));
        monster.remoteSyncTs = Math.max(Number(monster.remoteSyncTs || 0), Number(data.ts || 0));
        monster.remoteSyncState = data.state || monster.remoteSyncState || 'idle';
        monster.remoteCellId = data.cellId || monster.remoteCellId || this._getCellIdFromPosition(monster.x, monster.y);
        if (data.cellId) {
            this.monsterRegionMap.set(monster.id, data.cellId);
        }

        const nextState = monster.remoteSyncState;
        const hasChargeTarget = Number.isFinite(monster.chargeTarget?.x) && Number.isFinite(monster.chargeTarget?.y);
        if (nextState === 'casting' || nextState === 'charging') {
            monster.chargeState = hasChargeTarget ? nextState : 'idle';
        } else {
            monster.chargeState = 'idle';
            monster.chargeTarget = null;
        }
        monster.isAggro = nextState === 'aggro' || monster.chargeState === 'casting' || monster.chargeState === 'charging';
        if (nextState === 'dead' || monster.hp <= 0) {
            monster.isDead = true;
            monster.hp = 0;
            monster.vx = 0;
            monster.vy = 0;
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
        if (!this._shouldAcceptRemoteMonsterUpdate(m, data)) return;
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

        this._applyRemoteMonsterNetworkState(m, data);
    }

    _onRemoteMonsterRemoved(id) {
        if (this.net.isHost) return;
        this._removeMonsterLocalState(id);
    }

    _clearPlayerTargetIfMatches(monsterOrId) {
        const targetId = typeof monsterOrId === 'string' ? monsterOrId : monsterOrId?.id;
        if (!targetId) return;

        const player = this.game?.localPlayer;
        if (player?.currentTarget && (player.currentTarget.id === targetId || player.currentTarget === monsterOrId)) {
            player.clearCurrentTarget?.();
        }
    }

    _getMonsterParticipantIds(monster, fallbackId = null) {
        const participantIds = new Set();
        if (monster?.damageContributors instanceof Set) {
            monster.damageContributors.forEach((uid) => {
                if (uid) participantIds.add(uid);
            });
        }
        if (fallbackId) participantIds.add(fallbackId);
        if (participantIds.size === 0 && this.net?.playerId) {
            participantIds.add(this.net.playerId);
        }
        return Array.from(participantIds);
    }

    _onMonsterDamageReceived(data) {
        // v0.00.03: Allow ALL clients to process damage events for visual feedback
        // if (!this.net.isHost) return; 
        // v0.29.18: 호스트 자신이 보낸 데미지는 이미 로컬에서 처리했으므로 무시
        if (data.aid === this.net.playerId) return;
        const m = this.monsters.get(data.mid);
        if (m && !m.isDead) {
            m.lastAttackerId = data.aid;
            const impactX = Number.isFinite(data.meta?.impactX) ? data.meta.impactX : null;
            const impactY = Number.isFinite(data.meta?.impactY) ? data.meta.impactY : null;
            m.takeDamage(data.dmg, true, !!data.meta?.isCrit, impactX, impactY, data.meta || null);
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
        this.monsterRegionMap.clear();
        this.monsterRevisionMap.clear();
        this.peerMonsterKeyframeMeta.clear();
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
