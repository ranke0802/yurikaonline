# 카드 타입 템플릿 및 샘플 JSON
작성일: 2026-04-09  
상태: Draft / 제작 템플릿 문서  
연결 문서:
- [unity_single_mode_studio_playable_architecture_masterplan_2026-04-09.md](./unity_single_mode_studio_playable_architecture_masterplan_2026-04-09.md)
- [content_schema_spec_single_studio_playable_2026-04-09.md](./content_schema_spec_single_studio_playable_2026-04-09.md)
- [ai_scenario_generation_prompt_spec_2026-04-09.md](./ai_scenario_generation_prompt_spec_2026-04-09.md)

## 1. 목적

이 문서는 Studio에서 가장 자주 쓰는 카드와 보조 데이터의 복사용 템플릿을 제공한다.

이 문서의 역할은 다음과 같다.

- 기획자와 시나리오 담당자가 빠르게 초안을 만들 수 있게 한다.
- AI가 생성한 결과를 사람이 정리할 때 기준점이 된다.
- JSON 구조가 제각각 퍼지는 것을 막는다.

## 2. 사용 규칙

1. 샘플 JSON은 설명용이면서 동시에 validator 친화적인 형식을 따른다.
2. 실제 저장 전에는 placeholder 값을 실제 ID로 바꾼다.
3. 주석은 JSON 안에 넣지 않는다.
4. 필드가 많아 보이더라도 1차 구현에서는 일부만 활성화할 수 있다.
5. `web_editable` 성격의 값과 `unity_only` 성격의 값은 분리 관리한다.

## 3. 네이밍 규칙

- `part_id`: `part_01_start`
- `card_id`: `scen_00_prologue`
- `field_id`: `field_safe_cabin_01`
- `encounter_id`: `encounter_cabin_defense`
- `timeline_id`: `timeline_scen_00_prologue`
- `dialogue_id`: `dialogue_scen_00_prologue_ko`

## 4. 공통 카드 베이스 템플릿

```json
{
  "id": "card_id_here",
  "type": "scen_card",
  "partId": "part_01_start",
  "title": "카드 제목",
  "summary": "카드 목적 한 줄 요약",
  "tags": ["main_story"],
  "status": "draft",
  "entry": {
    "fromCardIds": [],
    "conditions": []
  },
  "exit": {
    "nextCardIds": [],
    "completionActions": []
  },
  "presentation": {
    "bgmRef": "bgm_cabin_night",
    "sfxRefs": [],
    "fadeIn": "soft",
    "fadeOut": "soft"
  },
  "authoring": {
    "owner": "scenario",
    "reviewers": ["director"],
    "notes": ""
  }
}
```

## 5. `part` 템플릿

### 5.1 템플릿

```json
{
  "id": "part_01_start",
  "title": "오두막의 새벽",
  "summary": "프롤로그부터 첫 방어전까지의 초반부",
  "order": 1,
  "entryCardId": "scen_00_prologue",
  "cardIds": [
    "scen_00_prologue",
    "scen_01_wakeup",
    "safe_field_01_cabin",
    "battle_field_01_defense"
  ],
  "dependencies": [],
  "recommendedPlayMinutes": 18,
  "status": "draft"
}
```

### 5.2 샘플

```json
{
  "id": "part_00_login",
  "title": "접속과 시작",
  "summary": "로그인, 캐릭터 생성, 게임 시작 흐름",
  "order": 0,
  "entryCardId": "login_entry",
  "cardIds": [
    "login_entry",
    "character_create_entry",
    "start_gate_entry"
  ],
  "dependencies": [],
  "recommendedPlayMinutes": 4,
  "status": "active"
}
```

## 6. `login_card`

```json
{
  "id": "login_entry",
  "type": "login_card",
  "partId": "part_00_login",
  "title": "로그인",
  "summary": "서비스 진입과 인증",
  "ui": {
    "panelLayoutRef": "panel_login_default",
    "backgroundImageRef": "bg_login_morning",
    "logoImageRef": "logo_yurika",
    "bgmRef": "bgm_title_soft",
    "buttonSfxRef": "sfx_ui_confirm"
  },
  "actions": {
    "primary": "login",
    "secondary": "guest_login"
  },
  "exit": {
    "nextCardIds": ["character_create_entry"],
    "completionActions": ["track_login_complete"]
  }
}
```

## 7. `character_create_card`

