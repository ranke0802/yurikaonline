import EventEmitter from '../EventEmitter.js';

export default class KeyboardHandler extends EventEmitter {
    constructor(keyMap) {
        super();
        this.keyMap = keyMap || {
            'ArrowUp': 'MOVE_UP',
            'ArrowDown': 'MOVE_DOWN',
            'ArrowLeft': 'MOVE_LEFT',
            'ArrowRight': 'MOVE_RIGHT',
            'w': 'MOVE_UP',
            's': 'MOVE_DOWN',
            'a': 'MOVE_LEFT',
            'd': 'MOVE_RIGHT',
            'W': 'MOVE_UP',
            'S': 'MOVE_DOWN',
            'A': 'MOVE_LEFT',
            'D': 'MOVE_RIGHT',
            'KeyW': 'MOVE_UP',
            'KeyS': 'MOVE_DOWN',
            'KeyA': 'MOVE_LEFT',
            'KeyD': 'MOVE_RIGHT',
            ' ': 'ATTACK',
            'j': 'ATTACK',
            'J': 'ATTACK',
            'h': 'SKILL_1',
            'H': 'SKILL_1',
            'l': 'TOGGLE_AUTO_ATTACK',
            'L': 'TOGGLE_AUTO_ATTACK',
            'u': 'SKILL_2',
            'U': 'SKILL_2',
            'k': 'SKILL_3',
            'K': 'SKILL_3',
            '1': 'SKILL_1',
            '2': 'SKILL_2',
            '3': 'SKILL_3',
            '4': 'SKILL_4',
            'KeyJ': 'ATTACK',
            'KeyH': 'SKILL_1',
            'KeyL': 'TOGGLE_AUTO_ATTACK',
            'KeyU': 'SKILL_2',
            'KeyK': 'SKILL_3',
            'Digit1': 'SKILL_1',
            'Digit2': 'SKILL_2',
            'Digit3': 'SKILL_3',
            'Digit4': 'SKILL_4',
            'b': 'OPEN_INVENTORY',
            'B': 'OPEN_INVENTORY',
            'KeyB': 'OPEN_INVENTORY',
            's': 'OPEN_SKILL',
            'S': 'OPEN_SKILL',
            'KeyS_UI': 'OPEN_SKILL', // Custom tag if needed, but 's' is already MOVE_DOWN
            'i': 'OPEN_STATUS',
            'I': 'OPEN_STATUS',
            'KeyI': 'OPEN_STATUS'
        };

        // Special handling for keys that overlap with movement
        this.uiKeys = {
            'KeyB': 'OPEN_INVENTORY',
            'KeyI': 'OPEN_STATUS'
            // 'KeyS' is MOVE_DOWN, usually handled via Shift+S or just S in non-movement context
        };

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this.pressedKeys = new Map();
        this._onBlur = () => this.resetState();
        this._onVisibilityChange = () => { if (document.hidden) this.resetState(); };
        this.attach();
    }

    attach() {
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('blur', this._onBlur);
        document.addEventListener('visibilitychange', this._onVisibilityChange);
    }

    cleanup() {
        this.resetState();
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('blur', this._onBlur);
        document.removeEventListener('visibilitychange', this._onVisibilityChange);
    }

    resetState() {
        const actions = new Set(this.pressedKeys.values());
        this.pressedKeys.clear();
        actions.forEach(action => this.emit('actionUp', action));
    }

    _onKeyDown(e) {
        // Prevent default for game keys to avoid scrolling
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) {
            e.preventDefault();
        }

        let key = e.key;
        let code = e.code;
        const physicalKey = code || key.toLowerCase();
        if (e.repeat || this.pressedKeys.has(physicalKey)) return;

        // Priority 1: Key specifically mapped
        let action = this.keyMap[code] || this.keyMap[key];

        // Special UI handling (Shift + Key)
        if (e.shiftKey) {
            if (code === 'KeyB' || key === 'b' || key === 'B') action = 'OPEN_INVENTORY';
            if (code === 'KeyS' || key === 's' || key === 'S') action = 'OPEN_SKILL';
            if (code === 'KeyI' || key === 'i' || key === 'I') action = 'OPEN_STATUS';
        }

        if (action) {
            this.pressedKeys.set(physicalKey, action);
            this.emit('actionDown', action);
        }
    }

    _onKeyUp(e) {
        const physicalKey = e.code || e.key.toLowerCase();
        const action = this.pressedKeys.get(physicalKey);
        this.pressedKeys.delete(physicalKey);
        if (action && !Array.from(this.pressedKeys.values()).includes(action)) {
            this.emit('actionUp', action);
        }
    }
}
