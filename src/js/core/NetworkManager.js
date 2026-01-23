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
        // Map<uid, {data: Object, target: Object, lastUpdate: number}>
        // data: Current interpolated state, target: Next target state form server
        this.remotePlayers = new Map();

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

        // 2. Remove self on disconnect (Presence System)
        const myRef = this.dbRef.child(`users/${this.playerId}`);
        myRef.onDisconnect().remove();

        this.connected = true;
        this.emit('connected');
    }

    // Packet: [x, y, vx, vy, timestamp]
    // Compact array to save bandwidth (360MB daily limit optimization)
    sendMovePacket(x, y, vx, vy) {
        if (!this.connected || !this.playerId) return;

        const now = Date.now();
        // Throttle Network Calls
        if (now - this.lastSyncTime < this.syncInterval) return;

        const packet = [
            Math.round(x),
            Math.round(y),
            parseFloat(vx.toFixed(2)),
            parseFloat(vy.toFixed(2)),
            now
        ];

        // Update Position Node 'p'
        this.dbRef.child(`users/${this.playerId}/p`).set(packet);
        this.lastSyncTime = now;
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
        if (uid === this.playerId) return;

        const val = snapshot.val();
        // Support new Object {p:[], a:[]} and legacy Array []
        const posData = Array.isArray(val) ? val : (val.p || null);

        if (!posData || !Array.isArray(posData)) return;

        // Logger.log(`[Net] Player Joined: ${uid}`);
        this.emit('playerJoined', { id: uid, x: posData[0], y: posData[1] });
    }

    _onPlayerChanged(snapshot) {
        const uid = snapshot.key;
        if (uid === this.playerId) return;

        const val = snapshot.val();
        const posData = Array.isArray(val) ? val : (val.p || null);

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
        Logger.log(`Player Left: ${uid}`);
        this.emit('playerLeft', uid);
    }
}
