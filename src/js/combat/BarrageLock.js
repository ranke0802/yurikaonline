// Per-cast displacement/action leases; independent of stun and boss CC immunity.
export function enforceBarrageLock(entity, now=Date.now()) {
    const locks=entity?.barrageLocks;if(!locks)return false;
    for(const [key,lock] of locks)if(entity.isDead||entity.hp<=0||(lock.active?!lock.active():now>=lock.expiresAt))locks.delete(key);
    const lock=locks.values().next().value;if(!lock)return false;
    entity.x=lock.x;entity.y=lock.y;entity.vx=entity.vy=0;
    if(entity.knockback)entity.knockback.vx=entity.knockback.vy=0;
    return true;
}
export function acquireBarrageLock(entity,key,{active,expiresAt,blockAttacks=false}={}) {
    enforceBarrageLock(entity);
    entity.barrageLocks ||= new Map();
    if(!entity.barrageLocks.has(key))entity.barrageLocks.set(key,{x:entity.x,y:entity.y,active,expiresAt});
    if(blockAttacks){
        entity.chargeState='idle';entity.chargeTimer=0;entity.chargeTarget=null;
        entity.activeBossTelegraphs=[];entity.shadowAmbush=null;
        entity.cancelPendingBarrageAttacks?.();
    }
    enforceBarrageLock(entity);
}
export function releaseBarrageLock(entity,key){entity?.barrageLocks?.delete(key);}
export function receiveBarrageLock(entity,packet){
    if(!packet||typeof packet.id!=='string'||packet.id.length>180)return false;
    const now=Date.now();entity.barrageReleased ||= new Map();
    for(const [id,at] of entity.barrageReleased)if(now-at>10000)entity.barrageReleased.delete(id);
    if(packet.release===true){releaseBarrageLock(entity,packet.id);entity.barrageReleased.set(packet.id,now);return true;}
    if(entity.barrageReleased.has(packet.id))return false;
    if(!Number.isFinite(packet.until)||packet.until<=now||packet.until>now+2500)return false;
    acquireBarrageLock(entity,packet.id,{expiresAt:packet.until,blockAttacks:true});return true;
}
