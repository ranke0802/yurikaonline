# 싱글모드 Studio/Playable 콘텐츠 스키마 상세 명세
작성일: 2026-04-09  
상태: Draft / 구현 기준 문서  
연결 문서: [unity_single_mode_studio_playable_architecture_masterplan_2026-04-09.md](./unity_single_mode_studio_playable_architecture_masterplan_2026-04-09.md)

## 1. 목적

이 문서는 차기작의 콘텐츠를 코드가 아니라 데이터로 관리하기 위한 공통 계약서다.

핵심 목표:

- `part -> card -> field/battle/directing` 계층을 일관된 JSON 구조로 정한다.
- 웹 SaaS 편집툴과 Unity 런타임이 같은 데이터를 읽도록 한다.
- 파일을 작은 단위로 쪼개서 Git 충돌과 협업 비용을 줄인다.
- 검증 가능한 스키마와 규칙을 만들어 자동화 파이프라인에 연결한다.

## 2. 설계 원칙

1. JSON이 사람 기준의 원본이다.
2. Unity 내부 캐시는 파생 산출물이다.
3. 참조는 항상 `id` 기반으로 한다.
4. 문자열 경로 하드코딩보다 `ref` 기반 참조를 우선한다.
5. 큰 파일 하나보다 작은 파일 여러 개를 기본으로 한다.
6. 웹 편집기와 Unity 편집기가 같은 계약을 공유해야 한다.
7. 런타임은 스키마에 없는 임의 필드를 전제로 동작하지 않는다.

## 3. 추천 디렉토리 구조

```text
/content
  /manifest
    content_manifest.json
    schema_registry.json
  /parts
    part_00_login.json
    part_01_start.json
  /cards
    login_entry.json
    scen_00_prologue.json
    safe_field_01_cabin.json
    battle_field_01_defense.json
  /fields
    field_safe_cabin_01.json
    field_battle_cabin_01.json
  /battles
    encounter_cabin_defense.json
  /timelines
    scen_00_prologue_timeline.json
  /dialogue
    dialogue_scen_00_prologue.ko.json
  /audio
    bgm_catalog.json
    sfx_catalog.json
    audio_profiles.json
  /assets
    asset_manifest.json
  /monsters
    slime.json
    king_slime.json
  /items
    item_catalog.json
  /ui
    ui_presets.json
  /tutorials
    tutorial_intro_combat.json
```

## 4. 공통 규칙

### 4.1 ID 규칙

- 소문자 `snake_case` 사용
- 공백 금지
- 파일명과 내부 `id`는 가능하면 일치

예:

- `part_01_start`
- `scen_00_prologue`
- `field_safe_cabin_01`
- `encounter_cabin_defense`

### 4.2 공통 필드

대부분의 콘텐츠 파일은 아래 공통 필드를 가진다.

```json
{
  "schemaVersion": 1,
  "id": "example_id",
  "type": "example_type",
  "title": "표시용 제목",
  "description": "설명",
  "tags": ["optional_tag"]
}
```

### 4.3 참조 필드 규칙

참조 필드 이름은 일관성을 유지한다.

- 단일 참조: `xxxRef`
- 복수 참조: `xxxRefs`
- 다음 카드: `next`
- 조건 분기: `branches`

예:

- `fieldRef`
- `encounterRef`
- `timelineRef`
- `dialogueSetRef`

### 4.4 좌표와 시간

- 좌표 단위: 월드 픽셀 기준
- 회전 단위: degree
- 시간 단위: 초 `float`
- 지속시간 필드명: `duration`
- 지연시간 필드명: `delay`

### 4.5 조건식 표현

1차안에서는 문자열 스크립트보다 구조형 조건식을 권장한다.

예:

```json
{
  "all": [
    { "statGte": { "key": "level", "value": 3 } },
    { "questCompleted": { "questId": "quest_intro_01" } }
  ]
}
```

이유:

- 웹 편집기에서 안전하게 편집 가능
- 검증이 쉬움
- 런타임 해석이 안정적

## 5. 상위 매니페스트 스키마

## 5.1 `content_manifest.json`

역할:

