import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { UIManager } from '../src/js/ui/UIManager.js';
import KeyboardHandler from '../src/js/core/input/KeyboardHandler.js';
import InputManager from '../src/js/core/InputManager.js';
import TouchHandler from '../src/js/core/input/TouchHandler.js';
import MonsterManager from '../src/js/world/MonsterManager.js';
import NetworkManager from '../src/js/core/NetworkManager.js';
import GameLoop from '../src/js/core/GameLoop.js';

function storage() {
    const values = new Map();
    return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
}
function uiFixture() {
    const ui = Object.create(UIManager.prototype);
    Object.assign(ui, { game: { auth: { currentUser: { uid: 'A' } }, localPlayer: { id: 'A', saveProfilePatch: async () => ({ ok: true }) } },
        uiLayoutStorageKey: 'yurika_ui_layout_v1', uiLayoutControlDefinitions: { joystick: { modes: ['mobilePortrait'] } },
        uiLayoutResetModes: new Set(), applyActiveUiLayout() {}, syncUiLayoutEditor() {}, logSystemMessage() {} });
    return ui;
}
const layout = (left, updatedAt = 1) => ({ version: 1, updatedAt, layouts: { mobilePortrait: { joystick: { left, top: .6, scale: 1 } } } });

test('UI-02 slider previews once per frame and persists only final value', () => {
    const ui = uiFixture(); let saves = 0; let previews = 0; let frame;
    ui.settings = { cameraViewRange: 100 }; ui.persistSettings = () => saves++;
    ui.game.previewCameraViewRange = () => previews++;
    globalThis.requestAnimationFrame = f => { frame = f; return 1; };
    globalThis.cancelAnimationFrame = () => {};
    const listeners = {}; const input = { value: '100', addEventListener: (n,f) => listeners[n]=f };
    globalThis.document = { getElementById: () => null };
    ui.bindCameraViewRange(input);
    for (let i=101;i<=130;i++) { input.value=String(i); listeners.input(); }
    assert.equal(saves,0); frame(); assert.equal(previews,1);
    listeners.change(); assert.equal(saves,1); listeners.change(); assert.equal(saves,1);
});
test('SEC-02 local developer flag never grants authority without a server', () => {
    const ui = uiFixture(); ui.devAccessGranted = true; ui.isDeveloperAccessLocked = () => false;
    assert.equal(ui.hasDeveloperAccess(),false);
    assert.equal(ui.tryUnlockDeveloperAccess('anything').ok,false);
});
test('SEC-02 direct administrative database reset fails closed', async () => {
    globalThis.window = { firebase: true }; let writes = 0;
    globalThis.firebase = { database: () => ({ref: () => ({remove: async () => writes++})}) };
    await assert.rejects(NetworkManager.prototype.resetAllUserData.call({}), /server/i);
    assert.equal(writes,0);
});
test('UI-03 normalized layout uses game container and its offset', () => {
    globalThis.window = { innerWidth: 1400, innerHeight: 900, devicePixelRatio: 1 };
    globalThis.document = { getElementById: () => ({ clientWidth: 800, clientHeight: 600,
        getBoundingClientRect: () => ({left:100,top:50,width:800,height:600}) }) };
    const ui = uiFixture();
    assert.deepEqual(ui.computeUiLayoutPosition({left:.5,top:.5},100,100),{left:500,top:350});
});
test('INPUT-02 touch cleanup removes DOM/window handlers and cancels aim', () => {
    let count = 0;
    const target = () => ({ addEventListener() {count++;}, removeEventListener() {count--;},
        style: { setProperty() {} }, getAttribute: () => 'u' });
    globalThis.window = target(); window.matchMedia = () => ({ matches: true });
    const elements = new Map(); const button = target();
    globalThis.document = { ...target(), getElementById: id => {
        if (!elements.has(id)) elements.set(id,target()); return elements.get(id);
    }, querySelectorAll: () => [button] };
    const touch = new TouchHandler(); let cancelled = 0;
    touch.on('aimCancel', () => cancelled++); touch.activeAimAction = { action:'SKILL_2',pointerId:1 };
    touch.cleanup(); assert.equal(count,0); assert.equal(cancelled,1);
});

