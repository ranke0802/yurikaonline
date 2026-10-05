// Presentation state only. Never changes a target, a combat packet, or RNG.
export const MONSTER_NUMBER_TIMING = Object.freeze({ gap: .75, life: .8, fade: .15, burst: 1.5 });

export function monsterNumberSource(target, meta) {
    const actor = target?.lastAttackerId;
    const eventId = meta?.classHitId;
    if (typeof actor !== 'string' || !actor || typeof eventId !== 'string'
        || !eventId.startsWith(actor + ':') || meta.summon || meta.weaponChain || meta.cause) return null;
    // Unidentified/basic/rain hits remain individual: proximity is not identity.
    if (meta.barrage === true && typeof meta.barrageLock?.id === 'string'
        && meta.barrageLock.id.startsWith(actor + ':')) {
        return { actor, nature: 'barrage', cast: meta.barrageLock.id, eventId, originX: meta.impactX };
    }
    if (meta.classPoisonPulse === true && typeof meta.poisonPulse?.castId === 'string'
        && meta.poisonPulse.castId.startsWith(actor + ':')) {
        return { actor, nature: 'poison', cast: meta.poisonPulse.castId, eventId, originX: meta.impactX };
    }
    return null;
}

export default class MonsterDamageNumbers {
    constructor() { this.time = 0; this.states = new WeakMap(); }

    add(texts, text, target, source) {
        const value = Number(text.text.slice(1));
        if (!target || !Number.isFinite(value) || value <= 0 || !/^-\d+$/.test(text.text)) return false;
        const now = this.time;
        const key = source ? JSON.stringify([source.actor, source.nature, source.cast, !!text.isCrit]) : null;
        if (source) {
            for (const previous of texts) {
                const state = this.states.get(previous);
                if (!state || state.target !== target || state.targetId !== target.id || previous.timer <= 0) continue;
                if (state.events.has(source.eventId)) return true;
                if (state.key !== key || state.dead || now - state.last > MONSTER_NUMBER_TIMING.gap + 1e-8
                    || now - state.born >= MONSTER_NUMBER_TIMING.burst - 1e-8) continue;
                if (!Number.isSafeInteger(state.total + value)) continue;
                // One small lift on the first merge, never on every hit.
                if (state.count === 1) {
                    previous.currentY -= 8;
                    if (Number.isFinite(source.originX) && Number.isFinite(target.x)) {
                        previous.x += Math.sign(target.x - source.originX) * 8;
                    }
                }
                state.total += value; state.count++; state.last = now;
                state.dead = target.isDead || target.hp <= 0;
                state.events.add(source.eventId);
                previous.text = `-${state.total}`;
                previous.timer = MONSTER_NUMBER_TIMING.life;
                return true;
            }
        }
        text.timer = MONSTER_NUMBER_TIMING.life;
        this.states.set(text, { target, targetId: target.id, key, total: value, count: 1,
            born: now, last: now, dead: target.isDead || target.hp <= 0,
            events: new Set(source ? [source.eventId] : []) });
        texts.push(text);
        return true;
    }

    advance(dt) { this.time += Math.max(0, dt); }
    stale(text, monsters) {
        const state = this.states.get(text);
        if (!state) return false;
        const target = state.target;
        if (target.id !== state.targetId || monsters?.get(state.targetId) !== target) return true;
        if (state.dead && !target.isDead && target.hp > 0) return true;
        if (target.isDead || target.hp <= 0) state.dead = true;
        return false;
    }
    countLabel(text) {
        const count = this.states.get(text)?.count || 1;
        return count > 1 ? `${text.isCrit ? 'Critical · ' : ''}${count}회` : null;
    }
    alpha(text) { return this.states.has(text) ? Math.max(0, Math.min(1, text.timer / MONSTER_NUMBER_TIMING.fade)) : 1; }
    forget(text) { this.states.delete(text); }
    clear(texts, release) {
        if (texts) for (let i = texts.length - 1; i >= 0; i--) {
            if (!this.states.has(texts[i])) continue;
            this.states.delete(texts[i]);
            release?.(texts[i]); texts.splice(i, 1);
        }
        this.states = new WeakMap(); this.time = 0;
    }
}
