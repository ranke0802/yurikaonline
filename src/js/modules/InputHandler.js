export class InputHandler {
    constructor() {
        this.keys = {};
        this.joystick = { x: 0, y: 0, active: false };
        this.touchMovePos = null; // For point-to-move
        this.onAction = null; // Callback for actions like attack/skill

        this.initKeyboard();
        this.initJoystick();
        this.initMouseTouch();
    }

    initKeyboard() {
        window.addEventListener('keydown', (e) => {
            // Use e.code for physical key locations (Layout independent)
            // This solves issues with Korean/English input modes and CapsLock
            const code = e.code;

            // Movement keys mapping
            if (code === 'KeyW' || code === 'ArrowUp') this.keys['w'] = true;
            if (code === 'KeyS' || code === 'ArrowDown') this.keys['s'] = true;
            if (code === 'KeyA' || code === 'ArrowLeft') this.keys['a'] = true;
            if (code === 'KeyD' || code === 'ArrowRight') this.keys['d'] = true;

            // Tab prevention
            if (code === 'Tab') {
                e.preventDefault();
            }

            // Handle Shift + B (Inventory) - using physical B key
            if (e.shiftKey && code === 'KeyB') {
                if (this.onAction) this.onAction('shift-b');
                return;
            }

            // Handle Shift + I (Status) - using physical I key
            if (e.shiftKey && code === 'KeyI') {
                if (this.onAction) this.onAction('shift-i');
                return;
            }

            // Handle Shift + S (Skills) - using physical S key
            if (e.shiftKey && code === 'KeyS') {
                if (this.onAction) this.onAction('shift-s');
                return;
            }

            // Handle actions (Skills/Attack) - J, H, U, K
            if (['KeyJ', 'KeyH', 'KeyU', 'KeyK'].includes(code)) {
                const actionMap = { 'KeyJ': 'j', 'KeyH': 'h', 'KeyU': 'u', 'KeyK': 'k' };
                const action = actionMap[code];
                this.keys[action] = true;
                if (this.onAction) this.onAction(action);
            }

            // Automatically close popups and cancel click-to-move if any movement key is pressed
            if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
                if (window.game?.ui) window.game.ui.hideAllPopups();
                this.touchMovePos = null;
            }

            // Prevent scrolling for navigation keys (unless typing)
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(code)) {
                // v0.00.14: Use e.target for more reliable input detection
                const target = e.target;
                const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
                if (!isInput) {
                    e.preventDefault();
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            const code = e.code;

            if (code === 'KeyW' || code === 'ArrowUp') this.keys['w'] = false;
            if (code === 'KeyS' || code === 'ArrowDown') this.keys['s'] = false;
            if (code === 'KeyA' || code === 'ArrowLeft') this.keys['a'] = false;
            if (code === 'KeyD' || code === 'ArrowRight') this.keys['d'] = false;

            if (['KeyJ', 'KeyH', 'KeyU', 'KeyK'].includes(code)) {
                const actionMap = { 'KeyJ': 'j', 'KeyH': 'h', 'KeyU': 'u', 'KeyK': 'k' };
                this.keys[actionMap[code]] = false;
            }
        });
    }

    initJoystick() {
        const base = document.getElementById('joystick-base');
        const stick = document.getElementById('joystick-stick');
        const joystickContainer = document.getElementById('joystick-container');
        const joystickArea = document.getElementById('joystick-area');

        if (!base || !stick || !joystickContainer) return;

        const maxRadius = 50;

        const handleStart = (e) => {
            // Check if touch is on or near a skill button or action button
            const target = e.target;
            const isButton = target.closest('.skill-btn, .attack-btn, .menu-btn');

            // Also check if touch point is near any button (within 20px)
            if (!isButton) {
                const touch = e.touches ? e.touches[0] : e;
                const x = touch.clientX;
                const y = touch.clientY;

                const buttons = document.querySelectorAll('.skill-btn, .attack-btn');
                for (const btn of buttons) {
                    const rect = btn.getBoundingClientRect();
                    const padding = 20; // 20px padding around button
                    if (x >= rect.left - padding && x <= rect.right + padding &&
                        y >= rect.top - padding && y <= rect.bottom + padding) {
                        // Touch is near a button, don't activate joystick
                        return;
                    }
                }
            } else {
                // Direct button touch
                return;
            }

            e.preventDefault();
            this.joystick.active = true;
            if (window.game?.ui) window.game.ui.hideAllPopups();

            // Set dynamic position for mobile
            const touch = e.touches ? e.touches[0] : e;
            const x = touch.clientX;
            const y = touch.clientY;

            joystickContainer.style.display = 'flex';
            joystickContainer.style.left = `${x - 75}px`;
            joystickContainer.style.top = `${y - 75}px`;
        };

        const handleMove = (e) => {
            if (!this.joystick.active) return;
            e.preventDefault();

            const touch = e.touches ? e.touches[0] : e;
            const rect = base.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            let dx = touch.clientX - centerX;
            let dy = touch.clientY - centerY;

            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > maxRadius) {
                dx *= maxRadius / distance;
                dy *= maxRadius / distance;
            }

            stick.style.left = `calc(50% + ${dx}px)`;
            stick.style.top = `calc(50% + ${dy}px)`;

            this.joystick.x = dx / maxRadius;
            this.joystick.y = dy / maxRadius;
        };

        const handleEnd = () => {
            this.joystick.active = false;
            this.joystick.x = 0;
            this.joystick.y = 0;
            stick.style.left = '50%';
            stick.style.top = '50%';
            joystickContainer.style.display = 'none';
        };

        if (joystickArea) {
            joystickArea.addEventListener('touchstart', handleStart);
            joystickArea.addEventListener('mousedown', handleStart);
        } else {
            joystickContainer.addEventListener('touchstart', handleStart);
            joystickContainer.addEventListener('mousedown', handleStart);
        }

        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('touchend', handleEnd);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleEnd);
    }

    initMouseTouch() {
        const canvas = document.getElementById('gameCanvas');
        const pointer = document.getElementById('touch-pointer');

        // Prevent Right-Click Menu
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        const handleClick = (e) => {
            // Only handle if clicking the canvas (not UI)
            if (e.target.tagName !== 'CANVAS') return;

            // Mobile: Prevent all click-to-move. Mobile users should use joystick only.
            const isMobile = window.innerWidth <= 900;
            if (isMobile) return;

            // PC: Only left click (button 0) allowed
            if (e.type === 'mousedown' && e.button !== 0) return;

            const x = e.clientX || (e.touches ? e.touches[0].clientX : 0);
            const y = e.clientY || (e.touches ? e.touches[0].clientY : 0);

            this.touchMovePos = { x, y };
        };

        canvas.addEventListener('mousedown', handleClick);
        canvas.addEventListener('touchstart', (e) => {
            const isMobile = window.innerWidth <= 900;
            if (isMobile) {
                // Stop synthetic mousedown on mobile
                if (e.target === canvas) {
                    // But don't prevent default if it's UI (already handled by event bubbling/propagation, but let's be safe)
                }
            }

            if (e.touches.length === 1 && !this.joystick.active) {
                handleClick(e);
            }
        }, { passive: false });

        // UI Action buttons (Add touchstart for mobile responsiveness)
        const uiButtons = document.querySelectorAll('.skill-btn, .attack-btn, .inventory-trigger, .status-trigger, .menu-btn');

        const handleUiAction = (e, btn) => {
            e.preventDefault();
            e.stopPropagation();
            const key = btn.getAttribute('data-key');
            if (key && this.onAction) this.onAction(key);
        };

        uiButtons.forEach(btn => {
            const key = btn.getAttribute('data-key');
            if (!key) return;

            const startAction = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.keys[key] = true;
                if (this.onAction) this.onAction(key);
            };

            const endAction = (e) => {
                this.keys[key] = false;
            };

            btn.addEventListener('mousedown', startAction);
            btn.addEventListener('touchstart', startAction, { passive: false });
            window.addEventListener('mouseup', endAction);
            window.addEventListener('touchend', endAction);
        });
    }

    getMovement() {
        let moveX = 0;
        let moveY = 0;

        // Keyboard
        if (this.keys['w']) moveY -= 1;
        if (this.keys['s']) moveY += 1;
        if (this.keys['a']) moveX -= 1;
        if (this.keys['d']) moveX += 1;

        // Normalized keyboard movement
        if (moveX !== 0 || moveY !== 0) {
            const mag = Math.sqrt(moveX * moveX + moveY * moveY);
            moveX /= mag;
            moveY /= mag;
        }

        // Joystick (overrides keyboard if active)
        if (this.joystick.active) {
            moveX = this.joystick.x;
            moveY = this.joystick.y;
        }

        return { x: moveX, y: moveY };
    }
}
