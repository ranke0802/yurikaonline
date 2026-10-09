/** Android entry uses standard APIs once per explicit gesture, never resume loops. */
export default class AndroidDisplayController {
    static supported(navigator) { return /Android/i.test(navigator.userAgent || ''); }
    constructor(ui, env = globalThis) {
        this.ui = ui; this.env = env; this.document = env.document;
        this.attempted = false; this.pending = null; this.generation = 0; this.locked = false;
    }
    init() {
        this.document.addEventListener('click', event => {
            if (!event.isTrusted || this.attempted || !this.ui.getSetting('autoFullscreen')) return;
            if (!event.target.closest?.('#start-game-btn, #guest-login-btn, [data-camp="create"], [data-camp="depart"]')) return;
            // Capture phase, before login/save awaits consume the gesture.
            void this.request();
        }, true);
        this.document.addEventListener('fullscreenchange', () => {
            if (!this.ui.isFullscreenActive()) {
                ++this.generation; this.locked = false; this.attempted = true;
                this.env.screen?.orientation?.unlock?.();
                this.showNotice('전체화면을 해제했어요. 원할 때 다시 가로 전체화면으로 전환할 수 있어요.');
            }
            this.refresh();
        });
        this.document.addEventListener('visibilitychange', () => {
            if (this.document.visibilityState === 'hidden') ++this.generation;
        });
        // Manifest handles installed launch. One optional lock attempt; no API
        // fullscreen request on load and no retry on pageshow/visibility/resize.
        if (this.ui.isStandaloneDisplayMode()) { this.attempted = true; void this.request(); }
    }
    refresh() {
        this.ui.syncMobileEnvironmentClasses();
        this.ui.game?._handleViewportOrientationChange?.();
    }
    request() {
        if (this.pending) return this.pending;
        this.attempted = true;
        const generation = ++this.generation;
        const active = () => generation === this.generation && this.document.visibilityState !== 'hidden';
        let fullscreen;
        try {
            if (this.ui.isFullscreenActive() || this.ui.isStandaloneDisplayMode()) fullscreen = Promise.resolve();
            else {
                const root = this.document.documentElement;
                if (!root.requestFullscreen) throw new Error('unsupported');
                // Must run synchronously in the original trusted click handler.
                fullscreen = root.requestFullscreen({ navigationUI: 'hide' });
            }
        } catch (error) { fullscreen = Promise.reject(error); }
        const work = Promise.resolve(fullscreen).then(async () => {
            if (!active()) return false;
            if (!this.ui.isFullscreenActive() && !this.ui.isStandaloneDisplayMode()) throw new Error('not_fullscreen');
            try {
                const orientation = this.env.screen?.orientation;
                if (!orientation?.lock) throw new Error('orientation_unsupported');
                await orientation.lock('landscape');
                if (!active()) return false;
                this.locked = true; this.hideNotice();
            } catch {
                if (active()) this.showNotice('전체화면입니다. 자동 회전이 지원되지 않으면 기기를 가로로 돌려 주세요.');
            }
            this.refresh(); return true;
        }).catch(() => {
            if (active()) this.showNotice('자동 전체화면을 사용할 수 없어요. 다시 시도하거나 기기를 가로로 돌려 주세요.');
            return false;
        });
        let timer;
        const timeout = new Promise(resolve => {
            timer = this.env.setTimeout(() => {
                if (active()) { ++this.generation; this.showNotice('화면 전환이 지연되고 있어요. 그대로 플레이하거나 다시 시도할 수 있어요.'); }
                resolve(false);
            }, 4000);
        });
        this.pending = Promise.race([work, timeout]).finally(() => { this.env.clearTimeout(timer); this.pending = null; });
        return this.pending;
    }
    hideNotice() { this.notice?.remove(); this.notice = null; }
    showNotice(message) {
        this.hideNotice();
        const notice = this.document.createElement('aside');
        notice.id = 'android-display-notice'; notice.setAttribute('aria-label', '화면 전환 안내');
        const text = this.document.createElement('span'); text.textContent = message; text.setAttribute('role', 'status');
        const retry = this.document.createElement('button'); retry.type = 'button'; retry.textContent = '가로 전체화면';
        retry.onclick = () => { void this.request(); };
        const dismiss = this.document.createElement('button'); dismiss.type = 'button'; dismiss.textContent = '닫기';
        dismiss.onclick = () => this.hideNotice();
        notice.append(text, retry, dismiss); this.document.body.append(notice); this.notice = notice;
    }
}
