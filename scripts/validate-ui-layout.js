#!/usr/bin/env node

const fs = require('fs');

const uiManager = fs.readFileSync('src/js/ui/UIManager.js', 'utf8');
const css = fs.readFileSync('src/css/style.css', 'utf8');

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

if (/prepareActionButtonsLayoutSurface|prepareActionButtonsRuntimeSurface|isActionUiLayoutControl/.test(uiManager)) {
    fail('legacy detached action-button layout helper still exists');
}

if (/body\.ui-layout-edit-mode\s+\.action-buttons\s*{[^}]*width:\s*100dvw/gs.test(css)) {
    fail('edit mode still turns action-buttons into a full-screen surface');
}

if (/body\.ui-layout-edit-mode\s+\.action-buttons\s+\.skill-btn[\s\S]{0,500}position:\s*fixed\s*!important/.test(css)) {
    fail('edit mode still detaches skill buttons with fixed positioning');
}

if (/body\.ui-layout-edit-mode\s+\.action-buttons\s+\.attack-btn[\s\S]{0,500}position:\s*fixed\s*!important/.test(css)) {
    fail('edit mode still detaches attack buttons with fixed positioning');
}

if (/body\.ui-layout-edit-mode\s+\.action-buttons\s+\.attack-auto-toggle[\s\S]{0,500}position:\s*fixed\s*!important/.test(css)) {
    fail('edit mode still detaches auto button with fixed positioning');
}

if (/body\.ui-layout-edit-mode\s+\.action-buttons\s+\.skill-btn[\s\S]{0,200}pointer-events:\s*none\s*!important/.test(css)) {
    fail('edit mode blocks pointer events on individual skill buttons');
}

if (/body\.ui-layout-edit-mode\s+\.action-buttons\s+\.attack-btn[\s\S]{0,200}pointer-events:\s*none\s*!important/.test(css)) {
    fail('edit mode blocks pointer events on the individual attack button');
}

if (/body\.ui-layout-edit-mode\s+\.action-buttons\s+\.attack-auto-toggle[\s\S]{0,200}pointer-events:\s*none\s*!important/.test(css)) {
    fail('edit mode blocks pointer events on the individual auto button');
}

console.log('[ui-layout] OK: action buttons stay individually editable without detached edit surfaces');
