import Scene from '../../core/Scene.js';
import Logger from '../../utils/Logger.js';
import { INVENTORY_TOTAL_SLOTS } from '../../constants/inventory.js';

export default class CharacterSelectionScene extends Scene {
    constructor(game) {
        super(game);
        this.charSelectUI = null;
        this.user = null;
        this.profile = null;
        this.selectedCharacterId = 'father';
        this.previewAnimationFrame = null;
        this.previewRequestId = 0;
    }

    async enter(params) {
        Logger.info("[CharacterSelectionScene] Entered");
        this.game.ui?.hideHUD();
        this.game.ui?.hideAllPopups();
        this.user = params.user;

        // Optimize initial entry: read the lightweight profile first and only
        // fall back to backup inspection when the root profile is missing/stale.
        const profile = await this.game.net.getPlayerProfile?.(this.user.uid);
        if (profile?.name) {
            this.profile = profile;
        } else {
            const latestSnapshot = await this.game.net.getLatestProfileSnapshot?.(this.user.uid);
            this.profile = latestSnapshot?.profile || profile || null;
        }
        this.selectedCharacterId = this.normalizeCharacterId(this.profile?.characterId);

        this.createUI();

        // v0.00.62: Robust Audio Unlock
        if (this.game.sound) {
            const sound = this.game.sound;
            const isSuspended = !sound.ctx || sound.ctx.state === 'suspended';

            if (isSuspended) {
                const unlock = () => {
                    sound.initOrResume();
                    sound.resume().then(() => {
                        const bgmUrl = '/assets/data/music/bgm_intro.json';
                        // Use loadJSON correctly (it returns a promise)
                        this.game.resources.loadJSON(bgmUrl).then(data => {
                            this.game.sound.playBgm(data, 'bgm_intro');
                        }).catch(e => Logger.warn('BGM Load Failed', e));
                    });

                    window.removeEventListener('click', unlock);
                    window.removeEventListener('touchstart', unlock);
                    window.removeEventListener('keydown', unlock);
                };
                window.addEventListener('click', unlock);
                window.addEventListener('touchstart', unlock);
                window.addEventListener('keydown', unlock);
            } else {
                // Already running, just ensure BGM is correct if not already playing
                if (sound.currentBgmId !== 'bgm_intro') {
                    this.game.resources.loadJSON('/assets/data/music/bgm_intro.json').then(data => {
                        sound.playBgm(data, 'bgm_intro');
                    });
                }
            }
        }
    }

