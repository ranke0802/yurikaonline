# 스킬창 튜토리얼 배치 개선 설계서

작성일: 2026-04-06  
상태: Draft / 설계 완료, 미구현  
범위: 스킬창 및 스킬 상세 모달 튜토리얼 가이드 배치 개선  
대상 레이아웃: `PC`, `모바일 세로`, `모바일 가로`

---

## 1. 문제 정의

현재 스킬창 튜토리얼은 공통 가이드 카드 엔진을 그대로 재사용하고 있어, 스킬 리스트와 스킬 상세 모달의 중요한 UI를 자주 가린다.

코드 기준 핵심 원인은 다음과 같다.

- 스킬 튜토리얼도 일반 팝업 튜토리얼과 같은 후보 배치 엔진을 사용한다.
  - [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L639)
  - [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L836)
- inspect 단계 기본 프리셋이 레이아웃별로 단순 고정이다.
  - PC: `dock-left`
  - 모바일 세로: `bottom-sheet`
  - 모바일 가로: `top-card`
  - [TutorialManager.js](C:/dev/yurika_online/src/js/core/TutorialManager.js#L225)
- 실제 튜토리얼 데이터는 `highlightTarget` 위주로만 작성돼 있고, 스킬 리스트/설명 카드/메트릭 패널 같은 "가리면 안 되는 영역" 정보가 부족하다.
  - [basic_training.json](C:/dev/yurika_online/assets/data/tutorials/basic_training.json#L289)
  - [basic_training.json](C:/dev/yurika_online/assets/data/tutorials/basic_training.json#L355)
  - [basic_training.json](C:/dev/yurika_online/assets/data/tutorials/basic_training.json#L523)

즉, 현재 문제는 "가이드 카드가 똑똑하지 않다"기보다, "스킬 팝업 전용 배치 규칙이 없다"에 가깝다.

---

## 2. 현재 구조 요약

### 2.1 배치 계산 엔진

- 가이드 카드 크기 계산
  - [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L592)
- 후보 좌표 생성
  - [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L639)
- 후보 점수 계산
  - [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L784)
- 실제 배치 반영
  - [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L836)

### 2.2 튜토리얼 표현 프리셋

- 단계 타입별 기본 guideMode / highlightMode
  - [TutorialManager.js](C:/dev/yurika_online/src/js/core/TutorialManager.js#L219)

### 2.3 스킬 팝업 관련 실제 UI

- 스킬 팝업
  - [index.html](C:/dev/yurika_online/index.html#L501)
- 스킬 상세 모달
  - [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L2598)
- 현재 활성 팝업 판정
  - [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L536)

---

## 3. 레이아웃별 실제 문제

### 3.1 PC

- 현재 inspect 단계는 `dock-left`라서 가이드 카드가 사용자의 실제 시선에서 너무 멀리 빠진다.
- 사용자는 `스킬 아이콘 -> 가이드 카드 -> 다시 스킬 아이콘`으로 시선을 크게 왕복해야 한다.
- 스킬 리스트 설명 단계에서는 "아이콘 옆에서 한 문장만 보여주면 되는 정보"가 화면 왼쪽 끝으로 빠져 효율이 떨어진다.

### 3.2 모바일 세로

- 세로에서는 `bottom-sheet` 또는 `popup-inline`이 스킬 설명 텍스트, 상세 메트릭 카드, 닫기 버튼 라인을 침범하는 경우가 많다.
- 스킬 상세 모달 단계에서 작은 인라인 카드가 들어와도 실제로는 본문과 닫기 버튼 주변을 가려 읽기와 조작 둘 다 방해한다.
- 세로에서는 "설명"과 "조작"이 같은 형태로 보이기 때문에, 카드가 떠 있는 자체가 부담스럽다.

### 3.3 모바일 가로

- 가로는 지금 세로보다 낫지만, `top-card`가 여전히 스킬 아이콘 줄과 겹치는 단계가 있다.
- 카드 높이가 조금만 커져도 스킬 리스트 첫 줄과 충돌한다.
- 스킬 상세 닫기 단계처럼 실제로는 `X` 또는 하단 닫기만 강조하면 되는 경우에도 카드가 불필요하게 넓다.

---

## 4. 목표 UX

### 4.1 PC 목표

- 가이드는 스킬창에서 멀리 빠지지 않고, 팝업의 좌측 또는 상단 근처에 붙어야 한다.
- 읽어야 할 정보와 눌러야 할 UI의 시선 이동 거리를 최소화한다.
- 카드가 아이콘 자체를 가리면 안 된다.

### 4.2 모바일 세로 목표

- 가이드는 가능한 한 팝업 바깥으로 빠져야 한다.
- 스킬 리스트/상세 모달의 본문, 메트릭, 버튼 라인은 절대 가리지 않는다.
- 긴 설명은 카드 크기로 해결하지 않고 단계 문장 자체를 짧게 자른다.

### 4.3 모바일 가로 목표

- 가이드는 얇고 짧아야 하며, 스킬 리스트 첫 줄을 침범하지 않아야 한다.
- 상세 설명 단계에서는 "상단 얇은 배너"나 "팝업 바깥 좌측 보조 카드"처럼 시야를 덜 가리는 배치를 쓴다.

---

## 5. 개선 전략

## Phase S1. 스킬 팝업 전용 guideMode 추가

현재 `top-card / dock-left / bottom-sheet / floating-compact / left-card`만으로는 부족하다.

추가할 전용 모드:

- `popup-near-left`
  - 팝업 좌측에 24~40px 거리로 붙는 작은 카드
  - PC inspect 단계 기본값
- `popup-near-top`
  - 팝업 상단에 밀착되는 작은 카드
  - PC 닫기 단계, 모바일 가로 일부 단계
- `popup-header-strip`
  - 팝업 위쪽에 얇게 붙는 1~2줄 배너
  - 모바일 가로 inspect 단계 기본값
- `viewport-bottom-sheet-safe`
  - 조이스틱/액션 버튼/팝업 본문을 모두 피하는 하단 안내 카드
  - 모바일 세로 inspect 단계 기본값

영향 파일:

- [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L639)
- [TutorialManager.js](C:/dev/yurika_online/src/js/core/TutorialManager.js#L219)

---

## Phase S2. 후보 점수 계산에 "거리" 개념 추가

현재 점수 함수는 겹침 패널티 중심이고, "포커스와 너무 멀다"는 문제를 거의 반영하지 않는다.

개선:

- `focusRect` 중심과 candidate 중심 사이 거리 패널티 추가
- inspect 단계에서는 겹침이 없으면 "가까운 카드"가 우선
- info 단계에서는 약간 멀어도 허용
- interact 단계는 포커스와 가깝되, 클릭 대상은 가리지 않도록 거리와 겹침을 동시에 본다

제안 규칙:

- `distanceScore = hypot(candidateCenter, focusCenter) * typeWeight`
- `inspect`: 거리 패널티 강함
- `info`: 거리 패널티 약함
- `combat`: 거리 패널티 중간

영향 파일:

- [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L784)

---

## Phase S3. 스킬 단계별 avoidTargets 전수 추가

스킬 튜토리얼은 `highlightTarget`만으로는 부족하다. "가리면 안 되는 영역"을 데이터에 직접 넣어야 한다.

공통 패턴:

- 스킬 리스트 설명 단계
  - `avoidTargets`
    - `#skill-popup .skill-list`
    - `#skill-popup .skill-point-info`
- 스킬 상세 확인 단계
  - `avoidTargets`
    - `#skill-detail-modal-body`
    - `#skill-detail-modal .skill-detail-summary-grid`
- 스킬 닫기 단계
  - `focus`
    - `#skill-detail-modal-close`
    - `#skill-detail-modal-close-bottom`
  - `avoidTargets`
    - `#skill-detail-modal-body`

적용 대상:

- `inspect_laser_detail`
- `close_laser_detail`
- `inspect_missile_detail`
- `close_missile_detail`
- `inspect_fireball_detail`
- `close_fireball_detail`
- `inspect_shield_detail`
- `close_shield_detail`

영향 파일:

- [basic_training.json](C:/dev/yurika_online/assets/data/tutorials/basic_training.json#L289)

---

## Phase S4. 레이아웃별 기본 프리셋 재정의

현재 inspect/interact 기본값은 너무 일반적이다.

재정의안:

- PC inspect
  - `popup-near-left`
  - `align: left`
  - `compact: true`
- 모바일 세로 inspect
  - `viewport-bottom-sheet-safe`
  - `compact: true`
- 모바일 가로 inspect
  - `popup-header-strip`
  - `compact: true`

- PC interact
  - `popup-near-top`
- 모바일 세로 interact
  - `top-card`
  - 단, `avoidTargets`가 있으면 팝업 바깥으로 강제
- 모바일 가로 interact
  - `popup-header-strip`

영향 파일:

- [TutorialManager.js](C:/dev/yurika_online/src/js/core/TutorialManager.js#L219)

---

## Phase S5. 카드 길이 자체를 줄이는 데이터 정리

현재 일부 스킬 단계 문장은 "설명 + 성장 포인트 + 조작"을 한 번에 넣고 있다.

스킬 팝업 단계에서는 다음 원칙을 적용한다.

- 가이드 카드 한 장에는 1개 행동만 지시
- 왜 필요한지는 `questText`나 다음 단계 설명으로 분산
- 긴 설명은 상세 모달 본문이 이미 담당하므로 카드에서는 제거

예:

- 기존
  - "체인 라이트닝 아이콘을 탭해 상세 설명 창을 열어 보세요. 연쇄 타격형 기본 공격이고..."
- 개선
  - "체인 라이트닝 아이콘을 눌러 상세 설명을 열어 주세요."

이 원칙은 특히 모바일 세로/가로에서 중요하다.

영향 파일:

- [basic_training.json](C:/dev/yurika_online/assets/data/tutorials/basic_training.json#L289)

---

## 6. 구현 우선순위

1. `Phase S3`
   - 스킬 단계 전수 `avoidTargets` 추가
2. `Phase S2`
   - 배치 점수에 거리 개념 추가
3. `Phase S1`
   - `popup-near-*`, `popup-header-strip`, `viewport-bottom-sheet-safe` 추가
4. `Phase S4`
   - inspect/interact 기본 프리셋 재정의
5. `Phase S5`
   - 긴 안내 문장 축약

이 순서를 추천하는 이유:

- 데이터 보강만으로도 즉시 개선되는 구간이 있다.
- 그 다음 엔진을 바꾸면 전체 스킬 단계에 파급 적용된다.
- 마지막에 문장 길이를 줄이면 카드 자체 높이도 줄어든다.

---

## 7. 검증 기준

각 레이아웃별로 아래 시나리오를 검수한다.

### PC

- 스킬창 열기
- 체인 라이트닝 상세 열기
- 매직 미사일 상세 열기
- 파이어볼 상세 열기
- 앱솔루트 베리어 상세 열기

기준:

- 가이드 카드가 스킬 아이콘/상세 메트릭을 가리지 않는다
- 가이드 카드가 팝업에서 너무 멀지 않다

### 모바일 세로

- 스킬 리스트 설명 단계
- 상세 모달 설명 단계
- 상세 닫기 단계

기준:

- 카드가 스킬 리스트 본문을 가리지 않는다
- 카드가 상세 메트릭/닫기 버튼을 가리지 않는다
- 스크롤 없이 안내 텍스트가 읽힌다

### 모바일 가로

- 스킬 리스트 설명 단계
- 상세 모달 설명 단계
- 강화 버튼 설명 단계

기준:

- 카드가 스킬 첫 줄을 가리지 않는다
- 카드가 우측 HUD와 겹치지 않는다
- 카드가 불필요하게 크지 않다

---

## 8. 결론

현재 스킬창 튜토리얼 문제는 단순 CSS 위치 보정으로 끝나지 않는다.

필요한 건:

- 스킬 팝업 전용 guideMode
- 포커스와의 거리 기반 점수
- 단계별 avoidTargets
- 레이아웃별 inspect/interact 기본값 재정의

즉, "스킬창 튜토리얼만 별도 규칙으로 빼는 것"이 이번 개선의 핵심이다.

