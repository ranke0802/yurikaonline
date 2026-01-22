import { InputHandler } from './modules/InputHandler.js';
import { Camera } from './modules/Camera.js';
import { Map } from './modules/Map.js';
import Player from './entities/Player.js';
import Monster from './entities/Monster.js';
import Drop from './entities/Drop.js';
import { Projectile } from './entities/Projectile.js';
import { UIManager } from './ui/UIManager.js';

class Game {
    constructor() {
        this.viewport = document.getElementById('game-viewport');
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.playerHasAttacked = false;

        this.lastTime = 0;
        this.isLoading = true;
        this.loadingProgress = 0;
        this.zoom = 1.0; // Default zoom

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.input = new InputHandler();
        this.ui = new UIManager(this);
        this.map = new Map(this.ctx, 2000, 2000);

        this.drops = [];
        this.projectiles = [];
        this.floatingTexts = [];
        this.localPlayer = new Player(1000, 1000);

        // Manually trigger resize once to set initial zoom before camera init
        this.resize();

        // Initialize camera AFTER player and resize to ensure proper centering with zoom
        this.camera = new Camera(this.width / this.zoom, this.height / this.zoom, 2000, 2000);
        this.camera.update(this.localPlayer.x, this.localPlayer.y);

        this.input.onAction = (action) => {
            this.handleAction(action);
        };

        this.initMonstersAndHistory();
        this.portraitInitialized = false;
        this.init();
    }

    handleAction(action) {
        const player = this.localPlayer;
        if (this.ui.isPaused && action !== 'fullscreen') return;

        switch (action) {
            case 'shift-b': this.ui.togglePopup('inventory-popup'); return;
            case 'shift-s': this.ui.togglePopup('skill-popup'); return;
            case 'shift-i': this.ui.togglePopup('status-popup'); return;
            case 'fullscreen': this.ui.toggleFullscreen(); return;
        }

        if (player.skillCooldowns[action] > 0) return;

        switch (action) {
            case 'j':
                this.performLaserAttack();
                player.skillCooldowns['j'] = 0.8 / player.attackSpeed;
                player.skillMaxCooldowns['j'] = player.skillCooldowns['j'];
                player.attackCooldown = player.skillCooldowns['j'];
                break;
            case 'h':
                const mCount = player.skillLevels.missile || 1;
                const mCost = 4 + (mCount - 1) * 3;
                if (player.useMana(mCost)) {
                    this.ui.logSystemMessage(`SKILL: 매직 미사일 (Lv.${mCount})`);
                    this.castMagicMissile();
                    player.skillCooldowns['h'] = 1.0;
                    player.skillMaxCooldowns['h'] = 1.0;
                    player.attackCooldown = 0.5;
                }
                break;
            case 'u':
                const fLv = player.skillLevels.fireball || 1;
                const fCost = 8 + (fLv - 1) * 3;
                if (player.useMana(fCost)) {
                    this.ui.logSystemMessage(`SKILL: 파이어볼 (Lv.${fLv})`);
                    this.castFireball();
                    player.skillCooldowns['u'] = 5.0;
                    player.skillMaxCooldowns['u'] = 5.0;
                    player.attackCooldown = 0.8;
                }
                break;
            case 'k':
                const sCost = 30; // Fixed cost
                if (player.useMana(sCost)) {
                    const dur = 9999;
                    player.triggerAction(`${player.name} : 앱솔루트 베리어 !!`);
                    player.shieldTimer = dur;
                    player.isShieldActive = true;
                    this.ui.logSystemMessage(`SKILL: 앱솔루트 베리어 - 다음 1회 피격을 무효화합니다.`);
                    player.skillCooldowns['k'] = 15.0;
                    player.skillMaxCooldowns['k'] = 15.0;
                    player.attackCooldown = 0.5;
                }
                break;
        }
    }

