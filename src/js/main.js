import Logger from './utils/Logger.js';
import GameLoop from './core/GameLoop.js';
import InputManager from './core/InputManager.js';
import TouchHandler from './core/input/TouchHandler.js';
import KeyboardHandler from './core/input/KeyboardHandler.js';
import ResourceManager from './core/ResourceManager.js';
import ZoneManager from './world/ZoneManager.js';
import Camera from './core/Camera.js';
import Player from './entities/Player.js';
import RemotePlayer from './entities/RemotePlayer.js';
import AuthManager from './core/AuthManager.js';
import NetworkManager from './core/NetworkManager.js';
import MonsterManager from './world/MonsterManager.js';
import { UIManager } from './ui/UIManager.js';
import ObjectPool from './utils/ObjectPool.js';


class Game {
    constructor() {
        // Global Error Handler for Mobile/PWA Debugging
        window.onerror = (msg, url, line) => {
            const loader = document.querySelector('.loading-text');
            if (loader) {
                loader.innerHTML = `<span style="color:#ff6b6b">Error: ${msg}</span><br><small>${line}</small>`;
                loader.parentElement.style.display = 'block'; // Show if hidden
            }
            return false;
        };

        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Mobile Quality: Disable image smoothing for crisp pixel art
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.webkitImageSmoothingEnabled = false;
        this.ctx.mozImageSmoothingEnabled = false;
        this.ctx.msImageSmoothingEnabled = false;
        this.zoom = 1.0;

        // resize handler
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Input Focus Management
        this.canvas.addEventListener('mousedown', () => {
            // Regain focus for keyboard input
            window.focus();
            // Blur chat input if it's active
            const chatInput = document.querySelector('.chat-input-area input');
            if (chatInput && document.activeElement === chatInput) {
                chatInput.blur();
            }
            this._handleCanvasInteraction(e);
        });

        // Touch Interaction for Click-to-Move (Mobile/Tablet)
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) {
                this._handleCanvasInteraction(e.touches[0]);
            }
        }, { passive: true });

        // 1. Core Systems
        this.input = new InputManager();
        this.auth = new AuthManager();
        this.net = new NetworkManager();
        this.resources = new ResourceManager();

        // Global Reference for AI and Debugging
        window.game = this;

        // 2. World Systems
        this.zone = new ZoneManager(this.resources);
        this.monsterManager = new MonsterManager(this.zone, this.net);
        this.ui = new UIManager(this);
        // Map is 6400x6400 based on ZoneManager (200 * 32)
        this.camera = new Camera(this.canvas.width, this.canvas.height, 6400, 6400);

        // 3. Handlers
        this.keyboard = new KeyboardHandler();
        this.touch = new TouchHandler();

        this.input.addHandler(this.keyboard);
        this.input.addHandler(this.touch);

        // 4. Game Entities
        this.player = null; // Local Player
        this.localPlayer = null; // Alias for compatibility
        this.remotePlayers = new Map(); // Other Players <uid, RemotePlayer>
        this.floatingTexts = []; // Floating Damage Text
        this.sparks = []; // Spark Particles
        this.projectiles = []; // Projectiles (Fireball, Missile)

        // Performance: Object Pools
        this.sparkPool = new ObjectPool(
            () => ({}),
            (s, x, y, angle, speed, life, color) => {
                s.x = x; s.y = y;
                s.vx = Math.cos(angle) * speed;
                s.vy = Math.sin(angle) * speed;
                s.life = life;
                s.color = color;
            },
            100
        );
        this.textPool = new ObjectPool(
            () => ({}),
            (ft, x, y, text, color, timer, isCrit, label) => {
                ft.x = x; ft.y = y; ft.text = text; ft.color = color;
                ft.timer = timer; ft.currentY = y; ft.isCrit = isCrit; ft.label = label;
            },
            20
        );



        // 5. Game Loop
        this.loop = new GameLoop(
            (dt) => this.update(dt),
            () => this.render()
        );

        this.init();
    }

    updateLoading(msg, percent = null) {
        const loader = document.querySelector('.loading-text');
        if (loader) loader.textContent = msg;

        if (percent !== null) {
            const fill = document.getElementById('loading-progress-fill');
            if (fill) fill.style.width = `${percent}%`;
        }

        Logger.log(`[Loading] ${msg} ${percent ? `(${percent}%)` : ''}`);
    }

    resize() {
        const container = document.getElementById('game-viewport');
        const isMobile = window.innerWidth <= 1024; // Standard mobile/tablet threshold
        this.zoom = isMobile ? 0.7 : 1.0;

        if (container) {
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
        } else {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }

        if (this.camera) {
            // Visible world size is scaled by zoom
            this.camera.resize(this.canvas.width / this.zoom, this.canvas.height / this.zoom);
        }
    }

    init() {
        this.updateLoading('시스템 초기화 중...');

        // Auth Flow
        this.auth.on('initialized', () => {
            this.updateLoading('인증 서버 연결 확인...');
            if (!this.auth.isAuthenticated()) {
                this.updateLoading('게스트 계정 생성 중...');
                this.auth.loginAnonymously().catch(e => {
                    this.updateLoading(`로그인 실패: ${e.message}`);
                });
            }
        });

        this.auth.on('authStateChanged', (user) => {
            if (user) {
                this.updateLoading(`로그인 성공! (${user.isAnonymous ? '게스트' : user.displayName})`, 20);
                this.startSession(user);
            }
        });

        // Network Events
        this.net.on('playerJoined', (data) => {
            if (this.remotePlayers.has(data.id)) return;
            // Logger.log(`[Main] Remote Player Joined: ${data.id}`);
            const rp = new RemotePlayer(data.id, data.x, data.y, this.resources);
            rp.name = data.name || "Unknown";
            this.remotePlayers.set(data.id, rp);
        });

        this.net.on('playerUpdate', (data) => {
            const rp = this.remotePlayers.get(data.id);
            if (rp) {
                rp.onServerUpdate(data);
                if (data.name) rp.name = data.name;
            }
        });

        this.net.on('playerLeft', (id) => {
            // Logger.log(`[Main] Remote Player Left: ${id}`);
            this.remotePlayers.delete(id);
        });

        this.net.on('playerAttack', (data) => {
            const rp = this.remotePlayers.get(data.id);
            if (rp) {
                rp.triggerAttack(data);
            }
        });

        this.updateLoading('Firebase 연결 대기 중...');
        this.auth.init();
    }

    async startSession(user) {
        this.updateLoading('월드 데이터 다운로드 중...', 40);

        // Load Map and Assets
        await this.zone.loadZone('zone_1');
        try {
            // Fix: Asset path is in /src/assets/
            await this.resources.loadImage('/src/assets/character.webp');
        } catch (e) {
            Logger.error('Failed to load character sprite', e);
        }



        this.updateLoading('서버 소켓 연결 중...', 60);
        // Connect Network
        this.net.connect(user);

        this.updateLoading('캐릭터 데이터 복구 중...', 90);
        // Try to restore position
        let startX = this.zone.width / 2 + (Math.random() * 100 - 50);
        let startY = this.zone.height / 2 + (Math.random() * 100 - 50);

        const savedData = await this.net.getPlayerData(user.uid);
        let profile = null;
        if (savedData) {
            const posData = savedData.p;
            if (posData && Array.isArray(posData)) {
                startX = posData[0];
                startY = posData[1];
            }
            profile = savedData.profile;
        }

        this.updateLoading('캐릭터 생성 및 최적화 중...', 95);
        // Spawn Player
        this.player = new Player(startX, startY, user.displayName || "유리카");
        this.player.id = user.uid; // Ensure UID is set
        this.localPlayer = this.player; // Alias used by Monster AI

        if (profile) {
            this.player.level = profile.level || 1;
            this.player.exp = profile.exp || 0;
            this.player.gold = profile.gold || 300;
            this.player.vitality = profile.vitality || 1;
            this.player.intelligence = profile.intelligence || 3;
            this.player.wisdom = profile.wisdom || 2;
            this.player.agility = profile.agility || 1;
            this.player.statPoints = profile.statPoints || 0;
            this.player.skillLevels = profile.skillLevels || { laser: 1, missile: 1, fireball: 1, shield: 1 };
            this.player.name = profile.name || user.displayName || "유리카";
            this.player.refreshStats();
        }
        this.player.init(this.input, this.resources, this.net);

        // Network Handlers
        this.net.on('rewardReceived', (data) => {
            if (this.player) this.player.receiveReward(data);
        });

        this.net.on('monsterDamageReceived', (data) => {
            const m = this.monsterManager?.monsters.get(data.mid);
            if (m) {
                this.addSpark(m.x, m.y);
                this.addDamageText(m.x, m.y, data.dmg, '#ff4757', false);
            }
        });

        this.net.on('playerDamageReceived', (data) => {
            let target = null;
            if (this.player && this.player.id === data.tid) target = this.player;
            else target = this.remotePlayers.get(data.tid);

            if (target) {
                this.addSpark(target.x + target.width / 2, target.y + target.height / 2);
                this.addDamageText(target.x + target.width / 2, target.y + target.height / 2, data.dmg, '#ff4757', false);
                if (target === this.player) this.player.takeDamage(data.dmg);
                else {
                    // Manual HP update for remote player
                    target.hp = Math.max(0, (target.hp || 100) - data.dmg);
                }
            }
        });

        this.net.on('playerJoined', (data) => {
            if (this.remotePlayers.has(data.id)) return;
            const rp = new RemotePlayer(data.id, data.x, data.y, this.resources);
            rp.name = data.name || "Unknown";
            this.remotePlayers.set(data.id, rp);
            Logger.log(`[Main] Player Joined: ${rp.name} (${data.id})`);
        });

        this.net.on('playerUpdate', (data) => {
            const rp = this.remotePlayers.get(data.id);
            if (rp) {
                rp.onServerUpdate(data);
            }
        });

        this.net.on('playerLeft', (id) => {
            if (this.remotePlayers.has(id)) {
                this.remotePlayers.delete(id);
                Logger.log(`[Main] Player Left: ${id}`);
            }
        });

        this.net.on('playerAttack', (data) => {
            const rp = this.remotePlayers.get(data.id);
            if (rp) rp.triggerAttack(data);
        });

        // Bind UI Popups
        this.input.on('keydown', (action) => {
            if (action === 'OPEN_INVENTORY') this.ui.togglePopup('inventory-popup');
            if (action === 'OPEN_SKILL') this.ui.togglePopup('skill-popup');
            if (action === 'OPEN_STATUS') this.ui.togglePopup('status-popup');
        });

        this.updateLoading('게임 시작!', 100);
        // Start Loop
        this.loop.start();

        // Initial Draw
        this.render();

        // Hide Loading Overlay with slight delay
        setTimeout(() => {
            const loader = document.getElementById('loading-overlay');
            if (loader) loader.style.display = 'none';
        }, 500);
    }

    update(dt) {
        // Update Local Player
        if (this.player) {
            // Continuous Attack (J Key)
            if (this.input.isPressed('ATTACK')) {
                this.player.performLaserAttack(dt);
            } else {
                if (this.player.isChanneling) {
                    this.player.isChanneling = false;
                    this.player.isAttacking = false;
                    this.player.chargeTime = 0;
                }
            }

            // Continuous Skills (Missile, Fireball, Shield)
            if (this.input.isPressed('SKILL_1')) this.player.useSkill(1);
            if (this.input.isPressed('SKILL_2')) this.player.useSkill(2);
            if (this.input.isPressed('SKILL_3')) this.player.useSkill(3);

            this.player.update(dt);

            // Sync UI
            if (this.ui) {
                this.ui.updateStats(
                    (this.player.hp / this.player.maxHp) * 100,
                    (this.player.mp / this.player.maxMp) * 100,
                    this.player.level,
                    (this.player.exp / this.player.maxExp) * 100
                );

                // Set Max values for progress bars (initial or dynamic)
                const hpMax = document.getElementById('ui-hp-max');
                const mpMax = document.getElementById('ui-mp-max');
                if (hpMax) hpMax.textContent = Math.floor(this.player.maxHp);
                if (mpMax) mpMax.textContent = Math.floor(this.player.maxMp);
            }

            // Sync Position
            this.net.sendMovePacket(
                this.player.x,
                this.player.y,
                this.player.vx,
                this.player.vy,
                this.player.name
            );

            // Camera Follow
            this.camera.follow(this.player, this.zone.width, this.zone.height);
        }

        // Update Remote Players
        this.remotePlayers.forEach(rp => rp.update(dt));

        // Update Monsters
        if (this.monsterManager && this.player) {
            this.monsterManager.update(dt, this.player, this.remotePlayers);
        }

        // Update Floating Texts
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.timer -= dt;
            ft.currentY -= 40 * dt;
            if (ft.timer <= 0) {
                this.textPool.release(ft);
                this.floatingTexts.splice(i, 1);
            }
        }

        // Update Sparks
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.life -= dt;
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            if (s.life <= 0) {
                this.sparkPool.release(s);
                this.sparks.splice(i, 1);
            }
        }


        // Update Projectiles
        this.projectiles = this.projectiles.filter(p => {
            const monsters = this.monsterManager ? Array.from(this.monsterManager.monsters.values()) : [];
            p.update(dt, monsters);
            return !p.isDead;
        });
    }

    render() {
        // Clear
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.zone.currentZone) return;

        this.ctx.save();
        this.ctx.scale(this.zoom, this.zoom);
        this.ctx.translate(-this.camera.x, -this.camera.y);

        // Draw World
        this.zone.render(this.ctx, this.camera);

        // Draw Remote Players (Behind local player)
        this.remotePlayers.forEach(rp => rp.render(this.ctx, this.camera));

        // Draw Monsters
        if (this.monsterManager) {
            this.monsterManager.render(this.ctx, this.camera);
        }

        // Draw Projectiles
        this.projectiles.forEach(p => p.draw(this.ctx, this.camera));

        // Draw Local Player
        if (this.player) {
            this.player.render(this.ctx, this.camera);

            // Update Minimap
            if (this.ui) {
                this.ui.updateMinimap(
                    this.player,
                    this.remotePlayers,
                    this.monsterManager ? this.monsterManager.monsters : [],
                    this.zone.width,
                    this.zone.height
                );
            }
        }

        // Draw Floating Texts
        this.ctx.save();

        // Draw Sparks
        this.sparks.forEach(s => {
            this.ctx.fillStyle = s.color;
            this.ctx.globalAlpha = s.life * 2;
            this.ctx.fillRect(s.x, s.y, 2, 2);
        });
        this.ctx.globalAlpha = 1.0;

        this.floatingTexts.forEach(ft => {
            const sx = ft.x, sy = ft.currentY;
            this.ctx.globalAlpha = Math.min(1, ft.timer);
            this.ctx.textAlign = 'center';
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 3;

            if (ft.label) {
                this.ctx.font = 'bold 18px "Outfit", sans-serif';
                this.ctx.strokeText(ft.label, sx, sy - 35);
                this.ctx.fillStyle = '#fff';
                this.ctx.fillText(ft.label, sx, sy - 35);
            }

            const fs = ft.isCrit ? 50 : 20;
            this.ctx.font = `bold ${fs}px "Outfit", sans-serif`;
            this.ctx.strokeText(ft.text, sx, sy);
            this.ctx.fillStyle = ft.color;
            this.ctx.shadowColor = 'rgba(0,0,0,0.5)';
            this.ctx.shadowBlur = ft.isCrit ? 10 : 4;
            this.ctx.fillText(ft.text, sx, sy);
        });
        this.ctx.restore();

        this.ctx.restore();
    }

    addDamageText(x, y, amount, color = '#ff4757', isCrit = false, label = null) {
        const ft = this.textPool.acquire(x, y, amount, color, 1.5, isCrit, label);
        this.floatingTexts.push(ft);
    }

    addSpark(x, y) {
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + Math.random() * 50;
            const life = 0.3 + Math.random() * 0.2;
            const s = this.sparkPool.acquire(x, y, angle, speed, life, '#fff');
            this.sparks.push(s);
        }
    }


    _handleCanvasInteraction(e) {
        if (!this.player || this.ui.isPaused) return;

        // Check if we hit any UI element (since UI is overlayed, this shouldn't trigger if UI blocks)
        // However, pointer-events: none is on #ui-layer, so we might need simple distance check
        // Or better yet, check if the click was within the joystick area.

        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Joystick Area (Left side) Exclusion
        if (screenX < 200 && screenY > this.canvas.height / 2) return;

        // Top bar exclusion
        if (screenX < 300 && screenY < 100) return;

        // Scale and translate coordinate to world
        const worldX = (screenX / this.zoom) + this.camera.x;
        const worldY = (screenY / this.zoom) + this.camera.y;

        this.player.setMoveTarget(worldX, worldY);
    }
}

// Start
window.game = new Game();
