const sharp=require('sharp'),fs=require('node:fs');
const sources={witch:'exec-0a885db9-6bec-419d-97b1-0eda892a0836',warrior:'exec-a6a7abc5-9628-4aff-9641-2a97040c1067',archer:'exec-39ec243c-ad0c-4819-8720-07c874a41350'};
(async()=>{const report={layout:'4x4,256px cell; anticipation/contact/followthrough/recovery',scale:.55,drawSize:160,sources:{},frames:[]};for(const[id,source]of Object.entries(sources)){
 const path=`/workspace/generated_images/${source}.png`,{data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const labels=new Int32Array(info.width*info.height),parts=[];let serial=0;
 for(let p=0;p<labels.length;p++){if(labels[p]||data[p*4+3]<24)continue;const label=++serial,q=[p];labels[p]=label;let head=0,l=info.width,t=info.height,r=0,b=0;
 while(head<q.length){const a=q[head++],x=a%info.width,y=Math.floor(a/info.width);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);for(const n of[a-1,a+1,a-info.width,a+info.width])if(n>=0&&n<labels.length&&!labels[n]&&Math.abs(n%info.width-x)<=1&&data[n*4+3]>=24){labels[n]=label;q.push(n);}}
 if(q.length>1000)parts.push({label,l,t,r,b,area:q.length});}
 if(parts.length!==16)throw Error(`${id}: expected 16 separate full bodies, got ${parts.length}`);
 const layers=[];for(const originalPart of parts){let part=originalPart;const row=Math.min(3,Math.floor((part.t+part.b)/2/(info.height/4))),col=Math.min(3,Math.floor((part.l+part.r)/2/(info.width/4)));
 const sourceCol=id==='archer'&&row<2&&col===2?1:col;
 if(sourceCol!==col)part=parts.find(p=>Math.floor((p.t+p.b)/2/(info.height/4))===row&&Math.floor((p.l+p.r)/2/(info.width/4))===sourceCol);
 const left=Math.max(0,part.l-2),top=Math.max(0,part.t-2),w=Math.min(info.width,part.r+3)-left,h=Math.min(info.height,part.b+3)-top,raw=Buffer.alloc(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const pos=(top+y)*info.width+left+x;if(labels[pos]===part.label) data.copy(raw,(y*w+x)*4,pos*4,pos*4+4);else if(data[pos*4+3]<24){let near=false;for(const dy of[-1,0,1])for(const dx of[-1,0,1])if(labels[pos+dy*info.width+dx]===part.label)near=true;if(near)data.copy(raw,(y*w+x)*4,pos*4,pos*4+4);}}
 const width=Math.round(w*.55),height=Math.round(h*.55),x=Math.round(128+(left-(sourceCol+.5)*info.width/4)*.55),y=244-height-(id==='archer'&&row===3&&col===1?30:0);
 if(x<6||x+width>250||y<6)throw Error(`${id} cell margin ${row}/${col}: ${x},${y},${width}`);
 layers.push({input:await sharp(raw,{raw:{width:w,height:h,channels:4}}).resize(width,height).png().toBuffer(),left:col*256+x,top:row*256+y});
 report.frames.push({id,row,col,sourceCol,sourceBounds:[left,top,w,h],bounds:[x,y,width,height],area:part.area});}
 await sharp({create:{width:1024,height:1024,channels:4,background:'#00000000'}}).composite(layers).webp({lossless:true,effort:6}).toFile(`assets/resource/classes/${id}-actions.webp`);report.sources[id]=source;
 }fs.writeFileSync('reports/class-actions/art-provenance.json',JSON.stringify(report,null,2));})();
