#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import NetworkManager from '../src/js/core/NetworkManager.js';
import ItemDataManager from '../src/js/core/ItemDataManager.js';
import { DURABLE_BOSS_REWARD_ARCHIVED_CATALOGS } from '../src/js/core/DurableBossRewardPolicy.js';
import MonsterManager from '../src/js/world/MonsterManager.js';
import Monster from '../src/js/entities/Monster.js';
import Player from '../src/js/entities/Player.js';
import WorldScene from '../src/js/world/scenes/WorldScene.js';

globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { hidden: false };

function createEventBus(extra = {}) {
    const events = new Map();
    return {
        events,
        on(name, handler) {
            const handlers = events.get(name) || [];
            handlers.push(handler);
            events.set(name, handlers);
        },
        off(name, handler) {
            events.set(name, (events.get(name) || []).filter((entry) => entry !== handler));
        },
        emit(name, payload) {
            (events.get(name) || []).slice().forEach((handler) => handler(payload));
        },
        ...extra
    };
}

function createDurableRewardItemData() {
    const affix = {
        id: 'tidal_blue_flame',
        rolledEffects: {
            fireballChainChance: { min: 0.24, max: 0.38 },
            fireballChainDamageRatio: { min: 0.45, max: 0.65 }
        }
    };
    const pool = { id: 'tidal_staff_affixes', affixes: [affix] };
    const definition = {
        id: 'tidal_staff',
        name: 'Tidal Staff',
        stackable: false,
        slot: 'weapon',
        rarity: 'boss',
        dropSource: ['ruin_wobbuffet'],
        prefixPool: pool.id,
        enhancementRuleSet: 'weapon_standard_1_to_10',
        baseStats: { attackPower: 8, critRate: 0.06, mpRegen: 4 },
        enhancementBonuses: { attackPowerPerLevel: 1, critRatePerLevel: 0.01 },
        visuals: null,
        icon: { fallbackEmoji: 'staff' }
    };
    const itemData = {
        loadedCatalog: { schemaVersion: 1 },
        getBossDrops: (monsterId) => (
            monsterId === 'ruin_wobbuffet'
                ? [{ monsterId, itemId: definition.id, chance: 1, quantity: 1 }]
                : []
        ),
        getItemDefinition: (itemId) => (itemId === definition.id ? definition : null),
        getAffixPool: (poolId) => (poolId === pool.id ? pool : null),
        getAffixDefinition: (affixId) => (affixId === affix.id ? affix : null),
        createRewardItem: (itemId, options = {}) => {
            if (itemId !== definition.id) return null;
            return {
                id: definition.id,
                type: definition.id,
                instanceId: options.instanceId,
                name: definition.name,
                stackable: false,
                amount: 1,
                slot: 'weapon',
                rarity: 'boss',
                prefixId: options.prefixId,
                rolledValues: { ...(options.rolledValues || {}) },
                isNewlyAcquired: !!options.isNewlyAcquired,
                enhancementLevel: Math.max(0, Number(options.enhancementLevel || 0)),
                enhancementRuleSet: definition.enhancementRuleSet,
                baseStats: { ...definition.baseStats },
                enhancementBonuses: { ...definition.enhancementBonuses }
            };
        },
        normalizeInventoryItem(item) {
            return this.createRewardItem(item?.type || item?.id, item);
        }
    };
    return itemData;
}

function createMemoryRewardDatabase(initialRecords = {}) {
    const records = new Map(Object.entries(initialRecords));
    const transactionAttempts = [];
    const operationLog = [];
    let transientTransactionFailures = 0;
    let transientUpdateFailures = 0;
    let pushSequence = 0;
    let beforeTransactionHook = null;

    const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));
    const makeRecordRef = (path) => ({
        key: path.split('/').at(-1),
        async transaction(update) {
            transactionAttempts.push(path);
            operationLog.push(`transaction:${path}`);
            if (beforeTransactionHook) {
                const hook = beforeTransactionHook;
                beforeTransactionHook = null;
                await hook(path, records);
            }
            if (transientTransactionFailures > 0) {
                transientTransactionFailures -= 1;
                const error = new Error('temporary disconnect');
                error.code = 'NETWORK_ERROR';
                throw error;
            }
            const current = clone(records.get(path) ?? null);
            const next = update(current);
            if (next === undefined) {
                return {
                    committed: false,
                    snapshot: makeRecordSnapshot(path, records.get(path) ?? null)
                };
            }
            if (next === null) records.delete(path);
            else records.set(path, clone(next));
            return {
                committed: true,
                snapshot: makeRecordSnapshot(path, records.get(path))
            };
        },
        async remove() {
            operationLog.push(`remove:${path}`);
            Array.from(records.keys()).forEach((recordPath) => {
                if (recordPath === path || recordPath.startsWith(`${path}/`)) records.delete(recordPath);
            });
        },
        async once() {
            return makeRecordSnapshot(path, records.get(path) ?? null);
        }
    });
    const makeRecordSnapshot = (path, value) => ({
        key: path.split('/').at(-1),
        ref: makeRecordRef(path),
        val: () => clone(value),
        forEach(callback) {
            Array.from(records.entries())
                .filter(([recordPath]) => {
                    if (!recordPath.startsWith(`${path}/`)) return false;
                    return !recordPath.slice(path.length + 1).includes('/');
                })
                .forEach(([recordPath, recordValue]) => callback(makeRecordSnapshot(recordPath, recordValue)));
        }
    });
    const makeInboxSnapshot = (path) => ({
        key: path.split('/').at(-1),
        val: () => Object.fromEntries(
            Array.from(records.entries())
                .filter(([recordPath]) => recordPath.startsWith(`${path}/`))
                .map(([recordPath, value]) => [recordPath.slice(path.length + 1), clone(value)])
        ),
        forEach(callback) {
            Array.from(records.entries())
                .filter(([recordPath]) => recordPath.startsWith(`${path}/`))
                .forEach(([recordPath, value]) => callback(makeRecordSnapshot(recordPath, value)));
        }
    });
    const makeInboxRef = (path) => ({
        async once() {
            return makeInboxSnapshot(path);
        },
        push(value) {
            pushSequence += 1;
            const key = `receipt_${pushSequence}`;
            const recordPath = `${path}/${key}`;
            const ref = makeRecordRef(recordPath);
            ref.key = key;
            if (value !== undefined) records.set(recordPath, clone(value));
            return ref;
        }
    });

    return {
        records,
        transactionAttempts,
        operationLog,
        dbRef: {
            async update(updates) {
                operationLog.push('update:root');
                if (transientUpdateFailures > 0) {
                    transientUpdateFailures -= 1;
                    const error = new Error('temporary root update disconnect');
                    error.code = 'NETWORK_ERROR';
                    throw error;
                }
                Object.entries(updates || {}).forEach(([path, value]) => {
                    if (value === null) {
                        Array.from(records.keys()).forEach((recordPath) => {
                            if (recordPath === path || recordPath.startsWith(`${path}/`)) records.delete(recordPath);
                        });
                    }
                    else records.set(path, clone(value));
                });
            },
            child(path) {
                if (path.split('/').length === 2
                    && (path.startsWith('durable_rewards_v1/') || path.startsWith('rewards/'))) {
                    return makeInboxRef(path);
                }
                return makeRecordRef(path);
            }
        },
        failNextTransactions(count = 1) {
            transientTransactionFailures = Math.max(0, Number(count || 0));
        },
        failNextUpdates(count = 1) {
            transientUpdateFailures = Math.max(0, Number(count || 0));
        },
        beforeNextTransaction(hook) {
            beforeTransactionHook = typeof hook === 'function' ? hook : null;
        }
    };
}

