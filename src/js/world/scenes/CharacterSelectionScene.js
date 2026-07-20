import Scene from '../../core/Scene.js';
import Logger from '../../utils/Logger.js';
import { INVENTORY_TOTAL_SLOTS } from '../../constants/inventory.js';

export default class CharacterSelectionScene extends Scene {
    constructor(game) {
        super(game);
        this.charSelectUI = null;
        this.user = null;
        this.profile = null;
        this.profileLoadError = null;
        this.previewAnimationFrame = null;
        this._enterGeneration = 0;
        this.startGameTransitioning = false;
    }

    _isEnterCurrent(generation, uid) {
        if (generation !== this._enterGeneration || this.user?.uid !== uid) return false;
        if (this.game?.auth && this.game.auth.currentUser?.uid !== uid) return false;
        if (this.game?.net?.playerId && this.game.net.playerId !== uid) return false;
        return true;
    }

    _getProfileRevision(profile = null) {
        const rawRevision = profile?._profileRevision
            ?? profile?.profileRevision
            ?? profile?._revision
            ?? profile?.revision
            ?? profile?.rev
            ?? 0;
        const revision = Number(rawRevision);
        return Number.isInteger(revision) && revision >= 0 ? revision : 0;
    }

    _cloneProfile(profile) {
        if (!profile || typeof profile !== 'object') return null;
        try {
            return JSON.parse(JSON.stringify(profile));
        } catch (error) {
            Logger.error('[CharacterSelectionScene] Failed to clone profile', error);
            return null;
        }
    }

    showProfileLoadError(error = null) {
        this.profileLoadError = error || new Error('profile_load_failed');
        const existing = document.getElementById('char-select-ui');
        if (existing) existing.remove();

        this.charSelectUI = document.createElement('div');
        this.charSelectUI.id = 'char-select-ui';
        this.charSelectUI.className = 'scene-overlay';
        this.charSelectUI.innerHTML = `
            <div class="char-card glass">
                <h2 class="scene-title">캐릭터 불러오기 실패</h2>
                <p class="creation-desc">캐릭터 정보를 불러오지 못했습니다.<br>연결을 확인한 뒤 다시 시도해주세요.</p>
                <div class="char-actions">
                    <button id="retry-profile-load-btn" class="action-btn primary">다시 시도</button>
                    <button id="load-error-logout-btn" class="action-btn secondary">로그아웃</button>
                </div>
            </div>
        `;
        document.getElementById('game-container').appendChild(this.charSelectUI);

        const retryButton = document.getElementById('retry-profile-load-btn');
        retryButton.onclick = () => {
            retryButton.disabled = true;
            retryButton.textContent = '불러오는 중...';
            this.enter({ user: this.user });
        };
        document.getElementById('load-error-logout-btn').onclick = () => this.game.auth.logout();
    }

