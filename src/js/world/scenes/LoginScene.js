import Scene from '../../core/Scene.js';
import Logger from '../../utils/Logger.js';

export default class LoginScene extends Scene {
    constructor(game) {
        super(game);
        this.loginUI = null;
    }

    async enter() {
        Logger.info("[LoginScene] Entered");
        this.game.ui?.hideHUD();
        this.game.ui?.hideAllPopups();

        // v0.00.64: Preload BGM immediately to eliminate "slow start" feeling on click
        this.game.resources.loadJSON('/assets/data/music/bgm_intro.json').catch(e => { });

        if (this.game.sound) {
            // Check state without forcing resume immediately to avoid console warnings
            const sound = this.game.sound;
            const isSuspended = !sound.ctx || sound.ctx.state === 'suspended';

            if (isSuspended) {
                const unlock = () => {
                    // Remove listeners immediately to prevent multiple triggers
                    window.removeEventListener('click', unlock);
                    window.removeEventListener('touchstart', unlock);
                    window.removeEventListener('keydown', unlock);

                    sound.initOrResume();
                    sound.resume().then(() => {
                        sound.loadAndPlayBgm('bgm_intro');
                    }).catch(e => {
                        Logger.warn('Audio Resume Failed', e);
                        // Try playing anyway in case state updated
                        sound.loadAndPlayBgm('bgm_intro');
                    });
                };
                window.addEventListener('click', unlock);
                window.addEventListener('touchstart', unlock);
                window.addEventListener('keydown', unlock);
            } else {
                sound.loadAndPlayBgm('bgm_intro');
            }
        }

        this.createUI();
    }

    async exit() {
        clearTimeout(this.loginWatchdog);
        if (this.loginUI) {
            this.loginUI.remove();
            this.loginUI = null;
        }
    }

    createUI() {
        this.loginUI = document.createElement('div');
        this.loginUI.id = 'login-scene-ui';
        this.loginUI.className = 'scene-overlay yurika-opening';
        const art = this.game.resources.getVersionedResourceUrl('/party-rpg-concept/assets/opening.webp');
        const version = window.GAME_VERSION || '0.02.137';

        this.loginUI.innerHTML = `
            <div class="opening-art" aria-hidden="true"><img src="${art}" alt=""></div>
            <header class="opening-brand"><p>MOONFOREST</p><h1>YURIKA</h1><p class="opening-online">ONLINE</p><h2>달숲에서 시작하는 나의 모험</h2></header>
            <div class="opening-footer">
                <p class="opening-status" role="status" aria-live="polite">로그인하고 모험을 시작하세요.</p>
                <div class="opening-actions">
                    <button id="google-login-btn" class="opening-button">Google로 로그인</button>
                    <button id="guest-login-btn" class="opening-button opening-guest">게스트로 시작하기</button>
                </div>
                <small class="opening-version">${version}</small>
            </div>
        `;
        this.loginUI.querySelector('.opening-art').style.setProperty('--opening-art', `url("${art}")`);

        document.getElementById('game-container').appendChild(this.loginUI);

        // Bind Events
        document.getElementById('google-login-btn').onclick = () => {
            if (this.game.sound) this.game.sound.playSfx('ui_click');
            this.handleGoogleLogin();
        }
        document.getElementById('guest-login-btn').onclick = () => {
            if (this.game.sound) this.game.sound.playSfx('ui_click');
            this.handleGuestLogin();
        }
    }

    setLoginPending(pending, message) {
        if (!this.loginUI) return;
        this.loginUI.querySelectorAll('.opening-button').forEach(button => { button.disabled = pending; });
        this.loginUI.querySelector('.opening-status').textContent = message;
    }

    async authenticate(provider) {
        if (this.loginPending) return;
        this.loginPending = true;
        this.setLoginPending(true, '모험 기록을 불러오고 있어요.');
        this.loginUI?.querySelector('[data-login-reload]')?.remove();
        this.loginWatchdog = setTimeout(() => {
            if (!this.loginUI || !this.loginPending) return;
            this.setLoginPending(true, '로그인이 지연되고 있어요. 잠시 기다리거나 다시 불러와 주세요.');
            const retry = document.createElement('button');
            retry.className = 'opening-button';
            retry.dataset.loginReload = '';
            retry.textContent = '다시 불러오기';
            retry.onclick = () => { retry.disabled = true; window.location.reload(); };
            this.loginUI.querySelector('.opening-actions').appendChild(retry);
        }, 20000);
        try {
            await (provider === 'google' ? this.game.auth.loginGoogle() : this.game.auth.loginAnonymously());
        } catch (e) {
            Logger.error('Login Error:', e);
            const message = e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request'
                ? '로그인을 취소했어요. 다시 시작할 수 있어요.'
                : e.code === 'auth/unauthorized-domain'
                    ? '이 주소에서는 로그인할 수 없어요. 공식 서비스에서 다시 시도해주세요.'
                    : '로그인하지 못했어요. 연결을 확인하고 다시 시도해주세요.';
            this.setLoginPending(false, message);
        } finally {
            clearTimeout(this.loginWatchdog);
            this.loginUI?.querySelector('[data-login-reload]')?.remove();
            this.loginPending = false;
            // Auth observers own the next scene; a cancelled or incomplete attempt stays retryable.
            if (this.loginUI) this.loginUI.querySelectorAll('.opening-button').forEach(button => { button.disabled = false; });
        }
    }

    handleGoogleLogin() { return this.authenticate('google'); }

    handleGuestLogin() { return this.authenticate('guest'); }

    update(dt) {
        // Background animation if any
    }

    render(ctx) {
        // Render cool background on canvas
        const w = this.game.canvas.width;
        const h = this.game.canvas.height;

        const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w);
        grad.addColorStop(0, '#2d3436');
        grad.addColorStop(1, '#000000');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    }
}
