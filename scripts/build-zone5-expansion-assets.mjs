#!/usr/bin/env node
/**
 * Builds the first map-expansion asset pack without touching the user-owned
 * source pack.  The source atlas paths are intentionally explicit: this is a
 * one-time import tool, not a runtime loader.
 *
 * It also converts generated PNGs to the delivery format (WebP) and removes
 * the green key from the authored boss VFX timeline before it is installed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_ROOT = 'C:/dev/monster_asset';
const GENERATED_ROOT = 'C:/Users/User/.codex/generated_images';

const generated = {
    background: path.join(GENERATED_ROOT, '019fa70f-c573-7431-bd50-193f2d2acc6e', 'exec-d433c4b6-c278-43a5-b800-aa0e57cd4159.png'),
    staff: path.join(GENERATED_ROOT, '019fa710-6782-7a02-a7b6-6a2c9b4e1d03', 'exec-5b70f4ef-cf13-427a-982e-0a7a49e146fc.png'),
    vfx: path.join(GENERATED_ROOT, '019fa718-1bbf-7893-81ab-588b0d8fb702', 'exec-d4bd0b54-5e13-41ee-bc4b-bf3bcf249f7d.png')
};

const atlasImports = [
    ['agumonv3/spritesheet.webp', 'assets/resource/expansion/zone_5/monsters/ember_drake/spritesheet.webp'],
    ['pachirisu-berry/spritesheet-green-idle-final.png', 'assets/resource/expansion/zone_5/monsters/spark_squirrel/spritesheet.webp'],
    ['ultrasevenv2/spritesheet.webp', 'assets/resource/expansion/zone_5/monsters/rift_sentinel/spritesheet.webp']
];

function out(relativePath) {
    return path.join(ROOT, relativePath);
}

async function ensureParent(filePath) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function assertReadable(filePath, label) {
    try {
        await fs.access(filePath);
    } catch {
        throw new Error(`${label} is missing: ${filePath}`);
    }
}

async function removeCheckerboardBackground(sourcePath) {
    const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const candidate = new Uint8Array(width * height);
    const visited = new Uint8Array(width * height);
    const queue = [];
    for (let i = 0; i < candidate.length; i += 1) {
        const offset = i * 4;
        const r = data[offset]; const g = data[offset + 1]; const b = data[offset + 2];
        candidate[i] = ((r + g + b) / 3 > 180 && Math.max(r, g, b) - Math.min(r, g, b) < 24) ? 1 : 0;
    }
    const enqueue = (x, y) => {
        const index = y * width + x;
        if (!candidate[index] || visited[index]) return;
        visited[index] = 1;
        queue.push(index);
    };
    for (let x = 0; x < width; x += 1) { enqueue(x, 0); enqueue(x, height - 1); }
    for (let y = 0; y < height; y += 1) { enqueue(0, y); enqueue(width - 1, y); }
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor]; const x = index % width; const y = Math.floor(index / width);
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
            if (dx || dy) { const nx = x + dx; const ny = y + dy; if (nx >= 0 && ny >= 0 && nx < width && ny < height) enqueue(nx, ny); }
        }
    }
    visited.forEach((isBackground, index) => {
        if (!isBackground) return;
        const offset = index * 4;
        data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0; data[offset + 3] = 0;
    });
    // Generated transparent previews occasionally carry a coloured strip at a
    // canvas edge.  It can never belong to the centered inventory/VFX asset,
    // so remove every remaining alpha component connected to an outer edge.
    const edgeConnected = new Uint8Array(width * height);
    const edgeQueue = [];
    const enqueueAlpha = (x, y) => {
        const index = y * width + x;
        if (edgeConnected[index] || data[index * 4 + 3] <= 8) return;
        edgeConnected[index] = 1;
        edgeQueue.push(index);
    };
    for (let x = 0; x < width; x += 1) { enqueueAlpha(x, 0); enqueueAlpha(x, height - 1); }
    for (let y = 0; y < height; y += 1) { enqueueAlpha(0, y); enqueueAlpha(width - 1, y); }
    for (let cursor = 0; cursor < edgeQueue.length; cursor += 1) {
        const index = edgeQueue[cursor]; const x = index % width; const y = Math.floor(index / width);
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
            if (dx || dy) { const nx = x + dx; const ny = y + dy; if (nx >= 0 && ny >= 0 && nx < width && ny < height) enqueueAlpha(nx, ny); }
        }
    }
    edgeConnected.forEach((isEdgeArtifact, index) => {
        if (!isEdgeArtifact) return;
        const offset = index * 4;
        data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0; data[offset + 3] = 0;
    });
    return sharp(data, { raw: { width, height, channels: 4 } });
}

async function main() {
    for (const [sourceRelative, destinationRelative] of atlasImports) {
        const sourcePath = path.join(SOURCE_ROOT, sourceRelative);
        const destinationPath = out(destinationRelative);
        await assertReadable(sourcePath, 'Monster source atlas');
        await ensureParent(destinationPath);
        if (sourcePath.toLowerCase().endsWith('.png')) {
            await sharp(sourcePath).webp({ quality: 92, effort: 6 }).toFile(destinationPath);
        } else {
            await fs.copyFile(sourcePath, destinationPath);
        }
    }

    await Promise.all(Object.entries(generated).map(async ([label, sourcePath]) => {
        await assertReadable(sourcePath, `Generated ${label} source`);
    }));

    const backgroundPath = out('assets/resource/expansion/zone_5/maps/zone_5_primal_rift.webp');
    await ensureParent(backgroundPath);
    await sharp(generated.background).webp({ quality: 86, effort: 6 }).toFile(backgroundPath);

    const staffPath = out('assets/resource/expansion/zone_5/items/riftcore_staff.webp');
    await ensureParent(staffPath);
    await (await removeCheckerboardBackground(generated.staff))
        .resize({ width: 512, height: 512, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ lossless: true, effort: 6 })
        .toFile(staffPath);

    const vfxPath = out('assets/resource/expansion/zone_5/effects/rift_sentinel_spell.webp');
    await ensureParent(vfxPath);
    await (await removeCheckerboardBackground(generated.vfx))
        .resize({ width: 512, height: 512, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ lossless: true, effort: 6 })
        .toFile(vfxPath);

    console.log('zone_5 expansion assets built');
    console.log(JSON.stringify({ backgroundPath, staffPath, vfxPath }, null, 2));
}

main().catch((error) => {
    console.error(`[zone5-assets] ${error.stack || error.message}`);
    process.exitCode = 1;
});
