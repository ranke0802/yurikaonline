import EventEmitter from '../EventEmitter.js';

export default class TouchHandler extends EventEmitter {
    constructor() {
        super();
        this.joystick = { x: 0, y: 0, active: false };
        this.joystickTouchId = null; // v0.35.1: Multi-touch support
        this.maxRadius = 50;
        this.activeAimAction = null;

        // DOM Elements
        this.base = document.getElementById('joystick-base');
        this.stick = document.getElementById('joystick-stick');
        this.container = document.getElementById('joystick-container');
        this.area = document.getElementById('joystick-area');

        // Bind methods
        this._handleStart = this._handleStart.bind(this);
        this._handleMove = this._handleMove.bind(this);
        this._handleEnd = this._handleEnd.bind(this);
        this._handleActionMove = this._handleActionMove.bind(this);
        this._handleActionEnd = this._handleActionEnd.bind(this);

        this.init();
    }

    _showJoystickAt(x, y) {
        if (!this.container) return;

        // Landscape HUD styles use !important, so the runtime position needs to
        // be applied with the same priority for the joystick to actually appear.
        this.container.style.setProperty('display', 'flex', 'important');
        this.container.style.setProperty('left', `${x - 75}px`, 'important');
        this.container.style.setProperty('top', `${y - 75}px`, 'important');
        this.container.style.setProperty('right', 'auto', 'important');
        this.container.style.setProperty('bottom', 'auto', 'important');
    }

    _hideJoystick() {
        if (!this.container) return;
        this.container.style.setProperty('display', 'none', 'important');
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
        window.addEventListener('touchcancel', this._handleEnd);
        window.addEventListener('mousemove', this._handleMove);
        window.addEventListener('mouseup', this._handleEnd);
        window.addEventListener('touchmove', this._handleActionMove, { passive: false });
        window.addEventListener('touchend', this._handleActionEnd);
        window.addEventListener('touchcancel', this._handleActionEnd);
        window.addEventListener('mousemove', this._handleActionMove);
        window.addEventListener('mouseup', this._handleActionEnd);

        // UI Buttons (Skill/Attack) binding
        this._bindUiButtons();
    }

    _getPointerFromEvent(e, pointerId = null) {
        if (e.touches || e.changedTouches) {
            const list = e.touches?.length ? e.touches : e.changedTouches;
            for (let i = 0; i < list.length; i++) {
                if (pointerId === null || list[i].identifier === pointerId) {
                    return list[i];
                }
            }
            return null;
        }

        return e;
    }

    _startAimActionTracking(e, action) {
        if (action !== 'SKILL_2') return;
        const pointer = this._getPointerFromEvent(e);
        if (!pointer) return;

        this.activeAimAction = {
            action,
            pointerId: pointer.identifier ?? 'mouse'
        };
    }

    _clearAimActionTracking() {
        this.activeAimAction = null;
    }

    _handleActionMove(e) {
        if (!this.activeAimAction) return;

        const pointer = this._getPointerFromEvent(e, this.activeAimAction.pointerId);
        if (!pointer) return;

        if (e.cancelable) e.preventDefault();
        this.emit('aimMove', {
            action: this.activeAimAction.action,
            clientX: pointer.clientX,
            clientY: pointer.clientY
        });
    }

    _handleActionEnd(e) {
        if (!this.activeAimAction) return;

        const pointer = this._getPointerFromEvent(e, this.activeAimAction.pointerId);
        if (!pointer) return;

        const action = this.activeAimAction.action;
        this._clearAimActionTracking();
        this.emit('actionUp', action);
    }

    _bindUiButtons() {
        const keyMap = {
            'j': 'ATTACK',
            'h': 'SKILL_1',
            'u': 'SKILL_2',
            'k': 'SKILL_3'
        };

        const uiButtons = document.querySelectorAll('.skill-btn, .attack-btn, .inventory-trigger, .status-trigger, .menu-btn');
        uiButtons.forEach(btn => {
            const rawKey = btn.getAttribute('data-key');
            if (!rawKey) return;

            const action = keyMap[rawKey] || rawKey;

            const startAction = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._startAimActionTracking(e, action);
                this.emit('actionDown', action);
            };

            const endAction = (e) => {
                if (action === 'SKILL_2') {
                    this._clearAimActionTracking();
                }
                this.emit('actionUp', action);
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

        const touch = e.touches ? e.changedTouches[0] : e;
        this.joystickTouchId = touch.identifier; // Save ID

        const x = touch.clientX;
        const y = touch.clientY;

        this._showJoystickAt(x, y);

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

        // v0.35.1: Multi-touch ID check
        let touch = null;
        if (e.touches) {
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === this.joystickTouchId) {
                    touch = e.touches[i];
                    break;
                }
            }
        } else {
            touch = e; // Mouse fallback
        }

        if (!touch) return; // Touch ID not found (another finger moved)

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

    _handleEnd(e) {
        if (!this.joystick.active) return;

        // v0.35.1: Multi-touch End check
        if (e.changedTouches) {
            let found = false;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.joystickTouchId) {
                    found = true;
                    break;
                }
            }
            if (!found) return; // Another finger ended, keep joystick active
        }

        this.joystick.active = false;
        this.joystick.x = 0;
        this.joystick.y = 0;
        this.joystickTouchId = null;

        this.stick.style.left = '50%';
        this.stick.style.top = '50%';
        this._hideJoystick();

        this.emit('joystickMove', { x: 0, y: 0, active: false });
    }

    cleanup() {
        // Remove listeners
        window.removeEventListener('touchmove', this._handleMove);
        window.removeEventListener('touchend', this._handleEnd);
        window.removeEventListener('touchcancel', this._handleEnd);
        window.removeEventListener('mousemove', this._handleMove);
        window.removeEventListener('mouseup', this._handleEnd);
        window.removeEventListener('touchmove', this._handleActionMove);
        window.removeEventListener('touchend', this._handleActionEnd);
        window.removeEventListener('touchcancel', this._handleActionEnd);
        window.removeEventListener('mousemove', this._handleActionMove);
        window.removeEventListener('mouseup', this._handleActionEnd);
        // ... (remove other listeners)
    }
}
