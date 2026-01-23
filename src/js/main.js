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

        // resize handler
        this.resize();
        window.addEventListener('resize', () => this.resize());

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
        if (container) {
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
        } else {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }

        if (this.camera) {
            this.camera.resize(this.canvas.width, this.canvas.height);
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
            this.remotePlayers.set(data.id, rp);
        });

        this.net.on('playerUpdate', (data) => {
            const rp = this.remotePlayers.get(data.id);
            if (rp) {
                rp.onServerUpdate(data);
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
            await this.resources.loadImage('src/assets/character.webp');
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
        if (savedData) {
            const posData = Array.isArray(savedData) ? savedData : (savedData.p || null);
            if (posData && Array.isArray(posData)) {
                startX = posData[0];
                startY = posData[1];
                Logger.log(`[Main] Position restored: ${startX}, ${startY}`);
            }
        }

        this.updateLoading('캐릭터 생성 및 최적화 중...', 95);
        // Spawn Player
        this.player = new Player(startX, startY, user.displayName || "Hero");
        this.localPlayer = this.player; // Alias used by Monster AI
        this.player.init(this.input, this.resources, this.net);

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
            this.player.update(dt);

            // Sync Position
            this.net.sendMovePacket(
                this.player.x,
                this.player.y,
                this.player.vx,
                this.player.vy
            );

            // Camera Follow
            this.camera.follow(this.player, this.zone.width, this.zone.height);
        }

        // Update Remote Players
        this.remotePlayers.forEach(rp => rp.update(dt));

        // Update Monsters
        if (this.monsterManager && this.player) {
            this.monsterManager.update(dt, this.player);
        }
    }

    render() {
        // Clear
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.zone.currentZone) return;

        this.ctx.save();
        this.ctx.translate(-this.camera.x, -this.camera.y);

        // Draw World
        this.zone.render(this.ctx, this.camera);

        // Draw Remote Players (Behind local player)
        this.remotePlayers.forEach(rp => rp.render(this.ctx, this.camera));

        // Draw Monsters
        if (this.monsterManager) {
            this.monsterManager.render(this.ctx, this.camera);
        }

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

        this.ctx.restore();
    }
}

// Start
window.game = new Game();
