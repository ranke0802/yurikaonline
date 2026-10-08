import { CLASS_SKILL_UI } from '../ui/ClassSkillUI.js';
import { classGrowthGuidance } from './ClassGrowthGuidance.js';

// Adapt presentation and UI targets only; leave combat, triggers and step IDs intact.
export function classTutorial(source, classId) {
    const basic = CLASS_SKILL_UI[classId]?.[0];
    if (source?.id !== 'basic_training') return source;
    const growth = classGrowthGuidance(classId);
    const adapt = value => {
        if (typeof value === 'string') {
            const text = value.replaceAll('#status-intelligence-row', `#status-${growth.stat}-row`);
            if (!basic) return text;
            return text === 'laser' ? basic.id : text
                .replaceAll('체인 라이트닝', basic.name)
                .replaceAll('#skill-item-laser', `#skill-item-${basic.id}`)
                .replaceAll('#skill-up-laser', `#skill-up-${basic.id}`);
        }
        if (Array.isArray(value)) return value.map(adapt);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,adapt(v)]));
        return value;
    };
    const data = adapt(source);
    const preview = data.steps.find(step => step.id === 'preview_status_change');
    if (preview) {
        preview.target = growth.stat;
        const text = `${growth.name}: ${growth.attack}. ${growth.label} + 버튼을 눌러 공격력 미리보기를 확인하세요.`;
        for (const key of ['instruction', 'instructionDesktop', 'instructionMobile', 'instructionMobileLandscape']) preview[key] = text;
        preview.questText = `${growth.label} +1로 공격력 변화를 확인하세요.`;
    }
    // Mage attack teaching and every persisted step/quest identifier stay intact.
    if (!basic) return data;
    const attack = data.steps.find(step => step.id === 'attack_dummy');
    const action = {
        witch: '짧게 눌렀다 놓으면 가까운 적에게 생명의 구슬을 발사합니다. 길게 눌러 조준할 수도 있습니다. 구슬은 다단 타격 후 돌아오며 주인을 회복합니다. 버튼의 숫자는 사용 가능한 구슬 수입니다.',
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
