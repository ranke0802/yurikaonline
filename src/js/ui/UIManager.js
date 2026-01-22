export class UIManager {
    constructor(game) {
        this.game = game;
        this.overlay = document.getElementById('popup-overlay');
        this.pendingStats = { vitality: 0, intelligence: 0, wisdom: 0, agility: 0 };
        this.initialPoints = 0;
        this.isPaused = false;
        this.setupEventListeners();
        this.setupFullscreenListeners();
    }

    setupFullscreenListeners() {
        const updateClass = () => {
            const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement ||
                document.mozFullScreenElement || document.msFullscreenElement);
            document.body.classList.toggle('is-fullscreen', isFull);
        };
        document.addEventListener('fullscreenchange', updateClass);
        document.addEventListener('webkitfullscreenchange', updateClass);
        document.addEventListener('mozfullscreenchange', updateClass);
        document.addEventListener('MSFullscreenChange', updateClass);

        // Initial check on load
        updateClass();
    }

    setupEventListeners() {
        const handleClose = (e) => {
            e.preventDefault();
            this.hideAllPopups();
        };
        document.querySelectorAll('.close-popup').forEach(btn => {
            btn.addEventListener('click', handleClose);
            btn.addEventListener('touchstart', handleClose, { passive: false });
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
            laser: { name: '체인 라이트닝 (J)', desc: '일반 공격(J) 시 발동되며, 지속 시 위력이 강화되는 연쇄 번개를 방출합니다. 적중 시 마다 마나를 회복하며, 감전된 적은 속도가 80% 둔화됩니다. [연쇄: 1레벨당 +1] [기본 50% / 0.3초당 증폭]' },
            missile: { name: '매직 미사일 (H)', desc: '자동 추적 미사일을 발사합니다. [데미지: 공격력의 90%] [발사 수: 레벨당 +1개] [마나 소모: 4 / 레벨당 +3]' },
            fireball: { name: '파이어볼 (U)', desc: '폭발하는 화염구를 던집니다. [직격 데미지: 공격력의 130% / 레벨당 +30% 추가] [마나 소모: 8 / 레벨당 +3] [화상: 5초 이상 지속 / 레벨당 +1초]' },
            shield: { name: '매직 실드 (K)', desc: '마나의 결계를 생성하여 모든 피해를 마나로 100% 흡수합니다. 레벨에 따라 피해 감소 효율이 대폭 강화됩니다. [피해 감소: 40%(Lv.1) ~ 90%(Lv.11)] [마나 소모: 20 / 레벨당 +5]' }
        };

        const keyToSkill = { 'j': 'laser', 'h': 'missile', 'u': 'fireball', 'k': 'shield' };

        const showTooltipHandler = (e, skillId) => {
            const rect = e.currentTarget.getBoundingClientRect();
            this.showTooltip(skillId, rect.left, rect.top);
        };

        const hideTooltipHandler = () => this.hideTooltip();

        // DELETED Action Bar Tooltips (User requested only inside skill window)

        // 2. Skill popup icons
        document.querySelectorAll('.skill-icon').forEach(icon => {
            const skillItem = icon.closest('.skill-item');
            const upBtn = skillItem ? skillItem.querySelector('.skill-up-btn') : null;
            const skillId = upBtn ? upBtn.getAttribute('data-skill') : null;
            if (!skillId) return;

            icon.addEventListener('mouseenter', (e) => showTooltipHandler(e, skillId));
            icon.addEventListener('mouseleave', hideTooltipHandler);
            icon.addEventListener('touchstart', (e) => {
                showTooltipHandler(e, skillId);
            }, { passive: true });
            icon.addEventListener('touchend', hideTooltipHandler, { passive: true });
        });

        // Chat send button
        const sendBtn = document.querySelector('.send-btn');
        const handleSend = (e) => {
            e.preventDefault();
            this.sendMessage();
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
                const stat = btn.getAttribute('data-stat');
                const p = this.game.localPlayer;
                if (stat && p && p.statPoints > 0) {
                    p.statPoints--;
                    this.pendingStats[stat]++;
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
                const skill = btn.getAttribute('data-skill');
                if (skill && this.game.localPlayer) {
                    this.game.localPlayer.increaseSkill(skill);
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
                    this.game.localPlayer.name = newName;
                    localStorage.setItem('yurika_player_name', newName);
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

    setPortrait(processedImage) {
        const portraits = document.querySelectorAll('.portrait, .status-portrait');
        portraits.forEach(p => {
            const canvas = document.createElement('canvas');
            const sw = processedImage.width / 8;
            const sh = processedImage.height / 5;
            canvas.width = sw;
            canvas.height = sh;
            const ctx = canvas.getContext('2d');
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

        document.querySelectorAll('.game-popup').forEach(p => p.classList.add('hidden'));

        if (isCurrentlyHidden) {
            this.overlay.classList.remove('hidden');
            popup.classList.remove('hidden');
            if (id === 'status-popup') {
                this.pendingStats = { vitality: 0, intelligence: 0, wisdom: 0, agility: 0 };
                this.updateStatusPopup();
            }
            if (id === 'inventory-popup') this.updateInventory();
            if (id === 'skill-popup') this.updateSkillPopup();
            this.isPaused = true;
        } else {
            this.overlay.classList.add('hidden');
            this.isPaused = false;
        }
    }

    showConfirm(message, callback) {
        document.getElementById('confirm-message').innerHTML = message;
        this.confirmModal.classList.remove('hidden');
        this.confirmCallback = callback;
    }

    hideConfirm() {
        this.confirmModal.classList.add('hidden');
    }

    showTooltip(skillId, x, y) {
        const p = this.game.localPlayer;
        if (!p) return;
        const data = this.skillData[skillId];
        if (!data) return;

        const lv = p.skillLevels[skillId] || 1;
        let currentEffect = "";

        switch (skillId) {
            case 'laser':
                const baseChain = 1 + lv;
                const startRatio = 0.5;
                const increment = 0.10 + (lv - 1) * 0.05;
                const minDmg = Math.floor(p.attackPower * startRatio);
                const maxDmg = Math.floor(p.attackPower * 1.5);
                const slow = 80;
                currentEffect = `<div class="current-effect">현재 효과 (Lv.${lv}):<br>연쇄: ${baseChain}마리 | 위력: ${minDmg} ~ ${maxDmg} (+틱당 ${(increment * 100).toFixed(0)}%) | 둔화: ${slow}%</div>`;
                break;
            case 'missile':
                const mCount = lv;
                const mDmg = Math.floor(p.attackPower * 0.9);
                const mCost = 4 + (mCount - 1) * 3;
                currentEffect = `<div class="current-effect">현재 효과 (Lv.${lv}):<br>발사 수: ${mCount}개 | 발당 데미지: ${mDmg} | 마나 소모: ${mCost}</div>`;
                break;
            case 'fireball':
                const fDmg = Math.floor(p.attackPower * (1.3 + (lv - 1) * 0.3));
                const fRad = 80 + (lv - 1) * 40;
                const fBurn = 5 + (lv - 1);
                const fCost = 8 + (lv - 1) * 3;
                currentEffect = `<div class="current-effect">현재 효과 (Lv.${lv}):<br>데미지: ${fDmg} | 마나 소모: ${fCost} | 화상: ${fBurn}초</div>`;
                break;
            case 'shield':
                const reduction = Math.min(0.9, 0.4 + (lv - 1) * 0.05);
                const dur = 60 + (lv - 1) * 20;
                const sCost = 20 + (lv - 1) * 5;
                currentEffect = `<div class="current-effect">현재 효과 (Lv.${lv}):<br>피해 감소율: ${(reduction * 100).toFixed(0)}% | 마나 소모: ${sCost} | 지속시간: ${dur}초</div>`;
                break;
        }

        this.tooltip.querySelector('.tooltip-name').textContent = data.name;
        this.tooltip.querySelector('.tooltip-desc').innerHTML = data.desc + currentEffect;
        this.tooltip.style.left = `${x}px`;
        this.tooltip.style.top = `${y}px`;
        this.tooltip.classList.remove('hidden');
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
        this.pendingStats = { vitality: 0, intelligence: 0, wisdom: 0, agility: 0 };
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
        const statusPopup = document.getElementById('status-popup');
        if (statusPopup && !statusPopup.classList.contains('hidden')) {
            // Status popup has special handling due to confirm modal
            this.togglePopup('status-popup');
        } else {
            if (this.overlay) this.overlay.classList.add('hidden');
            document.querySelectorAll('.game-popup').forEach(p => p.classList.add('hidden'));
            this.isPaused = false;
        }
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
        const hpRangeEl = document.getElementById('val-hp-range');
        const baseMaxHp = 20 + (baseVit * 10);
        const predMaxHp = 20 + (predVit * 10);
        if (hpRangeEl) {
            hpRangeEl.innerHTML = `${Math.floor(p.hp)} / <span class="${predMaxHp > baseMaxHp ? 'stat-predict-inc' : ''}">${predMaxHp}</span>`;
        }

        const mpRangeEl = document.getElementById('val-mp-range');
        const baseMaxMp = 30 + (baseWis * 10);
        const predMaxMp = 30 + (predWis * 10);
        if (mpRangeEl) {
            mpRangeEl.innerHTML = `${Math.floor(p.mp)} / <span class="${predMaxMp > baseMaxMp ? 'stat-predict-inc' : ''}">${predMaxMp}</span>`;
        }

        updateDerived('val-atk', 5 + (baseInt * 1) + Math.floor(baseWis / 2) + (p.level * 1), 5 + (predInt * 1) + Math.floor(predWis / 2) + (p.level * 1));
        updateDerived('val-def', baseVit * 1, predVit * 1);
        updateDerived('val-hp-regen', baseVit * 1, predVit * 1);
        updateDerived('val-mp-regen', baseWis * 1, predWis * 1);
        updateDerived('val-atk-spd', 1.0 + (baseAgi * 0.1), 1.0 + (predAgi * 0.1), false, 2);
        updateDerived('val-crit', 0.1 + (baseAgi * 0.01), 0.1 + (predAgi * 0.01), true);
        updateDerived('val-move-spd', 1.0 + (baseAgi * 0.05), 1.0 + (predAgi * 0.05), true);
    }

    updateSkillPopup() {
        const p = this.game.localPlayer;
        if (!p) return;

        const goldEl = document.getElementById('ui-skill-gold');
        if (goldEl) goldEl.textContent = p.gold;

        // Update levels and costs
        for (const [skillId, level] of Object.entries(p.skillLevels)) {
            const levelEl = document.getElementById(`lvl-${skillId}`);
            if (levelEl) levelEl.textContent = level;

            const costEl = document.querySelector(`.skill-cost[data-skill="${skillId}"]`);
            if (costEl) {
                costEl.textContent = p.getSkillUpgradeCost(skillId);
            }

            const btn = document.querySelector(`.skill-up-btn[data-skill="${skillId}"]`);
            if (btn) {
                const cost = p.getSkillUpgradeCost(skillId);
                btn.disabled = p.gold < cost;
            }
        }
    }

    updateQuestUI() {
        const p = this.game.localPlayer;
        if (!p) return;

        const slimeCount = document.getElementById('quest-slime-count');
        const slimeItem = document.getElementById('quest-slime');
        const bossStatus = document.getElementById('quest-boss-status');
        const bossItem = document.getElementById('quest-boss');

        if (slimeCount) slimeCount.textContent = Math.min(10, p.questData.slimeKills);

        // Add Claim button if finished but not claimed
        this.renderQuestButtons(p);

        if (p.questData.slimeQuestClaimed && slimeItem) {
            slimeItem.classList.add('completed');
        } else if (slimeItem) {
            slimeItem.classList.remove('completed');
        }

        if (bossStatus) bossStatus.textContent = p.questData.bossKilled ? '1' : '0';

        // 슬라임 10마리 처치 후 대왕 슬라임 퀘스트 노출
        if (bossItem) {
            if (p.questData.slimeKills >= 10) {
                bossItem.style.display = 'flex';
                if (p.questData.bossQuestClaimed) bossItem.classList.add('completed');
                else bossItem.classList.remove('completed');
            } else {
                bossItem.style.display = 'none';
            }
        }
    }

    renderQuestButtons(p) {
        const slimeQuest = document.getElementById('quest-slime');
        const bossQuest = document.getElementById('quest-boss');

        if (p.questData.slimeKills >= 10 && !p.questData.slimeQuestClaimed) {
            if (!document.getElementById('claim-slime-btn')) {
                const btn = document.createElement('button');
                btn.id = 'claim-slime-btn';
                btn.className = 'quest-claim-btn';
                btn.textContent = '보상 받기';
                btn.onclick = () => this.claimReward('slime');
                slimeQuest.appendChild(btn);
            }
        }

        if (p.questData.bossKilled && !p.questData.bossQuestClaimed) {
            if (!document.getElementById('claim-boss-btn')) {
                const btn = document.createElement('button');
                btn.id = 'claim-boss-btn';
                btn.className = 'quest-claim-btn';
                btn.textContent = '보상 받기';
                btn.onclick = () => this.claimReward('boss');
                bossQuest.appendChild(btn);
            }
        }
    }

    claimReward(type) {
        const p = this.game.localPlayer;
        let title = "";
        let rewardText = "";

        if (type === 'slime') {
            p.questData.slimeQuestClaimed = true;
            p.statPoints += 2;
            title = "슬라임 처치 퀘스트 완료!";
            rewardText = "보상: 보너스 스텟 포인트 2개 획득!";
            const btn = document.getElementById('claim-slime-btn');
            if (btn) btn.remove();
        } else if (type === 'boss') {
            p.questData.bossQuestClaimed = true;
            p.addGold(1000);
            title = "대왕 슬라임 처치 퀘스트 완료!";
            rewardText = "보상: 1000 골드 획득!";
            const btn = document.getElementById('claim-boss-btn');
            if (btn) btn.remove();
        }

        this.showRewardModal(title, rewardText);
        this.updateQuestUI();
        this.updateStatusPopup();
        this.isPaused = true;
    }

    showRewardModal(title, message) {
        const modal = document.getElementById('reward-modal');
        const titleEl = document.getElementById('reward-title');
        const msgEl = document.getElementById('reward-message');

        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        if (modal) modal.classList.remove('hidden');
    }

    hideRewardModal() {
        const modal = document.getElementById('reward-modal');
        if (modal) modal.classList.add('hidden');
        this.isPaused = false;
    }

    updateInventory() {
        const p = this.game.localPlayer;
        if (!p) return;

        const grid = document.querySelector('.inventory-grid');
        if (!grid) return;

        grid.innerHTML = '';
        p.inventory.forEach(item => {
            const div = document.createElement('div');
            div.className = 'grid-item';
            if (item) {
                div.innerHTML = `<span class="item-icon">${item.icon}</span><span class="item-amount">${item.amount}</span>`;
            }
            grid.appendChild(div);
        });
    }



    updateStats(hp, mp, level, expPerc) {
        const hpFill = document.querySelector('.hp-fill');
        const mpFill = document.querySelector('.mp-fill');
        const expFill = document.querySelector('.exp-fill');
        const levelEl = document.getElementById('ui-level');

        if (hpFill) hpFill.style.width = `${hp}%`;
        if (mpFill) mpFill.style.width = `${mp}%`;
        if (expFill) expFill.style.width = `${expPerc}%`;
        if (levelEl) levelEl.textContent = level;

        // Update bar text
        const p = this.game.localPlayer;
        if (p) {
            const hpc = document.getElementById('ui-hp-cur');
            const hpm = document.getElementById('ui-hp-max');
            const mpc = document.getElementById('ui-mp-cur');
            const mpm = document.getElementById('ui-mp-max');
            if (hpc) hpc.textContent = Math.floor(p.hp);
            if (hpm) hpm.textContent = p.maxHp;
            if (mpc) mpc.textContent = Math.floor(p.mp);
            if (mpm) mpm.textContent = p.maxMp;
        }

        this.updateCooldowns();
    }

    updateCooldowns() {
        const p = this.game.localPlayer;
        if (!p) return;

        // Cooldown keys: u, k, h, j
        const skillKeys = ['u', 'k', 'h', 'j'];
        skillKeys.forEach(key => {
            const btn = document.querySelector(`[data-key="${key}"]`);
            if (!btn) return;

            const cdTime = p.skillCooldowns[key];
            const maxCd = p.skillMaxCooldowns[key];
            const overlay = btn.querySelector('.cooldown-overlay');
            const timeText = btn.querySelector('.cooldown-time');

            if (cdTime > 0) {
                const perc = (cdTime / maxCd) * 100;
                if (overlay) overlay.style.height = `${perc}%`;
                if (timeText) timeText.textContent = cdTime.toFixed(1);
                btn.classList.add('disabled');
            } else {
                if (overlay) overlay.style.height = '0%';
                if (timeText) timeText.textContent = '';
                btn.classList.remove('disabled');
            }
        });
    }

    updateMinimap(player, monsters, mapWidth, mapHeight) {
        const canvas = document.getElementById('minimapCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const w = canvas.width = 150;
        const h = canvas.height = 150;

        // Draw Map BG
        ctx.fillStyle = '#1e272e';
        ctx.fillRect(0, 0, w, h);

        // Scaling factors
        const scaleX = w / mapWidth;
        const scaleY = h / mapHeight;

        // Draw Player
        ctx.fillStyle = '#ffffff';
        const px = player.x * scaleX;
        const py = player.y * scaleY;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();

        // Draw Monsters
        ctx.fillStyle = '#ff3f34';
        monsters.forEach(m => {
            if (m.isDead) return;
            const mx = m.x * scaleX;
            const my = m.y * scaleY;
            ctx.beginPath();
            ctx.arc(mx, my, 2, 0, Math.PI * 2);
            ctx.fill();
        });

        // Update footer
        const posX = document.getElementById('mini-pos-x');
        const posY = document.getElementById('mini-pos-y');
        if (posX) posX.textContent = Math.round(player.x);
        if (posY) posY.textContent = Math.round(player.y);
    }

    sendMessage() {
        const input = document.querySelector('.chat-input-area input');
        const msgArea = document.querySelector('.chat-messages');
        if (input && input.value && msgArea) {
            const div = document.createElement('div');
            div.textContent = `나: ${input.value}`;
            msgArea.appendChild(div);

            // Limit history
            while (msgArea.children.length > 50) {
                msgArea.removeChild(msgArea.firstChild);
            }

            msgArea.scrollTop = msgArea.scrollHeight;
            input.value = '';
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
        const elem = document.documentElement;

        if (!document.fullscreenElement && !document.webkitFullscreenElement &&
            !document.mozFullScreenElement && !document.msFullscreenElement) {
            // 전체화면 진입
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.mozRequestFullScreen) {
                elem.mozRequestFullScreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            }
        } else {
            // 전체화면 해제
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
}
