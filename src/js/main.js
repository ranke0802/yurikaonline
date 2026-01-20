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
        this.playerHasAttacked = false; // Flag to check if player has ever attacked

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
        this.floatingTexts = []; // For damage numbers
        this.localPlayer = new Player(1000, 1000);

        // Bind input actions
        this.input.onAction = (action) => {
            const player = this.localPlayer;

            switch (action) {
                case 'shift-b':
                    this.ui.togglePopup('inventory-popup');
                    return;
                case 'shift-s':
                    this.ui.togglePopup('skill-popup');
                    return;
                case 'shift-i':
                    this.ui.togglePopup('status-popup');
                    return;
                case 'fullscreen':
                    this.ui.toggleFullscreen();
                    return;
            }

            if (player.skillCooldowns[action] > 0) return;

            switch (action) {
                case 'j': // Basic Attack (Laser)
                    this.performLaserAttack();
                    player.skillCooldowns['j'] = 0.6 / player.attackSpeed;
                    player.attackCooldown = player.skillCooldowns['j'];
                    break;
                case 'h': // Magic Missile (Homing)
                    const missileCount = player.skillLevels.missile || 1;
                    const missileCost = Math.floor(2 * Math.pow(1.5, missileCount - 1));
                    if (player.useMana(missileCost)) {
                        this.ui.logSystemMessage(`SKILL: 매직 미사일 (Lv.${missileCount})`);
                        this.castMagicMissile();
                        player.skillCooldowns['h'] = 2.0;
                        player.attackCooldown = 0.5;
                    }
                    break;
                case 'u': // Fireball (AoE)
                    const fireballLv = player.skillLevels.fireball || 1;
                    if (player.useMana(8)) {
                        this.ui.logSystemMessage(`SKILL: 파이어볼 (Lv.${fireballLv})`);
                        this.castFireball();
                        player.skillCooldowns['u'] = 5.0;
                        player.attackCooldown = 0.8;
                    }
                    break;
                case 'k': // Shield
                    const shieldLv = player.skillLevels.shield || 1;
                    const shieldCost = 20;
                    if (player.useMana(shieldCost)) {
                        const duration = 60 + (shieldLv - 1) * 20;
                        player.triggerAction('SKILL: 마나쉴드');
                        player.shieldTimer = duration;
                        player.isShieldActive = true;
                        this.ui.logSystemMessage(`SKILL: 마나쉴드 - 방어막이 ${duration}초간 지속됩니다.`);
                        player.skillCooldowns['k'] = 10.0;
                        player.attackCooldown = 0.5;
                    }
                    break;
            }
        };

        // Add some monsters
        this.monsters = [
            new Monster(1200, 1100, '초보 슬라임'),
            new Monster(800, 900, '슬라임'),
            new Monster(1500, 1300, '대왕 슬라임')
        ];
        this.monsters[2].hp = 300;
        this.monsters[2].isBoss = true;

        this.updateHistory = [
            {
                version: 'v1.05', date: '2026-01-21', title: 'Monster AI Revamp',
                logs: ['레벨별 선제공격 로직 적용 (Lv.1~3+)', '선제공격 인식 시 말풍선(!) 출력']
            },
            {
                version: 'v1.04', date: '2026-01-21', title: 'System Pause & Fix',
                logs: ['스킬/인벤토리 창 열기 시 게임 일시정지', '창 닫기 시 게임 재개 버그 수정']
            },
            {
                version: 'v1.02', date: '2026-01-21', title: 'Quest & Economy',
                logs: ['골드 기반 스킬 강화 시스템', '슬라임 처치/보스 처치 퀘스트 추가', '레벨별 동시 적대 몬스터 수 제한']
            },
            {
                version: 'v1.01', date: '2026-01-20', title: 'Visual UX & Comfort',
                logs: ['아이템 자동 획득 범위 확장', '파이어볼 피격 예상지점 표시', '사망 모달 및 부활 대기시간 도입']
            },
            {
                version: 'v1.0', date: '2026-01-20', title: 'Advanced UI & Balance',
                logs: ['수동 스텟 분배 시스템', '스킬 개별 쿨타임 및 오버레이', '치명타 연출 강화']
            }
        ];

        this.portraitInitialized = false;
        this.init();
    }

    init() {
        requestAnimationFrame((time) => this.loop(time));
    }

    addDamageText(x, y, amount, color = '#ff4757', isCrit = false, label = null) {
        this.floatingTexts.push({
            x, y, text: amount, color, timer: 1.5, currentY: y, isCrit: isCrit, label: label
        });
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

        // Initial mana recovery: 1, +1 per level
        const laserLv = player.skillLevels.laser || 1;
        player.recoverMana(laserLv, true); // true = show feedback

        let range = 600;
        let vx = 0, vy = 0;

        // 0:N, 1:NE, 2:E, 3:SE, 4:S, 5:SW, 6:W, 7:NW
        const diag = 0.707;
        switch (player.facingDir) {
            case 0: vx = 0; vy = -1; break;
            case 1: vx = diag; vy = -diag; break;
            case 2: vx = 1; vy = 0; break;
            case 3: vx = diag; vy = diag; break;
            case 4: vx = 0; vy = 1; break;
            case 5: vx = -diag; vy = diag; break;
            case 6: vx = -1; vy = 0; break;
            case 7: vx = -diag; vy = -diag; break;
        }

        const endX = player.x + vx * range;
        const endY = player.y + vy * range;

        // Visual
        player.laserEffect = { x1: player.x, y1: player.y, x2: endX, y2: endY, timer: 0.2 };

        // Hit Detection
        this.monsters.forEach(m => {
            if (m.isDead) return;
            const dx = m.x - player.x;
            const dy = m.y - player.y;
            const dot = dx * vx + dy * vy;

            if (dot > 0 && dot < range) {
                const projX = player.x + vx * dot;
                const projY = player.y + vy * dot;
                const distToLine = Math.sqrt((m.x - projX) ** 2 + (m.y - projY) ** 2);

                if (distToLine < 50) {
                    let damage = player.attackPower;
                    let isCrit = Math.random() < player.critRate;
                    if (isCrit) damage *= 2;
                    m.takeDamage(damage, isCrit);
                }
            }
        });
    }

    castMagicMissile() {
        const player = this.localPlayer;
        let nearest = null;
        let minDist = 500;
        this.monsters.forEach(m => {
            if (m.isDead) return;
            const dist = Math.sqrt((player.x - m.x) ** 2 + (player.y - m.y) ** 2);
            if (dist < minDist) {
                minDist = dist;
                nearest = m;
            }
        });

        if (nearest) {
            player.triggerAction('SKILL: 매직 미사일');
            this.playerHasAttacked = true;

            // Skill Level increases number of missiles
            const count = player.skillLevels.missile || 1;
            const manaCost = Math.floor(2 * Math.pow(1.5, count - 1));

            // Note: Mana is already deducted in onAction before calling this, 
            // but we need to ensure the cost is consistent. 
            // I'll update the mana check in onAction too.

            for (let i = 0; i < count; i++) {
                const offset = (i - (count - 1) / 2) * 20;
                let damage = player.attackPower * 0.8; // 80% of base
                let isCrit = Math.random() < player.critRate;
                if (isCrit) damage *= 2;

                this.projectiles.push(new Projectile(player.x + offset, player.y + offset, nearest, 'missile', {
                    speed: 500 + (Math.random() * 50),
                    damage: damage,
                    isCrit: isCrit
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

        let vx = 0, vy = 0;
        const speed = 400;
        const diag = 0.707;

        switch (player.facingDir) {
            case 0: vx = 0; vy = -speed; break;
            case 1: vx = speed * diag; vy = -speed * diag; break;
            case 2: vx = speed; vy = 0; break;
            case 3: vx = speed * diag; vy = speed * diag; break;
            case 4: vx = 0; vy = speed; break;
            case 5: vx = -speed * diag; vy = speed * diag; break;
            case 6: vx = -speed; vy = 0; break;
            case 7: vx = -speed * diag; vy = -speed * diag; break;
        }

        const fireballLv = player.skillLevels.fireball || 1;
        const baseDamage = player.attackPower * (1.0 + (fireballLv - 1) * 0.3);
        const radius = 80 + (fireballLv - 1) * 40; // ~2 slimes to start, +1 slime/lv
        const lifeTime = 1.5;

        // Calculate expected impact point
        const targetX = player.x + vx * (speed / speed) * (speed * lifeTime);
        const targetY = player.y + vy * (speed / speed) * (speed * lifeTime);
        // Simplified:
        const tX = player.x + (vx / speed) * (speed * lifeTime);
        const tY = player.y + (vy / speed) * (speed * lifeTime);

        this.projectiles.push(new Projectile(player.x, player.y, null, 'fireball', {
            vx, vy,
            speed: speed,
            damage: baseDamage,
            radius: radius,
            lifeTime: lifeTime,
            targetX: tX,
            targetY: tY,
            burnDuration: 5.0 + (fireballLv - 1),
            critRate: player.critRate // Pass crit rate to projectile logic if needed
        }));
    }

    checkAttackHits() {
        const attackRange = 100;
        this.monsters.forEach(monster => {
            if (monster.isDead) return;
            const dist = Math.sqrt((this.localPlayer.x - monster.x) ** 2 + (this.localPlayer.y - monster.y) ** 2);
            if (dist < attackRange) {
                monster.takeDamage(10 + Math.floor(Math.random() * 10));
            }
        });
    }

    spawnLoot(monster) {
        this.ui.logSystemMessage(`${monster.name}을 처치했습니다!`);
        this.drops.push(new Drop(monster.x, monster.y, 'gold', 50));
        this.drops.push(new Drop(monster.x + 20, monster.y - 20, 'xp', 20));

        // Chance for HP Recovery drop
        if (Math.random() > 0.5) {
            this.drops.push(new Drop(monster.x - 20, monster.y + 10, 'hp', 30));
        }
    }

    update(dt) {
        if (this.ui.isPaused) return;

        this.localPlayer.update(dt, this.input);

        // Update Projectiles
        this.projectiles = this.projectiles.filter(p => {
            p.update(dt, this.monsters);
            return !p.isDead;
        });

        // Update monsters with Aggro Limit & Level-based AI
        let proactiveAggroCount = 0;
        const playerLv = this.localPlayer.level;
        const maxProactive = playerLv; // Limit proactive aggro by level count

        this.monsters.forEach(monster => {
            const dist = Math.sqrt((this.localPlayer.x - monster.x) ** 2 + (this.localPlayer.y - monster.y) ** 2);
            const reflectsDamage = monster.hp < monster.maxHp;
            const isNear = dist < 400;

            let isAggro = false;

            if (reflectsDamage) {
                // Reactive Aggro: Always aggressive if hurt
                isAggro = true;
            } else if (isNear && proactiveAggroCount < maxProactive) {
                // Proactive Aggro Logic
                if (playerLv === 1) {
                    isAggro = false; // Level 1: Never attacks first
                } else if (playerLv === 2) {
                    if (!monster.isBoss) {
                        isAggro = true;
                        proactiveAggroCount++;
                    }
                } else if (playerLv >= 3) {
                    isAggro = true;
                    proactiveAggroCount++;
                }
            }

            monster.isAggro = isAggro;
            monster.update(dt);
        });

        // Quest Progress Check
        this.checkQuests();

        // Universal Kill/Loot Check
        this.monsters.forEach(m => {
            if (m.isDead && !m._looted) {
                m._looted = true;
                this.spawnLoot(m);

                // Update Quest Progress
                if (m.name.includes('슬라임')) {
                    this.localPlayer.questData.slimeKills++;
                }
                if (m.isBoss) {
                    this.localPlayer.questData.bossKilled = true;
                }
            }
        });

        // Filter out dead and fully processed (looted) monsters
        this.monsters = this.monsters.filter(monster => {
            // Keep it if it's alive OR if it's still playing death animation/effect
            return !monster.isDead || monster.hitTimer > 0;
        });

        // Spawning logic (Level-based respawn speed)
        if (!this.spawnTimer) this.spawnTimer = 0;
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.monsters.length < 10) {
            const mx = Math.random() * 2000;
            const my = Math.random() * 2000;

            // Randomly spawn a "Big Slime" as a mini-boss occasionally
            if (Math.random() < 0.1) {
                const boss = new Monster(mx, my, '대왕 슬라임');
                boss.width = 150;
                boss.height = 150;
                boss.maxHp = 500;
                boss.hp = 500;
                boss.isBoss = true;
                this.monsters.push(boss);
            } else {
                this.monsters.push(new Monster(mx, my, '야생 슬라임'));
            }
            // Faster respawn as level increases: Base 3s, -0.2s per level (min 1s)
            const respawnDelay = Math.max(1.0, 3.0 - (this.localPlayer.level - 1) * 0.2);
            this.spawnTimer = respawnDelay;
        }

        // Update drops
        this.drops = this.drops.filter(drop => {
            const shouldRemove = drop.update(dt, this.localPlayer);
            if (drop.isCollected) {
                if (drop.type === 'gold') {
                    this.localPlayer.addGold(drop.amount);
                    this.ui.logSystemMessage(`💰 ${drop.amount} Gold 획득! (현재: ${this.localPlayer.gold})`);
                } else if (drop.type === 'hp') {
                    this.localPlayer.recoverHp(drop.amount);
                    this.ui.logSystemMessage(`💚 HP ${drop.amount} 회복!`);
                } else {
                    this.localPlayer.addExp(drop.amount);
                    this.ui.logSystemMessage(`✨ ${drop.amount} Exp 획득!`);
                }
            }
            return !shouldRemove;
        });

        // Update floating texts
        this.floatingTexts = this.floatingTexts.filter(ft => {
            ft.timer -= dt;
            ft.currentY -= 40 * dt; // Float up
            return ft.timer > 0;
        });

        this.camera.update(this.localPlayer.x, this.localPlayer.y);

        if (this.localPlayer.ready && !this.portraitInitialized) {
            this.ui.setPortrait(this.localPlayer.sprite.image);
            this.portraitInitialized = true;
        }

        // Update Minimap
        this.ui.updateMinimap(this.localPlayer, this.monsters, 2000, 2000);
        this.ui.updateQuestUI();
    }

    checkQuests() {
        const p = this.localPlayer;
        if (!p) return;

        // Slime Quest
        if (!p.questData.slimeQuestDone && p.questData.slimeKills >= 10) {
            p.questData.slimeQuestDone = true;
            p.statPoints += 5;
            this.ui.logSystemMessage('QUEST 완료: 슬라임 10마리 처치! (보상: 스텟 포인트 +5)');
            this.ui.updateStatusPopup();
        }

        // Boss Quest
        if (!p.questData.bossQuestDone && p.questData.bossKilled) {
            p.questData.bossQuestDone = true;
            p.addGold(1000);
            this.ui.logSystemMessage('QUEST 완료: 보스 몬스터 처치! (보상: 1000 골드)');
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.map.draw(this.camera);

        this.drops.forEach(drop => drop.draw(this.ctx, this.camera));
        this.monsters.forEach(monster => monster.draw(this.ctx, this.camera));
        this.projectiles.forEach(p => p.draw(this.ctx, this.camera));

        this.localPlayer.draw(this.ctx, this.camera);

        // Draw Floating Texts (Damage Numbers)
        this.ctx.save();
        this.floatingTexts.forEach(ft => {
            const sx = ft.x - this.camera.x;
            const sy = ft.currentY - this.camera.y;
            this.ctx.globalAlpha = Math.min(1, ft.timer);

            this.ctx.textAlign = 'center';
            this.ctx.strokeStyle = '#000000';
            this.ctx.lineWidth = 3;

            if (ft.label) {
                // Draw label (e.g. "Critical")
                this.ctx.font = `bold 18px "Outfit", sans-serif`;
                this.ctx.strokeText(ft.label, sx, sy - 35);
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillText(ft.label, sx, sy - 35);
            }

            const fontSize = ft.isCrit ? 50 : 20; // 2.5x size for crit
            this.ctx.font = `bold ${fontSize}px "Outfit", sans-serif`;

            this.ctx.strokeText(ft.text, sx, sy);

            this.ctx.fillStyle = ft.color;
            this.ctx.shadowColor = 'rgba(0,0,0,0.5)';
            this.ctx.shadowBlur = ft.isCrit ? 10 : 4;
            this.ctx.fillText(ft.text, sx, sy);
        });
        this.ctx.restore();
    }

    loop(time) {
        if (!this.lastTime) this.lastTime = time;
        const dt = (time - this.lastTime) / 1000;
        this.lastTime = time;

        if (this.isLoading) {
            this.updateLoading(dt);
        } else {
            this.update(dt);
            this.draw();
        }
        requestAnimationFrame((t) => this.loop(t));
    }

    updateLoading(dt) {
        // Simple progress simulation based on player.ready
        if (this.localPlayer.ready) {
            this.loadingProgress = 100;
            const fill = document.getElementById('loading-progress-fill');
            if (fill) fill.style.width = '100%';

            // Small delay before starting
            setTimeout(() => {
                const overlay = document.getElementById('loading-overlay');
                if (overlay) overlay.style.display = 'none';
                this.isLoading = false;
            }, 500);
        } else {
            // Fake progress while waiting for images
            if (this.loadingProgress < 90) {
                this.loadingProgress += 30 * dt;
            }
            const fill = document.getElementById('loading-progress-fill');
            if (fill) fill.style.width = `${this.loadingProgress}%`;
        }
    }
}

window.onload = () => {
    window.game = new Game();
};

