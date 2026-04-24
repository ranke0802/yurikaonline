import Logger from '../utils/Logger.js';

const DEFAULT_ZONE_ID = 'zone_1';
const ZONE_MANIFEST_PATH = 'assets/data/world/zone_manifest.json';
const SUPPORTED_ZONE_TYPES = ['field', 'town', 'dungeon', 'story'];

export default class ZoneManager {
    constructor(resourceManager) {
        this.res = resourceManager;
        this.manifest = null;
        this.manifestLoadPromise = null;
        this.defaultZoneId = DEFAULT_ZONE_ID;
        this.supportedZoneTypes = SUPPORTED_ZONE_TYPES;
        this.currentZone = null;
        this.currentZoneId = DEFAULT_ZONE_ID;
        this.tiles = null;
        this.width = 6400; // v0.00.03: Set default 200*32 to allow center calculation before load
        this.height = 6400;
        this.tileSize = 32;
        this.chunkSize = 512; // 16x16 tiles per chunk
        this.chunks = new Map(); // Chunk caching
    }

    _createFallbackManifest() {
        return {
            schemaVersion: 1,
            defaultZoneId: DEFAULT_ZONE_ID,
            supportedZoneTypes: [...SUPPORTED_ZONE_TYPES],
            zones: [
                {
                    id: DEFAULT_ZONE_ID,
                    type: 'field',
                    path: `assets/data/zones/${DEFAULT_ZONE_ID}.json`,
                    defaultSpawnId: 'default'
                }
            ]
        };
    }

    _normalizeZoneEntry(entry) {
        if (!entry || typeof entry !== 'object') return null;

        const id = typeof entry.id === 'string' && entry.id.trim()
            ? entry.id.trim()
            : null;
        if (!id) return null;

        const type = SUPPORTED_ZONE_TYPES.includes(entry.type) ? entry.type : 'field';
        return {
            ...entry,
            id,
            type,
            path: typeof entry.path === 'string' && entry.path.trim()
                ? entry.path.trim()
                : `assets/data/zones/${id}.json`,
            defaultSpawnId: typeof entry.defaultSpawnId === 'string' && entry.defaultSpawnId.trim()
                ? entry.defaultSpawnId.trim()
                : 'default'
        };
    }

    _normalizeManifest(data) {
        const fallback = this._createFallbackManifest();
        if (!data || typeof data !== 'object') return fallback;

        const zones = Array.isArray(data.zones)
            ? data.zones.map((entry) => this._normalizeZoneEntry(entry)).filter(Boolean)
            : [];

        const defaultZoneId = typeof data.defaultZoneId === 'string' && data.defaultZoneId.trim()
            ? data.defaultZoneId.trim()
            : DEFAULT_ZONE_ID;

        if (!zones.some((entry) => entry.id === DEFAULT_ZONE_ID)) {
            zones.unshift(...fallback.zones.filter((entry) => !zones.some((zone) => zone.id === entry.id)));
        }

        if (!zones.some((entry) => entry.id === defaultZoneId)) {
            Logger.warn(`[ZoneManager] Manifest default zone is missing: ${defaultZoneId}. Falling back to ${DEFAULT_ZONE_ID}.`);
        }

        const supportedZoneTypes = Array.isArray(data.supportedZoneTypes)
            ? data.supportedZoneTypes.filter((type) => SUPPORTED_ZONE_TYPES.includes(type))
            : [];

        return {
            ...data,
            schemaVersion: data.schemaVersion || fallback.schemaVersion,
            defaultZoneId: zones.some((entry) => entry.id === defaultZoneId) ? defaultZoneId : DEFAULT_ZONE_ID,
            supportedZoneTypes: supportedZoneTypes.length > 0 ? supportedZoneTypes : [...SUPPORTED_ZONE_TYPES],
            zones
        };
    }

    async loadManifest(options = {}) {
        if (this.manifest && !options.force) return this.manifest;
        if (this.manifestLoadPromise && !options.force) return this.manifestLoadPromise;

        this.manifestLoadPromise = this.res.loadJSON(ZONE_MANIFEST_PATH)
            .then((data) => {
                this.manifest = this._normalizeManifest(data);
                this.defaultZoneId = this.manifest.defaultZoneId || DEFAULT_ZONE_ID;
                this.supportedZoneTypes = this.manifest.supportedZoneTypes || SUPPORTED_ZONE_TYPES;
                return this.manifest;
            })
            .catch((error) => {
                Logger.warn(`[ZoneManager] Failed to load zone manifest. Falling back to ${DEFAULT_ZONE_ID}.`, error);
                this.manifest = this._createFallbackManifest();
                this.defaultZoneId = DEFAULT_ZONE_ID;
                this.supportedZoneTypes = SUPPORTED_ZONE_TYPES;
                return this.manifest;
            })
            .finally(() => {
                this.manifestLoadPromise = null;
            });

        return this.manifestLoadPromise;
    }

