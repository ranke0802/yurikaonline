export default class Entity {
    constructor(x = 0, y = 0) {
        this.id = this.generateId();
        this.x = x;
        this.y = y;
        this.width = 32;
        this.height = 32;
        this.isDead = false;
        this.components = {}; // ECS-lite pattern
    }

    generateId() {
        return Math.random().toString(36).substr(2, 9);
    }

    update(dt) {
        // Base update logic
        // Update all attached components
        Object.values(this.components).forEach(c => {
            if (c.update) c.update(dt);
        });
    }

    render(ctx) {
        // Base render logic (debug box usually)
    }

    // Component System
    addComponent(name, component) {
        this.components[name] = component;
        component.entity = this;
        if (component.init) component.init();
    }

    getComponent(name) {
        return this.components[name];
    }
}
