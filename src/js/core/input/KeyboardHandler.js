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
            ' ': 'ATTACK',
            'j': 'ATTACK',
            'J': 'ATTACK',
            'h': 'SKILL_1',
            'H': 'SKILL_1',
            'u': 'SKILL_2',
            'U': 'SKILL_2',
            'k': 'SKILL_3',
            'K': 'SKILL_3',
            '1': 'SKILL_1',
            '2': 'SKILL_2',
            '3': 'SKILL_3',
            '4': 'SKILL_4',
            'B': 'OPEN_INVENTORY',
            'S': 'OPEN_SKILL',
            'I': 'OPEN_STATUS'
        };

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this.attach();
    }

    attach() {
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
    }

    cleanup() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
    }

    _onKeyDown(e) {
        let key = e.key;
        if (e.shiftKey) {
            if (key === 'b' || key === 'B') key = 'B';
            if (key === 's' || key === 'S') key = 'S';
            if (key === 'i' || key === 'I') key = 'I';
        }
        const action = this.keyMap[key] || this.keyMap[e.code];
        if (action) {
            this.emit('actionDown', action);
        }
    }

    _onKeyUp(e) {
        let key = e.key;
        if (e.shiftKey || key === 'Shift') {
            // We want to handle release carefully, but for simple mapping:
            if (key === 'b' || key === 'B') key = 'B';
            if (key === 's' || key === 'S') key = 'S';
            if (key === 'i' || key === 'I') key = 'I';
        }
        const action = this.keyMap[key] || this.keyMap[e.code];
        if (action) {
            this.emit('actionUp', action);
        }
    }
}
