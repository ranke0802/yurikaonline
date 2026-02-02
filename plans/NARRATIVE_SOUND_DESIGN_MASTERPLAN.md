# 🎵 Yurika Online: 서사 중심 16비트 사운드 디자인 마스터플랜

## Executive Summary

이 문서는 GEMINI3 pro의 미흡한 사운드 작업을 대체하여, **"A Father's Promise"**의 핵심 서사적 요소—**"부성애와 희생"**, **"정체성의 혼란"**, **"아버지들의 연대"**—를 16비트 칩튠으로 완벽하게 구현하는 포괄적인 사운드 설계를 제시합니다.

---

## Part 1: 핵심 음향 철학 (Core Audio Philosophy)

### 1.1 딸의 테마 (Daughter's Leitmotif)

모든 BGM과 SFX의 중심에 있는 **"딸의 멜로디"**:

```
딸의 테마 (기본 형태) - E minor, 4/4
E4 - G4 - B4 - A4 - G4 - F#4 - E4 (D.C.)

16비트 구현:
- Square wave: 메인 멜로디 (따뜻함, 순수함)
- Triangle wave: 베이스 지지 (안정감)
- Duty cycle: 50% (부드러운 음색)
```

**변주법**:
| 서사적 상황 | 변주 기법 | 감정적 효과 |
|-----------|----------|-----------|
| 평화로운 일상 | 원형 + 하프 반주 | 순수함, 안락함 |
| 위협의 등장 | 단조→장조 혼합, 템포 상승 | 불안함, 긴장감 |
| 희생의 순간 | 느린 템포, 낮은 옥타브 | 슬픔, 장엄함 |
| 희망의 재건 | 장조 전조, 화음 풍부화 | 희망, 회복 |

### 1.2 16비트 칩튠의 감정적 깊이

**제약 조건 내의 표현력**:
- **4개 채널** (Square 2개, Triangle 1개, Noise 1개)
- **주파수 제한** (20Hz - 20kHz)
- **볼륨 단계** (0-15)

**감정 표현 기법**:
```
부성애 → 느린 Attack, 긴 Release, 주요 화음
죄책감 → 반음 하행, 불협화음, 낮은 레지스터
연대감 → 화음 진행, 캐논 기법, 리듬적 통일
고독함 → 단선 멜로디, 넓은 인터벌, 잔향
```

---

## Part 2: 4부작 BGM 서사 교향곡

### Act 1: "오두막의 아침" (The Cabin's Morning)
**서사적 맥락**: 평화로운 일상, 딸과의 소중한 시간
**감정적 목표**: 안락함, 보호본능, 따뜻함

```json
{
  "title": "Act 1: 오두막의 아침",
  "narrative_context": "평화로운 일상 - 딸과의 소중한 시간",
  "emotional_goal": "안락함, 보호본능, 따뜻함",
  "bpm": 80,
  "key": "E_minor",
  "loop": true,
  "tracks": [
    {
      "channel": 1,
      "instrument": "square_lead",
      "duty": 0.5,
      "gain": 0.15,
      "role": "딸의 테마 - 순수한 멜로디",
      "notes": [
        ["E4", 1.0], ["G4", 0.5], ["B4", 0.5], ["A4", 1.0], ["G4", 0.5], ["F#4", 0.5], ["E4", 2.0],
        ["R", 0.5], ["B3", 0.5], ["E4", 0.5], ["G4", 0.5], ["B4", 1.0], ["A4", 0.5], ["G4", 0.5], ["F#4", 1.0],
        ["E4", 1.0], ["D4", 0.5], ["E4", 0.5], ["G4", 1.0], ["F#4", 0.5], ["E4", 0.5], ["D4", 2.0],
        ["R", 1.0], ["E4", 0.5], ["F#4", 0.5], ["G4", 1.0], ["A4", 0.5], ["B4", 0.5], ["E5", 2.0]
      ]
    },
    {
      "channel": 2,
      "instrument": "square_harmony",
      "duty": 0.25,
      "gain": 0.1,
      "role": "화음 지지 - 아버지의 보호",
      "notes": [
        ["E3", 2.0], ["G3", 2.0], ["B3", 2.0], ["A3", 2.0],
        ["E3", 2.0], ["G3", 2.0], ["D3", 2.0], ["A3", 2.0],
        ["E3", 2.0], ["G3", 2.0], ["B3", 2.0], ["D4", 2.0],
        ["C4", 2.0], ["B3", 2.0], ["A3", 2.0], ["G3", 2.0]
      ]
    },
    {
      "channel": 3,
      "instrument": "triangle_bass",
      "gain": 0.12,
      "role": "베이스라인 - 안정적인 기반",
      "notes": [
        ["E2", 4.0], ["G2", 4.0], ["B2", 4.0], ["A2", 4.0],
        ["E2", 4.0], ["G2", 4.0], ["D2", 4.0], ["A2", 4.0]
      ]
    },
    {
      "channel": 4,
      "instrument": "noise_percussion",
      "gain": 0.05,
      "role": "환경음 - 오두막의 고요함",
      "pattern": "soft_brush",
      "notes": [
        ["tick", 0.25], ["R", 0.75], ["tick", 0.25], ["R", 0.75],
        ["tick", 0.25], ["R", 0.25], ["tick", 0.25], ["R", 0.25]
      ]
    }
  ]
}
```

