import Logger from '../utils/Logger.js';
import EventEmitter from './EventEmitter.js';

const DEFAULT_ZONE_ID = 'zone_1';

export default class NetworkManager extends EventEmitter {
    constructor() {
        super();
        this.connected = false;
        this.defaultRoomId = DEFAULT_ZONE_ID;
        this.roomId = DEFAULT_ZONE_ID; // Realtime room root; field IDs carry the loaded zone id.
        this.playerId = null;
        this.dbRef = null;
        this.zoneParticipationEnabled = true;
        this.preferredPartyHostId = null;

        // Remote Players buffer
        this.remotePlayers = new Map();
        this.friends = new Map();
        this.friendThreadMeta = new Map();
        this.friendThreadMessages = new Map();
        this.friendThreadPeerRead = new Map();
        this._activeFriendThreadUid = null;
        this._activeFriendThreadListener = null;
        this._activeFriendThreadRef = null;
        this._activeFriendThreadPeerReadRef = null;
        this._activeFriendThreadPeerReadListener = null;
        this._externalDbListeners = [];

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
        this.heartbeatIntervalMs = 3000;
        this.sharedHeartbeatInterval = this.heartbeatIntervalMs;
        this.idleHeartbeatInterval = this.heartbeatIntervalMs;
        this.activeHeartbeatInterval = this.heartbeatIntervalMs;
        this.backgroundHeartbeatInterval = this.heartbeatIntervalMs;
        this.presenceStaleTimeout = 18000;
        this.friendOnlineGraceMs = 3000;
        this.friendOfflineGraceMs = 8000;
        this.sharedGhostTimeout = 15000;
        this.soloGhostTimeout = 12000;
        this.lastPacketData = null;
        this.pendingFriendGiftRefunds = [];

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
        this._blockedProfileWriteUids = new Set();
        this._profileBackupMeta = new Map();
        this._profileBackupPruneMeta = new Map();
        this._zoneUserCache = new Map();
        this._zoneUserListeners = new Map();
        this._zoneUserListenerFields = new Map();
        this._zoneUserHydrationMeta = new Map();
        this._presenceCache = new Map();
        this._presenceTsCache = new Map();
        this._friendOnlineStateCache = new Map();
        this._queuedRewardBatches = new Map();
        this._rewardBatchWindowMs = 650;
        this._rewardValidationWindow = {
            startedAt: Date.now(),
            receivedCount: 0,
            blockedCount: 0,
            totalExp: 0,
            totalManastone: 0,
            totalHp: 0,
            totalItemEntries: 0,
            totalItemAmount: 0,
            blockedReasons: {}
        };
        this._networkDropIds = new Set();
        this._lastPresenceLiteState = null;
        this._lastPresenceLiteWriteTs = 0;
        this._fieldPeerCount = 0;
        this._sharedFieldActive = false;
        this._socialSessionStartedAt = Date.now();
        this._pendingTogetherRequest = null;
        this._pendingPartyInvite = null;
        this._activeFriendThreadAutoRead = true;
        const initialNow = Date.now();
        this._visibilityState = (typeof document !== 'undefined' && document.hidden) ? 'hidden' : 'visible';
        this._visibilityChangedAt = initialNow;
        this._lastVisibleAt = this._visibilityState === 'visible' ? initialNow : 0;
        this.hostVisiblePromotionStableMs = 3000;
        this.hostHiddenGraceMs = 8000;
        this._fieldCellSize = 640;
        this._monsterCellListeners = new Map();
        this._subscribedMonsterCells = new Set();
        this._monsterSubscriptionFieldId = null;
        this._monsterCellPayloadCache = new Map();
        this._monsterPendingRemovalTimers = new Map();
        this._publishedMonsterCellMap = new Map();
        this.minimapMonsterSnapshotIntervalMs = 500;
        this._lastMinimapMonsterSnapshotWriteTs = 0;
        this._lastMinimapMonsterSnapshotSignature = '';
        this._minimapMonsterSnapshotCache = null;
        this._minimapMonsterSnapshotListener = null;
        this._minimapMonsterSnapshotFieldId = null;
        this._lastKnownFieldId = null;
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
        this.friends.clear();
        this.friendThreadMeta.clear();
        this.friendThreadMessages.clear();
        this.friendThreadPeerRead.clear();
        this._detachFriendThreadListener();
        this._detachExternalDbListeners();
        this._hostilityListenerActive = false;
        this._lastHpSync = { hp: null, maxHp: null, ts: 0 };
        this._lastProfileSaveTs = 0;
        this._zoneUserCache.clear();
        this._zoneUserHydrationMeta.clear();
        this._zoneUserListenerFields.clear();
        this._profileBackupMeta.clear();
        this._profileBackupPruneMeta.clear();
        this._detachZoneUserListeners();
        this._presenceCache.clear();
        this._presenceTsCache.clear();
        this._friendOnlineStateCache.clear();
        this._blockedProfileWriteUids.clear();
        this._clearQueuedRewardBatches();
        this._resetRewardValidationWindow();
        this._networkDropIds.clear();
        this._lastPresenceLiteState = null;
        this._lastPresenceLiteWriteTs = 0;
        this._lastMinimapMonsterSnapshotWriteTs = 0;
        this._lastMinimapMonsterSnapshotSignature = '';
        this._minimapMonsterSnapshotCache = null;
        this._minimapMonsterSnapshotFieldId = null;
        this._monsterSubscriptionFieldId = null;
        this._lastKnownFieldId = null;
        this._detachMinimapMonsterSnapshotListener();
        this._fieldPeerCount = 0;
        this._sharedFieldActive = false;
        this.preferredPartyHostId = null;
        this._resetSocialSessionState();
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
            const matchesCurrentField = this._isPayloadForCurrentField(data);
            if (data && matchesCurrentField) {
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
            if (this.isHost && matchesCurrentField) snapshot.ref.remove();
        });

