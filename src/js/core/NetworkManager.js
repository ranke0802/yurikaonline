import Logger from '../utils/Logger.js';
import EventEmitter from './EventEmitter.js';

export default class NetworkManager extends EventEmitter {
    constructor() {
        super();
        this.connected = false;
        this.roomId = 'zone_1'; // Currently hardcoded zone
        this.playerId = null;
        this.dbRef = null;
        this.zoneParticipationEnabled = true;

        // Remote Players buffer
        this.remotePlayers = new Map();

        // Host Logic
        this.isHost = false;
        this.currentHostId = null;  // v0.00.42: Track current host for anti-cheat
        this.connectedUsers = [];
        this.userLastSeen = new Map();
        this.cleanupTimer = null;

        // Phase 1: Optimized sync settings
        this.lastSyncTime = 0;
        this.syncInterval = 90; // Fast movement sync
        this.walkSyncInterval = 140; // Walking / minor movement sync
        this.idleSyncInterval = 450; // Idle state sync

        // Dynamic Heartbeat Optimization
        this.isPlayerMoving = false;
        this.lastHeartbeatTime = 0;
        this.lastNetworkActivityTime = 0;
        this.sharedHeartbeatInterval = 2500; // Shared field presence must stay tighter than stale cleanup
        this.idleHeartbeatInterval = 8000; // Solo idle can be much cheaper without hurting UX
        this.activeHeartbeatInterval = 6500; // Solo movement still keeps a light heartbeat
        this.backgroundHeartbeatInterval = 12000; // Hidden solo tabs can be even lighter
        this.presenceStaleTimeout = 18000;
        this.sharedGhostTimeout = 15000;
        this.soloGhostTimeout = 12000;
        this.lastPacketData = null;

        // Batch update queue for damage/events
        this.batchQueue = [];
        this.batchInterval = 140; // Wider batch window to reduce write frequency
        this.monsterUpdateQueue = new Map();
        this.monsterUpdateFlushDelay = 90;
        this._monsterUpdateTimer = null;
        this.startBatchProcessor();

        // Lifecycle guards
        this._boundVisibilityChange = this._handleVisibilityChange.bind(this);
        this._hostilityListenerActive = false;
        this._lastHpSync = { hp: null, maxHp: null, ts: 0 };
        this._lastProfileSaveTs = 0;
        this._queuedProfileSaves = new Map();
        this._queuedProfilePatches = new Map();
        this._profileBackupMeta = new Map();
        this._profileBackupPruneMeta = new Map();
        this._zoneUserCache = new Map();
        this._zoneUserListeners = new Map();
        this._zoneUserHydrationMeta = new Map();
        this._presenceCache = new Map();
        this._presenceTsCache = new Map();
        this._networkDropIds = new Set();
        this._lastPresenceLiteState = null;
        this._lastPresenceLiteWriteTs = 0;
        this._fieldPeerCount = 0;
        this._sharedFieldActive = false;
        this._fieldCellSize = 640;
        this._monsterCellListeners = new Map();
        this._subscribedMonsterCells = new Set();
        this._monsterCellPayloadCache = new Map();
        this._monsterPendingRemovalTimers = new Map();
        this._publishedMonsterCellMap = new Map();
        this.syncOptimizationFlags = {
            usePresenceLiteMode: true,
            useFieldRealtimeMode: true,
            useSoloHotWriteGating: true,
            useMonsterQuietMode: true,
            useMonsterCellSync: true,
            useMonsterHostSnapshot: true
        };
    }

