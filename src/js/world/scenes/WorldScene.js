import Scene from '../../core/Scene.js';
import Logger from '../../utils/Logger.js';
import Player from '../../entities/Player.js';
import RemotePlayer from '../../entities/RemotePlayer.js';
import { Projectile } from '../../entities/Projectile.js';
import SkillRenderer from '../../skills/renderers/SkillRenderer.js';

export default class WorldScene extends Scene {
    constructor(game) {
        super(game);
        this.camera = game.camera;
        this.monsterManager = game.monsterManager;
        this.ui = game.ui;
        this.net = game.net;
        this.resources = game.resources;
        this.input = game.input;

        this.player = null;
        this.remotePlayers = new Map();
        this.floatingTexts = [];
        this.sparks = [];
        this.projectiles = [];
        this.explosions = []; // v1.99.15: Visual-only explosions
        this.time = 0;

        // v0.00.22: Off-screen entity culling
        this.minimapUpdateTimer = 0;
        this.minimapUpdateInterval = 0.2;
        this.hudUpdateTimer = 0;
        this.hudUpdateInterval = 0.05;
        this.viewMargin = 500; // v0.00.24: Increased for smoother player sync
        this._lastLandscapeFramingOffsetY = 0;
        this.remoteOffscreenUpdateInterval = 0;
        this.transientSyncSuppressedUntil = 0;
        this.transientSyncResumeGraceMs = 900;

        // v0.33.0: Monster Attack Queue
        this.monsterMissileQueue = [];
        this.monsterMissileTimer = 0;
        this.safeZone = null;
        this.zoneSpawnRules = [];
        this.zoneCatalog = [];
        this.isZoneTransitioning = false;
        this.zoneTransitionToken = 0;
        this._activeZoneTransitionPromise = null;
        this._handleHostChanged = null;
        this.profileIdleSaveDelayMs = 3000;
        this.profileIdleSaveMinIntervalMs = 8000;
        this.profileIdleSaveMinDistance = 6;
        this._profileIdleLastMovingAt = 0;
        this._profileIdleSavePending = false;
        this._profileIdleSaveInFlight = false;
        this._profileIdleLastSavedAt = 0;
        this._profileIdleLastSavedPosition = null;
    }

    shouldFreezeWorldForModalUi() {
        return !!this.ui?.isPaused && !this.net?.isSharedFieldActive?.();
    }

    /**
     * v0.00.22: Check if entity is within camera viewport + margin
     */
    isOnScreen(entity) {
        if (!entity || !this.camera) return true; // Default to on-screen if no camera
        const cam = this.camera;
        const vw = (this.game.canvas.width / this.game.dpr) / this.game.zoom;
        const vh = (this.game.canvas.height / this.game.dpr) / this.game.zoom;
        const margin = this.viewMargin;

        const ex = entity.x + (entity.width || 0) / 2;
        const ey = entity.y + (entity.height || 0) / 2;

        return ex >= cam.x - margin && ex <= cam.x + vw + margin &&
            ey >= cam.y - margin && ey <= cam.y + vh + margin;
    }

    onPointerDown(e) {
        const isCoarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches || navigator.maxTouchPoints > 0;
        if (isCoarsePointer) return;
        if (!this.player || !this.camera) return;
        if (this.ui?.isPaused || this.player.isDead || this.player.isDying) return;
        if (this.player.isChanneling) return;
        if (typeof e.button === 'number' && e.button !== 0) return;

        const tutorial = this.game.tutorial;
        if (tutorial?.activeTutorial) {
            const canMove = ['MOVE_UP', 'MOVE_DOWN', 'MOVE_LEFT', 'MOVE_RIGHT']
                .some((action) => tutorial.isActionAllowed?.(action));
            if (!canMove) return;
        }

        const rect = this.game.canvas?.getBoundingClientRect?.();
        if (!rect) return;

        const clientX = Number.isFinite(e.clientX) ? e.clientX : null;
        const clientY = Number.isFinite(e.clientY) ? e.clientY : null;
        if (clientX === null || clientY === null) return;

        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const worldX = this.camera.x + (localX / this.game.zoom);
        const worldY = this.camera.y + (localY / this.game.zoom);

        this.player.setMoveTarget(
            worldX - (this.player.width / 2),
            worldY - (this.player.height / 2)
        );
    }

