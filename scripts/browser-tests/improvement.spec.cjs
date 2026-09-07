const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

test('application bootstrap reaches login without a production database write', async ({ page }) => {
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*', route => {
        const url=new URL(route.request().url());
        if (url.hostname.endsWith('firebaseio.com') || url.hostname.endsWith('firebasedatabase.app')) return route.abort();
        return route.continue();
    });
    await page.goto('/index.html');
    await expect.poll(()=>page.evaluate(()=>window.game?.sceneManager?.currentScene?.constructor?.name),{timeout:30000}).toBe('LoginScene');
    const cameraCounts = await page.evaluate(async()=>{
        const game=window.game; let resize=0; let backing=0; let saves=0;
        const originalResize=game.resize; game.resize=function(...args){resize++;return originalResize.apply(this,args);};
        for (const key of ['width','height']) {
            const descriptor=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,key);
            Object.defineProperty(game.canvas,key,{configurable:true,get(){return descriptor.get.call(this);},set(v){backing++;descriptor.set.call(this,v);}});
        }
        const originalPersist=game.ui.persistSettings;
        game.ui.persistSettings=function(){saves++;return originalPersist.call(this);};
        const input=document.getElementById('settings-camera-view-range');
        for(let value=101;value<=130;value++){input.value=String(value);input.dispatchEvent(new Event('input'));}
        await new Promise(requestAnimationFrame);
        input.dispatchEvent(new Event('change'));
        game.resize=originalResize; game.ui.persistSettings=originalPersist;
        for(const key of ['width','height']) delete game.canvas[key];
        return {resize,backing,saves};
    });
    expect(cameraCounts).toEqual({resize:0,backing:0,saves:1});
    await page.screenshot({path:'reports/browser-login-1280x720.png'});
    expect(errors).toEqual([]);
});

test('real DOM: scoped layout, fixed joystick rotation, reload, offline sync', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    // Retain the shipped DOM/CSS while disabling production bootstrap/network.
    const html = fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1') return route.abort();
        if (url.pathname === '/index.html') return route.fulfill({contentType:'text/html',body:html});
        return route.continue();
    });
    await page.setViewportSize({width:390,height:844});
    await page.goto('/index.html');
    const setup = async () => page.evaluate(async () => {
        const { UIManager } = await import('/src/js/ui/UIManager.js');
        const ui = Object.create(UIManager.prototype);
        window.auditUi = ui;
        Object.assign(ui, {
            game: { auth: { currentUser: {uid:'audit-A'} }, localPlayer: {id:'audit-A',saveProfilePatch:async()=>({ok:true})}, touch:{setFixedJoystickLayout:x=>window.auditFixed=x} },
            uiLayoutStorageKey:'yurika_ui_layout_v1', uiLayoutResetModes:new Set(),
            uiLayoutControlDefinitions:{joystick:{modes:['mobilePortrait','mobileLandscape'],minScale:.7,maxScale:1.8}},
            uiLayoutPresetDefaults:{}, uiLayoutDefaultCache:{},
            getUiLayoutMode:()=>innerWidth<innerHeight?'mobilePortrait':'mobileLandscape',
            syncUiLayoutSelectionState(){}, syncUiLayoutEditor(){},logSystemMessage(){}
        });
        document.querySelector('#loading-overlay')?.remove();
        document.querySelector('#popup-overlay')?.remove();
        document.querySelector('#ui-layer')?.classList.remove('hidden');
    });
    await setup();
    await page.evaluate(() => {
        const node=document.getElementById('joystick-container');
        node.style.setProperty('display','grid');
        auditUi.clearUiLayoutRuntimeStyles();
        if (node.style.display !== 'grid') throw new Error('UI-11 removed a style it did not own');
        node.style.removeProperty('display');
    });
    await page.evaluate(async () => {
        const ui=window.auditUi;
        ui.uiLayoutDraft={version:1,joystickMode:'fixed',layouts:{mobilePortrait:{joystick:{left:.2,top:.6,scale:1}},mobileLandscape:{joystick:{left:.1,top:.5,scale:1}}}};
        ui.persistUiLayoutDraft(); await ui.uiLayoutSyncPromise; ui.applyActiveUiLayout();
    });
    await expect.poll(()=>page.evaluate(()=>window.auditFixed?.left)).toBe(.2);
    const before=await page.locator('#joystick-container').boundingBox();
    await page.setViewportSize({width:844,height:390});
    await page.evaluate(()=>auditUi.applyActiveUiLayout());
    await expect.poll(()=>page.evaluate(()=>window.auditFixed?.left)).toBe(.1);
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>auditUi.applyActiveUiLayout());
    expect(await page.locator('#joystick-container').boundingBox()).toEqual(before);
    await page.reload(); await setup();
    await page.evaluate(()=>auditUi.loadPlayerUiLayout(null));
    await expect.poll(()=>page.evaluate(()=>window.auditFixed?.left)).toBe(.2);
    await page.evaluate(async()=>{
        auditUi.game.auth.currentUser={uid:'audit-B'}; auditUi.game.localPlayer={id:'audit-B',saveProfilePatch:async()=>({ok:true})};
        auditUi.applyActiveUiLayout=()=>{}; auditUi.loadPlayerUiLayout(null);
    });
    expect(await page.evaluate(()=>auditUi.game.localPlayer.uiLayout)).toBeNull();
    await page.context().setOffline(true);
    await page.evaluate(async()=>{
        auditUi.game.localPlayer.saveProfilePatch=async()=>{await fetch('/offline-save');return {ok:true};};
        await auditUi.retryUiLayoutSync();
    });
    expect(await page.evaluate(()=>auditUi.uiLayoutSyncState)).toBe('sync-failed');
    await page.context().setOffline(false);
    await page.evaluate(async()=>{auditUi.game.localPlayer.saveProfilePatch=async()=>({ok:true}); await auditUi.retryUiLayoutSync();});
    expect(await page.evaluate(()=>auditUi.uiLayoutSyncState)).toBe('synced');
    await page.screenshot({path:'reports/browser-layout-390x844.png'});
    expect(errors).toEqual([]);
});
