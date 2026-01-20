export class UIManager {
    constructor(game) {
        this.game = game;
        this.overlay = document.getElementById('popup-overlay');
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.querySelectorAll('.close-popup').forEach(btn => {
            btn.addEventListener('click', () => this.hideAllPopups());
        });

        // Trigger buttons click handlers
        const invTrigger = document.querySelector('.inventory-trigger');
        if (invTrigger) invTrigger.addEventListener('click', () => this.togglePopup('inventory-popup'));

        const statTrigger = document.querySelector('.status-trigger');
        if (statTrigger) statTrigger.addEventListener('click', () => this.togglePopup('status-popup'));

        const fsToggle = document.getElementById('fullscreen-toggle');
        if (fsToggle) fsToggle.addEventListener('click', () => this.toggleFullscreen());

        // Chat send button
        const sendBtn = document.querySelector('.send-btn');
        if (sendBtn) sendBtn.addEventListener('click', () => this.sendMessage());

        // Stat Up Buttons
        document.querySelectorAll('.stat-up-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const stat = btn.getAttribute('data-stat');
                if (stat && this.game.localPlayer) {
                    this.game.localPlayer.increaseStat(stat);
                }
            });
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
        document.querySelectorAll('.game-popup').forEach(p => p.classList.add('hidden'));

        if (isCurrentlyHidden) {
            this.overlay.classList.remove('hidden');
            popup.classList.remove('hidden');
            if (id === 'status-popup') this.updateStatusPopup();
            if (id === 'inventory-popup') this.updateInventory();
        } else {
            this.overlay.classList.add('hidden');
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
        document.getElementById('stat-points').textContent = p.statPoints;
        document.getElementById('val-vitality').textContent = p.vitality;
        document.getElementById('val-intelligence').textContent = p.intelligence;
        document.getElementById('val-wisdom').textContent = p.wisdom;
        document.getElementById('val-tenacity').textContent = p.tenacity;

        // Derived
        document.getElementById('val-hp-range').textContent = `${Math.floor(p.hp)}/${p.maxHp}`;
        document.getElementById('val-mp-range').textContent = `${Math.floor(p.mp)}/${p.maxMp}`;
        document.getElementById('val-atk').textContent = p.attackPower;
        document.getElementById('val-atk-spd').textContent = p.attackSpeed.toFixed(2);
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

    hideAllPopups() {
        if (this.overlay) this.overlay.classList.add('hidden');
        document.querySelectorAll('.game-popup').forEach(p => p.classList.add('hidden'));
    }

    updateStats(hp, mp) {
        const hpFill = document.querySelector('.hp-fill');
        const mpFill = document.querySelector('.mp-fill');
        if (hpFill) hpFill.style.width = `${hp}%`;
        if (mpFill) mpFill.style.width = `${mp}%`;
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
            div.style.color = '#cccccc';
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
