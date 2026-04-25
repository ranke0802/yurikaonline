import Scene from '../../core/Scene.js';
import Logger from '../../utils/Logger.js';

export default class OpeningPrologueScene extends Scene {
    constructor(game) {
        super(game);
        this.completed = false;
        this.time = 0;
    }

    async enter() {
        Logger.info('[OpeningPrologueScene] Entered');
        this.completed = false;
        this.time = 0;
        this.game.ui?.hideHUD();
        this.game.ui?.hideAllPopups();
        this.game.ui?.hideDialog?.();

        this.game.story?.startStory?.('prologue', 'start', {
            origin: 'opening',
            restoreHud: false,
            onComplete: () => this.finish()
        });
    }

    async exit() {
        this.game.ui?.hideDialog?.();
    }

    finish() {
        if (this.completed) return;
        this.completed = true;
        this.game.markOpeningPrologueCompleted?.();
        this.game.enterPostOpeningScene?.();
    }

    update(dt) {
        this.time += dt;
    }

    render(ctx) {
        const w = this.game.canvas.width;
        const h = this.game.canvas.height;
        const pulse = 0.5 + Math.sin(this.time * 1.2) * 0.5;

        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#08121a');
        sky.addColorStop(0.54, '#03080b');
        sky.addColorStop(1, '#000000');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.globalAlpha = 0.12 + pulse * 0.08;
        const glow = ctx.createRadialGradient(w * 0.5, h * 0.58, 0, w * 0.5, h * 0.58, Math.min(w, h) * 0.42);
        glow.addColorStop(0, '#7df7e6');
        glow.addColorStop(0.28, 'rgba(64, 210, 196, 0.2)');
        glow.addColorStop(1, 'rgba(64, 210, 196, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        this.game.story?.renderFade?.(ctx, w, h);
    }
}
