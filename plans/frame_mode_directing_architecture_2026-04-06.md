# 프레임 분리 / 모드 분리 / 디렉팅 툴 통합 아키텍처 설계서
작성일: 2026-04-06  
상태: Draft / 설계 초안  
범위: 로그인, 캐릭터 생성, 캐릭터 선택, 마을, 전투 필드, 오두막, 싱글/멀티 모드 분리, RTDB 사용량 절감, 디렉팅 툴 런타임/에디터 설계  
전제: 기존 전투 규칙, 캐릭터 데이터, Firebase 인증 흐름은 유지하되, 씬과 네트워크 경계를 재설계한다.

---

## 1. 문제 정의

현재 프로젝트는 실제 사용자 경험상 여러 구간이 존재하지만, 런타임 구조는 거의 하나의 월드 흐름에 과도하게 묶여 있다.

기준 코드:

- 씬 등록은 사실상 `login -> charSelect -> world` 3개뿐이다.  
  - `src/js/main.js`
- `WorldScene`가 존 로드, 프로필 복원, 튜토리얼, 스토리, 월드 입장, 몬스터, 원격 플레이어, 전투 표현을 동시에 담당한다.  
  - `src/js/world/scenes/WorldScene.js`
- `NetworkManager`는 존 참가 시 `users`, `monsters`, 드롭, 채팅, 데미지, 이벤트 노드를 폭넓게 구독한다.  
  - `src/js/core/NetworkManager.js`

이 구조의 결과는 다음과 같다.

1. 로그인 이후의 거의 모든 경험이 동일한 월드/존 문맥에 묶여 있다.  
2. 스토리, 튜토리얼, 오두막 같은 사실상 싱글 플레이 문맥도 RTDB 경계 안에 들어오기 쉽다.  
3. 씬/프레임 단위 책임이 섞여 있어, 향후 마을/전투필드/오두막/이벤트 맵 분리가 어렵다.  
4. 콘텐츠를 넣을 때마다 하드코딩 비중이 늘고, “연출/시나리오/배치” 작업이 개발자 코드 수정으로 귀결된다.  
5. RTDB는 “정말 필요한 멀티플레이 구간”에만 써야 하는데, 현재는 월드 구조 자체가 단일화되어 사용량이 커진다.

이 문서의 핵심 목적은 다음 두 가지다.

- 런타임을 “화면 프레임 + 플레이 모드” 기준으로 분리한다.
- 연출/시나리오/배치 작업을 데이터 기반 디렉팅 툴로 끌어올린다.

---

## 2. 목표

### 2.1 사용자 경험 목표

게임 구조를 다음 프레임으로 분리한다.

1. 로그인 및 캐릭터 생성
2. 캐릭터 선택창
3. 마을
4. 전투 필드
5. 오두막

이 5개는 단순 화면 이름이 아니라, 다음 차이를 가진다.

- 네트워크 참여 여부
- 캐릭터 제어 방식
- 허용 UI
- 배경음/효과음/오브젝트/몬스터 제어 방식
- 저장 시점과 복원 방식

### 2.2 기술 목표

- RTDB 사용 경계를 “멀티플레이가 실제 필요한 프레임”에만 제한한다.
- 싱글 모드 프레임은 로컬 런타임 + 프로필 저장 체크포인트 중심으로 동작시킨다.
- `WorldScene`의 비대 책임을 씬/세션/디렉팅 계층으로 분리한다.
- 향후 콘텐츠 추가를 JSON/에디터 데이터 중심으로 이동시킨다.

### 2.3 툴링 목표

비개발자나 디렉터가 아래를 드래그앤드롭 중심으로 제어할 수 있는 툴을 만든다.

- 캐릭터/NPC/오브젝트 배치
- 몬스터 스폰과 행동 연출
- BGM/SFX 큐
- 튜토리얼/퀘스트/스토리 이벤트
- 캐릭터 이동 제어
- 카메라/페이드/대사/컷신

---

## 3. 핵심 원칙

### 3.1 Frame와 Mode를 분리한다

프레임은 “사용자가 지금 어떤 화면적 문맥에 있는가”를 의미한다.

- login_create
- character_select
- town
- combat_field
- cabin

