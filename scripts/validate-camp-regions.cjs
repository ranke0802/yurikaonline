const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const OUT=process.env.QA_OUTPUT||'/tmp/yurika-integration-qa';
const BASE=process.env.QA_BASE||'http://127.0.0.1:8100';
fs.mkdirSync(OUT,{recursive:true});
const report={coverage:'Desktop Chromium local fixtures; original WorldScene rules. No live account authentication or physical device coverage.',cases:[],errors:[],external:[]};
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
 for(const fixture of [{name:'saved-unlocked-zone2',level:5,saved:'zone_2',expected:'zone_2',label:'안개빛 호수',position:{x:1440,y:1450}},{name:'saved-locked-zone5',level:1,saved:'zone_5',expected:'zone_1',label:'바람 언덕',position:{x:900,y:920}}]){
  const context=await browser.newContext({viewport:{width:1560,height:720}}),page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/*',r=>{if(['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname))return r.continue();report.external.push(r.request().url());return r.abort()});
  await page.goto(BASE+'/?local=1');await page.locator('#camp-name').fill('지역 검증');await page.locator('[data-camp=create]').click();await page.locator('[data-camp=character]').first().waitFor();
  await page.evaluate(async f=>{const n=game.net,p=await n.getPlayerProfile(n.playerId);const result=await n.savePlayerData(n.playerId,{...p,level:f.level,currentZoneId:f.saved,mapId:f.saved,x:f.position.x,y:f.position.y,mapPositions:{[f.saved]:f.position},questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}});if(!result.ok)throw Error(result.reason)},fixture);
  await page.reload();await page.locator('[data-camp=prepare]').click();await page.waitForFunction(()=>document.querySelector('#camp-scene')?.dataset.view==='prepare');
  const preparation=await page.locator('#camp-scene').innerText();assert.ok(preparation.includes(fixture.label),'preparation shows rule-resolved region '+fixture.label);await page.screenshot({path:`${OUT}/${fixture.name}-prepare.png`});
  await page.locator('[data-camp=depart]').click();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
  const world=await page.evaluate(()=>({zone:game.zone.currentZone.id,x:game.localPlayer.x,y:game.localPlayer.y,spawn:game.zone.getSpawnPoint('default')}));assert.equal(world.zone,fixture.expected);
  assert.deepEqual({x:world.x,y:world.y},fixture.saved===fixture.expected?fixture.position:{x:world.spawn.x,y:world.spawn.y},'restores same-region coordinates; locked-region coordinates cannot leak to fallback');
  await page.screenshot({path:`${OUT}/${fixture.name}-world.png`});await page.locator('.camp-return').click();await page.locator('[data-camp=character]').first().waitFor();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('yurika.local.profile.v1')).profile);assert.equal(saved.currentZoneId,fixture.expected);
  report.cases.push({fixture,world,savedZone:saved.currentZoneId,result:'passed'});await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
}finally{fs.writeFileSync(`${OUT}/camp-region-report.json`,JSON.stringify(report,null,2));await browser.close()}
console.log(JSON.stringify(report,null,2));})().catch(e=>{console.error(e);process.exitCode=1});
