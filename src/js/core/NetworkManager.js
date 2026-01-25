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

        this.connected = true;
        this.emit('connected');
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
            const snapshot = await this.dbRef.child(`users/${uid}`).once('value');
            return snapshot.val();
        } catch (e) {
            Logger.error('Failed to get player data', e);
            return null;
        }
    }

    async savePlayerData(uid, data) {
        if (!this.dbRef || !uid) return;
        try {
            // Save persistent profile data (level, stats, etc.)
            await this.dbRef.child(`users/${uid}/profile`).set(data);
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

    // --- Host Logic ---
    _checkHostStatus() {
        const now = Date.now();
        const timeout = 60000; // 60s Active Timeout (Relaxed)

        // Update self
        this.userLastSeen.set(this.playerId, now);

        // Failsafe: If I am the only connected user, Force Host immediately
        if (this.connectedUsers.length === 1 && this.connectedUsers[0] === this.playerId) {
            if (!this.isHost) {
                this.isHost = true;
                Logger.info('Host (Single User Force)');
                this.emit('hostChanged', true);
                this._startCleanupLoop();
            }
            return;
        }

        // Filter active users
        const activeUsers = this.connectedUsers.filter(uid => {
            if (uid === this.playerId) return true;
            const last = this.userLastSeen.get(uid) || 0;
            return (now - last) < timeout;
        });

        activeUsers.sort();

        // Host is the first ACTIVE user
        if (activeUsers.length > 0 && activeUsers[0] === this.playerId) {
            if (!this.isHost) {
                this.isHost = true;
                Logger.info('I am the HOST (Active Check)');
                this.emit('hostChanged', true);
                this._startCleanupLoop();
            }
        } else {
            if (this.isHost) {
                this.isHost = false;
                Logger.info('I am a GUEST client');
                this.emit('hostChanged', false);
                this._stopCleanupLoop();
            }
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
        const staleTimeout = 180 * 1000; // 3 minutes

        try {
            const snapshot = await this.dbRef.child('users').once('value');
            if (!snapshot.exists()) return;

            snapshot.forEach(child => {
                if (child.key === this.playerId) return;

                const val = child.val();
                let lastTs = 0;
                const posData = Array.isArray(val) ? val : (val.p || null);

                if (posData && Array.isArray(posData)) {
                    lastTs = posData[4] || 0;
                } else if (val.ts) {
                    lastTs = val.ts;
                }

                // If very old, delete from DB
                if (now - lastTs > staleTimeout) {
                    Logger.log(`[Host] Removing stale user: ${child.key}`);
                    this.dbRef.child(`users/${child.key}`).remove();
                }
            });
        } catch (e) {
            Logger.error('Cleanup failed', e);
        }
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
    sendAttack(x, y, direction, skillType = 'normal') {
        if (!this.connected || !this.playerId) return;
        const attackPacket = [Date.now(), Math.round(x), Math.round(y), direction, skillType];
        this.dbRef.child(`users/${this.playerId}/a`).set(attackPacket);
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

        // Host Logic: Timestamp
        let ts = Date.now();
        const posData = Array.isArray(val) ? val : (val.p || null);
        if (posData && Array.isArray(posData)) {
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

        this.emit('playerJoined', {
            id: uid,
            x: posData[0],
            y: posData[1],
            name: posData[5] || "Unknown"
        });
    }

    _onPlayerChanged(snapshot) {
        const uid = snapshot.key;
        const val = snapshot.val();

        // Host Logic: Update Timestamp
        const posData = Array.isArray(val) ? val : (val.p || null);
        if (posData && Array.isArray(posData)) {
            const ts = posData[4] || Date.now();
            this.userLastSeen.set(uid, ts);
            this._checkHostStatus(); // User became active, re-check
        }

        if (uid === this.playerId) return;

        // Position Update
        if (posData && Array.isArray(posData)) {
            const px = parseFloat(posData[0]);
            const py = parseFloat(posData[1]);

            // v0.28.1: Prevent NaN pollution which causes entities to disappear
            if (!isNaN(px) && !isNaN(py)) {
                this.emit('playerUpdate', {
                    id: uid,
                    x: px,
                    y: py,
                    vx: posData[2] || 0,
                    vy: posData[3] || 0,
                    ts: posData[4] || Date.now(),
                    name: posData[5] || "Unknown"
                });
            }
        }

        // Attack Update
        if (val && val.a && Array.isArray(val.a)) {
            this.emit('playerAttack', {
                id: uid,
                ts: val.a[0],
                x: val.a[1],
                y: val.a[2],
                dir: val.a[3],
                skillType: val.a[4] || 'normal' // v0.28.0
            });
        }

        // v0.28.0: HP Update
        if (val && val.h && Array.isArray(val.h)) {
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
        this._checkHostStatus();

        Logger.log(`Player Left: ${uid}`);
        this.emit('playerLeft', uid);
    }
}