모드는 “그 프레임이 어떤 동기화/권한 모델로 돌아가는가”를 의미한다.

- offline_local
- single_runtime
- shared_party
- public_multiplayer
- directed_sequence

예를 들어 `cabin` 프레임은 기본적으로 `single_runtime` 또는 `directed_sequence`일 수 있고, `combat_field`는 `public_multiplayer` 또는 `shared_party`일 수 있다.

즉, “마을 = 무조건 멀티”, “오두막 = 무조건 싱글”처럼 하드코딩하지 않는다.  
프레임과 모드를 조합 가능한 구조로 만든다.

### 3.2 RTDB는 세션 모드가 결정한다

RTDB 참여 여부는 씬 이름이 아니라 세션 모드가 결정한다.

- `offline_local`: RTDB 미참여
- `single_runtime`: RTDB 미참여, 단 저장 체크포인트만 profile 저장
- `shared_party`: RTDB 제한 참여
- `public_multiplayer`: RTDB 전체 참여
- `directed_sequence`: 기본 미참여, 필요 시 읽기 전용 또는 디렉팅 이벤트 동기화만 허용

### 3.3 디렉팅은 “코드 분기”가 아니라 “데이터 실행기”로 만든다

튜토리얼, 퀘스트, 스토리, 컷신, 오두막 이벤트, NPC 배치 같은 것은  
가능한 한 `DirectingRuntime`이 읽는 데이터로 옮긴다.

코드는 “무엇을 할 수 있는가”를 제공하고,  
디렉팅 데이터는 “언제/어디서/무엇을 실행하는가”를 결정한다.

### 3.4 권한의 기준은 유지한다

- 멀티 전투 판정은 계속 authoritative host 또는 authoritative shared state가 기준이다.
- 싱글 문맥에서만 로컬 실행을 허용한다.
- 디렉팅 툴은 강력하지만, 프로덕션 런타임에서 임의 수정 권한과 섞지 않는다.

---

## 4. 현재 구조 진단

### 4.1 현재 씬 구조

현재 메인 등록 씬은 다음 3개뿐이다.

- `login`
- `charSelect`
- `world`

즉, 마을/전투필드/오두막/튜토리얼/스토리 문맥이 전부 `WorldScene` 안으로 들어간다.

### 4.2 현재 `WorldScene` 문제

`WorldScene`는 현재 다음 책임을 동시에 가진다.

- 존 로딩
- 스폰 위치 결정
- 프로필 복원
- 튜토리얼 시작/재개
- 스토리 연출 연결
- 네트워크 참여 defer/재개
- 원격 플레이어 표현
- 몬스터/투사체/이펙트/드롭/타겟 처리

이 구조는 다음 문제를 만든다.

- “오두막” 같은 싱글 서사 공간이 별도 문맥으로 분리되지 않는다.
- 마을과 전투 필드의 네트워크 정책을 다르게 두기 어렵다.
- 특정 콘텐츠를 위해 월드 씬에 조건문을 계속 쌓게 된다.

### 4.3 현재 네트워크 경계 문제

`NetworkManager`는 존 참여 상태에서 광범위한 실시간 구독을 시작한다.

- `users`
- `monsters`
- `monster_attack`
- `monster_damage`
- `drops`
- `chat`
- `system_messages`

지금처럼 모든 주요 플레이가 “슬라임 맵 월드” 안에서 일어나면,
싱글 성격이 강한 진행도 멀티 전용 RTDB 경계를 자연스럽게 타게 된다.

---

## 5. 제안 아키텍처 개요

상위 구조를 아래 계층으로 나눈다.

1. `Scene Layer`
2. `Frame Runtime Layer`
3. `Session Mode Layer`
4. `Directing Runtime Layer`
5. `Persistence / Network Layer`
6. `Editor / Authoring Layer`

### 5.1 Scene Layer

사용자에게 보이는 실제 씬 단위.

제안 씬:

- `LoginCreateScene`
- `CharacterSelectionScene`
- `TownScene`
- `FieldScene`
- `CabinScene`
- `DirectingEditorScene` 또는 외부 editor shell

### 5.2 Frame Runtime Layer

각 씬이 공통으로 가져야 하는 구조를 캡슐화한다.

제안 클래스:

