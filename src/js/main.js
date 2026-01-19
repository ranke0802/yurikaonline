import { InputHandler } from './modules/InputHandler.js';
import { Character } from './modules/Character.js';
import { Camera } from './modules/Camera.js';
import { Map } from './modules/Map.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.input = new InputHandler();
        this.map = new Map(this.ctx, 2000, 2000);
        this.camera = new Camera(this.width, this.height, 2000, 2000);
        this.character = new Character(this.ctx, 1000, 1000); // Start in middle

        this.setupUI();

        this.lastTime = 0;
        requestAnimationFrame((time) => this.loop(time));
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        if (this.camera) this.camera.resize(this.width, this.height);
    }

    setupUI() {
        this.input.onAction = (key) => {
            if (['j', 'h', 'u', 'i'].includes(key)) {
                this.character.attack(key);
            } else if (key === 'tab') {
                this.togglePopup('inventory-popup');
            } else if (key === 'enter') {
                this.togglePopup('status-popup');
            }
        };

        // Close buttons for popups
        document.querySelectorAll('.close-popup').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('popup-overlay').classList.add('hidden');
                document.querySelectorAll('.game-popup').forEach(p => p.classList.add('hidden'));
            });
        });
    }

    togglePopup(id) {
        const overlay = document.getElementById('popup-overlay');
        const popup = document.getElementById(id);

        if (!popup.classList.contains('hidden')) {
            overlay.classList.add('hidden');
            popup.classList.add('hidden');
        } else {
            overlay.classList.remove('hidden');
            document.querySelectorAll('.game-popup').forEach(p => p.classList.add('hidden'));
            popup.classList.remove('hidden');
        }
    }

    update() {
        const moveVector = this.input.getMovement();

        // Handle point-to-move (click location)
        let targetPos = null;
        if (this.input.touchMovePos) {
            // Convert screen coords to world coords
            targetPos = {
                x: this.input.touchMovePos.x + this.camera.x,
                y: this.input.touchMovePos.y + this.camera.y
            };
        }

        this.character.update(moveVector, targetPos);

        // Reset point-to-move if we started moving via keys/joystick
        if (moveVector.x !== 0 || moveVector.y !== 0) {
            this.input.touchMovePos = null;
        }

        this.camera.update(this.character.x, this.character.y);
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        this.map.draw(this.camera);
        this.character.draw(this.camera);
    }

    loop(time) {
        // const dt = time - this.lastTime;
        // this.lastTime = time;

        this.update();
        this.draw();

        requestAnimationFrame((t) => this.loop(t));
    }
}

// Start Game
window.onload = () => {
    window.game = new Game();
};
