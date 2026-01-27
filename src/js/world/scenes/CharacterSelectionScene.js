import Scene from '../../core/Scene.js';
import Logger from '../../utils/Logger.js';

export default class CharacterSelectionScene extends Scene {
    constructor(game) {
        super(game);
        this.charSelectUI = null;
        this.user = null;
        this.profile = null;
    }

    async enter(params) {
        Logger.info("[CharacterSelectionScene] Entered");
        this.user = params.user;

        // Fetch User Data from Firestore/Realtime DB
        const savedData = await this.game.net.getPlayerData(this.user.uid);
        this.profile = savedData ? savedData.profile : null;

        this.createUI();
    }

    async exit() {
        if (this.charSelectUI) {
            this.charSelectUI.remove();
            this.charSelectUI = null;
        }
        // Failsafe: check DOM
        const existing = document.getElementById('char-select-ui');
        if (existing) existing.remove();
    }

    createUI() {
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
        }, 10);
    }

    showSelectionUI() {
        const name = this.profile.name;
        const level = this.profile.level || 1;
        const gold = this.profile.gold || 0;

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
                            <span>💰 ${gold.toLocaleString()} Gold</span>
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
            document.getElementById('start-game-btn').onclick = () => this.handleStartGame();
            document.getElementById('logout-btn').onclick = () => this.game.auth.logout();
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

            const oldData = await this.game.net.getPlayerData(targetUID);
            if (oldData && oldData.profile) {
                const proceed = confirm(`기존 계정(${oldData.profile.name}, Lv.${oldData.profile.level}) 데이터를 발견했습니다!\n현재 계정으로 복구하시겠습니까?`);
                if (proceed) {
                    await this.game.net.savePlayerData(this.user.uid, oldData.profile);
                    this.profile = oldData.profile;
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
                level: 1,
                exp: 0,
                maxExp: 100,
                gold: 0,
                vitality: 1,
                intelligence: 3,
                wisdom: 2,
                statPoints: 0,
                hp: 30,
                maxHp: 30,
                mp: 50,
                maxMp: 50,
                questData: {
                    slimeKills: 0,
                    slimeQuestClaimed: false,
                    bossKilled: false,
                    bossQuestClaimed: false
                },
                createdAt: Date.now()
            };

            await this.game.net.savePlayerData(this.user.uid, initialProfile);
            this.profile = initialProfile;

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
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    async handleStartGame() {
        // ... (rest of the file remains same)
        // Prepare data for WorldScene
        let startX = this.game.zone.width / 2;
        let startY = this.game.zone.height / 2;

        const savedData = await this.game.net.getPlayerData(this.user.uid);
        if (savedData && savedData.p) {
            startX = savedData.p[0];
            startY = savedData.p[1];
        }

        const localName = localStorage.getItem('yurika_player_name') || this.user.displayName || "유리카";

        // Add log to confirm profile data before Scene Change.
        console.log('[CharSelect] Starting game with profile:', this.profile);

        await this.game.sceneManager.changeScene('world', {
            user: this.user,
            startX,
            startY,
            profile: this.profile,
            localName
        });
    }

    async handleCharacterReset() {
        const msg = "레벨을 제외한 골드/스텟/스킬이 초기화됩니다.\n사용된 골드/스텟은 반환됩니다.\n\n계속하시겠습니까?";
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

        // 2. Calculate Refunded Gold from Skills
        // Cost Formula: 300 * (2^(lv-1) - 1)
        let totalRefundedGold = 0;
        const skills = p.skillLevels || { laser: 1, missile: 1, fireball: 1, shield: 1 };

        ['laser', 'missile', 'fireball'].forEach(skill => {
            const lv = skills[skill] || 1;
            if (lv > 1) {
                totalRefundedGold += 300 * (Math.pow(2, lv - 1) - 1);
            }
        });

        // 3. Apply Changes
        p.statPoints = (p.statPoints || 0) + totalRefundedStats;
        p.gold = (p.gold || 0) + totalRefundedGold;

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
        alert(`초기화 완료!\n반환된 스텟: ${totalRefundedStats}\n반환된 골드: ${totalRefundedGold}`);
        this.showSelectionUI(); // Refresh UI to show updated gold/stats (though stats hidden in selection)
    }

    render(ctx) {
        const w = this.game.canvas.width;
        const h = this.game.canvas.height;
        ctx.fillStyle = '#1e272e';
        ctx.fillRect(0, 0, w, h);
    }
}
