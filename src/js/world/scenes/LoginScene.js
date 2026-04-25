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
        if (this.loginUI) {
            this.loginUI.remove();
            this.loginUI = null;
        }
    }

    escapeHtml(value = '') {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    t(key, params = {}) {
        return this.game.i18n?.t(key, params) || key;
    }

    createUI() {
        this.loginUI = document.createElement('div');
        this.loginUI.id = 'login-scene-ui';
        this.loginUI.className = 'scene-overlay yurika-auth-scene';
        const version = window.GAME_VERSION || '0.02.046';

        this.loginUI.innerHTML = `
            <div class="scene-atmosphere" aria-hidden="true">
                <div class="forest-line forest-line-back"></div>
                <div class="forest-line forest-line-front"></div>
                <div class="cabin-silhouette">
                    <div class="cabin-roof"></div>
                    <div class="cabin-body">
                        <span class="cabin-window"></span>
                    </div>
                </div>
                <div class="manastone-shards">
                    <span></span><span></span><span></span>
                </div>
            </div>

            <div class="login-card glass yurika-gate-card">
                <div class="login-copy">
                    <div class="story-kicker">${this.escapeHtml(this.t('login.kicker'))}</div>
                    <h1 class="game-logo">YURIKA ONLINE</h1>
                    <p class="game-subtitle">${this.escapeHtml(this.t('login.subtitle'))}</p>
                    <p class="login-lore">
                        ${this.escapeHtml(this.t('login.lore'))}
                    </p>
                    <div class="login-oath">
                        <span>${this.escapeHtml(this.t('login.oath.boundary'))}</span>
                        <span>${this.escapeHtml(this.t('login.oath.cabin'))}</span>
                        <span>${this.escapeHtml(this.t('login.oath.promise'))}</span>
                    </div>
                </div>

                <div class="login-options">
                    <div class="login-options-title">${this.escapeHtml(this.t('login.continue'))}</div>
                    <button id="google-login-btn" class="login-btn google">
                        <span class="btn-icon">G</span> ${this.escapeHtml(this.t('login.google'))}
                    </button>
                    <button id="guest-login-btn" class="login-btn guest">
                        ${this.escapeHtml(this.t('login.guest'))}
                    </button>
                    <p class="login-hint">${this.escapeHtml(this.t('login.hint'))}</p>
                </div>

                <div class="version-tag">${this.escapeHtml(version)}</div>
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
                btn.innerHTML = `<span class="btn-icon">...</span> ${this.escapeHtml(this.t('login.googleLoading'))}`;
            }
            await this.game.auth.loginGoogle();
        } catch (e) {
            Logger.error("Login Error:", e);

            // Special handling for domain issues
            if (e.code === 'auth/unauthorized-domain') {
                alert(this.t('login.unauthorizedDomain', { host: window.location.hostname }));
            } else if (e.code === 'auth/popup-closed-by-user') {
                Logger.log("User closed the popup.");
            } else {
                alert(this.t('login.error', { message: e.message || 'unknown' }));
            }

            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<span class="btn-icon">G</span> ${this.escapeHtml(this.t('login.google'))}`;
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
        const w = this.game.canvas.width;
        const h = this.game.canvas.height;

        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#111a24');
        sky.addColorStop(0.48, '#0a1018');
        sky.addColorStop(1, '#030506');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.globalAlpha = 0.16;
        const moonR = Math.max(34, Math.min(w, h) * 0.07);
        ctx.fillStyle = '#d7e3dc';
        ctx.beginPath();
        ctx.arc(w * 0.72, h * 0.18, moonR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        const drawTrees = (baseY, color, alpha, step, heightRatio) => {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(0, h);
            for (let x = -step; x <= w + step; x += step) {
                const variance = ((x / step) % 3) * 0.04;
                const treeH = h * (heightRatio + variance);
                ctx.lineTo(x + step * 0.5, baseY - treeH);
                ctx.lineTo(x + step, baseY);
            }
            ctx.lineTo(w, h);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        };

        drawTrees(h * 0.9, '#13251e', 0.62, Math.max(42, w * 0.06), 0.2);
        drawTrees(h * 0.98, '#07100d', 0.9, Math.max(34, w * 0.048), 0.28);

        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#43d1b7';
        const stoneX = w * 0.5;
        const stoneY = h * 0.62;
        ctx.beginPath();
        ctx.moveTo(stoneX, stoneY - 18);
        ctx.lineTo(stoneX + 12, stoneY);
        ctx.lineTo(stoneX, stoneY + 22);
        ctx.lineTo(stoneX - 12, stoneY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}
