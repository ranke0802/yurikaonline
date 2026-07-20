import Logger from '../utils/Logger.js';
import EventEmitter from './EventEmitter.js';
import { DURABLE_BOSS_REWARD_ARCHIVED_CATALOGS } from './DurableBossRewardPolicy.js';

const DURABLE_BOSS_REWARD_SCHEMA_VERSION = 1;
const DURABLE_BOSS_REWARD_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DURABLE_BOSS_REWARD_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DURABLE_BOSS_REWARD_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 30000];
const DURABLE_BOSS_REWARD_MAX_ITEMS = 4;
const DURABLE_BOSS_REWARD_MAX_ID_BYTES = 512;
const DURABLE_BOSS_REWARD_PATH = 'durable_rewards_v1';
const DURABLE_BOSS_REWARD_OUTBOX_STORAGE_PREFIX = 'yurika:durableBossRewardOutbox:v1';
const DURABLE_BOSS_REWARD_OUTBOX_MAX_ENTRIES = 128;
const DURABLE_BOSS_REWARD_VOLATILE_MAX_ENTRIES = 16;
const QUEST_BOSS_DEFEAT_OUTBOX_MAX_ENTRIES = 128;
const DROP_SPAWN_OUTBOX_STORAGE_PREFIX = 'yurika:dropSpawnOutbox:v3';
const LEGACY_DROP_SPAWN_OUTBOX_STORAGE_PREFIXES = [
    'yurika:dropSpawnOutbox:v2',
    'yurika:dropSpawnOutbox:v1'
];
const DROP_SPAWN_OUTBOX_MAX_ENTRIES = 256;
const DROP_SPAWN_OUTBOX_MAX_BYTES = 1024 * 1024;
const DROP_SPAWN_OUTBOX_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DROP_SETTLEMENT_TOMBSTONE_TTL_MS = 31 * 24 * 60 * 60 * 1000;
const DROP_VISIBLE_TTL_MS = 30 * 1000;
const DROP_WORLD_GENERATION_PATH = 'drop_world_generation_v1';
const DROP_FIELD_EPOCH_PATH = 'drop_field_epoch_v1';
const DROP_NAMESPACE_PATH = 'drops_v3';
const QUEST_BOSS_STATE_PATH = 'quest_boss_state_v1';
const QUEST_BOSS_DEFEAT_OUTBOX_STORAGE_PREFIX = 'yurika:questBossDefeatOutbox:v1';
const DURABLE_BOSS_REWARD_PENDING_FIELDS = new Set([
    'schemaVersion',
    'kind',
    'status',
    'rewardId',
    'recipientId',
    'authorHostId',
    'fieldId',
    'bossTypeId',
    'bossInstanceId',
    'monsterName',
    'catalogVersion',
    'catalogFingerprint',
    'itemSeeds',
    'itemSnapshots',
    'itemSnapshotFingerprint',
    'authoredAt',
    'expiresAt'
]);
const DURABLE_BOSS_REWARD_PENDING_REQUIRED_FIELDS = new Set([
    'schemaVersion',
    'kind',
    'status',
    'rewardId',
    'recipientId',
    'authorHostId',
    'fieldId',
    'bossTypeId',
    'bossInstanceId',
    'monsterName',
    'catalogVersion',
    'catalogFingerprint',
    'itemSeeds',
    'authoredAt',
    'expiresAt'
]);
const DURABLE_BOSS_REWARD_CLAIMED_FIELDS = new Set([
    'schemaVersion',
    'kind',
    'status',
    'rewardId',
    'recipientId',
    'authorHostId',
    'fieldId',
    'bossTypeId',
    'bossInstanceId',
    'monsterName',
    'catalogVersion',
    'catalogFingerprint',
    'authoredAt',
    'expiresAt',
    'claimedBy',
    'claimedAt'
]);
const DURABLE_BOSS_REWARD_ITEM_SEED_FIELDS = new Set([
    'itemId',
    'amount',
    'instanceId',
    'prefixId',
    'rolledValues'
]);
const DURABLE_BOSS_REWARD_ITEM_SNAPSHOT_FIELDS = new Set([
    'id',
    'type',
    'amount',
    'instanceId',
    'name',
    'baseName',
    'icon',
    'iconPath',
    'stackable',
    'slot',
    'rarity',
    'prefixId',
    'prefix',
    'rolledValues',
    'isNewlyAcquired',
    'enhancementLevel',
    'enhancementRuleSet',
    'enhancementBonuses',
    'baseStats',
    'description'
]);
const DURABLE_BOSS_PROGRESS_PENDING_FIELDS = new Set([
    'schemaVersion',
    'kind',
    'status',
    'rewardId',
    'recipientId',
    'authorHostId',
    'fieldId',
    'bossTypeId',
    'bossInstanceId',
    'monsterName',
    'exp',
    'rewardMeta',
    'authoredAt',
    'expiresAt'
]);
const DURABLE_BOSS_PROGRESS_CLAIMED_FIELDS = new Set([
    ...DURABLE_BOSS_PROGRESS_PENDING_FIELDS,
    'claimedBy',
    'claimedAt'
]);
const DURABLE_BOSS_PROGRESS_META_FIELDS = new Set([
    'monsterLevel',
    'playerLevel',
    'overlevelMultiplier',
    'partyMultiplier'
]);
const NORMAL_REWARD_SCHEMA_VERSION = 2;
const NORMAL_REWARD_KIND = 'normal_reward';
const NORMAL_REWARD_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NORMAL_REWARD_CLOCK_SKEW_MS = 5 * 60 * 1000;
const NORMAL_REWARD_OUTBOX_STORAGE_PREFIX = 'yurika:normalRewardOutbox:v2';
const NORMAL_REWARD_BATCH_STORAGE_PREFIX = 'yurika:normalRewardBatchJournal:v2';
const NORMAL_REWARD_OUTBOX_MAX_ENTRIES = 512;
const NORMAL_REWARD_OUTBOX_MAX_BYTES = 2 * 1024 * 1024;
const NORMAL_REWARD_MAX_PAYLOAD_BYTES = 32 * 1024;
const NORMAL_REWARD_CLAIM_PATH = 'normal_reward_claims_v2';
const NORMAL_REWARD_CLAIM_INDEX_PATH = 'normal_reward_claim_index_v2';
const NORMAL_REWARD_DAY_MS = 24 * 60 * 60 * 1000;
const NORMAL_REWARD_V2_EPOCH_DAY = Math.floor(Date.UTC(2026, 6, 13) / NORMAL_REWARD_DAY_MS);
const NORMAL_REWARD_CLAIM_MARKER_FIELDS = new Set([
    'schemaVersion',
    'kind',
    'status',
    'receiptId',
    'recipientId',
    'authorHostId',
    'fieldId',
    'payloadHash',
    'rewardId',
    'authoredAt',
    'expiresAt',
    'permanent',
    'claimedBy',
    'claimedAt'
]);
const NORMAL_REWARD_CANONICAL_FIELDS = [
    'rewardId',
    'exp',
    'manastone',
    'gold',
    'hp',
    'items',
    'questKill',
    'questKills',
    'monsterName',
    'introSharedQuest',
    'bossCycle',
    'bossReward',
    'immediate',
    'rewardKind',
    'rewardMeta'
];
const NORMAL_REWARD_PENDING_META_FIELDS = new Set([
    'schemaVersion',
    'kind',
    'status',
    'receiptId',
    'recipientId',
    'authorHostId',
    'hostId',
    'fieldId',
    'payloadHash',
    'authoredAt',
    'expiresAt',
    'permanent',
    'ts'
]);
const NORMAL_REWARD_CLAIMED_FIELDS = new Set([
    ...NORMAL_REWARD_PENDING_META_FIELDS,
    'rewardId',
    'claimedBy',
    'claimedAt'
]);
const ACCOUNT_SESSION_HEARTBEAT_MS = 10000;
const ACCOUNT_SESSION_STALE_MS = 45000;

export default class NetworkManager extends EventEmitter {
    constructor() {
        super();
        this.connected = false;
        this.roomId = 'zone_1'; // Currently hardcoded zone
        this.playerId = null;
        this.dbRef = null;
        this.zoneParticipationEnabled = true;
        this.preferredPartyHostId = null;
        this.serverTimeOffsetMs = 0;
        this._serverTimeOffsetReady = false;
        this._serverTimeOffsetPromise = null;

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
        this._publishedMonsterRevisions = new Map();
        this._monsterRemovalEpochs = new Map();
        this._pendingMonsterRemovalWrites = new Map();
        this._pendingMonsterRemovalFlushes = new Map();
        this.monsterUpdateFlushDelay = 90;
        this._monsterUpdateTimer = null;
        this.startBatchProcessor();

        // Lifecycle guards
        this._boundVisibilityChange = this._handleVisibilityChange.bind(this);
        this._hostilityListenerActive = false;
        this._lastHpSync = { hp: null, maxHp: null, ts: 0 };
        this._lastProfileSaveTs = 0;
        this._profileWriterSession = null;
        this._profileWriterSuperseded = false;
        this._profileCommitChains = new Map();
        this._profileRevisions = new Map();
        this._profileDisconnectingUids = new Set();
        this._connectionTransition = Promise.resolve();
        this._accountSessionToken = null;
        this._accountSessionUid = null;
        this._accountSessionRef = null;
        this._accountSessionHandler = null;
        this._accountSessionHeartbeatTimer = null;
        this._accountSessionClaimedAt = 0;
        this._accountSessionClaimConfirmed = false;
        this._accountSessionDisplacedTokens = new Set();
        this._queuedProfileSaves = new Map();
        this._queuedProfilePatches = new Map();
        this._blockedProfileWriteUids = new Set();
        this._profileBackupMeta = new Map();
        this._profileBackupPruneMeta = new Map();
        this._profileRecoverySyncMeta = new Map();
        this._zoneUserCache = new Map();
        this._zoneUserListeners = new Map();
        this._zoneUserListenerFields = new Map();
        this._zoneUserHydrationMeta = new Map();
        this._presenceCache = new Map();
        this._presenceTsCache = new Map();
        this._friendOnlineStateCache = new Map();
        this._queuedRewardBatches = new Map();
        this._rewardBatchWindowMs = 650;
        this._normalRewardBatchSequence = 0;
        this._durableRewardConsumer = null;
        this._durableRewardConsumerGeneration = 0;
        this._durableRewardInFlight = new Map();
        this._incomingRewardSnapshotQueue = new Map();
        this._incomingRewardSnapshotPump = null;
        this._durableRewardDrainTimer = null;
        this._durableRewardDrainAttempt = 0;
        this._pendingDurableRewardWrites = new Map();
        this._dormantDurableRewardWritesByAuthor = new Map();
        this._pendingDropSpawnWrites = new Map();
        this._dormantDropSpawnWritesByAuthor = new Map();
        this._committedDropSpawnSources = new Map();
        this._dropEpochSealCache = new Map();
        this._dropEpochSubscriptionGeneration = 0;
        this._dropEpochGlobalRef = null;
        this._dropEpochFieldRef = null;
        this._dropEpochValueHandler = null;
        this._dropNamespaceRef = null;
        this._dropNamespaceHandlers = null;
        this._serverCommittedRewardIds = new Map();
        this._committedQuestBossDefeats = new Map();
        this._pendingQuestBossDefeatWrites = new Map();
        this._lastDropSettlementPruneTs = 0;
        this._normalRewardConsumer = null;
        this._normalRewardConsumerGeneration = 0;
        this._normalRewardInFlight = new Map();
        this._normalRewardDrainTimer = null;
        this._normalRewardDrainAttempt = 0;
        this._pendingNormalRewardWrites = new Map();
        this._dormantNormalRewardWritesByAuthor = new Map();
        this._normalRewardLegacyValidationCache = new Map();
        this._networkLifecycleGeneration = 0;
        this._recentRewardAuthorities = new Map();
        this._recentFormerHostAuthorities = new Map();
        this._currentHostFieldId = null;
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
        this._fieldScopedRealtimeListeners = new Map();
        this._fieldScopedRealtimeFieldId = null;
        this.minimapMonsterSnapshotIntervalMs = 500;
        this._lastMinimapMonsterSnapshotWriteTs = 0;
        this._lastMinimapMonsterSnapshotSignature = '';
        this._minimapMonsterSnapshotCache = null;
        this._minimapMonsterSnapshotListener = null;
        this._minimapMonsterSnapshotFieldId = null;
        this._hostRequestReplayPromise = null;
        this._hostRequestReplayFieldId = null;
        this._lastKnownFieldId = null;
        this._activeZoneFieldId = null;
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
        const transition = this._connectionTransition
            .catch(() => { })
            .then(() => this._connectNow(user));
        this._connectionTransition = transition.then(() => undefined, () => undefined);
        return transition;
    }

    async _connectNow(user) {
        if (!user || !window.firebase) return;
        if (this.connected) {
            if (this.playerId === user.uid && this.dbRef) {
                if (!this._profileWriterSuperseded
                    && (!this._profileWriterSession || this._profileWriterSession.uid !== user.uid)) {
                    this._beginProfileWriterSession(user.uid);
                }
                this._startAccountSessionGuard(user);
                return;
            }
            await this._disconnectNow();
        }

        this._networkLifecycleGeneration += 1;
        this._clearDurableRewardRuntime({ clearConsumer: true });
        this._clearNormalRewardRuntime({ clearConsumer: true });
        this._clearDropSpawnRuntime();
        this._detachDropEpochSubscription();
        this.playerId = user.uid;
        this.dbRef = firebase.database().ref(`zones/${this.roomId}`);
        this._profileWriterSuperseded = false;
        this._beginProfileWriterSession(user.uid);
        this._startAccountSessionGuard(user);
        this._restoreDurableRewardOutbox();
        this._restoreNormalRewardOutbox();
        this._restoreDropSpawnOutbox();
        this._restoreQuestBossDefeatOutbox();
        this._pruneExpiredNormalRewardClaimBuckets();
        this.connectedUsers = [];
        this.userLastSeen.clear();
        this.remotePlayers.clear();
        this.friends.clear();
        this.friendThreadMeta.clear();
        this.friendThreadMessages.clear();
        this.friendThreadPeerRead.clear();
        this._detachFriendThreadListener();
        this._detachExternalDbListeners();
        this._detachFieldScopedRealtimeListeners();
        this._hostilityListenerActive = false;
        this._lastHpSync = { hp: null, maxHp: null, ts: 0 };
        this._lastProfileSaveTs = 0;
        this._zoneUserCache.clear();
        this._zoneUserHydrationMeta.clear();
        this._zoneUserListenerFields.clear();
        this._profileBackupMeta.clear();
        this._profileBackupPruneMeta.clear();
        this._profileRecoverySyncMeta.clear();
        this._detachZoneUserListeners();
        this._presenceCache.clear();
        this._presenceTsCache.clear();
        this._friendOnlineStateCache.clear();
        this._blockedProfileWriteUids.clear();
        this._clearQueuedRewardBatches();
        this._restoreNormalRewardBatchJournal();
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
        this._activeZoneFieldId = this._normalizeFieldId(this.roomId);
        this._recentRewardAuthorities.clear();
        this._recentFormerHostAuthorities.clear();
        this._currentHostFieldId = null;
        this._detachMinimapMonsterSnapshotListener();
        this._fieldPeerCount = 0;
        this._sharedFieldActive = false;
        this.preferredPartyHostId = null;
        this._resetSocialSessionState();
        this.startBatchProcessor();

        Logger.log(`Network Coordinates: connecting to ${this.roomId}...`);

        const serverOffsetRef = firebase.database().ref('.info/serverTimeOffset');
        this._trackExternalListener(serverOffsetRef, 'value', (snapshot) => {
            const offset = Number(snapshot.val());
            if (!Number.isFinite(offset)) return;
            this.serverTimeOffsetMs = offset;
            this._serverTimeOffsetReady = true;
        });

        this.dbRef.child('presence').on('child_added', (snapshot) => this._handlePresenceSnapshot(snapshot));
        this.dbRef.child('presence').on('child_changed', (snapshot) => this._handlePresenceSnapshot(snapshot));
        this.dbRef.child('presence').on('child_removed', (snapshot) => this._handlePresenceRemoved(snapshot));
        this.dbRef.child('presence_ts').on('child_added', (snapshot) => this._handlePresenceTsSnapshot(snapshot));
        this.dbRef.child('presence_ts').on('child_changed', (snapshot) => this._handlePresenceTsSnapshot(snapshot));
        this.dbRef.child('presence_ts').on('child_removed', (snapshot) => this._handlePresenceTsRemoved(snapshot));

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

        // Reward Sync (Guest side listens for rewards targeting them)
        const normalRewardLifecycle = {
            generation: this._networkLifecycleGeneration,
            playerId: this.playerId,
            dbRef: this.dbRef,
            legacyRewardPath: true
        };
        this.dbRef.child(`rewards/${this.playerId}`).on('child_added', (snapshot) => {
            this._queueIncomingNormalRewardSnapshot(snapshot, normalRewardLifecycle).catch((error) => {
                Logger.warn('[Network] Failed to process an incoming reward receipt', error);
            });
        });
        const durableRewardLifecycle = {
            generation: this._networkLifecycleGeneration,
            playerId: this.playerId,
            dbRef: this.dbRef
        };
        const durableRewardInboxRef = this._getDurableRewardInboxRef(this.playerId);
        this._trackExternalListener(durableRewardInboxRef, 'child_added', (snapshot) => {
            this._queueIncomingDurableRewardSnapshot(snapshot, durableRewardLifecycle).catch((error) => {
                Logger.warn('[Network] Failed to process a durable boss reward receipt', error);
            });
        });

        // Drop sync is scoped to the current immutable combat epoch. A delayed
        // former-host write remains in its old namespace and is never rendered
        // or claimable after a field/world reset.
        this._refreshDropEpochSubscription(this._getCurrentFieldId());

        // 2. presence check
        const myRef = this.dbRef.child(`users/${this.playerId}`);
        const presenceRef = this.dbRef.child(`presence/${this.playerId}`);
        const presenceTsRef = this.dbRef.child(`presence_ts/${this.playerId}`);
        // Commented out to allow position persistence on refresh.
        // Stale users are cleaned up by Host after 5 minutes of inactivity.
        // v0.00.03: Failsafe exit logic
        myRef.onDisconnect().remove();
        presenceRef.onDisconnect().remove();
        presenceTsRef.onDisconnect().remove();

        this.connected = true;
        this.emit('connected');
        this._refreshSharedFieldState();
        this._refreshFieldScopedRealtimeListeners(this._getCurrentFieldId());
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

        // v0.35.1: Mobile Background Reconnection Support
        document.removeEventListener?.('visibilitychange', this._boundVisibilityChange);
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
            this._detachFieldScopedRealtimeListeners();
            this._minimapMonsterSnapshotCache = null;
        } else {
            this._publishPresenceLite({ force: true, reason: 'zone_reenabled' });
            this._refreshMonsterCellSubscriptions(this._resolveMonsterSubscriptionAnchorCellId());
            this._refreshMinimapMonsterSnapshotListener(this._getCurrentFieldId());
            this._refreshFieldScopedRealtimeListeners(this._getCurrentFieldId());
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
        let batchIndex = 0;
        Object.values(grouped).forEach(({ type, fieldId, items }) => {
            for (let offset = 0; offset < items.length; offset += 10) {
                const chunk = items.slice(offset, offset + 10);
                const batchTs = Date.now();
                const batchId = `${batchTs}_${batchIndex}`;
                batchIndex += 1;
                updates[`${type}_batch/${batchId}`] = {
                    fieldId,
                    items: chunk,
                    count: chunk.length,
                    ts: batchTs
                };
            }
        });

        try {
            this._recordNetworkWrite('batchUpdate', updates, Object.keys(updates).length);
            await this.dbRef.update(updates);
        } catch (e) {
            Logger.error('Batch update failed:', e);
        }
    }

    disconnect(options = {}) {
        const transition = this._connectionTransition
            .catch(() => { })
            .then(() => this._disconnectNow(options));
        this._connectionTransition = transition.then(() => undefined, () => undefined);
        return transition;
    }

    async _disconnectNow(options = {}) {
        const departingUid = this.playerId;
        if (departingUid) {
            this._profileDisconnectingUids.add(departingUid);
            if (options.flushProfileWrites !== false) {
                try {
                    const flushResult = await this.flushProfileWrites(departingUid);
                    if (!flushResult.ok) {
                        Logger.warn(`[Network] Profile writes did not fully flush before disconnecting ${departingUid}`, flushResult);
                    }
                } catch (error) {
                    Logger.warn(`[Network] Failed to flush profile writes before disconnecting ${departingUid}`, error);
                }
            } else {
                this._clearQueuedProfileWrites(departingUid, 'network_disconnected');
                await this._drainProfileCommitChain(departingUid).catch(() => { });
            }
        }

        this._networkLifecycleGeneration += 1;
        if (this._profileWriterSession?.uid === departingUid) {
            this._profileWriterSession.cancelled = true;
            this._profileWriterSession = null;
        }
        this.flushQueuedRewardBatches();
        this._clearDurableRewardRuntime({ clearConsumer: true });
        this._clearNormalRewardRuntime({ clearConsumer: true });
        this._clearDropSpawnRuntime();
        this._pauseQuestBossDefeatOutbox();
        this._flushRewardValidationWindowSummary(Date.now());
        this._stopAccountSessionGuard();
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
        this._clearMonsterRemovalWriteQueue();
        document.removeEventListener?.('visibilitychange', this._boundVisibilityChange);
        this._detachAllDbListeners();

        if (this.playerId && this.dbRef) {
            this.dbRef.child(`users/${this.playerId}`).remove().catch(() => { });
            this.dbRef.child(`presence/${this.playerId}`).remove().catch(() => { });
            this.dbRef.child(`presence_ts/${this.playerId}`).remove().catch(() => { });
        }

        this.connected = false;
        this.isHost = false;
        this.currentHostId = null;
        this.serverTimeOffsetMs = 0;
        this._serverTimeOffsetReady = false;
        this._serverTimeOffsetPromise = null;
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
        this._activeZoneFieldId = null;
        this._recentRewardAuthorities.clear();
        this._recentFormerHostAuthorities.clear();
        this._currentHostFieldId = null;
        this._resetSocialSessionState();
        this._clearMonsterCellSubscriptions({ emitRemovals: true });
        this._clearPendingMonsterRemovalTimers();
        this._monsterCellPayloadCache.clear();
        this._publishedMonsterCellMap.clear();
        this._publishedMonsterRevisions.clear();
        this._lastMinimapMonsterSnapshotWriteTs = 0;
        this._lastMinimapMonsterSnapshotSignature = '';
        this._minimapMonsterSnapshotCache = null;
        this._minimapMonsterSnapshotFieldId = null;
        this._hostRequestReplayPromise = null;
        this._hostRequestReplayFieldId = null;
        this._detachMinimapMonsterSnapshotListener();
        this.lastPacketData = null;
        this.lastSyncTime = 0;
        this.lastHeartbeatTime = 0;
        this.playerId = null;
        this.dbRef = null;
        if (departingUid) this._profileDisconnectingUids.delete(departingUid);
    }

    _detachAllDbListeners() {
        this._detachExternalDbListeners();
        this._detachFieldScopedRealtimeListeners();
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

    _detachFieldScopedRealtimeListeners() {
        this._fieldScopedRealtimeListeners.forEach(({ ref, eventType, callback }) => {
            try {
                ref?.off?.(eventType, callback);
            } catch (error) {
                Logger.warn('[Network] Failed to detach field scoped DB listener', error);
            }
        });
        this._fieldScopedRealtimeListeners.clear();
        this._fieldScopedRealtimeFieldId = null;
    }

    _attachFieldScopedChildAddedListener(key, path, fieldId, handler) {
        if (!this.dbRef || !key || !path || !fieldId || typeof handler !== 'function') return;
        const baseRef = this.dbRef.child(path);
        const query = typeof baseRef.orderByChild === 'function'
            ? baseRef.orderByChild('fieldId').equalTo(fieldId)
            : baseRef;
        const callback = (snapshot) => {
            const data = snapshot.val();
            if (!data || this._normalizeFieldId(data.fieldId) !== fieldId) return;
            handler(snapshot, data);
        };
        query.on('child_added', callback);
        this._fieldScopedRealtimeListeners.set(key, {
            ref: query,
            eventType: 'child_added',
            callback
        });
    }

    _refreshFieldScopedRealtimeListeners(fieldId = this._getCurrentFieldId()) {
        const normalizedFieldId = this._normalizeFieldId(fieldId);
        const shouldListen = !!(
            this.connected
            && this.dbRef
            && this.zoneParticipationEnabled
            && normalizedFieldId
        );

        if (!shouldListen) {
            this._detachFieldScopedRealtimeListeners();
            return;
        }

        if (this._fieldScopedRealtimeFieldId === normalizedFieldId
            && this._fieldScopedRealtimeListeners.size > 0) {
            return;
        }

        this._detachFieldScopedRealtimeListeners();
        this._fieldScopedRealtimeFieldId = normalizedFieldId;

        const handleMonsterDamage = (data) => {
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

        this._attachFieldScopedChildAddedListener('monster_attack', 'monster_attack', normalizedFieldId, (snapshot, data) => {
            if (Date.now() - Number(data.ts || 0) < 5000) {
                this.emit('monsterAttack', data);
                if (window.game?.sound) {
                    if (data.skill === 'charge') {
                        window.game.sound.playSfx('monster_charge');
                    } else if (data.skill === 'roar') {
                        window.game.sound.playSfx('boss_spawn');
                    }
                }
            }
            if (this.isHost) snapshot.ref.remove();
        });

        this._attachFieldScopedChildAddedListener('monster_damage', 'monster_damage', normalizedFieldId, (snapshot, data) => {
            handleMonsterDamage(data);
            if (this.isHost) snapshot.ref.remove();
        });

        this._attachFieldScopedChildAddedListener('monster_damage_batch', 'monster_damage_batch', normalizedFieldId, (snapshot, batch) => {
            if (Array.isArray(batch.items) && Date.now() - Number(batch.ts || 0) < 5000) {
                batch.items.forEach((item) => handleMonsterDamage(item));
            }
            if (this.isHost) snapshot.ref.remove();
        });

        this._attachFieldScopedChildAddedListener('player_damage', 'player_damage', normalizedFieldId, (snapshot, data) => {
            this.emit('playerDamageReceived', data);
            if (this.isHost) snapshot.ref.remove();
        });

        this._attachFieldScopedChildAddedListener('player_damage_batch', 'player_damage_batch', normalizedFieldId, (snapshot, batch) => {
            if (Array.isArray(batch.items) && Date.now() - Number(batch.ts || 0) < 5000) {
                batch.items.forEach((item) => this.emit('playerDamageReceived', item));
            }
            if (this.isHost) snapshot.ref.remove();
        });

        this._attachFieldScopedChildAddedListener('drop_collection', 'drop_collection', normalizedFieldId, (snapshot, data) => {
            if (!this.isHost) return;
            this.emit('dropCollectionRequested', {
                requestId: snapshot.key,
                dropId: data.did,
                collectorId: data.cid,
                fieldId: data.fieldId,
                dropWorldEpoch: data.dropWorldEpoch,
                dropFieldEpoch: data.dropFieldEpoch
            });
        });

        this._attachFieldScopedChildAddedListener('boss_spawn_requests', 'boss_spawn_requests', normalizedFieldId, (snapshot, data) => {
            if (!this.isHost) return;
            this.emit('bossSpawnRequested', {
                requestId: snapshot.key,
                requesterId: data.requesterId || null,
                isFirstBoss: data.isFirstBoss !== false,
                manualSummon: data.manualSummon === true,
                monsterId: typeof data.monsterId === 'string' ? data.monsterId : null,
                zoneId: typeof data.zoneId === 'string' ? data.zoneId : null,
                scrollItemId: typeof data.scrollItemId === 'string' ? data.scrollItemId : null,
                fieldId: data.fieldId,
                ts: Number(data.ts || Date.now())
            });
        });

        this._attachFieldScopedChildAddedListener('chat', 'chat', normalizedFieldId, (snapshot, data) => {
            if (typeof data.ts !== 'number' || typeof data.text !== 'string') {
                if (this.isHost) snapshot.ref.remove();
                return;
            }
            if (data.ts > Date.now() - 30000) this.emit('chatReceived', data);
            if (this.isHost && Date.now() - data.ts > 60000) snapshot.ref.remove();
        });

        this._attachFieldScopedChildAddedListener('system_messages', 'system_messages', normalizedFieldId, (snapshot, data) => {
            if (typeof data.ts !== 'number' || typeof data.message !== 'string') {
                if (this.isHost) snapshot.ref.remove();
                return;
            }
            if (data.ts > Date.now() - 5000) this.emit('systemMessage', data);
            if (this.isHost) snapshot.ref.remove();
        });

        this._attachFieldScopedChildAddedListener('emotes', 'emotes', normalizedFieldId, (snapshot, data) => {
            if (typeof data.ts === 'number' && data.ts > Date.now() - 5000) {
                this.emit('emoteReceived', data);
            }
            if (this.isHost) snapshot.ref.remove();
        });
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
        return String(fieldId || this.roomId || 'zone_1');
    }

    _resolveCurrentZoneBaseFieldId() {
        const zoneFieldId = window.game?.zone?.currentZone?.id;
        return this._normalizeFieldId(zoneFieldId);
    }

    _getZoneBaseFieldId() {
        if (!this._activeZoneFieldId) {
            this._activeZoneFieldId = this._resolveCurrentZoneBaseFieldId();
        }
        return this._normalizeFieldId(this._activeZoneFieldId);
    }

    _getSharedFieldSessionTail(fieldId, prefix) {
        if (typeof fieldId !== 'string' || !fieldId.trim() || !prefix) return null;
        const marker = `__${prefix}__`;
        const markerIndex = fieldId.indexOf(marker);
        if (markerIndex < 0) return null;

        const sessionTail = fieldId.slice(markerIndex + marker.length).trim();
        return sessionTail || null;
    }

    _buildSoloFieldId(uid = null) {
        const safeUid = String(uid || this.playerId || 'local');
        return `${this._getZoneBaseFieldId()}__solo__${safeUid}`;
    }

    _buildSharedFieldId(party = null) {
        const source = Array.isArray(party)
            ? { members: party }
            : (party && typeof party === 'object' ? party : {});
        const members = Array.from(new Set((source.members || []).filter(Boolean)));
        const hostId = members.includes(source.hostId)
            ? source.hostId
            : (members[0] || this.playerId || 'host');
        const mode = typeof source.mode === 'string' && source.mode
            ? source.mode
            : (members.length > 1 ? 'party' : 'solo');
        const prefix = mode === 'together' ? 'together' : 'party';
        const zoneFieldId = this._getZoneBaseFieldId();
        const expectedPrefix = `${zoneFieldId}__${prefix}__`;
        const savedFieldId = typeof source.fieldId === 'string' ? source.fieldId.trim() : '';

        // Party field ids are persisted in player profiles. A saved id may therefore
        // still point at the map the party previously occupied. Keep the stable
        // party/together session tail, but always rebase it onto the active zone.
        if (savedFieldId.startsWith(expectedPrefix)) {
            return this._normalizeFieldId(savedFieldId);
        }

        const savedSessionTail = this._getSharedFieldSessionTail(savedFieldId, prefix);
        return `${expectedPrefix}${savedSessionTail || hostId}`;
    }

    _getCurrentFieldId() {
        const localParty = this._getLocalPartyState();
        if (Array.isArray(localParty.members) && localParty.members.length > 1) {
            return this._normalizeFieldId(this._buildSharedFieldId(localParty));
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

    _hydrateCachedRemotePlayersForCurrentField(options = {}) {
        const currentFieldId = this._getCurrentFieldId();
        const now = Date.now();
        this._presenceCache.forEach((entry, uid) => {
            if (!entry || uid === this.playerId) return;
            const shouldHydrate = entry.fieldId === currentFieldId
                && this._isPresenceEntryActive(entry, now)
                && this._canShareFieldWith(uid);
            if (shouldHydrate) {
                this._ensureRemotePlayerBuffered(uid, {
                    emitTransientState: options.emitTransientState !== false
                });
                return;
            }
            this._removeRemoteIfOutOfField(uid, entry);
        });
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
        this._refreshFieldScopedRealtimeListeners(fieldId);
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
            equipment: this._buildRealtimeEquipmentSnapshot(player.equipment || null),
            party: player.party || null,
            hostility: this._buildRealtimeHostilitySnapshot(player.hostilityTargets
                ? Object.fromEntries(player.hostilityTargets.entries())
                : (player.hostility || {})),
            defense: Number(player.defense || 0),
            isPaused: !!player.isPaused,
            protectedUntil: player.spawnProtectionTimer > 0
                ? Date.now() + Math.round(player.spawnProtectionTimer * 1000)
                : 0
        };
    }

    _buildRealtimeWeaponSnapshot(weapon = null) {
        if (!weapon || typeof weapon !== 'object') return null;
        const type = weapon.type || weapon.id;
        if (!type) return null;
        const payload = {
            id: type,
            type,
            slot: 'weapon',
            name: weapon.name || weapon.baseName || type,
            enhancementLevel: Math.max(0, Math.floor(Number(weapon.enhancementLevel || 0)))
        };
        if (weapon.baseName) payload.baseName = weapon.baseName;
        if (weapon.rarity) payload.rarity = weapon.rarity;
        if (weapon.prefixId) payload.prefixId = weapon.prefixId;
        if (weapon.prefix) payload.prefix = weapon.prefix;
        if (weapon.icon) payload.icon = weapon.icon;
        if (weapon.iconPath) payload.iconPath = weapon.iconPath;
        return payload;
    }

    _buildRealtimeEquipmentSnapshot(equipment = null) {
        const weapon = this._buildRealtimeWeaponSnapshot(equipment?.weapon || null);
        return { weapon };
    }

    _buildRealtimeHostilitySnapshot(hostility = null) {
        if (!hostility || typeof hostility !== 'object') return {};
        return Object.fromEntries(
            Object.entries(hostility)
                .filter(([uid]) => typeof uid === 'string' && uid)
                .slice(-24)
                .map(([uid, entry]) => [uid, {
                    name: entry?.name || 'Unknown',
                    ts: Number(entry?.ts || Date.now()),
                    ...(entry?.duel === true ? { duel: true, duelId: entry.duelId || null } : {})
                }])
        );
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
        const presenceEntry = this._presenceCache.get(uid) || null;
        if (!presenceEntry
            || presenceEntry.fieldId !== this._getCurrentFieldId()
            || !this._isPresenceEntryActive(presenceEntry)) return null;

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

    _isNormalRewardV2Payload(data) {
        return !!(
            data
            && typeof data === 'object'
            && !Array.isArray(data)
            && data.schemaVersion === NORMAL_REWARD_SCHEMA_VERSION
            && data.kind === NORMAL_REWARD_KIND
        );
    }

    _buildNormalRewardReceiptId(recipientId, receiptKey) {
        if (!recipientId || !receiptKey) return null;
        const rewardId = `normal_reward_v2:${this.roomId}:${recipientId}:${receiptKey}`;
        return rewardId.length <= 256 ? rewardId : null;
    }

    _buildNormalRewardSemanticReceiptKey(_authorHostId, recipientId, semanticRewardId) {
        if (typeof recipientId !== 'string' || !recipientId
            || typeof semanticRewardId !== 'string' || !semanticRewardId) return null;
        const identity = this._stableStringifyDurableRewardValue({
            roomId: this.roomId,
            recipientId,
            semanticRewardId
        });
        const primary = this._hashDurableRewardCatalogValue(identity).replace('fnv1a32_', '');
        const secondary = this._hashDurableRewardCatalogValue(`normal-reward-v2:${identity}`).replace('fnv1a32_', '');
        return `nr2_${primary}_${secondary}`;
    }

    _getNormalRewardClaimBucket(authoredAt) {
        const timestamp = Number(authoredAt);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
        return new Date(timestamp).toISOString().slice(0, 10);
    }

    _getNormalRewardClaimPath(recipientId, receiptKey, authoredAt) {
        const bucket = this._getNormalRewardClaimBucket(authoredAt);
        if (!recipientId || !receiptKey || !bucket) return null;
        return `${NORMAL_REWARD_CLAIM_PATH}/${recipientId}/${bucket}/${receiptKey}`;
    }

    _getNormalRewardClaimIndexPath(recipientId, receiptKey) {
        if (!recipientId || !receiptKey) return null;
        return `${NORMAL_REWARD_CLAIM_INDEX_PATH}/${recipientId}/${receiptKey}`;
    }

    _buildNormalRewardClaimMarker(data, claimedAt = this.getServerNow()) {
        if (!data || !data.receiptId || !data.recipientId || !data.authorHostId) return null;
        return {
            schemaVersion: NORMAL_REWARD_SCHEMA_VERSION,
            kind: NORMAL_REWARD_KIND,
            status: 'claimed',
            receiptId: data.receiptId,
            recipientId: data.recipientId,
            authorHostId: data.authorHostId,
            fieldId: data.fieldId,
            payloadHash: data.payloadHash,
            rewardId: data.rewardId,
            authoredAt: Number(data.authoredAt),
            expiresAt: Number(data.expiresAt),
            permanent: this._isPermanentNormalRewardEnvelope(data),
            claimedBy: data.recipientId,
            claimedAt: Math.max(Number(data.authoredAt || 0), Math.round(Number(claimedAt) || 0))
        };
    }

    _doesNormalRewardClaimMatchEnvelope(claim, envelope) {
        if (!claim || !envelope || typeof claim !== 'object' || Array.isArray(claim)) return false;
        if (Object.keys(claim).some((key) => !NORMAL_REWARD_CLAIM_MARKER_FIELDS.has(key))) return false;
        const identityFields = [
            'schemaVersion', 'kind', 'receiptId', 'recipientId', 'authorHostId',
            'fieldId', 'payloadHash', 'rewardId', 'authoredAt', 'expiresAt'
        ];
        return claim.status === 'claimed'
            && claim.claimedBy === envelope.recipientId
            && Number.isFinite(Number(claim.claimedAt))
            && Number(claim.claimedAt) >= Number(envelope.authoredAt)
            && identityFields.every((field) => claim[field] === envelope[field]);
    }

    _doesNormalRewardSemanticIdentityMatch(receipt, envelope) {
        if (!receipt || !envelope || typeof receipt !== 'object' || Array.isArray(receipt)) return false;
        return receipt.schemaVersion === NORMAL_REWARD_SCHEMA_VERSION
            && receipt.kind === NORMAL_REWARD_KIND
            && receipt.receiptId === envelope.receiptId
            && receipt.recipientId === envelope.recipientId
            && receipt.rewardId === envelope.rewardId;
    }

    async _readNormalRewardClaim(envelope, receiptKey, dbRef = this.dbRef) {
        const fallbackPath = this._getNormalRewardClaimPath(
            envelope?.recipientId,
            receiptKey,
            envelope?.authoredAt
        );
        const indexPath = this._getNormalRewardClaimIndexPath(envelope?.recipientId, receiptKey);
        if (!fallbackPath || !indexPath || !dbRef?.child) {
            return { path: fallbackPath, indexPath, value: null, matches: false, semanticMatches: false };
        }
        const indexSnapshot = await dbRef.child(indexPath).once('value');
        const indexedBucket = indexSnapshot?.val?.();
        const hasValidIndex = typeof indexedBucket === 'string'
            && /^\d{4}-\d{2}-\d{2}$/.test(indexedBucket);
        const claimPath = hasValidIndex
            ? `${NORMAL_REWARD_CLAIM_PATH}/${envelope.recipientId}/${indexedBucket}/${receiptKey}`
            : fallbackPath;
        const snapshot = await dbRef.child(claimPath).once('value');
        const value = snapshot?.val?.() || null;
        return {
            path: claimPath,
            indexPath,
            indexedBucket: hasValidIndex ? indexedBucket : null,
            value,
            matches: this._doesNormalRewardClaimMatchEnvelope(value, envelope),
            semanticMatches: this._doesNormalRewardSemanticIdentityMatch(value, envelope),
            invalidIndex: indexedBucket != null && !hasValidIndex
        };
    }

    async _removeNormalRewardPendingIfMatch(rewardRef, envelope) {
        if (!rewardRef || typeof rewardRef.transaction !== 'function') return false;
        try {
            const result = await rewardRef.transaction((current) => {
                if (!current) return;
                if (this._doesNormalRewardReceiptMatchEnvelope(current, envelope)) return null;
                return;
            });
            const value = result?.snapshot?.val?.();
            return value == null;
        } catch (error) {
            Logger.warn(`[Network] Failed to remove claimed normal pending receipt ${envelope?.receiptId}`, error);
            return false;
        }
    }

    _getNormalRewardOutboxBucketKey(authorHostId = this.playerId) {
        return authorHostId ? `${this.roomId}::${authorHostId}` : null;
    }

    _getNormalRewardOutboxStorageKey(authorHostId = this.playerId) {
        const bucketKey = this._getNormalRewardOutboxBucketKey(authorHostId);
        return bucketKey
            ? `${NORMAL_REWARD_OUTBOX_STORAGE_PREFIX}:${encodeURIComponent(bucketKey)}`
            : null;
    }

    async _pruneExpiredNormalRewardClaimBuckets() {
        if (!this.dbRef || !this.playerId || typeof this.dbRef.update !== 'function') return false;
        const context = {
            generation: this._networkLifecycleGeneration,
            playerId: this.playerId,
            dbRef: this.dbRef
        };
        try {
            const serverTimeReady = await this._ensureDurableRewardServerTime();
            if (!serverTimeReady || !this._isDurableRewardLifecycleCurrent(context)) return false;
        } catch (error) {
            Logger.warn('[Network] Waiting for server time before normal reward claim pruning', error);
            return false;
        }
        const storage = this._getDurableRewardLocalStorage();
        const today = Math.floor(this.getServerNow() / NORMAL_REWARD_DAY_MS);
        // Remove only buckets that are at least 31 full UTC days old so every
        // claim marker remains available for the complete 30-day sender TTL.
        const cutoffDay = today - 31;
        const storageKey = `yurika:normalRewardClaimPrune:v2:${encodeURIComponent(`${this.roomId}::${context.playerId}`)}`;
        let previousCutoff = NORMAL_REWARD_V2_EPOCH_DAY - 1;
        try {
            const stored = Number(storage?.getItem?.(storageKey));
            if (Number.isInteger(stored)) previousCutoff = Math.max(previousCutoff, stored);
        } catch (error) {
            Logger.warn('[Network] Failed to read normal reward claim prune cursor', error);
        }
        const serverCursorPath = `normal_reward_claim_prune_v2/${context.playerId}`;
        try {
            const serverCursorSnapshot = await context.dbRef.child(serverCursorPath).once('value');
            if (!this._isDurableRewardLifecycleCurrent(context)) return false;
            const serverCursor = Number(serverCursorSnapshot?.val?.());
            if (Number.isInteger(serverCursor)) previousCutoff = Math.max(previousCutoff, serverCursor);
        } catch (error) {
            Logger.warn('[Network] Failed to read normal reward server prune cursor', error);
            return false;
        }
        if (previousCutoff >= cutoffDay) return true;
        const startDay = previousCutoff + 1;
        const endDay = Math.min(cutoffDay, startDay + 30);
        for (let day = startDay; day <= endDay; day += 1) {
            const bucket = new Date(day * NORMAL_REWARD_DAY_MS).toISOString().slice(0, 10);
            const bucketPath = `${NORMAL_REWARD_CLAIM_PATH}/${context.playerId}/${bucket}`;
            const transientReceiptKeys = [];
            let permanentReceiptCount = 0;
            try {
                const bucketSnapshot = await context.dbRef.child(bucketPath).once('value');
                if (!this._isDurableRewardLifecycleCurrent(context)) return false;
                bucketSnapshot?.forEach?.((claimSnapshot) => {
                    if (!claimSnapshot?.key) return;
                    if (claimSnapshot.val?.()?.permanent === true) permanentReceiptCount += 1;
                    else transientReceiptKeys.push(claimSnapshot.key);
                });
            } catch (error) {
                Logger.warn(`[Network] Failed to read normal reward claim bucket ${bucket}`, error);
                return false;
            }

            // Bound each fan-out update so a high-volume day cannot exceed the
            // RTDB multi-location payload/path limits. Missing index entries are
            // harmless and retries remain idempotent until the day cursor commits.
            for (let offset = 0; offset < transientReceiptKeys.length; offset += 400) {
                const pruneUpdates = {};
                transientReceiptKeys.slice(offset, offset + 400).forEach((receiptKey) => {
                    pruneUpdates[`${bucketPath}/${receiptKey}`] = null;
                    pruneUpdates[`${NORMAL_REWARD_CLAIM_INDEX_PATH}/${context.playerId}/${receiptKey}`] = null;
                });
                try {
                    await context.dbRef.update(pruneUpdates);
                    if (!this._isDurableRewardLifecycleCurrent(context)) return false;
                } catch (error) {
                    Logger.warn(`[Network] Failed to prune normal reward claim indexes for ${bucket}`, error);
                    return false;
                }
            }

            try {
                const completionUpdates = { [serverCursorPath]: day };
                if (permanentReceiptCount === 0) completionUpdates[bucketPath] = null;
                await context.dbRef.update(completionUpdates);
                if (!this._isDurableRewardLifecycleCurrent(context)) return false;
            } catch (error) {
                Logger.warn(`[Network] Failed to commit normal reward claim bucket prune for ${bucket}`, error);
                return false;
            }
            try {
                storage?.setItem?.(storageKey, String(day));
            } catch (error) {
                Logger.warn('[Network] Failed to persist normal reward claim prune cursor', error);
            }
        }
        return true;
    }

    _normalizeNormalRewardCanonicalPayload(data, fallbackRewardId = null) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
        const rewardId = typeof data.rewardId === 'string' && data.rewardId
            ? data.rewardId.slice(0, 256)
            : fallbackRewardId;
        if (!rewardId || typeof rewardId !== 'string' || rewardId.length > 256) return null;

        const payload = { rewardId };
        const copyPositiveInteger = (field, maximum) => {
            if (!Object.prototype.hasOwnProperty.call(data, field)) return true;
            const numeric = Number(data[field]);
            if (!Number.isFinite(numeric) || numeric < 0 || numeric > maximum) return false;
            const value = Math.floor(numeric);
            if (value > 0) payload[field] = value;
            return true;
        };
        if (!copyPositiveInteger('exp', 250000)
            || !copyPositiveInteger('manastone', 250000)
            || !copyPositiveInteger('gold', 250000)
            || !copyPositiveInteger('hp', 60000)) return null;

        if (Object.prototype.hasOwnProperty.call(data, 'items')) {
            if (!Array.isArray(data.items) || data.items.length === 0 || data.items.length > 32) return null;
            let totalAmount = 0;
            const items = [];
            for (const rawItem of data.items) {
                const item = this._sanitizeRealtimePayloadValue(rawItem);
                const itemId = item?.id || item?.type;
                const amount = Math.floor(Number(item?.amount ?? 1));
                if (!item || typeof item !== 'object' || Array.isArray(item)
                    || typeof itemId !== 'string' || !itemId || itemId.length > 128
                    || !Number.isFinite(amount) || amount < 1 || amount > 3200) return null;
                totalAmount += amount;
                if (totalAmount > 3200) return null;
                items.push({ ...item, amount });
            }
            payload.items = items;
        }

        if (Object.prototype.hasOwnProperty.call(data, 'questKill')) {
            if (typeof data.questKill !== 'string' || !data.questKill || data.questKill.length > 128) return null;
            payload.questKill = data.questKill;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'questKills')) {
            if (!data.questKills || typeof data.questKills !== 'object' || Array.isArray(data.questKills)) return null;
            const entries = Object.entries(data.questKills);
            if (entries.length === 0 || entries.length > 32) return null;
            const questKills = {};
            for (const [questId, rawCount] of entries) {
                const count = Math.floor(Number(rawCount));
                if (!questId || questId.length > 128 || !Number.isFinite(count) || count < 1 || count > 1000) return null;
                questKills[questId] = count;
            }
            payload.questKills = questKills;
        }

        if (Object.prototype.hasOwnProperty.call(data, 'monsterName')) {
            if (typeof data.monsterName !== 'string' || data.monsterName.length > 128) return null;
            payload.monsterName = data.monsterName;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'introSharedQuest')) {
            payload.introSharedQuest = data.introSharedQuest === true;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'bossCycle')) {
            if (!['intro', 'repeat'].includes(data.bossCycle)) return null;
            payload.bossCycle = data.bossCycle;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'bossReward')) {
            payload.bossReward = data.bossReward === true;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'immediate')) {
            payload.immediate = data.immediate === true;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'rewardKind')) {
            if (typeof data.rewardKind !== 'string' || !data.rewardKind || data.rewardKind.length > 64) return null;
            payload.rewardKind = data.rewardKind;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'rewardMeta')) {
            const rewardMeta = this._sanitizeRealtimePayloadValue(data.rewardMeta);
            if (!rewardMeta || typeof rewardMeta !== 'object' || Array.isArray(rewardMeta)) return null;
            payload.rewardMeta = rewardMeta;
        }

        const meaningful = Number(payload.exp || 0) > 0
            || Number(payload.manastone || payload.gold || 0) > 0
            || Number(payload.hp || 0) > 0
            || (Array.isArray(payload.items) && payload.items.length > 0)
            || !!payload.questKill
            || !!payload.questKills;
        if (!meaningful) return null;

        const serialized = this._stableStringifyDurableRewardValue(payload);
        const payloadBytes = typeof TextEncoder !== 'undefined'
            ? new TextEncoder().encode(serialized).length
            : serialized.length * 2;
        return payloadBytes <= NORMAL_REWARD_MAX_PAYLOAD_BYTES ? payload : null;
    }

    _extractNormalRewardCanonicalPayload(data) {
        if (!data || typeof data !== 'object') return null;
        const rawPayload = {};
        NORMAL_REWARD_CANONICAL_FIELDS.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(data, field)) {
                rawPayload[field] = this._cloneProfileData(data[field]);
            }
        });
        const normalized = this._normalizeNormalRewardCanonicalPayload(rawPayload, data.rewardId);
        if (!normalized) return null;
        return this._stableStringifyDurableRewardValue(normalized)
            === this._stableStringifyDurableRewardValue(rawPayload)
            ? normalized
            : null;
    }

    _createNormalRewardEnvelope(playerId, data, receiptKey, options = {}) {
        const recipientId = typeof playerId === 'string' ? playerId : '';
        const receiptId = this._buildNormalRewardReceiptId(recipientId, receiptKey);
        const payload = this._normalizeNormalRewardCanonicalPayload(data, receiptId);
        const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());
        if (!recipientId || recipientId.length > 128 || !receiptId || !payload || !fieldId || fieldId.length > 192) {
            return null;
        }
        const authoredAt = Number.isFinite(Number(options.authoredAt)) && Number(options.authoredAt) > 0
            ? Math.max(0, Math.round(Number(options.authoredAt)))
            : Math.max(0, Math.round(this.getServerNow()));
        const envelope = {
            schemaVersion: NORMAL_REWARD_SCHEMA_VERSION,
            kind: NORMAL_REWARD_KIND,
            status: 'pending',
            receiptId,
            recipientId,
            authorHostId: String(this.playerId),
            hostId: String(this.playerId),
            fieldId,
            payloadHash: this._hashDurableRewardCatalogValue(payload),
            authoredAt,
            expiresAt: authoredAt + NORMAL_REWARD_TTL_MS,
            ts: authoredAt,
            ...payload
        };
        if (this._isPermanentNormalRewardEnvelope(payload)) envelope.permanent = true;
        return envelope;
    }

    _isPermanentNormalRewardEnvelope(data) {
        return data?.permanent === true
            || data?.bossReward === true
            || data?.questKill === 'king_slime';
    }

    _validateNormalRewardEnvelope(data, snapshotKey, now = this.getServerNow(), expectedRecipientId = this.playerId) {
        if (!this._isNormalRewardV2Payload(data) || !['pending', 'claimed'].includes(data.status)) {
            return { ok: false, terminal: true, reason: 'invalid_schema' };
        }
        const allowedFields = data.status === 'claimed'
            ? NORMAL_REWARD_CLAIMED_FIELDS
            : new Set([...NORMAL_REWARD_PENDING_META_FIELDS, ...NORMAL_REWARD_CANONICAL_FIELDS]);
        if (Object.keys(data).some((key) => !allowedFields.has(key))) {
            return { ok: false, terminal: true, reason: 'unknown_field' };
        }
        const requiredStrings = ['receiptId', 'recipientId', 'authorHostId', 'hostId', 'fieldId', 'payloadHash', 'rewardId'];
        if (requiredStrings.some((key) => typeof data[key] !== 'string' || !data[key])) {
            return { ok: false, terminal: true, reason: 'missing_identity' };
        }
        if (data.recipientId !== expectedRecipientId
            || data.authorHostId !== data.hostId
            || data.rewardId.length > 256
            || data.recipientId.length > 128
            || data.authorHostId.length > 128
            || data.fieldId.length > 192
            || !/^fnv1a32_[0-9a-f]{8}$/.test(data.payloadHash)
            || data.receiptId !== this._buildNormalRewardReceiptId(data.recipientId, snapshotKey)) {
            return { ok: false, terminal: true, reason: 'identity_mismatch' };
        }
        const authoredAt = Number(data.authoredAt);
        const expiresAt = Number(data.expiresAt);
        const authoritativeNow = Number(now);
        if (!Number.isFinite(authoredAt) || authoredAt <= 0
            || !Number.isFinite(expiresAt)
            || expiresAt - authoredAt !== NORMAL_REWARD_TTL_MS
            || Number(data.ts) !== authoredAt
            || authoredAt > authoritativeNow + NORMAL_REWARD_CLOCK_SKEW_MS) {
            return { ok: false, terminal: true, reason: 'invalid_ttl' };
        }
        if (Object.prototype.hasOwnProperty.call(data, 'permanent')
            && typeof data.permanent !== 'boolean') {
            return { ok: false, terminal: true, reason: 'invalid_retention' };
        }
        const permanent = this._isPermanentNormalRewardEnvelope(data);
        if (authoritativeNow > expiresAt && !permanent) {
            return { ok: false, terminal: true, reason: 'expired' };
        }

        if (data.status === 'claimed') {
            const claimedAt = Number(data.claimedAt);
            if (data.claimedBy !== data.recipientId
                || !Number.isFinite(claimedAt)
                || claimedAt < authoredAt
                || claimedAt > authoritativeNow + NORMAL_REWARD_CLOCK_SKEW_MS) {
                return { ok: false, terminal: true, reason: 'invalid_claim' };
            }
            return { ok: true, terminal: false, claimed: true, reason: 'already_claimed' };
        }

        const payload = this._extractNormalRewardCanonicalPayload(data);
        if (!payload || this._hashDurableRewardCatalogValue(payload) !== data.payloadHash) {
            return { ok: false, terminal: true, reason: 'payload_mismatch' };
        }
        if (data.permanent === true && !this._isPermanentNormalRewardEnvelope(payload)) {
            return { ok: false, terminal: true, reason: 'invalid_retention' };
        }
        return { ok: true, terminal: false, claimed: false, reason: 'accepted', payload };
    }

    _doesNormalRewardReceiptMatchEnvelope(receipt, envelope) {
        if (!receipt || !envelope || !['pending', 'claimed'].includes(receipt.status)) return false;
        const identityFields = [
            'schemaVersion', 'kind', 'receiptId', 'recipientId', 'authorHostId', 'hostId',
            'fieldId', 'payloadHash', 'rewardId', 'authoredAt', 'expiresAt', 'ts'
        ];
        if (identityFields.some((field) => receipt[field] !== envelope[field])) return false;
        if (receipt.status === 'claimed') return receipt.claimedBy === envelope.recipientId;
        const receiptPayload = this._extractNormalRewardCanonicalPayload(receipt);
        const envelopePayload = this._extractNormalRewardCanonicalPayload(envelope);
        return !!receiptPayload && !!envelopePayload
            && this._stableStringifyDurableRewardValue(receiptPayload)
                === this._stableStringifyDurableRewardValue(envelopePayload);
    }

    _materializeNormalReward(data, validation = null) {
        const payload = validation?.payload || this._extractNormalRewardCanonicalPayload(data);
        return payload ? { ...payload, normalRewardReceipt: true } : null;
    }

    _serializeNormalRewardOutboxEntry(entry) {
        if (!entry?.envelope) return null;
        return {
            schemaVersion: NORMAL_REWARD_SCHEMA_VERSION,
            roomId: this.roomId,
            authorHostId: entry.envelope.authorHostId,
            recipientId: entry.recipientId,
            receiptKey: entry.receiptKey,
            queuedAt: Number(entry.queuedAt || Date.now()),
            timestampFinalized: entry.timestampFinalized === true,
            envelope: this._cloneProfileData(entry.envelope)
        };
    }

    _isValidStoredNormalRewardOutboxEntry(stored, authorHostId = this.playerId) {
        if (!stored || typeof stored !== 'object' || Array.isArray(stored)
            || stored.schemaVersion !== NORMAL_REWARD_SCHEMA_VERSION
            || stored.roomId !== this.roomId
            || stored.authorHostId !== authorHostId
            || typeof stored.recipientId !== 'string' || !stored.recipientId
            || typeof stored.receiptKey !== 'string' || !stored.receiptKey
            || !Number.isFinite(Number(stored.queuedAt))) return false;
        const envelope = stored.envelope;
        const payload = this._extractNormalRewardCanonicalPayload(envelope);
        return !!(
            envelope
            && envelope.status === 'pending'
            && envelope.authorHostId === authorHostId
            && envelope.recipientId === stored.recipientId
            && envelope.receiptId === this._buildNormalRewardReceiptId(stored.recipientId, stored.receiptKey)
            && Number(envelope.expiresAt) - Number(envelope.authoredAt) === NORMAL_REWARD_TTL_MS
            && Number(envelope.ts) === Number(envelope.authoredAt)
            && payload
            && this._hashDurableRewardCatalogValue(payload) === envelope.payloadHash
        );
    }

    _getNormalRewardOutboxEntriesForAuthor(authorHostId) {
        if (!authorHostId) return [];
        const entries = new Map();
        this._pendingNormalRewardWrites.forEach((entry) => {
            if (entry?.envelope?.authorHostId === authorHostId) entries.set(entry.queueKey, entry);
        });
        const bucketKey = this._getNormalRewardOutboxBucketKey(authorHostId);
        (this._dormantNormalRewardWritesByAuthor.get(bucketKey) || []).forEach((entry) => {
            if (entry?.envelope?.authorHostId === authorHostId && !entries.has(entry.queueKey)) {
                entries.set(entry.queueKey, entry);
            }
        });
        return Array.from(entries.values());
    }

    _persistNormalRewardOutbox(authorHostId = this.playerId, entries = null) {
        if (!authorHostId) return false;
        const storage = this._getDurableRewardLocalStorage();
        const storageKey = this._getNormalRewardOutboxStorageKey(authorHostId);
        if (!storage || !storageKey) return false;
        const sourceEntries = Array.isArray(entries)
            ? entries
            : Array.from(this._pendingNormalRewardWrites.values());
        const serializedEntries = sourceEntries
            .filter((entry) => entry?.envelope?.authorHostId === authorHostId)
            .map((entry) => this._serializeNormalRewardOutboxEntry(entry))
            .filter(Boolean);
        if (serializedEntries.length > NORMAL_REWARD_OUTBOX_MAX_ENTRIES) return false;
        try {
            if (serializedEntries.length === 0) {
                storage.removeItem(storageKey);
                return true;
            }
            const serialized = JSON.stringify(serializedEntries);
            const byteLength = typeof TextEncoder !== 'undefined'
                ? new TextEncoder().encode(serialized).length
                : serialized.length * 2;
            if (byteLength > NORMAL_REWARD_OUTBOX_MAX_BYTES) return false;
            storage.setItem(storageKey, serialized);
            return true;
        } catch (error) {
            Logger.warn('[Network] Failed to persist the normal reward outbox', error);
            return false;
        }
    }

    _removeNormalRewardOutboxEntry(entry) {
        if (!entry?.queueKey || !entry?.envelope?.authorHostId) return;
        if (entry.timer) clearTimeout(entry.timer);
        if (this._pendingNormalRewardWrites.get(entry.queueKey) === entry) {
            this._pendingNormalRewardWrites.delete(entry.queueKey);
        }
        const authorHostId = entry.envelope.authorHostId;
        const bucketKey = this._getNormalRewardOutboxBucketKey(authorHostId);
        const dormantEntries = this._dormantNormalRewardWritesByAuthor.get(bucketKey) || [];
        const remaining = dormantEntries.filter((candidate) => candidate?.queueKey !== entry.queueKey);
        if (remaining.length > 0) this._dormantNormalRewardWritesByAuthor.set(bucketKey, remaining);
        else this._dormantNormalRewardWritesByAuthor.delete(bucketKey);
        this._persistNormalRewardOutbox(authorHostId, this._getNormalRewardOutboxEntriesForAuthor(authorHostId));
    }

    _restoreNormalRewardOutbox() {
        const authorHostId = this.playerId;
        const bucketKey = this._getNormalRewardOutboxBucketKey(authorHostId);
        if (!authorHostId || !bucketKey) return 0;
        const candidates = [];
        const dormantEntries = this._dormantNormalRewardWritesByAuthor.get(bucketKey) || [];
        this._dormantNormalRewardWritesByAuthor.delete(bucketKey);
        dormantEntries.forEach((entry) => {
            const stored = this._serializeNormalRewardOutboxEntry(entry);
            if (stored) candidates.push(stored);
        });
        const storage = this._getDurableRewardLocalStorage();
        const storageKey = this._getNormalRewardOutboxStorageKey(authorHostId);
        if (storage && storageKey) {
            try {
                const parsed = JSON.parse(storage.getItem(storageKey) || '[]');
                if (Array.isArray(parsed)) candidates.push(...parsed);
            } catch (error) {
                Logger.warn('[Network] Ignoring an unreadable normal reward outbox', error);
            }
        }
        const uniqueCandidates = new Map();
        candidates.forEach((stored) => {
            if (!this._isValidStoredNormalRewardOutboxEntry(stored, authorHostId)) return;
            const queueKey = `${stored.recipientId}:${stored.receiptKey}`;
            const previous = uniqueCandidates.get(queueKey);
            if (!previous || Number(stored.queuedAt) >= Number(previous.queuedAt)) {
                uniqueCandidates.set(queueKey, stored);
            }
        });
        Array.from(uniqueCandidates.values())
            .sort((a, b) => Number(a.queuedAt) - Number(b.queuedAt))
            .slice(-NORMAL_REWARD_OUTBOX_MAX_ENTRIES)
            .forEach((stored) => {
            if (!this._isValidStoredNormalRewardOutboxEntry(stored, authorHostId)) return;
            const queueKey = `${stored.recipientId}:${stored.receiptKey}`;
            if (this._pendingNormalRewardWrites.has(queueKey)) return;
            this._pendingNormalRewardWrites.set(queueKey, {
                queueKey,
                receiptKey: stored.receiptKey,
                recipientId: stored.recipientId,
                envelope: this._cloneProfileData(stored.envelope),
                queuedAt: Number(stored.queuedAt),
                timestampFinalized: stored.timestampFinalized === true,
                attempt: 0,
                timer: null,
                inFlightPromise: null
            });
        });
        this._persistNormalRewardOutbox(authorHostId);
        this._pendingNormalRewardWrites.forEach((entry) => this._attemptNormalRewardWrite(entry));
        return this._pendingNormalRewardWrites.size;
    }

    _enqueueNormalRewardReceipt(playerId, data, options = {}) {
        const sealedAuthorHostId = options.sealedAuthorHostId || null;
        const hasSealedAuthority = sealedAuthorHostId === this.playerId;
        if (!this.connected || (!this.isHost && !hasSealedAuthority)
            || !this.playerId || !this.dbRef || !playerId) return false;
        if (options.requireLocalPersistence === true
            && !this._getDurableRewardLocalStorage()) return false;
        const semanticRewardId = typeof data?.rewardId === 'string' && data.rewardId
            ? data.rewardId.slice(0, 256)
            : null;
        const deterministicReceiptKey = semanticRewardId
            ? this._buildNormalRewardSemanticReceiptKey(this.playerId, playerId, semanticRewardId)
            : null;
        const receiptKey = options.receiptKey
            || deterministicReceiptKey
            || this.dbRef.child(`rewards/${playerId}`).push().key;
        if (options.receiptKey && options.receiptKey !== deterministicReceiptKey) {
            Logger.warn('[Network] Refusing a normal reward receipt key that does not match its semantic reward id');
            return false;
        }
        const queueKey = `${playerId}:${receiptKey}`;
        const existingEntry = this._pendingNormalRewardWrites.get(queueKey);
        if (existingEntry) {
            const existingPayload = this._extractNormalRewardCanonicalPayload(existingEntry.envelope);
            const incomingPayload = this._normalizeNormalRewardCanonicalPayload(data, existingEntry.envelope?.receiptId);
            const samePayload = !!existingPayload && !!incomingPayload
                && this._stableStringifyDurableRewardValue(existingPayload)
                    === this._stableStringifyDurableRewardValue(incomingPayload);
            const sameAuthoredAt = !Number.isFinite(Number(options.authoredAt))
                || Number(existingEntry.envelope?.authoredAt) === Math.round(Number(options.authoredAt));
            if (samePayload && sameAuthoredAt) {
                this._attemptNormalRewardWrite(existingEntry);
                return true;
            }
            Logger.debug(`[Network] Keeping the first local writer for semantic reward ${semanticRewardId}`);
            return true;
        }
        if (this._pendingNormalRewardWrites.size >= NORMAL_REWARD_OUTBOX_MAX_ENTRIES) {
            Logger.error('[Network] Normal reward outbox is full; refusing to discard an older reward.');
            return false;
        }
        const envelope = this._createNormalRewardEnvelope(playerId, data, receiptKey, options);
        if (!receiptKey || !envelope) {
            Logger.warn('[Network] Refusing to enqueue an invalid normal reward request');
            return false;
        }
        const entry = {
            queueKey,
            receiptKey,
            recipientId: playerId,
            envelope,
            queuedAt: Date.now(),
            timestampFinalized: options.timestampFinalized === true
                || this._serverTimeOffsetReady
                || !window.firebase,
            attempt: 0,
            timer: null,
            inFlightPromise: null,
            volatileOnly: false
        };
        this._pendingNormalRewardWrites.set(queueKey, entry);
        if (!this._persistNormalRewardOutbox(this.playerId)) {
            if (options.requireLocalPersistence === true) {
                this._pendingNormalRewardWrites.delete(queueKey);
                Logger.error('[Network] Normal reward receipt persistence was required but unavailable.');
                return false;
            }
            entry.volatileOnly = true;
            Logger.error('[Network] Normal reward receipt is in volatile retry mode until its shared commit.');
        }
        this._attemptNormalRewardWrite(entry);
        return entry.volatileOnly !== true;
    }

    _scheduleNormalRewardWrite(entry) {
        if (!entry
            || this._pendingNormalRewardWrites.get(entry.queueKey) !== entry
            || entry.envelope?.authorHostId !== this.playerId
            || entry.timer) return;
        const delay = this._getDurableRewardRetryDelay(entry.attempt);
        entry.attempt += 1;
        entry.timer = setTimeout(() => {
            entry.timer = null;
            this._attemptNormalRewardWrite(entry);
        }, delay);
    }

    _attemptNormalRewardWrite(entry) {
        if (!entry
            || this._pendingNormalRewardWrites.get(entry.queueKey) !== entry
            || entry.envelope?.authorHostId !== this.playerId) return Promise.resolve(false);
        if (entry.inFlightPromise) return entry.inFlightPromise;
        const lifecycleContext = {
            generation: this._networkLifecycleGeneration,
            playerId: this.playerId,
            dbRef: this.dbRef
        };
        const writePromise = (async () => {
            if (!this.dbRef) {
                this._scheduleNormalRewardWrite(entry);
                return false;
            }
            try {
                const serverTimeReady = await this._ensureDurableRewardServerTime();
                if (!serverTimeReady
                    || !this._isDurableRewardLifecycleCurrent(lifecycleContext)
                    || this._pendingNormalRewardWrites.get(entry.queueKey) !== entry) return false;
            } catch (error) {
                Logger.warn(`[Network] Waiting for server time before normal reward write ${entry.envelope.receiptId}`, error);
                this._scheduleNormalRewardWrite(entry);
                return false;
            }

            const serverNow = Math.max(0, Math.round(this.getServerNow()));
            if (!entry.timestampFinalized) {
                const previousEnvelope = entry.envelope;
                entry.envelope = {
                    ...entry.envelope,
                    authoredAt: serverNow,
                    expiresAt: serverNow + NORMAL_REWARD_TTL_MS,
                    ts: serverNow
                };
                entry.timestampFinalized = true;
                if (!this._persistNormalRewardOutbox(entry.envelope.authorHostId)) {
                    if (entry.volatileOnly !== true) {
                        entry.envelope = previousEnvelope;
                        entry.timestampFinalized = false;
                        this._scheduleNormalRewardWrite(entry);
                        return false;
                    }
                }
            } else if (serverNow > Number(entry.envelope.expiresAt)
                && !this._isPermanentNormalRewardEnvelope(entry.envelope)) {
                this._removeNormalRewardOutboxEntry(entry);
                return false;
            }

            const rewardRef = lifecycleContext.dbRef?.child(`rewards/${entry.recipientId}/${entry.receiptKey}`);
            if (!rewardRef || typeof rewardRef.transaction !== 'function') {
                this._scheduleNormalRewardWrite(entry);
                return false;
            }
            try {
                const claimBefore = await this._readNormalRewardClaim(
                    entry.envelope,
                    entry.receiptKey,
                    lifecycleContext.dbRef
                );
                if (!this._isDurableRewardLifecycleCurrent(lifecycleContext)
                    || this._pendingNormalRewardWrites.get(entry.queueKey) !== entry) return false;
                if (claimBefore.matches || claimBefore.semanticMatches) {
                    this._rememberBoundedCommit(
                        this._serverCommittedRewardIds,
                        `${entry.recipientId}:${entry.envelope.rewardId}`,
                        true
                    );
                    await this._removeNormalRewardPendingIfMatch(rewardRef, entry.envelope);
                    this._removeNormalRewardOutboxEntry(entry);
                    return true;
                }
                if (claimBefore.value || claimBefore.invalidIndex) {
                    Logger.error(`[Network] Normal reward claim key was already won by a different first writer: ${entry.envelope.receiptId}`);
                    this._removeNormalRewardOutboxEntry(entry);
                    return true;
                }

                this._recordNetworkWrite('normalRewardV2', entry.envelope);
                const result = await rewardRef.transaction((current) => {
                    if (!current) return entry.envelope;
                    if (this._doesNormalRewardReceiptMatchEnvelope(current, entry.envelope)
                        || this._doesNormalRewardSemanticIdentityMatch(current, entry.envelope)) return;
                    return;
                });
                const value = result?.snapshot?.val?.();
                const claimAfter = await this._readNormalRewardClaim(
                    entry.envelope,
                    entry.receiptKey,
                    lifecycleContext.dbRef
                );
                if (!this._isDurableRewardLifecycleCurrent(lifecycleContext)
                    || this._pendingNormalRewardWrites.get(entry.queueKey) !== entry) return false;
                if (claimAfter.matches || claimAfter.semanticMatches) {
                    this._rememberBoundedCommit(
                        this._serverCommittedRewardIds,
                        `${entry.recipientId}:${entry.envelope.rewardId}`,
                        true
                    );
                    await this._removeNormalRewardPendingIfMatch(rewardRef, entry.envelope);
                    this._removeNormalRewardOutboxEntry(entry);
                    this._markNetworkActivity();
                    return true;
                }
                if (claimAfter.value || claimAfter.invalidIndex) {
                    Logger.error(`[Network] Normal reward post-write key was already won by a different first writer: ${entry.envelope.receiptId}`);
                    this._removeNormalRewardOutboxEntry(entry);
                    return true;
                }
                if (this._doesNormalRewardReceiptMatchEnvelope(value, entry.envelope)) {
                    this._rememberBoundedCommit(
                        this._serverCommittedRewardIds,
                        `${entry.recipientId}:${entry.envelope.rewardId}`,
                        true
                    );
                    this._removeNormalRewardOutboxEntry(entry);
                    this._markNetworkActivity();
                    return true;
                }
                if (this._doesNormalRewardSemanticIdentityMatch(value, entry.envelope)) {
                    this._rememberBoundedCommit(
                        this._serverCommittedRewardIds,
                        `${entry.recipientId}:${entry.envelope.rewardId}`,
                        true
                    );
                    Logger.debug(`[Network] Normal reward ${entry.envelope.rewardId} was superseded by an equivalent first writer`);
                    this._removeNormalRewardOutboxEntry(entry);
                    this._markNetworkActivity();
                    return true;
                }
                Logger.error(`[Network] Normal reward key collision for ${entry.envelope.receiptId}`);
                this._removeNormalRewardOutboxEntry(entry);
                return true;
            } catch (error) {
                Logger.warn(`[Network] Normal reward write will retry for ${entry.envelope.receiptId}`, error);
                this._scheduleNormalRewardWrite(entry);
                return false;
            }
        })();
        entry.inFlightPromise = writePromise;
        const clearInFlight = () => {
            if (entry.inFlightPromise === writePromise) entry.inFlightPromise = null;
        };
        void writePromise.then(clearInFlight, clearInFlight);
        return writePromise;
    }

    _clearNormalRewardRuntime(options = {}) {
        if (this._normalRewardDrainTimer) {
            clearTimeout(this._normalRewardDrainTimer);
            this._normalRewardDrainTimer = null;
        }
        const authorHostId = this.playerId;
        const pendingEntries = Array.from(this._pendingNormalRewardWrites.values());
        pendingEntries.forEach((entry) => {
            if (entry?.timer) clearTimeout(entry.timer);
            if (entry) entry.timer = null;
        });
        if (authorHostId && pendingEntries.length > 0) {
            this._persistNormalRewardOutbox(authorHostId, pendingEntries);
            const bucketKey = this._getNormalRewardOutboxBucketKey(authorHostId);
            const merged = new Map();
            [...(this._dormantNormalRewardWritesByAuthor.get(bucketKey) || []), ...pendingEntries]
                .forEach((entry) => {
                    if (entry?.queueKey && entry.envelope?.authorHostId === authorHostId) {
                        merged.set(entry.queueKey, entry);
                    }
                });
            this._dormantNormalRewardWritesByAuthor.set(bucketKey, Array.from(merged.values()));
        }
        this._pendingNormalRewardWrites.clear();
        this._normalRewardInFlight.clear();
        Array.from(this._incomingRewardSnapshotQueue.entries()).forEach(([queueKey, item]) => {
            if (item?.channel === 'normal') this._incomingRewardSnapshotQueue.delete(queueKey);
        });
        this._normalRewardLegacyValidationCache.clear();
        this._normalRewardDrainAttempt = 0;
        if (options.clearConsumer !== false) {
            this._normalRewardConsumer = null;
            this._normalRewardConsumerGeneration += 1;
        }
    }

    _isDurableBossRewardPayload(data) {
        return !!(
            data
            && typeof data === 'object'
            && ['boss_items', 'boss_progress'].includes(data.kind)
        );
    }

    _isDurableBossRewardRequest(data) {
        return !!(
            this._isDurableBossRewardPayload(data)
            && data.bossReward === true
            && typeof data.rewardId === 'string'
            && data.rewardId
            && (
                (data.kind === 'boss_items' && Array.isArray(data.items) && data.items.length > 0)
                || (data.kind === 'boss_progress'
                    && data.rewardKind === 'boss_exp'
                    && Number.isInteger(Number(data.exp))
                    && Number(data.exp) > 0)
            )
        );
    }

    _getDurableRewardDatabaseRef(path = '') {
        const normalizedPath = [DURABLE_BOSS_REWARD_PATH, String(path || '').replace(/^\/+/, '')]
            .filter(Boolean)
            .join('/');
        return this.dbRef?.child?.(normalizedPath) || null;
    }

    _getDurableRewardInboxRef(playerId = this.playerId) {
        return playerId ? this._getDurableRewardDatabaseRef(String(playerId)) : null;
    }

    _getDurableRewardReceiptRef(playerId, rewardKey) {
        return playerId && rewardKey
            ? this._getDurableRewardDatabaseRef(`${playerId}/${rewardKey}`)
            : null;
    }

    _getDurableRewardCatalogVersion() {
        const version = Number(window.game?.itemData?.loadedCatalog?.schemaVersion);
        return Number.isInteger(version) && version > 0 ? version : null;
    }

    _stableStringifyDurableRewardValue(value) {
        if (Array.isArray(value)) {
            return `[${value.map((entry) => this._stableStringifyDurableRewardValue(entry)).join(',')}]`;
        }
        if (value && typeof value === 'object') {
            return `{${Object.keys(value).sort().map((key) => (
                `${JSON.stringify(key)}:${this._stableStringifyDurableRewardValue(value[key])}`
            )).join(',')}}`;
        }
        return JSON.stringify(value);
    }

    _hashDurableRewardCatalogValue(value) {
        const source = this._stableStringifyDurableRewardValue(value);
        let hash = 0x811c9dc5;
        for (let index = 0; index < source.length; index += 1) {
            hash ^= source.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return `fnv1a32_${hash.toString(16).padStart(8, '0')}`;
    }

    _getDurableBossRewardCatalogFingerprint(bossTypeId, itemSeeds) {
        const itemData = window.game?.itemData;
        if (!itemData || !bossTypeId || !Array.isArray(itemSeeds)) return null;
        try {
            const guaranteedDrops = itemData.getBossDrops(bossTypeId)
                .filter((drop) => drop?.itemId && Number(drop.chance ?? 1) >= 1)
                .map((drop) => ({
                    itemId: String(drop.itemId),
                    chance: Number(drop.chance ?? 1),
                    quantity: Math.max(1, Math.floor(Number(drop.quantity || 1)))
                }))
                .sort((a, b) => `${a.itemId}:${a.quantity}`.localeCompare(`${b.itemId}:${b.quantity}`));
            const items = itemSeeds.map((seed) => {
                const definition = itemData.getItemDefinition(seed.itemId);
                const pool = definition ? itemData.getAffixPool(definition.prefixPool) : null;
                const affix = itemData.getAffixDefinition(seed.prefixId);
                if (!definition || !pool || !affix) throw new Error('catalog entry unavailable');
                const rolledEffects = {};
                Object.keys(affix.rolledEffects || {}).sort().forEach((key) => {
                    const rule = affix.rolledEffects[key] || {};
                    rolledEffects[key] = {
                        min: Number.isFinite(Number(rule.min)) ? Number(rule.min) : 0,
                        max: Number.isFinite(Number(rule.max)) ? Number(rule.max) : Number(rule.min || 0)
                    };
                });
                return {
                    itemId: seed.itemId,
                    stackable: definition.stackable,
                    slot: definition.slot,
                    dropSource: Array.isArray(definition.dropSource) ? [...definition.dropSource].sort() : [],
                    prefixPool: definition.prefixPool,
                    poolAffixIds: Array.isArray(pool.affixes)
                        ? pool.affixes.map((entry) => entry?.id).filter(Boolean).sort()
                        : [],
                    prefixId: seed.prefixId,
                    rolledEffects
                };
            }).sort((a, b) => `${a.itemId}:${a.prefixId}`.localeCompare(`${b.itemId}:${b.prefixId}`));
            return this._hashDurableRewardCatalogValue({ bossTypeId, guaranteedDrops, items });
        } catch (error) {
            return null;
        }
    }

    async _ensureDurableRewardServerTime() {
        if (!window.firebase) return true;
        if (!this._serverTimeOffsetReady) {
            await this._ensureServerTimeOffset({ throwOnError: true });
        }
        return this._serverTimeOffsetReady;
    }

    _isDurableRewardLifecycleCurrent(context = null) {
        if (!context) return true;
        return context.generation === this._networkLifecycleGeneration
            && context.playerId === this.playerId
            && context.dbRef === this.dbRef;
    }

    _getDurableRewardOutboxBucketKey(authorHostId = this.playerId) {
        return authorHostId ? `${this.roomId}::${authorHostId}` : null;
    }

    _getDurableRewardOutboxStorageKey(authorHostId = this.playerId) {
        const bucketKey = this._getDurableRewardOutboxBucketKey(authorHostId);
        return bucketKey
            ? `${DURABLE_BOSS_REWARD_OUTBOX_STORAGE_PREFIX}:${encodeURIComponent(bucketKey)}`
            : null;
    }

    _getDurableRewardLocalStorage() {
        try {
            return window.localStorage || null;
        } catch (error) {
            return null;
        }
    }

    _serializeDurableRewardOutboxEntry(entry) {
        if (!entry?.envelope) return null;
        return {
            schemaVersion: DURABLE_BOSS_REWARD_SCHEMA_VERSION,
            roomId: this.roomId,
            authorHostId: entry.envelope.authorHostId,
            recipientId: entry.recipientId,
            rewardKey: entry.rewardKey,
            queuedAt: Number(entry.queuedAt || Date.now()),
            timestampFinalized: entry.timestampFinalized === true,
            envelope: JSON.parse(JSON.stringify(entry.envelope))
        };
    }

    _isValidStoredDurableRewardOutboxEntry(stored, authorHostId = this.playerId) {
        if (!stored || typeof stored !== 'object' || Array.isArray(stored)
            || stored.schemaVersion !== DURABLE_BOSS_REWARD_SCHEMA_VERSION
            || stored.roomId !== this.roomId
            || stored.authorHostId !== authorHostId
            || typeof stored.recipientId !== 'string' || !stored.recipientId
            || typeof stored.rewardKey !== 'string' || !stored.rewardKey
            || !Number.isFinite(Number(stored.queuedAt))) return false;

        const envelope = stored.envelope;
        const pendingFields = envelope?.kind === 'boss_progress'
            ? DURABLE_BOSS_PROGRESS_PENDING_FIELDS
            : DURABLE_BOSS_REWARD_PENDING_FIELDS;
        const requiredPendingFields = envelope?.kind === 'boss_progress'
            ? DURABLE_BOSS_PROGRESS_PENDING_FIELDS
            : DURABLE_BOSS_REWARD_PENDING_REQUIRED_FIELDS;
        if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
            || Object.keys(envelope).some((key) => !pendingFields.has(key))
            || Array.from(requiredPendingFields).some((key) => !Object.prototype.hasOwnProperty.call(envelope, key))
            || envelope.schemaVersion !== DURABLE_BOSS_REWARD_SCHEMA_VERSION
            || !['boss_items', 'boss_progress'].includes(envelope.kind)
            || envelope.status !== 'pending'
            || envelope.authorHostId !== authorHostId
            || envelope.recipientId !== stored.recipientId
            || envelope.rewardId !== this._buildExpectedBossItemRewardId(envelope)
            || stored.rewardKey !== this._buildDurableRewardKey(envelope.rewardId)) return false;

        if (envelope.kind === 'boss_progress') {
            const meta = envelope.rewardMeta;
            if (!Number.isInteger(Number(envelope.exp)) || Number(envelope.exp) <= 0
                || !meta || typeof meta !== 'object' || Array.isArray(meta)
                || Object.keys(meta).some((key) => !DURABLE_BOSS_PROGRESS_META_FIELDS.has(key))
                || Array.from(DURABLE_BOSS_PROGRESS_META_FIELDS).some((key) => !Object.prototype.hasOwnProperty.call(meta, key))) {
                return false;
            }
        } else if (!Number.isInteger(Number(envelope.catalogVersion))
            || Number(envelope.catalogVersion) <= 0
            || typeof envelope.catalogFingerprint !== 'string'
            || !/^fnv1a32_[0-9a-f]{8}$/.test(envelope.catalogFingerprint)) {
            return false;
        }

        if (envelope.kind === 'boss_items') {
            const serializedSeeds = this._serializeDurableBossItemSeeds(
                Array.isArray(envelope.itemSeeds)
                    ? envelope.itemSeeds.map((seed) => ({
                        id: seed?.itemId,
                        instanceId: seed?.instanceId,
                        prefixId: seed?.prefixId,
                        rolledValues: seed?.rolledValues
                    }))
                    : null
            );
            if (!serializedSeeds || JSON.stringify(serializedSeeds) !== JSON.stringify(envelope.itemSeeds)) return false;
            const hasSnapshots = Object.prototype.hasOwnProperty.call(envelope, 'itemSnapshots')
                || Object.prototype.hasOwnProperty.call(envelope, 'itemSnapshotFingerprint');
            if (hasSnapshots) {
                const serializedSnapshots = this._serializeDurableBossItemSnapshots(
                    envelope.itemSnapshots,
                    envelope.itemSeeds
                );
                const expectedFingerprint = serializedSnapshots
                    ? this._hashDurableRewardCatalogValue({
                        bossTypeId: envelope.bossTypeId,
                        itemSnapshots: serializedSnapshots
                    })
                    : null;
                if (!serializedSnapshots
                    || this._stableStringifyDurableRewardValue(serializedSnapshots)
                        !== this._stableStringifyDurableRewardValue(envelope.itemSnapshots)
                    || expectedFingerprint !== envelope.itemSnapshotFingerprint) return false;
            }
        }

        const authoredAt = Number(envelope.authoredAt);
        const expiresAt = Number(envelope.expiresAt);
        return Number.isFinite(authoredAt)
            && authoredAt > 0
            && Number.isFinite(expiresAt)
            && expiresAt - authoredAt === DURABLE_BOSS_REWARD_TTL_MS;
    }

    _persistDurableRewardOutbox(authorHostId = this.playerId, entries = null) {
        if (!authorHostId) return false;
        const storage = this._getDurableRewardLocalStorage();
        const storageKey = this._getDurableRewardOutboxStorageKey(authorHostId);
        if (!storage || !storageKey) return false;
        const sourceEntries = Array.isArray(entries)
            ? entries
            : Array.from(this._pendingDurableRewardWrites.values());
        const serialized = sourceEntries
            .filter((entry) => entry?.envelope?.authorHostId === authorHostId
                && entry.volatileOnly !== true)
            .map((entry) => this._serializeDurableRewardOutboxEntry(entry))
            .filter(Boolean)
            .slice(-DURABLE_BOSS_REWARD_OUTBOX_MAX_ENTRIES);
        try {
            if (serialized.length === 0) storage.removeItem(storageKey);
            else storage.setItem(storageKey, JSON.stringify(serialized));
            return true;
        } catch (error) {
            Logger.warn('[Network] Failed to persist the durable reward outbox', error);
            return false;
        }
    }

    _getDurableRewardOutboxEntriesForAuthor(authorHostId) {
        if (!authorHostId) return [];
        const entries = new Map();
        this._pendingDurableRewardWrites.forEach((entry) => {
            if (entry?.envelope?.authorHostId === authorHostId) entries.set(entry.queueKey, entry);
        });
        const bucketKey = this._getDurableRewardOutboxBucketKey(authorHostId);
        (this._dormantDurableRewardWritesByAuthor.get(bucketKey) || []).forEach((entry) => {
            if (entry?.envelope?.authorHostId === authorHostId && !entries.has(entry.queueKey)) {
                entries.set(entry.queueKey, entry);
            }
        });
        return Array.from(entries.values());
    }

    _removeDurableRewardOutboxEntry(entry) {
        if (!entry?.queueKey || !entry?.envelope?.authorHostId) return;
        if (entry.timer) {
            clearTimeout(entry.timer);
            entry.timer = null;
        }
        if (this._pendingDurableRewardWrites.get(entry.queueKey) === entry) {
            this._pendingDurableRewardWrites.delete(entry.queueKey);
        }
        const authorHostId = entry.envelope.authorHostId;
        const bucketKey = this._getDurableRewardOutboxBucketKey(authorHostId);
        const dormantEntries = this._dormantDurableRewardWritesByAuthor.get(bucketKey) || [];
        const remainingDormantEntries = dormantEntries.filter((candidate) => candidate?.queueKey !== entry.queueKey);
        if (remainingDormantEntries.length > 0) {
            this._dormantDurableRewardWritesByAuthor.set(bucketKey, remainingDormantEntries);
        } else {
            this._dormantDurableRewardWritesByAuthor.delete(bucketKey);
        }
        this._persistDurableRewardOutbox(
            authorHostId,
            this._getDurableRewardOutboxEntriesForAuthor(authorHostId)
        );
    }

    _restoreDurableRewardOutbox() {
        const authorHostId = this.playerId;
        const bucketKey = this._getDurableRewardOutboxBucketKey(authorHostId);
        if (!authorHostId || !bucketKey) return 0;

        const candidates = [];
        const dormantEntries = this._dormantDurableRewardWritesByAuthor.get(bucketKey) || [];
        this._dormantDurableRewardWritesByAuthor.delete(bucketKey);
        const dormantVolatileEntries = dormantEntries.filter((entry) => entry?.volatileOnly === true);
        dormantEntries.filter((entry) => entry?.volatileOnly !== true).forEach((entry) => {
            const stored = this._serializeDurableRewardOutboxEntry(entry);
            if (stored) candidates.push(stored);
        });

        const storage = this._getDurableRewardLocalStorage();
        const storageKey = this._getDurableRewardOutboxStorageKey(authorHostId);
        if (storage && storageKey) {
            try {
                const parsed = JSON.parse(storage.getItem(storageKey) || '[]');
                if (Array.isArray(parsed)) candidates.push(...parsed);
            } catch (error) {
                Logger.warn('[Network] Ignoring an unreadable durable reward outbox', error);
            }
        }

        candidates.slice(-DURABLE_BOSS_REWARD_OUTBOX_MAX_ENTRIES).forEach((stored) => {
            if (!this._isValidStoredDurableRewardOutboxEntry(stored, authorHostId)) return;
            const queueKey = `${stored.recipientId}:${stored.rewardKey}`;
            if (this._pendingDurableRewardWrites.has(queueKey)) return;
            this._pendingDurableRewardWrites.set(queueKey, {
                queueKey,
                rewardKey: stored.rewardKey,
                recipientId: stored.recipientId,
                envelope: JSON.parse(JSON.stringify(stored.envelope)),
                authorHostId,
                queuedAt: Number(stored.queuedAt),
                timestampFinalized: stored.timestampFinalized === true,
                attempt: 0,
                timer: null
            });
        });

        // A volatile entry exists only when every browser-persistent fallback was
        // unavailable. Preserve it across an in-page disconnect/reconnect without
        // letting it displace any of the 128 crash-persistent receipts.
        dormantVolatileEntries.slice(-DURABLE_BOSS_REWARD_VOLATILE_MAX_ENTRIES).forEach((entry) => {
            const stored = this._serializeDurableRewardOutboxEntry(entry);
            if (!stored || !this._isValidStoredDurableRewardOutboxEntry(stored, authorHostId)) return;
            const queueKey = `${stored.recipientId}:${stored.rewardKey}`;
            if (this._pendingDurableRewardWrites.has(queueKey)) return;
            this._pendingDurableRewardWrites.set(queueKey, {
                queueKey,
                rewardKey: stored.rewardKey,
                recipientId: stored.recipientId,
                envelope: JSON.parse(JSON.stringify(stored.envelope)),
                authorHostId,
                queuedAt: Number(stored.queuedAt),
                timestampFinalized: stored.timestampFinalized === true,
                attempt: 0,
                timer: null,
                volatileOnly: true
            });
        });

        this._persistDurableRewardOutbox(authorHostId);
        Array.from(this._pendingDurableRewardWrites.values()).forEach((entry) => {
            this._attemptDurableBossRewardWrite(entry);
        });
        return this._pendingDurableRewardWrites.size;
    }

    _doesDurableRewardReceiptMatchEnvelope(receipt, envelope) {
        if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
            || !envelope || typeof envelope !== 'object') return false;
        const isProgress = envelope.kind === 'boss_progress';
        const allowedFields = isProgress
            ? (receipt.status === 'claimed' ? DURABLE_BOSS_PROGRESS_CLAIMED_FIELDS : DURABLE_BOSS_PROGRESS_PENDING_FIELDS)
            : (receipt.status === 'claimed' ? DURABLE_BOSS_REWARD_CLAIMED_FIELDS : DURABLE_BOSS_REWARD_PENDING_FIELDS);
        if (!['pending', 'claimed'].includes(receipt.status)
            || Object.keys(receipt).some((key) => !allowedFields.has(key))) return false;

        const immutableFields = [
            'schemaVersion', 'kind', 'rewardId', 'recipientId', 'authorHostId',
            'fieldId', 'bossTypeId', 'bossInstanceId', 'monsterName', 'authoredAt', 'expiresAt',
            ...(isProgress ? ['exp'] : ['catalogVersion', 'catalogFingerprint'])
        ];
        if (immutableFields.some((key) => receipt[key] !== envelope[key])) return false;
        if (isProgress && JSON.stringify(receipt.rewardMeta) !== JSON.stringify(envelope.rewardMeta)) return false;
        if (receipt.status === 'pending') {
            return isProgress || (
                JSON.stringify(receipt.itemSeeds) === JSON.stringify(envelope.itemSeeds)
                && JSON.stringify(receipt.itemSnapshots) === JSON.stringify(envelope.itemSnapshots)
                && receipt.itemSnapshotFingerprint === envelope.itemSnapshotFingerprint
            );
        }
        const claimedAt = Number(receipt.claimedAt);
        return receipt.claimedBy === envelope.recipientId
            && Number.isFinite(claimedAt)
            && claimedAt >= Number(envelope.authoredAt);
    }

    _buildDurableRewardKey(rewardId) {
        if (typeof rewardId !== 'string' || !rewardId) return null;
        try {
            const bytes = new TextEncoder().encode(rewardId);
            if (bytes.length === 0 || bytes.length > DURABLE_BOSS_REWARD_MAX_ID_BYTES) return null;
            let binary = '';
            for (let offset = 0; offset < bytes.length; offset += 0x8000) {
                binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
            }
            const encoded = btoa(binary)
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/g, '');
            return encoded ? `v1_${encoded}` : null;
        } catch (error) {
            Logger.warn('[Network] Failed to encode a durable reward key', error);
            return null;
        }
    }

    _buildExpectedBossItemRewardId(data) {
        if (!data?.fieldId || !data?.bossInstanceId || !data?.recipientId) return null;
        const rewardKind = data.kind === 'boss_progress' ? 'boss_exp' : 'boss_items';
        const rewardId = `monster_reward:${data.fieldId}:${data.bossInstanceId}:${data.recipientId}:${rewardKind}`;
        return rewardId.length <= 256 ? rewardId : null;
    }

    _serializeDurableBossItemSeeds(items) {
        if (!Array.isArray(items) || items.length === 0 || items.length > DURABLE_BOSS_REWARD_MAX_ITEMS) return null;
        const seeds = [];
        const instanceIds = new Set();

        for (const item of items) {
            const itemId = typeof (item?.id || item?.type) === 'string'
                ? String(item.id || item.type)
                : '';
            const instanceId = typeof item?.instanceId === 'string' ? item.instanceId : '';
            const prefixId = typeof item?.prefixId === 'string' ? item.prefixId : '';
            const rolledValues = item?.rolledValues;
            if (!itemId || itemId.length > 128
                || !instanceId || instanceId.length > 128
                || !prefixId || prefixId.length > 128
                || instanceIds.has(instanceId)
                || !rolledValues || typeof rolledValues !== 'object' || Array.isArray(rolledValues)) {
                return null;
            }

            const safeRolledValues = {};
            for (const [key, rawValue] of Object.entries(rolledValues)) {
                const value = Number(rawValue);
                if (!key || key.length > 128 || !Number.isFinite(value)) return null;
                safeRolledValues[key] = value;
            }

            instanceIds.add(instanceId);
            seeds.push({
                itemId,
                amount: 1,
                instanceId,
                prefixId,
                rolledValues: safeRolledValues
            });
        }

        return seeds;
    }

    _serializeDurableBossNumericMap(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const entries = Object.entries(value);
        if (entries.length > 32) return null;
        const serialized = {};
        for (const [key, rawValue] of entries) {
            const numberValue = Number(rawValue);
            if (!key || key.length > 128
                || !Number.isFinite(numberValue)
                || Math.abs(numberValue) > 1_000_000_000) return null;
            serialized[key] = numberValue;
        }
        return serialized;
    }

    _serializeDurableBossItemSnapshots(items, itemSeeds) {
        if (!Array.isArray(items)
            || !Array.isArray(itemSeeds)
            || items.length === 0
            || items.length !== itemSeeds.length
            || items.length > DURABLE_BOSS_REWARD_MAX_ITEMS) return null;

        const snapshots = [];
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            const seed = itemSeeds[index];
            const itemId = typeof (item?.id || item?.type) === 'string'
                ? String(item.id || item.type)
                : '';
            const type = typeof (item?.type || item?.id) === 'string'
                ? String(item.type || item.id)
                : '';
            const safeString = (value, maxLength, fallback = '') => (
                typeof value === 'string' ? value.slice(0, maxLength) : fallback
            );
            const nullableString = (value, maxLength) => (
                typeof value === 'string' ? value.slice(0, maxLength) : null
            );
            const rolledValues = this._serializeDurableBossNumericMap(item?.rolledValues);
            const enhancementBonuses = this._serializeDurableBossNumericMap(item?.enhancementBonuses || {});
            const baseStats = this._serializeDurableBossNumericMap(item?.baseStats || {});
            if (!itemId || itemId.length > 128
                || type !== itemId
                || itemId !== seed?.itemId
                || item?.instanceId !== seed?.instanceId
                || item?.prefixId !== seed?.prefixId
                || item?.stackable !== false
                || (item?.slot || 'weapon') !== 'weapon'
                || Number(item?.amount || 1) !== 1
                || Math.max(0, Math.floor(Number(item?.enhancementLevel || 0))) !== 0
                || !rolledValues
                || !enhancementBonuses
                || !baseStats
                || this._stableStringifyDurableRewardValue(rolledValues)
                    !== this._stableStringifyDurableRewardValue(seed.rolledValues)) {
                return null;
            }

            const snapshot = {
                id: itemId,
                type,
                amount: 1,
                instanceId: seed.instanceId,
                name: safeString(item?.name, 256, itemId),
                baseName: safeString(item?.baseName, 256, safeString(item?.name, 256, itemId)),
                icon: safeString(item?.icon, 64, ''),
                iconPath: nullableString(item?.iconPath, 512),
                stackable: false,
                slot: 'weapon',
                rarity: safeString(item?.rarity, 64, 'boss'),
                prefixId: seed.prefixId,
                prefix: nullableString(item?.prefix, 128),
                rolledValues,
                isNewlyAcquired: true,
                enhancementLevel: 0,
                enhancementRuleSet: nullableString(item?.enhancementRuleSet, 128),
                enhancementBonuses,
                baseStats,
                description: safeString(item?.description, 2048, '')
            };
            if (Object.keys(snapshot).some((key) => !DURABLE_BOSS_REWARD_ITEM_SNAPSHOT_FIELDS.has(key))
                || JSON.stringify(snapshot).length > 16384) return null;
            snapshots.push(snapshot);
        }
        return snapshots;
    }

    _validateDurableBossRewardAgainstArchivedCatalog(data, itemSeeds, itemSnapshots) {
        const archive = DURABLE_BOSS_REWARD_ARCHIVED_CATALOGS[Number(data?.catalogVersion)];
        const expectedItemIds = archive?.bosses?.[data?.bossTypeId];
        if (!archive || !Array.isArray(expectedItemIds)) {
            return { ok: false, reason: 'archived_catalog_unavailable' };
        }
        if (!Array.isArray(itemSeeds)
            || !Array.isArray(itemSnapshots)
            || itemSeeds.length !== expectedItemIds.length
            || itemSnapshots.length !== expectedItemIds.length) {
            return { ok: false, reason: 'archived_boss_drop_mismatch' };
        }

        const expectedCounts = new Map();
        expectedItemIds.forEach((itemId) => {
            expectedCounts.set(itemId, (expectedCounts.get(itemId) || 0) + 1);
        });
        for (let index = 0; index < itemSeeds.length; index += 1) {
            const seed = itemSeeds[index];
            const snapshot = itemSnapshots[index];
            const itemPolicy = archive.items?.[seed?.itemId];
            const affixPolicy = itemPolicy?.affixes?.[seed?.prefixId];
            const remaining = expectedCounts.get(seed?.itemId) || 0;
            if (!itemPolicy || !affixPolicy || remaining <= 0) {
                return { ok: false, reason: 'archived_item_not_allowed' };
            }
            expectedCounts.set(seed.itemId, remaining - 1);
            if (!snapshot
                || snapshot.id !== seed.itemId
                || snapshot.type !== seed.itemId
                || snapshot.instanceId !== seed.instanceId
                || snapshot.prefixId !== seed.prefixId
                || snapshot.amount !== 1
                || snapshot.stackable !== false
                || snapshot.slot !== 'weapon'
                || snapshot.enhancementLevel !== 0
                || snapshot.enhancementRuleSet !== itemPolicy.enhancementRuleSet
                || this._stableStringifyDurableRewardValue(snapshot.baseStats)
                    !== this._stableStringifyDurableRewardValue(itemPolicy.baseStats)
                || this._stableStringifyDurableRewardValue(snapshot.enhancementBonuses)
                    !== this._stableStringifyDurableRewardValue(itemPolicy.enhancementBonuses)) {
                return { ok: false, reason: 'archived_item_snapshot_mismatch' };
            }

            const rollRules = affixPolicy.rolledEffects || {};
            const rollKeys = Object.keys(seed.rolledValues || {}).sort();
            const ruleKeys = Object.keys(rollRules).sort();
            if (rollKeys.length !== ruleKeys.length
                || rollKeys.some((key, rollIndex) => key !== ruleKeys[rollIndex])) {
                return { ok: false, reason: 'archived_roll_shape_mismatch' };
            }
            for (const [key, rule] of Object.entries(rollRules)) {
                const value = Number(seed.rolledValues[key]);
                if (!Number.isFinite(value)
                    || value < Number(rule.min) - 1e-9
                    || value > Number(rule.max) + 1e-9) {
                    return { ok: false, reason: 'archived_roll_out_of_range' };
                }
            }
        }
        if (Array.from(expectedCounts.values()).some((count) => count !== 0)) {
            return { ok: false, reason: 'archived_boss_drop_mismatch' };
        }
        return { ok: true, reason: 'accepted' };
    }

    _materializeDurableBossItemFromArchive(data, seed) {
        const archiveVersion = Number(data?.catalogVersion);
        const itemPolicy = DURABLE_BOSS_REWARD_ARCHIVED_CATALOGS[archiveVersion]?.items?.[seed?.itemId];
        const affixPolicy = itemPolicy?.affixes?.[seed?.prefixId];
        if (!itemPolicy || !affixPolicy) return null;
        return {
            id: seed.itemId,
            type: seed.itemId,
            amount: 1,
            instanceId: seed.instanceId,
            name: affixPolicy.displayName || itemPolicy.name,
            baseName: itemPolicy.name,
            icon: itemPolicy.icon,
            iconPath: itemPolicy.iconPath,
            stackable: false,
            slot: 'weapon',
            rarity: itemPolicy.rarity,
            prefixId: seed.prefixId,
            prefix: affixPolicy.prefix || null,
            rolledValues: { ...seed.rolledValues },
            isNewlyAcquired: true,
            enhancementLevel: 0,
            enhancementRuleSet: itemPolicy.enhancementRuleSet,
            enhancementBonuses: { ...itemPolicy.enhancementBonuses },
            baseStats: { ...itemPolicy.baseStats },
            description: itemPolicy.description || '',
            durableEntitlementVersion: archiveVersion,
            durableEntitlementBossTypeId: data.bossTypeId
        };
    }

    _createDurableBossRewardEnvelope(playerId, data, options = {}) {
        if (!playerId || !this.playerId || !this._isDurableBossRewardRequest(data)) return null;
        if (data.kind === 'boss_progress') {
            return this._createDurableBossProgressEnvelope(playerId, data, options);
        }
        const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());
        const bossTypeId = typeof data.bossTypeId === 'string' ? data.bossTypeId : '';
        const bossInstanceId = typeof data.bossInstanceId === 'string' ? data.bossInstanceId : '';
        const catalogVersion = this._getDurableRewardCatalogVersion();
        const itemSeeds = this._serializeDurableBossItemSeeds(data.items);
        const itemSnapshots = itemSeeds
            ? this._serializeDurableBossItemSnapshots(data.items, itemSeeds)
            : null;
        const catalogFingerprint = itemSeeds
            ? this._getDurableBossRewardCatalogFingerprint(bossTypeId, itemSeeds)
            : null;
        const itemSnapshotFingerprint = itemSnapshots
            ? this._hashDurableRewardCatalogValue({ bossTypeId, itemSnapshots })
            : null;
        if (!fieldId || fieldId.length > 192
            || !bossTypeId || bossTypeId.length > 128
            || !bossInstanceId || bossInstanceId.length > 128
            || !catalogVersion
            || !catalogFingerprint
            || !itemSeeds
            || !itemSnapshots
            || !itemSnapshotFingerprint) return null;

        const authoredAt = Math.max(0, Math.round(this.getServerNow()));
        const envelope = {
            schemaVersion: DURABLE_BOSS_REWARD_SCHEMA_VERSION,
            kind: 'boss_items',
            status: 'pending',
            rewardId: data.rewardId,
            recipientId: String(playerId),
            authorHostId: String(this.playerId),
            fieldId,
            bossTypeId,
            bossInstanceId,
            monsterName: typeof data.monsterName === 'string' ? data.monsterName.slice(0, 128) : bossTypeId,
            catalogVersion,
            catalogFingerprint,
            itemSeeds,
            itemSnapshots,
            itemSnapshotFingerprint,
            authoredAt,
            expiresAt: authoredAt + DURABLE_BOSS_REWARD_TTL_MS
        };
        if (envelope.rewardId !== this._buildExpectedBossItemRewardId(envelope)) return null;
        if (!this._buildDurableRewardKey(envelope.rewardId)) return null;
        return envelope;
    }

    _getDurableBossExpMultiplier(playerLevel, monsterLevel) {
        const gap = Math.max(0, Number(playerLevel || 1) - Math.max(1, Number(monsterLevel || 1)));
        if (gap <= 3) return 1;
        if (gap <= 5) return 0.75;
        if (gap <= 8) return 0.5;
        if (gap <= 12) return 0.25;
        return 0.1;
    }

    _createDurableBossProgressEnvelope(playerId, data, options = {}) {
        const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());
        const bossTypeId = typeof data.bossTypeId === 'string' ? data.bossTypeId : '';
        const bossInstanceId = typeof data.bossInstanceId === 'string' ? data.bossInstanceId : '';
        const exp = Number(data.exp);
        const meta = data.rewardMeta;
        if (!fieldId || fieldId.length > 192
            || !bossTypeId || bossTypeId.length > 128
            || !bossInstanceId || bossInstanceId.length > 128
            || !Number.isInteger(exp) || exp <= 0 || exp > 10_000_000
            || !meta || typeof meta !== 'object' || Array.isArray(meta)
            || Object.keys(meta).some((key) => !DURABLE_BOSS_PROGRESS_META_FIELDS.has(key))
            || Array.from(DURABLE_BOSS_PROGRESS_META_FIELDS).some((key) => !Object.prototype.hasOwnProperty.call(meta, key))) {
            return null;
        }
        const monsterLevel = Math.max(1, Math.min(999, Math.floor(Number(meta.monsterLevel))));
        const playerLevel = Math.max(1, Math.min(999, Math.floor(Number(meta.playerLevel))));
        const partyMultiplier = Number(meta.partyMultiplier);
        const overlevelMultiplier = Number(meta.overlevelMultiplier);
        const progressPolicy = DURABLE_BOSS_REWARD_ARCHIVED_CATALOGS[1]
            ?.bossProgress?.[bossTypeId];
        const expectedExp = progressPolicy
            ? Math.max(1, Math.floor(
                Number(progressPolicy.baseExp) * partyMultiplier * overlevelMultiplier
            ))
            : 0;
        if (!Number.isFinite(Number(meta.monsterLevel))
            || !Number.isFinite(Number(meta.playerLevel))
            || ![0.6, 1].includes(partyMultiplier)
            || !progressPolicy
            || monsterLevel !== Number(progressPolicy.level)
            || overlevelMultiplier !== this._getDurableBossExpMultiplier(playerLevel, monsterLevel)
            || exp !== expectedExp) return null;

        const authoredAt = Math.max(0, Math.round(this.getServerNow()));
        const envelope = {
            schemaVersion: DURABLE_BOSS_REWARD_SCHEMA_VERSION,
            kind: 'boss_progress',
            status: 'pending',
            rewardId: data.rewardId,
            recipientId: String(playerId),
            authorHostId: String(this.playerId),
            fieldId,
            bossTypeId,
            bossInstanceId,
            monsterName: typeof data.monsterName === 'string' ? data.monsterName.slice(0, 128) : bossTypeId,
            exp,
            rewardMeta: { monsterLevel, playerLevel, overlevelMultiplier, partyMultiplier },
            authoredAt,
            expiresAt: authoredAt + DURABLE_BOSS_REWARD_TTL_MS
        };
        if (envelope.rewardId !== this._buildExpectedBossItemRewardId(envelope)) return null;
        return this._buildDurableRewardKey(envelope.rewardId) ? envelope : null;
    }

    _validateDurableBossRewardEnvelope(data, snapshotKey, now = this.getServerNow(), expectedRecipientId = this.playerId) {
        if (data?.kind === 'boss_progress') {
            return this._validateDurableBossProgressEnvelope(data, snapshotKey, now, expectedRecipientId);
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return { ok: false, terminal: true, reason: 'invalid_envelope' };
        }
        if (data.schemaVersion !== DURABLE_BOSS_REWARD_SCHEMA_VERSION
            || data.kind !== 'boss_items'
            || !['pending', 'claimed'].includes(data.status)) {
            return { ok: false, terminal: true, reason: 'invalid_schema' };
        }

        const allowedFields = data.status === 'claimed'
            ? DURABLE_BOSS_REWARD_CLAIMED_FIELDS
            : DURABLE_BOSS_REWARD_PENDING_FIELDS;
        const requiredFields = data.status === 'claimed'
            ? DURABLE_BOSS_REWARD_CLAIMED_FIELDS
            : DURABLE_BOSS_REWARD_PENDING_REQUIRED_FIELDS;
        if (Object.keys(data).some((key) => !allowedFields.has(key))
            || Array.from(requiredFields).some((key) => !Object.prototype.hasOwnProperty.call(data, key))) {
            return { ok: false, terminal: true, reason: 'unknown_field' };
        }

        const requiredStrings = ['rewardId', 'recipientId', 'authorHostId', 'fieldId', 'bossTypeId', 'bossInstanceId'];
        if (requiredStrings.some((key) => typeof data[key] !== 'string' || !data[key])) {
            return { ok: false, terminal: true, reason: 'missing_identity' };
        }
        if (data.recipientId !== expectedRecipientId) {
            return { ok: false, terminal: true, reason: 'recipient_mismatch' };
        }
        if (data.rewardId !== this._buildExpectedBossItemRewardId(data)) {
            return { ok: false, terminal: true, reason: 'reward_id_mismatch' };
        }
        if (!snapshotKey || snapshotKey !== this._buildDurableRewardKey(data.rewardId)) {
            return { ok: false, terminal: true, reason: 'receipt_key_mismatch' };
        }
        if (!Number.isInteger(Number(data.catalogVersion)) || Number(data.catalogVersion) <= 0) {
            return { ok: false, terminal: true, reason: 'invalid_catalog_version' };
        }
        if (typeof data.catalogFingerprint !== 'string'
            || !/^fnv1a32_[0-9a-f]{8}$/.test(data.catalogFingerprint)) {
            return { ok: false, terminal: true, reason: 'invalid_catalog_fingerprint' };
        }

        const authoredAt = Number(data.authoredAt);
        const expiresAt = Number(data.expiresAt);
        const authoritativeNow = Number(now);
        if (!Number.isFinite(authoredAt) || !Number.isFinite(expiresAt)
            || authoredAt <= 0
            || expiresAt - authoredAt !== DURABLE_BOSS_REWARD_TTL_MS
            || authoredAt > authoritativeNow + DURABLE_BOSS_REWARD_CLOCK_SKEW_MS) {
            return { ok: false, terminal: true, reason: 'invalid_ttl' };
        }
        if (data.status === 'claimed') {
            const claimedAt = Number(data.claimedAt);
            if (data.claimedBy !== data.recipientId
                || !Number.isFinite(claimedAt)
                || claimedAt < authoredAt
                || claimedAt > authoritativeNow + DURABLE_BOSS_REWARD_CLOCK_SKEW_MS) {
                return { ok: false, terminal: true, reason: 'invalid_claim' };
            }
            return { ok: true, terminal: false, reason: 'already_claimed', claimed: true };
        }

        if (!Array.isArray(data.itemSeeds)
            || data.itemSeeds.length === 0
            || data.itemSeeds.length > DURABLE_BOSS_REWARD_MAX_ITEMS) {
            return { ok: false, terminal: true, reason: 'invalid_items' };
        }

        const normalizedSeeds = this._serializeDurableBossItemSeeds(data.itemSeeds.map((seed) => ({
            id: seed?.itemId,
            type: seed?.itemId,
            instanceId: seed?.instanceId,
            prefixId: seed?.prefixId,
            rolledValues: seed?.rolledValues
        })));
        if (!normalizedSeeds
            || this._stableStringifyDurableRewardValue(normalizedSeeds)
                !== this._stableStringifyDurableRewardValue(data.itemSeeds)) {
            return { ok: false, terminal: true, reason: 'invalid_item_seed' };
        }

        const hasItemSnapshots = Object.prototype.hasOwnProperty.call(data, 'itemSnapshots')
            || Object.prototype.hasOwnProperty.call(data, 'itemSnapshotFingerprint');
        if (hasItemSnapshots) {
            const snapshots = this._serializeDurableBossItemSnapshots(data.itemSnapshots, normalizedSeeds);
            if (!snapshots
                || this._stableStringifyDurableRewardValue(snapshots)
                    !== this._stableStringifyDurableRewardValue(data.itemSnapshots)) {
                return { ok: false, terminal: true, reason: 'invalid_item_snapshot' };
            }
            const expectedSnapshotFingerprint = this._hashDurableRewardCatalogValue({
                bossTypeId: data.bossTypeId,
                itemSnapshots: snapshots
            });
            if (data.itemSnapshotFingerprint !== expectedSnapshotFingerprint) {
                return { ok: false, terminal: true, reason: 'item_snapshot_fingerprint_mismatch' };
            }
            const archivedValidation = this._validateDurableBossRewardAgainstArchivedCatalog(
                data,
                normalizedSeeds,
                snapshots
            );
            if (!archivedValidation.ok) {
                return { ok: false, terminal: true, reason: archivedValidation.reason };
            }
            // The concrete entitlement is immutable and self-contained. Catalog
            // versions/fingerprints remain provenance metadata, but a later content
            // deploy must never strand or delete an already-earned boss weapon.
            return { ok: true, terminal: false, reason: 'accepted', claimed: false };
        }

        const itemData = window.game?.itemData;
        if (!itemData
            || typeof itemData.getBossDrops !== 'function'
            || typeof itemData.getItemDefinition !== 'function'
            || typeof itemData.getAffixPool !== 'function'
            || typeof itemData.getAffixDefinition !== 'function'
            || typeof itemData.createRewardItem !== 'function'
            || (Object.prototype.hasOwnProperty.call(itemData, 'loadedCatalog') && !itemData.loadedCatalog)) {
            return { ok: false, terminal: false, reason: 'catalog_unavailable' };
        }
        const currentCatalogVersion = this._getDurableRewardCatalogVersion();
        if (!currentCatalogVersion) {
            return { ok: false, terminal: false, reason: 'catalog_unavailable' };
        }
        if (currentCatalogVersion !== Number(data.catalogVersion)) {
            return { ok: false, terminal: false, reason: 'catalog_version_mismatch' };
        }
        const currentCatalogFingerprint = this._getDurableBossRewardCatalogFingerprint(
            data.bossTypeId,
            data.itemSeeds
        );
        if (!currentCatalogFingerprint) {
            return { ok: false, terminal: false, reason: 'catalog_unavailable' };
        }
        if (currentCatalogFingerprint !== data.catalogFingerprint) {
            return { ok: false, terminal: false, reason: 'catalog_fingerprint_mismatch' };
        }

        const guaranteedDrops = itemData.getBossDrops(data.bossTypeId)
            .filter((drop) => drop?.itemId && Number(drop.chance ?? 1) >= 1)
            .map((drop) => String(drop.itemId));
        if (guaranteedDrops.length === 0 || guaranteedDrops.length !== data.itemSeeds.length) {
            return { ok: false, terminal: true, reason: 'boss_drop_mismatch' };
        }
        const expectedItemCounts = new Map();
        guaranteedDrops.forEach((itemId) => expectedItemCounts.set(itemId, (expectedItemCounts.get(itemId) || 0) + 1));
        const seenInstanceIds = new Set();

        for (const seed of data.itemSeeds) {
            if (!seed || typeof seed !== 'object' || Array.isArray(seed)
                || Object.keys(seed).some((key) => !DURABLE_BOSS_REWARD_ITEM_SEED_FIELDS.has(key))) {
                return { ok: false, terminal: true, reason: 'invalid_item_seed' };
            }
            if (typeof seed.itemId !== 'string' || !seed.itemId
                || seed.amount !== 1
                || typeof seed.instanceId !== 'string' || !seed.instanceId || seed.instanceId.length > 128
                || seenInstanceIds.has(seed.instanceId)
                || typeof seed.prefixId !== 'string' || !seed.prefixId
                || !seed.rolledValues || typeof seed.rolledValues !== 'object' || Array.isArray(seed.rolledValues)) {
                return { ok: false, terminal: true, reason: 'invalid_item_seed' };
            }
            const remainingCount = expectedItemCounts.get(seed.itemId) || 0;
            if (remainingCount <= 0) {
                return { ok: false, terminal: true, reason: 'unconfigured_boss_item' };
            }
            expectedItemCounts.set(seed.itemId, remainingCount - 1);
            seenInstanceIds.add(seed.instanceId);

            const definition = itemData.getItemDefinition(seed.itemId);
            if (!definition
                || definition.stackable !== false
                || definition.slot !== 'weapon'
                || !Array.isArray(definition.dropSource)
                || !definition.dropSource.includes(data.bossTypeId)) {
                return { ok: false, terminal: true, reason: 'invalid_boss_weapon' };
            }
            const pool = itemData.getAffixPool(definition.prefixPool);
            const affix = itemData.getAffixDefinition(seed.prefixId);
            if (!pool || !Array.isArray(pool.affixes)
                || !pool.affixes.some((entry) => entry?.id === seed.prefixId)
                || !affix) {
                return { ok: false, terminal: true, reason: 'invalid_affix' };
            }

            const rollRules = affix.rolledEffects || {};
            const rollKeys = Object.keys(seed.rolledValues).sort();
            const ruleKeys = Object.keys(rollRules).sort();
            if (rollKeys.length !== ruleKeys.length || rollKeys.some((key, index) => key !== ruleKeys[index])) {
                return { ok: false, terminal: true, reason: 'invalid_roll_shape' };
            }
            for (const [key, rule] of Object.entries(rollRules)) {
                const value = Number(seed.rolledValues[key]);
                const min = Number.isFinite(rule?.min) ? Number(rule.min) : 0;
                const max = Number.isFinite(rule?.max) ? Number(rule.max) : min;
                if (!Number.isFinite(value) || value < min - 1e-9 || value > max + 1e-9) {
                    return { ok: false, terminal: true, reason: 'roll_out_of_range' };
                }
            }
        }

        if (Array.from(expectedItemCounts.values()).some((count) => count !== 0)) {
            return { ok: false, terminal: true, reason: 'missing_boss_item' };
        }
        return { ok: true, terminal: false, reason: 'accepted', claimed: false };
    }

    _validateDurableBossProgressEnvelope(data, snapshotKey, now = this.getServerNow(), expectedRecipientId = this.playerId) {
        if (!data || typeof data !== 'object' || Array.isArray(data)
            || data.schemaVersion !== DURABLE_BOSS_REWARD_SCHEMA_VERSION
            || data.kind !== 'boss_progress'
            || !['pending', 'claimed'].includes(data.status)) {
            return { ok: false, terminal: true, reason: 'invalid_schema' };
        }
        const allowedFields = data.status === 'claimed'
            ? DURABLE_BOSS_PROGRESS_CLAIMED_FIELDS
            : DURABLE_BOSS_PROGRESS_PENDING_FIELDS;
        if (Object.keys(data).some((key) => !allowedFields.has(key))
            || Array.from(allowedFields).some((key) => !Object.prototype.hasOwnProperty.call(data, key))) {
            return { ok: false, terminal: true, reason: 'unknown_field' };
        }
        const requiredStrings = ['rewardId', 'recipientId', 'authorHostId', 'fieldId', 'bossTypeId', 'bossInstanceId', 'monsterName'];
        if (requiredStrings.some((key) => typeof data[key] !== 'string' || !data[key])
            || data.recipientId !== expectedRecipientId
            || data.rewardId !== this._buildExpectedBossItemRewardId(data)
            || snapshotKey !== this._buildDurableRewardKey(data.rewardId)) {
            return { ok: false, terminal: true, reason: 'invalid_identity' };
        }
        const authoredAt = Number(data.authoredAt);
        const expiresAt = Number(data.expiresAt);
        const authoritativeNow = Number(now);
        if (!Number.isFinite(authoredAt) || authoredAt <= 0
            || !Number.isFinite(expiresAt)
            || expiresAt - authoredAt !== DURABLE_BOSS_REWARD_TTL_MS
            || authoredAt > authoritativeNow + DURABLE_BOSS_REWARD_CLOCK_SKEW_MS) {
            return { ok: false, terminal: true, reason: 'invalid_ttl' };
        }
        const exp = Number(data.exp);
        const meta = data.rewardMeta;
        if (!Number.isInteger(exp) || exp <= 0 || exp > 10_000_000
            || !meta || typeof meta !== 'object' || Array.isArray(meta)
            || Object.keys(meta).some((key) => !DURABLE_BOSS_PROGRESS_META_FIELDS.has(key))
            || Array.from(DURABLE_BOSS_PROGRESS_META_FIELDS).some((key) => !Object.prototype.hasOwnProperty.call(meta, key))) {
            return { ok: false, terminal: true, reason: 'invalid_progress' };
        }
        const monsterLevel = Number(meta.monsterLevel);
        const playerLevel = Number(meta.playerLevel);
        const partyMultiplier = Number(meta.partyMultiplier);
        const overlevelMultiplier = Number(meta.overlevelMultiplier);
        const progressPolicy = DURABLE_BOSS_REWARD_ARCHIVED_CATALOGS[1]
            ?.bossProgress?.[data.bossTypeId];
        const expectedExp = progressPolicy
            ? Math.max(1, Math.floor(
                Number(progressPolicy.baseExp) * partyMultiplier * overlevelMultiplier
            ))
            : 0;
        if (!Number.isInteger(monsterLevel) || monsterLevel < 1 || monsterLevel > 999
            || !Number.isInteger(playerLevel) || playerLevel < 1 || playerLevel > 999
            || ![0.6, 1].includes(partyMultiplier)
            || !progressPolicy
            || monsterLevel !== Number(progressPolicy.level)
            || overlevelMultiplier !== this._getDurableBossExpMultiplier(playerLevel, monsterLevel)
            || exp !== expectedExp) {
            return { ok: false, terminal: true, reason: 'invalid_progress_meta' };
        }
        if (data.status === 'claimed') {
            const claimedAt = Number(data.claimedAt);
            if (data.claimedBy !== data.recipientId
                || !Number.isFinite(claimedAt)
                || claimedAt < authoredAt
                || claimedAt > authoritativeNow + DURABLE_BOSS_REWARD_CLOCK_SKEW_MS) {
                return { ok: false, terminal: true, reason: 'invalid_claim' };
            }
            return { ok: true, terminal: false, reason: 'already_claimed', claimed: true };
        }
        return { ok: true, terminal: false, reason: 'accepted', claimed: false };
    }

    _materializeDurableBossReward(data) {
        if (data?.kind === 'boss_progress') {
            return {
                rewardId: data.rewardId,
                rewardKind: 'boss_exp',
                kind: 'boss_progress',
                bossReward: true,
                immediate: true,
                monsterName: data.monsterName || data.bossTypeId,
                bossTypeId: data.bossTypeId,
                bossInstanceId: data.bossInstanceId,
                exp: data.exp,
                rewardMeta: { ...data.rewardMeta }
            };
        }
        let items = null;
        if (Array.isArray(data?.itemSnapshots) && data.itemSnapshots.length > 0) {
            items = data.itemSeeds.map((seed) => this._materializeDurableBossItemFromArchive(data, seed));
        } else {
            // Backward compatibility for receipts authored before concrete
            // snapshots were introduced. New receipts never depend on this path.
            const itemData = window.game?.itemData;
            if (!itemData || !Array.isArray(data?.itemSeeds)) return null;
            items = data.itemSeeds.map((seed) => itemData.createRewardItem(seed.itemId, {
                amount: 1,
                instanceId: seed.instanceId,
                prefixId: seed.prefixId,
                rolledValues: { ...seed.rolledValues },
                enhancementLevel: 0,
                isNewlyAcquired: true
            }));
        }
        if (items.some((item) => !item)) return null;
        return {
            rewardId: data.rewardId,
            rewardKind: 'boss_items',
            bossReward: true,
            immediate: true,
            monsterName: data.monsterName || data.bossTypeId,
            bossTypeId: data.bossTypeId,
            bossInstanceId: data.bossInstanceId,
            items
        };
    }

    _getDurableRewardRetryDelay(attempt = 0) {
        const index = Math.max(0, Math.min(
            DURABLE_BOSS_REWARD_RETRY_DELAYS_MS.length - 1,
            Math.floor(Number(attempt || 0))
        ));
        return DURABLE_BOSS_REWARD_RETRY_DELAYS_MS[index];
    }

    _clearDurableRewardRuntime(options = {}) {
        if (this._durableRewardDrainTimer) {
            clearTimeout(this._durableRewardDrainTimer);
            this._durableRewardDrainTimer = null;
        }
        const authorHostId = this.playerId;
        const pendingEntries = Array.from(this._pendingDurableRewardWrites.values());
        pendingEntries.forEach((entry) => {
            if (entry?.timer) clearTimeout(entry.timer);
            if (entry) entry.timer = null;
        });
        if (authorHostId && pendingEntries.length > 0) {
            this._persistDurableRewardOutbox(authorHostId, pendingEntries);
            const bucketKey = this._getDurableRewardOutboxBucketKey(authorHostId);
            const existingEntries = this._dormantDurableRewardWritesByAuthor.get(bucketKey) || [];
            const mergedEntries = new Map();
            [...existingEntries, ...pendingEntries].forEach((entry) => {
                if (entry?.queueKey && entry?.envelope?.authorHostId === authorHostId) {
                    mergedEntries.set(entry.queueKey, entry);
                }
            });
            this._dormantDurableRewardWritesByAuthor.set(bucketKey, Array.from(mergedEntries.values()));
        }
        this._pendingDurableRewardWrites.clear();
        this._durableRewardInFlight.clear();
        Array.from(this._incomingRewardSnapshotQueue.entries()).forEach(([queueKey, item]) => {
            if (item?.channel === 'durable') this._incomingRewardSnapshotQueue.delete(queueKey);
        });
        this._durableRewardDrainAttempt = 0;
        if (options.clearConsumer !== false) {
            this._durableRewardConsumer = null;
            this._durableRewardConsumerGeneration += 1;
        }
    }

    setNormalRewardConsumer(consumer = null) {
        this._normalRewardConsumer = typeof consumer === 'function' ? consumer : null;
        this._normalRewardConsumerGeneration += 1;
        if (!this._normalRewardConsumer) {
            if (this._normalRewardDrainTimer) {
                clearTimeout(this._normalRewardDrainTimer);
                this._normalRewardDrainTimer = null;
            }
            return Promise.resolve(false);
        }
        this._normalRewardDrainAttempt = 0;
        return this._drainIncomingRewardBacklogs();
    }

    _scheduleNormalRewardDrain() {
        if (!this._normalRewardConsumer || this._normalRewardDrainTimer) return;
        const delay = this._getDurableRewardRetryDelay(this._normalRewardDrainAttempt);
        this._normalRewardDrainAttempt += 1;
        this._normalRewardDrainTimer = setTimeout(() => {
            this._normalRewardDrainTimer = null;
            this._drainNormalRewards().catch((error) => {
                Logger.warn('[Network] Normal reward backlog retry failed', error);
                this._scheduleNormalRewardDrain();
            });
        }, delay);
    }

    _queueIncomingNormalRewardSnapshot(snapshot, context = null) {
        return this._queueIncomingRewardSnapshot(snapshot, context, 'normal');
    }

    _queueIncomingRewardSnapshot(snapshot, context = null, channel = 'normal', options = {}) {
        const key = snapshot?.key;
        if (!key) return Promise.resolve(false);
        const generation = context?.generation ?? this._networkLifecycleGeneration;
        const playerId = context?.playerId ?? this.playerId;
        const queueKey = `${generation}:${playerId}:${channel}:${key}`;
        const existing = this._incomingRewardSnapshotQueue.get(queueKey);
        this._incomingRewardSnapshotQueue.set(queueKey, {
            queueKey,
            channel,
            snapshot,
            context: context || existing?.context || null
        });
        this._sortIncomingRewardSnapshotQueue();
        if (options.deferPump === true) return Promise.resolve(true);
        return this._pumpIncomingRewardSnapshotQueue();
    }

    _sortIncomingRewardSnapshotQueue() {
        if (this._incomingRewardSnapshotQueue.size < 2) return;
        const claimedRewardIds = new Set(
            Array.isArray(window.game?.localPlayer?.claimedRewardIds)
                ? window.game.localPlayer.claimedRewardIds
                : []
        );
        const getPriority = (item) => {
            const data = item?.snapshot?.val?.();
            if (data?.status === 'pending' && claimedRewardIds.has(data.rewardId)) return 0;
            if (data?.status === 'claimed') return 1;
            return 2;
        };
        const sorted = Array.from(this._incomingRewardSnapshotQueue.entries()).sort((a, b) => {
            const priorityDelta = getPriority(a[1]) - getPriority(b[1]);
            if (priorityDelta !== 0) return priorityDelta;
            const aData = a[1]?.snapshot?.val?.();
            const bData = b[1]?.snapshot?.val?.();
            const authoredDelta = Number(aData?.authoredAt || aData?.ts || 0)
                - Number(bData?.authoredAt || bData?.ts || 0);
            if (authoredDelta !== 0) return authoredDelta;
            return String(a[0]).localeCompare(String(b[0]));
        });
        this._incomingRewardSnapshotQueue.clear();
        sorted.forEach(([queueKey, item]) => this._incomingRewardSnapshotQueue.set(queueKey, item));
    }

    async _drainIncomingRewardBacklogs() {
        if ((!this._normalRewardConsumer && !this._durableRewardConsumer)
            || !this.dbRef
            || !this.playerId) return false;
        const generation = this._networkLifecycleGeneration;
        const playerId = this.playerId;
        const dbRef = this.dbRef;
        const lifecycle = { generation, playerId, dbRef };
        try {
            const serverTimeReady = await this._ensureDurableRewardServerTime();
            if (!serverTimeReady || !this._isDurableRewardLifecycleCurrent(lifecycle)) return false;
            const [normalSnapshot, durableSnapshot] = await Promise.all([
                dbRef.child(`rewards/${playerId}`).once('value'),
                this._getDurableRewardInboxRef(playerId)?.once?.('value')
                    || Promise.resolve(null)
            ]);
            if (!this._isDurableRewardLifecycleCurrent(lifecycle)) return false;
            const normalContext = {
                ...lifecycle,
                legacyRewardPath: true,
                consumer: this._normalRewardConsumer,
                consumerGeneration: this._normalRewardConsumerGeneration
            };
            const durableContext = {
                ...lifecycle,
                consumer: this._durableRewardConsumer,
                consumerGeneration: this._durableRewardConsumerGeneration
            };
            normalSnapshot?.forEach?.((childSnapshot) => {
                if (!this._isDurableBossRewardPayload(childSnapshot.val())) {
                    this._queueIncomingRewardSnapshot(childSnapshot, normalContext, 'normal', { deferPump: true });
                }
            });
            durableSnapshot?.forEach?.((childSnapshot) => {
                if (this._isDurableBossRewardPayload(childSnapshot.val())) {
                    this._queueIncomingRewardSnapshot(childSnapshot, durableContext, 'durable', { deferPump: true });
                }
            });
            return this._pumpIncomingRewardSnapshotQueue();
        } catch (error) {
            Logger.warn('[Network] Failed to read the global reward backlog', error);
            if (this._normalRewardConsumer) this._scheduleNormalRewardDrain();
            if (this._durableRewardConsumer) this._scheduleDurableRewardDrain();
            return false;
        }
    }

    _pumpNormalRewardSnapshotQueue() {
        return this._pumpIncomingRewardSnapshotQueue();
    }

    _pumpIncomingRewardSnapshotQueue() {
        if (this._incomingRewardSnapshotPump) return this._incomingRewardSnapshotPump;
        const pumpPromise = (async () => {
            while (this._incomingRewardSnapshotQueue.size > 0) {
                const [queueKey, item] = this._incomingRewardSnapshotQueue.entries().next().value;
                const channel = item?.channel === 'durable' ? 'durable' : 'normal';
                const context = item?.context || (channel === 'normal'
                    ? {
                        generation: this._networkLifecycleGeneration,
                        playerId: this.playerId,
                        dbRef: this.dbRef,
                        legacyRewardPath: true,
                        consumer: this._normalRewardConsumer,
                        consumerGeneration: this._normalRewardConsumerGeneration
                    }
                    : {
                        generation: this._networkLifecycleGeneration,
                        playerId: this.playerId,
                        dbRef: this.dbRef,
                        consumer: this._durableRewardConsumer,
                        consumerGeneration: this._durableRewardConsumerGeneration
                    });
                if (!item?.snapshot || !this._isDurableRewardLifecycleCurrent(context)) {
                    this._incomingRewardSnapshotQueue.delete(queueKey);
                    continue;
                }

                let consumed = false;
                try {
                    consumed = await this._handleIncomingRewardSnapshot(item.snapshot, context);
                } catch (error) {
                    Logger.warn(`[Network] Global reward queue paused at ${channel}:${item.snapshot?.key}`, error);
                }
                if (consumed) {
                    this._incomingRewardSnapshotQueue.delete(queueKey);
                    continue;
                }
                if (!this._isDurableRewardLifecycleCurrent(context)) {
                    this._incomingRewardSnapshotQueue.delete(queueKey);
                    continue;
                }

                // Invalid/terminal receipts remove themselves. Only a receipt
                // that still exists may block the one global FIFO. Normal and
                // boss channels share Player.claimedRewardIds, so neither may
                // overtake a failed profile save or source acknowledgement in
                // the other channel and evict its bounded semantic id.
                try {
                    const current = await item.snapshot.ref?.once?.('value');
                    if (!current?.val?.()) {
                        this._incomingRewardSnapshotQueue.delete(queueKey);
                        continue;
                    }
                } catch (error) {
                    Logger.warn(`[Network] Could not verify blocked ${channel} reward ${item.snapshot?.key}`, error);
                }
                if (channel === 'durable') this._scheduleDurableRewardDrain();
                else this._scheduleNormalRewardDrain();
                return false;
            }
            return true;
        })();
        this._incomingRewardSnapshotPump = pumpPromise;
        const clearPump = () => {
            if (this._incomingRewardSnapshotPump === pumpPromise) {
                this._incomingRewardSnapshotPump = null;
            }
        };
        void pumpPromise.then(clearPump, clearPump);
        return pumpPromise;
    }

    async _drainNormalRewards(context = null) {
        if (!this._normalRewardConsumer || !this.dbRef || !this.playerId) return false;
        const activeContext = context || {
            generation: this._networkLifecycleGeneration,
            playerId: this.playerId,
            dbRef: this.dbRef,
            legacyRewardPath: true,
            consumer: this._normalRewardConsumer,
            consumerGeneration: this._normalRewardConsumerGeneration
        };
        const inboxRef = activeContext.dbRef?.child(`rewards/${activeContext.playerId}`);
        if (!inboxRef || !this._isDurableRewardLifecycleCurrent(activeContext)) return false;
        try {
            const serverTimeReady = await this._ensureDurableRewardServerTime();
            if (!serverTimeReady
                || !this._isDurableRewardLifecycleCurrent(activeContext)
                || activeContext.consumer !== this._normalRewardConsumer
                || activeContext.consumerGeneration !== this._normalRewardConsumerGeneration) return false;
            const snapshot = await inboxRef.once('value');
            if (!this._isDurableRewardLifecycleCurrent(activeContext)
                || activeContext.consumer !== this._normalRewardConsumer
                || activeContext.consumerGeneration !== this._normalRewardConsumerGeneration) return false;
            const tasks = [];
            snapshot.forEach((childSnapshot) => {
                if (!this._isDurableBossRewardPayload(childSnapshot.val())) {
                    tasks.push(this._queueIncomingNormalRewardSnapshot(childSnapshot, activeContext));
                }
            });
            await Promise.all(tasks);
            if (tasks.length === 0) this._normalRewardDrainAttempt = 0;
            return true;
        } catch (error) {
            Logger.warn('[Network] Failed to read normal reward backlog', error);
            this._scheduleNormalRewardDrain();
            return false;
        }
    }

    async _ackNormalReward(rewardRef, data, context) {
        const receiptKey = context?.receiptKey || rewardRef?.key;
        const dbRef = context?.dbRef || this.dbRef;
        const claimPath = this._getNormalRewardClaimPath(data?.recipientId, receiptKey, data?.authoredAt);
        const claimIndexPath = this._getNormalRewardClaimIndexPath(data?.recipientId, receiptKey);
        const claimBucket = this._getNormalRewardClaimBucket(data?.authoredAt);
        const pendingPath = data?.recipientId && receiptKey
            ? `rewards/${data.recipientId}/${receiptKey}`
            : null;
        if (!rewardRef || !receiptKey || !dbRef || typeof dbRef.update !== 'function'
            || !claimPath || !claimIndexPath || !claimBucket || !pendingPath) {
            return false;
        }
        const claimedAt = Math.max(Number(data.authoredAt || 0), Math.round(this.getServerNow()));
        const marker = this._buildNormalRewardClaimMarker(data, claimedAt);
        if (!marker) return false;
        try {
            const existingClaim = await this._readNormalRewardClaim(data, receiptKey, dbRef);
            if (existingClaim.value || existingClaim.invalidIndex) {
                if (existingClaim.matches || existingClaim.semanticMatches) {
                    await this._removeNormalRewardPendingIfMatch(rewardRef, data);
                    return true;
                }
                return false;
            }
            const currentSnapshot = await rewardRef.once('value');
            const current = currentSnapshot?.val?.();
            if (!current || !this._doesNormalRewardReceiptMatchEnvelope(current, data)) return false;
            if (!this._isDurableRewardLifecycleCurrent(context)) return false;
            await dbRef.update({
                [pendingPath]: null,
                [claimPath]: marker,
                [claimIndexPath]: claimBucket
            });
            if (!this._isDurableRewardLifecycleCurrent(context)) return false;
            const claimed = await this._readNormalRewardClaim(data, receiptKey, dbRef);
            return claimed.matches;
        } catch (error) {
            Logger.warn(`[Network] Failed to acknowledge normal reward ${data.receiptId}`, error);
            return false;
        }
    }

    async _consumeNormalRewardV2Snapshot(snapshot, context = null) {
        const key = snapshot?.key;
        const activeContext = {
            generation: context?.generation ?? this._networkLifecycleGeneration,
            playerId: context?.playerId ?? this.playerId,
            dbRef: context?.dbRef ?? this.dbRef,
            legacyRewardPath: true,
            consumer: context?.consumer || this._normalRewardConsumer,
            consumerGeneration: Number.isFinite(context?.consumerGeneration)
                ? context.consumerGeneration
                : this._normalRewardConsumerGeneration
        };
        if (!key
            || !this._normalRewardConsumer
            || !this._isDurableRewardLifecycleCurrent(activeContext)
            || activeContext.consumer !== this._normalRewardConsumer
            || activeContext.consumerGeneration !== this._normalRewardConsumerGeneration) return false;
        if (this._normalRewardInFlight.has(key)) {
            this._scheduleNormalRewardDrain();
            return false;
        }
        const inFlightToken = {};
        this._normalRewardInFlight.set(key, inFlightToken);
        try {
            const serverTimeReady = await this._ensureDurableRewardServerTime();
            if (!serverTimeReady
                || !this._isDurableRewardLifecycleCurrent(activeContext)
                || activeContext.consumer !== this._normalRewardConsumer
                || activeContext.consumerGeneration !== this._normalRewardConsumerGeneration) return false;
            const data = snapshot.val();
            const validation = this._validateNormalRewardEnvelope(data, key, this.getServerNow(), activeContext.playerId);
            if (!validation.ok) {
                if (validation.terminal && this._isDurableRewardLifecycleCurrent(activeContext)) {
                    await snapshot.ref.remove();
                } else {
                    this._scheduleNormalRewardDrain();
                }
                return false;
            }
            if (validation.claimed) {
                const acknowledged = await this._ackNormalReward(snapshot.ref, data, {
                    ...activeContext,
                    receiptKey: key
                });
                if (!acknowledged) this._scheduleNormalRewardDrain();
                return acknowledged;
            }
            const existingClaim = await this._readNormalRewardClaim(data, key, activeContext.dbRef);
            if (!this._isDurableRewardLifecycleCurrent(activeContext)
                || activeContext.consumer !== this._normalRewardConsumer
                || activeContext.consumerGeneration !== this._normalRewardConsumerGeneration) return false;
            if (existingClaim.value) {
                if (!existingClaim.matches && !existingClaim.semanticMatches) {
                    Logger.warn(`[Network] Removing normal reward with a conflicting claim marker ${data.receiptId}`);
                    await snapshot.ref.remove();
                    return false;
                }
                await this._removeNormalRewardPendingIfMatch(snapshot.ref, data);
                this._normalRewardDrainAttempt = 0;
                return true;
            }
            if (existingClaim.invalidIndex) {
                Logger.warn(`[Network] Removing normal reward with an invalid claim index ${data.receiptId}`);
                await snapshot.ref.remove();
                return false;
            }
            const reward = this._materializeNormalReward(data, validation);
            if (!reward) return false;
            const consumerResult = await activeContext.consumer(reward);
            if (!(consumerResult === true || consumerResult?.ok === true)) {
                this._scheduleNormalRewardDrain();
                return false;
            }
            if (!this._isDurableRewardLifecycleCurrent(activeContext)
                || activeContext.consumer !== this._normalRewardConsumer
                || activeContext.consumerGeneration !== this._normalRewardConsumerGeneration) return false;
            const acknowledged = await this._ackNormalReward(snapshot.ref, data, {
                ...activeContext,
                receiptKey: key
            });
            if (!acknowledged) this._scheduleNormalRewardDrain();
            else this._normalRewardDrainAttempt = 0;
            return acknowledged;
        } catch (error) {
            Logger.warn(`[Network] Normal reward ${key} will be retried`, error);
            this._scheduleNormalRewardDrain();
            return false;
        } finally {
            if (this._normalRewardInFlight.get(key) === inFlightToken) {
                this._normalRewardInFlight.delete(key);
                if (this._normalRewardConsumer
                    && (activeContext.consumer !== this._normalRewardConsumer
                        || activeContext.consumerGeneration !== this._normalRewardConsumerGeneration
                        || !this._isDurableRewardLifecycleCurrent(activeContext))) {
                    this._scheduleNormalRewardDrain();
                }
            }
        }
    }

    _validateLegacyNormalRewardBacklog(data, fallbackRewardId, now = this.getServerNow()) {
        if (!data || typeof data !== 'object' || Array.isArray(data)
            || typeof data.hostId !== 'string' || !data.hostId || data.hostId.length > 128
            || (data.fieldId != null && (typeof data.fieldId !== 'string' || data.fieldId.length > 192))) {
            return { ok: false, reason: 'invalid_legacy_identity' };
        }
        const authoredAt = Number(data.ts);
        const authoritativeNow = Number(now);
        if (!Number.isFinite(authoredAt) || authoredAt <= 0
            || authoredAt > authoritativeNow + NORMAL_REWARD_CLOCK_SKEW_MS
            || authoritativeNow - authoredAt > NORMAL_REWARD_TTL_MS) {
            return { ok: false, reason: 'invalid_legacy_ttl' };
        }
        const payload = this._normalizeNormalRewardCanonicalPayload(data, fallbackRewardId);
        if (!payload) return { ok: false, reason: 'invalid_legacy_payload' };

        const itemEntries = Array.isArray(payload.items) ? payload.items.length : 0;
        const itemAmount = Array.isArray(payload.items)
            ? payload.items.reduce((sum, item) => sum + Number(item.amount || 1), 0)
            : 0;
        const nextTotals = {
            exp: this._rewardValidationWindow.totalExp + Number(payload.exp || 0),
            manastone: this._rewardValidationWindow.totalManastone + Number(payload.manastone ?? payload.gold ?? 0),
            hp: this._rewardValidationWindow.totalHp + Number(payload.hp || 0),
            itemEntries: this._rewardValidationWindow.totalItemEntries + itemEntries,
            itemAmount: this._rewardValidationWindow.totalItemAmount + itemAmount
        };
        if (nextTotals.exp > 250000
            || nextTotals.manastone > 250000
            || nextTotals.hp > 60000
            || nextTotals.itemEntries > 320
            || nextTotals.itemAmount > 3200) {
            return { ok: false, reason: 'legacy_window_limit' };
        }
        this._rewardValidationWindow.totalExp = nextTotals.exp;
        this._rewardValidationWindow.totalManastone = nextTotals.manastone;
        this._rewardValidationWindow.totalHp = nextTotals.hp;
        this._rewardValidationWindow.totalItemEntries = nextTotals.itemEntries;
        this._rewardValidationWindow.totalItemAmount = nextTotals.itemAmount;
        return { ok: true, payload };
    }

    async _consumeLegacyNormalRewardSnapshot(snapshot, context = null) {
        const key = snapshot?.key;
        const activeContext = {
            generation: context?.generation ?? this._networkLifecycleGeneration,
            playerId: context?.playerId ?? this.playerId,
            dbRef: context?.dbRef ?? this.dbRef,
            legacyRewardPath: true,
            consumer: context?.consumer || this._normalRewardConsumer,
            consumerGeneration: Number.isFinite(context?.consumerGeneration)
                ? context.consumerGeneration
                : this._normalRewardConsumerGeneration
        };
        if (!key
            || !this._normalRewardConsumer
            || !this._isDurableRewardLifecycleCurrent(activeContext)
            || activeContext.consumer !== this._normalRewardConsumer
            || activeContext.consumerGeneration !== this._normalRewardConsumerGeneration) return false;
        if (this._normalRewardInFlight.has(key)) {
            this._scheduleNormalRewardDrain();
            return false;
        }
        const inFlightToken = {};
        this._normalRewardInFlight.set(key, inFlightToken);
        try {
            const data = snapshot.val();
            const fingerprint = this._hashDurableRewardCatalogValue(data);
            const fallbackRewardId = this._buildNormalRewardReceiptId(activeContext.playerId, key);
            let cached = this._normalRewardLegacyValidationCache.get(key);
            if (!cached || cached.fingerprint !== fingerprint) {
                const validation = this._validateIncomingRewardPayload(data, Date.now());
                if (!validation.ok) {
                    const backlogValidation = this._validateLegacyNormalRewardBacklog(
                        data,
                        fallbackRewardId,
                        this.getServerNow()
                    );
                    if (!backlogValidation.ok) {
                        if (this._isDurableRewardLifecycleCurrent(activeContext)) await snapshot.ref.remove();
                        return false;
                    }
                    cached = { fingerprint, payload: backlogValidation.payload };
                } else {
                    const payload = this._normalizeNormalRewardCanonicalPayload(data, fallbackRewardId);
                    if (!payload) {
                        if (this._isDurableRewardLifecycleCurrent(activeContext)) await snapshot.ref.remove();
                        return false;
                    }
                    cached = { fingerprint, payload };
                }
                this._normalRewardLegacyValidationCache.set(key, cached);
            }
            const rewardId = cached?.payload?.rewardId || fallbackRewardId;
            if (!rewardId) return false;
            const consumerResult = await activeContext.consumer({
                ...cached.payload,
                rewardId,
                normalRewardReceipt: true
            });
            if (!(consumerResult === true || consumerResult?.ok === true)) {
                this._scheduleNormalRewardDrain();
                return false;
            }
            if (!this._isDurableRewardLifecycleCurrent(activeContext)
                || activeContext.consumer !== this._normalRewardConsumer
                || activeContext.consumerGeneration !== this._normalRewardConsumerGeneration) return false;
            await snapshot.ref.remove();
            this._normalRewardLegacyValidationCache.delete(key);
            this._normalRewardDrainAttempt = 0;
            return true;
        } catch (error) {
            Logger.warn(`[Network] Legacy reward ${key} will be retried`, error);
            this._scheduleNormalRewardDrain();
            return false;
        } finally {
            if (this._normalRewardInFlight.get(key) === inFlightToken) {
                this._normalRewardInFlight.delete(key);
                if (this._normalRewardConsumer
                    && (activeContext.consumer !== this._normalRewardConsumer
                        || activeContext.consumerGeneration !== this._normalRewardConsumerGeneration
                        || !this._isDurableRewardLifecycleCurrent(activeContext))) {
                    this._scheduleNormalRewardDrain();
                }
            }
        }
    }

    setDurableRewardConsumer(consumer = null) {
        this._durableRewardConsumer = typeof consumer === 'function' ? consumer : null;
        this._durableRewardConsumerGeneration += 1;
        if (!this._durableRewardConsumer) {
            if (this._durableRewardDrainTimer) {
                clearTimeout(this._durableRewardDrainTimer);
                this._durableRewardDrainTimer = null;
            }
            return Promise.resolve(false);
        }
        this._durableRewardDrainAttempt = 0;
        return this._drainIncomingRewardBacklogs();
    }

    _scheduleDurableRewardDrain() {
        if (!this._durableRewardConsumer || this._durableRewardDrainTimer) return;
        const delay = this._getDurableRewardRetryDelay(this._durableRewardDrainAttempt);
        this._durableRewardDrainAttempt += 1;
        this._durableRewardDrainTimer = setTimeout(() => {
            this._durableRewardDrainTimer = null;
            this._drainDurableBossRewards().catch((error) => {
                Logger.warn('[Network] Durable reward backlog retry failed', error);
                this._scheduleDurableRewardDrain();
            });
        }, delay);
    }

    _queueIncomingDurableRewardSnapshot(snapshot, context = null) {
        return this._queueIncomingRewardSnapshot(snapshot, context, 'durable');
    }

    _pumpDurableRewardSnapshotQueue() {
        return this._pumpIncomingRewardSnapshotQueue();
    }

    async _drainDurableBossRewards(context = null) {
        if (!this._durableRewardConsumer || !this.dbRef || !this.playerId) return false;
        const activeContext = context || {
            generation: this._networkLifecycleGeneration,
            playerId: this.playerId,
            dbRef: this.dbRef,
            consumer: this._durableRewardConsumer,
            consumerGeneration: this._durableRewardConsumerGeneration
        };
        const inboxRef = this._getDurableRewardInboxRef(activeContext.playerId);
        if (!inboxRef || !this._isDurableRewardLifecycleCurrent(activeContext)) return false;
        try {
            const serverTimeReady = await this._ensureDurableRewardServerTime();
            if (!serverTimeReady
                || !this._isDurableRewardLifecycleCurrent(activeContext)
                || activeContext.consumer !== this._durableRewardConsumer
                || activeContext.consumerGeneration !== this._durableRewardConsumerGeneration) return false;
            const snapshot = await inboxRef.once('value');
            if (!this._isDurableRewardLifecycleCurrent(activeContext)
                || activeContext.consumer !== this._durableRewardConsumer
                || activeContext.consumerGeneration !== this._durableRewardConsumerGeneration) return false;
            const tasks = [];
            snapshot.forEach((childSnapshot) => {
                if (this._isDurableBossRewardPayload(childSnapshot.val())) {
                    tasks.push(this._queueIncomingDurableRewardSnapshot(childSnapshot, activeContext));
                }
            });
            await Promise.all(tasks);
            if (tasks.length === 0) this._durableRewardDrainAttempt = 0;
            return true;
        } catch (error) {
            Logger.warn('[Network] Failed to read durable reward backlog', error);
            this._scheduleDurableRewardDrain();
            return false;
        }
    }

    async _handleIncomingRewardSnapshot(snapshot, context = null) {
        if (context && !this._isDurableRewardLifecycleCurrent(context)) return false;
        const data = snapshot?.val?.();
        if (!data) {
            if (!context || this._isDurableRewardLifecycleCurrent(context)) {
                await Promise.resolve(snapshot?.ref?.remove?.());
            }
            return false;
        }
        if (this._isNormalRewardV2Payload(data)) {
            if (context && !context.legacyRewardPath) return false;
            return this._consumeNormalRewardV2Snapshot(snapshot, context);
        }
        if (this._isDurableBossRewardPayload(data)) {
            if (context?.legacyRewardPath || !this._isDurableRewardLifecycleCurrent(context)) return false;
            if (!this._durableRewardConsumer) return false;
            return this._consumeDurableBossRewardSnapshot(snapshot, context);
        }
        if (context && !context.legacyRewardPath) return false;
        return this._consumeLegacyNormalRewardSnapshot(snapshot, context);
    }

    async _consumeDurableBossRewardSnapshot(snapshot, context = null) {
        const key = snapshot?.key;
        const activeContext = context || {
            generation: this._networkLifecycleGeneration,
            playerId: this.playerId,
            dbRef: this.dbRef,
            consumer: this._durableRewardConsumer,
            consumerGeneration: this._durableRewardConsumerGeneration
        };
        if (!key
            || !this._isDurableRewardLifecycleCurrent(activeContext)) return false;
        if (!this._durableRewardConsumer) return false;
        if (this._durableRewardInFlight.has(key)) {
            this._scheduleDurableRewardDrain();
            return false;
        }
        const inFlightToken = {};
        this._durableRewardInFlight.set(key, inFlightToken);
        const consumer = activeContext.consumer || this._durableRewardConsumer;
        const consumerGeneration = Number.isFinite(activeContext.consumerGeneration)
            ? activeContext.consumerGeneration
            : this._durableRewardConsumerGeneration;

        try {
            const serverTimeReady = await this._ensureDurableRewardServerTime();
            if (!serverTimeReady
                || !this._isDurableRewardLifecycleCurrent(activeContext)
                || consumer !== this._durableRewardConsumer
                || consumerGeneration !== this._durableRewardConsumerGeneration) return false;
            const data = snapshot.val();
            const validation = this._validateDurableBossRewardEnvelope(data, key, this.getServerNow());
            if (!validation.ok) {
                if (validation.terminal) {
                    Logger.warn(`[Network] Removing invalid durable boss reward ${key}: ${validation.reason}`);
                    if (this._isDurableRewardLifecycleCurrent(activeContext)) {
                        await Promise.resolve(snapshot.ref.remove());
                    }
                } else {
                    this._scheduleDurableRewardDrain();
                }
                return false;
            }
            if (validation.claimed) return true;
            if (consumer !== this._durableRewardConsumer
                || consumerGeneration !== this._durableRewardConsumerGeneration) return false;

            const reward = this._materializeDurableBossReward(data);
            if (!reward) {
                this._scheduleDurableRewardDrain();
                return false;
            }
            const consumerResult = await consumer(reward);
            const persisted = consumerResult === true || consumerResult?.ok === true;
            if (!persisted) {
                this._scheduleDurableRewardDrain();
                return false;
            }
            if (!this._isDurableRewardLifecycleCurrent(activeContext)
                || consumer !== this._durableRewardConsumer
                || consumerGeneration !== this._durableRewardConsumerGeneration) return false;

            const acknowledged = await this._ackDurableBossReward(snapshot.ref, data);
            if (!acknowledged) this._scheduleDurableRewardDrain();
            else this._durableRewardDrainAttempt = 0;
            return acknowledged;
        } catch (error) {
            Logger.warn(`[Network] Durable boss reward ${key} will be retried`, error);
            this._scheduleDurableRewardDrain();
            return false;
        } finally {
            if (this._durableRewardInFlight.get(key) === inFlightToken) {
                this._durableRewardInFlight.delete(key);
                if (this._durableRewardConsumer
                    && (consumer !== this._durableRewardConsumer
                        || consumerGeneration !== this._durableRewardConsumerGeneration
                        || !this._isDurableRewardLifecycleCurrent(activeContext))) {
                    this._scheduleDurableRewardDrain();
                }
            }
        }
    }

    async _ackDurableBossReward(rewardRef, data) {
        if (!rewardRef || typeof rewardRef.transaction !== 'function') return false;
        const claimedAt = Math.max(Number(data.authoredAt || 0), Math.round(this.getServerNow()));
        try {
            const result = await rewardRef.transaction((current) => {
                if (!current || current.rewardId !== data.rewardId || current.recipientId !== this.playerId) return;
                if (current.status === 'claimed') return current;
                if (current.status !== 'pending') return;
                if (current.kind === 'boss_progress') {
                    return {
                        ...current,
                        status: 'claimed',
                        claimedBy: this.playerId,
                        claimedAt
                    };
                }
                return {
                    schemaVersion: DURABLE_BOSS_REWARD_SCHEMA_VERSION,
                    kind: 'boss_items',
                    status: 'claimed',
                    rewardId: current.rewardId,
                    recipientId: current.recipientId,
                    authorHostId: current.authorHostId,
                    fieldId: current.fieldId,
                    bossTypeId: current.bossTypeId,
                    bossInstanceId: current.bossInstanceId,
                    monsterName: current.monsterName || current.bossTypeId,
                    catalogVersion: current.catalogVersion,
                    catalogFingerprint: current.catalogFingerprint,
                    authoredAt: current.authoredAt,
                    expiresAt: current.expiresAt,
                    claimedBy: this.playerId,
                    claimedAt
                };
            });
            const value = result?.snapshot?.val?.();
            return !!(value && value.rewardId === data.rewardId && value.status === 'claimed');
        } catch (error) {
            Logger.warn(`[Network] Failed to acknowledge durable boss reward ${data.rewardId}`, error);
            return false;
        }
    }

    _enqueueDurableBossReward(playerId, data, options = {}) {
        const envelope = this._createDurableBossRewardEnvelope(playerId, data, options);
        if (!envelope) {
            Logger.warn('[Network] Refusing to enqueue an invalid durable boss reward request');
            return false;
        }
        const rewardKey = this._buildDurableRewardKey(envelope.rewardId);
        const queueKey = `${playerId}:${rewardKey}`;
        const existingEntry = this._pendingDurableRewardWrites.get(queueKey);
        if (existingEntry) {
            this._attemptDurableBossRewardWrite(existingEntry);
            return existingEntry.volatileOnly !== true;
        }
        const pendingEntries = Array.from(this._pendingDurableRewardWrites.values());
        const persistedEntryCount = pendingEntries.filter((entry) => entry?.volatileOnly !== true).length;
        const volatileEntryCount = pendingEntries.length - persistedEntryCount;
        const allowVolatile = options.allowVolatileOnPersistFailure === true;
        if (!allowVolatile && persistedEntryCount >= DURABLE_BOSS_REWARD_OUTBOX_MAX_ENTRIES) {
            Logger.error('[Network] Durable boss reward outbox is full; refusing to discard an older receipt');
            return false;
        }
        if (allowVolatile && volatileEntryCount >= DURABLE_BOSS_REWARD_VOLATILE_MAX_ENTRIES) {
            Logger.error('[Network] Durable boss reward volatile retry buffer is full');
            return false;
        }
        const outboxAtCapacity = persistedEntryCount >= DURABLE_BOSS_REWARD_OUTBOX_MAX_ENTRIES;

        const entry = {
            queueKey,
            rewardKey,
            recipientId: playerId,
            envelope,
            authorHostId: this.playerId,
            queuedAt: Date.now(),
            timestampFinalized: this._serverTimeOffsetReady || !window.firebase,
            attempt: 0,
            timer: null,
            volatileOnly: allowVolatile && outboxAtCapacity
        };
        this._pendingDurableRewardWrites.set(queueKey, entry);
        if (entry.volatileOnly) {
            this.emit('rewardDeliveryDegraded', {
                rewardId: envelope.rewardId,
                recipientId: playerId,
                reason: 'durable_outbox_full'
            });
            this._attemptDurableBossRewardWrite(entry);
            return false;
        }
        if (!this._persistDurableRewardOutbox(this.playerId)) {
            Logger.error(`[Network] Durable boss reward outbox persistence failed for ${envelope.rewardId}`);
            if (allowVolatile) {
                entry.volatileOnly = true;
                this.emit('rewardDeliveryDegraded', {
                    rewardId: envelope.rewardId,
                    recipientId: playerId,
                    reason: 'durable_outbox_persistence_failed'
                });
                this._attemptDurableBossRewardWrite(entry);
                return false;
            }
            this._pendingDurableRewardWrites.delete(queueKey);
            return false;
        }
        this._attemptDurableBossRewardWrite(entry);
        return true;
    }

    _scheduleDurableBossRewardWrite(entry) {
        if (!entry
            || this._pendingDurableRewardWrites.get(entry.queueKey) !== entry
            || entry.envelope?.authorHostId !== this.playerId
            || entry.timer) return;
        const delay = this._getDurableRewardRetryDelay(entry.attempt);
        entry.attempt += 1;
        entry.timer = setTimeout(() => {
            entry.timer = null;
            this._attemptDurableBossRewardWrite(entry);
        }, delay);
    }

    async _attemptDurableBossRewardWrite(entry) {
        if (!entry
            || this._pendingDurableRewardWrites.get(entry.queueKey) !== entry
            || entry.envelope?.authorHostId !== this.playerId) return false;
        if (!this.dbRef) {
            this._scheduleDurableBossRewardWrite(entry);
            return false;
        }
        const lifecycleContext = {
            generation: this._networkLifecycleGeneration,
            playerId: this.playerId,
            dbRef: this.dbRef
        };
        try {
            const serverTimeReady = await this._ensureDurableRewardServerTime();
            if (!serverTimeReady
                || !this._isDurableRewardLifecycleCurrent(lifecycleContext)
                || this._pendingDurableRewardWrites.get(entry.queueKey) !== entry) {
                this._scheduleDurableBossRewardWrite(entry);
                return false;
            }
        } catch (error) {
            Logger.warn(`[Network] Waiting for server time before durable reward write ${entry.envelope.rewardId}`, error);
            this._scheduleDurableBossRewardWrite(entry);
            return false;
        }

        const serverNow = Math.max(0, Math.round(this.getServerNow()));
        if (!entry.timestampFinalized) {
            const previousEnvelope = entry.envelope;
            entry.envelope = {
                ...entry.envelope,
                authoredAt: serverNow,
                expiresAt: serverNow + DURABLE_BOSS_REWARD_TTL_MS
            };
            entry.timestampFinalized = true;
            if (entry.volatileOnly !== true
                && !this._persistDurableRewardOutbox(entry.envelope.authorHostId)) {
                entry.envelope = previousEnvelope;
                entry.timestampFinalized = false;
                this._scheduleDurableBossRewardWrite(entry);
                return false;
            }
        }

        const rewardRef = this._getDurableRewardReceiptRef(entry.recipientId, entry.rewardKey);
        if (!rewardRef || typeof rewardRef.transaction !== 'function') {
            this._scheduleDurableBossRewardWrite(entry);
            return false;
        }

        try {
            this._recordNetworkWrite('durableBossReward', entry.envelope);
            const result = await rewardRef.transaction((current) => {
                if (!current) return entry.envelope;
                if (this._doesDurableRewardReceiptMatchEnvelope(current, entry.envelope)) return;
                return;
            });
            const value = result?.snapshot?.val?.();
            if (this._doesDurableRewardReceiptMatchEnvelope(value, entry.envelope)) {
                this._rememberBoundedCommit(
                    this._serverCommittedRewardIds,
                    `${entry.recipientId}:${entry.envelope.rewardId}`,
                    true
                );
                this._removeDurableRewardOutboxEntry(entry);
                this._markNetworkActivity();
                if (entry.recipientId === this.playerId
                    && this._durableRewardConsumer
                    && result?.snapshot?.val?.()) {
                    this._queueIncomingDurableRewardSnapshot(result.snapshot, {
                        generation: this._networkLifecycleGeneration,
                        playerId: this.playerId,
                        dbRef: this.dbRef,
                        consumer: this._durableRewardConsumer,
                        consumerGeneration: this._durableRewardConsumerGeneration
                    }).catch((error) => {
                        Logger.warn('[Network] Failed to immediately process a self-authored durable boss reward', error);
                    });
                }
                return true;
            }
            const firstWriterValidation = this._validateDurableBossRewardEnvelope(
                value,
                entry.rewardKey,
                serverNow,
                entry.recipientId
            );
            if (firstWriterValidation.ok) {
                Logger.warn(`[Network] Durable reward ${entry.envelope.rewardId} was superseded by a valid first-writer receipt`);
                this._rememberBoundedCommit(
                    this._serverCommittedRewardIds,
                    `${entry.recipientId}:${entry.envelope.rewardId}`,
                    true
                );
                this._removeDurableRewardOutboxEntry(entry);
                return true;
            }
            Logger.error(`[Network] Durable reward key collision for ${entry.envelope.rewardId}`);
            this._scheduleDurableBossRewardWrite(entry);
            return false;
        } catch (error) {
            const code = String(error?.code || '').toLowerCase();
            if (code.includes('permission') || code.includes('denied')) {
                Logger.error(`[Network] Durable boss reward write denied for ${entry.envelope.rewardId}`, error);
                this._scheduleDurableBossRewardWrite(entry);
                return false;
            }
            Logger.warn(`[Network] Durable boss reward write will retry for ${entry.envelope.rewardId}`, error);
            this._scheduleDurableBossRewardWrite(entry);
            return false;
        }
    }

    _getFormerHostAuthorityKey(fieldId, hostId) {
        if (!fieldId || !hostId) return null;
        return `${this._normalizeFieldId(fieldId)}::${String(hostId)}`;
    }

    _rememberFormerHostRewardAuthority(fieldId, hostId, changedAt = Date.now()) {
        const key = this._getFormerHostAuthorityKey(fieldId, hostId);
        if (!key) return;
        const safeChangedAt = Number(changedAt || Date.now());
        this._recentFormerHostAuthorities.forEach((entry, entryKey) => {
            if (!entry || safeChangedAt > Number(entry.expiresAt || 0)) {
                this._recentFormerHostAuthorities.delete(entryKey);
            }
        });
        if (this._recentFormerHostAuthorities.has(key)) {
            this._recentFormerHostAuthorities.delete(key);
        }
        while (this._recentFormerHostAuthorities.size >= 32) {
            const oldestKey = this._recentFormerHostAuthorities.keys().next().value;
            if (!oldestKey) break;
            this._recentFormerHostAuthorities.delete(oldestKey);
        }
        this._recentFormerHostAuthorities.set(key, {
            fieldId: this._normalizeFieldId(fieldId),
            hostId: String(hostId),
            changedAt: safeChangedAt,
            expiresAt: safeChangedAt + 10000
        });
    }

    _validateIncomingRewardPayload(data, now = Date.now()) {
        this._rollRewardValidationWindow(now);
        this._rewardValidationWindow.receivedCount += 1;

        this._recentRewardAuthorities.forEach((entry, fieldId) => {
            if (!entry || now > Number(entry.expiresAt || 0)) {
                this._recentRewardAuthorities.delete(fieldId);
            }
        });
        this._recentFormerHostAuthorities.forEach((entry, key) => {
            if (!entry || now > Number(entry.expiresAt || 0)) {
                this._recentFormerHostAuthorities.delete(key);
            }
        });
        const payloadFieldId = data.fieldId ? this._normalizeFieldId(data.fieldId) : null;
        const currentFieldId = this._getCurrentFieldId();
        const recentAuthority = payloadFieldId
            ? this._recentRewardAuthorities.get(payloadFieldId)
            : null;
        const isRecentAuthority = !!(
            recentAuthority
            && data.hostId
            && data.hostId === recentAuthority.hostId
            && Number(data.ts || 0) >= Number(recentAuthority.departedAt || 0) - 10000
            && Number(data.ts || 0) <= Number(recentAuthority.departedAt || 0) + 2000
            && now <= Number(recentAuthority.expiresAt || 0)
        );
        const formerAuthorityKey = this._getFormerHostAuthorityKey(payloadFieldId, data.hostId);
        const formerAuthority = formerAuthorityKey
            ? this._recentFormerHostAuthorities.get(formerAuthorityKey)
            : null;
        const isFormerHostAuthority = !!(
            formerAuthority
            && Number(data.ts || 0) >= Number(formerAuthority.changedAt || 0) - 10000
            && Number(data.ts || 0) <= Number(formerAuthority.changedAt || 0) + 2000
            && now <= Number(formerAuthority.expiresAt || 0)
        );
        const isGraceAuthority = isRecentAuthority || isFormerHostAuthority;

        // New clients scope every reward to the field where it was earned. Keep
        // accepting unscoped legacy payloads so rewards queued by an older client
        // during a rolling deployment are not lost.
        if (payloadFieldId && payloadFieldId !== currentFieldId && !isGraceAuthority) {
            this._recordRewardValidationBlock('field_mismatch');
            return { ok: false, reason: 'field_mismatch' };
        }

        if (!data.hostId || (data.hostId !== this.currentHostId && !isGraceAuthority)) {
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

    _getNormalRewardBatchStorageKey(authorHostId = this.playerId) {
        return authorHostId
            ? `${NORMAL_REWARD_BATCH_STORAGE_PREFIX}:${encodeURIComponent(`${this.roomId}::${authorHostId}`)}`
            : null;
    }

    _getNormalRewardBatchValidationId(batchKey) {
        return `normal_batch:${this._hashDurableRewardCatalogValue(String(batchKey || 'batch'))}`;
    }

    _persistNormalRewardBatchJournal(authorHostId = this.playerId) {
        if (!authorHostId) return false;
        const storage = this._getDurableRewardLocalStorage();
        const storageKey = this._getNormalRewardBatchStorageKey(authorHostId);
        if (!storage || !storageKey) return false;
        const entries = Array.from(this._queuedRewardBatches.entries())
            .filter(([, entry]) => entry?.authorHostId === authorHostId)
            .map(([batchKey, entry]) => ({
                schemaVersion: NORMAL_REWARD_SCHEMA_VERSION,
                roomId: this.roomId,
                batchKey,
                authorHostId,
                playerId: entry.playerId,
                fieldId: entry.fieldId,
                queuedAt: Number(entry.queuedAt || Date.now()),
                semanticRewardId: entry.semanticRewardId || entry.payload?.rewardId || null,
                receiptKey: entry.receiptKey || null,
                authoredAt: entry.authoredAt != null && Number.isFinite(Number(entry.authoredAt))
                    ? Number(entry.authoredAt)
                    : null,
                expiresAt: entry.expiresAt != null && Number.isFinite(Number(entry.expiresAt))
                    ? Number(entry.expiresAt)
                    : null,
                payload: this._cloneProfileData(entry.payload)
            }));
        if (entries.length > NORMAL_REWARD_OUTBOX_MAX_ENTRIES) return false;
        try {
            if (entries.length === 0) {
                storage.removeItem(storageKey);
                return true;
            }
            const serialized = JSON.stringify(entries);
            const bytes = typeof TextEncoder !== 'undefined'
                ? new TextEncoder().encode(serialized).length
                : serialized.length * 2;
            if (bytes > NORMAL_REWARD_OUTBOX_MAX_BYTES) return false;
            storage.setItem(storageKey, serialized);
            return true;
        } catch (error) {
            Logger.warn('[Network] Failed to persist normal reward batch journal', error);
            return false;
        }
    }

    _restoreNormalRewardBatchJournal() {
        const authorHostId = this.playerId;
        const storage = this._getDurableRewardLocalStorage();
        const storageKey = this._getNormalRewardBatchStorageKey(authorHostId);
        if (!authorHostId || !storage || !storageKey) return 0;
        let parsed = [];
        try {
            parsed = JSON.parse(storage.getItem(storageKey) || '[]');
        } catch (error) {
            Logger.warn('[Network] Ignoring an unreadable normal reward batch journal', error);
        }
        if (!Array.isArray(parsed)) parsed = [];
        parsed.slice(-NORMAL_REWARD_OUTBOX_MAX_ENTRIES).forEach((stored) => {
            if (!stored || stored.schemaVersion !== NORMAL_REWARD_SCHEMA_VERSION
                || stored.roomId !== this.roomId
                || stored.authorHostId !== authorHostId
                || typeof stored.batchKey !== 'string' || !stored.batchKey
                || typeof stored.playerId !== 'string' || !stored.playerId
                || typeof stored.fieldId !== 'string' || !stored.fieldId
                || typeof (stored.semanticRewardId || stored.payload?.rewardId) !== 'string'
                || (stored.semanticRewardId || stored.payload?.rewardId).length > 256
                || (stored.semanticRewardId || stored.payload?.rewardId) !== stored.payload?.rewardId
                || (stored.receiptKey != null && stored.receiptKey !== this._buildNormalRewardSemanticReceiptKey(
                    authorHostId,
                    stored.playerId,
                    stored.semanticRewardId || stored.payload?.rewardId
                ))
                || ((stored.authoredAt != null || stored.expiresAt != null)
                    && (!Number.isFinite(Number(stored.authoredAt))
                        || Number(stored.authoredAt) <= 0
                        || !Number.isFinite(Number(stored.expiresAt))
                        || Number(stored.expiresAt) - Number(stored.authoredAt) !== NORMAL_REWARD_TTL_MS))
                || !Number.isFinite(Number(stored.queuedAt))) return;
            const normalizedPayload = this._normalizeNormalRewardCanonicalPayload(
                stored.payload,
                this._getNormalRewardBatchValidationId(stored.batchKey)
            );
            if (!normalizedPayload
                || this._stableStringifyDurableRewardValue(normalizedPayload)
                    !== this._stableStringifyDurableRewardValue(stored.payload)) return;
            if (this._queuedRewardBatches.has(stored.batchKey)) return;
            const entry = {
                batchKey: stored.batchKey,
                authorHostId,
                playerId: stored.playerId,
                fieldId: this._normalizeFieldId(stored.fieldId),
                queuedAt: Number(stored.queuedAt),
                semanticRewardId: stored.semanticRewardId || stored.payload.rewardId,
                receiptKey: stored.receiptKey || this._buildNormalRewardSemanticReceiptKey(
                    authorHostId,
                    stored.playerId,
                    stored.semanticRewardId || stored.payload.rewardId
                ),
                authoredAt: stored.authoredAt == null ? null : Number(stored.authoredAt),
                expiresAt: stored.expiresAt == null ? null : Number(stored.expiresAt),
                payload: this._cloneProfileData(stored.payload),
                timer: null
            };
            entry.timer = setTimeout(() => this._flushQueuedRewardBatch(stored.batchKey), 0);
            this._queuedRewardBatches.set(stored.batchKey, entry);
        });
        this._persistNormalRewardBatchJournal(authorHostId);
        return this._queuedRewardBatches.size;
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
        if (data.rewardId) return false;
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
        if (typeof base.questKill === 'string') {
            nextQuestKills[base.questKill] = (nextQuestKills[base.questKill] || 0) + 1;
        }
        if (typeof incoming.questKill === 'string') {
            nextQuestKills[incoming.questKill] = (nextQuestKills[incoming.questKill] || 0) + 1;
        }
        if (incoming.questKills && typeof incoming.questKills === 'object') {
            Object.entries(incoming.questKills).forEach(([key, value]) => {
                const safeCount = Math.max(0, Number(value || 0));
                if (safeCount <= 0) return;
                nextQuestKills[key] = (nextQuestKills[key] || 0) + safeCount;
            });
        }
        if (Object.keys(nextQuestKills).length > 0) {
            next.questKills = nextQuestKills;
        } else {
            delete next.questKills;
        }
        if (incoming.bossCycle) next.bossCycle = incoming.bossCycle;
        if (incoming.bossReward === true) next.bossReward = true;
        if (incoming.introSharedQuest === true) next.introSharedQuest = true;
        delete next.questKill;
        delete next.immediate;
        delete next.rewardId;
        delete next.rewardKind;
        delete next.kind;
        return next;
    }

    async _flushQueuedRewardBatch(batchKeyOrPlayerId) {
        let batchKey = batchKeyOrPlayerId;
        let entry = this._queuedRewardBatches.get(batchKey);
        if (!entry) {
            const fallback = Array.from(this._queuedRewardBatches.entries())
                .find(([, candidate]) => candidate?.playerId === batchKeyOrPlayerId);
            if (fallback) [batchKey, entry] = fallback;
        }
        if (!entry) return false;
        const playerId = entry.playerId || batchKeyOrPlayerId;
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = null;

        const retry = () => {
            if (this._queuedRewardBatches.get(batchKey) !== entry) return false;
            entry.timer = setTimeout(() => this._flushQueuedRewardBatch(batchKey), this._rewardBatchWindowMs);
            this._queuedRewardBatches.set(batchKey, entry);
            this._persistNormalRewardBatchJournal(entry.authorHostId);
            return false;
        };
        const context = {
            generation: this._networkLifecycleGeneration,
            playerId: this.playerId,
            dbRef: this.dbRef
        };
        try {
            const serverTimeReady = await this._ensureDurableRewardServerTime();
            if (!serverTimeReady
                || !this._isDurableRewardLifecycleCurrent(context)
                || this._queuedRewardBatches.get(batchKey) !== entry) return retry();
        } catch (error) {
            Logger.warn(`[Network] Waiting for server time before normal reward batch handoff ${batchKey}`, error);
            return retry();
        }

        if (!entry.receiptKey) {
            entry.receiptKey = this._buildNormalRewardSemanticReceiptKey(
                entry.authorHostId,
                playerId,
                entry.semanticRewardId || entry.payload?.rewardId
            );
        }
        if (!entry.authoredAt) {
            entry.authoredAt = Math.max(0, Math.round(this.getServerNow()));
            entry.expiresAt = entry.authoredAt + NORMAL_REWARD_TTL_MS;
        }
        if (!entry.receiptKey || !this._persistNormalRewardBatchJournal(entry.authorHostId)) {
            return retry();
        }

        const fieldId = this._normalizeFieldId(
            entry.fieldId
            || entry.payload?.fieldId
            || this._getCurrentFieldId()
        );
        const accepted = this._enqueueNormalRewardReceipt(playerId, entry.payload, {
            fieldId,
            sealedAuthorHostId: entry.authorHostId,
            receiptKey: entry.receiptKey,
            authoredAt: entry.authoredAt,
            timestampFinalized: true
        });
        if (accepted) {
            this._queuedRewardBatches.delete(batchKey);
            if (!this._persistNormalRewardBatchJournal(entry.authorHostId)) {
                Logger.warn(`[Network] Normal reward batch handoff is safe but its stale journal could not be cleared: ${batchKey}`);
            }
            return true;
        }

        // Keep the batch in memory when the durable outbox is temporarily full or
        // unavailable. A later flush must retry the same accumulated reward.
        return retry();
    }

    _queueRewardBatch(playerId, data, options = {}) {
        if (options.requireLocalPersistence === true
            && !this._getDurableRewardLocalStorage()) return false;
        const fieldId = this._normalizeFieldId(options.fieldId || data?.fieldId || this._getCurrentFieldId());
        // Keep one batch per recipient and field. A field handoff can happen while
        // an older batch is waiting for outbox capacity, so sharing only the
        // recipient key would let the newer field overwrite the older reward.
        const classification = typeof data?.rewardId === 'string' && data.rewardId
            ? `sealed_${this._hashDurableRewardCatalogValue(data.rewardId)}`
            : (data?.introSharedQuest === true
                ? 'intro_shared_quest'
                : (data?.bossCycle || data?.rewardKind || 'standard'));
        let batchKey = `${playerId}::${fieldId}::${classification}`;
        let existing = this._queuedRewardBatches.get(batchKey) || null;
        if (existing && typeof data?.rewardId === 'string' && data.rewardId) {
            const standalonePayload = this._mergeRewardPayload({}, data);
            standalonePayload.rewardId = data.rewardId.slice(0, 256);
            const normalizedStandalone = this._normalizeNormalRewardCanonicalPayload(
                standalonePayload,
                this._getNormalRewardBatchValidationId(batchKey)
            );
            const normalizedExisting = this._normalizeNormalRewardCanonicalPayload(
                existing.payload,
                this._getNormalRewardBatchValidationId(batchKey)
            );
            if (normalizedStandalone && normalizedExisting
                && this._stableStringifyDurableRewardValue(normalizedStandalone)
                    === this._stableStringifyDurableRewardValue(normalizedExisting)) return true;
            Logger.debug(`[Network] Keeping the first journal writer for semantic reward ${data.rewardId}`);
            return true;
        }
        let mergedPayload = this._mergeRewardPayload(existing?.payload || {}, data);
        let semanticRewardId = existing?.semanticRewardId || existing?.payload?.rewardId || data?.rewardId || null;
        if (!semanticRewardId) {
            this._normalRewardBatchSequence += 1;
            semanticRewardId = `normal_batch_v2:${this._hashDurableRewardCatalogValue({
                roomId: this.roomId,
                authorHostId: options.sealedAuthorHostId || this.playerId,
                batchKey,
                queuedAt: Date.now(),
                sequence: this._normalRewardBatchSequence,
                nonce: Math.random()
            })}:${Date.now().toString(36)}:${this._normalRewardBatchSequence}`;
        }
        mergedPayload.rewardId = semanticRewardId;
        let normalizedMergedPayload = this._normalizeNormalRewardCanonicalPayload(
            mergedPayload,
            this._getNormalRewardBatchValidationId(batchKey)
        );
        if (!normalizedMergedPayload) {
            if (existing) this._flushQueuedRewardBatch(batchKey);
            this._normalRewardBatchSequence += 1;
            batchKey = `${playerId}::${fieldId}::${classification}::chunk_${Date.now()}_${this._normalRewardBatchSequence}`;
            existing = null;
            mergedPayload = this._mergeRewardPayload({}, data);
            semanticRewardId = data?.rewardId || `normal_batch_v2:${this._hashDurableRewardCatalogValue({
                roomId: this.roomId,
                authorHostId: options.sealedAuthorHostId || this.playerId,
                batchKey,
                queuedAt: Date.now(),
                sequence: this._normalRewardBatchSequence,
                nonce: Math.random()
            })}:${Date.now().toString(36)}:${this._normalRewardBatchSequence}`;
            mergedPayload.rewardId = semanticRewardId;
            normalizedMergedPayload = this._normalizeNormalRewardCanonicalPayload(
                mergedPayload,
                this._getNormalRewardBatchValidationId(batchKey)
            );
        }
        if (!normalizedMergedPayload) return false;
        mergedPayload = normalizedMergedPayload;
        const semanticReceiptKey = this._buildNormalRewardSemanticReceiptKey(
            options.sealedAuthorHostId || this.playerId,
            playerId,
            semanticRewardId
        );
        const semanticOutboxEntry = semanticReceiptKey
            ? this._pendingNormalRewardWrites.get(`${playerId}:${semanticReceiptKey}`)
            : null;
        if (semanticOutboxEntry) {
            Logger.debug(`[Network] Keeping the first outbox writer for semantic reward ${semanticRewardId}`);
            return options.requireLocalPersistence === true
                ? semanticOutboxEntry.volatileOnly !== true
                : true;
        }
        if (!existing && this._queuedRewardBatches.size >= NORMAL_REWARD_OUTBOX_MAX_ENTRIES) return false;

        const previousEntry = existing;
        const candidate = {
            ...(existing || {}),
            batchKey,
            authorHostId: options.sealedAuthorHostId || this.playerId,
            playerId,
            semanticRewardId,
            receiptKey: existing?.receiptKey || semanticReceiptKey,
            authoredAt: existing?.authoredAt || null,
            expiresAt: existing?.expiresAt || null,
            payload: mergedPayload,
            fieldId,
            queuedAt: Number(existing?.queuedAt || Date.now()),
            timer: existing?.timer || null
        };
        this._queuedRewardBatches.set(batchKey, candidate);
        if (!this._persistNormalRewardBatchJournal(candidate.authorHostId)) {
            if (previousEntry) this._queuedRewardBatches.set(batchKey, previousEntry);
            else this._queuedRewardBatches.delete(batchKey);
            return false;
        }
        if (candidate.timer) clearTimeout(candidate.timer);
        candidate.timer = setTimeout(() => this._flushQueuedRewardBatch(batchKey), this._rewardBatchWindowMs);
        this._queuedRewardBatches.set(batchKey, candidate);
        return true;
    }

    flushQueuedRewardBatches(options = {}) {
        const requestedFieldId = typeof options === 'string'
            ? this._normalizeFieldId(options)
            : (options?.fieldId ? this._normalizeFieldId(options.fieldId) : null);
        const includeUnscoped = typeof options === 'object' && options?.includeUnscoped === true;
        const pendingFlushes = [];

        Array.from(this._queuedRewardBatches.entries()).forEach(([batchKey, entry]) => {
            const entryFieldId = entry?.fieldId || entry?.payload?.fieldId || null;
            if (requestedFieldId) {
                if (!entryFieldId && !includeUnscoped) return;
                if (entryFieldId && this._normalizeFieldId(entryFieldId) !== requestedFieldId) return;
            }
            pendingFlushes.push(this._flushQueuedRewardBatch(batchKey));
        });

        return Promise.allSettled(pendingFlushes);
    }

    _buildZoneProfileSnapshot(profile) {
        if (!profile) return null;
        return {
            name: profile.name || 'Unknown',
            level: profile.level || 1,
            equipment: this._buildRealtimeEquipmentSnapshot(profile.equipment || null),
            party: profile.party || null,
            hostility: this._buildRealtimeHostilitySnapshot(profile.hostility || {}),
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
        if (patch.equipment !== undefined) zonePatch.equipment = this._buildRealtimeEquipmentSnapshot(patch.equipment || null);
        if (patch.party !== undefined) zonePatch.party = patch.party || null;
        if (patch.hostility !== undefined) zonePatch.hostility = this._buildRealtimeHostilitySnapshot(patch.hostility || {});
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
        if (payload.deathSettlementPending) nextPayload.u = 1;
        if (payload.bossCycle === 'intro' || payload.bossCycle === 'repeat') nextPayload.q = payload.bossCycle;
        if (Number.isFinite(payload.w)) nextPayload.w = payload.w;
        if (Number.isFinite(payload.h)) nextPayload.h = payload.h;
        if (typeof payload.spawnGroupId === 'string' && payload.spawnGroupId) nextPayload.g = payload.spawnGroupId;
        if (typeof payload.lastAttackerId === 'string' && payload.lastAttackerId) nextPayload.a = payload.lastAttackerId;
        if (Array.isArray(payload.damageContributors) && payload.damageContributors.length > 0) {
            nextPayload.d = payload.damageContributors.filter(Boolean).slice(0, 24);
        }
        if (Array.isArray(payload.damageContributorLevels) && payload.damageContributorLevels.length > 0) {
            nextPayload.l = payload.damageContributorLevels.slice(0, 24);
        }

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
            deathSettlementPending: payload.deathSettlementPending !== undefined
                ? !!payload.deathSettlementPending
                : !!payload.u,
            bossCycle: payload.bossCycle ?? payload.q ?? null,
            w: payload.w,
            h: payload.h,
            spawnGroupId: payload.spawnGroupId ?? payload.g ?? null,
            lastAttackerId: payload.lastAttackerId ?? payload.a ?? null,
            damageContributors: Array.isArray(payload.damageContributors)
                ? payload.damageContributors
                : (Array.isArray(payload.d) ? payload.d : []),
            damageContributorLevels: Array.isArray(payload.damageContributorLevels)
                ? payload.damageContributorLevels
                : (Array.isArray(payload.l) ? payload.l : []),
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
        const isCurrentSubscription = () => fieldId === this._monsterSubscriptionFieldId;
        const added = (snapshot) => {
            if (isCurrentSubscription()) this._onMonsterCellAdded(cellId, snapshot);
        };
        const changed = (snapshot) => {
            if (isCurrentSubscription()) this._onMonsterCellChanged(cellId, snapshot);
        };
        const removed = (snapshot) => {
            if (isCurrentSubscription()) this._onMonsterCellRemoved(cellId, snapshot);
        };

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

    async readMonsterHostSnapshot(options = {}) {
        if (!this.connected || !this.dbRef || !this.shouldUseMonsterHostSnapshot()) {
            if (options.throwOnError) {
                throw new Error('Monster host snapshot is unavailable while the network is disconnected or snapshot sync is disabled.');
            }
            return {};
        }

        try {
            const fieldId = this._getCurrentFieldId();
            const snapshot = await this.dbRef.child(`monster_host_snapshot/${fieldId}`).once('value');
            return snapshot.val() || {};
        } catch (error) {
            Logger.error('Failed to read monster host snapshot:', error);
            if (options.throwOnError) throw error;
            return {};
        }
    }

    async readFieldDropsSnapshot(options = {}) {
        if (!this.connected || !this.dbRef) {
            if (options.throwOnError) {
                throw new Error('Field drop snapshot is unavailable while the network is disconnected.');
            }
            return {};
        }
        const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());

        try {
            const seal = await this._readDropEpochSeal(fieldId);
            const namespacePath = this._getDropNamespacePath(fieldId, seal);
            if (!namespacePath) return {};
            const snapshot = await this.dbRef.child(namespacePath).once('value');
            const values = snapshot.val() || {};
            return Object.fromEntries(Object.entries(values).filter(([id, data]) => (
                !!id
                && !!data
                && typeof data === 'object'
                && data.claimStatus !== 'settled'
                && this._normalizeFieldId(data.fieldId) === fieldId
                && this._isDropPayloadForEpochSeal(data, seal)
            )));
        } catch (error) {
            Logger.error(`Failed to read field drops snapshot for ${fieldId}:`, error);
            if (options.throwOnError) throw error;
            return {};
        }
    }

    async readFieldBossState(options = {}) {
        if (!this.connected || !this.dbRef) {
            if (options.throwOnError) {
                throw new Error('Field boss state is unavailable while the network is disconnected.');
            }
            return null;
        }
        const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());
        const bossMonsterId = typeof options.bossMonsterId === 'string'
            ? options.bossMonsterId.replace(/[.#$[\]\/]/g, '_').slice(0, 128)
            : '';
        if (!bossMonsterId) {
            if (options.throwOnError) throw new Error('A boss monster id is required to read field boss state.');
            return null;
        }

        try {
            await this._ensureServerTimeOffset({ throwOnError: options.throwOnError === true });
            const snapshot = await this.dbRef.child(`field_boss_state/${fieldId}/${bossMonsterId}`).once('value');
            const value = snapshot.val();
            return value && typeof value === 'object' ? value : null;
        } catch (error) {
            Logger.error(`Failed to read field boss state for ${fieldId}:`, error);
            if (options.throwOnError) throw error;
            return null;
        }
    }

    publishFieldHandoffReady(options = {}) {
        if (!this.connected || !this.dbRef || !this.playerId) return Promise.resolve(false);
        const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());
        const payload = {
            fieldId,
            publisherId: String(this.playerId).slice(0, 128),
            complete: true,
            ts: Math.max(0, Math.round(this.getServerNow()))
        };
        return this.dbRef.child(`field_handoff_ready/${fieldId}`).set(payload)
            .then(() => true)
            .catch((error) => {
                Logger.warn(`[Network] Failed to publish field handoff readiness for ${fieldId}`, error);
                return false;
            });
    }

    async waitForFieldHandoffReady(options = {}) {
        if (!this.connected || !this.dbRef) {
            if (options.throwOnError) throw new Error('Field handoff readiness is unavailable while disconnected.');
            return false;
        }
        const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());
        const since = Math.max(0, Number(options.since || this.getServerNow()));
        const timeoutMs = Math.max(0, Math.min(3000, Number(options.timeoutMs || 1200)));
        const deadline = Date.now() + timeoutMs;
        const readyRef = this.dbRef.child(`field_handoff_ready/${fieldId}`);

        do {
            try {
                const snapshot = await readyRef.once('value');
                const value = snapshot.val();
                if (value
                    && value.complete === true
                    && value.fieldId === fieldId
                    && value.publisherId !== this.playerId
                    && Number(value.ts || 0) >= since - 3000) return true;
            } catch (error) {
                Logger.warn(`[Network] Failed to wait for field handoff readiness for ${fieldId}`, error);
                if (options.throwOnError) throw error;
                return false;
            }
            if (Date.now() >= deadline) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
        } while (Date.now() <= deadline);
        return false;
    }

    publishFieldBossState(data = {}, options = {}) {
        if (!this.connected || !this.isHost || !this.dbRef) return Promise.resolve(false);
        const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());
        const bossMonsterId = typeof data.bossMonsterId === 'string'
            ? data.bossMonsterId.replace(/[.#$[\]\/]/g, '_').slice(0, 128)
            : '';
        if (!bossMonsterId) return Promise.resolve(false);
        const payload = {
            fieldId,
            zoneId: typeof data.zoneId === 'string' ? data.zoneId.slice(0, 64) : null,
            bossMonsterId,
            bossInstanceId: typeof data.bossInstanceId === 'string' ? data.bossInstanceId.slice(0, 128) : null,
            bossAlive: data.bossAlive === true,
            phase: ['alive', 'defeated', 'spawning', 'waiting'].includes(data.phase)
                ? data.phase
                : (data.bossAlive === true ? 'alive' : 'defeated'),
            bossRespawnAt: Math.max(0, Math.round(Number(data.bossRespawnAt || 0))),
            bossDefeatedAt: Math.max(0, Math.round(Number(data.bossDefeatedAt || 0))),
            respawnSeconds: Math.max(0, Math.round(Number(data.respawnSeconds || 0))),
            spawnLeaseUntil: Math.max(0, Math.round(Number(data.spawnLeaseUntil || 0))),
            deathSnapshotCommitted: data.deathSnapshotCommitted === true,
            deathSettlementPending: data.deathSettlementPending === true,
            lastAttackerId: typeof data.lastAttackerId === 'string'
                ? data.lastAttackerId.slice(0, 128)
                : null,
            damageContributors: Array.isArray(data.damageContributors)
                ? data.damageContributors
                    .filter((uid) => typeof uid === 'string' && uid)
                    .slice(0, 24)
                    .map((uid) => uid.slice(0, 128))
                : [],
            damageContributorLevels: Array.isArray(data.damageContributorLevels)
                ? data.damageContributorLevels
                    .filter((entry) => (
                        Array.isArray(entry)
                        && entry.length === 2
                        && typeof entry[0] === 'string'
                        && entry[0]
                        && Number.isFinite(Number(entry[1]))
                    ))
                    .slice(0, 24)
                    .map(([uid, level]) => [
                        uid.slice(0, 128),
                        Math.max(1, Math.min(999, Math.floor(Number(level))))
                    ])
                : [],
            hostId: typeof this.playerId === 'string' ? this.playerId.slice(0, 128) : null,
            ts: Math.max(0, Math.round(Number(data.ts || Date.now())))
        };
        this._recordNetworkWrite('fieldBossState', payload);
        const stateRef = this.dbRef.child(`field_boss_state/${fieldId}/${bossMonsterId}`);
        const authoritativeNow = this.getServerNow();
        const writePromise = typeof stateRef.transaction === 'function'
            ? stateRef.transaction((current) => {
                if (!current || typeof current !== 'object') return payload;
                const currentTs = Math.max(0, Number(current.ts || 0));
                const poisonedFutureState = currentTs > authoritativeNow + 120000;
                if (!poisonedFutureState && currentTs > payload.ts) return;
                if (payload.phase === 'alive') {
                    const sameInstance = !!current.bossInstanceId
                        && current.bossInstanceId === payload.bossInstanceId;
                    const claimedTransition = current.phase === 'spawning' && sameInstance;
                    const idempotentAliveWrite = current.phase === 'alive'
                        && current.bossAlive === true
                        && sameInstance;
                    // A defeated/waiting lifecycle must be moved to spawning by
                    // claimFieldBossSpawn first. Otherwise a stale local boss can
                    // bypass the cooldown simply by publishing a new instance id.
                    if (payload.bossAlive !== true || (!claimedTransition && !idempotentAliveWrite)) return;
                }
                if (!poisonedFutureState
                    && current.phase === 'spawning'
                    && Number(current.spawnLeaseUntil || 0) > authoritativeNow
                    && current.bossInstanceId !== payload.bossInstanceId) return;
                if (current.phase === 'defeated' && payload.phase === 'waiting') return;
                if (current.phase === 'alive'
                    && payload.phase !== 'defeated'
                    && (payload.phase !== 'alive'
                        || current.bossInstanceId !== payload.bossInstanceId)) return;
                if (current.phase === 'spawning' && payload.phase === 'waiting') return;
                if (current.bossAlive === true
                    && payload.bossAlive === false
                    && current.bossInstanceId
                    && current.bossInstanceId !== payload.bossInstanceId) return;
                return payload;
            }).then((result) => result?.committed !== false)
            : stateRef.set(payload).then(() => true);
        return writePromise
            .catch((error) => {
                Logger.error(`Failed to publish field boss state for ${fieldId}:`, error);
                return false;
            });
    }

    claimFieldBossSpawn(data = {}, options = {}) {
        if (!this.connected || !this.isHost || !this.dbRef) return Promise.resolve(false);
        const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());
        const bossMonsterId = typeof data.bossMonsterId === 'string'
            ? data.bossMonsterId.replace(/[.#$[\]\/]/g, '_').slice(0, 128)
            : '';
        const bossInstanceId = typeof data.bossInstanceId === 'string'
            ? data.bossInstanceId.slice(0, 128)
            : '';
        if (!bossMonsterId || !bossInstanceId) return Promise.resolve(false);
        const now = Math.max(0, Math.round(Number(data.now || this.getServerNow())));
        const leaseMs = Math.max(5000, Math.min(30000, Number(data.leaseMs || 15000)));
        const bypassRespawnDeadline = data.forceQuestSpawn === true;
        const stateRef = this.dbRef.child(`field_boss_state/${fieldId}/${bossMonsterId}`);
        if (typeof stateRef.transaction !== 'function') return Promise.resolve(false);

        return stateRef.transaction((current) => {
            if (current && typeof current === 'object') {
                if (current.fieldId && this._normalizeFieldId(current.fieldId) !== fieldId) return;
                if (current.bossMonsterId && current.bossMonsterId !== bossMonsterId) return;
                const configuredRespawnSeconds = Math.max(0, Number(data.respawnSeconds || 0));
                const defeatedAt = Math.max(0, Number(current.bossDefeatedAt || 0));
                const currentTs = Math.max(0, Number(current.ts || 0));
                const poisonedFutureState = currentTs > now + 120000 || defeatedAt > now + 120000;
                if (!poisonedFutureState && current.phase === 'alive' && current.bossAlive === true) {
                    const expectedInstanceId = typeof data.expectedStaleAliveInstanceId === 'string'
                        ? data.expectedStaleAliveInstanceId
                        : null;
                    const expectedTs = Math.max(0, Number(data.expectedStaleAliveTs || 0));
                    const exactObservedMarker = expectedInstanceId === current.bossInstanceId
                        && expectedTs === currentTs;
                    if (!exactObservedMarker || now < currentTs + 15000) return;
                }
                if (!poisonedFutureState
                    && current.phase === 'spawning'
                    && Number(current.spawnLeaseUntil || 0) > now) return;
                const rawDeadline = defeatedAt > 0 && configuredRespawnSeconds > 0
                    ? defeatedAt + (configuredRespawnSeconds * 1000)
                    : Math.max(0, Number(current.bossRespawnAt || 0));
                const maxPlausibleDeadline = now + (configuredRespawnSeconds * 1000) + 120000;
                const deadline = poisonedFutureState || rawDeadline > maxPlausibleDeadline
                    ? 0
                    : rawDeadline;
                if (!bypassRespawnDeadline
                    && (current.phase === 'defeated' || current.phase === 'waiting')
                    && deadline > now) return;
            }

            return {
                fieldId,
                zoneId: typeof data.zoneId === 'string' ? data.zoneId.slice(0, 64) : null,
                bossMonsterId,
                bossInstanceId,
                bossAlive: false,
                phase: 'spawning',
                bossRespawnAt: 0,
                bossDefeatedAt: 0,
                respawnSeconds: Math.max(0, Math.round(Number(data.respawnSeconds || 0))),
                spawnLeaseUntil: now + leaseMs,
                hostId: typeof this.playerId === 'string' ? this.playerId.slice(0, 128) : null,
                ts: now
            };
        }).then((result) => result?.committed === true)
            .catch((error) => {
                Logger.error(`Failed to claim field boss spawn for ${fieldId}:`, error);
                return false;
            });
    }

    getServerNow() {
        return Date.now() + (Number.isFinite(this.serverTimeOffsetMs) ? this.serverTimeOffsetMs : 0);
    }

    async _ensureServerTimeOffset(options = {}) {
        if (this._serverTimeOffsetReady || !window.firebase) return this.serverTimeOffsetMs;
        if (this._serverTimeOffsetPromise) return this._serverTimeOffsetPromise;
        const readPromise = firebase.database().ref('.info/serverTimeOffset').once('value')
            .then((snapshot) => {
                const offset = Number(snapshot.val());
                if (!Number.isFinite(offset)) throw new Error('Firebase returned an invalid server time offset.');
                this.serverTimeOffsetMs = offset;
                this._serverTimeOffsetReady = true;
                return offset;
            })
            .catch((error) => {
                if (options.throwOnError) throw error;
                return this.serverTimeOffsetMs;
            })
            .finally(() => {
                if (this._serverTimeOffsetPromise === readPromise) this._serverTimeOffsetPromise = null;
            });
        this._serverTimeOffsetPromise = readPromise;
        return readPromise;
    }

    getUserRootRef(uid) {
        return uid && window.firebase ? firebase.database().ref(`users/${uid}`) : null;
    }

    _createProfileWriterToken(uid) {
        const randomId = globalThis.crypto?.randomUUID?.()
            || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
        return `${String(uid || 'player').slice(0, 48)}:${randomId}`.slice(0, 128);
    }

    _createAccountSessionToken(uid) {
        return this._createProfileWriterToken(uid);
    }

    _stopAccountSessionGuard() {
        if (this._accountSessionRef && this._accountSessionHandler) {
            this._accountSessionRef.off?.('value', this._accountSessionHandler);
        }
        if (this._accountSessionHeartbeatTimer) {
            clearInterval(this._accountSessionHeartbeatTimer);
        }
        this._accountSessionRef = null;
        this._accountSessionHandler = null;
        this._accountSessionHeartbeatTimer = null;
        this._accountSessionUid = null;
        this._accountSessionToken = null;
        this._accountSessionClaimedAt = 0;
        this._accountSessionClaimConfirmed = false;
        this._accountSessionDisplacedTokens.clear();
    }

    _startAccountSessionGuard(user = null) {
        const uid = user?.uid || this.playerId;
        if (!uid || !window.firebase) {
            this._stopAccountSessionGuard();
            return false;
        }
        if (this._accountSessionUid === uid && this._accountSessionRef && this._accountSessionToken) {
            return true;
        }
        this._stopAccountSessionGuard();
        const ref = firebase.database().ref(`users/${uid}/activeSession`);
        const token = this._createAccountSessionToken(uid);
        const now = Date.now();
        this._accountSessionUid = uid;
        this._accountSessionToken = token;
        this._accountSessionRef = ref;
        this._accountSessionClaimedAt = now;
        this._accountSessionClaimConfirmed = false;
        this._accountSessionDisplacedTokens.clear();
        const takeoverGraceUntil = now + 15000;

        const rememberDisplacedToken = (candidateToken) => {
            if (typeof candidateToken !== 'string' || !candidateToken || candidateToken === token) return false;
            this._accountSessionDisplacedTokens.add(candidateToken);
            return true;
        };

        const getReplacedTokens = () => Array.from(this._accountSessionDisplacedTokens)
            .filter((candidateToken) => typeof candidateToken === 'string' && candidateToken && candidateToken !== token)
            .slice(-5);

        const isReplacingThisSession = (value) => {
            if (!value || typeof value !== 'object') return false;
            if (value.replacesToken === token) return true;
            const replacedTokens = Array.isArray(value.replacesTokens) ? value.replacesTokens : [];
            return replacedTokens.includes(token);
        };

        const publish = () => {
            if (this._accountSessionUid !== uid || this._accountSessionToken !== token) return;
            if (this._profileWriterSuperseded) return;
            const replacedTokens = getReplacedTokens();
            const payload = {
                token,
                uid,
                heartbeatAt: Date.now(),
                claimedAt: now,
                version: 'v2'
            };
            if (replacedTokens.length > 0) {
                payload.replacesToken = replacedTokens[replacedTokens.length - 1];
                payload.replacesTokens = replacedTokens;
            }
            ref.update(payload).catch((error) => Logger.warn('[Network] Account session heartbeat failed', error));
        };

        this._accountSessionHandler = (snapshot) => {
            const value = snapshot?.val?.();
            if (!value) return;
            const remoteToken = typeof value.token === 'string' ? value.token : '';
            if (!remoteToken) {
                publish();
                return;
            }
            if (remoteToken !== token && isReplacingThisSession(value)) {
                this._notifyProfileWriterSuperseded(uid, {
                    _writerEpoch: 0,
                    activeSessionToken: value.token,
                    replacedByNewSession: true
                });
                return;
            }
            if (remoteToken === token) {
                this._accountSessionClaimConfirmed = true;
                return;
            }
            const heartbeatAt = Number(value.heartbeatAt || value.claimedAt || 0);
            if (!Number.isFinite(heartbeatAt) || Date.now() - heartbeatAt > ACCOUNT_SESSION_STALE_MS) {
                publish();
                return;
            }
            if (!this._accountSessionClaimConfirmed) {
                rememberDisplacedToken(remoteToken);
                publish();
                return;
            }
            if (Date.now() < takeoverGraceUntil) {
                rememberDisplacedToken(remoteToken);
                publish();
                return;
            }
            publish();
        };
        ref.on?.('value', this._accountSessionHandler);
        publish();
        if (typeof ref.once === 'function') {
            ref.once('value')
                .then((snapshot) => {
                    const value = snapshot?.val?.();
                    const remoteToken = typeof value?.token === 'string' ? value.token : '';
                    if (rememberDisplacedToken(remoteToken)) {
                        publish();
                        return;
                    }
                    publish();
                })
                .catch(() => publish());
        } else {
            publish();
        }
        this._accountSessionHeartbeatTimer = setInterval(publish, ACCOUNT_SESSION_HEARTBEAT_MS);
        return true;
    }

    _shouldUseProfileWriterSession(uid) {
        return !!uid && uid === this.playerId && !!window.firebase;
    }

    _beginProfileWriterSession(uid, attempt = 0) {
        if (!this._shouldUseProfileWriterSession(uid)) return null;
        const session = {
            uid,
            token: this._createProfileWriterToken(uid),
            epoch: null,
            claimOnFirstWrite: false,
            ready: false,
            error: null,
            attempt: Math.max(0, Math.floor(Number(attempt || 0))),
            retryAt: 0,
            cancelled: false,
            promise: null
        };
        this._profileWriterSession = session;
        const profileRef = this.getProfileRef(uid);
        session.promise = Promise.resolve().then(async () => {
            if (!profileRef || typeof profileRef.transaction !== 'function') {
                throw new Error('Profile writer fencing requires transaction support.');
            }
            const result = await profileRef.transaction((current) => {
                const currentProfile = current && typeof current === 'object' && !Array.isArray(current)
                    ? current
                    : {};
                const currentEpoch = Math.max(0, Math.floor(Number(currentProfile._writerEpoch || 0)));
                return {
                    ...currentProfile,
                    _profileRevision: this._getProfileRevision(currentProfile),
                    _writerEpoch: currentEpoch + 1,
                    _writerToken: session.token
                };
            });
            const profile = result?.snapshot?.val?.() || null;
            if (!result?.committed || !profile) {
                throw new Error('Profile writer session claim was not committed.');
            }
            session.epoch = Math.max(1, Math.floor(Number(profile._writerEpoch || 1)));
            session.claimOnFirstWrite = false;
            this._rememberProfileRevision(uid, profile);
            session.ready = true;
            return session;
        }).catch((error) => {
            session.error = error;
            session.retryAt = Date.now() + Math.min(4000, 250 * (2 ** session.attempt));
            Logger.error(`[Network] Failed to establish a profile writer session for ${uid}`, error);
            return session;
        });
        return session;
    }

    async _ensureProfileWriterSession(uid) {
        if (!this._shouldUseProfileWriterSession(uid)) return null;
        let session = this._profileWriterSession;
        if (!session || session.uid !== uid || session.cancelled) session = this._beginProfileWriterSession(uid);
        if (!session) return null;
        for (let retry = 0; retry < 2; retry += 1) {
            await session.promise;
            if (session.ready && !session.error) return session;
            if (this._profileWriterSession !== session || this.playerId !== uid) return null;
            const retryDelay = Math.max(0, Number(session.retryAt || 0) - Date.now());
            if (retryDelay > 0) {
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
            }
            if (this._profileWriterSession !== session || this.playerId !== uid) return null;
            session = this._beginProfileWriterSession(uid, session.attempt + 1);
        }
        await session?.promise;
        return session?.ready && !session?.error ? session : null;
    }

    _notifyProfileWriterSuperseded(uid, currentProfile = null) {
        if (this._profileWriterSuperseded) return;
        this._profileWriterSuperseded = true;
        this._stopAccountSessionGuard();
        this.emit('profileWriterSuperseded', {
            uid,
            currentWriterEpoch: Number(currentProfile?._writerEpoch || 0),
            detectedAt: Date.now()
        });
    }

    isProfileWriterSuperseded() {
        return this._profileWriterSuperseded === true;
    }

    _canProfileWriterSessionCommit(current, session) {
        if (!session) return true;
        return !session.cancelled
            && !!current
            && current._writerToken === session.token
            && Number(current._writerEpoch) === Number(session.epoch);
    }

    _applyProfileWriterSession(profile, session, current = null) {
        if (!session) {
            if (!current?._writerToken) return profile;
            return {
                ...profile,
                _writerEpoch: Math.max(0, Math.floor(Number(current._writerEpoch || 0))),
                _writerToken: current._writerToken
            };
        }
        return {
            ...profile,
            _writerEpoch: session.epoch,
            _writerToken: session.token
        };
    }

    getProfileRef(uid) {
        return uid && window.firebase ? firebase.database().ref(`users/${uid}/profile`) : null;
    }

    getRecoveryProfileRef(uid) {
        return uid && window.firebase ? firebase.database().ref(`recovery_profiles/${uid}`) : null;
    }

    _createProfileReadError(uid, operation, cause = null) {
        const error = new Error(`Profile read failed during ${operation} for ${uid || 'unknown uid'}.`);
        error.name = 'ProfileReadError';
        error.code = cause?.code || 'profile_read_failed';
        error.reason = 'profile_read_failed';
        error.uid = uid || null;
        error.operation = operation;
        error.cause = cause;
        return error;
    }

    _getProfileRevision(profile = null) {
        const revision = Number(profile?._profileRevision || 0);
        return Number.isFinite(revision) ? Math.max(0, Math.floor(revision)) : 0;
    }

    _rememberProfileRevision(uid, profileOrRevision = null) {
        if (!uid) return 0;
        const revision = typeof profileOrRevision === 'number'
            ? Math.max(0, Math.floor(profileOrRevision))
            : this._getProfileRevision(profileOrRevision);
        const tracked = Math.max(this._profileRevisions.get(uid) || 0, revision);
        this._profileRevisions.set(uid, tracked);
        return tracked;
    }

    _resolveExpectedProfileRevision(uid, options = {}) {
        const hasExplicitRevision = options.expectedRevision !== undefined;
        const hasTrackedRevision = this._profileRevisions.has(uid);
        if (!hasExplicitRevision && !hasTrackedRevision) {
            return { provided: false, valid: true, value: null };
        }
        const rawRevision = hasExplicitRevision
            ? options.expectedRevision
            : this._profileRevisions.get(uid);
        const revision = Number(rawRevision);
        return {
            provided: rawRevision !== undefined,
            valid: Number.isFinite(revision) && revision >= 0 && Math.floor(revision) === revision,
            value: Number.isFinite(revision) ? Math.floor(revision) : null
        };
    }

    _isRealPlayerProfile(profile = null) {
        if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return false;
        const controlFields = new Set(['_writerEpoch', '_writerToken', '_profileRevision']);
        return Object.keys(profile).some((key) => !controlFields.has(key));
    }

    async getPlayerProfile(uid, options = {}) {
        const throwOnError = options.strict === true || options.throwOnError === true;
        if (!uid || !window.firebase) {
            if (throwOnError) throw this._createProfileReadError(uid, 'getPlayerProfile');
            return null;
        }
        try {
            const snapshot = await this.getProfileRef(uid)?.once('value');
            const profile = snapshot?.val() || null;
            this._rememberProfileRevision(uid, profile);
            return this._isRealPlayerProfile(profile) ? profile : null;
        } catch (e) {
            Logger.error('Failed to get player profile', e);
            if (throwOnError) {
                throw e?.code === 'profile_read_failed'
                    ? e
                    : this._createProfileReadError(uid, 'getPlayerProfile', e);
            }
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

    _normalizeFirebaseObjectKey(key) {
        if (typeof key !== 'string') return '';
        return key.trim().replace(/[.#$\/\[\]\u0000-\u001F\u007F]/g, '_');
    }

    _getFirebaseKeyCollisionSuffix(key) {
        let hash = 2166136261;
        for (let index = 0; index < key.length; index += 1) {
            hash ^= key.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    _sanitizeFirebaseProfileValue(value) {
        if (Array.isArray(value)) {
            return value.map((entry) => this._sanitizeFirebaseProfileValue(entry));
        }
        if (!value || typeof value !== 'object') return value;

        const entries = Object.entries(value)
            .map(([rawKey, entryValue]) => ({
                rawKey,
                baseKey: this._normalizeFirebaseObjectKey(rawKey) || '_',
                value: entryValue
            }))
            .sort((left, right) => (
                left.baseKey.localeCompare(right.baseKey)
                || Number(right.rawKey === right.baseKey) - Number(left.rawKey === left.baseKey)
                || left.rawKey.localeCompare(right.rawKey)
            ));
        const sanitized = {};
        const usedKeys = new Set();
        entries.forEach(({ rawKey, baseKey, value: entryValue }) => {
            let key = baseKey;
            if (usedKeys.has(key)) {
                const suffix = this._getFirebaseKeyCollisionSuffix(rawKey);
                key = `${baseKey}__${suffix}`;
                let collisionIndex = 2;
                while (usedKeys.has(key)) {
                    key = `${baseKey}__${suffix}_${collisionIndex}`;
                    collisionIndex += 1;
                }
            }
            usedKeys.add(key);
            Object.defineProperty(sanitized, key, {
                value: this._sanitizeFirebaseProfileValue(entryValue),
                enumerable: true,
                configurable: true,
                writable: true
            });
        });
        return sanitized;
    }

    _sanitizeQuestStateForFirebase(questState = null) {
        if (!questState || typeof questState !== 'object') return questState;
        return this._sanitizeFirebaseProfileValue(this._cloneProfileData(questState) || {});
    }

    _sanitizeProfileDataForFirebase(data = null) {
        if (!data || typeof data !== 'object') return data;
        return this._sanitizeFirebaseProfileValue(this._cloneProfileData(data) || {});
    }

    _normalizeProfileSnapshot(data, fallbackTs = 0) {
        const snapshot = this._sanitizeProfileDataForFirebase(data) || {};
        const existingTs = Number(snapshot.ts || 0);
        snapshot.ts = existingTs > 0 ? existingTs : fallbackTs;
        return snapshot;
    }

    _getProfileInventoryScore(profile = null) {
        const inventory = Array.isArray(profile?.inventory) ? profile.inventory : [];
        const equipment = profile?.equipment && typeof profile.equipment === 'object' ? profile.equipment : {};
        const scoreItem = (item) => {
            if (!item || typeof item !== 'object') return 0;
            const amount = Math.max(1, Number(item.amount || 1));
            const enhancement = Math.max(0, Number(item.enhancementLevel || 0));
            const optionCount = item.rolledValues && typeof item.rolledValues === 'object'
                ? Object.keys(item.rolledValues).length
                : 0;
            const rarityScore = {
                common: 1,
                uncommon: 2,
                rare: 4,
                epic: 7,
                legendary: 12
            }[String(item.rarity || '').toLowerCase()] || 2;
            return amount + rarityScore + enhancement * 3 + optionCount * 2;
        };

        const inventoryScore = inventory.reduce((total, item, index) => {
            if (index === 0 && item?.type === 'manastone') return total;
            return total + scoreItem(item);
        }, 0);
        const equipmentScore = Object.values(equipment).reduce((total, item) => total + scoreItem(item), 0);
        return inventoryScore + equipmentScore;
    }

    _getProfileStatTotal(profile = null) {
        if (!profile || typeof profile !== 'object') return 0;
        return ['vitality', 'intelligence', 'wisdom', 'agility', 'statPoints']
            .reduce((total, key) => total + Math.max(0, Number(profile[key] || 0)), 0);
    }

    _isDeveloperProfileOverrideActive() {
        const ui = window.game?.ui;
        if (!ui?.devMode) return false;
        if (typeof ui.hasDeveloperAccess === 'function') return !!ui.hasDeveloperAccess();
        return true;
    }

    _isProfileSuspiciousHighLevelReset(profile = null) {
        if (!profile || typeof profile !== 'object') return false;
        const level = Math.max(1, Math.floor(Number(profile.level || 1)));
        if (level < 5) return false;

        const vitality = Math.max(0, Number(profile.vitality || 0));
        const intelligence = Math.max(0, Number(profile.intelligence || 0));
        const wisdom = Math.max(0, Number(profile.wisdom || 0));
        const agility = Math.max(0, Number(profile.agility || 0));
        const statPoints = Math.max(0, Number(profile.statPoints || 0));
        const statTotal = this._getProfileStatTotal(profile);
        const expectedStatTotal = 7 + Math.max(0, level - 1);
        const baseLikeStats = vitality <= 1 && intelligence <= 3 && wisdom <= 2 && agility <= 1;
        const missingMostLevelStats = statTotal <= Math.max(9, expectedStatTotal * 0.5);
        const statResetLike = baseLikeStats && statPoints <= Math.max(1, Math.floor((level - 1) * 0.25));

        const inventoryScore = this._getProfileInventoryScore(profile);
        const questScore = this._getProfileQuestScore(profile);
        const advancedField = !['', 'zone_1'].includes(String(profile.currentZoneId || profile.mapId || 'zone_1'));
        const advancedProgress = questScore >= 100 || advancedField;
        const emptyInventoryLike = inventoryScore <= 2;

        return statResetLike || missingMostLevelStats || (advancedProgress && emptyInventoryLike);
    }

    _getProfileQuestScore(profile = null) {
        const questData = profile?.questData && typeof profile.questData === 'object' ? profile.questData : {};
        const questState = profile?.questState && typeof profile.questState === 'object' ? profile.questState : {};
        const completedCount = questState.completed && typeof questState.completed === 'object'
            ? Object.keys(questState.completed).length
            : 0;
        const flagCount = questState.flags && typeof questState.flags === 'object'
            ? Object.keys(questState.flags).filter((key) => questState.flags[key]).length
            : 0;
        return (
            Math.max(0, Number(questData.slimeKills || 0))
            + Math.max(0, Number(questData.slimeRepeatKills || 0))
            + Math.max(0, Number(questData.bossClearCount || 0)) * 100
            + (questData.basicTrainingCompleted ? 50 : 0)
            + (questData.slimeQuestClaimed ? 30 : 0)
            + (questData.slime30QuestClaimed ? 60 : 0)
            + (questData.bossQuestClaimed ? 120 : 0)
            + completedCount * 80
            + flagCount * 10
        );
    }

    _getProfileProgressScore(profile = null) {
        if (!profile || typeof profile !== 'object') return 0;
        const level = Math.max(1, Math.floor(Number(profile.level || 1)));
        const exp = Math.max(0, Number(profile.exp || 0));
        const manastone = Math.max(0, Number(profile.manastone ?? profile.gold ?? 0));
        const statInvestment = ['vitality', 'intelligence', 'wisdom', 'agility', 'statPoints']
            .reduce((total, key) => total + Math.max(0, Number(profile[key] || 0)), 0);
        const skillInvestment = Object.values(profile.skillLevels || {})
            .reduce((total, value) => total + Math.max(1, Number(value || 1)), 0);
        const inventoryScore = this._getProfileInventoryScore(profile);
        const questScore = this._getProfileQuestScore(profile);

        return (
            level * 1_000_000
            + exp
            + Math.floor(manastone / 10)
            + statInvestment * 5_000
            + skillInvestment * 2_000
            + inventoryScore * 7_500
            + questScore * 2_000
        );
    }

    _isProfileCandidateBetter(candidate = null, incumbent = null) {
        if (!candidate?.profile) return false;
        if (!incumbent?.profile) return true;
        const candidateSuspicious = this._isProfileSuspiciousHighLevelReset(candidate.profile);
        const incumbentSuspicious = this._isProfileSuspiciousHighLevelReset(incumbent.profile);
        const candidateScore = this._getProfileProgressScore(candidate.profile);
        const incumbentScore = this._getProfileProgressScore(incumbent.profile);
        const candidateTs = Number(candidate.ts || candidate.profile.ts || 0);
        const incumbentTs = Number(incumbent.ts || incumbent.profile.ts || 0);
        if (candidateTs !== incumbentTs) {
            // Older recovery data may have a higher score after legitimate item
            // consumption or a repeat-quest reset. Only prefer it for a clear
            // level rollback or a newer stat-reset signature.
            if (candidateTs < incumbentTs) {
                const candidateLevel = Math.max(1, Math.floor(Number(candidate.profile.level || 1)));
                const incumbentLevel = Math.max(1, Math.floor(Number(incumbent.profile.level || 1)));
                const candidateStats = this._getProfileStatTotal(candidate.profile);
                const incumbentStats = this._getProfileStatTotal(incumbent.profile);
                return candidateLevel > incumbentLevel
                    || (incumbentSuspicious && !candidateSuspicious && candidateStats > incumbentStats + 2);
            }
            return !candidateSuspicious || incumbentSuspicious;
        }
        if (candidateSuspicious !== incumbentSuspicious) return !candidateSuspicious;
        if (candidateScore !== incumbentScore) {
            return candidateScore > incumbentScore;
        }
        return false;
    }

    _isProfileRegression(current = null, next = null) {
        if (!current || !next || typeof current !== 'object' || typeof next !== 'object') return false;
        const currentScore = this._getProfileProgressScore(current);
        const nextScore = this._getProfileProgressScore(next);
        if (currentScore <= 0 || nextScore <= 0) return false;

        const currentLevel = Math.max(1, Math.floor(Number(current.level || 1)));
        const nextLevel = Math.max(1, Math.floor(Number(next.level || 1)));
        const currentInventory = this._getProfileInventoryScore(current);
        const nextInventory = this._getProfileInventoryScore(next);
        const currentSuspicious = this._isProfileSuspiciousHighLevelReset(current);
        const nextSuspicious = this._isProfileSuspiciousHighLevelReset(next);
        const currentStats = ['vitality', 'intelligence', 'wisdom', 'agility', 'statPoints']
            .reduce((total, key) => total + Math.max(0, Number(current[key] || 0)), 0);
        const nextStats = ['vitality', 'intelligence', 'wisdom', 'agility', 'statPoints']
            .reduce((total, key) => total + Math.max(0, Number(next[key] || 0)), 0);

        return (
            nextLevel < currentLevel
            || (currentLevel >= 5 && nextSuspicious && !currentSuspicious)
            || (currentLevel >= 5 && currentStats > nextStats + 2)
            || (currentLevel >= 5 && currentInventory >= 4 && nextInventory <= Math.max(1, currentInventory * 0.25))
            || (currentScore > nextScore + 250_000 && currentLevel >= nextLevel)
        );
    }

    _mergeProfileAgainstRegression(current = null, next = null) {
        const merged = this._cloneProfileData(next) || {};
        const source = this._cloneProfileData(current) || {};
        [
            'level',
            'exp',
            'maxExp',
            'manastone',
            'gold',
            'vitality',
            'intelligence',
            'wisdom',
            'agility',
            'statPoints',
            'skillLevels',
            'inventory',
            'equipment',
            'pendingItemRewards',
            'claimedRewardIds',
            'questData',
            'questState',
            'itemCooldowns',
            'createdAt',
            'recoveryUid'
        ].forEach((field) => {
            if (source[field] !== undefined) merged[field] = source[field];
        });
        merged.ts = Math.max(Number(next?.ts || 0), Date.now());
        merged._profileRegressionGuardedAt = Date.now();
        return this._sanitizeProfileDataForFirebase(merged) || merged;
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

        const normalizedProfile = this._normalizeProfileSnapshot(profile, 0);
        const recoveryUid = this._resolveRecoveryUid(normalizedProfile, uid);
        if (!recoveryUid) return null;

        normalizedProfile.recoveryUid = recoveryUid;
        const nextTs = Number(normalizedProfile.ts || Date.now());
        const payload = {
            recoveryUid,
            latestUid: uid,
            ts: nextTs,
            profile: normalizedProfile
        };

        const commitRecovery = (recoveryRef, nextPayload) => recoveryRef.transaction((current) => {
            const currentTs = Number(current?.ts || 0);
            const currentProfile = current?.profile || null;
            if (
                currentProfile
                && this._getProfileProgressScore(currentProfile) > this._getProfileProgressScore(nextPayload.profile)
            ) {
                return;
            }
            if (currentTs > Number(nextPayload.ts || 0)) return;
            return nextPayload;
        });

        const stableRef = this.getRecoveryProfileRef(recoveryUid);
        if (!stableRef) return null;
        const stableResult = await commitRecovery(stableRef, payload);
        const canonicalPayload = stableResult?.snapshot?.val?.() || payload;
        if (uid !== recoveryUid) {
            const aliasRef = this.getRecoveryProfileRef(uid);
            if (aliasRef) await commitRecovery(aliasRef, canonicalPayload);
        }

        return canonicalPayload;
    }

    _shouldSyncRecoveryAfterPatch(uid, patch = {}, options = {}) {
        if (!uid || !patch || typeof patch !== 'object') return false;
        if (options.syncRecoveryProfile === false) return false;
        if (options.syncRecoveryProfile === true) return true;

        const keys = new Set(Object.keys(patch));
        const recoveryRelevant = [
            'inventory',
            'equipment',
            'pendingItemRewards',
            'claimedRewardIds',
            'questData',
            'questState',
            'level',
            'exp',
            'maxExp',
            'statPoints',
            'manastone',
            'skillLevels',
            'vitality',
            'intelligence',
            'wisdom',
            'agility'
        ].some((key) => keys.has(key));
        if (!recoveryRelevant) return false;

        const now = Date.now();
        const previous = this._profileRecoverySyncMeta.get(uid) || 0;
        const containsDurableState = ['inventory', 'equipment', 'pendingItemRewards', 'claimedRewardIds']
            .some((key) => keys.has(key));
        const minimumIntervalMs = containsDurableState ? 45000 : 90000;
        if ((now - previous) < minimumIntervalMs) return false;
        this._profileRecoverySyncMeta.set(uid, now);
        return true;
    }

    async getLatestProfileSnapshot(uid, options = {}) {
        const throwOnError = options.strict === true || options.throwOnError === true;
        if (!uid || !window.firebase) {
            if (throwOnError) throw this._createProfileReadError(uid, 'getLatestProfileSnapshot');
            return null;
        }

        try {
            const providedProfile = options.profile && typeof options.profile === 'object'
                ? options.profile
                : null;
            const includeRecovery = options.includeRecovery !== false;
            const backupLimit = Math.max(0, Math.min(20, Math.floor(Number(options.backupLimit ?? 5))));
            const [profileSnapshot, recoverySnapshot] = await Promise.all([
                providedProfile ? Promise.resolve(null) : this.getProfileRef(uid)?.once('value'),
                includeRecovery ? this.getRecoveryProfileRef(uid)?.once('value') : Promise.resolve(null)
            ]);

            const profile = providedProfile || profileSnapshot?.val() || null;
            const rootRevision = this._getProfileRevision(profile);
            this._rememberProfileRevision(uid, rootRevision);
            const normalizedProfile = this._isRealPlayerProfile(profile)
                ? this._normalizeProfileSnapshot(profile)
                : null;

            const recoveryEntry = recoverySnapshot?.val() || null;
            const recoveryProfile = this._isRealPlayerProfile(recoveryEntry?.profile)
                ? this._normalizeProfileSnapshot(recoveryEntry.profile, recoveryEntry.ts || 0)
                : null;
            if (recoveryProfile) {
                recoveryProfile.recoveryUid = this._resolveRecoveryUid(recoveryProfile, recoveryEntry?.recoveryUid || uid);
            }

            let bestSnapshot = null;
            const consider = (candidate) => {
                if (!candidate?.profile) return;
                if (this._isProfileCandidateBetter(candidate, bestSnapshot)) {
                    bestSnapshot = candidate;
                }
            };

            const rootCandidate = normalizedProfile ? {
                profile: normalizedProfile,
                ts: normalizedProfile.ts || 0,
                source: 'profile',
                backupId: null,
                latestUid: uid,
                recoveryUid: this._resolveRecoveryUid(normalizedProfile, uid)
            } : null;
            const recoveryCandidate = recoveryProfile ? {
                profile: recoveryProfile,
                ts: Number(recoveryEntry?.ts || recoveryProfile.ts || 0),
                source: 'recovery',
                backupId: null,
                latestUid: recoveryEntry?.latestUid || uid,
                recoveryUid: this._resolveRecoveryUid(recoveryProfile, recoveryEntry?.recoveryUid || uid)
            } : null;

            consider(rootCandidate);
            consider(recoveryCandidate);

            const rootLevel = Math.max(1, Math.floor(Number(normalizedProfile?.level || 1)));
            const rootInventoryScore = normalizedProfile ? this._getProfileInventoryScore(normalizedProfile) : 0;
            const rootLooksLikeReset = this._isProfileSuspiciousHighLevelReset(normalizedProfile);
            const rootLooksLowProgress = !normalizedProfile || rootLevel <= 3 || rootInventoryScore <= 2 || rootLooksLikeReset;
            const recoveryAlreadyBetter = recoveryCandidate && this._isProfileCandidateBetter(recoveryCandidate, rootCandidate);
            const shouldReadBackups = backupLimit > 0 && (
                options.forceBackupLookup === true
                || !bestSnapshot?.profile
                || (rootLooksLowProgress && !recoveryAlreadyBetter)
            );

            if (shouldReadBackups) {
                const backupSnapshot = await this.getProfileBackupsRef(uid)
                    ?.orderByChild('ts')
                    .limitToLast(rootLooksLikeReset ? 20 : backupLimit)
                    .once('value');
                backupSnapshot?.forEach((child) => {
                    const backup = { id: child.key, ...(child.val() || {}) };
                    const backupProfile = backup?.profile
                        ? this._normalizeProfileSnapshot(backup.profile, backup.ts || 0)
                        : null;
                    consider(backupProfile ? {
                        profile: backupProfile,
                        ts: Number(backup.ts || backupProfile.ts || 0),
                        source: 'backup',
                        backupId: backup?.id || null,
                        latestUid: uid,
                        recoveryUid: this._resolveRecoveryUid(backupProfile, uid)
                    } : null);
                });
            }

            if (bestSnapshot) {
                return {
                    ...bestSnapshot,
                    rootRevision
                };
            }
            return options.includeMissingMetadata === true
                ? { profile: null, source: null, latestUid: uid, rootRevision }
                : null;
        } catch (error) {
            Logger.error('Failed to get latest profile snapshot', error);
            if (throwOnError) {
                throw error?.code === 'profile_read_failed'
                    ? error
                    : this._createProfileReadError(uid, 'getLatestProfileSnapshot', error);
            }
            return null;
        }
    }

    async archiveLatestProfile(uid, options = {}) {
        if (!uid || !window.firebase) return { ok: false, reason: 'invalid_args' };

        try {
            const latestSnapshot = await this.getLatestProfileSnapshot(uid, { throwOnError: true });
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
            if (options.strict === true || options.throwOnError === true) throw error;
            return {
                ok: false,
                reason: error?.code === 'profile_read_failed' ? 'profile_read_failed' : 'archive_failed',
                error
            };
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
        const merged = this._sanitizeProfileDataForFirebase(baseData) || {};
        const nextPatch = this._sanitizeProfileDataForFirebase(patchData) || {};

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

        return this._sanitizeProfileDataForFirebase(merged) || merged;
    }

    _serializeProfileCommit(uid, operation) {
        const previous = this._profileCommitChains.get(uid) || Promise.resolve();
        const result = previous.catch(() => { }).then(operation);
        const tail = result.then(() => undefined, () => undefined);
        this._profileCommitChains.set(uid, tail);
        tail.then(() => {
            if (this._profileCommitChains.get(uid) === tail) {
                this._profileCommitChains.delete(uid);
            }
        });
        return result;
    }

    async _drainProfileCommitChain(uid) {
        const chain = this._profileCommitChains.get(uid);
        if (chain) await chain;
    }

    async savePlayerData(uid, data, syncToZone = false, options = {}) {
        if (!uid || !window.firebase || !data || typeof data !== 'object' || Array.isArray(data)) {
            return { ok: false, reason: 'invalid_args' };
        }
        if (uid !== this.playerId) {
            return { ok: false, reason: 'profile_uid_mismatch' };
        }
        if (uid && this._profileDisconnectingUids.has(uid)) {
            return { ok: false, reason: 'profile_disconnect_in_progress' };
        }
        if (uid && this._blockedProfileWriteUids.has(uid)) {
            return { ok: false, reason: 'profile_write_blocked' };
        }
        const debounceMs = Number(options.debounceMs || 0);
        let patchWaiters = null;
        if (this._queuedProfilePatches.has(uid)) {
            const queuedPatch = this._queuedProfilePatches.get(uid);
            if (queuedPatch?.timer) clearTimeout(queuedPatch.timer);
            this._queuedProfilePatches.delete(uid);
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
        if (!uid || !window.firebase || !patchData || typeof patchData !== 'object' || Array.isArray(patchData)) {
            return { ok: false, reason: 'invalid_args' };
        }
        if (uid !== this.playerId) {
            return { ok: false, reason: 'profile_uid_mismatch' };
        }
        if (this._blockedProfileWriteUids.has(uid)) {
            return { ok: false, reason: 'profile_write_blocked' };
        }
        if (this._profileDisconnectingUids.has(uid)) {
            return { ok: false, reason: 'profile_disconnect_in_progress' };
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

    async flushProfileWrites(uid = this.playerId) {
        if (!uid) return { ok: true, results: [] };

        const pending = [];
        if (this._queuedProfileSaves.has(uid)) {
            pending.push(this._flushQueuedProfileSave(uid));
        }
        if (this._queuedProfilePatches.has(uid)) {
            pending.push(this._flushQueuedProfilePatch(uid));
        }
        const results = await Promise.all(pending);
        await this._drainProfileCommitChain(uid);
        const failed = results.find((result) => result?.ok === false);
        return failed
            ? { ok: false, reason: failed.reason || 'profile_flush_failed', results }
            : { ok: true, results };
    }

    _summarizeProfilePayloadForLog(payload = null) {
        if (!payload || typeof payload !== 'object') return payload;
        const questState = payload.questState && typeof payload.questState === 'object' ? payload.questState : {};
        return {
            keys: Object.keys(payload).slice(0, 24),
            keyCount: Object.keys(payload).length,
            level: payload.level,
            exp: payload.exp,
            maxExp: payload.maxExp,
            currentZoneId: payload.currentZoneId || payload.mapId,
            inventorySlots: Array.isArray(payload.inventory) ? payload.inventory.filter(Boolean).length : undefined,
            pendingRewards: Array.isArray(payload.pendingItemRewards) ? payload.pendingItemRewards.length : undefined,
            claimedRewardIds: Array.isArray(payload.claimedRewardIds) ? payload.claimedRewardIds.length : undefined,
            questFlags: payload.questData && typeof payload.questData === 'object' ? Object.keys(payload.questData).length : undefined,
            questActive: questState.active && typeof questState.active === 'object' ? Object.keys(questState.active).length : undefined,
            questCompleted: questState.completed && typeof questState.completed === 'object' ? Object.keys(questState.completed).length : undefined,
            ts: payload.ts
        };
    }

    async _commitPlayerData(uid, data, syncToZone = false, options = {}) {
        if (!uid || !window.firebase || !data || typeof data !== 'object' || Array.isArray(data)) {
            return { ok: false, reason: 'invalid_args' };
        }
        if (this._blockedProfileWriteUids.has(uid)) {
            return { ok: false, reason: 'profile_write_blocked' };
        }
        if (uid !== this.playerId) {
            return { ok: false, reason: 'profile_uid_mismatch' };
        }
        return this._serializeProfileCommit(uid, () => (
            this._commitPlayerDataTransaction(uid, data, syncToZone, options)
        ));
    }

    async _commitPlayerDataTransaction(uid, data, syncToZone = false, options = {}) {
        if (this._blockedProfileWriteUids.has(uid)) {
            return { ok: false, reason: 'profile_write_blocked' };
        }
        if (uid !== this.playerId) {
            return { ok: false, reason: 'profile_uid_mismatch' };
        }
        if (uid === this.playerId && this._profileWriterSuperseded) {
            return { ok: false, reason: 'account_session_superseded' };
        }
        try {
            const requiresWriterSession = this._shouldUseProfileWriterSession(uid);
            const writerSession = requiresWriterSession
                ? await this._ensureProfileWriterSession(uid)
                : null;
            if (requiresWriterSession && !writerSession) {
                return { ok: false, reason: 'writer_session_unavailable' };
            }
            const expectedRevision = this._resolveExpectedProfileRevision(uid, options);
            if (!expectedRevision.valid) {
                return { ok: false, reason: 'invalid_expected_revision' };
            }
            const nextProfile = this._normalizeProfileSnapshot(data, Date.now());
            delete nextProfile._profileRevision;
            delete nextProfile._writerEpoch;
            delete nextProfile._writerToken;
            nextProfile.recoveryUid = this._resolveRecoveryUid(nextProfile, uid);
            nextProfile.ts = Math.max(Number(nextProfile.ts || 0), Date.now(), this._lastProfileSaveTs + 1);
            this._lastProfileSaveTs = nextProfile.ts;
            const profileRef = this.getProfileRef(uid);
            const bypassRegressionGuard = options.bypassProfileRegressionGuard === true;
            let committedProfile = null;
            let abortReason = null;

            Logger.debug(
                `[Network] Saving Player Data to users/${uid}/profile:`,
                this._summarizeProfilePayloadForLog(nextProfile)
            );
            this._recordNetworkWrite('profileSave', nextProfile);
            const transactionResult = await profileRef.transaction((current) => {
                abortReason = null;
                const currentIsRealProfile = this._isRealPlayerProfile(current);
                const allowMissingProfileWrite = options.requireMissingProfile === true
                    || options.allowMissingProfileRepair === true;
                const createMissingProfile = allowMissingProfileWrite && !currentIsRealProfile;
                if (!createMissingProfile && !this._canProfileWriterSessionCommit(current, writerSession)) {
                    abortReason = 'writer_session_superseded';
                    return;
                }
                const currentRevision = createMissingProfile ? 0 : this._getProfileRevision(current);
                if (options.requireMissingProfile === true && currentIsRealProfile) {
                    abortReason = 'profile_exists';
                    return;
                }
                if (expectedRevision.provided && currentRevision !== expectedRevision.value) {
                    abortReason = 'profile_conflict';
                    return;
                }
                const forceSafetyGuard = !bypassRegressionGuard
                    && this._isProfileSuspiciousHighLevelReset(nextProfile)
                    && !this._isDeveloperProfileOverrideActive();
                if (forceSafetyGuard && !this._isRealPlayerProfile(current)) {
                    abortReason = 'profile_safety_blocked';
                    return;
                }
                const currentTs = Number(current?.ts || 0);
                const nextTs = Number(nextProfile.ts || 0);
                if (!expectedRevision.provided && currentTs > nextTs) {
                    abortReason = 'stale_profile';
                    return;
                }
                const shouldApplyRegressionGuard = !bypassRegressionGuard
                    && (!options.allowDestructiveProfileWrite || forceSafetyGuard)
                    && this._isProfileRegression(current, nextProfile);
                const guardedProfile = shouldApplyRegressionGuard
                    ? this._mergeProfileAgainstRegression(current, nextProfile)
                    : nextProfile;
                return this._applyProfileWriterSession({
                    ...guardedProfile,
                    _profileRevision: currentRevision + 1
                }, writerSession, current);
            });

            const currentProfile = transactionResult?.snapshot?.val?.() || null;
            this._rememberProfileRevision(uid, currentProfile);
            if (!transactionResult.committed) {
                const superseded = !!writerSession
                    && !this._canProfileWriterSessionCommit(currentProfile, writerSession);
                if (superseded) this._notifyProfileWriterSuperseded(uid, currentProfile);
                return {
                    ok: false,
                    reason: superseded ? 'writer_session_superseded' : (abortReason || 'profile_transaction_aborted'),
                    currentProfile,
                    currentRevision: this._getProfileRevision(currentProfile)
                };
            }

            committedProfile = currentProfile
                ? this._normalizeProfileSnapshot(currentProfile, nextProfile.ts)
                : nextProfile;
            const revision = this._rememberProfileRevision(uid, committedProfile);
            const auxiliaryFailures = {};

            try {
                await this._writeProfileBackup(uid, committedProfile, {
                    keepCount: options.keepBackupCount || 20,
                    reason: options.backupReason || 'profile_save',
                    sourceUid: options.sourceUid || uid,
                    sourceTs: options.sourceTs || committedProfile.ts
                });
            } catch (error) {
                auxiliaryFailures.backup = error;
                Logger.warn(`[Network] Profile root committed but backup failed for ${uid}`, error);
            }

            try {
                await this._syncRecoveryProfile(uid, committedProfile);
            } catch (error) {
                auxiliaryFailures.recovery = error;
                Logger.warn(`[Network] Profile root committed but recovery sync failed for ${uid}`, error);
            }

            if (syncToZone && this.dbRef && this.zoneParticipationEnabled && this._shouldSendRealtimeUserState()) {
                try {
                    const zoneProfile = this._buildZoneProfileSnapshot(committedProfile);
                    this._recordNetworkWrite('zoneProfileSync', zoneProfile);
                    await this.dbRef.child(`users/${uid}/profile`).set(zoneProfile);
                } catch (error) {
                    auxiliaryFailures.zone = error;
                    Logger.warn(`[Network] Profile root committed but zone sync failed for ${uid}`, error);
                }
            }
            const result = { ok: true, profile: committedProfile, revision };
            if (Object.keys(auxiliaryFailures).length > 0) result.auxiliaryFailures = auxiliaryFailures;
            return result;
        } catch (e) {
            Logger.error('Failed to save player profile', e);
            return { ok: false, reason: 'save_failed', error: e };
        }
    }

    async _commitPlayerDataPatch(uid, patchData, options = {}) {
        if (!uid || !window.firebase || !patchData || typeof patchData !== 'object' || Array.isArray(patchData)) {
            return { ok: false, reason: 'invalid_args' };
        }
        if (this._blockedProfileWriteUids.has(uid)) {
            return { ok: false, reason: 'profile_write_blocked' };
        }
        if (uid !== this.playerId) {
            return { ok: false, reason: 'profile_uid_mismatch' };
        }
        return this._serializeProfileCommit(uid, () => (
            this._commitPlayerDataPatchTransaction(uid, patchData, options)
        ));
    }

    async _commitPlayerDataPatchTransaction(uid, patchData, options = {}) {
        if (this._blockedProfileWriteUids.has(uid)) {
            return { ok: false, reason: 'profile_write_blocked' };
        }
        if (uid !== this.playerId) {
            return { ok: false, reason: 'profile_uid_mismatch' };
        }
        if (uid === this.playerId && this._profileWriterSuperseded) {
            return { ok: false, reason: 'account_session_superseded' };
        }

        try {
            const requiresWriterSession = this._shouldUseProfileWriterSession(uid);
            const writerSession = requiresWriterSession
                ? await this._ensureProfileWriterSession(uid)
                : null;
            if (requiresWriterSession && !writerSession) {
                return { ok: false, reason: 'writer_session_unavailable' };
            }
            const expectedRevision = this._resolveExpectedProfileRevision(uid, options);
            if (!expectedRevision.valid) {
                return { ok: false, reason: 'invalid_expected_revision' };
            }
            const nextPatch = this._sanitizeProfileDataForFirebase(patchData) || {};
            delete nextPatch._profileRevision;
            delete nextPatch._writerEpoch;
            delete nextPatch._writerToken;
            if (Object.keys(nextPatch).length === 0) {
                return { ok: false, reason: 'empty_patch' };
            }
            nextPatch.ts = Math.max(Number(nextPatch.ts || 0), Date.now(), this._lastProfileSaveTs + 1);
            this._lastProfileSaveTs = nextPatch.ts;

            Logger.debug(
                `[Network] Saving Player Data Patch to users/${uid}/profile:`,
                this._summarizeProfilePayloadForLog(nextPatch)
            );
            this._recordNetworkWrite('profilePatchSave', nextPatch);

            const profileRef = this.getProfileRef(uid);
            let abortReason = null;
            const bypassRegressionGuard = options.bypassProfileRegressionGuard === true;
            const transactionResult = await profileRef.transaction((current) => {
                abortReason = null;
                if (!this._canProfileWriterSessionCommit(current, writerSession)) {
                    abortReason = 'writer_session_superseded';
                    return;
                }
                if (!this._isRealPlayerProfile(current)) {
                    abortReason = 'profile_missing';
                    return;
                }
                const currentRevision = this._getProfileRevision(current);
                if (expectedRevision.provided && currentRevision !== expectedRevision.value) {
                    abortReason = 'profile_conflict';
                    return;
                }
                if (!expectedRevision.provided && Number(current.ts || 0) > Number(nextPatch.ts || 0)) {
                    abortReason = 'stale_profile';
                    return;
                }
                const merged = this._mergeProfileData(current, nextPatch);
                const forceSafetyGuard = !bypassRegressionGuard
                    && this._isProfileSuspiciousHighLevelReset(merged)
                    && !this._isDeveloperProfileOverrideActive();
                const shouldApplyRegressionGuard = !bypassRegressionGuard
                    && (!options.allowDestructiveProfileWrite || forceSafetyGuard)
                    && this._isProfileRegression(current, merged);
                const guarded = shouldApplyRegressionGuard
                    ? this._mergeProfileAgainstRegression(current, merged)
                    : merged;
                return this._applyProfileWriterSession({
                    ...guarded,
                    _profileRevision: currentRevision + 1
                }, writerSession, current);
            });
            const committedProfileValue = transactionResult?.snapshot?.val?.() || null;
            this._rememberProfileRevision(uid, committedProfileValue);
            if (!transactionResult?.committed) {
                const superseded = !!writerSession
                    && !this._canProfileWriterSessionCommit(committedProfileValue, writerSession);
                if (superseded) this._notifyProfileWriterSuperseded(uid, committedProfileValue);
                return {
                    ok: false,
                    reason: superseded ? 'writer_session_superseded' : (abortReason || 'profile_transaction_aborted'),
                    currentProfile: committedProfileValue,
                    currentRevision: this._getProfileRevision(committedProfileValue)
                };
            }

            const committedProfile = this._normalizeProfileSnapshot(committedProfileValue, nextPatch.ts);
            const revision = this._rememberProfileRevision(uid, committedProfile);
            const auxiliaryFailures = {};

            if (options.syncToZone && this.dbRef && this.zoneParticipationEnabled && this._shouldSendRealtimeUserState()) {
                try {
                    const zonePatch = this._buildZoneProfilePatch(nextPatch);
                    if (zonePatch) {
                        const zoneUpdates = {};
                        Object.entries(zonePatch).forEach(([key, value]) => {
                            zoneUpdates[`users/${uid}/profile/${key}`] = value;
                        });
                        this._recordNetworkWrite('zoneProfilePatchSync', zonePatch);
                        await this.dbRef.update(zoneUpdates);
                    }
                } catch (error) {
                    auxiliaryFailures.zone = error;
                    Logger.warn(`[Network] Profile patch committed but zone sync failed for ${uid}`, error);
                }
            }

            if (this._shouldSyncRecoveryAfterPatch(uid, nextPatch, options)) {
                try {
                    await this._syncRecoveryProfile(uid, committedProfile);
                } catch (error) {
                    auxiliaryFailures.recovery = error;
                    Logger.warn(`[Network] Profile patch committed but recovery sync failed for ${uid}`, error);
                }
            }

            const result = { ok: true, patch: nextPatch, profile: committedProfile, revision };
            if (Object.keys(auxiliaryFailures).length > 0) result.auxiliaryFailures = auxiliaryFailures;
            return result;
        } catch (error) {
            Logger.error('Failed to save player profile patch', error);
            return { ok: false, reason: 'save_patch_failed', error };
        }
    }

    async recoverPlayerProfile(targetUid, sourceUid) {
        if (!targetUid || !sourceUid || !window.firebase) {
            return { ok: false, reason: 'invalid_args' };
        }
        if (targetUid !== this.playerId) {
            return { ok: false, reason: 'profile_uid_mismatch' };
        }

        let sourceSnapshot;
        let targetSnapshot;
        try {
            [sourceSnapshot, targetSnapshot] = await Promise.all([
                this.getLatestProfileSnapshot(sourceUid, { throwOnError: true }),
                this.getLatestProfileSnapshot(targetUid, {
                    throwOnError: true,
                    includeMissingMetadata: true
                })
            ]);
        } catch (error) {
            return { ok: false, reason: 'profile_read_failed', error };
        }

        if (!sourceSnapshot?.profile) {
            return { ok: false, reason: 'source_missing', sourceSnapshot, targetSnapshot };
        }

        const sourceTs = Number(sourceSnapshot.ts || 0);
        const targetTs = Number(targetSnapshot?.ts || 0);
        if (
            targetSnapshot?.profile
            && sourceTs < targetTs
            && !this._isProfileCandidateBetter(sourceSnapshot, targetSnapshot)
        ) {
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
            expectedRevision: Number(targetSnapshot?.rootRevision || 0),
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
            if (!await this._advanceDropWorldGeneration()) {
                throw new Error('Drop world generation could not be committed.');
            }
            if (!await this._resetAllQuestBossStates()) {
                throw new Error('Quest boss reset epochs could not be committed.');
            }
            // Clear World Nodes
            await Promise.all([
                this.dbRef.child('monsters').remove(),
                this.dbRef.child('monster_cells').remove(),
                this.dbRef.child('monster_host_snapshot').remove(),
                this.dbRef.child('field_boss_state').remove(),
                this.dbRef.child('field_handoff_ready').remove(),
                this.dbRef.child('drops').remove(),
                this.dbRef.child('monster_damage').remove(),
                this.dbRef.child('player_damage').remove()
            ]);
            Array.from(this._pendingDropSpawnWrites.values())
                .forEach((entry) => this._removeDropSpawnOutboxEntry(entry));
            this._refreshDropEpochSubscription(this._getCurrentFieldId());
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
            if (!await this._advanceDropFieldEpoch(fieldId)) {
                throw new Error(`Drop field epoch for ${fieldId} could not be committed.`);
            }
            await Promise.all([
                this.dbRef.child(`monster_cells/${fieldId}`).remove(),
                this.dbRef.child(`monster_host_snapshot/${fieldId}`).remove(),
                this.dbRef.child(`field_boss_state/${fieldId}`).remove(),
                this.dbRef.child(`field_handoff_ready/${fieldId}`).remove(),
                this._resetQuestBossState(fieldId),
                this.dbRef.child(`minimap_monsters/${fieldId}`).remove(),
                this._removeDropsForField(fieldId, { includeSettlementTombstones: true }),
                Promise.resolve(resetSlimeKillCount)
            ]);

            this.monsterUpdateQueue.clear();
            this._clearMonsterRemovalWriteQueue();
            this._publishedMonsterCellMap.clear();
            this._publishedMonsterRevisions.clear();
            this._monsterCellPayloadCache.clear();
            this._networkDropIds.clear();
            Array.from(this._pendingDropSpawnWrites.values())
                .filter((entry) => this._normalizeFieldId(entry?.payload?.fieldId) === fieldId)
                .forEach((entry) => this._removeDropSpawnOutboxEntry(entry));
            this._refreshDropEpochSubscription(fieldId);
            return true;
        } catch (error) {
            Logger.error('Failed to clear world combat state', error);
            return false;
        }
    }

    async _removeDropsForField(fieldId, options = {}) {
        if (!this.dbRef || !fieldId) return;

        const normalizedFieldId = this._normalizeFieldId(fieldId);
        const snapshot = await this.dbRef.child('drops').once('value');
        const raw = snapshot.val() || {};
        const updates = {};
        Object.entries(raw).forEach(([dropId, value]) => {
            if (!value || typeof value !== 'object' || !value.fieldId) return;
            if (this._normalizeFieldId(value.fieldId) !== normalizedFieldId) return;
            if (!options.includeSettlementTombstones
                && (value.claimStatus === 'claimed' || value.claimStatus === 'settled')) return;
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
            [`field_handoff_ready/${normalizedFieldId}`]: null,
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
        if (!uid || !name || !window.firebase) return false;
        try {
            const result = await firebase.database().ref(`names/${name}`).transaction((currentUid) => {
                if (currentUid == null || currentUid === uid) return uid;
                return;
            });
            return !!result?.committed && result.snapshot?.val?.() === uid;
        } catch (e) {
            Logger.error('Name claim failed', e);
            return false;
        }
    }

    async releaseNameClaim(uid, name) {
        if (!uid || !name || !window.firebase) return false;
        try {
            const result = await firebase.database().ref(`names/${name}`).transaction((currentUid) => {
                if (currentUid === uid) return null;
                return;
            });
            const remainingUid = result?.snapshot?.val?.();
            return (!!result?.committed && remainingUid == null) || remainingUid == null;
        } catch (e) {
            Logger.error('Name claim release failed', e);
            return false;
        }
    }

    // v0.00.14: Update Name Mapping when player renamed
    async updateNameMapping(uid, oldName, newName) {
        if (!uid || !newName || oldName === newName) return false;
        let newNameClaimed = false;
        try {
            newNameClaimed = await this.claimName(uid, newName);
            if (!newNameClaimed) return false;
            if (oldName && !await this.releaseNameClaim(uid, oldName)) {
                await this.releaseNameClaim(uid, newName);
                return false;
            }
            Logger.log(`Name mapping updated: ${oldName} -> ${newName} (${uid})`);
            return true;
        } catch (e) {
            if (newNameClaimed) await this.releaseNameClaim(uid, newName);
            Logger.error('Failed to update name mapping', e);
            return false;
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
            ? this._normalizeFieldId(this._buildSharedFieldId({
                ...source,
                members,
                hostId,
                mode
            }))
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

    _isZoneTransitionReason(reason = '') {
        const normalizedReason = String(reason || '').trim().toLowerCase();
        if (!normalizedReason) return false;
        return /(^|_)(zone|map)(_|$)/.test(normalizedReason);
    }

    _syncLocalPartyRuntimeFieldId(fieldId) {
        const localPlayer = window.game?.localPlayer || null;
        const party = localPlayer?.party;
        if (!party || typeof party !== 'object' || Array.isArray(party)) {
            return this._getLocalPartyState();
        }

        const members = Array.from(new Set((party.members || []).filter(Boolean)));
        localPlayer.party = {
            ...party,
            fieldId: members.length > 1 ? this._normalizeFieldId(fieldId) : null
        };
        return this._getLocalPartyState();
    }

    async handleLocalZoneChanged(reason = 'zone_changed') {
        const transitionReason = String(reason || 'zone_changed');
        const previousFieldId = this._lastKnownFieldId
            ? this._normalizeFieldId(this._lastKnownFieldId)
            : this._getCurrentFieldId();
        const previousZoneFieldId = this._getZoneBaseFieldId();
        const nextZoneFieldId = this._resolveCurrentZoneBaseFieldId();

        // Resolve the target field without exposing it to heartbeat/presence writes
        // until old-field rewards have been flushed below.
        this._activeZoneFieldId = nextZoneFieldId;
        const nextFieldId = this._getCurrentFieldId();
        this._activeZoneFieldId = previousZoneFieldId;
        const fieldChanged = !!(previousFieldId && previousFieldId !== nextFieldId);

        // Rewards and damage events were earned in the old field. Flush them while
        // their original field ids are still attached, before switching presence.
        if (fieldChanged) {
            if (this.currentHostId) {
                const departedAt = Date.now();
                this._recentRewardAuthorities.set(previousFieldId, {
                    hostId: this.currentHostId,
                    departedAt,
                    expiresAt: departedAt + 10000
                });
            }
            await this.flushQueuedRewardBatches({
                fieldId: previousFieldId,
                includeUnscoped: true
            });
            await this.flushBatchQueue();
        }

        this._activeZoneFieldId = nextZoneFieldId;
        const localParty = this._syncLocalPartyRuntimeFieldId(nextFieldId);
        this.preferredPartyHostId = localParty.members.length > 1 ? localParty.hostId : null;

        if (fieldChanged) {
            this.lastPacketData = null;
            this.isPlayerMoving = false;

            // A delayed monster flush must never publish old-map entities under the
            // newly active field id.
            if (this._monsterUpdateTimer) {
                clearTimeout(this._monsterUpdateTimer);
                this._monsterUpdateTimer = null;
            }
            this.monsterUpdateQueue.clear();
            this._clearMonsterRemovalWriteQueue();
            this._clearMonsterCellSubscriptions({ emitRemovals: true });
            this._detachMinimapMonsterSnapshotListener();
            this._networkDropIds.clear();
            this._publishedMonsterCellMap.clear();
            this._publishedMonsterRevisions.clear();
            this._lastMinimapMonsterSnapshotWriteTs = 0;
            this._lastMinimapMonsterSnapshotSignature = '';
            this._minimapMonsterSnapshotCache = null;
            this._lastPresenceLiteState = null;
        }

        // Do not delete previousFieldId here. Other party members may still be in
        // the old map and must be allowed to elect a successor host from presence.
        this._lastKnownFieldId = nextFieldId;
        this._publishPresenceLite({
            force: true,
            fieldId: nextFieldId,
            reason: transitionReason
        });
        this._refreshSharedFieldState();
        this._hydrateCachedRemotePlayersForCurrentField({ emitTransientState: true });
        this._checkHostStatus();
        this._refreshMonsterCellSubscriptions(this._resolveMonsterSubscriptionAnchorCellId());
        this._refreshMinimapMonsterSnapshotListener(nextFieldId);
        this._refreshDropEpochSubscription(nextFieldId);

        if (this.isSharedFieldActive()) {
            this._publishLocalRealtimeSnapshot(transitionReason);
        }

        if (fieldChanged) {
            this.emit('fieldContextChanged', {
                fieldId: nextFieldId,
                previousFieldId,
                reason: transitionReason
            });
        }
        this.emit('partyUpdated', { ...localParty, reason: transitionReason });

        return {
            changed: fieldChanged,
            fieldId: nextFieldId,
            previousFieldId,
            reason: transitionReason
        };
    }

    handleLocalPartyStateChanged(reason = 'party_changed') {
        const previousFieldId = this._lastKnownFieldId;
        const wasHost = !!this.isHost;
        const localParty = this._getLocalPartyState();
        const nextFieldId = this._getCurrentFieldId();
        this.preferredPartyHostId = localParty.members.length > 1 ? localParty.hostId : null;

        this._hydrateCachedRemotePlayersForCurrentField({ emitTransientState: true });

        this._refreshSharedFieldState();
        this._checkHostStatus();
        const fieldChanged = !!(previousFieldId && previousFieldId !== nextFieldId);
        if (fieldChanged) {
            this.lastPacketData = null;
            this._clearMonsterRemovalWriteQueue();
            this._clearMonsterCellSubscriptions({ emitRemovals: true });
            this._networkDropIds.clear();
            this._publishedMonsterCellMap.clear();
            this._publishedMonsterRevisions.clear();
            this._lastMinimapMonsterSnapshotWriteTs = 0;
            this._lastMinimapMonsterSnapshotSignature = '';
            this._minimapMonsterSnapshotCache = null;
            if (wasHost && !this._isZoneTransitionReason(reason)) {
                this._cleanupFieldScopedRealtimeState(previousFieldId, { removeDrops: true });
            }
            this._refreshMonsterCellSubscriptions(this._resolveMonsterSubscriptionAnchorCellId());
            this._refreshMinimapMonsterSnapshotListener(nextFieldId);
            this._refreshDropEpochSubscription(nextFieldId);
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
        if (uid !== this.playerId) {
            return { ok: false, reason: 'profile_uid_mismatch' };
        }
        try {
            this._blockedProfileWriteUids.add(uid);
            this._clearQueuedProfileWrites(uid, 'character_deleted');
            await this._drainProfileCommitChain(uid);

            const latestSnapshot = await this.getLatestProfileSnapshot(uid, { throwOnError: true });
            const resolvedName = String(name || latestSnapshot?.profile?.name || '').trim();
            const resolvedRecoveryUid = this._resolveRecoveryUid(latestSnapshot?.profile, uid);

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
            if (resolvedRecoveryUid !== uid) {
                updates[`recovery_profiles/${uid}`] = null;
            }

            await firebase.database().ref().update(updates);
            this._profileRevisions.delete(uid);

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

    async _resumePendingHostRequests(fieldId = this._getCurrentFieldId()) {
        const normalizedFieldId = this._normalizeFieldId(fieldId);
        if (!this.connected || !this.isHost || !this.dbRef || !normalizedFieldId) return false;
        if (this._hostRequestReplayFieldId === normalizedFieldId) {
            return this._hostRequestReplayPromise || true;
        }

        const lifecycleGeneration = this._networkLifecycleGeneration;
        this._hostRequestReplayFieldId = normalizedFieldId;
        let replayPromise = null;
        replayPromise = (async () => {
            const getFieldScopedSnapshotRef = (path) => {
                const ref = this.dbRef.child(path);
                return typeof ref.orderByChild === 'function'
                    ? ref.orderByChild('fieldId').equalTo(normalizedFieldId)
                    : ref;
            };
            const [dropSnapshot, bossSnapshot] = await Promise.all([
                getFieldScopedSnapshotRef('drop_collection').once('value'),
                getFieldScopedSnapshotRef('boss_spawn_requests').once('value')
            ]);
            if (lifecycleGeneration !== this._networkLifecycleGeneration
                || !this.connected
                || !this.isHost
                || this._normalizeFieldId(this._getCurrentFieldId()) !== normalizedFieldId) {
                return false;
            }

            dropSnapshot?.forEach?.((snapshot) => {
                const data = snapshot?.val?.();
                if (!data || !this._isPayloadForCurrentField(data)) return;
                this.emit('dropCollectionRequested', {
                    requestId: snapshot.key,
                    dropId: data.did,
                    collectorId: data.cid,
                    fieldId: data.fieldId,
                    dropWorldEpoch: data.dropWorldEpoch,
                    dropFieldEpoch: data.dropFieldEpoch
                });
            });
            bossSnapshot?.forEach?.((snapshot) => {
                const data = snapshot?.val?.();
                if (!data || !this._isPayloadForCurrentField(data)) return;
                this.emit('bossSpawnRequested', {
                    requestId: snapshot.key,
                    requesterId: data.requesterId || null,
                    isFirstBoss: data.isFirstBoss !== false,
                    manualSummon: data.manualSummon === true,
                    monsterId: typeof data.monsterId === 'string' ? data.monsterId : null,
                    zoneId: typeof data.zoneId === 'string' ? data.zoneId : null,
                    scrollItemId: typeof data.scrollItemId === 'string' ? data.scrollItemId : null,
                    fieldId: data.fieldId,
                    ts: Number(data.ts || Date.now())
                });
            });
            return true;
        })().catch((error) => {
            Logger.warn(`[Network] Pending host request replay deferred for ${normalizedFieldId}`, error);
            if (this._hostRequestReplayPromise === replayPromise) {
                this._hostRequestReplayFieldId = null;
            }
            return false;
        }).finally(() => {
            if (this._hostRequestReplayPromise === replayPromise) {
                this._hostRequestReplayPromise = null;
            }
        });
        this._hostRequestReplayPromise = replayPromise;
        return replayPromise;
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
        const currentFieldId = this._getCurrentFieldId();
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

        const previousHostId = this.currentHostId;
        const previousHostFieldId = this._currentHostFieldId || currentFieldId;
        if (previousHostId && previousHostId !== desiredHostId) {
            this._rememberFormerHostRewardAuthority(previousHostFieldId, previousHostId, now);
        }
        this.currentHostId = desiredHostId;
        this._currentHostFieldId = currentFieldId;
        const activeUserCount = candidates.length;
        const desiredHost = desiredHostId === this.playerId;

        if (desiredHost && !this.isHost) {
            this.isHost = true;
            Logger.info(`[Network] PROMOTED TO HOST. Active Users: ${activeUserCount}. ID: ${this.playerId}`);
            this.emit('hostChanged', true);
            this._startCleanupLoop();
        } else if (!desiredHost && this.isHost) {
            this.isHost = false;
            this._hostRequestReplayFieldId = null;
            Logger.info(`[Network] DEMOTED TO GUEST. Active Users: ${activeUserCount}`);
            this.emit('hostChanged', false);
            this._stopCleanupLoop();
        }

        if (this.isHost) {
            this._resumePendingHostRequests(currentFieldId).catch(() => { });
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

    _clearMonsterRemovalWriteQueue({ clearEpochs = true } = {}) {
        this._pendingMonsterRemovalWrites.forEach((entry) => {
            if (entry?.timer) clearTimeout(entry.timer);
        });
        this._pendingMonsterRemovalWrites.clear();
        this._pendingMonsterRemovalFlushes.clear();
        if (clearEpochs) this._monsterRemovalEpochs.clear();
    }

    _scheduleMonsterRemovalWrite(entry) {
        if (!entry
            || this._pendingMonsterRemovalWrites.get(entry.id) !== entry
            || entry.timer) return;
        const delay = this._getDurableRewardRetryDelay(entry.attempt);
        entry.attempt += 1;
        entry.timer = setTimeout(() => {
            entry.timer = null;
            this._attemptMonsterRemovalWrite(entry);
        }, delay);
    }

    _attemptMonsterRemovalWrite(entry) {
        if (!entry
            || this._pendingMonsterRemovalWrites.get(entry.id) !== entry
            || this._monsterRemovalEpochs.get(entry.id) !== entry.epoch
            || !this.connected
            || !this.isHost
            || !this.dbRef
            || entry.fieldId !== this._getCurrentFieldId()) return Promise.resolve(false);
        if (entry.inFlightPromise) return entry.inFlightPromise;

        const inFlightPromise = (async () => {
            try {
                this._recordNetworkWrite('monsterRemoval', entry.removalPaths, Object.keys(entry.removalPaths).length);
                await this.dbRef.update(entry.removalPaths);
                if (this._pendingMonsterRemovalWrites.get(entry.id) === entry) {
                    this._pendingMonsterRemovalWrites.delete(entry.id);
                }
                this._publishedMonsterCellMap.delete(entry.id);
                return true;
            } catch (error) {
                Logger.error(`Monster removal write failed for ${entry.id}:`, error);
                this._scheduleMonsterRemovalWrite(entry);
                return false;
            }
        })();
        entry.inFlightPromise = inFlightPromise;
        const clearInFlight = () => {
            if (entry.inFlightPromise === inFlightPromise) {
                entry.inFlightPromise = null;
            }
        };
        void inFlightPromise.then(clearInFlight, clearInFlight);
        return inFlightPromise;
    }

    flushPendingMonsterRemovalWrites(options = {}) {
        const requestedFieldId = typeof options === 'string'
            ? options
            : options?.fieldId;
        const fieldId = this._normalizeFieldId(requestedFieldId || this._getCurrentFieldId());
        if (!fieldId
            || !this.connected
            || !this.isHost
            || !this.dbRef
            || fieldId !== this._getCurrentFieldId()) return Promise.resolve(false);

        const activeFlush = this._pendingMonsterRemovalFlushes.get(fieldId);
        if (activeFlush) return activeFlush;

        const entries = Array.from(this._pendingMonsterRemovalWrites.values())
            .filter((entry) => entry?.fieldId === fieldId);
        if (entries.length === 0) return Promise.resolve(true);

        entries.forEach((entry) => {
            if (!entry?.timer) return;
            clearTimeout(entry.timer);
            entry.timer = null;
        });

        let flushPromise = null;
        flushPromise = Promise.all(entries.map((entry) => this._attemptMonsterRemovalWrite(entry)))
            .then((results) => {
                if (!results.every((result) => result === true)) return false;
                return !Array.from(this._pendingMonsterRemovalWrites.values())
                    .some((entry) => entry?.fieldId === fieldId);
            })
            .finally(() => {
                if (this._pendingMonsterRemovalFlushes.get(fieldId) === flushPromise) {
                    this._pendingMonsterRemovalFlushes.delete(fieldId);
                }
            });
        this._pendingMonsterRemovalFlushes.set(fieldId, flushPromise);
        return flushPromise;
    }

    _mergeRetriedMonsterUpdatePayload(failedPayload, queuedPayload) {
        if (!failedPayload) return queuedPayload;
        if (!queuedPayload) return failedPayload;
        const failedRev = Number(failedPayload.rev || 0);
        const queuedRev = Number(queuedPayload.rev || 0);
        const latest = queuedRev >= failedRev ? queuedPayload : failedPayload;
        const merged = { ...latest };
        const contributors = Array.from(new Set([
            ...(Array.isArray(failedPayload.damageContributors) ? failedPayload.damageContributors : []),
            ...(Array.isArray(queuedPayload.damageContributors) ? queuedPayload.damageContributors : [])
        ].filter(Boolean))).slice(0, 24);
        if (contributors.length > 0) merged.damageContributors = contributors;

        const contributorLevels = new Map();
        [failedPayload.damageContributorLevels, queuedPayload.damageContributorLevels].forEach((entries) => {
            if (!Array.isArray(entries)) return;
            entries.forEach((entry) => {
                if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') return;
                const level = Math.max(1, Math.min(999, Math.floor(Number(entry[1]) || 1)));
                contributorLevels.set(entry[0], Math.max(contributorLevels.get(entry[0]) || 0, level));
            });
        });
        if (contributorLevels.size > 0) {
            merged.damageContributorLevels = Array.from(contributorLevels.entries()).slice(0, 24);
        }
        if (failedPayload.fullSync || queuedPayload.fullSync) merged.fullSync = true;
        if (failedPayload.isBoss || queuedPayload.isBoss) merged.isBoss = true;
        return merged;
    }

    flushMonsterUpdates() {
        if (!this.connected || !this.isHost || !this.dbRef || this.monsterUpdateQueue.size === 0) {
            return Promise.resolve(false);
        }

        const queuedUpdates = new Map(this.monsterUpdateQueue);
        const flushContext = {
            generation: this._networkLifecycleGeneration,
            playerId: this.playerId,
            dbRef: this.dbRef,
            fieldId: this._getCurrentFieldId()
        };
        const updates = {};
        const publishedCellChanges = new Map();
        const removalEpochsAtFlush = new Map();
        queuedUpdates.forEach((payload, id) => {
            removalEpochsAtFlush.set(id, Number(this._monsterRemovalEpochs.get(id) || 0));
            if (this.shouldUseMonsterCellSync()) {
                const fieldId = flushContext.fieldId;
                const nextCellId = typeof payload.cellId === 'string'
                    ? payload.cellId
                    : this._getFieldCellId(payload.x, payload.y);
                const previousCellId = this._publishedMonsterCellMap.get(id) || null;

                if (previousCellId && previousCellId !== nextCellId) {
                    updates[`monster_cells/${fieldId}/${previousCellId}/${id}`] = null;
                }

                updates[`monster_cells/${fieldId}/${nextCellId}/${id}`] = this._buildMonsterRealtimeCellPayload(payload);
                publishedCellChanges.set(id, nextCellId);

                if (this.shouldUseMonsterHostSnapshot()
                    && (payload.fullSync || payload.isBoss || previousCellId !== nextCellId)) {
                    updates[`monster_host_snapshot/${fieldId}/${id}`] = {
                        id,
                        ...payload
                    };
                }
                if (payload.deathParentId) {
                    const ledgerPath = this._getMonsterChildSpawnLedgerPath(
                        fieldId,
                        payload.deathParentId,
                        id
                    );
                    if (ledgerPath) {
                        updates[ledgerPath] = {
                            schemaVersion: 1,
                            fieldId,
                            parentId: payload.deathParentId,
                            childId: id,
                            spawnedAt: Math.max(0, Math.round(Number(payload.ts || Date.now()))),
                            authorHostId: this.playerId
                        };
                    }
                }
                return;
            }

            updates[`monsters/${id}`] = payload;
            if (payload.deathParentId) {
                const ledgerPath = this._getMonsterChildSpawnLedgerPath(
                    flushContext.fieldId,
                    payload.deathParentId,
                    id
                );
                if (ledgerPath) {
                    updates[ledgerPath] = {
                        schemaVersion: 1,
                        fieldId: flushContext.fieldId,
                        parentId: payload.deathParentId,
                        childId: id,
                        spawnedAt: Math.max(0, Math.round(Number(payload.ts || Date.now()))),
                        authorHostId: this.playerId
                    };
                }
            }
        });
        this.monsterUpdateQueue.clear();

        this._recordNetworkWrite('monsterUpdate', updates, Object.keys(updates).length);
        return this.dbRef.update(updates)
            .then(() => {
                if (this._isDurableRewardLifecycleCurrent(flushContext)
                    && flushContext.fieldId === this._getCurrentFieldId()) {
                    publishedCellChanges.forEach((cellId, id) => {
                        if (Number(this._monsterRemovalEpochs.get(id) || 0) === removalEpochsAtFlush.get(id)) {
                            this._publishedMonsterCellMap.set(id, cellId);
                        }
                    });
                    queuedUpdates.forEach((payload, id) => {
                        if (Number(this._monsterRemovalEpochs.get(id) || 0) === removalEpochsAtFlush.get(id)) {
                            const revision = Number(payload.rev || 0);
                            this._publishedMonsterRevisions.set(
                                id,
                                Math.max(Number(this._publishedMonsterRevisions.get(id) || 0), revision)
                            );
                        }
                    });
                }
                return true;
            })
            .catch((e) => {
                Logger.error('Monster batch update failed:', e);
                if (this.connected
                    && this.isHost
                    && this._isDurableRewardLifecycleCurrent(flushContext)
                    && flushContext.fieldId === this._getCurrentFieldId()) {
                    queuedUpdates.forEach((failedPayload, id) => {
                        if (Number(this._monsterRemovalEpochs.get(id) || 0) !== removalEpochsAtFlush.get(id)
                            || this._pendingMonsterRemovalWrites.has(id)
                            || Number(this._publishedMonsterRevisions.get(id) || 0) >= Number(failedPayload.rev || 0)) return;
                        const queuedPayload = this.monsterUpdateQueue.get(id);
                        this.monsterUpdateQueue.set(
                            id,
                            this._mergeRetriedMonsterUpdatePayload(failedPayload, queuedPayload)
                        );
                    });
                    this._scheduleMonsterUpdateFlush();
                }
                return false;
            });
    }

    sendMonsterUpdate(id, data) {
        if (!this.connected || !this.isHost) return;
        if (!id || !data) return;
        if (this.shouldUseMonsterQuietMode() && !(data.immediate && data.deathSettlementPending)) return;

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
        if (data.deathSettlementPending) safeData.deathSettlementPending = true;
        if (data.bossCycle === 'intro' || data.bossCycle === 'repeat') {
            safeData.bossCycle = data.bossCycle;
        }
        if (Number.isFinite(data.w)) safeData.w = Math.round(data.w);
        if (Number.isFinite(data.h)) safeData.h = Math.round(data.h);
        if (typeof data.spawnGroupId === 'string' && data.spawnGroupId) {
            safeData.spawnGroupId = data.spawnGroupId.slice(0, 128);
        }
        if (typeof data.deathParentId === 'string' && data.deathParentId) {
            safeData.deathParentId = data.deathParentId.slice(0, 128);
        }
        if (typeof data.lastAttackerId === 'string' && data.lastAttackerId) {
            safeData.lastAttackerId = data.lastAttackerId.slice(0, 128);
        }
        if (Array.isArray(data.damageContributors) && data.damageContributors.length > 0) {
            safeData.damageContributors = data.damageContributors
                .filter((uid) => typeof uid === 'string' && uid)
                .slice(0, 24)
                .map((uid) => uid.slice(0, 128));
        }
        if (Array.isArray(data.damageContributorLevels) && data.damageContributorLevels.length > 0) {
            safeData.damageContributorLevels = data.damageContributorLevels
                .filter((entry) => (
                    Array.isArray(entry)
                    && entry.length === 2
                    && typeof entry[0] === 'string'
                    && entry[0]
                    && Number.isFinite(Number(entry[1]))
                ))
                .slice(0, 24)
                .map(([uid, level]) => [
                    uid.slice(0, 128),
                    Math.max(1, Math.min(999, Math.floor(Number(level))))
                ]);
        }

        this.monsterUpdateQueue.set(id, safeData);
        if (data.immediate) {
            return this.flushMonsterUpdates();
        }
        this._scheduleMonsterUpdateFlush();
        return true;
    }

    _getMonsterChildSpawnLedgerPath(fieldId, parentId, childId) {
        const safeKey = (value, maxLength) => (typeof value === 'string' && value
            ? value.replace(/[.#$[\]\/]/g, '_').slice(0, maxLength)
            : '');
        const safeFieldId = safeKey(this._normalizeFieldId(fieldId), 192);
        const safeParentId = safeKey(parentId, 128);
        const safeChildId = safeKey(childId, 128);
        return safeFieldId && safeParentId && safeChildId
            ? `monster_child_spawn_ledger_v1/${safeFieldId}/${safeParentId}/${safeChildId}`
            : null;
    }

    async hasMonsterChildSpawnLedger(parentId, childId, options = {}) {
        if (!this.dbRef || !parentId || !childId) return false;
        const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());
        const path = this._getMonsterChildSpawnLedgerPath(fieldId, parentId, childId);
        if (!path) return false;
        try {
            const snapshot = await this.dbRef.child(path).once('value');
            const value = snapshot?.val?.();
            return !!(value
                && value.schemaVersion === 1
                && this._normalizeFieldId(value.fieldId) === fieldId
                && value.parentId === parentId
                && value.childId === childId);
        } catch (error) {
            Logger.warn(`[Network] Failed to read child spawn ledger ${childId}`, error);
            // Unknown must never be interpreted as "not spawned". Keeping the
            // dead parent pending is safer than resurrecting a completed child.
            throw error;
        }
    }

    removeMonster(id, options = {}) {
        if (!this.connected || !this.isHost) return;
        const queuedPayload = this.monsterUpdateQueue.get(id) || null;
        this.monsterUpdateQueue.delete(id);
        const fieldId = this._getCurrentFieldId();
        const removalPaths = {};
        if (this.shouldUseMonsterCellSync()) {
            const knownCellIds = new Set([
                this._publishedMonsterCellMap.get(id) || null,
                queuedPayload?.cellId || null
            ].filter((cellId) => typeof cellId === 'string' && cellId));
            knownCellIds.forEach((cellId) => {
                removalPaths[`monster_cells/${fieldId}/${cellId}/${id}`] = null;
            });
            if (this.shouldUseMonsterHostSnapshot()) {
                removalPaths[`monster_host_snapshot/${fieldId}/${id}`] = null;
            }
        } else {
            removalPaths[`monsters/${id}`] = null;
        }
        const deathChildIds = Array.isArray(options.deathChildIds)
            ? Array.from(new Set(options.deathChildIds
                .filter((childId) => typeof childId === 'string' && childId)
                .slice(0, 16)))
            : [];
        deathChildIds.forEach((childId) => {
            const ledgerPath = this._getMonsterChildSpawnLedgerPath(fieldId, id, childId);
            if (ledgerPath) removalPaths[ledgerPath] = null;
        });
        const epoch = Number(this._monsterRemovalEpochs.get(id) || 0) + 1;
        this._monsterRemovalEpochs.set(id, epoch);
        const existingEntry = this._pendingMonsterRemovalWrites.get(id);
        if (existingEntry?.timer) clearTimeout(existingEntry.timer);
        const entry = {
            id,
            epoch,
            fieldId,
            removalPaths,
            attempt: 0,
            timer: null,
            inFlightPromise: null
        };
        this._pendingMonsterRemovalWrites.set(id, entry);
        this._publishedMonsterCellMap.delete(id);
        this._publishedMonsterRevisions.delete(id);
        this._attemptMonsterRemovalWrite(entry);
        return true;
    }

    // --- Drop Methods ---
    _getDropFieldEpochKey(fieldId = this._getCurrentFieldId()) {
        const normalizedFieldId = this._normalizeFieldId(fieldId);
        return normalizedFieldId
            ? `field_${this._hashDurableRewardCatalogValue(normalizedFieldId).replace('fnv1a32_', '')}`
            : null;
    }

    _getDropWorldGenerationRef() {
        return this.dbRef?.child?.(DROP_WORLD_GENERATION_PATH) || null;
    }

    _getDropFieldEpochRef(fieldId = this._getCurrentFieldId()) {
        const key = this._getDropFieldEpochKey(fieldId);
        return key ? this.dbRef?.child?.(`${DROP_FIELD_EPOCH_PATH}/${key}`) || null : null;
    }

    _normalizeDropEpochSeal(fieldId, worldState = null, fieldState = null) {
        const normalizedFieldId = this._normalizeFieldId(fieldId);
        const validWorld = worldState
            && worldState.schemaVersion === 1
            && Number.isInteger(Number(worldState.epoch))
            && Number(worldState.epoch) >= 0;
        const validField = fieldState
            && fieldState.schemaVersion === 1
            && fieldState.fieldId === normalizedFieldId
            && Number.isInteger(Number(fieldState.epoch))
            && Number(fieldState.epoch) >= 0;
        return {
            fieldId: normalizedFieldId,
            worldEpoch: validWorld ? Number(worldState.epoch) : 0,
            fieldEpoch: validField ? Number(fieldState.epoch) : 0,
            worldResetAt: validWorld ? Math.max(0, Number(worldState.resetAt || 0)) : 0,
            fieldResetAt: validField ? Math.max(0, Number(fieldState.resetAt || 0)) : 0
        };
    }

    _cacheDropEpochSeal(seal) {
        if (!seal?.fieldId) return null;
        const previous = this._dropEpochSealCache.get(seal.fieldId);
        if (previous
            && (Number(seal.worldEpoch) < Number(previous.worldEpoch)
                || Number(seal.fieldEpoch) < Number(previous.fieldEpoch))) {
            // Overlapping Firebase reads can resolve out of order. Both epoch
            // axes are monotonic, so a late older result must never roll the
            // cache or active subscription back to an obsolete namespace.
            return previous;
        }
        if (previous
            && (Number(previous.worldEpoch) !== Number(seal.worldEpoch)
                || Number(previous.fieldEpoch) !== Number(seal.fieldEpoch))) {
            // A committed drop only exists inside the epoch namespace where it
            // was acknowledged. Remote resets must invalidate this synchronous
            // death-settlement admission cache before another spawn can be
            // treated as durable in the new namespace.
            this._committedDropSpawnSources.clear();
        }
        this._dropEpochSealCache.set(seal.fieldId, seal);
        return seal;
    }

    _getDropNamespace(seal) {
        if (!seal?.fieldId
            || !Number.isInteger(Number(seal.worldEpoch))
            || !Number.isInteger(Number(seal.fieldEpoch))) return null;
        return `g${Number(seal.worldEpoch)}_f${Number(seal.fieldEpoch)}`;
    }

    _getDropNamespacePath(fieldId, seal) {
        const fieldKey = this._getDropFieldEpochKey(fieldId);
        const namespace = this._getDropNamespace(seal);
        return fieldKey && namespace ? `${DROP_NAMESPACE_PATH}/${fieldKey}/${namespace}` : null;
    }

    _getDropRecordRef(dropId, fieldId, seal) {
        const namespacePath = this._getDropNamespacePath(fieldId, seal);
        return namespacePath && dropId
            ? this.dbRef?.child?.(`${namespacePath}/${dropId}`) || null
            : null;
    }

    _isDropPayloadForEpochSeal(payload, seal) {
        return !!(
            payload
            && seal
            && this._normalizeFieldId(payload.fieldId) === seal.fieldId
            && Number(payload.dropWorldEpoch) === Number(seal.worldEpoch)
            && Number(payload.dropFieldEpoch) === Number(seal.fieldEpoch)
        );
    }

    async _readDropEpochSeal(fieldId = this._getCurrentFieldId()) {
        const normalizedFieldId = this._normalizeFieldId(fieldId);
        const worldRef = this._getDropWorldGenerationRef();
        const fieldRef = this._getDropFieldEpochRef(normalizedFieldId);
        if (!worldRef?.once || !fieldRef?.once) throw new Error('Drop epoch state is unavailable.');
        const [worldSnapshot, fieldSnapshot] = await Promise.all([
            worldRef.once('value'),
            fieldRef.once('value')
        ]);
        const seal = this._normalizeDropEpochSeal(
            normalizedFieldId,
            worldSnapshot?.val?.() || null,
            fieldSnapshot?.val?.() || null
        );
        return this._cacheDropEpochSeal(seal);
    }

    _detachDropNamespaceSubscription(options = {}) {
        if (this._dropNamespaceRef && this._dropNamespaceHandlers) {
            Object.entries(this._dropNamespaceHandlers).forEach(([eventName, handler]) => {
                this._dropNamespaceRef.off?.(eventName, handler);
            });
        }
        this._dropNamespaceRef = null;
        this._dropNamespaceHandlers = null;
        if (options.emitRemovals !== false) {
            Array.from(this._networkDropIds).forEach((dropId) => this.emit('dropRemoved', dropId));
            this._networkDropIds.clear();
        }
    }

    _detachDropEpochSubscription(options = {}) {
        this._dropEpochSubscriptionGeneration += 1;
        if (this._dropEpochValueHandler) {
            this._dropEpochGlobalRef?.off?.('value', this._dropEpochValueHandler);
            this._dropEpochFieldRef?.off?.('value', this._dropEpochValueHandler);
        }
        this._dropEpochGlobalRef = null;
        this._dropEpochFieldRef = null;
        this._dropEpochValueHandler = null;
        this._detachDropNamespaceSubscription(options);
    }

    _activateDropNamespaceSubscription(seal, generation) {
        if (generation !== this._dropEpochSubscriptionGeneration
            || !this.dbRef
            || seal.fieldId !== this._getCurrentFieldId()) return;
        const namespacePath = this._getDropNamespacePath(seal.fieldId, seal);
        if (!namespacePath) return;
        const nextRef = this.dbRef.child(namespacePath);
        const currentRefString = this._dropNamespaceRef?.toString?.();
        const nextRefString = nextRef?.toString?.();
        if (this._dropNamespaceRef === nextRef
            || (currentRefString && nextRefString && currentRefString === nextRefString)) return;
        this._detachDropNamespaceSubscription();
        const emitDrop = (snapshot) => {
            const value = snapshot?.val?.();
            if (!snapshot?.key || !this._isDropPayloadForEpochSeal(value, seal)) return;
            this._networkDropIds.add(snapshot.key);
            this.emit('dropAdded', { id: snapshot.key, ...value });
        };
        const removeDrop = (snapshot) => {
            if (!snapshot?.key || !this._networkDropIds.has(snapshot.key)) return;
            this._networkDropIds.delete(snapshot.key);
            this.emit('dropRemoved', snapshot.key);
        };
        this._dropNamespaceRef = nextRef;
        this._dropNamespaceHandlers = {
            child_added: emitDrop,
            child_changed: emitDrop,
            child_removed: removeDrop
        };
        Object.entries(this._dropNamespaceHandlers).forEach(([eventName, handler]) => {
            nextRef.on?.(eventName, handler);
        });
    }

    _refreshDropEpochSubscription(fieldId = this._getCurrentFieldId()) {
        if (!this.dbRef) return;
        const normalizedFieldId = this._normalizeFieldId(fieldId);
        this._detachDropEpochSubscription();
        const generation = this._dropEpochSubscriptionGeneration;
        this._dropEpochGlobalRef = this._getDropWorldGenerationRef();
        this._dropEpochFieldRef = this._getDropFieldEpochRef(normalizedFieldId);
        const refresh = () => {
            this._readDropEpochSeal(normalizedFieldId)
                .then((seal) => this._activateDropNamespaceSubscription(seal, generation))
                .catch((error) => Logger.warn('[Network] Drop epoch subscription deferred', error));
        };
        this._dropEpochValueHandler = refresh;
        this._dropEpochGlobalRef?.on?.('value', refresh);
        this._dropEpochFieldRef?.on?.('value', refresh);
        refresh();
    }

    async _advanceDropWorldGeneration() {
        const ref = this._getDropWorldGenerationRef();
        if (!ref?.transaction) return false;
        const resetAt = Math.max(1, Math.round(this.getServerNow()));
        const result = await ref.transaction((current) => ({
            schemaVersion: 1,
            epoch: Math.max(0, Math.floor(Number(current?.epoch || 0))) + 1,
            resetAt,
            resetBy: String(this.playerId || 'world_reset')
        }));
        const value = result?.snapshot?.val?.();
        if (result?.committed === false || !Number.isInteger(Number(value?.epoch))) return false;
        this._dropEpochSealCache.clear();
        this._committedDropSpawnSources.clear();
        return true;
    }

    async _advanceDropFieldEpoch(fieldId = this._getCurrentFieldId()) {
        const normalizedFieldId = this._normalizeFieldId(fieldId);
        const ref = this._getDropFieldEpochRef(normalizedFieldId);
        if (!ref?.transaction) return false;
        const resetAt = Math.max(1, Math.round(this.getServerNow()));
        const result = await ref.transaction((current) => ({
            schemaVersion: 1,
            fieldId: normalizedFieldId,
            epoch: Math.max(0, Math.floor(Number(
                current?.fieldId === normalizedFieldId ? current.epoch : 0
            ))) + 1,
            resetAt,
            resetBy: String(this.playerId || 'field_reset')
        }));
        const value = result?.snapshot?.val?.();
        if (result?.committed === false
            || value?.fieldId !== normalizedFieldId
            || !Number.isInteger(Number(value?.epoch))) return false;
        this._dropEpochSealCache.delete(normalizedFieldId);
        this._committedDropSpawnSources.clear();
        return true;
    }

    _getDropSpawnOutboxBucketKey(authorHostId = this.playerId) {
        return authorHostId ? `${this.roomId}::${authorHostId}` : null;
    }

    _getDropSpawnOutboxStorageKey(authorHostId = this.playerId) {
        const bucketKey = this._getDropSpawnOutboxBucketKey(authorHostId);
        return bucketKey
            ? `${DROP_SPAWN_OUTBOX_STORAGE_PREFIX}:${encodeURIComponent(bucketKey)}`
            : null;
    }

    _serializeDropSpawnOutboxEntry(entry) {
        if (!entry?.dropId || !entry?.payload || !entry?.authorHostId) return null;
        if (!this._getDropPayloadEpochSeal(entry.payload)) return null;
        return {
            schemaVersion: 3,
            roomId: this.roomId,
            authorHostId: entry.authorHostId,
            dropId: entry.dropId,
            queuedAt: Number(entry.queuedAt || Date.now()),
            authoredAt: Number(entry.authoredAt || 0),
            expiresAt: Number(entry.expiresAt || 0),
            payload: this._cloneProfileData(entry.payload)
        };
    }

    _isValidStoredDropSpawnOutboxEntry(stored, authorHostId = this.playerId) {
        const payload = stored?.payload;
        return !!(
            stored
            && [2, 3].includes(stored.schemaVersion)
            && stored.roomId === this.roomId
            && stored.authorHostId === authorHostId
            && typeof stored.dropId === 'string'
            && /^[A-Za-z0-9_-]{1,128}$/.test(stored.dropId)
            && Number.isFinite(Number(stored.queuedAt))
            && Number(stored.authoredAt) > 0
            && Number(stored.expiresAt) > Number(stored.authoredAt)
            && payload
            && typeof payload === 'object'
            && typeof payload.fieldId === 'string'
            && payload.fieldId
            && typeof payload.sourceRewardId === 'string'
            && payload.sourceRewardId
            && Number.isFinite(Number(payload.x))
            && Number.isFinite(Number(payload.y))
            && typeof payload.type === 'string'
            && payload.type
            && Number.isFinite(Number(payload.amount))
            && Number(payload.amount) > 0
            && (
                (stored.schemaVersion === 2
                    && payload.dropWorldEpoch === undefined
                    && payload.dropFieldEpoch === undefined)
                || (stored.schemaVersion === 3
                    && Number.isInteger(Number(payload.dropWorldEpoch))
                    && Number(payload.dropWorldEpoch) >= 0
                    && Number.isInteger(Number(payload.dropFieldEpoch))
                    && Number(payload.dropFieldEpoch) >= 0)
            )
        );
    }

    _persistDropSpawnOutbox(authorHostId = this.playerId, entries = null) {
        if (!authorHostId) return false;
        const storage = this._getDurableRewardLocalStorage();
        const storageKey = this._getDropSpawnOutboxStorageKey(authorHostId);
        if (!storage || !storageKey) return false;
        const source = Array.isArray(entries)
            ? entries
            : Array.from(this._pendingDropSpawnWrites.values());
        const serializedEntries = source
            .filter((entry) => entry?.authorHostId === authorHostId && entry.volatileOnly !== true)
            .map((entry) => this._serializeDropSpawnOutboxEntry(entry))
            .filter(Boolean);
        if (serializedEntries.length > DROP_SPAWN_OUTBOX_MAX_ENTRIES) return false;
        try {
            if (serializedEntries.length === 0) {
                storage.removeItem(storageKey);
                return true;
            }
            const serialized = JSON.stringify(serializedEntries);
            const bytes = typeof TextEncoder !== 'undefined'
                ? new TextEncoder().encode(serialized).length
                : serialized.length * 2;
            if (bytes > DROP_SPAWN_OUTBOX_MAX_BYTES) return false;
            storage.setItem(storageKey, serialized);
            source.forEach((entry) => {
                if (entry?.authorHostId === authorHostId
                    && entry.volatileOnly !== true
                    && Number(entry.authoredAt) > 0
                    && Number(entry.expiresAt) > Number(entry.authoredAt)) {
                    entry.sealedPersisted = true;
                }
            });
            return true;
        } catch (error) {
            Logger.warn('[Network] Failed to persist deterministic drop spawn outbox', error);
            return false;
        }
    }

    _removeDropSpawnOutboxEntry(entry) {
        if (!entry?.dropId) return;
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = null;
        if (this._pendingDropSpawnWrites.get(entry.dropId) === entry) {
            this._pendingDropSpawnWrites.delete(entry.dropId);
        }
        const bucketKey = this._getDropSpawnOutboxBucketKey(entry.authorHostId);
        const dormant = this._dormantDropSpawnWritesByAuthor.get(bucketKey) || [];
        const remaining = dormant.filter((candidate) => candidate?.dropId !== entry.dropId);
        if (remaining.length > 0) this._dormantDropSpawnWritesByAuthor.set(bucketKey, remaining);
        else this._dormantDropSpawnWritesByAuthor.delete(bucketKey);
        this._persistDropSpawnOutbox(entry.authorHostId);
    }

    _rememberBoundedCommit(map, key, value = true, maxEntries = 2048) {
        if (!(map instanceof Map) || !key) return;
        map.delete(key);
        map.set(key, value);
        while (map.size > maxEntries) map.delete(map.keys().next().value);
    }

    _getCommittedDropSpawnKey(dropId, fieldId, seal) {
        const normalizedFieldId = this._normalizeFieldId(fieldId);
        if (!dropId || !normalizedFieldId || !seal
            || !Number.isInteger(Number(seal.worldEpoch))
            || !Number.isInteger(Number(seal.fieldEpoch))) return null;
        return [
            normalizedFieldId,
            Number(seal.worldEpoch),
            Number(seal.fieldEpoch),
            String(dropId)
        ].join(':');
    }

    isDropSpawnDurablyAccepted(dropId, sourceRewardId, options = {}) {
        if (!dropId || !sourceRewardId) return false;
        const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());
        const seal = this._dropEpochSealCache.get(fieldId);
        const commitKey = this._getCommittedDropSpawnKey(dropId, fieldId, seal);
        return !!commitKey && this._committedDropSpawnSources.get(commitKey) === sourceRewardId;
    }

    isRewardServerCommitted(recipientId, rewardId) {
        if (!recipientId || !rewardId) return false;
        return this._serverCommittedRewardIds.has(`${recipientId}:${rewardId}`);
    }

    isRewardDeliveryPending(recipientId, rewardId) {
        if (!recipientId || !rewardId) return false;
        const normalizedRewardId = String(rewardId).slice(0, 256);
        if (this.isRewardServerCommitted(recipientId, normalizedRewardId)) return true;

        const semanticReceiptKey = this._buildNormalRewardSemanticReceiptKey(
            this.playerId,
            recipientId,
            normalizedRewardId
        );
        if (semanticReceiptKey) {
            const normalQueueKey = `${recipientId}:${semanticReceiptKey}`;
            const normalEntry = this._pendingNormalRewardWrites.get(normalQueueKey);
            if (normalEntry?.envelope?.rewardId === normalizedRewardId) return true;
        }

        for (const entry of this._pendingNormalRewardWrites.values()) {
            if (entry?.recipientId === recipientId
                && entry?.envelope?.rewardId === normalizedRewardId) return true;
        }

        for (const entry of this._pendingDurableRewardWrites.values()) {
            if (entry?.recipientId === recipientId
                && entry?.envelope?.rewardId === normalizedRewardId) return true;
        }

        for (const entry of this._queuedRewardBatches.values()) {
            if (entry?.playerId === recipientId
                && (entry?.semanticRewardId === normalizedRewardId
                    || entry?.payload?.rewardId === normalizedRewardId)) return true;
        }

        return false;
    }

    _getDropPayloadEpochSeal(payload) {
        if (!payload
            || !Number.isInteger(Number(payload.dropWorldEpoch))
            || Number(payload.dropWorldEpoch) < 0
            || !Number.isInteger(Number(payload.dropFieldEpoch))
            || Number(payload.dropFieldEpoch) < 0) return null;
        return {
            fieldId: this._normalizeFieldId(payload.fieldId),
            worldEpoch: Number(payload.dropWorldEpoch),
            fieldEpoch: Number(payload.dropFieldEpoch)
        };
    }

    async _ensureDropSpawnEpochSeal(entry) {
        const currentSeal = await this._readDropEpochSeal(entry?.payload?.fieldId);
        const authoredSeal = this._getDropPayloadEpochSeal(entry?.payload);
        if (authoredSeal) {
            return {
                ok: this._isDropPayloadForEpochSeal(entry.payload, currentSeal),
                currentSeal,
                authoredSeal
            };
        }
        const lastResetAt = Math.max(
            Number(currentSeal.worldResetAt || 0),
            Number(currentSeal.fieldResetAt || 0)
        );
        // Legacy v2 journals can migrate only if no reset happened after their
        // immutable authored timestamp. Otherwise their original epoch is
        // unknowable and the safe outcome is terminal rejection.
        if (lastResetAt > 0 && Number(entry?.authoredAt || 0) <= lastResetAt) {
            return { ok: false, currentSeal, authoredSeal: null };
        }
        entry.payload.dropWorldEpoch = currentSeal.worldEpoch;
        entry.payload.dropFieldEpoch = currentSeal.fieldEpoch;
        entry.sealedPersisted = false;
        return {
            ok: true,
            currentSeal,
            authoredSeal: this._getDropPayloadEpochSeal(entry.payload)
        };
    }

    async _terminalizeStaleDropEpochWrite(entry, ref = null) {
        if (!entry) return false;
        const authoredSeal = this._getDropPayloadEpochSeal(entry.payload);
        const dropRef = ref || (authoredSeal
            ? this._getDropRecordRef(entry.dropId, entry.payload.fieldId, authoredSeal)
            : null);
        if (dropRef?.transaction) {
            try {
                await dropRef.transaction((current) => {
                    if (!current
                        || current.sourceRewardId !== entry.payload.sourceRewardId
                        || this._normalizeFieldId(current.fieldId)
                            !== this._normalizeFieldId(entry.payload.fieldId)) return;
                    const currentAuthoredSeal = this._getDropPayloadEpochSeal(current);
                    if (authoredSeal && currentAuthoredSeal
                        && (authoredSeal.worldEpoch !== currentAuthoredSeal.worldEpoch
                            || authoredSeal.fieldEpoch !== currentAuthoredSeal.fieldEpoch)) return;
                    return null;
                });
            } catch (error) {
                Logger.warn(`[Network] Stale drop epoch cleanup deferred for ${entry.dropId}`, error);
            }
        }
        this._removeDropSpawnOutboxEntry(entry);
        return true;
    }

    _scheduleDropSpawnWrite(entry) {
        if (!entry
            || this._pendingDropSpawnWrites.get(entry.dropId) !== entry
            || entry.authorHostId !== this.playerId
            || entry.timer) return;
        const delay = this._getDurableRewardRetryDelay(entry.attempt);
        entry.attempt += 1;
        entry.timer = setTimeout(() => {
            entry.timer = null;
            this._attemptDropSpawnWrite(entry);
        }, delay);
    }

    async _terminalizeExpiredDropSpawnWrite(entry, ref = null) {
        if (!entry
            || this._pendingDropSpawnWrites.get(entry.dropId) !== entry
            || entry.authorHostId !== this.playerId
            || !this.dbRef) return false;
        const authoredSeal = this._getDropPayloadEpochSeal(entry.payload);
        const dropRef = ref || this._getDropRecordRef(
            entry.dropId,
            entry.payload.fieldId,
            authoredSeal
        );
        if (!dropRef?.transaction) return false;
        const expiredAt = Math.max(Number(entry.expiresAt || 0), Math.round(this.getServerNow()));
        try {
            const result = await dropRef.transaction((current) => {
                if (!current) return;
                const sameSource = current.sourceRewardId === entry.payload.sourceRewardId
                    && this._normalizeFieldId(current.fieldId)
                        === this._normalizeFieldId(entry.payload.fieldId);
                if (!sameSource || current.claimStatus === 'settled') return;
                return this._buildExpiredDropTombstone(entry.dropId, current, expiredAt);
            });
            const value = result?.snapshot?.val?.();
            const sameSource = value?.sourceRewardId === entry.payload.sourceRewardId
                && this._normalizeFieldId(value?.fieldId)
                    === this._normalizeFieldId(entry.payload.fieldId);
            if (!value
                || !sameSource
                || (value.claimStatus === 'settled' && !!value.claimId)) {
                this._removeDropSpawnOutboxEntry(entry);
                return true;
            }
        } catch (error) {
            Logger.warn(`[Network] Expired deterministic drop tombstone will retry for ${entry.dropId}`, error);
        }
        this._scheduleDropSpawnWrite(entry);
        return false;
    }

    async _attemptDropSpawnWrite(entry) {
        if (!entry
            || this._pendingDropSpawnWrites.get(entry.dropId) !== entry
            || entry.authorHostId !== this.playerId) return false;
        if (!this.dbRef) {
            this._scheduleDropSpawnWrite(entry);
            return false;
        }
        try {
            if (!await this._ensureDurableRewardServerTime()) {
                this._scheduleDropSpawnWrite(entry);
                return false;
            }
            const serverNow = Math.max(1, Math.round(this.getServerNow()));
            if (!(Number(entry.authoredAt) > 0) || !(Number(entry.expiresAt) > Number(entry.authoredAt))) {
                entry.authoredAt = serverNow;
                entry.expiresAt = serverNow + DROP_SPAWN_OUTBOX_TTL_MS;
                entry.payload.authoredAt = entry.authoredAt;
                entry.payload.expiresAt = entry.expiresAt;
            }
            const epochAdmission = await this._ensureDropSpawnEpochSeal(entry);
            if (!epochAdmission.ok) {
                return this._terminalizeStaleDropEpochWrite(entry);
            }
            // A persistent journal must be durably sealed with an authoritative
            // expiry before the Firebase write. Keep this flag separate from
            // in-memory timestamps so a failed second setItem is never mistaken
            // for crash-safe admission.
            if (entry.volatileOnly !== true && entry.sealedPersisted !== true) {
                if (!this._persistDropSpawnOutbox(entry.authorHostId)) {
                    const volatileCount = Array.from(this._pendingDropSpawnWrites.values())
                        .filter((candidate) => candidate !== entry && candidate?.volatileOnly === true)
                        .length;
                    if (volatileCount >= 16) {
                        this._scheduleDropSpawnWrite(entry);
                        return false;
                    }
                    // localStorage can be unavailable in private browsing or
                    // under quota pressure. A shared epoch-scoped transaction is
                    // still durable and the dead-monster snapshot retains the
                    // deterministic intent for host handoff, so degrade to one
                    // bounded volatile writer instead of deadlocking the field.
                    entry.volatileOnly = true;
                    entry.sealedPersisted = false;
                    this.emit('dropDeliveryDegraded', {
                        dropId: entry.dropId,
                        sourceRewardId: entry.payload?.sourceRewardId || null,
                        reason: 'drop_outbox_storage_unavailable'
                    });
                }
            }
            const ref = this._getDropRecordRef(
                entry.dropId,
                entry.payload.fieldId,
                epochAdmission.authoredSeal
            );
            if (!ref?.transaction) {
                this._scheduleDropSpawnWrite(entry);
                return false;
            }
            if (serverNow >= Number(entry.expiresAt)) {
                return this._terminalizeExpiredDropSpawnWrite(entry, ref);
            }
            const commitTimestamp = window.firebase?.database?.ServerValue?.TIMESTAMP
                ?? serverNow;
            const visiblePayload = {
                ...entry.payload,
                // Drop lifetime starts when the node first becomes visible, not
                // when its durable outbox entry was created during an outage.
                // Firebase resolves ServerValue.TIMESTAMP at the actual commit,
                // including a transaction that remained pending while offline.
                ts: commitTimestamp
            };
            let transactionExpired = false;
            const result = await ref.transaction((current) => {
                // Firebase may re-run this callback after a connection has been
                // suspended for weeks. The visible timestamp is intentionally
                // commit-time based, but the immutable authoring epoch is not:
                // once the 30-day outbox lease has elapsed this source must
                // never recreate a drop whose 31-day settled tombstone was
                // already pruned.
                if (Math.round(this.getServerNow()) >= Number(entry.expiresAt)) {
                    transactionExpired = true;
                    return;
                }
                return current ? undefined : visiblePayload;
            });
            if (transactionExpired || Math.round(this.getServerNow()) >= Number(entry.expiresAt)) {
                return this._terminalizeExpiredDropSpawnWrite(entry, ref);
            }
            const postCommitSeal = await this._readDropEpochSeal(entry.payload.fieldId);
            if (!this._isDropPayloadForEpochSeal(entry.payload, postCommitSeal)) {
                return this._terminalizeStaleDropEpochWrite(entry, ref);
            }
            const value = result?.snapshot?.val?.();
            if (value?.sourceRewardId === entry.payload.sourceRewardId
                && this._normalizeFieldId(value.fieldId) === this._normalizeFieldId(entry.payload.fieldId)
                && this._isDropPayloadForEpochSeal(value, postCommitSeal)
                && (!(Number(value.expiresAt) > 0)
                    || Math.round(this.getServerNow()) < Number(value.expiresAt))) {
                if (this._normalizeFieldId(value.fieldId) === this._normalizeFieldId(this._getCurrentFieldId())) {
                    this._networkDropIds.add(entry.dropId);
                    this.emit('dropAdded', { id: entry.dropId, ...this._cloneProfileData(value) });
                }
                this._rememberBoundedCommit(
                    this._committedDropSpawnSources,
                    this._getCommittedDropSpawnKey(
                        entry.dropId,
                        entry.payload.fieldId,
                        postCommitSeal
                    ),
                    entry.payload.sourceRewardId
                );
                this._removeDropSpawnOutboxEntry(entry);
                return true;
            }
            if (value) {
                Logger.error(`[Network] Deterministic drop id collision for ${entry.dropId}`);
                this._removeDropSpawnOutboxEntry(entry);
                return false;
            }
        } catch (error) {
            Logger.warn(`[Network] Deterministic drop spawn will retry for ${entry.dropId}`, error);
        }
        this._scheduleDropSpawnWrite(entry);
        return false;
    }

    _enqueueDropSpawnWrite(dropId, payload) {
        if (!dropId || !payload || !this.playerId || !this.dbRef) return false;
        const existing = this._pendingDropSpawnWrites.get(dropId);
        if (existing) {
            if (existing.payload?.sourceRewardId !== payload.sourceRewardId) {
                Logger.error(`[Network] Refusing conflicting deterministic drop payload ${dropId}`);
                return false;
            }
            this._attemptDropSpawnWrite(existing);
            return true;
        }
        const entries = Array.from(this._pendingDropSpawnWrites.values());
        const persistentCount = entries.filter((entry) => entry?.volatileOnly !== true).length;
        const volatileCount = entries.length - persistentCount;
        if (persistentCount >= DROP_SPAWN_OUTBOX_MAX_ENTRIES && volatileCount >= 16) {
            Logger.error('[Network] Deterministic drop spawn outbox is full');
            return false;
        }
        const entry = {
            dropId,
            payload: this._cloneProfileData(payload),
            authorHostId: this.playerId,
            queuedAt: Date.now(),
            authoredAt: 0,
            expiresAt: 0,
            sealedPersisted: false,
            attempt: 0,
            timer: null,
            volatileOnly: persistentCount >= DROP_SPAWN_OUTBOX_MAX_ENTRIES
        };
        this._pendingDropSpawnWrites.set(dropId, entry);
        // Do not admit the journal to localStorage until an authoritative
        // world+field epoch has been read and sealed by _attemptDropSpawnWrite.
        this._attemptDropSpawnWrite(entry);
        return true;
    }

    _clearDropSpawnRuntime() {
        const authorHostId = this.playerId;
        const entries = Array.from(this._pendingDropSpawnWrites.values());
        entries.forEach((entry) => {
            if (entry?.timer) clearTimeout(entry.timer);
            if (entry) entry.timer = null;
        });
        if (authorHostId && entries.length > 0) {
            this._persistDropSpawnOutbox(authorHostId, entries);
            const bucketKey = this._getDropSpawnOutboxBucketKey(authorHostId);
            const merged = new Map();
            [
                ...(this._dormantDropSpawnWritesByAuthor.get(bucketKey) || []),
                ...entries
            ].forEach((entry) => {
                if (entry?.dropId && entry.authorHostId === authorHostId) merged.set(entry.dropId, entry);
            });
            this._dormantDropSpawnWritesByAuthor.set(bucketKey, Array.from(merged.values()));
        }
        this._pendingDropSpawnWrites.clear();
    }

    _restoreDropSpawnOutbox() {
        const authorHostId = this.playerId;
        const bucketKey = this._getDropSpawnOutboxBucketKey(authorHostId);
        if (!authorHostId || !bucketKey) return 0;
        const candidates = [];
        const dormant = this._dormantDropSpawnWritesByAuthor.get(bucketKey) || [];
        this._dormantDropSpawnWritesByAuthor.delete(bucketKey);
        dormant.forEach((entry) => {
            const stored = this._serializeDropSpawnOutboxEntry(entry);
            if (stored) candidates.push({ stored, volatileOnly: entry.volatileOnly === true });
        });
        const storage = this._getDurableRewardLocalStorage();
        const storageKey = this._getDropSpawnOutboxStorageKey(authorHostId);
        if (storage && storageKey) {
            try {
                const legacyStorageKeys = LEGACY_DROP_SPAWN_OUTBOX_STORAGE_PREFIXES.map((prefix) => (
                    `${prefix}:${encodeURIComponent(bucketKey)}`
                ));
                [storageKey, ...legacyStorageKeys].forEach((candidateKey) => {
                    const parsed = JSON.parse(storage.getItem(candidateKey) || '[]');
                    if (!Array.isArray(parsed)) return;
                    parsed.slice(-DROP_SPAWN_OUTBOX_MAX_ENTRIES).forEach((stored) => {
                        candidates.push({ stored, volatileOnly: false });
                    });
                });
            } catch (error) {
                Logger.warn('[Network] Ignoring unreadable deterministic drop spawn outbox', error);
            }
        }
        candidates.slice(-(DROP_SPAWN_OUTBOX_MAX_ENTRIES + 16)).forEach(({ stored, volatileOnly }) => {
            if (!this._isValidStoredDropSpawnOutboxEntry(stored, authorHostId)
                || this._pendingDropSpawnWrites.has(stored.dropId)) return;
            this._pendingDropSpawnWrites.set(stored.dropId, {
                dropId: stored.dropId,
                payload: this._cloneProfileData(stored.payload),
                authorHostId,
                queuedAt: Number(stored.queuedAt),
                authoredAt: Number(stored.authoredAt || 0),
                expiresAt: Number(stored.expiresAt || 0),
                sealedPersisted: true,
                attempt: 0,
                timer: null,
                volatileOnly
            });
        });
        this._persistDropSpawnOutbox(authorHostId);
        this._pendingDropSpawnWrites.forEach((entry) => this._attemptDropSpawnWrite(entry));
        return this._pendingDropSpawnWrites.size;
    }

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
            sourceRewardId: typeof data.sourceRewardId === 'string' ? data.sourceRewardId.slice(0, 256) : null,
            fieldId,
            ts: Date.now()
        };
        if (this.shouldUseMonsterQuietMode() && data.forceNetwork !== true) {
            const id = data.id || `drop_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            this._recordNetworkWrite('dropSpawnLocal', { id, ...payload });
            this.emit('dropAdded', { id, ...payload });
            this._markNetworkActivity(payload.ts);
            return id;
        }
        if (data.id) {
            const requestedId = String(data.id);
            const id = /^[A-Za-z0-9_-]{1,128}$/.test(requestedId)
                ? requestedId
                : `drop_${this._hashDurableRewardCatalogValue(requestedId).replace('fnv1a32_', '')}`;
            payload.sourceRewardId = payload.sourceRewardId
                || `drop_source_v1:${this._hashDurableRewardCatalogValue(`${fieldId}:${id}`)}`;
            if (this.isDropSpawnDurablyAccepted(id, payload.sourceRewardId, { fieldId })) return id;
            this._recordNetworkWrite('dropSpawn', { id, ...payload });
            if (!this._enqueueDropSpawnWrite(id, payload)) return null;
            this._networkDropIds.add(id);
            return id;
        }
        const generatedKey = this.dbRef.child(DROP_NAMESPACE_PATH).push?.()?.key
            || `drop_${this._hashDurableRewardCatalogValue(`${fieldId}:${Date.now()}:${Math.random()}`).replace('fnv1a32_', '')}`;
        const id = /^[A-Za-z0-9_-]{1,128}$/.test(String(generatedKey || ''))
            ? String(generatedKey)
            : `drop_${this._hashDurableRewardCatalogValue(String(generatedKey)).replace('fnv1a32_', '')}`;
        payload.sourceRewardId = payload.sourceRewardId
            || `drop_source_v1:${this._hashDurableRewardCatalogValue(`${fieldId}:${id}`)}`;
        this._recordNetworkWrite('dropSpawn', { id, ...payload });
        if (!this._enqueueDropSpawnWrite(id, payload)) return null;
        this._networkDropIds.add(id);
        return id;
    }

    removeDrop(id, options = {}) {
        if (!this.connected || !this.isHost) return;
        if (this.shouldUseMonsterQuietMode() && !this._networkDropIds.has(id)) {
            this._recordNetworkWrite('dropRemoveLocal', { id });
            this.emit('dropRemoved', id);
            this._markNetworkActivity();
            return Promise.resolve(true);
        }
        this._networkDropIds.delete(id);
        const fieldId = this._getCurrentFieldId();
        return this._readDropEpochSeal(fieldId)
            .then((seal) => {
                const observedSeal = Number.isInteger(Number(options.dropWorldEpoch))
                    && Number.isInteger(Number(options.dropFieldEpoch))
                    ? {
                        fieldId: this._normalizeFieldId(fieldId),
                        worldEpoch: Number(options.dropWorldEpoch),
                        fieldEpoch: Number(options.dropFieldEpoch)
                    }
                    : seal;
                if (observedSeal.worldEpoch !== seal.worldEpoch
                    || observedSeal.fieldEpoch !== seal.fieldEpoch) return true;
                const ref = this._getDropRecordRef(id, fieldId, observedSeal);
                if (options.expired !== true) return ref?.remove?.() || false;
                if (!ref?.transaction) return false;
                const expiredAt = Math.max(1, Math.round(this.getServerNow()));
                return ref.transaction((current) => {
                    if (!current || !this._isDropPayloadForEpochSeal(current, observedSeal)) return;
                    if (current.claimStatus === 'settled') return;
                    return this._buildExpiredDropTombstone(id, current, expiredAt);
                }).then((result) => result?.snapshot?.val?.()?.claimStatus === 'settled');
            })
            .catch((error) => {
                Logger.warn(`[Network] Drop removal will retry through field hydration for ${id}`, error);
                return false;
            });
    }

    async publishDropSnapshot(id, data) {
        if (!this.connected || !this.isHost || !this.dbRef || !id || !data) return Promise.resolve(false);
        const fieldId = this._getCurrentFieldId();
        let currentSeal;
        try {
            currentSeal = await this._readDropEpochSeal(fieldId);
        } catch (error) {
            return false;
        }
        const authoredSeal = this._getDropPayloadEpochSeal(data);
        const lastResetAt = Math.max(currentSeal.worldResetAt, currentSeal.fieldResetAt);
        const sourceAuthoredAt = Math.max(0, Number(data.authoredAt || data.sourceAuthoredAt || 0));
        if ((authoredSeal && !this._isDropPayloadForEpochSeal(data, currentSeal))
            || (!authoredSeal && lastResetAt > 0 && sourceAuthoredAt <= lastResetAt)) return false;
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
            sourceRewardId: typeof data.sourceRewardId === 'string' ? data.sourceRewardId.slice(0, 256) : null,
            authoredAt: Math.max(0, Number(data.authoredAt || data.sourceAuthoredAt || 0)),
            expiresAt: Math.max(0, Number(data.expiresAt || data.sourceExpiresAt || 0)),
            fieldId,
            dropWorldEpoch: currentSeal.worldEpoch,
            dropFieldEpoch: currentSeal.fieldEpoch,
            ts: Number(data.ts || data.spawnedAt || Date.now())
        };
        this._recordNetworkWrite('dropPublish', payload);
        this._networkDropIds.add(id);
        const ref = this._getDropRecordRef(id, fieldId, currentSeal);
        if (!ref?.transaction) return false;
        return ref.transaction((current) => {
            // Never let a handoff snapshot overwrite a collection claim that
            // another host has already won. Claimed drops are resumed by the
            // destination host with deterministic reward receipts.
            if ((current?.claimStatus === 'claimed' || current?.claimStatus === 'settled')
                && current?.claimId) return;
            return payload;
        })
            .then((result) => {
                const value = result?.snapshot?.val?.();
                return result?.committed === true
                    || (value?.claimStatus === 'claimed'
                        && !!value?.claimId
                        && this._isDropPayloadForEpochSeal(value, currentSeal));
            })
            .catch(() => false);
    }

    _buildDropClaimId(dropId, fieldId = this._getCurrentFieldId(), seal = null) {
        if (!dropId || !fieldId) return null;
        const identity = [
            this._normalizeFieldId(fieldId),
            Number(seal?.worldEpoch || 0),
            Number(seal?.fieldEpoch || 0),
            String(dropId)
        ].join(':');
        return `drop_claim_v1:${this._hashDurableRewardCatalogValue(identity)}`;
    }

    _buildExpiredDropTombstone(dropId, current, settledAt = this.getServerNow()) {
        const identity = `${this._normalizeFieldId(current?.fieldId)}:${String(dropId)}:${current?.sourceRewardId || ''}`;
        return {
            fieldId: this._normalizeFieldId(current?.fieldId),
            sourceRewardId: current?.sourceRewardId || null,
            dropWorldEpoch: Math.max(0, Math.floor(Number(current?.dropWorldEpoch || 0))),
            dropFieldEpoch: Math.max(0, Math.floor(Number(current?.dropFieldEpoch || 0))),
            authoredAt: Math.max(0, Number(current?.authoredAt || 0)),
            expiresAt: Math.max(0, Number(current?.expiresAt || 0)),
            claimStatus: 'settled',
            claimId: `drop_expired_v1:${this._hashDurableRewardCatalogValue(identity)}`,
            claimedBy: '__expired__',
            settledAt: Math.max(1, Math.round(Number(settledAt) || this.getServerNow()))
        };
    }

    async claimDropForSettlement(dropId, collectorId, options = {}) {
        if (!this.connected || !this.isHost || !this.dbRef || !dropId || !collectorId) {
            return { ok: false, reason: 'drop_claim_unavailable' };
        }
        const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());
        const observedSeal = Number.isInteger(Number(options.dropWorldEpoch))
            && Number(options.dropWorldEpoch) >= 0
            && Number.isInteger(Number(options.dropFieldEpoch))
            && Number(options.dropFieldEpoch) >= 0
            ? {
                fieldId,
                worldEpoch: Number(options.dropWorldEpoch),
                fieldEpoch: Number(options.dropFieldEpoch)
            }
            : null;
        if (!observedSeal) {
            return { ok: false, terminal: true, reason: 'missing_drop_epoch' };
        }

        const fallbackDrop = options.drop && typeof options.drop === 'object'
            ? this._cloneProfileData(options.drop)
            : null;
        if (this.shouldUseMonsterQuietMode() && !this._networkDropIds.has(dropId)) {
            const claimId = this._buildDropClaimId(dropId, fieldId, observedSeal);
            return fallbackDrop
                ? {
                    ok: true,
                    localOnly: true,
                    claimId,
                    claimedBy: collectorId,
                    drop: { ...fallbackDrop, fieldId }
                }
                : { ok: false, reason: 'local_drop_missing' };
        }

        try {
            if (!await this._ensureDurableRewardServerTime()) {
                return { ok: false, reason: 'server_time_unavailable' };
            }
            const epochSeal = await this._readDropEpochSeal(fieldId);
            if (observedSeal.worldEpoch !== epochSeal.worldEpoch
                || observedSeal.fieldEpoch !== epochSeal.fieldEpoch) {
                return { ok: false, terminal: true, reason: 'stale_drop_epoch' };
            }
            const claimId = this._buildDropClaimId(dropId, fieldId, epochSeal);
            if (!claimId) return { ok: false, reason: 'invalid_drop_claim' };
            const claimedAt = Math.max(1, Math.round(this.getServerNow()));
            const ref = this._getDropRecordRef(dropId, fieldId, epochSeal);
            if (!ref?.transaction) return { ok: false, reason: 'drop_claim_unavailable' };
            const result = await ref.transaction((current) => {
                if (!current || this._normalizeFieldId(current.fieldId) !== fieldId) return;
                if (!this._isDropPayloadForEpochSeal(current, epochSeal)) return;
                if (current.claimStatus === 'settled') return;
                if (current.claimStatus === 'claimed') {
                    return;
                }
                const visibleAt = Number(current.ts);
                const visibleExpiresAt = Number.isFinite(visibleAt) && visibleAt > 0
                    ? visibleAt + DROP_VISIBLE_TTL_MS
                    : 0;
                if (!visibleExpiresAt
                    || claimedAt >= visibleExpiresAt
                    || (Number(current.expiresAt) > 0 && claimedAt >= Number(current.expiresAt))) {
                    return this._buildExpiredDropTombstone(dropId, current, claimedAt);
                }
                const eligibleIds = Array.isArray(current.eligibleCollectorIds)
                    ? current.eligibleCollectorIds.filter(Boolean)
                    : [];
                const collectorAllowed = eligibleIds.length > 0
                    ? eligibleIds.includes(collectorId)
                    : (!current.ownerId
                        || current.ownerId === collectorId
                        || (Array.isArray(current.partyMembers) && current.partyMembers.includes(collectorId)));
                if (!collectorAllowed) return;
                return {
                    ...current,
                    claimStatus: 'claimed',
                    claimId,
                    claimedBy: collectorId,
                    claimedAt
                };
            });
            const value = result?.snapshot?.val?.();
            const postClaimSeal = await this._readDropEpochSeal(fieldId);
            if (postClaimSeal.worldEpoch !== epochSeal.worldEpoch
                || postClaimSeal.fieldEpoch !== epochSeal.fieldEpoch) {
                return { ok: false, terminal: true, reason: 'drop_reset_epoch_changed' };
            }
            if (value?.claimStatus === 'settled') {
                return { ok: false, terminal: true, reason: 'drop_already_settled' };
            }
            if (!value
                || value.claimStatus !== 'claimed'
                || value.claimId !== claimId
                || this._normalizeFieldId(value.fieldId) !== fieldId
                || !this._isDropPayloadForEpochSeal(value, epochSeal)
                || typeof value.claimedBy !== 'string'
                || !value.claimedBy) {
                if (!value) return { ok: false, terminal: true, reason: 'drop_missing' };
                const eligibleIds = Array.isArray(value.eligibleCollectorIds)
                    ? value.eligibleCollectorIds.filter(Boolean)
                    : [];
                const collectorAllowed = eligibleIds.length > 0
                    ? eligibleIds.includes(collectorId)
                    : (!value.ownerId
                        || value.ownerId === collectorId
                        || (Array.isArray(value.partyMembers) && value.partyMembers.includes(collectorId)));
                return {
                    ok: false,
                    terminal: this._normalizeFieldId(value.fieldId) !== fieldId
                        || value.claimStatus === 'claimed'
                        || !collectorAllowed,
                    reason: 'drop_claim_rejected'
                };
            }
            return {
                ok: true,
                localOnly: false,
                claimId,
                claimedBy: value.claimedBy,
                drop: this._cloneProfileData(value)
            };
        } catch (error) {
            Logger.warn(`[Network] Drop claim will retry for ${dropId}`, error);
            return { ok: false, reason: 'drop_claim_failed' };
        }
    }

    async finalizeDropSettlement(dropId, claimId, options = {}) {
        if (!dropId || !claimId) return false;
        if (options.localOnly === true) {
            this.removeDrop(dropId);
            return true;
        }
        if (!this.connected || !this.isHost || !this.dbRef) return false;
        try {
            const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());
            const currentSeal = await this._readDropEpochSeal(fieldId);
            const requestedSeal = Number.isInteger(Number(options.dropWorldEpoch))
                && Number(options.dropWorldEpoch) >= 0
                && Number.isInteger(Number(options.dropFieldEpoch))
                && Number(options.dropFieldEpoch) >= 0
                ? {
                    fieldId,
                    worldEpoch: Number(options.dropWorldEpoch),
                    fieldEpoch: Number(options.dropFieldEpoch)
                }
                : currentSeal;
            if (requestedSeal.worldEpoch !== currentSeal.worldEpoch
                || requestedSeal.fieldEpoch !== currentSeal.fieldEpoch) {
                // The reward receipt is already shared-committed before this
                // method is called. A reset makes the old namespace permanently
                // unreachable, so finalization is terminally superseded rather
                // than retryable. Best-effort sealing keeps old data tidy but a
                // cleanup outage must never create an infinite reward retry.
                const staleRef = this._getDropRecordRef(dropId, fieldId, requestedSeal);
                if (staleRef?.transaction) {
                    try {
                        await staleRef.transaction((current) => {
                            if (!current) return;
                            if (current.claimStatus === 'settled'
                                && current.claimId === claimId) return;
                            if (current.claimStatus !== 'claimed'
                                || current.claimId !== claimId
                                || !this._isDropPayloadForEpochSeal(current, requestedSeal)) return;
                            return {
                                fieldId: current.fieldId,
                                sourceRewardId: current.sourceRewardId || null,
                                dropWorldEpoch: requestedSeal.worldEpoch,
                                dropFieldEpoch: requestedSeal.fieldEpoch,
                                authoredAt: Math.max(0, Number(current.authoredAt || 0)),
                                expiresAt: Math.max(0, Number(current.expiresAt || 0)),
                                claimStatus: 'settled',
                                claimId,
                                claimedBy: current.claimedBy,
                                settledAt: Math.max(
                                    Number(current.claimedAt || 0),
                                    Math.round(this.getServerNow())
                                )
                            };
                        });
                    } catch (cleanupError) {
                        Logger.warn(`[Network] Superseded drop cleanup deferred for ${dropId}`, cleanupError);
                    }
                }
                this._networkDropIds.delete(dropId);
                return true;
            }
            const ref = this._getDropRecordRef(dropId, fieldId, requestedSeal);
            if (!ref?.transaction) return false;
            const result = await ref.transaction((current) => {
                if (!current) return;
                if (current.claimStatus !== 'claimed'
                    || current.claimId !== claimId
                    || !this._isDropPayloadForEpochSeal(current, requestedSeal)) return;
                return {
                    fieldId: current.fieldId,
                    sourceRewardId: current.sourceRewardId || null,
                    dropWorldEpoch: requestedSeal.worldEpoch,
                    dropFieldEpoch: requestedSeal.fieldEpoch,
                    authoredAt: Math.max(0, Number(current.authoredAt || 0)),
                    expiresAt: Math.max(0, Number(current.expiresAt || 0)),
                    claimStatus: 'settled',
                    claimId,
                    claimedBy: current.claimedBy,
                    settledAt: Math.max(Number(current.claimedAt || 0), Math.round(this.getServerNow()))
                };
            });
            const value = result?.snapshot?.val?.();
            if (value?.claimStatus === 'settled'
                && value?.claimId === claimId
                && this._isDropPayloadForEpochSeal(value, requestedSeal)) {
                this._networkDropIds.delete(dropId);
                const localNow = Date.now();
                if (localNow - this._lastDropSettlementPruneTs > 60 * 60 * 1000) {
                    this._lastDropSettlementPruneTs = localNow;
                    this._pruneSettledDropTombstones();
                }
                return true;
            }
            return false;
        } catch (error) {
            Logger.warn(`[Network] Drop settlement finalization will retry for ${dropId}`, error);
            return false;
        }
    }

    async _pruneSettledDropTombstones() {
        if (!this.connected || !this.isHost || !this.dbRef) return 0;
        try {
            if (!await this._ensureDurableRewardServerTime()) return 0;
            const cutoff = Math.round(this.getServerNow()) - DROP_SETTLEMENT_TOMBSTONE_TTL_MS;
            const fieldId = this._getCurrentFieldId();
            const seal = await this._readDropEpochSeal(fieldId);
            const namespacePath = this._getDropNamespacePath(fieldId, seal);
            if (!namespacePath) return 0;
            const snapshot = await this.dbRef.child(namespacePath).once('value');
            const updates = {};
            snapshot?.forEach?.((child) => {
                if (Object.keys(updates).length >= 400) return;
                const value = child?.val?.();
                if (value?.claimStatus === 'settled'
                    && Number.isFinite(Number(value.settledAt))
                    && Number(value.settledAt) < cutoff) {
                    updates[`${namespacePath}/${child.key}`] = null;
                }
            });
            if (Object.keys(updates).length > 0) await this.dbRef.update(updates);
            return Object.keys(updates).length;
        } catch (error) {
            Logger.warn('[Network] Settled drop tombstone pruning deferred', error);
            return 0;
        }
    }

    ackDropCollectionRequest(requestId) {
        if (!requestId || !this.dbRef) return Promise.resolve(false);
        return this.dbRef.child(`drop_collection/${requestId}`).remove()
            .then(() => true)
            .catch(() => false);
    }

    collectDrop(dropId, options = {}) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return false;
        const fieldId = this._getCurrentFieldId();
        const dropWorldEpoch = Number(options.dropWorldEpoch);
        const dropFieldEpoch = Number(options.dropFieldEpoch);
        if (!Number.isInteger(dropWorldEpoch) || dropWorldEpoch < 0
            || !Number.isInteger(dropFieldEpoch) || dropFieldEpoch < 0) return false;
        if (this.isHost && this.shouldUseMonsterQuietMode()) {
            const payload = {
                dropId,
                collectorId: this.playerId,
                fieldId,
                dropWorldEpoch,
                dropFieldEpoch
            };
            this._recordNetworkWrite('dropCollectLocal', payload);
            this.emit('dropCollectionRequested', payload);
            this._markNetworkActivity();
            return true;
        }
        // Request collection: { did: dropId, cid: collectorId }
        const payload = {
            did: dropId,
            cid: this.playerId,
            fieldId,
            dropWorldEpoch,
            dropFieldEpoch,
            ts: Date.now()
        };
        this._recordNetworkWrite('dropCollect', payload);
        try {
            const write = this.dbRef.child('drop_collection').push(payload);
            return Promise.resolve(write)
                .then(() => true)
                .catch((error) => {
                    Logger.warn(`[Network] Drop collection request will retry locally for ${dropId}`, error);
                    return false;
                });
        } catch (error) {
            Logger.warn(`[Network] Drop collection request failed for ${dropId}`, error);
            return false;
        }
    }

    _getQuestBossStateKey(fieldId = this._getCurrentFieldId()) {
        const normalizedFieldId = this._normalizeFieldId(fieldId);
        return normalizedFieldId
            ? `field_${this._hashDurableRewardCatalogValue(normalizedFieldId).replace('fnv1a32_', '')}`
            : null;
    }

    _getQuestBossStateRef(fieldId = this._getCurrentFieldId()) {
        const key = this._getQuestBossStateKey(fieldId);
        return key ? this.dbRef?.child?.(`${QUEST_BOSS_STATE_PATH}/${key}`) : null;
    }

    async _resetQuestBossState(fieldId = this._getCurrentFieldId()) {
        const normalizedFieldId = this._normalizeFieldId(fieldId);
        const ref = this._getQuestBossStateRef(normalizedFieldId);
        if (!ref || typeof ref.transaction !== 'function') return false;
        try {
            const resetAt = Math.max(1, Math.round(this.getServerNow()));
            const result = await ref.transaction((current) => {
                const validCurrent = current
                    && current.schemaVersion === 1
                    && current.fieldId === normalizedFieldId
                    && current.bossTypeId === 'king_slime';
                return {
                    schemaVersion: 1,
                    fieldId: normalizedFieldId,
                    zoneId: 'zone_1',
                    bossTypeId: 'king_slime',
                    bossInstanceId: null,
                    generation: validCurrent
                        ? Math.max(0, Math.floor(Number(current.generation || 0)))
                        : 0,
                    resetEpoch: validCurrent
                        ? Math.max(0, Math.floor(Number(current.resetEpoch || 0))) + 1
                        : 1,
                    cycle: 'intro',
                    status: 'reset',
                    requestedBy: String(this.playerId || 'world_reset'),
                    requestId: null,
                    spawnedAt: 0,
                    defeatedAt: resetAt,
                    resetAt
                };
            });
            const state = result?.snapshot?.val?.();
            return result?.committed !== false
                && state?.status === 'reset'
                && state?.fieldId === normalizedFieldId
                && Number(state.resetEpoch) > 0;
        } catch (error) {
            Logger.error(`[Network] Failed to reset quest boss state for ${normalizedFieldId}`, error);
            return false;
        }
    }

    async _resetAllQuestBossStates() {
        if (!this.dbRef?.child) return false;
        try {
            const snapshot = await this.dbRef.child(QUEST_BOSS_STATE_PATH).once('value');
            const fieldIds = [];
            snapshot?.forEach?.((childSnapshot) => {
                const value = childSnapshot?.val?.();
                if (typeof value?.fieldId === 'string' && value.fieldId) fieldIds.push(value.fieldId);
            });
            if (fieldIds.length === 0) return true;
            const results = await Promise.all(Array.from(new Set(fieldIds)).map((fieldId) => (
                this._resetQuestBossState(fieldId)
            )));
            return results.every(Boolean);
        } catch (error) {
            Logger.error('[Network] Failed to enumerate quest boss states for reset', error);
            return false;
        }
    }

    async claimQuestBossSpawn(options = {}) {
        if (!this.connected || !this.isHost || !this.dbRef) {
            return { ok: false, reason: 'quest_boss_claim_unavailable' };
        }
        const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());
        const ref = this._getQuestBossStateRef(fieldId);
        if (!ref || !fieldId.startsWith('zone_1')) {
            return { ok: false, reason: 'invalid_quest_boss_field' };
        }
        try {
            if (!await this._ensureDurableRewardServerTime()) {
                return { ok: false, reason: 'server_time_unavailable' };
            }
            const now = Math.max(1, Math.round(this.getServerNow()));
            const result = await ref.transaction((current) => {
                const validCurrent = current
                    && current.schemaVersion === 1
                    && current.fieldId === fieldId
                    && current.bossTypeId === 'king_slime';
                if (validCurrent && current.status === 'alive' && current.bossInstanceId) return;
                const generation = validCurrent
                    ? Math.max(1, Math.floor(Number(current.generation || 0)) + 1)
                    : 1;
                const resetEpoch = validCurrent
                    ? Math.max(0, Math.floor(Number(current.resetEpoch || 0)))
                    : 0;
                const identity = `${fieldId}:king_slime:${resetEpoch}:${generation}`;
                const primary = this._hashDurableRewardCatalogValue(identity).replace('fnv1a32_', '');
                const secondary = this._hashDurableRewardCatalogValue(`quest-boss:${identity}`).replace('fnv1a32_', '');
                const previousDefeated = validCurrent && current.status === 'defeated';
                return {
                    schemaVersion: 1,
                    fieldId,
                    zoneId: 'zone_1',
                    bossTypeId: 'king_slime',
                    bossInstanceId: `king_slime_${primary}_${secondary}`,
                    generation,
                    resetEpoch,
                    cycle: previousDefeated || options.isFirstBoss === false ? 'repeat' : 'intro',
                    status: 'alive',
                    requestedBy: String(options.requesterId || this.playerId),
                    requestId: typeof options.requestId === 'string' ? options.requestId.slice(0, 128) : null,
                    spawnedAt: now,
                    defeatedAt: 0
                };
            });
            const state = result?.snapshot?.val?.();
            if (!state
                || state.schemaVersion !== 1
                || state.fieldId !== fieldId
                || state.status !== 'alive'
                || !['intro', 'repeat'].includes(state.cycle)
                || typeof state.bossInstanceId !== 'string'
                || !state.bossInstanceId) {
                return { ok: false, reason: 'quest_boss_claim_rejected' };
            }
            return {
                ok: true,
                fieldId,
                bossInstanceId: state.bossInstanceId,
                generation: Number(state.generation),
                cycle: state.cycle,
                state: this._cloneProfileData(state)
            };
        } catch (error) {
            Logger.warn('[Network] Quest boss spawn claim failed', error);
            return { ok: false, reason: 'quest_boss_claim_failed' };
        }
    }

    ackBossSpawnRequest(requestId) {
        if (!requestId || !this.dbRef) return Promise.resolve(false);
        return this.dbRef.child(`boss_spawn_requests/${requestId}`).remove()
            .then(() => true)
            .catch(() => false);
    }

    _getQuestBossDefeatOutboxStorageKey(authorHostId = this.playerId) {
        return authorHostId
            ? `${QUEST_BOSS_DEFEAT_OUTBOX_STORAGE_PREFIX}:${encodeURIComponent(`${this.roomId}::${authorHostId}`)}`
            : null;
    }

    _persistQuestBossDefeatOutbox(authorHostId = this.playerId) {
        const storage = this._getDurableRewardLocalStorage();
        const storageKey = this._getQuestBossDefeatOutboxStorageKey(authorHostId);
        if (!authorHostId || !storage || !storageKey) return false;
        const pendingEntries = Array.from(this._pendingQuestBossDefeatWrites.values())
            .filter((entry) => entry?.authorHostId === authorHostId);
        if (pendingEntries.length > QUEST_BOSS_DEFEAT_OUTBOX_MAX_ENTRIES) return false;
        const entries = pendingEntries
            .map((entry) => ({
                schemaVersion: 1,
                authorHostId,
                fieldId: entry.fieldId,
                bossInstanceId: entry.bossInstanceId,
                defeatedAt: entry.defeatedAt
            }));
        try {
            if (entries.length === 0) storage.removeItem(storageKey);
            else storage.setItem(storageKey, JSON.stringify(entries));
            const persistedQueueKeys = new Set(pendingEntries.map((entry) => entry.queueKey));
            this._pendingQuestBossDefeatWrites.forEach((entry) => {
                if (entry?.authorHostId === authorHostId) {
                    entry.persisted = persistedQueueKeys.has(entry.queueKey);
                }
            });
            return true;
        } catch (error) {
            Logger.warn('[Network] Failed to persist quest boss defeat outbox', error);
            return false;
        }
    }

    _removeQuestBossDefeatEntry(entry) {
        if (!entry?.queueKey) return;
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = null;
        if (this._pendingQuestBossDefeatWrites.get(entry.queueKey) === entry) {
            this._pendingQuestBossDefeatWrites.delete(entry.queueKey);
        }
        this._persistQuestBossDefeatOutbox(entry.authorHostId);
    }

    _scheduleQuestBossDefeatWrite(entry) {
        if (!entry
            || this._pendingQuestBossDefeatWrites.get(entry.queueKey) !== entry
            || entry.authorHostId !== this.playerId
            || entry.timer) return;
        const delay = this._getDurableRewardRetryDelay(entry.attempt);
        entry.attempt += 1;
        entry.timer = setTimeout(() => {
            entry.timer = null;
            this._attemptQuestBossDefeatWrite(entry);
        }, delay);
    }

    async _attemptQuestBossDefeatWrite(entry) {
        if (!entry
            || this._pendingQuestBossDefeatWrites.get(entry.queueKey) !== entry
            || entry.authorHostId !== this.playerId) return false;
        const ref = this._getQuestBossStateRef(entry.fieldId);
        if (!ref) {
            this._scheduleQuestBossDefeatWrite(entry);
            return false;
        }
        if (entry.persisted !== true) {
            entry.persisted = this._persistQuestBossDefeatOutbox(entry.authorHostId);
        }
        try {
            const result = await ref.transaction((current) => {
                if (!current || current.bossInstanceId !== entry.bossInstanceId) return;
                if (current.status === 'defeated') return;
                if (current.status !== 'alive') return;
                return {
                    ...current,
                    status: 'defeated',
                    defeatedAt: Math.max(Number(current.spawnedAt || 0), Number(entry.defeatedAt || 0))
                };
            });
            const state = result?.snapshot?.val?.();
            if (!state
                || state.bossInstanceId !== entry.bossInstanceId
                || state.status === 'defeated') {
                this._rememberBoundedCommit(
                    this._committedQuestBossDefeats,
                    `${entry.fieldId}:${entry.bossInstanceId}`,
                    true
                );
                this._removeQuestBossDefeatEntry(entry);
                return true;
            }
        } catch (error) {
            Logger.warn(`[Network] Quest boss defeat marker will retry for ${entry.bossInstanceId}`, error);
        }
        this._scheduleQuestBossDefeatWrite(entry);
        return false;
    }

    markQuestBossDefeated(bossInstanceId, options = {}) {
        if (!bossInstanceId || !this.playerId) return false;
        const fieldId = this._normalizeFieldId(options.fieldId || this._getCurrentFieldId());
        const queueKey = `${this.playerId}:${fieldId}:${bossInstanceId}`;
        const existingEntry = this._pendingQuestBossDefeatWrites.get(queueKey);
        if (existingEntry) {
            if (existingEntry.persisted !== true) {
                existingEntry.persisted = this._persistQuestBossDefeatOutbox(existingEntry.authorHostId);
            }
            this._attemptQuestBossDefeatWrite(existingEntry);
            return this._committedQuestBossDefeats.has(`${fieldId}:${bossInstanceId}`);
        }
        const entry = {
            queueKey,
            authorHostId: this.playerId,
            fieldId,
            bossInstanceId: String(bossInstanceId).slice(0, 128),
            defeatedAt: Math.max(1, Math.round(Number(options.defeatedAt || this.getServerNow()))),
            attempt: 0,
            timer: null,
            persisted: false
        };
        this._pendingQuestBossDefeatWrites.set(queueKey, entry);
        entry.persisted = this._persistQuestBossDefeatOutbox(entry.authorHostId);
        this._attemptQuestBossDefeatWrite(entry);
        return this._committedQuestBossDefeats.has(`${fieldId}:${bossInstanceId}`);
    }

    _pauseQuestBossDefeatOutbox() {
        this._pendingQuestBossDefeatWrites.forEach((entry) => {
            if (entry?.timer) clearTimeout(entry.timer);
            if (entry) entry.timer = null;
        });
        this._persistQuestBossDefeatOutbox(this.playerId);
    }

    _restoreQuestBossDefeatOutbox() {
        const authorHostId = this.playerId;
        const storage = this._getDurableRewardLocalStorage();
        const storageKey = this._getQuestBossDefeatOutboxStorageKey(authorHostId);
        if (!authorHostId) return 0;
        let parsed = [];
        if (storage && storageKey) {
            try {
                parsed = JSON.parse(storage.getItem(storageKey) || '[]');
            } catch (error) {
                Logger.warn('[Network] Ignoring unreadable quest boss defeat outbox', error);
            }
        }
        if (!Array.isArray(parsed)) parsed = [];
        parsed.slice(-QUEST_BOSS_DEFEAT_OUTBOX_MAX_ENTRIES).forEach((stored) => {
            if (!stored
                || stored.schemaVersion !== 1
                || stored.authorHostId !== authorHostId
                || typeof stored.fieldId !== 'string'
                || typeof stored.bossInstanceId !== 'string'
                || !Number.isFinite(Number(stored.defeatedAt))) return;
            const queueKey = `${authorHostId}:${stored.fieldId}:${stored.bossInstanceId}`;
            if (!this._pendingQuestBossDefeatWrites.has(queueKey)) {
                this._pendingQuestBossDefeatWrites.set(queueKey, {
                    queueKey,
                    authorHostId,
                    fieldId: stored.fieldId,
                    bossInstanceId: stored.bossInstanceId,
                    defeatedAt: Number(stored.defeatedAt),
                    attempt: 0,
                    timer: null,
                    persisted: true
                });
            }
        });
        this._pendingQuestBossDefeatWrites.forEach((entry) => {
            if (entry.authorHostId === authorHostId) this._attemptQuestBossDefeatWrite(entry);
        });
        return Array.from(this._pendingQuestBossDefeatWrites.values())
            .filter((entry) => entry.authorHostId === authorHostId).length;
    }

    requestBossSpawn({ isFirstBoss = true, manualSummon = false, monsterId = null, zoneId = null, scrollItemId = null } = {}) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;

        const payload = {
            requesterId: this.playerId,
            isFirstBoss: !!isFirstBoss,
            fieldId: this._getCurrentFieldId(),
            ts: Date.now()
        };
        if (manualSummon === true) {
            payload.manualSummon = true;
            if (typeof monsterId === 'string' && monsterId) payload.monsterId = monsterId.slice(0, 128);
            if (typeof zoneId === 'string' && zoneId) payload.zoneId = zoneId.slice(0, 64);
            if (typeof scrollItemId === 'string' && scrollItemId) payload.scrollItemId = scrollItemId.slice(0, 128);
        }

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
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return false;
        if (this.isHost && window.game?.monsterManager?.isMonsterCombatBlocked?.()) return false;
        const fieldId = this._getCurrentFieldId();
        const localPlayer = window.game?.localPlayer || null;
        const attackerLevel = Math.max(1, Math.min(999, Math.floor(Number(localPlayer?.level || 1))));
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
                attackerLevel,
                fieldId,
                meta: meta || null
            };
            this._recordNetworkWrite('monsterDamageLocal', payload);
            this.emit('monsterDamageReceived', payload);
            this._markNetworkActivity();
            return true;
        }
        this.queueBatchUpdate('monster_damage', {
            mid: monsterId,
            dmg: Math.round(damage),
            aid: this.playerId,
            attackerLevel,
            fieldId,
            meta: meta || null
        });
        return true;
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
        if (this.shouldUseMonsterQuietMode() && targetId === this.playerId) {
            const player = window.game?.localPlayer;
            if (typeof player?.takeDamage === 'function') {
                const impactX = Number.isFinite(meta?.impactX) ? meta.impactX : null;
                const impactY = Number.isFinite(meta?.impactY) ? meta.impactY : null;
                player.takeDamage(
                    damage,
                    false,
                    !!meta?.isCrit,
                    impactX,
                    impactY,
                    { id: meta?.monsterId || 'monster', type: 'monster', ...(meta || {}) },
                    effectType,
                    effectDuration,
                    effectDamage
                );
            }
            return;
        }
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

    sendReward(playerId, data, options = {}) {
        if (!this.connected || !this.isHost) return false;
        const sharedCommitKey = data?.rewardId ? `${playerId}:${data.rewardId}` : null;
        if (sharedCommitKey && this._serverCommittedRewardIds.has(sharedCommitKey)) return true;
        const requireSharedCommit = options.requireSharedCommit === true && !!sharedCommitKey;
        const resolveAdmission = (admitted) => {
            if (!admitted) return false;
            return requireSharedCommit
                ? this._serverCommittedRewardIds.has(sharedCommitKey)
                : true;
        };
        const fieldId = this._getCurrentFieldId();
        if (this._isDurableBossRewardRequest(data)) {
            const durableEnvelope = this._createDurableBossRewardEnvelope(playerId, data, { fieldId });
            if (!durableEnvelope) {
                Logger.warn('[Network] Refusing an invalid durable reward before fallback routing');
                return false;
            }
            const durableAccepted = this._enqueueDurableBossReward(playerId, data, { fieldId });
            if (durableAccepted) return resolveAdmission(true);

            // Guaranteed boss rewards never downgrade into the normal channel:
            // that would discard their archived entitlement identity. Apply
            // backpressure to death settlement while a bounded volatile entry
            // attempts the same durable Firebase transaction immediately.
            this._enqueueDurableBossReward(playerId, data, {
                fieldId,
                allowVolatileOnPersistFailure: true
            });
            const volatileQueueKey = `${playerId}:${this._buildDurableRewardKey(durableEnvelope.rewardId)}`;
            if (!this._pendingDurableRewardWrites.has(volatileQueueKey)) {
                this.emit('rewardDeliveryFailed', {
                    rewardId: durableEnvelope.rewardId,
                    recipientId: playerId,
                    reason: 'all_reward_outboxes_full'
                });
            }
            Logger.error(`[Network] Durable reward ${data.rewardId} is in degraded volatile retry mode`);
            return false;
        }
        if (this._canBatchReward(data)) {
            const queued = this._queueRewardBatch(playerId, data, {
                fieldId,
                sealedAuthorHostId: this.playerId
            });
            if (queued) return true;
            return this._enqueueNormalRewardReceipt(playerId, data, { fieldId });
        }
        const accepted = this._enqueueNormalRewardReceipt(playerId, data, { fieldId });
        if (accepted) return resolveAdmission(true);
        // If the immutable receipt outbox is temporarily saturated, seal the
        // reward into the crash-safe batch journal instead of dropping it. This
        // also covers guaranteed quest rewards whose callers cannot synchronously
        // retry during a host handoff.
        const journalAccepted = this._queueRewardBatch(playerId, data, {
            fieldId,
            sealedAuthorHostId: this.playerId,
            requireLocalPersistence: !!sharedCommitKey
        });
        if (!journalAccepted) return false;
        return resolveAdmission(true);
    }

    // v0.28.0: Sync player HP status
    sendPlayerHp(hp, maxHp, options = {}) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        if (!this._shouldSendRealtimeUserState()) return;
        const now = Date.now();
        const nextMaxHp = Math.max(0, Math.round(maxHp));
        const nextHp = Math.min(nextMaxHp, Math.max(0, Math.round(hp)));
        const force = !!options.force;
        const isDeathSync = nextHp <= 0;

        if (!force && this._lastHpSync.hp === nextHp && this._lastHpSync.maxHp === nextMaxHp && (now - this._lastHpSync.ts) < 500) {
            return;
        }
        if (!force && !isDeathSync && (now - this._lastHpSync.ts) < 120) return;

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
            fieldId: this._getCurrentFieldId(),
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
        if (this.shouldUseMonsterQuietMode() && targetId === this.playerId) {
            const player = window.game?.localPlayer;
            if (typeof player?.takeDamage === 'function') {
                const impactX = Number.isFinite(meta?.impactX) ? meta.impactX : null;
                const impactY = Number.isFinite(meta?.impactY) ? meta.impactY : null;
                player.takeDamage(
                    amount,
                    false,
                    !!meta?.isCrit,
                    impactX,
                    impactY,
                    { id: meta?.monsterId || 'monster', type: 'monster', ...(meta || {}) },
                    effectType,
                    effectDuration,
                    effectDamage
                );
            }
            return;
        }

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
                        const sceneRemote = window.game.sceneManager?.currentScene?.remotePlayers?.get?.(val.attackerId) || null;
                        const knownRemote = sceneRemote || this.remotePlayers.get(val.attackerId) || null;
                        if (knownRemote?.canAttackTarget
                            && !knownRemote.canAttackTarget(window.game.localPlayer)) {
                            snapshot.ref.remove();
                            return;
                        }
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

    _buildDuelId(targetUid, ts = Date.now()) {
        const pair = [this.playerId, targetUid].filter(Boolean).sort().join('__');
        return `duel_${pair}_${Math.max(0, Math.round(ts))}`;
    }

    async resolveDuelTarget(query) {
        const trimmed = String(query || '').trim();
        if (!trimmed || !window.firebase) return null;

        let uid = null;
        let profile = await this.getPlayerProfile(trimmed);
        if (profile) {
            uid = trimmed;
        } else {
            uid = await this.getUidByName(trimmed);
            if (!uid) return null;
            profile = await this.getPlayerProfile(uid);
        }

        if (!uid) return null;
        const name = this._isMeaningfulPlayerName(profile?.name)
            ? profile.name.trim()
            : trimmed;
        return { uid, name, profile: profile || null };
    }

    async sendDuelRequest(targetUid, targetName = '') {
        if (!this.connected || !this.playerId || !this.dbRef || !targetUid || targetUid === this.playerId) {
            return { ok: false, reason: 'INVALID' };
        }
        if (!this.zoneParticipationEnabled) return { ok: false, reason: 'ZONE_DISABLED' };

        const now = Date.now();
        const duelId = this._buildDuelId(targetUid, now);
        await this.dbRef.child(`users/${targetUid}/hostility_inbox`).push({
            type: 'DUEL_REQUEST',
            from: this.playerId,
            fromName: window.game?.localPlayer?.name || 'Unknown',
            targetName: targetName || '',
            duelId,
            fieldId: this._getCurrentFieldId(),
            ts: now
        });
        return { ok: true, duelId };
    }

    async sendDuelResponse(targetUid, request = {}, accepted = false, reason = '') {
        if (!this.connected || !this.playerId || !this.dbRef || !targetUid) return false;
        await this.dbRef.child(`users/${targetUid}/hostility_inbox`).push({
            type: accepted ? 'DUEL_ACCEPT' : 'DUEL_DECLINE',
            from: this.playerId,
            fromName: window.game?.localPlayer?.name || 'Unknown',
            duelId: request?.duelId || this._buildDuelId(targetUid),
            fieldId: this._getCurrentFieldId(),
            reason,
            ts: Date.now()
        });
        return true;
    }

    async sendDuelEnd(targetUid, duelId = null, reason = 'ended') {
        if (!this.connected || !this.playerId || !this.dbRef || !targetUid) return false;
        await this.dbRef.child(`users/${targetUid}/hostility_inbox`).push({
            type: 'DUEL_END',
            from: this.playerId,
            fromName: window.game?.localPlayer?.name || 'Unknown',
            duelId: duelId || this._buildDuelId(targetUid),
            fieldId: this._getCurrentFieldId(),
            reason,
            ts: Date.now()
        });
        return true;
    }

    startHostilityListeners() {
        if (!this.playerId || !this.zoneParticipationEnabled) return;
        if (this._hostilityListenerActive) return;

        this._hostilityListenerActive = true;
        Logger.log(`[Network] Starting hostility listeners for ${this.playerId}`);

        // Listen for Direct Hostility Updates (Inbox Pattern)
        this.dbRef.child(`users/${this.playerId}/hostility_inbox`).on('child_added', async (snapshot) => {
            const val = snapshot.val();
            if (val) {
                // v1.1: Force Mutual Hostility Logic
                if (window.game && window.game.localPlayer) {
                    const lp = window.game.localPlayer;
                    const senderId = val.from;
                    const senderName = val.fromName || "Unknown";
                    const eventAgeMs = Date.now() - Number(val.ts || 0);
                    const sameField = !val.fieldId || this._normalizeFieldId(val.fieldId) === this._getCurrentFieldId();

                    if (val.type === 'DUEL_REQUEST') {
                        if (!senderId || eventAgeMs > 60000 || !sameField || lp.isDead || lp.isDying) {
                            await this.sendDuelResponse(senderId, val, false, sameField ? 'unavailable' : 'field_mismatch');
                        } else if (lp.hasActiveDuelWith?.(senderId)) {
                            await this.sendDuelResponse(senderId, val, true, 'already_dueling');
                        } else {
                            window.game.ui?.showGenericModal?.(
                                '결투 신청',
                                `${senderName}님이 결투를 신청했습니다.\n수락하면 둘 중 한 명이 쓰러질 때까지 서로 공격할 수 있습니다.`,
                                async () => {
                                    lp.addDuelTarget?.(senderId, senderName, val.duelId, val.ts || Date.now());
                                    await this.sendDuelResponse(senderId, val, true);
                                    window.game.ui?.logSystemMessage?.(`⚔️ ${senderName}님과의 결투를 수락했습니다.`);
                                    window.game.sound?.playSfx?.('pvp_alert');
                                },
                                async () => {
                                    await this.sendDuelResponse(senderId, val, false, 'declined');
                                    window.game.ui?.logSystemMessage?.(`${senderName}님의 결투 신청을 거절했습니다.`);
                                },
                                { yesText: '수락', noText: '거절' }
                            );
                            window.game.sound?.playSfx?.('pvp_alert');
                        }
                    } else if (val.type === 'DUEL_ACCEPT') {
                        if (sameField && senderId) {
                            lp.addDuelTarget?.(senderId, senderName, val.duelId, val.ts || Date.now());
                            window.game.ui?.logSystemMessage?.(`⚔️ ${senderName}님이 결투를 수락했습니다.`);
                            window.game.sound?.playSfx?.('pvp_alert');
                        }
                    } else if (val.type === 'DUEL_DECLINE') {
                        if (senderId) {
                            window.game.ui?.logSystemMessage?.(`${senderName}님이 결투 신청을 거절했습니다.`);
                        }
                    } else if (val.type === 'DUEL_END') {
                        if (senderId) {
                            const removed = lp.endDuelWith?.(senderId, val.reason || 'ended', { notify: false });
                            if (removed) {
                                const reasonText = val.reason === 'death' ? '상대가 쓰러져' : '종료되어';
                                window.game.ui?.logSystemMessage?.(`⚔️ ${senderName}님과의 결투가 ${reasonText} 끝났습니다.`);
                            }
                        }
                    }

                    // Handle ADD (Forced Hostility)
                    // If someone declares war on me, I MUST reciprocate physically
                    // (But logically, I just add them to my list so I can attack back)
                    else if (val.type === 'ADD') {
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
            fieldId: this._getCurrentFieldId(),
            ts: firebase.database.ServerValue.TIMESTAMP
        });
    }

    _sendHeartbeat() {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        this.sendHeartbeat();
    }

    _setupEmoteListeners() {
        this._refreshFieldScopedRealtimeListeners(this._getCurrentFieldId());
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