### Act 2: "그림자의 속삭임" (Whispers of Shadows)
**서사적 맥락**: 위협의 등장, 딸의 마왕력이 몬스터를 끌어들임
**감정적 목표**: 불안함, 긴장감, 보호본능의 각성

```json
{
  "title": "Act 2: 그림자의 속삭임",
  "narrative_context": "위협의 등장 - 딸의 마왕력이 몬스터를 유인",
  "emotional_goal": "불안함, 긴장감, 보호본능의 각성",
  "bpm": 110,
  "key": "E_minor_with_dissonance",
  "loop": true,
  "tracks": [
    {
      "channel": 1,
      "instrument": "square_lead",
      "duty": 0.75,
      "gain": 0.18,
      "role": "딸의 테마 변주 - 불안한 버전",
      "articulation": "staccato",
      "notes": [
        ["E4", 0.5], ["G4", 0.25], ["B4", 0.25], ["C5", 0.5], ["B4", 0.25], ["A4", 0.25], ["G4", 0.5],
        ["F#4", 0.25], ["E4", 0.25], ["D#4", 0.5], ["E4", 0.5], ["F4", 0.5], ["E4", 0.5],
        ["E4", 0.5], ["G4", 0.25], ["B4", 0.25], ["A4", 0.5], ["G4", 0.25], ["F#4", 0.25], ["E4", 1.0],
        ["R", 0.5], ["B3", 0.25], ["C4", 0.25], ["C#4", 0.5], ["D4", 0.5], ["D#4", 0.5], ["E4", 1.0]
      ]
    },
    {
      "channel": 2,
      "instrument": "square_harmony",
      "duty": 0.5,
      "gain": 0.12,
      "role": "불협화음 - 위협의 징조",
      "notes": [
        ["E3", 1.0], ["F3", 1.0], ["E3", 1.0], ["D#3", 1.0],
        ["E3", 0.5], ["G3", 0.5], ["F3", 0.5], ["E3", 0.5], ["D3", 1.0], ["C3", 1.0],
        ["B2", 1.0], ["C3", 1.0], ["C#3", 1.0], ["D3", 1.0],
        ["D#3", 0.5], ["E3", 0.5], ["F3", 0.5], ["F#3", 0.5], ["G3", 1.0], ["G#3", 1.0]
      ]
    },
    {
      "channel": 3,
      "instrument": "triangle_bass",
      "gain": 0.15,
      "role": "불규칙한 베이스 - 불안정함",
      "notes": [
        ["E2", 0.75], ["R", 0.25], ["E2", 0.5], ["E2", 0.5], ["D2", 0.75], ["R", 0.25], ["D2", 0.5],
        ["C2", 0.75], ["R", 0.25], ["C2", 0.5], ["B1", 0.5], ["B1", 0.75], ["R", 0.25], ["B1", 0.5]
      ]
    },
    {
      "channel": 4,
      "instrument": "noise_percussion",
      "gain": 0.1,
      "role": "심장박동 리듬 - 긴장감",
      "pattern": "heartbeat",
      "notes": [
        ["kick", 0.5], ["R", 0.5], ["kick", 0.25], ["R", 0.75],
        ["kick", 0.5], ["snare", 0.25], ["kick", 0.25], ["R", 0.5], ["kick", 0.25], ["R", 0.25]
      ]
    }
  ]
}
```

