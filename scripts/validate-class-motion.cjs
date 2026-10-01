const {chromium}=require('playwright');
const sharp=require('sharp');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const OUT=process.env.QA_OUTPUT||'reports/class-motion';
const BASE=process.env.QA_BASE||'http://127.0.0.1:8100';
fs.mkdirSync(OUT,{recursive:true});
const report={manualReview:{status:'required',checks:['Alternating anatomical legs and counter-swinging free arm','No repeated same-leg hopping or constant split-pose skating','Stable planted-foot baseline and body center','Same equipment hand and costume details across all four directions','Direction reversals do not mirror equipment']},scope:'Local isolated Chromium keyboard movement, all four runtime directions and reversals. No live accounts or physical phones. Alpha bounds flag candidates; limb/hand identity requires visual inspection.',cases:[],errors:[],external:[]};
const classes=(process.env.QA_CLASSES||'witch,warrior,archer').split(',');
assert.ok(classes.every(id=>['witch','warrior','archer'].includes(id)));
const directions=[['down','ArrowDown',1],['right','ArrowRight',3],['up','ArrowUp',0],['left','ArrowLeft',2],['right','ArrowRight',3],['left','ArrowLeft',2],['up','ArrowUp',0],['down','ArrowDown',1]];
function gif(pattern,target,fps=10,compact=false){execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',String(fps),'-i',pattern,'-filter_complex',`${compact?'[0:v]scale=512:-1:flags=lanczos,':'[0:v]'}split[a][b];[a]palettegen=stats_mode=diff:max_colors=${compact?96:256}[p];[b][p]paletteuse=dither=sierra2_4a`,'-loop','0',target]);}
async function atlasQA(classId){
 const file=`assets/resource/classes/${classId}-runtime.webp`;
 const meta=await sharp(file).metadata();const w=meta.width/8,h=meta.height/5;
 const rows=[];const composites=[];
 for(let row=0;row<4;row++){
  const frames=[];
  for(let frame=0;frame<4;frame++){
   const tile=sharp(file).extract({left:frame*w,top:row*h,width:w,height:h});
   const {data,info}=await tile.clone().ensureAlpha().raw().toBuffer({resolveWithObject:true});
   let minX=w,minY=h,maxX=-1,maxY=-1,count=0,sumX=0,sumY=0;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*info.channels+3]>24){count++;sumX+=x;sumY+=y;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
   assert.ok(count>20,`${classId} row${row} frame${frame} is blank`);
   const seen=new Uint8Array(w*h),components=[];
   for(let n=0;n<seen.length;n++){
    if(seen[n]||data[n*info.channels+3]<=24)continue;
    const queue=[n];seen[n]=1;let top=h,bottom=0;
    for(let k=0;k<queue.length;k++){const at=queue[k],x=at%w,y=Math.floor(at/w);top=Math.min(top,y);bottom=Math.max(bottom,y);for(const [xx,yy] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(xx<0||yy<0||xx>=w||yy>=h)continue;const next=yy*w+xx;if(!seen[next]&&data[next*info.channels+3]>24){seen[next]=1;queue.push(next);}}}
    components.push({count:queue.length,top,bottom});
   }
   components.sort((a,b)=>b.count-a.count);
   const detachedRowFragments=components.slice(1).filter(c=>c.count>=8&&(c.top>components[0].bottom+1||c.bottom<components[0].top-1));
   assert.equal(detachedRowFragments.length,0,`${classId} row${row} frame${frame} has a detached neighboring-row fragment`);

   frames.push({frame,detachedRowFragments,minX,minY,maxX,maxY,centerX:(minX+maxX)/2,centerY:(minY+maxY)/2,centroidX:sumX/count,centroidY:sumY/count,visible:count,edgeContact:minX===0||minY===0||maxX===w-1||maxY===h-1});
   composites.push({input:await tile.resize(192,192,{kernel:'nearest'}).png().toBuffer(),left:frame*192,top:row*192});
  }
  const spread=key=>Math.max(...frames.map(f=>f[key]))-Math.min(...frames.map(f=>f[key]));
  rows.push({row,direction:['up','down','left','right'][row],frames,footBaselineSpread:spread('maxY'),centerXSpread:spread('centerX'),centerYSpread:spread('centerY'),flags:[...(spread('maxY')>h*.04?['foot baseline varies >4% tile height']:[]),...(spread('centerX')>w*.06?['horizontal bounds center varies >6% tile width']:[]),...(frames.some(f=>f.edgeContact)?['visible sprite touches tile edge']:[])]});
 }
 await sharp({create:{width:768,height:768,channels:4,background:'#25332e'}}).composite(composites).png().toFile(`${OUT}/${classId}-walk-contact.png`);
 return {file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),width:meta.width,height:meta.height,tileWidth:w,tileHeight:h,rows};
}
(async()=>{
 execFileSync('ffmpeg',['-version'],{stdio:'ignore'});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const classId of classes){
   const atlas=await atlasQA(classId);
   const dir=path.resolve(OUT,classId);fs.mkdirSync(dir,{recursive:true});
   const context=await browser.newContext({viewport:{width:852,height:480}});
   const page=await context.newPage();page.setDefaultTimeout(20000);
   page.on('pageerror',e=>report.errors.push({classId,error:e.message}));
   await page.route('**/*',route=>{if(new URL(route.request().url()).origin===new URL(BASE).origin)return route.continue();report.external.push(route.request().url());return route.abort();});
   await page.goto(BASE+'/?local=1');await page.locator('#camp-name').fill('동작 검증');await page.locator('[data-camp=create]').click();await page.locator('[data-camp=character]').first().waitFor();
   await page.evaluate(async(id)=>{const n=game.net,p=await n.getPlayerProfile(n.playerId);await n.savePlayerData(n.playerId,{...p,activeClassId:id,questData:{...p.questData,basicTrainingCompleted:true,prologueCompleted:true}});},classId);
   await page.reload();await page.locator('[data-camp=prepare]').click();await page.locator('[data-camp=depart]').click();await page.locator('.camp-return').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
   await page.waitForFunction(id=>game.localPlayer?.classId===id&&game.localPlayer.sprite?.image?.width>0,classId);
   const runtimeUrl=await page.evaluate(()=>game.localPlayer.sprite.image.src);
   assert.ok(runtimeUrl.endsWith(`/assets/immutable/${atlas.sha256.slice(0,24)}.webp`),'browser uses the exact freshly inspected runtime atlas');
   await page.evaluate(()=>{
    const p=game.localPlayer;p.x=1400;p.y=1200;p.autoAttackEnabled=false;
    game.monsterManager.monsters.clear();game.monsterManager.update=()=>{};
    // Controlled open field: retain real input, player movement and animation; remove terrain/monster interference.
    game.sceneManager.currentScene.checkCollision=()=>false;
   });
   await page.waitForTimeout(300);
   let sequence=0;const movement=[];const videoStart=Date.now();
   for(const [direction,key,row] of directions){
    const before=await page.evaluate(()=>({x:game.localPlayer.x,y:game.localPlayer.y}));
    await page.keyboard.down(key);const samples=[];
    for(let i=0;i<18;i++){
     await page.waitForTimeout(60);
     const sample=await page.evaluate(()=>{
      const p=game.localPlayer,c=document.createElement('canvas');c.width=c.height=192;const ctx=c.getContext('2d');ctx.fillStyle='#25332e';ctx.fillRect(0,0,192,192);ctx.imageSmoothingEnabled=false;
      p.sprite.draw(ctx,p.direction,p.animFrame,0,0,192,192);
      return {x:p.x,y:p.y,row:p.direction,frame:p.animFrame,state:p.state,at:performance.now(),png:c.toDataURL('image/png').split(',')[1],world:game.canvas.toDataURL('image/jpeg',.9).split(',')[1]};
     });
     fs.writeFileSync(`${dir}/frame-${String(sequence).padStart(4,'0')}.png`,Buffer.from(sample.png,'base64'));
     fs.writeFileSync(`${dir}/world-${String(sequence++).padStart(4,'0')}.jpg`,Buffer.from(sample.world,'base64'));delete sample.world;delete sample.png;samples.push(sample);
    }
    await page.screenshot({path:`${OUT}/${classId}-${direction}.png`});await page.keyboard.up(key);
    const after=samples.at(-1);assert.equal(after.row,row,`${classId} ${direction} mapping`);assert.ok(new Set(samples.map(s=>s.frame)).size>=3,`${classId} ${direction} cycles walk frames`);
    const delta=direction==='right'?after.x-before.x:direction==='left'?before.x-after.x:direction==='down'?after.y-before.y:before.y-after.y;assert.ok(delta>30,`${classId} ${direction} actual displacement`);
    movement.push({direction,key,row,before,after,delta,samples});
   }
   const elapsed=(Date.now()-videoStart)/1000;
   await page.evaluate(()=>{game.sceneManager.currentScene.checkCollision=()=>true;});
   await page.keyboard.down('ArrowRight');await page.waitForTimeout(200);
   const blocked=[];
   for(let i=0;i<6;i++){await page.waitForTimeout(100);blocked.push(await page.evaluate(()=>({x:game.localPlayer.x,y:game.localPlayer.y,frame:game.localPlayer.animFrame})));}
   await page.keyboard.up('ArrowRight');
   assert.equal(new Set(blocked.map(s=>`${s.x},${s.y}`)).size,1,'blocked player has no displacement');
   assert.equal(new Set(blocked.map(s=>s.frame)).size,1,'blocked player does not keep cycling feet');
   await context.close();
   gif(`${dir}/frame-%04d.png`,`${OUT}/${classId}-stabilized-walk.gif`,sequence/elapsed);
   gif(`${dir}/world-%04d.jpg`,`${OUT}/${classId}-runtime-movement.gif`,sequence/elapsed,true);
   execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',String(sequence/elapsed),'-i',`${dir}/world-%04d.jpg`,'-c:v','libvpx-vp9','-cpu-used','4','-row-mt','1','-crf','35','-b:v','0','-pix_fmt','yuv420p',`${OUT}/${classId}-runtime-movement.webm`]);
   report.cases.push({classId,atlas,runtimeUrl,movement,blocked,elapsed,framesPerSecond:sequence/elapsed});
   if(process.env.QA_KEEP_FRAMES!=='1')fs.rmSync(dir,{recursive:true,force:true});
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
 }finally{fs.writeFileSync(`${OUT}/motion-report.json`,JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify({classes:report.cases.map(c=>({classId:c.classId,flags:c.atlas.rows.filter(r=>r.flags.length)})),pageerrors:report.errors,external:report.external},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
