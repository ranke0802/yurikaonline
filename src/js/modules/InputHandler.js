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
            const key = e.key.toLowerCase();
            this.keys[key] = true;

            // Handle actions immediately or pass to callback
            if (['j', 'h', 'u', 'i', 'tab', 'enter'].includes(key)) {
                if (this.onAction) this.onAction(key);
            }

            // Prevent scrolling with arrows
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = false;
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
            pointer.style.left = `${x}px`;
            pointer.style.top = `${y}px`;
            pointer.classList.remove('hidden');
            pointer.style.animation = 'none';
            pointer.offsetHeight; // trigger reflow
            pointer.style.animation = null;

            setTimeout(() => {
                // pointer.classList.add('hidden');
            }, 500);
        };

        canvas.addEventListener('mousedown', handleClick);
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1 && !this.joystick.active) {
                handleClick(e);
            }
        });

        // UI Action buttons
        document.querySelectorAll('.skill-btn, .attack-btn, .inventory-trigger, .status-trigger').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const key = btn.getAttribute('data-key');
                if (key && this.onAction) this.onAction(key);
            });
        });
    }

    getMovement() {
        let moveX = 0;
        let moveY = 0;

        // Keyboard
        if (this.keys['w'] || this.keys['arrowup']) moveY -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) moveY += 1;
        if (this.keys['a'] || this.keys['arrowleft']) moveX -= 1;
        if (this.keys['d'] || this.keys['arrowright']) moveX += 1;

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
