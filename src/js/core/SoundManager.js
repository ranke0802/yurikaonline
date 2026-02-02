import Logger from '../utils/Logger.js';

/**
 * SoundManager
 * Generates 8-bit chiptune music and SFX using Web Audio API.
 * Uses JSON data to sequence notes, requiring ZERO audio file downloads.
 */
export default class SoundManager {
    constructor(resourceManager) {
        this.resourceManager = resourceManager;
        this.ctx = null;
        this.masterGain = null;
        this.currentBgm = null;
        this.bgmNodes = [];
        this.isMuted = false;
        this.isInitialized = false;

        // Note frequencies (C3 to B5)
        this.notes = {
            'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
            'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
            'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99, 'G#5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'B5': 987.77,
            'C6': 1046.50
        };

        // Bind user interaction to unlock audio context
        window.addEventListener('click', () => this.initOrResume(), { once: true });
        window.addEventListener('keydown', () => this.initOrResume(), { once: true });
    }

    initOrResume() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.value = 0.3; // Default volume
                this.masterGain.connect(this.ctx.destination);
                this.isInitialized = true;
                Logger.log('[SoundManager] Audio Context Initialized');
            }
        } else if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    async loadAndPlayBgm(id) {
        if (!this.isInitialized) return;
        try {
            // Check cache first (using Memory/Session logic from MonsterDataManager concept if needed, 
            // but for now simple fetch is fine as these are small)
            const data = await this.resourceManager.loadJSON(`/assets/data/music/${id}.json`);
            this.playBgm(data);
        } catch (e) {
            Logger.warn(`[SoundManager] Failed to load BGM: ${id}`, e);
        }
    }

    stopBgm() {
        this.bgmNodes.forEach(node => {
            try { node.stop(); } catch (e) { }
        });
        this.bgmNodes = [];
    }

    playBgm(data) {
        this.stopBgm();
        if (this.isMuted || !this.ctx) return;

        const bpm = data.bpm || 120;
        const beatDuration = 60 / bpm;
        const now = this.ctx.currentTime;

        // Loop length calculation
        let totalDuration = 0;
        data.tracks.forEach(track => {
            let trackTime = 0;
            track.notes.forEach(note => trackTime += note[1] * beatDuration);
            if (trackTime > totalDuration) totalDuration = trackTime;
        });

        const loopDuration = totalDuration;

        // Scheduler
        const playLoop = (startTime) => {
            data.tracks.forEach(track => {
                let time = startTime;

                track.notes.forEach(([noteName, durationBeats]) => {
                    const duration = durationBeats * beatDuration;

                    if (noteName !== 'R') { // R is Rest
                        const osc = this.ctx.createOscillator();
                        const gain = this.ctx.createGain();

                        osc.type = track.type || 'square';
                        osc.frequency.value = this.notes[noteName] || 440;

                        // Envelope (short attack, full sustain, short release)
                        gain.gain.setValueAtTime(0.01, time);
                        gain.gain.linearRampToValueAtTime(track.gain || 0.1, time + 0.05);
                        gain.gain.setValueAtTime(track.gain || 0.1, time + duration - 0.05);
                        gain.gain.linearRampToValueAtTime(0.01, time + duration);

                        osc.connect(gain);
                        gain.connect(this.masterGain);

                        osc.start(time);
                        osc.stop(time + duration);

                        this.bgmNodes.push(osc); // Track for stopping
                    }
                    time += duration;
                });
            });

            // Schedule next loop
            if (data.loop) {
                const nextLoopTime = startTime + loopDuration;
                // Simple recursive timeout approximation or lookahead scheduling could work.
                // For true precision Web Audio scheduling, we'd queue ahead.
                // Here we just queue the nodes. (Simplified for prototype)
                // NOTE: Infinite recursion stack risk if not handled by timer. 
                // For this lightweight version, we will just play ONCE if we don't have a complex scheduler,
                // OR we use the osc.onended of the last note to trigger next loop.

                // Let's rely on a simpler 're-call' via setTimeout for the loop trigger, 
                // adjusted by context time to prevent drift.
                const timeUntilNext = (nextLoopTime - this.ctx.currentTime) * 1000;
                setTimeout(() => {
                    if (this.bgmNodes.length > 0) playLoop(this.ctx.currentTime + 0.1);
                }, Math.max(0, timeUntilNext - 100)); // Wake up slightly early
            }
        };

        playLoop(now + 0.1);
    }

    // Play One-shot SFX
    playSfx(type) {
        if (!this.ctx || this.isMuted) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.masterGain);

        if (type === 'hit') {
            // Noise-like effect (random frequency modulation) or simple low square
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.1);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'magic') {
            // High chime
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(880, now); // A5
            osc.frequency.linearRampToValueAtTime(1760, now + 0.3); // A6
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'run') {
            // Short tick
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, now);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'boss_roar') {
            // Deep slide
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.linearRampToValueAtTime(50, now + 1.0);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.linearRampToValueAtTime(0, now + 1.0);
            osc.start(now);
            osc.stop(now + 1.0);
        }
    }
}
