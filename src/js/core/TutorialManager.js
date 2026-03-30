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

    isMobileTutorialLayout() {
        const isNarrow = window.innerWidth <= 900;
        const isPortrait = window.matchMedia?.('(orientation: portrait)')?.matches;
        return isNarrow && !!isPortrait;
    }

    getStepInstruction(step = this.getCurrentStep()) {
        if (!step) return '';
        return this.isMobileTutorialLayout()
            ? (step.instructionMobile || step.instruction)
            : (step.instructionDesktop || step.instruction);
    }

    getStepHighlightTargets(step = this.getCurrentStep()) {
        if (!step) return null;

        if (this.isMobileTutorialLayout()) {
            return step.highlightTargetsMobile || step.highlightTargetMobile || step.highlightTargets || step.highlightTarget || null;
        }

        return step.highlightTargetsDesktop || step.highlightTargetDesktop || step.highlightTargets || step.highlightTarget || null;
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
        const step = this.getCurrentStep();
        if (!step) {
            this._completeTutorial();
            return;
        }

        step._timer = 0;
        this.progress = { count: 0 };
        this.game.input?.setAllowedActions(step.allowedActions || null);

        if (this.game.ui) {
            this.game.ui.showTutorialGuide(this.getStepInstruction(step));
            this.game.ui.updateSkillPopup?.();
            this.game.ui.updateStatusPopup?.();
        }

        this._runActions(step.onStart);
        this.game.ui?.highlightTutorialTargets?.(this.getStepHighlightTargets(step));
    }

    _runActions(actions) {
        if (!actions) return;

        const actionList = Array.isArray(actions) ? actions : [actions];
        actionList.forEach((action) => this._handleAction(action));
    }

    _handleAction(action) {
        if (!action || !action.type) return;

        const player = this.game.localPlayer;

        switch (action.type) {
            case 'spawn_monster': {
                if (!player || !this.game.monsterManager?.spawnMonster) return;

                const x = action.x ?? (player.x + (action.offsetX || 200));
                const y = action.y ?? (player.y + (action.offsetY || 0));
                const spawnResult = this.game.monsterManager.spawnMonster(action.monsterId, x, y, {
                    tutorialOnly: true
                });

                Promise.resolve(spawnResult).then((monsterId) => {
                    const monster = this.game.monsterManager?.monsters?.get(monsterId);
                    if (monster && this.game.localPlayer) {
                        this.game.localPlayer.currentTarget = monster;
                    }
                });
                break;
            }

            case 'clear_tutorial_monsters':
                this.game.monsterManager?.clearTutorialMonsters?.();
                if (player) {
                    player.currentTarget = null;
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