### Act 3: "피의 서약" (Blood Oath)
**서사적 맥락**: 희생의 순간, 딸을 지키기 위한 아버지의 선택
**감정적 목표**: 슬픔, 장엄함, 결의, 사랑

```json
{
  "title": "Act 3: 피의 서약",
  "narrative_context": "희생의 순간 - 딸을 지키기 위한 아버지의 선택",
  "emotional_goal": "슬픔, 장엄함, 결의, 사랑",
  "bpm": 60,
  "key": "C_minor",
  "loop": true,
  "tracks": [
    {
      "channel": 1,
      "instrument": "square_lead",
      "duty": 0.5,
      "gain": 0.2,
      "role": "딸의 테마 장조 변주 - 희생의 아름다움",
      "articulation": "legato",
      "notes": [
        ["C4", 2.0], ["E4", 1.0], ["G4", 1.0], ["F4", 2.0], ["E4", 1.0], ["D4", 1.0],
        ["C4", 3.0], ["G3", 1.0], ["C4", 2.0], ["E4", 2.0],
        ["D4", 2.0], ["F4", 1.0], ["A4", 1.0], ["G4", 2.0], ["F4", 1.0], ["E4", 1.0],
        ["D4", 4.0], ["R", 2.0], ["G3", 1.0], ["C4", 1.0]
      ]
    },
    {
      "channel": 2,
      "instrument": "square_harmony",
      "duty": 0.5,
      "gain": 0.15,
      "role": "슬픈 화음 - 장엄한 배경",
      "notes": [
        ["C3", 4.0], ["G3", 4.0], ["C3", 4.0], ["E3", 4.0],
        ["F3", 4.0], ["C3", 4.0], ["G2", 4.0], ["C3", 4.0]
      ]
    },
    {
      "channel": 3,
      "instrument": "triangle_bass",
      "gain": 0.12,
      "role": "낮은 옥타브 - 무게감",
      "notes": [
        ["C2", 8.0], ["G1", 8.0], ["C2", 8.0], ["C2", 8.0]
      ]
    },
    {
      "channel": 4,
      "instrument": "noise_percussion",
      "gain": 0.08,
      "role": "장례식 북 - 엄숙함",
      "pattern": "funeral_drum",
      "notes": [
        ["kick", 1.0], ["R", 3.0], ["kick", 1.0], ["R", 3.0],
        ["kick", 1.0], ["R", 1.0], ["kick", 1.0], ["R", 1.0], ["kick", 1.0], ["R", 3.0]
      ]
    }
  ]
}
```

### Act 4: "새벽의 빛" (Light of Dawn)
**서사적 맥락**: 희망의 재건, 딸과의 새로운 시작
**감정적 목표**: 희망, 회복, 사랑의 승리, 낙관

