const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:8100';
assert.ok(['127.0.0.1','localhost','yurika-online.web.app'].includes(new URL(base).hostname));
const out=process.env.QA_OUTPUT||'/tmp/yurika-render-diagnostics-v169';fs.mkdirSync(out,{recursive:true});
const version=fs.readFileSync('version.txt','utf8').trim();
const report={version,origin:base,device:'desktop Chromium mobile viewport; not S23 hardware',cases:[],pageErrors:[],external:[]};
const save=()=>fs.writeFileSync(`${out}/results.json`,JSON.stringify(report,null,2));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {for(const [name,width,height]of[['portrait',390,844],['landscape',844,390]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,serviceWorkers:'block',acceptDownloads:true});
  const page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>report.pageErrors.push(e.message));
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===new URL(base).origin)return route.continue();report.external.push(route.request().url());return route.abort();});
  await page.goto(base+'/?local=1');assert.equal(await page.evaluate(()=>BOOTSTRAP_VERSION),version);
  await page.locator('#camp-name').fill('PRIVATE_DIAGNOSTIC_NAME');await page.locator('[data-camp=create]').click();
  await page.locator('[data-camp=character]').first().waitFor();
  await page.evaluate(async()=>{const n=game.net,p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,activeClassId:'witch',level:19,questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}});});
  await page.reload();await page.locator('[data-camp=prepare]').click();await page.locator('[data-camp=depart]').click();
  await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
  await page.evaluate(()=>{game.localPlayer.hp=game.localPlayer.maxHp=1e7;window.qaOriginalRender=game.loop.renderFn;});
  const button=id=>page.locator(`#render-diagnostic-${id}`);
  const open=async()=>{await page.locator('#btn-settings').click();await button('start').scrollIntoViewIfNeeded();};
  const close=async()=>page.locator('#settings-popup .close-popup:visible').first().click();
  const add=(test,evidence={})=>{report.cases.push({orientation:name,test,...evidence});save();console.log(JSON.stringify({orientation:name,test,status:'passed'}));};
  assert.deepEqual(await page.evaluate(()=>({active:game.renderDiagnostics.active,frames:game.renderDiagnostics.frames.length,export:game.renderDiagnostics.exportJSON()})),{active:false,frames:0,export:null});
  await open();await page.screenshot({path:`${out}/${name}-idle.png`});
  // User actions themselves must not persist diagnostics or change profile/settings.
  await page.evaluate(()=>{game.loop.stop();window.qaStorage=JSON.stringify({...localStorage});});
  await page.evaluate(()=>{document.getElementById('render-diagnostic-start').click();document.getElementById('render-diagnostic-stop').click();});
  assert.match(await page.locator('#render-diagnostic-status').innerText(),/기록된 프레임이 없습니다/);
  assert.equal(await button('copy').isDisabled(),true);add('immediate-stop-empty-record');
  await button('start').click();await page.evaluate(()=>game.loop.renderFn());await button('stop').click();
  assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})===qaStorage),true);
  assert.equal(await page.evaluate(()=>game.loop.renderFn===qaOriginalRender),true);
  assert.equal(await button('copy').isEnabled(),true);add('explicit-start-stop-no-storage');
  await button('clear').click();assert.equal(await page.evaluate(()=>game.renderDiagnostics.exportJSON()),null);
  // Real elapsed time and natural game updates, including closed settings/combat.
  await page.evaluate(()=>{
   const b=game.localPlayer.classCombat,original=b.basic;window.qaAcceptedAttacks=0;
   b.basic=function(...args){const result=original.apply(this,args);if(result)qaAcceptedAttacks++;return result;};
   game.loop.start();
  });await button('start').click();await close();
  await page.locator('#action-attack-j').tap();await page.waitForFunction(()=>qaAcceptedAttacks>0);
  await page.waitForFunction(()=>game.renderDiagnostics.count>=15);
  assert.equal(await page.evaluate(()=>game.renderDiagnostics.active),true);
  assert.equal(await page.evaluate(()=>game.ui.isPaused),false);
  await open();assert.match(await page.locator('#render-diagnostic-status').innerText(),/기록 중/);await close();
  await page.waitForFunction(()=>!game.renderDiagnostics.active,{},{timeout:25000});
  const snapshot=await page.evaluate(()=>({json:game.renderDiagnostics.exportJSON(),sameHook:game.loop.renderFn===qaOriginalRender}));
  const data=JSON.parse(snapshot.json);assert.equal(data.stopReason,'timeout');assert.ok(data.durationMs>=19990&&data.durationMs<=20000);assert.ok(data.frameCount>100);assert.equal(snapshot.sameHook,true);
  assert.equal(data.build,version);assert.equal(data.context.actual.alpha,false);assert.equal(data.context.actual.desynchronized,true);
  assert.ok(data.frames.every(f=>f.complete&&f.expected.every((n,i)=>n===f.started[i]&&n===f.completed[i])));
  assert.deepEqual(data.errors,[]);assert.doesNotMatch(snapshot.json,/PRIVATE_DIAGNOSTIC_NAME|playerId|account|token|chat|inventory|"x":|"y":|https?:|userAgent/);
  fs.writeFileSync(`${out}/${name}-sample.json`,snapshot.json);
  add('close-combat-reenter-auto-stop',{frames:data.frameCount,bytes:Buffer.byteLength(snapshot.json),durationMs:data.durationMs,context:data.context,acceptedAttacks:await page.evaluate(()=>qaAcceptedAttacks)});
  await open();await page.screenshot({path:`${out}/${name}-stopped.png`});
  // Success path without granting any external permission in the test profile.
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.qaCopied=text;}}}));
  await button('copy').click();await page.waitForFunction(()=>!!window.qaCopied);
  assert.equal(await page.evaluate(()=>qaCopied),snapshot.json);add('copy-success');
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('denied');}}}));
  await button('copy').click();await page.locator('#render-diagnostic-fallback').waitFor({state:'visible'});
  assert.equal(await page.locator('#render-diagnostic-fallback').inputValue(),snapshot.json);add('copy-denied-manual-fallback');
  const downloadEvent=page.waitForEvent('download');await button('download').click();const download=await downloadEvent;
  assert.equal(download.suggestedFilename(),'yurika-render-diagnostic.json');await download.saveAs(`${out}/${name}-download.json`);
  assert.equal(fs.readFileSync(`${out}/${name}-download.json`,'utf8'),snapshot.json);add('json-download');
  await button('clear').click();assert.equal(await page.locator('#render-diagnostic-fallback').inputValue(),'');assert.equal(await button('copy').isDisabled(),true);
  assert.equal(await page.evaluate(()=>game.renderDiagnostics.exportJSON()),null);add('clear-memory-and-fallback');
  // A pending denied clipboard operation cannot restore cleared diagnostic text.
  await button('start').click();await page.waitForFunction(()=>game.renderDiagnostics.count>2);await button('stop').click();
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise((_,reject)=>window.qaRejectCopy=reject)}}));
  await button('copy').click();await button('clear').click();await page.evaluate(()=>qaRejectCopy(new Error('denied')));
  assert.equal(await page.locator('#render-diagnostic-fallback').inputValue(),'');assert.equal(await page.locator('#render-diagnostic-fallback').isHidden(),true);add('clear-during-pending-copy');
  await button('start').click();await button('clear').click();assert.equal(await page.evaluate(()=>game.renderDiagnostics.active),false);assert.equal(await page.evaluate(()=>game.loop.renderFn===qaOriginalRender),true);add('clear-during-recording');
  const overhead=await page.evaluate(()=>{
   game.loop.stop();game.ui.hideAllPopups();const d=game.renderDiagnostics,render=()=>game.loop.renderFn();
   for(let i=0;i<20;i++)render();
   const measure=active=>{d.clear();if(active)d.start();const t=performance.now();for(let i=0;i<120;i++)render();const ms=performance.now()-t;d.stop();return ms/120;};
   const samples=[];for(let i=0;i<3;i++)samples.push({inactiveMs:measure(false),activeMs:measure(true)});
   return {samples,label:'desktop synchronous render timing; not phone latency or display refresh'};
  });
  add('bounded-recorder-cost-sample',overhead);
  await page.reload();await page.locator('[data-camp=character]').first().waitFor();
  assert.equal(await page.evaluate(()=>game.renderDiagnostics.exportJSON()),null);assert.equal(await page.evaluate(()=>game.renderDiagnostics.active),false);add('reload-no-history');
  await context.close();
 }
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.external,[]);
 }finally{save();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
