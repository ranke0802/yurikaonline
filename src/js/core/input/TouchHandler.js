import EventEmitter from '../EventEmitter.js';

export default class TouchHandler extends EventEmitter {
    constructor() {
        super();
        this.joystick = { x: 0, y: 0, active: false };
        this.joystickTouchId = null; // v0.35.1: Multi-touch support
        this.maxRadius = 50;
        this.activeAimAction = null;
        this.activeUiActions = new Map();
        this.useMouseJoystick = window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0;
        this.fixedJoystickLayout = null;

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

    isUiLayoutEditModeActive() {
        return !!window.game?.ui?.isUiLayoutEditMode?.();
    }

    setFixedJoystickLayout(layout = null) {
        this.fixedJoystickLayout = layout;
        if (this.base) {
            const rect = this.base.getBoundingClientRect();
            this.maxRadius = Math.max(28, Math.round((Math.min(rect.width || 100, rect.height || 100) || 100) * 0.45));
        }

        if (this.area) {
            this.area.style.pointerEvents = this.fixedJoystickLayout ? 'none' : 'auto';
        }
        if (this.container) {
            this.container.style.pointerEvents = 'auto';
        }

        if (this.fixedJoystickLayout) {
            if (this.container) {
                this.container.style.setProperty('display', 'flex', 'important');
            }
        } else if (!this.isUiLayoutEditModeActive()) {
            this._hideJoystick();
        }
    }

    isJoystickBlockedByUiTarget(target) {
        return !!target?.closest?.('.quest-list-panel, .chat-window');
    }

    isJoystickBlockedByUiPosition(x, y) {
        const blockingPanels = document.querySelectorAll('.quest-list-panel, .chat-window');
        return Array.from(blockingPanels).some((panel) => {
            if (!(panel instanceof HTMLElement)) return false;

            const style = window.getComputedStyle(panel);
            if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
                return false;
            }

            const rect = panel.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return false;

            return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        });
    }

    _showJoystickAt(x, y) {
        if (!this.container) return;

        // Landscape HUD styles use !important, so the runtime position needs to
        // be applied with the same priority for the joystick to actually appear.
        this.container.style.setProperty('display', 'flex', 'important');
        if (this.fixedJoystickLayout) return;
        const width = this.container.offsetWidth || this.base?.offsetWidth || 100;
        const height = this.container.offsetHeight || this.base?.offsetHeight || 100;
        this.container.style.setProperty('left', `${Math.round(x - (width / 2))}px`, 'important');
        this.container.style.setProperty('top', `${Math.round(y - (height / 2))}px`, 'important');
        this.container.style.setProperty('right', 'auto', 'important');
        this.container.style.setProperty('bottom', 'auto', 'important');
    }

    _hideJoystick() {
        if (!this.container) return;
        if (this.fixedJoystickLayout || this.isUiLayoutEditModeActive()) {
            this.container.style.setProperty('display', 'flex', 'important');
            return;
        }
        this.container.style.setProperty('display', 'none', 'important');
    }

    init() {
        if (!this.base || !this.stick || !this.container) return;

        // Joystick Area Event Listeners
        if (this.area) {
            this.area.addEventListener('touchstart', this._handleStart, { passive: false });
            if (this.useMouseJoystick) {
                this.area.addEventListener('mousedown', this._handleStart);
            }
        }
        this.container.addEventListener('touchstart', this._handleStart, { passive: false });
        if (this.useMouseJoystick) {
            this.container.addEventListener('mousedown', this._handleStart);
        }

        // Global Move/End Listeners
        window.addEventListener('touchmove', this._handleMove, { passive: false });
        window.addEventListener('touchend', this._handleEnd);
        window.addEventListener('touchcancel', this._handleEnd);
        if (this.useMouseJoystick) {
            window.addEventListener('mousemove', this._handleMove);
            window.addEventListener('mouseup', this._handleEnd);
        }
        window.addEventListener('touchmove', this._handleActionMove, { passive: false });
        window.addEventListener('touchend', this._handleActionEnd);
        window.addEventListener('touchcancel', this._handleActionEnd);
        window.addEventListener('mousemove', this._handleActionMove);
        window.addEventListener('mouseup', this._handleActionEnd);

        // UI Buttons (Skill/Attack) binding
        this._bindUiButtons();
    }

    _getPointerFromEvent(e, pointerId = null, preferChangedTouches = false) {
        if (e.touches || e.changedTouches) {
            const candidateLists = [];
            if (preferChangedTouches && e.changedTouches?.length) candidateLists.push(e.changedTouches);
            if (e.touches?.length) candidateLists.push(e.touches);
            if (!preferChangedTouches && e.changedTouches?.length) candidateLists.push(e.changedTouches);

            for (const list of candidateLists) {
                for (let i = 0; i < list.length; i++) {
                    if (pointerId === null || list[i].identifier === pointerId) {
                        return list[i];
                    }
                }
            }
            return null;
        }

        return e;
    }

