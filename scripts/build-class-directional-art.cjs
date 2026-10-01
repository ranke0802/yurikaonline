// Raster-only packaging. Generation/manual art decisions live in the source map.
const sharp=require('sharp'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const args=process.argv.slice(2),value=(flag,fallback)=>{const i=args.indexOf(flag);return i<0?fallback:args[i+1]};
const configPath=value('--config','docs/class-directional-sources.json'),outDir=value('--out','reports/class-directional-art'),write=args.includes('--write');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function components(data,width,height){
 const labels=new Int32Array(width*height),parts=[];let id=0;
 for(let p=0;p<labels.length;p++){
  if(labels[p]||data[p*4+3]<16)continue;const label=++id,q=[p];labels[p]=label;let l=width,t=height,r=0,b=0;
  for(let i=0;i<q.length;i++){const k=q[i],x=k%width,y=Math.floor(k/width);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const n=ny*width+nx;if(!labels[n]&&data[n*4+3]>=16){labels[n]=label;q.push(n)}}
  }
  parts.push({id:label,left:l,top:t,right:r,bottom:b,area:q.length,cx:(l+r)/2,cy:(t+b)/2});
 }
 return{labels,parts};
}
(async()=>{
 const config=JSON.parse(fs.readFileSync(configPath));fs.mkdirSync(outDir,{recursive:true});const sources={},report={config:configPath,layout:'4 frames × 16 rows; row=group*4+direction; UP DOWN LEFT RIGHT',cellSize:256,write,scope:'Pixel packaging only. Head/weapon/feet anatomy and temporal motion require visual review.',sources:{},frames:[]};
 for(const[key,s]of Object.entries(config.sources)){
  if(!(s.scale>0))throw Error(`${key}: explicit per-sheet scale required (measure head/body reference; never normalize each frame bbox)`);
  const file=path.resolve(s.file),{data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const columns=s.columns||4,rows=s.rows||4;if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1)throw Error(`${key}: invalid grid`);
  const connected=components(data,info.width,info.height);sources[key]={...s,file,data,info,columns,rows,...connected};report.sources[key]={file,sha256:hash(fs.readFileSync(file)),width:info.width,height:info.height,columns,rows,scale:s.scale,components:connected.parts.filter(p=>p.area>32)};
 }
 // Save component inventory before any ambiguity failure, for explicit keep/drop decisions.
 fs.writeFileSync(`${outDir}/source-components.json`,JSON.stringify(report.sources,null,2));
 for(const[id,entry]of Object.entries(config.classes)){
  const rows=entry.rows||entry;if(!Array.isArray(rows)||rows.length!==16||rows.some(r=>!Array.isArray(r)||r.length!==4))throw Error(`${id}: exactly 16 rows × 4 frame mappings required`);
  const layers=[];
  for(let row=0;row<16;row++)for(let frame=0;frame<4;frame++){
   const f=rows[row][frame],s=sources[f.source];if(!s)throw Error(`${id} unknown source ${f.source}`);
   const cw=s.info.width/s.columns,ch=s.info.height/s.rows,col=f.col??frame,sr=f.row??0;
   if(col<0||col>=s.columns||sr<0||sr>=s.rows)throw Error(`${id} invalid source cell`);
   const candidates=s.parts.filter(p=>p.cx>=col*cw&&p.cx<(col+1)*cw&&p.cy>=sr*ch&&p.cy<(sr+1)*ch).sort((a,b)=>b.area-a.area);
   const body=f.bodyComponent?s.parts.find(p=>p.id===f.bodyComponent):candidates[0];if(!body||body.area<1000)throw Error(`${id} ${row}/${frame}: missing full body`);
   const keep=new Set([body.id,...(f.keepComponents||[])]),drop=new Set(f.dropComponents||[]);
   const ambiguous=candidates.filter(p=>p.area>(s.fragmentMaxArea??32)&&!keep.has(p.id)&&!drop.has(p.id));
   if(ambiguous.length&&!f.discardDetached)throw Error(`${id} ${row}/${frame}: detached components ${ambiguous.map(p=>p.id)} require explicit keepComponents/dropComponents (could be weapon)`);
   const selected=s.parts.filter(p=>keep.has(p.id));if(selected.length!==keep.size)throw Error('Unknown keep component');
   const l=Math.max(0,Math.min(...selected.map(p=>p.left))-2),t=Math.max(0,Math.min(...selected.map(p=>p.top))-2),r=Math.min(s.info.width-1,Math.max(...selected.map(p=>p.right))+2),b=Math.min(s.info.height-1,Math.max(...selected.map(p=>p.bottom))+2);
   if(!f.allowBoundary&&selected.some(p=>p.left===0||p.top===0||p.right===s.info.width-1||p.bottom===s.info.height-1))throw Error(`${id} ${row}/${frame}: source touches image boundary; cannot guarantee intact weapon`);
   const width=r-l+1,height=b-t+1,raw=Buffer.alloc(width*height*4);
   for(let y=t;y<=b;y++)for(let x=l;x<=r;x++){
    const p=y*s.info.width+x;let retain=keep.has(s.labels[p]);
    if(!retain&&s.data[p*4+3]>0&&s.data[p*4+3]<16)for(let dy=-1;dy<=1&&!retain;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<s.info.width&&ny<s.info.height&&keep.has(s.labels[ny*s.info.width+nx])){retain=true;break}}
    if(retain)s.data.copy(raw,((y-t)*width+x-l)*4,p*4,p*4+4);
   }
   const headX=f.headX??(col*cw+(s.headCenterX??cw/2)),footY=f.footY??(s.footY===undefined?body.bottom:sr*ch+s.footY),scale=s.scale;
   const w=Math.round(width*scale),h=Math.round(height*scale),x=Math.round(128+(l-headX)*scale+(f.offsetX||0)),y=Math.round(244+(t-footY)*scale+(f.offsetY||0));
   if(x<4||y<4||x+w>252||y+h>252)throw Error(`${id} ${row}/${frame}: ${x},${y},${w},${h} leaves cell safety margin; adjust sheet scale/landmarks, never crop`);
   const png=await sharp(raw,{raw:{width,height,channels:4}}).resize(w,h,{kernel:'lanczos3'}).png().toBuffer();layers.push({input:png,left:frame*256+x,top:row*256+y});
   report.frames.push({id,row,group:Math.floor(row/4),direction:['UP','DOWN','LEFT','RIGHT'][row%4],frame,source:f.source,sourceRow:sr,sourceColumn:col,components:[...keep],discarded:candidates.filter(p=>!keep.has(p.id)).map(p=>({id:p.id,area:p.area})),sourceBounds:[l,t,width,height],scale,headX,footY,landmarksExplicit:f.headX!==undefined&&f.footY!==undefined,bounds:[x,y,w,h]});
  }
  const atlas=await sharp({create:{width:1024,height:4096,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer();
  const webp=await sharp(atlas).webp({lossless:true,effort:6}).toBuffer();fs.writeFileSync(`${outDir}/${id}-actions.webp`,webp);
  await sharp(atlas).flatten({background:'#273240'}).png().toFile(`${outDir}/${id}-contact.png`);
  if(write)fs.writeFileSync(`assets/resource/classes/${id}-actions.webp`,webp);
  report[id]={sha256:hash(webp),bytes:webp.length,frames:64};
 }
 fs.writeFileSync(`${outDir}/provenance.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({output:outDir,write,frames:report.frames.length}));
})().catch(e=>{console.error(e);process.exitCode=1});
