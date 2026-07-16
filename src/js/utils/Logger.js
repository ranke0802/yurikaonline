export default class Logger {
    static LEVELS = Object.freeze({
        debug: 10,
        info: 20,
        warn: 30,
        error: 40
    });

    static level = 'warn';
    static duplicateWindowMs = 5000;
    static burstWindowMs = 5000;
    static burstLimits = Object.freeze({
        debug: 80,
        info: 60,
        warn: 40,
        error: 20
    });
    static maxTrackedDuplicateKeys = 256;
    static duplicateLogState = new Map();
    static burstLogState = new Map();

    static normalizeLevel(level = 'warn') {
        return Object.prototype.hasOwnProperty.call(this.LEVELS, level)
            ? level
            : 'warn';
    }

    static setLevel(level = 'warn') {
        this.level = this.normalizeLevel(level);
    }

    static getLevel() {
        return this.level;
    }

    static shouldLog(level = 'debug') {
        const normalizedLevel = this.normalizeLevel(level);
        const activeLevel = this.LEVELS[this.level] ?? this.LEVELS.warn;
        return this.LEVELS[normalizedLevel] >= activeLevel;
    }

    static normalizeDuplicateKeyPart(value) {
        if (value instanceof Error) {
            return `${value.name || 'Error'}:${value.message || ''}`;
        }

        let text = typeof value === 'string'
            ? value
            : (() => {
                try {
                    return JSON.stringify(value);
                } catch (error) {
                    return String(value ?? '');
                }
            })();

        return text
            .replace(/monster_reward:[^\s,'")\]}]+/g, 'monster_reward:<id>')
            .replace(/drop_reward:[^\s,'")\]}]+/g, 'drop_reward:<id>')
            .replace(/normal_batch_v\d+:[^\s,'")\]}]+/g, 'normal_batch:<id>')
            .replace(/[A-Za-z0-9_-]{24,}/g, '<token>')
            .replace(/\b\d{6,}\b/g, '<num>');
    }

    static buildDuplicateKey(level, args = []) {
        return [
            this.normalizeLevel(level),
            ...args.slice(0, 3).map((arg) => this.normalizeDuplicateKeyPart(arg))
        ].join('|').slice(0, 512);
    }

    static pruneDuplicateLogState(now = Date.now()) {
        if (this.duplicateLogState.size <= this.maxTrackedDuplicateKeys) return;

        const staleCutoff = now - this.duplicateWindowMs * 6;
        for (const [key, state] of this.duplicateLogState.entries()) {
            if (Number(state?.lastSeenAt || 0) < staleCutoff) {
                this.duplicateLogState.delete(key);
            }
        }

        while (this.duplicateLogState.size > this.maxTrackedDuplicateKeys) {
            const oldestKey = this.duplicateLogState.keys().next().value;
            if (!oldestKey) break;
            this.duplicateLogState.delete(oldestKey);
        }
    }

    static consumeBurstSlot(level, now = Date.now()) {
        const normalizedLevel = this.normalizeLevel(level);
        const limit = this.burstLimits[normalizedLevel] || 0;
        if (limit <= 0) return { ok: true, suppressed: 0 };

        let state = this.burstLogState.get(normalizedLevel);
        if (!state || now - Number(state.startedAt || 0) >= this.burstWindowMs) {
            const suppressed = Number(state?.suppressed || 0);
            state = {
                startedAt: now,
                emitted: 0,
                suppressed: 0
            };
            this.burstLogState.set(normalizedLevel, state);
            state.pendingSummary = suppressed;
        }

        if (state.emitted >= limit) {
            state.suppressed = Number(state.suppressed || 0) + 1;
            return { ok: false, suppressed: 0 };
        }

        state.emitted += 1;
        const suppressed = Number(state.pendingSummary || 0);
        state.pendingSummary = 0;
        return { ok: true, suppressed };
    }

    static emit(level, consoleMethod, args = []) {
        if (!this.shouldLog(level)) return;

        const now = Date.now();
        const key = this.buildDuplicateKey(level, args);
        const previous = this.duplicateLogState.get(key);

        if (previous && now - Number(previous.lastEmittedAt || 0) < this.duplicateWindowMs) {
            previous.suppressed = Number(previous.suppressed || 0) + 1;
            previous.lastSeenAt = now;
            return;
        }

        const burst = this.consumeBurstSlot(level, now);
        if (!burst.ok) return;

        const nextArgs = previous?.suppressed > 0
            ? [...args, `(반복 로그 ${previous.suppressed}회 생략)`]
            : args;
        if (burst.suppressed > 0) {
            nextArgs.push(`(버스트 로그 ${burst.suppressed}회 생략)`);
        }

        this.duplicateLogState.set(key, {
            lastEmittedAt: now,
            lastSeenAt: now,
            suppressed: 0
        });
        this.pruneDuplicateLogState(now);

        const writer = console?.[consoleMethod] || console?.log;
        writer?.call(console, `[${level.toUpperCase()}]`, ...nextArgs);
    }

    static debug(...args) {
        this.emit('debug', 'log', args);
    }

    static log(...args) {
        this.debug(...args);
    }

    static info(...args) {
        this.emit('info', 'info', args);
    }

    static warn(...args) {
        this.emit('warn', 'warn', args);
    }

    static error(...args) {
        this.emit('error', 'error', args);
    }
}