test('UI-04 A/B/A storage isolation and unauthenticated writes', () => {
    globalThis.localStorage = storage();
    const ui = uiFixture();
    ui.persistUiLayoutToStorage(layout(.2, 9999999999999));
    ui.game.auth.currentUser = { uid: 'B' };
    ui.game.localPlayer = { id: 'B', saveProfilePatch: () => assert.fail('must not upload A layout') };
    ui.loadPlayerUiLayout(layout(.7));
    assert.equal(ui.game.localPlayer.uiLayout.layouts.mobilePortrait.joystick.left, .7);
    ui.game.auth.currentUser = { uid: 'A' };
    assert.equal(ui.loadStoredUiLayout().layouts.mobilePortrait.joystick.left, .2);
    ui.game.auth.currentUser = null;
    assert.equal(ui.persistUiLayoutToStorage(layout(.9)), false);
});
test('UI-06 a future device clock cannot overwrite a server layout', () => {
    globalThis.localStorage=storage(); globalThis.document={getElementById:()=>null};
    const ui=uiFixture(); ui.persistUiLayoutToStorage(layout(.2,9999999999999));
    ui.game.localPlayer.saveProfilePatch=()=>assert.fail('no implicit overwrite');
    ui.loadPlayerUiLayout(layout(.7,1));
    assert.equal(ui.game.localPlayer.uiLayout.layouts.mobilePortrait.joystick.left,.7);
});
test('UI-07 settings reset changes draft only', () => {
    const ui=uiFixture(); const original=layout(.4); ui.game.localPlayer.uiLayout=original;
    ui.enterUiLayoutEditMode=()=>{ui.uiLayoutDraft=structuredClone(original);ui.uiLayoutEditMode=true;};
    ui.resetUiLayoutDraftForCurrentMode=()=>{ui.uiLayoutDraft.layouts.mobilePortrait={};};
    ui.resetStoredUiLayoutForCurrentMode();
    assert.equal(ui.game.localPlayer.uiLayout,original); assert.ok(ui.uiLayoutEditMode);
});
test('UI-09 unsupported orientation lock rolls back setting', async () => {
    globalThis.screen={}; globalThis.document={getElementById:()=>null};
    const ui=uiFixture(); ui.settings={orientationLock:true}; ui.getSetting=k=>ui.settings[k];
    ui.persistSettings=()=>{};
    assert.equal(await ui.syncOrientationLock(),false);
    assert.equal(ui.settings.orientationLock,false);
});
test('PERF-01 hitstop respects the configured render budget', () => {
    globalThis.window={}; globalThis.requestAnimationFrame=()=>1;
    let renders=0; const loop=new GameLoop(()=>{},()=>renders++);
    loop.running=true; loop.hitstopTimer=500; loop.minRenderIntervalMs=1000/30;
    for(let time=10;time<=100;time+=10) loop._loop(time);
    assert.ok(renders<=3,`rendered ${renders} times in 100ms`);
});
test('UI-10 a burst of viewport events schedules one resize', () => {
    const source=readFileSync('src/js/main.js','utf8');
    const a=source.indexOf('    _scheduleViewportResize('); const b=source.indexOf('\n    isTouchDevice()',a);
    let frame; let count=0;
    const context=vm.createContext({window:{setTimeout:()=>1,clearTimeout(){}},requestAnimationFrame:f=>{frame=f;return 1;}});
    const obj=vm.runInContext('({'+source.slice(a,b).trim()+'})',context);
    obj.resize=()=>count++; obj._viewportResizeTimers=[];
    obj._scheduleViewportResize(); obj._scheduleViewportResize(); obj._scheduleViewportResize();
    assert.equal(count,0); frame(); assert.equal(count,1);
});
test('UI-08 large coarse-pointer tablet resolves touch landscape', () => {
    globalThis.window={innerWidth:1366,innerHeight:1024,matchMedia:q=>({matches:q.includes('coarse')||q.includes('landscape')})};
    const ui=uiFixture();
    assert.equal(ui.getUiLayoutMode(),'mobileLandscape');
});

