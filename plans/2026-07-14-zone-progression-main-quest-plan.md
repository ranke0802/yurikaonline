# 2026-07-14 맵 진행형 메인 퀘스트 계획서

## 상태

- 범위: 기획/아키텍처 계획
- 구현 상태: 1차 적용 진행
- 목표 버전: `0.02.055` 이후 콘텐츠 확장 패치
- 기준 브랜치: `mmorpg_online`

## 1. 목표

현재 퀘스트는 `바람 언덕(zone_1)`의 슬라임/대왕 슬라임 루프에 집중되어 있다. 앞으로는 플레이어가 레벨과 퀘스트 흐름을 따라 자연스럽게 다음 맵으로 이동하도록 만든다.

핵심 목표는 다음과 같다.

1. 튜토리얼 이후 `zone_1 → zone_2 → zone_3 → zone_4`로 이어지는 메인 퀘스트 체인을 만든다.
2. 각 맵의 일반 몬스터 사냥, 보스 토벌, 전용 무기 획득이 하나의 챕터처럼 느껴지게 한다.
3. 미니맵 클릭 시 열리는 맵 이동 모달과 퀘스트 목표를 연결해 “다음에 어디로 가야 하는지”를 명확히 보여준다.
4. 기존 레벨 제한, 멀티 보상 영수증, 보스 전용 무기, 강화 체계를 유지한다.
5. 강제 워프가 아니라 “퀘스트 완료 → 다음 맵 추천/이동 버튼 강조” 방식으로 유도한다.

## 2. 현재 구조 요약

### 맵/레벨

| 맵 | 요구 레벨 | 권장 레벨 | 일반 몬스터 | 보스 | 보스 무기 |
| --- | ---: | ---: | --- | --- | --- |
| `zone_1` 바람 언덕 | 1 | 1-4 | `slime` | `king_slime` | `magic_staff` |
| `zone_2` 안개빛 호수 | 5 | 5-9 | `squirtle` | `ruin_wobbuffet` | `tidal_staff` |
| `zone_3` 뇌광 숲 | 10 | 10-14 | `emolga` | `thunder_pikachu` | `storm_staff` |
| `zone_4` 별그늘 유적 | 15 | 15-20 | `gastly` | `astral_sylveon` | `astral_staff` |

### 기존 퀘스트

- `quest_slime_10`
- `quest_slime_30`
- `quest_boss_king_slime`
- `quest_slime_repeat`

현재는 `zone_1` 이후의 맵 이동을 퀘스트가 직접 안내하지 않는다.

### 현재 하드코딩 위험 지점

신규 퀘스트를 안정적으로 늘리려면 다음 지점을 먼저 분리해야 한다.

- `QuestManager.loadQuests()`가 로드할 퀘스트 파일명을 코드에 직접 들고 있다.
- `QuestManager.restoreFromLegacy()`가 슬라임/대왕 슬라임 전용 진행도만 복원한다.
- `UIManager.updateQuestUI()`가 `slimeQuestClaimed`, `slime30QuestClaimed`, `bossClearCount` 같은 저장 필드를 직접 보고 HUD를 만든다.
- `Player.receiveReward()`가 일부 퀘스트 킬을 슬라임/대왕 슬라임 중심으로 해석한다.

개선 방향은 “퀘스트 정의와 흐름은 JSON, 런타임 코드는 범용 이벤트 처리기”로 고정한다.

## 3. 설계 원칙

### 3.1 퀘스트는 “길 안내” 역할을 한다

플레이어가 스스로 사냥하며 성장하되, 퀘스트 UI가 다음 목표를 계속 알려줘야 한다.

- 현재 맵에서 해야 할 일: 일반 몬스터 처치, 보스 조건 달성, 보스 토벌
- 다음 맵으로 가야 하는 시점: 레벨/챕터 클리어 조건 만족
- 레벨이 부족한 경우: 현재 맵 반복 의뢰 또는 추천 사냥 안내

### 3.2 보스 토벌은 챕터 클리어다

각 필드 보스는 해당 맵 챕터의 마무리다.

- 보스 처치 시 전용 무기 지급
- 전용 무기의 특수 옵션을 보상 모달에서 명확히 설명
- 다음 맵 이동 퀘스트를 즉시 활성화

### 3.3 맵 이동은 미니맵 모달과 결합한다

미니맵 클릭 → 맵 이동 모달 → 퀘스트 추천 상태를 표시한다.

모달에는 다음 정보를 표시한다.

- 맵 이름/권장 레벨/입장 가능 여부
- 현재 메인 퀘스트 추천 맵 배지
- 잠김 사유: `Lv.5 필요`, `이전 보스 토벌 필요` 등
- 이동 가능 시 “퀘스트 진행하러 이동” 버튼 강조

### 3.4 멀티에서도 퀘스트 판정은 영수증 기반으로 유지한다

몬스터 처치 카운트와 보스 클리어는 기존 보상 영수증 흐름을 사용한다.

- 일반 몬스터 처치: `questKill` 또는 `questKills`
- 보스 토벌: 참여자별 durable/normal reward receipt
- 호스트 이전/재접속 중복 지급 방지
- `QuestManager.restoreFromLegacy()`로 UI/내부 상태 동기화

### 3.5 퀘스트 추가/변경/삭제는 JSON으로 끝나야 한다

신규 맵이나 신규 챕터를 추가할 때 런타임 코드가 특정 퀘스트 ID를 몰라야 한다.

