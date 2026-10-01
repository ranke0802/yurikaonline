import sharp from 'sharp';import fs from 'node:fs/promises';
const config=JSON.parse(await fs.readFile('reports/class-motion/witch-hat-review/patch-config.json'));
const hats={};for(const dir of ['left','right']){const c=config.orientations[dir];hats[dir]={data:await sharp(config.source).extract(c.crop).resize(c.width,c.height).ensureAlpha().raw().toBuffer(),...c};}
for(const kind of ['runtime','walk']){
const {data,info}=await sharp(`/tmp/witch-seam-${kind}-before.webp`).ensureAlpha().raw().toBuffer({resolveWithObject:true});const out=Buffer.from(data);
for(const dir of ['left','right']){const h=hats[dir],row=kind==='runtime'?(dir==='left'?2:3):(dir==='left'?3:2);
for(let x=0;x<h.width;x++){
let bottom=-1;for(let y=0;y<h.height;y++){const i=(y*h.width+x)*4;if(h.data[i+3]>32&&h.data[i+2]>45&&h.data[i+2]>h.data[i+1]*1.22&&h.data[i+2]>h.data[i]*.83)bottom=y;}
if(bottom<0)continue;
for(let y=Math.max(0,bottom-5);y<Math.min(h.height,bottom+7);y++){
 const cx=x+h.x,cy=y+h.y;if(cy<64||cy>94)continue;const i=(y*h.width+x)*4;if(!h.data[i+3])continue;
 for(let f=0;f<4;f++){const j=((row*192+cy)*info.width+f*192+cx)*4;let above=false,below=false;
 for(let dy=1;dy<=10;dy++){if(cy-dy>=0&&data[((row*192+cy-dy)*info.width+f*192+cx)*4+3]>200)above=true;if(cy+dy<192&&data[((row*192+cy+dy)*info.width+f*192+cx)*4+3]>200)below=true;}
 const interiorGap=above&&below;
 if(data[j+3]<255&&!interiorGap)continue;
 h.data.copy(out,j,i,i+4);if(data[j+3]>0)out[j+3]=data[j+3];}
}
}
}
const target=process.argv.includes('--apply')?`assets/resource/classes/witch-${kind}.webp`:`reports/class-motion/witch-seam-review/${kind}-candidate.webp`;
await sharp(out,{raw:info}).webp({lossless:true,effort:6}).toFile(target);
}
