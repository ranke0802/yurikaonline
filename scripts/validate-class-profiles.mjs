import test from 'node:test';
import assert from 'node:assert/strict';
import { projectClassProfile, attachClassProfile, buildClassProfilePatch } from '../src/js/core/ClassProfiles.js';
import NetworkManager from '../src/js/core/NetworkManager.js';
const mage = { name: 'Legacy', level: 28, exp: 432, maxExp: 1000, manastone: 900, skillLevels: { laser: 7 }, equipment: { weapon: { type: 'staff', rarity: 'epic' } }, inventory: [null, { type: 'spare', rarity: 'rare' }], questData: { bossKilled: true } };
test('legacy and unknown classes preserve Mage without mutation', () => {
 const original = structuredClone(mage);
 assert.equal(projectClassProfile(mage).level, 28);
 assert.equal(projectClassProfile(mage, 'unknown').activeClassId, 'wizard');
 assert.deepEqual(mage, original);
});
test('new class does not inherit Mage equipment, level, skills or saved HP', () => {
 const p = projectClassProfile({ ...mage, hp: 500 }, 'witch');
 assert.equal(p.level, 1); assert.deepEqual(p.equipment, { weapon: null }); assert.deepEqual(p.skillLevels, { lifeDrain: 1, poison: 1, summon: 1, berserk: 1 });
 assert.equal(p.hp, undefined); assert.equal(p.manastone, 900); assert.deepEqual(p.questData, mage.questData);
});
test('class switch and reentry isolate progress and preserve shared item ownership', () => {
 const net = Object.create(NetworkManager.prototype); let account = structuredClone(mage); account.activeClassId = 'witch';
 const player = projectClassProfile(account); attachClassProfile(player, account);
 const spare = player.inventory[1];
 const patch = buildClassProfilePatch(player, { level: 5, exp: 20, skillLevels: { poisonCloud: 3 }, equipment: { weapon: spare }, inventory: [null, null], manastone: 800 });
 account = net._mergeProfileData(account, patch);
 assert.equal(account.level, 28); assert.deepEqual(account.equipment, mage.equipment);
 assert.equal(projectClassProfile(account).level, 5);
 assert.equal(projectClassProfile(account, 'wizard').skillLevels.laser, 7);
 assert.equal(projectClassProfile(account, 'archer').level, 1);
 assert.equal(net._getProfileInventoryScore(account), net._getProfileInventoryScore(mage));
 const restored = projectClassProfile(JSON.parse(JSON.stringify(account))); attachClassProfile(restored, account);
 const hpPatch = buildClassProfilePatch(restored, { hp: 7 });
 assert.equal(hpPatch.classProfiles.witch.level, 5); assert.equal(hpPatch.classProfiles.witch.skillLevels.poisonCloud, 3);
 assert.equal(hpPatch.hp, undefined); assert.equal(hpPatch.classProfiles.witch.hp, 7);
});
test('Mage patch stays root and sibling class state is retained by existing merge', () => {
 const net = Object.create(NetworkManager.prototype); const account = { ...mage, classProfiles: { witch: { level: 5 } } }; const player = {}; attachClassProfile(player, account);
 const result = net._mergeProfileData(account, buildClassProfilePatch(player, { exp: 450 }));
 assert.equal(result.exp, 450); assert.equal(result.classProfiles.witch.level, 5);
});
test('presence exposes selected class while canonical Mage stays untouched', () => {
 const net = Object.create(NetworkManager.prototype);
 const account = { ...structuredClone(mage), activeClassId: 'witch', classProfiles: { witch: { level: 4, defense: 2, equipment: { weapon: null } } } };
 const before = JSON.stringify(account);
 const presence = net._buildZoneProfileSnapshot(account);
 assert.equal(presence.activeClassId, 'witch'); assert.equal(presence.level, 4); assert.deepEqual(presence.equipment, { weapon: null });
 assert.equal(JSON.stringify(account), before);
 const patch = net._buildZoneProfilePatch({ activeClassId: 'witch', classProfiles: { witch: { level: 6, defense: 3 } } });
 assert.equal(patch.level, 6); assert.equal(patch.defense, 3); assert.equal(patch.equipment, undefined);
});
test('inactive equipment cannot be equipped again by switching classes', () => {
 const net = Object.create(NetworkManager.prototype);
 const item = { type: 'spare', rarity: 'rare' };
 const account = { ...structuredClone(mage), inventory: [null], activeClassId: 'archer', classProfiles: { witch: { equipment: { weapon: item } } } };
 const archer = projectClassProfile(account);
 assert.equal(archer.inventory.includes(item), false); assert.equal(archer.equipment.weapon, null);
 assert.deepEqual(projectClassProfile(account, 'witch').equipment.weapon, item);
 assert.deepEqual(projectClassProfile(account, 'wizard').equipment.weapon, mage.equipment.weapon);
 assert.equal(net._getProfileInventoryScore(account), net._getProfileInventoryScore(mage));
});
test('support and summon inbox routes require party/host evidence and never damage owner', () => {
 const net = Object.create(NetworkManager.prototype); let receive; let damage = 0; const supports = [], summons = [];
 net.playerId = 'owner'; net.currentHostId = 'host'; net._isPayloadForCurrentField = () => true;
 net.remotePlayers = new Map([['ally', { party: { hostId: 'party' } }], ['stranger', { party: { hostId: 'other' } }]]);
 net.dbRef = { child: () => ({ on: (_event, callback) => { receive = callback; } }) };
 const oldWindow = globalThis.window;
 globalThis.window = { game: { localPlayer: { maxHp: 100, party: { hostId: 'party', members: ['owner', 'ally'] },
   takeDamage: () => damage++, classCombat: { receiveSupport: event => supports.push(event), receiveSummonDamage: (...event) => summons.push(event) } } } };
 try {
   net._setupDamageListeners();
   const send = (attackerId, meta, amount = 0) => receive({ val: () => ({ attackerId, meta, damage: amount, ts: Date.now() }), ref: { remove() {} } });
   send('ally', { classSupport: { type: 'berserk', duration: 999 } });
   send('stranger', { classSupport: { type: 'heal', amount: 100 } });
   send('ally', { classSupport: { type: 'heal', amount: 300 } });
   send('stranger', { summonId: 's1', monsterId: 'm1' }, 10);
   send('host', { summonId: 's1', monsterId: 'm1' }, 10);
   assert.deepEqual(supports, [{ type: 'berserk', duration: 10, potency: 1 }, { type: 'heal', amount: 100 }]);
   assert.deepEqual(summons, [['s1', 10]]); assert.equal(damage, 0);
   send('ally',{classSupport:{type:'berserk',potency:1.82}});assert.equal(supports.at(-1).potency,1.82);
   send('ally',{classSupport:{type:'berserk',potency:999}});assert.equal(supports.at(-1).potency,3);
 } finally { globalThis.window = oldWindow; }
});

test('ordinary patches never overwrite active selection; Mage patch shape remains exact', () => {
 const wizard = { activeClassId: 'wizard' };
 assert.deepEqual(buildClassProfilePatch(wizard, { inventory: [] }), { inventory: [] });
 const witch = { activeClassId: 'witch', classProfiles: {} };
 assert.equal(Object.hasOwn(buildClassProfilePatch(witch, { hp: 8 }), 'activeClassId'), false);
 assert.deepEqual(buildClassProfilePatch(witch, { inventory: [] }), { inventory: [] });
});
