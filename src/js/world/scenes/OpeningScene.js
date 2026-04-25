import Scene from '../../core/Scene.js';
import Logger from '../../utils/Logger.js';

export default class OpeningScene extends Scene {
    constructor(game) {
        super(game);
        this.openingUI = null;
        this.time = 0;
        this.started = false;
        this.eventAbortController = null;
        this.backgroundImage = null;
    }

    async enter() {
        Logger.info('[OpeningScene] Entered');
        this.time = 0;
        this.started = false;
        this.game.ui?.hideHUD();
        this.game.ui?.hideAllPopups();
        this.game.resources.loadJSON('/assets/data/music/bgm_intro.json').catch(() => { });
        this.game.resources.loadImage('/assets/generated/backgrounds/opening_guardian_oath.webp')
            .then((image) => {
                this.backgroundImage = image;
            })
            .catch((error) => {
                Logger.warn('[OpeningScene] Opening image unavailable; using canvas fallback.', error);
            });
        this.createUI();
    }

    async exit() {
        this.eventAbortController?.abort();
        this.eventAbortController = null;
        if (this.openingUI) {
            this.openingUI.remove();
            this.openingUI = null;
        }
    }

    t(key, params = {}) {
        return this.game.i18n?.t(key, params) || key;
    }

    escapeHtml(value = '') {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    createUI() {
        const existing = document.getElementById('opening-scene-ui');
        if (existing) existing.remove();

        this.openingUI = document.createElement('div');
        this.openingUI.id = 'opening-scene-ui';
        this.openingUI.className = 'scene-overlay opening-scene-ui';
        this.renderUI();
        document.getElementById('game-container')?.appendChild(this.openingUI);
        this.bindEvents();
    }

    renderUI() {
        if (!this.openingUI) return;
        const version = this.escapeHtml(window.GAME_VERSION || '0.02.031');
        const language = this.game.i18n?.getLanguage?.() || 'ko';
        const volume = this.game.ui?.getSetting?.('masterVolume') ?? 40;
        const muted = !!this.game.ui?.getSetting?.('muted');
        const reducedEffects = !!this.game.ui?.getSetting?.('reducedEffects');
        const autoFullscreen = !!this.game.ui?.getSetting?.('autoFullscreen');
        const orientationLock = !!this.game.ui?.getSetting?.('orientationLock');

        const languageButtons = (this.game.i18n?.getSupportedLanguages?.() || ['ko', 'ja', 'en'])
            .map((lang) => `
                <button type="button" class="opening-lang-btn ${lang === language ? 'is-active' : ''}" data-lang="${lang}">
                    ${this.escapeHtml(this.t(`language.${lang}`))}
                </button>
            `).join('');

        this.openingUI.innerHTML = `
            <div class="opening-atmosphere" aria-hidden="true">
                <div class="opening-moon"></div>
                <div class="opening-cabin-glow"></div>
                <div class="opening-tree-line opening-tree-line-back"></div>
                <div class="opening-tree-line opening-tree-line-front"></div>
            </div>

            <section class="opening-title-block" aria-live="polite">
                <div class="story-kicker">${this.escapeHtml(this.t('opening.kicker'))}</div>
                <h1>${this.escapeHtml(this.t('opening.title'))}</h1>
                <p class="opening-subtitle">${this.escapeHtml(this.t('opening.subtitle'))}</p>
                <p class="opening-oath">${this.escapeHtml(this.t('opening.oath'))}</p>
                <button type="button" id="opening-start-btn" class="opening-start-btn">${this.escapeHtml(this.t('opening.start'))}</button>
                <p class="opening-prompt">${this.escapeHtml(this.t('opening.prompt'))}</p>
            </section>

            <aside class="opening-settings-panel" aria-label="${this.escapeHtml(this.t('opening.settings'))}">
                <div class="opening-settings-head">
                    <span>${this.escapeHtml(this.t('opening.settings'))}</span>
                    <span class="version-tag">${version}</span>
                </div>

                <div class="opening-setting-group">
                    <label>${this.escapeHtml(this.t('opening.language'))}</label>
                    <div class="opening-language-grid">${languageButtons}</div>
                </div>

                <div class="opening-setting-group">
                    <label for="opening-volume">${this.escapeHtml(this.t('opening.masterVolume'))}</label>
                    <div class="opening-range-row">
                        <input id="opening-volume" type="range" min="0" max="100" step="1" value="${volume}">
                        <span id="opening-volume-value">${volume}%</span>
                    </div>
                </div>

                <label class="opening-check-row">
                    <span>${this.escapeHtml(this.t('opening.muted'))}</span>
                    <input id="opening-muted" type="checkbox" ${muted ? 'checked' : ''}>
                </label>

                <label class="opening-check-row">
                    <span>${this.escapeHtml(this.t('opening.reducedEffects'))}</span>
                    <input id="opening-reduced-effects" type="checkbox" ${reducedEffects ? 'checked' : ''}>
                </label>

                <label class="opening-check-row">
                    <span>${this.escapeHtml(this.t('opening.autoFullscreen'))}</span>
                    <input id="opening-auto-fullscreen" type="checkbox" ${autoFullscreen ? 'checked' : ''}>
                </label>

                <label class="opening-check-row">
                    <span>${this.escapeHtml(this.t('opening.orientationLock'))}</span>
                    <input id="opening-orientation-lock" type="checkbox" ${orientationLock ? 'checked' : ''}>
                </label>

                <p class="opening-settings-hint">${this.escapeHtml(this.t('opening.settingsHint'))}</p>
            </aside>
        `;
    }

    bindEvents() {
        if (!this.openingUI) return;

        this.eventAbortController?.abort();
        this.eventAbortController = new AbortController();
        const { signal } = this.eventAbortController;
        const add = (element, type, handler, options = {}) => {
            element?.addEventListener(type, handler, { ...options, signal });
        };
        const stopInsideSettings = (event) => {
            event.stopPropagation();
        };
        const start = (event = null) => {
            if (event?.button !== undefined && event.button !== 0) return;
            event?.preventDefault?.();
            event?.stopPropagation?.();
            this.startGame();
        };

        const startButton = this.openingUI.querySelector('#opening-start-btn');
        add(startButton, 'click', start);
        add(startButton, 'pointerup', start);
        add(startButton, 'touchend', start, { passive: false });

        const settingsPanel = this.openingUI.querySelector('.opening-settings-panel');
        ['click', 'pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'mousedown', 'mouseup'].forEach((type) => {
            add(settingsPanel, type, stopInsideSettings);
        });

        this.openingUI.querySelectorAll('.opening-lang-btn').forEach((button) => {
            add(button, 'click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.game.i18n?.setLanguage?.(button.dataset.lang || 'ko');
                this.game.ui?.updateSetting?.('language', button.dataset.lang || 'ko', {
                    refreshGame: false,
                    syncProfile: false,
                    announce: false
                });
                this.renderUI();
                this.bindEvents();
            });
        });