async function validateNetworkFieldAndBatchContracts() {
    const unavailableNet = new NetworkManager();
    await assert.rejects(
        unavailableNet.readMonsterHostSnapshot({ throwOnError: true }),
        /unavailable/,
        'strict monster snapshot reads must fail while disconnected'
    );
    await assert.rejects(
        unavailableNet.readFieldDropsSnapshot({ throwOnError: true }),
        /unavailable/,
        'strict drop snapshot reads must fail while disconnected'
    );
    await assert.rejects(
        unavailableNet.readFieldBossState({ bossMonsterId: 'ruin_wobbuffet', throwOnError: true }),
        /unavailable/,
        'strict boss lifecycle reads must fail while disconnected'
    );

    const net = new NetworkManager();
    net.playerId = 'player_a';
    net._activeZoneFieldId = 'zone_3';
    window.game = {
        zone: { currentZone: { id: 'zone_3' } },
        localPlayer: {
            party: {
                members: ['player_a', 'player_b'],
                hostId: 'player_a',
                mode: 'party',
                fieldId: 'zone_1__party__player_a'
            }
        }
    };

    assert.equal(
        net._getCurrentFieldId(),
        'zone_3__party__player_a',
        'persisted party field must be rebased onto the active map'
    );

    const encoded = net._buildMonsterRealtimeCellPayload({
        x: 100,
        y: 200,
        hp: 300,
        maxHp: 300,
        type: 'thunder_pikachu',
        state: 'aggro',
        rev: 4,
        ts: Date.now(),
        isBoss: true,
        spawnGroupId: 'zone_3:field_boss',
        lastAttackerId: 'player_a',
        damageContributors: ['player_a', 'player_b'],
        damageContributorLevels: [['player_a', 18], ['player_b', 27]]
    });
    const decoded = net._decorateMonsterCellPayload('0_0', encoded);
    assert.equal(decoded.spawnGroupId, 'zone_3:field_boss');
    assert.equal(decoded.lastAttackerId, 'player_a');
    assert.deepEqual(decoded.damageContributors, ['player_a', 'player_b']);
    assert.deepEqual(decoded.damageContributorLevels, [['player_a', 18], ['player_b', 27]]);

    const writes = [];
    net.connected = true;
    net.dbRef = { update: async (updates) => writes.push(updates) };
    for (let index = 0; index < 23; index += 1) {
        net.queueBatchUpdate('monster_damage', {
            mid: `monster_${index}`,
            dmg: index + 1,
            fieldId: 'zone_3__party__player_a'
        });
    }
    await net.flushBatchQueue();
    const batches = Object.values(writes[0] || {});
    assert.equal(batches.length, 3, '23 events must be split into 10/10/3 batches');
    assert.equal(batches.reduce((sum, batch) => sum + batch.items.length, 0), 23);
    assert.ok(batches.every((batch) => batch.items.length <= 10 && batch.count === batch.items.length));

    let authoredDamagePayload = null;
    const originalQueueBatchUpdate = net.queueBatchUpdate.bind(net);
    net.queueBatchUpdate = (type, payload) => {
        if (type === 'monster_damage') authoredDamagePayload = payload;
    };
    window.game.localPlayer.level = 37;
    net.sendMonsterDamage('boss_level_snapshot', 25);
    net.queueBatchUpdate = originalQueueBatchUpdate;
    assert.equal(authoredDamagePayload.attackerLevel, 37, 'monster damage packets must carry the contributor level snapshot');

    window.game.localPlayer.party = { members: ['player_a'], hostId: 'player_a', mode: 'solo' };
    net._activeZoneFieldId = 'zone_2';
    window.game.zone.currentZone.id = 'zone_2';
    net.currentHostId = 'new_host';
    const departedAt = Date.now();
    net._recentRewardAuthorities.set('zone_1__solo__player_a', {
        hostId: 'old_host',
        departedAt,
        expiresAt: departedAt + 10000
    });
    assert.equal(net._validateIncomingRewardPayload({
        fieldId: 'zone_1__solo__player_a',
        hostId: 'old_host',
        ts: departedAt,
        items: [{ id: 'magic_staff', amount: 1 }]
    }, departedAt + 100).ok, true, 'fresh reward from the just-departed field host must survive travel');
    assert.equal(net._validateIncomingRewardPayload({
        fieldId: 'zone_1__solo__player_a',
        hostId: 'forged_host',
        ts: departedAt
    }, departedAt + 100).ok, false, 'recent-field grace must remain bound to its recorded host');
    assert.equal(net._validateIncomingRewardPayload({
        fieldId: 'zone_1__solo__player_a',
        hostId: 'old_host',
        ts: departedAt + 3000
    }, departedAt + 3100).ok, false, 'a departed host cannot mint rewards after the handoff allowance');

    const currentFieldId = net._getCurrentFieldId();
    const retiredAt = departedAt + 4000;
    net._rememberFormerHostRewardAuthority(currentFieldId, 'retired_host', retiredAt);
    assert.equal(net._validateIncomingRewardPayload({
        fieldId: currentFieldId,
        hostId: 'retired_host',
        ts: retiredAt,
        rewardId: 'boss_reward_handoff'
    }, retiredAt + 100).ok, true, 'an already-authored reward must survive same-field host handoff');
    assert.equal(net._validateIncomingRewardPayload({
        fieldId: currentFieldId,
        hostId: 'retired_host',
        ts: retiredAt + 3000
    }, retiredAt + 3100).ok, false, 'retired host authority must have an issuance upper bound');

    net.currentHostId = 'retired_host_2';
    net._currentHostFieldId = currentFieldId;
    net.connectedUsers = ['new_host'];
    net.zoneParticipationEnabled = true;
    net.isHost = false;
    net._buildHostCandidate = (uid) => ({
        uid,
        bucket: uid === 'new_host' ? 4 : 3,
        visibility: 'visible',
        visibilityTs: retiredAt,
        lastVisibleTs: retiredAt,
        lastSeen: retiredAt
    });
    net._refreshMinimapMonsterSnapshotListener = () => {};
    net._checkHostStatus();
    assert.ok(
        net._recentFormerHostAuthorities.has(net._getFormerHostAuthorityKey(currentFieldId, 'retired_host_2')),
        'host election must record the previous host even when this client stays a guest observer'
    );
    assert.equal(net.isHost, false);

    window.game.localPlayer.party = {
        members: ['player_a', 'player_b'],
        hostId: 'player_a',
        mode: 'party',
        fieldId: 'zone_2__party__player_a'
    };
    const sharedFieldId = net._getCurrentFieldId();
    net.remotePlayers.clear();
    net._presenceCache.set('player_b', {
        uid: 'player_b',
        fieldId: sharedFieldId,
        cellId: '2_2',
        ts: Date.now(),
        visibility: 'visible'
    });
    net._zoneUserCache.set('player_b', {
        p: [900, 920, 0, 0, Date.now(), 'Player B'],
        profile: {
            name: 'Player B',
            level: 12,
            party: window.game.localPlayer.party
        }
    });
    net._hydrateCachedRemotePlayersForCurrentField({ emitTransientState: false });
    assert.ok(net.remotePlayers.has('player_b'), 'idle party peers already in the destination field must be hydrated');
    net._presenceCache.set('player_b', {
        ...net._presenceCache.get('player_b'),
        fieldId: 'zone_1__party__player_a'
    });
    net._hydrateCachedRemotePlayersForCurrentField({ emitTransientState: false });
    assert.equal(net.remotePlayers.has('player_b'), false, 'out-of-field peers must not remain in the runtime buffer');

    const snapshotNet = new NetworkManager();
    snapshotNet.playerId = 'snapshot_host';
    snapshotNet.connected = true;
    snapshotNet.isHost = true;
    snapshotNet._activeZoneFieldId = 'zone_3';
    snapshotNet.shouldUseMonsterQuietMode = () => false;
    snapshotNet.shouldUseMonsterCellSync = () => true;
    snapshotNet.shouldUseMonsterHostSnapshot = () => true;
    window.game = {
        zone: { currentZone: { id: 'zone_3' } },
        localPlayer: { party: { members: ['snapshot_host'], hostId: 'snapshot_host', mode: 'solo' } }
    };
    let snapshotWrite = null;
    snapshotNet.dbRef = { update: async (updates) => { snapshotWrite = updates; } };
    await snapshotNet.sendMonsterUpdate('boss_1', {
        x: 1200,
        y: 900,
        hp: 7777,
        maxHp: 12000,
        type: 'thunder_pikachu',
        state: 'aggro',
        rev: 19,
        ts: Date.now(),
        cellId: '1_1',
        isBoss: true,
        spawnGroupId: 'zone_3:field_boss',
        lastAttackerId: 'player_b',
        damageContributors: ['player_a', 'player_b'],
        damageContributorLevels: [['player_a', 12], ['player_b', 26]],
        immediate: true
    });
    const snapshotPath = Object.keys(snapshotWrite || {}).find((path) => path.includes('monster_host_snapshot'));
    assert.ok(snapshotPath, 'every boss HP/contributor delta must refresh the host snapshot');
    assert.equal(snapshotWrite[snapshotPath].hp, 7777);
    assert.equal(snapshotWrite[snapshotPath].spawnGroupId, 'zone_3:field_boss');
    assert.deepEqual(snapshotWrite[snapshotPath].damageContributors, ['player_a', 'player_b']);
    assert.deepEqual(snapshotWrite[snapshotPath].damageContributorLevels, [['player_a', 12], ['player_b', 26]]);

    const retrySnapshotNet = new NetworkManager();
    retrySnapshotNet.playerId = 'retry_snapshot_host';
    retrySnapshotNet.connected = true;
    retrySnapshotNet.isHost = true;
    retrySnapshotNet._activeZoneFieldId = 'zone_3';
    retrySnapshotNet.shouldUseMonsterQuietMode = () => false;
    retrySnapshotNet.shouldUseMonsterCellSync = () => true;
    retrySnapshotNet.shouldUseMonsterHostSnapshot = () => true;
    let retrySnapshotAttempt = 0;
    const retrySnapshotWrites = [];
    retrySnapshotNet.dbRef = {
        update: async (updates) => {
            retrySnapshotAttempt += 1;
            retrySnapshotWrites.push(updates);
            if (retrySnapshotAttempt === 1) throw new Error('transient monster snapshot failure');
        }
    };
    const retryResult = await retrySnapshotNet.sendMonsterUpdate('retry_boss', {
        x: 1400,
        y: 950,
        hp: 6000,
        maxHp: 12000,
        type: 'thunder_pikachu',
        state: 'aggro',
        rev: 22,
        ts: Date.now(),
        cellId: '2_1',
        isBoss: true,
        lastAttackerId: 'departed_player',
        damageContributors: ['departed_player'],
        damageContributorLevels: [['departed_player', 44]],
        immediate: true
    });
    assert.equal(retryResult, false);
    assert.equal(retrySnapshotNet.monsterUpdateQueue.has('retry_boss'), true, 'failed boss snapshots must be requeued');
    assert.equal(retrySnapshotNet._publishedMonsterCellMap.has('retry_boss'), false, 'failed writes must not advance the published-cell index');
    if (retrySnapshotNet._monsterUpdateTimer) {
        clearTimeout(retrySnapshotNet._monsterUpdateTimer);
        retrySnapshotNet._monsterUpdateTimer = null;
    }
    assert.equal(await retrySnapshotNet.flushMonsterUpdates(), true);
    const retriedBossPath = Object.keys(retrySnapshotWrites[1]).find((path) => path.includes('monster_host_snapshot'));
    assert.deepEqual(
        retrySnapshotWrites[1][retriedBossPath].damageContributorLevels,
        [['departed_player', 44]],
        'host migration snapshots must retain contributor levels across a transient update failure'
    );
    assert.equal(retrySnapshotNet.monsterUpdateQueue.size, 0);

    const removeRaceNet = new NetworkManager();
    removeRaceNet.playerId = 'remove_race_host';
    removeRaceNet.connected = true;
    removeRaceNet.isHost = true;
    removeRaceNet._activeZoneFieldId = 'zone_3';
    removeRaceNet.shouldUseMonsterQuietMode = () => false;
    removeRaceNet.shouldUseMonsterCellSync = () => true;
    removeRaceNet.shouldUseMonsterHostSnapshot = () => true;
    removeRaceNet._publishedMonsterCellMap.set('removed_boss', '3_1');
    let rejectAliveFlush;
    let removeRaceWriteCount = 0;
    removeRaceNet.dbRef = {
        update: async () => {
            removeRaceWriteCount += 1;
            if (removeRaceWriteCount === 1) {
                return new Promise((_resolve, reject) => { rejectAliveFlush = reject; });
            }
        }
    };
    const aliveFlush = removeRaceNet.sendMonsterUpdate('removed_boss', {
        x: 2000,
        y: 1000,
        hp: 5000,
        maxHp: 5000,
        type: 'thunder_pikachu',
        rev: 31,
        cellId: '3_1',
        isBoss: true,
        damageContributors: ['player_a'],
        damageContributorLevels: [['player_a', 30]],
        immediate: true
    });
    await Promise.resolve();
    removeRaceNet.removeMonster('removed_boss');
    await Promise.resolve();
    rejectAliveFlush(new Error('late alive flush failure'));
    assert.equal(await aliveFlush, false);
    assert.equal(removeRaceNet.monsterUpdateQueue.has('removed_boss'), false, 'a late failed alive flush must not resurrect a removed monster');

    const removalRetryNet = new NetworkManager();
    removalRetryNet.playerId = 'removal_retry_host';
    removalRetryNet.connected = true;
    removalRetryNet.isHost = true;
    removalRetryNet._activeZoneFieldId = 'zone_3';
    removalRetryNet.shouldUseMonsterCellSync = () => true;
    removalRetryNet.shouldUseMonsterHostSnapshot = () => true;
    removalRetryNet.shouldUseMonsterQuietMode = () => false;
    removalRetryNet._publishedMonsterCellMap.set('retry_removed_boss', '4_1');
    removalRetryNet._getDurableRewardRetryDelay = () => 100_000;
    const removalRetryFieldId = removalRetryNet._getCurrentFieldId();
    let removalWriteAttempt = 0;
    const removalWrites = [];
    removalRetryNet.dbRef = {
        update: async (updates) => {
            const destinationPayload = updates[`monster_cells/${removalRetryFieldId}/5_1/retry_removed_boss`];
            if (destinationPayload && typeof destinationPayload === 'object') {
                throw new Error('temporary full-sync movement failure');
            }
            removalWriteAttempt += 1;
            removalWrites.push(updates);
            if (removalWriteAttempt === 1) throw new Error('temporary removal failure');
        }
    };
    assert.equal(await removalRetryNet.sendMonsterUpdate('retry_removed_boss', {
        x: 2700,
        y: 1100,
        hp: 4500,
        maxHp: 5000,
        type: 'thunder_pikachu',
        rev: 32,
        cellId: '5_1',
        fullSync: true,
        isBoss: true,
        immediate: true
    }), false, 'a failed destination full-sync must surface as a failed flush');
    assert.equal(
        removalRetryNet.monsterUpdateQueue.get('retry_removed_boss')?.cellId,
        '5_1',
        'a failed destination full-sync must requeue its destination cell'
    );
    if (removalRetryNet._monsterUpdateTimer) {
        clearTimeout(removalRetryNet._monsterUpdateTimer);
        removalRetryNet._monsterUpdateTimer = null;
    }
    removalRetryNet.removeMonster('retry_removed_boss');
    for (let attempt = 0; attempt < 40 && removalWriteAttempt === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const pendingRemoval = removalRetryNet._pendingMonsterRemovalWrites.get('retry_removed_boss');
    assert.ok(pendingRemoval, 'failed monster deletion must remain queued');
    for (let attempt = 0; attempt < 20 && pendingRemoval.inFlightPromise; attempt += 1) {
        await Promise.resolve();
    }
    clearTimeout(pendingRemoval.timer);
    pendingRemoval.timer = null;
    assert.equal(await removalRetryNet._attemptMonsterRemovalWrite(pendingRemoval), true);
    assert.equal(removalRetryNet._pendingMonsterRemovalWrites.has('retry_removed_boss'), false);
    assert.equal(removalWrites.length, 2, 'failed multi-cell removals must retry the same atomic path set');
    removalWrites.forEach((updates) => {
        assert.equal(
            updates[`monster_cells/${removalRetryFieldId}/4_1/retry_removed_boss`],
            null,
            'removal must clear the last successfully published cell'
        );
        assert.equal(
            updates[`monster_cells/${removalRetryFieldId}/5_1/retry_removed_boss`],
            null,
            'removal must also clear a failed/requeued destination cell'
        );
        assert.equal(
            updates[`monster_host_snapshot/${removalRetryFieldId}/retry_removed_boss`],
            null,
            'multi-cell removal retries must retain the host snapshot tombstone'
        );
    });

    const removalFlushNet = new NetworkManager();
    removalFlushNet.playerId = 'removal_flush_host';
    removalFlushNet.connected = true;
    removalFlushNet.isHost = true;
    removalFlushNet._activeZoneFieldId = 'zone_3';
    removalFlushNet.shouldUseMonsterCellSync = () => true;
    removalFlushNet.shouldUseMonsterHostSnapshot = () => true;
    removalFlushNet.shouldUseMonsterQuietMode = () => false;
    removalFlushNet._publishedMonsterCellMap.set('removed_before_handoff', '6_2');
    let removalFlushWriteCount = 0;
    let resolveRemovalFlushWrite = null;
    removalFlushNet.dbRef = {
        update: () => {
            removalFlushWriteCount += 1;
            return new Promise((resolve) => { resolveRemovalFlushWrite = resolve; });
        }
    };
    const removalFlushFieldId = removalFlushNet._getCurrentFieldId();
    removalFlushNet.removeMonster('removed_before_handoff');
    const firstRemovalFlush = removalFlushNet.flushPendingMonsterRemovalWrites({ fieldId: removalFlushFieldId });
    const repeatedRemovalFlush = removalFlushNet.flushPendingMonsterRemovalWrites({ fieldId: removalFlushFieldId });
    assert.equal(firstRemovalFlush, repeatedRemovalFlush, 'field removal flushes must reuse one in-flight promise');
    assert.equal(removalFlushWriteCount, 1, 'an in-flight removal write must not be duplicated by handoff flushing');
    assert.equal(removalFlushNet._pendingMonsterRemovalWrites.has('removed_before_handoff'), true);
    resolveRemovalFlushWrite();
    assert.equal(await firstRemovalFlush, true);
    assert.equal(removalFlushNet._pendingMonsterRemovalWrites.has('removed_before_handoff'), false);

    const failedRemovalFlushNet = new NetworkManager();
    failedRemovalFlushNet.playerId = 'failed_removal_flush_host';
    failedRemovalFlushNet.connected = true;
    failedRemovalFlushNet.isHost = true;
    failedRemovalFlushNet._activeZoneFieldId = 'zone_3';
    failedRemovalFlushNet.shouldUseMonsterCellSync = () => true;
    failedRemovalFlushNet.shouldUseMonsterHostSnapshot = () => true;
    failedRemovalFlushNet.shouldUseMonsterQuietMode = () => false;
    failedRemovalFlushNet._getDurableRewardRetryDelay = () => 100_000;
    failedRemovalFlushNet._publishedMonsterCellMap.set('failed_handoff_removal', '7_2');
    failedRemovalFlushNet.dbRef = {
        update: async () => { throw new Error('temporary handoff tombstone failure'); }
    };
    const failedRemovalFieldId = failedRemovalFlushNet._getCurrentFieldId();
    failedRemovalFlushNet.removeMonster('failed_handoff_removal');
    assert.equal(
        await failedRemovalFlushNet.flushPendingMonsterRemovalWrites({ fieldId: failedRemovalFieldId }),
        false,
        'handoff removal flushing must fail closed when a tombstone cannot be persisted'
    );
    const failedRemovalEntry = failedRemovalFlushNet._pendingMonsterRemovalWrites.get('failed_handoff_removal');
    assert.ok(failedRemovalEntry, 'a failed handoff tombstone must stay pending for retry');
    if (failedRemovalEntry.timer) {
        clearTimeout(failedRemovalEntry.timer);
        failedRemovalEntry.timer = null;
    }

    const orderedFlushNet = new NetworkManager();
    orderedFlushNet.playerId = 'ordered_flush_host';
    orderedFlushNet.connected = true;
    orderedFlushNet.isHost = true;
    orderedFlushNet._activeZoneFieldId = 'zone_3';
    orderedFlushNet.shouldUseMonsterQuietMode = () => false;
    orderedFlushNet.shouldUseMonsterCellSync = () => true;
    orderedFlushNet.shouldUseMonsterHostSnapshot = () => true;
    const orderedFlushResolvers = [];
    orderedFlushNet.dbRef = {
        update: () => new Promise((resolve, reject) => orderedFlushResolvers.push({ resolve, reject }))
    };
    const buildOrderedPayload = (rev, hp) => ({
        x: 2200 + rev,
        y: 1100,
        hp,
        maxHp: 5000,
        type: 'thunder_pikachu',
        rev,
        cellId: '3_2',
        isBoss: true,
        damageContributors: ['player_a'],
        damageContributorLevels: [['player_a', 30]],
        immediate: true
    });
    const olderFlush = orderedFlushNet.sendMonsterUpdate('ordered_boss', buildOrderedPayload(40, 4000));
    const newerFlush = orderedFlushNet.sendMonsterUpdate('ordered_boss', buildOrderedPayload(41, 3500));
    orderedFlushResolvers[1].resolve();
    assert.equal(await newerFlush, true);
    orderedFlushResolvers[0].reject(new Error('older flush failed late'));
    assert.equal(await olderFlush, false);
    assert.equal(orderedFlushNet.monsterUpdateQueue.has('ordered_boss'), false, 'an older failed revision must not overwrite a newer successful snapshot');
    assert.equal(orderedFlushNet._publishedMonsterRevisions.get('ordered_boss'), 41);

    const dropReadNet = new NetworkManager();
    dropReadNet.connected = true;
    dropReadNet._getCurrentFieldId = () => 'zone_3__party__player_a';
    dropReadNet.dbRef = {
        child(path) {
            const expectedNamespace = dropReadNet._getDropNamespacePath(
                'zone_3__party__player_a',
                { fieldId: 'zone_3__party__player_a', worldEpoch: 0, fieldEpoch: 0 }
            );
            return {
                once: async () => ({
                    val: () => {
                        if (path === 'drop_world_generation_v1'
                            || path.startsWith('drop_field_epoch_v1/')) return null;
                        assert.equal(path, expectedNamespace);
                        return {
                            current_drop: {
                                fieldId: 'zone_3__party__player_a',
                                amount: 10,
                                dropWorldEpoch: 0,
                                dropFieldEpoch: 0
                            },
                            foreign_drop: {
                                fieldId: 'zone_2__party__player_a',
                                amount: 999,
                                dropWorldEpoch: 0,
                                dropFieldEpoch: 0
                            }
                        };
                    }
                })
            };
        }
    };
    assert.deepEqual(
        Object.keys(await dropReadNet.readFieldDropsSnapshot()).sort(),
        ['current_drop'],
        'one-shot drop hydration must never import a different field'
    );

    const bossStateStore = {
        fieldId: 'zone_3__party__player_a',
        zoneId: 'zone_3',
        bossMonsterId: 'thunder_pikachu',
        bossInstanceId: 'old_boss',
        bossAlive: false,
        phase: 'defeated',
        bossDefeatedAt: 1000,
        bossRespawnAt: 301000,
        ts: 1000
    };
    let sharedBossState = bossStateStore;
    const makeClaimNet = (playerId) => {
        const claimNet = new NetworkManager();
        claimNet.connected = true;
        claimNet.isHost = true;
        claimNet.playerId = playerId;
        claimNet._getCurrentFieldId = () => 'zone_3__party__player_a';
        claimNet.dbRef = {
            child: () => ({
                transaction: async (updater) => {
                    const next = updater(sharedBossState);
                    if (typeof next === 'undefined') return { committed: false };
                    sharedBossState = next;
                    return { committed: true };
                }
            })
        };
        return claimNet;
    };
    const claimA = makeClaimNet('claim_host_a');
    const claimB = makeClaimNet('claim_host_b');
    const [claimAResult, claimBResult] = await Promise.all([
        claimA.claimFieldBossSpawn({
            zoneId: 'zone_3',
            bossMonsterId: 'thunder_pikachu',
            bossInstanceId: 'new_boss_a',
            respawnSeconds: 300,
            now: 302000
        }),
        claimB.claimFieldBossSpawn({
            zoneId: 'zone_3',
            bossMonsterId: 'thunder_pikachu',
            bossInstanceId: 'new_boss_b',
            respawnSeconds: 300,
            now: 302000
        })
    ]);
    assert.deepEqual([claimAResult, claimBResult], [true, false], 'only one split-brain host may acquire the boss spawn lease');
    assert.equal(sharedBossState.phase, 'spawning');
    assert.equal(sharedBossState.bossInstanceId, 'new_boss_a');

    const claimNow = claimA.getServerNow();
    sharedBossState = {
        fieldId: 'zone_3__party__player_a',
        zoneId: 'zone_3',
        bossMonsterId: 'thunder_pikachu',
        bossInstanceId: 'poisoned_boss',
        bossAlive: false,
        phase: 'defeated',
        bossDefeatedAt: claimNow + 3600000,
        bossRespawnAt: claimNow + 7200000,
        ts: claimNow + 3600000
    };
    assert.equal(await claimA.claimFieldBossSpawn({
        zoneId: 'zone_3',
        bossMonsterId: 'thunder_pikachu',
        bossInstanceId: 'recovered_boss',
        respawnSeconds: 300,
        now: claimNow
    }), true, 'future-poisoned lifecycle timestamps must not freeze a field forever');

    sharedBossState = {
        fieldId: 'zone_3__party__player_a',
        zoneId: 'zone_3',
        bossMonsterId: 'thunder_pikachu',
        bossInstanceId: 'leased_boss_a',
        bossAlive: false,
        phase: 'spawning',
        spawnLeaseUntil: claimNow + 15000,
        ts: claimNow
    };
    assert.equal(await claimA.publishFieldBossState({
        zoneId: 'zone_3',
        bossMonsterId: 'thunder_pikachu',
        bossInstanceId: 'leased_boss_b',
        bossAlive: true,
        phase: 'alive',
        ts: claimNow + 1
    }), false, 'a foreign instance must not overwrite an active spawn lease');
    assert.equal(await claimA.publishFieldBossState({
        zoneId: 'zone_3',
        bossMonsterId: 'thunder_pikachu',
        bossInstanceId: 'leased_boss_a',
        bossAlive: true,
        phase: 'alive',
        ts: claimNow + 2
    }), true, 'the leased instance must be allowed to publish its alive transition');

    sharedBossState = {
        fieldId: 'zone_3__party__player_a',
        zoneId: 'zone_3',
        bossMonsterId: 'thunder_pikachu',
        bossInstanceId: 'defeated_boss_locked',
        bossAlive: false,
        phase: 'defeated',
        bossDefeatedAt: claimNow,
        bossRespawnAt: claimNow + 300000,
        ts: claimNow
    };
    assert.equal(await claimA.publishFieldBossState({
        zoneId: 'zone_3',
        bossMonsterId: 'thunder_pikachu',
        bossInstanceId: 'cooldown_bypass_boss',
        bossAlive: true,
        phase: 'alive',
        ts: claimNow + 3
    }), false, 'defeated-to-alive must not bypass the atomic spawn claim or cooldown');
    assert.equal(sharedBossState.phase, 'defeated');

    sharedBossState = {
        fieldId: 'zone_3__party__player_a',
        zoneId: 'zone_3',
        bossMonsterId: 'thunder_pikachu',
        bossInstanceId: null,
        bossAlive: false,
        phase: 'waiting',
        bossRespawnAt: claimNow + 5000,
        ts: claimNow
    };
    assert.equal(await claimA.publishFieldBossState({
        zoneId: 'zone_3',
        bossMonsterId: 'thunder_pikachu',
        bossInstanceId: 'waiting_bypass_boss',
        bossAlive: true,
        phase: 'alive',
        ts: claimNow + 4
    }), false, 'waiting-to-alive must also require an atomic spawn claim');
    assert.equal(sharedBossState.phase, 'waiting');

    const staleAliveTs = claimNow - 16000;
    sharedBossState = {
        fieldId: 'zone_3__party__player_a',
        zoneId: 'zone_3',
        bossMonsterId: 'thunder_pikachu',
        bossInstanceId: 'missing_alive_boss',
        bossAlive: true,
        phase: 'alive',
        ts: staleAliveTs
    };
    assert.equal(await claimA.claimFieldBossSpawn({
        zoneId: 'zone_3',
        bossMonsterId: 'thunder_pikachu',
        bossInstanceId: 'replacement_after_crash',
        respawnSeconds: 300,
        now: claimNow,
        expectedStaleAliveInstanceId: 'missing_alive_boss',
        expectedStaleAliveTs: staleAliveTs
    }), true, 'an exactly observed stale alive marker without a snapshot must be recoverable after its grace window');
}

async function validateMonsterGenerationAndContributors() {
    let resolveDefinition;
    let publishedMonsters = 0;
    const net = createEventBus({
        playerId: 'player_a',
        isHost: true,
        connected: true,
        onRemoteMonsterAdded(handler) { this.on('monsterAdded', handler); },
        onRemoteMonsterUpdated(handler) { this.on('monsterUpdated', handler); },
        onRemoteMonsterRemoved(handler) { this.on('monsterRemoved', handler); },
        onMonsterDamageReceived(handler) { this.on('monsterDamageReceived', handler); },
        onDropAdded(handler) { this.on('dropAdded', handler); },
        onDropRemoved(handler) { this.on('dropRemoved', handler); },
        onDropCollectionRequested(handler) { this.on('dropCollectionRequested', handler); },
        isSharedFieldActive: () => false,
        shouldUseMonsterQuietMode: () => false,
        sendMonsterUpdate: () => { publishedMonsters += 1; },
        publishMinimapMonsterSnapshot: () => {},
        publishDropSnapshot: () => {},
        removeDrop: () => {},
        sendReward: () => true,
        claimDropForSettlement: async (dropId, collectorId, options = {}) => {
            if (!options.drop) {
                return { ok: false, terminal: true, reason: 'drop_missing' };
            }
            return {
                ok: true,
                localOnly: false,
                claimId: `claim_${dropId}`,
                claimedBy: collectorId,
                drop: {
                    ...options.drop,
                    fieldId: options.fieldId,
                    claimStatus: 'claimed',
                    claimId: `claim_${dropId}`,
                    claimedBy: collectorId
                }
            };
        },
        finalizeDropSettlement: async () => true,
        ackDropCollectionRequest: async () => true,
        _getCurrentFieldId: () => 'zone_2__solo__player_a'
    });
    const game = {
        net,
        zone: { width: 3400, height: 3400, currentZone: { id: 'zone_2' } },
        monsterData: {
            loadDefinition: () => new Promise((resolve) => { resolveDefinition = resolve; })
        },
        sceneManager: { currentScene: null },
        remotePlayers: new Map()
    };
    window.game = game;
    const manager = new MonsterManager(game);
    game.monsterManager = manager;
    manager.setSpawnRules([], { zoneId: 'zone_2' });
    const pendingSpawn = manager._spawnMonster(800, 800, 'squirtle');
    manager.clearAll({ preserveNetwork: true });
    resolveDefinition({
        id: 'squirtle',
        baseStats: { hp: 100, maxHp: 100 },
        visual: { width: 72, height: 78 }
    });
    assert.equal(await pendingSpawn, null, 'an in-flight spawn from a cleared world must be cancelled');
    assert.equal(manager.monsters.size, 0);
    assert.equal(publishedMonsters, 0);

    const definition = {
        id: 'squirtle',
        baseStats: { hp: 100, maxHp: 100 },
        visual: { width: 72, height: 78 }
    };
    let secondDefinitionResolve = null;
    let definitionCallCount = 0;
    game.monsterData.loadDefinition = () => {
        definitionCallCount += 1;
        if (definitionCallCount === 1) return Promise.resolve(definition);
        return new Promise((resolve) => { secondDefinitionResolve = resolve; });
    };
    manager.setSpawnRules([], { zoneId: 'zone_2' });
    const nestedPendingSpawn = manager._spawnMonster(820, 820, 'squirtle');
    for (let attempt = 0; attempt < 10 && !secondDefinitionResolve; attempt += 1) {
        await Promise.resolve();
    }
    assert.equal(typeof secondDefinitionResolve, 'function', 'spawn must reach its nested definition load');
    manager.clearAll({ preserveNetwork: true });
    secondDefinitionResolve(definition);
    assert.equal(await nestedPendingSpawn, null, 'world generation must be checked again before nested async publish');
    assert.equal(manager.monsters.size, 0);
    assert.equal(publishedMonsters, 0);

    const restoredBoss = {
        damageContributors: new Set(['player_a']),
        damageContributorLevels: new Map([['player_a', 12]])
    };
    manager._applyRemoteMonsterNetworkState(restoredBoss, {
        isBoss: true,
        lastAttackerId: 'player_b',
        damageContributors: ['player_a', 'player_b'],
        damageContributorLevels: [['player_a', 12], ['player_b', 26]]
    });
    assert.equal(restoredBoss.lastAttackerId, 'player_b');
    assert.deepEqual(Array.from(restoredBoss.damageContributors).sort(), ['player_a', 'player_b']);
    assert.deepEqual(Array.from(restoredBoss.damageContributorLevels.entries()).sort(), [['player_a', 12], ['player_b', 26]]);

    const departedHighLevelId = 'departed_high_level_player';
    const departedBoss = {
        id: 'departed_reward_boss',
        typeId: 'ruin_wobbuffet',
        name: 'Ruin Boss',
        damageContributors: new Set([departedHighLevelId]),
        damageContributorLevels: new Map()
    };
    game.remotePlayers.set(departedHighLevelId, { id: departedHighLevelId, level: 1 });
    net.remotePlayers = game.remotePlayers;
    manager._captureMonsterContributorLevel(departedBoss, departedHighLevelId, 40);
    manager._captureMonsterContributorLevel(departedBoss, departedHighLevelId, 2);
    assert.equal(departedBoss.damageContributorLevels.get(departedHighLevelId), 40, 'a placeholder live level must not overwrite a higher reported contributor level');
    const rememberedContributor = {
        lastAttackerId: departedHighLevelId,
        damageContributorLevels: new Map([[departedHighLevelId, 12]])
    };
    Monster.prototype._rememberDamageContributorLevel.call(rememberedContributor, { attackerLevel: 40 });
    Monster.prototype._rememberDamageContributorLevel.call(rememberedContributor, { attackerLevel: 2 });
    assert.equal(rememberedContributor.damageContributorLevels.get(departedHighLevelId), 40, 'monster-local contributor snapshots must retain the maximum valid level');
    const originalSendReward = net.sendReward;
    const connectedPlaceholderRewards = [];
    net.sendReward = (uid, reward) => connectedPlaceholderRewards.push({ uid, reward });
    manager._grantMonsterExpReward(100, {
        attackerId: departedHighLevelId,
        eligibleCollectorIds: [departedHighLevelId],
        partyMembers: [departedHighLevelId],
        monsterLevel: 9,
        isBoss: true,
        monster: departedBoss
    });
    assert.equal(connectedPlaceholderRewards.length, 1);
    assert.equal(connectedPlaceholderRewards[0].reward.rewardMeta.playerLevel, 40, 'a connected level-one placeholder must not mask a captured level 40');
    assert.equal(connectedPlaceholderRewards[0].reward.exp, 10, 'connected placeholder data must still preserve the level-gap decay');

    game.remotePlayers.delete(departedHighLevelId);
    const disconnectedRewards = [];
    net.sendReward = (uid, reward) => disconnectedRewards.push({ uid, reward });
    manager._grantMonsterExpReward(100, {
        attackerId: departedHighLevelId,
        eligibleCollectorIds: [departedHighLevelId],
        partyMembers: [departedHighLevelId],
        monsterLevel: 9,
        isBoss: true,
        monster: departedBoss
    });
    net.sendReward = originalSendReward;
    assert.equal(disconnectedRewards.length, 1);
    assert.equal(disconnectedRewards[0].reward.rewardMeta.playerLevel, 40, 'a disconnected contributor must use the captured level snapshot');
    assert.equal(disconnectedRewards[0].reward.exp, 10, 'disconnecting before boss death must not bypass overlevel XP decay');
    assert.equal(disconnectedRewards[0].reward.kind, 'boss_progress');
    assert.equal(disconnectedRewards[0].reward.rewardKind, 'boss_exp');

    const semanticRewards = [];
    net.sendReward = (uid, reward) => {
        semanticRewards.push({ uid, reward });
        return true;
    };
    const semanticMonster = {
        id: 'semantic_normal_monster',
        typeId: 'slime',
        name: 'Slime'
    };
    manager._grantMonsterExpReward(25, {
        attackerId: 'player_a',
        eligibleCollectorIds: ['player_a'],
        partyMembers: ['player_a'],
        monsterLevel: 2,
        isBoss: false,
        monster: semanticMonster
    });
    assert.equal(semanticRewards[0].reward.rewardId, 'monster_reward:zone_2__solo__player_a:semantic_normal_monster:player_a:normal_exp');
    assert.equal(manager._grantMonsterQuestCredit(semanticMonster, 'player_a'), true);
    assert.equal(semanticRewards[1].reward.rewardId, 'monster_reward:zone_2__solo__player_a:semantic_normal_monster:player_a:quest');
    assert.equal(manager._grantMonsterQuestCredit(semanticMonster, 'player_b', { introSharedQuest: true }), true);
    assert.equal(semanticRewards[2].reward.rewardId, 'monster_reward:zone_2__solo__player_a:semantic_normal_monster:player_b:intro_quest');
    net.sendReward = originalSendReward;

    manager.monsters.set('dead_boss', {
        id: 'dead_boss',
        isLocalOnly: false,
        isBoss: true,
        typeId: 'ruin_wobbuffet'
    });
    net.readMonsterHostSnapshot = async () => ({
        dead_boss: { id: 'dead_boss', hp: 0, maxHp: 4500, state: 'dead', isBoss: true }
    });
    const deadRestore = await manager.restoreAuthoritativeMonstersFromHostSnapshot({ force: true });
    assert.equal(manager.monsters.has('dead_boss'), false, 'a dead authoritative snapshot must remove a stale guest copy');
    assert.equal(deadRestore.removed, 1);

    const destinationFieldId = 'zone_2__party__player_a';
    let resolveDestinationSnapshot = null;
    let destinationSnapshotReads = 0;
    let staleSimulationTicks = 0;
    net.isSharedFieldActive = () => true;
    net._getCurrentFieldId = () => destinationFieldId;
    net.readMonsterHostSnapshot = () => {
        destinationSnapshotReads += 1;
        return new Promise((resolve) => { resolveDestinationSnapshot = resolve; });
    };
    game.localPlayer = { id: 'player_a', level: 12, isDead: false };
    game.monsterData.loadDefinition = async () => definition;
    manager.hostFieldHandoffRefreshMs = 10;
    manager.monsters.clear();
    manager.monsters.set('stale_local_monster', {
        id: 'stale_local_monster',
        x: 500,
        y: 500,
        width: 72,
        height: 78,
        isLocalOnly: false,
        isBoss: false,
        isDead: false,
        isAggro: false,
        targetPlayer: null,
        chargeState: 'idle',
        update: () => { staleSimulationTicks += 1; }
    });

    net.emit('fieldContextChanged', {
        previousFieldId: 'zone_1__party__player_a',
        fieldId: destinationFieldId
    });
    const destinationRestorePromise = manager._hostSnapshotRestorePromise;
    const destinationHandoffPromise = manager._hostFieldHandoffPromise;
    assert.ok(destinationRestorePromise, 'a host that remains host across fields must start destination snapshot restore');
    assert.equal(destinationSnapshotReads, 0, 'even an already-shared destination must allow the resident host to publish before reading');
    manager.update(0.016);
    assert.equal(staleSimulationTicks, 0, 'host monster simulation must pause while destination state is restoring');
    assert.equal(await manager._spawnMonster(700, 700, 'squirtle'), null, 'host spawning must pause while destination state is restoring');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(destinationSnapshotReads, 1, 'the settled handoff must issue one destination snapshot read');
    const duplicateRestoreCall = manager.restoreAuthoritativeMonstersFromHostSnapshot({ force: true });
    assert.equal(manager._hostSnapshotRestorePromise, destinationRestorePromise, 'destination restore must stay single-flight');
    assert.equal(destinationSnapshotReads, 1, 'single-flight restore must issue only one snapshot read');

    resolveDestinationSnapshot({
        destination_boss: {
            x: 1200,
            y: 900,
            hp: 3200,
            maxHp: 4500,
            type: 'ruin_wobbuffet',
            state: 'aggro',
            rev: 11,
            ts: Date.now(),
            cellId: '1_1',
            isBoss: true,
            spawnGroupId: 'zone_2:field_boss',
            lastAttackerId: 'player_b',
            damageContributors: ['player_a', 'player_b'],
            damageContributorLevels: [['player_a', 12], ['player_b', 26]]
        }
    });
    await Promise.all([destinationRestorePromise, duplicateRestoreCall, destinationHandoffPromise]);
    assert.equal(manager._hostSnapshotRestorePromise, null);
    assert.equal(manager.monsters.has('stale_local_monster'), false, 'stale local world state must not survive destination restore');
    assert.ok(manager.monsters.has('destination_boss'), 'the destination authoritative boss must be restored before host simulation resumes');
    assert.equal(
        manager.monsters.get('destination_boss').damageContributorLevels.get('player_b'),
        26,
        'host migration must restore disconnected contributor level snapshots'
    );

    await Promise.resolve();
    manager.clearAll({ preserveNetwork: true });
    manager.hostFieldHandoffSettleMs = 0;
    manager.hostFieldHandoffRefreshMs = 0;
    let lateSharedFieldActive = false;
    const lateFieldId = 'zone_2__party__player_a_late';
    const lateSnapshotResolvers = [];
    let lateSnapshotReads = 0;
    const lateDropResolvers = [];
    let lateDropReads = 0;
    const collectedRewards = [];
    net.isSharedFieldActive = () => lateSharedFieldActive;
    net._getCurrentFieldId = () => lateFieldId;
    net.readMonsterHostSnapshot = () => {
        lateSnapshotReads += 1;
        return new Promise((resolve) => { lateSnapshotResolvers.push(resolve); });
    };
    net.readFieldDropsSnapshot = () => {
        lateDropReads += 1;
        return new Promise((resolve) => { lateDropResolvers.push(resolve); });
    };
    net.sendReward = (uid, reward) => {
        collectedRewards.push({ uid, reward });
        return true;
    };
    manager.monsters.set('late_stale_local', {
        id: 'late_stale_local',
        x: 520,
        y: 520,
        width: 72,
        height: 78,
        isLocalOnly: false,
        isBoss: false,
        isDead: false,
        isAggro: false,
        targetPlayer: null,
        chargeState: 'idle',
        update: () => {}
    });

    net.emit('fieldContextChanged', {
        previousFieldId: destinationFieldId,
        fieldId: lateFieldId
    });
    assert.equal(lateSnapshotReads, 1, 'field handoff must probe the destination even before peer presence is visible');
    assert.equal(lateDropReads, 1, 'field handoff must hydrate destination drops before collection is accepted');
    const publishedBeforeLatePeer = publishedMonsters;
    lateSharedFieldActive = true;
    net.emit('sharedFieldChanged', { active: true });
    lateSnapshotResolvers[0]({});
    lateDropResolvers[0]({});
    for (let attempt = 0; attempt < 30 && (lateSnapshotReads < 2 || lateDropReads < 2); attempt += 1) {
        await Promise.resolve();
    }
    assert.equal(lateSnapshotReads, 2, 'late peer discovery must refresh the snapshot after the former quiet host can publish');
    assert.equal(lateDropReads, 2, 'late peer discovery must refresh resident quiet-mode drops before publishing');
    assert.equal(publishedMonsters, publishedBeforeLatePeer, 'the arriving host must not publish its local world before late-peer restore');
    const lateRestorePromise = manager._hostSnapshotRestorePromise;
    const lateHandoffPromise = manager._hostFieldHandoffPromise;
    manager._onDropCollectionRequested({
        dropId: 'resident_manastone',
        collectorId: 'player_b',
        fieldId: lateFieldId,
        dropWorldEpoch: 0,
        dropFieldEpoch: 0
    });
    assert.equal(manager._pendingDropCollectionRequests.length, 1, 'collection must wait until destination drops are hydrated');
    manager._onDropCollectionRequested({
        dropId: 'foreign_drop',
        collectorId: 'player_b',
        fieldId: 'zone_1__party__player_a',
        dropWorldEpoch: 0,
        dropFieldEpoch: 0
    });
    assert.equal(manager._pendingDropCollectionRequests.length, 1, 'foreign-field collection requests must be rejected before queuing');
    for (let index = 0; index < 200; index += 1) {
        manager._onDropCollectionRequested({
            dropId: `queued_drop_${index}`,
            collectorId: `collector_${index}`,
            fieldId: lateFieldId,
            dropWorldEpoch: 0,
            dropFieldEpoch: 0
        });
    }
    assert.equal(manager._pendingDropCollectionRequests.length, 128, 'handoff collection queue must enforce its hard cap');
    lateSnapshotResolvers[1]({
        late_destination_boss: {
            x: 1300,
            y: 980,
            hp: 4100,
            maxHp: 4500,
            type: 'ruin_wobbuffet',
            state: 'aggro',
            rev: 14,
            ts: Date.now(),
            cellId: '1_1',
            isBoss: true,
            spawnGroupId: 'zone_2:field_boss',
            lastAttackerId: 'player_b',
            damageContributors: ['player_a', 'player_b']
        }
    });
    lateDropResolvers[1]({
        resident_manastone: {
            x: 1280,
            y: 960,
            type: 'manastone',
            amount: 75,
            ownerId: 'player_b',
            eligibleCollectorIds: ['player_b'],
            fieldId: lateFieldId,
            dropWorldEpoch: 0,
            dropFieldEpoch: 0,
            ts: Date.now()
        }
    });
    await Promise.all([lateRestorePromise, lateHandoffPromise]);
    for (let attempt = 0; attempt < 20 && manager._hostFieldHandoffFieldId; attempt += 1) {
        await Promise.resolve();
    }
    assert.equal(manager._hostFieldHandoffFieldId, null, 'late peer handoff must complete only after restored state is published');
    assert.equal(manager.monsters.has('late_stale_local'), false);
    assert.ok(manager.monsters.has('late_destination_boss'));
    assert.equal(manager.drops.has('resident_manastone'), false, 'queued collection must execute once after hydration');
    assert.equal(collectedRewards.length, 1, 'queued drop collection must not duplicate rewards');
    assert.equal(collectedRewards[0].reward.manastone, 75);

    manager.clearAll({ preserveNetwork: true });
    const failedFieldId = 'zone_2__party__strict_failure';
    net._getCurrentFieldId = () => failedFieldId;
    net.isSharedFieldActive = () => false;
    net.readMonsterHostSnapshot = async (options = {}) => {
        assert.equal(options.throwOnError, true);
        throw new Error('snapshot read failed');
    };
    net.readFieldDropsSnapshot = async () => ({});
    const publishedBeforeFailure = publishedMonsters;
    net.emit('fieldContextChanged', {
        previousFieldId: lateFieldId,
        fieldId: failedFieldId
    });
    const failedHandoff = manager._hostFieldHandoffPromise;
    await assert.rejects(failedHandoff, /snapshot read failed/);
    assert.equal(manager._hostFieldHandoffBlockedFieldId, failedFieldId, 'failed strict reads must leave host simulation fail-closed');
    assert.equal(await manager._spawnMonster(900, 900, 'squirtle'), null, 'failed handoff must block fresh monster spawns');
    assert.equal(publishedMonsters, publishedBeforeFailure, 'failed handoff must not publish a replacement world');
    manager.clearAll({ preserveNetwork: true });
}

async function validateBlockedMonsterCombatContracts() {
    const fieldId = 'zone_2__party__combat_handoff';
    const net = createEventBus({
        playerId: 'combat_host',
        isHost: true,
        connected: true,
        remotePlayers: new Map(),
        onRemoteMonsterAdded(handler) { this.on('monsterAdded', handler); },
        onRemoteMonsterUpdated(handler) { this.on('monsterUpdated', handler); },
        onRemoteMonsterRemoved(handler) { this.on('monsterRemoved', handler); },
        onMonsterDamageReceived(handler) { this.on('monsterDamageReceived', handler); },
        onDropAdded(handler) { this.on('dropAdded', handler); },
        onDropRemoved(handler) { this.on('dropRemoved', handler); },
        onDropCollectionRequested(handler) { this.on('dropCollectionRequested', handler); },
        isSharedFieldActive: () => true,
        shouldUseMonsterQuietMode: () => false,
        _getCurrentFieldId: () => fieldId,
        sendMonsterUpdate: () => true,
        publishMinimapMonsterSnapshot: () => {},
        publishDropSnapshot: () => true,
        removeDrop: () => {},
        sendReward: () => {}
    });
    const localPlayer = {
        id: 'combat_host',
        level: 12,
        questData: {
            slime30QuestClaimed: true,
            bossClearCount: 0,
            bossQuestClaimed: false,
            introBossParticipated: false
        }
    };
    const game = {
        net,
        localPlayer,
        zone: { width: 3400, height: 3400, currentZone: { id: 'zone_2' } },
        sceneManager: { currentScene: null },
        remotePlayers: new Map()
    };
    window.game = game;
    const manager = new MonsterManager(game);
    game.monsterManager = manager;
    const monster = new Monster(900, 900, {
        id: 'squirtle',
        name: 'Combat Test Monster',
        baseStats: { hp: 100, maxHp: 100, level: 6 },
        visual: { width: 72, height: 78 },
        behavior: {}
    });
    monster.id = 'blocked_combat_monster';
    manager.monsters.set(monster.id, monster);
    manager.monsters.set('intro_boss_packet_target', { id: 'intro_boss_packet_target', typeId: 'king_slime' });

    let deathSettlements = 0;
    let bossDefeatWrites = 0;
    let deathSyncs = 0;
    manager.settleMonsterDeathImmediately = () => { deathSettlements += 1; return true; };
    manager.recordFieldBossDefeat = () => { bossDefeatWrites += 1; return true; };
    manager.forceSync = () => { deathSyncs += 1; return true; };
    manager._hostFieldHandoffBlockedFieldId = fieldId;

    assert.equal(manager.isMonsterCombatBlocked(), true);
    assert.equal(manager._onMonsterDamageReceived({
        mid: monster.id,
        dmg: 200,
        aid: 'remote_attacker',
        attackerLevel: 40,
        meta: { attackerLevel: 40 }
    }), false, 'remote damage must be rejected while host snapshot restoration is blocked');
    assert.equal(monster.takeDamage(200, false, false, null, null, { attackerLevel: 12 }), false, 'direct local damage must use the same central handoff guard');
    assert.equal(monster.applyEffect('burn', 2, 25, { attackerLevel: 12 }), false, 'damaging status effects must not be authored during a blocked handoff');
    assert.equal(monster.hp, 100);
    assert.equal(monster.isDead, false);
    assert.equal(monster.statusEffects.length, 0);
    assert.equal(monster.damageContributors.has('remote_attacker'), false);
    assert.deepEqual([deathSettlements, bossDefeatWrites, deathSyncs], [0, 0, 0], 'blocked combat must not author death or reward settlement');

    const sendNet = new NetworkManager();
    sendNet.playerId = 'combat_host';
    sendNet.connected = true;
    sendNet.isHost = true;
    sendNet._activeZoneFieldId = 'zone_2';
    sendNet.shouldUseMonsterQuietMode = () => false;
    let questSaves = 0;
    localPlayer.saveProfilePatch = () => { questSaves += 1; };
    window.game = {
        ...game,
        net: sendNet,
        monsterManager: manager,
        tutorial: { isActionAllowed: () => true, trigger: () => {} },
        ui: { updateQuestUI: () => {} }
    };
    assert.equal(sendNet.sendMonsterDamage('intro_boss_packet_target', 10), false, 'a blocked host must reject damage before batching');
    assert.equal(sendNet.batchQueue.length, 0);
    assert.equal(localPlayer.questData.introBossParticipated, false, 'a rejected attack must not mutate quest participation');
    assert.equal(questSaves, 0);

    sendNet.sendChanneling = () => {};
    sendNet.sendPlayerAttack = () => {};
    sendNet.sendPlayerHp = () => {};
    const chainPlayer = new Player(850, 900, 'Blocked Chain Tester', null);
    chainPlayer.id = 'combat_host';
    chainPlayer.net = sendNet;
    chainPlayer.hp = 40;
    chainPlayer.maxHp = 100;
    chainPlayer.mp = 20;
    chainPlayer.maxMp = 100;
    chainPlayer.attackPower = 100;
    chainPlayer.critRate = 0;
    chainPlayer.attackRange = 400;
    chainPlayer.currentTarget = monster;
    chainPlayer.isChanneling = true;
    chainPlayer.lightningTickTimer = 0;
    chainPlayer.skillCooldowns.j = 0;
    chainPlayer.getWeaponCombatProfile = () => ({
        laserDamageBonus: 0,
        restoreHpPerLaserHit: 10,
        laserVariant: null
    });
    chainPlayer.canAttackTarget = () => true;
    chainPlayer.performLaserAttack(0.1);
    assert.equal(chainPlayer.hp, 40, 'a blocked chain hit must not grant HP recovery');
    assert.equal(chainPlayer.mp, 20, 'a blocked chain hit must not grant MP recovery');
    assert.equal(monster.electrocutedTimer, 0, 'a blocked chain hit must not apply electrocuted');
    assert.equal(monster.hp, 100);
    assert.equal(monster.lastAttackerId, null, 'a rejected chain hit must not replace the authoritative attacker');

    manager._hostFieldHandoffBlockedFieldId = null;
    assert.equal(manager.isMonsterCombatBlocked(), false);
    assert.equal(manager._onMonsterDamageReceived({
        mid: monster.id,
        dmg: 25,
        aid: 'remote_attacker',
        attackerLevel: 40,
        meta: { attackerLevel: 40 }
    }), true, 'one fresh attack must apply after handoff unblocks');
    assert.equal(monster.hp, 75);
    assert.equal(monster.isDead, false);
    assert.equal(monster.damageContributors.has('remote_attacker'), true);
    assert.equal(sendNet.sendMonsterDamage('intro_boss_packet_target', 10), true);
    assert.equal(sendNet.batchQueue.length, 1);
    assert.equal(localPlayer.questData.introBossParticipated, true);
    assert.equal(questSaves, 1);
    sendNet.batchQueue.length = 0;
    sendNet.stopBatchProcessor();
}

async function validateHostHandoffMarkerFallback() {
    let currentFieldId = 'zone_2__party__marker_permission';
    let sharedFieldActive = true;
    let serverNow = Date.now();
    let markerReads = 0;
    let monsterReads = 0;
    let dropReads = 0;
    let bossReads = 0;
    const net = createEventBus({
        playerId: 'fallback_host',
        isHost: true,
        connected: true,
        onRemoteMonsterAdded(handler) { this.on('monsterAdded', handler); },
        onRemoteMonsterUpdated(handler) { this.on('monsterUpdated', handler); },
        onRemoteMonsterRemoved(handler) { this.on('monsterRemoved', handler); },
        onMonsterDamageReceived(handler) { this.on('monsterDamageReceived', handler); },
        onDropAdded(handler) { this.on('dropAdded', handler); },
        onDropRemoved(handler) { this.on('dropRemoved', handler); },
        onDropCollectionRequested(handler) { this.on('dropCollectionRequested', handler); },
        isSharedFieldActive: () => sharedFieldActive,
        shouldUseMonsterQuietMode: () => !sharedFieldActive,
        _getCurrentFieldId: () => currentFieldId,
        getServerNow: () => serverNow,
        waitForFieldHandoffReady: async () => {
            markerReads += 1;
            throw new Error('handoff marker permission denied');
        },
        readMonsterHostSnapshot: async (options = {}) => {
            assert.equal(options.throwOnError, true);
            monsterReads += 1;
            return {};
        },
        readFieldDropsSnapshot: async (options = {}) => {
            assert.equal(options.throwOnError, true);
            dropReads += 1;
            return {};
        },
        readFieldBossState: async (options = {}) => {
            assert.equal(options.throwOnError, true);
            bossReads += 1;
            return null;
        },
        sendMonsterUpdate: () => true,
        publishDropSnapshot: async () => true,
        publishFieldBossState: async () => true,
        publishMinimapMonsterSnapshot: () => {},
        removeDrop: () => {},
        removeMonster: () => {},
        sendReward: () => {}
    });
    const definition = {
        id: 'ruin_wobbuffet',
        type: 'boss',
        isBoss: true,
        baseStats: { hp: 4500, maxHp: 4500 },
        visual: { width: 180, height: 190 }
    };
    const game = {
        net,
        localPlayer: { id: 'fallback_host', level: 20, isDead: false },
        zone: { width: 3400, height: 3400, currentZone: { id: 'zone_2' } },
        monsterData: { loadDefinition: async () => definition },
        sceneManager: { currentScene: null },
        remotePlayers: new Map()
    };
    window.game = game;
    const manager = new MonsterManager(game);
    game.monsterManager = manager;
    manager.hostFieldHandoffSettleMs = 0;
    manager.hostFieldHandoffRefreshMs = 0;
    manager.hostFieldHandoffRetryMs = 5;
    manager.hostFieldHandoffMarkerFallbackMs = 25;
    manager.setSpawnRules([], {
        zoneId: 'zone_2',
        bossSpawn: {
            monsterId: 'ruin_wobbuffet',
            point: { x: 1700, y: 1700 },
            respawnSeconds: 300
        }
    });

    net.emit('fieldContextChanged', {
        previousFieldId: 'zone_1__party__fallback_host',
        fieldId: currentFieldId
    });
    const permissionFailure = manager._hostFieldHandoffPromise;
    await assert.rejects(permissionFailure, /marker permission denied/);
    assert.equal(monsterReads, 0, 'a fresh marker permission failure must remain fail-closed');
    assert.equal(manager._hostFieldHandoffBlockedFieldId, currentFieldId);

    serverNow += 100;
    for (let attempt = 0; attempt < 80 && manager._hostFieldHandoffBlockedFieldId; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(markerReads, 1, 'an expired marker window must not retry the denied marker forever');
    assert.ok(monsterReads > 0 && dropReads > 0 && bossReads > 0, 'marker fallback must hydrate all strict field snapshots');
    assert.equal(manager._hostFieldHandoffBlockedFieldId, null, 'successful strict fallback must unblock host simulation');
    assert.equal(manager._hostFieldHandoffWaitForResidentPublish, false);

    manager.clearAll({ preserveNetwork: true });
    currentFieldId = 'zone_2__party__resident_disconnect';
    sharedFieldActive = true;
    serverNow += 1000;
    markerReads = 0;
    monsterReads = 0;
    dropReads = 0;
    bossReads = 0;
    manager.hostFieldHandoffMarkerFallbackMs = 60000;
    let rejectMarkerWait = null;
    net.waitForFieldHandoffReady = () => {
        markerReads += 1;
        return new Promise((resolve, reject) => { rejectMarkerWait = reject; });
    };

    net.emit('fieldContextChanged', {
        previousFieldId: 'zone_2__party__marker_permission',
        fieldId: currentFieldId
    });
    const disconnectedResidentHandoff = manager._hostFieldHandoffPromise;
    assert.equal(typeof rejectMarkerWait, 'function');
    sharedFieldActive = false;
    net.emit('sharedFieldChanged', { active: false });
    assert.equal(manager._hostFieldHandoffWaitForResidentPublish, false, 'leaving shared mode must cancel future marker waits');
    rejectMarkerWait(new Error('resident disconnected'));
    await assert.rejects(disconnectedResidentHandoff, /resident disconnected/);

    for (let attempt = 0; attempt < 80 && manager._hostFieldHandoffBlockedFieldId; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(markerReads, 1, 'a disconnected resident must not be awaited again');
    assert.ok(monsterReads > 0 && dropReads > 0 && bossReads > 0, 'disconnect recovery must retry directly from strict snapshots');
    assert.equal(manager._hostFieldHandoffBlockedFieldId, null);
    manager.clearAll({ preserveNetwork: true });
}

async function validateFieldBossLifecycleContracts() {
    let currentFieldId = 'zone_2__party__boss_host';
    const serverNow = Date.now() + 600000;
    const publishedBossStates = [];
    const handoffReadyPublishes = [];
    const spawnedRewardDrops = [];
    const sentBossRewards = [];
    const localBossRewards = [];
    const removedMonsterIds = [];
    let claimCount = 0;
    let bossState = {
        fieldId: currentFieldId,
        zoneId: 'zone_2',
        bossMonsterId: 'ruin_wobbuffet',
        bossInstanceId: 'defeated_boss_a',
        bossAlive: false,
        phase: 'defeated',
        bossDefeatedAt: serverNow - 301000,
        bossRespawnAt: serverNow + 999999999,
        respawnSeconds: 999999,
        ts: serverNow - 301000
    };
    const definition = {
        id: 'ruin_wobbuffet',
        type: 'boss',
        isBoss: true,
        name: 'Ruin Boss',
        baseStats: { hp: 4500, maxHp: 4500, exp: 800, level: 20, manastone: 5000 },
        visual: { width: 180, height: 190 }
    };
    const net = createEventBus({
        playerId: 'boss_host',
        isHost: true,
        connected: true,
        onRemoteMonsterAdded(handler) { this.on('monsterAdded', handler); },
        onRemoteMonsterUpdated(handler) { this.on('monsterUpdated', handler); },
        onRemoteMonsterRemoved(handler) { this.on('monsterRemoved', handler); },
        onMonsterDamageReceived(handler) { this.on('monsterDamageReceived', handler); },
        onDropAdded(handler) { this.on('dropAdded', handler); },
        onDropRemoved(handler) { this.on('dropRemoved', handler); },
        onDropCollectionRequested(handler) { this.on('dropCollectionRequested', handler); },
        isSharedFieldActive: () => false,
        shouldUseMonsterQuietMode: () => true,
        _getCurrentFieldId: () => currentFieldId,
        getServerNow: () => serverNow,
        readMonsterHostSnapshot: async () => ({}),
        readFieldDropsSnapshot: async () => ({}),
        readFieldBossState: async (options = {}) => {
            assert.equal(options.throwOnError, true);
            return bossState;
        },
        claimFieldBossSpawn: async () => {
            claimCount += 1;
            return true;
        },
        publishFieldBossState: async (payload) => {
            publishedBossStates.push(payload);
            return true;
        },
        publishFieldHandoffReady: async (payload) => {
            handoffReadyPublishes.push(payload);
            return true;
        },
        flushPendingMonsterRemovalWrites: async () => true,
        sendMonsterUpdate: () => true,
        publishMinimapMonsterSnapshot: () => {},
        publishDropSnapshot: () => {},
        removeDrop: () => {},
        removeMonster: (id) => { removedMonsterIds.push(id); },
        spawnDrop: (payload) => { spawnedRewardDrops.push(payload); return `reward_drop_${spawnedRewardDrops.length}`; },
        sendReward: (uid, payload) => { sentBossRewards.push({ uid, payload }); }
    });
    const localPlayer = {
        id: 'boss_host',
        level: 20,
        isDead: false,
        party: { members: ['boss_host'], hostId: 'boss_host', mode: 'solo' },
        questData: {},
        receiveReward: (payload) => { localBossRewards.push(payload); return true; },
        saveState: () => {}
    };
    const game = {
        net,
        localPlayer,
        zone: {
            width: 3400,
            height: 3400,
            currentZone: { id: 'zone_2', background: { music: 'bgm_zone_2' } }
        },
        monsterData: { loadDefinition: async () => definition },
        itemData: {
            getGlobalDrops: () => [],
            getBossDrops: () => [{ itemId: 'ruin_test_staff', chance: 1, min: 1, max: 1 }],
            getItemDefinition: (id) => ({ id, name: 'Ruin Test Staff', icon: 'staff' }),
            createRewardItem: (id, options = {}) => ({
                id,
                type: id,
                amount: Math.max(1, Number(options.amount || 1)),
                name: 'Ruin Test Staff',
                icon: 'staff'
            })
        },
        sceneManager: { currentScene: null },
        remotePlayers: new Map(),
        sound: { loadAndPlayBgm: () => {} }
    };
    window.game = game;
    const manager = new MonsterManager(game);
    game.monsterManager = manager;
    manager.hostFieldHandoffSettleMs = 0;
    manager.hostFieldHandoffRefreshMs = 0;
    manager.setSpawnRules([], {
        zoneId: 'zone_2',
        bossSpawn: {
            monsterId: 'ruin_wobbuffet',
            displayName: 'Ruin Boss',
            point: { x: 1700, y: 1700 },
            initialDelaySeconds: 35,
            respawnSeconds: 300
        }
    });
    assert.equal(
        manager.zoneBossRespawnAt,
        serverNow + 35000,
        'a new boss initial deadline must use the same authoritative clock as its spawn comparison'
    );
    manager.monsters.set('pre_handoff_stale_boss', {
        id: 'pre_handoff_stale_boss',
        typeId: 'ruin_wobbuffet',
        isBoss: true,
        isDead: false
    });
    assert.equal(await manager._publishZoneBossFieldState(), false, 'an incoming host must not publish unhydrated local boss state');
    assert.equal(publishedBossStates.length, 0);

    net.emit('fieldContextChanged', {
        previousFieldId: 'zone_1__party__boss_host',
        fieldId: currentFieldId
    });
    await manager._hostFieldHandoffPromise;
    assert.equal(manager._fieldBossStateReadyFieldId, currentFieldId);
    assert.equal(manager.monsters.has('pre_handoff_stale_boss'), false, 'a successful empty strict snapshot must clear stale local monsters');
    assert.equal(
        manager.zoneBossRespawnAt,
        bossState.bossDefeatedAt + 300000,
        'boss cooldown must use the current zone rule instead of poisoned persisted duration/deadline values'
    );

    manager._updateZoneBossSpawn();
    manager._updateZoneBossSpawn();
    for (let attempt = 0; attempt < 30 && manager.zoneBossSpawnPending; attempt += 1) {
        await Promise.resolve();
    }
    assert.equal(claimCount, 1, 'an expired cooldown must acquire only one single-flight spawn lease');
    assert.equal(manager.monsters.size, 1, 'server-aligned time must allow an already-expired cooldown to spawn');
    const spawnedBossId = Array.from(manager.monsters.keys())[0];
    manager._updateZoneBossSpawn();
    assert.equal(claimCount, 1, 'a live field boss must prevent another lease attempt');
    assert.ok(publishedBossStates.some((entry) => entry.phase === 'alive' && entry.bossInstanceId === spawnedBossId));

    let resolveResidentMonsterWrite = null;
    let resolveResidentRemovalFlush = null;
    let residentIncludedDead = false;
    const residentPendingRemovals = new Set(['removed_before_resident_marker']);
    assert.equal(manager.monsters.has('removed_before_resident_marker'), false, 'the pending tombstone target must already be absent from the resident map');
    const originalForceSyncAll = manager.forceSyncAll.bind(manager);
    manager.forceSyncAll = (options = {}) => {
        residentIncludedDead = options.includeDead === true;
        return originalForceSyncAll(options);
    };
    net.sendMonsterUpdate = () => new Promise((resolve) => { resolveResidentMonsterWrite = resolve; });
    net.flushPendingMonsterRemovalWrites = ({ fieldId }) => {
        assert.equal(fieldId, currentFieldId);
        return new Promise((resolve) => {
            resolveResidentRemovalFlush = (result) => {
                if (result === true) residentPendingRemovals.delete('removed_before_resident_marker');
                resolve(result);
            };
        });
    };
    const residentPublish = manager._publishResidentFieldBeforeHostYield(currentFieldId);
    await Promise.resolve();
    assert.equal(handoffReadyPublishes.length, 0, 'resident handoff readiness must wait for authoritative writes');
    resolveResidentMonsterWrite(true);
    await Promise.resolve();
    assert.equal(handoffReadyPublishes.length, 0, 'resident readiness must wait for already-removed monster tombstones');
    assert.equal(residentPendingRemovals.has('removed_before_resident_marker'), true);
    resolveResidentRemovalFlush(true);
    await residentPublish;
    assert.equal(residentPendingRemovals.has('removed_before_resident_marker'), false);
    assert.equal(residentIncludedDead, true, 'resident handoff publication must include dead monster snapshots');
    assert.equal(handoffReadyPublishes.length, 1, 'resident host must publish readiness only after writes complete');
    manager.forceSyncAll = originalForceSyncAll;
    net.sendMonsterUpdate = () => true;
    residentPendingRemovals.add('failed_resident_tombstone');
    net.flushPendingMonsterRemovalWrites = async () => false;
    assert.equal(
        await manager._publishResidentFieldBeforeHostYield(currentFieldId),
        false,
        'a failed monster tombstone flush must suppress the resident readiness marker'
    );
    assert.equal(handoffReadyPublishes.length, 1, 'failed tombstones must leave the readiness marker unpublished');
    assert.equal(residentPendingRemovals.has('failed_resident_tombstone'), true, 'a failed resident tombstone must remain pending');
    net.flushPendingMonsterRemovalWrites = async () => true;
    net.publishFieldHandoffReady = async () => false;
    assert.equal(
        await manager._publishResidentFieldBeforeHostYield(currentFieldId),
        false,
        'a marker write failure must be reported so the incoming host uses its bounded strict-read fallback'
    );
    assert.equal(handoffReadyPublishes.length, 1, 'failed marker writes must never masquerade as a readiness signal');
    net.publishFieldHandoffReady = async (payload) => {
        handoffReadyPublishes.push(payload);
        return true;
    };

    const differentInstanceTombstone = {
        ...bossState,
        bossInstanceId: 'defeated_boss_a',
        bossDefeatedAt: serverNow,
        ts: serverNow
    };
    assert.equal(manager._applyAuthoritativeFieldBossState(differentInstanceTombstone, {
        generation: manager.worldGeneration,
        fieldId: currentFieldId
    }), false, 'an old-instance tombstone must not remove a different live boss instance');
    assert.equal(manager.monsters.has(spawnedBossId), true);

    const liveBoss = manager.monsters.get(spawnedBossId);
    const firstDeadline = manager.zoneBossRespawnAt;
    assert.equal(net.isHost, true);
    assert.equal(window.game, game);
    assert.equal(liveBoss.isDead, false);
    liveBoss.lastAttackerId = 'boss_host';
    liveBoss.damageContributors.add('boss_host');
    liveBoss.takeDamage(liveBoss.hp + 1, false, false);
    assert.equal(liveBoss.isDead, true);
    const recordedDeadline = manager.zoneBossRespawnAt;
    assert.equal(liveBoss._wasProcessed, true, 'HP zero must synchronously settle the canonical host reward path');
    assert.ok(spawnedRewardDrops.some((entry) => entry.type === 'manastone'));
    assert.ok(spawnedRewardDrops.some((entry) => entry.type === 'hp'));
    assert.ok(spawnedRewardDrops.every((entry) => entry.forceNetwork === true), 'boss ground rewards must bypass quiet-mode loss windows');
    assert.ok(sentBossRewards.some((entry) => (
        entry.uid === 'boss_host'
        && entry.payload.exp > 0
        && entry.payload.rewardId?.endsWith(':boss_exp')
    )), 'boss EXP must be deterministically authored before demotion');
    assert.ok(sentBossRewards.some((entry) => (
        entry.uid === 'boss_host'
        && entry.payload.rewardId?.endsWith(':boss_items')
        && entry.payload.kind === 'boss_items'
        && entry.payload.items?.some((item) => item.id === 'ruin_test_staff')
    )), 'guaranteed boss weapon must be authored before demotion');
    const rewardCountsBeforeDemotion = {
        drops: spawnedRewardDrops.length,
        remote: sentBossRewards.length,
        local: localBossRewards.length
    };
    net.isHost = false;
    manager.update(0);
    assert.deepEqual({
        drops: spawnedRewardDrops.length,
        remote: sentBossRewards.length,
        local: localBossRewards.length
    }, rewardCountsBeforeDemotion, 'post-death demotion must not duplicate already-settled rewards');
    net.isHost = true;
    manager.recordFieldBossDefeat(liveBoss);
    await Promise.resolve();
    assert.notEqual(recordedDeadline, firstDeadline);
    assert.equal(manager.zoneBossRespawnAt, recordedDeadline, 'duplicate death processing must not extend the cooldown');
    assert.ok(publishedBossStates.some((entry) => entry.phase === 'defeated' && entry.bossInstanceId === spawnedBossId), 'quiet mode death must still persist a lifecycle tombstone');

    manager.clearAll({ preserveNetwork: true });
    assert.equal(manager._fieldBossStateReadyFieldId, null, 'clearAll must invalidate lifecycle readiness');
    bossState = { ...bossState, fieldId: currentFieldId };
    await manager.restoreAuthoritativeFieldState({
        settleMs: 0,
        publishWhenReady: false,
        waitForResidentPublish: false
    });
    assert.equal(manager._fieldBossStateReadyFieldId, currentFieldId, 'an already-host same-field restore must hydrate lifecycle readiness');
    manager.clearAll({ preserveNetwork: true });

    let resolveDemotedDefinition = null;
    game.monsterData.loadDefinition = () => new Promise((resolve) => { resolveDemotedDefinition = resolve; });
    net.isHost = true;
    manager._fieldBossStateReadyFieldId = currentFieldId;
    const demotedSpawn = manager._spawnMonster(1200, 1200, 'ruin_wobbuffet', {
        isBoss: true,
        zoneId: 'zone_2',
        fieldId: currentFieldId,
        instanceId: 'demoted_pending_boss'
    });
    net.isHost = false;
    resolveDemotedDefinition(definition);
    assert.equal(await demotedSpawn, null, 'a host demoted during async definition load must cancel the spawn');
    assert.equal(manager.monsters.size, 0);

    net.isHost = true;
    currentFieldId = 'zone_2__party__stale_read';
    let resolveStaleBossState = null;
    net.readFieldBossState = () => new Promise((resolve) => { resolveStaleBossState = resolve; });
    const staleRead = manager.restoreFieldBossStateFromSnapshot({ throwOnReadError: true });
    currentFieldId = 'zone_2__party__other_field';
    resolveStaleBossState({ ...bossState, fieldId: 'zone_2__party__stale_read' });
    const staleResult = await staleRead;
    assert.equal(staleResult.reason, 'stale_world', 'a lifecycle read resolving after field travel must be discarded');

    currentFieldId = 'zone_2__party__boss_read_failure';
    net.readMonsterHostSnapshot = async () => ({});
    net.readFieldDropsSnapshot = async () => ({});
    net.readFieldBossState = async () => { throw new Error('boss lifecycle read failed'); };
    net.emit('fieldContextChanged', {
        previousFieldId: 'zone_2__party__other_field',
        fieldId: currentFieldId
    });
    const failedBossHandoff = manager._hostFieldHandoffPromise;
    await assert.rejects(failedBossHandoff, /boss lifecycle read failed/);
    assert.equal(manager._hostFieldHandoffBlockedFieldId, currentFieldId, 'boss lifecycle read errors must keep spawning fail-closed');
    manager.clearAll({ preserveNetwork: true });
}

async function validateWorldSceneListenerLifecycle() {
    let participationDisabled = 0;
    const net = createEventBus({
        isHost: false,
        isZoneParticipationEnabled: () => true,
        setZoneParticipationEnabled: (enabled) => {
            if (enabled === false) participationDisabled += 1;
        }
    });
    let modalClosed = 0;
    let supersededModalTitle = null;
    let supersededModalMessage = null;
    const game = {
        net,
        camera: null,
        monsterManager: null,
        ui: {
            hideGenericModal: () => { modalClosed += 1; },
            disarmBrowserBackExitGuard: () => {},
            updateAutoAttackToggle: () => {},
            showGenericModal: (title, message) => {
                supersededModalTitle = title;
                supersededModalMessage = message;
            }
        },
        resources: null,
        input: null
    };
    const scene = new WorldScene(game);
    let clearedTarget = 0;
    scene.player = {
        autoAttackEnabled: true,
        clearCurrentTarget: () => { clearedTarget += 1; }
    };
    scene._setupNetworkHandlers();
    const firstCounts = Array.from(net.events.values()).reduce((sum, entries) => sum + entries.length, 0);
    scene._setupNetworkHandlers();
    const secondCounts = Array.from(net.events.values()).reduce((sum, entries) => sum + entries.length, 0);
    assert.equal(secondCounts, firstCounts, 'setting up a reused scene must not duplicate listeners');
    net.emit('profileWriterSuperseded', { uid: 'duplicate_player' });
    assert.equal(scene._profileWriterSuperseded, true);
    assert.equal(scene.player.autoAttackEnabled, false);
    assert.equal(clearedTarget, 1);
    assert.equal(participationDisabled, 1);
    assert.equal(supersededModalTitle, '중복 접속 감지');
    assert.equal(supersededModalMessage.includes('<br>'), false);
    await scene.exit();
    const remaining = Array.from(net.events.values()).reduce((sum, entries) => sum + entries.length, 0);
    assert.equal(remaining, 0, 'world listeners must be detached on scene exit');
    assert.equal(modalClosed, 1, 'scene exit must close the map/generic modal');

    let setSpawnRuleCalls = 0;
    const configuredManager = {
        activeZoneId: 'zone_3',
        spawnRules: [{ monsterId: 'emolga', count: 10 }],
        zoneBossRule: { monsterId: 'thunder_pikachu' },
        setSpawnRules: () => { setSpawnRuleCalls += 1; },
        primeSpawnCycle: () => {}
    };
    const configuredScene = new WorldScene({
        net: { isHost: true },
        camera: null,
        monsterManager: configuredManager,
        ui: null,
        resources: null,
        input: null,
        zone: {
            currentZone: {
                id: 'zone_3',
                monsterSpawns: [{ monsterId: 'emolga', count: 10 }],
                bossSpawn: { monsterId: 'thunder_pikachu' }
            }
        }
    });
    configuredScene.zoneSpawnRules = [{ monsterId: 'emolga', count: 10 }];
    configuredScene._ensureHostSpawnRulesLoaded();
    assert.equal(setSpawnRuleCalls, 0, 'same-zone host promotion must not invalidate an in-flight snapshot restore');
}

async function validateRewardDedupe() {
    const savedProfiles = [];
    const net = {
        isSharedFieldActive: () => false,
        savePlayerData: (_id, data) => { savedProfiles.push(data); },
        savePlayerProfilePatch: () => {},
        sendPlayerHp: () => {}
    };
    window.game = {
        net,
        zone: { currentZone: { id: 'zone_4' } },
        ui: {
            updateInventory: () => {},
            updateQuestUI: () => {},
            logSystemMessage: () => {}
        }
    };
    const player = new Player(100, 100, 'Reward Tester', null);
    player.id = 'reward_tester';
    player.net = net;
    window.game.localPlayer = player;
    const reward = {
        rewardId: 'monster_reward:zone_4:boss_1:reward_tester:boss_exp',
        bossReward: true,
        manastone: 50,
        monsterName: 'Boss'
    };
    assert.equal(player.receiveReward(reward, { save: false }), true);
    assert.equal(player.receiveReward(reward, { save: false }), false);
    assert.equal(player.manastone, 50, 'duplicate host rewards must not be applied twice');
    player.saveState(false, { debounceMs: 0, reason: 'runtime_validation' });
    assert.deepEqual(savedProfiles.at(-1).claimedRewardIds, [reward.rewardId]);
}

async function validateProfileWriterFencingContracts() {
    const uid = 'profile_fence_player';
    let transientSessionFailures = 0;
    let profile = {
        inventory: [],
        pendingItemRewards: [],
        claimedRewardIds: [],
        ts: 1
    };
    const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));
    const profileRef = {
        async transaction(update) {
            if (transientSessionFailures > 0) {
                transientSessionFailures -= 1;
                throw new Error('temporary profile session failure');
            }
            const next = update(clone(profile));
            if (next === undefined) {
                return { committed: false, snapshot: { val: () => clone(profile) } };
            }
            profile = clone(next);
            return { committed: true, snapshot: { val: () => clone(profile) } };
        },
        async once() {
            return { val: () => clone(profile) };
        }
    };
    const firebaseMock = {
        database: () => ({
            ref(path) {
                if (path === `users/${uid}/profile`) return profileRef;
                return {
                    async transaction(update) {
                        const next = update(null);
                        return { committed: next !== undefined, snapshot: { val: () => clone(next) } };
                    },
                    async set() {},
                    async update() {},
                    async once() { return { val: () => null }; }
                };
            }
        })
    };
    const previousWindowFirebase = window.firebase;
    const previousGlobalFirebase = globalThis.firebase;
    window.firebase = firebaseMock;
    globalThis.firebase = firebaseMock;
    try {
        transientSessionFailures = 1;
        const retryingTab = new NetworkManager();
        retryingTab.playerId = uid;
        const failedSession = retryingTab._beginProfileWriterSession(uid);
        await failedSession.promise;
        failedSession.retryAt = Date.now();
        const recoveredSession = await retryingTab._ensureProfileWriterSession(uid);
        assert.equal(recoveredSession?.ready, true, 'a transient writer-session claim failure must be retried');

        const olderTab = new NetworkManager();
        olderTab.playerId = uid;
        olderTab._writeProfileBackup = async () => true;
        olderTab._syncRecoveryProfile = async () => true;
        await olderTab._beginProfileWriterSession(uid).promise;
        let supersededEvents = 0;
        olderTab.on('profileWriterSuperseded', () => { supersededEvents += 1; });

        const activeTab = new NetworkManager();
        activeTab.playerId = uid;
        activeTab._writeProfileBackup = async () => true;
        activeTab._syncRecoveryProfile = async () => true;
        await activeTab._beginProfileWriterSession(uid).promise;

        const rewardItem = {
            id: 'tidal_staff',
            type: 'tidal_staff',
            instanceId: 'durable_profile_fence_weapon',
            amount: 1
        };
        const rewardId = 'monster_reward:zone_2:boss_profile_fence:profile_fence_player:boss_items';
        const activeSave = await activeTab._commitPlayerData(uid, {
            inventory: [rewardItem],
            pendingItemRewards: [],
            claimedRewardIds: [rewardId],
            ts: Date.now()
        });
        assert.equal(activeSave.ok, true);

        const staleSave = await olderTab._commitPlayerData(uid, {
            inventory: [],
            pendingItemRewards: [],
            claimedRewardIds: [],
            ts: Date.now() + 10_000
        });
        assert.equal(staleSave.reason, 'writer_session_superseded');
        assert.equal(supersededEvents, 1, 'the superseded tab must be told to stop gameplay exactly once');
        assert.equal(profile.inventory[0].instanceId, rewardItem.instanceId);
        assert.deepEqual(profile.claimedRewardIds, [rewardId], 'an older tab must never roll back a claimed durable reward');

        window.game = { auth: { currentUser: { uid, isAnonymous: true } } };
        const guestTab = new NetworkManager();
        guestTab.playerId = uid;
        assert.equal(guestTab._shouldUseProfileWriterSession(uid), false);
        guestTab._writeProfileBackup = async () => true;
        guestTab._syncRecoveryProfile = async () => true;
        const guestSave = await guestTab._commitPlayerData(uid, {
            inventory: [],
            pendingItemRewards: [],
            claimedRewardIds: [],
            ts: Date.now() + 20_000
        });
        assert.equal(guestSave.ok, true, 'anonymous guest profiles must not be blocked by writer-session fencing');
    } finally {
        window.game = undefined;
        window.firebase = previousWindowFirebase;
        if (previousGlobalFirebase === undefined) delete globalThis.firebase;
        else globalThis.firebase = previousGlobalFirebase;
    }
}

async function validateDurableBossRewardContracts() {
    const readItemPolicyJson = async (fileName) => JSON.parse(await readFile(
        new URL(`../assets/data/items/${fileName}`, import.meta.url),
        'utf8'
    ));
    const archivedV1 = DURABLE_BOSS_REWARD_ARCHIVED_CATALOGS[1];
    const assertDeepFrozen = (value, path = 'archive') => {
        if (!value || typeof value !== 'object') return;
        assert.equal(Object.isFrozen(value), true, `${path} must be recursively immutable`);
        Object.entries(value).forEach(([key, child]) => assertDeepFrozen(child, `${path}.${key}`));
    };
    assertDeepFrozen(archivedV1);
    const archivedItemPairs = [
        ['magic_staff', 'magic_staff.json', 'magic_staff_affixes.json'],
        ['tidal_staff', 'tidal_staff.json', 'tidal_staff_affixes.json'],
        ['storm_staff', 'storm_staff.json', 'storm_staff_affixes.json'],
        ['astral_staff', 'astral_staff.json', 'astral_staff_affixes.json']
    ];
    for (const [itemId, definitionFile, affixFile] of archivedItemPairs) {
        const [liveDefinition, liveAffixPool] = await Promise.all([
            readItemPolicyJson(definitionFile),
            readItemPolicyJson(affixFile)
        ]);
        const archivedItem = archivedV1.items[itemId];
        assert.deepEqual({
            name: archivedItem.name,
            description: archivedItem.description || '',
            icon: archivedItem.icon,
            iconPath: archivedItem.iconPath,
            rarity: archivedItem.rarity,
            enhancementRuleSet: archivedItem.enhancementRuleSet,
            baseStats: archivedItem.baseStats,
            enhancementBonuses: archivedItem.enhancementBonuses,
            visuals: archivedItem.visuals
        }, {
            name: liveDefinition.name,
            description: liveDefinition.description || '',
            icon: liveDefinition.icon.fallbackEmoji,
            iconPath: liveDefinition.icon.path,
            rarity: liveDefinition.rarity,
            enhancementRuleSet: liveDefinition.enhancementRuleSet,
            baseStats: liveDefinition.baseStats,
            enhancementBonuses: liveDefinition.enhancementBonuses,
            visuals: liveDefinition.visuals
        }, `${itemId} archived item policy must exactly match released v1 data`);
        assert.deepEqual(
            archivedItem.affixes,
            Object.fromEntries(liveAffixPool.affixes.map((affix) => [affix.id, affix])),
            `${itemId} archived affix combat and visual policy must exactly match released v1 data`
        );
    }
    const liveEnhancementRules = await readItemPolicyJson('equipment_enhancement_rules.json');
    assert.deepEqual(
        archivedV1.enhancementRuleSets.weapon_standard_1_to_10,
        liveEnhancementRules.ruleSets.find((rule) => rule.id === 'weapon_standard_1_to_10'),
        'the archived v1 enhancement policy must exactly match the released rule'
    );
    const archivedBossPairs = [
        ['king_slime', 'king_slime.json'],
        ['ruin_wobbuffet', 'ruin_wobbuffet.json'],
        ['thunder_pikachu', 'thunder_pikachu.json'],
        ['astral_sylveon', 'astral_sylveon.json']
    ];
    for (const [bossTypeId, monsterFile] of archivedBossPairs) {
        const liveBoss = JSON.parse(await readFile(
            new URL(`../assets/data/monsters/${monsterFile}`, import.meta.url),
            'utf8'
        ));
        assert.deepEqual(
            archivedV1.bossProgress[bossTypeId],
            { level: liveBoss.baseStats.level, baseExp: liveBoss.baseStats.exp },
            `${bossTypeId} durable EXP policy must match the released monster data`
        );
    }

    const legacyOnlyItemData = new ItemDataManager(null);
    const legacyCases = [
        ['magic_staff', 'starlight', { missileDamageBonus: 0.35, missileManaCostReduction: 0.2 }, 'missileVariant', 'golden_missile'],
        ['tidal_staff', 'tidal_blue_flame', { fireballChainChance: 0.31, fireballChainDamageRatio: 0.57 }, 'fireballVariant', 'blue_fireball'],
        ['storm_staff', 'storm_starlight', { missileDamageBonus: 0.52, missileManaCostReduction: 0.25 }, 'missileVariant', 'golden_missile'],
        ['astral_staff', 'astral_crimson_flash', { laserDamageBonus: 0.61, attackSpeedBonus: 0.24 }, 'laserVariant', 'crimson_chain']
    ];
    const buildLegacyWeapon = (itemId, prefixId, rolledValues, index, overrides = {}) => {
        const policy = archivedV1.items[itemId];
        const affix = policy.affixes[prefixId];
        return {
            id: itemId,
            type: itemId,
            amount: 1,
            instanceId: `legacy_boss_weapon_${index}`,
            name: affix.displayName,
            baseName: policy.name,
            icon: policy.icon,
            iconPath: policy.iconPath,
            stackable: false,
            slot: 'weapon',
            rarity: 'boss',
            prefixId,
            prefix: affix.prefix,
            rolledValues: { ...rolledValues },
            enhancementLevel: index % 2 === 0 ? 0 : 7,
            enhancementRuleSet: policy.enhancementRuleSet,
            enhancementBonuses: { ...policy.enhancementBonuses },
            baseStats: { ...policy.baseStats },
            description: policy.description || '',
            ...overrides
        };
    };
    const previousLegacyGame = window.game;
    const legacyPlayer = new Player(100, 100, 'Legacy Archive Migrator', null);
    window.game = { itemData: legacyOnlyItemData, localPlayer: legacyPlayer };
    legacyCases.forEach(([itemId, prefixId, rolls, variantKey, expectedVariant], index) => {
        const normalized = legacyOnlyItemData.normalizeInventoryItem(
            buildLegacyWeapon(itemId, prefixId, rolls, index)
        );
        assert.equal(normalized?.durableEntitlementVersion, 1, `${itemId} must migrate without a live catalog`);
        assert.ok(normalized?.durableEntitlementBossTypeId);
        legacyPlayer.equipment.weapon = normalized;
        assert.equal(
            legacyPlayer.getWeaponCombatProfile()[variantKey],
            expectedVariant,
            `${itemId} migrated combat behavior must remain active`
        );
    });
    const validLegacyTidal = buildLegacyWeapon(
        'tidal_staff',
        'tidal_blue_flame',
        { fireballChainChance: 0.31, fireballChainDamageRatio: 0.57 },
        99
    );
    const invalidLegacyCases = [
        { ...validLegacyTidal, baseStats: { ...validLegacyTidal.baseStats, attackPower: 999999 } },
        { ...validLegacyTidal, rolledValues: { ...validLegacyTidal.rolledValues, fireballChainChance: 0.99 } },
        { ...validLegacyTidal, rarity: 'common' },
        { ...validLegacyTidal, enhancementRuleSet: 'forged_rule' },
        { ...validLegacyTidal, instanceId: '' },
        { ...validLegacyTidal, id: 'ambiguous_other_id' }
    ];
    invalidLegacyCases.forEach((candidate, index) => {
        const normalized = legacyOnlyItemData.normalizeInventoryItem(candidate);
        assert.equal(
            normalized?.durableEntitlementVersion,
            undefined,
            `forged legacy boss weapon ${index} must fail closed instead of receiving an archive tag`
        );
    });
    window.game = previousLegacyGame;

    const durablePreviousLocalStorage = window.localStorage;
    const durableBaseStorageRecords = new Map();
    window.localStorage = {
        getItem: (key) => durableBaseStorageRecords.get(key) ?? null,
        setItem: (key, value) => durableBaseStorageRecords.set(key, String(value)),
        removeItem: (key) => durableBaseStorageRecords.delete(key)
    };
    const itemData = createDurableRewardItemData();
    const recipientId = 'durable_recipient';
    const authorHostId = 'departed_host';
    const fieldId = 'zone_2__party__departed_host';
    const bossInstanceId = 'ruin_boss_instance_1';
    const authoredAt = 2_000_000;
    const item = itemData.createRewardItem('tidal_staff', {
        instanceId: 'durable_tidal_staff_1',
        prefixId: 'tidal_blue_flame',
        rolledValues: {
            fireballChainChance: 0.31,
            fireballChainDamageRatio: 0.57
        }
    });
    const rewardId = `monster_reward:${fieldId}:${bossInstanceId}:${recipientId}:boss_items`;
    const request = {
        kind: 'boss_items',
        rewardKind: 'boss_items',
        rewardId,
        bossReward: true,
        immediate: true,
        bossTypeId: 'ruin_wobbuffet',
        bossInstanceId,
        monsterName: 'Ruin Boss',
        items: [item]
    };
    window.game = { itemData };

    const authorNet = new NetworkManager();
    authorNet.playerId = authorHostId;
    authorNet.connected = true;
    authorNet.isHost = true;
    authorNet._getCurrentFieldId = () => fieldId;
    authorNet.getServerNow = () => authoredAt;
    const envelope = authorNet._createDurableBossRewardEnvelope(recipientId, request, { fieldId });
    assert.ok(envelope, 'a configured guaranteed boss weapon must produce a strict durable envelope');
    const rewardKey = authorNet._buildDurableRewardKey(rewardId);
    const rewardPath = `durable_rewards_v1/${recipientId}/${rewardKey}`;

    const receiverNet = new NetworkManager();
    receiverNet.playerId = recipientId;
    receiverNet.currentHostId = 'different_current_host';
    receiverNet._activeZoneFieldId = 'zone_4';
    receiverNet.getServerNow = () => authoredAt + 15_000;
    window.game = {
        itemData,
        zone: { currentZone: { id: 'zone_4' } },
        localPlayer: { id: recipientId, level: 20, party: { members: [recipientId] } }
    };
    assert.equal(
        receiverNet._validateDurableBossRewardEnvelope(envelope, rewardKey, authoredAt + 15_000).ok,
        true,
        'durable boss items must survive more than ten seconds plus map and host changes'
    );
    assert.equal(
        receiverNet._validateDurableBossRewardEnvelope({ ...envelope, forged: true }, rewardKey, authoredAt + 15_000).reason,
        'unknown_field',
        'strict envelopes must reject unknown fields'
    );
    assert.equal(
        receiverNet._validateDurableBossRewardEnvelope({
            ...envelope,
            status: 'claimed',
            claimedBy: recipientId,
            claimedAt: authoredAt + 10_000
        }, rewardKey, authoredAt + 15_000).reason,
        'unknown_field',
        'claimed tombstones must not retain reusable item seeds'
    );
    assert.equal(
        receiverNet._validateDurableBossRewardEnvelope({
            ...envelope,
            itemSeeds: [{
                ...envelope.itemSeeds[0],
                rolledValues: { ...envelope.itemSeeds[0].rolledValues, fireballChainChance: 0.99 }
            }]
        }, rewardKey, authoredAt + 15_000).reason,
        'invalid_item_snapshot',
        'a seed mutation that no longer matches the immutable item snapshot must be rejected'
    );
    const coordinatedRollForge = JSON.parse(JSON.stringify(envelope));
    coordinatedRollForge.itemSeeds[0].rolledValues.fireballChainChance = 0.99;
    coordinatedRollForge.itemSnapshots[0].rolledValues.fireballChainChance = 0.99;
    coordinatedRollForge.itemSnapshotFingerprint = receiverNet._hashDurableRewardCatalogValue({
        bossTypeId: coordinatedRollForge.bossTypeId,
        itemSnapshots: coordinatedRollForge.itemSnapshots
    });
    assert.equal(
        receiverNet._validateDurableBossRewardEnvelope(
            coordinatedRollForge,
            rewardKey,
            authoredAt + 15_000
        ).reason,
        'archived_roll_out_of_range',
        'a coordinated seed/snapshot/hash forge must still be rejected by the immutable policy'
    );
    const coordinatedStatForge = JSON.parse(JSON.stringify(envelope));
    coordinatedStatForge.itemSnapshots[0].baseStats.attackPower = 1_000_000_000;
    coordinatedStatForge.itemSnapshotFingerprint = receiverNet._hashDurableRewardCatalogValue({
        bossTypeId: coordinatedStatForge.bossTypeId,
        itemSnapshots: coordinatedStatForge.itemSnapshots
    });
    assert.equal(
        receiverNet._validateDurableBossRewardEnvelope(
            coordinatedStatForge,
            rewardKey,
            authoredAt + 15_000
        ).reason,
        'archived_item_snapshot_mismatch',
        'a self-consistent oversized stat snapshot must be rejected by exact archived stats'
    );
    const coordinatedUnknownItemForge = JSON.parse(JSON.stringify(envelope));
    coordinatedUnknownItemForge.itemSeeds[0].itemId = 'unknown_admin_staff';
    coordinatedUnknownItemForge.itemSnapshots[0].id = 'unknown_admin_staff';
    coordinatedUnknownItemForge.itemSnapshots[0].type = 'unknown_admin_staff';
    coordinatedUnknownItemForge.itemSnapshotFingerprint = receiverNet._hashDurableRewardCatalogValue({
        bossTypeId: coordinatedUnknownItemForge.bossTypeId,
        itemSnapshots: coordinatedUnknownItemForge.itemSnapshots
    });
    assert.equal(
        receiverNet._validateDurableBossRewardEnvelope(
            coordinatedUnknownItemForge,
            rewardKey,
            authoredAt + 15_000
        ).reason,
        'archived_item_not_allowed',
        'an unknown item must not become valid by recomputing the client-side fingerprint'
    );
    const coordinatedRemovedAffixForge = JSON.parse(JSON.stringify(envelope));
    coordinatedRemovedAffixForge.itemSeeds[0].prefixId = 'removed_affix';
    coordinatedRemovedAffixForge.itemSnapshots[0].prefixId = 'removed_affix';
    coordinatedRemovedAffixForge.itemSnapshotFingerprint = receiverNet._hashDurableRewardCatalogValue({
        bossTypeId: coordinatedRemovedAffixForge.bossTypeId,
        itemSnapshots: coordinatedRemovedAffixForge.itemSnapshots
    });
    assert.equal(
        receiverNet._validateDurableBossRewardEnvelope(
            coordinatedRemovedAffixForge,
            rewardKey,
            authoredAt + 15_000
        ).reason,
        'archived_item_not_allowed',
        'a removed or unknown affix must remain rejected after a coordinated payload mutation'
    );
    const kingAffixCases = [
        ['starlight', { missileDamageBonus: 0.35, missileManaCostReduction: 0.2 }],
        ['blue_flame', { fireballChainChance: 0.3, fireballChainDamageRatio: 0.55 }],
        ['crimson_flash', { laserDamageBonus: 0.35, attackSpeedBonus: 0.2 }]
    ];
    kingAffixCases.forEach(([prefixId, rolledValues], index) => {
        const seed = {
            itemId: 'magic_staff',
            amount: 1,
            instanceId: `king_archive_staff_${index}`,
            prefixId,
            rolledValues
        };
        const snapshot = {
            id: 'magic_staff',
            type: 'magic_staff',
            amount: 1,
            instanceId: seed.instanceId,
            prefixId,
            rolledValues,
            stackable: false,
            slot: 'weapon',
            enhancementLevel: 0,
            enhancementRuleSet: 'weapon_standard_1_to_10',
            baseStats: { attackPower: 5, critRate: 0.05, mpRegen: 3 },
            enhancementBonuses: { attackPowerPerLevel: 1, critRatePerLevel: 0.01 }
        };
        assert.equal(
            receiverNet._validateDurableBossRewardAgainstArchivedCatalog(
                { catalogVersion: 1, bossTypeId: 'king_slime' },
                [seed],
                [snapshot]
            ).ok,
            true,
            `King Slime archived affix ${prefixId} must remain claimable`
        );
    });
    assert.equal(
        receiverNet._validateDurableBossRewardEnvelope(
            envelope,
            rewardKey,
            envelope.expiresAt + (365 * 24 * 60 * 60 * 1000)
        ).ok,
        true,
        'an unclaimed guaranteed boss weapon must remain claimable indefinitely'
    );
    assert.equal(
        receiverNet._validateDurableBossRewardEnvelope(envelope, 'wrong_key', authoredAt + 15_000).reason,
        'receipt_key_mismatch'
    );
    const newerCatalogItemData = createDurableRewardItemData();
    newerCatalogItemData.loadedCatalog.schemaVersion = 2;
    window.game.itemData = newerCatalogItemData;
    const catalogMismatch = receiverNet._validateDurableBossRewardEnvelope(
        envelope,
        rewardKey,
        authoredAt + 15_000
    );
    assert.equal(catalogMismatch.ok, true, 'concrete item snapshots must survive a catalog version deployment');
    const driftedCatalogItemData = createDurableRewardItemData();
    driftedCatalogItemData.getAffixDefinition('tidal_blue_flame').rolledEffects.fireballChainChance.max = 0.41;
    window.game.itemData = driftedCatalogItemData;
    const catalogFingerprintMismatch = receiverNet._validateDurableBossRewardEnvelope(
        envelope,
        rewardKey,
        authoredAt + 15_000
    );
    assert.equal(catalogFingerprintMismatch.ok, true, 'concrete item snapshots must survive catalog content drift');
    window.game.itemData = null;
    const materializedWithoutCatalog = receiverNet._materializeDurableBossReward(envelope);
    assert.ok(materializedWithoutCatalog, 'a concrete durable entitlement must materialize without any current catalog');
    assert.equal(materializedWithoutCatalog.items[0].id, envelope.itemSeeds[0].itemId);
    assert.equal(materializedWithoutCatalog.items[0].instanceId, envelope.itemSeeds[0].instanceId);
    assert.equal(materializedWithoutCatalog.items[0].prefixId, envelope.itemSeeds[0].prefixId);
    assert.deepEqual(materializedWithoutCatalog.items[0].rolledValues, envelope.itemSeeds[0].rolledValues);
    assert.deepEqual(
        materializedWithoutCatalog.items[0].baseStats,
        { attackPower: 8, critRate: 0.06, mpRegen: 4 },
        'catalog-independent materialization must use the immutable archived weapon stats'
    );
    assert.equal(materializedWithoutCatalog.items[0].durableEntitlementVersion, 1);
    const enhancedArchivedItem = {
        ...materializedWithoutCatalog.items[0],
        enhancementLevel: 7,
        rolledValues: { ...materializedWithoutCatalog.items[0].rolledValues },
        baseStats: { ...materializedWithoutCatalog.items[0].baseStats },
        enhancementBonuses: { ...materializedWithoutCatalog.items[0].enhancementBonuses }
    };
    const archivedOnlyItemData = new ItemDataManager(null);
    const normalizedAfterCatalogRemoval = archivedOnlyItemData.normalizeInventoryItem(enhancedArchivedItem);
    assert.ok(normalizedAfterCatalogRemoval, 'a valid archived entitlement must normalize without the live catalog');
    assert.equal(normalizedAfterCatalogRemoval.instanceId, enhancedArchivedItem.instanceId);
    assert.equal(normalizedAfterCatalogRemoval.prefixId, enhancedArchivedItem.prefixId);
    assert.equal(normalizedAfterCatalogRemoval.enhancementLevel, 7);
    assert.deepEqual(normalizedAfterCatalogRemoval.rolledValues, enhancedArchivedItem.rolledValues);
    assert.deepEqual(normalizedAfterCatalogRemoval.baseStats, enhancedArchivedItem.baseStats);
    assert.deepEqual(normalizedAfterCatalogRemoval.enhancementBonuses, enhancedArchivedItem.enhancementBonuses);
    assert.equal(
        archivedOnlyItemData.getEffectiveAffixDefinition(normalizedAfterCatalogRemoval)?.skillOverrides?.fireballVisualVariant,
        'blue_fireball',
        'the immutable archive must retain the actual special-skill variant'
    );
    assert.equal(
        archivedOnlyItemData.getEffectiveAffixDefinition(normalizedAfterCatalogRemoval)?.rolledEffects?.fireballChainChance?.displayAsPercent,
        true,
        'the immutable archive must retain percent-based enhancement semantics'
    );
    assert.ok(
        archivedOnlyItemData.getAuraState(normalizedAfterCatalogRemoval),
        'the immutable archive must retain the equip aura when the live definition is gone'
    );
    window.game.itemData = itemData;

    const memory = createMemoryRewardDatabase();
    memory.failNextTransactions(1);
    authorNet.dbRef = memory.dbRef;
    authorNet._getDurableRewardRetryDelay = () => 0;
    assert.equal(authorNet.sendReward(recipientId, request), true);
    for (let attempt = 0; attempt < 40 && authorNet._pendingDurableRewardWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(authorNet._pendingDurableRewardWrites.size, 0, 'a transient receipt transaction failure must be retried');
    assert.equal(memory.transactionAttempts.length, 2, 'durable boss item delivery must use an idempotent transaction retry');
    assert.equal(memory.transactionAttempts[0], rewardPath);
    assert.equal(memory.transactionAttempts[1], rewardPath);
    assert.equal(memory.records.get(rewardPath).authoredAt, authoredAt, 'retry must preserve the original authored timestamp');
    assert.deepEqual(memory.records.get(rewardPath).itemSeeds, envelope.itemSeeds, 'retry must preserve the original item seed payload');
    assert.deepEqual(memory.records.get(rewardPath).itemSnapshots, envelope.itemSnapshots, 'retry must preserve the concrete item entitlement');

    const skewedDurableStored = authorNet._serializeDurableRewardOutboxEntry({
        queueKey: `${recipientId}:${rewardKey}`,
        rewardKey,
        recipientId,
        envelope,
        authorHostId,
        queuedAt: Date.now() - (365 * 24 * 60 * 60 * 1000),
        timestampFinalized: false
    });
    const skewedDurableStorageKey = authorNet._getDurableRewardOutboxStorageKey(authorHostId);
    durableBaseStorageRecords.set(skewedDurableStorageKey, JSON.stringify([skewedDurableStored]));
    const skewedDurableRestore = new NetworkManager();
    skewedDurableRestore.playerId = authorHostId;
    skewedDurableRestore.dbRef = createMemoryRewardDatabase().dbRef;
    skewedDurableRestore._attemptDurableBossRewardWrite = async () => false;
    assert.equal(
        skewedDurableRestore._restoreDurableRewardOutbox(),
        1,
        'a local OS clock jump must not discard an unfinalized durable boss reward'
    );
    skewedDurableRestore._pendingDurableRewardWrites.clear();
    durableBaseStorageRecords.clear();

    const quotaPreviousStorage = window.localStorage;
    const quotaPreviousFirebase = window.firebase;
    window.localStorage = {
        getItem: () => null,
        setItem: () => { throw new Error('simulated durable outbox quota failure'); },
        removeItem: () => {}
    };
    window.firebase = {};
    const quotaMemory = createMemoryRewardDatabase();
    const quotaNet = new NetworkManager();
    quotaNet.playerId = 'durable_quota_host';
    quotaNet.connected = true;
    quotaNet.isHost = true;
    quotaNet.dbRef = quotaMemory.dbRef;
    quotaNet._getCurrentFieldId = () => fieldId;
    quotaNet.getServerNow = () => authoredAt;
    quotaNet._ensureDurableRewardServerTime = async () => {
        quotaNet._serverTimeOffsetReady = true;
        return true;
    };
    const quotaDegradedReasons = [];
    quotaNet.on('rewardDeliveryDegraded', (event) => quotaDegradedReasons.push(event?.reason));
    const quotaBossInstanceId = `${bossInstanceId}_quota`;
    const quotaRewardId = `monster_reward:${fieldId}:${quotaBossInstanceId}:${recipientId}:boss_items`;
    assert.equal(quotaNet.sendReward(recipientId, {
        ...request,
        rewardId: quotaRewardId,
        bossInstanceId: quotaBossInstanceId,
        items: [{ ...item, instanceId: 'durable_quota_item' }]
    }), false, 'total browser-storage failure must be reported to the boss reward caller');
    for (let attempt = 0; attempt < 40 && quotaMemory.transactionAttempts.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const quotaRewardPath = `durable_rewards_v1/${recipientId}/${quotaNet._buildDurableRewardKey(quotaRewardId)}`;
    assert.equal(quotaMemory.transactionAttempts.length, 1, 'volatile degraded mode must still attempt Firebase immediately');
    assert.ok(quotaMemory.records.has(quotaRewardPath), 'a localStorage quota failure must not silently lose the boss reward');
    assert.equal(quotaNet._pendingDurableRewardWrites.size, 0);
    assert.deepEqual(quotaDegradedReasons, ['durable_outbox_persistence_failed']);
    window.localStorage = quotaPreviousStorage;
    window.firebase = quotaPreviousFirebase;

    const unavailablePreviousStorage = window.localStorage;
    const unavailablePreviousFirebase = window.firebase;
    window.localStorage = null;
    window.firebase = {};
    const unavailableStorageMemory = createMemoryRewardDatabase();
    const unavailableStorageNet = new NetworkManager();
    unavailableStorageNet.playerId = 'durable_storage_unavailable_host';
    unavailableStorageNet.connected = true;
    unavailableStorageNet.isHost = true;
    unavailableStorageNet.dbRef = unavailableStorageMemory.dbRef;
    unavailableStorageNet._getCurrentFieldId = () => fieldId;
    unavailableStorageNet.getServerNow = () => authoredAt;
    let unavailableServerTimeReady = false;
    let unavailableServerTimeChecks = 0;
    unavailableStorageNet._ensureDurableRewardServerTime = async () => {
        unavailableServerTimeChecks += 1;
        if (!unavailableServerTimeReady) return false;
        unavailableStorageNet._serverTimeOffsetReady = true;
        return true;
    };
    unavailableStorageNet._getDurableRewardRetryDelay = () => 100_000;
    const unavailableBossInstanceId = `${bossInstanceId}_storage_unavailable`;
    const unavailableRewardId = `monster_reward:${fieldId}:${unavailableBossInstanceId}:${recipientId}:boss_items`;
    assert.equal(unavailableStorageNet.sendReward(recipientId, {
        ...request,
        rewardId: unavailableRewardId,
        bossInstanceId: unavailableBossInstanceId,
        items: [{ ...item, instanceId: 'durable_storage_unavailable_item' }]
    }), false);
    for (let attempt = 0; attempt < 40 && unavailableServerTimeChecks === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const unavailableQueueKey = `${recipientId}:${unavailableStorageNet._buildDurableRewardKey(unavailableRewardId)}`;
    const unavailableEntry = unavailableStorageNet._pendingDurableRewardWrites.get(unavailableQueueKey);
    assert.ok(unavailableEntry);
    assert.equal(unavailableEntry.volatileOnly, true);
    assert.equal(unavailableEntry.timestampFinalized, false);
    assert.equal(unavailableStorageMemory.transactionAttempts.length, 0);
    unavailableStorageNet._clearDurableRewardRuntime({ clearConsumer: true });
    assert.equal(unavailableStorageNet._restoreDurableRewardOutbox(), 1);
    for (let attempt = 0; attempt < 40 && unavailableServerTimeChecks < 2; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const restoredUnavailableEntry = unavailableStorageNet._pendingDurableRewardWrites.get(unavailableQueueKey);
    assert.ok(restoredUnavailableEntry, 'same-tab reconnect must restore an unfinalized volatile receipt');
    assert.equal(restoredUnavailableEntry.volatileOnly, true, 'same-tab reconnect must preserve volatile-only timestamp finalization semantics');
    assert.equal(restoredUnavailableEntry.timestampFinalized, false);
    unavailableServerTimeReady = true;
    clearTimeout(restoredUnavailableEntry.timer);
    restoredUnavailableEntry.timer = null;
    await unavailableStorageNet._attemptDurableBossRewardWrite(restoredUnavailableEntry);
    const unavailableRewardPath = `durable_rewards_v1/${recipientId}/${unavailableStorageNet._buildDurableRewardKey(unavailableRewardId)}`;
    assert.equal(unavailableStorageMemory.transactionAttempts.length, 1);
    assert.ok(unavailableStorageMemory.records.has(unavailableRewardPath));
    assert.equal(unavailableStorageNet._pendingNormalRewardWrites.size, 0, 'storage-less durable overflow must not be misreported as a persisted normal receipt');
    assert.equal(unavailableStorageNet._queuedRewardBatches.size, 0, 'storage-less durable overflow must not be misreported as a persisted batch journal');
    assert.equal(unavailableStorageNet._pendingDurableRewardWrites.size, 0);
    window.localStorage = unavailablePreviousStorage;
    window.firebase = unavailablePreviousFirebase;

    const durableBackpressureNet = new NetworkManager();
    durableBackpressureNet.playerId = 'durable_backpressure_host';
    durableBackpressureNet.connected = true;
    durableBackpressureNet.isHost = true;
    durableBackpressureNet.dbRef = null;
    durableBackpressureNet._getCurrentFieldId = () => fieldId;
    durableBackpressureNet.getServerNow = () => authoredAt;
    durableBackpressureNet._getDurableRewardRetryDelay = () => 100_000;
    for (let index = 0; index < 128; index += 1) {
        const queueKey = `durable_backpressure_capacity_${index}`;
        durableBackpressureNet._pendingDurableRewardWrites.set(queueKey, {
            queueKey,
            envelope: { authorHostId: durableBackpressureNet.playerId },
            volatileOnly: false,
            timer: null
        });
    }
    const backpressureBossInstanceId = `${bossInstanceId}_backpressure`;
    const backpressureRewardId = `monster_reward:${fieldId}:${backpressureBossInstanceId}:${recipientId}:boss_items`;
    assert.equal(durableBackpressureNet.sendReward(recipientId, {
        ...request,
        rewardId: backpressureRewardId,
        bossInstanceId: backpressureBossInstanceId,
        items: [{ ...item, instanceId: 'durable_backpressure_item' }]
    }), false, 'a full durable queue must apply backpressure to boss death settlement');
    assert.equal(
        durableBackpressureNet._pendingNormalRewardWrites.size,
        0,
        'a guaranteed boss weapon must never downgrade into a normal receipt when durable storage is full'
    );
    assert.equal(
        durableBackpressureNet._queuedRewardBatches.size,
        0,
        'a guaranteed boss weapon must never downgrade into the normal batch journal'
    );
    assert.equal(
        Array.from(durableBackpressureNet._pendingDurableRewardWrites.values())
            .filter((entry) => entry?.volatileOnly === true).length,
        1,
        'one bounded volatile durable transaction must retain the canonical archived entitlement'
    );
    durableBackpressureNet._clearDurableRewardRuntime({ clearConsumer: true });

    const saturatedMemory = createMemoryRewardDatabase();
    saturatedMemory.failNextTransactions(1);
    const saturatedNet = new NetworkManager();
    saturatedNet.playerId = 'durable_saturated_host';
    saturatedNet.connected = true;
    saturatedNet.isHost = true;
    saturatedNet.dbRef = saturatedMemory.dbRef;
    saturatedNet._getCurrentFieldId = () => fieldId;
    saturatedNet.getServerNow = () => authoredAt;
    saturatedNet._serverTimeOffsetReady = true;
    saturatedNet._getDurableRewardRetryDelay = () => 100_000;
    for (let index = 0; index < 128; index += 1) {
        const queueKey = `durable_capacity_${index}`;
        saturatedNet._pendingDurableRewardWrites.set(queueKey, {
            queueKey,
            envelope: { authorHostId: saturatedNet.playerId },
            volatileOnly: false,
            timer: null
        });
    }
    for (let index = 0; index < 512; index += 1) {
        saturatedNet._pendingNormalRewardWrites.set(`normal_capacity_${index}`, {});
        saturatedNet._queuedRewardBatches.set(`batch_capacity_${index}`, {});
    }
    const saturatedReasons = [];
    saturatedNet.on('rewardDeliveryDegraded', (event) => saturatedReasons.push(event?.reason));
    const saturatedBossInstanceId = `${bossInstanceId}_saturated`;
    const saturatedRewardId = `monster_reward:${fieldId}:${saturatedBossInstanceId}:${recipientId}:boss_items`;
    assert.equal(saturatedNet.sendReward(recipientId, {
        ...request,
        rewardId: saturatedRewardId,
        bossInstanceId: saturatedBossInstanceId,
        items: [{ ...item, instanceId: 'durable_saturated_item' }]
    }), false, 'three saturated persistent outboxes must surface degraded delivery');
    const saturatedRewardKey = saturatedNet._buildDurableRewardKey(saturatedRewardId);
    const saturatedQueueKey = `${recipientId}:${saturatedRewardKey}`;
    for (let attempt = 0; attempt < 40 && saturatedMemory.transactionAttempts.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const saturatedEntry = saturatedNet._pendingDurableRewardWrites.get(saturatedQueueKey);
    assert.ok(saturatedEntry, 'a full durable outbox must retain one bounded volatile retry entry');
    assert.equal(saturatedEntry.volatileOnly, true);
    assert.equal(saturatedNet._pendingDurableRewardWrites.size, 129);
    assert.deepEqual(saturatedReasons, ['durable_outbox_full']);
    assert.equal(saturatedMemory.transactionAttempts.length, 1);
    saturatedNet._clearDurableRewardRuntime({ clearConsumer: true });
    assert.equal(saturatedNet._pendingDurableRewardWrites.size, 0);
    saturatedMemory.failNextTransactions(1);
    assert.equal(
        saturatedNet._restoreDurableRewardOutbox(),
        1,
        'an in-page network lifecycle reset must preserve the volatile receipt without displacing persistent receipts'
    );
    for (let attempt = 0; attempt < 40 && saturatedMemory.transactionAttempts.length < 2; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const restoredSaturatedEntry = saturatedNet._pendingDurableRewardWrites.get(saturatedQueueKey);
    assert.ok(restoredSaturatedEntry);
    assert.equal(restoredSaturatedEntry.volatileOnly, true);
    clearTimeout(restoredSaturatedEntry.timer);
    restoredSaturatedEntry.timer = null;
    await saturatedNet._attemptDurableBossRewardWrite(restoredSaturatedEntry);
    const saturatedRewardPath = `durable_rewards_v1/${recipientId}/${saturatedRewardKey}`;
    assert.ok(saturatedMemory.records.has(saturatedRewardPath));
    assert.equal(saturatedNet._pendingDurableRewardWrites.has(saturatedQueueKey), false);
    saturatedNet._pendingDurableRewardWrites.clear();
    saturatedNet._pendingNormalRewardWrites.clear();
    saturatedNet._queuedRewardBatches.clear();

    const finalizeStorageRecords = new Map();
    let finalizeStorageWrites = 0;
    const finalizePreviousStorage = window.localStorage;
    const finalizePreviousFirebase = window.firebase;
    window.localStorage = {
        getItem: (key) => finalizeStorageRecords.get(key) ?? null,
        setItem: (key, value) => {
            finalizeStorageWrites += 1;
            if (finalizeStorageWrites === 2) throw new Error('simulated timestamp-finalize persistence failure');
            finalizeStorageRecords.set(key, String(value));
        },
        removeItem: (key) => finalizeStorageRecords.delete(key)
    };
    window.firebase = {};
    const finalizeMemory = createMemoryRewardDatabase();
    const finalizeNet = new NetworkManager();
    finalizeNet.playerId = 'durable_finalize_host';
    finalizeNet.connected = true;
    finalizeNet.isHost = true;
    finalizeNet.dbRef = finalizeMemory.dbRef;
    finalizeNet._getCurrentFieldId = () => fieldId;
    finalizeNet.getServerNow = () => authoredAt + 5000;
    finalizeNet._ensureDurableRewardServerTime = async () => true;
    finalizeNet._getDurableRewardRetryDelay = () => 100_000;
    const finalizeBossInstanceId = `${bossInstanceId}_finalize`;
    const finalizeRequest = {
        ...request,
        rewardId: `monster_reward:${fieldId}:${finalizeBossInstanceId}:${recipientId}:boss_items`,
        bossInstanceId: finalizeBossInstanceId,
        items: [{ ...item, instanceId: 'durable_finalize_item' }]
    };
    assert.equal(finalizeNet.sendReward(recipientId, finalizeRequest), true);
    for (let attempt = 0; attempt < 40 && finalizeStorageWrites < 2; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const finalizeEntry = Array.from(finalizeNet._pendingDurableRewardWrites.values())[0];
    assert.ok(finalizeEntry);
    assert.equal(finalizeEntry.timestampFinalized, false, 'a failed finalized envelope write must roll back in memory');
    assert.equal(finalizeMemory.transactionAttempts.length, 0, 'an unpersisted finalized envelope must never reach Firebase');
    await finalizeNet._attemptDurableBossRewardWrite(finalizeEntry);
    assert.equal(finalizeMemory.transactionAttempts.length, 1);
    finalizeNet._clearDurableRewardRuntime({ clearConsumer: true });
    window.firebase = finalizePreviousFirebase;
    window.localStorage = finalizePreviousStorage;

    const preemptionMemory = createMemoryRewardDatabase({
        [rewardPath]: {
            schemaVersion: 1,
            kind: 'boss_items',
            status: 'claimed',
            rewardId,
            recipientId,
            forged: true
        }
    });
    const preemptionNet = new NetworkManager();
    preemptionNet.playerId = authorHostId;
    preemptionNet.connected = true;
    preemptionNet.isHost = true;
    preemptionNet.dbRef = preemptionMemory.dbRef;
    preemptionNet._getCurrentFieldId = () => fieldId;
    preemptionNet.getServerNow = () => authoredAt;
    preemptionNet._getDurableRewardRetryDelay = () => 100_000;
    assert.equal(preemptionNet.sendReward(recipientId, request), true);
    for (let attempt = 0; attempt < 40 && preemptionMemory.transactionAttempts.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(preemptionNet._pendingDurableRewardWrites.size, 1, 'a mismatched receipt must not acknowledge the outbox');
    assert.equal(preemptionMemory.records.get(rewardPath).forged, true, 'a collision must never be overwritten in-place');
    preemptionMemory.records.delete(rewardPath);
    const retainedPreemptionEntry = Array.from(preemptionNet._pendingDurableRewardWrites.values())[0];
    clearTimeout(retainedPreemptionEntry.timer);
    retainedPreemptionEntry.timer = null;
    await preemptionNet._attemptDurableBossRewardWrite(retainedPreemptionEntry);
    assert.equal(preemptionNet._pendingDurableRewardWrites.size, 0);
    assert.equal(
        preemptionNet._doesDurableRewardReceiptMatchEnvelope(preemptionMemory.records.get(rewardPath), envelope),
        true,
        'the retained outbox must commit only after the malformed receipt is quarantined'
    );

    receiverNet.dbRef = memory.dbRef;
    const preReadySnapshot = await memory.dbRef.child(rewardPath).once('value');
    assert.equal(await receiverNet._handleIncomingRewardSnapshot(preReadySnapshot), false);
    assert.equal(memory.records.get(rewardPath).status, 'pending', 'a receipt must remain pending before the WorldScene consumer is ready');

    memory.operationLog.length = 0;
    let saveAttempt = 0;
    const savedProfiles = [];
    const profileNet = {
        isSharedFieldActive: () => false,
        sendPlayerHp: () => {},
        savePlayerData: async (_uid, profile) => {
            saveAttempt += 1;
            memory.operationLog.push(`profile:${saveAttempt}`);
            savedProfiles.push(JSON.parse(JSON.stringify(profile)));
            return saveAttempt === 1
                ? { ok: false, reason: 'temporary_profile_failure' }
                : { ok: true, profile };
        },
        savePlayerDataPatch: async () => ({ ok: true })
    };
    const player = new Player(100, 100, 'Durable Receiver', null);
    player.id = recipientId;
    player.net = profileNet;
    const durableConsumerItemData = new ItemDataManager(null);
    window.game = {
        itemData: durableConsumerItemData,
        net: profileNet,
        localPlayer: player,
        zone: { currentZone: { id: 'zone_4' } },
        ui: {
            updateInventory: () => {},
            updateQuestUI: () => {},
            logSystemMessage: () => {},
            updateHudAttentionIndicators: () => {}
        },
        sound: { playSfx: () => {} }
    };
    receiverNet._getDurableRewardRetryDelay = () => 100_000;
    await receiverNet.setDurableRewardConsumer((reward) => player.receiveRewardDurably(reward));
    assert.equal(saveAttempt, 1);
    assert.equal(memory.records.get(rewardPath).status, 'pending', 'profile failure must leave the receipt unacknowledged');
    assert.equal(player.inventory.filter((entry) => entry?.instanceId === item.instanceId).length, 1);
    assert.deepEqual(player.claimedRewardIds, [rewardId]);
    assert.equal(memory.operationLog.some((entry) => entry.startsWith('transaction:')), false, 'ack must not run before profile persistence succeeds');

    await receiverNet._drainDurableBossRewards();
    assert.equal(saveAttempt, 2);
    assert.equal(memory.records.get(rewardPath).status, 'claimed', 'profile success must compact the receipt into a claimed tombstone');
    assert.equal(player.inventory.filter((entry) => entry?.instanceId === item.instanceId).length, 1, 'a save retry must not duplicate the boss weapon');
    assert.ok(memory.operationLog.indexOf('profile:2') < memory.operationLog.indexOf(`transaction:${rewardPath}`));

    const receivedDurableWeapon = player.inventory.find((entry) => entry?.instanceId === item.instanceId);
    assert.ok(receivedDurableWeapon);
    receivedDurableWeapon.enhancementLevel = 7;
    assert.equal((await player.saveState(true)).ok, true);
    const durableSavedProfile = savedProfiles.at(-1);
    assert.equal(
        durableSavedProfile.inventory.find((entry) => entry?.instanceId === item.instanceId)?.durableEntitlementVersion,
        1,
        'the full saved profile must retain the immutable entitlement identity'
    );

    const catalogRemovedItemData = new ItemDataManager(null);
    const reloadedPlayer = new Player(100, 100, 'Durable Reload Receiver', null);
    reloadedPlayer.id = recipientId;
    window.game = {
        itemData: catalogRemovedItemData,
        net: profileNet,
        localPlayer: reloadedPlayer,
        zone: { currentZone: { id: 'zone_4' } },
        ui: {
            updateInventory: () => {},
            updateQuestUI: () => {},
            logSystemMessage: () => {},
            updateHudAttentionIndicators: () => {}
        },
        sound: { playSfx: () => {} }
    };
    reloadedPlayer.normalizeInventoryState(
        JSON.parse(JSON.stringify(durableSavedProfile.inventory)),
        JSON.parse(JSON.stringify(durableSavedProfile.equipment))
    );
    const reloadedWeaponIndex = reloadedPlayer.inventory.findIndex((entry) => entry?.instanceId === item.instanceId);
    assert.ok(reloadedWeaponIndex > 0, 'the durable weapon must survive a complete JSON profile reload');
    reloadedPlayer.equipment.weapon = reloadedPlayer.inventory[reloadedWeaponIndex];
    reloadedPlayer.inventory[reloadedWeaponIndex] = null;

    const reloadedCombat = reloadedPlayer.getWeaponCombatProfile();
    assert.equal(reloadedCombat.prefixId, 'tidal_blue_flame');
    assert.ok(Math.abs(reloadedCombat.fireballChainChanceBase - 0.31) < 1e-9);
    assert.ok(Math.abs(reloadedCombat.fireballChainChanceEnhancementBonus - 0.07) < 1e-9);
    assert.ok(Math.abs(reloadedCombat.fireballChainChance - 0.38) < 1e-9);
    assert.ok(Math.abs(reloadedCombat.fireballChainDamageRatio - 0.64) < 1e-9);
    assert.equal(reloadedCombat.fireballVariant, 'blue_fireball');
    assert.equal(reloadedCombat.fireballTint, '#58ddff');
    assert.equal(reloadedCombat.auraState?.prefixId, 'tidal_blue_flame');
    assert.equal(reloadedCombat.auraState?.level, 7);

    const archivedEnhancementConfig = catalogRemovedItemData.getEnhancementConfig(reloadedPlayer.equipment.weapon);
    assert.equal(archivedEnhancementConfig?.nextLevel, 8);
    assert.equal(archivedEnhancementConfig?.successRate, 0.25);
    assert.equal(archivedEnhancementConfig?.destroyChanceOnFail, 0.5);
    const archivedEnhancementRule = catalogRemovedItemData.getEffectiveEnhancementRuleSet(
        reloadedPlayer.equipment.weapon
    );
    assert.equal(archivedEnhancementRule?.name, '무기 기본 강화 규칙');
    assert.deepEqual(archivedEnhancementRule?.perLevelStatGain, { attackPower: 1, critRate: 0.01 });

    reloadedPlayer.attackPower = 10;
    reloadedPlayer.critRate = 0.1;
    reloadedPlayer.mpRegen = 1;
    reloadedPlayer.attackSpeed = 1;
    reloadedPlayer.maxAttackSpeed = 10;
    reloadedPlayer.applyEquipmentStats();
    assert.equal(reloadedPlayer.attackPower, 25, 'archived base and +7 enhancement attack stats must apply after reload');
    assert.ok(Math.abs(reloadedPlayer.critRate - 0.23) < 1e-9);
    assert.equal(reloadedPlayer.mpRegen, 5);

    const archivedAstralWeapon = receiverNet._materializeDurableBossItemFromArchive(
        { catalogVersion: 1, bossTypeId: 'astral_sylveon' },
        {
            itemId: 'astral_staff',
            instanceId: 'archived_astral_combat_hook',
            prefixId: 'astral_crimson_flash',
            rolledValues: { laserDamageBonus: 0.6, attackSpeedBonus: 0.24 }
        }
    );
    archivedAstralWeapon.enhancementLevel = 7;
    reloadedPlayer.equipment.weapon = catalogRemovedItemData.normalizeInventoryItem(
        JSON.parse(JSON.stringify(archivedAstralWeapon))
    );
    const archivedAstralCombat = reloadedPlayer.getWeaponCombatProfile();
    assert.equal(archivedAstralCombat.laserVariant, 'crimson_chain');
    assert.equal(archivedAstralCombat.restoreHpPerLaserHit, 3);
    assert.ok(Math.abs(archivedAstralCombat.laserDamageBonusEnhancementBonus - 0.07) < 1e-9);
    assert.ok(Math.abs(archivedAstralCombat.attackSpeedBonus - 0.31) < 1e-9);
    assert.equal(archivedAstralCombat.auraState?.prefixId, 'astral_crimson_flash');

    window.game.itemData = itemData;
    window.game.localPlayer = player;

    const durableFifoRecipientId = 'durable_fifo_129_guest';
    const durableFifoAuthor = new NetworkManager();
    durableFifoAuthor.playerId = 'durable_fifo_129_host';
    durableFifoAuthor.getServerNow = () => authoredAt;
    const durableFifoRecords = {};
    const durableFifoReceipts = [];
    for (let index = 0; index < 129; index += 1) {
        const fifoBossInstanceId = `durable_fifo_boss_${String(index).padStart(3, '0')}`;
        const fifoRewardId = `monster_reward:${fieldId}:${fifoBossInstanceId}:${durableFifoRecipientId}:boss_items`;
        const fifoEnvelope = durableFifoAuthor._createDurableBossRewardEnvelope(
            durableFifoRecipientId,
            {
                ...request,
                rewardId: fifoRewardId,
                bossInstanceId: fifoBossInstanceId,
                items: [{ ...item, instanceId: `durable_fifo_item_${String(index).padStart(3, '0')}` }]
            },
            { fieldId }
        );
        const fifoRewardKey = durableFifoAuthor._buildDurableRewardKey(fifoRewardId);
        const fifoRewardPath = `durable_rewards_v1/${durableFifoRecipientId}/${fifoRewardKey}`;
        durableFifoRecords[fifoRewardPath] = fifoEnvelope;
        durableFifoReceipts.push({ rewardId: fifoRewardId, path: fifoRewardPath });
    }
    const durableFifoMemory = createMemoryRewardDatabase(durableFifoRecords);
    durableFifoMemory.failNextTransactions(1);
    const durableFifoNet = new NetworkManager();
    durableFifoNet.playerId = durableFifoRecipientId;
    durableFifoNet.dbRef = durableFifoMemory.dbRef;
    durableFifoNet.getServerNow = () => authoredAt + 20_000;
    durableFifoNet._getDurableRewardRetryDelay = () => 100_000;
    let durableFifoApplications = 0;
    let durableFifoConsumerCalls = 0;
    let durableFifoActiveConsumers = 0;
    let durableFifoMaxConcurrentConsumers = 0;
    let durableFifoClaimedIds = [];
    await durableFifoNet.setDurableRewardConsumer(async (reward) => {
        durableFifoConsumerCalls += 1;
        durableFifoActiveConsumers += 1;
        durableFifoMaxConcurrentConsumers = Math.max(
            durableFifoMaxConcurrentConsumers,
            durableFifoActiveConsumers
        );
        await Promise.resolve();
        if (!durableFifoClaimedIds.includes(reward.rewardId)) {
            durableFifoApplications += 1;
            durableFifoClaimedIds = [
                ...durableFifoClaimedIds.filter((id) => id !== reward.rewardId),
                reward.rewardId
            ].slice(-128);
        }
        durableFifoActiveConsumers -= 1;
        return { ok: true };
    });
    assert.equal(
        durableFifoApplications,
        1,
        'a failed durable FIFO-front acknowledgement must block all 128 later boss rewards'
    );
    assert.equal(durableFifoConsumerCalls, 1);
    assert.equal(durableFifoMemory.transactionAttempts.length, 1);
    assert.equal(
        Array.from(durableFifoMemory.records.values()).filter((entry) => entry?.status === 'pending').length,
        129,
        'no later durable receipt may overtake the failed FIFO front'
    );
    await durableFifoNet._drainDurableBossRewards();
    assert.equal(durableFifoApplications, 129, 'the durable FIFO must apply every semantic reward exactly once');
    assert.equal(durableFifoConsumerCalls, 130, 'the failed front receipt retries before the remaining 128 receipts');
    assert.equal(durableFifoMaxConcurrentConsumers, 1, 'durable reward consumers must remain globally serial');
    assert.equal(
        Array.from(durableFifoMemory.records.values()).filter((entry) => entry?.status === 'pending').length,
        0
    );
    assert.equal(
        durableFifoClaimedIds.includes(durableFifoReceipts[0].rewardId),
        false,
        'the bounded semantic journal must exercise first-id eviction only after its shared claim commits'
    );
    await durableFifoNet._drainDurableBossRewards();
    assert.equal(durableFifoApplications, 129, 'claimed durable tombstones must suppress reconnect replay after journal eviction');
    durableFifoNet._clearDurableRewardRuntime({ clearConsumer: true });

    const makeCrossChannelConsumerState = () => {
        const state = {
            applications: 0,
            calls: 0,
            claimedRewardIds: []
        };
        state.consume = async (reward) => {
            state.calls += 1;
            if (!state.claimedRewardIds.includes(reward.rewardId)) {
                state.applications += 1;
                state.claimedRewardIds = [
                    ...state.claimedRewardIds.filter((id) => id !== reward.rewardId),
                    reward.rewardId
                ].slice(-128);
            }
            if (window.game?.localPlayer) {
                window.game.localPlayer.claimedRewardIds = state.claimedRewardIds;
            }
            return { ok: true };
        };
        return state;
    };

    const durableThenNormalRecipient = 'cross_durable_then_normal_guest';
    const durableThenNormalBossId = 'cross_durable_then_normal_boss';
    const durableThenNormalRewardId = `monster_reward:${fieldId}:${durableThenNormalBossId}:${durableThenNormalRecipient}:boss_items`;
    const durableThenNormalEnvelope = durableFifoAuthor._createDurableBossRewardEnvelope(
        durableThenNormalRecipient,
        {
            ...request,
            rewardId: durableThenNormalRewardId,
            bossInstanceId: durableThenNormalBossId,
            items: [{ ...item, instanceId: 'cross_durable_then_normal_item' }]
        },
        { fieldId }
    );
    const durableThenNormalKey = durableFifoAuthor._buildDurableRewardKey(durableThenNormalRewardId);
    const durableThenNormalPath = `durable_rewards_v1/${durableThenNormalRecipient}/${durableThenNormalKey}`;
    const durableThenNormalMemory = createMemoryRewardDatabase({
        [durableThenNormalPath]: durableThenNormalEnvelope
    });
    durableThenNormalMemory.failNextTransactions(1);
    const durableThenNormalNet = new NetworkManager();
    durableThenNormalNet.playerId = durableThenNormalRecipient;
    durableThenNormalNet.dbRef = durableThenNormalMemory.dbRef;
    durableThenNormalNet.getServerNow = () => authoredAt + 20_000;
    durableThenNormalNet._getDurableRewardRetryDelay = () => 100_000;
    const durableThenNormalState = makeCrossChannelConsumerState();
    window.game = {
        itemData,
        localPlayer: { id: durableThenNormalRecipient, claimedRewardIds: [] }
    };
    await durableThenNormalNet.setNormalRewardConsumer(durableThenNormalState.consume);
    await durableThenNormalNet.setDurableRewardConsumer(durableThenNormalState.consume);
    assert.equal(durableThenNormalState.applications, 1);
    assert.equal(durableThenNormalMemory.records.get(durableThenNormalPath).status, 'pending');

    const crossNormalAuthor = new NetworkManager();
    crossNormalAuthor.playerId = 'cross_normal_author';
    crossNormalAuthor.getServerNow = () => authoredAt;
    for (let index = 0; index < 128; index += 1) {
        const receiptKey = `cross_normal_after_durable_${String(index).padStart(3, '0')}`;
        const normalEnvelope = crossNormalAuthor._createNormalRewardEnvelope(
            durableThenNormalRecipient,
            {
                rewardId: `cross_normal_after_durable_reward_${index}`,
                manastone: 1,
                immediate: true
            },
            receiptKey,
            { fieldId }
        );
        durableThenNormalMemory.records.set(
            `rewards/${durableThenNormalRecipient}/${receiptKey}`,
            normalEnvelope
        );
    }
    await durableThenNormalNet._drainNormalRewards();
    assert.equal(
        durableThenNormalState.applications,
        129,
        'normal receipts must not evict and reapply an unacknowledged durable semantic id'
    );
    assert.equal(durableThenNormalMemory.records.get(durableThenNormalPath).status, 'claimed');
    assert.equal(durableThenNormalState.claimedRewardIds.includes(durableThenNormalRewardId), false);
    await durableThenNormalNet._drainDurableBossRewards();
    assert.equal(durableThenNormalState.applications, 129);
    durableThenNormalNet._clearNormalRewardRuntime({ clearConsumer: true });
    durableThenNormalNet._clearDurableRewardRuntime({ clearConsumer: true });

    const reloadPriorityRecords = {
        [durableThenNormalPath]: durableThenNormalEnvelope
    };
    for (let index = 0; index < 128; index += 1) {
        const receiptKey = `reload_normal_after_applied_durable_${String(index).padStart(3, '0')}`;
        reloadPriorityRecords[`rewards/${durableThenNormalRecipient}/${receiptKey}`] =
            crossNormalAuthor._createNormalRewardEnvelope(
                durableThenNormalRecipient,
                {
                    rewardId: `reload_normal_after_applied_durable_reward_${index}`,
                    manastone: 1,
                    immediate: true
                },
                receiptKey,
                { fieldId }
            );
    }
    const reloadPriorityMemory = createMemoryRewardDatabase(reloadPriorityRecords);
    const reloadPriorityNet = new NetworkManager();
    reloadPriorityNet.playerId = durableThenNormalRecipient;
    reloadPriorityNet.dbRef = reloadPriorityMemory.dbRef;
    reloadPriorityNet.getServerNow = () => authoredAt + 20_000;
    reloadPriorityNet._getDurableRewardRetryDelay = () => 100_000;
    const reloadPriorityState = makeCrossChannelConsumerState();
    reloadPriorityState.claimedRewardIds = [durableThenNormalRewardId];
    window.game = {
        itemData,
        localPlayer: {
            id: durableThenNormalRecipient,
            claimedRewardIds: reloadPriorityState.claimedRewardIds
        }
    };
    await reloadPriorityNet.setNormalRewardConsumer(reloadPriorityState.consume);
    await reloadPriorityNet.setDurableRewardConsumer(reloadPriorityState.consume);
    assert.equal(
        reloadPriorityState.applications,
        128,
        'reload must acknowledge an already-applied pending head before 128 later rewards can evict its id'
    );
    assert.equal(reloadPriorityMemory.records.get(durableThenNormalPath).status, 'claimed');
    assert.ok(
        reloadPriorityMemory.operationLog.indexOf(`transaction:${durableThenNormalPath}`)
            < reloadPriorityMemory.operationLog.indexOf('update:root'),
        'the applied-but-unacknowledged head must win global reload ordering'
    );
    reloadPriorityNet._clearNormalRewardRuntime({ clearConsumer: true });
    reloadPriorityNet._clearDurableRewardRuntime({ clearConsumer: true });

    const normalThenDurableRecipient = 'cross_normal_then_durable_guest';
    const normalThenDurableReceiptKey = 'cross_normal_fifo_head';
    const normalThenDurableRewardId = 'cross_normal_fifo_head_reward';
    const normalThenDurableEnvelope = crossNormalAuthor._createNormalRewardEnvelope(
        normalThenDurableRecipient,
        { rewardId: normalThenDurableRewardId, manastone: 1, immediate: true },
        normalThenDurableReceiptKey,
        { fieldId }
    );
    const normalThenDurablePath = `rewards/${normalThenDurableRecipient}/${normalThenDurableReceiptKey}`;
    const normalThenDurableMemory = createMemoryRewardDatabase({
        [normalThenDurablePath]: normalThenDurableEnvelope
    });
    normalThenDurableMemory.failNextUpdates(1);
    const normalThenDurableNet = new NetworkManager();
    normalThenDurableNet.playerId = normalThenDurableRecipient;
    normalThenDurableNet.dbRef = normalThenDurableMemory.dbRef;
    normalThenDurableNet.getServerNow = () => authoredAt + 20_000;
    normalThenDurableNet._getDurableRewardRetryDelay = () => 100_000;
    const normalThenDurableState = makeCrossChannelConsumerState();
    window.game = {
        itemData,
        localPlayer: { id: normalThenDurableRecipient, claimedRewardIds: [] }
    };
    await normalThenDurableNet.setDurableRewardConsumer(normalThenDurableState.consume);
    await normalThenDurableNet.setNormalRewardConsumer(normalThenDurableState.consume);
    assert.equal(normalThenDurableState.applications, 1);
    assert.equal(normalThenDurableMemory.records.has(normalThenDurablePath), true);

    for (let index = 0; index < 128; index += 1) {
        const crossBossId = `cross_durable_after_normal_${String(index).padStart(3, '0')}`;
        const crossRewardId = `monster_reward:${fieldId}:${crossBossId}:${normalThenDurableRecipient}:boss_items`;
        const crossEnvelope = durableFifoAuthor._createDurableBossRewardEnvelope(
            normalThenDurableRecipient,
            {
                ...request,
                rewardId: crossRewardId,
                bossInstanceId: crossBossId,
                items: [{ ...item, instanceId: `cross_durable_after_normal_item_${index}` }]
            },
            { fieldId }
        );
        const crossKey = durableFifoAuthor._buildDurableRewardKey(crossRewardId);
        normalThenDurableMemory.records.set(
            `durable_rewards_v1/${normalThenDurableRecipient}/${crossKey}`,
            crossEnvelope
        );
    }
    await normalThenDurableNet._drainDurableBossRewards();
    assert.equal(
        normalThenDurableState.applications,
        129,
        'durable receipts must not evict and reapply an unacknowledged normal semantic id'
    );
    assert.equal(normalThenDurableMemory.records.has(normalThenDurablePath), false);
    assert.equal(normalThenDurableState.claimedRewardIds.includes(normalThenDurableRewardId), false);
    await normalThenDurableNet._drainNormalRewards();
    assert.equal(normalThenDurableState.applications, 129);
    normalThenDurableNet._clearNormalRewardRuntime({ clearConsumer: true });
    normalThenDurableNet._clearDurableRewardRuntime({ clearConsumer: true });

    window.game = {
        itemData,
        net: profileNet,
        localPlayer: player,
        zone: { currentZone: { id: 'zone_4' } },
        ui: {
            updateInventory: () => {},
            updateQuestUI: () => {},
            logSystemMessage: () => {},
            updateHudAttentionIndicators: () => {}
        },
        sound: { playSfx: () => {} }
    };

    const claimedBeforeSplitBrain = JSON.stringify(memory.records.get(rewardPath));
    const splitBrainNet = new NetworkManager();
    splitBrainNet.playerId = 'replacement_host';
    splitBrainNet.connected = true;
    splitBrainNet.isHost = true;
    splitBrainNet.dbRef = memory.dbRef;
    splitBrainNet._getCurrentFieldId = () => fieldId;
    splitBrainNet.getServerNow = () => authoredAt + 20_000;
    splitBrainNet._getDurableRewardRetryDelay = () => 100_000;
    const splitBrainAttemptStart = memory.transactionAttempts.length;
    assert.equal(splitBrainNet.sendReward(recipientId, {
        ...request,
        items: [{ ...item, instanceId: 'split_brain_different_seed' }]
    }), true);
    for (let attempt = 0; attempt < 40 && memory.transactionAttempts.length === splitBrainAttemptStart; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(JSON.stringify(memory.records.get(rewardPath)), claimedBeforeSplitBrain);
    assert.equal(splitBrainNet._pendingDurableRewardWrites.size, 0, 'a valid first-writer receipt must terminally supersede the later split-brain outbox');
    splitBrainNet._clearDurableRewardRuntime({ clearConsumer: true });

    let reconnectApplications = 0;
    const reconnectNet = new NetworkManager();
    reconnectNet.playerId = recipientId;
    reconnectNet.dbRef = memory.dbRef;
    reconnectNet.getServerNow = () => authoredAt + 20_000;
    await reconnectNet.setDurableRewardConsumer(async () => {
        reconnectApplications += 1;
        return { ok: true };
    });
    assert.equal(reconnectApplications, 0, 'a claimed tombstone must never reapply the item after reconnect');
    reconnectNet._clearDurableRewardRuntime({ clearConsumer: true });

    const clockGuardMemory = createMemoryRewardDatabase({ [rewardPath]: envelope });
    const clockGuardNet = new NetworkManager();
    clockGuardNet.playerId = recipientId;
    clockGuardNet.dbRef = clockGuardMemory.dbRef;
    clockGuardNet._durableRewardConsumer = async () => ({ ok: true });
    clockGuardNet._ensureDurableRewardServerTime = async () => false;
    clockGuardNet.getServerNow = () => authoredAt - 60 * 60 * 1000;
    const clockGuardSnapshot = await clockGuardMemory.dbRef.child(rewardPath).once('value');
    assert.equal(await clockGuardNet._handleIncomingRewardSnapshot(clockGuardSnapshot), false);
    assert.equal(
        clockGuardMemory.records.get(rewardPath).status,
        'pending',
        'a receipt must never be terminally removed before Firebase server time is ready'
    );

    const staleLifecycleMemory = createMemoryRewardDatabase({ [rewardPath]: envelope });
    const staleLifecycleNet = new NetworkManager();
    staleLifecycleNet.playerId = recipientId;
    staleLifecycleNet.dbRef = staleLifecycleMemory.dbRef;
    staleLifecycleNet._durableRewardConsumer = async () => ({ ok: true });
    const staleContext = {
        generation: staleLifecycleNet._networkLifecycleGeneration,
        playerId: recipientId,
        dbRef: staleLifecycleNet.dbRef
    };
    const staleSnapshot = await staleLifecycleMemory.dbRef.child(rewardPath).once('value');
    staleLifecycleNet._networkLifecycleGeneration += 1;
    staleLifecycleNet.playerId = 'replacement_account';
    staleLifecycleNet.dbRef = createMemoryRewardDatabase().dbRef;
    assert.equal(await staleLifecycleNet._handleIncomingRewardSnapshot(staleSnapshot, staleContext), false);
    assert.equal(
        staleLifecycleMemory.records.get(rewardPath).status,
        'pending',
        'an account-switch callback must not delete the previous account receipt'
    );

    const abaMemory = createMemoryRewardDatabase({ [rewardPath]: envelope });
    const abaNet = new NetworkManager();
    abaNet.playerId = recipientId;
    abaNet.dbRef = abaMemory.dbRef;
    abaNet.getServerNow = () => authoredAt + 15_000;
    abaNet._getDurableRewardRetryDelay = () => 100_000;
    abaNet._durableRewardConsumer = async () => ({ ok: false });
    let releaseOldTimeGate;
    let releaseNewTimeGate;
    let timeGateCall = 0;
    abaNet._ensureDurableRewardServerTime = () => new Promise((resolve) => {
        timeGateCall += 1;
        if (timeGateCall === 1) releaseOldTimeGate = resolve;
        else releaseNewTimeGate = resolve;
    });
    abaNet._networkLifecycleGeneration = 1;
    const abaSnapshot = await abaMemory.dbRef.child(rewardPath).once('value');
    const oldContext = {
        generation: 1,
        playerId: recipientId,
        dbRef: abaNet.dbRef,
        consumer: abaNet._durableRewardConsumer,
        consumerGeneration: abaNet._durableRewardConsumerGeneration
    };
    const oldConsume = abaNet._consumeDurableBossRewardSnapshot(abaSnapshot, oldContext);
    await Promise.resolve();
    abaNet._networkLifecycleGeneration = 2;
    abaNet._durableRewardInFlight.clear();
    const newContext = { ...oldContext, generation: 2 };
    const newConsume = abaNet._consumeDurableBossRewardSnapshot(abaSnapshot, newContext);
    await Promise.resolve();
    releaseOldTimeGate(true);
    await oldConsume;
    assert.equal(
        abaNet._durableRewardInFlight.has(rewardKey),
        true,
        'an old callback finally block must not clear a newer in-flight receipt token'
    );
    releaseNewTimeGate(true);
    await newConsume;
    abaNet._clearDurableRewardRuntime({ clearConsumer: true });

    const durableRebindMemory = createMemoryRewardDatabase({ [rewardPath]: envelope });
    const durableRebindNet = new NetworkManager();
    durableRebindNet.playerId = recipientId;
    durableRebindNet.dbRef = durableRebindMemory.dbRef;
    durableRebindNet.getServerNow = () => authoredAt + 20_000;
    durableRebindNet._getDurableRewardRetryDelay = () => 100_000;
    let releaseOldDurableConsumer;
    let markOldDurableConsumerStarted;
    const oldDurableConsumerStarted = new Promise((resolve) => { markOldDurableConsumerStarted = resolve; });
    const oldDurableConsumer = () => new Promise((resolve) => {
        markOldDurableConsumerStarted();
        releaseOldDurableConsumer = resolve;
    });
    durableRebindNet._durableRewardConsumer = oldDurableConsumer;
    const durableRebindSnapshot = await durableRebindMemory.dbRef.child(rewardPath).once('value');
    const durableRebindContext = {
        generation: durableRebindNet._networkLifecycleGeneration,
        playerId: recipientId,
        dbRef: durableRebindNet.dbRef,
        consumer: oldDurableConsumer,
        consumerGeneration: durableRebindNet._durableRewardConsumerGeneration
    };
    const oldDurableConsume = durableRebindNet._consumeDurableBossRewardSnapshot(
        durableRebindSnapshot,
        durableRebindContext
    );
    await oldDurableConsumerStarted;
    await durableRebindNet.setDurableRewardConsumer(async () => ({ ok: true }));
    assert.ok(
        durableRebindNet._durableRewardDrainTimer,
        'durable boss consumer rebind must retry a receipt already in flight'
    );
    releaseOldDurableConsumer({ ok: true });
    await oldDurableConsume;
    assert.equal(durableRebindMemory.records.get(rewardPath).status, 'pending');
    durableRebindNet._clearDurableRewardRuntime({ clearConsumer: true });

    const previousLocalStorage = window.localStorage;
    const outboxStorageRecords = new Map();
    window.localStorage = {
        getItem: (key) => outboxStorageRecords.get(key) ?? null,
        setItem: (key, value) => outboxStorageRecords.set(key, String(value)),
        removeItem: (key) => outboxStorageRecords.delete(key)
    };
    const outboxBossInstanceId = 'ruin_boss_instance_outbox_reconnect';
    const outboxRewardId = `monster_reward:${fieldId}:${outboxBossInstanceId}:${recipientId}:boss_items`;
    const outboxRequest = {
        ...request,
        rewardId: outboxRewardId,
        bossInstanceId: outboxBossInstanceId,
        items: [{ ...item, instanceId: 'durable_tidal_staff_outbox_reconnect' }]
    };
    const outboxRewardKey = authorNet._buildDurableRewardKey(outboxRewardId);
    const outboxRewardPath = `durable_rewards_v1/${recipientId}/${outboxRewardKey}`;
    const outboxMemory = createMemoryRewardDatabase();
    outboxMemory.failNextTransactions(1);
    const disconnectedAuthor = new NetworkManager();
    disconnectedAuthor.playerId = authorHostId;
    disconnectedAuthor.connected = true;
    disconnectedAuthor.isHost = true;
    disconnectedAuthor.dbRef = outboxMemory.dbRef;
    disconnectedAuthor._getCurrentFieldId = () => fieldId;
    disconnectedAuthor.getServerNow = () => authoredAt;
    disconnectedAuthor._getDurableRewardRetryDelay = () => 100_000;
    assert.equal(disconnectedAuthor.sendReward(recipientId, outboxRequest), true);
    for (let attempt = 0; attempt < 40 && outboxMemory.transactionAttempts.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(outboxMemory.records.has(outboxRewardPath), false);
    disconnectedAuthor._networkLifecycleGeneration += 1;
    disconnectedAuthor._clearDurableRewardRuntime({ clearConsumer: true });
    assert.ok(outboxStorageRecords.size > 0, 'a failed sender receipt must survive disconnect in local storage');

    const wrongAuthor = new NetworkManager();
    wrongAuthor.playerId = 'different_author';
    wrongAuthor.dbRef = outboxMemory.dbRef;
    assert.equal(wrongAuthor._restoreDurableRewardOutbox(), 0);
    assert.equal(outboxMemory.records.has(outboxRewardPath), false, 'another uid must never resume the outbox');

    const resumedAuthor = new NetworkManager();
    resumedAuthor.playerId = authorHostId;
    resumedAuthor.dbRef = outboxMemory.dbRef;
    resumedAuthor.getServerNow = () => authoredAt;
    resumedAuthor._restoreDurableRewardOutbox();
    for (let attempt = 0; attempt < 40 && resumedAuthor._pendingDurableRewardWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(
        resumedAuthor._doesDurableRewardReceiptMatchEnvelope(
            outboxMemory.records.get(outboxRewardPath),
            resumedAuthor._createDurableBossRewardEnvelope(recipientId, outboxRequest, { fieldId })
        ),
        true,
        'the same author must resume an immutable receipt after reconnect'
    );
    assert.equal(outboxStorageRecords.size, 0, 'a committed receipt must clean up the local outbox');
    window.localStorage = previousLocalStorage;

    const fullBossInstanceId = 'ruin_boss_instance_full_inventory';
    const fullRewardId = `monster_reward:${fieldId}:${fullBossInstanceId}:${recipientId}:boss_items`;
    const fullRequest = {
        ...request,
        rewardId: fullRewardId,
        bossInstanceId: fullBossInstanceId,
        items: [{
            ...item,
            instanceId: 'durable_tidal_staff_full_inventory'
        }]
    };
    const fullEnvelope = authorNet._createDurableBossRewardEnvelope(recipientId, fullRequest, { fieldId });
    const fullRewardKey = authorNet._buildDurableRewardKey(fullRewardId);
    const fullRewardPath = `durable_rewards_v1/${recipientId}/${fullRewardKey}`;
    const fullMemory = createMemoryRewardDatabase({ [fullRewardPath]: fullEnvelope });
    const fullSavedProfiles = [];
    const fullProfileNet = {
        isSharedFieldActive: () => false,
        sendPlayerHp: () => {},
        savePlayerData: async (_uid, profile) => {
            fullSavedProfiles.push(JSON.parse(JSON.stringify(profile)));
            return { ok: true, profile };
        },
        savePlayerDataPatch: async () => ({ ok: true })
    };
    const fullPlayer = new Player(100, 100, 'Full Inventory Receiver', null);
    fullPlayer.id = recipientId;
    fullPlayer.net = fullProfileNet;
    for (let index = 1; index < fullPlayer.inventory.length; index += 1) {
        fullPlayer.inventory[index] = {
            id: `occupied_${index}`,
            type: `occupied_${index}`,
            amount: 1,
            stackable: false,
            slot: 'weapon',
            instanceId: `occupied_instance_${index}`
        };
    }
    window.game = {
        itemData,
        net: fullProfileNet,
        localPlayer: fullPlayer,
        zone: { currentZone: { id: 'zone_4' } },
        ui: {
            updateInventory: () => {},
            updateQuestUI: () => {},
            logSystemMessage: () => {},
            updateHudAttentionIndicators: () => {}
        },
        sound: { playSfx: () => {} }
    };
    const fullReceiverNet = new NetworkManager();
    fullReceiverNet.playerId = recipientId;
    fullReceiverNet.dbRef = fullMemory.dbRef;
    fullReceiverNet.getServerNow = () => authoredAt + 25_000;
    await fullReceiverNet.setDurableRewardConsumer((reward) => fullPlayer.receiveRewardDurably(reward));
    assert.equal(fullPlayer.pendingItemRewards.length, 1, 'a full inventory must queue the boss weapon in pending rewards');
    assert.equal(fullSavedProfiles.at(-1).pendingItemRewards.length, 1, 'pending boss items must persist before receipt acknowledgement');
    assert.ok(fullSavedProfiles.at(-1).claimedRewardIds.includes(fullRewardId));
    assert.equal(fullMemory.records.get(fullRewardPath).status, 'claimed');

    const progressBossInstanceId = 'ruin_boss_progress_reconnect';
    const progressRewardId = `monster_reward:${fieldId}:${progressBossInstanceId}:${recipientId}:boss_exp`;
    const progressRequest = {
        kind: 'boss_progress',
        rewardKind: 'boss_exp',
        rewardId: progressRewardId,
        bossReward: true,
        immediate: true,
        bossTypeId: 'ruin_wobbuffet',
        bossInstanceId: progressBossInstanceId,
        monsterName: 'Ruin Boss',
        exp: 180,
        rewardMeta: {
            monsterLevel: 9,
            playerLevel: 40,
            overlevelMultiplier: 0.1,
            partyMultiplier: 1
        }
    };
    const progressKey = authorNet._buildDurableRewardKey(progressRewardId);
    const progressPath = `durable_rewards_v1/${recipientId}/${progressKey}`;
    const progressMemory = createMemoryRewardDatabase();
    progressMemory.failNextTransactions(1);
    const progressStorageRecords = new Map();
    const progressPreviousStorage = window.localStorage;
    window.localStorage = {
        getItem: (key) => progressStorageRecords.get(key) ?? null,
        setItem: (key, value) => progressStorageRecords.set(key, String(value)),
        removeItem: (key) => progressStorageRecords.delete(key)
    };
    const progressAuthor = new NetworkManager();
    progressAuthor.playerId = authorHostId;
    progressAuthor.connected = true;
    progressAuthor.isHost = true;
    progressAuthor.dbRef = progressMemory.dbRef;
    progressAuthor._getCurrentFieldId = () => fieldId;
    progressAuthor.getServerNow = () => authoredAt;
    progressAuthor._getDurableRewardRetryDelay = () => 100_000;
    const progressEnvelope = progressAuthor._createDurableBossRewardEnvelope(
        recipientId,
        progressRequest,
        { fieldId }
    );
    assert.ok(progressEnvelope, 'released boss EXP must match the immutable level/base EXP formula');
    assert.equal(
        progressAuthor._validateDurableBossRewardEnvelope(
            { ...progressEnvelope, exp: 10_000_000 },
            progressAuthor._buildDurableRewardKey(progressRewardId),
            authoredAt + 1,
            recipientId
        ).reason,
        'invalid_progress_meta',
        'coordinated metadata must not authorize forged boss EXP'
    );
    assert.equal(
        progressAuthor._createDurableBossRewardEnvelope(recipientId, {
            ...progressRequest,
            rewardMeta: { ...progressRequest.rewardMeta, monsterLevel: 10 }
        }, { fieldId }),
        null,
        'a boss progress receipt must use the released boss level'
    );
    assert.equal(progressAuthor.sendReward(recipientId, progressRequest), true);
    for (let attempt = 0; attempt < 40 && progressMemory.transactionAttempts.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    progressAuthor._networkLifecycleGeneration += 1;
    progressAuthor._clearDurableRewardRuntime({ clearConsumer: true });
    assert.equal(progressMemory.records.has(progressPath), false);
    assert.ok(progressStorageRecords.size > 0, 'boss EXP must persist in the sender outbox after a failed write');

    const progressResumedAuthor = new NetworkManager();
    progressResumedAuthor.playerId = authorHostId;
    progressResumedAuthor.dbRef = progressMemory.dbRef;
    progressResumedAuthor.getServerNow = () => authoredAt;
    progressResumedAuthor._restoreDurableRewardOutbox();
    for (let attempt = 0; attempt < 40 && progressResumedAuthor._pendingDurableRewardWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(progressMemory.records.get(progressPath).kind, 'boss_progress');

    const progressOperationOrder = [];
    let progressSaveAttempt = 0;
    const progressProfileNet = {
        isSharedFieldActive: () => false,
        sendPlayerHp: () => {},
        savePlayerData: async (_uid, profile) => {
            progressSaveAttempt += 1;
            progressOperationOrder.push('profile');
            return progressSaveAttempt === 1
                ? { ok: false, reason: 'temporary_progress_save_failure' }
                : { ok: true, profile };
        },
        savePlayerDataPatch: async () => ({ ok: true })
    };
    const progressPlayer = new Player(100, 100, 'Progress Receiver', null);
    progressPlayer.id = recipientId;
    progressPlayer.net = progressProfileNet;
    window.game = {
        itemData,
        net: progressProfileNet,
        localPlayer: progressPlayer,
        zone: { currentZone: { id: 'zone_4' } },
        ui: {
            updateInventory: () => {},
            updateQuestUI: () => {},
            logSystemMessage: () => {},
            showExpGainHint: () => {},
            updateStatusPopup: () => {},
            showLevelUpEffect: () => {},
            updateHudAttentionIndicators: () => {}
        }
    };
    const progressReceiver = new NetworkManager();
    progressReceiver.playerId = recipientId;
    progressReceiver.dbRef = progressMemory.dbRef;
    progressReceiver.getServerNow = () => authoredAt + 20_000;
    progressReceiver._getDurableRewardRetryDelay = () => 100_000;
    const progressTransactionStart = progressMemory.operationLog.length;
    await progressReceiver.setDurableRewardConsumer((reward) => progressPlayer.receiveRewardDurably(reward));
    assert.equal(progressPlayer.level, 2);
    assert.equal(progressPlayer.exp, 80, 'disconnected boss EXP must still apply after the legacy ten-second window');
    assert.ok(progressPlayer.claimedRewardIds.includes(progressRewardId));
    assert.equal(progressMemory.records.get(progressPath).status, 'pending', 'failed EXP profile save must leave the receipt pending');
    await progressReceiver._drainDurableBossRewards();
    assert.equal(progressPlayer.exp, 80, 'boss EXP save retry must not apply EXP twice');
    assert.equal(progressMemory.records.get(progressPath).status, 'claimed');
    assert.equal(progressOperationOrder[0], 'profile');
    assert.ok(
        progressMemory.operationLog.slice(progressTransactionStart).some((entry) => entry === `transaction:${progressPath}`),
        'boss EXP acknowledgement must run only after profile persistence'
    );
    let repeatedProgressApplications = 0;
    const progressReconnect = new NetworkManager();
    progressReconnect.playerId = recipientId;
    progressReconnect.dbRef = progressMemory.dbRef;
    progressReconnect.getServerNow = () => authoredAt + 25_000;
    await progressReconnect.setDurableRewardConsumer(async () => {
        repeatedProgressApplications += 1;
        return { ok: true };
    });
    assert.equal(repeatedProgressApplications, 0, 'claimed boss EXP must not reapply after reconnect');
    progressReceiver._clearDurableRewardRuntime({ clearConsumer: true });
    progressReconnect._clearDurableRewardRuntime({ clearConsumer: true });
    progressResumedAuthor._clearDurableRewardRuntime({ clearConsumer: true });
    window.localStorage = progressPreviousStorage;

    receiverNet._clearDurableRewardRuntime({ clearConsumer: true });
    fullReceiverNet._clearDurableRewardRuntime({ clearConsumer: true });
    authorNet._clearDurableRewardRuntime({ clearConsumer: true });
    window.localStorage = durablePreviousLocalStorage;
}

async function validateNormalRewardV2Contracts() {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const authorTime = 5_000_000;
    const fieldId = 'zone_2__party__normal_host';
    const previousLocalStorage = window.localStorage;
    const storageRecords = new Map();
    const blockedStorageRemovals = new Set();
    window.localStorage = {
        getItem: (key) => storageRecords.get(key) ?? null,
        setItem: (key, value) => storageRecords.set(key, String(value)),
        removeItem: (key) => (
            blockedStorageRemovals.has(key) ? false : storageRecords.delete(key)
        )
    };

    const runSenderRetryCase = async ({ label, authorId, recipientId, rewards, batch = false }) => {
        const memory = createMemoryRewardDatabase();
        memory.failNextTransactions(1);
        const net = new NetworkManager();
        net.playerId = authorId;
        net.connected = true;
        net.isHost = true;
        net.dbRef = memory.dbRef;
        net.getServerNow = () => authorTime;
        net._getCurrentFieldId = () => fieldId;
        net._getDurableRewardRetryDelay = () => 0;
        rewards.forEach((reward) => assert.equal(net.sendReward(recipientId, reward), true, `${label} must enqueue`));
        if (batch) {
            assert.equal(net._queuedRewardBatches.size, 1, `${label} must wait in one field-scoped batch`);
            await net.flushQueuedRewardBatches();
        }
        for (let attempt = 0; attempt < 60 && net._pendingNormalRewardWrites.size > 0; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 2));
        }
        assert.equal(net._pendingNormalRewardWrites.size, 0, `${label} must retry and clear its durable outbox`);
        assert.equal(memory.transactionAttempts.length, 2, `${label} must retry the failed transaction exactly once`);
        assert.equal(
            memory.transactionAttempts[0],
            memory.transactionAttempts[1],
            `${label} retries must preserve the exact receipt key`
        );
        const path = memory.transactionAttempts[0];
        const envelope = memory.records.get(path);
        assert.equal(envelope.kind, 'normal_reward');
        assert.equal(envelope.status, 'pending');
        assert.equal(envelope.recipientId, recipientId);
        assert.equal(envelope.expiresAt - envelope.authoredAt, THIRTY_DAYS_MS, 'normal receipts must live for 30 days');
        net._clearNormalRewardRuntime({ clearConsumer: true });
        return { memory, envelope, path };
    };

    const selfResult = await runSenderRetryCase({
        label: 'self reward',
        authorId: 'normal_self_host',
        recipientId: 'normal_self_host',
        rewards: [{ rewardId: 'normal_self_direct_1', exp: 7, immediate: true }]
    });
    assert.equal(selfResult.envelope.exp, 7, 'self rewards must use the same top-level v2 envelope');

    const directResult = await runSenderRetryCase({
        label: 'remote direct reward',
        authorId: 'normal_direct_host',
        recipientId: 'normal_direct_guest',
        rewards: [{ rewardId: 'normal_direct_1', manastone: 11, immediate: true }]
    });
    assert.equal(directResult.envelope.manastone, 11);

    storageRecords.clear();
    const idempotentMemory = createMemoryRewardDatabase();
    idempotentMemory.failNextTransactions(1);
    const idempotentNet = new NetworkManager();
    idempotentNet.playerId = 'normal_idempotent_host';
    idempotentNet.connected = true;
    idempotentNet.isHost = true;
    idempotentNet.dbRef = idempotentMemory.dbRef;
    idempotentNet.getServerNow = () => authorTime;
    idempotentNet._getCurrentFieldId = () => fieldId;
    idempotentNet._getDurableRewardRetryDelay = () => 100_000;
    const idempotentPayload = { rewardId: 'normal_idempotent_reward', exp: 3, immediate: true };
    assert.equal(idempotentNet.sendReward('normal_idempotent_guest', idempotentPayload), true);
    assert.equal(idempotentNet.sendReward('normal_idempotent_guest', idempotentPayload), true);
    assert.equal(idempotentNet._pendingNormalRewardWrites.size, 1, 'the same semantic reward must share one pending outbox receipt');
    assert.equal(
        idempotentNet.sendReward('normal_idempotent_guest', { ...idempotentPayload, exp: 4 }),
        true,
        'a conflicting retry of one semantic id must keep the first writer without authoring another receipt'
    );
    assert.equal(idempotentNet._pendingNormalRewardWrites.size, 1);
    idempotentNet._clearNormalRewardRuntime({ clearConsumer: true });

    const normalFinalizeStorageRecords = new Map();
    let normalFinalizeStorageWrites = 0;
    const normalFinalizePreviousFirebase = window.firebase;
    const normalFinalizePreviousStorage = window.localStorage;
    window.localStorage = {
        getItem: (key) => normalFinalizeStorageRecords.get(key) ?? null,
        setItem: (key, value) => {
            normalFinalizeStorageWrites += 1;
            if (normalFinalizeStorageWrites === 2) throw new Error('simulated normal finalize persistence failure');
            normalFinalizeStorageRecords.set(key, String(value));
        },
        removeItem: (key) => normalFinalizeStorageRecords.delete(key)
    };
    window.firebase = {};
    const normalFinalizeMemory = createMemoryRewardDatabase();
    const normalFinalizeNet = new NetworkManager();
    normalFinalizeNet.playerId = 'normal_finalize_host';
    normalFinalizeNet.connected = true;
    normalFinalizeNet.isHost = true;
    normalFinalizeNet.dbRef = normalFinalizeMemory.dbRef;
    normalFinalizeNet._getCurrentFieldId = () => fieldId;
    normalFinalizeNet.getServerNow = () => authorTime;
    normalFinalizeNet._ensureDurableRewardServerTime = async () => true;
    normalFinalizeNet._getDurableRewardRetryDelay = () => 100_000;
    assert.equal(normalFinalizeNet.sendReward('normal_finalize_guest', {
        rewardId: 'normal_finalize_reward',
        exp: 4,
        immediate: true
    }), true);
    for (let attempt = 0; attempt < 40 && normalFinalizeStorageWrites < 2; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const normalFinalizeEntry = Array.from(normalFinalizeNet._pendingNormalRewardWrites.values())[0];
    assert.ok(normalFinalizeEntry);
    assert.equal(normalFinalizeEntry.timestampFinalized, false, 'normal finalize persistence failure must roll back in memory');
    assert.equal(normalFinalizeMemory.transactionAttempts.length, 0);
    await normalFinalizeNet._attemptNormalRewardWrite(normalFinalizeEntry);
    assert.equal(normalFinalizeMemory.transactionAttempts.length, 1);
    normalFinalizeNet._clearNormalRewardRuntime({ clearConsumer: true });
    window.firebase = normalFinalizePreviousFirebase;
    window.localStorage = normalFinalizePreviousStorage;

    const batchResult = await runSenderRetryCase({
        label: 'remote batch reward',
        authorId: 'normal_batch_host',
        recipientId: 'normal_batch_guest',
        rewards: [{ exp: 13 }, { exp: 5 }],
        batch: true
    });
    assert.equal(batchResult.envelope.exp, 18, 'batched rewards must retain their merged amount in v2');

    const crashJournalMemory = createMemoryRewardDatabase();
    const crashJournalAuthor = new NetworkManager();
    crashJournalAuthor.playerId = 'normal_crash_host';
    crashJournalAuthor.connected = true;
    crashJournalAuthor.isHost = true;
    crashJournalAuthor.dbRef = crashJournalMemory.dbRef;
    crashJournalAuthor.getServerNow = () => authorTime;
    crashJournalAuthor._getCurrentFieldId = () => fieldId;
    assert.equal(crashJournalAuthor.sendReward('normal_crash_guest', { exp: 23 }), true);
    const crashJournalStorageKey = crashJournalAuthor._getNormalRewardBatchStorageKey(crashJournalAuthor.playerId);
    assert.ok(storageRecords.get(crashJournalStorageKey), 'a batchable reward must be journaled before the 650ms timer fires');
    crashJournalAuthor._clearQueuedRewardBatches();

    const crashJournalResume = new NetworkManager();
    crashJournalResume.playerId = crashJournalAuthor.playerId;
    crashJournalResume.connected = true;
    crashJournalResume.isHost = false;
    crashJournalResume.dbRef = crashJournalMemory.dbRef;
    crashJournalResume.getServerNow = () => authorTime;
    crashJournalResume._getDurableRewardRetryDelay = () => 0;
    assert.equal(crashJournalResume._restoreNormalRewardBatchJournal(), 1);
    for (let attempt = 0; attempt < 60 && crashJournalMemory.records.size === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const resumedBatchEnvelope = Array.from(crashJournalMemory.records.entries())
        .find(([path]) => path.startsWith('rewards/normal_crash_guest/'))?.[1];
    assert.equal(resumedBatchEnvelope?.exp, 23, 'a sealed former host must deliver a crash-restored batch after demotion');
    assert.equal(storageRecords.has(crashJournalStorageKey), false, 'a restored batch journal must clear only after outbox sealing');
    crashJournalResume._clearNormalRewardRuntime({ clearConsumer: true });

    storageRecords.clear();
    const staleHandoffMemory = createMemoryRewardDatabase();
    const staleHandoffAuthor = new NetworkManager();
    staleHandoffAuthor.playerId = 'normal_stale_handoff_host';
    staleHandoffAuthor.connected = true;
    staleHandoffAuthor.isHost = true;
    staleHandoffAuthor.dbRef = staleHandoffMemory.dbRef;
    staleHandoffAuthor.getServerNow = () => authorTime;
    staleHandoffAuthor._getCurrentFieldId = () => fieldId;
    staleHandoffAuthor._getDurableRewardRetryDelay = () => 0;
    assert.equal(staleHandoffAuthor.sendReward('normal_stale_handoff_guest', { manastone: 29 }), true);
    const staleHandoffStorageKey = staleHandoffAuthor._getNormalRewardBatchStorageKey(staleHandoffAuthor.playerId);
    blockedStorageRemovals.add(staleHandoffStorageKey);
    await staleHandoffAuthor.flushQueuedRewardBatches();
    for (let attempt = 0; attempt < 60 && staleHandoffAuthor._pendingNormalRewardWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const staleJournal = JSON.parse(storageRecords.get(staleHandoffStorageKey));
    assert.equal(staleJournal.length, 1, 'a simulated journal remove failure must leave the sealed handoff record');
    assert.ok(staleJournal[0].receiptKey, 'the handoff journal must seal a deterministic receipt key before outbox enqueue');
    assert.equal(staleJournal[0].authoredAt, authorTime, 'the handoff journal must seal server-authored time before outbox enqueue');
    const stalePendingPath = `rewards/normal_stale_handoff_guest/${staleJournal[0].receiptKey}`;
    assert.equal(staleHandoffMemory.records.get(stalePendingPath)?.manastone, 29);

    const staleHandoffReceiver = new NetworkManager();
    staleHandoffReceiver.playerId = 'normal_stale_handoff_guest';
    staleHandoffReceiver.dbRef = staleHandoffMemory.dbRef;
    staleHandoffReceiver.getServerNow = () => authorTime + 1000;
    await staleHandoffReceiver.setNormalRewardConsumer(async () => ({ ok: true }));
    assert.equal(staleHandoffMemory.records.has(stalePendingPath), false);
    const staleClaimPath = staleHandoffReceiver._getNormalRewardClaimPath(
        staleHandoffReceiver.playerId,
        staleJournal[0].receiptKey,
        staleJournal[0].authoredAt
    );
    assert.equal(staleHandoffMemory.records.get(staleClaimPath)?.status, 'claimed');

    const staleHandoffReplay = new NetworkManager();
    staleHandoffReplay.playerId = staleHandoffAuthor.playerId;
    staleHandoffReplay.connected = true;
    staleHandoffReplay.isHost = false;
    staleHandoffReplay.dbRef = staleHandoffMemory.dbRef;
    staleHandoffReplay.getServerNow = () => authorTime + 2000;
    staleHandoffReplay._getDurableRewardRetryDelay = () => 0;
    assert.equal(staleHandoffReplay._restoreNormalRewardBatchJournal(), 1);
    for (let attempt = 0; attempt < 60
        && (staleHandoffReplay._queuedRewardBatches.size > 0
            || staleHandoffReplay._pendingNormalRewardWrites.size > 0); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(staleHandoffMemory.records.has(stalePendingPath), false, 'a stale journal replay must not recreate an acknowledged receipt');
    assert.equal(staleHandoffMemory.records.get(staleClaimPath)?.status, 'claimed');
    assert.equal(
        new Set(staleHandoffMemory.transactionAttempts.filter((path) => path.startsWith('rewards/normal_stale_handoff_guest/'))).size,
        1,
        'every crash-window replay of one semantic reward must target the same Firebase receipt key'
    );
    blockedStorageRemovals.delete(staleHandoffStorageKey);
    storageRecords.delete(staleHandoffStorageKey);
    staleHandoffAuthor._clearNormalRewardRuntime({ clearConsumer: true });
    staleHandoffReceiver._clearNormalRewardRuntime({ clearConsumer: true });
    staleHandoffReplay._clearNormalRewardRuntime({ clearConsumer: true });

    storageRecords.clear();
    const crossHostMemory = createMemoryRewardDatabase();
    const crossHostRewardId = 'normal_cross_host_semantic_reward';
    const crossHostRecipientId = 'normal_cross_host_guest';
    const createCrossHostSender = (uid, now) => {
        const sender = new NetworkManager();
        sender.playerId = uid;
        sender.connected = true;
        sender.isHost = true;
        sender.dbRef = crossHostMemory.dbRef;
        sender.getServerNow = () => now;
        sender._getCurrentFieldId = () => fieldId;
        sender._getDurableRewardRetryDelay = () => 0;
        return sender;
    };
    const crossHostFirst = createCrossHostSender('normal_cross_host_a', authorTime);
    const crossHostSecond = createCrossHostSender('normal_cross_host_b', authorTime + 1000);
    const crossHostReceiptKey = crossHostFirst._buildNormalRewardSemanticReceiptKey(
        crossHostFirst.playerId,
        crossHostRecipientId,
        crossHostRewardId
    );
    assert.equal(
        crossHostReceiptKey,
        crossHostSecond._buildNormalRewardSemanticReceiptKey(
            crossHostSecond.playerId,
            crossHostRecipientId,
            crossHostRewardId
        ),
        'semantic receipt keys must remain stable across a host handoff'
    );
    assert.equal(crossHostFirst.sendReward(crossHostRecipientId, {
        rewardId: crossHostRewardId,
        manastone: 31,
        immediate: true
    }), true);
    for (let attempt = 0; attempt < 60 && crossHostFirst._pendingNormalRewardWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(crossHostSecond.sendReward(crossHostRecipientId, {
        rewardId: crossHostRewardId,
        manastone: 999,
        immediate: true
    }), true);
    for (let attempt = 0; attempt < 60 && crossHostSecond._pendingNormalRewardWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const crossHostPendingPath = `rewards/${crossHostRecipientId}/${crossHostReceiptKey}`;
    assert.equal(crossHostMemory.records.get(crossHostPendingPath)?.authorHostId, crossHostFirst.playerId);
    assert.equal(crossHostMemory.records.get(crossHostPendingPath)?.manastone, 31, 'the first host writer must win a semantic collision');

    let crossHostApplications = 0;
    const crossHostReceiver = new NetworkManager();
    crossHostReceiver.playerId = crossHostRecipientId;
    crossHostReceiver.dbRef = crossHostMemory.dbRef;
    crossHostReceiver.getServerNow = () => authorTime + 2000;
    await crossHostReceiver.setNormalRewardConsumer(async () => {
        crossHostApplications += 1;
        return { ok: true };
    });
    assert.equal(crossHostApplications, 1);
    assert.equal(crossHostMemory.records.has(crossHostPendingPath), false);
    const crossHostClaimIndexPath = crossHostReceiver._getNormalRewardClaimIndexPath(
        crossHostRecipientId,
        crossHostReceiptKey
    );
    assert.equal(typeof crossHostMemory.records.get(crossHostClaimIndexPath), 'string');

    const crossHostLate = createCrossHostSender(
        'normal_cross_host_late',
        authorTime + (2 * 24 * 60 * 60 * 1000)
    );
    assert.equal(crossHostLate.sendReward(crossHostRecipientId, {
        rewardId: crossHostRewardId,
        manastone: 777,
        immediate: true
    }), true);
    for (let attempt = 0; attempt < 60 && crossHostLate._pendingNormalRewardWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(crossHostMemory.records.has(crossHostPendingPath), false, 'a cross-day former-host retry must not recreate a claimed receipt');
    await crossHostReceiver._drainNormalRewards();
    assert.equal(crossHostApplications, 1, 'cross-host semantic retries must never reach the consumer twice');
    crossHostFirst._clearNormalRewardRuntime({ clearConsumer: true });
    crossHostSecond._clearNormalRewardRuntime({ clearConsumer: true });
    crossHostLate._clearNormalRewardRuntime({ clearConsumer: true });
    crossHostReceiver._clearNormalRewardRuntime({ clearConsumer: true });

    storageRecords.clear();
    const saturatedNet = new NetworkManager();
    saturatedNet.playerId = 'normal_saturated_host';
    saturatedNet.connected = true;
    saturatedNet.isHost = true;
    saturatedNet.dbRef = createMemoryRewardDatabase().dbRef;
    saturatedNet.getServerNow = () => authorTime;
    saturatedNet._getCurrentFieldId = () => fieldId;
    for (let index = 0; index < 512; index += 1) {
        saturatedNet._pendingNormalRewardWrites.set(`occupied_${index}`, { queueKey: `occupied_${index}` });
    }
    assert.equal(saturatedNet.sendReward('normal_saturated_guest', {
        rewardId: 'king_slime_repeat_quest',
        questKill: 'king_slime',
        bossCycle: 'repeat',
        bossReward: true,
        immediate: true
    }), true, 'a guaranteed boss quest must spill into the crash-safe journal when the receipt outbox is full');
    assert.equal(saturatedNet.sendReward('normal_saturated_guest', {
        rewardId: 'king_slime_repeat_quest',
        questKill: 'king_slime',
        bossCycle: 'repeat',
        bossReward: true,
        immediate: true
    }), true, 're-authoring the same guaranteed semantic reward must be idempotent in the journal');
    const bossQuestSpill = Array.from(saturatedNet._queuedRewardBatches.values())[0];
    assert.equal(bossQuestSpill.payload.questKills.king_slime, 1);
    assert.equal(bossQuestSpill.payload.bossCycle, 'repeat');
    saturatedNet._clearQueuedRewardBatches();
    storageRecords.clear();
    assert.equal(saturatedNet._queueRewardBatch('normal_saturated_guest', { exp: 249999 }, {
        fieldId,
        sealedAuthorHostId: saturatedNet.playerId
    }), true);
    assert.equal(saturatedNet._queueRewardBatch('normal_saturated_guest', { exp: 2 }, {
        fieldId,
        sealedAuthorHostId: saturatedNet.playerId
    }), true);
    assert.deepEqual(
        Array.from(saturatedNet._queuedRewardBatches.values()).map((entry) => entry.payload.exp).sort((a, b) => a - b),
        [2, 249999],
        'a saturated aggregate must split into valid payload chunks instead of entering an invalid retry loop'
    );
    saturatedNet._clearQueuedRewardBatches();
    saturatedNet._pendingNormalRewardWrites.clear();
    storageRecords.clear();

    const legacyCompatibilityNet = new NetworkManager();
    legacyCompatibilityNet.currentHostId = 'normal_direct_host';
    legacyCompatibilityNet._getCurrentFieldId = () => fieldId;
    assert.equal(
        legacyCompatibilityNet._validateIncomingRewardPayload(directResult.envelope, authorTime + 1000).ok,
        true,
        'rolling old recipients must see host, field, timestamp, and reward fields at the envelope top level'
    );

    const isolatedBatchNet = new NetworkManager();
    isolatedBatchNet.playerId = 'field_handoff_host';
    isolatedBatchNet.connected = true;
    isolatedBatchNet.isHost = true;
    isolatedBatchNet.dbRef = createMemoryRewardDatabase().dbRef;
    let activeFieldId = 'zone_2';
    isolatedBatchNet._getCurrentFieldId = () => activeFieldId;
    isolatedBatchNet._enqueueNormalRewardReceipt = () => false;
    assert.equal(isolatedBatchNet.sendReward('field_handoff_guest', { exp: 3 }), true);
    activeFieldId = 'zone_3';
    assert.equal(isolatedBatchNet.sendReward('field_handoff_guest', { exp: 9 }), true);
    assert.equal(isolatedBatchNet._queuedRewardBatches.size, 2, 'field handoff batches must use independent keys');
    await isolatedBatchNet.flushQueuedRewardBatches();
    assert.deepEqual(
        Array.from(isolatedBatchNet._queuedRewardBatches.values())
            .map((entry) => [entry.fieldId, entry.payload.exp])
            .sort((a, b) => a[0].localeCompare(b[0])),
        [['zone_2', 3], ['zone_3', 9]],
        'outbox pressure must not let a new-field batch overwrite an older-field batch'
    );
    isolatedBatchNet._clearQueuedRewardBatches();

    const capNet = new NetworkManager();
    capNet.playerId = 'normal_cap_host';
    capNet.getServerNow = () => authorTime;
    capNet._getCurrentFieldId = () => fieldId;
    assert.equal(
        capNet._normalizeNormalRewardCanonicalPayload({
            rewardId: 'payload_too_large',
            items: [{ id: 'oversized_item', amount: 1, description: 'x'.repeat(33 * 1024) }]
        }),
        null,
        'normal reward payloads larger than 32KB must be refused before authoring'
    );
    const makeCapacityEntry = (index, padding = '') => ({
        queueKey: `normal_cap_guest:receipt_${index}`,
        receiptKey: `receipt_${index}`,
        recipientId: 'normal_cap_guest',
        queuedAt: Date.now(),
        timestampFinalized: true,
        envelope: {
            authorHostId: capNet.playerId,
            receiptId: `cap_${index}`,
            padding
        }
    });
    assert.equal(
        capNet._persistNormalRewardOutbox(capNet.playerId, Array.from({ length: 512 }, (_, index) => makeCapacityEntry(index))),
        true,
        'the normal sender outbox must allow a four-player AoE burst of 512 receipts'
    );
    assert.equal(
        capNet._persistNormalRewardOutbox(capNet.playerId, Array.from({ length: 513 }, (_, index) => makeCapacityEntry(index))),
        false,
        'the normal sender outbox must refuse a 513th entry without pruning older rewards'
    );
    assert.equal(
        capNet._persistNormalRewardOutbox(capNet.playerId, [makeCapacityEntry(0, 'x'.repeat((2 * 1024 * 1024) + 1))]),
        false,
        'the serialized normal sender outbox must be capped at 2MB'
    );

    storageRecords.clear();
    const retentionKey = 'retained_receipt';
    const retentionEnvelope = capNet._createNormalRewardEnvelope(
        'normal_retention_guest',
        { rewardId: 'normal_retention_reward', exp: 1, immediate: true },
        retentionKey,
        { fieldId }
    );
    const retainedStored = capNet._serializeNormalRewardOutboxEntry({
        queueKey: `normal_retention_guest:${retentionKey}`,
        receiptKey: retentionKey,
        recipientId: 'normal_retention_guest',
        queuedAt: Date.now() - THIRTY_DAYS_MS + 60_000,
        timestampFinalized: true,
        envelope: retentionEnvelope
    });
    const retentionStorageKey = capNet._getNormalRewardOutboxStorageKey(capNet.playerId);
    storageRecords.set(retentionStorageKey, JSON.stringify([retainedStored]));
    const retainedNet = new NetworkManager();
    retainedNet.playerId = capNet.playerId;
    retainedNet.dbRef = createMemoryRewardDatabase().dbRef;
    retainedNet.getServerNow = () => authorTime;
    retainedNet._attemptNormalRewardWrite = async () => false;
    assert.equal(retainedNet._restoreNormalRewardOutbox(), 1, 'a sender outbox entry must survive for at least 30 days');
    retainedNet._pendingNormalRewardWrites.clear();
    storageRecords.set(retentionStorageKey, JSON.stringify([{
        ...retainedStored,
        queuedAt: Date.now() - (365 * 24 * 60 * 60 * 1000),
        timestampFinalized: false
    }]));
    const expiredOutboxNet = new NetworkManager();
    expiredOutboxNet.playerId = capNet.playerId;
    expiredOutboxNet.dbRef = createMemoryRewardDatabase().dbRef;
    expiredOutboxNet._attemptNormalRewardWrite = async () => false;
    assert.equal(
        expiredOutboxNet._restoreNormalRewardOutbox(),
        1,
        'a local OS clock jump must not discard a normal outbox before authoritative timestamp finalization'
    );
    expiredOutboxNet._pendingNormalRewardWrites.clear();

    storageRecords.clear();
    const skewedBatchAuthor = new NetworkManager();
    skewedBatchAuthor.playerId = 'normal_skewed_batch_host';
    skewedBatchAuthor._getCurrentFieldId = () => fieldId;
    assert.equal(skewedBatchAuthor._queueRewardBatch('normal_skewed_batch_guest', { exp: 6 }, {
        fieldId,
        sealedAuthorHostId: skewedBatchAuthor.playerId
    }), true);
    const skewedBatchStorageKey = skewedBatchAuthor._getNormalRewardBatchStorageKey(skewedBatchAuthor.playerId);
    const skewedBatchJournal = JSON.parse(storageRecords.get(skewedBatchStorageKey));
    skewedBatchJournal[0].queuedAt = Date.now() - (365 * 24 * 60 * 60 * 1000);
    storageRecords.set(skewedBatchStorageKey, JSON.stringify(skewedBatchJournal));
    skewedBatchAuthor._clearQueuedRewardBatches();
    const skewedBatchRestore = new NetworkManager();
    skewedBatchRestore.playerId = skewedBatchAuthor.playerId;
    assert.equal(
        skewedBatchRestore._restoreNormalRewardBatchJournal(),
        1,
        'a local OS clock jump must not discard an unsealed normal batch journal'
    );
    skewedBatchRestore._clearQueuedRewardBatches();

    storageRecords.clear();
    const recipientId = 'normal_consumer_guest';
    const consumerAuthor = new NetworkManager();
    consumerAuthor.playerId = 'normal_departed_host';
    consumerAuthor.getServerNow = () => authorTime;
    consumerAuthor._getCurrentFieldId = () => fieldId;
    const receiptKey = 'consumer_receipt';
    const semanticRewardId = 'normal_consumer_reward_1';
    const consumerEnvelope = consumerAuthor._createNormalRewardEnvelope(
        recipientId,
        { rewardId: semanticRewardId, exp: 17, manastone: 5, immediate: true },
        receiptKey,
        { fieldId }
    );
    const consumerPath = `rewards/${recipientId}/${receiptKey}`;
    const consumerMemory = createMemoryRewardDatabase({ [consumerPath]: consumerEnvelope });
    const consumerNet = new NetworkManager();
    consumerNet.playerId = recipientId;
    consumerNet.dbRef = consumerMemory.dbRef;
    consumerNet.currentHostId = 'replacement_host';
    consumerNet._activeZoneFieldId = 'zone_4';
    consumerNet.getServerNow = () => authorTime + 20_000;
    consumerNet._getDurableRewardRetryDelay = () => 100_000;
    const preReadySnapshot = await consumerMemory.dbRef.child(consumerPath).once('value');
    assert.equal(await consumerNet._handleIncomingRewardSnapshot(preReadySnapshot, {
        generation: consumerNet._networkLifecycleGeneration,
        playerId: recipientId,
        dbRef: consumerNet.dbRef,
        legacyRewardPath: true
    }), false);
    assert.equal(consumerMemory.records.get(consumerPath).status, 'pending', 'normal receipts must wait for the player consumer');

    let saveAttempt = 0;
    const savedProfiles = [];
    const profileNet = {
        isSharedFieldActive: () => false,
        sendPlayerHp: () => {},
        savePlayerData: async (_uid, profile) => {
            saveAttempt += 1;
            consumerMemory.operationLog.push(`profile:${saveAttempt}`);
            savedProfiles.push(JSON.parse(JSON.stringify(profile)));
            return saveAttempt === 1
                ? { ok: false, reason: 'temporary_normal_profile_failure' }
                : { ok: true, profile };
        },
        savePlayerDataPatch: async () => ({ ok: true })
    };
    const player = new Player(100, 100, 'Normal Receiver', null);
    player.id = recipientId;
    player.net = profileNet;
    window.game = {
        itemData: createDurableRewardItemData(),
        net: profileNet,
        localPlayer: player,
        zone: { currentZone: { id: 'zone_4' } },
        ui: {
            updateInventory: () => {},
            updateQuestUI: () => {},
            updateStatusPopup: () => {},
            showExpGainHint: () => {},
            logSystemMessage: () => {},
            updateHudAttentionIndicators: () => {}
        }
    };
    await consumerNet.setNormalRewardConsumer((reward) => player.receiveNormalRewardDurably(reward));
    assert.equal(player.exp, 17, 'normal rewards must apply despite host, map, and legacy ten-second changes');
    assert.equal(player.manastone, 5);
    assert.ok(player.claimedRewardIds.includes(semanticRewardId));
    assert.equal(consumerMemory.records.get(consumerPath).status, 'pending', 'profile failure must keep a normal receipt pending');
    assert.equal(
        consumerMemory.operationLog.some((entry) => entry.startsWith('transaction:')),
        false,
        'normal acknowledgement must never run before profile persistence succeeds'
    );
    await consumerNet._drainNormalRewards();
    assert.equal(saveAttempt, 2);
    assert.equal(player.exp, 17, 'a normal profile retry must not apply EXP twice');
    assert.equal(player.manastone, 5, 'a normal profile retry must not apply currency twice');
    const consumerClaimPath = consumerNet._getNormalRewardClaimPath(recipientId, receiptKey, consumerEnvelope.authoredAt);
    assert.equal(consumerMemory.records.has(consumerPath), false, 'claimed rewards must leave the reconnect inbox');
    assert.equal(consumerMemory.records.get(consumerClaimPath).status, 'claimed');
    assert.equal(consumerMemory.records.get(consumerClaimPath).exp, undefined, 'claim markers must discard mutable payload fields');
    assert.ok(savedProfiles.at(-1).claimedRewardIds.includes(semanticRewardId));
    assert.ok(
        consumerMemory.operationLog.indexOf('profile:2')
            < consumerMemory.operationLog.indexOf('update:root'),
        'the successful full profile save must precede normal receipt acknowledgement'
    );

    const fifoRecipientId = 'normal_fifo_130_guest';
    const fifoAuthor = new NetworkManager();
    fifoAuthor.playerId = 'normal_fifo_130_host';
    fifoAuthor.getServerNow = () => authorTime;
    const fifoRecords = {};
    const fifoEnvelopes = [];
    for (let index = 0; index < 130; index += 1) {
        const fifoReceiptKey = `fifo_receipt_${String(index).padStart(3, '0')}`;
        const envelope = fifoAuthor._createNormalRewardEnvelope(
            fifoRecipientId,
            { rewardId: `normal_fifo_reward_${index}`, manastone: 1, immediate: true },
            fifoReceiptKey,
            { fieldId }
        );
        fifoEnvelopes.push({ key: fifoReceiptKey, envelope });
        fifoRecords[`rewards/${fifoRecipientId}/${fifoReceiptKey}`] = envelope;
    }
    const fifoMemory = createMemoryRewardDatabase(fifoRecords);
    let fifoSaveAttempts = 0;
    let fifoActiveSaves = 0;
    let fifoMaxConcurrentSaves = 0;
    const fifoProfileNet = {
        isSharedFieldActive: () => false,
        sendPlayerHp: () => {},
        savePlayerData: async (_uid, profile) => {
            fifoSaveAttempts += 1;
            const currentAttempt = fifoSaveAttempts;
            fifoActiveSaves += 1;
            fifoMaxConcurrentSaves = Math.max(fifoMaxConcurrentSaves, fifoActiveSaves);
            await Promise.resolve();
            fifoActiveSaves -= 1;
            return currentAttempt === 1
                ? { ok: false, reason: 'fifo_front_profile_failure' }
                : { ok: true, profile };
        },
        savePlayerDataPatch: async () => ({ ok: true })
    };
    const fifoPlayer = new Player(100, 100, 'FIFO Receiver', null);
    fifoPlayer.id = fifoRecipientId;
    fifoPlayer.net = fifoProfileNet;
    window.game = {
        itemData: createDurableRewardItemData(),
        net: fifoProfileNet,
        localPlayer: fifoPlayer,
        zone: { currentZone: { id: 'zone_2' } },
        ui: {
            updateInventory: () => {},
            updateQuestUI: () => {},
            updateStatusPopup: () => {},
            showExpGainHint: () => {},
            logSystemMessage: () => {},
            updateHudAttentionIndicators: () => {}
        }
    };
    const fifoNet = new NetworkManager();
    fifoNet.playerId = fifoRecipientId;
    fifoNet.dbRef = fifoMemory.dbRef;
    fifoNet.getServerNow = () => authorTime + 1000;
    fifoNet._getDurableRewardRetryDelay = () => 100_000;
    await fifoNet.setNormalRewardConsumer((reward) => fifoPlayer.receiveNormalRewardDurably(reward));
    assert.equal(fifoPlayer.manastone, 1, 'a failed FIFO front save must block all 129 later rewards');
    assert.equal(fifoSaveAttempts, 1);
    assert.equal(
        Array.from(fifoMemory.records.keys()).filter((path) => path.startsWith(`rewards/${fifoRecipientId}/`)).length,
        130,
        'no receipt may be acknowledged while the FIFO front profile save is pending'
    );
    await fifoNet._drainNormalRewards();
    assert.equal(fifoPlayer.manastone, 130, 'the retried FIFO must apply each of 130 rewards exactly once');
    assert.equal(fifoSaveAttempts, 131, 'the failed front save retries once before the remaining 129 serial saves');
    assert.equal(fifoMaxConcurrentSaves, 1, 'normal reward profile saves must remain globally serial');
    assert.equal(
        Array.from(fifoMemory.records.keys()).filter((path) => path.startsWith(`rewards/${fifoRecipientId}/`)).length,
        0
    );
    const evictedFirstRewardId = fifoEnvelopes[0].envelope.rewardId;
    assert.equal(fifoPlayer.claimedRewardIds.includes(evictedFirstRewardId), false, 'the bounded profile journal should exercise first-id eviction');
    const evictedFirstClaimPath = fifoNet._getNormalRewardClaimPath(
        fifoRecipientId,
        fifoEnvelopes[0].key,
        fifoEnvelopes[0].envelope.authoredAt
    );
    assert.equal(fifoMemory.records.get(evictedFirstClaimPath)?.status, 'claimed');
    fifoMemory.records.set(
        `rewards/${fifoRecipientId}/${fifoEnvelopes[0].key}`,
        JSON.parse(JSON.stringify(fifoEnvelopes[0].envelope))
    );
    await fifoNet._drainNormalRewards();
    assert.equal(fifoPlayer.manastone, 130, 'the server claim marker must suppress an evicted semantic id replay');
    assert.equal(fifoMemory.records.has(`rewards/${fifoRecipientId}/${fifoEnvelopes[0].key}`), false);
    fifoNet._clearNormalRewardRuntime({ clearConsumer: true });

    const kingRecipientId = 'normal_king_quest_guest';
    const kingReceiptKey = 'king_quest_receipt';
    const kingEnvelope = consumerAuthor._createNormalRewardEnvelope(
        kingRecipientId,
        {
            rewardId: 'monster_reward:zone_1:king_1:normal_king_quest_guest:boss_quest',
            questKill: 'king_slime',
            monsterName: 'King Slime',
            bossCycle: 'intro',
            bossReward: true,
            immediate: true
        },
        kingReceiptKey,
        { fieldId: 'zone_1' }
    );
    const kingPath = `rewards/${kingRecipientId}/${kingReceiptKey}`;
    const kingMemory = createMemoryRewardDatabase({ [kingPath]: kingEnvelope });
    const kingSavedProfiles = [];
    const kingProfileNet = {
        isSharedFieldActive: () => false,
        sendPlayerHp: () => {},
        savePlayerData: async (_uid, profile) => {
            kingSavedProfiles.push(JSON.parse(JSON.stringify(profile)));
            return { ok: true, profile };
        },
        savePlayerDataPatch: async () => ({ ok: true })
    };
    const kingPlayer = new Player(100, 100, 'King Quest Receiver', null);
    kingPlayer.id = kingRecipientId;
    kingPlayer.net = kingProfileNet;
    for (let index = 1; index < kingPlayer.inventory.length; index += 1) {
        kingPlayer.inventory[index] = {
            id: `king_occupied_${index}`,
            type: `king_occupied_${index}`,
            amount: 1,
            stackable: false,
            instanceId: `king_occupied_instance_${index}`
        };
    }
    window.game = {
        itemData: createDurableRewardItemData(),
        net: kingProfileNet,
        localPlayer: kingPlayer,
        zone: { currentZone: { id: 'zone_1' } },
        ui: {
            updateInventory: () => {},
            updateQuestUI: () => {},
            showRewardModal: () => {},
            logSystemMessage: () => {},
            updateHudAttentionIndicators: () => {}
        }
    };
    const kingReceiverNet = new NetworkManager();
    kingReceiverNet.playerId = kingRecipientId;
    kingReceiverNet.dbRef = kingMemory.dbRef;
    kingReceiverNet.getServerNow = () => authorTime + 20_000;
    await kingReceiverNet.setNormalRewardConsumer((reward) => kingPlayer.receiveNormalRewardDurably(reward));
    assert.equal(kingPlayer.questData.bossClearCount, 1);
    assert.equal(kingPlayer.pendingItemRewards.length, 1, 'a full bag must queue the first King Slime blessed stones');
    assert.equal(kingPlayer.pendingItemRewards[0].amount, 3);
    assert.equal(
        kingSavedProfiles.at(-1).pendingItemRewards[0].amount,
        3,
        'King Slime pending blessed stones must persist before the claim marker is written'
    );
    assert.equal(kingMemory.records.has(kingPath), false);
    kingReceiverNet._clearNormalRewardRuntime({ clearConsumer: true });

    const claimedRetryNet = new NetworkManager();
    claimedRetryNet.playerId = consumerEnvelope.authorHostId;
    claimedRetryNet.connected = true;
    claimedRetryNet.isHost = true;
    claimedRetryNet.dbRef = consumerMemory.dbRef;
    claimedRetryNet.getServerNow = () => authorTime + 30_000;
    claimedRetryNet._getDurableRewardRetryDelay = () => 100_000;
    const claimedRetryEntry = {
        queueKey: `${recipientId}:${receiptKey}`,
        receiptKey,
        recipientId,
        envelope: JSON.parse(JSON.stringify(consumerEnvelope)),
        queuedAt: Date.now(),
        timestampFinalized: true,
        attempt: 0,
        timer: null,
        inFlightPromise: null
    };
    claimedRetryNet._pendingNormalRewardWrites.set(claimedRetryEntry.queueKey, claimedRetryEntry);
    await claimedRetryNet._attemptNormalRewardWrite(claimedRetryEntry);
    assert.equal(claimedRetryNet._pendingNormalRewardWrites.size, 0, 'an exact pre-write claim marker must terminally clear the sender outbox');
    assert.equal(consumerMemory.records.has(consumerPath), false, 'a claimed sender retry must never recreate the pending inbox node');

    const claimRaceMemory = createMemoryRewardDatabase();
    const claimRaceNet = new NetworkManager();
    claimRaceNet.playerId = consumerEnvelope.authorHostId;
    claimRaceNet.connected = true;
    claimRaceNet.isHost = true;
    claimRaceNet.dbRef = claimRaceMemory.dbRef;
    claimRaceNet.getServerNow = () => authorTime + 30_000;
    claimRaceNet._getDurableRewardRetryDelay = () => 100_000;
    const claimRaceEntry = {
        ...claimedRetryEntry,
        envelope: JSON.parse(JSON.stringify(consumerEnvelope)),
        timer: null,
        inFlightPromise: null
    };
    claimRaceNet._pendingNormalRewardWrites.set(claimRaceEntry.queueKey, claimRaceEntry);
    claimRaceMemory.beforeNextTransaction((path, records) => {
        assert.equal(path, consumerPath);
        records.set(consumerClaimPath, JSON.parse(JSON.stringify(consumerMemory.records.get(consumerClaimPath))));
    });
    await claimRaceNet._attemptNormalRewardWrite(claimRaceEntry);
    assert.equal(claimRaceNet._pendingNormalRewardWrites.size, 0, 'a post-write claim check must close the claim/write race');
    assert.equal(claimRaceMemory.records.has(consumerPath), false, 'the post-write claim check must remove the raced pending node');

    let reconnectApplications = 0;
    const reconnectNet = new NetworkManager();
    reconnectNet.playerId = recipientId;
    reconnectNet.dbRef = consumerMemory.dbRef;
    reconnectNet.getServerNow = () => authorTime + THIRTY_DAYS_MS - 1000;
    await reconnectNet.setNormalRewardConsumer(async () => {
        reconnectApplications += 1;
        return { ok: true };
    });
    assert.equal(reconnectApplications, 0, 'claimed normal rewards must not reapply during their 30-day tombstone lifetime');
    assert.equal(consumerMemory.records.has(consumerClaimPath), true, 'claim markers must be retained outside the reconnect inbox');
    reconnectNet._clearNormalRewardRuntime({ clearConsumer: true });

    const cleanupAuthoredAt = Date.UTC(2026, 6, 13, 1);
    const cleanupEnvelope = consumerAuthor._createNormalRewardEnvelope(
        recipientId,
        { rewardId: 'normal_cleanup_reward', exp: 1, immediate: true },
        'cleanup_receipt',
        { fieldId }
    );
    cleanupEnvelope.authoredAt = cleanupAuthoredAt;
    cleanupEnvelope.expiresAt = cleanupAuthoredAt + THIRTY_DAYS_MS;
    cleanupEnvelope.ts = cleanupAuthoredAt;
    const permanentEnvelope = consumerAuthor._createNormalRewardEnvelope(
        recipientId,
        {
            rewardId: 'monster_reward:zone_1:king_long_absence:normal_consumer_guest:boss_quest',
            questKill: 'king_slime',
            bossCycle: 'repeat',
            bossReward: true,
            immediate: true
        },
        'permanent_boss_quest_receipt',
        { fieldId }
    );
    permanentEnvelope.authoredAt = cleanupAuthoredAt;
    permanentEnvelope.expiresAt = cleanupAuthoredAt + THIRTY_DAYS_MS;
    permanentEnvelope.ts = cleanupAuthoredAt;
    assert.equal(permanentEnvelope.permanent, true);
    assert.equal(
        consumerAuthor._validateNormalRewardEnvelope(
            permanentEnvelope,
            'permanent_boss_quest_receipt',
            cleanupAuthoredAt + (365 * 24 * 60 * 60 * 1000),
            recipientId
        ).ok,
        true,
        'an unclaimed King Slime quest receipt must survive an arbitrarily long absence'
    );
    const oneYearBossQuestMemory = createMemoryRewardDatabase();
    const oneYearBossQuestSender = new NetworkManager();
    oneYearBossQuestSender.playerId = permanentEnvelope.authorHostId;
    oneYearBossQuestSender.connected = true;
    oneYearBossQuestSender.isHost = false;
    oneYearBossQuestSender.dbRef = oneYearBossQuestMemory.dbRef;
    oneYearBossQuestSender.getServerNow = () => cleanupAuthoredAt + (365 * 24 * 60 * 60 * 1000);
    oneYearBossQuestSender._serverTimeOffsetReady = true;
    oneYearBossQuestSender._getDurableRewardRetryDelay = () => 0;
    const oneYearStoredEntry = consumerAuthor._serializeNormalRewardOutboxEntry({
        queueKey: `${recipientId}:permanent_boss_quest_receipt`,
        receiptKey: 'permanent_boss_quest_receipt',
        recipientId,
        envelope: permanentEnvelope,
        queuedAt: cleanupAuthoredAt,
        timestampFinalized: true
    });
    const oneYearStorageKey = oneYearBossQuestSender._getNormalRewardOutboxStorageKey(
        permanentEnvelope.authorHostId
    );
    storageRecords.set(oneYearStorageKey, JSON.stringify([oneYearStoredEntry]));
    assert.equal(oneYearBossQuestSender._restoreNormalRewardOutbox(), 1);
    for (let attempt = 0; attempt < 60 && oneYearBossQuestSender._pendingNormalRewardWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const oneYearPendingPath = `rewards/${recipientId}/permanent_boss_quest_receipt`;
    assert.equal(
        oneYearBossQuestMemory.records.get(oneYearPendingPath)?.permanent,
        true,
        'a timestamp-finalized boss quest sender outbox must still publish after one year'
    );
    let oneYearBossQuestApplications = 0;
    const oneYearBossQuestReceiver = new NetworkManager();
    oneYearBossQuestReceiver.playerId = recipientId;
    oneYearBossQuestReceiver.dbRef = oneYearBossQuestMemory.dbRef;
    oneYearBossQuestReceiver.getServerNow = oneYearBossQuestSender.getServerNow;
    oneYearBossQuestReceiver._serverTimeOffsetReady = true;
    await oneYearBossQuestReceiver.setNormalRewardConsumer(async () => {
        oneYearBossQuestApplications += 1;
        return { ok: true };
    });
    assert.equal(oneYearBossQuestApplications, 1, 'a one-year-old pending boss quest must reach the profile consumer');
    assert.equal(oneYearBossQuestMemory.records.has(oneYearPendingPath), false);
    const oneYearClaimPath = oneYearBossQuestReceiver._getNormalRewardClaimPath(
        recipientId,
        'permanent_boss_quest_receipt',
        cleanupAuthoredAt
    );
    assert.equal(
        oneYearBossQuestMemory.records.get(oneYearClaimPath)?.permanent,
        true,
        'the one-year-old boss quest must ACK into a permanent semantic claim marker'
    );
    oneYearBossQuestSender._clearNormalRewardRuntime({ clearConsumer: true });
    oneYearBossQuestReceiver._clearNormalRewardRuntime({ clearConsumer: true });
    storageRecords.delete(oneYearStorageKey);
    const cleanupNet = new NetworkManager();
    cleanupNet.playerId = recipientId;
    const cleanupClaimPath = cleanupNet._getNormalRewardClaimPath(recipientId, 'cleanup_receipt', cleanupAuthoredAt);
    const cleanupMarker = cleanupNet._buildNormalRewardClaimMarker(cleanupEnvelope, cleanupAuthoredAt + 1000);
    const cleanupClaimIndexPath = cleanupNet._getNormalRewardClaimIndexPath(recipientId, 'cleanup_receipt');
    const permanentClaimPath = cleanupNet._getNormalRewardClaimPath(
        recipientId,
        'permanent_boss_quest_receipt',
        cleanupAuthoredAt
    );
    const permanentClaimIndexPath = cleanupNet._getNormalRewardClaimIndexPath(
        recipientId,
        'permanent_boss_quest_receipt'
    );
    const permanentMarker = cleanupNet._buildNormalRewardClaimMarker(
        permanentEnvelope,
        cleanupAuthoredAt + 1000
    );
    const cleanupMemory = createMemoryRewardDatabase({
        [cleanupClaimPath]: cleanupMarker,
        [cleanupClaimIndexPath]: cleanupNet._getNormalRewardClaimBucket(cleanupAuthoredAt),
        [permanentClaimPath]: permanentMarker,
        [permanentClaimIndexPath]: cleanupNet._getNormalRewardClaimBucket(cleanupAuthoredAt)
    });
    cleanupNet.dbRef = cleanupMemory.dbRef;
    cleanupNet.getServerNow = () => cleanupAuthoredAt + (32 * 24 * 60 * 60 * 1000);
    await cleanupNet._pruneExpiredNormalRewardClaimBuckets();
    assert.equal(cleanupMemory.records.has(cleanupClaimPath), false, 'expired day-bucket claim journals should be pruned atomically');
    assert.equal(cleanupMemory.records.has(cleanupClaimIndexPath), false, 'expired semantic claim indexes must be pruned with their day bucket');
    assert.equal(cleanupMemory.records.has(permanentClaimPath), true, 'claimed boss quest markers must never be pruned');
    assert.equal(cleanupMemory.records.has(permanentClaimIndexPath), true, 'permanent boss quest claim indexes must remain addressable');

    const skewSafeNet = new NetworkManager();
    skewSafeNet.playerId = 'normal_clock_skew_guest';
    const skewClaimPath = skewSafeNet._getNormalRewardClaimPath(
        skewSafeNet.playerId,
        'skew_receipt',
        cleanupAuthoredAt
    );
    const skewMemory = createMemoryRewardDatabase({ [skewClaimPath]: cleanupMarker });
    skewSafeNet.dbRef = skewMemory.dbRef;
    let skewServerTimeReady = false;
    skewSafeNet._ensureDurableRewardServerTime = async () => {
        skewServerTimeReady = true;
        return true;
    };
    skewSafeNet.getServerNow = () => {
        assert.equal(skewServerTimeReady, true, 'claim pruning must never read a skewed local clock before server-time readiness');
        return cleanupAuthoredAt + (32 * 24 * 60 * 60 * 1000);
    };
    await skewSafeNet._pruneExpiredNormalRewardClaimBuckets();
    assert.equal(skewMemory.records.has(skewClaimPath), false);

    const unavailableClockNet = new NetworkManager();
    unavailableClockNet.playerId = 'normal_clock_unavailable_guest';
    const unavailableClockClaimPath = unavailableClockNet._getNormalRewardClaimPath(
        unavailableClockNet.playerId,
        'unavailable_clock_receipt',
        cleanupAuthoredAt
    );
    const unavailableClockMemory = createMemoryRewardDatabase({ [unavailableClockClaimPath]: cleanupMarker });
    unavailableClockNet.dbRef = unavailableClockMemory.dbRef;
    unavailableClockNet._ensureDurableRewardServerTime = async () => false;
    unavailableClockNet.getServerNow = () => {
        throw new Error('server clock must not be read when synchronization failed');
    };
    assert.equal(await unavailableClockNet._pruneExpiredNormalRewardClaimBuckets(), false);
    assert.equal(
        unavailableClockMemory.records.has(unavailableClockClaimPath),
        true,
        'claim pruning must fail closed when authoritative server time is unavailable'
    );

    const legacyRecipient = 'legacy_rollout_guest';
    const legacyPath = `rewards/${legacyRecipient}/legacy_stale_receipt`;
    const legacyMemory = createMemoryRewardDatabase({
        [legacyPath]: {
            hostId: 'departed_legacy_host',
            fieldId,
            ts: authorTime,
            exp: 19,
            monsterName: 'Legacy Monster'
        }
    });
    const legacyNet = new NetworkManager();
    legacyNet.playerId = legacyRecipient;
    legacyNet.dbRef = legacyMemory.dbRef;
    legacyNet.currentHostId = 'replacement_host';
    legacyNet._activeZoneFieldId = 'zone_4';
    legacyNet.getServerNow = () => authorTime + 20_000;
    let legacyReward = null;
    await legacyNet.setNormalRewardConsumer(async (reward) => {
        legacyReward = reward;
        return { ok: true };
    });
    assert.equal(legacyReward?.exp, 19, 'structurally valid rollout backlog must survive stale host and field checks');
    assert.equal(legacyMemory.records.has(legacyPath), false);
    legacyNet._clearNormalRewardRuntime({ clearConsumer: true });

    const rebindMemory = createMemoryRewardDatabase({ [consumerPath]: consumerEnvelope });
    const rebindNet = new NetworkManager();
    rebindNet.playerId = recipientId;
    rebindNet.dbRef = rebindMemory.dbRef;
    rebindNet.getServerNow = () => authorTime + 20_000;
    rebindNet._getDurableRewardRetryDelay = () => 100_000;
    let releaseOldConsumer;
    let markOldConsumerStarted;
    const oldConsumerStarted = new Promise((resolve) => { markOldConsumerStarted = resolve; });
    const oldConsumer = () => new Promise((resolve) => {
        markOldConsumerStarted();
        releaseOldConsumer = resolve;
    });
    rebindNet._normalRewardConsumer = oldConsumer;
    const rebindSnapshot = await rebindMemory.dbRef.child(consumerPath).once('value');
    const rebindContext = {
        generation: rebindNet._networkLifecycleGeneration,
        playerId: recipientId,
        dbRef: rebindNet.dbRef,
        legacyRewardPath: true,
        consumer: oldConsumer,
        consumerGeneration: rebindNet._normalRewardConsumerGeneration
    };
    const oldRebindConsume = rebindNet._consumeNormalRewardV2Snapshot(rebindSnapshot, rebindContext);
    await oldConsumerStarted;
    await rebindNet.setNormalRewardConsumer(async () => ({ ok: true }));
    assert.ok(rebindNet._normalRewardDrainTimer, 'consumer rebind must schedule a retry when the receipt is already in flight');
    releaseOldConsumer({ ok: true });
    await oldRebindConsume;
    assert.equal(rebindMemory.records.get(consumerPath).status, 'pending', 'the stale consumer must not acknowledge after rebind');
    rebindNet._clearNormalRewardRuntime({ clearConsumer: true });

    const abaMemory = createMemoryRewardDatabase({ [consumerPath]: consumerEnvelope });
    const abaNet = new NetworkManager();
    abaNet.playerId = recipientId;
    abaNet.dbRef = abaMemory.dbRef;
    abaNet.getServerNow = () => authorTime + 20_000;
    abaNet._getDurableRewardRetryDelay = () => 100_000;
    abaNet._normalRewardConsumer = async () => ({ ok: false });
    let releaseOldTimeGate;
    let releaseNewTimeGate;
    let timeGateCall = 0;
    abaNet._ensureDurableRewardServerTime = () => new Promise((resolve) => {
        timeGateCall += 1;
        if (timeGateCall === 1) releaseOldTimeGate = resolve;
        else releaseNewTimeGate = resolve;
    });
    abaNet._networkLifecycleGeneration = 1;
    const abaSnapshot = await abaMemory.dbRef.child(consumerPath).once('value');
    const oldContext = {
        generation: 1,
        playerId: recipientId,
        dbRef: abaNet.dbRef,
        legacyRewardPath: true,
        consumer: abaNet._normalRewardConsumer,
        consumerGeneration: abaNet._normalRewardConsumerGeneration
    };
    const oldConsume = abaNet._consumeNormalRewardV2Snapshot(abaSnapshot, oldContext);
    await Promise.resolve();
    abaNet._networkLifecycleGeneration = 2;
    abaNet._normalRewardInFlight.clear();
    const newContext = { ...oldContext, generation: 2 };
    const newConsume = abaNet._consumeNormalRewardV2Snapshot(abaSnapshot, newContext);
    await Promise.resolve();
    releaseOldTimeGate(true);
    await oldConsume;
    assert.equal(
        abaNet._normalRewardInFlight.has(receiptKey),
        true,
        'an old normal callback finally block must not clear a newer ABA in-flight token'
    );
    releaseNewTimeGate(true);
    await newConsume;
    assert.equal(abaMemory.records.get(consumerPath).status, 'pending', 'ABA callbacks must not acknowledge a failed consumer');
    abaNet._clearNormalRewardRuntime({ clearConsumer: true });
    consumerNet._clearNormalRewardRuntime({ clearConsumer: true });
    window.localStorage = previousLocalStorage;
}

async function validateMonsterDeathSettlementDurabilityContracts() {
    const previousGame = window.game;
    const fieldId = 'zone_2__party__death_settlement';
    let rewardAdmission = false;
    let dropAdmission = false;
    const authoredRewards = [];
    const authoredDrops = [];
    const makeNet = (playerId = 'death_host') => createEventBus({
        playerId,
        isHost: true,
        connected: true,
        onRemoteMonsterAdded(handler) { this.on('monsterAdded', handler); },
        onRemoteMonsterUpdated(handler) { this.on('monsterUpdated', handler); },
        onRemoteMonsterRemoved(handler) { this.on('monsterRemoved', handler); },
        onMonsterDamageReceived(handler) { this.on('monsterDamageReceived', handler); },
        onDropAdded(handler) { this.on('dropAdded', handler); },
        onDropRemoved(handler) { this.on('dropRemoved', handler); },
        onDropCollectionRequested(handler) { this.on('dropCollectionRequested', handler); },
        _getCurrentFieldId: () => fieldId,
        shouldUseMonsterQuietMode: () => false,
        isSharedFieldActive: () => true,
        sendReward: (recipientId, payload) => {
            authoredRewards.push({ recipientId, payload });
            return rewardAdmission;
        },
        spawnDrop: (payload) => {
            authoredDrops.push(payload);
            return payload.id;
        },
        isDropSpawnDurablyAccepted: () => dropAdmission,
        sendMonsterUpdate: async () => true,
        removeMonster: () => {},
        publishMinimapMonsterSnapshot: () => {},
        markQuestBossDefeated: () => false
    });
    const itemData = {
        getGlobalDrops: () => [],
        getBossDrops: () => [],
        getItemDefinition: (id) => ({
            id,
            name: id,
            stackable: true,
            dropRules: id === 'weapon_upgrade_stone' ? { blessedVariantChance: 0.5 } : {}
        }),
        createRewardItem: (id, options = {}) => ({ id, type: id, amount: options.amount || 1, name: id })
    };
    const definition = {
        id: 'emolga',
        name: 'Emolga',
        baseStats: { hp: 100, maxHp: 100, level: 8, exp: 30, manastone: { min: 10, max: 20 } },
        visual: { width: 80, height: 80 },
        drops: []
    };
    const makeGame = (net) => ({
        net,
        localPlayer: { id: net.playerId, level: 8, party: { members: [net.playerId] }, questData: {} },
        remotePlayers: new Map(),
        zone: { width: 3200, height: 3200, currentZone: { id: 'zone_2' } },
        monsterData: { loadDefinition: async () => definition },
        itemData,
        sceneManager: { currentScene: null }
    });

    const netA = makeNet();
    const gameA = makeGame(netA);
    window.game = gameA;
    const managerA = new MonsterManager(gameA);
    gameA.monsterManager = managerA;
    managerA.activeZoneId = 'zone_2';
    const pendingMonster = {
        id: 'dead_emolga_capacity',
        typeId: 'emolga',
        name: 'Emolga',
        x: 400,
        y: 500,
        hp: 0,
        maxHp: 100,
        width: 80,
        height: 80,
        isDead: true,
        isBoss: false,
        chargeOnly: false,
        lastAttackerId: 'reward_owner',
        damageContributors: new Set(['reward_owner', 'reward_ally']),
        damageContributorLevels: new Map([['reward_owner', 8], ['reward_ally', 7]]),
        definition,
        deathTimer: 10,
        deathDuration: 1
    };
    const retryReward = {
        rewardId: managerA._buildDeterministicRewardId(pendingMonster, 'reward_owner', 'normal_exp'),
        exp: 30
    };
    assert.equal(managerA._authorMonsterReward(pendingMonster, 'reward_owner', retryReward), false);
    const pendingDropIdentity = managerA._buildDeterministicMonsterDropIdentity(pendingMonster, 'manastone_0');
    assert.equal(managerA._authorMonsterDrop(pendingMonster, {
        id: pendingDropIdentity.id,
        sourceRewardId: pendingDropIdentity.sourceRewardId,
        fieldId,
        x: 400,
        y: 500,
        type: 'manastone',
        amount: 15,
        forceNetwork: true
    }), false);
    assert.equal(managerA._isMonsterDeathSettlementReady(pendingMonster), false, 'outbox saturation must hold the dead parent');

    const pendingPayload = managerA._buildMonsterSyncPayload(pendingMonster, { fullSync: true, immediate: true });
    assert.equal(pendingPayload.deathSettlementPending, true);
    assert.equal(pendingPayload.lastAttackerId, 'reward_owner');
    assert.deepEqual(pendingPayload.damageContributors.sort(), ['reward_ally', 'reward_owner']);
    const codecNet = new NetworkManager();
    const compactPending = codecNet._buildMonsterRealtimeCellPayload(pendingPayload);
    const decodedPending = codecNet._decorateMonsterCellPayload('0_0', compactPending);
    assert.equal(decodedPending.deathSettlementPending, true);
    assert.equal(decodedPending.lastAttackerId, 'reward_owner');
    let observedDropExpiryNow = null;
    netA.getServerNow = () => 55_000;
    netA._serverTimeOffsetReady = true;
    assert.equal(managerA._isDropExpired({
        isExpired(now) {
            observedDropExpiryNow = now;
            return now >= 60_000;
        }
    }), false);
    assert.equal(observedDropExpiryNow, 55_000, 'drop expiry must use corrected server time instead of the local OS clock');
    netA._serverTimeOffsetReady = false;
    netA.getServerNow = () => 9_999_999;
    assert.equal(managerA._isDropExpired({ isExpired: () => true }), false, 'drop expiry must pause until server offset is ready');

    const netB = makeNet('new_death_host');
    netB.readMonsterHostSnapshot = async () => ({
        [pendingMonster.id]: pendingPayload
    });
    const gameB = makeGame(netB);
    window.game = gameB;
    const managerB = new MonsterManager(gameB);
    gameB.monsterManager = managerB;
    managerB.activeZoneId = 'zone_2';
    await managerB.restoreAuthoritativeMonstersFromHostSnapshot({ force: true });
    const restoredDead = managerB.monsters.get(pendingMonster.id);
    assert.ok(restoredDead?.isDead, 'an unsettled dead normal monster must survive host snapshot restore');
    assert.equal(restoredDead.lastAttackerId, 'reward_owner');
    assert.deepEqual(Array.from(restoredDead.damageContributors).sort(), ['reward_ally', 'reward_owner']);

    rewardAdmission = true;
    dropAdmission = true;
    pendingMonster._nextDeathSettlementRetryAt = 0;
    assert.equal(managerA._retryPendingMonsterDeathSettlement(pendingMonster, 1000), true);
    assert.equal(managerA._isMonsterDeathSettlementReady(pendingMonster), true);

    const rollMonster = {
        ...pendingMonster,
        id: 'deterministic_optional_loot',
        isDead: true,
        drops: []
    };
    const rollSlot = 'normal_drop_0_optional_item';
    const missUnit = managerA._getDeterministicMonsterUnit(rollMonster, `${rollSlot}:chance`);
    rollMonster.drops = [{ itemId: 'optional_item', chance: Math.max(0, missUnit / 2), min: 1, max: 3 }];
    const rewardCountBeforeMiss = authoredRewards.length;
    assert.equal(managerA._grantMonsterItemDrops(rollMonster, 'reward_owner'), true);
    const hostBMissCountBefore = authoredRewards.length;
    assert.equal(managerB._grantMonsterItemDrops({
        ...rollMonster,
        damageContributors: new Set(rollMonster.damageContributors),
        damageContributorLevels: new Map(rollMonster.damageContributorLevels)
    }, 'reward_owner'), true);
    assert.equal(authoredRewards.length, rewardCountBeforeMiss);
    assert.equal(hostBMissCountBefore, rewardCountBeforeMiss, 'a deterministic miss must stay a miss after handoff');

    const deterministicStoneA = managerA._buildRewardItem('weapon_upgrade_stone', { min: 1, max: 3 }, {
        monster: rollMonster,
        recipientId: 'reward_owner',
        rollSlot: 'normal_drop_1_weapon_upgrade_stone'
    });
    const deterministicStoneB = managerB._buildRewardItem('weapon_upgrade_stone', { min: 1, max: 3 }, {
        monster: rollMonster,
        recipientId: 'reward_owner',
        rollSlot: 'normal_drop_1_weapon_upgrade_stone'
    });
    assert.deepEqual(deterministicStoneB, deterministicStoneA, 'variant and amount rolls must survive host handoff exactly');

    let releaseDefinition = null;
    const deferredDefinition = new Promise((resolve) => { releaseDefinition = resolve; });
    const childNet = makeNet('child_host');
    const childGame = makeGame(childNet);
    childGame.monsterData.loadDefinition = async () => deferredDefinition;
    window.game = childGame;
    const childManager = new MonsterManager(childGame);
    childGame.monsterManager = childManager;
    childManager.activeZoneId = 'zone_2';
    const childParent = {
        ...pendingMonster,
        id: 'king_parent_pending_child',
        typeId: 'king_slime',
        damageContributors: new Set(['reward_owner']),
        damageContributorLevels: new Map([['reward_owner', 8]])
    };
    const childId = childManager._buildDeterministicChildMonsterId(childParent, 'slime_split', 0);
    const childSpawn = childManager._authorMonsterChild(childParent, {
        x: 500,
        y: 600,
        type: 'slime_split',
        options: { instanceId: childId, chargeOnly: true }
    });
    await Promise.resolve();
    assert.equal(childManager._isMonsterDeathSettlementReady(childParent), false, 'parent removal must wait for child definition/network publication');
    childManager.worldGeneration += 1;
    releaseDefinition(definition);
    assert.equal(await childSpawn, false);
    assert.equal(childParent._pendingDeathChildOperations.has(childId), true, 'host loss during child load must leave a replayable deterministic operation');

    let questDefeatAdmission = false;
    childNet.markQuestBossDefeated = () => questDefeatAdmission;
    assert.equal(childManager._authorQuestBossDefeat(childParent), false);
    assert.equal(childManager._isMonsterDeathSettlementReady(childParent), false);
    questDefeatAdmission = true;
    assert.equal(childManager._authorQuestBossDefeat(childParent, childParent._pendingQuestBossDefeatOperation), true);

    window.game = previousGame;
}

async function validateDeterministicDropAndQuestBossContracts() {
    const previousStorage = window.localStorage;
    const previousFirebase = window.firebase;
    const previousGame = window.game;
    const storageRecords = new Map();
    const blockedStorageRemovals = new Set();
    window.localStorage = {
        getItem: (key) => storageRecords.get(key) ?? null,
        setItem: (key, value) => storageRecords.set(key, String(value)),
        removeItem: (key) => {
            if (blockedStorageRemovals.has(key)) throw new Error('simulated stale journal removal failure');
            storageRecords.delete(key);
        }
    };
    const activeDropStorage = window.localStorage;
    window.firebase = {};

    const fieldId = 'zone_2__party__drop_contract';
    const dropId = 'drop_deadbeef_cafebabe';
    const sourceRewardId = `monster_drop:${fieldId}:monster_1:manastone_0`;
    const dropMemory = createMemoryRewardDatabase();
    dropMemory.failNextTransactions(1);
    const dropAuthor = new NetworkManager();
    dropAuthor.playerId = 'drop_author';
    dropAuthor.connected = true;
    dropAuthor.isHost = true;
    dropAuthor.dbRef = dropMemory.dbRef;
    dropAuthor._getCurrentFieldId = () => fieldId;
    dropAuthor.getServerNow = () => 8_000_000;
    dropAuthor._serverTimeOffsetReady = true;
    dropAuthor._getDurableRewardRetryDelay = () => 100_000;
    const initialDropEpochSeal = { fieldId, worldEpoch: 0, fieldEpoch: 0 };
    const initialDropNamespace = dropAuthor._getDropNamespacePath(fieldId, initialDropEpochSeal);
    const dropPath = `${initialDropNamespace}/${dropId}`;
    assert.equal(dropAuthor.spawnDrop({
        id: dropId,
        sourceRewardId,
        x: 500,
        y: 600,
        type: 'manastone',
        amount: 75,
        ownerId: 'collector_a',
        eligibleCollectorIds: ['collector_a', 'collector_b'],
        forceNetwork: true
    }), dropId);
    for (let attempt = 0; attempt < 40 && dropMemory.transactionAttempts.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(dropMemory.records.has(dropPath), false);
    const failedSpawnEntry = dropAuthor._pendingDropSpawnWrites.get(dropId);
    assert.ok(failedSpawnEntry, 'a failed deterministic drop spawn must remain in its crash-persistent outbox');
    clearTimeout(failedSpawnEntry.timer);
    failedSpawnEntry.timer = null;
    const sealedDropStorageKey = dropAuthor._getDropSpawnOutboxStorageKey(dropAuthor.playerId);
    blockedStorageRemovals.add(sealedDropStorageKey);

    const restoredDropAuthor = new NetworkManager();
    restoredDropAuthor.playerId = dropAuthor.playerId;
    restoredDropAuthor.connected = true;
    restoredDropAuthor.isHost = true;
    restoredDropAuthor.dbRef = dropMemory.dbRef;
    restoredDropAuthor._getCurrentFieldId = () => fieldId;
    restoredDropAuthor.getServerNow = () => 8_031_100;
    restoredDropAuthor._serverTimeOffsetReady = true;
    restoredDropAuthor._getDurableRewardRetryDelay = () => 0;
    assert.equal(restoredDropAuthor._restoreDropSpawnOutbox(), 1);
    for (let attempt = 0; attempt < 40 && restoredDropAuthor._pendingDropSpawnWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(dropMemory.records.get(dropPath).sourceRewardId, sourceRewardId);
    assert.equal(dropMemory.records.get(dropPath).ts, 8_031_100, 'pickup lifetime must start at delayed server commit time');
    assert.equal(dropMemory.transactionAttempts.filter((path) => path === dropPath).length, 2);

    const makeDropHost = (playerId) => {
        const net = new NetworkManager();
        net.playerId = playerId;
        net.connected = true;
        net.isHost = true;
        net.dbRef = dropMemory.dbRef;
        net._getCurrentFieldId = () => fieldId;
        net.getServerNow = () => 8_001_000;
        net._serverTimeOffsetReady = true;
        net.shouldUseMonsterQuietMode = () => false;
        return net;
    };
    const dropHostA = makeDropHost('drop_host_a');
    const dropHostB = makeDropHost('drop_host_b');
    const [claimA, claimB] = await Promise.all([
        dropHostA.claimDropForSettlement(dropId, 'collector_a', {
            fieldId,
            dropWorldEpoch: 0,
            dropFieldEpoch: 0
        }),
        dropHostB.claimDropForSettlement(dropId, 'collector_b', {
            fieldId,
            dropWorldEpoch: 0,
            dropFieldEpoch: 0
        })
    ]);
    assert.equal(claimA.ok, true);
    assert.equal(claimB.ok, true);
    assert.equal(claimA.claimId, claimB.claimId);
    assert.equal(claimA.claimedBy, claimB.claimedBy, 'cross-recipient collection races must settle for one transaction winner');

    const authoredDropRewards = [];
    dropHostB.sendReward = (recipientId, payload) => {
        authoredDropRewards.push({ recipientId, payload });
        return true;
    };
    dropHostB.isRewardServerCommitted = () => true;
    const dropGame = {
        net: dropHostB,
        zone: { width: 3200, height: 3200, currentZone: { id: 'zone_2' } },
        monsterData: { loadDefinition: async () => null },
        remotePlayers: new Map(),
        sceneManager: { currentScene: null }
    };
    window.game = dropGame;
    const dropManager = new MonsterManager(dropGame);
    dropGame.monsterManager = dropManager;
    await dropManager._onDropAdded({ id: dropId, ...claimB.drop });
    for (let attempt = 0; attempt < 40 && dropMemory.records.get(dropPath)?.claimStatus !== 'settled'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(dropMemory.records.get(dropPath).claimStatus, 'settled', 'claimed-but-unsettled drops must be resumed by a new host');
    assert.deepEqual(
        authoredDropRewards.map(({ recipientId }) => recipientId).sort(),
        ['collector_a', 'collector_b']
    );
    assert.ok(authoredDropRewards.every(({ payload }) => payload.rewardId.startsWith(`drop_reward:${fieldId}:${dropId}:`)));

    const staleDropHost = makeDropHost('stale_drop_host');
    staleDropHost._getDurableRewardRetryDelay = () => 0;
    assert.equal(staleDropHost.spawnDrop({
        id: dropId,
        sourceRewardId,
        x: 900,
        y: 900,
        type: 'manastone',
        amount: 999,
        ownerId: 'collector_b',
        eligibleCollectorIds: ['collector_b'],
        forceNetwork: true
    }), dropId);
    for (let attempt = 0; attempt < 40 && staleDropHost._pendingDropSpawnWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(dropMemory.records.get(dropPath).claimStatus, 'settled');
    assert.equal(dropMemory.records.get(dropPath).amount, undefined, 'a stale host must not resurrect a settled deterministic drop');
    const staleClaim = await staleDropHost.claimDropForSettlement(dropId, 'collector_b', {
        fieldId,
        dropWorldEpoch: 0,
        dropFieldEpoch: 0
    });
    assert.equal(staleClaim.ok, false);
    assert.equal(
        await staleDropHost.finalizeDropSettlement(dropId, 'drop_claim_v1:wrong_claim', { fieldId }),
        false,
        'a mismatched claim must never be reported as finalized'
    );

    const postTombstoneNow = 8_001_000 + (32 * 24 * 60 * 60 * 1000);
    staleDropHost.getServerNow = () => postTombstoneNow;
    staleDropHost._lastDropSettlementPruneTs = 0;
    assert.equal(await staleDropHost._pruneSettledDropTombstones(), 1);
    assert.equal(dropMemory.records.has(dropPath), false);
    const dropTransactionsBeforeExpiredRestore = dropMemory.transactionAttempts
        .filter((path) => path === dropPath).length;
    const expiredDropAuthor = makeDropHost('drop_author');
    expiredDropAuthor.getServerNow = () => postTombstoneNow;
    expiredDropAuthor._getDurableRewardRetryDelay = () => 0;
    assert.equal(expiredDropAuthor._restoreDropSpawnOutbox(), 1);
    for (let attempt = 0; attempt < 40 && expiredDropAuthor._pendingDropSpawnWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(dropMemory.records.has(dropPath), false, 'an expired sealed journal must not resurrect after tombstone pruning');
    assert.equal(
        dropMemory.transactionAttempts.filter((path) => path === dropPath).length,
        dropTransactionsBeforeExpiredRestore + 1,
        'expired drop journals may perform only one terminal absence/tombstone transaction'
    );

    const unsealedAuthor = makeDropHost('unsealed_drop_author');
    const unsealedStorageKey = unsealedAuthor._getDropSpawnOutboxStorageKey(unsealedAuthor.playerId);
    storageRecords.set(unsealedStorageKey, JSON.stringify([{
        schemaVersion: 2,
        roomId: unsealedAuthor.roomId,
        authorHostId: unsealedAuthor.playerId,
        dropId: 'drop_unsealed_legacy',
        queuedAt: 1,
        authoredAt: 0,
        expiresAt: 0,
        payload: {
            fieldId,
            sourceRewardId: `${sourceRewardId}:unsealed`,
            x: 1,
            y: 1,
            type: 'manastone',
            amount: 1
        }
    }]));
    assert.equal(unsealedAuthor._restoreDropSpawnOutbox(), 0, 'pre-seal v2 journals must be terminally purged on reload');
    assert.equal(storageRecords.has(unsealedStorageKey), false);

    const sealFailureDisk = new Map();
    let sealFailureSetCount = 0;
    window.localStorage = {
        getItem: (key) => sealFailureDisk.get(key) ?? null,
        setItem: (key, value) => {
            sealFailureSetCount += 1;
            if (sealFailureSetCount === 1) throw new Error('simulated authoritative seal persistence failure');
            sealFailureDisk.set(key, String(value));
        },
        removeItem: (key) => sealFailureDisk.delete(key)
    };
    const sealFailureMemory = createMemoryRewardDatabase();
    const sealFailureAuthor = new NetworkManager();
    sealFailureAuthor.playerId = 'seal_failure_author';
    sealFailureAuthor.connected = true;
    sealFailureAuthor.isHost = true;
    sealFailureAuthor.dbRef = sealFailureMemory.dbRef;
    sealFailureAuthor._getCurrentFieldId = () => fieldId;
    sealFailureAuthor.getServerNow = () => 12_000_000;
    sealFailureAuthor._serverTimeOffsetReady = true;
    sealFailureAuthor._getDurableRewardRetryDelay = () => 100_000;
    const sealFailureDegradedReasons = [];
    sealFailureAuthor.on('dropDeliveryDegraded', (event) => {
        sealFailureDegradedReasons.push(event?.reason);
    });
    const sealFailureDropId = 'drop_seal_failure';
    const sealFailureSource = `${sourceRewardId}:seal_failure`;
    assert.equal(sealFailureAuthor.spawnDrop({
        id: sealFailureDropId,
        sourceRewardId: sealFailureSource,
        x: 1,
        y: 2,
        type: 'manastone',
        amount: 3,
        forceNetwork: true
    }), sealFailureDropId);
    for (let attempt = 0; attempt < 40 && sealFailureAuthor._pendingDropSpawnWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const sealFailurePath = `${sealFailureAuthor._getDropNamespacePath(fieldId, initialDropEpochSeal)}/${sealFailureDropId}`;
    assert.equal(sealFailureMemory.records.get(sealFailurePath)?.sourceRewardId, sealFailureSource);
    assert.equal(
        sealFailureAuthor.isDropSpawnDurablyAccepted(sealFailureDropId, sealFailureSource),
        true,
        'localStorage failure must degrade to a bounded volatile shared commit instead of deadlocking monster removal'
    );
    assert.deepEqual(sealFailureDegradedReasons, ['drop_outbox_storage_unavailable']);
    assert.equal(sealFailureDisk.size, 0, 'a volatile drop writer must not masquerade as crash-persisted');
    const sealFailureReload = new NetworkManager();
    sealFailureReload.playerId = sealFailureAuthor.playerId;
    sealFailureReload.connected = true;
    sealFailureReload.isHost = true;
    sealFailureReload.dbRef = sealFailureMemory.dbRef;
    sealFailureReload._getCurrentFieldId = () => fieldId;
    sealFailureReload.getServerNow = () => 12_000_100;
    sealFailureReload._serverTimeOffsetReady = true;
    assert.equal(sealFailureReload._restoreDropSpawnOutbox(), 0, 'a volatile shared commit must not create a false crash-persistent journal');

    window.localStorage = null;
    const unavailableDropMemory = createMemoryRewardDatabase();
    const unavailableDropAuthor = new NetworkManager();
    unavailableDropAuthor.playerId = 'unavailable_drop_author';
    unavailableDropAuthor.connected = true;
    unavailableDropAuthor.isHost = true;
    unavailableDropAuthor.dbRef = unavailableDropMemory.dbRef;
    unavailableDropAuthor._getCurrentFieldId = () => fieldId;
    unavailableDropAuthor.getServerNow = () => 12_100_000;
    unavailableDropAuthor._serverTimeOffsetReady = true;
    unavailableDropAuthor._getDurableRewardRetryDelay = () => 100_000;
    const unavailableDropReasons = [];
    unavailableDropAuthor.on('dropDeliveryDegraded', (event) => {
        unavailableDropReasons.push(event?.reason);
    });
    const unavailableDropId = 'drop_storage_unavailable';
    const unavailableDropSource = `${sourceRewardId}:storage_unavailable`;
    assert.equal(unavailableDropAuthor.spawnDrop({
        id: unavailableDropId,
        sourceRewardId: unavailableDropSource,
        x: 2,
        y: 3,
        type: 'manastone',
        amount: 4,
        forceNetwork: true
    }), unavailableDropId);
    for (let attempt = 0; attempt < 40 && unavailableDropAuthor._pendingDropSpawnWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const unavailableDropPath = `${unavailableDropAuthor._getDropNamespacePath(fieldId, initialDropEpochSeal)}/${unavailableDropId}`;
    assert.equal(unavailableDropMemory.records.get(unavailableDropPath)?.sourceRewardId, unavailableDropSource);
    assert.equal(unavailableDropAuthor.isDropSpawnDurablyAccepted(unavailableDropId, unavailableDropSource), true);
    assert.deepEqual(unavailableDropReasons, ['drop_outbox_storage_unavailable']);
    const unavailableDropReload = new NetworkManager();
    unavailableDropReload.playerId = unavailableDropAuthor.playerId;
    assert.equal(unavailableDropReload._restoreDropSpawnOutbox(), 0, 'absent localStorage must never invent a durable journal on reload');
    window.localStorage = activeDropStorage;

    const timestampToken = { '.sv': 'timestamp' };
    const databaseFunction = () => null;
    databaseFunction.ServerValue = { TIMESTAMP: timestampToken };
    window.firebase = { database: databaseFunction };
    const isDropEpochStatePath = (path) => path === 'drop_world_generation_v1'
        || path.startsWith('drop_field_epoch_v1/');
    const makeEmptyDropEpochStateRef = () => ({
        async once() {
            return { val: () => null };
        }
    });
    let releaseHangingTransaction = null;
    let hangingTransactionStarted = null;
    const hangingStarted = new Promise((resolve) => { hangingTransactionStarted = resolve; });
    const hangingGate = new Promise((resolve) => { releaseHangingTransaction = resolve; });
    let hangingCommitNow = 20_000_000;
    let hangingRecord = null;
    const hangingDbRef = {
        child(path) {
            if (isDropEpochStatePath(path)) return makeEmptyDropEpochStateRef();
            return {
                async transaction(update) {
                    const next = update(null);
                    hangingTransactionStarted();
                    await hangingGate;
                    hangingRecord = {
                        ...next,
                        ts: next?.ts === timestampToken ? hangingCommitNow : next?.ts
                    };
                    return {
                        committed: true,
                        snapshot: { val: () => ({ ...hangingRecord }) }
                    };
                }
            };
        }
    };
    const hangingAuthor = new NetworkManager();
    hangingAuthor.playerId = 'hanging_transaction_author';
    hangingAuthor.connected = true;
    hangingAuthor.isHost = true;
    hangingAuthor.dbRef = hangingDbRef;
    hangingAuthor._getCurrentFieldId = () => fieldId;
    hangingAuthor.getServerNow = () => 20_000_000;
    hangingAuthor._serverTimeOffsetReady = true;
    const hangingDropId = 'drop_hanging_transaction';
    assert.equal(hangingAuthor.spawnDrop({
        id: hangingDropId,
        sourceRewardId: `${sourceRewardId}:hanging`,
        x: 4,
        y: 5,
        type: 'manastone',
        amount: 6,
        forceNetwork: true
    }), hangingDropId);
    await hangingStarted;
    hangingCommitNow += 31_000;
    releaseHangingTransaction();
    for (let attempt = 0; attempt < 40 && hangingAuthor._pendingDropSpawnWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(hangingRecord.ts, hangingCommitNow, 'ServerValue timestamp must resolve when a long-pending transaction commits');

    let releaseExpiredTransaction = null;
    let expiredTransactionStarted = null;
    const expiredStarted = new Promise((resolve) => { expiredTransactionStarted = resolve; });
    const expiredGate = new Promise((resolve) => { releaseExpiredTransaction = resolve; });
    let expiredTransactionNow = 30_000_000;
    let expiredFirstCandidate = null;
    let expiredResumedCandidate = null;
    let expiredResurrectedRecord = null;
    const expiredDbRef = {
        child(path) {
            if (isDropEpochStatePath(path)) return makeEmptyDropEpochStateRef();
            return {
                async transaction(update) {
                    expiredFirstCandidate = update(null);
                    expiredTransactionStarted();
                    await expiredGate;
                    // Firebase re-runs transaction callbacks after reconnect
                    // against the latest value. By this point the 30-day source
                    // lease and the 31-day settled tombstone may both be gone.
                    expiredResumedCandidate = update(null);
                    if (expiredResumedCandidate !== undefined) {
                        expiredResurrectedRecord = {
                            ...expiredResumedCandidate,
                            ts: expiredResumedCandidate?.ts === timestampToken
                                ? expiredTransactionNow
                                : expiredResumedCandidate?.ts
                        };
                    }
                    return {
                        committed: expiredResumedCandidate !== undefined,
                        snapshot: { val: () => expiredResurrectedRecord }
                    };
                }
            };
        }
    };
    const expiredTransactionAuthor = new NetworkManager();
    expiredTransactionAuthor.playerId = 'expired_hanging_transaction_author';
    expiredTransactionAuthor.connected = true;
    expiredTransactionAuthor.isHost = true;
    expiredTransactionAuthor.dbRef = expiredDbRef;
    expiredTransactionAuthor._getCurrentFieldId = () => fieldId;
    expiredTransactionAuthor.getServerNow = () => expiredTransactionNow;
    expiredTransactionAuthor._serverTimeOffsetReady = true;
    const expiredHangingDropId = 'drop_expired_hanging_transaction';
    assert.equal(expiredTransactionAuthor.spawnDrop({
        id: expiredHangingDropId,
        sourceRewardId: `${sourceRewardId}:expired_hanging`,
        x: 7,
        y: 8,
        type: 'manastone',
        amount: 9,
        forceNetwork: true
    }), expiredHangingDropId);
    await expiredStarted;
    assert.ok(expiredFirstCandidate, 'the pre-expiry transaction may prepare a candidate while offline');
    expiredTransactionNow += 32 * 24 * 60 * 60 * 1000;
    releaseExpiredTransaction();
    for (let attempt = 0; attempt < 40 && expiredTransactionAuthor._pendingDropSpawnWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(
        expiredResumedCandidate,
        undefined,
        'a transaction callback re-run after the immutable authoring lease expires must abort'
    );
    assert.equal(expiredResurrectedRecord, null, 'a day-32 in-flight transaction must not resurrect a pruned drop');
    assert.equal(expiredTransactionAuthor._pendingDropSpawnWrites.size, 0);

    let releasePrecomputedTransaction = null;
    let precomputedTransactionStarted = null;
    const precomputedStarted = new Promise((resolve) => { precomputedTransactionStarted = resolve; });
    const precomputedGate = new Promise((resolve) => { releasePrecomputedTransaction = resolve; });
    let precomputedNow = 40_000_000;
    let precomputedRecord = null;
    let precomputedTransactionCount = 0;
    const precomputedDbRef = {
        child(path) {
            if (isDropEpochStatePath(path)) return makeEmptyDropEpochStateRef();
            return {
                async transaction(update) {
                    precomputedTransactionCount += 1;
                    if (precomputedTransactionCount === 1) {
                        // Model a transport that commits the callback result it
                        // prepared before disconnect without re-running it.
                        const candidate = update(null);
                        precomputedTransactionStarted();
                        await precomputedGate;
                        precomputedRecord = {
                            ...candidate,
                            ts: candidate?.ts === timestampToken ? precomputedNow : candidate?.ts
                        };
                        return {
                            committed: true,
                            snapshot: { val: () => ({ ...precomputedRecord }) }
                        };
                    }
                    const next = update(precomputedRecord);
                    if (next !== undefined) precomputedRecord = next;
                    return {
                        committed: next !== undefined,
                        snapshot: { val: () => precomputedRecord && ({ ...precomputedRecord }) }
                    };
                }
            };
        }
    };
    const precomputedAuthor = new NetworkManager();
    precomputedAuthor.playerId = 'precomputed_expiry_author';
    precomputedAuthor.connected = true;
    precomputedAuthor.isHost = true;
    precomputedAuthor.dbRef = precomputedDbRef;
    precomputedAuthor._getCurrentFieldId = () => fieldId;
    precomputedAuthor.getServerNow = () => precomputedNow;
    precomputedAuthor._serverTimeOffsetReady = true;
    const precomputedDropId = 'drop_precomputed_expiry_commit';
    assert.equal(precomputedAuthor.spawnDrop({
        id: precomputedDropId,
        sourceRewardId: `${sourceRewardId}:precomputed_expiry`,
        x: 10,
        y: 11,
        type: 'manastone',
        amount: 12,
        forceNetwork: true
    }), precomputedDropId);
    await precomputedStarted;
    precomputedNow += 32 * 24 * 60 * 60 * 1000;
    releasePrecomputedTransaction();
    for (let attempt = 0; attempt < 40 && precomputedAuthor._pendingDropSpawnWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(precomputedTransactionCount, 2, 'a late precomputed commit must be followed by one terminal tombstone transaction');
    assert.equal(precomputedRecord?.claimStatus, 'settled');
    assert.ok(precomputedRecord?.claimId?.startsWith('drop_expired_v1:'));
    assert.equal(precomputedRecord?.amount, undefined, 'post-await expiry sealing must remove all collectible payload fields');
    assert.equal(precomputedAuthor._pendingDropSpawnWrites.size, 0);
    window.firebase = {};

    const epochMemory = createMemoryRewardDatabase();
    const makeEpochHost = (playerId, now = 50_000_000) => {
        const net = new NetworkManager();
        net.playerId = playerId;
        net.connected = true;
        net.isHost = true;
        net.dbRef = epochMemory.dbRef;
        net._getCurrentFieldId = () => fieldId;
        net.getServerNow = () => now;
        net._serverTimeOffsetReady = true;
        net._getDurableRewardRetryDelay = () => 0;
        net.shouldUseMonsterQuietMode = () => false;
        return net;
    };
    const epochFieldEpochPath = `drop_field_epoch_v1/${dropAuthor._getDropFieldEpochKey(fieldId)}`;
    const epochDropId = 'drop_epoch_reusable';
    const epochSource = `${sourceRewardId}:epoch`;
    const epochHost = makeEpochHost('epoch_drop_author');
    assert.equal(epochHost.spawnDrop({
        id: epochDropId,
        sourceRewardId: epochSource,
        x: 12,
        y: 13,
        type: 'manastone',
        amount: 14,
        forceNetwork: true
    }), epochDropId);
    for (let attempt = 0; attempt < 40 && epochHost._pendingDropSpawnWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(epochHost.isDropSpawnDurablyAccepted(epochDropId, epochSource), true);
    const epoch0Path = `${epochHost._getDropNamespacePath(fieldId, { fieldId, worldEpoch: 0, fieldEpoch: 0 })}/${epochDropId}`;
    assert.equal(epochMemory.records.get(epoch0Path)?.dropFieldEpoch, 0);
    epochMemory.records.set(epochFieldEpochPath, {
        schemaVersion: 1,
        fieldId,
        epoch: 1,
        resetAt: 50_000_100,
        resetBy: 'test_reset'
    });
    await epochHost._readDropEpochSeal(fieldId);
    assert.equal(epochHost.isDropSpawnDurablyAccepted(epochDropId, epochSource), false, 'a field reset must invalidate epoch-scoped drop acceptance');
    epochHost.getServerNow = () => 50_000_200;
    assert.equal(epochHost.spawnDrop({
        id: epochDropId,
        sourceRewardId: epochSource,
        x: 15,
        y: 16,
        type: 'manastone',
        amount: 17,
        forceNetwork: true
    }), epochDropId);
    for (let attempt = 0; attempt < 40 && epochHost._pendingDropSpawnWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const epoch1Path = `${epochHost._getDropNamespacePath(fieldId, { fieldId, worldEpoch: 0, fieldEpoch: 1 })}/${epochDropId}`;
    assert.equal(epochMemory.records.get(epoch1Path)?.amount, 17, 'the same deterministic drop id may be reused only inside the new epoch namespace');
    assert.equal(epochMemory.records.get(epoch0Path)?.amount, 14);

    const cacheGuardHost = makeEpochHost('epoch_cache_guard');
    const newerSeal = cacheGuardHost._cacheDropEpochSeal({ fieldId, worldEpoch: 0, fieldEpoch: 2 });
    const olderSeal = cacheGuardHost._cacheDropEpochSeal({ fieldId, worldEpoch: 0, fieldEpoch: 1 });
    assert.deepEqual(olderSeal, newerSeal, 'late older epoch reads must not roll back the cached namespace');
    assert.deepEqual(cacheGuardHost._dropEpochSealCache.get(fieldId), newerSeal);

    const expiredVisibleHost = makeEpochHost('expired_visible_host', 60_031_000);
    epochMemory.records.set(epochFieldEpochPath, {
        schemaVersion: 1,
        fieldId,
        epoch: 1,
        resetAt: 50_000_100,
        resetBy: 'test_reset'
    });
    const visibleExpiredId = 'drop_visible_expired';
    const visibleExpiredPath = `${expiredVisibleHost._getDropNamespacePath(fieldId, { fieldId, worldEpoch: 0, fieldEpoch: 1 })}/${visibleExpiredId}`;
    epochMemory.records.set(visibleExpiredPath, {
        fieldId,
        sourceRewardId: `${sourceRewardId}:visible_expired`,
        x: 20,
        y: 21,
        type: 'manastone',
        amount: 22,
        ownerId: 'collector_a',
        eligibleCollectorIds: ['collector_a'],
        authoredAt: 60_000_000,
        expiresAt: 60_000_000 + (30 * 24 * 60 * 60 * 1000),
        dropWorldEpoch: 0,
        dropFieldEpoch: 1,
        ts: 60_000_000
    });
    const expiredVisibleClaim = await expiredVisibleHost.claimDropForSettlement(visibleExpiredId, 'collector_a', {
        fieldId,
        dropWorldEpoch: 0,
        dropFieldEpoch: 1
    });
    assert.equal(expiredVisibleClaim.ok, false);
    assert.equal(expiredVisibleClaim.terminal, true);
    assert.equal(epochMemory.records.get(visibleExpiredPath).claimStatus, 'settled', 'visible pickup expiry must seal a tombstone');
    assert.equal(epochMemory.records.get(visibleExpiredPath).amount, undefined, 'expired pickup tombstones must not keep collectible payload');

    const missingDropClaim = await expiredVisibleHost.claimDropForSettlement('drop_absent_claim', 'collector_a', {
        fieldId,
        dropWorldEpoch: 0,
        dropFieldEpoch: 1
    });
    assert.equal(missingDropClaim.ok, false);
    assert.equal(missingDropClaim.terminal, true);
    assert.equal(missingDropClaim.reason, 'drop_missing', 'missing drops must end collection retries terminally');

    const staleEpochClaim = await expiredVisibleHost.claimDropForSettlement(epochDropId, 'collector_a', {
        fieldId,
        dropWorldEpoch: 0,
        dropFieldEpoch: 0
    });
    assert.equal(staleEpochClaim.ok, false);
    assert.equal(staleEpochClaim.terminal, true);
    assert.equal(staleEpochClaim.reason, 'stale_drop_epoch');
    assert.equal(epochMemory.records.get(epoch1Path).claimStatus, undefined, 'stale collection requests must not claim same-id drops in the new epoch');

    const removeExpiredHost = makeEpochHost('remove_expired_host', 70_000_000);
    const removeExpiredId = 'drop_removed_by_expiry';
    const removeExpiredSource = `${sourceRewardId}:remove_expired`;
    const removeExpiredPath = `${removeExpiredHost._getDropNamespacePath(fieldId, { fieldId, worldEpoch: 0, fieldEpoch: 1 })}/${removeExpiredId}`;
    epochMemory.records.set(removeExpiredPath, {
        fieldId,
        sourceRewardId: removeExpiredSource,
        x: 24,
        y: 25,
        type: 'manastone',
        amount: 26,
        authoredAt: 69_000_000,
        expiresAt: 99_000_000,
        dropWorldEpoch: 0,
        dropFieldEpoch: 1,
        ts: 69_999_000
    });
    assert.equal(await removeExpiredHost.removeDrop(removeExpiredId, {
        expired: true,
        dropWorldEpoch: 0,
        dropFieldEpoch: 1
    }), true);
    assert.equal(epochMemory.records.get(removeExpiredPath).claimStatus, 'settled');
    assert.equal(epochMemory.records.get(removeExpiredPath).amount, undefined);
    assert.equal(removeExpiredHost.spawnDrop({
        id: removeExpiredId,
        sourceRewardId: removeExpiredSource,
        x: 26,
        y: 27,
        type: 'manastone',
        amount: 28,
        forceNetwork: true
    }), removeExpiredId);
    for (let attempt = 0; attempt < 40 && removeExpiredHost._pendingDropSpawnWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(epochMemory.records.get(removeExpiredPath).claimStatus, 'settled', 'stale sealed journals must not overwrite expired tombstones');
    assert.equal(epochMemory.records.get(removeExpiredPath).amount, undefined);

    const finalizeAfterResetHost = makeEpochHost('finalize_after_reset_host', 80_000_000);
    const finalizeOldId = 'drop_finalize_old_epoch';
    const finalizeOldClaimId = finalizeAfterResetHost._buildDropClaimId(finalizeOldId, fieldId, {
        fieldId,
        worldEpoch: 0,
        fieldEpoch: 1
    });
    const finalizeOldPath = `${finalizeAfterResetHost._getDropNamespacePath(fieldId, { fieldId, worldEpoch: 0, fieldEpoch: 1 })}/${finalizeOldId}`;
    epochMemory.records.set(finalizeOldPath, {
        fieldId,
        sourceRewardId: `${sourceRewardId}:finalize_old`,
        x: 30,
        y: 31,
        type: 'manastone',
        amount: 32,
        authoredAt: 79_000_000,
        expiresAt: 99_000_000,
        dropWorldEpoch: 0,
        dropFieldEpoch: 1,
        ts: 79_999_000,
        claimStatus: 'claimed',
        claimId: finalizeOldClaimId,
        claimedBy: 'collector_a',
        claimedAt: 79_999_100
    });
    epochMemory.records.set(epochFieldEpochPath, {
        schemaVersion: 1,
        fieldId,
        epoch: 2,
        resetAt: 80_000_000,
        resetBy: 'test_reset'
    });
    assert.equal(await finalizeAfterResetHost.finalizeDropSettlement(finalizeOldId, finalizeOldClaimId, {
        fieldId,
        dropWorldEpoch: 0,
        dropFieldEpoch: 1
    }), true, 'post-reward finalization against a superseded epoch must be terminally accepted');
    assert.equal(epochMemory.records.get(finalizeOldPath).claimStatus, 'settled');
    assert.equal(epochMemory.records.get(finalizeOldPath).amount, undefined);

    const collectFailureHost = new NetworkManager();
    collectFailureHost.playerId = 'collect_failure_player';
    collectFailureHost.connected = true;
    collectFailureHost.zoneParticipationEnabled = true;
    collectFailureHost.isHost = false;
    collectFailureHost._getCurrentFieldId = () => fieldId;
    collectFailureHost.dbRef = {
        child(path) {
            assert.equal(path, 'drop_collection');
            return {
                push() {
                    return Promise.reject(new Error('simulated drop collection push failure'));
                }
            };
        }
    };
    assert.equal(await collectFailureHost.collectDrop('drop_collect_push_failure', {
        dropWorldEpoch: 0,
        dropFieldEpoch: 2
    }), false, 'collection request push failures must surface as false so local pickup state can roll back');

    blockedStorageRemovals.delete(sealedDropStorageKey);
    storageRecords.delete(sealedDropStorageKey);

    const replayMemory = createMemoryRewardDatabase({
        'drop_collection/replay_drop_request': {
            did: 'drop_replay',
            cid: 'collector_replay',
            fieldId,
            dropWorldEpoch: 0,
            dropFieldEpoch: 0,
            ts: 1
        },
        'boss_spawn_requests/replay_boss_request': {
            requesterId: 'collector_replay',
            isFirstBoss: false,
            fieldId,
            ts: 2
        }
    });
    const replayHost = new NetworkManager();
    replayHost.playerId = 'replay_host';
    replayHost.connected = true;
    replayHost.isHost = true;
    replayHost.dbRef = replayMemory.dbRef;
    replayHost._getCurrentFieldId = () => fieldId;
    const replayedRequests = [];
    replayHost.on('dropCollectionRequested', (payload) => replayedRequests.push(['drop', payload.requestId]));
    replayHost.on('bossSpawnRequested', (payload) => replayedRequests.push(['boss', payload.requestId]));
    assert.equal(await replayHost._resumePendingHostRequests(fieldId), true);
    assert.deepEqual(replayedRequests.sort(), [
        ['boss', 'replay_boss_request'],
        ['drop', 'replay_drop_request']
    ]);

    const questFieldId = 'zone_1__party__quest_boss_contract';
    const questMemory = createMemoryRewardDatabase();
    const makeQuestHost = (playerId) => {
        const net = new NetworkManager();
        net.playerId = playerId;
        net.connected = true;
        net.isHost = true;
        net.dbRef = questMemory.dbRef;
        net._getCurrentFieldId = () => questFieldId;
        net.getServerNow = () => 9_000_000;
        net._serverTimeOffsetReady = true;
        net._getDurableRewardRetryDelay = () => 0;
        return net;
    };
    const questHostA = makeQuestHost('quest_host_a');
    const questHostB = makeQuestHost('quest_host_b');
    const [introClaimA, introClaimB] = await Promise.all([
        questHostA.claimQuestBossSpawn({ fieldId: questFieldId, isFirstBoss: true, requestId: 'request_a' }),
        questHostB.claimQuestBossSpawn({ fieldId: questFieldId, isFirstBoss: true, requestId: 'request_b' })
    ]);
    assert.equal(introClaimA.ok, true);
    assert.equal(introClaimB.ok, true);
    assert.equal(introClaimA.bossInstanceId, introClaimB.bossInstanceId, 'dual hosts must spawn one shared King Slime generation');
    assert.equal(introClaimA.cycle, 'intro');

    questMemory.failNextTransactions(1);
    questHostA._getDurableRewardRetryDelay = () => 100_000;
    assert.equal(
        questHostA.markQuestBossDefeated(introClaimA.bossInstanceId, { fieldId: questFieldId }),
        false,
        'browser-local defeat persistence must not release a dead King before the shared state commits'
    );
    const questStateKey = questHostA._getQuestBossStateKey(questFieldId);
    const resolvedQuestStatePath = `quest_boss_state_v1/${questStateKey}`;
    for (let attempt = 0; attempt < 40 && questMemory.transactionAttempts.filter((path) => path === resolvedQuestStatePath).length < 3; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const failedDefeatEntry = Array.from(questHostA._pendingQuestBossDefeatWrites.values())[0];
    assert.ok(failedDefeatEntry, 'a transient King Slime defeat marker failure must remain crash-persistent');
    clearTimeout(failedDefeatEntry.timer);
    failedDefeatEntry.timer = null;
    questHostA._pauseQuestBossDefeatOutbox();
    const questDefeatResume = makeQuestHost('quest_host_a');
    assert.equal(questDefeatResume._restoreQuestBossDefeatOutbox(), 1);
    for (let attempt = 0; attempt < 60 && questMemory.records.get(resolvedQuestStatePath)?.status !== 'defeated'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(questMemory.records.get(resolvedQuestStatePath).status, 'defeated');
    for (let attempt = 0; attempt < 60 && questDefeatResume._pendingQuestBossDefeatWrites.size > 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(questDefeatResume._pendingQuestBossDefeatWrites.size, 0);
    assert.equal(
        questDefeatResume.markQuestBossDefeated(introClaimA.bossInstanceId, { fieldId: questFieldId }),
        true,
        'the death gate may open only after this runtime observes the shared defeat commit'
    );

    const questOutboxCapacityHost = makeQuestHost('quest_capacity_host');
    for (let index = 0; index < 129; index += 1) {
        const capacityBossId = `quest_capacity_boss_${index}`;
        const capacityFieldId = `zone_1__party__quest_capacity_${index}`;
        const queueKey = `${questOutboxCapacityHost.playerId}:${capacityFieldId}:${capacityBossId}`;
        questOutboxCapacityHost._pendingQuestBossDefeatWrites.set(queueKey, {
            queueKey,
            authorHostId: questOutboxCapacityHost.playerId,
            fieldId: capacityFieldId,
            bossInstanceId: capacityBossId,
            defeatedAt: 9_000_000 + index,
            attempt: 0,
            timer: null,
            persisted: false
        });
    }
    assert.equal(
        questOutboxCapacityHost._persistQuestBossDefeatOutbox(questOutboxCapacityHost.playerId),
        false,
        'an over-capacity King defeat outbox must fail closed instead of silently truncating entries'
    );
    assert.equal(
        Array.from(questOutboxCapacityHost._pendingQuestBossDefeatWrites.values())
            .some((entry) => entry.persisted === true),
        false,
        'entries absent from browser storage must never be labelled crash-persistent'
    );
    questOutboxCapacityHost._pendingQuestBossDefeatWrites.clear();

    const repeatClaim = await questHostB.claimQuestBossSpawn({
        fieldId: questFieldId,
        isFirstBoss: true,
        requestId: 'reload_stale_intro_request'
    });
    assert.equal(repeatClaim.ok, true);
    assert.equal(repeatClaim.cycle, 'repeat', 'reload must not downgrade a repeat King Slime generation to intro');
    assert.notEqual(repeatClaim.bossInstanceId, introClaimA.bossInstanceId);

    questHostB.shouldUseMonsterQuietMode = () => true;
    const questGame = {
        net: questHostB,
        zone: { width: 3200, height: 3200, currentZone: { id: 'zone_1' } },
        monsterData: {
            loadDefinition: async () => ({
                id: 'king_slime',
                type: 'boss',
                isBoss: true,
                baseStats: { hp: 1500, maxHp: 1500 },
                visual: { width: 320, height: 320 }
            })
        },
        remotePlayers: new Map(),
        sceneManager: { currentScene: null }
    };
    window.game = questGame;
    const questManager = new MonsterManager(questGame);
    questGame.monsterManager = questManager;
    const restoredRepeatId = await questManager._spawnBoss(true);
    assert.equal(restoredRepeatId, repeatClaim.bossInstanceId);
    assert.equal(questManager.monsters.get(restoredRepeatId).bossCycle, 'repeat');
    assert.equal(!!questManager.monsters.get(restoredRepeatId).chargeOnly, false);

    const resetRaceFieldId = 'zone_1__party__quest_reset_epoch';
    const resetRaceMemory = createMemoryRewardDatabase();
    const resetRaceHost = new NetworkManager();
    resetRaceHost.playerId = 'quest_reset_host';
    resetRaceHost.connected = true;
    resetRaceHost.isHost = true;
    resetRaceHost.dbRef = resetRaceMemory.dbRef;
    resetRaceHost._getCurrentFieldId = () => resetRaceFieldId;
    resetRaceHost.getServerNow = () => 9_500_000;
    resetRaceHost._serverTimeOffsetReady = true;
    const beforeResetClaim = await resetRaceHost.claimQuestBossSpawn({
        fieldId: resetRaceFieldId,
        isFirstBoss: true
    });
    assert.equal(beforeResetClaim.ok, true);
    assert.equal(await resetRaceHost._resetQuestBossState(resetRaceFieldId), true);
    const afterResetClaim = await resetRaceHost.claimQuestBossSpawn({
        fieldId: resetRaceFieldId,
        isFirstBoss: true,
        preferredBossInstanceId: beforeResetClaim.bossInstanceId
    });
    assert.equal(afterResetClaim.ok, true);
    assert.notEqual(
        afterResetClaim.bossInstanceId,
        beforeResetClaim.bossInstanceId,
        'a reset epoch must produce a new semantic King Slime id and ignore stale preferred ids'
    );

    assert.equal(await resetRaceHost._resetQuestBossState(resetRaceFieldId), true);
    const resetRaceStatePath = `quest_boss_state_v1/${resetRaceHost._getQuestBossStateKey(resetRaceFieldId)}`;
    resetRaceMemory.beforeNextTransaction(async (path) => {
        assert.equal(path, resetRaceStatePath);
        assert.equal(await resetRaceHost._resetQuestBossState(resetRaceFieldId), true);
    });
    const interleavedResetClaim = await resetRaceHost.claimQuestBossSpawn({
        fieldId: resetRaceFieldId,
        isFirstBoss: true,
        preferredBossInstanceId: afterResetClaim.bossInstanceId
    });
    assert.equal(interleavedResetClaim.ok, true);
    assert.notEqual(interleavedResetClaim.bossInstanceId, afterResetClaim.bossInstanceId);
    assert.equal(
        interleavedResetClaim.state.resetEpoch,
        resetRaceMemory.records.get(resetRaceStatePath).resetEpoch,
        'claim/reset interleaving must serialize through the same quest-state transaction'
    );

    const absentStateMemory = createMemoryRewardDatabase();
    const absentStateHost = new NetworkManager();
    absentStateHost.playerId = 'quest_absent_state_host';
    absentStateHost.connected = true;
    absentStateHost.isHost = true;
    absentStateHost.dbRef = absentStateMemory.dbRef;
    absentStateHost._getCurrentFieldId = () => 'zone_1__party__quest_absent_state';
    absentStateHost.getServerNow = () => 9_600_000;
    absentStateHost._serverTimeOffsetReady = true;
    const absentPreferredClaim = await absentStateHost.claimQuestBossSpawn({
        fieldId: absentStateHost._getCurrentFieldId(),
        isFirstBoss: true,
        preferredBossInstanceId: beforeResetClaim.bossInstanceId
    });
    assert.equal(absentPreferredClaim.ok, true);
    assert.notEqual(
        absentPreferredClaim.bossInstanceId,
        beforeResetClaim.bossInstanceId,
        'an absent state must always use the deterministic epoch-derived id'
    );

    const burstMemory = createMemoryRewardDatabase();
    burstMemory.failNextTransactions(1000);
    const burstNet = new NetworkManager();
    burstNet.playerId = 'burst_host';
    burstNet.connected = true;
    burstNet.isHost = true;
    burstNet.dbRef = burstMemory.dbRef;
    burstNet._getCurrentFieldId = () => fieldId;
    burstNet.getServerNow = () => 10_000_000;
    burstNet._serverTimeOffsetReady = true;
    burstNet._getDurableRewardRetryDelay = () => 100_000;
    let acceptedBurstReceipts = 0;
    for (let death = 0; death < 20; death += 1) {
        for (let member = 0; member < 4; member += 1) {
            const recipientId = `party_member_${member}`;
            if (burstNet.sendReward(recipientId, {
                rewardId: `monster_reward:${fieldId}:aoe_${death}:${recipientId}:normal_exp`,
                exp: 10,
                immediate: true
            })) acceptedBurstReceipts += 1;
            if (burstNet.sendReward(recipientId, {
                rewardId: `monster_reward:${fieldId}:aoe_${death}:${recipientId}:quest`,
                questKill: 'slime',
                immediate: true
            })) acceptedBurstReceipts += 1;
        }
    }
    assert.equal(acceptedBurstReceipts, 160, 'four-player 20-death bursts must fit in the bounded crash-persistent receipt outbox');
    assert.equal(burstNet._pendingNormalRewardWrites.size, 160);

    dropManager.clearAll({ preserveNetwork: true });
    questManager.clearAll({ preserveNetwork: true });
    dropAuthor._pendingDropSpawnWrites.clear();
    restoredDropAuthor._pendingDropSpawnWrites.clear();
    staleDropHost._pendingDropSpawnWrites.clear();
    burstNet._clearNormalRewardRuntime({ clearConsumer: true });
    window.localStorage = previousStorage;
    window.firebase = previousFirebase;
    window.game = previousGame;
}

console.log('[runtime-integration] checking network contracts...');
await validateNetworkFieldAndBatchContracts();
console.log('[runtime-integration] checking monster generation...');
await validateMonsterGenerationAndContributors();
console.log('[runtime-integration] checking blocked handoff combat...');
await validateBlockedMonsterCombatContracts();
console.log('[runtime-integration] checking handoff marker fallback...');
await validateHostHandoffMarkerFallback();
console.log('[runtime-integration] checking field boss lifecycle...');
await validateFieldBossLifecycleContracts();
console.log('[runtime-integration] checking scene listener lifecycle...');
await validateWorldSceneListenerLifecycle();
console.log('[runtime-integration] checking reward dedupe...');
await validateRewardDedupe();
console.log('[runtime-integration] checking profile writer fencing...');
await validateProfileWriterFencingContracts();
console.log('[runtime-integration] checking durable boss rewards...');
await validateDurableBossRewardContracts();
console.log('[runtime-integration] checking durable normal rewards...');
await validateNormalRewardV2Contracts();
console.log('[runtime-integration] checking death-settlement durability...');
await validateMonsterDeathSettlementDurabilityContracts();
console.log('[runtime-integration] checking deterministic drop and quest boss settlements...');
await validateDeterministicDropAndQuestBossContracts();
console.log('[runtime-integration] OK: field, batch, reward, generation, host-migration, hydration, snapshot, and listener contracts.');
process.exit(0);