        // Monster Damage Sync (Listen for damage events - Spark / Text)
        // v0.00.57: Support both single (legacy) and batched updates
        const handleMonsterDamage = (data) => {
            if (!data || !this._isPayloadForCurrentField(data)) return;
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
            const data = snapshot.val();
            const matchesCurrentField = this._isPayloadForCurrentField(data);
            handleMonsterDamage(data);
            if (this.isHost && matchesCurrentField) snapshot.ref.remove();
        });

        this.dbRef.child('monster_damage_batch').on('child_added', (snapshot) => {
            const batch = snapshot.val();
            const matchesCurrentField = this._isPayloadForCurrentField(batch);
            if (batch && batch.items && Array.isArray(batch.items) && matchesCurrentField) {
                // Check if batch is too old (> 5s)
                if (Date.now() - batch.ts < 5000) {
                    batch.items.forEach(item => handleMonsterDamage(item));
                }
            }
            if (this.isHost && matchesCurrentField) snapshot.ref.remove();
        });

        // Player Damage Sync (PvP)
        const handlePlayerDamage = (data) => {
            if (data && this._isPayloadForCurrentField(data)) this.emit('playerDamageReceived', data);
        };

        this.dbRef.child('player_damage').on('child_added', (snapshot) => {
            const data = snapshot.val();
            const matchesCurrentField = this._isPayloadForCurrentField(data);
            handlePlayerDamage(data);
            if (this.isHost && matchesCurrentField) snapshot.ref.remove();
        });

        this.dbRef.child('player_damage_batch').on('child_added', (snapshot) => {
            const batch = snapshot.val();
            const matchesCurrentField = this._isPayloadForCurrentField(batch);
            if (batch && batch.items && Array.isArray(batch.items) && matchesCurrentField) {
                if (Date.now() - batch.ts < 5000) {
                    batch.items.forEach(item => handlePlayerDamage(item));
                }
            }
            if (this.isHost && matchesCurrentField) snapshot.ref.remove();
        });

        // Reward Sync (Guest side listens for rewards targeting them)
        this.dbRef.child(`rewards/${this.playerId}`).on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const validation = this._validateIncomingRewardPayload(data, Date.now());
                if (!validation.ok) {
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
            const value = s.val();
            if (!this._isPayloadForCurrentField(value)) return;
            this._networkDropIds.add(s.key);
            this.emit('dropAdded', { id: s.key, ...value });
        });
        this.dbRef.child('drops').on('child_changed', (s) => {
            const value = s.val();
            if (!this._isPayloadForCurrentField(value)) return;
            this._networkDropIds.add(s.key);
            this.emit('dropAdded', { id: s.key, ...value });
        });
        this.dbRef.child('drops').on('child_removed', (s) => {
            const value = s.val();
            if (!this._isPayloadForCurrentField(value)) return;
            this._networkDropIds.delete(s.key);
            this.emit('dropRemoved', s.key);
        });

        // Drop Collection Listener (Host only)
        this.dbRef.child('drop_collection').on('child_added', (snapshot) => {
            if (!this.isHost) return;
            const data = snapshot.val();
            const matchesCurrentField = this._isPayloadForCurrentField(data);
            if (data && matchesCurrentField) {
                this.emit('dropCollectionRequested', {
                    dropId: data.did,
                    collectorId: data.cid
                });
            }
            if (matchesCurrentField) snapshot.ref.remove();
        });

        this.dbRef.child('boss_spawn_requests').on('child_added', (snapshot) => {
            if (!this.isHost) return;
            const data = snapshot.val();
            const matchesCurrentField = this._isPayloadForCurrentField(data);
            if (data && matchesCurrentField) {
                this.emit('bossSpawnRequested', {
                    requestId: snapshot.key,
                    requesterId: data.requesterId || null,
                    isFirstBoss: data.isFirstBoss !== false,
                    ts: Number(data.ts || Date.now())
                });
            }
            if (matchesCurrentField) snapshot.ref.remove();
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
            if (data && data.ts > Date.now() - 5000 && this._isPayloadForCurrentField(data)) { // Only very recent (5s)
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
        this._setupSocialListeners();
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
            this._detachMinimapMonsterSnapshotListener();
            this._minimapMonsterSnapshotCache = null;
        } else {
            this._publishPresenceLite({ force: true, reason: 'zone_reenabled' });
            this._refreshMonsterCellSubscriptions(this._resolveMonsterSubscriptionAnchorCellId());
            this._refreshMinimapMonsterSnapshotListener(this._getCurrentFieldId());
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
            const normalizedData = {
                ...(item.data || {}),
                fieldId: this._normalizeFieldId(item?.data?.fieldId || this._getCurrentFieldId())
            };
            const groupKey = `${item.type}::${normalizedData.fieldId}`;
            if (!acc[groupKey]) {
                acc[groupKey] = {
                    type: item.type,
                    fieldId: normalizedData.fieldId,
                    items: []
                };
            }
            acc[groupKey].items.push(normalizedData);
            return acc;
        }, {});

        // Create batched updates
        Object.values(grouped).forEach(({ type, fieldId, items }, index) => {
            const batchTs = Date.now();
            const batchId = `${batchTs}_${index}`;
            updates[`${type}_batch/${batchId}`] = {
                fieldId,
                items: items.slice(0, 10), // Max 10 items per batch
                count: items.length,
                ts: batchTs
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
        this.flushQueuedRewardBatches();
        this._flushRewardValidationWindowSummary(Date.now());
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
        this.friends.clear();
        this.friendThreadMeta.clear();
        this.friendThreadMessages.clear();
        this.friendThreadPeerRead.clear();
        this._detachFriendThreadListener();
        this._detachExternalDbListeners();
        this._hostilityListenerActive = false;
        this._lastHpSync = { hp: null, maxHp: null, ts: 0 };
        this._zoneUserCache.clear();
        this._zoneUserHydrationMeta.clear();
        this._zoneUserListenerFields.clear();
        this._detachZoneUserListeners();
        this._presenceCache.clear();
        this._presenceTsCache.clear();
        this._friendOnlineStateCache.clear();
        this._clearQueuedRewardBatches();
        this._resetRewardValidationWindow();
        this._lastPresenceLiteState = null;
        this._lastPresenceLiteWriteTs = 0;
        this._fieldPeerCount = 0;
        this._sharedFieldActive = false;
        this.preferredPartyHostId = null;
        this._monsterSubscriptionFieldId = null;
        this._lastKnownFieldId = null;
        this._resetSocialSessionState();
        this._clearMonsterCellSubscriptions({ emitRemovals: true });
        this._clearPendingMonsterRemovalTimers();
        this._monsterCellPayloadCache.clear();
        this._publishedMonsterCellMap.clear();
        this._lastMinimapMonsterSnapshotWriteTs = 0;
        this._lastMinimapMonsterSnapshotSignature = '';
        this._minimapMonsterSnapshotCache = null;
        this._minimapMonsterSnapshotFieldId = null;
        this._detachMinimapMonsterSnapshotListener();
        this.lastPacketData = null;
        this.lastSyncTime = 0;
        this.lastHeartbeatTime = 0;
        this.playerId = null;
        this.dbRef = null;
    }

    _detachAllDbListeners() {
        this._detachExternalDbListeners();
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
        this._detachMinimapMonsterSnapshotListener();

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

    _trackExternalListener(ref, eventType, callback) {
        if (!ref || !eventType || typeof callback !== 'function') return;
        ref.on(eventType, callback);
        this._externalDbListeners.push({ ref, eventType, callback });
    }

    _detachExternalDbListeners() {
        this._externalDbListeners.forEach(({ ref, eventType, callback }) => {
            try {
                ref?.off?.(eventType, callback);
            } catch (error) {
                Logger.warn('[Network] Failed to detach external DB listener', error);
            }
        });
        this._externalDbListeners = [];
    }

    _detachZoneUserListeners(uid = null) {
        if (uid) {
            const listeners = this._zoneUserListeners.get(uid) || [];
            listeners.forEach(({ ref, callback }) => ref.off('value', callback));
            this._zoneUserListeners.delete(uid);
            this._zoneUserListenerFields.delete(uid);
            return;
        }

        this._zoneUserListeners.forEach((listeners, targetUid) => {
            listeners.forEach(({ ref, callback }) => ref.off('value', callback));
            this._zoneUserListeners.delete(targetUid);
            this._zoneUserListenerFields.delete(targetUid);
        });
    }

    _normalizeFieldId(fieldId) {
        const normalized = String(fieldId || this.roomId || DEFAULT_ZONE_ID).trim();
        return normalized || DEFAULT_ZONE_ID;
    }

    _getLoadedZoneId() {
        const zone = window.game?.zone;
        return this._normalizeFieldId(
            zone?.currentZoneId
            || zone?.currentZone?.id
            || zone?.getDefaultZoneId?.()
            || this.defaultRoomId
        );
    }

    _getZoneBaseFieldId() {
        return this._getLoadedZoneId();
    }

    _buildSoloFieldId(uid = null) {
        const safeUid = String(uid || this.playerId || 'local');
        return `${this._getZoneBaseFieldId()}__solo__${safeUid}`;
    }

    _buildSharedFieldId(party = null) {
        const source = Array.isArray(party)
            ? { members: party }
            : (party && typeof party === 'object' ? party : {});
        if (source.fieldId) {
            return this._normalizeFieldId(source.fieldId);
        }

        const members = Array.from(new Set((source.members || []).filter(Boolean)));
        const hostId = members.includes(source.hostId)
            ? source.hostId
            : (members[0] || this.playerId || 'host');
        const mode = typeof source.mode === 'string' && source.mode
            ? source.mode
            : (members.length > 1 ? 'party' : 'solo');
        const prefix = mode === 'together' ? 'together' : 'party';
        return `${this._getZoneBaseFieldId()}__${prefix}__${hostId}`;
    }

    _getCurrentFieldId() {
        const localParty = this._getLocalPartyState();
        if (Array.isArray(localParty.members) && localParty.members.length > 1) {
            return this._normalizeFieldId(localParty.fieldId || this._buildSharedFieldId(localParty));
        }
        return this._normalizeFieldId(this._buildSoloFieldId());
    }

    _isPayloadForCurrentField(payload = null) {
        if (!payload || typeof payload !== 'object' || !payload.fieldId) return false;
        return this._normalizeFieldId(payload.fieldId) === this._getCurrentFieldId();
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

    _getCellChebyshevDistance(fromCellId, toCellId) {
        const from = this._parseFieldCellId(fromCellId);
        const to = this._parseFieldCellId(toCellId);
        if (!from || !to) return Number.POSITIVE_INFINITY;
        return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
    }

    _resolveZoneUserCellId(uid, state = null) {
        const presenceCellId = this._presenceCache.get(uid)?.cellId;
        if (typeof presenceCellId === 'string' && presenceCellId) {
            return presenceCellId;
        }

        const zoneState = state || this._zoneUserCache.get(uid) || {};
        const posData = zoneState?.p;
        if (Array.isArray(posData)) {
            return this._getFieldCellId(posData[0], posData[1]);
        }
        if (posData && typeof posData === 'object') {
            return this._getFieldCellId(posData.x, posData.y);
        }

        return null;
    }

    _isSamePartyMember(uid, profile = null) {
        if (!uid || uid === this.playerId) return false;
        const localMembers = Array.isArray(window.game?.localPlayer?.party?.members)
            ? window.game.localPlayer.party.members
            : [];
        if (localMembers.includes(uid)) return true;
        const remoteMembers = profile?.party?.members;
        return Array.isArray(remoteMembers) && remoteMembers.includes(this.playerId);
    }

    _trimZoneUserCachedProfileForTier(uid, tier) {
        if (!uid || uid === this.playerId) return;
        const currentState = this._zoneUserCache.get(uid) || {};
        const currentProfile = currentState.profile;
        if (!currentProfile || typeof currentProfile !== 'object') return;

        let nextProfile = currentProfile;
        if (tier === 'reduced') {
            nextProfile = {
                name: currentProfile.name,
                level: currentProfile.level,
                party: currentProfile.party,
                equipment: null,
                protectedUntil: currentProfile.protectedUntil || 0
            };
        } else if (tier === 'minimal') {
            nextProfile = {
                name: currentProfile.name,
                level: currentProfile.level,
                equipment: null
            };
        }

        if (nextProfile === currentProfile) return;
        const nextState = this._mergeZoneUserCache(uid, { profile: nextProfile });
        this._emitRemoteProfileUpdate(uid, nextState.profile || {}, nextState.hostility || {});
    }

    _resolveZoneUserHotPathTier(uid, state = null) {
        if (!uid || uid === this.playerId) return 'full';

        const currentFieldId = this._getCurrentFieldId();
        const presenceEntry = this._presenceCache.get(uid) || null;
        if (presenceEntry?.fieldId && presenceEntry.fieldId !== currentFieldId) {
            return 'minimal';
        }

        const localCellId = this._getFieldCellId();
        const remoteCellId = this._resolveZoneUserCellId(uid, state);
        if (!remoteCellId) return 'full';

        const cellDistance = this._getCellChebyshevDistance(localCellId, remoteCellId);
        if (cellDistance <= 1) return 'full';
        const peerCount = Math.max(0, Number(this._fieldPeerCount || 0));
        if (peerCount >= 10 && cellDistance > 1) return 'minimal';
        if (peerCount >= 6 && cellDistance > 2) return 'minimal';
        if (cellDistance <= 3) return 'reduced';
        return 'minimal';
    }

    _getZoneUserHotPathFields(uid, state = null) {
        const tier = this._resolveZoneUserHotPathTier(uid, state);
        const profile = state?.profile || this._zoneUserCache.get(uid)?.profile || null;
        const keepHp = this._isSamePartyMember(uid, profile);

        if (tier === 'full') {
            return { tier, fields: ['p', 'profile', 'hostility', 'a', 'ch', 'h'] };
        }

        if (tier === 'reduced') {
            const fields = ['p', 'profile_name', 'profile_level', 'profile_party', 'hostility'];
            if (keepHp) fields.push('h');
            return { tier, fields };
        }

        const fields = ['p', 'profile_name', 'profile_level'];
        if (keepHp) fields.push('h');
        return { tier: 'minimal', fields };
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

    _normalizeMinimapMonsterSnapshot(fieldId, value) {
        if (!fieldId || !value || typeof value !== 'object') return null;
        const q = Math.max(1, Number(value.q || 16));
        const items = Array.isArray(value.items)
            ? value.items
                .map((item) => {
                    if (!Array.isArray(item) || item.length < 2) return null;
                    const xq = Number(item[0]);
                    const yq = Number(item[1]);
                    if (!Number.isFinite(xq) || !Number.isFinite(yq)) return null;
                    return [xq, yq, item[2] ? 1 : 0];
                })
                .filter(Boolean)
            : [];

        return {
            fieldId: this._normalizeFieldId(fieldId),
            hostId: value.hostId || null,
            ts: Number(value.ts || 0),
            q,
            items
        };
    }

    _detachMinimapMonsterSnapshotListener() {
        const listener = this._minimapMonsterSnapshotListener;
        if (!listener) return;
        listener.ref.off('value', listener.callback);
        this._minimapMonsterSnapshotListener = null;
        this._minimapMonsterSnapshotFieldId = null;
    }

    _refreshMinimapMonsterSnapshotListener(fieldId = null) {
        const nextFieldId = this._normalizeFieldId(fieldId || this._getCurrentFieldId());
        const shouldListen = !!(
            this.connected
            && this.dbRef
            && this.zoneParticipationEnabled
            && this.isSharedFieldActive()
            && !this.isHost
        );

        if (!shouldListen) {
            this._detachMinimapMonsterSnapshotListener();
            if (!this.isSharedFieldActive()) {
                this._minimapMonsterSnapshotCache = null;
            }
            return;
        }

        if (this._minimapMonsterSnapshotFieldId === nextFieldId && this._minimapMonsterSnapshotListener) {
            return;
        }

        this._detachMinimapMonsterSnapshotListener();

        const ref = this.dbRef.child(`minimap_monsters/${nextFieldId}`);
        const callback = (snapshot) => {
            this._minimapMonsterSnapshotCache = this._normalizeMinimapMonsterSnapshot(nextFieldId, snapshot.val());
        };

        ref.on('value', callback);
        this._minimapMonsterSnapshotListener = { ref, callback };
        this._minimapMonsterSnapshotFieldId = nextFieldId;
    }

    _buildMinimapMonsterSnapshotPayload(monsters, options = {}) {
        const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());
        const q = Math.max(4, Math.round(Number(options.quantization || 16)));
        const entries = monsters instanceof Map
            ? Array.from(monsters.entries())
            : Array.isArray(monsters)
                ? monsters.map((monster, index) => [monster?.id || `m_${index}`, monster])
                : [];

        const items = entries
            .filter(([, monster]) => monster && !monster.isDead && Number(monster.hp || 0) > 0)
            .sort(([aId], [bId]) => String(aId).localeCompare(String(bId)))
            .map(([, monster]) => [
                Math.round(Number(monster.x || 0) / q),
                Math.round(Number(monster.y || 0) / q),
                (monster.isBoss || monster.typeId === 'king_slime') ? 1 : 0
            ]);

        return { fieldId, q, items };
    }

    publishMinimapMonsterSnapshot(monsters, options = {}) {
        if (!this.connected || !this.isHost || !this.dbRef || !this.zoneParticipationEnabled) return;
        if (!this.isSharedFieldActive()) return;

        const now = Date.now();
        if (!options.force && (now - this._lastMinimapMonsterSnapshotWriteTs) < this.minimapMonsterSnapshotIntervalMs) {
            return;
        }

        const payload = this._buildMinimapMonsterSnapshotPayload(monsters, options);
        const signature = `${payload.fieldId}|${payload.q}|${payload.items.map((item) => item.join(',')).join('|')}`;
        if (!options.force && signature === this._lastMinimapMonsterSnapshotSignature) {
            this._lastMinimapMonsterSnapshotWriteTs = now;
            return;
        }

        const safePayload = {
            hostId: this.playerId,
            ts: now,
            q: payload.q,
            items: payload.items
        };

        this._recordNetworkWrite('minimapMonsterSnapshot', safePayload, payload.items.length);
        this.dbRef.child(`minimap_monsters/${payload.fieldId}`).set(safePayload).catch(() => { });
        this._minimapMonsterSnapshotCache = {
            fieldId: payload.fieldId,
            ...safePayload
        };
        this._lastMinimapMonsterSnapshotWriteTs = now;
        this._lastMinimapMonsterSnapshotSignature = signature;
    }

    getMinimapMonsterEntries(fallbackMonsters = null) {
        const normalizeFallback = () => {
            if (fallbackMonsters instanceof Map) {
                return Array.from(fallbackMonsters.values());
            }
            if (Array.isArray(fallbackMonsters)) {
                return fallbackMonsters;
            }
            return [];
        };

        if (this.isHost || !this.isSharedFieldActive()) {
            return normalizeFallback();
        }

        const currentFieldId = this._normalizeFieldId(this._getCurrentFieldId());
        const snapshot = this._minimapMonsterSnapshotCache;
        const hostMatches = !!(
            snapshot?.hostId
            && this.currentHostId
            && snapshot.hostId === this.currentHostId
        );
        if (snapshot
            && snapshot.fieldId === currentFieldId
            && hostMatches
            && snapshot.ts > 0
            && (Date.now() - snapshot.ts) < 4000) {
            return snapshot.items.map((item) => ({
                x: item[0] * snapshot.q,
                y: item[1] * snapshot.q,
                isBoss: !!item[2],
                typeId: item[2] ? 'king_slime' : 'slime',
                isDead: false
            }));
        }

        return normalizeFallback();
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
        const visibilitySnapshot = this._getLocalVisibilitySnapshot(now);
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
            appearance: this._buildPresenceAppearance(player),
            visibility: visibilitySnapshot.visibility,
            visibilityTs: visibilitySnapshot.visibilityTs,
            lastVisibleTs: visibilitySnapshot.lastVisibleTs
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
        this._lastKnownFieldId = nextPayload.fieldId;
        this._refreshMonsterCellSubscriptions(this._resolveMonsterSubscriptionAnchorCellId(options));
        this._refreshMinimapMonsterSnapshotListener(nextPayload.fieldId);
        this._refreshAllZoneUserHotPathTiers('local_cell_change');
    }

    _normalizePresenceSnapshot(uid, value) {
        if (!uid || !value || typeof value !== 'object') return null;
        const cachedTs = Number(this._presenceTsCache.get(uid) || 0);
        const snapshotTs = Number(value.ts || 0);
        const rawVisibility = value.visibility === 'hidden' ? 'hidden' : 'visible';
        const visibilityTs = Number(value.visibilityTs || snapshotTs || cachedTs || 0);
        const lastVisibleTs = Number(value.lastVisibleTs
            || (rawVisibility === 'visible' ? (visibilityTs || snapshotTs || cachedTs || 0) : 0)
            || 0);
        return {
            uid,
            fieldId: this._normalizeFieldId(value.fieldId),
            cellId: typeof value.cellId === 'string' ? value.cellId : '0_0',
            mode: value.mode === 'shared_realtime' ? 'shared_realtime' : 'presence_lite',
            ts: cachedTs > 0 ? cachedTs : snapshotTs,
            name: value.name || 'Unknown',
            level: Number(value.level || 1),
            visibility: rawVisibility,
            visibilityTs,
            lastVisibleTs
        };
    }

    _getLocalVisibilitySnapshot(now = Date.now()) {
        const fallbackVisible = !(typeof document !== 'undefined' && document.hidden);
        const visibility = this._visibilityState === 'hidden' ? 'hidden' : (fallbackVisible ? 'visible' : 'hidden');
        const visibilityTs = Number(this._visibilityChangedAt || now);
        const lastVisibleTs = Number(
            this._lastVisibleAt
            || (visibility === 'visible' ? visibilityTs : 0)
            || 0
        );
        return { visibility, visibilityTs, lastVisibleTs };
    }

    _noteVisibilityState(isVisible, now = Date.now()) {
        const nextVisibility = isVisible ? 'visible' : 'hidden';
        if (this._visibilityState !== nextVisibility) {
            this._visibilityState = nextVisibility;
            this._visibilityChangedAt = now;
        }
        if (nextVisibility === 'visible') {
            this._lastVisibleAt = now;
            this._visibilityChangedAt = now;
        }
    }

    _buildHostCandidate(uid, now = Date.now()) {
        if (!uid) return null;
        if (uid !== this.playerId && !this._canShareFieldWith(uid)) return null;

        const currentFieldId = this._getCurrentFieldId();
        const isSelf = uid === this.playerId;
        const presenceEntry = isSelf
            ? {
                uid,
                fieldId: currentFieldId,
                ts: Number(this.userLastSeen.get(uid) || now),
                ...this._getLocalVisibilitySnapshot(now)
            }
            : (this._presenceCache.get(uid) || null);

        if (!presenceEntry) return null;
        if (presenceEntry.fieldId !== currentFieldId) return null;

        const lastSeen = Number(this.userLastSeen.get(uid) || presenceEntry.ts || 0);
        const active = isSelf
            ? !!this.connected
            : (this.connectedUsers.includes(uid) && lastSeen > 0 && (now - lastSeen) < this.presenceStaleTimeout);
        if (!active) return null;

        const visibility = presenceEntry.visibility === 'hidden' ? 'hidden' : 'visible';
        const visibilityTs = Number(presenceEntry.visibilityTs || presenceEntry.ts || now);
        const lastVisibleTs = Number(
            presenceEntry.lastVisibleTs
            || (visibility === 'visible' ? visibilityTs : 0)
            || 0
        );
        const visibleStable = visibility === 'visible'
            && (now - visibilityTs) >= this.hostVisiblePromotionStableMs;
        const hiddenWithinGrace = visibility === 'hidden'
            && (now - visibilityTs) < this.hostHiddenGraceMs;

        let bucket = 1;
        if (visibleStable) {
            bucket = 3;
        } else if (visibility === 'visible' || hiddenWithinGrace) {
            bucket = 2;
        }
        if (this.preferredPartyHostId && uid === this.preferredPartyHostId) {
            bucket = 4;
        }

        return {
            uid,
            bucket,
            visibility,
            visibilityTs,
            lastVisibleTs,
            lastSeen
        };
    }

    _compareHostCandidates(a, b) {
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;
        if (a.bucket !== b.bucket) return b.bucket - a.bucket;
        if (a.lastVisibleTs !== b.lastVisibleTs) return b.lastVisibleTs - a.lastVisibleTs;
        if (a.lastSeen !== b.lastSeen) return b.lastSeen - a.lastSeen;
        return String(a.uid).localeCompare(String(b.uid));
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

    _preservePresenceLastSeen(uid, ...candidateTimestamps) {
        if (!uid) return 0;

        const preservedTs = Math.max(
            0,
            ...candidateTimestamps.map((value) => Number(value || 0)),
            Number(this.userLastSeen.get(uid) || 0),
            Number(this._presenceTsCache.get(uid) || 0),
            Number(this._presenceCache.get(uid)?.ts || 0)
        );

        if (preservedTs > 0) {
            this.userLastSeen.set(uid, preservedTs);
            return preservedTs;
        }

        this.userLastSeen.delete(uid);
        return 0;
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

        this._refreshZoneUserHotPathTier(uid, reason);

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
        this.emit('presenceChanged', { uid });
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
        this.emit('presenceChanged', { uid });
    }

    _handlePresenceTsRemoved(snapshot) {
        const uid = snapshot?.key;
        if (!uid) return;

        const previousEntry = this._presenceCache.get(uid) || null;
        const preservedTs = this._preservePresenceLastSeen(uid, previousEntry?.ts);
        this._presenceTsCache.delete(uid);

        if (!previousEntry) {
            this._checkHostStatus();
            return;
        }

        const nextEntry = { ...previousEntry, ts: preservedTs || 0 };
        this._presenceCache.set(uid, nextEntry);
        this._emitFieldPeerPresenceChanged(uid, previousEntry, nextEntry);
        this._refreshSharedFieldState();
        this._checkHostStatus();
        this.emit('presenceChanged', { uid });
    }

    _handlePresenceRemoved(snapshot) {
        const uid = snapshot?.key;
        if (!uid) return;
        const previousEntry = this._presenceCache.get(uid) || null;
        this._preservePresenceLastSeen(uid, previousEntry?.ts);
        this._presenceCache.delete(uid);
        this._presenceTsCache.delete(uid);
        this.connectedUsers = this.connectedUsers.filter((id) => id !== uid);
        this.connectedUsers.sort();
        this._emitFieldPeerPresenceChanged(uid, previousEntry, null);
        this._removeRemoteIfOutOfField(uid, null);
        this._refreshSharedFieldState();
        this._checkHostStatus();
        this.emit('presenceChanged', { uid });
    }

    _removeRemoteIfOutOfField(uid, presenceEntry) {
        if (!uid || uid === this.playerId) return;
        if (!this._canShareFieldWith(uid)) {
            if (!this.remotePlayers.has(uid)) return;
            this.remotePlayers.delete(uid);
            this.emit('playerLeft', uid);
            return;
        }
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
            if (!this._canShareFieldWith(uid)) return;
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
            this._refreshAllZoneUserHotPathTiers('peer_count_change');
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
                if (this.isHost && this.dbRef) {
                    this.dbRef.child(`minimap_monsters/${fieldId}`).remove().catch(() => { });
                }
                this._lastMinimapMonsterSnapshotWriteTs = 0;
                this._lastMinimapMonsterSnapshotSignature = '';
                this._minimapMonsterSnapshotCache = null;
            }
        }

        this._refreshMinimapMonsterSnapshotListener(fieldId);
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
        if (!this._canShareFieldWith(uid)) return;
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
        if (!this._canShareFieldWith(uid)) return;
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
        if (!this._canShareFieldWith(uid)) return;
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
        if (!this._canShareFieldWith(uid)) return null;

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
        this._refreshZoneUserHotPathTier(uid, 'position_update');
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

    _handleZoneUserProfileFragmentValue(uid, key, value) {
        if (!key) return;
        const currentProfile = {
            ...(this._zoneUserCache.get(uid)?.profile || {})
        };
        if (value === undefined || value === null) {
            delete currentProfile[key];
        } else {
            currentProfile[key] = value;
        }
        const state = this._mergeZoneUserCache(uid, { profile: currentProfile });
        this._ensureRemotePlayerBuffered(uid, { emitTransientState: true });
        this._emitRemoteProfileUpdate(uid, state.profile || {}, state.hostility || {});
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
            case 'profile_name':
                this._handleZoneUserProfileFragmentValue(uid, 'name', value);
                break;
            case 'profile_level':
                this._handleZoneUserProfileFragmentValue(uid, 'level', value);
                break;
            case 'profile_party':
                this._handleZoneUserProfileFragmentValue(uid, 'party', value);
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

    _attachZoneUserHotPathListeners(uid, initialState = {}, options = {}) {
        if (!this.dbRef || !uid || uid === this.playerId) return;

        const resolved = options.fields
            ? {
                tier: options.tier || 'custom',
                fields: Array.from(new Set(options.fields.filter(Boolean)))
            }
            : this._getZoneUserHotPathFields(uid, initialState);
        const nextFieldKey = resolved.fields.slice().sort().join('|');
        if (this._zoneUserListenerFields.get(uid) === nextFieldKey) return;

        this._detachZoneUserListeners(uid);

        const userRef = this.dbRef.child(`users/${uid}`);
        const listeners = [];
        const watchKeys = resolved.fields;

        watchKeys.forEach((fieldKey) => {
            let skipInitial = Object.prototype.hasOwnProperty.call(initialState, fieldKey);
            let ref = userRef.child(fieldKey);
            switch (fieldKey) {
                case 'profile_name':
                    ref = userRef.child('profile/name');
                    break;
                case 'profile_level':
                    ref = userRef.child('profile/level');
                    break;
                case 'profile_party':
                    ref = userRef.child('profile/party');
                    break;
                default:
                    break;
            }
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
        this._zoneUserListenerFields.set(uid, nextFieldKey);
    }

    _refreshZoneUserHotPathTier(uid, reason = 'tier_refresh') {
        if (!uid || uid === this.playerId) return;
        const state = this._zoneUserCache.get(uid) || {};
        const previousFieldKey = this._zoneUserListenerFields.get(uid) || '';
        const resolved = this._getZoneUserHotPathFields(uid, state);
        const nextFieldKey = resolved.fields.slice().sort().join('|');
        if (previousFieldKey === nextFieldKey) return;

        if (resolved.tier !== 'full') {
            this._trimZoneUserCachedProfileForTier(uid, resolved.tier);
        }
        this._attachZoneUserHotPathListeners(uid, state, resolved);
        if (resolved.tier === 'full') {
            this._requestZoneUserHydration(uid, `hotpath_${reason}_full`);
        }
    }

    _refreshAllZoneUserHotPathTiers(reason = 'bulk_tier_refresh') {
        this.connectedUsers.forEach((uid) => {
            if (uid === this.playerId) return;
            this._refreshZoneUserHotPathTier(uid, reason);
        });
    }

    _resetRewardValidationWindow(now = Date.now()) {
        this._rewardValidationWindow = {
            startedAt: now,
            receivedCount: 0,
            blockedCount: 0,
            totalExp: 0,
            totalManastone: 0,
            totalHp: 0,
            totalItemEntries: 0,
            totalItemAmount: 0,
            blockedReasons: {}
        };
    }

    _flushRewardValidationWindowSummary(now = Date.now()) {
        const windowStats = this._rewardValidationWindow;
        if (!windowStats) {
            this._resetRewardValidationWindow(now);
            return;
        }

        if (windowStats.blockedCount > 0) {
            const reasons = Object.entries(windowStats.blockedReasons || {})
                .map(([reason, count]) => `${reason}:${count}`)
                .join(', ');
            Logger.warn(
                `[AntiCheat] Reward window summary ${windowStats.receivedCount} received, `
                + `${windowStats.blockedCount} blocked`
                + (reasons ? ` (${reasons})` : '')
            );
        }

        this._resetRewardValidationWindow(now);
    }

    _rollRewardValidationWindow(now = Date.now()) {
        const startedAt = Number(this._rewardValidationWindow?.startedAt || 0);
        if (!startedAt || (now - startedAt) < 60000) return;
        this._flushRewardValidationWindowSummary(now);
    }

    _recordRewardValidationBlock(reason = 'unknown') {
        this._rewardValidationWindow.blockedCount += 1;
        this._rewardValidationWindow.blockedReasons[reason] = (this._rewardValidationWindow.blockedReasons[reason] || 0) + 1;
    }

    _validateIncomingRewardPayload(data, now = Date.now()) {
        this._rollRewardValidationWindow(now);
        this._rewardValidationWindow.receivedCount += 1;

        if (!data.hostId || data.hostId !== this.currentHostId) {
            this._recordRewardValidationBlock('non_host');
            return { ok: false, reason: 'non_host' };
        }

        if (data.ts && (now - data.ts > 10000)) {
            this._recordRewardValidationBlock('stale');
            return { ok: false, reason: 'stale' };
        }

        const itemEntries = Array.isArray(data.items) ? data.items.length : 0;
        const itemAmount = Array.isArray(data.items)
            ? data.items.reduce((sum, item) => sum + Math.max(1, Number(item?.amount || 1)), 0)
            : 0;
        const nextExpTotal = this._rewardValidationWindow.totalExp + Math.max(0, Number(data.exp || 0));
        const rewardManastone = Math.max(0, Number(data.manastone ?? data.gold ?? 0));
        const nextManastoneTotal = this._rewardValidationWindow.totalManastone + rewardManastone;
        const nextHpTotal = this._rewardValidationWindow.totalHp + Math.max(0, Number(data.hp || 0));
        const nextItemEntryTotal = this._rewardValidationWindow.totalItemEntries + itemEntries;
        const nextItemAmountTotal = this._rewardValidationWindow.totalItemAmount + itemAmount;

        if (nextExpTotal > 250000) {
            this._recordRewardValidationBlock('exp_window');
            return { ok: false, reason: 'exp_window' };
        }
        if (nextManastoneTotal > 250000) {
            this._recordRewardValidationBlock('manastone_window');
            return { ok: false, reason: 'manastone_window' };
        }
        if (nextHpTotal > 60000) {
            this._recordRewardValidationBlock('hp_window');
            return { ok: false, reason: 'hp_window' };
        }
        if (nextItemEntryTotal > 320 || nextItemAmountTotal > 3200) {
            this._recordRewardValidationBlock('item_window');
            return { ok: false, reason: 'item_window' };
        }

        this._rewardValidationWindow.totalExp = nextExpTotal;
        this._rewardValidationWindow.totalManastone = nextManastoneTotal;
        this._rewardValidationWindow.totalHp = nextHpTotal;
        this._rewardValidationWindow.totalItemEntries = nextItemEntryTotal;
        this._rewardValidationWindow.totalItemAmount = nextItemAmountTotal;
        return { ok: true, reason: 'accepted' };
    }

    _clearQueuedRewardBatches() {
        this._queuedRewardBatches.forEach((entry) => {
            if (entry?.timer) clearTimeout(entry.timer);
        });
        this._queuedRewardBatches.clear();
    }

    _canBatchReward(data = {}) {
        if (!data || typeof data !== 'object') return false;
        if (data.immediate === true) return false;
        if (data.questKill === 'king_slime' || data.bossCycle) return false;
        return true;
    }

    _mergeRewardPayload(base = {}, incoming = {}) {
        const next = {
            ...base,
            exp: Math.max(0, Number(base.exp || 0)) + Math.max(0, Number(incoming.exp || 0)),
            manastone: Math.max(0, Number(base.manastone ?? base.gold ?? 0))
                + Math.max(0, Number(incoming.manastone ?? incoming.gold ?? 0)),
            hp: Math.max(0, Number(base.hp || 0)) + Math.max(0, Number(incoming.hp || 0))
        };

        if (incoming.monsterName) next.monsterName = incoming.monsterName;

        const mergedItems = new Map();
        const collectItem = (item) => {
            if (!item) return;
            const itemId = item.id || item.type;
            if (!itemId) return;
            const isUniqueItem = item.stackable === false
                || !!item.instanceId
                || !!item.slot
                || !!item.rolledValues;
            const key = isUniqueItem
                ? `unique:${item.instanceId || `${itemId}:${mergedItems.size}`}`
                : `${itemId}:${item.prefixId || ''}:${item.enhancementLevel || 0}`;
            const previous = mergedItems.get(key) || { ...item, amount: 0 };
            previous.amount += Math.max(1, Number(item.amount || 1));
            mergedItems.set(key, previous);
        };

        (Array.isArray(base.items) ? base.items : []).forEach(collectItem);
        (Array.isArray(incoming.items) ? incoming.items : []).forEach(collectItem);
        if (mergedItems.size > 0) {
            next.items = Array.from(mergedItems.values());
        } else {
            delete next.items;
        }

        const nextQuestKills = { ...(base.questKills || {}) };
        if (typeof base.questKill === 'string' && base.questKill !== 'king_slime') {
            nextQuestKills[base.questKill] = (nextQuestKills[base.questKill] || 0) + 1;
        }
        if (typeof incoming.questKill === 'string' && incoming.questKill !== 'king_slime') {
            nextQuestKills[incoming.questKill] = (nextQuestKills[incoming.questKill] || 0) + 1;
        }
        if (incoming.questKills && typeof incoming.questKills === 'object') {
            Object.entries(incoming.questKills).forEach(([key, value]) => {
                const safeCount = Math.max(0, Number(value || 0));
                if (safeCount <= 0 || key === 'king_slime') return;
                nextQuestKills[key] = (nextQuestKills[key] || 0) + safeCount;
            });
        }
        if (Object.keys(nextQuestKills).length > 0) {
            next.questKills = nextQuestKills;
        } else {
            delete next.questKills;
        }
        delete next.questKill;
        delete next.immediate;
        return next;
    }

    _flushQueuedRewardBatch(playerId) {
        const entry = this._queuedRewardBatches.get(playerId);
        if (!entry) return;
        if (entry.timer) clearTimeout(entry.timer);
        this._queuedRewardBatches.delete(playerId);

        const safeData = {
            ...entry.payload,
            hostId: this.playerId,
            ts: Date.now()
        };
        this._recordNetworkWrite('rewardBatch', safeData);
        this.dbRef.child(`rewards/${playerId}`).push(safeData).catch(() => { });
    }

    _queueRewardBatch(playerId, data) {
        const existing = this._queuedRewardBatches.get(playerId) || {
            payload: {},
            timer: null
        };
        existing.payload = this._mergeRewardPayload(existing.payload, data);
        if (existing.timer) clearTimeout(existing.timer);
        existing.timer = setTimeout(() => this._flushQueuedRewardBatch(playerId), this._rewardBatchWindowMs);
        this._queuedRewardBatches.set(playerId, existing);
    }

    flushQueuedRewardBatches() {
        Array.from(this._queuedRewardBatches.keys()).forEach((playerId) => {
            this._flushQueuedRewardBatch(playerId);
        });
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

        const encodeState = (state) => {
            switch (state) {
                case 'aggro': return 1;
                case 'casting': return 2;
                case 'charging': return 3;
                case 'dead': return 4;
                case 'idle':
                default:
                    return 0;
            }
        };

        const encodeType = (type) => {
            switch (type) {
                case 'slime': return 's';
                case 'slime_split': return 'ss';
                case 'king_slime': return 'ks';
                case 'training_dummy': return 'td';
                default:
                    return type || 's';
            }
        };

        const nextPayload = {
            x: payload.x,
            y: payload.y,
            hp: payload.hp,
            m: payload.maxHp,
            tp: encodeType(payload.type),
            r: payload.rev,
            t: payload.ts,
            s: encodeState(payload.state)
        };

        if (payload.chargeOnly) nextPayload.c = 1;
        if (payload.fullSync) nextPayload.f = 1;
        if (payload.isBoss) nextPayload.b = 1;
        if (Number.isFinite(payload.w)) nextPayload.w = payload.w;
        if (Number.isFinite(payload.h)) nextPayload.h = payload.h;

        return nextPayload;
    }

    _sanitizeRealtimePayloadValue(value) {
        if (value === undefined) return undefined;
        if (value === null) return null;

        if (typeof value === 'number') {
            return Number.isFinite(value) ? value : undefined;
        }

        if (typeof value === 'string' || typeof value === 'boolean') {
            return value;
        }

        if (Array.isArray(value)) {
            return value.map((entry) => {
                const sanitizedEntry = this._sanitizeRealtimePayloadValue(entry);
                return sanitizedEntry === undefined ? null : sanitizedEntry;
            });
        }

        if (typeof value === 'object') {
            const sanitizedObject = {};
            Object.entries(value).forEach(([key, entry]) => {
                const sanitizedEntry = this._sanitizeRealtimePayloadValue(entry);
                if (sanitizedEntry !== undefined) {
                    sanitizedObject[key] = sanitizedEntry;
                }
            });
            return Object.keys(sanitizedObject).length > 0 ? sanitizedObject : null;
        }

        return undefined;
    }

    _decorateMonsterCellPayload(cellId, payload) {
        if (!payload || typeof payload !== 'object') return null;

        const decodeState = (state) => {
            switch (state) {
                case 1: return 'aggro';
                case 2: return 'casting';
                case 3: return 'charging';
                case 4: return 'dead';
                case 'aggro':
                case 'casting':
                case 'charging':
                case 'dead':
                case 'idle':
                    return state;
                case 0:
                default:
                    return 'idle';
            }
        };

        const decodeType = (type) => {
            switch (type) {
                case 's': return 'slime';
                case 'ss': return 'slime_split';
                case 'ks': return 'king_slime';
                case 'td': return 'training_dummy';
                default:
                    return type || 'slime';
            }
        };

        return {
            x: payload.x,
            y: payload.y,
            hp: payload.hp ?? payload.h ?? 0,
            maxHp: payload.maxHp ?? payload.m ?? 100,
            type: decodeType(payload.type ?? payload.tp),
            chargeOnly: payload.chargeOnly !== undefined ? !!payload.chargeOnly : !!payload.c,
            rev: payload.rev ?? payload.r ?? 0,
            ts: payload.ts ?? payload.t ?? 0,
            state: decodeState(payload.state ?? payload.s),
            fullSync: payload.fullSync !== undefined ? !!payload.fullSync : !!payload.f,
            isBoss: payload.isBoss !== undefined ? !!payload.isBoss : !!payload.b,
            w: payload.w,
            h: payload.h,
            cellId: typeof payload.cellId === 'string' ? payload.cellId : cellId
        };
    }

    _getMoveSyncInterval(vx = 0, vy = 0) {
        const speed = Math.hypot(vx || 0, vy || 0);
        const sharedFieldActive = this.isSharedFieldActive();
        const idleInterval = sharedFieldActive
            ? Math.max(260, this.idleSyncInterval - 120)
            : this.idleSyncInterval;
        const walkInterval = sharedFieldActive
            ? Math.max(95, this.walkSyncInterval - 30)
            : this.walkSyncInterval;
        const runInterval = sharedFieldActive
            ? Math.max(70, this.syncInterval - 15)
            : this.syncInterval;

        if (speed <= 0.1) return idleInterval;
        if (speed < 90) return walkInterval;
        return runInterval;
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
        const interval = this.heartbeatIntervalMs;

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

        const fieldId = this._monsterSubscriptionFieldId || this._getCurrentFieldId();
        const ref = this.dbRef.child(`monster_cells/${fieldId}/${cellId}`);
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
        this._monsterSubscriptionFieldId = null;
    }

    _refreshMonsterCellSubscriptions(anchorCellId = null) {
        if (!this.shouldUseMonsterCellSync()) {
            this._clearMonsterCellSubscriptions({ emitRemovals: true });
            return;
        }
        if (!this.connected || !this.dbRef || !this.zoneParticipationEnabled) return;

        const nextFieldId = this._getCurrentFieldId();
        if (this._monsterSubscriptionFieldId && this._monsterSubscriptionFieldId !== nextFieldId) {
            this._clearMonsterCellSubscriptions({ emitRemovals: true });
        }
        this._monsterSubscriptionFieldId = nextFieldId;

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
            const fieldId = this._getCurrentFieldId();
            const snapshot = await this.dbRef.child(`monster_host_snapshot/${fieldId}`).once('value');
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

    getRecoveryProfileRef(uid) {
        return uid && window.firebase ? firebase.database().ref(`recovery_profiles/${uid}`) : null;
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

    _resolveRecoveryUid(profile = null, fallbackUid = null) {
        const raw = profile && typeof profile === 'object'
            ? (profile.recoveryUid || profile.stableUid || profile.recoveredFromUid || fallbackUid)
            : fallbackUid;
        const normalized = String(raw || '').trim();
        return normalized || null;
    }

    async _syncRecoveryProfile(uid, profile = null) {
        if (!uid || !window.firebase || !profile) return null;

        const normalizedProfile = this._normalizeProfileSnapshot(profile, Date.now());
        const recoveryUid = this._resolveRecoveryUid(normalizedProfile, uid);
        if (!recoveryUid) return null;

        normalizedProfile.recoveryUid = recoveryUid;
        const nextTs = Number(normalizedProfile.ts || Date.now());
        const recoveryRef = this.getRecoveryProfileRef(recoveryUid);
        if (!recoveryRef) return null;

        const payload = {
            recoveryUid,
            latestUid: uid,
            ts: nextTs,
            profile: normalizedProfile
        };

        await recoveryRef.transaction((current) => {
            const currentTs = Number(current?.ts || 0);
            if (currentTs > nextTs) return;
            return payload;
        });

        return payload;
    }

    async getLatestProfileSnapshot(uid) {
        if (!uid || !window.firebase) return null;

        try {
            const [profileSnapshot, backupSnapshot, recoverySnapshot] = await Promise.all([
                this.getProfileRef(uid)?.once('value'),
                this.getProfileBackupsRef(uid)?.orderByChild('ts').limitToLast(1).once('value'),
                this.getRecoveryProfileRef(uid)?.once('value')
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

            const recoveryEntry = recoverySnapshot?.val() || null;
            const recoveryProfile = recoveryEntry?.profile
                ? this._normalizeProfileSnapshot(recoveryEntry.profile, recoveryEntry.ts || Date.now())
                : null;
            if (recoveryProfile) {
                recoveryProfile.recoveryUid = this._resolveRecoveryUid(recoveryProfile, recoveryEntry?.recoveryUid || uid);
            }

            let bestSnapshot = null;
            const consider = (candidate) => {
                if (!candidate?.profile) return;
                if (!bestSnapshot || Number(candidate.ts || 0) > Number(bestSnapshot.ts || 0)) {
                    bestSnapshot = candidate;
                }
            };

            consider(normalizedProfile ? {
                profile: normalizedProfile,
                ts: normalizedProfile.ts || 0,
                source: 'profile',
                backupId: null,
                latestUid: uid,
                recoveryUid: this._resolveRecoveryUid(normalizedProfile, uid)
            } : null);

            consider(backupProfile ? {
                profile: backupProfile,
                ts: backupProfile.ts || 0,
                source: 'backup',
                backupId: latestBackup?.id || null,
                latestUid: uid,
                recoveryUid: this._resolveRecoveryUid(backupProfile, uid)
            } : null);

            consider(recoveryProfile ? {
                profile: recoveryProfile,
                ts: Number(recoveryEntry?.ts || recoveryProfile.ts || 0),
                source: 'recovery',
                backupId: null,
                latestUid: recoveryEntry?.latestUid || uid,
                recoveryUid: this._resolveRecoveryUid(recoveryProfile, recoveryEntry?.recoveryUid || uid)
            } : null);

            return bestSnapshot;
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
        if (uid && this._blockedProfileWriteUids.has(uid)) {
            return { ok: false, reason: 'profile_write_blocked' };
        }
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
        if (this._blockedProfileWriteUids.has(uid)) {
            return { ok: false, reason: 'profile_write_blocked' };
        }

        if (this._queuedProfileSaves.has(uid)) {
            const queued = this._queuedProfileSaves.get(uid);
            queued.data = this._mergeProfileData(queued.data || {}, patchData);
            queued.syncToZone = queued.syncToZone || !!options.syncToZone;
            const shouldFlushQueuedSaveNow = !!options.forceImmediate || Number(options.debounceMs || 0) <= 0;
            if (shouldFlushQueuedSaveNow) {
                if (queued?.timer) clearTimeout(queued.timer);
                this._queuedProfileSaves.delete(uid);
                try {
                    const result = await this._commitPlayerData(uid, queued.data, queued.syncToZone, {
                        ...queued.options,
                        ...options,
                        debounceMs: 0,
                        forceImmediate: true
                    });
                    queued.waiters.forEach(({ resolve }) => resolve(result));
                    return result;
                } catch (error) {
                    queued.waiters.forEach(({ reject }) => reject(error));
                    throw error;
                }
            }
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

    _clearQueuedProfileWrites(uid, reason = 'profile_deleted') {
        if (!uid) return;

        const queuedSave = this._queuedProfileSaves.get(uid);
        if (queuedSave?.timer) clearTimeout(queuedSave.timer);
        if (queuedSave) {
            this._queuedProfileSaves.delete(uid);
            queuedSave.waiters?.forEach(({ resolve }) => resolve({ ok: false, reason }));
        }

        const queuedPatch = this._queuedProfilePatches.get(uid);
        if (queuedPatch?.timer) clearTimeout(queuedPatch.timer);
        if (queuedPatch) {
            this._queuedProfilePatches.delete(uid);
            queuedPatch.waiters?.forEach(({ resolve }) => resolve({ ok: false, reason }));
        }
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
            nextProfile.recoveryUid = this._resolveRecoveryUid(nextProfile, uid);
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

            await this._syncRecoveryProfile(uid, committedProfile);

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

            const committedProfileSnapshot = await this.getProfileRef(uid)?.once('value');
            const committedProfile = committedProfileSnapshot?.val()
                ? this._normalizeProfileSnapshot(committedProfileSnapshot.val(), nextPatch.ts)
                : this._normalizeProfileSnapshot(nextPatch, nextPatch.ts);
            await this._syncRecoveryProfile(uid, committedProfile);

            return { ok: true, patch: nextPatch, profile: committedProfile };
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
        recoveredProfile.recoveryUid = this._resolveRecoveryUid(sourceSnapshot.profile, sourceUid);
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
        const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());

        try {
            await Promise.all([
                this.dbRef.child(`monster_cells/${fieldId}`).remove(),
                this.dbRef.child(`monster_host_snapshot/${fieldId}`).remove(),
                this.dbRef.child(`minimap_monsters/${fieldId}`).remove(),
                this._removeDropsForField(fieldId),
                Promise.resolve(resetSlimeKillCount)
            ]);

            this.monsterUpdateQueue.clear();
            this._publishedMonsterCellMap.clear();
            this._monsterCellPayloadCache.clear();
            this._networkDropIds.clear();
            return true;
        } catch (error) {
            Logger.error('Failed to clear world combat state', error);
            return false;
        }
    }

    async _removeDropsForField(fieldId) {
        if (!this.dbRef || !fieldId) return;

        const normalizedFieldId = this._normalizeFieldId(fieldId);
        const snapshot = await this.dbRef.child('drops').once('value');
        const raw = snapshot.val() || {};
        const updates = {};
        Object.entries(raw).forEach(([dropId, value]) => {
            if (!value || typeof value !== 'object' || !value.fieldId) return;
            if (this._normalizeFieldId(value.fieldId) !== normalizedFieldId) return;
            updates[`drops/${dropId}`] = null;
        });

        if (Object.keys(updates).length > 0) {
            await this.dbRef.update(updates);
        }
    }

    _cleanupFieldScopedRealtimeState(fieldId, options = {}) {
        if (!this.dbRef || !fieldId) return;

        const normalizedFieldId = this._normalizeFieldId(fieldId);
        const updates = {
            [`monster_cells/${normalizedFieldId}`]: null,
            [`monster_host_snapshot/${normalizedFieldId}`]: null,
            [`minimap_monsters/${normalizedFieldId}`]: null
        };

        this.dbRef.update(updates).catch((error) => {
            Logger.warn('[Network] Failed to clean previous field realtime state', error);
        });

        if (options.removeDrops) {
            this._removeDropsForField(normalizedFieldId).catch((error) => {
                Logger.warn('[Network] Failed to clean previous field drops', error);
            });
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

    _normalizePartyState(party = null) {
        const source = Array.isArray(party)
            ? { members: party }
            : (party && typeof party === 'object' ? party : {});
        const members = Array.from(new Set((source.members || []).filter(Boolean)));
        if (this.playerId && !members.includes(this.playerId) && party === window.game?.localPlayer?.party) {
            members.unshift(this.playerId);
        }
        const hostId = members.includes(source.hostId)
            ? source.hostId
            : (members[0] || this.playerId || null);
        const mode = typeof source.mode === 'string' && source.mode
            ? source.mode
            : (members.length > 1 ? 'party' : 'solo');
        const fieldId = members.length > 1
            ? this._normalizeFieldId(source.fieldId || this._buildSharedFieldId({ members, hostId, mode }))
            : null;
        return fieldId
            ? { members, hostId, mode, fieldId }
            : { members, hostId, mode };
    }

    _resetSocialSessionState() {
        this._socialSessionStartedAt = Date.now();
        this._pendingTogetherRequest = null;
        this._pendingPartyInvite = null;
    }

    _markPendingTogetherRequest(targetUid) {
        if (!targetUid) {
            this._pendingTogetherRequest = null;
            return;
        }
        this._pendingTogetherRequest = {
            targetUid,
            ts: Date.now()
        };
    }

    _markPendingPartyInvite(targetUid) {
        if (!targetUid) {
            this._pendingPartyInvite = null;
            return;
        }
        this._pendingPartyInvite = {
            targetUid,
            ts: Date.now()
        };
    }

    _shouldAcceptTogetherResponse(value = null) {
        if (!value) return false;
        const pending = this._pendingTogetherRequest;
        if (!pending?.targetUid) return false;
        if (value.fromUid !== pending.targetUid) return false;
        const responseTs = Number(value.ts || 0);
        if (responseTs > 0 && responseTs + 30000 < pending.ts) return false;
        return true;
    }

    _shouldAcceptPartyResponse(value = null) {
        if (!value) return false;
        const pending = this._pendingPartyInvite;
        if (!pending?.targetUid) return false;
        if (value.from !== pending.targetUid) return false;
        const responseTs = Number(value.ts || 0);
        if (responseTs > 0 && responseTs + 30000 < pending.ts) return false;
        return true;
    }

    _shouldApplyPartyInboxSync(value = null) {
        if (!value || (!value.party && !Array.isArray(value.members))) return false;
        const localParty = this._getLocalPartyState();
        if (Array.isArray(localParty.members) && localParty.members.length > 1) {
            return true;
        }
        const syncTs = Number(value.ts || 0);
        if (syncTs > 0 && syncTs < this._socialSessionStartedAt) {
            return false;
        }
        return false;
    }

    _getLocalPartyState() {
        const localParty = window.game?.localPlayer?.party || { members: this.playerId ? [this.playerId] : [] };
        return this._normalizePartyState(localParty);
    }

    _getShareablePartyMemberIds() {
        const localParty = this._getLocalPartyState();
        if (!Array.isArray(localParty.members) || localParty.members.length < 2) {
            return [];
        }
        return localParty.members.filter((uid) => uid && uid !== this.playerId);
    }

    _canShareFieldWith(uid, options = {}) {
        if (!uid) return false;
        if (uid === this.playerId) return !!options.allowSelf;

        const localParty = this._getLocalPartyState();
        if (!Array.isArray(localParty.members) || localParty.members.length < 2) {
            return false;
        }
        if (localParty.members.includes(uid)) {
            return true;
        }

        const remoteProfile = options.profile || this._zoneUserCache.get(uid)?.profile || null;
        const remoteMembers = remoteProfile?.party?.members;
        return Array.isArray(remoteMembers) && remoteMembers.includes(this.playerId);
    }

    _applyLocalPartyState(party, syncToWorld = true) {
        const normalized = this._normalizePartyState(party);
        const localPlayer = window.game?.localPlayer;
        if (!localPlayer) return normalized;

        if (typeof localPlayer.setPartyState === 'function') {
            localPlayer.setPartyState(normalized, syncToWorld);
        } else if (typeof localPlayer.setPartyMembers === 'function') {
            localPlayer.setPartyMembers(normalized.members, syncToWorld);
        } else {
            localPlayer.party = normalized;
            if (syncToWorld) {
                localPlayer.saveState(true);
            }
            window.game?.ui?.updatePartyUI?.();
        }

        this.preferredPartyHostId = normalized.members.length > 1 ? normalized.hostId : null;
        return normalized;
    }

    handleLocalPartyStateChanged(reason = 'party_changed') {
        const previousFieldId = this._lastKnownFieldId;
        const wasHost = !!this.isHost;
        const localParty = this._getLocalPartyState();
        const nextFieldId = this._getCurrentFieldId();
        this.preferredPartyHostId = localParty.members.length > 1 ? localParty.hostId : null;

        this._presenceCache.forEach((entry, uid) => {
            if (!uid || uid === this.playerId) return;
            if (this._canShareFieldWith(uid)) {
                this._ensureRemotePlayerBuffered(uid, { emitTransientState: true });
            } else {
                this._removeRemoteIfOutOfField(uid, null);
            }
        });

        this._refreshSharedFieldState();
        this._checkHostStatus();
        const fieldChanged = !!(previousFieldId && previousFieldId !== nextFieldId);
        if (fieldChanged) {
            this.lastPacketData = null;
            this._clearMonsterCellSubscriptions({ emitRemovals: true });
            this._networkDropIds.clear();
            this._publishedMonsterCellMap.clear();
            this._lastMinimapMonsterSnapshotWriteTs = 0;
            this._lastMinimapMonsterSnapshotSignature = '';
            this._minimapMonsterSnapshotCache = null;
            if (wasHost) {
                this._cleanupFieldScopedRealtimeState(previousFieldId, { removeDrops: true });
            }
            this._refreshMonsterCellSubscriptions(this._resolveMonsterSubscriptionAnchorCellId());
            this._refreshMinimapMonsterSnapshotListener(nextFieldId);
            this.emit('fieldContextChanged', {
                fieldId: nextFieldId,
                previousFieldId,
                reason
            });
        }
        this._lastKnownFieldId = nextFieldId;
        this.emit('partyUpdated', { ...localParty, reason });
    }

    resetToSoloPartyState(syncToWorld = true) {
        const soloState = {
            members: this.playerId ? [this.playerId] : [],
            hostId: this.playerId || null,
            mode: 'solo'
        };
        return this._applyLocalPartyState(soloState, syncToWorld);
    }

    _getLatestPresenceSeenTs(uid) {
        if (!uid) return 0;
        const cachedPresenceTs = Number(this._presenceCache.get(uid)?.ts || 0);
        const tsFallback = Number(this._presenceTsCache.get(uid) || 0);
        const lastSeen = Number(this.userLastSeen.get(uid) || 0);
        return Math.max(cachedPresenceTs, tsFallback, lastSeen);
    }

    isUserOnline(uid, options = {}) {
        if (!uid) return false;
        if (uid === this.playerId) return !!this.connected;

        const now = Date.now();
        const maxAgeMs = Number.isFinite(options.maxAgeMs)
            ? Math.max(1000, Number(options.maxAgeMs))
            : Math.max(1000, Number(this.friendOnlineGraceMs || 3000));
        const offlineGraceMs = Number.isFinite(options.offlineGraceMs)
            ? Math.max(maxAgeMs, Number(options.offlineGraceMs))
            : Math.max(maxAgeMs, Number(this.friendOfflineGraceMs || 8000));
        const presenceEntry = this._presenceCache.get(uid) || null;
        const lastSeen = this._getLatestPresenceSeenTs(uid);
        const previousState = this._friendOnlineStateCache.get(uid) || null;
        const thresholdMs = previousState?.online ? offlineGraceMs : maxAgeMs;
        const nextOnline = lastSeen > 0 && (now - lastSeen) <= thresholdMs;

        this._friendOnlineStateCache.set(uid, {
            online: nextOnline,
            lastSeen,
            thresholdMs,
            updatedAt: now,
            hasPresence: !!presenceEntry
        });
        return nextOnline;
    }

    getFriendListSnapshot() {
        return Array.from(this.friends.entries()).map(([uid, data]) => ({
            uid,
            ...(data || {}),
            online: this.isUserOnline(uid)
        }));
    }

    getFriendThreadMetaSnapshot(uid) {
        if (!uid) return null;
        const meta = this.friendThreadMeta.get(uid);
        return meta ? { ...meta } : null;
    }

    getFriendPeerThreadReadSnapshot(uid) {
        if (!uid) return null;
        const peerRead = this.friendThreadPeerRead.get(uid);
        return peerRead ? { ...peerRead } : null;
    }

    getFriendThreadMessagesSnapshot(uid) {
        if (!uid) return [];
        return (this.friendThreadMessages.get(uid) || []).map((message) => ({ ...message }));
    }

    getActiveFriendThreadUid() {
        return this._activeFriendThreadUid || null;
    }

    isFriend(uid) {
        return !!uid && this.friends.has(uid);
    }

    async lookupFriendCandidate(query) {
        const trimmed = String(query || '').trim();
        if (!trimmed || !window.firebase) return null;

        let uid = null;
        let profile = null;
        let matchType = 'name';

        profile = await this.getPlayerProfile(trimmed);
        if (profile) {
            uid = trimmed;
            matchType = 'uid';
        } else {
            uid = await this.getUidByName(trimmed);
            if (!uid) return null;
            profile = await this.getPlayerProfile(uid);
        }

        if (!uid || !profile) return null;
        return {
            uid,
            profile,
            name: this._isMeaningfulPlayerName(profile.name) ? profile.name.trim() : '친구',
            matchType,
            online: this.isUserOnline(uid),
            isFriend: this.isFriend(uid)
        };
    }

    async addFriendByQuery(query) {
        const trimmed = String(query || '').trim();
        if (!trimmed || !this.playerId || !window.firebase) return { ok: false, reason: 'invalid_name' };

        const candidate = await this.lookupFriendCandidate(trimmed);
        const targetUid = candidate?.uid || null;
        if (!targetUid) return { ok: false, reason: 'not_found' };
        if (targetUid === this.playerId) return { ok: false, reason: 'self' };
        if (this.isFriend(targetUid)) return { ok: false, reason: 'already_friend' };

        const targetProfile = candidate?.profile || await this.getPlayerProfile(targetUid);
        if (!targetProfile) return { ok: false, reason: 'profile_missing' };

        const myName = window.game?.localPlayer?.name || 'Unknown';
        const targetName = this._isMeaningfulPlayerName(targetProfile.name) ? targetProfile.name.trim() : '친구';
        const rootRef = firebase.database().ref();
        const now = Date.now();

        await rootRef.update({
            [`users/${this.playerId}/friends/${targetUid}`]: {
                uid: targetUid,
                name: targetName,
                createdAt: now,
                updatedAt: now
            },
            [`users/${targetUid}/friends/${this.playerId}`]: {
                uid: this.playerId,
                name: myName,
                createdAt: now,
                updatedAt: now
            }
        });

        this.friends.set(targetUid, {
            uid: targetUid,
            name: targetName,
            createdAt: now,
            updatedAt: now
        });
        this.emit('friendsUpdated', this.getFriendListSnapshot());

        return { ok: true, uid: targetUid, name: targetName };
    }

    async addFriendByName(name) {
        return this.addFriendByQuery(name);
    }

    async removeFriend(targetUid) {
        if (!targetUid || !this.playerId || !window.firebase) return false;
        const rootRef = firebase.database().ref();
        await rootRef.update({
            [`users/${this.playerId}/friends/${targetUid}`]: null,
            [`users/${targetUid}/friends/${this.playerId}`]: null,
            [`users/${this.playerId}/friend_thread_meta/${targetUid}`]: null,
            [`users/${targetUid}/friend_thread_meta/${this.playerId}`]: null
        });
        if (this._activeFriendThreadUid === targetUid) {
            this._detachFriendThreadListener();
        }
        this.friendThreadMeta.delete(targetUid);
        this.friendThreadMessages.delete(targetUid);
        this.friendThreadPeerRead.delete(targetUid);
        return true;
    }

    _getFriendThreadId(targetUid) {
        if (!targetUid || !this.playerId) return null;
        return [this.playerId, targetUid].sort().join('__');
    }

    _buildFriendThreadPreview(payload = {}) {
        if (payload.type === 'gift') {
            const gift = payload.gift || {};
            if (gift.kind === 'manastone') {
                return `마석 ${Math.max(1, Number(gift.amount || 1)).toLocaleString('ko-KR')} 선물`;
            }
            return `${gift.itemName || gift.itemId || '아이템'} 선물`;
        }
        return String(payload.text || '').trim().slice(0, 80);
    }

    _detachFriendThreadListener() {
        if (this._activeFriendThreadRef && this._activeFriendThreadListener) {
            try {
                this._activeFriendThreadRef.off('value', this._activeFriendThreadListener);
            } catch (error) {
                Logger.warn('[Network] Failed to detach friend thread listener', error);
            }
        }
        if (this._activeFriendThreadPeerReadRef && this._activeFriendThreadPeerReadListener) {
            try {
                this._activeFriendThreadPeerReadRef.off('value', this._activeFriendThreadPeerReadListener);
            } catch (error) {
                Logger.warn('[Network] Failed to detach friend thread peer read listener', error);
            }
        }
        this._activeFriendThreadUid = null;
        this._activeFriendThreadRef = null;
        this._activeFriendThreadListener = null;
        this._activeFriendThreadPeerReadRef = null;
        this._activeFriendThreadPeerReadListener = null;
        this._activeFriendThreadAutoRead = true;
    }

    closeFriendThread(targetUid = null) {
        if (targetUid && this._activeFriendThreadUid && targetUid !== this._activeFriendThreadUid) return;
        this._detachFriendThreadListener();
    }

    setActiveFriendThreadAutoRead(active = true) {
        this._activeFriendThreadAutoRead = !!active;
        if (this._activeFriendThreadAutoRead && this._activeFriendThreadUid) {
            this.markFriendThreadRead(this._activeFriendThreadUid).catch(() => { });
        }
    }

    async markFriendThreadRead(targetUid) {
        if (!targetUid || !this.playerId || !window.firebase || !this.isFriend(targetUid)) return false;
        const now = Date.now();
        try {
            await firebase.database().ref(`users/${this.playerId}/friend_thread_meta/${targetUid}/lastReadTs`).set(now);
            const cached = this.friendThreadMeta.get(targetUid) || {};
            this.friendThreadMeta.set(targetUid, {
                ...cached,
                friendUid: targetUid,
                lastReadTs: now
            });
            this.emit('friendThreadMetaUpdated', { uid: targetUid, meta: this.getFriendThreadMetaSnapshot(targetUid) });
            return true;
        } catch (error) {
            Logger.warn('[Network] Failed to mark friend thread as read', error);
            return false;
        }
    }

    openFriendThread(targetUid) {
        if (!targetUid || !this.playerId || !window.firebase || !this.isFriend(targetUid)) {
            this._detachFriendThreadListener();
            return;
        }
        if (
            this._activeFriendThreadUid === targetUid
            && this._activeFriendThreadRef
            && this._activeFriendThreadListener
            && this._activeFriendThreadPeerReadRef
            && this._activeFriendThreadPeerReadListener
        ) {
            if (this._activeFriendThreadAutoRead) {
                this.markFriendThreadRead(targetUid).catch(() => { });
            }
            return;
        }

        this._detachFriendThreadListener();
        const threadId = this._getFriendThreadId(targetUid);
        if (!threadId) return;

        const ref = firebase.database().ref(`friend_threads/${threadId}/messages`).limitToLast(120);
        const callback = (snapshot) => {
            const raw = snapshot.val() || {};
            const messages = Object.entries(raw)
                .map(([id, value]) => ({ id, ...(value || {}) }))
                .sort((a, b) => {
                    const tsDelta = Number(a.ts || 0) - Number(b.ts || 0);
                    if (tsDelta !== 0) return tsDelta;
                    return String(a.id || '').localeCompare(String(b.id || ''));
                });
            this.friendThreadMessages.set(targetUid, messages);
            this.emit('friendThreadUpdated', {
                uid: targetUid,
                messages: this.getFriendThreadMessagesSnapshot(targetUid)
            });
            if (this._activeFriendThreadAutoRead) {
                this.markFriendThreadRead(targetUid).catch(() => { });
            }
        };

        const peerReadRef = firebase.database().ref(`users/${targetUid}/friend_thread_meta/${this.playerId}/lastReadTs`);
        const peerReadCallback = (snapshot) => {
            const rawLastReadTs = snapshot.val();
            const nextLastReadTs = Number(rawLastReadTs || 0);
            this.friendThreadPeerRead.set(targetUid, {
                friendUid: targetUid,
                loaded: true,
                error: false,
                lastReadTs: Number.isFinite(nextLastReadTs) ? nextLastReadTs : 0
            });
            this.emit('friendThreadPeerReadUpdated', {
                uid: targetUid,
                peerRead: this.getFriendPeerThreadReadSnapshot(targetUid)
            });
        };

        this.friendThreadPeerRead.set(targetUid, {
            friendUid: targetUid,
            loaded: false,
            error: false,
            lastReadTs: Number(this.friendThreadPeerRead.get(targetUid)?.lastReadTs || 0) || 0
        });
        ref.on('value', callback);
        peerReadRef.on('value', peerReadCallback, (error) => {
            Logger.warn('[Network] Failed to listen for friend peer read state', error);
            const previous = this.friendThreadPeerRead.get(targetUid) || {};
            this.friendThreadPeerRead.set(targetUid, {
                ...previous,
                friendUid: targetUid,
                loaded: false,
                error: true
            });
            this.emit('friendThreadPeerReadUpdated', {
                uid: targetUid,
                peerRead: this.getFriendPeerThreadReadSnapshot(targetUid)
            });
        });
        this._activeFriendThreadUid = targetUid;
        this._activeFriendThreadRef = ref;
        this._activeFriendThreadListener = callback;
        this._activeFriendThreadPeerReadRef = peerReadRef;
        this._activeFriendThreadPeerReadListener = peerReadCallback;
        if (this._activeFriendThreadAutoRead) {
            this.markFriendThreadRead(targetUid).catch(() => { });
        }
    }

    async _writeFriendThreadPayload(targetUid, payload = {}, options = {}) {
        if (!targetUid || !this.playerId || !window.firebase || !this.isFriend(targetUid)) {
            return { ok: false, reason: 'not_friend' };
        }

        const threadId = this._getFriendThreadId(targetUid);
        if (!threadId) return { ok: false, reason: 'invalid_thread' };

        const messageRef = firebase.database().ref(`friend_threads/${threadId}/messages`).push();
        const ts = Number(options.ts || Date.now());
        const senderName = window.game?.localPlayer?.name || 'Unknown';
        const message = {
            ...payload,
            fromUid: this.playerId,
            fromName: senderName,
            toUid: targetUid,
            ts
        };
        const preview = this._buildFriendThreadPreview(message) || '메시지';
        const rootRef = firebase.database().ref();
        const updates = {
            [`friend_threads/${threadId}/participants/${this.playerId}`]: true,
            [`friend_threads/${threadId}/participants/${targetUid}`]: true,
            [`friend_threads/${threadId}/messages/${messageRef.key}`]: message,
            [`users/${this.playerId}/friend_thread_meta/${targetUid}/friendUid`]: targetUid,
            [`users/${this.playerId}/friend_thread_meta/${targetUid}/lastMessage`]: preview,
            [`users/${this.playerId}/friend_thread_meta/${targetUid}/lastMessageType`]: message.type || 'text',
            [`users/${this.playerId}/friend_thread_meta/${targetUid}/lastSenderUid`]: this.playerId,
            [`users/${this.playerId}/friend_thread_meta/${targetUid}/lastSenderName`]: senderName,
            [`users/${this.playerId}/friend_thread_meta/${targetUid}/updatedAt`]: ts,
            [`users/${this.playerId}/friend_thread_meta/${targetUid}/lastReadTs`]: ts,
            [`users/${targetUid}/friend_thread_meta/${this.playerId}/friendUid`]: this.playerId,
            [`users/${targetUid}/friend_thread_meta/${this.playerId}/lastMessage`]: preview,
            [`users/${targetUid}/friend_thread_meta/${this.playerId}/lastMessageType`]: message.type || 'text',
            [`users/${targetUid}/friend_thread_meta/${this.playerId}/lastSenderUid`]: this.playerId,
            [`users/${targetUid}/friend_thread_meta/${this.playerId}/lastSenderName`]: senderName,
            [`users/${targetUid}/friend_thread_meta/${this.playerId}/updatedAt`]: ts
        };

        await rootRef.update(updates);
        await firebase.database().ref(`friend_messages/${targetUid}`).push({
            kind: 'thread',
            type: message.type || 'text',
            threadId,
            friendUid: this.playerId,
            fromUid: this.playerId,
            fromName: senderName,
            text: preview,
            ts
        });

        return {
            ok: true,
            threadId,
            payload: {
                id: messageRef.key,
                ...message
            }
        };
    }

    async sendFriendMessage(targetUid, text) {
        const trimmed = String(text || '').trim();
        if (!trimmed || !targetUid || !this.playerId || !window.firebase) return { ok: false, reason: 'invalid_message' };
        if (!this.isFriend(targetUid)) return { ok: false, reason: 'not_friend' };
        return this._writeFriendThreadPayload(targetUid, {
            type: 'text',
            text: trimmed.slice(0, 200)
        });
    }

    async sendFriendGift(targetUid, gift = {}) {
        if (!targetUid || !this.playerId || !window.firebase) return { ok: false, reason: 'invalid_gift' };
        if (!this.isFriend(targetUid)) return { ok: false, reason: 'not_friend' };

        const localPlayer = window.game?.localPlayer || null;
        if (!localPlayer) return { ok: false, reason: 'player_missing' };

        const kind = gift.kind === 'item' ? 'item' : 'manastone';
        const previousManastone = Number(localPlayer.manastone || 0);
        const previousInventory = JSON.parse(JSON.stringify(localPlayer.inventory || []));
        let normalizedGift = null;

        try {
            if (kind === 'manastone') {
                const amount = Math.max(1, Math.floor(Number(gift.amount || 0)));
                if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
                if (previousManastone < amount) return { ok: false, reason: 'insufficient_manastone' };

                localPlayer.manastone -= amount;
                localPlayer.updateManastoneInventory?.();
                normalizedGift = {
                    kind: 'manastone',
                    amount,
                    itemName: '마석',
                    status: 'pending',
                    claimedAt: 0,
                    claimedBy: null
                };
            } else {
                const inventoryIndex = Math.floor(Number(gift.inventoryIndex || -1));
                if (!Number.isInteger(inventoryIndex) || inventoryIndex <= 0 || inventoryIndex >= (localPlayer.inventory?.length || 0)) {
                    return { ok: false, reason: 'invalid_item' };
                }

                const sourceItem = localPlayer.inventory[inventoryIndex];
                if (!sourceItem) return { ok: false, reason: 'invalid_item' };

                if (sourceItem.stackable === false || sourceItem.slot) {
                    localPlayer.inventory[inventoryIndex] = null;
                    normalizedGift = {
                        kind: 'item',
                        amount: 1,
                        itemId: sourceItem.type || sourceItem.id,
                        itemName: sourceItem.name || sourceItem.type || '아이템',
                        item: JSON.parse(JSON.stringify(sourceItem)),
                        status: 'pending',
                        claimedAt: 0,
                        claimedBy: null
                    };
                } else {
                    const availableAmount = Math.max(1, Number(sourceItem.amount || 1));
                    const amount = Math.max(1, Math.floor(Number(gift.amount || 0)));
                    if (!Number.isFinite(amount) || amount <= 0 || amount > availableAmount) {
                        return { ok: false, reason: 'invalid_amount' };
                    }

                    sourceItem.amount = availableAmount - amount;
                    if (sourceItem.amount <= 0) {
                        localPlayer.inventory[inventoryIndex] = null;
                    }
                    normalizedGift = {
                        kind: 'item',
                        amount,
                        itemId: sourceItem.type || sourceItem.id,
                        itemName: sourceItem.name || sourceItem.type || '아이템',
                        item: {
                            type: sourceItem.type || sourceItem.id,
                            amount,
                            icon: sourceItem.icon || '',
                            iconPath: sourceItem.iconPath || null,
                            name: sourceItem.name || sourceItem.type || '아이템',
                            stackable: sourceItem.stackable !== false,
                            description: sourceItem.description || ''
                        },
                        status: 'pending',
                        claimedAt: 0,
                        claimedBy: null
                    };
                }
            }

            const result = await this._writeFriendThreadPayload(targetUid, {
                type: 'gift',
                gift: normalizedGift
            });
            if (!result.ok) throw new Error(result.reason || 'gift_write_failed');

            if (kind === 'manastone') {
                localPlayer.saveProfilePatch?.(['manastone'], {
                    debounceMs: 0,
                    reason: 'friend_gift_send_manastone'
                });
            } else {
                localPlayer.saveState?.(false, {
                    debounceMs: 0,
                    reason: 'friend_gift_send_item'
                });
            }
            window.game?.ui?.updateInventory?.();
            window.game?.ui?.updateStatusPopup?.();
            return result;
        } catch (error) {
            Logger.warn('[Network] Failed to send friend gift', error);
            localPlayer.manastone = previousManastone;
            localPlayer.inventory = previousInventory;
            localPlayer.updateManastoneInventory?.();
            window.game?.ui?.updateInventory?.();
            window.game?.ui?.updateStatusPopup?.();
            return { ok: false, reason: 'send_failed' };
        }
    }

    async claimFriendGift(targetUid, messageId) {
        if (!targetUid || !messageId || !this.playerId || !window.firebase || !this.isFriend(targetUid)) {
            return { ok: false, reason: 'invalid_claim' };
        }

        const threadId = this._getFriendThreadId(targetUid);
        if (!threadId) return { ok: false, reason: 'invalid_thread' };

        const messageRef = firebase.database().ref(`friend_threads/${threadId}/messages/${messageId}`);
        const messageSnapshot = await messageRef.once('value');
        const message = messageSnapshot.val();
        if (!message || message.type !== 'gift' || !message.gift) {
            return { ok: false, reason: 'gift_missing' };
        }
        if (message.toUid !== this.playerId || message.fromUid !== targetUid) {
            return { ok: false, reason: 'not_recipient' };
        }

        const giftRef = firebase.database().ref(`friend_threads/${threadId}/messages/${messageId}/gift`);
        const txResult = await giftRef.transaction((currentGift) => {
            if (!currentGift || currentGift.status !== 'pending') return;
            return {
                ...currentGift,
                status: 'claimed',
                claimedBy: this.playerId,
                claimedAt: Date.now()
            };
        });

        if (!txResult.committed) {
            return { ok: false, reason: 'already_claimed' };
        }

        const claimedGift = txResult.snapshot.val();
        const localPlayer = window.game?.localPlayer || null;
        if (!localPlayer) return { ok: false, reason: 'player_missing' };

        if (claimedGift.kind === 'manastone') {
            localPlayer.manastone += Math.max(1, Number(claimedGift.amount || 1));
            localPlayer.updateManastoneInventory?.();
            localPlayer.saveProfilePatch?.(['manastone'], {
                debounceMs: 0,
                reason: 'friend_gift_claim_manastone'
            });
        } else if (claimedGift.item) {
            localPlayer.addInventoryItem(
                claimedGift.itemId || claimedGift.item.type || claimedGift.item.id,
                Math.max(1, Number(claimedGift.amount || claimedGift.item.amount || 1)),
                {
                    ...claimedGift.item,
                    markAsNew: true
                }
            );
            localPlayer.saveState?.(false, {
                debounceMs: 0,
                reason: 'friend_gift_claim_item'
            });
        }

        window.game?.ui?.updateInventory?.();
        window.game?.ui?.updateStatusPopup?.();
        return { ok: true, gift: claimedGift };
    }

    _applyLocalFriendGiftRefund(gift = {}, options = {}) {
        const localPlayer = window.game?.localPlayer || null;
        if (!localPlayer || !gift || typeof gift !== 'object') return false;

        const kind = gift.kind === 'item' ? 'item' : 'manastone';
        if (kind === 'manastone') {
            const amount = Math.max(1, Number(gift.amount || 1));
            localPlayer.manastone += amount;
            localPlayer.updateManastoneInventory?.();
            localPlayer.saveProfilePatch?.(['manastone'], {
                debounceMs: 0,
                reason: options.reason || 'friend_gift_refund_manastone'
            });
        } else if (gift.item) {
            localPlayer.addInventoryItem(
                gift.itemId || gift.item.type || gift.item.id,
                Math.max(1, Number(gift.amount || gift.item.amount || 1)),
                {
                    ...gift.item,
                    markAsNew: false
                }
            );
            localPlayer.saveState?.(false, {
                debounceMs: 0,
                reason: options.reason || 'friend_gift_refund_item'
            });
        } else {
            return false;
        }

        window.game?.ui?.updateInventory?.();
        window.game?.ui?.updateStatusPopup?.();
        return true;
    }

    flushPendingFriendGiftRefunds() {
        if (!Array.isArray(this.pendingFriendGiftRefunds) || this.pendingFriendGiftRefunds.length === 0) return;

        const pending = [...this.pendingFriendGiftRefunds];
        this.pendingFriendGiftRefunds = [];
        pending.forEach(({ gift, options }) => {
            const applied = this._applyLocalFriendGiftRefund(gift, options);
            if (!applied) {
                this.pendingFriendGiftRefunds.push({ gift, options });
            }
        });
    }

    async cancelFriendGift(targetUid, messageId) {
        if (!targetUid || !messageId || !this.playerId || !window.firebase || !this.isFriend(targetUid)) {
            return { ok: false, reason: 'invalid_cancel' };
        }

        const threadId = this._getFriendThreadId(targetUid);
        if (!threadId) return { ok: false, reason: 'invalid_thread' };

        const messageRef = firebase.database().ref(`friend_threads/${threadId}/messages/${messageId}`);
        const messageSnapshot = await messageRef.once('value');
        const message = messageSnapshot.val();
        if (!message || message.type !== 'gift' || !message.gift) {
            return { ok: false, reason: 'gift_missing' };
        }
        if (message.fromUid !== this.playerId || message.toUid !== targetUid) {
            return { ok: false, reason: 'not_sender' };
        }

        const giftRef = firebase.database().ref(`friend_threads/${threadId}/messages/${messageId}/gift`);
        const txResult = await giftRef.transaction((currentGift) => {
            if (!currentGift || currentGift.status !== 'pending') return;
            return {
                ...currentGift,
                status: 'canceled',
                canceledBy: this.playerId,
                canceledAt: Date.now()
            };
        });

        if (!txResult.committed) {
            return { ok: false, reason: 'already_processed' };
        }

        const canceledGift = txResult.snapshot.val();
        this._applyLocalFriendGiftRefund(canceledGift, {
            reason: canceledGift?.kind === 'item'
                ? 'friend_gift_cancel_item'
                : 'friend_gift_cancel_manastone'
        });

        await firebase.database().ref(`friend_messages/${targetUid}`).push({
            kind: 'gift_status',
            action: 'canceled',
            friendUid: this.playerId,
            fromUid: this.playerId,
            fromName: window.game?.localPlayer?.name || 'Unknown',
            messageId,
            gift: canceledGift,
            ts: Date.now()
        });

        return { ok: true, gift: canceledGift };
    }

    async rejectFriendGift(targetUid, messageId) {
        if (!targetUid || !messageId || !this.playerId || !window.firebase || !this.isFriend(targetUid)) {
            return { ok: false, reason: 'invalid_reject' };
        }

        const threadId = this._getFriendThreadId(targetUid);
        if (!threadId) return { ok: false, reason: 'invalid_thread' };

        const messageRef = firebase.database().ref(`friend_threads/${threadId}/messages/${messageId}`);
        const messageSnapshot = await messageRef.once('value');
        const message = messageSnapshot.val();
        if (!message || message.type !== 'gift' || !message.gift) {
            return { ok: false, reason: 'gift_missing' };
        }
        if (message.toUid !== this.playerId || message.fromUid !== targetUid) {
            return { ok: false, reason: 'not_recipient' };
        }

        const giftRef = firebase.database().ref(`friend_threads/${threadId}/messages/${messageId}/gift`);
        const txResult = await giftRef.transaction((currentGift) => {
            if (!currentGift || currentGift.status !== 'pending') return;
            return {
                ...currentGift,
                status: 'rejected',
                rejectedBy: this.playerId,
                rejectedAt: Date.now()
            };
        });

        if (!txResult.committed) {
            return { ok: false, reason: 'already_processed' };
        }

        const rejectedGift = txResult.snapshot.val();
        await firebase.database().ref(`friend_messages/${targetUid}`).push({
            kind: 'gift_refund',
            action: 'rejected',
            friendUid: this.playerId,
            fromUid: this.playerId,
            fromName: window.game?.localPlayer?.name || 'Unknown',
            messageId,
            gift: rejectedGift,
            ts: Date.now()
        });

        return { ok: true, gift: rejectedGift };
    }

    async requestTogether(targetUid) {
        this._pendingTogetherRequest = null;
        if (!targetUid || !this.playerId || !window.firebase) return 'ERROR';
        if (targetUid === this.playerId) return 'SELF';
        if (!this.isFriend(targetUid)) return 'NOT_FRIEND';
        if (!this.isUserOnline(targetUid)) return 'OFFLINE';

        const localParty = this._getLocalPartyState();
        if (localParty.members.length > 1) return 'BUSY';

        await firebase.database().ref(`together_requests/${targetUid}`).push({
            fromUid: this.playerId,
            fromName: window.game?.localPlayer?.name || 'Unknown',
            ts: Date.now()
        });
        this._markPendingTogetherRequest(targetUid);
        return 'SENT';
    }

    async respondToTogetherRequest(requestId, fromUid, accept) {
        if (!requestId || !fromUid || !this.playerId || !window.firebase) return { ok: false, reason: 'invalid_args' };

        const requestRef = firebase.database().ref(`together_requests/${this.playerId}/${requestId}`);
        await requestRef.remove();

        const localParty = this._getLocalPartyState();
        const canHost = localParty.members.length === 1;
        const responseRef = firebase.database().ref(`together_responses/${fromUid}`).push();

        if (!accept) {
            await responseRef.set({
                accept: false,
                fromUid: this.playerId,
                fromName: window.game?.localPlayer?.name || 'Unknown',
                reason: 'declined',
                ts: Date.now()
            });
            return { ok: true, accepted: false };
        }

        if (!canHost) {
            await responseRef.set({
                accept: false,
                fromUid: this.playerId,
                fromName: window.game?.localPlayer?.name || 'Unknown',
                reason: 'host_busy',
                ts: Date.now()
            });
            return { ok: false, reason: 'host_busy' };
        }

        const nextParty = this._normalizePartyState({
            members: [this.playerId, fromUid],
            hostId: this.playerId,
            mode: 'together',
            fieldId: `${this._getZoneBaseFieldId()}__together__${this.playerId}__${responseRef.key}`
        });
        this._applyLocalPartyState(nextParty);

        const recipients = nextParty.members.filter((uid) => uid !== this.playerId && uid !== fromUid);
        await this._broadcastPartySync(nextParty, recipients, 'SYNC');

        const localPlayer = window.game?.localPlayer;
        await responseRef.set({
            accept: true,
            fromUid: this.playerId,
            fromName: localPlayer?.name || 'Unknown',
            party: nextParty,
            hostPosition: localPlayer
                ? {
                    x: Math.round(localPlayer.x || 0),
                    y: Math.round(localPlayer.y || 0)
                }
                : null,
            ts: Date.now()
        });

        return { ok: true, accepted: true, party: nextParty };
    }

    _setupSocialListeners() {
        if (!this.playerId || !window.firebase) return;

        const friendsRef = firebase.database().ref(`users/${this.playerId}/friends`);
        this._trackExternalListener(friendsRef, 'value', (snapshot) => {
            const raw = snapshot.val() || {};
            this.friends = new Map(Object.entries(raw).map(([uid, value]) => [uid, value || {}]));
            this.emit('friendsUpdated', this.getFriendListSnapshot());
        });

        const threadMetaRef = firebase.database().ref(`users/${this.playerId}/friend_thread_meta`);
        this._trackExternalListener(threadMetaRef, 'value', (snapshot) => {
            const raw = snapshot.val() || {};
            this.friendThreadMeta = new Map(
                Object.entries(raw).map(([uid, value]) => [uid, {
                    friendUid: uid,
                    ...(value || {})
                }])
            );
            this.emit('friendThreadMetaUpdated', this.getFriendListSnapshot());
        });

        const messagesRef = firebase.database().ref(`friend_messages/${this.playerId}`);
        this._trackExternalListener(messagesRef, 'child_added', (snapshot) => {
            const value = snapshot.val();
            if (value) {
                if (value.kind === 'gift_refund' && value.gift) {
                    const refundOptions = {
                        reason: value.gift?.kind === 'item'
                            ? 'friend_gift_reject_refund_item'
                            : 'friend_gift_reject_refund_manastone'
                    };
                    const applied = this._applyLocalFriendGiftRefund(value.gift, refundOptions);
                    if (!applied) {
                        this.pendingFriendGiftRefunds.push({
                            gift: value.gift,
                            options: refundOptions
                        });
                    }
                }
                this.emit('friendMessageReceived', {
                    id: snapshot.key,
                    ...value
                });
            }
            snapshot.ref.remove().catch(() => { });
        });

        const togetherRequestsRef = firebase.database().ref(`together_requests/${this.playerId}`);
        this._trackExternalListener(togetherRequestsRef, 'child_added', (snapshot) => {
            const value = snapshot.val();
            if (value && Date.now() - Number(value.ts || 0) < 30000) {
                this.emit('togetherRequestReceived', {
                    id: snapshot.key,
                    ...value
                });
            }
        });

        const togetherResponsesRef = firebase.database().ref(`together_responses/${this.playerId}`);
        this._trackExternalListener(togetherResponsesRef, 'child_added', (snapshot) => {
            const value = snapshot.val();
            if (value && this._shouldAcceptTogetherResponse(value)) {
                this._pendingTogetherRequest = null;
                this.emit('togetherResponseReceived', value);
            }
            snapshot.ref.remove().catch(() => { });
        });
    }

    // v0.00.04: Full Character Deletion
    async deleteCharacter(uid, name) {
        if (!uid || !window.firebase) {
            return { ok: false, reason: 'invalid_args' };
        }
        try {
            const latestSnapshot = await this.getLatestProfileSnapshot(uid);
            const resolvedName = String(name || latestSnapshot?.profile?.name || '').trim();
            const resolvedRecoveryUid = this._resolveRecoveryUid(latestSnapshot?.profile, uid);

            this._blockedProfileWriteUids.add(uid);
            this._clearQueuedProfileWrites(uid, 'character_deleted');
            this._profileBackupMeta.delete(uid);
            this._profileBackupPruneMeta.delete(uid);

            const updates = {};
            updates[`users/${uid}`] = null;
            if (this.roomId) {
                updates[`zones/${this.roomId}/users/${uid}`] = null;
                updates[`zones/${this.roomId}/presence/${uid}`] = null;
                updates[`zones/${this.roomId}/presence_ts/${uid}`] = null;
            }
            if (resolvedName) {
                updates[`names/${resolvedName}`] = null;
            }
            if (resolvedRecoveryUid) {
                updates[`recovery_profiles/${resolvedRecoveryUid}`] = null;
            }

            await firebase.database().ref().update(updates);

            if (uid === this.playerId) {
                this.lastPacketData = null;
                this._lastHpSync = { hp: null, maxHp: null, ts: 0 };
            }

            Logger.warn(`Character deleted: ${uid} (${resolvedName || 'unknown'})`);
            return { ok: true, uid, name: resolvedName };
        } catch (e) {
            this._blockedProfileWriteUids.delete(uid);
            Logger.error('Character deletion failed', e);
            return { ok: false, reason: 'delete_failed', error: e };
        }
    }

    // --- Party System (v0.00.65) ---

    // --- Party System (v0.00.73: Unified Path to party_invites) ---
    async inviteToParty(targetName) {
        this._pendingPartyInvite = null;
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

            if (!this.isFriend(targetUid)) {
                return 'NOT_FRIEND';
            }

            const localParty = this._getLocalPartyState();
            if (localParty.members.includes(targetUid)) {
                return 'ALREADY_IN_PARTY';
            }
            if (localParty.members.length >= 4) {
                return 'PARTY_FULL';
            }

            // Push invite to target's inbox (Correct Path: party_invites)
            const inviteRef = this.dbRef.child(`party_invites/${targetUid}`).push();
            await inviteRef.set({
                from: this.playerId,
                fromName: window.game.localPlayer ? window.game.localPlayer.name : "Unknown",
                party: localParty,
                ts: Date.now()
            });
            this._markPendingPartyInvite(targetUid);

            return 'SENT';
        } catch (e) {
            Logger.error('Failed to invite to party', e);
            return 'ERROR';
        }
    }

    _normalizePartyMembers(members) {
        return Array.from(new Set((members || []).filter(Boolean)));
    }

    _applyLocalPartyMembers(members, options = {}) {
        return this._applyLocalPartyState({
            ...(options.party || {}),
            members
        }, options.syncToWorld !== false);
    }

    async _loadPartyStateFor(uid, fallbackParty = null) {
        if (fallbackParty) {
            return this._normalizePartyState(fallbackParty);
        }

        const profile = await this.getPlayerProfile(uid);
        return this._normalizePartyState(profile?.party || { members: [uid], hostId: uid });
    }

    async _broadcastPartySync(party, recipients, action = 'SYNC') {
        if (!this.dbRef) return;

        const normalizedParty = this._normalizePartyState(party);
        const targetMembers = this._normalizePartyMembers(recipients);
        await Promise.all(targetMembers.map((uid) => this.dbRef.child(`users/${uid}/party_inbox`).push({
            type: action,
            party: normalizedParty,
            members: normalizedParty.members,
            actorId: this.playerId,
            actorName: window.game?.localPlayer?.name || 'Unknown',
            ts: Date.now()
        })));
    }

    async respondToInvite(inviteId, fromUid, accept, inviteParty = null) {
        if (!this.connected || !this.playerId || !this.dbRef) return null;

        await this.dbRef.child(`party_invites/${this.playerId}/${inviteId}`).remove();

        const responsePayload = {
            from: this.playerId,
            fromName: window.game?.localPlayer?.name || 'Unknown',
            accept: !!accept,
            ts: Date.now()
        };

        if (accept) {
            const baseParty = await this._loadPartyStateFor(fromUid, inviteParty);
            const mergedParty = this._normalizePartyState({
                ...baseParty,
                members: [...baseParty.members, this.playerId],
                hostId: baseParty.hostId || fromUid,
                mode: baseParty.mode || 'party'
            });
            if (mergedParty.members.length > 4) {
                responsePayload.accept = false;
                responsePayload.reason = 'party_full';
            } else {
                this._applyLocalPartyState(mergedParty);
                responsePayload.party = mergedParty;
                responsePayload.partyMembers = mergedParty.members;

                const recipients = mergedParty.members.filter((uid) => uid !== this.playerId && uid !== fromUid);
                await this._broadcastPartySync(mergedParty, recipients, 'SYNC');
            }
        }

        await this.dbRef.child(`party_responses/${fromUid}`).push(responsePayload);
        return responsePayload.party || responsePayload.partyMembers || null;
    }

    async leaveParty() {
        if (!this.connected || !this.playerId) return false;

        const currentParty = this._getLocalPartyState();
        const remainingMembers = currentParty.members.filter((uid) => uid !== this.playerId);

        this.resetToSoloPartyState();

        if (remainingMembers.length > 0) {
            const nextParty = this._normalizePartyState({
                members: remainingMembers,
                hostId: currentParty.hostId === this.playerId
                    ? remainingMembers[0]
                    : currentParty.hostId,
                mode: remainingMembers.length > 1 ? currentParty.mode || 'party' : 'solo'
            });
            await this._broadcastPartySync(nextParty, remainingMembers, 'LEAVE');
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
                    party: val.party || { members: val.partyMembers || [val.from], hostId: val.from }
                });
            }
            // Auto-remove invite after processing
            snapshot.ref.remove();
        });

        // Listen for Responses (party_responses 경로 사용)
        this.dbRef.child(`party_responses/${this.playerId}`).on('child_added', (snapshot) => {
            const val = snapshot.val();
            if (val && this._shouldAcceptPartyResponse(val)) {
                this._pendingPartyInvite = null;
                this.emit('partyResponseReceived', val);
            }
            snapshot.ref.remove();
        });

        this.dbRef.child(`users/${this.playerId}/party_inbox`).on('child_added', (snapshot) => {
            const val = snapshot.val();
            if (this._shouldApplyPartyInboxSync(val) && window.game?.localPlayer) {
                this._applyLocalPartyState(val.party || { members: val.members });
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
        this.userLastSeen.set(this.playerId, now);
        const candidateIds = Array.from(new Set([
            this.playerId,
            ...this.connectedUsers
        ]));
        const candidates = candidateIds
            .map((uid) => this._buildHostCandidate(uid, now))
            .filter(Boolean)
            .sort((a, b) => this._compareHostCandidates(a, b));

        let desiredHostId = candidates[0]?.uid || this.playerId;
        const currentHostCandidate = candidates.find((candidate) => candidate.uid === this.currentHostId) || null;
        const bestCandidate = candidates[0] || null;
        if (currentHostCandidate && bestCandidate && currentHostCandidate.bucket === bestCandidate.bucket) {
            desiredHostId = currentHostCandidate.uid;
        }

        this.currentHostId = desiredHostId;
        const activeUserCount = candidates.length;
        const desiredHost = desiredHostId === this.playerId;

        if (desiredHost && !this.isHost) {
            this.isHost = true;
            Logger.info(`[Network] PROMOTED TO HOST. Active Users: ${activeUserCount}. ID: ${this.playerId}`);
            this.emit('hostChanged', true);
            this._startCleanupLoop();
        } else if (!desiredHost && this.isHost) {
            this.isHost = false;
            Logger.info(`[Network] DEMOTED TO GUEST. Active Users: ${activeUserCount}`);
            this.emit('hostChanged', false);
            this._stopCleanupLoop();
        }

        this._refreshMinimapMonsterSnapshotListener(this._getCurrentFieldId());
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
                const fieldId = this._getCurrentFieldId();
                const nextCellId = typeof payload.cellId === 'string'
                    ? payload.cellId
                    : this._getFieldCellId(payload.x, payload.y);
                const previousCellId = this._publishedMonsterCellMap.get(id) || null;

                if (previousCellId && previousCellId !== nextCellId) {
                    updates[`monster_cells/${fieldId}/${previousCellId}/${id}`] = null;
                }

                updates[`monster_cells/${fieldId}/${nextCellId}/${id}`] = this._buildMonsterRealtimeCellPayload(payload);
                this._publishedMonsterCellMap.set(id, nextCellId);

                if (this.shouldUseMonsterHostSnapshot() && (payload.fullSync || previousCellId !== nextCellId)) {
                    updates[`monster_host_snapshot/${fieldId}/${id}`] = {
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
            const fieldId = this._getCurrentFieldId();
            const cellId = queuedPayload?.cellId || this._publishedMonsterCellMap.get(id) || null;
            if (cellId) {
                removalPaths[`monster_cells/${fieldId}/${cellId}/${id}`] = null;
            }
            if (this.shouldUseMonsterHostSnapshot()) {
                removalPaths[`monster_host_snapshot/${fieldId}/${id}`] = null;
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
        const fieldId = this._getCurrentFieldId();
        const payload = {
            x: Math.round(data.x),
            y: Math.round(data.y),
            type: data.type,
            itemId: data.itemId || null,
            amount: data.amount,
            name: data.name || null,
            icon: data.icon || null,
            ownerId: data.ownerId || null,
            partyMembers: Array.isArray(data.partyMembers) ? data.partyMembers : null,
            eligibleCollectorIds: Array.isArray(data.eligibleCollectorIds) ? Array.from(new Set(data.eligibleCollectorIds.filter(Boolean))) : null,
            fieldId,
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
        const fieldId = this._getCurrentFieldId();
        const payload = {
            x: Math.round(data.x),
            y: Math.round(data.y),
            type: data.type,
            itemId: data.itemId || null,
            amount: data.amount,
            name: data.name || null,
            icon: data.icon || null,
            ownerId: data.ownerId || null,
            partyMembers: Array.isArray(data.partyMembers) ? data.partyMembers : null,
            eligibleCollectorIds: Array.isArray(data.eligibleCollectorIds) ? Array.from(new Set(data.eligibleCollectorIds.filter(Boolean))) : null,
            fieldId,
            ts: Number(data.ts || data.spawnedAt || Date.now())
        };
        this._recordNetworkWrite('dropPublish', payload);
        this._networkDropIds.add(id);
        this.dbRef.child(`drops/${id}`).set(payload).catch(() => { });
    }

    collectDrop(dropId) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        const fieldId = this._getCurrentFieldId();
        if (this.isHost && this.shouldUseMonsterQuietMode()) {
            const payload = {
                dropId,
                collectorId: this.playerId,
                fieldId
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
            fieldId,
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
            fieldId: this._getCurrentFieldId(),
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
        const sharedFieldActive = this.isSharedFieldActive();
        const positionThreshold = window.game?.isMobilePerformanceMode
            ? (sharedFieldActive ? 3 : 4)
            : (sharedFieldActive ? 1 : 2);
        const velocityThreshold = window.game?.isMobilePerformanceMode
            ? (sharedFieldActive ? 0.06 : 0.08)
            : (sharedFieldActive ? 0.03 : 0.05);

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
        const safeExtraData = this._sanitizeRealtimePayloadValue(extraData);
        const payload = [
            now,
            Math.round(x),
            Math.round(y),
            Number.isFinite(dir) ? dir : 0,
            skillType || 'normal',
            safeExtraData ?? null // v0.29.0: Added for skill specifics (e.g. missile count)
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
        const fieldId = this._getCurrentFieldId();
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
                fieldId,
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
            fieldId,
            meta: meta || null
        });
    }

    // v0.33.0: Send Monster Attack (Host Only)
    sendMonsterAttack(monsterId, skillType, extraData = null) {
        if (!this.connected || !this.isHost) return;
        const safeExtraData = this._sanitizeRealtimePayloadValue(extraData);
        const fieldId = this._getCurrentFieldId();
        if (this.shouldUseMonsterQuietMode()) {
            const payload = {
                mid: monsterId,
                skill: skillType,
                extra: safeExtraData ?? null,
                fieldId,
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
            extra: safeExtraData ?? null,
            fieldId,
            ts: Date.now()
        };
        this._recordNetworkWrite('monsterAttack', payload);
        this.dbRef.child('monster_attack').push(payload);
    }

    sendPlayerDamage(targetId, damage, effectType = null, effectDuration = 0, effectDamage = 0, meta = null) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        const fieldId = this._getCurrentFieldId();
        // Optimization: Use batch queue for player damage
        this.queueBatchUpdate('player_damage', {
            tid: targetId,
            dmg: Math.round(damage),
            aid: this.playerId,
            fieldId,
            effectType,
            effectDuration,
            effectDamage,
            crit: !!meta?.isCrit,
            meta: meta || null
        });
    }

    sendReward(playerId, data) {
        if (!this.connected || !this.isHost) return;
        if (playerId === this.playerId) {
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
        if (this._canBatchReward(data)) {
            this._queueRewardBatch(playerId, data);
            return;
        }

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
        if (this._canShareFieldWith(uid, { profile }) && val && val.a && Array.isArray(val.a)) {
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
        if (this._canShareFieldWith(uid, { profile }) && val && val.ch && Array.isArray(val.ch)) {
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
        if (this._canShareFieldWith(uid, { profile }) && val && val.h && Array.isArray(val.h)) {
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
            fieldId: this._getCurrentFieldId(),
            crit: !!meta?.isCrit,
            meta: meta || null,
            ts: Date.now()
        });
    }

    _setupDamageListeners() {
        // Listen for Incoming Damage
        this.dbRef.child(`damage_events/${this.playerId}`).on('child_added', (snapshot) => {
            const val = snapshot.val();
            if (val && typeof val.ts === 'number' && this._isPayloadForCurrentField(val)) {
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
            fieldId: this._getCurrentFieldId(),
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
            this._noteVisibilityState(false);
            this.flushQueuedProfileSaves().catch(() => { });
            this.flushQueuedProfilePatches().catch(() => { });
            if (this.playerId && this.dbRef && this.zoneParticipationEnabled) {
                this._publishPresenceLite({ force: true, reason: 'visibility_hidden' });
                this._writePresenceTsOnly('visibility_hidden');
            }
        } else {
            Logger.log("[Network] App foregrounded. Checking connection...");
            this._noteVisibilityState(true);
            if (this.playerId && this.dbRef) {
                this._publishPresenceLite({ force: true, reason: 'visibility_visible' });
                this._sendHeartbeat();

                // Force sync check if needed
                if (this.lastSyncTime < Date.now() - 5000) {
                    Logger.log("[Network] Long absence detected, requesting sync...");
                }
            }
        }
    }
}
