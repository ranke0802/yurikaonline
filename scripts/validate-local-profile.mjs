import assert from 'node:assert/strict';
import { test } from 'node:test';
import LocalNetworkManager, { LOCAL_PROFILE_KEY } from '../src/js/local/LocalNetworkManager.js';
const memory = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };
globalThis.window = { game: null };

test('explicit creation, original balances, isolated namespace and reload', async () => {
    const storage = memory(); const net = new LocalNetworkManager(storage);
    assert.equal(await net.getPlayerData('local-player'), null);
    assert.equal((await net.createLocalProfile('테스트')).ok, true);
    assert.equal((await net.createLocalProfile('overwrite')).ok, false);
    assert.equal((await net.savePlayerDataPatch('local-player', { exp: 21, manastone: 4 })).ok, true);
    const reloaded = new LocalNetworkManager(storage);
    assert.equal((await reloaded.getLatestProfileSnapshot('local-player')).profile.exp, 21);
    assert.equal((await reloaded.getPlayerData('local-player')).profile.manastone, 4);
    assert.equal(storage.getItem('yurika:profile'), null);
});
test('corrupt reads and quota failures never silently create/reset a profile', async () => {
    const storage = memory(); storage.setItem(LOCAL_PROFILE_KEY, '{');
    const net = new LocalNetworkManager(storage);
    await assert.rejects(net.getPlayerData('local-player'));
    assert.equal((await net.createLocalProfile('new')).ok, false);
    const valid = memory(); const other = new LocalNetworkManager(valid); await other.createLocalProfile();
    valid.setItem = () => { throw new Error('quota'); };
    assert.equal((await other.savePlayerDataPatch('local-player', { exp: 99 })).ok, false);
    assert.equal((await other.getPlayerData('local-player')).profile.exp, 0);
    assert.equal((await other.flushProfileWrites()).ok, false);
});
test('second tab stale writer rejected', async () => {
    const storage = memory(); const first = new LocalNetworkManager(storage); await first.createLocalProfile();
    const second = new LocalNetworkManager(storage); await second.getPlayerData('local-player');
    await first.savePlayerDataPatch('local-player', { exp: 1 });
    const result = await second.savePlayerDataPatch('local-player', { exp: 90 });
    assert.equal(result.reason, 'local_profile_changed_in_another_tab');
});
test('receipt survives reload, balances and dedup acknowledgement commit together', async () => {
    const storage = memory(); const net = new LocalNetworkManager(storage); await net.createLocalProfile();
    assert.equal(net.sendReward('local-player', { rewardId: 'kill-1', exp: 10 }), true);
    await net.flushProfileWrites();
    const reloaded = new LocalNetworkManager(storage);
    await reloaded.getPlayerData('local-player');
    let applications = 0;
    await reloaded.setNormalRewardConsumer(async receipt => {
        const profile = await reloaded.getPlayerProfile('local-player'); applications++;
        return reloaded.savePlayerDataPatch('local-player', { exp: profile.exp + receipt.exp, claimedRewardIds: [receipt.rewardId] });
    });
    reloaded.sendReward('local-player', { rewardId: 'kill-1', exp: 10 }); await reloaded.flushProfileWrites();
    assert.equal(applications, 1); assert.equal((await reloaded.getPlayerProfile('local-player')).exp, 10);
    assert.equal(reloaded.isRewardServerCommitted('local-player', 'kill-1'), true);
});
test('drop owner and durable claim preserved across reload', async () => {
    const storage = memory(); const net = new LocalNetworkManager(storage); await net.createLocalProfile();
    net.spawnDrop({ id: 'drop-a', ownerId: 'local-player', type: 'manastone', amount: 3 });
    assert.equal((await net.claimDropForSettlement('drop-a', 'stranger')).ok, false);
    const claim = await net.claimDropForSettlement('drop-a', 'local-player');
    const next = new LocalNetworkManager(storage); await next.getPlayerProfile('local-player');
    assert.equal((await next.claimDropForSettlement('drop-a', 'local-player')).claimId, claim.claimId);
});
test('old settled receipts cannot pass the original optimistic reward path again', async () => {
    const storage = memory(); const net = new LocalNetworkManager(storage); await net.createLocalProfile();
    await net.savePlayerDataPatch('local-player', { claimedRewardIds: ['old-kill'] });
    window.game = { localPlayer: { id: 'local-player', claimedRewardIds: [] } };
    assert.equal(net.sendReward('local-player', { rewardId: 'old-kill', exp: 10 }), true);
    assert.equal(window.game.localPlayer.claimedRewardIds.includes('old-kill'), true);
    window.game = null;
});
test('settled drop reauthoring cannot recreate collectible currency', async () => {
    const storage = memory(); const net = new LocalNetworkManager(storage); await net.createLocalProfile();
    const drop = { id: 'durable-drop', ownerId: 'local-player', type: 'manastone', amount: 3 };
    net.spawnDrop(drop); const claim = await net.claimDropForSettlement(drop.id, 'local-player'); await net.finalizeDropSettlement(drop.id, claim.claimId);
    assert.equal(net.spawnDrop(drop), drop.id);
    assert.equal(net.isDropSpawnDurablyAccepted(drop.id), true);
    assert.deepEqual(await net.readFieldDropsSnapshot(), {});
});
test('original Player consumers persist real level-up, currency and boss rewards once', async () => {
    const { default: Player } = await import('../src/js/entities/Player.js');
    const storage = memory(); const net = new LocalNetworkManager(storage); await net.createLocalProfile();
    const player = new Player(10, 10, '테스트'); player.id = 'local-player'; player.net = net;
    window.game = { localPlayer: player, net };
    await net.setNormalRewardConsumer(reward => player.receiveNormalRewardDurably(reward));
    await net.setDurableRewardConsumer(reward => player.receiveRewardDurably(reward));
    const normal = { rewardId: 'original-normal', exp: 110, manastone: 9 };
    assert.equal(net.sendReward(player.id, normal), true);
    // Exactly the same optimistic path MonsterManager calls before async consumer.
    player.receiveReward(normal, { debounceMs: 0 });
    await net.flushProfileWrites();
    assert.equal(player.level, 2); assert.equal(player.exp, 10); assert.equal(player.manastone, 9);
    const boss = { rewardId: 'original-boss', bossReward: true, rewardKind: 'boss_exp', kind: 'boss_progress', exp: 20 };
    net.sendReward(player.id, boss); await net.flushProfileWrites();
    net.sendReward(player.id, boss); await net.flushProfileWrites();
    const profile = await net.getPlayerProfile(player.id);
    assert.equal(profile.exp, 30); assert.equal(profile.level, 2); assert.equal(profile.manastone, 9);
    assert.equal(profile.statPoints, 1);
    window.game = null;
});
test('drop stale field/epoch and incorrect settlement token are rejected', async () => {
    const storage = memory(); const net = new LocalNetworkManager(storage); await net.createLocalProfile();
    net.spawnDrop({ id: 'guarded', type: 'manastone', amount: 1 });
    assert.equal((await net.claimDropForSettlement('guarded', 'local-player', { fieldId: 'zone_2' })).ok, false);
    assert.equal((await net.claimDropForSettlement('guarded', 'local-player', { dropFieldEpoch: 8 })).ok, false);
    const claim = await net.claimDropForSettlement('guarded', 'local-player');
    assert.equal(await net.finalizeDropSettlement('guarded', 'wrong'), false);
    assert.equal(await net.finalizeDropSettlement('guarded', claim.claimId), true);
});
test('original reward interrupted by quota failure replays once after restart', async () => {
    const { default: Player } = await import('../src/js/entities/Player.js');
    const storage = memory(); const net = new LocalNetworkManager(storage); await net.createLocalProfile();
    const player = new Player(0, 0); player.id = 'local-player'; player.net = net;
    window.game = { localPlayer: player, net };
    net.sendReward(player.id, { rewardId: 'interrupted', exp: 25 });
    const originalWrite = storage.setItem; storage.setItem = () => { throw new Error('quota'); };
    await net.setNormalRewardConsumer(reward => player.receiveNormalRewardDurably(reward));
    assert.equal((await net.flushProfileWrites()).ok, false);
    assert.equal((await net.getPlayerProfile(player.id)).exp, 0);
    storage.setItem = originalWrite;
    const next = new LocalNetworkManager(storage); const nextPlayer = new Player(0, 0); nextPlayer.id = 'local-player'; nextPlayer.net = next;
    window.game = { localPlayer: nextPlayer, net: next };
    await next.setNormalRewardConsumer(reward => nextPlayer.receiveNormalRewardDurably(reward));
    assert.equal((await next.getPlayerProfile(player.id)).exp, 25);
    assert.equal(nextPlayer.exp, 25); window.game = null;
});
test('online social entry points fail closed even when a Firebase global exists', async () => {
    const net = new LocalNetworkManager(memory());
    window.firebase = new Proxy({}, { get() { throw new Error('live service access'); } });
    net.connected = true;
    assert.equal(net.sendChat('message'), false);
    assert.equal(net.sendEmote('wave'), false);
    for (const method of ['addFriendByQuery', 'sendFriendMessage', 'sendFriendGift', 'sendPartyInvite', 'acceptPartyInvite', 'sendDuelRequest']) {
        assert.equal((await net[method]('other')).reason, 'local_mode_unavailable');
    }
    delete window.firebase;
});
test('blocked browser storage getter does not crash adapter construction', async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
    try {
        let net;
        assert.doesNotThrow(() => { net = new LocalNetworkManager(); });
        await assert.rejects(net.getPlayerProfile('local-player'), { name: 'SecurityError' });
        const created = await net.createLocalProfile();
        assert.equal(created.ok, false); assert.equal(created.reason, 'Storage blocked');
    } finally {
        if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
        else delete globalThis.localStorage;
    }
});
test('rereading stale tab cannot silently authorize overwriting newer progress', async () => {
    const storage = memory(); const first = new LocalNetworkManager(storage); await first.createLocalProfile();
    const stale = new LocalNetworkManager(storage); await stale.getPlayerProfile('local-player');
    await first.savePlayerDataPatch('local-player', { exp: 50 });
    assert.equal((await stale.getPlayerProfile('local-player')).exp, 50);
    assert.equal((await stale.savePlayerDataPatch('local-player', { exp: 1 })).reason, 'local_profile_changed_in_another_tab');
    assert.equal((await first.getPlayerProfile('local-player')).exp, 50);
});
test('original MonsterManager strict solo handoff completes and releases combat gate', async () => {
    const { default: MonsterManager } = await import('../src/js/world/MonsterManager.js');
    const net = new LocalNetworkManager(memory()); await net.createLocalProfile();
    net.connected = true; net.isHost = true;
    const game = { net, zone: { currentZone: { id: 'zone_1' } } };
    window.game = game;
    const manager = new MonsterManager(game); game.monsterManager = manager;
    const fieldId = net._getCurrentFieldId();
    const handoff = manager._startHostFieldHandoff(fieldId, { settleMs: 0 });
    assert.equal(manager.isMonsterCombatBlocked(), true);
    assert.equal(await handoff, true);
    assert.equal(manager.isMonsterCombatBlocked(), false);
    assert.equal(manager._hostFieldHandoffBlockedFieldId, null);
    window.game = null;
});
test('original repeated equip/unequip preserves a single owned weapon through reload', async () => {
    const { default: Player } = await import('../src/js/entities/Player.js');
    const net = new LocalNetworkManager(memory()); await net.createLocalProfile();
    const player = new Player(0, 0); player.id = 'local-player'; player.net = net;
    window.game = { net, localPlayer: player };
    player.inventory[1] = { id: 'magic_staff', type: 'magic_staff', slot: 'weapon', name: '마력의 지팡이', instanceId: 'owned-staff' };
    await player.saveState(false, { forceImmediate: true });
    assert.equal(player.equipWeaponFromInventory(1).ok, true);
    assert.equal(player.equipWeaponFromInventory(1).ok, false);
    assert.equal(player.unequipWeapon().ok, true);
    assert.equal(player.unequipWeapon().ok, false);
    const profile = await net.getPlayerProfile(player.id);
    const copies = [...profile.inventory, profile.equipment.weapon].filter(item => item?.instanceId === 'owned-staff');
    assert.equal(copies.length, 1);
    assert.equal(profile.equipment.weapon, null);
    window.game = null;
});
test('original unequip refuses full inventory without losing equipped weapon', async () => {
    const { default: Player } = await import('../src/js/entities/Player.js');
    const player = new Player(0, 0);
    player.inventory.fill({ type: 'weapon_upgrade_stone', amount: 1 });
    player.equipment.weapon = { type: 'magic_staff', slot: 'weapon', instanceId: 'equipped' };
    assert.equal(player.unequipWeapon().ok, false);
    assert.equal(player.equipment.weapon.instanceId, 'equipped');
    assert.equal(player.inventory.some(item => item?.instanceId === 'equipped'), false);
});
test('existing equip persistence failure stays observable and retry saves one weapon', async () => {
    const { default: Player } = await import('../src/js/entities/Player.js');
    const storage = memory(); const net = new LocalNetworkManager(storage); await net.createLocalProfile();
    const player = new Player(0, 0); player.id = 'local-player'; player.net = net;
    window.game = { net, localPlayer: player };
    player.inventory[1] = { type: 'magic_staff', slot: 'weapon', instanceId: 'save-failure-staff' };
    await player.saveState(false, { forceImmediate: true });
    const originalWrite = storage.setItem; storage.setItem = () => { throw new Error('quota'); };
    // Legacy action reports its in-memory result; callers must also check save/flush.
    assert.equal(player.equipWeaponFromInventory(1).ok, true);
    assert.equal((await net.flushProfileWrites()).ok, false);
    const storedBeforeRetry = await net.getPlayerProfile(player.id);
    assert.equal(storedBeforeRetry.equipment.weapon, null);
    assert.equal(storedBeforeRetry.inventory[1].instanceId, 'save-failure-staff');
    storage.setItem = originalWrite;
    assert.equal((await player.saveState(false, { forceImmediate: true })).ok, true);
    const profile = await net.getPlayerProfile(player.id);
    assert.equal(profile.inventory[1], null);
    assert.equal(profile.equipment.weapon.instanceId, 'save-failure-staff');
    window.game = null;
});
test('failed equipment patch survives later position-only save and emits recovery state', async () => {
    const { default: Player } = await import('../src/js/entities/Player.js');
    const storage = memory(); const net = new LocalNetworkManager(storage); await net.createLocalProfile();
    const states = []; net.on('localProfileSaveState', state => states.push(state));
    const player = new Player(0, 0); player.id = 'local-player'; player.net = net;
    window.game = { net, localPlayer: player };
    player.inventory[1] = { type: 'magic_staff', slot: 'weapon', instanceId: 'pending-weapon' };
    await player.saveState(false, { forceImmediate: true });
    const originalWrite = storage.setItem; storage.setItem = () => { throw new Error('quota'); };
    player.equipWeaponFromInventory(1);
    assert.deepEqual(net.getLocalSaveStatus(), { ok: false, pending: true, reason: 'quota' });
    storage.setItem = originalWrite;
    assert.equal((await net.savePlayerDataPatch(player.id, { x: 100, y: 200 })).ok, true);
    const profile = await net.getPlayerProfile(player.id);
    assert.equal(profile.equipment.weapon.instanceId, 'pending-weapon'); assert.equal(profile.inventory[1], null);
    assert.equal(profile.x, 100); assert.equal(profile.y, 200);
    assert.deepEqual(net.getLocalSaveStatus(), { ok: true, pending: false, reason: null });
    assert.ok(states.some(state => state.pending)); assert.equal(states.at(-1).ok, true);
    window.game = null;
});
test('failed recovery snapshot is cloned, flush retryable, and absent after reload', async () => {
    const storage = memory(); const net = new LocalNetworkManager(storage); await net.createLocalProfile();
    const originalWrite = storage.setItem; storage.setItem = () => { throw new Error('quota'); };
    const patch = { equipment: { weapon: { instanceId: 'unsaved-item' } }, inventory: [null] };
    await net.savePlayerDataPatch('local-player', patch);
    patch.equipment.weapon.instanceId = 'mutated-after-save';
    const restarted = new LocalNetworkManager(storage);
    assert.equal((await restarted.getPlayerProfile('local-player')).equipment.weapon, undefined);
    assert.equal(restarted.getLocalSaveStatus().pending, false);
    storage.setItem = originalWrite;
    assert.equal((await net.flushProfileWrites()).ok, true);
    assert.equal((await net.getPlayerProfile('local-player')).equipment.weapon.instanceId, 'unsaved-item');
});
test('pending recovery cannot defeat revision fence through position save, flush or reconnect', async () => {
    const storage = memory(); const first = new LocalNetworkManager(storage); await first.createLocalProfile();
    const other = new LocalNetworkManager(storage); await other.getPlayerProfile('local-player');
    const originalWrite = storage.setItem; storage.setItem = () => { throw new Error('quota'); };
    await first.savePlayerDataPatch('local-player', { manastone: 70 });
    storage.setItem = originalWrite;
    await other.savePlayerDataPatch('local-player', { manastone: 30 });
    assert.equal((await first.savePlayerDataPatch('local-player', { x: 20 })).reason, 'local_profile_changed_in_another_tab');
    assert.equal((await first.flushProfileWrites()).ok, false);
    await first.connect({ uid: 'local-player' });
    assert.equal((await first.flushProfileWrites()).ok, false);
    assert.equal(first.getLocalSaveStatus().pending, true);
    assert.equal((await other.getPlayerProfile('local-player')).manastone, 30);
});
test('local PvE monster damage reaches only the participating local player and preserves metadata',()=>{
 const n=new LocalNetworkManager(memory()),calls=[];n.connected=n.isHost=n.zoneParticipationEnabled=true;
 globalThis.window={game:{localPlayer:{id:n.playerId,takeDamage:(...args)=>calls.push(args)}}};
 assert.equal(n.sendPlayerDamage(n.playerId,25,'poison',3,2,{monsterId:'emolga-1',impactX:42,impactY:23}),true);
 assert.deepEqual(calls[0],[25,false,false,42,23,{monsterId:'emolga-1',impactX:42,impactY:23,id:'emolga-1',type:'monster'},'poison',3,2]);
 for(const args of [[n.playerId,20],[n.playerId,20,null,0,0,{playerId:'pvp'}],['other',20,null,0,0,{monsterId:'m'}],[n.playerId,NaN,null,0,0,{monsterId:'m'}]])assert.equal(n.sendPlayerDamage(...args),false);
 n.zoneParticipationEnabled=false;assert.equal(n.sendPlayerDamage(n.playerId,20,null,0,0,{monsterId:'m'}),false);assert.equal(calls.length,1);
});
