import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import assets from '../../src/js/core/AssetManifest.js';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const RELEASE_FILES = ['/index.html', '/src/js/main.js', '/sw.js', '/src/js/core/AssetManifest.js', '/manifest.json'];
export function createReleaseManifest() {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (process.env.GITHUB_SHA) assert.equal(process.env.GITHUB_SHA, commit, 'CI checkout must match the release commit');
    const files = Object.fromEntries(RELEASE_FILES.map(name => {
        const data = readFileSync('.' + name); return [name, { bytes: data.length, sha256: digest(data) }];
    }));
    const targets = [...new Set(Object.values(assets))].sort();
    let assetBytes = 0;
    const records = targets.map(target => {
        assert.match(target, /^\/assets\/immutable\/[a-f0-9]{24}\.(webp|png|svg|json)$/);
        const data = readFileSync('.' + target), sha256 = digest(data);
        assert.equal(target.split('/').pop().split('.')[0], sha256.slice(0, 24), target);
        assetBytes += data.length; return { target, bytes: data.length, sha256 };
    });
    return { schema: 1, version: readFileSync('version.txt', 'utf8').trim(), commit, files,
        immutable: { count: targets.length, bytes: assetBytes, sha256: digest(JSON.stringify(records)), headerSample: targets.find(p => p.endsWith('.webp')) } };
}
export function manifestBytes(manifest = createReleaseManifest()) { return Buffer.from(JSON.stringify(manifest) + '\n'); }
