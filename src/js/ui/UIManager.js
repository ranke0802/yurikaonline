export class UIManager {
    constructor(game) {
        this.game = game;
        this.overlay = document.getElementById('popup-overlay');
        this.pendingStats = { vitality: 0, intelligence: 0, wisdom: 0, agility: 0 };
        this.initialPoints = 0;
        this.isPaused = false;
        this.setupEventListeners();
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
            laser: { name: '레이저 공격 (J)', desc: '관통형 기공파를 발사합니다. [데미지: 공격력의 100%] [적중 시 마나 회복: 레벨당 +1]' },
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

        // Direct Fullscreen Button Listener (Single point of truth to avoid race conditions)
        const fsBtn = document.getElementById('fullscreen-toggle');
        if (fsBtn) {
            const handleFs = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Browsers prefer 'click' for Fullscreen API as a trusted user gesture.
                this.toggleFullscreen();
            };
            fsBtn.addEventListener('click', handleFs);
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
                const laserDmg = Math.floor(p.attackPower);
                const mpRec = lv;
                currentEffect = `<div class="current-effect">현재 효과 (Lv.${lv}):<br>데미지: ${laserDmg} | 마나 회복: ${mpRec}</div>`;
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
        // Stats
        document.getElementById('stat-points').textContent = p.statPoints;

        const statsToShow = ['vitality', 'intelligence', 'wisdom', 'agility'];
        statsToShow.forEach(s => {
            const valEl = document.getElementById(`val-${s}`);
            if (valEl) valEl.textContent = p[s] + this.pendingStats[s];

            const upBtn = document.querySelector(`.stat-up-btn[data-stat="${s}"]`);
            const downBtn = document.querySelector(`.stat-down-btn[data-stat="${s}"]`);

            if (upBtn) {
                if (p.statPoints > 0) upBtn.classList.remove('hidden');
                else upBtn.classList.add('hidden');
            }

            if (downBtn) {
                if (this.pendingStats[s] > 0) downBtn.classList.remove('hidden');
                else downBtn.classList.add('hidden');
            }
        });

        // Derived (Immediate Predicted Feedback)
        const predVit = p.vitality + this.pendingStats.vitality;
        const predInt = p.intelligence + this.pendingStats.intelligence;
        const predWis = p.wisdom + this.pendingStats.wisdom;
        const predAgi = p.agility + this.pendingStats.agility;

        const predMaxHp = 20 + (predVit * 10);
        const predMaxMp = 30 + (predWis * 10);
        const predDef = predVit * 1;
        const predHpRegen = predVit * 1;
        const predMpRegen = predWis * 1;
        const predAtk = 5 + (predInt * 1) + Math.floor(predWis / 2) + (p.level * 1);
        const predAtkSpd = 1.0 + (predAgi * 0.1);
        const predCrit = 0.1 + (predAgi * 0.01);
        const predMoveSpd = 1.0 + (predAgi * 0.05);

        document.getElementById('val-hp-range').textContent = `${Math.floor(p.hp)}/${predMaxHp}`;
        document.getElementById('val-mp-range').textContent = `${Math.floor(p.mp)}/${predMaxMp}`;
        document.getElementById('val-atk').textContent = predAtk;
        document.getElementById('val-atk-spd').textContent = predAtkSpd.toFixed(2);
        document.getElementById('val-crit').textContent = `${(predCrit * 100).toFixed(0)}%`;
        document.getElementById('val-move-spd').textContent = `${(predMoveSpd * 100).toFixed(0)}%`;

        // Update additional stats in UI if they exist (or update the derived panel)
        const defRow = document.getElementById('val-def');
        if (defRow) defRow.textContent = predDef;
        const regenRow = document.getElementById('val-regen');
        if (regenRow) regenRow.textContent = `HP:${predHpRegen}/MP:${predMpRegen}`;
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
            slimeItem.style.textDecoration = 'line-through';
            slimeItem.style.opacity = '0.5';
        }

        if (bossStatus) bossStatus.textContent = p.questData.bossKilled ? '완료' : '미완료';
        if (p.questData.bossQuestClaimed && bossItem) {
            bossItem.style.textDecoration = 'line-through';
            bossItem.style.opacity = '0.5';
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
            msgArea.scrollTop = msgArea.scrollHeight;
        }
    }

    toggleFullscreen() {
        const container = document.getElementById('game-container') || document.documentElement;

        // Multi-browser support
        const requestMethod = container.requestFullscreen || container.webkitRequestFullscreen || container.mozRequestFullScreen || container.msRequestFullscreen;
        const exitMethod = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
        const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;

        if (!fullscreenElement) {
            if (requestMethod) {
                requestMethod.call(container).catch(err => {
                    // Silently fail as requested, only log to console for debugging
                    console.error('Fullscreen Error:', err);
                });
            } else {
                this.logSystemMessage('이 브라우저는 전체화면 기능을 지원하지 않습니다.');
            }
        } else {
            if (exitMethod) {
                exitMethod.call(document);
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
