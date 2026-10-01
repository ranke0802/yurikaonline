// Host-owned, target-wide poison. Damage still happens on every accepted pulse;
// all casters share one stack/second and one non-refreshable three-second stun.
export function acceptPoisonPulse(target, now) {
    const s = target.witchPoison ||= { stacks: 0, until: 0, nextStackAt: 0, stunUntil: 0, revision: 0 };
    if (now + 1e-6 < s.stunUntil || now + 1e-6 < s.nextStackAt) return null;
    s.stacks = (s.until > now ? s.stacks : 0) + 1;
    s.until = now + 5; s.nextStackAt = now + 1; s.revision++;
    if (s.stacks === 5) { s.stacks = 0; s.until = 0; s.stunUntil = now + 3; s.nextStackAt = s.stunUntil; }
    return s;
}
export function poisonSnapshot(target) {
    const s = target.witchPoison; if (!s) return null;
    const now = target.classCombatTime || 0;
    return { revision: s.revision, stacks: s.until > now ? s.stacks : 0,
        remaining: Math.max(0, s.until-now), stun: Math.max(0, s.stunUntil-now), gate: Math.max(0,s.nextStackAt-now) };
}
export function restorePoisonSnapshot(target, data, lag = 0) {
    if (!data || !Number.isFinite(data.revision) || data.revision < (target.witchPoison?.revision || 0)) return;
    const now = target.classCombatTime || 0;
    const remaining = Math.max(0, Math.min(5, Number(data.remaining)||0)-lag);
    const stun = Math.max(0, Math.min(3, Number(data.stun)||0)-lag);
    target.witchPoison = { revision:data.revision, stacks:remaining>0?Math.max(0,Math.min(4,Math.floor(data.stacks)||0)):0,
        until:now+remaining, stunUntil:now+stun, nextStackAt:now+Math.max(0,Math.min(3,Number(data.gate)||0)-lag) };
    paintPoisonStatus(target);
}
export function paintPoisonStatus(target) {
    const s = target.witchPoison, now=target.classCombatTime||0;
    if(!s)return;
    target.classStatuses ||= {};
    const sourceId='witch-poison-host';
    if(s.stunUntil>now) {
        delete target.classStatuses.poison;
        const old=target.classStatuses.stun;
        if(!old || old.sourceId===sourceId || old.remaining<s.stunUntil-now)
            target.classStatuses.stun={remaining:s.stunUntil-now,sourceId};
    } else {
        if(target.classStatuses.stun?.sourceId===sourceId)delete target.classStatuses.stun;
        if(s.until>now && s.stacks>0)target.classStatuses.poison={remaining:s.until-now,sourceId,stacks:s.stacks,slow:s.stacks*.2};
        else if(target.classStatuses.poison?.sourceId===sourceId)delete target.classStatuses.poison;
    }
}
