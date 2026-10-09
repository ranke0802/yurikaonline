require('./lib/qa-preflight.cjs');
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const out=process.env.QA_OUTPUT||'/tmp/life-orb-visual';fs.mkdirSync(out,{recursive:true});
const base=(process.env.QA_BASE_URL||'http://127.0.0.1:8100').replace(/\/$/,'');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const report=[];
try{for(const [layout,width,height,dpr] of [['desktop',1280,800,1],['portrait',393,852,3],['landscape',852,393,2]]){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 // A same-origin text page avoids starting gameplay; these are isolated render fixtures.
 await page.goto(`${base}/src/js/combat/LifeOrbVisuals.js`);
 const result=await page.evaluate(async()=>{
  const {default:Resources}=await import('/src/js/core/ResourceManager.js');
  const {default:Remote,drawClassEffect,renderGroundEffects,renderForegroundEffects}=await import('/src/js/combat/ClassVisuals.js');
  history.replaceState(null,'','/');const resources=new Resources();window.game={resources,net:{_getCurrentFieldId:()=> 'visual-fixture'},sceneManager:{currentScene:{}},monsterManager:{worldGeneration:1}};
  const images=await resources.preparePlayableClassAssets('witch'),owner={x:0,y:0,hp:100,maxHp:100,width:48,height:48};
  const draw=(renderer)=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=192;const ctx=canvas.getContext('2d');ctx.translate(96,96);renderGroundEffects(renderer,ctx);renderForegroundEffects(renderer,ctx);return canvas;};
  const sample=c=>{const p=c.getContext('2d').getImageData(0,0,192,192).data;let alpha=0,hash=2166136261,edge=0;for(let i=0;i<p.length;i++){hash=Math.imul(hash^p[i],16777619)>>>0;if(i%4===3&&p[i]>8){alpha++;const j=(i-3)/4,x=j%192,y=Math.floor(j/192);if(x===0||x===191||y===0||y===191)edge++;}}return{alpha,hash,edge};};
  const sheet=document.createElement('canvas');sheet.width=8*192;sheet.height=6*192;const ctx=sheet.getContext('2d');ctx.fillStyle='#23363a';ctx.fillRect(0,0,sheet.width,sheet.height);
  const cases=[];let sequence=0;const realNow=Date.now,now=realNow();Date.now=()=>now;
  try{for(let row=0;row<6;row++)for(let col=0;col<4;col++)for(const dir of [1,-1])for(const style of row<4?['base','impact','reduced']:['base']){
   game.useReducedEffects=style==='reduced';
   const age=(col+.01)*.1,phase=row===4?'return':'outbound',charge=row===4?1:row/3;
   const projectiles=row===5?[]:[{kind:'life_orb',x:0,y:0,age,phase,charge,impactAt:style==='base'?null:age-.001,impactAge:style==='base'?null:.001,direction:{x:dir,y:0},speed:phase==='return'?540:180,remaining:500,radius:14}];
   const effects=row===5?[{id:'heal',name:'life_orb_heal',x:0,y:0,age,duration:.4}]:[];
   const local={owner,images,classId:'witch',projectiles,effects};local.drawEffect=(...args)=>drawClassEffect(local,...args);
   const remote=new Remote(owner);remote.classId='witch';remote.images=images;
   if(!remote.receive({classId:'witch',fieldId:'visual-fixture',ts:now,epoch:1,sequence:++sequence,projectiles,effects}))throw Error('remote packet rejected');
   const a=draw(local),b=draw(remote);cases.push({row,col,dir,style,local:sample(a),remote:sample(b)});
   if(dir===1&&style==='base'){ctx.drawImage(a,col*192,row*192);ctx.drawImage(b,(col+4)*192,row*192);}
  }}finally{Date.now=realNow;}
  return{cases,image:sheet.toDataURL().split(',')[1],ownerHp:owner.hp};
 });
 assert.deepEqual(errors,[]);assert.equal(result.ownerHp,100);
 for(const c of result.cases){assert.ok(c.local.alpha>20,JSON.stringify(c));assert.equal(c.local.edge,0);assert.deepEqual(c.local,c.remote,'local/remote render parity');}
 fs.writeFileSync(`${out}/${layout}.png`,Buffer.from(result.image,'base64'));delete result.image;report.push({layout,dpr,...result});await context.close();
}fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(`PASS ${report.reduce((n,r)=>n+r.cases.length,0)} generated raster frames; local/remote pixels match, no clipping`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
