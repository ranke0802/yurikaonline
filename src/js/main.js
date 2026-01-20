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

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.input = new InputHandler();
        this.ui = new UIManager(this);
        this.map = new Map(this.ctx, 2000, 2000);
        this.camera = new Camera(this.width, this.height, 2000, 2000);

        this.drops = [];
        this.projectiles = [];
        this.floatingTexts = [];
        this.localPlayer = new Player(1000, 1000);

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
                player.skillCooldowns['j'] = 0.6 / player.attackSpeed;
                player.skillMaxCooldowns['j'] = player.skillCooldowns['j'];
                player.attackCooldown = player.skillCooldowns['j'];
                break;
            case 'h':
                const mCount = player.skillLevels.missile || 1;
                const mCost = Math.floor(2 * Math.pow(1.5, mCount - 1));
                if (player.useMana(mCost)) {
                    this.ui.logSystemMessage(`SKILL: 매직 미사일 (Lv.${mCount})`);
                    this.castMagicMissile();
                    player.skillCooldowns['h'] = 2.0;
                    player.skillMaxCooldowns['h'] = 2.0;
                    player.attackCooldown = 0.5;
                }
                break;
            case 'u':
                if (player.useMana(8)) {
                    this.ui.logSystemMessage(`SKILL: 파이어볼 (Lv.${player.skillLevels.fireball || 1})`);
                    this.castFireball();
                    player.skillCooldowns['u'] = 5.0;
                    player.skillMaxCooldowns['u'] = 5.0;
                    player.attackCooldown = 0.8;
                }
                break;
            case 'k':
                const sLv = player.skillLevels.shield || 1;
                if (player.useMana(20)) {
                    const dur = 60 + (sLv - 1) * 20;
                    player.triggerAction('SKILL: 마나쉴드');
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
            new Monster(800, 900, '슬라임'),
            new Monster(1500, 1300, '대왕 슬라임')
        ];
        this.monsters[2].hp = 300;
        this.monsters[2].isBoss = true;

        this.updateHistory = [
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
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        if (this.camera) this.camera.resize(this.width, this.height);
    }

    performLaserAttack() {
        const player = this.localPlayer;
        player.triggerAction('ATTACK');
        this.playerHasAttacked = true;
        const laserLv = player.skillLevels.laser || 1;
        const mpRecover = Math.min(5, 1 + Math.floor(laserLv / 2));
        player.recoverMana(mpRecover, true);

        const vxList = [0, 0.707, 1, 0.707, 0, -0.707, -1, -0.707];
        const vyList = [-1, -0.707, 0, 0.707, 1, 0.707, 0, -0.707];
        const vx = vxList[player.facingDir] || 0;
        const vy = vyList[player.facingDir] || 1;

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
                    m.takeDamage(dmg * (1.0 + (laserLv - 1) * 0.2), true, isCrit);
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
            player.triggerAction('SKILL: 매직 미사일');
            this.playerHasAttacked = true;
            const count = player.skillLevels.missile || 1;
            for (let i = 0; i < count; i++) {
                const offset = (i - (count - 1) / 2) * 20;
                let dmg = player.attackPower * 0.8;
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
        player.triggerAction('SKILL: 파이어볼');
        this.playerHasAttacked = true;
        let vx = 0, vy = 0, speed = 400; const diag = 0.707;
        const dirs = [[0, -1], [diag, -diag], [1, 0], [diag, diag], [0, 1], [-diag, diag], [-1, 0], [-diag, -diag]];
        [vx, vy] = dirs[player.facingDir].map(v => v * speed);

        const fv = player.skillLevels.fireball || 1;
        const dmg = player.attackPower * (1.0 + (fv - 1) * 0.3);
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
        this.drops.push(new Drop(monster.x, monster.y, 'gold', 50));
        this.drops.push(new Drop(monster.x + 20, monster.y - 20, 'xp', 20));
        if (Math.random() > 0.5) this.drops.push(new Drop(monster.x - 20, monster.y + 10, 'hp', 30));
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
            if (Math.random() < 0.1) {
                const b = new Monster(mx, my, '대왕 슬라임');
                b.width = 150; b.height = 150; b.maxHp = 500; b.hp = 500; b.isBoss = true;
                this.monsters.push(b);
            } else this.monsters.push(new Monster(mx, my, '야생 슬라임'));
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
        this.ctx.restore();
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
