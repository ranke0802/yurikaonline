import Logger from '../utils/Logger.js';

/**
 * SoundManager (v0.00.62: Flashy & Polish)
 * Features:
 * - FM Synthesis: Brass, Strings, Bells (Rich Textures)
 * - Arpeggiation Support
 * - Clean Percussion (No Static)
 * - Global Reverb + Stereo Delay
 */
export default class SoundManager {
    constructor(resourceManager) {
        this.resourceManager = resourceManager;
        this.ctx = null;
        this.masterGain = null;
        this.reverbNode = null;
        this.activeNodes = []; // Track all nodes for cleanup
        this.currentBgmId = null;
        this.bgmLoopTimer = null;

        this.isMuted = false;
        this.masterVolume = 0.4;
        this.isInitialized = false;

        this.notes = {
            'C2': 65.41, 'C#2': 69.30, 'D2': 73.42, 'D#2': 77.78, 'E2': 82.41, 'F2': 87.31, 'F#2': 92.50, 'G2': 98.00, 'G#2': 103.83, 'A2': 110.00, 'A#2': 116.54, 'B2': 123.47,
            'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
            'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
            'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99, 'G#5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'B5': 987.77,
            'C6': 1046.50, 'D6': 1174.66, 'E6': 1318.51, 'G6': 1567.98
        };

        // Bind user interaction
        const unlock = () => {
            this.initOrResume();
            window.removeEventListener('click', unlock);
            window.removeEventListener('keydown', unlock);
            window.removeEventListener('touchstart', unlock);
        };
        window.addEventListener('click', unlock);
        window.addEventListener('keydown', unlock);
        window.addEventListener('touchstart', unlock);

        this.noiseBuffer = null;
        this.reverbBuffer = null;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();

                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.value = this.isMuted ? 0 : this.masterVolume;

                // Global Reverb (Convolver)
                this.reverbNode = this.ctx.createConvolver();
                this.reverbBuffer = this._createReverbImpulse(2.0); // 2s Tail (Cathedral)
                this.reverbNode.buffer = this.reverbBuffer;

                const reverbWet = this.ctx.createGain();
                reverbWet.gain.value = 0.3; // 30% Wet

                this.masterGain.connect(this.ctx.destination);
                this.reverbNode.connect(reverbWet);
                reverbWet.connect(this.masterGain); // Parallel processing handled in playInstrument

                // Clean Noise Buffer
                this.noiseBuffer = this._createNoiseBuffer();

                this.isInitialized = true;
                Logger.log('[SoundManager] Flashy Audio Engine Initialized');
            }
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            return this.ctx.resume().then(() => {
                Logger.log('[SoundManager] Audio Context Resumed');
            }).catch(e => {
                // Ignore errors if resume is called without gesture
            });
        }
        return Promise.resolve();
    }

    setMasterVolume(volume = 0.4) {
        const safeVolume = Math.min(1, Math.max(0, Number(volume) || 0));
        this.masterVolume = safeVolume;
        if (this.masterGain) {
            this.masterGain.gain.value = this.isMuted ? 0 : safeVolume;
        }
    }

    setMuted(muted = false) {
        this.isMuted = !!muted;
        if (this.masterGain) {
            this.masterGain.gain.value = this.isMuted ? 0 : this.masterVolume;
        }
    }

    // Legacy support alias
    initOrResume() {
        this.init();
        // Do NOT auto-resume here to prevent warnings. 
        // Resume must be called explicitly by user interaction handlers.
    }

    _createNoiseBuffer() {
        const size = this.ctx.sampleRate;
        const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * 0.5; // Softer noise
        return buffer;
    }

    _createReverbImpulse(duration) {
        const rate = this.ctx.sampleRate;
        const length = rate * duration;
        const impulse = this.ctx.createBuffer(2, length, rate);
        const L = impulse.getChannelData(0);
        const R = impulse.getChannelData(1);
        for (let i = 0; i < length; i++) {
            const decay = Math.pow(1 - i / length, 3.0); // Stronger decay
            L[i] = (Math.random() * 2 - 1) * decay;
            R[i] = (Math.random() * 2 - 1) * decay;
        }
        return impulse;
    }

    async loadAndPlayBgm(id) {
        if (!this.isInitialized) return;
        if (this.currentBgmId === id) return;

        try {
            const data = await this.resourceManager.loadJSON(`/assets/data/music/${id}.json`);
            this.playBgm(data, id);
        } catch (e) {
            Logger.warn(`[SoundManager] Fail BGM: ${id}`, e);
        }
    }

    stopBgm() {
        if (this.bgmLoopTimer) {
            clearTimeout(this.bgmLoopTimer);
            this.bgmLoopTimer = null;
        }
        this.activeNodes.forEach(n => {
            try { n.stop(); n.disconnect(); } catch (e) { }
        });
        this.activeNodes = [];
        this.currentBgmId = null;
    }

    playBgm(data, id) {
        this.stopBgm();
        if (this.isMuted || !this.ctx) return;
        this.currentBgmId = id;

        const bpm = data.bpm || 120;
        const beatDur = 60 / bpm;

        // Calculate Loop Length
        let maxTime = 0;
        data.tracks.forEach(t => {
            let tm = 0;
            t.notes.forEach(n => tm += n[1] * beatDur);
            if (tm > maxTime) maxTime = tm;
        });

        const play = (startTime) => {
            data.tracks.forEach(track => {
                let time = startTime;
                const instr = track.instrument || 'square';
                const vol = track.gain || 0.1;

                track.notes.forEach(([note, durBeats]) => {
                    const duration = durBeats * beatDur;
                    if (note !== 'R') {
                        const freq = this.notes[note] || 440;
                        this._playInstrument(instr, freq, time, duration, vol);
                    }
                    time += duration;
                });
            });
        };

        const now = this.ctx.currentTime + 0.05;
        play(now);

        if (data.loop !== false) {
            const loopMs = maxTime * 1000;
            this.bgmLoopTimer = setTimeout(() => {
                this.playBgm(data, id);
            }, Math.max(0, loopMs - 50));
        }
    }

    // --- Flashy Instrument Synthesizer ---
    _playInstrument(instr, freq, time, dur, vol) {
        const dest = this.masterGain;
        const dry = this.ctx.createGain();
        dry.gain.value = 1.0;
        dry.connect(dest);

        // Send to Reverb
        dry.connect(this.reverbNode);

        const nodes = [];
        const reg = (n) => { nodes.push(n); this.activeNodes.push(n); };

        switch (instr) {
            case 'fm_brass': { // Heroic / Flashy
                // Modulator: Sawtooth -> Carrier: Square
                const car = this.ctx.createOscillator();
                const mod = this.ctx.createOscillator();
                const modG = this.ctx.createGain();
                const env = this.ctx.createGain();

                car.type = 'sawtooth';
                mod.type = 'sawtooth';

                car.frequency.setValueAtTime(freq, time);
                mod.frequency.setValueAtTime(freq, time); // 1:1 Ratio

                modG.gain.setValueAtTime(500, time);
                modG.gain.exponentialRampToValueAtTime(10, time + 0.2); // "Brzzzt" attack

                env.gain.setValueAtTime(0, time);
                env.gain.linearRampToValueAtTime(vol, time + 0.05);
                env.gain.exponentialRampToValueAtTime(0.01, time + dur);

                mod.connect(modG); modG.connect(car.frequency);
                car.connect(env); env.connect(dry);

                car.start(time); mod.start(time);
                car.stop(time + dur); mod.stop(time + dur);
                reg(car); reg(mod);
                break;
            }
            case 'fm_bell': { // Magical
                const car = this.ctx.createOscillator();
                const mod = this.ctx.createOscillator();
                const modG = this.ctx.createGain();
                const env = this.ctx.createGain();

                car.type = 'sine'; mod.type = 'sine';
                car.frequency.value = freq;
                mod.frequency.value = freq * 3.5; // Non-integer ratio for glassy sound

                modG.gain.setValueAtTime(1000, time);
                modG.gain.exponentialRampToValueAtTime(1, time + 1.0);

                env.gain.setValueAtTime(0, time);
                env.gain.linearRampToValueAtTime(vol * 1.5, time + 0.01);
                env.gain.exponentialRampToValueAtTime(0.001, time + dur * 2.0); // Long tail

                mod.connect(modG); modG.connect(car.frequency);
                car.connect(env); env.connect(dry);

                car.start(time); mod.start(time);
                car.stop(time + dur * 2); mod.stop(time + dur * 2);
                reg(car); reg(mod);
                break;
            }
            case 'rich_string': { // Lush
                [0, 8, -8].forEach(detune => {
                    const osc = this.ctx.createOscillator();
                    const env = this.ctx.createGain();
                    osc.type = 'sawtooth';
                    osc.frequency.value = freq;
                    osc.detune.value = detune;

                    env.gain.setValueAtTime(0, time);
                    env.gain.linearRampToValueAtTime(vol * 0.3, time + 0.2); // Slow attack
                    env.gain.setValueAtTime(vol * 0.3, time + dur - 0.1);
                    env.gain.linearRampToValueAtTime(0, time + dur + 0.2);

                    osc.connect(env); env.connect(dry);
                    osc.start(time); osc.stop(time + dur + 0.2);
                    reg(osc);
                });
                break;
            }
            case 'warp_bass': { // Wobble Bass
                const osc = this.ctx.createOscillator();
                const filter = this.ctx.createBiquadFilter();
                const env = this.ctx.createGain();

                osc.type = 'sawtooth';
                osc.frequency.value = freq;

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(freq * 2, time);
                filter.Q.value = 5;
                filter.frequency.linearRampToValueAtTime(freq * 8, time + dur); // Wah effect

                env.gain.value = vol;

                osc.connect(filter); filter.connect(env); env.connect(dry);
                osc.start(time); osc.stop(time + dur);
                reg(osc);
                break;
            }
            case 'harp': {
                const osc = this.ctx.createOscillator();
                const env = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.value = freq;

                env.gain.setValueAtTime(0, time);
                env.gain.linearRampToValueAtTime(vol, time + 0.01);
                env.gain.exponentialRampToValueAtTime(0.01, time + 0.5); // Short pluck

                osc.connect(env); env.connect(dry);
                osc.start(time); osc.stop(time + 0.5);
                reg(osc);
                break;
            }
            case 'drum_kick': {
                const osc = this.ctx.createOscillator();
                const env = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(150, time);
                osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.1); // Pitch drop
                env.gain.setValueAtTime(vol * 2, time);
                env.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
                osc.connect(env); env.connect(dry);
                osc.start(time); osc.stop(time + 0.1);
                reg(osc);
                break;
            }
            case 'drum_snare': {
                // No Static! Use filtered noise burst + body
                this._noise(time, 0.15, vol, dry, 2000); // Filtered snap
                const body = this.ctx.createOscillator();
                const bEnv = this.ctx.createGain();
                body.frequency.setValueAtTime(200, time);
                body.frequency.linearRampToValueAtTime(100, time + 0.1);
                bEnv.gain.setValueAtTime(vol, time);
                bEnv.gain.linearRampToValueAtTime(0, time + 0.1);
                body.connect(bEnv); bEnv.connect(dry);
                body.start(time); body.stop(time + 0.1);
                reg(body);
                break;
            }
            default: // Square Lead
                const osc = this.ctx.createOscillator();
                const env = this.ctx.createGain();
                osc.type = 'square';
                osc.frequency.value = freq;
                env.gain.setValueAtTime(vol, time);
                env.gain.linearRampToValueAtTime(0, time + dur);
                osc.connect(env); env.connect(dry);
                osc.start(time); osc.stop(time + dur);
                reg(osc);
        }
    }

    _noise(time, dur, vol, dest, freq) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vol, time);
        g.gain.exponentialRampToValueAtTime(0.01, time + dur);
        src.connect(f); f.connect(g); g.connect(dest);
        src.start(time); src.stop(time + dur);
    }

    _tone(t, type, f, d, v, dest) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type; osc.frequency.value = f;
        g.gain.setValueAtTime(v, t); g.gain.linearRampToValueAtTime(0, t + d);
        osc.connect(g); g.connect(dest);
        osc.start(t); osc.stop(t + d);
    }
    _slide(t, type, fs, fe, d, v, dest) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(fs, t);
        osc.frequency.linearRampToValueAtTime(fe, t + d);
        g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.01, t + d);
        osc.connect(g); g.connect(dest);
        osc.start(t); osc.stop(t + d);
    }

    playSfx(type) {
        if (!this.ctx) this.init(); // Create if missing
        if (!this.ctx || this.ctx.state !== 'running') return; // Silent fail if disabled/suspended
        const now = this.ctx.currentTime;
        // Direct to Reverb for SFX space too? No, keep SFX punchy, mostly dry.
        const gain = this.ctx.createGain();
        gain.connect(this.masterGain);

        switch (type) {
            // UI Sounds
            case 'ui_click': this._tone(now, 'square', 1200, 0.08, 0.12, gain); break;
            case 'ui_hover': this._tone(now, 'sine', 800, 0.04, 0.06, gain); break;
            case 'ui_close': this._slide(now, 'sine', 800, 400, 0.1, 0.1, gain); break;
            case 'ui_error': this._tone(now, 'sawtooth', 150, 0.3, 0.2, gain); break;
            case 'ui_open': this._tone(now, 'sine', 600, 0.15, 0.1, gain); break;
            case 'ui_back': this._slide(now, 'sine', 400, 200, 0.1, 0.08, gain); break;
            case 'ui_type': this._noise(now, 0.01, 0.05, gain, 3000); break; // keypress click
            case 'ui_chat_send': this._playInstrument('fm_bell', 880, now, 0.3, 0.1); break; // sent chime

            // Item/Equipment Sounds
            case 'ui_equip': this._noise(now, 0.1, 0.1, gain, 2000); this._tone(now, 'square', 1200, 0.05, 0.1, gain); break;
            case 'item_loot': this._tone(now, 'sine', 1500, 0.1, 0.2, gain); this._tone(now + 0.1, 'sine', 2000, 0.2, 0.2, gain); break;
            case 'item_pickup': this._tone(now, 'fm_bell', 2000, 0.1, 0.15, gain); break;
            case 'inventory_open': this._tone(now, 'sine', 500, 0.1, 0.08, gain); break;
            case 'enhance_charge':
                this._noise(now, 0.06, 0.12, gain, 4200);
                this._slide(now, 'triangle', 520, 1180, 0.24, 0.14, gain);
                this._tone(now + 0.04, 'sine', 1320, 0.12, 0.08, gain);
                break;
            case 'enhance_success':
                this._noise(now, 0.05, 0.1, gain, 6800);
                this._tone(now, 'sine', 1480, 0.12, 0.11, gain);
                this._tone(now + 0.06, 'triangle', 1980, 0.14, 0.08, gain);
                break;
            case 'enhance_keep':
                this._noise(now, 0.04, 0.08, gain, 2600);
                this._slide(now, 'sine', 1240, 560, 0.28, 0.1, gain);
                this._tone(now + 0.03, 'triangle', 780, 0.16, 0.06, gain);
                break;
            case 'enhance_fail':
                this._noise(now, 0.16, 0.22, gain, 1800);
                this._slide(now, 'sawtooth', 420, 120, 0.28, 0.16, gain);
                this._tone(now + 0.02, 'square', 160, 0.12, 0.09, gain);
                break;
            case 'enhance_tier_7':
                this._tone(now, 'sine', 980, 0.18, 0.1, gain);
                this._tone(now + 0.05, 'triangle', 1280, 0.16, 0.08, gain);
                this._noise(now, 0.04, 0.08, gain, 5200);
                break;
            case 'enhance_tier_8':
                this._tone(now, 'sine', 1120, 0.18, 0.09, gain);
                this._tone(now + 0.04, 'sine', 1680, 0.18, 0.08, gain);
                this._noise(now, 0.04, 0.08, gain, 6200);
                break;
            case 'enhance_tier_9':
                this._noise(now, 0.08, 0.12, gain, 3400);
                this._slide(now, 'sawtooth', 960, 1480, 0.22, 0.12, gain);
                this._tone(now + 0.05, 'square', 620, 0.18, 0.08, gain);
                break;
            case 'enhance_tier_10':
                this._tone(now, 'sine', 1320, 0.2, 0.12, gain);
                this._tone(now + 0.05, 'sine', 1760, 0.18, 0.1, gain);
                this._tone(now + 0.1, 'triangle', 2240, 0.18, 0.08, gain);
                this._noise(now, 0.05, 0.09, gain, 7600);
                break;

            // Environmental Sounds
            case 'footstep_grass':
                // Soft noise burst + low thud
                this._noise(now, 0.05, 0.1, gain, 800);
                this._tone(now, 'square', 100, 0.05, 0.05, gain);
                break;

            // Level/Progress Sounds
            case 'level_up': this._playInstrument('fm_brass', 523, now, 0.5, 0.3); break;
            case 'exp_gain': this._tone(now, 'sine', 1000, 0.05, 0.05, gain); break;
            case 'quest_complete': this._playInstrument('fm_bell', 880, now, 1.0, 0.2); break;

            // Combat Sounds - Player (Enhanced Impact)
            case 'hit':
                // Multi-layered impact sound
                this._noise(now, 0.08, 0.25, gain, 2000);
                this._tone(now, 'square', 150, 0.15, 0.2, gain);
                this._tone(now + 0.02, 'sawtooth', 100, 0.1, 0.15, gain);
                break;
            case 'player_attack':
                // Swish + impact
                this._slide(now, 'sawtooth', 400, 200, 0.12, 0.15, gain);
                this._noise(now + 0.05, 0.05, 0.1, gain, 3000);
                break;
            case 'player_damage':
                // Heavy impact with grunt-like noise
                this._noise(now, 0.2, 0.3, gain, 800);
                this._slide(now, 'sawtooth', 200, 80, 0.25, 0.25, gain);
                this._tone(now + 0.05, 'square', 120, 0.15, 0.15, gain);
                break;
            case 'player_death':
                // Dramatic death sound
                this._slide(now, 'sawtooth', 300, 60, 1.0, 0.3, gain);
                this._noise(now, 0.5, 0.25, gain, 600);
                break;
            case 'shield_block':
                // Metallic block sound
                this._tone(now, 'sine', 600, 0.15, 0.2, gain);
                this._tone(now + 0.05, 'sine', 900, 0.1, 0.15, gain);
                this._noise(now, 0.1, 0.1, gain, 2500);
                break;

            // Combat Sounds - Skills (Epic Enhanced)
            case 'fireball_cast':
                // Heavy ignition with low-end rumble
                this._noise(now, 0.22, 0.2, gain, 900);
                this._noise(now + 0.04, 0.18, 0.16, gain, 520);
                this._slide(now, 'sawtooth', 170, 78, 0.28, 0.28, gain);
                this._slide(now + 0.03, 'triangle', 240, 120, 0.24, 0.16, gain);
                this._tone(now + 0.02, 'square', 92, 0.18, 0.12, gain);
                break;
            case 'fireball_explosion':
                // Deep explosive boom with debris crack
                this._noise(now, 0.42, 0.46, gain, 260);
                this._noise(now + 0.02, 0.28, 0.24, gain, 1800);
                this._slide(now, 'sawtooth', 140, 42, 0.48, 0.34, gain);
                this._slide(now + 0.01, 'triangle', 96, 34, 0.55, 0.22, gain);
                this._tone(now + 0.015, 'square', 68, 0.24, 0.14, gain);
                break;
            case 'deep_shock':
                // Low, weighty electric hit with minimal fizz
                this._slide(now, 'sawtooth', 280, 118, 0.18, 0.13, gain);
                this._slide(now + 0.012, 'triangle', 190, 88, 0.24, 0.11, gain);
                this._tone(now + 0.018, 'square', 74, 0.13, 0.055, gain);
                this._slide(now + 0.02, 'square', 760, 340, 0.08, 0.03, gain);
                break;
            case 'storm_core':
                // Broader low-end arc with a rolling body
                this._slide(now, 'sawtooth', 340, 132, 0.2, 0.12, gain);
                this._slide(now + 0.01, 'square', 620, 240, 0.12, 0.045, gain);
                this._tone(now + 0.024, 'triangle', 92, 0.16, 0.05, gain);
                this._tone(now + 0.05, 'sine', 138, 0.1, 0.035, gain);
                break;
            case 'coil_burst':
                // Tight, thick electrical punch without hiss
                this._slide(now, 'square', 430, 176, 0.11, 0.11, gain);
                this._slide(now + 0.012, 'triangle', 210, 96, 0.15, 0.08, gain);
                this._tone(now + 0.018, 'square', 84, 0.11, 0.045, gain);
                this._slide(now + 0.026, 'sawtooth', 880, 420, 0.06, 0.028, gain);
                break;
            case 'arc_pulse':
                // Rounded electric pulse with a lower center of gravity
                this._tone(now, 'triangle', 104, 0.18, 0.055, gain);
                this._slide(now + 0.006, 'square', 720, 220, 0.11, 0.075, gain);
                this._slide(now + 0.02, 'sawtooth', 260, 120, 0.16, 0.07, gain);
                this._tone(now + 0.04, 'sine', 82, 0.1, 0.03, gain);
                break;
            case 'classic_arc':
                // Legacy bright crackle for players who still want the old feel
                this._noise(now, 0.05, 0.24, gain, 6400);
                this._noise(now + 0.018, 0.06, 0.2, gain, 4200);
                this._noise(now + 0.043, 0.07, 0.16, gain, 2400);
                this._slide(now, 'square', 2600, 1100, 0.08, 0.18, gain);
                this._slide(now + 0.02, 'sawtooth', 1800, 620, 0.12, 0.14, gain);
                this._tone(now + 0.028, 'square', 1320, 0.05, 0.1, gain);
                this._noise(now, 0.035, 0.14, gain, 7200);
                this._noise(now + 0.015, 0.03, 0.12, gain, 5200);
                this._tone(now, 'square', 1840, 0.045, 0.12, gain);
                this._tone(now + 0.022, 'square', 2360, 0.03, 0.1, gain);
                break;
            case 'lightning':
                // Main electric discharge
                this._noise(now, 0.05, 0.24, gain, 6400);
                this._noise(now + 0.018, 0.06, 0.2, gain, 4200);
                this._noise(now + 0.043, 0.07, 0.16, gain, 2400);
                this._slide(now, 'square', 2600, 1100, 0.08, 0.18, gain);
                this._slide(now + 0.02, 'sawtooth', 1800, 620, 0.12, 0.14, gain);
                this._tone(now + 0.028, 'square', 1320, 0.05, 0.1, gain);
                break;
            case 'lightning_chain':
                // Secondary crackle around the main bolt
                this._noise(now, 0.035, 0.14, gain, 7200);
                this._noise(now + 0.015, 0.03, 0.12, gain, 5200);
                this._tone(now, 'square', 1840, 0.045, 0.12, gain);
                this._tone(now + 0.022, 'square', 2360, 0.03, 0.1, gain);
                break;
            case 'magic_cast':
                // Mystical casting sound
                this._playInstrument('fm_bell', 880, now, 0.4, 0.15);
                this._playInstrument('fm_bell', 1100, now + 0.1, 0.3, 0.1);
                break;
            case 'missile_launch':
                // Sharp burst volley with punchy launch
                this._noise(now, 0.04, 0.12, gain, 3200);
                this._tone(now, 'square', 420, 0.035, 0.14, gain);
                this._tone(now + 0.032, 'square', 520, 0.03, 0.11, gain);
                this._tone(now + 0.064, 'square', 640, 0.028, 0.09, gain);
                this._slide(now, 'sawtooth', 740, 1220, 0.12, 0.12, gain);
                break;
            case 'missile_hit':
                // Focused hit with punch and spark
                this._noise(now, 0.08, 0.18, gain, 2400);
                this._slide(now, 'square', 980, 420, 0.1, 0.13, gain);
                this._tone(now + 0.015, 'triangle', 210, 0.08, 0.09, gain);
                break;
            case 'shield_activate':
                // Epic barrier activation - angelic choir-like
                this._playInstrument('fm_bell', 440, now, 0.5, 0.2);
                this._playInstrument('fm_bell', 660, now + 0.1, 0.4, 0.15);
                this._playInstrument('fm_bell', 880, now + 0.2, 0.3, 0.1);
                this._tone(now, 'sine', 220, 0.6, 0.15, gain);
                break;
            case 'laser_shot':
                // Reserved lightning beam accent
                this._noise(now, 0.05, 0.16, gain, 5200);
                this._slide(now, 'square', 2400, 900, 0.09, 0.14, gain);
                break;
            case 'heal':
                // Healing chime
                this._playInstrument('fm_bell', 880, now, 0.4, 0.15);
                this._playInstrument('fm_bell', 1100, now + 0.15, 0.3, 0.12);
                this._playInstrument('fm_bell', 1320, now + 0.3, 0.4, 0.1);
                break;

            // Monster Sounds (Enhanced Impact)
            case 'monster_spawn':
                // Eerie spawn sound
                this._slide(now, 'sawtooth', 80, 160, 0.5, 0.2, gain);
                this._noise(now, 0.3, 0.15, gain, 600);
                break;
            case 'monster_attack':
                // Violent attack swish
                this._slide(now, 'sawtooth', 300, 100, 0.2, 0.2, gain);
                this._noise(now, 0.15, 0.15, gain, 2000);
                break;
            case 'monster_damage':
                // Heavy hit impact - feels like real damage
                this._noise(now, 0.15, 0.35, gain, 1200);
                this._tone(now, 'square', 180, 0.12, 0.25, gain);
                this._slide(now + 0.03, 'sawtooth', 250, 150, 0.1, 0.15, gain);
                break;
            case 'monster_death':
                // Dramatic death
                this._slide(now, 'sawtooth', 400, 80, 0.5, 0.25, gain);
                this._noise(now, 0.4, 0.2, gain, 800);
                break;
            case 'slime_jump':
                this._tone(now, 'sine', 150, 0.1, 0.08, gain);
                break;
            case 'boss_roar':
                // EPIC boss roar - multi-layered terrifying sound
                this._slide(now, 'sawtooth', 100, 40, 1.5, 0.4, gain);
                this._noise(now, 0.8, 0.35, gain, 400);
                this._playInstrument('fm_brass', 65, now, 1.2, 0.3);
                this._playInstrument('fm_brass', 98, now + 0.2, 1.0, 0.25);
                break;

            // Movement Sounds
            case 'footstep_grass': this._noise(now, 0.05, 0.04, gain, 3000); break;
            case 'footstep_stone': this._noise(now, 0.05, 0.05, gain, 2000); break;
            case 'footstep_water': this._noise(now, 0.08, 0.06, gain, 4000); break;
            case 'jump': this._slide(now, 'sine', 200, 400, 0.15, 0.08, gain); break;
            case 'land': this._noise(now, 0.1, 0.06, gain, 1000); break;
            case 'dash': this._slide(now, 'sawtooth', 600, 1000, 0.2, 0.1, gain); break;

            // Environment Sounds
            case 'door_open': this._tone(now, 'sine', 300, 0.2, 0.08, gain); break;
            case 'chest_open': this._playInstrument('fm_bell', 660, now, 0.3, 0.12); break;
            case 'portal_activate': this._slide(now, 'sine', 400, 800, 0.5, 0.15, gain); break;
            case 'warp': this._slide(now, 'sawtooth', 1000, 2000, 0.4, 0.1, gain); break;

            // Multiplayer/Social Sounds
            case 'chat_receive': this._tone(now, 'sine', 1200, 0.05, 0.05, gain); break;
            case 'chat_send': this._tone(now, 'sine', 1000, 0.05, 0.04, gain); break;
            case 'friend_online': this._playInstrument('fm_bell', 1320, now, 0.2, 0.08); break;
            case 'party_invite': this._tone(now, 'sine', 880, 0.1, 0.08, gain); break;
            case 'trade_request': this._tone(now, 'sine', 660, 0.15, 0.08, gain); break;

            // Narrative/Daughter Sounds
            case 'daughter_laugh': this._playInstrument('fm_bell', 880, now, 0.3, 0.1); break;
            case 'daughter_cry': this._slide(now, 'sawtooth', 400, 300, 0.5, 0.1, gain); break;
            case 'daughter_talk': this._tone(now, 'sine', 600, 0.2, 0.08, gain); break;
            case 'heart_beat': this._tone(now, 'sine', 80, 0.15, 0.2, gain); break;

            default: this._tone(now, 'triangle', 440, 0.1, 0.1, gain);
        }
    }
}
