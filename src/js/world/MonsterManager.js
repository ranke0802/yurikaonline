import Monster from '../entities/Monster.js';
import Logger from '../utils/Logger.js';

const REMOVED_DROP_ITEM_IDS = new Set(['slime_gel', 'potion_hp_small', 'royal_jelly', 'king_crown']);
const SLIME_CHARGE_DAMAGE = 10;

function isSlimeFamilyType(typeId) {
    return typeId === 'slime' || typeId === 'slime_split';
}

function applySlimeCombatOverrides(monster, typeId = monster?.typeId) {
    if (!monster) return;

    const normalizedTypeId = typeof typeId === 'string' ? typeId : monster.typeId;
    if (isSlimeFamilyType(normalizedTypeId)) {
        monster.chargeOnly = true;
        monster.chargeDamage = SLIME_CHARGE_DAMAGE;
        return;
    }

    if (normalizedTypeId === 'king_slime' && !Number.isFinite(monster.chargeDamage)) {
        monster.chargeDamage = 50;
    }
}

export default class MonsterManager {
    constructor(game) {
        this.game = game;
        this.net = game.net;
        this.zone = game.zone;
        this.monsters = new Map();
        this.drops = new Map();

        this.spawnTimer = 0;
        this.spawnInterval = 2.0; // v2.4.4: Target up to 2s respawn feel
        this.spawnRules = [];
        this.pendingSpawnGroups = new Map();
        this.spawnGroupNextAt = new Map();
        this.primedSpawnGroups = new Set();
        this.maxMonsters = 15;     // v1.97: Balanced (15)
        this.totalLevelSum = 1;
        this.tutorialMode = false;
        this.tutorialMonsterIds = new Set();

        // Bandwidth Optimization (v0.20.0)
        this.syncTimer = 0;
        this.syncInterval = 0.1; // Desktop baseline, adjusted dynamically per frame

        this.bossSpawned = false;
        this.shouldSpawnBoss = false;
        this.firstBossDefeated = false;
        this.firstBossPending = false;
        this.firstBossMissingTimer = 0;
        this.firstBossRestorePromise = null;
        this.slimeKillCount = 0; // v0.00.43: Track kills for boss spawn
        this.activeZoneId = 'zone_1';
        this.zoneBossRule = null;
        this.zoneBossSpawned = false;
        this.zoneBossSpawnPending = false;
        this.zoneBossRespawnAt = 0;
        this.zoneBossDefeatedAt = 0;
        this.zoneBossInstanceId = null;
        this._staleFieldBossMarker = null;
        this.worldGeneration = 0;

        // v2.4.6: Single-first progression keeps the first boss buildup local to the current session.

        this.lastSyncState = new Map();
        this.monsterRegionMap = new Map();
        this.monsterRevisionMap = new Map();
        this.peerMonsterKeyframeMeta = new Map();
        this.peerMonsterKeyframeCellMeta = new Map();
        this._pendingPeerMonsterKeyframeCells = new Set();
        this._peerMonsterKeyframeFlushTimer = null;
        this._peerMonsterKeyframeFlushDelayMs = 180;
        this._hostSnapshotRestorePromise = null;
        this._hostSnapshotRestoreFieldId = null;
        this._lastHostSnapshotRestoreTs = 0;
        this._hostFieldHandoffFieldId = null;
        this._hostFieldHandoffStartedAt = 0;
        this.hostFieldHandoffSettleMs = 650;
        this.hostFieldHandoffRefreshMs = 250;
        this.hostFieldHandoffRetryMs = 900;
        this.hostFieldHandoffMarkerFallbackMs = 8000;
        this._hostFieldHandoffPromise = null;
        this._hostFieldHandoffBlockedFieldId = null;
        this._hostFieldHandoffWaitForResidentPublish = false;
        this._fieldBossStateReadyFieldId = null;
        this._hostFieldHandoffRetryTimer = null;
        this._fieldBossStateRetryTimer = null;
        this._pendingFieldBossStateWrite = null;
        this._residentFieldPublishPromise = null;
        this._fieldDropHydrationPromise = null;
        this._fieldDropHydrationFieldId = null;
        this._pendingDropCollectionRequests = [];
        this._dropSettlementInFlight = new Map();
        this._dropSettlementRetryTimers = new Map();
        this._bossSpawnRequestInFlight = new Map();
        this._bossSpawnRequestRetryTimers = new Map();
        this.maxPendingDropCollectionRequests = 128;
        this._immediateDeathSettlementActive = false;
        this._guestSnapshotHydrationPending = null;
        this._guestSnapshotHydrationPromise = null;
        this._lastGuestSnapshotHydrationTs = 0;
        this.minimapSyncTimer = 0;
        this.minimapSyncInterval = 0.5;

        // Register Network Handlers
        this.net.onRemoteMonsterAdded(this._onRemoteMonsterAdded.bind(this));
        this.net.onRemoteMonsterUpdated(this._onRemoteMonsterUpdated.bind(this));
        this.net.onRemoteMonsterRemoved(this._onRemoteMonsterRemoved.bind(this));
        this.net.onMonsterDamageReceived(this._onMonsterDamageReceived.bind(this));
        this.net.onDropAdded(this._onDropAdded.bind(this));
        this.net.onDropRemoved(this._onDropRemoved.bind(this));
        this.net.onDropCollectionRequested(this._onDropCollectionRequested.bind(this));
        this.net.on('bossSpawnRequested', this._handleBossSpawnRequested.bind(this));
        this.net.on('fieldPeerPresenceChanged', this._handleFieldPeerPresenceChanged.bind(this));
        this.net.on('connected', () => {
            if (this.net?.isSharedFieldActive?.()) {
                this._scheduleGuestSnapshotHydration('connected', 500);
            }
        });
        this.net.on('hostChanged', (isHost) => {
            this._clearQueuedPeerMonsterKeyframes();
            if (isHost) {
                this.minimapSyncTimer = 0;
                const fieldId = this.net?._getCurrentFieldId?.() || null;
                if (!fieldId) return;
                this._hostFieldHandoffFieldId = fieldId;
                this._hostFieldHandoffStartedAt = this._getAuthoritativeNow();
                this._startHostFieldHandoff(fieldId, {
                    settleMs: this.net.isSharedFieldActive()
                        ? this.hostFieldHandoffRefreshMs
                        : 0,
                    publishWhenReady: this.net.isSharedFieldActive(),
                    waitForResidentPublish: false
                }).catch((error) => {
                    Logger.warn('[MonsterManager] Failed to restore state after host promotion', error);
                });
                return;
            }
            if (!isHost) {
                this._bossSpawnRequestRetryTimers.forEach((timer) => clearTimeout(timer));
                this._bossSpawnRequestRetryTimers.clear();
                this._hostFieldHandoffBlockedFieldId = null;
                if (this._hostFieldHandoffRetryTimer) {
                    clearTimeout(this._hostFieldHandoffRetryTimer);
                    this._hostFieldHandoffRetryTimer = null;
                }
                if (this._fieldBossStateRetryTimer) {
                    clearTimeout(this._fieldBossStateRetryTimer);
                    this._fieldBossStateRetryTimer = null;
                }
                this._pendingFieldBossStateWrite = null;
                this._fieldBossStateReadyFieldId = null;
                this._staleFieldBossMarker = null;
                this._hostFieldHandoffWaitForResidentPublish = false;
                this._scheduleGuestSnapshotHydration('host_changed', 450);
            }
        });
        this.net.on('sharedFieldChanged', ({ active }) => {
            if (active) {
                if (this.net.isHost) {
                    const fieldId = this.net?._getCurrentFieldId?.() || null;
                    const recentFieldHandoff = !!(
                        fieldId
                        && this._hostFieldHandoffFieldId === fieldId
                        && (this._getAuthoritativeNow() - Number(this._hostFieldHandoffStartedAt || 0)) < 10000
                    );
                    if (recentFieldHandoff) {
                        const preferredHostId = this.net?.preferredPartyHostId || null;
                        if (preferredHostId && preferredHostId !== this.net?.playerId) {
                            // This client was the quiet-mode resident host, but the
                            // arriving party host will win election after this event.
                            // Publish the resident world synchronously before yielding.
                            this._publishResidentFieldBeforeHostYield(fieldId);
                            return;
                        }
                        // The destination peer can become visible after fieldContextChanged.
                        // Let its former quiet-mode host publish first, then read the
                        // snapshot once more before this client publishes as host.
                        const pendingRestore = this._hostFieldHandoffPromise
                            ? Promise.resolve(this._hostFieldHandoffPromise).catch((error) => {
                                Logger.warn('[MonsterManager] Initial field handoff restore failed', error);
                            })
                            : Promise.resolve();
                        pendingRestore
                            .then(() => this._startHostFieldHandoff(fieldId, {
                                settleMs: this.hostFieldHandoffRefreshMs,
                                publishWhenReady: true,
                                waitForResidentPublish: true
                            }))
                            .catch((error) => {
                                Logger.warn('[MonsterManager] Late peer field handoff restore failed', error);
                            });
                        return;
                    }
                    // Leaving solo quiet mode needs one authoritative keyframe pass
                    // so late joiners immediately receive the current field population.
                    if (this._fieldBossStateReadyFieldId === fieldId) {
                        this._publishResidentFieldBeforeHostYield(fieldId);
                    }
                    return;
                }
                this._scheduleGuestSnapshotHydration('shared_field_join', 350);
                return;
            }
            // A resident marker only has meaning while another peer still shares
            // this field. If that peer disconnects during handoff, the next retry
            // must use strict snapshots directly instead of waiting forever.
            this._hostFieldHandoffWaitForResidentPublish = false;
            if (this.net.isHost) {
                this.lastSyncState.clear();
                this.peerMonsterKeyframeMeta.clear();
                this.peerMonsterKeyframeCellMeta.clear();
                this._clearQueuedPeerMonsterKeyframes();
                const fieldId = this.net?._getCurrentFieldId?.() || null;
                if (fieldId
                    && this._hostFieldHandoffBlockedFieldId === fieldId
                    && !this._hostFieldHandoffPromise) {
                    this._scheduleHostFieldHandoffRetry(fieldId);
                }
                return;
            }
            this.clearAll({ preserveNetwork: true });
            this._guestSnapshotHydrationPending = null;
            this._clearQueuedPeerMonsterKeyframes();
        });
        this.net.on('fieldContextChanged', ({ fieldId, previousFieldId } = {}) => {
            if (!fieldId || !previousFieldId || fieldId === previousFieldId) return;

            this._hostFieldHandoffFieldId = null;
            this._hostFieldHandoffStartedAt = 0;
            this._hostFieldHandoffBlockedFieldId = null;
            this._pendingDropCollectionRequests = [];
            this._fieldBossStateReadyFieldId = null;
            this._staleFieldBossMarker = null;
            this._hostFieldHandoffWaitForResidentPublish = false;
            if (this._fieldBossStateRetryTimer) {
                clearTimeout(this._fieldBossStateRetryTimer);
                this._fieldBossStateRetryTimer = null;
            }
            this._pendingFieldBossStateWrite = null;
            if (this._hostFieldHandoffRetryTimer) {
                clearTimeout(this._hostFieldHandoffRetryTimer);
                this._hostFieldHandoffRetryTimer = null;
            }
            this._clearQueuedPeerMonsterKeyframes();
            this.peerMonsterKeyframeMeta.clear();
            this.peerMonsterKeyframeCellMeta.clear();
            this.minimapSyncTimer = 0;

            if (this.net.isHost) {
                this.lastSyncState.clear();
                this._hostFieldHandoffFieldId = fieldId;
                this._hostFieldHandoffStartedAt = this._getAuthoritativeNow();
                const sharedFieldActive = this.net.isSharedFieldActive();
                // A host can remain host while moving between party fields, so
                // hostChanged(true) is not guaranteed to fire. Even if the peer
                // presence is late, hold simulation briefly so its former quiet-mode
                // host can publish an authoritative destination snapshot.
                this._startHostFieldHandoff(fieldId, {
                    settleMs: sharedFieldActive
                        ? this.hostFieldHandoffRefreshMs
                        : this.hostFieldHandoffSettleMs,
                    publishWhenReady: sharedFieldActive,
                    waitForResidentPublish: sharedFieldActive
                }).catch((error) => {
                    Logger.warn('[MonsterManager] Failed to restore the destination field state', error);
                });
                return;
            }

            this.clearAll({ preserveNetwork: true });
            this._guestSnapshotHydrationPending = null;
            this._guestSnapshotHydrationPromise = null;
            this.hydrateFieldDropsFromSnapshot({ force: true, replaceExisting: true })
                .catch((error) => Logger.warn('[MonsterManager] Failed to hydrate destination field drops', error));
            if (this.net.isSharedFieldActive()) {
                this._scheduleGuestSnapshotHydration('field_changed', 250);
            }
        });

        // v0.00.24: Increased for smoother sync
        this.viewMargin = 500;
    }

    _isHostFieldStateBlocked() {
        if (!this.net?.isHost) return false;
        const fieldId = this.net?._getCurrentFieldId?.() || null;
        return !!(
            this._hostSnapshotRestorePromise
            || this._hostFieldHandoffPromise
            || (fieldId && this._hostFieldHandoffBlockedFieldId === fieldId)
        );
    }

    isMonsterCombatBlocked() {
        return this._isHostFieldStateBlocked();
    }

    _scheduleHostFieldHandoffRetry(fieldId) {
        if (!fieldId || this._hostFieldHandoffRetryTimer) return;
        this._hostFieldHandoffRetryTimer = setTimeout(() => {
            this._hostFieldHandoffRetryTimer = null;
            if (!this.net?.isHost || fieldId !== this.net?._getCurrentFieldId?.()) {
                if (this._hostFieldHandoffBlockedFieldId === fieldId) {
                    this._hostFieldHandoffBlockedFieldId = null;
                }
                return;
            }
            this._startHostFieldHandoff(fieldId, {
                settleMs: this.hostFieldHandoffRefreshMs,
                publishWhenReady: this.net.isSharedFieldActive(),
                waitForResidentPublish: this._hostFieldHandoffWaitForResidentPublish
                    && this.net.isSharedFieldActive()
            }).catch((error) => {
                Logger.warn(`[MonsterManager] Retrying field handoff for ${fieldId} failed`, error);
            });
        }, Math.max(0, Number(this.hostFieldHandoffRetryMs ?? 900)));
    }

    _shouldWaitForResidentFieldPublish(fieldId, requested) {
        if (!requested || !this.net?.isSharedFieldActive?.()) return false;
        if (!fieldId || fieldId !== this.net?._getCurrentFieldId?.()) return false;

        const startedAt = Math.max(0, Number(this._hostFieldHandoffStartedAt || 0));
        const fallbackMs = Math.max(0, Number(this.hostFieldHandoffMarkerFallbackMs ?? 8000));
        if (startedAt > 0 && (this._getAuthoritativeNow() - startedAt) >= fallbackMs) {
            return false;
        }
        return true;
    }

    _startHostFieldHandoff(fieldId, options = {}) {
        if (!this.net?.isHost || !fieldId || fieldId !== this.net?._getCurrentFieldId?.()) {
            return Promise.resolve(false);
        }
        if (this._hostFieldHandoffPromise) return this._hostFieldHandoffPromise;

        const generation = this.worldGeneration;
        const waitForResidentPublish = this._shouldWaitForResidentFieldPublish(
            fieldId,
            !!options.waitForResidentPublish
        );
        if (options.waitForResidentPublish && !waitForResidentPublish && this.net.isSharedFieldActive()) {
            Logger.warn(`[MonsterManager] Resident handoff marker timed out for ${fieldId}; falling back to strict snapshots.`);
        }
        this._hostFieldHandoffWaitForResidentPublish = waitForResidentPublish;
        this._hostFieldHandoffBlockedFieldId = fieldId;
        const restorePromise = (async () => {
            if (waitForResidentPublish
                && typeof this.net?.waitForFieldHandoffReady === 'function') {
                const ready = await this.net.waitForFieldHandoffReady({
                    fieldId,
                    since: Number(this._hostFieldHandoffStartedAt || this._getAuthoritativeNow()),
                    timeoutMs: 1600,
                    throwOnError: true
                });
                if (!ready) throw new Error(`Timed out waiting for the resident host to publish ${fieldId}.`);
            }
            return Promise.all([
                this.restoreAuthoritativeMonstersFromHostSnapshot({
                    force: true,
                    settleMs: options.settleMs,
                    throwOnReadError: true,
                    readAttempts: 2
                }),
                this.hydrateFieldDropsFromSnapshot({
                    force: true,
                    replaceExisting: true,
                    settleMs: options.settleMs,
                    throwOnReadError: true,
                    readAttempts: 2
                }),
                this.restoreFieldBossStateFromSnapshot({
                    settleMs: options.settleMs,
                    throwOnReadError: true,
                    readAttempts: 2
                })
            ]);
        })();
        const handoffPromise = restorePromise.then(async ([, , bossStateResult]) => {
            const current = generation === this.worldGeneration
                && this.net?.isHost
                && fieldId === this.net?._getCurrentFieldId?.();
            if (!current) return false;
            this._hostFieldHandoffWaitForResidentPublish = false;
            this._fieldBossStateReadyFieldId = fieldId;
            this._applyAuthoritativeFieldBossState(bossStateResult?.state, {
                generation,
                fieldId
            });
            if (options.publishWhenReady && this.net.isSharedFieldActive()) {
                return this._publishHostWorldAfterSnapshotRestore(fieldId);
            }
            this._hostFieldHandoffBlockedFieldId = null;
            this._flushPendingDropCollectionRequests({ allowCurrentHandoff: true });
            return true;
        }).catch((error) => {
            if (generation === this.worldGeneration
                && this.net?.isHost
                && fieldId === this.net?._getCurrentFieldId?.()) {
                this._hostFieldHandoffBlockedFieldId = fieldId;
                this._scheduleHostFieldHandoffRetry(fieldId);
            }
            throw error;
        }).finally(() => {
            if (this._hostFieldHandoffPromise === handoffPromise) {
                this._hostFieldHandoffPromise = null;
            }
        });

        this._hostFieldHandoffPromise = handoffPromise;
        return handoffPromise;
    }

    restoreAuthoritativeFieldState(options = {}) {
        if (!this.net?.isHost) return Promise.resolve(false);
        const fieldId = options.fieldId || this.net?._getCurrentFieldId?.() || null;
        if (!fieldId) return Promise.resolve(false);
        this._hostFieldHandoffFieldId = fieldId;
        this._hostFieldHandoffStartedAt = this._getAuthoritativeNow();
        return this._startHostFieldHandoff(fieldId, {
            settleMs: Number.isFinite(options.settleMs) ? options.settleMs : 0,
            publishWhenReady: options.publishWhenReady ?? this.net.isSharedFieldActive(),
            waitForResidentPublish: options.waitForResidentPublish ?? this.net.isSharedFieldActive()
        });
    }

    _publishResidentFieldBeforeHostYield(fieldId) {
        if (!fieldId || this._residentFieldPublishPromise) return this._residentFieldPublishPromise;
        const generation = this.worldGeneration;
        this._hostFieldHandoffBlockedFieldId = fieldId;
        this.lastSyncState.clear();
        const publishPromise = Promise.all([
            this.forceSyncAll({ includeDead: true }),
            this.forceSyncAllDrops(),
            this._publishZoneBossFieldState(),
            this.net?.flushPendingMonsterRemovalWrites?.({ fieldId }) ?? true
        ]).then(async ([monsterWrites, dropWrites, bossStateWritten, removalsFlushed]) => {
            const monstersWritten = (monsterWrites || []).every((result) => result !== false);
            const dropsWritten = (dropWrites || []).every((result) => result !== false);
            const hasBossLifecycle = this.zoneBossDefeatedAt > 0
                || Array.from(this.monsters.values()).some((monster) => (
                    monster?.typeId === this.zoneBossRule?.monsterId && !monster.isDead
                ));
            if (!monstersWritten
                || !dropsWritten
                || removalsFlushed !== true
                || (hasBossLifecycle && bossStateWritten !== true)) {
                throw new Error(`Resident field publication for ${fieldId} did not complete.`);
            }
            const readyPublished = await (this.net?.publishFieldHandoffReady?.({ fieldId }) ?? true);
            if (readyPublished !== true) {
                throw new Error(`Resident handoff readiness for ${fieldId} was not persisted.`);
            }
            return true;
        }).catch((error) => {
            Logger.warn('[MonsterManager] Failed to publish resident field before host yield', error);
            return false;
        }).finally(() => {
            if (this._residentFieldPublishPromise === publishPromise) {
                this._residentFieldPublishPromise = null;
            }
            if (generation !== this.worldGeneration || fieldId !== this.net?._getCurrentFieldId?.()) return;
            if (this._hostFieldHandoffFieldId === fieldId) {
                this._hostFieldHandoffFieldId = null;
                this._hostFieldHandoffStartedAt = 0;
            }
            this._hostFieldHandoffBlockedFieldId = null;
            this.net.publishMinimapMonsterSnapshot(this.monsters, { force: true });
            this._flushPendingDropCollectionRequests({ allowCurrentHandoff: true });
        });
        this._residentFieldPublishPromise = publishPromise;
        return publishPromise;
    }