    getManifest() {
        return this.manifest || this._createFallbackManifest();
    }

    getDefaultZoneId() {
        return this.getManifest().defaultZoneId || DEFAULT_ZONE_ID;
    }

    getZoneEntry(zoneId) {
        const id = String(zoneId || '').trim();
        if (!id) return null;
        return (this.getManifest().zones || []).find((entry) => entry.id === id) || null;
    }

    getZonePath(zoneId) {
        const id = this.resolveZoneId(zoneId);
        return this.getZoneEntry(id)?.path || `assets/data/zones/${id}.json`;
    }

    getDefaultSpawnId(zoneId = null) {
        const id = zoneId ? this.resolveZoneId(zoneId) : this.getDefaultZoneId();
        return this.getZoneEntry(id)?.defaultSpawnId || 'default';
    }

    resolveZoneId(zoneId = null) {
        const requestedId = typeof zoneId === 'string' && zoneId.trim()
            ? zoneId.trim()
            : null;
        const manifest = this.getManifest();
        const zones = Array.isArray(manifest.zones) ? manifest.zones : [];

        if (requestedId && (zones.length === 0 || zones.some((entry) => entry.id === requestedId))) {
            return requestedId;
        }

        return manifest.defaultZoneId || DEFAULT_ZONE_ID;
    }

    async loadZone(zoneId = null) {
        await this.loadManifest();

        const resolvedZoneId = this.resolveZoneId(zoneId);
        Logger.log(`Loading Zone: ${resolvedZoneId}`);

        try {
            // 1. Load Zone JSON
            const zoneData = await this.res.loadJSON(this.getZonePath(resolvedZoneId));
            if (!zoneData) {
                throw new Error(`Zone data not found: ${resolvedZoneId}`);
            }

            this.currentZone = {
                ...zoneData,
                id: zoneData.id || resolvedZoneId
            };
            this.currentZoneId = this.currentZone.id || resolvedZoneId;

            // 2. Setup Dimensions
            this.tileSize = zoneData.tileSize || 32;
            this.width = zoneData.width; // Width in pixels
            this.height = zoneData.height; // Height in pixels

            // Validate logic: If width represents tiles (e.g. < 500), treat as tiles? 
            // Better to rely on explicit pixel values from JSON as per zone_1.json (3200)
            if (this.width < 1000) this.width *= this.tileSize; // Backward compat for Tile-based defs
            if (this.height < 1000) this.height *= this.tileSize;

            // 3. Load Background
            // Support different background types (image, tilemap, etc.)
            if (zoneData.background) {
                if (zoneData.background.image) {
                    this.bgImage = await this.res.loadImage(zoneData.background.image);
                    this.bgPattern = null;
                } else if (zoneData.background.src) {
                    // Legacy support
                    this.bgImage = await this.res.loadImage(zoneData.background.src);
                    this.bgPattern = null;
                }
            } else {
                Logger.warn(`No background defined for zone: ${resolvedZoneId}`);
            }

            // 4. Setup Boundaries & Spawns & Objects
            this.boundaries = zoneData.boundaries || { minX: 0, maxX: this.width, minY: 0, maxY: this.height };
            this.spawns = zoneData.spawnPoints || [];
            this.objects = zoneData.objects || [];
            this.portals = zoneData.portals || [];
            this.transitions = zoneData.transitions || [];

            // 4.1 Preload Object Assets
            const assetPromises = this.objects.map(obj => {
                if (obj.visual && obj.visual.image) {
                    return this.res.loadImage(obj.visual.image).catch(e => {
                        Logger.warn(`Failed to preload asset for object ${obj.id}: ${obj.visual.image}`);
                    });
                }
                return Promise.resolve();
            });
            await Promise.all(assetPromises);

            // 5. Clear & Reset Chunks
            this.chunks.clear();

            Logger.log(`Zone loaded: ${this.currentZone.name} (${this.width}x${this.height})`);
            return this.currentZone;

        } catch (e) {
            Logger.error(`Failed to load zone: ${resolvedZoneId}`, e);
            if (resolvedZoneId !== DEFAULT_ZONE_ID) {
                Logger.warn(`[ZoneManager] Falling back to ${DEFAULT_ZONE_ID}.`);
                return this.loadZone(DEFAULT_ZONE_ID);
            }

            // Fallback to avoid crash
            this.currentZone = {
                id: DEFAULT_ZONE_ID,
                name: 'Fallback Field',
                width: 100,
                height: 100,
                objects: [],
                spawnPoints: [{ id: 'default', x: 1500, y: 1900 }],
                portals: [],
                transitions: [],
                background: { type: 'solid', color: '#76b041' }
            };
            this.currentZoneId = DEFAULT_ZONE_ID;
            this.width = 3200;
            this.height = 3200;
            this.boundaries = { minX: 0, maxX: this.width, minY: 0, maxY: this.height };
            this.spawns = this.currentZone.spawnPoints;
            this.objects = [];
            this.portals = [];
            this.transitions = [];
            return this.currentZone;
        }
    }

