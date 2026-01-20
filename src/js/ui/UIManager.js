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

        // Chat send button
        const sendBtn = document.querySelector('.send-btn');
        if (sendBtn) sendBtn.addEventListener('click', () => this.sendMessage());
    }

    setPortrait(processedImage) {
        // This image is the chroma-keyed canvas from Player.js
        const portraits = document.querySelectorAll('.portrait, .status-portrait');
        portraits.forEach(p => {
            const canvas = document.createElement('canvas');
            // Sub-rect for a single frame (1st col, 1st row)
            const sw = processedImage.width / 8; // 8 Cols
            const sh = processedImage.height / 5; // 5 Rows
            canvas.width = sw;
            canvas.height = sh;
            const ctx = canvas.getContext('2d');
            // Front is Row 1, so sy = sh
            ctx.drawImage(processedImage, 0, sh, sw, sh, 0, 0, sw, sh);

            p.style.backgroundImage = `url(${canvas.toDataURL()})`;
            p.style.backgroundSize = 'contain';
            p.style.backgroundRepeat = 'no-repeat';
            p.style.backgroundPosition = 'center';
            p.style.backgroundColor = 'transparent'; // Ensure no green background color
        });
    }

    togglePopup(id) {
        const popup = document.getElementById(id);
        if (!popup) return;

        const isCurrentlyHidden = popup.classList.contains('hidden');

        // Hide others first
        document.querySelectorAll('.game-popup').forEach(p => p.classList.add('hidden'));

        if (isCurrentlyHidden) {
            this.overlay.classList.remove('hidden');
            popup.classList.remove('hidden');
        } else {
            this.overlay.classList.add('hidden');
        }
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
            // Changed from Yellow to a lighter Gray/Silver for better readability but distinct from white
            div.style.color = '#cccccc';
            div.style.fontStyle = 'italic';
            div.textContent = `[System] ${text}`;
            msgArea.appendChild(div);
            msgArea.scrollTop = msgArea.scrollHeight;
        }
    }
}
