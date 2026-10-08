// Preserve the authored pixel edges at every display scale. Restore the caller's
// sampling state so character rendering cannot change world/effect rendering.
export function drawCharacterFrame(ctx, image, sx, sy, sw, sh, dx, dy, dw, dh) {
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    try {
        ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
    } finally {
        ctx.imageSmoothingEnabled = smoothing;
    }
}