- 현재 활성 콘텐츠 버전 정의
- 엔트리 part 정의
- 플랫폼별 플래그 정의

예시:

```json
{
  "schemaVersion": 1,
  "id": "content_manifest",
  "contentVersion": "0.1.0-alpha",
  "entryPartRef": "part_00_login",
  "supportedPlatforms": ["web", "android", "ios"],
  "defaultLocale": "ko",
  "featureFlags": {
    "housing": true,
    "optionalSocial": false
  }
}
```

## 5.2 `schema_registry.json`

역할:

- 각 파일 타입의 schemaVersion 정의
- 검증기 버전 추적

## 6. `part` 스키마

`part`는 카드 묶음의 상위 단위다.

### 필수 필드

- `schemaVersion`
- `id`
- `type`
- `title`
- `entryCardRef`
- `cardRefs`

### 권장 필드

- `description`
- `tags`
- `unlockConditions`
- `completeConditions`
- `fallbackCardRef`
- `uiThemeRef`

### 예시

```json
{
  "schemaVersion": 1,
  "id": "part_01_start",
  "type": "part",
  "title": "시작 파트",
  "description": "프롤로그부터 오두막 방어까지",
  "entryCardRef": "scen_00_prologue",
  "cardRefs": [
    "scen_00_prologue",
    "scen_01_wakeup",
    "safe_field_01_cabin",
    "battle_field_01_defense",
    "scen_02_tutorial"
  ],
  "unlockConditions": null,
  "completeConditions": {
    "cardReached": "scen_05_cabin_tutorial_end"
  }
}
```

### 검증 규칙

- `entryCardRef`는 `cardRefs` 안에 존재해야 한다.
- 고아 카드가 있으면 경고한다.
- `part` 내부에서 참조하는 카드 타입이 유효해야 한다.
- 순환은 허용 가능하지만 의도되지 않은 루프는 경고한다.

## 7. `card` 공통 스키마

모든 카드는 공통 베이스를 가진다.

### 공통 필드

- `schemaVersion`
- `id`
- `type`
- `title`
- `description`
- `tags`
- `entryConditions`
- `exitConditions`
- `next`
- `branches`
- `uiHints`
- `previewStart`

### 기본 예시

```json
{
  "schemaVersion": 1,
  "id": "scen_00_prologue",
  "type": "scen_card",
  "title": "프롤로그",
  "description": "오프닝 컷신",
  "tags": ["story", "intro"],
  "entryConditions": null,
  "exitConditions": null,
  "next": ["scen_01_wakeup"],
  "branches": [],
  "previewStart": true
}
```

## 8. 카드 타입별 스키마

## 8.1 `login_card`

역할:

- 로그인 UI 표시
- 인증 완료 후 다음 카드로 전이

필수 필드:

- `authProviders`
- `next`

예시:

```json
{
  "schemaVersion": 1,
  "id": "login_entry",
  "type": "login_card",
  "title": "로그인",
  "authProviders": ["guest", "google", "apple"],
  "next": ["character_create_entry"]
}
```

## 8.2 `character_create_card`

역할:

- 캐릭터 생성/선택
- 저장 슬롯 초기화

필수 필드:

- `allowedClasses`
- `startingProfilePresetRef`
- `next`

## 8.3 `start_gate_card`

역할:

- 튜토리얼 스킵 여부
- 신규/복귀 분기

필수 필드:

- `branches`

## 8.4 `scen_card`

역할:

- 컷신/연출/대사

필수 필드:

- `timelineRef`
- `dialogueSetRef`
- `audioProfileRef`
- `next`

권장 필드:

- `backgroundRef`
- `actorLayoutRef`
- `inputLock`
- `skippable`

예시:

```json
{
  "schemaVersion": 1,
  "id": "scen_01_wakeup",
  "type": "scen_card",
  "title": "악몽에서 깨어나다",
  "timelineRef": "timeline_scen_01_wakeup",
  "dialogueSetRef": "dialogue_scen_01_wakeup",
  "audioProfileRef": "audio_profile_dream_intro",
  "backgroundRef": "bg_dream_room",
  "inputLock": true,
  "skippable": false,
  "next": ["safe_field_01_cabin"]
}
```