    async _publishHostWorldAfterSnapshotRestore(fieldId) {
        if (!this.net.isHost || fieldId !== this.net?._getCurrentFieldId?.()) return false;
        if (this._fieldDropHydrationPromise && this._fieldDropHydrationFieldId === fieldId) {
            await this._fieldDropHydrationPromise;
        }
        this.resetCombatTargets({ clearChargeState: true });
        this.lastSyncState.clear();
        await this.forceSyncAll();
        if (!this.net.isHost || fieldId !== this.net?._getCurrentFieldId?.()) return false;
        await Promise.all([
            this.forceSyncAllDrops(),
            this._publishZoneBossFieldState()
        ]);
        this.net.publishMinimapMonsterSnapshot(this.monsters, { force: true });
        if (this._hostFieldHandoffFieldId === fieldId) {
            this._hostFieldHandoffFieldId = null;
            this._hostFieldHandoffStartedAt = 0;
        }
        this._hostFieldHandoffBlockedFieldId = null;
        this._flushPendingDropCollectionRequests({ allowCurrentHandoff: true });
        return true;
    }

    /**
     * v0.00.22: Check if entity is on-screen
     */
    isOnScreen(entity) {
        if (!entity || !this.game.camera) return true;
        const cam = this.game.camera;
        const canvas = this.game.canvas;
        const vw = (canvas.width / this.game.dpr) / this.game.zoom;
        const vh = (canvas.height / this.game.dpr) / this.game.zoom;
        const margin = this.viewMargin;

        const ex = entity.x + (entity.width || 0) / 2;
        const ey = entity.y + (entity.height || 0) / 2;

        return ex >= cam.x - margin && ex <= cam.x + vw + margin &&
            ey >= cam.y - margin && ey <= cam.y + vh + margin;
    }

    _normalizePartyMembers(members) {
        return Array.from(new Set((members || []).filter(Boolean)));
    }

    _getPartyMembersForPlayer(uid) {
        if (!uid) return [];
        if (uid === this.net.playerId) {
            return this._normalizePartyMembers(window.game?.localPlayer?.party?.members || [uid]);
        }

        const remote = this.net.remotePlayers.get(uid) || this.game.remotePlayers?.get(uid);
        return this._normalizePartyMembers(remote?.party?.members || [uid]);
    }

    _getLivePlayerRewardLevel(uid) {
        if (!uid) return null;
        if (uid === this.net?.playerId) {
            const localLevel = Number(this.game?.localPlayer?.level);
            return Number.isFinite(localLevel) && localLevel >= 1
                ? Math.max(1, Math.min(999, Math.floor(localLevel)))
                : null;
        }
        const scenePlayer = this.game?.sceneManager?.currentScene?.remotePlayers?.get?.(uid);
        const networkPlayer = this.net?.remotePlayers?.get?.(uid);
        const gamePlayer = this.game?.remotePlayers?.get?.(uid);
        const remoteLevels = [scenePlayer?.level, networkPlayer?.level, gamePlayer?.level]
            .map((level) => Number(level))
            .filter((level) => Number.isFinite(level) && level >= 1)
            .map((level) => Math.max(1, Math.min(999, Math.floor(level))));
        return remoteLevels.length > 0 ? Math.max(...remoteLevels) : null;
    }

    _getMonsterContributorLevel(monster, uid) {
        if (!uid || !(monster?.damageContributorLevels instanceof Map)) return null;
        const level = Number(monster.damageContributorLevels.get(uid));
        return Number.isFinite(level) && level >= 1
            ? Math.max(1, Math.min(999, Math.floor(level)))
            : null;
    }

    _captureMonsterContributorLevel(monster, uid, reportedLevel = null) {
        if (!monster || !uid) return null;
        if (!(monster.damageContributorLevels instanceof Map)) {
            monster.damageContributorLevels = new Map();
        }
        const liveLevel = this._getLivePlayerRewardLevel(uid);
        const reported = Number(reportedLevel);
        const previousLevel = this._getMonsterContributorLevel(monster, uid) || 0;
        const validLevels = [previousLevel, liveLevel, reported]
            .filter((level) => Number.isFinite(level) && level >= 1)
            .map((level) => Math.max(1, Math.min(999, Math.floor(level))));
        if (validLevels.length === 0) return null;

        const safeLevel = Math.max(...validLevels);
        monster.damageContributorLevels.set(uid, safeLevel);
        return safeLevel;
    }

    _getPlayerRewardLevel(uid, monster = null) {
        const validLevels = [
            this._getLivePlayerRewardLevel(uid),
            this._getMonsterContributorLevel(monster, uid)
        ].filter((level) => Number.isFinite(level) && level >= 1);
        return validLevels.length > 0 ? Math.max(...validLevels) : 1;
    }

    _getOverlevelExpMultiplier(playerLevel, monsterLevel) {
        const gap = Math.max(0, Number(playerLevel || 1) - Math.max(1, Number(monsterLevel || 1)));
        if (gap <= 3) return 1;
        if (gap <= 5) return 0.75;
        if (gap <= 8) return 0.5;
        if (gap <= 12) return 0.25;
        return 0.1;
    }

    _buildDeterministicMonsterSeed(monster, slot, recipientId = '') {
        if (!monster?.id || !slot) return null;
        const fieldId = this.net?._getCurrentFieldId?.() || this.activeZoneId || 'field';
        return `monster_seed_v1:${fieldId}:${monster.id}:${monster.typeId || 'monster'}:${slot}:${recipientId || ''}`;
    }