- 퀘스트 목록은 `quest_catalog.json`이 관리한다.
- 퀘스트 조건/목표/보상 안내/다음 퀘스트/추천 맵은 개별 퀘스트 JSON이 관리한다.
- UI는 `QuestManager`가 만든 ViewModel만 렌더링한다.
- 기존 슬라임 저장 구조는 `LegacyQuestAdapter`에서만 해석한다.
- 삭제는 즉시 파일 제거가 아니라 `enabled: false`, `deprecated: true`, `replacementId`로 처리한다.

## 4. 메인 퀘스트 체인 제안

### Chapter 0. 튜토리얼

| 퀘스트 | 조건 | 보상 | 다음 흐름 |
| --- | --- | --- | --- |
| `quest_tutorial_basic_training` | 기본 조작/공격/스킬 안내 완료 | 슬라임 퀘스트 개방 | `quest_wind_slime_10` |

기존 튜토리얼 완료 후 `quest_slime_10`을 여는 구조는 유지하되, 명칭과 표시만 메인 챕터 흐름에 맞춘다.

### Chapter 1. 바람 언덕

목표: 기본 전투, 첫 성장, 첫 보스, 첫 무기 획득.

| 퀘스트 ID | 제목 | 조건 | 권장 레벨 | 보상/효과 |
| --- | --- | --- | ---: | --- |
| `quest_wind_slime_10` | 흔들리는 초원 | 슬라임 10마리 처치 | 1-2 | 지혜 +2 또는 EXP/마석 |
| `quest_wind_slime_30` | 바람 언덕 정화 | 슬라임 누적 30마리 처치 | 3-4 | 체력 +3, 대왕 슬라임 소환 |
| `quest_wind_king_slime` | 대왕 슬라임 토벌 | 대왕 슬라임 1회 처치 | 4 | `magic_staff`, 축복 강화석 |
| `quest_to_misty_lake` | 안개빛 호수로 | Lv.5 달성 + 대왕 슬라임 토벌 | 5 | `zone_2` 추천/이동 모달 강조 |

설계 메모:

- 기존 `quest_slime_10`, `quest_slime_30`, `quest_boss_king_slime`는 데이터 ID를 유지해도 된다.
- 화면 표시명만 챕터형으로 바꾸면 마이그레이션 부담이 작다.
- `quest_to_misty_lake`는 사냥형이 아니라 이동 유도형 퀘스트다.

### Chapter 2. 안개빛 호수

목표: 새 맵 적응, 물/안개 테마 몬스터, 두 번째 보스 무기.

| 퀘스트 ID | 제목 | 조건 | 권장 레벨 | 보상/효과 |
| --- | --- | --- | ---: | --- |
| `quest_lake_arrival` | 안개 속 첫 발 | `zone_2` 입장 | 5 | 소량 EXP/마석, 호수 사냥 안내 |
| `quest_lake_squirtle_12` | 물안개 정찰 | `squirtle` 12마리 처치 | 5-6 | EXP, 마석, 강화석 소량 |
| `quest_lake_squirtle_30` | 흐린 물결의 핵 | `squirtle` 누적 30마리 처치 | 7-8 | 보스 위치 안내, 보스 활성 강조 |
| `quest_lake_ruin_wobbuffet` | 유적의 마자용 | `ruin_wobbuffet` 처치 | 8-9 | `tidal_staff`, 보스 무기 설명 |
| `quest_to_thunder_forest` | 뇌광 숲으로 | Lv.10 달성 + 호수 보스 처치 | 10 | `zone_3` 추천/이동 모달 강조 |

보스 무기 안내:

- `tidal_staff`
- 푸른 파이어볼/연속 폭발 계열 옵션을 보상 모달에서 설명
- “파이어볼 빌드가 열렸다”는 느낌을 준다.

### Chapter 3. 뇌광 숲

목표: 빠른 몬스터와 원거리 위협 대응, 세 번째 보스 무기.

| 퀘스트 ID | 제목 | 조건 | 권장 레벨 | 보상/효과 |
| --- | --- | --- | ---: | --- |
| `quest_forest_arrival` | 번개가 닿은 숲 | `zone_3` 입장 | 10 | 뇌광 숲 안내 |
| `quest_forest_emolga_15` | 흔들리는 나뭇가지 | `emolga` 15마리 처치 | 10-11 | EXP, 마석 |
| `quest_forest_emolga_35` | 번개길 개방 | `emolga` 누적 35마리 처치 | 12-13 | 보스 위치 안내 |
| `quest_forest_thunder_pikachu` | 뇌제의 시험 | `thunder_pikachu` 처치 | 13-14 | `storm_staff`, 축복 강화석 |
| `quest_to_astral_ruins` | 별그늘 유적으로 | Lv.15 달성 + 뇌광 숲 보스 처치 | 15 | `zone_4` 추천/이동 모달 강조 |

보스 무기 안내:

- `storm_staff`
- 매직 미사일 강화/마나 비용 감소 계열 옵션을 강조
- “빠르게 몰아치는 미사일 빌드”를 테마로 한다.

### Chapter 4. 별그늘 유적

목표: 현재 최종 지역, 어두운 시각 톤, 고급 보스 무기.

| 퀘스트 ID | 제목 | 조건 | 권장 레벨 | 보상/효과 |
| --- | --- | --- | ---: | --- |
| `quest_ruins_arrival` | 별빛 아래의 폐허 | `zone_4` 입장 | 15 | 유적 안내 |
| `quest_ruins_gastly_18` | 그림자 고오스 | `gastly` 18마리 처치 | 15-16 | EXP, 마석 |
| `quest_ruins_gastly_40` | 별그늘 봉인 해제 | `gastly` 누적 40마리 처치 | 17-19 | 보스 위치 안내 |
| `quest_ruins_astral_sylveon` | 성좌의 님피아 | `astral_sylveon` 처치 | 19-20 | `astral_staff`, 최종 챕터 보상 |
| `quest_epilogue_current_end` | 별빛의 끝 | 별그늘 보스 처치 | 20 | 반복 의뢰/장비 강화 안내 |

