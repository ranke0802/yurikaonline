import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
const [name,source]=process.argv.slice(2);
if(!['witch','warrior','archer'].includes(name)||!source)throw Error('Expected class and approved walk PNG');
const out='assets/resource/classes', cell=192;
const meta=await sharp(source).metadata(), frames=[],bounds=[];
for(let row=0;row<4;row++)for(let col=0;col<4;col++){
 const left=Math.round(col*meta.width/4),top=Math.round(row*meta.height/4);
 const raw=await sharp(source).extract({left,top,width:Math.round((col+1)*meta.width/4)-left,height:Math.round((row+1)*meta.height/4)-top}).resize(176,176).ensureAlpha().raw().toBuffer();
 let bottom=0,upper=175,headSum=0,headCount=0;
 for(let y=0;y<176;y++)for(let x=0;x<176;x++)if(raw[(y*176+x)*4+3]>32){bottom=Math.max(bottom,y);upper=Math.min(upper,y);if(y<92){headSum+=x;headCount++;}}
 if(!headCount)throw Error('Blank authored walk frame');
 frames.push(await sharp(raw,{raw:{width:176,height:176,channels:4}}).png().toBuffer());bounds.push({row,col,bottom,upper,head:headSum/headCount});
}
const composed=[];
for(let i=0;i<16;i++){
 const row=Math.floor(i/4),col=i%4,b=bounds[i];
 const headAnchor=bounds.slice(row*4,row*4+4).reduce((s,b)=>s+b.head,0)/4;
 const x=Math.max(0,Math.min(16,8+Math.round(headAnchor-b.head)));
 const y=Math.max(4-b.upper,Math.min(16,180-b.bottom));
 const frame=await sharp({create:{width:cell,height:cell,channels:4,background:'#00000000'}}).composite([{input:frames[i],left:x,top:y}]).png().toBuffer();
 composed.push({input:frame,left:col*cell,top:row*cell});
}
await sharp({create:{width:cell*4,height:cell*4,channels:4,background:'#00000000'}}).composite(composed).webp({quality:88,alphaQuality:100,effort:4}).toFile(`${out}/${name}-walk.webp`);
const runtime=[];
for(let row=0;row<5;row++)for(let col=0;col<4;col++){
 const input=row===4?await sharp(`${out}/${name}.webp`).extract({left:col*cell,top:3*cell,width:cell,height:cell}).png().toBuffer():composed[[1,0,3,2][row]*4+col].input;
 runtime.push({input,left:col*cell,top:row*cell});
}
await sharp({create:{width:cell*8,height:cell*5,channels:4,background:'#00000000'}}).composite(runtime).webp({quality:88,alphaQuality:100,effort:4}).toFile(`${out}/${name}-runtime.webp`);
const manifest=JSON.parse(await readFile(`${out}/manifest.json`));manifest.sprites[`${name}-walk`]={file:`${name}-walk.webp`,columns:4,rows:4,cell,authoredLeft:true,source,alignment:'fixed scale; head centroid/foot baseline translation only'};
await writeFile(`${out}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({classId:name,authoredLeft:true,bounds}));
