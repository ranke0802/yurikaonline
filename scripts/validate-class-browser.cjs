const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const BASE = process.env.QA_BASE || 'http://127.0.0.1:8100';
const OUT = process.env.QA_OUTPUT || 'reports/class-qa';
fs.mkdirSync(OUT, { recursive: true });
const report = { pixelValidation: process.env.QA_COMBAT_ONLY !== '1', coverage: 'Isolated local account fixtures, Chromium simulated mobile input; no live accounts or physical phones', cases: [], errors: [], blockedExternal: [] };
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
 try {
  for (const [name, width, height] of [['portrait',390,844], ['landscape',852,393]]) {
   const context = await browser.newContext({ viewport: { width,height }, hasTouch:true, isMobile:true });
   const page = await context.newPage(); page.setDefaultTimeout(20000);
   page.on('pageerror', error => report.errors.push({name,error:error.message}));
   await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(BASE).origin || ['data:','blob:'].includes(url.protocol)) return route.continue();
    report.blockedExternal.push(url.href); return route.abort();
   });
   const cdp = await context.newCDPSession(page);
   const touch = (type, points=[]) => cdp.send('Input.dispatchTouchEvent', {type,touchPoints:points.map((p,id)=>({...p,id,radiusX:4,radiusY:4,force:1}))});
   const press = async (selector, held=false) => {
    const b = await page.locator(selector).boundingBox(); assert.ok(b,selector);
    const origin = {x:b.x+b.width/2,y:b.y+b.height/2};
    await touch('touchStart',[origin]);
    if (held) { await page.waitForFunction(()=>game.localPlayer.classAim?.elapsed >= .55); await touch('touchMove',[{x:origin.x+35,y:origin.y}]); }
    else await page.waitForTimeout(50);
    await touch('touchEnd');
   };
   await page.goto(BASE+'/?local=1');
   await page.locator('#camp-name').fill('클래스 검증'); await page.locator('[data-camp=create]').tap();
   await page.locator('[data-camp=character]').first().waitFor();
   await page.evaluate(async()=>{
    const n=game.net,p=await n.getPlayerProfile(n.playerId);
    const staff=game.itemData.createRewardItem('magic_staff'); staff.instanceId='qa-preserved-mage-weapon';
    await n.savePlayerData(n.playerId,{...p,level:7,exp:37,manastone:100000,skillLevels:{laser:3,missile:2,fireball:4,shield:1},equipment:{weapon:staff},inventory:[null],questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}});
   });
   await page.reload(); await page.locator('[data-camp=character]').first().waitFor();
   for (const classId of ['witch','warrior','archer','wizard']) {
    await page.locator('[data-camp=character]').first().tap();
    await page.locator(`[data-camp="select-class:${classId}"]`).tap();
    await page.waitForFunction(id=>game.localPlayer?.classId===id,classId);
    await page.waitForFunction(()=>!game.sceneManager.currentScene.busy);
    if(classId!=='wizard')assert.equal(await page.evaluate(()=>game.localPlayer.equipment.weapon),null,'new class does not inherit or mint Mage equipment');
    await page.locator('[data-camp=skills]').tap();
    const expected = {witch:['lifeDrain','poison','summon','berserk'],warrior:['cleave','challenge','charge','bloodPact'],archer:['shot','trap','shadowLeap','rain'],wizard:['laser','missile','fireball','shield']}[classId];
    assert.deepEqual(await page.locator('#skill-popup .skill-up-btn').evaluateAll(rows=>rows.map(row=>row.dataset.skill)),expected);
    if(classId!=='wizard') {
     const id=expected[1]; const before=await page.evaluate(id=>game.localPlayer.skillLevels[id],id);
     await page.locator(`.skill-up-btn[data-skill="${id}"]`).tap();
     assert.equal(await page.evaluate(id=>game.localPlayer.skillLevels[id],id),before+1);
     assert.equal(await page.locator(`.skill-up-btn[data-skill="${expected[0]}"]`).isDisabled(),true);
    }
    if(classId!=='wizard'){const icons=await page.locator('#skill-popup .skill-icon').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backgroundImage));assert.ok(icons.every(url=>/\/assets\/immutable\/[a-f0-9]{24}\.webp/.test(url)),'popup icons use immutable generated raster URLs');}
    await page.screenshot({path:`${OUT}/${name}-${classId}-skills.png`});
    await page.evaluate(()=>game.ui.hideAllPopups());
    await page.locator('[data-camp=depart]').tap();
    await page.waitForFunction(()=>document.querySelector('#camp-scene')?.dataset.view==='prepare');
    await page.locator('[data-camp=depart]').tap(); await page.locator('.camp-return').waitFor();
    await page.locator('#loading-overlay').waitFor({state:'hidden'});
    if(classId!=='wizard') {
     await page.waitForFunction(()=>!!game.localPlayer.classCombat);
     if(process.env.QA_COMBAT_ONLY !== '1') {
     await page.waitForFunction(()=>game.localPlayer.sprite?.image?.width>0 && game.localPlayer.classCombat.images.effects?.width>0 && game.localPlayer.classCombat.images.status?.width>0 && (game.localPlayer.classId!=='witch' || game.localPlayer.classCombat.images.lifeCircle?.width>0),null,{timeout:30000});
     const pixels=await page.evaluate(()=>{
      const p=game.localPlayer,c=document.createElement('canvas');c.width=c.height=96;const ctx=c.getContext('2d');
      const sample=()=>{const data=ctx.getImageData(0,0,96,96).data;let visible=0,hash=2166136261;for(let i=0;i<data.length;i++){hash=Math.imul(hash^data[i],16777619)>>>0;if(i%4===3&&data[i]>20)visible++;}return {visible,hash};};
      p.sprite.draw(ctx,1,0,0,0,96,96);const sprite=sample();const frames=[];
      const effects={witch:['life_circle','poison_cloud','summon','berserk_potion'],warrior:['warrior_slash','challenge','punishing_charge','blood_pact'],archer:['archer_shot','hunter_trap','shadow_leap','tracking_rain']};
      for(const effect of effects[p.classId])for(let frame=0;frame<4;frame++){ctx.clearRect(0,0,96,96);p.classCombat.drawEffect(ctx,effect,48,48,96,frame*.16);frames.push({effect,frame,...sample()});}
      const status=[];const atlas=p.classCombat.images.status;
      for(let i=0;i<8;i++){ctx.clearRect(0,0,96,96);ctx.drawImage(atlas,(i%4)*atlas.width/4,Math.floor(i/4)*atlas.height/2,atlas.width/4,atlas.height/2,0,0,22,22);status.push(sample());}
      return {sprite,frames,status,resourceUrls:[p.sprite.image.src,...Object.values(p.classCombat.images).map(image=>image.src)].filter(Boolean)};
     });
     report.cases.push({name,classId,pixels});
     assert.ok(pixels.resourceUrls.every(url=>/\/assets\/immutable\/[a-f0-9]{24}\.webp$/.test(url)),'runtime sprite/effects/status use immutable WebP URLs');
     assert.ok(pixels.status.every(f=>f.visible>10),'every status icon remains visible at runtime 22px size');
     assert.ok(pixels.sprite.visible>20,'actual player sprite has visible pixels');
     assert.ok(pixels.frames.every(f=>f.visible>20),'every skill effect frame contains visible pixels');
     for(const effect of new Set(pixels.frames.map(f=>f.effect)))assert.ok(new Set(pixels.frames.filter(f=>f.effect===effect).map(f=>f.hash)).size>1,`${effect} frames visibly differ`);
     }
     await page.evaluate(async()=>{
      const p=game.localPlayer; game.monsterManager.monsters.clear(); game.projectiles=[];
      const id=await game.monsterManager.spawnMonster('slime',1400,1200); const m=game.monsterManager.monsters.get(id);
      m.update=()=>{};m.hp=1000000;m.maxHp=1000000;m.defense=0;
      p.x=m.x-60;p.y=m.y;p.hp=p.maxHp;p.mp=100000;p.maxMp=100000;p.attackPower=20;p.autoAttackEnabled=false;p.facingAngle=0;
      window.classQa={id,hp:m.hp,casts:[]};
      const b=p.classCombat;
      for(const method of ['basic','skill']) {const original=b[method].bind(b); b[method]=(...args)=>{const result=original(...args);classQa.casts.push({method,args,result});return result;};}
     });
     await press('#action-attack-j'); await page.waitForTimeout(600);
     if(classId==='warrior') for(let i=0;i<5;i++){await press('#action-attack-j');await page.waitForTimeout(600);}
     await page.waitForTimeout(500);
     await press('#action-attack-j',true); await page.waitForTimeout(1200);
     for(const key of ['h','u','k']) {await page.evaluate(()=>{const p=game.localPlayer;p.hp=p.maxHp});await press(`#action-skill-${key}`);await page.waitForTimeout(200);}
     await page.screenshot({path:`${OUT}/${name}-${classId}-battle.png`});
     if(classId==='witch'){await page.waitForTimeout(800);await page.screenshot({path:`${OUT}/${name}-witch-status.png`});}
     const combat=await page.evaluate(()=>({hp:game.monsterManager.monsters.get(classQa.id)?.hp,casts:classQa.casts}));
     report.cases.push({name,classId,combat});
     assert.ok(combat.casts.some(c=>c.method==='basic'&&!c.args[0]?.aimed&&c.result),'tap basic cast');
     assert.ok(combat.casts.some(c=>c.method==='basic'&&c.args[0]?.aimed&&c.result),'held basic cast');
     assert.ok(combat.hp<1000000,'basic/skill fixture damage');
     for(const slot of [1,2,3])assert.ok(combat.casts.some(c=>c.method==='skill'&&c.args[0]===slot&&c.result),`skill ${slot} cast`);
    } else {
     const mage=await page.evaluate(()=>({level:game.localPlayer.level,exp:game.localPlayer.exp,skill:game.localPlayer.skillLevels.fireball,weapon:game.localPlayer.equipment.weapon?.instanceId}));
     assert.deepEqual(mage,{level:7,exp:37,skill:4,weapon:'qa-preserved-mage-weapon'});
     report.cases.push({name,classId,mage});
    }
    await page.locator('.camp-return').tap();await page.locator('[data-camp=character]').first().waitFor();
    await page.reload();await page.locator('[data-camp=character]').first().waitFor();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('yurika.local.profile.v1')).profile);
    assert.equal(saved.activeClassId,classId);
    if(classId!=='wizard') assert.equal(saved.classProfiles[classId].skillLevels[expected[1]],2,'class skill upgrade persists across reentry');
    assert.equal(saved.level,7);assert.equal(saved.equipment.weapon.instanceId,'qa-preserved-mage-weapon');
    assert.equal((saved.inventory||[]).filter(i=>i?.instanceId==='qa-preserved-mage-weapon').length,0,'Mage equipment is never duplicated into inventory');
   }
   await context.close();
  }
  assert.deepEqual(report.errors,[]);
 } finally {fs.writeFileSync(`${OUT}/class-browser-report.json`,JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
