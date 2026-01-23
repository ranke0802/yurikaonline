import EventEmitter from './EventEmitter.js';
import Logger from '../utils/Logger.js';

export default class InputManager extends EventEmitter {
    constructor() {
        super();
        this.handlers = [];
        this.actions = new Set(); // 현재 활성화된 액션들 (예: 'MOVE_UP', 'ATTACK')
        this.enabled = true;
    }

    addHandler(handler) {
        this.handlers.push(handler);
        handler.on('actionDown', (action) => this._onActionDown(action));
        handler.on('actionUp', (action) => this._onActionUp(action));
        handler.on('joystickMove', (data) => this.emit('joystickMove', data)); // 조이스틱 아날로그 데이터
    }

    _onActionDown(action) {
        if (!this.enabled) return;
        if (!this.actions.has(action)) {
            this.actions.add(action);
            this.emit('keydown', action); // 하위 호환성 또는 이벤트 기반 로직용
            Logger.log(`Action Down: ${action}`);
        }
    }

    _onActionUp(action) {
        if (this.actions.has(action)) {
            this.actions.delete(action);
            this.emit('keyup', action);
        }
    }

    // Polling 방식 지원 (매 프레임 확인용)
    isPressed(action) {
        return this.enabled && this.actions.has(action);
    }

    cleanup() {
        this.handlers.forEach(h => h.cleanup());
        this.handlers = [];
        this.actions.clear();
    }
}
