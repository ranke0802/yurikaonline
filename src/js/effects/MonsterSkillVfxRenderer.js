// Authored combat VFX are rendered from a single transparent WebP atlas.
// Keep this module free of gameplay state: Monster owns timing and damage while
// this renderer only turns an already-authoritative state into pixels.
export const MONSTER_SKILL_VFX_ATLAS = Object.freeze({
    src: 'assets/resource/effects/monster-skill-vfx-atlas.webp',
    columns: 5,
    rows: 4,
    frames: Object.freeze({ charge: 0, cast: 1, impact: 2, residue: 3 })
});

const THEME_COLUMNS = Object.freeze({
    slime: 0,
    water: 1,
    thunder: 2,
    shadow: 3,
    astral: 4,
    wood: 0,
    arcane: 4
});

const THEME_ALIASES = Object.freeze({
    ripple: 'water',
    lightning_field: 'thunder',
    shock: 'thunder',
    ghost: 'shadow',
    star: 'astral'
});

let atlasImage = null;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function resolveMonsterSkillVfxTheme(theme) {
    const normalized = String(theme || 'arcane').toLowerCase();
    return THEME_COLUMNS[normalized] != null
        ? normalized
        : (THEME_ALIASES[normalized] || 'arcane');
}

// The atlas rows are a single authored spell timeline, not interchangeable
// decorations. Progress comes from the existing authoritative cast timer, so
// animation never needs its own timers, allocations, or network state.
export function resolveMonsterSkillVfxFrame(stage, progress = 0) {
    const normalized = String(stage || 'charge');
    const phase = clamp(Number(progress) || 0, 0, 1);
    if (normalized === 'charge' || normalized === 'cast') {
        return phase < 0.46 ? MONSTER_SKILL_VFX_ATLAS.frames.charge : MONSTER_SKILL_VFX_ATLAS.frames.cast;
    }
    if (normalized === 'impact') {
        if (phase < 0.18) return MONSTER_SKILL_VFX_ATLAS.frames.cast;
        if (phase < 0.74) return MONSTER_SKILL_VFX_ATLAS.frames.impact;
        return MONSTER_SKILL_VFX_ATLAS.frames.residue;
    }
    return MONSTER_SKILL_VFX_ATLAS.frames.residue;
}

export function preloadMonsterSkillVfxAtlas() {
    if (typeof Image === 'undefined') return null;
    if (!atlasImage) {
        atlasImage = new Image();
        atlasImage.decoding = 'async';
        atlasImage.src = MONSTER_SKILL_VFX_ATLAS.src;
    }
    return atlasImage;
}

function getLoadedAtlasImage() {
    const image = preloadMonsterSkillVfxAtlas();
    return image?.naturalWidth > 0 && image?.naturalHeight > 0 ? image : null;
}

// `ground` means the lower edge of the source cell stays attached to the
// monster/impact ground point. This prevents the former hovering-card look.
export function drawMonsterSkillVfx(
    ctx,
    theme = 'arcane',
    frame = 0,
    x = 0,
    y = 0,
    width,
    height,
    alpha = 1,
    groundAnchor = 0.9,
    rotation = 0,
    flipX = false,
    anchor = 'ground'
) {
    const image = getLoadedAtlasImage();
    if (!ctx || !image) return false;

    const column = THEME_COLUMNS[resolveMonsterSkillVfxTheme(theme)] ?? THEME_COLUMNS.arcane;
    const frameIndex = typeof frame === 'string'
        ? (MONSTER_SKILL_VFX_ATLAS.frames[frame] ?? 0)
        : Number(frame ?? 0);
    const sourceWidth = image.naturalWidth / MONSTER_SKILL_VFX_ATLAS.columns;
    const sourceHeight = image.naturalHeight / MONSTER_SKILL_VFX_ATLAS.rows;
    const sourceX = Math.floor(column * sourceWidth);
    const sourceY = Math.floor(clamp(Math.floor(frameIndex), 0, MONSTER_SKILL_VFX_ATLAS.rows - 1) * sourceHeight);
    const drawWidth = Math.max(1, Number(width) || sourceWidth);
    const drawHeight = Math.max(1, Number(height) || sourceHeight);
    const resolvedAnchor = anchor === 'center' ? 'center' : 'ground';
    const resolvedGroundAnchor = clamp(Number(groundAnchor), 0, 1);
    const resolvedAlpha = clamp(Number(alpha), 0, 1);

    ctx.save();
    ctx.translate(Number(x) || 0, Number(y) || 0);
    if (Number.isFinite(Number(rotation)) && Number(rotation) !== 0) {
        ctx.rotate(Number(rotation));
    }
    if (flipX) ctx.scale(-1, 1);
    ctx.globalAlpha *= resolvedAlpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
        image,
        sourceX,
        sourceY,
        Math.ceil(sourceWidth),
        Math.ceil(sourceHeight),
        -drawWidth / 2,
        resolvedAnchor === 'ground' ? -drawHeight * resolvedGroundAnchor : -drawHeight / 2,
        drawWidth,
        drawHeight
    );
    ctx.restore();
    return true;
}
