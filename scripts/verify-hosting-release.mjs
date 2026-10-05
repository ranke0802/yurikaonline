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
        for (const manifestPath of ['/manifest.json','/manifest.json?v=0.02.154']) {
            const liveManifest=await get(manifestPath);
            assert.equal(sha(liveManifest.bytes),sha(readFileSync('manifest.json')),'stable and legacy installed manifest URL');
            assert.match(liveManifest.response.headers.get('content-type')||'',/application\/(?:manifest\+)?json/);
            assert.match(liveManifest.response.headers.get('cache-control')||'',/no-cache/);
        }
        const approvedArt = JSON.parse(readFileSync('reports/approved-art-v142/provenance.json', 'utf8'));
        const sources = [
            ...['icon-192','icon-512','icon-maskable-192','icon-maskable-512','apple-touch-icon','favicon-32','favicon-48'].map(n=>`/assets/resource/pwa-emblem/${n}.png`),
            ...approvedArt.assets.map(asset => '/' + asset.file),
            ...Object.keys(assets).filter(p=>p.startsWith('/assets/resource/classes/mage-style-v159/')),
            '/assets/resource/classes/approved/warrior-shield-rush-body.webp', '/assets/resource/classes/approved/warrior-shield-rush-effects.webp',
            '/party-rpg-concept/assets/camp-master-v2.webp', '/party-rpg-concept/assets/mage-key.webp',
            ...['opening', 'camp-background', 'camp-table', 'camp-guardian', 'camp-archer', 'camp-mage', 'camp-witch', 'wind', 'lake', 'thunder'].map(name => `/party-rpg-concept/assets/${name}.webp`),
            '/party-rpg-concept/assets/idle-mage.webp', '/src/assets/icon_192_clean.webp', '/src/assets/items/inventory_tools.webp',
            '/assets/resource/effects/player-skills/fireball.webp', '/assets/data/items/item_catalog.json',
            ...['witch','warrior','archer'].flatMap(id => [`/assets/resource/classes/${id}-runtime.webp`, `/assets/resource/classes/${id}-effects.webp`, `/assets/resource/classes/${id}-actions.webp`, `/assets/data/characters/${id}.json`]),
            ...['slime','squirtle','emolga','gastly','king_slime','ruin_wobbuffet','thunder_pikachu','astral_sylveon'].map(id=>`/assets/data/monsters/${id}.json`),
            ...['squirtle','emolga','gastly','ruin_wobbuffet','thunder_pikachu','astral_sylveon'].map(id=>`/assets/resource/monsters/${id}/spritesheet.webp`),
            '/assets/resource/branding/yurika-online-intro-logo-768.webp', '/assets/resource/branding/yurika-online-intro-glint-128.webp', '/assets/resource/effects/monster-skill-vfx-atlas.webp', '/assets/resource/classes/status.webp', '/assets/resource/classes/life-circle.webp', '/assets/resource/classes/poison-potion.webp',
            '/assets/data/music/bgm_intro.json', '/assets/data/music/bgm_cabin.json',
            '/assets/data/sound/sound_events.json',
            ...[1, 2, 3, 4, 5].map(frame => `/assets/resource/monster_slime/${frame}.webp`)
        ];
        for (const source of sources) {
            const target = assets[source];
            assert.ok(target, source);
            const { response, bytes } = await get(target);
            assert.equal(sha(bytes).slice(0,24), target.split('/').pop().split('.')[0], 'asset content hash');
            assert.match(response.headers.get('content-type') || '', target.endsWith('.webp') ? /image\/webp/ : target.endsWith('.png') ? /image\/png/ : /application\/json/);
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
        for (const source of ['sw.js', 'src/js/main.js', 'src/js/core/SceneManager.js', 'src/js/core/ResourceManager.js', 'src/js/world/scenes/CharacterSelectionScene.js', 'src/js/core/NetworkManager.js', 'src/js/world/MonsterManager.js', 'src/js/world/scenes/WorldScene.js', 'src/js/entities/Monster.js', 'src/js/entities/Player.js', 'src/js/entities/RemotePlayer.js', 'src/js/entities/Projectile.js', 'src/js/ui/UIManager.js', 'src/js/ui/SkillAvailability.js', 'src/js/ui/TutorialGuidePlacement.js', 'src/js/ui/FieldHudReadability.js', 'src/js/ui/MonsterDamageNumbers.js', 'src/js/ui/MonsterHudLayout.js', 'src/js/ui/MonsterFootPlacement.js', 'src/js/ui/MonsterHudSafeViewport.js', 'src/js/ui/EnhancementExplanation.js', 'src/js/ui/AndroidDisplayController.js', 'src/css/style.css', 'src/js/world/scenes/CampScene.js', 'src/js/core/CampPreparation.js', 'src/js/core/AdventureSummary.js', 'src/js/ui/CampPresentation.js', 'src/js/world/scenes/LoginScene.js', 'src/css/camp.css', 'src/css/opening.css', 'src/css/startup-logo.css', 'src/js/core/AssetManifest.js', 'src/js/core/ClassProfiles.js', 'src/js/combat/ClassCombatController.js', 'src/js/combat/ClassCombatBridge.js', 'src/js/ui/ClassSkillUI.js', 'src/js/combat/ClassActionMotion.js', 'src/js/combat/AttackCadence.js', 'src/js/combat/ClassVisuals.js', 'src/js/combat/WitchPoison.js', 'src/js/combat/ArrowRain.js', 'src/js/combat/ShieldRush.js', 'src/js/combat/WarriorBarrage.js', 'src/js/combat/BarrageLock.js', 'src/js/entities/Actor.js', 'src/js/combat/SummonStats.js', 'src/js/combat/SummonAbilities.js', 'src/js/combat/SummonAbilityVisuals.js', 'src/js/effects/MonsterSkillVfxRenderer.js', 'src/js/combat/ClassEffectBounds.js', 'src/js/effects/PlayerSkillVfxRenderer.js', 'src/js/combat/SkillHealing.js', 'src/js/combat/MonsterStatusBadges.js', 'src/js/ui/ClassChargeGauge.js', 'src/css/combat-polish.css', 'src/js/combat/BasicAttackProgression.js', 'src/js/combat/ClassGeometry.js', 'src/js/core/ClassTutorial.js', 'src/js/core/TutorialManager.js', 'src/js/combat/ClassAnchors.js', 'src/js/combat/AuthoredCharacterFrames.js', 'src/js/combat/WizardAttackFrames.js', 'src/js/core/ClassWeapons.js', 'src/js/core/ClassWeaponRewardArchiveV3.js', 'src/js/core/DurableBossRewardPolicy.js', 'src/js/core/ItemDataManager.js', 'src/js/ui/friends/FriendsUIController.js']) {
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
