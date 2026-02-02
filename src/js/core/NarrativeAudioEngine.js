import Logger from '../utils/Logger.js';

/**
 * NarrativeAudioEngine
 * 서사 중심 오디오 처리 엔진
 * 
 * Features:
 * - 딸의 테마 변주 시스템
 * - 서사적 BGM 전환
 * - 감정적 사운드 이벤트 관리
 * - 4부작 서사 구조 지원
 */
export default class NarrativeAudioEngine {
    constructor(soundManager) {
        this.soundManager = soundManager;
        this.soundEvents = null;
        this.currentNarrativeAct = 'act1';
        this.daughterThemeVariations = {
            peaceful: this._generatePeacefulTheme(),
            threat: this._generateThreatTheme(),
            sacrifice: this._generateSacrificeTheme(),
            hope: this._generateHopeTheme()
        };
    }

    /**
     * 사운드 이벤트 데이터 로드
     */
    async loadSoundEvents() {
        try {
            this.soundEvents = await this.soundManager.resourceManager.loadJSON('/assets/data/sound/sound_events.json');
            Logger.log('[NarrativeAudioEngine] Sound events loaded');
        } catch (e) {
            Logger.warn('[NarrativeAudioEngine] Failed to load sound events', e);
        }
    }

    /**
     * 서사적 BGM 전환
     * @param {string} act - 'act1' | 'act2' | 'act3' | 'act4'
     * @param {number} crossfadeDuration - 크로스페이드 시간(초)
     */
    async playNarrativeBgm(act, crossfadeDuration = 2.0) {
        const bgmMap = {
            'act1': 'bgm_act1_peaceful',
            'act2': 'bgm_act2_threat',
            'act3': 'bgm_act3_sacrifice',
            'act4': 'bgm_act4_hope'
        };

        if (!bgmMap[act]) {
            Logger.warn(`[NarrativeAudioEngine] Unknown act: ${act}`);
            return;
        }

        this.currentNarrativeAct = act;
        await this.soundManager.loadAndPlayBgm(bgmMap[act]);
        Logger.log(`[NarrativeAudioEngine] Playing narrative BGM: ${act}`);
    }

    /**
     * 서사적 사운드 이벤트 재생
     * @param {string} category - 이벤트 카테고리
     * @param {string} eventId - 이벤트 ID
     * @param {Object} context - 서사적 맥락 정보
     */
    async playNarrativeEvent(category, eventId, context = {}) {
        if (!this.soundEvents) {
            await this.loadSoundEvents();
        }

        const categoryData = this.soundEvents[category];
        if (!categoryData || !categoryData.events || !categoryData.events[eventId]) {
            Logger.warn(`[NarrativeAudioEngine] Event not found: ${category}.${eventId}`);
            return;
        }

        const event = categoryData.events[eventId];
        Logger.log(`[NarrativeAudioEngine] Playing narrative event: ${eventId} (${event.narrative_theme})`);

        // SFX 레이어 재생
        if (event.sfx_layers) {
            event.sfx_layers.forEach(layer => {
                this._playSfxLayer(layer);
            });
        }

        // 단일 SFX 재생
        if (event.sfx) {
            this._playSfxLayer(event.sfx);
        }

        // BGM 변조 적용
        if (event.bgm_modulation) {
            this._applyBgmModulation(event.bgm_modulation);
        }

        // BGM 전환
        if (event.bgm_transition) {
            await this.soundManager.loadAndPlayBgm(event.bgm_transition.to);
        }

        // BGM 스팅 (일시적 효과)
        if (event.bgm_sting) {
            this._playBgmSting(event.bgm_sting);
        }
    }

    /**
     * 딸과의 상호작용 사운드
     * @param {string} interactionType - 'hug' | 'talk' | 'gift' | 'cry' | 'laugh' | 'magic_awaken'
     */
    async playDaughterInteraction(interactionType) {
        await this.playNarrativeEvent('daughter_interactions', `daughter_${interactionType}`);
    }

