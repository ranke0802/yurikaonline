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
                        console.warn('Audio Resume Failed', e);
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
        if (this.loginUI) {
            this.loginUI.remove();
            this.loginUI = null;
        }
    }

    createUI() {
        this.loginUI = document.createElement('div');
        this.loginUI.id = 'login-scene-ui';
        this.loginUI.className = 'scene-overlay';
        const version = window.GAME_VERSION || '0.01.07';

        this.loginUI.innerHTML = `
            <div class="login-card glass">
                <h1 class="game-logo">YURIKA ONLINE</h1>
                <p class="game-subtitle">Advanced Agentic MMORPG</p>

                <div class="login-options">
                    <button id="google-login-btn" class="login-btn google">
                        <span class="btn-icon">G</span> Google로 로그인
                    </button>
                    <button id="guest-login-btn" class="login-btn guest">
                        게스트로 시작하기
                    </button>
                </div>

                <div class="version-tag">${version}</div>
            </div>
        `;

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

    async handleGoogleLogin() {
        const btn = document.getElementById('google-login-btn');
        try {
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<span class="btn-icon">...</span> 구글 로그인 중...`;
            }
            await this.game.auth.loginGoogle();
        } catch (e) {
            Logger.error("Login Error:", e);

            // Special handling for domain issues
            if (e.code === 'auth/unauthorized-domain') {
                alert(`승인되지 않은 도메인입니다 (${window.location.hostname}).\nFirebase 콘솔에서 승인된 도메인에 추가해주세요.`);
            } else if (e.code === 'auth/popup-closed-by-user') {
                Logger.log("User closed the popup.");
            } else {
                alert("로그인 중 오류가 발생했습니다: " + (e.message || "알 수 없는 오류"));
            }

            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<span class="btn-icon">G</span> Google로 로그인`;
            }
        }
    }

    async handleGuestLogin() {
        try {
            await this.game.auth.loginAnonymously();
        } catch (e) {
            Logger.error("Guest Login Error:", e);
        }
    }

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
