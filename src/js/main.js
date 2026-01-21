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

        // Initialize camera AFTER player to ensure proper centering
        this.camera = new Camera(this.width, this.height, 2000, 2000);
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
                const sLv = player.skillLevels.shield || 1;
                const sCost = 20 + (sLv - 1) * 5;
                if (player.useMana(sCost)) {
                    const dur = 60 + (sLv - 1) * 20;
                    player.triggerAction(`${player.name} : 마나쉴드 !!`);
                    player.shieldTimer = dur;
                    player.isShieldActive = true;
                    this.ui.logSystemMessage(`SKILL: 마나쉴드 - 방어막이 ${dur}초간 지속됩니다.`);
                    player.skillCooldowns['k'] = 10.0;
                    player.skillMaxCooldowns['k'] = 10.0;
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

        this.canvas.width = this.width;
        this.canvas.height = this.height;

        if (this.camera) {
            // Camera viewport must be larger to show more of the map relative to the canvas
            this.camera.resize(this.width / this.zoom, this.height / this.zoom);
        }
    }

    performLaserAttack() {
        const player = this.localPlayer;
        player.triggerAction('ATTACK');
        this.playerHasAttacked = true;
        const laserLv = player.skillLevels.laser || 1;
        const mpRecover = laserLv;
        player.recoverMana(mpRecover, true);

        const vxList = [0, 0.707, 1, 0.707, 0, -0.707, -1, -0.707];
        const vyList = [-1, -0.707, 0, 0.707, 1, 0.707, 0, -0.707];
        const vx = vxList[player.facingDir];
        const vy = vyList[player.facingDir];

        const range = 400 + (laserLv - 1) * 20;
        const ex = player.x + vx * range;
        const ey = player.y + vy * range;
        player.laserEffect = { x1: player.x, y1: player.y, x2: ex, y2: ey, timer: 0.2 };

        this.monsters.forEach(m => {
            if (m.isDead) return;
            const dx = m.x - player.x, dy = m.y - player.y;
            const dot = dx * vx + dy * vy;
            if (dot > 0 && dot < range) {
                const projX = player.x + vx * dot, projY = player.y + vy * dot;
                const distToLine = Math.sqrt((m.x - projX) ** 2 + (m.y - projY) ** 2);
                if (distToLine < 50) {
                    let dmg = player.attackPower;
                    let isCrit = Math.random() < player.critRate;
                    if (isCrit) dmg *= 2;
                    m.takeDamage(dmg, true, isCrit);
                }
            }
        });
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
        actions.forEach(act => {
            if (this.input.keys[act]) this.handleAction(act);
        });

        this.localPlayer.update(dt, this.input);
        this.projectiles = this.projectiles.filter(p => { p.update(dt, this.monsters); return !p.isDead; });

        const pLv = this.localPlayer.level;
        let curAggro = this.monsters.filter(m => !m.isDead && m.hp < m.maxHp).length;
        this.monsters.forEach(m => {
            const dist = Math.sqrt((this.localPlayer.x - m.x) ** 2 + (this.localPlayer.y - m.y) ** 2);
            let isAggro = m.hp < m.maxHp || (dist < 400 && curAggro < pLv && pLv > 1 && (pLv >= 3 || !m.isBoss));
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
            const mx = Math.random() * 2000, my = Math.random() * 2000;
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
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.save();
        this.ctx.scale(this.zoom, this.zoom);

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