for (const shiftFirst of [true, false]) test(`INPUT-01 Shift+S release shiftFirst=${shiftFirst}`, () => {
    globalThis.window = new EventTarget(); globalThis.document = new EventTarget();
    const keyboard = new KeyboardHandler(); const input = new InputManager(); input.addHandler(keyboard);
    const key = (code, shiftKey) => ({ code, key: code === 'KeyS' ? 's' : 'Shift', shiftKey, preventDefault() {} });
    keyboard._onKeyDown(key('ShiftLeft', true)); keyboard._onKeyDown(key('KeyS', true));
    const first = shiftFirst ? 'ShiftLeft' : 'KeyS'; const second = shiftFirst ? 'KeyS' : 'ShiftLeft';
    keyboard._onKeyUp(key(first, !shiftFirst)); keyboard._onKeyUp(key(second, false));
    assert.equal(input.actions.size, 0); input.cleanup();
});
test('INPUT-01 repeat, blur and visibility release', () => {
    globalThis.window = new EventTarget(); globalThis.document = new EventTarget();
    const keyboard = new KeyboardHandler(); const input = new InputManager(); input.addHandler(keyboard);
    keyboard._onKeyDown({ code: 'KeyS', key: 's', preventDefault() {} });
    window.dispatchEvent(new Event('blur')); assert.equal(input.actions.size, 0);
    keyboard._onKeyDown({ code: 'KeyS', key: 's', preventDefault() {} });
    document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(input.actions.size, 0); input.cleanup();
});
test('UI-05 failed remote save is observable and retry succeeds', async () => {
    globalThis.localStorage = storage(); globalThis.document = { getElementById: () => null };
    const ui = uiFixture(); ui.uiLayoutDraft = layout(.3);
    ui.game.localPlayer.saveProfilePatch = async () => ({ ok: false, reason: 'offline' });
    await ui.persistUiLayoutDraft(); await ui.uiLayoutSyncPromise;
    assert.equal(ui.uiLayoutSyncState, 'sync-failed');
    ui.game.localPlayer.saveProfilePatch = async () => ({ ok: true });
    await ui.retryUiLayoutSync(); assert.equal(ui.uiLayoutSyncState, 'synced');
});
test('UI-01 fixed joystick survives runtime apply; legacy defaults dynamic', () => {
    const ui = uiFixture(); delete ui.applyActiveUiLayout;
    Object.assign(ui, { getUiLayoutMode: () => 'mobilePortrait', clearUiLayoutRuntimeStyles() {},
        getUiLayoutPresetForMode: () => null, syncUiLayoutSelectionState() {}, applyUiLayoutControl() {} });
    ui.game.localPlayer.uiLayout = layout(.3);
    ui.game.localPlayer.uiLayout.joystickMode = 'fixed';
    let applied; ui.game.touch = { setFixedJoystickLayout: x => { applied = x; } };
    ui.applyActiveUiLayout(); assert.equal(applied?.left, .3);
    delete ui.game.localPlayer.uiLayout.joystickMode;
    ui.applyActiveUiLayout(); assert.equal(applied, null);
});
test('PWA-01 service worker offline version is unavailable; unrelated cache survives', async () => {
    const handlers = {}; const deleted = [];
    const ctx = vm.createContext({ URL, Request, Response, Map, Set, Date, Promise,
        self: { location: { origin: 'https://test.invalid' }, addEventListener: (n,f) => handlers[n]=f, skipWaiting() {}, clients: { claim() {} } },
        fetch: async () => { throw Error('offline'); },
        caches: { keys: async () => ['other-app', 'yurika-online-shell-old'], delete: async k => deleted.push(k), open: async () => ({ keys: async () => [] }) } });
    vm.runInContext(readFileSync('sw.js','utf8'),ctx);
    let response; handlers.fetch({ request: new Request('https://test.invalid/version.txt'), respondWith: p => response=p });
    assert.equal((await response).status,503);
    let activation; handlers.activate({ waitUntil: p => activation=p }); await activation;
    assert.deepEqual(deleted,['yurika-online-shell-old']);
});
for (const [status, body] of [[500,'1.2.3'],[200,'error'],[200,''],[200,'<html>offline</html>'],[200,'0.02.115']]) {
    test(`PWA-01 client handles ${status}/${body}`, async () => {
        const html = readFileSync('index.html','utf8');
        const start = html.indexOf('async function verifyYurikaRuntimeVersion(');
        const end = html.indexOf("if ('serviceWorker' in navigator)", start);
        let refreshes = 0;
        let updates = 0;
        const ctx = vm.createContext({ Date, Promise, console: { warn() {} },
            window: {}, document: { readyState: 'complete' }, localStorage: storage(), sessionStorage: storage(),
            yurikaVersionCheckInFlight: null, yurikaLastVersionCheckAt: 0,
            getLoadedGameVersion: () => '0.02.114', applyYurikaVersionUi() {},
            normalizeGameVersion: x => typeof x === 'string' ? x.trim() : '', formatGameVersion: x => x,
            waitForPageLoad: async () => {}, fetch: async () => new Response(body,{status}),
            navigator: {serviceWorker:{getRegistration:async()=>({update:async()=>updates++})}},
            forceYurikaClientRefresh: async () => { refreshes++; return true; },
            YURIKA_CACHE_RESET_ATTEMPT_KEY: 'attempt', YURIKA_CACHE_RESET_TARGET_KEY: 'target', YURIKA_CACHE_RESET_REASON_KEY: 'reason' });
        vm.runInContext(html.slice(start,end),ctx);
        await vm.runInContext('verifyYurikaRuntimeVersion({force:true})',ctx);
        assert.equal(refreshes,0);
        assert.equal(ctx.window.SERVER_VERSION,body==='0.02.115'?body:'unknown');
        assert.equal(updates,body==='0.02.115'?1:0);
    });
}
function monsterFixture(safe = false) {
    const m = Object.create(MonsterManager.prototype);
    Object.assign(m, { worldGeneration: 1, activeZoneId: 'zone_1', zone: { width: 1000, height: 1000, currentZone: { id: 'zone_1' } },
        net: { isHost: true, _getCurrentFieldId: () => 'field', shouldUseMonsterQuietMode: () => true },
        game: { sceneManager: { currentScene: { isPointInSafeZone: () => safe } }, monsterData: { loadDefinition: async () => ({}) } },
        monsters: new Map(), _isHostFieldStateBlocked: () => false, _hasConfiguredBossRewards: () => false,
        _nextMonsterRevision: () => 1, _getCellIdFromPosition: () => 'cell',
        _onRemoteMonsterAdded: async d => m.monsters.set(d.id,d) }); return m;
}
test('WORLD-02 exhausted safe-zone search never publishes monster', async () => {
    const m = monsterFixture(true); assert.equal(await m._spawnMonster(), null); assert.equal(m.monsters.size,0);
});
test('WORLD-01 concurrent spawns with identical time/random remain unique', async () => {
    const m = monsterFixture(); const oldNow = Date.now; const oldRandom = Math.random;
    try { Date.now = () => 12345; Math.random = () => .5;
        const ids = await Promise.all(Array.from({ length: 100 }, () => m._spawnMonster()));
        assert.equal(new Set(ids).size,100);
    } finally { Date.now = oldNow; Math.random = oldRandom; }
});
