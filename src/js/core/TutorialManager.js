import Logger from '../utils/Logger.js';

export default class TutorialManager {
    constructor(game) {
        this.game = game;
        this.activeTutorial = null;
        this.currentStepIndex = -1;
        this.completedTutorials = new Set();
        this.progress = { count: 0 }; // Current step progress
    }

    async loadTutorial(id) {
        try {
            const data = await this.game.resources.loadJSON(`/assets/data/tutorials/${id}.json`);
            return data;
        } catch (e) {
            Logger.error(`[Tutorial] Failed to load tutorial: ${id}`, e);
            return null;
        }
    }

    startTutorial(id) {
        if (this.completedTutorials.has(id)) return;

        this.loadTutorial(id).then(data => {
            if (data) {
                this.activeTutorial = data;
                this.currentStepIndex = 0;
                this.progress = { count: 0 };
                Logger.log(`[Tutorial] Started: ${data.title}`);
                this._showCurrentStep();
            }
        });
    }

    stopTutorial() {
        if (this.activeTutorial) {
            Logger.log(`[Tutorial] Stopped: ${this.activeTutorial.title}`);
            this.activeTutorial = null;
            this.currentStepIndex = -1;
            if (this.game.ui) this.game.ui.hideTutorialGuide();
        }
    }

    _showCurrentStep() {
        if (!this.activeTutorial) return;
        const step = this.activeTutorial.steps[this.currentStepIndex];

        if (this.game.ui) {
            this.game.ui.showTutorialGuide(step.instruction);
        }

        // Action on step start (e.g., spawn monster)
        if (step.onStart) {
            this._handleAction(step.onStart);
        }
    }

    _handleAction(action) {
        if (action.type === 'spawn_monster') {
            const player = this.game.localPlayer;
            if (player) {
                // Spawn near player
                const x = player.x + (action.offsetX || 200);
                const y = player.y + (action.offsetY || 0);
                this.game.monsterManager.spawnMonster(action.monsterId, x, y);
            }
        }
    }

    /**
     * Trigger tutorial progress based on game events
     * @param {string} eventType - e.g., 'move', 'kill', 'quest_accept'
     * @param {Object} data - Context data
     */
    trigger(eventType, data = {}) {
        if (!this.activeTutorial) return;

        const step = this.activeTutorial.steps[this.currentStepIndex];
        if (!step || step.trigger !== eventType) return;

        // Check specific conditions
        if (step.target && data.target !== step.target) return;

        // Update progress
        this.progress.count++;

        if (this.progress.count >= (step.count || 1)) {
            this._completeStep();
        }
    }

    update(dt) {
        if (!this.activeTutorial || this.currentStepIndex < 0) return;

        const step = this.activeTutorial.steps[this.currentStepIndex];
        if (!step) return;

        // TIme-based trigger (auto_next)
        if (step.trigger === 'auto_next') {
            if (!step._timer) step._timer = 0;
            step._timer += dt * 1000;

            if (step._timer >= (step.duration || 1000)) {
                this._completeStep();
            }
        }
    }

    _completeStep() {
        const step = this.activeTutorial.steps[this.currentStepIndex];
        Logger.log(`[Tutorial] Step completed: ${step.id}`);

        // Action on step complete
        if (step.onComplete) {
            this._handleAction(step.onComplete);
        }

        this.currentStepIndex++;
        this.progress = { count: 0 };

        if (this.currentStepIndex >= this.activeTutorial.steps.length) {
            this._completeTutorial();
        } else {
            this._showCurrentStep();
        }
    }

    _completeTutorial() {
        if (!this.activeTutorial) return;

        Logger.log(`[Tutorial] Completed: ${this.activeTutorial.title}`);
        this.completedTutorials.add(this.activeTutorial.id);

        if (this.game.ui) {
            this.game.ui.hideTutorialGuide();
            this.game.ui.logSystemMessage(`🎓 튜토리얼 완료: ${this.activeTutorial.title}`);
        }

        // Save state
        if (this.game.localPlayer) {
            this.game.localPlayer.saveState();
        }

        this.activeTutorial = null;
    }
}
