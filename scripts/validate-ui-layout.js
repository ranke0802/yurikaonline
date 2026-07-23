#!/usr/bin/env node

const fs = require('fs');

const uiManager = fs.readFileSync('src/js/ui/UIManager.js', 'utf8');
const css = fs.readFileSync('src/css/style.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const mainJs = fs.readFileSync('src/js/main.js', 'utf8');
const worldScene = fs.readFileSync('src/js/world/scenes/WorldScene.js', 'utf8');
const friendsUi = fs.readFileSync('src/js/ui/friends/FriendsUIController.js', 'utf8');

function fail(message) {
    console.error(`[ui-layout] ${message}`);
    process.exit(1);
}

function extractBetween(source, start, end, label) {
    const startIndex = source.indexOf(start);
    if (startIndex < 0) fail(`missing ${label} start`);
    const endIndex = source.indexOf(end, startIndex);
    if (endIndex < 0) fail(`missing ${label} end`);
    return source.slice(startIndex, endIndex);
}

const definitions = extractBetween(
    uiManager,
    'this.uiLayoutControlDefinitions = {',
    '};\n        this.uiLayoutPresetDefaults',
    'UI layout definitions'
);

const presets = extractBetween(
    uiManager,
    'this.uiLayoutPresetDefaults = {',
    '};\n        this.uiLayoutEditMode',
    'UI layout presets'
);

const actionControls = [
    'action-skill-u',
    'action-skill-k',
    'action-skill-h',
    'action-attack-j',
    'action-auto-toggle'
];

if (definitions.includes("'version-info-badge'")) {
    fail('version info badge must not be part of the 32e1d05 UI layout target set');
}

if (definitions.includes("'party-panel'")) {
    fail('party panel must not be registered as a UI layout edit target');
}

if (definitions.includes("'action-buttons-panel'") || presets.includes("'action-buttons-panel'")) {
    fail('action buttons must not be registered as a synthetic layout group');
}

if (!/\'minimap-panel\': \{[\s\S]*scaleMode: 'transform'[\s\S]*baseScaleByMode: \{ desktop: 1, mobilePortrait: 0\.95, mobileLandscape: 1 \}/.test(definitions)) {
    fail('minimap layout scale must use fixed per-mode base scales to prevent transform accumulation');
}

actionControls.forEach((controlId) => {
    if (!definitions.includes(`'${controlId}'`)) {
        fail(`missing individual action control definition: ${controlId}`);
    }

    if (!presets.includes(`'${controlId}'`)) {
        fail(`missing individual action control preset: ${controlId}`);
    }
});

if (!presets.includes('mobilePortrait:')) {
    fail('mobile portrait preset must match the restored 32e1d05 default layout');
}

if (!presets.includes("'minimap-panel': { left: 0.7319921851158142, top: 0.017167381974248927, scale: 0.87 }")) {
    fail('mobile portrait minimap default must match the restored 32e1d05 value');
}

if (!presets.includes("'minimap-panel': { left: 0.8844956413449564, top: 0.03125, scale: 0.79 }")) {
    fail('mobile landscape minimap default must match the restored 32e1d05 value');
}

if (!presets.includes("'quick-menu-panel': { left: 0.8058647260273972, top: 0.3046875, scale: 0.84 }")) {
    fail('mobile landscape quick menu default was not restored to the tuned 5eb1533 value');
}

if (/ui-layout-opacity-range|ui-layout-opacity-value/.test(html) || /opacityRange|opacityValue/.test(uiManager)) {
    fail('layout editor opacity controls must not be part of the restored UI layout flow');
}

if (/uiLayoutSchemaVersion|migrateLegacyUiLayoutEntry/.test(uiManager)) {
    fail('UI layout schema migration must not rewrite the restored default layout values');
}

if (/normalizeUiLayoutEntryForCurrentCss/.test(uiManager)) {
    fail('current CSS normalization must not rewrite the restored 32e1d05 layout values');
}

if (!/getUiLayoutControlBaseScale\s*\(controlId,\s*definition,\s*element\)/.test(uiManager)
    || !/definition\?\.baseScaleByMode\?\.\[mode\]/.test(uiManager)
    || !/const baseScale = this\.getUiLayoutControlBaseScale\(controlId,\s*definition,\s*element\);/.test(uiManager)) {
    fail('layout transform scaling must resolve through stable per-control base scales');
}

if (!/uiLayoutResetModes\s*=\s*new Set\(\)/.test(uiManager)
    || !/this\.uiLayoutResetModes\.forEach\(\(mode\) => \{[\s\S]*delete draftForSave\.layouts\[mode\]/.test(uiManager)) {
    fail('layout mode reset must delete the saved mode when the edit draft is saved');
}

if (!/const hasResetModes = !!this\.uiLayoutResetModes\?\.size;/.test(uiManager)
    || !/if \(currentComparable === nextComparable && !hasResetModes\)/.test(uiManager)
    || !/ui_layout_reset_force/.test(uiManager)) {
    fail('UI layout reset must force persistence even when comparable layout data appears unchanged');
}

if (/if \(!current\.layouts\?\.\[mode\]\) return;/.test(uiManager)) {
    fail('settings reset must reapply defaults even when the current mode has no saved entry');
}

if (!/localStorage\.getItem\(this\.uiLayoutStorageKey\)/.test(uiManager)
    || !/localStorage\.setItem\(this\.uiLayoutStorageKey,\s*JSON\.stringify\(sanitized\)\)/.test(uiManager)) {
    fail('UI layout local persistence was not restored to the 5eb1533 storage flow');
}

if (/getUiLayoutStorageOwnerId\s*\(|getUiLayoutStorageKey\s*\(|uiLayoutStorageKeyBase/.test(uiManager)) {
    fail('player-scoped local backup helpers remain in the restored UI layout flow');
}

if (/clearActionButtonsLayoutSurfaceStyles|prepareActionButtonsLayoutSurface|prepareActionButtonsRuntimeSurface|isActionUiLayoutControl/.test(uiManager)) {
    fail('detached action-button layout helper still exists');
}

if (/body\.ui-layout-edit-mode\s+\.action-buttons\s*{[^}]*width:\s*100dvw/gs.test(css)) {
    fail('edit mode still turns action-buttons into a full-screen surface');
}

const mobileLandscapeHud = extractBetween(
    css,
    '/* Mobile Landscape HUD Layout */',
    '    .quest-list-panel {',
    'mobile landscape HUD party section'
);

if (/#party-panel/.test(mobileLandscapeHud)) {
    fail('mobile landscape HUD must not override the party panel into a wide layout');
}

const friendUnreadMethod = extractBetween(
    friendsUi,
    'setFriendChatUnreadWhileMinimized(active) {',
    '    applyFriendChatWindowState() {',
    'friend chat unread update method'
);

if (/applyFriendChatWindowState\s*\(/.test(friendUnreadMethod)
    || !/friend-chat-unread-dot[\s\S]*classList\.toggle\('hidden'/.test(friendUnreadMethod)) {
    fail('a minimized friend-chat unread update must not reapply or reset its floating layout');
}

if (!/const compactPosition\s*=\s*state\.compact[\s\S]*captureFriendChatCompactPosition\(card\)/.test(friendsUi)
    || !/if \(viewportChanged\)\s*\{[\s\S]*state\.scale\s*=\s*1;[\s\S]*state\.left\s*=\s*compactPosition\.left;[\s\S]*state\.top\s*=\s*compactPosition\.top;/.test(friendsUi)) {
    fail('friend-chat viewport changes must preserve the user-dragged compact position');
}

if (!/id="settings-camera-view-range"[^>]*min="80"[^>]*max="150"[^>]*step="1"/.test(html)
    || !/cameraViewRange:\s*100/.test(uiManager)
    || !/cameraViewRange:\s*this\.clampNumericSetting\(candidate\.cameraViewRange,\s*defaults\.cameraViewRange,\s*80,\s*150\)/.test(uiManager)) {
    fail('camera view range setting must default to the current view and clamp to 80-150%');
}

if (!/getEffectiveCameraZoom\s*\(isMobile\s*=\s*false\)[\s\S]*return baseZoom \/ Math\.max\(0\.8,\s*Math\.min\(1\.5,\s*viewRangeScale\)\);/.test(mainJs)) {
    fail('camera view range must widen monotonically by dividing base zoom by the view range scale');
}

if (!/window\.visualViewport\?\.addEventListener\?\.\('resize',\s*this\._handleViewportResize\)/.test(mainJs)
    || !/window\.addEventListener\('orientationchange',\s*this\._handleViewportOrientationChange\)/.test(mainJs)
    || !/_viewportResizeTimers[\s\S]*80,\s*180,\s*360,\s*720,\s*1200/.test(mainJs)
    || !/syncCameraAfterViewportChange\(options\.reason\s*\|\|\s*'resize'\)/.test(mainJs)) {
    fail('iOS PWA orientation changes must resync visualViewport, settled canvas size, and camera focus');
}

if (/camera\.height\s*\*\s*0\.12|landscapeFramingOffsetY\s*=\s*this\.ui\?\.isMobileLandscapeViewport/.test(worldScene)) {
    fail('mobile landscape camera framing must not offset the character away from screen center');
}

if (!/Final portrait layout editor action button visibility guard/.test(css)) {
    fail('restored portrait action-button edit guard is missing');
}

if (!/width:\s*110px;[\s\S]*transform:\s*scale\(0\.95\);/.test(css)) {
    fail('mobile portrait minimap CSS base must match the restored 32e1d05 size');
}

if (!/width:\s*96px\s*!important;[\s\S]*min-width:\s*96px\s*!important;[\s\S]*#minimapCanvas\s*\{[\s\S]*width:\s*96px\s*!important;[\s\S]*height:\s*96px\s*!important;[\s\S]*body #ui-layer \.minimap-menu\s*\{[\s\S]*top:\s*calc\(117px \+ env\(safe-area-inset-top\)\)\s*!important;/m.test(css)) {
    fail('mobile landscape minimap/menu CSS base must match the restored 32e1d05 size');
}

if (!/body\.ui-layout-edit-mode \.action-buttons \.skill-btn,[\s\S]*body\.ui-layout-edit-mode \.action-buttons \.attack-btn\s*{[\s\S]*position:\s*fixed\s*!important/.test(css)) {
    fail('portrait edit guard does not keep individual action buttons positionable');
}

if (!/body\.ui-layout-edit-mode \.action-buttons \.skill-btn\s*\{[\s\S]*width:\s*50px\s*!important;[\s\S]*height:\s*50px\s*!important;[\s\S]*font-size:\s*20px\s*!important;/.test(css)
    || !/body\.ui-layout-edit-mode \.action-buttons \.attack-btn\s*\{[\s\S]*width:\s*86px\s*!important;[\s\S]*height:\s*86px\s*!important;[\s\S]*font-size:\s*28px\s*!important;/.test(css)
    || !/orientation:\s*landscape\)[\s\S]*body\.ui-layout-edit-mode \.action-buttons \.skill-btn\s*\{[\s\S]*width:\s*clamp\(58px,\s*9vh,\s*68px\)\s*!important;[\s\S]*body\.ui-layout-edit-mode \.action-buttons \.attack-btn\s*\{[\s\S]*width:\s*clamp\(98px,\s*15vh,\s*112px\)\s*!important;/.test(css)) {
    fail('layout edit action button sizing must match the restored 32e1d05 guards');
}

console.log('[ui-layout] OK: restored 32e1d05 UI layout defaults and reset semantics');