## 8.5 `safe_field_card`

역할:

- 안전지대 필드 진입
- NPC, 하우징, 상호작용, 탐색 루프

필수 필드:

- `fieldRef`
- `spawnPointId`
- `interactionSetRef`

권장 필드:

- `housingEnabled`
- `ambientProfileRef`
- `returnCardRef`

## 8.6 `battle_field_card`

역할:

- 전투 필드 시작
- 인카운터 실행
- 승패 전이

필수 필드:

- `fieldRef`
- `encounterRef`
- `battleRules`
- `winNext`
- `loseNext`

예시:

```json
{
  "schemaVersion": 1,
  "id": "battle_field_01_defense",
  "type": "battle_field_card",
  "title": "오두막 방어",
  "fieldRef": "field_battle_cabin_01",
  "encounterRef": "encounter_cabin_defense",
  "battleRules": {
    "allowRetry": true,
    "revivePolicy": "checkpoint"
  },
  "winNext": ["scen_02_tutorial"],
  "loseNext": ["battle_field_01_defense_retry"]
}
```

## 8.7 `tutorial_card`

역할:

- 단계별 가이드
- 입력 허용/제한

필수 필드:

- `steps`
- `completionRule`

## 8.8 `branch_card`

역할:

- 조건에 따라 분기

필수 필드:

- `branches`
- `fallbackNext`

## 8.9 `reward_card`

역할:

- 연출형 보상 지급

필수 필드:

- `rewardTableRef`
- `next`

## 9. `field` 스키마

`field`는 공간 그 자체를 정의한다.

### 필수 필드

- `schemaVersion`
- `id`
- `type`
- `title`
- `fieldMode`
- `size`
- `cameraBounds`
- `layers`
- `spawnPoints`

### 권장 필드

- `bgmRef`
- `ambientRef`
- `objectRefs`
- `npcRefs`
- `interactionPoints`
- `lightingProfileRef`
- `navigationRef`

### 예시

```json
{
  "schemaVersion": 1,
  "id": "field_safe_cabin_01",
  "type": "field",
  "title": "오두막",
  "fieldMode": "safe_field",
  "size": { "width": 3200, "height": 1800 },
  "cameraBounds": { "x": 0, "y": 0, "w": 3200, "h": 1800 },
  "bgmRef": "bgm_cabin",
  "spawnPoints": [
    { "id": "default", "x": 420, "y": 920 }
  ],
  "layers": [
    { "id": "background", "assetRef": "bg_cabin_interior" },
    { "id": "objects", "assetRef": "layer_cabin_props" }
  ],
  "interactionPoints": [
    { "id": "door_exit", "x": 1120, "y": 960, "triggerRef": "trigger_leave_cabin" }
  ]
}
```

### 검증 규칙

- `fieldMode`는 `safe_field`, `battle_field`, `directed_scene_field` 중 하나
- `spawnPoints`는 최소 1개 필요
- `layers`의 `assetRef`는 자산 매니페스트에 존재해야 함

## 10. `battle` / `encounter` 스키마

`encounter`는 전투의 규칙과 웨이브를 정의한다.

### 필수 필드

- `schemaVersion`
- `id`
- `type`
- `title`
- `winCondition`
- `loseCondition`
- `waves`

### 권장 필드

- `bgmRef`
- `introTimelineRef`
- `outroTimelineRef`
- `rewardTableRef`
- `difficultyTags`

### 예시

```json
{
  "schemaVersion": 1,
  "id": "encounter_cabin_defense",
  "type": "encounter",
  "title": "오두막 방어",
  "winCondition": "defeat_all_waves",
  "loseCondition": "player_dead",
  "bgmRef": "bgm_cabin_battle",
  "waves": [
    {
      "id": "wave_01",
      "delay": 0,
      "spawnGroups": [
        {
          "spawnAreaId": "north_path",
          "entries": [
            { "monsterRef": "slime", "count": 6 }
          ]
        }
      ]
    },
    {
      "id": "wave_02",
      "delay": 8,
      "spawnGroups": [
        {
          "spawnAreaId": "center_gate",
          "entries": [
            { "monsterRef": "king_slime", "count": 1, "boss": true }
          ]
        }
      ]
    }
  ]
}
```