- `BaseFrameScene`
- `FrameContext`
- `FrameDefinition`
- `FrameSessionCoordinator`

역할:

- 프레임 메타 로드
- 세션 모드 부착
- 카메라/HUD/배경음 기본 설정
- 입장/퇴장 훅 실행
- directing runtime 연결

### 5.3 Session Mode Layer

멀티/싱글 정책을 캡슐화한다.

제안 인터페이스:

- `BaseSessionMode`
- `OfflineLocalMode`
- `SingleRuntimeMode`
- `SharedPartyMode`
- `PublicMultiplayerMode`
- `DirectedSequenceMode`

핵심 역할:

- RTDB connect/disconnect 정책
- 어떤 데이터만 실시간 동기화할지 결정
- host/authority 정책
- 저장 시점 및 flush 정책

### 5.4 Directing Runtime Layer

데이터 기반 이벤트 엔진.

제안 모듈:

- `DirectingRuntime`
- `DirectingTimeline`
- `DirectingActionExecutor`
- `DirectingTriggerEvaluator`
- `DirectingBindings`

역할:

- 트리거 평가
- 타임라인 실행
- 플레이어 제어 lock/unlock
- 오브젝트/NPC/몬스터/BGM/SFX/대사/카메라 제어

### 5.5 Editor / Authoring Layer

디렉터가 직접 장면을 구성하는 툴.

제안 모듈:

- `editor/DirectingEditorApp`
- `editor/canvas/PlacementCanvas`
- `editor/panels/InspectorPanel`
- `editor/panels/TimelinePanel`
- `editor/panels/HierarchyPanel`
- `editor/services/DirectingSerializer`

---

## 6. 프레임 구조 설계

## 6.1 로그인 및 캐릭터 생성 프레임

### 목적

- 인증
- 게스트/구글 진입
- 캐릭터 생성
- 초기 profile seed 작성

### 모드

- `offline_local` 또는 `single_runtime`에 가까운 비참여 상태

### RTDB 정책

- 실시간 존 참여 금지
- 필요한 것은 인증과 profile 생성/저장만
- 채팅/몬스터/users 구독 없음

### 런타임 요구

- 인게임 HUD 없음
- 캐릭터 미리보기는 로컬 렌더 전용
- profile seed는 서버 저장하되 프레임 자체는 비동기 저장 완료 후 다음 씬 이동

### 파일 영향

- 신규 `src/js/world/scenes/LoginCreateScene.js`
- 기존 `LoginScene` 책임 일부 흡수 또는 대체

---

## 6.2 캐릭터 선택 프레임

### 목적

- 캐릭터 슬롯 선택
- 이름 확인/UID 복구/프로필 로드
- 마지막 위치가 아니라 “어떤 프레임으로 입장할지” 결정

### 모드

- `offline_local`

### RTDB 정책

- 실시간 참여 금지
- profile snapshot 조회만 허용

### 중요 변경

캐릭터 선택 후 바로 `world`가 아니라,
`entryFrameResolver`가 다음 진입 프레임을 결정한다.

예:

- 튜토리얼 미완료 -> `cabin` 또는 `field_tutorial`
- 스토리 진행 중 -> `cabin_story_1`
- 일반 플레이어 -> `town_main`

### 파일 영향

- 기존 `CharacterSelectionScene.js` 확장
- 신규 `FrameEntryResolver.js`

---

## 6.3 마을 프레임

### 목적

- 상점, NPC 대화, 퀘스트 수령/완료
- 장비/강화/인벤토리 정리
- 허브 역할

### 권장 모드

기본:

- `single_runtime`

선택:

- `shared_party`
- `public_multiplayer`

### 왜 기본을 싱글로 두는가

마을은 체류 시간이 길고 RTDB 동기화 가치가 상대적으로 낮다.
필요하면 “광장형 멀티 마을”을 별도 프레임으로 두면 된다.

즉:

- `town_main`: 싱글 허브
- `town_square_public`: 멀티 허브

### RTDB 정책

- 싱글 마을: 몬스터/users 구독 없음
- 멀티 마을: 몬스터 없음, users 최소 구독만

### 콘텐츠 제어

- NPC 위치
- 상점 오브젝트
- 문/포탈
- ambient BGM
- 환경 연출

