// Explicit, memory-only recording. Never serialize entities, game state or errors.
export const DIAGNOSTIC_LIMITS = Object.freeze({ durationMs: 20000, frames: 2048, errors: 32, entities: 512, hooks: 16 });
export const PASS_NAMES = Object.freeze(['monster', 'player', 'playerHud', 'summonGround', 'summonForeground']);
const ERROR_CODES = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'InvalidStateError', 'SecurityError']);
const SOURCE_FILES = new Set(['core/GameLoop.js', 'core/SceneManager.js', 'core/Sprite.js', 'world/scenes/WorldScene.js',
    'entities/Player.js', 'entities/Monster.js', 'combat/ClassCombatBridge.js', 'diagnostics/RenderDiagnostics.js', 'main.js']);
const STOP_CODES = new Set(['manual', 'timeout', 'buffer_full', 'hidden', 'cleared', 'recorder_error', 'entity_limit', 'hook_limit']);
const round = n => Number.isFinite(n) ? Math.round(n * 100) / 100 : null;

export function sanitizeRenderError(error) {
    // No message, function name, origin, query, arbitrary path or raw stack survives.
    const code = ERROR_CODES.has(error?.name) ? error.name : 'Error';
    const stack = [];
    if (typeof error?.stack === 'string') {
        for (const line of error.stack.slice(0, 8192).split('\n').slice(0, 13)) {
            // Chromium has an error header; WebKit can begin with its first frame.
            if (!/^\s*at\s|^[^\n]*@(?:https?:\/\/|file:\/\/|\/)/.test(line)) continue;
            const match = line.match(/\/src\/js\/([A-Za-z0-9_/.-]+\.js)(?:[?#][^\s)]*)?:(\d{1,6}):(\d{1,6})\)?$/);
            if (match && SOURCE_FILES.has(match[1])) {
                stack.push({ file: match[1], line: Number(match[2]), column: Number(match[3]) });
                if (stack.length === 3) break;
            }
        }
    }
    return { code, stack };
}

function contextAttributes(ctx) {
    try {
        const a = ctx?.getContextAttributes?.();
        if (!a) return null;
        // Copy only specified scalar values; never spread a browser/host object.
        return { alpha: typeof a.alpha === 'boolean' ? a.alpha : null,
            desynchronized: typeof a.desynchronized === 'boolean' ? a.desynchronized : null,
            willReadFrequently: typeof a.willReadFrequently === 'boolean' ? a.willReadFrequently : null,
            colorSpace: ['srgb', 'display-p3'].includes(a.colorSpace) ? a.colorSpace : null };
    } catch { return null; }
}

export default class RenderDiagnostics {
    constructor(game, fallbackUsed = false) {
        this.game = game;
        this.context = { requested: { alpha: false, desynchronized: true }, fallbackUsed: !!fallbackUsed,
            actual: contextAttributes(game.ctx) };
        this.active = false;
        this.generation = 0;
        this.hooks = [];
        this.frames = [];
        this.errors = [];
        this.reason = null;
        this.current = null;
        this.onChange = null;
        this.hidden = () => { if (globalThis.document?.hidden) this.stop('hidden'); };
        this.pageHide = () => this.stop('hidden');
    }
    _notify() { try { this.onChange?.(); } catch { /* UI reporting cannot affect rendering. */ } }
    _guard(fn, fallback = null) {
        try { return fn(); } catch { this.stop('recorder_error'); return fallback; }
    }
    start() {
        if (this.active) return false;
        return this._guard(() => {
            if (typeof this.game.loop?.renderFn !== 'function') return false;
            this.frames = new Array(DIAGNOSTIC_LIMITS.frames);
            this.count = 0;
            this.errors = [];
            this.errorsDropped = 0;
            this.reason = null;
            this.durationMs = 0;
            this.startedAt = performance.now();
            this.lastAt = null;
            this.current = null;
            const build = globalThis.window?.RUNTIME_BUILD_VERSION;
            this.version = typeof build === 'string' && build.length <= 24 && /^\d+\.\d+\.\d+$/.test(build)
                ? build : 'unknown';
            this.active = true;
            const generation = ++this.generation;
            const d = this;
            this._hook(this.game.loop, 'renderFn', original => function(...args) {
                if (!d.active || d.generation !== generation) return original.apply(this, args);
                const frame = d._guard(() => d._begin());
                let completed = false;
                try { const result = original.apply(this, args); completed = true; return result; }
                catch (error) { if (frame) d._guard(() => d._error(frame, error)); throw error; }
                finally { if (frame) d._guard(() => d._end(frame, completed)); }
            });
            this.timer = setTimeout(() => this.stop('timeout'), DIAGNOSTIC_LIMITS.durationMs);
            globalThis.document?.addEventListener?.('visibilitychange', this.hidden);
            globalThis.window?.addEventListener?.('pagehide', this.pageHide);
            this._notify();
            return true;
        }, false);
    }
    stop(reason = 'manual') {
        // Cleanup is best-effort and never replaces a game exception.
        const wasActive = this.active;
        this.active = false;
        if (wasActive) {
            this.reason = STOP_CODES.has(reason) ? reason : 'manual';
            try { this.durationMs = round(Math.min(DIAGNOSTIC_LIMITS.durationMs, Math.max(0, performance.now() - this.startedAt))); } catch { /* optional clock */ }
        }
        try { clearTimeout(this.timer); } catch { /* optional timer */ }
        this.timer = null;
        for (const h of this.hooks) {
            try {
                if (h.object[h.key] === h.wrapper) {
                    if (h.descriptor) Object.defineProperty(h.object, h.key, h.descriptor);
                    else delete h.object[h.key];
                }
            } catch { /* An inactive wrapper only delegates to its original. */ }
        }
        this.hooks = [];
        try { globalThis.document?.removeEventListener?.('visibilitychange', this.hidden); } catch { /* optional event */ }
        try { globalThis.window?.removeEventListener?.('pagehide', this.pageHide); } catch { /* optional event */ }
        if (wasActive) this._notify();
        return wasActive;
    }
    clear() {
        this.stop('cleared');
        this.frames = []; this.count = 0; this.errors = []; this.errorsDropped = 0;
        this.current = null; this.reason = null; this.durationMs = 0;
        this._notify();
    }
    _hook(object, key, make) {
        if (!this.active) return;
        if (this.hooks.some(h => h.object === object && h.key === key)) return;
        if (this.hooks.length >= DIAGNOSTIC_LIMITS.hooks) { this.stop('hook_limit'); return; }
        const original = object?.[key];
        if (typeof original !== 'function') return;
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        const wrapper = make(original);
        // Register before assignment so even a failed assignment is cleaned safely.
        this.hooks.push({ object, key, descriptor, wrapper });
        object[key] = wrapper;
    }
    _pass(object, key, index) {
        if (!this.active || this.hooks.some(h => h.object === object && h.key === key)) return;
        const d = this, generation = this.generation;
        this._hook(object, key, original => function(...args) {
            const frame = d.active && generation === d.generation ? d.current : null;
            const relevant = frame && d._guard(() => {
                const s = d.game.sceneManager?.currentScene;
                return index === 0 ? s?.monsterManager?.monsters?.get(this.id) === this
                    : index < 3 ? s?.player === this : s?.player?.classCombat === this;
            }, false);
            if (relevant) frame.started[index]++;
            // Do not catch or repair a game exception; the full-frame wrapper records it.
            const result = original.apply(this, args);
            if (relevant) frame.completed[index]++;
            return result;
        });
    }
    _begin() {
        const now = performance.now();
        if (now - this.startedAt >= DIAGNOSTIC_LIMITS.durationMs) { this.stop('timeout'); return null; }
        if (this.count >= DIAGNOSTIC_LIMITS.frames) { this.stop('buffer_full'); return null; }
        const f = { ms: round(now - this.startedAt), gapMs: this.lastAt === null ? null : round(now - this.lastAt),
            expected: [0, 0, 0, 0, 0], started: [0, 0, 0, 0, 0], completed: [0, 0, 0, 0, 0], complete: false };
        this.lastAt = now;
        this.frames[this.count++] = f; // Denominator exists before any render or expectation work.
        this.current = f;
        const g = this.game, s = g.sceneManager?.currentScene, p = s?.player, camera = s?.camera;
        if (!p || !s.monsterManager || s._campEntryIncomplete || !g.zone?.currentZone) return f;
        const visible = e => {
            if (!camera) return true;
            const x = e.x + (e.width || 0) / 2, y = e.y + (e.height || 0) / 2;
            const margin = s.viewMargin;
            return x >= camera.x - margin && x <= camera.x + g.canvas.width / g.dpr / g.zoom + margin
                && y >= camera.y - margin && y <= camera.y + g.canvas.height / g.dpr / g.zoom + margin;
        };
        let inspected = 0;
        for (const m of s.monsterManager.monsters.values()) {
            if (++inspected > DIAGNOSTIC_LIMITS.entities) { this.stop('entity_limit'); break; }
            if (visible(m)) f.expected[0]++;
            this._pass(Object.getPrototypeOf(m), 'render', 0);
        }
        this._pass(Object.getPrototypeOf(p), 'render', 1);
        this._pass(Object.getPrototypeOf(p), 'drawHUD', 2);
        if (!p.isDead && visible(p)) {
            f.expected[1] = 1;
            // Player has a second, narrower culling check before its HUD.
            if (camera && !(p.x + p.width + 100 < camera.x || p.x - 100 > camera.x + camera.width
                || p.y + p.height + 100 < camera.y || p.y - 100 > camera.y + camera.height)) f.expected[2] = 1;
        }
        if (p.classCombat) {
            f.expected[3] = f.expected[4] = 1;
            this._pass(Object.getPrototypeOf(p.classCombat), 'renderGround', 3);
            this._pass(Object.getPrototypeOf(p.classCombat), 'render', 4);
        }
        return f;
    }
    _error(frame, error) {
        frame.error = true;
        if (this.errors.length >= DIAGNOSTIC_LIMITS.errors) { this.errorsDropped++; return; }
        this.errors.push({ frame: this.count - 1, ...sanitizeRenderError(error) });
    }
    _end(frame, completed) {
        frame.complete = completed;
        this.current = null;
        if (this.active && this.count >= DIAGNOSTIC_LIMITS.frames) this.stop('buffer_full');
    }
    exportJSON() {
        if (this.active || !this.count) return null;
        // This is the complete allowlist. No object from the game is exported.
        return JSON.stringify({ schema: 1, build: this.version, context: this.context,
            timing: 'relative render-start milliseconds; not display refresh rate',
            durationMs: this.durationMs, stopReason: this.reason, limits: DIAGNOSTIC_LIMITS,
            passes: PASS_NAMES, frameCount: this.count, errorsDropped: this.errorsDropped,
            frames: this.frames.slice(0, this.count), errors: this.errors });
    }
}

export function createRenderDiagnostics(game, fallbackUsed) {
    try { return new RenderDiagnostics(game, fallbackUsed); } catch { return null; }
}