    async exit() {
        this.previewRequestId += 1;
        if (this.previewAnimationFrame) {
            cancelAnimationFrame(this.previewAnimationFrame);
            this.previewAnimationFrame = null;
        }
        if (this.charSelectUI) {
            this.charSelectUI.remove();
            this.charSelectUI = null;
        }
        // Failsafe: check DOM
        const existing = document.getElementById('char-select-ui');
        if (existing) existing.remove();
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

    normalizeCharacterId(characterId = 'father') {
        return characterId === 'yurika' ? 'yurika' : 'father';
    }

    getCharacterChoicesHTML() {
        const choices = [
            {
                id: 'father',
                name: this.t('char.character.father.name'),
                role: this.t('char.character.father.role')
            },
            {
                id: 'yurika',
                name: this.t('char.character.yurika.name'),
                role: this.t('char.character.yurika.role')
            }
        ];

        return `
            <div class="character-roster" role="radiogroup" aria-label="${this.escapeHtml(this.t('char.character.select'))}">
                ${choices.map((choice) => `
                    <button type="button"
                        class="character-choice ${this.selectedCharacterId === choice.id ? 'is-active' : ''}"
                        data-character-id="${choice.id}"
                        role="radio"
                        aria-checked="${this.selectedCharacterId === choice.id ? 'true' : 'false'}">
                        <span>${this.escapeHtml(choice.name)}</span>
                        <small>${this.escapeHtml(choice.role)}</small>
                    </button>
                `).join('')}
            </div>
        `;
    }

    bindCharacterChoiceEvents(previewSize = 200) {
        this.charSelectUI?.querySelectorAll('.character-choice').forEach((button) => {
            button.addEventListener('click', () => {
                this.selectedCharacterId = this.normalizeCharacterId(button.dataset.characterId);
                this.charSelectUI?.querySelectorAll('.character-choice').forEach((choiceButton) => {
                    const isActive = choiceButton.dataset.characterId === this.selectedCharacterId;
                    choiceButton.classList.toggle('is-active', isActive);
                    choiceButton.setAttribute('aria-checked', isActive ? 'true' : 'false');
                });
                if (this.game.sound) this.game.sound.playSfx('ui_click');
                this.updateCharacterConceptArt(this.selectedCharacterId);
                if (previewSize > 0) {
                    this.initCanvasPreview(previewSize, this.selectedCharacterId);
                }
            });
        });
    }

    getCharacterConceptSrc(characterId = this.selectedCharacterId) {
        const normalized = this.normalizeCharacterId(characterId);
        return normalized === 'yurika'
            ? '/assets/generated/characters/yurika_concept_fullbody.webp'
            : '/assets/generated/characters/father_concept_fullbody.webp';
    }

    updateCharacterConceptArt(characterId = this.selectedCharacterId) {
        const img = this.charSelectUI?.querySelector('#char-concept-art');
        if (!img) return;
        const normalized = this.normalizeCharacterId(characterId);
        img.src = this.getCharacterConceptSrc(normalized);
        img.alt = this.t(`char.character.${normalized}.name`);
        img.classList.toggle('is-yurika', normalized === 'yurika');
    }

    createUI() {
        // v0.00.03: Ensure previous UI is removed before creating a new one
        const existing = document.getElementById('char-select-ui');
        if (existing) existing.remove();

        this.charSelectUI = document.createElement('div');
        this.charSelectUI.id = 'char-select-ui';
        this.charSelectUI.className = 'scene-overlay yurika-char-scene';

        // v0.00.03: Toggle between Creation and Selection
        // profile.name check is more robust than just profile (which might be a stub)
        if (!this.profile || !this.profile.name) {
            this.showCreationUI();
        } else {
            this.showSelectionUI();
        }

        document.getElementById('game-container').appendChild(this.charSelectUI);
    }

    showCreationUI() {
        const suggestedName = this.escapeHtml((this.user?.displayName || '').substring(0, 8));

        this.charSelectUI.innerHTML = `
            <div class="scene-atmosphere" aria-hidden="true">
                <div class="forest-line forest-line-back"></div>
                <div class="forest-line forest-line-front"></div>
                <div class="cabin-silhouette is-near">
                    <div class="cabin-roof"></div>
                    <div class="cabin-body">
                        <span class="cabin-window"></span>
                    </div>
                </div>
                <div class="manastone-shards">
                    <span></span><span></span><span></span>
                </div>
            </div>

            <div class="char-card glass creation story-char-card">
                <div class="char-card-copy">
                    <div class="story-kicker">${this.escapeHtml(this.t('char.create.kicker'))}</div>
                    <h2 class="scene-title">${this.escapeHtml(this.t('char.create.title'))}</h2>
                    <p class="creation-desc">
                        ${this.escapeHtml(this.t('char.create.desc'))}
                    </p>
                </div>

                <div class="input-group">
                    <input type="text" id="name-input" maxlength="40"
                        value="${suggestedName}"
                        placeholder="${this.escapeHtml(this.t('char.create.placeholder'))}" autocomplete="off">
                    <div id="name-status" class="status-msg"></div>
                </div>

                <div class="character-preview small">
                    <div class="preview-frame-label">${this.escapeHtml(this.t('char.create.preview'))}</div>
                    <canvas id="char-preview-canvas" width="120" height="120"></canvas>
                </div>

                ${this.getCharacterChoicesHTML()}

                <div class="char-actions">
                    <button id="create-char-btn" class="action-btn primary">${this.escapeHtml(this.t('char.create.button'))}</button>
                    <button id="creation-logout-btn" class="action-btn secondary">${this.escapeHtml(this.t('char.create.cancel'))}</button>
                </div>
            </div>
        `;

        setTimeout(() => {
            this.initCanvasPreview(180, this.selectedCharacterId);
            this.bindCharacterChoiceEvents(180);
            document.getElementById('create-char-btn').onclick = () => this.handleCreateCharacter();
            document.getElementById('creation-logout-btn').onclick = () => this.game.auth.logout();

            // v0.00.44: Allow Enter key to submit character creation
            const input = document.getElementById('name-input');
            if (input) {
                input.focus();
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') this.handleCreateCharacter();
                });
            }
        }, 10);
    }

    showSelectionUI() {
        const name = this.escapeHtml(this.profile.name);
        const level = this.profile.level || 1;
        const manastone = Number(this.profile.manastone ?? this.profile.gold ?? 0) || 0;
        const expRate = ((this.profile?.exp || 0) / (this.profile?.maxExp || 100) * 100).toFixed(1);
        const manastoneText = this.escapeHtml(this.t('char.select.manastone', { amount: manastone.toLocaleString() }));

        this.charSelectUI.innerHTML = `
            <div class="scene-atmosphere" aria-hidden="true">
                <div class="forest-line forest-line-back"></div>
                <div class="forest-line forest-line-front"></div>
                <div class="cabin-silhouette is-near">
                    <div class="cabin-roof"></div>
                    <div class="cabin-body">
                        <span class="cabin-window"></span>
                    </div>
                </div>
                <div class="manastone-shards">
                    <span></span><span></span><span></span>
                </div>
            </div>

            <div class="char-card glass story-char-card">
                <div class="char-card-copy">
                    <div class="story-kicker">${this.escapeHtml(this.t('char.select.kicker'))}</div>
                    <h2 class="scene-title">${this.escapeHtml(this.t('char.select.title'))}</h2>
                    <p class="selection-desc">${this.escapeHtml(this.t('char.select.desc'))}</p>
                </div>

                <div class="character-select-summary">
                    <div class="char-info">
                        <div class="char-name">${name}</div>
                        <div class="char-level">${this.escapeHtml(this.t('char.select.level', { level, expRate }))}</div>
                        <div class="char-stats">
                            <span class="stat-chip">${manastoneText}</span>
                            <span class="stat-chip">${this.escapeHtml(this.t('char.select.origin'))}</span>
                        </div>
                    </div>
                </div>

                <div class="character-concept-stage" aria-hidden="true">
                    <img id="char-concept-art"
                        class="${this.selectedCharacterId === 'yurika' ? 'is-yurika' : ''}"
                        src="${this.getCharacterConceptSrc(this.selectedCharacterId)}"
                        alt="">
                </div>

                ${this.getCharacterChoicesHTML()}

                <div class="char-actions">
                    <button id="start-game-btn" class="action-btn primary">${this.escapeHtml(this.t('char.select.start'))}</button>
                    <button id="logout-btn" class="action-btn secondary">${this.escapeHtml(this.t('char.select.logout'))}</button>
                </div>
            </div>
        `;

        setTimeout(() => {
            this.updateCharacterConceptArt(this.selectedCharacterId);
            this.bindCharacterChoiceEvents(0);
            document.getElementById('start-game-btn').onclick = () => {
                // v0.00.57: SFX
                if (this.game.sound) this.game.sound.playSfx('ui_click');
                this.handleStartGame();
            }
            document.getElementById('logout-btn').onclick = () => {
                if (this.game.sound) this.game.sound.playSfx('ui_close');
                this.game.auth.logout();
            }
        }, 10);
    }

    async handleCreateCharacter() {
        const input = document.getElementById('name-input');
        const status = document.getElementById('name-status');
        const name = input.value.trim();

        if (name.length < 2) {
            status.textContent = this.t('char.status.nameTooShort');
            status.style.color = "#ff7675";
            return;
        }

        const btn = document.getElementById('create-char-btn');
        btn.disabled = true;
        status.textContent = this.t('char.status.checkingDuplicate');
        status.style.color = "#fdcb6e";

        const isRecovery = name.startsWith('##');

        if (isRecovery) {
            const targetUID = name.replace('##', '').trim();
            if (targetUID.length < 5) { // Minimum safety check
                status.textContent = this.t('char.status.invalidUid');
                status.style.color = "#ff7675";
                btn.disabled = false;
                return;
            }

            // v1.95: Advanced Recovery Mode (##UID)
            status.textContent = this.t('char.status.findingUid');
            status.style.color = "#fdcb6e";

            const sourceSnapshot = await this.game.net.getLatestProfileSnapshot?.(targetUID);
            const oldData = sourceSnapshot?.profile ? { profile: sourceSnapshot.profile } : null;
            if (sourceSnapshot?.profile) {
                const proceed = confirm(this.t('char.status.recoveryPrompt', {
                    name: oldData.profile.name,
                    level: oldData.profile.level
                }));
                if (proceed) {
                    const recoveryResult = await this.game.net.recoverPlayerProfile(this.user.uid, targetUID);
                    if (!recoveryResult.ok) {
                        if (recoveryResult.reason === 'source_older_than_target') {
                            status.textContent = this.t('char.status.recoveryBlocked');
                        } else {
                            status.textContent = this.t('char.status.recoveryError');
                        }
                        status.style.color = "#ff7675";
                        btn.disabled = false;
                        return;
                    }
                    this.profile = recoveryResult.profile;
                    status.textContent = this.t('char.status.recoveryDone');
                    status.style.color = "#55efc4";
                    setTimeout(() => this.createUI(), 1000);
                    return;
                }
            } else {
                status.textContent = this.t('char.status.uidMissing');
                status.style.color = "#ff7675";
                btn.disabled = false;
                return;
            }
        }

        // Standard Name Validation
        if (name.length > 8) {
            status.textContent = this.t('char.status.nameTooLong');
            status.style.color = "#ff7675";
            btn.disabled = false;
            return;
        }

        const isDuplicate = await this.game.net.checkNameDuplicate(name);
        if (isDuplicate) {
            status.textContent = this.t('char.status.duplicateName');
            status.style.color = "#ff7675";
            btn.disabled = false;
            return;
        }

        // Claim Name and Create Profile
        const success = await this.game.net.claimName(this.user.uid, name);
        if (success) {
            const initialProfile = {
                name: name,
                recoveryUid: this.user.uid,
                level: 1,
                exp: 0,
                maxExp: 100,
                manastone: 0,
                vitality: 1,
                intelligence: 3,
                wisdom: 2,
                statPoints: 0,
                hp: 30,
                maxHp: 30,
                mp: 50,
                maxMp: 50,
                inventory: new Array(INVENTORY_TOTAL_SLOTS).fill(null),
                equipment: { weapon: null },
                characterId: this.selectedCharacterId,
                questData: {
                    prologueCompleted: !!this.game.openingPrologueCompleted,
                    chapter1FatherOathCompleted: false,
                    basicTrainingCompleted: false,
                    slimeKills: 0,
                    slimeQuestClaimed: false,
                    slime30QuestClaimed: false,
                    introSlime30RewardClaimed: false,
                    introBossParticipated: false,
                    statInsightShown: {
                        vitality: false,
                        intelligence: false,
                        wisdom: false,
                        agility: false
                    },
                    slimeRepeatKills: 0, // v0.00.83+
                    bossKilled: false,
                    bossQuestClaimed: false,
                    bossClearCount: 0
                },
                createdAt: Date.now()
            };

            await this.game.net.savePlayerData(this.user.uid, initialProfile);
            this.profile = initialProfile;

            status.textContent = this.t('char.status.createDone');
            status.style.color = "#55efc4";

            // v0.00.03: Safety check before refreshing UI
            setTimeout(() => {
                if (this.game.sceneManager.currentScene === this) {
                    this.createUI();
                }
            }, 1000); // UI Refresh
        } else {
            status.textContent = this.t('char.status.createError');
            status.style.color = "#ff7675";
            btn.disabled = false;
        }
    }

    async initCanvasPreview(size = 200, characterId = this.selectedCharacterId) {
        const canvas = document.getElementById('char-preview-canvas');
        if (!canvas) return;
        if (this.previewAnimationFrame) {
            cancelAnimationFrame(this.previewAnimationFrame);
            this.previewAnimationFrame = null;
        }
        const requestId = ++this.previewRequestId;
        const ctx = canvas.getContext('2d');
        canvas.width = size;
        canvas.height = size;
        ctx.imageSmoothingEnabled = false;

        // Load SpriteSheet
        const normalizedCharacterId = this.normalizeCharacterId(characterId);
        const spriteSheet = await this.game.resources.loadCharacterSpriteSheet(true, normalizedCharacterId);
        if (requestId !== this.previewRequestId || !this.charSelectUI) return;
        const previewScale = normalizedCharacterId === 'yurika' ? 0.96 : 1.0;

        let frame = 0;
        let lastTime = 0;
        const fps = 8;
        const frameInterval = 1000 / fps;

        const animate = (time) => {
            if (!this.charSelectUI) return; // Exit if scene changed

            if (lastTime === 0 || time - lastTime > frameInterval) {
                lastTime = time;
                frame = (frame + 1) % 8; // Front row has 8 frames

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Row 1: Front Walking (8 frames)
                const row = 1;
                const frameCount = 8;
                const frameW = 256;
                const frameH = 256;

                const drawSize = Math.min(canvas.width, canvas.height) * previewScale;
                const drawX = (canvas.width - drawSize) / 2;
                const drawY = canvas.height - drawSize + (normalizedCharacterId === 'yurika' ? 4 : 0);

                ctx.drawImage(
                    spriteSheet,
                    (frame % frameCount) * frameW, row * frameH, frameW, frameH,
                    drawX, drawY, drawSize, drawSize
                );
            }
            this.previewAnimationFrame = requestAnimationFrame(animate);
        };
        this.previewAnimationFrame = requestAnimationFrame(animate);
    }

    async handleStartGame() {
        // v0.00.84: Default to cabin spawn (1500, 1900) for new players
        let startX = 1500;
        let startY = 1900;

        // v0.00.84: Correct coordinate path restoration (Fixed from savedData.p)
        if (this.profile) {
            if (typeof this.profile.x === 'number') startX = this.profile.x;
            if (typeof this.profile.y === 'number') startY = this.profile.y;
            this.profile.characterId = this.selectedCharacterId;
        }

        const localName = localStorage.getItem('yurika_player_name') || this.user.displayName || this.t('char.defaultName');

        // Add log to confirm profile data before Scene Change.
        Logger.debug('[CharSelect] Starting game with profile:', this.profile, 'at', startX, startY);

        await this.game.sceneManager.changeScene('world', {
            user: this.user,
            startX,
            startY,
            profile: {
                ...(this.profile || {}),
                name: this.profile?.name || localName,
                characterId: this.selectedCharacterId
            },
            localName
        });
    }

    async handleCharacterReset() {
        const msg = this.t('char.reset.confirm');
        if (!confirm(msg)) return;

        const p = this.profile;
        if (!p) return;

        // 1. Calculate Refunded Stat Points
        // Base Stats: Vit 1, Int 3, Wis 2, Agi 1
        const usedVit = Math.max(0, (p.vitality || 1) - 1);
        const usedInt = Math.max(0, (p.intelligence || 3) - 3);
        const usedWis = Math.max(0, (p.wisdom || 2) - 2);
        const usedAgi = Math.max(0, (p.agility || 1) - 1);

        const totalRefundedStats = usedVit + usedInt + usedWis + usedAgi;

        // 2. Calculate Refunded Manastone from Skills
        // Cost Formula: 300 * (2^(lv-1) - 1)
        let totalRefundedManastone = 0;
        const skills = p.skillLevels || { laser: 1, missile: 1, fireball: 1, shield: 1 };

        ['laser', 'missile', 'fireball'].forEach(skill => {
            const lv = skills[skill] || 1;
            if (lv > 1) {
                totalRefundedManastone += 300 * (Math.pow(2, lv - 1) - 1);
            }
        });

        // 3. Apply Changes
        p.statPoints = (p.statPoints || 0) + totalRefundedStats;
        p.manastone = Number(p.manastone ?? p.gold ?? 0) + totalRefundedManastone;

        // Reset Stats
        p.vitality = 1;
        p.intelligence = 3;
        p.wisdom = 2;
        p.agility = 1;

        // Recalculate Derived Stats (HP/MP)
        // HP = 20 + Vit*10
        // MP = 30 + Wis*10
        p.hp = 20 + (p.vitality * 10);
        p.maxHp = p.hp;
        p.mp = 30 + (p.wisdom * 10);
        p.maxMp = p.mp;

        // Reset Skills
        p.skillLevels = { laser: 1, missile: 1, fireball: 1, shield: 1 };

        // 4. Save and Update UI
        await this.game.net.savePlayerData(this.user.uid, p);
        alert(this.t('char.reset.done', {
            stats: totalRefundedStats,
            manastone: totalRefundedManastone
        }));
        this.showSelectionUI(); // Refresh UI to show updated manastone/stats (though stats hidden in selection)
    }

    render(ctx) {
        const w = this.game.canvas.width;
        const h = this.game.canvas.height;
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#101923');
        sky.addColorStop(0.5, '#091119');
        sky.addColorStop(1, '#030606');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#cfd9cf';
        ctx.beginPath();
        ctx.arc(w * 0.76, h * 0.16, Math.max(32, Math.min(w, h) * 0.065), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = '#07110d';
        ctx.globalAlpha = 0.88;
        ctx.beginPath();
        ctx.moveTo(0, h);
        const step = Math.max(34, w * 0.048);
        for (let x = -step; x <= w + step; x += step) {
            const peak = h * (0.66 + ((x / step) % 4) * 0.025);
            ctx.lineTo(x + step * 0.5, peak);
            ctx.lineTo(x + step, h * 0.96);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}
