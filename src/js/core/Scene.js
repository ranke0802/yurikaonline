export default class Scene {
    constructor(game) {
        this.game = game;
    }

    async enter() {
        // Initialization logic when entering the scene
    }

    async exit() {
        // Cleanup logic when leaving the scene
    }

    update(dt) {
        // Update logic (dt = delta time in seconds)
    }

    render(ctx) {
        // Rendering logic
    }

    onPointerDown(e) { }
    onPointerMove(e) { }
    onPointerUp(e) { }
    onKeyDown(key) { }
}
