import Logger from '../utils/Logger.js';

export default class GameLoop {
    constructor(updateFn, renderFn) {
        this.updateFn = updateFn;
        this.renderFn = renderFn;

        this.lastTime = 0;
        this.accumulator = 0;
        this.deltaTime = 1 / 60; // Fixed time step (60 FPS)

        this.running = false;
        this.paused = false;
        this.rafId = null;

        this._loop = this._loop.bind(this);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this.rafId = requestAnimationFrame(this._loop);
        Logger.log('GameLoop started');
    }

    stop() {
        this.running = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        Logger.log('GameLoop stopped');
    }

    pause() {
        this.paused = true;
        Logger.log('GameLoop paused');
    }

    resume() {
        this.paused = false;
        this.lastTime = performance.now(); // Reset time to prevent huge delta
        Logger.log('GameLoop resumed');
    }

    _loop(currentTime) {
        if (!this.running) return;

        this.rafId = requestAnimationFrame(this._loop);

        if (this.paused) return;

        const frameTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Prevent spiral of death if lag allows frameTime to be too large
        // Cap it at 0.25 seconds
        const safeFrameTime = Math.min(frameTime, 0.25);

        this.accumulator += safeFrameTime;

        // Update Phase (Fixed Time Step)
        while (this.accumulator >= this.deltaTime) {
            this.updateFn(this.deltaTime);
            this.accumulator -= this.deltaTime;
        }

        // Render Phase (Interpolation alpha could be passed here)
        // alpha = this.accumulator / this.deltaTime
        this.renderFn();
    }
}
