import './lib/qa-preflight.cjs';
// Actual production-version Firebase SDK, isolated loopback protocol fixture.
// Install firebase@10.7.1 and ws in an isolated directory, then set
// YURIKA_FIREBASE_FIXTURE_ROOT to that directory. This is not a full emulator.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import NetworkManager from '../src/js/core/NetworkManager.js';
import CampPreparation from '../src/js/core/CampPreparation.js';
const require = createRequire(resolve(process.env.YURIKA_FIREBASE_FIXTURE_ROOT || '.', 'package.json'));
const firebase = require('firebase/compat/app'); require('firebase/compat/database');
assert.equal(firebase.SDK_VERSION, '10.7.1');
const { Server } = require('ws');
const server = new Server({ host: '127.0.0.1', port: 0 });
await new Promise(resolve => server.on('listening', resolve));
const port = server.address().port;
const profile = { name: 'isolated-mage', level: 19, exp: 2411, maxExp: 147789, manastone: 12900,
    currentZoneId: 'zone_4', x: 722, y: 611, _profileRevision: 41,
    inventory: [{ type: 'manastone', amount: 12900 }], equipment: {}, skillLevels: { fireball: 4 } };
let record = structuredClone(profile), writes = 0;
server.on('connection', socket => {
    const send = data => socket.send(JSON.stringify(data));
    send({ t: 'c', d: { t: 'h', d: { ts: Date.now(), v: '5', h: `127.0.0.1:${port}`, s: 'isolated-fixture' } } });
    socket.on('message', raw => {
        const message = JSON.parse(raw); if (message.t !== 'd') return;
        const { r, a, b } = message.d;
        if (a === 'q') send({ t: 'd', d: { a: 'd', b: { p: b.p, d: record } } });
        if (a === 'p') { record = b.d; writes++; }
        send({ t: 'd', d: { r, b: { s: 'ok', d: {} } } });
    });
});
const app = firebase.initializeApp({ projectId: 'demo-yurika-camp', databaseURL: 'https://demo-yurika-camp.firebaseio.com' }, 'isolated-cache-proof');
const db = app.database(); db.useEmulator('127.0.0.1', port);
const values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
globalThis.firebase = { database: () => db };
globalThis.localStorage = storage;
globalThis.window = { firebase: globalThis.firebase, localStorage: storage };
const uid = 'isolated-sdk-cache';
const net = new NetworkManager(); clearInterval(net._batchTimer);
net.playerId = uid; net.connected = true; net.zoneParticipationEnabled = false;
const fixed = net._runPreparedProfilePatchTransaction;
const game = { net, isLocalMode: false }; window.game = game;
const prep = new CampPreparation(game, { uid }, profile, { baseStats: { maxHp: 100, maxMp: 50, atk: 10 }, growthStats: { hp: 10, mp: 5, atk: 1, def: 1 } });
game.localPlayer = prep.player;
const deadline = setTimeout(() => { console.error('SDK fixture timed out'); process.exit(1); }, 15000);
try {
    assert.equal((await net.getPlayerProfile(uid, { throwOnError: true })).level, 19);
    assert.equal((await prep.flush()).ok, true);
    assert.equal(writes, 0, 'unchanged camp with no journal never writes');
    net._storeLocalProfilePatchJournal(uid, { manastone: 12890 }, { checkpointPolicy: 'durable' });
    net._runPreparedProfilePatchTransaction = (ref, update) => ref.transaction(update);
    for (let attempt = 0; attempt < 3; attempt++) {
        assert.equal((await net.getPlayerProfile(uid, { throwOnError: true })).level, 19);
        assert.equal((await prep.flush()).reason, 'profile_missing');
        assert.equal(writes, 0);
        assert.equal(record.manastone, 12900);
    }
    console.log('RED v129: actual SDK once reads succeed; three guarded flushes abort profile_missing with no server write.');
    net._runPreparedProfilePatchTransaction = fixed;
    assert.equal((await prep.flush()).ok, true);
    assert.equal(record.manastone, 12890); assert.equal(record.level, 19);
    assert.equal(record.currentZoneId, 'zone_4'); assert.equal(writes, 1);
    assert.equal(net.getLocalProfilePatchJournal(uid), null);
    assert.equal((await prep.flush()).ok, true); assert.equal(writes, 1);
    const saved = await net.getPlayerProfile(uid, { throwOnError: true });
    assert.equal(saved.manastone, 12890); assert.equal(saved.level, 19);
    console.log('GREEN retained listener: one journal commit, clean reentry zero writes, saved Lv19/zone4 retained.');
} finally {
    clearTimeout(deadline); db.goOffline(); await app.delete();
    for (const client of server.clients) client.terminate();
    await new Promise(resolve => server.close(resolve));
}
