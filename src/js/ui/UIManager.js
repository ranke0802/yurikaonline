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
        this.lastMinimapSignature = null;
        this.lastHudSnapshot = null;
        this.lastCooldownUiUpdate = 0;
        this.lastDevOverlayUpdate = 0;
        this.selectedInventoryRef = null;
        this.pendingEnhancementStoneType = null;
        this.inventoryDragState = null;
        this.inventoryClickSuppressUntil = 0;
        this.questClaimAvailable = false;
        this.handleDesktopShortcutKeydown = this.handleDesktopShortcutKeydown.bind(this);
        this.refreshDesktopShortcutHints = this.refreshDesktopShortcutHints.bind(this);
        this.handleInventorySlotPointerMove = this.handleInventorySlotPointerMove.bind(this);
        this.handleInventorySlotPointerUp = this.handleInventorySlotPointerUp.bind(this);
        this.setupEventListeners();
        this.setupFullscreenListeners();
        this.setupDevModeListeners();
        this.inputManager = game.input; // Local reference
        this.tutorialGuideState = null;
        this.tutorialHighlightLayer = null;
        this.tutorialHighlightTargets = [];
        this.tutorialHighlightState = { targets: [], mode: 'ring', label: '' };
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
        this.setupInventoryInteractions();
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
            return Number.isFinite(cost) && player.gold >= cost;
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

        this.setAlertDotState('status-alert-dot', statusAvailable);
        this.setAlertDotState('skill-alert-dot', skillAvailable);
        this.setAlertDotState('quest-alert-dot', false);
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

    startWeaponEnhancementSelection(stoneType = 'normal') {
        const player = this.game.localPlayer;
        const meta = this.getEnhancementStoneMeta(stoneType);
        if (!player || !meta) return false;

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
        this.closeInventoryItemModal(true);
        this.logSystemMessage(meta.selectionMessage);
        this.updateInventory();
        return true;
    }

    executeWeaponEnhancementForSelection(selection) {
        const player = this.game.localPlayer;
        const itemData = this.game.itemData;
        const meta = this.getEnhancementStoneMeta();
        if (!player || !itemData || !meta) return;

        const target = player.resolveWeaponSelection(selection);
        if (!target?.item) {
            this.showGenericModal(meta.modalTitle, '강화할 무기를 선택해 주세요.', null, null, { hideNo: true, yesText: '확인' });
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

        const finalizeSelectionState = (result) => {
            this.pendingEnhancementStoneType = null;

            if (result?.destroyed) {
                this.selectedInventoryRef = null;
                this.closeInventoryItemModal(true);
                return;
            }

            if (selection?.kind === 'equipment') {
                this.selectedInventoryRef = { kind: 'equipment', slot: 'weapon' };
            } else if (selection?.kind === 'inventory') {
                this.selectedInventoryRef = { kind: 'inventory', index: selection.index };
            }

            document.getElementById('inventory-item-modal')?.classList.remove('hidden');
        };

        const executeEnhance = () => {
            const result = player.enhanceWeapon(selection, { stoneType: meta.stoneType });
            if (!result.ok) {
                this.pendingEnhancementStoneType = null;
                this.showGenericModal(`${meta.modalTitle} 실패`, result.message, null, null, { hideNo: true, yesText: '확인' });
                this.updateInventory();
                return;
            }

            finalizeSelectionState(result);

            if (result.success) {
                if (meta.stoneType === 'blessed') {
                    this.showGenericModal(
                        '축복 강화 성공',
                        `${target.item.name}이(가) +${result.nextLevel} 강화에 성공했습니다. (${result.gain > 0 ? `+${result.gain}` : '유지'})`,
                        null,
                        null,
                        { hideNo: true, yesText: '확인' }
                    );
                    this.logSystemMessage(`✨ ${target.item.name} 축복 강화 성공 (${result.gain > 0 ? `+${result.gain}` : '유지'})`);
                } else {
                    this.showGenericModal('강화 성공', `${target.item.name}이(가) +${result.nextLevel} 강화에 성공했습니다.`, null, null, { hideNo: true, yesText: '확인' });
                    this.logSystemMessage(`✨ ${target.item.name} +${result.nextLevel} 강화 성공`);
                }
            } else if (result.destroyed) {
                this.showGenericModal('강화 파괴', '강화에 실패해 장비가 파괴되었습니다.', null, null, { hideNo: true, yesText: '확인' });
                this.logSystemMessage('💥 강화 실패로 장비가 파괴되었습니다.');
            } else if (meta.stoneType === 'blessed') {
                this.showGenericModal('축복 강화 실패', '축복의 힘으로 강화는 실패했지만 현재 강화 수치는 유지되었습니다.', null, null, { hideNo: true, yesText: '확인' });
                this.logSystemMessage('✨ 축복 강화 실패, 장비는 유지되었습니다.');
            } else {
                this.showGenericModal('강화 실패', '강화에 실패했습니다. 장비는 유지됩니다.', null, null, { hideNo: true, yesText: '확인' });
                this.logSystemMessage('강화에 실패했습니다. 장비는 유지되었습니다.');
            }

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

    getTutorialFocusRects(targets = []) {
        const normalizedTargets = Array.isArray(targets) ? targets : [targets];
        return normalizedTargets
            .map((target) => this.resolveTutorialHighlightTarget(target))
            .map((element) => this.getVisibleElementRect(element))
            .filter(Boolean);
    }

    getRectContains(inner, outer) {
        if (!inner || !outer) return false;
        return inner.left >= outer.left
            && inner.right <= outer.right
            && inner.top >= outer.top
            && inner.bottom <= outer.bottom;
    }

    getTutorialForbiddenZones(focusRects = [], payload = this.tutorialGuideState) {
        const selectors = [
            '#minimap-container',
            '.minimap-menu',
            '#btn-fullscreen',
            '#btn-emote-shortcut',
            '.quest-list-panel',
            '.chat-window',
            '.action-buttons',
            '#joystick-container',
            '#joystick-area',
            '#dialog-box:not(.hidden)'
        ];

        const zones = selectors
            .map((selector) => this.getVisibleElementRect(selector))
            .filter(Boolean);

        const activePopup = document.querySelector('#popup-overlay:not(.hidden) .game-popup:not(.hidden)');
        const popupRect = this.getVisibleElementRect(activePopup);
        const shouldReservePopup = popupRect && !focusRects.some((rect) => this.getRectContains(rect, popupRect));
        if (shouldReservePopup && payload?.mode !== 'dock-left') zones.push(popupRect);

        return zones;
    }

    getTutorialGuideDimensions(payload) {
        const mode = this.getTutorialViewportMode();
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const compactRatio = payload?.compact ? 0.9 : 1;

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

    buildTutorialGuideCandidates(guideMode, width, height, focusRects = []) {
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
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

        if (focusRects[0]) {
            const focus = focusRects[0];
            pushCandidate(focus.left + (focus.width / 2) - (width / 2), focus.top - height - 14, 'target-top');
            pushCandidate(focus.left + (focus.width / 2) - (width / 2), focus.bottom + 14, 'target-bottom');
            pushCandidate(focus.right + 14, focus.top + (focus.height / 2) - (height / 2), 'target-right');
            pushCandidate(focus.left - width - 14, focus.top + (focus.height / 2) - (height / 2), 'target-left');
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

    scoreTutorialGuideCandidate(candidate, forbiddenZones = [], focusRects = [], order = 0) {
        const rect = {
            left: candidate.left,
            top: candidate.top,
            right: candidate.left + candidate.width,
            bottom: candidate.top + candidate.height,
            width: candidate.width,
            height: candidate.height
        };

        let score = order;
        forbiddenZones.forEach((zone) => {
            score += this.getRectOverlapArea(rect, zone) * 1.15;
        });
        focusRects.forEach((zone) => {
            score += this.getRectOverlapArea(rect, zone) * 2.4;
        });

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
        const guideMode = payload.mode || 'top-card';
        const guideDimensions = this.getTutorialGuideDimensions(payload);
        const focusRects = this.getTutorialFocusRects(payload.focusTargets || this.tutorialHighlightTargets);
        const forbiddenZones = this.getTutorialForbiddenZones(focusRects, payload);

        guide.dataset.guideMode = guideMode;
        guide.dataset.stepType = payload.stepType || 'info';
        guide.dataset.align = payload.align || 'left';
        guide.classList.toggle('tutorial-guide-compact', !!payload.compact);

        guide.style.position = 'fixed';
        guide.style.left = '-9999px';
        guide.style.top = '-9999px';
        guide.style.right = 'auto';
        guide.style.bottom = 'auto';
        guide.style.transform = 'none';
        guide.style.boxSizing = 'border-box';
        guide.style.pointerEvents = 'none';
        guide.style.zIndex = '4600';
        guide.style.width = `${guideDimensions.width}px`;
        guide.style.maxWidth = `${guideDimensions.width}px`;
        guide.style.maxHeight = `${guideDimensions.maxHeight}px`;
        guide.style.overflowY = 'auto';
        guide.style.display = 'block';
        guide.style.visibility = 'hidden';

        const rect = guide.getBoundingClientRect();
        const width = Math.min(guideDimensions.width, rect.width || guideDimensions.width);
        const height = Math.min(guideDimensions.maxHeight, rect.height || guideDimensions.maxHeight);
        const candidates = this.buildTutorialGuideCandidates(guideMode, width, height, focusRects);
        const bestCandidate = candidates.reduce((best, candidate, index) => {
            const score = this.scoreTutorialGuideCandidate(candidate, forbiddenZones, focusRects, index);
            if (!best || score < best.score) {
                return { ...candidate, score };
            }
            return best;
        }, null);

        guide.style.left = `${bestCandidate?.left ?? 16}px`;
        guide.style.top = `${bestCandidate?.top ?? 16}px`;
        guide.style.visibility = 'visible';
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
                focusTargets: []
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
                focusTargets: payload?.focusTargets || []
            };

        let guide = document.getElementById('tutorial-guide');
        if (!guide) {
            guide = document.createElement('div');
            guide.id = 'tutorial-guide';
            document.body.appendChild(guide);
        }

        this.tutorialGuideState = normalizedPayload;
        guide.innerHTML = '';

        const head = document.createElement('div');
        head.className = 'tutorial-guide-head';

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

        const body = document.createElement('div');
        body.className = 'tutorial-guide-body';
        body.textContent = normalizedPayload.text;

        guide.appendChild(head);
        guide.appendChild(body);

        guide.dataset.align = normalizedPayload.align;
        guide.dataset.stepType = normalizedPayload.stepType;
        guide.style.display = 'block';
        this.applyTutorialGuideLayout(guide, normalizedPayload);
    }

    hideTutorialGuide() {
        const guide = document.getElementById('tutorial-guide');
        if (guide) guide.style.display = 'none';
        this.tutorialGuideState = null;
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
            missile: { name: '매직 미사일 (H)', desc: '특징: 가까운 적의 현재 위치를 먼저 고정한 뒤, 그 지점을 향해 자연스럽게 휘어 들어가는 미사일을 순차 발사합니다.<br>성장: 레벨이 오를수록 한 번에 발사되는 미사일 수가 늘고 마나 소모도 함께 증가합니다.' },
            fireball: { name: '파이어볼 (U)', desc: '특징: 직선으로 날아가 폭발하며 범위 피해와 화상을 남기는 광역 스킬입니다.<br>성장: 레벨이 오를수록 직격 피해, 폭발 반경, 화상 지속시간이 함께 증가합니다.' },
            shield: { name: '앱솔루트 베리어 (K)', desc: '특징: 다음 1회의 피격을 완전히 막는 생존용 방어막입니다.<br>성장: 레벨업이 없는 고정 성능 스킬이며, 항상 같은 성능으로 유지됩니다.' }
        };

        this.bindSkillTooltipTargets();

        const autoAttackToggle = document.getElementById('action-auto-toggle');
        const handleAutoAttackToggle = (e) => {
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

        const skillDetailModal = document.getElementById('skill-detail-modal');
        const skillDetailCloseBtn = document.getElementById('skill-detail-modal-close');
        const skillDetailCloseBottomBtn = document.getElementById('skill-detail-modal-close-bottom');
        const handleSkillDetailClose = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            this.hideSkillDetailModal();
        };
        skillDetailCloseBtn?.addEventListener('click', handleSkillDetailClose);
        skillDetailCloseBtn?.addEventListener('touchstart', handleSkillDetailClose, { passive: false });
        skillDetailCloseBottomBtn?.addEventListener('click', handleSkillDetailClose);
        skillDetailCloseBottomBtn?.addEventListener('touchstart', handleSkillDetailClose, { passive: false });
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
                this.pendingStats = { vitality: 0, intelligence: 0, wisdom: 0, agility: 0 };
                this.updateStatusPopup();
            }
            if (id === 'inventory-popup') {
                this.pendingEnhancementStoneType = null;
                this.selectedInventoryRef = null;
                this.closeInventoryItemModal(true);
                this.updateInventory();
            }
            if (id === 'skill-popup') this.updateSkillPopup();
            this.isPaused = true;
            this.game.tutorial?.trigger?.('popup_open', { target: id });
        } else {
            if (this.game.sound) this.game.sound.playSfx('ui_close');
            this.overlay.classList.add('hidden');
            document.body.classList.remove('popup-open');
            if (id === 'inventory-popup') {
                this.pendingEnhancementStoneType = null;
            }
            this.closeInventoryItemModal(true);
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

    formatSkillPercent(value, digits = 0) {
        const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
        return `${(safe * 100).toFixed(digits)}%`;
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
            console.error('Failed to parse README.md with marked:', error);
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
                const maxRatio = 1.0;
                const maxChains = 1 + lv;
                const weaponMultiplier = 1 + (weaponCombat.laserDamageBonus || 0);
                const minBaseDamage = Math.ceil(attackPower * baseRatio * weaponMultiplier);
                const maxBaseDamage = Math.ceil(attackPower * maxRatio * weaponMultiplier);
                const statBonus = (p.intelligence + p.wisdom) * 0.05;
                const effectiveAttackSpeed = Math.min(2.0, (p.attackSpeed || 1) + statBonus);
                const tickInterval = (0.7 / Math.max(0.1, effectiveAttackSpeed)) * 1.15;

                currentStats.push(
                    `현재 공격력 ${attackPower} 기준 시작 피해는 <strong>${minBaseDamage}</strong>, 완전 충전 기준 최대 피해는 <strong>${maxBaseDamage}</strong>입니다. 둘 다 방어력 적용 전 수치입니다.`,
                    `한 번의 틱에 최대 <strong>${maxChains}명</strong>까지 연쇄되고, 사거리는 <strong>${Math.round(p.attackRange)}</strong>입니다.`,
                    `현재 틱 간격은 약 <strong>${tickInterval.toFixed(2)}초</strong>이며, 치명타는 <strong>${critRateText}</strong> 확률로 <strong>x2</strong>가 적용됩니다.`,
                    `적중한 대상마다 MP <strong>+1</strong>을 회복합니다.${weaponCombat.restoreHpPerLaserHit > 0 ? ` 장착 무기 효과로 HP도 <strong>+${weaponCombat.restoreHpPerLaserHit}</strong> 회복합니다.` : ''}`
                );

                summaryMetrics.push(
                    { label: '현재 레벨', value: `Lv.${lv}` },
                    { label: '연쇄 수', value: `${maxChains}명` },
                    { label: '사거리', value: `${Math.round(p.attackRange)}` },
                    { label: '방어 전 피해', value: `${minBaseDamage} ~ ${maxBaseDamage}` },
                    { label: '틱 간격', value: `${tickInterval.toFixed(2)}초` },
                    { label: '치명타', value: `${critRateText} / x2` }
                );

                formulaItems.push(
                    `<code>시작 비율 = 0.10 + 0.05 × (레벨 - 1)</code> → 현재 <strong>${this.formatSkillPercent(baseRatio)}</strong>`,
                    `<code>충전 증가 = 0.10 + 0.05 × (레벨 - 1)</code>를 <strong>0.3초</strong>마다 누적합니다. 현재 증가폭은 <strong>${this.formatSkillPercent(increment)}</strong>입니다.`,
                    `<code>최종 비율 = min(1.0, 시작 비율 + 충전 단계 × 증가 비율)</code>`,
                    `<code>방어 전 피해 = ceil(공격력 × 최종 비율 × 무기 보정)</code>`,
                    `<code>최종 피해 = max(1, 방어 전 피해 - 대상 방어력)</code>`,
                    `<code>치명타 발생 시 최종 피해 × 2</code>`
                );

                settingItems.push(
                    `첫 연쇄는 현재 선택한 타겟을 우선합니다.`,
                    `한 틱 안에서는 이미 맞은 대상에게 다시 연쇄되지 않습니다.`,
                    `실제 감전 적용은 코드 기준으로 <strong>4.0초 동안 50% 둔화</strong>입니다.`,
                    `자동 공격을 켜면 현재 선택한 타겟이 살아 있고 사거리 안에 있을 때만 이 스킬을 자동으로 사용합니다.`
                );

                if ((weaponCombat.laserDamageBonus || 0) > 0) {
                    weaponItems.push(`<strong>${weaponName}</strong> 효과: 체인 라이트닝 피해 <strong>+${this.formatSkillPercent(weaponCombat.laserDamageBonus)}</strong>`);
                }
                if ((weaponCombat.restoreHpPerLaserHit || 0) > 0) {
                    weaponItems.push(`<strong>${weaponName}</strong> 효과: 적중 대상당 HP <strong>+${weaponCombat.restoreHpPerLaserHit}</strong> 회복`);
                }

                tooltipCurrentEffectHtml = `<div class="current-effect">현재 효과 (Lv.${lv}): 연쇄 ${maxChains}명 | 사거리 ${Math.round(p.attackRange)} | 방어 전 피해 ${minBaseDamage} ~ ${maxBaseDamage} | 충전 증가 ${this.formatSkillPercent(increment)} | 감전 4초/50% 둔화</div>`;
                break;
            }
            case 'missile': {
                const missileCount = lv * 2;
                const manaCost = 4 + (lv - 1) * 3;
                const weaponMultiplier = 1 + (weaponCombat.missileDamageBonus || 0);
                const baseMissileDamage = Math.ceil(attackPower * 0.45 * weaponMultiplier);
                const critMissileDamage = Math.ceil(attackPower * 0.45 * weaponMultiplier * 2);

                currentStats.push(
                    `한 번 시전하면 <strong>${missileCount}발</strong>이 순차 발사되고, 현재 공격력 ${attackPower} 기준 미사일 1발의 방어 전 피해는 <strong>${baseMissileDamage}</strong>입니다.`,
                    `치명타가 터지면 미사일 1발의 방어 전 피해는 <strong>${critMissileDamage}</strong>까지 올라갑니다.`,
                    `타겟 탐색 반경은 <strong>600</strong>, 마나 소모는 <strong>${manaCost}</strong>, 재사용 대기시간은 <strong>1.0초</strong>입니다.`
                );

                summaryMetrics.push(
                    { label: '현재 레벨', value: `Lv.${lv}` },
                    { label: '발사 수', value: `${missileCount}발` },
                    { label: '1발 피해', value: `${baseMissileDamage}` },
                    { label: '치명타 피해', value: `${critMissileDamage}` },
                    { label: '마나 소모', value: `${manaCost}` },
                    { label: '쿨다운', value: '1.0초' }
                );

                formulaItems.push(
                    `<code>발사 수 = 레벨 × 2</code> → 현재 <strong>${missileCount}발</strong>`,
                    `<code>방어 전 피해 = 공격력 × 0.45 × 무기 보정</code>`,
                    `<code>최종 피해 = max(1, 방어 전 피해 - 대상 방어력)</code>`,
                    `<code>치명타 발생 시 방어 전 피해 × 2 후 방어력 적용</code>`,
                    `<code>마나 소모 = 4 + 3 × (레벨 - 1)</code>`
                );

                settingItems.push(
                    `현재 선택한 타겟이 유효하면 그 적의 현재 위치를 먼저 고정하고, 없으면 반경 600 안의 가장 가까운 적 위치를 고정합니다.`,
                    `미사일은 <strong>0.05초 간격</strong>으로 순차 발사됩니다.`,
                    `초기 <strong>0.1~0.3초</strong> 동안 뒤에서 자연스럽게 퍼져 나간 뒤, 처음 고정한 좌표를 향해 곡선으로 유도 비행합니다.`,
                    `발사 후에는 실시간으로 타겟을 다시 추적하지 않으며, 처음 고정한 위치를 향해 날아가다가 먼저 맞은 대상에게 피해를 주고 사라집니다.`
                );

                if ((weaponCombat.missileDamageBonus || 0) > 0) {
                    weaponItems.push(`<strong>${weaponName}</strong> 효과: 매직 미사일 피해 <strong>+${this.formatSkillPercent(weaponCombat.missileDamageBonus)}</strong>`);
                }

                tooltipCurrentEffectHtml = `<div class="current-effect">현재 효과 (Lv.${lv}): ${missileCount}발 | 방어 전 피해 ${baseMissileDamage} | 탐색 600 | 마나 ${manaCost} | 쿨다운 1.0초</div>`;
                break;
            }
            case 'fireball': {
                const manaCost = 12 + (lv - 1) * 4;
                const weaponMultiplier = 1 + (weaponCombat.fireballDamageBonus || 0);
                const directDamage = Math.ceil(attackPower * (1.8 + (lv - 1) * 0.3) * weaponMultiplier);
                const baseRadius = 20 + (lv - 1) * 20;
                const aoeRadius = Math.round(baseRadius * 2.5);
                const burnDuration = 2.0 + (lv - 1) * 0.5;
                const noDefBurnTick = Math.max(1, Math.ceil(directDamage * 0.15));

                currentStats.push(
                    `현재 공격력 ${attackPower} 기준 직격 피해는 방어 전 <strong>${directDamage}</strong>입니다.`,
                    `폭발 반경은 <strong>${aoeRadius}</strong>, 화상 지속시간은 <strong>${burnDuration.toFixed(1)}초</strong>, 방어력 0 기준 화상 틱은 <strong>${noDefBurnTick}</strong>입니다.`,
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
                    `<code>직격 피해 = ceil(공격력 × (1.8 + 0.3 × (레벨 - 1)) × 무기 보정)</code>`,
                    `<code>최종 피해 = max(1, 직격 피해 - 대상 방어력)</code>`,
                    `<code>폭발 기본 반경 = 20 + 20 × (레벨 - 1)</code>`,
                    `<code>실제 폭발 반경 = 폭발 기본 반경 × 2.5</code>`,
                    `<code>화상 지속 = 2.0 + 0.5 × (레벨 - 1)초</code>`,
                    `<code>화상 틱 피해 = ceil(최종 피해 × 0.15)</code>가 <strong>0.5초마다</strong> 들어갑니다.`
                );

                settingItems.push(
                    `투사체는 현재 바라보는 방향으로 속도 <strong>800</strong>으로 날아가며, 최대 <strong>1.5초</strong> 동안 유지됩니다.`,
                    `발사 직후 발밑 폭발을 막기 위해 최소 <strong>50px</strong> 이상 이동해야 충돌 판정이 납니다.`,
                    `현재 코드 기준으로 파이어볼은 <strong>치명타가 적용되지 않습니다.</strong>`,
                    `명중 또는 범위 피해 대상 모두 화상을 적용할 수 있습니다.`
                );

                if ((weaponCombat.fireballDamageBonus || 0) > 0) {
                    weaponItems.push(`<strong>${weaponName}</strong> 효과: 파이어볼 피해 <strong>+${this.formatSkillPercent(weaponCombat.fireballDamageBonus)}</strong>`);
                }
                if ((weaponCombat.fireExplosionDamageRatio || 0) > 0) {
                    weaponItems.push(`<strong>${weaponName}</strong> 효과: 파이어볼/화상으로 처치 시 주변에 추가 폭발 피해 <strong>${this.formatSkillPercent(weaponCombat.fireExplosionDamageRatio)}</strong>가 발생합니다.`);
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
            this.buildSkillDetailSection('실제 데미지/효과 공식', formulaItems),
            this.buildSkillDetailSection('코드 기준 적용 설정', settingItems),
            this.buildSkillDetailSection('현재 장착 무기 보정', weaponItems),
            this.buildSkillDetailSection('다음 강화 비용', [upgradeCost == null ? '이 스킬은 추가 강화가 없습니다.' : `현재 다음 레벨 업 비용은 <strong>${upgradeCost.toLocaleString('ko-KR')} G</strong>입니다.`])
        ].filter(Boolean).join('');

        return {
            name: data.name,
            level: lv,
            hotkey,
            subtitle: `Lv.${lv} · 단축키 ${hotkey} · 현재 공격력 ${attackPower}${equippedWeapon ? ` · 무기 ${weaponName}` : ''}`,
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

        if (title) title.textContent = detail.name;
        if (subtitle) subtitle.textContent = detail.subtitle;
        if (hotkey) hotkey.textContent = detail.hotkey;
        if (body) {
            body.innerHTML = detail.modalHtml;
            body.scrollTop = 0;
        }

        modal.classList.remove('hidden');
        this.game?.tutorial?.trigger?.('skill_tooltip', { target: skillId, source: 'modal' });
        this.refreshDesktopShortcutHints();
    }

    hideSkillDetailModal() {
        const modal = document.getElementById('skill-detail-modal');
        if (modal) modal.classList.add('hidden');
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
                padding: null
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
                padding: null
            };
        }

        const targets = config.targets || config.target || config.selectors || [];
        return {
            mode: config.mode || 'ring',
            label: config.label || '',
            padding: Number.isFinite(config.padding) ? config.padding : null,
            targets: Array.isArray(targets) ? targets.filter(Boolean) : (targets ? [targets] : [])
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
        if (!state.targets?.length) {
            this.refreshTutorialGuideLayout();
            return;
        }

        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const isTouch = window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0;
        const isLandscape = window.matchMedia?.('(orientation: landscape)')?.matches ?? (window.innerWidth > window.innerHeight);
        const defaultPadding = state.padding ?? (isTouch ? (isLandscape ? 8 : 10) : 8);
        const rects = [];

        state.targets.forEach((target) => {
            const element = this.resolveTutorialHighlightTarget(target);
            if (!element) return;
            if (element.classList?.contains('hidden')) return;

            const rect = element.getBoundingClientRect();
            if (!rect.width || !rect.height) return;

            const padding = defaultPadding + (state.mode === 'spotlight' ? 4 : 0);
            const left = Math.max(0, rect.left - padding);
            const top = Math.max(0, rect.top - padding);
            const right = Math.min(viewportW, rect.right + padding);
            const bottom = Math.min(viewportH, rect.bottom + padding);
            const width = Math.max(0, right - left);
            const height = Math.max(0, bottom - top);
            if (!width || !height) return;

            rects.push({ left, top, right, bottom, width, height });
        });

        if (!rects.length) {
            this.refreshTutorialGuideLayout();
            return;
        }

        if (state.mode === 'spotlight') {
            const spotlightRect = rects[0];
            const dim = document.createElement('div');
            dim.className = 'tutorial-highlight-spotlight';
            dim.style.left = `${spotlightRect.left}px`;
            dim.style.top = `${spotlightRect.top}px`;
            dim.style.width = `${spotlightRect.width}px`;
            dim.style.height = `${spotlightRect.height}px`;
            layer.appendChild(dim);
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

    clearTutorialHighlight() {
        this.tutorialHighlightTargets = [];
        this.tutorialHighlightState = { targets: [], mode: 'ring', label: '' };
        if (this.tutorialHighlightLayer) {
            this.tutorialHighlightLayer.innerHTML = '';
        }
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
        // Player.js: 1.0 + (agi * 0.1) + (int * 0.05)
        const predAtkSpd = Math.min(2.0, 1.0 + (predAgi * 0.1) + (predInt * 0.05));
        const predCrit = 0.1 + (predAgi * 0.01) + (predInt * 0.01);
        const predMoveSpd = 1.0 + (predAgi * 0.05); // Base 1.0

        const currentAtkSpdBase = Math.min(2.0, 1.0 + (baseAgi * 0.1) + (baseInt * 0.05));
        const currentCritBase = 0.1 + (baseAgi * 0.01) + (baseInt * 0.01);
        const currentMoveSpdBase = 1.0 + (baseAgi * 0.05);

        const equipAtkSpdBonus = getEquipmentBonus(p.attackSpeed, currentAtkSpdBase);
        const equipCritBonus = getEquipmentBonus(p.critRate, currentCritBase);
        const equipMoveSpdBonus = getEquipmentBonus(p.moveSpeedBonus, currentMoveSpdBase);

        updateDerived('val-atk-spd', currentAtkSpdBase, predAtkSpd, false, 2, equipAtkSpdBonus);
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
                    const guestSnapshot = await this.game.net.getLatestProfileSnapshot?.(guestUid);
                    if (!guestSnapshot?.profile) {
                        alert('현재 게스트 캐릭터 데이터를 찾을 수 없습니다.');
                        setLinkButtonState(false, guestLabel);
                        return;
                    }

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
                        if (archived && !archived.ok && archived.reason !== 'profile_missing') {
                            throw archived.error || new Error('기존 구글 데이터 백업에 실패했습니다.');
                        }

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
                        allowStaleWrite: true,
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
                        console.error('Migration Error:', e);
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
        } else if ((p.questData.bossClearCount || 0) === 0) {
            // Quest 3: First King Slime
            currentQuest = {
                id: 'king_slime_intro',
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
                    id: 'boss_repeat',
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
                    id: 'slime_repeat',
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

    setupInventoryInteractions() {
        const equipBtn = document.getElementById('inventory-action-equip');
        const unequipBtn = document.getElementById('inventory-action-unequip');
        const enhanceBtn = document.getElementById('inventory-action-enhance');
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

    isInventorySelection(ref, kind, value) {
        if (!ref || ref.kind !== kind) return false;
        if (kind === 'inventory') return ref.index === value;
        return ref.slot === value;
    }

    resolveSelectedInventoryItem(player) {
        if (!player || !this.selectedInventoryRef) return null;
        if (this.selectedInventoryRef.kind === 'inventory') {
            const item = player.inventory[this.selectedInventoryRef.index];
            return item ? { location: 'inventory', index: this.selectedInventoryRef.index, item } : null;
        }
        if (this.selectedInventoryRef.kind === 'equipment') {
            const item = player.getEquippedWeapon?.();
            return item ? { location: 'equipment', slot: 'weapon', item } : null;
        }
        return null;
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

    openInventoryItemModal(ref) {
        const modal = document.getElementById('inventory-item-modal');
        if (!modal || !ref) return;
        this.selectedInventoryRef = ref;
        modal.classList.remove('hidden');
        this.updateInventory();
    }

    closeInventoryItemModal(clearSelection = false) {
        const modal = document.getElementById('inventory-item-modal');
        if (modal) modal.classList.add('hidden');
        if (clearSelection) this.selectedInventoryRef = null;
        this.refreshDesktopShortcutHints();
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
        if (!button || !Number.isInteger(index) || index <= 0) return;
        if (event.button != null && event.button !== 0) return;

        this.tearDownInventoryDrag();
        this.inventoryDragState = {
            pointerId: event.pointerId,
            sourceIndex: index,
            sourceElement: button,
            startX: event.clientX,
            startY: event.clientY,
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
        if (!state.dragActive && Math.hypot(movedX, movedY) < 10) return;

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
        const definition = itemData?.getItemDefinition(item.type) || null;
        const affix = itemData?.getAffixDefinition(item.prefixId) || null;
        const lines = [];

        if (item.slot === 'weapon') {
            const attackBonus = (item.baseStats?.attackPower || definition?.baseStats?.attackPower || 0)
                + ((item.enhancementLevel || 0) * (item.enhancementBonuses?.attackPowerPerLevel || definition?.enhancementBonuses?.attackPowerPerLevel || 0));
            const critBonus = (item.baseStats?.critRate || definition?.baseStats?.critRate || 0)
                + ((item.enhancementLevel || 0) * (item.enhancementBonuses?.critRatePerLevel || definition?.enhancementBonuses?.critRatePerLevel || 0));
            const mpRegenBonus = item.baseStats?.mpRegen || definition?.baseStats?.mpRegen || 0;

            lines.push(`공격력 +${attackBonus}`);
            lines.push(`치명타 확률 +${Math.round(critBonus * 100)}%`);
            lines.push(`마나 회복력 +${mpRegenBonus}`);

            if (affix?.id === 'starlight') {
                lines.push(`별빛 매직 미사일 피해 +${Math.round((item.rolledValues?.missileDamageBonus || 0) * 100)}%`);
            } else if (affix?.id === 'blue_flame') {
                lines.push(`푸른 파이어볼 피해 +${Math.round((item.rolledValues?.fireballDamageBonus || 0) * 100)}%`);
                lines.push(`푸른 불꽃 폭발 피해 ${Math.round((item.rolledValues?.fireExplosionDamageRatio || 0) * 100)}%`);
                lines.push('파이어볼/화상 처치 시 주변 폭발');
            } else if (affix?.id === 'crimson_flash') {
                lines.push(`붉은 전격 피해 +${Math.round((item.rolledValues?.laserDamageBonus || 0) * 100)}%`);
                lines.push('체인 라이트닝 적중 시 HP 흡수');
            }
        } else if (item.type === 'blessed_weapon_upgrade_stone') {
            lines.push('축복 강화에 사용하는 희귀 재료');
            lines.push('성공 50% / 실패 시 강화 단계 유지');
            lines.push('성공 시 강화 수치 +1~2 증가');
        } else if (item.type === 'weapon_upgrade_stone') {
            lines.push('무기 강화에 사용되는 재료');
        }

        const config = item.slot === 'weapon' ? itemData?.getEnhancementConfig(item) : null;
        const dismantleReward = item.slot === 'weapon' ? player.getWeaponDismantleRewardInfo?.(item) : null;
        const enhanceHint = config
            ? `다음 +${config.nextLevel} | 성공 ${Math.round(config.successRate * 100)}%${config.destroyChanceOnFail > 0 ? ` | 파괴 ${Math.round(config.destroyChanceOnFail * 100)}%` : ' | 안전'}`
            : '';

        const dismantleHint = dismantleReward
            ? `분해 시 무기 강화석 ${dismantleReward.displayText} 획득`
            : '';

        return {
            title: item.name || definition?.name || item.type,
            subtitle: item.slot === 'weapon'
                ? `${item.prefix || '무기'} / 현재 +${item.enhancementLevel || 0}`
                : `${definition?.rarity || item.rarity || 'common'}`.toUpperCase(),
            description: item.description || definition?.description || '',
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

        const goldSlot = document.createElement('button');
        goldSlot.type = 'button';
        goldSlot.className = 'grid-item utility-slot gold-slot';
        goldSlot.setAttribute('aria-label', `골드 ${Math.max(0, p.gold || 0).toLocaleString('ko-KR')} G`);
        goldSlot.appendChild(createUtilityLabel('골드'));
        goldSlot.appendChild(this.createInventoryIconElement(p.inventory[0] || { icon: '💰', name: '골드' }));
        const goldAmount = document.createElement('span');
        goldAmount.className = 'utility-slot-meta';
        goldAmount.textContent = compactNumber(p.gold || 0);
        goldSlot.appendChild(goldAmount);
        goldSlot.addEventListener('click', () => {
            this.showGenericModal('골드', `보유 골드: ${Math.max(0, p.gold || 0).toLocaleString('ko-KR')} G`, null, null, { hideNo: true, yesText: '확인' });
        });
        fragment.appendChild(goldSlot);

        const equippedWeapon = p.getEquippedWeapon?.();
        const equippedSlot = document.createElement('button');
        equippedSlot.type = 'button';
        equippedSlot.className = 'grid-item utility-slot equipped-weapon-slot';
        equippedSlot.classList.toggle('enhancement-selectable', enhancementSelectionActive && !!equippedWeapon);
        equippedSlot.setAttribute('aria-label', equippedWeapon ? `${equippedWeapon.name} 장착 중` : '장착 무기 없음');
        equippedSlot.appendChild(createUtilityLabel('착용'));
        if (this.isInventorySelection(this.selectedInventoryRef, 'equipment', 'weapon')) {
            equippedSlot.classList.add('selected');
        }
        if (equippedWeapon) {
            equippedSlot.classList.add('equipped');
            equippedSlot.appendChild(this.createInventoryIconElement(equippedWeapon));
            const level = document.createElement('span');
            level.className = 'item-enhancement';
            level.textContent = `+${equippedWeapon.enhancementLevel || 0}`;
            equippedSlot.appendChild(level);
            this.applyInventoryEnhancementVisual(equippedSlot, equippedWeapon, level);
            equippedSlot.addEventListener('click', () => {
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
            button.classList.toggle('enhancement-selectable', enhancementSelectionActive && item?.slot === 'weapon');
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
                    amount.textContent = `${item.amount}`;
                    button.appendChild(amount);
                }

                if (item.slot === 'weapon') {
                    const level = document.createElement('span');
                    level.className = 'item-enhancement';
                    level.textContent = `+${item.enhancementLevel || 0}`;
                    button.appendChild(level);
                    this.applyInventoryEnhancementVisual(button, item, level);
                }

                if (!enhancementSelectionActive) {
                    button.addEventListener('pointerdown', (event) => {
                        this.startInventorySlotDrag(event, index, button);
                    });
                }
            } else {
                const emptyLabel = document.createElement('span');
                emptyLabel.className = 'grid-item-slot-index';
                emptyLabel.textContent = `${index}`;
                button.appendChild(emptyLabel);
            }

            button.addEventListener('click', () => {
                if (performance.now() < this.inventoryClickSuppressUntil) return;
                if (this.isWeaponEnhancementSelectionActive()) {
                    if (item?.slot === 'weapon') {
                        this.executeWeaponEnhancementForSelection({ kind: 'inventory', index });
                    }
                    return;
                }
                if (!item) {
                    this.closeInventoryItemModal(true);
                    this.updateInventory();
                    return;
                }
                if (item.type === 'weapon_upgrade_stone' || item.type === 'blessed_weapon_upgrade_stone') {
                    this.startWeaponEnhancementSelection(item.type === 'blessed_weapon_upgrade_stone' ? 'blessed' : 'normal');
                    return;
                }
                this.selectedInventoryRef = { kind: 'inventory', index };
                document.getElementById('inventory-item-modal')?.classList.remove('hidden');
                this.updateInventory();
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
            detailIconWrap.classList.toggle('item-special-blessed-stone', detail.item.type === 'blessed_weapon_upgrade_stone');
            detailIconWrap.appendChild(this.createInventoryIconElement(detail.item, 'inventory-detail-icon-asset'));
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
        const dismantleBtn = document.getElementById('inventory-action-dismantle');

        if (nameEl) nameEl.textContent = detailData.title;
        if (subtitleEl) {
            subtitleEl.textContent = detail.location === 'equipment'
                ? `${detailData.subtitle} · 착용 중`
                : detailData.subtitle;
        }
        if (descEl) descEl.textContent = detailData.description || '';

        if (statsEl) {
            statsEl.innerHTML = '';
            detailData.lines.forEach((line) => {
                const li = document.createElement('li');
                li.textContent = line;
                statsEl.appendChild(li);
            });
        }

        if (hintEl) {
            const stoneCount = p.getInventoryItemCount?.('weapon_upgrade_stone') || 0;
            const blessedStoneCount = p.getInventoryItemCount?.('blessed_weapon_upgrade_stone') || 0;
            const hints = [];
            if (detailData.enhanceHint) {
                hints.push(`${detailData.enhanceHint} / 강화석 ${stoneCount}개 보유`);
                hints.push(`축복 강화석 ${blessedStoneCount}개 보유 / 성공 50% / 실패 시 유지 / 성공 시 +1~2`);
            }
            if (detailData.dismantleHint) {
                hints.push(detailData.dismantleHint);
            }
            hintEl.innerHTML = hints.join('<br>');
        }

        if (hintEl) {
            const stoneCount = p.getInventoryItemCount?.('weapon_upgrade_stone') || 0;
            const blessedStoneCount = p.getInventoryItemCount?.('blessed_weapon_upgrade_stone') || 0;
            const hints = [];

            if (detail.item.slot === 'weapon') {
                if (detailData.enhanceHint) {
                    hints.push(detailData.enhanceHint);
                }
                hints.push(`강화석 ${stoneCount}개 / 축복 강화석 ${blessedStoneCount}개 보유`);
                hints.push('강화석을 선택한 뒤 강화할 무기를 지정해 주세요.');
            } else if (detail.item.type === 'weapon_upgrade_stone') {
                hints.push(`보유 강화석 ${stoneCount}개`);
                hints.push('사용 후 강화할 무기를 선택합니다.');
            } else if (detail.item.type === 'blessed_weapon_upgrade_stone') {
                hints.push(`보유 축복 강화석 ${blessedStoneCount}개`);
                hints.push('성공 50% / 실패 시 유지 / 성공 시 +1~2');
                hints.push('사용 후 강화할 무기를 선택합니다.');
            }

            if (detailData.dismantleHint) {
                hints.push(detailData.dismantleHint);
            }

            hintEl.innerHTML = hints.join('<br>');
        }

        if (equipBtn) {
            equipBtn.classList.toggle('hidden', !(detail.location === 'inventory' && detail.item.slot === 'weapon'));
        }
        if (unequipBtn) {
            unequipBtn.classList.toggle('hidden', !(detail.location === 'equipment' && detail.item.slot === 'weapon'));
        }
        if (enhanceBtn) {
            enhanceBtn.classList.toggle('hidden', detail.item.slot !== 'weapon');
        }
        if (blessedEnhanceBtn) {
            blessedEnhanceBtn.classList.toggle('hidden', detail.item.slot !== 'weapon');
        }
        if (dismantleBtn) {
            dismantleBtn.classList.toggle('hidden', detail.item.slot !== 'weapon');
        }

        if (enhanceBtn) {
            enhanceBtn.textContent = '강화할 무기 선택';
            enhanceBtn.classList.toggle('hidden', detail.item.type !== 'weapon_upgrade_stone');
        }
        if (blessedEnhanceBtn) {
            blessedEnhanceBtn.textContent = '축복 강화할 무기 선택';
            blessedEnhanceBtn.classList.toggle('hidden', detail.item.type !== 'blessed_weapon_upgrade_stone');
        }

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
        if (this.devMode && (now - this.lastDevOverlayUpdate) >= 250) {
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

    buildMinimapStateSignature(player, remotePlayers, monsters, mapWidth, mapHeight, width, height, simpleMode) {
        let hash = 2166136261;
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

        return `${width}x${height}:${step}:${remoteCount}:${aliveMonsterCount}:${hash.toString(36)}`;
    }

    updateMinimap(player, remotePlayers, monsters, mapWidth, mapHeight) {
        const canvas = this.minimapCanvas && this.minimapCanvas.isConnected
            ? this.minimapCanvas
            : document.getElementById('minimapCanvas');
        if (!canvas) return;

        const canvasChanged = this.minimapCanvas !== canvas;
        this.minimapCanvas = canvas;
        const ctx = this.minimapCtx || canvas.getContext('2d', { alpha: true, desynchronized: true }) || canvas.getContext('2d');
        this.minimapCtx = ctx;
        const simpleMode = !!this.game.useAggressiveHudOptimization;
        const w = simpleMode ? 96 : 150;
        const h = simpleMode ? 96 : 150;
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;

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

        // Clear Map (Make it transparent)
        ctx.clearRect(0, 0, w, h);

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
                // v0.33.0: Boss is bigger
                const radius = (m.isBoss || m.typeId === 'king_slime') ? 6 : 2;
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
            console.error('Failed to load README.md:', e);
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

    setupDevModeListeners() {
        const portrait = document.querySelector('.status-portrait');
        if (portrait) {
            portrait.style.cursor = 'pointer';
            portrait.title = '개발자 모드 토글';
            portrait.addEventListener('click', () => {
                this.devMode = !this.devMode;
                const overlay = document.getElementById('dev-overlay');
                const btnAccount = document.getElementById('reset-account-btn');
                const btnStat = document.getElementById('reset-stat-btn');

                if (overlay) overlay.classList.toggle('hidden', !this.devMode);

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

                this.logSystemMessage(`개발자 모드 ${this.devMode ? '활성화' : '비활성화'}`);
                if (this.devMode) this.updateDevOverlay();
            });
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
