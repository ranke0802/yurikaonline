function getRuntimeGame() {
    return globalThis.window?.game || null;
}

function toFiniteNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

export function captureProjectileWorldContext(game = getRuntimeGame()) {
    const scene = game?.sceneManager?.currentScene || null;
    return {
        game: game || null,
        scene,
        zoneId: game?.zone?.currentZone?.id || null,
        fieldId: game?.net?._getCurrentFieldId?.() || null,
        worldGeneration: toFiniteNumber(game?.monsterManager?.worldGeneration),
        zoneTransitionToken: toFiniteNumber(scene?.zoneTransitionToken)
    };
}

export function isProjectileWorldContextCurrent(context, game = getRuntimeGame()) {
    if (!context || !game || context.game !== game) return false;

    const currentScene = game.sceneManager?.currentScene || null;
    if (context.scene && currentScene !== context.scene) return false;

    const scene = context.scene || currentScene;
    if (scene?.isZoneTransitioning) return false;
    if (context.zoneTransitionToken !== null
        && toFiniteNumber(scene?.zoneTransitionToken) !== context.zoneTransitionToken) return false;

    if (context.zoneId && game.zone?.currentZone?.id !== context.zoneId) return false;
    if (context.fieldId && game.net?._getCurrentFieldId?.() !== context.fieldId) return false;
    if (context.worldGeneration !== null
        && toFiniteNumber(game.monsterManager?.worldGeneration) !== context.worldGeneration) return false;

    return true;
}

export function toProjectileAuthoredOptions(context) {
    return {
        authoredScene: context?.scene || null,
        authoredZoneId: context?.zoneId || null,
        authoredFieldId: context?.fieldId || null,
        authoredWorldGeneration: context?.worldGeneration ?? null,
        authoredZoneTransitionToken: context?.zoneTransitionToken ?? null
    };
}
