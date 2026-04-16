import Logger from './utils/Logger.js';
window.RUNTIME_BUILD_VERSION = '0.01.177'; // Synced with version.txt
window.GAME_VERSION = window.RUNTIME_BUILD_VERSION;
import GameLoop from './core/GameLoop.js';
import InputManager from './core/InputManager.js';
import TouchHandler from './core/input/TouchHandler.js';
import KeyboardHandler from './core/input/KeyboardHandler.js';
import ResourceManager from './core/ResourceManager.js';
import ZoneManager from './world/ZoneManager.js';
import Camera from './world/Camera.js';
import AuthManager from './core/AuthManager.js';
import NetworkManager from './core/NetworkManager.js';
import MonsterManager from './world/MonsterManager.js';
import MonsterDataManager from './core/MonsterDataManager.js';
import CharacterDataManager from './core/CharacterDataManager.js';
import ItemDataManager from './core/ItemDataManager.js';
import StoryManager from './core/StoryManager.js';
import { UIManager } from './ui/UIManager.js';
import SoundManager from './core/SoundManager.js';
import QuestManager from './core/QuestManager.js';
import TutorialManager from './core/TutorialManager.js'; // v2.3
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
        this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true })
            || this.canvas.getContext('2d');
        this.isMobilePerformanceMode = false;
        this.useReducedEffects = false;
        this.useAggressiveHudOptimization = false;
        this.lowPowerPwaMode = false;
        this.maxMobileDpr = 1.5;

        // Mobile Quality: Disable image smoothing for crisp pixel art
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.webkitImageSmoothingEnabled = false;
        this.ctx.mozImageSmoothingEnabled = false;
        this.ctx.msImageSmoothingEnabled = false;
        this.canvas.style.imageRendering = 'pixelated';
        this.zoom = 1.0;
        this.performanceTelemetry = this.createPerformanceTelemetryState();
        this._backgroundedAt = 0;

        // Initial resize will be called after camera creation for full sync
        this._resetTransientInputState = this._resetTransientInputState.bind(this);
        window.addEventListener('resize', () => this.resize());
        document.addEventListener('visibilitychange', () => {
            if (!this.loop) return;
            const currentScene = this.sceneManager?.currentScene;
            const keepSimulationActive = !!currentScene?.shouldKeepRunningWhileHidden?.();
            const hiddenTickIntervalMs = Number.isFinite(currentScene?.getHiddenSimulationIntervalMs?.())
                ? Math.max(100, Math.round(currentScene.getHiddenSimulationIntervalMs()))
                : 250;
            if (document.visibilityState === 'hidden') {
                this._backgroundedAt = Date.now();
                this._resetTransientInputState('hidden');
                currentScene?.onVisibilityHidden?.({
                    hiddenAt: this._backgroundedAt,
                    keepSimulationActive
                });
                if (keepSimulationActive) {
                    this.loop.startBackgroundUpdates(hiddenTickIntervalMs);
                } else {
                    this.loop.pause();
                }
            } else {
                const resumedAt = Date.now();
                const hiddenAt = Number(this._backgroundedAt || 0);
                const hiddenDurationMs = hiddenAt > 0 ? Math.max(0, resumedAt - hiddenAt) : 0;
                this._backgroundedAt = 0;
                this.loop.stopBackgroundUpdates();
                this.loop.resume();
                currentScene?.onVisibilityVisible?.({
                    resumedAt,
                    hiddenDurationMs,
                    keepSimulationActive
                });
            }
        });
        window.addEventListener('blur', () => this._resetTransientInputState('blur'));
        document.documentElement.addEventListener('mouseleave', (e) => {
            if (e.relatedTarget === null && this.touch?.hasActiveMouseInteraction?.()) {
                this._resetTransientInputState('viewport_leave');
            }
        });

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

        // ... (empty to remove)

        // 1. Core Systems
        this.input = new InputManager();
        this.auth = new AuthManager();
        this.net = new NetworkManager();
        this.resources = new ResourceManager();
        this.monsterData = new MonsterDataManager(this.resources); // Initialize MonsterDataManager
        this.characterData = new CharacterDataManager(this.resources);
        this.itemData = new ItemDataManager(this.resources);
        this.story = new StoryManager(this); // Initialize StoryManager
        this.sound = new SoundManager(this.resources); // Initialize SoundManager
        this.quests = new QuestManager(this); // v2.2: Initialize QuestManager
        this.tutorial = new TutorialManager(this); // v2.3: Tutorial System

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
            (dt) => {
                this.sceneManager.update(dt);
                if (this.tutorial) this.tutorial.update(dt);
            },
            () => this.sceneManager.render(this.ctx)
        );
        const initialPerfProfile = this.getPerformanceProfile();
        this.loop.setMaxRenderFps(initialPerfProfile.maxRenderFps);
        this.loop.setUpdateFps(initialPerfProfile.maxUpdateFps);

        this.init();
    }

    _resetTransientInputState(reason = 'manual') {
        this.input?.releaseAllActions?.();
        this.localPlayer?.stopBasicAttackChanneling?.();
        this.localPlayer?.cancelFireballAim?.();
    }

    isTouchDevice() {
        return !!(
            window.matchMedia?.('(pointer: coarse)')?.matches
            || navigator.maxTouchPoints > 0
        );
    }

    isStandaloneLike() {
        return !!(
            window.matchMedia?.('(display-mode: standalone)')?.matches
            || window.matchMedia?.('(display-mode: fullscreen)')?.matches
            || window.matchMedia?.('(display-mode: minimal-ui)')?.matches
            || window.navigator.standalone
        );
    }

    isAppleMobileDevice() {
        const ua = navigator.userAgent || '';
        return /iPhone|iPad|iPod/i.test(ua)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    getPerformanceProfile() {
        const isTouchDevice = this.isTouchDevice();
        const isMobile = isTouchDevice && window.innerWidth <= 1024;
        const isStandalone = this.isStandaloneLike();
        const isAppleMobile = this.isAppleMobileDevice();
        const lowPowerPwaMode = isMobile;
        const aggressiveThermalMode = lowPowerPwaMode && (isStandalone || isAppleMobile);
        const reduceCombatEffects = !!this.ui?.getSetting?.('reducedEffects');
        const mobileDprCap = aggressiveThermalMode ? 1.5 : 1.85;

        return {
            isTouchDevice,
            isMobile,
            lowPowerPwaMode,
            reduceCombatEffects,
            // Mobile was clamped so low that the whole canvas was being upscaled,
            // which made sprites and canvas text visibly softer than desktop.
            maxMobileDpr: lowPowerPwaMode ? mobileDprCap : 1.5,
            maxRenderFps: isTouchDevice ? (lowPowerPwaMode ? (aggressiveThermalMode ? 45 : 50) : 60) : 0,
            maxUpdateFps: lowPowerPwaMode ? (aggressiveThermalMode ? 45 : 50) : 60
        };
    }

    createPerformanceTelemetryState() {
        return {
            windowMs: 60000,
            loopBuckets: new Map(),
            networkBuckets: new Map(),
            uiBuckets: new Map()
        };
    }

    _getTelemetryBucket(bucketMap, now = Date.now()) {
        const bucketTs = Math.floor(now / 1000) * 1000;
        let bucket = bucketMap.get(bucketTs);
        if (!bucket) {
            bucket = { ts: bucketTs };
            bucketMap.set(bucketTs, bucket);
        }
        this._pruneTelemetryBuckets(bucketMap, now);
        return bucket;
    }

    _pruneTelemetryBuckets(bucketMap, now = Date.now()) {
        const cutoff = now - this.performanceTelemetry.windowMs;
        for (const ts of bucketMap.keys()) {
            if (ts < cutoff) bucketMap.delete(ts);
        }
    }

    estimatePayloadBytes(payload) {
        try {
            const serialized = JSON.stringify(payload);
            if (!serialized) return 0;
            return (new TextEncoder()).encode(serialized).length;
        } catch (error) {
            return 0;
        }
    }

    recordLoopTelemetry({
        updateMs = 0,
        renderMs = 0,
        frameGapMs = 0,
        updateSteps = 0,
        backlogDrops = 0
    } = {}) {
        const bucket = this._getTelemetryBucket(this.performanceTelemetry.loopBuckets);
        bucket.updateMsTotal = (bucket.updateMsTotal || 0) + updateMs;
        bucket.renderMsTotal = (bucket.renderMsTotal || 0) + renderMs;
        bucket.updateSamples = (bucket.updateSamples || 0) + (updateSteps > 0 ? 1 : 0);
        bucket.renderSamples = (bucket.renderSamples || 0) + 1;
        bucket.maxFrameGapMs = Math.max(bucket.maxFrameGapMs || 0, frameGapMs || 0);
        bucket.backlogDrops = (bucket.backlogDrops || 0) + (backlogDrops || 0);
    }

    recordNetworkWrite(kind, payload, count = 1) {
        const bucket = this._getTelemetryBucket(this.performanceTelemetry.networkBuckets);
        const bytes = this.estimatePayloadBytes(payload);
        bucket.rtdbWrites = (bucket.rtdbWrites || 0) + count;
        bucket.estimatedBytes = (bucket.estimatedBytes || 0) + bytes;
        bucket.byType = bucket.byType || {};
        bucket.byType[kind] = (bucket.byType[kind] || 0) + count;
    }

    recordUiTick(kind, count = 1) {
        const bucket = this._getTelemetryBucket(this.performanceTelemetry.uiBuckets);
        bucket[kind] = (bucket[kind] || 0) + count;
    }

    getPerformanceSnapshot() {
        const aggregateNetworkByType = {};
        const now = Date.now();
        this._pruneTelemetryBuckets(this.performanceTelemetry.loopBuckets, now);
        this._pruneTelemetryBuckets(this.performanceTelemetry.networkBuckets, now);
        this._pruneTelemetryBuckets(this.performanceTelemetry.uiBuckets, now);
        const snapshot = {
            avgUpdateMs: 0,
            avgRenderMs: 0,
            maxFrameGapMs: 0,
            droppedFrameBursts: 0,
            rtdbWritesPerMin: 0,
            estimatedBytesPerMin: 0,
            movePacketsPerMin: 0,
            monsterWritesPerMin: 0,
            profileSavesPerMin: 0,
            hudUpdatesPerMin: 0,
            minimapUpdatesPerMin: 0,
            remoteUpdatesPerMin: 0
        };

        let totalUpdateMs = 0;
        let totalRenderMs = 0;
        let updateSamples = 0;
        let renderSamples = 0;

        this.performanceTelemetry.loopBuckets.forEach((bucket) => {
            totalUpdateMs += bucket.updateMsTotal || 0;
            totalRenderMs += bucket.renderMsTotal || 0;
            updateSamples += bucket.updateSamples || 0;
            renderSamples += bucket.renderSamples || 0;
            snapshot.maxFrameGapMs = Math.max(snapshot.maxFrameGapMs, bucket.maxFrameGapMs || 0);
            snapshot.droppedFrameBursts += bucket.backlogDrops || 0;
        });

        this.performanceTelemetry.networkBuckets.forEach((bucket) => {
            snapshot.rtdbWritesPerMin += bucket.rtdbWrites || 0;
            snapshot.estimatedBytesPerMin += bucket.estimatedBytes || 0;
            if (bucket.byType) {
                Object.entries(bucket.byType).forEach(([kind, value]) => {
                    aggregateNetworkByType[kind] = (aggregateNetworkByType[kind] || 0) + value;
                });
            }
        });

        this.performanceTelemetry.uiBuckets.forEach((bucket) => {
            snapshot.hudUpdatesPerMin += bucket.hud || 0;
            snapshot.minimapUpdatesPerMin += bucket.minimap || 0;
            snapshot.remoteUpdatesPerMin += bucket.remoteUpdates || 0;
        });

        snapshot.avgUpdateMs = updateSamples > 0 ? totalUpdateMs / updateSamples : 0;
        snapshot.avgRenderMs = renderSamples > 0 ? totalRenderMs / renderSamples : 0;
        snapshot.movePacketsPerMin = aggregateNetworkByType.move || 0;
        snapshot.monsterWritesPerMin = aggregateNetworkByType.monsterUpdate || 0;
        snapshot.profileSavesPerMin = aggregateNetworkByType.profileSave || 0;

        return snapshot;
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
        const perfProfile = this.getPerformanceProfile();
        const { isTouchDevice, isMobile, lowPowerPwaMode, reduceCombatEffects, maxMobileDpr, maxRenderFps, maxUpdateFps } = perfProfile;
        // v0.28.6: Adjust PC zoom to 0.8 for wider view (User Feedback)
        this.zoom = isMobile ? 0.7 : 0.8;
        this.isMobilePerformanceMode = isMobile;
        this.useReducedEffects = reduceCombatEffects;
        this.useAggressiveHudOptimization = lowPowerPwaMode;
        this.lowPowerPwaMode = lowPowerPwaMode;
        this.maxMobileDpr = maxMobileDpr;
        document.body?.classList.toggle('low-power-pwa', lowPowerPwaMode);

        const rawRatio = window.devicePixelRatio || 1;
        const ratio = isMobile ? Math.min(rawRatio, this.maxMobileDpr) : rawRatio;
        this.dpr = ratio; // Store for render loop

        // Internal resolution for HiDPI
        this.canvas.width = displayWidth * ratio;
        this.canvas.height = displayHeight * ratio;

        // Visual Display Size
        this.canvas.style.width = displayWidth + 'px';
        this.canvas.style.height = displayHeight + 'px';

        // Character/monster sprites are authored as pixel-art style frames.
        // Re-enabling smoothing on desktop makes them look blurred/torn during movement.
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.webkitImageSmoothingEnabled = false;
        this.ctx.mozImageSmoothingEnabled = false;
        this.ctx.msImageSmoothingEnabled = false;
        this.canvas.style.imageRendering = 'pixelated';

        if (this.loop) {
            this.loop.setMaxRenderFps(maxRenderFps);
            this.loop.setUpdateFps(maxUpdateFps);
        }

        if (this.camera) {
            this.camera.resize(displayWidth / this.zoom, displayHeight / this.zoom);
        }
    }

    async init() {
        this.updateLoading('리소스 다운로드 중...', 0);

        // v0.30.0: Centralized Pre-loading
        try {
            await this.resources.preloadCriticalAssets((pct) => {
                this.updateLoading('리소스 다운로드 중...', pct);
            });

            // v2.1: Load Emotes
            const emoteData = await this.resources.loadJSON('/assets/data/emotes/basic_emotes.json');
            this.emotes = Array.isArray(emoteData) ? emoteData : (emoteData?.emotes || []);

            // v2.2: Load Quest Definitions
            await this.quests.loadQuests();
            await this.itemData.loadAll();

        } catch (e) {
            Logger.error('Asset Preloading Partial failure', e);
        }

        this.updateLoading('시스템 초기화 중...', 100);

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
                this.net.disconnect();
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

    get explosions() {
        return (this.sceneManager?.currentScene?.explosions) || [];
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

    addExplosion(x, y, radius, options = {}) {
        if (this.sceneManager?.currentScene?.addExplosion) {
            this.sceneManager.currentScene.addExplosion(x, y, radius, options);
        }
    }

    shouldSuppressTransientWorldEffects() {
        const currentScene = this.sceneManager?.currentScene;
        if (typeof currentScene?.shouldSuppressTransientWorldEffects === 'function') {
            return !!currentScene.shouldSuppressTransientWorldEffects();
        }
        return typeof document !== 'undefined' ? !!document.hidden : false;
    }

    _handleCanvasInteraction(e) {
        if (this.ui?.isUiLayoutEditMode?.()) return;
        if (!this.sceneManager || !this.sceneManager.currentScene) return;
        this.sceneManager.handlePointerDown(e);
    }
}

// Start
window.game = new Game();
