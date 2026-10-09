require('./lib/qa-preflight.cjs');
const {chromium}=require('playwright'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const OUT='reports/class-vfx';fs.mkdirSync(OUT,{recursive:true});
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{for(const [version,port]of [['before',8101],['after',8100]].filter(([v])=>(process.env.QA_VFX_VERSIONS||'before,after').split(',').includes(v))){
const base=`http://127.0.0.1:${port}`,context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage();await page.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===base||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});
 await page.goto(base+'/?local=1');await page.locator('#camp-name').fill('VFX fixture');await page.locator('[data-camp=create]').tap();await page.locator('[data-camp=character]').first().tap();await page.locator('[data-camp="select-class:witch"]').tap();await page.waitForFunction(()=>game.localPlayer?.classId==='witch'&&!game.sceneManager.currentScene.busy);await page.locator('[data-camp=depart]').tap();await page.waitForFunction(()=>document.querySelector('#camp-scene')?.dataset.view==='prepare');await page.locator('[data-camp=depart]').tap();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});

const result=await page.evaluate(async(version)=>{
 game.loop.stop();game.tutorial=null;game.input.setEnabled(true);game.input.setAllowedActions(null);game.monsterManager.monsters.clear();game.sceneManager.currentScene.checkCollision=()=>false;
 const p=game.localPlayer,frames=Array.from({length:60},()=>{const c=document.createElement('canvas');c.width=640;c.height=720;const ctx=c.getContext('2d');ctx.fillStyle='#25332d';ctx.fillRect(0,0,640,720);return c;}),proof=[];
 const directions=[['UP',0,-1,0],['DOWN',0,1,1],['LEFT',-1,0,2],['RIGHT',1,0,3]];
 for(const [ci,classId]of ['witch','warrior','archer'].entries())for(let phase=0;phase<5;phase++)for(const [di,[name,dx,dy,dir]]of (phase<2?directions:[directions[3]]).entries()){
  p.classId=classId;p.initializeClassCombat();await p._loadSpriteSheet(game.resources);p.x=p.y=1500;p.hp=p.maxHp=1000;p.mp=p.maxMp=100000;p.isDead=false;p.autoAttackEnabled=false;p.isAttacking=false;p.attackSpeed=1;p.wisdom=0;p.classStatuses={};p.facingAngle=Math.atan2(dy,dx);p.direction=dir;
  const b=p.classCombat,c=b.controller;c.rage=100;const center={x:p.x+p.width/2,y:p.y+p.height/2},target={x:center.x+dx*(phase<2?100:160),y:center.y+dy*(phase<2?100:160)};
  if(classId==='witch'){const definition=await game.monsterData.loadDefinition('slime');b.definitions.set('slime',definition);}
  game.monsterManager.monsters.clear();const enemy={id:'gif-fixture',...target,hp:100000,maxHp:100000,radius:10,isLocalOnly:true,defense:0,takeDamage(n){this.hp-=n;return true;},applyClassStatus(){}};game.monsterManager.monsters.set(enemy.id,enemy);
  const action=phase<2?'ATTACK':`SKILL_${phase-1}`;p.startClassAction(action);p.classAim.x=target.x;p.classAim.y=target.y;p.classAim.elapsed=phase===1?.6:0;const accepted=p.releaseClassAction(action);
  if(phase===3&&classId==='witch'&&b.actors[0]?.visual)await b.actors[0].visual.init(b.actors[0].visual.assetPath).catch(()=>{});
  const cameraCenter=phase===3?{x:(center.x+p.x+p.width/2)/2,y:(center.y+p.y+p.height/2)/2}:center;
  proof.push({classId,phase,direction:name,accepted,atlas:{width:b.images.actions?.width,height:b.images.actions?.height},motion:b.currentMotion?.()});
  for(let frame=0;frame<12;frame++){
   if(frame){p.update(.1);}
   const ctx=frames[phase*12+frame].getContext('2d'),x=phase<2?di*160:0,w=phase<2?160:640,y=ci*240;
   ctx.save();ctx.beginPath();ctx.rect(x,y,w,240);ctx.clip();ctx.translate(x+w/2-cameraCenter.x,y+150-cameraCenter.y);b.renderGround(ctx);p.render(ctx,{x:1000,y:1000,width:1200,height:1200});b.render(ctx);ctx.restore();ctx.fillStyle='#f1f3ee';ctx.font='12px sans-serif';ctx.fillText(`${classId} / ${phase===0?'basic':phase===1?'aimed':`skill ${phase-1}`} / ${name}`,x+5,y+15);
  }
 }
 for(const canvas of frames){const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.font='bold 16px sans-serif';ctx.fillText(version.toUpperCase(),570,35);}
 return{pngs:frames.map(c=>c.toDataURL('image/png')),proof};
},version);
const dir=`/tmp/class-vfx-${version}-frames`;fs.mkdirSync(dir,{recursive:true});result.pngs.forEach((png,i)=>fs.writeFileSync(`${dir}/${String(i).padStart(3,'0')}.png`,Buffer.from(png.split(',')[1],'base64')));fs.writeFileSync(`${OUT}/${version}-animation-proof.json`,JSON.stringify(result.proof,null,2));await context.close();
}
execFileSync('ffmpeg',['-y','-framerate','10','-i','/tmp/class-vfx-before-frames/%03d.png','-framerate','10','-i','/tmp/class-vfx-after-frames/%03d.png','-filter_complex','[0:v]drawtext=text=BEFORE:x=570:y=20:fontsize=16:fontcolor=white[left];[left][1:v]hstack=inputs=2,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a','-loop','0',`${OUT}/runtime-vfx-before-after.gif`],{stdio:'pipe'});
console.log(`${OUT}/runtime-vfx-before-after.gif`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