    async enter(params) {
        Logger.info("[WorldScene] Entering game world...");
        const user = params.user;
        const profile = params.profile || null;
        const localName = params.localName;
        this.ui?.showHUD();
        this.remotePlayers.clear();
        this.monsterManager?.clearAll?.({ preserveNetwork: true });

        // v0.35.0: Ensure Story Fade is reset to prevent black screen
        if (this.game.story) {
            this.game.story.resetFade();
        }

        // v0.00.02: Restore asset loading which was cut from main.js
        if (this.game.updateLoading) this.game.updateLoading('월드 데이터 다운로드 중...', 40);

        // 1. Load the saved field when it is still unlocked. Legacy profiles default to zone_1.
        this.zoneCatalog = await this.game.zone.loadZoneCatalog();
        const requestedZoneId = profile?.currentZoneId || profile?.mapId || 'zone_1';
        const requestedZoneMeta = this.game.zone.getZoneMeta(requestedZoneId);
        const profileLevel = Math.max(1, Number(profile?.level || 1));
        const initialZoneId = requestedZoneMeta && profileLevel >= Number(requestedZoneMeta.requiredLevel || 1)
            ? requestedZoneId
            : 'zone_1';
        const zoneData = await this.game.zone.loadZone(initialZoneId);
        if (!zoneData || zoneData.id !== initialZoneId) {
            throw new Error(`Initial zone load mismatch: requested=${initialZoneId}, loaded=${zoneData?.id || 'none'}`);
        }
        this._applyZoneData(zoneData, { clearExisting: true, primeSpawn: false });

        try {
            await this.resources.loadImage('/src/assets/character.webp');
        } catch (e) {
            Logger.error('Failed to load character sprite', e);
        }

        const defaultSpawn = this.game.zone.getSpawnPoint('default');
        const startX = Number.isFinite(params.startX) ? params.startX : defaultSpawn.x;
        const startY = Number.isFinite(params.startY) ? params.startY : defaultSpawn.y;

        // v1.99.12: Load FULL sprite sheet (preview loaded only partial)
        await this.resources.loadCharacterSpriteSheet();

        // 5. Load Character Definition (Warrior Default)
        // TODO: Select class based on user profile or selection
        let charDef = null;
        if (this.game.characterData) {
            charDef = await this.game.characterData.loadDefinition('wizard');
        }

        // Spawn Player
        this.player = new Player(startX, startY, localName, charDef);
        this.player.id = user.uid;
        this.player.currentZoneId = initialZoneId;
        this.player.mapPositions = profile?.mapPositions && typeof profile.mapPositions === 'object'
            ? { ...profile.mapPositions }
            : {};
        const pendingRewardNormalization = this.player.normalizePendingItemRewards?.(profile?.pendingItemRewards || [])
            || { changed: false, count: 0 };
        this.player.claimedRewardIds = Array.isArray(profile?.claimedRewardIds)
            ? profile.claimedRewardIds.filter((id) => typeof id === 'string' && id).slice(-128)
            : [];
        this.game.localPlayer = this.player; // Global reference for UIManager / MonsterAI
        let shouldRecoverFromStoredDeath = false;


        if (profile) {
            Logger.debug('[WorldScene] Loading Player Profile:', {
                level: profile.level || 1,
                inventorySlots: Array.isArray(profile.inventory) ? profile.inventory.filter(Boolean).length : 0,
                pendingRewards: Array.isArray(profile.pendingItemRewards) ? profile.pendingItemRewards.length : 0,
                currentZoneId: profile.currentZoneId || profile.mapId || 'zone_1',
                ts: profile.ts || 0
            });
            const hasLegacyGoldField = Object.prototype.hasOwnProperty.call(profile, 'gold');
            const hasLegacyGoldInventory = Array.isArray(profile.inventory) && profile.inventory[0]?.type === 'gold';
            const needsLegacyCurrencyMigration = hasLegacyGoldField || hasLegacyGoldInventory;
            this.player.level = profile.level || 1;
            this.player.exp = profile.exp || 0;
            this.player.maxExp = profile.maxExp || Math.floor(100 * Math.pow(1.5, this.player.level - 1)); // v0.00.03: Restore maxExp or recalculate
            this.player.manastone = Number(profile.manastone ?? profile.gold ?? 0) || 0;
            this.player.vitality = profile.vitality || 1;
            this.player.intelligence = profile.intelligence || 3;
            this.player.wisdom = profile.wisdom || 2;
            this.player.agility = profile.agility || 1;
            this.player.statPoints = profile.statPoints || 0;
            this.player.skillLevels = profile.skillLevels || { laser: 1, missile: 1, fireball: 1, shield: 1 };
            this.player.autoAttackEnabled = !!profile.autoAttackEnabled;
            this.player.name = profile.name || localName || user.displayName || "유리카";
            this.player.uiLayout = profile.uiLayout || null;
            this.player.clientSettings = profile.clientSettings || null;
            this.player.itemCooldowns = profile.itemCooldowns && typeof profile.itemCooldowns === 'object'
                ? { ...profile.itemCooldowns }
                : {};
            this.player.recoveryUid = profile.recoveryUid || user.uid;

            // v0.00.15: Restore Hostility
            // Support both Object (new) and Array (old/broken) formats specifically for robustness
            if (profile.hostility) {
                if (Array.isArray(profile.hostility)) {
                    // Try to recover if it really is an array (legacy)
                    try { this.player.hostileTargets = new Map(profile.hostility); } catch (e) { }
                } else if (typeof profile.hostility === 'object') {
                    // Standard Object format
                    Logger.debug('[WorldScene] Restoring Hostility from Object:', profile.hostility);
                    this.player.hostileTargets = new Map(Object.entries(profile.hostility));
                }
                this.player.hostileTargets = new Map(
                    Array.from(this.player.hostileTargets.entries())
                        .filter(([, entry]) => entry?.duel !== true)
                );
                // v0.00.15: Force UI update
                if (this.ui) this.ui.updateHostilityUI();
            } else {
                Logger.debug('[WorldScene] No Hostility Data found in profile');
            }

            if (profile.questData) {
                Logger.debug('[WorldScene] Restoring Quest Data:', profile.questData);
            } else {
                Logger.warn('[WorldScene] No Quest Data found in profile.');
            }

            this.player.questData = { ...this.player.questData, ...(profile.questData || {}) };
            this.player.questState = {
                ...(this.player.questState || {}),
                ...(profile.questState || {})
            };
            if (!this.player.questData.introSlime30RewardClaimed
                && (
                    !!this.player.questData.slime30QuestClaimed
                    || !!this.player.questData.bossQuestClaimed
                    || (this.player.questData.bossClearCount || 0) > 0
                )) {
                this.player.questData.introSlime30RewardClaimed = true;
                this.player.saveProfilePatch?.(['questData'], {
                    debounceMs: 0,
                    reason: 'normalize_intro_slime30_reward_flag'
                });
            }
            if (
                this.player.questData.introBossParticipated
                && (
                    !!this.player.questData.bossQuestClaimed
                    || (this.player.questData.bossClearCount || 0) > 0
                )
            ) {
                this.player.questData.introBossParticipated = false;
            }
            const inventoryNormalizationResult = this.player.normalizeInventoryState(profile.inventory, profile.equipment);

            // v2.4: Restore tutorial completion before intro flow resumes.
            if (this.game.tutorial) {
                if (this.player.questData.basicTrainingCompleted) {
                    this.game.tutorial.completedTutorials.add('basic_training');
                } else {
                    this.game.tutorial.completedTutorials.delete('basic_training');
                }
            }

            // v2.2: Sync to QuestManager
            if (this.game.quests) {
                this.game.quests.restoreFromLegacy(this.player.questData, this.player.questState);
            }

            this.player.refreshStats();
            if (typeof profile.hp === 'number') {
                const restoredHp = Math.min(this.player.maxHp, Math.max(0, Number(profile.hp) || 0));
                if (restoredHp <= 0) {
                    shouldRecoverFromStoredDeath = true;
                    this.player.hp = this.player.maxHp;
                    this.player.mp = this.player.maxMp;
                } else {
                    this.player.hp = restoredHp;
                }
            }
            if (!shouldRecoverFromStoredDeath && typeof profile.mp === 'number') {
                this.player.mp = Math.min(this.player.maxMp, Math.max(0, Number(profile.mp) || 0));
            }

            // Restore a position only from the same field. Legacy profiles use x/y in zone_1.
            const fallbackSpawn = this.game.zone.getSpawnPoint('default');
            const legacyProfileZoneId = profile.currentZoneId || profile.mapId || 'zone_1';
            const storedMapPosition = profile.mapPositions?.[initialZoneId]
                || (legacyProfileZoneId === initialZoneId ? { x: profile.x, y: profile.y } : null);
            const posX = shouldRecoverFromStoredDeath
                ? fallbackSpawn.x
                : (Number.isFinite(storedMapPosition?.x) ? storedMapPosition.x : fallbackSpawn.x);
            const posY = shouldRecoverFromStoredDeath
                ? fallbackSpawn.y
                : (Number.isFinite(storedMapPosition?.y) ? storedMapPosition.y : fallbackSpawn.y);

            if (typeof posX === 'number' && typeof posY === 'number') {
                this.player.x = posX;
                this.player.y = posY;
                Logger.debug(`[WorldScene] Position set to: (${this.player.x}, ${this.player.y})`);

                // v2.3.3: Boundary Check (Move to after Restoration)
                if (this.player.x < 0 || this.player.y < 0
                    || this.player.x + this.player.width > this.game.zone.width
                    || this.player.y + this.player.height > this.game.zone.height) {
                    Logger.warn(`[WorldScene] Restoration out of bounds (${this.player.x}, ${this.player.y}). Resetting.`);
                    const spawn = this.game.zone.getSpawnPoint('default');
                    this.player.x = spawn.x;
                    this.player.y = spawn.y;
                    this.player.saveState();
                }

                // v2.3.4: Collision Fail-safe (Stuck at old spawn or invalid place)
                if (this.checkCollision(this.player.x, this.player.y, this.player.width, this.player.height)) {
                    Logger.warn(`[WorldScene] Player stuck in collision at (${this.player.x}, ${this.player.y}). Resetting to safe spawn.`);
                    const spawn = this.game.zone.getSpawnPoint('default');
                    this.player.x = spawn.x;
                    this.player.y = spawn.y;
                    this.player.saveState();
                }
            }

            if (shouldRecoverFromStoredDeath) {
                Logger.warn('[WorldScene] Stored profile HP was non-positive. Recovering player at spawn with full HP/MP.');
                this.player.isDead = false;
                this.player.isDying = false;
                this.player.deathTimer = 0;
            }

            // v1.99.12: Force UI Update after profile restoration
            if (this.ui) {
                this.ui.updateQuestUI();
                this.ui.updateStatusPopup();
                this.ui.updateAutoAttackToggle(this.player.autoAttackEnabled);
                this.ui.updateSkillPopup();
            }
            if (needsLegacyCurrencyMigration || inventoryNormalizationResult?.changed) {
                this.player.saveState(false, {
                    debounceMs: 0,
                    reason: needsLegacyCurrencyMigration ? 'migrate_gold_to_manastone' : 'remove_legacy_inventory_items'
                });
            }
        }

        const shouldDeferZoneParticipation = !this.player.questData.basicTrainingCompleted &&
            !this.player.questData.slimeQuestClaimed &&
            (((this.player.questData.slimeKills || 0) === 0) || !!this.player.questData.prologueCompleted);

        this.net.setZoneParticipationEnabled(!shouldDeferZoneParticipation);

        this.ui?.loadPlayerSettings?.(this.player.clientSettings || null, { refreshGame: true });
        this.player.init(this.input, this.resources, this.net);
        const pendingClaimCount = this.player.claimPendingItemRewards?.({
            maxAttempts: 48,
            debounceMs: 1200,
            save: false
        }) || 0;
        this.net.flushPendingFriendGiftRefunds?.();
        if (!this.player.recoveryUid) {
            this.player.recoveryUid = user.uid;
        }
        if (profile && !profile.recoveryUid) {
            this.player.saveProfilePatch?.(['recoveryUid'], {
                debounceMs: 0,
                forceImmediate: true,
                reason: 'normalize_recovery_uid'
            });
        }
        await this.net.handleLocalZoneChanged?.('zone_restore');
        this.net.resetToSoloPartyState(false);
        this.net.handleLocalPartyStateChanged('world_enter_force_solo');
        this.player.grantSpawnProtection(5);
        this.ui?.loadPlayerUiLayout?.(this.player.uiLayout || null);

        // Setup Network Handlers
        this._setupNetworkHandlers();
        await this.net.setNormalRewardConsumer?.((reward) => (
            this.player?.receiveNormalRewardDurably?.(reward)
                || Promise.resolve({ ok: false, reason: 'player_unavailable' })
        ));
        await this.net.setDurableRewardConsumer?.((reward) => (
            this.player?.receiveRewardDurably?.(reward)
                || Promise.resolve({ ok: false, reason: 'player_unavailable' })
        ));

        await this.monsterManager?.restorePendingIntroBossQuest?.(this.player, {
            reason: 'world_enter_reconnect'
        });

        // Initial UI Sync
        if (this.ui) {
            this.ui.updateQuestUI();
            this.ui.updateStatusPopup();
            this.ui.updateAutoAttackToggle(this.player?.autoAttackEnabled);
        }

        // v0.00.03: Ensure data is synchronized to the zone database on entry
        if (this.player) {
            this.player.saveProfilePatch?.([
                'hp',
                'mp',
                'currentZoneId',
                'mapPositions',
                ...((pendingClaimCount > 0 || pendingRewardNormalization.changed) ? ['inventory', 'pendingItemRewards'] : [])
            ], {
                debounceMs: 1800,
                reason: 'world_enter_light_profile_sync'
            });

            // v0.00.15: Self-heal Name Mapping (Force update name->uid)
            // This fixes the issue where an old UID is linked to the name
            if (this.player.name) {
                this.net.claimName(this.player.id, this.player.name);
                Logger.debug(`[WorldScene] Claimed name mapping: ${this.player.name} -> ${this.player.id}`);
            }
        }
        this.ui?.updateMapContext?.(this.game.zone.currentZone, this.game.zone.getZoneMeta(initialZoneId));
        this._playZoneBgm(zoneData);
        this._resetProfileIdleSaveTracking();

        if (shouldDeferZoneParticipation) {
            this.game.tutorial?.startTutorial?.('basic_training');
        } else {
            this.activateZoneParticipation();
        }
        this.ui?.armBrowserBackExitGuard?.();
    }

