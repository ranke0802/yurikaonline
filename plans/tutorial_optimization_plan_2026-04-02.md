# 튜토리얼 최적화 계획서

작성일: 2026-04-02  
대상 버전: `0.01.55` 이후  
범위: `basic_training` 튜토리얼과 이를 표시하는 공통 UI 레이어  
목표: PC / 모바일 세로 / 모바일 가로 각각에서 튜토리얼이 "가르치는 UI"가 되도록 재설계하되, 기존 진행 내용과 학습 항목은 유지한다.

## 1. 문제 정의

현재 튜토리얼은 단계 수와 설명량이 늘어났지만, 표시 방식은 거의 단일 구조에 머물러 있다.

- 가이드 박스가 화면 중앙 또는 상단에 떠서 실제로 눌러야 할 영역을 가린다.
- 붉은 박스 하이라이트가 DOM 사각형만 따르기 때문에 버튼 그룹, 팝업 내부 문맥, safe area, 회전 상태를 제대로 반영하지 못한다.
- PC / 모바일 세로 / 모바일 가로가 서로 다른 HUD 배치를 가지는데, 단계 데이터는 주로 텍스트와 selector만 바꾸는 수준이라 전달력이 떨어진다.
- 플레이어가 "설명을 읽는 것"과 "실제로 눌러야 하는 것" 사이의 연결이 약해서 억지로 따라 하는 느낌이 강하다.
- 기능 설명 단계와 조작 단계가 같은 형태의 오버레이를 써서, 정보 확인 단계에서도 실제 플레이 시야를 과하게 막는다.

## 2. 현재 구조 요약

현재 구조는 다음 모듈에 나뉘어 있다.

