/**
 * Enhanced Object Pool to reuse objects and reduce GC pressure.
 * Phase 0: 메모리 관리 강화 - 최대 풀 크기 제한, 통계 추적, 안전한 초기화
 */
export default class ObjectPool {
    constructor(createFn, resetFn, initialSize = 10, maxSize = 100) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.pool = [];
        this.maxSize = maxSize;
        this.activeCount = 0;
        this.totalCreated = 0;
        this.totalReused = 0;
        this.totalReleased = 0;

        // 초기 풀 생성
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFn());
            this.totalCreated++;
        }
    }

    /**
     * Get an object from the pool or create a new one if empty.
     * @param {...*} args - Arguments to pass to resetFn
     * @returns {*} Pooled object
     */
    acquire(...args) {
        let obj;

        if (this.pool.length > 0) {
            obj = this.pool.pop();
            this.totalReused++;
        } else {
            // 풀이 비어있으면 새로 생성 (maxSize 제한 없이 - 필요시 동적 확장)
            obj = this.createFn();
            this.totalCreated++;
        }

        this.activeCount++;

        if (this.resetFn) {
            this.resetFn(obj, ...args);
        }

        return obj;
    }

    /**
     * Return an object back to the pool.
     * @param {*} obj - Object to return to pool
     * @returns {boolean} Whether the object was accepted into pool
     */
    release(obj) {
        if (!obj) return false;

        this.activeCount--;
        this.totalReleased++;

        // 풀이 maxSize를 초과하면 객체 버림 (GC 대상)
        if (this.pool.length >= this.maxSize) {
            return false;
        }

        // 객체 초기화 (민감한 데이터 제거)
        if (obj && typeof obj === 'object') {
            // 참조 제거를 위한 기본 초기화
            for (let key in obj) {
                if (obj.hasOwnProperty(key) && typeof obj[key] === 'object' && obj[key] !== null) {
                    // 중첩 객체는 null로 설정 (선택적)
                    if (Array.isArray(obj[key])) {
                        obj[key].length = 0;
                    }
                }
            }
        }

        this.pool.push(obj);
        return true;
    }

    /**
     * Get pool statistics for monitoring
     * @returns {Object} Pool statistics
     */
    getStats() {
        return {
            available: this.pool.length,
            active: this.activeCount,
            totalCreated: this.totalCreated,
            totalReused: this.totalReused,
            totalReleased: this.totalReleased,
            reuseRate: this.totalCreated > 0
                ? (this.totalReused / (this.totalReused + this.totalCreated) * 100).toFixed(2) + '%'
                : '0%',
            maxSize: this.maxSize
        };
    }

    /**
     * Clear all pooled objects (for memory cleanup)
     */
    clear() {
        this.pool.length = 0;
        this.activeCount = 0;
    }

    /**
     * Pre-warm the pool with additional objects
     * @param {number} count - Number of objects to pre-create
     */
    prewarm(count) {
        const toCreate = Math.min(count, this.maxSize - this.pool.length);
        for (let i = 0; i < toCreate; i++) {
            this.pool.push(this.createFn());
            this.totalCreated++;
        }
    }
}

/**
 * Multi-type Object Pool Manager for managing multiple pools
 */
export class ObjectPoolManager {
    constructor() {
        this.pools = new Map();
    }

    /**
     * Register a new pool type
     * @param {string} name - Pool identifier
     * @param {Function} createFn - Factory function
     * @param {Function} resetFn - Reset function
     * @param {number} initialSize - Initial pool size
     * @param {number} maxSize - Maximum pool size
     */
    register(name, createFn, resetFn, initialSize = 10, maxSize = 100) {
        this.pools.set(name, new ObjectPool(createFn, resetFn, initialSize, maxSize));
    }

    /**
     * Acquire object from named pool
     * @param {string} name - Pool name
     * @param {...*} args - Arguments for resetFn
     * @returns {*} Pooled object
     */
    acquire(name, ...args) {
        const pool = this.pools.get(name);
        if (!pool) {
            throw new Error(`Pool '${name}' not found`);
        }
        return pool.acquire(...args);
    }

    /**
     * Release object back to named pool
     * @param {string} name - Pool name
     * @param {*} obj - Object to release
     */
    release(name, obj) {
        const pool = this.pools.get(name);
        if (!pool) {
            throw new Error(`Pool '${name}' not found`);
        }
        pool.release(obj);
    }

    /**
     * Get statistics for all pools
     * @returns {Object} Statistics for all pools
     */
    getAllStats() {
        const stats = {};
        this.pools.forEach((pool, name) => {
            stats[name] = pool.getStats();
        });
        return stats;
    }

    /**
     * Clear all pools
     */
    clearAll() {
        this.pools.forEach(pool => pool.clear());
    }
}
