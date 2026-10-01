// Display metadata only; combat values and cooldowns remain owned by the runtime.
export const CLASS_SKILL_UI = {
    witch: [
        { id: 'lifeDrain', summary: '즉시 광역 타격 / 조준 흡수 후 귀환 회복', name: '라이프 드레인', maxLevel: 1, desc: '탭: 주변 마법진에 즉시 일반 드레인 피해의 200%. 홀드 조준: 느린 녹색 구체가 적에게 닿으면 3초 동안 매초 생명력을 흡수한 뒤 돌아옵니다. 귀환 시 실제 피해의 50% 회복, 남는 회복은 아군과 소환수에게 전달됩니다.' },
        { id: 'poison', summary: '최대 HP 비례 맹독 · 감속 중첩 후 기절', name: '포이즌 클라우드', desc: '물약을 던져 맹독 지대를 만듭니다. 매초 공격력 + 적 최대 HP의 5% 피해(보스 포함). 중첩당 20% 감속, 5중첩에서 3초 기절. 중첩은 5초 유지됩니다.' },
        { id: 'summon', summary: '최대 HP 80% 비용 · 소환수 최대 3마리', name: '서몬 몬스터', desc: '최대 HP의 80%를 소모합니다. 현재 HP 부족 시 비용과 소환 모두 발생하지 않습니다. 최대 3마리, 추가 소환 시 가장 오래된 소환수 해제. 사망 또는 게임 재입장 시 사라집니다.', detail: '레벨별 소환: 1 슬라임 · 2 꼬북이 · 3 에몽가 · 4 고오스 · 5 대왕슬라임 · 6 마자용 · 7 뇌제 피카츄 · 8 님피아. 보스 소환수 크기는 원본의 60%입니다.' },
        { id: 'berserk', summary: '자신 제외 아군 / 소환수 10초 강화', name: '버서크 포션', desc: '자신을 제외한 아군과 소환수에게 10초 동안 이동 속도 +25%, 공격 속도 +70%, 공격력 +20%. 재사용해도 배율은 누적되지 않습니다.' }
    ],
    warrior: [
        { id: 'cleave', summary: '3연타 분노 획득 / 조준 분노 강타', name: '연속 베기 / 분노 강타', maxLevel: 1, desc: '탭으로 3연속 베기, 마지막 타격으로 분노를 얻습니다. 홀드 조준 시 분노를 소모해 방어를 깨는 강타를 날립니다. 분노를 피의 맹세 종료 공격에 남길지 선택하세요.' },
        { id: 'challenge', summary: '주변 도발 · 방어 태세 · 피해 분노 전환', name: '도전의 함성', desc: '주변 적을 도발하고 방어 태세에 들어갑니다. 받은 피해 일부를 분노로 전환하여 강타와 피의 맹세로 반격합니다.' },
        { id: 'charge', summary: '적 밀기 · 벽 충돌 기절 · 도발 연계', name: '응징의 돌진', desc: '지정 방향으로 돌진하며 적을 밀어냅니다. 벽 충돌 시 기절시키고, 도발한 적을 맞히면 강타에 사용할 분노를 돌려받습니다.' },
        { id: 'bloodPact', summary: '흡혈 강화 · 종료 시 남은 분노로 강타', name: '피의 맹세', desc: '일정 시간 흡혈과 생존력을 강화합니다. 종료 시 남아 있는 분노를 소모해 주변을 강타합니다. 지속 중 강타를 사용하면 종료 공격에 남는 분노가 줄어듭니다.' }
    ],
    archer: [
        { id: 'shot', summary: '이동 사격 표식 / 조준 관통 저격', name: '이동 사격 / 관통 저격', maxLevel: 1, desc: '탭으로 이동하며 사격해 표식을 중첩합니다. 홀드 조준으로 관통 저격을 준비하고 표식을 소모해 피해를 높입니다.' },
        { id: 'trap', summary: '접촉 속박 · 저격 폭발로 표식 확산', name: '사냥꾼의 덫', desc: '지정 위치에 덫을 설치합니다. 접촉한 적을 속박하고 표식을 부여합니다. 덫에 걸린 적을 저격하면 폭발하여 주변 적에게 표식을 퍼뜨립니다.' },
        { id: 'shadowLeap', summary: '회피 / 미끼 · 다음 저격 강화', name: '그림자 도약', desc: '지정 방향으로 회피하고 출발 지점에 미끼를 남깁니다. 다음 저격의 충전이 빨라지고 표식 소모 효과가 강화됩니다.' },
        { id: 'rain', summary: '범위 화살비 · 표식 추적 / 처치 전이', name: '추적의 폭우', desc: '지정 영역에 화살비를 내립니다. 표식이 있는 적에게 추적 화살이 추가되며, 처치한 적의 표식은 근처의 다른 적으로 이전됩니다.' }
    ]
};
export const MAGE_SKILL_IDS = ['laser', 'missile', 'fireball', 'shield'];
export function classSkillIds(player) {
    return CLASS_SKILL_UI[player?.classId]?.map(skill => skill.id) || MAGE_SKILL_IDS;
}
export function classSkillMaxLevel(player, id) {
    const entry = CLASS_SKILL_UI[player?.classId]?.find(skill => skill.id === id);
    return entry ? (entry.maxLevel || 8) : id === 'shield' ? 1 : Infinity;
}