```json
{
  "title": "Act 4: 새벽의 빛",
  "narrative_context": "희망의 재건 - 딸과의 새로운 시작",
  "emotional_goal": "희망, 회복, 사랑의 승리, 낙관",
  "bpm": 100,
  "key": "G_major",
  "loop": true,
  "tracks": [
    {
      "channel": 1,
      "instrument": "square_lead",
      "duty": 0.5,
      "gain": 0.18,
      "role": "딸의 테마 장조 전조 - 희망찬 버전",
      "articulation": "bright",
      "notes": [
        ["G4", 0.5], ["B4", 0.5], ["D5", 0.5], ["C5", 0.5], ["B4", 0.5], ["A4", 0.5], ["G4", 1.0],
        ["R", 0.5], ["D4", 0.5], ["G4", 0.5], ["B4", 0.5], ["D5", 1.0], ["C5", 0.5], ["B4", 0.5], ["A4", 1.0],
        ["G4", 0.5], ["F#4", 0.5], ["G4", 0.5], ["B4", 0.5], ["A4", 0.5], ["G4", 0.5], ["F#4", 1.0],
        ["R", 1.0], ["G4", 0.5], ["A4", 0.5], ["B4", 0.5], ["C5", 0.5], ["D5", 0.5], ["G5", 2.0]
      ]
    },
    {
      "channel": 2,
      "instrument": "square_harmony",
      "duty": 0.5,
      "gain": 0.12,
      "role": "밝은 화음 - 희망의 조화",
      "notes": [
        ["G3", 2.0], ["B3", 2.0], ["D4", 2.0], ["C4", 2.0],
        ["G3", 2.0], ["B3", 2.0], ["D3", 2.0], ["A3", 2.0],
        ["G3", 2.0], ["B3", 2.0], ["D4", 2.0], ["F#4", 2.0],
        ["E4", 2.0], ["D4", 2.0], ["C4", 2.0], ["B3", 2.0]
      ]
    },
    {
      "channel": 3,
      "instrument": "triangle_bass",
      "gain": 0.12,
      "role": "경쾌한 베이스 - 새로운 시작",
      "notes": [
        ["G2", 2.0], ["B2", 2.0], ["D3", 2.0], ["C3", 2.0],
        ["G2", 2.0], ["B2", 2.0], ["D2", 2.0], ["A2", 2.0]
      ]
    },
    {
      "channel": 4,
      "instrument": "noise_percussion",
      "gain": 0.08,
      "role": "경쾌한 리듬 - 생명력",
      "pattern": "bright_march",
      "notes": [
        ["kick", 0.5], ["snare", 0.5], ["kick", 0.5], ["kick", 0.5],
        ["snare", 0.5], ["kick", 0.5], ["hihat", 0.25], ["hihat", 0.25], ["kick", 0.5]
      ]
    }
  ]
}
```

---

## Part 3: 서사적 사운드 이벤트 사전

### 3.1 딸과의 상호작용 (Daughter Interactions)

```json
{
  "daughter_interactions": {
    "description": "딸과의 모든 상호작용은 부성애와 보호본능을 강화",
    "events": {
      "daughter_hug": {
        "trigger": "딸과 포옹",
        "narrative_weight": "부성애의 정점",
        "sfx_layers": [
          {
            "type": "fm_bell",
            "notes": ["E5", "G5", "B5"],
            "duration": 1.5,
            "gain": 0.15,
            "effect": "warm_reverb"
          },
          {
            "type": "soft_chord",
            "chord": "E_major",
            "duration": 2.0,
            "gain": 0.1,
            "fade_in": 0.5
          }
        ],
        "bgm_modulation": {
          "type": "tempo_slow",
          "target_bpm": 60,
          "transition": 2.0
        }
      },
      "daughter_talk": {
        "trigger": "딸과 대화 시작",
        "narrative_weight": "유대감 형성",
        "sfx": {
          "type": "triangle",
          "note": "E4",
          "duration": 0.3,
          "gain": 0.08,
          "articulation": "soft"
        }
      },
      "daughter_gift": {
        "trigger": "딸에게 선물",
        "narrative_weight": "희생과 사랑",
        "sfx_layers": [
          {
            "type": "fm_bell",
            "notes": ["G4", "B4", "E5", "G5"],
            "duration": 1.0,
            "gain": 0.12,
            "arpeggio": true
          },
          {
            "type": "sparkle",
            "frequency_range": [2000, 4000],
            "duration": 0.8,
            "gain": 0.05
          }
        ]
      },
      "daughter_cry": {
        "trigger": "딸이 울음",
        "narrative_weight": "보호본능 자극",
        "sfx": {
          "type": "noise",
          "filter": "lowpass_500",
          "modulation": "tremolo",
          "duration": 2.0,
          "gain": 0.1
        },
        "bgm_modulation": {
          "type": "dissonance_intro",
          "chord": "E_minor_add9",
          "intensity": 0.3
        }
      },
      "daughter_laugh": {
        "trigger": "딸이 웃음",
        "narrative_weight": "행복, 보상",
        "sfx": {
          "type": "fm_bell",
          "notes": ["E5", "G5", "B5", "E6"],
          "duration": 0.5,
          "gain": 0.1,
          "staccato": true
        }
      },
      "daughter_magic_awaken": {
        "trigger": "딸의 마왕력 각성",
        "narrative_weight": "정체성 혼란, 위협",
        "sfx_layers": [
          {
            "type": "square",
            "note": "E3",
            "slide_to": "E2",
            "duration": 3.0,
            "gain": 0.2
          },
          {
            "type": "noise",
            "filter": "bandpass",
            "sweep": "up",
            "duration": 2.0,
            "gain": 0.15
          }
        ]
      }
    }
  }
}
```