    _hashDeterministicMonsterSeed(seed) {
        const networkHash = this.net?._hashDurableRewardCatalogValue?.(seed);
        if (typeof networkHash === 'string' && /[0-9a-f]{8}$/i.test(networkHash)) {
            return Number.parseInt(networkHash.slice(-8), 16) >>> 0;
        }
        let hash = 0x811c9dc5;
        const source = String(seed || 'monster_seed_v1');
        for (let index = 0; index < source.length; index += 1) {
            hash ^= source.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return hash >>> 0;
    }

    _getDeterministicMonsterUnit(monster, slot, recipientId = '') {
        const seed = this._buildDeterministicMonsterSeed(monster, slot, recipientId);
        return this._hashDeterministicMonsterSeed(seed) / 0x100000000;
    }

    _buildDeterministicMonsterInstanceId(monster, slot, recipientId = '') {
        const seed = this._buildDeterministicMonsterSeed(monster, slot, recipientId);
        if (!seed) return null;
        const primary = this._hashDeterministicMonsterSeed(seed).toString(16).padStart(8, '0');
        const secondary = this._hashDeterministicMonsterSeed(`instance:${seed}`).toString(16).padStart(8, '0');
        return `loot_${primary}_${secondary}`;
    }

    _buildDeterministicChildMonsterId(monster, typeId, index) {
        const instanceId = this._buildDeterministicMonsterInstanceId(
            monster,
            `child_${typeId}_${index}`
        );
        return instanceId ? instanceId.replace(/^loot_/, 'mob_child_') : null;
    }

    _getMonsterManastoneReward(monster) {
        const randomUnit = this._getDeterministicMonsterUnit(monster, 'manastone_amount');
        const configured = monster?.definition?.baseStats?.manastone;
        if (Number.isFinite(configured)) return Math.max(0, Math.floor(configured));
        if (configured && typeof configured === 'object') {
            const min = Math.max(0, Math.floor(Number(configured.min || 0)));
            const max = Math.max(min, Math.floor(Number(configured.max ?? min)));
            return min + Math.floor(randomUnit * (max - min + 1));
        }
        const drop = (monster?.drops || []).find((entry) => entry?.itemId === 'manastone');
        if (drop) {
            const min = Math.max(0, Math.floor(Number(drop.min || drop.quantity || 0)));
            const max = Math.max(min, Math.floor(Number(drop.max ?? min)));
            return min + Math.floor(randomUnit * (max - min + 1));
        }
        if (monster?.typeId === 'king_slime') return 2000;
        if (monster?.isBoss) return 5000;
        return isSlimeFamilyType(monster?.typeId) ? 15 + Math.floor(randomUnit * 16) : 50;
    }

    _getSharedIntroQuestRecipients(uid) {
        if (!uid || !this.net?.isSharedFieldActive?.()) return [];
        const partyMembers = this._getPartyMembersForPlayer(uid);
        if (partyMembers.length < 2) return [];
        return partyMembers.filter((memberId) => {
            if (!memberId) return false;
            if (memberId === this.net.playerId) return true;
            return !!(this.net?.remotePlayers?.has?.(memberId) || this.game?.remotePlayers?.has?.(memberId));
        });
    }

    _buildRewardItem(itemId, dropDef = {}, context = {}) {
        if (REMOVED_DROP_ITEM_IDS.has(itemId)) return null;
        const rollSlot = context.rollSlot || `item_${itemId}`;
        const recipientId = context.recipientId || '';
        const rollUnit = (suffix) => this._getDeterministicMonsterUnit(
            context.monster,
            `${rollSlot}:${suffix}`,
            recipientId
        );
        const itemData = this.game.itemData;
        if (itemData) {
            const sourceDefinition = itemData.getItemDefinition(itemId);
            const blessedVariantChance = itemId === 'weapon_upgrade_stone'
                ? Math.max(0, Math.min(1, sourceDefinition?.dropRules?.blessedVariantChance ?? 0))
                : 0;
            const resolvedItemId = blessedVariantChance > 0 && rollUnit('blessed_variant') < blessedVariantChance
                ? 'blessed_weapon_upgrade_stone'
                : itemId;
            const minAmount = Math.max(1, dropDef.min || dropDef.quantity || 1);
            const maxAmount = Math.max(minAmount, dropDef.max || minAmount);
            const amount = Math.floor(rollUnit('amount') * (maxAmount - minAmount + 1)) + minAmount;
            const resolvedDefinition = itemData.getItemDefinition(resolvedItemId);
            const createOptions = {
                amount,
                monsterId: context.monster?.typeId || null,
                instanceId: this._buildDeterministicMonsterInstanceId(
                    context.monster,
                    `${rollSlot}:${resolvedItemId}`,
                    recipientId
                )
            };
            if (resolvedDefinition?.stackable === false) {
                const affixes = itemData.getAffixPool?.(resolvedDefinition.prefixPool)?.affixes || [];
                if (affixes.length > 0) {
                    const affixIndex = Math.min(
                        affixes.length - 1,
                        Math.floor(rollUnit(`affix:${resolvedItemId}`) * affixes.length)
                    );
                    createOptions.prefixId = affixes[affixIndex]?.id || null;
                }
            }
            return itemData.createRewardItem(resolvedItemId, createOptions);
        }

        const itemMeta = {
            slime_gel: { name: '슬라임 젤', icon: '🟢' },
            potion_hp_small: { name: '소형 HP 포션', icon: '🧪' },
            royal_jelly: { name: '로열 젤리', icon: '🍯' },
            king_crown: { name: '킹 크라운', icon: '👑' },
            weapon_upgrade_stone: { name: '무기 강화석', icon: '💎' },
            blessed_weapon_upgrade_stone: { name: '축복받은 무기 강화석', icon: '💎' }
        };

        const fallback = itemMeta[itemId] || { name: itemId, icon: '🎁' };
        const minAmount = Math.max(1, dropDef.min || 1);
        const maxAmount = Math.max(minAmount, dropDef.max || minAmount);
        return {
            id: itemId,
            type: itemId,
            amount: Math.floor(rollUnit('amount') * (maxAmount - minAmount + 1)) + minAmount,
            name: fallback.name,
            icon: fallback.icon
        };
    }

    _isGroundLootItem(itemId) {
        return itemId === 'weapon_upgrade_stone' || itemId === 'blessed_weapon_upgrade_stone';
    }

    _buildDeterministicRewardId(monster, recipientId, rewardKind) {
        if (!monster?.id || !recipientId || !rewardKind) return null;
        const fieldId = this.net?._getCurrentFieldId?.() || this.activeZoneId || 'field';
        const rewardId = `monster_reward:${fieldId}:${monster.id}:${recipientId}:${rewardKind}`;
        if (rewardId.length <= 256) return rewardId;
        const hash = this.net?._hashDurableRewardCatalogValue?.(rewardId);
        return hash ? `monster_reward:${hash}:${recipientId.slice(0, 96)}:${rewardKind.slice(0, 48)}` : null;
    }

    _buildDeterministicDropRewardId(dropId, recipientId, rewardKind, fieldId = null, epoch = null) {
        if (!dropId || !recipientId || !rewardKind) return null;
        const resolvedFieldId = fieldId
            || this.net?._getCurrentFieldId?.()
            || this.activeZoneId
            || 'field';
        const epochIdentity = `e${Math.max(0, Math.floor(Number(epoch?.dropWorldEpoch || 0)))}_${Math.max(0, Math.floor(Number(epoch?.dropFieldEpoch || 0)))}`;
        const rewardId = `drop_reward:${resolvedFieldId}:${dropId}:${epochIdentity}:${recipientId}:${rewardKind}`;
        if (rewardId.length <= 256) return rewardId;
        const hash = this.net?._hashDurableRewardCatalogValue?.(rewardId);
        return hash ? `drop_reward:${hash}:${recipientId.slice(0, 96)}:${rewardKind.slice(0, 48)}` : null;
    }

    _buildDeterministicMonsterDropIdentity(monster, slot) {
        if (!monster?.id || !slot) return { id: null, sourceRewardId: null };
        const fieldId = this.net?._getCurrentFieldId?.() || this.activeZoneId || 'field';
        const sourceRewardId = `monster_drop:${fieldId}:${monster.id}:${slot}`;
        const primary = this.net?._hashDurableRewardCatalogValue?.(sourceRewardId)
            || `fnv1a32_${this._hashDeterministicMonsterSeed(sourceRewardId).toString(16).padStart(8, '0')}`;
        const secondary = this.net?._hashDurableRewardCatalogValue?.(`drop:${sourceRewardId}`)
            || `fnv1a32_${this._hashDeterministicMonsterSeed(`drop:${sourceRewardId}`).toString(16).padStart(8, '0')}`;
        return {
            id: primary && secondary
                ? `drop_${primary.replace('fnv1a32_', '')}_${secondary.replace('fnv1a32_', '')}`
                : null,
            sourceRewardId: sourceRewardId.slice(0, 256)
        };
    }

    _prepareMonsterDeathSettlement(monster) {
        if (!monster) return;
        if (!(monster._pendingDeathRewardOperations instanceof Map)) {
            monster._pendingDeathRewardOperations = new Map();
        }
        if (!(monster._pendingDeathDropOperations instanceof Map)) {
            monster._pendingDeathDropOperations = new Map();
        }
        if (!(monster._pendingDeathChildOperations instanceof Map)) {
            monster._pendingDeathChildOperations = new Map();
        }
        if (!(monster._deathChildSpawnInFlight instanceof Map)) {
            monster._deathChildSpawnInFlight = new Map();
        }
        if (!(monster._completedDeathChildIds instanceof Set)) {
            monster._completedDeathChildIds = new Set();
        }
        if (monster._pendingQuestBossDefeatOperation === undefined) {
            monster._pendingQuestBossDefeatOperation = null;
        }
        if (monster._pendingFieldBossDefeatOperation === undefined) {
            monster._pendingFieldBossDefeatOperation = null;
        }
        if (monster._deathSettlementReady !== false) monster._deathSettlementReady = true;
    }

    _authorMonsterReward(monster, recipientId, payload) {
        if (!monster || !recipientId || !payload?.rewardId) return false;
        this._prepareMonsterDeathSettlement(monster);
        const operationKey = `${recipientId}:${payload.rewardId}`;
        const authored = this.net.sendReward(recipientId, payload, { requireSharedCommit: true }) === true;
        const accepted = typeof this.net.isRewardServerCommitted === 'function'
            ? this.net.isRewardServerCommitted(recipientId, payload.rewardId)
            : authored;
        if (accepted) {
            monster._pendingDeathRewardOperations.delete(operationKey);
        } else {
            monster._pendingDeathRewardOperations.set(operationKey, {
                recipientId,
                payload: { ...payload }
            });
            monster._deathSettlementReady = false;
        }
        return accepted;
    }

    _authorMonsterDrop(monster, payload) {
        if (!monster || !payload?.id || !payload?.sourceRewardId) return false;
        this._prepareMonsterDeathSettlement(monster);
        const spawnedId = this.net.spawnDrop(payload);
        const accepted = typeof this.net.isDropSpawnDurablyAccepted === 'function'
            ? this.net.isDropSpawnDurablyAccepted(payload.id, payload.sourceRewardId, {
                fieldId: payload.fieldId || this.net?._getCurrentFieldId?.()
            })
            : !!spawnedId;
        if (accepted) {
            monster._pendingDeathDropOperations.delete(payload.id);
        } else {
            monster._pendingDeathDropOperations.set(payload.id, { ...payload });
            monster._deathSettlementReady = false;
        }
        return accepted;
    }

    _authorMonsterChild(monster, operation) {
        const instanceId = operation?.options?.instanceId;
        if (!monster || !instanceId || !operation?.type) return Promise.resolve(false);
        this._prepareMonsterDeathSettlement(monster);
        if (monster._completedDeathChildIds.has(instanceId)) {
            monster._pendingDeathChildOperations.delete(instanceId);
            return Promise.resolve(true);
        }
        const deathParentId = monster.id;
        monster._pendingDeathChildOperations.set(instanceId, {
            x: operation.x,
            y: operation.y,
            type: operation.type,
            options: { ...(operation.options || {}), instanceId, deathParentId }
        });
        monster._deathSettlementReady = false;
        if (monster._deathChildSpawnInFlight.has(instanceId)) {
            return monster._deathChildSpawnInFlight.get(instanceId);
        }
        let spawnPromise = null;
        spawnPromise = Promise.resolve(
            this.net?.hasMonsterChildSpawnLedger?.(deathParentId, instanceId, {
                fieldId: this.net?._getCurrentFieldId?.()
            }) ?? false
        ).then((alreadyPublished) => {
            if (alreadyPublished) return instanceId;
            return this._spawnMonster(
                operation.x,
                operation.y,
                operation.type,
                { ...(operation.options || {}), instanceId, deathParentId }
            );
        }).then((spawnedId) => {
            if (spawnedId === instanceId) {
                monster._completedDeathChildIds.add(instanceId);
                monster._pendingDeathChildOperations.delete(instanceId);
                return true;
            }
            return false;
        }).catch((error) => {
            Logger.warn(`[MonsterManager] Deterministic child spawn will retry for ${instanceId}`, error);
            return false;
        }).finally(() => {
            if (monster._deathChildSpawnInFlight.get(instanceId) === spawnPromise) {
                monster._deathChildSpawnInFlight.delete(instanceId);
            }
        });
        monster._deathChildSpawnInFlight.set(instanceId, spawnPromise);
        return spawnPromise;
    }

    _authorQuestBossDefeat(monster, operation = null) {
        if (!monster || monster.typeId !== 'king_slime') return true;
        this._prepareMonsterDeathSettlement(monster);
        const defeatOperation = operation || {
            bossInstanceId: monster.id,
            fieldId: this.net?._getCurrentFieldId?.(),
            defeatedAt: this._getAuthoritativeNow()
        };
        const accepted = this.net?.markQuestBossDefeated?.(
            defeatOperation.bossInstanceId,
            {
                fieldId: defeatOperation.fieldId,
                defeatedAt: defeatOperation.defeatedAt
            }
        ) === true;
        monster._pendingQuestBossDefeatOperation = accepted ? null : defeatOperation;
        if (!accepted) monster._deathSettlementReady = false;
        return accepted;
    }

    _retryPendingMonsterDeathSettlement(monster, now = Date.now()) {
        if (!monster) return true;
        this._prepareMonsterDeathSettlement(monster);
        if (Number(monster._nextDeathSettlementRetryAt || 0) > now) return false;
        monster._nextDeathSettlementRetryAt = now + 750;

        Array.from(monster._pendingDeathRewardOperations.entries()).forEach(([key, operation]) => {
            const authored = this.net.sendReward(
                operation.recipientId,
                operation.payload,
                { requireSharedCommit: true }
            ) === true;
            const committed = typeof this.net.isRewardServerCommitted === 'function'
                ? this.net.isRewardServerCommitted(operation.recipientId, operation.payload?.rewardId)
                : authored;
            if (committed) {
                monster._pendingDeathRewardOperations.delete(key);
            }
        });
        Array.from(monster._pendingDeathDropOperations.values()).forEach((payload) => {
            this._authorMonsterDrop(monster, payload);
        });
        Array.from(monster._pendingDeathChildOperations.values()).forEach((operation) => {
            this._authorMonsterChild(monster, operation);
        });
        if (monster._pendingQuestBossDefeatOperation) {
            this._authorQuestBossDefeat(monster, monster._pendingQuestBossDefeatOperation);
        }
        if (monster._pendingFieldBossDefeatOperation && !monster._fieldBossDefeatWritePromise) {
            this._authorFieldBossDefeat(monster, monster._pendingFieldBossDefeatOperation);
        }
        const ready = monster._pendingDeathRewardOperations.size === 0
            && monster._pendingDeathDropOperations.size === 0
            && monster._pendingDeathChildOperations.size === 0
            && !monster._pendingQuestBossDefeatOperation
            && !monster._pendingFieldBossDefeatOperation;
        monster._deathSettlementReady = ready;
        return ready;
    }

    _isMonsterDeathSettlementReady(monster) {
        if (!monster) return true;
        const pendingRewards = monster._pendingDeathRewardOperations instanceof Map
            ? monster._pendingDeathRewardOperations.size
            : 0;
        const pendingDrops = monster._pendingDeathDropOperations instanceof Map
            ? monster._pendingDeathDropOperations.size
            : 0;
        const pendingChildren = monster._pendingDeathChildOperations instanceof Map
            ? monster._pendingDeathChildOperations.size
            : 0;
        return monster._deathSettlementReady !== false
            && pendingRewards === 0
            && pendingDrops === 0
            && pendingChildren === 0
            && !monster._pendingQuestBossDefeatOperation
            && !monster._pendingFieldBossDefeatOperation;
    }

    _spawnGroundLootDrop(monster, reward, options = {}) {
        if (!monster || !reward || !this.net?.spawnDrop) return false;
        const itemId = reward.id || reward.type;
        if (!itemId) return false;
        const identity = this._buildDeterministicMonsterDropIdentity(
            monster,
            options.rewardSlot || `item_${itemId}`
        );

        const payload = {
            id: identity.id,
            sourceRewardId: identity.sourceRewardId,
            x: monster.x + (Number.isFinite(options.offsetX)
                ? options.offsetX
                : ((this._getDeterministicMonsterUnit(monster, `${options.rewardSlot}:offset_x`) * 44) - 22)),
            y: monster.y + (Number.isFinite(options.offsetY)
                ? options.offsetY
                : ((this._getDeterministicMonsterUnit(monster, `${options.rewardSlot}:offset_y`) * 28) - 14)),
            type: itemId,
            itemId,
            amount: Math.max(1, Math.floor(Number(reward.amount || 1))),
            ownerId: options.ownerId || null,
            partyMembers: Array.isArray(options.partyMembers) ? options.partyMembers : null,
            eligibleCollectorIds: Array.isArray(options.eligibleCollectorIds) ? options.eligibleCollectorIds : null,
            name: reward.name || itemId,
            icon: reward.icon || null,
            forceNetwork: true
        };
        return this._authorMonsterDrop(monster, payload);
    }

    _grantMonsterExpReward(amount, options = {}) {
        const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
        if (safeAmount <= 0) return true;
        const monsterLevel = Math.max(1, Number(options.monsterLevel || 1));

        const eligibleCollectorIds = this._normalizePartyMembers(options.eligibleCollectorIds || []);
        const partyMembers = this._normalizePartyMembers(options.partyMembers || []);
        const ownerId = eligibleCollectorIds.includes(options.attackerId)
            ? options.attackerId
            : (eligibleCollectorIds[0] || options.attackerId || partyMembers[0] || null);
        if (!ownerId) return true;
        let acceptedAll = true;

        const grantTo = (uid, partyMultiplier) => {
            const playerLevel = this._getPlayerRewardLevel(uid, options.monster);
            const overlevelMultiplier = this._getOverlevelExpMultiplier(playerLevel, monsterLevel);
            const exp = Math.max(1, Math.floor(safeAmount * partyMultiplier * overlevelMultiplier));
            const rewardPayload = {
                exp,
                rewardMeta: {
                    monsterLevel,
                    playerLevel,
                    overlevelMultiplier,
                    partyMultiplier
                }
            };
            if (options.monster) {
                rewardPayload.rewardId = this._buildDeterministicRewardId(
                    options.monster,
                    uid,
                    options.isBoss ? 'boss_exp' : 'normal_exp'
                );
            }
            if (options.isBoss && options.monster) {
                rewardPayload.bossReward = true;
                rewardPayload.immediate = true;
                rewardPayload.kind = 'boss_progress';
                rewardPayload.rewardKind = 'boss_exp';
                rewardPayload.bossTypeId = options.monster.typeId;
                rewardPayload.bossInstanceId = options.monster.id;
                rewardPayload.monsterName = options.monster.name || options.monster.typeId;
            }
            const accepted = options.monster
                ? this._authorMonsterReward(options.monster, uid, rewardPayload)
                : this.net.sendReward(uid, rewardPayload) === true;
            acceptedAll = accepted && acceptedAll;
        };

        grantTo(ownerId, 1);

        const rewardPeers = this._normalizePartyMembers(
            eligibleCollectorIds.length > 0 ? eligibleCollectorIds : partyMembers
        );
        rewardPeers
            .filter((uid) => uid && uid !== ownerId)
            .forEach((uid) => grantTo(uid, 0.6));
        return acceptedAll;
    }

    _grantMonsterQuestCredit(monster, recipientId, options = {}) {
        if (!monster?.id || !recipientId) return false;
        const introSharedQuest = options.introSharedQuest === true;
        return this._authorMonsterReward(monster, recipientId, {
            questKill: monster.typeId,
            monsterName: monster.name,
            introSharedQuest,
            immediate: true,
            rewardId: this._buildDeterministicRewardId(
                monster,
                recipientId,
                introSharedQuest ? 'intro_quest' : 'quest'
            )
        });
    }

    _grantMonsterItemDrops(monster, attackerId) {
        if (!monster) return true;

        const participantIds = this._getMonsterParticipantIds(monster, attackerId);
        const rewardTargetId = participantIds.includes(attackerId)
            ? attackerId
            : (participantIds[0] || attackerId || null);
        if (!rewardTargetId) return true;
        const normalDrops = [
            ...(Array.isArray(monster.drops) ? monster.drops : []),
            ...(this.game.itemData?.getGlobalDrops() || [])
        ];
        const bossDrops = this.game.itemData?.getBossDrops(monster.typeId) || [];
        const rewardedItems = [];
        let groundDropCount = 0;
        let acceptedAll = true;

        normalDrops.forEach((dropDef, dropIndex) => {
            if (!dropDef?.itemId || dropDef.itemId === 'gold' || dropDef.itemId === 'manastone') return;
            const rollSlot = `normal_drop_${dropIndex}_${dropDef.itemId}`;
            if (this._getDeterministicMonsterUnit(monster, `${rollSlot}:chance`) > (dropDef.chance ?? 1)) return;
            const reward = this._buildRewardItem(dropDef.itemId, dropDef, { monster, rollSlot });
            if (!reward) return;

            const rewardItemId = reward.id || reward.type;
            if (this._isGroundLootItem(rewardItemId)) {
                const direction = groundDropCount % 2 === 0 ? -1 : 1;
                const accepted = this._spawnGroundLootDrop(monster, reward, {
                    ownerId: rewardTargetId,
                    eligibleCollectorIds: [rewardTargetId],
                    rewardSlot: `ground_item_${dropIndex}_${dropDef.itemId}`,
                    offsetX: direction * (18 + (groundDropCount * 6)),
                    offsetY: -6 + ((groundDropCount % 3) * 8)
                });
                acceptedAll = accepted && acceptedAll;
                groundDropCount += 1;
                return;
            }

            rewardedItems.push(reward);
        });

        const grantItems = (uid, items, options = {}) => {
            if (!uid || !Array.isArray(items) || items.length === 0) return true;
            const rewardPayload = {
                monsterName: monster.name,
                items,
                bossReward: !!options.bossReward,
                immediate: !!options.bossReward
            };
            if (options.rewardKind) {
                rewardPayload.rewardId = this._buildDeterministicRewardId(monster, uid, options.rewardKind);
                rewardPayload.rewardKind = options.rewardKind;
            }
            if (options.bossReward) {
                rewardPayload.kind = 'boss_items';
                rewardPayload.bossTypeId = monster.typeId;
                rewardPayload.bossInstanceId = monster.id;
            }

            const accepted = this._authorMonsterReward(monster, uid, rewardPayload);
            acceptedAll = accepted && acceptedAll;
            return accepted;
        };

        grantItems(rewardTargetId, rewardedItems, { rewardKind: 'normal_items' });

        if (monster.isBoss && bossDrops.length > 0) {
            const bossRecipients = participantIds.length > 0 ? participantIds : [rewardTargetId];
            bossRecipients.forEach((uid) => {
                const personalBossItems = [];
                bossDrops.forEach((dropDef, dropIndex) => {
                    const rollSlot = `boss_drop_${dropIndex}_${dropDef?.itemId || 'invalid'}`;
                    if (!dropDef?.itemId
                        || this._getDeterministicMonsterUnit(monster, `${rollSlot}:chance`, uid) > (dropDef.chance ?? 1)) return;
                    const reward = this._buildRewardItem(dropDef.itemId, dropDef, {
                        monster,
                        recipientId: uid,
                        rollSlot
                    });
                    if (reward) personalBossItems.push(reward);
                });
                grantItems(uid, personalBossItems, { bossReward: true, rewardKind: 'boss_items' });
            });
        }

        return acceptedAll;
    }

    update(dt) {
        const localPlayer = this.game.localPlayer;
        const remotePlayers = this.game.remotePlayers;
        const hostSnapshotRestorePending = this._isHostFieldStateBlocked();
        const mobileThermalMode = !!this.game?.isMobilePerformanceMode;
        this.syncInterval = mobileThermalMode ? 0.16 : 0.1;
        const isProtectedPlayer = (player) => {
            const currentScene = this.game.sceneManager?.currentScene;
            if (!player || typeof currentScene?.isPlayerProtected !== 'function') return false;
            return currentScene.isPlayerProtected(player);
        };
        const authorityPlayers = this.net.isHost
            ? this._getInterestedPlayers(localPlayer, remotePlayers, isProtectedPlayer)
            : [];

        // v1.99: Calculate total level for all clients (for UI/Dev Mode)
        let currentTotalLevel = localPlayer?.level || 1;
        if (remotePlayers) {
            remotePlayers.forEach(rp => currentTotalLevel += (rp.level || 1));
        }
        this.totalLevelSum = currentTotalLevel;

        if (this.net.isHost && !hostSnapshotRestorePending) {
            this._updateHostLogic(dt, localPlayer, remotePlayers);
            this._updateMinimapSnapshot(dt);
        } else if (!this.net.isHost) {
            this.minimapSyncTimer = 0;
            this._processPendingGuestSnapshotHydration().catch((error) => {
                Logger.warn('[MonsterManager] Guest monster snapshot hydration failed', error);
            });
        }

        // Update local monster instances.
        // Host must continue simulating monsters that are relevant to remote players
        // even when they are outside the host camera.
        this.monsters.forEach(m => {
            if (hostSnapshotRestorePending) return;
            const hasActiveTarget = this._isValidMonsterTarget(m.targetPlayer, isProtectedPlayer);
            if (!hasActiveTarget && m.targetPlayer) {
                m.targetPlayer = null;
                if (m.chargeState === 'casting' || m.chargeState === 'charging') {
                    m.chargeState = 'idle';
                    m.chargeTarget = null;
                }
            }

            const hostRelevantOffscreen = this.net.isHost && (
                m.chargeState !== 'idle'
                || !!m.isAggro
                || hasActiveTarget
                || m.isDead
                || this._isMonsterNearAnyPlayer(m, authorityPlayers, m.isBoss ? 1600 : 1100)
            );

            if (this.net.isHost || this.isOnScreen(m) || hostRelevantOffscreen) {
                m.update(dt); // Full update for on-screen
            }
            // Off-screen guest-only monsters are still culled locally.
        });

        if (!hostSnapshotRestorePending) {
            this._checkFirstBossQuestFailure(dt, localPlayer);
        }

        // Update drops (Magnet logic)
        this.drops.forEach((d, id) => {
            if (this._isDropExpired(d)) {
                if (this.net.isHost) {
                    this.net.removeDrop(id, {
                        expired: true,
                        dropWorldEpoch: d.dropWorldEpoch,
                        dropFieldEpoch: d.dropFieldEpoch
                    });
                }
                this.drops.delete(id);
                return;
            }
            if (d.update(dt, localPlayer)) {
                const request = this.net.collectDrop(id, {
                    dropWorldEpoch: d.dropWorldEpoch,
                    dropFieldEpoch: d.dropFieldEpoch
                });
                if (request === false) {
                    d.isLocallyCollected = false;
                } else if (request && typeof request.then === 'function') {
                    request.then((accepted) => {
                        if (!accepted && this.drops.get(id) === d) d.isLocallyCollected = false;
                    }).catch(() => {
                        if (this.drops.get(id) === d) d.isLocallyCollected = false;
                    });
                }
            }
        });
    }

    _updateMinimapSnapshot(dt) {
        if (!this.net?.isHost || !this.net?.isSharedFieldActive?.()) {
            this.minimapSyncTimer = 0;
            return;
        }

        this.minimapSyncTimer += dt;
        if (this.minimapSyncTimer < this.minimapSyncInterval) return;
        this.minimapSyncTimer = 0;
        this.net.publishMinimapMonsterSnapshot(this.monsters);
    }

    handleVisibilityResync(options = {}) {
        const resumedAt = Number(options.resumedAt || Date.now());
        const shouldSnapToAuthority = !this.net?.isHost;

        this.monsters.forEach((monster) => {
            if (!monster) return;

            if (shouldSnapToAuthority) {
                if (Number.isFinite(monster.targetX)) monster.x = monster.targetX;
                if (Number.isFinite(monster.targetY)) monster.y = monster.targetY;
            }

            monster.vx = 0;
            monster.vy = 0;
            if (monster.knockback) {
                monster.knockback.vx = 0;
                monster.knockback.vy = 0;
            }
            monster.hitTimer = 0;
            monster.lastNetworkEventAt = resumedAt;

            if (monster.remoteSyncState !== 'casting' && monster.remoteSyncState !== 'charging') {
                monster.chargeState = 'idle';
                monster.chargeTarget = null;
            }
        });
    }

    render(ctx, camera) {
        // Monsters are rendered in WorldScene's Y-sorted render list.
        // Only draw drops here to avoid double-rendering the same entities every frame.
        this.drops.forEach(d => d.render(ctx, camera));
    }

    setSpawnRules(rules, options = {}) {
        const nextZoneId = options.zoneId || this.zone?.currentZone?.id || 'zone_1';
        const zoneChanged = nextZoneId !== this.activeZoneId;
        this.worldGeneration += 1;
        this.activeZoneId = nextZoneId;
        if (nextZoneId === 'zone_1') {
            const questData = this.game?.localPlayer?.questData;
            this.firstBossDefeated = Number(questData?.bossClearCount || 0) > 0
                || !!questData?.bossKilled
                || !!questData?.bossQuestClaimed;
        }
        if (zoneChanged) this._fieldBossStateReadyFieldId = null;
        this.spawnRules = (Array.isArray(rules) ? rules : []).map((rule, index) => ({
            ...rule,
            id: rule?.id || `${nextZoneId}:${rule?.monsterId || 'monster'}:${index}`
        }));
        this.pendingSpawnGroups.clear();
        this.spawnGroupNextAt.clear();
        this.primedSpawnGroups.clear();
        const spawnScheduleNow = Date.now();
        this.spawnRules.forEach((rule) => {
            this.spawnGroupNextAt.set(rule.id, spawnScheduleNow + Math.max(0, Number(rule.initialDelaySeconds || 0)) * 1000);
        });
        this.spawnTimer = options.primeSpawn === false ? 0 : 1;
        if (zoneChanged) {
            this.bossSpawned = Array.from(this.monsters.values()).some((monster) => (
                monster?.typeId === 'king_slime' && !monster.isDead
            ));
            this.shouldSpawnBoss = false;
        }

        const bossRule = options.bossSpawn?.monsterId ? options.bossSpawn : null;
        const bossChanged = zoneChanged
            || bossRule?.monsterId !== this.zoneBossRule?.monsterId;
        this.zoneBossRule = bossRule
            ? {
                ...bossRule,
                zoneId: nextZoneId,
                point: {
                    x: Number(bossRule.point?.x ?? bossRule.x ?? (this.zone?.width || 3200) / 2),
                    y: Number(bossRule.point?.y ?? bossRule.y ?? (this.zone?.height || 3200) / 2)
                }
            }
            : null;
        if (bossChanged) {
            this.zoneBossSpawned = false;
            this.zoneBossSpawnPending = false;
            this.zoneBossDefeatedAt = 0;
            this.zoneBossInstanceId = null;
            this._staleFieldBossMarker = null;
            const initialDelaySeconds = Math.max(0, Number(this.zoneBossRule?.initialDelaySeconds ?? 12));
            this.zoneBossRespawnAt = this.zoneBossRule
                ? this._getAuthoritativeNow() + initialDelaySeconds * 1000
                : 0;
        }

        Logger.log('[MonsterManager] Spawn rules updated:', {
            zoneId: nextZoneId,
            normalRules: this.spawnRules,
            bossRule: this.zoneBossRule
        });
    }

    isSpawnSuppressed() {
        return this.tutorialMode || !!this.game.story?.isStoryActive || !!this.game.tutorial?.pendingTutorialId;
    }

    shouldSuppressWorldFeedback(monster = null) {
        const monsterId = typeof monster === 'string' ? monster : monster?.id;
        if (monster?.isLocalOnly) return true;
        if (monsterId && this.tutorialMonsterIds.has(monsterId)) return true;
        return this.tutorialMode || !!this.game.tutorial?.pendingTutorialId;
    }

    setTutorialMode(active) {
        const nextState = !!active;
        if (this.tutorialMode === nextState) return;

        this.tutorialMode = nextState;
        this.spawnTimer = nextState ? 0 : 1.0;

        if (nextState) {
            this.clearAll();
        } else {
            this.clearTutorialMonsters();
        }
    }

    clearTutorialMonsters() {
        const tutorialIds = Array.from(this.tutorialMonsterIds);
        tutorialIds.forEach((id) => {
            this._clearPlayerTargetIfMatches(id);
            if (this.net.isHost) {
                this.net.removeMonster(id);
            }
            this.monsters.delete(id);
            this.lastSyncState.delete(id);
            this.monsterRegionMap.delete(id);
            this.monsterRevisionMap.delete(id);
        });
        this.tutorialMonsterIds.clear();
    }

    spawnMonster(type = 'slime', x = null, y = null, options = {}) {
        if (options.tutorialOnly) {
            return this._spawnLocalMonster(x, y, type, options);
        }
        return this._spawnMonster(x, y, type, options);
    }

    primeSpawnCycle() {
        this.spawnTimer = 1.0;
    }

    async clearFreshIntroFieldState() {
        const peerCount = Number(this.net?.getSameFieldPeerCount?.() || 0);
        if (peerCount > 0) {
            return false;
        }

        await this.net?.clearWorldCombatState?.({ resetSlimeKillCount: true });
        this.clearAll();
        this.bossSpawned = false;
        this.shouldSpawnBoss = false;
        this.firstBossPending = false;
        this.firstBossMissingTimer = 0;
        this.slimeKillCount = 0;
        return true;
    }

    _isValidMonsterTarget(player, isProtectedPlayer = () => false) {
        if (!player || player.isDead || isProtectedPlayer(player)) return false;
        if (player.id === this.net?.playerId) return true;
        return !!this.net?.isUserActivelyPresent?.(player.id);
    }

    _getInterestedPlayers(localPlayer, remotePlayers, isProtectedPlayer) {
        const players = [];
        const seenIds = new Set();
        const tryAddPlayer = (player) => {
            if (!player?.id || seenIds.has(player.id)) return;
            if (!this._isValidMonsterTarget(player, isProtectedPlayer)) return;
            if (Number.isFinite(player.protectedUntil) && player.protectedUntil > Date.now()) return;
            seenIds.add(player.id);
            players.push(player);
        };
        if (this._isValidMonsterTarget(localPlayer, isProtectedPlayer)) {
            seenIds.add(localPlayer.id);
            players.push(localPlayer);
        }
        if (remotePlayers) {
            remotePlayers.forEach((player) => {
                tryAddPlayer(player);
            });
        }
        if (this.net?.remotePlayers) {
            this.net.remotePlayers.forEach((player, id) => {
                if (!player || !id) return;
                tryAddPlayer({
                    id: player.id || id,
                    x: Number(player.x ?? 0),
                    y: Number(player.y ?? 0),
                    width: player.width || 48,
                    height: player.height || 48,
                    isDead: Array.isArray(player.h) ? Number(player.h[0] || 0) <= 0 : false,
                    isPaused: !!player.isPaused,
                    protectedUntil: Number(player.protectedUntil || 0),
                    type: 'player'
                });
            });
        }
        return players;
    }

    resetCombatTargets(options = {}) {
        const clearChargeState = options.clearChargeState !== false;
        this.monsters.forEach((monster) => {
            if (!monster) return;
            monster.targetPlayer = null;
            monster.isAggro = false;
            if (!clearChargeState) return;
            monster.chargeTarget = null;
            if (monster.chargeState === 'casting' || monster.chargeState === 'charging') {
                monster.chargeState = 'idle';
            }
        });
    }

    _isMonsterNearAnyPlayer(monster, players, radius = 1100) {
        if (!monster || !players || players.length === 0) return false;
        const radiusSq = radius * radius;
        for (const player of players) {
            const dx = monster.x - player.x;
            const dy = monster.y - player.y;
            if ((dx * dx) + (dy * dy) <= radiusSq) return true;
        }
        return false;
    }

    _scheduleGuestSnapshotHydration(reason = 'unknown', delayMs = 250) {
        if (this.net?.isHost) return;
        if (!this.net?.isSharedFieldActive?.()) {
            this._guestSnapshotHydrationPending = null;
            return;
        }
        this._guestSnapshotHydrationPending = {
            reason,
            dueAt: Date.now() + Math.max(0, Number(delayMs || 0))
        };
    }

    async _processPendingGuestSnapshotHydration() {
        if (this.net?.isHost) {
            this._guestSnapshotHydrationPending = null;
            return;
        }
        if (!this.net?.isSharedFieldActive?.() || !this.net?.currentHostId || this.net.currentHostId === this.net.playerId) {
            this._guestSnapshotHydrationPending = null;
            return;
        }
        const pending = this._guestSnapshotHydrationPending;
        if (!pending) return;
        if (Date.now() < pending.dueAt) return;
        if (!this.game?.localPlayer || !this.net?.connected || !this.net?.zoneParticipationEnabled) return;

        this._guestSnapshotHydrationPending = null;
        await this.restoreVisibleMonstersFromHostSnapshot({ reason: pending.reason });
    }

    _getFieldCellSize() {
        return Math.max(128, this.net?._fieldCellSize || 640);
    }

    _getCellIdFromPosition(x = 0, y = 0) {
        const cellSize = this._getFieldCellSize();
        const safeX = Number.isFinite(x) ? x : 0;
        const safeY = Number.isFinite(y) ? y : 0;
        return `${Math.floor(safeX / cellSize)}_${Math.floor(safeY / cellSize)}`;
    }

    _parseCellId(cellId) {
        if (typeof cellId !== 'string') return null;
        const [rawX, rawY] = cellId.split('_');
        const x = Number.parseInt(rawX, 10);
        const y = Number.parseInt(rawY, 10);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y };
    }