- 튜토리얼 상태 관리: [TutorialManager.js](C:/dev/yurika_online/src/js/core/TutorialManager.js#L3)
- 튜토리얼 가이드 오버레이: [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L227)
- 튜토리얼 하이라이트 박스: [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L1985)
- 현재 튜토리얼 데이터: [basic_training.json](C:/dev/yurika_online/assets/data/tutorials/basic_training.json#L1)
- 튜토리얼 관련 스타일: [style.css](C:/dev/yurika_online/src/css/style.css#L3089)

현재 설계의 핵심 한계는 이렇다.

- `TutorialManager`는 레이아웃별 텍스트와 selector 분기를 제공하지만, "표현 방식" 자체는 분기하지 않는다.
- `UIManager.showTutorialGuide()`는 사실상 하나의 검은 박스를 위치만 바꿔 쓰고 있다.
- `highlightTutorialTargets()`는 대상 DOM에 박스를 씌우는 방식이라, 사용자의 시선 유도와 클릭 경로 제어까지는 담당하지 못한다.
- `basic_training.json`은 단계 수가 많아졌는데, 단계 종류별 프리셋이나 시각 규칙이 없다.

## 3. 이번 최적화의 원칙

- 기존 튜토리얼 콘텐츠는 유지한다.
- 기존 단계 순서는 유지하되, 표시 방식과 단계 유형을 정리한다.
- "읽기 단계", "열기 단계", "누르기 단계", "전투 단계"를 다른 UI 언어로 구분한다.
- 중앙 가이드 박스로 모든 것을 해결하지 않는다.
- PC / 모바일 세로 / 모바일 가로는 서로 다른 HUD 구조를 가진 독립 레이아웃으로 취급한다.
- 하이라이트는 단순 사각형보다 "행동 유도"를 우선한다.
- 실제 클릭 대상 주변 정보를 함께 보여주되, 플레이 영역은 최대한 덜 가린다.

## 4. 목표 UX

### 4.1 PC

- 가이드는 기본적으로 상단 중앙이 아니라 `좌측 상단 도킹 카드` 형태로 배치한다.
- 클릭해야 할 UI는 해당 위치에 `하이라이트 + 짧은 라벨`로 직접 연결한다.
- 설명량이 긴 단계는 카드 내부에 2줄 요약과 "왜 이걸 하는지"를 짧게 보여준다.
- 중앙 월드 시야를 막는 오버레이는 전투 단계에서만 최소한으로 사용한다.

### 4.2 모바일 세로

- 가이드는 `상단 안전영역 아래 좁은 카드` 또는 `하단 바텀시트형 카드`를 단계별로 선택한다.
- 플레이어 조작이 필요한 단계는 하단 카드보다 상단 카드 우선으로 사용해 조이스틱/액션 버튼을 가리지 않는다.
- 하이라이트는 버튼 외곽 박스만이 아니라, 필요 시 `짧은 화살표 꼬리`와 함께 표시한다.
- 설명 텍스트는 키보드 단축키 문구를 제거한 모바일 전용 문장으로 통일한다.

### 4.3 모바일 가로

- 가이드는 중앙 상단이 아니라 `좌측 중단 또는 하단 중앙의 얇은 카드`로 둔다.
- 우측 HUD를 눌러야 하는 단계에서는 가이드가 반드시 좌측으로 빠져야 한다.
- 가로 모드에서는 특히 safe area와 오른손 조작 구역을 침범하지 않도록 한다.
- 퀘스트 패널, 미니맵, 액션 버튼과 겹치지 않는 "빈 공간 우선 배치" 규칙을 둔다.

## 5. 튜토리얼 표현 타입 재설계

현재는 대부분의 단계가 `텍스트 + 빨간 박스` 조합이다. 이를 아래 타입으로 분리한다.

### 5.1 `info`

- 기능 설명만 전달하는 단계
- 예: 스킬 특징 설명, 스탯 미리보기 설명
- 화면 처리:
  - 작은 도킹 카드
  - 필요 시 약한 하이라이트만 사용
  - 클릭 강제 없음

### 5.2 `inspect`

- 특정 UI를 열거나 상세 툴팁/모달을 확인하게 하는 단계
- 예: 스킬 상세 보기, 상태창 열기
- 화면 처리:
  - 대상 UI 주변에 포커스 링
  - 카드에는 "무엇을 확인해야 하는지" 1문장만 표시
  - 확인 조건이 충족되면 즉시 다음 단계로 이동

### 5.3 `interact`

- 특정 버튼이나 항목을 반드시 눌러야 하는 단계
- 예: 매직 미사일 강화, 인벤토리 열기
- 화면 처리:
  - 강한 하이라이트
  - 주변 클릭 차단 옵션 가능
  - 클릭 대상 옆에 짧은 CTA 라벨 표시

### 5.4 `combat`

- 월드 플레이를 요구하는 단계
- 예: 이동, 일반공격, 스킬 사용
- 화면 처리:
  - 가이드 카드는 가장 작게
  - 전투 대상과 액션 버튼 양쪽을 동시에 보여주는 복합 포커스
  - 월드 시야 가림 최소화

## 6. 데이터 구조 개선안

`basic_training.json` 단계마다 텍스트와 selector를 흩뿌리는 대신, 프레젠테이션 메타를 명시한다.

예시 구조:

```json
{
  "id": "open_skill",
  "type": "interact",
  "instruction": {
    "desktop": "...",
    "mobilePortrait": "...",
    "mobileLandscape": "..."
  },
  "focus": {
    "desktop": ["#btn-skill"],
    "mobilePortrait": ["#btn-skill"],
    "mobileLandscape": ["#btn-skill"]
  },
  "presentation": {
    "desktop": { "guideMode": "dock-left", "highlightMode": "ring" },
    "mobilePortrait": { "guideMode": "top-card", "highlightMode": "ring" },
    "mobileLandscape": { "guideMode": "left-card", "highlightMode": "ring" }
  },
  "completion": {
    "trigger": "popup_open",
    "target": "skill-popup"
  }
}
```

핵심 변경점은 이렇다.

- `instructionDesktop`, `instructionMobileLandscape`처럼 흩어진 키를 `instruction.desktop` 등으로 정리
- `highlightTarget` 대신 `focus` 배열 사용
- `presentation`에서 카드 위치와 하이라이트 방식 지정
- `completion`에서 완료 조건을 명시

## 7. 레이아웃 시스템 개선안

### 7.1 가이드 카드 레이아웃 프리셋

`UIManager.applyTutorialGuideLayout()`를 직접 숫자 세팅하는 함수가 아니라, 프리셋 해석기로 바꾼다.

추천 프리셋:

- `dock-left`
- `dock-top`
- `top-card`
- `left-card`
- `bottom-sheet`
- `floating-compact`

각 프리셋은 다음 값을 가진다.

- anchor
- maxWidth
- maxHeight
- padding
- fontSize
- allowedOverlapZones
- safeArea policy

### 7.2 금지 영역 기반 배치

튜토리얼 가이드는 단순 viewport 기준이 아니라 "겹치면 안 되는 HUD"를 알고 있어야 한다.

금지 영역 후보:

- 미니맵
- 우측 메뉴 버튼 묶음
- 좌측 퀘스트 패널
- 채팅창
- 액션 버튼 묶음
- 조이스틱

설계:

- `UIManager.getTutorialForbiddenZones()` 추가
- 각 모드에서 현재 보이는 HUD DOM rect를 수집
- 가이드 카드 프리셋 후보 중 가장 덜 겹치는 위치 선택

## 8. 하이라이트 시스템 개선안

현재 `tutorial-highlight-box`는 selector rect를 그대로 따라간다. 이를 3단계로 확장한다.

### 8.1 하이라이트 타입

- `ring`: 버튼/아이콘 외곽만 강조
- `frame`: 패널/행 전체 강조
- `spotlight`: 배경을 어둡게 하고 대상만 강조
- `inline-callout`: 대상 옆에 짧은 라벨 부착

### 8.2 대상 해석 개선

- DOM selector만 쓰지 않고, `virtual focus`를 허용한다.
- 예: 파이어볼 조준 단계는 버튼 + 월드상 허수아비를 동시에 포커스할 수 있어야 한다.
- 예: 상태창 미리보기는 패널 우측 영역 전체를 가리켜야 한다.

### 8.3 클릭 유도 모드

단계별로 클릭 허용 정책을 둔다.

- `free`: 자유 조작
- `focus-biased`: 다른 조작 가능하지만 포커스 대상이 가장 강하게 보임
- `focus-locked`: 포커스된 UI 외 나머지 클릭 억제

## 9. 단계 흐름 개선안

현재 튜토리얼은 정보 확인과 실제 실행이 자주 엉켜 있다. 아래처럼 묶음을 재편한다.

### 9.1 이동/전투 묶음

- `move_check`
- `attack_dummy`

이 구간은 전투 몰입이 중요하므로 카드 최소화.

### 9.2 상태창 묶음

- `open_status`
- `preview_status_change`
- `save_status`

이 구간은 "왼쪽에서 찍고 오른쪽에서 변화 확인"이 핵심이므로, 카드가 아니라 `좌/우 패널 분리 하이라이트`를 중심으로 안내.

### 9.3 스킬창 묶음

- `open_skill`
- `inspect_*`
- `upgrade_*`
- `use_*`

이 구간은 "설명 확인"과 "강화/사용"을 분리해서 보여줘야 한다.

- 설명 단계는 작은 도킹 카드
- 강화 단계는 버튼에 직접 CTA
- 사용 단계는 팝업 자동 닫기 + 월드 조작 강조

### 9.4 인벤토리 묶음

- `open_inventory`
- `close_inventory`

여기는 설명보다 실제 확인이 중요하므로, 카드 문장을 짧게 줄이고 닫기 버튼을 정확하게 포커스한다.

## 10. 구현 단계

### Phase T1. 표현 계층 분리

대상 파일:

- [TutorialManager.js](C:/dev/yurika_online/src/js/core/TutorialManager.js#L26)
- [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L236)
- [style.css](C:/dev/yurika_online/src/css/style.css#L3089)

작업:

- `step.type`
- `step.presentation`
- `focus mode`
- `guide mode`

도입

### Phase T2. 금지 영역 기반 가이드 배치

대상 파일:

- [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L236)
- [index.html](C:/dev/yurika_online/index.html#L1)
- [style.css](C:/dev/yurika_online/src/css/style.css#L1857)

작업:

- HUD rect 수집
- 모드별 가이드 후보 위치 계산
- overlap 최소 위치 선택

### Phase T3. 하이라이트 시스템 고도화

대상 파일:

- [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L1985)
- [style.css](C:/dev/yurika_online/src/css/style.css#L3096)

작업:

- `ring / frame / spotlight / inline-callout`
- 멀티 타겟
- focus lock 옵션

### Phase T4. 데이터 정리

대상 파일:

- [basic_training.json](C:/dev/yurika_online/assets/data/tutorials/basic_training.json#L1)

작업:

- instruction 구조 정규화
- presentation 메타 추가
- 단계 타입 명시

### Phase T5. 단계별 UX 튜닝

대상 파일:

- [basic_training.json](C:/dev/yurika_online/assets/data/tutorials/basic_training.json#L1)
- [TutorialManager.js](C:/dev/yurika_online/src/js/core/TutorialManager.js#L166)
- [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L277)

작업:

- 텍스트 길이 축소
- 모바일 문구에서 키보드 문구 제거
- 단계 전환 시 팝업/하이라이트 잔상 제거

## 11. 검증 계획

### PC

- 새 캐릭터 시작부터 튜토리얼 종료까지 전체 진행
- 상태창 / 스킬창 / 인벤토리 단계에서 중앙 시야 가림 여부 확인
- 첫 퀘스트 보상 시 강조선과 퀘스트 보상 클릭 유도 확인

### 모바일 세로

- 조이스틱과 액션 버튼을 가리지 않는지 확인
- 상단 카드와 하단 카드가 safe area와 겹치지 않는지 확인
- 스킬 설명 단계에서 카드와 버튼 하이라이트가 분리되어 보이는지 확인

### 모바일 가로

- 우측 HUD 조작 단계에서 가이드가 좌측으로 빠지는지 확인
- 카드가 미니맵, 메뉴, 액션 버튼, 퀘스트 패널과 겹치지 않는지 확인
- 긴 문구가 카드 내부에서 스크롤 또는 잘림 없이 읽히는지 확인

### 회귀 체크

- 단계 완료 조건이 기존과 동일하게 작동하는지
- 튜토리얼 중 허용 액션 제한이 깨지지 않는지
- 튜토리얼 완료 후 월드 참여 재개가 정상인지

## 12. 예상 효과

- 플레이어가 "무엇을 읽어야 하는지"보다 "지금 어디를 눌러야 하는지"를 더 빨리 이해한다.
- 튜토리얼이 게임 플레이를 방해하는 느낌이 줄어든다.
- PC / 모바일 세로 / 모바일 가로 각각의 HUD 구조에 맞는 안내가 가능해진다.
- 기능 설명 단계와 조작 단계가 시각적으로 분리되어 억지로 따라 하는 느낌이 줄어든다.

## 13. 트레이드오프

- 데이터 구조가 지금보다 풍부해져 `basic_training.json` 관리 비용이 약간 늘어난다.
- 하이라이트/가이드 배치 엔진이 복잡해져 초기 구현량이 증가한다.
- 대신 이후 튜토리얼 단계 추가나 기능 변경 시, 레이아웃별 품질을 유지한 채 확장하기 쉬워진다.

## 14. 권장 실행 순서

1. `Phase T1` 표현 타입과 guide mode 도입  
2. `Phase T2` 금지 영역 기반 가이드 배치  
3. `Phase T3` 하이라이트 타입 확장  
4. `Phase T4` `basic_training.json` 정규화  
5. `Phase T5` 문구와 단계 UX 튜닝  
6. PC / 모바일 세로 / 모바일 가로 실기기 검증

## 15. 이번 문서의 결론

현재 튜토리얼의 핵심 문제는 단계 수가 많아서가 아니라, 서로 다른 기기 레이아웃 위에 동일한 오버레이 구조를 얹고 있다는 점이다.  
따라서 다음 구현은 "문구 수정"보다 먼저 "표현 시스템 분리"를 해야 한다.

이번 최적화는 다음 한 문장으로 요약된다.

`튜토리얼을 하나의 검은 안내 박스에서, 레이아웃별 포커스-유도 시스템으로 전환한다.`
