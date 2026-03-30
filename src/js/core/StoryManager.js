import Logger from '../utils/Logger.js';

export default class StoryManager {
    constructor(game) {
        this.game = game;
        this.resourceManager = game.resources;
        this.currentStory = null;
        this.currentSequence = null;
        this.isStoryActive = false;

        // v2.2: Cutscene state
        this.fadeAlpha = 0;   // 0 = clear, 1 = fully black
        this.fadeTarget = 0;
        this.fadeSpeed = 0;
        this.isFading = false;
    }

    resetFade() {
        this.fadeAlpha = 0;
        this.fadeTarget = 0;
        this.isFading = false;
    }

    async loadStory(id) {
        try {
            const data = await this.resourceManager.loadJSON(`/assets/data/narrative/${id}.json`);
            this.currentStory = data;
            Logger.log(`Story loaded: ${data.title}`);
            return data;
        } catch (e) {
            Logger.error(`Failed to load story: ${id}`, e);
            return null;
        }
    }

    handleInteraction(interactionId) {
        if (!interactionId) return;

        if (interactionId === 'prologue_start') {
            this.startStory('prologue');
        } else if (interactionId === 'dialog_intro') {
            this.startDialog([
                { text: "여행자여, 환영합니다.", name: "가이드" },
                { text: "이곳은 바람의 언덕입니다.", name: "가이드" }
            ]);
        }
    }

    startDialog(dialogData) {
        if (this.game.ui) {
            this.game.ui.showDialog(dialogData);
        }
    }

    startStory(id, startSequenceId = 'start') {
        this.loadStory(id).then(data => {
            if (data) {
                // v2.3.1: Hide HUD during story
                if (this.game.ui) this.game.ui.hideHUD();

                this.isStoryActive = true;
                this.playSequence(startSequenceId);
            }
        });
    }

    playSequence(sequenceId) {
        if (!this.currentStory) return;

        const seq = this.currentStory.sequences.find(s => s.id === sequenceId);
        if (!seq) {
            this.endStory();
            return;
        }

        this.currentSequence = seq;

        // v2.2: Execute cutscene actions before dialog
        if (seq.actions && seq.actions.length > 0) {
            this._executeActions(seq.actions, () => {
                this._showSequenceDialog(seq);
            });
        } else {
            // Trigger legacy action
            if (seq.action) {
                this._handleAction(seq.action);
            }
            this._showSequenceDialog(seq);
        }
    }

    _showSequenceDialog(seq) {
        // Show dialog if sequence has text
        if (seq.text && this.game.ui) {
            this.game.ui.showDialog([seq], { storyControlled: true });
        } else if (!seq.text) {
            // No dialog, auto-advance
            if (seq.next) {
                this.playSequence(seq.next);
            } else {
                this.endStory();
            }
        }
    }

    /**
     * v2.2: Execute a list of cutscene actions sequentially
     * @param {Array} actions - Action objects
     * @param {Function} onComplete - Called when all actions finish
     */
    async _executeActions(actions, onComplete) {
        for (const action of actions) {
            await this._executeAction(action);
        }
        if (onComplete) onComplete();
    }