보스 무기 안내:

- `astral_staff`
- 크림슨 체인/기본 공격 강화 계열 옵션 강조
- 현재 최종 무기라는 희소성을 명확히 보여준다.

## 5. 레벨/경험치 유도 계획

플레이어가 메인 퀘스트만 밀어도 다음 맵 최소 레벨에 근접해야 한다. 단, 모든 보스 직후 즉시 다음 맵 레벨이 되지 않아도 된다. 부족분은 짧은 반복 사냥으로 채우게 한다.

| 구간 | 목표 | 설계 기준 |
| --- | --- | --- |
| Lv.1 → Lv.5 | 바람 언덕 완료 | 튜토리얼 + 슬라임 30 + 대왕 슬라임으로 Lv.4 후반~Lv.5 |
| Lv.5 → Lv.10 | 안개빛 호수 완료 | `squirtle` 30 전후 + 보스로 Lv.9 후반~Lv.10 |
| Lv.10 → Lv.15 | 뇌광 숲 완료 | `emolga` 35 전후 + 보스로 Lv.14 후반~Lv.15 |
| Lv.15 → Lv.20 | 별그늘 유적 완료 | `gastly` 40 전후 + 보스로 Lv.20 근접 |

주의:

- 이미 구현된 레벨 차이 경험치 감소는 유지한다.
- 다음 맵 요구 레벨보다 낮으면 퀘스트 UI에 “현재 맵 반복 의뢰로 성장하세요”를 보여준다.
- 다음 맵 요구 레벨보다 지나치게 높으면 보상 경험치 효율은 감소하되, 메인 퀘스트 클리어 자체는 막지 않는다.

## 6. 반복 퀘스트/막힘 방지

메인 퀘스트 사이에 레벨이 부족한 경우 다음 반복 의뢰를 제공한다.

| 위치 | 반복 의뢰 | 조건 | 목적 |
| --- | --- | --- | --- |
| 바람 언덕 | 슬라임 잔당 정리 | 슬라임 20마리 | Lv.5 부족분 보정 |
| 안개빛 호수 | 안개빛 순찰 | `squirtle` 20마리 | Lv.10 부족분 보정 |
| 뇌광 숲 | 번개깃 수집 | `emolga` 20마리 | Lv.15 부족분 보정 |
| 별그늘 유적 | 그림자 정화 | `gastly` 25마리 | Lv.20 이후 강화 재화 |

반복 의뢰는 메인 퀘스트를 가리지 않아야 한다. UI 우선순위는 항상 메인 퀘스트가 위다.

## 7. JSON 주도 퀘스트 설계 구조

목표는 퀘스트를 추가/변경/비활성화할 때 런타임 코드를 거의 건드리지 않는 것이다. 코드가 알아야 하는 것은 “퀘스트 ID”가 아니라 “이벤트 타입과 objective 타입”이다.

### 7.1 파일 구조

초기에는 현재 경로와 호환되도록 `assets/data/quests/`의 평면 구조를 유지한다. 단, 로드는 카탈로그 기반으로 전환한다.

```text
assets/data/quests/
  quest_catalog.json
  quest_slime_10.json
  quest_slime_30.json
  quest_boss_king_slime.json
  quest_slime_repeat.json
  quest_to_misty_lake.json
  quest_lake_arrival.json
  quest_lake_squirtle_12.json
  ...
```

장기적으로 퀘스트가 더 많아지면 다음처럼 폴더형으로 확장할 수 있다. 카탈로그가 `path`를 들고 있으면 런타임 수정 없이 이동 가능하다.

```text
assets/data/quests/
  quest_catalog.json
  main/zone_1/quest_slime_10.json
  main/zone_2/quest_lake_squirtle_12.json
  repeat/zone_2/quest_lake_repeat_patrol.json
```

### 7.2 `quest_catalog.json`

`QuestManager.loadQuests()`는 더 이상 파일명을 코드에 쓰지 않고 이 카탈로그만 읽는다.

```json
{
  "schemaVersion": 2,
  "activeSet": "main_progression_v1",
  "quests": [
    {
      "id": "quest_slime_10",
      "path": "quest_slime_10.json",
      "enabled": true,
      "chapter": "zone_1",
      "order": 110,
      "tags": ["main", "legacy-compatible"]
    },
    {
      "id": "quest_to_misty_lake",
      "path": "quest_to_misty_lake.json",
      "enabled": true,
      "chapter": "zone_1",
      "order": 140,
      "tags": ["main", "travel"]
    }
  ],
  "aliases": [
    {
      "from": "quest_wind_slime_10",
      "to": "quest_slime_10",
      "reason": "기존 저장 데이터 호환"
    }
  ]
}
```

카탈로그 규칙:

- `enabled: false`인 퀘스트는 신규 활성화하지 않는다.
- 이미 진행 중인 저장 데이터에 존재하면 `deprecated` 퀘스트도 읽을 수 있어야 한다.
- `aliases`는 퀘스트 ID 변경/정리 시 기존 저장 데이터를 새 ID로 매핑한다.
- `order`는 HUD 우선순위와 챕터 표시 순서를 결정한다.

### 7.3 개별 퀘스트 JSON 스키마

퀘스트 JSON은 “조건, 목표, 보상 안내, 후속 액션, UI 문구”를 모두 가진다.

