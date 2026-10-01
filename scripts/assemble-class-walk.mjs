import sharp from 'sharp';
// Conservative cell-boundary cleanup: neighboring-row hat tips must not become feet.
async function characterBounds(cell) {
 const {data,info}=await sharp(cell).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const seen=new Uint8Array(info.width*info.height);let largest=[];
 for(let n=0;n<seen.length;n++) {
  if(seen[n] || data[n*4+3]<20)continue;
  const component=[n];seen[n]=1;
  for(let q=0;q<component.length;q++) {
   const at=component[q],x=at%info.width,y=Math.floor(at/info.width);
   for(const [xx,yy] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
    if(xx<0||yy<0||xx>=info.width||yy>=info.height)continue;
    const next=yy*info.width+xx;
    if(!seen[next]&&data[next*4+3]>=20){seen[next]=1;component.push(next);}
   }
  }
  if(component.length>largest.length)largest=component;
 }
 if(!largest.length)throw Error('Blank walk cell');
 let x1=info.width,y1=info.height,x2=0,y2=0;
 for(const n of largest){const x=n%info.width,y=Math.floor(n/info.width);x1=Math.min(x1,x);x2=Math.max(x2,x);y1=Math.min(y1,y);y2=Math.max(y2,y);}
 // Preserve the antialiased perimeter; crop only space outside the connected character.
 const left=Math.max(0,x1-1),top=Math.max(0,y1-1);
 return {left,top,width:Math.min(info.width-1,x2+1)-left+1,height:Math.min(info.height-1,y2+1)-top+1};
}
// JSON input describes each output row's source sheet/grid/row. No mirroring.
const config=JSON.parse(process.argv[2]),items=[];
for(let row=0;row<4;row++) {
 const source=config.rows[row],meta=await sharp(source.file).metadata();
 for(let col=0;col<4;col++) {
  const left=Math.round(col*meta.width/source.cols),top=Math.round(source.row*meta.height/source.rows);
  const width=Math.round((col+1)*meta.width/source.cols)-left,height=Math.round((source.row+1)*meta.height/source.rows)-top;
  // Materialize each cell before trim: sharp otherwise reorders trim before extract.
  const cell=await sharp(source.file).extract({left,top,width,height}).png().toBuffer();
  const input=await sharp(cell).extract(await characterBounds(cell)).resize({height:224,width:232,fit:'inside'}).png().toBuffer();
  const m=await sharp(input).metadata();
  items.push({input,left:col*256+Math.round((256-m.width)/2),top:row*256+240-m.height});
 }
}
await sharp({create:{width:1024,height:1024,channels:4,background:'#00000000'}}).composite(items).png().toFile(config.output);
