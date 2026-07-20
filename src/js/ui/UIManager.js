import Logger from '../utils/Logger.js';
import FriendsUIController, { FRIENDS_UI_METHOD_NAMES } from './friends/FriendsUIController.js';

const OPTION_REROLL_STONE_ID = 'option_reroll_stone';

export class UIManager {
    constructor(game) {
        this.game = game;
        this.overlay = document.getElementById('popup-overlay');
        this.pendingStats = { vitality: 0, intelligence: 0, wisdom: 0, agility: 0 };
        this.statInsightPreviewShown = { vitality: false, intelligence: false, wisdom: false, agility: false };
        this.initialPoints = 0;
        this.isPaused = false;
        this.devMode = false;
        this.pendingLandscapeFullscreen = false;
        this.landscapeFullscreenDismissed = false;
        this._wasFullscreenActive = false;
        this.mobileOrientationPreference = this.isMobileLandscapeViewport() ? 'landscape' : 'portrait';
        this.transientOrientationPreference = null;
        this.transientOrientationLockUntil = 0;
        this.transientOrientationReleaseTimer = null;
        this.pcQuestClaimHandler = null;
        this.hudRefs = {};
        this.cooldownRefs = {};
        this.minimapCtx = null;
        this.minimapCanvas = null;
        this.lastMinimapSignature = null;
        this.lastHudSnapshot = null;
        this.lastCooldownUiUpdate = 0;
        this.lastDevOverlayUpdate = 0;
        this.selectedInventoryRef = null;
        this.pendingEnhancementStoneType = null;
        this.inventoryEnhancementAnimating = false;
        this.inventoryDragState = null;
        this.inventoryClickSuppressUntil = 0;
        this.questClaimAvailable = false;
        this.centerMessageQueue = [];
        this.centerMessageActive = false;
        this._centerMsgTimer = null;
        this._centerMsgFadeTimer = null;
        this.pendingExpGainHint = 0;
        this._pendingExpGainTimer = null;
        this.selectedFriendUid = null;
        this.friendsMobileView = 'list';
        this.friendWeaponTooltipAnchor = null;
        this.friendSearchResult = null;
        this.friendProfileCache = new Map();
        this.friendChatUid = null;
        this.friendChatReturnView = 'list';
        this.friendGiftKind = 'item';
        this.friendGiftSelection = null;
        this.friendAlertCount = 0;
        this.friendChatWindowState = {
            compact: false,
            minimized: false,
            unreadWhileMinimized: false,
            retainOnPopupToggle: false,
            scale: 1,
            left: null,
            top: null
        };
        this.partyPanelUiState = {
            minimized: false
        };
        this.browserBackExitGuardArmed = false;
        this.browserBackExitConfirmPending = false;
        this.browserBackExitGuardKey = '__yurikaWorldExitGuard';
        this.ignoreNextBrowserBackPopstate = false;
        this.pendingBrowserBackExitAction = null;
        this.gameExitSceneTransitioning = false;
        this.statusDevLookupExpanded = false;
        this.handleDesktopShortcutKeydown = this.handleDesktopShortcutKeydown.bind(this);
        this.refreshDesktopShortcutHints = this.refreshDesktopShortcutHints.bind(this);
        this.positionInventoryItemModal = this.positionInventoryItemModal.bind(this);
        this.positionSkillDetailModal = this.positionSkillDetailModal.bind(this);
        this.handleInventorySlotPointerMove = this.handleInventorySlotPointerMove.bind(this);
        this.handleInventorySlotPointerUp = this.handleInventorySlotPointerUp.bind(this);
        this.inputManager = game.input; // Local reference
        this.tutorialGuideState = null;
        this.tutorialHighlightLayer = null;
        this.tutorialHighlightTargets = [];
        this.tutorialHighlightState = { targets: [], mode: 'ring', label: '', avoidTargets: [], suppressDim: false };
        this.tutorialDimSuppressed = false;
        this.tutorialDimSuppressedStepId = '';
        this.tutorialGuideManualPosition = null;
        this.tutorialGuideDragState = {
            active: false,
            pointerId: null,
            offsetX: 0,
            offsetY: 0,
            stepId: '',
            captureTarget: null
        };
        this.floatingPanelDragState = {
            active: false,
            pointerId: null,
            offsetX: 0,
            offsetY: 0,
            panel: null,
            captureTarget: null
        };
        this.activeSkillDetailId = null;
        this.settingsStorageKey = 'yurika_settings_v1';
        this.uiLayoutStorageKey = 'yurika_ui_layout_v1';
        this.devAccessStateStorageKey = 'yurika_dev_access_guard_v1';
        this.devPassword = '3k78a4';
        this.devAccessGranted = false;
        this.devMaxFailures = 3;
        this.devLockoutMs = 5 * 60 * 1000;
        this.settings = this.loadSettings();
        this.devAccessState = this.loadDevAccessState();
        this.ensureFullscreenControlButtons();
        this.uiLayoutControlDefinitions = {
            'dev-overlay-panel': { label: '개발 오버레이', selector: '#dev-overlay', modes: ['desktop', 'mobilePortrait', 'mobileLandscape'], minScale: 0.65, maxScale: 2.4, scaleMode: 'transform', zIndex: 2305, margin: 8, requiresVisibleElement: true },
            'hud-top-bar': { label: '프로필/HP 패널', selector: '.top-bar', modes: ['desktop', 'mobilePortrait', 'mobileLandscape'], minScale: 0.65, maxScale: 1.8, scaleMode: 'transform' },
            'quest-panel': { label: '퀘스트창', selector: '.quest-list-panel', modes: ['desktop', 'mobilePortrait', 'mobileLandscape'], minScale: 0.65, maxScale: 1.8, scaleMode: 'transform', positioningContext: 'parent', parentSelector: '.left-ui-container' },
            'chat-panel': { label: '채팅창', selector: '.chat-window', modes: ['desktop', 'mobilePortrait', 'mobileLandscape'], minScale: 0.65, maxScale: 1.8, scaleMode: 'transform', positioningContext: 'parent', parentSelector: '.left-ui-container' },
            'minimap-panel': { label: '미니맵', selector: '#minimap-container', modes: ['desktop', 'mobilePortrait', 'mobileLandscape'], minScale: 0.65, maxScale: 1.8, scaleMode: 'transform', baseScaleByMode: { desktop: 1, mobilePortrait: 0.95, mobileLandscape: 1 } },
            'quick-menu-panel': { label: '메뉴 묶음', selector: '.minimap-menu', modes: ['desktop', 'mobilePortrait', 'mobileLandscape'], minScale: 0.7, maxScale: 1.8, scaleMode: 'transform' },
            joystick: { label: '조이스틱', selector: '#joystick-container', modes: ['mobilePortrait', 'mobileLandscape'], minScale: 0.7, maxScale: 1.8, scaleMode: 'transform' },
            'action-skill-u': { label: '스킬 U', selector: '#action-skill-u', modes: ['desktop', 'mobilePortrait', 'mobileLandscape'], minScale: 0.7, maxScale: 1.8 },
            'action-skill-k': { label: '스킬 K', selector: '#action-skill-k', modes: ['desktop', 'mobilePortrait', 'mobileLandscape'], minScale: 0.7, maxScale: 1.8 },
            'action-skill-h': { label: '스킬 H', selector: '#action-skill-h', modes: ['desktop', 'mobilePortrait', 'mobileLandscape'], minScale: 0.7, maxScale: 1.8 },
            'action-attack-j': { label: '기본 공격', selector: '#action-attack-j', modes: ['desktop', 'mobilePortrait', 'mobileLandscape'], minScale: 0.7, maxScale: 1.8 },
            'action-auto-toggle': { label: '오토 버튼', selector: '#action-auto-toggle', modes: ['desktop', 'mobilePortrait', 'mobileLandscape'], minScale: 0.7, maxScale: 1.8 }
        };
        this.uiLayoutPresetDefaults = {
            mobilePortrait: {
                'action-attack-j': { left: 0.7177662054697672, top: 0.7758404864091559, scale: 1 },
                'action-auto-toggle': { left: 0.791015625, top: 0.5501608568881885, scale: 1 },
                'action-skill-h': { left: 0.442626953125, top: 0.7968302932761088, scale: 1 },
                'action-skill-k': { left: 0.7810763915379842, top: 0.6258717811158798, scale: 1 },
                'action-skill-u': { left: 0.5506184895833334, top: 0.6757644849785408, scale: 1 },
                'chat-panel': { left: 0.03125, top: 0.29018689156942956, scale: 1 },
                'hud-top-bar': { left: 0.026041666666666668, top: 0.01430615164520744, scale: 1 },
                joystick: { left: 0.041666666666666664, top: 0.6800786838340487, scale: 0.96 },
                'minimap-panel': { left: 0.7319921851158142, top: 0.017167381974248927, scale: 0.87 },
                'quest-panel': { left: 0.026041666666666668, top: 0.10014306151645208, scale: 1 },
                'quick-menu-panel': { left: 0.145263671875, top: 0.9334007012144862, scale: 0.86 },
            },
            mobileLandscape: {
                'action-attack-j': { left: 0.7816586239103362, top: 0.6424967447916666, scale: 0.85 },
                'action-auto-toggle': { left: 0.7998622262463029, top: 0.2155175805091858, scale: 1 },
                'action-skill-h': { left: 0.6534674657534246, top: 0.7356770833333334, scale: 0.85 },
                'action-skill-k': { left: 0.787963107098381, top: 0.441162109375, scale: 0.85 },
                'action-skill-u': { left: 0.6885118306351183, top: 0.527587890625, scale: 0.85 },
                'chat-panel': { left: 0.3316274906600249, top: 0.721435546875, scale: 1 },
                'hud-top-bar': { left: 0.01, top: 0.020833333333333332, scale: 1 },
                joystick: { left: 0.034869240348692404, top: 0.6041666666666666, scale: 1 },
                'minimap-panel': { left: 0.8844956413449564, top: 0.03125, scale: 0.79 },
                'quest-panel': { left: 0.014943960149439602, top: 0.18888346354166666, scale: 1 },
                'quick-menu-panel': { left: 0.8058647260273972, top: 0.3046875, scale: 0.84 }
            }
        };
        this.uiLayoutEditMode = false;
        this.uiLayoutDraft = null;
        this.uiLayoutDirty = false;
        this.uiLayoutDefaultCache = {};
        this.uiLayoutSelectedControlId = null;
        this.uiLayoutActiveMode = this.getUiLayoutMode();
        this.uiLayoutResetModes = new Set();
        this.uiLayoutDragState = {
            active: false,
            pointerId: null,
            controlId: null,
            offsetX: 0,
            offsetY: 0,
            metrics: null,
            width: 0,
            height: 0,
            margin: 12,
            captureTarget: null
        };
        this.friendsUI = new FriendsUIController(this);
        FRIENDS_UI_METHOD_NAMES.forEach((methodName) => {
            this[methodName] = this.friendsUI[methodName];
        });
        this.refreshTutorialHighlight = this.refreshTutorialHighlight.bind(this);
        this.refreshTutorialGuideLayout = this.refreshTutorialGuideLayout.bind(this);
        this.handleTutorialGuideDragMove = this.handleTutorialGuideDragMove.bind(this);
        this.handleTutorialGuideDragEnd = this.handleTutorialGuideDragEnd.bind(this);
        this.handleFloatingPanelDragMove = this.handleFloatingPanelDragMove.bind(this);
        this.handleFloatingPanelDragEnd = this.handleFloatingPanelDragEnd.bind(this);
        this.handleBrowserBackPopState = this.handleBrowserBackPopState.bind(this);
        this.handleUiLayoutControlPointerDown = this.handleUiLayoutControlPointerDown.bind(this);
        this.handleUiLayoutControlPointerMove = this.handleUiLayoutControlPointerMove.bind(this);
        this.handleUiLayoutControlPointerUp = this.handleUiLayoutControlPointerUp.bind(this);
        this.setupEventListeners();
        this.setupFullscreenListeners();
        this.setupDevModeListeners();
        const refreshTutorialOverlays = () => {
            this.positionInventoryItemModal();
            this.positionSkillDetailModal();
            this.refreshTutorialHighlight();
            this.refreshTutorialGuideLayout();
            this.refreshDesktopShortcutHints();
            this.refreshUiLayoutForViewport();
            this.syncFriendsPopupLayout();
            this.syncStatusDevLookupVisibility();
        };
        window.addEventListener('resize', refreshTutorialOverlays);
        window.addEventListener('orientationchange', refreshTutorialOverlays);
        document.addEventListener('fullscreenchange', refreshTutorialOverlays);
        document.addEventListener('webkitfullscreenchange', refreshTutorialOverlays);
        this.applySettings({ refreshGame: false, syncUi: true });

        if (this.isStandaloneDisplayMode()) {
            this.scheduleOrientationLockRefresh();
        }

        // v0.00.63: Global UI Audio & Visual Feedback
        if (this.tooltip) {
            this.tooltip.style.opacity = '0';
        }

        // v2.1: Dialog System Elements
        this.dialogBox = document.getElementById('dialog-box');
        this.dialogText = document.getElementById('dialog-text');
        this.dialogName = document.getElementById('dialog-name');
        this.dialogNext = document.getElementById('dialog-next');

        if (this.dialogNext) {
            this.dialogNext.addEventListener('click', () => this.advanceDialog());
        }

        this.currentDialogQueue = [];
        this.waitingForOption = false;
        this.storyDialogActive = false;

        // v0.00.63: Global UI Audio & Visual Feedback Delegation
        this.setupGlobalInteractions();

        // v2.1: Emote UI
        this.setupEmoteUI();
        this.setupLandscapeChatInteractions();
        this.setupInventoryInteractions();
        this.setupFriendsUI();
    }

    getHudRef(key, selector, lookup = 'query') {
        const current = this.hudRefs[key];
        if (current && current.isConnected) return current;

        const next = lookup === 'id'
            ? document.getElementById(selector)
            : document.querySelector(selector);
        this.hudRefs[key] = next || null;
        return next || null;
    }

    getCooldownRefs(key) {
        const cached = this.cooldownRefs[key];
        if (cached?.button?.isConnected) return cached;

        const button = document.querySelector(`[data-key="${key}"]`);
        const refs = {
            button: button || null,
            overlay: button?.querySelector('.cooldown-overlay') || null,
            timeText: button?.querySelector('.cooldown-time') || null
        };
        this.cooldownRefs[key] = refs;
        return refs;
    }

    clampNumericSetting(value, fallback, min, max) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return fallback;
        return Math.min(max, Math.max(min, numeric));
    }

    getDefaultSettings() {
        return {
            masterVolume: 40,
            basicAttackSound: 'deep_shock',
            muted: false,
            autoFullscreen: true,
            orientationLock: false,
            reducedEffects: false,
            desktopShortcutHints: true,
            developerLogLevel: 'warn',
            cameraViewRange: 100,
            chatOpacity: 100,
            friendsOpacity: 100,
            friendCompactOpacity: 82,
            questOpacity: 100,
            minimapOpacity: 100,
            actionOpacity: 82,
            menuOpacity: 88,
            mobileUiOpacityPresetVersion: 2
        };
    }

    getAllowedLogLevels() {
        return ['error', 'warn', 'info', 'debug'];
    }

    getBasicAttackSoundOptions() {
        return [
            { value: 'deep_shock', label: '\uBB35\uC9C1\uD55C \uC800\uC74C \uC804\uACA9' },
            { value: 'storm_core', label: '\uAE4A\uC740 \uC2A4\uD1B0 \uCF54\uC5B4' },
            { value: 'coil_burst', label: '\uB450\uD130\uC6B4 \uCF54\uC77C \uBC84\uC2A4\uD2B8' },
            { value: 'arc_pulse', label: '\uAD75\uC740 \uC544\uD06C \uD384\uC2A4' },
            { value: 'classic_arc', label: '\uD074\uB798\uC2DD \uC804\uACA9' }
        ];
    }

    sanitizeBasicAttackSound(value, fallback = 'deep_shock') {
        const normalized = String(value || '').trim();
        return this.getBasicAttackSoundOptions().some((option) => option.value === normalized)
            ? normalized
            : fallback;
    }

    ensureBasicAttackSoundOptions() {
        const select = document.getElementById('settings-basic-attack-sound');
        if (!select) return;

        const options = this.getBasicAttackSoundOptions();
        const currentSignature = Array.from(select.options)
            .map((option) => `${option.value}:${option.textContent}`)
            .join('|');
        const nextSignature = options
            .map((option) => `${option.value}:${option.label}`)
            .join('|');

        if (currentSignature === nextSignature) return;

        select.textContent = '';
        options.forEach((option) => {
            const element = document.createElement('option');
            element.value = option.value;
            element.textContent = option.label;
            select.appendChild(element);
        });
    }

    sanitizeLogLevel(level, fallback = 'warn') {
        return this.getAllowedLogLevels().includes(level) ? level : fallback;
    }

    sanitizeSettings(candidate = {}) {
        const defaults = this.getDefaultSettings();
        const normalized = {
            masterVolume: this.clampNumericSetting(candidate.masterVolume, defaults.masterVolume, 0, 100),
            basicAttackSound: this.sanitizeBasicAttackSound(candidate.basicAttackSound, defaults.basicAttackSound),
            muted: !!candidate.muted,
            autoFullscreen: candidate.autoFullscreen !== false,
            orientationLock: !!candidate.orientationLock,
            reducedEffects: !!candidate.reducedEffects,
            desktopShortcutHints: candidate.desktopShortcutHints !== false,
            developerLogLevel: this.sanitizeLogLevel(candidate.developerLogLevel, defaults.developerLogLevel),
            cameraViewRange: this.clampNumericSetting(candidate.cameraViewRange, defaults.cameraViewRange, 80, 150),
            chatOpacity: this.clampNumericSetting(candidate.chatOpacity, defaults.chatOpacity, 35, 100),
            friendsOpacity: this.clampNumericSetting(candidate.friendsOpacity, defaults.friendsOpacity, 45, 100),
            friendCompactOpacity: this.clampNumericSetting(candidate.friendCompactOpacity, defaults.friendCompactOpacity, 45, 100),
            questOpacity: this.clampNumericSetting(candidate.questOpacity, defaults.questOpacity, 35, 100),
            minimapOpacity: this.clampNumericSetting(candidate.minimapOpacity, defaults.minimapOpacity, 35, 100),
            actionOpacity: this.clampNumericSetting(candidate.actionOpacity, defaults.actionOpacity, 35, 100),
            menuOpacity: this.clampNumericSetting(candidate.menuOpacity, defaults.menuOpacity, 35, 100),
            mobileUiOpacityPresetVersion: Math.max(0, Math.floor(Number(candidate.mobileUiOpacityPresetVersion) || 0))
        };

        return this.applyLegacyMobileOpacityDefaults(normalized, candidate);
    }

    loadSettings() {
        try {
            const raw = localStorage.getItem(this.settingsStorageKey);
            if (!raw) return this.getDefaultSettings();
            const nextSettings = this.sanitizeSettings(JSON.parse(raw));
            const normalizedRaw = this.serializeSettings(nextSettings);
            if (normalizedRaw && normalizedRaw !== raw) {
                localStorage.setItem(this.settingsStorageKey, normalizedRaw);
            }
            return nextSettings;
        } catch (error) {
            Logger.warn('[UIManager] Failed to load settings', error);
            return this.getDefaultSettings();
        }
    }

    applyLegacyMobileOpacityDefaults(nextSettings = {}, candidate = {}) {
        const defaults = this.getDefaultSettings();
        const presetVersion = Number(candidate.mobileUiOpacityPresetVersion) || 0;
        const hasActionOpacity = Object.prototype.hasOwnProperty.call(candidate, 'actionOpacity');
        const hasMenuOpacity = Object.prototype.hasOwnProperty.call(candidate, 'menuOpacity');
        const actionOpacity = Number(candidate.actionOpacity);
        const menuOpacity = Number(candidate.menuOpacity);
        const shouldAdoptNewDefaults = presetVersion < defaults.mobileUiOpacityPresetVersion
            && ((!hasActionOpacity && !hasMenuOpacity) || (actionOpacity === 100 && menuOpacity === 100));

        return {
            ...nextSettings,
            actionOpacity: shouldAdoptNewDefaults ? defaults.actionOpacity : nextSettings.actionOpacity,
            menuOpacity: shouldAdoptNewDefaults ? defaults.menuOpacity : nextSettings.menuOpacity,
            mobileUiOpacityPresetVersion: defaults.mobileUiOpacityPresetVersion
        };
    }

    ensureFullscreenControlButtons() {
        const fullscreenButton = document.getElementById('btn-fullscreen');
        if (!fullscreenButton || document.getElementById('btn-fullscreen-exit')) return;

        const exitButton = document.createElement('div');
        exitButton.id = 'btn-fullscreen-exit';
        exitButton.className = 'menu-btn fullscreen-exit-toggle hidden';
        exitButton.title = '나가기';
        exitButton.setAttribute('aria-label', '나가기');

        const icon = document.createElement('div');
        icon.className = 'menu-icon';
        icon.textContent = 'X';
        exitButton.appendChild(icon);

        fullscreenButton.insertAdjacentElement('afterend', exitButton);
    }

    persistSettings(options = {}) {
        const { syncProfile = true, debounceMs = 1200, reason = 'client_settings_save' } = options;
        try {
            localStorage.setItem(this.settingsStorageKey, JSON.stringify(this.settings));
        } catch (error) {
            Logger.warn('[UIManager] Failed to save settings', error);
        }

        if (syncProfile) {
            this.persistSettingsToProfile({ debounceMs, reason });
        }
    }

    persistSettingsToProfile(options = {}) {
        const player = this.game?.localPlayer;
        if (!player?.saveProfilePatch) return false;

        player.clientSettings = this.cloneStructuredData(this.settings);
        player.saveProfilePatch(['clientSettings'], {
            debounceMs: Number.isFinite(options.debounceMs) ? Math.max(0, Number(options.debounceMs)) : 1200,
            reason: options.reason || 'client_settings_save'
        });
        return true;
    }

    serializeSettings(settings = this.settings) {
        try {
            return JSON.stringify(this.sanitizeSettings(settings));
        } catch (error) {
            Logger.warn('[UIManager] Failed to serialize settings', error);
            return '';
        }
    }

    getDefaultDevAccessState() {
        return {
            failedAttempts: 0,
            lockUntil: 0
        };
    }

    sanitizeDevAccessState(candidate = {}) {
        const now = Date.now();
        const failedAttempts = Math.max(0, Math.floor(Number(candidate.failedAttempts) || 0));
        const lockUntil = Math.max(0, Number(candidate.lockUntil) || 0);

        if (lockUntil > now) {
            return {
                failedAttempts,
                lockUntil
            };
        }

        return this.getDefaultDevAccessState();
    }

    loadDevAccessState() {
        try {
            const raw = localStorage.getItem(this.devAccessStateStorageKey);
            if (!raw) return this.getDefaultDevAccessState();
            const parsed = this.sanitizeDevAccessState(JSON.parse(raw));
            const normalized = JSON.stringify(parsed);
            if (normalized !== raw) {
                localStorage.setItem(this.devAccessStateStorageKey, normalized);
            }
            return parsed;
        } catch (error) {
            Logger.warn('[UIManager] Failed to load developer access state', error);
            return this.getDefaultDevAccessState();
        }
    }

    persistDevAccessState() {
        this.devAccessState = this.sanitizeDevAccessState(this.devAccessState);
        try {
            localStorage.setItem(this.devAccessStateStorageKey, JSON.stringify(this.devAccessState));
        } catch (error) {
            Logger.warn('[UIManager] Failed to save developer access state', error);
        }
    }

    getDevAccessRemainingMs() {
        this.devAccessState = this.sanitizeDevAccessState(this.devAccessState);
        return Math.max(0, Number(this.devAccessState.lockUntil || 0) - Date.now());
    }

    isDeveloperAccessLocked() {
        return this.getDevAccessRemainingMs() > 0;
    }

    hasDeveloperAccess() {
        if (this.isDeveloperAccessLocked()) {
            this.devAccessGranted = false;
        }
        return !!this.devAccessGranted;
    }

    getRemainingDeveloperAttempts() {
        return Math.max(0, this.devMaxFailures - Number(this.devAccessState.failedAttempts || 0));
    }

    formatDurationMs(ms = 0) {
        const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}분 ${String(seconds).padStart(2, '0')}초`;
    }

    setDevMode(active, options = {}) {
        const { announce = true } = options;
        const nextState = !!active && this.hasDeveloperAccess();
        const changed = this.devMode !== nextState;
        this.devMode = nextState;

        const btnAccount = document.getElementById('reset-account-btn');
        const btnStat = document.getElementById('reset-stat-btn');
        if (btnAccount) {
            btnAccount.classList.toggle('hidden', !this.devMode);
            if (!btnAccount.dataset.bound) {
                btnAccount.onclick = () => this.handleDevAccountReset();
                btnAccount.dataset.bound = 'true';
            }
        }
        if (btnStat) {
            btnStat.classList.toggle('hidden', !this.devMode);
            if (!btnStat.dataset.bound) {
                btnStat.onclick = () => this.handleDevCharacterReset();
                btnStat.dataset.bound = 'true';
            }
        }

        if (changed && announce) {
            this.logSystemMessage(`개발자 모드 ${this.devMode ? '활성화' : '비활성화'}`);
        }

        this.syncDevOverlayVisibility();
        if (this.devMode) this.updateDevOverlay();
        this.syncDeveloperSettingsUi();
        return this.devMode;
    }

    lockDeveloperAccess(options = {}) {
        const { announce = true } = options;
        this.devAccessGranted = false;
        this.setDevMode(false, { announce: false });
        if (announce) {
            this.logSystemMessage('개발자 모드 권한을 잠갔습니다.');
        }
        this.syncDeveloperSettingsUi();
        this.syncStatusDevLookupVisibility();
    }

    syncDeveloperSettingsUi() {
        const section = document.getElementById('settings-dev-section');
        const statusEl = document.getElementById('settings-dev-access-status');
        const helpEl = document.getElementById('settings-dev-access-help');
        const logLevelSelect = document.getElementById('settings-log-level');

        const remainingMs = this.getDevAccessRemainingMs();
        const locked = remainingMs > 0;
        const granted = this.hasDeveloperAccess();
        const visible = this.devMode && granted;

        if (section) {
            section.classList.toggle('hidden', !visible);
        }

        if (statusEl) {
            statusEl.classList.toggle('is-active', visible);
            statusEl.classList.toggle('is-locked', locked);
            statusEl.textContent = locked ? `잠금 (${this.formatDurationMs(remainingMs)})` : '개발자 모드 활성';
        }

        if (helpEl) {
            if (locked) {
                helpEl.textContent = `비밀번호 3회 실패로 ${this.formatDurationMs(remainingMs)} 동안 개발자모드 진입이 잠겼습니다.`;
            } else {
                helpEl.textContent = '프로필 사진을 다시 누르면 개발자 모드를 빠르게 켜거나 끌 수 있습니다.';
            }
        }

        if (logLevelSelect) logLevelSelect.value = this.getSetting('developerLogLevel');
    }

    tryUnlockDeveloperAccess(password = '') {
        const normalizedPassword = String(password || '').trim();
        if (this.isDeveloperAccessLocked()) {
            return { ok: false, reason: 'locked', remainingMs: this.getDevAccessRemainingMs() };
        }

        if (normalizedPassword !== this.devPassword) {
            const nextFailures = (this.devAccessState.failedAttempts || 0) + 1;
            if (nextFailures >= this.devMaxFailures) {
                this.devAccessState = {
                    failedAttempts: 0,
                    lockUntil: Date.now() + this.devLockoutMs
                };
                this.persistDevAccessState();
                this.syncDeveloperSettingsUi();
                return { ok: false, reason: 'locked', remainingMs: this.getDevAccessRemainingMs() };
            }

            this.devAccessState = {
                failedAttempts: nextFailures,
                lockUntil: 0
            };
            this.persistDevAccessState();
            this.syncDeveloperSettingsUi();
            return {
                ok: false,
                reason: 'invalid_password',
                remainingAttempts: this.devMaxFailures - nextFailures
            };
        }

        this.devAccessGranted = true;
        this.devAccessState = this.getDefaultDevAccessState();
        this.persistDevAccessState();
        this.syncDeveloperSettingsUi();
        return { ok: true };
    }

    showDeveloperAccessPrompt() {
        if (this.isDeveloperAccessLocked()) {
            this.showGenericModal(
                '개발자 모드 잠금',
                `비밀번호 3회 실패로 인해 ${this.formatDurationMs(this.getDevAccessRemainingMs())} 동안 개발자모드 진입이 잠겼습니다.`,
                null,
                null,
                { hideNo: true, yesText: '확인' }
            );
            return;
        }

        const renderPromptHtml = (feedbackText = '', isError = false) => `
            <div class="dev-auth-dialog">
                <p class="dev-auth-copy">개발자 모드에 들어가려면 암호를 입력하세요.</p>
                <label class="dev-auth-label" for="dev-auth-password-input">개발자 암호</label>
                <input id="dev-auth-password-input" class="dev-auth-input" type="password" autocomplete="off" placeholder="암호 입력">
                <p id="dev-auth-feedback" class="dev-auth-feedback${isError ? ' is-error' : ''}">${feedbackText || `남은 시도 ${this.getRemainingDeveloperAttempts()}회`}</p>
            </div>
        `;

        const focusPasswordInput = () => {
            const passwordInput = document.getElementById('dev-auth-password-input');
            if (!passwordInput) return;
            passwordInput.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                document.getElementById('generic-modal-yes')?.click();
            });
            requestAnimationFrame(() => {
                passwordInput.focus();
                passwordInput.select?.();
            });
        };

        this.showGenericModal(
            '개발자 모드',
            renderPromptHtml(),
            async () => {
                const passwordInput = document.getElementById('dev-auth-password-input');
                const feedbackEl = document.getElementById('dev-auth-feedback');
                const yesButton = document.getElementById('generic-modal-yes');
                const result = this.tryUnlockDeveloperAccess(passwordInput?.value || '');

                if (result.ok) {
                    this.logSystemMessage('개발자 모드 인증이 완료되었습니다.');
                    this.setDevMode(true, { announce: true });
                    return true;
                }

                if (feedbackEl) {
                    feedbackEl.classList.add('is-error');
                    feedbackEl.textContent = result.reason === 'locked'
                        ? `비밀번호 3회 실패로 ${this.formatDurationMs(result.remainingMs)} 동안 잠겼습니다.`
                        : `개발자 암호가 올바르지 않습니다. 남은 시도 ${result.remainingAttempts}회`;
                }

                if (result.reason === 'locked') {
                    if (passwordInput) passwordInput.disabled = true;
                    if (yesButton) yesButton.disabled = true;
                } else if (passwordInput) {
                    passwordInput.value = '';
                    passwordInput.focus();
                }

                return false;
            },
            null,
            {
                hideNo: false,
                yesText: '입장',
                noText: '취소',
                allowHtml: true,
                onShow: focusPasswordInput
            }
        );
    }

    getSetting(key) {
        if (!this.settings) {
            this.settings = this.getDefaultSettings();
        }
        return this.settings[key];
    }

    getCameraViewRangePercent() {
        return this.clampNumericSetting(this.getSetting('cameraViewRange'), 100, 80, 150);
    }

    updateSetting(key, value, options = {}) {
        const { refreshGame = false } = options;
        const previousSerialized = this.serializeSettings(this.settings);
        const nextSettings = this.sanitizeSettings({
            ...this.settings,
            [key]: value
        });
        const nextSerialized = this.serializeSettings(nextSettings);
        if (previousSerialized === nextSerialized) {
            this.applySettings({ refreshGame, syncUi: true });
            return;
        }
        this.settings = nextSettings;
        this.persistSettings();
        this.applySettings({ refreshGame, syncUi: true });
    }

    applySettings(options = {}) {
        const { refreshGame = false, syncUi = false } = options;
        const root = document.documentElement;
        const chatOpacity = (this.getSetting('chatOpacity') / 100).toFixed(2);
        const friendsOpacity = (this.getSetting('friendsOpacity') / 100).toFixed(2);
        const friendCompactOpacity = (this.getSetting('friendCompactOpacity') / 100).toFixed(2);
        const questOpacity = (this.getSetting('questOpacity') / 100).toFixed(2);
        const minimapOpacity = (this.getSetting('minimapOpacity') / 100).toFixed(2);
        const actionOpacity = (this.getSetting('actionOpacity') / 100).toFixed(2);
        const menuOpacity = (this.getSetting('menuOpacity') / 100).toFixed(2);

        Logger.setLevel(this.getSetting('developerLogLevel'));
        root.style.setProperty('--ui-chat-opacity', chatOpacity);
        root.style.setProperty('--ui-friends-opacity', friendsOpacity);
        root.style.setProperty('--ui-friend-compact-opacity', friendCompactOpacity);
        root.style.setProperty('--ui-quest-opacity', questOpacity);
        root.style.setProperty('--ui-minimap-opacity', minimapOpacity);
        root.style.setProperty('--ui-action-opacity', actionOpacity);
        root.style.setProperty('--ui-menu-opacity', menuOpacity);

        this.game.sound?.setMasterVolume?.((this.getSetting('masterVolume') || 0) / 100);
        this.game.sound?.setMuted?.(this.getSetting('muted'));
        this.friendsUI?.syncFriendChatOpacityUi?.(this.getSetting('friendCompactOpacity'));

        if (this.getSetting('orientationLock')) {
            this.mobileOrientationPreference = this.getCurrentMobileOrientationPreference();
        }

        if (syncUi) {
            this.syncSettingsUi();
        }

        this.updateLandscapeAutoFullscreen();
        this.syncOrientationLock();
        this.syncMobileEnvironmentClasses();
        this.refreshDesktopShortcutHints();

        if (refreshGame) {
            this.game.resize?.();
        }
    }

    syncSettingsUi() {
        this.ensureBasicAttackSoundOptions();

        const bindings = [
            ['settings-master-volume', 'masterVolume', 'settings-master-volume-value', '%'],
            ['settings-camera-view-range', 'cameraViewRange', 'settings-camera-view-range-value', '%'],
            ['settings-chat-opacity', 'chatOpacity', 'settings-chat-opacity-value', '%'],
            ['settings-friends-opacity', 'friendsOpacity', 'settings-friends-opacity-value', '%'],
            ['settings-friend-compact-opacity', 'friendCompactOpacity', 'settings-friend-compact-opacity-value', '%'],
            ['settings-quest-opacity', 'questOpacity', 'settings-quest-opacity-value', '%'],
            ['settings-minimap-opacity', 'minimapOpacity', 'settings-minimap-opacity-value', '%'],
            ['settings-action-opacity', 'actionOpacity', 'settings-action-opacity-value', '%'],
            ['settings-menu-opacity', 'menuOpacity', 'settings-menu-opacity-value', '%']
        ];

        bindings.forEach(([inputId, key, valueId, suffix]) => {
            const input = document.getElementById(inputId);
            const valueEl = document.getElementById(valueId);
            const value = this.getSetting(key);
            if (input) input.value = String(value);
            if (valueEl) valueEl.textContent = `${value}${suffix}`;
        });

        const checkboxBindings = [
            ['settings-muted', 'muted'],
            ['settings-auto-fullscreen', 'autoFullscreen'],
            ['settings-orientation-lock', 'orientationLock'],
            ['settings-reduced-effects', 'reducedEffects'],
            ['settings-shortcut-hints', 'desktopShortcutHints']
        ];

        checkboxBindings.forEach(([inputId, key]) => {
            const input = document.getElementById(inputId);
            if (input) input.checked = !!this.getSetting(key);
        });

        const logLevelSelect = document.getElementById('settings-log-level');
        if (logLevelSelect) logLevelSelect.value = this.getSetting('developerLogLevel');

        const basicAttackSoundSelect = document.getElementById('settings-basic-attack-sound');
        if (basicAttackSoundSelect) basicAttackSoundSelect.value = this.getSetting('basicAttackSound');

        this.syncDeveloperSettingsUi();
        this.syncUiLayoutEditor();
    }

    cloneStructuredData(value) {
        if (value == null || typeof value !== 'object') return value;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            Logger.warn('[UIManager] Failed to clone structured data', error);
            return value;
        }
    }

    getUiLayoutMode() {
        const isTouch = this.game?.isTouchDevice?.()
            || window.matchMedia?.('(pointer: coarse)')?.matches
            || navigator.maxTouchPoints > 0;
        const isMobileWidth = window.innerWidth <= 1024;
        if (isTouch && isMobileWidth) {
            return this.isMobileLandscapeViewport() ? 'mobileLandscape' : 'mobilePortrait';
        }
        return 'desktop';
    }

    getUiLayoutModeLabel(mode = this.getUiLayoutMode()) {
        if (mode === 'mobilePortrait') return '모바일 세로';
        if (mode === 'mobileLandscape') return '모바일 가로';
        return '데스크톱';
    }

    getUiLayoutEditorHelpText(mode = this.getUiLayoutMode()) {
        if (mode === 'mobilePortrait') {
            return '버튼이나 패널을 터치해 선택한 뒤 끌어서 위치를 바꾸세요. 편집 창은 상단 바를 잡고 다른 곳으로 옮길 수 있습니다.';
        }
        if (mode === 'mobileLandscape') {
            return '가로 화면에서는 공간이 좁으니 필요한 영역만 빠르게 선택해 옮기고, 편집 창은 상단 바를 드래그해 시야를 가리지 않게 조정하세요.';
        }
        return '조절할 패널이나 버튼을 직접 터치하거나 드래그해 위치를 바꾸고, 위 슬라이더로 크기를 조정하세요. 저장할 때만 계정 DB에 반영됩니다.';
    }

    resetUiLayoutEditorWindowPosition() {
        const editorCard = document.querySelector('#ui-layout-editor .ui-layout-editor-card');
        if (!editorCard) return;
        ['position', 'left', 'top', 'right', 'bottom', 'transform', 'margin'].forEach((property) => {
            editorCard.style.removeProperty(property);
        });
        editorCard.classList.remove('floating-panel-dragging');
    }

    refreshUiLayoutEditorWindowLayout(options = {}) {
        const editor = document.getElementById('ui-layout-editor');
        const editorCard = editor?.querySelector?.('.ui-layout-editor-card');
        const mode = this.getUiLayoutMode();

        if (editor) {
            editor.dataset.layoutMode = mode;
        }

        const help = document.getElementById('ui-layout-editor-help-text');
        if (help) {
            help.textContent = this.getUiLayoutEditorHelpText(mode);
        }

        const dragText = document.getElementById('ui-layout-editor-drag-text');
        if (dragText) {
            dragText.textContent = mode === 'desktop' ? '상단 바 드래그' : '창 이동';
        }

        if (!editorCard) return;

        if (options.resetPosition) {
            this.resetUiLayoutEditorWindowPosition();
            return;
        }

        if ((editorCard.style.position || '').trim() !== 'fixed') return;

        const rect = editorCard.getBoundingClientRect();
        const margin = mode === 'desktop' ? 18 : 10;
        const clamped = this.clampFloatingPanelPosition(rect.left, rect.top, rect.width, rect.height, margin);
        editorCard.style.left = `${clamped.left}px`;
        editorCard.style.top = `${clamped.top}px`;
        editorCard.style.right = 'auto';
        editorCard.style.bottom = 'auto';
        editorCard.style.transform = 'none';
        editorCard.style.margin = '0';
    }

    isUiLayoutEditMode() {
        return !!this.uiLayoutEditMode;
    }

    getUiLayoutControlsForMode(mode = this.getUiLayoutMode()) {
        return Object.entries(this.uiLayoutControlDefinitions)
            .filter(([controlId, definition]) => {
                if (!definition.modes.includes(mode)) return false;
                if (!definition.requiresVisibleElement) return true;
                const element = this.getUiLayoutControlElement(controlId);
                return !!element && !element.classList.contains('hidden');
            });
    }

    getDefaultUiLayoutControlId(mode = this.getUiLayoutMode()) {
        const controls = this.getUiLayoutControlsForMode(mode);
        return controls.find(([controlId]) => controlId !== 'version-info-badge')?.[0]
            || controls[0]?.[0]
            || null;
    }

    getUiLayoutPresetForMode(mode = this.getUiLayoutMode()) {
        const rawPreset = this.uiLayoutPresetDefaults?.[mode];
        if (!rawPreset || typeof rawPreset !== 'object') return null;

        const preset = {};
        this.getUiLayoutControlsForMode(mode).forEach(([controlId, definition]) => {
            const entry = this.sanitizeUiLayoutEntry(rawPreset[controlId], definition);
            if (entry) preset[controlId] = entry;
        });

        if (Object.keys(preset).length === 0) return null;
        return this.cloneStructuredData(preset) || preset;
    }

    getUiLayoutControlElement(controlId) {
        const definition = this.uiLayoutControlDefinitions[controlId];
        if (definition?.selector) {
            return document.querySelector(definition.selector);
        }
        if (controlId === 'joystick') {
            return document.getElementById('joystick-container');
        }
        return document.getElementById(controlId);
    }

    getUiLayoutContextElement(controlId) {
        const definition = this.uiLayoutControlDefinitions[controlId];
        if (!definition?.parentSelector) return null;
        return document.querySelector(definition.parentSelector);
    }

    bindUiLayoutControlHandles() {
        Object.keys(this.uiLayoutControlDefinitions).forEach((controlId) => {
            const element = this.getUiLayoutControlElement(controlId);
            if (!element) return;

            element.dataset.uiLayoutControlId = controlId;
            if (element.dataset.uiLayoutBound === 'true') return;

            element.addEventListener('pointerdown', this.handleUiLayoutControlPointerDown);
            element.dataset.uiLayoutBound = 'true';
        });
    }

    getElementComputedScale(element) {
        if (!element || typeof window === 'undefined' || !window.getComputedStyle) return 1;
        const transform = window.getComputedStyle(element).transform;
        if (!transform || transform === 'none') return 1;

        const values = transform.startsWith('matrix3d(')
            ? transform.slice(9, -1).split(',').map((value) => Number(value.trim()))
            : transform.startsWith('matrix(')
                ? transform.slice(7, -1).split(',').map((value) => Number(value.trim()))
                : null;

        if (!values || values.some((value) => !Number.isFinite(value))) return 1;

        if (transform.startsWith('matrix3d(') && values.length >= 6) {
            const scaleX = Math.hypot(values[0], values[1], values[2]);
            const scaleY = Math.hypot(values[4], values[5], values[6]);
            const nextScale = (scaleX + scaleY) / 2;
            return Number.isFinite(nextScale) && nextScale > 0.0001 ? nextScale : 1;
        }

        if (transform.startsWith('matrix(') && values.length >= 4) {
            const scaleX = Math.hypot(values[0], values[1]);
            const scaleY = Math.hypot(values[2], values[3]);
            const nextScale = (scaleX + scaleY) / 2;
            return Number.isFinite(nextScale) && nextScale > 0.0001 ? nextScale : 1;
        }

        return 1;
    }

    getUiLayoutElementBaseScale(element) {
        const currentScale = this.getElementComputedScale(element);
        const appliedScale = Number(element?.dataset?.uiLayoutAppliedScale);
        if (Number.isFinite(appliedScale) && appliedScale > 0.0001) {
            const baseScale = currentScale / appliedScale;
            if (Number.isFinite(baseScale) && baseScale > 0.0001) {
                return baseScale;
            }
        }
        return currentScale;
    }

    getUiLayoutControlBaseScale(controlId, definition = {}, element = null, mode = this.getUiLayoutMode()) {
        const modeBaseScale = Number(definition?.baseScaleByMode?.[mode]);
        if (Number.isFinite(modeBaseScale) && modeBaseScale > 0.0001) {
            return modeBaseScale;
        }

        const configuredBaseScale = Number(definition?.baseScale);
        if (Number.isFinite(configuredBaseScale) && configuredBaseScale > 0.0001) {
            return configuredBaseScale;
        }

        return this.getUiLayoutElementBaseScale(element);
    }

    sanitizeUiLayoutEntry(entry, definition = {}) {
        if (!entry || typeof entry !== 'object') return null;
        const left = Number(entry.left);
        const top = Number(entry.top);
        const scale = Number(entry.scale);
        if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
        return {
            left: Math.min(0.97, Math.max(0.01, left)),
            top: Math.min(0.97, Math.max(0.01, top)),
            scale: Math.min(definition.maxScale || 1.8, Math.max(definition.minScale || 0.7, Number.isFinite(scale) ? scale : 1))
        };
    }

    sanitizeUiLayout(layout) {
        if (!layout || typeof layout !== 'object') return null;
        const rawLayouts = layout.layouts && typeof layout.layouts === 'object'
            ? layout.layouts
            : layout;
        const updatedAt = Math.max(0, Number(layout.updatedAt || 0) || 0);
        const sanitizedLayouts = {};

        ['desktop', 'mobilePortrait', 'mobileLandscape'].forEach((mode) => {
            const rawMode = rawLayouts?.[mode];
            if (!rawMode || typeof rawMode !== 'object') return;
            const nextMode = {};
            this.getUiLayoutControlsForMode(mode).forEach(([controlId, definition]) => {
                const entry = this.sanitizeUiLayoutEntry(rawMode[controlId], definition);
                if (entry) nextMode[controlId] = entry;
            });
            if (Object.keys(nextMode).length > 0) {
                sanitizedLayouts[mode] = nextMode;
            }
        });

        if (Object.keys(sanitizedLayouts).length === 0) return null;
        const sanitized = {
            version: 1,
            layouts: sanitizedLayouts
        };
        if (updatedAt > 0) {
            sanitized.updatedAt = updatedAt;
        }
        return sanitized;
    }

    serializeUiLayout(layout) {
        return JSON.stringify(this.sanitizeUiLayout(layout) || null);
    }

    serializeUiLayoutComparable(layout) {
        const sanitized = this.sanitizeUiLayout(layout);
        if (!sanitized) return JSON.stringify(null);
        return JSON.stringify({
            version: sanitized.version || 1,
            layouts: sanitized.layouts || {}
        });
    }

    loadStoredUiLayout() {
        try {
            const raw = localStorage.getItem(this.uiLayoutStorageKey);
            if (!raw) return null;
            return this.sanitizeUiLayout(JSON.parse(raw));
        } catch (error) {
            Logger.warn('[UIManager] Failed to load stored UI layout', error);
            return null;
        }
    }

    persistUiLayoutToStorage(layout) {
        try {
            const sanitized = this.sanitizeUiLayout(layout);
            if (!sanitized) {
                localStorage.removeItem(this.uiLayoutStorageKey);
                return false;
            }
            localStorage.setItem(this.uiLayoutStorageKey, JSON.stringify(sanitized));
            return true;
        } catch (error) {
            Logger.warn('[UIManager] Failed to save UI layout', error);
            return false;
        }
    }

    clearLocalCharacterCaches() {
        try {
            localStorage.removeItem('yurika_player_name');
            localStorage.removeItem(this.uiLayoutStorageKey);
        } catch (error) {
            Logger.warn('[UIManager] Failed to clear local character caches', error);
        }
    }

    getResolvedUiLayoutSource() {
        return this.uiLayoutEditMode
            ? this.uiLayoutDraft
            : this.game.localPlayer?.uiLayout;
    }

    getUiLayoutModeEntries(source = this.getResolvedUiLayoutSource(), mode = this.getUiLayoutMode()) {
        return this.getStoredUiLayoutModeEntries(source, mode)
            || this.captureDefaultUiLayoutForMode(mode);
    }

    getStoredUiLayoutModeEntries(source = this.getResolvedUiLayoutSource(), mode = this.getUiLayoutMode()) {
        const sanitized = this.sanitizeUiLayout(source);
        const modeEntries = sanitized?.layouts?.[mode];
        if (modeEntries && Object.keys(modeEntries).length > 0) {
            return modeEntries;
        }
        return null;
    }

    buildDefaultJoystickLayoutEntry(mode = this.getUiLayoutMode()) {
        const viewportW = Math.max(window.innerWidth || 0, 1);
        const viewportH = Math.max(window.innerHeight || 0, 1);
        const isLandscape = mode === 'mobileLandscape';
        const leftPx = isLandscape ? 28 : 24;
        const topPx = isLandscape
            ? Math.max(40, viewportH - 152)
            : Math.max(40, viewportH - 196);
        return {
            left: leftPx / viewportW,
            top: topPx / viewportH,
            scale: isLandscape ? 1 : 0.96
        };
    }

    captureCurrentUiLayoutEntry(controlId, mode = this.getUiLayoutMode()) {
        const viewportW = Math.max(window.innerWidth || 0, 1);
        const viewportH = Math.max(window.innerHeight || 0, 1);
        if (controlId === 'joystick') {
            return this.buildDefaultJoystickLayoutEntry(mode);
        }

        const element = this.getUiLayoutControlElement(controlId);
        const rect = element?.getBoundingClientRect?.();
        if (!rect || !rect.width || !rect.height) return null;

        return {
            left: rect.left / viewportW,
            top: rect.top / viewportH,
            scale: 1
        };
    }

    clearUiLayoutRuntimeStyles() {
        Object.keys(this.uiLayoutControlDefinitions).forEach((controlId) => {
            const element = this.getUiLayoutControlElement(controlId);
            if (!element) return;
            delete element.dataset.uiLayoutEditable;
            delete element.dataset.uiLayoutSelected;
            delete element.dataset.uiLayoutAppliedScale;
            ['position', 'left', 'top', 'right', 'bottom', 'margin', 'z-index', 'width', 'height', 'min-width', 'padding', 'font-size', 'display', 'transform', 'transform-origin', 'will-change'].forEach((property) => {
                element.style.removeProperty(property);
            });
            const icon = element.querySelector('.inner-icon, .paw-icon');
            icon?.style?.removeProperty('font-size');
        });
    }

    measureUiLayoutElement(controlId) {
        const element = this.getUiLayoutControlElement(controlId);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const computed = window.getComputedStyle(element);
        const icon = element.querySelector('.inner-icon, .paw-icon');
        const iconComputed = icon ? window.getComputedStyle(icon) : null;
        return {
            element,
            width: rect.width || parseFloat(computed.width) || 0,
            height: rect.height || parseFloat(computed.height) || 0,
            fontSize: parseFloat(computed.fontSize) || 0,
            paddingTop: parseFloat(computed.paddingTop) || 0,
            paddingRight: parseFloat(computed.paddingRight) || 0,
            paddingBottom: parseFloat(computed.paddingBottom) || 0,
            paddingLeft: parseFloat(computed.paddingLeft) || 0,
            iconFontSize: parseFloat(iconComputed?.fontSize) || 0
        };
    }

    computeUiLayoutPosition(entry, width, height, margin = 12) {
        const viewportW = Math.max(window.innerWidth || 0, 1);
        const viewportH = Math.max(window.innerHeight || 0, 1);
        const maxLeft = Math.max(margin, viewportW - width - margin);
        const maxTop = Math.max(margin, viewportH - height - margin);
        return {
            left: Math.round(Math.min(maxLeft, Math.max(margin, entry.left * viewportW))),
            top: Math.round(Math.min(maxTop, Math.max(margin, entry.top * viewportH)))
        };
    }

    applyUiLayoutControl(controlId, entry, options = {}) {
        const element = this.getUiLayoutControlElement(controlId);
        if (!element || !entry) return;

        const definition = this.uiLayoutControlDefinitions[controlId];
        const safeEntry = this.sanitizeUiLayoutEntry(entry, definition);
        if (!safeEntry) return;

        element.dataset.uiLayoutEditable = 'true';

        if (controlId === 'joystick') {
            const approxSize = 118 * safeEntry.scale;
            const position = this.computeUiLayoutPosition(safeEntry, approxSize, approxSize, 16);
            element.style.setProperty('position', 'fixed', 'important');
            element.style.setProperty('left', `${position.left}px`, 'important');
            element.style.setProperty('top', `${position.top}px`, 'important');
            element.style.setProperty('right', 'auto', 'important');
            element.style.setProperty('bottom', 'auto', 'important');
            element.style.setProperty('display', 'flex', 'important');
            element.style.setProperty('transform', `scale(${safeEntry.scale})`, 'important');
            element.style.setProperty('transform-origin', 'top left', 'important');
            element.style.setProperty('z-index', '1490', 'important');
            return;
        }

        const metrics = options.metrics || this.measureUiLayoutElement(controlId);
        if (!metrics) return;
        const scaledWidth = options.useViewportMetrics
            ? Math.max(28, metrics.width)
            : Math.max(28, metrics.width * safeEntry.scale);
        const scaledHeight = options.useViewportMetrics
            ? Math.max(24, metrics.height)
            : Math.max(24, metrics.height * safeEntry.scale);
        const margin = Number.isFinite(definition?.margin) ? definition.margin : 12;
        const viewportPosition = this.computeUiLayoutPosition(safeEntry, scaledWidth, scaledHeight, margin);
        let position = viewportPosition;
        let positionMode = 'fixed';
        if (definition?.positioningContext === 'parent') {
            const contextElement = this.getUiLayoutContextElement(controlId);
            const contextRect = contextElement?.getBoundingClientRect?.();
            const contextScale = this.getElementComputedScale(contextElement);
            if (contextElement && contextRect && Number.isFinite(contextScale) && contextScale > 0.0001) {
                position = {
                    left: Math.round((viewportPosition.left - contextRect.left) / contextScale),
                    top: Math.round((viewportPosition.top - contextRect.top) / contextScale)
                };
                positionMode = 'absolute';
            }
        }

        element.style.setProperty('position', positionMode, 'important');
        element.style.setProperty('left', `${position.left}px`, 'important');
        element.style.setProperty('top', `${position.top}px`, 'important');
        element.style.setProperty('right', 'auto', 'important');
        element.style.setProperty('bottom', 'auto', 'important');
        element.style.setProperty('margin', '0', 'important');
        element.style.setProperty('z-index', String(definition?.zIndex || (controlId === 'action-auto-toggle' ? 1495 : 1490)), 'important');

        if (definition?.scaleMode === 'transform') {
            const baseScale = this.getUiLayoutControlBaseScale(controlId, definition, element);
            const finalScale = Math.max(0.01, baseScale * safeEntry.scale);
            element.style.setProperty('transform', `scale(${finalScale})`, 'important');
            element.style.setProperty('transform-origin', 'top left', 'important');
            element.dataset.uiLayoutAppliedScale = String(safeEntry.scale);
            return;
        }

        delete element.dataset.uiLayoutAppliedScale;

        element.style.setProperty('font-size', `${Math.max(10, metrics.fontSize * safeEntry.scale)}px`, 'important');

        if (controlId === 'action-auto-toggle') {
            element.style.setProperty('min-width', `${Math.max(48, scaledWidth)}px`, 'important');
            element.style.setProperty('height', `${Math.max(22, scaledHeight)}px`, 'important');
            element.style.setProperty('padding', `${Math.max(0, metrics.paddingTop * safeEntry.scale)}px ${Math.max(8, metrics.paddingRight * safeEntry.scale)}px`, 'important');
        } else {
            element.style.setProperty('width', `${scaledWidth}px`, 'important');
            element.style.setProperty('height', `${scaledHeight}px`, 'important');
            const icon = element.querySelector('.inner-icon');
            if (icon && metrics.iconFontSize > 0) {
                icon.style.setProperty('font-size', `${Math.max(14, metrics.iconFontSize * safeEntry.scale)}px`, 'important');
            }
        }
    }

    applyActiveUiLayout() {
        this.clearUiLayoutRuntimeStyles();
        const mode = this.getUiLayoutMode();
        const controls = this.getUiLayoutControlsForMode(mode);
        const supportsJoystick = controls.some(([controlId]) => controlId === 'joystick');
        const presetEntries = this.getUiLayoutPresetForMode(mode);
        const entries = this.uiLayoutEditMode
            ? this.getUiLayoutModeEntries(this.getResolvedUiLayoutSource(), mode)
            : (
                this.getStoredUiLayoutModeEntries(this.getResolvedUiLayoutSource(), mode)
                || (presetEntries ? this.captureDefaultUiLayoutForMode(mode) : null)
            );
        Object.entries(entries || {}).forEach(([controlId, entry]) => {
            if (controlId === 'joystick' && !this.uiLayoutEditMode) return;
            this.applyUiLayoutControl(controlId, entry);
        });
        const joystickLayout = this.uiLayoutEditMode && supportsJoystick
            ? (entries?.joystick || this.buildDefaultJoystickLayoutEntry(mode))
            : null;
        this.game.touch?.setFixedJoystickLayout?.(joystickLayout);
        this.syncUiLayoutSelectionState();
    }

    captureDefaultUiLayoutForMode(mode = this.getUiLayoutMode()) {
        const controls = this.getUiLayoutControlsForMode(mode);
        const presetDefaults = this.getUiLayoutPresetForMode(mode) || {};
        const cachedDefaults = this.uiLayoutDefaultCache?.[mode];
        const hasEveryCachedEntry = !!cachedDefaults && controls.every(([controlId, definition]) => (
            !!this.sanitizeUiLayoutEntry(cachedDefaults[controlId], definition)
        ));
        if (hasEveryCachedEntry) {
            return this.cloneStructuredData(cachedDefaults) || {};
        }

        this.clearUiLayoutRuntimeStyles();
        this.game.touch?.setFixedJoystickLayout?.(null);
        const defaults = {};
        controls.forEach(([controlId, definition]) => {
            const entry = this.sanitizeUiLayoutEntry(
                presetDefaults[controlId] || this.captureCurrentUiLayoutEntry(controlId, mode),
                definition
            );
            if (entry) defaults[controlId] = entry;
        });
        this.uiLayoutDefaultCache[mode] = defaults;
        return this.cloneStructuredData(defaults) || {};
    }

    ensureUiLayoutDraftMode(mode = this.getUiLayoutMode()) {
        if (!this.uiLayoutDraft || typeof this.uiLayoutDraft !== 'object') {
            this.uiLayoutDraft = { version: 1, layouts: {} };
        }
        if (!this.uiLayoutDraft.layouts || typeof this.uiLayoutDraft.layouts !== 'object') {
            this.uiLayoutDraft.layouts = {};
        }

        const existing = this.uiLayoutDraft.layouts[mode] || {};
        const controls = this.getUiLayoutControlsForMode(mode);
        const hasEveryEntry = controls.every(([controlId]) => !!this.sanitizeUiLayoutEntry(existing[controlId], this.uiLayoutControlDefinitions[controlId]));
        if (hasEveryEntry) {
            this.uiLayoutDraft.layouts[mode] = existing;
            return existing;
        }

        const defaults = this.captureDefaultUiLayoutForMode(mode);
        const nextMode = {};
        controls.forEach(([controlId, definition]) => {
            nextMode[controlId] = this.sanitizeUiLayoutEntry(existing[controlId] || defaults[controlId], definition);
        });
        this.uiLayoutDraft.layouts[mode] = nextMode;
        return nextMode;
    }

    setUiLayoutDirty(dirty = true) {
        this.uiLayoutDirty = !!dirty;
        const modeLabel = document.getElementById('ui-layout-mode-label');
        if (!modeLabel) return;
        const suffix = this.uiLayoutDirty ? ' · 변경됨' : '';
        modeLabel.textContent = `현재 화면: ${this.getUiLayoutModeLabel()}${suffix}`;
    }

    populateUiLayoutTargetSelect() {
        const select = document.getElementById('ui-layout-target-select');
        if (!select) return;

        const options = this.getUiLayoutControlsForMode().map(([controlId, definition]) => ({ controlId, label: definition.label }));
        select.innerHTML = options.map(({ controlId, label }) => `<option value="${controlId}">${label}</option>`).join('');

        if (!options.some(({ controlId }) => controlId === this.uiLayoutSelectedControlId)) {
            this.uiLayoutSelectedControlId = options[0]?.controlId || null;
        }

        if (this.uiLayoutSelectedControlId) {
            select.value = this.uiLayoutSelectedControlId;
        }
    }

    syncUiLayoutSelectionState() {
        Object.keys(this.uiLayoutControlDefinitions).forEach((controlId) => {
            const element = this.getUiLayoutControlElement(controlId);
            if (!element) return;
            if (!this.uiLayoutEditMode) {
                delete element.dataset.uiLayoutSelected;
                return;
            }
            if (controlId === this.uiLayoutSelectedControlId) {
                element.dataset.uiLayoutSelected = 'true';
            } else {
                delete element.dataset.uiLayoutSelected;
            }
        });
    }

    syncUiLayoutEditor() {
        const editor = document.getElementById('ui-layout-editor');
        const isVisible = this.uiLayoutEditMode && editor && !editor.classList.contains('hidden');
        const select = document.getElementById('ui-layout-target-select');
        const sizeRange = document.getElementById('ui-layout-size-range');
        const sizeValue = document.getElementById('ui-layout-size-value');
        const modeLabel = document.getElementById('ui-layout-mode-label');

        if (modeLabel) {
            const suffix = this.uiLayoutDirty ? ' · 변경됨' : '';
            modeLabel.textContent = `현재 화면: ${this.getUiLayoutModeLabel()}${suffix}`;
        }

        this.refreshUiLayoutEditorWindowLayout();

        if (!isVisible) return;

        this.populateUiLayoutTargetSelect();
        if (select && this.uiLayoutSelectedControlId) {
            select.value = this.uiLayoutSelectedControlId;
        }

        const selectedDefinition = this.uiLayoutControlDefinitions[this.uiLayoutSelectedControlId] || null;
        const currentModeEntries = this.getUiLayoutModeEntries(this.uiLayoutDraft, this.getUiLayoutMode()) || {};
        const currentEntry = currentModeEntries[this.uiLayoutSelectedControlId];
        const minScale = selectedDefinition?.minScale || 0.7;
        const maxScale = selectedDefinition?.maxScale || 1.8;
        const percent = Math.round((currentEntry?.scale || 1) * 100);
        if (sizeRange) {
            sizeRange.min = String(Math.round(minScale * 100));
            sizeRange.max = String(Math.round(maxScale * 100));
            sizeRange.value = String(Math.min(Math.round(maxScale * 100), Math.max(Math.round(minScale * 100), percent)));
        }
        if (sizeValue) sizeValue.textContent = `${percent}%`;
    }

    selectUiLayoutControl(controlId) {
        if (!controlId) return;
        const isAllowed = this.getUiLayoutControlsForMode().some(([candidateId]) => candidateId === controlId);
        if (!isAllowed) return;
        this.uiLayoutSelectedControlId = controlId;
        this.syncUiLayoutSelectionState();
        this.syncUiLayoutEditor();
    }

    enterUiLayoutEditMode() {
        if (!this.game.localPlayer) return;
        if (this.uiLayoutEditMode) return;
        const baseLayout = this.sanitizeUiLayout(this.game.localPlayer?.uiLayout) || { version: 1, layouts: {} };
        this.uiLayoutDraft = this.cloneStructuredData(baseLayout) || { version: 1, layouts: {} };
        this.uiLayoutEditMode = true;
        this.game.touch?.resetState?.();
        this.game.input?.setEnabled?.(false);
        this.isPaused = true;
        this.setLandscapeChatActive(false);
        this.overlay?.classList.add('hidden');
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.setProperty('display', 'none', 'important');
            loadingOverlay.style.setProperty('pointer-events', 'none', 'important');
        }
        document.querySelectorAll('.game-popup').forEach((popup) => popup.classList.add('hidden'));
        document.body.classList.remove('popup-open');
        document.body.classList.add('ui-layout-edit-mode');
        document.body.getBoundingClientRect();
        this.uiLayoutActiveMode = this.getUiLayoutMode();
        this.bindUiLayoutControlHandles();
        this.ensureUiLayoutDraftMode(this.uiLayoutActiveMode);
        this.uiLayoutSelectedControlId = this.getDefaultUiLayoutControlId(this.uiLayoutActiveMode);
        this.setUiLayoutDirty(false);
        document.getElementById('ui-layout-editor')?.classList.remove('hidden');
        this.resetUiLayoutEditorWindowPosition();
        this.applyActiveUiLayout();
        this.syncUiLayoutEditor();
        window.dispatchEvent?.(new CustomEvent('yurika:ui-layout-edit-mode', { detail: { active: true } }));
    }

    persistUiLayoutDraft() {
        const player = this.game.localPlayer;
        if (!player) return false;

        const draftForSave = this.cloneStructuredData(this.uiLayoutDraft) || { version: 1, layouts: {} };
        const hasResetModes = !!this.uiLayoutResetModes?.size;
        if (draftForSave.layouts && this.uiLayoutResetModes?.size > 0) {
            this.uiLayoutResetModes.forEach((mode) => {
                delete draftForSave.layouts[mode];
            });
        }
        const sanitizedDraft = this.sanitizeUiLayout(draftForSave);
        const currentComparable = this.serializeUiLayoutComparable(player.uiLayout);
        const nextComparable = this.serializeUiLayoutComparable(sanitizedDraft);
        const nextPersistedLayout = sanitizedDraft
            ? {
                ...sanitizedDraft,
                updatedAt: Date.now()
            }
            : null;
        player.uiLayout = nextPersistedLayout;
        this.persistUiLayoutToStorage(nextPersistedLayout);

        if (currentComparable === nextComparable && !hasResetModes) {
            return false;
        }

        player.saveProfilePatch?.(['uiLayout'], {
            debounceMs: 0,
            forceImmediate: true,
            reason: 'ui_layout_save'
        });
        return true;
    }

    exitUiLayoutEditMode(options = {}) {
        const { save = false } = options;
        if (!this.uiLayoutEditMode) return;

        if (save) {
            this.persistUiLayoutDraft();
        }

        this.uiLayoutEditMode = false;
        this.uiLayoutDraft = null;
        this.uiLayoutResetModes.clear();
        this.uiLayoutSelectedControlId = null;
        this.uiLayoutDragState.captureTarget?.style?.removeProperty('will-change');
        this.uiLayoutDragState.active = false;
        this.uiLayoutDragState.pointerId = null;
        this.uiLayoutDragState.controlId = null;
        this.uiLayoutDragState.metrics = null;
        this.uiLayoutDragState.width = 0;
        this.uiLayoutDragState.height = 0;
        this.uiLayoutDragState.margin = 12;
        this.uiLayoutDragState.captureTarget = null;
        this.setUiLayoutDirty(false);
        document.body.classList.remove('ui-layout-edit-mode');
        document.body.classList.remove('popup-open');
        document.getElementById('ui-layout-editor')?.classList.add('hidden');
        this.resetUiLayoutEditorWindowPosition();
        this.game.input?.setEnabled?.(true);
        this.isPaused = false;
        this.applyActiveUiLayout();
        this.syncUiLayoutEditor();
        window.dispatchEvent?.(new CustomEvent('yurika:ui-layout-edit-mode', { detail: { active: false, saved: !!save } }));
        window.flushPendingYurikaControllerReload?.();
    }

    updateUiLayoutEntry(controlId, nextEntry = {}, options = {}) {
        if (!this.uiLayoutEditMode) return;
        const mode = this.getUiLayoutMode();
        this.uiLayoutResetModes.delete(mode);
        const modeEntries = this.ensureUiLayoutDraftMode(mode);
        const definition = this.uiLayoutControlDefinitions[controlId];
        modeEntries[controlId] = this.sanitizeUiLayoutEntry({
            ...modeEntries[controlId],
            ...nextEntry
        }, definition);
        this.setUiLayoutDirty(true);
        if (options.fastApply) {
            this.applyUiLayoutControl(controlId, modeEntries[controlId], options.applyOptions || {});
            if (controlId === 'joystick') {
                this.game.touch?.setFixedJoystickLayout?.(modeEntries[controlId] || null);
            }
            if (!options.skipSelectionSync) {
                this.syncUiLayoutSelectionState();
            }
            if (!options.skipEditorSync) {
                this.syncUiLayoutEditor();
            }
        } else {
            this.applyActiveUiLayout();
        }
        if (!options.skipReselect) {
            this.selectUiLayoutControl(controlId);
        }
    }

    resetSelectedUiLayoutControl() {
        if (!this.uiLayoutEditMode || !this.uiLayoutSelectedControlId) return;
        const mode = this.getUiLayoutMode();
        delete this.uiLayoutDefaultCache?.[mode];
        const defaults = this.captureDefaultUiLayoutForMode(mode);
        const nextDefault = defaults[this.uiLayoutSelectedControlId];
        if (!nextDefault) return;
        this.updateUiLayoutEntry(this.uiLayoutSelectedControlId, nextDefault);
    }

    resetUiLayoutDraftForCurrentMode() {
        if (!this.uiLayoutEditMode) return;
        const mode = this.getUiLayoutMode();
        delete this.uiLayoutDefaultCache?.[mode];
        const defaults = this.captureDefaultUiLayoutForMode(mode);
        this.uiLayoutDraft.layouts[mode] = defaults;
        this.uiLayoutResetModes.add(mode);
        this.setUiLayoutDirty(true);
        this.applyActiveUiLayout();
        this.syncUiLayoutEditor();
    }

    resetStoredUiLayoutForCurrentMode() {
        const player = this.game.localPlayer;
        if (!player) return;

        const current = this.sanitizeUiLayout(player.uiLayout) || { version: 1, layouts: {} };
        const mode = this.getUiLayoutMode();
        if (current.layouts) {
            delete current.layouts[mode];
        }
        const nextLayout = this.sanitizeUiLayout(current);
        const currentComparable = this.serializeUiLayoutComparable(player.uiLayout);
        const nextComparable = this.serializeUiLayoutComparable(nextLayout);
        const nextPersistedLayout = nextLayout
            ? {
                ...nextLayout,
                updatedAt: Date.now()
            }
            : null;
        player.uiLayout = nextPersistedLayout;
        this.persistUiLayoutToStorage(nextPersistedLayout);
        player.saveProfilePatch?.(['uiLayout'], {
            debounceMs: 0,
            forceImmediate: true,
            reason: currentComparable !== nextComparable ? 'ui_layout_reset' : 'ui_layout_reset_force'
        });
        this.uiLayoutDefaultCache = {};
        this.applyActiveUiLayout();
        this.syncUiLayoutEditor();
    }

    loadPlayerUiLayout(layout) {
        const remoteLayout = this.sanitizeUiLayout(layout);
        const localLayout = this.loadStoredUiLayout();
        const remoteUpdatedAt = Number(remoteLayout?.updatedAt || 0);
        const localUpdatedAt = Number(localLayout?.updatedAt || 0);
        const shouldUseLocalLayout = !!localLayout
            && (!remoteLayout || localUpdatedAt > remoteUpdatedAt);
        const resolvedLayout = shouldUseLocalLayout
            ? localLayout
            : (remoteLayout || localLayout);

        if (this.game.localPlayer) {
            this.game.localPlayer.uiLayout = resolvedLayout;
            if (resolvedLayout) {
                this.persistUiLayoutToStorage(resolvedLayout);
            } else {
                this.persistUiLayoutToStorage(null);
            }
            if (resolvedLayout && shouldUseLocalLayout) {
                this.game.localPlayer.saveProfilePatch?.(['uiLayout'], {
                    debounceMs: 0,
                    forceImmediate: true,
                    reason: 'rehydrate_local_ui_layout'
                });
            }
        }
        if (!this.uiLayoutEditMode) {
            this.applyActiveUiLayout();
        }
    }

    loadPlayerSettings(settings = null, options = {}) {
        const source = settings && typeof settings === 'object'
            ? settings
            : this.settings;
        const nextSettings = this.sanitizeSettings(source);
        this.settings = nextSettings;

        if (this.game.localPlayer) {
            this.game.localPlayer.clientSettings = this.cloneStructuredData(nextSettings);
        }

        this.persistSettings({ syncProfile: false });
        this.applySettings({
            refreshGame: !!options.refreshGame,
            syncUi: options.syncUi !== false
        });
    }

    refreshUiLayoutForViewport() {
        const nextMode = this.getUiLayoutMode();
        const modeChanged = nextMode !== this.uiLayoutActiveMode;
        this.uiLayoutDefaultCache = {};
        this.uiLayoutActiveMode = nextMode;
        if (this.uiLayoutEditMode) {
            this.ensureUiLayoutDraftMode(nextMode);
            if (modeChanged || !this.uiLayoutSelectedControlId) {
                this.uiLayoutSelectedControlId = this.getDefaultUiLayoutControlId(nextMode);
            }
            if (modeChanged) {
                this.resetUiLayoutEditorWindowPosition();
            }
            this.syncUiLayoutEditor();
        }
        this.applyActiveUiLayout();
        this.refreshUiLayoutEditorWindowLayout();
    }

    handleUiLayoutControlPointerDown(e) {
        if (!this.uiLayoutEditMode) return;
        const controlId = e.currentTarget?.dataset?.uiLayoutControlId;
        if (!controlId) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const metrics = this.measureUiLayoutElement(controlId);
        this.selectUiLayoutControl(controlId);
        this.uiLayoutDragState.active = true;
        this.uiLayoutDragState.pointerId = e.pointerId;
        this.uiLayoutDragState.controlId = controlId;
        this.uiLayoutDragState.offsetX = e.clientX - rect.left;
        this.uiLayoutDragState.offsetY = e.clientY - rect.top;
        this.uiLayoutDragState.metrics = metrics
            ? { ...metrics, width: rect.width || metrics.width, height: rect.height || metrics.height }
            : { width: rect.width, height: rect.height };
        this.uiLayoutDragState.width = rect.width || metrics?.width || 0;
        this.uiLayoutDragState.height = rect.height || metrics?.height || 0;
        this.uiLayoutDragState.margin = Number.isFinite(this.uiLayoutControlDefinitions?.[controlId]?.margin)
            ? this.uiLayoutControlDefinitions[controlId].margin
            : (controlId === 'joystick' ? 16 : 12);
        this.uiLayoutDragState.captureTarget = e.currentTarget;
        e.currentTarget.style.setProperty('will-change', 'left, top, transform', 'important');
        e.currentTarget.setPointerCapture?.(e.pointerId);
    }

    handleUiLayoutControlPointerMove(e) {
        if (!this.uiLayoutEditMode || !this.uiLayoutDragState.active) return;
        if (this.uiLayoutDragState.pointerId !== e.pointerId) return;
        e.preventDefault();
        const controlId = this.uiLayoutDragState.controlId;
        const viewportW = Math.max(window.innerWidth || 0, 1);
        const viewportH = Math.max(window.innerHeight || 0, 1);
        const dragWidth = Math.max(1, Number(this.uiLayoutDragState.width || 0));
        const dragHeight = Math.max(1, Number(this.uiLayoutDragState.height || 0));
        const margin = Math.max(0, Number(this.uiLayoutDragState.margin || 12));
        const maxLeft = Math.max(margin, viewportW - dragWidth - margin);
        const maxTop = Math.max(margin, viewportH - dragHeight - margin);
        const left = Math.min(maxLeft, Math.max(margin, e.clientX - this.uiLayoutDragState.offsetX));
        const top = Math.min(maxTop, Math.max(margin, e.clientY - this.uiLayoutDragState.offsetY));
        this.updateUiLayoutEntry(controlId, {
            left: left / viewportW,
            top: top / viewportH
        }, {
            fastApply: true,
            skipSelectionSync: true,
            skipEditorSync: true,
            skipReselect: true,
            applyOptions: {
                metrics: this.uiLayoutDragState.metrics || {
                    width: dragWidth,
                    height: dragHeight
                },
                useViewportMetrics: true
            }
        });
    }

    handleUiLayoutControlPointerUp(e) {
        if (!this.uiLayoutDragState.active || this.uiLayoutDragState.pointerId !== e.pointerId) return;
        this.uiLayoutDragState.captureTarget?.style?.removeProperty('will-change');
        this.uiLayoutDragState.captureTarget?.releasePointerCapture?.(e.pointerId);
        this.uiLayoutDragState.active = false;
        this.uiLayoutDragState.pointerId = null;
        this.uiLayoutDragState.controlId = null;
        this.uiLayoutDragState.metrics = null;
        this.uiLayoutDragState.width = 0;
        this.uiLayoutDragState.height = 0;
        this.uiLayoutDragState.margin = 12;
        this.uiLayoutDragState.captureTarget = null;
        this.syncUiLayoutEditor();
    }

    updateAutoAttackToggle(forceState = null) {
        const button = this.getHudRef('autoAttackToggle', 'action-auto-toggle', 'id');
        if (!button) return;

        const enabled = typeof forceState === 'boolean'
            ? forceState
            : !!this.game.localPlayer?.autoAttackEnabled;
        const nextText = '[Auto]';

        if (button.textContent !== nextText) {
            button.textContent = nextText;
        }

        button.classList.toggle('active', enabled);
        button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        button.setAttribute('title', enabled ? '자동 일반공격 활성화' : '자동 일반공격 비활성화');
    }

    hasAnySkillUpgradeAvailable(player = this.game.localPlayer) {
        if (!player) return false;

        return ['laser', 'missile', 'fireball'].some((skillId) => {
            const cost = player.getSkillUpgradeCost
                ? player.getSkillUpgradeCost(skillId)
                : (300 * Math.pow(2, (player.skillLevels?.[skillId] || 1) - 1));
            return Number.isFinite(cost) && player.manastone >= cost;
        });
    }

    setAlertDotState(target, active) {
        const element = typeof target === 'string'
            ? document.getElementById(target)
            : target;
        if (!element) return;

        element.classList.toggle('active', !!active);
        element.setAttribute('aria-hidden', active ? 'false' : 'true');
    }

    updateHudAttentionIndicators(overrides = {}) {
        const player = this.game.localPlayer;
        if (!player) return;

        const statusAvailable = overrides.statusAvailable ?? !!player.statPoints;
        const skillAvailable = overrides.skillAvailable ?? this.hasAnySkillUpgradeAvailable(player);
        const questAvailable = overrides.questAvailable ?? !!this.questClaimAvailable;
        const inventoryAvailable = overrides.inventoryAvailable ?? !!player.hasUnreadInventoryWeapon?.();

        this.setAlertDotState('inventory-alert-dot', inventoryAvailable);
        this.setAlertDotState('status-alert-dot', statusAvailable);
        this.setAlertDotState('skill-alert-dot', skillAvailable);
        this.setAlertDotState('quest-alert-dot', questAvailable);
    }

    getEnhancementStoneMeta(stoneType = this.pendingEnhancementStoneType) {
        const normalized = stoneType === 'blessed'
            ? 'blessed'
            : stoneType === 'normal'
                ? 'normal'
                : null;

        if (!normalized) return null;

        if (normalized === 'blessed') {
            return {
                stoneType: 'blessed',
                stoneItemId: 'blessed_weapon_upgrade_stone',
                modalTitle: '축복 강화',
                actionLabel: '축복 강화할 무기 선택',
                selectionMessage: '축복 강화할 무기를 선택해 주세요.',
                shortageMessage: '축복받은 무기 강화석이 부족합니다.'
            };
        }

        return {
            stoneType: 'normal',
            stoneItemId: 'weapon_upgrade_stone',
            modalTitle: '강화',
            actionLabel: '강화할 무기 선택',
            selectionMessage: '강화할 무기를 선택해 주세요.',
            shortageMessage: '무기 강화석이 부족합니다.'
        };
    }

    isWeaponEnhancementSelectionActive() {
        return !!this.getEnhancementStoneMeta();
    }

    clearWeaponEnhancementSelection(options = {}) {
        const hadPendingSelection = this.isWeaponEnhancementSelectionActive();
        this.pendingEnhancementStoneType = null;

        if (hadPendingSelection && !options.silent) {
            this.logSystemMessage('무기 강화 대상 선택을 취소했습니다.');
        }

        if (options.refresh !== false) {
            this.updateInventory();
        }
    }

    isActiveEnhancementStone(item, stoneType = this.pendingEnhancementStoneType) {
        if (!item || !stoneType) return false;
        const itemId = item.type || item.id;
        return stoneType === 'blessed'
            ? itemId === 'blessed_weapon_upgrade_stone'
            : itemId === 'weapon_upgrade_stone';
    }

    getInventoryEnhancementTargetElement(selection) {
        if (selection?.kind === 'equipment') {
            return document.querySelector('.equipped-weapon-slot');
        }

        if (selection?.kind === 'inventory' && Number.isInteger(selection.index)) {
            return document.querySelector(`#inventory-grid .grid-item[data-inventory-index="${selection.index}"]`);
        }

        return null;
    }

    getKoreanSubjectParticle(text = '') {
        const trimmed = String(text || '').trim();
        if (!trimmed) return '가';
        const lastChar = trimmed.charCodeAt(trimmed.length - 1);
        const HANGUL_BASE = 0xac00;
        const HANGUL_LAST = 0xd7a3;
        if (lastChar < HANGUL_BASE || lastChar > HANGUL_LAST) return '가';
        return ((lastChar - HANGUL_BASE) % 28) === 0 ? '가' : '이';
    }

    buildWeaponEnhancementCenterMessage(result) {
        if (!result?.item) return null;
        const weaponName = result.item.name || '무기';
        const particle = this.getKoreanSubjectParticle(weaponName);
        const currentLevel = Math.max(0, Number(result.previousLevel) || 0);
        const nextLevel = Math.max(0, Number(result.nextLevel) || currentLevel);
        const displayLevel = result.success ? nextLevel : currentLevel;
        const prefix = `+${displayLevel} ${weaponName}${particle} `;

        if (result.stoneType === 'blessed') {
            if (result.success) {
                return {
                    text: result.gain >= 2
                        ? `${prefix}마석의 힘을 최대치로 흡수하였습니다.`
                        : `${prefix}마석의 힘을 온전히 흡수하였습니다.`,
                    color: '#ffe28a'
                };
            }

            return {
                text: `${prefix}마석의 힘을 받아들이지 못했습니다.`,
                color: '#ffd694'
            };
        }

        if (result.success) {
            return {
                text: `${prefix}마석의 힘을 온전히 흡수하였습니다.`,
                color: '#8df0ad'
            };
        }

        if (result.destroyed) {
            return {
                text: `${prefix}마석의 힘을 견디지 못하고 바스러졌습니다.`,
                color: '#ff8d8d'
            };
        }

        return {
            text: `${prefix}마석의 힘을 받아들이지 못했습니다.`,
            color: '#ffd694'
        };
    }

    isLowPowerEnhancementMode() {
        return !!(this.game?.lowPowerPwaMode || document.body?.classList?.contains('low-power-pwa'));
    }

    ensureInventoryFxLayer(element) {
        if (!element) return null;
        let layer = element.querySelector('.inventory-fx-layer');
        if (!layer) {
            layer = document.createElement('span');
            layer.className = 'inventory-fx-layer';
            element.appendChild(layer);
        }
        return layer;
    }

    playInventoryEnhancementPhase(element, phaseClass, sfxName, duration = 300) {
        if (!element || !phaseClass) {
            if (sfxName && this.game.sound) this.game.sound.playSfx(sfxName);
            return new Promise((resolve) => window.setTimeout(resolve, duration));
        }

        this.ensureInventoryFxLayer(element);
        element.classList.remove(
            'enhance-fx-priming',
            'enhance-fx-success',
            'enhance-fx-keep',
            'enhance-fx-fail',
            'enhance-fx-tier-7',
            'enhance-fx-tier-8',
            'enhance-fx-tier-9',
            'enhance-fx-tier-10'
        );
        void element.offsetWidth;
        element.classList.add(phaseClass);
        if (sfxName && this.game.sound) this.game.sound.playSfx(sfxName);

        return new Promise((resolve) => {
            window.setTimeout(() => {
                element.classList.remove(phaseClass);
                resolve();
            }, duration);
        });
    }

    async playWeaponEnhancementSequence(selection, result) {
        const element = this.getInventoryEnhancementTargetElement(selection);
        const lowPowerMode = this.isLowPowerEnhancementMode();
        const outcomeDuration = lowPowerMode ? 180 : 300;

        if (!lowPowerMode) {
            await this.playInventoryEnhancementPhase(element, 'enhance-fx-priming', 'enhance_charge', 300);
        }

        if (result.success) {
            await this.playInventoryEnhancementPhase(element, 'enhance-fx-success', 'enhance_success', outcomeDuration);
            if (lowPowerMode) return;
            if (result.nextLevel >= 10) {
                await this.playInventoryEnhancementPhase(element, 'enhance-fx-tier-10', 'enhance_tier_10', 300);
            } else if (result.nextLevel === 9) {
                await this.playInventoryEnhancementPhase(element, 'enhance-fx-tier-9', 'enhance_tier_9', 300);
            } else if (result.nextLevel === 8) {
                await this.playInventoryEnhancementPhase(element, 'enhance-fx-tier-8', 'enhance_tier_8', 300);
            } else if (result.nextLevel === 7) {
                await this.playInventoryEnhancementPhase(element, 'enhance-fx-tier-7', 'enhance_tier_7', 300);
            }
            return;
        }

        if (result.keptLevel) {
            await this.playInventoryEnhancementPhase(element, 'enhance-fx-keep', 'enhance_keep', outcomeDuration);
            return;
        }

        await this.playInventoryEnhancementPhase(element, 'enhance-fx-fail', 'enhance_fail', outcomeDuration);
    }

    startWeaponEnhancementSelection(stoneType = 'normal') {
        const player = this.game.localPlayer;
        const meta = this.getEnhancementStoneMeta(stoneType);
        if (!player || !meta || this.inventoryEnhancementAnimating) return false;

        const stoneCount = player.getInventoryItemCount?.(meta.stoneItemId) || 0;
        if (stoneCount < 1) {
            this.showGenericModal(meta.modalTitle, meta.shortageMessage, null, null, { hideNo: true, yesText: '확인' });
            return false;
        }

        const hasTargetWeapon = !!player.getEquippedWeapon?.()
            || player.inventory.some((item, index) => index > 0 && item?.slot === 'weapon');

        if (!hasTargetWeapon) {
            this.showGenericModal(meta.modalTitle, '강화할 무기가 없습니다.', null, null, { hideNo: true, yesText: '확인' });
            return false;
        }

        this.pendingEnhancementStoneType = meta.stoneType;
        this.selectedInventoryRef = null;
        this.inventoryClickSuppressUntil = 0;
        this.tearDownInventoryDrag();
        this.closeInventoryItemModal(true);
        this.logSystemMessage(meta.selectionMessage);
        this.updateInventory();
        return true;
    }

    executeWeaponEnhancementForSelection(selection) {
        const player = this.game.localPlayer;
        const itemData = this.game.itemData;
        const meta = this.getEnhancementStoneMeta();
        if (!player || !itemData || !meta || this.inventoryEnhancementAnimating) return;

        const target = player.resolveWeaponSelection(selection);
        if (!target?.item) {
            this.showGenericModal(meta.modalTitle, '강화할 무기를 선택해 주세요.', null, null, { hideNo: true, yesText: '확인' });
            return;
        }

        const definition = typeof itemData.getEffectiveItemDefinition === 'function'
            ? itemData.getEffectiveItemDefinition(target.item)
            : itemData.getItemDefinition?.(target.item.type || target.item.id);
        const ruleSetId = target.item.enhancementRuleSet || definition?.enhancementRuleSet;
        const ruleSet = typeof itemData.getEffectiveEnhancementRuleSet === 'function'
            ? itemData.getEffectiveEnhancementRuleSet(target.item)
            : itemData.getEnhancementRuleSet?.(ruleSetId);
        const currentLevel = Math.max(0, target.item.enhancementLevel || 0);
        const maxLevel = Math.max(0, ruleSet?.maxLevel || 10);
        if (currentLevel >= maxLevel) {
            this.showGenericModal(meta.modalTitle, '해당 무기는 이미 최종 강화된 상태입니다.', null, null, { hideNo: true, yesText: '확인' });
            return;
        }

        const config = itemData.getEnhancementConfig(target.item);
        if (!config) {
            this.showGenericModal(meta.modalTitle, '이 장비는 더 이상 강화할 수 없습니다.', null, null, { hideNo: true, yesText: '확인' });
            return;
        }

        if ((player.getInventoryItemCount?.(meta.stoneItemId) || 0) < 1) {
            this.pendingEnhancementStoneType = null;
            this.showGenericModal(meta.modalTitle, meta.shortageMessage, null, null, { hideNo: true, yesText: '확인' });
            this.updateInventory();
            return;
        }

        const finalizeSelectionState = () => {
            this.pendingEnhancementStoneType = null;
            this.selectedInventoryRef = null;
            this.closeInventoryItemModal(true);
        };

        const executeEnhance = async () => {
            const targetName = target.item.name;
            const result = player.enhanceWeapon(selection, {
                stoneType: meta.stoneType,
                deferUiRefresh: true
            });
            if (!result.ok) {
                this.pendingEnhancementStoneType = null;
                this.showGenericModal(`${meta.modalTitle} 실패`, result.message, null, null, { hideNo: true, yesText: '확인' });
                this.updateInventory();
                return;
            }

            finalizeSelectionState();
            const centerMessage = this.buildWeaponEnhancementCenterMessage(result);
            if (centerMessage) {
                this.showCenterMessage(centerMessage.text, centerMessage.color, {
                    durationMs: 1000,
                    lightweight: this.isLowPowerEnhancementMode()
                });
            }

            this.inventoryEnhancementAnimating = true;
            try {
                await this.playWeaponEnhancementSequence(selection, result);
            } finally {
                this.inventoryEnhancementAnimating = false;
            }

            if (result.success) {
                if (meta.stoneType === 'blessed') {
                    this.logSystemMessage(`✨ ${targetName} 축복 강화 성공 (${result.gain > 0 ? `+${result.gain}` : '유지'})`);
                } else {
                    this.logSystemMessage(`✨ ${targetName} +${result.nextLevel} 강화 성공`);
                }
            } else if (result.destroyed) {
                this.logSystemMessage(`💥 ${targetName} 강화 실패로 장비가 파괴되었습니다.`);
            } else if (meta.stoneType === 'blessed') {
                this.logSystemMessage(`✨ ${targetName} 축복 강화 유지`);
            } else {
                this.logSystemMessage(`⚠️ ${targetName} 강화 실패, 장비는 유지됩니다.`);
            }

            this.updateStatusPopup();
            this.updateInventory();
        };

        if (meta.stoneType === 'blessed') {
            this.showConfirm(
                `축복받은 무기 강화석으로 ${target.item.name}을(를) 강화하시겠습니까?<br><small>성공 50% / 실패 시 수치 유지 / 성공 시 +1~2 (최대 +${config.maxLevel})</small>`,
                (confirmed) => {
                    if (confirmed) executeEnhance();
                }
            );
            return;
        }

        if (config.destroyChanceOnFail > 0) {
            this.showConfirm(
                `+${config.nextLevel} 강화는 실패 시 장비가 파괴될 수 있습니다.<br><small>성공 ${Math.round(config.successRate * 100)}% / 파괴 ${Math.round(config.destroyChanceOnFail * 100)}%</small>`,
                (confirmed) => {
                    if (confirmed) executeEnhance();
                }
            );
            return;
        }

        executeEnhance();
    }

    // v2.1: Dialog System Methods
    showDialog(dialogData, options = {}) {
        if (!this.dialogBox) return;

        if (Array.isArray(dialogData)) {
            this.currentDialogQueue = [...dialogData];
        } else {
            this.currentDialogQueue = [dialogData];
        }

        this.waitingForOption = false;
        this.storyDialogActive = !!options.storyControlled;
        this.dialogBox.style.display = 'block';
        this.dialogBox.classList.remove('hidden');
        this.advanceDialog();
    }

    advanceDialog() {
        if (this.currentDialogQueue.length === 0 && !this.waitingForOption) {
            const shouldAdvanceStory = this.storyDialogActive && this.game.story?.isStoryActive;
            this.hideDialog();
            if (shouldAdvanceStory) {
                this.game.story.advance();
            }
            return;
        }

        if (this.waitingForOption) return; // Do not advance if waiting for user choice

        const data = this.currentDialogQueue.shift();
        if (this.dialogText) this.dialogText.textContent = data.text;
        if (this.dialogName) this.dialogName.textContent = data.name || '';

        // Handle Options
        const optionsContainer = document.getElementById('dialog-options'); // Assuming this exists or we create it
        if (optionsContainer) optionsContainer.innerHTML = '';

        if (data.options && data.options.length > 0) {
            this.waitingForOption = true;
            if (this.dialogNext) this.dialogNext.style.display = 'none'; // Hide Next button

            if (optionsContainer) {
                data.options.forEach((opt, index) => {
                    const btn = document.createElement('button');
                    btn.className = 'dialog-option-btn';
                    btn.textContent = opt.text;
                    btn.onclick = () => {
                        this.waitingForOption = false;
                        if (this.game.story) this.game.story.advance(index);
                        else this.advanceDialog(); // Fallback if no story manager
                    };
                    optionsContainer.appendChild(btn);
                });
            }
        } else {
            if (this.dialogNext) this.dialogNext.style.display = 'block';
        }
    }

    hideDialog() {
        if (this.dialogBox) this.dialogBox.style.display = 'none';
        if (this.dialogNext) this.dialogNext.style.display = 'block';
        const optionsContainer = document.getElementById('dialog-options');
        if (optionsContainer) optionsContainer.innerHTML = '';
        this.currentDialogQueue = [];
        this.waitingForOption = false;
        this.storyDialogActive = false;
    }

    // v2.3: Tutorial UI
    getTutorialViewportMode() {
        const isNarrow = window.innerWidth <= 1024;
        if (!isNarrow) return 'desktop';

        const isPortrait = window.matchMedia?.('(orientation: portrait)')?.matches ?? (window.innerHeight >= window.innerWidth);
        return isPortrait ? 'mobile-portrait' : 'mobile-landscape';
    }

    getVisibleElementRect(target) {
        const element = target instanceof Element
            ? target
            : (typeof target === 'string' ? document.querySelector(target) : null);
        if (!element) return null;
        if (!element.isConnected) return null;

        const style = window.getComputedStyle(element);
        if (
            style.display === 'none'
            || style.visibility === 'hidden'
            || Number.parseFloat(style.opacity || '1') < 0.05
        ) {
            return null;
        }

        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;

        return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
        };
    }

    normalizeTutorialRect(rect) {
        if (!rect) return null;

        const left = Number(rect.left);
        const top = Number(rect.top);
        const width = Number(rect.width);
        const height = Number(rect.height);
        if (![left, top, width, height].every((value) => Number.isFinite(value))) {
            return null;
        }
        if (width <= 0 || height <= 0) return null;

        return {
            left,
            top,
            right: left + width,
            bottom: top + height,
            width,
            height
        };
    }

    insetTutorialRect(rect, inset = 0) {
        if (!rect || !Number.isFinite(inset) || inset <= 0) return rect;

        const maxInset = Math.max(0, Math.min(
            inset,
            Math.floor((Math.min(rect.width, rect.height) - 8) / 2)
        ));
        if (maxInset <= 0) return rect;

        return this.normalizeTutorialRect({
            left: rect.left + maxInset,
            top: rect.top + maxInset,
            width: rect.width - (maxInset * 2),
            height: rect.height - (maxInset * 2)
        }) || rect;
    }

    applyTutorialRectInsets(rect, inset = 0) {
        if (!rect || inset === null || inset === undefined) return rect;
        if (Number.isFinite(inset)) {
            return inset >= 0
                ? this.insetTutorialRect(rect, inset)
                : (this.normalizeTutorialRect({
                    left: rect.left + inset,
                    top: rect.top + inset,
                    width: rect.width - (inset * 2),
                    height: rect.height - (inset * 2)
                }) || rect);
        }

        if (typeof inset !== 'object') return rect;

        const top = Number.isFinite(Number(inset.top)) ? Number(inset.top) : 0;
        const right = Number.isFinite(Number(inset.right)) ? Number(inset.right) : 0;
        const bottom = Number.isFinite(Number(inset.bottom)) ? Number(inset.bottom) : 0;
        const left = Number.isFinite(Number(inset.left)) ? Number(inset.left) : 0;

        return this.normalizeTutorialRect({
            left: rect.left + left,
            top: rect.top + top,
            width: rect.width - left - right,
            height: rect.height - top - bottom
        }) || rect;
    }

    getTutorialHighlightProfile() {
        const mode = this.getTutorialViewportMode();
        if (mode === 'mobile-portrait') {
            return {
                compactInset: 1,
                microInset: 1,
                compactPadding: 3,
                mediumPadding: 4,
                largePadding: 5,
                xLargePadding: 6,
                spotlightExtra: 1,
                frameTrim: 1
            };
        }

        if (mode === 'mobile-landscape') {
            return {
                compactInset: 2,
                microInset: 1,
                compactPadding: 2,
                mediumPadding: 3,
                largePadding: 4,
                xLargePadding: 5,
                spotlightExtra: 1,
                frameTrim: 1
            };
        }

        return {
            compactInset: 2,
            microInset: 1,
            compactPadding: 2,
            mediumPadding: 3,
            largePadding: 4,
            xLargePadding: 5,
            spotlightExtra: 1,
            frameTrim: 1
        };
    }

    getTutorialElementAnchorRect(element) {
        const baseRect = this.getVisibleElementRect(element);
        if (!baseRect) return null;

        const profile = this.getTutorialHighlightProfile();
        if (element.matches?.('.menu-btn, #btn-fullscreen, #btn-emote-shortcut')) {
            return this.insetTutorialRect(baseRect, profile.compactInset);
        }

        if (element.matches?.('.stat-up-btn, .stat-down-btn, .skill-up-btn, .close-popup, .inventory-item-modal-close')) {
            return this.insetTutorialRect(baseRect, profile.microInset);
        }

        return baseRect;
    }

    getTutorialHighlightPadding(rect, highlightMode = 'ring') {
        const profile = this.getTutorialHighlightProfile();
        const maxDim = Math.max(rect?.width || 0, rect?.height || 0);

        let padding = profile.xLargePadding;
        if (maxDim <= 64) {
            padding = profile.compactPadding;
        } else if (maxDim <= 120) {
            padding = profile.mediumPadding;
        } else if (maxDim <= 280) {
            padding = profile.largePadding;
        }

        if (highlightMode === 'spotlight') {
            padding += profile.spotlightExtra;
        } else if (highlightMode === 'frame') {
            padding = Math.max(1, padding - profile.frameTrim);
        }

        return padding;
    }

    getTutorialMovePadHintRect(config = {}) {
        const liveJoystickRect = this.getVisibleElementRect('#joystick-container');
        if (liveJoystickRect) return liveJoystickRect;

        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        if (!viewportW || !viewportH) return null;

        const areaRect = this.getVisibleElementRect('#joystick-area') || {
            left: 0,
            top: 0,
            right: viewportW * 0.6,
            bottom: viewportH,
            width: viewportW * 0.6,
            height: viewportH
        };
        const viewportMode = this.getTutorialViewportMode();
        const defaultSize = viewportMode === 'mobile-portrait'
            ? Math.min(188, Math.max(148, Math.round(Math.min(viewportW, viewportH) * 0.46)))
            : Math.min(168, Math.max(132, Math.round(Math.min(viewportW, viewportH) * 0.42)));
        const width = Math.max(96, Number.isFinite(Number(config.width))
            ? Number(config.width)
            : (Number.isFinite(Number(config.size)) ? Number(config.size) : defaultSize));
        const height = Math.max(96, Number.isFinite(Number(config.height))
            ? Number(config.height)
            : width);
        const offsetX = Number.isFinite(Number(config.offsetX))
            ? Number(config.offsetX)
            : (viewportMode === 'mobile-portrait' ? 18 : 20);
        const offsetY = Number.isFinite(Number(config.offsetY))
            ? Number(config.offsetY)
            : (viewportMode === 'mobile-portrait' ? 34 : 26);
        const minLeft = Math.max(10, areaRect.left + 10);
        const maxLeft = Math.max(minLeft, Math.min(viewportW - width - 10, areaRect.right - width - 10));
        const minTop = Math.max(10, areaRect.top + 10);
        const maxTop = Math.max(minTop, Math.min(viewportH - height - 10, areaRect.bottom - height - 10));
        const left = Math.min(maxLeft, Math.max(minLeft, areaRect.left + offsetX));
        const top = Math.min(maxTop, Math.max(minTop, areaRect.bottom - height - offsetY));

        return this.normalizeTutorialRect({
            left: Math.round(left),
            top: Math.round(top),
            width: Math.round(width),
            height: Math.round(height)
        });
    }

    getTutorialSkillDetailTriggerRect(config = {}) {
        const skillId = String(config.skillId || config.target || config.id || '').trim();
        if (!skillId) return null;

        const item = this.getSkillDetailAnchorElement?.(skillId)
            || document.querySelector(`#skill-item-${skillId}`);
        const itemRect = this.getVisibleElementRect(item);
        if (!itemRect) return null;

        let rect = itemRect;
        const upButtonRect = this.getVisibleElementRect(item?.querySelector?.('.skill-up-btn'));
        if (upButtonRect) {
            const excludeGap = Number.isFinite(Number(config.excludeGap))
                ? Number(config.excludeGap)
                : 8;
            rect = this.normalizeTutorialRect({
                left: itemRect.left,
                top: itemRect.top,
                width: Math.max(0, upButtonRect.left - itemRect.left - excludeGap),
                height: itemRect.height
            }) || itemRect;
        }

        return this.applyTutorialRectInsets(
            rect,
            config.trim ?? config.inset ?? { top: 2, right: 2, bottom: 2, left: 2 }
        );
    }

    resolveTutorialTargetRect(target) {
        if (!target) return null;

        if (target instanceof Element || typeof target === 'string') {
            return this.getTutorialElementAnchorRect(this.resolveTutorialHighlightTarget(target));
        }

        if (Array.isArray(target) || typeof target !== 'object') {
            return null;
        }

        if (target.type === 'move-pad-hint' || target.preset === 'move-pad-hint') {
            return this.getTutorialMovePadHintRect(target);
        }

        if (target.type === 'skill-detail-trigger' || target.preset === 'skill-detail-trigger') {
            return this.getTutorialSkillDetailTriggerRect(target);
        }

        const selectorTargets = Array.isArray(target.selectors)
            ? target.selectors
            : (target.selector ? [target.selector] : []);
        if (selectorTargets.length > 0) {
            const rects = selectorTargets
                .map((selector) => this.getTutorialElementAnchorRect(this.resolveTutorialHighlightTarget(selector)))
                .filter(Boolean);
            if (rects.length > 0) {
                return this.applyTutorialRectInsets(
                    this.getTutorialPrimaryFocusRect(rects),
                    target.inset ?? target.trim ?? 0
                );
            }
        }

        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const width = Number(target.width ?? target.w);
        const height = Number(target.height ?? target.h ?? target.width ?? target.w);
        let left = Number(target.left ?? target.x);
        let top = Number(target.top ?? target.y);
        const right = Number(target.right);
        const bottom = Number(target.bottom);

        if (!Number.isFinite(left) && Number.isFinite(right) && Number.isFinite(width)) {
            left = viewportW - right - width;
        }
        if (!Number.isFinite(top) && Number.isFinite(bottom) && Number.isFinite(height)) {
            top = viewportH - bottom - height;
        }

        return this.normalizeTutorialRect({ left, top, width, height });
    }

    getTutorialFocusRects(targets = []) {
        const normalizedTargets = Array.isArray(targets) ? targets : [targets];
        return normalizedTargets
            .map((target) => this.resolveTutorialTargetRect(target))
            .filter(Boolean);
    }

    getActivePopupRect() {
        const popupSelectors = [
            '#skill-detail-modal:not(.hidden) .skill-detail-modal-content',
            '#inventory-item-modal:not(.hidden) .inventory-item-modal-card',
            '#confirm-modal:not(.hidden) .confirm-content',
            '#reward-modal:not(.hidden) .confirm-modal-content',
            '#history-modal:not(.hidden) .confirm-modal-content',
            '#generic-modal:not(.hidden) .confirm-modal-content',
            '#popup-overlay:not(.hidden) .game-popup:not(.hidden)'
        ];

        for (const selector of popupSelectors) {
            const rect = this.getVisibleElementRect(selector);
            if (rect) return rect;
        }

        return null;
    }

    getRectContains(inner, outer) {
        if (!inner || !outer) return false;
        return inner.left >= outer.left
            && inner.right <= outer.right
            && inner.top >= outer.top
            && inner.bottom <= outer.bottom;
    }

    getTutorialPrimaryFocusRect(focusRects = []) {
        if (!focusRects.length) return null;
        if (focusRects.length === 1) return focusRects[0];

        const left = Math.min(...focusRects.map((rect) => rect.left));
        const top = Math.min(...focusRects.map((rect) => rect.top));
        const right = Math.max(...focusRects.map((rect) => rect.right));
        const bottom = Math.max(...focusRects.map((rect) => rect.bottom));

        return {
            left,
            top,
            right,
            bottom,
            width: right - left,
            height: bottom - top
        };
    }

    getActivePopupAvoidZones() {
        const currentStep = this.game?.tutorial?.getCurrentStep?.();
        const preserveStatusPanels = currentStep?.trigger !== 'stats_saved';
        const preserveWholeSkillPopup = (
            currentStep?.target === 'skill-popup'
            || ['skill_detail_open', 'skill_detail_close', 'skill_upgrade'].includes(currentStep?.trigger)
        );
        const popupZoneSelectors = [
            ...(preserveStatusPanels ? [
                '#status-popup:not(.hidden) #status-derived-panel',
                '#status-popup:not(.hidden) #status-stat-main',
                '#status-popup:not(.hidden) .status-basic-info'
            ] : []),
            ...(preserveWholeSkillPopup
                ? ['#skill-popup:not(.hidden)']
                : [
                    '#skill-popup:not(.hidden) .skill-content-wrapper',
                    '#skill-popup:not(.hidden) .skill-point-info'
                ]),
            '#skill-detail-modal:not(.hidden) .skill-detail-modal-header',
            '#skill-detail-modal:not(.hidden) #skill-detail-modal-body',
            '#inventory-popup:not(.hidden) #inventory-grid',
            '#inventory-item-modal:not(.hidden) .inventory-detail-head',
            '#inventory-item-modal:not(.hidden) #inventory-detail-desc',
            '#inventory-item-modal:not(.hidden) #inventory-detail-stats',
            '#confirm-modal:not(.hidden) .confirm-content',
            '#reward-modal:not(.hidden) .reward-content',
            '#history-modal:not(.hidden) .history-content',
            '#generic-modal:not(.hidden) .confirm-modal-content'
        ];

        return popupZoneSelectors
            .map((selector) => this.getVisibleElementRect(selector))
            .filter(Boolean);
    }

    clampTutorialGuidePosition(left, top, width, height, margin = 16) {
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        return {
            left: Math.round(Math.min(Math.max(margin, left), Math.max(margin, viewportW - width - margin))),
            top: Math.round(Math.min(Math.max(margin, top), Math.max(margin, viewportH - height - margin)))
        };
    }

    clampFloatingPanelPosition(left, top, width, height, margin = 12) {
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        return {
            left: Math.round(Math.min(Math.max(margin, left), Math.max(margin, viewportW - width - margin))),
            top: Math.round(Math.min(Math.max(margin, top), Math.max(margin, viewportH - height - margin)))
        };
    }

    getTutorialForbiddenZones(focusRects = [], payload = this.tutorialGuideState) {
        const selectors = [
            '#minimap-container',
            '.minimap-menu',
            '#btn-fullscreen',
            '#btn-fullscreen-exit',
            '#btn-emote-shortcut',
            '#party-panel:not(.hidden)',
            '#hostility-panel:not(.hidden)',
            '.quest-list-panel',
            '.chat-window',
            '.action-buttons',
            '#joystick-container',
            '#dialog-box:not(.hidden)'
        ];

        if (this.shouldReserveTutorialJoystickZone()) {
            selectors.push('#joystick-area');
        }

        const zones = selectors
            .map((selector) => this.getVisibleElementRect(selector))
            .filter(Boolean);

        if (payload?.avoidTargets) {
            zones.push(...this.getTutorialFocusRects(payload.avoidTargets));
        }

        zones.push(...this.getActivePopupAvoidZones());

        const popupRect = this.getActivePopupRect();
        const shouldReservePopup = popupRect && !focusRects.some((rect) => this.getRectContains(rect, popupRect));
        if (shouldReservePopup && payload?.mode !== 'dock-left') zones.push(popupRect);

        return zones;
    }

    shouldReserveTutorialJoystickZone() {
        if (this.uiLayoutEditMode) return true;
        const touch = this.game?.touch;
        if (!touch) return false;
        return !!touch.fixedJoystickLayout || !!touch.joystick?.active;
    }

    getTutorialGuideDimensions(payload, context = {}) {
        const mode = this.getTutorialViewportMode();
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const compactRatio = payload?.compact ? 0.9 : 1;
        const popupInline = !!context.focusInsidePopup;
        const popupRect = context.popupRect;
        const requestedMode = payload?.mode || 'top-card';

        if (requestedMode === 'popup-header-strip') {
            const popupWidth = popupRect?.width || viewportW;
            const baseWidth = Math.min(Math.round(popupWidth * 0.56 * compactRatio), mode === 'mobile-landscape' ? 300 : 340);
            return {
                width: Math.max(196, baseWidth),
                maxHeight: Math.min(Math.round(viewportH * 0.17), payload?.compact ? 110 : 126)
            };
        }

        if (requestedMode === 'viewport-bottom-sheet-safe') {
            return {
                width: Math.min(Math.round(viewportW * 0.84), payload?.compact ? 320 : 360),
                maxHeight: Math.min(Math.round(viewportH * 0.18), payload?.compact ? 120 : 138)
            };
        }

        if (popupInline) {
            if (mode === 'mobile-landscape') {
                return {
                    width: Math.min(Math.round(viewportW * 0.22 * compactRatio), 220),
                    maxHeight: Math.min(Math.round(viewportH * 0.34), payload?.compact ? 144 : 156)
                };
            }

            if (mode === 'mobile-portrait') {
                const popupWidth = popupRect?.width || viewportW;
                const availableWidth = Math.max(176, popupWidth - 28);
                return {
                    width: Math.min(Math.round(availableWidth * 0.72 * compactRatio), 244),
                    maxHeight: Math.min(Math.round(viewportH * 0.22), payload?.compact ? 134 : 152)
                };
            }

            return {
                width: Math.min(Math.round(viewportW * 0.22), 280),
                maxHeight: Math.min(Math.round(viewportH * 0.24), 148)
            };
        }

        if (mode === 'mobile-landscape') {
            return {
                width: Math.min(Math.round(viewportW * 0.3 * compactRatio), payload?.compact ? 280 : 320),
                maxHeight: Math.round(viewportH * 0.44)
            };
        }

        if (mode === 'mobile-portrait') {
            return {
                width: Math.min(Math.round(viewportW * 0.84), payload?.compact ? 320 : 360),
                maxHeight: Math.round(viewportH * 0.28)
            };
        }

        return {
            width: Math.min(Math.round(viewportW * (payload?.compact ? 0.28 : 0.32)), 420),
            maxHeight: Math.round(viewportH * 0.38)
        };
    }

    buildTutorialGuideCandidates(guideMode, width, height, focusRects = [], options = {}) {
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const viewportMode = options.viewportMode || this.getTutorialViewportMode();
        const margin = 16;
        const clampLeft = (value) => Math.min(Math.max(margin, value), Math.max(margin, viewportW - width - margin));
        const clampTop = (value) => Math.min(Math.max(margin, value), Math.max(margin, viewportH - height - margin));
        const candidates = [];
        const pushCandidate = (left, top, kind = guideMode) => {
            candidates.push({
                left: Math.round(clampLeft(left)),
                top: Math.round(clampTop(top)),
                width,
                height,
                kind
            });
        };

        const centerLeft = (viewportW - width) / 2;
        const bottomTop = viewportH - height - margin;
        const rightLeft = viewportW - width - margin;
        const leftLeft = margin;
        const primaryFocusRect = options.primaryFocusRect || this.getTutorialPrimaryFocusRect(focusRects);

        if (primaryFocusRect && !options.disableTargetAnchors) {
            const focus = primaryFocusRect;
            pushCandidate(focus.left + (focus.width / 2) - (width / 2), focus.top - height - 14, 'target-top');
            pushCandidate(focus.left + (focus.width / 2) - (width / 2), focus.bottom + 14, 'target-bottom');
            pushCandidate(focus.right + 14, focus.top + (focus.height / 2) - (height / 2), 'target-right');
            pushCandidate(focus.left - width - 14, focus.top + (focus.height / 2) - (height / 2), 'target-left');
        }

        if (options.popupRect) {
            const popup = options.popupRect;
            const popupCenterLeft = popup.left + (popup.width / 2) - (width / 2);
            const focus = primaryFocusRect;

            if (viewportMode === 'mobile-portrait') {
                const popupMargin = 12;
                const headerBandOffset = Math.min(Math.max(72, popup.height * 0.14), 96);
                const footerBandOffset = Math.min(Math.max(78, popup.height * 0.15), 108);
                const topBandTop = popup.top + headerBandOffset;
                const bottomBandTop = popup.bottom - footerBandOffset - height;
                const leftBandLeft = popup.left + popupMargin;
                const rightBandLeft = popup.right - width - popupMargin;
                const topBandCandidates = [
                    { left: popupCenterLeft, top: topBandTop, kind: 'popup-band-top-center' },
                    { left: leftBandLeft, top: topBandTop, kind: 'popup-band-top-left' },
                    { left: rightBandLeft, top: topBandTop, kind: 'popup-band-top-right' }
                ];
                const bottomBandCandidates = [
                    { left: popupCenterLeft, top: bottomBandTop, kind: 'popup-band-bottom-center' },
                    { left: leftBandLeft, top: bottomBandTop, kind: 'popup-band-bottom-left' },
                    { left: rightBandLeft, top: bottomBandTop, kind: 'popup-band-bottom-right' }
                ];
                const focusCenterY = focus ? focus.top + (focus.height / 2) : popup.top + (popup.height / 2);
                const preferBottomBand = focusCenterY < popup.top + (popup.height * 0.48);
                pushCandidate(popupCenterLeft, popup.top - height - 12, 'popup-top');
                pushCandidate(popupCenterLeft, popup.bottom + 12, 'popup-bottom');
                const orderedBandCandidates = preferBottomBand
                    ? [...bottomBandCandidates, ...topBandCandidates]
                    : [...topBandCandidates, ...bottomBandCandidates];
                orderedBandCandidates.forEach((candidate) => pushCandidate(candidate.left, candidate.top, candidate.kind));
            } else if (viewportMode === 'mobile-landscape') {
                pushCandidate(popupCenterLeft, popup.top - height - 14, 'popup-top');
                pushCandidate(popupCenterLeft, popup.bottom + 14, 'popup-bottom');
                pushCandidate(popup.right + 14, popup.top + 12, 'popup-right-top');
                pushCandidate(popup.right + 14, popup.bottom - height - 12, 'popup-right-bottom');
                pushCandidate(popup.left - width - 14, popup.top + 12, 'popup-left-top');
                pushCandidate(popup.left - width - 14, popup.bottom - height - 12, 'popup-left-bottom');
            } else {
                pushCandidate(popupCenterLeft, popup.top - height - 18, 'popup-top');
                pushCandidate(popupCenterLeft, popup.bottom + 18, 'popup-bottom');
                pushCandidate(popup.right + 18, popup.top + (popup.height / 2) - (height / 2), 'popup-right');
                pushCandidate(popup.left - width - 18, popup.top + (popup.height / 2) - (height / 2), 'popup-left');

                const popupMargin = 18;
                const insetCandidates = [
                    { left: popup.left + popupMargin, top: popup.top + popupMargin, kind: 'popup-inset-top-left' },
                    { left: popup.right - width - popupMargin, top: popup.top + popupMargin, kind: 'popup-inset-top-right' },
                    { left: popup.left + popupMargin, top: popup.bottom - height - popupMargin, kind: 'popup-inset-bottom-left' },
                    { left: popup.right - width - popupMargin, top: popup.bottom - height - popupMargin, kind: 'popup-inset-bottom-right' }
                ];

                if (focus) {
                    const focusCenterX = focus.left + (focus.width / 2);
                    const focusCenterY = focus.top + (focus.height / 2);
                    insetCandidates.sort((a, b) => {
                        const aCenterX = a.left + (width / 2);
                        const aCenterY = a.top + (height / 2);
                        const bCenterX = b.left + (width / 2);
                        const bCenterY = b.top + (height / 2);
                        const aDistance = Math.hypot(aCenterX - focusCenterX, aCenterY - focusCenterY);
                        const bDistance = Math.hypot(bCenterX - focusCenterX, bCenterY - focusCenterY);
                        return bDistance - aDistance;
                    });
                }

                insetCandidates.forEach((candidate) => pushCandidate(candidate.left, candidate.top, candidate.kind));
            }
        }

        switch (guideMode) {
            case 'dock-left':
                pushCandidate(leftLeft, viewportH * 0.16);
                pushCandidate(leftLeft, margin);
                pushCandidate(centerLeft, margin);
                pushCandidate(rightLeft, margin);
                break;
            case 'left-card':
                pushCandidate(leftLeft, viewportH * 0.22);
                pushCandidate(leftLeft, margin);
                pushCandidate(leftLeft, viewportH - height - 96);
                pushCandidate(centerLeft, margin);
                break;
            case 'bottom-sheet':
                pushCandidate(centerLeft, bottomTop);
                pushCandidate(leftLeft, bottomTop);
                pushCandidate(rightLeft, bottomTop);
                pushCandidate(centerLeft, viewportH - height - 96);
                break;
            case 'floating-compact':
                pushCandidate(centerLeft, margin);
                pushCandidate(centerLeft, viewportH * 0.18);
                pushCandidate(rightLeft, margin);
                pushCandidate(leftLeft, margin);
                break;
            case 'popup-near-left':
                if (primaryFocusRect || options.popupRect) {
                    const basis = primaryFocusRect || options.popupRect;
                    pushCandidate(basis.left - width - 18, basis.top + 8, 'popup-near-left');
                    pushCandidate(basis.left - width - 18, basis.bottom - height - 8, 'popup-near-left-bottom');
                    pushCandidate(basis.left + 8, basis.top - height - 16, 'popup-near-left-top');
                }
                pushCandidate(leftLeft, margin);
                pushCandidate(centerLeft, margin);
                break;
            case 'popup-near-right':
                if (primaryFocusRect || options.popupRect) {
                    const basis = primaryFocusRect || options.popupRect;
                    pushCandidate(basis.right + 18, basis.top + 8, 'popup-near-right');
                    pushCandidate(basis.right + 18, basis.bottom - height - 8, 'popup-near-right-bottom');
                    pushCandidate(basis.right - width - 8, basis.top - height - 16, 'popup-near-right-top');
                }
                pushCandidate(rightLeft, margin);
                pushCandidate(centerLeft, margin);
                break;
            case 'popup-header-strip':
                if (options.popupRect || primaryFocusRect) {
                    const basis = options.popupRect || primaryFocusRect;
                    const centeredLeft = basis.left + (basis.width / 2) - (width / 2);
                    pushCandidate(centeredLeft, basis.top - height - 14, 'popup-header-strip-top');
                    pushCandidate(centeredLeft, basis.top + 10, 'popup-header-strip-inline');
                    pushCandidate(basis.left + 10, basis.top - height - 14, 'popup-header-strip-left');
                    pushCandidate(basis.right - width - 10, basis.top - height - 14, 'popup-header-strip-right');
                }
                pushCandidate(centerLeft, margin);
                pushCandidate(centerLeft, margin + 18);
                break;
            case 'viewport-bottom-sheet-safe': {
                const blockerRects = [
                    '#joystick-container',
                    '.action-buttons',
                    '#dialog-box:not(.hidden)'
                ]
                    .map((selector) => this.getVisibleElementRect(selector))
                    .filter(Boolean);
                if (this.shouldReserveTutorialJoystickZone()) {
                    const joystickAreaRect = this.getVisibleElementRect('#joystick-area');
                    if (joystickAreaRect) blockerRects.push(joystickAreaRect);
                }
                const topMostBlocker = blockerRects.reduce((minTop, rect) => Math.min(minTop, rect.top), viewportH);
                const safeBottomTop = Math.min(bottomTop, topMostBlocker - height - 14);
                if (options.popupRect) {
                    const popup = options.popupRect;
                    pushCandidate(centerLeft, popup.bottom + 14, 'viewport-bottom-sheet-gap');
                    pushCandidate(leftLeft, popup.bottom + 14, 'viewport-bottom-sheet-gap-left');
                    pushCandidate(rightLeft, popup.bottom + 14, 'viewport-bottom-sheet-gap-right');
                    pushCandidate(centerLeft, popup.top - height - 14, 'viewport-bottom-sheet-above-popup');
                }
                pushCandidate(centerLeft, safeBottomTop, 'viewport-bottom-sheet-safe');
                pushCandidate(leftLeft, safeBottomTop, 'viewport-bottom-sheet-safe-left');
                pushCandidate(rightLeft, safeBottomTop, 'viewport-bottom-sheet-safe-right');
                pushCandidate(centerLeft, bottomTop, 'viewport-bottom-sheet-bottom');
                break;
            }
            case 'popup-near-top':
                if (options.popupRect || primaryFocusRect) {
                    const basis = options.popupRect || primaryFocusRect;
                    pushCandidate(basis.left + (basis.width / 2) - (width / 2), basis.top - height - 16, 'popup-near-top');
                    pushCandidate(basis.left + (basis.width / 2) - (width / 2), basis.bottom + 16, 'popup-near-bottom');
                }
                pushCandidate(centerLeft, margin);
                pushCandidate(centerLeft, bottomTop);
                break;
            case 'top-card':
            default:
                pushCandidate(centerLeft, margin);
                pushCandidate(leftLeft, margin);
                pushCandidate(rightLeft, margin);
                pushCandidate(centerLeft, viewportH * 0.18);
                break;
        }

        return candidates;
    }

    getRectOverlapArea(a, b) {
        const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        return width * height;
    }

    isSkillPopupTutorialStep(stepId = '') {
        return new Set([
            'open_skill',
            'inspect_laser_detail',
            'close_laser_detail',
            'upgrade_laser'
        ]).has(stepId);
    }

    scoreTutorialGuideCandidate(candidate, forbiddenZones = [], focusRects = [], order = 0) {
        const rect = {
            left: candidate.left,
            top: candidate.top,
            right: candidate.left + candidate.width,
            bottom: candidate.top + candidate.height,
            width: candidate.width,
            height: candidate.height
        };

        let score = order * 24;
        forbiddenZones.forEach((zone) => {
            score += this.getRectOverlapArea(rect, zone) * 1.15;
        });
        focusRects.forEach((zone) => {
            score += this.getRectOverlapArea(rect, zone) * 2.4;
        });

        const primaryFocusRect = this.getTutorialPrimaryFocusRect(focusRects);
        if (primaryFocusRect) {
            const rectCenterX = rect.left + (rect.width / 2);
            const rectCenterY = rect.top + (rect.height / 2);
            const focusCenterX = primaryFocusRect.left + (primaryFocusRect.width / 2);
            const focusCenterY = primaryFocusRect.top + (primaryFocusRect.height / 2);
            const distance = Math.hypot(rectCenterX - focusCenterX, rectCenterY - focusCenterY);
            score += distance * 3.2;

            if (distance > Math.max(window.innerWidth, window.innerHeight) * 0.45) {
                score += 900;
            }
        }

        const centerPenaltyZone = {
            left: window.innerWidth * 0.22,
            top: window.innerHeight * 0.2,
            right: window.innerWidth * 0.78,
            bottom: window.innerHeight * 0.8
        };
        score += this.getRectOverlapArea(rect, centerPenaltyZone) * 0.05;

        return score;
    }

    applyTutorialGuideLayout(guide, payload = this.tutorialGuideState) {
        if (!guide || !payload) return;

        const mode = this.getTutorialViewportMode();
        const focusTargets = this.getTutorialRuntimeFocusTargets(
            this.game?.tutorial?.getCurrentStep?.(),
            payload.focusTargets || this.tutorialHighlightTargets
        );
        const focusRects = this.getTutorialFocusRects(focusTargets);
        const primaryFocusRect = this.getTutorialPrimaryFocusRect(focusRects);
        const popupRect = this.getActivePopupRect();
        const focusInsidePopup = popupRect && focusRects.some((rect) => this.getRectContains(rect, popupRect));
        const actionButtonsRect = this.getVisibleElementRect('.action-buttons');
        const hudRects = [
            actionButtonsRect,
            this.getVisibleElementRect('.minimap-menu'),
            this.getVisibleElementRect('#minimap-container'),
            this.getVisibleElementRect('#btn-fullscreen'),
            this.getVisibleElementRect('#btn-fullscreen-exit'),
            this.getVisibleElementRect('#btn-emote-shortcut'),
            this.getVisibleElementRect('#party-panel:not(.hidden)'),
            this.getVisibleElementRect('#hostility-panel:not(.hidden)')
        ].filter(Boolean);
        const focusTouchesHud = !!primaryFocusRect && hudRects.some((rect) => this.getRectOverlapArea(primaryFocusRect, rect) > 0);
        const focusTouchesActionButtons = !!primaryFocusRect
            && !!actionButtonsRect
            && this.getRectOverlapArea(primaryFocusRect, actionButtonsRect) > 0;
        const shouldProtectSkillPopup = mode === 'mobile-landscape' && this.isSkillPopupTutorialStep(payload.stepId);
        const popupGenericModes = new Set(['dock-left', 'left-card', 'bottom-sheet', 'top-card', 'popup-near-top']);
        let guideMode = payload.mode || 'top-card';

        if (focusInsidePopup) {
            if (mode === 'mobile-portrait' && popupGenericModes.has(guideMode)) {
                guideMode = 'viewport-bottom-sheet-safe';
            } else if (mode === 'mobile-landscape' && (shouldProtectSkillPopup || popupGenericModes.has(guideMode))) {
                guideMode = 'popup-header-strip';
            }
        } else if (focusTouchesHud) {
            if (mode === 'mobile-portrait') {
                guideMode = payload.stepId === 'open_inventory'
                    ? 'top-card'
                    : (focusTouchesActionButtons ? 'top-card' : 'viewport-bottom-sheet-safe');
            } else if (mode === 'mobile-landscape') {
                guideMode = 'left-card';
            }
        }

        const guideDimensions = this.getTutorialGuideDimensions({ ...payload, mode: guideMode }, { focusInsidePopup, popupRect });
        const forbiddenZones = this.getTutorialForbiddenZones(focusRects, payload);
        const disableTargetAnchors = guideMode !== 'floating-compact';
        if (focusInsidePopup && mode === 'mobile-landscape' && popupRect) {
            forbiddenZones.push(popupRect);
        }
        if (!focusInsidePopup && popupRect) {
            forbiddenZones.push(popupRect);
        }

        guide.dataset.guideMode = guideMode;
        guide.dataset.stepType = payload.stepType || 'info';
        guide.dataset.align = payload.align || 'left';
        guide.classList.toggle('tutorial-guide-compact', !!payload.compact);
        const popupInlineStyle = !!focusInsidePopup && guideMode !== 'viewport-bottom-sheet-safe';
        guide.classList.toggle('tutorial-guide-popup-inline', popupInlineStyle);

        guide.style.position = 'fixed';
        guide.style.left = '-9999px';
        guide.style.top = '-9999px';
        guide.style.right = 'auto';
        guide.style.bottom = 'auto';
        guide.style.transform = 'none';
        guide.style.boxSizing = 'border-box';
        guide.style.pointerEvents = 'auto';
        guide.style.zIndex = '4600';
        guide.style.width = `${guideDimensions.width}px`;
        guide.style.maxWidth = `${guideDimensions.width}px`;
        guide.style.maxHeight = `${guideDimensions.maxHeight}px`;
        guide.style.overflowY = 'auto';
        guide.style.display = 'block';
        guide.style.visibility = 'hidden';

        const measuredScrollHeight = Math.ceil(guide.scrollHeight || 0);
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const popupAwareMaxHeight = popupRect
            ? Math.max(
                guideDimensions.maxHeight,
                Math.min(
                    Math.round(popupRect.height * (mode === 'mobile-landscape' ? 0.36 : 0.4)),
                    Math.round(viewportH * (mode === 'mobile-landscape' ? 0.42 : 0.48))
                )
            )
            : guideDimensions.maxHeight;
        const relaxedMaxHeight = focusInsidePopup
            ? Math.max(
                guideDimensions.maxHeight,
                Math.min(measuredScrollHeight + 4, popupAwareMaxHeight)
            )
            : guideDimensions.maxHeight;

        guide.style.maxHeight = `${relaxedMaxHeight}px`;
        guide.style.overflowY = measuredScrollHeight > relaxedMaxHeight ? 'auto' : 'visible';

        const rect = guide.getBoundingClientRect();
        const width = Math.min(guideDimensions.width, rect.width || guideDimensions.width);
        const height = Math.min(relaxedMaxHeight, rect.height || relaxedMaxHeight);
        const manualPosition = this.tutorialGuideManualPosition?.stepId === payload.stepId
            ? this.clampTutorialGuidePosition(
                this.tutorialGuideManualPosition.left,
                this.tutorialGuideManualPosition.top,
                width,
                height
            )
            : null;

        if (manualPosition) {
            guide.style.left = `${manualPosition.left}px`;
            guide.style.top = `${manualPosition.top}px`;
            this.tutorialGuideManualPosition = {
                ...this.tutorialGuideManualPosition,
                ...manualPosition
            };
        } else {
            const candidates = this.buildTutorialGuideCandidates(guideMode, width, height, focusRects, {
                disableTargetAnchors,
                popupRect: focusInsidePopup ? popupRect : null,
                viewportMode: mode,
                primaryFocusRect
            });
            const bestCandidate = candidates.reduce((best, candidate, index) => {
                const score = this.scoreTutorialGuideCandidate(candidate, forbiddenZones, focusRects, index);
                if (!best || score < best.score) {
                    return { ...candidate, score };
                }
                return best;
            }, null);

            guide.style.left = `${bestCandidate?.left ?? 16}px`;
            guide.style.top = `${bestCandidate?.top ?? 16}px`;
        }
        guide.style.visibility = 'visible';
    }

    beginTutorialGuideDrag(e) {
        const guide = document.getElementById('tutorial-guide');
        if (!guide || guide.style.display === 'none' || !this.tutorialGuideState) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        e.preventDefault();
        e.stopPropagation();

        const rect = guide.getBoundingClientRect();
        this.tutorialGuideDragState = {
            active: true,
            pointerId: e.pointerId,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
            stepId: this.tutorialGuideState.stepId || '',
            captureTarget: e.currentTarget || guide
        };

        this.tutorialGuideDragState.captureTarget?.setPointerCapture?.(e.pointerId);
        guide.classList.add('tutorial-guide-dragging');
    }

    handleTutorialGuideDragMove(e) {
        if (!this?.tutorialGuideDragState?.active) return;
        if (this.tutorialGuideDragState.pointerId !== null && e.pointerId !== this.tutorialGuideDragState.pointerId) return;

        const guide = document.getElementById('tutorial-guide');
        if (!guide || !this.tutorialGuideState) return;

        e.preventDefault();

        const rect = guide.getBoundingClientRect();
        const nextLeft = e.clientX - this.tutorialGuideDragState.offsetX;
        const nextTop = e.clientY - this.tutorialGuideDragState.offsetY;
        const clamped = this.clampTutorialGuidePosition(nextLeft, nextTop, rect.width, rect.height);

        this.tutorialGuideManualPosition = {
            left: clamped.left,
            top: clamped.top,
            stepId: this.tutorialGuideState.stepId || ''
        };

        guide.style.left = `${clamped.left}px`;
        guide.style.top = `${clamped.top}px`;
    }

    handleTutorialGuideDragEnd(e) {
        if (!this?.tutorialGuideDragState?.active) return;
        if (
            this.tutorialGuideDragState.pointerId !== null
            && e?.pointerId !== undefined
            && e.pointerId !== this.tutorialGuideDragState.pointerId
        ) {
            return;
        }

        const captureTarget = this.tutorialGuideDragState.captureTarget;
        this.tutorialGuideDragState = {
            active: false,
            pointerId: null,
            offsetX: 0,
            offsetY: 0,
            stepId: '',
            captureTarget: null
        };

        captureTarget?.releasePointerCapture?.(e?.pointerId);
        document.getElementById('tutorial-guide')?.classList.remove('tutorial-guide-dragging');
    }

    beginFloatingPanelDrag(e, panel) {
        if (!panel || panel.classList.contains('hidden')) return;
        if (this.uiLayoutEditMode && panel.matches?.('#party-panel')) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target?.closest?.('button, input, textarea, select, a')) return;

        e.preventDefault();
        e.stopPropagation();

        const rect = panel.getBoundingClientRect();
        const preserveTransform = panel.dataset.preserveFloatingTransform === 'true';
        const computedStyle = window.getComputedStyle(panel);
        const activeTransform = panel.style.transform || (computedStyle.transform !== 'none' ? computedStyle.transform : '');
        const activeTransformOrigin = panel.style.transformOrigin || computedStyle.transformOrigin || 'top left';
        panel.style.setProperty('position', 'fixed', 'important');
        panel.style.setProperty('left', `${Math.round(rect.left)}px`, 'important');
        panel.style.setProperty('top', `${Math.round(rect.top)}px`, 'important');
        panel.style.setProperty('right', 'auto', 'important');
        panel.style.setProperty('bottom', 'auto', 'important');
        if (preserveTransform) {
            if (activeTransform) {
                panel.style.setProperty('transform', activeTransform, 'important');
            } else {
                panel.style.removeProperty('transform');
            }
            panel.style.setProperty('transform-origin', activeTransformOrigin, 'important');
        } else {
            panel.style.setProperty('transform', 'none', 'important');
            panel.style.removeProperty('transform-origin');
        }
        panel.style.setProperty('margin', '0', 'important');
        if (panel.matches?.('#party-panel')) {
            panel.style.setProperty('z-index', '1545', 'important');
        }

        this.floatingPanelDragState = {
            active: true,
            pointerId: e.pointerId,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
            panel,
            captureTarget: e.currentTarget || panel
        };

        this.floatingPanelDragState.captureTarget?.setPointerCapture?.(e.pointerId);
        panel.classList.add('floating-panel-dragging');
    }

    handleFloatingPanelDragMove(e) {
        if (!this?.floatingPanelDragState?.active) return;
        if (this.floatingPanelDragState.pointerId !== null && e.pointerId !== this.floatingPanelDragState.pointerId) return;

        const panel = this.floatingPanelDragState.panel;
        if (!panel?.isConnected) {
            this.handleFloatingPanelDragEnd();
            return;
        }

        e.preventDefault();

        const rect = panel.getBoundingClientRect();
        const nextLeft = e.clientX - this.floatingPanelDragState.offsetX;
        const nextTop = e.clientY - this.floatingPanelDragState.offsetY;
        const clamped = this.clampFloatingPanelPosition(nextLeft, nextTop, rect.width, rect.height);

        panel.style.setProperty('left', `${clamped.left}px`, 'important');
        panel.style.setProperty('top', `${clamped.top}px`, 'important');
    }

    handleFloatingPanelDragEnd(e) {
        if (!this?.floatingPanelDragState?.active) return;
        if (
            this.floatingPanelDragState.pointerId !== null
            && e?.pointerId !== undefined
            && e.pointerId !== this.floatingPanelDragState.pointerId
        ) {
            return;
        }

        const { captureTarget, panel } = this.floatingPanelDragState;
        this.floatingPanelDragState = {
            active: false,
            pointerId: null,
            offsetX: 0,
            offsetY: 0,
            panel: null,
            captureTarget: null
        };

        captureTarget?.releasePointerCapture?.(e?.pointerId);
        if (panel?.matches?.('#party-panel')) {
            panel.style.setProperty('z-index', '1535', 'important');
        }
        panel?.classList.remove('floating-panel-dragging');
    }

    setupDraggableFloatingPanels() {
        const draggablePanels = [
            { panelSelector: '#party-panel', headerSelector: '.panel-header' },
            { panelSelector: '#hostility-panel', headerSelector: '.panel-header' },
            { panelSelector: '#ui-layout-editor .ui-layout-editor-card', headerSelector: '.ui-layout-editor-header' }
        ];

        draggablePanels.forEach(({ panelSelector, headerSelector }) => {
            document.querySelectorAll(panelSelector).forEach((panel) => {
                const header = panel.querySelector(headerSelector);
                if (!header || header.dataset.dragBound === 'true') return;

                header.dataset.dragBound = 'true';
                header.classList.add('draggable-panel-handle');
                header.addEventListener('pointerdown', (e) => this.beginFloatingPanelDrag(e, panel));
            });
        });
    }

    refreshTutorialGuideLayout() {
        const guide = document.getElementById('tutorial-guide');
        if (!guide || guide.classList.contains('hidden') || !this.tutorialGuideState) return;
        this.applyTutorialGuideLayout(guide, this.tutorialGuideState);
    }

    showTutorialGuide(payload) {
        const normalizedPayload = typeof payload === 'string'
            ? {
                title: '튜토리얼',
                text: payload,
                mode: 'top-card',
                align: 'left',
                compact: false,
                stepType: 'info',
                focusTargets: [],
                avoidTargets: []
            }
            : {
                title: payload?.title || '튜토리얼',
                text: payload?.text || '',
                mode: payload?.mode || 'top-card',
                align: payload?.align || 'left',
                compact: !!payload?.compact,
                stepType: payload?.stepType || 'info',
                stepId: payload?.stepId || '',
                stepNumber: payload?.stepNumber || 0,
                totalSteps: payload?.totalSteps || 0,
                focusTargets: payload?.focusTargets || [],
                avoidTargets: payload?.avoidTargets || []
            };

        let guide = document.getElementById('tutorial-guide');
        if (!guide) {
            guide = document.createElement('div');
            guide.id = 'tutorial-guide';
            document.body.appendChild(guide);
        }

        const shouldResetManualPosition = this.tutorialGuideState?.stepId !== normalizedPayload.stepId;
        if (shouldResetManualPosition) {
            guide.style.display = 'none';
            this.clearTutorialHighlightLayer();
            this.tutorialGuideManualPosition = null;
            this.handleTutorialGuideDragEnd();
            this.tutorialDimSuppressed = false;
            this.tutorialDimSuppressedStepId = '';
        }

        this.tutorialGuideState = normalizedPayload;
        guide.innerHTML = '';

        const head = document.createElement('div');
        head.className = 'tutorial-guide-head';
        head.setAttribute('role', 'button');
        head.setAttribute('aria-label', '튜토리얼 가이드 이동');
        head.tabIndex = 0;

        const eyebrow = document.createElement('div');
        eyebrow.className = 'tutorial-guide-eyebrow';
        eyebrow.textContent = normalizedPayload.title;
        head.appendChild(eyebrow);

        if (normalizedPayload.stepNumber && normalizedPayload.totalSteps) {
            const stepCounter = document.createElement('div');
            stepCounter.className = 'tutorial-guide-step';
            stepCounter.textContent = `${normalizedPayload.stepNumber}/${normalizedPayload.totalSteps}`;
            head.appendChild(stepCounter);
        }

        const dragHandle = document.createElement('div');
        dragHandle.className = 'tutorial-guide-drag-handle';
        dragHandle.textContent = '::';
        head.appendChild(dragHandle);

        const body = document.createElement('div');
        body.className = 'tutorial-guide-body';
        body.textContent = normalizedPayload.text;

        guide.appendChild(head);
        guide.appendChild(body);

        const beginDrag = (e) => this.beginTutorialGuideDrag(e);
        guide.onpointerdown = beginDrag;
        head.onpointerdown = beginDrag;
        head.onkeydown = (e) => {
            if (!this.tutorialGuideState) return;
            const guideRect = guide.getBoundingClientRect();
            const current = this.tutorialGuideManualPosition?.stepId === this.tutorialGuideState.stepId
                ? this.tutorialGuideManualPosition
                : { left: guideRect.left, top: guideRect.top, stepId: this.tutorialGuideState.stepId || '' };
            const delta = e.shiftKey ? 24 : 12;
            let moved = false;
            const next = { ...current };
            if (e.key === 'ArrowLeft') { next.left -= delta; moved = true; }
            if (e.key === 'ArrowRight') { next.left += delta; moved = true; }
            if (e.key === 'ArrowUp') { next.top -= delta; moved = true; }
            if (e.key === 'ArrowDown') { next.top += delta; moved = true; }
            if (!moved) return;
            e.preventDefault();
            const clamped = this.clampTutorialGuidePosition(next.left, next.top, guideRect.width, guideRect.height);
            this.tutorialGuideManualPosition = { ...clamped, stepId: this.tutorialGuideState.stepId || '' };
            guide.style.left = `${clamped.left}px`;
            guide.style.top = `${clamped.top}px`;
        };

        guide.dataset.align = normalizedPayload.align;
        guide.dataset.stepType = normalizedPayload.stepType;
        guide.dataset.stepId = normalizedPayload.stepId;
        guide.style.display = 'block';
        this.applyTutorialGuideLayout(guide, normalizedPayload);
    }

    hideTutorialGuide() {
        const guide = document.getElementById('tutorial-guide');
        if (guide) guide.style.display = 'none';
        this.tutorialGuideState = null;
        this.tutorialDimSuppressed = false;
        this.tutorialDimSuppressedStepId = '';
        this.tutorialGuideManualPosition = null;
        this.handleTutorialGuideDragEnd();
    }

    // v2.3.1: HUD Visibility Control for Cutscenes
    hideHUD() {
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.classList.add('hidden');
    }

    showHUD() {
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.classList.remove('hidden');
        this.applyActiveUiLayout();
    }

    setupGlobalInteractions() {
        const INTERACTIVE_SELECTORS = 'button, .btn, .skill-icon, .item-slot, .stat-up-btn, .stat-down-btn, .close-popup, .login-btn, .action-btn';
        const PRESS_FEEDBACK_SELECTORS = '.skill-btn, .attack-btn, .action-btn, .menu-btn, .close-popup, .confirm-btn, .reset-btn';
        const pressedElements = new Set();
        const guardTutorialInteraction = (event) => {
            if (!this.shouldBlockTutorialUiInteraction(event)) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
        };
        const addPressedState = (target) => {
            if (this.uiLayoutEditMode) return;
            const pressable = target?.closest?.(PRESS_FEEDBACK_SELECTORS);
            if (!pressable || pressable.disabled || pressable.classList.contains('disabled')) return;
            pressable.classList.add('is-pressed');
            pressedElements.add(pressable);
        };
        const clearPressedState = () => {
            pressedElements.forEach((element) => element.classList.remove('is-pressed'));
            pressedElements.clear();
        };

        document.body.addEventListener('mouseover', (e) => {
            const target = e.target.closest(INTERACTIVE_SELECTORS);
            if (target && !target.disabled && !target.classList.contains('disabled')) {
                // Debounce hover sound slightly to prevent spam
                if (!target._hoverSoundPlayed) {
                    if (this.game.sound) this.game.sound.playSfx('ui_hover');
                    target._hoverSoundPlayed = true;
                    setTimeout(() => target._hoverSoundPlayed = false, 100);
                }
            }
        });

        document.body.addEventListener('click', (e) => {
            const target = e.target.closest(INTERACTIVE_SELECTORS);
            if (target && !target.disabled && !target.classList.contains('disabled')) {
                if (this.game.sound) this.game.sound.playSfx('ui_click');
            }
        });

        document.body.addEventListener('pointerdown', guardTutorialInteraction, true);
        document.body.addEventListener('touchstart', guardTutorialInteraction, { capture: true, passive: false });
        document.body.addEventListener('click', guardTutorialInteraction, true);

        document.body.addEventListener('pointerdown', (e) => {
            this.maybeTemporarilyReleaseTutorialDim(e);
            addPressedState(e.target);
        }, true);

        ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'mouseup', 'dragend', 'mouseleave'].forEach((eventName) => {
            document.body.addEventListener(eventName, () => {
                window.setTimeout(clearPressedState, 70);
            }, true);
        });
    }

    getTutorialAllowedInteractionSelectors(step = this.game?.tutorial?.getCurrentStep?.()) {
        if (!step) return [];

        if (step.trigger === 'stat_allocated') {
            return step.target
                ? [`.stat-up-btn[data-stat="${step.target}"]`]
                : ['.stat-up-btn'];
        }

        if (step.trigger === 'skill_detail_open') {
            if (!step.target) return [];
            return [
                `#skill-item-${step.target} .skill-icon`,
                `#skill-item-${step.target} .skill-info`,
                `#skill-item-${step.target} .skill-name`,
                `#skill-item-${step.target} .skill-name-row`,
                `#skill-item-${step.target} .skill-desc`,
                `#skill-item-${step.target} .skill-level`
            ];
        }

        if (step.trigger === 'skill_detail_close') {
            return ['#skill-detail-modal-close'];
        }

        if (step.trigger === 'skill_upgrade') {
            return step.target
                ? [`.skill-up-btn[data-skill="${step.target}"]`]
                : ['.skill-up-btn'];
        }

        const popupOpenSelectorMap = {
            'status-popup': ['#btn-status'],
            'skill-popup': ['#btn-skill'],
            'inventory-popup': ['#btn-inventory']
        };

        if (step.trigger === 'popup_open' && step.target && popupOpenSelectorMap[step.target]) {
            return popupOpenSelectorMap[step.target];
        }

        const popupCloseSelectorMap = {
            'inventory-popup': ['#inventory-close-btn-top', '#inventory-close-btn-bottom']
        };

        if (step.trigger === 'popup_close' && step.target && popupCloseSelectorMap[step.target]) {
            return popupCloseSelectorMap[step.target];
        }

        if (step.trigger === 'stats_saved') {
            return this.getTutorialRuntimeFocusTargets(step, ['#status-close-btn-top', '#status-close-btn-bottom']);
        }

        return this.getTutorialAllowedActionSelectors(step);
    }

    getTutorialAllowedActionSelectors(step = this.game?.tutorial?.getCurrentStep?.()) {
        if (!step || !Array.isArray(step.allowedActions) || !step.allowedActions.length) return [];

        const actionSelectorMap = {
            MOVE_UP: ['#joystick-area', '#joystick-container', 'canvas'],
            MOVE_DOWN: ['#joystick-area', '#joystick-container', 'canvas'],
            MOVE_LEFT: ['#joystick-area', '#joystick-container', 'canvas'],
            MOVE_RIGHT: ['#joystick-area', '#joystick-container', 'canvas'],
            ATTACK: ['#action-attack-j'],
            SKILL_1: ['#action-skill-h'],
            SKILL_2: ['#action-skill-u'],
            SKILL_3: ['#action-skill-k'],
            OPEN_INVENTORY: ['#btn-inventory'],
            OPEN_SKILL: ['#btn-skill'],
            OPEN_STATUS: ['#btn-status']
        };

        const selectors = [];
        step.allowedActions.forEach((action) => {
            const mappedSelectors = actionSelectorMap[action];
            if (!Array.isArray(mappedSelectors)) return;
            mappedSelectors.forEach((selector) => {
                if (selector && !selectors.includes(selector)) {
                    selectors.push(selector);
                }
            });
        });

        return selectors;
    }

    shouldBlockTutorialUiInteraction(event) {
        const tutorial = this.game?.tutorial;
        const step = tutorial?.getCurrentStep?.();
        if (!tutorial?.activeTutorial || !step) return false;

        const target = event?.target;
        if (!(target instanceof Element)) return false;
        if (target.closest('#tutorial-guide')) return false;

        if (step.trigger === 'skill_detail_open' && step.target) {
            const itemSelector = `#skill-item-${step.target}`;
            const withinTargetItem = target.closest(itemSelector);
            if (!withinTargetItem) return true;
            return !!target.closest(`${itemSelector} .skill-up-btn`);
        }

        const allowedSelectors = this.getTutorialAllowedInteractionSelectors(step);
        if (!allowedSelectors.length) return true;

        return !allowedSelectors.some((selector) => {
            try {
                return !!target.closest(selector);
            } catch {
                return false;
            }
        });
    }

    getTutorialRuntimeFocusTargets(step = this.game?.tutorial?.getCurrentStep?.(), fallbackTargets = []) {
        const normalizedFallback = Array.isArray(fallbackTargets)
            ? fallbackTargets.filter(Boolean)
            : (fallbackTargets ? [fallbackTargets] : []);
        if (!step) return normalizedFallback;

        if (step.trigger === 'stats_saved') {
            const confirmVisible = !!this.confirmModal && !this.confirmModal.classList.contains('hidden');
            return confirmVisible
                ? ['#confirm-modal .confirm-content', '#confirm-yes', '#confirm-no']
                : ['#status-close-btn-top', '#status-close-btn-bottom'];
        }

        if (step.trigger === 'skill_detail_open') {
            const detailModalVisible = !!document.querySelector('#skill-detail-modal:not(.hidden) .skill-detail-modal-content');
            if (detailModalVisible) {
                return ['#skill-detail-modal .skill-detail-modal-content'];
            }
        }

        if (step.trigger === 'popup_open' && step.target === 'inventory-popup') {
            const inventoryVisible = !!document.querySelector('#inventory-popup:not(.hidden)');
            if (inventoryVisible) {
                return ['#inventory-popup'];
            }
        }

        return normalizedFallback;
    }

    shouldTemporarilyReleaseTutorialDim(step = this.game?.tutorial?.getCurrentStep?.()) {
        if (!step) return false;
        if (step.releaseDimOnFocusPress === false) return false;
        if (step.releaseDimOnFocusPress === true) return true;
        return step.trigger === 'kill' || step.trigger === 'skill_use';
    }

    isTutorialFocusTargetMatch(target, focusTarget) {
        if (!(target instanceof Element) || !focusTarget) return false;

        if (focusTarget instanceof Element) {
            return focusTarget === target || focusTarget.contains(target);
        }

        if (typeof focusTarget === 'string') {
            try {
                return !!target.closest(focusTarget);
            } catch {
                return false;
            }
        }

        if (typeof focusTarget !== 'object' || Array.isArray(focusTarget)) {
            return false;
        }

        const selectors = Array.isArray(focusTarget.selectors)
            ? focusTarget.selectors
            : (focusTarget.selector ? [focusTarget.selector] : []);
        if (selectors.some((selector) => {
            try {
                return !!target.closest(selector);
            } catch {
                return false;
            }
        })) {
            return true;
        }

        if ((focusTarget.type === 'skill-detail-trigger' || focusTarget.preset === 'skill-detail-trigger') && focusTarget.skillId) {
            return !!target.closest(`#skill-item-${focusTarget.skillId}`);
        }

        if (focusTarget.type === 'move-pad-hint' || focusTarget.preset === 'move-pad-hint') {
            return !!target.closest('#joystick-area, #joystick-container');
        }

        return false;
    }

    maybeTemporarilyReleaseTutorialDim(event) {
        const tutorial = this.game?.tutorial;
        const step = tutorial?.getCurrentStep?.();
        if (!tutorial?.activeTutorial || !this.shouldTemporarilyReleaseTutorialDim(step)) return;

        const target = event?.target;
        if (!(target instanceof Element)) return;

        const focusTargets = this.getTutorialRuntimeFocusTargets(
            step,
            this.tutorialHighlightState?.targets || this.tutorialGuideState?.focusTargets || []
        );
        if (!focusTargets.length) return;
        if (!focusTargets.some((focusTarget) => this.isTutorialFocusTargetMatch(target, focusTarget))) return;
        if (this.tutorialDimSuppressed && this.tutorialDimSuppressedStepId === step.id) return;

        this.tutorialDimSuppressed = true;
        this.tutorialDimSuppressedStepId = step.id || '';
        this.refreshTutorialHighlight();
    }

    setupFullscreenListeners() {
        const updateClass = () => {
            const isFull = this.isFullscreenActive();
            const isStandalone = this.isStandaloneDisplayMode();
            document.body.classList.toggle('is-fullscreen', isFull);
            document.body.classList.toggle('is-standalone', isStandalone);

            if (isFull || isStandalone) {
                this.scheduleOrientationLockRefresh();
                this.pendingLandscapeFullscreen = false;
                this.landscapeFullscreenDismissed = this.mobileOrientationPreference === 'portrait';
            } else if (this._wasFullscreenActive && this.isMobileLandscapeViewport()) {
                this.pendingLandscapeFullscreen = false;
                this.landscapeFullscreenDismissed = true;
            }

            this._wasFullscreenActive = isFull;
            this.syncMobileEnvironmentClasses();
        };
        const handleViewportChange = () => {
            window.requestAnimationFrame(() => {
                this.syncOrientationLock();
                this.syncMobileEnvironmentClasses();
                this.updateLandscapeAutoFullscreen();
            });
        };
        const handleOrientationChange = () => {
            this.syncOrientationLock();
            window.setTimeout(handleViewportChange, 120);
        };
        const tryPendingLandscapeFullscreen = () => {
            if (!this.pendingLandscapeFullscreen) return;
            this.requestLandscapeAutoFullscreenIfPending();
        };

        document.addEventListener('fullscreenchange', updateClass);
        document.addEventListener('webkitfullscreenchange', updateClass);
        document.addEventListener('mozfullscreenchange', updateClass);
        document.addEventListener('MSFullscreenChange', updateClass);
        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('orientationchange', handleOrientationChange);
        window.addEventListener('pageshow', handleViewportChange);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                handleViewportChange();
            }
        });
        document.addEventListener('touchstart', tryPendingLandscapeFullscreen, { passive: true });
        document.addEventListener('click', tryPendingLandscapeFullscreen);

        // Initial check on load
        updateClass();
        this.updateLandscapeAutoFullscreen();
    }

    scheduleOrientationLockRefresh() {
        [0, 120, 360, 900].forEach((delay) => {
            window.setTimeout(() => this.syncOrientationLock(), delay);
        });
    }

    isTransientOrientationLockActive() {
        if (!this.transientOrientationPreference) return false;
        if (Date.now() < this.transientOrientationLockUntil) return true;
        this.clearTransientOrientationPreference();
        return false;
    }

    setTransientOrientationPreference(preference = 'landscape', durationMs = 1200) {
        this.clearTransientOrientationPreference();
        this.transientOrientationPreference = preference === 'portrait' ? 'portrait' : 'landscape';
        this.transientOrientationLockUntil = Date.now() + Math.max(300, durationMs);
        const remainingMs = Math.max(0, this.transientOrientationLockUntil - Date.now()) + 50;
        this.transientOrientationReleaseTimer = window.setTimeout(() => {
            if (!this.getSetting('orientationLock')) {
                this.clearTransientOrientationPreference();
                this.syncOrientationLock();
                this.syncMobileEnvironmentClasses();
            }
        }, remainingMs);
    }

    clearTransientOrientationPreference() {
        if (this.transientOrientationReleaseTimer) {
            window.clearTimeout(this.transientOrientationReleaseTimer);
            this.transientOrientationReleaseTimer = null;
        }
        this.transientOrientationPreference = null;
        this.transientOrientationLockUntil = 0;
    }

    isTouchDevice() {
        return !!(window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0);
    }

    isIosLikeDevice() {
        const userAgent = navigator.userAgent || '';
        const platform = navigator.platform || '';
        return /iPad|iPhone|iPod/i.test(userAgent)
            || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    isMobilePortraitViewport() {
        const isNarrow = window.innerWidth <= 1024;
        const isPortrait = window.matchMedia?.('(orientation: portrait)')?.matches ?? (window.innerHeight >= window.innerWidth);
        return this.isTouchDevice() && isNarrow && isPortrait;
    }

    isTouchLandscapeViewport() {
        const isLandscape = window.matchMedia?.('(orientation: landscape)')?.matches ?? (window.innerWidth > window.innerHeight);
        return this.isTouchDevice() && isLandscape;
    }

    isImmersiveMobileActive() {
        return this.isTouchDevice() && (this.isStandaloneDisplayMode() || this.isFullscreenActive());
    }

    isMobileFullscreenLandscapeLockRequired() {
        return this.isTouchDevice() && (this.isStandaloneDisplayMode() || this.isFullscreenActive());
    }

    getCurrentMobileOrientationPreference() {
        if (this.isMobileFullscreenLandscapeLockRequired()) return 'landscape';
        return this.isMobilePortraitViewport() ? 'portrait' : 'landscape';
    }

    syncMobileEnvironmentClasses() {
        const body = document.body;
        if (!body) return;

        const touchLandscape = this.isTouchLandscapeViewport();
        const immersiveMobile = this.isImmersiveMobileActive();
        const orientationLocked = !!this.getSetting('orientationLock');
        if (!orientationLocked) {
            this.mobileOrientationPreference = this.getCurrentMobileOrientationPreference();
        }

        body.classList.toggle('is-ios-device', this.isIosLikeDevice());
        body.classList.toggle('is-mobile-landscape', this.isMobileLandscapeViewport());
        body.classList.toggle('is-mobile-portrait', this.isMobilePortraitViewport());
        body.classList.toggle('is-mobile-immersive', immersiveMobile);
        body.classList.toggle('is-touch-landscape', touchLandscape);
        body.classList.toggle('is-orientation-locked', orientationLocked);

        const fullscreenButton = document.getElementById('btn-fullscreen');
        const exitButton = document.getElementById('btn-fullscreen-exit');
        const hideLandscapeHudButtons = touchLandscape || (this.isTouchDevice() && immersiveMobile);
        const fullscreenTitle = '전체화면';

        if (fullscreenButton) {
            fullscreenButton.classList.toggle('is-orientation-toggle', false);
            fullscreenButton.classList.toggle('hidden', hideLandscapeHudButtons);
            fullscreenButton.title = fullscreenTitle;
            fullscreenButton.setAttribute('aria-label', fullscreenTitle);
            fullscreenButton.setAttribute('aria-hidden', hideLandscapeHudButtons ? 'true' : 'false');
        }

        if (exitButton) {
            exitButton.classList.toggle('hidden', true);
            exitButton.setAttribute('aria-hidden', 'true');
        }
    }

    setMobileOrientationPreference(preference = 'landscape') {
        this.clearTransientOrientationPreference();
        this.mobileOrientationPreference = preference === 'portrait' ? 'portrait' : 'landscape';
        this.landscapeFullscreenDismissed = this.mobileOrientationPreference === 'portrait';
        this.scheduleOrientationLockRefresh();
        this.syncMobileEnvironmentClasses();
    }

    toggleMobileOrientationPreference() {
        const nextPreference = this.mobileOrientationPreference === 'portrait' ? 'landscape' : 'portrait';
        this.setMobileOrientationPreference(nextPreference);
    }

    syncOrientationLock() {
        if (screen.orientation && screen.orientation.lock) {
            const transientLockActive = this.isTransientOrientationLockActive();
            const forceLandscapeFullscreen = this.isMobileFullscreenLandscapeLockRequired();
            const shouldLock = this.isImmersiveMobileActive()
                && (forceLandscapeFullscreen || this.getSetting('orientationLock') || transientLockActive);
            if (!shouldLock) {
                this.clearTransientOrientationPreference();
                screen.orientation.unlock?.();
                return;
            }

            const effectivePreference = forceLandscapeFullscreen
                ? 'landscape'
                : (transientLockActive
                    ? this.transientOrientationPreference
                    : this.mobileOrientationPreference);
            const preferPortrait = effectivePreference === 'portrait';
            const preferredMode = preferPortrait ? 'portrait-primary' : 'landscape-primary';
            const fallbackMode = preferPortrait ? 'portrait' : 'landscape';
            screen.orientation.lock(preferredMode).catch(() => {
                screen.orientation.lock(fallbackMode).catch(() => {
                    screen.orientation.unlock?.();
                });
            });
        }
    }

    isFullscreenActive() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement ||
            document.mozFullScreenElement || document.msFullscreenElement);
    }

    isStandaloneDisplayMode() {
        return !!(
            window.matchMedia?.('(display-mode: standalone)')?.matches
            || window.matchMedia?.('(display-mode: fullscreen)')?.matches
            || window.matchMedia?.('(display-mode: minimal-ui)')?.matches
            || window.navigator.standalone
        );
    }

    isMobileLandscapeViewport() {
        const isTouch = this.isTouchDevice();
        const isNarrow = window.innerWidth <= 1024;
        const isLandscape = window.matchMedia?.('(orientation: landscape)')?.matches ?? (window.innerWidth > window.innerHeight);
        return isTouch && isNarrow && isLandscape;
    }

    isDesktopShortcutMode() {
        const hasFinePointer = window.matchMedia?.('(pointer: fine)')?.matches ?? false;
        const canHover = window.matchMedia?.('(hover: hover)')?.matches ?? false;
        return !!this.getSetting('desktopShortcutHints')
            && !this.uiLayoutEditMode
            && (hasFinePointer || canHover)
            && !this.isMobileLandscapeViewport();
    }

    shouldShowDesktopShortcutText() {
        return this.getUiLayoutMode() === 'desktop';
    }

    isTextEntryFocused() {
        const active = document.activeElement;
        if (!active) return false;

        const tagName = active.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
            return true;
        }

        return !!active.closest?.('[contenteditable="true"]');
    }

    isShortcutVisible(element) {
        return !!element && !element.classList.contains('hidden') && element.style.display !== 'none';
    }

    upsertShortcutHint(container, key, label, extraClass = '') {
        if (!container) return;

        const existingHint = container.querySelector('.pc-shortcut-hint');
        const shouldShow = this.isDesktopShortcutMode() && key && label;

        if (!shouldShow) {
            existingHint?.remove();
            container.classList.remove('has-shortcut-hint');
            return;
        }

        let hint = existingHint;
        if (!hint) {
            hint = document.createElement('div');
            container.appendChild(hint);
        }

        hint.className = `pc-shortcut-hint ${extraClass}`.trim();
        hint.innerHTML = `<kbd>${key}</kbd><span>${label}</span>`;
        container.classList.add('has-shortcut-hint');
    }

    refreshDesktopShortcutHints() {
        const openPopup = document.querySelector('.game-popup:not(.hidden)');
        const confirmContent = document.querySelector('#confirm-modal .confirm-content');
        const rewardContent = document.querySelector('#reward-modal .reward-content');
        const historyContent = document.querySelector('#history-modal .history-content');
        const genericContent = document.querySelector('#generic-modal .confirm-modal-content');
        const skillDetailModal = document.getElementById('skill-detail-modal');
        const skillDetailContent = document.querySelector('#skill-detail-modal .skill-detail-modal-content');
        const inventoryItemModal = document.getElementById('inventory-item-modal');
        const inventoryItemContent = document.querySelector('#inventory-item-modal .inventory-item-modal-card');
        const genericYes = document.getElementById('generic-modal-yes');
        const genericNo = document.getElementById('generic-modal-no');
        const questDetails = document.querySelector('#quest-reward-display .quest-details');
        const isInventoryItemModalOpen = this.isShortcutVisible(inventoryItemModal);

        this.upsertShortcutHint(isInventoryItemModalOpen ? null : openPopup?.querySelector('.popup-footer'), 'F', '닫기', 'popup-shortcut-hint');
        this.upsertShortcutHint(
            this.isShortcutVisible(this.confirmModal) ? confirmContent : null,
            'F',
            '확인 · Esc 취소',
            'modal-shortcut-hint'
        );
        this.upsertShortcutHint(
            this.isShortcutVisible(document.getElementById('reward-modal')) ? rewardContent : null,
            'F',
            '닫기',
            'modal-shortcut-hint'
        );
        this.upsertShortcutHint(
            this.isShortcutVisible(document.getElementById('history-modal')) ? historyContent : null,
            'F',
            '닫기',
            'modal-shortcut-hint'
        );
        this.upsertShortcutHint(
            this.isShortcutVisible(document.getElementById('generic-modal')) ? genericContent : null,
            'F',
            this.isShortcutVisible(genericNo)
                ? `${genericYes?.textContent?.trim() || '수락'} · Esc ${genericNo?.textContent?.trim() || '거절'}`
                : `${genericYes?.textContent?.trim() || '확인'} · Esc 닫기`,
            'modal-shortcut-hint'
        );
        this.upsertShortcutHint(
            this.isShortcutVisible(skillDetailModal) ? skillDetailContent : null,
            'F',
            '닫기',
            'modal-shortcut-hint'
        );
        this.upsertShortcutHint(
            isInventoryItemModalOpen ? inventoryItemContent : null,
            'F',
            '닫기',
            'modal-shortcut-hint'
        );
        this.upsertShortcutHint(
            questDetails,
            typeof this.pcQuestClaimHandler === 'function' ? 'Q' : '',
            typeof this.pcQuestClaimHandler === 'function' ? '수령' : '',
            'quest-shortcut-hint'
        );
    }

    hasBlockingShortcutModalOpen() {
        return !!(
            document.querySelector('.game-popup:not(.hidden)')
            || this.isShortcutVisible(this.confirmModal)
            || this.isShortcutVisible(document.getElementById('reward-modal'))
            || this.isShortcutVisible(document.getElementById('history-modal'))
            || this.isShortcutVisible(document.getElementById('generic-modal'))
            || this.isShortcutVisible(document.getElementById('skill-detail-modal'))
        );
    }

    tryClaimQuestWithShortcut() {
        if (!this.isDesktopShortcutMode() || this.hasBlockingShortcutModalOpen()) return false;
        if (typeof this.pcQuestClaimHandler !== 'function') return false;

        const claimHandler = this.pcQuestClaimHandler;
        this.pcQuestClaimHandler = null;
        this.refreshDesktopShortcutHints();
        claimHandler();
        return true;
    }

    tryPrimaryUiShortcut() {
        if (!this.isDesktopShortcutMode()) return false;

        const genericModal = document.getElementById('generic-modal');
        if (this.isShortcutVisible(genericModal)) {
            document.getElementById('generic-modal-yes')?.click();
            return true;
        }

        if (this.isShortcutVisible(this.confirmModal)) {
            this.confirmYes?.click();
            return true;
        }

        if (this.isShortcutVisible(document.getElementById('reward-modal'))) {
            this.hideRewardModal();
            return true;
        }

        if (this.isShortcutVisible(document.getElementById('history-modal'))) {
            this.toggleUpdateHistory();
            return true;
        }

        if (this.isShortcutVisible(document.getElementById('skill-detail-modal'))) {
            this.hideSkillDetailModal();
            return true;
        }

        if (this.isShortcutVisible(document.getElementById('inventory-item-modal'))) {
            this.closeInventoryItemModal(true);
            this.updateInventory();
            return true;
        }

        const openPopup = document.querySelector('.game-popup:not(.hidden)');
        if (openPopup?.id) {
            this.togglePopup(openPopup.id);
            return true;
        }

        return false;
    }

    trySecondaryUiShortcut() {
        if (!this.isDesktopShortcutMode()) return false;

        const genericModal = document.getElementById('generic-modal');
        if (this.isShortcutVisible(genericModal)) {
            document.getElementById('generic-modal-no')?.click();
            return true;
        }

        if (this.isShortcutVisible(this.confirmModal)) {
            this.confirmNo?.click();
            return true;
        }

        if (this.isShortcutVisible(document.getElementById('reward-modal'))) {
            this.hideRewardModal();
            return true;
        }

        if (this.isShortcutVisible(document.getElementById('history-modal'))) {
            this.toggleUpdateHistory();
            return true;
        }

        if (this.isShortcutVisible(document.getElementById('skill-detail-modal'))) {
            this.hideSkillDetailModal();
            return true;
        }

        if (this.isShortcutVisible(document.getElementById('inventory-item-modal'))) {
            this.closeInventoryItemModal(true);
            this.updateInventory();
            return true;
        }

        const openPopup = document.querySelector('.game-popup:not(.hidden)');
        if (openPopup?.id) {
            this.togglePopup(openPopup.id);
            return true;
        }

        return false;
    }

    handleDesktopShortcutKeydown(e) {
        if (this.uiLayoutEditMode) {
            if (e.code === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.exitUiLayoutEditMode({ save: false });
            }
            if (e.code === 'KeyF') {
                e.preventDefault();
                e.stopPropagation();
                this.exitUiLayoutEditMode({ save: true });
            }
            return;
        }

        if (!this.isDesktopShortcutMode() || this.isTextEntryFocused() || e.repeat) return;

        if (e.code === 'KeyQ' && this.tryClaimQuestWithShortcut()) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (e.code === 'KeyF' && this.tryPrimaryUiShortcut()) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (e.code === 'Escape' && this.trySecondaryUiShortcut()) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    setLandscapeChatActive(active, options = {}) {
        const { focusInput = false } = options;
        const chatWindow = document.querySelector('.chat-window');
        const chatInput = document.querySelector('.chat-input-area input');

        if (!chatWindow) return;

        const shouldActivate = active && this.isMobileLandscapeViewport() && !this.uiLayoutEditMode;
        chatWindow.classList.toggle('chat-active', shouldActivate);
        document.body.classList.toggle('landscape-chat-active', shouldActivate);

        if (!shouldActivate && chatInput && document.activeElement === chatInput) {
            chatInput.blur();
        }

        if (shouldActivate && focusInput && chatInput && document.activeElement !== chatInput) {
            // Mobile browsers often reject async focus after touch. Focus immediately
            // once the input becomes visible to keep chat activation reliable.
            void chatWindow.offsetHeight;
            chatInput.focus({ preventScroll: true });
            if (typeof chatInput.setSelectionRange === 'function') {
                const caret = chatInput.value.length;
                chatInput.setSelectionRange(caret, caret);
            }
        }
    }

    syncLandscapeChatLayout() {
        if (!this.isMobileLandscapeViewport() || this.uiLayoutEditMode) {
            this.setLandscapeChatActive(false);
        }
    }

    setupLandscapeChatInteractions() {
        const chatWindow = document.querySelector('.chat-window');
        const chatInputArea = document.querySelector('.chat-input-area');
        const chatInput = document.querySelector('.chat-input-area input');

        if (!chatWindow || !chatInput || !chatInputArea) return;

        const shouldIgnoreTarget = (target) => {
            if (!(target instanceof Element)) return false;
            return !!target.closest('.chat-input-area, .send-btn, #emote-picker, #btn-emote, .emote-btn');
        };

        const activateChat = (e) => {
            if (!this.isMobileLandscapeViewport() || this.uiLayoutEditMode || shouldIgnoreTarget(e.target)) return;
            if (chatWindow.classList.contains('chat-active')) return;
            e.preventDefault();
            e.stopPropagation();
            this.setLandscapeChatActive(true, { focusInput: false });
        };

        const focusVisibleChatInput = (e) => {
            if (!this.isMobileLandscapeViewport() || this.uiLayoutEditMode) return;
            if (!chatWindow.classList.contains('chat-active')) return;
            if (e.target instanceof Element && e.target.closest('.send-btn, #emote-picker, #btn-emote, .emote-btn')) return;
            if (document.activeElement === chatInput) return;
            chatInput.focus({ preventScroll: true });
            if (typeof chatInput.setSelectionRange === 'function') {
                const caret = chatInput.value.length;
                chatInput.setSelectionRange(caret, caret);
            }
        };

        const maybeCollapseChat = () => {
            if (!this.isMobileLandscapeViewport() || this.uiLayoutEditMode) {
                this.setLandscapeChatActive(false);
                return;
            }

            window.setTimeout(() => {
                const picker = document.getElementById('emote-picker');
                if (document.activeElement === chatInput) return;
                if (picker && !picker.classList.contains('hidden')) return;
                if (chatInput.value.trim()) return;
                this.setLandscapeChatActive(false);
            }, 120);
        };

        chatWindow.addEventListener('click', activateChat);
        chatWindow.addEventListener('touchstart', activateChat, { passive: false });
        chatInputArea.addEventListener('click', focusVisibleChatInput);
        chatInputArea.addEventListener('touchend', focusVisibleChatInput, { passive: true });
        chatInput.addEventListener('focus', () => {
            if (this.isMobileLandscapeViewport()) {
                this.setLandscapeChatActive(true);
            }
        });
        chatInput.addEventListener('blur', maybeCollapseChat);

        document.addEventListener('click', (e) => {
            if (!this.isMobileLandscapeViewport()) return;
            const picker = document.getElementById('emote-picker');
            if (chatWindow.contains(e.target) || picker?.contains(e.target)) return;
            maybeCollapseChat();
        });

        window.addEventListener('resize', () => this.syncLandscapeChatLayout());
        window.addEventListener('orientationchange', () => {
            window.setTimeout(() => this.syncLandscapeChatLayout(), 120);
        });

        this.syncLandscapeChatLayout();
    }

    enterFullscreen() {
        if (this.isTouchDevice()) {
            const nextOrientationPreference = 'landscape';
            this.clearTransientOrientationPreference();
            this.mobileOrientationPreference = nextOrientationPreference;
            this.landscapeFullscreenDismissed = false;
            if (!this.getSetting('orientationLock')) {
                this.setTransientOrientationPreference(nextOrientationPreference);
            }
        }
        if (this.isFullscreenActive() || this.isStandaloneDisplayMode()) return Promise.resolve(true);

        const elem = document.documentElement;
        const request = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.mozRequestFullScreen || elem.msRequestFullscreen;
        if (!request) {
            this.pendingLandscapeFullscreen = false;
            this.clearTransientOrientationPreference();
            return Promise.resolve(false);
        }

        try {
            const result = request.call(elem);
            if (result && typeof result.then === 'function') {
                return result.then(() => {
                    this.syncOrientationLock();
                    return true;
                }).catch(() => {
                    this.clearTransientOrientationPreference();
                    return false;
                });
            }
            this.syncOrientationLock();
            return Promise.resolve(true);
        } catch {
            this.clearTransientOrientationPreference();
            return Promise.resolve(false);
        }
    }

    requestLandscapeAutoFullscreenIfPending() {
        if (!this.pendingLandscapeFullscreen || this.landscapeFullscreenDismissed) return;
        this.enterFullscreen().then((entered) => {
            if (entered) {
                this.pendingLandscapeFullscreen = false;
            }
        });
    }

    updateLandscapeAutoFullscreen() {
        if (!this.getSetting('autoFullscreen')) {
            this.pendingLandscapeFullscreen = false;
            return;
        }

        if (!this.isMobileLandscapeViewport()) {
            this.pendingLandscapeFullscreen = false;
            this.landscapeFullscreenDismissed = false;
            return;
        }

        if (this.isStandaloneDisplayMode() || this.isFullscreenActive() || this.landscapeFullscreenDismissed) {
            this.pendingLandscapeFullscreen = false;
            return;
        }

        this.pendingLandscapeFullscreen = true;
        this.requestLandscapeAutoFullscreenIfPending();
    }

    setupEventListeners() {
        document.addEventListener('keydown', this.handleDesktopShortcutKeydown);
        window.addEventListener('popstate', this.handleBrowserBackPopState);
        document.addEventListener('pointermove', this.handleTutorialGuideDragMove, { passive: false });
        document.addEventListener('pointermove', this.handleFloatingPanelDragMove, { passive: false });
        document.addEventListener('pointermove', this.handleUiLayoutControlPointerMove, { passive: false });
        document.addEventListener('pointerup', this.handleTutorialGuideDragEnd, true);
        document.addEventListener('pointercancel', this.handleTutorialGuideDragEnd, true);
        document.addEventListener('pointerup', this.handleFloatingPanelDragEnd, true);
        document.addEventListener('pointercancel', this.handleFloatingPanelDragEnd, true);
        document.addEventListener('pointerup', this.handleUiLayoutControlPointerUp, true);
        document.addEventListener('pointercancel', this.handleUiLayoutControlPointerUp, true);
        this.setupDraggableFloatingPanels();
        window.addEventListener('resize', () => this.positionFriendWeaponTooltip());
        document.addEventListener('scroll', () => this.positionFriendWeaponTooltip(), true);
        document.addEventListener('pointerdown', (event) => {
            if (event.target?.closest?.('.friend-weapon-icon-button')) return;
            this.hideFriendWeaponTooltip();
        });

        const minimap = document.getElementById('minimap-container');
        const openMapTravel = (event) => {
            if (this.uiLayoutEditMode) return;
            if (!this.isWorldSceneActive?.()) return;
            if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
            if (this.hasBlockingShortcutModalOpen?.()) return;
            event.preventDefault();
            event.stopPropagation();
            this.showMapTravelModal();
        };
        if (minimap && minimap.dataset.mapTravelBound !== 'true') {
            minimap.addEventListener('click', openMapTravel);
            minimap.addEventListener('keydown', openMapTravel);
            minimap.dataset.mapTravelBound = 'true';
        }

        const handleClose = (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();

            const popup = e.currentTarget?.closest?.('.game-popup')
                || document.querySelector('.game-popup:not(.hidden)');
            if (popup?.id) {
                this.togglePopup(popup.id);
                return;
            }

            this.hideAllPopups();
        };
        document.querySelectorAll('.close-popup').forEach(btn => {
            btn.addEventListener('click', handleClose);
            btn.addEventListener('touchstart', handleClose, { passive: false });
        });

        document.querySelectorAll('.party-leave-btn').forEach((btn) => {
            const handleLeaveParty = async (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (!this.game.net || !this.game.localPlayer?.party || this.game.localPlayer.party.members.length < 2) return;
                this.showConfirm('함께하기를 종료하시겠습니까?', async (confirmed) => {
                    if (!confirmed) return;
                    await this.game.net.leaveParty();
                    this.updatePartyUI();
                });
            };
            btn.addEventListener('click', handleLeaveParty);
            btn.addEventListener('touchstart', handleLeaveParty, { passive: false });
        });

        // Confirmation Modal
        this.confirmModal = document.getElementById('confirm-modal');
        this.confirmYes = document.getElementById('confirm-yes');
        this.confirmNo = document.getElementById('confirm-no');
        this.confirmCallback = null;
        this.confirmTutorialRefreshFrame = 0;
        this.confirmTutorialRefreshTimer = 0;

        this.confirmYes.addEventListener('click', () => {
            if (this.confirmCallback) this.confirmCallback(true);
            this.hideConfirm();
        });
        this.confirmNo.addEventListener('click', () => {
            if (this.confirmCallback) this.confirmCallback(false);
            this.hideConfirm();
        });
        this.confirmModal?.querySelector('.confirm-content')?.addEventListener('animationend', () => {
            this.refreshTutorialOverlayState();
        });

        // Skill Tooltips
        this.tooltip = document.getElementById('skill-tooltip');
        this.skillData = {
            laser: { name: '체인 라이트닝', desc: '특징: 기본 공격이 가까운 적에게 연쇄되는 번개로 바뀌고, 적중한 적 수만큼 마나를 회복합니다.<br>성장: 레벨이 오를수록 연쇄 대상 수, 충전당 피해 상승폭, 최대 피해, 사거리가 함께 커집니다.' },
            missile: { name: '매직 미사일', desc: '특징: 가까운 적의 현재 위치를 먼저 고정한 뒤, 그 지점을 향해 자연스럽게 휘어 들어가는 미사일을 순차 발사합니다.<br>성장: 레벨이 오를수록 한 번에 발사되는 미사일 수가 늘고 마나 소모도 함께 증가합니다.' },
            fireball: { name: '파이어볼', desc: '특징: 직선으로 날아가 폭발하며 범위 피해와 화상을 남기는 광역 스킬입니다.<br>성장: 레벨이 오를수록 직격 피해, 폭발 반경, 화상 지속시간이 함께 증가합니다.' },
            shield: { name: '앱솔루트 베리어', desc: '특징: 다음 1회의 피격을 완전히 막는 생존용 방어막입니다.<br>성장: 레벨업이 없는 고정 성능 스킬이며, 항상 같은 성능으로 유지됩니다.' }
        };

        this.bindSkillTooltipTargets();

        const autoAttackToggle = document.getElementById('action-auto-toggle');
        const handleAutoAttackToggle = (e) => {
            if (this.uiLayoutEditMode) return;
            e.preventDefault();
            e.stopPropagation();
            this.game.localPlayer?.toggleAutoAttack?.();
        };
        if (autoAttackToggle && !autoAttackToggle.dataset.bound) {
            autoAttackToggle.addEventListener('pointerdown', handleAutoAttackToggle);
            autoAttackToggle.dataset.bound = 'true';
        }
        if (autoAttackToggle) {
            this.updateAutoAttackToggle();
        }

        this.bindUiLayoutControlHandles();

        const skillDetailModal = document.getElementById('skill-detail-modal');
        const skillDetailCloseBtn = document.getElementById('skill-detail-modal-close');
        const handleSkillDetailClose = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            this.hideSkillDetailModal();
        };
        skillDetailCloseBtn?.addEventListener('click', handleSkillDetailClose);
        skillDetailCloseBtn?.addEventListener('touchstart', handleSkillDetailClose, { passive: false });
        skillDetailModal?.addEventListener('click', (e) => {
            if (e.target === skillDetailModal) {
                handleSkillDetailClose(e);
            }
        });

        // Chat send button
        const sendBtn = document.querySelector('.send-btn');
        const handleSend = async (e) => {
            if (e) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
            if (this.game.sound) this.game.sound.playSfx('ui_chat_send');
            await this.sendMessage();
            if (this.isMobileLandscapeViewport()) {
                this.setLandscapeChatActive(false);
            }
        };
        if (sendBtn) {
            sendBtn.addEventListener('click', handleSend);
            sendBtn.addEventListener('touchstart', handleSend, { passive: false });
        }

        // Stat Up Buttons
        document.querySelectorAll('.stat-up-btn').forEach(btn => {
            const handleStatUp = (e) => {
                e.preventDefault();
                if (btn.classList.contains('disabled')) return;

                // v0.00.57: SFX
                if (this.game.sound) this.game.sound.playSfx('ui_click');

                const stat = btn.getAttribute('data-stat');
                const p = this.game.localPlayer;
                if (stat && p && p.statPoints > 0) {
                    p.statPoints--;
                    this.pendingStats[stat]++;
                    this.game.tutorial?.trigger?.('stat_allocated', { target: stat });
                    this.updateStatusPopup();
                }
            };
            btn.addEventListener('click', handleStatUp);
            btn.addEventListener('touchstart', handleStatUp, { passive: false });
        });

        // Stat Down Buttons
        document.querySelectorAll('.stat-down-btn').forEach(btn => {
            const handleStatDown = (e) => {
                e.preventDefault();
                if (btn.classList.contains('disabled')) return;

                // v0.00.57: SFX
                if (this.game.sound) this.game.sound.playSfx('ui_click');

                const stat = btn.getAttribute('data-stat');
                const p = this.game.localPlayer;
                if (stat && p && this.pendingStats[stat] > 0) {
                    p.statPoints++;
                    this.pendingStats[stat]--;
                    this.updateStatusPopup();
                }
            };
            btn.addEventListener('click', handleStatDown);
            btn.addEventListener('touchstart', handleStatDown, { passive: false });
        });

        // Skill Up Buttons
        document.querySelectorAll('.skill-up-btn').forEach(btn => {
            const handleSkillUp = (e) => {
                e.preventDefault();
                if (btn.disabled || btn.classList.contains('disabled')) return;
                const skillId = btn.getAttribute('data-skill');
                const p = this.game.localPlayer;
                if (!p || !skillId) return;

                if (!this.game.tutorial?.isSkillUpgradeAllowed?.(skillId)) {
                    const tutorialStep = this.game.tutorial?.getCurrentStep?.();
                    if (tutorialStep?.trigger === 'skill_upgrade') {
                        const requiredSkill = tutorialStep.target;
                        const requiredName = this.getSkillDisplayName(requiredSkill) || '지정된 스킬';
                        this.logSystemMessage(`📘 지금은 ${requiredName}만 강화할 수 있습니다.`);
                    } else {
                        this.logSystemMessage(this.getSkillInspectGuidanceText());
                    }
                    this.updateSkillPopup();
                    return;
                }

                // Exponential Cost: 300 * 2^(lv-1)
                const lv = p.skillLevels[skillId] || 1;
                const cost = 300 * Math.pow(2, lv - 1);

                if (p.manastone >= cost) {
                    p.manastone -= cost;
                    p.updateManastoneInventory(); // v0.22.9
                    p.skillLevels[skillId]++;
                    this.game.tutorial?.trigger?.('skill_upgrade', { target: skillId });
                    this.logSystemMessage(`✨ [SKILL] ${this.getSkillDisplayName(skillId)} 레벨이 상승했습니다! (현재: ${p.skillLevels[skillId]})`);
                    this.updateSkillPopup();
                    this.updateStatusPopup();
                    this.updateInventory(); // v0.22.9
                    p.saveProfilePatch?.(['manastone', 'inventory', 'skillLevels'], {
                        debounceMs: 0,
                        forceImmediate: true,
                        reason: 'skill_levelup_patch'
                    });
                } else {
                    this.logSystemMessage(`❌ 마석이 부족합니다! (필요: ${cost} 마석)`);
                }
            };
            btn.addEventListener('click', handleSkillUp);
            btn.addEventListener('touchstart', handleSkillUp, { passive: false });
        });

        // Retry Button
        const retryBtn = document.getElementById('retry-btn');
        if (retryBtn) {
            const handleRetry = (e) => {
                e.preventDefault();
                this.hideDeathModal();
                if (this.game.localPlayer) {
                    this.game.localPlayer.respawn();
                }
            };
            retryBtn.addEventListener('click', handleRetry);
            retryBtn.addEventListener('touchstart', handleRetry, { passive: false });
        }

        // Direct Fullscreen Button Listener
        const fsBtn = document.getElementById('btn-fullscreen');
        if (fsBtn) {
            const handleFs = (e) => {
                if (this.uiLayoutEditMode) return;
                e.preventDefault();
                e.stopPropagation();
                this.toggleFullscreen();
            };
            fsBtn.addEventListener('click', handleFs);
            fsBtn.addEventListener('touchstart', handleFs, { passive: false });
        }

        const exitFsBtn = document.getElementById('btn-fullscreen-exit');
        if (exitFsBtn) {
            const handleExitFs = (e) => {
                if (this.uiLayoutEditMode) return;
                e.preventDefault();
                e.stopPropagation();
                this.exitFullscreenMode();
            };
            exitFsBtn.addEventListener('click', handleExitFs);
            exitFsBtn.addEventListener('touchstart', handleExitFs, { passive: false });
        }

        // Quick Menu Buttons (Add these listeners)
        const menuBtnMap = {
            'btn-inventory': 'inventory-popup',
            'btn-skill': 'skill-popup',
            'btn-status': 'status-popup',
            'btn-friends': 'friends-popup',
            'btn-settings': 'settings-popup'
        };

        Object.entries(menuBtnMap).forEach(([btnId, popupId]) => {
            const btn = document.getElementById(btnId);
            if (btn) {
                const handleToggle = (e) => {
                    if (this.uiLayoutEditMode) return;
                    e.preventDefault();
                    this.togglePopup(popupId);
                };
                btn.addEventListener('click', handleToggle);
                btn.addEventListener('touchstart', handleToggle, { passive: false });
            }
        });

        const rangeSettings = [
            ['settings-master-volume', 'masterVolume', { refreshGame: false }],
            ['settings-camera-view-range', 'cameraViewRange', { refreshGame: true }],
            ['settings-chat-opacity', 'chatOpacity', { refreshGame: false }],
            ['settings-friends-opacity', 'friendsOpacity', { refreshGame: false }],
            ['settings-friend-compact-opacity', 'friendCompactOpacity', { refreshGame: false }],
            ['settings-quest-opacity', 'questOpacity', { refreshGame: false }],
            ['settings-minimap-opacity', 'minimapOpacity', { refreshGame: false }],
            ['settings-action-opacity', 'actionOpacity', { refreshGame: false }],
            ['settings-menu-opacity', 'menuOpacity', { refreshGame: false }]
        ];
        rangeSettings.forEach(([inputId, key, options]) => {
            const input = document.getElementById(inputId);
            if (!input) return;
            const handleInput = (e) => {
                this.updateSetting(key, Number(e.currentTarget.value), options);
            };
            input.addEventListener('input', handleInput);
            input.addEventListener('change', handleInput);
        });

        const toggleSettings = [
            ['settings-muted', 'muted', { refreshGame: false }],
            ['settings-auto-fullscreen', 'autoFullscreen', { refreshGame: false }],
            ['settings-orientation-lock', 'orientationLock', { refreshGame: false }],
            ['settings-reduced-effects', 'reducedEffects', { refreshGame: true }],
            ['settings-shortcut-hints', 'desktopShortcutHints', { refreshGame: false }]
        ];
        toggleSettings.forEach(([inputId, key, options]) => {
            const input = document.getElementById(inputId);
            if (!input) return;
            input.addEventListener('change', (e) => {
                this.updateSetting(key, !!e.currentTarget.checked, options);
            });
        });

        document.getElementById('settings-log-level')?.addEventListener('change', (e) => {
            if (!this.hasDeveloperAccess()) {
                this.syncDeveloperSettingsUi();
                return;
            }
            this.updateSetting('developerLogLevel', e.currentTarget.value, { refreshGame: false });
        });

        document.getElementById('settings-basic-attack-sound')?.addEventListener('change', (e) => {
            const nextValue = e.currentTarget.value;
            this.updateSetting('basicAttackSound', nextValue, { refreshGame: false });
            this.game.sound?.playSfx?.(nextValue);
        });

        document.getElementById('settings-dev-exit')?.addEventListener('click', () => {
            this.setDevMode(false, { announce: true });
        });
        document.getElementById('settings-dev-lock')?.addEventListener('click', () => {
            this.lockDeveloperAccess({ announce: true });
        });

        const openUiLayoutBtn = document.getElementById('settings-open-ui-layout');
        if (openUiLayoutBtn) {
            const handleOpenUiLayout = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hideAllPopups();
                this.enterUiLayoutEditMode();
            };
            openUiLayoutBtn.addEventListener('click', handleOpenUiLayout);
            openUiLayoutBtn.addEventListener('touchstart', handleOpenUiLayout, { passive: false });
        }
        document.getElementById('settings-open-history')?.addEventListener('click', () => {
            this.toggleUpdateHistory();
        });
        document.getElementById('settings-reset-ui-layout')?.addEventListener('click', () => {
            this.resetStoredUiLayoutForCurrentMode();
        });
        document.getElementById('ui-layout-target-select')?.addEventListener('change', (e) => {
            this.selectUiLayoutControl(e.currentTarget.value);
        });
        document.getElementById('ui-layout-size-range')?.addEventListener('input', (e) => {
            if (!this.uiLayoutSelectedControlId) return;
            this.updateUiLayoutEntry(this.uiLayoutSelectedControlId, {
                scale: Number(e.currentTarget.value) / 100
            });
        });
        document.getElementById('ui-layout-reset-selected')?.addEventListener('click', () => {
            this.resetSelectedUiLayoutControl();
        });
        document.getElementById('ui-layout-reset-mode')?.addEventListener('click', () => {
            this.resetUiLayoutDraftForCurrentMode();
        });
        document.getElementById('ui-layout-cancel')?.addEventListener('click', () => {
            this.exitUiLayoutEditMode({ save: false });
        });
        document.getElementById('ui-layout-save')?.addEventListener('click', () => {
            this.exitUiLayoutEditMode({ save: true });
        });
        this.syncSettingsUi();

        // Player Name Edit/Save Buttons
        const nameEditBtn = document.getElementById('player-name-edit-btn');
        const nameSaveBtn = document.getElementById('player-name-save-btn');
        const nameDisplayRow = document.getElementById('name-display-row');
        const nameInputRow = document.getElementById('name-input-row');
        const nameInput = document.getElementById('player-name-input');
        const nameDisplay = document.getElementById('player-name-display');

        if (nameEditBtn && nameSaveBtn && nameInput) {
            nameEditBtn.addEventListener('click', () => {
                // Show input row, hide display row
                nameDisplayRow.style.display = 'none';
                nameInputRow.style.display = 'block';
                nameInput.value = this.game.localPlayer?.name || '유리카';
                nameInput.focus();
            });

            nameSaveBtn.addEventListener('click', async () => {
                const player = this.game.localPlayer;
                if (!player) return;
                const oldName = player.name;
                const newName = nameInput.value.trim() || '유리카';
                if (oldName === newName) {
                    nameInputRow.style.display = 'none';
                    nameDisplayRow.style.display = 'block';
                    return;
                }
                if (newName.length < 2 || newName.length > 8 || /[.#$\/\[\]\u0000-\u001F\u007F]/.test(newName)) {
                    alert('이름은 2~8자이며 . # $ / [ ] 문자를 사용할 수 없습니다.');
                    return;
                }

                nameSaveBtn.disabled = true;
                let mappingUpdated = false;
                try {
                    mappingUpdated = await this.game.net.updateNameMapping(player.id, oldName, newName);
                    if (!mappingUpdated) throw new Error('name_claim_failed');

                    player.name = newName;
                    const saveResult = await player.saveState(false, {
                        debounceMs: 0,
                        reason: 'player_name_change'
                    });
                    if (!saveResult?.ok) {
                        throw saveResult?.error || new Error(saveResult?.reason || 'name_profile_save_failed');
                    }

                    localStorage.setItem('yurika_player_name', newName);
                    nameDisplay.textContent = newName;
                    nameInputRow.style.display = 'none';
                    nameDisplayRow.style.display = 'block';
                } catch (error) {
                    if (mappingUpdated) {
                        await this.game.net.updateNameMapping(player.id, newName, oldName);
                    }
                    player.name = oldName;
                    nameInput.value = oldName;
                    Logger.error('[UI] Player name change failed', error);
                    alert('이름을 변경하지 못했습니다. 이미 사용 중이거나 저장에 실패했습니다.');
                } finally {
                    nameSaveBtn.disabled = false;
                }
            });

            // Also save on Enter key
            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    nameSaveBtn.click();
                }
            });
        }

        // v2.1: Emote UI
        const chatArea = document.querySelector('.chat-input-area');
        if (chatArea && !document.getElementById('btn-emote')) {
            const emoteBtn = document.createElement('button');
            emoteBtn.id = 'btn-emote';
            emoteBtn.className = 'btn-emote';
            emoteBtn.textContent = '😀';
            emoteBtn.style.cssText = 'width: 30px; height: 30px; margin-right: 5px; border: none; background: none; font-size: 20px; cursor: pointer;';
            chatArea.insertBefore(emoteBtn, chatArea.firstChild);

            // Emote Panel
            const emotePanel = document.createElement('div');
            emotePanel.id = 'emote-panel';
            emotePanel.className = 'emote-panel hidden';
            emotePanel.style.cssText = 'position: absolute; bottom: 50px; left: 10px; background: rgba(0,0,0,0.8); padding: 10px; border-radius: 5px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; z-index: 1000;';
            document.body.appendChild(emotePanel);

            emoteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (emotePanel.classList.contains('hidden')) {
                    this.showEmotePanel();
                } else {
                    emotePanel.classList.add('hidden');
                }
            });

            // Close emote panel on outside click
            document.addEventListener('click', (e) => {
                if (!emotePanel.contains(e.target) && e.target !== emoteBtn) {
                    emotePanel.classList.add('hidden');
                }
            });
        }

        // Chat Input Focus/Blur (to disable game input)
        const chatInput = document.querySelector('.chat-input-area input');
        if (chatInput) {
            chatInput.addEventListener('focus', () => {
                if (this.uiLayoutEditMode) {
                    window.setTimeout(() => chatInput.blur(), 0);
                    return;
                }
                if (this.inputManager) this.inputManager.setEnabled(false);
                if (this.game.localPlayer) this.game.localPlayer.moveTarget = null;
            });
            chatInput.addEventListener('blur', () => {
                if (this.inputManager) this.inputManager.setEnabled(true);
            });
            chatInput.addEventListener('keydown', (e) => {
                // v0.00.14: Stop propagation to prevent InputHandler from seeing these keys
                e.stopPropagation();

                if (e.isComposing) return; // Prevent double trigger with IME

                // v0.00.63: Typing Sound
                if (this.game.sound && e.key.length === 1) { // Only printable chars
                    this.game.sound.playSfx('ui_type');
                }

                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.game.sound) this.game.sound.playSfx('ui_chat_send'); // v0.00.63: Send Sound
                    this.sendMessage();
                    chatInput.value = '';
                    chatInput.blur();
                    if (this.game.canvas) this.game.canvas.focus();
                } else if (e.key === 'Escape') {
                    e.stopPropagation();
                    chatInput.blur();
                    if (this.game.canvas) this.game.canvas.focus();
                }
            });
        }

        // Listen for Network Chats (v0.26.0)
        if (this.game.net) {
            this.game.net.on('chatReceived', (data) => this._onChatReceived(data));
            this.game.net.on('emoteReceived', (data) => this._onEmoteReceived(data));

            // v0.00.65: Party System Listeners (Moved from Player.js to avoid constructor errors)
            this.game.net.on('partyInviteReceived', (data) => {
                this.showGenericModal(
                    '파티 초대',
                    `"${data.fromName}"님이 파티에 초대했습니다.`,
                    async () => {
                        await this.game.net.respondToInvite(data.id, data.from, true, data.party);
                        this.updatePartyUI();
                    },
                    async () => {
                        await this.game.net.respondToInvite(data.id, data.from, false, data.party);
                    },
                    { yesText: '수락', noText: '거절' }
                );
            });

            this.game.net.on('partyResponseReceived', (data) => {
                if (data.accept) {
                    if (data.party) {
                        this.game.net._applyLocalPartyState(data.party);
                    } else if (Array.isArray(data.partyMembers) && this.game.localPlayer?.setPartyMembers) {
                        this.game.localPlayer.setPartyMembers(data.partyMembers);
                    } else if (this.game.localPlayer) {
                        this.game.localPlayer.addToParty(data.from);
                    }
                    this.updatePartyUI();
                } else {
                    this.showGenericModal(
                        '파티 초대 거절',
                        `"${data.fromName}"님이 파티 초대를 거절했습니다.`,
                        null,
                        null,
                        { yesText: '확인', hideNo: true }
                    );
                }
            });
        }

        // v0.26.0: Global Enter to focus chat (PC Convenience)
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const active = document.activeElement;
                if (active === chatInput) return; // Already in chat
                if (active?.matches?.('input, textarea, button, select, a[href], [role="button"], [contenteditable="true"]')) return;
                if (active?.closest?.('[role="dialog"]')) return;

                if (chatInput) {
                    chatInput.focus();
                    e.preventDefault();
                }
            }
        });
    }

    showDeathModal() {
        const modal = document.getElementById('death-modal');
        const timerText = document.getElementById('death-timer-text');
        const retryBtn = document.getElementById('retry-btn');

        if (modal) modal.classList.remove('hidden');
        if (retryBtn) retryBtn.classList.add('hidden');

        let timeLeft = 3;
        if (timerText) timerText.textContent = `${timeLeft}초 후 부활 가능합니다...`;

        const interval = setInterval(() => {
            timeLeft--;
            if (timerText) timerText.textContent = `${timeLeft}초 후 부활 가능합니다...`;

            if (timeLeft <= 0) {
                clearInterval(interval);
                if (timerText) timerText.textContent = '지금 바로 부활할 수 있습니다!';
                if (retryBtn) retryBtn.classList.remove('hidden');
            }
        }, 1000);
    }

    hideDeathModal() {
        const modal = document.getElementById('death-modal');
        if (modal) modal.classList.add('hidden');
    }

    updateMapContext(zoneData = this.game?.zone?.currentZone, zoneMeta = null) {
        if (!zoneData) return;
        const header = document.querySelector('#minimap-container .minimap-header');
        const minimap = document.getElementById('minimap-container');
        const resolvedMeta = zoneMeta || this.game?.zone?.getZoneMeta?.(zoneData.id);
        if (document.body) {
            document.body.dataset.currentZoneId = zoneData.id || '';
        }
        if (header) header.textContent = resolvedMeta?.name || zoneData.name || 'Yurika Map';
        if (minimap) {
            minimap.dataset.zoneId = zoneData.id || '';
            minimap.setAttribute('aria-label', `${resolvedMeta?.name || zoneData.name || '현재 필드'} 지도. 클릭하여 필드 이동`);
            minimap.title = '클릭하여 필드 이동';
        }
        this.lastMinimapSignature = null;
    }

    showMapTravelModal() {
        const player = this.game?.localPlayer;
        const scene = this.game?.sceneManager?.currentScene;
        const zones = this.game?.zone?.zoneCatalog || [];
        const genericModal = document.getElementById('generic-modal');
        if (genericModal && !genericModal.classList.contains('hidden')) return;
        if (scene?.isZoneTransitioning) {
            this.logSystemMessage?.('🗺️ 이미 다른 필드로 이동 중입니다.');
            return;
        }
        if (!player || typeof scene?.changeZone !== 'function' || zones.length === 0) {
            this.logSystemMessage?.('⚠️ 월드 지도 정보를 아직 불러오고 있습니다.');
            return;
        }

        this.showGenericModal('월드 지도', '', null, null, {
            hideNo: true,
            yesText: '닫기',
            onShow: (modal) => {
                const content = modal.querySelector('.confirm-modal-content');
                const message = document.getElementById('generic-modal-message');
                if (!message) return;
                content?.classList.add('map-travel-modal-content');
                message.classList.add('map-travel-modal-message');
                message.replaceChildren();

                const intro = document.createElement('p');
                intro.className = 'map-travel-intro';
                intro.id = 'map-travel-dialog-description';
                intro.textContent = '필드는 단계적으로 강해집니다. 레벨 차이가 4 이상 나기 시작하면 획득 경험치가 감소합니다.';
                message.appendChild(intro);
                modal.setAttribute('aria-describedby', intro.id);

                const list = document.createElement('div');
                list.className = 'map-travel-list';
                const currentZoneId = this.game.zone?.currentZone?.id;
                zones.forEach((zone) => {
                    const isCurrent = zone.id === currentZoneId;
                    const isLocked = player.level < Number(zone.requiredLevel || 1);
                    const questTravelView = this.game.quests?.getMapTravelQuestView?.(zone.id) || null;
                    const isQuestRecommended = !!questTravelView?.recommended && !isCurrent;
                    const travelState = scene.getZoneTravelState?.(zone.id) || null;
                    const isTemporarilyUnavailable = !isCurrent && !isLocked && travelState && !travelState.ok;
                    const card = document.createElement('article');
                    card.className = `map-travel-card ${isCurrent ? 'is-current' : (isLocked ? 'is-locked' : (isTemporarilyUnavailable ? 'is-unavailable' : 'is-available'))}${isQuestRecommended ? ' is-quest-recommended' : ''}`;
                    card.style.setProperty('--map-accent', zone.accentColor || '#6ed7c7');

                    const heading = document.createElement('div');
                    heading.className = 'map-travel-card-heading';
                    const titleWrap = document.createElement('div');
                    const title = document.createElement('h3');
                    title.textContent = zone.name;
                    const subtitle = document.createElement('span');
                    subtitle.textContent = zone.subtitle || zone.description || '';
                    titleWrap.append(title, subtitle);
                    const badge = document.createElement('strong');
                    const unavailableLabels = {
                        dead: '부활 후 이동',
                        story_locked: '진행 완료 후 이동',
                        transitioning: '이동 처리 중'
                    };
                    badge.textContent = isCurrent
                        ? '현재 위치'
                        : (isLocked
                            ? (questTravelView?.badge || `Lv.${zone.requiredLevel} 잠금`)
                            : (isTemporarilyUnavailable ? (unavailableLabels[travelState.reason] || '현재 이동 불가') : (questTravelView?.badge || '이동 가능')));
                    heading.append(titleWrap, badge);

                    const recommended = zone.recommendedLevel || {};
                    const levelText = document.createElement('p');
                    levelText.className = 'map-travel-level';
                    levelText.textContent = `입장 Lv.${zone.requiredLevel || 1} · 권장 Lv.${recommended.min || zone.requiredLevel || 1}–${recommended.max || recommended.min || zone.requiredLevel || 1}`;

                    const monsterText = document.createElement('p');
                    monsterText.className = 'map-travel-monsters';
                    const normalNames = (zone.normalMonsters || []).map((monster) => monster.name).join(' · ') || '필드 몬스터';
                    monsterText.textContent = `몬스터 ${normalNames}`;

                    const bossText = document.createElement('p');
                    bossText.className = 'map-travel-boss';
                    bossText.textContent = zone.boss
                        ? `보스 ${zone.boss.name} · 전용 무기 ${zone.boss.weaponName}`
                        : '필드 보스 정보 없음';

                    const questHint = document.createElement('p');
                    questHint.className = 'map-travel-quest-hint';
                    questHint.textContent = questTravelView?.hint || '';
                    questHint.style.display = questTravelView?.hint ? 'block' : 'none';

                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'map-travel-button';
                    button.disabled = isCurrent || isLocked || isTemporarilyUnavailable;
                    button.textContent = isCurrent
                        ? '현재 필드'
                        : (isLocked
                            ? (questTravelView?.buttonText || `레벨 ${zone.requiredLevel} 필요`)
                            : (isTemporarilyUnavailable ? (unavailableLabels[travelState.reason] || '현재 이동 불가') : (questTravelView?.buttonText || '이동하기')));
                    button.addEventListener('click', async (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (button.disabled) return;
                        list.querySelectorAll('button').forEach((entry) => { entry.disabled = true; });
                        button.textContent = '이동 중...';
                        const moved = await scene.changeZone(zone.id);
                        if (!moved && document.getElementById('generic-modal-title')?.textContent === '월드 지도') {
                            this.hideGenericModal();
                            this.showMapTravelModal();
                        }
                    });

                    card.append(heading, levelText, monsterText, bossText, questHint, button);
                    list.appendChild(card);
                });
                message.appendChild(list);

                const note = document.createElement('p');
                note.className = 'map-travel-note';
                note.textContent = '과레벨 EXP: +0~3 100% · +4~5 75% · +6~8 50% · +9~12 25% · +13 이상 10%';
                message.appendChild(note);
            }
        });
    }

    showGenericModal(title, message, onYes, onNo, options = {}) {
        const modal = document.getElementById('generic-modal');
        if (!modal) return;

        const titleEl = document.getElementById('generic-modal-title');
        const msgEl = document.getElementById('generic-modal-message');
        const yesBtn = document.getElementById('generic-modal-yes');
        const noBtn = document.getElementById('generic-modal-no');
        const contentEl = modal.querySelector('.confirm-modal-content');
        const { yesText, noText, hideNo = !onNo, allowHtml = false, onShow = null } = options;
        modal.setAttribute('aria-describedby', 'generic-modal-message');
        if (modal.classList.contains('hidden')) {
            this._genericModalPreviousFocus = document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        }
        if (this._genericModalKeydownHandler) {
            modal.removeEventListener('keydown', this._genericModalKeydownHandler);
        }

        contentEl?.classList.remove('map-travel-modal-content');
        msgEl?.classList.remove('map-travel-modal-message');
        if (titleEl) titleEl.textContent = title;
        if (msgEl) {
            if (allowHtml) {
                msgEl.innerHTML = message;
            } else {
                msgEl.textContent = message;
            }
            msgEl.scrollTop = 0;
        }

        const newYes = yesBtn.cloneNode(true);
        const newNo = noBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYes, yesBtn);
        noBtn.parentNode.replaceChild(newNo, noBtn);
        newYes.textContent = yesText || (hideNo ? '확인' : '수락');
        newNo.textContent = noText || '거절';
        newNo.style.display = hideNo ? 'none' : '';
        newYes.disabled = false;
        newNo.disabled = false;

        let modalActionPending = false;
        const runModalAction = async (callback) => {
            if (modalActionPending) return;
            modalActionPending = true;
            try {
                const shouldClose = callback ? await callback() : true;
                const stillOwnsModal = document.getElementById('generic-modal-yes') === newYes;
                if (shouldClose !== false && stillOwnsModal) {
                    this.hideGenericModal();
                }
            } catch (error) {
                Logger.error('[UI] Generic modal action failed', error);
            } finally {
                modalActionPending = false;
            }
        };

        newYes.onclick = () => runModalAction(onYes);
        newNo.onclick = () => runModalAction(onNo);

        modal.classList.remove('hidden');
        modal.classList.add('visible');
        if (contentEl) contentEl.scrollTop = 0;
        if (typeof onShow === 'function') {
            onShow(modal);
        }
        this._genericModalKeydownHandler = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                if (event.repeat) return;
                if (hideNo) this.hideGenericModal();
                else newNo.click();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = Array.from(modal.querySelectorAll(
                'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
            )).filter((element) => element instanceof HTMLElement && element.offsetParent !== null);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        modal.addEventListener('keydown', this._genericModalKeydownHandler);
        const focusModal = () => {
            const preferred = modal.querySelector('.map-travel-button:not(:disabled)') || newYes;
            preferred?.focus?.({ preventScroll: true });
        };
        if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(focusModal);
        else setTimeout(focusModal, 0);
        this.refreshDesktopShortcutHints();
    }

    requestGenericDecision(title, message, options = {}) {
        return new Promise((resolve) => {
            this.showGenericModal(
                title,
                message,
                () => resolve(true),
                () => resolve(false),
                {
                    hideNo: false,
                    yesText: options.yesText || '확인',
                    noText: options.noText || '취소'
                }
            );
        });
    }

    updateHostilityUI() {
        if (!this.game.localPlayer) return;
        const panel = document.getElementById('hostility-panel');
        const list = document.getElementById('hostility-list');
        if (!panel || !list) return;

        const hostileTargets = this.game.localPlayer.hostileTargets;
        if (hostileTargets.size === 0) {
            panel.classList.add('hidden');
            return;
        }

        panel.classList.remove('hidden');
        list.innerHTML = '';

        hostileTargets.forEach((data, uid) => {
            const li = document.createElement('li');
            li.className = 'hostility-item';

            // data is { name, ts }
            const name = data && typeof data === 'object' ? data.name : "Unknown";

            li.innerHTML = `<span>${name}</span> <button class="btn-remove-hostile" data-uid="${uid}">x</button>`;

            // Remove handler (v1.99.38: Use declareHostility to ensure network event and cooldown)
            li.querySelector('.btn-remove-hostile').onclick = async () => {
                const result = await this.game.localPlayer.declareHostility(name);
                if (result === 'REMOVED' || result === 'DECLARED') {
                    // Success or Toggle. If it was already REMOVED, the method handles the sync.
                    this.updateHostilityUI();
                } else if (result.startsWith('COOLDOWN:')) {
                    const time = result.split(':')[1];
                    this.logSystemMessage(`⚠️ 적대 해제는 선포 후 30초가 지나야 가능합니다. (남은 시간: ${time}초)`);
                }
            };

            list.appendChild(li);
        });
    }

    updatePartyUI() {
        if (!this.game.localPlayer) return;
        const panel = document.getElementById('party-panel');
        const list = document.getElementById('party-list');
        if (!panel || !list) return;

        const party = this.game.localPlayer.party;
        if (!party) {
            panel.classList.add('hidden');
            return;
        }

        panel.classList.remove('hidden');
        list.innerHTML = '';

        party.members.forEach(uid => {
            const li = document.createElement('li');
            li.className = 'party-item';

            let name = "로딩 중...";

            if (uid === this.game.localPlayer.id) {
                name = this.game.localPlayer.name;
            } else if (this.game.remotePlayers.has(uid)) {
                name = this.game.remotePlayers.get(uid).name;
            }

            li.textContent = `${name}`;
            list.appendChild(li);
        });
    }

    hideGenericModal() {
        const modal = document.getElementById('generic-modal');
        if (modal) {
            if (this._genericModalKeydownHandler) {
                modal.removeEventListener('keydown', this._genericModalKeydownHandler);
                this._genericModalKeydownHandler = null;
            }
            modal.classList.remove('visible');
            modal.classList.add('hidden');
        }
        const previousFocus = this._genericModalPreviousFocus;
        this._genericModalPreviousFocus = null;
        if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
        this.refreshDesktopShortcutHints();
    }

    setupFriendsUI() {
        const searchInput = document.getElementById('friend-search-input');
        const searchBtn = document.getElementById('friend-search-btn');
        const addBtn = document.getElementById('friend-add-btn');
        const togetherBtn = document.getElementById('friend-together-btn');
        const removeBtn = document.getElementById('friend-remove-btn');
        const messageToggleBtn = document.getElementById('friend-message-toggle-btn');
        const messageSendBtn = document.getElementById('friend-message-send-btn');
        const giftBtn = document.getElementById('friend-gift-btn');
        const mobileNavButtons = Array.from(document.querySelectorAll('#friends-mobile-nav .friends-mobile-nav-btn'));

        mobileNavButtons.forEach((button) => {
            button.addEventListener('click', () => {
                this.setFriendsMobileView(button.dataset.friendsView || 'list', { force: true });
            });
        });

        const runLookup = async () => {
            const keyword = searchInput?.value?.trim() || '';
            this.setFriendsMobileView('search', { force: true });
            if (!keyword || !this.game.net) {
                this.friendSearchResult = null;
                this.renderFriendSearchResult('아이디 또는 이름을 입력해 주세요.');
                return;
            }

            this.renderFriendSearchResult('조회 중입니다...');
            const uid = await this.game.net.getUidByName(keyword);
            if (!uid) {
                this.friendSearchResult = null;
                this.renderFriendSearchResult('대상을 찾지 못했습니다.');
                return;
            }

            const profile = await this.game.net.getPlayerProfile(uid);
            if (!profile) {
                this.friendSearchResult = null;
                this.renderFriendSearchResult('프로필을 불러오지 못했습니다.');
                return;
            }

            this.friendSearchResult = {
                uid,
                query: keyword,
                name: profile.name || keyword,
                profile
            };
            this.friendProfileCache.set(uid, profile);
            const statusText = this.game.net.isUserOnline(uid) ? '접속 중' : '오프라인';
            const alreadyFriend = this.game.net.isFriend(uid);
            this.renderFriendSearchResult(`${profile.name || keyword} (${statusText})${alreadyFriend ? ' - 이미 친구입니다.' : ''}`);
        };

        searchBtn?.addEventListener('click', runLookup);
        searchInput?.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            runLookup();
        });

        addBtn?.addEventListener('click', async () => {
            if (!this.friendSearchResult || !this.game.net) return;
            if (this.game.net.isFriend(this.friendSearchResult.uid)) {
                this.selectFriend(this.friendSearchResult.uid);
                return;
            }
            const result = await this.game.net.addFriendByName(this.friendSearchResult.query || this.friendSearchResult.name);
            if (!result.ok) {
                const messages = {
                    invalid_name: '올바른 아이디를 입력해 주세요.',
                    not_found: '대상을 찾지 못했습니다.',
                    self: '자기 자신은 친구로 추가할 수 없습니다.',
                    already_friend: '이미 친구입니다.',
                    profile_missing: '상대 프로필이 아직 준비되지 않았습니다.'
                };
                this.showGenericModal('친구 추가', messages[result.reason] || '친구 추가 중 오류가 발생했습니다.', null, null, { hideNo: true, yesText: '확인' });
                return;
            }

            this.showGenericModal('친구 추가', `"${result.name}" 님을 친구로 추가했습니다.`, null, null, { hideNo: true, yesText: '확인' });
            this.friendSearchResult = null;
            if (searchInput) searchInput.value = '';
            this.renderFriendSearchResult('검색 결과가 여기에 표시됩니다.');
            this.refreshFriendsPopup();
            this.setFriendsMobileView('list', { force: true });
        });

        togetherBtn?.addEventListener('click', async () => {
            if (!this.selectedFriendUid || !this.game.net) return;
            const result = await this.game.net.requestTogether(this.selectedFriendUid);
            const messages = {
                SENT: '함께하기 요청을 보냈습니다.',
                SELF: '자기 자신에게는 요청할 수 없습니다.',
                NOT_FRIEND: '친구에게만 함께하기를 요청할 수 있습니다.',
                OFFLINE: '상대가 현재 접속 중이 아닙니다.',
                BUSY: '이미 함께 플레이 중입니다. 먼저 현재 함께하기를 종료해 주세요.',
                ERROR: '함께하기 요청 중 오류가 발생했습니다.'
            };
            this.showGenericModal('함께하기', messages[result] || '처리할 수 없습니다.', null, null, { hideNo: true, yesText: '확인' });
        });

        removeBtn?.addEventListener('click', () => {
            if (!this.selectedFriendUid || !this.game.net) return;
            const friendName = this.getSelectedFriendName();
            this.showConfirm(`"${friendName}" 님을 친구 목록에서 삭제할까요?`, async (confirmed) => {
                if (!confirmed) return;
                await this.game.net.removeFriend(this.selectedFriendUid);
                this.selectedFriendUid = null;
                this.refreshFriendsPopup();
                this.setFriendsMobileView('list', { force: true });
            });
        });

        messageToggleBtn?.addEventListener('click', () => {
            const card = document.getElementById('friend-message-card');
            const isHidden = card?.classList.contains('hidden');
            this.setFriendMessageComposerVisible(isHidden);
            if (isHidden) {
                document.getElementById('friend-message-input')?.focus();
            }
        });

        messageSendBtn?.addEventListener('click', async () => {
            if (!this.selectedFriendUid || !this.game.net) return;
            const input = document.getElementById('friend-message-input');
            const text = input?.value?.trim() || '';
            if (!text) return;
            const result = await this.game.net.sendFriendMessage(this.selectedFriendUid, text);
            if (!result.ok) {
                const messages = {
                    invalid_message: '보낼 메시지를 입력해 주세요.',
                    not_friend: '친구에게만 메시지를 보낼 수 있습니다.'
                };
                this.showGenericModal('친구 메시지', messages[result.reason] || '메시지 전송 중 오류가 발생했습니다.', null, null, { hideNo: true, yesText: '확인' });
                return;
            }
            if (input) input.value = '';
            this.setFriendMessageComposerVisible(false);
            this.logSystemMessage(`[친구→${this.getSelectedFriendName()}] ${result.payload.text}`);
        });

        giftBtn?.addEventListener('click', () => {
            if (!this.selectedFriendUid) return;
            this.showGenericModal('선물 보내기', '선물 기능은 다음 단계에서 연결할 예정입니다. 이번 변경에서는 친구/함께하기 흐름을 우선 정리했습니다.', null, null, { hideNo: true, yesText: '확인' });
        });

        if (this.game.net) {
            this.game.net.on('friendsUpdated', () => this.refreshFriendsPopup());
            this.game.net.on('presenceChanged', () => this.refreshFriendsPopup());
            this.game.net.on('partyUpdated', () => this.refreshFriendsPopup());
            this.game.net.on('friendMessageReceived', (data) => {
                const senderName = data?.fromName || '친구';
                this.logSystemMessage(`[친구 메시지] ${senderName}: ${data?.text || ''}`);
                if (!this.isPopupOpen('friends-popup')) {
                    this.setFriendsAlertActive(true);
                }
                this.refreshFriendsPopup();
            });
            this.game.net.on('togetherRequestReceived', (data) => {
                this.showGenericModal(
                    '함께하기 요청',
                    `"${data.fromName}" 님이 함께 플레이를 요청했습니다. 수락하면 상대가 내 필드로 합류합니다.`,
                    async () => {
                        const result = await this.game.net.respondToTogetherRequest(data.id, data.fromUid, true);
                        if (!result?.ok) {
                            const failMessage = result?.reason === 'party_full'
                                ? '현재 함께 플레이 중인 인원이 이미 가득 찼습니다.'
                                : '지금은 함께하기를 수락할 수 없습니다.';
                            this.showGenericModal('함께하기', failMessage, null, null, { hideNo: true, yesText: '확인' });
                        }
                    },
                    async () => {
                        await this.game.net.respondToTogetherRequest(data.id, data.fromUid, false);
                    },
                    { yesText: '수락', noText: '거절' }
                );
            });
            this.game.net.on('togetherResponseReceived', (data) => {
                if (!data?.accept) {
                    const failMessages = {
                        declined: '상대가 함께하기 요청을 거절했습니다.',
                        host_busy: '상대가 지금은 손님을 받을 수 없습니다.',
                        party_full: '상대 필드는 이미 최대 인원입니다.'
                    };
                    this.showGenericModal('함께하기', failMessages[data?.reason] || '함께하기 요청이 수락되지 않았습니다.', null, null, { hideNo: true, yesText: '확인' });
                    return;
                }

                if (data.party) {
                    this.game.net._applyLocalPartyState(data.party);
                    this.updatePartyUI();
                }

                const hostPosition = data.hostPosition || null;
                const player = this.game.localPlayer;
                if (player && hostPosition && Number.isFinite(hostPosition.x) && Number.isFinite(hostPosition.y)) {
                    player.x = hostPosition.x + 48;
                    player.y = hostPosition.y + 24;
                    player.moveTarget = null;
                    player.saveState(true);
                }

                this.showGenericModal('함께하기', `"${data.fromName}" 님의 필드에 합류했습니다.`, null, null, { hideNo: true, yesText: '확인' });
            });
        }

        this.renderFriendSearchResult('검색 결과가 여기에 표시됩니다.');
        this.setFriendMessageComposerVisible(false);
        this.refreshFriendsPopup();
        this.syncFriendsPopupLayout();
    }

    isPopupOpen(id) {
        const popup = document.getElementById(id);
        return !!popup && !popup.classList.contains('hidden');
    }

    setFriendsAlertActive(active) {
        const dot = document.getElementById('friends-alert-dot');
        if (dot) {
            dot.classList.toggle('active', !!active);
        }
    }

    setFriendMessageComposerVisible(visible) {
        const card = document.getElementById('friend-message-card');
        const toggleBtn = document.getElementById('friend-message-toggle-btn');
        const nextVisible = !!visible;
        if (card) {
            card.classList.toggle('hidden', !nextVisible);
        }
        if (toggleBtn) {
            toggleBtn.textContent = nextVisible ? '메시지 닫기' : '메시지 보내기';
        }
    }

    getFriendsPopupMode() {
        const isTouch = window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0;
        const isMobile = isTouch && window.innerWidth <= 1024;
        if (!isMobile) return 'desktop';
        return this.isMobileLandscapeViewport() ? 'mobileLandscape' : 'mobilePortrait';
    }

    setFriendsMobileView(view = 'list', options = {}) {
        const allowedViews = new Set(['search', 'list', 'detail']);
        const requestedView = allowedViews.has(view) ? view : 'list';
        const nextView = requestedView === 'detail' && !this.selectedFriendUid ? 'list' : requestedView;
        const changed = this.friendsMobileView !== nextView;
        this.friendsMobileView = nextView;
        if (changed || options.force) {
            this.syncFriendsPopupLayout();
        }
    }

    syncFriendsPopupLayout() {
        const popup = document.getElementById('friends-popup');
        if (!popup) return;

        const mode = this.getFriendsPopupMode();
        const isMobile = mode !== 'desktop';
        const hasSelectedFriend = !!this.selectedFriendUid;
        if (isMobile && this.friendsMobileView === 'detail' && !hasSelectedFriend) {
            this.friendsMobileView = this.friendSearchResult ? 'search' : 'list';
        }

        const activeView = isMobile
            ? (this.friendsMobileView || (this.friendSearchResult ? 'search' : 'list'))
            : 'split';
        popup.dataset.friendsMode = mode;
        popup.dataset.friendsView = activeView;

        const nav = document.getElementById('friends-mobile-nav');
        nav?.classList.toggle('hidden', !isMobile);
        document.querySelectorAll('#friends-mobile-nav .friends-mobile-nav-btn').forEach((button) => {
            const view = button.dataset.friendsView || 'list';
            const isActive = isMobile && activeView === view;
            button.classList.toggle('is-active', isActive);
            button.disabled = view === 'detail' && !hasSelectedFriend;
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        const sidebar = popup.querySelector('.friends-sidebar');
        const searchCard = popup.querySelector('.friends-search-card');
        const listCard = popup.querySelector('.friends-list-card');
        const detailCard = popup.querySelector('.friends-detail-card');

        if (!isMobile) {
            sidebar?.classList.remove('hidden');
            searchCard?.classList.remove('hidden');
            listCard?.classList.remove('hidden');
            detailCard?.classList.remove('hidden');
            return;
        }

        sidebar?.classList.toggle('hidden', activeView === 'detail');
        detailCard?.classList.toggle('hidden', activeView !== 'detail');
        searchCard?.classList.toggle('hidden', activeView !== 'search');
        listCard?.classList.toggle('hidden', activeView !== 'list');
    }

    getSelectedFriendName() {
        const friends = (this.game.net?.getFriendListSnapshot?.() || []).sort((a, b) => {
            if (!!a.online !== !!b.online) return a.online ? -1 : 1;
            return String(a.name || a.uid || '').localeCompare(String(b.name || b.uid || ''), 'ko');
        });
        const friend = friends.find((entry) => entry.uid === this.selectedFriendUid);
        return friend?.name || '친구';
    }

    renderFriendSearchResult(message = '') {
        const resultEl = document.getElementById('friend-search-result');
        const addBtn = document.getElementById('friend-add-btn');
        const alreadyFriend = !!(this.friendSearchResult && this.game.net?.isFriend?.(this.friendSearchResult.uid));
        if (resultEl) {
            resultEl.textContent = message;
        }
        if (addBtn) {
            addBtn.textContent = alreadyFriend ? '친구 보기' : '친구 추가';
            addBtn.disabled = !this.friendSearchResult;
        }
    }

    async selectFriend(uid) {
        if (!uid || !this.game.net) return;
        this.selectedFriendUid = uid;
        this.setFriendMessageComposerVisible(false);
        this.refreshFriendsPopup();
        if (this.getFriendsPopupMode() !== 'desktop') {
            this.setFriendsMobileView('detail', { force: true });
        }

        if (!this.friendProfileCache.has(uid)) {
            const profile = await this.game.net.getPlayerProfile(uid);
            if (profile) {
                this.friendProfileCache.set(uid, profile);
            }
        }

        this.refreshFriendsPopup();
        if (this.getFriendsPopupMode() !== 'desktop') {
            this.setFriendsMobileView('detail', { force: true });
        }
    }

    refreshFriendsPopup() {
        const friends = this.game.net?.getFriendListSnapshot?.() || [];
        const countEl = document.getElementById('friends-count');
        const listEl = document.getElementById('friends-list');
        if (countEl) {
            countEl.textContent = `${friends.length}명`;
        }
        if (!listEl) return;

        if (this.selectedFriendUid && !friends.some((entry) => entry.uid === this.selectedFriendUid)) {
            this.selectedFriendUid = null;
            this.setFriendMessageComposerVisible(false);
        }

        this.syncFriendsPopupLayout();

        listEl.innerHTML = '';
        if (friends.length === 0) {
            listEl.innerHTML = '<div class="friends-detail-empty">아직 친구가 없습니다.</div>';
        } else {
            friends.forEach((friend) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = `friend-list-item${friend.uid === this.selectedFriendUid ? ' is-selected' : ''}`;
                item.innerHTML = `
                    <div class="friend-list-topline">
                        <span class="friend-list-name">${friend.name || friend.uid}</span>
                        <span class="friends-status-chip${friend.online ? ' is-online' : ''}">${friend.online ? '접속 중' : '오프라인'}</span>
                    </div>
                    <div class="friend-list-meta">${friend.uid}</div>
                `;
                item.addEventListener('click', () => {
                    this.selectFriend(friend.uid);
                });
                listEl.appendChild(item);
            });
        }

        if (this.isPopupOpen('friends-popup')) {
            this.setFriendsAlertActive(false);
        }

        this.renderSelectedFriendDetail(friends);
    }

    buildFriendDerivedStats(profile = {}) {
        const definition = this.game.localPlayer?.definition || {};
        const base = definition.baseStats || {};
        const growth = definition.growthStats || { hp: 10, mp: 10, atk: 1, def: 1 };
        const vitality = Number(profile.vitality || 1);
        const intelligence = Number(profile.intelligence || 3);
        const wisdom = Number(profile.wisdom || 2);
        const agility = Number(profile.agility || 1);
        const hp = Number(profile.hp || 0);
        const mp = Number(profile.mp || 0);
        const maxHp = (base.maxHp ?? 30) + (vitality * (growth.hp ?? 10));
        const maxMp = (base.maxMp ?? 50) + (wisdom * (growth.mp ?? 10));
        const attack = (base.atk ?? 10) + (intelligence * (growth.atk ?? 1)) + Math.floor(wisdom / 2);
        const defense = Number(profile.defense ?? ((base.def ?? 1) + (vitality * (growth.def ?? 1))));
        const attackSpeed = Math.min(2.0, 1.0 + (intelligence * 0.05)) + (agility * 0.1);
        const critRate = 0.1 + (agility * 0.01) + (intelligence * 0.01);
        return {
            level: Number(profile.level || 1),
            hp,
            mp,
            maxHp,
            maxMp,
            vitality,
            intelligence,
            wisdom,
            agility,
            attack,
            defense,
            attackSpeed,
            critRate
        };
    }

    buildFriendWeaponPreview(weapon) {
        if (!weapon) return null;

        const detailSourcePlayer = this.game.localPlayer || {
            getWeaponAffixEffectiveValue: () => 0,
            getWeaponAffixEnhancementBonus: () => 0,
            getWeaponCombatHookValue: () => 0
        };
        const detail = this.buildInventoryDetail(detailSourcePlayer, weapon);
        const itemDefinition = this.game.itemData?.getItemDefinition?.(weapon.type) || null;
        const mergedLines = this.mergeInventoryEnhancementBonusLines(detail.lines)
            .map((line) => {
                if (!line) return '';
                if (typeof line === 'string') return this.escapeHtml(line.trim());
                if (typeof line === 'object') {
                    if (line.html) return String(line.html).trim();
                    if (line.text) return this.escapeHtml(String(line.text).trim());
                }
                return '';
            })
            .filter(Boolean);

        const visibleLines = mergedLines.slice(0, 5);
        return {
            title: detail.title,
            subtitle: itemDefinition?.category || itemDefinition?.weaponType || weapon.slot || '무기',
            lines: visibleLines,
            hiddenCount: Math.max(0, mergedLines.length - visibleLines.length)
        };
    }

    renderSelectedFriendDetail(friends = []) {
        const emptyEl = document.getElementById('friend-detail-empty');
        const panelEl = document.getElementById('friend-detail-panel');
        const selected = friends.find((entry) => entry.uid === this.selectedFriendUid) || null;

        if (!selected || !panelEl || !emptyEl) {
            emptyEl?.classList.remove('hidden');
            panelEl?.classList.add('hidden');
            return;
        }

        const profile = this.friendProfileCache.get(selected.uid) || null;
        const nameEl = document.getElementById('friend-detail-name');
        const statusEl = document.getElementById('friend-detail-status');
        const summaryEl = document.getElementById('friend-detail-summary');
        const statsEl = document.getElementById('friend-detail-stats');
        const weaponEl = document.getElementById('friend-detail-weapon');
        const togetherBtn = document.getElementById('friend-together-btn');

        emptyEl.classList.add('hidden');
        panelEl.classList.remove('hidden');

        if (nameEl) nameEl.textContent = selected.name || selected.uid;
        if (statusEl) {
            statusEl.textContent = selected.online ? '접속 중' : '오프라인';
            statusEl.classList.toggle('is-online', !!selected.online);
        }
        if (summaryEl) {
            summaryEl.innerHTML = `
                <span>아이디: ${selected.uid}</span>
                <span>${profile?.name ? `프로필 이름: ${profile.name}` : '프로필 로딩 중...'}</span>
            `;
        }
        if (togetherBtn) {
            togetherBtn.disabled = !selected.online;
        }

        if (!profile) {
            if (statsEl) statsEl.innerHTML = '<div class="friend-stat-card"><strong>불러오는 중</strong><span>프로필을 확인하고 있습니다.</span></div>';
            if (weaponEl) weaponEl.innerHTML = '<div class="friend-weapon-card"><strong>장착 무기</strong><span>무기 정보를 불러오는 중입니다.</span></div>';
            return;
        }

        const derived = this.buildFriendDerivedStats(profile);
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="friend-stat-grid">
                    <div class="friend-stat-card"><strong>레벨</strong><span>${derived.level}</span></div>
                    <div class="friend-stat-card"><strong>HP / MP</strong><span>${Math.floor(derived.hp)} / ${Math.floor(derived.maxHp)} | ${Math.floor(derived.mp)} / ${Math.floor(derived.maxMp)}</span></div>
                    <div class="friend-stat-card"><strong>기본 스탯</strong><span>VIT ${derived.vitality} / INT ${derived.intelligence} / WIS ${derived.wisdom} / AGI ${derived.agility}</span></div>
                    <div class="friend-stat-card"><strong>전투 수치</strong><span>공격력 ${derived.attack} / 방어력 ${derived.defense}</span></div>
                    <div class="friend-stat-card"><strong>공격속도</strong><span>${derived.attackSpeed.toFixed(2)}</span></div>
                    <div class="friend-stat-card"><strong>치명확률</strong><span>${Math.round(derived.critRate * 100)}%</span></div>
                </div>
            `;
        }

        if (weaponEl) {
            const weapon = profile?.equipment?.weapon || null;
            if (!weapon) {
                weaponEl.innerHTML = '<div class="friend-weapon-card"><strong>장착 무기 없음</strong><span>현재 무기를 장착하지 않았습니다.</span></div>';
            } else {
                const weaponPreview = this.buildFriendWeaponPreview(weapon);
                const weaponLines = (weaponPreview?.lines || []).map((line) => `<div>${line}</div>`).join('');
                weaponEl.innerHTML = `
                    <div class="friend-weapon-card">
                        <strong>${weaponPreview?.title || weapon.name || weapon.type}</strong>
                        <span class="friend-weapon-subtitle">${weaponPreview?.subtitle || '무기'}</span>
                        ${weaponLines ? `<div class="friend-weapon-lines">${weaponLines}</div>` : ''}
                        ${weaponPreview?.hiddenCount > 0 ? `<div class="friend-weapon-truncation">외 ${weaponPreview.hiddenCount}개 옵션 더 있음</div>` : ''}
                    </div>
                `;
            }
        }
    }

    getFriendStatusText(isOnline) {
        return isOnline ? '접속 중' : '오프라인';
    }

    getFriendAvatarText(name) {
        const source = String(name || '').trim();
        if (!source) return '?';
        return Array.from(source)[0];
    }

    getFriendWeaponDisplayData(weapon) {
        if (!weapon) return null;

        const itemDefinition = this.game.itemData?.getItemDefinition?.(weapon.type || weapon.id) || null;
        const definitionIcon = itemDefinition?.icon || null;
        const displayWeapon = {
            ...itemDefinition,
            ...weapon,
            name: weapon.name || itemDefinition?.name || weapon.type || '무기',
            iconPath: weapon.iconPath
                || itemDefinition?.iconPath
                || (definitionIcon?.type === 'image' ? definitionIcon.path : null)
                || null,
            icon: weapon.icon
                || (typeof itemDefinition?.icon === 'string' ? itemDefinition.icon : '')
                || definitionIcon?.fallbackEmoji
                || ''
        };

        const detailSourcePlayer = this.game.localPlayer || {
            getWeaponAffixEffectiveValue: () => 0,
            getWeaponAffixEnhancementBonus: () => 0,
            getWeaponCombatHookValue: () => 0
        };
        const detail = this.buildInventoryDetail(detailSourcePlayer, displayWeapon);
        return {
            displayWeapon,
            title: detail.title || displayWeapon.name,
            subtitle: detail.subtitle || itemDefinition?.category || itemDefinition?.weaponType || displayWeapon.slot || '무기',
            description: detail.description || '',
            lines: this.mergeInventoryEnhancementBonusLines(detail.lines).filter(Boolean)
        };
    }

    ensureFriendWeaponTooltip() {
        let tooltip = document.getElementById('friend-weapon-tooltip');
        if (tooltip) return tooltip;

        tooltip = document.createElement('div');
        tooltip.id = 'friend-weapon-tooltip';
        tooltip.className = 'friend-weapon-tooltip hidden';
        document.body.appendChild(tooltip);
        return tooltip;
    }

    showFriendWeaponTooltip(weaponData, anchorEl) {
        if (!weaponData || !anchorEl) return;

        const tooltip = this.ensureFriendWeaponTooltip();
        tooltip.innerHTML = '';

        const card = document.createElement('div');
        card.className = 'friend-weapon-tooltip-card';

        const head = document.createElement('div');
        head.className = 'inventory-detail-head';

        const titleBlock = document.createElement('div');
        titleBlock.className = 'inventory-detail-title-block';

        const titleEl = document.createElement('h3');
        titleEl.textContent = weaponData.title;
        titleBlock.appendChild(titleEl);

        if (weaponData.subtitle) {
            const subtitleEl = document.createElement('p');
            subtitleEl.textContent = weaponData.subtitle;
            titleBlock.appendChild(subtitleEl);
        }

        head.appendChild(titleBlock);
        card.appendChild(head);

        if (weaponData.description) {
            const descEl = document.createElement('p');
            descEl.className = 'inventory-detail-desc';
            descEl.textContent = weaponData.description;
            card.appendChild(descEl);
        }

        if (weaponData.lines?.length) {
            const statsEl = document.createElement('ul');
            statsEl.className = 'inventory-detail-stats';
            weaponData.lines.forEach((line) => {
                statsEl.appendChild(this.createInventoryDetailStatLineElement(line));
            });
            card.appendChild(statsEl);
        }

        tooltip.appendChild(card);
        tooltip.classList.remove('hidden');
        this.friendWeaponTooltipAnchor = anchorEl;
        this.positionFriendWeaponTooltip(anchorEl);
    }

    positionFriendWeaponTooltip(anchorEl = this.friendWeaponTooltipAnchor) {
        const tooltip = document.getElementById('friend-weapon-tooltip');
        const card = tooltip?.querySelector('.friend-weapon-tooltip-card');
        if (!tooltip || !card || tooltip.classList.contains('hidden') || !anchorEl?.isConnected) return;

        const anchorRect = anchorEl.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const gap = 10;
        const margin = 12;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

        let left = anchorRect.right + gap;
        if ((left + cardRect.width) > (viewportWidth - margin)) {
            left = anchorRect.left - cardRect.width - gap;
        }
        left = Math.max(margin, Math.min(left, viewportWidth - cardRect.width - margin));

        let top = anchorRect.top + ((anchorRect.height - cardRect.height) / 2);
        top = Math.max(margin, Math.min(top, viewportHeight - cardRect.height - margin));

        tooltip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    }

    hideFriendWeaponTooltip() {
        const tooltip = document.getElementById('friend-weapon-tooltip');
        if (!tooltip) return;

        tooltip.classList.add('hidden');
        tooltip.innerHTML = '';
        tooltip.style.removeProperty('transform');
        this.friendWeaponTooltipAnchor = null;
    }

    renderSelectedFriendDetail(friends = []) {
        this.hideFriendWeaponTooltip();
        this.syncFriendsPopupLayout();

        const emptyEl = document.getElementById('friend-detail-empty');
        const panelEl = document.getElementById('friend-detail-panel');
        const selected = friends.find((entry) => entry.uid === this.selectedFriendUid) || null;

        if (!selected || !panelEl || !emptyEl) {
            emptyEl?.classList.remove('hidden');
            panelEl?.classList.add('hidden');
            return;
        }

        const profile = this.friendProfileCache.get(selected.uid) || null;
        const displayName = profile?.name || selected.name || selected.uid;
        const nameEl = document.getElementById('friend-detail-name');
        const statusEl = document.getElementById('friend-detail-status');
        const summaryEl = document.getElementById('friend-detail-summary');
        const statsEl = document.getElementById('friend-detail-stats');
        const weaponEl = document.getElementById('friend-detail-weapon');
        const togetherBtn = document.getElementById('friend-together-btn');

        emptyEl.classList.add('hidden');
        panelEl.classList.remove('hidden');

        if (nameEl) nameEl.textContent = displayName;
        if (statusEl) {
            statusEl.textContent = this.getFriendStatusText(selected.online);
            statusEl.classList.toggle('is-online', !!selected.online);
        }
        if (summaryEl) {
            summaryEl.innerHTML = `
                <span>ID: ${this.escapeHtml(selected.uid)}</span>
                <span>프로필 이름: ${this.escapeHtml(profile?.name || '불러오는 중...')}</span>
            `;
        }
        if (togetherBtn) {
            togetherBtn.disabled = !selected.online;
        }

        if (!profile) {
            if (statsEl) {
                statsEl.innerHTML = '<div class="friend-stat-card"><strong>불러오는 중</strong><span>상대방의 상태 정보를 확인하고 있습니다.</span></div>';
            }
            if (weaponEl) {
                weaponEl.innerHTML = '<div class="friend-weapon-card"><strong>장착 무기</strong><span class="friend-weapon-help">무기 정보를 불러오는 중입니다.</span></div>';
            }
            return;
        }

        const derived = this.buildFriendDerivedStats(profile);
        const hpRatio = derived.maxHp > 0 ? Math.max(0, Math.min(1, derived.hp / derived.maxHp)) : 0;
        const mpRatio = derived.maxMp > 0 ? Math.max(0, Math.min(1, derived.mp / derived.maxMp)) : 0;

        if (statsEl) {
            statsEl.innerHTML = `
                <div class="friend-status-card">
                    <div class="friend-status-overview">
                        <div class="friend-status-avatar">
                            <span class="friend-status-avatar-text">${this.escapeHtml(this.getFriendAvatarText(displayName))}</span>
                        </div>
                        <div class="friend-status-head">
                            <div class="friend-status-name-row">
                                <p class="friend-status-name">${this.escapeHtml(displayName)}</p>
                                <span class="friends-status-chip${selected.online ? ' is-online' : ''}">${this.getFriendStatusText(selected.online)}</span>
                            </div>
                            <div class="friend-status-id">상대방의 현재 프로필과 접속 상태를 기준으로 표시됩니다.</div>
                            <div class="friend-status-bars">
                                <div class="friend-status-bar-row">
                                    <span class="friend-status-bar-label">HP</span>
                                    <div class="friend-status-bar-track">
                                        <span class="friend-status-bar-fill" style="width:${(hpRatio * 100).toFixed(1)}%"></span>
                                    </div>
                                    <span class="friend-status-bar-value">${Math.floor(derived.hp)} / ${Math.floor(derived.maxHp)}</span>
                                </div>
                                <div class="friend-status-bar-row">
                                    <span class="friend-status-bar-label">MP</span>
                                    <div class="friend-status-bar-track">
                                        <span class="friend-status-bar-fill mp" style="width:${(mpRatio * 100).toFixed(1)}%"></span>
                                    </div>
                                    <span class="friend-status-bar-value">${Math.floor(derived.mp)} / ${Math.floor(derived.maxMp)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="friend-stat-grid">
                        <div class="friend-stat-card"><strong>레벨</strong><span>${derived.level}</span></div>
                        <div class="friend-stat-card"><strong>공격속도</strong><span>${derived.attackSpeed.toFixed(2)}</span></div>
                        <div class="friend-stat-card"><strong>기본 스탯</strong><span>VIT ${derived.vitality} / INT ${derived.intelligence} / WIS ${derived.wisdom} / AGI ${derived.agility}</span></div>
                        <div class="friend-stat-card"><strong>전투 수치</strong><span>공격력 ${derived.attack} / 방어력 ${derived.defense}</span></div>
                        <div class="friend-stat-card"><strong>치명확률</strong><span>${Math.round(derived.critRate * 100)}%</span></div>
                        <div class="friend-stat-card"><strong>현재 상태</strong><span>${selected.online ? '함께하기 요청 가능' : '접속 시 함께하기 요청 가능'}</span></div>
                    </div>
                </div>
            `;
        }

        if (!weaponEl) return;

        weaponEl.innerHTML = '';
        const weaponData = this.getFriendWeaponDisplayData(profile?.equipment?.weapon || null);
        const weaponCard = document.createElement('div');
        weaponCard.className = 'friend-weapon-card';

        const labelEl = document.createElement('strong');
        labelEl.textContent = '장착 무기';
        weaponCard.appendChild(labelEl);

        const rowEl = document.createElement('div');
        rowEl.className = 'friend-weapon-head';

        if (!weaponData) {
            const emptyIcon = document.createElement('div');
            emptyIcon.className = 'friend-weapon-empty';
            emptyIcon.textContent = '-';

            const metaEl = document.createElement('div');
            metaEl.className = 'friend-weapon-meta';
            metaEl.innerHTML = `
                <span class="friend-weapon-name">장착 중인 무기 없음</span>
                <span class="friend-weapon-help">현재 장착한 무기가 없습니다.</span>
            `;

            rowEl.appendChild(emptyIcon);
            rowEl.appendChild(metaEl);
            weaponCard.appendChild(rowEl);
            weaponEl.appendChild(weaponCard);
            return;
        }

        const iconButton = document.createElement('button');
        iconButton.type = 'button';
        iconButton.className = 'friend-weapon-icon-button';
        iconButton.setAttribute('aria-label', `${weaponData.title} 상세 보기`);
        iconButton.title = `${weaponData.title} 상세 보기`;
        iconButton.appendChild(this.createInventoryIconElement(weaponData.displayWeapon, 'friend-weapon-icon'));

        const showTooltip = () => this.showFriendWeaponTooltip(weaponData, iconButton);
        iconButton.addEventListener('mouseenter', showTooltip);
        iconButton.addEventListener('focus', showTooltip);
        iconButton.addEventListener('mouseleave', () => this.hideFriendWeaponTooltip());
        iconButton.addEventListener('blur', () => this.hideFriendWeaponTooltip());
        iconButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const tooltip = document.getElementById('friend-weapon-tooltip');
            const isOpen = tooltip && !tooltip.classList.contains('hidden') && this.friendWeaponTooltipAnchor === iconButton;
            if (isOpen) {
                this.hideFriendWeaponTooltip();
            } else {
                this.showFriendWeaponTooltip(weaponData, iconButton);
            }
        });

        const metaEl = document.createElement('div');
        metaEl.className = 'friend-weapon-meta';
        metaEl.innerHTML = `
            <span class="friend-weapon-name">${this.escapeHtml(weaponData.title)}</span>
            <span class="friend-weapon-help">아이콘에 마우스를 올리면 인벤토리처럼 상세 정보가 표시됩니다.</span>
        `;

        rowEl.appendChild(iconButton);
        rowEl.appendChild(metaEl);
        weaponCard.appendChild(rowEl);
        weaponEl.appendChild(weaponCard);
    }

    refreshFriendsPopup() {
        const friends = this.game.net?.getFriendListSnapshot?.() || [];
        const countEl = document.getElementById('friends-count');
        const listEl = document.getElementById('friends-list');
        if (countEl) {
            countEl.textContent = `${friends.length}명`;
        }
        if (!listEl) return;

        if (this.selectedFriendUid && !friends.some((entry) => entry.uid === this.selectedFriendUid)) {
            this.selectedFriendUid = null;
            this.setFriendMessageComposerVisible(false);
        }

        listEl.innerHTML = '';
        if (friends.length === 0) {
            listEl.innerHTML = '<div class="friends-detail-empty">아직 친구가 없습니다.</div>';
        } else {
            friends.forEach((friend) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = `friend-list-item${friend.uid === this.selectedFriendUid ? ' is-selected' : ''}`;
                item.innerHTML = `
                    <div class="friend-list-topline">
                        <span class="friend-list-name">${this.escapeHtml(friend.name || friend.uid)}</span>
                        <span class="friends-status-chip${friend.online ? ' is-online' : ''}">${this.getFriendStatusText(friend.online)}</span>
                    </div>
                    <div class="friend-list-meta">ID: ${this.escapeHtml(friend.uid)}</div>
                `;
                item.addEventListener('click', () => {
                    this.selectFriend(friend.uid);
                });
                listEl.appendChild(item);
            });
        }

        if (this.isPopupOpen('friends-popup')) {
            this.setFriendsAlertActive(false);
        }

        this.renderSelectedFriendDetail(friends);
    }

    setupFriendsUI() {
        const popup = document.getElementById('friends-popup');
        const searchModal = document.getElementById('friends-add-modal');
        const chatModal = document.getElementById('friend-chat-modal');
        const searchInput = document.getElementById('friend-search-query-input');
        const searchBtn = document.getElementById('friend-search-query-btn');
        const searchAddBtn = document.getElementById('friend-search-add-btn');
        const togetherBtn = document.getElementById('friend-profile-together-btn');
        const chatBtn = document.getElementById('friend-profile-chat-btn');
        const giftBtn = document.getElementById('friend-profile-gift-btn');
        const removeBtn = document.getElementById('friend-profile-remove-btn');
        const chatSendBtn = document.getElementById('friend-chat-send-btn');
        const chatInput = document.getElementById('friend-chat-input');
        const chatMessages = document.getElementById('friend-chat-messages');
        const chatGiftToggleBtn = document.getElementById('friend-chat-gift-toggle-btn');
        const giftKindManastoneBtn = document.getElementById('friend-gift-kind-manastone');
        const giftKindItemBtn = document.getElementById('friend-gift-kind-item');
        const giftItemSelect = document.getElementById('friend-gift-item-select');
        const giftItemAmountInput = document.getElementById('friend-gift-item-amount');
        const giftManastoneAmountInput = document.getElementById('friend-gift-manastone-amount');
        const giftSendBtn = document.getElementById('friend-gift-send-btn');

        const openSearchModal = () => this.toggleFriendSearchModal(true);
        const closeSearchModal = () => this.toggleFriendSearchModal(false);

        document.getElementById('friend-open-search-btn')?.addEventListener('click', openSearchModal);
        document.getElementById('friend-open-search-inline-btn')?.addEventListener('click', openSearchModal);
        document.getElementById('friend-search-close-btn')?.addEventListener('click', closeSearchModal);
        document.getElementById('friend-profile-back-btn')?.addEventListener('click', () => {
            this.setFriendsMobileView('list', { force: true });
        });

        searchModal?.addEventListener('click', (event) => {
            if (event.target === searchModal || event.target?.classList?.contains('friends-floating-scrim')) {
                closeSearchModal();
            }
        });

        chatModal?.addEventListener('click', (event) => {
            if (event.target === chatModal || event.target?.classList?.contains('friends-floating-scrim')) {
                this.closeFriendChat();
            }
        });

        const runLookup = async () => {
            const query = searchInput?.value?.trim() || '';
            if (!query || !this.game.net) {
                this.friendSearchResult = null;
                this.renderFriendSearchResult('친구를 찾으려면 아이디 또는 이름을 입력해 주세요.');
                return;
            }

            this.friendSearchResult = null;
            this.renderFriendSearchResult('조회 중입니다...');

            try {
                const candidate = await this.game.net.lookupFriendCandidate(query);
                if (!candidate) {
                    this.renderFriendSearchResult('대상을 찾지 못했습니다.');
                    return;
                }

                this.friendSearchResult = {
                    query,
                    ...candidate
                };
                if (candidate.profile) {
                    this.friendProfileCache.set(candidate.uid, candidate.profile);
                }
                this.renderFriendSearchResult();
            } catch (error) {
                Logger.warn('[UI] Failed to lookup friend candidate', error);
                this.friendSearchResult = null;
                this.renderFriendSearchResult('검색 중 오류가 발생했습니다.');
            }
        };

        searchBtn?.addEventListener('click', runLookup);
        searchInput?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            runLookup();
        });

        searchAddBtn?.addEventListener('click', async () => {
            if (!this.friendSearchResult || !this.game.net) return;

            const targetUid = this.friendSearchResult.uid;
            if (targetUid === this.game.localPlayer?.id) {
                this.showGenericModal('친구 추가', '자기 자신은 친구 목록에 추가할 수 없습니다.', null, null, { hideNo: true, yesText: '확인' });
                return;
            }

            if (this.game.net.isFriend(targetUid)) {
                await this.selectFriend(targetUid);
                closeSearchModal();
                return;
            }

            const result = await this.game.net.addFriendByQuery(targetUid || this.friendSearchResult.query);
            if (!result.ok) {
                const messages = {
                    invalid_name: '올바른 아이디 또는 이름을 입력해 주세요.',
                    not_found: '대상을 찾지 못했습니다.',
                    self: '자기 자신은 친구 목록에 추가할 수 없습니다.',
                    already_friend: '이미 친구입니다.',
                    profile_missing: '상대 프로필을 아직 불러올 수 없습니다.'
                };
                this.showGenericModal('친구 추가', messages[result.reason] || '친구 추가 중 오류가 발생했습니다.', null, null, { hideNo: true, yesText: '확인' });
                return;
            }

            this.showGenericModal('친구 추가', `"${result.name}" 님을 친구로 추가했습니다.`, null, null, { hideNo: true, yesText: '확인' });
            this.friendSearchResult = null;
            if (searchInput) searchInput.value = '';
            this.renderFriendSearchResult('친구를 찾으려면 아이디 또는 이름을 입력하세요.');
            closeSearchModal();
            await this.selectFriend(result.uid);
        });

        togetherBtn?.addEventListener('click', async () => {
            if (!this.selectedFriendUid || !this.game.net) return;
            const result = await this.game.net.requestTogether(this.selectedFriendUid);
            const messages = {
                SENT: '함께하기 요청을 보냈습니다.',
                SELF: '자기 자신에게는 요청할 수 없습니다.',
                NOT_FRIEND: '친구에게만 함께하기를 요청할 수 있습니다.',
                OFFLINE: '상대가 현재 접속 중이 아닙니다.',
                BUSY: '이미 함께 플레이 중입니다. 현재 함께하기를 먼저 종료해 주세요.',
                ERROR: '함께하기 요청 중 오류가 발생했습니다.'
            };
            this.showGenericModal('함께하기', messages[result] || '처리할 수 없습니다.', null, null, { hideNo: true, yesText: '확인' });
        });

        chatBtn?.addEventListener('click', () => {
            if (!this.selectedFriendUid) return;
            this.openFriendChat(this.selectedFriendUid);
        });

        giftBtn?.addEventListener('click', () => {
            if (!this.selectedFriendUid) return;
            this.openFriendChat(this.selectedFriendUid, { openGift: true });
        });

        removeBtn?.addEventListener('click', () => {
            if (!this.selectedFriendUid || !this.game.net) return;
            const friendUid = this.selectedFriendUid;
            const friendName = this.getSelectedFriendName();
            this.showConfirm(`"${friendName}" 님을 친구 목록에서 삭제할까요?`, async (confirmed) => {
                if (!confirmed) return;
                await this.game.net.removeFriend(friendUid);
                if (this.friendChatUid === friendUid) {
                    this.closeFriendChat({ detachThread: true, keepSelection: false, silent: true });
                }
                this.selectedFriendUid = null;
                this.setFriendsMobileView('list', { force: true });
                this.refreshFriendsPopup();
            });
        });

        document.getElementById('friend-chat-close-btn')?.addEventListener('click', () => this.closeFriendChat());
        document.getElementById('friend-chat-back-btn')?.addEventListener('click', () => this.closeFriendChat({ detachThread: true }));
        chatGiftToggleBtn?.addEventListener('click', () => {
            const composer = document.getElementById('friend-gift-composer');
            this.setFriendGiftComposerVisible(composer?.classList.contains('hidden'));
        });

        chatSendBtn?.addEventListener('click', async () => {
            const targetUid = this.friendChatUid || this.selectedFriendUid;
            if (!targetUid || !this.game.net) return;

            const text = chatInput?.value?.trim() || '';
            if (!text) return;

            const result = await this.game.net.sendFriendMessage(targetUid, text);
            if (!result.ok) {
                const messages = {
                    invalid_message: '보낼 메시지를 입력해 주세요.',
                    not_friend: '친구에게만 메시지를 보낼 수 있습니다.'
                };
                this.showGenericModal('친구 메시지', messages[result.reason] || '메시지 전송 중 오류가 발생했습니다.', null, null, { hideNo: true, yesText: '확인' });
                return;
            }

            if (chatInput) {
                chatInput.value = '';
                chatInput.style.height = '';
            }
            this.renderFriendChatMessages();
        });

        chatInput?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            chatSendBtn?.click();
        });

        giftKindManastoneBtn?.addEventListener('click', () => this.setFriendGiftKind('manastone'));
        giftKindItemBtn?.addEventListener('click', () => this.setFriendGiftKind('item'));
        document.getElementById('friend-gift-cancel-btn')?.addEventListener('click', () => this.setFriendGiftComposerVisible(false));
        giftItemSelect?.addEventListener('change', () => this.refreshFriendGiftOptions());
        giftItemAmountInput?.addEventListener('input', () => this.refreshFriendGiftOptions());
        giftManastoneAmountInput?.addEventListener('input', () => this.refreshFriendGiftOptions());

        giftSendBtn?.addEventListener('click', async () => {
            const targetUid = this.friendChatUid || this.selectedFriendUid;
            if (!targetUid || !this.game.net) return;

            let result = null;
            if (this.friendGiftKind === 'item') {
                const inventoryIndex = Number(giftItemSelect?.value || -1);
                const amount = Math.max(1, Math.floor(Number(giftItemAmountInput?.value || 1)));
                result = await this.game.net.sendFriendGift(targetUid, { kind: 'item', inventoryIndex, amount });
            } else {
                const amount = Math.max(1, Math.floor(Number(giftManastoneAmountInput?.value || 0)));
                result = await this.game.net.sendFriendGift(targetUid, { kind: 'manastone', amount });
            }

            if (!result?.ok) {
                const messages = {
                    invalid_gift: '보낼 선물 정보를 다시 확인해 주세요.',
                    invalid_item: '보낼 수 있는 아이템이 아닙니다.',
                    invalid_amount: '수량을 다시 확인해 주세요.',
                    insufficient_manastone: '마석이 부족합니다.',
                    not_friend: '친구에게만 선물을 보낼 수 있습니다.',
                    send_failed: '선물 전송 중 오류가 발생했습니다.'
                };
                this.showGenericModal('선물 보내기', messages[result?.reason] || '선물 전송 중 오류가 발생했습니다.', null, null, { hideNo: true, yesText: '확인' });
                return;
            }

            this.setFriendGiftComposerVisible(false);
            this.refreshFriendGiftOptions();
            this.renderFriendChatMessages();
        });

        chatMessages?.addEventListener('click', async (event) => {
            const claimButton = event.target?.closest?.('[data-claim-gift-id]');
            if (!claimButton || !this.friendChatUid || !this.game.net) return;

            const messageId = claimButton.getAttribute('data-claim-gift-id');
            if (!messageId) return;

            claimButton.disabled = true;
            const result = await this.game.net.claimFriendGift(this.friendChatUid, messageId);
            if (!result.ok) {
                const messages = {
                    invalid_claim: '수령할 수 없는 선물입니다.',
                    invalid_thread: '대화 정보를 다시 불러와 주세요.',
                    gift_missing: '선물 정보를 찾지 못했습니다.',
                    not_recipient: '내가 받은 선물만 수령할 수 있습니다.',
                    already_claimed: '이미 수령이 완료된 선물입니다.',
                    player_missing: '캐릭터 정보를 확인하지 못했습니다.'
                };
                this.showGenericModal('선물 수령', messages[result.reason] || '선물 수령 중 오류가 발생했습니다.', null, null, { hideNo: true, yesText: '확인' });
            }
            this.renderFriendChatMessages();
            this.refreshFriendsPopup();
        });

        if (this.game.net) {
            this.game.net.on('friendsUpdated', () => this.refreshFriendsPopup());
            this.game.net.on('presenceChanged', () => this.refreshFriendsPopup());
            this.game.net.on('partyUpdated', () => this.refreshFriendsPopup());
            this.game.net.on('friendThreadMetaUpdated', () => this.refreshFriendsPopup());
            this.game.net.on('friendThreadUpdated', (data) => {
                this.refreshFriendsPopup();
                if (data?.uid && data.uid === this.friendChatUid) {
                    this.renderFriendChatMessages();
                }
            });
            this.game.net.on('friendMessageReceived', (data) => {
                const friendUid = data?.friendUid || data?.fromUid || null;
                const chatOpen = !document.getElementById('friend-chat-modal')?.classList.contains('hidden');
                const isActiveChat = !!friendUid && chatOpen && this.friendChatUid === friendUid;

                if (data?.kind === 'thread') {
                    if (!isActiveChat) {
                        const senderName = data?.fromName || '친구';
                        this.logSystemMessage(`[친구] ${senderName}님의 새 메시지가 도착했습니다.`);
                    } else if (this.game.net?.markFriendThreadRead) {
                        this.game.net.markFriendThreadRead(friendUid).catch(() => { });
                    }
                } else {
                    const senderName = data?.fromName || '친구';
                    this.logSystemMessage(`[친구 메시지] ${senderName}: ${data?.text || ''}`);
                }

                if (!this.isPopupOpen('friends-popup') || !isActiveChat) {
                    this.setFriendsAlertActive(true);
                }
                this.refreshFriendsPopup();
            });
            this.game.net.on('togetherRequestReceived', (data) => {
                this.showGenericModal(
                    '함께하기 요청',
                    `"${data.fromName}" 님이 함께 플레이를 요청했습니다. 수락하면 상대가 내 필드로 합류합니다.`,
                    async () => {
                        const result = await this.game.net.respondToTogetherRequest(data.id, data.fromUid, true);
                        if (!result?.ok) {
                            const failMessage = result?.reason === 'party_full'
                                ? '현재 함께 플레이 중인 인원이 이미 가득 찼습니다.'
                                : '지금은 함께하기를 수락할 수 없습니다.';
                            this.showGenericModal('함께하기', failMessage, null, null, { hideNo: true, yesText: '확인' });
                        }
                    },
                    async () => {
                        await this.game.net.respondToTogetherRequest(data.id, data.fromUid, false);
                    },
                    { yesText: '수락', noText: '거절' }
                );
            });
            this.game.net.on('togetherResponseReceived', (data) => {
                if (!data?.accept) {
                    const failMessages = {
                        declined: '상대가 함께하기 요청을 거절했습니다.',
                        host_busy: '상대가 지금은 손님을 받을 수 없습니다.',
                        party_full: '상대 필드는 이미 최대 인원입니다.'
                    };
                    this.showGenericModal('함께하기', failMessages[data?.reason] || '함께하기 요청이 수락되지 않았습니다.', null, null, { hideNo: true, yesText: '확인' });
                    return;
                }

                if (data.party) {
                    this.game.net._applyLocalPartyState(data.party);
                    this.updatePartyUI();
                }

                const hostPosition = data.hostPosition || null;
                const player = this.game.localPlayer;
                if (player && hostPosition && Number.isFinite(hostPosition.x) && Number.isFinite(hostPosition.y)) {
                    player.x = hostPosition.x + 48;
                    player.y = hostPosition.y + 24;
                    player.moveTarget = null;
                    player.saveState(true);
                }

                this.showGenericModal('함께하기', `"${data.fromName}" 님의 필드에 합류했습니다.`, null, null, { hideNo: true, yesText: '확인' });
            });
        }

        popup?.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (!chatModal?.classList.contains('hidden')) {
                    this.closeFriendChat();
                } else if (!searchModal?.classList.contains('hidden')) {
                    closeSearchModal();
                }
            }
        });

        this.renderFriendSearchResult('친구를 찾으려면 아이디 또는 이름을 입력하세요.');
        this.setFriendGiftKind(this.friendGiftKind);
        this.setFriendGiftComposerVisible(false);
        this.refreshFriendsPopup();
        this.syncFriendsPopupLayout();
    }

    isPopupOpen(id) {
        const popup = document.getElementById(id);
        return !!popup && !popup.classList.contains('hidden');
    }

    setFriendsAlertActive(active) {
        this.friendAlertCount = active ? 1 : 0;
        const dot = document.getElementById('friends-alert-dot');
        if (dot) {
            dot.classList.toggle('active', !!active);
        }
    }

    getFriendsPopupMode() {
        const isTouch = window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0;
        const isMobile = isTouch && window.innerWidth <= 1024;
        if (!isMobile) return 'desktop';
        return this.isMobileLandscapeViewport() ? 'mobileLandscape' : 'mobilePortrait';
    }

    setFriendsMobileView(view = 'list', options = {}) {
        const allowedViews = new Set(['list', 'profile']);
        const requestedView = allowedViews.has(view) ? view : 'list';
        const nextView = requestedView === 'profile' && !this.selectedFriendUid ? 'list' : requestedView;
        const changed = this.friendsMobileView !== nextView;
        this.friendsMobileView = nextView;
        if (changed || options.force) {
            this.syncFriendsPopupLayout();
        }
    }

    syncFriendsPopupLayout() {
        const popup = document.getElementById('friends-popup');
        if (!popup) return;

        const mode = this.getFriendsPopupMode();
        const isMobile = mode !== 'desktop';
        if (isMobile && this.friendsMobileView === 'profile' && !this.selectedFriendUid) {
            this.friendsMobileView = 'list';
        }

        popup.dataset.friendsMode = mode;
        popup.dataset.friendsView = isMobile ? (this.friendsMobileView || 'list') : 'split';
    }

    getSelectedFriendName() {
        const friend = (this.game.net?.getFriendListSnapshot?.() || []).find((entry) => entry.uid === this.selectedFriendUid);
        return friend?.name || '친구';
    }

    toggleFriendSearchModal(visible) {
        const modal = document.getElementById('friends-add-modal');
        if (!modal) return;

        const nextVisible = !!visible;
        modal.classList.toggle('hidden', !nextVisible);

        if (nextVisible) {
            if (!this.friendSearchResult) {
                this.renderFriendSearchResult('친구를 찾으려면 아이디 또는 이름을 입력하세요.');
            }
            window.setTimeout(() => {
                document.getElementById('friend-search-query-input')?.focus();
            }, 0);
        }
    }

    renderFriendSearchResult(message = '') {
        const resultEl = document.getElementById('friend-search-result-card');
        const addBtn = document.getElementById('friend-search-add-btn');
        if (!resultEl || !addBtn) return;

        const candidate = this.friendSearchResult;
        if (!candidate) {
            resultEl.classList.add('is-placeholder');
            resultEl.innerHTML = `<p>${this.escapeHtml(message || '친구를 찾으려면 아이디 또는 이름을 입력하세요.')}</p>`;
            addBtn.textContent = '친구 추가';
            addBtn.disabled = true;
            return;
        }

        const isSelf = candidate.uid === this.game.localPlayer?.id;
        const alreadyFriend = !!candidate.isFriend || !!this.game.net?.isFriend?.(candidate.uid);
        const avatarText = this.escapeHtml(this.getFriendAvatarText(candidate.name || candidate.uid));
        const displayName = this.escapeHtml(candidate.name || candidate.uid);
        const uidText = this.escapeHtml(candidate.uid);
        const statusText = this.getFriendStatusText(candidate.online);
        const stateLabel = isSelf ? '내 캐릭터' : (alreadyFriend ? '이미 친구' : '추가 가능');

        resultEl.classList.remove('is-placeholder');
        resultEl.innerHTML = `
            <div class="friends-search-candidate">
                <div class="friends-search-candidate-avatar">${avatarText}</div>
                <div class="friends-search-candidate-body">
                    <div class="friends-search-candidate-topline">
                        <strong>${displayName}</strong>
                        <span class="friends-status-chip${candidate.online ? ' is-online' : ''}">${statusText}</span>
                    </div>
                    <p>ID: ${uidText}</p>
                    <div class="friends-search-candidate-tags">
                        <span>${this.escapeHtml(stateLabel)}</span>
                        <span>${candidate.matchType === 'uid' ? '아이디 일치' : '이름 일치'}</span>
                    </div>
                </div>
            </div>
        `;

        if (isSelf) {
            addBtn.textContent = '추가 불가';
            addBtn.disabled = true;
        } else if (alreadyFriend) {
            addBtn.textContent = '프로필 보기';
            addBtn.disabled = false;
        } else {
            addBtn.textContent = '친구 추가';
            addBtn.disabled = false;
        }
    }

    async selectFriend(uid) {
        if (!uid || !this.game.net) return;
        this.selectedFriendUid = uid;
        if (this.friendChatUid && this.friendChatUid !== uid) {
            this.closeFriendChat({ detachThread: true, keepSelection: true, silent: true });
        }

        if (this.getFriendsPopupMode() !== 'desktop') {
            this.setFriendsMobileView('profile', { force: true });
        }

        this.refreshFriendsPopup();

        if (!this.friendProfileCache.has(uid)) {
            const profile = await this.game.net.getPlayerProfile(uid);
            if (profile) {
                this.friendProfileCache.set(uid, profile);
            }
        }

        this.refreshFriendsPopup();
    }

    getFriendThreadMeta(uid) {
        return this.game.net?.getFriendThreadMetaSnapshot?.(uid) || null;
    }

    hasUnreadFriendThread(uid) {
        const meta = this.getFriendThreadMeta(uid);
        if (!meta) return false;
        const updatedAt = Number(meta.updatedAt || 0);
        const lastReadTs = Number(meta.lastReadTs || 0);
        const lastSenderUid = String(meta.lastSenderUid || '');
        return updatedAt > lastReadTs && !!lastSenderUid && lastSenderUid !== this.game.net?.playerId;
    }

    buildSortedFriendEntries(friends = []) {
        return friends
            .map((friend) => {
                const meta = this.getFriendThreadMeta(friend.uid);
                return {
                    ...friend,
                    meta,
                    unread: this.hasUnreadFriendThread(friend.uid)
                };
            })
            .sort((a, b) => {
                if (a.unread !== b.unread) return a.unread ? -1 : 1;
                const timeDelta = Number(b.meta?.updatedAt || 0) - Number(a.meta?.updatedAt || 0);
                if (timeDelta !== 0) return timeDelta;
                if (!!a.online !== !!b.online) return a.online ? -1 : 1;
                return String(a.name || a.uid || '').localeCompare(String(b.name || b.uid || ''), 'ko');
            });
    }

    refreshFriendThreadList(entries = []) {
        const listEl = document.getElementById('friend-thread-list');
        if (!listEl) return;

        listEl.innerHTML = '';
        if (!entries.length) {
            listEl.innerHTML = '<div class="friends-thread-empty">아직 등록된 친구가 없습니다.</div>';
            return;
        }

        entries.forEach((entry) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `friend-thread-item${entry.uid === this.selectedFriendUid ? ' is-selected' : ''}${entry.unread ? ' is-unread' : ''}`;
            const avatar = this.escapeHtml(this.getFriendAvatarText(entry.name || entry.uid));
            const preview = this.escapeHtml(entry.meta?.lastMessage || '대화를 시작해 보세요.');
            const updatedAt = this.formatFriendTime(entry.meta?.updatedAt || 0);
            item.innerHTML = `
                <div class="friend-thread-avatar" aria-hidden="true">${avatar}</div>
                <div class="friend-thread-content">
                    <div class="friend-thread-topline">
                        <strong class="friend-thread-name">${this.escapeHtml(entry.name || entry.uid)}</strong>
                        <span class="friend-thread-time">${this.escapeHtml(updatedAt)}</span>
                    </div>
                    <div class="friend-thread-bottomline">
                        <span class="friend-thread-preview">${preview}</span>
                        ${entry.unread ? '<span class="friend-thread-unread-dot" aria-hidden="true"></span>' : `<span class="friends-status-chip${entry.online ? ' is-online' : ''}">${this.getFriendStatusText(entry.online)}</span>`}
                    </div>
                </div>
            `;
            item.addEventListener('click', () => {
                this.selectFriend(entry.uid);
            });
            listEl.appendChild(item);
        });
    }

    async openFriendChat(uid, options = {}) {
        if (!uid || !this.game.net?.isFriend?.(uid)) return;

        await this.selectFriend(uid);
        this.friendChatUid = uid;
        this.game.net.openFriendThread(uid);

        document.getElementById('friend-chat-modal')?.classList.remove('hidden');
        this.setFriendGiftComposerVisible(!!options.openGift);
        this.refreshFriendGiftOptions();
        this.renderFriendChatMessages();

        window.setTimeout(() => {
            document.getElementById('friend-chat-input')?.focus();
        }, 0);
    }

    closeFriendChat(options = {}) {
        const {
            detachThread = true,
            keepSelection = true,
            silent = false
        } = options;

        document.getElementById('friend-chat-modal')?.classList.add('hidden');
        document.getElementById('friend-chat-input')?.blur();
        this.setFriendGiftComposerVisible(false);

        if (detachThread) {
            this.game.net?.closeFriendThread?.(this.friendChatUid);
        }

        this.friendChatUid = null;
        if (!keepSelection) {
            this.selectedFriendUid = null;
        }
        if (this.getFriendsPopupMode() !== 'desktop') {
            this.setFriendsMobileView(this.selectedFriendUid ? 'profile' : 'list', { force: true });
        }
        if (!silent) {
            this.refreshFriendsPopup();
        }
    }

    setFriendGiftComposerVisible(visible) {
        const composer = document.getElementById('friend-gift-composer');
        const toggleBtn = document.getElementById('friend-chat-gift-toggle-btn');
        const nextVisible = !!visible;

        composer?.classList.toggle('hidden', !nextVisible);
        if (toggleBtn) {
            toggleBtn.textContent = nextVisible ? '접기' : '선물';
        }
        if (nextVisible) {
            this.refreshFriendGiftOptions();
        }
    }

    setFriendGiftKind(kind = 'manastone') {
        this.friendGiftKind = kind === 'item' ? 'item' : 'manastone';
        document.getElementById('friend-gift-kind-manastone')?.classList.toggle('is-active', this.friendGiftKind === 'manastone');
        document.getElementById('friend-gift-kind-item')?.classList.toggle('is-active', this.friendGiftKind === 'item');
        document.getElementById('friend-gift-manastone-panel')?.classList.toggle('hidden', this.friendGiftKind !== 'manastone');
        document.getElementById('friend-gift-item-panel')?.classList.toggle('hidden', this.friendGiftKind !== 'item');
        this.refreshFriendGiftOptions();
    }

    refreshFriendGiftOptions() {
        const balanceEl = document.getElementById('friend-gift-balance');
        const itemSelect = document.getElementById('friend-gift-item-select');
        const itemAmountInput = document.getElementById('friend-gift-item-amount');
        const manastoneAmountInput = document.getElementById('friend-gift-manastone-amount');
        const sendBtn = document.getElementById('friend-gift-send-btn');
        const player = this.game.localPlayer;
        if (!player) return;

        const manastone = Math.max(0, Number(player.manastone || 0));
        if (manastoneAmountInput) {
            manastoneAmountInput.max = String(Math.max(1, manastone));
            if (Number(manastoneAmountInput.value || 0) <= 0) {
                manastoneAmountInput.value = manastone > 0 ? '1' : '0';
            }
            if (manastone > 0 && Number(manastoneAmountInput.value || 0) > manastone) {
                manastoneAmountInput.value = String(manastone);
            }
        }

        const giftableItems = (player.inventory || [])
            .map((item, index) => ({ item, index }))
            .filter(({ item, index }) => index > 0 && item);

        if (itemSelect) {
            const previousValue = itemSelect.value;
            itemSelect.innerHTML = '';

            if (!giftableItems.length) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '보낼 수 있는 아이템이 없습니다.';
                itemSelect.appendChild(option);
                itemSelect.disabled = true;
            } else {
                giftableItems.forEach(({ item, index }) => {
                    const option = document.createElement('option');
                    option.value = String(index);
                    const amountText = item.stackable === false || item.slot
                        ? '장비'
                        : `x${Math.max(1, Number(item.amount || 1)).toLocaleString('ko-KR')}`;
                    option.textContent = `${item.name || item.type || '아이템'} (${amountText})`;
                    itemSelect.appendChild(option);
                });
                itemSelect.disabled = false;
                if (giftableItems.some(({ index }) => String(index) === previousValue)) {
                    itemSelect.value = previousValue;
                }
                if (!itemSelect.value && giftableItems[0]) {
                    itemSelect.value = String(giftableItems[0].index);
                }
            }
        }

        const selectedIndex = Number(itemSelect?.value || -1);
        const selectedItem = giftableItems.find(({ index }) => index === selectedIndex)?.item || null;
        if (itemAmountInput) {
            const maxAmount = selectedItem
                ? (selectedItem.stackable === false || selectedItem.slot ? 1 : Math.max(1, Number(selectedItem.amount || 1)))
                : 1;
            itemAmountInput.max = String(maxAmount);
            itemAmountInput.disabled = !selectedItem || maxAmount === 1;
            if (Number(itemAmountInput.value || 0) <= 0) {
                itemAmountInput.value = '1';
            }
            if (Number(itemAmountInput.value || 0) > maxAmount) {
                itemAmountInput.value = String(maxAmount);
            }
        }

        if (balanceEl) {
            if (this.friendGiftKind === 'item') {
                balanceEl.textContent = giftableItems.length
                    ? `보유 아이템 ${giftableItems.length}종`
                    : '보낼 수 있는 아이템이 없습니다.';
            } else {
                balanceEl.textContent = `보유 마석 ${manastone.toLocaleString('ko-KR')}`;
            }
        }

        if (sendBtn) {
            sendBtn.disabled = this.friendGiftKind === 'item'
                ? !selectedItem
                : manastone <= 0;
        }
    }

    renderFriendChatMessages() {
        const container = document.getElementById('friend-chat-messages');
        if (!container) return;

        const targetUid = this.friendChatUid || this.selectedFriendUid;
        if (!targetUid) {
            container.innerHTML = '<div class="friend-chat-empty">대화할 친구를 먼저 선택해 주세요.</div>';
            return;
        }

        const friend = (this.game.net?.getFriendListSnapshot?.() || []).find((entry) => entry.uid === targetUid) || null;
        const profile = this.friendProfileCache.get(targetUid) || null;
        const displayName = profile?.name || friend?.name || targetUid;
        const titleEl = document.getElementById('friend-chat-title');
        const statusEl = document.getElementById('friend-chat-status');
        if (titleEl) titleEl.textContent = displayName;
        if (statusEl) statusEl.textContent = this.getFriendStatusText(friend?.online);

        const messages = this.game.net?.getFriendThreadMessagesSnapshot?.(targetUid) || [];
        if (!messages.length) {
            container.innerHTML = '<div class="friend-chat-empty">아직 오간 메시지가 없습니다. 먼저 말을 걸어 보세요.</div>';
            container.scrollTop = container.scrollHeight;
            return;
        }

        container.innerHTML = '';
        const localUid = this.game.localPlayer?.id || this.game.net?.playerId;
        messages.forEach((message) => {
            const isMine = message.fromUid === localUid;
            const row = document.createElement('div');
            row.className = `friend-message-row${isMine ? ' is-mine' : ''}`;

            const bodyHtml = message.type === 'gift'
                ? this.buildFriendGiftSummary(message, { isMine })
                : `<p class="friend-message-text">${this.escapeHtml(message.text || '')}</p>`;

            row.innerHTML = `
                <div class="friend-message-bubble${message.type === 'gift' ? ' is-gift' : ''}">
                    ${bodyHtml}
                    <div class="friend-message-meta">${this.escapeHtml(this.formatFriendTime(message.ts))}</div>
                </div>
            `;
            container.appendChild(row);
        });

        container.scrollTop = container.scrollHeight;
    }

    formatFriendTime(ts) {
        const value = Number(ts || 0);
        if (!Number.isFinite(value) || value <= 0) return '';

        const date = new Date(value);
        const now = new Date();
        const sameDay = date.getFullYear() === now.getFullYear()
            && date.getMonth() === now.getMonth()
            && date.getDate() === now.getDate();

        if (sameDay) {
            return date.toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    buildFriendGiftSummary(message = {}, options = {}) {
        const gift = message.gift || {};
        const isMine = !!options.isMine;
        const title = gift.kind === 'manastone'
            ? `마석 ${Math.max(1, Number(gift.amount || 1)).toLocaleString('ko-KR')}`
            : `${gift.itemName || gift.itemId || '아이템'}${Number(gift.amount || 1) > 1 ? ` x${Math.max(1, Number(gift.amount || 1)).toLocaleString('ko-KR')}` : ''}`;
        const description = isMine ? '선물을 보냈습니다.' : '선물이 도착했습니다.';

        let stateHtml = '';
        if (!isMine && gift.status === 'pending') {
            stateHtml = `<button type="button" class="friend-gift-claim-btn" data-claim-gift-id="${this.escapeHtml(message.id || '')}">수령하기</button>`;
        } else {
            const stateText = gift.status === 'claimed' ? '수령 완료' : '수령 대기';
            stateHtml = `<span class="friend-gift-state${gift.status === 'claimed' ? ' is-claimed' : ''}">${stateText}</span>`;
        }

        return `
            <div class="friend-gift-card">
                <strong>${this.escapeHtml(title)}</strong>
                <p>${this.escapeHtml(description)}</p>
                <div class="friend-gift-state-row">${stateHtml}</div>
            </div>
        `;
    }

    renderSelectedFriendDetail(friends = []) {
        this.hideFriendWeaponTooltip();
        this.syncFriendsPopupLayout();

        const emptyEl = document.getElementById('friend-profile-empty');
        const panelEl = document.getElementById('friend-profile-panel');
        const selected = friends.find((entry) => entry.uid === this.selectedFriendUid) || null;

        if (!selected || !panelEl || !emptyEl) {
            emptyEl?.classList.remove('hidden');
            panelEl?.classList.add('hidden');
            return;
        }

        const profile = this.friendProfileCache.get(selected.uid) || null;
        const displayName = profile?.name || selected.name || selected.uid;
        const meta = this.getFriendThreadMeta(selected.uid);
        const avatarEl = document.getElementById('friend-profile-avatar');
        const nameEl = document.getElementById('friend-profile-name');
        const statusEl = document.getElementById('friend-profile-status');
        const metaEl = document.getElementById('friend-profile-meta');
        const summaryEl = document.getElementById('friend-profile-summary');
        const statsEl = document.getElementById('friend-profile-stats');
        const weaponEl = document.getElementById('friend-profile-weapon');
        const togetherBtn = document.getElementById('friend-profile-together-btn');

        emptyEl.classList.add('hidden');
        panelEl.classList.remove('hidden');

        if (avatarEl) avatarEl.textContent = this.getFriendAvatarText(displayName);
        if (nameEl) nameEl.textContent = displayName;
        if (statusEl) {
            statusEl.textContent = this.getFriendStatusText(selected.online);
            statusEl.classList.toggle('is-online', !!selected.online);
        }
        if (metaEl) {
            metaEl.textContent = `ID ${selected.uid}`;
        }
        if (togetherBtn) {
            togetherBtn.disabled = !selected.online;
        }

        if (summaryEl) {
            const parts = [
                `최근 메시지 ${meta?.lastMessage ? this.escapeHtml(meta.lastMessage) : '아직 없음'}`,
                meta?.updatedAt ? `대화 시각 ${this.escapeHtml(this.formatFriendTime(meta.updatedAt))}` : '대화 이력 없음',
                selected.online ? '지금 함께하기 가능' : '오프라인'
            ];
            summaryEl.innerHTML = parts.map((text) => `<span>${text}</span>`).join('');
        }

        if (!profile) {
            if (statsEl) {
                statsEl.innerHTML = '<div class="friend-profile-loading">프로필을 불러오는 중입니다.</div>';
            }
            if (weaponEl) {
                weaponEl.innerHTML = '<div class="friend-profile-loading">장착 무기를 확인하는 중입니다.</div>';
            }
            return;
        }

        const derived = this.buildFriendDerivedStats(profile);
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="friends-profile-stat-card"><strong>레벨</strong><span>${derived.level}</span></div>
                <div class="friends-profile-stat-card"><strong>HP / MP</strong><span>${Math.floor(derived.hp)} / ${Math.floor(derived.maxHp)} | ${Math.floor(derived.mp)} / ${Math.floor(derived.maxMp)}</span></div>
                <div class="friends-profile-stat-card"><strong>기본 스탯</strong><span>VIT ${derived.vitality} / INT ${derived.intelligence} / WIS ${derived.wisdom} / AGI ${derived.agility}</span></div>
                <div class="friends-profile-stat-card"><strong>전투 수치</strong><span>공격력 ${derived.attack} / 방어력 ${derived.defense}</span></div>
                <div class="friends-profile-stat-card"><strong>공격속도</strong><span>${derived.attackSpeed.toFixed(2)}</span></div>
                <div class="friends-profile-stat-card"><strong>치명확률</strong><span>${Math.round(derived.critRate * 100)}%</span></div>
            `;
        }

        this.renderFriendProfileWeapon(weaponEl, profile);
    }

    renderFriendProfileWeapon(weaponEl, profile = {}) {
        if (!weaponEl) return;

        weaponEl.innerHTML = '';
        const weaponData = this.getFriendWeaponDisplayData(profile?.equipment?.weapon || null);
        const weaponCard = document.createElement('div');
        weaponCard.className = 'friend-weapon-card';

        if (!weaponData) {
            weaponCard.innerHTML = `
                <div class="friend-weapon-head">
                    <div class="friend-weapon-empty">-</div>
                    <div class="friend-weapon-meta">
                        <span class="friend-weapon-name">장착 중인 무기 없음</span>
                        <span class="friend-weapon-help">현재 장착한 무기가 없습니다.</span>
                    </div>
                </div>
            `;
            weaponEl.appendChild(weaponCard);
            return;
        }

        const rowEl = document.createElement('div');
        rowEl.className = 'friend-weapon-head';

        const iconButton = document.createElement('button');
        iconButton.type = 'button';
        iconButton.className = 'friend-weapon-icon-button';
        iconButton.setAttribute('aria-label', `${weaponData.title} 상세 보기`);
        iconButton.title = `${weaponData.title} 상세 보기`;
        iconButton.appendChild(this.createInventoryIconElement(weaponData.displayWeapon, 'friend-weapon-icon'));

        const showTooltip = () => this.showFriendWeaponTooltip(weaponData, iconButton);
        iconButton.addEventListener('mouseenter', showTooltip);
        iconButton.addEventListener('focus', showTooltip);
        iconButton.addEventListener('mouseleave', () => this.hideFriendWeaponTooltip());
        iconButton.addEventListener('blur', () => this.hideFriendWeaponTooltip());
        iconButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const tooltip = document.getElementById('friend-weapon-tooltip');
            const isOpen = tooltip && !tooltip.classList.contains('hidden') && this.friendWeaponTooltipAnchor === iconButton;
            if (isOpen) {
                this.hideFriendWeaponTooltip();
            } else {
                this.showFriendWeaponTooltip(weaponData, iconButton);
            }
        });

        const metaEl = document.createElement('div');
        metaEl.className = 'friend-weapon-meta';
        metaEl.innerHTML = `
            <span class="friend-weapon-name">${this.escapeHtml(weaponData.title)}</span>
            <span class="friend-weapon-help">${this.escapeHtml(weaponData.subtitle || '무기')}</span>
        `;

        rowEl.appendChild(iconButton);
        rowEl.appendChild(metaEl);
        weaponCard.appendChild(rowEl);
        weaponEl.appendChild(weaponCard);
    }

    refreshFriendsPopup() {
        const friends = this.game.net?.getFriendListSnapshot?.() || [];
        const countEl = document.getElementById('friends-count');
        if (countEl) {
            countEl.textContent = `${friends.length}명`;
        }

        if (this.selectedFriendUid && !friends.some((entry) => entry.uid === this.selectedFriendUid)) {
            const removedUid = this.selectedFriendUid;
            this.selectedFriendUid = null;
            if (this.friendChatUid === removedUid) {
                this.closeFriendChat({ detachThread: true, keepSelection: false, silent: true });
            }
        }

        const entries = this.buildSortedFriendEntries(friends);
        this.refreshFriendThreadList(entries);
        this.renderSelectedFriendDetail(friends);
        this.syncFriendsPopupLayout();

        if (this.friendChatUid && !document.getElementById('friend-chat-modal')?.classList.contains('hidden')) {
            this.renderFriendChatMessages();
        }

        const hasUnread = entries.some((entry) => entry.unread);
        this.setFriendsAlertActive(!this.isPopupOpen('friends-popup') && hasUnread);
    }

    setPortrait(processedImage) {
        const portraits = document.querySelectorAll('.portrait, .status-portrait');
        portraits.forEach(p => {
            const canvas = document.createElement('canvas');
            const sw = processedImage.width / 8;
            const sh = processedImage.height / 5;
            canvas.width = sw;
            canvas.height = sh;
            const ctx = canvas.getContext('2d');
            // Row 1 is Front-facing (0:Back, 1:Front)
            ctx.drawImage(processedImage, 0, sh, sw, sh, 0, 0, sw, sh);

            p.style.backgroundImage = `url(${canvas.toDataURL()})`;
            p.style.backgroundSize = 'contain';
            p.style.backgroundRepeat = 'no-repeat';
            p.style.backgroundPosition = 'center';
            p.style.backgroundColor = 'transparent';
        });
    }

    togglePopup(id) {
        const popup = document.getElementById(id);
        if (!popup) return;

        const isCurrentlyHidden = popup.classList.contains('hidden');
        const openPopup = document.querySelector('.game-popup:not(.hidden)');
        if (isCurrentlyHidden && openPopup && openPopup.id !== id) {
            return;
        }

        if (isCurrentlyHidden && id === 'status-popup' && this.getPendingStatTotal() > 0) {
            this.cancelPendingStats({ refreshUi: false });
        }

        const popupActionMap = {
            'inventory-popup': 'OPEN_INVENTORY',
            'skill-popup': 'OPEN_SKILL',
            'status-popup': 'OPEN_STATUS'
        };
        const requiredAction = popupActionMap[id];
        if (isCurrentlyHidden && requiredAction && !this.game.tutorial?.isActionAllowed?.(requiredAction)) {
            return;
        }

        if (!isCurrentlyHidden && this.game.tutorial?.isPopupCloseBlocked?.(id)) {
            if (id === 'skill-popup') {
                this.updateSkillPopup();
                this.overlay?.classList.remove('hidden');
                popup.classList.remove('hidden');
                document.body.classList.add('popup-open');
                this.isPaused = true;
            }
            this.refreshTutorialOverlayState();
            return;
        }

        // If closing status popup, check for pending stats
        if (!isCurrentlyHidden && id === 'status-popup') {
            const totalPending = this.getPendingStatTotal();
            if (totalPending > 0) {
                this.showConfirm('스텟을 저장하시겠습니까?<br><small>한번 저장하면 변경할 수 없습니다.</small>', (result) => {
                    if (result) {
                        this.savePendingStats();
                        this.executePopupClose(id);
                    } else {
                        this.updateStatusPopup();
                        this.refreshTutorialOverlayState();
                    }
                });
                return; // Wait for confirm
            }
        }

        this.executePopupClose(id, isCurrentlyHidden, popup);
    }

    syncDevOverlayVisibility() {
        const overlay = document.getElementById('dev-overlay');
        if (!overlay) return;

        const canShow = this.devMode && this.hasDeveloperAccess();
        overlay.classList.toggle('hidden', !canShow);
        overlay.classList.toggle('dev-lookup-visible', false);
        this.syncStatusDevLookupVisibility();
    }

    executePopupClose(id, isCurrentlyHidden, popup) {
        if (!popup) popup = document.getElementById(id);
        this.hideTooltip();
        this.hideFriendWeaponTooltip();

        const statusPopup = document.getElementById('status-popup');
        const isStatusPopupOpen = statusPopup && !statusPopup.classList.contains('hidden');
        const isOpeningDifferentPopup = !!isCurrentlyHidden && id !== 'status-popup';
        if (isStatusPopupOpen && isOpeningDifferentPopup && this.getPendingStatTotal() > 0) {
            this.cancelPendingStats({ refreshUi: false });
        }

        document.querySelectorAll('.game-popup').forEach(p => p.classList.add('hidden'));
        this.hideSkillDetailModal();
        if (id !== 'inventory-popup' || !isCurrentlyHidden) {
            this.closeInventoryItemModal(true);
        }

        if (isCurrentlyHidden) {
            if (this.game.sound) this.game.sound.playSfx('ui_open');
            this.overlay.classList.remove('hidden');
            popup.classList.remove('hidden');
            document.body.classList.add('popup-open');
            if (id === 'status-popup') {
                this.pendingStats = this.createEmptyPendingStats();
                this.updateStatusPopup();
            }
            if (id === 'inventory-popup') {
                this.pendingEnhancementStoneType = null;
                this.selectedInventoryRef = null;
                this.closeInventoryItemModal(true);
                this.updateInventory();
            }
            if (id === 'skill-popup') {
                this.updateSkillPopup();
                popup.scrollTop = 0;
                const skillContentWrapper = popup.querySelector('.skill-content-wrapper');
                const skillList = popup.querySelector('.skill-list');
                if (skillContentWrapper) skillContentWrapper.scrollTop = 0;
                if (skillList) skillList.scrollTop = 0;
            }
            if (id === 'settings-popup') {
                this.syncSettingsUi();
                popup.scrollTop = 0;
            }
            if (id === 'friends-popup') {
                this.toggleFriendSearchModal(false);
                if (!this.friendChatWindowState?.compact && !this.friendChatWindowState?.retainOnPopupToggle) {
                    this.closeFriendChat({ detachThread: true, silent: true });
                }
                this.setFriendsMobileView('list', { force: true });
                this.refreshFriendsPopup();
                popup.scrollTop = 0;
            }
            this.isPaused = true;
            this.game.tutorial?.trigger?.('popup_open', { target: id });
        } else {
            if (this.game.sound) this.game.sound.playSfx('ui_close');
            this.overlay.classList.add('hidden');
            document.body.classList.remove('popup-open');
            if (id === 'inventory-popup') {
                this.pendingEnhancementStoneType = null;
            }
            if (id === 'friends-popup') {
                this.toggleFriendSearchModal(false);
                if (!this.friendChatWindowState?.compact && !this.friendChatWindowState?.retainOnPopupToggle) {
                    this.closeFriendChat({ detachThread: true, silent: true });
                }
            }
            this.closeInventoryItemModal(true);
            this.isPaused = false;
            this.game.tutorial?.trigger?.('popup_close', { target: id });
        }

        this.syncDevOverlayVisibility();
        this.refreshDesktopShortcutHints();
        this.refreshTutorialOverlayState();
    }

    refreshTutorialOverlayState() {
        if (!this.game?.tutorial?.activeTutorial) return;
        this.refreshTutorialHighlight();
        this.refreshTutorialGuideLayout();
    }

    scheduleTutorialOverlayRefresh(afterAnimation = false) {
        this.refreshTutorialOverlayState();

        if (this.confirmTutorialRefreshFrame) {
            window.cancelAnimationFrame(this.confirmTutorialRefreshFrame);
            this.confirmTutorialRefreshFrame = 0;
        }
        this.confirmTutorialRefreshFrame = window.requestAnimationFrame(() => {
            this.confirmTutorialRefreshFrame = 0;
            this.refreshTutorialOverlayState();
        });

        if (this.confirmTutorialRefreshTimer) {
            window.clearTimeout(this.confirmTutorialRefreshTimer);
            this.confirmTutorialRefreshTimer = 0;
        }
        if (!afterAnimation) return;

        this.confirmTutorialRefreshTimer = window.setTimeout(() => {
            this.confirmTutorialRefreshTimer = 0;
            this.refreshTutorialOverlayState();
        }, 320);
    }

    showConfirm(message, callback) {
        document.getElementById('confirm-message').innerHTML = message;
        this.clearTutorialHighlightLayer();
        this.confirmModal.classList.remove('hidden');
        this.confirmCallback = callback;
        this.refreshDesktopShortcutHints();
        this.scheduleTutorialOverlayRefresh(true);
    }

    hideConfirm() {
        this.clearTutorialHighlightLayer();
        this.confirmModal.classList.add('hidden');
        this.confirmCallback = null;
        this.refreshDesktopShortcutHints();
        this.scheduleTutorialOverlayRefresh(false);
    }

    isWorldSceneActive() {
        return this.game?.sceneManager?.currentScene === this.game?.sceneManager?.scenes?.get('world');
    }

    isBrowserBackExitGuardState(state = window.history?.state) {
        return !!(state && typeof state === 'object' && state[this.browserBackExitGuardKey]);
    }

    armBrowserBackExitGuard() {
        if (!window.history?.pushState || !this.isWorldSceneActive()) return false;
        if (this.isBrowserBackExitGuardState()) {
            this.browserBackExitGuardArmed = true;
            return true;
        }

        const nextState = {
            ...(window.history.state && typeof window.history.state === 'object' ? window.history.state : {}),
            [this.browserBackExitGuardKey]: Date.now()
        };

        try {
            window.history.pushState(nextState, '', window.location.href);
            this.browserBackExitGuardArmed = true;
            return true;
        } catch (error) {
            Logger.warn('[UIManager] Failed to arm browser back exit guard', error);
            this.browserBackExitGuardArmed = false;
            return false;
        }
    }

    disarmBrowserBackExitGuard() {
        this.browserBackExitGuardArmed = false;
        this.browserBackExitConfirmPending = false;
        this.pendingBrowserBackExitAction = null;
        this.ignoreNextBrowserBackPopstate = false;

        if (!window.history?.replaceState || !this.isBrowserBackExitGuardState()) return;

        const nextState = {
            ...(window.history.state && typeof window.history.state === 'object' ? window.history.state : {})
        };
        delete nextState[this.browserBackExitGuardKey];

        try {
            window.history.replaceState(Object.keys(nextState).length ? nextState : null, '', window.location.href);
        } catch (error) {
            Logger.warn('[UIManager] Failed to disarm browser back exit guard', error);
        }
    }

    handleBrowserBackPopState() {
        if (this.ignoreNextBrowserBackPopstate) {
            this.ignoreNextBrowserBackPopstate = false;
            const pendingAction = this.pendingBrowserBackExitAction;
            this.pendingBrowserBackExitAction = null;
            if (typeof pendingAction === 'function') {
                void pendingAction();
            }
            return;
        }

        if (!this.browserBackExitGuardArmed || !this.isWorldSceneActive()) {
            this.browserBackExitGuardArmed = false;
            this.browserBackExitConfirmPending = false;
            return;
        }

        this.armBrowserBackExitGuard();
        if (this.browserBackExitConfirmPending || this.gameExitSceneTransitioning) return;

        this.browserBackExitConfirmPending = true;
        this.showConfirm('게임을 종료하시겠습니까?', (confirmed) => {
            this.browserBackExitConfirmPending = false;
            if (!confirmed) return;

            this.pendingBrowserBackExitAction = async () => {
                await this.exitGameToCharacterSelection({ reason: 'browser_back_exit' });
            };
            this.ignoreNextBrowserBackPopstate = true;

            try {
                window.history.back();
            } catch (error) {
                Logger.warn('[UIManager] Failed to step back to base history entry', error);
                this.ignoreNextBrowserBackPopstate = false;
                const pendingAction = this.pendingBrowserBackExitAction;
                this.pendingBrowserBackExitAction = null;
                if (typeof pendingAction === 'function') {
                    void pendingAction();
                }
            }
        });
    }

    async exitGameToCharacterSelection(options = {}) {
        if (this.gameExitSceneTransitioning) return false;
        if (!this.isWorldSceneActive()) return false;

        const currentUser = this.game?.auth?.currentUser || window.firebase?.auth?.().currentUser || null;
        if (!currentUser) {
            Logger.warn('[UIManager] Cannot exit game to character selection without an authenticated user.');
            return false;
        }

        this.gameExitSceneTransitioning = true;
        try {
            this.disarmBrowserBackExitGuard();
            this.game?._resetTransientInputState?.(options.reason || 'exit_game_to_char_select');

            const worldScene = this.game?.sceneManager?.currentScene;
            await worldScene?.waitForPendingZoneTransition?.();

            const player = this.game.localPlayer;
            if (player?.saveState) {
                const saveResult = await player.saveState(false, {
                    debounceMs: 0,
                    reason: options.reason || 'exit_game_to_char_select'
                });
                if (saveResult?.ok !== true) {
                    throw new Error(saveResult?.reason || 'exit_game_profile_save_failed');
                }
            }

            const flushResult = await this.game?.net?.flushProfileWrites?.(player?.id);
            if (flushResult?.ok === false) {
                throw new Error(flushResult.reason || 'exit_game_profile_flush_failed');
            }
            this.game?.net?.setZoneParticipationEnabled?.(false);
            this.game.localPlayer = null;

            await this.game?.sceneManager?.changeScene('charSelect', { user: currentUser });
            return true;
        } catch (error) {
            Logger.error('[UIManager] Failed to exit game to character selection', error);
            if (this.isWorldSceneActive()) {
                this.armBrowserBackExitGuard();
            }
            return false;
        } finally {
            this.gameExitSceneTransitioning = false;
        }
    }

    formatSkillPercent(value, digits = 0) {
        const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
        return `${(safe * 100).toFixed(digits)}%`;
    }

    createInventoryDetailStatLineElement(line) {
        const li = document.createElement('li');
        if (line && typeof line === 'object') {
            if (line.html) {
                li.innerHTML = line.html;
            } else {
                li.textContent = line.text || '';
            }
            if (line.className) {
                li.classList.add(...String(line.className).split(/\s+/).filter(Boolean));
            }
            return li;
        }

        li.textContent = line;
        return li;
    }

    mergeInventoryEnhancementBonusLines(lines = []) {
        const merged = [];

        for (let i = 0; i < lines.length; i++) {
            const currentLine = lines[i];
            const nextLine = lines[i + 1];
            const nextClassName = typeof nextLine === 'object' ? String(nextLine.className || '') : '';
            const nextText = typeof nextLine === 'object' ? String(nextLine.text || '') : '';

            if (!nextClassName.includes('inventory-detail-enhance-bonus')) {
                merged.push(currentLine);
                continue;
            }

            const currentText = typeof currentLine === 'object'
                ? String(currentLine.text || '')
                : String(currentLine || '');
            const currentMatch = currentText.match(/^(.*?)(\d+)%$/);
            const bonusMatch = nextText.match(/\+(\d+)%/);

            if (!currentMatch || !bonusMatch) {
                merged.push(currentLine);
                continue;
            }

            const prefix = currentMatch[1].replace(/\s*\+\s*$/, ' ');
            const effectivePercent = Number(currentMatch[2]) || 0;
            const bonusPercent = Number(bonusMatch[1]) || 0;
            const basePercent = Math.max(0, effectivePercent - bonusPercent);

            merged.push({
                html: `${this.escapeHtml(`${prefix}${basePercent}%`)}<span class="inventory-detail-enhance-bonus">+${bonusPercent}%</span>`
            });
            i += 1;
        }

        return merged;
    }

    escapeHtml(value = '') {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    renderReadmeInlineMarkdown(text = '') {
        let html = this.escapeHtml(text);
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        return html;
    }

    renderReadmeMarkdownFallback(markdown = '') {
        const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
        const html = [];
        let inCodeBlock = false;
        let codeLines = [];
        let paragraphLines = [];
        let listItems = [];
        let listTag = null;

        const flushParagraph = () => {
            if (paragraphLines.length === 0) return;
            html.push(`<p>${this.renderReadmeInlineMarkdown(paragraphLines.join(' '))}</p>`);
            paragraphLines = [];
        };

        const flushList = () => {
            if (!listTag || listItems.length === 0) return;
            html.push(`<${listTag}>${listItems.join('')}</${listTag}>`);
            listItems = [];
            listTag = null;
        };

        const flushCode = () => {
            if (!inCodeBlock) return;
            html.push(`<pre><code>${this.escapeHtml(codeLines.join('\n'))}</code></pre>`);
            inCodeBlock = false;
            codeLines = [];
        };

        lines.forEach((rawLine) => {
            const line = rawLine ?? '';
            const trimmed = line.trim();

            if (trimmed.startsWith('```')) {
                flushParagraph();
                flushList();
                if (inCodeBlock) {
                    flushCode();
                } else {
                    inCodeBlock = true;
                    codeLines = [];
                }
                return;
            }

            if (inCodeBlock) {
                codeLines.push(line);
                return;
            }

            if (!trimmed) {
                flushParagraph();
                flushList();
                return;
            }

            const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
            if (headingMatch) {
                flushParagraph();
                flushList();
                const level = Math.min(6, headingMatch[1].length);
                html.push(`<h${level}>${this.renderReadmeInlineMarkdown(headingMatch[2])}</h${level}>`);
                return;
            }

            if (trimmed.startsWith('> ')) {
                flushParagraph();
                flushList();
                html.push(`<blockquote>${this.renderReadmeInlineMarkdown(trimmed.slice(2))}</blockquote>`);
                return;
            }

            const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
            if (orderedMatch) {
                flushParagraph();
                if (listTag && listTag !== 'ol') flushList();
                listTag = 'ol';
                listItems.push(`<li>${this.renderReadmeInlineMarkdown(orderedMatch[2])}</li>`);
                return;
            }

            const unorderedMatch = trimmed.match(/^[-*]\s+(.*)$/);
            if (unorderedMatch) {
                flushParagraph();
                if (listTag && listTag !== 'ul') flushList();
                listTag = 'ul';
                listItems.push(`<li>${this.renderReadmeInlineMarkdown(unorderedMatch[1])}</li>`);
                return;
            }

            flushList();
            paragraphLines.push(trimmed);
        });

        flushParagraph();
        flushList();
        flushCode();

        return html.join('');
    }

    renderReadmeContent(markdown = '') {
        const text = String(markdown || '').trim();
        if (!text) {
            return '<div class="readme-empty">README 내용이 비어 있습니다.</div>';
        }

        try {
            if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
                return marked.parse(text, {
                    gfm: true,
                    breaks: true,
                    headerIds: false,
                    mangle: false
                });
            }
        } catch (error) {
            Logger.error('Failed to parse README.md with marked:', error);
        }

        return this.renderReadmeMarkdownFallback(text);
    }

    getSkillHotkey(skillId) {
        return {
            laser: 'J',
            missile: 'H',
            fireball: 'U',
            shield: 'K'
        }[skillId] || '-';
    }

    getSkillDisplayName(skillId, options = {}) {
        const data = this.skillData?.[skillId];
        if (!data) return '';

        const includeHotkey = options.includeHotkey ?? this.shouldShowDesktopShortcutText();
        const hotkey = this.getSkillHotkey(skillId);
        if (!includeHotkey || !hotkey || hotkey === '-') {
            return data.name;
        }
        return `${data.name} (${hotkey})`;
    }

    getSkillInspectGuidanceText() {
        if (this.shouldShowDesktopShortcutText()) {
            return '📘 아직은 스킬 설명을 확인하는 단계입니다. 아이콘에 마우스를 올려 보세요.';
        }
        return '📘 아직은 스킬 설명을 확인하는 단계입니다. 스킬 아이콘을 터치해 보세요.';
    }

    buildSkillDetailSection(title, items = []) {
        if (!Array.isArray(items) || items.length === 0) return '';
        return `
            <section class="skill-detail-section">
                <h3>${title}</h3>
                <ul>
                    ${items.map((item) => `<li>${item}</li>`).join('')}
                </ul>
            </section>
        `;
    }

    buildSkillSummaryMetrics(metrics = []) {
        if (!Array.isArray(metrics) || metrics.length === 0) return '';
        return `
            <section class="skill-detail-summary-grid">
                ${metrics.map((metric) => `
                    <div class="skill-detail-metric-card">
                        <span class="skill-detail-metric-label">${metric.label}</span>
                        <strong class="skill-detail-metric-value">${metric.value}</strong>
                    </div>
                `).join('')}
            </section>
        `;
    }

    getSkillDetailData(skillId) {
        const p = this.game.localPlayer;
        const data = this.skillData[skillId];
        if (!p || !data) return null;

        const lv = p.skillLevels[skillId] || 1;
        const attackPower = Math.round(p.attackPower || 0);
        const critRateText = this.formatSkillPercent(p.critRate || 0, 1);
        const weaponCombat = p.getWeaponCombatProfile?.() || {};
        const equippedWeapon = p.getEquippedWeapon?.();
        const weaponName = equippedWeapon?.name || '장착 무기 없음';
        const hotkey = this.getSkillHotkey(skillId);
        const showShortcutText = this.shouldShowDesktopShortcutText();
        const currentStats = [];
        const formulaItems = [];
        const settingItems = [];
        const weaponItems = [];
        const summaryMetrics = [];
        const upgradeCost = skillId === 'shield'
            ? null
            : (p.getSkillUpgradeCost ? p.getSkillUpgradeCost(skillId) : (300 * Math.pow(2, lv - 1)));
        let tooltipCurrentEffectHtml = '';

        switch (skillId) {
            case 'laser': {
                const baseRatio = 0.10 + (lv - 1) * 0.05;
                const increment = 0.10 + (lv - 1) * 0.05;
                const maxRatio = typeof p.getLaserMaxDamageRatio === 'function'
                    ? p.getLaserMaxDamageRatio(lv)
                    : 1.0 + (lv - 1) * 0.05;
                const laserRange = typeof p.getLaserRange === 'function'
                    ? p.getLaserRange(lv)
                    : (p.attackRange || 400) * (1.0 + (lv - 1) * 0.025);
                const maxChains = 1 + lv;
                const weaponMultiplier = 1 + (weaponCombat.laserDamageBonus || 0);
                const minBaseDamage = Math.ceil(attackPower * baseRatio * weaponMultiplier);
                const maxBaseDamage = Math.ceil(attackPower * maxRatio * weaponMultiplier);
                const effectiveAttackSpeed = typeof p.getEffectiveBasicAttackSpeed === 'function'
                    ? p.getEffectiveBasicAttackSpeed()
                    : Math.max(0.1, (p.attackSpeed || 1) + ((p.wisdom || 0) * 0.05));
                const tickInterval = (0.7 / Math.max(0.1, effectiveAttackSpeed)) * 1.15;

                currentStats.push(
                    `현재 공격력 ${attackPower} 기준 시작 피해는 <strong>${minBaseDamage}</strong>, 완전 충전 기준 최대 피해는 <strong>${maxBaseDamage}</strong>입니다. 둘 다 방어력 적용 전 수치입니다.`,
                    `한 번의 틱에 최대 <strong>${maxChains}명</strong>까지 연쇄되고, 사거리는 <strong>${Math.round(laserRange)}</strong>입니다.`,
                    `현재 틱 간격은 약 <strong>${tickInterval.toFixed(2)}초</strong>이며, 치명타는 <strong>${critRateText}</strong> 확률로 <strong>x2</strong>가 적용됩니다.`,
                    `적중한 대상마다 MP <strong>+1</strong>을 회복합니다.${weaponCombat.restoreHpPerLaserHit > 0 ? ` 장착 무기 효과로 HP도 <strong>+${weaponCombat.restoreHpPerLaserHit}</strong> 회복합니다.` : ''}`
                );

                summaryMetrics.push(
                    { label: '현재 레벨', value: `Lv.${lv}` },
                    { label: '연쇄 수', value: `${maxChains}명` },
                    { label: '사거리', value: `${Math.round(laserRange)}` },
                    { label: '방어 전 피해', value: `${minBaseDamage} ~ ${maxBaseDamage}` },
                    { label: '틱 간격', value: `${tickInterval.toFixed(2)}초` },
                    { label: '치명타', value: `${critRateText} / x2` }
                );

                formulaItems.push(
                    `<code>시작 비율 = 0.10 + 0.05 × (레벨 - 1)</code> → 현재 <strong>${this.formatSkillPercent(baseRatio)}</strong>`,
                    `<code>충전 증가 = 0.10 + 0.05 × (레벨 - 1)</code>를 <strong>0.3초</strong>마다 누적합니다. 현재 증가폭은 <strong>${this.formatSkillPercent(increment)}</strong>입니다.`,
                    `<code>최대 비율 = 1.0 + 0.05 × (레벨 - 1)</code> → 현재 <strong>${this.formatSkillPercent(maxRatio)}</strong>`,
                    `<code>사거리 = 기본 사거리 × (1 + 0.025 × (레벨 - 1))</code> → 현재 <strong>${Math.round(laserRange)}</strong>`,
                    `<code>최종 비율 = min(최대 비율, 시작 비율 + 충전 단계 × 증가 비율)</code>`,
                    `<code>방어 전 피해 = ceil(공격력 × 최종 비율 × 무기 보정)</code>`,
                    `<code>최종 피해 = max(1, 방어 전 피해 - 대상 방어력)</code>`,
                    `<code>치명타 발생 시 최종 피해 × 2</code>`
                );

                settingItems.push(
                    `첫 연쇄는 현재 선택한 타겟을 우선합니다.`,
                    `한 틱 안에서는 이미 맞은 대상에게 다시 연쇄되지 않습니다.`,
                    `실제 감전 적용은 코드 기준으로 <strong>1.0초 동안 30% 둔화</strong>입니다.`,
                    `자동 공격을 켜면 현재 선택한 타겟이 살아 있고 사거리 안에 있을 때만 이 스킬을 자동으로 사용합니다.`
                );

                if ((weaponCombat.laserDamageBonus || 0) > 0) {
                    const enhancementBonusText = (weaponCombat.laserDamageBonusEnhancementBonus || 0) > 0
                        ? `<span class="enhancement-option-bonus">+${this.formatSkillPercent(weaponCombat.laserDamageBonusEnhancementBonus)}</span>`
                        : '';
                    weaponItems.push(`<strong>${weaponName}</strong> 효과: 체인 라이트닝 피해 <strong>${this.formatSkillPercent(weaponCombat.laserDamageBonus)}</strong>${enhancementBonusText}`);
                }
                if ((weaponCombat.attackSpeedBonus || 0) > 0) {
                    const enhancementBonusText = (weaponCombat.attackSpeedBonusEnhancementBonus || 0) > 0
                        ? `<span class="enhancement-option-bonus">+${this.formatSkillPercent(weaponCombat.attackSpeedBonusEnhancementBonus)}</span>`
                        : '';
                    weaponItems.push(`<strong>${weaponName}</strong> 효과: 공격속도 <strong>${this.formatSkillPercent(weaponCombat.attackSpeedBonus)}</strong> 증가${enhancementBonusText}`);
                }
                if ((weaponCombat.restoreHpPerLaserHit || 0) > 0) {
                    weaponItems.push(`<strong>${weaponName}</strong> 효과: 적중 대상당 HP <strong>+${weaponCombat.restoreHpPerLaserHit}</strong> 회복`);
                }

                tooltipCurrentEffectHtml = `<div class="current-effect">현재 효과 (Lv.${lv}): 연쇄 ${maxChains}명 | 사거리 ${Math.round(laserRange)} | 방어 전 피해 ${minBaseDamage} ~ ${maxBaseDamage} | 최대 피해 ${this.formatSkillPercent(maxRatio)} | 충전 증가 ${this.formatSkillPercent(increment)} | 감전 1초/30% 둔화</div>`;
                break;
            }
            case 'missile': {
                const missileCount = lv * 2;
                const baseManaCost = p.getMagicMissileBaseManaCost ? p.getMagicMissileBaseManaCost(lv) : (4 + (lv - 1) * 3);
                const manaCost = p.getMagicMissileManaCost ? p.getMagicMissileManaCost(lv, weaponCombat) : baseManaCost;
                const weaponMultiplier = 1 + (weaponCombat.missileDamageBonus || 0);
                const baseMissileDamage = Math.ceil(attackPower * 0.45 * weaponMultiplier);
                const critMissileDamage = Math.ceil(attackPower * 0.45 * weaponMultiplier * 2);
                const manaCostLabel = manaCost < baseManaCost
                    ? `<strong>${manaCost}</strong> (기본 ${baseManaCost})`
                    : `<strong>${manaCost}</strong>`;

                currentStats.push(
                    `한 번 시전하면 <strong>${missileCount}발</strong>이 순차 발사되고, 현재 공격력 ${attackPower} 기준 미사일 1발의 방어 전 피해는 <strong>${baseMissileDamage}</strong>입니다.`,
                    `치명타가 터지면 미사일 1발의 방어 전 피해는 <strong>${critMissileDamage}</strong>까지 올라갑니다.`,
                    `타겟 탐색 반경은 <strong>600</strong>, 마나 소모는 ${manaCostLabel}, 재사용 대기시간은 <strong>1.0초</strong>입니다.`
                );

                summaryMetrics.push(
                    { label: '현재 레벨', value: `Lv.${lv}` },
                    { label: '발사 수', value: `${missileCount}발` },
                    { label: '1발 피해', value: `${baseMissileDamage}` },
                    { label: '치명타 피해', value: `${critMissileDamage}` },
                    { label: '마나 소모', value: manaCost < baseManaCost ? `${manaCost} (기본 ${baseManaCost})` : `${manaCost}` },
                    { label: '쿨다운', value: '1.0초' }
                );

                formulaItems.push(
                    `<code>발사 수 = 레벨 × 2</code> → 현재 <strong>${missileCount}발</strong>`,
                    `<code>방어 전 피해 = 공격력 × 0.45 × 무기 보정</code>`,
                    `<code>최종 피해 = max(1, 방어 전 피해 - 대상 방어력)</code>`,
                    `<code>치명타 발생 시 방어 전 피해 × 2 후 방어력 적용</code>`,
                    `<code>기본 마나 소모 = 4 + 3 × (레벨 - 1)</code> → 현재 기본 <strong>${baseManaCost}</strong>, 적용 후 <strong>${manaCost}</strong>`
                );

                settingItems.push(
                    `현재 선택한 타겟이 유효하면 그 적의 현재 위치를 먼저 고정하고, 없으면 반경 600 안의 가장 가까운 적 위치를 고정합니다.`,
                    `미사일은 <strong>0.05초 간격</strong>으로 순차 발사됩니다.`,
                    `초기 <strong>0.1~0.3초</strong> 동안 뒤에서 자연스럽게 퍼져 나간 뒤, 처음 고정한 좌표를 향해 곡선으로 유도 비행합니다.`,
                    `발사 후에는 실시간으로 타겟을 다시 추적하지 않으며, 처음 고정한 위치를 향해 날아가다가 먼저 맞은 대상에게 피해를 주고 사라집니다.`
                );

                if ((weaponCombat.missileDamageBonus || 0) > 0) {
                    const enhancementBonusText = (weaponCombat.missileDamageBonusEnhancementBonus || 0) > 0
                        ? `<span class="enhancement-option-bonus">+${this.formatSkillPercent(weaponCombat.missileDamageBonusEnhancementBonus)}</span>`
                        : '';
                    weaponItems.push(`<strong>${weaponName}</strong> 효과: 매직 미사일 피해 <strong>${this.formatSkillPercent(weaponCombat.missileDamageBonus)}</strong>${enhancementBonusText}`);
                }
                if ((weaponCombat.missileManaCostReduction || 0) > 0) {
                    const enhancementBonusText = (weaponCombat.missileManaCostReductionEnhancementBonus || 0) > 0
                        ? `<span class="enhancement-option-bonus">+${this.formatSkillPercent(weaponCombat.missileManaCostReductionEnhancementBonus)}</span>`
                        : '';
                    weaponItems.push(`<strong>${weaponName}</strong> 효과: 매직 미사일 마나 소모 <strong>${this.formatSkillPercent(weaponCombat.missileManaCostReduction)}</strong> 감소${enhancementBonusText}`);
                }

                tooltipCurrentEffectHtml = `<div class="current-effect">현재 효과 (Lv.${lv}): ${missileCount}발 | 방어 전 피해 ${baseMissileDamage} | 탐색 600 | 마나 ${manaCost} | 쿨다운 1.0초</div>`;
                break;
            }
            case 'fireball': {
                const manaCost = 12 + (lv - 1) * 4;
                const directDamage = Math.ceil(attackPower * (1.8 + (lv - 1) * 0.3));
                const baseRadius = 20 + (lv - 1) * 20;
                const aoeRadius = Math.round(baseRadius * 2.5);
                const burnDuration = 2.0 + (lv - 1) * 0.5;
                const noDefBurnTick = Math.max(1, Math.ceil(directDamage * 0.15));

                currentStats.push(
                    `현재 공격력 ${attackPower} 기준 직격 피해는 방어 전 <strong>${directDamage}</strong>입니다.`,
                    `폭발 반경은 <strong>${aoeRadius}</strong>, 화상 지속시간은 <strong>${burnDuration.toFixed(1)}초</strong>, 방어력 0 기준 화상 틱은 <strong>${noDefBurnTick}</strong>입니다.`,
                    `파이어볼 직격과 폭발은 <strong>${critRateText}</strong> 확률로 치명타 <strong>x2</strong>가 적용되고, 화상은 치명타가 적용되지 않습니다.`,
                    `마나 소모는 <strong>${manaCost}</strong>, 재사용 대기시간은 <strong>2.0초</strong>입니다.`
                );

                summaryMetrics.push(
                    { label: '현재 레벨', value: `Lv.${lv}` },
                    { label: '직격 피해', value: `${directDamage}` },
                    { label: '폭발 반경', value: `${aoeRadius}` },
                    { label: '화상 지속', value: `${burnDuration.toFixed(1)}초` },
                    { label: '화상 틱', value: `${noDefBurnTick}` },
                    { label: '마나 소모', value: `${manaCost}` }
                );

                formulaItems.push(
                    `<code>직격 피해 = ceil(공격력 × (1.8 + 0.3 × (레벨 - 1)))</code>`,
                    `<code>최종 피해 = max(1, 직격 피해 - 대상 방어력)</code>`,
                    `<code>치명타 최종 피해 = 최종 피해 × 2</code>`,
                    `<code>폭발 기본 반경 = 20 + 20 × (레벨 - 1)</code>`,
                    `<code>실제 폭발 반경 = 폭발 기본 반경 × 2.5</code>`,
                    `<code>화상 지속 = 2.0 + 0.5 × (레벨 - 1)초</code>`,
                    `<code>화상 틱 피해 = ceil(비치명타 최종 피해 × 0.15)</code>가 <strong>0.5초마다</strong> 들어갑니다.`
                );

                settingItems.push(
                    `투사체는 현재 바라보는 방향으로 속도 <strong>800</strong>으로 날아가며, 최대 <strong>1.5초</strong> 동안 유지됩니다.`,
                    `발사 직후 발밑 폭발을 막기 위해 최소 <strong>50px</strong> 이상 이동해야 충돌 판정이 납니다.`,
                    `폭발에 살아남은 대상은 <strong>살짝 바깥으로 밀린 뒤 중심부로 빨려 들어오는 연소붕괴</strong> 효과를 받습니다.`,
                    `명중 또는 범위 피해 대상 모두 화상을 적용할 수 있지만, <strong>화상 피해는 치명타가 적용되지 않습니다.</strong>`
                );

                if ((weaponCombat.fireballChainChance || 0) > 0) {
                    const enhancementBonusText = (weaponCombat.fireballChainChanceEnhancementBonus || 0) > 0
                        ? `<span class="enhancement-option-bonus">+${this.formatSkillPercent(weaponCombat.fireballChainChanceEnhancementBonus)}</span>`
                        : '';
                    weaponItems.push(`<strong>${weaponName}</strong> 효과: 파이어볼 폭발 후 <strong>${this.formatSkillPercent(weaponCombat.fireballChainChance)}</strong> 확률로 <strong>0.3초 뒤</strong> 같은 위치에서 연속 폭발이 다시 발생합니다.${enhancementBonusText}`);
                }
                if ((weaponCombat.fireballChainDamageRatio || 0) > 0) {
                    const enhancementBonusText = (weaponCombat.fireballChainDamageRatioEnhancementBonus || 0) > 0
                        ? `<span class="enhancement-option-bonus">+${this.formatSkillPercent(weaponCombat.fireballChainDamageRatioEnhancementBonus)}</span>`
                        : '';
                    weaponItems.push(`<strong>${weaponName}</strong> 효과: 연속 폭발 피해는 기본 파이어볼의 <strong>${this.formatSkillPercent(weaponCombat.fireballChainDamageRatio)}</strong>입니다.${enhancementBonusText}`);
                }

                tooltipCurrentEffectHtml = `<div class="current-effect">현재 효과 (Lv.${lv}): 직격 ${directDamage} | 폭발 반경 ${aoeRadius} | 화상 ${burnDuration.toFixed(1)}초 | 마나 ${manaCost}</div>`;
                break;
            }
            case 'shield': {
                const shieldState = p.shieldTimer > 0
                    ? (p.shieldTimer > 1.5 ? '대기 중' : `피격 후 무적 ${p.shieldTimer.toFixed(1)}초 남음`)
                    : '비활성';

                currentStats.push(
                    `현재 상태는 <strong>${shieldState}</strong>입니다.`,
                    `마나 소모는 <strong>20</strong>, 재사용 대기시간은 <strong>3.0초</strong>입니다.`,
                    `실드는 강화되지 않는 고정 성능 스킬이라 현재도 <strong>MAX</strong> 상태입니다.`
                );

                summaryMetrics.push(
                    { label: '현재 상태', value: shieldState },
                    { label: '마나 소모', value: '20' },
                    { label: '쿨다운', value: '3.0초' },
                    { label: '피격 차단', value: '1회' },
                    { label: '무적 시간', value: '1.5초' },
                    { label: '강화 여부', value: '고정 성능' }
                );

                formulaItems.push(
                    `<code>시전 시 shieldTimer = 9999</code>로 유지되어 첫 피격 전까지 준비 상태가 계속됩니다.`,
                    `<code>피격 시 shieldTimer가 1.5초로 전환</code>되며, 그 동안 들어오는 피해와 상태이상을 모두 막습니다.`,
                    `<code>shieldTimer > 0</code>인 동안 <code>takeDamage()</code>는 항상 <strong>0</strong>을 반환합니다.`
                );

                settingItems.push(
                    `첫 공격만 막고 끝나는 단발 보호막이 아니라, 첫 피격 전까지 대기했다가 맞는 순간 <strong>1.5초 무적 구간</strong>으로 바뀝니다.`,
                    `불타는 상태나 감전 같은 상태이상도 함께 차단합니다.`,
                    `레벨업 버튼은 비활성화되어 있고 강화 비용도 없습니다.`
                );

                tooltipCurrentEffectHtml = `<div class="current-effect">현재 효과: 다음 피격 차단 준비 | 피격 후 1.5초 무적 | 마나 20 | 쿨다운 3.0초</div>`;
                break;
            }
            default:
                return null;
        }

        const sectionsHtml = [
            this.buildSkillSummaryMetrics(summaryMetrics),
            this.buildSkillDetailSection('핵심 설명', [data.desc]),
            this.buildSkillDetailSection('현재 적용 수치', currentStats),
            this.buildSkillDetailSection('현재 장착 무기 보정', weaponItems),
            this.buildSkillDetailSection('다음 강화 비용', [upgradeCost == null ? '이 스킬은 추가 강화가 없습니다.' : `현재 다음 레벨 업 비용은 <strong>${upgradeCost.toLocaleString('ko-KR')} G</strong>입니다.`])
        ].filter(Boolean).join('');

        return {
            name: this.getSkillDisplayName(skillId, { includeHotkey: showShortcutText }),
            level: lv,
            hotkey: showShortcutText ? hotkey : '',
            showHotkeyBadge: showShortcutText && !!hotkey && hotkey !== '-',
            subtitle: showShortcutText
                ? `Lv.${lv} · 단축키 ${hotkey}${equippedWeapon ? ` · ${weaponName}` : ''}`
                : `Lv.${lv}${equippedWeapon ? ` · ${weaponName}` : ''}`,
            tooltipCurrentEffectHtml,
            modalHtml: sectionsHtml
        };
    }

    showSkillDetailModal(skillId) {
        const detail = this.getSkillDetailData(skillId);
        const modal = document.getElementById('skill-detail-modal');
        if (!detail || !modal) return;

        this.hideTooltip();
        const title = document.getElementById('skill-detail-modal-title');
        const subtitle = document.getElementById('skill-detail-modal-subtitle');
        const hotkey = document.getElementById('skill-detail-modal-hotkey');
        const body = document.getElementById('skill-detail-modal-body');
        const content = modal.querySelector('.skill-detail-modal-content');

        if (title) title.textContent = detail.name;
        if (subtitle) subtitle.textContent = detail.subtitle;
        if (hotkey) {
            hotkey.textContent = detail.hotkey || '';
            hotkey.style.display = detail.showHotkeyBadge ? 'inline-flex' : 'none';
            hotkey.setAttribute('aria-hidden', detail.showHotkeyBadge ? 'false' : 'true');
        }
        if (body) {
            body.innerHTML = `${detail.tooltipCurrentEffectHtml || ''}${detail.modalHtml}`;
            body.scrollTop = 0;
        }
        if (content) content.scrollTop = 0;
        modal.scrollTop = 0;

        modal.classList.remove('hidden');
        this.activeSkillDetailId = skillId;
        this.positionSkillDetailModal(skillId);
        window.requestAnimationFrame(() => this.positionSkillDetailModal(skillId));
        this.game?.tutorial?.trigger?.('skill_detail_open', { target: skillId });
        this.refreshDesktopShortcutHints();
    }

    hideSkillDetailModal() {
        const modal = document.getElementById('skill-detail-modal');
        if (modal) modal.classList.add('hidden');
        modal?.style.removeProperty('--skill-detail-left');
        modal?.style.removeProperty('--skill-detail-top');
        const body = document.getElementById('skill-detail-modal-body');
        const content = modal?.querySelector?.('.skill-detail-modal-content');
        if (body) body.scrollTop = 0;
        if (content) content.scrollTop = 0;
        if (this.activeSkillDetailId) {
            this.game?.tutorial?.trigger?.('skill_detail_close', { target: this.activeSkillDetailId });
        }
        this.activeSkillDetailId = null;
        this.refreshDesktopShortcutHints();
    }

    bindSkillTooltipTargets() {
        const skillPopup = document.getElementById('skill-popup');
        if (!skillPopup || skillPopup.dataset.tooltipBound === 'true') return;
        const canHover = window.matchMedia?.('(hover: hover)')?.matches ?? false;
        const hasFinePointer = window.matchMedia?.('(pointer: fine)')?.matches ?? false;
        const shouldUseHoverTooltip = canHover && hasFinePointer;

        const resolveSkillItem = (target) => {
            const item = target?.closest?.('.skill-item');
            return item && skillPopup.contains(item) ? item : null;
        };

        const resolveSkillId = (item) => {
            const upBtn = item?.querySelector?.('.skill-up-btn');
            return upBtn?.getAttribute('data-skill') || null;
        };

        const showFromItem = (item, x, y) => {
            const skillId = resolveSkillId(item);
            if (!skillId) return;

            const rect = item.getBoundingClientRect();
            this.showTooltip(skillId, x ?? rect.left, y ?? rect.top);
        };

        if (shouldUseHoverTooltip) {
            skillPopup.addEventListener('mouseover', (e) => {
                const item = resolveSkillItem(e.target);
                if (!item) return;
                showFromItem(item, e.clientX, e.clientY);
            });

            skillPopup.addEventListener('mousemove', (e) => {
                const item = resolveSkillItem(e.target);
                if (!item) {
                    this.hideTooltip();
                    return;
                }
                showFromItem(item, e.clientX, e.clientY);
            });

            skillPopup.addEventListener('mouseleave', () => this.hideTooltip());
        } else {
            skillPopup.addEventListener('touchstart', () => this.hideTooltip(), { passive: true });
        }

        skillPopup.addEventListener('click', (e) => {
            const item = resolveSkillItem(e.target);
            if (!item) return;
            if (e.target.closest('.skill-up-btn')) return;

            const skillId = resolveSkillId(item);
            if (!skillId) return;
            this.showSkillDetailModal(skillId);
        });

        skillPopup.dataset.tooltipBound = 'true';
    }

    ensureTutorialHighlightLayer() {
        if (this.tutorialHighlightLayer) return this.tutorialHighlightLayer;

        const layer = document.createElement('div');
        layer.id = 'tutorial-highlight-layer';
        document.body.appendChild(layer);
        this.tutorialHighlightLayer = layer;
        return layer;
    }

    resolveTutorialHighlightTarget(target) {
        if (!target) return null;
        if (target instanceof Element) return target;
        if (typeof target !== 'string') return null;

        try {
            return document.querySelector(target);
        } catch {
            return null;
        }
    }

    normalizeTutorialHighlightConfig(config) {
        if (!config) {
            return {
                targets: [],
                mode: 'ring',
                label: '',
                padding: null,
                avoidTargets: [],
                suppressDim: false
            };
        }

        if (
            typeof config === 'string'
            || Array.isArray(config)
            || config instanceof Element
        ) {
            return {
                targets: Array.isArray(config) ? config.filter(Boolean) : [config],
                mode: 'ring',
                label: '',
                padding: null,
                avoidTargets: [],
                suppressDim: false
            };
        }

        const targets = config.targets || config.target || config.selectors || [];
        const avoidTargets = config.avoidTargets || config.dimAvoidTargets || [];
        return {
            mode: config.mode || 'ring',
            label: config.label || '',
            padding: Number.isFinite(config.padding) ? config.padding : null,
            targets: Array.isArray(targets) ? targets.filter(Boolean) : (targets ? [targets] : []),
            avoidTargets: Array.isArray(avoidTargets) ? avoidTargets.filter(Boolean) : (avoidTargets ? [avoidTargets] : []),
            suppressDim: !!config.suppressDim
        };
    }

    highlightTutorialTargets(config) {
        this.tutorialHighlightState = this.normalizeTutorialHighlightConfig(config);
        this.tutorialHighlightTargets = this.tutorialHighlightState.targets;
        this.refreshTutorialHighlight();
    }

    refreshTutorialHighlight() {
        const layer = this.ensureTutorialHighlightLayer();
        layer.innerHTML = '';
        const state = this.tutorialHighlightState || { targets: this.tutorialHighlightTargets, mode: 'ring', label: '' };
        const runtimeTargets = this.getTutorialRuntimeFocusTargets(
            this.game?.tutorial?.getCurrentStep?.(),
            state.targets
        );
        const currentStepId = this.game?.tutorial?.getCurrentStep?.()?.id || this.tutorialGuideState?.stepId || '';
        const suppressDim = !!this.tutorialDimSuppressed
            && !!currentStepId
            && this.tutorialDimSuppressedStepId === currentStepId
            || !!state.suppressDim;
        if (!runtimeTargets?.length) {
            this.refreshTutorialGuideLayout();
            return;
        }

        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const rects = [];
        const exclusionRects = [
            ...this.getTutorialFocusRects(state.avoidTargets || []),
            ...this.getActivePopupAvoidZones()
        ]
            .filter(Boolean)
            .map((rect) => this.applyTutorialRectInsets(rect, -1) || rect);

        runtimeTargets.forEach((target) => {
            const rect = this.resolveTutorialTargetRect(target);
            if (!rect) return;

            const padding = Number.isFinite(state.padding)
                ? state.padding
                : this.getTutorialHighlightPadding(rect, state.mode);
            const left = Math.max(0, Math.floor(rect.left - padding));
            const top = Math.max(0, Math.floor(rect.top - padding));
            const right = Math.min(viewportW, Math.ceil(rect.right + padding));
            const bottom = Math.min(viewportH, Math.ceil(rect.bottom + padding));
            const width = Math.max(0, right - left);
            const height = Math.max(0, bottom - top);
            if (!width || !height) return;

            rects.push({ left, top, right, bottom, width, height });
        });

        if (!rects.length) {
            this.refreshTutorialGuideLayout();
            return;
        }

        if (!suppressDim) {
            const dimRects = [...rects, ...exclusionRects]
                .filter((rect) => rect && rect.width > 0 && rect.height > 0)
                .map((rect) => ({
                    left: Math.max(0, Math.floor(rect.left)),
                    top: Math.max(0, Math.floor(rect.top)),
                    right: Math.min(viewportW, Math.ceil(rect.right)),
                    bottom: Math.min(viewportH, Math.ceil(rect.bottom))
                }));

            const xEdges = Array.from(new Set([0, viewportW, ...dimRects.flatMap((rect) => [rect.left, rect.right])]))
                .filter((value) => Number.isFinite(value))
                .sort((a, b) => a - b);
            const yEdges = Array.from(new Set([0, viewportH, ...dimRects.flatMap((rect) => [rect.top, rect.bottom])]))
                .filter((value) => Number.isFinite(value))
                .sort((a, b) => a - b);

            const dimSegments = [];
            for (let yIndex = 0; yIndex < yEdges.length - 1; yIndex += 1) {
                const top = yEdges[yIndex];
                const bottom = yEdges[yIndex + 1];
                const height = Math.max(0, bottom - top);
                if (!height) continue;

                for (let xIndex = 0; xIndex < xEdges.length - 1; xIndex += 1) {
                    const left = xEdges[xIndex];
                    const right = xEdges[xIndex + 1];
                    const width = Math.max(0, right - left);
                    if (!width) continue;

                    const sampleX = left + width / 2;
                    const sampleY = top + height / 2;
                    const insideFocus = dimRects.some((rect) => (
                        sampleX >= rect.left
                        && sampleX <= rect.right
                        && sampleY >= rect.top
                        && sampleY <= rect.bottom
                    ));
                    if (insideFocus) continue;

                    dimSegments.push({ left, top, width, height });
                }
            }

            dimSegments.forEach((segment) => {
                if (!segment.width || !segment.height) return;
                const dim = document.createElement('div');
                dim.className = 'tutorial-highlight-dim';
                dim.style.left = `${segment.left}px`;
                dim.style.top = `${segment.top}px`;
                dim.style.width = `${segment.width}px`;
                dim.style.height = `${segment.height}px`;
                layer.appendChild(dim);
            });
        }

        rects.forEach((rect) => {
            const box = document.createElement('div');
            box.className = `tutorial-highlight-box tutorial-highlight-${state.mode}`;
            box.style.left = `${rect.left}px`;
            box.style.top = `${rect.top}px`;
            box.style.width = `${rect.width}px`;
            box.style.height = `${rect.height}px`;
            layer.appendChild(box);
        });

        if (state.label) {
            const primaryRect = rects[0];
            const callout = document.createElement('div');
            callout.className = 'tutorial-highlight-callout';
            callout.textContent = state.label;
            callout.style.left = `${Math.max(12, primaryRect.left)}px`;
            callout.style.top = `${Math.max(12, primaryRect.top - 34)}px`;
            layer.appendChild(callout);
        }

        this.refreshTutorialGuideLayout();
    }

    clearTutorialHighlightLayer() {
        if (this.tutorialHighlightLayer) {
            this.tutorialHighlightLayer.innerHTML = '';
        }
    }

    clearTutorialHighlight() {
        this.tutorialHighlightTargets = [];
        this.tutorialHighlightState = { targets: [], mode: 'ring', label: '', avoidTargets: [], suppressDim: false };
        this.tutorialDimSuppressed = false;
        this.tutorialDimSuppressedStepId = '';
        this.clearTutorialHighlightLayer();
    }

    showTooltip(skillId, x, y) {
        const detail = this.getSkillDetailData(skillId);
        if (!detail || !this.tooltip) return;

        const tooltip = this.tooltip;
        const tooltipName = tooltip.querySelector('.tooltip-name');
        const tooltipDesc = tooltip.querySelector('.tooltip-desc');
        if (tooltipName) tooltipName.textContent = detail.name;
        if (tooltipDesc) tooltipDesc.innerHTML = `${this.skillData[skillId].desc}${detail.tooltipCurrentEffectHtml}`;

        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const touchLike = window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0;
        const margin = touchLike ? 12 : 8;

        tooltip.style.position = 'fixed';
        tooltip.style.right = 'auto';
        tooltip.style.bottom = 'auto';
        tooltip.style.transform = 'none';
        tooltip.style.boxSizing = 'border-box';
        tooltip.style.maxWidth = `min(320px, calc(100vw - ${margin * 2}px))`;
        tooltip.classList.remove('hidden');
        tooltip.style.visibility = 'hidden';
        tooltip.style.left = '0px';
        tooltip.style.top = '0px';

        const rect = tooltip.getBoundingClientRect();
        const anchorX = Number.isFinite(x) ? x : (viewportW / 2);
        const anchorY = Number.isFinite(y) ? y : (viewportH / 2);

        let left = touchLike ? (anchorX - rect.width / 2) : (anchorX + 16);
        let top = touchLike ? (anchorY + 18) : (anchorY + 16);
        if (!Number.isFinite(left)) left = margin;
        if (!Number.isFinite(top)) top = margin;

        const maxLeft = Math.max(margin, viewportW - rect.width - margin);
        const maxTop = Math.max(margin, viewportH - rect.height - margin);
        left = Math.min(Math.max(margin, left), maxLeft);
        top = Math.min(Math.max(margin, top), maxTop);

        tooltip.style.left = `${Math.round(left)}px`;
        tooltip.style.top = `${Math.round(top)}px`;
        tooltip.style.visibility = 'visible';
        this.game.tutorial?.trigger?.('skill_tooltip', { target: skillId });
    }

    hideTooltip() {
        this.tooltip.classList.add('hidden');
    }

    createEmptyPendingStats() {
        return { vitality: 0, intelligence: 0, wisdom: 0, agility: 0 };
    }

    createEmptyStatInsightFlags() {
        return {
            vitality: false,
            intelligence: false,
            wisdom: false,
            agility: false
        };
    }

    resetStatInsightPreviewState() {
        this.statInsightPreviewShown = this.createEmptyStatInsightFlags();
    }

    ensureStatInsightFlags(player = this.game.localPlayer) {
        const nextFlags = this.createEmptyStatInsightFlags();
        if (!player) return nextFlags;
        if (!player.questData || typeof player.questData !== 'object') {
            player.questData = {};
        }
        player.questData.statInsightShown = {
            ...nextFlags,
            ...(player.questData.statInsightShown || {})
        };
        return player.questData.statInsightShown;
    }

    getStatInsightDefinitions() {
        return [
            { key: 'vitality', text: '적의 공격을 더 견고하게 오래 버티고, 빠르게 회복하게 된 것 같다' },
            { key: 'intelligence', text: '적에게 치명적인 강력한 일격을 가할 수 있을 것 같다' },
            { key: 'wisdom', text: '정신적으로 여유가 생기고 더 빠르게 회복되는게 느껴진다. 침착하게 공격할 수 있게 됐다.' },
            { key: 'agility', text: '몸이 가볍다. 움직임이 민첩해지고, 적의 빈틈을 더 정확하고 빠르게 노릴 수 있게 됐다' }
        ];
    }

    getStatInsightLabel(statKey) {
        return {
            vitality: '체력',
            intelligence: '지능',
            wisdom: '지혜',
            agility: '순발력'
        }[statKey] || '스탯';
    }

    getStatInsightPreviewFallbackText(statKey) {
        const label = this.getStatInsightLabel(statKey);
        return `${label} +1 미리보기. 오른쪽 수치 변화를 확인하세요.`;
    }

    collectFirstStatInsightMessages(player = this.game.localPlayer, pendingStats = this.pendingStats) {
        const flags = this.ensureStatInsightFlags(player);
        const orderedInsights = this.getStatInsightDefinitions();

        return orderedInsights.reduce((messages, insight) => {
            if ((Number(pendingStats?.[insight.key] || 0) > 0) && !flags[insight.key]) {
                flags[insight.key] = true;
                messages.push({ key: insight.key, text: insight.text, durationMs: 3600 });
            }
            return messages;
        }, []);
    }

    maybeShowStatInsightPreview(statKey, player = this.game.localPlayer) {
        if (!statKey) return;

        const flags = this.ensureStatInsightFlags(player);
        if (!this.statInsightPreviewShown || typeof this.statInsightPreviewShown !== 'object') {
            this.resetStatInsightPreviewState();
        }

        const insight = this.getStatInsightDefinitions().find((entry) => entry.key === statKey);
        const shouldShowInsight = !flags[statKey] && !this.statInsightPreviewShown[statKey] && !!insight?.text;
        if (shouldShowInsight) {
            this.statInsightPreviewShown[statKey] = true;
        }

        const previewText = shouldShowInsight
            ? insight.text
            : this.getStatInsightPreviewFallbackText(statKey);
        if (!previewText) return;

        this.showCenterMessage(previewText, '#ffeb3b', {
            durationMs: shouldShowInsight ? 2800 : 2000,
            lightweight: true
        });
    }

    queueStatInsightMessages(messages = []) {
        if (!Array.isArray(messages) || messages.length === 0) return;

        window.setTimeout(() => {
            messages.forEach((message) => {
                if (!message?.text) return;
                this.showCenterMessage(message.text, '#ffeb3b', {
                    durationMs: message.durationMs,
                    lightweight: true
                });
            });
        }, 0);
    }

    getPendingStatTotal() {
        return Object.values(this.pendingStats || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
    }

    savePendingStats() {
        const p = this.game.localPlayer;
        if (!p) return;
        if (this.getPendingStatTotal() <= 0) return;
        const pendingSnapshot = { ...(this.pendingStats || {}) };
        const firstStatInsightMessages = this.collectFirstStatInsightMessages(p, pendingSnapshot);
        const queuedInsightMessages = firstStatInsightMessages.filter((message) => !this.statInsightPreviewShown?.[message.key]);
        p.vitality += pendingSnapshot.vitality;
        p.intelligence += pendingSnapshot.intelligence;
        p.wisdom += pendingSnapshot.wisdom;
        p.agility += pendingSnapshot.agility;
        p.refreshStats();
        // Clamp current stats to new maximums
        p.hp = Math.min(p.hp, p.maxHp);
        p.mp = Math.min(p.mp, p.maxMp);
        this.pendingStats = this.createEmptyPendingStats();
        p.saveProfilePatch?.([
            'vitality',
            'intelligence',
            'wisdom',
            'agility',
            'statPoints',
            'hp',
            'maxHp',
            'mp',
            'maxMp'
        ], {
            debounceMs: 0,
            forceImmediate: true,
            reason: 'stat_allocation_patch'
        });
        this.game.tutorial?.trigger?.('stats_saved');
        this.queueStatInsightMessages(queuedInsightMessages);
        this.resetStatInsightPreviewState();
    }

    cancelPendingStats(options = {}) {
        const { refreshUi = true } = options;
        const p = this.game.localPlayer;
        const totalPending = this.getPendingStatTotal();
        if (p && totalPending > 0) {
            p.statPoints += totalPending;
        }
        this.pendingStats = this.createEmptyPendingStats();
        this.resetStatInsightPreviewState();
        if (refreshUi) {
            this.updateStatusPopup();
        }
    }

    hideAllPopups() {
        this.hideTooltip();
        const statusPopup = document.getElementById('status-popup');
        if (statusPopup && !statusPopup.classList.contains('hidden')) {
            // Status popup has special handling due to confirm modal
            this.togglePopup('status-popup');
        } else {
            if (this.overlay) this.overlay.classList.add('hidden');
            document.querySelectorAll('.game-popup').forEach(p => p.classList.add('hidden'));
            this.hideSkillDetailModal();
            document.body.classList.remove('popup-open');
            this.closeInventoryItemModal(true);
            this.isPaused = false;
        }
        this.refreshDesktopShortcutHints();
    }

    updateStatusPopup() {
        const p = this.game.localPlayer;
        if (!p) return;

        // Player Name
        const nameDisplay = document.getElementById('player-name-display');
        if (nameDisplay) {
            nameDisplay.textContent = p.name;
        }

        // Basic Info
        const levelEl = document.getElementById('stat-level');
        if (levelEl) levelEl.textContent = p.level;

        // EXP Bar
        const expFill = document.getElementById('stat-exp-fill');
        const expText = document.getElementById('stat-exp-text');
        const expRemain = document.getElementById('stat-exp-remain');
        const expPerc = (p.exp / p.maxExp) * 100;

        if (expFill) expFill.style.width = `${expPerc}%`;
        if (expText) expText.textContent = `${Math.floor(p.exp)} / ${p.maxExp}`;
        if (expRemain) expRemain.textContent = `${p.maxExp - Math.floor(p.exp)}`;

        // Stats
        document.getElementById('stat-points').textContent = p.statPoints;

        const statsToShow = ['vitality', 'intelligence', 'wisdom', 'agility'];
        statsToShow.forEach(s => {
            const valEl = document.getElementById(`val-${s}`);
            if (valEl) {
                valEl.textContent = p[s] + this.pendingStats[s];
                if (this.pendingStats[s] > 0) valEl.classList.add('stat-predict-inc');
                else valEl.classList.remove('stat-predict-inc');
            }

            const upBtn = document.querySelector(`.stat-up-btn[data-stat="${s}"]`);
            const downBtn = document.querySelector(`.stat-down-btn[data-stat="${s}"]`);

            if (upBtn) {
                if (p.statPoints > 0) upBtn.classList.remove('disabled');
                else upBtn.classList.add('disabled');
            }

            if (downBtn) {
                if (this.pendingStats[s] > 0) downBtn.classList.remove('disabled');
                else downBtn.classList.add('disabled');
            }
        });

        // Derived (Immediate Predicted Feedback)
        const baseVit = p.vitality;
        const baseInt = p.intelligence;
        const baseWis = p.wisdom;
        const baseAgi = p.agility;

        const predVit = p.vitality + this.pendingStats.vitality;
        const predInt = p.intelligence + this.pendingStats.intelligence;
        const predWis = p.wisdom + this.pendingStats.wisdom;
        const predAgi = p.agility + this.pendingStats.agility;

        const formatDerivedValue = (value, isPercentage = false, decimal = 0) => {
            if (isPercentage) return `${(value * 100).toFixed(decimal)}%`;
            if (decimal === 0) return `${Math.floor(value)}`;
            return value.toFixed(decimal);
        };

        const getEquipmentBonus = (actualTotal, baseValue) => {
            const raw = Number(actualTotal) - Number(baseValue);
            if (!Number.isFinite(raw) || raw <= 0.0001) return 0;
            return Math.round(raw * 1000) / 1000;
        };

        // Compare predicted base stat vs current base stat for pending highlight,
        // while showing weapon bonuses as a separate green + value.
        const updateDerived = (id, currentBaseVal, predBaseVal, isPercentage = false, decimal = 0, equipmentBonus = 0) => {
            const el = document.getElementById(id);
            if (!el) return;

            const totalVal = predBaseVal + equipmentBonus;
            const totalText = formatDerivedValue(totalVal, isPercentage, decimal);
            const bonusText = equipmentBonus > 0 ? formatDerivedValue(equipmentBonus, isPercentage, decimal) : '';
            const totalClass = predBaseVal > currentBaseVal ? 'stat-predict-inc' : '';

            el.innerHTML = totalClass
                ? `<span class="${totalClass}">${totalText}</span>${equipmentBonus > 0 ? ` <span class="stat-equip-bonus">+${bonusText}</span>` : ''}`
                : `${totalText}${equipmentBonus > 0 ? ` <span class="stat-equip-bonus">+${bonusText}</span>` : ''}`;
        };

        const updateDerivedTotal = (id, currentTotalVal, predTotalVal, equipmentBonus = 0, isPercentage = false, decimal = 0) => {
            const el = document.getElementById(id);
            if (!el) return;

            const totalText = formatDerivedValue(predTotalVal, isPercentage, decimal);
            const bonusText = equipmentBonus > 0 ? formatDerivedValue(equipmentBonus, isPercentage, decimal) : '';
            const totalClass = predTotalVal > currentTotalVal + 0.0001 ? 'stat-predict-inc' : '';

            el.innerHTML = totalClass
                ? `<span class="${totalClass}">${totalText}</span>${equipmentBonus > 0 ? ` <span class="stat-equip-bonus">+${bonusText}</span>` : ''}`
                : `${totalText}${equipmentBonus > 0 ? ` <span class="stat-equip-bonus">+${bonusText}</span>` : ''}`;
        };

        // HP/MP Range special handling
        // v2.1: Data-Driven UI Formulas (Synced with Player.js)
        const def = p.definition || {};
        const base = def.baseStats || {};
        const growth = def.growthStats || { hp: 10, mp: 10, atk: 1, def: 1 };

        // Constants using nullish coalescing for safety
        const bMaxHp = base.maxHp ?? 30;
        const bMaxMp = base.maxMp ?? 50;
        const bAtk = base.atk ?? 10;
        const bDef = base.def ?? 1;
        const bHpRegen = base.hpRegen ?? 1;
        const bMpRegen = base.mpRegen ?? 2;

        // v2.1: Robust Growth Defaults
        const gHp = growth.hp ?? 10;
        const gMp = growth.mp ?? 10;
        const gAtk = growth.atk ?? 1;
        const gDef = growth.def ?? 1;

        // HP/MP Range
        const hpRangeEl = document.getElementById('val-hp-range');
        const predMaxHp = bMaxHp + (predVit * gHp);
        if (hpRangeEl) {
            hpRangeEl.innerHTML = `${Math.floor(p.hp)} / <span class="${predMaxHp > p.maxHp ? 'stat-predict-inc' : ''}">${predMaxHp}</span>`;
        }

        const mpRangeEl = document.getElementById('val-mp-range');
        const predMaxMp = bMaxMp + (predWis * gMp);
        if (mpRangeEl) {
            mpRangeEl.innerHTML = `${Math.floor(p.mp)} / <span class="${predMaxMp > p.maxMp ? 'stat-predict-inc' : ''}">${predMaxMp}</span>`;
        }

        // Derived Stats
        const predAtk = bAtk + (predInt * gAtk) + Math.floor(predWis / 2);
        const predDef = bDef + (predVit * gDef);
        const predHpRegen = bHpRegen + (predVit * 1);
        const predMpRegen = bMpRegen + (predWis * 1);

        const currentAtkBase = bAtk + (baseInt * gAtk) + Math.floor(baseWis / 2);
        const currentDefBase = bDef + (baseVit * gDef);
        const currentHpRegenBase = bHpRegen + (baseVit * 1);
        const currentMpRegenBase = bMpRegen + (baseWis * 1);

        const equipAtkBonus = getEquipmentBonus(p.attackPower, currentAtkBase);
        const equipDefBonus = getEquipmentBonus(p.defense, currentDefBase);
        const equipHpRegenBonus = getEquipmentBonus(p.hpRegen, currentHpRegenBase);
        const equipMpRegenBonus = getEquipmentBonus(p.mpRegen, currentMpRegenBase);

        updateDerived('val-atk', currentAtkBase, predAtk, false, 0, equipAtkBonus);
        updateDerived('val-def', currentDefBase, predDef, false, 0, equipDefBonus);
        updateDerived('val-hp-regen', currentHpRegenBase, predHpRegen, false, 0, equipHpRegenBonus);
        updateDerived('val-mp-regen', currentMpRegenBase, predMpRegen, false, 0, equipMpRegenBonus);

        // v0.00.40: INT bonuses: +5% attack speed per INT, +1% crit rate per INT
        // Note: These are multiplier bonuses, not additive base stats usually.
        // Player.js: min(2.0, 1.0 + int * 0.05) + agi * 0.1
        const predAtkSpd = Math.min(2.0, 1.0 + (predInt * 0.05)) + (predAgi * 0.1);
        const predCrit = 0.1 + (predAgi * 0.01) + (predInt * 0.01);
        const predMoveSpd = 1.0 + (predAgi * 0.05); // Base 1.0

        const currentAtkSpdBase = Math.min(2.0, 1.0 + (baseInt * 0.05)) + (baseAgi * 0.1);
        const currentCritBase = 0.1 + (baseAgi * 0.01) + (baseInt * 0.01);
        const currentMoveSpdBase = 1.0 + (baseAgi * 0.05);

        const equippedWeapon = typeof p.getEquippedWeapon === 'function' ? p.getEquippedWeapon() : null;
        const weaponAtkSpdMultiplier = 1 + Math.max(0, Number(
            typeof p.getWeaponAffixEffectiveValue === 'function'
                ? p.getWeaponAffixEffectiveValue(equippedWeapon, 'attackSpeedBonus')
                : 0
        ) || 0);
        const currentAtkSpdTotal = currentAtkSpdBase * weaponAtkSpdMultiplier;
        const predAtkSpdTotal = predAtkSpd * weaponAtkSpdMultiplier;
        const equipAtkSpdBonus = getEquipmentBonus(predAtkSpdTotal, predAtkSpd);
        const equipCritBonus = getEquipmentBonus(p.critRate, currentCritBase);
        const equipMoveSpdBonus = getEquipmentBonus(p.moveSpeedBonus, currentMoveSpdBase);

        updateDerivedTotal('val-atk-spd', currentAtkSpdTotal, predAtkSpdTotal, equipAtkSpdBonus, false, 2);
        updateDerived('val-crit', currentCritBase, predCrit, true, 0, equipCritBonus);
        updateDerived('val-move-spd', currentMoveSpdBase, predMoveSpd, true, 0, equipMoveSpdBonus);

        // v1.92: Bind & Update Link Google Button
        const linkBtn = document.getElementById('btn-link-google');
        if (linkBtn) {
            const guestLabel = '게스트 데이터를 구글 계정에 연동하기';
            const loadingLabel = '구글 계정 연동 중...';
            const transferringLabel = '데이터 이전 중...';
            const linkedLabel = '이미 구글 계정과 연동됨';
            const setLinkButtonState = (disabled, text) => {
                linkBtn.disabled = disabled;
                linkBtn.textContent = text;
            };
            const isGuest = this.game.auth.currentUser?.isAnonymous;

            setLinkButtonState(false, isGuest ? guestLabel : linkedLabel);
            if (!isGuest) linkBtn.classList.add('linked');
            else linkBtn.classList.remove('linked');

            linkBtn.onclick = async () => {
                if (!this.game.auth.currentUser?.isAnonymous) return;

                try {
                    setLinkButtonState(true, loadingLabel);

                    const guestUid = this.game.auth.getUid();
                    const flushResult = await this.game.net.flushProfileWrites?.(guestUid);
                    if (flushResult && !flushResult.ok) {
                        throw new Error('대기 중인 게스트 데이터를 저장하지 못했습니다. 다시 시도해주세요.');
                    }
                    const guestSnapshot = await this.game.net.getLatestProfileSnapshot?.(guestUid, {
                        throwOnError: true
                    });
                    if (!guestSnapshot?.profile) {
                        alert('현재 게스트 캐릭터 데이터를 찾을 수 없습니다.');
                        setLinkButtonState(false, guestLabel);
                        return;
                    }
                    let targetExpectedRevision = null;

                    const result = await this.game.auth.migrateToGoogle();
                    if (!result) {
                        setLinkButtonState(false, guestLabel);
                        return;
                    }

                    if (!result.success && result.reason === 'existing_google_account') {
                        const shouldOverwrite = await this.requestGenericDecision(
                            '기존 구글 데이터 발견',
                            '선택한 구글 계정에 이미 저장된 캐릭터 데이터가 있습니다. 기존 구글 데이터를 삭제하고 현재 게스트 데이터를 연동할까요?',
                            {
                                yesText: '현재 데이터로 덮어쓰기',
                                noText: '연동 취소'
                            }
                        );

                        if (!shouldOverwrite) {
                            Logger.info('Google migration cancelled by user because the target account already has data.');
                            setLinkButtonState(false, guestLabel);
                            return;
                        }

                        setLinkButtonState(true, loadingLabel);
                        const googleUser = await this.game.auth.signInToExistingGoogle(result.credential);
                        if (!googleUser?.uid) {
                            throw new Error('기존 구글 계정으로 로그인하지 못했습니다.');
                        }

                        const archived = await this.game.net.archiveLatestProfile?.(googleUser.uid, {
                            reason: 'google_migration_overwrite_archive',
                            sourceUid: googleUser.uid
                        });
                        if (!archived?.ok || !archived.snapshot?.profile) {
                            throw archived?.error || new Error('기존 구글 데이터 백업에 실패했습니다.');
                        }
                        targetExpectedRevision = Number(
                            archived.snapshot.rootRevision
                            ?? archived.snapshot.profile._profileRevision
                            ?? 0
                        );

                        result.success = true;
                        result.mode = 'overwrite_existing_google';
                        result.googleUid = googleUser.uid;
                        result.googleDisplayName = googleUser.displayName || '';
                        result.googleEmail = googleUser.email || '';
                    }

                    if (!result.success) {
                        setLinkButtonState(false, guestLabel);
                        return;
                    }

                    if (this.game.net.playerId !== result.googleUid) {
                        await this.game.net.connect({
                            uid: result.googleUid,
                            isAnonymous: false,
                            displayName: result.googleDisplayName || ''
                        });
                    }

                    if (targetExpectedRevision == null) {
                        const targetSnapshot = await this.game.net.getLatestProfileSnapshot?.(result.googleUid, {
                            throwOnError: true,
                            includeMissingMetadata: true
                        });
                        if (targetSnapshot?.profile && result.googleUid !== guestUid) {
                            throw new Error('대상 구글 계정의 프로필 상태가 변경되었습니다. 다시 시도해주세요.');
                        }
                        targetExpectedRevision = Number(
                            targetSnapshot?.rootRevision
                            ?? targetSnapshot?.profile?._profileRevision
                            ?? 0
                        );
                    }

                    setLinkButtonState(true, transferringLabel);
                    const currentProfile = { profile: guestSnapshot.profile };
                    if (!currentProfile?.profile) {
                        alert('현재 데이터를 불러오지 못했습니다.');
                        setLinkButtonState(false, guestLabel);
                        return;
                    }

                    const migratedProfile = {
                        ...currentProfile.profile,
                        displayName: result.googleDisplayName || currentProfile.profile.displayName || currentProfile.profile.name,
                        migratedFromUid: guestUid,
                        migratedFromTs: guestSnapshot.ts || currentProfile.profile.ts || 0,
                        linkedGoogleEmail: result.googleEmail || '',
                        linkedAt: Date.now(),
                        ts: Date.now()
                    };

                    const saveResult = await this.game.net.savePlayerData(result.googleUid, migratedProfile, false, {
                        expectedRevision: targetExpectedRevision,
                        forceImmediate: true,
                        allowDestructiveProfileWrite: true,
                        backupReason: result.mode === 'overwrite_existing_google' ? 'google_migration_overwrite' : 'google_migration',
                        sourceUid: guestUid,
                        sourceTs: guestSnapshot.ts || migratedProfile.ts
                    });

                    if (!saveResult?.ok) {
                        throw saveResult?.error || new Error('연동 데이터 저장에 실패했습니다.');
                    }

                    alert('구글 계정 연동이 완료되었습니다. 새 계정 상태로 다시 불러옵니다.');
                    window.location.reload();
                } catch (e) {
                    if (e.code === 'auth/popup-closed-by-user') {
                        Logger.info('User cancelled Google login popup.');
                    } else {
                        Logger.error('Migration Error:', e);
                        alert("오류가 발생했습니다: " + e.message);
                    }
                    setLinkButtonState(false, guestLabel);
                }
            };
        }

        this.updateHudAttentionIndicators();
    }

    // --- Dialogue System (v2.0) ---
    showDialogue(sequence) {
        let dialogueBox = document.getElementById('dialogue-overlay');
        if (!dialogueBox) {
            dialogueBox = document.createElement('div');
            dialogueBox.id = 'dialogue-overlay';
            dialogueBox.className = 'dialogue-overlay hidden';
            dialogueBox.innerHTML = `
                <div class="dialogue-box">
                    <div class="dialogue-portrait"></div>
                    <div class="dialogue-content">
                        <div class="dialogue-speaker"></div>
                        <div class="dialogue-text"></div>
                        <div class="dialogue-options"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(dialogueBox);

            // Basic CSS for Dialogue (Injected here for simplicity if not in CSS)
            if (!document.getElementById('dialogue-css')) {
                const style = document.createElement('style');
                style.id = 'dialogue-css';
                style.textContent = `
                    .dialogue-overlay { position: fixed; bottom: 10%; left: 50%; transform: translateX(-50%); width: 90%; max-width: 800px; z-index: 2000; pointer-events: auto; }
                    .dialogue-box { background: rgba(0,0,0,0.85); border: 2px solid #fff; border-radius: 10px; padding: 20px; display: flex; gap: 20px; align-items: flex-end; color: #fff; box-shadow: 0 5px 15px rgba(0,0,0,0.5); }
                    .dialogue-portrait { width: 100px; height: 100px; background-size: contain; background-repeat: no-repeat; background-position: center; flex-shrink: 0; background-color: #333; border: 1px solid #555; }
                    .dialogue-content { flex-grow: 1; display: flex; flex-direction: column; gap: 10px; }
                    .dialogue-speaker { font-size: 1.2rem; font-weight: bold; color: #ffd700; margin-bottom: 5px; }
                    .dialogue-text { font-size: 1.1rem; line-height: 1.5; white-space: pre-wrap; }
                    .dialogue-options { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
                    .dialogue-option-btn { background: #333; border: 1px solid #777; color: #fff; padding: 10px; cursor: pointer; text-align: left; transition: background 0.2s; }
                    .dialogue-option-btn:hover { background: #555; }
                    .hidden { display: none !important; }
                `;
                document.head.appendChild(style);
            }
        }

        const portraitEl = dialogueBox.querySelector('.dialogue-portrait');
        const speakerEl = dialogueBox.querySelector('.dialogue-speaker');
        const textEl = dialogueBox.querySelector('.dialogue-text');
        const optionsEl = dialogueBox.querySelector('.dialogue-options');

        // Update Content
        speakerEl.textContent = sequence.speaker || 'Unknown';
        textEl.textContent = sequence.text || '...';

        // Portrait (Placeholder logic)
        if (sequence.visual && this.game.resources) {
            portraitEl.style.backgroundColor = '#555';
            portraitEl.style.backgroundImage = 'none';
        } else {
            portraitEl.style.display = 'none';
        }

        // Options
        optionsEl.innerHTML = '';
        if (sequence.options && sequence.options.length > 0) {
            sequence.options.forEach((opt, index) => {
                const btn = document.createElement('button');
                btn.className = 'dialogue-option-btn';
                btn.textContent = opt.text;
                btn.onclick = (e) => {
                    e.stopPropagation();
                    if (this.game.sound) this.game.sound.playSfx('ui_click');
                    this.game.story.advance(index);
                };
                optionsEl.appendChild(btn);
            });
        } else {
            dialogueBox.onclick = (e) => {
                if (e.target.tagName === 'BUTTON') return;
                if (this.game.sound) this.game.sound.playSfx('ui_click');
                this.game.story.advance();
                dialogueBox.onclick = null;
            };
        }

        dialogueBox.classList.remove('hidden');
        this.isPaused = true;
    }

    hideDialogue() {
        const dialogueBox = document.getElementById('dialogue-overlay');
        if (dialogueBox) {
            dialogueBox.classList.add('hidden');
        }
        this.isPaused = false;
    }

    showEmotePanel() {
        const panel = document.getElementById('emote-panel');
        if (!panel) return;

        panel.innerHTML = '';
        const emotes = this.game.emotes || [];

        emotes.forEach(emote => {
            const btn = document.createElement('button');
            btn.className = 'emote-item';
            btn.title = emote.id || 'emote';
            btn.style.cssText = 'display:flex; align-items:center; justify-content:center; background:none; border:none; cursor:pointer; padding:5px;';

            const icon = document.createElement('img');
            icon.src = emote.icon;
            icon.alt = emote.id || 'emote';
            icon.className = 'emote-item';
            icon.style.pointerEvents = 'none';
            btn.appendChild(icon);

            btn.onclick = () => {
                this.onEmoteClick(emote.id);
                panel.classList.add('hidden');
                if (this.game.sound) this.game.sound.playSfx('ui_click');
            };

            panel.appendChild(btn);
        });

        panel.classList.remove('hidden');
    }

    updateSkillPopup() {
        const p = this.game.localPlayer;
        if (!p) return;

        const manastoneEl = document.getElementById('ui-skill-manastone');
        if (manastoneEl) manastoneEl.textContent = p.manastone;

        const skillIds = ['laser', 'missile', 'fireball', 'shield'];
        skillIds.forEach(skillId => {
            const lv = p.skillLevels[skillId] || 1;
            const levelEl = document.getElementById(`lvl-${skillId}`);
            if (levelEl) levelEl.textContent = lv;

            // Exponential Cost Logic
            // v1.1: Use Player method or same formula
            const cost = p.getSkillUpgradeCost ? p.getSkillUpgradeCost(skillId) : (300 * Math.pow(2, lv - 1));
            const costEl = document.querySelector(`.skill-cost[data-skill="${skillId}"]`);
            if (costEl) costEl.textContent = skillId === 'shield' ? '-' : cost;

            const btn = document.querySelector(`.skill-up-btn[data-skill="${skillId}"]`);
            if (btn) {
                if (skillId === 'shield') {
                    btn.textContent = 'MAX';
                    btn.classList.add('disabled');
                    btn.disabled = true;
                } else {
                    const tutorialLocked = !this.game.tutorial?.isSkillUpgradeAllowed?.(skillId);
                    btn.disabled = tutorialLocked || p.manastone < cost;
                    btn.classList.toggle('disabled', tutorialLocked || p.manastone < cost);
                }
            }
        });

        this.updateHudAttentionIndicators();
    }

    updateQuestUI() {
        const p = this.game.localPlayer;
        if (!p || !p.questData) return;

        const taskDisplay = document.getElementById('quest-task-display');
        const rewardDisplay = document.getElementById('quest-reward-display');
        const taskTitle = document.getElementById('active-quest-title');
        const taskProgress = document.getElementById('active-quest-task');
        const rewardText = document.getElementById('active-quest-reward');
        const rewardIcon = rewardDisplay?.querySelector('.quest-icon');
        const rewardTitle = rewardDisplay?.querySelector('.quest-title');
        const syncQuestAttention = (claimAvailable, firstClaimHighlight = false) => {
            this.questClaimAvailable = !!claimAvailable;
            rewardDisplay?.classList.toggle('quest-first-claim-highlight', !!firstClaimHighlight);
            this.updateHudAttentionIndicators({ questAvailable: !!claimAvailable });
        };

        if (!taskDisplay || !rewardDisplay) {
            // Logger.warn('[UIManager] Quest UI elements missing');
            this.questClaimAvailable = false;
            this.updateHudAttentionIndicators({ questAvailable: false });
            return;
        }

        this.pcQuestClaimHandler = null;

        const tutorial = this.game.tutorial;
        const tutorialStep = tutorial?.activeTutorial?.steps?.[tutorial.currentStepIndex];
        if (tutorialStep) {
            const targetCount = tutorialStep.count || 1;
            const currentCount = Math.min(targetCount, tutorial.progress?.count || 0);
            const existingBtn = taskDisplay.querySelector('.quest-claim-btn');
            if (existingBtn) existingBtn.remove();

            taskDisplay.style.display = 'flex';
            rewardDisplay.style.display = 'flex';
            taskTitle.textContent = `튜토리얼 · ${tutorial.activeTutorial.title}`;
            taskProgress.textContent = tutorial.getStepQuestText?.(tutorialStep) || tutorial.getStepInstruction?.(tutorialStep) || tutorialStep.instruction;
            rewardDisplay.classList.remove('quest-reward-claimable');
            syncQuestAttention(false, false);
            if (rewardIcon) rewardIcon.textContent = 'T';
            if (rewardTitle) rewardTitle.textContent = '진행 안내';
            const totalSteps = tutorial.activeTutorial.steps.length;
            const stepNumber = tutorial.currentStepIndex + 1;
            rewardText.textContent = targetCount > 1
                ? `단계 ${stepNumber}/${totalSteps} · 진행도 ${currentCount}/${targetCount}`
                : `단계 ${stepNumber}/${totalSteps} · 튜토리얼 완료 후 슬라임 퀘스트가 시작됩니다.`;
            rewardDisplay.onclick = null;
            this.refreshDesktopShortcutHints();
            return;
        }

        const isIntroPending = !p.questData.basicTrainingCompleted &&
            !p.questData.slimeQuestClaimed &&
            (p.questData.slimeKills || 0) === 0;
        if (isIntroPending) {
            taskDisplay.style.display = 'none';
            rewardDisplay.style.display = 'none';
            syncQuestAttention(false, false);
            this.refreshDesktopShortcutHints();
            return;
        }

        const legacyQuestIds = new Set([
            'quest_slime_10',
            'quest_slime_30',
            'quest_boss_king_slime',
            'quest_slime_repeat'
        ]);
        const hudQuest = this.game.quests?.getHudQuestView?.();
        if (hudQuest && !legacyQuestIds.has(hudQuest.questId)) {
            const existingBtn = taskDisplay.querySelector('.quest-claim-btn');
            if (existingBtn) existingBtn.remove();

            taskDisplay.style.display = 'flex';
            rewardDisplay.style.display = 'flex';
            taskTitle.textContent = hudQuest.chapterLabel
                ? `${hudQuest.chapterLabel} · ${hudQuest.title}`
                : hudQuest.title;
            taskProgress.textContent = hudQuest.objectiveText || hudQuest.description || hudQuest.title;
            rewardDisplay.classList.remove('quest-reward-claimable');
            syncQuestAttention(false, false);
            if (rewardIcon) rewardIcon.textContent = hudQuest.type === 'travel' ? '🗺️' : (hudQuest.bossRewardGuide ? '🏆' : '🎁');
            if (rewardTitle) rewardTitle.textContent = hudQuest.type === 'travel' ? '이동 안내' : '퀘스트 보상';
            rewardText.textContent = hudQuest.nextHint || hudQuest.rewardText || '퀘스트 진행 중';
            rewardDisplay.onclick = null;
            this.refreshDesktopShortcutHints();
            return;
        }

        // Determine Active Quest
        let currentQuest = null;
        if (!p.questData.slimeQuestClaimed) {
            // Quest 1: 10 Slimes (Wisdom +2)
            currentQuest = {
                id: 'slime_intro',
                title: "1. 슬라임 10마리 처치",
                task: `진행도: ${Math.min(10, p.questData.slimeKills)}/10`,
                reward: "지혜 스탯 +2",
                canClaim: p.questData.slimeKills >= 10,
                claimFn: () => this.claimSlimeReward(p)
            };
        } else if (!p.questData.slime30QuestClaimed) {
            // Quest 2: 30 Slimes (Vitality +3, Boss Spawn)
            // v0.00.82: Start from 10/30 (cumulative kills), target 30
            const count = p.questData.slimeKills || 0;
            currentQuest = {
                id: 'slime_boss_unlock',
                title: "2. 슬라임 30마리 처치 (강림)",
                task: `진행도: ${Math.min(30, count)}/30`,
                reward: "체력 스탯 +3, 대왕 슬라임 소환",
                canClaim: count >= 30,
                claimFn: () => this.claimSlime30Reward(p)
            };
        } else if ((p.questData.bossClearCount || 0) === 0 && !p.questData.bossQuestClaimed) {
            // Quest 3: First King Slime
            currentQuest = {
                id: 'king_slime_intro',
                title: "3. 대왕 슬라임 처치",
                task: `진행도: ${p.questData.bossKilled ? '1' : '0'}/1`,
                reward: "축복받은 무기 강화석 x3, 무기 강화석 x3",
                canClaim: false, // Auto-claimed on kill
                claimFn: null
            };
        } else {
            // v0.00.75: Repeatable loop logic integrated with above steps
            const mm = this.game.monsterManager;
            const bossFound = Array.from(mm?.monsters.values() || []).find(m => m.typeId === 'king_slime' && !m.isDead);

            if (bossFound) {
                // Quest 5: Boss Active (Repeatable)
                currentQuest = {
                    id: 'boss_repeat',
                    title: "5. 대왕 슬라임 처치 (반복)",
                    task: "진행도: 0/1",
                    reward: "축복받은 무기 강화석 x1",
                    canClaim: false,
                    claimFn: null
                };
            } else {
                // Quest 4: Progression (Repeatable Summon)
                // v0.00.83: Use individual persistent repeatable kills
                const count = p.questData.slimeRepeatKills || 0;
                currentQuest = {
                    id: 'slime_repeat',
                    title: "4. 슬라임 50마리 처치 (소환)",
                    task: `진행도: ${Math.min(50, count)}/50`,
                    reward: "대왕 슬라임 소환",
                    canClaim: count >= 50, // v0.00.77: Shared Summon
                    claimFn: () => {
                        if (this.game.monsterManager) {
                            this._requestQuestBossSummon(false);
                            p.questData.slimeRepeatKills = 0; // Reset individual count
                            this.game?.quests?.restoreFromLegacy?.(p.questData);
                            p.saveState(); // Ensure it marks as 0 in DB
                            this.updateQuestUI();
                        }
                    }
                };
            }
        }

        // Render OR Hide
        if (currentQuest) {
            taskDisplay.style.display = 'flex';
            rewardDisplay.style.display = 'flex';
            taskTitle.textContent = currentQuest.title;
            taskProgress.textContent = currentQuest.task;

            // Remove old claim button from task display
            const existingBtn = taskDisplay.querySelector('.quest-claim-btn');
            if (existingBtn) existingBtn.remove();

            // v0.29.22: 보상 수령 가능 시 보상 칸 전체를 클릭 가능한 버튼으로 변경
            if (currentQuest.canClaim) {
                rewardDisplay.classList.add('quest-reward-claimable');
                syncQuestAttention(true, currentQuest.id === 'slime_intro');
                if (rewardIcon) rewardIcon.textContent = '🎉';
                if (rewardTitle) rewardTitle.textContent = '보상 수령하기!';
                rewardText.textContent = this.isDesktopShortcutMode()
                    ? `클릭 또는 Q로 ${currentQuest.reward} 획득`
                    : `클릭하여 ${currentQuest.reward} 획득`;
                this.pcQuestClaimHandler = currentQuest.claimFn;

                // 클릭 이벤트 (중복 방지)
                rewardDisplay.onclick = (e) => {
                    e.stopPropagation();
                    currentQuest.claimFn();
                };
            } else {
                rewardDisplay.classList.remove('quest-reward-claimable');
                syncQuestAttention(false, false);
                if (rewardIcon) rewardIcon.textContent = '🎁';
                if (rewardTitle) rewardTitle.textContent = '퀘스트 보상';
                rewardText.textContent = currentQuest.reward;
                rewardDisplay.onclick = null;
            }
        } else {
            // All quests cleared
            taskDisplay.style.display = 'none';
            rewardDisplay.style.display = 'none';
            rewardDisplay.classList.remove('quest-reward-claimable');
            syncQuestAttention(false, false);
            rewardDisplay.onclick = null;
        }

        this.refreshDesktopShortcutHints();
    }

    renderQuestButtons(p) {

        const slimeQuest = document.getElementById('quest-slime');
        const bossQuest = document.getElementById('quest-boss');

        // Remove existing buttons first to avoid duplicates
        const existing = document.querySelectorAll('.quest-claim-btn');
        existing.forEach(b => b.remove());

        if (p.questData.slimeKills >= 10 && !p.questData.slimeQuestClaimed) {
            if (slimeQuest) {
                const btn = document.createElement('button');
                btn.textContent = '보상 받기';
                btn.className = 'quest-claim-btn';
                btn.onclick = (e) => {
                    e.stopPropagation();
                    this.claimSlimeReward(p);
                };
                slimeQuest.appendChild(btn);
            }
        }

        if (p.questData.bossKilled && !p.questData.bossQuestClaimed) {
            if (bossQuest) {
                const btn = document.createElement('button');
                btn.textContent = '보상 받기';
                btn.className = 'quest-claim-btn';
                btn.onclick = (e) => {
                    e.stopPropagation();
                    this.claimBossReward(p);
                };
                bossQuest.appendChild(btn);
            }
        }
    }

    claimSlimeReward(p) {
        p.questData.slimeQuestClaimed = true;
        const statInsightMessages = this.collectFirstStatInsightMessages(p, { wisdom: 2 });
        p.wisdom += 2; // v0.00.75: Wisdom directly +2
        p.updateDerivedStats();
        this.game?.quests?.restoreFromLegacy?.(p.questData);
        this.logSystemMessage('QUEST 완료: 슬라임 토벌 보상 지급 (지혜 +2)');
        this.logSystemMessage('✨ 이제 마나 회복이 보다 원활해집니다');
        this.showRewardModal("슬라임 처치 퀘스트 완료!", "보상: 지혜 스탯 2개를 획득했습니다!");
        this.updateQuestUI();
        this.updateStatusPopup();
        p.saveState();
        this.queueStatInsightMessages(statInsightMessages);
    }

    _requestQuestBossSummon(isFirstBoss = true) {
        const monsterManager = this.game?.monsterManager;
        if (!monsterManager || monsterManager.bossSpawned) return;
        if (isFirstBoss) {
            monsterManager.markFirstBossPending?.(true);
        }

        const net = monsterManager.net;
        if (net?.connected && !net.isHost) {
            net.requestBossSpawn({ isFirstBoss });
            return;
        }

        monsterManager._spawnBoss(isFirstBoss);
        if (isFirstBoss) {
            monsterManager.slimeKillCount = 0;
        }
    }

    claimSlime30Reward(p) {
        if (p.questData.slime30QuestClaimed) return;

        p.questData.slime30QuestClaimed = true;
        const alreadyClaimedIntroReward = !!p.questData.introSlime30RewardClaimed
            || !!p.questData.bossQuestClaimed
            || (p.questData.bossClearCount || 0) > 0;
        if (!alreadyClaimedIntroReward) {
            p.questData.introSlime30RewardClaimed = true;
            const statInsightMessages = this.collectFirstStatInsightMessages(p, { vitality: 3 });
            p.vitality += 3; // v0.00.75: Vitality directly +3
            p.updateDerivedStats();
            this.queueStatInsightMessages(statInsightMessages);
        }

        // Spawn Boss (ONLY if not already spawned by global system)
        if (this.game.monsterManager && !this.game.monsterManager.bossSpawned) {
            this._requestQuestBossSummon(true);
        }
        this.game?.quests?.restoreFromLegacy?.(p.questData);

        if (alreadyClaimedIntroReward) {
            this.logSystemMessage('QUEST 완료: 슬라임 30마리 토벌 진행 재개 (첫 체력 +3 보상은 이미 수령)');
            this.logSystemMessage('첫 대왕 슬라임이 다시 소환됩니다.');
            this.showRewardModal('슬라임 30마리 처치 퀘스트 완료!', '첫 체력 +3 보상은 이미 수령했습니다!<br>대왕 슬라임이 소환됩니다.');
        } else {
            this.logSystemMessage('QUEST 완료: 슬라임 30마리 토벌 보상 지급 (체력 +3)');
            this.logSystemMessage('🛡️ 전체 체력이 30 증가하고 방어력과 체력회복이 3 증가했습니다.');
            this.showRewardModal('슬라임 30마리 처치 퀘스트 완료!', '보상: 체력 스탯 3개를 획득했습니다! 대왕 슬라임이 소환됩니다.');
        }

        this.updateQuestUI();
        this.updateStatusPopup();
        p.saveState();
    }


    claimBossReward(p) {
        p.questData.bossQuestClaimed = true;
        p.addInventoryItem?.('blessed_weapon_upgrade_stone', 3, { markAsNew: false });
        p.addInventoryItem?.('weapon_upgrade_stone', 3, { markAsNew: false });
        this.game?.quests?.restoreFromLegacy?.(p.questData);
        this.logSystemMessage('QUEST 완료: 대왕 슬라임 토벌 보상 지급 (축복받은 무기 강화석 x3, 무기 강화석 x3)');
        this.showRewardModal("대왕 슬라임 처치 퀘스트 완료!", "보상: 축복받은 무기 강화석 3개와 무기 강화석 3개를 획득했습니다!");
        this.updateQuestUI();
        this.updateStatusPopup();
        this.updateInventory();
        p.saveState();
    }


    updatePlayerPortraits(spriteSheetCanvas) {
        if (!spriteSheetCanvas) return;

        // Target: Front facing frame (Row 1, Col 0 in the generated sheet)
        // From ResourceManager: targetW = 256, targetH = 256
        const targetW = 256;
        const targetH = 256;
        const rowIndex = 1; // Front
        const colIndex = 0; // First frame

        const portraitCanvas = document.createElement('canvas');
        portraitCanvas.width = targetW;
        portraitCanvas.height = targetH;
        const pCtx = portraitCanvas.getContext('2d');
        pCtx.imageSmoothingEnabled = false;
        pCtx.webkitImageSmoothingEnabled = false;
        pCtx.mozImageSmoothingEnabled = false;
        pCtx.msImageSmoothingEnabled = false;

        // Draw the specific frame from the master sheet
        pCtx.drawImage(
            spriteSheetCanvas,
            colIndex * targetW, rowIndex * targetH, targetW, targetH,
            0, 0, targetW, targetH
        );

        const portraitDataUrl = portraitCanvas.toDataURL('image/png');

        // Apply to both UI elements
        const portraitEls = document.querySelectorAll('.portrait, .status-portrait');
        portraitEls.forEach(el => {
            el.style.backgroundImage = `url(${portraitDataUrl})`;
            el.style.backgroundSize = '100% auto'; // Fill width, maintain ratio
            el.style.backgroundPosition = 'center 10%'; // Slight upward nudge for better head alignment
            el.style.backgroundRepeat = 'no-repeat';
            el.style.backgroundColor = 'transparent'; // Remove any fallback colors
        });
    }


    showRewardModal(title, message) {
        const modal = document.getElementById('reward-modal');
        const titleEl = document.getElementById('reward-title');
        const msgEl = document.getElementById('reward-message');
        const contentEl = modal?.querySelector('.confirm-modal-content');

        if (titleEl) titleEl.textContent = title;
        if (msgEl) {
            msgEl.innerHTML = message;
            msgEl.scrollTop = 0;
        }
        if (contentEl) contentEl.scrollTop = 0;
        if (modal) modal.classList.remove('hidden');
        this.isPaused = true;
        this.refreshDesktopShortcutHints();
    }

    // v0.29.22: 레벨업 이펙트 - 화면 플래시 + 플로팅 텍스트
    showLevelUpEffect(level) {
        // 1. 화면 플래시 이펙트
        const flash = document.getElementById('levelup-flash');
        if (flash) {
            flash.classList.remove('active');
            // Force reflow to restart animation
            void flash.offsetWidth;
            flash.classList.add('active');

            // 애니메이션 종료 후 클래스 제거
            setTimeout(() => {
                flash.classList.remove('active');
            }, 800);
        }

        // 2. 플레이어 머리 위 "LEVEL UP!" 플로팅 텍스트
        if (this.game && this.game.localPlayer) {
            const p = this.game.localPlayer;
            // 더 큰 플로팅 텍스트 추가
            this.game.addDamageText(
                p.x + p.width / 2,
                p.y - 30,
                ` LEVEL UP! Lv.${level} `,
                '#ffd700', // 황금색
                true, // isCrit = true로 큰 텍스트
                null
            );
        }
    }

    hideRewardModal() {
        const modal = document.getElementById('reward-modal');
        if (modal) modal.classList.add('hidden');
        this.isPaused = false;
        this.refreshDesktopShortcutHints();
    }

    setupInventoryInteractions() {
        const equipBtn = document.getElementById('inventory-action-equip');
        const unequipBtn = document.getElementById('inventory-action-unequip');
        const enhanceBtn = document.getElementById('inventory-action-enhance');
        const useBtn = document.getElementById('inventory-action-use');
        const rerollOptionBtn = document.getElementById('inventory-action-reroll-option');
        const dismantleBtn = document.getElementById('inventory-action-dismantle');
        const itemModal = document.getElementById('inventory-item-modal');
        const itemModalCloseBtn = document.getElementById('inventory-item-modal-close');

        const bindPress = (element, handler) => {
            if (!element) return;
            element.addEventListener('click', handler);
            element.addEventListener('touchstart', (e) => {
                e.preventDefault();
                handler(e);
            }, { passive: false });
        };

        bindPress(itemModalCloseBtn, () => {
            this.closeInventoryItemModal(true);
            this.updateInventory();
        });

        itemModal?.addEventListener('click', (e) => {
            if (e.target !== itemModal) return;
            this.closeInventoryItemModal(true);
            this.updateInventory();
        });

        bindPress(equipBtn, () => {
            const player = this.game.localPlayer;
            if (!player || this.selectedInventoryRef?.kind !== 'inventory') return;
            const result = player.equipWeaponFromInventory(this.selectedInventoryRef.index);
            if (!result.ok) {
                this.showGenericModal('장착 실패', result.message, null, null, { hideNo: true, yesText: '확인' });
                return;
            }
            this.selectedInventoryRef = { kind: 'equipment', slot: 'weapon' };
            this.logSystemMessage(`${result.weapon?.name || '무기'}을(를) 장착했습니다.`);
            this.updateInventory();
        });

        bindPress(unequipBtn, () => {
            const player = this.game.localPlayer;
            if (!player) return;
            const result = player.unequipWeapon();
            if (!result.ok) {
                this.showGenericModal('해제 실패', result.message, null, null, { hideNo: true, yesText: '확인' });
                return;
            }
            this.selectedInventoryRef = result.slotIndex != null ? { kind: 'inventory', index: result.slotIndex } : null;
            this.logSystemMessage('무기를 해제했습니다.');
            this.updateInventory();
        });

        bindPress(enhanceBtn, () => {
            this.startWeaponEnhancementSelection('normal');
        });

        const blessedEnhanceBtn = document.getElementById('inventory-action-enhance-blessed');
        bindPress(blessedEnhanceBtn, () => {
            this.startWeaponEnhancementSelection('blessed');
        });

        bindPress(useBtn, async () => {
            const player = this.game.localPlayer;
            if (!player || this.selectedInventoryRef?.kind !== 'inventory') return;
            const result = await player.useBossSummonScroll?.(this.selectedInventoryRef);
            if (!result?.ok) {
                this.showGenericModal('보스 소환 실패', result?.message || '보스 소환주문서를 사용할 수 없습니다.', null, null, { hideNo: true, yesText: '확인' });
                this.updateInventory();
                return;
            }
            this.logSystemMessage(`📜 ${result.message}`);
            this.updateInventory();
        });

        bindPress(rerollOptionBtn, () => {
            const player = this.game.localPlayer;
            if (!player) return;

            const target = player.resolveWeaponSelection(this.selectedInventoryRef);
            if (!target?.item) {
                this.showGenericModal('옵션 변경', '옵션을 변경할 무기를 선택해 주세요.', null, null, { hideNo: true, yesText: '확인' });
                return;
            }

            if ((player.getInventoryItemCount?.(OPTION_REROLL_STONE_ID) || 0) < 1) {
                this.showGenericModal('옵션 변경', '옵션 변경석이 부족합니다.', null, null, { hideNo: true, yesText: '확인' });
                return;
            }

            const enhancementLevel = Math.max(0, target.item.enhancementLevel || 0);
            this.showConfirm(
                `${target.item.name}의 옵션을 변경할까요?<br><small>강화 수치 +${enhancementLevel}은 유지되고, 옵션 수치는 기존보다 낮아지지 않습니다.</small>`,
                (confirmed) => {
                    if (!confirmed) return;

                    const result = player.rerollWeaponOptions(this.selectedInventoryRef, { deferUiRefresh: true });
                    if (!result.ok) {
                        this.showGenericModal('옵션 변경 실패', result.message, null, null, { hideNo: true, yesText: '확인' });
                        this.updateInventory();
                        return;
                    }

                    const changedLines = Object.entries(result.rolledValues || {})
                        .map(([key, value]) => {
                            const before = Number(result.previousValues?.[key] || 0);
                            const after = Number(value || 0);
                            const delta = Math.round((after - before) * 100);
                            return `${key}: ${Math.round(before * 100)}% → ${Math.round(after * 100)}%${delta > 0 ? ` (+${delta}%)` : ''}`;
                        })
                        .join('\n');

                    this.showGenericModal(
                        '옵션 변경 완료',
                        `${result.item.name}의 옵션을 다시 조율했습니다.\n${changedLines}`,
                        null,
                        null,
                        { hideNo: true, yesText: '확인' }
                    );
                    this.logSystemMessage(`💠 ${result.item.name} 옵션 변경 완료`);
                    this.updateStatusPopup();
                    this.updateInventory();
                }
            );
        });

        bindPress(dismantleBtn, () => {
            const player = this.game.localPlayer;
            if (!player) return;

            const target = player.resolveWeaponSelection(this.selectedInventoryRef);
            if (!target?.item) {
                this.showGenericModal('분해', '분해할 무기를 선택해 주세요.', null, null, { hideNo: true, yesText: '확인' });
                return;
            }

            const rewardInfo = player.getWeaponDismantleRewardInfo?.(target.item);
            if (!rewardInfo) {
                this.showGenericModal('분해', '이 무기는 분해할 수 없습니다.', null, null, { hideNo: true, yesText: '확인' });
                return;
            }

            this.showConfirm(
                `${target.item.name}을(를) 분해하시겠습니까?<br><small>분해 시 무기 강화석 ${rewardInfo.displayText}를 획득합니다.</small>`,
                (confirmed) => {
                    if (!confirmed) return;

                    const result = player.dismantleWeapon(this.selectedInventoryRef);
                    if (!result.ok) {
                        this.showGenericModal('분해 실패', result.message, null, null, { hideNo: true, yesText: '확인' });
                        return;
                    }

                    this.selectedInventoryRef = null;
                    this.closeInventoryItemModal(true);
                    this.showGenericModal(
                        '분해 완료',
                        `${result.itemName}을(를) 분해해 무기 강화석 ${result.rewardAmount}개를 획득했습니다.`,
                        null,
                        null,
                        { hideNo: true, yesText: '확인' }
                    );
                    this.logSystemMessage(`🛠️ ${result.itemName} 분해: 무기 강화석 ${result.rewardAmount}개 획득`);
                    this.updateInventory();
                }
            );
        });
    }

    ensurePartyPanelControls() {
        document.querySelectorAll('#party-panel').forEach((panel) => {
            const header = panel.querySelector('.panel-header');
            if (!header) return;

            let controls = header.querySelector('.party-panel-controls');
            if (!controls) {
                controls = document.createElement('div');
                controls.className = 'party-panel-controls';
                header.appendChild(controls);
            }

            let minimizeBtn = controls.querySelector('.party-panel-toggle-btn');
            if (!minimizeBtn) {
                minimizeBtn = document.createElement('button');
                minimizeBtn.type = 'button';
                minimizeBtn.className = 'party-panel-toggle-btn';
                minimizeBtn.dataset.noDrag = 'true';
                minimizeBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.togglePartyPanelMinimized();
                });
                controls.appendChild(minimizeBtn);
            }

            const leaveBtn = header.querySelector('.party-leave-btn');
            if (leaveBtn && leaveBtn.parentElement !== controls) {
                controls.appendChild(leaveBtn);
            }

            this.syncPartyPanelMinimizedState(panel);
        });
    }

    syncPartyPanelMinimizedState(panel = document.getElementById('party-panel')) {
        if (!panel) return;

        const isMinimized = !!this.partyPanelUiState?.minimized;
        panel.classList.toggle('is-minimized', isMinimized);

        const minimizeBtn = panel.querySelector('.party-panel-toggle-btn');
        if (minimizeBtn) {
            const label = isMinimized ? '복구' : '최소화';
            minimizeBtn.textContent = isMinimized ? '□' : '−';
            minimizeBtn.title = `파티 창 ${label}`;
            minimizeBtn.setAttribute('aria-label', `파티 창 ${label}`);
        }

        const hasCustomPosition = !!panel.style.getPropertyValue('left') || !!panel.style.getPropertyValue('top');
        const hasManagedLayout = panel.dataset.uiLayoutEditable === 'true'
            || !!this.getStoredUiLayoutModeEntries(this.getResolvedUiLayoutSource(), this.getUiLayoutMode())?.['party-panel'];
        if (hasCustomPosition && !hasManagedLayout) {
            this.clampFloatingPanelToViewport(panel);
        }
    }

    applyPartyPanelUiLayout(panel = document.getElementById('party-panel')) {
        if (!panel || panel.classList.contains('hidden')) return false;

        const mode = this.getUiLayoutMode();
        const source = this.getResolvedUiLayoutSource();
        const storedEntries = this.getStoredUiLayoutModeEntries(source, mode);
        const storedEntry = storedEntries?.['party-panel'];
        if (!this.uiLayoutEditMode && !storedEntry) return false;

        const entry = this.uiLayoutEditMode
            ? this.getUiLayoutModeEntries(source, mode)?.['party-panel']
            : storedEntry;
        if (!entry) return false;

        this.applyUiLayoutControl('party-panel', entry);
        return true;
    }

    togglePartyPanelMinimized(force) {
        const nextMinimized = typeof force === 'boolean'
            ? force
            : !this.partyPanelUiState?.minimized;

        this.partyPanelUiState = {
            ...(this.partyPanelUiState || {}),
            minimized: !!nextMinimized
        };

        document.querySelectorAll('#party-panel').forEach((panel) => {
            this.syncPartyPanelMinimizedState(panel);
        });
    }

    clampFloatingPanelToViewport(panel) {
        if (!panel?.isConnected || panel.classList.contains('hidden')) return;

        const rect = panel.getBoundingClientRect();
        const clamped = this.clampFloatingPanelPosition(rect.left, rect.top, rect.width, rect.height);
        const preserveTransform = panel.dataset.preserveFloatingTransform === 'true';
        const computedStyle = window.getComputedStyle(panel);
        const activeTransform = panel.style.transform || (computedStyle.transform !== 'none' ? computedStyle.transform : '');
        const activeTransformOrigin = panel.style.transformOrigin || computedStyle.transformOrigin || 'top left';
        panel.style.setProperty('position', 'fixed', 'important');
        panel.style.setProperty('left', `${clamped.left}px`, 'important');
        panel.style.setProperty('top', `${clamped.top}px`, 'important');
        panel.style.setProperty('right', 'auto', 'important');
        panel.style.setProperty('bottom', 'auto', 'important');
        if (preserveTransform) {
            if (activeTransform) {
                panel.style.setProperty('transform', activeTransform, 'important');
            } else {
                panel.style.removeProperty('transform');
            }
            panel.style.setProperty('transform-origin', activeTransformOrigin, 'important');
        } else {
            panel.style.setProperty('transform', 'none', 'important');
            panel.style.removeProperty('transform-origin');
        }
        panel.style.setProperty('margin', '0', 'important');
    }

    updatePartyUI() {
        const panel = document.getElementById('party-panel');
        const list = document.getElementById('party-list');
        if (!panel || !list) return;

        const p = this.game.localPlayer;
        if (!p || !p.party || p.party.members.length < 2) {
            panel.classList.add('hidden');
            return;
        }

        this.ensurePartyPanelControls();
        panel.classList.remove('hidden');
        list.innerHTML = '';

        p.party.members.forEach(uid => {
            let data = null;
            let isSelf = (uid === p.id);

            if (isSelf) {
                data = { name: p.name, hp: p.hp, maxHp: p.maxHp, mp: p.mp, maxMp: p.maxMp, level: p.level };
            } else {
                const sceneRemote = this.game.sceneManager?.currentScene?.remotePlayers?.get(uid)
                    || this.game.remotePlayers?.get?.(uid)
                    || null;
                const netRemote = this.game.net?.remotePlayers?.get(uid) || null;
                const rp = sceneRemote || netRemote;
                if (rp) {
                    const hp = Number.isFinite(sceneRemote?.hp)
                        ? sceneRemote.hp
                        : (Array.isArray(netRemote?.h) ? netRemote.h[0] : 100);
                    const maxHp = Number.isFinite(sceneRemote?.maxHp)
                        ? sceneRemote.maxHp
                        : (Array.isArray(netRemote?.h) ? netRemote.h[1] : 100);
                    data = {
                        name: rp.name,
                        hp,
                        maxHp,
                        mp: 0, // MP not synced yet
                        maxMp: 100,
                        level: rp.level || 1
                    };
                }
            }

            if (data) {
                const row = document.createElement('div');
                row.className = 'party-row';
                const hpPerc = Math.floor((data.hp / data.maxHp) * 100);

                row.innerHTML = `
                    <div class="party-name">${data.name} (Lv.${data.level})</div>
                    <div class="party-bars">
                        <div class="party-hp"><div class="fill" style="width:${hpPerc}%"></div></div>
                    </div>
                `;
                list.appendChild(row);
            }
        });

        this.syncPartyPanelMinimizedState(panel);
        this.applyPartyPanelUiLayout(panel);
    }

    isInventorySelection(ref, kind, value) {
        if (!ref || ref.kind !== kind) return false;
        if (kind === 'inventory') return ref.index === value;
        return ref.slot === value;
    }

    resolveInventoryItemRef(player, ref) {
        if (!player || !ref) return null;
        if (ref.kind === 'inventory') {
            const item = player.inventory[ref.index];
            return item ? { location: 'inventory', index: ref.index, item } : null;
        }
        if (ref.kind === 'equipment') {
            const item = player.getEquippedWeapon?.();
            return item ? { location: 'equipment', slot: ref.slot || 'weapon', item } : null;
        }
        return null;
    }

    resolveSelectedInventoryItem(player) {
        return this.resolveInventoryItemRef(player, this.selectedInventoryRef);
    }

    createInventoryIconElement(item, className = 'item-icon') {
        const iconEl = document.createElement(item?.iconPath ? 'img' : 'span');
        iconEl.className = className;
        if ((item?.type || item?.id) === 'blessed_weapon_upgrade_stone') {
            iconEl.classList.add('item-icon-blessed-stone');
        }
        if (item?.iconPath) {
            iconEl.src = item.iconPath;
            iconEl.alt = item.name || item.type || 'item';
        } else {
            iconEl.textContent = item?.icon || '';
        }
        return iconEl;
    }

    createInventoryAlertDotElement() {
        const dot = document.createElement('span');
        dot.className = 'inventory-item-alert-dot';
        dot.setAttribute('aria-hidden', 'true');
        return dot;
    }

    positionInventoryItemModal() {
        const modal = document.getElementById('inventory-item-modal');
        const card = modal?.querySelector('.inventory-item-modal-card');
        const popup = document.getElementById('inventory-popup');
        const anchor = this.getInventoryEnhancementTargetElement(this.selectedInventoryRef);
        const useBottomSheet = window.matchMedia('(max-width: 1024px) and (orientation: portrait)').matches;

        if (!modal || !card) return;

        if (modal.classList.contains('hidden') || useBottomSheet || !popup || !anchor) {
            modal.style.removeProperty('--inventory-modal-left');
            modal.style.removeProperty('--inventory-modal-top');
            return;
        }

        const popupRect = popup.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const margin = 8;
        const gap = 12;
        const availableRight = popupRect.right - anchorRect.right;
        const availableLeft = anchorRect.left - popupRect.left;
        const maxLeft = Math.max(margin, viewportW - cardRect.width - margin);
        const maxTop = Math.max(margin, viewportH - cardRect.height - margin);

        let left = anchorRect.right + gap;
        if (availableRight < (cardRect.width + gap) && availableLeft >= (cardRect.width + gap)) {
            left = anchorRect.left - cardRect.width - gap;
        }

        let top = anchorRect.top + ((anchorRect.height - cardRect.height) / 2);
        left = Math.min(maxLeft, Math.max(margin, left));
        top = Math.min(maxTop, Math.max(margin, top));

        modal.style.setProperty('--inventory-modal-left', `${Math.round(left)}px`);
        modal.style.setProperty('--inventory-modal-top', `${Math.round(top)}px`);
    }

    getSkillDetailAnchorElement(skillId = this.activeSkillDetailId) {
        if (!skillId) return null;
        const skillPopup = document.getElementById('skill-popup');
        if (skillPopup?.classList.contains('hidden')) return null;
        return skillPopup?.querySelector(`.skill-item[data-skill-item="${skillId}"]`)
            || document.getElementById(`skill-item-${skillId}`);
    }

    positionSkillDetailModal(skillId = this.activeSkillDetailId) {
        const modal = document.getElementById('skill-detail-modal');
        const content = modal?.querySelector('.skill-detail-modal-content');
        const anchor = this.getSkillDetailAnchorElement(skillId);
        const useBottomSheet = window.matchMedia('(max-width: 1024px) and (orientation: portrait)').matches;

        if (!modal || !content) return;

        if (modal.classList.contains('hidden') || useBottomSheet || !anchor) {
            modal.style.removeProperty('--skill-detail-left');
            modal.style.removeProperty('--skill-detail-top');
            return;
        }

        const modalRect = modal.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        const margin = 12;
        const gap = 12;
        const availableRight = modalRect.right - anchorRect.right;
        const availableLeft = anchorRect.left - modalRect.left;
        const maxLeft = Math.max(margin, modalRect.width - contentRect.width - margin);
        const maxTop = Math.max(margin, modalRect.height - contentRect.height - margin);

        let left = anchorRect.right - modalRect.left + gap;
        if (availableRight < (contentRect.width + gap) && availableLeft >= (contentRect.width + gap)) {
            left = anchorRect.left - modalRect.left - contentRect.width - gap;
        }

        let top = anchorRect.top - modalRect.top + ((anchorRect.height - contentRect.height) / 2);
        left = Math.min(maxLeft, Math.max(margin, left));
        top = Math.min(maxTop, Math.max(margin, top));

        modal.style.setProperty('--skill-detail-left', `${Math.round(left)}px`);
        modal.style.setProperty('--skill-detail-top', `${Math.round(top)}px`);
    }

    openInventoryItemModal(ref) {
        const modal = document.getElementById('inventory-item-modal');
        if (!modal || !ref) return;
        this.selectedInventoryRef = ref;
        const player = this.game.localPlayer;
        const detail = this.resolveInventoryItemRef(player, ref);
        if (detail?.item && player?.markInventoryItemAsSeen?.(detail.item)) {
            player.saveState(false, { reason: 'inventory_item_inspected' });
            this.updateHudAttentionIndicators({ inventoryAvailable: !!player.hasUnreadInventoryWeapon?.() });
        }
        modal.classList.remove('hidden');
        this.updateInventory();
    }

    closeInventoryItemModal(clearSelection = false) {
        const modal = document.getElementById('inventory-item-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.removeProperty('--inventory-modal-left');
            modal.style.removeProperty('--inventory-modal-top');
        }
        if (clearSelection) this.selectedInventoryRef = null;
        this.refreshDesktopShortcutHints();
    }

    buildInventoryMetaLines(definition, options = {}) {
        const meta = definition?.inventoryTooltip || null;
        if (!meta) return [];

        const lines = [];
        const className = meta.className || meta.classLabel || meta.class || '';
        const tradeable = meta.tradeable;
        const dismantleable = options.canDismantle ?? meta.dismantleable;

        if (className) lines.push(`클래스 : [${className}]`);
        if (meta.material) lines.push(`재질 : ${meta.material}`);
        if (meta.weight != null && meta.weight !== '') lines.push(`무게 : ${meta.weight}`);
        if (tradeable === false) lines.push('교환불가');
        if (tradeable === true) lines.push('교환가능');
        if (dismantleable === true) lines.push('분해가능');
        if (dismantleable === false) lines.push('분해불가');

        return lines;
    }

    getInventoryItemIdentity(item) {
        if (!item) return null;
        return {
            instanceId: item.instanceId || null,
            type: item.type || item.id || null,
            slot: item.slot || null,
            enhancementLevel: item.enhancementLevel || 0,
            amount: Math.max(1, item.amount || 1)
        };
    }

    findInventoryIndexByIdentity(player, identity) {
        if (!player || !identity) return -1;

        if (identity.instanceId) {
            return player.inventory.findIndex((item, index) => index > 0 && item?.instanceId === identity.instanceId);
        }

        return player.inventory.findIndex((item, index) => index > 0
            && !!item
            && (item.type || item.id) === identity.type
            && (item.slot || null) === (identity.slot || null)
            && (item.enhancementLevel || 0) === (identity.enhancementLevel || 0)
            && Math.max(1, item.amount || 1) === Math.max(1, identity.amount || 1));
    }

    clearInventoryDragVisualState() {
        document.querySelectorAll('#inventory-grid .grid-item.dragging, #inventory-grid .grid-item.drop-target').forEach((element) => {
            element.classList.remove('dragging', 'drop-target');
        });
    }

    tearDownInventoryDrag() {
        document.removeEventListener('pointermove', this.handleInventorySlotPointerMove);
        document.removeEventListener('pointerup', this.handleInventorySlotPointerUp);
        document.removeEventListener('pointercancel', this.handleInventorySlotPointerUp);

        const sourceElement = this.inventoryDragState?.sourceElement;
        const pointerId = this.inventoryDragState?.pointerId;
        if (sourceElement && pointerId != null) {
            try {
                sourceElement.releasePointerCapture?.(pointerId);
            } catch (_error) {
                // Pointer capture can already be released by the browser.
            }
        }

        this.clearInventoryDragVisualState();
        this.inventoryDragState = null;
    }

    getInventoryDropIndexFromPoint(clientX, clientY) {
        const target = document.elementFromPoint(clientX, clientY)?.closest?.('#inventory-grid .grid-item[data-inventory-index]');
        const dropIndex = Number.parseInt(target?.dataset?.inventoryIndex || '', 10);
        return Number.isInteger(dropIndex) ? dropIndex : null;
    }

    startInventorySlotDrag(event, index, button) {
        if (this.inventoryEnhancementAnimating) return;
        if (!button || !Number.isInteger(index) || index <= 0) return;
        if (event.button != null && event.button !== 0) return;

        this.tearDownInventoryDrag();
        this.inventoryDragState = {
            pointerId: event.pointerId,
            sourceIndex: index,
            sourceElement: button,
            startX: event.clientX,
            startY: event.clientY,
            pointerType: event.pointerType || 'mouse',
            dragThreshold: (event.pointerType || 'mouse') === 'touch' ? 18 : 10,
            dragActive: false,
            hoverIndex: index
        };

        button.setPointerCapture?.(event.pointerId);
        document.addEventListener('pointermove', this.handleInventorySlotPointerMove);
        document.addEventListener('pointerup', this.handleInventorySlotPointerUp);
        document.addEventListener('pointercancel', this.handleInventorySlotPointerUp);
    }

    handleInventorySlotPointerMove(event) {
        const state = this.inventoryDragState;
        if (!state || event.pointerId !== state.pointerId) return;

        const movedX = event.clientX - state.startX;
        const movedY = event.clientY - state.startY;
        if (!state.dragActive && Math.hypot(movedX, movedY) < (state.dragThreshold || 10)) return;

        if (!state.dragActive) {
            state.dragActive = true;
            this.inventoryClickSuppressUntil = performance.now() + 180;
        }

        const hoverIndex = this.getInventoryDropIndexFromPoint(event.clientX, event.clientY);
        state.hoverIndex = Number.isInteger(hoverIndex) ? hoverIndex : state.sourceIndex;

        this.clearInventoryDragVisualState();
        state.sourceElement?.classList.add('dragging');

        if (Number.isInteger(hoverIndex) && hoverIndex !== state.sourceIndex) {
            document.querySelector(`#inventory-grid .grid-item[data-inventory-index="${hoverIndex}"]`)?.classList.add('drop-target');
        }

        event.preventDefault();
    }

    handleInventorySlotPointerUp(event) {
        const state = this.inventoryDragState;
        if (!state || event.pointerId !== state.pointerId) return;

        const wasDragging = state.dragActive;
        const dropIndex = wasDragging
            ? (this.getInventoryDropIndexFromPoint(event.clientX, event.clientY) ?? state.hoverIndex)
            : null;

        this.tearDownInventoryDrag();
        if (!wasDragging) return;

        this.inventoryClickSuppressUntil = performance.now() + 220;

        const player = this.game.localPlayer;
        if (!player || !Number.isInteger(dropIndex) || dropIndex <= 0 || dropIndex === state.sourceIndex) return;

        const selectedIdentity = this.selectedInventoryRef?.kind === 'inventory'
            ? this.getInventoryItemIdentity(player.inventory[this.selectedInventoryRef.index])
            : null;
        const moveResult = player.moveInventoryItem(state.sourceIndex, dropIndex);
        if (!moveResult.ok) return;

        if (selectedIdentity) {
            const remappedIndex = this.findInventoryIndexByIdentity(player, selectedIdentity);
            if (remappedIndex > 0) {
                this.selectedInventoryRef = { kind: 'inventory', index: remappedIndex };
            } else {
                this.selectedInventoryRef = null;
            }
        }

        player.saveState();
        this.updateInventory();
    }

    buildInventoryDetail(player, item) {
        const itemData = this.game.itemData;
        const definition = typeof itemData?.getEffectiveItemDefinition === 'function'
            ? itemData.getEffectiveItemDefinition(item)
            : (itemData?.getItemDefinition(item.type) || null);
        const affix = typeof itemData?.getEffectiveAffixDefinition === 'function'
            ? itemData.getEffectiveAffixDefinition(item)
            : (itemData?.getAffixDefinition(item.prefixId) || null);
        const lines = [];
        const titleBase = item.name || definition?.name || item.type;
        const enhancementLevel = Math.max(0, item.enhancementLevel || 0);
        const amount = Math.max(1, item.amount || 1);
        const config = item.slot === 'weapon' ? itemData?.getEnhancementConfig(item) : null;
        const dismantleReward = item.slot === 'weapon' ? player.getWeaponDismantleRewardInfo?.(item) : null;
        const baseDescription = item.description || definition?.description || '';
        const enhanceHint = config
            ? `다음 +${config.nextLevel} | 성공 ${Math.round(config.successRate * 100)}%${config.destroyChanceOnFail > 0 ? ` | 파괴 ${Math.round(config.destroyChanceOnFail * 100)}%` : ' | 안전'}`
            : '';
        const dismantleHint = dismantleReward
            ? `분해 시 무기 강화석 ${dismantleReward.displayText} 획득`
            : '';

        if (item.stackable !== false && item.slot !== 'weapon') {
            const descriptionParts = [baseDescription];
            const bossSummonConfig = player.getBossSummonConfigForItem?.(item) || null;
            if (item.type === 'weapon_upgrade_stone') {
                descriptionParts.push('상세 보기의 버튼으로 강화할 무기를 선택해 일반 강화를 시도할 수 있습니다.');
            } else if (item.type === 'blessed_weapon_upgrade_stone') {
                descriptionParts.push('상세 보기의 버튼으로 축복 강화할 무기를 선택해 안전한 고급 강화를 시도할 수 있습니다.');
            } else if (item.type === OPTION_REROLL_STONE_ID) {
                descriptionParts.push('무기 상세 화면에서 옵션 변경을 눌러 사용할 수 있습니다. 강화 수치는 유지되고 옵션 수치만 기존보다 같거나 높게 재설정됩니다.');
            } else if (bossSummonConfig) {
                const cooldownText = player.formatItemCooldown?.(item.type) || '';
                const currentZoneId = this.game.zone?.currentZone?.id || player.currentZoneId || 'zone_1';
                descriptionParts.push('해당 보스가 등장하는 맵에서 사용하면 보스를 즉시 소환합니다. 소환된 보스는 퀘스트 보상 없이 일반 보스 보상만 지급합니다.');
                lines.push(`사용 가능 맵: ${bossSummonConfig.zoneId}`);
                lines.push(`재사용 대기시간: ${cooldownText || '사용 가능'}`);
                if (currentZoneId !== bossSummonConfig.zoneId) {
                    lines.push('현재 맵에서는 사용할 수 없습니다.');
                }
            }
            return {
                title: `${titleBase} [${amount}]`,
                subtitle: '',
                description: descriptionParts.filter(Boolean).join(' '),
                lines,
                enhanceHint: '',
                dismantleHint: ''
            };
        }

        if (item.slot === 'weapon') {
            const pushEnhancementBonusLine = (value) => {
                const roundedValue = Math.round((value || 0) * 100);
                if (roundedValue <= 0) return;
                lines.push({
                    text: `무기 강화 보너스 +${roundedValue}%`,
                    className: 'inventory-detail-enhance-bonus'
                });
            };
            const attackBonus = (item.baseStats?.attackPower || definition?.baseStats?.attackPower || 0)
                + ((item.enhancementLevel || 0) * (item.enhancementBonuses?.attackPowerPerLevel || definition?.enhancementBonuses?.attackPowerPerLevel || 0));
            const critBonus = (item.baseStats?.critRate || definition?.baseStats?.critRate || 0)
                + ((item.enhancementLevel || 0) * (item.enhancementBonuses?.critRatePerLevel || definition?.enhancementBonuses?.critRatePerLevel || 0));
            const mpRegenBonus = item.baseStats?.mpRegen || definition?.baseStats?.mpRegen || 0;

            lines.push(`공격력 +${attackBonus}`);
            lines.push(`치명타 확률 +${Math.round(critBonus * 100)}%`);
            lines.push(`마나 회복력 +${mpRegenBonus}`);

            const skillOverrides = affix?.skillOverrides || {};
            const rolledValues = item.rolledValues || {};
            if (skillOverrides.missileVisualVariant || rolledValues.missileDamageBonus || rolledValues.missileManaCostReduction) {
                lines.push(`별빛 매직 미사일 피해 +${Math.round((player.getWeaponAffixEffectiveValue?.(item, 'missileDamageBonus')
                    ?? (rolledValues.missileDamageBonus || 0)) * 100)}%`);
                pushEnhancementBonusLine(player.getWeaponAffixEnhancementBonus?.(item, 'missileDamageBonus') || 0);
                lines.push(`매직 미사일 마나 소모 -${Math.round((player.getWeaponAffixEffectiveValue?.(item, 'missileManaCostReduction')
                    ?? (rolledValues.missileManaCostReduction || 0)) * 100)}%`);
                pushEnhancementBonusLine(player.getWeaponAffixEnhancementBonus?.(item, 'missileManaCostReduction') || 0);
            } else if (skillOverrides.fireballVisualVariant || rolledValues.fireballChainChance || rolledValues.fireballChainDamageRatio) {
                const chainChance = Math.round((player.getWeaponAffixEffectiveValue?.(item, 'fireballChainChance')
                    ?? (rolledValues.fireballChainChance ?? rolledValues.fireballDamageBonus ?? 0)) * 100);
                const chainDamage = Math.round((player.getWeaponAffixEffectiveValue?.(item, 'fireballChainDamageRatio')
                    ?? (rolledValues.fireballChainDamageRatio ?? rolledValues.fireExplosionDamageRatio ?? 0)) * 100);
                lines.push(`푸른 파이어볼 연속 폭발 확률 +${chainChance}%`);
                pushEnhancementBonusLine(player.getWeaponAffixEnhancementBonus?.(item, 'fireballChainChance') || 0);
                lines.push(`연속 폭발 데미지 +${chainDamage}%`);
                pushEnhancementBonusLine(player.getWeaponAffixEnhancementBonus?.(item, 'fireballChainDamageRatio') || 0);
                lines.push('파이어볼이 0.3초 뒤 같은 위치에서 다시 폭발');
            } else if (skillOverrides.laserVisualVariant || rolledValues.laserDamageBonus || rolledValues.attackSpeedBonus) {
                lines.push(`붉은 전격 피해 +${Math.round((player.getWeaponAffixEffectiveValue?.(item, 'laserDamageBonus')
                    ?? (rolledValues.laserDamageBonus || 0)) * 100)}%`);
                pushEnhancementBonusLine(player.getWeaponAffixEnhancementBonus?.(item, 'laserDamageBonus') || 0);
                lines.push(`공격속도 +${Math.round((player.getWeaponAffixEffectiveValue?.(item, 'attackSpeedBonus')
                    ?? (rolledValues.attackSpeedBonus || 0)) * 100)}%`);
                pushEnhancementBonusLine(player.getWeaponAffixEnhancementBonus?.(item, 'attackSpeedBonus') || 0);

                const hpRestore = player.getWeaponCombatHookValue?.(item, 'restoreHpPerLaserHit')
                    || affix?.combatHooks?.restoreHpPerLaserHit
                    || 0;
                if (hpRestore > 0) {
                    lines.push(`체인 라이트닝 적중 시 HP +${hpRestore} 회복`);
                }

                const hpRestoreThresholds = Object.entries(affix?.combatHooks?.restoreHpPerLaserHitByEnhancement || {})
                    .map(([level, value]) => [Number(level), Number(value)])
                    .filter(([level, value]) => Number.isFinite(level) && Number.isFinite(value))
                    .sort((a, b) => a[0] - b[0])
                    .map(([level, value]) => `+${level}강부터 HP +${value}`)
                    .join(' / ');
                if (hpRestoreThresholds) {
                    lines.push(`강화 단계 보너스: ${hpRestoreThresholds}`);
                }
            }

            lines.push(...this.buildInventoryMetaLines(definition, {
                canDismantle: definition?.inventoryTooltip?.dismantleable ?? !!dismantleReward
            }));
        }

        return {
            title: item.slot === 'weapon' && enhancementLevel > 0
                ? `+${enhancementLevel} ${titleBase}`
                : titleBase,
            subtitle: '',
            description: '',
            lines,
            enhanceHint,
            dismantleHint
        };
    }

    applyInventoryEnhancementVisual(button, item, badgeEl = null) {
        if (!button || !item || item.slot !== 'weapon') return;

        const visualStyle = this.game.itemData?.getEnhancementVisualStyle?.(item);
        if (!visualStyle) return;

        button.classList.add('enhancement-tier', visualStyle.cssClass);
        if (badgeEl) {
            badgeEl.classList.add(visualStyle.cssClass);
        }
    }

    updateInventory() {
        const p = this.game.localPlayer;
        if (!p) return;

        const pendingEnhancementMeta = this.getEnhancementStoneMeta();
        if (pendingEnhancementMeta && (p.getInventoryItemCount?.(pendingEnhancementMeta.stoneItemId) || 0) < 1) {
            this.pendingEnhancementStoneType = null;
        }
        const enhancementSelectionActive = this.isWeaponEnhancementSelectionActive();

        const grid = document.getElementById('inventory-grid');
        if (!grid) return;
        const selectedInventoryIdentity = this.selectedInventoryRef?.kind === 'inventory'
            ? this.getInventoryItemIdentity(p.inventory[this.selectedInventoryRef.index])
            : null;
        if (this.selectedInventoryRef?.kind === 'inventory' && !selectedInventoryIdentity) {
            this.selectedInventoryRef = null;
        }

        const normalizationResult = p.normalizeInventoryState();
        if (selectedInventoryIdentity) {
            const remappedIndex = this.findInventoryIndexByIdentity(p, selectedInventoryIdentity);
            if (remappedIndex > 0) {
                this.selectedInventoryRef = { kind: 'inventory', index: remappedIndex };
            } else {
                this.selectedInventoryRef = null;
            }
        }
        if (normalizationResult?.changed) {
            p.saveState();
        }
        this.updateHudAttentionIndicators({ inventoryAvailable: !!p.hasUnreadInventoryWeapon?.() });

        // Update Quest UI alongside Inventory
        this.updateQuestUI();
        const selected = this.resolveSelectedInventoryItem(p);
        if (this.selectedInventoryRef && !selected) {
            this.selectedInventoryRef = null;
            this.closeInventoryItemModal(true);
        }

        grid.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const compactNumber = (value) => {
            const amount = Math.max(0, Number(value) || 0);
            if (amount >= 1000000) return `${(amount / 1000000).toFixed(amount >= 10000000 ? 0 : 1)}M`;
            if (amount >= 1000) return `${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}K`;
            return `${amount}`;
        };

        const createUtilityLabel = (text, className = 'utility-slot-label') => {
            const label = document.createElement('span');
            label.className = className;
            label.textContent = text;
            return label;
        };
        const appendInventoryAlertDot = (button, item) => {
            if (!button || !p.shouldShowNewItemAlert?.(item)) return;
            button.appendChild(this.createInventoryAlertDotElement());
        };

        const manastoneSlot = document.createElement('button');
        manastoneSlot.type = 'button';
        manastoneSlot.className = 'grid-item utility-slot manastone-slot';
        manastoneSlot.setAttribute('aria-label', `마석 ${Math.max(0, p.manastone || 0).toLocaleString('ko-KR')}`);
        manastoneSlot.appendChild(createUtilityLabel('마석'));
        manastoneSlot.appendChild(this.createInventoryIconElement(p.inventory[0] || { icon: '💎', name: '마석' }));
        const manastoneAmount = document.createElement('span');
        manastoneAmount.className = 'utility-slot-meta';
        manastoneAmount.textContent = compactNumber(p.manastone || 0);
        manastoneSlot.appendChild(manastoneAmount);
        manastoneSlot.addEventListener('click', () => {
            this.showGenericModal('마석', `보유 마석: ${Math.max(0, p.manastone || 0).toLocaleString('ko-KR')}`, null, null, { hideNo: true, yesText: '확인' });
        });
        fragment.appendChild(manastoneSlot);

        const equippedWeapon = p.getEquippedWeapon?.();
        const equippedSlot = document.createElement('button');
        equippedSlot.type = 'button';
        equippedSlot.className = 'grid-item utility-slot equipped-weapon-slot';
        this.ensureInventoryFxLayer(equippedSlot);
        equippedSlot.classList.toggle('enhancement-selectable', enhancementSelectionActive && !!equippedWeapon);
        equippedSlot.setAttribute('aria-label', equippedWeapon ? `${equippedWeapon.name} 장착 중` : '장착 무기 없음');
        equippedSlot.appendChild(createUtilityLabel('착용'));
        if (this.isInventorySelection(this.selectedInventoryRef, 'equipment', 'weapon')) {
            equippedSlot.classList.add('selected');
        }
        if (equippedWeapon) {
            equippedSlot.classList.add('equipped');
            equippedSlot.appendChild(this.createInventoryIconElement(equippedWeapon));
            appendInventoryAlertDot(equippedSlot, equippedWeapon);
            this.applyInventoryEnhancementVisual(equippedSlot, equippedWeapon);
            equippedSlot.addEventListener('click', () => {
                if (this.inventoryEnhancementAnimating) return;
                if (this.isWeaponEnhancementSelectionActive()) {
                    this.executeWeaponEnhancementForSelection({ kind: 'equipment', slot: 'weapon' });
                    return;
                }
                this.openInventoryItemModal({ kind: 'equipment', slot: 'weapon' });
            });
        } else {
            const emptyLabel = document.createElement('span');
            emptyLabel.className = 'utility-slot-empty';
            emptyLabel.textContent = '무기';
            equippedSlot.appendChild(emptyLabel);
            equippedSlot.addEventListener('click', () => {
                if (this.isWeaponEnhancementSelectionActive()) return;
                this.closeInventoryItemModal(true);
                this.updateInventory();
            });
        }
        fragment.appendChild(equippedSlot);

        for (let index = 1; index < p.inventory.length; index++) {
            const item = p.inventory[index];
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'grid-item';
            button.dataset.inventoryIndex = `${index}`;
            this.ensureInventoryFxLayer(button);
            button.classList.toggle('enhancement-selectable', enhancementSelectionActive && item?.slot === 'weapon');
            button.classList.toggle('enhancement-stone-active', this.isActiveEnhancementStone(item));
            button.setAttribute('aria-label', item?.name || `빈 슬롯 ${index}`);
            if (this.isInventorySelection(this.selectedInventoryRef, 'inventory', index)) {
                button.classList.add('selected');
            }

            if (item) {
                if (item.type === 'blessed_weapon_upgrade_stone') {
                    button.classList.add('item-special-blessed-stone');
                }
                button.appendChild(this.createInventoryIconElement(item));

                if (item.stackable !== false) {
                    const amount = document.createElement('span');
                    amount.className = 'item-amount';
                    const cooldownText = p.getBossSummonConfigForItem?.(item)
                        ? (p.formatItemCooldown?.(item.type) || '')
                        : '';
                    amount.textContent = cooldownText || `${item.amount}`;
                    button.appendChild(amount);
                }

                if (item.slot === 'weapon') {
                    this.applyInventoryEnhancementVisual(button, item);
                }
                appendInventoryAlertDot(button, item);

                if (!enhancementSelectionActive) {
                    button.addEventListener('pointerdown', (event) => {
                        this.startInventorySlotDrag(event, index, button);
                    });
                }
            }

            button.addEventListener('click', () => {
                if (this.inventoryEnhancementAnimating) return;
                if (this.isWeaponEnhancementSelectionActive()) {
                    if (item?.type === 'weapon_upgrade_stone' || item?.type === 'blessed_weapon_upgrade_stone') {
                        this.clearWeaponEnhancementSelection();
                        return;
                    }
                    if (item?.slot === 'weapon') {
                        this.inventoryClickSuppressUntil = 0;
                        this.executeWeaponEnhancementForSelection({ kind: 'inventory', index });
                    }
                    return;
                }
                if (performance.now() < this.inventoryClickSuppressUntil) return;
                if (!item) {
                    this.closeInventoryItemModal(true);
                    this.updateInventory();
                    return;
                }
                this.openInventoryItemModal({ kind: 'inventory', index });
            });

            fragment.appendChild(button);
        }
        grid.appendChild(fragment);

        const countEl = document.getElementById('inventory-count-display');
        if (countEl) {
            const usedSlots = p.inventory.reduce((total, item, index) => {
                if (index === 0 || !item) return total;
                return total + 1;
            }, 0);
            const capacity = Math.max(0, p.inventory.length - 1);
            countEl.textContent = `${usedSlots}/${capacity}`;
        }

        const detailModal = document.getElementById('inventory-item-modal');
        const detail = this.resolveSelectedInventoryItem(p);
        if (!detail || !detail.item || detailModal?.classList.contains('hidden')) {
            if (!detail) this.closeInventoryItemModal(true);
            this.refreshDesktopShortcutHints();
            return;
        }

        const detailIconWrap = document.getElementById('inventory-detail-icon');
        if (detailIconWrap) {
            detailIconWrap.innerHTML = '';
            detailIconWrap.classList.remove('item-special-blessed-stone');
            detailIconWrap.classList.add('hidden');
        }

        const detailData = this.buildInventoryDetail(p, detail.item);
        const nameEl = document.getElementById('inventory-detail-name');
        const subtitleEl = document.getElementById('inventory-detail-subtitle');
        const descEl = document.getElementById('inventory-detail-desc');
        const statsEl = document.getElementById('inventory-detail-stats');
        const hintEl = document.getElementById('inventory-enhance-hint');
        const equipBtn = document.getElementById('inventory-action-equip');
        const unequipBtn = document.getElementById('inventory-action-unequip');
        const enhanceBtn = document.getElementById('inventory-action-enhance');
        const blessedEnhanceBtn = document.getElementById('inventory-action-enhance-blessed');
        const useBtn = document.getElementById('inventory-action-use');
        const rerollOptionBtn = document.getElementById('inventory-action-reroll-option');
        const dismantleBtn = document.getElementById('inventory-action-dismantle');
        const actionsEl = document.querySelector('#inventory-item-modal .inventory-detail-actions');
        const headActionsEl = document.getElementById('inventory-detail-head-actions');

        if (actionsEl && enhanceBtn && enhanceBtn.parentElement !== actionsEl) {
            actionsEl.appendChild(enhanceBtn);
        }
        if (actionsEl && blessedEnhanceBtn && blessedEnhanceBtn.parentElement !== actionsEl) {
            actionsEl.appendChild(blessedEnhanceBtn);
        }
        if (actionsEl && useBtn && useBtn.parentElement !== actionsEl) {
            actionsEl.appendChild(useBtn);
        }
        if (actionsEl && rerollOptionBtn && rerollOptionBtn.parentElement !== actionsEl) {
            actionsEl.appendChild(rerollOptionBtn);
        }
        if (headActionsEl) {
            headActionsEl.classList.add('hidden');
        }

        if (nameEl) nameEl.textContent = detailData.title;
        if (subtitleEl) {
            subtitleEl.textContent = detail.location === 'equipment'
                ? '장착 중'
                : detailData.subtitle;
            subtitleEl.classList.toggle('hidden', !subtitleEl.textContent);
        }
        if (descEl) {
            descEl.textContent = detailData.description || '';
            descEl.classList.toggle('hidden', !detailData.description);
        }

        if (statsEl) {
            statsEl.innerHTML = '';
            this.mergeInventoryEnhancementBonusLines(detailData.lines).forEach((line) => {
                statsEl.appendChild(this.createInventoryDetailStatLineElement(line));
            });
            statsEl.classList.toggle('hidden', detailData.lines.length === 0);
        }

        if (hintEl) {
            const hints = [];

            if (detail.item.slot === 'weapon') {
                if (detailData.enhanceHint) {
                    hints.push(detailData.enhanceHint);
                }
            }

            if (detailData.dismantleHint) {
                hints.push(detailData.dismantleHint);
            }

            hintEl.innerHTML = hints.join('<br>');
            hintEl.classList.toggle('hidden', hints.length === 0);
        }

        if (equipBtn) {
            equipBtn.classList.toggle('hidden', !(detail.location === 'inventory' && detail.item.slot === 'weapon'));
        }
        if (unequipBtn) {
            unequipBtn.classList.toggle('hidden', !(detail.location === 'equipment' && detail.item.slot === 'weapon'));
        }
        if (enhanceBtn) {
            enhanceBtn.classList.toggle('hidden', true);
        }
        if (blessedEnhanceBtn) {
            blessedEnhanceBtn.classList.toggle('hidden', true);
        }
        const bossSummonConfig = p.getBossSummonConfigForItem?.(detail.item) || null;
        if (useBtn) {
            const isBossSummonScroll = !!bossSummonConfig && detail.location === 'inventory';
            const remainingText = isBossSummonScroll ? p.formatItemCooldown?.(detail.item.type) : '';
            const currentZoneId = this.game.zone?.currentZone?.id || p.currentZoneId || 'zone_1';
            useBtn.classList.toggle('hidden', !isBossSummonScroll);
            useBtn.disabled = !!remainingText || (isBossSummonScroll && bossSummonConfig.zoneId !== currentZoneId);
            if (remainingText) {
                useBtn.textContent = `소환 대기 ${remainingText}`;
            } else if (isBossSummonScroll && bossSummonConfig.zoneId !== currentZoneId) {
                useBtn.textContent = '해당 맵 전용';
            } else {
                useBtn.textContent = '보스 소환';
            }
        }
        if (rerollOptionBtn) {
            rerollOptionBtn.classList.toggle('hidden', detail.item.slot !== 'weapon');
            const rerollStoneCount = p.getInventoryItemCount?.(OPTION_REROLL_STONE_ID) || 0;
            rerollOptionBtn.disabled = detail.item.slot === 'weapon' && rerollStoneCount < 1;
            rerollOptionBtn.textContent = rerollStoneCount > 0
                ? `옵션 변경 (${rerollStoneCount})`
                : '옵션 변경';
        }
        if (dismantleBtn) {
            dismantleBtn.classList.toggle('hidden', detail.item.slot !== 'weapon');
        }

        if (enhanceBtn) {
            enhanceBtn.textContent = detail.item.type === 'weapon_upgrade_stone'
                ? '강화할 무기 선택'
                : '강화';
            enhanceBtn.classList.toggle('hidden', detail.item.type !== 'weapon_upgrade_stone');
            if (detail.item.type === 'weapon_upgrade_stone') {
                enhanceBtn.textContent = '강화 대상 선택';
            }
        }
        if (blessedEnhanceBtn) {
            blessedEnhanceBtn.textContent = detail.item.type === 'blessed_weapon_upgrade_stone'
                ? '축복 강화할 무기 선택'
                : '축복 강화';
            blessedEnhanceBtn.classList.toggle('hidden', detail.item.type !== 'blessed_weapon_upgrade_stone');
            if (detail.item.type === 'blessed_weapon_upgrade_stone') {
                blessedEnhanceBtn.textContent = '축복 대상 선택';
            }
        }

        if (actionsEl) {
            const isEnhancementStone = detail.item.type === 'weapon_upgrade_stone'
                || detail.item.type === 'blessed_weapon_upgrade_stone';
            const isBossSummonScroll = !!bossSummonConfig;
            const isActionlessMaterial = detail.item.stackable !== false
                && detail.item.slot !== 'weapon'
                && !isEnhancementStone
                && !isBossSummonScroll;
            actionsEl.classList.toggle('inventory-detail-actions-centered', isEnhancementStone);
            actionsEl.classList.toggle('hidden', isEnhancementStone || isActionlessMaterial);
        }

        if (headActionsEl) {
            const headerActionBtn = detail.item.type === 'weapon_upgrade_stone'
                ? enhanceBtn
                : (detail.item.type === 'blessed_weapon_upgrade_stone' ? blessedEnhanceBtn : null);
            if (headerActionBtn) {
                headActionsEl.appendChild(headerActionBtn);
                headActionsEl.classList.remove('hidden');
            }
        }

        this.positionInventoryItemModal();
        this.refreshDesktopShortcutHints();
    }

    updateStats(hp, mp, level, expPerc) {
        const hpFill = this.getHudRef('hpFill', '.hp-fill');
        const mpFill = this.getHudRef('mpFill', '.mp-fill');
        const expFill = this.getHudRef('expFill', '.exp-fill');
        const levelEl = this.getHudRef('level', 'ui-level', 'id');

        const nextSnapshot = {
            hp: Number(hp).toFixed(2),
            mp: Number(mp).toFixed(2),
            exp: Number(expPerc).toFixed(2),
            level: String(level)
        };

        if (!this.lastHudSnapshot || this.lastHudSnapshot.hp !== nextSnapshot.hp) {
            if (hpFill) hpFill.style.width = `${hp}%`;
        }
        if (!this.lastHudSnapshot || this.lastHudSnapshot.mp !== nextSnapshot.mp) {
            if (mpFill) mpFill.style.width = `${mp}%`;
        }
        if (!this.lastHudSnapshot || this.lastHudSnapshot.exp !== nextSnapshot.exp) {
            if (expFill) expFill.style.width = `${expPerc}%`;
        }
        if (!this.lastHudSnapshot || this.lastHudSnapshot.level !== nextSnapshot.level) {
            if (levelEl) levelEl.textContent = level;
        }

        // Update bar text
        const p = this.game.localPlayer;
        if (p) {
            const hpc = this.getHudRef('hpCur', 'ui-hp-cur', 'id');
            const hpm = this.getHudRef('hpMax', 'ui-hp-max', 'id');
            const mpc = this.getHudRef('mpCur', 'ui-mp-cur', 'id');
            const mpm = this.getHudRef('mpMax', 'ui-mp-max', 'id');
            const nextHpCur = String(Math.floor(p.hp));
            const nextHpMax = String(p.maxHp);
            const nextMpCur = String(Math.floor(p.mp));
            const nextMpMax = String(p.maxMp);
            if (!this.lastHudSnapshot || this.lastHudSnapshot.hpCur !== nextHpCur) {
                if (hpc) hpc.textContent = nextHpCur;
            }
            if (!this.lastHudSnapshot || this.lastHudSnapshot.hpMax !== nextHpMax) {
                if (hpm) hpm.textContent = nextHpMax;
            }
            if (!this.lastHudSnapshot || this.lastHudSnapshot.mpCur !== nextMpCur) {
                if (mpc) mpc.textContent = nextMpCur;
            }
            if (!this.lastHudSnapshot || this.lastHudSnapshot.mpMax !== nextMpMax) {
                if (mpm) mpm.textContent = nextMpMax;
            }
            const nextAutoAttack = p.autoAttackEnabled ? '1' : '0';
            if (!this.lastHudSnapshot || this.lastHudSnapshot.autoAttack !== nextAutoAttack) {
                this.updateAutoAttackToggle(p.autoAttackEnabled);
            }
            nextSnapshot.hpCur = nextHpCur;
            nextSnapshot.hpMax = nextHpMax;
            nextSnapshot.mpCur = nextMpCur;
            nextSnapshot.mpMax = nextMpMax;
            nextSnapshot.autoAttack = nextAutoAttack;
        }

        this.lastHudSnapshot = nextSnapshot;
        this.game.recordUiTick?.('hud');

        const now = performance.now();
        const cooldownInterval = this.game.useAggressiveHudOptimization ? 120 : (this.game.isMobilePerformanceMode ? 80 : 40);
        if ((now - this.lastCooldownUiUpdate) >= cooldownInterval) {
            this.lastCooldownUiUpdate = now;
            this.updateCooldowns();
        }

        // v1.98: Live update developer overlay if active
        if (this.devMode && this.hasDeveloperAccess() && (now - this.lastDevOverlayUpdate) >= 250) {
            this.lastDevOverlayUpdate = now;
            this.updateDevOverlay();
        }
    }

    updateCooldowns() {
        const p = this.game.localPlayer;
        if (!p) return;

        // Cooldown keys: u, k, h, j
        const skillKeys = ['u', 'k', 'h', 'j'];
        skillKeys.forEach(key => {
            const { button: btn, overlay, timeText } = this.getCooldownRefs(key);
            if (!btn) return;

            const cdTime = p.skillCooldowns[key];
            const maxCd = p.skillMaxCooldowns[key];
            const nextDisabled = cdTime > 0;
            const nextText = cdTime > 0 ? cdTime.toFixed(1) : '';
            const numericOnlyCooldown = key === 'j';

            if (nextDisabled) {
                if (numericOnlyCooldown) {
                    if (overlay && overlay.dataset.cdAngle !== '0') {
                        overlay.style.setProperty('--cd-angle', '0deg');
                        overlay.dataset.cdAngle = '0';
                    }
                } else {
                    const angle = (cdTime / maxCd) * 360;
                    if (overlay && overlay.dataset.cdAngle !== `${angle}`) {
                        overlay.style.setProperty('--cd-angle', `${angle}deg`);
                        overlay.dataset.cdAngle = `${angle}`;
                    }
                }
                if (timeText && timeText.textContent !== nextText) timeText.textContent = nextText;
                if (!btn.classList.contains('disabled')) btn.classList.add('disabled');
            } else {
                if (overlay && overlay.dataset.cdAngle !== '0') {
                    overlay.style.setProperty('--cd-angle', '0deg');
                    overlay.dataset.cdAngle = '0';
                }
                if (timeText && timeText.textContent) timeText.textContent = '';
                if (btn.classList.contains('disabled')) btn.classList.remove('disabled');
            }
        });
    }

    buildMinimapStateSignature(player, remotePlayers, monsters, mapWidth, mapHeight, width, height, simpleMode) {
        let hash = 2166136261;
        const zoneId = this.game?.zone?.currentZone?.id || 'zone_1';
        const step = Math.max(
            10,
            Math.round(Math.max(mapWidth / Math.max(width, 1), mapHeight / Math.max(height, 1)) * (simpleMode ? 0.9 : 0.65))
        );
        const quantize = (value) => Math.round((Number(value) || 0) / step);
        const mix = (value) => {
            const normalized = Number.isFinite(value) ? Math.trunc(value) : 0;
            hash ^= normalized;
            hash = Math.imul(hash, 16777619);
            hash >>>= 0;
        };

        let remoteCount = 0;
        let aliveMonsterCount = 0;

        mix(width);
        mix(height);
        for (let index = 0; index < zoneId.length; index++) mix(zoneId.charCodeAt(index));
        mix(quantize(player?.x));
        mix(quantize(player?.y));

        if (remotePlayers?.forEach) {
            remotePlayers.forEach((rp) => {
                remoteCount++;
                mix(quantize(rp?.x));
                mix(quantize(rp?.y));
            });
        }

        if (monsters?.forEach) {
            monsters.forEach((m) => {
                if (!m || m.isDead) return;
                aliveMonsterCount++;
                mix(m.isBoss || m.typeId === 'king_slime' ? 11 : 5);
                mix(quantize(m.x));
                mix(quantize(m.y));
            });
        }

        mix(remoteCount);
        mix(aliveMonsterCount);

        return `${zoneId}:${width}x${height}:${step}:${remoteCount}:${aliveMonsterCount}:${hash.toString(36)}`;
    }

    updateMinimap(player, remotePlayers, monsters, mapWidth, mapHeight) {
        const canvas = this.minimapCanvas && this.minimapCanvas.isConnected
            ? this.minimapCanvas
            : document.getElementById('minimapCanvas');
        if (!canvas) return;

        const canvasChanged = this.minimapCanvas !== canvas;
        this.minimapCanvas = canvas;
        const ctx = this.minimapCtx || canvas.getContext('2d', { alpha: true }) || canvas.getContext('2d');
        if (!ctx) return;
        this.minimapCtx = ctx;
        const simpleMode = !!this.game.useAggressiveHudOptimization;
        const w = simpleMode ? 96 : 150;
        const h = simpleMode ? 96 : 150;
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        canvas.style.background = 'rgba(7, 11, 16, 0.3)';
        canvas.style.backgroundColor = 'rgba(7, 11, 16, 0.3)';
        ctx.imageSmoothingEnabled = false;

        // Update footer
        const posX = this.getHudRef('miniPosX', 'mini-pos-x', 'id');
        const posY = this.getHudRef('miniPosY', 'mini-pos-y', 'id');
        const nextPosX = String(Math.round(player.x));
        const nextPosY = String(Math.round(player.y));
        if (posX && posX.textContent !== nextPosX) posX.textContent = nextPosX;
        if (posY && posY.textContent !== nextPosY) posY.textContent = nextPosY;

        const signature = this.buildMinimapStateSignature(player, remotePlayers, monsters, mapWidth, mapHeight, w, h, simpleMode);
        if (!canvasChanged && this.lastMinimapSignature === signature) {
            return;
        }

        this.lastMinimapSignature = signature;

        // Clear Map and add a slightly dark transparent backdrop for readability.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(7, 11, 16, 0.3)';
        ctx.fillRect(0, 0, w, h);

        // Scaling factors
        const scaleX = w / mapWidth;
        const scaleY = h / mapHeight;
        const drawDot = (x, y, radius) => {
            if (simpleMode) {
                const size = Math.max(2, Math.round(radius * 2));
                ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
                return;
            }

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        };

        // 1. Draw Remote Players (White)
        ctx.fillStyle = '#ffffff';
        if (remotePlayers) {
            remotePlayers.forEach(rp => {
                const px = rp.x * scaleX;
                const py = rp.y * scaleY;
                drawDot(px, py, 3);
            });
        }

        // 2. Draw Monsters (Red)
        ctx.fillStyle = '#ff3f34';
        if (monsters) {
            monsters.forEach(m => {
                if (m.isDead) return;
                const mx = m.x * scaleX;
                const my = m.y * scaleY;
                const radius = (m.isBoss || m.typeId === 'king_slime')
                    ? 6
                    : 2;
                drawDot(mx, my, radius);
            });
        }

        // 3. Draw Local Player (Green - Last to be on top)
        ctx.fillStyle = '#4ade80';
        const px = player.x * scaleX;
        const py = player.y * scaleY;
        drawDot(px, py, 3);

        this.game.recordUiTick?.('minimap');
    }

    async sendMessage() {
        const input = document.querySelector('.chat-input-area input');
        const text = input ? input.value.trim() : "";
        if (!text || !this.game.net || !this.game.localPlayer) return;

        // v0.32.1: Clear input IMMEDIATELY to prevent double-submit from ghost clicks/touches on mobile
        if (input) input.value = '';

        // Command Parsing
        if (text.startsWith('/')) {
            // v0.00.14: Parse command and arguments robustly (handle multiple spaces)
            const parts = text.trim().split(/\s+/);
            const cmd = parts[0].toLowerCase();
            const param = parts[1]; // Get the first argument as name

            if (cmd === '/e') {
                if (!param) {
                    // v0.00.14: Logic to list hostile targets
                    const targets = this.game.localPlayer.hostileTargets;
                    if (targets.size === 0) {
                        this.logSystemMessage('현재 적대 중인 대상이 없습니다.');
                    } else {
                        const names = Array.from(targets.values()).map((entry) => entry?.name || 'Unknown').join(', ');
                        this.logSystemMessage(`현재 적대 대상: ${names}`);
                    }
                    input.value = '';
                    return;
                }
                const result = await this.game.localPlayer.declareHostility(param);
                if (result === 'DUEL_REQUESTED') {
                    this.logSystemMessage(`⚔️ ${param}님에게 결투를 신청했습니다.`);
                } else if (result === 'ALREADY_DUELING') {
                    this.logSystemMessage(`${param}님과 이미 결투 중입니다.`);
                } else if (result === 'ALREADY_HOSTILE') {
                    this.logSystemMessage(`${param}님과 이미 전투 가능한 상태입니다.`);
                } else if (result === 'DECLARED') {
                    this.logSystemMessage(`⚔️ ${param}님을 적대 대상으로 선포했습니다! (상호 적대 시 공격 가능)`);
                } else if (result === 'REMOVED') {
                    this.logSystemMessage(`🕊️ ${param}님과 적대 관계를 해제했습니다.`);
                } else if (result.startsWith('COOLDOWN:')) {
                    const time = result.split(':')[1];
                    this.logSystemMessage(`⚠️ 적대 해제는 선포 후 30초가 지나야 가능합니다. (남은 시간: ${time}초)`);
                } else if (result === 'NOT_FOUND') {
                    this.logSystemMessage(`해당 유저를 찾을 수 없습니다.`);
                } else if (result === 'SELF') {
                    this.logSystemMessage(`자기 자신을 적대할 수 없습니다.`);
                } else if (result === 'INVALID') {
                    this.logSystemMessage(`올바른 닉네임을 입력해주세요.`);
                } else if (result === 'ZONE_DISABLED') {
                    this.logSystemMessage('현재 필드에서는 결투를 신청할 수 없습니다.');
                } else {
                    this.logSystemMessage(`오류가 발생했습니다.`);
                }
                input.value = '';
                return;
            } else if (cmd === '/p') {
                if (!param) {
                    this.logSystemMessage('사용법: /p [아이디] (파티 초대)');
                    input.value = '';
                    return;
                }
                const result = await this.game.net.inviteToParty(param);
                if (result === 'SENT') {
                    this.showGenericModal(
                        '파티 초대',
                        `"${param}"님에게 파티를 초대했습니다.`,
                        null,
                        null,
                        { yesText: '확인', hideNo: true }
                    );
                }
                else if (result === 'ALREADY_IN_PARTY') this.logSystemMessage(`이미 같은 파티에 있는 유저입니다.`);
                else if (result === 'SELF') this.logSystemMessage(`🚫 자기 자신을 초대할 수 없습니다.`);
                else if (result === 'NOT_FOUND') this.logSystemMessage(`🚫 사용자를 찾을 수 없습니다: ${param}`);
                else this.logSystemMessage(`🚫 오류가 발생했습니다.`);

                input.value = '';
                return;
            }
        }

        // Send to Network as regular chat
        this.game.net.sendChat(text, this.game.localPlayer.name);
        input.value = '';
    }

    _getEmoteDefinition(emoteId) {
        if (!emoteId || !Array.isArray(this.game?.emotes)) return null;
        return this.game.emotes.find((emote) => emote?.id === emoteId) || null;
    }

    _resolveChatSenderName(uid, fallbackName = '') {
        if (typeof fallbackName === 'string' && fallbackName.trim()) {
            return fallbackName.trim();
        }
        if (uid && uid === this.game?.net?.playerId) {
            return this.game?.localPlayer?.name || 'Unknown';
        }

        const sceneRemote = this.game?.sceneManager?.currentScene?.remotePlayers?.get?.(uid) || null;
        const worldRemote = this.game?.remotePlayers?.get?.(uid) || null;
        const netRemote = this.game?.net?.remotePlayers?.get?.(uid) || null;
        const resolved = sceneRemote?.name || worldRemote?.name || netRemote?.name;
        return (typeof resolved === 'string' && resolved.trim()) ? resolved.trim() : 'Unknown';
    }

    _appendChatLogEntry({ uid = '', name = '', text = '', emoteId = null } = {}) {
        const msgArea = document.querySelector('.chat-messages');
        if (!msgArea) return;

        const isMe = uid === this.game?.net?.playerId;
        const div = document.createElement('div');
        div.className = isMe ? 'chat-msg-me' : 'chat-msg-other';

        const sender = document.createElement('span');
        sender.className = 'chat-sender';
        sender.textContent = `${this._resolveChatSenderName(uid, name)}:`;
        div.appendChild(sender);
        div.appendChild(document.createTextNode(' '));

        const content = document.createElement('span');
        content.className = 'chat-text';

        if (emoteId) {
            const emote = this._getEmoteDefinition(emoteId);
            if (emote?.icon) {
                const img = document.createElement('img');
                img.className = 'chat-inline-emote';
                img.src = emote.icon;
                img.alt = emote.id || 'emote';
                img.title = emote.id || 'emote';
                content.appendChild(img);
            } else {
                content.textContent = '(이모트)';
            }
        } else {
            content.textContent = text || '';
        }

        div.appendChild(content);
        msgArea.appendChild(div);

        while (msgArea.children.length > 50) {
            msgArea.removeChild(msgArea.firstChild);
        }
        msgArea.scrollTop = msgArea.scrollHeight;
    }

    _onChatReceived(data) {
        // v2.1: Emote Handling
        let isEmote = false;
        let emoteId = null;

        if (data.text.startsWith('/emote ')) {
            emoteId = data.text.split(' ')[1];
            isEmote = true;
        }

        this._appendChatLogEntry({
            uid: data.uid,
            name: data.name,
            text: data.text,
            emoteId: isEmote ? emoteId : null
        });

        // Trigger Speech Bubble or Emote on Character
        if (isEmote && emoteId) {
            if (data.uid === this.game.net.playerId) {
                if (this.game.localPlayer) this.game.localPlayer.showEmote(emoteId);
            } else {
                const rp = this.game.remotePlayers.get(data.uid);
                if (rp) rp.showEmote(emoteId);
            }
        } else {
            const bubbleText = `${data.name}: ${data.text}`;
            if (data.uid === this.game.net.playerId) {
                if (this.game.localPlayer) this.game.localPlayer.showSpeechBubble(bubbleText);
            } else {
                const rp = this.game.remotePlayers.get(data.uid);
                if (rp) rp.showSpeechBubble(bubbleText);
            }
        }
    }

    _onEmoteReceived(data) {
        if (!data?.uid || !data?.emoteId) return;
        this._appendChatLogEntry({
            uid: data.uid,
            name: data.name,
            emoteId: data.emoteId
        });
    }

    sanitizeSystemMessageText(text) {
        let normalized = typeof text === 'string' ? text : String(text ?? '');
        try {
            normalized = normalized.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '');
        } catch (error) {
            normalized = normalized.replace(/[\u2600-\u27BF\u{1F300}-\u{1FAFF}]/gu, '');
        }
        return normalized
            .replace(/\s{2,}/g, ' ')
            .replace(/\s+([!?.,:;])/g, '$1')
            .trim();
    }

    logSystemMessage(text) {
        const msgArea = document.querySelector('.chat-messages');
        const normalizedText = this.sanitizeSystemMessageText(text);
        if (msgArea && normalizedText) {
            const div = document.createElement('div');
            div.style.color = '#444444'; // Darker grey for better visibility
            div.style.fontWeight = 'bold';
            div.style.fontStyle = 'italic';
            div.textContent = `[System] ${normalizedText}`;
            msgArea.appendChild(div);

            // Limit history
            while (msgArea.children.length > 50) {
                msgArea.removeChild(msgArea.firstChild);
            }

            msgArea.scrollTop = msgArea.scrollHeight;
        }
    }

    toggleFullscreen() {
        if (!this.isFullscreenActive()) {
            this.landscapeFullscreenDismissed = false;
            this.pendingLandscapeFullscreen = false;
            this.enterFullscreen();
        } else {
            this.exitFullscreenMode();
        }
    }

    exitFullscreenMode() {
        this.pendingLandscapeFullscreen = false;
        this.landscapeFullscreenDismissed = true;
        this.clearTransientOrientationPreference();
        this.mobileOrientationPreference = this.getCurrentMobileOrientationPreference();

        const finalize = () => {
            screen.orientation?.unlock?.();
            this.syncMobileEnvironmentClasses();
            window.setTimeout(() => {
                this.syncOrientationLock();
                this.refreshUiLayoutForViewport();
            }, 60);
        };

        const exitRequest = document.exitFullscreen
            || document.webkitExitFullscreen
            || document.mozCancelFullScreen
            || document.msExitFullscreen;

        if (!this.isFullscreenActive() || !exitRequest) {
            finalize();
            return Promise.resolve(false);
        }

        try {
            const result = exitRequest.call(document);
            if (result && typeof result.then === 'function') {
                return result.then(() => {
                    finalize();
                    return true;
                }).catch(() => {
                    finalize();
                    return false;
                });
            }
        } catch (error) {
            Logger.warn('[UIManager] Failed to exit fullscreen', error);
        }

        finalize();
        return Promise.resolve(true);
    }

    toggleUpdateHistory() {
        if (this.uiLayoutEditMode) return;
        const modal = document.getElementById('history-modal');
        if (!modal) return;

        const isHidden = modal.classList.contains('hidden');
        if (isHidden) {
            this.renderHistory();
            modal.classList.remove('hidden');
            this.isPaused = true;
        } else {
            modal.classList.add('hidden');
            this.isPaused = false;
        }

        this.refreshDesktopShortcutHints();
    }

    async renderHistory() {
        const listEl = document.getElementById('history-list');
        if (!listEl) return;

        listEl.innerHTML = '<div class="readme-loading">README.md 불러오는 중...</div>';

        try {
            const v = window.GAME_VERSION || Date.now();
            const response = await fetch(`./README.md?v=${v}`, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`README fetch failed: ${response.status}`);
            }
            const text = await response.text();
            if (/^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) {
                throw new Error('README fetch returned HTML document instead of markdown');
            }
            const rendered = this.renderReadmeContent(text);
            if (rendered) {
                listEl.innerHTML = `<div class="readme-content">${rendered}</div>`;
                return;
            }
        } catch (e) {
            Logger.error('Failed to load README.md:', e);
        }

        // Fallback to updateHistory array if fetch fails or marked is missing
        if (this.game.updateHistory?.length) {
            listEl.innerHTML = this.game.updateHistory.map(item => `
                <div class="history-item">
                    <div class="history-v-row">
                        <span class="history-v">${item.version}</span>
                        <span class="history-date">${item.date}</span>
                    </div>
                    <div class="history-title">${item.title}</div>
                    <ul class="history-logs">
                        ${item.logs.map(log => `<li>${log}</li>`).join('')}
                    </ul>
                </div>
            `).join('');
            return;
        }

        listEl.innerHTML = '<div class="readme-empty">업데이트 히스토리를 불러오지 못했습니다.</div>';
    }

    setDeveloperLookupResult(message = '', color = '#8ff3c5') {
        ['dev-search-result', 'status-dev-search-result'].forEach((id) => {
            const resultEl = document.getElementById(id);
            if (!resultEl) return;
            resultEl.textContent = message;
            resultEl.style.color = color;
        });
    }

    async runDeveloperLookup(name = '') {
        const normalizedName = String(name || '').trim();
        if (!normalizedName) {
            return { ok: false, message: '이름을 입력해 주세요.', color: '#ffb2b2' };
        }

        this.setDeveloperLookupResult('조회 중입니다...', '#ffd585');
        const uid = await this.game.net?.getUidByName?.(normalizedName);
        if (!uid) {
            return { ok: false, message: '대상을 찾지 못했습니다.', color: '#ff9f9f' };
        }

        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(`##${uid}`).catch(() => { });
        }

        return {
            ok: true,
            uid,
            message: `복구 코드: ##${uid}`,
            color: '#8ff3c5'
        };
    }

    bindDeveloperLookupControls(inputId, buttonId, options = {}) {
        const input = document.getElementById(inputId);
        const button = document.getElementById(buttonId);
        if (!input || !button || button.dataset.bound === 'true') return;

        const runLookup = async () => {
            const result = await this.runDeveloperLookup(input.value);
            this.setDeveloperLookupResult(result.message, result.color);
        };

        button.addEventListener('click', runLookup);
        input.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            e.stopPropagation();
            runLookup();
        });

        if (options.syncValue !== false) {
            input.addEventListener('input', () => {
                const value = input.value;
                ['dev-name-search', 'status-dev-name-search'].forEach((targetId) => {
                    const target = document.getElementById(targetId);
                    if (!target || target === input || target.value === value) return;
                    target.value = value;
                });
            });
        }

        button.dataset.bound = 'true';
    }

    setStatusDevLookupExpanded(expanded = false, options = {}) {
        const { focus = false } = options;
        this.statusDevLookupExpanded = !!expanded;
        const overlay = document.getElementById('status-dev-lookup-overlay');
        const panel = document.getElementById('status-dev-lookup-panel');
        const toggle = document.getElementById('status-dev-lookup-toggle');
        const statusPopup = document.getElementById('status-popup');
        if (!overlay || !panel || !toggle) return;

        const canShow = this.devMode && this.hasDeveloperAccess() && statusPopup && !statusPopup.classList.contains('hidden');
        const nextExpanded = canShow && this.statusDevLookupExpanded;
        overlay.classList.toggle('hidden', !canShow);
        panel.classList.toggle('hidden', !nextExpanded);
        toggle.classList.toggle('is-active', nextExpanded);
        toggle.textContent = nextExpanded ? 'UID 닫기' : 'UID 조회';
        statusPopup?.classList.toggle('status-dev-lookup-active', nextExpanded);

        if (nextExpanded && focus) {
            document.getElementById('status-dev-name-search')?.focus();
        }
    }

    syncStatusDevLookupVisibility() {
        const statusPopup = document.getElementById('status-popup');
        const canShow = this.devMode && this.hasDeveloperAccess() && statusPopup && !statusPopup.classList.contains('hidden');
        if (!canShow) {
            this.statusDevLookupExpanded = false;
        }
        this.setStatusDevLookupExpanded(this.statusDevLookupExpanded);
    }

    setupDevModeListeners() {
        const portrait = document.querySelector('.status-portrait');
        if (portrait) {
            portrait.style.cursor = 'pointer';
            portrait.title = '개발자 모드';
            portrait.addEventListener('click', () => {
                if (!this.hasDeveloperAccess()) {
                    this.showDeveloperAccessPrompt();
                    this.syncDeveloperSettingsUi();
                    return;
                }

                this.setDevMode(!this.devMode, { announce: true });
            });
        }

        const searchInput = document.getElementById('dev-name-search');
        const searchBtn = document.getElementById('dev-btn-search');
        const resultEl = document.getElementById('dev-search-result');

        if (searchInput && searchBtn && resultEl) {
            const setSearchResult = (message, color = '#8ff3c5') => {
                resultEl.textContent = message;
                resultEl.style.color = color;
            };

            const runLookup = async () => {
                const name = searchInput.value.trim();
                if (!name) {
                    setSearchResult('이름을 입력해 주세요.', '#ffb2b2');
                    return;
                }

                setSearchResult('조회 중...', '#ffd585');
                const uid = await this.game.net.getUidByName(name);
                if (uid) {
                    const latestSnapshot = await this.game.net.getLatestProfileSnapshot?.(uid);
                    const recoveryUid = latestSnapshot?.profile?.recoveryUid || uid;
                    const recoveryCode = `복구 코드: ##${recoveryUid}`;
                    setSearchResult(recoveryCode, '#8ff3c5');
                    if (navigator?.clipboard?.writeText) {
                        navigator.clipboard.writeText(`##${recoveryUid}`).catch(() => { });
                    }
                } else {
                    setSearchResult('찾을 수 없음', '#ff9f9f');
                }
            };

            if (!searchBtn.dataset.bound) {
                searchBtn.onclick = runLookup;
                searchBtn.dataset.bound = 'true';
            }

            if (!searchInput.dataset.bound) {
                searchInput.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        runLookup();
                    }
                };
                searchInput.dataset.bound = 'true';
            }
        }
        this.bindDeveloperLookupControls('status-dev-name-search', 'status-dev-btn-search');
        document.getElementById('status-dev-lookup-toggle')?.addEventListener('click', () => {
            this.setStatusDevLookupExpanded(!this.statusDevLookupExpanded, { focus: true });
        });
        this.syncDeveloperSettingsUi();
        this.syncStatusDevLookupVisibility();
    }
    // v0.00.15: Dev Mode - Character Reset (Refund)
    async handleDevCharacterReset() {
        if (!this.hasDeveloperAccess()) return;
        const p = this.game.localPlayer;
        if (!p) return;

        const msg = "레벨을 제외한 마석/스텟/스킬이 초기화됩니다.\n사용된 마석/스텟은 반환됩니다.\n\n계속하시겠습니까?";
        if (!confirm(msg)) return;

        const previousState = {
            statPoints: p.statPoints,
            manastone: p.manastone,
            vitality: p.vitality,
            intelligence: p.intelligence,
            wisdom: p.wisdom,
            agility: p.agility,
            hp: p.hp,
            maxHp: p.maxHp,
            mp: p.mp,
            maxMp: p.maxMp,
            skillLevels: { ...(p.skillLevels || {}) }
        };

        // 1. Calculate Refunded Stat Points
        const usedVit = Math.max(0, (p.vitality || 1) - 1);
        const usedInt = Math.max(0, (p.intelligence || 3) - 3);
        const usedWis = Math.max(0, (p.wisdom || 2) - 2);
        const usedAgi = Math.max(0, (p.agility || 1) - 1);

        const totalRefundedStats = usedVit + usedInt + usedWis + usedAgi;

        // 2. Calculate Refunded Manastone from Skills
        let totalRefundedManastone = 0;
        const skills = p.skillLevels || { laser: 1, missile: 1, fireball: 1, shield: 1 };

        ['laser', 'missile', 'fireball'].forEach(skill => {
            const lv = skills[skill] || 1;
            if (lv > 1) {
                totalRefundedManastone += 300 * (Math.pow(2, lv - 1) - 1);
            }
        });

        // 3. Apply Changes
        p.statPoints = (p.statPoints || 0) + totalRefundedStats;
        p.manastone = Number(p.manastone ?? p.gold ?? 0) + totalRefundedManastone;
        p.updateManastoneInventory?.();

        // Reset Stats
        p.vitality = 1;
        p.intelligence = 3;
        p.wisdom = 2;
        p.agility = 1;

        // Recalculate Derived Stats
        p.hp = 20 + (p.vitality * 10);
        p.maxHp = p.hp;
        p.mp = 30 + (p.wisdom * 10);
        p.maxMp = p.mp;

        // Reset Skills
        p.skillLevels = { laser: 1, missile: 1, fireball: 1, shield: 1 };

        // 4. Save and Reload
        if (p.saveState) {
            const saveResult = await p.saveState(true, {
                reason: 'developer_character_reset',
                allowDestructiveProfileWrite: true,
                bypassProfileRegressionGuard: true,
                backupReason: 'developer_character_reset'
            });
            if (!saveResult?.ok) {
                Object.assign(p, previousState, { skillLevels: previousState.skillLevels });
                p.refreshStats?.();
                p.hp = previousState.hp;
                p.mp = previousState.mp;
                p.updateManastoneInventory?.();
                this.updateStatusPopup?.();
                this.updateSkillPopup?.();
                Logger.error('[UI] Developer character reset save failed', saveResult?.error || saveResult?.reason);
                alert('초기화 데이터를 저장하지 못해 변경을 취소했습니다.');
                return;
            }
        }

        alert(`초기화 완료!\n반환된 스텟: ${totalRefundedStats}\n반환된 마석: ${totalRefundedManastone}\n\n게임을 다시 불러옵니다.`);
        window.location.reload();
    }

    // v0.00.15: Dev Mode - Account Reset (Wipe)
    async handleDevAccountReset() {
        if (!this.hasDeveloperAccess()) return;
        if (!this.game.localPlayer) return;

        const check = confirm("⚠️ 경고: 정말로 모든 데이터를 삭제하고 계정을 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.");
        if (!check) return;

        try {
            const result = await this.game.net.deleteCharacter(this.game.localPlayer.id, this.game.localPlayer.name);
            if (!result?.ok) {
                throw result?.error || new Error(result?.reason || 'delete_failed');
            }
            this.clearLocalCharacterCaches();
            alert("계정이 초기화되었습니다. 게임을 다시 시작합니다.");
            window.location.reload();
        } catch (e) {
            Logger.error(e);
            alert("초기화 실패");
        }
    }

    updateDevOverlay() {
        if (!this.hasDeveloperAccess() || !this.devMode) return;
        if (!this.game.monsterManager) return;
        const stats = this.game.monsterManager.getStats();
        const perf = this.game.getPerformanceSnapshot?.() || {};
        const mCount = document.getElementById('dev-m-count');
        const mMax = document.getElementById('dev-m-max');
        const mInterval = document.getElementById('dev-m-interval');
        const pSum = document.getElementById('dev-p-sum');
        const loopUpdate = document.getElementById('dev-loop-update');
        const loopRender = document.getElementById('dev-loop-render');
        const loopGap = document.getElementById('dev-loop-gap');
        const netWrites = document.getElementById('dev-net-writes');
        const netBytes = document.getElementById('dev-net-bytes');
        const netMove = document.getElementById('dev-net-move');
        const netMonster = document.getElementById('dev-net-monster');
        const netProfile = document.getElementById('dev-net-profile');
        const hudTicks = document.getElementById('dev-ui-hud');
        const minimapTicks = document.getElementById('dev-ui-minimap');
        const remoteTicks = document.getElementById('dev-ui-remote');
        const fieldMode = document.getElementById('dev-field-mode');
        const fieldPeers = document.getElementById('dev-field-peers');
        const monsterSyncMode = document.getElementById('dev-monster-sync');
        const syncSnapshot = this.game.net?.getSyncModeSnapshot?.() || {};

        if (mCount) mCount.textContent = stats.count;
        if (mMax) mMax.textContent = stats.max;
        if (mInterval) mInterval.textContent = stats.interval + 's';
        if (pSum) pSum.textContent = stats.totalLevel;
        if (loopUpdate) loopUpdate.textContent = Number(perf.avgUpdateMs || 0).toFixed(2);
        if (loopRender) loopRender.textContent = Number(perf.avgRenderMs || 0).toFixed(2);
        if (loopGap) loopGap.textContent = Math.round(perf.maxFrameGapMs || 0);
        if (netWrites) netWrites.textContent = Math.round(perf.rtdbWritesPerMin || 0);
        if (netBytes) netBytes.textContent = `${((perf.estimatedBytesPerMin || 0) / 1024).toFixed(1)} KB`;
        if (netMove) netMove.textContent = Math.round(perf.movePacketsPerMin || 0);
        if (netMonster) netMonster.textContent = Math.round(perf.monsterWritesPerMin || 0);
        if (netProfile) netProfile.textContent = Math.round(perf.profileSavesPerMin || 0);
        if (hudTicks) hudTicks.textContent = Math.round(perf.hudUpdatesPerMin || 0);
        if (minimapTicks) minimapTicks.textContent = Math.round(perf.minimapUpdatesPerMin || 0);
        if (remoteTicks) remoteTicks.textContent = Math.round(perf.remoteUpdatesPerMin || 0);
        if (fieldMode) fieldMode.textContent = syncSnapshot.sharedFieldActive ? 'shared' : 'solo-lite';
        if (fieldPeers) fieldPeers.textContent = `${syncSnapshot.peerCount || 0}@${syncSnapshot.fieldId || 'zone_1'}`;
        if (monsterSyncMode) monsterSyncMode.textContent = syncSnapshot.monsterQuietMode ? 'quiet' : 'realtime';
    }

    showRegenHint(type, amount) {
        const container = document.getElementById(`ui-${type}-regen-container`);
        if (!container) return;

        const el = document.createElement('div');
        el.className = `regen-float ${type}-regen-float`;
        el.textContent = `+${amount}`;

        container.appendChild(el);

        // Auto-cleanup after animation duration (1s)
        setTimeout(() => {
            if (el.parentNode) container.removeChild(el);
        }, 1000);
    }

    showExpGainHint(amount) {
        const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
        if (safeAmount <= 0) return;

        this.pendingExpGainHint += safeAmount;
        if (this._pendingExpGainTimer) return;

        this._pendingExpGainTimer = setTimeout(() => {
            const totalAmount = this.pendingExpGainHint;
            this.pendingExpGainHint = 0;
            this._pendingExpGainTimer = null;

            const container = document.getElementById('ui-exp-gain-container');
            if (!container || totalAmount <= 0) return;

            const el = document.createElement('div');
            el.className = 'exp-gain-float';
            el.textContent = `+${totalAmount}`;
            container.appendChild(el);

            setTimeout(() => {
                if (el.parentNode === container) {
                    container.removeChild(el);
                }
            }, 1000);
        }, 120);
    }


    confirmResetCharacter() {
        this.showConfirm("정말 캐릭터를 삭제하시겠습니까?<br><small>캐릭터 정보가 영구 삭제되며 처음부터 다시 시작합니다.</small>", async (confirmed) => {
            if (confirmed && this.game.localPlayer) {
                try {
                    const p = this.game.localPlayer;
                    const name = p.name;
                    const uid = this.game.net.playerId;

                    // 1. Delete from DB
                    if (this.game.net) {
                        const result = await this.game.net.deleteCharacter(uid, name);
                        if (!result?.ok) {
                            throw result?.error || new Error(result?.reason || 'delete_failed');
                        }
                        this.clearLocalCharacterCaches();
                        this.logSystemMessage('캐릭터가 삭제되었습니다. 페이지를 새로고침합니다.');

                        // 2. Force Reload to go back to title/character selection
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    }
                } catch (error) {
                    Logger.error(error);
                    this.logSystemMessage('캐릭터 삭제에 실패했습니다.');
                    alert('캐릭터 삭제에 실패했습니다.');
                }
            }
        });
    }

    // v0.00.43: Center System Message (Warning Text)
    showCenterMessage(text, color = '#ffeb3b', options = {}) {
        const normalizedText = this.sanitizeSystemMessageText(text);
        if (!normalizedText) return;
        this.centerMessageQueue.push({
            text: normalizedText,
            color,
            durationMs: Number.isFinite(options.durationMs) ? options.durationMs : 4000,
            lightweight: !!options.lightweight
        });
        this.flushCenterMessageQueue();
    }

    flushCenterMessageQueue() {
        if (this.centerMessageActive) return;

        const nextMessage = this.centerMessageQueue.shift();
        if (!nextMessage) return;

        let el = document.getElementById('center-message');
        if (!el) {
            el = document.createElement('div');
            el.id = 'center-message';
            el.style.position = 'fixed';
            el.style.top = '30%'; // Slightly above center
            el.style.left = '50%';
            el.style.transform = 'translate(-50%, -50%)';
            el.style.fontSize = '24px';
            el.style.fontWeight = 'bold';
            el.style.textShadow = '0 3px 10px rgba(0, 0, 0, 0.72), 0 0 2px rgba(0, 0, 0, 0.95)';
            el.style.pointerEvents = 'none';
            el.style.opacity = '0';
            el.style.zIndex = '5200';
            el.style.textAlign = 'center';
            el.style.width = 'min(86vw, 980px)';
            el.style.maxWidth = '86vw';
            el.style.whiteSpace = 'normal';
            el.style.lineHeight = '1.3';
            el.style.padding = '0 12px';
            el.style.willChange = 'opacity';
            el.style.contain = 'paint';
            document.body.appendChild(el);
        } else if (el.parentElement !== document.body && document.body) {
            document.body.appendChild(el);
        }

        const lightweight = !!nextMessage.lightweight;
        this.centerMessageActive = true;
        el.textContent = nextMessage.text;
        el.style.color = nextMessage.color;
        el.style.top = lightweight ? '27%' : '30%';
        el.style.fontSize = lightweight ? '19px' : '24px';
        el.style.fontWeight = lightweight ? '800' : 'bold';
        el.style.textShadow = lightweight
            ? '0 1px 4px rgba(0, 0, 0, 0.58)'
            : '0 3px 10px rgba(0, 0, 0, 0.72), 0 0 2px rgba(0, 0, 0, 0.95)';
        el.style.transition = lightweight ? 'opacity 0.18s linear' : 'opacity 0.28s ease';
        el.style.opacity = '1';

        if (this._centerMsgTimer) clearTimeout(this._centerMsgTimer);
        if (this._centerMsgFadeTimer) clearTimeout(this._centerMsgFadeTimer);

        const fadeMs = lightweight ? 180 : 320;
        this._centerMsgTimer = setTimeout(() => {
            el.style.opacity = '0';
            this._centerMsgFadeTimer = setTimeout(() => {
                this.centerMessageActive = false;
                this._centerMsgTimer = null;
                this._centerMsgFadeTimer = null;
                this.flushCenterMessageQueue();
            }, fadeMs);
        }, nextMessage.durationMs);
    }
    // v2.1: Emote System
    setupEmoteUI() {
        const emoteBtn = document.querySelector('.emote-btn');
        const emoteShortcutBtn = document.getElementById('btn-emote-shortcut');
        const emotePicker = document.getElementById('emote-picker');
        const emoteTriggers = [emoteBtn, emoteShortcutBtn].filter(Boolean);

        if (emoteTriggers.length > 0 && emotePicker) {
            emoteTriggers.forEach((trigger) => {
                trigger.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleEmotePicker();
                });
            });

            document.addEventListener('click', (e) => {
                const clickedTrigger = emoteTriggers.some(trigger => trigger.contains(e.target));
                if (!emotePicker.contains(e.target) && !clickedTrigger) {
                    emotePicker.classList.add('hidden');
                }
            });

            this.loadEmotes();
        }
    }

    async loadEmotes() {
        // Simple fetch or use ResourceManager if ready.
        // For now, fetch direct since ResourceManager loads assets, not raw json for UI list usually.
        // Actually ResourceManager has loadJSON.
        try {
            const response = await fetch('assets/data/emotes/basic_emotes.json');
            const emotes = await response.json();

            // v2.1: Store globally for Player.js rendering
            if (this.game) this.game.emotes = emotes;

            const picker = document.getElementById('emote-picker');

            if (picker && emotes) {
                picker.innerHTML = '';
                emotes.forEach(emote => {
                    const img = document.createElement('img');
                    img.src = emote.icon;
                    img.className = 'emote-item';
                    img.alt = emote.id || 'emote';
                    img.title = emote.id || 'emote';
                    img.onclick = () => this.onEmoteClick(emote.id);
                    picker.appendChild(img);
                });
            }
        } catch (e) {
            Logger.error('Failed to load emotes:', e);
        }
    }

    toggleEmotePicker() {
        const picker = document.getElementById('emote-picker');
        if (picker) {
            const isHidden = picker.classList.contains('hidden');
            if (isHidden) picker.classList.remove('hidden');
            else picker.classList.add('hidden');
        }
    }

    onEmoteClick(emoteId) {
        if (!emoteId || !this.game?.net) return;

        if (this.game.localPlayer) {
            this.game.localPlayer.showEmote(emoteId);
        }

        this.game.net.sendEmote(emoteId, this.game.localPlayer?.name || '');
        document.getElementById('emote-picker')?.classList.add('hidden');
        document.getElementById('emote-panel')?.classList.add('hidden');
    }
}