---

## 6.4 전투 필드 프레임

### 목적

- 몬스터 사냥
- 드롭
- 협동/파티 플레이
- 보스전

### 권장 모드

- `public_multiplayer`
- `shared_party`

### RTDB 정책

여기만 실시간 동기화의 주 무대가 된다.

동기화 대상:

- 플레이어 위치/상태
- 몬스터 authoritative delivery
- 드롭
- 데미지 이벤트
- 채팅/이모트

### 중요 설계

필드 프레임은 이후 AOI/region 구조를 직접 사용하는 유일한 핵심 멀티 프레임으로 설계한다.

즉:

- 멀티 전투 = 별도 frame + explicit session mode
- 나머지 프레임은 멀티가 기본이 아니다

---

## 6.5 오두막 프레임

### 목적

- 스토리 진행
- 튜토리얼
- 컷신
- 제한된 이동 및 상호작용

### 권장 모드

- `directed_sequence`
- `single_runtime`

### RTDB 정책

- 실시간 참여 금지
- profile 저장은 특정 체크포인트에서만

### 중요 포인트

오두막은 지금의 “스토리/튜토리얼을 월드 위에 덮는 구조”에서 분리해야 한다.
이 프레임은 애초에 directing runtime이 기본 런타임의 주체가 되어야 한다.

예:

- 플레이어 이동 lock
- 특정 위치 walk-to
- NPC 등장
- BGM 전환
- 대사 및 페이드
- 스폰/문 열림/오브젝트 애니메이션

---

## 7. 싱글 모드 / 멀티 모드 분리 설계

## 7.1 모드 정의

### `offline_local`

- RTDB connect 없음
- profile read/write만 필요 시 호출
- 로그인/선택/에디터 등에 사용

### `single_runtime`

- 월드는 실행되지만 실시간 동기화 없음
- 로컬 몬스터/NPC/오브젝트 실행 가능
- 저장은 체크포인트 단위

### `shared_party`

- 파티 단위 제한 멀티
- 필요한 플레이어/몬스터만 동기화
- private room 기반

### `public_multiplayer`

- 공개 필드/공개 허브
- AOI 기반 users/monsters 동기화

### `directed_sequence`

- 디렉팅 런타임 우선
- movement control / timeline / camera 제어
- 필요 시 일부 이벤트만 sync

---

## 7.2 RTDB 절감 전략

가장 중요한 정책은 다음이다.

### 정책 A. 프레임 기본값을 싱글로 둔다

현재는 “모든 것이 멀티 월드 안에서 일어남”에 가깝다.  
앞으로는 “멀티가 필요한 곳만 명시적으로 멀티”로 바꾼다.

예:

- 로그인/생성: 비실시간
- 캐릭터 선택: 비실시간
- 오두막: 비실시간
- 메인 마을: 비실시간
- 전투 필드: 멀티

이것만으로도 RTDB 시간당 다운로드는 크게 줄 수 있다.

### 정책 B. 모드별 NetworkManager attach 범위를 다르게 한다

`NetworkManager.connect()`가 단일 진입점이어도,
모드별 구독 세트가 달라져야 한다.

예:

- `single_runtime`: connect 자체를 하지 않음
- `shared_party`: `users`, `monsters`, `drops`, `party`만
- `public_multiplayer`: 전체
- `town_public`: `users`, `chat`, `emotes`만

### 정책 C. 저장과 실시간 참여를 분리한다

많은 구간은 “저장”은 필요하지만 “실시간 동기화”는 필요 없다.

즉:

- profile 저장은 허용
- zone realtime participation은 금지

이 분리를 `SessionMode`가 강제해야 한다.

---

## 8. 디렉팅 툴 목표 범위

디렉팅 툴은 “맵 에디터” 하나가 아니라,  
배치 + 이벤트 + 타임라인 + 제어를 묶은 통합 툴이어야 한다.

필수 범위:

1. 캐릭터/NPC/오브젝트/몬스터 배치
2. 배경음/효과음 트리거
3. 컷신/대사/페이드/카메라
4. 튜토리얼/퀘스트/스토리 단계 제어
5. 플레이어 이동 제어
6. 월드 오브젝트의 상태 변경과 이동 제어

---