```json
{
  "id": "character_create_entry",
  "type": "character_create_card",
  "partId": "part_00_login",
  "title": "캐릭터 생성",
  "summary": "기본 외형과 이름을 정한다",
  "ui": {
    "panelLayoutRef": "panel_character_create_default",
    "backgroundImageRef": "bg_character_create_room",
    "bgmRef": "bgm_title_soft"
  },
  "defaults": {
    "classId": "wizard",
    "appearancePresetId": "preset_wizard_default"
  },
  "validation": {
    "nameMinLength": 2,
    "nameMaxLength": 12
  },
  "exit": {
    "nextCardIds": ["start_gate_entry"],
    "completionActions": ["save_character_profile"]
  }
}
```

## 8. `start_gate_card`

```json
{
  "id": "start_gate_entry",
  "type": "start_gate_card",
  "partId": "part_00_login",
  "title": "시작",
  "summary": "플레이어블 첫 파트로 진입한다",
  "presentation": {
    "backgroundImageRef": "bg_start_gate",
    "bgmRef": "bgm_intro_transition",
    "fadeIn": "soft",
    "fadeOut": "strong"
  },
  "entry": {
    "fromCardIds": ["character_create_entry"],
    "conditions": ["player_profile_ready"]
  },
  "exit": {
    "nextCardIds": ["scen_00_prologue"],
    "completionActions": ["boot_runtime_profile", "load_part_01_start"]
  }
}
```

## 9. `scen_card`

### 9.1 템플릿

```json
{
  "id": "scen_00_prologue",
  "type": "scen_card",
  "partId": "part_01_start",
  "title": "프롤로그",
  "summary": "악몽과 기척을 통해 세계의 불안을 암시한다",
  "scene": {
    "timelineId": "timeline_scen_00_prologue",
    "dialogueId": "dialogue_scen_00_prologue_ko",
    "backgroundImageRefs": ["bg_dream_ruins", "bg_dark_forest"],
    "characterSpriteRefs": ["char_yurika_default", "char_shadow_01"],
    "textBoxStyleRef": "textbox_story_default"
  },
  "presentation": {
    "bgmRef": "bgm_dream_low",
    "ambientSfxRefs": ["sfx_wind_low"],
    "fadeIn": "black",
    "fadeOut": "soft"
  },
  "exit": {
    "nextCardIds": ["scen_01_wakeup"],
    "completionActions": ["set_flag:prologue_seen"]
  }
}
```

### 9.2 샘플

```json
{
  "id": "scen_01_wakeup",
  "type": "scen_card",
  "partId": "part_01_start",
  "title": "악몽에서 깨어나다",
  "summary": "유리카가 오두막에서 깨어나 불길한 감각을 털어내지 못한다",
  "scene": {
    "timelineId": "timeline_scen_01_wakeup",
    "dialogueId": "dialogue_scen_01_wakeup_ko",
    "backgroundImageRefs": ["bg_cabin_interior_morning"],
    "characterSpriteRefs": ["char_yurika_default"],
    "textBoxStyleRef": "textbox_story_default"
  },
  "presentation": {
    "bgmRef": "bgm_cabin_morning",
    "ambientSfxRefs": ["sfx_cabin_fireplace"],
    "fadeIn": "soft",
    "fadeOut": "soft"
  },
  "exit": {
    "nextCardIds": ["safe_field_01_cabin"],
    "completionActions": ["unlock_field:field_safe_cabin_01"]
  }
}
```

## 10. `safe_field_card`

```json
{
  "id": "safe_field_01_cabin",
  "type": "safe_field_card",
  "partId": "part_01_start",
  "title": "오두막",
  "summary": "플레이어가 안전지대에서 이동과 상호작용을 익힌다",
  "field": {
    "fieldId": "field_safe_cabin_01",
    "spawnPointId": "spawn_cabin_center",
    "cameraProfileRef": "camera_safe_default",
    "hudProfileRef": "hud_mobile_default"
  },
  "systems": {
    "housingEnabled": false,
    "inventoryEnabled": true,
    "craftEnabled": false
  },
  "interactions": {
    "primaryObjectIds": ["obj_bed", "obj_table_note", "npc_guardian"],
    "optionalObjectIds": ["obj_storage_box"]
  },
  "presentation": {
    "bgmRef": "bgm_cabin_safe",
    "ambientSfxRefs": ["sfx_birds_morning"]
  },
  "exit": {
    "nextCardIds": ["battle_field_01_defense"],
    "completionActions": ["set_flag:cabin_preparation_done"]
  }
}
```

## 11. `battle_field_card`

