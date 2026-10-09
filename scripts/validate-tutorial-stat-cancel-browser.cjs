require('./lib/qa-preflight.cjs');
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const out=process.env.QA_OUTPUT||'/tmp/tutorial-stat-cancel';fs.mkdirSync(out,{recursive:true});
const report={scope:'Local Chromium synthetic fresh profiles; desktop uses genuine D/J movement/combat; touch layouts fixture only prior movement/combat; actual status/INT/close/cancel/keyboard clicks',cases:[],errors:[]};
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
for(const [name,width,height,mobile] of [['desktop',1280,800,false],['portrait',390,844,true],['landscape',852,393,true]]){
 const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:8100/?local=1');await page.locator('#camp-name').fill('취소 회귀');await page.locator('[data-camp=create]').click();await page.locator('[data-camp=prepare]').click();await page.locator('[data-camp=depart]').click();await page.locator('#loading-overlay').waitFor({state:'hidden'});await page.waitForFunction(()=>game.tutorial.getCurrentStep()?.id==='move_check');
 if(!mobile){
  await page.keyboard.down('d');try{await page.waitForFunction(()=>game.tutorial.getCurrentStep()?.id==='attack_dummy');}finally{await page.keyboard.up('d');}
  await page.keyboard.down('j');try{await page.waitForFunction(()=>game.tutorial.getCurrentStep()?.id==='open_status');}finally{await page.keyboard.up('j');}
 }else{await page.evaluate(()=>{const t=game.tutorial;t.currentStepIndex=t.activeTutorial.steps.findIndex(s=>s.id==='open_status');t._showCurrentStep();});}
 await page.locator('#btn-status').click();await page.waitForFunction(()=>game.tutorial.getCurrentStep()?.id==='preview_status_change');
 const read=()=>page.evaluate(async()=>({int:game.localPlayer.intelligence,points:game.localPlayer.statPoints,pending:game.ui.pendingStats.intelligence,step:game.tutorial.getCurrentStep().id,index:game.tutorial.currentStepIndex,savedInt:(await game.net.getPlayerProfile(game.net.playerId)).intelligence}));
 const before=await read();await page.locator('.stat-up-btn[data-stat="intelligence"]').click();await page.waitForFunction(()=>game.tutorial.getCurrentStep()?.id==='save_status');
 const preview=await read();assert.equal(preview.int,before.int);assert.equal(preview.pending,1);
 const close=page.locator('#status-close-btn-bottom');await close.click();await page.locator('#confirm-modal:not(.hidden)').waitFor();await page.screenshot({path:`${out}/${name}-confirm.png`});
 await page.locator('#confirm-no').click();
 if(process.env.QA_EXPECT_BLOCKED==='1'){assert.equal(await page.locator('#confirm-modal').evaluate(e=>!e.classList.contains('hidden')),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#confirm-modal').evaluate(e=>!e.classList.contains('hidden')),true);report.cases.push({name,reproducedBlockedCancelAndEscape:true});await context.close();continue;}
 await page.locator('#confirm-modal').waitFor({state:'hidden'});assert.deepEqual(await read(),preview);assert.equal(await page.locator('#status-popup').isVisible(),true);
 await close.click();await page.locator('#confirm-modal:not(.hidden)').waitFor();await page.keyboard.press('Escape');await page.locator('#confirm-modal').waitFor({state:'hidden'});assert.deepEqual(await read(),preview);
 await close.click();await page.locator('#confirm-modal:not(.hidden)').waitFor();await page.locator('#confirm-no').focus();await page.keyboard.press('Enter');await page.locator('#confirm-modal').waitFor({state:'hidden'});assert.deepEqual(await read(),preview);
 await page.screenshot({path:`${out}/${name}-cancelled.png`});
 // Reopening the prompt still has the valid preview. Only explicit confirmation commits and advances.
 await close.click();await page.locator('#confirm-yes').click();await page.waitForFunction(()=>game.tutorial.getCurrentStep()?.id==='open_skill');const committed=await read();assert.equal(committed.int,before.int+1);assert.equal(committed.pending,0);assert.equal(committed.points,before.points-1);
 report.cases.push({name,before,preview,committed,cancel:true,escape:true,keyboardCancel:true,reentry:true});await context.close();
}
assert.deepEqual(report.errors,[]);
}finally{fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
