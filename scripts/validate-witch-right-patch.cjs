const sharp=require('sharp');
const fs=require('node:fs');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
(async()=>{
 const proof=[];
 for(const filename of ['runtime','walk']) {
  const baseline=JSON.parse(fs.readFileSync('reports/class-motion/witch-up-review/pre-right-correction-baseline.json')).find(item=>item.source.includes(filename+'.webp'));
  const meta=await sharp(baseline.source).metadata();
  assert.equal(meta.width,baseline.width);assert.equal(meta.height,baseline.height);
  const snapshot=baseline.snapshot;
  const rows=[];
  for(const previous of baseline.rows) {
   const bytes=await sharp(baseline.source).extract({left:0,top:previous.row*meta.height/baseline.rows.length,width:meta.width,height:meta.height/baseline.rows.length}).ensureAlpha().raw().toBuffer();
   const hash=crypto.createHash('sha256').update(bytes).digest('hex');
   const unchanged=hash===previous.decodedRgbaSha256;
   const before=await sharp(snapshot).extract({left:0,top:previous.row*meta.height/baseline.rows.length,width:meta.width,height:meta.height/baseline.rows.length}).ensureAlpha().raw().toBuffer();
   let changedVisiblePixels=0,changedInvisibleRgbChannels=0;
   for(let i=0;i<bytes.length;i+=4){if(before[i+3]!==bytes[i+3] || ((before[i+3]||bytes[i+3])&&[0,1,2].some(k=>before[i+k]!==bytes[i+k])))changedVisiblePixels++;if(!before[i+3]&&!bytes[i+3])for(let k=0;k<3;k++)if(before[i+k]!==bytes[i+k])changedInvisibleRgbChannels++;}
   if(previous.direction==='right')assert.ok(changedVisiblePixels>0,'RIGHT must contain the requested replacement');
   else assert.equal(changedVisiblePixels,0,`${baseline.source} ${previous.direction} visible RGB and alpha must remain identical`);
   rows.push({row:previous.row,direction:previous.direction,rawRgbaUnchanged:unchanged,changedVisiblePixels,changedInvisibleRgbChannels,decodedRgbaSha256:hash});
  }
  proof.push({source:baseline.source,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(baseline.source)).digest('hex'),rows});
 }
 fs.writeFileSync('reports/class-motion/witch-up-review/right-row-preservation-proof.json',JSON.stringify({result:'passed',proof},null,2)+'\n');
 console.log('Witch RIGHT replacement differs; all other runtime and walk rows preserve visible RGB and alpha exactly. Fully transparent RGB normalization is reported separately.');
})().catch(error=>{console.error(error);process.exitCode=1;});
