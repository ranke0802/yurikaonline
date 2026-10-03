import { CLASS_SKILL_UI } from '../ui/ClassSkillUI.js';

// Adapt presentation and UI targets only; leave combat, triggers and step IDs intact.
export function classTutorial(source, classId) {
    const basic = CLASS_SKILL_UI[classId]?.[0];
    if (!basic || source?.id !== 'basic_training') return source;
    const adapt = value => {
        if (typeof value === 'string') return value === 'laser' ? basic.id : value
            .replaceAll('체인 라이트닝', basic.name)
            .replaceAll('#skill-item-laser', `#skill-item-${basic.id}`)
            .replaceAll('#skill-up-laser', `#skill-up-${basic.id}`);
        if (Array.isArray(value)) return value.map(adapt);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,adapt(v)]));
        return value;
    };
    const data = adapt(source);
    const attack = data.steps.find(step => step.id === 'attack_dummy');
    const action = {
        witch: '짧게 눌렀다 놓으면 주변에 라이프 드레인을 시전합니다. 길게 눌러 조준한 뒤 놓으면 흡수 구체를 발사합니다.',
        warrior: '짧게 눌렀다 놓으면 근처의 허수아비를 연속 베기로 공격합니다. 길게 눌러 조준한 뒤 놓으면 분노 강타를 사용합니다.',
        archer: '짧게 눌렀다 놓으면 이동 사격을 합니다. 길게 눌러 조준한 뒤 놓으면 관통 저격을 발사합니다.'
    }[classId];
    attack.instructionDesktop = `기본 공격 ${basic.name}을 사용해 보세요. J 키나 오른쪽 아래 공격 버튼을 ${action}`;
    attack.instructionMobile = attack.instructionMobileLandscape = `기본 공격 ${basic.name}을 사용해 보세요. 오른쪽 아래 공격 버튼을 ${action}`;
    attack.questText = `${basic.name}: 공격 버튼을 짧게 눌렀다 놓으세요.`;
    for (const focus of Object.values(attack.focus)) focus.label = '짧게 눌렀다 놓기';
    const inspect = data.steps.find(step => step.id === 'inspect_laser_detail');
    inspect.guideTitle = `${basic.name} 설명`;
    inspect.instructionDesktop = `${basic.name} 아이콘을 클릭해 설명을 확인하세요. ${basic.summary}.`;
    inspect.instructionMobile = inspect.instructionMobileLandscape = `${basic.name} 아이콘을 탭해 설명을 확인하세요. ${basic.summary}.`;
    return data;
}