    _getCellChebyshevDistance(fromCellId, toCellId) {
        const from = this._parseCellId(fromCellId);
        const to = this._parseCellId(toCellId);
        if (!from || !to) return Number.POSITIVE_INFINITY;
        return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
    }

    _getMonsterCellId(monster) {
        if (!monster) return '0_0';
        const cellId = this._getCellIdFromPosition(monster.x, monster.y);
        if (monster.id) {
            this.monsterRegionMap.set(monster.id, cellId);
        }
        return cellId;
    }

    _isMonsterInCellNeighborhood(monster, cellId, range = 1) {
        const monsterCell = this._parseCellId(this._getMonsterCellId(monster));
        const targetCell = this._parseCellId(cellId);
        if (!monsterCell || !targetCell) return false;
        return Math.abs(monsterCell.x - targetCell.x) <= range
            && Math.abs(monsterCell.y - targetCell.y) <= range;
    }

    _getMonsterNetworkState(monster) {
        if (!monster || monster.isDead || monster.hp <= 0) return 'dead';
        if (monster.chargeState === 'casting' || monster.chargeState === 'charging') {
            return monster.chargeState;
        }
        if (monster.isAggro) return 'aggro';
        return 'idle';
    }

    _nextMonsterRevision(monsterId) {
        const nextRev = (this.monsterRevisionMap.get(monsterId) || 0) + 1;
        this.monsterRevisionMap.set(monsterId, nextRev);
        return nextRev;
    }

    _handleFieldPeerPresenceChanged({ uid, entry, reason } = {}) {
        if (!this.net?.isHost || !uid || !entry) return;
        if (entry.fieldId !== this.net?._getCurrentFieldId?.()) return;
        if (reason !== 'peer_joined_field' && reason !== 'peer_cell_changed') return;

        const now = Date.now();
        const previous = this.peerMonsterKeyframeMeta.get(uid) || null;
        if (previous?.cellId === entry.cellId && (now - previous.ts) < 1200) return;
        if (reason === 'peer_cell_changed' && previous?.cellId) {
            const cellShift = this._getCellChebyshevDistance(previous.cellId, entry.cellId);
            if (cellShift <= 1 && (now - previous.ts) < 5000) return;
        }

        this.peerMonsterKeyframeMeta.set(uid, {
            cellId: entry.cellId,
            ts: now
        });

        const previousCellMeta = this.peerMonsterKeyframeCellMeta.get(entry.cellId) || null;
        if (previousCellMeta && (now - previousCellMeta.ts) < 500) return;
        this.peerMonsterKeyframeCellMeta.set(entry.cellId, { ts: now });
        const peerCount = Math.max(0, Number(this.net?.getSameFieldPeerCount?.() || 0));
        const neighborhood = peerCount >= 6 ? 0 : 1;
        this._queuePeerMonsterKeyframe(entry.cellId, neighborhood);
    }

    _queuePeerMonsterKeyframe(cellId, neighborhood = 1) {
        if (!this.net?.isHost || !cellId) return;
        this._pendingPeerMonsterKeyframeCells.add(`${cellId}|${Math.max(0, Number(neighborhood || 1))}`);
        if (this._peerMonsterKeyframeFlushTimer) return;
        this._peerMonsterKeyframeFlushTimer = setTimeout(() => {
            this._peerMonsterKeyframeFlushTimer = null;
            this._flushQueuedPeerMonsterKeyframes();
        }, this._peerMonsterKeyframeFlushDelayMs);
    }

    _flushQueuedPeerMonsterKeyframes() {
        if (!this.net?.isHost || this._pendingPeerMonsterKeyframeCells.size === 0) return;
        const queued = Array.from(this._pendingPeerMonsterKeyframeCells);
        this._pendingPeerMonsterKeyframeCells.clear();

        queued.forEach((entry) => {
            const [cellId, rawNeighborhood] = String(entry).split('|');
            const neighborhood = Math.max(0, Number(rawNeighborhood || 1));
            this.forceSyncAroundCell(cellId, { neighborhood });
        });
    }

    _clearQueuedPeerMonsterKeyframes() {
        if (this._peerMonsterKeyframeFlushTimer) {
            clearTimeout(this._peerMonsterKeyframeFlushTimer);
            this._peerMonsterKeyframeFlushTimer = null;
        }
        this._pendingPeerMonsterKeyframeCells.clear();
    }

    _getMonsterSyncProfile(monster, interestedPlayers, mobileThermalMode) {
        if (this.net?.shouldUseMonsterQuietMode?.()) {
            return {
                deltaIntervalMs: monster.isBoss ? 1400 : 2200,
                positionThreshold: monster.isBoss ? 12 : 20,
                fullSyncIntervalMs: monster.isBoss ? 5200 : 7600
            };
        }

        const now = Date.now();
        const activityWindowMs = monster.isBoss ? 6000 : 3500;
        const lastActivityTs = Math.max(monster.lastHitAt || 0, monster.lastNetworkEventAt || 0);
        const recentlyActive = lastActivityTs > 0 && (now - lastActivityTs) <= activityWindowMs;
        const engaged = monster.chargeState !== 'idle'
            || (!!monster.targetPlayer && !monster.targetPlayer.isDead)
            || !!monster.isAggro
            || !!monster.isDead;
        const nearby = this.isOnScreen(monster)
            || this._isMonsterNearAnyPlayer(monster, interestedPlayers, monster.isBoss ? 1600 : 1100);

        if (monster.isBoss || engaged || recentlyActive) {
            return {
                deltaIntervalMs: mobileThermalMode ? 120 : 90,
                positionThreshold: mobileThermalMode ? 1.75 : 1.25,
                fullSyncIntervalMs: mobileThermalMode ? 1800 : 1500
            };
        }

        if (nearby) {
            return {
                deltaIntervalMs: mobileThermalMode ? 180 : 140,
                positionThreshold: mobileThermalMode ? 2.75 : 1.75,
                fullSyncIntervalMs: mobileThermalMode ? 3200 : 2600
            };
        }

        return {
            deltaIntervalMs: mobileThermalMode ? 480 : 360,
            positionThreshold: mobileThermalMode ? 5.5 : 3.5,
            fullSyncIntervalMs: mobileThermalMode ? 8500 : 6500
        };
    }

    _buildMonsterSyncPayload(monster, { fullSync = false, immediate = false } = {}) {
        const rev = this._nextMonsterRevision(monster.id);
        const cellId = this._getMonsterCellId(monster);
        const state = this._getMonsterNetworkState(monster);
        const now = Date.now();
        const payload = {
            x: Math.round(monster.x),
            y: Math.round(monster.y),
            hp: monster.hp,
            maxHp: monster.maxHp,
            type: monster.typeId || monster.name,
            chargeOnly: !!monster.chargeOnly,
            rev,
            ts: now,
            state,
            cellId
        };

        if (monster.isBoss) payload.isBoss = true;
        if (monster.isDead && !this._isMonsterDeathSettlementReady(monster)) {
            payload.deathSettlementPending = true;
        }
        if (monster.bossCycle === 'intro' || monster.bossCycle === 'repeat') {
            payload.bossCycle = monster.bossCycle;
        }
        if (monster.spawnGroupId) payload.spawnGroupId = monster.spawnGroupId;
        if (monster.isBoss || monster.isDead) {
            payload.lastAttackerId = monster.lastAttackerId || null;
            payload.damageContributors = Array.from(monster.damageContributors || [])
                .filter(Boolean)
                .slice(0, 24);
            payload.damageContributorLevels = Array.from(monster.damageContributorLevels || [])
                .filter(([uid, level]) => typeof uid === 'string' && uid && Number.isFinite(Number(level)))
                .slice(0, 24)
                .map(([uid, level]) => [uid, Math.max(1, Math.min(999, Math.floor(Number(level))))]);
        }

        if (fullSync) {
            payload.fullSync = true;
            payload.w = monster.width;
            payload.h = monster.height;
        }
        if (immediate) {
            payload.immediate = true;
        }

        return payload;
    }

    _updateZoneBossSpawn() {
        const rule = this.zoneBossRule;
        if (!rule || this.isSpawnSuppressed() || this.zoneBossSpawnPending) return;
        if (rule.zoneId && rule.zoneId !== (this.zone?.currentZone?.id || this.activeZoneId)) return;
        const fieldId = this.net?._getCurrentFieldId?.() || null;
        if (typeof this.net?.readFieldBossState === 'function'
            && this._fieldBossStateReadyFieldId !== fieldId) return;

        const existingBoss = Array.from(this.monsters.values()).find((monster) => (
            monster?.typeId === rule.monsterId && !monster.isDead
        ));
        if (existingBoss) {
            this.zoneBossSpawned = true;
            return;
        }

        this.zoneBossSpawned = false;
        if (this._getAuthoritativeNow() < Number(this.zoneBossRespawnAt || 0)) return;

        this.zoneBossSpawnPending = true;
        const generation = this.worldGeneration;
        const zoneId = this.activeZoneId;
        const now = this._getAuthoritativeNow();
        const bossInstanceId = `mob_${Math.round(now)}_${Math.floor(Math.random() * 1000)}`;
        const isCurrentWorld = () => generation === this.worldGeneration
            && zoneId === this.activeZoneId
            && fieldId === this.net?._getCurrentFieldId?.()
            && this.net?.isHost;
        const claimPromise = typeof this.net?.claimFieldBossSpawn === 'function'
            ? this.net.claimFieldBossSpawn({
                zoneId,
                bossMonsterId: rule.monsterId,
                bossInstanceId,
                respawnSeconds: Math.max(20, Number(rule.respawnSeconds ?? 180)),
                now,
                leaseMs: 15000,
                expectedStaleAliveInstanceId: this._staleFieldBossMarker?.bossInstanceId || null,
                expectedStaleAliveTs: Number(this._staleFieldBossMarker?.ts || 0)
            }, { fieldId })
            : Promise.resolve(true);

        Promise.resolve(claimPromise).then((claimed) => {
            if (!isCurrentWorld() || !claimed) {
                if (isCurrentWorld() && !claimed) this.zoneBossRespawnAt = now + 2500;
                return null;
            }
            this.zoneBossInstanceId = bossInstanceId;
            this._staleFieldBossMarker = null;
            return this._spawnMonster(rule.point.x, rule.point.y, rule.monsterId, {
                isBoss: true,
                spawnGroupId: `${zoneId}:field_boss`,
                generation,
                zoneId,
                fieldId,
                instanceId: bossInstanceId
            });
        }).then((bossId) => {
            if (!bossId || generation !== this.worldGeneration || zoneId !== this.activeZoneId) return;
            this.zoneBossSpawned = true;
            this.zoneBossInstanceId = bossId;
            this.zoneBossDefeatedAt = 0;
            this.zoneBossRespawnAt = 0;
            this._publishZoneBossFieldState({
                phase: 'alive',
                bossAlive: true,
                bossInstanceId: bossId,
                bossDefeatedAt: 0,
                bossRespawnAt: 0
            });
            window.game?.ui?.showCenterMessage?.(`${rule.displayName || '필드 보스'} 출현!`, '#ffd76b', {
                duration: 2400,
                className: 'boss-alert'
            });
            window.game?.ui?.logSystemMessage?.(`⚔️ ${rule.displayName || rule.monsterId}이(가) 나타났습니다!`);
        }).catch((error) => {
            if (generation !== this.worldGeneration || zoneId !== this.activeZoneId) return;
            Logger.warn(`[MonsterManager] Failed to spawn field boss ${rule.monsterId}`, error);
            this.zoneBossRespawnAt = this._getAuthoritativeNow() + 5000;
        }).finally(() => {
            if (generation === this.worldGeneration && zoneId === this.activeZoneId) {
                this.zoneBossSpawnPending = false;
            }
        });
    }