    initMonstersAndHistory() {
        this.monsters = [
            new Monster(1200, 1100, '초보 슬라임'),
            new Monster(800, 900, '슬라임')
        ];

        // 초기 대왕 슬라임 설정 제거 (퀘스트 진행도에 따라 스폰되도록 수정)

        this.updateHistory = [
            {
                version: 'v1.80', date: '2026-01-23', title: 'Geometric Stabilization',
                logs: [
                    '육망성 완전 직선화: 번개 효과를 제거하고 완벽한 직선으로 렌더링하여 모바일에서의 일그러짐 현상 해결',
                    '이펙트 정리: 캐릭터 주변의 불필요한 잔여 이펙트를 제거하고 깔끔한 오라만 유지'
                ]
            },
            {
                version: 'v1.79', date: '2026-01-23', title: 'Visual Fixes & Aura Polish',
                logs: [
                    '육망성 렌더링 수정: 별 모양을 그리는 선이 보이지 않던 문제를 해결하여 뚜렷한 별(★) 복구',
                    '캐릭터 오라 개선: 등 뒤의 지저분한 이펙트를 제거하고, 몬스터와 동일한 깔끔한 전기 스파크 이펙트로 교체'
                ]
            },
            {
                version: 'v1.78', date: '2026-01-23', title: 'Magic Circle Restoration',
                logs: [
                    '마법진 원상복구: 사용자 요청에 따라 동심원 테두리와 육망성을 모두 표시하는 기존 스타일로 복구',
                    '속도 유지: v1.76의 감속된 회전 속도는 유지하여 묵직하고 신비로운 분위기 연출',
                    '룬 밀도 증가: 회전하는 룬 문자의 개수를 8개에서 12개로 늘려 더욱 신비롭고 꽉 찬 느낌 제공'
                ]
            },
            {
                version: 'v1.77', date: '2026-01-23', title: 'Magic Circle Geometric Tweak',
                logs: [
                    '육망성(Hexagram) 선 복구: 육망성의 별 모양을 다시 선명하게 렌더링',
                    '외곽 원(Outer Circles) 제거: 육각형 분위기를 내는 외곽의 연결 선들을 제거하여 별 모양과 룬만 깔끔하게 남김'
                ]
            },
            {
                version: 'v1.76', date: '2026-01-23', title: 'Magic Circle Pace Adjustment',
                logs: [
                    '마법진 회전 속도 최적화: 기존 대비 약 30% 수준으로 감속하여 차분하고 묵직한 마법 연출 (너무 빠른 회전 방지)',
                    '육망성 스타일 변경: 내부의 연결 선들을 제거하고 6개의 빛나는 꼭짓점(Vertex)만 남겨 시각적 단순미 강조'
                ]
            },
            {
                version: 'v1.75', date: '2026-01-23', title: 'Magic Circle Perspective Fix',
                logs: [
                    '마법진 회전 왜곡(Wobble) 현상 해결: 캔버스 스케일링 대신 수학적 좌표 회전 방식을 적용하여 원근감(Perspective) 완벽 보정',
                    '고품질 라인 렌더링: 회전 시 선 두께가 변하지 않고 일정하게 유지되도록 드로잉 로직 전면 재작성'
                ]
            },
            {
                version: 'v1.74', date: '2026-01-23', title: 'Dynamic Magic Circle Rotation',
                logs: [
                    '마법진 회전 속도 대폭 상향: 육망성(시계 방향)과 룬 문자(반시계 방향)의 회전 속도를 3배 이상 높여 역동성 강화',
                    '시각적 분리감 극대화: 서로 반대로 빠르게 맞물려 돌아가는 애니메이션으로 마법 주문의 복잡도와 위력 표현'
                ]
            },
            {
                version: 'v1.73', date: '2026-01-23', title: 'Ancient Rune Magic Circle',
                logs: [
                    '고대 룬 문자 링 추가: 육망성 마법진 테두리에 회전하는 기하학적 룬 심볼을 추가하여 신비감 강화',
                    '역방향 회전 애니메이션: 룬 문자들이 마법진과 반대 방향으로 서서히 회전하며 입체적인 마법 연출 제공'
                ]
            },
            {
                version: 'v1.72', date: '2026-01-23', title: 'Emergency Hotfix: Attack Freeze & Optimization',
                logs: [
                    '공격 멈춤 현상 수정: 일반 공격 시 발생하던 타자 오류(this.ctx)를 수정하여 게임이 멈추는 치명적인 버그 해결',
                    '마법진 렌더링 최적화: 번개 마법진의 그리기 로직을 최적화하여 저사양 환경에서도 끊김 없이 부드럽게 작동하도록 개선'
                ]
            },
            {
                version: 'v1.71', date: '2026-01-23', title: 'Lightning Magic Circle & Attack Sparks',
                logs: [
                    '번개 마법진 도입: 바닥의 육망성 및 원형 마법진 선들을 매끄러운 직선이 아닌 지그재그 번개 줄기 형태로 변경',
                    '공격 스파크 효과: 일반 공격(체인 라이트닝) 중 캐릭터 주변에 무작위로 고압 스파크(작은 번개)가 튀는 효과 추가',
                    '시각적 완성도 강화: 마법진의 번개 선들이 0.1초 간격으로 모양이 변하며 실제 전기가 흐르는 듯한 생동감 부여'
                ]
            },
            {
                version: 'v1.70', date: '2026-01-23', title: 'Magic Circle Persistence & Positioning',
                logs: [
                    '마법진 위치 최적화: 캐릭터 등 뒤가 아닌 캐릭터 발바닥(지면) 위치로 정확히 이동',
                    '노출 로직 개선: 공격 애니메이션 중 깜빡이지 않고 기 모으기부터 공격 종료까지 마법진이 안정적으로 유지되도록 수정'
                ]
            },
            {
                version: 'v1.69', date: '2026-01-23', title: 'Emergency Hotfix: Loading Stagnation',
                logs: [
                    '로딩 멈춤 현상 수정: 이전 버전 배포 중 발생한 캐릭터 파일(Player.js)의 구문 오류를 수정하여 무한 로딩 발생 문제 해결'
                ]
            },
            {
                version: 'v1.68', date: '2026-01-23', title: 'Magic Circle Perspective Refinement',
                logs: [
                    '마법진 원근감 적용: 캐릭터 발밑 지면에 자연스럽게 깔리도록 3D 원근 타원 형태로 개선',
                    '육망성 방향 조정: 삼각형의 꼭짓점이 12시와 6시 방향을 정확히 향하도록 초기 각도 수정'
                ]
            },
            {
                version: 'v1.67', date: '2026-01-23', title: 'Premium Visual Overhaul',
                logs: [
                    '캐릭터 그림자 추가: 발밑에 부드러운 그림자를 추가하여 월드 내 안정감 보강',
                    '공격용 마법진(Magic Circle) 도입: 일반 공격 시 발밑에 정교하게 회전하는 육망성 마법진 소환',
                    '시각적 피드백 강화: 마법진 내부에 고압 전류 느낌의 네온 글로우 및 펄스 효과 적용'
                ]
            },
            {
                version: 'v1.66', date: '2026-01-23', title: 'High-Voltage Multi-Strand Lightning',
                logs: [
                    '멀티 스트랜드 번개 도입: 메인 번개 줄기 뒤로 더 얇고 역동적인 보조 번개 줄기를 추가하여 고압 전류 느낌 강화',
                    '체인 번개 안정성 개선: 연결된 모든 번개 마디에 동일한 0.1초 플리커 속도 적용 및 이동 시 지터 현상 해결',
                    '공격 중 오라 상시 발동: 기 모으기뿐만 아니라 일반 공격 중에도 캐릭터 주변에 강력한 번개 오라가 출력되도록 수정'
                ]
            },
            {
                version: 'v1.65', date: '2026-01-23', title: 'Lightning Flicker Refinement',
                logs: [
                    '번개 효과(Lightning) 치지직거리는 속도 최적화: 매 프레임 변하던 모양을 0.1초 간격으로 유지하여 묵직하고 강렬한 느낌을 주도록 개선',
                    '공격(체인 라이트닝) 및 캐릭터/몬스터 오라 전체에 일관된 애니메이션 속도 적용'
                ]
            },
            {
                version: 'v1.64', date: '2026-01-22', title: 'Aura & Magic Animation Fix',
                logs: [
                    '번개 효과(Aura) 시스템 개편: 밋밋한 스파크를 지그재그 모양의 강렬한 번개로 교체 (초사이언 2 스타일 적용)',
                    '마법 사용 시 공격 모션 미작동 버그 수정 (이제 모든 스킬 사용 시 정상적으로 캐릭터 애니메이션이 동작합니다)',
                    '번개 효과 이중 렌더링 도입: 흰색 코어와 하늘색 글로우를 통한 고에너지 연출'
                ]
            },
            {
                version: 'v1.63', date: '2026-01-22', title: 'Movement & UI Refinement',
                logs: [
                    '달리기 전환 속도 상향: 1.5초 → 0.5초',
                    '달리기 흙먼지 효과 범위 대폭 상향 (3배)',
                    '쿨타임 표시 방식 개선: 회전식(Conic) 게이지 도입 및 "통통 튀는" 현상 수정'
                ]
            },
            {
                version: 'v1.62', date: '2026-01-22', title: 'Visual FX & UI Polish',
                logs: [
                    '일반 공격/피격 시 스파크 효과 강화 (더 굵고 진하게 개선)',
                    '달리기 전환 준비 시간 조정: 1.0초 → 1.5초',
                    '달리기 흙먼지 효과 범위 1.5배 확대',
                    '액션 버튼 원형(Circular) 복구',
                    '미니맵 테두리 프레임 레이어 수정 (맵 위로 표시)',
                    '모바일 보상 받기 버튼 텍스트 잘림 현상 수정'
                ]
            },
            {
                version: 'v1.61', date: '2026-01-22', title: 'Spawn & Control Fix',
                logs: [
                    '몬스터 스폰 로직 개선: 플레이어와 최소 400거리 이상 떨어진 곳에 생성하도록 수정 (낑김 현상 방지)',
                    '모바일 터치 이동 기능 완전 차단: 조이스틱 조작 중 의도치 않은 이동 현상 해결',
                    'PC 클릭 이동(Click-to-Move) 드리프트 현상 수정 및 키보드 조작 시 자동 취소',
                    '단축키 레이아웃 JHUK로 복구 (기존 K 유지)'
                ]
            },
            {
                version: 'v1.60', date: '2026-01-22', title: 'High-DPI & UI Refinement',
                logs: [
                    '모바일 고해상도(Retina) 최적화: Device Pixel Ratio 반영으로 흐릿한 화질 개선',
                    '이름 외각선(Outline) 추가: 검은색 테두리 적용으로 시인성 강화',
                    '스킬창 아이콘 프레임 개선: 인벤토리와 동일한 라운드 사각형으로 변경',
                    'JHUI 단축키 체계 도입: 스킬 배치를 J, H, U, I 순으로 변경'
                ]
            },
            {
                version: 'v1.59', date: '2026-01-22', title: 'PC/Mobile Optimization & Click-to-Move',
                logs: [
                    '캐릭터/몬스터 이름 위치 15px 하단 조정 (시각적 밀착감 개선)',
                    'PC 버전: 팝업창 우측 상단 "X" 닫기 버튼 원복',
                    '모바일 버전: 하단 닫기 버튼 레이아웃 오류 수정',
                    'PC/Touch: 마우스 클릭 또는 화면 터치 지점으로 자동 이동 기능 도입 (Click-to-Move)',
                    '이동 키 입력 시 클릭 이동 자동 취소 로직 적용'
                ]
            },
            {
                version: 'v1.58', date: '2026-01-22', title: 'UX Improvement & UI Polish',
                logs: [
                    '캐릭터 및 몬스터 이름 위치 상단 복구 (HP/MP 바는 하단 유지)',
                    '인벤토리/내정보/스킬 팝업창 하단에 "닫기" 버튼 추가 (UX 개선)',
                    '팝업창 헤더의 ✕ 버튼 제거',
                    '팝업창 하단 버튼 프리미엄 스타일링 적용'
                ]
            },
            {
                version: 'v1.57', date: '2026-01-22', title: 'Collision System & UI Polish',
                logs: [
                    '개체 간 충돌 판정 시스템 도입 (플레이어와 몬스터가 겹치지 않음)',
                    '캐릭터 및 몬스터 HP/MP 바 위치 하단 이동 (플로팅 메시지 간섭 해제)',
                    '맵 이탈 방지 로직 강화 (0~2000 범위 강제 제한)',
                    '몬스터 상태 이상 아이콘 위치 보정'
                ]
            },
            {
                version: 'v1.56', date: '2026-01-22', title: 'Minimap Transparency & Mobile QoL',
                logs: [
                    '모바일 버전 미니맵 투명도 대폭 개선 (가시성 확보)',
                    '미니맵 배경 블러 효과 약화 및 투명도 조정 (몬스터 시인성 개선)',
                    '미니맵 드로잉 로직 최적화 (배경 지우기 방식 도입)'
                ]
            },
            {
                version: 'v1.55', date: '2026-01-22', title: 'Skill Rework & UI Polish',
                logs: [
                    '신규 스킬 리워크: 매직 실드 -> 앱솔루트 베리어 (1회 피격 무효화)',
                    '앱솔루트 베리어 밸런스: 마나 소모 30, 레벨업 불가, 쿨타임 15초',
                    '몬스터 상태이상 아이콘(화상, 감전) 위치 개선 (좌측 하단 정렬)',
                    '스킬 UI 표기 업데이트'
                ]
            },
            {
                version: 'v1.54', date: '2026-01-22', title: 'Performance Optimization',
                logs: [
                    '몬스터 스폰 랙 해결 (이미지 캐싱 시스템 적용)',
                    '아이템 드랍 및 시스템 메시지 랙 현상 완화 (채팅 로그 최적화)',
                    '스킬 사용 시 인벤토리 골드 연동 오류 수정',
                    '전반적인 클라이언트 성능 향상'
                ]
            },
            {
                version: 'v1.41', date: '2026-01-22', title: 'UI/UX Overhaul & Stability',
                logs: [
                    '동적 UI 시스템 도입: 전체화면 모드 시 하단 메뉴 위치 자동 상향 조정',
                    '모바일 초기 위치 수정: 게임 시작 시 캐릭터가 정중앙에 위치하도록 개선',
                    '피격 피드백 일관성 강화: 플레이어 데미지를 몬스터와 동일한 플로팅 텍스트로 변경',
                    '전체화면 전환 시스템 안정화 및 클래스 기반 스타일 제어'
                ]
            },
            {
                version: 'v1.40', date: '2026-01-21', title: 'Name System & UI Improvements',
                logs: [
                    '플레이어 이름 편집 및 저장 시스템 추가 (localStorage 연동)',
                    '플레이어 이름 표시 위치 조정 (MP 바 아래)',
                    '모바일 UI 아이콘 전용 모드 도입 (프레임 제거 및 깔끔한 디자인)',
                    '액션 메시지 말풍선 UI 적용',
                    '스킬 버튼 터치 시 조이스틱 오작동 방지'
                ]
            },
            {
                version: 'v1.39', date: '2026-01-21', title: 'Dynamic Mobile Joystick',
                logs: [
                    '화면 왼쪽 어디든 터치 시 조이스틱이 나타나는 다이나믹 조이스틱 도입',
                    '모바일 조작 편의성 대폭 개선'
                ]
            },
            {
                version: 'v1.28', date: '2026-01-21', title: 'Mobile UI/UX Optimization',
                logs: [
                    '모바일 세로모드 캐릭터 초기 위치 중앙 배치 수정',
                    '세로모드 하단 메뉴바 위치 조정 (미니맵/조작 버튼과 겹침 해결)',
                    '전체화면 기능 v1.10 이전 방식으로 복원 (모바일/PC 안정화)',
                    '가로모드 채팅창 중앙 하단 이동 및 3줄 출력 최적화',
                    '가로모드 UI 버튼 한 줄 배치 (미니맵 왼쪽, 겹침 방지)',
                    '가로모드 퀘스트창 높이 확대'
                ]
            },
            {
                version: 'v1.27', date: '2026-01-21', title: 'Quest & Monster Logic Tuning',
                logs: [
                    '대왕 슬라임 스폰 조건 추가 (슬라임 10마리 처치 후 스폰)',
                    '대왕 슬라임 보스 퀘스트 노출 시점 조정 (첫 퀘스트 완료 후 노출)',
                    '대왕 슬라임 처치 경험치 대폭 상향 (20 -> 150)',
                    '모바일 버전 전체화면 작동 오류 해결',
                    '전반적인 퀘스트 진행 흐름 자연스럽게 개선'
                ]
            },
            {
                version: 'v1.26', date: '2026-01-21', title: 'Mobile UI Final Tuning',
                logs: [
                    '세로 모드 하단 중앙 메뉴바 도입 (가방, 스킬, 정보)',
                    '가로 모드 채팅창 위치(중앙 하단) 및 좌표 위치 원복',
                    '가로 모드 메뉴 버튼들을 미니맵 좌측 상단으로 분리 배치',
                    '세로 모드 전체화면 버튼 위치 최적화 (미니맵 아래)',
                    '전반적인 모바일 UI 간섭 해결 및 조작성 정밀 개선'
                ]
            },
            {
                version: 'v1.25', date: '2026-01-21', title: 'Advanced Mobile Layout',
                logs: [
                    '가로 모드 채팅창 하단 중앙 이동 (3줄 노출 및 너비 확장)',
                    '가로 모드 퀘스트 창 위치 조정 및 스크롤 기능 추가',
                    '가로 모드 미니맵 내부 메뉴 버튼 상단 배치',
                    '세로 모드 조이스틱/스킬 버튼 크기 최적화 및 간격 조정',
                    '전반적인 모바일 레이아웃 시인성 및 조작성 개선'
                ]
            },
            {
                version: 'v1.24', date: '2026-01-21', title: 'UX & Layout Refinement',
                logs: [
                    'PC 버전 화면 배율 원복 (1.0) 및 모바일 줌 기능(0.7) 분리 적용',
                    '모바일 채팅창 너비 축소 (퀘스트창과 통일)',
                    '모바일 세로 모드 UI 스케일 하향 (너무 크게 보이던 현상 해결)',
                    '가로 모드 미니맵 하단 메뉴 버튼 제거 (시야 방해 요소 제거)',
                    '로딩 멈춤 현상 긴급 패치 및 안정화'
                ]
            },
            {
                version: 'v1.23', date: '2026-01-21', title: 'Mobile UX & Global Scaling',
                logs: [
                    '전역 화면 배율 조정 (70% 수준으로 줌 아웃하여 더 넓은 시야 확보)',
                    '모바일 가로 모드 레이아웃 최적화 (버튼 간격 및 가시성 개선)',
                    '모바일 UI 투명도 적용 (몬스터 시인성 확보를 위한 반투명화)',
                    '미니맵 디자인 및 투명도 개선',
                    '가로 모드에서 퀘스트/채팅 UI 노출 및 레이크아웃 조정'
                ]
            },
            {
                version: 'v1.22', date: '2026-01-21', title: 'Quest UI/UX Premium Revamp',
                logs: [
                    '퀘스트창 및 채팅창 디자인 통일화 (헤더 색상 및 창 스타일)',
                    '퀘스트 텍스트 개행 문제 해결 (너비 확보 및 word-break 적용)',
                    '모바일 버전 UI 불투명화 (배경 가독성 개선)',
                    '좌측 UI 레이아웃 여유 공간 확보 (HP/MP 바 간섭 최소화)',
                    '전체적인 UI 스케일 및 배율 재조정'
                ]
            },
            {
                version: 'v1.21', date: '2026-01-21', title: 'UI/UX Premium Revamp & Stability',
                logs: [
                    '퀘스트 UI 전면 개편 (유리 질감 디자인 및 아이콘 적용)',
                    '퀘스트 목표 표기 방식 통일 (숫자 형태 0/10, 0/1)',
                    '내 정보 스탯 변화치 녹색 강조 및 회복력 스탯 분리 표기',
                    '전체화면 안정화 (PC 호환성 개선 및 모바일 중복 호출 방지)',
                    '업데이트 내역 스티키 헤더 및 기타 UI 마이너 버그 수정'
                ]
            },
            {
                version: 'v1.20', date: '2026-01-21', title: 'New Stat System & Regeneration',
                logs: [
                    '신규 스탯 방어력(DEF), 체력/마나 회복력 추가',
                    '체력(VIT) 1당 HP +10, 방어력 +1, HP회복력 +1 적용',
                    '지력(INT) 1당 공격력 +1',
                    '지혜(WIS) 1당 MP +10, MP회복력 +1, 2당 공격력 +1 적용',
                    '대기 회복 로직 변경: 2초 대기 후 매초 회복력만큼 HP/MP 회복',
                    '방어력 시스템 적용: 데미지 계산 시 방어력만큼 피해 감소'
                ]
            },
            {
                version: 'v1.19', date: '2026-01-21', title: 'Stat & Attack Speed Balance',
                logs: ['기본 공격(레이저) 쿨타임 0.8초로 상향', '순발력(AGI) 스탯 효율 상향 (이동속도 5%, 공격속도 0.1, 치명타 1%)']
            },
            {
                version: 'v1.18', date: '2026-01-21', title: 'Performance & UX Update',
                logs: ['업데이트 노트 아이콘 클릭 시 README.md 내용 표시 기능 추가', '내부 자원 로딩 효율 최적화']
            },
            {
                version: 'v1.17', date: '2026-01-21', title: 'Balance & Optimization',
                logs: ['기본 공격(레이저) 마나 회복량 상향 (레벨당 1씩 정비례 증가)', '매직 미사일 데미지 상향 (80% -> 90%) 및 마나 소모량 공식 변경', '화면 터치/클릭 시 시각 효과 제거', '스킬 툴팁 설명 최신화']
            },
            {
                version: 'v1.16', date: '2026-01-21', title: 'Skill Resource Scaling',
                logs: ['스킬 레벨 상승에 따른 마나 소모량 가변 로직 적용', '파이어볼 마나 소모량: 8 + (Lv-1)*3', '매직 실드 마나 소모량: 20 + (Lv-1)*5', '스킬 툴팁 수치 동기화']
            },
            {
                version: 'v1.15', date: '2026-01-21', title: 'Refined Skill Specs',
                logs: ['일반 공격(레이저) 레벨업 시 데미지 증가 제거 (마나 회복 위주)', '매직 실드 툴팁 설명 가독성 개선 (피해 감소 효율 표기)', '스킬 설명 및 실제 로직 싱크로율 최적화']
            },
            {
                version: 'v1.14', date: '2026-01-21', title: 'Skill Damage Fix',
                logs: ['파이어볼 기본 데미지 상향 (100% -> 130%)', '스킬 툴팁 설명 및 수치 계산 오류 수정']
            },
            {
                version: 'v1.13', date: '2026-01-21', title: 'Balance & Description Fix',
                logs: ['순발력(AGI) 스텟 효율 조정 (공격속도/이동속도/치명타 증가량 절반 하향)', '매직 실드 기본 피해 감소율 조정 (60% -> 40%)', '스킬 상세 설명 문구 최신화 및 오류 수정']
            },
            {
                version: 'v1.12', date: '2026-01-21', title: 'Dynamic Skill Info',
                logs: ['스킬 툴팁에 현재 레벨 기준 상세 수치 표시 기능 추가', '데미지, 소모량, 범위 등 실시간 스텟 반영']
            },
            {
                version: 'v1.11', date: '2026-01-21', title: 'Cache Busting & Stability',
                logs: ['자동 캐시 방지 시스템 도입 (새 버전 업데이트 시 자동 반영)', '이미지 및 스크립트 로딩 최적화', '전체적인 게임 버전 v1.11 업데이트']
            },
            {
                version: 'v1.10', date: '2026-01-21', title: 'System Message & UI Restoration',
                logs: ['경험치, 골드, 체력 회복 시 시스템 메시지 출력 복구', '퀘스트 보상 수령 시 전용 안내 모달 적용', '전체적인 UI 애니메이션 및 가독성 개선']
            },
            {
                version: 'v1.09', date: '2026-01-21', title: 'Hotfix',
                logs: ['좌우 방향 레이저 공격 발사가 대각선으로 휘어지던 버그 수정']
            },
            {
                version: 'v1.08', date: '2026-01-21', title: 'Balance Update',
                logs: ['슬라임 처치 퀘스트 보상 조정 (스텟 10개 -> 2개)', '중복 퀘스트 보상 지급 버그 수정']
            },
            {
                version: 'v1.07', date: '2026-01-21', title: 'Continuous Fire & UX',
                logs: ['공격/스킬 버튼 홀드 시 연속 발동 기능', '이동/조이스틱 사용 시 팝업 자동 닫기', '공격 방향 표시(빨강) 가독성 개선']
            },
            {
                version: '1.06', date: '2026-01-21', title: 'QoL & AI Fix',
                logs: ['공격 방향 표시(빨간색) 가독성 개선', '모바일 UI 반투명화(0.7)', '전투 중인 몬스터 합산하여 선제공격 제한']
            },
            {
                version: 'v1.05', date: '2026-01-21', title: 'Monster AI Revamp',
                logs: ['레벨별 선제공격 로직 적용 (Lv.1~3+)', '선제공격 인식 시 말풍선(!) 출력']
            }
        ];
    }

