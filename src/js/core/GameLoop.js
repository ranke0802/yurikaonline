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
        this.backgroundTickIntervalMs = 250;
        this.backgroundTimerId = null;

        // v2.2: Hitstop
        this.hitstopTimer = 0;

        this._loop = this._loop.bind(this);
        this._backgroundTick = this._backgroundTick.bind(this);
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
        this.stopBackgroundUpdates();
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        Logger.log('GameLoop stopped');
    }

    pause() {
        this.paused = true;
        this.accumulator = 0;
        this.hitstopTimer = 0;
        Logger.log('GameLoop paused');
    }

    resume() {
        this.paused = false;
        this.lastTime = performance.now(); // Reset time to prevent huge delta
        this.lastRenderTime = this.lastTime;
        this.accumulator = 0;
        this.hitstopTimer = 0;
        Logger.log('GameLoop resumed');
    }

    startBackgroundUpdates(intervalMs = 250) {
        if (!this.running || this.backgroundTimerId) return;
        this.backgroundTickIntervalMs = Number.isFinite(intervalMs) ? Math.max(100, Math.round(intervalMs)) : 250;
        this.lastTime = performance.now();
        this.backgroundTimerId = setInterval(this._backgroundTick, this.backgroundTickIntervalMs);
        Logger.log(`GameLoop background updates started (${this.backgroundTickIntervalMs}ms)`);
    }

    stopBackgroundUpdates() {
        if (!this.backgroundTimerId) return;
        clearInterval(this.backgroundTimerId);
        this.backgroundTimerId = null;
        this.lastTime = performance.now();
        Logger.log('GameLoop background updates stopped');
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
        if (this.backgroundTimerId && typeof document !== 'undefined' && document.hidden) return;

        const frameTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        const rawFrameGapMs = Math.max(0, frameTime * 1000);

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
                rawFrameGapMs,
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
            rawFrameGapMs,
            updateSteps,
            backlogDrops
        });
    }

    _backgroundTick() {
        if (!this.running || this.paused) return;
        if (typeof document !== 'undefined' && !document.hidden) return;

        const now = performance.now();
        const elapsedSec = Math.max(0, (now - this.lastTime) / 1000);
        this.lastTime = now;

        if (this.hitstopTimer > 0) {
            this.hitstopTimer = Math.max(0, this.hitstopTimer - (elapsedSec * 1000));
        }

        const maxSimulatedWindow = 1.0;
        const fixedBackgroundStep = 0.05;
        let remaining = Math.min(elapsedSec, maxSimulatedWindow);
        let updateSteps = 0;
        let totalUpdateMs = 0;

        while (remaining > 0.0001) {
            const step = Math.min(fixedBackgroundStep, remaining);
            const updateStart = performance.now();
            this.updateFn(step);
            totalUpdateMs += performance.now() - updateStart;
            remaining -= step;
            updateSteps++;
        }

        window.game?.recordLoopTelemetry?.({
            updateMs: totalUpdateMs,
            renderMs: 0,
            frameGapMs: elapsedSec * 1000,
            rawFrameGapMs: elapsedSec * 1000,
            updateSteps,
            backlogDrops: elapsedSec > maxSimulatedWindow ? 1 : 0
        });
    }
}