    getSpawnPoint(id = 'default') {
        if (!Array.isArray(this.spawns) || this.spawns.length === 0) return null;
        const spawnId = typeof id === 'string' && id.trim() ? id.trim() : 'default';
        return this.spawns.find(s => s.id === spawnId)
            || this.spawns.find(s => s.id === 'default')
            || this.spawns[0];
    }

    getBoundaries() {
        return this.boundaries;
    }


    render(ctx, camera) {
        if (!this.currentZone) return;

        // Determine visible chunks
        const startChunkX = Math.floor(camera.x / this.chunkSize);
        const endChunkX = Math.floor((camera.x + camera.width) / this.chunkSize);
        const startChunkY = Math.floor(camera.y / this.chunkSize);
        const endChunkY = Math.floor((camera.y + camera.height) / this.chunkSize);

        for (let cx = startChunkX; cx <= endChunkX; cx++) {
            for (let cy = startChunkY; cy <= endChunkY; cy++) {
                if (cx < 0 || cy < 0 || cx * this.chunkSize >= this.width || cy * this.chunkSize >= this.height) continue;

                const chunkKey = `${cx},${cy}`;
                let chunkCanvas = this.chunks.get(chunkKey);

                if (!chunkCanvas) {
                    chunkCanvas = this.getChunkCanvas(cx, cy);
                    this.chunks.set(chunkKey, chunkCanvas);
                }

                ctx.drawImage(chunkCanvas, cx * this.chunkSize, cy * this.chunkSize);
            }
        }

        // Draw borders
        ctx.strokeStyle = '#2d3436';
        ctx.lineWidth = 5;
        ctx.strokeRect(0, 0, this.width, this.height);
    }

    getChunkCanvas(cx, cy) {
        const canvas = document.createElement('canvas');
        canvas.width = this.chunkSize;
        canvas.height = this.chunkSize;
        const cctx = canvas.getContext('2d');

        if (this.bgImage && this.bgImage.width > 0 && this.bgImage.height > 0) {
            // Draw tile pattern to chunk
            if (!this.bgPattern) {
                // Temporary pattern for drawing to offscreen
                this.bgPattern = canvas.getContext('2d').createPattern(this.bgImage, 'repeat');
            }
            cctx.fillStyle = this.bgPattern;

            // To align pattern with world (0,0), we need to set transform or use offset
            // But since chunks are aligned to chunkSize, if chunkSize is a multiple of bgImage size, it's easy.
            // If not, we translate.
            cctx.save();
            cctx.translate(-(cx * this.chunkSize % this.bgImage.width), -(cy * this.chunkSize % this.bgImage.height));
            cctx.fillRect(0, 0, this.chunkSize + this.bgImage.width, this.chunkSize + this.bgImage.height);
            cctx.restore();
        } else {
            cctx.fillStyle = '#76b041';
            cctx.fillRect(0, 0, this.chunkSize, this.chunkSize);
        }

        // Optional: Draw tile grid for debugging or aesthetics
        cctx.strokeStyle = 'rgba(0,0,0,0.05)';
        cctx.lineWidth = 1;
        for (let x = 0; x < this.chunkSize; x += this.tileSize) {
            cctx.beginPath(); cctx.moveTo(x, 0); cctx.lineTo(x, this.chunkSize); cctx.stroke();
        }
        for (let y = 0; y < this.chunkSize; y += this.tileSize) {
            cctx.beginPath(); cctx.moveTo(0, y); cctx.lineTo(this.chunkSize, y); cctx.stroke();
        }

        return canvas;
    }

}