    _startAimActionTracking(e, action) {
        if (action !== 'SKILL_2') return;
        const pointer = this._getPointerFromEvent(e, null, true);
        if (!pointer) return;

        this.activeAimAction = {
            action,
            pointerId: pointer.identifier ?? 'mouse'
        };
    }

    _clearAimActionTracking() {
        this.activeAimAction = null;
    }

    _releaseTrackedAction(pointerId = 'mouse') {
        if (!this.activeUiActions.has(pointerId)) return;
        const action = this.activeUiActions.get(pointerId);
        this.activeUiActions.delete(pointerId);
        this.emit('actionUp', action);
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
        if (e.changedTouches?.length) {
            for (let i = 0; i < e.changedTouches.length; i++) {
                this._releaseTrackedAction(e.changedTouches[i].identifier);
            }
        } else {
            this._releaseTrackedAction('mouse');
        }

        if (this.activeAimAction) {
            const pointer = this._getPointerFromEvent(e, this.activeAimAction.pointerId, true);
            if (!pointer) return;

            const action = this.activeAimAction.action;
            this._clearAimActionTracking();
            this.emit('aimEnd', {
                action,
                clientX: pointer.clientX,
                clientY: pointer.clientY
            });
        }
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
                if (this.isUiLayoutEditModeActive()) return;
                e.preventDefault();
                e.stopPropagation();
                const pointer = this._getPointerFromEvent(e, null, true);
                if (!pointer) return;
                const pointerId = pointer?.identifier ?? 'mouse';

                if (action === 'SKILL_2') {
                    this._startAimActionTracking(e, action);
                    this.emit('aimStart', {
                        action,
                        clientX: pointer?.clientX ?? 0,
                        clientY: pointer?.clientY ?? 0
                    });
                    return;
                }

                this.activeUiActions.set(pointerId, action);
                this.emit('actionDown', action);
            };

            const endAction = (e) => {
                if (e.changedTouches?.length) {
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        this._releaseTrackedAction(e.changedTouches[i].identifier);
                    }
                } else {
                    this._releaseTrackedAction('mouse');
                }
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
        const touch = e.changedTouches?.[0] || e.touches?.[0] || e;
        const x = touch.clientX;
        const y = touch.clientY;

        if (target?.closest?.('.skill-btn, .attack-btn, .menu-btn')) return;
        if (this.isJoystickBlockedByUiTarget(target) || this.isJoystickBlockedByUiPosition(x, y)) return;
        if (this.isUiLayoutEditModeActive()) return;

        e.preventDefault();
        this.joystick.active = true;

        // Hide Popups if moving
        // TODO: Emit event instead of direct UI call
        // this.emit('interactionStart'); 

        this.joystickTouchId = touch.identifier; // Save ID

        if (this.fixedJoystickLayout && this.container) {
            const rect = this.container.getBoundingClientRect();
            const activationPadding = Math.max(36, rect.width * 0.25);
            const isInsideAnchor = x >= (rect.left - activationPadding)
                && x <= (rect.right + activationPadding)
                && y >= (rect.top - activationPadding)
                && y <= (rect.bottom + activationPadding);
            if (!isInsideAnchor) {
                this.joystick.active = false;
                this.joystickTouchId = null;
                return;
            }
        }

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
        const dynamicRadius = Math.max(28, Math.round((Math.min(rect.width || 100, rect.height || 100) || 100) * 0.45));
        this.maxRadius = dynamicRadius;

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

    resetState() {
        if (this.joystick.active) {
            this.joystick.active = false;
            this.joystick.x = 0;
            this.joystick.y = 0;
            this.joystickTouchId = null;
            if (this.stick) {
                this.stick.style.left = '50%';
                this.stick.style.top = '50%';
            }
            this._hideJoystick();
            this.emit('joystickMove', { x: 0, y: 0, active: false });
        }

        Array.from(this.activeUiActions.keys()).forEach((pointerId) => {
            this._releaseTrackedAction(pointerId);
        });

        if (this.activeAimAction) {
            this._clearAimActionTracking();
            this.emit('aimCancel', { action: 'SKILL_2' });
        }
    }

    hasActiveMouseInteraction() {
        return this.activeUiActions.has('mouse')
            || this.activeAimAction?.pointerId === 'mouse'
            || (this.joystick.active && this.joystickTouchId === null);
    }

    cleanup() {
        // Remove listeners
        window.removeEventListener('touchmove', this._handleMove);
        window.removeEventListener('touchend', this._handleEnd);
        window.removeEventListener('touchcancel', this._handleEnd);
        if (this.useMouseJoystick) {
            window.removeEventListener('mousemove', this._handleMove);
            window.removeEventListener('mouseup', this._handleEnd);
        }
        window.removeEventListener('touchmove', this._handleActionMove);
        window.removeEventListener('touchend', this._handleActionEnd);
        window.removeEventListener('touchcancel', this._handleActionEnd);
        window.removeEventListener('mousemove', this._handleActionMove);
        window.removeEventListener('mouseup', this._handleActionEnd);
        // ... (remove other listeners)
    }
}