### 검증 규칙

- `waves`는 1개 이상
- 각 `monsterRef`는 몬스터 카탈로그에 존재해야 함
- `boss: true`는 웨이브당 정책에 따라 제한 가능

## 11. `timeline` 스키마

`scen_card`가 참조하는 연출 시퀀스다.

### 필수 필드

- `schemaVersion`
- `id`
- `type`
- `tracks`

### 트랙 타입 예시

- `fade_track`
- `dialogue_track`
- `audio_track`
- `actor_track`
- `camera_track`
- `effect_track`

### 예시

```json
{
  "schemaVersion": 1,
  "id": "timeline_scen_01_wakeup",
  "type": "timeline",
  "tracks": [
    {
      "trackType": "fade_track",
      "clips": [
        { "t": 0.0, "action": "fade_in", "duration": 1.2 }
      ]
    },
    {
      "trackType": "audio_track",
      "clips": [
        { "t": 0.0, "action": "play_bgm", "bgmRef": "bgm_dream" }
      ]
    }
  ]
}
```

## 12. `dialogue` 스키마

권장 방식:

- 대사는 타임라인과 분리
- 로컬라이징 키와 본문 세트를 따로 보관

예시:

```json
{
  "schemaVersion": 1,
  "id": "dialogue_scen_01_wakeup",
  "type": "dialogue_set",
  "locale": "ko",
  "lines": [
    {
      "id": "line_001",
      "speaker": "Narration",
      "text": "차가운 새벽 공기가 폐로 파고들었다."
    }
  ]
}
```

## 13. `asset_manifest` 스키마

역할:

- 에셋 ID와 실제 로드 위치 매핑
- 플랫폼별 번들 정보 관리

예시:

```json
{
  "schemaVersion": 1,
  "id": "asset_manifest",
  "assets": [
    {
      "id": "bg_cabin_interior",
      "kind": "image",
      "addressableKey": "bg/cabin/interior",
      "tags": ["background", "safe_field"]
    }
  ]
}
```

## 14. 저장 데이터와의 연결 규칙

콘텐츠 스키마는 저장 데이터와 느슨하게 연결한다.

### 저장 데이터가 직접 가지는 참조

- 현재 `partId`
- 현재 `cardId`
- 마지막 `fieldId`
- 체크포인트 `encounterId`
- 완료한 `partIds`
- 완료한 `cardFlags`

### 저장 데이터가 직접 가지지 않는 것

- 타임라인 전체 클립 상태
- 필드 원본 정의 전체
- 카드 정의 전체

즉, 저장은 참조 중심이어야 한다.

## 15. 자동 검증 항목

1. `part.entryCardRef` 유효성
2. `card.next` 참조 유효성
3. 존재하지 않는 `fieldRef` / `encounterRef` 검사
4. 중복 ID 검사
5. 순환 분기 경고
6. 필수 필드 누락 검사
7. 잘못된 자산 참조 검사
8. 잘못된 몬스터/아이템 참조 검사

## 16. 현재 프로젝트 데이터와의 매핑

현재 자산에서 바로 옮기기 쉬운 것:

- `assets/data/monsters/*.json` -> `content/monsters/*.json`
- `assets/data/quests/*.json` -> 차기 퀘스트 카탈로그
- `assets/data/tutorials/*.json` -> `tutorial_card` 데이터 기반
- `assets/data/zones/*.json` -> `field` 초안

변환이 필요한 것:

- 현재 `zone` 안의 몬스터 스폰 정보 -> `field` + `encounter` 분리
- 현재 스토리/튜토리얼 절차 -> `scen_card` / `tutorial_card` / `timeline` 분해

## 17. 구현 우선순위

1. `part`
2. `card`
3. `field`
4. `encounter`
5. `timeline`
6. `dialogue`
7. `asset_manifest`

이 순서가 좋은 이유는, 그래프 구조를 먼저 고정해야 웹 편집기와 런타임이 동시에 움직일 수 있기 때문이다.

