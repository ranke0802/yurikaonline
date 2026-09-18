const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

(async () => {
  const source = fs.readFileSync('src/js/core/SoundManager.js', 'utf8')
    .replace(/import Logger[^\n]*\n/, 'const Logger = { log(){}, warn(){} };\n');
  const scores = fs.readdirSync('assets/data/music').filter(x => x.endsWith('.json'))
    .map(name => ({ name, data: JSON.parse(fs.readFileSync(path.join('assets/data/music', name))) }));
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async ({ source, scores }) => {
      const { default: SoundManager } = await import(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
      const make = (duration = 2) => {
        const sm = new SoundManager({});
        sm.ctx = new OfflineAudioContext(2, Math.ceil(duration * 24000), 24000);
        sm.masterGain = sm.ctx.createGain(); sm.masterGain.gain.value = 0.4; sm.masterGain.connect(sm.ctx.destination);
        sm.sfxGain = sm.ctx.createGain(); sm.sfxGain.gain.value = sm.sfxVolume; sm.sfxGain.connect(sm.masterGain);
        sm.reverbNode = sm.ctx.createConvolver(); sm.reverbNode.buffer = sm._createReverbImpulse(2);
        const wet = sm.ctx.createGain(); wet.gain.value = .3; sm.reverbNode.connect(wet); wet.connect(sm.masterGain);
        sm.noiseBuffer = sm._createNoiseBuffer(); sm.isInitialized = true;
        return sm;
      };
      const output = [];
      for (const { name, data } of scores) {
        const beat = 60 / data.bpm;
        const lengths = data.tracks.map(t => t.notes.reduce((a,n) => a+n[1]*beat,0));
        const seconds = Math.max(...lengths);
        const sm = make(seconds + 3);
        const bus = sm.ctx.createGain(); bus.gain.value = sm.bgmVolume; bus.connect(sm.masterGain); bus.connect(sm.reverbNode);
        for (const t of data.tracks) {
          let time = 0;
          for (const [note, beats] of t.notes) {
            let instr = t.instrument || t.type || 'square';
            if (instr === 'noise_percussion') instr = {kick:'drum_kick',snare:'drum_snare',tick:'drum_hat',hihat:'drum_hat'}[note];
            if (note !== 'R') {
              if (!instr) throw Error(`${name}: unknown percussion ${note}`);
              const frequency = instr.startsWith('drum_') ? 110 : sm.notes[note];
              if (!Number.isFinite(frequency)) throw Error(`${name}: unknown note ${note}`);
              sm._playInstrument(instr, frequency, time, beats*beat, t.gain, bus);
            }
            time += beats*beat;
          }
        }
        const buffer = await sm.ctx.startRendering();
        let peak = 0, energy = 0;
        for (const x of buffer.getChannelData(0)) { if (!Number.isFinite(x)) throw Error('Nonfinite sample'); peak=Math.max(peak,Math.abs(x)); energy+=x*x; }
        if (peak === 0 || peak >= 1) throw Error(`${name}: silent or clipping: ${peak}`);
        output.push({ name, seconds: +seconds.toFixed(2), peak: +peak.toFixed(3), rms: +Math.sqrt(energy/buffer.length).toFixed(4), remainingVoices: sm.activeNodes.length });
      }
      // Real browser synthesis validates legal oscillator types for formerly broken cues.
      const sm = make(5);
      Object.defineProperty(sm.ctx, 'state', { value: 'running', configurable: true });
      for (const id of ['item_pickup','crit','boss_spawn','monster_charge','sfx_slime_hit','sfx_boss_attack','fireball_explosion']) sm.playSfx(id);
      if (sm.activeNodes.length !== 0) throw Error('SFX entered BGM voice registry');
      const saved = sm.sfxLastPlayed.size;
      sm.playSfx('fireball_explosion');
      if (sm.sfxLastPlayed.size !== saved) throw Error('SFX dedup failed');
      await sm.ctx.startRendering();
      // Tiny score exercises looping/mute state without waiting for a whole field song.
      const muted = make(); muted.isMuted = true;
      muted.playBgm({bpm:120, loop:false, tracks:[{instrument:'sine',gain:.1,notes:[['C4',1]]}]}, 'muted');
      muted.setMuted(false);
      if (muted.currentBgmId !== 'muted') throw Error('Mute lost BGM state');
      muted.stopBgm();
      // Out-of-order network loads cannot replace the latest requested track.
      const race = make(); const resolves = {};
      race.resourceManager = {loadJSON: id => new Promise(resolve => resolves[id] = resolve)};
      const played = []; race.playBgm = (data,id) => played.push(id);
      const a=race.loadAndPlayBgm('old'), b=race.loadAndPlayBgm('new');
      resolves['/assets/data/music/new.json']({}); await b;
      resolves['/assets/data/music/old.json']({}); await a;
      if (played.join() !== 'new') throw Error('Stale load won');
      const clock = make(); let now = 0;
      Object.defineProperty(clock.ctx, 'state', {value:'running'});
      Object.defineProperty(clock.ctx, 'currentTime', {get:()=>now});
      const timers = [], calls = [];
      const originalTimeout = window.setTimeout;
      window.setTimeout = fn => {timers.push(fn);return timers.length;};
      try {
        clock._playInstrument = (...args) => calls.push(args);
        clock.playBgm({bpm:120,tracks:[{instrument:'triangle_bass',gain:.1,notes:[['B1',1],['C2',1]]}]},'loop');
        if (calls.length !== 1) throw Error('Scheduler allocated beyond lookahead');
        now=.45;timers.pop()(); now=.95;timers.pop()();
        if (calls.length!==3 || Math.abs(calls[2][2]-1.05)>.001) throw Error('Loop timing drift');
        const id=clock.currentBgmId; clock.setMuted(true); now=1.45;timers.pop()(); clock.setMuted(false);
        if(clock.currentBgmId!==id) throw Error('Loop lost muted BGM');
        clock.stopBgm();
      } finally {window.setTimeout=originalTimeout;}
      return {scores:output, checks:['native synthesis','finite samples, nonzero output, peak below 1','SFX/BGM voice isolation','mute state','latest BGM request wins','200 ms allocation horizon','audio-clock loop continuity']};
    }, { source, scores });
    for (const score of result.scores) assert.equal(score.remainingVoices, 0, score.name);
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
})().catch(e => {console.error(e.message);process.exitCode=1;});