    _applyZoneData(zoneData, options = {}) {
        if (!zoneData) return;
        this.zoneSpawnRules = zoneData.monsterSpawns || zoneData.spawns || [];
        this.camera.setWorldBounds(this.game.zone.width, this.game.zone.height);
        const defaultSpawn = this.game.zone.getSpawnPoint('default');
        this.safeZone = {
            x: defaultSpawn.x,
            y: defaultSpawn.y,
            radius: Math.max(120, Number(zoneData.safeZoneRadius || 260))
        };

        this.mapObjects = [];
        this.staticColliders = [];
        (zoneData.objects || []).forEach((objectDefinition) => this._createMapObject(objectDefinition));

        this.monsterManager?.setSpawnRules?.(this.zoneSpawnRules, {
            zoneId: zoneData.id,
            bossSpawn: zoneData.bossSpawn || null,
            primeSpawn: options.primeSpawn !== false
        });
        if (options.clearExisting) {
            this.monsterManager?.clearAll?.({ preserveNetwork: !!options.preserveNetwork });
        }
        this.ui?.updateMapContext?.(zoneData, this.game.zone.getZoneMeta(zoneData.id));
    }

    _playZoneBgm(zoneData = this.game.zone?.currentZone) {
        const bgmId = zoneData?.background?.music || 'bgm_cabin';
        this.game.sound?.loadAndPlayBgm?.(bgmId);
    }

    getZoneTravelState(zoneId) {
        const meta = this.game.zone?.getZoneMeta?.(zoneId);
        if (!meta) return { ok: false, reason: 'unknown_zone', meta: null };
        if (!this.player) return { ok: false, reason: 'no_player', meta };
        if (this.game.zone?.currentZone?.id === zoneId) return { ok: false, reason: 'current_zone', meta };
        if (this.player.level < Number(meta.requiredLevel || 1)) return { ok: false, reason: 'level_locked', meta };
        if (this.player.isDead || this.player.isDying) return { ok: false, reason: 'dead', meta };
        if (this.game.story?.isStoryActive || this.game.tutorial?.activeTutorial) return { ok: false, reason: 'story_locked', meta };
        if (this.isZoneTransitioning) return { ok: false, reason: 'transitioning', meta };
        return { ok: true, reason: 'available', meta };
    }

    changeZone(targetZoneId) {
        if (this._activeZoneTransitionPromise) return this._activeZoneTransitionPromise;

        const operation = this._changeZone(targetZoneId);
        this._activeZoneTransitionPromise = operation;
        operation.then(
            () => {
                if (this._activeZoneTransitionPromise === operation) {
                    this._activeZoneTransitionPromise = null;
                }
            },
            () => {
                if (this._activeZoneTransitionPromise === operation) {
                    this._activeZoneTransitionPromise = null;
                }
            }
        );
        return operation;
    }

    async waitForPendingZoneTransition() {
        const operation = this._activeZoneTransitionPromise;
        if (!operation) return { ok: true, pending: false };
        const moved = await operation;
        return { ok: true, pending: true, moved };
    }

