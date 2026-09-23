import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Supply the four generated PNGs in fireball, missile, lightning, barrier order.
// Preserve the authored frame scale/timeline; transparent gutters stop adjacent
// frames bleeding into each other when Canvas scales or rotates the atlas.
const names = ['fireball', 'missile', 'lightning', 'barrier'];
if (process.argv.length !== 6) throw new Error('Expected four generated PNG paths');
const output = resolve('assets/resource/effects/player-skills');
await mkdir(output, { recursive: true });
const manifest = { cellSize: 192, columns: 4, rows: 4, frames: 16, assets: {} };
for (const [index, name] of names.entries()) {
    const source = process.argv[index + 2];
    const { width, height, hasAlpha } = await sharp(source).metadata();
    if (!hasAlpha) throw new Error(`${name} must have a transparent background`);
    const cells = [];
    for (let frame = 0; frame < 16; frame++) {
        const col = frame % 4, row = Math.floor(frame / 4);
        const left = Math.round(col * width / 4), top = Math.round(row * height / 4);
        // Frame 8's ignition has a 16px sliver of the following row's ring
        // at its lower edge. Exclude that neighbour while retaining alignment.
        const bottomGutter = name === 'fireball' && frame === 8 ? 16 : 0;
        const input = await sharp(source).extract({ left, top,
            width: Math.round((col + 1) * width / 4) - left,
            height: Math.round((row + 1) * height / 4) - top - bottomGutter
        }).extend({ bottom: bottomGutter, background: '#00000000' })
            .resize(180, 180, { fit: 'fill' }).png().toBuffer();
        cells.push({ input, left: col * 192 + 6, top: row * 192 + 6 });
    }
    const info = await sharp({ create: { width: 768, height: 768, channels: 4, background: '#00000000' } })
        .composite(cells).webp({ quality: 82, alphaQuality: 90, effort: 6 })
        .toFile(resolve(output, `${name}.webp`));
    manifest.assets[name] = { file: `${name}.webp`, bytes: info.size, width: info.width, height: info.height };
}
await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
