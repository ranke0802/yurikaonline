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
        this.syncInterval = 100; // 10Hz Update Rate (Mobile Friendly)
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

        // 2. presence check
        const myRef = this.dbRef.child(`users/${this.playerId}`);
        // Commented out to allow position persistence on refresh.
        // Stale users are cleaned up by Host after 5 minutes of inactivity.
        // myRef.onDisconnect().remove();

        this.connected = true;
        this.emit('connected');
    }

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

    // --- Host Logic ---
    _checkHostStatus() {
        const now = Date.now();
        const timeout = 60000; // 60s Active Timeout (Relaxed)

        // Update self
        this.userLastSeen.set(this.playerId, now);

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

    // Packet: [x, y, vx, vy, timestamp]
    // Compact array to save bandwidth (360MB daily limit optimization)
    sendMovePacket(x, y, vx, vy) {
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
            now
        ];

        this.lastPacketData = packet;
        this.lastSyncTime = now;

        // Update Position Node 'p'
        this.dbRef.child(`users/${this.playerId}/p`).set(packet).catch(e => { });
    }

    sendAttack(x, y, direction) {
        if (!this.connected || !this.playerId) return;
        // Attack Packet: [timestamp, x, y, direction]
        const attackPacket = [Date.now(), Math.round(x), Math.round(y), direction];
        // Update Attack Node 'a'
        this.dbRef.child(`users/${this.playerId}/a`).set(attackPacket);
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

        this.emit('playerJoined', { id: uid, x: posData[0], y: posData[1] });
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
            this.emit('playerUpdate', {
                id: uid,
                x: posData[0],
                y: posData[1],
                vx: posData[2],
                vy: posData[3],
                ts: posData[4]
            });
        }

        // Attack Update
        if (val && val.a && Array.isArray(val.a)) {
            this.emit('playerAttack', {
                id: uid,
                ts: val.a[0],
                x: val.a[1],
                y: val.a[2],
                dir: val.a[3]
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
