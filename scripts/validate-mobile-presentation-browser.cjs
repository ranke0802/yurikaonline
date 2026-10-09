// Local controlled profiles + real pointer/keyboard input. No Firebase requests.
const {chromium,devices}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:8100',out=process.env.QA_OUTPUT||'/tmp/yurika-mobile-presentation';fs.mkdirSync(out,{recursive:true});
const report={scope:'Chromium CSS viewport/touch emulation, DPR1; controlled local profile, no physical device or live online claim',cases:[],errors:[],external:[]};
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const [name,width,height,mobile]of[['small-portrait',360,640,true],['small-landscape',640,360,true],['portrait',393,852,true],['landscape',852,393,true],['pc',1280,800,false]]){
if(process.env.QA_VIEWPORT&&name!==process.env.QA_VIEWPORT)continue;
const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,userAgent:mobile?devices['Pixel 7'].userAgent:undefined,serviceWorkers:'block',reducedMotion:'reduce'});
await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():(report.external.push(new URL(r.request().url()).origin),r.abort()));
const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push({name,error:e.message}));
const rec={name,viewport:{width,height},dpr:1,targets:[],checks:[]};report.cases.push(rec);
const click=sel=>mobile?page.locator(sel).first().tap():page.locator(sel).first().click();
async function target(sel,{scroll=true}={}){const loc=page.locator(sel).first();if(scroll)await loc.scrollIntoViewIfNeeded();await page.waitForFunction(e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))},await loc.elementHandle());const data=await loc.evaluate(e=>{const b=e.getBoundingClientRect(),pts=[[b.left+2,b.top+b.height/2],[b.right-2,b.top+b.height/2],[b.left+b.width/2,b.top+2],[b.left+b.width/2,b.bottom-2],[b.left+b.width/2,b.top+b.height/2]];return{selector:e.id||e.getAttribute('aria-label')||e.textContent.trim(),x:b.x,y:b.y,w:b.width,h:b.height,inside:b.left>=0&&b.top>=0&&b.right<=innerWidth+.1&&b.bottom<=innerHeight+.1,hit:pts.map(([x,y])=>e.contains(document.elementFromPoint(x,y)))}});rec.targets.push(data);assert.ok(data.w>=43.9&&data.h>=43.9,`${name} ${sel}: target ${data.w}×${data.h}`);assert.ok(data.inside&&data.hit.every(Boolean),`${name} ${sel}: clipped/covered ${JSON.stringify(data)}`);return data;}
async function shot(label){await page.screenshot({path:`${out}/${name}-${label}.png`});}
await page.goto(base+'/?local=1');await page.locator('#camp-name').fill('화면 검증');await click('[data-camp=create]');await page.locator('[data-camp=prepare]').waitFor();
await page.evaluate(async()=>{const n=game.net,p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,level:6,statPoints:5,manastone:2000,questData:{...p.questData,prologueCompleted:true,basicTrainingCompleted:true}})});
await page.reload();await page.locator('[data-camp=prepare]').waitFor();rec.version=await page.evaluate(()=>GAME_VERSION);
await target('[data-camp=prepare]');await click('[data-camp=character]');await target('[data-camp=depart]');await shot('character');
for(const id of ['wizard','witch','warrior','archer'])await target(`[data-camp="select-class:${id}"]`);
await click('[data-camp=stats]');await target('#status-close-btn-top');await target('#status-close-btn-bottom');
for(const s of ['vitality','intelligence','wisdom','agility']){await target(`.stat-up-btn[data-stat=${s}]`);await target(`.stat-down-btn[data-stat=${s}]`);}
const before=await page.evaluate(()=>({int:game.localPlayer.intelligence,points:game.localPlayer.statPoints}));
await target('.stat-up-btn[data-stat=intelligence]');await click('.stat-up-btn[data-stat=intelligence]');await click('#status-close-btn-bottom');
await target('#confirm-no');await target('#confirm-yes');await shot('confirm');await click('#confirm-no');assert.equal(await page.evaluate(()=>game.localPlayer.intelligence),before.int);
await click('.stat-down-btn[data-stat=intelligence]');assert.equal(await page.evaluate(()=>game.ui.getPendingStatTotal()),0);
await click('#status-close-btn-bottom');rec.checks.push('stat preview/cancel does not commit; all +/- edges reachable by scrolling');
await click('[data-camp=skills]');for(const sel of ['#skill-close-btn-top','.skill-up-btn[data-skill=laser]','#skill-popup .close-btn-bottom'])await target(sel);
assert.ok(!(await page.locator('#skill-popup').innerText()).includes('∞'));await shot('skills');await click('#skill-popup .close-btn-bottom');
await click('[data-camp=inventory]');for(const sel of ['#inventory-category-tabs button:first-child','#inventory-category-tabs button:last-child','#inventory-close-btn-top','#inventory-close-btn-bottom'])await target(sel);
await shot('bag');await click('#inventory-close-btn-bottom');await click('[data-camp=depart]');await target('[data-camp=depart]');await shot('prepare');
await page.evaluate(()=>{const original=game.zone.loadZone.bind(game.zone);game.zone.loadZone=async(...args)=>{window.uxWorldWaiting=true;await new Promise(r=>window.uxWorldRelease=r);game.zone.loadZone=original;return original(...args)}});
await click('[data-camp=depart]');await page.waitForFunction(()=>window.uxWorldWaiting===true);
assert.equal(await page.locator('#ui-layer').isVisible(),false,'loading must not display placeholder HP');await page.evaluate(()=>uxWorldRelease());
await page.waitForFunction(()=>game.sceneManager.currentScene?.constructor.name==='WorldScene'&&!game.sceneManager.currentScene._campEntryIncomplete);rec.checks.push('delayed world asset gate: HUD hidden until real stats ready');
await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(500);await page.evaluate(()=>{game.loop.stop();game.ui.applyActiveUiLayout()});
for(const sel of ['#btn-inventory','#btn-skill','#btn-status','#btn-friends','#btn-settings'])await target(sel,{scroll:false});
const questDiag=()=>page.evaluate(()=>[...document.querySelectorAll('.quest-list-panel,.quest-list-panel *')].map(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return {cls:e.className,w:r.width,h:r.height,font:c.fontSize,lh:c.lineHeight,pad:c.padding,transition:c.transition,transform:c.transform}}));
const hud=()=>page.evaluate(()=>Object.fromEntries(['.top-bar','.quest-list-panel','.chat-window','.minimap-menu'].map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return[s,{x:r.x,y:r.y,w:r.width,h:r.height,transform:getComputedStyle(e).transform}]})));
rec.defaultHud=await hud();rec.questBefore=await questDiag();await shot('field');
await click('#btn-settings');await target('#settings-popup .close-popup.pc-only');await shot('settings');
await target('#settings-master-volume');await target('#settings-basic-attack-sound');await target('.settings-switch:has(#settings-muted)');
await page.evaluate(()=>{window.uxUiActions=[];game.input.on('keydown',a=>uxUiActions.push(a))});
await page.locator('#settings-master-volume').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowLeft');await page.keyboard.press('Tab');
assert.deepEqual(await page.evaluate(()=>uxUiActions),[]);rec.checks.push('settings keyboard/touch stays in UI, no combat actions');
await page.evaluate(()=>game.ui.androidDisplay?.showNotice('전체화면을 사용할 수 없어요. 설정에서 다시 시도할 수 있어요.'));
assert.equal(await page.locator('#android-display-notice').count(),mobile?1:0);
if(mobile)assert.equal(await page.locator('#settings-display-help #android-display-notice').count(),1);
await click('#settings-popup .close-popup.pc-only');
assert.equal(await page.locator('#android-display-notice').isVisible(),false);rec.checks.push('fullscreen notice contained in Settings');
await click('#btn-friends');await target('#friends-close-btn-top');await target('#friend-open-search-btn');await shot('friends');await click('#friend-open-search-btn');for(const sel of ['#friend-search-close-btn','#friend-search-query-input','#friend-search-query-btn','#friend-search-add-btn'])await target(sel);await shot('friend-search');await click('#friend-search-close-btn');await page.keyboard.press('Escape');
assert.equal(await page.locator('#friends-popup').isVisible(),false);
// README denial is a narrow presentation failure, independent of saving.
await page.evaluate(()=>{window.uxOriginalLoadText=game.resources.loadText;window.uxHistoryCalls=0;game.resources.loadText=async()=>{uxHistoryCalls++;throw Error('isolated history denial')};window.uxHistory=game.updateHistory;game.updateHistory=[]});
await click('#btn-settings');await click('#settings-open-history');await page.locator('.history-unavailable').waitFor();await target('.history-unavailable button');await shot('history-error');
await click('.history-unavailable button');await page.waitForFunction(()=>uxHistoryCalls===2);assert.match(await page.locator('.history-unavailable').innerText(),/저장에는 영향/);
await page.evaluate(()=>{game.resources.loadText=async()=> '# 화면 검증\n이력 재시도 성공'});await click('.history-unavailable button');await page.locator('.readme-content').waitFor();
await page.evaluate(()=>{game.resources.loadText=uxOriginalLoadText;game.updateHistory=uxHistory});await page.keyboard.press('Escape');assert.equal(await page.locator('#history-modal').isVisible(),false);await page.keyboard.press('Escape');rec.checks.push('README denial fallback/retry/success uses existing fetch path');
// Rotation can remeasure defaults, but must never accumulate scale or write profile layout.
for(let i=0;i<3;i++){await page.setViewportSize({width:height,height:width});await page.waitForTimeout(120);await page.setViewportSize({width,height});await page.waitForTimeout(120);await page.evaluate(()=>game.ui.applyActiveUiLayout())}
rec.rotatedHud=await hud();rec.questAfter=await questDiag();for(const key of Object.keys(rec.defaultHud))for(const dim of ['w','h'])assert.ok(Math.abs(rec.defaultHud[key][dim]-rec.rotatedHud[key][dim])<1.1,`${name} ${key} rotation ${dim}`);
assert.equal(await page.evaluate(()=>game.localPlayer.uiLayout),null);rec.checks.push('3 rotations: default geometry stable and no layout persistence');
// Saving the new default in the layout editor must not shrink it to legacy size.
await click('#btn-settings');await click('#settings-open-ui-layout');
assert.equal(await page.evaluate(()=>document.body.classList.contains('ui-default-menu')),true);
await click('#ui-layout-save');await page.evaluate(()=>game.ui.uiLayoutSyncPromise);
assert.equal(await page.evaluate(()=>document.body.classList.contains('ui-default-menu')),true);
rec.editorHud=await hud();assert.ok(Math.abs(rec.editorHud['.minimap-menu'].w-rec.defaultHud['.minimap-menu'].w)<1.1);
rec.checks.push('saving new default layout retains touch geometry');
// A valid, deliberately custom legacy layout remains identical through rotations and reload.
rec.customLayout=await page.evaluate(async()=>{const ui=game.ui,layout={version:1,updatedAt:123456,joystickMode:'dynamic',layouts:{mobilePortrait:{'quick-menu-panel':{left:.08,top:.6,scale:.9},'hud-top-bar':{left:.03,top:.08,scale:.8},'quest-panel':{left:.03,top:.22,scale:.72},'chat-panel':{left:.03,top:.46,scale:.9}},mobileLandscape:{'quick-menu-panel':{left:.6,top:.35,scale:.8},'hud-top-bar':{left:.04,top:.08,scale:.9},'quest-panel':{left:.04,top:.3,scale:.8},'chat-panel':{left:.3,top:.65,scale:.9}},desktop:{'quick-menu-panel':{left:.5,top:.2,scale:1.1},'hud-top-bar':{left:.03,top:.11,scale:.95},'quest-panel':{left:.03,top:.27,scale:1.1},'chat-panel':{left:.03,top:.6,scale:.9}}}};game.localPlayer.uiLayout=layout;await game.localPlayer.saveProfilePatch(['uiLayout'],{forceImmediate:true});await game.net.flushProfileWrites();ui.persistUiLayoutToStorage(layout);ui.applyActiveUiLayout();return ui.serializeUiLayoutComparable(layout)});
rec.customHud=await hud();assert.equal(await page.evaluate(()=>document.body.classList.contains('ui-default-menu')),false);
for(let i=0;i<3;i++){await page.setViewportSize({width:height,height:width});await page.waitForTimeout(120);await page.setViewportSize({width,height});await page.waitForTimeout(120)}
await page.reload();await page.locator('[data-camp=prepare]').waitFor();await click('[data-camp=prepare]');await click('[data-camp=depart]');await page.waitForFunction(()=>game.sceneManager.currentScene?.constructor.name==='WorldScene'&&!game.sceneManager.currentScene._campEntryIncomplete);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(500);await page.evaluate(()=>{game.loop.stop();game.ui.applyActiveUiLayout()});
assert.equal(await page.evaluate(()=>game.ui.serializeUiLayoutComparable(game.localPlayer.uiLayout)),rec.customLayout);rec.customReloadHud=await hud();
for(const key of ['.minimap-menu','.top-bar'])for(const dim of ['x','y','w','h'])assert.ok(Math.abs(rec.customHud[key][dim]-rec.customReloadHud[key][dim])<1.1,`${name} saved ${key} ${dim}`);
rec.checks.push('custom geometry + stored profile retained across 3 rotations/reload');
// Real opening markup/styles; only auth transport is replaced to fail safely.
await page.evaluate(async()=>{
    if(document.fullscreenElement)await document.exitFullscreen();
    game.ui.hideHUD();game.ui.hideAllPopups();document.querySelector('.camp-return')?.remove();
    const {default:Login}=await import('/src/js/world/scenes/LoginScene.js');
    window.uxLoginCalls=[];
    const auth={loginGoogle(){uxLoginCalls.push('google');return new Promise((resolve,reject)=>window.uxAuthReject=reject)},loginAnonymously(){uxLoginCalls.push('guest');return new Promise((resolve,reject)=>window.uxAuthReject=reject)}};
    window.uxLogin=new Login({resources:game.resources,ui:game.ui,auth});uxLogin.createUI();
});
for(const sel of ['#google-login-btn','#guest-login-btn','#login-scene-ui .platform-guide-button'])await target(sel);
await shot('login');await click('#login-scene-ui .platform-guide-button');await target('#generic-modal-yes');await shot('installation');await click('#generic-modal-yes');
await click('#google-login-btn');await page.evaluate(()=>uxLogin.handleGuestLogin());assert.deepEqual(await page.evaluate(()=>uxLoginCalls),['google']);
await page.evaluate(()=>uxAuthReject({code:'auth/popup-closed-by-user'}));await page.waitForFunction(()=>!document.getElementById('google-login-btn').disabled);
assert.match(await page.locator('.opening-status').innerText(),/취소/);
await click('#guest-login-btn');await page.evaluate(()=>uxAuthReject({code:'auth/network-request-failed'}));await page.waitForFunction(()=>!document.getElementById('guest-login-btn').disabled);
assert.equal(await page.locator('.opening-status').getAttribute('data-state'),'error');await shot('login-error');
await page.evaluate(()=>{uxLogin.exit();Object.defineProperty(navigator,'standalone',{configurable:true,value:true});uxLogin.createUI()});
assert.equal(await page.locator('#login-scene-ui .platform-guide-button').count(),0);rec.checks.push('auth cancel/network failure/retry + duplicate provider guard; installed fixture hides guide');
await context.close();console.log(`PASS ${name}: targets, dialogs, default/custom rotation, local save preservation`);
fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
}
assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
}finally{fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
