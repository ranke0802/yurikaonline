/** Base attack plus class stat contribution, before equipment and combat buffs. */
export function getClassAttackPower(classId, stats, baseAttack = 10) {
    let bonus;
    switch (classId) {
        case 'warrior':
            bonus = Number(stats.vitality ?? 0);
            break;
        case 'archer':
            bonus = Number(stats.agility ?? 0);
            break;
        default: // Wizard, Witch and legacy profiles use the magic stat rule.
            bonus = Number(stats.intelligence ?? 0) + Math.floor(Number(stats.wisdom ?? 0) / 2);
    }
    return baseAttack + bonus;
}
