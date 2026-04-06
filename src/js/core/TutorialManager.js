import Logger from '../utils/Logger.js';

export default class TutorialManager {
    constructor(game) {
        this.game = game;
        this.activeTutorial = null;
        this.pendingTutorialId = null;
        this.currentStepIndex = -1;
        this.completedTutorials = new Set();
        this.progress = { count: 0 };
    }

    async loadTutorial(id) {
        try {
            return await this.game.resources.loadJSON(`/assets/data/tutorials/${id}.json`);
        } catch (e) {
            Logger.error(`[Tutorial] Failed to load tutorial: ${id}`, e);
            return null;
        }
    }

    getCurrentStep() {
        return this.activeTutorial?.steps?.[this.currentStepIndex] || null;
    }

    getTutorialLayoutMode() {
        const isNarrow = window.innerWidth <= 1024;
        if (!isNarrow) return 'desktop';

        const isPortrait = window.matchMedia?.('(orientation: portrait)')?.matches
            ?? (window.innerHeight >= window.innerWidth);
        return isPortrait ? 'mobile-portrait' : 'mobile-landscape';
    }

    isMobileTutorialLayout() {
        return this.getTutorialLayoutMode() !== 'desktop';
    }

    isMobileLandscapeTutorialLayout() {
        return this.getTutorialLayoutMode() === 'mobile-landscape';
    }

    getTutorialLayoutKey() {
        const layoutMode = this.getTutorialLayoutMode();
        if (layoutMode === 'mobile-portrait') return 'mobilePortrait';
        if (layoutMode === 'mobile-landscape') return 'mobileLandscape';
        return 'desktop';
    }

    resolveResponsiveValue(value, legacyResolver = null) {
        if (value === undefined || value === null) {
            return typeof legacyResolver === 'function' ? legacyResolver() : null;
        }

        if (
            typeof value === 'string'
            || Array.isArray(value)
            || value instanceof Element
        ) {
            return value;
        }

        if (typeof value !== 'object') {
            return value;
        }

        const layoutMode = this.getTutorialLayoutMode();
        const layoutKey = this.getTutorialLayoutKey();
        const fallbackMobile = layoutMode === 'mobile-landscape'
            ? value.mobileLandscape ?? value.mobile
            : value.mobilePortrait ?? value.mobile;

        return value[layoutMode]
            ?? value[layoutKey]
            ?? fallbackMobile
            ?? value.desktop
            ?? value.default
            ?? (typeof legacyResolver === 'function' ? legacyResolver() : null);
    }

    getLegacyInstruction(step) {
        if (!step) return '';

        const layoutMode = this.getTutorialLayoutMode();
        if (layoutMode === 'mobile-landscape') {
            return step.instructionMobileLandscape
                || step.instructionMobile
                || step.instruction;
        }

        if (layoutMode === 'mobile-portrait') {
            return step.instructionMobile || step.instruction;
        }

        return step.instructionDesktop || step.instruction;
    }

    getStepInstruction(step = this.getCurrentStep()) {
        return this.resolveResponsiveValue(step?.instruction, () => this.getLegacyInstruction(step)) || '';
    }

    getDefaultStepType(step = this.getCurrentStep()) {
        if (!step) return 'info';
        if (step.type) return step.type;

        if (['move', 'kill', 'skill_use', 'skill_aim_adjust'].includes(step.trigger)) {
            return 'combat';
        }

        if (['popup_open', 'popup_close', 'skill_upgrade', 'stats_saved', 'skill_detail_close'].includes(step.trigger)) {
            return 'interact';
        }

        if (['skill_tooltip', 'skill_detail_open', 'stat_allocated'].includes(step.trigger)) {
            return 'inspect';
        }

        return 'info';
    }

    getStepGuideTitle(step = this.getCurrentStep()) {
        if (!step) return '튜토리얼';

        if (step.guideTitle) return step.guideTitle;

        const titleMap = {
            move_check: '이동 연습',
            attack_dummy: '기본 공격',
            open_status: '스탯 창',
            preview_status_change: '수치 미리보기',
            save_status: '스탯 저장',
            open_skill: '스킬 창',
            inspect_laser_detail: '기본 공격 설명',
            close_laser_detail: '설명 닫기',
            inspect_missile_detail: '매직 미사일 설명',
            close_missile_detail: '설명 닫기',
            upgrade_missile: '매직 미사일 강화',
            use_missile: '매직 미사일 사용',
            reopen_skill_for_fireball: '파이어볼 준비',
            inspect_fireball_detail: '파이어볼 설명',
            close_fireball_detail: '설명 닫기',
            upgrade_fireball: '파이어볼 강화',
            aim_fireball_mobile: '파이어볼 조준',
            use_fireball: '파이어볼 사용',
            reopen_skill_for_shield: '베리어 준비',
            inspect_shield_detail: '베리어 설명',
            close_shield_detail: '설명 닫기',
            use_shield: '베리어 사용',
            open_inventory: '인벤토리',
            close_inventory: '인벤토리 닫기',
            finish: '튜토리얼 마무리'
        };

        return titleMap[step.id] || '튜토리얼';
    }

