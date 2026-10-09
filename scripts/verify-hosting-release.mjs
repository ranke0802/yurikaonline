import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { releasePolicy } from './lib/qa-network-policy.cjs';
import { createBoundedClient } from './lib/bounded-release-client.mjs';
import { createReleaseManifest, digest, manifestBytes, RELEASE_FILES } from './lib/release-manifest.mjs';
const policy = releasePolicy(); // Reject remote/absent budgets BEFORE any I/O.
const expected = createReleaseManifest(), metadata = manifestBytes(expected);
assert.deepEqual(readFileSync('release-manifest.json'), metadata, 'Run npm run release:manifest for this exact checkout');
const expectedBodies = readFileSync('version.txt').length + metadata.length + Object.values(expected.files).reduce((sum, file) => sum + file.bytes, 0);
assert.ok(policy.maxRequests >= RELEASE_FILES.length + 3, 'Budget must cover the fixed plan before contacting Hosting');
assert.ok(policy.maxBytes >= expectedBodies, 'Budget must cover the fixed plan before contacting Hosting');
const client = createBoundedClient(policy);
try {
    const version = await client.get('/version.txt', { expectedBytes: readFileSync('version.txt').length });
    assert.equal(version.bytes.toString().trim(), expected.version); assert.match(version.headers['cache-control'] || '', /no-store/);
    const published = await client.get('/release-manifest.json', { expectedBytes: metadata.length });
    assert.deepEqual(published.bytes, metadata, 'published release metadata must match this checkout');
    for (const path of RELEASE_FILES) {
        const result = await client.get(path === '/index.html' ? '/' : path, { expectedBytes: expected.files[path].bytes });
        assert.equal(digest(result.bytes), expected.files[path].sha256, path);
        assert.match(result.headers['cache-control'] || '', /no-cache/);
    }
    const header = await client.get(expected.immutable.headerSample, { method: 'HEAD' });
    assert.match(header.headers['cache-control'] || '', /max-age=31536000/); assert.match(header.headers['cache-control'] || '', /immutable/);
    assert.equal(Number(header.headers['content-length']), readFileSync('.' + expected.immutable.headerSample).length);
    console.log(JSON.stringify({ status: 'passed', origin: policy.origin, version: expected.version, commit: expected.commit, ...client.stats, imageBodyGets: 0, retries: 0 }));
} catch (error) {
    console.error(JSON.stringify({ status: 'failed', ...client.stats, message: error.message, retries: 0 })); process.exitCode = 1;
}
