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
        this.portalTransitionLock = false;
        this.portalPromptOpen = false;
        this.portalCooldownUntil = 0;
        this.portalRequiresExit = false;
        this.portalArrivalPosition = null;
        this.portalExitMoveDistance = 96;
        this.zoneTransitionOverlay = null;
        this.zoneTransitionHideTimer = null;
        this.zoneTransitionArtRequest = '';

        // v0.33.0: Monster Attack Queue
        this.monsterMissileQueue = [];
        this.monsterMissileTimer = 0;
        this.safeZone = null;
        this.zoneSpawnRules = [];
        this._handleHostChanged = null;
    }

    shouldFreezeWorldForModalUi() {
        if (this.game.story?.isStoryActive) return true;
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

    getRemoteVisualSmoothingContext(entity) {
        if (!entity || !this.camera) {
            return { sameView: false, distanceToLocal: Number.POSITIVE_INFINITY };
        }

        const cam = this.camera;
        const vw = (this.game.canvas.width / this.game.dpr) / this.game.zoom;
        const vh = (this.game.canvas.height / this.game.dpr) / this.game.zoom;
        const margin = 64;
        const ex = entity.x + (entity.width || 0) / 2;
        const ey = entity.y + (entity.height || 0) / 2;
        const sameView = ex >= cam.x - margin && ex <= cam.x + vw + margin
            && ey >= cam.y - margin && ey <= cam.y + vh + margin;

        const local = this.player;
        const distanceToLocal = local
            ? Math.hypot((entity.x || 0) - (local.x || 0), (entity.y || 0) - (local.y || 0))
            : Number.POSITIVE_INFINITY;

        return { sameView, distanceToLocal };
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

    async enter(params = {}) {
        params = params || {};
        Logger.info("[WorldScene] Entering game world...");
        this.ui?.showHUD();
        this.remotePlayers.clear();
        this.monsterManager?.clearAll?.({ preserveNetwork: true });
        this.portalTransitionLock = false;
        this.portalPromptOpen = false;
        this.portalCooldownUntil = params.portalArrival ? Date.now() + 1800 : 0;
        this.portalRequiresExit = !!params.portalArrival;
        this.portalArrivalPosition = null;

        // v0.35.0: Ensure Story Fade is reset to prevent black screen
        if (this.game.story) {
            this.game.story.resetFade();
        }

        // v0.00.02: Restore asset loading which was cut from main.js
        if (this.game.updateLoading) this.game.updateLoading('월드 데이터 다운로드 중...', 40);

        // 1. Load Zone Data
        const requestedZoneId = typeof params.zoneId === 'string' && params.zoneId.trim()
            ? params.zoneId.trim()
            : null;
        const zoneData = await this.game.zone.loadZone(requestedZoneId || null);
        const transitionMeta = this.getZoneTransitionMeta(zoneData, params.transitionMeta || null);
        if (params.transitionMeta || params.portalArrival) {
            this.showZoneTransitionOverlay(transitionMeta);
        }
        const zoneId = this.game.zone.currentZoneId || zoneData?.id || requestedZoneId || 'zone_1';
        const loadedZoneId = zoneData?.id || zoneId || 'zone_1';
        const defaultSpawnId = zoneData?.defaultSpawnId || this.game.zone.getDefaultSpawnId?.(loadedZoneId) || 'default';
        const requestedSpawnId = typeof params.spawnId === 'string' && params.spawnId.trim()
            ? params.spawnId.trim()
            : defaultSpawnId;
        const routeSpawn = this.game.zone.getSpawnPoint(requestedSpawnId)
            || this.game.zone.getSpawnPoint(defaultSpawnId)
            || { x: 1500, y: 1900 };

        // 2. Setup Camera Bounds
        if (zoneData) {
            this.zoneSpawnRules = zoneData.monsterSpawns || zoneData.spawns || [];
            this.camera.setWorldBounds(this.game.zone.width, this.game.zone.height);
            this.safeZone = {
                x: routeSpawn.x,
                y: routeSpawn.y,
                radius: 260
            };

            // 3. Setup Monster Spawns
            if (this.net.isHost && this.monsterManager) {
                this._ensureHostSpawnRulesLoaded({ clearExisting: true, primeSpawn: false });
            }

            // 4. Place Objects
            // v2.0: Dynamic Object Placement from JSON
            this.mapObjects = []; // Reset objects
            this.staticColliders = []; // For collision checking

            if (zoneData.objects) {
                Logger.log(`[WorldScene] Placing ${zoneData.objects.length} objects...`);
                zoneData.objects.forEach(objDef => {
                    this._createMapObject(objDef);
                });
            }
        }

        try {
            await this.resources.loadImage('/assets/resource/magicion_front/1.webp');
        } catch (e) {
            Logger.error('Failed to load legacy character sprite', e);
        }

        const user = params.user || this.game.auth?.currentUser || window.firebase?.auth?.().currentUser || null;
        if (!user) {
            Logger.error('[WorldScene] Cannot enter world without an authenticated user.');
            return;
        }

        const startX = Number.isFinite(params.startX) ? params.startX : routeSpawn.x;
        const startY = Number.isFinite(params.startY) ? params.startY : routeSpawn.y;
        const profile = params.profile || null;
        const localName = params.localName;

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
        this.game.localPlayer = this.player; // Global reference for UIManager / MonsterAI
        let shouldRecoverFromStoredDeath = false;


        if (profile) {
            Logger.debug(`[WorldScene] Loading Player Profile:`, profile);
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
            this.player.name = profile.name || localName || user.displayName || "아빠";
            this.player.characterId = profile.characterId === 'yurika' ? 'yurika' : 'father';
            this.player.uiLayout = profile.uiLayout || null;
            this.player.clientSettings = profile.clientSettings || null;
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
                this.game.quests.restoreFromLegacy(this.player.questData);
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

            // v0.00.84: Restore saved position with params priority
            const fallbackSpawn = routeSpawn || this.game.zone.getSpawnPoint(defaultSpawnId) || { x: 1500, y: 1900 };
            const shouldRestoreProfilePosition = !requestedZoneId && !params.spawnId;
            const posX = shouldRecoverFromStoredDeath
                ? fallbackSpawn.x
                : (shouldRestoreProfilePosition ? (profile.x ?? startX) : startX);
            const posY = shouldRecoverFromStoredDeath
                ? fallbackSpawn.y
                : (shouldRestoreProfilePosition ? (profile.y ?? startY) : startY);

            if (typeof posX === 'number' && typeof posY === 'number') {
                this.player.x = posX;
                this.player.y = posY;
                Logger.debug(`[WorldScene] Position set to: (${this.player.x}, ${this.player.y})`);

                // v2.3.3: Boundary Check (Move to after Restoration)
                if (this.player.x >= this.game.zone.width || this.player.y >= this.game.zone.height) {
                    Logger.warn(`[WorldScene] Restoration out of bounds (${this.player.x}, ${this.player.y}). Resetting.`);
                    const spawn = this.game.zone.getSpawnPoint(defaultSpawnId) || fallbackSpawn || { x: 1500, y: 1900 };
                    this.player.x = spawn.x;
                    this.player.y = spawn.y;
                    this.player.saveState();
                }

                // v2.3.4: Collision Fail-safe (Stuck at old spawn or invalid place)
                if (this.checkCollision(this.player.x, this.player.y, this.player.width, this.player.height)) {
                    Logger.warn(`[WorldScene] Player stuck in collision at (${this.player.x}, ${this.player.y}). Resetting to safe spawn.`);
                    const spawn = this.game.zone.getSpawnPoint(defaultSpawnId) || fallbackSpawn || { x: 1500, y: 1900 };
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

        if (this.game.openingPrologueCompleted && this.player?.questData && !this.player.questData.prologueCompleted) {
            this.player.questData.prologueCompleted = true;
            this.player.saveProfilePatch?.(['questData'], {
                debounceMs: 0,
                reason: 'sync_opening_prologue_completion'
            });
        }

        const shouldDeferZoneParticipation = !this.player.questData.basicTrainingCompleted &&
            !this.player.questData.slimeQuestClaimed &&
            (((this.player.questData.slimeKills || 0) === 0) || !!this.player.questData.prologueCompleted);

        this.net.setZoneParticipationEnabled(!shouldDeferZoneParticipation);

        this.ui?.loadPlayerSettings?.(this.player.clientSettings || null);
        this.player.init(this.input, this.resources, this.net);
        if (params.portalArrival && this.player) {
            this.portalArrivalPosition = {
                x: this.player.x,
                y: this.player.y
            };
        }
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
        this.net.resetToSoloPartyState(false);
        this.net.handleLocalPartyStateChanged('world_enter_force_solo');
        this.player.grantSpawnProtection(5);
        this.ui?.loadPlayerUiLayout?.(this.player.uiLayout || null);

        // Setup Network Handlers
        this._setupNetworkHandlers();

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
            this.player.saveState();

            // v0.00.15: Self-heal Name Mapping (Force update name->uid)
            // This fixes the issue where an old UID is linked to the name
            if (this.player.name) {
                this.net.claimName(this.player.id, this.player.name);
                Logger.debug(`[WorldScene] Claimed name mapping: ${this.player.name} -> ${this.player.id}`);
            }
        }
        // v0.00.57: Play BGM
        if (this.game.sound) {
            this.game.sound.loadAndPlayBgm(zoneData?.background?.music || 'bgm_cabin');
        }
        if (params.zoneId && zoneData?.name) {
            this.ui?.showCenterMessage?.(
                this.game.i18n?.t?.('system.zoneEnter', { name: zoneData.name }) || zoneData.name,
                '#bfe8ff'
            );
        }
        if (params.transitionMeta || params.portalArrival) {
            this.hideZoneTransitionOverlay(520);
        }

        if (shouldDeferZoneParticipation) {
            if (!this.player.questData.prologueCompleted && this.game.story) {
                this.game.story.startStory('prologue');
            } else if (!this.player.questData.chapter1FatherOathCompleted && this.game.story) {
                this.game.story.startStory('chapter1_father_oath');
            } else {
                this.game.tutorial?.startTutorial?.('basic_training');
            }
        } else {
            this.activateZoneParticipation();
        }
        this.ui?.armBrowserBackExitGuard?.();
    }

    isPointInSafeZone(x, y, padding = 0) {
        if (!this.safeZone) return false;
        const dx = x - this.safeZone.x;
        const dy = y - this.safeZone.y;
        return Math.sqrt(dx * dx + dy * dy) <= (this.safeZone.radius + padding);
    }

    isPlayerProtected(player) {
        if (!player) return false;

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
        rp.setCharacterId?.(data.characterId || 'father', this.resources);
        if (typeof data.level === 'number') {
            rp.level = data.level;
        }
        if (data.h) {
            rp.hp = data.h[0];
            rp.maxHp = data.h[1];
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
    }

    _ensureHostSpawnRulesLoaded(options = {}) {
        if (!this.net?.isHost || !this.monsterManager) return false;

        const spawnRules = Array.isArray(this.zoneSpawnRules) && this.zoneSpawnRules.length > 0
            ? this.zoneSpawnRules
            : (this.game.zone?.currentZone?.monsterSpawns || this.game.zone?.currentZone?.spawns || []);

        if (!Array.isArray(spawnRules) || spawnRules.length === 0) {
            this.monsterManager.setSpawnRules([]);
            if (options.clearExisting) {
                this.monsterManager.clearAll();
            }
            return false;
        }

        this.monsterManager.setSpawnRules(spawnRules);

        if (options.clearExisting) {
            this.monsterManager.clearAll();
        }

        if (options.primeSpawn !== false && !this.monsterManager.isSpawnSuppressed?.()) {
            this.monsterManager.primeSpawnCycle();
        }

        return true;
    }

    getPlayerProfileSnapshotForTransition() {
        const player = this.player;
        if (!player) return null;

        return {
            level: player.level,
            exp: player.exp,
            maxExp: player.maxExp,
            hp: player.hp,
            mp: player.mp,
            manastone: player.manastone,
            vitality: player.vitality,
            defense: player.defense || 0,
            intelligence: player.intelligence,
            wisdom: player.wisdom,
            agility: player.agility,
            statPoints: player.statPoints,
            skillLevels: player.skillLevels,
            autoAttackEnabled: !!player.autoAttackEnabled,
            inventory: player.inventory,
            equipment: player.equipment,
            questData: player.questData,
            uiLayout: player.uiLayout,
            clientSettings: player.clientSettings,
            recoveryUid: player.recoveryUid || player.id,
            name: player.name,
            characterId: player.characterId === 'yurika' ? 'yurika' : 'father',
            party: player.party,
            hostility: player.hostileTargets
                ? Object.fromEntries(player.hostileTargets.entries())
                : (player.hostility || {}),
            x: Math.round(player.x),
            y: Math.round(player.y),
            ts: Date.now()
        };
    }

    isPlayerInsideRect(rect) {
        if (!this.player || !rect) return false;
        const px = this.player.x;
        const py = this.player.y;
        const pw = this.player.width || 0;
        const ph = this.player.height || 0;
        const rx = Number(rect.x || 0);
        const ry = Number(rect.y || 0);
        const rw = Number(rect.width || rect.w || 0);
        const rh = Number(rect.height || rect.h || 0);

        return px < rx + rw && px + pw > rx && py < ry + rh && py + ph > ry;
    }

    findActivePortalAtPlayer() {
        const portals = this.game.zone?.portals || this.game.zone?.currentZone?.portals || [];
        if (!Array.isArray(portals) || portals.length === 0) return null;

        return portals.find((portal) => {
            if (!portal || portal.enabled === false) return false;
            if (!portal.target?.zoneId) return false;
            const trigger = portal.trigger || {};
            if (trigger.type !== 'rect') return false;
            return this.isPlayerInsideRect(trigger);
        }) || null;
    }

    getZoneTransitionMeta(zoneData = null, override = null) {
        const zoneOverlay = zoneData?.transitionOverlay || this.game.zone?.transitionOverlay || {};
        const meta = { ...zoneOverlay, ...(override || {}) };
        return {
            type: meta.type || zoneData?.type || 'field',
            label: meta.label || meta.title || zoneData?.name || '다음 지역',
            description: meta.description || meta.subtitle || '새 지역을 불러오는 중입니다.',
            conceptArt: meta.loadingArt || meta.conceptArt || meta.conceptArtPath || meta.image || ''
        };
    }

    buildPortalTransitionMeta(portal) {
        const transition = portal?.transition || {};
        return {
            type: transition.type || 'field',
            label: transition.label || portal?.label || portal?.name || '다음 지역',
            description: transition.description || '주변의 기척이 바뀌고 있습니다.',
            conceptArt: transition.loadingArt || transition.conceptArt || transition.conceptArtPath || transition.image || ''
        };
    }

    ensureZoneTransitionOverlay() {
        if (this.zoneTransitionOverlay?.isConnected) return this.zoneTransitionOverlay;

        const overlay = document.createElement('div');
        overlay.id = 'world-transition-overlay';
        overlay.className = 'world-transition-overlay hidden';
        overlay.setAttribute('aria-hidden', 'true');

        const art = document.createElement('div');
        art.className = 'world-transition-art';

        const copy = document.createElement('div');
        copy.className = 'world-transition-copy';

        const kicker = document.createElement('div');
        kicker.className = 'world-transition-kicker';
        kicker.textContent = this.game.i18n?.t?.('system.transitionKicker') || '이동 중';

        const title = document.createElement('h2');
        title.className = 'world-transition-title';

        const description = document.createElement('p');
        description.className = 'world-transition-description';

        const bar = document.createElement('div');
        bar.className = 'world-transition-bar';

        copy.append(kicker, title, description, bar);
        overlay.append(art, copy);
        document.body.appendChild(overlay);

        this.zoneTransitionOverlay = overlay;
        return overlay;
    }

    showZoneTransitionOverlay(meta = {}) {
        if (this.zoneTransitionHideTimer) {
            window.clearTimeout(this.zoneTransitionHideTimer);
            this.zoneTransitionHideTimer = null;
        }

        const overlay = this.ensureZoneTransitionOverlay();
        const normalized = this.getZoneTransitionMeta(this.game.zone?.currentZone || null, meta);
        const title = overlay.querySelector('.world-transition-title');
        const description = overlay.querySelector('.world-transition-description');
        const art = overlay.querySelector('.world-transition-art');
        const theme = String(normalized.type || 'field').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'field';

        overlay.dataset.theme = theme;
        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');
        window.requestAnimationFrame?.(() => {
            if (this.zoneTransitionOverlay === overlay && overlay.getAttribute('aria-hidden') === 'false') {
                overlay.classList.add('is-visible');
            }
        });
        if (!window.requestAnimationFrame) overlay.classList.add('is-visible');
        if (title) title.textContent = normalized.label;
        if (description) description.textContent = normalized.description;
        if (art) {
            art.style.backgroundImage = '';
            art.dataset.hasArt = 'false';
        }

        const conceptArt = typeof normalized.conceptArt === 'string' ? normalized.conceptArt.trim() : '';
        this.zoneTransitionArtRequest = conceptArt;
        if (conceptArt && art) {
            const artPromise = this.resources?.loadImage?.(conceptArt);
            if (artPromise?.then) {
                artPromise.then(() => {
                    if (this.zoneTransitionArtRequest !== conceptArt) return;
                    art.style.backgroundImage = `url("${conceptArt.replace(/"/g, '\\"')}")`;
                    art.dataset.hasArt = 'true';
                })
                .catch(() => {
                    if (this.zoneTransitionArtRequest === conceptArt) {
                        art.style.backgroundImage = '';
                        art.dataset.hasArt = 'false';
                    }
                });
            }
        }
    }

    hideZoneTransitionOverlay(delayMs = 0) {
        const overlay = this.zoneTransitionOverlay;
        if (!overlay) return;

        const hide = () => {
            overlay.classList.remove('is-visible');
            overlay.setAttribute('aria-hidden', 'true');
            this.zoneTransitionHideTimer = window.setTimeout(() => {
                overlay.classList.add('hidden');
                this.zoneTransitionHideTimer = null;
            }, 190);
        };

        if (this.zoneTransitionHideTimer) {
            window.clearTimeout(this.zoneTransitionHideTimer);
        }
        this.zoneTransitionHideTimer = window.setTimeout(hide, Math.max(0, delayMs));
    }

    updatePortalTransitions() {
        if (this.portalTransitionLock || this.portalPromptOpen || this.game.story?.isStoryActive) return;
        const portal = this.findActivePortalAtPlayer();
        if (this.portalRequiresExit) {
            const origin = this.portalArrivalPosition;
            const movedEnough = !origin || !this.player
                || Math.hypot((this.player.x || 0) - origin.x, (this.player.y || 0) - origin.y) >= this.portalExitMoveDistance;
            if (!portal && movedEnough) {
                this.portalRequiresExit = false;
                this.portalArrivalPosition = null;
            }
            return;
        }
        if (Date.now() < this.portalCooldownUntil) return;
        if (!portal) return;

        const label = portal.label || portal.name || '다음 지역';
        const requiresConfirmation = portal.transition?.requiresConfirmation !== false;

        if (requiresConfirmation && this.ui?.showConfirm) {
            this.portalPromptOpen = true;
            this.ui.showConfirm(`${label}(으)로 이동하시겠습니까?`, (confirmed) => {
                this.portalPromptOpen = false;
                if (confirmed) {
                    this.transitionThroughPortal(portal);
                } else {
                    this.portalTransitionLock = true;
                    this.portalRequiresExit = true;
                    this.portalArrivalPosition = this.player ? { x: this.player.x, y: this.player.y } : null;
                    this.portalCooldownUntil = Date.now() + 650;
                    window.setTimeout(() => {
                        this.portalTransitionLock = false;
                    }, 650);
                }
            });
            return;
        }

        this.transitionThroughPortal(portal);
    }

    async transitionThroughPortal(portal) {
        if (!portal?.target?.zoneId || this.portalTransitionLock) return;
        this.portalTransitionLock = true;

        const targetZoneId = portal.target.zoneId;
        const targetSpawnId = portal.target.spawnId || 'default';
        const transitionMeta = this.buildPortalTransitionMeta(portal);
        this.showZoneTransitionOverlay(transitionMeta);
        this.ui?.showCenterMessage?.(
            this.game.i18n?.t?.('system.portalMoving', { label: portal.label || '다음 지역' }) || `${portal.label || '다음 지역'} 이동 중...`,
            '#ffd88a'
        );
        this.player?.saveState?.(true, {
            debounceMs: 0,
            reason: `portal_${portal.id || targetZoneId}`
        });

        if (this.game.story) {
            this.game.story.fadeAlpha = Math.max(this.game.story.fadeAlpha || 0, 0.25);
        }

        await this.game.sceneManager.changeScene('world', {
            user: this.game.auth?.currentUser || window.firebase?.auth?.().currentUser || null,
            profile: this.getPlayerProfileSnapshotForTransition(),
            localName: this.player?.name,
            zoneId: targetZoneId,
            spawnId: targetSpawnId,
            transitionMeta,
            portalArrival: {
                fromZoneId: this.game.zone?.currentZoneId || this.game.zone?.currentZone?.id || null,
                fromPortalId: portal.id || null,
                targetSpawnId
            }
        });
    }

    isRectNearViewport(rect, margin = 160) {
        if (!this.camera || !rect) return true;
        const vw = (this.game.canvas.width / this.game.dpr) / this.game.zoom;
        const vh = (this.game.canvas.height / this.game.dpr) / this.game.zoom;
        const x = Number(rect.x || 0);
        const y = Number(rect.y || 0);
        const w = Number(rect.width || rect.w || 0);
        const h = Number(rect.height || rect.h || 0);

        return x + w >= this.camera.x - margin
            && x <= this.camera.x + vw + margin
            && y + h >= this.camera.y - margin
            && y <= this.camera.y + vh + margin;
    }

    renderZonePortals(ctx) {
        const portals = this.game.zone?.portals || this.game.zone?.currentZone?.portals || [];
        if (!Array.isArray(portals) || portals.length === 0) return;

        ctx.save();
        portals.forEach((portal, index) => {
            if (!portal || portal.enabled === false) return;
            const trigger = portal.trigger || portal.bounds;
            if (!trigger || (trigger.type && trigger.type !== 'rect')) return;
            if (!this.isRectNearViewport(trigger)) return;

            const x = Number(trigger.x || 0);
            const y = Number(trigger.y || 0);
            const w = Number(trigger.width || trigger.w || 0);
            const h = Number(trigger.height || trigger.h || 0);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;

            const cx = x + w / 2;
            const cy = y + h / 2;
            const pulse = 0.5 + Math.sin((this.time * 3.2) + index) * 0.5;
            const radius = Math.max(w, h) * (0.62 + pulse * 0.1);
            const gradient = ctx.createRadialGradient(cx, cy, 8, cx, cy, radius);
            gradient.addColorStop(0, `rgba(174, 232, 255, ${0.16 + pulse * 0.08})`);
            gradient.addColorStop(0.58, 'rgba(96, 196, 255, 0.08)');
            gradient.addColorStop(1, 'rgba(96, 196, 255, 0)');

            ctx.globalAlpha = 1;
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(cx, cy, radius * 0.72, radius * 0.38, 0, 0, Math.PI * 2);
            ctx.fill();

            const label = portal.label || portal.name;
            if (label) {
                ctx.font = '700 15px "Noto Sans KR", "Outfit", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const labelY = y - 22;
                const textWidth = Math.min(260, ctx.measureText(label).width + 24);
                ctx.fillStyle = 'rgba(5, 12, 24, 0.72)';
                ctx.strokeStyle = 'rgba(177, 229, 255, 0.64)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(cx - textWidth / 2, labelY - 15, textWidth, 30, 8);
                else ctx.rect(cx - textWidth / 2, labelY - 15, textWidth, 30);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#ecfbff';
                ctx.fillText(label, cx, labelY, textWidth - 16);
            }
        });
        ctx.restore();
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
        if (!this._handleHostChanged) {
            const promoteToHost = () => {
                this._ensureHostSpawnRulesLoaded();
                this.monsterManager?.resetCombatTargets?.({ clearChargeState: true });
                this.monsterManager?.restoreAuthoritativeMonstersFromHostSnapshot?.()
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
            this.net.on('hostChanged', this._handleHostChanged);
            if (this.net.isHost) {
                promoteToHost();
            }
        }

        this.net.on('rewardReceived', (data) => {
            if (this.player) this.player.receiveReward(data);
        });

        // v0.00.43: Center Screen System Messages
        this.net.on('systemMessage', (data) => {
            if (this.ui) this.ui.showCenterMessage(data.message, data.color);
        });

        this.net.on('monsterDamageReceived', (data) => {
            const m = this.monsterManager?.monsters.get(data.mid);
            if (m) this.game.addSpark(m.x, m.y);
        });

        // v2.1: Emote Sync
        this.net.on('emoteReceived', (data) => {
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

        this.net.on('playerDamageReceived', (data) => {
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

        this.net.on('playerJoined', (data) => {
            if (!this.net.isZoneParticipationEnabled()) return;
            this._spawnRemotePlayerFromData(data);
        });

        this.net.on('playerUpdate', (data) => {
            if (!this.net.isZoneParticipationEnabled()) return;
            if (!this.remotePlayers.has(data.id)) {
                this._spawnRemotePlayerFromData(this.net.remotePlayers.get(data.id) || data);
            }
            const rp = this.remotePlayers.get(data.id);
            if (rp) rp.onServerUpdate(data);
        });

        this.net.on('playerLeft', (id) => {
            this.remotePlayers.delete(id);
        });

        this.net.on('playerAttack', (data) => {
            if (!this.net.isZoneParticipationEnabled()) return;
            if (this.shouldSuppressTransientWorldEffects()) return;
            const rp = this._getOrSpawnRemotePlayer(data.id, data);
            if (rp) rp.triggerAttack(data);
        });

        // v0.00.37: Channeling sync for casting effects (spark, magic circle, attack motion)
        this.net.on('playerChanneling', (data) => {
            if (!this.net.isZoneParticipationEnabled()) return;
            if (this.shouldSuppressTransientWorldEffects()) return;
            const rp = this._getOrSpawnRemotePlayer(data.id, data);
            if (rp) rp.triggerChanneling(data);
        });

        this.net.on('playerHpUpdate', (data) => {
            if (!this.net.isZoneParticipationEnabled()) return;
            const rp = this._getOrSpawnRemotePlayer(data.id, data);
            if (rp) {
                rp.onHpUpdate(data);
                this.ui?.updatePartyUI?.();
            }
        });

        // v0.33.0: Monster Attack Sync
        this.net.on('monsterAttack', (data) => {
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
        this.ui?.disarmBrowserBackExitGuard?.();
        if (this._handleHostChanged) {
            this.net.off('hostChanged', this._handleHostChanged);
            this._handleHostChanged = null;
        }
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

    update(dt) {
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

            this.updatePortalTransitions();

            // Sync Position
            this.net.sendMovePacket(
                this.player.x,
                this.player.y,
                this.player.vx,
                this.player.vy,
                this.player.name
            );

            const landscapeFramingOffsetY = this.ui?.isMobileLandscapeViewport?.()
                ? Math.min(58, Math.max(34, this.camera.height * 0.12))
                : 0;
            if (Math.abs(landscapeFramingOffsetY - this._lastLandscapeFramingOffsetY) > 0.5) {
                this.camera.setFramingOffset(0, landscapeFramingOffsetY);
                this._lastLandscapeFramingOffsetY = landscapeFramingOffsetY;
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
                rp.setVisualSmoothingContext?.(this.getRemoteVisualSmoothingContext(rp));
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
        const visual = def.visual || {};
        const imageCandidates = [visual.generatedImage, visual.image, visual.fallbackImage]
            .filter((url) => typeof url === 'string' && url.trim());
        const loadedImagePath = imageCandidates.find((url) => this.resources.getImage(url));
        const imagePath = loadedImagePath || imageCandidates[0] || '';
        const hasGeneratedImage = typeof visual.generatedImage === 'string' && !!visual.generatedImage.trim();
        const obj = {
            id: def.id,
            type: def.type,
            x: def.x,
            y: def.y,
            width: visual.width || 32,
            height: visual.height || 32,
            image: loadedImagePath ? this.resources.getImage(loadedImagePath) : null,
            imagePath,
            hasGeneratedImage,
            visual,
            scale: visual.scale || 1.0,
            collision: def.collision,
            interaction: def.interaction,
            label: def.label || def.name || '',
            zIndex: Number.isFinite(def.zIndex) ? def.zIndex : def.y // Simple Y-sort base
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

    renderMapObject(ctx, entity) {
        const x = Math.round(entity.x);
        const y = Math.round(entity.y);
        const w = Math.max(12, (entity.width || 32) * (entity.scale || 1));
        const h = Math.max(12, (entity.height || 32) * (entity.scale || 1));
        const visual = entity.visual || {};
        const shouldUseImage = !!entity.image
            && (entity.hasGeneratedImage || visual.allowImage === true);

        if (shouldUseImage) {
            ctx.save();
            ctx.globalAlpha = Number.isFinite(visual.opacity) ? Math.max(0, Math.min(1, visual.opacity)) : 1;
            ctx.shadowColor = visual.shadowColor || 'rgba(0, 0, 0, 0.22)';
            ctx.shadowBlur = Number.isFinite(visual.shadowBlur) ? Math.max(0, visual.shadowBlur) : 10;
            ctx.shadowOffsetY = Number.isFinite(visual.shadowOffsetY) ? visual.shadowOffsetY : 5;
            if (visual.filter) ctx.filter = visual.filter;
            if (visual.mirrorX) {
                ctx.translate(x + w, y);
                ctx.scale(-1, 1);
                ctx.drawImage(entity.image, 0, 0, w, h);
            } else {
                ctx.drawImage(entity.image, x, y, w, h);
            }
            if (visual.tint) {
                ctx.globalCompositeOperation = 'source-atop';
                ctx.shadowColor = 'transparent';
                ctx.fillStyle = visual.tint;
                if (visual.mirrorX) ctx.fillRect(0, 0, w, h);
                else ctx.fillRect(x, y, w, h);
            }
            ctx.restore();
            return;
        }

        if (visual.allowProcedural !== true) {
            return;
        }

        ctx.save();
        ctx.fillStyle = 'rgba(7, 12, 18, 0.18)';
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h * 0.84, w * 0.42, Math.max(6, h * 0.08), 0, 0, Math.PI * 2);
        ctx.fill();

        if (entity.type === 'path') {
            const variant = visual.variant || 'meadow';
            const isDark = variant === 'forest' || variant === 'dungeon';
            const grd = ctx.createLinearGradient(x, y, x + w, y + h);
            grd.addColorStop(0, isDark ? 'rgba(58, 53, 48, 0.58)' : 'rgba(130, 110, 72, 0.56)');
            grd.addColorStop(0.5, isDark ? 'rgba(111, 96, 74, 0.5)' : 'rgba(180, 158, 105, 0.48)');
            grd.addColorStop(1, isDark ? 'rgba(43, 40, 39, 0.52)' : 'rgba(96, 82, 58, 0.5)');
            ctx.fillStyle = grd;
            ctx.strokeStyle = isDark ? 'rgba(184, 224, 213, 0.18)' : 'rgba(235, 220, 164, 0.28)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + w * 0.08, y + h * 0.58);
            ctx.bezierCurveTo(x + w * 0.34, y + h * (visual.curveA || 0.34), x + w * 0.66, y + h * (visual.curveB || 0.78), x + w * 0.92, y + h * 0.48);
            ctx.lineTo(x + w * 0.94, y + h * 0.68);
            ctx.bezierCurveTo(x + w * 0.66, y + h * 0.92, x + w * 0.32, y + h * 0.54, x + w * 0.06, y + h * 0.78);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = isDark ? 'rgba(124, 232, 205, 0.16)' : 'rgba(255, 246, 198, 0.24)';
            for (let i = 0; i < 7; i++) {
                const sx = x + w * (0.14 + i * 0.12);
                const sy = y + h * (0.6 + Math.sin(i * 1.9) * 0.08);
                ctx.beginPath();
                ctx.ellipse(sx, sy, 4 + (i % 3), 2.5, -0.25, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (entity.type === 'terrain_patch') {
            const grd = ctx.createRadialGradient(x + w / 2, y + h * 0.55, 8, x + w / 2, y + h * 0.58, Math.max(w, h) * 0.48);
            grd.addColorStop(0, 'rgba(115, 204, 144, 0.58)');
            grd.addColorStop(0.72, 'rgba(48, 127, 82, 0.38)');
            grd.addColorStop(1, 'rgba(36, 92, 62, 0)');
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.ellipse(x + w / 2, y + h * 0.58, w * 0.44, h * 0.26, -0.08, 0, Math.PI * 2);
            ctx.fill();
            for (let i = 0; i < 10; i++) {
                const px = x + w * (0.15 + ((i * 37) % 70) / 100);
                const py = y + h * (0.42 + ((i * 19) % 36) / 100);
                ctx.fillStyle = i % 2 ? 'rgba(255, 225, 132, 0.72)' : 'rgba(168, 239, 224, 0.7)';
                ctx.beginPath();
                ctx.arc(px, py, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (entity.type === 'forest_cluster') {
            const treeCount = Math.max(3, Math.min(7, Math.round(w / 70)));
            for (let i = 0; i < treeCount; i++) {
                const tx = x + (w * (i + 0.5) / treeCount) + Math.sin(i * 1.7) * 12;
                const ty = y + h * (0.44 + (i % 2) * 0.08);
                const treeH = Math.max(76, h * (0.5 + (i % 3) * 0.06));
                ctx.fillStyle = 'rgba(44, 35, 24, 0.92)';
                ctx.fillRect(tx - 5, ty, 10, treeH * 0.34);
                ctx.fillStyle = i % 2 ? '#123526' : '#164331';
                ctx.beginPath();
                ctx.moveTo(tx, ty - treeH * 0.58);
                ctx.lineTo(tx + treeH * 0.28, ty + treeH * 0.18);
                ctx.lineTo(tx - treeH * 0.28, ty + treeH * 0.18);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = 'rgba(104, 236, 204, 0.18)';
                ctx.beginPath();
                ctx.arc(tx + treeH * 0.08, ty - treeH * 0.12, treeH * 0.08, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (entity.type === 'signpost') {
            ctx.fillStyle = '#5b402b';
            ctx.fillRect(x + w * 0.44, y + h * 0.28, Math.max(7, w * 0.12), h * 0.58);
            ctx.fillStyle = '#9a7048';
            ctx.strokeStyle = 'rgba(22, 12, 8, 0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const boardX = x - w * 0.52;
            const boardY = y + h * 0.18;
            const boardW = Math.max(76, w * 2.1);
            const boardH = Math.max(28, h * 0.34);
            ctx.roundRect?.(boardX, boardY, boardW, boardH, 5);
            if (!ctx.roundRect) ctx.rect(boardX, boardY, boardW, boardH);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fff3cf';
            ctx.font = '700 10px "Noto Sans KR", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(entity.label || '길목', boardX + boardW / 2, boardY + boardH * 0.62, boardW - 12);
        } else if (entity.type === 'ruin') {
            ctx.fillStyle = 'rgba(94, 101, 100, 0.76)';
            ctx.strokeStyle = 'rgba(191, 229, 225, 0.22)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 5; i++) {
                const sx = x + 18 + i * (w / 6);
                const sy = y + h * 0.55 + Math.sin(i) * 8;
                ctx.beginPath();
                ctx.roundRect?.(sx, sy, 34, 22, 4);
                if (!ctx.roundRect) ctx.rect(sx, sy, 34, 22);
                ctx.fill();
                ctx.stroke();
            }
        } else {
            const grd = ctx.createLinearGradient(x, y, x, y + h);
            grd.addColorStop(0, 'rgba(137, 158, 148, 0.7)');
            grd.addColorStop(1, 'rgba(70, 87, 78, 0.82)');
            ctx.fillStyle = grd;
            ctx.strokeStyle = 'rgba(225, 247, 233, 0.28)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect?.(x + w * 0.18, y + h * 0.18, w * 0.64, h * 0.56, 8);
            if (!ctx.roundRect) ctx.rect(x + w * 0.18, y + h * 0.18, w * 0.64, h * 0.56);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = 'rgba(185, 244, 224, 0.16)';
            ctx.beginPath();
            ctx.ellipse(x + w * 0.5, y + h * 0.34, w * 0.22, h * 0.08, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
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
        this.renderZonePortals(ctx);

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
        renderList.sort((a, b) => (a.zIndex ?? a.y) - (b.zIndex ?? b.y));

        // Render All
        renderList.forEach(entity => {
            if (this.isOnScreen(entity)) {
                if (entity.render) {
                    entity.render(ctx, this.camera);
                } else if (entity.type) {
                    this.renderMapObject(ctx, entity);
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
