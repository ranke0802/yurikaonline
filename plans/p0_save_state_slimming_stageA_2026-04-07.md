# P0 saveState 슬림화 Stage A

## 범위
- 현재 브랜치 안정화 작업의 일부
- 저장 스키마를 바꾸지 않고 `saveState()` 호출 횟수와 저장 빈도를 줄이는 1차 정리

## 배경
- RTDB 사용량이 20분 기준 30MB대를 넘어서며 과도하게 증가
- 원인 후보 중 하나로 `Player.saveState()`가 큰 프로필(`inventory`, `equipment`, `questData`)을 자주 저장하는 구조가 확인됨
- 특히 보상 처리에서 `gainExp() -> levelUp() -> receiveReward()` 흐름이 중첩되며 저장이 여러 번 발생

## 이번 단계 결정
- `saveState()` 기본 debounce를 상향
  - shared field: 2500ms
  - solo: 3200ms
- `receiveReward()` 내부의 중복 저장 제거
  - 경험치/레벨업/퀘스트 보상 처리 중 내부 저장을 억제하고 마지막에 1회만 저장
- `gainExp()`, `levelUp()`, `updateDerivedStats()`, `addGold()`에 `save: false` 옵션을 받아 상위 흐름에서 저장을 묶을 수 있게 변경

## 의도한 효과
- 사냥/보상 루프당 프로필 transaction 횟수 감소
- 큰 프로필 payload의 불필요한 중복 업로드/다운로드 완화
- 기존 저장 구조와 호환되므로 회귀 위험은 낮게 유지

## 트레이드오프
- 저장 반영이 이전보다 약간 늦어질 수 있음
- 즉시 저장이 필요한 경로는 기존처럼 `saveState(true)`를 유지해야 함

## 다음 후보
- `saveState`를 경량/무거운 저장으로 완전히 분리
- `inventory/equipment/questData` dirty-check 도입
- profile transaction 대신 child-path update 가능한 영역 분리 검토
