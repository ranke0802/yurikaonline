import Logger from '../utils/Logger.js';

export default class GameLoop {
    constructor(updateFn, renderFn) {
        this.updateFn = updateFn;
        this.renderFn = renderFn;

        this.lastTime = 0;
        this.accumulator = 0;
        this.updateFps = 60;
        this.deltaTime = 1 / this.updateFps;

        this.running = false;
        this.paused = false;
        this.rafId = null;
        this.maxRenderFps = 0;
        this.minRenderIntervalMs = 0;
        this.lastRenderTime = 0;
        this.maxUpdateStepsPerFrame = 5;

        // v2.2: Hitstop
        this.hitstopTimer = 0;

        this._loop = this._loop.bind(this);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this.lastRenderTime = this.lastTime;
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
        this.lastRenderTime = this.lastTime;
        Logger.log('GameLoop resumed');
    }

    setMaxRenderFps(fps = 0) {
        const nextFps = Number.isFinite(fps) ? Math.max(0, fps) : 0;
        this.maxRenderFps = nextFps;
        this.minRenderIntervalMs = nextFps > 0 ? (1000 / nextFps) : 0;
        this.lastRenderTime = performance.now();
    }

    setUpdateFps(fps = 60) {
        const nextFps = Number.isFinite(fps) ? Math.max(15, fps) : 60;
        this.updateFps = nextFps;
        this.deltaTime = 1 / nextFps;
        this.accumulator = Math.min(this.accumulator, this.deltaTime * this.maxUpdateStepsPerFrame);
    }

    /**
     * v2.2: Trigger hitstop (freeze updates for visual impact)
     * @param {number} durationMs - Duration in milliseconds (e.g., 50~120ms)
     */
    hitstop(durationMs = 80) {
        this.hitstopTimer = Math.max(this.hitstopTimer, durationMs);
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
        let totalUpdateMs = 0;
        let renderMs = 0;
        let backlogDrops = 0;
        let updateSteps = 0;

        // v2.2: Hitstop — skip updates but still render
        if (this.hitstopTimer > 0) {
            this.hitstopTimer -= safeFrameTime * 1000;
            const renderStart = performance.now();
            this.renderFn();
            renderMs = performance.now() - renderStart;
            window.game?.recordLoopTelemetry?.({
                updateMs: 0,
                renderMs,
                frameGapMs: safeFrameTime * 1000,
                updateSteps: 0,
                backlogDrops: 0
            });
            return;
        }

        this.accumulator += safeFrameTime;

        // Update Phase (Fixed Time Step)
        while (this.accumulator >= this.deltaTime && updateSteps < this.maxUpdateStepsPerFrame) {
            const updateStart = performance.now();
            this.updateFn(this.deltaTime);
            totalUpdateMs += performance.now() - updateStart;
            this.accumulator -= this.deltaTime;
            updateSteps++;
        }

        // Drop excessive backlog instead of burning CPU to catch up after a hitch.
        if (updateSteps >= this.maxUpdateStepsPerFrame && this.accumulator >= this.deltaTime) {
            this.accumulator = 0;
            backlogDrops = 1;
        }

        // Render Phase (Interpolation alpha could be passed here)
        // alpha = this.accumulator / this.deltaTime
        if (!this.minRenderIntervalMs || (currentTime - this.lastRenderTime) >= this.minRenderIntervalMs) {
            this.lastRenderTime = currentTime;
            const renderStart = performance.now();
            this.renderFn();
            renderMs = performance.now() - renderStart;
        }

        window.game?.recordLoopTelemetry?.({
            updateMs: totalUpdateMs,
            renderMs,
            frameGapMs: safeFrameTime * 1000,
            updateSteps,
            backlogDrops
        });
    }
}
