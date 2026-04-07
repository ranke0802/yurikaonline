# 몬스터 조인 동기화 / RTDB 안정화 메모

작성일: 2026-04-07  
상태: Draft / 진단 메모  
범위: 호스트가 이미 존재하는 세션에 게스트가 늦게 참가할 때 몬스터 HP/이동 불일치 완화, RTDB 사용량 최적화

---

## 1. 현재 진단

현재 코드 기준:

- 플레이어 실시간 경로는 `presence-lite / shared-field` 전환이 일부 적용되어 있다.
  - `src/js/core/NetworkManager.js`
  - `_handlePresenceSnapshot()`
  - `_refreshSharedFieldState()`
  - `_publishPresenceLite()`
- 하지만 몬스터는 여전히 `zones/{room}/monsters/{id}` 전역 fan-out 구조를 사용한다.
  - `src/js/core/NetworkManager.js`
  - `connect()` 내부 `monsters` listener
  - `flushMonsterUpdates()`
  - `sendMonsterUpdate()`
- 호스트의 강제 full sync는 `sharedFieldChanged.active === true` 전환 시점에만 한 번 수행된다.
  - `src/js/world/MonsterManager.js`
  - constructor 내부 `sharedFieldChanged` listener

이 구조의 문제:

1. 이미 멀티가 진행 중인 세션에 새 게스트가 들어올 때 "그 게스트 전용 authoritative join keyframe"이 없다.
2. 몬스터 payload에 `rev`, `ts`, `state`가 없어 stale packet drop과 안정적인 interpolation anchor를 만들기 어렵다.
3. guest는 `monsters` 전체를 계속 구독하므로 download fan-out이 줄지 않는다.

---

## 2. 현재 증상과 가장 유력한 원인

증상:

- 호스트가 있는 상태에서 뒤늦게 들어온 게스트가 몬스터 HP, 위치, 상태 변화를 늦거나 부정확하게 본다.

유력 원인:

1. join 시점 immediate full sync 부족
   - 지금은 peer 수가 `0 -> 1`로 바뀔 때만 `forceSyncAll()`이 강하게 돈다.
   - host가 이미 다른 peer와 shared 상태인 경우 새 peer join만으로는 강제 full sync가 다시 발생하지 않는다.
2. payload 정보 부족
   - 현재 payload는 `x/y/hp/maxHp/type/chargeOnly/fullSync/isBoss/w/h` 중심이다.
   - `rev`, `ts`, `state`, `cellId`가 없어 guest가 "이게 최신 authoritative snapshot인지" 판단하기 어렵다.
3. 전역 listener 구조
   - `monsters` root 전체 구독은 정확도보다도 RTDB download 폭증의 구조적 원인이다.

---

## 3. 우선순위 제안

### P1. Join Keyframe 먼저

먼저 해야 할 것:

- 새 peer가 같은 field/cell에 진입했을 때 host가 해당 peer 주변 몬스터들에 대해 immediate full sync enqueue
- 최소 3x3 cell 또는 일정 반경 기준으로 authoritative keyframe 발행

효과:

- "이미 존재하던 host 세션에 나중에 들어온 게스트" 문제를 가장 직접적으로 줄임
- 대규모 구조 변경 전에도 체감 개선이 큼

### P2. Monster payload에 revision/time/state 추가

필수 필드:

- `rev`
- `ts`
- `state`
- `cellId`

효과:

- guest가 stale update를 무시할 수 있음
- full sync를 기준점으로 짧은 보간을 안정적으로 시작 가능

### P3. AOI delivery path로 이동

구조:

- 기존: `zones/{room}/monsters/{monsterId}`
- 변경: `zones/{room}/monster_cells/{cellId}/{monsterId}`

효과:

- 몬스터 download fan-out 대폭 감소
- 필요한 몬스터만 구독 가능

### P4. Host takeover canonical snapshot 추가

구조:

- `zones/{room}/monster_host_snapshot/{monsterId}`

효과:

- host 변경 시 즉시 authoritative 복구 가능
- 일반 클라이언트 download에는 영향이 작음

---

## 4. 구현 순서 제안

1. `MonsterManager`에 join/field/cell 변화 감지용 immediate full sync 훅 추가
2. `sendMonsterUpdate()` payload에 `rev/ts/state/cellId` 추가
3. guest 쪽 `monsterUpdated` 반영 시 stale packet drop + interpolation anchor 도입
4. `NetworkManager`의 global `monsters` listener를 `monster_cells` AOI listener로 교체
5. `monster_host_snapshot` write/read 추가

---

## 5. 관련 설계서

- `plans/field_presence_safe_sync_optimization_2026-04-06.md`
- `plans/monster_aoi_sync_architecture_plan_2026-04-02.md`

---

## 6. 결론

지금 문제는 단순히 sync interval을 줄이거나 write 빈도를 높여서 해결할 성질이 아니다.  
핵심은:

- 조인 시 authoritative keyframe 보장
- payload freshness 판단 가능
- global monster fan-out 제거

이 세 가지를 같이 맞춰야 정확도와 RTDB 비용을 동시에 잡을 수 있다.
