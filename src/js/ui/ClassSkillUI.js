import { shieldRushProfile } from '../combat/ShieldRush.js';
import { BASIC_MAX_LEVEL, BASIC_SKILL_IDS, basicAttackProfile } from '../combat/BasicAttackProgression.js';
// Display metadata only; combat values and cooldowns remain owned by the runtime.
export const CLASS_SKILL_UI = {
    witch: [
        { id: 'lifeDrain', summary: '유도 구슬 명중 흡수 / 조준 흡수 후 귀환 회복', name: '라이프 드레인', maxLevel: BASIC_MAX_LEVEL, desc: '탭: 560px 안의 적을 자동 선택하는 녹색 유도 구슬을 발사합니다. 명중 지점의 범위에 일반 드레인 피해의 200%(Lv.1 기준)를 주고 영혼이 돌아옵니다. 벽에 막히거나 빗나가면 회복하지 않습니다. 홀드 조준: 느린 녹색 구체가 적에게 닿으면 3초 동안 매초 생명력을 흡수한 뒤 돌아옵니다. 귀환 시 실제 피해의 50% 회복, 남는 회복은 아군과 소환수에게 전달됩니다.' },
        { id: 'poison', summary: '최대 HP 비례 맹독 · 감속 중첩 후 기절', name: '포이즌 클라우드', desc: '물약을 던져 맹독 지대를 만듭니다. 매초 공격력 + 적 최대 HP의 5% 피해(보스 포함). 중첩당 20% 감속, 5중첩에서 3초 기절. 중첩은 5초 유지됩니다.' },
        { id: 'summon', summary: '최대 HP 80% 비용 · 소환수 최대 3마리', name: '서몬 몬스터', desc: '최대 HP의 80%를 소모합니다. 현재 HP 부족 시 비용과 소환 모두 발생하지 않습니다. 최대 3마리, 추가 소환 시 가장 오래된 소환수 해제. 사망 또는 게임 재입장 시 사라집니다.', detail: '레벨별 소환: 1 슬라임 · 2 꼬북이 · 3 에몽가 · 4 고오스 · 5 대왕슬라임 · 6 마자용 · 7 뇌제 피카츄 · 8 님피아. 보스 소환수 크기는 원본의 60%입니다.' },
        { id: 'berserk', summary: '자신 제외 아군 / 소환수 10초 강화', name: '버서크 포션', desc: '자신을 제외한 아군과 소환수에게 10초 동안 이동 속도 +25%, 공격 속도 +70%, 공격력 +20%. 재사용해도 배율은 누적되지 않습니다.' }
    ],
    warrior: [
        { id: 'cleave', summary: '근접 3연타 / 홀드 넓은 검격 발사', name: '연속 베기 / 검격 발사', maxLevel: BASIC_MAX_LEVEL, desc: '탭으로 3연속 베기, 마지막 타격으로 분노를 얻습니다. 0.5초 홀드 조준 후 놓으면 분노 25로 넓은 검격을 발사합니다. 검격은 초당 360px로 이동하며 경로의 적을 각각 1회 관통 타격하고 벽에 막힙니다. 분노를 피의 맹세 종료 공격에 남길지 선택하세요.' },
        { id: 'challenge', summary: '느린 방패 전진 · 이동 중 전방향 공격 차단', name: '방패 돌진', desc: '방패를 앞세워 초당 120px로 전진합니다. Lv.1은 3회/1.6초, Lv.8은 10회/3.7초입니다. 이동 중 공격 피해와 공격 상태이상을 전방향으로 막습니다. 시간 구간마다 경로의 적을 1회 타격하고 구간 전진 거리만큼 밀어냅니다. 대상별 세 번째 넉백부터 0.8초 기절하며 이후 돌진 타격은 기절을 갱신합니다(보스 넉백·기절 제외). 늦게 진입한 적은 남은 구간만 타격합니다. 총 피해를 타격 수로 나눕니다(회당 최소 1). 벽에 닿거나 전진이 끝나면 블록도 끝납니다. MP·분노 비용은 없습니다. 적중 후 4초 안에 응징의 돌진을 맞히면 분노 25를 돌려받습니다.' },
        { id: 'charge', summary: '적 밀기 · 벽 충돌 기절 · 방패 타격 연계', name: '응징의 돌진', desc: '지정 방향으로 돌진하며 적을 밀어냅니다. 벽 충돌 시 기절시키고, 방패 돌진으로 맞힌 적을 4초 안에 맞히면 강타에 사용할 분노를 돌려받습니다.' },
        { id: 'bloodPact', summary: '흡혈 강화 · 종료 시 남은 분노로 강타', name: '피의 맹세', desc: '일정 시간 흡혈과 생존력을 강화합니다. 종료 시 남아 있는 분노를 소모해 주변을 강타합니다. 지속 중 강타를 사용하면 종료 공격에 남는 분노가 줄어듭니다.' }
    ],
    archer: [
        { id: 'shot', summary: '이동 사격 표식 / 조준 관통 저격', name: '이동 사격 / 관통 저격', maxLevel: BASIC_MAX_LEVEL, desc: '탭으로 이동하며 사격해 표식을 중첩합니다. 홀드 조준으로 관통 저격을 준비하고 표식을 소모해 피해를 높입니다.' },
        { id: 'trap', summary: '접촉 속박 · 저격 폭발로 표식 확산', name: '사냥꾼의 덫', desc: '지정 위치에 덫을 설치합니다. 접촉한 적을 속박하고 표식을 부여합니다. 덫에 걸린 적을 저격하면 폭발하여 주변 적에게 표식을 퍼뜨립니다.' },
        { id: 'shadowLeap', summary: '뒤로 회피 / 미끼 · 다음 저격 강화', name: '그림자 도약', desc: '조준하거나 바라보는 방향의 반대로 최대 160px 후퇴합니다. 벽 앞에서 멈춥니다. 지정 방향으로 회피하고 출발 지점에 미끼를 남깁니다. 다음 저격의 충전이 빨라지고 표식 소모 효과가 강화됩니다.' },
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

export function basicAttackUpgradeDetails(player) {
    const id = BASIC_SKILL_IDS[player?.classId];
    if (!id) return [];
    const describe = profile => {
        const damage = Math.round(profile.damageMultiplier * 100);
        const px = value => Number(value.toFixed(2));
        if (player.classId === 'witch') return `Lv.${profile.level}: 기본 피해 ${damage}% · 탭 사거리 560px / 명중 흡수 반경 ${px(profile.tapRadius)}px · 구체 판정 반경 ${px(profile.orbRadius)}px`;
        if (player.classId === 'warrior') return `Lv.${profile.level}: 기본/검격 피해 ${damage}% · 베기 거리 ${px(profile.tap.range)}px / 폭 ${px(profile.tap.halfWidth * 2)}px · 검격 거리 ${px(profile.heavy.range)}px / 폭 ${px(profile.heavy.halfWidth*2)}px · 밀치기 ${profile.tap.knockback}px (검격 ${profile.heavy.knockback}px, 보스 제외)`;
        return `Lv.${profile.level}: 일반/저격 피해 ${damage}% · 저격 준비 ${profile.chargeSeconds.toFixed(2)}초 (도약 강화 ${(profile.chargeSeconds * .4).toFixed(3)}초)`;
    };
    const current = basicAttackProfile(player.classId, player.skillLevels);
    return [describe(current), current.level < BASIC_MAX_LEVEL
        ? `다음 강화 — ${describe(basicAttackProfile(player.classId, { [id]: current.level + 1 }))}`
        : '최대 레벨 8',
        '피해 배율은 Lv.1 대비입니다. 공격 후 재사용 간격과 중첩 규칙은 유지됩니다.'];
}

export function shieldRushUpgradeDetails(player) {
    const current=shieldRushProfile(player.skillLevels?.challenge);
    const describe=p=>`Lv.${p.level}: ${p.hits}회 · ${p.duration.toFixed(1)}초 · ${Math.round(p.distance)}px · 총 ATK ${100+8*(p.level-1)}% 분할 · 기본 쿨다운 ${(10*(1-.03*(p.level-1))).toFixed(1)}초`;
    return [describe(current),current.level<8?`다음 강화 — ${describe(shieldRushProfile(current.level+1))}`:'최대 레벨 8','넉백 3회부터 기절 0.8초, 이후 방패 돌진 타격만 기절 갱신. MP·분노 비용 0. 무기의 피해/쿨다운 보정은 별도 적용.'];
}