    getStepQuestText(step = this.getCurrentStep()) {
        if (!step) return '';

        const responsiveQuestText = this.resolveResponsiveValue(step.questText);
        if (responsiveQuestText) return responsiveQuestText;

        const defaultQuestText = {
            move_check: '조금 이동해 보세요.',
            attack_dummy: '허수아비를 기본 공격으로 처치하세요.',
            open_status: '스탯 창을 열어 주세요.',
            preview_status_change: '스탯을 1포인트 찍어 보세요.',
            save_status: '스탯 창을 닫아 저장해 주세요.',
            open_skill: '스킬 창을 열어 주세요.',
            inspect_laser_detail: '체인 라이트닝 설명을 확인해 주세요.',
            close_laser_detail: '체인 라이트닝 설명 창을 닫아 주세요.',
            inspect_missile_detail: '매직 미사일 설명을 확인해 주세요.',
            close_missile_detail: '매직 미사일 설명 창을 닫아 주세요.',
            upgrade_missile: '매직 미사일을 1회 강화하세요.',
            use_missile: '매직 미사일을 사용해 보세요.',
            reopen_skill_for_fireball: '스킬 창을 다시 열어 주세요.',
            inspect_fireball_detail: '파이어볼 설명을 확인해 주세요.',
            close_fireball_detail: '파이어볼 설명 창을 닫아 주세요.',
            upgrade_fireball: '파이어볼을 1회 강화하세요.',
            aim_fireball_mobile: '파이어볼 버튼을 누른 채 조준해 보세요.',
            use_fireball: '파이어볼을 사용해 보세요.',
            reopen_skill_for_shield: '스킬 창을 다시 열어 주세요.',
            inspect_shield_detail: '앱솔루트 베리어 설명을 확인해 주세요.',
            close_shield_detail: '앱솔루트 베리어 설명 창을 닫아 주세요.',
            use_shield: '앱솔루트 베리어를 사용해 보세요.',
            open_inventory: '인벤토리를 열어 주세요.',
            close_inventory: '인벤토리를 닫아 주세요.',
            finish: '튜토리얼 마무리'
        };

        return defaultQuestText[step.id] || this.getStepInstruction(step);
    }

    getLegacyHighlightTargets(step) {
        if (!step) return null;

        const layoutMode = this.getTutorialLayoutMode();
        if (layoutMode === 'mobile-landscape') {
            return step.highlightTargetsMobileLandscape
                || step.highlightTargetMobileLandscape
                || step.highlightTargetsMobile
                || step.highlightTargetMobile
                || step.highlightTargets
                || step.highlightTarget
                || null;
        }

        if (layoutMode === 'mobile-portrait') {
            return step.highlightTargetsMobile || step.highlightTargetMobile || step.highlightTargets || step.highlightTarget || null;
        }

        return step.highlightTargetsDesktop || step.highlightTargetDesktop || step.highlightTargets || step.highlightTarget || null;
    }

    getDefaultStepPresentation(step = this.getCurrentStep()) {
        const stepType = this.getDefaultStepType(step);
        const layoutKey = this.getTutorialLayoutKey();

        const defaults = {
            info: {
                desktop: { guideMode: 'top-card', highlightMode: 'frame', align: 'left' },
                mobilePortrait: { guideMode: 'top-card', highlightMode: 'frame', align: 'left' },
                mobileLandscape: { guideMode: 'top-card', highlightMode: 'frame', align: 'left', compact: true }
            },
            inspect: {
                desktop: { guideMode: 'popup-near-left', highlightMode: 'spotlight', align: 'left' },
                mobilePortrait: { guideMode: 'popup-near-top', highlightMode: 'spotlight', align: 'left' },
                mobileLandscape: { guideMode: 'top-card', highlightMode: 'spotlight', align: 'left', compact: true }
            },
            interact: {
                desktop: { guideMode: 'dock-left', highlightMode: 'ring', align: 'left' },
                mobilePortrait: { guideMode: 'bottom-sheet', highlightMode: 'ring', align: 'left' },
                mobileLandscape: { guideMode: 'top-card', highlightMode: 'ring', align: 'left', compact: true }
            },
            combat: {
                desktop: { guideMode: 'floating-compact', highlightMode: 'ring', align: 'left', compact: true },
                mobilePortrait: { guideMode: 'top-card', highlightMode: 'ring', align: 'left', compact: true },
                mobileLandscape: { guideMode: 'top-card', highlightMode: 'ring', align: 'left', compact: true }
            }
        };

        return defaults[stepType]?.[layoutKey] || defaults.info.desktop;
    }