    async _changeZone(targetZoneId) {
        const travelState = this.getZoneTravelState(targetZoneId);
        if (!travelState.ok) {
            const messages = {
                current_zone: '현재 머무르고 있는 필드입니다.',
                level_locked: `레벨 ${travelState.meta?.requiredLevel || 1}부터 이동할 수 있습니다.`,
                dead: '부활한 뒤 필드를 이동할 수 있습니다.',
                story_locked: '진행 중인 이야기나 훈련을 마친 뒤 이동할 수 있습니다.',
                transitioning: '이미 필드를 이동하고 있습니다.',
                unknown_zone: '존재하지 않는 필드입니다.'
            };
            this.ui?.logSystemMessage?.(`⚠️ ${messages[travelState.reason] || '지금은 이동할 수 없습니다.'}`);
            return false;
        }

        const previousZoneId = this.game.zone.currentZone?.id || 'zone_1';
        const previousPosition = { x: this.player.x, y: this.player.y };
        const previousRespawn = { x: this.player.spawnX, y: this.player.spawnY };
        const previousMapPositions = { ...(this.player.mapPositions || {}) };
        const previousZoneMeta = this.game.zone.getZoneMeta(previousZoneId);
        const previousZoneRuntime = this.game.zone.createRuntimeSnapshot?.() || null;
        const transitionToken = ++this.zoneTransitionToken;
        this.player.endAllDuels?.('left');
        this.isZoneTransitioning = true;
        this.player.grantSpawnProtection?.(7);
        this.ui?.hideGenericModal?.();
        this.ui?.showCenterMessage?.(`${travelState.meta.name}(으)로 이동 중...`, '#bfe8ff', { duration: 1200 });

        try {
            this.player.saveState(true, { debounceMs: 0, reason: 'zone_departure' });
            this.player.stopBasicAttackChanneling?.();
            this.player.cancelFireballAim?.();
            this.player.clearCurrentTarget?.();
            this.player.isAttacking = false;
            this.player.isChanneling = false;
            this.player.vx = 0;
            this.player.vy = 0;
            this.player.missileFireQueue.length = 0;
            // Settle attacks in the field where they were authored before any
            // local entities are cleared or the network field id changes.
            await Promise.resolve(this.net?.flushBatchQueue?.());
            if (this.net?.isHost && !this.net?.shouldUseMonsterQuietMode?.()) {
                await Promise.resolve(this.monsterManager?.forceSyncAll?.({ includeDead: true }));
            }
            this._clearTransientWorldEffects();
            this.monsterManager?.resetCombatTargets?.();
            this.monsterManager?.clearAll?.({ preserveNetwork: true });
            this.remotePlayers.clear();

            const zoneData = await this.game.zone.loadZone(targetZoneId);
            if (transitionToken !== this.zoneTransitionToken) return false;
            if (!zoneData || zoneData.id !== targetZoneId) {
                throw new Error(`Zone load mismatch: requested=${targetZoneId}, loaded=${zoneData?.id || 'none'}`);
            }

            this._applyZoneData(zoneData, { clearExisting: false, primeSpawn: false });
            const spawn = this.game.zone.getSpawnPoint('default');
            this.player.x = spawn.x;
            this.player.y = spawn.y;
            if (this.checkCollision(this.player.x, this.player.y, this.player.width, this.player.height)) {
                this.player.x = spawn.x;
                this.player.y = spawn.y;
            }
            this.player.currentZoneId = targetZoneId;
            this.player.mapPositions = {
                ...(this.player.mapPositions || {}),
                [targetZoneId]: { x: Math.round(this.player.x), y: Math.round(this.player.y) }
            };
            this.player.spawnX = spawn.x;
            this.player.spawnY = spawn.y;
            this.player.grantSpawnProtection?.(7);

            await Promise.resolve(this.net?.handleLocalZoneChanged?.('zone_travel'));
            this._ensureHostSpawnRulesLoaded({ clearExisting: false, primeSpawn: true });
            if (targetZoneId === 'zone_1') {
                await this.monsterManager?.restorePendingIntroBossQuest?.(this.player, {
                    reason: 'zone_return'
                });
            }
            this._syncRemotePlayersFromBuffer();
            this.net?.sendMovePacket?.(this.player.x, this.player.y, 0, 0, this.player.name);
            this.net?.sendPlayerHp?.(this.player.hp, this.player.maxHp);
            this.net?.sendHeartbeat?.();
            this.player.saveState(true, { debounceMs: 0, reason: 'zone_arrival' });
            this._resetProfileIdleSaveTracking();
            this.game.quests?.notifyZoneEntered?.(targetZoneId);
            this._playZoneBgm(zoneData);
            this.ui?.updateMapContext?.(zoneData, travelState.meta);
            this.ui?.showCenterMessage?.(`${travelState.meta.name} 도착`, travelState.meta.accentColor || '#9fffc8', {
                duration: 2200
            });
            this.ui?.logSystemMessage?.(`🗺️ ${travelState.meta.name}에 도착했습니다. 7초 동안 보호됩니다.`);
            return true;
        } catch (error) {
            Logger.error(`[WorldScene] Failed to change zone to ${targetZoneId}`, error);
            let restoredZone = await this.game.zone.loadZone(previousZoneId);
            if (!restoredZone || restoredZone.id !== previousZoneId) {
                Logger.warn(`[WorldScene] Reloading ${previousZoneId} failed; restoring the in-memory zone snapshot.`);
                restoredZone = this.game.zone.restoreRuntimeSnapshot?.(previousZoneRuntime) || null;
            }
            if (!restoredZone || restoredZone.id !== previousZoneId) {
                throw new Error(`Zone rollback failed: expected=${previousZoneId}, restored=${restoredZone?.id || 'none'}`);
            }
            this._applyZoneData(restoredZone, { clearExisting: false, primeSpawn: false });
            this.player.x = previousPosition.x;
            this.player.y = previousPosition.y;
            this.player.currentZoneId = previousZoneId;
            this.player.mapPositions = previousMapPositions;
            const restoredSpawn = this.game.zone.getSpawnPoint('default') || previousPosition;
            this.player.spawnX = Number.isFinite(previousRespawn.x) ? previousRespawn.x : restoredSpawn.x;
            this.player.spawnY = Number.isFinite(previousRespawn.y) ? previousRespawn.y : restoredSpawn.y;
            await Promise.resolve(this.net?.handleLocalZoneChanged?.('zone_travel_rollback'));
            this._ensureHostSpawnRulesLoaded({ clearExisting: false, primeSpawn: true });
            this._playZoneBgm(restoredZone);
            this.ui?.updateMapContext?.(restoredZone, previousZoneMeta);
            this.player.saveState(true, { debounceMs: 0, reason: 'zone_travel_rollback' });
            this.ui?.showGenericModal?.('필드 이동 실패', '필드 데이터를 불러오지 못했습니다. 기존 위치로 돌아왔습니다.', null, null, {
                hideNo: true,
                yesText: '확인'
            });
            return false;
        } finally {
            if (transitionToken === this.zoneTransitionToken) {
                this.isZoneTransitioning = false;
            }
        }
    }

    isPointInSafeZone(x, y, padding = 0) {
        if (!this.safeZone) return false;
        const dx = x - this.safeZone.x;
        const dy = y - this.safeZone.y;
        return Math.sqrt(dx * dx + dy * dy) <= (this.safeZone.radius + padding);
    }

    isPlayerProtected(player) {
        if (!player) return false;

        if (this.isZoneTransitioning) return true;
        if (this.game.story?.isStoryActive) return true;
        if (this.game.tutorial?.activeTutorial) return true;

        const px = player.x + ((player.width || 0) / 2);
        const py = player.y + ((player.height || 0) / 2);
        return this.isPointInSafeZone(px, py, 24);
    }

    _spawnRemotePlayerFromData(data) {
        if (!data || !this.player || data.id === this.player.id || this.remotePlayers.has(data.id)) return;

        const rp = new RemotePlayer(data.id, data.x, data.y, this.resources);
        const resolvedName = this.net?.getBestKnownRemoteName?.(
            data.id,
            data.name,
            this.net?.remotePlayers?.get?.(data.id)?.name
        ) || data.name || "Unknown";
        rp.name = resolvedName;
        if (typeof data.level === 'number') {
            rp.level = data.level;
        }
        if (Array.isArray(data.h)) {
            rp.onHpUpdate({
                hp: data.h[0],
                maxHp: data.h[1],
                ts: data.h[2]
            });
        }
        if (typeof data.defense === 'number') {
            rp.defense = data.defense;
        }
        if (typeof data.isPaused === 'boolean') {
            rp.isPaused = data.isPaused;
        }
        if (data.protectedUntil !== undefined) {
            rp.protectedUntil = Number(data.protectedUntil) || 0;
        }
        if (data.equipment !== undefined) {
            rp.equipment = rp.normalizeEquipmentState(data.equipment);
        }
        if (data.hostility) {
            rp.hostility = data.hostility;
        }
        if (data.party) {
            rp.party = data.party;
        }

        this.remotePlayers.set(data.id, rp);
        Logger.log(`[WorldScene] Spawned buffered player: ${rp.name}`);
    }

    _getOrSpawnRemotePlayer(id, fallbackData = null) {
        if (!id) return null;
        if (!this.remotePlayers.has(id)) {
            const seedData = this.net?.remotePlayers?.get(id) || fallbackData;
            if (seedData && Number.isFinite(seedData.x) && Number.isFinite(seedData.y)) {
                this._spawnRemotePlayerFromData(seedData);
            }
        }
        return this.remotePlayers.get(id) || null;
    }

    _syncRemotePlayersFromBuffer() {
        if (!this.net?.remotePlayers) return;

        this.net.remotePlayers.forEach((data) => {
            this._spawnRemotePlayerFromData(data);
        });
    }

    activateZoneParticipation() {
        if (!this.player) return;

        this.net.setZoneParticipationEnabled(true);
        this._ensureHostSpawnRulesLoaded();
        this.remotePlayers.clear();
        this._syncRemotePlayersFromBuffer();
        this.net.startHostilityListeners();
        this.player.saveState(true);
        this.net.sendPlayerHp(this.player.hp, this.player.maxHp);
        this.net.sendMovePacket(this.player.x, this.player.y, this.player.vx, this.player.vy, this.player.name);
        this.net.sendHeartbeat();
        this._resetProfileIdleSaveTracking();
    }

