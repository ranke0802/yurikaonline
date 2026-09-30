const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const out='/tmp/yurika-monster-qa';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const report={cases:[],errors:[],external:[]};
 try {for(const [name,width,height] of [['galaxy',780,360],['iphone',852,393],['desktop',1440,900]]){
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:name!=='desktop'});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();report.external.push(r.request().url());return r.abort()});
 await page.goto('http://127.0.0.1:8100/?local=1');await page.locator('#camp-name').fill('시인성 검사');await page.locator('[data-camp="create"]').tap();await page.locator('[data-camp="character"]').first().waitFor();
 await page.evaluate(async()=>{await game.net.savePlayerData(game.net.playerId,{questData:{basicTrainingCompleted:true,prologueCompleted:true}})});
 await page.locator('[data-camp="prepare"]').tap();await page.locator('[data-camp="depart"]').tap();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
 const frames=await page.evaluate(async()=>{
 const {default:Monster}=await import('/src/js/entities/Monster.js');
 const ids=['slime','king_slime','slime_split','squirtle','emolga','gastly','thunder_pikachu','ruin_wobbuffet','astral_sylveon','ember_drake','spark_squirrel','rift_sentinel'];
 const checks=[];
 for(const id of ids){const def=await game.monsterData.loadDefinition(id);const m=new Monster(500,500,def);await m.init(m.assetPath);
 const canvas=document.createElement('canvas');canvas.width=m.sprite.image.width;canvas.height=m.sprite.image.height;const ctx=canvas.getContext('2d');ctx.drawImage(m.sprite.image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;const counts=[];
 for(let row=0;row<(m.usesV2Atlas?3:1);row++)for(let col=0;col<(m.usesV2Atlas?m.atlasFrameCounts[row]:m.sprite.cols);col++){
 let opaque=0;for(let y=row*m.sprite.sh;y<(row+1)*m.sprite.sh;y++)for(let x=col*m.sprite.sw;x<(col+1)*m.sprite.sw;x++)if(data[(y*canvas.width+x)*4+3]>8)opaque++;
 if(opaque===0)throw Error(`${id} blank cell ${row}/${col}`);counts.push(opaque);
 }
 // Slime body must survive background removal in EVERY pose, not just have an outline.
 if(id.includes('slime')&&counts.some(n=>n<20000))throw Error(`${id} hollow body: ${counts}`);
 checks.push({id,counts});if(id==='slime')window.slimeContact=canvas.toDataURL();
 }
 // An enclosed foreground colour identical to the background must survive too.
 const source=document.createElement('canvas');source.width=source.height=20;let s=source.getContext('2d');s.fillStyle='#aaaaaa';s.fillRect(0,0,20,20);s.fillStyle='#001122';s.fillRect(4,4,12,12);s.fillStyle='#aaaaaa';s.fillRect(6,6,8,8);
 const target=document.createElement('canvas');target.width=target.height=100;let t=target.getContext('2d');Monster.prototype.processAndDrawFrame(source,t,0,0,100,100);if(t.getImageData(50,50,1,1).data[3]!==255)throw Error('enclosed body removed');if(t.getImageData(0,0,1,1).data[3]!==0)throw Error('background retained');
 // Monitor actual world draws while physical touch attacks use original pipelines.
 window.visibility={draws:0,hits:0,missing:[],deadDraws:0,attackTypes:[]};window.qaMonsters=[];
 const send=game.net.sendPlayerAttack.bind(game.net);game.net.sendPlayerAttack=(...args)=>{visibility.attackTypes.push(args[3]);return send(...args)};
 const p=game.localPlayer;p.x=1200;p.y=1200;p.facingAngle=0;
 for(const [i,type] of ['slime','slime_split','squirtle'].entries()){
 const id=await game.monsterManager.spawnMonster(type,1300+i*30,1200+i*20);const m=game.monsterManager.monsters.get(id);await m.init(m.assetPath);m.hp=m.maxHp=100000;m.spawnGraceTimer=0;qaMonsters.push(m);
 const take=m.takeDamage.bind(m);m.takeDamage=(...args)=>{visibility.hits++;return take(...args)};
 const render=m.render.bind(m);m.render=(ctx,camera)=>{const draw=m.sprite.draw;let calls=0;m.sprite.draw=function(...args){calls++;const alpha=args[0].globalAlpha;if(!m.isDead&&alpha!==1)visibility.missing.push({id:m.id,alpha});return draw.apply(this,args)};try{render(ctx,camera)}finally{m.sprite.draw=draw}if(m.isDead)visibility.deadDraws++;else{visibility.draws++;if(calls!==1)visibility.missing.push({id:m.id,calls,frame:m.frame})}};
 }
 return checks;
 });
 const contact=await page.evaluate(()=>slimeContact);fs.writeFileSync(`${out}/${name}-slime-frames.png`,Buffer.from(contact.split(',')[1],'base64'));
 const cdp=await context.newCDPSession(page);
 const hold=async(selector,ms)=>{const b=await page.locator(selector).boundingBox();assert.ok(b);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});await page.waitForTimeout(ms);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})};
 await hold('#action-attack-j',2500);await hold('#action-skill-u',300);await page.waitForTimeout(800);await hold('#action-skill-h',100);await hold('#action-attack-j',2500);
 // Deterministic repeated, simultaneous, critical and periodic hits at the original damage entry.
 await page.evaluate(()=>{for(let n=0;n<30;n++)for(const m of qaMonsters)m.takeDamage(1,true,n%3===0);for(const m of qaMonsters)m.applyEffect('burn',1,1)});await page.waitForTimeout(1200);
 await page.screenshot({path:`${out}/${name}-combat.png`});
 const before=await page.evaluate(()=>JSON.parse(JSON.stringify(visibility)));assert.ok(before.draws>30);assert.ok(before.hits>=90);assert.ok(before.attackTypes.includes('fireball'));assert.deepEqual(before.missing,[]);
 const death=await page.evaluate(async()=>{const m=qaMonsters[0];m.takeDamage(m.hp+1);m.update(m.deathDuration+0.1);const c=document.createElement('canvas');c.width=c.height=300;const ctx=c.getContext('2d');let calls=0;const draw=m.sprite.draw;m.sprite.draw=()=>calls++;m.render(ctx);m.sprite.draw=draw;if(calls)throw Error('expired corpse rendered');const id=await game.monsterManager.spawnMonster('slime',1300,1200);const next=game.monsterManager.monsters.get(id);await next.init(next.assetPath);return{dead:m.isDead,respawnAlive:!next.isDead,alpha:next.alpha,ready:next.ready}});assert.deepEqual(death,{dead:true,respawnAlive:true,alpha:1,ready:true});
 report.cases.push({name,frames,before,death});await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
 }finally{fs.writeFileSync(`${out}/visibility-report.json`,JSON.stringify(report,null,2));await browser.close()}
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
