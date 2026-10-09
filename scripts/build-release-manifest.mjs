import { writeFileSync } from 'node:fs';
import { createReleaseManifest, manifestBytes } from './lib/release-manifest.mjs';
const manifest = createReleaseManifest(), bytes = manifestBytes(manifest);
writeFileSync('release-manifest.json', bytes);
console.log(`Release ${manifest.version} ${manifest.commit}: ${manifest.immutable.count} immutable hashes validated locally; metadata ${bytes.length} bytes`);
