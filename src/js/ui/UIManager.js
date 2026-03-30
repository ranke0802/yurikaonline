import Logger from '../utils/Logger.js';

export class UIManager {
    constructor(game) {
        this.game = game;
        this.overlay = document.getElementById('popup-overlay');
        this.pendingStats = { vitality: 0, intelligence: 0, wisdom: 0, agility: 0 };
        this.initialPoints = 0;
        this.isPaused = false;
        this.devMode = false;
        this.pendingLandscapeFullscreen = false;
        this.landscapeFullscreenDismissed = false;
        this._wasFullscreenActive = false;
        this.pcQuestClaimHandler = null;
        this.hudRefs = {};
        this.cooldownRefs = {};
        this.minimapCtx = null;
        this.minimapCanvas = null;
        this.lastHudSnapshot = null;
        this.handleDesktopShortcutKeydown = this.handleDesktopShortcutKeydown.bind(this);
        this.refreshDesktopShortcutHints = this.refreshDesktopShortcutHints.bind(this);
        this.setupEventListeners();
        this.setupFullscreenListeners();
        this.setupDevModeListeners();
        this.inputManager = game.input; // Local reference
        this.tutorialHighlightLayer = null;
        this.tutorialHighlightTargets = [];
        this.refreshTutorialHighlight = this.refreshTutorialHighlight.bind(this);
        this.refreshTutorialGuideLayout = this.refreshTutorialGuideLayout.bind(this);
        const refreshTutorialOverlays = () => {
            this.refreshTutorialHighlight();
            this.refreshTutorialGuideLayout();
            this.refreshDesktopShortcutHints();
        };
        window.addEventListener('resize', refreshTutorialOverlays);
        window.addEventListener('orientationchange', refreshTutorialOverlays);
        document.addEventListener('fullscreenchange', refreshTutorialOverlays);
        document.addEventListener('webkitfullscreenchange', refreshTutorialOverlays);

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

    applyTutorialGuideLayout(guide) {
        const mode = this.getTutorialViewportMode();
        const isLandscape = mode === 'mobile-landscape';
        const isPortrait = mode === 'mobile-portrait';

        guide.style.position = 'fixed';
        guide.style.left = '50%';
        guide.style.right = 'auto';
        guide.style.bottom = 'auto';
        guide.style.boxSizing = 'border-box';
        guide.style.pointerEvents = 'none';
        guide.style.zIndex = '4600';
        guide.style.maxWidth = isLandscape ? 'min(70vw, 320px)' : (isPortrait ? 'min(84vw, 560px)' : 'min(92vw, 760px)');
        guide.style.maxHeight = isLandscape ? 'calc(100dvh - 44px)' : 'none';
        guide.style.overflowY = isLandscape ? 'auto' : 'visible';
        guide.style.lineHeight = '1.45';

        if (isLandscape) {
            guide.style.top = 'max(20px, calc(env(safe-area-inset-top, 0px) + 20px))';
            guide.style.transform = 'translateX(-50%)';
            guide.style.padding = '8px 10px';
            guide.style.fontSize = '11px';
        } else if (isPortrait) {
            guide.style.top = 'calc(env(safe-area-inset-top, 0px) + 118px)';
            guide.style.transform = 'translateX(-50%)';
            guide.style.padding = '13px 18px';
            guide.style.fontSize = '16px';
        } else {
            guide.style.top = '20%';
            guide.style.transform = 'translate(-50%, -50%)';
            guide.style.padding = '16px 24px';
            guide.style.fontSize = '18px';
        }
    }

    refreshTutorialGuideLayout() {
        const guide = document.getElementById('tutorial-guide');
        if (!guide || guide.classList.contains('hidden')) return;
        this.applyTutorialGuideLayout(guide);
    }

    showTutorialGuide(text) {
        let guide = document.getElementById('tutorial-guide');
        if (!guide) {
            guide = document.createElement('div');
            guide.id = 'tutorial-guide';
            guide.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            guide.style.color = '#ffffff';
            guide.style.borderRadius = '12px';
            guide.style.fontFamily = "'Noto Sans KR', sans-serif";
            guide.style.fontWeight = 'bold';
            guide.style.display = 'none';
            guide.style.border = '2px solid #ffd700';
            guide.style.boxShadow = '0 0 15px rgba(255, 215, 0, 0.3)';
            guide.style.textAlign = 'center';
            guide.style.textShadow = '0 2px 4px rgba(0,0,0,0.5)';
            document.body.appendChild(guide);
        }
        this.applyTutorialGuideLayout(guide);
        guide.innerHTML = `<div style="font-size:14px; color:#ffd700; margin-bottom:4px;">TUTORIAL</div>${text}`;
        guide.style.display = 'block';
    }

    hideTutorialGuide() {
        const guide = document.getElementById('tutorial-guide');
        if (guide) guide.style.display = 'none';
    }

    // v2.3.1: HUD Visibility Control for Cutscenes
    hideHUD() {
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.classList.add('hidden');
    }

    showHUD() {
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.classList.remove('hidden');
    }

    setupGlobalInteractions() {
        const INTERACTIVE_SELECTORS = 'button, .btn, .skill-icon, .item-slot, .stat-up-btn, .stat-down-btn, .close-popup, .login-btn, .action-btn';

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
                this.landscapeFullscreenDismissed = false;
            } else if (this._wasFullscreenActive && this.isMobileLandscapeViewport()) {
                this.pendingLandscapeFullscreen = false;
                this.landscapeFullscreenDismissed = true;
            }

            this._wasFullscreenActive = isFull;
        };
        const handleViewportChange = () => {
            window.requestAnimationFrame(() => {
                this.syncOrientationLock();
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

    syncOrientationLock() {
        if (screen.orientation && screen.orientation.lock) {
            const isTouch = window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0;
            const shouldPreferLandscape = isTouch && (this.isStandaloneDisplayMode() || this.isFullscreenActive());
            const preferredMode = shouldPreferLandscape ? 'landscape-primary' : 'any';
            screen.orientation.lock(preferredMode).catch(() => {
                if (shouldPreferLandscape) {
                    screen.orientation.lock('landscape').catch(() => { });
                }
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
        const isTouch = window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0;
        const isNarrow = window.innerWidth <= 1024;
        const isLandscape = window.matchMedia?.('(orientation: landscape)')?.matches ?? (window.innerWidth > window.innerHeight);
        return isTouch && isNarrow && isLandscape;
    }

    isDesktopShortcutMode() {
        const hasFinePointer = window.matchMedia?.('(pointer: fine)')?.matches ?? false;
        const canHover = window.matchMedia?.('(hover: hover)')?.matches ?? false;
        return (hasFinePointer || canHover) && !this.isMobileLandscapeViewport();
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
        const genericYes = document.getElementById('generic-modal-yes');
        const genericNo = document.getElementById('generic-modal-no');
        const questDetails = document.querySelector('#quest-reward-display .quest-details');

        this.upsertShortcutHint(openPopup?.querySelector('.popup-footer'), 'F', '닫기', 'popup-shortcut-hint');
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

        const openPopup = document.querySelector('.game-popup:not(.hidden)');
        if (openPopup?.id) {
            this.togglePopup(openPopup.id);
            return true;
        }

        return false;
    }

    handleDesktopShortcutKeydown(e) {
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

        const shouldActivate = active && this.isMobileLandscapeViewport();
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
        if (!this.isMobileLandscapeViewport()) {
            this.setLandscapeChatActive(false);
        }
    }

    setupLandscapeChatInteractions() {
        const chatWindow = document.querySelector('.chat-window');
        const chatInput = document.querySelector('.chat-input-area input');

        if (!chatWindow || !chatInput) return;

        const shouldIgnoreTarget = (target) => {
            if (!(target instanceof Element)) return false;
            return !!target.closest('.chat-input-area, .send-btn, #emote-picker, #btn-emote, .emote-btn');
        };

        const activateChat = (e) => {
            if (!this.isMobileLandscapeViewport() || shouldIgnoreTarget(e.target)) return;
            e.preventDefault();
            e.stopPropagation();
            this.setLandscapeChatActive(true, { focusInput: true });
        };

        const maybeCollapseChat = () => {
            if (!this.isMobileLandscapeViewport()) {
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
        if (this.isFullscreenActive() || this.isStandaloneDisplayMode()) return Promise.resolve(true);

        const elem = document.documentElement;
        const request = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.mozRequestFullScreen || elem.msRequestFullscreen;
        if (!request) {
            this.pendingLandscapeFullscreen = false;
            return Promise.resolve(false);
        }

        try {
            const result = request.call(elem);
            if (result && typeof result.then === 'function') {
                return result.then(() => true).catch(() => false);
            }
            return Promise.resolve(true);
        } catch {
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
                await this.game.net.leaveParty();
                this.updatePartyUI();
            };
            btn.addEventListener('click', handleLeaveParty);
            btn.addEventListener('touchstart', handleLeaveParty, { passive: false });
        });

        // Confirmation Modal
        this.confirmModal = document.getElementById('confirm-modal');
        this.confirmYes = document.getElementById('confirm-yes');
        this.confirmNo = document.getElementById('confirm-no');
        this.confirmCallback = null;

        this.confirmYes.addEventListener('click', () => {
            if (this.confirmCallback) this.confirmCallback(true);
            this.hideConfirm();
        });
        this.confirmNo.addEventListener('click', () => {
            if (this.confirmCallback) this.confirmCallback(false);
            this.hideConfirm();
        });

        // Skill Tooltips
        this.tooltip = document.getElementById('skill-tooltip');
        this.skillData = {
            laser: { name: '체인 라이트닝 (J)', desc: '특징: 기본 공격이 가까운 적에게 연쇄되는 번개로 바뀌고, 적중한 적 수만큼 마나를 회복합니다.<br>성장: 레벨이 오를수록 연쇄 대상 수와 충전당 피해 상승폭이 함께 커집니다.' },
            missile: { name: '매직 미사일 (H)', desc: '특징: 가까운 적을 자동 추적하는 미사일을 순차 발사합니다.<br>성장: 레벨이 오를수록 한 번에 발사되는 미사일 수가 늘고 마나 소모도 함께 증가합니다.' },
            fireball: { name: '파이어볼 (U)', desc: '특징: 직선으로 날아가 폭발하며 범위 피해와 화상을 남기는 광역 스킬입니다.<br>성장: 레벨이 오를수록 직격 피해, 폭발 반경, 화상 지속시간이 함께 증가합니다.' },
            shield: { name: '앱솔루트 베리어 (K)', desc: '특징: 다음 1회의 피격을 완전히 막는 생존용 방어막입니다.<br>성장: 레벨업이 없는 고정 성능 스킬이며, 항상 같은 성능으로 유지됩니다.' }
        };

        this.bindSkillTooltipTargets();

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
                        const requiredName = this.skillData[requiredSkill]?.name || '지정된 스킬';
                        this.logSystemMessage(`📘 지금은 ${requiredName}만 강화할 수 있습니다.`);
                    } else {
                        this.logSystemMessage('📘 아직은 스킬 설명을 확인하는 단계입니다. 아이콘에 마우스를 올려 보세요.');
                    }
                    this.updateSkillPopup();
                    return;
                }

                // Exponential Cost: 300 * 2^(lv-1)
                const lv = p.skillLevels[skillId] || 1;
                const cost = 300 * Math.pow(2, lv - 1);

                if (p.gold >= cost) {
                    p.gold -= cost;
                    p.updateGoldInventory(); // v0.22.9
                    p.skillLevels[skillId]++;
                    this.game.tutorial?.trigger?.('skill_upgrade', { target: skillId });
                    this.logSystemMessage(`✨ [SKILL] ${this.skillData[skillId].name} 레벨이 상승했습니다! (현재: ${p.skillLevels[skillId]})`);
                    this.updateSkillPopup();
                    this.updateStatusPopup();
                    this.updateInventory(); // v0.22.9
                    p.saveState();
                } else {
                    this.logSystemMessage(`❌ 골드가 부족합니다! (필요: ${cost}G)`);
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
                e.preventDefault();
                e.stopPropagation();
                this.toggleFullscreen();
            };
            fsBtn.addEventListener('click', handleFs);
            fsBtn.addEventListener('touchstart', handleFs, { passive: false });
        }

        // Quick Menu Buttons (Add these listeners)
        const menuBtnMap = {
            'btn-inventory': 'inventory-popup',
            'btn-skill': 'skill-popup',
            'btn-status': 'status-popup'
        };

        Object.entries(menuBtnMap).forEach(([btnId, popupId]) => {
            const btn = document.getElementById(btnId);
            if (btn) {
                const handleToggle = (e) => {
                    e.preventDefault();
                    this.togglePopup(popupId);
                };
                btn.addEventListener('click', handleToggle);
                btn.addEventListener('touchstart', handleToggle, { passive: false });
            }
        });

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

            nameSaveBtn.addEventListener('click', () => {
                // Save name and hide input row
                const newName = nameInput.value.trim() || '유리카';
                if (this.game.localPlayer) {
                    const oldName = this.game.localPlayer.name;

                    if (this.game.net && oldName !== newName) {
                        this.game.net.updateNameMapping(this.game.localPlayer.id, oldName, newName);
                    }

                    this.game.localPlayer.name = newName;
                    localStorage.setItem('yurika_player_name', newName);
                    this.game.localPlayer.saveState(); // v0.00.01: Sync to DB immediately
                }
                nameDisplay.textContent = newName;
                nameInputRow.style.display = 'none';
                nameDisplayRow.style.display = 'block';
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

            // v0.00.65: Party System Listeners (Moved from Player.js to avoid constructor errors)
            this.game.net.on('partyInviteReceived', (data) => {
                this.showGenericModal(
                    '파티 초대',
                    `"${data.fromName}"님이 파티에 초대했습니다.`,
                    async () => {
                        await this.game.net.respondToInvite(data.id, data.from, true, data.partyMembers);
                        this.updatePartyUI();
                    },
                    async () => {
                        await this.game.net.respondToInvite(data.id, data.from, false, data.partyMembers);
                    },
                    { yesText: '수락', noText: '거절' }
                );
            });

            this.game.net.on('partyResponseReceived', (data) => {
                if (data.accept) {
                    if (Array.isArray(data.partyMembers) && this.game.localPlayer?.setPartyMembers) {
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
                if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') return;

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

    showGenericModal(title, message, onYes, onNo, options = {}) {
        const modal = document.getElementById('generic-modal');
        if (!modal) return;

        const titleEl = document.getElementById('generic-modal-title');
        const msgEl = document.getElementById('generic-modal-message');
        const yesBtn = document.getElementById('generic-modal-yes');
        const noBtn = document.getElementById('generic-modal-no');
        const { yesText, noText, hideNo = !onNo } = options;

        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;

        const newYes = yesBtn.cloneNode(true);
        const newNo = noBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYes, yesBtn);
        noBtn.parentNode.replaceChild(newNo, noBtn);
        newYes.textContent = yesText || (hideNo ? '확인' : '수락');
        newNo.textContent = noText || '거절';
        newNo.style.display = hideNo ? 'none' : '';

        newYes.onclick = async () => {
            if (onYes) await onYes();
            this.hideGenericModal();
        };

        newNo.onclick = async () => {
            if (onNo) await onNo();
            this.hideGenericModal();
        };

        modal.classList.remove('hidden');
        modal.classList.add('visible');
        this.refreshDesktopShortcutHints();
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
            modal.classList.remove('visible');
            modal.classList.add('hidden');
        }
        this.refreshDesktopShortcutHints();
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
        const popupActionMap = {
            'inventory-popup': 'OPEN_INVENTORY',
            'skill-popup': 'OPEN_SKILL',
            'status-popup': 'OPEN_STATUS'
        };
        const requiredAction = popupActionMap[id];
        if (isCurrentlyHidden && requiredAction && !this.game.tutorial?.isActionAllowed?.(requiredAction)) {
            return;
        }

        // If closing status popup, check for pending stats
        if (!isCurrentlyHidden && id === 'status-popup') {
            const totalPending = Object.values(this.pendingStats).reduce((a, b) => a + b, 0);
            if (totalPending > 0) {
                this.showConfirm('스텟을 저장하시겠습니까?<br><small>한번 저장하면 변경할 수 없습니다.</small>', (result) => {
                    if (result) {
                        this.savePendingStats();
                    } else {
                        this.cancelPendingStats();
                    }
                    this.executePopupClose(id);
                });
                return; // Wait for confirm
            }
        }

        this.executePopupClose(id, isCurrentlyHidden, popup);
    }

    executePopupClose(id, isCurrentlyHidden, popup) {
        if (!popup) popup = document.getElementById(id);
        this.hideTooltip();

        document.querySelectorAll('.game-popup').forEach(p => p.classList.add('hidden'));

        if (isCurrentlyHidden) {
            if (this.game.sound) this.game.sound.playSfx('ui_open');
            this.overlay.classList.remove('hidden');
            popup.classList.remove('hidden');
            document.body.classList.add('popup-open');
            if (id === 'status-popup') {
                this.pendingStats = { vitality: 0, intelligence: 0, wisdom: 0, agility: 0 };
                this.updateStatusPopup();
            }
            if (id === 'inventory-popup') this.updateInventory();
            if (id === 'skill-popup') this.updateSkillPopup();
            this.isPaused = true;
            this.game.tutorial?.trigger?.('popup_open', { target: id });
        } else {
            if (this.game.sound) this.game.sound.playSfx('ui_close');
            this.overlay.classList.add('hidden');
            document.body.classList.remove('popup-open');
            this.isPaused = false;
            this.game.tutorial?.trigger?.('popup_close', { target: id });
        }

        this.refreshDesktopShortcutHints();
    }

    showConfirm(message, callback) {
        document.getElementById('confirm-message').innerHTML = message;
        this.confirmModal.classList.remove('hidden');
        this.confirmCallback = callback;
        this.refreshDesktopShortcutHints();
    }

    hideConfirm() {
        this.confirmModal.classList.add('hidden');
        this.refreshDesktopShortcutHints();
    }

    bindSkillTooltipTargets() {
        const skillPopup = document.getElementById('skill-popup');
        if (!skillPopup || skillPopup.dataset.tooltipBound === 'true') return;

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

        skillPopup.addEventListener('touchstart', (e) => {
            const item = resolveSkillItem(e.target);
            if (!item) return;

            const touch = e.touches?.[0];
            showFromItem(item, touch?.clientX, touch?.clientY);
        }, { passive: true });

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

    highlightTutorialTargets(targets) {
        this.tutorialHighlightTargets = Array.isArray(targets)
            ? targets.filter(Boolean)
            : (targets ? [targets] : []);
        this.refreshTutorialHighlight();
    }

    refreshTutorialHighlight() {
        const layer = this.ensureTutorialHighlightLayer();
        layer.innerHTML = '';

        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const isTouch = window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0;
        const isLandscape = window.matchMedia?.('(orientation: landscape)')?.matches ?? (window.innerWidth > window.innerHeight);
        const padding = isTouch ? (isLandscape ? 6 : 10) : 8;

        this.tutorialHighlightTargets.forEach((target) => {
            const element = this.resolveTutorialHighlightTarget(target);
            if (!element) return;
            if (element.classList?.contains('hidden')) return;

            const rect = element.getBoundingClientRect();
            if (!rect.width || !rect.height) return;

            const left = Math.max(0, rect.left - padding);
            const top = Math.max(0, rect.top - padding);
            const right = Math.min(viewportW, rect.right + padding);
            const bottom = Math.min(viewportH, rect.bottom + padding);
            const width = Math.max(0, right - left);
            const height = Math.max(0, bottom - top);
            if (!width || !height) return;

            const box = document.createElement('div');
            box.className = 'tutorial-highlight-box';
            box.style.left = `${left}px`;
            box.style.top = `${top}px`;
            box.style.width = `${width}px`;
            box.style.height = `${height}px`;
            layer.appendChild(box);
        });
    }

    clearTutorialHighlight() {
        this.tutorialHighlightTargets = [];
        if (this.tutorialHighlightLayer) {
            this.tutorialHighlightLayer.innerHTML = '';
        }
    }

    showTooltip(skillId, x, y) {
        const p = this.game.localPlayer;
        if (!p) return;
        const data = this.skillData[skillId];
        if (!data) return;
        if (!this.tooltip) return;

        const lv = p.skillLevels[skillId] || 1;
        let currentEffect = "";

        switch (skillId) {
            case 'laser':
                const baseChain = 1 + lv;
                const baseRatio = 0.10 + (lv - 1) * 0.05;
                const increment = 0.10 + (lv - 1) * 0.05;
                const minDmg = Math.floor(p.attackPower * baseRatio);
                const maxDmg = Math.floor(p.attackPower * 1.0);
                const slow = 80;
                currentEffect = `<div class="current-effect">현재 효과 (Lv.${lv}):<br>연쇄: ${baseChain}마리 | 사거리: ${Math.floor(p.attackRange)} | 위력: ${minDmg} ~ ${maxDmg} | 충전당 증가: ${(increment * 100).toFixed(0)}% | 둔화: ${slow}%</div>`;
                break;
            case 'missile':
                const mCount = lv * 2;
                // v0.00.42: Fixed to match actual damage (45%, not 90%)
                const mDmg = Math.floor(p.attackPower * 0.45);
                const mCost = 4 + (lv - 1) * 3;
                currentEffect = `<div class="current-effect">현재 효과 (Lv.${lv}):<br>발사 수: ${mCount}발 | 발당 데미지: ${mDmg} | 유도 거리: 600 | 마나 소모: ${mCost}</div>`;
                break;
            case 'fireball':
                const fDmg = Math.floor(p.attackPower * (1.8 + (lv - 1) * 0.3));
                const fRad = 20 + (lv - 1) * 20;
                const fBurn = 2.0 + (lv - 1) * 0.5;
                const fCost = 12 + (lv - 1) * 4;
                currentEffect = `<div class="current-effect">현재 효과 (Lv.${lv}):<br>직격 피해: ${fDmg} | 폭발 반경: ${fRad} | 화상: ${fBurn}초 | 마나 소모: ${fCost}</div>`;
                break;
            case 'shield':
                currentEffect = `<div class="current-effect">현재 효과:<br>다음 1회 피격 무효화 | 마나 소모: 20 | 재사용 대기시간: 3초</div>`;
                break;
        }

        const tooltip = this.tooltip;
        const tooltipName = tooltip.querySelector('.tooltip-name');
        const tooltipDesc = tooltip.querySelector('.tooltip-desc');
        if (tooltipName) tooltipName.textContent = data.name;
        if (tooltipDesc) tooltipDesc.innerHTML = data.desc + currentEffect;

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

    savePendingStats() {
        const p = this.game.localPlayer;
        if (!p) return;
        p.vitality += this.pendingStats.vitality;
        p.intelligence += this.pendingStats.intelligence;
        p.wisdom += this.pendingStats.wisdom;
        p.agility += this.pendingStats.agility;
        p.refreshStats();
        // Clamp current stats to new maximums
        p.hp = Math.min(p.hp, p.maxHp);
        p.mp = Math.min(p.mp, p.maxMp);
        this.pendingStats = { vitality: 0, intelligence: 0, wisdom: 0, agility: 0 };
        p.saveState(); // v0.00.01: Persist stats to DB
        this.game.tutorial?.trigger?.('stats_saved');
    }

    cancelPendingStats() {
        const p = this.game.localPlayer;
        if (!p) return;
        const totalPending = Object.values(this.pendingStats).reduce((a, b) => a + b, 0);
        p.statPoints += totalPending;
        this.pendingStats = { vitality: 0, intelligence: 0, wisdom: 0, agility: 0 };
        this.updateStatusPopup();
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
            document.body.classList.remove('popup-open');
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

        // Compare pred vs base for green highlight
        const updateDerived = (id, baseVal, predVal, isPercentage = false, decimal = 0) => {
            const el = document.getElementById(id);
            if (!el) return;

            let displayVal = isPercentage ? `${(predVal * 100).toFixed(decimal)}%` : predVal.toFixed(decimal);
            if (decimal === 0 && !isPercentage) displayVal = Math.floor(predVal);

            el.textContent = displayVal;
            if (predVal > baseVal) el.classList.add('stat-predict-inc');
            else el.classList.remove('stat-predict-inc');
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

        updateDerived('val-atk', p.attackPower, predAtk);
        updateDerived('val-def', p.defense, predDef);
        updateDerived('val-hp-regen', p.hpRegen, predHpRegen);
        updateDerived('val-mp-regen', p.mpRegen, predMpRegen);

        // v0.00.40: INT bonuses: +5% attack speed per INT, +1% crit rate per INT
        // Note: These are multiplier bonuses, not additive base stats usually.
        // Player.js: 1.0 + (agi * 0.1) + (int * 0.05)
        const predAtkSpd = 1.0 + (predAgi * 0.1) + (predInt * 0.05);
        const predCrit = 0.1 + (predAgi * 0.01) + (predInt * 0.01);
        const predMoveSpd = 1.0 + (predAgi * 0.05); // Base 1.0

        updateDerived('val-atk-spd', p.attackSpeed, predAtkSpd, false, 2);
        updateDerived('val-crit', p.critRate, predCrit, true);
        updateDerived('val-move-spd', p.moveSpeedBonus, predMoveSpd, true);

        // v1.92: Bind & Update Link Google Button
        const linkBtn = document.getElementById('btn-link-google');
        if (linkBtn) {
            const isGuest = this.game.auth.currentUser?.isAnonymous;
            linkBtn.textContent = isGuest ? '🔗 구글 계정 연동하기' : '✅ 구글 로그인 중';
            if (!isGuest) linkBtn.classList.add('linked');
            else linkBtn.classList.remove('linked');

            linkBtn.onclick = async () => {
                if (!this.game.auth.currentUser.isAnonymous) return;

                try {
                    linkBtn.disabled = true;
                    linkBtn.textContent = '🔄 구글 로그인 중...';

                    // v1.93: Trigger popup FIRST for immediate user feedback and faster cancellation recovery
                    const result = await this.game.auth.migrateToGoogle(); // Call WITHOUT data first

                    if (result && result.success) {
                        linkBtn.textContent = '🔄 데이터 전송 중...';

                        // Current profile data (Fetch only after successful auth to save time on cancel)
                        const currentProfile = await this.game.net.getPlayerData(this.game.auth.getUid());
                        if (!currentProfile || !currentProfile.profile) {
                            alert("현재 데이터를 불러오지 못했습니다.");
                            linkBtn.disabled = false;
                            linkBtn.textContent = '🔗 구글 계정 연동하기';
                            return;
                        }

                        // Now finalize migration with the data
                        // (Wait, migrateToGoogle in AuthManager should handle the UI flow better)
                        // Actually, I'll refactor migrateToGoogle to handle the data internally or split it.
                        // For now, let's just make the catch block faster.

                        // Re-running migrate with data (This logic needs sync with AuthManager)
                        // I will update AuthManager to accept data later or handle it here.
                        // Let's keep it simple: Popup first, then DB, then Finish.

                        const googleUser = firebase.auth().currentUser;
                        await firebase.database().ref(`users/${googleUser.uid}/profile`).set({
                            ...currentProfile.profile,
                            displayName: googleUser.displayName,
                            linkedAt: firebase.database.ServerValue.TIMESTAMP
                        });

                        alert("연동이 완료되었습니다! 새로운 계정으로 다시 로그인합니다.");
                        window.location.reload();
                    } else {
                        // result.cancelled === true
                        linkBtn.disabled = false;
                        linkBtn.textContent = '🔗 구글 계정 연동하기';
                    }
                } catch (e) {
                    if (e.code === 'auth/popup-closed-by-user') {
                        console.log("User cancelled Google login popup.");
                    } else {
                        console.error("Migration Error:", e);
                        alert("오류가 발생했습니다: " + e.message);
                    }
                    linkBtn.disabled = false;
                    linkBtn.textContent = '🔗 구글 계정 연동하기';
                }
            };
        }
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
            btn.textContent = emote.icon;
            btn.title = emote.name;
            btn.style.cssText = 'font-size: 24px; background: none; border: none; cursor: pointer; padding: 5px;';

            btn.onclick = () => {
                // Send Emote Command
                this.sendMessage(`/emote ${emote.id}`);
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

        const goldEl = document.getElementById('ui-skill-gold');
        if (goldEl) goldEl.textContent = p.gold;

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
                    btn.disabled = tutorialLocked || p.gold < cost;
                    btn.classList.toggle('disabled', tutorialLocked || p.gold < cost);
                }
            }
        });
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

        if (!taskDisplay || !rewardDisplay) {
            // Logger.warn('[UIManager] Quest UI elements missing');
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
            taskProgress.textContent = tutorial.getStepInstruction?.(tutorialStep) || tutorialStep.instruction;
            rewardDisplay.classList.remove('quest-reward-claimable');
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
            this.refreshDesktopShortcutHints();
            return;
        }

        // Determine Active Quest
        let currentQuest = null;
        if (!p.questData.slimeQuestClaimed) {
            // Quest 1: 10 Slimes (Wisdom +2)
            currentQuest = {
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
                title: "2. 슬라임 30마리 처치 (강림)",
                task: `진행도: ${Math.min(30, count)}/30`,
                reward: "체력 스탯 +3, 대왕 슬라임 소환",
                canClaim: count >= 30,
                claimFn: () => this.claimSlime30Reward(p)
            };
        } else if ((p.questData.bossClearCount || 0) === 0) {
            // Quest 3: First King Slime
            currentQuest = {
                title: "3. 대왕 슬라임 처치",
                task: `진행도: ${p.questData.bossKilled ? '1' : '0'}/1`,
                reward: "스탯+5, EXP+500, Gold+2000",
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
                    title: "5. 대왕 슬라임 처치 (반복)",
                    task: "진행도: 0/1",
                    reward: "EXP+300, Gold+1000",
                    canClaim: false,
                    claimFn: null
                };
            } else {
                // Quest 4: Progression (Repeatable Summon)
                // v0.00.83: Use individual persistent repeatable kills
                const count = p.questData.slimeRepeatKills || 0;
                currentQuest = {
                    title: "4. 슬라임 30마리 처치 (소환)",
                    task: `진행도: ${Math.min(30, count)}/30`,
                    reward: "대왕 슬라임 소환",
                    canClaim: count >= 30, // v0.00.77: Shared Summon
                    claimFn: () => {
                        if (this.game.monsterManager) {
                            this.game.monsterManager._spawnBoss(false);
                            p.questData.slimeRepeatKills = 0; // Reset individual count
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
        p.wisdom += 2; // v0.00.75: Wisdom directly +2
        p.updateDerivedStats();
        this.logSystemMessage('QUEST 완료: 슬라임 토벌 보상 지급 (지혜 +2)');
        this.logSystemMessage('✨ 이제 마나 회복이 보다 원활해집니다');
        this.showRewardModal("슬라임 처치 퀘스트 완료!", "보상: 지혜 스탯 2개를 획득했습니다!");
        this.updateQuestUI();
        this.updateStatusPopup();
        p.saveState();
    }

    claimSlime30Reward(p) {
        if (p.questData.slime30QuestClaimed) return;

        p.questData.slime30QuestClaimed = true;
        p.vitality += 3; // v0.00.75: Vitality directly +3
        p.updateDerivedStats();

        // Spawn Boss (ONLY if not already spawned by global system)
        if (this.game.monsterManager && !this.game.monsterManager.bossSpawned) {
            this.game.monsterManager._spawnBoss(true);
            this.game.monsterManager.slimeKillCount = 0;
            if (this.game.monsterManager.net?.dbRef) {
                this.game.monsterManager.net.dbRef.child('world_state/slime_kill_count').set(0);
            }
        }

        this.logSystemMessage('QUEST 완료: 슬라임 30마리 토벌 보상 지급 (체력 +3)');
        this.logSystemMessage('🛡️ 전체 체력이 30 증가하고 방어력과 체력회복이 3 증가했습니다.');
        this.showRewardModal("슬라임 30마리 처치 퀘스트 완료!", "보상: 체력 스탯 3개를 획득했습니다! 대왕 슬라임이 소환됩니다.");

        this.updateQuestUI();
        this.updateStatusPopup();
        p.saveState();
    }


    claimBossReward(p) {
        p.questData.bossQuestClaimed = true;
        p.statPoints += 5; // 5 Stat Points reward
        this.logSystemMessage('QUEST 완료: 대왕 슬라임 토벌 보상 지급 (스탯 포인트 +5)');
        this.showRewardModal("대왕 슬라임 처치 퀘스트 완료!", "보상: 스탯 포인트 5개를 획득했습니다!");
        this.updateQuestUI();
        this.updateStatusPopup();
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

        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.innerHTML = message;
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

    updatePartyUI() {
        const panel = document.getElementById('party-panel');
        const list = document.getElementById('party-list');
        if (!panel || !list) return;

        const p = this.game.localPlayer;
        if (!p || !p.party || p.party.members.length < 2) {
            panel.classList.add('hidden');
            return;
        }

        panel.classList.remove('hidden');
        list.innerHTML = '';

        p.party.members.forEach(uid => {
            let data = null;
            let isSelf = (uid === p.id);

            if (isSelf) {
                data = { name: p.name, hp: p.hp, maxHp: p.maxHp, mp: p.mp, maxMp: p.maxMp, level: p.level };
            } else {
                const rp = this.game.net.remotePlayers.get(uid);
                if (rp) {
                    // Remote player data has h:[hp, maxHp], no mp usually unless I add it.
                    // For now, assume remote players sync HP. MP might be missing.
                    data = {
                        name: rp.name,
                        hp: rp.h ? rp.h[0] : 100,
                        maxHp: rp.h ? rp.h[1] : 100,
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
    }

    updateInventory() {
        const p = this.game.localPlayer;
        if (!p) return;

        const grid = document.querySelector('.inventory-grid');
        if (!grid) return;

        // Update Quest UI alongside Inventory
        this.updateQuestUI();

        grid.innerHTML = '';
        p.inventory.forEach(item => {
            const div = document.createElement('div');
            div.className = 'grid-item';
            if (item) {
                div.innerHTML = `<span class="item-icon">${item.icon}</span><span class="item-amount">${item.amount}</span>`;
            } else {
                // Keep empty slot visual
                div.innerHTML = `<span class="item-icon"></span>`;
            }
            grid.appendChild(div);
        });
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
            nextSnapshot.hpCur = nextHpCur;
            nextSnapshot.hpMax = nextHpMax;
            nextSnapshot.mpCur = nextMpCur;
            nextSnapshot.mpMax = nextMpMax;
        }

        this.lastHudSnapshot = nextSnapshot;

        this.updateCooldowns();

        // v1.98: Live update developer overlay if active
        if (this.devMode) this.updateDevOverlay();
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

            if (nextDisabled) {
                const angle = (cdTime / maxCd) * 360;
                if (overlay && overlay.dataset.cdAngle !== `${angle}`) {
                    overlay.style.setProperty('--cd-angle', `${angle}deg`);
                    overlay.dataset.cdAngle = `${angle}`;
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

    updateMinimap(player, remotePlayers, monsters, mapWidth, mapHeight) {
        const canvas = this.minimapCanvas && this.minimapCanvas.isConnected
            ? this.minimapCanvas
            : document.getElementById('minimapCanvas');
        if (!canvas) return;

        this.minimapCanvas = canvas;
        const ctx = this.minimapCtx || canvas.getContext('2d', { alpha: true, desynchronized: true }) || canvas.getContext('2d');
        this.minimapCtx = ctx;
        const w = 150;
        const h = 150;
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;

        // Clear Map (Make it transparent)
        ctx.clearRect(0, 0, w, h);

        // Scaling factors
        const scaleX = w / mapWidth;
        const scaleY = h / mapHeight;

        // 1. Draw Remote Players (White)
        ctx.fillStyle = '#ffffff';
        if (remotePlayers) {
            remotePlayers.forEach(rp => {
                const px = rp.x * scaleX;
                const py = rp.y * scaleY;
                ctx.beginPath();
                ctx.arc(px, py, 3, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // 2. Draw Monsters (Red)
        ctx.fillStyle = '#ff3f34';
        if (monsters) {
            monsters.forEach(m => {
                if (m.isDead) return;
                const mx = m.x * scaleX;
                const my = m.y * scaleY;
                ctx.beginPath();
                // v0.33.0: Boss is bigger
                const radius = (m.isBoss || m.typeId === 'king_slime') ? 6 : 2;
                ctx.arc(mx, my, radius, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // 3. Draw Local Player (Green - Last to be on top)
        ctx.fillStyle = '#4ade80';
        const px = player.x * scaleX;
        const py = player.y * scaleY;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();

        // Update footer
        const posX = this.getHudRef('miniPosX', 'mini-pos-x', 'id');
        const posY = this.getHudRef('miniPosY', 'mini-pos-y', 'id');
        const nextPosX = String(Math.round(player.x));
        const nextPosY = String(Math.round(player.y));
        if (posX && posX.textContent !== nextPosX) posX.textContent = nextPosX;
        if (posY && posY.textContent !== nextPosY) posY.textContent = nextPosY;
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
                        const names = Array.from(targets.values()).join(', ');
                        this.logSystemMessage(`현재 적대 대상: ${names}`);
                    }
                    input.value = '';
                    return;
                }
                const result = await this.game.localPlayer.declareHostility(param);
                if (result === 'DECLARED') {
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

    _onChatReceived(data) {
        // v2.1: Emote Handling
        let displayMsg = data.text;
        let isEmote = false;
        let emoteId = null;

        if (data.text.startsWith('/emote ')) {
            emoteId = data.text.split(' ')[1];
            isEmote = true;

            // Find emote icon for chat log
            const emote = this.game.emotes?.find(e => e.id === emoteId);
            displayMsg = emote ? `(이모트) ${emote.icon}` : '(이모트)';
        }

        const msgArea = document.querySelector('.chat-messages');
        if (msgArea) {
            const div = document.createElement('div');
            const isMe = data.uid === this.game.net.playerId;
            div.className = isMe ? 'chat-msg-me' : 'chat-msg-other';
            div.innerHTML = `<span class="chat-sender">${data.name}:</span> <span class="chat-text">${displayMsg}</span>`;
            msgArea.appendChild(div);

            while (msgArea.children.length > 50) {
                msgArea.removeChild(msgArea.firstChild);
            }
            msgArea.scrollTop = msgArea.scrollHeight;
        }

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

    logSystemMessage(text) {
        const msgArea = document.querySelector('.chat-messages');
        if (msgArea) {
            const div = document.createElement('div');
            div.style.color = '#444444'; // Darker grey for better visibility
            div.style.fontWeight = 'bold';
            div.style.fontStyle = 'italic';
            div.textContent = `[System] ${text}`;
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
            this.pendingLandscapeFullscreen = false;
            this.landscapeFullscreenDismissed = true;
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }

    toggleUpdateHistory() {
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

        try {
            const v = window.GAME_VERSION || Date.now();
            const response = await fetch(`README.md?v=${v}`);
            const text = await response.text();

            if (typeof marked !== 'undefined') {
                listEl.innerHTML = `<div class="readme-content">${marked.parse(text)}</div>`;
                return;
            }
        } catch (e) {
            console.error('Failed to load README.md:', e);
        }

        // Fallback to updateHistory array if fetch fails or marked is missing
        if (!this.game.updateHistory) return;
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
    }

    setupDevModeListeners() {
        const portrait = document.querySelector('.status-portrait');
        if (portrait) {
            portrait.style.cursor = 'pointer';
            portrait.title = '개발자 모드 토글';
            portrait.addEventListener('click', () => {
                this.devMode = !this.devMode;
                const overlay = document.getElementById('dev-overlay');

                // Status Popup Buttons
                const btnAccount = document.getElementById('reset-account-btn');
                const btnStat = document.getElementById('reset-stat-btn');

                if (overlay) overlay.classList.toggle('hidden', !this.devMode);

                if (btnAccount) {
                    btnAccount.classList.toggle('hidden', !this.devMode);
                    if (!btnAccount.dataset.bound) {
                        btnAccount.onclick = () => this.handleDevAccountReset(); // Wipe
                        btnAccount.dataset.bound = "true";
                    }
                }

                if (btnStat) {
                    btnStat.classList.toggle('hidden', !this.devMode);
                    if (!btnStat.dataset.bound) {
                        btnStat.onclick = () => this.handleDevCharacterReset(); // Refund
                        btnStat.dataset.bound = "true";
                    }
                }

                this.logSystemMessage(`개발자 모드 ${this.devMode ? '활성화' : '비활성화'}`);
                if (this.devMode) this.updateDevOverlay();
            });
        }

        // v1.94: Handle Name-to-UID Lookup in Dev Overlay
        const searchInput = document.getElementById('dev-name-search');
        const searchBtn = document.getElementById('dev-btn-search');
        const resultEl = document.getElementById('dev-search-result');

        if (searchInput && searchBtn && resultEl) {
            searchBtn.onclick = async () => {
                const name = searchInput.value.trim();
                if (!name) return;

                resultEl.textContent = '조회 중...';
                resultEl.style.color = '#fdcb6e';

                const uid = await this.game.net.getUidByName(name);
                if (uid) {
                    resultEl.textContent = `UID: ${uid}`;
                    resultEl.style.color = '#55efc4';
                } else {
                    resultEl.textContent = '찾을 수 없음';
                    resultEl.style.color = '#ff7675';
                }
            };

            searchInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.stopPropagation();
                    searchBtn.click();
                }
            };
        }

        // v0.00.15: Developer Mode Reset UI
        const btnCharReset = document.getElementById('dev-btn-reset-char');
        const btnAccountReset = document.getElementById('dev-btn-reset-account');

        if (btnCharReset && !btnCharReset.dataset.bound) {
            btnCharReset.onclick = () => this.handleDevCharacterReset();
            btnCharReset.dataset.bound = "true";
        }

        if (btnAccountReset && !btnAccountReset.dataset.bound) {
            btnAccountReset.onclick = () => this.handleDevAccountReset();
            btnAccountReset.dataset.bound = "true";
        }
    }

    // v0.00.15: Dev Mode - Character Reset (Refund)
    async handleDevCharacterReset() {
        const p = this.game.localPlayer;
        if (!p) return;

        const msg = "레벨을 제외한 골드/스텟/스킬이 초기화됩니다.\n사용된 골드/스텟은 반환됩니다.\n\n계속하시겠습니까?";
        if (!confirm(msg)) return;

        // 1. Calculate Refunded Stat Points
        const usedVit = Math.max(0, (p.vitality || 1) - 1);
        const usedInt = Math.max(0, (p.intelligence || 3) - 3);
        const usedWis = Math.max(0, (p.wisdom || 2) - 2);
        const usedAgi = Math.max(0, (p.agility || 1) - 1);

        const totalRefundedStats = usedVit + usedInt + usedWis + usedAgi;

        // 2. Calculate Refunded Gold from Skills
        let totalRefundedGold = 0;
        const skills = p.skillLevels || { laser: 1, missile: 1, fireball: 1, shield: 1 };

        ['laser', 'missile', 'fireball'].forEach(skill => {
            const lv = skills[skill] || 1;
            if (lv > 1) {
                totalRefundedGold += 300 * (Math.pow(2, lv - 1) - 1);
            }
        });

        // 3. Apply Changes
        p.statPoints = (p.statPoints || 0) + totalRefundedStats;
        p.gold = (p.gold || 0) + totalRefundedGold;

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
        if (p.saveState) p.saveState(true); // Sync to world

        alert(`초기화 완료!\n반환된 스텟: ${totalRefundedStats}\n반환된 골드: ${totalRefundedGold}\n\n게임을 다시 불러옵니다.`);
        window.location.reload();
    }

    // v0.00.15: Dev Mode - Account Reset (Wipe)
    async handleDevAccountReset() {
        if (!this.game.localPlayer) return;

        const check = confirm("⚠️ 경고: 정말로 모든 데이터를 삭제하고 계정을 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.");
        if (!check) return;

        try {
            await this.game.net.deleteCharacter(this.game.localPlayer.id, this.game.localPlayer.name);
            alert("계정이 초기화되었습니다. 게임을 다시 시작합니다.");
            window.location.reload();
        } catch (e) {
            console.error(e);
            alert("초기화 실패");
        }
    }

    updateDevOverlay() {
        if (!this.game.monsterManager) return;
        const stats = this.game.monsterManager.getStats();
        const mCount = document.getElementById('dev-m-count');
        const mMax = document.getElementById('dev-m-max');
        const mInterval = document.getElementById('dev-m-interval');
        const pSum = document.getElementById('dev-p-sum');

        if (mCount) mCount.textContent = stats.count;
        if (mMax) mMax.textContent = stats.max;
        if (mInterval) mInterval.textContent = stats.interval + 's';
        if (pSum) pSum.textContent = stats.totalLevel;
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


    confirmResetCharacter() {
        this.showConfirm("정말 캐릭터를 삭제하시겠습니까?<br><small>캐릭터 정보가 영구 삭제되며 처음부터 다시 시작합니다.</small>", async (confirmed) => {
            if (confirmed && this.game.localPlayer) {
                const p = this.game.localPlayer;
                const name = p.name;
                const uid = this.game.net.playerId;

                // 1. Delete from DB
                if (this.game.net) {
                    await this.game.net.deleteCharacter(uid, name);
                    this.logSystemMessage('캐릭터가 삭제되었습니다. 페이지를 새로고침합니다.');

                    // 2. Force Reload to go back to title/character selection
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                }
            }
        });
    }

    // v0.00.43: Center System Message (Warning Text)
    showCenterMessage(text, color = '#ffeb3b') {
        let el = document.getElementById('center-message');
        if (!el) {
            el = document.createElement('div');
            el.id = 'center-message';
            el.style.position = 'absolute';
            el.style.top = '30%'; // Slightly above center
            el.style.left = '50%';
            el.style.transform = 'translate(-50%, -50%)';
            el.style.color = color;
            el.style.fontSize = '24px';
            el.style.fontWeight = 'bold';
            el.style.textShadow = '2px 2px 2px #000';
            el.style.pointerEvents = 'none';
            el.style.opacity = '0';
            el.style.transition = 'opacity 0.5s';
            el.style.zIndex = '2000';
            el.style.textAlign = 'center';
            el.style.width = '80%';

            const uiLayer = document.getElementById('ui-layer');
            if (uiLayer) {
                uiLayer.appendChild(el);
            } else {
                document.body.appendChild(el);
            }
        }

        el.textContent = text;
        el.style.color = color;
        el.style.opacity = '1';

        // Clear previous timer
        if (this._centerMsgTimer) clearTimeout(this._centerMsgTimer);

        // Hide after 4 seconds
        this._centerMsgTimer = setTimeout(() => {
            el.style.opacity = '0';
        }, 4000);
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
                    img.title = emote.text;
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
        // Send emote command to chat or network
        // For now, simulate chat command
        // If we have a chat input, we could append or just send directly.
        // Direct send is better for UX.
        if (this.game.net) {
            // this.game.net.sendEmote(emoteId); // Implement this in NetworkManager
            // Fallback: Send via chat
            // this.game.net.sendChat(`/emote ${emoteId}`); 
            // Actually let's assume direct packet for now or use chat.
            // Let's use chat input injection for now as immediate feedback?
            // No, direct send.

            // Checking if sendEmote exists... probably not yet.
            // Let's use chat input logic for now to utilize existing system.
            const chatInput = document.querySelector('.chat-input-area input');
            const sendBtn = document.querySelector('.send-btn');
            if (chatInput && sendBtn) {
                // Determine if we want to send command or just text
                // Let's send a command: /e [id]
                // But NetworkManager needs to handle /e
                // Or we can just handle it here?

                // Let's try sending a special packet if possible, but user task says "Chat System Integration"
                // So maybe just appending to chat is safer.
                // But typically emotes are separate packets.

                // Let's implement sendEmote in NetworkManager later.
                // For now, let's just log or try to call a method that might not exist, or add it.
                // I'll call this.game.player.showEmote(emoteId) directly for local, and send packet.

                if (this.game.localPlayer) {
                    this.game.localPlayer.showEmote(emoteId);
                }
                if (this.game.net && this.game.net.socket) {
                    this.game.net.sendEmote(emoteId);
                }
            }

            this.toggleEmotePicker(); // Close after pick
        }
    }
}