    /**
     * 전투 사운드
     * @param {string} combatType - 'kill_first' | 'kill_regular' | 'boss_appear' | 'boss_defeat' | 'damage' | 'death'
     */
    async playCombatSound(combatType) {
        const eventMap = {
            'kill_first': 'monster_kill_first',
            'kill_regular': 'monster_kill_regular',
            'boss_appear': 'boss_appear',
            'boss_defeat': 'boss_defeat',
            'damage': 'player_damage',
            'death': 'player_death'
        };
        await this.playNarrativeEvent('combat_sounds', eventMap[combatType]);
    }

    /**
     * 환경 사운드
     * @param {string} environmentType - 'enter_cabin' | 'enter_dungeon' | 'enter_boss_room'
     */
    async playEnvironmentSound(environmentType) {
        await this.playNarrativeEvent('environment_sounds', environmentType);
    }

    /**
     * 멀티플레이어 사운드
     * @param {string} mpType - 'father_approach' | 'party_form' | 'party_member_death' | 'daughter_meet'
     */
    async playMultiplayerSound(mpType) {
        await this.playNarrativeEvent('multiplayer_sounds', mpType);
    }

    /**
     * 딸의 테마 멜로디 변주
     * @param {string} variation - 'peaceful' | 'threat' | 'sacrifice' | 'hope'
     */
    playDaughterTheme(variation) {
        const theme = this.daughterThemeVariations[variation];
        if (!theme) {
            Logger.warn(`[NarrativeAudioEngine] Unknown theme variation: ${variation}`);
            return;
        }

        Logger.log(`[NarrativeAudioEngine] Playing daughter theme: ${variation}`);
        
        // 테마 멜로디 재생
        theme.forEach((noteData, index) => {
            const time = this.soundManager.ctx.currentTime + (index * 0.5);
            this.soundManager._playInstrument(
                'fm_bell',
                this.soundManager.notes[noteData.note],
                time,
                noteData.duration,
                0.15
            );
        });
    }

    /**
     * SFX 레이어 재생
     * @private
     */
    _playSfxLayer(layer) {
        const now = this.soundManager.ctx.currentTime;
        
        if (layer.type === 'fm_bell' || layer.type === 'fm_brass') {
            // 여러 노트 처리
            if (layer.notes) {
                if (layer.arpeggio) {
                    // 아르페지오
                    layer.notes.forEach((note, index) => {
                        const time = now + (index * 0.1);
                        this.soundManager._playInstrument(
                            layer.type,
                            this.soundManager.notes[note],
                            time,
                            layer.duration / layer.notes.length,
                            layer.gain
                        );
                    });
                } else {
                    // 동시 화음
                    layer.notes.forEach(note => {
                        this.soundManager._playInstrument(
                            layer.type,
                            this.soundManager.notes[note],
                            now,
                            layer.duration,
                            layer.gain / layer.notes.length
                        );
                    });
                }
            } else if (layer.note) {
                // 단일 노트
                this.soundManager._playInstrument(
                    layer.type,
                    this.soundManager.notes[layer.note],
                    now,
                    layer.duration,
                    layer.gain
                );
            }
        } else if (layer.type === 'noise') {
            // 노이즈 처리
            const dest = this.soundManager.masterGain;
            const duration = layer.duration || 0.5;
            const gain = layer.gain || 0.1;
            
            if (layer.filter === 'lowpass_500') {
                this._noise(now, duration, gain, dest, 500);
            } else if (layer.filter === 'lowpass_1000') {
                this._noise(now, duration, gain, dest, 1000);
            } else if (layer.filter === 'lowpass') {
                this._noise(now, duration, gain, dest, 800);
            } else {
                this._noise(now, duration, gain, dest, 2000);
            }
        } else if (layer.type === 'square' || layer.type === 'triangle') {
            // 기본 파형
            const freq = layer.note ? this.soundManager.notes[layer.note] : 440;
            const osc = this.soundManager.ctx.createOscillator();
            const env = this.soundManager.ctx.createGain();
            
            osc.type = layer.type;
            osc.frequency.value = freq;
            
            if (layer.slide_to) {
                osc.frequency.setValueAtTime(freq, now);
                osc.frequency.linearRampToValueAtTime(
                    this.soundManager.notes[layer.slide_to],
                    now + layer.duration
                );
            }
            
            env.gain.setValueAtTime(layer.gain, now);
            env.gain.exponentialRampToValueAtTime(0.01, now + layer.duration);
            
            osc.connect(env);
            env.connect(this.soundManager.masterGain);
            osc.start(now);
            osc.stop(now + layer.duration);
        }
    }

