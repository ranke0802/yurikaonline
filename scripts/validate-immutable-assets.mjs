import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import manifest from '../src/js/core/AssetManifest.js';
import ResourceManager from '../src/js/core/ResourceManager.js';
const hash=b=>createHash('sha256').update(b).digest('hex').slice(0,24);
test('every shipped image/content hash matches its public source and immutable bytes',()=>{
 for(const [source,target] of Object.entries(manifest)){
  const bytes=readFileSync('.'+source);assert.ok(existsSync('.'+target),target);
  assert.equal(hash(bytes),target.split('/').pop().split('.')[0]);assert.deepEqual(readFileSync('.'+target),bytes);
 }
 for(const source of ['/party-rpg-concept/assets/camp-master-v2.webp','/party-rpg-concept/assets/mage-key.webp','/party-rpg-concept/assets/idle-mage.webp'])assert.ok(manifest[source]);
});
test('image identity survives build changes; aliases share one image and decode',async t=>{
 globalThis.window={GAME_VERSION:'first',location:new URL('https://game.test/')};
 const old=globalThis.Image;let downloads=0,decodes=0;globalThis.Image=class{set src(v){downloads++;queueMicrotask(()=>this.onload())}async decode(){decodes++}};t.after(()=>globalThis.Image=old);
 const r=new ResourceManager(), source='/party-rpg-concept/assets/idle-mage.webp';
 const a=await Promise.all([r.loadImage(source),r.loadImage(source.slice(1)),r.loadImage(manifest[source])]);
 window.GAME_VERSION='second';assert.equal(await r.loadImage(source),a[0]);assert.equal(downloads,1);assert.equal(decodes,1);
 assert.equal(r.getVersionedResourceUrl(source+'?v=old'),r.getVersionedResourceUrl(source));
 const changed=Buffer.concat([readFileSync('.'+source),Buffer.from('changed')]);assert.notEqual(hash(changed),manifest[source].split('/').pop().split('.')[0]);
});
test('account/API documents never enter the resource cache',async t=>{
 globalThis.window={location:new URL('https://game.test/')};let calls=0;t.mock.method(globalThis,'fetch',async(u,o)=>{assert.equal(o.cache,'no-store');calls++;return new Response('{}')});const r=new ResourceManager();await r.loadJSON('/api/profile.json');await r.loadJSON('/api/profile.json');assert.equal(calls,2);assert.equal(r.cache.size,0);
});
test('hosting excludes developer/source assets, keeps immutable cache and hosting-only CI',()=>{
 const cfg=JSON.parse(readFileSync('firebase.json'));for(const p of ['docs/**','plans/**','reports/**','scripts/**','database*.json','party-rpg-concept/**','**/*.png'])assert.ok(cfg.hosting.ignore.includes(p));assert.ok(cfg.hosting.headers.some(h=>h.source==='/assets/immutable/**'&&h.headers.some(v=>v.value.includes('immutable'))));
 const workflow=readFileSync('.github/workflows/firebase-hosting-merge.yml','utf8');assert.ok(workflow.includes('npm run validate:assets'));assert.ok(workflow.includes('FirebaseExtended/action-hosting-deploy@v0'));assert.ok(!workflow.includes('firebase deploy'));
});