    _updateHostLogic(dt, localPlayer, remotePlayers) {
        // A promoted host must finish hydrating the authoritative snapshot before
        // it simulates, rewards, or refills the field. Otherwise its guest-side
        // AOI subset can be mistaken for the complete world and duplicated.
        if (this._hostSnapshotRestorePromise) return;
        const mobileThermalMode = !!this.game?.isMobilePerformanceMode;
        const isProtectedPlayer = (player) => {
            const currentScene = this.game.sceneManager?.currentScene;
            if (!player || typeof currentScene?.isPlayerProtected !== 'function') return false;
            return currentScene.isPlayerProtected(player);
        };

        // v1.99: Level sum already calculated in update()

        if (!this.isSpawnSuppressed() && this.spawnRules && this.spawnRules.length > 0) {
            // Zone-based Spawning Logic
            this.spawnTimer += dt;
            if (this.spawnTimer >= 0.5) { // Check twice per second for quicker refill
                this.spawnTimer = 0;

                this.spawnRules.forEach(rule => {
                    const groupId = rule.id;
                    let currentCount = 0;
                    this.monsters.forEach(m => {
                        if (!m.isDead && m.spawnGroupId === groupId) currentCount++;
                    });

                    const pendingCount = Number(this.pendingSpawnGroups.get(groupId) || 0);
                    const targetCount = Math.max(0, Number(rule.count || 0));
                    if (currentCount + pendingCount >= targetCount) {
                        if (targetCount > 0) this.primedSpawnGroups.add(groupId);
                        return;
                    }
                    const nowMs = Date.now();
                    if (nowMs >= Number(this.spawnGroupNextAt.get(groupId) || 0)) {
                        const area = rule.area || { x: 200, y: 200, w: Math.max(200, this.zone.width - 400), h: Math.max(200, this.zone.height - 400) };
                        const x = area.x + Math.random() * area.w;
                        const y = area.y + Math.random() * area.h;
                        this.pendingSpawnGroups.set(groupId, pendingCount + 1);
                        const refillDelaySeconds = this.primedSpawnGroups.has(groupId)
                            ? Math.max(0.5, Number(rule.respawnSeconds || 2))
                            : 0.5;
                        this.spawnGroupNextAt.set(groupId, nowMs + refillDelaySeconds * 1000);
                        this._spawnMonster(x, y, rule.monsterId, { spawnGroupId: groupId })
                            .catch((error) => Logger.warn(`Failed to spawn ${rule.monsterId} for ${groupId}`, error))
                            .finally(() => {
                                const remaining = Math.max(0, Number(this.pendingSpawnGroups.get(groupId) || 1) - 1);
                                if (remaining > 0) this.pendingSpawnGroups.set(groupId, remaining);
                                else this.pendingSpawnGroups.delete(groupId);
                            });
                    }
                });
            }
        } else if (!this.isSpawnSuppressed()) {
            // Legacy Random Spawning Logic
            // v1.97: Dynamic Spawning: 15 + 1 per 5 levels (Balanced)
            const maxMonsters = 15 + Math.floor(this.totalLevelSum / 5);
            let liveMonsterCount = 0;
            this.monsters.forEach((monster) => {
                if (monster && !monster.isDead) {
                    liveMonsterCount += 1;
                }
            });

            // v2.4.4: Bring normal-field respawns back closer to 2s after kills.
            const spawnInterval = Math.max(0.5, 2 - Math.floor(this.totalLevelSum / 8) * 0.1);

            this.spawnTimer += dt;
            if (this.spawnTimer >= spawnInterval) {
                this.spawnTimer = 0;
                if (liveMonsterCount < maxMonsters) {
                    this._spawnMonster();
                }
            }
        }

        this._updateZoneBossSpawn();

        // v0.00.45: Host Heartbeat (Every 5 seconds)
        this.hostHeartbeatTimer = (this.hostHeartbeatTimer || 0) + dt;
        if (this.hostHeartbeatTimer >= 5.0) {
            this.hostHeartbeatTimer = 0;

            // v0.00.48: Removed Force 10-Kill logic. 
            // Quest progression is now strictly based on accumulated kills (0->30).
            // Legacy code removed.
        }


        // Boss Spawning (Legacy dead code removed)
        // Boss is now spawned directly via _handleMonsterDeath based on Kill Count

        // --- Host Authority: Monster AI & Sync ---
        const candidates = this._getInterestedPlayers(localPlayer, remotePlayers, isProtectedPlayer);
        const now = Date.now();

        this.monsters.forEach((m, id) => {
            // v1.88: Handle Quest Rewards & Drops IMMEDIATELY when isDead flips (Host only)
            if (m.isDead && !m._wasProcessed) {
                m._wasProcessed = true; // One-time flag
                this._prepareMonsterDeathSettlement(m);
                m._deathSettlementReady = true;

                // v0.00.43: Handle Death Logic (Kill Count & Boss Spawn)
                this._handleMonsterDeath(m);

                // Spawn Drops
                const shouldProcessRewards = m.typeId !== 'training_dummy'
                    && !this.shouldSuppressWorldFeedback(m);
                if (shouldProcessRewards) {
                    const attackerId = m.lastAttackerId || null;
                    const participantIds = this._getMonsterParticipantIds(m, attackerId);
                    if (!attackerId && participantIds.length === 0) {
                        Logger.warn(`[MonsterManager] Skipping orphan drops for ${m.id} (${m.typeId}) without participants`);
                    } else {
                        const killerPartyMembers = this._getPartyMembersForPlayer(attackerId);
                        const eligibleCollectorIds = participantIds.length > 0
                            ? participantIds
                            : killerPartyMembers;
                        const xpAmount = Math.max(1, Math.floor(Number(m.exp || (m.isBoss ? 500 : 25))));
                        const monsterLevel = Math.max(1, Number(m.definition?.baseStats?.level || 1));
                        const manastoneAmount = this._getMonsterManastoneReward(m);
                        const manastoneDropIdentity = this._buildDeterministicMonsterDropIdentity(m, 'manastone_0');
                        this._authorMonsterDrop(m, {
                            id: manastoneDropIdentity.id,
                            sourceRewardId: manastoneDropIdentity.sourceRewardId,
                            x: m.x,
                            y: m.y,
                            type: 'manastone',
                            amount: manastoneAmount,
                            ownerId: attackerId,
                            partyMembers: killerPartyMembers,
                            eligibleCollectorIds,
                            forceNetwork: true
                        });
                        this._grantMonsterExpReward(xpAmount, {
                            attackerId,
                            partyMembers: killerPartyMembers,
                            eligibleCollectorIds,
                            monsterLevel,
                            isBoss: !!m.isBoss,
                            monster: m
                        });
                        if (this._getDeterministicMonsterUnit(m, 'hp_0:chance') > 0.5 || m.isBoss) {
                            const hpDropIdentity = this._buildDeterministicMonsterDropIdentity(m, 'hp_0');
                            this._authorMonsterDrop(m, {
                                id: hpDropIdentity.id,
                                sourceRewardId: hpDropIdentity.sourceRewardId,
                                x: m.x - 20,
                                y: m.y + 10,
                                type: 'hp',
                                amount: 30,
                                ownerId: attackerId,
                                partyMembers: killerPartyMembers,
                                eligibleCollectorIds,
                                forceNetwork: true
                            });
                        }
                        this._grantMonsterItemDrops(m, attackerId);
                    }
                }

                // Quest & Splitting Logic (v0.00.14)
                if (localPlayer && shouldProcessRewards) {
                    const attackerId = m.lastAttackerId || null;
                    const sharedIntroQuestRecipients = (m.typeId === 'slime' || m.typeId === 'slime_split')
                        ? this._getSharedIntroQuestRecipients(attackerId).filter((uid) => uid && uid !== attackerId)
                        : [];

                    // Calculate Rewards (ground loot is separate, this is auto-grant Exp/Quest processing)
                    // Note: Manastone and some item rewards still use ground drops, while EXP is granted immediately.
                    // Wait, the code above spawns drops. This block is for QUESTS and NOTIFICATIONS.
                    // BUT, prompt says "Experience, Manastone... split 1/N".
                    // The standard game loop now keeps manastone on the ground while EXP is granted instantly.
                    // If drops exist, players pick them up individually.
                    // If shared, maybe "Picking up drop" splits it?
                    // OR: Remove drops and auto-grant?
                    // The code at line 124 SPOWNS drops.
                    // Maybe leave drops as is, but if they are picked up, handle split?
                    // OR: Don't spawn drops for partykills, just grant?
                    // "Shared Experience, Manastone... (1/N distribution)"
                    // If I change drop logic, I break pickup animation.
                    // BETTER: Modify `collectDrop` in NetworkManager to handle split.
                    // BUT here, let's handle QUEST updates for party members if needed.
                    // Actually, usually quests are "Kill Count". Everyone in party witnessing kill gets +1?
                    // Prompt doesn't say "Shared Quest Progress". It says "Shared Exp, Manastone".
                    // Manastone still uses drops; EXP is already distributed here.

                    // However, we still need to process QUESTS for the KILLER (or Party?).
                    // Let's assume Quest completion is individual for now (or shared if specified, but prompt says Exp/Manastone).
                    // So I will leave Quest Logic mostly as is, but handle `isMyKill` check.

                    // wait, lines 135-170 handle LOCAL QUEST updates.
                    // If I am in party, should my kill count for others? "Shared Experience" usually implies shared kills too?
                    // Let's stick to explicit prompt: "Shared Exp, Manastone".
                    // So Quest is personal.

                    // But wait, the reward notification at line 172 sends `questKill`.
                    // I will keep this block for Quest Updates.

                    sharedIntroQuestRecipients.forEach((uid) => {
                        this._grantMonsterQuestCredit(m, uid, { introSharedQuest: true });
                    });

                    if (m.typeId === 'king_slime') {
                        const bossCycle = ['intro', 'repeat'].includes(m.bossCycle)
                            ? m.bossCycle
                            : ((this.firstBossDefeated
                                || Number(localPlayer?.questData?.bossClearCount || 0) > 0)
                                ? 'repeat'
                                : 'intro');
                        const participantIds = this._getMonsterParticipantIds(m, attackerId);
                        participantIds.forEach((uid) => {
                            if (!uid) return;
                            this._authorMonsterReward(m, uid, {
                                questKill: 'king_slime',
                                monsterName: m.name,
                                bossCycle,
                                bossReward: true,
                                rewardId: this._buildDeterministicRewardId(m, uid, 'boss_quest')
                            });
                        });

                        // Spawn logic for Boss Split
                        // v0.00.70: king slime(chargeOnly) also spawns chargeOnly children.
                        for (let i = 0; i < 3; i++) {
                            const offX = (this._getDeterministicMonsterUnit(m, `king_split_${i}:x`) - 0.5) * 100;
                            const offY = (this._getDeterministicMonsterUnit(m, `king_split_${i}:y`) - 0.5) * 100;
                            this._authorMonsterChild(m, {
                                x: m.x + offX,
                                y: m.y + offY,
                                type: 'slime_split',
                                options: {
                                    chargeOnly: m.chargeOnly,
                                    instanceId: this._buildDeterministicChildMonsterId(m, 'slime_split', i)
                                }
                            });
                        }
                    } else if (attackerId) {
                        // Route self and remote quest credit through the same
                        // deterministic receipt. During a host handoff the old
                        // and new host can briefly observe the same death, but
                        // only one profile mutation may be committed.
                        this._grantMonsterQuestCredit(m, attackerId);

                        if (m.typeId === 'slime_split') {
                            for (let i = 0; i < 2; i++) {
                                const offX = (this._getDeterministicMonsterUnit(m, `slime_split_${i}:x`) - 0.5) * 60;
                                const offY = (this._getDeterministicMonsterUnit(m, `slime_split_${i}:y`) - 0.5) * 60;
                                this._authorMonsterChild(m, {
                                    x: m.x + offX,
                                    y: m.y + offY,
                                    type: 'slime',
                                    options: {
                                        instanceId: this._buildDeterministicChildMonsterId(m, 'slime', i)
                                    }
                                });
                            }
                        }
                    }
                }
                m._deathSettlementReady = this._isMonsterDeathSettlementReady(m);
            }

            if (m.isDead && !this._isMonsterDeathSettlementReady(m)) {
                this._retryPendingMonsterDeathSettlement(m, now);
            }

            if (m.isDead
                && m.deathTimer >= m.deathDuration
                && this._isMonsterDeathSettlementReady(m)) {
                // v1.86: Only remove after fade duration
                Logger.info(`[HOST] REMOVING Monster after death fade: ${id} (${m.name})`);
                this._clearPlayerTargetIfMatches(m);
                this.net.removeMonster(id, {
                    deathChildIds: Array.from(m._completedDeathChildIds || [])
                });
                this.monsters.delete(id);
                this.lastSyncState.delete(id);
                this.monsterRegionMap.delete(id);
                this.monsterRevisionMap.delete(id);
                return;
            }

            // AI and Movement are now handled inside Monster.js update()
            // to avoid double-update conflicts on the Host.
            // We just fall through to the Sync part below.

            // v0.33.0: Host-side Boss AI (Shield)
            // v0.00.76: chargeOnly면 쉴드 비활성화 (돌진만 사용)
            if (!m.isDead && m.typeId === 'king_slime' && !m.chargeOnly) {
                // v0.00.47: Boss Shield Logic
                if (m.shieldCooldown > 0) m.shieldCooldown -= dt * 1000;
            }

            // v0.00.43: Charge Skill (All Slimes: slime, slime_split, king_slime)
            if (!m.isDead && (m.typeId === 'slime' || m.typeId === 'slime_split' || m.typeId === 'king_slime')) {
                if (m.chargeCooldown > 0) m.chargeCooldown -= dt * 1000;

                // Find Target (if not already found by previous logic)
                let target = this._isValidMonsterTarget(m.targetPlayer, isProtectedPlayer)
                    ? m.targetPlayer
                    : null;
                if (!target && m.targetPlayer) {
                    m.targetPlayer = null;
                }
                if (!target && candidates.length > 0) {
                    let minDist = 9999;
                    candidates.forEach(p => {
                        const d = Math.sqrt((m.x - p.x) ** 2 + (m.y - p.y) ** 2);
                        if (d < minDist) {
                            minDist = d;
                            target = p;
                        }
                    });
                    m.targetPlayer = target;
                }

                if (target && m.chargeCooldown <= 0 && m.chargeState === 'idle') {
                    const targetX = target.x + ((target.width || 0) / 2);
                    const targetY = target.y + ((target.height || 0) / 2);
                    const dist = Math.sqrt((m.x - targetX) ** 2 + (m.y - targetY) ** 2);

                    // Variable Range & Cooldown Logic
                    let chargeRange = 400;
                    let cdTime = 4000;
                    let minChargeDistance = 95;

                    if (m.typeId === 'slime_split') {
                        chargeRange = 500;
                        cdTime = 10000; // v1.1: 10s Cooldown
                        minChargeDistance = 110;
                    }
                    if (m.typeId === 'king_slime') {
                        chargeRange = 800;
                        cdTime = 10000; // v1.1: 10s Cooldown
                        minChargeDistance = 140;
                    }

                    if (dist < chargeRange && dist > minChargeDistance) {
                        // Start Charge!
                        m.startCharge(targetX, targetY);
                        m.chargeCooldown = cdTime;

                        // Sync to Clients
                        this.net.sendMonsterAttack(m.id, 'charge', { x: targetX, y: targetY });
                    }
                }
            }

            // --- Bandwidth Throttling (Priority/AOI aware) ---
            if (this.net?.shouldUseMonsterQuietMode?.()) {
                return;
            }

            const last = this.lastSyncState.get(id);
            const profile = this._getMonsterSyncProfile(m, candidates, mobileThermalMode);
            const lastNetTs = last?.netTs || 0;
            if (last && (now - lastNetTs) < profile.deltaIntervalMs) {
                return;
            }

            const dist = last ? Math.sqrt((m.x - last.x) ** 2 + (m.y - last.y) ** 2) : 999;
            const hpChanged = !last || m.hp !== last.hp || m.maxHp !== last.maxHp;
            const stateChanged = !last
                || last.state !== this._getMonsterNetworkState(m)
                || last.isDead !== !!m.isDead
                || last.chargeOnly !== !!m.chargeOnly
                || last.isBoss !== !!m.isBoss;
            const currentCellId = this._getMonsterCellId(m);
            const cellChanged = !last || last.cellId !== currentCellId;
            const fullSyncDue = !last
                || stateChanged
                || cellChanged
                || (now - (last.fullSyncAt || 0)) >= profile.fullSyncIntervalMs;

            if (dist > profile.positionThreshold || hpChanged || stateChanged || fullSyncDue) {
                const immediate = stateChanged || !last;
                const payload = this._buildMonsterSyncPayload(m, {
                    fullSync: fullSyncDue,
                    immediate
                });
                this.net.sendMonsterUpdate(id, payload);
                this.lastSyncState.set(id, {
                    x: m.x,
                    y: m.y,
                    hp: m.hp,
                    maxHp: m.maxHp,
                    state: payload.state,
                    isDead: !!m.isDead,
                    chargeOnly: !!m.chargeOnly,
                    isBoss: !!m.isBoss,
                    cellId: payload.cellId,
                    rev: payload.rev,
                    netTs: now,
                    fullSyncAt: fullSyncDue ? now : (last?.fullSyncAt || 0)
                });
            }
        });
    }

    forceSync(id) {
        const m = this.monsters.get(id);
        if (!m || !this.net.isHost) return;

        const payload = this._buildMonsterSyncPayload(m, { fullSync: true, immediate: true });
        const writeResult = this.net.sendMonsterUpdate(id, payload);
        const now = Date.now();
        this.lastSyncState.set(id, {
            x: m.x,
            y: m.y,
            hp: m.hp,
            maxHp: m.maxHp,
            state: payload.state,
            isDead: !!m.isDead,
            chargeOnly: !!m.chargeOnly,
            isBoss: !!m.isBoss,
            cellId: payload.cellId,
            rev: payload.rev,
            netTs: now,
            fullSyncAt: now
        });
        return writeResult;
    }

    forceSyncAroundCell(cellId, options = {}) {
        if (!this.net.isHost || !cellId) return 0;
        const neighborhood = Math.max(0, Number(options.neighborhood || 1));
        let syncedCount = 0;

        this.monsters.forEach((monster, id) => {
            if (!monster || monster.isDead) return;
            if (!this._isMonsterInCellNeighborhood(monster, cellId, neighborhood)) return;
            this.forceSync(id);
            syncedCount += 1;
        });

        return syncedCount;
    }

    forceSyncAll(options = {}) {
        if (!this.net.isHost) return Promise.resolve([]);
        const writes = [];
        this.monsters.forEach((monster, id) => {
            if (!monster || (monster.isDead && !options.includeDead)) return;
            writes.push(Promise.resolve(this.forceSync(id)));
        });
        return Promise.all(writes);
    }

    forceSyncAllDrops() {
        if (!this.net.isHost) return Promise.resolve([]);
        const writes = [];
        this.drops.forEach((drop, id) => {
            if (!drop || !id) return;
            writes.push(Promise.resolve(this.net.publishDropSnapshot(id, {
                x: drop.x,
                y: drop.y,
                type: drop.type,
                amount: drop.amount,
                ownerId: drop.ownerId,
                partyMembers: drop.partyMembers,
                eligibleCollectorIds: drop.eligibleCollectorIds,
                sourceRewardId: drop.sourceRewardId,
                dropWorldEpoch: drop.dropWorldEpoch,
                dropFieldEpoch: drop.dropFieldEpoch,
                ts: drop.spawnedAt || Date.now()
            })));
        });
        return Promise.all(writes);
    }

