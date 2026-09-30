// Presentation-only journal. Never imported by profile/reward writers.
export function progressSnapshot(profile = {}) {
    const n = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
    return {
        level: Math.max(1, n(profile.level)), exp: n(profile.exp), manastone: n(profile.manastone),
        bagSlots: Array.isArray(profile.inventory) ? profile.inventory.filter(item => item && !['gold', 'manastone'].includes(item.type)).length : 0
    };
}

export default class AdventureSummary {
    constructor(storage = null) {
        this.storage = storage || { getItem: key => sessionStorage.getItem(key), setItem: (key, value) => sessionStorage.setItem(key, value) };
        this.memory = new Map();
    }
    key(uid, local) { return `yurika.adventure-summary.v1:${local ? 'local' : 'account'}:${uid}`; }
    read(key) {
        try { return JSON.parse(this.storage.getItem(key)) || this.memory.get(key) || {}; }
        catch { return this.memory.get(key) || {}; }
    }
    write(key, value) {
        this.memory.set(key, value);
        try { this.storage.setItem(key, JSON.stringify(value)); } catch { /* Optional presentation; never block a real save. */ }
    }
    begin(uid, local, profile) {
        const key = this.key(uid, local);
        this.write(key, { ...this.read(key), pending: progressSnapshot(profile) });
    }
    cancel(uid, local) {
        const key = this.key(uid, local); const value = this.read(key); delete value.pending; this.write(key, value);
    }
    finish(uid, local, profile) {
        const key = this.key(uid, local); const value = this.read(key);
        if (value.pending) {
            value.last = { before: value.pending, after: progressSnapshot(profile) };
            delete value.pending; this.write(key, value);
        }
        // Historical result is only shown while it still matches the saved profile.
        if (JSON.stringify(value.last?.after) !== JSON.stringify(progressSnapshot(profile))) return null;
        return value.last || null;
    }
}