## 9. 디렉팅 데이터 모델

## 9.1 Frame Definition

각 프레임의 최상위 정의.

예상 파일:

- `assets/data/frames/login_create.json`
- `assets/data/frames/character_select.json`
- `assets/data/frames/town_main.json`
- `assets/data/frames/field_slime_1.json`
- `assets/data/frames/cabin_intro.json`

예시 구조:

```json
{
  "id": "field_slime_1",
  "scene": "field",
  "mode": "public_multiplayer",
  "zoneId": "zone_1",
  "hudPreset": "combat_default",
  "cameraPreset": "field_default",
  "bgm": "field_slime",
  "directingScript": "field_slime_intro",
  "entry": {
    "spawnPoint": "default"
  }
}
```

## 9.2 Directing Script

연출과 진행 제어 정의.

예상 파일:

- `assets/data/directing/tutorial/basic_training_intro.json`
- `assets/data/directing/story/cabin_intro_01.json`
- `assets/data/directing/quest/slime_boss_clear.json`

핵심 필드:

- `triggers`
- `timeline`
- `actions`
- `bindings`
- `conditions`

## 9.3 Scene Graph / Placements

드래그앤드롭 배치 결과.

예상 파일:

- `assets/data/placements/town_main.layout.json`
- `assets/data/placements/cabin_intro.layout.json`
- `assets/data/placements/field_slime_1.layout.json`

노드 타입:

- `player_spawn`
- `npc`
- `monster_spawn`
- `object`
- `portal`
- `trigger`
- `camera_anchor`
- `sound_source`
- `path`

## 9.4 Timeline Track

시간 기반 연출 제어.

트랙 예:

- `dialog`
- `camera`
- `audio`
- `npc_motion`
- `player_control`
- `spawn`
- `fx`

---

## 10. 디렉팅 런타임 설계

## 10.1 DirectingRuntime 책임

- directing script 로드
- 조건 평가
- 트리거 시작
- 타임라인 재생
- 액션 실행
- rollback/cleanup

## 10.2 Action Catalog

디렉팅 런타임이 지원해야 할 최소 액션 집합:

- `lock_input`
- `unlock_input`
- `move_player_to`
- `teleport_player`
- `spawn_monster`
- `despawn_monster`
- `spawn_object`
- `move_object`
- `play_bgm`
- `stop_bgm`
- `play_sfx`
- `show_dialog`
- `show_tutorial`
- `accept_quest`
- `complete_quest_step`
- `set_camera_target`
- `fade_in`
- `fade_out`
- `open_popup`
- `close_popup`
- `set_npc_state`
- `set_flag`

## 10.3 Trigger Catalog

- `onFrameEnter`
- `onQuestAccepted`
- `onQuestCompleted`
- `onMonsterKilled`
- `onAreaEnter`
- `onPopupOpened`
- `onPopupClosed`
- `onInputAction`
- `onFlagSet`
- `onTimer`

## 10.4 Character Control Modes

캐릭터 움직임 제어는 directing runtime이 모드로 바꿔야 한다.

- `free`
- `walk_to_only`
- `locked`
- `focus_target_only`
- `script_driven`

튜토리얼/퀘스트/스토리 모두 이 제어 모드를 공유하면,
현재처럼 여러 매니저가 각자 입력을 막는 구조보다 훨씬 일관되다.

---

## 11. 디렉팅 에디터 설계

## 11.1 목표 UX

디렉터가 다음을 편하게 할 수 있어야 한다.

- 배경/오브젝트/NPC/몬스터를 드래그앤드롭 배치
- 특정 오브젝트 클릭 후 속성 편집
- 타임라인에서 대사/BGM/SFX/이동 연출 배치
- 특정 트리거가 어떤 액션을 실행하는지 시각적으로 연결

## 11.2 에디터 화면 구성

### 좌측: Hierarchy

- Frame
- Layers
- Nodes

### 중앙: Canvas

- 맵 위 배치
- 그리드/스냅
- 다중 선택
- gizmo 이동/회전/크기

### 우측: Inspector

- 선택 노드 속성
- 프레임 메타
- 세션 모드
- 배경음
- 트리거/액션 속성

### 하단: Timeline

- track 기반 이벤트 배치
- duration / start / end 조절

