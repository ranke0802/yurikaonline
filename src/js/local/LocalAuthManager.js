import EventEmitter from '../core/EventEmitter.js';

/** Explicit device-local identity. Never authenticates with a remote service. */
export default class LocalAuthManager extends EventEmitter {
    constructor() { super(); this.currentUser = null; this.isInitialized = false; }
    init() { queueMicrotask(() => this.loginAnonymously()); }
    async loginAnonymously() {
        this.currentUser = { uid: 'local-player', displayName: '로컬 모험가', isAnonymous: true, isLocal: true };
        this.isInitialized = true;
        this.emit('authStateChanged', this.currentUser);
        this.emit('initialized');
        return this.currentUser;
    }
    async logout() { this.currentUser = null; this.emit('authStateChanged', null); }
    async loginGoogle() { throw new Error('로컬 모드에서는 온라인 로그인을 사용할 수 없습니다.'); }
}
