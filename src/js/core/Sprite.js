export class Sprite {
    constructor(image, cols, rows) {
        this.image = image;
        this.cols = cols;
        this.rows = rows;
        this.sw = image.width / cols;
        this.sh = image.height / rows;
        this.frame = 0;
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

        ctx.drawImage(
            this.image,
            sx, sy, this.sw, this.sh,
            x, y, width, height
        );
    }
}