    init() {
        requestAnimationFrame((time) => this.loop(time));
    }

    addDamageText(x, y, amount, color = '#ff4757', isCrit = false, label = null) {
        this.floatingTexts.push({ x, y, text: amount, color, timer: 1.5, currentY: y, isCrit: isCrit, label: label });
    }

    resize() {
        this.width = this.viewport.clientWidth;
        this.height = this.viewport.clientHeight;

        // Apply zoom for wider view on Mobile only (requested ~70% size for mobile)
        // PC (width > 900) follows original 1.0 zoom
        const isMobile = window.innerWidth <= 900;
        this.zoom = isMobile ? 0.7 : 1.0;

        const ratio = window.devicePixelRatio || 1;
        this.canvas.width = this.width * ratio;
        this.canvas.height = this.height * ratio;
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';

        if (this.camera) {
            // Camera viewport must be larger to show more of the map relative to the canvas
            this.camera.resize(this.width / this.zoom, this.height / this.zoom);
        }
    }

    performLaserAttack(dt = 0) {
        const player = this.localPlayer;
        if (!player || player.isDead) return;

        // 1. Anti-Spam: Check cooldown before starting
        if (!player.isChanneling && player.skillCooldowns['j'] > 0) return;

        this.playerHasAttacked = true;
        const fixedDt = (typeof dt === 'number' && !isNaN(dt)) ? dt : 0.016;

        if (!player.isChanneling) {
            player.isChanneling = true;
            player.chargeTime = 0;
            player.lightningTickTimer = 0;
        }

        player.chargeTime += fixedDt;
        player.lightningTickTimer -= fixedDt;

        const baseTickInterval = 0.7;
        const tickInterval = baseTickInterval / player.attackSpeed;
        const isTick = player.lightningTickTimer <= 0;

        if (isTick) {
            player.lightningTickTimer = tickInterval;
            player.triggerAction('ATTACK');
        }

        const laserLv = player.skillLevels.laser || 1;
        // Formula: Base 50% ATK, Increment (10% + (Lv-1)*5%) per 0.3s charge
        const startRatio = 0.5;
        const tierIncrement = 0.10 + (laserLv - 1) * 0.05;
        const chargeSteps = Math.floor(player.chargeTime / 0.3);
        const finalDmgRatio = Math.min(1.5, startRatio + (chargeSteps * tierIncrement));

        // 2. Visual Chain Logic: ALWAYS CALCULATE EVERY FRAME
        // This ensures the lightning stays connected while moving even between ticks
        const maxChains = 1 + laserLv;
        const chainRange = 350;
        let currentSource = { x: player.x, y: player.y };
        const affectedMonsters = [];
        const chains = [];

        let availableMonsters = this.monsters.filter(m => !m.isDead);

        for (let i = 0; i < maxChains; i++) {
            let nextTarget = null;
            let minDist = chainRange;

            availableMonsters.forEach(m => {
                const dist = Math.sqrt((currentSource.x - m.x) ** 2 + (currentSource.y - m.y) ** 2);
                if (dist < minDist && !affectedMonsters.includes(m)) {
                    minDist = dist;
                    nextTarget = m;
                }
            });

            if (nextTarget) {
                chains.push({ x1: currentSource.x, y1: currentSource.y, x2: nextTarget.x, y2: nextTarget.y });
                affectedMonsters.push(nextTarget);

                // 3. Application Logic ONLY on Tick
                if (isTick) {
                    let dmg = player.attackPower * finalDmgRatio;
                    let isCrit = Math.random() < player.critRate;
                    if (isCrit) dmg *= 2;
                    // Apply precision damage (non-integer) to ensure formula correctness
                    nextTarget.takeDamage(dmg, true, isCrit);

                    // 80% Slow as requested
                    if (nextTarget.applyElectrocuted) {
                        nextTarget.applyElectrocuted(3.0, 0.8);
                    }
                    player.recoverMana(1, true);
                }
                currentSource = { x: nextTarget.x, y: nextTarget.y };
            } else {
                break;
            }
        }

        // 4. Update Visual Effect with high refresh
        if (chains.length > 0) {
            player.lightningEffect = { chains: chains, timer: 0.1 };
        } else {
            // Fizzle logic if no targets
            const vxList = [0, 0.707, 1, 0.707, 0, -0.707, -1, -0.707];
            const vyList = [-1, -0.707, 0, 0.707, 1, 0.707, 0, -0.707];
            let dir = (player.facingDir >= 0 && player.facingDir <= 7) ? player.facingDir : 4;
            const px = isNaN(player.x) ? 1000 : player.x;
            const py = isNaN(player.y) ? 1000 : player.y;
            player.lightningEffect = { chains: [{ x1: px, y1: py, x2: px + vxList[dir] * 80, y2: py + vyList[dir] * 80 }], timer: 0.05 };
        }
    }

