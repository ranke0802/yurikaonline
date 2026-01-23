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
        // Don't send if standing still? (Optional optimization, but keep heartbeat for now)

        const packet = [
            Math.round(x),
            Math.round(y),
            parseFloat(vx.toFixed(2)),
            parseFloat(vy.toFixed(2)),
            now
        ];

        // Fire and forget
        this.dbRef.child(`users/${this.playerId}`).set(packet);
        // Logger.log(`[Net] Sent: ${Math.round(x)}, ${Math.round(y)}`);
        this.lastSyncTime = now;
    }

    _onPlayerAdded(snapshot) {
        const uid = snapshot.key;
        if (uid === this.playerId) return;

        const val = snapshot.val(); // Expecting array [x,y,vx,vy,ts]
        if (!Array.isArray(val)) return; // Sanity check

        // Logger.log(`[Net] Player Joined: ${uid}`);
        this.emit('playerJoined', { id: uid, x: val[0], y: val[1] });
    }

    _onPlayerChanged(snapshot) {
        const uid = snapshot.key;
        if (uid === this.playerId) return;

        const val = snapshot.val();
        if (!Array.isArray(val)) return;

        // Emit for interpolation in RemotePlayer entity
        this.emit('playerUpdate', {
            id: uid,
            x: val[0],
            y: val[1],
            vx: val[2],
            vy: val[3],
            ts: val[4]
        });
    }

    _onPlayerRemoved(snapshot) {
        const uid = snapshot.key;
        Logger.log(`Player Left: ${uid}`);
        this.emit('playerLeft', uid);
    }
}