    getStepPresentation(step = this.getCurrentStep()) {
        if (!step) return this.getDefaultStepPresentation();

        const defaults = this.getDefaultStepPresentation(step);
        const responsivePresentation = this.resolveResponsiveValue(step.presentation);
        if (!responsivePresentation || typeof responsivePresentation !== 'object' || Array.isArray(responsivePresentation)) {
            return defaults;
        }

        return {
            ...defaults,
            ...responsivePresentation
        };
    }

    getStepHighlightTargets(step = this.getCurrentStep()) {
        return this.resolveResponsiveValue(step?.focus, () => this.getLegacyHighlightTargets(step));
    }

    getStepAvoidTargets(step = this.getCurrentStep()) {
        return this.resolveResponsiveValue(step?.avoidTargets || step?.forbiddenTargets, () => null);
    }

    getStepHighlightConfig(step = this.getCurrentStep()) {
        if (!step) return null;

        const presentation = this.getStepPresentation(step);
        const responsiveFocus = this.getStepHighlightTargets(step);
        const baseConfig = {
            mode: presentation.highlightMode || 'ring',
            targets: [],
            label: presentation.calloutText || '',
            padding: presentation.highlightPadding
        };

        if (!responsiveFocus) return baseConfig;

        if (
            typeof responsiveFocus === 'string'
            || Array.isArray(responsiveFocus)
            || responsiveFocus instanceof Element
        ) {
            return {
                ...baseConfig,
                targets: responsiveFocus
            };
        }

        if (typeof responsiveFocus !== 'object') {
            return baseConfig;
        }

        return {
            ...baseConfig,
            ...responsiveFocus,
            targets: responsiveFocus.targets
                || responsiveFocus.target
                || responsiveFocus.selectors
                || baseConfig.targets
        };
    }

    getStepGuidePayload(step = this.getCurrentStep()) {
        if (!step) return null;

        const presentation = this.getStepPresentation(step);
        const highlight = this.getStepHighlightConfig(step);

        return {
            title: presentation.guideTitle || this.getStepGuideTitle(step),
            text: this.getStepInstruction(step),
            mode: presentation.guideMode || 'top-card',
            align: presentation.align || 'left',
            compact: !!presentation.compact,
            stepType: this.getDefaultStepType(step),
            stepId: step.id,
            stepNumber: this.currentStepIndex + 1,
            totalSteps: this.activeTutorial?.steps?.length || 0,
            focusTargets: highlight?.targets || [],
            avoidTargets: this.getStepAvoidTargets(step)
        };
    }

    isStepAvailable(step = this.getCurrentStep()) {
        if (!step) return false;

        const layoutMode = this.getTutorialLayoutMode();
        if (Array.isArray(step.layouts) && step.layouts.length > 0) {
            return step.layouts.includes(layoutMode);
        }

        if (Array.isArray(step.excludeLayouts) && step.excludeLayouts.includes(layoutMode)) {
            return false;
        }

        return true;
    }

    isActionAllowed(action) {
        if (this.pendingTutorialId && !this.activeTutorial) return false;

        const step = this.getCurrentStep();
        if (!step || !Array.isArray(step.allowedActions)) return true;

        return step.allowedActions.includes(action);
    }

    isSkillUpgradeAllowed(skillId) {
        const step = this.getCurrentStep();
        if (!step) return true;

        if (step.trigger === 'skill_upgrade') {
            return this._matchesTarget(step.target, skillId);
        }

        if (Array.isArray(step.allowedActions) && step.allowedActions.includes('OPEN_SKILL')) {
            return false;
        }

        return true;
    }