    /**
     * Execute a single cutscene action
     */
    _executeAction(action) {
        return new Promise((resolve) => {
            try {
                // v2.2.1: Robust duration handling (allow 0)
                const duration = action.duration !== undefined ? action.duration : 1000;

                switch (action.type) {
                    case 'delay':
                        if (duration <= 0) resolve();
                        else setTimeout(resolve, duration);
                        break;

                    case 'fade_out':
                        this._startFade(1, duration, resolve);
                        break;

                    case 'fade_in':
                        this._startFade(0, duration, resolve);
                        break;

                    case 'camera_pan': {
                        const camera = this.game.camera;
                        if (camera && action.target) {
                            const targetX = action.target.x - camera.width / 2;
                            const targetY = action.target.y - camera.height / 2;

                            if (duration <= 0) {
                                camera.x = targetX;
                                camera.y = targetY;
                                camera.clampToBounds();
                                resolve();
                                return;
                            }

                            const startX = camera.x;
                            const startY = camera.y;
                            const startTime = performance.now();

                            const animate = () => {
                                const elapsed = performance.now() - startTime;
                                const t = Math.min(1, elapsed / duration);
                                // Ease-in-out
                                const ease = t < 0.5
                                    ? 2 * t * t
                                    : -1 + (4 - 2 * t) * t;

                                camera.x = startX + (targetX - startX) * ease;
                                camera.y = startY + (targetY - startY) * ease;
                                camera.clampToBounds();

                                if (t < 1) {
                                    requestAnimationFrame(animate);
                                } else {
                                    resolve();
                                }
                            };
                            requestAnimationFrame(animate);
                        } else {
                            resolve();
                        }
                        break;
                    }

                    case 'shake':
                        if (this.game.camera?.shake) {
                            this.game.camera.shake(
                                action.intensity || 10,
                                duration ? duration / 1000 : 0.3
                            );
                        }
                        if (duration <= 0) resolve();
                        else setTimeout(resolve, duration);
                        break;

                    case 'sound':
                        if (this.game.sound && action.id) {
                            if (action.id.startsWith('bgm_')) {
                                this.game.sound.loadAndPlayBgm(action.id);
                            } else {
                                this.game.sound.playSfx(action.id);
                            }
                        }
                        resolve();
                        break;

                    case 'message':
                        if (this.game.ui && action.text) {
                            this.game.ui.showCenterMessage(action.text, action.color || '#ffeb3b');
                        }
                        if (duration <= 0) resolve();
                        else setTimeout(resolve, duration);
                        break;

                    case 'action':
                        this._handleAction(action.id);
                        resolve();
                        break;

                    default:
                        Logger.warn(`[StoryManager] Unknown action type: ${action.type}`);
                        resolve();
                }
            } catch (e) {
                Logger.error(`[StoryManager] Cutscene action failed: ${action?.type || 'unknown'}`, e);
                resolve();
            }
        });
    }

    /**
     * v2.2: Start a fade transition
     */
    _startFade(target, duration, onComplete) {
        // v2.2.1: Division by zero safety
        if (duration <= 0) {
            this.fadeAlpha = target;
            this.fadeTarget = target;
            this.isFading = false;
            if (onComplete) onComplete();
            return;
        }

        this.fadeTarget = target;
        this.fadeSpeed = Math.abs(target - this.fadeAlpha) / (duration / 1000 * 60);
        this.isFading = true;

        const tick = () => {
            if (this.fadeAlpha < this.fadeTarget) {
                this.fadeAlpha = Math.min(this.fadeTarget, this.fadeAlpha + this.fadeSpeed);
            } else if (this.fadeAlpha > this.fadeTarget) {
                this.fadeAlpha = Math.max(this.fadeTarget, this.fadeAlpha - this.fadeSpeed);
            }

            if (Math.abs(this.fadeAlpha - this.fadeTarget) < 0.01) {
                this.fadeAlpha = this.fadeTarget;
                this.isFading = false;
                if (onComplete) onComplete();
                return;
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    /**
     * v2.2: Render fade overlay (call from WorldScene.render)
     */
    renderFade(ctx, width, height) {
        if (this.fadeAlpha > 0) {
            ctx.save();
            ctx.fillStyle = `rgba(0, 0, 0, ${this.fadeAlpha})`;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }
    }

    advance(optionIndex = null) {
        if (!this.isStoryActive || !this.currentSequence) return;

        const seq = this.currentSequence;

        if (seq.options && optionIndex !== null) {
            const nextId = seq.options[optionIndex].next;
            this.playSequence(nextId);
        } else if (seq.next) {
            this.playSequence(seq.next);
        } else {
            this.endStory();
        }
    }

    endStory() {
        // v2.3: Start Tutorial after Prologue
        if (this.currentStory && this.currentStory.id === 'prologue') {
            if (this.game.tutorial) {
                setTimeout(() => {
                    this.game.tutorial.startTutorial('basic_training');
                }, 1000);
            }
        }

        this.isStoryActive = false;
        this.currentStory = null;
        this.currentSequence = null;
        this.fadeAlpha = 0;
        this.isFading = false;

        // v2.3.1: Restore HUD
        if (this.game.ui) {
            this.game.ui.hideDialog();
            this.game.ui.showHUD();
        }
        Logger.log('Story ended.');
    }

    _handleAction(action) {
        Logger.log(`[Story] Triggering action: ${action}`);
        if (action === 'start_quest_1') {
            if (this.game.localPlayer) {
                this.game.localPlayer.questData.slimeQuestClaimed = true;
                this.game.localPlayer.saveState();
                this.game.ui.logSystemMessage('퀘스트가 시작되었습니다: 슬라임 토벌');
                if (this.game.ui.updateQuestUI) this.game.ui.updateQuestUI();
            }
        }
    }
}
