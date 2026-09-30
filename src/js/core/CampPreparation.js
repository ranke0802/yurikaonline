import Player from '../entities/Player.js';

const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const FIELDS = new Set(['inventory', 'equipment', 'manastone', 'skillLevels', 'vitality', 'intelligence', 'wisdom', 'agility', 'statPoints', 'hp', 'maxHp', 'mp', 'maxMp']);

/** A real Player for preparation, without input, simulation, party or world writes. */
export default class CampPreparation {
    constructor(game, user, profile, definition, onStatus = () => {}) {
        this.game = game;
        this.user = user;
        this.onStatus = onStatus;
        this.dirty = new Set();
        this.pending = 0;
        this.timeoutMs = 8000;
        this.error = null;
        this.errorCode = null;
        this.commitTail = Promise.resolve({ ok: true });
        this.pendingWrites = new Map();
        this.tail = Promise.resolve({ ok: true });
        const p = this.player = new Player(profile.x || 0, profile.y || 0, profile.name, definition);
        for (const key of ['level', 'exp', 'maxExp', 'manastone', 'vitality', 'intelligence', 'wisdom', 'agility', 'statPoints', 'skillLevels', 'autoAttackEnabled', 'uiLayout', 'clientSettings', 'questData', 'questState', 'itemCooldowns', 'currentZoneId', 'mapPositions', 'recoveryUid', 'pendingItemRewards', 'claimedRewardIds']) {
            if (profile[key] !== undefined) p[key] = copy(profile[key]);
        }
        p.id = user.uid;
        // Never call Player.init: camp must not bind attacks, publish presence or drain rewards.
        p.normalizeInventoryState(copy(profile.inventory), copy(profile.equipment));
        p.refreshStats();
        p.hp = Number.isFinite(profile.hp) ? Math.min(p.maxHp, Math.max(0, profile.hp)) : p.maxHp;
        p.mp = Number.isFinite(profile.mp) ? Math.min(p.maxMp, Math.max(0, profile.mp)) : p.maxMp;
        // Stat/equipment recalculation can publish HP even without Player.init.
        // A preparation player has no field transport; persistence below uses
        // only the real profile writer, never combat/presence endpoints.
        p.net = { playerId: user.uid, isSharedFieldActive: () => false, sendPlayerHp() {}, sendChanneling() {} };
        p.saveProfilePatch = (fields, options = {}) => this.save(fields, options);
        // Inventory reorder uses saveState; preserve the field position and unrelated profile data.
        this.savedValues = copy(p._buildProfilePatchFromFields([...FIELDS]));
        p.saveState = (_sync, options = {}) => this.save(['inventory', 'equipment'].filter(field =>
            JSON.stringify(p._buildProfilePatchFromFields([field])[field]) !== JSON.stringify(this.savedValues[field])
        ), options);
        p.flushDurableProfileJournal = () => this.flush();
        p.useBossSummonScroll = async () => ({ ok: false, message: '소환 주문서는 출정 후 해당 지역에서 사용할 수 있어요.' });
    }

    async waitForWrite(operation) {
        let timer;
        try {
            return await Promise.race([operation, new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('camp_save_timeout')), this.timeoutMs);
            })]);
        } finally { clearTimeout(timer); }
    }

    status() {
        return { pending: this.pending > 0 && !this.error, waiting: this.pending > 0,
            ok: !this.error && !this.pending && this.dirty.size === 0, reason: this.error,
            code: this.errorCode, dirty: this.dirty.size > 0 };
    }

    failed(error) {
        this.error = error?.message || 'camp_save_failed';
        this.errorCode = error?.code || this.error;
        this.onStatus(this.status());
        return { ok: false, reason: this.error, code: this.errorCode };
    }

    async awaitCommit(operation) {
        try { return await this.waitForWrite(operation); }
        catch (error) { return this.failed(error); }
    }

    save(fields, options = {}) {
        fields.filter(field => FIELDS.has(field)).forEach(field => this.dirty.add(field));
        if (!this.dirty.size) return Promise.resolve({ ok: true, skipped: true });
        const patch = copy(this.player._buildProfilePatchFromFields([...this.dirty]));
        const signature = JSON.stringify(patch);
        if (this.pendingWrites.has(signature)) {
            this.tail = this.awaitCommit(this.pendingWrites.get(signature));
            return this.tail;
        }
        this.pending++;
        this.onStatus(this.status());
        // The actual commit chain outlives the UI deadline. A slow acknowledgement
        // must still clear dirty state; retry must not submit the same mutation again.
        const operation = this.commitTail.then(async () => {
            try {
                const result = await this.game.net.savePlayerDataPatch(this.user.uid, patch, {
                    debounceMs: 0, forceImmediate: true, syncToZone: false,
                    checkpointPolicy: 'durable', syncRecoveryProfile: false,
                    saveReason: options.reason || 'camp_preparation'
                });
                if (result?.ok !== true) {
                    const error = new Error(result?.reason || 'camp_save_failed');
                    error.code = result?.error?.code || result?.code || error.message;
                    throw error;
                }
                for (const key of Object.keys(patch)) {
                    this.savedValues[key] = copy(patch[key]);
                    const current = this.player._buildProfilePatchFromFields([key])[key];
                    if (JSON.stringify(current) === JSON.stringify(patch[key])) this.dirty.delete(key);
                }
                this.error = null;
                this.errorCode = null;
                return result;
            } catch (error) {
                return this.failed(error);
            } finally {
                this.pending--;
                this.pendingWrites.delete(signature);
                this.onStatus(this.status());
            }
        });
        this.pendingWrites.set(signature, operation);
        this.commitTail = operation;
        this.tail = this.awaitCommit(operation);
        return this.tail;
    }

    async flush() {
        const settled = await this.awaitCommit(this.commitTail);
        if (settled?.reason === 'camp_save_timeout') return settled;
        if (this.dirty.size) {
            const result = await this.save([...this.dirty], { reason: 'camp_preparation_retry' });
            if (!result.ok) return result;
        }
        // Do not replay an already-running journal drain on every retry. The real
        // NetworkManager serializes commits; retain and observe its one operation.
        if (!this.flushOperation) {
            this.pending++;
            this.onStatus(this.status());
            this.flushOperation = Promise.resolve().then(() => this.game.net.flushProfileWrites?.(this.user.uid)).then(result => {
                if (result?.ok === false) {
                    const error = new Error(result.reason || 'camp_flush_failed');
                    error.code = result.error?.code || result.code || result.results?.find(item => item?.ok === false)?.error?.code || error.message;
                    throw error;
                }
                this.error = null;
                this.errorCode = null;
                return { ok: true };
            }).catch(error => this.failed(error)).finally(() => {
                this.pending--;
                this.flushOperation = null;
                this.onStatus(this.status());
            });
        }
        return this.awaitCommit(this.flushOperation);
    }
}
