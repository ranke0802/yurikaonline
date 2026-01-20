import { InputHandler } from './modules/InputHandler.js';
import { Camera } from './modules/Camera.js';
import { Map } from './modules/Map.js';
import Player from './entities/Player.js';
import { UIManager } from './ui/UIManager.js';

class Game {
    constructor() {
        this.viewport = document.getElementById('game-viewport');
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.lastTime = 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.input = new InputHandler();
        this.ui = new UIManager(this);
        this.map = new Map(this.ctx, 2000, 2000);
        this.camera = new Camera(this.width, this.height, 2000, 2000);

        // Bind input actions
        this.input.onAction = (action) => {
            switch (action) {
                case 'shift-b':
                    this.ui.togglePopup('inventory-popup');
                    break;
                case 'shift-i':
                    this.ui.togglePopup('status-popup');
                    break;
                case 'j': // Attack
                case 'h': // Skill 1
                case 'u': // Skill 2
                case 'i': // Skill 3
                    this.localPlayer.triggerAction('ATTACK!');
                    this.ui.logSystemMessage('공격했습니다!');
                    break;
            }
        };

        this.localPlayer = new Player(1000, 1000);
        this.portraitInitialized = false;

        this.init();
    }

    init() {
        requestAnimationFrame((time) => this.loop(time));
    }

    resize() {
        this.width = this.viewport.clientWidth;
        this.height = this.viewport.clientHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        if (this.camera) this.camera.resize(this.width, this.height);
    }

    update(dt) {
        this.localPlayer.update(dt, this.input);
        this.camera.update(this.localPlayer.x, this.localPlayer.y);

        // Initial portrait set
        if (this.localPlayer.ready && !this.portraitInitialized) {
            this.ui.setPortrait(this.localPlayer.sprite.image);
            this.portraitInitialized = true;
        }

        // Mock HP/MP
        this.ui.updateStats(80, 60);
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.map.draw(this.camera);
        this.localPlayer.draw(this.ctx, this.camera);
    }

    loop(time) {
        if (!this.lastTime) this.lastTime = time;
        const dt = (time - this.lastTime) / 1000;
        this.lastTime = time;

        this.update(dt);
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    }
}

window.onload = () => {
    window.game = new Game();
};
