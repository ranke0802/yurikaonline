import Logger from '../utils/Logger.js';

export default class SceneManager {
    constructor(game) {
        this.game = game;
        this.currentScene = null;
        this.scenes = new Map();
    }

    addScene(name, sceneInstance) {
        this.scenes.set(name, sceneInstance);
    }

    async changeScene(name, params = null) {
        const nextScene = this.scenes.get(name);
        if (!nextScene) {
            Logger.error(`[SceneManager] Scene not found: ${name}`);
            return;
        }

        Logger.info(`[SceneManager] Changing scene to: ${name}`);

        if (this.currentScene) {
            await this.currentScene.exit();
        }

        this.currentScene = nextScene;
        await this.currentScene.enter(params);
    }

    update(dt) {
        if (this.currentScene) {
            this.currentScene.update(dt);
        }
    }

    render(ctx) {
        if (!this.currentScene) return;

        // v0.00.02: Reset transform and clear canvas for the new scene frame
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.game.canvas.width, this.game.canvas.height);

        this.currentScene.render(ctx);
    }

    // Proxy input events to current scene
    handlePointerDown(e) {
        if (this.currentScene) this.currentScene.onPointerDown(e);
    }

    handleKeyDown(key) {
        if (this.currentScene) this.currentScene.onKeyDown(key);
    }
}
