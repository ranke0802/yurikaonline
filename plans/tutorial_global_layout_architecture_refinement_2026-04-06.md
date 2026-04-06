# 튜토리얼 전반 레이아웃 아키텍처 개선 설계서

작성일: 2026-04-06  
상태: Draft / 설계 완료, 미구현  
범위: `basic_training` 전체와 향후 추가될 튜토리얼 전반의 가이드 카드, 하이라이트, 레이아웃 규칙  
대상 레이아웃: `PC`, `모바일 세로`, `모바일 가로`

---

## 1. 왜 범위를 넓혀야 하는가

스킬 팝업은 현재 가장 눈에 띄는 문제 구간이지만, 배치 엔진과 데이터 구조는 튜토리얼 전체가 공유하고 있다.

즉 아래 문제는 스킬창만의 문제가 아니다.

- 가이드 카드가 주요 UI를 가린다.
- 하이라이트는 맞지만 설명 카드가 시야를 방해한다.
- 같은 단계 타입인데도 레이아웃마다 전달력이 들쭉날쭉하다.
- 팝업 안 단계와 월드 전투 단계가 같은 배치 규칙을 써서 억지스러운 결과가 나온다.

현재 공통 구조:

- 튜토리얼 단계 해석: [TutorialManager.js](C:/dev/yurika_online/src/js/core/TutorialManager.js#L219)
- 가이드 카드 배치 엔진: [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L592)
- 후보 생성/점수 계산: [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L639), [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L784)
- 하이라이트 렌더링: [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L2729)
- 튜토리얼 데이터: [basic_training.json](C:/dev/yurika_online/assets/data/tutorials/basic_training.json#L1)

따라서 스킬 팝업만 개별 보정하는 건 임시 처방에 가깝고, `튜토리얼 전반 레이아웃 아키텍처`를 다시 잡아야 한다.

---

## 2. 적용 대상

이번 설계는 아래 구간 전체에 적용된다.

### 2.1 월드 기반 단계

- 이동
- 허수아비 공격
- 슬라임 처치
- 파이어볼 조준
- 스킬 실제 사용

### 2.2 팝업 기반 단계

- 상태창 열기 / 미리보기 확인 / 저장
- 스킬창 열기 / 설명 보기 / 강화 / 닫기
- 인벤토리 열기 / 닫기
- 확인 모달 / 보상 모달 / 상세 모달

### 2.3 향후 확장 대상

- 퀘스트 튜토리얼
- 스토리 연출형 튜토리얼
- 장비/강화/분해 가이드
- 마을 UI 가이드

---

## 3. 현재 공통 문제

## 3.1 공통 엔진이 단계 문맥을 잘 모른다

현재 엔진은 대략 다음 정보만 안다.

- 지금 포커스해야 할 DOM rect
- 현재 활성 팝업 rect
- 화면에 보이는 HUD 금지영역

하지만 실제 튜토리얼에서 중요한 건 이것만이 아니다.

- 이 단계가 "설명"인지 "행동"인지
- 사용자가 지금 읽어야 하는 정보 패널이 어디인지
- 닫기 버튼이 여러 개인지
- 이 단계에서 카드가 팝업 안으로 들어가면 안 되는지

이 문맥이 약해서 스킬창, 상태창, 인벤토리에서 같은 문제가 반복된다.

## 3.2 레이아웃별 기본값이 너무 거칠다

현재 기본 프리셋은 단계 타입별로만 나뉘어 있다.

- inspect
- interact
- combat
- info

문제는 `inspect` 하나 안에도 성격이 다르다는 점이다.

- 상태창 오른쪽 수치 확인
- 스킬 리스트 아이콘 설명 확인
- 스킬 상세 모달 읽기
- 인벤토리 상세 확인

이걸 모두 같은 프리셋으로 처리하면 계속 겹친다.

## 3.3 튜토리얼 데이터에 "피해야 할 영역"이 부족하다

최근 `avoidTargets` 지원은 들어갔지만 아직 국소적이다.

예를 들어 실제로는 아래 같은 정보가 단계별로 필요하다.

- 상태창에서는 `#status-derived-panel`을 피해야 함
- 스킬창에서는 `.skill-list`, `.skill-point-info`, `.skill-detail-summary-grid`를 피해야 함
- 인벤토리 상세에서는 설명 본문과 액션 버튼 라인을 피해야 함
- 월드 전투 단계에서는 조이스틱/액션 버튼/미니맵을 동시에 고려해야 함

---

## 4. 전역 목표 UX

## 4.1 PC

- 가이드 카드는 사용자가 보는 UI에서 멀리 떨어지지 않아야 한다.
- 왼쪽 끝 도킹은 "월드 전투 단계" 정도에만 제한적으로 사용한다.
- 팝업 기반 단계는 팝업 근처에 붙는 배치가 기본이어야 한다.

## 4.2 모바일 세로

- 가장 중요한 원칙은 "팝업 본문을 가리지 않기"다.
- 설명 단계는 팝업 밖 하단 시트, 조작 단계는 상단 카드 또는 작은 인라인 라벨을 기본으로 쓴다.
- 카드 크기보다 문장 길이를 줄이는 방향이 우선이다.

## 4.3 모바일 가로

- 카드 자체가 짧고 얇아야 한다.
- 오른손 조작 구역과 스킬/상태/인벤토리 아이콘 묶음을 침범하지 않아야 한다.
- 팝업 단계는 `상단 얇은 배너` 또는 `좌측 얇은 카드`가 기본이어야 한다.

---

## 5. 새로운 전역 구조

## 5.1 단계 타입을 2축으로 분리

지금은 `info / inspect / interact / combat` 정도로 끝나지만, 실제론 두 축이 필요하다.

### 축 A. 내용 성격

- `read`
- `inspect`
- `confirm`
- `act`
- `combat`

### 축 B. 화면 문맥

- `world`
- `popup`
- `modal`
- `hud`

최종적으로는 예를 들어 이런 조합이 된다.

- `inspect + popup`
- `confirm + modal`
- `combat + world`
- `read + hud`

이 조합으로 guideMode 기본값을 고르는 식으로 재설계한다.

---

## 5.2 guideMode를 전역적으로 재분류

현재:

- `dock-left`
- `top-card`
- `left-card`
- `bottom-sheet`
- `floating-compact`

부족한 전역 모드:

- `popup-near-left`
- `popup-near-top`
- `popup-header-strip`
- `viewport-bottom-sheet-safe`
- `modal-bottom-caption`
- `hud-inline-callout`
- `world-edge-compact`

권장 매핑:

- `inspect + popup`
  - PC: `popup-near-left`
  - 세로: `viewport-bottom-sheet-safe`
  - 가로: `popup-header-strip`
- `confirm + modal`
  - PC: `popup-near-top`
  - 세로: `modal-bottom-caption`
  - 가로: `popup-header-strip`
- `combat + world`
  - PC: `floating-compact`
  - 세로: `top-card`
  - 가로: `world-edge-compact`

---

## 5.3 배치 엔진에 거리/맥락 점수 추가

현재는 겹침 회피가 중심이다.

앞으로는 아래 항목을 함께 점수화해야 한다.

- 금지영역 겹침
- 포커스와의 거리
- 포커스 대상이 팝업 안인지 바깥인지
- 단계 문맥과 후보 모드가 맞는지
- 현재 레이아웃에서 사용자가 주로 보는 시선 영역과 얼마나 가까운지

예:

- PC 팝업 단계에서 `dock-left`는 기본 감점
- 모바일 세로 팝업 단계에서 `popup-inline`은 기본 감점
- 모바일 가로 팝업 단계에서 높이가 큰 카드 후보는 기본 감점

---

## 5.4 focus와 avoid를 모든 단계 기본 데이터로 끌어올리기

현재는 일부 단계만 `avoidTargets`를 가진다.

앞으로는 다음을 기본 필드로 본다.

```json
{
  "focus": ["selector-a", "selector-b"],
  "avoidTargets": ["selector-c", "selector-d"],
  "guideContext": {
    "surface": "popup",
    "intent": "inspect"
  }
}
```

특히 아래 단계군은 반드시 `avoidTargets`를 써야 한다.

- 상태창 미리보기/저장
- 스킬 리스트 설명
- 스킬 상세 설명/닫기
- 인벤토리 상세/닫기
- 확인 모달 닫기

---

## 5.5 카드 텍스트 길이 제한 정책

가이드가 길어서 커지는 문제는 레이아웃 엔진만으로 해결되지 않는다.

정책:

- 한 카드에는 한 행동만 지시
- 기능 설명은 긴 카드 대신 `단계 분리`
- 모바일은 키보드 단축키 제거
- 단계 카드 문장 길이는 레이아웃별 최대치를 둔다
  - PC: 2문장
  - 모바일 세로: 1문장 + 보조문 1개
  - 모바일 가로: 1문장

---

## 6. 기능별 적용 가이드

## 6.1 상태창

- `stat_allocated`
  - focus: INT 행
  - avoid: 우측 파생 수치 패널
  - PC: `popup-near-left`
  - 세로: `viewport-bottom-sheet-safe`
  - 가로: `popup-header-strip`

- `save_status`
  - focus: `#status-close-btn-top`, `#status-close-btn-bottom`
  - avoid: `#status-derived-panel`
  - 닫기 버튼 2개 모두 강조

## 6.2 스킬창

- 스킬 리스트 설명 단계
  - focus: 스킬 아이콘 행
  - avoid: `.skill-list`, `.skill-point-info`
- 상세 설명 단계
  - focus: 상세 모달 닫기 또는 타이틀
  - avoid: `.skill-detail-summary-grid`, `#skill-detail-modal-body`

## 6.3 인벤토리

- 상세 설명 단계
  - avoid: 설명 본문, 스탯 목록, 액션 버튼 라인
- 닫기 단계
  - focus: 상단 X + 하단 닫기

## 6.4 월드 전투

- 이동/공격/스킬 사용
  - 카드 최소화
  - 조이스틱과 액션 버튼을 동시에 가리지 않도록 `world-edge-compact`

---

## 7. 구현 단계

### Phase G1. 튜토리얼 메타 확장

- `guideContext.surface`
- `guideContext.intent`
- `avoidTargets`
- `focus` 배열 정규화

영향:

- [TutorialManager.js](C:/dev/yurika_online/src/js/core/TutorialManager.js#L260)
- [basic_training.json](C:/dev/yurika_online/assets/data/tutorials/basic_training.json#L1)

### Phase G2. 전역 guideMode 추가

- `popup-near-left`
- `popup-near-top`
- `popup-header-strip`
- `viewport-bottom-sheet-safe`
- `modal-bottom-caption`
- `world-edge-compact`

영향:

- [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L639)
- [style.css](C:/dev/yurika_online/src/css/style.css#L3316)

### Phase G3. 점수 엔진 개편

- 거리 패널티
- 문맥-모드 불일치 패널티
- 레이아웃별 과대 카드 패널티

영향:

- [UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L784)

### Phase G4. 기능별 데이터 전수 보강

- 상태창
- 스킬창
- 인벤토리
- 전투 단계

이때 스킬 팝업 전용 상세 계획은 아래 문서를 그대로 하위 설계로 사용한다.

- [tutorial_skill_popup_layout_refinement_2026-04-06.md](C:/dev/yurika_online/plans/tutorial_skill_popup_layout_refinement_2026-04-06.md#L1)

### Phase G5. 검증 자동화

- PC / 세로 / 가로별 튜토리얼 스크린샷 비교
- 가이드 카드와 focus/avoid 영역 겹침율 측정
- 핵심 단계 수동 QA 체크리스트

---

## 8. 검증 기준

전역 기준:

- 가이드 카드가 주요 설명 텍스트를 가리지 않는다
- 가이드 카드가 클릭 대상 자체를 덮지 않는다
- 닫기 버튼이 둘 이상이면 모두 강조된다
- PC에서는 카드가 너무 멀리 떨어지지 않는다
- 모바일 세로에서는 팝업 본문을 덮지 않는다
- 모바일 가로에서는 카드가 너무 커지지 않는다

기능별 체크:

- 상태창
- 스킬창
- 인벤토리
- 월드 전투
- 확인 모달

---

## 9. 결론

앞으로의 개선은 "스킬창만 예외 처리"가 아니라, 튜토리얼 전반이 공통으로 따르는 `레이아웃 아키텍처`를 다시 잡는 방향이어야 한다.

즉:

- 스킬 팝업 설계서는 하위 전문 설계
- 이 문서는 튜토리얼 전체를 묶는 상위 설계

다음 구현은 `Phase G1 ~ G3`를 먼저 공통 엔진에 적용하고, `Phase G4`에서 상태창/스킬창/인벤토리/월드 단계 데이터 보강으로 내려가는 순서가 가장 안전하다.

