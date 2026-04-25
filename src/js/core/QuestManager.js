import Logger from '../utils/Logger.js';

/**
 * QuestManager - JSON 기반 퀘스트 시스템
 * 퀘스트 로딩, 진행도 추적, 완료 처리를 담당합니다.
 * 
 * 기존 Player.questData와의 호환성을 위해 하이브리드 방식을 사용합니다.
 * - 새 퀘스트는 JSON으로 정의
 * - 진행도는 QuestManager + Player.questData 양쪽에 반영
 */
export default class QuestManager {
    constructor(game) {
        this.game = game;
        this.rawDefinitions = new Map();
        this.definitions = new Map();   // questId -> definition (from JSON)
        this.activeQuests = new Map();   // questId -> { definition, progress: { objectives: [{current, complete}] } }
        this.completedQuests = new Set(); // questId set
        this._loaded = false;
    }

    /**
     * 모든 퀘스트 정의를 로드합니다.
     */
    async loadQuests() {
        const questFiles = [
            'quest_slime_10',
            'quest_slime_30',
            'quest_boss_king_slime',
            'quest_slime_repeat'
        ];

        for (const id of questFiles) {
            try {
                const data = await this.game.resources.loadJSON(`/assets/data/quests/${id}.json`);
                if (data) {
                    this.rawDefinitions.set(data.id, data);
                    this.definitions.set(data.id, this.game.i18n?.localizeContent?.(data) || data);
                }
            } catch (e) {
                Logger.warn(`[QuestManager] Failed to load quest: ${id}`, e);
            }
        }

        this._loaded = true;
        Logger.log(`[QuestManager] Loaded ${this.definitions.size} quest definitions`);
    }

    refreshLanguage() {
        if (!this._loaded) return;
        this.definitions.clear();
        this.rawDefinitions.forEach((definition, id) => {
            this.definitions.set(id, this.game.i18n?.localizeContent?.(definition) || definition);
        });
        if (this.game.localPlayer?.questData) {
            this.restoreFromLegacy(this.game.localPlayer.questData);
        }
    }

    /**
     * 기존 Player.questData로부터 상태를 복원합니다.
     * @param {Object} questData - Player.questData
     */
    restoreFromLegacy(questData) {
        if (!questData || !this._loaded) return;
        this.activeQuests.clear();
        this.completedQuests.clear();
        const slimeKills = questData.slimeKills || 0;
        const firstQuestUnlocked = !!questData.basicTrainingCompleted ||
            slimeKills > 0 ||
            !!questData.slimeQuestClaimed ||
            !!questData.slime30QuestClaimed ||
            !!questData.bossQuestClaimed ||
            (questData.bossClearCount || 0) > 0;

        // Quest 1: 슬라임 10마리
        if (questData.slimeQuestClaimed) {
            this.completedQuests.add('quest_slime_10');
        } else if (firstQuestUnlocked) {
            this._activateQuest('quest_slime_10', [{
                current: Math.min(slimeKills, 10),
                complete: slimeKills >= 10
            }]);
        }

        // Quest 2: 슬라임 30마리 (누적)
        if (questData.slime30QuestClaimed) {
            this.completedQuests.add('quest_slime_30');
        } else if (questData.slimeQuestClaimed) {
            this._activateQuest('quest_slime_30', [{
                current: Math.min(questData.slimeKills || 0, 30),
                complete: (questData.slimeKills || 0) >= 30
            }]);
        }

        // Quest 3: 보스 처치
        if (questData.bossQuestClaimed) {
            this.completedQuests.add('quest_boss_king_slime');
        } else if (questData.slime30QuestClaimed) {
            this._activateQuest('quest_boss_king_slime', [{
                current: questData.bossKilled ? 1 : 0,
                complete: !!questData.bossKilled
            }]);
        }

        // Quest 4: 반복 퀘스트
        if (questData.bossClearCount > 0) {
            this.completedQuests.add('quest_boss_king_slime');
            this._activateQuest('quest_slime_repeat', [{
                current: questData.slimeRepeatKills || 0,
                complete: (questData.slimeRepeatKills || 0) >= 50
            }]);
        }

        Logger.log(`[QuestManager] Restored: ${this.activeQuests.size} active, ${this.completedQuests.size} completed`);
    }

    /**
     * 퀘스트를 활성화합니다.
     */
    _activateQuest(questId, objectiveProgress = null) {
        const def = this.definitions.get(questId);
        if (!def) return false;

        // 이미 활성화되어 있으면 스킵
        if (this.activeQuests.has(questId)) return false;

        // 선행 퀘스트 확인
        for (const prereq of (def.prerequisites || [])) {
            if (!this.completedQuests.has(prereq)) return false;
        }

        const progress = {
            objectives: objectiveProgress || def.objectives.map(() => ({ current: 0, complete: false }))
        };

        this.activeQuests.set(questId, { definition: def, progress });
        Logger.log(`[QuestManager] Quest activated: ${def.title}`);
        return true;
    }

