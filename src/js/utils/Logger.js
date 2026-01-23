export default class Logger {
    static DEBUG = true;

    static log(...args) {
        if (this.DEBUG) console.log('[LOG]', ...args);
    }

    static info(...args) {
        if (this.DEBUG) console.info('[INFO]', ...args);
    }

    static warn(...args) {
        console.warn('[WARN]', ...args);
    }

    static error(...args) {
        console.error('[ERROR]', ...args);
    }
}