```json
{
  "id": "battle_field_01_defense",
  "type": "battle_field_card",
  "partId": "part_01_start",
  "title": "오두막 방어",
  "summary": "슬라임 습격을 막아내는 첫 방어전",
  "field": {
    "fieldId": "field_battle_cabin_01",
    "spawnPointId": "spawn_battle_gate",
    "cameraProfileRef": "camera_battle_default"
  },
  "battle": {
    "encounterId": "encounter_cabin_defense",
    "bossEnabled": true,
    "failureRuleRef": "fail_player_down",
    "victoryRuleRef": "victory_all_waves_clear"
  },
  "presentation": {
    "bgmRef": "bgm_battle_cabin_urgent",
    "startCutInRef": "cutin_cabin_alarm",
    "victoryStingRef": "sfx_victory_short"
  },
  "exit": {
    "nextCardIds": ["scen_02_after_defense"],
    "completionActions": ["grant_reward:first_defense_clear"]
  }
}
```

## 12. `tutorial_card`

```json
{
  "id": "tutorial_00_move",
  "type": "tutorial_card",
  "partId": "part_01_start",
  "title": "이동 튜토리얼",
  "summary": "플레이어가 이동 입력을 익힌다",
  "tutorial": {
    "goalId": "goal_move_basic",
    "instructionTextRef": "tutorial_move_mobile_01",
    "successCondition": "player_move_distance>=120",
    "failureCondition": "none",
    "overlayAnchorRef": "ui_joystick",
    "lockOtherInputs": true
  },
  "presentation": {
    "highlightRefs": ["ui_joystick"],
    "bgmRef": "bgm_tutorial_soft"
  },
  "exit": {
    "nextCardIds": ["tutorial_01_attack"],
    "completionActions": ["set_flag:tutorial_move_done"]
  }
}
```

## 13. `branch_card`

```json
{
  "id": "branch_01_cabin_choice",
  "type": "branch_card",
  "partId": "part_01_start",
  "title": "선택",
  "summary": "조사 순서를 나눈다",
  "choices": [
    {
      "id": "choice_check_note",
      "label": "메모를 먼저 확인한다",
      "nextCardId": "scen_03_check_note",
      "conditions": []
    },
    {
      "id": "choice_go_outside",
      "label": "밖의 기척을 확인한다",
      "nextCardId": "scen_04_step_outside",
      "conditions": []
    }
  ],
  "exit": {
    "completionActions": ["track_branch:branch_01_cabin_choice"]
  }
}
```

## 14. `reward_card`

```json
{
  "id": "reward_01_first_defense",
  "type": "reward_card",
  "partId": "part_01_start",
  "title": "첫 방어전 보상",
  "summary": "방어전 완료 보상을 지급한다",
  "rewards": {
    "exp": 120,
    "gold": 50,
    "items": [
      {
        "itemId": "potion_hp_small",
        "quantity": 3
      }
    ],
    "flags": ["reward_first_defense_claimed"]
  },
  "presentation": {
    "modalLayoutRef": "reward_modal_default",
    "rewardSfxRef": "sfx_reward_gain"
  },
  "exit": {
    "nextCardIds": ["scen_02_after_defense"],
    "completionActions": ["save_reward_claim"]
  }
}
```

## 15. `field` 샘플

### 15.1 안전지대 필드

```json
{
  "id": "field_safe_cabin_01",
  "type": "safe_field",
  "title": "오두막 내부",
  "mapRef": "map_cabin_interior_01",
  "spawnPoints": [
    {
      "id": "spawn_cabin_center",
      "x": 640,
      "y": 360
    }
  ],
  "objects": [
    {
      "id": "obj_bed",
      "assetRef": "obj_bed_wood_01",
      "x": 410,
      "y": 300,
      "interactionRef": "interaction_rest_bed"
    },
    {
      "id": "obj_table_note",
      "assetRef": "obj_table_note_01",
      "x": 700,
      "y": 330,
      "interactionRef": "interaction_read_note"
    }
  ],
  "npcs": [
    {
      "id": "npc_guardian",
      "characterId": "guardian",
      "x": 840,
      "y": 300,
      "interactionRef": "interaction_guardian_talk"
    }
  ],
  "audio": {
    "bgmRef": "bgm_cabin_safe",
    "ambientSfxRefs": ["sfx_fireplace_loop"]
  }
}
```

### 15.2 전투 필드

```json
{
  "id": "field_battle_cabin_01",
  "type": "battle_field",
  "title": "오두막 외곽",
  "mapRef": "map_cabin_outside_01",
  "spawnPoints": [
    {
      "id": "spawn_battle_gate",
      "x": 560,
      "y": 700
    }
  ],
  "enemySpawnAreas": [
    {
      "id": "enemy_lane_north",
      "shape": "circle",
      "x": 560,
      "y": 180,
      "radius": 90
    }
  ],
  "objects": [
    {
      "id": "obj_barricade_01",
      "assetRef": "obj_barricade_wood_01",
      "x": 560,
      "y": 470
    }
  ],
  "audio": {
    "bgmRef": "bgm_battle_cabin_urgent"
  }
}
```