```json
{
  "schemaVersion": 2,
  "id": "quest_lake_squirtle_12",
  "enabled": true,
  "type": "main",
  "chapter": "zone_2",
  "order": 220,
  "title": "물안개 정찰",
  "description": "안개빛 호수의 물방울 꼬부기를 처치해 호수의 흐름을 살펴보세요.",
  "prerequisites": [
    { "type": "questCompleted", "questId": "quest_lake_arrival" },
    { "type": "level", "level": 5 }
  ],
  "activation": {
    "mode": "auto",
    "events": ["questCompleted", "zoneEntered"]
  },
  "objectives": [
    {
      "id": "kill_squirtle",
      "type": "kill",
      "target": "squirtle",
      "count": 12,
      "scope": "player",
      "accumulate": true,
      "uiText": "물방울 꼬부기 처치 {current}/{count}"
    }
  ],
  "rewards": {
    "grant": {
      "exp": 180,
      "manastone": 60
    },
    "display": [
      { "type": "exp", "amount": 180 },
      { "type": "manastone", "amount": 60 }
    ]
  },
  "ui": {
    "hudPriority": 220,
    "recommendedZone": "zone_2",
    "chapterLabel": "Chapter 2 · 안개빛 호수",
    "nextHint": "완료 후 호수 깊은 곳의 보스 단서가 열립니다."
  },
  "onComplete": {
    "unlocks": ["quest_lake_squirtle_30"],
    "logMessage": "안개빛 호수의 첫 정찰을 마쳤습니다."
  }
}
```

### 7.4 지원 objective 타입

| 타입 | 이벤트 | 필수 필드 | 용도 |
| --- | --- | --- | --- |
| `kill` | `monsterKilled` | `target`, `count` | 일반 몬스터 처치 |
| `bossKill` | `bossKilled` | `target`, `count` | 보스 처치. UI/보상 설명을 보스 전용으로 표현 |
| `level` | `levelChanged` | `level` | 레벨 달성 |
| `travel` | `zoneEntered` | `targetZone` | 특정 맵 입장 |
| `collect` | `itemReceived` | `itemId`, `count` | 추후 수집 퀘스트 |
| `interact` | `objectInteracted` | `targetId`, `count` | 추후 NPC/오브젝트 상호작용 |
| `flag` | `flagChanged` | `key`, `value` | 튜토리얼 완료, 계정 연동 등 시스템 플래그 |

objective 공통 필드:

- `id`: 저장/동기화에 쓰는 objective 고유 ID. 배열 순서에 의존하지 않는다.
- `scope`: `player`, `partyParticipants`, `hostOnly` 중 하나.
- `accumulate`: 누적 처치인지 현재 단계 처치인지 결정한다.
- `zoneId`: 특정 필드에서만 인정해야 할 때 사용한다.
- `receiptRequired`: 멀티 보상 영수증으로만 인정해야 하는지 결정한다.
- `uiText`: HUD에 표시할 문구 템플릿.

### 7.5 퀘스트 상태 저장 모델

신규 저장 모델은 퀘스트 정의와 분리한다. JSON 정의가 바뀌어도 저장 데이터는 진행도만 가진다.

```json
{
  "schemaVersion": 2,
  "active": {
    "quest_lake_squirtle_12": {
      "acceptedAt": 1783995900000,
      "objectives": {
        "kill_squirtle": { "current": 8, "complete": false }
      }
    }
  },
  "completed": {
    "quest_slime_10": { "completedAt": 1783991000000, "count": 1 }
  },
  "flags": {
    "tutorial.basic_training.completed": true
  }
}
```

저장 원칙:

- 저장 데이터에는 제목/설명/보상 문구를 저장하지 않는다.
- objective 진행도는 배열 인덱스가 아니라 objective `id`로 저장한다.
- 반복 퀘스트는 `completed[questId].count`와 `active[questId].cycle`로 회차를 구분한다.
- 기존 `player.questData`는 당분간 유지하되, 신규 시스템에서는 `LegacyQuestAdapter`만 접근한다.

### 7.6 런타임 모듈 책임 분리

실제 구현 시 클래스가 반드시 이 이름일 필요는 없지만 책임은 분리한다.

| 책임 | 권장 모듈 | 설명 |
| --- | --- | --- |
| 퀘스트 정의 로드 | `QuestDefinitionLoader` 또는 `QuestManager.loadDefinitions()` | `quest_catalog.json`을 읽고 enabled/deprecated/alias 처리 |
| 스키마 검증 | `QuestContentValidator` | ID 중복, 선행 퀘스트, 몬스터/맵/아이템 참조 검증 |
| 상태 관리 | `QuestStateStore` | active/completed/flags 직렬화/역직렬화 |
| 레거시 호환 | `LegacyQuestAdapter` | 기존 `questData` ↔ 신규 questState 변환 |
| 이벤트 처리 | `QuestEventRouter` | `monsterKilled`, `bossKilled`, `zoneEntered`, `levelChanged` 처리 |
| 후속 액션 | `QuestActionRunner` | unlock, spawnBoss, recommendZone, showModal, setFlag 실행 |
| UI 모델 | `QuestViewModelBuilder` | HUD/맵 모달/보스 모달에 필요한 표시 모델 생성 |

중요한 금지선:

- `UIManager`는 `slimeQuestClaimed` 같은 필드를 직접 읽지 않는다.
- `QuestManager` 본문에는 신규 퀘스트 ID별 if-else를 추가하지 않는다.
- `Player.receiveReward()`는 앞으로 `questKill`을 특정 몬스터명으로 분기하지 않고 `QuestManager.handleEvent()`에 전달한다.
- 기존 슬라임 예외는 전부 `LegacyQuestAdapter` 안에 격리한다.