    castMagicMissile() {
        const player = this.localPlayer;
        let nearest = null, minDist = 500;
        this.monsters.forEach(m => {
            if (m.isDead) return;
            const dist = Math.sqrt((player.x - m.x) ** 2 + (player.y - m.y) ** 2);
            if (dist < minDist) { minDist = dist; nearest = m; }
        });

        if (nearest) {
            player.triggerAction(`${player.name} : 매직 미사일 !!`);
            this.playerHasAttacked = true;
            const count = player.skillLevels.missile || 1;
            for (let i = 0; i < count; i++) {
                const offset = (i - (count - 1) / 2) * 20;
                let dmg = player.attackPower * 0.9;
                let isCrit = Math.random() < player.critRate;
                if (isCrit) dmg *= 2;
                this.projectiles.push(new Projectile(player.x + offset, player.y + offset, nearest, 'missile', {
                    speed: 500 + (Math.random() * 50), damage: dmg, isCrit: isCrit
                }));
            }
        } else {
            this.ui.logSystemMessage('대상을 찾을 수 없습니다.');
        }
    }

    castFireball() {
        const player = this.localPlayer;
        player.triggerAction(`${player.name} : 파이어볼 !!`);
        this.playerHasAttacked = true;
        let vx = 0, vy = 0, speed = 400; const diag = 0.707;
        const dirs = [[0, -1], [diag, -diag], [1, 0], [diag, diag], [0, 1], [-diag, diag], [-1, 0], [-diag, -diag]];
        [vx, vy] = dirs[player.facingDir].map(v => v * speed);

        const fv = player.skillLevels.fireball || 1;
        const dmg = player.attackPower * (1.3 + (fv - 1) * 0.3);
        const rad = 80 + (fv - 1) * 40; const lt = 1.5;
        this.projectiles.push(new Projectile(player.x, player.y, null, 'fireball', {
            vx, vy, speed, damage: dmg, radius: rad, lifeTime: lt,
            targetX: player.x + (vx / speed) * (speed * lt),
            targetY: player.y + (vy / speed) * (speed * lt),
            burnDuration: 5.0 + (fv - 1), critRate: player.critRate
        }));
    }