## 11.3 편집 가능한 Component 타입

- `TransformComponent`
- `SpriteComponent`
- `ColliderComponent`
- `InteractableComponent`
- `MonsterSpawnerComponent`
- `SoundCueComponent`
- `PathMoverComponent`
- `DialogCueComponent`
- `QuestCueComponent`
- `TutorialCueComponent`
- `ControlZoneComponent`

## 11.4 직렬화 방식

에디터 결과는 최종적으로 JSON으로 저장한다.

제안:

- 사람도 읽을 수 있는 text JSON
- stable id 유지
- Git diff 친화 구조

예:

- layout JSON
- directing JSON
- frame definition JSON

---

## 12. 제안 파일 구조

```text
src/js/
  core/
    FrameManager.js
    FrameEntryResolver.js
    session/
      BaseSessionMode.js
      OfflineLocalMode.js
      SingleRuntimeMode.js
      SharedPartyMode.js
      PublicMultiplayerMode.js
      DirectedSequenceMode.js
    directing/
      DirectingRuntime.js
      DirectingTimeline.js
      DirectingActionExecutor.js
      DirectingTriggerEvaluator.js
      DirectingBindings.js
  editor/
    DirectingEditorApp.js
    canvas/
    panels/
    services/
  world/
    scenes/
      BaseFrameScene.js
      LoginCreateScene.js
      CharacterSelectionScene.js
      TownScene.js
      FieldScene.js
      CabinScene.js
```

데이터 구조:

```text
assets/data/
  frames/
  directing/
  placements/
  audio/
  presets/
```

---

## 13. 기존 코드베이스에 대한 구체적 영향

## 13.1 `main.js`

현재는 `login`, `charSelect`, `world`만 등록한다.  
이를 프레임 씬 단위로 재구성해야 한다.

변경 방향:

- `LoginScene`를 `LoginCreateScene`로 확장/대체
- `world`를 `town`, `field`, `cabin` 등으로 분리
- `FrameManager` 또는 `FrameEntryResolver`를 부착

## 13.2 `WorldScene.js`

현재 `WorldScene`가 떠안은 책임을 분리한다.

분리 대상:

- 프레임 공통 처리 -> `BaseFrameScene`
- 전투 필드 로직 -> `FieldScene`
- 스토리/오두막 제어 -> `CabinScene`
- 허브/마을 -> `TownScene`

즉, `WorldScene`는 점진적으로 해체 대상이다.

## 13.3 `NetworkManager.js`

`connect()`와 listener attach는 session mode가 제어해야 한다.

필요 변경:

- `connect()`의 monolithic attach 구조 분리
- `attachForMode(mode, frameDefinition)` 계층 추가
- profile 저장과 realtime participation 분리 강화

## 13.4 `TutorialManager.js` / `StoryManager.js`

현재는 월드 씬 위에서 오버레이/상태 제어를 한다.  
앞으로는 directing runtime의 action executor를 공통 실행 경로로 삼아야 한다.

즉:

- `TutorialManager` = tutorial-specific policy/data
- `StoryManager` = story-specific policy/data
- 실제 액션 실행은 `DirectingActionExecutor`

## 13.5 `UIManager.js`

프레임별 HUD preset, popup policy, tutorial policy를 frame context에서 읽게 바꿔야 한다.

---

## 14. 단계별 구현 계획

## Phase F1. Frame / Mode 골격 추가

목표:

- `FrameDefinition`
- `BaseFrameScene`
- `BaseSessionMode`
- `FrameEntryResolver`

적용:

- 기존 `world` 유지
- 내부에서 `mode` 개념만 먼저 도입

## Phase F2. 오두막 프레임 분리

이유:

- 싱글/디렉팅 문맥이 분명하고
- RTDB 절감 효과가 즉시 있다

대상:

- 튜토리얼
- 초반 스토리
- 컷신

## Phase F3. 마을 프레임 분리

목표:

- 기본 마을을 `single_runtime` 허브로 전환
- 멀티 허브가 필요하면 별도 `town_public` 설계

## Phase F4. 전투 필드 프레임 분리

목표:

- 멀티 필드 전용 씬으로 전환
- AOI/region 네트워크 설계와 직접 연결

