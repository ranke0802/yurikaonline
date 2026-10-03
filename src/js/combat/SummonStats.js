/** Snapshot an unscaled source monster once. Level/geometry/range are identities,
 * not capacities. Basic frequency stays halved; native skill cooldowns are separate.
 * Weapon and temporary buffs are separate multipliers, never folded into this base.
 */
export function summonStats(source) {
    const half=key=>Math.max(0,Number(source[key])||0)*.5;
    const stats=Object.fromEntries(['hp','maxHp','mp','maxMp','atk','def','speed','hpRegen','mpRegen'].map(key=>[key,half(key)]));
    const boss=!!source.isBoss;
    for(const key of ['hp','maxHp'])stats[key]=Math.max(0,Number(source[key])||0)*(boss?.1:.5);
    stats.atk=Math.max(0,Number(source.atk)||0)*(boss?.3:.5);
    stats.speed=Math.max(0,Number(source.speed)||0)*(boss?3:2);
    return {...stats,sourceBoss:boss,attackPower:stats.atk,defense:stats.def,
        level:source.definition?.baseStats?.level??source.level??1,
        attackRange:source.attackRange,attackCooldownSeconds:source.attackCooldownSeconds*2};
}
export function advanceSummonVitals(actor,dt) {
    if(actor.isDead||actor.hp<=0)return;
    actor.hp=Math.min(actor.maxHp,actor.hp+actor.hpRegen*dt);
    actor.mp=Math.min(actor.maxMp,actor.mp+actor.mpRegen*dt);
}
export function damageSummon(actor,amount) {
    if(actor.isDead||actor.hp<=0||!Number.isFinite(amount)||amount<=0)return 0;
    const actual=Math.min(actor.hp,Math.max(1,amount-actor.defense));
    actor.hp-=actual;actor.isDead=actor.hp<=0;return actual;
}
