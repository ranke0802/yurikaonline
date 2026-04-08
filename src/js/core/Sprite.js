export class Sprite {
    constructor(image, cols, rows) {
        this.image = image;
        this.cols = cols;
        this.rows = rows;
        this.sw = image.width / cols;
        this.sh = image.height / rows;
        this.frame = 0;
    }

    static _getAxisTransform(ctx, axis = 'x') {
        const transform = ctx?.getTransform?.();
        const scale = Math.abs(axis === 'y' ? Number(transform?.d || 0) : Number(transform?.a || 0));
        const translate = axis === 'y' ? Number(transform?.f || 0) : Number(transform?.e || 0);
        return {
            scale: Number.isFinite(scale) && scale > 0.0001 ? scale : 1,
            translate: Number.isFinite(translate) ? translate : 0
        };
    }

    static snapWorldCoordinate(ctx, value, axis = 'x') {
        if (!Number.isFinite(value)) return 0;
        const { scale, translate } = Sprite._getAxisTransform(ctx, axis);
        return (Math.round(value * scale + translate) - translate) / scale;
    }

    static snapWorldSize(ctx, value, axis = 'x') {
        if (!Number.isFinite(value)) return 0;
        const { scale } = Sprite._getAxisTransform(ctx, axis);
        return Math.max(1 / scale, Math.round(value * scale) / scale);
    }

    /**
     * @param {CanvasRenderingContext2D} ctx 
     * @param {number} dir - Direction index
     * @param {number} frame - Animation frame index
     * @param {number} x - World X
     * @param {number} y - World Y
     * @param {number} width - Draw width
     * @param {number} height - Draw height
     * @param {boolean} swapDirFrame - If true, dir is column and frame is row
     */
    draw(ctx, dir, frame, x, y, width, height, swapDirFrame = false) {
        let sx, sy;
        if (swapDirFrame) {
            sx = (dir % this.cols) * this.sw;
            sy = (frame % this.rows) * this.sh;
        } else {
            sx = (frame % this.cols) * this.sw;
            sy = (dir % this.rows) * this.sh;
        }

        const prevSmoothing = ctx.imageSmoothingEnabled;
        const prevWebkitSmoothing = ctx.webkitImageSmoothingEnabled;
        const prevMozSmoothing = ctx.mozImageSmoothingEnabled;
        const prevMsSmoothing = ctx.msImageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.webkitImageSmoothingEnabled = false;
        ctx.mozImageSmoothingEnabled = false;
        ctx.msImageSmoothingEnabled = false;

        const dx = Sprite.snapWorldCoordinate(ctx, x, 'x');
        const dy = Sprite.snapWorldCoordinate(ctx, y, 'y');
        const dw = Sprite.snapWorldSize(ctx, width, 'x');
        const dh = Sprite.snapWorldSize(ctx, height, 'y');

        ctx.drawImage(
            this.image,
            sx, sy, this.sw, this.sh,
            dx, dy, dw, dh
        );

        ctx.imageSmoothingEnabled = prevSmoothing;
        ctx.webkitImageSmoothingEnabled = prevWebkitSmoothing;
        ctx.mozImageSmoothingEnabled = prevMozSmoothing;
        ctx.msImageSmoothingEnabled = prevMsSmoothing;
    }
}