    /**
     * 퀘스트를 수락합니다.
     * @param {string} questId
     */
    acceptQuest(questId) {
        if (this.completedQuests.has(questId)) {
            // 반복 퀘스트 확인
            const def = this.definitions.get(questId);
            if (def && def.type === 'repeat') {
                this.completedQuests.delete(questId);
                return this._activateQuest(questId);
            }
            return false;
        }
        const success = this._activateQuest(questId);
        if (success && window.game?.tutorial) {
            window.game.tutorial.trigger('quest_accept', { target: questId });
        }
        return success;
    }

    /**
     * 킬 진행도를 업데이트합니다.
     * @param {string} monsterType - 처치한 몬스터 타입 (e.g., 'slime', 'king_slime')
     */
    onMonsterKill(monsterType) {
        let updated = false;

        this.activeQuests.forEach((quest, questId) => {
            quest.definition.objectives.forEach((obj, idx) => {
                if (obj.type === 'kill' && obj.target === monsterType) {
                    if (!quest.progress.objectives[idx].complete) {
                        quest.progress.objectives[idx].current++;
                        if (quest.progress.objectives[idx].current >= obj.count) {
                            quest.progress.objectives[idx].complete = true;
                        }
                        updated = true;
                    }
                }
            });
        });

        if (updated) {
            this._checkQuestCompletions();
        }

        return updated;
    }

    /**
     * 완료 가능한 퀘스트가 있는지 확인합니다.
     */
    _checkQuestCompletions() {
        this.activeQuests.forEach((quest, questId) => {
            const allComplete = quest.progress.objectives.every(o => o.complete);
            if (allComplete) {
                // UI에 완료 가능 알림
                if (this.game.ui) {
                    this.game.ui.logSystemMessage(
                        this.game.i18n?.t?.('system.questAvailable', { title: quest.definition.title })
                        || `퀘스트 완료 가능: ${quest.definition.title}`
                    );
                }
            }
        });
    }

    /**
     * 퀘스트를 완료하고 보상을 지급합니다.
     * @param {string} questId
     * @returns {boolean}
     */
    completeQuest(questId) {
        const quest = this.activeQuests.get(questId);
        if (!quest) return false;

        // 모든 목표 완료 확인
        const allComplete = quest.progress.objectives.every(o => o.complete);
        if (!allComplete) return false;

        const def = quest.definition;
        const player = this.game.localPlayer || (this.game.scenes?.currentScene?.player);

        if (player && def.rewards) {
            // EXP 보상
            if (def.rewards.exp) {
                player.gainExperience(def.rewards.exp);
            }
            // Manastone reward
            const rewardManastone = Number(def.rewards.manastone ?? def.rewards.gold ?? 0);
            if (rewardManastone > 0) {
                player.manastone = Number(player.manastone ?? player.gold ?? 0) + rewardManastone;
                player.updateManastoneInventory?.();
            }

            // 보상 메시지
            if (this.game.ui) {
                this.game.ui.logSystemMessage(
                    `🎉 ${def.title} 완료! (EXP+${def.rewards.exp || 0}, 마석+${rewardManastone})`
                );
            }
        }

        // 완료 처리
        this.activeQuests.delete(questId);
        if (def.type !== 'repeat') {
            this.completedQuests.add(questId);
        }

        // 후속 퀘스트 해금
        if (def.onComplete?.unlocks) {
            for (const nextId of def.onComplete.unlocks) {
                this.acceptQuest(nextId);
            }
        }

        // 저장
        if (player?.saveState) player.saveState();

        Logger.log(`[QuestManager] Quest completed: ${def.title}`);
        return true;
    }

    /**
     * 활성 퀘스트 목록을 반환합니다.
     * @returns {Array<{id, title, description, objectives}>}
     */
    getActiveQuests() {
        const result = [];
        this.activeQuests.forEach((quest, id) => {
            const def = quest.definition;
            result.push({
                id,
                title: def.title,
                description: def.description,
                type: def.type,
                objectives: def.objectives.map((obj, idx) => ({
                    description: obj.description
                        .replace('{current}', quest.progress.objectives[idx].current)
                        .replace('{count}', obj.count),
                    current: quest.progress.objectives[idx].current,
                    target: obj.count,
                    complete: quest.progress.objectives[idx].complete
                })),
                canComplete: quest.progress.objectives.every(o => o.complete)
            });
        });
        return result;
    }

    /**
     * 직렬화 (저장용)
     */
    serialize() {
        return {
            active: Array.from(this.activeQuests.entries()).map(([id, q]) => ({
                id,
                progress: q.progress
            })),
            completed: Array.from(this.completedQuests)
        };
    }

    /**
     * 역직렬화 (로드용)
     */
    deserialize(data) {
        if (!data || !this._loaded) return;

        this.completedQuests = new Set(data.completed || []);
        this.activeQuests.clear();

        for (const entry of (data.active || [])) {
            const def = this.definitions.get(entry.id);
            if (def) {
                this.activeQuests.set(entry.id, {
                    definition: def,
                    progress: entry.progress
                });
            }
        }

        Logger.log(`[QuestManager] Deserialized: ${this.activeQuests.size} active, ${this.completedQuests.size} completed`);
    }
}
