import Logger from '../utils/Logger.js';

export default class ZoneManager {
    constructor(resourceManager) {
        this.res = resourceManager;
        this.currentZone = null;
        this.tiles = null;
        this.width = 6400; // v0.00.03: Set default 200*32 to allow center calculation before load
        this.height = 6400;
        this.tileSize = 32;
        this.chunkSize = 512; // 16x16 tiles per chunk
        this.chunks = new Map(); // Chunk caching
        this.zoneCatalog = [];
        this.zoneCatalogPromise = null;
        this.bgImage = null;
        this.bgPattern = null;
    }

    async loadZoneCatalog(options = {}) {
        if (this.zoneCatalog.length > 0 && !options.force) {
            return this.zoneCatalog;
        }
        if (this.zoneCatalogPromise && !options.force) {
            return this.zoneCatalogPromise;
        }

        this.zoneCatalogPromise = (async () => {
            try {
                const data = await this.res.loadJSON('assets/data/zones/zone_catalog.json');
                const zones = Array.isArray(data?.zones) ? data.zones : [];
                this.zoneCatalog = zones
                    .filter((zone) => zone?.id && zone?.name)
                    .map((zone, index) => ({
                        ...zone,
                        order: Number.isFinite(zone.order) ? zone.order : index,
                        requiredLevel: Math.max(1, Number(zone.requiredLevel || 1))
                    }))
                    .sort((a, b) => a.order - b.order);
            } catch (error) {
                Logger.warn('Failed to load zone catalog; using the starting field only.', error);
                this.zoneCatalog = [{
                    id: 'zone_1',
                    name: '바람 언덕',
                    subtitle: 'Starting Field',
                    requiredLevel: 1,
                    recommendedLevel: { min: 1, max: 4 },
                    normalMonsters: [{ id: 'slime', name: '슬라임' }],
                    boss: { id: 'king_slime', name: '대왕 슬라임', weaponName: '마력의 지팡이' },
                    order: 0
                }];
            } finally {
                this.zoneCatalogPromise = null;
            }
            return this.zoneCatalog;
        })();

        return this.zoneCatalogPromise;
    }

    getZoneMeta(zoneId) {
        return this.zoneCatalog.find((zone) => zone.id === zoneId) || null;
    }

    getUnlockedZones(level = 1) {
        const safeLevel = Math.max(1, Number(level || 1));
        return this.zoneCatalog.filter((zone) => safeLevel >= Number(zone.requiredLevel || 1));
    }

    createRuntimeSnapshot() {
        return {
            currentZone: this.currentZone,
            tiles: this.tiles,
            width: this.width,
            height: this.height,
            tileSize: this.tileSize,
            bgImage: this.bgImage,
            bgPattern: this.bgPattern,
            boundaries: this.boundaries,
            spawns: this.spawns,
            objects: this.objects,
            chunks: new Map(this.chunks)
        };
    }

    restoreRuntimeSnapshot(snapshot) {
        if (!snapshot?.currentZone) return null;
        this.currentZone = snapshot.currentZone;
        this.tiles = snapshot.tiles;
        this.width = snapshot.width;
        this.height = snapshot.height;
        this.tileSize = snapshot.tileSize;
        this.bgImage = snapshot.bgImage;
        this.bgPattern = snapshot.bgPattern;
        this.boundaries = snapshot.boundaries;
        this.spawns = snapshot.spawns;
        this.objects = snapshot.objects;
        this.chunks = new Map(snapshot.chunks || []);
        return this.currentZone;
    }


    async loadZone(zoneId) {
        Logger.log(`Loading Zone: ${zoneId}`);

        try {
            // 1. Load Zone JSON
            const zoneData = await this.res.loadJSON(`assets/data/zones/${zoneId}.json`);
            if (!zoneData) {
                throw new Error(`Zone data not found: ${zoneId}`);
            }

            this.currentZone = zoneData;

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
            this.bgImage = null;
            this.bgPattern = null;
            if (zoneData.background) {
                if (zoneData.background.image) {
                    this.bgImage = await this.res.loadImage(zoneData.background.image);
                } else if (zoneData.background.src) {
                    // Legacy support
                    this.bgImage = await this.res.loadImage(zoneData.background.src);
                }
            } else {
                Logger.warn(`No background defined for zone: ${zoneId}`);
            }

            // 4. Setup Boundaries & Spawns & Objects
            this.boundaries = zoneData.boundaries || { minX: 0, maxX: this.width, minY: 0, maxY: this.height };
            this.spawns = zoneData.spawnPoints || [];
            this.objects = zoneData.objects || [];

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
            Logger.error(`Failed to load zone: ${zoneId}`, e);
            // Fallback to avoid crash
            this.currentZone = {
                id: 'fallback',
                name: 'Fallback Field',
                width: 100,
                height: 100,
                objects: [],
                spawns: [],
                background: { type: 'solid', color: '#76b041' }
            };
            this.width = 3200;
            this.height = 3200;
            return this.currentZone;
        }
    }

