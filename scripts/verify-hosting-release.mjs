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
            ...['opening', 'camp-background', 'camp-table', 'camp-guardian', 'camp-archer', 'camp-mage', 'camp-witch', 'wind', 'lake', 'thunder'].map(name => `/party-rpg-concept/assets/${name}.webp`),
            '/party-rpg-concept/assets/idle-mage.webp', '/src/assets/icon_192_clean.webp', '/src/assets/items/inventory_tools.webp',
            '/assets/resource/effects/player-skills/fireball.webp', '/assets/data/items/item_catalog.json',
            '/assets/data/music/bgm_intro.json', '/assets/data/music/bgm_cabin.json',
            '/assets/data/sound/sound_events.json',
            ...[1, 2, 3, 4, 5].map(frame => `/assets/resource/monster_slime/${frame}.webp`)
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
        const audioCode = await get('/src/js/core/SoundManager.js' + suffix);
        assert.equal(sha(audioCode.bytes), sha(readFileSync('src/js/core/SoundManager.js')), 'published audio runtime');
        assert.match(audioCode.response.headers.get('cache-control') || '', /no-cache/);
        const monsterCode = await get('/src/js/entities/Monster.js' + suffix);
        assert.equal(sha(monsterCode.bytes), sha(readFileSync('src/js/entities/Monster.js')), 'published monster runtime');
        assert.match(monsterCode.response.headers.get('cache-control') || '', /no-cache/);
        for (const source of ['src/js/main.js', 'src/js/core/SceneManager.js', 'src/js/core/ResourceManager.js', 'src/js/world/scenes/CharacterSelectionScene.js', 'src/js/core/NetworkManager.js', 'src/js/world/MonsterManager.js', 'src/js/world/scenes/WorldScene.js', 'src/js/entities/Player.js', 'src/js/entities/Projectile.js', 'src/js/ui/UIManager.js', 'src/css/style.css', 'src/js/world/scenes/CampScene.js', 'src/js/core/CampPreparation.js', 'src/js/core/AdventureSummary.js', 'src/js/ui/CampPresentation.js', 'src/js/world/scenes/LoginScene.js', 'src/css/camp.css', 'src/css/opening.css', 'src/js/core/AssetManifest.js']) {
            const liveCode = await get('/' + source + suffix);
            assert.equal(sha(liveCode.bytes), sha(readFileSync(source)), `published ${source}`);
            assert.match(liveCode.response.headers.get('cache-control') || '', /no-cache/);
        }
        console.log('VERIFIED live fireball, inventory UI/styles, ground-guide and online monster runtimes match commit; all five slime frames are available');
        console.log('VERIFIED live audio runtime matches commit; intro/field scores and sound events are available');
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
