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
            '1': 'SKILL_1',
            '2': 'SKILL_2',
            '3': 'SKILL_3',
            '4': 'SKILL_4'
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
        const action = this.keyMap[e.key] || this.keyMap[e.code];
        if (action) {
            this.emit('actionDown', action);
        }
    }

    _onKeyUp(e) {
        const action = this.keyMap[e.key] || this.keyMap[e.code];
        if (action) {
            this.emit('actionUp', action);
        }
    }
}
