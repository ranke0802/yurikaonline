import EventEmitter from '../EventEmitter.js';

export default class TouchHandler extends EventEmitter {
    constructor() {
        super();
        this.joystick = { x: 0, y: 0, active: false };
        this.maxRadius = 50;

        // DOM Elements
        this.base = document.getElementById('joystick-base');
        this.stick = document.getElementById('joystick-stick');
        this.container = document.getElementById('joystick-container');
        this.area = document.getElementById('joystick-area');

        // Bind methods
        this._handleStart = this._handleStart.bind(this);
        this._handleMove = this._handleMove.bind(this);
        this._handleEnd = this._handleEnd.bind(this);

        this.init();
    }

    init() {
        if (!this.base || !this.stick || !this.container) return;

        // Joystick Area Event Listeners
        if (this.area) {
            this.area.addEventListener('touchstart', this._handleStart, { passive: false });
            this.area.addEventListener('mousedown', this._handleStart);
        } else {
            this.container.addEventListener('touchstart', this._handleStart, { passive: false });
            this.container.addEventListener('mousedown', this._handleStart);
        }

        // Global Move/End Listeners
        window.addEventListener('touchmove', this._handleMove, { passive: false });
        window.addEventListener('touchend', this._handleEnd);
        window.addEventListener('mousemove', this._handleMove);
        window.addEventListener('mouseup', this._handleEnd);

        // UI Buttons (Skill/Attack) binding
        this._bindUiButtons();
    }

    _bindUiButtons() {
        const uiButtons = document.querySelectorAll('.skill-btn, .attack-btn, .inventory-trigger, .status-trigger, .menu-btn');
        uiButtons.forEach(btn => {
            const key = btn.getAttribute('data-key');
            if (!key) return;

            const startAction = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Map 'j' to 'ATTACK', 'k' to 'ROLL' etc if needed, or pass raw key
                // For now, passing raw key, InputManager can remap or broadcast
                this.emit('actionDown', key);
            };

            const endAction = (e) => {
                this.emit('actionUp', key);
            };

            btn.addEventListener('mousedown', startAction);
            btn.addEventListener('touchstart', startAction, { passive: false });
            btn.addEventListener('mouseup', endAction);
            btn.addEventListener('touchend', endAction);
        });
    }

    _handleStart(e) {
        // ... (Existing logic to check button proximity) ...
        const target = e.target;
        if (target.closest('.skill-btn, .attack-btn, .menu-btn')) return;

        e.preventDefault();
        this.joystick.active = true;

        // Hide Popups if moving
        // TODO: Emit event instead of direct UI call
        // this.emit('interactionStart'); 

        const touch = e.touches ? e.touches[0] : e;
        const x = touch.clientX;
        const y = touch.clientY;

        this.container.style.display = 'flex';
        this.container.style.left = `${x - 75}px`;
        this.container.style.top = `${y - 75}px`;

        // Reset stick visually
        this.stick.style.left = '50%';
        this.stick.style.top = '50%';
        this.joystick.x = 0;
        this.joystick.y = 0;

        this.emit('joystickMove', { x: 0, y: 0, active: true });
    }

    _handleMove(e) {
        if (!this.joystick.active) return;
        e.preventDefault();

        const touch = e.touches ? e.touches[0] : e;
        const rect = this.base.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;

        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > this.maxRadius) {
            dx *= this.maxRadius / distance;
            dy *= this.maxRadius / distance;
        }

        this.stick.style.left = `calc(50% + ${dx}px)`;
        this.stick.style.top = `calc(50% + ${dy}px)`;

        this.joystick.x = dx / this.maxRadius;
        this.joystick.y = dy / this.maxRadius;

        // Emit normalized vector
        this.emit('joystickMove', { x: this.joystick.x, y: this.joystick.y, active: true });
    }

    _handleEnd() {
        if (!this.joystick.active) return;

        this.joystick.active = false;
        this.joystick.x = 0;
        this.joystick.y = 0;

        this.stick.style.left = '50%';
        this.stick.style.top = '50%';
        this.container.style.display = 'none';

        this.emit('joystickMove', { x: 0, y: 0, active: false });
    }

    cleanup() {
        // Remove listeners
        window.removeEventListener('touchmove', this._handleMove);
        window.removeEventListener('touchend', this._handleEnd);
        // ... (remove other listeners)
    }
}
