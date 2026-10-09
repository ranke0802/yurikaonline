require('../lib/qa-preflight.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('@playwright/test');
(async()=>{
 const source=fs.readFileSync('src/js/core/SoundManager.js','utf8').replace(/import Logger[^\n]*\n/,'const Logger={log(){},warn(){}};\n');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 const page=await browser.newPage();
 const result=await page.evaluate(async source=>{
  const {default:SoundManager,CLASS_AUDIO}=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
  const make=()=>{const s=new SoundManager({});s.ctx=new OfflineAudioContext(1,24000,24000);Object.defineProperty(s.ctx,'state',{value:'running'});s.masterGain=s.ctx.createGain();s.masterGain.gain.value=.4;s.masterGain.connect(s.ctx.destination);s.sfxGain=s.ctx.createGain();s.sfxGain.gain.value=.85;s.sfxGain.connect(s.masterGain);s.noiseBuffer=s._createNoiseBuffer();return s;};
  const cues=[];
  for(const name of Object.keys(CLASS_AUDIO)){
   const s=make();if(!s.playClassEvent(name,{audioId:'cast-1'}))throw Error(name+' failed');
   if(s.playClassEvent(name,{audioId:'cast-1'}))throw Error('duplicate');
   if(s.playClassEvent(name,{audioId:'cast-2'}))throw Error('same-frame pile');
   const buffer=await s.ctx.startRendering();const pcm=buffer.getChannelData(0);let energy=0,peak=0;for(const v of pcm){if(!Number.isFinite(v))throw Error('nonfinite');energy+=v*v;peak=Math.max(peak,Math.abs(v));}
   cues.push({name,peak,rms:Math.sqrt(energy/pcm.length),pcm:Array.from(pcm)});
  }
  const s=make();for(const options of [{remote:true}])if(s.playClassEvent('archer_shot',{},options))throw Error('remote played');
  s.setMuted(true);if(s.playClassEvent('archer_shot'))throw Error('muted played');
  s.setMasterVolume(.17);s.isBackgrounded=true;s.setMuted(false);if(s.masterGain.gain.value!==0||s.playClassEvent('archer_shot'))throw Error('background played');
  s.isBackgrounded=false;s._applyMasterGain();if(Math.abs(s.masterGain.gain.value-.17)>1e-6)throw Error('resume volume');
  s.setSfxVolume(0);if(s.playClassEvent('archer_shot'))throw Error('zero sfx played');
  return {cues,guards:['duplicate id','same frame','remote','mute','background','resume volume','sfx zero']};
 },source);
 const dir='reports/class-audio';fs.mkdirSync(dir,{recursive:true});
 const pcm=result.cues.flatMap(c=>[...c.pcm,...Array(6000).fill(0)]);const wav=Buffer.alloc(44+pcm.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length*2,40);pcm.forEach((x,i)=>wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,x))*32767),44+i*2));fs.writeFileSync(`${dir}/class-sfx-sampler.wav`,wav);
 result.cues.forEach((c,i)=>{delete c.pcm;c.sampleStartSeconds=i*1.25;assert.ok(c.peak>0&&c.peak<1,c.name);assert.ok(c.rms>.0001,c.name)});
 fs.writeFileSync(`${dir}/synthesis-report.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
