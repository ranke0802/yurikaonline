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

        this.lastTime = 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.input = new InputHandler();
        this.ui = new UIManager(this);
        this.map = new Map(this.ctx, 2000, 2000);
        this.camera = new Camera(this.width, this.height, 2000, 2000);

        this.drops = [];
        this.projectiles = [];
        this.localPlayer = new Player(1000, 1000);

        // Bind input actions
        this.input.onAction = (action) => {
            const player = this.localPlayer;
            if (player.attackCooldown > 0) return;

            switch (action) {
                case 'shift-b':
                    this.ui.togglePopup('inventory-popup');
                    break;
                case 'shift-i':
                    this.ui.togglePopup('status-popup');
                    break;
                case 'j': // Basic Attack (Laser)
                    this.performLaserAttack();
                    player.attackCooldown = player.baseAttackDelay;
                    break;
                case 'h': // Magic Missile (Homing)
                    if (player.useMana(2)) {
                        this.castMagicMissile();
                        player.attackCooldown = 0.8;
                    }
                    break;
                case 'u': // Fireball (AoE)
                    if (player.useMana(5)) {
                        this.castFireball();
                        player.attackCooldown = 1.6;
                    }
                    break;
                case 'k': // Shield
                    if (player.useMana(20)) {
                        player.triggerAction('SHIELD!');
                        player.shieldTimer = 180; // 3 minutes
                        player.isShieldActive = true;
                        this.ui.logSystemMessage('방어막이 3분간 지속됩니다. (80% 피해 경감)');
                        player.attackCooldown = 2.0;
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
        this.monsters[2].width = 150;
        this.monsters[2].height = 150;
        this.monsters[2].maxHp = 300;
        this.monsters[2].hp = 300;

        this.portraitInitialized = false;
        this.init();
    }

    init() {
        requestAnimationFrame((time) => this.loop(time));
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
        player.triggerAction('LASER!');
        player.recoverMana(1); // Normal attack recovers 1 MP

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
                    m.takeDamage(player.attackPower);
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
            player.triggerAction('Skill: Missile!');
            this.projectiles.push(new Projectile(player.x, player.y, nearest, 'missile', {
                speed: 500,
                damage: player.attackPower
            }));
        } else {
            this.ui.logSystemMessage('대상을 찾을 수 없습니다.');
        }
    }

    castFireball() {
        const player = this.localPlayer;
        player.triggerAction('Skill: Fireball!');

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

        this.projectiles.push(new Projectile(player.x, player.y, null, 'fireball', {
            vx, vy,
            speed: speed,
            damage: Math.floor(player.attackPower * 1.5),
            radius: 25,
            lifeTime: 1.5
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
        // Bonus luck: chance for more items here
    }

    update(dt) {
        this.localPlayer.update(dt, this.input);

        // Update Projectiles
        this.projectiles = this.projectiles.filter(p => {
            p.update(dt, this.monsters);
            return !p.isDead;
        });

        // Update monsters
        this.monsters.forEach(monster => {
            monster.update(dt);
        });

        // Universal Kill/Loot Check (Covers Laser, Burn, and Projectiles)
        this.monsters.forEach(m => {
            if (m.isDead && !m._looted) {
                m._looted = true;
                this.spawnLoot(m);
            }
        });

        // Filter out dead and fully processed (looted) monsters
        this.monsters = this.monsters.filter(monster => {
            // Keep it if it's alive OR if it's still playing death animation/effect
            return !monster.isDead || monster.hitTimer > 0;
        });

        // Loop monster respawn for testing
        if (this.monsters.length < 3) {
            const mx = 500 + Math.random() * 1000;
            const my = 500 + Math.random() * 1000;
            this.monsters.push(new Monster(mx, my, '재생된 슬라임'));
        }

        // Update drops
        this.drops = this.drops.filter(drop => {
            const shouldRemove = drop.update(dt, this.localPlayer);
            if (drop.isCollected) {
                if (drop.type === 'gold') {
                    this.localPlayer.addGold(drop.amount);
                    this.ui.logSystemMessage(`💰 ${drop.amount} Gold 획득! (현재: ${this.localPlayer.gold})`);
                } else {
                    this.localPlayer.addExp(drop.amount);
                    this.ui.logSystemMessage(`✨ ${drop.amount} Exp 획득!`);
                }
            }
            return !shouldRemove;
        });

        this.camera.update(this.localPlayer.x, this.localPlayer.y);

        if (this.localPlayer.ready && !this.portraitInitialized) {
            this.ui.setPortrait(this.localPlayer.sprite.image);
            this.portraitInitialized = true;
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.map.draw(this.camera);

        this.drops.forEach(drop => drop.draw(this.ctx, this.camera));
        this.monsters.forEach(monster => monster.draw(this.ctx, this.camera));
        this.projectiles.forEach(p => p.draw(this.ctx, this.camera));

        this.localPlayer.draw(this.ctx, this.camera);
    }

    loop(time) {
        if (!this.lastTime) this.lastTime = time;
        const dt = (time - this.lastTime) / 1000;
        this.lastTime = time;
        this.update(dt);
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    }
}

window.onload = () => {
    window.game = new Game();
};

