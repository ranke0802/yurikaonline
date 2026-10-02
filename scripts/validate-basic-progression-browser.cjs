const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const out=process.env.QA_OUTPUT||'/tmp/basic-progression-browser';fs.mkdirSync(out,{recursive:true});
const report={cases:[],errors:[],scope:'Local synthetic accounts; real upgrade buttons, save/reload, camp/field transitions, existing raster effects.'};
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const [id,skill] of [['witch','lifeDrain'],['warrior','cleave'],['archer','shot']]){
 const context=await browser.newContext({viewport:{width:852,height:393},hasTouch:true,isMobile:true,serviceWorkers:'block'}),page=await context.newPage();
 page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:8100/?local=1');await page.locator('#camp-name').fill('기본 공격 성장');await page.locator('[data-camp=create]').tap();await page.locator('[data-camp=character]').first().waitFor();
 await page.evaluate(async id=>{const n=game.net,p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,activeClassId:id,level:9,exp:73,skillLevels:{laser:3,missile:2,fireball:4,shield:1},manastone:100000,questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}})},id);
 await page.reload();await page.locator('[data-camp=character]').first().waitFor();
 for(const level of [1,4,8]){
  await page.locator('[data-camp=character]').first().tap();await page.locator('[data-camp=skills]').tap();
  const btn=page.locator(`.skill-up-btn[data-skill="${skill}"]`);
  while(await page.evaluate(skill=>game.localPlayer.skillLevels[skill],skill)<level){assert.equal(await btn.isDisabled(),false);await btn.tap();}
  assert.equal(await btn.isDisabled(),level===8);
  if(level===8)assert.equal((await btn.innerText()).trim(),'MAX');
  await page.screenshot({path:`${out}/${id}-level-${level}-skills.png`});
  const cost=300*(Math.pow(2,level-1)-1);
  assert.equal(await page.evaluate(()=>game.localPlayer.manastone),100000-cost,'actual currency deduction');
  await page.evaluate(async()=>{game.ui.hideAllPopups();const result=await game.sceneManager.currentScene.preparation.flush();if(!result.ok)throw Error('camp save failed')});
  await page.reload();await page.locator('[data-camp=character]').first().waitFor();
  assert.equal(await page.evaluate(async({id,skill})=>((await game.net.getPlayerProfile(game.net.playerId)).classProfiles?.[id]?.skillLevels?.[skill] ?? 1),{id,skill}),level,'persisted UI upgrade after reload');
  await page.locator('[data-camp=prepare]').tap();await page.locator('[data-camp=depart]').tap();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
  await page.waitForFunction(()=>game.localPlayer.classCombat?.images.actions?.width>0);
  const result=await page.evaluate(async({id,skill,level})=>{
   const {basicAttackProfile,basicChargeSeconds}=await import('/src/js/combat/BasicAttackProgression.js');
   const p=game.localPlayer,b=p.classCombat,c=b.controller;game.loop.stop();game.monsterManager.monsters.clear();
   const center={x:p.x+p.width/2,y:p.y+p.height/2},g=basicAttackProfile(id,p.skillLevels);
   const enemy={id:'growth-fixture',x:center.x+40,y:center.y,radius:10,hp:100000,maxHp:100000};
   const hits=[],actions=[];c.hooks.enemies=()=>[enemy];c.hooks.damage=(e,n)=>{hits.push(n);e.hp-=n;return n;};c.hooks.move=()=>false;
   const original=c.hooks.action;c.hooks.action=(kind,data)=>{actions.push(data);original(kind,data)};
   const draws=[];
   const capture=label=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=400;const ctx=canvas.getContext('2d');ctx.fillStyle='#273240';ctx.fillRect(0,0,400,400);ctx.save();ctx.translate(200-center.x,220-center.y);b.renderGround(ctx);p.render(ctx,{x:p.x-500,y:p.y-500,width:1000,height:1000});b.render(ctx);ctx.restore();draws.push({label,image:canvas.toDataURL()})};
   p.startClassAction('ATTACK');const auto={x:p.classAim.x,y:p.classAim.y};const tap=p.releaseClassAction('ATTACK');capture('tap');
   for(let i=0;i<24;i++)b.update(.05);
   c.rage=100;p.startClassAction('ATTACK',{clientX:10,clientY:10});p.moveClassAim({clientX:100,clientY:10});p.classAim.elapsed=basicChargeSeconds(p,c.empowered);
   const guide=p.getClassAimGuide(),charged=p.releaseClassAction('ATTACK');capture('charged');
   const duplicate=p.releaseClassAction('ATTACK');const spam=c.basic({x:enemy.x,y:enemy.y});
   for(let i=0;i<75;i++)b.update(.05);
   return{id,level,g,tap,charged,duplicate,spam,auto,enemyCenter:{x:enemy.x,y:enemy.y},guide,hits,actions,draws,mage:(await game.net.getPlayerProfile(p.id)).skillLevels};
  },{id,skill,level});
  assert.equal(result.tap,true);assert.equal(result.charged,true,JSON.stringify({id,level,actions:result.actions,hits:result.hits}));assert.equal(result.duplicate,false);assert.equal(result.spam,false);
  assert.deepEqual(result.auto,result.enemyCenter,'automatic nearest target aim');assert.ok(result.hits.length>=2);
  assert.deepEqual(result.mage,{laser:3,missile:2,fireball:4,shield:1});
  for(const d of result.draws)fs.writeFileSync(`${out}/${id}-level-${level}-${d.label}.png`,Buffer.from(d.image.split(',')[1],'base64'));
  delete result.draws;report.cases.push(result);
  await page.evaluate(()=>game.loop.start());await page.locator('.camp-return').tap();await page.waitForFunction(()=>document.querySelector('#camp-scene')&&!game.sceneManager.currentScene.busy);
  assert.equal(await page.evaluate(skill=>game.localPlayer.skillLevels[skill],skill),level,'return to camp keeps level');
 }
 await context.close();
}assert.deepEqual(report.errors,[])}finally{fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
