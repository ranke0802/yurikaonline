// Presentation-only journal. It never writes profiles or awards rewards.
const nonnegative = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const numericMap = value => Object.fromEntries(Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, amount]) => [key, nonnegative(amount)]));
export function progressSnapshot(profile = {}) {
    const inventory = Array.isArray(profile.inventory) ? profile.inventory : [];
    const items = {};
    // Equipped items remain owned: equipping/unequipping is not a reward.
    for (const item of [...inventory, ...Object.values(profile.equipment || {})]) {
        if (!item || ['gold', 'manastone'].includes(item.type)) continue;
        const key = item.type || item.id || 'item';
        items[key] = (items[key] || 0) + Math.max(1, nonnegative(item.amount));
    }
    return {
        level: Math.max(1, nonnegative(profile.level)), exp: nonnegative(profile.exp), manastone: nonnegative(profile.manastone),
        bagSlots: inventory.filter(item => item && !['gold', 'manastone'].includes(item.type)).length,
        items: numericMap(items), skills: numericMap(profile.skillLevels),
        stats: numericMap(Object.fromEntries(['vitality', 'intelligence', 'wisdom', 'agility', 'statPoints'].map(key => [key, profile[key]])))
    };
}

export default class AdventureSummary {
    constructor(storage = null) {
        this.storage = storage || { getItem: key => sessionStorage.getItem(key), setItem: (key, value) => sessionStorage.setItem(key, value) };
        this.memory = new Map();
    }
    key(uid, local) { return `yurika.adventure-summary.v1:${local ? 'local' : 'account'}:${uid}`; }
    read(key) {
        // The in-memory copy also wins after a quota failure over stale storage.
        if (this.memory.has(key)) return this.memory.get(key);
        try {
            const value = JSON.parse(this.storage.getItem(key));
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        } catch { return {}; }
    }
    write(key, value) {
        this.memory.set(key, value);
        try { this.storage.setItem(key, JSON.stringify(value)); } catch { /* Optional presentation must never block a real save. */ }
    }
    begin(uid, local, profile) {
        const key = this.key(uid, local); const value = this.read(key);
        // A duplicated departure or reload must not replace the starting point.
        if (value.pending) return;
        value.pending = progressSnapshot(profile);
        value.ledger = { manastoneGained: 0, manastoneSpent: 0, expGained: 0, expProgress: null, currency: value.pending.manastone, events: [] };
        this.write(key, value);
    }
    observeCurrency(uid, local, amount) {
        const key = this.key(uid, local); const value = this.read(key);
        if (!value.pending || !value.ledger || !Number.isFinite(Number(amount))) return;
        const next = nonnegative(amount); const delta = next - value.ledger.currency;
        if (!delta) return;
        value.ledger[delta > 0 ? 'manastoneGained' : 'manastoneSpent'] += Math.abs(delta);
        value.ledger.currency = next;
        this.write(key, value);
    }
    record(uid, local, { kind, amount, eventId, progress } = {}) {
        const key = this.key(uid, local); const value = this.read(key);
        if (!value.pending || !value.ledger || !['exp', 'manastone'].includes(kind) || !Number.isFinite(Number(amount)) || Number(amount) === 0 || (kind === 'exp' && Number(amount) < 0)) return;
        if (eventId && value.ledger.events.includes(String(eventId))) return;
        if (kind === 'exp') {
            value.ledger.expGained += Number(amount);
            value.ledger.expProgress = progress ? { level: nonnegative(progress.level), exp: nonnegative(progress.exp) } : null;
        }
        else {
            value.ledger[Number(amount) > 0 ? 'manastoneGained' : 'manastoneSpent'] += Math.abs(Number(amount));
            value.ledger.currency += Number(amount);
        }
        if (eventId) value.ledger.events.push(String(eventId));
        this.write(key, value);
    }
    cancel(uid, local) {
        const key = this.key(uid, local); const value = this.read(key);
        delete value.pending; delete value.ledger; this.write(key, value);
    }
    finish(uid, local, profile) {
        const key = this.key(uid, local); const value = this.read(key);
        const after = progressSnapshot(profile);
        if (value.pending) {
            const ledger = value.ledger;
            // Do not invent gross gains/spends from a net snapshot. If the
            // authoritative saved currency differs, show only the saved net.
            const currencyTracked = !!ledger && ledger.currency === after.manastone;
            value.last = {
                before: value.pending, after,
                totals: {
                    manastoneGained: currencyTracked ? ledger.manastoneGained : null,
                    manastoneSpent: currencyTracked ? ledger.manastoneSpent : null,
                    manastoneNet: after.manastone - value.pending.manastone,
                    expGained: ledger && (!ledger.expProgress || (ledger.expProgress.level === after.level && ledger.expProgress.exp === after.exp)) ? ledger.expGained : null,
                    levelsGained: after.level - value.pending.level
                }
            };
            delete value.pending; delete value.ledger; this.write(key, value);
        }
        // Historical results are only shown against their matching saved state.
        if (JSON.stringify(value.last?.after) !== JSON.stringify(after)) return null;
        return value.last || null;
    }
}