### 3.2 전투 사운드 (Combat Sounds)

```json
{
  "combat_sounds": {
    "description": "전투는 생존이지 승리가 아님 - 죄책감과 절박함 표현",
    "events": {
      "monster_kill_first": {
        "trigger": "처음 몬스터 처치",
        "narrative_weight": "죄책감의 시작",
        "sfx_layers": [
          {
            "type": "square",
            "note": "A3",
            "duration": 0.5,
            "gain": 0.15
          },
          {
            "type": "noise",
            "filter": "lowpass",
            "duration": 0.8,
            "gain": 0.1,
            "fade_out": 0.5
          }
        ],
        "bgm_sting": {
          "type": "dissonant_chord",
          "chord": "E_minor_flat5",
          "duration": 2.0
        }
      },
      "monster_kill_regular": {
        "trigger": "일반 몬스터 처치",
        "narrative_weight": "필요악",
        "sfx": {
          "type": "noise",
          "filter": "lowpass_1000",
          "duration": 0.3,
          "gain": 0.12
        }
      },
      "boss_appear": {
        "trigger": "보스 등장",
        "narrative_weight": "딸의 위협, 절박함",
        "sfx_layers": [
          {
            "type": "square",
            "note": "E2",
            "slide_to": "E1",
            "duration": 3.0,
            "gain": 0.25
          },
          {
            "type": "noise",
            "filter": "lowpass",
            "sweep": "down",
            "duration": 2.0,
            "gain": 0.2
          }
        ],
        "bgm_transition": {
          "to": "bgm_boss",
          "crossfade": 3.0
        }
      },
      "boss_defeat": {
        "trigger": "보스 처치",
        "narrative_weight": "일시적 안도, 딸의 안전",
        "sfx_layers": [
          {
            "type": "fm_brass",
            "notes": ["E3", "G3", "B3", "E4"],
            "duration": 2.0,
            "gain": 0.2
          },
          {
            "type": "triangle",
            "note": "E2",
            "duration": 3.0,
            "gain": 0.15,
            "fade_out": 2.0
          }
        ]
      },
      "player_damage": {
        "trigger": "플레이어 피격",
        "narrative_weight": "딸을 지키지 못할까봐 두려움",
        "sfx": {
          "type": "square",
          "note": "C4",
          "duration": 0.2,
          "gain": 0.15
        }
      },
      "player_death": {
        "trigger": "플레이어 사망",
        "narrative_weight": "딸을 버림, 실패감",
        "sfx_layers": [
          {
            "type": "noise",
            "filter": "lowpass",
            "duration": 2.0,
            "gain": 0.2,
            "fade_out": 1.5
          },
          {
            "type": "square",
            "note": "E3",
            "slide_to": "E2",
            "duration": 2.0,
            "gain": 0.15
          }
        ],
        "bgm_sting": {
          "type": "dissonant_chord",
          "chord": "E_minor_diminished",
          "duration": 3.0
        }
      }
    }
  }
}
```

### 3.3 환경 탐험 (Environment Exploration)

```json
{
  "environment_sounds": {
    "description": "환경은 아버지의 남성 상태를 반영",
    "events": {
      "enter_cabin": {
        "trigger": "오두막 진입",
        "narrative_weight": "안식, 딸과의 안전",
        "bgm_transition": {
          "to": "bgm_act1_peaceful",
          "crossfade": 2.0
        },
        "ambient": {
          "type": "fireplace",
          "gain": 0.05,
          "loop": true
        }
      },
      "enter_dungeon": {
        "trigger": "던전 진입",
        "narrative_weight": "고독함, 위험",
        "bgm_transition": {
          "to": "bgm_act2_threat",
          "crossfade": 3.0
        },
        "ambient": {
          "type": "wind",
          "filter": "lowpass",
          "gain": 0.08,
          "loop": true
        }
      },
      "enter_boss_room": {
        "trigger": "보스방 진입",
        "narrative_weight": "절박함, 최후의 저항",
        "bgm_transition": {
          "to": "bgm_act3_sacrifice",
          "crossfade": 2.0
        }
      },
      "footstep_grass": {
        "trigger": "풀밭 걷기",
        "sfx": {
          "type": "noise",
          "filter": "highpass_2000",
          "duration": 0.1,
          "gain": 0.03
        }
      },
      "footstep_stone": {
        "trigger": "돌바닥 걷기",
        "sfx": {
          "type": "noise",
          "filter": "bandpass_1000_3000",
          "duration": 0.1,
          "gain": 0.04
        }
      }
    }
  }
}
```

