import Logger from '../utils/Logger.js';

export class UIManager {
    constructor(game) {
        this.game = game;
        this.overlay = document.getElementById('popup-overlay');
        this.pendingStats = { vitality: 0, intelligence: 0, wisdom: 0, agility: 0 };
        this.initialPoints = 0;
        this.isPaused = false;
        this.devMode = false;
        this.setupEventListeners();
        this.setupFullscreenListeners();
        this.setupDevModeListeners();
        this.inputManager = game.input; // Local reference
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
            laser: { name: '체인 라이트닝 (J)', desc: '연쇄형 기본공격 (전기속성). 적중한 적 하나당 마나 1을 회복합니다. [연쇄: Lv당 +1] [기본 10% / 공격 1회당 증폭 / 마나 회복 +1]' },
            missile: { name: '매직 미사일 (H)', desc: '자동 추적 미사일을 발사합니다. [데미지: 공격력의 90%] [발사 수: 레벨당 +1개] [마나 소모: 4 / 레벨당 +3]' },
            fireball: { name: '파이어볼 (U)', desc: '폭발하는 화염구를 던집니다. [직격 데미지: 공격력의 180% / 레벨당 +30% 추가] [마나 소모: 12 / 레벨당 +4] [화상: 2초 이상 지속 / 레벨당 +0.5초] [폭발 범위: 투사체의 2.5배]' },
            shield: { name: '앱솔루트 베리어 (K)', desc: '절대 방어막을 전개하여 다음 1회의 피격을 완전히 무효화합니다. [마나 소모: 30] [재사용 대기시간: 15초] [레벨업 불가]' }
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
            if (e) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
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
                const skillId = btn.getAttribute('data-skill');
                const p = this.game.localPlayer;
                if (!p || !skillId) return;

                // Exponential Cost: 300 * 2^(lv-1)
                const lv = p.skillLevels[skillId] || 1;
                const cost = 300 * Math.pow(2, lv - 1);

                if (p.gold >= cost) {
                    p.gold -= cost;
                    p.updateGoldInventory(); // v0.22.9
                    p.skillLevels[skillId]++;
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
                // This fixes Spacebar scrolling issues and WASD movement while typing
                e.stopPropagation();

                if (e.isComposing) return; // Prevent double trigger with IME

                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation(); // v0.26.3: Prevent global listener from re-focusing
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

    showGenericModal(title, message, onYes, onNo) {
        const modal = document.getElementById('generic-modal');
        if (!modal) return;

        const titleEl = document.getElementById('generic-modal-title');
        const msgEl = document.getElementById('generic-modal-message');
        const yesBtn = document.getElementById('generic-modal-yes');
        const noBtn = document.getElementById('generic-modal-no');

        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;

        const newYes = yesBtn.cloneNode(true);
        const newNo = noBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYes, yesBtn);
        noBtn.parentNode.replaceChild(newNo, noBtn);

        newYes.onclick = () => {
            if (onYes) onYes();
            else this.hideGenericModal();
        };

        newNo.onclick = () => {
            if (onNo) onNo();
            this.hideGenericModal();
        };

        modal.classList.remove('hidden');
        modal.classList.add('visible');
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
                const baseRatio = 0.10 + (lv - 1) * 0.05;
                const increment = 0.10 + (lv - 1) * 0.05;
                const minDmg = Math.floor(p.attackPower * baseRatio);
                const maxDmg = Math.floor(p.attackPower * 1.0);
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
                const fDmg = Math.floor(p.attackPower * (1.8 + (lv - 1) * 0.3));
                const fRad = 20 + (lv - 1) * 20;
                const fBurn = 2.0 + (lv - 1) * 0.5;
                const fCost = 12 + (lv - 1) * 4;
                currentEffect = `<div class="current-effect">현재 효과 (Lv.${lv}):<br>위력: ${fDmg} (180% + 30%/lv) | 마나 소모: ${fCost} | 화상: ${fBurn}초</div>`;
                break;
            case 'shield':
                currentEffect = `<div class="current-effect">현재 효과:<br>다음 1회 피격 데미지 0 (BLOCK)</div>`;
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
        // Clamp current stats to new maximums
        p.hp = Math.min(p.hp, p.maxHp);
        p.mp = Math.min(p.mp, p.maxMp);
        this.pendingStats = { vitality: 0, intelligence: 0, wisdom: 0, agility: 0 };
        p.saveState(); // v0.00.01: Persist stats to DB
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

        updateDerived('val-atk', 5 + (baseInt * 1) + Math.floor(baseWis / 2), 5 + (predInt * 1) + Math.floor(predWis / 2)); // Removed (p.level * 1)
        updateDerived('val-def', baseVit * 1, predVit * 1);
        updateDerived('val-hp-regen', baseVit * 1, predVit * 1);
        updateDerived('val-mp-regen', baseWis * 1, predWis * 1);
        updateDerived('val-atk-spd', 1.0 + (baseAgi * 0.1), 1.0 + (predAgi * 0.1), false, 2);
        updateDerived('val-crit', 0.1 + (baseAgi * 0.01), 0.1 + (predAgi * 0.01), true);
        updateDerived('val-move-spd', 1.0 + (baseAgi * 0.05), 1.0 + (predAgi * 0.05), true);

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
            const cost = 300 * Math.pow(2, lv - 1);
            const costEl = document.querySelector(`.skill-cost[data-skill="${skillId}"]`);
            if (costEl) costEl.textContent = skillId === 'shield' ? '-' : cost;

            const btn = document.querySelector(`.skill-up-btn[data-skill="${skillId}"]`);
            if (btn) {
                if (skillId === 'shield') {
                    btn.textContent = 'MAX';
                    btn.classList.add('disabled');
                    btn.disabled = true;
                } else {
                    btn.disabled = p.gold < cost;
                    btn.classList.toggle('disabled', p.gold < cost);
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

        if (!taskDisplay || !rewardDisplay) return;

        // Determine Active Quest
        let currentQuest = null;
        if (!p.questData.slimeQuestClaimed) {
            currentQuest = {
                title: "슬라임 10마리 처치",
                task: `진행도: ${Math.min(10, p.questData.slimeKills)}/10`,
                reward: "스탯 포인트 +2",
                canClaim: p.questData.slimeKills >= 10,
                claimFn: () => this.claimSlimeReward(p)
            };
        } else if (!p.questData.bossQuestClaimed) {
            currentQuest = {
                title: "대왕 슬라임 토벌",
                task: `진행도: ${p.questData.bossKilled ? '1' : '0'}/1`,
                reward: "스탯 포인트 +5",
                canClaim: p.questData.bossKilled,
                claimFn: () => this.claimBossReward(p)
            };
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
                rewardText.textContent = `클릭하여 ${currentQuest.reward} 획득`;

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
        p.statPoints += 2; // 2 Stat Points reward
        this.logSystemMessage('QUEST 완료: 슬라임 토벌 보상 지급 (스탯 포인트 +2)');
        this.showRewardModal("슬라임 처치 퀘스트 완료!", "보상: 스탯 포인트 2개를 획득했습니다!");
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
        if (msgEl) msgEl.textContent = message;
        if (modal) modal.classList.remove('hidden');
        this.isPaused = true;
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

        // v1.98: Live update developer overlay if active
        if (this.devMode) this.updateDevOverlay();
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
                const angle = (cdTime / maxCd) * 360;
                if (overlay) overlay.style.setProperty('--cd-angle', `${angle}deg`);
                if (timeText) timeText.textContent = cdTime.toFixed(1);
                btn.classList.add('disabled');
            } else {
                if (overlay) overlay.style.setProperty('--cd-angle', '0deg');
                if (timeText) timeText.textContent = '';
                btn.classList.remove('disabled');
            }
        });
    }

    updateMinimap(player, remotePlayers, monsters, mapWidth, mapHeight) {
        const canvas = document.getElementById('minimapCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const w = canvas.width = 150;
        const h = canvas.height = 150;

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
                ctx.arc(mx, my, 2, 0, Math.PI * 2);
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
        const posX = document.getElementById('mini-pos-x');
        const posY = document.getElementById('mini-pos-y');
        if (posX) posX.textContent = Math.round(player.x);
        if (posY) posY.textContent = Math.round(player.y);
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
                    this.logSystemMessage('사용법: /p [닉네임] (파티 초대)');
                    input.value = '';
                    return;
                }
                const result = await this.game.net.inviteToParty(targetName);
                if (result === 'SENT') this.logSystemMessage(`📩 ${targetName}님에게 파티 초대를 보냈습니다.`);
                else if (result === 'SELF') this.logSystemMessage(`🚫 자기 자신을 초대할 수 없습니다.`);
                else if (result === 'NOT_FOUND') this.logSystemMessage(`🚫 사용자를 찾을 수 없습니다: ${targetName}`);
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
        const msgArea = document.querySelector('.chat-messages');
        if (msgArea) {
            const div = document.createElement('div');
            const isMe = data.uid === this.game.net.playerId;
            div.className = isMe ? 'chat-msg-me' : 'chat-msg-other';
            div.innerHTML = `<span class="chat-sender">${data.name}:</span> <span class="chat-text">${data.text}</span>`;
            msgArea.appendChild(div);

            while (msgArea.children.length > 50) {
                msgArea.removeChild(msgArea.firstChild);
            }
            msgArea.scrollTop = msgArea.scrollHeight;
        }

        // Trigger Speech Bubble on Character
        if (data.uid === this.game.net.playerId) {
            if (this.game.localPlayer) this.game.localPlayer.showSpeechBubble(data.text);
        } else {
            const rp = this.game.remotePlayers.get(data.uid);
            if (rp) rp.showSpeechBubble(data.text);
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
}

