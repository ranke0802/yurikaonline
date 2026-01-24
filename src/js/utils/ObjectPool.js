/**
 * Simple Object Pool to reuse objects and reduce GC pressure.
 */
export default class ObjectPool {
    constructor(createFn, resetFn, initialSize = 10) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.pool = [];

        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFn());
        }
    }

    /**
     * Get an object from the pool or create a new one if empty.
     */
    acquire(...args) {
        const obj = this.pool.length > 0 ? this.pool.pop() : this.createFn();
        if (this.resetFn) {
            this.resetFn(obj, ...args);
        }
        return obj;
    }

    /**
     * Return an object back to the pool.
     */
    release(obj) {
        this.pool.push(obj);
    }
}
