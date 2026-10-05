const overlap = (a, b) => Math.max(0, Math.min(a.left + a.width, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.top + a.height, b.bottom) - Math.max(a.top, b.top));

// Prefer a clear HUD/focus region before using the existing proximity score.
// Bounds and rectangles are CSS viewport pixels, including safe-area insets.
export function clearTutorialCandidates(candidates, zones, width, height, bounds) {
    const xs = [bounds.left, (bounds.left + bounds.right - width) / 2, bounds.right - width];
    const ys = [bounds.top, bounds.bottom - height];
    for (const z of zones) {
        xs.push(z.right + 8, z.left - width - 8);
        ys.push(z.bottom + 8, z.top - height - 8);
    }
    const clamp = p => ({ ...p, width, height,
        left: Math.round(Math.max(bounds.left, Math.min(bounds.right - width, p.left))),
        top: Math.round(Math.max(bounds.top, Math.min(bounds.bottom - height, p.top))) });
    const all = [...candidates, ...xs.flatMap(left => ys.map(top => ({ left, top })))].map(clamp);
    const clear = all.filter(p => zones.every(z => overlap(p, z) < .5));
    // If the viewport cannot fit a clear card, retain the existing least-overlap scorer.
    return clear.length ? clear : all;
}
