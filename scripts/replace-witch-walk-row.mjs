import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=process.argv[2],direction=process.argv[3]||'up';if(!source||!['up','right'].includes(direction))throw Error('Expected generated four-column PNG and up/right direction');
const root='assets/resource/classes',cell=192;
await mkdir('/tmp/witch-up-review',{recursive:true});
async function bounds(buf) {
 const {data,info}=await sharp(buf).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const seen=new Uint8Array(info.width*info.height);let largest=[];
 for(let n=0;n<seen.length;n++)if(!seen[n]&&data[n*4+3]>=20){const c=[n];seen[n]=1;for(let q=0;q<c.length;q++){const p=c[q],x=p%info.width,y=Math.floor(p/info.width);for(const [a,b]of[[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(a<0||b<0||a>=info.width||b>=info.height)continue;const i=b*info.width+a;if(!seen[i]&&data[i*4+3]>=20){seen[i]=1;c.push(i);}}}if(c.length>largest.length)largest=c;}
 assert.ok(largest.length,'nonempty character');let x0=info.width,y0=info.height,x1=0,y1=0;for(const i of largest){const x=i%info.width,y=Math.floor(i/info.width);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 return {left:Math.max(0,x0-1),top:Math.max(0,y0-1),width:Math.min(info.width-1,x1+1)-Math.max(0,x0-1)+1,height:Math.min(info.height-1,y1+1)-Math.max(0,y0-1)+1};
}
const meta=await sharp(source).metadata(),parts=[];
for(let f=0;f<4;f++){const left=Math.round(f*meta.width/4),width=Math.round((f+1)*meta.width/4)-left;const png=await sharp(source).extract({left,top:0,width,height:meta.height}).png().toBuffer();const b=await bounds(png);parts.push({png,b});}
const scale=Math.min(...parts.map(p=>Math.min(164/p.b.width,154/p.b.height))),frames=[];
for(let f=0;f<4;f++){
 const p=parts[f],w=Math.round(p.b.width*scale),h=Math.round(p.b.height*scale);
 const {data}=await sharp(p.png).extract(p.b).resize(w,h).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let sx=0,n=0;for(let y=0;y<Math.floor(h*.5);y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>32){sx+=x;n++;}
 const x0=Math.max(4,Math.min(cell-w-4,Math.round(96-sx/n))),y0=180-h,frame=Buffer.alloc(cell*cell*4);
 for(let y=0;y<h;y++)data.copy(frame,((y+y0)*cell+x0)*4,y*w*4,(y+1)*w*4);
 frames.push(frame);await sharp(frame,{raw:{width:cell,height:cell,channels:4}}).png().toFile(`/tmp/witch-up-review/frame-${f}.png`);
}
const proof=[];
for(const [name,row,cols]of[['witch-runtime',direction==='up'?0:3,8],['witch-walk',direction==='up'?1:2,4]]){
 const path=`${root}/${name}.webp`,before=await readFile(path);await writeFile(`/tmp/witch-up-review/${name}-${direction}-before.webp`,before);
 const {data,info}=await sharp(before).ensureAlpha().raw().toBuffer({resolveWithObject:true});const next=Buffer.from(data);
 for(let f=0;f<4;f++)for(let y=0;y<cell;y++)frames[f].copy(next,((row*cell+y)*info.width+f*cell)*4,y*cell*4,(y+1)*cell*4);
 const encoded=await sharp(next,{raw:info}).webp({lossless:true,effort:6}).toBuffer();const after=await sharp(encoded).ensureAlpha().raw().toBuffer();
 let changedOutside=0;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){if(y>=row*cell&&y<(row+1)*cell&&x<4*cell)continue;const i=(y*info.width+x)*4;if(data[i+3]!==after[i+3] || (data[i+3]&&[0,1,2].some(k=>data[i+k]!==after[i+k])))changedOutside++;}
 assert.equal(changedOutside,0,'all other directions and attack pixels unchanged');await writeFile(path,encoded);proof.push({file:path,replacedRow:row,changedVisiblePixelsOutsideCorrectedRow:changedOutside,encoding:'lossless WebP'});
}
await writeFile(`reports/class-motion/witch-${direction}-row-isolation.json`,JSON.stringify({source,proof},null,2)+'\n');
const manifest=JSON.parse(await readFile(`${root}/manifest.json`));manifest.sprites['witch-walk'][direction==='up'?'rearSource':'rightSource']=source;delete manifest.sprites['witch-walk'].rearOnlyCorrection;manifest.sprites['witch-walk'].rowOnlyCorrections=true;await writeFile(`${root}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(proof));
