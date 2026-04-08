import EventEmitter from './EventEmitter.js';
import Logger from '../utils/Logger.js';

export default class InputManager extends EventEmitter {
    constructor() {
        super();
        this.handlers = [];
        this.actions = new Set();
        this.enabled = true;
        this._lockedActions = new Set();
        this._allowedActions = null;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.actions.clear();
        }
    }

    setAllowedActions(actions = null) {
        this._allowedActions = Array.isArray(actions) ? new Set(actions) : null;

        if (!this._allowedActions) return;

        Array.from(this.actions).forEach((action) => {
            if (!this._allowedActions.has(action)) {
                this.actions.delete(action);
                this.emit('keyup', action);
            }
        });
    }

    isActionAllowed(action) {
        return !this._allowedActions || this._allowedActions.has(action);
    }

    addHandler(handler) {
        this.handlers.push(handler);
        handler.on('actionDown', (action) => this._onActionDown(action));
        handler.on('actionUp', (action) => this._onActionUp(action));
        handler.on('joystickMove', (data) => this.emit('joystickMove', data));
        handler.on('aimStart', (data) => this.emit('aimStart', data));
        handler.on('aimMove', (data) => this.emit('aimMove', data));
        handler.on('aimEnd', (data) => this.emit('aimEnd', data));
        handler.on('aimCancel', (data) => this.emit('aimCancel', data));
    }

    _onActionDown(action) {
        if (!this.enabled) return;

        const sceneName = window.game?.sceneManager?.currentScene?.constructor?.name;
        if (sceneName === 'CharacterSelectionScene') return;
        if (!this.isActionAllowed(action)) return;

        if (!this.actions.has(action)) {
            this.actions.add(action);
            this.emit('keydown', action);
            Logger.log(`Action Down: ${action}`);
        }
    }

    _onActionUp(action) {
        if (this.actions.has(action)) {
            this.actions.delete(action);
            this.emit('keyup', action);
        }
    }

    releaseAllActions() {
        Array.from(this.actions).forEach((action) => {
            this.actions.delete(action);
            this.emit('keyup', action);
        });

        this.handlers.forEach((handler) => {
            handler?.resetState?.();
        });
    }

    isPressed(action) {
        return this.enabled && this.isActionAllowed(action) && this.actions.has(action);
    }

    cleanup() {
        this.handlers.forEach(h => h.cleanup());
        this.handlers = [];
        this.actions.clear();
    }
}
