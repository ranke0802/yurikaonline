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

    status() { return { pending: this.pending > 0, ok: !this.error && this.dirty.size === 0, reason: this.error }; }

    save(fields, options = {}) {
        fields.filter(field => FIELDS.has(field)).forEach(field => this.dirty.add(field));
        if (!this.dirty.size) return Promise.resolve({ ok: true, skipped: true });
        const patch = copy(this.player._buildProfilePatchFromFields([...this.dirty]));
        this.pending++;
        this.onStatus(this.status());
        const operation = this.tail.then(async () => {
            try {
                const result = await this.waitForWrite(this.game.net.savePlayerDataPatch(this.user.uid, patch, {
                    debounceMs: 0, forceImmediate: true, syncToZone: false,
                    checkpointPolicy: 'durable', syncRecoveryProfile: false,
                    saveReason: options.reason || 'camp_preparation'
                }));
                if (result?.ok !== true) throw new Error(result?.reason || 'camp_save_failed');
                for (const key of Object.keys(patch)) {
                    this.savedValues[key] = copy(patch[key]);
                    const current = this.player._buildProfilePatchFromFields([key])[key];
                    if (JSON.stringify(current) === JSON.stringify(patch[key])) this.dirty.delete(key);
                }
                this.error = null;
                return result;
            } catch (error) {
                this.error = error.message;
                return { ok: false, reason: this.error };
            } finally {
                this.pending--;
                this.onStatus(this.status());
            }
        });
        this.tail = operation;
        return operation;
    }

    async flush() {
        await this.tail;
        if (this.dirty.size) {
            const result = await this.save([...this.dirty], { reason: 'camp_preparation_retry' });
            if (!result.ok) return result;
        }
        try {
            const result = await this.waitForWrite(this.game.net.flushProfileWrites?.(this.user.uid));
            if (result?.ok === false) throw new Error(result.reason || 'camp_flush_failed');
            this.error = null;
            this.onStatus(this.status());
            return { ok: true };
        } catch (error) {
            this.error = error.message;
            this.onStatus(this.status());
            return { ok: false, reason: this.error };
        }
    }
}