### 7.7 퀘스트 이벤트 표준

런타임은 퀘스트 JSON을 직접 수정하지 않고 이벤트만 발생시킨다.

```json
{
  "type": "monsterKilled",
  "target": "squirtle",
  "zoneId": "zone_2",
  "count": 1,
  "source": "rewardReceipt",
  "receiptId": "normal_reward_v2:zone_2:...",
  "participantUid": "player_uid"
}
```

주요 이벤트:

- `tutorialCompleted`
- `monsterKilled`
- `bossKilled`
- `levelChanged`
- `zoneEntered`
- `itemReceived`
- `questCompleted`
- `flagChanged`

`questKill`/`questKills` 영수증은 `monsterKilled` 또는 `bossKilled` 이벤트로 변환한다. 이렇게 하면 멀티 보상 로직은 유지하면서 퀘스트 종류만 JSON으로 늘릴 수 있다.

### 7.8 보상과 보스 무기 정책

보스 전용 무기는 이미 보스 드롭/ durable reward 정책에서 관리한다. 퀘스트 JSON은 보스 무기를 직접 중복 지급하지 않고 “획득 안내”와 “다음 목표”를 표시한다.

```json
{
  "bossRewardGuide": {
    "bossId": "ruin_wobbuffet",
    "itemId": "tidal_staff",
    "title": "해일의 지팡이 획득 가능",
    "skillSummary": "물결의 힘으로 파이어볼 계열 전투를 강화합니다."
  }
}
```

예외적으로 퀘스트가 지급하는 보상은 EXP, 마석, 스탯, 강화석처럼 영수증 충돌 위험이 낮은 보상으로 제한한다.

### 7.9 추가/변경/삭제 운영 규칙

퀘스트 추가:

1. 개별 퀘스트 JSON 작성.
2. `quest_catalog.json`에 `id`, `path`, `chapter`, `order`, `enabled` 추가.
3. `npm run validate:quests`로 스키마/참조/순환 선행조건 검증.
4. 런타임 코드 수정 없이 동작해야 한다.

퀘스트 변경:

- 제목/설명/목표 수치/보상 수치는 JSON만 수정한다.
- objective `id`는 저장 데이터 호환을 위해 가능한 유지한다.
- objective를 삭제해야 하면 `deprecatedObjectives`에 남겨 저장 데이터 복구를 돕는다.

퀘스트 삭제:

- 배포 중인 퀘스트 파일을 즉시 삭제하지 않는다.
- `enabled: false`, `deprecated: true`, `replacementId`를 먼저 지정한다.
- 이미 진행 중인 플레이어는 자동 포기/대체/완료 처리 정책 중 하나를 JSON에 명시한다.

```json
{
  "id": "old_quest_id",
  "enabled": false,
  "deprecated": true,
  "replacementId": "new_quest_id",
  "migration": {
    "mode": "replaceIfActive",
    "preserveProgressRatio": true
  }
}
```

### 7.10 검증 스크립트 요구사항

신규 `scripts/validate-quest-content.js`를 추가한다.

검증 항목:

1. `quest_catalog.json`에 등록된 모든 파일이 존재한다.
2. 모든 퀘스트 ID/objective ID가 중복되지 않는다.
3. `prerequisites`, `unlocks`, `replacementId`, `aliases`가 존재하는 퀘스트를 가리킨다.
4. 선행 퀘스트 그래프에 순환이 없다.
5. objective의 `target`, `targetZone`, `itemId`가 실제 몬스터/존/아이템 데이터에 존재한다.
6. 보상 아이템/보스 무기 안내가 실제 아이템 카탈로그와 일치한다.
7. `enabled: false` 퀘스트가 신규 활성화 루트에 남아 있지 않다.
8. HUD에 표시할 수 없는 퀘스트, 보상 없는 자동 완료 퀘스트 같은 위험 상태를 경고한다.

## 8. UI/UX 계획

### HUD 퀘스트 카드

HUD는 저장 데이터나 특정 퀘스트 ID를 직접 해석하지 않는다. `QuestManager.getHudQuestView()`가 반환하는 ViewModel만 렌더링한다.

```json
{
  "questId": "quest_lake_squirtle_12",
  "type": "main",
  "chapterLabel": "Chapter 2 · 안개빛 호수",
  "title": "물안개 정찰",
  "objectiveText": "물방울 꼬부기 처치 8/12",
  "rewardText": "EXP 180 · 마석 60",
  "nextHint": "완료 후 호수 깊은 곳의 보스 단서가 열립니다.",
  "canClaim": false,
  "cta": null,
  "recommendedZone": "zone_2",
  "priority": 220
}
```

HUD 퀘스트 카드에 다음 상태를 추가한다.

- 현재 챕터명: `Chapter 2 · 안개빛 호수`
- 목표: `물안개 꼬부기 처치 8/12`
- 다음 안내: `완료 후 유적의 마자용 위치가 표시됩니다`
- 이동 퀘스트일 때: `미니맵을 눌러 안개빛 호수로 이동하세요`

### 맵 이동 모달

미니맵 클릭 시 맵 목록을 보여준다. 맵 카드의 추천/잠금/CTA 문구는 `QuestManager.getMapTravelQuestView(zoneId)`에서 받는다.

각 맵 카드 상태:

- `현재 위치`
- `메인 퀘스트 추천`
- `입장 가능`
- `잠김: Lv.10 필요`
- `잠김: 이전 보스 토벌 필요`

