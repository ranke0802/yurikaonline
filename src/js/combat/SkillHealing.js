// One rounding budget per healing event; transferred excess is already budgeted.
export function skillHealingBudget(amount,group=null) {
    amount=Number(amount);if(!Number.isFinite(amount)||amount<=0)return 0;
    if(!group)return Math.ceil(amount);
    group.healingRaw=(group.healingRaw||0)+amount;
    const rounded=Math.ceil(Math.round(group.healingRaw*1e9)/1e9),delta=Math.max(0,rounded-(group.healingRounded||0));
    group.healingRounded=rounded;return delta;
}
export function applyAllocatedHealing(target,amount) {
    const accepted=Math.min(Math.max(0,(target.maxHp??target.hp)-target.hp),Math.max(0,Number(amount)||0));
    target.hp+=accepted;return accepted;
}
// A legacy fractional HP gap can accept <1 HP: never claim a larger integer gain.
export function healingDisplayAmount(actual) {return Math.max(0,Math.floor(Number(actual)||0));}
