// Filter authored character art when reducing it to the backing canvas. Keep
// native/enlarged pixel art crisp and restore state for world/effect rendering.
export function drawCharacterFrame(ctx, image, sx, sy, sw, sh, dx, dy, dw, dh) {
    const transform = ctx.getTransform?.();
    const scaleX = transform ? Math.hypot(transform.a, transform.b) : 1;
    const scaleY = transform ? Math.hypot(transform.c, transform.d) : 1;
    const smoothing = ctx.imageSmoothingEnabled;
    const quality = ctx.imageSmoothingQuality;
    ctx.imageSmoothingEnabled = Math.abs(dw * scaleX) < sw || Math.abs(dh * scaleY) < sh;
    ctx.imageSmoothingQuality = 'high';
    try {
        ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
    } finally {
        ctx.imageSmoothingEnabled = smoothing;
        if (quality !== undefined) ctx.imageSmoothingQuality = quality;
    }
}
