// Generated raster atlas contract: 4 columns x 6 rows, 256px cells.
// No procedural or legacy-art fallback while the generated asset is unavailable.
export const LIFE_ORB_ATLAS = 'assets/resource/effects/life-orb-v177.webp';
export const LIFE_ORB_METADATA = 'assets/resource/effects/life-orb-v177.json';
export function validLifeOrbAtlas(image) { return image?.width === 1024 && image?.height === 1536; }
export function validLifeOrbMetadata(metadata) {
    return metadata?.schema === 'life-orb-sprite-atlas-metadata-v1'
        && metadata.atlas?.width === 1024 && metadata.atlas?.height === 1536
        && metadata.atlas?.columns === 4 && metadata.atlas?.rows === 6
        && Array.isArray(metadata.frames) && metadata.frames.length === 24
        && metadata.frames.every((f, i) => f.index === i && f.row === Math.floor(i / 4) && f.column === i % 4
            && f.sourceRect?.x === i % 4 * 256 && f.sourceRect?.y === Math.floor(i / 4) * 256
            && f.sourceRect?.width === 256 && f.sourceRect?.height === 256
            && Number.isFinite(f.pivotPx?.x) && f.pivotPx.x >= 0 && f.pivotPx.x < 256
            && Number.isFinite(f.pivotPx?.y) && f.pivotPx.y >= 0 && f.pivotPx.y < 256);
}
export async function loadLifeOrbVisuals(resources) {
    const [lifeOrb, lifeOrbMetadata] = await Promise.all([resources.loadImage(LIFE_ORB_ATLAS), resources.loadJSON(LIFE_ORB_METADATA)]);
    if (!validLifeOrbAtlas(lifeOrb) || !validLifeOrbMetadata(lifeOrbMetadata)) throw Error('Invalid Life Orb atlas or frame metadata');
    return { lifeOrb, lifeOrbMetadata };
}
export function drawLifeOrb(ctx, image, { x, y, age = 0, charge = 0, phase = 'outbound', direction, healing = false }, metadata) {
    if (!validLifeOrbAtlas(image) || !validLifeOrbMetadata(metadata)) return false;
    const row = healing ? 5 : phase === 'return' && charge > 0 ? 4 : Math.min(3, Math.floor(Math.max(0, Math.min(1, charge)) * 3 + 1e-8));
    const frame = healing ? Math.min(3, Math.floor(age / .1)) : Math.floor(age / .1) % 4;
    const size = healing ? 76 : phase === 'return' ? 58 : 52;
    const { sourceRect: rect, pivotPx: pivot } = metadata.frames[row * 4 + frame], scale = size / 256;
    ctx.save(); ctx.translate(x, y);
    if (phase === 'return' && direction) ctx.rotate(Math.atan2(direction.y, direction.x));
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, -pivot.x * scale, -pivot.y * scale, size, size);
    ctx.restore(); return true;
}