    spawnLoot(monster) {
        this.ui.logSystemMessage(`${monster.name}을 처치했습니다!`);

        // 보스 몬스터 보상 차별화
        const xpAmount = monster.isBoss ? 150 : 20;
        const goldAmount = monster.isBoss ? 300 : 50;

        this.drops.push(new Drop(monster.x, monster.y, 'gold', goldAmount));
        this.drops.push(new Drop(monster.x + 20, monster.y - 20, 'xp', xpAmount));
        if (Math.random() > 0.5 || monster.isBoss) {
            this.drops.push(new Drop(monster.x - 20, monster.y + 10, 'hp', 30));
        }
    }

    update(dt) {
        if (this.ui.isPaused) return;

        // Continuous Fire Logic
        const actions = ['j', 'h', 'u', 'k'];

        // Handle J (Chain Lightning) specially for channeling
        if (this.input.keys['j']) {
            this.performLaserAttack(dt);
        } else {
            if (this.localPlayer.isChanneling) {
                this.localPlayer.isChanneling = false;
                this.localPlayer.isAttacking = false;
            }
        }

        actions.forEach(act => {
            if (act !== 'j' && this.input.keys[act]) this.handleAction(act);
        });

        this.localPlayer.update(dt, this.input);
        this.projectiles = this.projectiles.filter(p => { p.update(dt, this.monsters); return !p.isDead; });

        const pLv = this.localPlayer.level;
        let curAggro = this.monsters.filter(m => !m.isDead && m.hp < m.maxHp).length;
        this.monsters.forEach(m => {
            const dist = Math.sqrt((this.localPlayer.x - m.x) ** 2 + (this.localPlayer.y - m.y) ** 2);
            // Peace Mode: Only aggro if player has attacked or monster is damaged
            let isAggro = m.hp < m.maxHp || (this.playerHasAttacked && dist < 400 && curAggro < pLv && pLv > 1 && (pLv >= 3 || !m.isBoss));
            if (isAggro && m.hp >= m.maxHp) curAggro++;
            m.isAggro = isAggro; m.update(dt);
        });

        this.checkQuests();
        this.monsters.forEach(m => {
            if (m.isDead && !m._looted) {
                m._looted = true; this.spawnLoot(m);
                if (m.name.includes('슬라임')) this.localPlayer.questData.slimeKills++;
                if (m.isBoss) this.localPlayer.questData.bossKilled = true;
            }
        });
        this.monsters = this.monsters.filter(m => !m.isDead || m.hitTimer > 0);

        if (!this.spawnTimer) this.spawnTimer = 0;
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.monsters.length < 10) {
            let mx, my, dist;
            let attempts = 0;
            const minSpawnDist = 400; // Minimum distance from player

            // Try to find a spot far from player
            do {
                mx = Math.random() * 2000;
                my = Math.random() * 2000;
                dist = Math.sqrt((this.localPlayer.x - mx) ** 2 + (this.localPlayer.y - my) ** 2);
                attempts++;
            } while (dist < minSpawnDist && attempts < 10);

            // 대왕 슬라임은 슬라임 10마리 처치 퀘스트 달성 시에만 확률적으로 스폰
            if (Math.random() < 0.1 && this.localPlayer.questData.slimeKills >= 10) {
                const b = new Monster(mx, my, '대왕 슬라임');
                b.width = 150; b.height = 150; b.maxHp = 500; b.hp = 500; b.isBoss = true;
                this.monsters.push(b);
            } else {
                const names = ['초보 슬라임', '야생 슬라임', '푸른 슬라임'];
                const name = names[Math.floor(Math.random() * names.length)];
                this.monsters.push(new Monster(mx, my, name));
            }
            this.spawnTimer = Math.max(1.0, 3.0 - (pLv - 1) * 0.2);
        }

