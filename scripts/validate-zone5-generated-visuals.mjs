#!/usr/bin/env node
import sharp from 'sharp';

const checks = [
    ['riftcore staff', 'assets/resource/expansion/zone_5/items/riftcore_staff.webp'],
    ['rift sentinel VFX', 'assets/resource/expansion/zone_5/effects/rift_sentinel_spell.webp']
];

async function getAlphaBounds(filePath) {
    const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width; let top = info.height; let right = -1; let bottom = -1;
    for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
        if (data[(y * info.width + x) * 4 + 3] <= 8) continue;
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    return { hasAlpha: info.hasAlpha, width: info.width, height: info.height, left, top, right, bottom };
}

const errors = [];
for (const [label, filePath] of checks) {
    const bounds = await getAlphaBounds(filePath);
    if (!bounds.hasAlpha) errors.push(`${label} must be an alpha WebP`);
    if (bounds.right < bounds.left) errors.push(`${label} has no visible pixels`);
    if (bounds.left <= 0 || bounds.top <= 0 || bounds.right >= bounds.width - 1 || bounds.bottom >= bounds.height - 1) {
        errors.push(`${label} touches the source edge and may contain a crop or leaked background`);
    }
    console.log(`[zone5-visuals] ${label}: ${bounds.width}x${bounds.height}, alpha bounds ${bounds.left},${bounds.top}..${bounds.right},${bounds.bottom}`);
}
if (errors.length) {
    errors.forEach((error) => console.error(`[zone5-visuals] ${error}`));
    process.exitCode = 1;
} else {
    console.log('[zone5-visuals] OK: generated transparent assets are bounded away from every canvas edge.');
}
