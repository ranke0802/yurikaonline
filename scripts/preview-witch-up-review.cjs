const sharp=require('sharp');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {execFileSync}=require('node:child_process');
const out='reports/class-motion';
(async()=>{const temp=fs.mkdtempSync(path.join(os.tmpdir(),'witch-up-preview-'));try{
 const contact=[];
 for(let f=0;f<4;f++){
  const tile=await sharp('assets/resource/classes/witch-runtime.webp').extract({left:f*192,top:0,width:192,height:192}).png().toBuffer();
  const label=Buffer.from(`<svg width="512" height="40"><text x="16" y="28" fill="white" font-family="sans-serif" font-size="20">WITCH UP — FRAME ${f+1}/4 — 2 FPS</text></svg>`);
  await sharp({create:{width:512,height:440,channels:4,background:'#25332e'}}).composite([{input:label,left:0,top:0},{input:await sharp(tile).resize(64,64).png().toBuffer(),left:16,top:320},{input:await sharp(tile).resize(384,384).png().toBuffer(),left:112,top:48}]).png().toFile(`${temp}/slow-${f}.png`);
  contact.push({input:tile,left:f*192,top:0});
  const layers=[];
  for(const [ci,id]of['witch','warrior','archer'].entries())for(const [slot,row]of[1,0,3,2].entries())layers.push({input:await sharp(`assets/resource/classes/${id}-runtime.webp`).extract({left:f*192,top:row*192,width:192,height:192}).resize(160,160).png().toBuffer(),left:slot*160,top:ci*160});
  await sharp({create:{width:640,height:480,channels:4,background:'#25332e'}}).composite(layers).png().toFile(`${temp}/all-${f}.png`);
 }
 await sharp({create:{width:768,height:192,channels:4,background:'#25332e'}}).composite(contact).png().toFile(`${out}/witch-up-revised-contact.png`);
 for(const [prefix,fps,name]of[['slow',2,'witch-up-revised-slow.gif'],['all',6,'all-classes-walk-up-revised.gif']])execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',String(fps),'-i',`${temp}/${prefix}-%d.png`,'-filter_complex','[0:v]split[a][b];[a]palettegen[p];[b][p]paletteuse','-loop','0',`${out}/${name}`]);
}finally{fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
