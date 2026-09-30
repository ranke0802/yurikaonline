const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--autoplay-policy=user-gesture-required']});
 const report={phases:[],errors:[],external:[],failed:[]};
 try {
  const context=await browser.newContext({viewport:{width:780,height:360},isMobile:true,hasTouch:true});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.failed.push(r.url())});
  await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();report.external.push(r.request().url());return r.abort()});
  await page.goto(process.env.QA_URL||'http://127.0.0.1:8100/?local=1');await page.locator('[data-camp=create]').waitFor();
  assert.equal(await page.evaluate(()=>game.sound.pendingBgmId),'bgm_intro');
  await page.locator('#camp-name').fill('소리 모험');await page.locator('[data-camp=create]').tap();await page.locator('[data-camp=character]').waitFor();
  async function waitBgm(id){await page.waitForFunction(id=>game.sound.ctx?.state==='running'&&game.sound.currentBgmId===id,id)}
  async function energy(bus='masterGain'){
   return page.evaluate(async bus=>{const s=game.sound,a=s.ctx.createAnalyser();a.fftSize=2048;s[bus].connect(a);let peak=0,total=0,count=0;const samples=new Float32Array(a.fftSize);for(let n=0;n<15;n++){await new Promise(r=>setTimeout(r,70));a.getFloatTimeDomainData(samples);for(const x of samples){peak=Math.max(peak,Math.abs(x));total+=x*x;count++;}}s[bus].disconnect(a);return {peak,rms:Math.sqrt(total/count),state:s.ctx.state,bgm:s.currentBgmId,muted:s.isMuted,volume:s.masterVolume}},bus);
  }
  await waitBgm('bgm_intro');report.phases.push({name:'camp',...await energy()});assert.ok(report.phases.at(-1).rms>0.00001,'camp PCM must be nonzero');
  await page.evaluate(async()=>game.net.savePlayerData(game.net.playerId,{questData:{basicTrainingCompleted:true,prologueCompleted:true}}));
  const cdp=await context.newCDPSession(page);
  for(let run=0;run<2;run++){
   await page.locator('[data-camp=character]').tap();await page.locator('[data-camp=depart]').tap();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});await waitBgm('bgm_cabin');
   report.phases.push({name:`field-${run}`, ...await energy()});assert.ok(report.phases.at(-1).rms>0.00001,'field PCM must be nonzero');
   // Reproduce a mobile interruption after the first unlock, then use an actual
   // touch control whose handler stops event propagation.
   await page.evaluate(()=>game.sound.ctx.suspend());const button=await page.locator('#action-attack-j').boundingBox();
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:button.x+button.width/2,y:button.y+button.height/2,id:0}]});
   await page.waitForFunction(()=>game.sound.ctx.state==='running');const sfx=await energy('sfxGain');
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   report.phases.push({name:`touch-sfx-after-suspend-${run}`,...sfx});assert.ok(sfx.rms>0.00001,'real attack SFX PCM must be nonzero after resume');
   await page.locator('.camp-return').tap();await page.locator('[data-camp=character]').waitFor();await waitBgm('bgm_intro');
  }
  await page.evaluate(async()=>{game.ui.updateSetting('masterVolume',17);game.ui.updateSetting('muted',true);await game.sound.ctx.suspend()});
  await page.locator('[data-camp=character]').tap();await waitBgm('bgm_intro');await page.waitForTimeout(300);
  const muted=await energy();report.phases.push({name:'saved-mute-after-resume',...muted});assert.equal(muted.muted,true);assert.equal(muted.volume,.17);assert.equal(muted.peak,0);
  await page.reload();await page.locator('[data-camp=character]').waitFor();await page.locator('[data-camp=character]').tap();await waitBgm('bgm_intro');assert.deepEqual(await page.evaluate(()=>({muted:game.sound.isMuted,volume:game.sound.masterVolume})),{muted:true,volume:.17});
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);assert.deepEqual(report.failed,[]);
  console.log(JSON.stringify(report,null,2));
 } finally {if(process.env.AUDIO_REPORT)fs.writeFileSync(process.env.AUDIO_REPORT,JSON.stringify(report,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
