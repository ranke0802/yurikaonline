import Logger from '../utils/Logger.js';
import EventEmitter from './EventEmitter.js';

export default class NetworkManager extends EventEmitter {
    constructor() {
        super();
        this.connected = false;
        this.roomId = 'zone_1'; // Currently hardcoded zone
        this.playerId = null;
        this.dbRef = null;

        // Remote Players buffer
        this.remotePlayers = new Map();

        // Host Logic
        this.isHost = false;
        this.connectedUsers = [];
        this.userLastSeen = new Map();
        this.cleanupTimer = null;

        // Optimization: Dead Reckoning & Throttling
        this.lastSyncTime = 0;
        this.syncInterval = 60; // 16Hz Update Rate (v0.27.0 optimization)
    }

    connect(user) {
        if (!user || !window.firebase) return;

        this.playerId = user.uid;
        this.dbRef = firebase.database().ref(`zones/${this.roomId}`);

        Logger.log(`Network Coordinates: connecting to ${this.roomId}...`);

        // 1. Listen for other players moving
        this.dbRef.child('users').on('child_added', (snapshot) => this._onPlayerAdded(snapshot));
        this.dbRef.child('users').on('child_changed', (snapshot) => this._onPlayerChanged(snapshot));
        this.dbRef.child('users').on('child_removed', (snapshot) => this._onPlayerRemoved(snapshot));

        // Monster Sync
        this.dbRef.child('monsters').on('child_added', (s) => this.emit('monsterAdded', { id: s.key, ...s.val() }));
        this.dbRef.child('monsters').on('child_changed', (s) => this.emit('monsterUpdated', { id: s.key, ...s.val() }));
        this.dbRef.child('monsters').on('child_removed', (s) => this.emit('monsterRemoved', s.key));

        // Monster Damage Sync (Listen for damage events - Spark / Text)
        this.dbRef.child('monster_damage').on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                this.emit('monsterDamageReceived', data);
                if (this.isHost) {
                    this.emit('monsterDamage', {
                        monsterId: data.mid,
                        damage: data.dmg,
                        attackerId: data.aid
                    });
                }
            }
            if (this.isHost) snapshot.ref.remove();
        });

        // Player Damage Sync (PvP)
        this.dbRef.child('player_damage').on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                this.emit('playerDamageReceived', data);
            }
            // ephemeral PvP damage cleanup (anyone can clean if older than 5s, but usually host)
            if (this.isHost) snapshot.ref.remove();
        });

        // Reward Sync (Guest side listens for rewards targeting them)
        this.dbRef.child(`rewards/${this.playerId}`).on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (data) {
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
            if (data && data.ts > Date.now() - 30000) { // Only recent chats
                this.emit('chatReceived', data);
            }
            // Host cleans up old chats
            if (this.isHost) {
                const now = Date.now();
                if (now - data.ts > 60000) snapshot.ref.remove();
            }
        });

        // v0.00.03: Failsafe exit logic
        myRef.onDisconnect().remove();

        this.connected = true;
        this.emit('connected');

        // v0.00.04: Heartbeat is now the primary presence method
        this._startLocalGhostCleanup();

        // v0.00.05: Global Heartbeat (Starts on connect, active even in Waiting scenes)
        if (this._hbInterval) clearInterval(this._hbInterval);
        this._hbInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 1000);

        this._setupPartyListeners();
        this._setupDamageListeners(); // v0.00.14: PvP Damage
        // this._setupHostilityListeners(); // Moved to WorldScene to ensure localPlayer exists

        Logger.log('Connected to Game Zone.');
    }

    disconnect() {
        if (this._hbInterval) clearInterval(this._hbInterval);
        this.connected = false;
        if (this.playerId && this.dbRef) {
            this.dbRef.child(`users/${this.playerId}`).remove();
        }
    }

    sendHeartbeat() {
        if (!this.connected || !this.playerId) return;
        // v0.00.05: Use ServerValue.TIMESTAMP to eliminate clock skew issues
        this.dbRef.child(`users/${this.playerId}/ts`).set(firebase.database.ServerValue.TIMESTAMP);

        // v0.00.03: Ensure resonance of local user list
        if (!this.connectedUsers.includes(this.playerId)) {
            this.connectedUsers.push(this.playerId);
            this.connectedUsers.sort();
        }

        // v1.99.14: Aggressive host re-check every second
        this._checkHostStatus();
    }

    _startLocalGhostCleanup() {
        if (this._localCleanupTimer) clearInterval(this._localCleanupTimer);
        this._localCleanupTimer = setInterval(() => {
            const now = Date.now();
            const ghostTimeout = 6000; // v0.00.05: Relaxed 6s heartbeat timeout (more stable)

            this.remotePlayers.forEach((rp, uid) => {
                if (now - rp.ts > ghostTimeout) {
                    Logger.log(`[Presence] Removing timed-out user (Local): ${uid}`);
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
            if (syncToZone && this.dbRef) {
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

    // --- Host Logic ---
    _checkHostStatus() {
        if (!this.playerId || !this.connected) return;

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
            type: data.type || 'slime'
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
            ts: Date.now()
        }).catch(e => { });
    }

    removeDrop(id) {
        if (!this.connected || !this.isHost) return;
        this.dbRef.child(`drops/${id}`).remove().catch(e => { });
    }

    collectDrop(dropId) {
        if (!this.connected || !this.playerId) return;
        // Request collection: { did: dropId, cid: collectorId }
        this.dbRef.child('drop_collection').push({
            did: dropId,
            cid: this.playerId,
            ts: Date.now()
        });
    }

    // Packet: [x, y, vx, vy, timestamp, name]
    // Compact array to save bandwidth (360MB daily limit optimization)
    sendMovePacket(x, y, vx, vy, name) {
        if (!this.connected || !this.playerId) return;

        const now = Date.now();
        // Throttle Network Calls
        if (now - this.lastSyncTime < this.syncInterval) return;

        // Validation to prevent Firebase Errors
        const safeX = (isNaN(x) || x === null || x === undefined) ? 0 : Math.round(x);
        const safeY = (isNaN(y) || y === null || y === undefined) ? 0 : Math.round(y);
        const safeVx = (isNaN(vx) || vx === null || vx === undefined) ? 0 : parseFloat(vx.toFixed(2));
        const safeVy = (isNaN(vy) || vy === null || vy === undefined) ? 0 : parseFloat(vy.toFixed(2));

        // Idle Suppression: Skip if position and velocity haven't changed meaningfully
        if (this.lastPacketData) {
            const [lx, ly, lvx, lvy] = this.lastPacketData;
            const posChanged = Math.abs(safeX - lx) > 1 || Math.abs(safeY - ly) > 1;
            const velChanged = Math.abs(safeVx - lvx) > 0.01 || Math.abs(safeVy - lvy) > 0.01;
            const isMoving = Math.abs(safeVx) > 0.1 || Math.abs(safeVy) > 0.1;

            // If stationary and state hasn't changed, skip
            if (!posChanged && !velChanged && !isMoving) return;
        }

        const packet = [
            safeX,
            safeY,
            safeVx,
            safeVy,
            now,
            name || "Unknown"
        ];

        this.lastPacketData = packet;
        this.lastSyncTime = now;

        // Update Position Node 'p'
        this.dbRef.child(`users/${this.playerId}/p`).set(packet).catch(e => { });
    }

    // v0.28.0: Detailed attack sync [ts, x, y, direction, skillType]
    sendPlayerAttack(x, y, dir, skillType, extraData = null) {
        if (!this.connected || !this.playerId) return;
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

    sendMonsterDamage(monsterId, damage) {
        if (!this.connected || !this.playerId) return;
        this.dbRef.child('monster_damage').push({
            mid: monsterId,
            dmg: Math.round(damage),
            aid: this.playerId,
            ts: Date.now()
        });
    }

    sendPlayerDamage(targetId, damage) {
        if (!this.connected || !this.playerId) return;
        // Optimization: Use a push-queue for player damage
        const ref = this.dbRef.child('player_damage').push();
        ref.set({
            tid: targetId,
            dmg: Math.round(damage),
            aid: this.playerId,
            ts: Date.now()
        });
    }

    sendReward(playerId, data) {
        if (!this.connected || !this.isHost) return;
        // data: { exp: number, gold: number, items: [] }
        this.dbRef.child(`rewards/${playerId}`).push(data).catch(e => { });
    }

    // v0.28.0: Sync player HP status
    sendPlayerHp(hp, maxHp) {
        if (!this.connected || !this.playerId) return;
        this.dbRef.child(`users/${this.playerId}/h`).set([Math.round(hp), Math.round(maxHp), Date.now()]);
    }

    sendChat(text, senderName) {
        if (!this.connected || !this.playerId) return;
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
            if (val.p && Array.isArray(val.p)) {
                posData = val.p;
            } else if (val[0] !== undefined) {
                posData = [val[0], val[1], val[2], val[3], val[4], val[5]];
            }
        }

        let ts = Date.now();
        if (posData) {
            ts = posData[4] || 0;
        }
        this.userLastSeen.set(uid, ts);

        if (!this.connectedUsers.includes(uid)) {
            this.connectedUsers.push(uid);
            this.connectedUsers.sort();
            this._checkHostStatus(); // Check if this new user (or existing ghost) changes host status
        }

        if (uid === this.playerId) return;

        if (!posData || !Array.isArray(posData)) return;

        // v0.00.03: Buffer player data with fallback for missing name/profile
        const profile = val.profile || {};
        this.remotePlayers.set(uid, {
            id: uid,
            x: posData[0],
            y: posData[1],
            name: profile.name || posData[5] || "Unknown",
            h: val.h,
            a: val.a,
            level: profile.level || 1,
            party: profile.party || null // v0.00.14: Sync Party
        });

        Logger.log(`[NetworkManager] Remote player joined: ${uid} (${this.remotePlayers.get(uid).name})`);
        this.emit('playerJoined', this.remotePlayers.get(uid));

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

        // 1. Profile Sync (Level, Party)
        if (val.profile) {
            const existing = this.remotePlayers.get(uid);
            if (existing) {
                if (val.profile.level) existing.level = val.profile.level;
                if (val.profile.party !== undefined) existing.party = val.profile.party;
            }
        }

        // v0.28.2: Enhanced hybrid data parsing (Array <-> Object transition)
        let posData = null;
        if (Array.isArray(val)) {
            posData = val;
        } else if (val && typeof val === 'object') {
            if (val.p && Array.isArray(val.p)) {
                posData = val.p;
            } else if (val[0] !== undefined) {
                // Legacy structure being treated as object by Firebase due to added sub-nodes ('a' or 'h')
                posData = [val[0], val[1], val[2], val[3], val[4], val[5]];
            }
        }

        if (posData || val.ts) {
            // v0.00.05: Refresh activity for ANY update including heartbeats
            const now = Date.now();
            this.userLastSeen.set(uid, now);

            // Update local remote player timestamp to prevent ghost cleanup
            const existing = this.remotePlayers.get(uid);
            if (existing) existing.ts = now;

            this._checkHostStatus();
        }

        if (uid === this.playerId) return;

        // Position Update
        if (posData && Array.isArray(posData)) {
            const px = parseFloat(posData[0]);
            const py = parseFloat(posData[1]);

            // v0.28.1: Prevent NaN pollution which causes entities to disappear
            if (!isNaN(px) && !isNaN(py)) {
                // v0.00.03: Update Buffer
                const now = Date.now();
                const existing = this.remotePlayers.get(uid);
                const isNew = !existing;

                const data = existing || { id: uid };
                data.x = px;
                data.y = py;
                data.vx = Number(posData[2]) || 0;
                data.vy = Number(posData[3]) || 0;
                // v0.00.03: Update activity timestamp to NOW whenever any packet is processed
                data.ts = now;
                data.name = posData[5] || "Unknown";
                this.remotePlayers.set(uid, data);

                // v0.00.03: If they were deleted by cleanup but sent a move, revive them
                if (isNew) {
                    this.emit('playerJoined', data);
                } else {
                    this.emit('playerUpdate', {
                        id: uid,
                        x: px,
                        y: py,
                        vx: data.vx,
                        vy: data.vy,
                        ts: data.ts,
                        name: data.name
                    });
                }
            }
        }

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

    async inviteToParty(targetName) {
        if (!targetName || !this.playerId) return false;

        try {
            const targetUid = await this.getUidByName(targetName);
            if (!targetUid) {
                Logger.log(`[Party] Target not found: ${targetName}`);
                return 'NOT_FOUND';
            }

            if (targetUid === this.playerId) {
                return 'SELF';
            }

            // Push invite to target's inbox
            const inviteRef = this.dbRef.child(`party_invites/${targetUid}`).push();
            await inviteRef.set({
                from: this.playerId,
                fromName: window.game.localPlayer ? window.game.localPlayer.name : "Unknown",
                ts: Date.now()
            });

            return 'SENT';
        } catch (e) {
            Logger.error('Failed to invite to party', e);
            return 'ERROR';
        }
    }

    // v0.00.14: Send PvP Damage with Status Effects
    sendPlayerDamage(targetId, amount, effectType = null, effectDuration = 0, effectDamage = 0) {
        if (!this.connected || !this.playerId) return;

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
            if (val) {
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
        // Notify target that I declared war on them
        this.dbRef.child(`hostility_events/${targetUid}`).push({
            senderId: this.playerId,
            senderName: window.game.localPlayer?.name || "Unknown",
            ts: Date.now()
        });
    }

    startHostilityListeners() {
        if (!this.playerId) return;
        if (this._hostilityListenerActive) return; // Prevent double binding

        this._hostilityListenerActive = true;
        Logger.log(`[Network] Starting hostility listeners for ${this.playerId}`);

        // Listen for Incoming Hostility Declarations
        this.dbRef.child(`hostility_events/${this.playerId}`).on('child_added', (snapshot) => {
            const val = snapshot.val();
            Logger.log('[Network] Received Hostility Event:', val);
            if (val) {
                // Determine if this is a new declaration
                if (window.game && window.game.localPlayer) {
                    const lp = window.game.localPlayer;

                    if (!lp.hostileTargets.has(val.senderId)) {
                        // Mutual Hostility: Auto-add sender to my hostile list
                        lp.hostileTargets.set(val.senderId, val.senderName);

                        // Notify UI
                        if (window.game.ui) {
                            window.game.ui.logSystemMessage(`⚠️ ${val.senderName}님이 당신을 적대 관계로 등록했습니다! (상호 적대)`);
                            window.game.ui.updateHostilityUI();
                        }

                        // Save State
                        // Fix for crash: game.savePlayerData likely doesn't exist on Game instance
                        if (lp.saveState) lp.saveState();
                        else if (window.game.net) window.game.net.savePlayerData(lp.id, { ...lp.data }); // Fallback
                    }
                } else {
                    Logger.warn('[Network] Hostility Event received but localPlayer not ready. Keeping event.');
                    return; // Do NOT remove snapshot if player not ready
                }
            }
            // Only remove if processed successfully
            snapshot.ref.remove();
        });
    }

    _setupPartyListeners() {
        // Listen for Invites
        this.dbRef.child(`party_invites/${this.playerId}`).on('child_added', (snapshot) => {
            const val = snapshot.val();
            Logger.log('[Party] Received Invite:', val); // Debug Log
            if (val) {
                // Show Invite Modal
                if (window.game && window.game.ui) {
                    window.game.ui.showGenericModal(
                        "파티 초대",
                        `${val.senderName}님으로부터 파티 초대가 왔습니다. 수락하시겠습니까?`,
                        () => { // Yes
                            this.acceptPartyInvite(val.senderId);
                            // Set local party state provisional
                            window.game.localPlayer.party = { id: val.senderId, members: [val.senderId, this.playerId] };
                            // Remove hostility
                            window.game.localPlayer.hostileTargets.delete(val.senderId);
                            window.game.ui.updateHostilityUI();
                            window.game.ui.updatePartyUI(); // Need implementation
                            window.game.ui.hideGenericModal();
                        },
                        () => { // No
                            window.game.ui.hideGenericModal();
                        }
                    );
                }
            }
            // Auto-remove invite after processing
            snapshot.ref.remove();
        });

        // Listen for Responses (If I sent an invite)
        this.dbRef.child(`party_responses/${this.playerId}`).on('child_added', (snapshot) => {
            const val = snapshot.val();
            if (val && val.response === 'accept') {
                // Form Party
                if (window.game && window.game.ui) {
                    window.game.ui.logSystemMessage(`${val.responderName}님이 파티 초대를 수락했습니다!`);

                    // Init Party if not exists
                    if (!window.game.localPlayer.party) {
                        window.game.localPlayer.party = { id: this.playerId, members: [this.playerId] };
                    }
                    window.game.localPlayer.party.members.push(val.responderId);

                    // Remove hostility
                    window.game.localPlayer.hostileTargets.delete(val.responderId);
                    window.game.ui.updateHostilityUI();
                    window.game.ui.updatePartyUI();
                }
            }
            snapshot.ref.remove();
        });
    }
}
