const sharp=require('sharp'),fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{const proof=[];for(const kind of ['runtime','walk']){
const baseline=`/tmp/witch-seam-${kind}-before.webp`,file=process.env.QA_SEAM_CANDIDATE?`reports/class-motion/witch-seam-review/${kind}-candidate.webp`:`assets/resource/classes/witch-${kind}.webp`;
const {data:a,info}=await sharp(baseline).ensureAlpha().raw().toBuffer({resolveWithObject:true});const b=await sharp(file).ensureAlpha().raw().toBuffer();assert.equal(a.length,b.length);let changed=0,outside=0,face=0,outerAlpha=0,filledInternalGap=0;
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
const i=(y*info.width+x)*4,cy=y%192,row=Math.floor(y/192),same=a[i+3]===b[i+3]&&(!a[i+3]||[0,1,2].every(k=>a[i+k]===b[i+k]));if(same)continue;changed++;
if(![2,3].includes(row)||x>=768||cy<64||cy>94)outside++;
if(a[i]>180&&a[i+1]>130&&a[i+2]>90&&cy>78)face++;
if(a[i+3]!==b[i+3]){let above=false,below=false;for(let dy=1;dy<=10;dy++){if(cy-dy>=0&&a[((y-dy)*info.width+x)*4+3]>200)above=true;if(cy+dy<192&&a[((y+dy)*info.width+x)*4+3]>200)below=true;}if(!a[i+3]&&above&&below)filledInternalGap++;else outerAlpha++;}
}
assert.ok(changed>0);assert.equal(outside,0);assert.equal(face,0);assert.equal(outerAlpha,0);
proof.push({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),changedContactPixels:changed,changedOutsideContact:outside,changedLightFacePixels:face,changedOuterAlpha:outerAlpha,filledInternalGap});}
fs.writeFileSync('reports/class-motion/witch-seam-review/pixel-proof.json',JSON.stringify({result:'passed',baselineCommit:'55ed273',scope:'Contact band at y64..94 in LEFT/RIGHT only. Crown, other directions, attack and body unchanged. Interior alpha holes may fill; original nonzero alpha and external contour alpha remain unchanged. Face color subset supplements visual identity checks.',proof},null,2)+'\n');console.log(proof);
})().catch(e=>{console.error(e);process.exitCode=1;});
