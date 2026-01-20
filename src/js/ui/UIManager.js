export class UIManager {
    constructor(game) {
        this.game = game;
        this.overlay = document.getElementById('popup-overlay');
        this.pendingStats = { vitality: 0, intelligence: 0, wisdom: 0, agility: 0 };
        this.initialPoints = 0;
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
            laser: { name: '레이저 공격 (J)', desc: '기공을 모아 전방에 레이저를 발사합니다. 적중 시 마나를 회복합니다.' },
            missile: { name: '매직 미사일 (H)', desc: '유도 마나 탄환을 발사합니다. 레벨에 따라 발사 수가 증가합니다.' },
            fireball: { name: '파이어볼 (U)', desc: '강력한 화염구를 던집니다. 폭발 범위 내 적들에게 화상 피해를 입힙니다.' },
            shield: { name: '마나 쉴드 (K)', desc: '마나의 결계를 생성하여 모든 피해를 마나로 100% 흡수합니다. 레벨에 따라 피해 흡수 효율(MP 소모량)이 대폭 강화됩니다. (Lv.1: 데미지의 70% 소모 ~ Lv.6: 데미지의 20% 소모)' }
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
        } else {
            this.overlay.classList.add('hidden');
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
        const data = this.skillData[skillId];
        if (!data) return;
        this.tooltip.querySelector('.tooltip-name').textContent = data.name;
        this.tooltip.querySelector('.tooltip-desc').textContent = data.desc;
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
            this.togglePopup('status-popup');
        } else {
            if (this.overlay) this.overlay.classList.add('hidden');
            document.querySelectorAll('.game-popup').forEach(p => p.classList.add('hidden'));
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
        const predAtk = 5 + (predInt * 1) + (p.level * 1);
        const predAtkSpd = 1.0 + (predAgi * 0.10);

        document.getElementById('val-hp-range').textContent = `${Math.floor(p.hp)}/${predMaxHp}`;
        document.getElementById('val-mp-range').textContent = `${Math.floor(p.mp)}/${predMaxMp}`;
        document.getElementById('val-atk').textContent = predAtk;
        document.getElementById('val-atk-spd').textContent = predAtkSpd.toFixed(2);
    }

    updateSkillPopup() {
        const p = this.game.localPlayer;
        if (!p) return;

        document.getElementById('skill-points').textContent = p.skillPoints;

        // Update degrees
        for (const [skillId, level] of Object.entries(p.skillLevels)) {
            const levelEl = document.getElementById(`lvl-${skillId}`);
            if (levelEl) levelEl.textContent = level;

            const btn = document.querySelector(`.skill-up-btn[data-skill="${skillId}"]`);
            if (btn) {
                btn.disabled = p.skillPoints <= 0;
            }
        }
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
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                this.logSystemMessage(`Error attempting to enable full-screen mode: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }
}
