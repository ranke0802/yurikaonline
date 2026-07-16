#!/usr/bin/env node

const fs = require('fs');

const uiManager = fs.readFileSync('src/js/ui/UIManager.js', 'utf8');
const css = fs.readFileSync('src/css/style.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

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

if (!definitions.includes("'version-info-badge'")) {
    fail('version info badge must remain an editable UI layout target');
}

if (definitions.includes("'party-panel'")) {
    fail('party panel must not be registered as a UI layout edit target');
}

if (definitions.includes("'action-buttons-panel'") || presets.includes("'action-buttons-panel'")) {
    fail('action buttons must not be registered as a synthetic layout group');
}

actionControls.forEach((controlId) => {
    if (!definitions.includes(`'${controlId}'`)) {
        fail(`missing individual action control definition: ${controlId}`);
    }

    if (!presets.includes(`'${controlId}'`)) {
        fail(`missing individual action control preset: ${controlId}`);
    }
});

if (presets.includes('mobilePortrait:')) {
    fail('mobile portrait preset must not override the tuned default portrait layout');
}

if (!presets.includes("'minimap-panel': { left: 0.8844956413449564, top: 0.03125, scale: 0.79 }")) {
    fail('mobile landscape minimap default was not restored to the tuned 5eb1533 value');
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

if (!/Final portrait layout editor action button visibility guard/.test(css)) {
    fail('restored portrait action-button edit guard is missing');
}

if (!/body\.ui-layout-edit-mode \.action-buttons \.skill-btn,[\s\S]*body\.ui-layout-edit-mode \.action-buttons \.attack-btn\s*{[\s\S]*position:\s*fixed\s*!important/.test(css)) {
    fail('portrait edit guard does not keep individual action buttons positionable');
}

console.log('[ui-layout] OK: restored 5eb1533 layout editor targets, defaults, and persistence flow');
