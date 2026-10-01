// Compare final hat-only edit with the captured e044c1b baseline.
const sharp=require('sharp');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
(async()=>{
 const baseline=JSON.parse(fs.readFileSync('reports/class-motion/witch-hat-review/baseline.json'));
 const proof=[];
 for(const entry of baseline.files){
  const {data:before,info}=await sharp(entry.snapshot).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {data:after,info:next}=await sharp(entry.file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(next.width,info.width);assert.equal(next.height,info.height);
  const runtime=entry.file.includes('runtime');const sideRows=runtime?[2,3]:[2,3];
  let changedHatRoi=0,changedOutsideHatRoi=0,changedProtectedHairFace=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
   const i=(y*info.width+x)*4;
   const changed=before[i+3]!==after[i+3]||((before[i+3]||after[i+3])&&[0,1,2].some(k=>before[i+k]!==after[i+k]));
   if(!changed)continue;
   const side=sideRows.includes(Math.floor(y/192))&&x<768;
   const localY=y%192;
   if(!side||localY>=104){changedOutsideHatRoi++;continue;}
   changedHatRoi++;
   // Below the crown, red/orange hair and pale face belong to the original head.
   // This conservative protected subset supplements visual inspection of the seam.
   if(localY>=73&&before[i+3]>20&&before[i]>90&&before[i]>before[i+1]*1.35&&before[i]>before[i+2]*1.15)changedProtectedHairFace++;
  }
  assert.equal(changedOutsideHatRoi,0,'Other directions, attack, and side bodies must be unchanged');
  assert.equal(changedProtectedHairFace,0,'Original red hair/face protected pixels must be unchanged');
  assert.ok(changedHatRoi>0,'Requested hat correction must be present');
  proof.push({file:entry.file,sha256:crypto.createHash('sha256').update(fs.readFileSync(entry.file)).digest('hex'),changedHatRoi,changedOutsideHatRoi,changedProtectedHairFace});
 }
 fs.writeFileSync('reports/class-motion/witch-hat-review/pixel-preservation-proof.json',JSON.stringify({result:'passed',scope:'Visible RGB and alpha; hat ROI is a conservative bound, not permission to replace hair inside it. The protected red-hair subset is supplemented by visual seam inspection.',proof},null,2)+'\n');
 console.log(JSON.stringify(proof));
})().catch(e=>{console.error(e);process.exitCode=1;});