    getSpawnPoint(id) {
        if (!this.spawns) return null;
        return this.spawns.find(s => s.id === id) || this.spawns[0];
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

        const hasImageBackground = !!(this.bgImage && this.bgImage.width > 0 && this.bgImage.height > 0);

        if (hasImageBackground) {
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
            cctx.fillStyle = this.currentZone?.background?.color || '#76b041';
            cctx.fillRect(0, 0, this.chunkSize, this.chunkSize);
        }

        if (!hasImageBackground) {
            this._drawZoneTheme(cctx, cx, cy);

            // Optional: Draw tile grid for fallback color maps only.
            cctx.strokeStyle = 'rgba(0,0,0,0.05)';
            cctx.lineWidth = 1;
            for (let x = 0; x < this.chunkSize; x += this.tileSize) {
                cctx.beginPath(); cctx.moveTo(x, 0); cctx.lineTo(x, this.chunkSize); cctx.stroke();
            }
            for (let y = 0; y < this.chunkSize; y += this.tileSize) {
                cctx.beginPath(); cctx.moveTo(0, y); cctx.lineTo(this.chunkSize, y); cctx.stroke();
            }
        }

        return canvas;
    }

    _drawZoneTheme(ctx, cx, cy) {
        const theme = this.currentZone?.theme || this.currentZone?.background?.theme;
        if (!theme) return;

        if (theme.tint) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(0.82, Number(theme.tintAlpha ?? 0.22)));
            ctx.fillStyle = theme.tint;
            ctx.fillRect(0, 0, this.chunkSize, this.chunkSize);
            ctx.restore();
        }

        const motif = String(theme.motif || '').toLowerCase();
        if (!motif) return;

        const worldOffsetX = cx * this.chunkSize;
        const worldOffsetY = cy * this.chunkSize;
        const color = theme.motifColor || 'rgba(255, 255, 255, 0.16)';
        const spacing = Math.max(96, Number(theme.motifSpacing || 150));
        const startX = Math.floor(worldOffsetX / spacing) * spacing;
        const startY = Math.floor(worldOffsetY / spacing) * spacing;
        const hashUnit = (x, y, salt = 0) => {
            let hash = Math.imul((x | 0) ^ 0x45d9f3b, 0x45d9f3b);
            hash ^= Math.imul((y | 0) + salt, 0x27d4eb2d);
            return ((hash >>> 0) % 1000) / 1000;
        };

        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5;
        for (let wx = startX; wx <= worldOffsetX + this.chunkSize + spacing; wx += spacing) {
            for (let wy = startY; wy <= worldOffsetY + this.chunkSize + spacing; wy += spacing) {
                if (hashUnit(wx, wy, 17) < 0.38) continue;
                const x = wx - worldOffsetX + (hashUnit(wx, wy, 31) - 0.5) * 54;
                const y = wy - worldOffsetY + (hashUnit(wx, wy, 47) - 0.5) * 54;
                const size = 7 + hashUnit(wx, wy, 73) * 9;

                if (motif.includes('storm') || motif.includes('thunder') || motif.includes('lightning') || motif.includes('번개')) {
                    ctx.beginPath();
                    ctx.moveTo(x - size * 0.25, y - size);
                    ctx.lineTo(x + size * 0.2, y - size * 0.15);
                    ctx.lineTo(x - size * 0.05, y - size * 0.15);
                    ctx.lineTo(x + size * 0.28, y + size);
                    ctx.stroke();
                } else if (motif.includes('mist') || motif.includes('ripple') || motif.includes('water') || motif.includes('물결')) {
                    ctx.beginPath();
                    ctx.ellipse(x, y, size * 1.5, size * 0.45, 0, 0, Math.PI * 2);
                    ctx.ellipse(x, y, size * 0.8, size * 0.24, 0, 0, Math.PI * 2);
                    ctx.stroke();
                } else if (motif.includes('ruin') || motif.includes('moon') || motif.includes('폐허')) {
                    ctx.beginPath();
                    ctx.arc(x, y, size, Math.PI * 0.2, Math.PI * 1.8);
                    ctx.moveTo(x - size * 0.6, y);
                    ctx.lineTo(x + size * 0.6, y);
                    ctx.stroke();
                } else {
                    ctx.beginPath();
                    for (let point = 0; point < 8; point++) {
                        const angle = -Math.PI / 2 + point * Math.PI / 4;
                        const radius = point % 2 === 0 ? size : size * 0.35;
                        const px = x + Math.cos(angle) * radius;
                        const py = y + Math.sin(angle) * radius;
                        if (point === 0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                    }
                    ctx.closePath();
                    ctx.fill();
                }
            }
        }
        ctx.restore();
    }

}
