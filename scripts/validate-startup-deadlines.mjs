import test from 'node:test';
import assert from 'node:assert/strict';
import ResourceManager from '../src/js/core/ResourceManager.js';
const browser = () => { globalThis.window = { location: new URL('https://game.test/'), GAME_VERSION:'test' }; };

test('stalled fetch is aborted, deduplicated, evicted and retryable without caching a late response', async t => {
 browser(); let signal, lateResolve, calls=0;
 t.mock.method(globalThis,'fetch',(_url,options)=>{calls++;signal=options.signal;return new Promise(resolve=>{lateResolve=resolve});});
 const r=new ResourceManager();r.requestTimeoutMs=15;
 const result=await Promise.allSettled([r.loadJSON('/assets/stall.json'),r.loadJSON('/assets/stall.json')]);
 assert.equal(calls,1); assert.ok(result.every(x=>x.status==='rejected'&&x.reason.code==='resource_timeout'));
 assert.equal(signal.aborted,true);assert.equal(r.loading.size,0);
 lateResolve(new Response('{"stale":true}'));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(r.cache.size,0);
 t.mock.method(globalThis,'fetch',async()=>new Response('{"fresh":true}'));
 assert.deepEqual(await r.loadJSON('/assets/stall.json'),{fresh:true});
});

test('deadline includes stalled response body and uncached private reads', async t=>{
 browser();let signal;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{signal=options.signal;return {ok:true,json:()=>new Promise(()=>{})};});
 const r=new ResourceManager();r.requestTimeoutMs=15;
 await assert.rejects(r.loadJSON('/account'),{code:'resource_timeout'});
 assert.equal(signal.aborted,true);assert.equal(r.cache.size,0);assert.equal(r.loading.size,0);
});

test('stalled image and decode are evicted; late decode cannot overwrite successful retry',async t=>{
 browser();const original=globalThis.Image;t.after(()=>{globalThis.Image=original});
 const images=[];let decodeResolve;
 globalThis.Image=class {constructor(){images.push(this)}set src(value){this.url=value}removeAttribute(){this.removed=true}decode(){return new Promise(resolve=>{decodeResolve=resolve})}};
 const r=new ResourceManager();r.requestTimeoutMs=15;
 await assert.rejects(r.loadImage('/assets/stall.webp'),{code:'resource_timeout'});
 assert.equal(images[0].removed,true);assert.equal(r.loading.size,0);
 const loading=r.loadImage('/assets/stall.webp');images[1].onload();
 await assert.rejects(loading,{code:'resource_timeout'});assert.equal(r.cache.size,0);
 const retry=r.loadImage('/assets/stall.webp');images[2].decode=async()=>{};images[2].onload();const fresh=await retry;
 decodeResolve();await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(await r.loadImage('/assets/stall.webp'),fresh);assert.equal(fresh,images[2]);assert.equal(r.loading.size,0);
});

// Recovery is advisory: a timed-out scene operation remains pending and is never reissued.
const { default: SceneManager } = await import('../src/js/core/SceneManager.js');
function deferred() { let resolve, reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}; }
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
function scenesFixture() {
 const notices=[];let clears=0;
 const manager=new SceneManager({showLoadingRecovery:message=>notices.push(message),_clearLoadingRecovery:()=>{clears++}});
 manager.transitionTimeoutMs=12;
 return {manager,notices,get clears(){return clears}};
}

test('stalled scene entry shows recovery without retrying; late completion clears once',async()=>{
 const fixture=scenesFixture(), gate=deferred();let enters=0, exits=0, settled=false;
 fixture.manager.currentScene={exit:async()=>{exits++}};
 fixture.manager.addScene('field',{enter:()=>{enters++;return gate.promise}});
 const transition=fixture.manager.changeScene('field',{fixture:true}).finally(()=>{settled=true});
 await delay(30);
 assert.equal(fixture.notices.length,1);assert.match(fixture.notices[0],/다시 불러/);
 assert.equal(enters,1);assert.equal(exits,1);assert.equal(settled,false);assert.equal(fixture.clears,0);
 gate.resolve();await transition;
 assert.equal(fixture.clears,1);assert.equal(enters,1);
 await delay(25);assert.equal(fixture.notices.length,1,'settled transition cannot raise another recovery');
});

test('stalled scene exit does not start the next scene until exit actually completes',async()=>{
 const fixture=scenesFixture(), gate=deferred();let enters=0, exits=0;
 fixture.manager.currentScene={exit:()=>{exits++;return gate.promise}};
 fixture.manager.addScene('camp',{enter:async()=>{enters++}});
 const transition=fixture.manager.changeScene('camp');await delay(30);
 assert.equal(fixture.notices.length,1);assert.equal(enters,0);assert.equal(exits,1);
 gate.resolve();await transition;
 assert.equal(enters,1);assert.equal(exits,1);assert.equal(fixture.clears,1);
});

test('an older transition settling cannot clear the newest transition recovery',async()=>{
 const fixture=scenesFixture(), old=deferred(), current=deferred();
 fixture.manager.addScene('old',{enter:()=>old.promise,exit:async()=>{}});
 fixture.manager.addScene('current',{enter:()=>current.promise});
 const first=fixture.manager.changeScene('old');
 const second=fixture.manager.changeScene('current');await delay(30);
 assert.equal(fixture.notices.length,1,'only newest generation can display a recovery');
 old.resolve();await first;assert.equal(fixture.clears,0);
 current.resolve();await second;assert.equal(fixture.clears,1);
});

test('scene rejection clears its watchdog and preserves the rejection for the caller',async()=>{
 const fixture=scenesFixture();
 fixture.manager.addScene('bad',{enter:async()=>{throw Error('fixture enter failed')}});
 await assert.rejects(fixture.manager.changeScene('bad'),/fixture enter failed/);
 await delay(25);assert.equal(fixture.notices.length,0);assert.equal(fixture.clears,1);
});
