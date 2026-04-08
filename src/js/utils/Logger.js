export default class Logger {
    static LEVELS = Object.freeze({
        debug: 10,
        info: 20,
        warn: 30,
        error: 40
    });

    static level = 'warn';

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

    static debug(...args) {
        if (this.shouldLog('debug')) console.log('[DEBUG]', ...args);
    }

    static log(...args) {
        this.debug(...args);
    }

    static info(...args) {
        if (this.shouldLog('info')) console.info('[INFO]', ...args);
    }

    static warn(...args) {
        if (this.shouldLog('warn')) console.warn('[WARN]', ...args);
    }

    static error(...args) {
        if (this.shouldLog('error')) console.error('[ERROR]', ...args);
    }
}
