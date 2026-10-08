import { CLASS_SKILL_UI } from './ClassSkillUI.js';
import { normalizeClassId, CLASS_NAMES } from '../core/ClassProfiles.js';
/** Pure camp markup. All displayed progress comes from the actual player profile. */
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => Math.max(0, Number(value) || 0).toLocaleString('ko-KR');
const signed = value => `${Number(value) > 0 ? '+' : Number(value) < 0 ? '−' : ''}${number(Math.abs(Number(value) || 0))}`;

export default function renderCampPresentation({ profile: p, view = 'camp', message = '', summary, busy = false, failed = false, local = false, installed = true, art, regionName = '저장한 지역', regionArt = 'wind.webp', stats = {} }) {
    const disabled = busy || failed || !p ? 'disabled' : '';
    const button = (action, text, className = 'camp-secondary', blocked = disabled) => `<button class="${className}" data-camp="${action}" ${blocked}>${text}</button>`;
    const classId = normalizeClassId(p?.activeClassId);
    const artId = ({ wizard: 'mage', warrior: 'guardian', witch: 'witch', archer: 'archer' })[classId];
    const className = CLASS_NAMES[classId];
    const portrait = `<img src="${art(`idle-${artId}.webp`)}" alt="${className}">`;
    const identity = p ? `<div class="camp-profile">${portrait}<div><strong>${escape(p.name || '마법사')}</strong><p>${className} · Lv.${number(p.level || 1)} · 1인 원정</p></div></div>` : '';
    const status = `<p class="camp-status" role="status" aria-live="polite">${escape(message)}</p>`;
    const nav = `<nav class="camp-nav" aria-label="야영지 메뉴">${button('camp', '야영지', view === 'camp' ? 'active' : '', busy ? 'disabled' : '')}${button('character', '캐릭터', view === 'character' ? 'active' : '')}<button disabled title="상점 준비 중">상점<small>준비 중</small></button><button disabled title="클랜 준비 중">클랜<small>준비 중</small></button></nav>`;
    const background = view === 'character' ? `${artId}-key.webp` : view === 'prepare' ? regionArt : 'camp-background.webp';
    const scenery = `<div class="camp-scenery ${view === 'character' || view === 'prepare' ? 'camp-key-visual' : ''}" style="--camp-art:url('${art(background)}')"><img class="camp-backdrop" src="${art(background)}" alt=""></div>`;
    const layers = `<div class="camp-viewport" aria-hidden="true"><div class="camp-stage"><img class="camp-prop" src="${art('camp-table.webp')}" alt="">${['guardian', 'archer', 'mage', 'witch'].map(id => `<img class="camp-layer camp-layer-${id}" src="${art(`camp-${id}.webp`)}" alt="">`).join('')}</div></div>`;
    const header = `<header class="camp-header"><div><span class="camp-wordmark">YURIKA</span><p>${view === 'character' ? '캐릭터 관리' : view === 'prepare' ? '원정 준비' : view === 'result' ? '원정 기록' : '달숲 야영지'}</p></div><div class="camp-account"><span class="camp-save-label">${local ? '로컬 모험 · 이 브라우저에 저장' : '계정 모험'}${p ? ` · 마석 ${number(p.manastone)}` : ''}</span>${!local ? button('account', '계정', 'camp-quiet', busy ? 'disabled' : '') : ''}${!installed ? button('install', '설치 안내', 'camp-quiet', busy ? 'disabled' : '') : ''}${button('reload', '새로고침', 'camp-quiet', busy ? 'disabled' : '')}</div></header>`;
    const panel = (title, body, actions, className = '') => `<main class="camp-panel camp-sheet ${className}"><header class="camp-sheet-header"><span>${title}</span>${button('camp', '← 야영지', 'camp-back', busy ? 'disabled' : '')}</header><div class="camp-sheet-body">${body}</div><footer class="camp-sheet-actions">${status}${failed ? button('retry', '다시 불러오기', 'camp-secondary camp-retry', busy ? 'disabled' : '') : actions}</footer></main>`;
    let content = '';
    if (!p) {
        content = `<main class="camp-panel camp-welcome"><p class="camp-eyebrow">다시, 모험의 시간</p><h1>첫 번째 모험</h1>${status}${!busy && !failed ? `<label class="camp-name">모험가 이름<input id="camp-name" maxlength="16" minlength="2" placeholder="두 글자 이상" autocomplete="off"></label>${button('create', local ? '로컬 캐릭터 만들기' : '캐릭터 만들기', 'camp-primary', '')}` : ''}${failed ? button('retry', '다시 불러오기', 'camp-primary', '') : ''}</main>`;
    } else if (view === 'character') {
        content = panel('캐릭터 관리', `${identity}<div class="camp-experience"><span>경험치</span><strong>${number(p.exp)} <small>/ ${number(p.maxExp || 100)}</small></strong></div><div class="camp-progress" role="progressbar" aria-label="레벨 경험치" aria-valuenow="${Number(p.exp) || 0}" aria-valuemax="${Number(p.maxExp) || 100}"><i style="width:${Math.min(100, Math.max(0, (Number(p.exp) || 0) / (Number(p.maxExp) || 100) * 100))}%"></i></div><dl class="camp-stats"><div><dt>체력 능력</dt><dd>${number(p.vitality || 1)}</dd></div><div><dt>지능</dt><dd>${number(p.intelligence || 3)}</dd></div><div><dt>남은 포인트</dt><dd>${number(p.statPoints)}</dd></div>${stats.maxHp != null ? `<div><dt>최대 체력</dt><dd>${number(stats.maxHp)}</dd></div>` : ''}</dl>`, `<div class="camp-management" aria-label="캐릭터 정비">${button('inventory', '장비 · 가방')}${button('stats', '능력치')}${button('skills', '스킬')}</div>${button('depart', '원정 준비 →', 'camp-primary')}`, 'camp-character-sheet');
    } else if (view === 'prepare') {
        content = panel('원정 준비', `<p class="camp-eyebrow">이어서 떠나는 여정</p><h1>${escape(regionName)}</h1>${identity}<p class="camp-detail">저장된 지역에서 모험을 이어갑니다.<br>다른 지역은 필드에서 개방 조건에 따라 이동해요.</p>`, button('depart', '이 지역에서 이어하기 →', 'camp-primary'), 'camp-prepare-sheet');
    } else if (view === 'result' && summary) {
        const before = summary.before || {}, after = summary.after || {};
        content = panel('원정 기록', `<p class="camp-eyebrow">돌아온 모험가</p><h1>이번 원정의 기록</h1><p class="camp-growth">Lv.${number(before.level)} <span>→</span> Lv.${number(after.level)}<small>경험치 ${number(before.exp)} → ${number(after.exp)}</small></p><dl class="camp-stats"><div><dt>마석 변동</dt><dd>${signed((after.manastone || 0) - (before.manastone || 0))}</dd></div><div><dt>가방 사용</dt><dd>${number(after.bagSlots)}<small>칸</small></dd></div></dl>${renderDetails(summary)}<p class="camp-detail">저장된 획득·소비·성장 기록입니다.<br>보상은 이미 반영되어 추가 지급하지 않아요.</p>`, button('prepare', '다시 원정 준비 →', 'camp-primary'), 'camp-result');
    } else {
        content = `<div class="camp-title"><p>잠시 쉬어가는, 달숲</p><small>야영지 인물은 배경 연출입니다 · 전투는 선택한 캐릭터 1명</small></div>${message || failed ? `<aside class="camp-notice">${status}${failed ? button('retry', '다시 불러오기', 'camp-secondary', '') : ''}</aside>` : ''}<footer class="camp-dock">${button('character', `${portrait}<span><strong>${escape(p.name || '마법사')}</strong><small>Lv.${number(p.level || 1)} · 캐릭터 정비</small></span>`, 'camp-shortcut')}${button('prepare', '<span><strong>원정 출발</strong><small>' + escape(regionName) + '</small></span><span aria-hidden="true">→</span>', 'camp-primary')}${summary ? button('result', '최근 원정 기록', 'camp-result-link', busy ? 'disabled' : '') : ''}</footer>`;
    }
    return `${scenery}${['camp', 'result'].includes(view) ? layers : ''}${header}${content}${nav}`;
}