    async enter(params) {
        Logger.info("[CharacterSelectionScene] Entered");
        const generation = ++this._enterGeneration;
        const user = params?.user || null;
        if (!user?.uid) return;
        this.game.ui?.hideHUD();
        this.game.ui?.hideAllPopups();
        this.user = user;
        this.startGameTransitioning = false;

        // Read the lightweight profile first, then compare it against recent
        // backups/recovery snapshots. Mobile rotation or an old client can leave
        // a newer timestamp on a regressed root profile, so "has name" is not
        // enough to trust the root snapshot.
        this.profileLoadError = null;
        let profile = null;
        let latestSnapshot = null;
        try {
            if (typeof this.game.net.getPlayerProfile !== 'function') {
                throw new Error('profile_reader_unavailable');
            }
            profile = await this.game.net.getPlayerProfile(user.uid, { throwOnError: true });
            if (!this._isEnterCurrent(generation, user.uid)) return;
            latestSnapshot = await this.game.net.getLatestProfileSnapshot?.(user.uid, {
                profile,
                throwOnError: true
            });
            if (!this._isEnterCurrent(generation, user.uid)) return;
        } catch (error) {
            if (!this._isEnterCurrent(generation, user.uid)) return;
            Logger.error('[CharacterSelectionScene] Failed to load player profile', error);
            this.profile = null;
            this.showProfileLoadError(error);
            return;
        }

        this.profile = latestSnapshot?.profile || profile || null;

        if (
            latestSnapshot?.profile
            && latestSnapshot.source !== 'profile'
            && this.game.net?._isProfileCandidateBetter?.(latestSnapshot, profile ? {
                profile,
                ts: Number(profile.ts || 0),
                source: 'profile'
            } : null)
        ) {
            const repairResult = await this.game.net.savePlayerData(user.uid, latestSnapshot.profile, false, {
                expectedRevision: this._getProfileRevision(profile),
                forceImmediate: true,
                allowMissingProfileRepair: !profile,
                backupReason: `auto_repair_from_${latestSnapshot.source}`,
                sourceUid: latestSnapshot.latestUid || this.user.uid,
                sourceTs: latestSnapshot.ts || latestSnapshot.profile.ts || Date.now(),
                saveReason: 'character_select_profile_auto_repair'
            });
            if (!this._isEnterCurrent(generation, user.uid)) return;
            if (repairResult?.ok && repairResult.profile) {
                this.profile = repairResult.profile;
            } else {
                const currentProfile = repairResult?.currentProfile || null;
                this.profile = currentProfile || latestSnapshot.profile || profile || null;
                if (!this.profile) {
                    const error = repairResult?.error || new Error(repairResult?.reason || 'profile_auto_repair_failed');
                    Logger.error('[CharacterSelectionScene] Failed to repair player profile', error);
                    this.showProfileLoadError(error);
                    return;
                }
                Logger.warn('[CharacterSelectionScene] Profile auto repair was deferred; continuing with the best available profile snapshot', {
                    reason: repairResult?.reason || 'profile_auto_repair_deferred',
                    source: latestSnapshot.source || 'unknown'
                });
            }
        }

        if (!this._isEnterCurrent(generation, user.uid)) return;
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

    createUI() {
        if (this.profileLoadError) {
            this.showProfileLoadError(this.profileLoadError);
            return;
        }
        // v0.00.03: Ensure previous UI is removed before creating a new one
        const existing = document.getElementById('char-select-ui');
        if (existing) existing.remove();

        this.charSelectUI = document.createElement('div');
        this.charSelectUI.id = 'char-select-ui';
        this.charSelectUI.className = 'scene-overlay';

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
        this.charSelectUI.innerHTML = `
            <div class="char-card glass creation">
                <h2 class="scene-title">캐릭터 생성</h2>
                <p class="creation-desc">유리카 온라인에 오신 것을 환영합니다!<br>모험에서 사용할 이름을 입력해주세요.</p>
                
                <div class="input-group">
                    <input type="text" id="name-input" maxlength="40" 
                        value="${(this.user?.displayName || '').substring(0, 8)}" 
                        placeholder="이름 (복구 시 ##UID 입력)" autocomplete="off">
                    <div id="name-status" class="status-msg"></div>
                </div>

                <div class="character-preview small">
                    <canvas id="char-preview-canvas" width="120" height="120"></canvas>
                </div>

                <div class="char-actions">
                    <button id="create-char-btn" class="action-btn primary">캐릭터 생성</button>
                    <button id="creation-logout-btn" class="action-btn secondary">취소</button>
                </div>
            </div>
        `;

        setTimeout(() => {
            this.initCanvasPreview(120);
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
        const name = this.profile.name;
        const level = this.profile.level || 1;
        const manastone = Number(this.profile.manastone ?? this.profile.gold ?? 0) || 0;

        this.charSelectUI.innerHTML = `
            <div class="char-card glass">
                <h2 class="scene-title">캐릭터 선택</h2>
                
                <div class="character-preview">
                    <div class="char-avatar-container">
                        <div class="char-glow"></div>
                        <canvas id="char-preview-canvas" width="200" height="200"></canvas>
                    </div>
                    <div class="char-info">
                        <div class="char-name">${name}</div>
                        <div class="char-level">Lv.${level} 메이지 (${((this.profile?.exp || 0) / (this.profile?.maxExp || 100) * 100).toFixed(1)}%)</div>
                        <div class="char-stats">
                            <span>💎 ${manastone.toLocaleString()} 마석</span>
                        </div>
                    </div>
                </div>

                <div class="char-actions">
                    <button id="start-game-btn" class="action-btn primary">게임 시작</button>
                    <button id="logout-btn" class="action-btn secondary">로그아웃</button>
                </div>
            </div>
        `;

        setTimeout(() => {
            this.initCanvasPreview(200);
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
            status.textContent = "이름은 2자 이상이어야 합니다.";
            status.style.color = "#ff7675";
            return;
        }

        const btn = document.getElementById('create-char-btn');
        btn.disabled = true;
        status.textContent = "이름 중복 확인 중...";
        status.style.color = "#fdcb6e";

        const isRecovery = name.startsWith('##');
        if (this.game.net?.playerId !== this.user?.uid) {
            try {
                await this.game.net?.connect?.(this.user);
            } catch (error) {
                Logger.error('[CharacterSelectionScene] Failed to prepare network identity for character creation', error);
            }
        }
        if (this.game.net?.playerId !== this.user?.uid) {
            Logger.error('[CharacterSelectionScene] Character creation blocked by network uid mismatch', {
                authUid: this.user?.uid || null,
                netPlayerId: this.game.net?.playerId || null
            });
            status.textContent = "접속 정보가 맞지 않아 캐릭터를 저장할 수 없습니다. 새로고침 후 다시 시도해주세요.";
            status.style.color = "#ff7675";
            btn.disabled = false;
            return;
        }

        if (isRecovery) {
            const targetUID = name.replace('##', '').trim();
            if (targetUID.length < 5) { // Minimum safety check
                status.textContent = "올바른 UID를 입력해주세요.";
                status.style.color = "#ff7675";
                btn.disabled = false;
                return;
            }

            // v1.95: Advanced Recovery Mode (##UID)
            status.textContent = "UID로 계정 데이터를 찾는 중...";
            status.style.color = "#fdcb6e";

            let sourceSnapshot = null;
            try {
                sourceSnapshot = await this.game.net.getLatestProfileSnapshot?.(targetUID, {
                    throwOnError: true
                });
            } catch (error) {
                Logger.error('[CharacterSelectionScene] Recovery source lookup failed', error);
                status.textContent = "복구 데이터를 조회하지 못했습니다. 연결을 확인한 뒤 다시 시도해주세요.";
                status.style.color = "#ff7675";
                btn.disabled = false;
                return;
            }
            const oldData = sourceSnapshot?.profile ? { profile: sourceSnapshot.profile } : null;
            if (sourceSnapshot?.profile) {
                const proceed = confirm(`기존 계정(${oldData.profile.name}, Lv.${oldData.profile.level}) 데이터를 발견했습니다!\n현재 계정으로 복구하시겠습니까?`);
                if (proceed) {
                    const recoveryResult = await this.game.net.recoverPlayerProfile(this.user.uid, targetUID);
                    if (!recoveryResult.ok) {
                        if (recoveryResult.reason === 'source_older_than_target') {
                            status.textContent = "복구 대상이 현재 계정보다 오래된 데이터라 복구를 막았습니다.";
                        } else {
                            status.textContent = "복구 중 오류가 발생했습니다.";
                        }
                        status.style.color = "#ff7675";
                        btn.disabled = false;
                        return;
                    }
                    this.profile = recoveryResult.profile;
                    status.textContent = "복구 완료! 잠시만 기다려주세요...";
                    status.style.color = "#55efc4";
                    setTimeout(() => this.createUI(), 1000);
                    return;
                }
            } else {
                status.textContent = "존재하지 않는 UID 데이터입니다.";
                status.style.color = "#ff7675";
                btn.disabled = false;
                return;
            }
        }

        // Standard Name Validation
        if (name.length > 8) {
            status.textContent = "이름은 최대 8자까지만 가능합니다.";
            status.style.color = "#ff7675";
            btn.disabled = false;
            return;
        }

        const isDuplicate = await this.game.net.checkNameDuplicate(name);
        if (isDuplicate) {
            status.textContent = "이미 존재하는 이름입니다.";
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
                agility: 1,
                statPoints: 0,
                hp: 30,
                maxHp: 30,
                mp: 50,
                maxMp: 50,
                inventory: new Array(INVENTORY_TOTAL_SLOTS).fill(null),
                equipment: { weapon: null },
                questData: {
                    prologueCompleted: false,
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
                questState: {
                    schemaVersion: 2,
                    active: {},
                    completed: {},
                    flags: {},
                    recommendedZoneId: null,
                    lastEventAt: 0
                },
                createdAt: Date.now()
            };

            const saveResult = await this.game.net.savePlayerData(this.user.uid, initialProfile, false, {
                requireMissingProfile: true,
                expectedRevision: 0,
                forceImmediate: true,
                saveReason: 'character_creation',
                backupReason: 'character_creation'
            });

            if (!saveResult?.ok || !saveResult.profile) {
                Logger.error('[CharacterSelectionScene] Character profile creation failed', {
                    reason: saveResult?.reason || 'unknown',
                    currentRevision: saveResult?.currentRevision ?? null,
                    hasCurrentProfile: !!saveResult?.currentProfile,
                    auxiliaryFailures: saveResult?.auxiliaryFailures
                        ? Object.keys(saveResult.auxiliaryFailures)
                        : []
                });
                let existingProfile = saveResult?.currentProfile
                    || (saveResult?.reason === 'profile_exists' ? saveResult?.profile : null)
                    || null;
                let profileReadSucceeded = !!existingProfile;
                if (!profileReadSucceeded && typeof this.game.net.getPlayerProfile === 'function') {
                    try {
                        existingProfile = await this.game.net.getPlayerProfile(this.user.uid, { throwOnError: true });
                        profileReadSucceeded = true;
                    } catch (error) {
                        Logger.warn('[CharacterSelectionScene] Could not verify profile after creation failure', error);
                    }
                }

                if (
                    profileReadSucceeded
                    && existingProfile?.name !== name
                    && typeof this.game.net.releaseNameClaim === 'function'
                ) {
                    try {
                        await this.game.net.releaseNameClaim(this.user.uid, name);
                    } catch (error) {
                        Logger.warn('[CharacterSelectionScene] Failed to release name claim', error);
                    }
                }

                if (existingProfile?.name) {
                    this.profile = existingProfile;
                    status.textContent = '기존 캐릭터 정보를 불러왔습니다.';
                    status.style.color = '#55efc4';
                    setTimeout(() => {
                        if (this.game.sceneManager.currentScene === this) this.createUI();
                    }, 500);
                    return;
                }

                status.textContent = saveResult?.reason === 'profile_exists'
                    ? '기존 캐릭터 정보를 다시 불러와주세요.'
                    : '캐릭터 저장에 실패했습니다. 다시 시도해주세요.';
                status.style.color = '#ff7675';
                btn.disabled = false;
                return;
            }

            this.profile = saveResult.profile;

            status.textContent = "캐릭터 생성 완료!";
            status.style.color = "#55efc4";

            // v0.00.03: Safety check before refreshing UI
            setTimeout(() => {
                if (this.game.sceneManager.currentScene === this) {
                    this.createUI();
                }
            }, 1000); // UI Refresh
        } else {
            status.textContent = "생성 처리 중 오류가 발생했습니다.";
            status.style.color = "#ff7675";
            btn.disabled = false;
        }
    }

    async initCanvasPreview(size = 200) {
        const canvas = document.getElementById('char-preview-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = size;
        canvas.height = size;

        // Load SpriteSheet
        const spriteSheet = await this.game.resources.loadCharacterSpriteSheet(true);

        let frame = 0;
        let lastTime = 0;
        const fps = 8;
        const frameInterval = 1000 / fps;

        const animate = (time) => {
            if (!this.charSelectUI) return; // Exit if scene changed

            if (time - lastTime > frameInterval) {
                lastTime = time;
                frame = (frame + 1) % 8; // Front row has 8 frames

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Row 1: Front Walking (8 frames)
                const row = 1;
                const frameCount = 8;
                const frameW = 256;
                const frameH = 256;

                // v0.00.03: Centering adjustment based on user feedback
                // offsetY = 0 was "too high" after previous shift. 
                // Let's use a subtle offset that keeps them grounded but visible.
                const drawSize = canvas.width;
                const offsetY = drawSize * 0.05; // Slightly down from top

                ctx.drawImage(
                    spriteSheet,
                    (frame % frameCount) * frameW, row * frameH, frameW, frameH,
                    0, offsetY, drawSize, drawSize
                );
            }
            this.previewAnimationFrame = requestAnimationFrame(animate);
        };
        this.previewAnimationFrame = requestAnimationFrame(animate);
    }

    async handleStartGame() {
        if (this.startGameTransitioning) return false;
        this.startGameTransitioning = true;
        const startButton = document.getElementById('start-game-btn');
        if (startButton) startButton.disabled = true;

        // v0.00.84: Default to the center of the starting field for new players
        let startX = 1600;
        let startY = 1600;

        // v0.00.84: Correct coordinate path restoration (Fixed from savedData.p)
        if (this.profile) {
            if (typeof this.profile.x === 'number') startX = this.profile.x;
            if (typeof this.profile.y === 'number') startY = this.profile.y;
        }

        const localName = localStorage.getItem('yurika_player_name') || this.user.displayName || "유리카";

        // Add log to confirm profile data before Scene Change without dumping the full
        // high-level profile object into DevTools/PWA consoles.
        Logger.debug('[CharSelect] Starting game with profile:', {
            level: this.profile?.level || 1,
            inventorySlots: Array.isArray(this.profile?.inventory) ? this.profile.inventory.filter(Boolean).length : 0,
            hasWeapon: !!this.profile?.equipment?.weapon,
            currentZoneId: this.profile?.currentZoneId || this.profile?.mapId || 'zone_1',
            ts: this.profile?.ts || 0
        }, 'at', startX, startY);

        try {
            await this.game.sceneManager.changeScene('world', {
                user: this.user,
                startX,
                startY,
                profile: this.profile,
                localName
            });
            return true;
        } catch (error) {
            this.startGameTransitioning = false;
            if (startButton) startButton.disabled = false;
            throw error;
        }
    }

    async handleCharacterReset() {
        const msg = "레벨을 제외한 마석/스텟/스킬이 초기화됩니다.\n사용된 마석/스텟은 반환됩니다.\n\n계속하시겠습니까?";
        if (!confirm(msg)) return;

        const p = this.profile;
        if (!p) return;
        const nextProfile = this._cloneProfile(p);
        if (!nextProfile) return;
        const expectedRevision = this._getProfileRevision(p);

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
        nextProfile.statPoints = (nextProfile.statPoints || 0) + totalRefundedStats;
        nextProfile.manastone = Number(nextProfile.manastone ?? nextProfile.gold ?? 0) + totalRefundedManastone;
        if (Array.isArray(nextProfile.inventory)) {
            nextProfile.inventory[0] = {
                ...(nextProfile.inventory[0] || {}),
                type: 'manastone',
                amount: nextProfile.manastone,
                icon: '💎',
                name: '마석',
                stackable: true,
                description: '상점과 강화에 사용하는 기본 화폐입니다.'
            };
        }

        // Reset Stats
        nextProfile.vitality = 1;
        nextProfile.intelligence = 3;
        nextProfile.wisdom = 2;
        nextProfile.agility = 1;

        // Recalculate Derived Stats (HP/MP)
        // HP = 20 + Vit*10
        // MP = 30 + Wis*10
        nextProfile.hp = 20 + (nextProfile.vitality * 10);
        nextProfile.maxHp = nextProfile.hp;
        nextProfile.mp = 30 + (nextProfile.wisdom * 10);
        nextProfile.maxMp = nextProfile.mp;

        // Reset Skills
        nextProfile.skillLevels = { laser: 1, missile: 1, fireball: 1, shield: 1 };

        // 4. Save and Update UI
        const saveResult = await this.game.net.savePlayerData(this.user.uid, nextProfile, false, {
            allowDestructiveProfileWrite: true,
            bypassProfileRegressionGuard: true,
            expectedRevision,
            forceImmediate: true,
            backupReason: 'character_selection_reset',
            saveReason: 'character_selection_reset'
        });
        if (!saveResult?.ok) {
            if (saveResult?.reason === 'profile_conflict') {
                alert('다른 진행 내용이 먼저 저장되었습니다. 캐릭터를 다시 불러온 뒤 재시도해주세요.');
                return;
            }
            throw saveResult?.error || new Error(saveResult?.reason || 'character_selection_reset_failed');
        }
        if (!saveResult.profile) {
            throw new Error('character_selection_reset_missing_profile');
        }
        this.profile = saveResult.profile;
        alert(`초기화 완료!\n반환된 스텟: ${totalRefundedStats}\n반환된 마석: ${totalRefundedManastone}`);
        this.showSelectionUI(); // Refresh UI to show updated manastone/stats (though stats hidden in selection)
    }

    render(ctx) {
        const w = this.game.canvas.width;
        const h = this.game.canvas.height;
        ctx.fillStyle = '#1e272e';
        ctx.fillRect(0, 0, w, h);
    }
}
