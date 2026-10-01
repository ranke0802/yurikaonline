const sharp = require('sharp');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const OUT = 'reports/class-motion';
async function preview(classes, filename, directions = [0,1,2,3]) {
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'class-motion-preview-'));
 try {
  for(let frame=0;frame<4;frame++) {
   const layers=[];
   for(const [index,id] of classes.entries()) {
    const source=`assets/resource/classes/${id}-walk.webp`,meta=await sharp(source).metadata();
    for(const [slot,direction] of directions.entries()) layers.push({input:await sharp(source).extract({left:frame*meta.width/4,top:direction*meta.height/4,width:meta.width/4,height:meta.height/4}).resize(160,160).png().toBuffer(),left:slot*160,top:index*160});
   }
   await sharp({create:{width:directions.length*160,height:classes.length*160,channels:4,background:'#25332e'}}).composite(layers).png().toFile(`${temp}/${frame}.png`);
  }
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','6','-i',`${temp}/%d.png`,'-filter_complex','[0:v]split[a][b];[a]palettegen[p];[b][p]paletteuse','-loop','0',`${OUT}/${filename}`]);
 } finally { fs.rmSync(temp,{recursive:true,force:true}); }
}
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});
 await preview(['witch','warrior','archer'],'all-classes-walk-corrected.gif');
 await preview(['witch'],'witch-side-walk-corrected.gif',[2,3]);
 await preview(['warrior'],'warrior-approved-four-directions.gif');
 console.log('Updated current packed walk previews: rows Witch/Warrior/Archer; columns front/back/right/left.');
})().catch(error=>{console.error(error);process.exitCode=1;});
