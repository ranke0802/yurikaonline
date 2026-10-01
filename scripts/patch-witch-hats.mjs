// Configured generated-raster hat patch. Never resize or redraw the existing body.
// Usage: node scripts/patch-witch-hats.mjs config.json
// config: {source, sourceColumns:4, sourceRows:2, orientations:{left:{sourceRow:0,sourceColumn:0, crop:{left,top,width,height},width,height,x,y},right:{...}},dryRun:true}
// Crop is source pixel coordinates; placement is within the 192px runtime cell.
// A single authored hat per direction is reused across all four poses for stable shape.
import sharp from 'sharp';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const config=JSON.parse(await fs.readFile(process.argv[2]));const cell=192;
const purple=(r,g,b)=>b>45&&b>g*1.22&&b>r*.83;
function hatMask(data,w,h){
 const mask=new Uint8Array(w*h);
 for(let x=0;x<w;x++){
  let last=-1;
  for(let y=0;y<Math.min(h,102);y++){const i=(y*w+x)*4;if(data[i+3]>32&&purple(data[i],data[i+1],data[i+2]))last=y;}
  if(last<0)continue;
  for(let y=0;y<=Math.min(103,last+3);y++)mask[y*w+x]=1;
 }
 return mask;
}
const hats={};
for(const direction of ['left','right']){
 const c=config.orientations[direction];assert.ok(c);assert.ok(c.y+c.height<=104,'Hat crop must stay above protected body');
 const png=await sharp(config.source).extract(c.crop).resize(c.width,c.height).ensureAlpha().raw().toBuffer();
 const frame=Buffer.alloc(cell*cell*4);for(let y=0;y<c.height;y++)png.copy(frame,((y+c.y)*cell+c.x)*4,y*c.width*4,(y+1)*c.width*4);
 hats[direction]={data:frame,mask:hatMask(frame,cell,cell)};
}
await fs.mkdir('reports/class-motion/witch-hat-review',{recursive:true});
for(const kind of ['runtime','walk']){
 const source=`/tmp/witch-hat-${kind}-before.webp`;const {data:before,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});const out=Buffer.from(before);
 for(const direction of ['left','right']){
  const row=kind==='runtime'?(direction==='left'?2:3):(direction==='left'?3:2),hat=hats[direction];
  for(let f=0;f<4;f++){
   const old=Buffer.alloc(cell*cell*4);for(let y=0;y<cell;y++)before.copy(old,y*cell*4,((row*cell+y)*info.width+f*cell)*4,((row*cell+y)*info.width+f*cell+cell)*4);
   const oldMask=hatMask(old,cell,cell);
   for(let y=0;y<104;y++)for(let x=0;x<cell;x++){
    const n=y*cell+x,i=n*4,j=((row*cell+y)*info.width+f*cell+x)*4;
    if(!oldMask[n]&&!hat.mask[n])continue;
    // Original non-hat contours/hair/eyes remain untouched even where candidate overlaps.
    if(!oldMask[n]&&old[i+3])continue;
    if(y>=73&&old[i+3]>20&&old[i]>90&&old[i]>old[i+1]*1.35&&old[i]>old[i+2]*1.15)continue;
    if(direction==='right' && x>=110 && x<=135 && y>=69 && y<=77 && oldMask[n] && old[i+3] && !hat.data[i+3])continue; // retain original lower brim under a transparent candidate seam
    if(hat.mask[n])hat.data.copy(out,j,i,i+4);else out.fill(0,j,j+4);
   }
   // Remove detached former-brim antialias fragments, only above the protected body.
   const seen=new Uint8Array(cell*cell),components=[];
   for(let n=0;n<seen.length;n++){
    const a=((row*cell+Math.floor(n/cell))*info.width+f*cell+n%cell)*4+3;
    if(seen[n]||!out[a])continue;const q=[n];seen[n]=1;
    for(let k=0;k<q.length;k++){const p=q[k],px=p%cell,py=Math.floor(p/cell);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=px+dx,yy=py+dy;if(xx<0||yy<0||xx>=cell||yy>=cell)continue;const v=yy*cell+xx,j=((row*cell+yy)*info.width+f*cell+xx)*4;if(!seen[v]&&out[j+3]){seen[v]=1;q.push(v);}}}
    components.push(q);
   }
   components.sort((a,b)=>b.length-a.length);
   for(const q of components.slice(1))if(q.every(n=>Math.floor(n/cell)<104))for(const n of q){const j=((row*cell+Math.floor(n/cell))*info.width+f*cell+n%cell)*4;out.fill(0,j,j+4);}
  }
 }
 const path=config.dryRun?`reports/class-motion/witch-hat-review/${kind}-candidate.webp`:`assets/resource/classes/witch-${kind}.webp`;
 await sharp(out,{raw:info}).webp({lossless:true,effort:6}).toFile(path);
 console.log(path);
}