function renderDetails(summary) {
    const rows = [];
    const totals = summary.totals || {};
    if (totals.manastoneGained != null) rows.push(['획득 마석', '+' + number(totals.manastoneGained)]);
    if (totals.manastoneSpent != null) rows.push(['사용 마석', '−' + number(totals.manastoneSpent)]);
    if (totals.expGained != null) rows.push(['획득 경험치', '+' + number(totals.expGained)]);
    const skillNames = { ...Object.fromEntries(Object.values(CLASS_SKILL_UI).flat().map(skill => [skill.id, skill.name])), laser:'체인 라이트닝',missile:'매직 미사일',fireball:'파이어볼',shield:'앱솔루트 베리어'};
    const itemNames = {weapon:'무기',weapon_upgrade_stone:'무기 강화석',blessed_weapon_upgrade_stone:'축복받은 무기 강화석',option_reroll_stone:'옵션 변경석',boss_summon_scroll_king_slime:"대왕슬라임 보스 소환주문서",boss_summon_scroll_ruin_wobbuffet:"파도의 수호자 보스 소환주문서",boss_summon_scroll_thunder_pikachu:"뇌제 피카츄 보스 소환주문서",boss_summon_scroll_astral_sylveon:"성작의 님피아 보스 소환주문서",boss_summon_scroll_rift_sentinel:"균열의 감시자 보스 소환주문서"};
    const labels = {vitality:'체력 능력',intelligence:'지능',wisdom:'지혜',agility:'민첩',statPoints:'남은 능력치'};
    for (const kind of ['stats', 'skills', 'items']) {
        const before = summary.before?.[kind] || {}, after = summary.after?.[kind] || {};
        for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
            const delta = (after[key] || 0) - (before[key] || 0);
            if (!delta) continue;
            const label = kind === 'stats' ? labels[key] || key : kind === 'skills' ? skillNames[key] || `스킬 성장` : itemNames[key] || `아이템`;
            rows.push([label, kind === 'items' ? signed(delta) : `${number(before[key])} → ${number(after[key])}`]);
        }
    }
    if (Array.isArray(summary.details)) for (const row of summary.details) rows.push(typeof row === 'string' ? [row, ''] : [row.label, row.value]);
    return rows.length ? `<ul class="camp-result-details">${rows.map(([label, value]) => `<li>${escape(label)}<strong>${escape(value)}</strong></li>`).join('')}</ul>` : '';
}
