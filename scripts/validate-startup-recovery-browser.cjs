// All auth/network operations are local fixtures; no account or Firebase writes.
const { chromium } = require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const base=process.env.QA_URL||'http://127.0.0.1:8100';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const timeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>timeout(fn,ms===45000||ms===20000?30:ms,...args)});
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  await page.route('**/src/js/main.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('src/js/main.js','utf8').replace('window.game = new Game();','window.GameClass = Game;')}));
  await page.route('**/startup-fixture',r=>r.fulfill({contentType:'text/html',body:`<div id="game-container"><div id="loading-overlay"><div class="opening-footer"><p class="loading-text"></p></div></div></div><script type="module">
  import '/src/js/main.js';import LoginScene from '/src/js/world/scenes/LoginScene.js';
  window.g=Object.create(GameClass.prototype);Object.assign(g,{_authStateGeneration:0,_authStateTransition:Promise.resolve(),auth:{currentUser:{uid:'fixture'}},net:{playerId:'fixture',connect(){window.connections=(window.connections||0)+1;return new Promise(r=>window.connectResolve=r)}},sceneManager:{changeScene:async()=>{window.entered=true}}});
  window.login=new LoginScene({resources:{getVersionedResourceUrl:x=>x},auth:{loginGoogle(){window.loginCalls=(window.loginCalls||0)+1;return new Promise((resolve,reject)=>window.loginReject=reject)},loginAnonymously(){throw Error('must not duplicate')}}});
  </script>`}));
  await page.goto(base+'/startup-fixture');await page.waitForFunction(()=>!!window.g);
  await page.evaluate(()=>{void g._queueAuthStateTransition({uid:'fixture'})});
  await page.locator('[data-startup-retry]').waitFor();assert.equal(await page.evaluate(()=>connections),1);
  await page.evaluate(()=>connectResolve());await page.waitForFunction(()=>entered===true&&document.getElementById('loading-overlay').style.display==='none');
  assert.equal(await page.locator('[data-startup-retry]').count(),0);
  await page.evaluate(()=>g.updateLoading('world progress',40));await page.waitForTimeout(80);
  assert.equal(await page.locator('[data-startup-retry]').count(),0,'hidden loader must never reappear from world progress');
  await page.evaluate(()=>{g.net.connect=async()=>{throw Error('fixture offline')};g.net.playerId=null;void g._queueAuthStateTransition({uid:'fixture'})});
  await page.locator('[data-startup-retry]').waitFor();assert.match(await page.locator('.loading-text').innerText(),/접속/);
  await page.evaluate(()=>{g._clearLoadingRecovery();login.createUI();void login.handleGoogleLogin()});
  await page.locator('[data-login-reload]').waitFor();
  assert.equal(await page.locator('#google-login-btn').isDisabled(),true);
  assert.equal(await page.locator('#guest-login-btn').isDisabled(),true);
  await page.evaluate(()=>login.handleGuestLogin());assert.equal(await page.evaluate(()=>loginCalls),1);
  await page.evaluate(()=>loginReject({code:'auth/popup-closed-by-user'}));
  await page.waitForFunction(()=>!document.getElementById('google-login-btn').disabled);
  assert.equal(await page.locator('[data-login-reload]').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS startup recovery: stalled/rejected connect, late success cleanup, hidden loader stays hidden, stalled login reload, provider lock, cancellation retry. Simulated only.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
