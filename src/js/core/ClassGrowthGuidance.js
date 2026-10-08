// Presentation only. The attack calculation remains in ClassAttackStats.js.
const guides = Object.freeze({
    wizard: { stat: 'intelligence', label: '지능', name: '마법사', attack: '지능 1마다 공격력 +1, 지혜 2마다 공격력 +1' },
    witch: { stat: 'intelligence', label: '지능', name: '위치', attack: '지능 1마다 공격력 +1, 지혜 2마다 공격력 +1' },
    warrior: { stat: 'vitality', label: '체력', name: '전사', attack: '체력 1마다 공격력 +1' },
    archer: { stat: 'agility', label: '순발력', name: '궁수', attack: '순발력 1마다 공격력 +1' }
});

export function classGrowthGuidance(classId) {
    return guides[classId] || guides.wizard;
}

export function classStatInsight(classId, stat) {
    const guide = classGrowthGuidance(classId);
    if (stat === guide.stat) return `${guide.name}: ${guide.attack}.`;
    if (stat === 'wisdom' && ['wizard', 'witch'].includes(classId || 'wizard')) {
        return '지혜는 최대 MP와 마나 회복을 높이며, 2마다 공격력도 1 올라갑니다.';
    }
    return null;
}
