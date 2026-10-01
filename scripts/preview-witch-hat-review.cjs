const sharp=require('sharp');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {execFileSync}=require('node:child_process');
(async()=>{const revision=process.env.QA_PREVIEW_REVISION||'hat';if(!/^[a-z-]+$/.test(revision))throw new Error('invalid revision');const out='reports/class-motion',temp=fs.mkdtempSync(path.join(os.tmpdir(),'witch-hat-preview-'));try{
 for(let f=0;f<4;f++){
  const layers=[];
  for(const [i,row]of[3,2].entries()){
   const tile=await sharp('assets/resource/classes/witch-runtime.webp').extract({left:f*192,top:row*192,width:192,height:192}).png().toBuffer();
   const label=Buffer.from(`<svg width="448" height="40"><text x="12" y="28" fill="white" font-family="sans-serif" font-size="19">GIF ${i+3} / ${row===3?'RIGHT':'LEFT'} / FRAME ${f+1}</text></svg>`);
   layers.push({input:label,left:i*448,top:0},{input:await sharp(tile).resize(384,384).png().toBuffer(),left:i*448+32,top:40},{input:await sharp(tile).resize(64,64).png().toBuffer(),left:i*448+192,top:432});
  }
  await sharp({create:{width:896,height:512,channels:4,background:'#25332e'}}).composite(layers).png().toFile(`${temp}/sides-${f}.png`);
  const all=[];for(const [ci,id]of['witch','warrior','archer'].entries())for(const [slot,row]of[1,0,3,2].entries())all.push({input:await sharp(`assets/resource/classes/${id}-runtime.webp`).extract({left:f*192,top:row*192,width:192,height:192}).resize(160,160).png().toBuffer(),left:slot*160,top:ci*160});
  await sharp({create:{width:640,height:480,channels:4,background:'#25332e'}}).composite(all).png().toFile(`${temp}/all-${f}.png`);
 }
 for(const [prefix,fps,name]of[['sides',4,`witch-sides-${revision}-revised.gif`],['all',6,`all-classes-walk-${revision}-revised.gif`]])execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',String(fps),'-i',`${temp}/${prefix}-%d.png`,'-filter_complex','[0:v]split[a][b];[a]palettegen[p];[b][p]paletteuse','-loop','0',`${out}/${name}`]);
}finally{fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