### 3.4 멀티플레이어 상호작용 (Multiplayer Interactions)

```json
{
  "multiplayer_sounds": {
    "description": "다른 아버지들과의 연대감",
    "events": {
      "father_approach": {
        "trigger": "다른 아버지(플레이어) 접근",
        "narrative_weight": "동질감, 연대의 시작",
        "sfx": {
          "type": "fm_bell",
          "note": "E4",
          "duration": 0.5,
          "gain": 0.08
        }
      },
      "party_form": {
        "trigger": "파티 형성 (아버지들의 동맹)",
        "narrative_weight": "신성한 동맹, 딸들을 위한 연대",
        "sfx_layers": [
          {
            "type": "fm_brass",
            "notes": ["E3", "G3", "B3", "E4", "G4"],
            "duration": 2.0,
            "gain": 0.15
          },
          {
            "type": "triangle",
            "note": "E2",
            "duration": 3.0,
            "gain": 0.1
          }
        ],
        "bgm_modulation": {
          "type": "harmony_enhance",
          "add_chord": "E_major_7"
        }
      },
      "party_member_death": {
        "trigger": "파티원 사망",
        "narrative_weight": "동료의 딸을 지키지 못함",
        "sfx_layers": [
          {
            "type": "square",
            "note": "E3",
            "slide_to": "E2",
            "duration": 1.5,
            "gain": 0.15
          },
          {
            "type": "noise",
            "filter": "lowpass",
            "duration": 1.0,
            "gain": 0.1
          }
        ]
      },
      "daughter_meet": {
        "trigger": "딸들의 만남 이벤트",
        "narrative_weight": "딸들의 우정, 아버지들의 기쁨",
        "sfx_layers": [
          {
            "type": "fm_bell",
            "notes": ["E4", "G4", "B4", "E5", "G5", "B5"],
            "duration": 3.0,
            "gain": 0.12,
            "arpeggio": true
          },
          {
            "type": "triangle",
            "chord": "E_major",
            "duration": 4.0,
            "gain": 0.1
          }
        ],
        "bgm_transition": {
          "to": "bgm_act4_hope",
          "crossfade": 4.0
        }
      }
    }
  }
}
```

---

## Part 4: UX/UI 사운드 매핑

### 4.1 모든 플레이어 액션에 사운드 할당

```json
{
  "ux_sound_mapping": {
    "movement": {
      "walk": {
        "trigger": "걷기",
        "sfx": "footstep_grass",
        "interval": 0.4,
        "gain": 0.03
      },
      "run": {
        "trigger": "달리기",
        "sfx": "footstep_grass_fast",
        "interval": 0.25,
        "gain": 0.04
      },
      "stop": {
        "trigger": "멈춤",
        "sfx": "dust_settle",
        "gain": 0.02
      }
    },
    "combat_actions": {
      "attack_cast": {
        "trigger": "마법 시전",
        "sfx": "magic_cast",
        "gain": 0.1
      },
      "skill_laser": {
        "trigger": "레이저 스킬",
        "sfx": "laser_shot",
        "gain": 0.12
      },
      "skill_missile": {
        "trigger": "미사일 스킬",
        "sfx": "missile_launch",
        "gain": 0.12
      },
      "skill_fireball": {
        "trigger": "파이어볼 스킬",
        "sfx": "fireball_cast",
        "gain": 0.15
      },
      "skill_shield": {
        "trigger": "실드 스킬",
        "sfx": "shield_activate",
        "gain": 0.1
      }
    },
    "ui_interactions": {
      "button_click": {
        "trigger": "버튼 클릭",
        "sfx": "ui_click",
        "gain": 0.05
      },
      "menu_open": {
        "trigger": "메뉴 열기",
        "sfx": "ui_open",
        "gain": 0.04
      },
      "item_equip": {
        "trigger": "아이템 장착",
        "sfx": "equip_sound",
        "gain": 0.08
      },
      "level_up": {
        "trigger": "레벨업",
        "sfx": "level_up_fanfare",
        "gain": 0.15
      }
    }
  }
}
```

