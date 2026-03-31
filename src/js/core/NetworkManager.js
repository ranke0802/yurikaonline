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
        this.syncInterval = 60; // 16Hz when moving
        this.idleSyncInterval = 200; // 5Hz when idle (reduced from 60ms)

        // Dynamic Heartbeat Optimization
        this.isPlayerMoving = false;
        this.lastHeartbeatTime = 0;
        this.idleHeartbeatInterval = 5000; // 5s when idle
        this.activeHeartbeatInterval = 1000; // 1s when moving
        this.lastPacketData = null;

        // Batch update queue for damage/events
        this.batchQueue = [];
        this.batchInterval = 100; // 100ms batch window
        this.startBatchProcessor();

        // Lifecycle guards
        this._boundVisibilityChange = this._handleVisibilityChange.bind(this);
        this._hostilityListenerActive = false;
        this._lastHpSync = { hp: null, maxHp: null, ts: 0 };
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
        this.startBatchProcessor();

        Logger.log(`Network Coordinates: connecting to ${this.roomId}...`);

        // 1. Listen for other players moving
        this.dbRef.child('users').on('child_added', (snapshot) => this._onPlayerAdded(snapshot));
        this.dbRef.child('users').on('child_changed', (snapshot) => this._onPlayerChanged(snapshot));
        this.dbRef.child('users').on('child_removed', (snapshot) => this._onPlayerRemoved(snapshot));

        // Monster Sync
        this.dbRef.child('monsters').on('child_added', (s) => {
            const val = s.val();
            this.emit('monsterAdded', { id: s.key, ...val });

            // v0.00.57: Boss BGM Trigger
            if (val && val.type === 'king_slime') {
                if (window.game && window.game.sound) {
                    window.game.sound.loadAndPlayBgm('bgm_boss');
                    window.game.sound.playSfx('boss_spawn');
                }
            }
        });
        this.dbRef.child('monsters').on('child_changed', (s) => this.emit('monsterUpdated', { id: s.key, ...s.val() }));
        this.dbRef.child('monsters').on('child_removed', (s) => {
            const val = s.val();
            this.emit('monsterRemoved', s.key);

            // v0.00.59: Boss Defeated - Revert BGM
            if (val && val.type === 'king_slime') {
                if (window.game && window.game.sound) {
                    window.game.sound.loadAndPlayBgm('bgm_cabin');
                }
            }
        });

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
                    console.warn('[AntiCheat] Rejected reward from non-host:', data.hostId);
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
                    console.warn('[AntiCheat] Too many rewards, ignoring:', this._rewardCount);
                    snapshot.ref.remove();
                    return;
                }

                // 3. Sanity check on reward amounts (skip for quest rewards)
                if (!data.questKill) {
                    if (data.exp && data.exp > MAX_EXP_PER_REWARD) {
                        console.warn('[AntiCheat] EXP too high:', data.exp);
                        data.exp = MAX_EXP_PER_REWARD;
                    }
                    if (data.gold && data.gold > MAX_GOLD_PER_REWARD) {
                        console.warn('[AntiCheat] Gold too high:', data.gold);
                        data.gold = MAX_GOLD_PER_REWARD;
                    }
                }

                // 4. Timestamp check (reject old rewards > 10s)
                if (data.ts && (now - data.ts > 10000)) {
                    console.warn('[AntiCheat] Stale reward rejected:', data.ts);
                    snapshot.ref.remove();
                    return;
                }

                this.emit('rewardReceived', data);
            }
            // Cleanup: Reward collected
            snapshot.ref.remove();
        });

        // Drop Sync
        this.dbRef.child('drops').on('child_added', (s) => this.emit('dropAdded', { id: s.key, ...s.val() }));
        this.dbRef.child('drops').on('child_removed', (s) => this.emit('dropRemoved', s.key));

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

        // 2. presence check
        const myRef = this.dbRef.child(`users/${this.playerId}`);
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

        this.connected = true;
        this.emit('connected');

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
            }

            if (this.isHost) {
                this.isHost = false;
                this.emit('hostChanged', false);
                this._stopCleanupLoop();
            }

            if (this.dbRef && this.playerId) {
                this.dbRef.child(`users/${this.playerId}`).remove().catch(() => { });
            }
        } else {
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
            await this.dbRef.update(updates);
        } catch (e) {
            Logger.error('Batch update failed:', e);
        }
    }

    disconnect() {
        if (this._hbInterval) {
            clearInterval(this._hbInterval);
            this._hbInterval = null;
        }
        if (this._localCleanupTimer) {
            clearInterval(this._localCleanupTimer);
            this._localCleanupTimer = null;
        }
        this._stopCleanupLoop();
        this.stopBatchProcessor();
        this.batchQueue.length = 0;
        document.removeEventListener('visibilitychange', this._boundVisibilityChange);
        this._detachAllDbListeners();

        if (this.playerId && this.dbRef) {
            this.dbRef.child(`users/${this.playerId}`).remove().catch(() => { });
        }

        this.connected = false;
        this.isHost = false;
        this.currentHostId = null;
        this.connectedUsers = [];
        this.userLastSeen.clear();
        this.remotePlayers.clear();
        this._hostilityListenerActive = false;
        this._lastHpSync = { hp: null, maxHp: null, ts: 0 };
        this.lastPacketData = null;
        this.lastSyncTime = 0;
        this.lastHeartbeatTime = 0;
        this.playerId = null;
        this.dbRef = null;
    }

    _detachAllDbListeners() {
        if (!this.dbRef) return;

        const fixedPaths = [
            'users',
            'monsters',
            'monster_attack',
            'monster_damage',
            'monster_damage_batch',
            'player_damage',
            'player_damage_batch',
            'drops',
            'drop_collection',
            'chat',
            'system_messages',
            'emotes'
        ];
        fixedPaths.forEach(path => this.dbRef.child(path).off());

        if (!this.playerId) return;
        const playerPaths = [
            `rewards/${this.playerId}`,
            `party_invites/${this.playerId}`,
            `party_responses/${this.playerId}`,
            `damage_events/${this.playerId}`,
            `users/${this.playerId}/hostility_inbox`,
            `users/${this.playerId}/party_inbox`
        ];
        playerPaths.forEach(path => this.dbRef.child(path).off());
    }

    sendHeartbeat() {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        // v0.00.05: Use ServerValue.TIMESTAMP to eliminate clock skew issues
        this.dbRef.child(`users/${this.playerId}/ts`).set(firebase.database.ServerValue.TIMESTAMP);
        this.lastHeartbeatTime = Date.now();

        // v0.00.03: Ensure resonance of local user list
        if (!this.connectedUsers.includes(this.playerId)) {
            this.connectedUsers.push(this.playerId);
            this.connectedUsers.sort();
        }

        // v1.99.14: Aggressive host re-check every second
        this._checkHostStatus();
    }

    /**
     * v0.00.23: Dynamic heartbeat - reduces frequency when idle
     */
    _dynamicHeartbeat() {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        const now = Date.now();
        const interval = this.isPlayerMoving ? this.activeHeartbeatInterval : this.idleHeartbeatInterval;

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
            const ghostTimeout = 6000; // v0.00.05: Relaxed 6s heartbeat timeout (more stable)

            this.remotePlayers.forEach((rp, uid) => {
                if (now - rp.ts > ghostTimeout) {
                    Logger.warn(`[Presence] Removing timed-out user: ${uid}, LastSeen: ${rp.ts}, Now: ${now}, Diff: ${now - rp.ts}`);
                    this.remotePlayers.delete(uid);
                    this.emit('playerLeft', uid);
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

    async getPlayerData(uid) {
        if (!this.dbRef) return null;
        try {
            // v0.00.03: Unify with AuthManager root path
            const snapshot = await firebase.database().ref(`users/${uid}`).once('value');
            return snapshot.val();
        } catch (e) {
            Logger.error('Failed to get player data', e);
            return null;
        }
    }

    async savePlayerData(uid, data, syncToZone = false) {
        if (!uid) return;
        try {
            // v0.00.04: Root profile update (Persistent across logins)
            console.log(`[Network] Saving Player Data to users/${uid}/profile:`, data);
            await firebase.database().ref(`users/${uid}/profile`).set(data);

            // v0.00.04: Zone-specific update ONLY IF requested and in a zone
            // This prevents players in character selection from appearing in the map
            if (syncToZone && this.dbRef && this.zoneParticipationEnabled) {
                await this.dbRef.child(`users/${uid}/profile`).set(data);
            }
        } catch (e) {
            Logger.error('Failed to save player profile', e);
        }
    }

    async resetWorldData() {
        if (!this.dbRef || !this.connected) return;
        try {
            Logger.info('--- DEVELOPER WORLD RESET INITIALIZED ---');
            // Clear World Nodes
            await Promise.all([
                this.dbRef.child('monsters').remove(),
                this.dbRef.child('drops').remove(),
                this.dbRef.child('monster_damage').remove(),
                this.dbRef.child('player_damage').remove()
            ]);
            Logger.log('World data (monsters/drops/logs) cleared successfully.');
        } catch (e) {
            Logger.error('Failed to reset world data', e);
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

        const data = await this.getPlayerData(uid);
        const members = data?.profile?.party?.members;
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
        const timeout = 12000; // 12s for takeover

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
            console.log(`%c[Network] PROMOTED TO HOST. Active Users: ${activeUsers.length}. ID: ${this.playerId}`, "color: yellow; font-weight: bold; background: #222; padding: 2px 5px;");
            this.emit('hostChanged', true);
            this._startCleanupLoop();
        } else if (!desiredHost && this.isHost) {
            this.isHost = false;
            console.log(`%c[Network] DEMOTED TO GUEST. Active Users: ${activeUsers.length}`, "color: gray;");
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
        const staleTimeout = 8000; // v0.00.05: Balanced 8s timeout

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

    sendMonsterUpdate(id, data) {
        if (!this.connected || !this.isHost) return;
        if (!id || !data) return;

        // Validation to prevent Firebase Errors (No Spread to avoid undefined fields)
        const safeData = {
            x: Math.round(data.x || 0),
            y: Math.round(data.y || 0),
            hp: Math.round(data.hp || 0),
            maxHp: Math.round(data.maxHp || 100),
            type: data.type || 'slime',
            chargeOnly: data.chargeOnly || false // v0.00.76+
        };

        this.dbRef.child(`monsters/${id}`).set(safeData).catch(e => { });
    }

    removeMonster(id) {
        if (!this.connected || !this.isHost) return;
        this.dbRef.child(`monsters/${id}`).remove().catch(e => { });
    }

    // --- Drop Methods ---
    spawnDrop(data) {
        if (!this.connected || !this.isHost) return;
        const ref = this.dbRef.child('drops').push();
        ref.set({
            x: Math.round(data.x),
            y: Math.round(data.y),
            type: data.type,
            amount: data.amount,
            ownerId: data.ownerId || null,
            partyMembers: Array.isArray(data.partyMembers) ? data.partyMembers : null,
            ts: Date.now()
        }).catch(e => { });
    }

    removeDrop(id) {
        if (!this.connected || !this.isHost) return;
        this.dbRef.child(`drops/${id}`).remove().catch(e => { });
    }

    collectDrop(dropId) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        // Request collection: { did: dropId, cid: collectorId }
        this.dbRef.child('drop_collection').push({
            did: dropId,
            cid: this.playerId,
            ts: Date.now()
        });
    }

    // Phase 1: Delta synchronization for bandwidth optimization
    // Only sync changed fields instead of full packet
    sendMovePacket(x, y, vx, vy, name) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;

        const now = Date.now();

        // Adaptive sync interval based on movement state
        const isMoving = Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1;
        this.isPlayerMoving = isMoving;

        const currentInterval = isMoving ? this.syncInterval : this.idleSyncInterval;
        if (now - this.lastSyncTime < currentInterval) return;

        // Validation
        const safeX = Math.round(x) || 0;
        const safeY = Math.round(y) || 0;
        const safeVx = parseFloat((vx || 0).toFixed(2));
        const safeVy = parseFloat((vy || 0).toFixed(2));

        // Delta calculation - only send changed fields
        const updates = {};
        let hasChanges = false;
        const basePath = `users/${this.playerId}`;

        // Position delta (threshold: 2 pixels)
        if (!this.lastPacketData || Math.abs(safeX - this.lastPacketData.x) > 2) {
            updates[`${basePath}/p/x`] = safeX;
            hasChanges = true;
        }
        if (!this.lastPacketData || Math.abs(safeY - this.lastPacketData.y) > 2) {
            updates[`${basePath}/p/y`] = safeY;
            hasChanges = true;
        }

        // Velocity - only when moving
        if (isMoving) {
            if (!this.lastPacketData ||
                Math.abs(safeVx - (this.lastPacketData.vx || 0)) > 0.05 ||
                Math.abs(safeVy - (this.lastPacketData.vy || 0)) > 0.05) {
                updates[`${basePath}/p/vx`] = safeVx;
                updates[`${basePath}/p/vy`] = safeVy;
                hasChanges = true;
            }
        }

        // Name only on first packet or change
        if (!this.lastPacketData || (name && name !== this.lastPacketData.name)) {
            updates[`${basePath}/p/n`] = name || "Unknown";
            hasChanges = true;
        }

        // Timestamp always included for latency calculation
        updates[`${basePath}/p/ts`] = now;

        if (hasChanges) {
            this.dbRef.update(updates).catch(e => { });
            this.lastPacketData = { x: safeX, y: safeY, vx: safeVx, vy: safeVy, name };
        }

        this.lastSyncTime = now;
    }

    // v0.28.0: Detailed attack sync [ts, x, y, direction, skillType]
    sendPlayerAttack(x, y, dir, skillType, extraData = null) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        const payload = [
            Date.now(),
            Math.round(x),
            Math.round(y),
            dir,
            skillType,
            extraData // v0.29.0: Added for skill specifics (e.g. missile count)
        ];
        this.dbRef.child(`users/${this.playerId}/a`).set(payload);
    }

    // v0.00.37: Send channeling state for casting effects (independent of attack hit)
    sendChanneling(skillType) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        const payload = [Date.now(), skillType];
        this.dbRef.child(`users/${this.playerId}/ch`).set(payload);
    }

    sendMonsterDamage(monsterId, damage, meta = null) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
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
        this.dbRef.child('monster_attack').push({
            mid: monsterId,
            skill: skillType,
            extra: extraData,
            ts: Date.now()
        });
    }

    sendPlayerDamage(targetId, damage) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        // Optimization: Use batch queue for player damage
        this.queueBatchUpdate('player_damage', {
            tid: targetId,
            dmg: Math.round(damage),
            aid: this.playerId
        });
    }

    sendReward(playerId, data) {
        if (!this.connected || !this.isHost) return;
        // v0.00.42: Include hostId for anti-cheat validation
        // data: { exp: number, gold: number, items: [] }
        const safeData = {
            ...data,
            hostId: this.playerId,  // Host signature
            ts: Date.now()
        };
        this.dbRef.child(`rewards/${playerId}`).push(safeData).catch(e => { });
    }

    // v0.28.0: Sync player HP status
    sendPlayerHp(hp, maxHp) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        const now = Date.now();
        const nextHp = Math.round(hp);
        const nextMaxHp = Math.round(maxHp);

        if (this._lastHpSync.hp === nextHp && this._lastHpSync.maxHp === nextMaxHp && (now - this._lastHpSync.ts) < 500) {
            return;
        }
        if ((now - this._lastHpSync.ts) < 120) return;

        this._lastHpSync = { hp: nextHp, maxHp: nextMaxHp, ts: now };
        this.dbRef.child(`users/${this.playerId}/h`).set([nextHp, nextMaxHp, now]);
    }

    sendChat(text, senderName) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        this.dbRef.child('chat').push({
            uid: this.playerId,
            name: senderName || "Unknown",
            text: text,
            ts: Date.now()
        });
    }

    _onPlayerAdded(snapshot) {
        const uid = snapshot.key;
        const val = snapshot.val();

        // v0.28.2: Enhanced hybrid data parsing
        let posData = null;
        if (Array.isArray(val)) {
            posData = val;
        } else if (val && typeof val === 'object') {
            if (val.p) {
                // v0.00.64: Support both Array (Legacy) and Object (Delta Sync) formats
                posData = val.p;
            } else if (val[0] !== undefined) {
                posData = [val[0], val[1], val[2], val[3], val[4], val[5]];
            }
        }

        let ts = Date.now();
        if (posData) {
            // Check if Array or Object
            if (Array.isArray(posData)) {
                ts = posData[4] || Date.now();
            } else {
                ts = posData.ts || Date.now();
            }
        }

        // Ensure TS is valid to prevent immediate ghost cleanup
        if (!ts || ts < Date.now() - 100000) ts = Date.now();

        this.userLastSeen.set(uid, ts);

        if (!this.connectedUsers.includes(uid)) {
            this.connectedUsers.push(uid);
            this.connectedUsers.sort();
            this._checkHostStatus();
        }

        if (uid === this.playerId) return;

        if (!posData) {
            Logger.warn(`[Network] _onPlayerAdded rejected ${uid}: No posData. val:`, val);
            // Attempt to recover if val itself has coordinates (Legacy/Fallback)
            if (val.x !== undefined && val.y !== undefined) {
                Logger.warn(`[Network] Recovering position from root val for ${uid}`);
                posData = { x: val.x, y: val.y, ts: val.ts, n: val.n };
            } else {
                return;
            }
        }

        // v0.00.03: Buffer player data with fallback for missing name/profile
        const profile = val.profile || {};

        // Normalize position data
        let pX, pY, pName;
        if (Array.isArray(posData)) {
            pX = posData[0]; pY = posData[1]; pName = posData[5];
        } else {
            pX = posData.x; pY = posData.y; pName = posData.n;
        }

        const newPlayer = {
            id: uid,
            x: pX,
            y: pY,
            ts: ts,
            name: profile.name || pName || "Unknown",
            h: val.h,
            a: val.a,
            level: profile.level || 1,
            equipment: profile.equipment || null,
            party: profile.party || null,
            hostility: profile.hostility || val.hostility || {}
        };

        this.remotePlayers.set(uid, newPlayer);

        // Logger.log(`[NetworkManager] Remote player joined: ${uid} (TS: ${ts})`);
        this.emit('playerJoined', newPlayer);

        // Explicitly fire an update event to sync initial position immediately
        this.emit('playerUpdate', { id: uid, x: pX, y: pY, vx: 0, vy: 0, ts: ts });

        // v0.29.24: Sync Initial HP and Attack state on join
        if (val && val.h && Array.isArray(val.h)) {
            this.emit('playerHpUpdate', {
                id: uid,
                hp: val.h[0],
                maxHp: val.h[1],
                ts: val.h[2]
            });
        }

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
                    skillType: val.a[4] || 'normal',
                    extraData: val.a[5] || null
                });
            }
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

        if (posData || val.ts) {
            let ts = 0;
            if (posData) {
                ts = Array.isArray(posData) ? (posData[4] || 0) : (posData.ts || 0);
            } else {
                ts = val.ts || 0;
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
                        if (hostility) update.hostility = hostility;

                        this.emit('playerUpdate', update);
                    }
                } else {
                    // Packet arrived for unknown player -> Treat as Add
                    // v0.00.67: Only attempt add if we have some position data
                    console.warn(`[Network] Received update for unknown player ${uid}, treating as ADD.`);
                    if (posData && (Array.isArray(posData) || posData.x !== undefined || posData.y !== undefined || val.ts)) {
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
    sendPlayerDamage(targetId, amount, effectType = null, effectDuration = 0, effectDamage = 0) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;

        // Push damage event to target's inbox
        this.dbRef.child(`damage_events/${targetId}`).push({
            attackerId: this.playerId,
            damage: amount,
            effectType: effectType,
            effectDuration: effectDuration,
            effectDamage: effectDamage,
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
                        const attacker = { id: val.attackerId, type: 'player' };
                        window.game.localPlayer.takeDamage(
                            val.damage,
                            true,
                            false,
                            null,
                            null,
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
    sendEmote(emoteId) {
        if (!this.connected || !this.playerId || !this.zoneParticipationEnabled) return;
        this.dbRef.child('emotes').push({
            uid: this.playerId,
            emoteId: emoteId,
            ts: firebase.database.ServerValue.TIMESTAMP
        });
    }

    _sendHeartbeat() {
        if (!this.connected || !this.playerId) return;

        const presenceRef = this.dbRef.child(`users/${this.playerId}`);
        presenceRef.update({
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        }).catch(e => {
            // Ignore offline errors
        });

        this.lastHeartbeatTime = Date.now();
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
            // Optional: Pause complex logic here if needed
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