이동 버튼 문구:

- 일반: `이동`
- 추천 맵: `퀘스트 진행하러 이동`
- 잠김: disabled + 이유 표시

맵 이동 모달은 처음에는 레벨 잠금만 하드락으로 유지하고, 선행 보스 미토벌은 “추천 경고”로 시작한다. 저장 마이그레이션이 안정화된 뒤에 보스 클리어 하드락을 검토한다.

### 보스 처치 모달

보스 처치 시 다음 정보를 반드시 보여준다.

- 보스 이름
- 획득한 전용 무기
- 무기의 특수 기술 요약
- 다음 목표: `Lv.10 달성 후 뇌광 숲으로 이동`

보스 무기 지급 자체는 보스 드롭/durable reward 경로가 맡고, 퀘스트 UI는 해당 보상 설명과 다음 퀘스트 안내만 담당한다.

## 9. 멀티/저장/동기화 계획

### 일반 몬스터 처치

- 현재처럼 호스트가 보상 영수증을 발행한다.
- `questKill`/`questKills`가 플레이어별로 적용된다.
- 수신 후 `Player.receiveReward()`는 `QuestManager.handleEvent({ type: "monsterKilled", ... })`를 호출한다.
- 기존 슬라임 퀘스트 호환이 필요한 경우에만 `LegacyQuestAdapter`가 `questData`를 함께 갱신한다.
- 신규 퀘스트 진행도는 `questState.active[questId].objectives[objectiveId]`에 저장한다.

### 보스 처치

- 참여자 목록 기준으로 보스 보상을 발행한다.
- 보스 무기 지급은 durable boss reward 경로를 유지한다.
- 퀘스트 클리어도 동일한 참여자에게만 `bossKilled` 이벤트로 인정한다.
- 재접속/호스트 이전 중복 지급 방지는 기존 rewardId 체계를 유지한다.

### 맵 이동

- `currentZoneId` 저장 유지.
- `WorldScene.changeZone()` 성공 후 `QuestManager.handleEvent({ type: "zoneEntered", targetZone })`를 호출한다.
- 이동 퀘스트의 `travel` objective는 실제 입장 성공 시 완료 처리한다.
- 1차 구현에서는 레벨 부족만 이동 자체를 막고, 선행 퀘스트 미완료는 경고/추천 문구로 안내한다.

## 10. 구현 단계

### Phase 0. 용어/ID/현재 하드코딩 감사

작업 파일:

- `plans/2026-07-14-zone-progression-main-quest-plan.md`
- `assets/data/zones/zone_catalog.json`
- `src/js/core/QuestManager.js`
- `src/js/ui/UIManager.js`
- `src/js/entities/Player.js`

작업 내용:

1. 맵 이름을 실제 카탈로그 기준으로 통일한다.
   - `zone_2`: 안개빛 호수
   - `zone_3`: 뇌광 숲
2. 현재 슬라임 전용 하드코딩 지점을 목록화한다.
3. 기존 저장 데이터와 신규 `questState`의 병행 기간을 명시한다.

### Phase 1. 퀘스트 카탈로그/로더/검증기

작업 파일:

- `assets/data/quests/quest_catalog.json`
- `assets/data/quests/*.json`
- `src/js/core/QuestManager.js`
- `scripts/validate-quest-content.js`
- `scripts/validate-world-content.js`

작업 내용:

1. `QuestManager.loadQuests()`의 파일명 하드코딩을 제거하고 `quest_catalog.json` 기반으로 로드한다.
2. `enabled`, `deprecated`, `aliases`, `replacementId`를 처리한다.
3. 퀘스트 JSON 스키마 검증 스크립트를 추가한다.
4. 기존 4개 슬라임 퀘스트도 카탈로그에 등록한다.

완료 기준:

- 퀘스트 파일 추가/제거가 런타임 코드 수정 없이 가능하다.
- 카탈로그에 없는 퀘스트는 신규 활성화되지 않는다.

### Phase 2. 신규 questState 저장 모델/레거시 어댑터

작업 파일:

- `src/js/core/QuestManager.js`
- `src/js/entities/Player.js`
- `src/js/world/scenes/WorldScene.js`
- `scripts/validate-runtime-integration.mjs`

작업 내용:

1. `questState.schemaVersion = 2` 저장 모델을 추가한다.
2. `QuestManager.serialize()`/`deserialize()`를 objective ID 기반으로 변경한다.
3. `LegacyQuestAdapter`를 추가해 기존 `questData`를 신규 questState로 복원한다.
4. 기존 슬라임 보상 청구/반복 보스 루프가 깨지지 않도록 일정 기간 `questData` 동시 갱신을 유지한다.

완료 기준:

- 기존 계정/새 계정 모두 슬라임 퀘스트 진행도가 유지된다.
- 신규 퀘스트는 `questData` 필드를 새로 만들지 않아도 저장된다.

### Phase 3. 이벤트 라우터/objective/action 처리기

작업 파일:

- `src/js/core/QuestManager.js`
- `src/js/entities/Player.js`
- `src/js/world/MonsterManager.js`
- `src/js/world/scenes/WorldScene.js`
- `src/js/core/TutorialManager.js`

작업 내용:

1. `QuestManager.handleEvent(event)`를 추가한다.
2. `kill`, `bossKill`, `level`, `travel`, `flag` objective를 공통 처리한다.
3. `onComplete.unlocks`, `onComplete.logMessage`, `onComplete.setFlags`, `onComplete.recommendZone`을 처리한다.
4. 보스 소환처럼 게임 상태를 바꾸는 액션은 허용 목록 기반으로만 실행한다.