---

## Part 5: 구현 가이드 (Code Mode용)

### 5.1 파일 구조

```
assets/data/music/
├── bgm_act1_peaceful.json      # 오두막의 아침
├── bgm_act2_threat.json        # 그림자의 속삭임
├── bgm_act3_sacrifice.json     # 피의 서약
├── bgm_act4_hope.json          # 새벽의 빛
└── (기존 파일들 폐기)

assets/data/sound/
└── sound_events.json           # 서사적 사운드 이벤트 사전

src/js/core/
├── SoundManager.js             # 기존 파일 확장
└── NarrativeAudioEngine.js     # 새 파일 (서사적 오디오 처리)
```

### 5.2 SoundManager 확장 사항

```javascript
// SoundManager에 추가할 메서드

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
    await this.loadAndPlayBgm(bgmMap[act]);
}

/**
 * 서사적 사운드 이벤트 재생
 * @param {string} eventId - sound_events.json의 이벤트 ID
 * @param {Object} context - 서사적 맥락 정보
 */
async playNarrativeEvent(eventId, context = {}) {
    const event = await this.resourceManager.loadJSON('/assets/data/sound/sound_events.json');
    const soundEvent = this.findEvent(event, eventId);
    
    if (soundEvent.sfx_layers) {
        soundEvent.sfx_layers.forEach(layer => {
            this.playSfxLayer(layer);
        });
    }
    
    if (soundEvent.bgm_modulation) {
        this.applyBgmModulation(soundEvent.bgm_modulation);
    }
}
```

### 5.3 딸의 테마 변주 시스템

```javascript
/**
 * 딸의 테마 멜로디 생성
 * @param {string} variation - 'peaceful' | 'threat' | 'sacrifice' | 'hope'
 */
getDaughterTheme(variation) {
    const baseTheme = ['E4', 'G4', 'B4', 'A4', 'G4', 'F#4', 'E4'];
    
    const variations = {
        'peaceful': {
            notes: baseTheme,
            articulation: 'legato',
            tempo: 80
        },
        'threat': {
            notes: baseTheme.map(n => this.addDissonance(n)),
            articulation: 'staccato',
            tempo: 110
        },
        'sacrifice': {
            notes: this.transpose(baseTheme, -3), // C minor
            articulation: 'legato_slow',
            tempo: 60
        },
        'hope': {
            notes: this.transpose(baseTheme, 3), // G major
            articulation: 'bright',
            tempo: 100
        }
    };
    
    return variations[variation];
}
```

---

## Part 6: 서사-음향 매트릭스

| 서사적 요소 | 음향적 표현 | BGM | SFX |
|------------|------------|-----|-----|
| **부성애** | 따뜻한 화음, 느린 템포, 딸의 테마 | Act 1 | daughter_hug, daughter_laugh |
| **정체성 혼란** | 불협화음, 반음 진행, 불규칙 리듬 | Act 2 | daughter_magic_awaken |
| **희생** | 낮은 레지스터, 장엄한 화음, 느린 템포 | Act 3 | player_death, boss_appear |
| **연대감** | 화음의 풍부함, 캐논 기법 | Act 4 | party_form, daughter_meet |
| **죄책감** | 단조, 날카로운 음색 | - | monster_kill_first |
| **고독함** | 단선 멜로디, 잔향 | Act 2 | enter_dungeon |

---

## 결론

이 사운드 디자인 마스터플랜은 **"A Father's Promise"**의 핵심 서사를 16비트 칩튠의 제약 속에서도 완벽하게 표현합니다. 딸의 테마를 중심으로 한 4부작 BGM과 서사적 무게를 실은 SFX 사전은 게임을 단순한 MMORPG에서 **서사적 걸작**으로 격상시킬 음향적 기반이 될 것입니다.

**핵심 성공 지표**:
1. 모든 BGM에서 딸의 테마가 인식 가능할 것
2. 각 서사적 순간에 적절한 감정적 반응을 유발할 것
3. 플레이어의 모든 액션에 의미 있는 사운드가 할당될 것
4. 멀티플레이어 상황에서도 서사적 몰입이 유지될 것