        this.drops = this.drops.filter(d => {
            const rem = d.update(dt, this.localPlayer);
            if (d.isCollected) {
                if (d.type === 'gold') this.localPlayer.addGold(d.amount);
                else if (d.type === 'hp') this.localPlayer.recoverHp(d.amount);
                else this.localPlayer.addExp(d.amount);
            }
            return !rem;
        });

        this.floatingTexts = this.floatingTexts.filter(ft => { ft.timer -= dt; ft.currentY -= 40 * dt; return ft.timer > 0; });
        this.camera.update(this.localPlayer.x, this.localPlayer.y);
        if (this.localPlayer.ready && !this.portraitInitialized) { this.ui.setPortrait(this.localPlayer.sprite.image); this.portraitInitialized = true; }
        this.ui.updateMinimap(this.localPlayer, this.monsters, 2000, 2000);
        this.ui.updateQuestUI();
    }

    checkQuests() {
        const p = this.localPlayer;
        if (p.questData.slimeKills >= 10 && !p.questData._slimeMsgShown) {
            p.questData._slimeMsgShown = true;
            this.ui.logSystemMessage('QUEST 알림: 슬라임 10마리 처치 완료! 퀘스트 창에서 보상을 받으세요.');
            this.ui.updateQuestUI();
        }
        if (p.questData.bossKilled && !p.questData._bossMsgShown) {
            p.questData._bossMsgShown = true;
            this.ui.logSystemMessage('QUEST 알림: 대왕 슬라임 처치 완료! 퀘스트 창에서 보상을 받으세요.');
            this.ui.updateQuestUI();
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        const ratio = window.devicePixelRatio || 1;
        this.ctx.scale(this.zoom * ratio, this.zoom * ratio);

        this.map.draw(this.camera);
        this.drops.forEach(d => d.draw(this.ctx, this.camera));
        this.monsters.forEach(m => m.draw(this.ctx, this.camera));
        this.projectiles.forEach(p => p.draw(this.ctx, this.camera));
        this.localPlayer.draw(this.ctx, this.camera);
        this.ctx.save();
        this.floatingTexts.forEach(ft => {
            const sx = ft.x - this.camera.x, sy = ft.currentY - this.camera.y;
            this.ctx.globalAlpha = Math.min(1, ft.timer);
            this.ctx.textAlign = 'center'; this.ctx.strokeStyle = '#000'; this.ctx.lineWidth = 3;
            if (ft.label) { this.ctx.font = 'bold 18px "Outfit", sans-serif'; this.ctx.strokeText(ft.label, sx, sy - 35); this.ctx.fillStyle = '#fff'; this.ctx.fillText(ft.label, sx, sy - 35); }
            const fs = ft.isCrit ? 50 : 20; this.ctx.font = `bold ${fs}px "Outfit", sans-serif`;
            this.ctx.strokeText(ft.text, sx, sy); this.ctx.fillStyle = ft.color;
            this.ctx.shadowColor = 'rgba(0,0,0,0.5)'; this.ctx.shadowBlur = ft.isCrit ? 10 : 4;
            this.ctx.fillText(ft.text, sx, sy);
        });
        this.ctx.restore(); // Restore floating texts
        this.ctx.restore(); // Restore global scale
    }

    loop(time) {
        if (!this.lastTime) this.lastTime = time;
        const dt = (time - this.lastTime) / 1000;
        this.lastTime = time;
        if (this.isLoading) this.updateLoading(dt);
        else { this.update(dt); this.draw(); }
        requestAnimationFrame((t) => this.loop(t));
    }

    updateLoading(dt) {
        if (this.localPlayer.ready) {
            this.loadingProgress = 100;
            const f = document.getElementById('loading-progress-fill'); if (f) f.style.width = '100%';
            setTimeout(() => { const o = document.getElementById('loading-overlay'); if (o) o.style.display = 'none'; this.isLoading = false; }, 500);
        } else {
            if (this.loadingProgress < 90) this.loadingProgress += 30 * dt;
            const f = document.getElementById('loading-progress-fill'); if (f) f.style.width = `${this.loadingProgress}%`;
        }
    }
}

window.onload = () => {
    window.game = new Game();
};