    startTutorial(id) {
        if (this.completedTutorials.has(id) || this.activeTutorial || this.pendingTutorialId) return;

        this.pendingTutorialId = id;
        this.game.input?.setAllowedActions([]);
        this.game.net?.setZoneParticipationEnabled?.(false);
        this.game.sceneManager?.currentScene?.remotePlayers?.clear?.();

        this.loadTutorial(id).then((data) => {
            if (!data) {
                this.pendingTutorialId = null;
                this.game.input?.setAllowedActions(null);
                this.game.net?.setZoneParticipationEnabled?.(true);
                this.game.sceneManager?.currentScene?.activateZoneParticipation?.();
                return;
            }

            this.activeTutorial = data;
            this.pendingTutorialId = null;
            this.currentStepIndex = 0;
            this.progress = { count: 0 };

            if (id === 'basic_training' && this.game.localPlayer?.questData) {
                this.game.localPlayer.questData.prologueCompleted = true;
                this.game.localPlayer.saveState();
            }

            if (this.game.monsterManager?.setTutorialMode) {
                this.game.monsterManager.setTutorialMode(true);
            }
            if (this.game.ui?.updateQuestUI) {
                this.game.ui.updateQuestUI();
            }

            Logger.log(`[Tutorial] Started: ${data.title}`);
            this._showCurrentStep();
        });
    }

    stopTutorial() {
        if (!this.activeTutorial) return;

        Logger.log(`[Tutorial] Stopped: ${this.activeTutorial.title}`);
        this.activeTutorial = null;
        this.pendingTutorialId = null;
        this.currentStepIndex = -1;
        this.progress = { count: 0 };
        this.game.input?.setAllowedActions(null);

        if (this.game.monsterManager?.setTutorialMode) {
            this.game.monsterManager.setTutorialMode(false);
        }
        if (this.game.ui) {
            this.game.ui.hideTutorialGuide();
            this.game.ui.clearTutorialHighlight?.();
        }
        if (this.game.ui?.updateQuestUI) {
            this.game.ui.updateQuestUI();
        }
    }

    _showCurrentStep() {
        let step = this.getCurrentStep();
        while (step && !this.isStepAvailable(step)) {
            this.currentStepIndex++;
            step = this.getCurrentStep();
        }

        if (!step) {
            this._completeTutorial();
            return;
        }

        step._timer = 0;
        this.progress = { count: 0 };
        this.game.input?.setAllowedActions(step.allowedActions || null);

        if (this.game.ui) {
            this.game.ui.showTutorialGuide(this.getStepGuidePayload(step));
            this.game.ui.updateSkillPopup?.();
            this.game.ui.updateStatusPopup?.();
        }

        this._runActions(step.onStart);
        this.game.ui?.highlightTutorialTargets?.(this.getStepHighlightConfig(step));
    }

    _runActions(actions) {
        if (!actions) return;

        const resolvedActions = this.resolveResponsiveValue(actions, () => actions);
        const actionList = Array.isArray(resolvedActions) ? resolvedActions : [resolvedActions];
        actionList.forEach((action) => this._handleAction(action));
    }

    _resolveTutorialSpawnPosition(action, player) {
        const worldW = this.game.zone?.width || 3200;
        const worldH = this.game.zone?.height || 3200;
        const fallbackPadding = action.monsterId === 'training_dummy' ? 120 : 96;

        let x = action.x ?? (player.x + (action.offsetX || 200));
        let y = action.y ?? (player.y + (action.offsetY || 0));

        const scene = this.game.sceneManager?.currentScene;
        const camera = scene?.camera;
        const canvas = this.game.canvas;
        const dpr = this.game.dpr || 1;
        const zoom = this.game.zoom || 1;

        if (camera && canvas) {
            const viewportW = (canvas.width / dpr) / zoom;
            const viewportH = (canvas.height / dpr) / zoom;
            const padX = action.spawnPaddingX || fallbackPadding;
            const padY = action.spawnPaddingY || fallbackPadding;
            const minX = camera.x + padX;
            const maxX = camera.x + viewportW - padX;
            const minY = camera.y + padY;
            const maxY = camera.y + viewportH - padY;

            if (minX < maxX) x = Math.min(maxX, Math.max(minX, x));
            if (minY < maxY) y = Math.min(maxY, Math.max(minY, y));
        }

        x = Math.min(worldW - fallbackPadding, Math.max(fallbackPadding, x));
        y = Math.min(worldH - fallbackPadding, Math.max(fallbackPadding, y));
        return { x, y };
    }

