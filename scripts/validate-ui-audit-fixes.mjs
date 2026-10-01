import test from 'node:test';
import assert from 'node:assert/strict';
import KeyboardHandler from '../src/js/core/input/KeyboardHandler.js';
import { UIManager } from '../src/js/ui/UIManager.js';

function keyboardFixture(modal = false) {
    globalThis.window = new EventTarget();
    globalThis.document = new EventTarget();
    document.querySelector = () => modal ? {} : null;
    const keyboard = new KeyboardHandler(), actions = [];
    keyboard.on('actionDown', action => actions.push(action));
    return { keyboard, actions };
}
function key(key, code, target = null) {
    return { key, code, target, prevented: false, preventDefault() { this.prevented = true; } };
}
test('settings native controls retain arrows, Space and Tab without combat', () => {
    const { keyboard, actions } = keyboardFixture();
    for (const [k, code] of [['ArrowRight', 'ArrowRight'], [' ', 'Space'], ['Tab', 'Tab'], ['w', 'KeyW']]) {
        const event = key(k, code, { closest: selector => selector.includes('input') ? {} : null });
        keyboard._onKeyDown(event);
        assert.equal(event.prevented, false);
    }
    assert.deepEqual(actions, []);
    keyboard.cleanup();
});
test('modal keyboard entry releases existing movement; closed modal gameplay still works', () => {
    const { keyboard, actions } = keyboardFixture();
    keyboard._onKeyDown(key('w', 'KeyW'));
    assert.deepEqual(actions, ['MOVE_UP']);
    document.querySelector = () => ({});
    keyboard._onKeyDown(key(' ', 'Space'));
    assert.equal(keyboard.pressedKeys.size, 0);
    assert.deepEqual(actions, ['MOVE_UP']);
    document.querySelector = () => null;
    keyboard._onKeyDown(key(' ', 'Space'));
    assert.deepEqual(actions, ['MOVE_UP', 'ATTACK']);
    keyboard.cleanup();
});
test('new classes hide unsupported Auto; Mage restores its actual toggle state', () => {
    const classes = new Map(), attributes = new Map();
    const button = { classList: { toggle: (k, v) => classes.set(k, v) }, setAttribute: (k, v) => attributes.set(k, v) };
    const ui = Object.create(UIManager.prototype);
    ui.getHudRef = () => button;
    for (const classId of ['witch', 'warrior', 'archer', 'wizard']) {
        ui.game = { localPlayer: { classId, autoAttackEnabled: classId === 'wizard' } };
        ui.updateAutoAttackToggle();
        assert.equal(button.hidden, classId !== 'wizard');
        assert.equal(button.disabled, classId !== 'wizard');
        assert.equal(classes.get('hidden'), classId !== 'wizard');
    }
    assert.equal(attributes.get('aria-pressed'), 'true');
});