완료 기준:

- `Player.receiveReward()`가 몬스터별 퀘스트 분기를 추가하지 않고 이벤트만 전달한다.
- `WorldScene.changeZone()` 성공 시 travel objective가 완료된다.
- 레벨업/튜토리얼 완료가 퀘스트 이벤트로 들어온다.

### Phase 4. HUD/맵 모달 ViewModel 전환

작업 파일:

- `src/js/ui/UIManager.js`
- `src/js/core/QuestManager.js`
- `src/css/style.css`
- `index.html`

작업 내용:

1. `QuestManager.getHudQuestView()`를 추가한다.
2. `QuestManager.getMapTravelQuestView(zoneId)`를 추가한다.
3. `UIManager.updateQuestUI()`에서 슬라임 전용 `questData` 분기를 제거하고 ViewModel 렌더링으로 바꾼다.
4. 맵 이동 모달에 추천 배지/CTA/잠김 사유를 ViewModel 기반으로 표시한다.

완료 기준:

- UI 레이어에 신규 퀘스트 ID별 if-else가 없다.
- 반복 퀘스트보다 메인 퀘스트가 우선 표시된다.
- 추천 맵 버튼 문구가 JSON의 `ui.mapModalCta`를 따른다.

### Phase 5. zone_2~zone_4 메인 퀘스트 JSON 추가

작업 파일:

- `assets/data/quests/quest_catalog.json`
- `assets/data/quests/quest_lake_*.json`
- `assets/data/quests/quest_forest_*.json`
- `assets/data/quests/quest_ruins_*.json`
- `assets/data/quests/quest_to_*.json`

작업 내용:

1. 각 맵 입장/일반 몬스터/보스/다음 맵 이동 퀘스트 추가.
2. 보스 무기 보상을 퀘스트 UI에서 안내.
3. 반복 의뢰 JSON 추가.
4. 퀘스트 수치만 바꿔도 밸런스 조정이 가능하도록 EXP/마석/목표 수치를 JSON에 둔다.

완료 기준:

- 신규 퀘스트 추가가 JSON + 카탈로그 수정만으로 가능하다.
- `validate-quest-content`가 모든 신규 퀘스트 참조를 통과한다.

### Phase 6. 보스 보상/무기 안내 보강

작업 파일:

- `src/js/world/MonsterManager.js`
- `src/js/core/ItemDataManager.js`
- `src/js/ui/UIManager.js`
- `assets/data/items/equipment_drop_rules.json`
- `assets/data/quests/*.json`

작업 내용:

1. 보스 처치 모달에 전용 무기 특수 옵션 요약 노출.
2. 퀘스트 JSON에는 `bossRewardGuide`만 두고, 실제 무기 지급은 기존 보스 드롭/durable reward 흐름을 유지한다.
3. 이미 획득한 보스 무기는 현재 정책처럼 중복 드롭을 허용하되, 향후 분해/강화 재료 가치로 연결한다.
4. 멀티 참여자별 보상/퀘스트 인정 유지.

### Phase 7. 밸런스/QA

작업 파일:

- `scripts/validate-quest-content.js`
- `scripts/validate-world-content.js`
- `scripts/validate-runtime-integration.mjs`
- 필요 시 신규 밸런스 시뮬레이션 스크립트

검증 항목:

1. 신규 캐릭터가 튜토리얼 후 슬라임 퀘스트를 정상 시작.
2. 각 챕터 보스 처치 후 다음 맵 이동 퀘스트 활성화.
3. 레벨이 부족하면 이동 모달이 정확한 잠김 사유 표시.
4. 레벨/선행 퀘스트 조건 충족 시 이동 가능.
5. 멀티에서 보스 참여자만 보스 퀘스트/무기 보상 획득.
6. 호스트 이전/재접속 후 퀘스트 중복 카운트/중복 보상 없음.
7. 반복 의뢰가 메인 퀘스트보다 우선 표시되지 않음.
8. 퀘스트 JSON 하나를 추가/비활성화해도 코드 변경 없이 검증된다.
9. deprecated 퀘스트를 진행 중인 저장 데이터가 안전하게 복구된다.

## 11. 주요 트레이드오프

### 기존 `questData` 유지 vs 완전한 신규 QuestManager 전환

권장: 당장은 하이브리드 유지.

이유:

- 기존 저장 데이터와 보스 복구 로직이 `questData`에 의존한다.
- 멀티 보상 영수증도 `Player.receiveReward()`를 중심으로 안정화되어 있다.
- 신규 퀘스트는 `questState`를 사용하되, 기존 슬라임 퀘스트만 `LegacyQuestAdapter`로 `questData`와 동시 갱신한다.

### 평면 퀘스트 파일 vs 폴더형 퀘스트 파일

권장: 1차 구현은 평면 구조 유지, 카탈로그 `path`로 폴더형 확장 가능하게 설계.

이유:

- 현재 리소스 로더와 기존 파일 구조를 크게 흔들지 않는다.
- 카탈로그가 경로를 들고 있으면 나중에 `main/zone_2/...`로 옮겨도 런타임 코드는 그대로 유지된다.

### JSON 액션 허용 범위

권장: JSON은 액션 이름과 파라미터만 선언하고, 런타임은 허용 목록에 있는 액션만 실행한다.

이유:

- 퀘스트 데이터가 게임 상태를 과하게 건드리면 디버깅이 어려워진다.
- `unlockQuest`, `setFlag`, `recommendZone`, `spawnQuestBoss`, `showRewardGuide` 정도로 시작하는 편이 안전하다.