    async hydrateFieldDropsFromSnapshot(options = {}) {
        if (typeof this.net?.readFieldDropsSnapshot !== 'function') {
            return { restored: 0, total: 0, skipped: true };
        }
        const generation = this.worldGeneration;
        const fieldId = options.fieldId || this.net?._getCurrentFieldId?.() || null;
        if (!fieldId) return { restored: 0, total: 0, skipped: true };
        if (this._fieldDropHydrationPromise && this._fieldDropHydrationFieldId === fieldId) {
            return this._fieldDropHydrationPromise;
        }

        if (options.replaceExisting) {
            this.drops.clear();
        }
        const isCurrentWorld = () => generation === this.worldGeneration
            && fieldId === this.net?._getCurrentFieldId?.();
        const settleMs = Number.isFinite(options.settleMs)
            ? Math.max(0, Number(options.settleMs))
            : 0;
        const hydrationPromise = (async () => {
            if (settleMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, settleMs));
                if (!isCurrentWorld()) {
                    return { restored: 0, total: 0, skipped: true, reason: 'stale_world' };
                }
            }

            const readAttempts = Math.max(1, Math.floor(Number(options.readAttempts || 1)));
            let snapshotData = null;
            let lastReadError = null;
            for (let attempt = 0; attempt < readAttempts; attempt += 1) {
                try {
                    snapshotData = await this.net.readFieldDropsSnapshot({
                        fieldId,
                        throwOnError: options.throwOnReadError === true
                    });
                    lastReadError = null;
                    break;
                } catch (error) {
                    lastReadError = error;
                    if (attempt + 1 < readAttempts) {
                        await new Promise((resolve) => setTimeout(resolve, 220));
                        if (!isCurrentWorld()) {
                            return { restored: 0, total: 0, skipped: true, reason: 'stale_world' };
                        }
                    }
                }
            }
            if (lastReadError) throw lastReadError;
            if (!isCurrentWorld()) {
                return { restored: 0, total: 0, skipped: true, reason: 'stale_world' };
            }

            const entries = Object.entries(snapshotData || {}).filter(([id, data]) => (
                !!id && !!data && typeof data === 'object'
            ));
            let restored = 0;
            for (const [id, data] of entries) {
                if (!isCurrentWorld()) {
                    return { restored, total: entries.length, skipped: true, reason: 'stale_world' };
                }
                const existed = this.drops.has(id);
                await this._onDropAdded(
                    { id, ...data },
                    { generation, fieldId }
                );
                if (!existed && this.drops.has(id)) restored += 1;
            }
            return { restored, total: entries.length, skipped: false };
        })();

        this._fieldDropHydrationPromise = hydrationPromise;
        this._fieldDropHydrationFieldId = fieldId;
        try {
            return await hydrationPromise;
        } finally {
            if (this._fieldDropHydrationPromise === hydrationPromise) {
                this._fieldDropHydrationPromise = null;
                this._fieldDropHydrationFieldId = null;
            }
        }
    }

    _getAuthoritativeNow() {
        const networkNow = this.net?.getServerNow?.();
        return Number.isFinite(networkNow) ? Number(networkNow) : Date.now();
    }

    _isDropExpired(drop) {
        if (!drop?.isExpired) return false;
        // Do not evaluate a server-authored spawn timestamp against an
        // uncorrected client clock while the offset handshake is pending.
        if (this.net?._serverTimeOffsetReady === false) return false;
        return drop.isExpired(this._getAuthoritativeNow());
    }

    async restoreFieldBossStateFromSnapshot(options = {}) {
        const rule = this.zoneBossRule;
        if (!rule?.monsterId || typeof this.net?.readFieldBossState !== 'function') {
            return { state: null, skipped: true };
        }
        const generation = this.worldGeneration;
        const fieldId = options.fieldId || this.net?._getCurrentFieldId?.() || null;
        const zoneId = this.activeZoneId;
        const bossMonsterId = rule.monsterId;
        const isCurrentWorld = () => generation === this.worldGeneration
            && this.net?.isHost
            && fieldId === this.net?._getCurrentFieldId?.()
            && zoneId === this.activeZoneId
            && bossMonsterId === this.zoneBossRule?.monsterId;
        const settleMs = Number.isFinite(options.settleMs)
            ? Math.max(0, Number(options.settleMs))
            : 0;

        if (settleMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, settleMs));
            if (!isCurrentWorld()) return { state: null, skipped: true, reason: 'stale_world' };
        }

        const readAttempts = Math.max(1, Math.floor(Number(options.readAttempts || 1)));
        let state = null;
        let lastReadError = null;
        for (let attempt = 0; attempt < readAttempts; attempt += 1) {
            try {
                state = await this.net.readFieldBossState({
                    fieldId,
                    bossMonsterId,
                    throwOnError: options.throwOnReadError === true
                });
                lastReadError = null;
                break;
            } catch (error) {
                lastReadError = error;
                if (attempt + 1 < readAttempts) {
                    await new Promise((resolve) => setTimeout(resolve, 220));
                    if (!isCurrentWorld()) return { state: null, skipped: true, reason: 'stale_world' };
                }
            }
        }
        if (lastReadError) throw lastReadError;
        if (!isCurrentWorld()) return { state: null, skipped: true, reason: 'stale_world' };
        return { state, skipped: !state };
    }

    _applyAuthoritativeFieldBossState(state, context = {}) {
        if (!state || typeof state !== 'object' || !this.zoneBossRule?.monsterId) return false;
        const fieldId = context.fieldId || this.net?._getCurrentFieldId?.() || null;
        const generation = Number.isFinite(context.generation) ? context.generation : this.worldGeneration;
        const current = this.net?.isHost
            && generation === this.worldGeneration
            && fieldId === this.net?._getCurrentFieldId?.()
            && state.fieldId === fieldId
            && this.activeZoneId === state.zoneId
            && this.zoneBossRule.monsterId === state.bossMonsterId;
        if (!current) return false;

        const matchingBosses = Array.from(this.monsters.entries()).filter(([, monster]) => (
            monster?.typeId === this.zoneBossRule.monsterId && !monster.isDead
        ));
        const stateTs = Math.max(0, Number(state.ts || state.bossDefeatedAt || 0));
        const now = this._getAuthoritativeNow();
        if (stateTs > now + 120000) return false;
        const phase = state.phase || (state.bossAlive ? 'alive' : 'defeated');

        if (phase === 'defeated') {
            if (!state.bossInstanceId && matchingBosses.length > 0) return false;
            const staleDifferentInstance = !!state.bossInstanceId
                && matchingBosses.some(([monsterId]) => monsterId !== state.bossInstanceId);
            if (staleDifferentInstance) return false;
            const replayableBossIds = new Set();
            if (state.deathSettlementPending === true && state.bossInstanceId) {
                matchingBosses
                    .filter(([monsterId]) => monsterId === state.bossInstanceId)
                    .forEach(([monsterId, monster]) => {
                        // The lifecycle record is written only after a replayable dead
                        // monster snapshot. Listener ordering can still expose the
                        // lifecycle first, so retain (and synthesize) the dead object
                        // instead of deleting the only carrier of reward attribution.
                        this._applyAuthoritativeSnapshotToMonster(monster, {
                            id: monsterId,
                            x: monster.x,
                            y: monster.y,
                            hp: 0,
                            maxHp: monster.maxHp,
                            type: monster.typeId,
                            isBoss: true,
                            state: 'dead',
                            deathSettlementPending: true,
                            lastAttackerId: state.lastAttackerId || null,
                            damageContributors: state.damageContributors || [],
                            damageContributorLevels: state.damageContributorLevels || [],
                            rev: Math.max(1, Number(monster.remoteSyncRev || 0) + 1),
                            ts: stateTs,
                            cellId: this._getMonsterCellId(monster)
                        });
                        monster._wasProcessed = false;
                        monster.deathTimer = 0;
                        this._prepareMonsterDeathSettlement(monster);
                        replayableBossIds.add(monsterId);
                    });
            }
            matchingBosses
                .filter(([monsterId]) => (
                    (!state.bossInstanceId || monsterId === state.bossInstanceId)
                    && !replayableBossIds.has(monsterId)
                ))
                .forEach(([monsterId]) => {
                this._removeMonsterLocalState(monsterId);
                this.net?.removeMonster?.(monsterId);
            });
            this.zoneBossSpawned = false;
            this.zoneBossInstanceId = state.bossInstanceId || null;
            this._staleFieldBossMarker = null;
            this.zoneBossDefeatedAt = Math.max(0, Number(state.bossDefeatedAt || stateTs));
            const respawnSeconds = Math.max(20, Number(this.zoneBossRule.respawnSeconds ?? 180));
            const computedRespawnAt = this.zoneBossDefeatedAt + (respawnSeconds * 1000);
            this.zoneBossRespawnAt = Math.max(0, Math.min(
                computedRespawnAt,
                now + (respawnSeconds * 1000) + 120000
            ));
            return true;
        }

        if (phase === 'alive') {
            const matchingInstance = matchingBosses.find(([monsterId]) => (
                !state.bossInstanceId || monsterId === state.bossInstanceId
            ));
            if (matchingInstance) {
                this.zoneBossSpawned = true;
                this.zoneBossInstanceId = matchingInstance[0];
                this.zoneBossDefeatedAt = 0;
                this.zoneBossRespawnAt = 0;
                this._staleFieldBossMarker = null;
                return true;
            }
            this._staleFieldBossMarker = {
                bossInstanceId: state.bossInstanceId || null,
                ts: stateTs
            };
        }

        if (phase === 'spawning' || phase === 'alive') {
            this.zoneBossSpawned = false;
            this.zoneBossInstanceId = state.bossInstanceId || null;
            this.zoneBossRespawnAt = Math.max(
                now + 1000,
                Math.min(Number(state.spawnLeaseUntil || 0), now + 20000),
                Math.min(stateTs + 15000, now + 20000)
            );
            return true;
        }

        if (phase === 'waiting') {
            this._staleFieldBossMarker = null;
            this.zoneBossSpawned = matchingBosses.length > 0;
            if (!this.zoneBossSpawned) {
                const maxWaitingMs = Math.max(5000, (Number(this.zoneBossRule.initialDelaySeconds || 0) + 10) * 1000);
                this.zoneBossRespawnAt = Math.max(0, Math.min(
                    Number(state.bossRespawnAt || 0),
                    now + maxWaitingMs
                ));
            }
            return true;
        }
        return false;
    }

    _scheduleFieldBossStateWriteRetry() {
        if (this._fieldBossStateRetryTimer || !this._pendingFieldBossStateWrite) return;
        this._fieldBossStateRetryTimer = setTimeout(() => {
            this._fieldBossStateRetryTimer = null;
            const pending = this._pendingFieldBossStateWrite;
            if (!pending
                || !this.net?.isHost
                || pending.generation !== this.worldGeneration
                || pending.fieldId !== this.net?._getCurrentFieldId?.()
                || pending.zoneId !== this.activeZoneId
                || pending.payload.bossMonsterId !== this.zoneBossRule?.monsterId) {
                this._pendingFieldBossStateWrite = null;
                return;
            }
            this._writeZoneBossFieldState(pending);
        }, 900);
    }

    _writeZoneBossFieldState(pending) {
        if (!pending || typeof this.net?.publishFieldBossState !== 'function') return Promise.resolve(false);
        return Promise.resolve(this.net.publishFieldBossState(pending.payload, { fieldId: pending.fieldId }))
            .then((written) => {
                if (this._pendingFieldBossStateWrite !== pending) return written;
                if (written) this._pendingFieldBossStateWrite = null;
                else this._scheduleFieldBossStateWriteRetry();
                return written;
            })
            .catch((error) => {
                Logger.warn('[MonsterManager] Failed to persist field boss lifecycle', error);
                if (this._pendingFieldBossStateWrite === pending) this._scheduleFieldBossStateWriteRetry();
                return false;
            });
    }

    _publishZoneBossFieldState(overrides = {}) {
        const rule = this.zoneBossRule;
        const fieldId = this.net?._getCurrentFieldId?.() || null;
        if (!this.net?.isHost || !fieldId || !rule?.monsterId) return Promise.resolve(false);
        if (this._fieldBossStateReadyFieldId !== fieldId) return Promise.resolve(false);
        const livingBoss = Array.from(this.monsters.entries()).find(([, monster]) => (
            monster?.typeId === rule.monsterId && !monster.isDead
        ));
        const bossAlive = typeof overrides.bossAlive === 'boolean'
            ? overrides.bossAlive
            : !!livingBoss;
        const bossInstanceId = overrides.bossInstanceId
            || livingBoss?.[0]
            || this.zoneBossInstanceId
            || null;
        const phase = overrides.phase
            || (bossAlive ? 'alive' : (this.zoneBossDefeatedAt > 0 ? 'defeated' : 'waiting'));
        if (phase === 'waiting' && overrides.allowWaitingWrite !== true) return Promise.resolve(false);
        const now = this._getAuthoritativeNow();
        const payload = {
            zoneId: this.activeZoneId,
            bossMonsterId: rule.monsterId,
            bossInstanceId,
            bossAlive,
            phase,
            bossRespawnAt: Math.max(0, Number(overrides.bossRespawnAt ?? this.zoneBossRespawnAt ?? 0)),
            bossDefeatedAt: Math.max(0, Number(overrides.bossDefeatedAt ?? this.zoneBossDefeatedAt ?? 0)),
            respawnSeconds: Math.max(0, Number(overrides.respawnSeconds ?? rule.respawnSeconds ?? 0)),
            spawnLeaseUntil: Math.max(0, Number(overrides.spawnLeaseUntil || 0)),
            deathSnapshotCommitted: overrides.deathSnapshotCommitted === true,
            deathSettlementPending: overrides.deathSettlementPending === true,
            lastAttackerId: overrides.lastAttackerId || null,
            damageContributors: Array.isArray(overrides.damageContributors)
                ? overrides.damageContributors.slice(0, 24)
                : [],
            damageContributorLevels: Array.isArray(overrides.damageContributorLevels)
                ? overrides.damageContributorLevels.slice(0, 24)
                : [],
            ts: Math.max(0, Number(overrides.ts || now))
        };
        const pending = {
            payload,
            fieldId,
            zoneId: this.activeZoneId,
            generation: this.worldGeneration
        };
        this._pendingFieldBossStateWrite = pending;
        return this._writeZoneBossFieldState(pending);
    }

    _authorFieldBossDefeat(monster, operation = null) {
        if (!monster || monster.typeId !== this.zoneBossRule?.monsterId) return true;
        if (monster._fieldBossDefeatCommitted) return true;
        this._prepareMonsterDeathSettlement(monster);
        const defeatOperation = {
            ...(operation || {}),
            phase: 'defeated',
            bossAlive: false,
            bossInstanceId: operation?.bossInstanceId || monster.id,
            bossDefeatedAt: operation?.bossDefeatedAt || this.zoneBossDefeatedAt,
            bossRespawnAt: operation?.bossRespawnAt || this.zoneBossRespawnAt,
            respawnSeconds: operation?.respawnSeconds
                || Math.max(20, Number(this.zoneBossRule?.respawnSeconds ?? 180)),
            deathSnapshotCommitted: true,
            deathSettlementPending: true,
            lastAttackerId: monster.lastAttackerId || null,
            damageContributors: Array.from(monster.damageContributors || []).filter(Boolean).slice(0, 24),
            damageContributorLevels: Array.from(monster.damageContributorLevels || [])
                .filter((entry) => Array.isArray(entry) && entry.length === 2)
                .slice(0, 24),
            ts: operation?.ts || this.zoneBossDefeatedAt
        };
        monster._pendingFieldBossDefeatOperation = defeatOperation;
        monster._deathSettlementReady = false;
        if (monster._fieldBossDefeatWritePromise) return false;

        const deathSnapshotPayload = this._buildMonsterSyncPayload(monster, {
            fullSync: true,
            immediate: true
        });
        let writePromise = null;
        writePromise = Promise.resolve(
            monster._fieldBossDeathSnapshotCommitted === true
                ? true
                : this.net?.sendMonsterUpdate?.(monster.id, deathSnapshotPayload)
        )
            .then((snapshotWritten) => {
                if (snapshotWritten !== true) return false;
                monster._fieldBossDeathSnapshotCommitted = true;
                return this._publishZoneBossFieldState(defeatOperation);
            })
            .then((written) => {
                if (written) {
                    monster._fieldBossDefeatCommitted = true;
                    monster._pendingFieldBossDefeatOperation = null;
                    return true;
                }
                return false;
            })
            .finally(() => {
                if (monster._fieldBossDefeatWritePromise === writePromise) {
                    monster._fieldBossDefeatWritePromise = null;
                }
            });
        monster._fieldBossDefeatWritePromise = writePromise;
        return false;
    }

    recordFieldBossDefeat(monster) {
        if (!this.net?.isHost
            || !monster
            || monster.typeId !== this.zoneBossRule?.monsterId) return false;
        if (!monster._fieldBossLifecycleRecorded) {
            monster._fieldBossLifecycleRecorded = true;
            const defeatedAt = this._getAuthoritativeNow();
            const respawnSeconds = Math.max(20, Number(this.zoneBossRule?.respawnSeconds ?? 180));
            this.zoneBossSpawned = false;
            this.zoneBossInstanceId = monster.id || null;
            this.zoneBossDefeatedAt = defeatedAt;
            this.zoneBossRespawnAt = defeatedAt + (respawnSeconds * 1000);
            this._staleFieldBossMarker = null;
        }
        return this._authorFieldBossDefeat(monster, monster._pendingFieldBossDefeatOperation);
    }

    settleMonsterDeathImmediately(monster) {
        if (!this.net?.isHost || !monster?.isDead || monster._wasProcessed) {
            return !!monster?._wasProcessed;
        }
        if (this._immediateDeathSettlementActive) return false;

        const sceneRemotePlayers = this.game?.sceneManager?.currentScene?.remotePlayers;
        const remotePlayers = sceneRemotePlayers instanceof Map
            ? sceneRemotePlayers
            : (this.game?.remotePlayers instanceof Map ? this.game.remotePlayers : new Map());
        const previousSpawnTimer = this.spawnTimer;
        const previousBossSpawnPending = this.zoneBossSpawnPending;
        this._immediateDeathSettlementActive = true;
        this.spawnTimer = Number.NEGATIVE_INFINITY;
        this.zoneBossSpawnPending = true;
        try {
            // Reuse the canonical host settlement path synchronously so rewards,
            // deterministic boss items, quest credit, and ground drops are all
            // authored before this client can be demoted.
            this._updateHostLogic(0, this.game?.localPlayer || null, remotePlayers);
        } catch (error) {
            Logger.error(`[MonsterManager] Immediate death settlement failed for ${monster.id}`, error);
        } finally {
            this.spawnTimer = previousSpawnTimer;
            this.zoneBossSpawnPending = previousBossSpawnPending;
            this._immediateDeathSettlementActive = false;
        }
        return !!monster._wasProcessed;
    }

    _applyAuthoritativeSnapshotToMonster(monster, data) {
        if (!monster || !data) return;

        if (Number.isFinite(data.x)) {
            monster.x = data.x;
            monster.targetX = data.x;
        }
        if (Number.isFinite(data.y)) {
            monster.y = data.y;
            monster.targetY = data.y;
        }
        if (Number.isFinite(data.hp)) monster.hp = data.hp;
        if (Number.isFinite(data.maxHp)) monster.maxHp = data.maxHp;
        if (data.isBoss) {
            monster.isBoss = true;
            if (Number.isFinite(data.w)) monster.width = data.w;
            if (Number.isFinite(data.h)) monster.height = data.h;
        }
        monster.chargeOnly = !!data.chargeOnly;
        applySlimeCombatOverrides(monster, data.type || monster.typeId);
        monster.isDead = false;
        monster.deathTimer = 0;
        monster.lastNetworkEventAt = Number(data.ts || Date.now());

        this._applyRemoteMonsterNetworkState(monster, data);
        this.monsterRevisionMap.set(
            monster.id,
            Math.max(Number(data.rev || 0), Number(this.monsterRevisionMap.get(monster.id) || 0))
        );
    }

    _removeMonsterLocalState(id) {
        if (!id) return;
        const monster = this.monsters.get(id);
        if (monster?.typeId === 'king_slime') {
            this.bossSpawned = false;
        } else if (monster?.isBoss) {
            this.zoneBossSpawned = false;
            const fieldMusic = this.zone?.currentZone?.background?.music || 'bgm_cabin';
            this.game?.sound?.loadAndPlayBgm?.(fieldMusic);
        }
        this._clearPlayerTargetIfMatches(id);
        this.tutorialMonsterIds.delete(id);
        this.lastSyncState.delete(id);
        this.monsterRegionMap.delete(id);
        this.monsterRevisionMap.delete(id);
        this.monsters.delete(id);
    }

    markFirstBossPending(active = true) {
        this.firstBossPending = !!active;
        if (active) {
            this.firstBossMissingTimer = 0;
        }
    }

    async restorePendingIntroBossQuest(localPlayer = this.game?.localPlayer, options = {}) {
        if (this.firstBossRestorePromise) {
            return this.firstBossRestorePromise;
        }

        this.firstBossRestorePromise = (async () => {
            if ((this.zone?.currentZone?.id || this.activeZoneId) !== 'zone_1') {
                return { restored: false, reason: 'intro_boss_zone_only' };
            }
            const questData = localPlayer?.questData;
            if (!questData) {
                return { restored: false, reason: 'no_quest_data' };
            }

            const hasIntroBossClear = (questData.bossClearCount || 0) > 0
                || !!questData.bossKilled
                || !!questData.bossQuestClaimed;
            const isIntroBossQuestActive = !!questData.slime30QuestClaimed && !hasIntroBossClear;

            if (!isIntroBossQuestActive) {
                if (hasIntroBossClear) {
                    this.firstBossPending = false;
                    this.firstBossMissingTimer = 0;
                }
                return { restored: false, reason: 'quest_inactive' };
            }

            const liveIntroBoss = Array.from(this.monsters.values()).some((monster) => monster?.typeId === 'king_slime' && !monster.isDead);
            if (liveIntroBoss || this.bossSpawned) {
                this.firstBossPending = true;
                this.firstBossMissingTimer = 0;
                return { restored: false, reason: 'already_present' };
            }

            this.firstBossPending = true;
            this.firstBossMissingTimer = 0;

            const authoritativeHostExists = !!(
                this.net?.connected
                && !this.net.isHost
                && this.net.currentHostId
                && this.net.currentHostId !== this.net.playerId
            );

            if (authoritativeHostExists) {
                this.firstBossMissingTimer = -4;
                this.net.requestBossSpawn?.({ isFirstBoss: true });
                this.game.ui?.logSystemMessage?.('재접속으로 끊긴 대왕 슬라임 퀘스트를 복구 중입니다.');
                return {
                    restored: true,
                    requested: true,
                    reason: options.reason || 'requested_host_spawn'
                };
            }

            const bossId = await this._spawnBoss(true);
            if (!bossId) {
                return { restored: false, reason: 'spawn_failed' };
            }

            this.slimeKillCount = 0;
            this.game.ui?.logSystemMessage?.('재접속으로 사라진 대왕 슬라임을 다시 불러왔습니다.');

            return {
                restored: true,
                bossId,
                reason: options.reason || 'respawned_missing_intro_boss'
            };
        })();

        try {
            return await this.firstBossRestorePromise;
        } finally {
            this.firstBossRestorePromise = null;
        }
    }

    _checkFirstBossQuestFailure(dt, localPlayer) {
        if (this.shouldSuppressWorldFeedback()) {
            this.firstBossMissingTimer = 0;
            return;
        }

        const questData = localPlayer?.questData;
        if (!questData) {
            this.firstBossMissingTimer = 0;
            return;
        }

        const hasIntroBossClear = (questData.bossClearCount || 0) > 0
            || !!questData.bossKilled
            || !!questData.bossQuestClaimed;
        const hasIntroBossParticipation = !!questData.introBossParticipated;
        const isIntroBossQuestActive = !!questData.slime30QuestClaimed
            && !hasIntroBossClear;

        if (!isIntroBossQuestActive) {
            this.firstBossMissingTimer = 0;
            if (hasIntroBossClear) {
                this.firstBossPending = false;
            }
            return;
        }

        const liveIntroBoss = Array.from(this.monsters.values()).some((monster) => monster?.typeId === 'king_slime' && !monster.isDead);
        if (liveIntroBoss || this.bossSpawned) {
            this.firstBossPending = true;
            this.firstBossMissingTimer = 0;
            return;
        }

        if (!this.firstBossPending) {
            this.restorePendingIntroBossQuest(localPlayer, {
                reason: 'runtime_missing_intro_boss'
            }).catch((error) => {
                Logger.warn('[MonsterManager] Failed to restore intro boss quest state.', error);
            });
            return;
        }

        this.firstBossMissingTimer += dt;
        if (this.firstBossMissingTimer < 3.0) {
            return;
        }

        this.firstBossMissingTimer = 0;
        this.firstBossPending = false;
        if (hasIntroBossParticipation) {
            localPlayer.receiveReward({
                questKill: 'king_slime',
                monsterName: '대왕 슬라임',
                bossCycle: 'intro'
            }, {
                debounceMs: 0
            });
            questData.introBossParticipated = false;
            this.game.quests?.restoreFromLegacy?.(questData);
            this.game.ui?.logSystemMessage?.('대왕 슬라임 참여가 인정되어 첫 보스 토벌이 완료되었습니다.');
            this.game.ui?.updateQuestUI?.();
            return;
        }
        questData.slimeKills = 0;
        questData.slime30QuestClaimed = false;
        questData.introBossParticipated = false;
        questData.bossKilled = false;
        questData.bossQuestClaimed = false;
        localPlayer.saveProfilePatch?.(['questData'], {
            debounceMs: 0,
            reason: 'intro_boss_quest_failed'
        });
        this.game.quests?.restoreFromLegacy?.(questData);
        this.game.ui?.logSystemMessage?.('대왕 슬라임이 사라져 퀘스트가 실패했습니다. 슬라임 30마리 퀘스트부터 다시 진행합니다.');
        this.game.ui?.updateQuestUI?.();
    }

    async restoreAuthoritativeMonstersFromHostSnapshot(options = {}) {
        if (!this.net?.isHost || typeof this.net?.readMonsterHostSnapshot !== 'function') {
            return { restored: 0, updated: 0, removed: 0, total: 0, skipped: true };
        }
        const now = Date.now();
        const fieldId = this.net?._getCurrentFieldId?.() || null;
        if (this._hostSnapshotRestorePromise && this._hostSnapshotRestoreFieldId === fieldId) {
            return this._hostSnapshotRestorePromise;
        }
        if (!options.force && this._lastHostSnapshotRestoreTs > 0 && (now - this._lastHostSnapshotRestoreTs) < 600) {
            return { restored: 0, updated: 0, removed: 0, total: 0, skipped: true };
        }

        const generation = this.worldGeneration;
        const isCurrentWorld = () => generation === this.worldGeneration
            && (!fieldId || fieldId === this.net?._getCurrentFieldId?.());
        const settleMs = Number.isFinite(options.settleMs)
            ? Math.max(0, Number(options.settleMs))
            : 0;
        const restorePromise = (async () => {
            if (settleMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, settleMs));
                if (!isCurrentWorld()) {
                    return { restored: 0, updated: 0, removed: 0, total: 0, skipped: true, reason: 'stale_world' };
                }
            }
            const readAttempts = Math.max(1, Math.floor(Number(options.readAttempts || 1)));
            let snapshotData = null;
            let lastReadError = null;
            for (let attempt = 0; attempt < readAttempts; attempt += 1) {
                try {
                    snapshotData = await this.net.readMonsterHostSnapshot({
                        throwOnError: options.throwOnReadError === true
                    });
                    lastReadError = null;
                    break;
                } catch (error) {
                    lastReadError = error;
                    if (attempt + 1 < readAttempts) {
                        await new Promise((resolve) => setTimeout(resolve, 220));
                        if (!isCurrentWorld()) {
                            return { restored: 0, updated: 0, removed: 0, total: 0, skipped: true, reason: 'stale_world' };
                        }
                    }
                }
            }
            if (lastReadError) throw lastReadError;
            if (!isCurrentWorld()) {
                return { restored: 0, updated: 0, removed: 0, total: 0, skipped: true, reason: 'stale_world' };
            }
            const snapshotEntries = Object.entries(snapshotData || {}).filter(([id, data]) => (
                !!id && !!data && typeof data === 'object'
            ));
            let restored = 0;
            let updated = 0;
            let removed = 0;
            const deadSnapshotIds = new Set(snapshotEntries
                .filter(([, data]) => (
                    (Number(data.hp || 0) <= 0 || data.state === 'dead')
                    && data.deathSettlementPending !== true
                ))
                .map(([id]) => id));
            deadSnapshotIds.forEach((monsterId) => {
                if (!this.monsters.has(monsterId)) return;
                this._removeMonsterLocalState(monsterId);
                removed += 1;
            });
            const entries = snapshotEntries.filter(([id, data]) => {
                if (!id || !data || typeof data !== 'object') return false;
                const dead = Number(data.hp || 0) <= 0 || data.state === 'dead';
                if (dead && data.deathSettlementPending !== true) return false;
                return true;
            });

            const snapshotIds = new Set(entries.map(([id]) => id));

            Array.from(this.monsters.keys()).forEach((monsterId) => {
                const monster = this.monsters.get(monsterId);
                if (!monster || monster.isLocalOnly || this.tutorialMonsterIds.has(monsterId)) return;
                if (snapshotIds.has(monsterId)) return;
                this._removeMonsterLocalState(monsterId);
                removed += 1;
            });

            for (const [id, data] of entries) {
                if (!isCurrentWorld()) {
                    return { restored, updated, removed, total: entries.length, skipped: true, reason: 'stale_world' };
                }
                const payload = {
                    id,
                    ...data,
                    fullSync: true,
                    immediate: true
                };
                const existing = this.monsters.get(id);
                if (!existing) {
                    await this._onRemoteMonsterAdded(payload, { generation, fieldId });
                    if (!isCurrentWorld()) {
                        return { restored, updated, removed, total: entries.length, skipped: true, reason: 'stale_world' };
                    }
                    const added = this.monsters.get(id);
                    if (added) {
                        this.monsterRevisionMap.set(id, Math.max(Number(data.rev || 0), Number(this.monsterRevisionMap.get(id) || 0)));
                    }
                    restored += 1;
                    continue;
                }

                this._applyAuthoritativeSnapshotToMonster(existing, payload);
                updated += 1;
            }

            if (entries.length > 0) {
                this.lastSyncState.clear();
                if (!this.net?.shouldUseMonsterQuietMode?.()) {
                    await this.forceSyncAll();
                }
            }

            return {
                restored,
                updated,
                removed,
                total: entries.length,
                skipped: false
            };
        })();

        this._hostSnapshotRestorePromise = restorePromise;
        this._hostSnapshotRestoreFieldId = fieldId;
        this._lastHostSnapshotRestoreTs = now;

        try {
            return await restorePromise;
        } finally {
            if (this._hostSnapshotRestorePromise === restorePromise) {
                this._hostSnapshotRestorePromise = null;
                this._hostSnapshotRestoreFieldId = null;
            }
        }
    }

    async restoreVisibleMonstersFromHostSnapshot(options = {}) {
        if (this.net?.isHost || !this.net?.isSharedFieldActive?.() || typeof this.net?.readMonsterHostSnapshot !== 'function') {
            return { restored: 0, updated: 0, removedBosses: 0, total: 0, skipped: true };
        }

        const localPlayer = this.game?.localPlayer;
        if (!localPlayer) {
            return { restored: 0, updated: 0, removedBosses: 0, total: 0, skipped: true };
        }

        const now = Date.now();
        if (!options.force && this._lastGuestSnapshotHydrationTs > 0 && (now - this._lastGuestSnapshotHydrationTs) < 1500) {
            return { restored: 0, updated: 0, removedBosses: 0, total: 0, skipped: true };
        }
        if (this._guestSnapshotHydrationPromise && !options.force) {
            return this._guestSnapshotHydrationPromise;
        }

        const generation = this.worldGeneration;
        const fieldId = this.net?._getCurrentFieldId?.() || null;
        const isCurrentWorld = () => generation === this.worldGeneration
            && (!fieldId || fieldId === this.net?._getCurrentFieldId?.());
        const restorePromise = (async () => {
            const anchorCellId = this._getCellIdFromPosition(localPlayer.x, localPlayer.y);
            const neighborhood = Number.isFinite(options.neighborhood) ? Math.max(0, Number(options.neighborhood)) : 1;
            const desiredCells = new Set(this.net?._getFieldCellNeighborhood?.(anchorCellId, neighborhood) || [anchorCellId]);
            const snapshotData = await this.net.readMonsterHostSnapshot();
            if (!isCurrentWorld()) {
                return { restored: 0, updated: 0, removedBosses: 0, total: 0, skipped: true, reason: 'stale_world' };
            }
            const entries = Object.entries(snapshotData || {}).filter(([id, data]) => {
                if (!id || !data || typeof data !== 'object') return false;
                if (Number(data.hp || 0) <= 0) return false;
                if (data.state === 'dead') return false;
                return true;
            });

            let restored = 0;
            let updated = 0;
            let removedBosses = 0;
            const aliveBossIds = new Set();

            for (const [id, data] of entries) {
                if (!isCurrentWorld()) {
                    return { restored, updated, removedBosses, total: entries.length, skipped: true, reason: 'stale_world' };
                }
                const isBoss = !!data.isBoss || data.type === 'king_slime';
                if (isBoss) aliveBossIds.add(id);

                const monsterCellId = typeof data.cellId === 'string'
                    ? data.cellId
                    : this._getCellIdFromPosition(data.x, data.y);
                const shouldHydrate = isBoss || desiredCells.has(monsterCellId);
                if (!shouldHydrate) continue;

                const payload = {
                    id,
                    ...data,
                    fullSync: true,
                    immediate: true
                };
                const existing = this.monsters.get(id);
                if (!existing) {
                    await this._onRemoteMonsterAdded(payload, { generation, fieldId });
                    if (!isCurrentWorld()) {
                        return { restored, updated, removedBosses, total: entries.length, skipped: true, reason: 'stale_world' };
                    }
                    restored += 1;
                    continue;
                }

                if (!this._shouldAcceptRemoteMonsterUpdate(existing, payload)) continue;
                this._applyAuthoritativeSnapshotToMonster(existing, payload);
                updated += 1;
            }

            Array.from(this.monsters.entries()).forEach(([monsterId, monster]) => {
                if (!monster || (!monster.isBoss && monster.typeId !== 'king_slime')) return;
                if (aliveBossIds.has(monsterId)) return;
                this._removeMonsterLocalState(monsterId);
                removedBosses += 1;
            });

            return {
                restored,
                updated,
                removedBosses,
                total: entries.length,
                skipped: false
            };
        })();

        this._guestSnapshotHydrationPromise = restorePromise;
        this._lastGuestSnapshotHydrationTs = now;

        try {
            return await restorePromise;
        } finally {
            if (this._guestSnapshotHydrationPromise === restorePromise) {
                this._guestSnapshotHydrationPromise = null;
            }
        }
    }

    async _spawnMonster(fixedX = null, fixedY = null, type = 'slime', options = {}) {
        if (this._isHostFieldStateBlocked()) return null;
        const generation = Number.isFinite(options.generation) ? options.generation : this.worldGeneration;
        const zoneId = options.zoneId || this.activeZoneId;
        const fieldId = options.fieldId || this.net?._getCurrentFieldId?.() || null;
        const isCurrentWorld = () => generation === this.worldGeneration
            && zoneId === this.activeZoneId
            && zoneId === (this.zone?.currentZone?.id || this.activeZoneId)
            && this.net?.isHost
            && fieldId === this.net?._getCurrentFieldId?.();
        const id = typeof options.instanceId === 'string' && options.instanceId
            ? options.instanceId.slice(0, 128)
            : `mob_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const worldW = this.zone.width || 6400;
        const worldH = this.zone.height || 6400;
        const currentScene = this.game.sceneManager?.currentScene;
        const isSafePoint = (x, y) => typeof currentScene?.isPointInSafeZone === 'function' && currentScene.isPointInSafeZone(x, y, 80);

        let x = fixedX ?? (200 + Math.random() * (worldW - 400));
        let y = fixedY ?? (200 + Math.random() * (worldH - 400));

        if (isSafePoint(x, y)) {
            let attempts = 0;
            while (attempts < 12 && isSafePoint(x, y)) {
                x = 200 + Math.random() * (worldW - 400);
                y = 200 + Math.random() * (worldH - 400);
                attempts++;
            }
        }

        // Load definition first
        let definition = await this.game.monsterData.loadDefinition(type);
        if (!isCurrentWorld()) return null;
        if (!definition) definition = {}; // Fallback if missing

        const forceChargeOnly = isSlimeFamilyType(type) || !!options.chargeOnly;
        const isBoss = !!options.isBoss || definition.isBoss === true || definition.type === 'boss';
        const data = {
            id: id,
            x: Math.round(x),
            y: Math.round(y),
            hp: definition.baseStats?.hp || 100,
            maxHp: definition.baseStats?.maxHp || 100,
            type: type,
            isBoss,
            chargeOnly: forceChargeOnly, // Slimes are charge-only by design.
            spawnGroupId: options.spawnGroupId || null,
            deathParentId: typeof options.deathParentId === 'string' ? options.deathParentId : null,
            w: definition.visual?.width || 80,
            h: definition.visual?.height || 80,
            rev: this._nextMonsterRevision(id),
            ts: Date.now(),
            state: 'idle',
            cellId: this._getCellIdFromPosition(x, y)
        };

        if (options.tutorialOnly) {
            this.tutorialMonsterIds.add(id);
        }

        await this._onRemoteMonsterAdded(
            { ...data, fullSync: true, immediate: true },
            { generation, fieldId: this.net?._getCurrentFieldId?.() || null }
        );
        if (!isCurrentWorld() || !this.monsters.has(id)) return null;
        if (!this.net?.shouldUseMonsterQuietMode?.()) {
            const published = await this.net.sendMonsterUpdate(id, { ...data, fullSync: true, immediate: true });
            if (published !== true || !isCurrentWorld()) return null;
        }
        return id;
    }

    async _spawnLocalMonster(fixedX = null, fixedY = null, type = 'slime', options = {}) {
        const generation = this.worldGeneration;
        const zoneId = this.activeZoneId;
        const currentScene = this.game.sceneManager?.currentScene;
        const isSafePoint = (x, y) => typeof currentScene?.isPointInSafeZone === 'function' && currentScene.isPointInSafeZone(x, y, 80);
        let x = fixedX ?? 400;
        let y = fixedY ?? 400;

        if (isSafePoint(x, y) && type !== 'training_dummy') {
            x += 140;
        }

        let definition = await this.game.monsterData.loadDefinition(type);
        if (generation !== this.worldGeneration || zoneId !== this.activeZoneId) return null;
        if (!definition) definition = {};

        const monster = new Monster(Math.round(x), Math.round(y), definition);
        monster.id = `local_tutorial_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        monster.hp = definition.baseStats?.hp || 100;
        monster.maxHp = definition.baseStats?.maxHp || 100;
        monster.ready = true;
        monster.isLocalOnly = true;
        applySlimeCombatOverrides(monster, type);

        if (options.tutorialOnly) {
            this.tutorialMonsterIds.add(monster.id);
        }

        this.monsters.set(monster.id, monster);
        return monster.id;
    }

    _scheduleBossSpawnRequestRetry(request) {
        const requestKey = request?.requestId
            || `${request?.fieldId || 'field'}:${request?.requesterId || 'requester'}:${request?.isFirstBoss !== false}`;
        if (!requestKey || this._bossSpawnRequestRetryTimers.has(requestKey)) return;
        const generation = this.worldGeneration;
        const timer = setTimeout(() => {
            this._bossSpawnRequestRetryTimers.delete(requestKey);
            if (!this.net?.isHost
                || generation !== this.worldGeneration
                || request?.fieldId !== this.net?._getCurrentFieldId?.()) return;
            this._handleBossSpawnRequested(request);
        }, 750);
        this._bossSpawnRequestRetryTimers.set(requestKey, timer);
    }

    async _handleBossSpawnRequested({
        isFirstBoss = true,
        requestId = null,
        requesterId = null,
        fieldId = null
    } = {}) {
        if (!this.net?.isHost) return null;
        fieldId = fieldId || this.net?._getCurrentFieldId?.() || null;
        const request = { isFirstBoss, requestId, requesterId, fieldId };
        const requestKey = requestId || `${fieldId || 'field'}:${requesterId || 'requester'}:${isFirstBoss}`;
        if (this._bossSpawnRequestInFlight.has(requestKey)) {
            return this._bossSpawnRequestInFlight.get(requestKey);
        }
        const operation = (async () => {
            if (isFirstBoss) {
                this.firstBossPending = true;
                this.firstBossMissingTimer = 0;
            }

            const bossId = await this._spawnBoss(isFirstBoss, request);
            if (!bossId) {
                this._scheduleBossSpawnRequestRetry(request);
                return null;
            }
            const retryTimer = this._bossSpawnRequestRetryTimers.get(requestKey);
            if (retryTimer) clearTimeout(retryTimer);
            this._bossSpawnRequestRetryTimers.delete(requestKey);
            if (requestId) this.net.ackBossSpawnRequest?.(requestId);

            if (isFirstBoss) this.slimeKillCount = 0;
            return bossId;
        })().finally(() => {
            if (this._bossSpawnRequestInFlight.get(requestKey) === operation) {
                this._bossSpawnRequestInFlight.delete(requestKey);
            }
        });
        this._bossSpawnRequestInFlight.set(requestKey, operation);
        return operation;
    }

    async _spawnBoss(isFirstBoss = true, options = {}) {
        if (this._isHostFieldStateBlocked()) return null;
        if ((this.zone?.currentZone?.id || this.activeZoneId) !== 'zone_1') return null;
        const generation = this.worldGeneration;
        const authoritativeHostExists = !!(this.net?.connected && !this.net.isHost && this.net.currentHostId && this.net.currentHostId !== this.net.playerId);
        if (authoritativeHostExists) {
            Logger.log('[MonsterManager] Boss spawn ignored on guest; host authority required.');
            return null;
        }

        const existingBoss = Array.from(this.monsters.values()).find((monster) => monster.typeId === 'king_slime' && !monster.isDead);
        const requestedFieldId = options.fieldId || this.net?._getCurrentFieldId?.() || null;
        let spawnClaim = null;
        if (typeof this.net?.claimQuestBossSpawn === 'function') {
            spawnClaim = await this.net.claimQuestBossSpawn({
                fieldId: requestedFieldId,
                isFirstBoss,
                requestId: options.requestId,
                requesterId: options.requesterId,
                preferredBossInstanceId: existingBoss?.id || null
            });
            if (!spawnClaim?.ok) return null;
        }
        const id = spawnClaim?.bossInstanceId || existingBoss?.id || `boss_${Date.now()}`;
        const bossCycle = spawnClaim?.cycle || (isFirstBoss ? 'intro' : 'repeat');
        const introBoss = bossCycle === 'intro';
        if (existingBoss?.id === id) {
            existingBoss.bossCycle = bossCycle;
            this.bossSpawned = true;
            if (!this.net?.shouldUseMonsterQuietMode?.()) this.forceSync(existingBoss.id);
            return id;
        }
        if (existingBoss && existingBoss.id !== id) {
            this._clearPlayerTargetIfMatches(existingBoss);
            this.monsters.delete(existingBoss.id);
            this.lastSyncState.delete(existingBoss.id);
            this.monsterRegionMap.delete(existingBoss.id);
            this.monsterRevisionMap.delete(existingBoss.id);
        }

        this.bossSpawned = true;
        if (introBoss) {
            this.firstBossPending = true;
            this.firstBossMissingTimer = 0;
        }

        const worldW = this.zone.width || 6400;
        const worldH = this.zone.height || 6400;
        const x = worldW / 2;
        const y = worldH / 2;

        const definition = await this.game.monsterData.loadDefinition('king_slime');
        if (generation !== this.worldGeneration
            || (this.zone?.currentZone?.id || this.activeZoneId) !== 'zone_1') {
            this.bossSpawned = false;
            return null;
        }
        if (!definition) {
            this.bossSpawned = false;
            if (introBoss) {
                this.firstBossPending = false;
            }
            return null;
        }

        // v0.00.70: 첫 대왕 슬라임(퀘스트용)은 HP 1000, 돌진만 사용
        const hp = introBoss ? 1000 : (definition.baseStats?.hp || 1500);
        const maxHp = introBoss ? 1000 : (definition.baseStats?.maxHp || 1500);

        const data = {
            id: id,
            x: x,
            y: y,
            hp: hp,
            maxHp: maxHp,
            type: 'king_slime',
            isBoss: true,
            chargeOnly: introBoss, // v0.00.70: 첫 대왕 슬라임은 돌진만 사용
            bossCycle,
            w: definition.visual?.width || 320,
            h: definition.visual?.height || 320,
            rev: this._nextMonsterRevision(id),
            ts: Date.now(),
            state: 'idle',
            cellId: this._getCellIdFromPosition(x, y)
        };

        // v0.00.76: Ensure clients know this is a limited pattern boss
        await this._onRemoteMonsterAdded(
            { ...data, fullSync: true, immediate: true },
            { generation, fieldId: this.net?._getCurrentFieldId?.() || null }
        );
        if (generation !== this.worldGeneration
            || (this.zone?.currentZone?.id || this.activeZoneId) !== 'zone_1'
            || !this.monsters.has(id)) {
            this.bossSpawned = false;
            return null;
        }
        if (!this.net?.shouldUseMonsterQuietMode?.()) {
            this.net.sendMonsterUpdate(id, { ...data, fullSync: true, immediate: true });
        }
        if (window.game && window.game.ui) {
            if (introBoss) {
                window.game.ui.logSystemMessage('초보 모험가를 위한 대왕 슬라임이 나타났습니다! (돌진 공격만 사용)');
            } else {
                window.game.ui.logSystemMessage('분노한 대왕 슬라임이 나타났습니다!');
            }
        }

        return id;
    }

    async _onRemoteMonsterAdded(data, context = {}) {
        if (!data?.id) return;
        const generation = Number.isFinite(context.generation) ? context.generation : this.worldGeneration;
        const fieldId = context.fieldId || this.net?._getCurrentFieldId?.() || null;
        const isCurrentWorld = () => generation === this.worldGeneration
            && (!fieldId || fieldId === this.net?._getCurrentFieldId?.());

        const rawTypeId = typeof data.type === 'string'
            ? data.type.trim()
            : (typeof data.typeId === 'string' ? data.typeId.trim() : '');
        if (this.isSpawnSuppressed() && rawTypeId !== 'training_dummy') return;
        if (this.monsters.has(data.id)) return;

        // v0.00.01: Map legacy types or handle direct typeId
        let typeId = rawTypeId || 'slime';
        const legacyMap = {
            '슬라임': 'slime',
            '초록 슬라임': 'slime',
            '분열된 슬라임': 'slime_split',
            '대왕 슬라임': 'king_slime'
        };
        if (legacyMap[typeId]) typeId = legacyMap[typeId];

        try {
            const definition = await this.game.monsterData.loadDefinition(typeId);
            if (!isCurrentWorld()) return;
            if (!definition) throw new Error(`Definition not found for ${typeId}`);

            const m = new Monster(data.x, data.y, definition);
            m.id = data.id;
            m.hp = data.hp;
            m.maxHp = data.maxHp;
            m.targetX = data.x;
            m.targetY = data.y;
            m.spawnGroupId = data.spawnGroupId || null;
            m.bossCycle = ['intro', 'repeat'].includes(data.bossCycle) ? data.bossCycle : null;

            if (data.isBoss || definition.isBoss === true || definition.type === 'boss' || data.type === '대왕 슬라임') {
                m.isBoss = true;
                if (typeId === 'king_slime') this.bossSpawned = true;
                else if (typeId === this.zoneBossRule?.monsterId) {
                    this.zoneBossSpawned = true;
                    this.zoneBossInstanceId = data.id;
                    this.game?.sound?.loadAndPlayBgm?.('bgm_boss');
                }
                // Definition usually handles this, but sync data might override
                m.width = data.w || m.width;
                m.height = data.h || m.height;
            }
            // Slime families stay charge-only even if older sync data omits the flag.
            if (data.chargeOnly) {
                m.chargeOnly = true;
            }
            applySlimeCombatOverrides(m, typeId);
            this._applyRemoteMonsterNetworkState(m, data);
            this.monsters.set(data.id, m);
        } catch (e) {
            if (!isCurrentWorld()) return;
            Logger.warn(`Defaulting to fallback for monster ${data.id} (${typeId})`, e);
            const m = new Monster(data.x, data.y, {});
            m.id = data.id;
            m.hp = data.hp;
            m.maxHp = data.maxHp;
            m.targetX = data.x;
            m.targetY = data.y;
            m.spawnGroupId = data.spawnGroupId || null;
            m.bossCycle = ['intro', 'repeat'].includes(data.bossCycle) ? data.bossCycle : null;
            m.isBoss = !!data.isBoss;
            applySlimeCombatOverrides(m, typeId);
            this._applyRemoteMonsterNetworkState(m, data);
            this.monsters.set(data.id, m);
        }
    }

    _shouldAcceptRemoteMonsterUpdate(monster, data) {
        if (!monster || !data) return false;

        const incomingRev = Number(data.rev || 0);
        const incomingTs = Number(data.ts || 0);
        const currentRev = Number(monster.remoteSyncRev || 0);
        const currentTs = Number(monster.remoteSyncTs || 0);

        if (incomingRev > 0 && currentRev > 0) {
            if (incomingRev < currentRev) return false;
            if (incomingRev === currentRev && incomingTs > 0 && currentTs > 0 && incomingTs <= currentTs) return false;
        } else if (incomingTs > 0 && currentTs > 0 && incomingTs < currentTs) {
            return false;
        }

        return true;
    }

    _applyRemoteMonsterNetworkState(monster, data) {
        if (!monster || !data) return;

        if (data.spawnGroupId) monster.spawnGroupId = data.spawnGroupId;
        if (data.bossCycle === 'intro' || data.bossCycle === 'repeat') {
            monster.bossCycle = data.bossCycle;
        }
        if (data.isBoss === true) monster.isBoss = true;
        if (data.lastAttackerId) monster.lastAttackerId = data.lastAttackerId;
        if (Array.isArray(data.damageContributors)) {
            if (!(monster.damageContributors instanceof Set)) monster.damageContributors = new Set();
            data.damageContributors.filter(Boolean).slice(0, 24).forEach((uid) => {
                monster.damageContributors.add(uid);
            });
        }
        if (Array.isArray(data.damageContributorLevels)) {
            data.damageContributorLevels.slice(0, 24).forEach((entry) => {
                if (!Array.isArray(entry) || entry.length !== 2) return;
                this._captureMonsterContributorLevel(monster, entry[0], entry[1]);
            });
        }
        monster.remoteSyncRev = Math.max(Number(monster.remoteSyncRev || 0), Number(data.rev || 0));
        monster.remoteSyncTs = Math.max(Number(monster.remoteSyncTs || 0), Number(data.ts || 0));
        monster.remoteSyncState = data.state || monster.remoteSyncState || 'idle';
        monster.remoteCellId = data.cellId || monster.remoteCellId || this._getCellIdFromPosition(monster.x, monster.y);
        if (data.cellId) {
            this.monsterRegionMap.set(monster.id, data.cellId);
        }

        const nextState = monster.remoteSyncState;
        const hasChargeTarget = Number.isFinite(monster.chargeTarget?.x) && Number.isFinite(monster.chargeTarget?.y);
        if (nextState === 'casting' || nextState === 'charging') {
            monster.chargeState = hasChargeTarget ? nextState : 'idle';
        } else {
            monster.chargeState = 'idle';
            monster.chargeTarget = null;
        }
        monster.isAggro = nextState === 'aggro' || monster.chargeState === 'casting' || monster.chargeState === 'charging';
        if (nextState === 'dead' || monster.hp <= 0) {
            monster.isDead = true;
            monster.hp = 0;
            monster.vx = 0;
            monster.vy = 0;
        }
    }

    _onRemoteMonsterUpdated(data) {
        const m = this.monsters.get(data.id);
        if (!m) {
            if (this.isSpawnSuppressed() && data.type !== 'training_dummy') return;
            this._onRemoteMonsterAdded(data);
            return;
        }
        if (this.net.isHost) return;
        if (!this._shouldAcceptRemoteMonsterUpdate(m, data)) return;
        m.hp = data.hp;
        if (data.maxHp) m.maxHp = data.maxHp;

        // v1.99.10: If it's a fullSync, don't snap position if we're already close
        // This prevents the "flash back" effect when server sends a slow periodic update
        if (data.fullSync) {
            const dist = Math.sqrt((m.targetX - data.x) ** 2 + (m.targetY - data.y) ** 2);
            if (dist > 100) { // Only snap if desync is massive
                m.targetX = data.x;
                m.targetY = data.y;
            }
        } else {
            m.targetX = data.x;
            m.targetY = data.y;
        }

        if (data.chargeOnly || isSlimeFamilyType(data.type || m.typeId)) {
            m.chargeOnly = true;
        }
        applySlimeCombatOverrides(m, data.type || m.typeId);
        this._applyRemoteMonsterNetworkState(m, data);
    }

    _onRemoteMonsterRemoved(id) {
        if (this.net.isHost) return;
        this._removeMonsterLocalState(id);
    }

    _clearPlayerTargetIfMatches(monsterOrId) {
        const targetId = typeof monsterOrId === 'string' ? monsterOrId : monsterOrId?.id;
        if (!targetId) return;

        const player = this.game?.localPlayer;
        if (player?.currentTarget && (player.currentTarget.id === targetId || player.currentTarget === monsterOrId)) {
            player.clearCurrentTarget?.();
        }
    }

    _getMonsterParticipantIds(monster, fallbackId = null) {
        const participantIds = new Set();
        if (monster?.damageContributors instanceof Set) {
            monster.damageContributors.forEach((uid) => {
                if (uid) participantIds.add(uid);
            });
        }
        if (fallbackId) participantIds.add(fallbackId);
        return Array.from(participantIds);
    }

    _onMonsterDamageReceived(data) {
        if (this.isMonsterCombatBlocked()) return false;
        // v0.00.03: Allow ALL clients to process damage events for visual feedback
        // if (!this.net.isHost) return;
        // v0.29.18: 호스트 자신이 보낸 데미지는 이미 로컬에서 처리했으므로 무시
        if (data.aid === this.net.playerId) return;
        const m = this.monsters.get(data.mid);
        if (m && !m.isDead) {
            m.lastAttackerId = data.aid;
            this._captureMonsterContributorLevel(m, data.aid, data.attackerLevel);
            const impactX = Number.isFinite(data.meta?.impactX) ? data.meta.impactX : null;
            const impactY = Number.isFinite(data.meta?.impactY) ? data.meta.impactY : null;
            return m.takeDamage(data.dmg, true, !!data.meta?.isCrit, impactX, impactY, data.meta || null) !== false;
        }
        return false;
    }

    async _onDropAdded(data, context = {}) {
        if (data?.claimStatus === 'settled') {
            this.drops.delete(data.id);
            return;
        }
        if (data?.claimStatus === 'claimed' && data?.claimId && data?.claimedBy) {
            this.drops.delete(data.id);
            if (this.net?.isHost) {
                this._settleClaimedDrop({ id: data.id, ...data });
            }
            return;
        }
        if (this.drops.has(data.id)) return;
        const generation = Number.isFinite(context.generation) ? context.generation : this.worldGeneration;
        const fieldId = context.fieldId || this.net?._getCurrentFieldId?.() || null;
        const { default: Drop } = await import('../entities/Drop.js');
        if (generation !== this.worldGeneration
            || (fieldId && fieldId !== this.net?._getCurrentFieldId?.())) return;
        const d = new Drop(data.id, data.x, data.y, data.type, data.amount, {
            ownerId: data.ownerId,
            partyMembers: data.partyMembers,
            eligibleCollectorIds: data.eligibleCollectorIds,
            itemId: data.itemId,
            name: data.name,
            icon: data.icon,
            sourceRewardId: data.sourceRewardId,
            dropWorldEpoch: data.dropWorldEpoch,
            dropFieldEpoch: data.dropFieldEpoch,
            ts: data.ts,
            sourceAuthoredAt: data.authoredAt,
            sourceExpiresAt: data.expiresAt
        });
        if (this._isDropExpired(d)) {
            if (this.net.isHost) {
                this.net.removeDrop(data.id, {
                    expired: true,
                    dropWorldEpoch: d.dropWorldEpoch,
                    dropFieldEpoch: d.dropFieldEpoch
                });
            }
            return;
        }
        if (!this.net.isHost && this.game?.localPlayer && !d.canPlayerCollect(this.game.localPlayer)) {
            return;
        }
        this.drops.set(data.id, d);
    }

    _onDropRemoved(id) {
        this.drops.delete(id);
    }

    _onDropCollectionRequested(data) {
        if (!this.net.isHost) return;
        const fieldId = this.net?._getCurrentFieldId?.() || null;
        const requestedFieldId = typeof data?.fieldId === 'string'
            ? (this.net?._normalizeFieldId?.(data.fieldId) || data.fieldId)
            : null;
        if (!fieldId || !requestedFieldId || requestedFieldId !== fieldId) return;
        const dropWorldEpoch = Number(data?.dropWorldEpoch);
        const dropFieldEpoch = Number(data?.dropFieldEpoch);
        if (!Number.isInteger(dropWorldEpoch) || dropWorldEpoch < 0
            || !Number.isInteger(dropFieldEpoch) || dropFieldEpoch < 0) {
            if (data?.requestId) this.net.ackDropCollectionRequest?.(data.requestId);
            return;
        }
        const currentDrop = this.drops.get(data?.dropId);
        if (currentDrop
            && (currentDrop.dropWorldEpoch !== dropWorldEpoch
                || currentDrop.dropFieldEpoch !== dropFieldEpoch)) {
            if (data?.requestId) this.net.ackDropCollectionRequest?.(data.requestId);
            return;
        }
        if (this._fieldDropHydrationPromise || this._isHostFieldStateBlocked()) {
            const duplicate = this._pendingDropCollectionRequests.some((entry) => (
                entry?.data?.dropId === data?.dropId
                && entry?.data?.collectorId === data?.collectorId
                && entry?.data?.dropWorldEpoch === dropWorldEpoch
                && entry?.data?.dropFieldEpoch === dropFieldEpoch
                && entry?.fieldId === fieldId
            ));
            if (!duplicate && this._pendingDropCollectionRequests.length < this.maxPendingDropCollectionRequests) {
                this._pendingDropCollectionRequests.push({
                    data: {
                        ...data,
                        fieldId: requestedFieldId,
                        dropWorldEpoch,
                        dropFieldEpoch
                    },
                    fieldId,
                    generation: this.worldGeneration
                });
            }
            return;
        }
        this._processDropCollectionRequest({ ...data, fieldId: requestedFieldId });
    }

    _flushPendingDropCollectionRequests(options = {}) {
        if (!this.net?.isHost || this._fieldDropHydrationPromise) return;
        if (!options.allowCurrentHandoff && this._isHostFieldStateBlocked()) return;
        const fieldId = this.net?._getCurrentFieldId?.() || null;
        const generation = this.worldGeneration;
        const pending = this._pendingDropCollectionRequests.splice(0, this._pendingDropCollectionRequests.length);
        pending.forEach((entry) => {
            if (!entry || entry.fieldId !== fieldId || entry.generation !== generation) return;
            this._processDropCollectionRequest(entry.data);
        });
    }

    _scheduleDropSettlementRetry(key, callback, delayMs = 750) {
        if (!key || typeof callback !== 'function' || this._dropSettlementRetryTimers.has(key)) return;
        const timer = setTimeout(() => {
            this._dropSettlementRetryTimers.delete(key);
            callback();
        }, Math.max(100, Number(delayMs) || 750));
        this._dropSettlementRetryTimers.set(key, timer);
    }

    _buildClaimedDropRewardEntries(data) {
        const dropId = data?.id;
        const claimedBy = data?.claimedBy;
        const fieldId = data?.fieldId || this.net?._getCurrentFieldId?.() || null;
        if (!dropId || !claimedBy || !fieldId) return [];
        const eligibleIds = Array.isArray(data.eligibleCollectorIds) ? data.eligibleCollectorIds : null;
        const entries = [];
        const addEntry = (recipientId, rewardKind, payload) => {
            if (!recipientId || !payload) return;
            const rewardId = this._buildDeterministicDropRewardId(
                dropId,
                recipientId,
                rewardKind,
                fieldId,
                data
            );
            if (!rewardId) return;
            entries.push({ recipientId, payload: { ...payload, rewardId, immediate: true } });
        };

        const itemDropType = data.itemId || null;
        if (data.type === 'gold' || data.type === 'manastone' || data.type === 'exp') {
            const ownerId = data.ownerId || claimedBy;
            const ownerPayload = data.type === 'exp'
                ? { exp: data.amount }
                : { manastone: data.amount };
            addEntry(ownerId, `owner_${data.type}`, ownerPayload);
            const allyAmount = Math.max(1, Math.floor(Number(data.amount || 0) * 0.6));
            const allyPayload = data.type === 'exp'
                ? { exp: allyAmount }
                : { manastone: allyAmount };
            const rewardPeers = this._normalizePartyMembers(
                (Array.isArray(eligibleIds) && eligibleIds.length > 0)
                    ? eligibleIds
                    : (data.partyMembers || [])
            );
            rewardPeers
                .filter((uid) => uid !== ownerId)
                .forEach((uid) => addEntry(uid, `ally_${data.type}`, allyPayload));
        } else if (data.type === 'hp') {
            addEntry(claimedBy, 'hp', { hp: data.amount });
        } else if (itemDropType
            || data.type === 'weapon_upgrade_stone'
            || data.type === 'blessed_weapon_upgrade_stone') {
            const rewardItemId = itemDropType || data.type;
            addEntry(claimedBy, `item_${rewardItemId}`, {
                items: [{
                    id: rewardItemId,
                    type: rewardItemId,
                    amount: Math.max(1, Number(data.amount || 1)),
                    name: data.name || rewardItemId,
                    icon: data.icon || null
                }]
            });
        }
        return entries;
    }

    _settleClaimedDrop(data, options = {}) {
        const dropId = data?.id;
        const claimId = data?.claimId || options.claimId;
        if (!this.net?.isHost || !dropId || !claimId) return Promise.resolve(false);
        if (this._dropSettlementInFlight.has(dropId)) {
            return this._dropSettlementInFlight.get(dropId);
        }
        const fieldId = data.fieldId || this.net?._getCurrentFieldId?.() || null;
        const generation = this.worldGeneration;
        const retry = () => {
            this._scheduleDropSettlementRetry(`settle:${dropId}`, () => {
                if (!this.net?.isHost
                    || generation !== this.worldGeneration
                    || fieldId !== this.net?._getCurrentFieldId?.()) return;
                this._settleClaimedDrop(data, options);
            });
        };
        const settlement = (async () => {
            const rewards = this._buildClaimedDropRewardEntries({ ...data, claimId });
            if (rewards.length === 0) {
                Logger.warn(`[MonsterManager] Refusing empty drop settlement ${dropId}`);
                return false;
            }
            const authored = rewards.every(({ recipientId, payload }) => {
                const sent = this.net.sendReward(recipientId, payload, { requireSharedCommit: true }) === true;
                return typeof this.net.isRewardServerCommitted === 'function'
                    ? this.net.isRewardServerCommitted(recipientId, payload?.rewardId)
                    : sent;
            });
            if (!authored) {
                retry();
                return false;
            }
            const finalized = await this.net.finalizeDropSettlement?.(dropId, claimId, {
                localOnly: options.localOnly === true,
                fieldId,
                dropWorldEpoch: data.dropWorldEpoch,
                dropFieldEpoch: data.dropFieldEpoch
            });
            if (!finalized) {
                retry();
                return false;
            }
            this.drops.delete(dropId);
            return true;
        })().finally(() => {
            if (this._dropSettlementInFlight.get(dropId) === settlement) {
                this._dropSettlementInFlight.delete(dropId);
            }
        });
        this._dropSettlementInFlight.set(dropId, settlement);
        return settlement;
    }

    async _processDropCollectionRequest(data) {
        if (!this.net?.isHost || !data?.dropId || !data?.collectorId) return;
        const fieldId = this.net?._getCurrentFieldId?.() || null;
        if (!fieldId || data.fieldId !== fieldId) return;
        const drop = this.drops.get(data.dropId);
        if (drop) {
            if (drop.dropWorldEpoch !== Number(data.dropWorldEpoch)
                || drop.dropFieldEpoch !== Number(data.dropFieldEpoch)) {
                if (data.requestId) this.net.ackDropCollectionRequest?.(data.requestId);
                return;
            }
            const eligibleIds = Array.isArray(drop.eligibleCollectorIds) ? drop.eligibleCollectorIds : null;
            const collectorAllowed = Array.isArray(eligibleIds) && eligibleIds.length > 0
                ? eligibleIds.includes(data.collectorId)
                : (!drop.ownerId
                    || drop.ownerId === data.collectorId
                    || drop.partyMembers?.includes(data.collectorId));
            if (!collectorAllowed) {
                if (data.requestId) this.net.ackDropCollectionRequest?.(data.requestId);
                return;
            }
        }
        const claim = await this.net.claimDropForSettlement?.(data.dropId, data.collectorId, {
            fieldId,
            drop,
            dropWorldEpoch: Number(data.dropWorldEpoch),
            dropFieldEpoch: Number(data.dropFieldEpoch)
        });
        if (!claim?.ok) {
            if (claim?.terminal) {
                if (data.requestId) this.net.ackDropCollectionRequest?.(data.requestId);
                if (!['stale_drop_epoch', 'missing_drop_epoch'].includes(claim.reason)) {
                    this.drops.delete(data.dropId);
                }
                return;
            }
            this._scheduleDropSettlementRetry(`claim:${data.requestId || data.dropId}`, () => {
                if (this.net?.isHost && fieldId === this.net?._getCurrentFieldId?.()) {
                    this._processDropCollectionRequest(data);
                }
            });
            return;
        }
        if (data.requestId) this.net.ackDropCollectionRequest?.(data.requestId);
        this.drops.delete(data.dropId);
        await this._settleClaimedDrop({
            id: data.dropId,
            ...claim.drop,
            claimId: claim.claimId,
            claimedBy: claim.claimedBy,
            fieldId
        }, {
            localOnly: claim.localOnly === true
        });
    }

    getStats() {
        return {
            count: this.monsters.size,
            max: 15 + Math.floor((this.totalLevelSum || 1) / 5),
            interval: Math.max(0.5, 3 - Math.floor((this.totalLevelSum || 1) / 5) * 0.2).toFixed(1),
            totalLevel: this.totalLevelSum || 1
        };
    }

    clearAll(options = {}) {
        const preserveNetwork = !!options.preserveNetwork;
        this.worldGeneration += 1;
        if (this.net.isHost && !preserveNetwork) {
            this.monsters.forEach((_, id) => this.net.removeMonster(id));
            this.drops.forEach((_, id) => this.net.removeDrop(id));
        }

        this.monsters.clear();
        this.drops.clear();
        this.pendingSpawnGroups.clear();
        this.spawnGroupNextAt.clear();
        this.primedSpawnGroups.clear();
        this.zoneBossSpawned = false;
        this.zoneBossSpawnPending = false;
        this.lastSyncState.clear();
        this.monsterRegionMap.clear();
        this.monsterRevisionMap.clear();
        this.peerMonsterKeyframeMeta.clear();
        this.peerMonsterKeyframeCellMeta.clear();
        this._clearQueuedPeerMonsterKeyframes();
        this._guestSnapshotHydrationPending = null;
        this._guestSnapshotHydrationPromise = null;
        this._lastGuestSnapshotHydrationTs = 0;
        this._hostSnapshotRestorePromise = null;
        this._hostSnapshotRestoreFieldId = null;
        this._lastHostSnapshotRestoreTs = 0;
        this._hostFieldHandoffFieldId = null;
        this._hostFieldHandoffStartedAt = 0;
        this._hostFieldHandoffPromise = null;
        this._hostFieldHandoffBlockedFieldId = null;
        this._hostFieldHandoffWaitForResidentPublish = false;
        this._fieldBossStateReadyFieldId = null;
        this._staleFieldBossMarker = null;
        if (this._hostFieldHandoffRetryTimer) {
            clearTimeout(this._hostFieldHandoffRetryTimer);
            this._hostFieldHandoffRetryTimer = null;
        }
        if (this._fieldBossStateRetryTimer) {
            clearTimeout(this._fieldBossStateRetryTimer);
            this._fieldBossStateRetryTimer = null;
        }
        this._pendingFieldBossStateWrite = null;
        this._residentFieldPublishPromise = null;
        this._fieldDropHydrationPromise = null;
        this._fieldDropHydrationFieldId = null;
        this._pendingDropCollectionRequests = [];
        this._dropSettlementRetryTimers.forEach((timer) => clearTimeout(timer));
        this._dropSettlementRetryTimers.clear();
        this._dropSettlementInFlight.clear();
        this._bossSpawnRequestRetryTimers.forEach((timer) => clearTimeout(timer));
        this._bossSpawnRequestRetryTimers.clear();
        this._bossSpawnRequestInFlight.clear();
        this._immediateDeathSettlementActive = false;
        this.tutorialMonsterIds.clear();
        this.minimapSyncTimer = 0;
        if (this.net?.isHost && !preserveNetwork && this.net?.isSharedFieldActive?.()) {
            this.net.publishMinimapMonsterSnapshot(this.monsters, { force: true });
        }
        Logger.info("[MonsterManager] Local world state cleared.");
    }

    _handleBlueFlameDeathExplosion(monster) {
        const meta = monster?.lastDamageMeta;
        if (!meta || meta.prefixId !== 'blue_flame') return;
        if (!['fireball', 'burn'].includes(meta.cause)) return;

        const ratio = Math.max(0, meta.fireExplosionDamageRatio || 0);
        if (ratio <= 0) return;

        const sourceDamage = Math.max(1, meta.sourceDamage || 1);
        const explosionDamage = Math.max(1, Math.ceil(sourceDamage * ratio));
        const radius = Math.max(90, meta.explosionRadius || 120);
        const burnDuration = Math.max(1, meta.burnDuration || 2);

        window.game?.addExplosion?.(monster.x, monster.y, radius, { variant: 'blue_flame', duration: 0.55 });
        if (window.game?.sound) {
            window.game.sound.playSfx('fireball_explosion');
        }

        this.monsters.forEach((other) => {
            if (!other || other.id === monster.id || other.isDead) return;
            const dist = Math.sqrt((other.x - monster.x) ** 2 + (other.y - monster.y) ** 2);
            const collisionRadius = radius + ((other.width || 80) / 2);
            if (dist > collisionRadius) return;

            const damageMeta = {
                cause: 'blue_flame_explosion',
                prefixId: 'blue_flame',
                fireExplosionDamageRatio: ratio,
                burnDuration,
                sourceDamage: explosionDamage,
                explosionRadius: radius
            };

            if (this.net) {
                this.net.sendMonsterDamage(other.id, explosionDamage, damageMeta);
                other.lastAttackerId = monster.lastAttackerId;
                const sourceContributorLevel = this._getMonsterContributorLevel(monster, monster.lastAttackerId);
                this._captureMonsterContributorLevel(other, monster.lastAttackerId, sourceContributorLevel);
            }
            other.takeDamage(explosionDamage, true, false, monster.x, monster.y, damageMeta);
            other.applyEffect('burn', burnDuration, Math.max(1, Math.ceil(explosionDamage * 0.15)), {
                cause: 'burn',
                prefixId: 'blue_flame',
                fireExplosionDamageRatio: ratio,
                burnDuration,
                sourceDamage: explosionDamage,
                explosionRadius: radius
            });
        });
    }

    // v0.00.43: Kill Count & Boss Spawn Logic
    _handleMonsterDeath(m) {
        if (this.shouldSuppressWorldFeedback(m)) {
            return;
        }

        if (m.typeId === this.zoneBossRule?.monsterId) {
            this.recordFieldBossDefeat(m);
            const fieldMusic = this.zone?.currentZone?.background?.music || 'bgm_cabin';
            this.game?.sound?.loadAndPlayBgm?.(fieldMusic);
            window.game?.ui?.logSystemMessage?.(`🏆 ${m.name} 처치! 참여자는 보스 전용 무기를 획득합니다.`);
        }

        // Only the first king slime uses the global 30-kill buildup.
        if (m.typeId === 'slime' || m.typeId === 'slime_split') {
            if (!this.firstBossDefeated && !this.bossSpawned && this.slimeKillCount < 30) {
                this.slimeKillCount++;
                Logger.log(`[MonsterManager] Slime Kill Count: ${this.slimeKillCount}`);

                // 초반 슬라임 10/20/30 누적 전역 메시지는 함께하기/싱글 필드 혼선이 있어 노출하지 않는다.
            }
        } else if (m.typeId === 'king_slime') {
            // Boss died.
            this.bossSpawned = false;
            this._authorQuestBossDefeat(m);
            // v0.00.70: 첫 대왕 슬라임 처치 완료 플래그
            this.firstBossDefeated = true;
            // Ensure count is 0
            this.slimeKillCount = 0;
        }
    }
}