## 16. `encounter` 샘플

```json
{
  "id": "encounter_cabin_defense",
  "title": "오두막 방어전",
  "waves": [
    {
      "id": "wave_01",
      "startAtSec": 0,
      "goal": "기본 적응",
      "spawns": [
        {
          "monsterId": "slime",
          "count": 4,
          "spawnAreaId": "enemy_lane_north",
          "intervalMs": 600
        }
      ]
    },
    {
      "id": "wave_02",
      "startAtSec": 12,
      "goal": "압박 증가",
      "spawns": [
        {
          "monsterId": "slime",
          "count": 6,
          "spawnAreaId": "enemy_lane_north",
          "intervalMs": 450
        },
        {
          "monsterId": "king_slime",
          "count": 1,
          "spawnAreaId": "enemy_lane_north",
          "intervalMs": 0
        }
      ]
    }
  ],
  "victoryCondition": "all_waves_cleared",
  "failureCondition": "player_down",
  "rewardsRef": "reward_01_first_defense"
}
```

## 17. `timeline` 샘플

```json
{
  "id": "timeline_scen_00_prologue",
  "beats": [
    {
      "id": "beat_01",
      "action": "show_background",
      "targetRef": "bg_dream_ruins",
      "durationMs": 0
    },
    {
      "id": "beat_02",
      "action": "play_bgm",
      "targetRef": "bgm_dream_low",
      "durationMs": 0
    },
    {
      "id": "beat_03",
      "action": "show_dialogue",
      "targetRef": "dialogue_scen_00_prologue_ko#line_01",
      "durationMs": 0
    },
    {
      "id": "beat_04",
      "action": "dissolve_character",
      "targetRef": "char_shadow_01",
      "durationMs": 900
    }
  ]
}
```

## 18. `dialogue` 샘플

```json
{
  "id": "dialogue_scen_00_prologue_ko",
  "language": "ko",
  "lines": [
    {
      "id": "line_01",
      "speakerId": "yurika",
      "text": "또 같은 꿈이야... 왜 이렇게 선명하지?"
    },
    {
      "id": "line_02",
      "speakerId": "shadow_voice",
      "text": "이번에는 깨어난다고 끝나지 않을 거야."
    }
  ]
}
```

## 19. `asset_manifest` 샘플

```json
{
  "backgrounds": [
    {
      "id": "bg_cabin_interior_morning",
      "path": "Assets/Addressables/Backgrounds/cabin_interior_morning.png"
    }
  ],
  "characters": [
    {
      "id": "char_yurika_default",
      "path": "Assets/Addressables/Characters/yurika_default.prefab"
    }
  ],
  "audio": [
    {
      "id": "bgm_cabin_safe",
      "path": "Assets/Addressables/Audio/bgm_cabin_safe.ogg"
    }
  ]
}
```

## 20. 제작 시 주의사항

### 20.1 Web SaaS Studio에서 주로 다루는 값

- 카드 연결 순서
- 요약과 제목
- 대사 텍스트
- 간단한 오브젝트 좌표
- BGM, SFX 선택
- 튜토리얼 안내 문구

### 20.2 Local Workspace Agent 또는 Unity에서 주로 다루는 값

- 실제 에셋 연결 경로
- 타임라인 정밀 튜닝
- 애니메이션, 이펙트, 카메라
- Addressables 빌드 대상
- 모바일 빌드 설정

### 20.3 AI 생성 결과를 붙여넣을 때 확인할 것

1. 존재하지 않는 ID가 섞이지 않았는지
2. 카드 목적이 한 문장으로 설명되는지
3. 대사가 너무 길지 않은지
4. 전투 카드가 구현 가능한 몬스터와 규칙만 쓰는지
5. `exit.nextCardIds`가 끊기지 않았는지

## 21. 권장 시작 세트

1차 구현에서는 아래 카드만 우선 지원하는 것이 가장 안전하다.

- `login_card`
- `character_create_card`
- `start_gate_card`
- `scen_card`
- `safe_field_card`
- `battle_field_card`
- `tutorial_card`
- `reward_card`

`branch_card`는 1차에서도 가능하지만, 분기 복잡도가 올라가기 쉬우므로 part당 개수를 제한하는 것이 좋다.
