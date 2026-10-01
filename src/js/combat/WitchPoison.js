// Host-owned target-wide poison. Arrival jitter must not discard logical pulses.
// Each cast has five numbered pulses; its first received pulse anchors a fixed
// time axis. All casts share target-wide one-second buckets, including reorders.
const EPS = 1e-6;
const state = target => target.witchPoison ||= { stacks:0, until:0, nextStackAt:0, stunUntil:0, revision:0 };
export function validPoisonPulse(pulse) {
    return pulse && typeof pulse.castId === 'string' && pulse.castId.length > 0 && pulse.castId.length <= 180
        && Number.isInteger(pulse.index) && pulse.index >= 1 && pulse.index <= 5;
}
// Independent of classHitId: a retried logical pulse can have a new transport ID.
// Keep this journal in host snapshots so handoff cannot replay accepted damage.
export function claimPoisonPulse(target, now, pulse, authoritative = true) {
    if (!validPoisonPulse(pulse)) return false;
    const s=state(target); s.seen ||= [];
    s.seen=s.seen.filter(p => p.until > now);
    const id=JSON.stringify([pulse.castId,pulse.index]);
    if(s.seen.some(p=>p.id===id)) return false;
    s.seen.push({id,until:now+30}); if(s.seen.length>256)s.seen.shift();
    if(authoritative)s.revision++; return true;
}
export function acceptPoisonPulse(target, now, pulse = null) {
    const s=state(target);
    if (!validPoisonPulse(pulse)) {
        // Compatibility for already-in-flight old clients and direct fixtures.
        if(now+EPS<s.stunUntil || now+EPS<s.nextStackAt)return null;
    } else {
        s.casts ||= []; s.buckets ||= [];
        s.casts=s.casts.filter(c=>c.expires>now);
        let cast=s.casts.find(c=>c.id===pulse.castId);
        if(!cast) {
            cast={id:pulse.castId,anchor:now-(pulse.index-1),expires:now+30};
            s.casts.push(cast);if(s.casts.length>64)s.casts.shift();
        }
        const logical=cast.anchor+pulse.index-1;
        s.origin ??= logical;
        const bucket=Math.floor(logical-s.origin+EPS);
        s.buckets=s.buckets.filter(b=>b.until>now);
        // Record even locked-out buckets: their delayed siblings must not add a
        // stack immediately after stun ends. Never extend stun while locked.
        if(s.buckets.some(b=>b.id===bucket))return null;
        s.buckets.push({id:bucket,until:now+30});if(s.buckets.length>64)s.buckets.shift();
        s.revision++;
        if(now+EPS<s.stunUntil || logical+EPS<(s.lockLogicalUntil ?? -Infinity))return null;
        // A heavily delayed pre-expiry pulse must not revive an expired chain.
        if(logical<now-5)return null;
        s.lastLogical=Math.max(s.lastLogical ?? logical,logical);
    }
    s.stacks=(s.until>now ? s.stacks : 0)+1;
    s.until=now+5;s.nextStackAt=now+1;s.revision++;
    if(s.stacks===5) {
        s.stacks=0;s.until=0;s.stunUntil=now+3;s.nextStackAt=s.stunUntil;
        s.lockLogicalUntil=now+3;
    }
    return s;
}
export function poisonSnapshot(target) {
    const s=target.witchPoison;if(!s)return null;
    const now=target.classCombatTime||0;
    return {revision:s.revision,stacks:s.until>now?s.stacks:0,
        remaining:Math.max(0,s.until-now),stun:Math.max(0,s.stunUntil-now),gate:Math.max(0,s.nextStackAt-now),
        logical:s.origin===undefined?null:{origin:s.origin-now,lock:Number.isFinite(s.lockLogicalUntil)?s.lockLogicalUntil-now:null,
            casts:(s.casts||[]).filter(c=>c.expires>now).map(c=>({id:c.id,anchor:c.anchor-now,remaining:c.expires-now})),
            buckets:(s.buckets||[]).filter(b=>b.until>now).map(b=>({id:b.id,remaining:b.until-now}))},
        seen:(s.seen||[]).filter(p=>p.until>now).map(p=>({id:p.id,remaining:p.until-now}))};
}
export function restorePoisonSnapshot(target,data,lag=0) {
    if(!data || !Number.isFinite(data.revision) || data.revision<(target.witchPoison?.revision||0))return;
    const now=target.classCombatTime||0;
    const remaining=Math.max(0,Math.min(5,Number(data.remaining)||0)-lag);
    const stun=Math.max(0,Math.min(3,Number(data.stun)||0)-lag);
    const s=target.witchPoison={revision:data.revision,stacks:remaining>0?Math.max(0,Math.min(4,Math.floor(data.stacks)||0)):0,
        until:now+remaining,stunUntil:now+stun,nextStackAt:now+Math.max(0,Math.min(3,Number(data.gate)||0)-lag)};
    s.seen=(Array.isArray(data.seen)?data.seen:[]).slice(-256).filter(p=>typeof p.id==='string'&&p.id.length<=200&&p.remaining>lag)
        .map(p=>({id:p.id,until:now+Math.min(30,p.remaining)-lag}));
    if(data.logical && Number.isFinite(data.logical.origin)) {
        s.origin=now+data.logical.origin-lag;
        s.lockLogicalUntil=Number.isFinite(data.logical.lock)?now+data.logical.lock-lag:-Infinity;
        s.casts=(Array.isArray(data.logical.casts)?data.logical.casts:[]).slice(-64)
            .filter(c=>typeof c.id==='string'&&c.id.length<=180&&Number.isFinite(c.anchor)&&c.remaining>lag)
            .map(c=>({id:c.id,anchor:now+c.anchor-lag,expires:now+Math.min(30,c.remaining)-lag}));
        s.buckets=(Array.isArray(data.logical.buckets)?data.logical.buckets:[]).slice(-64)
            .filter(b=>Number.isInteger(b.id)&&b.remaining>lag).map(b=>({id:b.id,until:now+Math.min(30,b.remaining)-lag}));
    }
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