    connect(user) {
        if (!user || !window.firebase) return;
        if (this.connected) {
            if (this.playerId === user.uid && this.dbRef) return;
            this.disconnect();
        }

        this.playerId = user.uid;
        this.dbRef = firebase.database().ref(`zones/${this.roomId}`);
        this.connectedUsers = [];
        this.userLastSeen.clear();
        this.remotePlayers.clear();
        this._hostilityListenerActive = false;
        this._lastHpSync = { hp: null, maxHp: null, ts: 0 };
        this._lastProfileSaveTs = 0;
        this._zoneUserCache.clear();
        this._zoneUserHydrationMeta.clear();
        this._profileBackupMeta.clear();
        this._profileBackupPruneMeta.clear();
        this._detachZoneUserListeners();
        this._presenceCache.clear();
        this._presenceTsCache.clear();
        this._networkDropIds.clear();
        this._lastPresenceLiteState = null;
        this._lastPresenceLiteWriteTs = 0;
        this._fieldPeerCount = 0;
        this._sharedFieldActive = false;
        this.startBatchProcessor();

        Logger.log(`Network Coordinates: connecting to ${this.roomId}...`);

        this.dbRef.child('presence').on('child_added', (snapshot) => this._handlePresenceSnapshot(snapshot));
        this.dbRef.child('presence').on('child_changed', (snapshot) => this._handlePresenceSnapshot(snapshot));
        this.dbRef.child('presence').on('child_removed', (snapshot) => this._handlePresenceRemoved(snapshot));
        this.dbRef.child('presence_ts').on('child_added', (snapshot) => this._handlePresenceTsSnapshot(snapshot));
        this.dbRef.child('presence_ts').on('child_changed', (snapshot) => this._handlePresenceTsSnapshot(snapshot));
        this.dbRef.child('presence_ts').on('child_removed', (snapshot) => this._handlePresenceTsRemoved(snapshot));

        // 1. Listen for other players moving
        this.dbRef.child('users').on('child_added', (snapshot) => this._onPlayerAdded(snapshot));
        this.dbRef.child('users').on('child_removed', (snapshot) => this._onPlayerRemoved(snapshot));

        // Monster Sync
        if (this.shouldUseMonsterCellSync()) {
            this._refreshMonsterCellSubscriptions(this._resolveMonsterSubscriptionAnchorCellId());
        } else {
            this.dbRef.child('monsters').on('child_added', (s) => {
                this._emitMonsterAddedEvent(s.key, s.val());
            });
            this.dbRef.child('monsters').on('child_changed', (s) => {
                this.emit('monsterUpdated', { id: s.key, ...s.val() });
            });
            this.dbRef.child('monsters').on('child_removed', (s) => {
                this._emitMonsterRemovedEvent(s.key, s.val());
            });
        }

        // v0.33.0: Monster Attack Sync (Boss Skills)
        this.dbRef.child('monster_attack').on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // Ignore old attacks (> 5s)
                if (Date.now() - data.ts < 5000) {
                    this.emit('monsterAttack', data);

                    // v0.00.57: Audio Triggers
                    if (window.game && window.game.sound) {
                        if (data.skill === 'charge') {
                            window.game.sound.playSfx('monster_charge');
                        } else if (data.skill === 'roar') {
                            window.game.sound.playSfx('boss_spawn'); // Reusing boss_spawn/roar sound
                        }
                    }
                }
            }
            // Host cleans up
            if (this.isHost) snapshot.ref.remove();
        });

        // Monster Damage Sync (Listen for damage events - Spark / Text)
        // v0.00.57: Support both single (legacy) and batched updates
        const handleMonsterDamage = (data) => {
            if (!data) return;
            this.emit('monsterDamageReceived', data);
            if (this.isHost) {
                this.emit('monsterDamage', {
                    monsterId: data.mid,
                    damage: data.dmg,
                    attackerId: data.aid,
                    meta: data.meta || null
                });
            }
        };

        this.dbRef.child('monster_damage').on('child_added', (snapshot) => {
            handleMonsterDamage(snapshot.val());
            if (this.isHost) snapshot.ref.remove();
        });

        this.dbRef.child('monster_damage_batch').on('child_added', (snapshot) => {
            const batch = snapshot.val();
            if (batch && batch.items && Array.isArray(batch.items)) {
                // Check if batch is too old (> 5s)
                if (Date.now() - batch.ts < 5000) {
                    batch.items.forEach(item => handleMonsterDamage(item));
                }
            }
            if (this.isHost) snapshot.ref.remove();
        });

        // Player Damage Sync (PvP)
        const handlePlayerDamage = (data) => {
            if (data) this.emit('playerDamageReceived', data);
        };

        this.dbRef.child('player_damage').on('child_added', (snapshot) => {
            handlePlayerDamage(snapshot.val());
            if (this.isHost) snapshot.ref.remove();
        });

        this.dbRef.child('player_damage_batch').on('child_added', (snapshot) => {
            const batch = snapshot.val();
            if (batch && batch.items && Array.isArray(batch.items)) {
                if (Date.now() - batch.ts < 5000) {
                    batch.items.forEach(item => handlePlayerDamage(item));
                }
            }
            if (this.isHost) snapshot.ref.remove();
        });

        // v0.00.42: Anti-cheat defense variables
        this._rewardCount = 0;
        this._rewardResetTime = Date.now();
        const MAX_REWARDS_PER_MIN = 100;  // Max 100 rewards per minute
        const MAX_EXP_PER_REWARD = 2000;  // Max exp per single reward
        const MAX_GOLD_PER_REWARD = 2000; // Max gold per single reward

        // Reward Sync (Guest side listens for rewards targeting them)
        this.dbRef.child(`rewards/${this.playerId}`).on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // v0.00.42: Anti-cheat validation
                // 1. Check if reward is from legitimate host
                if (!data.hostId || data.hostId !== this.currentHostId) {
                    Logger.warn('[AntiCheat] Rejected reward from non-host:', data.hostId);
                    snapshot.ref.remove();
                    return;
                }

                // 2. Rate limit check
                const now = Date.now();
                if (now - this._rewardResetTime > 60000) {
                    this._rewardCount = 0;
                    this._rewardResetTime = now;
                }
                this._rewardCount++;
                if (this._rewardCount > MAX_REWARDS_PER_MIN) {
                    Logger.warn('[AntiCheat] Too many rewards, ignoring:', this._rewardCount);
                    snapshot.ref.remove();
                    return;
                }

                // 3. Sanity check on reward amounts (skip for quest rewards)
                if (!data.questKill) {
                    if (data.exp && data.exp > MAX_EXP_PER_REWARD) {
                        Logger.warn('[AntiCheat] EXP too high:', data.exp);
                        data.exp = MAX_EXP_PER_REWARD;
                    }
                    if (data.gold && data.gold > MAX_GOLD_PER_REWARD) {
                        Logger.warn('[AntiCheat] Gold too high:', data.gold);
                        data.gold = MAX_GOLD_PER_REWARD;
                    }
                }

                // 4. Timestamp check (reject old rewards > 10s)
                if (data.ts && (now - data.ts > 10000)) {
                    Logger.warn('[AntiCheat] Stale reward rejected:', data.ts);
                    snapshot.ref.remove();
                    return;
                }

                this.emit('rewardReceived', data);
            }
            // Cleanup: Reward collected
            snapshot.ref.remove();
        });

        // Drop Sync
        this.dbRef.child('drops').on('child_added', (s) => {
            this._networkDropIds.add(s.key);
            this.emit('dropAdded', { id: s.key, ...s.val() });
        });
        this.dbRef.child('drops').on('child_removed', (s) => {
            this._networkDropIds.delete(s.key);
            this.emit('dropRemoved', s.key);
        });

        // Drop Collection Listener (Host only)
        this.dbRef.child('drop_collection').on('child_added', (snapshot) => {
            if (!this.isHost) return;
            const data = snapshot.val();
            if (data) {
                this.emit('dropCollectionRequested', {
                    dropId: data.did,
                    collectorId: data.cid
                });
            }
            snapshot.ref.remove();
        });

        this.dbRef.child('boss_spawn_requests').on('child_added', (snapshot) => {
            if (!this.isHost) return;
            const data = snapshot.val();
            if (data) {
                this.emit('bossSpawnRequested', {
                    requestId: snapshot.key,
                    requesterId: data.requesterId || null,
                    isFirstBoss: data.isFirstBoss !== false,
                    ts: Number(data.ts || Date.now())
                });
            }
            snapshot.ref.remove();
        });

        // 2. presence check
        const myRef = this.dbRef.child(`users/${this.playerId}`);
        const presenceRef = this.dbRef.child(`presence/${this.playerId}`);
        const presenceTsRef = this.dbRef.child(`presence_ts/${this.playerId}`);
        // Commented out to allow position persistence on refresh.
        // Stale users are cleaned up by Host after 5 minutes of inactivity.
        // chat Sync
        this.dbRef.child('chat').on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (!data || typeof data.ts !== 'number' || typeof data.text !== 'string') {
                if (this.isHost) snapshot.ref.remove();
                return;
            }
            if (data && data.ts > Date.now() - 30000) { // Only recent chats
                this.emit('chatReceived', data);
            }
            // Host cleans up old chats
            if (this.isHost) {
                const now = Date.now();
                if (now - data.ts > 60000) snapshot.ref.remove();
            }
        });

        // v0.00.43: System Message Listener (Center Screen Warnings)
        this.dbRef.child('system_messages').on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (!data || typeof data.ts !== 'number' || typeof data.message !== 'string') {
                if (this.isHost) snapshot.ref.remove();
                return;
            }
            if (data && data.ts > Date.now() - 5000) { // Only very recent (5s)
                this.emit('systemMessage', data);
            }
            if (this.isHost) snapshot.ref.remove(); // Immediate cleanup
        });

        // v0.00.03: Failsafe exit logic
        myRef.onDisconnect().remove();
        presenceRef.onDisconnect().remove();
        presenceTsRef.onDisconnect().remove();

        this.connected = true;
        this.emit('connected');
        this._refreshSharedFieldState();
        if (this.isSharedFieldActive()) {
            this._publishLocalRealtimeSnapshot('connect');
        } else {
            this._publishPresenceLite({ force: true, reason: 'connect' });
            this._writePresenceTsOnly('connect');
        }

        // v0.00.04: Heartbeat is now the primary presence method
        this._startLocalGhostCleanup();

        // v0.00.23: Dynamic Heartbeat (idle detection handled in sendHeartbeat)
        if (this._hbInterval) clearInterval(this._hbInterval);
        this._hbInterval = setInterval(() => {
            this._dynamicHeartbeat();
        }, 1000); // Check every 1s, but actual send is throttled

        this._setupPartyListeners();
        this._setupDamageListeners(); // v0.00.14: PvP Damage
        // this._setupHostilityListeners(); // Moved to WorldScene to ensure localPlayer exists
        this._setupEmoteListeners(); // v2.1

        // v0.35.1: Mobile Background Reconnection Support
        document.removeEventListener('visibilitychange', this._boundVisibilityChange);
        document.addEventListener('visibilitychange', this._boundVisibilityChange);

        Logger.log('Connected to Game Zone.');
    }

    isZoneParticipationEnabled() {
        return this.zoneParticipationEnabled;
    }

    setZoneParticipationEnabled(enabled) {
        const nextState = !!enabled;
        if (this.zoneParticipationEnabled === nextState) return;

        this.zoneParticipationEnabled = nextState;
        this.lastPacketData = null;
        this.isPlayerMoving = false;

        if (!nextState) {
            if (this.playerId) {
                this.connectedUsers = this.connectedUsers.filter((uid) => uid !== this.playerId);
                this.userLastSeen.delete(this.playerId);
                this._presenceCache.delete(this.playerId);
                this._presenceTsCache.delete(this.playerId);
            }

            if (this.isHost) {
                this.isHost = false;
                this.emit('hostChanged', false);
                this._stopCleanupLoop();
            }

            if (this.dbRef && this.playerId) {
                this.dbRef.child(`users/${this.playerId}`).remove().catch(() => { });
                this.dbRef.child(`presence/${this.playerId}`).remove().catch(() => { });
                this.dbRef.child(`presence_ts/${this.playerId}`).remove().catch(() => { });
            }

            this._fieldPeerCount = 0;
            this._sharedFieldActive = false;
            this.lastPacketData = null;
            this._clearMonsterCellSubscriptions({ emitRemovals: true });
        } else {
            this._publishPresenceLite({ force: true, reason: 'zone_reenabled' });
            this._refreshMonsterCellSubscriptions(this._resolveMonsterSubscriptionAnchorCellId());
            this.sendHeartbeat();
        }
    }

    /**
     * Phase 1: Batch processor for damage/events
     */
    startBatchProcessor() {
        if (this._batchTimer) clearInterval(this._batchTimer);
        this._batchTimer = setInterval(() => this.flushBatchQueue(), this.batchInterval);
    }

    stopBatchProcessor() {
        if (this._batchTimer) {
            clearInterval(this._batchTimer);
            this._batchTimer = null;
        }
    }

    queueBatchUpdate(type, data) {
        this.batchQueue.push({ type, data, ts: Date.now() });
        this._markNetworkActivity();
    }

    async flushBatchQueue() {
        if (this.batchQueue.length === 0 || !this.connected) return;

        const batch = this.batchQueue.splice(0, this.batchQueue.length);
        const updates = {};

        // Group by type for efficient updates
        const grouped = batch.reduce((acc, item) => {
            if (!acc[item.type]) acc[item.type] = [];
            acc[item.type].push(item.data);
            return acc;
        }, {});

        // Create batched updates
        Object.entries(grouped).forEach(([type, items]) => {
            const batchId = Date.now();
            updates[`${type}_batch/${batchId}`] = {
                items: items.slice(0, 10), // Max 10 items per batch
                count: items.length,
                ts: batchId
            };
        });

        try {
            this._recordNetworkWrite('batchUpdate', updates, Object.keys(updates).length);
            await this.dbRef.update(updates);
        } catch (e) {
            Logger.error('Batch update failed:', e);
        }
    }

    disconnect() {
        this.flushQueuedProfileSaves().catch(() => { });
        this.flushQueuedProfilePatches().catch(() => { });
        if (this._hbInterval) {
            clearInterval(this._hbInterval);
            this._hbInterval = null;
        }
        if (this._localCleanupTimer) {
            clearInterval(this._localCleanupTimer);
            this._localCleanupTimer = null;
        }
        if (this._monsterUpdateTimer) {
            clearTimeout(this._monsterUpdateTimer);
            this._monsterUpdateTimer = null;
        }
        this._stopCleanupLoop();
        this.stopBatchProcessor();
        this.batchQueue.length = 0;
        this.monsterUpdateQueue.clear();
        document.removeEventListener('visibilitychange', this._boundVisibilityChange);
        this._detachAllDbListeners();

        if (this.playerId && this.dbRef) {
            this.dbRef.child(`users/${this.playerId}`).remove().catch(() => { });
            this.dbRef.child(`presence/${this.playerId}`).remove().catch(() => { });
            this.dbRef.child(`presence_ts/${this.playerId}`).remove().catch(() => { });
        }

        this.connected = false;
        this.isHost = false;
        this.currentHostId = null;
        this.connectedUsers = [];
        this.userLastSeen.clear();
        this.remotePlayers.clear();
        this._hostilityListenerActive = false;
        this._lastHpSync = { hp: null, maxHp: null, ts: 0 };
        this._zoneUserCache.clear();
        this._zoneUserHydrationMeta.clear();
        this._detachZoneUserListeners();
        this._presenceCache.clear();
        this._presenceTsCache.clear();
        this._lastPresenceLiteState = null;
        this._lastPresenceLiteWriteTs = 0;
        this._fieldPeerCount = 0;
        this._sharedFieldActive = false;
        this._clearMonsterCellSubscriptions({ emitRemovals: true });
        this._clearPendingMonsterRemovalTimers();
        this._monsterCellPayloadCache.clear();
        this._publishedMonsterCellMap.clear();
        this.lastPacketData = null;
        this.lastSyncTime = 0;
        this.lastHeartbeatTime = 0;
        this.playerId = null;
        this.dbRef = null;
    }

    _detachAllDbListeners() {
        if (!this.dbRef) return;

        const fixedPaths = [
            'presence',
            'presence_ts',
            'users',
            'monsters',
            'monster_attack',
            'monster_damage',
            'monster_damage_batch',
            'player_damage',
            'player_damage_batch',
            'drops',
            'drop_collection',
            'boss_spawn_requests',
            'chat',
            'system_messages',
            'emotes'
        ];
        fixedPaths.forEach(path => this.dbRef.child(path).off());
        this._clearMonsterCellSubscriptions({ emitRemovals: true });

        if (!this.playerId) return;
        const playerPaths = [
            `presence/${this.playerId}`,
            `presence_ts/${this.playerId}`,
            `rewards/${this.playerId}`,
            `party_invites/${this.playerId}`,
            `party_responses/${this.playerId}`,
            `damage_events/${this.playerId}`,
            `users/${this.playerId}/hostility_inbox`,
            `users/${this.playerId}/party_inbox`
        ];
        playerPaths.forEach(path => this.dbRef.child(path).off());
    }

    _detachZoneUserListeners(uid = null) {
        if (uid) {
            const listeners = this._zoneUserListeners.get(uid) || [];
            listeners.forEach(({ ref, callback }) => ref.off('value', callback));
            this._zoneUserListeners.delete(uid);
            return;
        }

        this._zoneUserListeners.forEach((listeners, targetUid) => {
            listeners.forEach(({ ref, callback }) => ref.off('value', callback));
            this._zoneUserListeners.delete(targetUid);
        });
    }

    _normalizeFieldId(fieldId) {
        return String(fieldId || this.roomId || 'zone_1');
    }

    _getCurrentFieldId() {
        const zoneFieldId = window.game?.zone?.currentZone?.id;
        return this._normalizeFieldId(zoneFieldId);
    }

    _getFieldCellId(x = null, y = null) {
        const player = window.game?.localPlayer;
        const cellSize = Math.max(128, this._fieldCellSize || 640);
        const nextX = Number.isFinite(x) ? x : Number(player?.x || 0);
        const nextY = Number.isFinite(y) ? y : Number(player?.y || 0);
        return `${Math.floor(nextX / cellSize)}_${Math.floor(nextY / cellSize)}`;
    }

    _parseFieldCellId(cellId) {
        if (typeof cellId !== 'string') return null;
        const [xRaw, yRaw] = cellId.split('_');
        const x = Number(xRaw);
        const y = Number(yRaw);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y };
    }

    _getFieldCellNeighborhood(cellId, range = 1) {
        const parsed = this._parseFieldCellId(cellId);
        if (!parsed) return [];

        const cells = [];
        for (let dy = -range; dy <= range; dy++) {
            for (let dx = -range; dx <= range; dx++) {
                cells.push(`${parsed.x + dx}_${parsed.y + dy}`);
            }
        }
        return cells;
    }

    _resolveMonsterSubscriptionAnchorCellId(options = {}) {
        if (Number.isFinite(options.x) || Number.isFinite(options.y)) {
            return this._getFieldCellId(options.x, options.y);
        }
        const player = window.game?.localPlayer;
        if (!player) return null;
        return this._getFieldCellId(player.x, player.y);
    }

    shouldUseMonsterCellSync() {
        return !!this.syncOptimizationFlags.useMonsterCellSync;
    }

    shouldUseMonsterHostSnapshot() {
        return !!this.syncOptimizationFlags.useMonsterHostSnapshot;
    }

    _buildPresenceAppearance(player) {
        if (!player) return null;
        return {
            weaponType: player.equipment?.weapon?.type || player.equipment?.weapon?.id || null,
            hat: player.equipment?.armor?.type || player.equipment?.armor?.id || null
        };
    }

    _buildPresenceLitePayload(options = {}) {
        const player = window.game?.localPlayer || null;
        const now = options.ts || Date.now();
        const x = Number.isFinite(options.x) ? options.x : Number(player?.x || 0);
        const y = Number.isFinite(options.y) ? options.y : Number(player?.y || 0);
        const fieldId = options.fieldId || this._getCurrentFieldId();
        const peerCount = Math.max(0, Number(this._fieldPeerCount || 0));
        const mode = (this.syncOptimizationFlags.useFieldRealtimeMode && peerCount > 0)
            ? 'shared_realtime'
            : 'presence_lite';

        return {
            fieldId,
            cellId: this._getFieldCellId(x, y),
            mode,
            ts: now,
            name: player?.name || player?.displayName || 'Unknown',
            level: Number(player?.level || 1),
            appearance: this._buildPresenceAppearance(player)
        };
    }

    _publishPresenceLite(options = {}) {
        if (!this.connected || !this.playerId || !this.dbRef || !this.zoneParticipationEnabled) return;
        if (!this.syncOptimizationFlags.usePresenceLiteMode) return;

        const now = Date.now();
        const nextPayload = this._buildPresenceLitePayload({ ...options, ts: now });
        const force = !!options.force;
        const last = this._lastPresenceLiteState;
        const changed = !last
            || last.fieldId !== nextPayload.fieldId
            || last.cellId !== nextPayload.cellId
            || last.mode !== nextPayload.mode
            || last.name !== nextPayload.name
            || last.level !== nextPayload.level
            || JSON.stringify(last.appearance || null) !== JSON.stringify(nextPayload.appearance || null);
        const shouldWrite = force || changed;
        if (!shouldWrite) return;

        this._recordNetworkWrite('presenceLite', nextPayload);
        this.dbRef.child(`presence/${this.playerId}`).set(nextPayload).catch(() => { });
        this._lastPresenceLiteState = nextPayload;
        this._lastPresenceLiteWriteTs = now;
        this._refreshMonsterCellSubscriptions(this._resolveMonsterSubscriptionAnchorCellId(options));
    }

    _normalizePresenceSnapshot(uid, value) {
        if (!uid || !value || typeof value !== 'object') return null;
        const cachedTs = Number(this._presenceTsCache.get(uid) || 0);
        const snapshotTs = Number(value.ts || 0);
        return {
            uid,
            fieldId: this._normalizeFieldId(value.fieldId),
            cellId: typeof value.cellId === 'string' ? value.cellId : '0_0',
            mode: value.mode === 'shared_realtime' ? 'shared_realtime' : 'presence_lite',
            ts: cachedTs > 0 ? cachedTs : snapshotTs,
            name: value.name || 'Unknown',
            level: Number(value.level || 1)
        };
    }

    _isMeaningfulPlayerName(name) {
        if (typeof name !== 'string') return false;
        const trimmed = name.trim();
        return !!trimmed && trimmed.toLowerCase() !== 'unknown';
    }

    _getBestKnownRemoteName(uid, ...candidates) {
        for (const candidate of candidates) {
            if (this._isMeaningfulPlayerName(candidate)) {
                return candidate.trim();
            }
        }

        const state = this._zoneUserCache.get(uid) || {};
        if (this._isMeaningfulPlayerName(state.profile?.name)) {
            return state.profile.name.trim();
        }

        const posName = Array.isArray(state.p) ? state.p[5] : state.p?.n;
        if (this._isMeaningfulPlayerName(posName)) {
            return posName.trim();
        }

        const presenceName = this._presenceCache.get(uid)?.name;
        if (this._isMeaningfulPlayerName(presenceName)) {
            return presenceName.trim();
        }

        return 'Unknown';
    }

    getBestKnownRemoteName(uid, ...candidates) {
        return this._getBestKnownRemoteName(uid, ...candidates);
    }

    _requestZoneUserHydration(uid, reason = 'presence_hydration') {
        if (!this.dbRef || !uid || uid === this.playerId) return Promise.resolve(null);

        const now = Date.now();
        const existingMeta = this._zoneUserHydrationMeta.get(uid);
        if (existingMeta?.pending && existingMeta.promise) {
            return existingMeta.promise;
        }
        if (existingMeta && (now - existingMeta.ts) < 1500) {
            return existingMeta.promise || Promise.resolve(null);
        }

        const promise = this.dbRef.child(`users/${uid}`).once('value')
            .then((snapshot) => {
                const value = snapshot.val();
                if (!value) return null;

                const nextState = this._normalizeZoneUserSnapshot(value);
                const mergedState = {
                    ...(this._zoneUserCache.get(uid) || {}),
                    ...nextState
                };

                this._zoneUserCache.set(uid, mergedState);
                this._registerConnectedUser(uid);
                this.userLastSeen.set(uid, this._resolveZoneUserActivityTs(mergedState));
                this._attachZoneUserHotPathListeners(uid, mergedState);

                const remote = this._ensureRemotePlayerBuffered(uid, { emitTransientState: true });
                if (remote) {
                    this._emitRemoteProfileUpdate(uid, mergedState.profile || {}, mergedState.hostility);
                    if (mergedState.p) {
                        this._handleZoneUserPositionValue(uid, mergedState.p);
                    }
                }

                return mergedState;
            })
            .catch((error) => {
                Logger.warn(`[Network] Failed to hydrate zone user ${uid} (${reason})`, error);
                return null;
            })
            .finally(() => {
                this._zoneUserHydrationMeta.set(uid, {
                    ts: Date.now(),
                    pending: false,
                    promise: null,
                    reason
                });
            });

        this._zoneUserHydrationMeta.set(uid, {
            ts: now,
            pending: true,
            promise,
            reason
        });

        return promise;
    }

    _isPresenceEntryActive(entry, now = Date.now()) {
        if (!entry) return false;
        const ts = Number(entry.ts || 0);
        return ts > 0 && (now - ts) < this.presenceStaleTimeout;
    }

    _emitFieldPeerPresenceChanged(uid, previousEntry, nextEntry) {
        if (!uid || uid === this.playerId) return;

        const fieldId = this._getCurrentFieldId();
        const now = Date.now();
        const prevActiveSameField = !!previousEntry
            && this._isPresenceEntryActive(previousEntry, now)
            && previousEntry.fieldId === fieldId;
        const nextActiveSameField = !!nextEntry
            && this._isPresenceEntryActive(nextEntry, now)
            && nextEntry.fieldId === fieldId;

        let reason = null;
        if (!prevActiveSameField && nextActiveSameField) {
            reason = 'peer_joined_field';
        } else if (prevActiveSameField && !nextActiveSameField) {
            reason = 'peer_left_field';
        } else if (prevActiveSameField && nextActiveSameField && previousEntry?.cellId !== nextEntry?.cellId) {
            reason = 'peer_cell_changed';
        } else if (prevActiveSameField && nextActiveSameField && previousEntry?.mode !== nextEntry?.mode) {
            reason = 'peer_mode_changed';
        }

        if (!reason) return;

        this.emit('fieldPeerPresenceChanged', {
            uid,
            fieldId,
            reason,
            previousEntry: previousEntry || null,
            entry: nextEntry || null
        });

        const remote = this.remotePlayers.get(uid) || null;
        if (nextActiveSameField && (!remote || !this._isMeaningfulPlayerName(remote.name))) {
            this._requestZoneUserHydration(uid, reason);
        }
    }

    _handlePresenceSnapshot(snapshot) {
        const uid = snapshot?.key;
        const entry = this._normalizePresenceSnapshot(uid, snapshot?.val());
        if (!uid || !entry) return;
        const previousEntry = this._presenceCache.get(uid) || null;
        const presenceTs = this._sanitizeActivityTs(entry.ts || Date.now());
        this._presenceCache.set(uid, entry);
        this._registerConnectedUser(uid);
        this.userLastSeen.set(uid, presenceTs);
        const existing = this.remotePlayers.get(uid);
        if (existing) {
            existing.ts = presenceTs;
            if (!this._isMeaningfulPlayerName(existing.name) && this._isMeaningfulPlayerName(entry.name)) {
                existing.name = entry.name.trim();
                this.emit('playerUpdate', { id: uid, name: existing.name });
            }
        }
        this._emitFieldPeerPresenceChanged(uid, previousEntry, entry);
        this._refreshSharedFieldState();
        this._checkHostStatus();
    }

    _handlePresenceTsSnapshot(snapshot) {
        const uid = snapshot?.key;
        const rawTs = Number(snapshot?.val() || 0);
        if (!uid || !rawTs) return;

        const presenceTs = this._sanitizeActivityTs(rawTs);
        const previousEntry = this._presenceCache.get(uid) || null;
        const nextEntry = previousEntry
            ? { ...previousEntry, ts: presenceTs }
            : null;

        this._presenceTsCache.set(uid, presenceTs);
        this._registerConnectedUser(uid);
        this.userLastSeen.set(uid, presenceTs);

        const existing = this.remotePlayers.get(uid);
        if (existing) {
            existing.ts = presenceTs;
            if (!this._isMeaningfulPlayerName(existing.name)) {
                const resolvedName = this._getBestKnownRemoteName(uid, existing.name);
                if (this._isMeaningfulPlayerName(resolvedName)) {
                    existing.name = resolvedName;
                    this.emit('playerUpdate', { id: uid, name: existing.name });
                }
            }
        } else if (nextEntry) {
            this._ensureRemotePlayerBuffered(uid, { emitTransientState: true });
        }

        if (!nextEntry) {
            this._checkHostStatus();
            return;
        }

        this._presenceCache.set(uid, nextEntry);
        this._emitFieldPeerPresenceChanged(uid, previousEntry, nextEntry);
        this._refreshSharedFieldState();
        this._checkHostStatus();
    }

    _handlePresenceTsRemoved(snapshot) {
        const uid = snapshot?.key;
        if (!uid) return;

        this._presenceTsCache.delete(uid);
        this.userLastSeen.delete(uid);

        const previousEntry = this._presenceCache.get(uid) || null;
        if (!previousEntry) {
            this._checkHostStatus();
            return;
        }

        const nextEntry = { ...previousEntry, ts: 0 };
        this._presenceCache.set(uid, nextEntry);
        this._emitFieldPeerPresenceChanged(uid, previousEntry, nextEntry);
        this._refreshSharedFieldState();
        this._checkHostStatus();
    }

    _handlePresenceRemoved(snapshot) {
        const uid = snapshot?.key;
        if (!uid) return;
        const previousEntry = this._presenceCache.get(uid) || null;
        this._presenceCache.delete(uid);
        this._presenceTsCache.delete(uid);
        this.connectedUsers = this.connectedUsers.filter((id) => id !== uid);
        this.connectedUsers.sort();
        this.userLastSeen.delete(uid);
        this._emitFieldPeerPresenceChanged(uid, previousEntry, null);
        this._removeRemoteIfOutOfField(uid, null);
        this._refreshSharedFieldState();
        this._checkHostStatus();
    }

    _removeRemoteIfOutOfField(uid, presenceEntry) {
        if (!uid || uid === this.playerId) return;
        const currentFieldId = this._getCurrentFieldId();
        const hasPresence = !!presenceEntry;
        const active = hasPresence ? this._isPresenceEntryActive(presenceEntry) : false;
        const sameField = hasPresence ? presenceEntry.fieldId === currentFieldId : true;
        if (hasPresence && active && sameField) return;
        if (!this.remotePlayers.has(uid)) return;

        this.remotePlayers.delete(uid);
        this.emit('playerLeft', uid);
    }

    _refreshSharedFieldState() {
        const fieldId = this._getCurrentFieldId();
        const now = Date.now();
        let peerCount = 0;

        this._presenceCache.forEach((entry, uid) => {
            if (!entry || uid === this.playerId) return;
            if (!this._isPresenceEntryActive(entry, now)) return;
            if (entry.fieldId !== fieldId) return;
            peerCount += 1;
        });

        this._presenceCache.forEach((entry, uid) => {
            this._removeRemoteIfOutOfField(uid, entry);
        });

        const nextActive = this.zoneParticipationEnabled
            && this.syncOptimizationFlags.useFieldRealtimeMode
            && peerCount > 0;

        if (this._fieldPeerCount !== peerCount) {
            this._fieldPeerCount = peerCount;
            this.emit('fieldPeerCountChanged', {
                fieldId,
                peerCount
            });
        }

        if (this._sharedFieldActive !== nextActive) {
            const previousActive = this._sharedFieldActive;
            this._sharedFieldActive = nextActive;
            this.emit('sharedFieldChanged', {
                fieldId,
                active: nextActive,
                previousActive,
                peerCount
            });

            if (nextActive) {
                this._publishLocalRealtimeSnapshot('shared_field_join');
            } else {
                this.lastPacketData = null;
            }
        }

        this._publishPresenceLite({ force: false, fieldId });
    }

    getSameFieldPeerCount() {
        return this._fieldPeerCount;
    }

    isSharedFieldActive() {
        return !!this._sharedFieldActive;
    }

    _shouldSendRealtimeUserState() {
        if (!this.zoneParticipationEnabled) return false;
        if (!this.syncOptimizationFlags.useSoloHotWriteGating) return true;
        return this.isSharedFieldActive();
    }

    shouldUseMonsterQuietMode() {
        if (!this.zoneParticipationEnabled) return false;
        if (!this.syncOptimizationFlags.useMonsterQuietMode) return false;
        return !this.isSharedFieldActive();
    }

    getSyncModeSnapshot() {
        return {
            fieldId: this._getCurrentFieldId(),
            peerCount: this._fieldPeerCount,
            sharedFieldActive: this.isSharedFieldActive(),
            monsterQuietMode: this.shouldUseMonsterQuietMode(),
            zoneParticipationEnabled: this.zoneParticipationEnabled
        };
    }

    _buildLocalZoneProfileSnapshot(player) {
        if (!player) return null;
        return {
            name: player.name || 'Unknown',
            level: Number(player.level || 1),
            equipment: player.equipment || null,
            party: player.party || null,
            hostility: player.hostilityTargets
                ? Object.fromEntries(player.hostilityTargets.entries())
                : (player.hostility || {}),
            defense: Number(player.defense || 0),
            isPaused: !!player.isPaused,
            protectedUntil: player.spawnProtectionTimer > 0
                ? Date.now() + Math.round(player.spawnProtectionTimer * 1000)
                : 0
        };
    }

    _publishLocalRealtimeSnapshot(reason = 'shared_field_sync') {
        if (!this.connected || !this.playerId || !this.dbRef || !this.zoneParticipationEnabled) return;

        const player = window.game?.localPlayer || null;
        const now = Date.now();
        const updates = {};

        if (player) {
            const safeX = Math.round(player.x || 0);
            const safeY = Math.round(player.y || 0);
            const safeVx = parseFloat(((player.vx || 0)).toFixed(2));
            const safeVy = parseFloat(((player.vy || 0)).toFixed(2));
            updates[`users/${this.playerId}/p/x`] = safeX;
            updates[`users/${this.playerId}/p/y`] = safeY;
            updates[`users/${this.playerId}/p/vx`] = safeVx;
            updates[`users/${this.playerId}/p/vy`] = safeVy;
            updates[`users/${this.playerId}/p/ts`] = now;
            updates[`users/${this.playerId}/p/n`] = player.name || 'Unknown';
            updates[`users/${this.playerId}/h`] = [
                Math.round(player.hp || 0),
                Math.round(player.maxHp || 0),
                now
            ];

            const zoneProfile = this._buildLocalZoneProfileSnapshot(player);
            if (zoneProfile) {
                updates[`users/${this.playerId}/profile`] = zoneProfile;
            }

            this.lastPacketData = {
                x: safeX,
                y: safeY,
                vx: safeVx,
                vy: safeVy,
                name: player.name || 'Unknown'
            };
            this._lastHpSync = {
                hp: Math.round(player.hp || 0),
                maxHp: Math.round(player.maxHp || 0),
                ts: now
            };
        }

        this._recordNetworkWrite('realtimeBootstrap', { reason, updates });
        this.dbRef.update(updates).catch(() => { });
        this._commitLocalSelfHeartbeat(now);
        this._markNetworkActivity(now);
        this._publishPresenceLite({ force: true, reason });
        this._writePresenceHeartbeatFallback({ reason: `${reason}_bootstrap`, includePresenceLiteTs: false });
    }

    _commitLocalSelfHeartbeat(now = Date.now()) {
        if (!this.playerId) return;
        this.lastHeartbeatTime = now;
        this._registerConnectedUser(this.playerId);
        this.userLastSeen.set(this.playerId, now);
        this._presenceTsCache.set(this.playerId, now);
        this._checkHostStatus();
    }

    _writePresenceTsOnly(reason = 'heartbeat') {
        if (!this.connected || !this.playerId || !this.dbRef || !this.zoneParticipationEnabled) return;
        const includePresenceLiteTs = this.isSharedFieldActive() || this._fieldPeerCount > 0;
        this._writePresenceHeartbeatFallback({ reason, includePresenceLiteTs });
    }

    _writePresenceHeartbeatFallback({ reason = 'heartbeat', includePresenceLiteTs = true } = {}) {
        if (!this.connected || !this.playerId || !this.dbRef || !this.zoneParticipationEnabled) return;

        const now = Date.now();
        const fallbackUpdates = {};
        if (includePresenceLiteTs || this._lastPresenceLiteState) {
            fallbackUpdates[`presence/${this.playerId}/ts`] = firebase.database.ServerValue.TIMESTAMP;
        }

        if (Object.keys(fallbackUpdates).length > 0) {
            this._recordNetworkWrite('presenceHeartbeatFallback', { reason, paths: Object.keys(fallbackUpdates) });
            this.dbRef.update(fallbackUpdates).catch((error) => {
                Logger.warn('[Network] Failed to update presence heartbeat fallback', error);
            });
        }

        this.dbRef.child(`presence_ts/${this.playerId}`).set(firebase.database.ServerValue.TIMESTAMP).catch((error) => {
            Logger.warn('[Network] Failed to update presence_ts heartbeat', error);
        });

        this._commitLocalSelfHeartbeat(now);
        this._markNetworkActivity(now);
    }

    sendHeartbeat() {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        this._publishPresenceLite({ force: false, reason: 'heartbeat' });
        this._writePresenceTsOnly('heartbeat');
    }

    _markNetworkActivity(ts = Date.now()) {
        this.lastNetworkActivityTime = Math.max(this.lastNetworkActivityTime || 0, ts);
    }

    _recordNetworkWrite(kind, payload, count = 1) {
        window.game?.recordNetworkWrite?.(kind, payload, count);
    }

    _extractPresenceTs(value) {
        if (!value || typeof value !== 'object') return 0;
        return value?.presence?.ts || value?.lastSeen || value?.ts || 0;
    }

    _extractPositionData(value) {
        if (!value) return null;
        if (Array.isArray(value)) return value;
        if (typeof value !== 'object') return null;
        if (value.p) return value.p;
        if (value[0] !== undefined) return [value[0], value[1], value[2], value[3], value[4], value[5]];
        if (value.x !== undefined && value.y !== undefined) {
            return { x: value.x, y: value.y, vx: value.vx, vy: value.vy, ts: value.ts, n: value.n };
        }
        return null;
    }

    _normalizeZoneUserSnapshot(value) {
        const normalized = {};
        const posData = this._extractPositionData(value);
        if (posData) normalized.p = posData;

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            if (value.profile) normalized.profile = value.profile;
            if (value.h && Array.isArray(value.h)) normalized.h = value.h;
            if (value.a && Array.isArray(value.a)) normalized.a = value.a;
            if (value.ch && Array.isArray(value.ch)) normalized.ch = value.ch;
            if (value.hostility !== undefined) normalized.hostility = value.hostility;
        }

        return normalized;
    }

    _getZoneUserCache(uid) {
        let cache = this._zoneUserCache.get(uid);
        if (!cache) {
            cache = {};
            this._zoneUserCache.set(uid, cache);
        }
        return cache;
    }

    _mergeZoneUserCache(uid, patch) {
        const cache = this._getZoneUserCache(uid);
        Object.entries(patch || {}).forEach(([key, value]) => {
            if (value === undefined || value === null) {
                delete cache[key];
            } else {
                cache[key] = value;
            }
        });
        return cache;
    }

    _registerConnectedUser(uid) {
        if (!uid || this.connectedUsers.includes(uid)) return;
        this.connectedUsers.push(uid);
        this.connectedUsers.sort();
    }

    _sanitizeActivityTs(ts) {
        const nextTs = Number(ts) || 0;
        if (!nextTs || nextTs < Date.now() - 100000) return Date.now();
        return nextTs;
    }

    _resolveZoneUserActivityTs(state = {}) {
        const posData = state.p;
        let ts = 0;

        if (posData) {
            ts = Array.isArray(posData) ? (posData[4] || 0) : (posData.ts || 0);
        }

        return this._sanitizeActivityTs(ts);
    }

    _buildRemotePlayerFromCache(uid) {
        const state = this._zoneUserCache.get(uid);
        if (!state || !state.p) return null;

        const posData = state.p;
        const profile = state.profile || {};
        const ts = this._resolveZoneUserActivityTs(state);

        let x = 0;
        let y = 0;
        let vx = 0;
        let vy = 0;
        let fallbackName = this._getBestKnownRemoteName(uid);

        if (Array.isArray(posData)) {
            x = posData[0] ?? 0;
            y = posData[1] ?? 0;
            vx = posData[2] ?? 0;
            vy = posData[3] ?? 0;
            fallbackName = this._getBestKnownRemoteName(uid, posData[5], fallbackName);
        } else {
            x = posData.x ?? 0;
            y = posData.y ?? 0;
            vx = posData.vx ?? 0;
            vy = posData.vy ?? 0;
            fallbackName = this._getBestKnownRemoteName(uid, posData.n, fallbackName);
        }

        return {
            id: uid,
            x,
            y,
            vx,
            vy,
            ts,
            name: this._getBestKnownRemoteName(uid, profile.name, fallbackName),
            h: state.h,
            a: state.a,
            level: profile.level || 1,
            defense: profile.defense ?? 0,
            isPaused: !!profile.isPaused,
            protectedUntil: Number(profile.protectedUntil || 0),
            equipment: profile.equipment || null,
            party: profile.party || null,
            hostility: profile.hostility || state.hostility || {}
        };
    }

    _emitRemoteAttack(uid, attackData) {
        if (!Array.isArray(attackData)) return;
        const attackTs = attackData[0];
        if (attackTs <= Date.now() - 10000) return;

        const now = Date.now();
        const existing = this.remotePlayers.get(uid);
        if (existing) existing.ts = now;
        this.userLastSeen.set(uid, now);

        this.emit('playerAttack', {
            id: uid,
            ts: attackTs,
            x: attackData[1],
            y: attackData[2],
            dir: attackData[3],
            skillType: attackData[4] || 'normal',
            extraData: attackData[5] || null
        });
    }

    _emitRemoteChanneling(uid, channelData) {
        if (!Array.isArray(channelData)) return;
        const channelTs = channelData[0];
        if (channelTs <= Date.now() - 5000) return;

        this.emit('playerChanneling', {
            id: uid,
            ts: channelTs,
            skillType: channelData[1]
        });
    }

    _emitRemoteHpUpdate(uid, hpData) {
        if (!Array.isArray(hpData)) return;

        const now = Date.now();
        const existing = this.remotePlayers.get(uid);
        if (existing) {
            existing.h = hpData;
            existing.ts = now;
        }
        this.userLastSeen.set(uid, now);

        this.emit('playerHpUpdate', {
            id: uid,
            hp: hpData[0],
            maxHp: hpData[1],
            ts: hpData[2]
        });
    }

    _ensureRemotePlayerBuffered(uid, options = {}) {
        if (!uid || uid === this.playerId) return null;

        const existing = this.remotePlayers.get(uid);
        if (existing) return existing;

        const newPlayer = this._buildRemotePlayerFromCache(uid);
        if (!newPlayer) return null;

        this.remotePlayers.set(uid, newPlayer);
        this.emit('playerJoined', newPlayer);
        this.emit('playerUpdate', {
            id: uid,
            x: newPlayer.x,
            y: newPlayer.y,
            vx: newPlayer.vx || 0,
            vy: newPlayer.vy || 0,
            ts: newPlayer.ts,
            name: newPlayer.name,
            level: newPlayer.level,
            defense: newPlayer.defense,
            isPaused: newPlayer.isPaused,
            equipment: newPlayer.equipment,
            party: newPlayer.party,
            hostility: newPlayer.hostility
        });

        if (options.emitTransientState) {
            if (newPlayer.h) this._emitRemoteHpUpdate(uid, newPlayer.h);
            if ((this._zoneUserCache.get(uid) || {}).a) this._emitRemoteAttack(uid, this._zoneUserCache.get(uid).a);
            if ((this._zoneUserCache.get(uid) || {}).ch) this._emitRemoteChanneling(uid, this._zoneUserCache.get(uid).ch);
        }

        if (!this._isMeaningfulPlayerName(newPlayer.name)) {
            this._requestZoneUserHydration(uid, 'buffered_unknown_name');
        }

        return newPlayer;
    }

    _emitRemoteProfileUpdate(uid, profile, hostilityOverride = undefined) {
        const existing = this.remotePlayers.get(uid);
        if (!existing) return;

        const hostility = hostilityOverride !== undefined ? hostilityOverride : (profile.hostility !== undefined ? profile.hostility : existing.hostility);
        existing.name = this._getBestKnownRemoteName(uid, profile.name, existing.name);
        if (profile.level !== undefined) existing.level = profile.level;
        if (profile.defense !== undefined) existing.defense = profile.defense;
        if (profile.isPaused !== undefined) existing.isPaused = !!profile.isPaused;
        if (profile.protectedUntil !== undefined) existing.protectedUntil = Number(profile.protectedUntil) || 0;
        if (profile.equipment !== undefined) existing.equipment = profile.equipment;
        if (profile.party !== undefined) existing.party = profile.party;
        if (hostility !== undefined) existing.hostility = hostility;

        this.emit('playerUpdate', {
            id: uid,
            name: existing.name,
            level: existing.level,
            defense: existing.defense,
            isPaused: existing.isPaused,
            protectedUntil: existing.protectedUntil || 0,
            equipment: existing.equipment,
            party: existing.party,
            hostility: existing.hostility
        });
    }

    _handleZoneUserPositionValue(uid, posData) {
        if (!posData) return;
        const state = this._mergeZoneUserCache(uid, { p: posData });
        const ts = this._resolveZoneUserActivityTs(state);
        this.userLastSeen.set(uid, ts);

        const existing = this._ensureRemotePlayerBuffered(uid, { emitTransientState: true });
        if (!existing) return;

        const update = { id: uid, ts };
        existing.ts = ts;

        if (Array.isArray(posData)) {
            update.x = posData[0];
            update.y = posData[1];
            update.vx = posData[2];
            update.vy = posData[3];
            update.name = posData[5];
            existing.x = update.x;
            existing.y = update.y;
        } else {
            if (posData.x !== undefined) { update.x = posData.x; existing.x = posData.x; }
            if (posData.y !== undefined) { update.y = posData.y; existing.y = posData.y; }
            if (posData.vx !== undefined) update.vx = posData.vx;
            if (posData.vy !== undefined) update.vy = posData.vy;
            if (posData.n !== undefined) {
                update.name = posData.n;
            }
        }

        const resolvedName = this._getBestKnownRemoteName(uid, update.name, existing.name);
        existing.name = resolvedName;
        update.name = resolvedName;

        this.emit('playerUpdate', update);
    }

    _handleZoneUserProfileValue(uid, profile) {
        if (!profile || typeof profile !== 'object') return;
        const state = this._mergeZoneUserCache(uid, { profile });
        this._ensureRemotePlayerBuffered(uid, { emitTransientState: true });
        this._emitRemoteProfileUpdate(uid, state.profile || {});
    }

    _handleZoneUserHostilityValue(uid, hostility) {
        const state = this._mergeZoneUserCache(uid, { hostility });
        this._ensureRemotePlayerBuffered(uid, { emitTransientState: true });
        this._emitRemoteProfileUpdate(uid, state.profile || {}, state.hostility || {});
    }

    _handleZoneUserAttackValue(uid, attackData) {
        if (!Array.isArray(attackData)) return;
        this._mergeZoneUserCache(uid, { a: attackData });
        this._ensureRemotePlayerBuffered(uid, { emitTransientState: false });
        this._emitRemoteAttack(uid, attackData);
    }

    _handleZoneUserChannelValue(uid, channelData) {
        if (!Array.isArray(channelData)) return;
        this._mergeZoneUserCache(uid, { ch: channelData });
        this._ensureRemotePlayerBuffered(uid, { emitTransientState: false });
        this._emitRemoteChanneling(uid, channelData);
    }

    _handleZoneUserHpValue(uid, hpData) {
        if (!Array.isArray(hpData)) return;
        this._mergeZoneUserCache(uid, { h: hpData });
        this._ensureRemotePlayerBuffered(uid, { emitTransientState: false });
        this._emitRemoteHpUpdate(uid, hpData);
    }

    _handleZoneUserFieldValue(uid, fieldKey, value) {
        if (!uid || uid === this.playerId) return;

        switch (fieldKey) {
            case 'p':
                this._handleZoneUserPositionValue(uid, value);
                break;
            case 'profile':
                this._handleZoneUserProfileValue(uid, value);
                break;
            case 'hostility':
                this._handleZoneUserHostilityValue(uid, value);
                break;
            case 'a':
                this._handleZoneUserAttackValue(uid, value);
                break;
            case 'ch':
                this._handleZoneUserChannelValue(uid, value);
                break;
            case 'h':
                this._handleZoneUserHpValue(uid, value);
                break;
            default:
                break;
        }
    }

    _attachZoneUserHotPathListeners(uid, initialState = {}) {
        if (!this.dbRef || !uid || uid === this.playerId) return;

        this._detachZoneUserListeners(uid);

        const userRef = this.dbRef.child(`users/${uid}`);
        const listeners = [];
        const watchKeys = ['p', 'profile', 'hostility', 'a', 'ch', 'h'];

        watchKeys.forEach((fieldKey) => {
            let skipInitial = Object.prototype.hasOwnProperty.call(initialState, fieldKey);
            const ref = userRef.child(fieldKey);
            const callback = (snapshot) => {
                if (skipInitial) {
                    skipInitial = false;
                    return;
                }
                this._handleZoneUserFieldValue(uid, fieldKey, snapshot.val());
            };

            ref.on('value', callback);
            listeners.push({ ref, callback });
        });

        this._zoneUserListeners.set(uid, listeners);
    }

    _buildZoneProfileSnapshot(profile) {
        if (!profile) return null;
        return {
            name: profile.name || 'Unknown',
            level: profile.level || 1,
            equipment: profile.equipment || null,
            party: profile.party || null,
            hostility: profile.hostility || {},
            defense: profile.defense ?? 0,
            isPaused: !!profile.isPaused,
            protectedUntil: Number(profile.protectedUntil || 0)
        };
    }

    _buildZoneProfilePatch(patch) {
        if (!patch || typeof patch !== 'object') return null;
        const zonePatch = {};

        if (patch.name !== undefined) zonePatch.name = patch.name || 'Unknown';
        if (patch.level !== undefined) zonePatch.level = Number(patch.level || 1);
        if (patch.equipment !== undefined) zonePatch.equipment = patch.equipment || null;
        if (patch.party !== undefined) zonePatch.party = patch.party || null;
        if (patch.hostility !== undefined) zonePatch.hostility = patch.hostility || {};
        if (patch.defense !== undefined) zonePatch.defense = Number(patch.defense || 0);
        if (patch.isPaused !== undefined) zonePatch.isPaused = !!patch.isPaused;
        if (patch.protectedUntil !== undefined) zonePatch.protectedUntil = Number(patch.protectedUntil || 0);

        return Object.keys(zonePatch).length > 0 ? zonePatch : null;
    }

    _buildMonsterRealtimeCellPayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;
        const nextPayload = { ...payload };
        delete nextPayload.cellId;
        return nextPayload;
    }

    _decorateMonsterCellPayload(cellId, payload) {
        if (!payload || typeof payload !== 'object') return null;
        return {
            ...payload,
            cellId: typeof payload.cellId === 'string' ? payload.cellId : cellId
        };
    }

    _getMoveSyncInterval(vx = 0, vy = 0) {
        const speed = Math.hypot(vx || 0, vy || 0);
        if (speed <= 0.1) return this.idleSyncInterval;
        if (speed < 90) return this.walkSyncInterval;
        return this.syncInterval;
    }

    isUserActivelyPresent(uid, options = {}) {
        if (!uid) return false;
        if (uid === this.playerId) return !!this.connected;

        const now = Date.now();
        const maxAgeMs = Number.isFinite(options.maxAgeMs)
            ? Math.max(500, Number(options.maxAgeMs))
            : Math.max(4000, Math.min(this.sharedGhostTimeout || 15000, 6500));
        const lastSeen = Number(this.userLastSeen.get(uid) || 0);
        const listed = this.connectedUsers.includes(uid);

        if (!listed) return false;
        if (lastSeen <= 0) return true;

        return (now - lastSeen) <= maxAgeMs;
    }

    /**
     * v0.00.23: Dynamic heartbeat - reduces frequency when idle
     */
    _dynamicHeartbeat() {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        const now = Date.now();
        const isBackgrounded = typeof document !== 'undefined' && document.hidden;
        const isSharedField = this.isSharedFieldActive();
        const interval = isBackgrounded
            ? this.backgroundHeartbeatInterval
            : (isSharedField
                ? this.sharedHeartbeatInterval
                : (this.isPlayerMoving ? this.activeHeartbeatInterval : this.idleHeartbeatInterval));

        if (!isBackgrounded && !isSharedField) {
            const recentActivityWindow = Math.max(1500, Math.floor(interval * 0.75));
            if (now - this.lastNetworkActivityTime < recentActivityWindow) {
                this._checkHostStatus();
                return;
            }
        }

        if (now - this.lastHeartbeatTime >= interval) {
            this.sendHeartbeat();
        }

        // Always check host status
        this._checkHostStatus();
    }

    _startLocalGhostCleanup() {
        if (this._localCleanupTimer) clearInterval(this._localCleanupTimer);
        this._localCleanupTimer = setInterval(() => {
            const now = Date.now();
            const ghostTimeout = this.isSharedFieldActive() ? this.sharedGhostTimeout : this.soloGhostTimeout;

            this.remotePlayers.forEach((rp, uid) => {
                const lastSeen = Math.max(Number(rp?.ts || 0), Number(this.userLastSeen.get(uid) || 0));
                if (now - lastSeen > ghostTimeout) {
                    Logger.warn(`[Presence] Removing timed-out user: ${uid}, LastSeen: ${lastSeen}, Now: ${now}, Diff: ${now - lastSeen}`);
                    this.remotePlayers.delete(uid);
                    this.emit('playerLeft', uid);
                } else if (rp && lastSeen > Number(rp.ts || 0)) {
                    rp.ts = lastSeen;
                }
            });
        }, 2000); // Check every 2s
    }

    // --- Event Registration Helpers (v0.18.1 Fix) ---
    onRemoteMonsterAdded(callback) { this.on('monsterAdded', callback); }
    onRemoteMonsterUpdated(callback) { this.on('monsterUpdated', callback); }
    onRemoteMonsterRemoved(callback) { this.on('monsterRemoved', callback); }
    onMonsterDamageReceived(callback) { this.on('monsterDamageReceived', callback); }
    onDropAdded(callback) { this.on('dropAdded', callback); }
    onDropRemoved(callback) { this.on('dropRemoved', callback); }
    onDropCollectionRequested(callback) { this.on('dropCollectionRequested', callback); }

    _handleBossMonsterAudio(type, action = 'spawn') {
        if (type !== 'king_slime' || !window.game?.sound) return;
        if (action === 'spawn') {
            window.game.sound.loadAndPlayBgm('bgm_boss');
            window.game.sound.playSfx('boss_spawn');
            return;
        }
        window.game.sound.loadAndPlayBgm('bgm_cabin');
    }

    _emitMonsterAddedEvent(id, payload) {
        if (!id || !payload || typeof payload !== 'object') return;
        this.emit('monsterAdded', { id, ...payload });
        this._handleBossMonsterAudio(payload.type, 'spawn');
    }

    _emitMonsterRemovedEvent(id, payload = null) {
        if (!id) return;
        this.emit('monsterRemoved', id);
        this._handleBossMonsterAudio(payload?.type, 'remove');
    }

    _clearPendingMonsterRemoval(monsterId) {
        const timer = this._monsterPendingRemovalTimers.get(monsterId);
        if (timer) {
            clearTimeout(timer);
            this._monsterPendingRemovalTimers.delete(monsterId);
        }
    }

    _clearPendingMonsterRemovalTimers() {
        this._monsterPendingRemovalTimers.forEach((timer) => clearTimeout(timer));
        this._monsterPendingRemovalTimers.clear();
    }

    _onMonsterCellAdded(cellId, snapshot) {
        const monsterId = snapshot?.key;
        const payload = this._decorateMonsterCellPayload(cellId, snapshot?.val());
        if (!monsterId || !payload || typeof payload !== 'object') return;

        this._clearPendingMonsterRemoval(monsterId);
        const previous = this._monsterCellPayloadCache.get(monsterId) || null;
        this._monsterCellPayloadCache.set(monsterId, { cellId, payload });

        if (!previous) {
            this._emitMonsterAddedEvent(monsterId, payload);
            return;
        }

        this.emit('monsterUpdated', { id: monsterId, ...payload });
    }

    _onMonsterCellChanged(cellId, snapshot) {
        const monsterId = snapshot?.key;
        const payload = this._decorateMonsterCellPayload(cellId, snapshot?.val());
        if (!monsterId || !payload || typeof payload !== 'object') return;

        this._clearPendingMonsterRemoval(monsterId);
        const previous = this._monsterCellPayloadCache.get(monsterId) || null;
        this._monsterCellPayloadCache.set(monsterId, { cellId, payload });

        if (!previous) {
            this._emitMonsterAddedEvent(monsterId, payload);
            return;
        }

        this.emit('monsterUpdated', { id: monsterId, ...payload });
    }

    _onMonsterCellRemoved(cellId, snapshot) {
        const monsterId = snapshot?.key;
        if (!monsterId) return;

        const previous = this._monsterCellPayloadCache.get(monsterId) || null;
        if (!previous || previous.cellId !== cellId) return;

        const payload = snapshot?.val() || previous.payload || null;
        this._clearPendingMonsterRemoval(monsterId);

        const timer = setTimeout(() => {
            this._monsterPendingRemovalTimers.delete(monsterId);
            const latest = this._monsterCellPayloadCache.get(monsterId) || null;
            if (!latest || latest.cellId !== cellId) return;

            this._monsterCellPayloadCache.delete(monsterId);
            this._emitMonsterRemovedEvent(monsterId, payload || latest.payload || null);
        }, 160);

        this._monsterPendingRemovalTimers.set(monsterId, timer);
    }

    _attachMonsterCellListener(cellId) {
        if (!this.dbRef || !cellId || this._monsterCellListeners.has(cellId)) return;

        const ref = this.dbRef.child(`monster_cells/${cellId}`);
        const added = (snapshot) => this._onMonsterCellAdded(cellId, snapshot);
        const changed = (snapshot) => this._onMonsterCellChanged(cellId, snapshot);
        const removed = (snapshot) => this._onMonsterCellRemoved(cellId, snapshot);

        ref.on('child_added', added);
        ref.on('child_changed', changed);
        ref.on('child_removed', removed);

        this._monsterCellListeners.set(cellId, {
            ref,
            added,
            changed,
            removed
        });
        this._subscribedMonsterCells.add(cellId);
    }

    _detachMonsterCellListener(cellId) {
        const listener = this._monsterCellListeners.get(cellId);
        if (!listener) return;

        listener.ref.off('child_added', listener.added);
        listener.ref.off('child_changed', listener.changed);
        listener.ref.off('child_removed', listener.removed);
        this._monsterCellListeners.delete(cellId);
        this._subscribedMonsterCells.delete(cellId);
    }

    _pruneMonsterCellCacheOutsideSubscriptions() {
        if (this.isHost) return;

        this._monsterCellPayloadCache.forEach((entry, monsterId) => {
            if (!entry || this._subscribedMonsterCells.has(entry.cellId)) return;
            this._clearPendingMonsterRemoval(monsterId);
            this._monsterCellPayloadCache.delete(monsterId);
            this.emit('monsterRemoved', monsterId);
        });
    }

    _clearMonsterCellSubscriptions({ emitRemovals = false } = {}) {
        Array.from(this._monsterCellListeners.keys()).forEach((cellId) => this._detachMonsterCellListener(cellId));
        this._clearPendingMonsterRemovalTimers();

        if (emitRemovals && !this.isHost) {
            Array.from(this._monsterCellPayloadCache.keys()).forEach((monsterId) => {
                this.emit('monsterRemoved', monsterId);
            });
        }

        this._monsterCellPayloadCache.clear();
        this._subscribedMonsterCells.clear();
    }

    _refreshMonsterCellSubscriptions(anchorCellId = null) {
        if (!this.shouldUseMonsterCellSync()) {
            this._clearMonsterCellSubscriptions({ emitRemovals: true });
            return;
        }
        if (!this.connected || !this.dbRef || !this.zoneParticipationEnabled) return;

        const nextAnchor = anchorCellId || this._resolveMonsterSubscriptionAnchorCellId();
        if (!nextAnchor) return;

        const desiredCells = new Set(this._getFieldCellNeighborhood(nextAnchor, 1));
        Array.from(this._subscribedMonsterCells)
            .filter((cellId) => !desiredCells.has(cellId))
            .forEach((cellId) => this._detachMonsterCellListener(cellId));
        desiredCells.forEach((cellId) => this._attachMonsterCellListener(cellId));
        this._pruneMonsterCellCacheOutsideSubscriptions();
    }

    async readMonsterHostSnapshot() {
        if (!this.connected || !this.dbRef || !this.shouldUseMonsterHostSnapshot()) {
            return {};
        }

        try {
            const snapshot = await this.dbRef.child('monster_host_snapshot').once('value');
            return snapshot.val() || {};
        } catch (error) {
            Logger.error('Failed to read monster host snapshot:', error);
            return {};
        }
    }

    getUserRootRef(uid) {
        return uid && window.firebase ? firebase.database().ref(`users/${uid}`) : null;
    }

    getProfileRef(uid) {
        return uid && window.firebase ? firebase.database().ref(`users/${uid}/profile`) : null;
    }

    async getPlayerProfile(uid) {
        if (!uid || !window.firebase) return null;
        try {
            const snapshot = await this.getProfileRef(uid)?.once('value');
            return snapshot?.val() || null;
        } catch (e) {
            Logger.error('Failed to get player profile', e);
            return null;
        }
    }

    getProfileBackupsRef(uid) {
        return uid && window.firebase ? firebase.database().ref(`users/${uid}/profileBackups`) : null;
    }

    _cloneProfileData(data) {
        if (!data) return null;
        try {
            return JSON.parse(JSON.stringify(data));
        } catch (error) {
            Logger.error('Failed to clone profile data', error);
            return null;
        }
    }

    _normalizeProfileSnapshot(data, fallbackTs = Date.now()) {
        const snapshot = this._cloneProfileData(data) || {};
        const existingTs = Number(snapshot.ts || 0);
        snapshot.ts = existingTs > 0 ? existingTs : fallbackTs;
        return snapshot;
    }

    async getLatestProfileSnapshot(uid) {
        if (!uid || !window.firebase) return null;

        try {
            const [profileSnapshot, backupSnapshot] = await Promise.all([
                this.getProfileRef(uid)?.once('value'),
                this.getProfileBackupsRef(uid)?.orderByChild('ts').limitToLast(1).once('value')
            ]);

            const profile = profileSnapshot?.val() || null;
            const normalizedProfile = profile ? this._normalizeProfileSnapshot(profile) : null;

            let latestBackup = null;
            backupSnapshot?.forEach((child) => {
                latestBackup = { id: child.key, ...(child.val() || {}) };
            });

            const backupProfile = latestBackup?.profile
                ? this._normalizeProfileSnapshot(latestBackup.profile, latestBackup.ts || Date.now())
                : null;

            if (backupProfile && (!normalizedProfile || (backupProfile.ts || 0) > (normalizedProfile.ts || 0))) {
                return {
                    profile: backupProfile,
                    ts: backupProfile.ts || 0,
                    source: 'backup',
                    backupId: latestBackup.id || null
                };
            }

            if (normalizedProfile) {
                return {
                    profile: normalizedProfile,
                    ts: normalizedProfile.ts || 0,
                    source: 'profile',
                    backupId: null
                };
            }

            return null;
        } catch (error) {
            Logger.error('Failed to get latest profile snapshot', error);
            return null;
        }
    }

    async archiveLatestProfile(uid, options = {}) {
        if (!uid || !window.firebase) return { ok: false, reason: 'invalid_args' };

        try {
            const latestSnapshot = await this.getLatestProfileSnapshot(uid);
            if (!latestSnapshot?.profile) {
                return { ok: false, reason: 'profile_missing' };
            }

            const backupId = await this._writeProfileBackup(uid, latestSnapshot.profile, {
                keepCount: options.keepBackupCount || 20,
                reason: options.reason || 'profile_archive',
                sourceUid: options.sourceUid || uid,
                sourceTs: options.sourceTs || latestSnapshot.ts || latestSnapshot.profile.ts || Date.now()
            });

            return {
                ok: true,
                backupId,
                snapshot: latestSnapshot
            };
        } catch (error) {
            Logger.error('Failed to archive latest profile', error);
            return { ok: false, reason: 'archive_failed', error };
        }
    }

    async _writeProfileBackup(uid, profile, options = {}) {
        const backupsRef = this.getProfileBackupsRef(uid);
        if (!backupsRef || !profile) return null;

        const keepCount = Math.max(5, options.keepCount || 20);
        const reason = options.reason || 'profile_save';
        if (!this._shouldWriteProfileBackup(uid, reason)) {
            return null;
        }

        const createdAt = Date.now();
        const backupRef = backupsRef.push();
        const backupPayload = {
            ts: Number(profile.ts || createdAt),
            createdAt,
            reason,
            sourceUid: options.sourceUid || uid,
            sourceTs: Number(options.sourceTs || profile.ts || createdAt),
            profile: this._cloneProfileData(profile)
        };

        this._recordNetworkWrite('profileBackup', backupPayload);
        await backupRef.set(backupPayload);

        if (this._shouldPruneProfileBackups(uid, reason)) {
            const existingSnapshot = await backupsRef.once('value');
            const backups = [];
            existingSnapshot.forEach((child) => {
                const value = child.val() || {};
                backups.push({
                    id: child.key,
                    ts: Number(value.ts || 0)
                });
            });

            if (backups.length > keepCount) {
                const staleRemovals = backups
                    .sort((a, b) => a.ts - b.ts)
                    .slice(0, backups.length - keepCount)
                    .map((entry) => backupsRef.child(entry.id).remove());
                await Promise.all(staleRemovals);
            }
        }

        return backupRef.key;
    }

    _shouldWriteProfileBackup(uid, reason = 'profile_save') {
        if (!uid) return false;
        if (reason !== 'profile_save') {
            this._profileBackupMeta.set(uid, { ts: Date.now(), reason });
            return true;
        }

        const now = Date.now();
        const minimumIntervalMs = this.isSharedFieldActive() ? 120000 : 180000;
        const previous = this._profileBackupMeta.get(uid);
        if (previous && (now - previous.ts) < minimumIntervalMs) {
            return false;
        }

        this._profileBackupMeta.set(uid, { ts: now, reason });
        return true;
    }

    _shouldPruneProfileBackups(uid, reason = 'profile_save') {
        if (!uid) return false;
        if (reason !== 'profile_save') {
            this._profileBackupPruneMeta.set(uid, Date.now());
            return true;
        }

        const now = Date.now();
        const previous = this._profileBackupPruneMeta.get(uid) || 0;
        const minimumIntervalMs = 10 * 60 * 1000;
        if ((now - previous) < minimumIntervalMs) {
            return false;
        }

        this._profileBackupPruneMeta.set(uid, now);
        return true;
    }

    async getPlayerData(uid) {
        if (!uid || !window.firebase) return null;
        try {
            // v0.00.03: Unify with AuthManager root path
            const snapshot = await firebase.database().ref(`users/${uid}`).once('value');
            return snapshot.val();
        } catch (e) {
            Logger.error('Failed to get player data', e);
            return null;
        }
    }

    _mergeProfileData(baseData = {}, patchData = {}) {
        const merged = this._cloneProfileData(baseData) || {};
        const nextPatch = this._cloneProfileData(patchData) || {};

        Object.entries(nextPatch).forEach(([key, value]) => {
            if (
                value
                && typeof value === 'object'
                && !Array.isArray(value)
                && merged[key]
                && typeof merged[key] === 'object'
                && !Array.isArray(merged[key])
            ) {
                merged[key] = {
                    ...merged[key],
                    ...value
                };
                return;
            }

            merged[key] = value;
        });

        return merged;
    }

    async savePlayerData(uid, data, syncToZone = false, options = {}) {
        const debounceMs = Number(options.debounceMs || 0);
        let patchWaiters = null;
        if (this._queuedProfilePatches.has(uid)) {
            const queuedPatch = this._queuedProfilePatches.get(uid);
            if (queuedPatch?.timer) clearTimeout(queuedPatch.timer);
            this._queuedProfilePatches.delete(uid);
            data = this._mergeProfileData(data, queuedPatch?.patch || {});
            syncToZone = syncToZone || !!queuedPatch?.syncToZone;
            patchWaiters = queuedPatch?.waiters || null;
        }

        if (debounceMs > 0 && !options.forceImmediate) {
            const savePromise = this._queueProfileSave(uid, data, syncToZone, options);
            if (patchWaiters?.length) {
                savePromise.then((result) => {
                    patchWaiters.forEach(({ resolve }) => resolve(result));
                }).catch((error) => {
                    patchWaiters.forEach(({ reject }) => reject(error));
                });
            }
            return savePromise;
        }

        let pendingWaiters = null;
        if (this._queuedProfileSaves.has(uid)) {
            const queued = this._queuedProfileSaves.get(uid);
            if (queued?.timer) clearTimeout(queued.timer);
            this._queuedProfileSaves.delete(uid);
            pendingWaiters = queued?.waiters || null;
            syncToZone = syncToZone || !!queued?.syncToZone;
        }

        const result = await this._commitPlayerData(uid, data, syncToZone, options);
        pendingWaiters?.forEach(({ resolve }) => resolve(result));
        patchWaiters?.forEach(({ resolve }) => resolve(result));
        return result;
    }

    async savePlayerDataPatch(uid, patchData, options = {}) {
        if (!uid || !window.firebase || !patchData || typeof patchData !== 'object') {
            return { ok: false, reason: 'invalid_args' };
        }

        if (this._queuedProfileSaves.has(uid)) {
            const queued = this._queuedProfileSaves.get(uid);
            queued.data = this._mergeProfileData(queued.data || {}, patchData);
            queued.syncToZone = queued.syncToZone || !!options.syncToZone;
            return new Promise((resolve, reject) => {
                queued.waiters.push({ resolve, reject });
            });
        }

        const debounceMs = Number(options.debounceMs || 0);
        if (debounceMs > 0 && !options.forceImmediate) {
            return this._queueProfilePatch(uid, patchData, options);
        }

        let pendingWaiters = null;
        let mergedPatch = patchData;
        if (this._queuedProfilePatches.has(uid)) {
            const queued = this._queuedProfilePatches.get(uid);
            if (queued?.timer) clearTimeout(queued.timer);
            this._queuedProfilePatches.delete(uid);
            pendingWaiters = queued?.waiters || null;
            mergedPatch = this._mergeProfileData(queued?.patch || {}, patchData);
        }

        const result = await this._commitPlayerDataPatch(uid, mergedPatch, options);
        pendingWaiters?.forEach(({ resolve }) => resolve(result));
        return result;
    }

    _queueProfileSave(uid, data, syncToZone = false, options = {}) {
        if (!uid || !window.firebase || !data) {
            return Promise.resolve({ ok: false, reason: 'invalid_args' });
        }

        const debounceMs = Math.max(100, Number(options.debounceMs || 0));
        const existing = this._queuedProfileSaves.get(uid) || {
            data: null,
            syncToZone: false,
            options: {},
            timer: null,
            waiters: []
        };

        existing.data = data;
        existing.syncToZone = existing.syncToZone || syncToZone;
        existing.options = { ...existing.options, ...options, debounceMs };

        if (existing.timer) clearTimeout(existing.timer);

        const promise = new Promise((resolve, reject) => {
            existing.waiters.push({ resolve, reject });
        });

        existing.timer = setTimeout(async () => {
            try {
                const result = await this._flushQueuedProfileSave(uid);
                return result;
            } catch (error) {
                Logger.error('Queued profile save failed', error);
            }
        }, debounceMs);

        this._queuedProfileSaves.set(uid, existing);
        return promise;
    }

    _queueProfilePatch(uid, patchData, options = {}) {
        if (!uid || !window.firebase || !patchData || typeof patchData !== 'object') {
            return Promise.resolve({ ok: false, reason: 'invalid_args' });
        }

        const debounceMs = Math.max(100, Number(options.debounceMs || 0));
        const existing = this._queuedProfilePatches.get(uid) || {
            patch: null,
            syncToZone: false,
            options: {},
            timer: null,
            waiters: []
        };

        existing.patch = this._mergeProfileData(existing.patch || {}, patchData);
        existing.syncToZone = existing.syncToZone || !!options.syncToZone;
        existing.options = { ...existing.options, ...options, debounceMs };

        if (existing.timer) clearTimeout(existing.timer);

        const promise = new Promise((resolve, reject) => {
            existing.waiters.push({ resolve, reject });
        });

        existing.timer = setTimeout(async () => {
            try {
                const result = await this._flushQueuedProfilePatch(uid);
                return result;
            } catch (error) {
                Logger.error('Queued profile patch failed', error);
            }
        }, debounceMs);

        this._queuedProfilePatches.set(uid, existing);
        return promise;
    }

    async _flushQueuedProfileSave(uid) {
        const entry = this._queuedProfileSaves.get(uid);
        if (!entry) return { ok: false, reason: 'queue_missing' };

        if (entry.timer) clearTimeout(entry.timer);
        this._queuedProfileSaves.delete(uid);

        try {
            const result = await this._commitPlayerData(uid, entry.data, entry.syncToZone, {
                ...entry.options,
                forceImmediate: true
            });
            entry.waiters.forEach(({ resolve }) => resolve(result));
            return result;
        } catch (error) {
            entry.waiters.forEach(({ reject }) => reject(error));
            throw error;
        }
    }

    async _flushQueuedProfilePatch(uid) {
        const entry = this._queuedProfilePatches.get(uid);
        if (!entry) return { ok: false, reason: 'queue_missing' };

        if (entry.timer) clearTimeout(entry.timer);
        this._queuedProfilePatches.delete(uid);

        try {
            const result = await this._commitPlayerDataPatch(uid, entry.patch, {
                ...entry.options,
                forceImmediate: true
            });
            entry.waiters.forEach(({ resolve }) => resolve(result));
            return result;
        } catch (error) {
            entry.waiters.forEach(({ reject }) => reject(error));
            throw error;
        }
    }

    async flushQueuedProfileSaves() {
        const pendingUids = Array.from(this._queuedProfileSaves.keys());
        if (pendingUids.length === 0) return [];
        return Promise.all(pendingUids.map((uid) => this._flushQueuedProfileSave(uid).catch((error) => {
            Logger.error('Failed to flush queued profile save', error);
            return { ok: false, reason: 'flush_failed', error };
        })));
    }

    async flushQueuedProfilePatches() {
        const pendingUids = Array.from(this._queuedProfilePatches.keys());
        if (pendingUids.length === 0) return [];
        return Promise.all(pendingUids.map((uid) => this._flushQueuedProfilePatch(uid).catch((error) => {
            Logger.error('Failed to flush queued profile patch', error);
            return { ok: false, reason: 'flush_failed', error };
        })));
    }

    async _commitPlayerData(uid, data, syncToZone = false, options = {}) {
        if (!uid || !window.firebase || !data) return { ok: false, reason: 'invalid_args' };
        try {
            const nextProfile = this._normalizeProfileSnapshot(data, Date.now());
            nextProfile.ts = Math.max(Number(nextProfile.ts || 0), Date.now(), this._lastProfileSaveTs + 1);
            this._lastProfileSaveTs = nextProfile.ts;
            const profileRef = this.getProfileRef(uid);
            const allowStaleWrite = !!options.allowStaleWrite;
            let committedProfile = null;

            // v0.00.04: Root profile update (Persistent across logins)
            Logger.debug(`[Network] Saving Player Data to users/${uid}/profile:`, nextProfile);
            this._recordNetworkWrite('profileSave', nextProfile);
            const transactionResult = await profileRef.transaction((current) => {
                const currentTs = Number(current?.ts || 0);
                const nextTs = Number(nextProfile.ts || 0);
                if (!allowStaleWrite && currentTs > nextTs) {
                    return;
                }
                return nextProfile;
            });

            if (!transactionResult.committed) {
                const currentProfile = transactionResult.snapshot?.val() || null;
                Logger.warn(`[Network] Skipped stale profile save for ${uid}. incoming=${nextProfile.ts} current=${currentProfile?.ts || 0}`);
                return {
                    ok: false,
                    reason: 'stale_profile',
                    currentProfile
                };
            }

            committedProfile = transactionResult.snapshot?.val()
                ? this._normalizeProfileSnapshot(transactionResult.snapshot.val(), nextProfile.ts)
                : nextProfile;

            await this._writeProfileBackup(uid, committedProfile, {
                keepCount: options.keepBackupCount || 20,
                reason: options.backupReason || 'profile_save',
                sourceUid: options.sourceUid || uid,
                sourceTs: options.sourceTs || committedProfile.ts
            });

            // v0.00.04: Zone-specific update ONLY IF requested and in a zone
            // This prevents players in character selection from appearing in the map
            if (syncToZone && this.dbRef && this.zoneParticipationEnabled && this._shouldSendRealtimeUserState()) {
                const zoneProfile = this._buildZoneProfileSnapshot(committedProfile);
                this._recordNetworkWrite('zoneProfileSync', zoneProfile);
                await this.dbRef.child(`users/${uid}/profile`).set(zoneProfile);
            }
            return { ok: true, profile: committedProfile };
        } catch (e) {
            Logger.error('Failed to save player profile', e);
            return { ok: false, reason: 'save_failed', error: e };
        }
    }

    async _commitPlayerDataPatch(uid, patchData, options = {}) {
        if (!uid || !window.firebase || !patchData || typeof patchData !== 'object') {
            return { ok: false, reason: 'invalid_args' };
        }

        try {
            const nextPatch = this._cloneProfileData(patchData) || {};
            nextPatch.ts = Math.max(Number(nextPatch.ts || 0), Date.now(), this._lastProfileSaveTs + 1);
            this._lastProfileSaveTs = nextPatch.ts;

            const updates = {};
            Object.entries(nextPatch).forEach(([key, value]) => {
                if (value === undefined) return;
                updates[`users/${uid}/profile/${key}`] = value;
            });

            if (Object.keys(updates).length === 0) {
                return { ok: false, reason: 'empty_patch' };
            }

            Logger.debug(`[Network] Saving Player Data Patch to users/${uid}/profile:`, nextPatch);
            this._recordNetworkWrite('profilePatchSave', nextPatch);
            await firebase.database().ref().update(updates);

            if (options.syncToZone && this.dbRef && this.zoneParticipationEnabled && this._shouldSendRealtimeUserState()) {
                const zonePatch = this._buildZoneProfilePatch(nextPatch);
                if (zonePatch) {
                    const zoneUpdates = {};
                    Object.entries(zonePatch).forEach(([key, value]) => {
                        zoneUpdates[`users/${uid}/profile/${key}`] = value;
                    });
                    this._recordNetworkWrite('zoneProfilePatchSync', zonePatch);
                    await this.dbRef.update(zoneUpdates);
                }
            }

            return { ok: true, patch: nextPatch };
        } catch (error) {
            Logger.error('Failed to save player profile patch', error);
            return { ok: false, reason: 'save_patch_failed', error };
        }
    }

    async recoverPlayerProfile(targetUid, sourceUid) {
        if (!targetUid || !sourceUid || !window.firebase) {
            return { ok: false, reason: 'invalid_args' };
        }

        const [sourceSnapshot, targetSnapshot] = await Promise.all([
            this.getLatestProfileSnapshot(sourceUid),
            this.getLatestProfileSnapshot(targetUid)
        ]);

        if (!sourceSnapshot?.profile) {
            return { ok: false, reason: 'source_missing', sourceSnapshot, targetSnapshot };
        }

        const sourceTs = Number(sourceSnapshot.ts || 0);
        const targetTs = Number(targetSnapshot?.ts || 0);
        if (targetSnapshot?.profile && sourceTs < targetTs) {
            return {
                ok: false,
                reason: 'source_older_than_target',
                sourceSnapshot,
                targetSnapshot
            };
        }

        const recoveredProfile = this._cloneProfileData(sourceSnapshot.profile) || {};
        recoveredProfile.recoveredFromUid = sourceUid;
        recoveredProfile.recoveredFromTs = sourceTs;
        recoveredProfile.ts = Date.now();

        const saveResult = await this.savePlayerData(targetUid, recoveredProfile, false, {
            allowStaleWrite: true,
            backupReason: 'profile_recovery',
            sourceUid,
            sourceTs
        });

        if (!saveResult.ok) {
            return { ok: false, reason: saveResult.reason || 'recovery_save_failed', sourceSnapshot, targetSnapshot };
        }

        return {
            ok: true,
            profile: saveResult.profile,
            sourceSnapshot,
            targetSnapshot
        };
    }

    async resetWorldData() {
        if (!this.dbRef || !this.connected) return;
        try {
            Logger.info('--- DEVELOPER WORLD RESET INITIALIZED ---');
            // Clear World Nodes
            await Promise.all([
                this.dbRef.child('monsters').remove(),
                this.dbRef.child('monster_cells').remove(),
                this.dbRef.child('monster_host_snapshot').remove(),
                this.dbRef.child('drops').remove(),
                this.dbRef.child('monster_damage').remove(),
                this.dbRef.child('player_damage').remove()
            ]);
            Logger.log('World data (monsters/drops/logs) cleared successfully.');
        } catch (e) {
            Logger.error('Failed to reset world data', e);
        }
    }

    async clearWorldCombatState(options = {}) {
        if (!this.dbRef || !this.connected) return false;

        const resetSlimeKillCount = options.resetSlimeKillCount !== false;

        try {
            await Promise.all([
                this.dbRef.child('monsters').remove(),
                this.dbRef.child('monster_cells').remove(),
                this.dbRef.child('monster_host_snapshot').remove(),
                this.dbRef.child('drops').remove(),
                this.dbRef.child('monster_damage').remove(),
                this.dbRef.child('monster_damage_batch').remove(),
                this.dbRef.child('monster_attack').remove(),
                this.dbRef.child('player_damage').remove(),
                this.dbRef.child('player_damage_batch').remove(),
                this.dbRef.child('boss_spawn_requests').remove(),
                resetSlimeKillCount
                    ? this.dbRef.child('world_state/slime_kill_count').set(0)
                    : Promise.resolve()
            ]);

            this.monsterUpdateQueue.clear();
            this._publishedMonsterCellMap.clear();
            this._monsterCellPayloadCache.clear();
            return true;
        } catch (error) {
            Logger.error('Failed to clear world combat state', error);
            return false;
        }
    }

    // v0.00.03: Full Database Reset (Users & Names)
    async resetAllUserData() {
        if (!window.firebase) return;
        try {
            Logger.warn('!!! FULL DATA RESET STARTING !!!');
            await Promise.all([
                firebase.database().ref('users').remove(),
                firebase.database().ref('names').remove(),
                firebase.database().ref('zones').remove()
            ]);
            Logger.log('All user and zone data cleared.');
        } catch (e) {
            Logger.error('Reset failed', e);
        }
    }

    // v0.00.03: Name Duplicate Management
    async checkNameDuplicate(name) {
        if (!name) return true;
        try {
            const snapshot = await firebase.database().ref(`names/${name}`).once('value');
            return snapshot.exists();
        } catch (e) {
            Logger.error('Name check failed', e);
            return true;
        }
    }

    async claimName(uid, name) {
        if (!uid || !name) return false;
        try {
            // Reserve name in root list
            await firebase.database().ref(`names/${name}`).set(uid);
            return true;
        } catch (e) {
            Logger.error('Name claim failed', e);
            return false;
        }
    }

    // v0.00.14: Update Name Mapping when player renamed
    async updateNameMapping(uid, oldName, newName) {
        if (!uid || !newName || oldName === newName) return;
        try {
            const updates = {};
            if (oldName) {
                updates[`names/${oldName}`] = null; // Release old name
            }
            updates[`names/${newName}`] = uid; // Claim new name

            await firebase.database().ref().update(updates);
            Logger.log(`Name mapping updated: ${oldName} -> ${newName} (${uid})`);
        } catch (e) {
            Logger.error('Failed to update name mapping', e);
        }
    }

    // v1.94: Developer Mode - Lookup UID by Player Name
    async getUidByName(name) {
        if (!name) return null;
        try {
            const snapshot = await firebase.database().ref(`names/${name}`).once('value');
            return snapshot.val();
        } catch (e) {
            Logger.error('UID lookup by name failed', e);
            return null;
        }
    }

    // v0.00.04: Full Character Deletion
    async deleteCharacter(uid, name) {
        if (!uid) return;
        try {
            const updates = {};
            updates[`users/${uid}/profile`] = null;
            if (this.dbRef) {
                updates[`zones/${this.roomId}/users/${uid}`] = null;
            }
            if (name) {
                updates[`names/${name}`] = null;
            }
            await firebase.database().ref().update(updates);
            Logger.warn(`Character deleted: ${uid} (${name})`);
            return true;
        } catch (e) {
            Logger.error('Character deletion failed', e);
            return false;
        }
    }

    // --- Party System (v0.00.65) ---

    // --- Party System (v0.00.73: Unified Path to party_invites) ---
    async inviteToParty(targetName) {
        if (!targetName || !this.playerId) return 'ERROR';

        try {
            const targetUid = await this.getUidByName(targetName);
            if (!targetUid) {
                Logger.log(`[Party] Target not found: ${targetName}`);
                return 'NOT_FOUND';
            }

            if (targetUid === this.playerId) {
                return 'SELF';
            }

            const localPartyMembers = Array.isArray(window.game?.localPlayer?.party?.members)
                ? window.game.localPlayer.party.members
                : [this.playerId];
            if (localPartyMembers.includes(targetUid)) {
                return 'ALREADY_IN_PARTY';
            }

            // Push invite to target's inbox (Correct Path: party_invites)
            const inviteRef = this.dbRef.child(`party_invites/${targetUid}`).push();
            await inviteRef.set({
                from: this.playerId,
                fromName: window.game.localPlayer ? window.game.localPlayer.name : "Unknown",
                partyMembers: Array.from(new Set(localPartyMembers.filter(Boolean))),
                ts: Date.now()
            });

            return 'SENT';
        } catch (e) {
            Logger.error('Failed to invite to party', e);
            return 'ERROR';
        }
    }

    _normalizePartyMembers(members) {
        return Array.from(new Set((members || []).filter(Boolean)));
    }

    _applyLocalPartyMembers(members) {
        const normalized = this._normalizePartyMembers(members);
        const localPlayer = window.game?.localPlayer;
        if (!localPlayer) return normalized;

        if (typeof localPlayer.setPartyMembers === 'function') {
            localPlayer.setPartyMembers(normalized);
        } else {
            localPlayer.party = { members: normalized };
            localPlayer.saveState(true);
            window.game?.ui?.updatePartyUI?.();
        }

        return normalized;
    }

    async _loadPartyMembersFor(uid, fallbackMembers = null) {
        if (Array.isArray(fallbackMembers) && fallbackMembers.length > 0) {
            return this._normalizePartyMembers(fallbackMembers);
        }

        const profile = await this.getPlayerProfile(uid);
        const members = profile?.party?.members;
        return this._normalizePartyMembers(Array.isArray(members) && members.length > 0 ? members : [uid]);
    }

    async _broadcastPartySync(members, recipients, action = 'SYNC') {
        if (!this.dbRef) return;

        const normalizedMembers = this._normalizePartyMembers(members);
        const targetMembers = this._normalizePartyMembers(recipients);
        await Promise.all(targetMembers.map((uid) => this.dbRef.child(`users/${uid}/party_inbox`).push({
            type: action,
            members: normalizedMembers,
            actorId: this.playerId,
            actorName: window.game?.localPlayer?.name || 'Unknown',
            ts: Date.now()
        })));
    }

    async respondToInvite(inviteId, fromUid, accept, invitePartyMembers = null) {
        if (!this.connected || !this.playerId || !this.dbRef) return null;

        await this.dbRef.child(`party_invites/${this.playerId}/${inviteId}`).remove();

        const responsePayload = {
            from: this.playerId,
            fromName: window.game?.localPlayer?.name || 'Unknown',
            accept: !!accept,
            ts: Date.now()
        };

        if (accept) {
            const baseMembers = await this._loadPartyMembersFor(fromUid, invitePartyMembers);
            const mergedMembers = this._normalizePartyMembers([...baseMembers, this.playerId]);
            this._applyLocalPartyMembers(mergedMembers);
            responsePayload.partyMembers = mergedMembers;

            const recipients = mergedMembers.filter((uid) => uid !== this.playerId && uid !== fromUid);
            await this._broadcastPartySync(mergedMembers, recipients, 'SYNC');
        }

        await this.dbRef.child(`party_responses/${fromUid}`).push(responsePayload);
        return responsePayload.partyMembers || null;
    }

    async leaveParty() {
        if (!this.connected || !this.playerId) return false;

        const currentMembers = this._normalizePartyMembers(window.game?.localPlayer?.party?.members || [this.playerId]);
        const remainingMembers = currentMembers.filter((uid) => uid !== this.playerId);

        this._applyLocalPartyMembers([this.playerId]);

        if (remainingMembers.length > 0) {
            await this._broadcastPartySync(remainingMembers, remainingMembers, 'LEAVE');
        }

        this.emit('leftParty');
        return true;
    }

    // Listener for invites (v0.00.70: 중복 정의 통합, 올바른 경로 사용)
    _setupPartyListeners() {
        if (!this.dbRef) return;

        // Listen for Invites (party_invites 경로 사용)
        this.dbRef.child(`party_invites/${this.playerId}`).on('child_added', (snapshot) => {
            const val = snapshot.val();
            Logger.log('[Party] Received Invite:', val);
            if (val && Date.now() - (val.ts || 0) < 30000) { // Valid for 30s
                // v0.00.70: UIManager의 이벤트 리스너를 통해 모달 표시
                this.emit('partyInviteReceived', {
                    id: snapshot.key,
                    from: val.from,
                    fromName: val.fromName,
                    partyMembers: val.partyMembers || [val.from]
                });
            }
            // Auto-remove invite after processing
            snapshot.ref.remove();
        });

        // Listen for Responses (party_responses 경로 사용)
        this.dbRef.child(`party_responses/${this.playerId}`).on('child_added', (snapshot) => {
            const val = snapshot.val();
            if (val) {
                this.emit('partyResponseReceived', val);
                snapshot.ref.remove();
            }
        });

        this.dbRef.child(`users/${this.playerId}/party_inbox`).on('child_added', (snapshot) => {
            const val = snapshot.val();
            if (val && Array.isArray(val.members) && window.game?.localPlayer) {
                this._applyLocalPartyMembers(val.members);
            }
            snapshot.ref.remove();
        });
    }

    // --- Host Logic ---
    _checkHostStatus() {
        if (!this.playerId || !this.connected) return;
        if (!this.zoneParticipationEnabled) {
            if (this.isHost) {
                this.isHost = false;
                this.emit('hostChanged', false);
                this._stopCleanupLoop();
            }
            return;
        }

        const now = Date.now();
        const timeout = this.presenceStaleTimeout;

        // Update self Activity
        this.userLastSeen.set(this.playerId, now);

        // Filter active users based on last seen heartbeat
        const activeUsers = this.connectedUsers.filter(uid => {
            if (uid === this.playerId) return true;
            const last = this.userLastSeen.get(uid) || 0;
            return (now - last) < timeout;
        });

        // Lexicographical sort to find authoritative "lowest UID" host
        activeUsers.sort();

        // v0.00.42: Always track current host for anti-cheat validation
        this.currentHostId = activeUsers.length > 0 ? activeUsers[0] : null;

        const desiredHost = (activeUsers.length > 0 && activeUsers[0] === this.playerId);

        if (desiredHost && !this.isHost) {
            this.isHost = true;
            Logger.info(`[Network] PROMOTED TO HOST. Active Users: ${activeUsers.length}. ID: ${this.playerId}`);
            this.emit('hostChanged', true);
            this._startCleanupLoop();
        } else if (!desiredHost && this.isHost) {
            this.isHost = false;
            Logger.info(`[Network] DEMOTED TO GUEST. Active Users: ${activeUsers.length}`);
            this.emit('hostChanged', false);
            this._stopCleanupLoop();
        }
    }

    _startCleanupLoop() {
        if (this.cleanupTimer) clearInterval(this.cleanupTimer);
        this.cleanupTimer = setInterval(() => this._cleanupStaleUsers(), 5000); // Check every 5s
    }

    _stopCleanupLoop() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    async _cleanupStaleUsers() {
        if (!this.connected || !this.isHost) return;

        const now = Date.now();
        const staleTimeout = this.isSharedFieldActive() ? this.sharedGhostTimeout : this.soloGhostTimeout;

        // v0.00.05: Use LOCAL userLastSeen map for cleanup to avoid Server/Host clock skew
        this.userLastSeen.forEach((lastTs, uid) => {
            if (uid === this.playerId) return;

            if (now - lastTs > staleTimeout) {
                Logger.log(`[Host] Removing inactive user: ${uid}`);
                this.dbRef.child(`users/${uid}`).remove();
                this.userLastSeen.delete(uid);
            }
        });
    }

    _scheduleMonsterUpdateFlush() {
        if (this._monsterUpdateTimer) return;
        this._monsterUpdateTimer = setTimeout(() => {
            this._monsterUpdateTimer = null;
            this.flushMonsterUpdates();
        }, this.monsterUpdateFlushDelay);
    }

    flushMonsterUpdates() {
        if (!this.connected || !this.isHost || !this.dbRef || this.monsterUpdateQueue.size === 0) return;

        const updates = {};
        this.monsterUpdateQueue.forEach((payload, id) => {
            if (this.shouldUseMonsterCellSync()) {
                const nextCellId = typeof payload.cellId === 'string'
                    ? payload.cellId
                    : this._getFieldCellId(payload.x, payload.y);
                const previousCellId = this._publishedMonsterCellMap.get(id) || null;

                if (previousCellId && previousCellId !== nextCellId) {
                    updates[`monster_cells/${previousCellId}/${id}`] = null;
                }

                updates[`monster_cells/${nextCellId}/${id}`] = this._buildMonsterRealtimeCellPayload(payload);
                this._publishedMonsterCellMap.set(id, nextCellId);

                if (this.shouldUseMonsterHostSnapshot() && (payload.fullSync || previousCellId !== nextCellId)) {
                    updates[`monster_host_snapshot/${id}`] = {
                        id,
                        ...payload
                    };
                }
                return;
            }

            updates[`monsters/${id}`] = payload;
        });
        this.monsterUpdateQueue.clear();

        this._recordNetworkWrite('monsterUpdate', updates, Object.keys(updates).length);
        this.dbRef.update(updates).catch((e) => {
            Logger.error('Monster batch update failed:', e);
        });
    }

    sendMonsterUpdate(id, data) {
        if (!this.connected || !this.isHost) return;
        if (!id || !data) return;
        if (this.shouldUseMonsterQuietMode()) return;

        const nextHp = Math.round(data.hp || 0);
        const nextState = data.state
            || (nextHp <= 0 ? 'dead' : 'idle');
        const nextTs = Number(data.ts || Date.now());
        const nextCellId = typeof data.cellId === 'string'
            ? data.cellId
            : this._getFieldCellId(data.x, data.y);

        // Validation to prevent Firebase Errors (No Spread to avoid undefined fields)
        const safeData = {
            x: Math.round(data.x || 0),
            y: Math.round(data.y || 0),
            hp: nextHp,
            maxHp: Math.round(data.maxHp || 100),
            type: data.type || 'slime',
            chargeOnly: data.chargeOnly || false, // v0.00.76+
            rev: Math.max(0, Math.round(data.rev || 0)),
            ts: nextTs,
            state: nextState,
            cellId: nextCellId
        };
        if (data.fullSync) safeData.fullSync = true;
        if (data.isBoss) safeData.isBoss = true;
        if (Number.isFinite(data.w)) safeData.w = Math.round(data.w);
        if (Number.isFinite(data.h)) safeData.h = Math.round(data.h);

        this.monsterUpdateQueue.set(id, safeData);
        if (data.immediate) {
            this.flushMonsterUpdates();
            return;
        }
        this._scheduleMonsterUpdateFlush();
    }

    removeMonster(id) {
        if (!this.connected || !this.isHost) return;
        const queuedPayload = this.monsterUpdateQueue.get(id) || null;
        this.monsterUpdateQueue.delete(id);

        if (this.shouldUseMonsterCellSync()) {
            const removalPaths = {};
            const cellId = queuedPayload?.cellId || this._publishedMonsterCellMap.get(id) || null;
            if (cellId) {
                removalPaths[`monster_cells/${cellId}/${id}`] = null;
            }
            if (this.shouldUseMonsterHostSnapshot()) {
                removalPaths[`monster_host_snapshot/${id}`] = null;
            }
            this._publishedMonsterCellMap.delete(id);
            if (Object.keys(removalPaths).length > 0) {
                this.dbRef.update(removalPaths).catch(() => { });
            }
            return;
        }

        this.dbRef.child(`monsters/${id}`).remove().catch(() => { });
    }

    // --- Drop Methods ---
    spawnDrop(data) {
        if (!this.connected || !this.isHost) return;
        const payload = {
            x: Math.round(data.x),
            y: Math.round(data.y),
            type: data.type,
            amount: data.amount,
            ownerId: data.ownerId || null,
            partyMembers: Array.isArray(data.partyMembers) ? data.partyMembers : null,
            ts: Date.now()
        };
        if (this.shouldUseMonsterQuietMode()) {
            const id = data.id || `drop_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            this._recordNetworkWrite('dropSpawnLocal', { id, ...payload });
            this.emit('dropAdded', { id, ...payload });
            this._markNetworkActivity(payload.ts);
            return id;
        }
        const ref = this.dbRef.child('drops').push();
        this._recordNetworkWrite('dropSpawn', payload);
        ref.set(payload).catch(e => { });
        this._networkDropIds.add(ref.key);
        return ref.key;
    }

    removeDrop(id) {
        if (!this.connected || !this.isHost) return;
        if (this.shouldUseMonsterQuietMode() && !this._networkDropIds.has(id)) {
            this._recordNetworkWrite('dropRemoveLocal', { id });
            this.emit('dropRemoved', id);
            this._markNetworkActivity();
            return;
        }
        this._networkDropIds.delete(id);
        this.dbRef.child(`drops/${id}`).remove().catch(e => { });
    }

    publishDropSnapshot(id, data) {
        if (!this.connected || !this.isHost || !this.dbRef || !id || !data) return;
        const payload = {
            x: Math.round(data.x),
            y: Math.round(data.y),
            type: data.type,
            amount: data.amount,
            ownerId: data.ownerId || null,
            partyMembers: Array.isArray(data.partyMembers) ? data.partyMembers : null,
            ts: Number(data.ts || Date.now())
        };
        this._recordNetworkWrite('dropPublish', payload);
        this._networkDropIds.add(id);
        this.dbRef.child(`drops/${id}`).set(payload).catch(() => { });
    }

    collectDrop(dropId) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        if (this.isHost && this.shouldUseMonsterQuietMode()) {
            const payload = {
                dropId,
                collectorId: this.playerId
            };
            this._recordNetworkWrite('dropCollectLocal', payload);
            this.emit('dropCollectionRequested', payload);
            this._markNetworkActivity();
            return;
        }
        // Request collection: { did: dropId, cid: collectorId }
        const payload = {
            did: dropId,
            cid: this.playerId,
            ts: Date.now()
        };
        this._recordNetworkWrite('dropCollect', payload);
        this.dbRef.child('drop_collection').push(payload);
    }

    requestBossSpawn({ isFirstBoss = true } = {}) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;

        const payload = {
            requesterId: this.playerId,
            isFirstBoss: !!isFirstBoss,
            ts: Date.now()
        };

        this._recordNetworkWrite('bossSpawnRequest', payload);
        this.dbRef.child('boss_spawn_requests').push(payload);
        this._markNetworkActivity();
    }

    // Phase 1: Delta synchronization for bandwidth optimization
    // Only sync changed fields instead of full packet
    sendMovePacket(x, y, vx, vy, name) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;

        const now = Date.now();
        const nextCellId = this._getFieldCellId(x, y);
        const nextFieldId = this._getCurrentFieldId();
        this._refreshMonsterCellSubscriptions(nextCellId);
        if (!this._lastPresenceLiteState
            || this._lastPresenceLiteState.cellId !== nextCellId
            || this._lastPresenceLiteState.fieldId !== nextFieldId) {
            this._publishPresenceLite({ x, y, fieldId: nextFieldId, reason: 'move' });
        }

        // Adaptive sync interval based on movement state
        const isMoving = Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1;
        this.isPlayerMoving = isMoving;
        if (!this._shouldSendRealtimeUserState()) return;

        const lastVx = Number(this.lastPacketData?.vx || 0);
        const lastVy = Number(this.lastPacketData?.vy || 0);
        const wasMoving = Math.abs(lastVx) > 0.1 || Math.abs(lastVy) > 0.1;
        const movementStateChanged = !!this.lastPacketData && wasMoving !== isMoving;

        const currentInterval = this._getMoveSyncInterval(vx, vy);
        if (!movementStateChanged && now - this.lastSyncTime < currentInterval) return;

        // Validation
        const safeX = Math.round(x) || 0;
        const safeY = Math.round(y) || 0;
        const safeVx = parseFloat((vx || 0).toFixed(2));
        const safeVy = parseFloat((vy || 0).toFixed(2));
        const positionThreshold = window.game?.isMobilePerformanceMode ? 4 : 2;
        const velocityThreshold = window.game?.isMobilePerformanceMode ? 0.08 : 0.05;

        // Delta calculation - only send changed fields
        const updates = {};
        let hasChanges = false;
        const basePath = `users/${this.playerId}`;

        // Position delta (threshold: 2 pixels)
        if (!this.lastPacketData || movementStateChanged || Math.abs(safeX - this.lastPacketData.x) >= positionThreshold) {
            updates[`${basePath}/p/x`] = safeX;
            hasChanges = true;
        }
        if (!this.lastPacketData || movementStateChanged || Math.abs(safeY - this.lastPacketData.y) >= positionThreshold) {
            updates[`${basePath}/p/y`] = safeY;
            hasChanges = true;
        }

        const nextVx = isMoving ? safeVx : 0;
        const nextVy = isMoving ? safeVy : 0;
        if (!this.lastPacketData
            || movementStateChanged
            || Math.abs(nextVx - lastVx) >= velocityThreshold
            || Math.abs(nextVy - lastVy) >= velocityThreshold) {
            updates[`${basePath}/p/vx`] = nextVx;
            updates[`${basePath}/p/vy`] = nextVy;
            hasChanges = true;
        }

        // Name only on first packet or change
        if (!this.lastPacketData || (name && name !== this.lastPacketData.name)) {
            updates[`${basePath}/p/n`] = name || "Unknown";
            hasChanges = true;
        }

        // Timestamp always included for latency calculation
        updates[`${basePath}/p/ts`] = now;

        if (hasChanges) {
            this._recordNetworkWrite('move', updates);
            this.dbRef.update(updates).catch(e => { });
            this.lastPacketData = { x: safeX, y: safeY, vx: nextVx, vy: nextVy, name };
            this._markNetworkActivity(now);
        }

        this.lastSyncTime = now;
    }

    // v0.28.0: Detailed attack sync [ts, x, y, direction, skillType]
    sendPlayerAttack(x, y, dir, skillType, extraData = null) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        if (!this._shouldSendRealtimeUserState()) return;
        const now = Date.now();
        const payload = [
            now,
            Math.round(x),
            Math.round(y),
            dir,
            skillType,
            extraData // v0.29.0: Added for skill specifics (e.g. missile count)
        ];
        this._recordNetworkWrite('attack', payload);
        this.dbRef.child(`users/${this.playerId}/a`).set(payload);
        this._markNetworkActivity(now);
    }

    // v0.00.37: Send channeling state for casting effects (independent of attack hit)
    sendChanneling(skillType) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        if (!this._shouldSendRealtimeUserState()) return;
        const now = Date.now();
        const payload = [now, skillType];
        this._recordNetworkWrite('channel', payload);
        this.dbRef.child(`users/${this.playerId}/ch`).set(payload);
        this._markNetworkActivity(now);
    }

    sendMonsterDamage(monsterId, damage, meta = null) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        const localPlayer = window.game?.localPlayer || null;
        const localMonster = window.game?.monsterManager?.monsters?.get?.(monsterId) || null;
        if (damage > 0
            && localPlayer?.questData
            && localMonster?.typeId === 'king_slime'
            && !!localPlayer.questData.slime30QuestClaimed
            && (localPlayer.questData.bossClearCount || 0) === 0
            && !localPlayer.questData.bossQuestClaimed
            && !localPlayer.questData.introBossParticipated) {
            localPlayer.questData.introBossParticipated = true;
            localPlayer.saveProfilePatch?.(['questData'], {
                debounceMs: 0,
                reason: 'intro_boss_participation'
            });
            window.game?.ui?.updateQuestUI?.();
        }
        if (this.isHost && this.shouldUseMonsterQuietMode()) {
            const payload = {
                mid: monsterId,
                dmg: Math.round(damage),
                aid: this.playerId,
                meta: meta || null
            };
            this._recordNetworkWrite('monsterDamageLocal', payload);
            this.emit('monsterDamageReceived', payload);
            this._markNetworkActivity();
            return;
        }
        this.queueBatchUpdate('monster_damage', {
            mid: monsterId,
            dmg: Math.round(damage),
            aid: this.playerId,
            meta: meta || null
        });
    }

    // v0.33.0: Send Monster Attack (Host Only)
    sendMonsterAttack(monsterId, skillType, extraData = null) {
        if (!this.connected || !this.isHost) return;
        if (this.shouldUseMonsterQuietMode()) {
            const payload = {
                mid: monsterId,
                skill: skillType,
                extra: extraData,
                ts: Date.now()
            };
            this._recordNetworkWrite('monsterAttackLocal', payload);
            this.emit('monsterAttack', payload);
            this._markNetworkActivity(payload.ts);
            return;
        }
        const payload = {
            mid: monsterId,
            skill: skillType,
            extra: extraData,
            ts: Date.now()
        };
        this._recordNetworkWrite('monsterAttack', payload);
        this.dbRef.child('monster_attack').push(payload);
    }

    sendPlayerDamage(targetId, damage, effectType = null, effectDuration = 0, effectDamage = 0, meta = null) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        // Optimization: Use batch queue for player damage
        this.queueBatchUpdate('player_damage', {
            tid: targetId,
            dmg: Math.round(damage),
            aid: this.playerId,
            effectType,
            effectDuration,
            effectDamage,
            crit: !!meta?.isCrit,
            meta: meta || null
        });
    }

    sendReward(playerId, data) {
        if (!this.connected || !this.isHost) return;
        if (this.shouldUseMonsterQuietMode() && playerId === this.playerId) {
            const safeData = {
                ...data,
                hostId: this.playerId,
                ts: Date.now()
            };
            this._recordNetworkWrite('rewardLocal', safeData);
            this.emit('rewardReceived', safeData);
            this._markNetworkActivity(safeData.ts);
            return;
        }
        // v0.00.42: Include hostId for anti-cheat validation
        // data: { exp: number, gold: number, items: [] }
        const safeData = {
            ...data,
            hostId: this.playerId,  // Host signature
            ts: Date.now()
        };
        this._recordNetworkWrite('reward', safeData);
        this.dbRef.child(`rewards/${playerId}`).push(safeData).catch(e => { });
    }

    // v0.28.0: Sync player HP status
    sendPlayerHp(hp, maxHp, options = {}) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        if (!this._shouldSendRealtimeUserState()) return;
        const now = Date.now();
        const nextMaxHp = Math.max(0, Math.round(maxHp));
        const nextHp = Math.min(nextMaxHp, Math.max(0, Math.round(hp)));
        const force = !!options.force;

        if (!force && this._lastHpSync.hp === nextHp && this._lastHpSync.maxHp === nextMaxHp && (now - this._lastHpSync.ts) < 500) {
            return;
        }
        if (!force && (now - this._lastHpSync.ts) < 120) return;

        this._lastHpSync = { hp: nextHp, maxHp: nextMaxHp, ts: now };
        this._recordNetworkWrite('hp', [nextHp, nextMaxHp, now]);
        this.dbRef.child(`users/${this.playerId}/h`).set([nextHp, nextMaxHp, now]);
        this._markNetworkActivity(now);
    }

    syncLocalZoneProfile(reason = 'manual_zone_profile_sync') {
        if (!this.connected || !this.playerId || !this.dbRef || !this.zoneParticipationEnabled) return;
        if (!this._shouldSendRealtimeUserState()) return;

        const player = window.game?.localPlayer || null;
        const zoneProfile = this._buildLocalZoneProfileSnapshot(player);
        if (!zoneProfile) return;

        this._recordNetworkWrite('zoneProfileSyncRealtime', { reason, profile: zoneProfile });
        this.dbRef.child(`users/${this.playerId}/profile`).set(zoneProfile).catch(() => { });
        this._markNetworkActivity();
    }

    sendChat(text, senderName) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        const now = Date.now();
        const payload = {
            uid: this.playerId,
            name: senderName || "Unknown",
            text: text,
            ts: now
        };
        this._recordNetworkWrite('chat', payload);
        this.dbRef.child('chat').push(payload);
        this._markNetworkActivity(now);
    }

    _onPlayerAdded(snapshot) {
        const uid = snapshot.key;
        const val = snapshot.val();
        if (!val) return;

        const initialState = this._normalizeZoneUserSnapshot(val);
        this._zoneUserCache.set(uid, initialState);
        this.userLastSeen.set(uid, this._resolveZoneUserActivityTs(initialState));
        this._registerConnectedUser(uid);
        this._checkHostStatus();

        if (uid === this.playerId) return;

        this._attachZoneUserHotPathListeners(uid, initialState);

        const remotePlayer = this._ensureRemotePlayerBuffered(uid, { emitTransientState: true });
        if (remotePlayer && !this._isMeaningfulPlayerName(remotePlayer.name)) {
            this._requestZoneUserHydration(uid, 'player_added_unknown_name');
        }
        if (!remotePlayer && !initialState.p) {
            Logger.warn(`[Network] Waiting for initial position for remote player ${uid}.`);
            this._requestZoneUserHydration(uid, 'player_added_missing_position');
        }
    }

    _onPlayerChanged(snapshot) {
        const uid = snapshot.key;
        const val = snapshot.val();

        // v0.00.69: val이 null인 경우 (플레이어 삭제 이벤트 등) 조기 반환
        if (!val) return;

        // v1.99.38: Gather profile data for real-time sync early to avoid ReferenceError
        const profile = val.profile || {};
        const hostility = profile.hostility || val.hostility || null;
        const level = profile.level || null;
        const party = profile.party || null;
        const equipment = profile.equipment || null;

        // 1. Profile Sync (Level, Party)
        if (val.profile) {
            const existing = this.remotePlayers.get(uid);
            if (existing) {
                if (val.profile.level) existing.level = val.profile.level;
                if (val.profile.defense !== undefined) existing.defense = val.profile.defense; // v0.00.53: Sync defense to RemotePlayer
                if (val.profile.isPaused !== undefined) existing.isPaused = val.profile.isPaused; // v0.00.55: Sync safety state
                if (val.profile.protectedUntil !== undefined) existing.protectedUntil = Number(val.profile.protectedUntil) || 0;
                if (val.profile.equipment !== undefined) existing.equipment = val.profile.equipment;
                if (val.profile.party !== undefined) existing.party = val.profile.party;
                if (val.profile.hostility !== undefined) existing.hostility = val.profile.hostility;
            }
        }

        // v0.00.19: Handle flat hostility updates
        if (val.hostility !== undefined) {
            const existing = this.remotePlayers.get(uid);
            if (existing) existing.hostility = val.hostility;
        }

        // v0.28.2: Enhanced hybrid data parsing (Array <-> Object transition)
        let posData = null;
        const presenceTs = this._extractPresenceTs(val);
        if (Array.isArray(val)) {
            posData = val;
        } else if (val && typeof val === 'object') {
            if (val.p) {
                // v0.00.67: Support both Array (Legacy) and Object (Delta Sync) formats
                posData = val.p;
            } else if (val[0] !== undefined) {
                // Legacy structure being treated as object by Firebase due to added sub-nodes ('a' or 'h')
                posData = [val[0], val[1], val[2], val[3], val[4], val[5]];
            }
        }

        if (posData || presenceTs) {
            let ts = 0;
            if (posData) {
                ts = Array.isArray(posData) ? (posData[4] || 0) : (posData.ts || 0);
            } else {
                ts = presenceTs || 0;
            }

            // LOGGING: Check why users are stale
            // if (Math.random() < 0.05) Logger.log(`[NetDebug] Update from ${uid}, ts: ${ts}, now: ${Date.now()}, diff: ${Date.now() - ts}`);

            this.userLastSeen.set(uid, ts);

            if (uid !== this.playerId) {
                const existing = this.remotePlayers.get(uid);
                if (existing) {
                    existing.ts = ts;
                    if (posData) {
                        const update = { id: uid };

                        if (Array.isArray(posData)) {
                            // Array: [x, y, vx, vy, ts, name]
                            update.x = posData[0];
                            update.y = posData[1];
                            update.vx = posData[2];
                            update.vy = posData[3];
                            update.ts = posData[4];
                            update.name = posData[5];
                            existing.x = update.x;
                            existing.y = update.y;
                        } else {
                            // Object: Delta Sync {x?, y?, vx?, vy?, ts, n?}
                            update.ts = posData.ts || Date.now();
                            if (posData.x !== undefined) { update.x = posData.x; existing.x = posData.x; }
                            if (posData.y !== undefined) { update.y = posData.y; existing.y = posData.y; }
                            if (posData.vx !== undefined) update.vx = posData.vx;
                            if (posData.vy !== undefined) update.vy = posData.vy;
                            if (posData.n !== undefined) update.name = posData.n;
                        }

                        // v1.99.38: Sync profile fields in the same update
                        if (level) update.level = level;
                        if (equipment !== undefined) update.equipment = equipment;
                        if (party !== undefined) update.party = party;
                        if (val.profile?.protectedUntil !== undefined) update.protectedUntil = Number(val.profile.protectedUntil) || 0;
                        if (hostility) update.hostility = hostility;

                        this.emit('playerUpdate', update);
                    } else {
                        existing.ts = ts;
                    }
                } else {
                    // Packet arrived for unknown player -> Treat as Add
                    // v0.00.67: Only attempt add if we have some position data
                    Logger.warn(`[Network] Received update for unknown player ${uid}, treating as ADD.`);
                    if (posData && (Array.isArray(posData) || posData.x !== undefined || posData.y !== undefined || presenceTs)) {
                        // v0.00.74: Update userLastSeen to NOW to give grace period
                        this.userLastSeen.set(uid, Date.now());
                        this._onPlayerAdded(snapshot);
                    }
                }
            }
        }

        this._checkHostStatus();

        if (uid === this.playerId) return;

        // Position Update (NOW UNIFIED IN THE BLOCK ABOVE v0.00.68)
        // Redundant array-only block removed for cleaner delta-sync support.

        // Attack Update
        if (val && val.a && Array.isArray(val.a)) {
            const now = Date.now();
            const existing = this.remotePlayers.get(uid);
            if (existing) existing.ts = now; // v0.00.03: Activity!
            this.userLastSeen.set(uid, now);

            // v0.00.01: Filter stale attacks (ignore if older than 10s)
            const attackTs = val.a[0];
            if (attackTs > Date.now() - 10000) {
                this.emit('playerAttack', {
                    id: uid,
                    ts: attackTs,
                    x: val.a[1],
                    y: val.a[2],
                    dir: val.a[3],
                    skillType: val.a[4] || 'normal', // v0.28.0
                    extraData: val.a[5] || null // v0.29.0
                });
            }
        }

        // v0.00.37: Channeling Update (casting effects independent of attack hit)
        if (val && val.ch && Array.isArray(val.ch)) {
            const chTs = val.ch[0];
            const skillType = val.ch[1];
            // Filter stale channeling (ignore if older than 5s)
            if (chTs > Date.now() - 5000) {
                this.emit('playerChanneling', {
                    id: uid,
                    ts: chTs,
                    skillType: skillType
                });
            }
        }

        // v0.28.0: HP Update
        if (val && val.h && Array.isArray(val.h)) {
            // v0.00.03: Update Buffer
            const now = Date.now();
            const existing = this.remotePlayers.get(uid);
            if (existing) {
                existing.h = val.h;
                existing.ts = now; // v0.00.03: Activity!
            }
            this.userLastSeen.set(uid, now); // v0.00.03: Keep Host status active

            this.emit('playerHpUpdate', {
                id: uid,
                hp: val.h[0],
                maxHp: val.h[1],
                ts: val.h[2]
            });
        }
    }

    _onPlayerRemoved(snapshot) {
        const uid = snapshot.key;

        this.connectedUsers = this.connectedUsers.filter(id => id !== uid);
        this.connectedUsers.sort();
        this.userLastSeen.delete(uid);
        this._zoneUserCache.delete(uid);
        this._detachZoneUserListeners(uid);
        this.remotePlayers.delete(uid); // v0.00.03
        this._checkHostStatus();

        Logger.log(`Player Left: ${uid}`);
        this.emit('playerLeft', uid);
    }
    // v0.00.14: Party System Methods
    sendPartyInvite(targetUid) {
        if (!this.connected || !this.playerId) return;

        // Push invite to target's mailbox
        this.dbRef.child(`party_invites/${targetUid}`).push({
            senderId: this.playerId,
            senderName: window.game.localPlayer.name,
            ts: Date.now()
        });
    }

    acceptPartyInvite(senderId) {
        if (!this.connected || !this.playerId) return;

        // Create or Join Party
        // For simplicity: Create a party ID (e.g., senderId_timestamp) or use senderId as leader
        // We'll use a transaction or simple push to a 'parties' node.

        // 1. Notify Sender I accepted
        this.dbRef.child(`party_responses/${senderId}`).push({
            responderId: this.playerId,
            responderName: window.game.localPlayer.name,
            response: 'accept',
            ts: Date.now()
        });
    }



    // v0.00.14: Send PvP Damage with Status Effects
    sendPlayerDamage(targetId, amount, effectType = null, effectDuration = 0, effectDamage = 0, meta = null) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;

        // Push damage event to target's inbox
        this.dbRef.child(`damage_events/${targetId}`).push({
            attackerId: this.playerId,
            damage: amount,
            effectType: effectType,
            effectDuration: effectDuration,
            effectDamage: effectDamage,
            crit: !!meta?.isCrit,
            meta: meta || null,
            ts: Date.now()
        });
    }

    _setupDamageListeners() {
        // Listen for Incoming Damage
        this.dbRef.child(`damage_events/${this.playerId}`).on('child_added', (snapshot) => {
            const val = snapshot.val();
            if (val && typeof val.ts === 'number') {
                // Validate timestamp (ignore old attacks > 5s)
                if (Date.now() - val.ts < 5000) {
                    if (window.game && window.game.localPlayer) {
                        // Apply damage via Player.takeDamage
                        // Signature: takeDamage(amount, fromNetwork, isCrit, sourceX, sourceY, attacker, effectType, effectDuration, effectDamage)
                        // Attacker object is simulated {id, type='player'}
                        const impactX = Number.isFinite(val.meta?.impactX) ? val.meta.impactX : null;
                        const impactY = Number.isFinite(val.meta?.impactY) ? val.meta.impactY : null;
                        const attacker = {
                            id: val.attackerId,
                            type: 'player',
                            ...(val.meta || {})
                        };
                        window.game.localPlayer.takeDamage(
                            val.damage,
                            true,
                            !!val.crit,
                            impactX,
                            impactY,
                            attacker,
                            val.effectType,
                            val.effectDuration,
                            val.effectDamage
                        );
                    }
                }
            }
            // Auto-remove after processing
            snapshot.ref.remove();
        });
    }

    // v0.00.14: Hostility Synchronization
    sendHostilityEvent(targetUid) {
        if (!this.connected || !this.playerId) return;

        Logger.log(`Sending Hostility Event to ${targetUid}`);
        this.dbRef.child(`hostility_events/${targetUid}`).push({
            type: 'declare',
            senderId: this.playerId,
            senderName: window.game.localPlayer?.name || "Unknown",
            ts: Date.now()
        });
    }

    sendHostilityRemovalEvent(targetUid, myName) {
        if (!this.connected || !this.playerId) return;

        Logger.log(`Sending Hostility Removal to ${targetUid}`);
        this.dbRef.child(`hostility_events/${targetUid}`).push({
            type: 'remove',
            senderId: this.playerId,
            senderName: myName || "Someone", // v1.99.38: Added senderName for better UI messages
            ts: Date.now()
        });
    }

    startHostilityListeners() {
        if (!this.playerId || !this.zoneParticipationEnabled) return;
        if (this._hostilityListenerActive) return;

        this._hostilityListenerActive = true;
        Logger.log(`[Network] Starting hostility listeners for ${this.playerId}`);

        // Listen for Direct Hostility Updates (Inbox Pattern)
        this.dbRef.child(`users/${this.playerId}/hostility_inbox`).on('child_added', (snapshot) => {
            const val = snapshot.val();
            if (val) {
                // v1.1: Force Mutual Hostility Logic
                if (window.game && window.game.localPlayer) {
                    const lp = window.game.localPlayer;
                    const senderId = val.from;
                    const senderName = val.fromName || "Unknown";

                    // Handle ADD (Forced Hostility)
                    // If someone declares war on me, I MUST reciprocate physically
                    // (But logically, I just add them to my list so I can attack back)
                    if (val.type === 'ADD') {
                        // Avoid duplicates
                        if (!lp.hostileTargets.has(senderId)) {
                            lp.hostileTargets.set(senderId, { name: senderName, ts: val.ts || Date.now() });
                            if (window.game.ui) {
                                // Message: Someone added you, ensuring mutual hostility
                                window.game.ui.logSystemMessage(`⚔️ ${senderName}님이 당신을 적대 등록했습니다! (상호 적대 성립 / 반격 가능)`);
                                window.game.ui.updateHostilityUI();
                                window.game.sound.playSfx('pvp_alert');
                            }
                            lp.saveState(true);
                        }
                    }
                    // Handle REMOVE
                    else if (val.type === 'REMOVE') {
                        if (lp.hostileTargets.has(senderId)) {
                            lp.hostileTargets.delete(senderId);
                            if (window.game.ui) {
                                window.game.ui.logSystemMessage(`🕊️ ${senderName}님이 적대를 해제하여 평화 상태가 되었습니다.`);
                                window.game.ui.updateHostilityUI();
                            }
                            lp.saveState(true);
                        }
                    }
                }
            }
            // Auto-remove processed event
            snapshot.ref.remove();
        });
    }


    // v0.00.70: 중복 _setupPartyListeners 제거됨 (586행으로 통합)

    // v0.00.43: Send System Message
    sendSystemMessage(message, color = '#ffffff') {
        if (!this.connected) return;
        this.dbRef.child('system_messages').push({
            message: message,
            color: color,
            ts: firebase.database.ServerValue.TIMESTAMP
        });
    }

    onSystemMessage(callback) {
        this.on('systemMessage', callback);
    }
    // v2.1: Emote System
    sendEmote(emoteId, senderName = '') {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        this.dbRef.child('emotes').push({
            uid: this.playerId,
            name: senderName || this.lastPacketData?.name || 'Unknown',
            emoteId: emoteId,
            ts: firebase.database.ServerValue.TIMESTAMP
        });
    }

    _sendHeartbeat() {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        this.sendHeartbeat();
    }

    _setupEmoteListeners() {
        this.dbRef.child('emotes').on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (data && typeof data.ts === 'number' && data.ts > Date.now() - 5000) { // Recent only
                this.emit('emoteReceived', data);
            }
            // Host cleans up
            if (this.isHost) {
                snapshot.ref.remove();
            }
        });
    }

    _handleVisibilityChange() {
        if (document.hidden) {
            Logger.log("[Network] App backgrounded.");
            this.flushQueuedProfileSaves().catch(() => { });
            this.flushQueuedProfilePatches().catch(() => { });
        } else {
            Logger.log("[Network] App foregrounded. Checking connection...");
            if (this.playerId && this.dbRef) {
                // Force immediate heartbeat to say "I'm back!"
                this._sendHeartbeat();

                // Force sync check if needed
                if (this.lastSyncTime < Date.now() - 5000) {
                    Logger.log("[Network] Long absence detected, requesting sync...");
                }
            }
        }
    }
}