    _ensureHostSpawnRulesLoaded(options = {}) {
        if (!this.net?.isHost || !this.monsterManager) return false;

        const spawnRules = Array.isArray(this.zoneSpawnRules) && this.zoneSpawnRules.length > 0
            ? this.zoneSpawnRules
            : (this.game.zone?.currentZone?.monsterSpawns || this.game.zone?.currentZone?.spawns || []);
        const zoneData = this.game.zone?.currentZone;

        if ((!Array.isArray(spawnRules) || spawnRules.length === 0) && !zoneData?.bossSpawn) {
            return false;
        }

        const zoneId = zoneData?.id || 'zone_1';
        const currentBossId = this.monsterManager.zoneBossRule?.monsterId || null;
        const nextBossId = zoneData?.bossSpawn?.monsterId || null;
        const alreadyConfiguredForZone = this.monsterManager.activeZoneId === zoneId
            && Array.isArray(this.monsterManager.spawnRules)
            && this.monsterManager.spawnRules.length === spawnRules.length
            && currentBossId === nextBossId;
        if (!alreadyConfiguredForZone) {
            this.monsterManager.setSpawnRules(spawnRules, {
                zoneId,
                bossSpawn: zoneData?.bossSpawn || null,
                primeSpawn: options.primeSpawn !== false
            });
        }

        if (options.clearExisting) {
            this.monsterManager.clearAll();
        }

        if (options.primeSpawn !== false && !this.monsterManager.isSpawnSuppressed?.()) {
            this.monsterManager.primeSpawnCycle();
        }

        return true;
    }