        const volume = this.openingUI.querySelector('#opening-volume');
        add(volume, 'input', (event) => {
            const nextValue = Number(event.currentTarget.value);
            this.game.ui?.updateSetting?.('masterVolume', nextValue, {
                refreshGame: false,
                syncProfile: false
            });
            const valueEl = this.openingUI?.querySelector('#opening-volume-value');
            if (valueEl) valueEl.textContent = `${nextValue}%`;
        });

        [
            ['#opening-muted', 'muted'],
            ['#opening-reduced-effects', 'reducedEffects'],
            ['#opening-auto-fullscreen', 'autoFullscreen'],
            ['#opening-orientation-lock', 'orientationLock']
        ].forEach(([selector, key]) => {
            add(this.openingUI.querySelector(selector), 'change', (event) => {
                this.game.ui?.updateSetting?.(key, !!event.currentTarget.checked, {
                    refreshGame: key === 'reducedEffects',
                    syncProfile: false
                });
            });
        });
    }

    async startGame() {
        if (this.started) return;
        this.started = true;
        if (this.game.sound) {
            try {
                this.game.sound.initOrResume?.();
                await this.game.sound.resume?.();
                this.game.sound.loadAndPlayBgm?.('bgm_intro');
                this.game.sound.playSfx?.('ui_click');
            } catch (error) {
                Logger.warn('[OpeningScene] Audio unlock failed', error);
            }
        }

        this.game.enterOpeningPrologue?.();
    }

    update(dt) {
        this.time += dt;
    }

    drawCoverImage(ctx, image, x, y, w, h) {
        const sourceRatio = image.width / image.height;
        const targetRatio = w / h;
        let sx = 0;
        let sy = 0;
        let sw = image.width;
        let sh = image.height;

        if (sourceRatio > targetRatio) {
            sw = image.height * targetRatio;
            sx = (image.width - sw) / 2;
        } else {
            sh = image.width / targetRatio;
            sy = (image.height - sh) / 2;
        }

        ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
    }

    render(ctx) {
        const w = this.game.canvas.width;
        const h = this.game.canvas.height;
        const pulse = 0.5 + Math.sin(this.time * 1.35) * 0.5;

        if (this.backgroundImage) {
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.filter = 'brightness(1.42) saturate(1.08)';
            this.drawCoverImage(ctx, this.backgroundImage, 0, 0, w, h);
            ctx.restore();

            const veil = ctx.createLinearGradient(0, 0, w, h);
            veil.addColorStop(0, 'rgba(4, 8, 14, 0.04)');
            veil.addColorStop(0.55, 'rgba(4, 8, 14, 0.08)');
            veil.addColorStop(1, 'rgba(1, 4, 6, 0.34)');
            ctx.fillStyle = veil;
            ctx.fillRect(0, 0, w, h);

            ctx.save();
            ctx.globalAlpha = 0.08 + pulse * 0.04;
            const glow = ctx.createRadialGradient(w * 0.42, h * 0.62, 0, w * 0.42, h * 0.62, Math.min(w, h) * 0.36);
            glow.addColorStop(0, '#75f4df');
            glow.addColorStop(1, 'rgba(69, 205, 190, 0)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
            return;
        }

        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#101923');
        sky.addColorStop(0.46, '#071018');
        sky.addColorStop(1, '#020404');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = '#eef3e6';
        ctx.beginPath();
        ctx.arc(w * 0.73, h * 0.18, Math.max(34, Math.min(w, h) * 0.068), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.22 + pulse * 0.12;
        const glow = ctx.createRadialGradient(w * 0.47, h * 0.66, 0, w * 0.47, h * 0.66, Math.min(w, h) * 0.28);
        glow.addColorStop(0, '#75f4df');
        glow.addColorStop(0.34, 'rgba(69, 205, 190, 0.22)');
        glow.addColorStop(1, 'rgba(69, 205, 190, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        const drawTrees = (baseY, color, alpha, step, heightRatio) => {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(0, h);
            for (let x = -step; x <= w + step; x += step) {
                const variance = Math.abs(Math.sin((x / step) * 1.7)) * 0.07;
                const treeH = h * (heightRatio + variance);
                ctx.lineTo(x + step * 0.5, baseY - treeH);
                ctx.lineTo(x + step, baseY);
            }
            ctx.lineTo(w, h);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        };

        drawTrees(h * 0.86, '#11221d', 0.6, Math.max(44, w * 0.055), 0.18);
        drawTrees(h * 0.99, '#06100d', 0.92, Math.max(34, w * 0.043), 0.28);
    }
}
