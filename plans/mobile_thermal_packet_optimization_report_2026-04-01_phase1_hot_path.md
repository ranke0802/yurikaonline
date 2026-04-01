# 모바일 발열/패킷 최적화 작업 보고서 (Phase 1 hot path 분리)

작성일: 2026-04-01

## 범위

- 기존 기능과 전투 체감은 유지한 채 플레이어 네트워크 수신 hot path를 더 잘게 분리
- 플레이어 루트 `users/{uid}` 전체 스냅샷에 기대던 지속 갱신 경로를 줄이고, 위치/전투/프로필 관련 필드 수신을 더 가볍게 처리
- 작업 대상:
  - `src/js/core/NetworkManager.js`
  - `src/js/entities/RemotePlayer.js`

## 이번 작업에서 적용한 내용

### 1. 플레이어 루트 `child_changed` 제거

- 기존에는 zone `users` 루트에서 `child_changed`를 듣고, 플레이어 한 명의 작은 변화에도 해당 유저 노드 전체 스냅샷을 다시 파싱
- 이번에는 루트에서는 `child_added`, `child_removed`만 유지하고, 지속 갱신은 개별 유저 하위 필드 리스너로 이동

### 2. 유저별 hot path 필드 리스너 추가

- 원격 플레이어마다 아래 경로를 개별 `value` 리스너로 감시
  - `p`
  - `presence`
  - `profile`
  - `hostility`
  - `a`
  - `ch`
  - `h`
- 최초 루트 스냅샷과 중복되는 초기 이벤트는 스킵해서 같은 데이터가 두 번 처리되지 않도록 보정

### 3. zone user cache 도입

- 원격 플레이어별로 최신 `p/profile/h/a/ch/presence/hostility`를 캐시에 보관
- 프로필만 먼저 오고 위치가 늦게 오는 경우에도, 위치가 도착하는 순간 캐시를 조합해 정상적으로 원격 플레이어를 생성
- 공격/채널링/HP 같은 transient 상태도 캐시 기반으로 재생성 시점에 복원 가능

### 4. 프로필-only 업데이트 경로 보강

- 기존 구조에서는 프로필 변경이 `NetworkManager` 내부 버퍼에는 반영돼도, 원격 `RemotePlayer` 객체에는 충분히 전달되지 않는 구간이 있었음
- 지금은 프로필-only 업데이트도 `playerUpdate` 이벤트로 흘려 보내서 이름, 레벨, 방어력, 안전 상태, 장비, 파티, 적대 관계가 더 안정적으로 반영

### 5. `RemotePlayer` 프로필 갱신 필드 보강

- `RemotePlayer.onServerUpdate()`가 `defense`, `isPaused`까지 처리하도록 확장
- 프로필-only 이벤트가 왔을 때도 RemotePlayer 쪽 상태가 실제 월드 표현과 맞게 유지

## 기대 효과

- 플레이어 이동/공격/채널링/HP 변경 시 루트 user 노드 전체 파싱 감소
- 멀티플레이 상황에서 플레이어 수신 처리량 감소
- 프로필-only 업데이트가 실제 원격 플레이어 렌더 상태에 더 안정적으로 반영
- mixed timing(프로필 먼저, 위치 나중) 상황에서 원격 플레이어 생성 누락 완화

## 검증

- `node --check src/js/core/NetworkManager.js`
- `node --check src/js/entities/RemotePlayer.js`
- `git diff --check`

모두 통과.

## 트레이드오프

- 플레이어 수만큼 하위 필드 리스너 수가 늘어남
- 대신 각 리스너 payload가 훨씬 작아지고, 기존 루트 `child_changed` 전체 스냅샷 재파싱 비용을 줄이는 쪽이 더 이득이라고 판단

## 주의점

- 이번 변경은 수신 경로 분리 중심이라, write 구조 자체를 `position/combat/social/profile`로 완전히 재편한 것은 아님
- 다음 단계에서는 write 경로까지 더 명시적으로 분리하면 payload와 listener 책임을 더 깔끔하게 정리할 수 있음
