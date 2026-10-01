import NetworkManager from '../core/NetworkManager.js';

export const LOCAL_PROFILE_KEY = 'yurika.local.profile.v1';
const copy = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

/** Solo transport: original combat/profile API, isolated durable device storage. */
export default class LocalNetworkManager extends NetworkManager {
    constructor(storage = null) {
        super();
        this.isLocal = true;
        // Access can itself throw SecurityError in blocked/private contexts.
        // Defer the browser storage getter until a guarded profile operation.
        this.storage = storage ?? {
            getItem: key => globalThis.localStorage.getItem(key),
            setItem: (key, value) => globalThis.localStorage.setItem(key, value)
        };
        this.playerId = 'local-player';
        this._localRevision = null;
        this._localConsumer = null;
        this._localBossConsumer = null;
        this._localDraining = null;
        this._localSaveError = null;
        this._pendingLocalProfilePatch = null;
    }
    getLocalSaveStatus() {
        return { ok: !this._localSaveError && !this._pendingLocalProfilePatch, pending: !!this._pendingLocalProfilePatch, reason: this._localSaveError };
    }
    _publishLocalSaveState(reason = null) {
        this._localSaveError = reason;
        // A display listener must never change the outcome of a committed save.
        try { this.emit('localProfileSaveState', this.getLocalSaveStatus()); } catch { /* UI observes next status read. */ }
    }
    startBatchProcessor() {}
    _read() {
        const raw = this.storage.getItem(LOCAL_PROFILE_KEY);
        if (!raw) return { version: 1, revision: 0, profile: null, receipts: {}, drops: {}, settled: {}, dropSources: {} };
        const data = JSON.parse(raw);
        if (data.version !== 1 || !Number.isInteger(data.revision) || data.revision < 0 || !data.receipts || !data.drops || !data.settled
            || [data.receipts, data.drops, data.settled].some(value => typeof value !== 'object' || Array.isArray(value))
            || (data.profile !== null && (typeof data.profile !== 'object' || Array.isArray(data.profile)))) throw new Error('local_profile_corrupt');
        return data;
    }
    _write(data) {
        const current = this._read();
        if (this._localRevision !== null && current.revision !== this._localRevision) throw new Error('local_profile_changed_in_another_tab');
        data.revision = current.revision + 1;
        this.storage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(data));
        this._localRevision = data.revision;
        if (!this._pendingLocalProfilePatch) this._localSaveError = null;
    }
    async connect(user) {
        if (user?.uid !== 'local-player') throw new Error('local_identity_required');
        const revision = this._read().revision;
        if (this._localRevision === null) this._localRevision = revision;
        this.connected = true; this.isHost = true; this.currentHostId = this.playerId;
        this.connectedUsers = [this.playerId];
        this.emit('connected'); this.emit('hostChanged', true);
    }
    async disconnect() { const result = await this.flushProfileWrites(); if (!result.ok) return result; this.connected = false; return result; }
    async createLocalProfile(name = '유리카') {
        try {
            const data = this._read();
            if (data.profile) return { ok: false, reason: 'profile_exists' };
            data.profile = { name: String(name).trim().slice(0, 20) || '유리카', level: 1, exp: 0, maxExp: 100, manastone: 0, vitality: 1, intelligence: 3, wisdom: 2, agility: 1, statPoints: 0,
                skillLevels: { laser: 1, missile: 1, fireball: 1, shield: 1 }, inventory: [], equipment: {}, pendingItemRewards: [], claimedRewardIds: [], currentZoneId: 'zone_1', mapId: 'zone_1', mapPositions: {}, recoveryUid: this.playerId,
                questData: {}, questState: {}, ts: Date.now() };
            this._write(data); this._publishLocalSaveState(); return { ok: true, profile: copy(data.profile) };
        } catch (error) { this._publishLocalSaveState(error.message); return { ok: false, reason: error.message }; }
    }
    async getPlayerData(uid) { const profile = await this.getPlayerProfile(uid); return profile ? { profile } : null; }
    async getPlayerProfile(uid) { if (uid !== this.playerId) return null; const data = this._read(); if (this._localRevision === null) this._localRevision = data.revision; return copy(data.profile); }
    async getLatestProfileSnapshot(uid) { const profile = await this.getPlayerProfile(uid); return profile ? { profile, source: 'profile', rootRevision: this._localRevision, latestUid: uid } : null; }
    // Only called after the conflict UI explicitly confirms discarding this
    // tab's unsaved patch. Never rewrites or clears the durable storage record.
    async reloadLocalProfileAfterConflict() {
        if (this._localSaveError !== 'local_profile_changed_in_another_tab' || this._localDraining) return {ok:false,reason:'local_conflict_not_ready'};
        try {
            const data=this._read();
            if(!data.profile)return {ok:false,reason:'local_profile_missing'};
            this._localRevision=data.revision;
            this._pendingLocalProfilePatch=null;
            this._publishLocalSaveState();
            return {ok:true,profile:copy(data.profile),revision:data.revision};
        } catch(error){return {ok:false,reason:error.message};}
    }
    async savePlayerData(uid, patch) {
        try {
            if (uid !== this.playerId || !patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('profile_uid_mismatch');
            // One merged, cloned snapshot bounds recovery memory; position-only
            // writes must retain earlier failed equipment/inventory mutations.
            this._pendingLocalProfilePatch = { ...(this._pendingLocalProfilePatch || {}), ...copy(patch) };
            const data = this._read();
            if (!data.profile) throw new Error('local_profile_missing');
            data.profile = { ...data.profile, ...this._pendingLocalProfilePatch };
            // Receipt acknowledgements and balances are one atomic localStorage write.
            for (const id of data.profile.claimedRewardIds || []) { delete data.receipts[id]; data.settled[id] = true; }
            this._write(data);
            this._pendingLocalProfilePatch = null;
            this._publishLocalSaveState();
            return { ok: true, profile: copy(data.profile), revision: data.revision, localCheckpointPersisted: true };
        } catch (error) { this._publishLocalSaveState(error.message); return { ok: false, reason: error.message }; }
    }
    async savePlayerDataPatch(uid, patch) { return this.savePlayerData(uid, patch); }
    async flushProfileWrites() {
        await this._drainLocalRewards();
        if (this._pendingLocalProfilePatch) return this.savePlayerData(this.playerId, {});
        return this.getLocalSaveStatus();
    }
    setZoneParticipationEnabled(enabled) { this.zoneParticipationEnabled = !!enabled; this.isHost = !!enabled; this.emit('hostChanged', this.isHost); }
    async handleLocalZoneChanged() { this.roomId = globalThis.window?.game?.localPlayer?.currentZoneId || 'zone_1'; this._activeZoneFieldId = this.roomId; return true; }
    handleLocalPartyStateChanged() { return true; }
    resetToSoloPartyState() { const p = globalThis.window?.game?.localPlayer; if (p) p.party = { hostId: this.playerId, members: [this.playerId], mode: 'solo' }; }
    // A new local scene owns a fresh solo world, so its authoritative monster
    // snapshot is empty (not an unavailable online snapshot). The original
    // MonsterManager handoff still hydrates durable drops and releases its gate.
    async readMonsterHostSnapshot() { return {}; }
    sendMonsterUpdate() { return true; }
    removeMonster() { return true; }
    async waitForAccountSessionHandoff() { return { completed: true }; }
    shouldUseMonsterQuietMode() { return true; }
    _shouldSendRealtimeUserState() { return false; }
    setNormalRewardConsumer(consumer) { this._localConsumer = consumer; return this._drainLocalRewards(); }
    setDurableRewardConsumer(consumer) { this._localBossConsumer = consumer; return this._drainLocalRewards(); }
    _drainLocalRewards() {
        if (this._localDraining) return this._localDraining;
        this._localDraining = Promise.resolve().then(async () => {
            const attempted = new Set();
            while (true) {
                const receipt = Object.values(this._read().receipts).find(value => !attempted.has(value.rewardId));
                if (!receipt) break;
                attempted.add(receipt.rewardId);
                const consumer = receipt.bossReward ? this._localBossConsumer : this._localConsumer;
                if (!consumer) continue;
                const result = await consumer(copy(receipt));
                if (!result?.ok) { this._publishLocalSaveState(result?.reason || 'local_reward_save_failed'); break; }
            }
        }).catch(error => { this._publishLocalSaveState(error.message); }).finally(() => { this._localDraining = null; });
        return this._localDraining;
    }
    sendReward(uid, reward) {
        if (uid !== this.playerId || !reward?.rewardId) return false;
        try {
            const data = this._read();
            if (data.settled[reward.rewardId]) {
                // The original player's recent-ID list is bounded; retain the
                // permanent receipt ledger before the engine's optimistic path.
                const player = globalThis.window?.game?.localPlayer;
                if (player?.id === uid && Array.isArray(player.claimedRewardIds) && !player.claimedRewardIds.includes(reward.rewardId)) {
                    player.claimedRewardIds = [...player.claimedRewardIds, reward.rewardId].slice(-128);
                }
                return true;
            }
            if (!data.receipts[reward.rewardId]) {
                data.receipts[reward.rewardId] = { ...copy(reward), normalRewardReceipt: !reward.bossReward };
                this._write(data);
            }
            void this._drainLocalRewards(); return true;
        } catch (error) { this._publishLocalSaveState(error.message); return false; }
    }
    isRewardServerCommitted(uid, id) { const data = this._read(); return uid === this.playerId && !!(data.receipts[id] || data.settled[id]); }
    spawnDrop(drop) {
        try {
            const data = this._read(); const id = drop.id || `local-drop-${crypto.randomUUID()}`;
            if (data.dropSources?.[id] && !data.drops[id]) return id;
            if (!data.drops[id]) { data.dropSources = { ...(data.dropSources || {}), [id]: true }; data.drops[id] = { ...copy(drop), id, fieldId: this._getCurrentFieldId(), dropWorldEpoch: 0, dropFieldEpoch: 0, ts: Date.now() }; this._write(data); }
            this.emit('dropAdded', copy(data.drops[id])); return id;
        } catch (error) { this._publishLocalSaveState(error.message); return null; }
    }
    isDropSpawnDurablyAccepted(id) { const data = this._read(); return !!(data.drops[id] || data.dropSources?.[id]); }
    async claimDropForSettlement(id, collectorId, options = {}) {
        try {
            const data = this._read(); const drop = data.drops[id];
            if (!drop) return { ok: false, terminal: true, reason: 'missing_drop' };
            if (options.fieldId && options.fieldId !== drop.fieldId) return { ok: false, terminal: true, reason: 'stale_drop_field' };
            if ((options.dropWorldEpoch != null && options.dropWorldEpoch !== drop.dropWorldEpoch)
                || (options.dropFieldEpoch != null && options.dropFieldEpoch !== drop.dropFieldEpoch)) return { ok: false, terminal: true, reason: 'stale_drop_epoch' };
            if (collectorId !== this.playerId || (drop.ownerId && drop.ownerId !== collectorId)
                || (drop.eligibleCollectorIds?.length && !drop.eligibleCollectorIds.includes(collectorId))) return { ok: false, terminal: true, reason: 'not_owner' };
            if (!drop.claimId) { drop.claimId = `local-claim:${id}`; drop.claimedBy = collectorId; drop.claimStatus = 'claimed'; this._write(data); }
            return { ok: true, claimId: drop.claimId, claimedBy: collectorId, drop: copy(drop), localOnly: true };
        } catch (error) { this._publishLocalSaveState(error.message); return { ok: false, reason: error.message }; }
    }
    async finalizeDropSettlement(id, claimId) { const drop = this._read().drops[id]; if (!drop || !claimId || drop.claimId !== claimId) return false; return this.removeDrop(id); }
    removeDrop(id) { try { const data = this._read(); delete data.drops[id]; this._write(data); this.emit('dropRemoved', id); return true; } catch (error) { this._publishLocalSaveState(error.message); return false; } }
    async readFieldDropsSnapshot(options = {}) { const fieldId = options.fieldId || this._getCurrentFieldId(); return copy(Object.fromEntries(Object.entries(this._read().drops).filter(([, drop]) => drop.fieldId === fieldId))); }
    async claimFieldBossSpawn() { return true; }
    async claimQuestBossSpawn(options = {}) { return { ok: true, bossInstanceId: options.preferredBossInstanceId || `local-boss-${crypto.randomUUID()}`, cycle: options.isFirstBoss ? 'intro' : 'repeat' }; }
    publishFieldBossState() { return Promise.resolve(true); }
    readFieldBossState() { return Promise.resolve(null); }
    markQuestBossDefeated() { return true; }
    requestBossSpawn(options = {}) { this.emit('bossSpawnRequested', { ...options, requesterId: this.playerId, fieldId: this._getCurrentFieldId() }); }
    claimName() { return Promise.resolve(true); }
    startHostilityListeners() {}
    sendHeartbeat() {}
    _unavailableOnlineFeature() {
        globalThis.window?.game?.ui?.logSystemMessage?.('로컬 모드에서는 채팅·친구·파티 기능을 사용할 수 없습니다.');
        return { ok: false, reason: 'local_mode_unavailable' };
    }
    sendChat() { this._unavailableOnlineFeature(); return false; }
    sendEmote() { return false; }
    async addFriendByQuery() { return this._unavailableOnlineFeature(); }
    async sendFriendMessage() { return this._unavailableOnlineFeature(); }
    async sendFriendGift() { return this._unavailableOnlineFeature(); }
    async inviteToParty() { this._unavailableOnlineFeature(); return 'ERROR'; }
    sendPartyInvite() { return this._unavailableOnlineFeature(); }
    acceptPartyInvite() { return this._unavailableOnlineFeature(); }
    sendHostilityEvent() { return false; }
    sendHostilityRemovalEvent() { return false; }
    sendPlayerDamage() { return false; }
    async sendDuelRequest() { return this._unavailableOnlineFeature(); }

    flushPendingFriendGiftRefunds() {}
}
