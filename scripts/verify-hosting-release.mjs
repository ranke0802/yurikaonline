import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import assets from '../src/js/core/AssetManifest.js';
const origin = 'https://yurika-online.web.app';
const version = readFileSync('version.txt', 'utf8').trim();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function get(path) {
    const response = await fetch(origin + path, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
    return { response, bytes: Buffer.from(await response.arrayBuffer()) };
}
let failure;
for (let attempt = 0; attempt < 6; attempt++) {
    try {
        const suffix = `?release=${process.env.GITHUB_SHA || version}&attempt=${attempt}`;
        const latest = await get('/version.txt' + suffix);
        assert.equal(latest.bytes.toString().trim(), version, 'published version');
        assert.match(latest.response.headers.get('cache-control') || '', /no-store/);
        const html = await get('/' + suffix);
        assert.equal(sha(html.bytes), sha(readFileSync('index.html')), 'published HTML must match this commit');
        assert.match(html.response.headers.get('cache-control') || '', /no-cache/);
        assert.ok(html.bytes.toString().includes("new URLSearchParams(location.search).get('local') === '1'"), 'online entry preserved');
        const sources = [
            '/party-rpg-concept/assets/camp-master-v2.webp', '/party-rpg-concept/assets/mage-key.webp',
            '/party-rpg-concept/assets/idle-mage.webp', '/src/assets/icon_192_clean.webp',
            '/assets/resource/effects/player-skills/fireball.webp', '/assets/data/items/item_catalog.json'
        ];
        for (const source of sources) {
            const target = assets[source];
            assert.ok(target, source);
            const { response, bytes } = await get(target);
            assert.equal(sha(bytes).slice(0,24), target.split('/').pop().split('.')[0], 'asset content hash');
            assert.match(response.headers.get('content-type') || '', target.endsWith('.webp') ? /image\/webp/ : /application\/json/);
            assert.match(response.headers.get('cache-control') || '', /max-age=31536000/);
            assert.match(response.headers.get('cache-control') || '', /immutable/);
            console.log(JSON.stringify({path:target,status:response.status,bytes:bytes.length,cacheControl:response.headers.get('cache-control')}));
        }
        console.log(`VERIFIED Hosting ${origin} version=${version} commit=${process.env.GITHUB_SHA || 'local'}; online entry and ${sources.length} immutable assets`);
        failure = null;
        break;
    } catch (error) {
        failure = error;
        console.log(`Hosting verification attempt ${attempt + 1}: ${error.message}`);
        if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 5000));
    }
}
if (failure) throw failure;