## Phase F5. Directing Runtime 공통화

목표:

- Tutorial / Story / Quest event 경로 통합
- 기존 매니저들이 data provider가 되게 만들기

## Phase F6. Directing Editor MVP

MVP 범위:

- 배치
- trigger-action 연결
- BGM/SFX 큐
- 플레이어 이동 제어

---

## 15. 케이스별 동작 기준

## 15.1 로그인 및 생성

- 멀티 참여 없음
- 캐릭터 미리보기만 로컬 렌더
- 저장 완료 후 선택창 진입

## 15.2 캐릭터 선택 후 튜토리얼 미완료

- `FrameEntryResolver`가 `cabin_intro` 또는 `field_tutorial`로 보냄
- `single_runtime + directed_sequence`

## 15.3 일반 유저의 평상시 플레이

- `town_main` 진입
- 포탈 또는 UI 선택으로 `field_slime_1` 진입
- 이때만 `public_multiplayer`

## 15.4 스토리 이벤트 중

- `cabin_story_x` 또는 `directed sequence in town`
- 플레이어 제어 제한
- RTDB 실시간 참여 없음 또는 최소화

## 15.5 파티 던전/보스전

- `shared_party`
- private room 또는 isolated field

---

## 16. 트레이드오프

장점:

- RTDB 사용량을 프레임/모드 기준으로 크게 줄일 수 있다.
- 콘텐츠 추가가 구조적으로 쉬워진다.
- 튜토리얼/스토리/퀘스트/연출이 하나의 directing 철학으로 통합된다.
- `WorldScene`의 과도한 책임을 줄일 수 있다.

단점:

- 초기 리팩터링 범위가 크다.
- 씬/모드/디렉팅 계층이 늘어 런타임 구조가 더 복잡해진다.
- 직렬화 포맷과 에디터 스키마를 잘못 잡으면 나중에 수정 비용이 크다.

---

## 17. 검증 계획

### 구조 검증

- 로그인/선택/마을/필드/오두막이 서로 다른 frame definition으로 진입하는가
- 각 프레임이 올바른 session mode를 가지는가

### RTDB 검증

- 로그인/선택/오두막/싱글 마을에서 `NetworkManager` realtime attach가 0인가
- 전투 필드에서만 users/monsters 구독이 발생하는가
- 기존 플레이 시간 기준 다운로드 사용량이 유의미하게 감소하는가

### 기능 검증

- 튜토리얼/스토리/퀘스트 이벤트가 directing runtime 경유로 깨지지 않는가
- 멀티 전투 authoritative 흐름이 유지되는가

### 툴 검증

- 드래그앤드롭 배치 -> JSON 저장 -> 런타임 반영 루프가 성립하는가

---

## 18. 우선 권장 구현 순서

1. `FrameDefinition + SessionMode` 골격
2. `cabin` 싱글 분리
3. `town` 싱글 허브 분리
4. `field` 멀티 전투 프레임 분리
5. `DirectingRuntime` 공통 action executor 도입
6. `Directing Editor MVP`

가장 먼저 오두막과 마을을 분리하는 이유는 이 둘이 RTDB 절감 효과가 크고,  
전투 authoritative 구조를 덜 건드리면서도 시스템 경계를 선명하게 만들 수 있기 때문이다.

---

## 19. 결론

현재 프로젝트의 가장 큰 구조 문제는 “모든 경험이 슬라임 필드 월드 하나 안에서 일어난다”는 점이다.  
이 문제를 풀려면 단순히 맵을 추가하는 것이 아니라, `프레임`, `세션 모드`, `디렉팅 런타임`, `에디터`를 별도 계층으로 세워야 한다.

이 문서의 최종 방향은 다음 한 줄로 요약된다.

`월드 하나에 콘텐츠를 계속 쌓지 말고, 프레임은 사용자 경험으로, 모드는 동기화 정책으로, 디렉팅은 데이터 실행기로 분리한다.`

그 위에서:

- 로그인/생성
- 캐릭터 선택
- 마을
- 전투 필드
- 오두막

을 각각 별도 문맥으로 다루고,  
멀티플레이는 “정말 필요한 전투 프레임”에만 실시간 동기화를 집중시키는 것이 장기적으로 가장 안전하다.
