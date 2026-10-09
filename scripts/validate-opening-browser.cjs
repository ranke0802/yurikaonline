require('./lib/qa-preflight.cjs');
// Browser-only auth fixtures: never connect Firebase or touch a real account.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.QA_URL || 'http://127.0.0.1:8100';
const out = process.env.QA_OUTPUT || '/tmp/yurika-opening-qa';
fs.mkdirSync(out, { recursive: true });
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
 try {
  for (const [name,width,height] of [['desktop',1280,720],['landscape',780,360],['portrait',390,844]]) {
   const page = await browser.newPage({viewport:{width,height}});
   const errors=[]; page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route => new URL(route.request().url()).origin===new URL(base).origin ? route.continue() : route.abort());
   await page.route('**/opening-fixture',route=>route.fulfill({contentType:'text/html',body:`<link rel="stylesheet" href="/src/css/style.css"><link rel="stylesheet" href="/src/css/opening.css"><div id="game-container"></div><script type="module">
    import LoginScene from '/src/js/world/scenes/LoginScene.js';
    import ResourceManager from '/src/js/core/ResourceManager.js';
    window.calls=[]; window.gameFixture={resources:new ResourceManager(),auth:{loginGoogle(){calls.push('google');return new Promise((resolve,reject)=>{window.authResolve=resolve;window.authReject=reject})},loginAnonymously(){calls.push('guest');return new Promise((resolve,reject)=>{window.authResolve=resolve;window.authReject=reject})}}};
    window.scene=new LoginScene(gameFixture);scene.createUI();
   </script>`}));
   await page.goto(base+'/opening-fixture');
   await page.locator('#google-login-btn').waitFor();
   await page.waitForFunction(()=>document.querySelector('.opening-art img').naturalWidth>0);
   await page.screenshot({path:`${out}/${name}-login.png`});
   for (const id of ['google-login-btn','guest-login-btn']) {
    const box=await page.locator('#'+id).boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height,`${name} ${id} fits viewport`);
   }
   await page.locator('#google-login-btn').click();
   await page.evaluate(()=>scene.handleGuestLogin());
   assert.deepEqual(await page.evaluate(()=>calls),['google'],'concurrent providers cannot start');
   assert.equal(await page.locator('#guest-login-btn').isDisabled(),true);
   await page.evaluate(()=>authReject({code:'auth/popup-closed-by-user'}));
   await page.waitForFunction(()=>!document.getElementById('google-login-btn').disabled);
   assert.match(await page.locator('.opening-status').innerText(),/취소/);
   await page.locator('#guest-login-btn').click();
   await page.evaluate(()=>authReject({code:'auth/network-request-failed'}));
   await page.waitForFunction(()=>!document.getElementById('guest-login-btn').disabled);
   assert.match(await page.locator('.opening-status').innerText(),/다시/);
   await page.locator('#guest-login-btn').click();
   await page.evaluate(async()=>{authResolve();await scene.exit()});
   assert.equal(await page.locator('#login-scene-ui').count(),0);
   assert.deepEqual(errors,[]);
   // Preserve the prototype for side-by-side visual review, without its demo data touching the game.
   await page.goto(base+'/party-rpg-concept/');
   await page.waitForFunction(()=>document.querySelector('.opening-visual img')?.naturalWidth>0);
   await page.screenshot({path:`${out}/${name}-prototype.png`});
   await page.close();
  }
  console.log('PASS: opening art, desktop/landscape/portrait bounds, isolated Google cancellation, guest failure/retry, duplicate provider lock, exit cleanup. Screenshots: '+out);
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
