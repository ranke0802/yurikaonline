import Logger from './utils/Logger.js';
import GameLoop from './core/GameLoop.js';
import InputManager from './core/InputManager.js';
import TouchHandler from './core/input/TouchHandler.js';
import KeyboardHandler from './core/input/KeyboardHandler.js';
import ResourceManager from './core/ResourceManager.js';
import ZoneManager from './world/ZoneManager.js';
import Camera from './core/Camera.js';
import AuthManager from './core/AuthManager.js';
import NetworkManager from './core/NetworkManager.js';
import MonsterManager from './world/MonsterManager.js';
import MonsterDataManager from './core/MonsterDataManager.js';
import { UIManager } from './ui/UIManager.js';
import ObjectPool from './utils/ObjectPool.js';
import SceneManager from './core/SceneManager.js';
import WorldScene from './world/scenes/WorldScene.js';
import LoginScene from './world/scenes/LoginScene.js';
import CharacterSelectionScene from './world/scenes/CharacterSelectionScene.js';


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

        // Initial resize will be called after camera creation for full sync
        window.addEventListener('resize', () => this.resize());

        // Input Focus Management
        this.canvas.addEventListener('mousedown', (e) => {
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
        this.monsterData = new MonsterDataManager(this.resources); // Initialize MonsterDataManager

        // Global Reference for AI and Debugging
        window.game = this;

        // 2. World Systems
        this.zone = new ZoneManager(this.resources);
        this.monsterManager = new MonsterManager(this);
        this.ui = new UIManager(this);
        // Map is 6400x6400 based on ZoneManager (200 * 32)
        this.camera = new Camera(this.canvas.width, this.canvas.height, 6400, 6400);

        // Force initial resize after camera is ready to sync viewport
        this.resize();

        // 3. Handlers
        this.keyboard = new KeyboardHandler();
        this.touch = new TouchHandler();

        this.input.addHandler(this.keyboard);
        this.input.addHandler(this.touch);

        // 4. Game Entities
        this.player = null; // Local Player
        this.localPlayer = null; // Alias for compatibility
        this.time = 0; // Game Time for Throttling/Sync

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



        // 6. Scene Manager
        this.sceneManager = new SceneManager(this);
        this.sceneManager.addScene('login', new LoginScene(this));
        this.sceneManager.addScene('charSelect', new CharacterSelectionScene(this));
        this.sceneManager.addScene('world', new WorldScene(this));

        // 8. Game Loop
        this.loop = new GameLoop(
            (dt) => this.sceneManager.update(dt),
            () => this.sceneManager.render(this.ctx)
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
        // v0.24.2: Mobile Viewport Height (vh) polyfill
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);

        const container = document.getElementById('game-viewport');
        const displayWidth = container ? container.clientWidth : window.innerWidth;
        const displayHeight = container ? container.clientHeight : window.innerHeight;

        // Match yurikaonline-master logic: 900px threshold, 0.7/1.0 zoom
        const isMobile = window.innerWidth <= 900;
        // v0.28.6: Adjust PC zoom to 0.8 for wider view (User Feedback)
        this.zoom = isMobile ? 0.7 : 0.8;

        const ratio = window.devicePixelRatio || 1;
        this.dpr = ratio; // Store for render loop

        // Internal resolution for HiDPI
        this.canvas.width = displayWidth * ratio;
        this.canvas.height = displayHeight * ratio;

        // Visual Display Size
        this.canvas.style.width = displayWidth + 'px';
        this.canvas.style.height = displayHeight + 'px';

        // Re-enable smoothing for better HiDPI filtering (matches master source behavior)
        this.ctx.imageSmoothingEnabled = true;

        if (this.camera) {
            this.camera.resize(displayWidth / this.zoom, displayHeight / this.zoom);
        }
    }

    init() {
        this.updateLoading('시스템 초기화 중...');

        // Bind UI Popups (Global Key Listener)
        this.input.on('keydown', (action) => {
            if (this.ui) {
                if (action === 'OPEN_INVENTORY') this.ui.togglePopup('inventory-popup');
                if (action === 'OPEN_SKILL') this.ui.togglePopup('skill-popup');
                if (action === 'OPEN_STATUS') this.ui.togglePopup('status-popup');
            }
        });

        // 1. Prepare Scene Manager & Initial Load
        this.loop.start(); // Start loop for background rendering

        // 2. Auth Flow
        this.auth.on('initialized', () => {
            if (!this.auth.isAuthenticated()) {
                // If not logged in, go to Login Scene
                this.sceneManager.changeScene('login');
                this.updateLoading('완료', 100);
                this._hideLoader();
            }
        });

        this.auth.on('authStateChanged', (user) => {
            if (user) {
                // Ensure socket is connected once user is authenticated
                // v0.00.03: Connect BEFORE changing scene so CharacterSelectionScene can load data
                this.net.connect(user);

                // IMPORTANT: One-time database reset as requested by user
                // this.net.resetAllUserData(); // UNCOMMENT AND RUN ONCE IF NEEDED, THEN COMMENT BACK

                // If logged in, go to Char Select
                this.sceneManager.changeScene('charSelect', { user });
                this.updateLoading('완료', 100);
                this._hideLoader();
            } else {
                // Return to login on logout
                this.sceneManager.changeScene('login');
            }
        });

        this.updateLoading('로그인 상태 확인 중...');
        this.auth.init();
    }

    _hideLoader() {
        setTimeout(() => {
            const loader = document.getElementById('loading-overlay');
            if (loader) loader.style.display = 'none';
        }, 300);
    }


    // v0.00.02: Compatibility Proxies for entities (Player, Monster)
    // These redirect legacy widow.game.xxx calls to the active WorldScene
    get projectiles() {
        return (this.sceneManager?.currentScene?.projectiles) || [];
    }

    get remotePlayers() {
        return (this.sceneManager?.currentScene?.remotePlayers) || new Map();
    }

    get floatingTexts() {
        return (this.sceneManager?.currentScene?.floatingTexts) || [];
    }

    get sparks() {
        return (this.sceneManager?.currentScene?.sparks) || [];
    }

    addDamageText(x, y, amount, color, isCrit, label) {
        if (this.sceneManager?.currentScene?.addDamageText) {
            this.sceneManager.currentScene.addDamageText(x, y, amount, color, isCrit, label);
        }
    }

    addSpark(x, y) {
        if (this.sceneManager?.currentScene?.addSpark) {
            this.sceneManager.currentScene.addSpark(x, y);
        }
    }

    _handleCanvasInteraction(e) {
        if (!this.sceneManager || !this.sceneManager.currentScene) return;
        this.sceneManager.handlePointerDown(e);
    }
}

// Start
window.game = new Game();
