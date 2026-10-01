// Actual browser Firebase SDK + actual exit UI/scenes; RTDB wire is loopback only.
const {chromium}=require('playwright');
const {createRequire}=require('node:module');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const fixture=process.env.YURIKA_FIREBASE_FIXTURE_ROOT||'/tmp/yurika-sdk-fixture';
const {Server}=createRequire(path.resolve(fixture,'package.json'))('ws');
const records=new Map();let writes=0,failWrite=false,ackDelay=0,holdAcknowledgements=false;const heldAcks=[];
const report={coverage:'Actual Firebase 10.7.1 browser SDK, Player.saveState, exit UI and CampScene; loopback protocol fixture, no live accounts',cases:[],errors:[]};
(async()=>{const server=new Server({host:'127.0.0.1',port:0});await new Promise(r=>server.on('listening',r));const port=server.address().port;
server.on('connection',socket=>{const subscriptions=new Set();const send=data=>{if(socket.readyState===1)socket.send(JSON.stringify(data))};send({t:'c',d:{t:'h',d:{ts:Date.now(),v:'5',h:`127.0.0.1:${port}`,s:'browser-camp'}}});socket.on('message',raw=>{const message=JSON.parse(raw);if(message.t!=='d')return;const{r,a,b}=message.d;const profileWrite=a==='p'&&b.p.endsWith('/profile');
 if(a==='q'){subscriptions.add(b.p);send({t:'d',d:{a:'d',b:{p:b.p,d:records.get(b.p)||null}}});}if(a==='n')subscriptions.delete(b.p);
 if(profileWrite&&failWrite){send({t:'d',d:{r,b:{s:'permission_denied',d:'fixture rejection'}}});return}
 if(a==='p'){records.set(b.p,b.d);if(profileWrite)writes++;if(subscriptions.has(b.p))send({t:'d',d:{a:'d',b:{p:b.p,d:b.d}}});}
 const ack=()=>send({t:'d',d:{r,b:{s:'ok',d:{}}}});if(profileWrite&&holdAcknowledgements)heldAcks.push(ack);else if(profileWrite&&ackDelay)setTimeout(ack,ackDelay);else ack();
})});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const id of ['wizard','witch','warrior','archer'])for(const cache of ['cold','warm']){
 records.clear();writes=0;failWrite=false;ackDelay=0;holdAcknowledgements=!process.env.QA_BASELINE_PLAYER;
 const context=await browser.newContext({viewport:{width:780,height:360},hasTouch:true,isMobile:true,serviceWorkers:'block'});const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.error(m.text())});
 await page.route('**/*',r=>{const url=new URL(r.request().url());if(url.hostname!=='127.0.0.1')return r.abort();if(process.env.QA_BASELINE_PLAYER&&url.pathname.endsWith('/Player.js'))return r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.QA_BASELINE_PLAYER)});return r.continue()});
 await page.goto('http://127.0.0.1:8100/?local=1');await page.locator('#camp-name').fill('온라인 복귀');await page.locator('[data-camp=create]').click();await page.locator('[data-camp=character]').first().waitFor();
 await page.evaluate(async id=>{const {createClassProfile}=await import('/src/js/core/ClassProfiles.js');const n=game.net,p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,activeClassId:id,level:19,exp:2411,maxExp:147789,classProfiles:Object.fromEntries(['witch','warrior','archer'].map(c=>[c,{...createClassProfile(c),level:5,exp:13,maxExp:1000}])),questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}})},id);
 await page.reload();await page.locator('[data-camp=character]').first().waitFor();await page.locator('[data-camp=prepare]').click();await page.locator('[data-camp=depart]').click();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
 const account=await page.evaluate(()=>game.net.getPlayerProfile(game.net.playerId));account._profileRevision=41;account.unknownPreserved={value:1};records.set('/users/local-player/profile',account);
 await page.addScriptTag({path:path.join(fixture,'node_modules/firebase/firebase-app-compat.js')});await page.addScriptTag({path:path.join(fixture,'node_modules/firebase/firebase-database-compat.js')});
 await page.evaluate(async({port,cache})=>{
  const {default:NetworkManager}=await import('/src/js/core/NetworkManager.js');
  const app=firebase.initializeApp({projectId:'demo-yurika-browser',databaseURL:'https://demo-yurika-browser.firebaseio.com'});const db=app.database();db.useEmulator('127.0.0.1',port);window.qaDb=db;
  const net=new NetworkManager();clearInterval(net._batchTimer);net.playerId='local-player';net.dbRef=db.ref('fixture-world');net.connected=true;net.zoneParticipationEnabled=false;
  game.net=net;game.sceneManager.currentScene.net=net;game.localPlayer.net=net;game.isLocalMode=false;
  const existing=await net.getPlayerProfile(net.playerId,{throwOnError:true});
  // A normal returning account already has its prior complete Mage/account checkpoint.
  net._storeLocalProfileCheckpoint(net.playerId,existing,{pending:false,revision:existing._profileRevision});
  if(cache==='warm'){window.qaListener=()=>{};db.ref('users/local-player/profile').on('value',qaListener);await db.ref('users/local-player/profile').once('value');}
  const showMessage=game.ui.showCenterMessage;game.ui.showCenterMessage=function(text,...args){window.qaExitMessage=text;return showMessage.call(this,text,...args)};
  window.qaSave=game.localPlayer.saveState.bind(game.localPlayer);window.qaSaveCalls=0;window.qaSaveResult=null;
  game.localPlayer.exp+=7;window.qaExpectedExp=game.localPlayer.exp;
  game.localPlayer.saveState=async(...args)=>{qaSaveCalls++;const start=performance.now();const result=await qaSave(...args);window.qaSaveMs=performance.now()-start;qaSaveResult={ok:result.ok,reason:result.reason,localCheckpointPersisted:result.localCheckpointPersisted===true};return result};
  window.qaStart=performance.now();const button=document.querySelector('.camp-return');button.click();button.click();button.click();
 },{port,cache});
 await page.waitForTimeout(150);if(!process.env.QA_BASELINE_PLAYER)assert.equal(await page.evaluate(()=>game.ui.isWorldSceneActive()),true,'must wait for server acknowledgement');holdAcknowledgements=false;heldAcks.splice(0).forEach(ack=>ack());
 await page.waitForFunction(()=>!game.ui.gameExitSceneTransitioning);
 const state=await page.evaluate(()=>({message:window.qaExitMessage,scene:game.sceneManager.currentScene.constructor.name,classId:game.localPlayer.activeClassId,exp:game.localPlayer.exp,expected:qaExpectedExp,calls:qaSaveCalls,result:qaSaveResult,saveMs:qaSaveMs,totalMs:performance.now()-qaStart,failed:game.sceneManager.currentScene.failed,journal:game.net.getLocalProfilePatchJournal('local-player')}));
 report.cases.push({id,cache,...state,writes});console.log(JSON.stringify(report.cases.at(-1)));
 if(process.env.QA_BASELINE_PLAYER){if(id!=='wizard'&&cache==='cold'){assert.equal(state.scene,'WorldScene');assert.equal(state.result.reason,'profile_conflict');assert.equal(state.result.localCheckpointPersisted,false);assert.equal(state.message,'저장하지 못했어요. 공간을 확인하고 다시 시도해 주세요. 다른 탭에서 플레이했다면 이 페이지를 새로고침해 주세요.');}if(id!=='wizard'&&cache==='warm')assert.notEqual(state.exp,state.expected);await page.evaluate(()=>qaDb.goOffline());await context.close();continue;}
 assert.equal(state.result.ok,true);assert.equal(state.classId,id);assert.equal(state.exp,state.expected);assert.equal(state.failed,false);assert.equal(state.calls,1);assert.equal(writes,1);assert.equal(state.journal,null);assert.deepEqual(records.get('/users/local-player/profile').unknownPreserved,{value:1});
 // Reentry goes through the same real snapshot read and class preparation.
 await page.locator('[data-camp=prepare]').click();await page.locator('[data-camp=depart]').click();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>game.localPlayer.exp),state.expected);
 failWrite=true;ackDelay=0;
 await page.locator('.camp-return').click();await page.waitForFunction(()=>!game.ui.gameExitSceneTransitioning);
 assert.equal(await page.evaluate(()=>game.ui.isWorldSceneActive()),true);assert.equal(await page.locator('.camp-return').isEnabled(),true);assert.ok(await page.evaluate(()=>game.net.getLocalProfilePatchJournal('local-player')));
 failWrite=false;
 await page.locator('.camp-return').click();await page.waitForFunction(()=>document.querySelector('#camp-scene')&&!game.sceneManager.currentScene.busy&&!game.ui.gameExitSceneTransitioning);
 assert.equal(await page.evaluate(()=>game.localPlayer.activeClassId),id);assert.equal(await page.evaluate(()=>game.localPlayer.exp),state.expected);
 report.cases.at(-1).failureRetryReentry=true;
 await page.evaluate(()=>qaDb.goOffline());await context.close();
}assert.deepEqual(report.errors,[])}finally{fs.writeFileSync(process.env.QA_OUTPUT||'/tmp/camp-sdk-browser.json',JSON.stringify(report,null,2));await browser.close();for(const c of server.clients)c.terminate();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
