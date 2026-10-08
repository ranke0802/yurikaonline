import { lifeOrbProfile } from '../combat/LifeOrb.js';
import { warriorBarrageProfile } from '../combat/WarriorBarrage.js';
import { shieldRushProfile } from '../combat/ShieldRush.js';
import { BASIC_MAX_LEVEL, BASIC_SKILL_IDS, basicAttackProfile } from '../combat/BasicAttackProgression.js';
// Display metadata only; combat values and cooldowns remain owned by the runtime.
export const CLASS_SKILL_UI = {
    witch: [
        { id: 'lifeDrain', summary: '출발 다단 타격 · 귀환 추가 타격', name: '생명의 구슬', maxLevel: BASIC_MAX_LEVEL, desc: '느린 연하늘색 구슬이 최대 3마리를 각각 3회 타격하고 붉게 충전됩니다. 타격 후 조금 더 전진한 뒤 빠르게 돌아오며, 귀환 경로의 적을 각각 1회 추가 타격합니다. 귀환 피해도 회복량에 누적되며 도착하면 주인만 한 번 회복합니다. 회복은 구슬별 ATK 상한과 실제 피해의 20% 중 작은 값입니다. 빗나가면 회복하지 않습니다. 별도 쿨다운 없이 귀환한 구슬을 다시 던집니다. 스킬 2레벨마다 구슬 수가 1개씩 늘어 최대 4개입니다.' },
        { id: 'poison', summary: '최대 HP 비례 맹독 · 감속 중첩 후 기절', name: '포이즌 클라우드', desc: '물약을 던져 맹독 지대를 만듭니다. 매초 공격력 + 적 최대 HP의 5% 피해(보스 포함). 중첩당 20% 감속, 5중첩에서 3초 기절. 중첩은 5초 유지됩니다.' },
        { id: 'summon', summary: '최대 HP 80% 비용 · 소환수 최대 3마리', name: '서몬 몬스터', desc: '최대 HP의 80%를 소모합니다. 현재 HP 부족 시 비용과 소환 모두 발생하지 않습니다. 최대 3마리, 추가 소환 시 가장 오래된 소환수 해제. 사망 또는 게임 재입장 시 사라집니다.', detail: '레벨별 소환: 1 슬라임 · 2 꼬북이 · 3 에몽가 · 4 고오스 · 5 대왕슬라임 · 6 마자용 · 7 뇌제 피카츄 · 8 님피아. 일반 소환수는 원본 HP·공격력 50%, 이동속도 2배입니다. 보스 소환수는 원본 HP 10%·공격력 30%·이동속도 3배입니다. MP·방어력·재생량은 원본의 50%, 기본 공격빈도는 50%(주기 2배)를 유지합니다. 원본 고유스킬을 적 몬스터에게 사용하며 고유스킬 쿨다운은 원본을 유지합니다. 방패는 자신에게만 적용합니다. 기습은 벽을 통과하지 않으며 플레이어 전용 조작 반전은 몬스터에게 적용하지 않습니다. 레벨·공격 사거리는 원본을 유지하고 보스 소환수 크기는 원본의 60%입니다.' },
        { id: 'berserk', summary: '자신 제외 아군 / 소환수 10초 강화', name: '버서크 포션', desc: '시전자를 제외한 파티원과 시전자 자신의 소환수에게 10초 동안 이동 속도 +25%, 공격 속도 +70%, 공격력 +20%. 강화 중인 소환수 하단에 버서크 아이콘이 표시됩니다. 재사용해도 배율은 누적되지 않습니다.' }
    ],
    warrior: [
        { id: 'cleave', summary: '근접 3연타 / 홀드 넓은 검격 발사', name: '연속 베기 / 검격 발사', maxLevel: BASIC_MAX_LEVEL, desc: '탭으로 3연속 베기, 마지막 타격으로 분노를 얻습니다. 0.5초 홀드 조준 후 놓으면 분노 25로 넓은 검격을 발사합니다. 검격은 초당 720px로 최소 900px 또는 현재 화면 긴 변의 60% 이상 이동합니다. Lv.1 폭 192px, 피해 ATK 350%에 기본 공격 레벨 성장을 적용하며 경로의 적을 각각 1회 관통 타격하고 벽에 막힙니다. 분노를 피의 맹세 종료 공격에 남길지 선택하세요.' },
        { id: 'challenge', summary: '느린 방패 전진 · 이동 중 전방향 공격 차단', name: '방패 돌진', desc: '방패를 앞세워 초당 120px로 전진합니다. Lv.1은 3회/1.6초, Lv.8은 10회/3.7초입니다. 이동 중 공격 피해와 공격 상태이상을 전방향으로 막습니다. 시간 구간마다 경로의 적을 1회 타격하고 구간 전진 거리만큼 밀어냅니다. 대상별 세 번째 넉백부터 0.8초 기절하며 이후 돌진 타격은 기절을 갱신합니다(보스 넉백·기절 제외). 늦게 진입한 적은 남은 구간만 타격합니다. 총 피해를 타격 수로 나눕니다(회당 최소 1). 벽에 닿거나 전진이 끝나면 블록도 끝납니다. MP·분노 비용은 없습니다. 적중 후 4초 안에 광천격을 맞히면 분노 25를 돌려받습니다.' },
        { id: 'charge', summary: '좁고 긴 전방 연사 · 4~32회 · 방패 연계', name: '광천격', desc: '이동 돌진 없이 조준 방향을 고정하고 2초 동안 전방에 연속 검격을 발사합니다. Lv.1은 사거리 600px·폭 64px·4회·총 ATK 480%, Lv.8은 740px·78px·32회·총 ATK 748.8%입니다. 대상 방어력을 총 피해에 한 번 적용한 뒤 타격별로 나누며 소수점 누적으로 피해가 증가하지 않습니다. 2초 동안 시전자와 실제 적중한 몬스터(보스 포함)의 위치를 고정하고 몬스터 공격 준비를 취소·억제합니다. 시전자는 피해를 받으며 벽에서 막힙니다. 다른 공격·스킬·조준 취소·기절·사망·필드 전환 시 종료합니다. 방패 돌진 적중 후 4초 안에 맞히면 시전당 분노 25를 한 번 돌려받습니다. 기본 쿨다운 7초, MP·분노 비용 0. 뇌광 무기의 피해·쿨다운 옵션을 적용합니다.' },
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
        if (player.classId === 'witch') { const p=lifeOrbProfile(profile.level); return `Lv.${p.level}: 구슬 ${p.capacity}개 · 타격당 ATK ${Math.round(p.hitMultiplier*100)}% / 출발 대상당 최대 3회 + 귀환 1회 · 회복 상한 ATK ${Math.round(p.healMultiplier*100)}% · 사거리 ${p.range}px`; }
        if (player.classId === 'warrior') return `Lv.${profile.level}: 기본 피해 ${damage}% / 검격 ATK ${Math.round(damage*3.5)}% · 베기 거리 ${px(profile.tap.range)}px / 폭 ${px(profile.tap.halfWidth * 2)}px · 검격 최소 거리 ${px(profile.heavy.range)}px (화면 긴 변 60% 보장) / 폭 ${px(profile.heavy.halfWidth*2)}px · 밀치기 ${profile.tap.knockback}px (검격 ${profile.heavy.knockback}px, 보스 제외)`;
        return `Lv.${profile.level}: 일반/저격 피해 ${damage}% · 저격 준비 ${profile.chargeSeconds.toFixed(2)}초 (도약 강화 ${(profile.chargeSeconds * .4).toFixed(3)}초)`;
    };
    const current = basicAttackProfile(player.classId, player.skillLevels);
    return [describe(current), current.level < BASIC_MAX_LEVEL
        ? `다음 강화 — ${describe(basicAttackProfile(player.classId, { [id]: current.level + 1 }))}`
        : '최대 레벨 8',
        player.classId==='witch'?'출발 0.25초 간격 · 출발 최대 3대상 · 귀환은 적마다 1회 · 귀환 시 슬롯 회복 · 실제 피해가 있어야 회복합니다.':'피해 배율은 Lv.1 대비입니다. 공격 후 재사용 간격과 중첩 규칙은 유지됩니다.'];
}

