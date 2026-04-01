# 모바일 발열/패킷 최적화 작업 보고서 (Phase 4 중심)

작성일: 2026-04-01

## 범위

- 기존 기능을 제거하거나 체감을 바꾸지 않는 선에서 몬스터 동기화 구조를 추가 최적화
- 보스전, 튜토리얼 종료 직후 전투 재개, 몬스터 스폰/사망 흐름의 즉시성 유지
- 작업 대상:
  - `src/js/entities/Monster.js`
  - `src/js/world/MonsterManager.js`
  - `src/js/core/NetworkManager.js`

## 이번 작업에서 적용한 내용

### 1. 몬스터 네트워크 우선순위 분리

- 몬스터를 아래 세 그룹으로 나눠 sync cadence를 다르게 적용
  - 보스/전투 중/피격 직후/상태 전환 직후
  - 플레이어 근처 또는 화면 근처 몬스터
  - 멀리 떨어진 idle 몬스터
- 결과적으로 idle/far 몬스터는 더 느리게 보내고, 중요한 몬스터는 기존 체감에 가깝게 유지

### 2. AOI(관심 영역) 기반 거리 판단

- 기존에는 사실상 호스트 화면 기준 on-screen 여부가 cadence 판단에 크게 들어갔음
- 이번엔 로컬/원격 플레이어 근처인지도 함께 보도록 바꿔서, 호스트 화면 밖이어도 실제 전투 중인 몬스터는 더 자주 동기화되게 조정

### 3. 상태 변화 즉시 flush

- 몬스터 스폰, 보스 스폰, 강제 sync, 중요한 상태 변화(full sync 포함)는 queued write를 기다리지 않고 즉시 flush
- 튜토리얼 종료 직후 몬스터가 다시 나타나는 흐름이나 보스 등장 체감이 늦어지지 않도록 보완

### 4. 몬스터 상태 이벤트 타임스탬프 추가

- 몬스터가 피격되거나, 차지 캐스팅/돌진/종료, 실드 발동 같은 이벤트가 발생하면 activity timestamp를 갱신
- 이를 바탕으로 “최근에 실제 전투가 있었던 몬스터”만 더 민감하게 동기화

### 5. fullSync 메타 보존

- 기존에는 `sendMonsterUpdate()` 단계에서 `fullSync`, `isBoss`, `w`, `h` 같은 부가 정보가 정리 과정에서 빠질 수 있었음
- 지금은 full sync와 보스 관련 메타를 유지해서 게스트 쪽 보간/보정 판단이 더 안정적으로 동작

## 기대 효과

- idle 몬스터가 많은 상황에서 host write 수 감소
- 모바일에서 host 역할일 때 CPU와 네트워크 사용량 완화
- 게스트 입장에서는 보스/전투 중 몬스터 동기화 체감 유지
- 스폰/사망/상태 변화 같은 중요한 순간은 이전처럼 즉시 반영

## 검증

- `node --check src/js/entities/Monster.js`
- `node --check src/js/world/MonsterManager.js`
- `node --check src/js/core/NetworkManager.js`
- `git diff --check`

모두 통과.

## 남은 아쉬움 / 다음 후보

- 플레이어 hot path를 `position/combat/social/profile` listener 단위로 더 완전히 분리하는 작업
- 실기기 telemetry 수치를 자동으로 저장/비교하는 경량 리포트 경로
- 몬스터 sync를 zone/region 단위 batch로 더 세분화하는 작업

## 주의점

- 이번 변경은 cadence와 flush 정책을 조정한 것이지, 몬스터 AI나 전투 규칙 자체를 바꾼 것은 아님
- 실기기에서 host가 되는 상황과 guest가 되는 상황을 각각 확인해 보는 것이 가장 좋음
