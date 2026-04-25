import Logger from '../utils/Logger.js';

export default class StoryManager {
    constructor(game) {
        this.game = game;
        this.resourceManager = game.resources;
        this.currentStory = null;
        this.currentSequence = null;
        this.isStoryActive = false;
        this.storyContext = null;

        // v2.2: Cutscene state
        this.fadeAlpha = 0;   // 0 = clear, 1 = fully black
        this.fadeTarget = 0;
        this.fadeSpeed = 0;
        this.isFading = false;
        this.executedSequenceActions = new Set();
    }

    resetFade() {
        this.fadeAlpha = 0;
        this.fadeTarget = 0;
        this.isFading = false;
    }

    syncStoryOriginClass() {
        if (typeof document === 'undefined') return;
        document.body?.classList.toggle('story-origin-opening', this.storyContext?.origin === 'opening');
    }

    async loadStory(id) {
        try {
            const data = await this.resourceManager.loadJSON(`/assets/data/narrative/${id}.json`);
            const localizedData = this.game.i18n?.localizeContent?.(data) || data;
            this.currentStory = localizedData;
            Logger.log(`Story loaded: ${localizedData.title}`);
            return localizedData;
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

    startStory(id, startSequenceId = 'start', options = {}) {
        if (typeof startSequenceId === 'object' && startSequenceId !== null) {
            options = startSequenceId;
            startSequenceId = 'start';
        }

        this.storyContext = {
            origin: options.origin || 'world',
            restoreHud: options.restoreHud !== false,
            onComplete: typeof options.onComplete === 'function' ? options.onComplete : null
        };
        this.syncStoryOriginClass();

        return this.loadStory(id).then(data => {
            if (data) {
                // v2.3.1: Hide HUD during story
                if (this.game.ui) this.game.ui.hideHUD();

                this.isStoryActive = true;
                this.executedSequenceActions.clear();
                this.playSequence(startSequenceId);
            } else if (this.storyContext?.origin === 'opening') {
                this.storyContext.onComplete?.({ storyId: id, failed: true });
                this.storyContext = null;
                this.syncStoryOriginClass();
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
        this._applySequenceCameraTarget(seq);
        this._preloadSequenceMedia(seq);

        // v2.2: Execute cutscene actions before dialog
        if (seq.actions && seq.actions.length > 0) {
            this._executeActions(seq.actions, () => {
                this._showSequenceDialog(seq);
            });
        } else {
            // Trigger legacy action
            this._runSequenceAction(seq);
            this._showSequenceDialog(seq);
        }
    }

    _applySequenceCameraTarget(seq) {
        const target = seq?.cameraTarget;
        const camera = this.game.camera;
        if (!target || !camera) return;

        const targetX = Number(target.x);
        const targetY = Number(target.y);
        if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;

        camera.x = targetX - camera.width / 2;
        camera.y = targetY - camera.height / 2;
        camera.clampToBounds?.();
    }

    _preloadSequenceMedia(seq) {
        if (!seq || !this.resourceManager?.loadImage) return;
        const visual = seq.visual || {};
        [
            seq.background || visual.background,
            seq.illustration || visual.illustration,
            seq.portrait || visual.portrait
        ].forEach((url) => {
            if (typeof url !== 'string' || !url.trim()) return;
            this.resourceManager.loadImage(url).catch(() => {
                Logger.warn(`[StoryManager] Failed to preload story media: ${url}`);
            });
        });
    }

    _showSequenceDialog(seq) {
        // Show dialog if sequence has text
        if (seq.text && this.game.ui) {
            this.game.ui.showDialog([seq], { storyControlled: true });
        } else if (!seq.text) {
            this._runSequenceAction(seq);
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
                            const soundId = String(action.id);
                            if (soundId.startsWith('bgm_')) {
                                this.game.sound.loadAndPlayBgm(soundId);
                            } else {
                                const sfxId = soundId.startsWith('sfx_') ? soundId.substring(4) : soundId;
                                this.game.sound.playSfx(sfxId);
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

                    case 'cinematic_title':
                        this.game.ui?.showCinematicTitle?.({
                            title: action.title || action.text,
                            subtitle: action.subtitle || '',
                            accent: action.accent,
                            size: action.size,
                            durationMs: duration || action.durationMs
                        });
                        if (duration <= 0) resolve();
                        else setTimeout(resolve, duration);
                        break;

                    case 'vignette':
                        this.game.ui?.showCinematicVignette?.({
                            color: action.color,
                            center: action.center,
                            alpha: action.alpha,
                            durationMs: duration || action.durationMs
                        });
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
        this._runSequenceAction(seq);

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
        const storyId = this.currentStory?.id || null;
        const context = this.storyContext || { origin: 'world', restoreHud: true, onComplete: null };
        let nextStoryId = null;
        let shouldStartBasicTraining = false;

        // v2.3: Start Tutorial after Prologue
        if (context.origin !== 'opening' && storyId === 'prologue') {
            if (this.game.localPlayer?.questData) {
                this.game.localPlayer.questData.prologueCompleted = true;
                this.game.localPlayer.saveState();
            }
            if (!this.game.localPlayer?.questData?.chapter1FatherOathCompleted) {
                nextStoryId = 'chapter1_father_oath';
            } else {
                shouldStartBasicTraining = true;
            }
        } else if (context.origin !== 'opening' && storyId === 'chapter1_father_oath') {
            if (this.game.localPlayer?.questData) {
                this.game.localPlayer.questData.chapter1FatherOathCompleted = true;
                this.game.localPlayer.saveState();
            }
            shouldStartBasicTraining = true;
        }

        this.isStoryActive = false;
        this.currentStory = null;
        this.currentSequence = null;
        this.storyContext = null;
        this.syncStoryOriginClass();
        this.executedSequenceActions.clear();
        this.fadeAlpha = 0;
        this.isFading = false;

        // v2.3.1: Restore HUD
        if (this.game.ui) {
            this.game.ui.hideDialog();
            if (context.restoreHud) {
                this.game.ui.showHUD();
            } else {
                this.game.ui.hideHUD?.();
            }
        }
        Logger.log('Story ended.');

        if (context.origin === 'opening') {
            this.game.markOpeningPrologueCompleted?.();
            window.setTimeout(() => context.onComplete?.({ storyId }), 80);
        } else if (nextStoryId) {
            window.setTimeout(() => this.startStory(nextStoryId), 120);
        } else if (shouldStartBasicTraining && this.game.tutorial) {
            window.setTimeout(() => this.game.tutorial.startTutorial('basic_training'), 120);
        }
    }

    _handleAction(action) {
        Logger.log(`[Story] Triggering action: ${action}`);
        if (!action || action === 'none') return;

        if (action === 'complete_prologue') {
            if (this.storyContext?.origin === 'opening') return;
            if (this.game.localPlayer?.questData) {
                this.game.localPlayer.questData.prologueCompleted = true;
                this.game.localPlayer.saveState(false, {
                    debounceMs: 0,
                    reason: 'complete_prologue'
                });
            }
            this.game.ui?.logSystemMessage(this.game.i18n?.t?.('system.prologueCompleted') || '프롤로그를 완료했습니다. 오두막 주변의 이상 징후를 조사하세요.');
        } else if (action === 'start_quest_1') {
            this.game.ui?.logSystemMessage(this.game.i18n?.t?.('system.questStart') || '기초 훈련을 마치면 첫 슬라임 퀘스트가 열립니다.');
            if (this.game.ui?.updateQuestUI) this.game.ui.updateQuestUI();
        }
    }

    _runSequenceAction(seq = null) {
        if (!seq?.action || seq.action === 'none') return;
        const key = `${this.currentStory?.id || 'story'}:${seq.id || 'sequence'}:${seq.action}`;
        if (this.executedSequenceActions.has(key)) return;
        this.executedSequenceActions.add(key);
        this._handleAction(seq.action);
    }
}
