// Deterministic, lossless packaging of approved full-body frames. Never alpha-fit.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
const source=process.argv[2];if(!source)throw Error('Pass extracted approved art directory');
const out='assets/resource/classes/approved';await fs.mkdir(out,{recursive:true});await fs.mkdir('assets/resource/classes/weapons',{recursive:true});
const specs={witch:{folder:'witch-animation-frames',w:120,h:120,px:60,py:112,ms:140},warrior:{folder:'warrior-animation-preview-package',w:180,h:144,px:90,py:132,ms:150},archer:{folder:'archer-animation-frames',w:192,h:144,px:96,py:132,ms:140}};
const report={sourceCommit:'cb46f34edf77122e8ed8db827eaa40603e330a8b',zipSha256:'4a57cd980d35ecb267a1bb3b974b3ec04c4dec857983fde418bb9884beee6651',frames:[],assets:[]};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const visible=b=>{for(let i=0;i<b.length;i+=4)if(!b[i+3])b[i]=b[i+1]=b[i+2]=0;return b;};
async function stitch(parts,width,height,target){
 const data=Buffer.alloc(width*height*4);
 for(const part of parts){const {data:tile,info}=await sharp(part.input).ensureAlpha().raw().toBuffer({resolveWithObject:true});for(let y=0;y<info.height;y++)tile.copy(data,((part.top+y)*width+part.left)*4,y*info.width*4,(y+1)*info.width*4);}
 await sharp(data,{raw:{width,height,channels:4}}).webp({lossless:true,effort:6}).toFile(target);
}
const record=async file=>{const b=await fs.readFile(file),m=await sharp(b).metadata();report.assets.push({file,bytes:b.length,sha256:sha(b),width:m.width,height:m.height,alpha:m.hasAlpha});};
for(const [id,s] of Object.entries(specs)){
 const parts=[],compat=[];
 for(const [si,state] of ['walk','stationary-attack','moving-attack'].entries())for(const [di,dir] of ['up','down','left','right'].entries())for(let frame=0;frame<4;frame++){
  const warriorState={'walk':'walk','stationary-attack':'attack','moving-attack':'moving_attack'}[state],warriorDir={up:'back',down:'front',left:'left',right:'right'}[dir];
  const name=id==='warrior'?`${warriorState}_${warriorDir}-${String(frame+1).padStart(2,'0')}.png`:`${state}-${dir}-${String(frame+1).padStart(2,'0')}.png`;
  const input=await fs.readFile(path.join(source,s.folder,'frames',name)),m=await sharp(input).metadata();if(m.width!==s.w||m.height!==s.h||!m.hasAlpha)throw Error(name);
  parts.push({input,left:frame*s.w,top:(si*4+di)*s.h});
  report.frames.push({classId:id,state,direction:dir,frame,source:`${s.folder}/frames/${name}`,sha256:sha(input),rgbaSha256:sha(visible(await sharp(input).ensureAlpha().raw().toBuffer()))});
  if(si===0||(si===1&&di===1)){
   // Compatibility portrait sheet: fixed central logical tile, never alpha bounds.
   const tile=await sharp(input).extract({left:s.px-60,top:s.py-112,width:120,height:120}).png().toBuffer();
   for(const col of [frame,frame+4])compat.push({input:tile,left:col*120,top:(si===0?di:4)*120});
  }
 }
 await stitch(parts,s.w*4,s.h*12,`${out}/${id}-body.webp`);
 await stitch(compat,960,600,`${out}/${id}-runtime.webp`);
 await record(`${out}/${id}-body.webp`);await record(`${out}/${id}-runtime.webp`);
 const definition=JSON.parse(await fs.readFile(`assets/data/characters/${id}.json`));definition.visual.assetPath=`${out}/${id}-runtime.webp`;definition.visual.frameSpeed=s.ms/1000;
 definition.visual.authoredBody={assetPath:`${out}/${id}-body.webp`,frameWidth:s.w,frameHeight:s.h,pivot:[s.px,s.py],columns:4,rows:12,frameSeconds:s.ms/1000,rowOrder:['walk-up','walk-down','walk-left','walk-right','stationary-attack-up','stationary-attack-down','stationary-attack-left','stationary-attack-right','moving-attack-up','moving-attack-down','moving-attack-left','moving-attack-right']};
 await fs.writeFile(`assets/data/characters/${id}.json`,JSON.stringify(definition,null,2)+'\n');
}
for(const id of ['witch','warrior','archer'])for(const theme of ['magic','tidal','storm','astral','riftcore']){
 const name=`${theme}_${id}.webp`,dest=`assets/resource/classes/weapons/${name}`;await fs.copyFile(path.join(source,'yurika-15-class-weapons/weapons',name),dest);const m=await sharp(dest).metadata();if(m.width!==512||m.height!==512||!m.hasAlpha)throw Error(name);await record(dest);
}
for(const name of ['witch-effects','warrior-effects','archer-effects','life-circle','poison-potion']){
 const dest=`${out}/${name}.webp`;await fs.copyFile(path.join(source,'YurikaOnline-class-skill-art/final',name+'.webp'),dest);await record(dest);
}
await fs.mkdir('reports/approved-art-v142',{recursive:true});await fs.writeFile('reports/approved-art-v142/provenance.json',JSON.stringify(report,null,2)+'\n');
console.log(`Packaged ${report.frames.length} original frames losslessly; ${report.assets.length} assets. Old asset files preserved.`);