    // v2.3.4: Effect Bridge
    addSpark(x, y) {
        // Fallback simple particles if no pool
        for (let i = 0; i < 5; i++) {
            this.sparks.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 300,
                vy: (Math.random() - 0.5) * 300,
                life: 0.3 + Math.random() * 0.4,
                color: '#fff'
            });
        }
    }

    addExplosion(x, y, radius, options = {}) {
        this.explosions.push({
            x,
            y,
            radius,
            variant: options.variant || 'default',
            collapse: !!options.collapse,
            life: options.duration || 0.45,
            duration: options.duration || 0.45
        });
    }

    // v0.00.55: Floating Text Bridge
    addDamageText(x, y, text, color, isCrit, label) {
        this.floatingTexts.push({
            x: x,
            y: y,
            text: text,
            color: color || '#fff',
            timer: 1.5,
            currentY: y,
            isCrit: isCrit,
            label: label
        });
    }

    _setupNetworkHandlers() {
        if (Array.isArray(this._networkHandlerBindings) && this._networkHandlerBindings.length > 0) return;
        this._networkHandlerBindings = [];
        const bindNetworkHandler = (eventName, handler) => {
            this.net.on(eventName, handler);
            this._networkHandlerBindings.push({ eventName, handler });
            return handler;
        };

        if (!this._handleHostChanged) {
            const promoteToHost = () => {
                this._ensureHostSpawnRulesLoaded();
                this.monsterManager?.resetCombatTargets?.({ clearChargeState: true });
                const restorePromise = this.monsterManager?.restoreAuthoritativeFieldState
                    ? this.monsterManager.restoreAuthoritativeFieldState({
                        settleMs: 0,
                        publishWhenReady: this.net?.isSharedFieldActive?.() || false,
                        waitForResidentPublish: this.net?.isSharedFieldActive?.() || false
                    })
                    : this.monsterManager?.restoreAuthoritativeMonstersFromHostSnapshot?.();
                Promise.resolve(restorePromise)
                    .then(() => {
                        this.monsterManager?.resetCombatTargets?.({ clearChargeState: true });
                    })
                    .catch((error) => {
                        Logger.warn('[WorldScene] Failed to restore monster host snapshot', error);
                    });
            };
            this._handleHostChanged = (isHost) => {
                if (!isHost) return;
                promoteToHost();
            };
            bindNetworkHandler('hostChanged', this._handleHostChanged);
            if (this.net.isHost) {
                promoteToHost();
            }
        }

        bindNetworkHandler('rewardReceived', (data) => {
            if (this.player) this.player.receiveReward(data);
        });

        const handleProfileWriterSuperseded = (event = {}) => {
            if (event?.replacedByNewSession !== true) return;
            if (this._profileWriterSuperseded) return;
            this._profileWriterSuperseded = true;
            if (this.player) {
                this.player.autoAttackEnabled = false;
                this.player.clearCurrentTarget?.();
            }
            this.net?.setZoneParticipationEnabled?.(false);
            this.ui?.updateAutoAttackToggle?.(false);
            this.ui?.showGenericModal?.(
                '중복 접속 감지',
                '같은 계정으로 열린 새 세션이 확인되어 이 화면의 플레이와 저장을 중단했습니다.\n\n진행 유실을 막기 위해 이 탭을 다시 접속해 주세요.',
                () => window.location?.reload?.(),
                null,
                { hideNo: true, yesText: '다시 접속' }
            );
        };
        bindNetworkHandler('profileWriterSuperseded', handleProfileWriterSuperseded);
        if (this.net?.isProfileWriterSuperseded?.()) handleProfileWriterSuperseded({ replacedByNewSession: true });

        // v0.00.43: Center Screen System Messages
        bindNetworkHandler('systemMessage', (data) => {
            if (this.ui) this.ui.showCenterMessage(data.message, data.color);
        });

        bindNetworkHandler('monsterDamageReceived', (data) => {
            const m = this.monsterManager?.monsters.get(data.mid);
            if (m) this.game.addSpark(m.x, m.y);
        });

        // v2.1: Emote Sync
        bindNetworkHandler('emoteReceived', (data) => {
            if (this.player && this.player.id === data.uid) {
                this.player.showEmote(data.emoteId);
            } else {
                const rp = this.remotePlayers.get(data.uid);
                if (rp) {
                    if (rp.showEmote) rp.showEmote(data.emoteId);
                    else {
                        // Polyfill for RemotePlayer if showEmote missing
                        // Assuming RemotePlayer structure or just set props if render reads them
                        // See Player.js showEmote: sets chatMessage, isEmote, chatTimer.
                        const emote = this.game.emotes?.find(e => e.id === data.emoteId);
                        if (emote) {
                            rp.chatMessage = emote.icon;
                            rp.isEmote = true;
                            rp.chatTimer = 3.0;
                        }
                    }
                }
            }
        });

        bindNetworkHandler('playerDamageReceived', (data) => {
            let target = (this.player && this.player.id === data.tid) ? this.player : this.remotePlayers.get(data.tid);
            if (target) {
                this.game.addSpark(target.x + target.width / 2, target.y + target.height / 2);
                const impactX = Number.isFinite(data.meta?.impactX) ? data.meta.impactX : null;
                const impactY = Number.isFinite(data.meta?.impactY) ? data.meta.impactY : null;
                const fireballImpact = Number.isFinite(impactX)
                    && Number.isFinite(impactY)
                    && (data.meta?.cause === 'fireball' || data.meta?.cause === 'blue_fireball_chain');
                if (target === this.player && fireballImpact) {
                    this.game.addExplosion?.(impactX, impactY, data.meta?.explosionRadius || 40, {
                        variant: data.meta?.cause === 'blue_fireball_chain' ? 'blue_flame' : 'default',
                        collapse: true
                    });
                }
                if (target === this.player) {
                    const attackerRemote = this.remotePlayers.get(data.aid);
                    if (attackerRemote?.canAttackTarget && !attackerRemote.canAttackTarget(this.player)) {
                        return;
                    }
                    this.player.takeDamage(
                        data.dmg,
                        true,
                        !!data.crit,
                        impactX,
                        impactY,
                        data.meta || null,
                        data.effectType || null,
                        data.effectDuration || 0,
                        data.effectDamage || 0
                    );
                } else {
                    if (typeof target.isProtected === 'function' && target.isProtected()) {
                        return;
                    }
                    // v0.00.53: Remote players also consider defense formula locally for visual consistency
                    const def = target.defense || 0;
                    const finalDmg = Math.max(1, Math.ceil(data.dmg - def));
                    target.hp = Math.max(0, (target.hp || 100) - finalDmg);
                    if (data.effectType === 'burn' && typeof target.applyBurn === 'function') {
                        target.applyBurn(data.effectDuration || 0, data.effectDamage || 0);
                    }
                    if (data.meta?.combustionCollapse && typeof target.applyCombustionCollapse === 'function' && Number.isFinite(impactX) && Number.isFinite(impactY)) {
                        target.applyCombustionCollapse(impactX, impactY, {
                            outwardForce: data.meta?.collapseOutwardForce,
                            inwardForce: data.meta?.collapseInwardForce,
                            delayMs: data.meta?.collapseDelayMs
                        });
                    }
                }
            }
        });

        bindNetworkHandler('playerJoined', (data) => {
            if (!this.net.isZoneParticipationEnabled()) return;
            this._spawnRemotePlayerFromData(data);
        });

        bindNetworkHandler('playerUpdate', (data) => {
            if (!this.net.isZoneParticipationEnabled()) return;
            if (!this.remotePlayers.has(data.id)) {
                this._spawnRemotePlayerFromData(this.net.remotePlayers.get(data.id) || data);
            }
            const rp = this.remotePlayers.get(data.id);
            if (rp) rp.onServerUpdate(data);
        });

        bindNetworkHandler('playerLeft', (id) => {
            if (this.player?.hasActiveDuelWith?.(id)) {
                this.player.endDuelWith(id, 'left', { notify: false });
                this.ui?.logSystemMessage?.('⚔️ 상대가 필드를 떠나 결투가 종료되었습니다.');
            }
            this.remotePlayers.delete(id);
        });

        bindNetworkHandler('playerAttack', (data) => {
            if (!this.net.isZoneParticipationEnabled()) return;
            if (this.shouldSuppressTransientWorldEffects()) return;
            const rp = this._getOrSpawnRemotePlayer(data.id, data);
            if (rp) rp.triggerAttack(data);
        });

        // v0.00.37: Channeling sync for casting effects (spark, magic circle, attack motion)
        bindNetworkHandler('playerChanneling', (data) => {
            if (!this.net.isZoneParticipationEnabled()) return;
            if (this.shouldSuppressTransientWorldEffects()) return;
            const rp = this._getOrSpawnRemotePlayer(data.id, data);
            if (rp) rp.triggerChanneling(data);
        });

        bindNetworkHandler('playerHpUpdate', (data) => {
            if (!this.net.isZoneParticipationEnabled()) return;
            const rp = this._getOrSpawnRemotePlayer(data.id, data);
            if (rp) {
                rp.onHpUpdate(data);
                if (Number(data.hp || 0) <= 0 && this.player?.hasActiveDuelWith?.(data.id)) {
                    this.player.endDuelWith(data.id, 'death');
                    this.ui?.logSystemMessage?.(`⚔️ ${rp.name || '상대'}님이 쓰러져 결투가 종료되었습니다.`);
                }
                this.ui?.updatePartyUI?.();
            }
        });

        // v0.33.0: Monster Attack Sync
        bindNetworkHandler('monsterAttack', (data) => {
            if (this.shouldSuppressTransientWorldEffects()) return;
            const m = this.monsterManager?.monsters.get(data.mid);
            if (!m) return;

            if (data.skill === 'missile') {
                const count = data.extra?.count || 4;
                let target = null;
                if (data.extra?.targetId) {
                    if (data.extra.targetId === this.player?.id) target = this.player;
                    else target = this.remotePlayers.get(data.extra.targetId);
                }

                // Calculate angle (towards target)
                let baseAngle = 0;
                if (target) {
                    baseAngle = Math.atan2(target.y - m.y, target.x - m.x);
                }

                for (let i = 0; i < count; i++) {
                    const spread = (Math.PI * 4) / 9;
                    const angleOffset = (Math.random() - 0.5) * 0.4;
                    const angle = baseAngle + (i - (count - 1) / 2) * (spread / Math.max(1, count - 1)) + angleOffset;

                    const burstSpeed = 350 + (Math.random() * 300);
                    const vx = Math.cos(angle) * burstSpeed;
                    const vy = Math.sin(angle) * burstSpeed;

                    this.monsterMissileQueue.push({
                        x: m.x,
                        y: m.y,
                        target: target,
                        options: {
                            speed: 700 + (Math.random() * 100),
                            vx, vy,
                            damage: (m.atk || 10) * 0.45, // v0.33.0: 45% of ATK (Req #2)
                            radius: 6,
                            ownerId: m.id,
                            isMonsterAttack: true
                        }
                    });
                }
            } else if (data.skill === 'boss_telegraph') {
                if (typeof m.startBossTelegraph === 'function') {
                    m.startBossTelegraph(data.extra || {});
                }
            } else if (data.skill === 'shield') {
                // Visual Effect for Shield
                if (m) {
                    // v0.00.52: Default duration 1s (1000ms) to prevent long-lasting shield bugs
                    m.applyEffect('shield', (data.extra?.duration || 1000) / 1000, 0);
                    // Add some sparks/particles?
                    for (let i = 0; i < 10; i++) {
                        this.game.addSpark(m.x + (Math.random() - 0.5) * m.width, m.y + (Math.random() - 0.5) * m.height);
                    }
                }
            } else if (data.skill === 'charge') {
                // v0.00.43: Charge Skill Visualization
                if (m) {
                    const tx = data.extra?.x;
                    const ty = data.extra?.y;
                    if (tx !== undefined && ty !== undefined) {
                        m.startCharge(tx, ty);
                    }
                }
            }
        });
    }

    async exit() {
        await this.waitForPendingZoneTransition();
        if (this.player?.saveProfilePosition) {
            await this.player.saveProfilePosition({
                debounceMs: 0,
                forceImmediate: true,
                reason: 'world_exit_position_snapshot'
            });
        }
        const flushResult = await this.net?.flushProfileWrites?.(this.player?.id);
        if (flushResult?.ok === false) {
            throw new Error(flushResult.reason || 'world_exit_profile_flush_failed');
        }
        await this.net?.setNormalRewardConsumer?.(null);
        await this.net?.setDurableRewardConsumer?.(null);
        this.ui?.disarmBrowserBackExitGuard?.();
        this.ui?.hideGenericModal?.();
        (this._networkHandlerBindings || []).forEach(({ eventName, handler }) => {
            this.net.off(eventName, handler);
        });
        this._networkHandlerBindings = [];
        this._handleHostChanged = null;
        this.player?.detachInput?.();
        if (this.game?.localPlayer === this.player) this.game.localPlayer = null;
        this.remotePlayers.clear();
    }

    onVisibilityHidden() {
        this.transientSyncSuppressedUntil = Number.POSITIVE_INFINITY;
    }

    shouldKeepRunningWhileHidden() {
        return !!(
            this.net?.zoneParticipationEnabled
            && this.net?.isSharedFieldActive?.()
            && !this.ui?.isPaused
            && this.player
        );
    }

    getHiddenSimulationIntervalMs() {
        if (!this.shouldKeepRunningWhileHidden()) return 0;
        return this.net?.isHost ? 250 : 400;
    }

    onVisibilityVisible(meta = {}) {
        const resumedAt = Number(meta.resumedAt || Date.now());
        const hiddenDurationMs = Math.max(0, Number(meta.hiddenDurationMs || 0));
        const backgroundSimWasActive = !!meta.keepSimulationActive;
        const canSkipResync = backgroundSimWasActive && !!this.net?.isHost;

        if (canSkipResync) {
            this.transientSyncSuppressedUntil = 0;
            return;
        }

        if (hiddenDurationMs < 120) {
            this.transientSyncSuppressedUntil = 0;
            return;
        }

        const settleMs = Math.max(
            this.transientSyncResumeGraceMs,
            Math.min(1600, Math.round(hiddenDurationMs * 0.15))
        );

        this.transientSyncSuppressedUntil = resumedAt + settleMs;
        this._resyncAfterVisibilityRestore({ resumedAt, hiddenDurationMs });
    }

    shouldSuppressTransientWorldEffects() {
        if (typeof document !== 'undefined' && document.hidden) return true;
        return Date.now() < Number(this.transientSyncSuppressedUntil || 0);
    }

    _clearTransientWorldEffects() {
        while (this.sparks.length > 0) {
            const spark = this.sparks.pop();
            this.game.sparkPool?.release?.(spark);
        }

        while (this.floatingTexts.length > 0) {
            const text = this.floatingTexts.pop();
            this.game.textPool?.release?.(text);
        }

        this.projectiles.length = 0;
        this.explosions.length = 0;
        this.monsterMissileQueue.length = 0;
        this.monsterMissileTimer = 0;
    }

    _resyncAfterVisibilityRestore(meta = {}) {
        this._clearTransientWorldEffects();
        this.remotePlayers.forEach((rp) => rp?.resyncAfterVisibilityRestore?.(meta));
        this.monsterManager?.handleVisibilityResync?.(meta);

        if (this.player) {
            this.player.stopBasicAttackChanneling?.();
            this.player.isAttacking = false;
            this.player.isChanneling = false;
            this.player.chargeTime = 0;
            this.player.lightningEffect = null;
            this.player.skillAttackTimer = 0;
            this.player.missileFireQueue.length = 0;
            this.player.missileFireTimer = 0;
            if (!this.player.isDead) {
                this.player.state = 'idle';
            }
            if (this.player.knockback) {
                this.player.knockback.vx = 0;
                this.player.knockback.vy = 0;
            }
        }

        if (this.game?.camera) {
            this.game.camera.shakeIntensity = 0;
            this.game.camera.shakeOffsetX = 0;
            this.game.camera.shakeOffsetY = 0;
        }

        if (this.game?.loop) {
            this.game.loop.hitstopTimer = 0;
        }
    }

    _resetProfileIdleSaveTracking() {
        if (!this.player) return;
        this._profileIdleLastMovingAt = Date.now();
        this._profileIdleSavePending = false;
        this._profileIdleSaveInFlight = false;
        this._profileIdleLastSavedAt = Date.now();
        this._profileIdleLastSavedPosition = {
            x: Math.round(this.player.x),
            y: Math.round(this.player.y),
            zoneId: this.player.getCurrentProfileZoneId?.() || this.game.zone?.currentZone?.id || 'zone_1'
        };
    }

    _trackIdleProfilePositionSave(prevX, prevY) {
        if (!this.player || this.player.isDead || this.player.isDying || this.isZoneTransitioning) return;

        const now = Date.now();
        const currentX = Math.round(this.player.x);
        const currentY = Math.round(this.player.y);
        const currentZoneId = this.player.getCurrentProfileZoneId?.() || this.game.zone?.currentZone?.id || 'zone_1';
        const frameMoved = Math.hypot(Number(this.player.x || 0) - Number(prevX || 0), Number(this.player.y || 0) - Number(prevY || 0)) > 0.35;
        const velocityMoving = Math.abs(Number(this.player.vx || 0)) > 0.1 || Math.abs(Number(this.player.vy || 0)) > 0.1;
        const hasMoveTarget = !!this.player.moveTarget;
        const isMoving = frameMoved || velocityMoving || hasMoveTarget;
        const lastSaved = this._profileIdleLastSavedPosition;
        const distanceFromLastSaved = lastSaved && lastSaved.zoneId === currentZoneId
            ? Math.hypot(currentX - Number(lastSaved.x || 0), currentY - Number(lastSaved.y || 0))
            : Number.POSITIVE_INFINITY;

        if (isMoving) {
            this._profileIdleLastMovingAt = now;
            if (distanceFromLastSaved >= this.profileIdleSaveMinDistance) {
                this._profileIdleSavePending = true;
            }
            return;
        }

        if (!this._profileIdleSavePending || this._profileIdleSaveInFlight) return;
        if (now - Number(this._profileIdleLastMovingAt || 0) < this.profileIdleSaveDelayMs) return;
        if (now - Number(this._profileIdleLastSavedAt || 0) < this.profileIdleSaveMinIntervalMs) return;

        this._profileIdleSaveInFlight = true;
        Promise.resolve(this.player.saveState?.(false, {
            debounceMs: 0,
            reason: 'idle_profile_snapshot',
            backupReason: 'idle_profile_snapshot'
        })).then((result) => {
            if (result?.ok === false) {
                this._profileIdleSavePending = true;
                Logger.warn('[WorldScene] Idle profile save failed', result.reason || result);
                return;
            }
            this._profileIdleSavePending = false;
            this._profileIdleLastSavedAt = Date.now();
            this._profileIdleLastSavedPosition = { x: currentX, y: currentY, zoneId: currentZoneId };
        }).catch((error) => {
            this._profileIdleSavePending = true;
            Logger.warn('[WorldScene] Idle profile save failed', error);
        }).finally(() => {
            this._profileIdleSaveInFlight = false;
        });
    }

    update(dt) {
        if (this.isZoneTransitioning || this._profileWriterSuperseded) return;
        if (this.shouldFreezeWorldForModalUi()) {
            return;
        }

        this.time += dt;
        this.hudUpdateTimer += dt;
        this.minimapUpdateTimer += dt;

        const useMobileIntervals = !!this.game.isMobilePerformanceMode;
        const useAggressiveHudOptimization = !!this.game.useAggressiveHudOptimization;
        this.hudUpdateInterval = useAggressiveHudOptimization ? 0.12 : (useMobileIntervals ? 0.08 : 0.05);
        this.minimapUpdateInterval = useAggressiveHudOptimization ? 0.4 : (useMobileIntervals ? 0.25 : 0.16);
        this.remoteOffscreenUpdateInterval = useAggressiveHudOptimization ? 0.22 : (useMobileIntervals ? 0.14 : 0);

        if (this.player) {
            if (this.input.isPressed('SKILL_1')) this.player.useSkill(1);
            if (this.input.isPressed('SKILL_3')) this.player.useSkill(3);

            // v2.0: Predictive Collision (Check before update or after?)
            // Player.update() modifies x/y directly based on vx/vy. 
            // We need to check if the new position is valid.
            const prevX = this.player.x;
            const prevY = this.player.y;

            this.player.update(dt);

            // Access WorldScene.checkCollision
            if (this.checkCollision(this.player.x, this.player.y, this.player.width, this.player.height)) {
                // Simple Revert (Slide logic could be better but this is safe)
                // Try X only (Slide Y)
                if (!this.checkCollision(prevX, this.player.y, this.player.width, this.player.height)) {
                    this.player.x = prevX;
                }
                // Try Y only (Slide X)
                else if (!this.checkCollision(this.player.x, prevY, this.player.width, this.player.height)) {
                    this.player.y = prevY;
                }
                // Block both
                else {
                    this.player.x = prevX;
                    this.player.y = prevY;
                }
            }

            this._trackIdleProfilePositionSave(prevX, prevY);

            // Sync Position
            this.net.sendMovePacket(
                this.player.x,
                this.player.y,
                this.player.vx,
                this.player.vy,
                this.player.name
            );

            if (Math.abs(Number(this.camera.framingOffsetX || 0)) > 0.5
                || Math.abs(Number(this.camera.framingOffsetY || 0)) > 0.5
                || Math.abs(this._lastLandscapeFramingOffsetY) > 0.5) {
                this.camera.setFramingOffset(0, 0);
                this._lastLandscapeFramingOffsetY = 0;
            }
            this.camera.follow(this.player, this.game.zone.width, this.game.zone.height);

            if (this.ui && this.hudUpdateTimer >= this.hudUpdateInterval) {
                this.hudUpdateTimer = 0;
                this.ui.updateStats(
                    (this.player.hp / this.player.maxHp) * 100,
                    (this.player.mp / this.player.maxMp) * 100,
                    this.player.level,
                    (this.player.exp / this.player.maxExp) * 100
                );
            }

            if (this.ui && this.minimapUpdateTimer >= this.minimapUpdateInterval) {
                this.minimapUpdateTimer = 0;
                this.ui.updateMinimap(
                    this.player,
                    this.remotePlayers,
                    this.net?.getMinimapMonsterEntries?.(this.monsterManager ? Array.from(this.monsterManager.monsters.values()) : [])
                        || (this.monsterManager ? Array.from(this.monsterManager.monsters.values()) : []),
                    this.game.zone.width,
                    this.game.zone.height
                );
            }
        }

        // v0.00.39: Always update all remote players for proper sync
        if (this.net.isZoneParticipationEnabled()) {
            let remoteUpdatesThisTick = 0;
            this.remotePlayers.forEach(rp => {
                const onScreen = this.isOnScreen(rp);
                if (!onScreen && this.remoteOffscreenUpdateInterval > 0) {
                    rp._offscreenUpdateAccumulator = (rp._offscreenUpdateAccumulator || 0) + dt;
                    if (rp._offscreenUpdateAccumulator < this.remoteOffscreenUpdateInterval) return;
                    const offscreenDt = rp._offscreenUpdateAccumulator;
                    rp._offscreenUpdateAccumulator = 0;
                    rp.update(offscreenDt);
                    remoteUpdatesThisTick++;
                    return;
                }

                rp._offscreenUpdateAccumulator = 0;
                rp.update(dt);
                remoteUpdatesThisTick++;
            });

            if (remoteUpdatesThisTick > 0) {
                this.game.recordUiTick?.('remoteUpdates', remoteUpdatesThisTick);
            }
        }

        if (this.monsterManager && this.player) {
            this.monsterManager.update(dt, this.player, this.remotePlayers);
        }

        // Update Sparks
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.life -= dt;
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            if (s.life <= 0) {
                this.game.sparkPool.release(s);
                this.sparks.splice(i, 1);
            }
        }

        // Update Floating Texts
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.timer -= dt;
            ft.currentY -= 40 * dt;
            if (ft.timer <= 0) {
                this.game.textPool.release(ft);
                this.floatingTexts.splice(i, 1);
            }
        }

        // v0.33.0: Process Monster Missile Queue
        if (this.monsterMissileQueue.length > 0) {
            this.monsterMissileTimer -= dt;
            if (this.monsterMissileTimer <= 0) {
                this.monsterMissileTimer = 0.1;
                const data = this.monsterMissileQueue.shift();
                this.projectiles.push(new Projectile(data.x, data.y, data.target, 'missile', data.options));
            }
        }

        // v1.99.15: Update Explosions
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            this.explosions[i].life -= dt;
            if (this.explosions[i].life <= 0) {
                this.explosions.splice(i, 1);
            }
        }

        // Update Projectiles
        const monsters = this.monsterManager ? Array.from(this.monsterManager.monsters.values()) : [];
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            projectile.update(dt, monsters);
            if (projectile.isDead) {
                this.projectiles.splice(i, 1);
            }
        }
    }

    _createMapObject(def) {
        // Simple entity creation based on definition
        const obj = {
            id: def.id,
            type: def.type,
            x: def.x,
            y: def.y,
            width: def.visual?.width || 32,
            height: def.visual?.height || 32,
            image: def.visual?.image ? this.resources.getImage(def.visual.image) : null,
            scale: def.visual?.scale || 1.0,
            collision: def.collision,
            interaction: def.interaction,
            zIndex: def.y // Simple Y-sort base
        };

        // Add to list
        this.mapObjects.push(obj);

        // Add to collision list if enabled
        if (def.collision && def.collision.enabled) {
            this.staticColliders.push(obj);
        }
    }

    checkCollision(x, y, width, height) {
        // 1. Zone Boundaries
        if (x < 0 || x + width > this.game.zone.width || y < 0 || y + height > this.game.zone.height) {
            return true;
        }

        // 2. Static Colliders (Map Objects)
        // v2.0: Check against staticColliders list
        for (const obj of this.staticColliders) {
            const col = obj.collision;
            // Calculate object's collision box absolute position
            const objX = obj.x + (col.offsetX || 0);
            const objY = obj.y + (col.offsetY || 0);

            if (x < objX + col.width &&
                x + width > objX &&
                y < objY + col.height &&
                y + height > objY) {
                return true;
            }
        }

        return false;
    }

    render(ctx) {
        if (!this.game.zone.currentZone) {
            // Loading State
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, this.game.canvas.width, this.game.canvas.height);
            ctx.fillStyle = '#fff';
            ctx.font = '24px "Outfit", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Loading Zone...', this.game.canvas.width / 2, this.game.canvas.height / 2);
            return;
        }

        ctx.save();
        const scale = this.game.zoom * this.game.dpr;
        ctx.scale(scale, scale);
        // v2.2: Use getPosition() to include shake offset
        const camPos = this.camera.getPosition ? this.camera.getPosition() : { x: this.camera.x, y: this.camera.y };
        ctx.translate(-camPos.x, -camPos.y);

        // 1. World & Entities
        this.game.zone.render(ctx, this.camera);

        // 2. Prepare Render List (Y-Sort)
        const renderList = [];

        // Map Objects
        if (this.mapObjects) {
            this.mapObjects.forEach((obj) => {
                if (this.isOnScreen(obj)) renderList.push(obj);
            });
        }

        // Local Player
        if (this.player && !this.player.isDead) renderList.push(this.player);

        // Remote Players
        if (this.net.isZoneParticipationEnabled()) {
            this.remotePlayers.forEach(rp => {
                if (this.isOnScreen(rp)) renderList.push(rp);
            });
        }

        // Monsters
        if (this.monsterManager) {
            this.monsterManager.monsters.forEach(m => {
                if (this.isOnScreen(m)) renderList.push(m);
            });
        }

        // Projectiles
        if (this.monsterMissileQueue) {
            // These are data objects, not sprites with render() methods usually... 
        }

        // Sort by Y for depth
        renderList.sort((a, b) => a.y - b.y);

        // Render All
        renderList.forEach(entity => {
            if (this.isOnScreen(entity)) {
                if (entity.render) {
                    entity.render(ctx, this.camera);
                } else if (entity.image) {
                    // Simple Object Render
                    const screenX = Math.round(entity.x);
                    const screenY = Math.round(entity.y);
                    ctx.drawImage(entity.image, screenX, screenY, entity.width * entity.scale, entity.height * entity.scale);
                }
            }
        });

        if (this.monsterManager) this.monsterManager.render(ctx, this.camera);

        // Effect Layers
        this.projectiles.forEach(p => {
            if (this.isOnScreen(p)) {
                p.render(ctx, this.camera);
            }
        });

        this.explosions.forEach((explosion) => {
            SkillRenderer.drawExplosion(
                ctx,
                explosion.x,
                explosion.y,
                explosion.radius,
                1 - (explosion.life / (explosion.duration || 0.45)),
                {
                    variant: explosion.variant || 'default',
                    collapse: !!explosion.collapse
                }
            );
        });

        const fireballAimGuide = this.player?.getFireballAimGuide?.();
        if (fireballAimGuide) {
            SkillRenderer.drawFireballAimGuide(ctx, fireballAimGuide);
        }

        // v0.00.21: Target Lock-on Marker
        if (this.player && this.player.currentTarget && !this.player.currentTarget.isDead) {
            const t = this.player.currentTarget;
            const isAutoTarget = this.player.currentTargetMode === 'auto';
            const isMonsterTarget = !!t.isMonster || t.type === 'monster' || !!t.typeId;
            if (isMonsterTarget && !this.monsterManager?.monsters?.has(t.id)) {
                this.player.clearCurrentTarget?.();
            } else {
                const isTutorialDummyTarget = t.typeId === 'training_dummy' && !!this.game?.tutorial?.activeTutorial;
                if (!isTutorialDummyTarget && !isAutoTarget) {
                    const tx = isMonsterTarget ? t.x : (t.x + t.width / 2);
                    const ty = isMonsterTarget ? (t.y + ((t.height || 48) / 2)) : (t.y + t.height);
                    SkillRenderer.drawTargetMarker(ctx, tx, ty, t.width || 48, t.height || 48);
                }
            }
        }

        if (this.player) {
            // 렌더링 순서: 플레이어 위에 이펙트
            this.sparks.forEach(s => {
                ctx.globalAlpha = s.life / 0.5; // Fade out
                ctx.fillStyle = s.color;
                ctx.beginPath();
                ctx.arc(Math.round(s.x), Math.round(s.y), Math.random() * 3 + 1, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1.0;

            // 플로팅 텍스트 (최상단)
            this.floatingTexts.forEach(ft => {
                const screenX = Math.round(ft.x);
                const screenY = Math.round(ft.currentY);

                ctx.save();
                ctx.textAlign = 'center';
                // v0.00.55: Dynamic Font Size based on Critical
                if (ft.isCrit) {
                    ctx.font = 'bold 24px "Outfit", sans-serif';
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 3;
                    ctx.strokeText(ft.text, screenX, screenY);
                    ctx.fillStyle = ft.color;
                    ctx.fillText(ft.text, screenX, screenY);

                    if (ft.label) {
                        ctx.font = 'bold 12px sans-serif';
                        ctx.fillStyle = '#fff';
                        ctx.fillText(ft.label, screenX, screenY - 20);
                    }
                } else {
                    ctx.font = 'bold 16px "Outfit", sans-serif';
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 2;
                    ctx.strokeText(ft.text, screenX, screenY);
                    ctx.fillStyle = ft.color;
                    ctx.fillText(ft.text, screenX, screenY);
                }
                ctx.restore();
            });

        }

        ctx.restore();

        // v2.2: Story Fade Overlay (rendered AFTER ctx.restore to cover full screen)
        if (this.game.story?.fadeAlpha > 0) {
            this.game.story.renderFade(ctx, this.game.canvas.width, this.game.canvas.height);
        }
    }
}