export function shieldRushUpgradeDetails(player) {
    const current=shieldRushProfile(player.skillLevels?.challenge);
    const describe=p=>`Lv.${p.level}: ${p.hits}회 · ${p.duration.toFixed(1)}초 · ${Math.round(p.distance)}px · 총 ATK ${100+8*(p.level-1)}% 분할 · 기본 쿨다운 ${(10*(1-.03*(p.level-1))).toFixed(1)}초`;
    return [describe(current),current.level<8?`다음 강화 — ${describe(shieldRushProfile(current.level+1))}`:'최대 레벨 8','넉백 3회부터 기절 0.8초, 이후 방패 돌진 타격만 기절 갱신. MP·분노 비용 0. 무기의 피해/쿨다운 보정은 별도 적용.'];
}

export function warriorBarrageUpgradeDetails(player) {
    const p=warriorBarrageProfile(player.skillLevels?.charge);
    const describe=g=>`Lv.${g.level}: ${g.hits}회 / ${g.duration}초 · 거리 ${g.range}px · 폭 ${g.halfWidth*2}px · 총 ATK ${Number((g.damageMultiplier*100).toFixed(1))}% · 쿨다운 ${(7*(1-.03*(g.level-1))).toFixed(2)}초`;
    return [describe(p),p.level<8?`다음 강화 — ${describe(warriorBarrageProfile(p.level+1))}`:'최대 레벨 8','총 피해 분할(회당 최소 1). 뇌광 무기의 피해·쿨다운 보정은 별도 적용.'];
}
