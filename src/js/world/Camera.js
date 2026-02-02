import Logger from '../utils/Logger.js';

/**
 * Enhanced Camera with smooth following, culling support, and performance optimizations
 * Phase 0: 성능 최적화 - 부드러운 추적, 가시 영역 계산, 진동 효과 지원
 */
export default class Camera {
    constructor(width, height, worldWidth = 6400, worldHeight = 6400) {
        this.x = 0;
        this.y = 0;
        this.width = width;
        this.height = height;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;

        // Smooth following properties
        this.smoothness = 0.1; // Lower = smoother but more lag (0.1 = 10% per frame)
        this.targetX = 0;
        this.targetY = 0;

        // Dead zone (target can move within this area without camera moving)
        this.deadZoneX = width * 0.15; // 15% of viewport
        this.deadZoneY = height * 0.15;

        // Screen shake effect
        this.shakeIntensity = 0;
        this.shakeDecay = 0.9;
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;

        // Bounds margin for culling
        this.cullingMargin = 100;

        // Debug info
        this.debug = false;
    }

    /**
     * Update camera position with smooth following
     * @param {number} targetX - Target X position (center)
     * @param {number} targetY - Target Y position (center)
     * @param {number} dt - Delta time in seconds
     */
    update(targetX, targetY, dt = 1 / 60) {
        // Calculate desired camera position (centered on target)
        const desiredX = targetX - this.width / 2;
        const desiredY = targetY - this.height / 2;

        // Apply dead zone
        const dx = desiredX - this.x;
        const dy = desiredY - this.y;

        let moveX = 0;
        let moveY = 0;

        // Only move if outside dead zone
        if (Math.abs(dx) > this.deadZoneX) {
            moveX = dx - (dx > 0 ? this.deadZoneX : -this.deadZoneX);
        }
        if (Math.abs(dy) > this.deadZoneY) {
            moveY = dy - (dy > 0 ? this.deadZoneY : -this.deadZoneY);
        }

        // Smooth interpolation
        this.x += moveX * this.smoothness;
        this.y += moveY * this.smoothness;

        // Clamp to world bounds
        this.clampToBounds();

        // Update shake effect
        this.updateShake();

        // Store target for reference
        this.targetX = targetX;
        this.targetY = targetY;
    }

    /**
     * Follow a target entity with smooth interpolation
     * @param {Object} target - Target entity with x, y, width, height properties
     * @param {number} dt - Delta time
     */
    follow(target, dt = 1 / 60) {
        if (!target) return;

        // Calculate center of target
        const centerX = target.x + (target.width || 0) / 2;
        const centerY = target.y + (target.height || 0) / 2;

        this.update(centerX, centerY, dt);
    }

    /**
     * Clamp camera position to world bounds
     */
    clampToBounds() {
        this.x = Math.max(0, Math.min(this.x, this.worldWidth - this.width));
        this.y = Math.max(0, Math.min(this.y, this.worldHeight - this.height));
    }

    /**
     * Update screen shake effect
     */
    updateShake() {
        if (this.shakeIntensity > 0.1) {
            this.shakeOffsetX = (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeOffsetY = (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeIntensity *= this.shakeDecay;
        } else {
            this.shakeOffsetX = 0;
            this.shakeOffsetY = 0;
            this.shakeIntensity = 0;
        }
    }

    /**
     * Trigger screen shake
     * @param {number} intensity - Shake intensity in pixels
     * @param {number} duration - Shake duration in seconds
     */
    shake(intensity = 10, duration = 0.3) {
        this.shakeIntensity = intensity;
        this.shakeDecay = Math.pow(0.01, 1 / (duration * 60)); // Decay to 1% over duration
    }

    /**
     * Get the actual camera position with shake offset
     * @returns {Object} Camera position {x, y}
     */
    getPosition() {
        return {
            x: this.x + this.shakeOffsetX,
            y: this.y + this.shakeOffsetY
        };
    }

    /**
     * Check if an entity is visible in camera view (for culling)
     * @param {Object} entity - Entity with x, y, width, height
     * @param {number} margin - Additional margin around camera
     * @returns {boolean} Whether entity is visible
     */
    isVisible(entity, margin = this.cullingMargin) {
        if (!entity) return false;

        const ex = entity.x;
        const ey = entity.y;
        const ew = entity.width || 0;
        const eh = entity.height || 0;

        return (
            ex + ew >= this.x - margin &&
            ex <= this.x + this.width + margin &&
            ey + eh >= this.y - margin &&
            ey <= this.y + this.height + margin
        );
    }

    /**
     * Get visible area bounds with margin
     * @param {number} margin - Additional margin
     * @returns {Object} Bounds {left, right, top, bottom}
     */
    getVisibleBounds(margin = this.cullingMargin) {
        return {
            left: this.x - margin,
            right: this.x + this.width + margin,
            top: this.y - margin,
            bottom: this.y + this.height + margin
        };
    }

    /**
     * Resize camera viewport
     * @param {number} width - New width
     * @param {number} height - New height
     */
    resize(width, height) {
        this.width = width;
        this.height = height;

        // Recalculate dead zone
        this.deadZoneX = width * 0.15;
        this.deadZoneY = height * 0.15;

        // Re-clamp to bounds
        this.clampToBounds();
    }

    /**
     * Set world bounds
     * @param {number} worldWidth - World width
     * @param {number} worldHeight - World height
     */
    setWorldBounds(worldWidth, worldHeight) {
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.clampToBounds();
    }

    /**
     * Transform world coordinates to screen coordinates
     * @param {number} worldX - World X
     * @param {number} worldY - World Y
     * @returns {Object} Screen coordinates {x, y}
     */
    worldToScreen(worldX, worldY) {
        const pos = this.getPosition();
        return {
            x: worldX - pos.x,
            y: worldY - pos.y
        };
    }

    /**
     * Transform screen coordinates to world coordinates
     * @param {number} screenX - Screen X
     * @param {number} screenY - Screen Y
     * @returns {Object} World coordinates {x, y}
     */
    screenToWorld(screenX, screenY) {
        const pos = this.getPosition();
        return {
            x: screenX + pos.x,
            y: screenY + pos.y
        };
    }

    /**
     * Apply camera transform to canvas context
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    applyTransform(ctx) {
        const pos = this.getPosition();
        ctx.translate(-pos.x, -pos.y);
    }

    /**
     * Reset camera transform
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     */
    resetTransform(ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /**
     * Get camera debug info
     * @returns {Object} Debug information
     */
    getDebugInfo() {
        return {
            position: { x: Math.round(this.x), y: Math.round(this.y) },
            target: { x: Math.round(this.targetX), y: Math.round(this.targetY) },
            shake: { intensity: this.shakeIntensity.toFixed(2) },
            visibleBounds: this.getVisibleBounds()
        };
    }
}
