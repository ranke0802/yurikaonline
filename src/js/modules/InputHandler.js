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
                // If it's a key that could have a shift modifier, handle it carefully
                // (Currently KeyI is used for Shift+I, but K is independent)

                // Pass the code directly or a simplified action name
                // Let's pass the simple letter to keep main.js clean
                const actionMap = {
                    'KeyJ': 'j',
                    'KeyH': 'h',
                    'KeyU': 'u',
                    'KeyK': 'k'
                };
                if (this.onAction) this.onAction(actionMap[code]);
            }

            // Prevent scrolling for navigation keys
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(code)) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            const code = e.code;

            if (code === 'KeyW' || code === 'ArrowUp') this.keys['w'] = false;
            if (code === 'KeyS' || code === 'ArrowDown') this.keys['s'] = false;
            if (code === 'KeyA' || code === 'ArrowLeft') this.keys['a'] = false;
            if (code === 'KeyD' || code === 'ArrowRight') this.keys['d'] = false;
        });
    }

    initJoystick() {
        const base = document.getElementById('joystick-base');
        const stick = document.getElementById('joystick-stick');
        const joystickContainer = document.getElementById('joystick-container');

        if (!base || !stick) return;

        const maxRadius = 50;

        const handleStart = (e) => {
            e.preventDefault();
            this.joystick.active = true;
        };

        const handleMove = (e) => {
            if (!this.joystick.active) return;
            e.preventDefault();

            let touch;
            if (e.touches) {
                // Find the touch that is inside or near the joystick
                const rect = joystickContainer.getBoundingClientRect();
                touch = Array.from(e.touches).find(t => {
                    const dx = t.clientX - (rect.left + rect.width / 2);
                    const dy = t.clientY - (rect.top + rect.height / 2);
                    return Math.sqrt(dx * dx + dy * dy) < 150;
                }) || e.touches[0];
            } else {
                touch = e;
            }

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
        };

        joystickContainer.addEventListener('touchstart', handleStart);
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('touchend', handleEnd);

        joystickContainer.addEventListener('mousedown', handleStart);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleEnd);
    }

    initMouseTouch() {
        const canvas = document.getElementById('gameCanvas');
        const pointer = document.getElementById('touch-pointer');

        const handleClick = (e) => {
            // Only handle if clicking the canvas (not UI)
            if (e.target.tagName !== 'CANVAS') return;

            const x = e.clientX || (e.touches ? e.touches[0].clientX : 0);
            const y = e.clientY || (e.touches ? e.touches[0].clientY : 0);

            this.touchMovePos = { x, y };

            // Visual feedback
            if (pointer) {
                pointer.style.left = `${x}px`;
                pointer.style.top = `${y}px`;
                pointer.classList.remove('hidden');
                pointer.style.animation = 'none';
                pointer.offsetHeight; // trigger reflow
                pointer.style.animation = null;
            }
        };

        canvas.addEventListener('mousedown', handleClick);
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1 && !this.joystick.active) {
                handleClick(e);
            }
        });

        // UI Action buttons (Add touchstart for mobile responsiveness)
        const uiButtons = document.querySelectorAll('.skill-btn, .attack-btn, .inventory-trigger, .status-trigger, .fullscreen-toggle, .menu-btn');

        const handleUiAction = (e, btn) => {
            e.preventDefault();
            e.stopPropagation();
            const key = btn.getAttribute('data-key');
            if (key && this.onAction) this.onAction(key);
        };

        uiButtons.forEach(btn => {
            btn.addEventListener('click', (e) => handleUiAction(e, btn));
            btn.addEventListener('touchstart', (e) => handleUiAction(e, btn), { passive: false });
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