### 강제 이동 vs 추천 이동

권장: 추천 이동.

이유:

- 친구와 함께 플레이 중일 때 강제 워프는 멀티 경험을 해칠 수 있다.
- 플레이어가 강화/반복 사냥을 선택할 여지를 남기는 편이 좋다.

### 보스 무기 중복 지급

권장: 반복 보스는 기존 드롭 정책대로 중복 무기를 허용하되, 퀘스트 JSON은 직접 무기를 지급하지 않는다.

이유:

- 현재 게임의 장비 강화/분해 체계와 잘 맞는다.
- 보스 반복 사냥 동기를 유지한다.
- durable boss reward와 퀘스트 보상이 같은 무기를 이중 지급하는 사고를 막는다.

## 12. 완료 기준

이 계획이 구현 완료된 상태는 다음과 같다.

1. 새 계정 기준 튜토리얼 완료 후 `zone_1 → zone_4`까지 퀘스트만 따라가도 막히지 않는다.
2. 각 맵의 일반 몬스터/보스/전용 무기가 퀘스트 UI에 명확히 연결된다.
3. 미니맵 이동 모달이 다음 맵을 자연스럽게 추천한다.
4. 레벨 부족/선행 조건 부족 사유가 명확히 표시된다.
5. 싱글/멀티 모두 퀘스트 카운트와 보스 보상이 중복 없이 동작한다.
6. 기존 슬라임 반복 퀘스트와 보스 강화석 루프는 깨지지 않는다.
7. 신규 퀘스트 추가는 개별 JSON + `quest_catalog.json` 수정만으로 가능하다.
8. 퀘스트 목표 수치/보상/문구 변경은 런타임 코드 수정 없이 가능하다.
9. 퀘스트 삭제/교체는 `enabled`, `deprecated`, `replacementId`, `migration` 정책으로 안전하게 처리된다.
10. `UIManager`와 `Player.receiveReward()`에 신규 퀘스트 ID별 분기가 추가되지 않는다.

## 13. 2026-07-15 1차 적용 판단 및 구현 범위

### 채택한 조언

현재 프로젝트에는 다음 방향을 즉시 적용하는 것이 좋다.

1. 퀘스트 목록은 코드 하드코딩 대신 `assets/data/quests/quest_catalog.json`에서 관리한다.
2. 기존 `questData`는 삭제하지 않고, 신규 진행형 퀘스트는 `questState.schemaVersion = 2`에 저장한다.
3. `UIManager`는 신규 퀘스트를 직접 해석하지 않고 `QuestManager.getHudQuestView()` / `getMapTravelQuestView()`가 만든 ViewModel을 우선 사용한다.
4. 일반 몬스터/보스 처치 판정은 기존 보상 영수증 흐름을 유지하고, 수신 시 `QuestManager.handleEvent()`로 변환한다.
5. 보스 전용 무기는 퀘스트 JSON이 직접 지급하지 않고 `bossRewardGuide`로만 안내한다. 실제 지급은 기존 durable boss reward/drop 경로가 맡는다.
6. 맵 이동은 강제 워프가 아니라 미니맵 이동 모달의 추천 배지/CTA로 유도한다.

### 보류한 조언

다음은 좋은 방향이지만 이번 1차 적용에서는 보류한다.

1. `UIManager.updateQuestUI()`의 슬라임 전용 분기 완전 제거
   - 이유: 기존 슬라임 보상 수령/반복 대왕 슬라임 소환이 `questData`와 UI 청구 버튼에 강하게 묶여 있다.
   - 1차에서는 신규 JSON 퀘스트가 있을 때만 ViewModel 렌더링을 사용하고, 슬라임 루프는 레거시 UI를 유지한다.
2. 선행 보스 미토벌 시 맵 이동 하드락
   - 이유: 기존 계정/친구 필드/재접속 흐름에서 막힘이 생길 수 있다.
   - 1차에서는 레벨 제한만 하드락으로 유지하고, 선행 퀘스트는 추천/안내로 처리한다.
3. 퀘스트 액션의 광범위한 상태 변경
   - 이유: JSON이 보스 소환/인벤토리/월드 상태를 직접 바꾸면 디버깅이 어려워진다.
   - 1차에서는 `unlocks`, `recommendZone`, `setFlags`, 보상 안내 중심으로 제한한다.

### 1차 적용 파일

- `assets/data/quests/quest_catalog.json`
- `assets/data/quests/quest_*.json`
- `src/js/core/QuestManager.js`
- `src/js/entities/Player.js`
- `src/js/world/MonsterManager.js`
- `src/js/world/scenes/WorldScene.js`
- `src/js/world/scenes/CharacterSelectionScene.js`
- `src/js/ui/UIManager.js`
- `src/css/style.css`
- `scripts/validate-quest-content.js`
- `package.json`

### 1차 적용 완료 기준

1. 기존 슬라임 10/30/대왕 슬라임/반복 보스 루프가 그대로 유지된다.
2. `zone_2 → zone_4` 메인 퀘스트는 JSON + 카탈로그 기반으로 로드된다.
3. 새 퀘스트 진행도는 `questState.active[questId].objectives[objectiveId]`에 저장된다.
4. 보상 영수증의 `questKill`/`questKills`는 신규 퀘스트 이벤트로 들어간다.
5. 필드 보스 퀘스트 인정은 보스 참여자 기준으로 적용된다.
6. 미니맵 이동 모달은 현재 메인 퀘스트 추천 맵을 표시한다.
7. `npm run validate:quests`가 퀘스트 파일/참조/순환을 검증한다.