    /**
     * BGM 변조 적용
     * @private
     */
    _applyBgmModulation(modulation) {
        // BGM 변조 로직 (템포 변경, 화음 추가 등)
        Logger.log(`[NarrativeAudioEngine] Applying BGM modulation: ${modulation.type}`);
        
        switch (modulation.type) {
            case 'tempo_slow':
                // 템포 감소 로직
                break;
            case 'dissonance_intro':
                // 불협화음 도입 로직
                break;
            case 'harmony_enhance':
                // 화음 풍부화 로직
                break;
        }
    }

    /**
     * BGM 스팅 재생 (일시적 효과)
     * @private
     */
    _playBgmSting(sting) {
        const now = this.soundManager.ctx.currentTime;
        
        if (sting.type === 'dissonant_chord') {
            // 불협화음 스팅
            const notes = ['E3', 'G3', 'A#3'];
            notes.forEach(note => {
                this.soundManager._playInstrument(
                    'fm_brass',
                    this.soundManager.notes[note],
                    now,
                    sting.duration,
                    0.15
                );
            });
        }
    }

    /**
     * 노이즈 생성
     * @private
     */
    _noise(time, dur, vol, dest, freq) {
        const src = this.soundManager.ctx.createBufferSource();
        src.buffer = this.soundManager.noiseBuffer;
        const f = this.soundManager.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = freq;
        const g = this.soundManager.ctx.createGain();
        g.gain.setValueAtTime(vol, time);
        g.gain.exponentialRampToValueAtTime(0.01, time + dur);
        src.connect(f);
        f.connect(g);
        g.connect(dest);
        src.start(time);
        src.stop(time + dur);
    }

    /**
     * 평화로운 테마 생성
     * @private
     */
    _generatePeacefulTheme() {
        return [
            { note: 'E4', duration: 1.0 },
            { note: 'G4', duration: 0.5 },
            { note: 'B4', duration: 0.5 },
            { note: 'A4', duration: 1.0 },
            { note: 'G4', duration: 0.5 },
            { note: 'F#4', duration: 0.5 },
            { note: 'E4', duration: 2.0 }
        ];
    }

    /**
     * 위협 테마 생성
     * @private
     */
    _generateThreatTheme() {
        return [
            { note: 'E4', duration: 0.5 },
            { note: 'G4', duration: 0.25 },
            { note: 'B4', duration: 0.25 },
            { note: 'C5', duration: 0.5 },
            { note: 'B4', duration: 0.25 },
            { note: 'A4', duration: 0.25 },
            { note: 'G4', duration: 0.5 }
        ];
    }

    /**
     * 희생 테마 생성
     * @private
     */
    _generateSacrificeTheme() {
        return [
            { note: 'C4', duration: 2.0 },
            { note: 'E4', duration: 1.0 },
            { note: 'G4', duration: 1.0 },
            { note: 'F4', duration: 2.0 },
            { note: 'E4', duration: 1.0 },
            { note: 'D4', duration: 1.0 },
            { note: 'C4', duration: 3.0 }
        ];
    }

    /**
     * 희망 테마 생성
     * @private
     */
    _generateHopeTheme() {
        return [
            { note: 'G4', duration: 0.5 },
            { note: 'B4', duration: 0.5 },
            { note: 'D5', duration: 0.5 },
            { note: 'C5', duration: 0.5 },
            { note: 'B4', duration: 0.5 },
            { note: 'A4', duration: 0.5 },
            { note: 'G4', duration: 1.0 }
        ];
    }

    /**
     * 현재 서사적 막 반환
     */
    getCurrentNarrativeAct() {
        return this.currentNarrativeAct;
    }

    /**
     * 서사적 막 설정
     */
    setNarrativeAct(act) {
        this.currentNarrativeAct = act;
    }
}