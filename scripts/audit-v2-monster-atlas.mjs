#!/usr/bin/env node
/**
 * Alpha/boundary auditor for 8x11 monster atlases.  It validates only the
 * runtime-enabled rows (idle, moveRight, moveLeft) and emits a contact sheet
 * that can be inspected before a sheet is connected to game data.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const CELL_WIDTH = 192;
const CELL_HEIGHT = 208;
const COLUMNS = 8;
const ROWS = 11;
const REQUIRED_ROWS = [
    ['idle', 0, 7],
    ['moveRight', 1, 8],
    ['moveLeft', 2, 8]
];

function usage() {
    console.error('Usage: node scripts/audit-v2-monster-atlas.mjs <spritesheet.webp> <output-dir>');
    process.exitCode = 1;
}

function findBounds(data, width, height) {
    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;
    let opaquePixels = 0;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (data[(y * width + x) * 4 + 3] <= 8) continue;
            opaquePixels += 1;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
        }
    }
    return right < left ? null : { left, top, right: right + 1, bottom: bottom + 1, opaquePixels };
}

async function inspectCell(sourcePath, x, y) {
    const { data, info } = await sharp(sourcePath)
        .extract({ left: x * CELL_WIDTH, top: y * CELL_HEIGHT, width: CELL_WIDTH, height: CELL_HEIGHT })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { bounds: findBounds(data, info.width, info.height), png: await sharp(data, { raw: info }).png().toBuffer() };
}

async function main() {
    const [sourcePath, outputDir] = process.argv.slice(2);
    if (!sourcePath || !outputDir) return usage();
    const fileBuffer = await fs.readFile(sourcePath);
    const metadata = await sharp(fileBuffer).metadata();
    const errors = [];
    if (metadata.width !== CELL_WIDTH * COLUMNS || metadata.height !== CELL_HEIGHT * ROWS) {
        errors.push(`Expected 1536x2288, got ${metadata.width}x${metadata.height}`);
    }

    const states = [];
    const contactCells = [];
    for (const [state, row, count] of REQUIRED_ROWS) {
        const frames = [];
        for (let column = 0; column < count; column += 1) {
            const cell = await inspectCell(sourcePath, column, row);
            const bounds = cell.bounds;
            const label = `${state}[${column}]`;
            if (!bounds) errors.push(`${label} is transparent/empty`);
            if (bounds && (bounds.left <= 0 || bounds.top <= 0 || bounds.right >= CELL_WIDTH || bounds.bottom >= CELL_HEIGHT)) {
                errors.push(`${label} touches its cell edge (${JSON.stringify(bounds)}) and may be cropped`);
            }
            frames.push({ frame: column, bounds });
            contactCells.push({ input: cell.png, left: column * CELL_WIDTH, top: states.length * CELL_HEIGHT });
        }
        states.push({ state, row, count, frames });
    }
    await fs.mkdir(outputDir, { recursive: true });
    const contactPath = path.join(outputDir, 'active-animation-contact-sheet.png');
    await sharp({
        create: {
            width: CELL_WIDTH * COLUMNS,
            height: CELL_HEIGHT * REQUIRED_ROWS.length,
            channels: 4,
            background: { r: 20, g: 24, b: 33, alpha: 1 }
        }
    }).composite(contactCells).png().toFile(contactPath);
    const report = {
        ok: errors.length === 0,
        source: path.resolve(sourcePath),
        sha256: crypto.createHash('sha256').update(fileBuffer).digest('hex'),
        dimensions: { width: metadata.width, height: metadata.height },
        grid: { columns: COLUMNS, rows: ROWS, frameWidth: CELL_WIDTH, frameHeight: CELL_HEIGHT },
        states,
        contactSheet: contactPath,
        errors
    };
    await fs.writeFile(path.join(outputDir, 'audit.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
    console.error(`[atlas-audit] ${error.stack || error.message}`);
    process.exitCode = 1;
});