    _handleAction(action) {
        if (!action || !action.type) return;

        const player = this.game.localPlayer;

        switch (action.type) {
            case 'spawn_monster': {
                if (!player || !this.game.monsterManager?.spawnMonster) return;

                const { x, y } = this._resolveTutorialSpawnPosition(action, player);
                const spawnResult = this.game.monsterManager.spawnMonster(action.monsterId, x, y, {
                    tutorialOnly: true
                });

                Promise.resolve(spawnResult).then((monsterId) => {
                    const monster = this.game.monsterManager?.monsters?.get(monsterId);
                    if (monster && this.game.localPlayer) {
                        this.game.localPlayer.setCurrentTarget?.(monster, { mode: 'script' });
                    }
                });
                break;
            }

            case 'clear_tutorial_monsters':
                this.game.monsterManager?.clearTutorialMonsters?.();
                if (player) {
                    player.clearCurrentTarget?.();
                }
                break;

            case 'grant_gold':
                if (!player) return;
                player.gold += action.amount || 0;
                player.updateGoldInventory?.();
                this.game.ui?.updateInventory?.();
                this.game.ui?.updateSkillPopup?.();
                this.game.ui?.updateStatusPopup?.();
                break;

            case 'grant_stat_points':
                if (!player) return;
                player.statPoints += action.amount || 0;
                this.game.ui?.updateStatusPopup?.();
                break;

            case 'close_popups':
                this.game.ui?.hideAllPopups?.();
                break;

            case 'center_message':
                if (action.text) {
                    this.game.ui?.showCenterMessage?.(action.text, action.color || '#ffeb3b');
                }
                break;

            case 'log_message':
                if (action.text) {
                    this.game.ui?.logSystemMessage?.(action.text);
                }
                break;

            default:
                Logger.warn(`[Tutorial] Unknown action type: ${action.type}`);
        }
    }

    _matchesTarget(expected, actual) {
        if (expected === undefined || expected === null) return true;
        if (Array.isArray(expected)) return expected.includes(actual);
        return expected === actual;
    }

    trigger(eventType, data = {}) {
        const step = this.getCurrentStep();
        if (!step || step.trigger !== eventType) return;
        if (!this._matchesTarget(step.target, data.target)) return;

        this.progress.count++;

        if (this.progress.count >= (step.count || 1)) {
            this._completeStep();
        }
    }

    update(dt) {
        const step = this.getCurrentStep();
        if (!step) return;

        if (step.trigger === 'auto_next') {
            step._timer = (step._timer || 0) + (dt * 1000);
            if (step._timer >= (step.duration || 1000)) {
                this._completeStep();
            }
        }
    }

    _completeStep() {
        const step = this.getCurrentStep();
        if (!step) return;

        Logger.log(`[Tutorial] Step completed: ${step.id}`);
        this._runActions(step.onComplete);

        this.currentStepIndex++;
        if (this.game.ui?.updateQuestUI) {
            this.game.ui.updateQuestUI();
        }

        this._showCurrentStep();
    }

    _completeTutorial() {
        if (!this.activeTutorial) return;

        const tutorialId = this.activeTutorial.id;
        Logger.log(`[Tutorial] Completed: ${this.activeTutorial.title}`);
        this.completedTutorials.add(tutorialId);

        if (this.game.ui) {
            this.game.ui.hideTutorialGuide();
            this.game.ui.clearTutorialHighlight?.();
            this.game.ui.logSystemMessage(`튜토리얼 완료: ${this.activeTutorial.title}`);
        }

        this.game.input?.setAllowedActions(null);

        if (this.game.monsterManager?.setTutorialMode) {
            this.game.monsterManager.setTutorialMode(false);
        }

        if (tutorialId === 'basic_training') {
            if (this.game.localPlayer?.questData) {
                this.game.localPlayer.questData.prologueCompleted = true;
                this.game.localPlayer.questData.basicTrainingCompleted = true;
            }

            this.game.net?.setZoneParticipationEnabled?.(true);
            this.game.sceneManager?.currentScene?.activateZoneParticipation?.();

            if (this.game.quests?.acceptQuest) {
                this.game.quests.acceptQuest('quest_slime_10');
            }

            this.game.monsterManager?.primeSpawnCycle?.();
            this.game.ui?.logSystemMessage('튜토리얼이 끝났습니다. 이제 슬라임 사냥을 시작해 보세요.');
        }

        if (this.game.localPlayer) {
            this.game.localPlayer.saveState();
        }

        this.activeTutorial = null;
        this.pendingTutorialId = null;
        this.currentStepIndex = -1;
        this.progress = { count: 0 };

        if (this.game.ui?.updateQuestUI) {
            this.game.ui.updateQuestUI();
        }
    }
}
